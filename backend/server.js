require('dotenv').config();
const express    = require('express');
const path       = require('path');
const mssql      = require('mssql');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const multer     = require('multer');
const XLSX       = require('xlsx');
const morgan     = require('morgan');

const app  = express();
const PORT = process.env.PORT || 3001;

// JWT 密鑰未設定時直接中止啟動。
// 此處原本有一個寫死的預設密鑰做為 fallback，一旦 .env 未載入便會靜默
// 採用該公開已知字串，任何人皆可自簽 admin token 接管系統。
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[FATAL] 未設定 JWT_SECRET，或長度不足 32 字元。請在 .env 中設定後再啟動。');
  process.exit(1);
}

// Azure App Service 位於反向代理之後，未設定的話 req.ip 會取到代理位址，
// 導致速率限制把所有使用者當成同一個 IP 一起擋掉。
app.set('trust proxy', 1);

// 安全標頭。本服務為純 API、不輸出 HTML，故 CSP 預設值即可；
// 但需放寬 CORP，否則跨網域的前端會被擋下。
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS 白名單。可用 CORS_ORIGINS 以逗號分隔覆寫；
// 未設定時採用下列預設（GitHub Pages 正式站 + 本機開發）。
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ||
  'https://chengd0125.github.io,http://localhost:5173,http://localhost:3000'
).split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // 無 Origin 標頭者放行：curl、健康檢查、手機 App、同源請求。
    // 瀏覽器的跨網域請求一定會帶 Origin，故不影響白名單效力。
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    console.warn('[CORS] 已拒絕來源:', origin);
    return cb(new Error('不允許的來源'));
  },
  credentials: true,
}));

app.use(express.json());
app.use(morgan('dev'));

// 登入速率限制：同一 IP 每 15 分鐘最多 10 次嘗試。
// 僅套用於登入端點，避免影響正常操作時的大量 API 呼叫。
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '登入嘗試過於頻繁，請於 15 分鐘後再試' },
  skipSuccessfulRequests: true,   // 成功登入不計次，僅累計失敗
});

const upload = multer({ storage: multer.memoryStorage() });

const dbConfig = {
  server:   process.env.DB_SERVER,
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_DATABASE,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    // Azure SQL / 任何跨公網連線必須加密。僅在本機區網 SQL 測試時
    // 才於 .env 設 DB_ENCRYPT=false，正式環境請勿關閉。
    encrypt:                process.env.DB_ENCRYPT !== 'false',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    enableArithAbort:       true,
  },
  // Azure SQL 無伺服器層級閒置後會自動暫停，冷啟動可能超過 30 秒，
  // 預設 15 秒逾時會直接失敗，故延長。
  connectionTimeout: 60000,
  requestTimeout:    60000,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

// ============================================
// 多廠商：每間廠商一個資料庫，依前端帶來的 X-Tenant 標頭選擇
// .env 範例：TENANTS=fupro=WholesaleDB,014test=WholesaleDB_014test
//            DEFAULT_TENANT=fupro   （沒帶標頭的請求使用此廠商，相容舊版前端）
// 未設定 TENANTS 時只有一個廠商，使用 DB_DATABASE（與改版前相同）。
// ============================================
const TENANT_RE = /^[A-Za-z0-9_-]{1,32}$/;
const TENANTS = new Map();
for (const pair of (process.env.TENANTS || '').split(',').map(x => x.trim()).filter(Boolean)) {
  const [id, dbName] = pair.split('=').map(x => (x || '').trim());
  if (!TENANT_RE.test(id) || !dbName) {
    console.error(`[FATAL] TENANTS 格式錯誤：「${pair}」，應為 代號=資料庫名稱`);
    process.exit(1);
  }
  TENANTS.set(id, dbName);
}
const DEFAULT_TENANT = process.env.DEFAULT_TENANT || (TENANTS.size ? [...TENANTS.keys()][0] : 'default');
if (!TENANTS.size) TENANTS.set(DEFAULT_TENANT, process.env.DB_DATABASE);
if (!TENANTS.has(DEFAULT_TENANT)) {
  console.error(`[FATAL] DEFAULT_TENANT「${DEFAULT_TENANT}」不在 TENANTS 清單中`);
  process.exit(1);
}

const pools = new Map();
// 一律依請求的廠商取得連線；不帶 req 只用於啟動時預先連線
function getPool(req) {
  const tenant = req ? req.tenant : DEFAULT_TENANT;
  if (!tenant || !TENANTS.has(tenant)) return Promise.reject(new Error('未指定廠商'));
  if (!pools.has(tenant)) {
    const cp = new mssql.ConnectionPool({ ...dbConfig, database: TENANTS.get(tenant) });
    cp.on('error', err => console.error(`[${tenant}] 資料庫連線錯誤：`, err.message));
    const p = cp.connect();
    p.catch(() => pools.delete(tenant)); // 連線失敗時下次請求重試
    pools.set(tenant, p);
  }
  return pools.get(tenant);
}

// 解析廠商代號；必須在所有 /api 路由之前
app.use('/api', (req, res, next) => {
  const tenant = req.get('X-Tenant') || DEFAULT_TENANT;
  if (!TENANTS.has(tenant)) return res.status(400).json({ message: '未知的廠商代號' });
  req.tenant = tenant;
  next();
});

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: '請先登入' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: '登入已過期，請重新登入' });
  }
  // 舊版憑證沒有廠商代號，視為預設廠商
  if ((req.user.tenant || DEFAULT_TENANT) !== req.tenant)
    return res.status(401).json({ message: '登入的廠商不符，請重新登入' });
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: '權限不足' });
  next();
}

function requirePermission(permission) {
  return async (req, res, next) => {
    if (req.user.role === 'admin') return next();
    try {
      const db = await getPool(req);
      const result = await db.request()
        .input('role',       mssql.NVarChar, req.user.role)
        .input('permission', mssql.NVarChar, permission)
        .query(`SELECT IsAllowed FROM RolePermissions WHERE Role=@role AND Permission=@permission`);
      if (result.recordset[0]?.IsAllowed) return next();
      return res.status(403).json({ message: '您沒有此操作的權限' });
    } catch {
      return res.status(500).json({ message: '伺服器錯誤' });
    }
  };
}

async function generateOrderNo(req) {
  const db     = await getPool(req);
  const today  = new Date();
  const prefix = 'ORD-' + today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0') + '-';
  const result = await db.request()
    .input('prefix', mssql.NVarChar, prefix + '%')
    .query(`SELECT COUNT(*) AS cnt FROM Orders WHERE OrderNo LIKE @prefix`);
  const seq = String(result.recordset[0].cnt + 1).padStart(4, '0');
  return prefix + seq;
}

// ============================================
// 診斷
// ============================================
// 免認證的健康檢查端點。刻意只回傳「是否已設定」與錯誤代碼，
// 不回傳主機名稱、帳密或完整錯誤訊息，避免對外洩漏環境資訊。
app.get('/api/health', async (req, res) => {
  const out = {
    server: 'ok',
    tenant: req.tenant,
    time:   new Date().toISOString(),
    env: {
      DB_SERVER:   process.env.DB_SERVER   ? 'set' : 'MISSING',
      DB_DATABASE: process.env.DB_DATABASE ? 'set' : 'MISSING',
      DB_USER:     process.env.DB_USER     ? 'set' : 'MISSING',
      DB_PASSWORD: process.env.DB_PASSWORD ? 'set' : 'MISSING',
      DB_ENCRYPT:  process.env.DB_ENCRYPT  || '(未設定, 預設 true)',
      JWT_SECRET:  process.env.JWT_SECRET  ? 'set' : 'MISSING',
    },
  };
  try {
    const db = await getPool(req);
    await db.request().query('SELECT 1 AS ok');
    out.database = 'ok';
  } catch (err) {
    out.database = 'error';
    out.code     = err.code || err.name || 'UNKNOWN';
    // tedious 會把底層錯誤包在 originalError，其 code 才能區分
    // ENOTFOUND(主機名稱錯) / ECONNREFUSED(埠被擋) / 憑證問題。
    out.detail   = err.originalError?.code || null;
    // 只回報 DB_SERVER 能否解析，不輸出主機名稱或 IP。
    try {
      await require('dns').promises.lookup(process.env.DB_SERVER);
      out.dnsResolves = true;
    } catch (e) {
      out.dnsResolves = false;
      out.dnsCode     = e.code || 'UNKNOWN';
    }
    return res.status(503).json(out);
  }
  try {
    const r = await getPool(req).then(db => db.request().query('SELECT COUNT(*) AS c FROM Employees'));
    out.employeesTable = 'ok';
    out.employeeCount  = r.recordset[0].c;
  } catch (err) {
    out.employeesTable = 'missing';
    out.tableErrorCode = err.code || err.name || 'UNKNOWN';
  }
  res.json(out);
});

// ============================================
// 認證
// ============================================
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: '請輸入帳號和密碼' });
    const db     = await getPool(req);
    const result = await db.request()
      .input('username', mssql.NVarChar, username)
      .query(`SELECT * FROM Employees WHERE Username = @username AND IsActive = 1`);
    const emp = result.recordset[0];
    if (!emp) return res.status(401).json({ message: '帳號或密碼錯誤' });
    const ok = await bcrypt.compare(password, emp.PasswordHash);
    if (!ok) return res.status(401).json({ message: '帳號或密碼錯誤' });
    const token = jwt.sign(
      { id: emp.EmployeeID, username: emp.Username, name: emp.FullName, role: emp.Role, tenant: req.tenant },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    db.request()
      .input('eid', mssql.Int, emp.EmployeeID)
      .query(`UPDATE Employees SET LastLoginAt = GETDATE() WHERE EmployeeID = @eid`)
      .catch(() => {});
    res.json({ token, user: { id: emp.EmployeeID, username: emp.Username, name: emp.FullName, role: emp.Role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '伺服器錯誤' });
  }
});


// ============================================
// 商品
// ============================================
app.get('/api/products', authMiddleware, async (req, res) => {
  try {
    const db = await getPool(req);
    const { search, category } = req.query;
    let sql = `SELECT p.*, ce.FullName AS CreatedByName, ue.FullName AS UpdatedByName
               FROM Products p
               LEFT JOIN Employees ce ON p.CreatedBy = ce.EmployeeID
               LEFT JOIN Employees ue ON p.UpdatedBy = ue.EmployeeID
               WHERE p.IsActive = 1`;
    const request = db.request();
    if (search) { sql += ` AND (p.ProductName LIKE @search OR p.Barcode LIKE @search)`; request.input('search', mssql.NVarChar, `%${search}%`); }
    if (category) { sql += ` AND p.Category = @category`; request.input('category', mssql.NVarChar, category); }
    sql += ` ORDER BY p.Category, p.ProductName`;
    const result = await request.query(sql);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.get('/api/products/barcode/:barcode', authMiddleware, async (req, res) => {
  try {
    const db     = await getPool(req);
    const result = await db.request()
      .input('barcode', mssql.NVarChar, req.params.barcode)
      .query(`SELECT * FROM Products WHERE Barcode = @barcode AND IsActive = 1`);
    if (!result.recordset[0]) return res.status(404).json({ message: '查無此條碼商品' });
    res.json(result.recordset[0]);
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.get('/api/products/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) return res.json([]);
    const db = await getPool(req);
    const result = await db.request()
      .input('q', mssql.NVarChar, `%${q.trim()}%`)
      .query(`
        SELECT ProductID, Barcode, ProductName, Unit, SalePrice, Stock
        FROM Products
        WHERE IsActive = 1 AND (Barcode LIKE @q OR ProductName LIKE @q)
        ORDER BY CASE WHEN Barcode = @q THEN 0 WHEN Barcode LIKE @q THEN 1 ELSE 2 END, ProductName
      `);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: '搜尋失敗' }); }
});

app.get('/api/products/categories', authMiddleware, async (req, res) => {
  try {
    const db     = await getPool(req);
    const result = await db.request()
      .query(`SELECT DISTINCT Category FROM Products WHERE IsActive = 1 AND Category IS NOT NULL ORDER BY Category`);
    res.json(result.recordset.map(r => r.Category));
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

// 商品出貨紀錄：可依客戶篩選；業務只看得到自己開的訂單（與訂單列表相同規則）
app.get('/api/products/:id/history', authMiddleware, async (req, res) => {
  try {
    const db = await getPool(req);
    const request = db.request()
      .input('pid',   mssql.Int, req.params.id)
      .input('limit', mssql.Int, Math.min(parseInt(req.query.limit, 10) || 200, 1000));
    let sql = `SELECT TOP (@limit) o.OrderID, o.OrderNo, o.OrderDate, o.Status,
                 c.CustomerID, c.CompanyName, c.CustomerCode, e.FullName AS EmployeeName,
                 oi.Quantity, oi.Unit, oi.UnitPrice, oi.Amount
               FROM OrderItems oi
               JOIN Orders o    ON oi.OrderID   = o.OrderID
               JOIN Customers c ON o.CustomerID = c.CustomerID
               JOIN Employees e ON o.EmployeeID = e.EmployeeID
               WHERE oi.ProductID = @pid AND o.Status <> 'cancelled'`;
    if (req.user.role === 'sales') { sql += ` AND o.EmployeeID = @empId`; request.input('empId', mssql.Int, req.user.id); }
    if (req.query.customerId) { sql += ` AND o.CustomerID = @cid`; request.input('cid', mssql.Int, req.query.customerId); }
    sql += ` ORDER BY o.OrderDate DESC, o.OrderID DESC`;
    const result = await request.query(sql);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: '查詢出貨紀錄失敗' }); }
});

app.post('/api/products', authMiddleware, requirePermission('product_add'), async (req, res) => {
  try {
    const { Barcode, ProductName, Unit, CostPrice, SalePrice, Stock, Category } = req.body;
    if (!ProductName) return res.status(400).json({ message: '商品名稱為必填' });
    const db = await getPool(req);
    const result = await db.request()
      .input('Barcode',     mssql.NVarChar, Barcode     || null)
      .input('ProductName', mssql.NVarChar, ProductName)
      .input('Unit',        mssql.NVarChar, Unit        || '個')
      .input('CostPrice',   mssql.Decimal,  CostPrice   || 0)
      .input('SalePrice',   mssql.Decimal,  SalePrice   || 0)
      .input('Stock',       mssql.Int,      Stock       || 0)
      .input('Category',    mssql.NVarChar, Category    || null)
      .input('CreatedBy', mssql.Int, req.user.id)
      .query(`INSERT INTO Products (Barcode, ProductName, Unit, CostPrice, SalePrice, Stock, Category, CreatedBy, UpdatedBy) OUTPUT INSERTED.* VALUES (@Barcode, @ProductName, @Unit, @CostPrice, @SalePrice, @Stock, @Category, @CreatedBy, @CreatedBy)`);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    if (err.number === 2601) return res.status(409).json({ message: '此條碼已存在' });
    res.status(500).json({ message: '伺服器錯誤' });
  }
});

app.put('/api/products/:id', authMiddleware, requirePermission('product_edit'), async (req, res) => {
  try {
    const { Barcode, ProductName, Unit, CostPrice, SalePrice, Stock, Category } = req.body;
    const db = await getPool(req);
    const result = await db.request()
      .input('ProductID',   mssql.Int,      req.params.id)
      .input('Barcode',     mssql.NVarChar, Barcode     || null)
      .input('ProductName', mssql.NVarChar, ProductName)
      .input('Unit',        mssql.NVarChar, Unit        || '個')
      .input('CostPrice',   mssql.Decimal,  CostPrice   || 0)
      .input('SalePrice',   mssql.Decimal,  SalePrice   || 0)
      .input('Stock',       mssql.Int,      Stock       || 0)
      .input('Category',    mssql.NVarChar, Category    || null)
      .input('UpdatedBy', mssql.Int, req.user.id)
      .query(`UPDATE Products SET Barcode=@Barcode, ProductName=@ProductName, Unit=@Unit, CostPrice=@CostPrice, SalePrice=@SalePrice, Stock=@Stock, Category=@Category, UpdatedAt=GETDATE(), UpdatedBy=@UpdatedBy OUTPUT INSERTED.* WHERE ProductID=@ProductID`);
    if (!result.recordset[0]) return res.status(404).json({ message: '商品不存在' });
    res.json(result.recordset[0]);
  } catch (err) {
    if (err.number === 2601) return res.status(409).json({ message: '此條碼已被其他商品使用' });
    res.status(500).json({ message: '伺服器錯誤' });
  }
});

app.delete('/api/products', authMiddleware, requirePermission('product_delete'), async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ message: '請提供要刪除的商品 ID' });
  try {
    const db = await getPool(req);
    const idList = ids.map(id => parseInt(id)).filter(id => !isNaN(id));
    const checkReq = db.request();
    const inParams = idList.map((id, i) => { checkReq.input(`cid${i}`, mssql.Int, id); return `@cid${i}`; }).join(',');
    const check = await checkReq.query(`SELECT DISTINCT ProductID FROM OrderItems WHERE ProductID IN (${inParams})`);
    const usedIds = new Set(check.recordset.map(r => r.ProductID));
    const toDelete = idList.filter(id => !usedIds.has(id));
    const skipped  = idList.filter(id =>  usedIds.has(id));
    if (toDelete.length > 0) {
      const delReq = db.request();
      const delParams = toDelete.map((id, i) => { delReq.input(`did${i}`, mssql.Int, id); return `@did${i}`; }).join(',');
      await delReq.query(`DELETE FROM Products WHERE ProductID IN (${delParams})`);
    }
    res.json({ deleted: toDelete.length, skipped: skipped.length });
  } catch (err) { res.status(500).json({ message: '批量刪除失敗' }); }
});

app.delete('/api/products/:id', authMiddleware, requirePermission('product_delete'), async (req, res) => {
  try {
    const db = await getPool(req);
    const check = await db.request()
      .input('id', mssql.Int, req.params.id)
      .query(`SELECT COUNT(*) AS cnt FROM OrderItems WHERE ProductID = @id`);
    if (check.recordset[0].cnt > 0)
      return res.status(409).json({ message: `此商品已有 ${check.recordset[0].cnt} 筆訂單使用，無法刪除` });
    await db.request().input('id', mssql.Int, req.params.id).query(`DELETE FROM Products WHERE ProductID = @id`);
    res.json({ message: '商品已從資料庫刪除' });
  } catch (err) { res.status(500).json({ message: '刪除失敗' }); }
});

app.get('/api/products/export', authMiddleware, async (req, res) => {
  try {
    const db     = await getPool(req);
    const result = await db.request()
      .query(`SELECT Barcode, ProductName, Unit, CostPrice, SalePrice, Stock, Category FROM Products WHERE IsActive = 1 ORDER BY Category, ProductName`);
    const ws = XLSX.utils.json_to_sheet(result.recordset.map(p => ({
      '條碼': p.Barcode||'', '商品名稱': p.ProductName, '單位': p.Unit,
      '進價': p.CostPrice, '售價': p.SalePrice, '庫存': p.Stock, '分類': p.Category||'',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '商品資料');
    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="products.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) { res.status(500).json({ message: '匯出失敗' }); }
});

// ---- 匯入比對：先預覽差異，確認後只寫入新增與有變動的商品，相同的直接跳過 ----
const IMPORT_FIELDS = [
  ['ProductName', '商品名稱'], ['Unit', '單位'], ['CostPrice', '進價'],
  ['SalePrice', '售價'], ['Stock', '庫存'], ['Category', '分類'],
];

function parseImportFile(buffer) {
  const wb = XLSX.read(buffer, { type:'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws).map((row, i) => ({
    line:        i + 2, // Excel 第 1 行是標題
    Barcode:     String(row['條碼']    ?? '').trim() || null,
    ProductName: String(row['商品名稱'] ?? '').trim(),
    Unit:        String(row['單位']    ?? '').trim() || '個',
    CostPrice:   Number(row['進價']) || 0,
    SalePrice:   Number(row['售價']) || 0,
    Stock:       parseInt(row['庫存'], 10) || 0,
    Category:    String(row['分類']    ?? '').trim() || null,
  }));
}

function sameValue(field, a, b) {
  if (['CostPrice', 'SalePrice', 'Stock'].includes(field)) return Number(a || 0) === Number(b || 0);
  return (a ?? '') === (b ?? '');
}

async function diffImport(req, rows) {
  const db = await getPool(req);
  const existing = (await db.request().query(
    `SELECT ProductID, Barcode, ProductName, Unit, CostPrice, SalePrice, Stock, Category, IsActive FROM Products`
  )).recordset;
  const byBarcode = new Map(existing.filter(p => p.Barcode).map(p => [p.Barcode, p]));
  const byName = new Map();
  for (const p of existing) byName.set(p.ProductName, [...(byName.get(p.ProductName) || []), p]);

  const created = [], changed = [], errors = [];
  let unchanged = 0;
  const seen = new Set();
  for (const r of rows) {
    if (!r.ProductName) { errors.push(`第 ${r.line} 行：商品名稱為空`); continue; }
    const key = r.Barcode ? `b:${r.Barcode}` : `n:${r.ProductName}`;
    if (seen.has(key)) { errors.push(`第 ${r.line} 行：「${r.Barcode || r.ProductName}」在檔案中重複，已略過`); continue; }
    seen.add(key);

    // 有條碼用條碼比對；沒條碼用商品名稱比對，避免重複匯入時一直新增
    let match = null;
    if (r.Barcode) match = byBarcode.get(r.Barcode) || null;
    else {
      const sameName = byName.get(r.ProductName) || [];
      if (sameName.length > 1) { errors.push(`第 ${r.line} 行：「${r.ProductName}」有多筆同名商品，請填寫條碼`); continue; }
      match = sameName[0] || null;
    }

    if (!match) { created.push(r); continue; }
    const diffs = IMPORT_FIELDS
      .filter(([f]) => !sameValue(f, match[f], r[f]))
      .map(([f, label]) => ({ field: f, label, from: match[f], to: r[f] }));
    if (!match.IsActive) diffs.push({ field: 'IsActive', label: '狀態', from: '停用', to: '啟用' });
    if (diffs.length) changed.push({ ...r, ProductID: match.ProductID, diffs });
    else unchanged++;
  }
  return { created, changed, unchanged, errors };
}

app.post('/api/products/import/preview', authMiddleware, requirePermission('product_add'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: '請上傳 Excel 檔案' });
    res.json(await diffImport(req, parseImportFile(req.file.buffer)));
  } catch (err) { res.status(500).json({ message: '讀取失敗，請確認檔案格式' }); }
});

app.post('/api/products/import/apply', authMiddleware, requirePermission('product_add'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: '請上傳 Excel 檔案' });
  let tx;
  try {
    // 伺服器重新比對一次，不採信前端傳來的分類結果
    const { created, changed, unchanged, errors } = await diffImport(req, parseImportFile(req.file.buffer));
    const db = await getPool(req);
    if (changed.length && req.user.role !== 'admin') {
      const perm = await db.request()
        .input('role', mssql.NVarChar, req.user.role)
        .query(`SELECT IsAllowed FROM RolePermissions WHERE Role=@role AND Permission='product_edit'`);
      if (!perm.recordset[0]?.IsAllowed)
        return res.status(403).json({ message: `有 ${changed.length} 筆商品需要修改，但您沒有修改商品的權限` });
    }
    tx = new mssql.Transaction(db);
    await tx.begin();
    const bind = (r) => new mssql.Request(tx)
      .input('Barcode',     mssql.NVarChar,        r.Barcode)
      .input('ProductName', mssql.NVarChar,        r.ProductName)
      .input('Unit',        mssql.NVarChar,        r.Unit)
      .input('CostPrice',   mssql.Decimal(10, 2),  r.CostPrice)
      .input('SalePrice',   mssql.Decimal(10, 2),  r.SalePrice)
      .input('Stock',       mssql.Int,             r.Stock)
      .input('Category',    mssql.NVarChar,        r.Category)
      .input('By',          mssql.Int,             req.user.id);
    for (const r of changed) {
      await bind(r).input('ProductID', mssql.Int, r.ProductID).query(
        `UPDATE Products SET ProductName=@ProductName, Unit=@Unit, CostPrice=@CostPrice, SalePrice=@SalePrice,
           Stock=@Stock, Category=@Category, IsActive=1, UpdatedAt=GETDATE(), UpdatedBy=@By WHERE ProductID=@ProductID`);
    }
    for (const r of created) {
      await bind(r).query(
        `INSERT INTO Products (Barcode, ProductName, Unit, CostPrice, SalePrice, Stock, Category, CreatedBy, UpdatedBy)
         VALUES (@Barcode, @ProductName, @Unit, @CostPrice, @SalePrice, @Stock, @Category, @By, @By)`);
    }
    await tx.commit();
    res.json({
      created: created.length, updated: changed.length, unchanged, errors,
      message: `匯入完成：新增 ${created.length} 筆、更新 ${changed.length} 筆、相同跳過 ${unchanged} 筆` +
               (errors.length ? `、${errors.length} 筆有問題未匯入` : ''),
    });
  } catch (err) {
    if (tx) await tx.rollback().catch(() => {});
    console.error(err);
    res.status(500).json({ message: '匯入失敗，資料未變更：' + err.message });
  }
});

app.post('/api/products/import', authMiddleware, requirePermission('product_add'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: '請上傳 Excel 檔案' });
    const wb   = XLSX.read(req.file.buffer, { type:'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    const db   = await getPool(req);
    let success = 0, errors = [];
    for (const row of rows) {
      const barcode  = String(row['條碼']    || '').trim() || null;
      const name     = String(row['商品名稱'] || '').trim();
      const unit     = String(row['單位']    || '個').trim();
      const cost     = parseFloat(row['進價'] || 0);
      const sale     = parseFloat(row['售價'] || 0);
      const stock    = parseInt(row['庫存']   || 0);
      const category = String(row['分類']    || '').trim() || null;
      if (!name) { errors.push(`第 ${success + errors.length + 2} 行：商品名稱為空`); continue; }
      try {
        if (barcode) {
          const check = await db.request().input('Barcode', mssql.NVarChar, barcode).query(`SELECT ProductID FROM Products WHERE Barcode = @Barcode`);
          if (check.recordset.length > 0) {
            await db.request()
              .input('Barcode', mssql.NVarChar, barcode).input('ProductName', mssql.NVarChar, name)
              .input('Unit', mssql.NVarChar, unit).input('CostPrice', mssql.Decimal, cost)
              .input('SalePrice', mssql.Decimal, sale).input('Stock', mssql.Int, stock).input('Category', mssql.NVarChar, category)
              .query(`UPDATE Products SET ProductName=@ProductName, Unit=@Unit, CostPrice=@CostPrice, SalePrice=@SalePrice, Stock=@Stock, Category=@Category, IsActive=1, UpdatedAt=GETDATE() WHERE Barcode=@Barcode`);
          } else {
            await db.request()
              .input('Barcode', mssql.NVarChar, barcode).input('ProductName', mssql.NVarChar, name)
              .input('Unit', mssql.NVarChar, unit).input('CostPrice', mssql.Decimal, cost)
              .input('SalePrice', mssql.Decimal, sale).input('Stock', mssql.Int, stock).input('Category', mssql.NVarChar, category)
              .query(`INSERT INTO Products (Barcode, ProductName, Unit, CostPrice, SalePrice, Stock, Category) VALUES (@Barcode, @ProductName, @Unit, @CostPrice, @SalePrice, @Stock, @Category)`);
          }
        } else {
          await db.request()
            .input('ProductName', mssql.NVarChar, name).input('Unit', mssql.NVarChar, unit)
            .input('CostPrice', mssql.Decimal, cost).input('SalePrice', mssql.Decimal, sale)
            .input('Stock', mssql.Int, stock).input('Category', mssql.NVarChar, category)
            .query(`INSERT INTO Products (ProductName, Unit, CostPrice, SalePrice, Stock, Category) VALUES (@ProductName, @Unit, @CostPrice, @SalePrice, @Stock, @Category)`);
        }
        success++;
      } catch (e) { errors.push(`"${name}"：${e.message}`); }
    }
    res.json({ success, errors, message: `匯入完成：${success} 筆成功，${errors.length} 筆失敗` });
  } catch (err) { res.status(500).json({ message: '匯入失敗，請確認檔案格式' }); }
});

// ============================================
// 員工
// ============================================
app.get('/api/employees', authMiddleware, requirePermission('employee_view'), async (req, res) => {
  try {
    const db     = await getPool(req);
    const result = await db.request().query(`SELECT EmployeeID, Username, FullName, Role, Phone, IsActive, CreatedAt, CONVERT(VARCHAR(16), LastLoginAt, 120) AS LastLoginAt FROM Employees ORDER BY FullName`);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.post('/api/employees', authMiddleware, requirePermission('employee_add'), async (req, res) => {
  try {
    const { Username, Password, FullName, Role, Phone } = req.body;
    if (!Username || !Password || !FullName) return res.status(400).json({ message: '帳號、密碼、姓名為必填' });
    if (!['admin', 'sales', 'warehouse'].includes(Role || 'sales')) return res.status(400).json({ message: '無效的角色' });
    if (req.user.role !== 'admin' && Role === 'admin') return res.status(403).json({ message: '您無法建立管理員帳號' });
    const hash = await bcrypt.hash(Password, 10);
    const db   = await getPool(req);
    const result = await db.request()
      .input('Username', mssql.NVarChar, Username).input('PasswordHash', mssql.NVarChar, hash)
      .input('FullName', mssql.NVarChar, FullName).input('Role', mssql.NVarChar, Role || 'sales').input('Phone', mssql.NVarChar, Phone || null)
      .query(`INSERT INTO Employees (Username, PasswordHash, FullName, Role, Phone) OUTPUT INSERTED.EmployeeID, INSERTED.Username, INSERTED.FullName, INSERTED.Role, INSERTED.Phone, INSERTED.IsActive, INSERTED.CreatedAt VALUES (@Username, @PasswordHash, @FullName, @Role, @Phone)`);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    if (err.number === 2627) return res.status(409).json({ message: '此帳號已存在' });
    res.status(500).json({ message: '伺服器錯誤' });
  }
});

app.put('/api/employees/:id', authMiddleware, requirePermission('employee_edit'), async (req, res) => {
  try {
    const { Password, FullName, Role, Phone, IsActive } = req.body;
    const db = await getPool(req);
    if (!['admin', 'sales', 'warehouse'].includes(Role)) return res.status(400).json({ message: '無效的角色' });
    if (req.user.role !== 'admin') {
      const target = await db.request().input('id', mssql.Int, req.params.id)
        .query(`SELECT Role FROM Employees WHERE EmployeeID=@id`);
      if (target.recordset[0]?.Role === 'admin' || Role === 'admin')
        return res.status(403).json({ message: '您無法修改管理員帳號' });
    }
    if (Password) {
      const hash = await bcrypt.hash(Password, 10);
      await db.request()
        .input('id', mssql.Int, req.params.id).input('PasswordHash', mssql.NVarChar, hash)
        .input('FullName', mssql.NVarChar, FullName).input('Role', mssql.NVarChar, Role)
        .input('Phone', mssql.NVarChar, Phone || null).input('IsActive', mssql.Bit, IsActive !== undefined ? IsActive : 1)
        .query(`UPDATE Employees SET PasswordHash=@PasswordHash, FullName=@FullName, Role=@Role, Phone=@Phone, IsActive=@IsActive WHERE EmployeeID=@id`);
    } else {
      await db.request()
        .input('id', mssql.Int, req.params.id).input('FullName', mssql.NVarChar, FullName)
        .input('Role', mssql.NVarChar, Role).input('Phone', mssql.NVarChar, Phone || null)
        .input('IsActive', mssql.Bit, IsActive !== undefined ? IsActive : 1)
        .query(`UPDATE Employees SET FullName=@FullName, Role=@Role, Phone=@Phone, IsActive=@IsActive WHERE EmployeeID=@id`);
    }
    res.json({ message: '員工資料已更新' });
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.get('/api/employees/:id/deletable', authMiddleware, requirePermission('employee_delete'), async (req, res) => {
  try {
    const db = await getPool(req);
    const result = await db.request().input('id', mssql.Int, req.params.id)
      .query(`SELECT (SELECT COUNT(*) FROM Orders WHERE EmployeeID = @id) + (SELECT COUNT(*) FROM [Returns] WHERE EmployeeID = @id) AS cnt`);
    const cnt = result.recordset[0].cnt;
    res.json({ deletable: cnt === 0, count: cnt });
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.delete('/api/employees/:id', authMiddleware, requirePermission('employee_delete'), async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ message: '無法操作自己的帳號' });
    const db = await getPool(req);
    if (req.user.role !== 'admin') {
      const target = await db.request().input('id', mssql.Int, req.params.id)
        .query(`SELECT Role FROM Employees WHERE EmployeeID=@id`);
      if (target.recordset[0]?.Role === 'admin') return res.status(403).json({ message: '您無法刪除管理員帳號' });
    }
    const check = await db.request().input('id', mssql.Int, req.params.id)
      .query(`SELECT (SELECT COUNT(*) FROM Orders WHERE EmployeeID = @id) + (SELECT COUNT(*) FROM [Returns] WHERE EmployeeID = @id) AS cnt`);
    if (check.recordset[0].cnt > 0)
      return res.status(409).json({ message: `此員工有 ${check.recordset[0].cnt} 筆關聯訂單／退貨，無法刪除` });
    await db.request().input('id', mssql.Int, req.params.id).query(`DELETE FROM Employees WHERE EmployeeID = @id`);
    res.json({ message: '員工資料已刪除' });
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

// ============================================
// 客戶
// ============================================
app.get('/api/customers', authMiddleware, async (req, res) => {
  try {
    const db = await getPool(req);
    const { search } = req.query;
    const request = db.request();
    let sql = `SELECT * FROM Customers WHERE IsActive = 1`;
    if (search) { sql += ` AND (CompanyName LIKE @search OR CustomerCode LIKE @search OR ContactName LIKE @search OR Phone LIKE @search)`; request.input('search', mssql.NVarChar, `%${search}%`); }
    sql += ` ORDER BY CustomerCode, CompanyName`;
    const result = await request.query(sql);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.post('/api/customers', authMiddleware, requirePermission('customer_add'), async (req, res) => {
  try {
    const { CustomerCode, CompanyName, ContactName, Phone, Mobile, Address, TaxID, CreditLimit, Notes } = req.body;
    if (!CompanyName) return res.status(400).json({ message: '公司名稱為必填' });
    const db     = await getPool(req);
    const result = await db.request()
      .input('CustomerCode', mssql.NVarChar, CustomerCode || null).input('CompanyName', mssql.NVarChar, CompanyName)
      .input('ContactName', mssql.NVarChar, ContactName || null).input('Phone', mssql.NVarChar, Phone || null)
      .input('Mobile', mssql.NVarChar, Mobile || null).input('Address', mssql.NVarChar, Address || null)
      .input('TaxID', mssql.NVarChar, TaxID || null).input('CreditLimit', mssql.Decimal, CreditLimit || 0).input('Notes', mssql.NVarChar, Notes || null)
      .query(`INSERT INTO Customers (CustomerCode, CompanyName, ContactName, Phone, Mobile, Address, TaxID, CreditLimit, Notes) OUTPUT INSERTED.* VALUES (@CustomerCode, @CompanyName, @ContactName, @Phone, @Mobile, @Address, @TaxID, @CreditLimit, @Notes)`);
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    if (err.number === 2601) return res.status(409).json({ message: '客戶代號已存在' });
    res.status(500).json({ message: '伺服器錯誤' });
  }
});

app.put('/api/customers/:id', authMiddleware, requirePermission('customer_edit'), async (req, res) => {
  try {
    const { CustomerCode, CompanyName, ContactName, Phone, Mobile, Address, TaxID, CreditLimit, Notes, IsActive } = req.body;
    const db = await getPool(req);
    await db.request()
      .input('CustomerID', mssql.Int, req.params.id).input('CustomerCode', mssql.NVarChar, CustomerCode || null)
      .input('CompanyName', mssql.NVarChar, CompanyName).input('ContactName', mssql.NVarChar, ContactName || null)
      .input('Phone', mssql.NVarChar, Phone || null).input('Mobile', mssql.NVarChar, Mobile || null)
      .input('Address', mssql.NVarChar, Address || null).input('TaxID', mssql.NVarChar, TaxID || null)
      .input('CreditLimit', mssql.Decimal, CreditLimit || 0).input('Notes', mssql.NVarChar, Notes || null)
      .input('IsActive', mssql.Bit, IsActive !== undefined ? IsActive : 1)
      .query(`UPDATE Customers SET CustomerCode=@CustomerCode, CompanyName=@CompanyName, ContactName=@ContactName, Phone=@Phone, Mobile=@Mobile, Address=@Address, TaxID=@TaxID, CreditLimit=@CreditLimit, Notes=@Notes, IsActive=@IsActive WHERE CustomerID=@CustomerID`);
    res.json({ message: '客戶資料已更新' });
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.delete('/api/customers/:id', authMiddleware, requirePermission('customer_delete'), async (req, res) => {
  try {
    const db = await getPool(req);
    await db.request().input('id', mssql.Int, req.params.id).query(`UPDATE Customers SET IsActive = 0 WHERE CustomerID = @id`);
    res.json({ message: '客戶已刪除' });
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

// ============================================
// 訂單
// ============================================
app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    const db = await getPool(req);
    const { status, startDate, endDate, customerId } = req.query;
    const request = db.request();
    let sql = `SELECT o.*, c.CompanyName, c.CustomerCode, e.FullName AS EmployeeName FROM Orders o JOIN Customers c ON o.CustomerID = c.CustomerID JOIN Employees e ON o.EmployeeID = e.EmployeeID WHERE 1=1`;
    if (req.user.role === 'sales') { sql += ` AND o.EmployeeID = @empId`; request.input('empId', mssql.Int, req.user.id); }
    if (status)     { sql += ` AND o.Status = @status`;                          request.input('status',     mssql.NVarChar, status); }
    if (customerId) { sql += ` AND o.CustomerID = @customerId`;                   request.input('customerId', mssql.Int,      customerId); }
    if (startDate)  { sql += ` AND CAST(o.OrderDate AS DATE) >= @startDate`;      request.input('startDate',  mssql.Date,     startDate); }
    if (endDate)    { sql += ` AND CAST(o.OrderDate AS DATE) <= @endDate`;        request.input('endDate',    mssql.Date,     endDate); }
    sql += ` ORDER BY o.CreatedAt DESC`;
    const result = await request.query(sql);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.get('/api/orders/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getPool(req);
    const orderResult = await db.request().input('id', mssql.Int, req.params.id)
      .query(`SELECT o.*, c.CompanyName, c.CustomerCode, c.ContactName, c.Phone AS CustomerPhone, c.Address AS CustomerAddress, c.TaxID, e.FullName AS EmployeeName FROM Orders o JOIN Customers c ON o.CustomerID = c.CustomerID JOIN Employees e ON o.EmployeeID = e.EmployeeID WHERE o.OrderID = @id`);
    if (!orderResult.recordset[0]) return res.status(404).json({ message: '訂單不存在' });
    const itemsResult = await db.request().input('id', mssql.Int, req.params.id).query(`SELECT * FROM OrderItems WHERE OrderID = @id ORDER BY ItemID`);
    const order = orderResult.recordset[0];
    order.items = itemsResult.recordset;
    res.json(order);
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.post('/api/orders', authMiddleware, requirePermission('order_add'), async (req, res) => {
  const transaction = new mssql.Transaction(await getPool(req));
  try {
    const { CustomerID, items, Notes } = req.body;
    if (!CustomerID)    return res.status(400).json({ message: '請選擇客戶' });
    if (!items?.length) return res.status(400).json({ message: '請至少新增一項商品' });
    await transaction.begin();
    const req2        = new mssql.Request(transaction);
    const orderNo     = await generateOrderNo(req);
    const totalAmount = items.reduce((sum, i) => sum + (i.Quantity * i.UnitPrice), 0);
    const orderResult = await req2
      .input('OrderNo', mssql.NVarChar, orderNo).input('CustomerID', mssql.Int, CustomerID)
      .input('EmployeeID', mssql.Int, req.user.id).input('TotalAmount', mssql.Decimal, totalAmount).input('Notes', mssql.NVarChar, Notes || null)
      .query(`INSERT INTO Orders (OrderNo, CustomerID, EmployeeID, TotalAmount, Notes) OUTPUT INSERTED.* VALUES (@OrderNo, @CustomerID, @EmployeeID, @TotalAmount, @Notes)`);
    const orderID = orderResult.recordset[0].OrderID;
    for (const item of items) {
      const req3 = new mssql.Request(transaction);
      await req3
        .input('OrderID', mssql.Int, orderID).input('ProductID', mssql.Int, item.ProductID || null)
        .input('Barcode', mssql.NVarChar, item.Barcode || null).input('ProductName', mssql.NVarChar, item.ProductName)
        .input('Unit', mssql.NVarChar, item.Unit || '個').input('Quantity', mssql.Int, item.Quantity)
        .input('UnitPrice', mssql.Decimal, item.UnitPrice || 0).input('Amount', mssql.Decimal, item.Quantity * (item.UnitPrice || 0))
        .query(`INSERT INTO OrderItems (OrderID, ProductID, Barcode, ProductName, Unit, Quantity, UnitPrice, Amount) VALUES (@OrderID, @ProductID, @Barcode, @ProductName, @Unit, @Quantity, @UnitPrice, @Amount)`);
    }
    await transaction.commit();
    res.status(201).json({ OrderID: orderID, OrderNo: orderNo, message: '訂單建立成功' });
  } catch (err) { await transaction.rollback(); res.status(500).json({ message: '訂單建立失敗' }); }
});

app.put('/api/orders/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'picking', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: '無效的狀態值' });
    if (req.user.role === 'sales' && status !== 'cancelled') return res.status(403).json({ message: '權限不足' });
    const db = await getPool(req);
    await db.request().input('id', mssql.Int, req.params.id).input('status', mssql.NVarChar, status)
      .query(`UPDATE Orders SET Status=@status, UpdatedAt=GETDATE() WHERE OrderID=@id`);
    res.json({ message: '狀態已更新' });
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.put('/api/orders/:orderId/items/:itemId/picked', authMiddleware, async (req, res) => {
  try {
    const { pickedQty } = req.body;
    const db = await getPool(req);
    await db.request()
      .input('itemId', mssql.Int, req.params.itemId).input('orderId', mssql.Int, req.params.orderId).input('pickedQty', mssql.Int, pickedQty)
      .query(`UPDATE OrderItems SET PickedQty=@pickedQty WHERE ItemID=@itemId AND OrderID=@orderId`);
    res.json({ message: '撿貨數量已更新' });
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.put('/api/orders/:id', authMiddleware, requirePermission('order_edit'), async (req, res) => {
  const transaction = new mssql.Transaction(await getPool(req));
  try {
    const { items, Notes } = req.body;
    if (!items?.length) return res.status(400).json({ message: '請至少保留一項商品' });
    const totalAmount = items.reduce((sum, i) => sum + (i.Quantity * i.UnitPrice), 0);
    await transaction.begin();
    await new mssql.Request(transaction)
      .input('id', mssql.Int, req.params.id).input('TotalAmount', mssql.Decimal, totalAmount).input('Notes', mssql.NVarChar, Notes || null)
      .query(`UPDATE Orders SET TotalAmount=@TotalAmount, Notes=@Notes, UpdatedAt=GETDATE() WHERE OrderID=@id`);
    await new mssql.Request(transaction).input('id', mssql.Int, req.params.id).query(`DELETE FROM OrderItems WHERE OrderID=@id`);
    for (const item of items) {
      const r = new mssql.Request(transaction);
      await r.input('OrderID', mssql.Int, req.params.id).input('ProductID', mssql.Int, item.ProductID || null)
        .input('Barcode', mssql.NVarChar, item.Barcode || null).input('ProductName', mssql.NVarChar, item.ProductName)
        .input('Unit', mssql.NVarChar, item.Unit || '個').input('Quantity', mssql.Int, item.Quantity)
        .input('UnitPrice', mssql.Decimal, item.UnitPrice || 0).input('Amount', mssql.Decimal, item.Quantity * (item.UnitPrice || 0))
        .query(`INSERT INTO OrderItems (OrderID, ProductID, Barcode, ProductName, Unit, Quantity, UnitPrice, Amount) VALUES (@OrderID, @ProductID, @Barcode, @ProductName, @Unit, @Quantity, @UnitPrice, @Amount)`);
    }
    await transaction.commit();
    res.json({ message: '訂單已更新' });
  } catch (err) { await transaction.rollback(); res.status(500).json({ message: '更新失敗' }); }
});

app.delete('/api/orders/:id', authMiddleware, requirePermission('order_delete'), async (req, res) => {
  const transaction = new mssql.Transaction(await getPool(req));
  try {
    await transaction.begin();
    await new mssql.Request(transaction).input('id', mssql.Int, req.params.id).query(`DELETE FROM OrderItems WHERE OrderID = @id`);
    await new mssql.Request(transaction).input('id', mssql.Int, req.params.id).query(`DELETE FROM Orders WHERE OrderID = @id`);
    await transaction.commit();
    res.json({ message: '訂單已刪除' });
  } catch (err) { await transaction.rollback(); res.status(500).json({ message: '刪除失敗' }); }
});

app.get('/api/orders/:id/export', authMiddleware, async (req, res) => {
  try {
    const db = await getPool(req);
    const orderResult = await db.request().input('id', mssql.Int, req.params.id)
      .query(`SELECT o.OrderNo, o.OrderDate, o.TotalAmount, o.Notes, c.CompanyName, e.FullName AS EmployeeName FROM Orders o JOIN Customers c ON o.CustomerID = c.CustomerID JOIN Employees e ON o.EmployeeID = e.EmployeeID WHERE o.OrderID = @id`);
    const order = orderResult.recordset[0];
    if (!order) return res.status(404).json({ message: '訂單不存在' });
    const itemsResult = await db.request().input('id', mssql.Int, req.params.id).query(`SELECT * FROM OrderItems WHERE OrderID = @id ORDER BY ItemID`);
    const rows = itemsResult.recordset.map((item, idx) => ({
      '項次': idx+1, '條碼': item.Barcode||'', '商品名稱': item.ProductName,
      '單位': item.Unit, '訂購數量': item.Quantity, '單價': item.UnitPrice, '小計': item.Amount, '撿貨數量': item.PickedQty,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '訂單明細');
    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="${order.OrderNo}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) { res.status(500).json({ message: '匯出失敗' }); }
});

// ============================================
// 退貨
// ============================================
async function generateReturnNo(req) {
  const db     = await getPool(req);
  const today  = new Date();
  const prefix = 'RET-' + today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0') + '-';
  const result = await db.request()
    .input('prefix', mssql.NVarChar, prefix + '%')
    .query(`SELECT COUNT(*) AS cnt FROM [Returns] WHERE ReturnNo LIKE @prefix`);
  const seq = String(result.recordset[0].cnt + 1).padStart(4, '0');
  return prefix + seq;
}

app.get('/api/returns', authMiddleware, async (req, res) => {
  try {
    const db = await getPool(req);
    const { status, startDate, endDate } = req.query;
    const request = db.request();
    let sql = `SELECT r.*, c.CompanyName, c.CustomerCode, e.FullName AS EmployeeName
               FROM [Returns] r
               JOIN Customers c ON r.CustomerID = c.CustomerID
               JOIN Employees e ON r.EmployeeID = e.EmployeeID
               WHERE 1=1`;
    if (req.user.role === 'sales') { sql += ` AND r.EmployeeID = @empId`; request.input('empId', mssql.Int, req.user.id); }
    if (status)    { sql += ` AND r.Status = @status`;                     request.input('status',    mssql.NVarChar, status); }
    if (startDate) { sql += ` AND CAST(r.ReturnDate AS DATE) >= @startDate`; request.input('startDate', mssql.Date, startDate); }
    if (endDate)   { sql += ` AND CAST(r.ReturnDate AS DATE) <= @endDate`;   request.input('endDate',   mssql.Date, endDate); }
    sql += ` ORDER BY r.CreatedAt DESC`;
    const result = await request.query(sql);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.get('/api/returns/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getPool(req);
    const returnResult = await db.request().input('id', mssql.Int, req.params.id)
      .query(`SELECT r.*, c.CompanyName, c.CustomerCode, c.ContactName, c.Phone AS CustomerPhone, c.Address AS CustomerAddress, c.TaxID, e.FullName AS EmployeeName
              FROM [Returns] r
              JOIN Customers c ON r.CustomerID = c.CustomerID
              JOIN Employees e ON r.EmployeeID = e.EmployeeID
              WHERE r.ReturnID = @id`);
    if (!returnResult.recordset[0]) return res.status(404).json({ message: '退貨單不存在' });
    const itemsResult = await db.request().input('id', mssql.Int, req.params.id)
      .query(`SELECT * FROM ReturnItems WHERE ReturnID = @id ORDER BY ItemID`);
    const ret = returnResult.recordset[0];
    ret.items = itemsResult.recordset;
    res.json(ret);
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.post('/api/returns', authMiddleware, requirePermission('return_add'), async (req, res) => {
  const transaction = new mssql.Transaction(await getPool(req));
  try {
    const { CustomerID, items, Notes } = req.body;
    if (!CustomerID)    return res.status(400).json({ message: '請選擇客戶' });
    if (!items?.length) return res.status(400).json({ message: '請至少新增一項商品' });
    await transaction.begin();
    const req2        = new mssql.Request(transaction);
    const returnNo    = await generateReturnNo(req);
    const totalAmount = items.reduce((sum, i) => sum + (i.Quantity * i.UnitPrice), 0);
    const retResult   = await req2
      .input('ReturnNo', mssql.NVarChar, returnNo).input('CustomerID', mssql.Int, CustomerID)
      .input('EmployeeID', mssql.Int, req.user.id).input('TotalAmount', mssql.Decimal, totalAmount).input('Notes', mssql.NVarChar, Notes || null)
      .query(`INSERT INTO [Returns] (ReturnNo, CustomerID, EmployeeID, TotalAmount, Notes) OUTPUT INSERTED.* VALUES (@ReturnNo, @CustomerID, @EmployeeID, @TotalAmount, @Notes)`);
    const returnID = retResult.recordset[0].ReturnID;
    for (const item of items) {
      const req3 = new mssql.Request(transaction);
      await req3
        .input('ReturnID', mssql.Int, returnID).input('ProductID', mssql.Int, item.ProductID || null)
        .input('Barcode', mssql.NVarChar, item.Barcode || null).input('ProductName', mssql.NVarChar, item.ProductName)
        .input('Unit', mssql.NVarChar, item.Unit || '個').input('Quantity', mssql.Int, item.Quantity)
        .input('UnitPrice', mssql.Decimal, item.UnitPrice || 0).input('Amount', mssql.Decimal, item.Quantity * (item.UnitPrice || 0))
        .query(`INSERT INTO ReturnItems (ReturnID, ProductID, Barcode, ProductName, Unit, Quantity, UnitPrice, Amount) VALUES (@ReturnID, @ProductID, @Barcode, @ProductName, @Unit, @Quantity, @UnitPrice, @Amount)`);
    }
    await transaction.commit();
    res.status(201).json({ ReturnID: returnID, ReturnNo: returnNo, message: '退貨單建立成功' });
  } catch (err) { await transaction.rollback(); res.status(500).json({ message: '退貨單建立失敗' }); }
});

app.put('/api/returns/:id/status', authMiddleware, requirePermission('return_edit'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending','completed','cancelled'].includes(status)) return res.status(400).json({ message: '無效的狀態值' });
    const db = await getPool(req);
    await db.request().input('id', mssql.Int, req.params.id).input('status', mssql.NVarChar, status)
      .query(`UPDATE [Returns] SET Status=@status, UpdatedAt=GETDATE() WHERE ReturnID=@id`);
    res.json({ message: '狀態已更新' });
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.delete('/api/returns/:id', authMiddleware, requirePermission('return_delete'), async (req, res) => {
  const transaction = new mssql.Transaction(await getPool(req));
  try {
    await transaction.begin();
    await new mssql.Request(transaction).input('id', mssql.Int, req.params.id).query(`DELETE FROM ReturnItems WHERE ReturnID = @id`);
    await new mssql.Request(transaction).input('id', mssql.Int, req.params.id).query(`DELETE FROM [Returns] WHERE ReturnID = @id`);
    await transaction.commit();
    res.json({ message: '退貨單已刪除' });
  } catch (err) { await transaction.rollback(); res.status(500).json({ message: '刪除失敗' }); }
});

app.get('/api/returns/:id/export', authMiddleware, async (req, res) => {
  try {
    const db = await getPool(req);
    const retResult = await db.request().input('id', mssql.Int, req.params.id)
      .query(`SELECT r.ReturnNo, r.ReturnDate, r.TotalAmount, r.Notes, c.CompanyName, e.FullName AS EmployeeName FROM [Returns] r JOIN Customers c ON r.CustomerID = c.CustomerID JOIN Employees e ON r.EmployeeID = e.EmployeeID WHERE r.ReturnID = @id`);
    const ret = retResult.recordset[0];
    if (!ret) return res.status(404).json({ message: '退貨單不存在' });
    const itemsResult = await db.request().input('id', mssql.Int, req.params.id).query(`SELECT * FROM ReturnItems WHERE ReturnID = @id ORDER BY ItemID`);
    const rows = itemsResult.recordset.map((item, idx) => ({
      '項次': idx+1, '條碼': item.Barcode||'', '商品名稱': item.ProductName,
      '單位': item.Unit, '退貨數量': item.Quantity, '單價': item.UnitPrice, '小計': item.Amount,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '退貨明細');
    const buf = XLSX.write(wb, { type:'buffer', bookType:'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="${ret.ReturnNo}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) { res.status(500).json({ message: '匯出失敗' }); }
});

// ============================================
// 儀表板
// ============================================
app.get('/api/dashboard', authMiddleware, async (req, res) => {
  try {
    const db      = await getPool(req);
    const isSales = req.user.role === 'sales';
    const empId   = req.user.id;
    const salesFilter = isSales ? 'AND EmployeeID = @empId' : '';
    const salesWhere  = isSales ? 'WHERE o.EmployeeID = @empId' : '';
    // 合併查詢以減少登入後儀表板與 SQL Server 間的往返次數。
    const result = await db.request()
      .input('empId', mssql.Int, empId)
      .query(`
        SELECT COUNT(*) AS cnt FROM Products WHERE IsActive=1;
        SELECT COUNT(*) AS cnt FROM Customers WHERE IsActive=1;
        SELECT COUNT(*) AS cnt FROM Orders WHERE Status='pending' ${salesFilter};
        SELECT COUNT(*) AS cnt, ISNULL(SUM(TotalAmount),0) AS total
        FROM Orders
        WHERE OrderDate >= CONVERT(date, GETDATE())
          AND OrderDate < DATEADD(day, 1, CONVERT(date, GETDATE())) ${salesFilter};
        SELECT TOP 5 o.OrderID, o.OrderNo, o.OrderDate, o.TotalAmount, o.Status,
               c.CompanyName, e.FullName AS EmployeeName
        FROM Orders o
        JOIN Customers c ON o.CustomerID = c.CustomerID
        JOIN Employees e ON o.EmployeeID = e.EmployeeID
        ${salesWhere}
        ORDER BY o.CreatedAt DESC;
      `);
    const [products, customers, pending, today, recentOrders] = result.recordsets;
    const stats = {
      totalProducts:  products[0].cnt,
      totalCustomers: customers[0].cnt,
      pendingOrders:  pending[0].cnt,
      todayOrders:    today[0].cnt,
      todayAmount:    today[0].total,
      recentOrders,
    };
    res.json(stats);
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

// ============================================
// 系統設定
// ============================================
app.get('/api/settings', authMiddleware, async (req, res) => {
  try {
    const db     = await getPool(req);
    const result = await db.request().query(`SELECT SettingKey, SettingValue FROM SystemSettings`);
    const settings = {};
    result.recordset.forEach(r => { settings[r.SettingKey] = r.SettingValue; });
    res.json(settings);
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.put('/api/settings', authMiddleware, requirePermission('settings_edit'), async (req, res) => {
  try {
    const db      = await getPool(req);
    const allowed = ['COMPANY_NAME', 'COMPANY_PHONE', 'COMPANY_ADDRESS'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        await db.request()
          .input('k', mssql.NVarChar, key)
          .input('v', mssql.NVarChar, req.body[key] || '')
          .query(`MERGE SystemSettings AS t USING (SELECT @k AS SettingKey) AS s ON t.SettingKey = s.SettingKey
                  WHEN MATCHED THEN UPDATE SET SettingValue=@v, UpdatedAt=GETDATE()
                  WHEN NOT MATCHED THEN INSERT (SettingKey, SettingValue) VALUES (@k, @v);`);
      }
    }
    res.json({ message: '設定已儲存' });
  } catch (err) { res.status(500).json({ message: '儲存失敗' }); }
});

// ============================================
// 權限管理
// ============================================
app.get('/api/permissions', authMiddleware, adminOnly, async (req, res) => {
  try {
    const db = await getPool(req);
    const result = await db.request().query(`SELECT Role, Permission, IsAllowed FROM RolePermissions ORDER BY Role, Permission`);
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.put('/api/permissions', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { Role, Permission, IsAllowed } = req.body;
    const db = await getPool(req);
    await db.request()
      .input('Role', mssql.NVarChar, Role).input('Permission', mssql.NVarChar, Permission).input('IsAllowed', mssql.Bit, IsAllowed)
      .query(`MERGE RolePermissions AS t USING (SELECT @Role AS Role, @Permission AS Permission) AS s ON t.Role = s.Role AND t.Permission = s.Permission WHEN MATCHED THEN UPDATE SET IsAllowed = @IsAllowed WHEN NOT MATCHED THEN INSERT (Role, Permission, IsAllowed) VALUES (@Role, @Permission, @IsAllowed);`);
    res.json({ message: '權限已更新' });
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

app.get('/api/permissions/my', authMiddleware, async (req, res) => {
  try {
    if (req.user.role === 'admin') return res.json({ all: true, permissions: [] });
    const db = await getPool(req);
    const result = await db.request().input('role', mssql.NVarChar, req.user.role)
      .query(`SELECT Permission FROM RolePermissions WHERE Role=@role AND IsAllowed=1`);
    res.json({ all: false, permissions: result.recordset.map(r => r.Permission) });
  } catch (err) { res.status(500).json({ message: '伺服器錯誤' }); }
});

// ============================================
// 啟動
// ============================================
app.listen(PORT, () => {
  console.log(`✅ 批發商業務管理系統後端已啟動: http://localhost:${PORT}`);
  for (const tenant of TENANTS.keys()) {
    getPool({ tenant })
      .then(() => console.log(`✅ [${tenant}] 資料庫連線成功`))
      .catch(err => console.error(`❌ [${tenant}] 資料庫連線失敗:`, err.message));
  }
});
