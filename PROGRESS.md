# LeafBase Development Progress (Electron + React)

The table below details the project's progress based on the `ELECTRON_GUI_SPEC.md` and the current codebase.

## Status Legend:
- 🟢 **Real Implementation**: 100% complete Backend logic and Frontend UI.
- 🟡 **UI Mockup**: Interface exists, but underlying API/Logic hooks are missing.
- ⚪ **Not Started**: Development has not yet begun.

---

### Phase 1: Project Setup (Progress: 100%)
| Feature | Status | Notes |
| :--- | :--- | :--- |
| Template Initialization (Vite + React + CommonJS) | 🟢 Real | Working well |
| Theme Setup (Colors, Fonts, Tailwind) | 🟢 Real | CSS Variables system working effectively |
| Main (Node.js) & Renderer (React) Structure | 🟢 Real | Using IPC standards |
| `electron-builder` configuration | 🟢 Real | Configured in `electron-builder.yml` |

### Phase 2: Connection Manager (Progress: 95%)
| Feature | Status | Notes |
| :--- | :--- | :--- |
| Connection List UI | 🟢 Real | Loads from userData file |
| CRUD: Add, Edit, Delete, Clone | 🟢 Real | Hooks 100% complete |
| Save Data to Local JSON | 🟢 Real | Written via `db:saveConnections` |
| Drag & Drop Reordering | ⚪ Not Started | |

### Phase 3: Setup Connection Settings (5 Tabs) (Progress: 100%)
| Feature | Status | Notes |
| :--- | :--- | :--- |
| Connection Tab (Direct / Replica, Name, Address) | 🟢 Real | Shared form data management for all tabs. |
| Authentication Tab (SCRAM, X.509...) | 🟢 Real | URI encoding for User/Pass/DB/AuthMech on Backend driver. |
| SSH Tunnel Tab (Password / Private Key) | 🟢 Real | SSH tunnel creation using `ssh2` before MongoClient init. |
| TLS Tab (Self-signed / CA Certificate) | 🟢 Real | Certificate file paths parsed into MongoOptions. |
| Advanced Tab (Replica Set, Read Preference) | 🟢 Real | Mapped to standard MongoDB Node.js config. |
| "Test Connection" Button | 🟢 Real | TCP ping check with Tunnel before applying. |

### Phase 4: Main Window Layout & Query Editor (Progress: 95%)
| Feature | Status | Notes |
| :--- | :--- | :--- |
| Left Menu: DB/Collection Tree | 🟢 Real | Auto-fetches collections on DB expansion. |
| Multi-tab Manager | 🟢 Real | Independent state management with Zustand. |
| Monaco Editor | 🟢 Real | Local workers loaded, no CSP issues. |
| Results Toolbar & Execution Time | 🟢 Real | Real-time execution timer. |
| Pagination `< >` (Skip / Limit) | 🟢 Real | Using skip/limit in MongoDB Querying |
| Projection support in `find()` | 🟢 Real | Second argument in find() now works correctly. |
| JSON Result View | 🟢 Real | Syntax highlighting via Monaco. |
| Table Result View | 🟢 Real | Grid display, double-click for full value, Context Menu (CRUD). |
| Tree Result View | 🟢 Real | Type Badges (ObjectId/Date/String), sub-node support. |
| Breadcrumb Navigation | 🟢 Real | Located above Monaco Editor: `Localhost / db / col` |
| Output Logs Panel (Status Bar) | 🟢 Real | History logs for execution time, errors, and success. |

### Phase 5: Context Menus (Right-click) (Progress: 100%)
| Feature | Status | Notes |
| :--- | :--- | :--- |
| TreeView Data Menu: Copy JSON, Expand/Collapse | 🟢 Real | Right-click on records |
| Tree/Table Data Menu: Edit, View, Insert Modal | 🟢 Real | Integrated MongoDB Modal API |
| TableView Data Menu: Copy Value, Copy Name | 🟢 Real | Applied on table cell click |
| Database Menu: Drop, Statistics, Current Ops | 🟢 Real | Right-click on DB node (Sidebar) |
| Collection Menu: Drop, Rename, Duplicate... | 🟢 Real | Right-click on Collection node (Sidebar) |

### Phase 6: Shell & Console (Progress: On Hold)
| Feature | Status | Notes |
| :--- | :--- | :--- |
| Backend Sandbox NodeJS `vm` | 🟢 Real | Fully functional for JS Query Editor. |
| Native `mongosh` UI Tab | ⚪ Not Started | |

---

## 🔥 Current Tasks:
- [x] Finalize SSH Tunneling stability.
- [x] Professionalize documentation (English translation).
- [x] Release Automation (GitHub Actions — unsigned builds for Win/Mac/Linux).
- [x] Resizable editor/data panel (drag to resize).
- [x] Query Editor Shortcut (Cmd/Ctrl + Enter).
- [ ] Add drag & drop for connection sorting.

---

## 🗺️ v2 Feature Roadmap (Backlog)

### P1 — High Value / Easy
| Feature | Description |
| :--- | :--- |
| **Query History** | Auto-save every query on Run. Show a history list per collection. |
| **Autocomplete: Operators** | Register MongoDB operators (`$match`, `$group`, `$sum`...) in Monaco provider. |

### P2 — High Value / Medium
| Feature | Description |
| :--- | :--- |
| **Field-name Autocomplete** | Fetch schema via `findOne()` and inject field names into Monaco completion. |
| **Saved Queries** | Bookmark a named query snippet per collection, persisted in `userData`. |

### P3 — Medium Value / Medium
| Feature | Description |
| :--- | :--- |
| **Index Management UI** | List, create, and drop indexes via a dedicated dialog on the collection context menu. |
| **Native `mongosh` Shell Tab** | Bundled `mongosh` binary per platform, executed in a real terminal tab. |

### P4 — Optimization
| Feature | Description |
| :--- | :--- |
| **Virtual Scroll for Results** | Only render visible rows in Table/Tree view — needed for 1000+ document queries. |
| **Drag & Drop Connection Reorder** | Reorder connections in the sidebar via drag & drop. |
