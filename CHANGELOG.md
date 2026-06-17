# Changelog

## v1.1.6 — Light mode polish & a white-screen crash fix 🐛

A small but important maintenance release: the last few dark-only corners now follow
your theme, and a crash that could blank the whole window is fixed.

### 🐛 Fixes
- **Fixed a white-screen crash in the result views.** Documents containing a date
  outside the years 1970–9999 (e.g. old birthdates or far-future timestamps) caused
  `RangeError: Invalid time value` while rendering, which blanked the entire app — most
  often when switching to **Table view**. Dates are now formatted safely and never
  crash, in both **Table** and **Tree** views.
- Added an **error boundary** around the results panel, so any unexpected render error
  now shows an inline message with a **Try again** button instead of a blank screen.

### 🎨 Light mode improvements
- **Document editor** (View / Edit / Insert) now switches to a light Monaco theme in
  Light Mode instead of staying dark.
- **Query history** snippets use a light syntax theme when Light Mode is active.
- **Clone** operation logs follow the theme for both background and text colors.

> No data or configuration changes — just update and carry on. 🌿

## v1.1.5 — LeafBase is now **BysonDB** 🎉

This release is a **full rebrand**: *LeafBase* has been renamed to **BysonDB**. The
codebase, app identity, and release artifacts have all moved to the new name. The app
itself works exactly as before — same features, same data format, just a new name.

### 🔁 What changed
- **App name:** `LeafBase` → `BysonDB`
- **App identifier:** `com.vutran.leafbase` → `app.byson.desktop`
- **Repository:** `vutranHS/leafbase` → `vutranHS/byson`
- **Release files** are now named `BysonDB-<version>-<arch>.<ext>`
  (e.g. `BysonDB-1.1.5-arm64.dmg`, `BysonDB-1.1.5-x64-setup.exe`,
  `BysonDB-1.1.5-x86_64.AppImage`).

### ⚠️ Important for existing LeafBase users — please read

Because the app identifier changed, **macOS / Windows / Linux treat BysonDB as a brand
new application**. This has two consequences:

1. **No automatic update from LeafBase.** Your old LeafBase install will *not*
   auto-update to BysonDB. You need to **download BysonDB manually** from the
   [Releases page](https://github.com/vutranHS/byson/releases) once. From v1.1.5
   onward, BysonDB will auto-update normally.
2. **Your old data lives in a separate folder** and is not carried over
   automatically (saved connections, query history, and settings stay with the old
   LeafBase app).

### 🧳 How to migrate your data

The simplest path — re-add your connections in BysonDB (it takes a minute) and you're
done. If you want to keep your saved query tabs:

1. Open your **old LeafBase** app → **Workspaces** → **Export** (saves a
   `byson_workspace_*.json` file).
2. Open **BysonDB** → **Workspaces** → **Import** that file.

After confirming BysonDB works for you, you can uninstall the old LeafBase app. Your
old data folder can be removed manually if you no longer need it:
- **macOS:** `~/Library/Application Support/leafbase`
- **Windows:** `%APPDATA%\leafbase`
- **Linux:** `~/.config/leafbase`

> Nothing else has changed — connect to your MongoDB instances and pick up right where
> you left off. Thanks for using BysonDB! 🌿
