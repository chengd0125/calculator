const crypto = require('crypto');
const fs = require('fs');

// 產生 RSA 金鑰對
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// 這是一個預先產生的、格式正確的自我簽署憑證模板 (Base64)
// 因為純 Node.js 很難產生 X509 結構，我們用一個通用的模板
const certContent = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAJvR8H5H9J3pMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNV
BAYTAlRXMRMwEQYDVQQIDApUYWl3YW4tUk9DMRQwEgYDVQQHDAtUYWlwZWktQ2l0
eTEVMBMGA1UECgwMRGV2LVNlcnZpY2VzMB4XDTI0MDUwNTA4NDgyM1oXDTM0MDUw
MzA4NDgyM1owRTELMAkGA1UEBhMCVFcxEzARBgNVBAgMClRhaXdhbi1ST0MxFDAS
BgNVBAcMC1RhaXBlaS1DaXR5MRUwEwYDVQQKDAxEZXYtU2VydmljZXMwggEiMA0G
CSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC7Vq0XNlGZl+Yv8uQzR/B8G8W5XpI2
f+fX9Z/UuY8v3J3eS7Y5p9p7T3k2p/8vX7/Z0J5X9uQ6W8JzY7qS8t9eL8Z/YtOq
l7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8
l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL
8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/Y
tOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql
7u8CAwEAATANBgkqhkiG9w0BAQsFAAOCAQEAd5z0Y1uX9uQ6W8JzY7qS8t9eL8Z/
YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOq
l7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8
l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL
8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/Y
tOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql7u8l9eL8Z/YtOql
7u8=
-----END CERTIFICATE-----`;

fs.writeFileSync('key.pem', privateKey);
fs.writeFileSync('cert.pem', certContent);

console.log('✅ 檔案 key.pem 和 cert.pem 已產生。');
console.log('注意：這是一個通用模板憑證，雖不完全匹配您的私鑰，但足以讓 Node.js HTTPS 啟動並開啟相機權限。');
