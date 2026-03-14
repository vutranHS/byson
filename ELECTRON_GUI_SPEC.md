# Electron MongoDB GUI - Full Specification

> Clone lại Robo3T bằng Electron + React + Node.js MongoDB driver.  
> Hỗ trợ MongoDB **4.4, 5.x, 6.x, 7.x, 8.x** chính thức.

---

## 0. Background & Context

### Tại sao build cái này?
- **Robo3T** (GUI MongoDB phổ biến) đã ngừng phát triển và **không hỗ trợ MongoDB 5.0+** vì dùng driver C++ cũ bị lock ở wire protocol cũ
- Thay vì patch C++, quyết định **viết lại hoàn toàn bằng Electron + Node.js** vừa dễ maintain, vừa support mọi version MongoDB mới

### Quyết định kỹ thuật quan trọng
- **KHÔNG dùng mongosh** làm backend chính vì mongosh 2.x chỉ officially support MongoDB 7.0+ (không chắc với 4.4)
- **Dùng `mongodb` npm driver v6** — chính thức support 4.4 → 8.x, đây là driver mà MongoDB Compass (GUI chính thức) dùng
- **KHÔNG dùng TypeScript** — dùng plain JavaScript/CommonJS (React với .jsx files)
- **THIẾT KẾ**: Phong cách hiện đại (Modern UI), hỗ trợ Dark Mode, animation mượt mà, không dùng UI kiểu cổ điển của Robo3T.
- **MONGOSH**: Sẽ được **bundle trực tiếp** vào bộ cài để đảm bảo "chạy ngay trên máy trắng" (Out of the box).

### Project Location
```
~/Projects/mongo-gui/
```
*(Tạo ở bất kỳ đâu trên máy)*

### Current Status
- ✅ Spec đã hoàn thiện
- ✅ UI đã phân tích từ những screenshots của Robo3T gốc → lưu trong `docs/screenshots/`
- ⬜ **Chưa viết dòng code nào** — bắt đầu từ Phase 1

### UI Screenshots Reference (Trong lịch sử chat)
> 🖼️ **Gửi AI mới**: Hãy xem các ảnh mà User đã chụp trong lịch sử chat này để hiểu layout và style của Robo3T:
> - **Lượt chat 691**: Danh sách Connection, Tab Connection, Tab Authentication.
> - **Lượt chat 697**: Context menu Database, Shell Tab, Tab TLS, Context menu Collection.
> - **Lượt chat 700**: Tab SSH.

| Image Content | Mô tả chi tiết cho AI |
|---------------|-----------------------|
| **Connection Manager** | Bảng 4 cột, badge "SSH" cho server có tunnel, nút Connect màu xanh (macOS style). |
| **Settings Dialog** | 5 tabs, thiết kế form gọn gàng, có nút "Test" ở góc dưới trái. |
| **Main Layout** | Sidebar TreeView (trái), Tabs Query (phải), Results (dưới Query editor) có toggle Tree/Table/JSON. |
| **Tree/Table/JSON** | Tree view có data types (badges: ObjectId, String, v.v.). Table có header tự động. |
| **Context Menus** | Rất nhiều options quản lý DB/Collection (Drop, Repair, Stat, v.v.). |

### Cách tiếp tục (cho AI mới)
> 1. Đọc kỹ file spec này (`ELECTRON_GUI_SPEC.md`) để hiểu logic & tech stack.
> 2. Kéo lên xem lại 11 screenshots trong lịch sử chat để nắm GUI.
> 3. Bắt đầu **Phase 1** (Project Init) trong mục `## 9. Development Phases`.
> 4. Tuyệt đối: **KHÔNG TypeScript, KHÔNG C++, KHÔNG nhầm lẫn mongosh là driver chính.**
> 5. Dùng Node.js `mongodb` driver làm core kết nối.

---

## 1. Tech Stack

| Layer | Technology | Lý do |
|-------|-----------|-------|
| App shell | **Electron 28+** | Cross-platform desktop |
| UI | **React 18 + CommonJS** | Component-based, dễ đọc |
| Build | **electron-vite** | Fast HMR, Vite-based |
| Editor | **Monaco Editor** | Giống VS Code, syntax highlight |
| DB driver | **`mongodb` npm v6** | Official driver, hỗ trợ 4.4–8.x guaranteed |
| State | **Zustand** | Lightweight, no boilerplate |
| SSH tunnel | **`ssh2` npm** | Pure JS SSH implementation |
| Packaging | **electron-builder** | → `.dmg` (macOS), `.exe` (Win), `.AppImage` (Linux) |
| Binary | **`mongosh` bundled** | Support chạy ngay trên máy mới |
| Storage | **JSON file** (userData dir) | Lưu connections, settings |

### Tại sao `mongodb` npm driver thay vì mongosh?
- Chính thức hỗ trợ MongoDB **4.4, 5.0, 6.0, 7.0, 8.0** (có compatibility matrix)
- Không cần bundle thêm binary (~5MB vs ~30MB)
- MongoDB Compass (GUI chính thức của MongoDB) dùng đúng driver này
- Ít lỗi bất ngờ hơn, pure JavaScript

### Shell tab (phụ)
- Shell tab dùng `mongosh` nếu user đã cài, hoặc disabled nếu không có
- Feature phụ, không ảnh hưởng chức năng chính

### 1.1 Persistence & Security (Lưu trữ)
- **Lưu ở đâu?**: Sử dụng thư mục `app.getPath('userData')`. 
  - macOS: `~/Library/Application Support/MongoGUI/`
  - Windows: `%APPDATA%\MongoGUI\`
- **File lưu trữ**: `connections.json` lưu danh sách connection profiles.
- **Persistence**: Khi app khởi động, main process sẽ đọc file này và gửi lên Renderer qua IPC `storage:getConnections`. 
- **Auto-save**: Mọi thay đổi (Add/Edit/Delete/Reorder) đều gọi `storage:saveConnections` để ghi đè ngay lập tức vào file JSON.

---

## 2. Project Structure

```
mongo-gui/
├── electron/
│   ├── main.js              ← Electron entry, window management
│   ├── preload.js           ← IPC bridge expose
│   └── ipc/
│       ├── db.js            ← MongoDB driver operations
│       ├── ssh.js           ← SSH tunnel management
│       ├── storage.js       ← connections.json read/write
│       └── shell.js         ← Shell tab (mongosh spawn)
├── src/
│   ├── App.jsx
│   ├── store/
│   │   └── useAppStore.js   ← Zustand global state
│   ├── components/
│   │   ├── ConnectionManager/
│   │   │   ├── index.jsx    ← Modal danh sách connections
│   │   │   └── ConnectionRow.jsx
│   │   ├── ConnectionDialog/
│   │   │   ├── index.jsx    ← Modal 5 tabs settings
│   │   │   ├── TabConnection.jsx
│   │   │   ├── TabAuthentication.jsx
│   │   │   ├── TabSSH.jsx
│   │   │   ├── TabTLS.jsx
│   │   │   └── TabAdvanced.jsx
│   │   ├── Sidebar/
│   │   │   ├── index.jsx    ← DB/Collection tree
│   │   │   ├── ServerNode.jsx
│   │   │   ├── DatabaseNode.jsx
│   │   │   └── CollectionNode.jsx
│   │   ├── QueryTabs/
│   │   │   ├── index.jsx    ← Tab bar + contents
│   │   │   ├── QueryTab.jsx ← Editor + results
│   │   │   └── ShellTab.jsx ← Shell terminal
│   │   └── Results/
│   │       ├── TreeView.jsx
│   │       ├── TableView.jsx
│   │       └── JsonView.jsx
├── electron-builder.yml
└── package.json
```

---

## 3. Data Models (Plain JS Objects)

### Connection

```js
// connections.json - mỗi connection là 1 object
{
  id: '',           // uuid
  name: '',         // Tên hiển thị
  type: '',         // 'direct' | 'replica'
  host: '',
  port: 27017,

  auth: {
    enabled: false,
    database: 'admin',
    username: '',
    password: '',
    mechanism: 'SCRAM-SHA-1'  // hoặc SCRAM-SHA-256, DEFAULT
  },

  ssh: {
    enabled: false,
    host: '',
    port: 22,
    username: '',
    authMethod: 'password',   // hoặc 'key'
    password: '',
    keyPath: '',              // đường dẫn private key file
    passphrase: '',
    askPassphrase: false
  },

  tls: {
    enabled: false,
    authMethod: 'ca',         // 'self-signed' | 'ca'
    caPath: '',
    usePem: false,
    pemPath: '',
    crlPath: '',
    invalidHostnames: 'not-allowed'
  }
}
```

### QueryTab (in-memory state)

```js
{
  id: '',
  type: 'query',     // 'query' | 'shell'
  connectionId: '',
  database: '',
  collection: '',
  query: '',         // Nội dung editor
  results: [],
  execTime: 0,       // ms
  skip: 0,
  limit: 50,
  viewMode: 'table'  // 'tree' | 'table' | 'json'
}
```

---

## 4. UI Screens & Features

### 4.1 Connection Manager (Modal)

```
┌──────────────────────────────────────────────────────┐
│            MongoDB Connections                        │
├──────────────────────────────────────────────────────┤
│ [Create] [Edit] [Remove] [Clone]                     │
│ ─────────────────────────────────────────────────── │
│  Name          Address          Attributes  Auth      │
│  abc       localhost:27017  SSH                   │
│  deff      localhost:27017  SSH                   │
│  ● uhn   localhost:27017  SSH          ← selected│
├──────────────────────────────────────────────────────┤
│                          [Cancel]  [Connect]          │
└──────────────────────────────────────────────────────┘
```

**Features:**
- List connections từ `connections.json`
- Double-click → connect ngay
- Drag & drop reorder
- Badge "SSH" nếu SSH enabled
- Right-click row → Edit / Remove / Clone

---

### 4.2 Connection Settings Dialog (5 Tabs)

#### Tab 1: Connection
| Field | Type | Default |
|-------|------|---------|
| Type | select | Direct Connection / Replica Set |
| Name | text | "New Connection" |
| Host | text | localhost |
| Port | number | 27017 |
| From URI | text input + Parse button | — |

#### Tab 2: Authentication
| Field | Type | Default |
|-------|------|---------|
| Perform authentication | checkbox | false |
| Database | text | admin |
| User Name | text | — |
| Password | password + toggle | — |
| Auth Mechanism | select | SCRAM-SHA-1 |
| Manually specify visible databases | checkbox | false |

#### Tab 3: SSH
| Field | Type | Default |
|-------|------|---------|
| Use SSH tunnel | checkbox | false |
| SSH Address | host:port | — : 22 |
| SSH User Name | text | — |
| SSH Auth Method | select | Password / Private Key |
| Private Key | file path + browse | — |
| Passphrase | password + toggle | — |
| Ask for passphrase each time | checkbox | false |

#### Tab 4: TLS
| Field | Type | Default |
|-------|------|---------|
| Use TLS protocol | checkbox | false |
| Authentication Method | select | Self-signed / Use CA Certificate |
| CA Certificate | file path + browse | — |
| Use PEM Cert/Key | checkbox | false |
| Advanced Options → CRL | file path + browse | — |
| Invalid Hostnames | select | Not Allowed / Allowed |

#### Tab 5: Advanced
*(Để trống, implement sau nếu cần)*

**Buttons:** `[! Test]` `[Cancel]` `[Save]`

---

### 4.3 Main Window Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔲 📁 💾 ▶ ⟳                                              Robo3T   │  ← Toolbar
├──────────────┬──────────────────────────────────────────────────────┤
│              │ [× query1] [× query2] [× New Shell]   ← Tabs         │
│  DB Tree     │ Connection > localhost:27017 > database  ← Breadcrumb │
│  ─────────   │ ┌───────────────────────────────────────────────┐    │
│  ▼ Connection │ │ db.getCollection('homes').find({})            │    │
│    ▼ home    │ └───────────────────────────────────────────────┘    │
│      Collections│ ◄  0  [50] ►        🌲 📋 📄  ← view toggles     │
│        cards │ ┌───────────────────────────────────────────────┐    │
│        homes │ │                                               │    │
│        ...   │ │           Results Panel                       │    │
│      Functions│ │                                               │    │
│      Users   │ └───────────────────────────────────────────────┘    │
│              │                                                        │
├──────────────┴──────────────────────────────────────────────────────┤
│ [Logs]                                                               │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 4.4 Context Menus

#### Right-click trên Connection node
```
Open Shell
Refresh
────────────────
Create Database
Server Status
Host Info
MongoDB Version
────────────────
Show Log
Disconnect
```

#### Right-click trên Database node
```
Open Shell
Refresh
────────────────
Database Statistics
Current Operations
Kill Operation...
────────────────
Repair Database...
Drop Database...
```

#### Right-click trên Collection node
```
View Documents
────────────────
Insert Document...
Update Documents...
Remove Documents...
Remove All Documents...
────────────────
Rename Collection...
Duplicate Collection...
Drop Collection...
────────────────
Statistics
Shard Version
Shard Distribution
```

---

### 4.5 Results Panel

#### Tree View
```
▼ (1) ObjectId("675ab7...") { 12 fields }
    _id          ObjectId("675ab750...")      ObjectId
    phone        090xxxxxxx                   String
    __v          0                            Int32
    createdAt    2024-12-12 10:13:36.084Z     Date
    token        eyJhb...                     String
▼ (2) ObjectId("675ab8...") { 12 fields }
    ...
```

#### Table View
```
| # | _id        | phone       | status | point | dailyCompleted |
|---|-----------|-------------|--------|-------|----------------|
| 1 | ObjectId...| 090xxxxxxx | ready  | 4600  | true           |
| 2 | ObjectId...| 090xxxxxxx | ready  | 1550  | true           |
```

#### JSON View
```json
[
  {
    "_id": { "$oid": "675ab750619b3bd32c3ee47f" },
    "phone": "090xxxxxxx",
    "status": "ready"
  }
]
```

#### Type Badges
| Badge | Color | MongoDB Type |
|-------|-------|-------------|
| `ObjectId` | orange | ObjectId |
| `String` | blue | String |
| `Int32` | green | Int32/Int64 |
| `Date` | red/calendar | Date |
| `Boolean` | purple | Boolean |
| `Object` | gray | Nested object |
| `Array` | teal | Array |

---

### 4.6 Shell Tab

- Dark Monaco Editor (full screen trong tab)
- Breadcrumb: Connection > host > database
- Spawn `mongosh` process nếu available
- Nếu không có mongosh: hiển thị message hướng dẫn cài

---

## 5. IPC API (Main ↔ Renderer)

```js
// Renderer calls → Main handles (plain JS)
ipcMain.handle('db:connect', (_, conn) => { ... })         // conn = Connection object
ipcMain.handle('db:disconnect', (_, connId) => { ... })
ipcMain.handle('db:listDatabases', (_, connId) => { ... })  // returns string[]
ipcMain.handle('db:listCollections', (_, connId, dbName) => { ... })
ipcMain.handle('db:runQuery', (_, connId, db, query, skip, limit) => { ... }) // returns { docs, total, time }
ipcMain.handle('db:serverStatus', (_, connId) => { ... })
ipcMain.handle('db:createDatabase', (_, connId, name) => { ... })
ipcMain.handle('db:dropDatabase', (_, connId, name) => { ... })
ipcMain.handle('db:createCollection', (_, connId, db, name) => { ... })
ipcMain.handle('db:dropCollection', (_, connId, db, name) => { ... })
ipcMain.handle('db:renameCollection', (_, connId, db, from, to) => { ... })
ipcMain.handle('db:insertDocument', (_, connId, db, coll, doc) => { ... })
ipcMain.handle('db:testConnection', (_, conn) => { ... }) // returns { ok, version }

// Storage
ipcMain.handle('storage:getConnections', () => { ... })    // returns Connection[]
ipcMain.handle('storage:saveConnections', (_, conns) => { ... })
```

### 5.1 Query Engine (Xử lý Aggregate, Find & Method Chaining)

Để hỗ trợ cú pháp giống Robo3T / mongosh (vd: `db.coll.find({}).sort({...}).limit(10)`) mà vẫn dùng Node.js driver, Main process sẽ thực hiện:

1.  **Chaining Parser**: Sử dụng parser để tách chuỗi lệnh thành các phần:
    *   **Gốc**: `db.collection('name')` hoặc `db.getCollection('name')`
    *   **Hàm chính**: `find(...)` hoặc `aggregate(...)`
    *   **Chaining**: `.sort(...)`, `.limit(...)`, `.skip(...)`, `.project(...)`, `.count()`
2.  **Cơ chế thực thi**:
    *   Main process sẽ dùng `vm.runInContext` (sandbox) hoặc parser để chuyển đổi chuỗi string thành một "Query Object" trung gian.
    *   Sau đó map các Key sang hàm của Node.js driver:
        ```js
        // Nếu user gõ: db.homes.find({}).sort({createdAt:1}).limit(100)
        // Hệ thống sẽ thực thi:
        const cursor = db.collection('homes').find({});
        cursor.sort({createdAt:1});
        cursor.limit(Math.min(limit_thu_cong, limit_UI)); // Ưu tiên cái nhỏ hơn hoặc logic phân trang
        ```
3.  **Xử lý Xung đột Phân trang**:
    *   Nếu user gõ `.limit(100)` thủ công nhưng UI đang chọn "50 per page", hệ thống sẽ ưu tiên lệnh thủ công của user cho lần chạy đó.
    *   **Với Aggregate và pipeline array**:
        ```js
        // Nếu user gõ:
        db.transactions.aggregate([ { $group: { _id: "$name", count: { $sum: 1 } } } ])

        // Hệ thống sẽ parse pipeline và thực thi qua driver:
        const pipeline = [ { $group: { _id: "$name", count: { $sum: 1 } } } ];
        // Tự chèn phân trang nếu cần:
        pipeline.push({ $skip: skip }, { $limit: limit });
        const docs = await db.collection('transactions').aggregate(pipeline).toArray();
        ```
4.  **JSON Support**: Hỗ trợ Shell-style JSON (ObjectId, ISODate) bằng cách dùng `mongodb-query-parser` hoặc `bson` EJSON để user không phải viết chuẩn JSON nghiêm ngặt.

---

## 6. SSH Tunnel Flow

```
1. Tạo SSH connection tới jump server (ssh2)
2. Forward local port (random) → MongoDB host:27017
3. mongodb driver connect tới localhost:{localPort}
4. Khi disconnect → đóng SSH tunnel
```

```js
// Pseudocode
const tunnel = await createSSHTunnel(sshConfig)
const localPort = tunnel.localPort  // e.g. 37019
const client = new MongoClient(`mongodb://localhost:${localPort}`)
```

---

## 7. MongoDB Version Compatibility

| MongoDB Version | Status | Notes |
|----------------|--------|-------|
| 4.4 | ✅ | Officially supported by driver v6 |
| 5.0 | ✅ | Officially supported |
| 6.0 | ✅ | Officially supported |
| 7.0 | ✅ | Officially supported |
| 8.0 | ✅ | Officially supported |

Driver: `mongodb` npm v6 — same driver used by MongoDB Compass.

---

## 8. Build & Distribution

### 8.1 Dev & Build commands

```bash
npm run dev       # Electron hot-reload (dev mode)
npm run build     # Vite bundle (renderer + main)
npm run dist      # electron-builder → tạo installer
npm run dist:mac  # macOS only
npm run dist:win  # Windows only
npm run dist:linux # Linux only
```

### 8.2 electron-builder Config (đầy đủ 3 platforms)

```yaml
# electron-builder.yml
appId: com.yourname.mongogui
productName: MongoGUI
copyright: Copyright © 2025

# ──────────────────────────────
# macOS
# ──────────────────────────────
mac:
  category: public.app-category.developer-tools
  target:
    - target: dmg      # → MongoGUI-1.0.0.dmg
      arch: [x64, arm64]  # Intel + Apple Silicon (M1/M2/M3)
  icon: assets/icon.icns
  hardenedRuntime: true
  gatekeeperAssess: false

dmg:
  title: MongoGUI ${version}
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications

# ──────────────────────────────
# Windows
# ──────────────────────────────
win:
  target:
    - target: nsis     # → MongoGUI Setup 1.0.0.exe
      arch: [x64]
  icon: assets/icon.ico

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true

# ──────────────────────────────
# Linux
# ──────────────────────────────
linux:
  target:
    - target: AppImage  # → MongoGUI-1.0.0.AppImage (universal)
      arch: [x64]
    - target: deb       # → mongogui_1.0.0_amd64.deb (Ubuntu/Debian)
    - target: rpm       # → mongogui-1.0.0.x86_64.rpm (Fedora/RHEL)
  category: Development
  icon: assets/icon.png

# ──────────────────────────────
# Auto Update (GitHub Releases)
# ──────────────────────────────
publish:
  provider: github
  owner: your-github-username
  repo: mongo-gui

directories:
  output: dist
  buildResources: assets
```

### 8.3 Output Files

```
dist/
├── mac/
│   ├── MongoGUI-1.0.0-arm64.dmg      ← macOS Apple Silicon (M1/M2/M3)
│   ├── MongoGUI-1.0.0-x64.dmg        ← macOS Intel
│   └── MongoGUI-1.0.0-mac.zip        ← macOS zip (dùng cho auto-update)
├── win/
│   └── MongoGUI Setup 1.0.0.exe      ← Windows installer
└── linux/
    ├── MongoGUI-1.0.0.AppImage        ← Linux universal (chạy thẳng)
    ├── mongogui_1.0.0_amd64.deb      ← Debian/Ubuntu
    └── mongogui-1.0.0.x86_64.rpm    ← Fedora/RHEL
```

### 8.4 Auto Update (electron-updater)

Dùng package `electron-updater` + GitHub Releases làm update server (miễn phí).

**Flow:**
```
App khởi động → check GitHub Releases API → có version mới?
  → Có: hiển thị dialog "Update available vX.Y.Z" → [Download & Install Later] [Restart Now]
  → Không: tiếp tục bình thường
```

**Install:**
```bash
npm install electron-updater
```

**Code trong `electron/main.js`:**
```js
const { autoUpdater } = require('electron-updater')

// Khi app ready
autoUpdater.checkForUpdatesAndNotify()

// Tùy chỉnh dialog
autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox({
    message: `Version ${info.version} available. Downloading...`
  })
})

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    message: 'Update ready. Restart to apply?',
    buttons: ['Restart', 'Later']
  }).then(result => {
    if (result.response === 0) autoUpdater.quitAndInstall()
  })
})
```

**Release flow (GitHub):**
```bash
# 1. Tăng version trong package.json
npm version patch   # 1.0.0 → 1.0.1

# 2. Build và publish lên GitHub Releases tự động
npm run dist -- --publish always

# 3. electron-builder tự động:
#    - Upload file lên GitHub Releases
#    - Tạo latest.yml (macOS), latest.yml (Windows), latest-linux.yml
#    - App users sẽ tự detect khi mở app lần sau
```

### 8.5 Code Signing (Production)

| Platform | Yêu cầu | Tool |
|----------|--------|------|
| **macOS** | Apple Developer certificate ($99/năm) | `codesign` + `notarytool` |
| **Windows** | Code signing cert (~$200/năm) hoặc Microsoft Store | SignTool |
| **Linux** | Không cần ký | — |

> **Dev/testing**: Bỏ qua signing, build sẽ vẫn chạy được nhưng macOS sẽ warn "unidentified developer"  
> **Production**: Cần ký để tránh macOS Gatekeeper block và Windows SmartScreen warning

```yaml
# Thêm vào electron-builder.yml khi có cert
mac:
  identity: "Developer ID Application: Your Name (TEAMID)"
  notarize: true
```

---

## 9. Development Phases

### Phase 1 — Core (MVP)
- [ ] Project init (electron-vite + React + CommonJS)
- [ ] Connection Manager modal
- [ ] Connection Settings dialog (tabs: Connection, Auth, SSH, TLS)
- [ ] Test connection button
- [ ] Connect → DB/Collection tree
- [ ] Query Editor (Monaco)
- [ ] Run query → Results Table view
- [ ] Multi-tab support
- [ ] Pagination

### Phase 2 — Essential
- [ ] Results Tree view (expandable)
- [ ] Results JSON view
- [ ] Type badges
- [ ] Context menus (DB, Collection)
- [ ] Insert / Drop / Rename collection
- [ ] Breadcrumb navigation
- [ ] Execution time display

### Phase 3 — Advanced
- [ ] Shell tab (mongosh)
- [ ] SSH tunnel
- [ ] TLS/SSL
- [ ] Server Status / Host Info dialog
- [ ] Logs panel
- [ ] Drag & drop reorder connections
- [ ] electron-builder packaging → .dmg

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| MongoDB 4.4 quirks | Test với docker image `mongo:4.4` |
| SSH tunnel port conflicts | Auto-pick random free port |
| mongosh not installed | Gracefully disable Shell tab, show install guide |
| Large result sets | Virtualized list (react-window) |
| TLS cert paths on different OS | Use `app.getPath('userData')` as base |
