<p align="center">
  <img src="resources/logo.png" width="150" alt="LeafBase Logo">
</p>

<h1 align="center">LeafBase</h1>

<p align="center">
  <strong>A modern, cross-platform MongoDB GUI for the next generation.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome">
  <img src="https://img.shields.io/badge/Electron-28+-blue.svg" alt="Electron">
  <img src="https://img.shields.io/badge/React-18-blue.svg" alt="React">
</p>

---

LeafBase is a high-performance, open-source MongoDB management tool built with Electron and React. It provides native support for MongoDB 4.4 through 8.0+, including advanced features like SSH Tunneling, TLS/SSL, and a rich results viewer (Tree, Table, JSON).

Developed with a focus on speed, aesthetics, and reliability, LeafBase offers a premium experience for database administrators and developers alike.

## 📥 Downloads

Ready-to-use binaries for Windows, macOS, and Linux are available on the **[Releases Page](https://github.com/vutranHS/leafbase/releases)**.

> [!IMPORTANT]
> Since these builds are currently unsigned, please refer to our **[Installation & Release Guide](RELEASE_GUIDE.md)** for instructions on how to bypass system security warnings.

## ✨ Key Features

- **🚀 Native Performance**: Built on the official Node.js MongoDB driver for maximum compatibility.
- **🎨 Modern UI**: Sleek dark mode, intuitive layouts, and smooth micro-animations.
- **🔒 Secure Connectivity**: Native support for SSH Tunneling (Password/Private Key) and TLS/SSL.
- **🛠️ Rich Results Viewer**:
  - **Tree View**: Detailed view with type-detection badges (ObjectId, String, Date, etc.).
  - **Table View**: High-performance grid for large datasets.
  - **JSON View**: Formatted syntax-highlighted output.
- **⚡ Advanced Querying**: Professional editor powered by Monaco Editor.
- **📂 Multi-Connection**: Manage and switch between multiple local and remote instances seamlessly.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)

### Installation

```bash
$ git clone https://github.com/vutranHS/leafbase.git
$ cd leafbase
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
