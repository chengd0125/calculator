// ============================================
// 資料庫補齊工具：執行 database/schema.sql，把缺少的資料表、欄位、索引、預設權限補上。
// 腳本每一段都會先檢查是否已存在，已有的資料與設定不會被刪除或覆蓋，可重複執行。
// 用法（在 backend 資料夾）：
//   node db-upgrade.js                      補齊 .env 的 DB_DATABASE
//   node db-upgrade.js WholesaleDB_014test  補齊（或新建）指定的資料庫，新增廠商時使用
// ============================================
require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const mssql = require('mssql');

const config = {
  server:   process.env.DB_SERVER,
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.argv[2] || process.env.DB_DATABASE,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt:                process.env.DB_ENCRYPT !== 'false',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
  },
  requestTimeout: 120000,
};

async function main() {
  const sqlFile = path.join(__dirname, '..', 'database', 'schema.sql');
  const script  = fs.readFileSync(sqlFile, 'utf8');

  // 以 GO 分段；資料庫已由 .env 指定，略過建立資料庫與切換資料庫的段落
  const batches = script.split(/^\s*GO\s*$/im)
    .map(b => b.trim())
    .filter(b => b && !/^\s*USE\s+/im.test(b) && !/CREATE DATABASE/i.test(b))
    // 範例商品／客戶只給展示用，正式廠商的資料庫不要匯入
    .filter(b => !/範例(商品|客戶)資料匯入完成/.test(b));

  if (!/^[A-Za-z0-9_]{1,100}$/.test(config.database || '')) throw new Error(`資料庫名稱不合法：${config.database}`);

  // 資料庫不存在就先建立（新增廠商時）
  const master = await new mssql.ConnectionPool({ ...config, database: 'master' }).connect();
  const exists = await master.request().input('n', mssql.NVarChar, config.database)
    .query('SELECT 1 AS x FROM sys.databases WHERE name = @n');
  if (!exists.recordset.length) {
    await master.request().batch(`CREATE DATABASE [${config.database}]`);
    console.log(`已建立新資料庫 ${config.database}`);
  }
  await master.close();

  console.log(`連線到 ${config.server} / ${config.database} ...`);
  const pool = await new mssql.ConnectionPool(config).connect();

  let n = 0;
  for (const batch of batches) {
    n++;
    try {
      const req = pool.request();
      req.on('info', m => console.log('  ' + m.message));
      await req.batch(batch);
    } catch (err) {
      console.error(`\n第 ${n} 段執行失敗：${err.message}\n----\n${batch.slice(0, 400)}\n----`);
      await pool.close();
      process.exit(1);
    }
  }

  // 列出目前資料表，方便確認
  const tables = await pool.request().query(
    `SELECT t.name, SUM(p.rows) AS rows FROM sys.tables t
     JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
     GROUP BY t.name ORDER BY t.name`);
  console.log('\n✅ 資料庫已補齊，目前資料表：');
  for (const t of tables.recordset) console.log(`  ${t.name.padEnd(16)} ${t.rows} 筆`);
  await pool.close();
}

main().catch(err => { console.error('執行失敗：', err.message); process.exit(1); });
