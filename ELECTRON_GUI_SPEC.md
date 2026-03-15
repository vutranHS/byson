# LeafBase - Full Specification

> A modern MongoDB GUI built with Electron + React + Node.js MongoDB driver.

---

## 0. Background & Context

### Why build this?
- Many existing MongoDB GUIs are either outdated, bloated, or lack support for modern MongoDB features (5.0+).
- LeafBase is a fresh, modern implementation designed to provide a lightweight yet powerful interface using the official Node.js driver.

### Key Technical Decisions
- **NO `mongosh` as primary backend**: `mongosh` 2.x only officially supports MongoDB 7.0+ (compatibility with 4.4 is uncertain).
- **Using `mongodb` Node.js Driver v6**: Officially supports 4.4 → 8.x. This is the same driver power by MongoDB Compass (the official GUI).
- **Plain JavaScript**: No TypeScript — uses standard JavaScript/CommonJS (React with .jsx files) for maximum accessibility.
- **Design Philosophy**: Modern UI with Dark Mode support, smooth animations, moving away from Robo3T's classic 90s aesthetic.
- **Bundled Shell**: `mongosh` will be **bundled directly** in the installer for an "out-of-the-box" experience.

### Project Status
- ✅ Specification finalized.
- ✅ Modern UI architecture implemented.
- ✅ Backend driver integration complete.

---

## 1. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| App shell | **Electron 28+** | Cross-platform desktop support |
| UI | **React 18 + CommonJS** | Component-based, maintainable |
| Build | **electron-vite** | Fast HMR, modern build pipeline |
| Editor | **Monaco Editor** | VS Code heritage, rich syntax support |
| DB driver | **`mongodb` Node.js v6** | Official driver, 4.4–8.x guaranteed support |
| State | **Zustand** | Lightweight, high-performance state management |
| SSH tunnel | **`ssh2` npm** | Native JavaScript SSH implementation |
| Packaging | **electron-builder** | Target `.dmg`, `.exe`, `.AppImage` |
| Binary | **`mongosh` bundled** | Ready to run on any machine |
| Storage | **JSON file** (userData) | Persists connections and settings |

---

## 2. Project Structure

```
mongo-gui/
├── electron/
│   ├── main.js              ← Electron entry, window management
│   ├── preload.js           ← IPC bridge exposure
│   └── ipc/
│       ├── db.js            ← MongoDB driver operations
│       ├── ssh.js           ← SSH tunnel management
│       ├── storage.js       ← Persistence (connections.json)
│       └── shell.js         ← Shell tab management
├── src/
│   ├── App.jsx
│   ├── store/
│   │   └── useAppStore.js   ← Global state
│   ├── components/
│   │   ├── ConnectionManager/
│   │   │   ├── index.jsx    ← Connection List Modal
│   │   │   └── ConnectionRow.jsx
│   │   ├── ConnectionDialog/
│   │   │   ├── index.jsx    ← 5-tab Settings Modal
│   │   │   ├── TabConnection.jsx
│   │   │   ├── TabAuthentication.jsx
│   │   │   ├── TabSSH.jsx
│   │   │   ├── TabTLS.jsx
│   │   │   └── TabAdvanced.jsx
│   │   ├── Sidebar/
│   │   │   ├── index.jsx    ← Database/Collection Tree
│   │   │   ├── ServerNode.jsx
│   │   │   ├── DatabaseNode.jsx
│   │   │   └── CollectionNode.jsx
│   │   ├── QueryTabs/
│   │   │   ├── index.jsx    ← Tab management
│   │   │   ├── QueryTab.jsx ← Editor + results
│   │   │   └── ShellTab.jsx ← Terminal view
│   │   └── Results/
│   │       ├── TreeView.jsx
│   │       ├── TableView.jsx
│   │       └── JsonView.jsx
├── electron-builder.yml
└── package.json
```

---

## 3. Data Models

### Connection Profile

```js
{
  id: '',           // UUID
  name: '',         // Display Name
  type: '',         // 'direct' | 'replica'
  host: '',
  port: 27017,
  auth: {
    enabled: false,
    database: 'admin',
    username: '',
    password: '',
    mechanism: 'DEFAULT'  // SCRAM-SHA-1, SCRAM-SHA-256
  },
  ssh: {
    enabled: false,
    host: '',
    port: 22,
    username: '',
    authMethod: 'password', // 'password' | 'key'
    password: '',
    keyPath: '',
    passphrase: ''
  },
  tls: {
    enabled: false,
    authMethod: 'ca',       // 'self-signed' | 'ca'
    caPath: '',
    usePem: false,
    pemPath: '',
    invalidHostnames: 'not-allowed'
  }
}
```

---

## 4. UI Design & Features

### 4.1 Connection Manager
- List view for all saved connection profiles.
- Badges for special attributes (e.g., "SSH" for tunneled connections).
- Context menu for quick Edit / Remove / Clone.
- Double-click to initiate connection.

### 4.2 Connection Settings (5 Tabs)
1. **Connection**: Basic details (Host, Port, Type). Support for URI parsing.
2. **Authentication**: SCRAM and other auth mechanisms.
3. **SSH**: Secure tunneling support via password or private key.
4. **TLS**: SSL/TLS certificate configuration.
5. **Advanced**: Performance and driver-specific settings.

---

## 5. IPC API (Main ↔ Renderer)

- `db:connect` / `db:disconnect`
- `db:listDatabases` / `db:listCollections`
- `db:runQuery`: Handles command parsing and execution (Find, Aggregate, etc.)
- `db:serverStatus`: Fetches real-time server metrics.
- `storage:getConnections` / `storage:saveConnections`: Manages local profile persistence.

---

## 6. SSH Tunneling Implementation

The application establishes a secure SSH connection using `ssh2`, forwards a local random port to the remote MongoDB port, and then instructs the `mongodb` driver to connect to the local forwarded port.

---

## 7. Development Phases

### Phase 1 — MVP
- Core infrastructure and multi-connection refactor.
- Basic query editor and result table.
- Persistent storage for connections.

### Phase 2 — Essential Features
- Results tree view with type badges.
- Sidebar context menus for DB/Collection management.
- Breadcrumb navigation and execution timing.

### Phase 3 — Advanced Support
- SSH Tunneling and TLS support.
- Bundled `mongosh` integration.
- Automated packaging and auto-update system.
─ MongoGUI-1.0.0-arm64.dmg      ← macOS Apple Silicon (M1/M2/M3)
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
