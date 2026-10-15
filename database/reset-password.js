require('dotenv').config();
const bcrypt = require('bcryptjs');
const mssql  = require('mssql');

const dbConfig = {
  server:   process.env.DB_SERVER   || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_DATABASE || 'WholesaleDB',
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: { encrypt: false, trustServerCertificate: true }
};

async function main() {
  const hash = await bcrypt.hash('admin123', 10);
  const pool = await mssql.connect(dbConfig);
  
  const result = await pool.request()
    .input('hash', mssql.NVarChar, hash)
    .query(`
      UPDATE Employees SET PasswordHash = @hash WHERE Username = 'admin'
      SELECT @@ROWCOUNT AS updated
    `);
  
  console.log('✅ 更新筆數：', result.recordset[0].updated);
  console.log('✅ 新 hash：', hash);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ 失敗：', err.message);
  process.exit(1);
});