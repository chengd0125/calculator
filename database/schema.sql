-- ============================================
-- 批發商業務管理系統 - 資料庫建立腳本
-- MS SQL Server
-- ============================================

USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'WholesaleDB')
BEGIN
    CREATE DATABASE WholesaleDB;
    PRINT N'資料庫 WholesaleDB 建立完成';
END
GO

USE WholesaleDB;
GO

-- ============================================
-- 商品資料表
-- ============================================
IF OBJECT_ID('Products', 'U') IS NULL
CREATE TABLE Products (
    ProductID   INT            PRIMARY KEY IDENTITY(1,1),
    Barcode     NVARCHAR(50),
    ProductName NVARCHAR(200)  NOT NULL,
    Unit        NVARCHAR(20)   DEFAULT N'個',
    CostPrice   DECIMAL(10,2)  DEFAULT 0,
    SalePrice   DECIMAL(10,2)  DEFAULT 0,
    Stock       INT            DEFAULT 0,
    Category    NVARCHAR(100),
    IsActive    BIT            DEFAULT 1,
    CreatedAt   DATETIME       DEFAULT GETDATE(),
    UpdatedAt   DATETIME       DEFAULT GETDATE()
);
GO

IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'IX_Products_Barcode')
    CREATE UNIQUE INDEX IX_Products_Barcode ON Products(Barcode) WHERE Barcode IS NOT NULL;
GO

-- ============================================
-- 員工資料表
-- ============================================
IF OBJECT_ID('Employees', 'U') IS NULL
CREATE TABLE Employees (
    EmployeeID   INT           PRIMARY KEY IDENTITY(1,1),
    Username     NVARCHAR(50)  NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    FullName     NVARCHAR(100) NOT NULL,
    -- 角色: admin=管理員, sales=業務, warehouse=倉庫
    Role         NVARCHAR(20)  DEFAULT N'sales',
    Phone        NVARCHAR(20),
    IsActive     BIT           DEFAULT 1,
    CreatedAt    DATETIME      DEFAULT GETDATE()
);
GO

-- ============================================
-- 客戶資料表
-- ============================================
IF OBJECT_ID('Customers', 'U') IS NULL
CREATE TABLE Customers (
    CustomerID   INT           PRIMARY KEY IDENTITY(1,1),
    CustomerCode NVARCHAR(20),
    CompanyName  NVARCHAR(200) NOT NULL,
    ContactName  NVARCHAR(100),
    Phone        NVARCHAR(20),
    Mobile       NVARCHAR(20),
    Address      NVARCHAR(300),
    TaxID        NVARCHAR(20),
    CreditLimit  DECIMAL(10,2) DEFAULT 0,
    Notes        NVARCHAR(MAX),
    IsActive     BIT           DEFAULT 1,
    CreatedAt    DATETIME      DEFAULT GETDATE()
);
GO

IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'IX_Customers_Code')
    CREATE UNIQUE INDEX IX_Customers_Code ON Customers(CustomerCode) WHERE CustomerCode IS NOT NULL;
GO

-- ============================================
-- 訂單主檔
-- ============================================
IF OBJECT_ID('Orders', 'U') IS NULL
CREATE TABLE Orders (
    OrderID     INT           PRIMARY KEY IDENTITY(1,1),
    OrderNo     NVARCHAR(20)  NOT NULL UNIQUE,
    OrderDate   DATETIME      DEFAULT GETDATE(),
    CustomerID  INT           NOT NULL,
    EmployeeID  INT           NOT NULL,
    -- 狀態: pending=待處理, picking=撿貨中, completed=完成, cancelled=取消
    Status      NVARCHAR(20)  DEFAULT N'pending',
    TotalAmount DECIMAL(10,2) DEFAULT 0,
    Notes       NVARCHAR(MAX),
    CreatedAt   DATETIME      DEFAULT GETDATE(),
    UpdatedAt   DATETIME      DEFAULT GETDATE(),
    CONSTRAINT FK_Orders_Customer FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID),
    CONSTRAINT FK_Orders_Employee FOREIGN KEY (EmployeeID) REFERENCES Employees(EmployeeID)
);
GO

-- ============================================
-- 訂單明細
-- ============================================
IF OBJECT_ID('OrderItems', 'U') IS NULL
CREATE TABLE OrderItems (
    ItemID      INT           PRIMARY KEY IDENTITY(1,1),
    OrderID     INT           NOT NULL,
    ProductID   INT,
    Barcode     NVARCHAR(50),
    ProductName NVARCHAR(200) NOT NULL,
    Unit        NVARCHAR(20),
    Quantity    INT           NOT NULL DEFAULT 1,
    UnitPrice   DECIMAL(10,2) DEFAULT 0,
    Amount      DECIMAL(10,2) DEFAULT 0,
    PickedQty   INT           DEFAULT 0,
    CONSTRAINT FK_OrderItems_Order   FOREIGN KEY (OrderID)   REFERENCES Orders(OrderID),
    CONSTRAINT FK_OrderItems_Product FOREIGN KEY (ProductID) REFERENCES Products(ProductID)
);
GO


-- ============================================
-- 範例商品資料
-- ============================================
IF NOT EXISTS (SELECT 1 FROM Products)
BEGIN
    INSERT INTO Products (Barcode, ProductName, Unit, CostPrice, SalePrice, Stock, Category) VALUES
    ('4710088001234', N'統一麵 肉骨茶口味 24包', N'箱', 280, 320, 100, N'泡麵'),
    ('4710088005678', N'統一麵 雞汁口味 24包',   N'箱', 280, 320,  80, N'泡麵'),
    ('4714635000001', N'黑松汽水 600ml 24罐',    N'箱', 180, 220, 200, N'飲料'),
    ('4714635000002', N'黑松沙士 600ml 24罐',    N'箱', 180, 220, 150, N'飲料'),
    ('4710412345001', N'光泉鮮乳 1000ml 6瓶',    N'箱', 320, 380,  60, N'乳製品'),
    ('4710888123456', N'維力炸醬麵 5包',          N'袋',  55,  70, 300, N'泡麵'),
    ('4719906001234', N'金車伯朗咖啡 240ml 24罐', N'箱', 320, 400, 120, N'飲料');
    PRINT N'範例商品資料匯入完成';
END
GO

-- ============================================
-- 範例客戶資料
-- ============================================
IF NOT EXISTS (SELECT 1 FROM Customers)
BEGIN
    INSERT INTO Customers (CustomerCode, CompanyName, ContactName, Phone, Mobile, Address, TaxID) VALUES
    ('C001', N'大發超商',     N'王大明', '04-22222222', '0912-345678', N'台中市西區民生路1號',   '12345678'),
    ('C002', N'幸福雜貨店',   N'李小美', '04-33333333', '0923-456789', N'台中市北區精武路100號', '23456789'),
    ('C003', N'快樂便利店',   N'張三豐', '04-44444444', '0934-567890', N'台中市南區建國路50號',  '34567890'),
    ('C004', N'日日新鮮超市', N'林佳慧', '04-55555555', '0945-678901', N'台中市東區十甲路20號',  '45678901');
    PRINT N'範例客戶資料匯入完成';
END
GO

-- ============================================
-- 退貨主檔
-- ============================================
IF OBJECT_ID('Returns', 'U') IS NULL
CREATE TABLE Returns (
    ReturnID    INT           PRIMARY KEY IDENTITY(1,1),
    ReturnNo    NVARCHAR(20)  NOT NULL UNIQUE,
    ReturnDate  DATETIME      DEFAULT GETDATE(),
    CustomerID  INT           NOT NULL,
    EmployeeID  INT           NOT NULL,
    -- 狀態: pending=待確認, completed=已完成, cancelled=取消
    Status      NVARCHAR(20)  DEFAULT N'pending',
    TotalAmount DECIMAL(10,2) DEFAULT 0,
    Notes       NVARCHAR(MAX),
    CreatedAt   DATETIME      DEFAULT GETDATE(),
    UpdatedAt   DATETIME      DEFAULT GETDATE(),
    CONSTRAINT FK_Returns_Customer FOREIGN KEY (CustomerID) REFERENCES Customers(CustomerID),
    CONSTRAINT FK_Returns_Employee FOREIGN KEY (EmployeeID) REFERENCES Employees(EmployeeID)
);
GO

-- ============================================
-- 退貨明細
-- ============================================
IF OBJECT_ID('ReturnItems', 'U') IS NULL
CREATE TABLE ReturnItems (
    ItemID      INT           PRIMARY KEY IDENTITY(1,1),
    ReturnID    INT           NOT NULL,
    ProductID   INT,
    Barcode     NVARCHAR(50),
    ProductName NVARCHAR(200) NOT NULL,
    Unit        NVARCHAR(20),
    Quantity    INT           NOT NULL DEFAULT 1,
    UnitPrice   DECIMAL(10,2) DEFAULT 0,
    Amount      DECIMAL(10,2) DEFAULT 0,
    CONSTRAINT FK_ReturnItems_Return   FOREIGN KEY (ReturnID)   REFERENCES Returns(ReturnID),
    CONSTRAINT FK_ReturnItems_Product  FOREIGN KEY (ProductID)  REFERENCES Products(ProductID)
);
GO

-- ============================================
-- 系統設定
-- ============================================
IF OBJECT_ID('SystemSettings', 'U') IS NULL
BEGIN
    CREATE TABLE SystemSettings (
        SettingKey   NVARCHAR(100) PRIMARY KEY,
        SettingValue NVARCHAR(MAX) DEFAULT '',
        UpdatedAt    DATETIME      DEFAULT GETDATE()
    );
    INSERT INTO SystemSettings (SettingKey, SettingValue) VALUES
    (N'COMPANY_NAME',    N'您的公司名稱'),
    (N'COMPANY_PHONE',   N''),
    (N'COMPANY_ADDRESS', N'');
END
GO

-- 新增登入時間欄位（已存在則略過）
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Employees') AND name = 'LastLoginAt')
    ALTER TABLE Employees ADD LastLoginAt DATETIME NULL;
GO

-- 商品建立者 / 修改者（已存在則略過）
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'CreatedBy')
    ALTER TABLE Products ADD CreatedBy INT NULL REFERENCES Employees(EmployeeID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Products') AND name = 'UpdatedBy')
    ALTER TABLE Products ADD UpdatedBy INT NULL REFERENCES Employees(EmployeeID);
GO

-- 新增退貨權限（業務預設開放開單，倉庫預設關閉）
IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE Permission = 'return_add')
BEGIN
    INSERT INTO RolePermissions (Role, Permission, IsAllowed) VALUES
    ('sales',     'return_add',    1),
    ('warehouse', 'return_add',    0),
    ('sales',     'return_edit',   0),
    ('warehouse', 'return_edit',   1),
    ('sales',     'return_delete', 0),
    ('warehouse', 'return_delete', 0);
END

-- 新增系統設定權限（業務/倉庫預設關閉）
IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE Permission = 'settings_edit')
BEGIN
    INSERT INTO RolePermissions (Role, Permission, IsAllowed) VALUES
    ('sales',     'settings_edit', 0),
    ('warehouse', 'settings_edit', 0);
END
GO

-- 新增員工管理權限（業務/倉庫預設關閉）
IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE Permission = 'employee_view')
BEGIN
    INSERT INTO RolePermissions (Role, Permission, IsAllowed) VALUES
    ('sales',     'employee_view',   0),
    ('warehouse', 'employee_view',   0),
    ('sales',     'employee_add',    0),
    ('warehouse', 'employee_add',    0),
    ('sales',     'employee_edit',   0),
    ('warehouse', 'employee_edit',   0),
    ('sales',     'employee_delete', 0),
    ('warehouse', 'employee_delete', 0);
END
GO

PRINT N'============================';
PRINT N'資料庫初始化完成！';
PRINT N'預設帳號: admin';
PRINT N'預設密碼: admin123';
PRINT N'============================';
