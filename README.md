<p align="center">
  <img src="resources/logo.png" width="150" alt="BysonDB Logo">
</p>

<h1 align="center">BysonDB</h1>

<p align="center">
  <strong>A modern, cross-platform MongoDB GUI — the open-source successor to Robo3T.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/github/license/vutranHS/byson" alt="License">
  <img src="https://img.shields.io/github/v/release/vutranHS/byson" alt="Latest Release">
  <img src="https://img.shields.io/github/stars/vutranHS/byson?style=social" alt="Stars">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">
  <img src="https://img.shields.io/badge/Electron-28+-blue.svg" alt="Electron">
  <img src="https://img.shields.io/badge/React-18-blue.svg" alt="React">
  <img src="https://img.shields.io/badge/MongoDB-4.4--8.0+-green.svg" alt="MongoDB">
</p>

---

BysonDB is a high-performance, open-source MongoDB management tool built with Electron and React. It provides native support for MongoDB 4.4 through 8.0+, including advanced features like SSH Tunneling, TLS/SSL, and a rich results viewer (Tree, Table, JSON).

Developed with a focus on speed, aesthetics, and reliability, BysonDB offers a premium experience for database administrators and developers alike — completely free, no paywalls, no feature tiers.

## 📸 Screenshots

**Tree View — with type-detection badges and context menu**
![Tree View](resources/screenshots/tree-view.png)

**Table View — high-performance grid for large datasets**
![Table View](resources/screenshots/table-view.png)

**Connection Dialog — SSH, TLS, Authentication support**
![Connection Dialog](resources/screenshots/connection-dialog.png)

---

## 🤔 Why BysonDB?

Robo3T was the go-to MongoDB GUI for hundreds of thousands of developers — lightweight, fast, and free. It was discontinued after acquisition. MongoDB Compass is the official alternative but is heavy and opinionated. Other OSS options are either unmaintained or lock core features behind a paywall.

**BysonDB fills that gap.** Same simplicity, modern codebase, actively maintained.

| Feature | BysonDB | Robo3T | MongoDB Compass |
|---|---|---|---|
| Free & open-source | ✅ | ✅ | ✅ |
| SSH Tunneling | ✅ | ✅ | ✅ (paid) |
| TLS/SSL | ✅ | ✅ | ✅ |
| Tree / Table / JSON views | ✅ | ⚠️ limited | ✅ |
| Monaco Editor | ✅ | ❌ | ❌ |
| APM Profiler | ✅ | ❌ | ❌ |
| Active development | ✅ | ❌ sunset | ✅ |
| Cross-platform | ✅ | ✅ | ✅ |

---

## Key Features

- **🚀 Native Performance**: Built on the official Node.js MongoDB driver for maximum compatibility.
- **🎨 Modern UI**: Sleek dark mode, intuitive layouts, and smooth micro-animations.
- **🔒 Secure Connectivity**: Native support for SSH Tunneling (Password/Private Key) and TLS/SSL.
- **🛠️ Rich Results Viewer**:
  - **Tree View**: Detailed view with type-detection badges (ObjectId, String, Date, etc.).
  - **Table View**: High-performance grid for large datasets.
  - **JSON View**: Formatted syntax-highlighted output.
- **⚡ Advanced Querying**: Professional editor powered by Monaco Editor.
- **📊 APM Profiler**: Real-time query performance monitoring.
- **📂 Multi-Connection**: Manage and switch between multiple local and remote instances seamlessly.

## 📥 Downloads

Ready-to-use binaries for Windows, macOS, and Linux are available on the **[Releases Page](https://github.com/vutranHS/byson/releases)**.

> [!TIP]
> **macOS (v1.0.9+)** is now officially **Digitally Signed** and **Notarized** by Apple. macOS users can open BysonDB directly. 
> 
> **Windows builds** are currently pending approval from [SignPath.io](https://signpath.io/). Until then, Windows users may still see a SmartScreen warning. Please refer to our **[Installation & Release Guide](RELEASE_GUIDE.md)** for more details.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)

### Installation
```bash
$ git clone https://github.com/vutranHS/byson.git
$ cd byson
$ npm install
```

### Development
```bash
$ npm run dev
```

### Build & Distribution
```bash
# For Windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## 🗺️ Roadmap

See our full roadmap and vote on upcoming features in [FEATURES_REQUEST.md](../FEATURES_REQUEST.md).

**Already shipped in v1.0.8:** Workspace Sessions, Global Query History, Tab IDE Menus, SSH Auto-Reconnect, Export/Import Engine (JSON/CSV/BSON/XLSX), Monaco Editor.

**Coming soon:** Aggregation Pipeline Builder, Index Manager, Schema Analyzer, Query Explain Plan viewer.

## 🤝 Contributing

We welcome contributions from the community! Whether it's fixing a bug, adding a feature, or improving documentation:

1. Check out our **[Contributing Guidelines](CONTRIBUTING.md)**.
2. Fork the repository.
3. Submit a **Pull Request** using our professional template.

We are committed to fostering an open and welcoming environment.


## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for the full text.

---

<p align="center">Built with ❤️ by VuTran and the Open Source Community</p>
