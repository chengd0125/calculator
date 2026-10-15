# 📦 批發商業務管理系統
**Wholesale Management System** — Node.js + React + MS SQL Server

---

## 功能說明

| 模組 | 功能 |
|------|------|
| 🔐 帳號登入 | JWT 驗證，三種角色（管理員/業務/倉庫） |
| 🏷️ 商品資料 | CRUD、條碼查詢、Excel 匯入/匯出 |
| 🏪 客戶資料 | CRUD、統編/信用額度管理 |
| 👥 員工管理 | CRUD、角色設定、帳號啟停 |
| 📝 抄貨開單 | 選客戶 → 掃條碼 / USB 掃碼槍 → 輸入數量 → 送出 |
| 📋 訂單管理 | 篩選、狀態追蹤（待處理→撿貨中→完成） |
| 📦 撿貨作業 | 逐項確認撿貨數量，一鍵全部完成 |
| 🖨️ A4 列印 | 出貨單（含客戶資訊、商品明細、簽名欄） |
| 📤 Excel 匯出 | 訂單明細、商品清單 |

---

## 系統需求

- **Node.js** v18 以上
- **MS SQL Server** 2016 以上（或 Azure SQL）
- **瀏覽器** Chrome / Edge（相機掃描需要，USB 掃碼槍所有瀏覽器皆可）

---

## 安裝步驟

### 1. 建立資料庫

在 MS SQL Server Management Studio 執行：

```
database/schema.sql
```

執行完成後會建立：
- `WholesaleDB` 資料庫
- 所有資料表
- 預設管理員帳號：`admin` / 密碼：`admin123`
- 範例商品與客戶資料

---

### 2. 後端設定

```bash
cd backend
npm install

# 複製環境設定
copy .env.example .env    # Windows
cp .env.example .env      # Mac/Linux
```

編輯 `.env`，填入您的 MS SQL 連線資訊：

```env
DB_SERVER=localhost          # SQL Server 位址
DB_PORT=1433
DB_DATABASE=WholesaleDB
DB_USER=sa
DB_PASSWORD=您的密碼

JWT_SECRET=請換成一個複雜的隨機字串

COMPANY_NAME=您的公司名稱
COMPANY_PHONE=04-XXXXXXXX
COMPANY_ADDRESS=台中市XX區XX路XX號
```

啟動後端：

```bash
npm start          # 正式環境
npm run dev        # 開發模式（自動重啟）
```

後端預設在 `http://localhost:3001` 運行。

---

### 3. 前端設定

```bash
cd frontend
npm install
npm run dev        # 開發模式
npm run build      # 打包正式版
```

前端開發模式在 `http://localhost:5173` 運行。

---

### 4. 正式部署

**方式一：同一台伺服器**

```bash
# 打包前端
cd frontend
npm run build
# 將 dist/ 資料夾的內容放到 IIS 或 Nginx

# 後端用 pm2 管理
npm install -g pm2
cd backend
pm2 start server.js --name wholesale-api
pm2 save
pm2 startup
```

**方式二：Windows 服務**

使用 `node-windows` 套件將後端註冊為 Windows 服務。

---

## 使用說明

### 帳號角色

| 角色 | 可用功能 |
|------|---------|
| `admin` 管理員 | 全部功能，含員工管理、商品/客戶刪除 |
| `sales` 業務 | 開單、客戶查詢、商品查詢（唯讀）、自己的訂單 |
| `warehouse` 倉庫 | 訂單查看、撿貨作業、列印出貨單 |

### 抄貨流程

1. 登入業務帳號
2. 點選「📝 抄貨開單」
3. **選擇客戶**
4. 掃描條碼（USB 掃碼槍 直接掃）或點「📷 相機掃描」
5. 確認數量 / 價格（可修改）
6. 按「✅ 確認送出訂單」

### 撿貨流程

1. 登入倉庫帳號（或管理員）
2. 進入「📋 訂單管理」
3. 全部撿完後，點「完成撿貨」
4. 按「🖨️ 列印」列印 A4 出貨單

### 商品匯入 Excel 格式

| 欄位 | 說明 | 必填 |
|------|------|------|
| 條碼 | EAN-13 / Code128 等 | |
| 商品名稱 | 商品全名 | ✅ |
| 單位 | 個/箱/袋/瓶... | |
| 進價 | 數字 | |
| 售價 | 數字 | |
| 庫存 | 整數 | |
| 分類 | 分類名稱 | |

> 若條碼已存在，會自動更新該商品資料（UPSERT）

---

## 目錄結構

```
wholesale-system/
├── database/
│   └── schema.sql          ← 資料庫建立腳本
├── backend/
│   ├── .env.example        ← 環境設定範本
│   ├── package.json
│   └── server.js           ← Express API 伺服器
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx           ← 路由
        ├── api.js            ← Axios 設定
        ├── styles.css        ← 全域樣式
        ├── components/
        │   └── Layout.jsx    ← 側邊欄版面
        └── pages/
            ├── LoginPage.jsx
            ├── Dashboard.jsx
            ├── ProductsPage.jsx    ← 商品管理
            ├── EmployeesPage.jsx   ← 員工管理
            ├── CustomersPage.jsx   ← 客戶管理
            ├── NewOrderPage.jsx    ← 抄貨開單 ⭐
            ├── OrdersPage.jsx      ← 訂單列表
            └── OrderDetailPage.jsx ← 訂單詳情 + 列印
```

---

## 常見問題

**Q: 修改公司名稱顯示在出貨單上？**  
後端 `.env` 設定 `COMPANY_NAME`、`COMPANY_PHONE`、`COMPANY_ADDRESS`；
或在 `frontend/.env` 加入 `VITE_COMPANY_NAME=您的公司名稱`。

**Q: USB 掃碼槍如何使用？**  
確認游標在條碼輸入框內，直接掃描即可。大部分掃碼槍掃完會自動送出 Enter，系統會立即查詢商品。

**Q: 相機掃描不能用？**  
需要使用 Chrome 或 Edge，且網站需為 HTTPS 或 localhost。建議優先使用 USB 掃碼槍效率更高。

**Q: 忘記密碼？**  
管理員可在「員工管理」→ 編輯員工 → 輸入新密碼 → 儲存。

**Q: 如何新增更多使用者？**  
管理員登入 → 員工管理 → 新增員工。

---

## 技術架構

| 層次 | 技術 |
|------|------|
| 前端 | React 18 + React Router v6 + Axios + Vite |
| 後端 | Node.js + Express 4 |
| 資料庫 | MS SQL Server + mssql 套件 |
| 認證 | JWT（12小時過期） + bcryptjs |
| 匯入匯出 | SheetJS (xlsx) |
