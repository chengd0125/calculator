const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 嘗試使用 OpenSSL 產生憑證 (通常 Git for Windows 會附帶)
try {
  console.log('正在嘗試產生憑證...');
  execSync('openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=cheng112258.ddns.net"', { stdio: 'inherit' });
  console.log('✅ 憑證產生成功 (使用 OpenSSL)');
} catch (err) {
  console.log('❌ 無法使用 OpenSSL，請手動確認電腦是否安裝 OpenSSL 或 Git。');
  console.log('如果您有 Git，請使用 Git Bash 執行上述指令。');
}
