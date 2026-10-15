const { execSync } = require('child_process');
const fs = require('fs');

// 嘗試使用 OpenSSL 產生憑證 (這是 Windows 下最穩定的方法)
try {
  console.log('正在嘗試產生憑證...');
  // 強制使用 Git 的 OpenSSL 路徑 (如果有的話)
  const cmd = 'openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=cheng112258.ddns.net"';
  execSync(cmd, { stdio: 'inherit' });
  console.log('✅ 憑證產生成功！');
} catch (err) {
  console.log('❌ 無法產生憑證。請確保您的電腦已安裝 Git 並在 Git Bash 執行此指令：');
  console.log('openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=cheng112258.ddns.net"');
}
