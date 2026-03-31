# LeafBase Installation & Release Guide

Since LeafBase is currently in its early stages and the builds are **unsigned**, your operating system might show a warning when you try to install or run it. Follow these simple steps to safely install LeafBase.

## 🍎 macOS Installation

> [!NOTE]
> **Recommended**: From **version 1.0.9 onwards**, LeafBase is officially signed and notarized by Apple. You can now open the app directly after dragging it into your Applications folder.

### Legacy Support (For versions < v1.0.9)
If you are using an older version, your operating system might show a message saying: *"LeafBase cannot be opened because it is from an unidentified developer."*

1.  **Right-Click** (or Control-click) the LeafBase app icon in your Applications folder.
2.  Choose **Open** from the top of the menu.
3.  Click **Open** in the dialog box that appears.
4.  The app is now saved as an exception to your security settings.

**If the above doesn't work (Advanced):**
Open your Terminal and run the following command to manually clear the "quarantine" flag:
```bash
sudo xattr -rd com.apple.quarantine /Applications/LeafBase.app
```
*(Enter your Mac password when prompted)*

---

## 🪟 Windows Installation

Windows SmartScreen might prevent the app from starting with a message: *"Windows protected your PC."*

1.  Click on the **"More info"** link in the blue/white pop-up.
2.  Click the **"Run anyway"** button that appears.

---

## 🐧 Linux Installation

LeafBase is distributed as an **AppImage** for Linux.

1.  Download the `.AppImage` file.
2.  Right-click the file and select **Properties**.
3.  Go to the **Permissions** tab and check **"Allow executing file as program"**.
4.  Close the window and double-click the file to run.

Alternatively, via terminal:
```bash
chmod +x LeafBase-x.x.x.AppImage
./LeafBase-x.x.x.AppImage
```

---

## 🛠️ Verification
All releases are automatically built by **GitHub Actions** directly from the source code. You can verify the integrity of the builds by checking the Actions tab on our repository.
