-- ============================================
-- 批發商業務管理系統 - 既有資料庫補齊腳本
-- 可直接在 SSMS 執行；每一段都會先檢查，已存在的不會重建，
-- 現有資料與權限設定都不會被刪除或覆蓋，可重複執行。
-- 資料庫名稱不是 WholesaleDB 的話，請改第一行的 USE。
-- ============================================
USE WholesaleDB;
GO

-- 1. 員工最後登入時間
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Employees') AND name = 'LastLoginAt')
    ALTER TABLE Employees ADD LastLoginAt DATETIME NULL;
GO

-- 2. 商品建立者 / 修改者
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'CreatedBy')
    ALTER TABLE Products ADD CreatedBy INT NULL REFERENCES Employees(EmployeeID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'UpdatedBy')
    ALTER TABLE Products ADD UpdatedBy INT NULL REFERENCES Employees(EmployeeID);
GO

-- 3. 系統設定
IF OBJECT_ID('SystemSettings', 'U') IS NULL
BEGIN
    CREATE TABLE SystemSettings (
        SettingKey   NVARCHAR(100) PRIMARY KEY,
        SettingValue NVARCHAR(MAX) DEFAULT '',
        UpdatedAt    DATETIME      DEFAULT GETDATE()
    );
    INSERT INTO SystemSettings (SettingKey, SettingValue) VALUES
    (N'COMPANY_NAME', N'您的公司名稱'), (N'COMPANY_PHONE', N''), (N'COMPANY_ADDRESS', N'');
END
GO

-- 4. 角色權限資料表
IF OBJECT_ID('RolePermissions', 'U') IS NULL
BEGIN
    CREATE TABLE RolePermissions (
        Role       NVARCHAR(20)  NOT NULL,
        Permission NVARCHAR(50)  NOT NULL,
        IsAllowed  BIT           NOT NULL DEFAULT 0,
        CONSTRAINT PK_RolePermissions PRIMARY KEY (Role, Permission)
    );
END
GO

-- 5. 補上缺少的權限預設值（已設定過的不會被改）
INSERT INTO RolePermissions (Role, Permission, IsAllowed)
SELECT d.Role, d.Permission, d.IsAllowed
FROM (VALUES
    ('sales', 'product_view', 1),   ('sales', 'product_add', 0),    ('sales', 'product_edit', 0),    ('sales', 'product_delete', 0),
    ('sales', 'customer_view', 1),  ('sales', 'customer_add', 1),   ('sales', 'customer_edit', 1),   ('sales', 'customer_delete', 0),
    ('sales', 'order_view', 1),     ('sales', 'order_add', 1),      ('sales', 'order_edit', 1),      ('sales', 'order_delete', 0),   ('sales', 'order_pick', 0),
    ('sales', 'return_add', 1),     ('sales', 'return_edit', 0),    ('sales', 'return_delete', 0),
    ('sales', 'settings_edit', 0),
    ('sales', 'employee_view', 0),  ('sales', 'employee_add', 0),   ('sales', 'employee_edit', 0),   ('sales', 'employee_delete', 0),
    ('warehouse', 'product_view', 1),  ('warehouse', 'product_add', 1),  ('warehouse', 'product_edit', 1),  ('warehouse', 'product_delete', 0),
    ('warehouse', 'customer_view', 1), ('warehouse', 'customer_add', 0), ('warehouse', 'customer_edit', 0), ('warehouse', 'customer_delete', 0),
    ('warehouse', 'order_view', 1),    ('warehouse', 'order_add', 0),    ('warehouse', 'order_edit', 0),    ('warehouse', 'order_delete', 0), ('warehouse', 'order_pick', 1),
    ('warehouse', 'return_add', 0),    ('warehouse', 'return_edit', 1),  ('warehouse', 'return_delete', 0),
    ('warehouse', 'settings_edit', 0),
    ('warehouse', 'employee_view', 0), ('warehouse', 'employee_add', 0), ('warehouse', 'employee_edit', 0), ('warehouse', 'employee_delete', 0)
) AS d(Role, Permission, IsAllowed)
WHERE NOT EXISTS (SELECT 1 FROM RolePermissions r WHERE r.Role = d.Role AND r.Permission = d.Permission);
GO

-- 6. 商品出貨紀錄查詢索引
IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'IX_OrderItems_ProductID')
    CREATE INDEX IX_OrderItems_ProductID ON OrderItems(ProductID) INCLUDE (OrderID, Quantity, UnitPrice, Amount, Unit);
GO

-- 7. 條碼唯一索引（若已有重複條碼會失敗，請先處理重複資料）
IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'IX_Products_Barcode')
    CREATE UNIQUE INDEX IX_Products_Barcode ON Products(Barcode) WHERE Barcode IS NOT NULL;
GO

PRINT N'✅ 資料庫補齊完成';
SELECT t.name AS 資料表, SUM(p.rows) AS 筆數
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
GROUP BY t.name ORDER BY t.name;
