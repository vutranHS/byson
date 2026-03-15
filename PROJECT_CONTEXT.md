# LeafBase | Project Context & History

> **Note to Future AI Assistants**: Read this file first to understand the context, technical decisions, and status of LeafBase. This project was developed as a modern, cross-platform replacement for Robo3T using Electron and React.

---

## 🍃 Project Overview
- **Name**: LeafBase (formerly MongoGUI)
- **Goal**: A high-performance, aesthetically premium MongoDB GUI.
- **Creator**: Antigravity AI (Pair programming with VuTran)
- **Repo**: [https://github.com/vutranHS/leafbase](https://github.com/vutranHS/leafbase)

---

## 🛠️ Technical Stack
- **Framework**: Electron (v33.2.1 - Stable)
- **Build Tool**: Vite (electron-vite)
- **Frontend**: React 19 + Tailwind CSS 4
- **Editor**: Monaco Editor (with custom resizable panel)
- **Database**: Official MongoDB Node.js Driver (v7.1.0)
- **Connectivity**: `ssh2` for native SSH Tunneling
- **Packaging**: `electron-builder` (v25.1.8 - Stable)
- **State Management**: Zustand

---

## 📜 Development History (Phases)

### Phase 1: Rebranding & Localization
- Rebranded from "MongoGUI" to **LeafBase**.
- Performed a 100% translation from Vietnamese to English (Code, Comments, UI, Docs).
- Created a professional minimalist logo and brand assets.

### Phase 2: Technical Stabilization
- **SSH Tunneling**: Fully implemented and tested support for Password and Private Key auth.
- **Electron Stability**: Downgraded from experimental v39/Builder v26 to **Stable v33/Builder v25** to resolve macOS "damaged app" launch errors.

### Phase 3: Release Automation
- Configured **GitHub Actions** (`release.yml`) for automated packaging.
- Resolved macOS Universal binary conflicts (native modules).
- **Decision**: Switched to separate architecture builds (`-arm64.dmg` for Apple Silicon/M4 and `-x64.dmg` for Intel) for maximum reliability.

### Phase 4: UI/UX Refinement
- **Maximization**: App now starts maximized by default.
- **Layout**: Adjusted editor/data ratio to ~30/70 to prioritize results view, matching Robo3T proportions.
- **Resizable Panels**: Implemented a draggable resize handle for the query editor.
- **Branding**: Replaced default Electron icons in `build/` with the LeafBase logo for professional packaging.

---

## 🛑 Critical Support & Security (macOS)
LeafBase builds are **unsigned**. On modern macOS (especially M1/M2/M3/M4):
1. **Quarantine Error**: Users will see "App is damaged" or "Check with developer".
2. **Definitive Fix**: Move to `/Applications` and run:
   ```bash
   sudo xattr -rd com.apple.quarantine /Applications/LeafBase.app
   ```
3. **Ad-hoc Signing**: Current build configuration uses `identity: null` to ensure ad-hoc signing is performed, which is required for Apple Silicon apps even if unsigned.

---

## 🗺️ Current Roadmap (V2)

### P1: High Priority
- **Query History**: Auto-save queries on execution.
- **Autocomplete**: Register MongoDB operators in Monaco.

### P2: Medium Priority
- **Field Suggestions**: Dynamic autocomplete based on collection schema.
- **Saved Queries**: Bookmark/favorite system for common queries.

### P3: Advanced Features
- **Index UI**: Visual management of database indexes.
- **mongosh Tab**: Integrated terminal with bundled binary.

### P4: Optimization
- **Virtual Scrolling**: Performance optimization for 1000+ row results.
- **Drag & Drop**: Connection reordering in sidebar.

---

## 📂 File Architecture
- `src/main`: Main process, storage handlers, DB logic.
- `src/renderer`: React app, components, stores.
- `src/renderer/src/components/QueryTab`: Core editor and results logic.
- `src/renderer/src/store`: Zustand stores (connection, tab, logs).
- `electron-builder.yml`: Packaging and release configuration.

---
*Last updated: March 14, 2026*
