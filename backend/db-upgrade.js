// ============================================
// 資料庫補齊工具：執行 database/schema.sql，把缺少的資料表、欄位、索引、預設權限補上。
// 腳本每一段都會先檢查是否已存在，已有的資料與設定不會被刪除或覆蓋，可重複執行。
// 用法（在 backend 資料夾）：node db-upgrade.js
// ============================================
require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const mssql = require('mssql');

const config = {
  server:   process.env.DB_SERVER,
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_DATABASE,
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
    .filter(b => b && !/^\s*USE\s+/im.test(b) && !/CREATE DATABASE/i.test(b));

  console.log(`連線到 ${config.server} / ${config.database} ...`);
  const pool = await mssql.connect(config);

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
