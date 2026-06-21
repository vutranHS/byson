# Changelog

## v1.1.9 — Aggregation Pipeline Builder 🧱

A new visual way to build, preview, and tune MongoDB aggregation pipelines.

### ✨ New: Aggregation Pipeline Builder
Open it from the collection menu in the sidebar (**Aggregate...**).

- **Build visually.** Drag stages from a searchable palette (or click to add),
  reorder by drag handle, enable/disable, and duplicate stages. Every stage has
  its own editor.
- **Form or Code per stage.** Simple stages (`$match`, `$project`, `$sort`,
  `$limit`, `$skip`, `$sample`, `$unwind`) offer a structured form; anything more
  advanced falls back to a code editor.
- **Live preview.** See results up to any stage as you build, with Tree / Table /
  JSON views. Write stages (`$out` / `$merge`) are skipped in preview and only run
  on demand.
- **Explain plan.** One click shows the execution plan (index usage, COLLSCAN
  warnings, docs examined vs returned) plus static hints (move `$match` earlier,
  suggest indexes for `$match` / `$sort`).
- **Collection autocomplete** for `$lookup`, `$graphLookup`, `$unionWith`, `$out`,
  and `$merge`.
- **Save & reuse pipelines**, export results to JSON, copy the generated code, or
  open it in a Query tab.
- Pipelines and view preferences are remembered across tab switches and restarts.

## v1.1.8 — Keep clone progress when switching tabs 🔁

### 🐛 Fixes
- **Fixed the Clone tab going blank when you switch away and back mid-clone.**
  While a collection or database clone was running, switching to another tab and
  returning showed an empty "Execution Status" with no progress or logs — the
  running job looked lost (and a paused job could resume against the wrong target).
  Clone state now lives outside the tab view and keeps updating in the background,
  so progress, logs, and pause/resume survive tab switches.

## v1.1.7 — Fix auto-update on macOS 26 (Tahoe) 🔁

On **macOS 26 (Tahoe) and newer**, BysonDB could download an update and quit after
**Restart Now**, but reopen on the old version. This release fixes that.

### 🔧 What was wrong
macOS 26 changed how `launchd` handles the updater helper (`ShipIt`). After the app
asked to install the update, the helper was registered but **never actually started**,
so the downloaded update sat staged on disk and was never applied. This is a known
Electron/Squirrel.Mac regression on macOS 26
([electron/electron#50866](https://github.com/electron/electron/issues/50866)).

### ✅ The fix
- When running on **macOS 26+**, BysonDB now starts the updater helper itself right after
  you click **Restart Now** — waiting for the app to fully quit, then launching `ShipIt`
  so the update is applied and the app relaunches on the new version.
- Older macOS versions are unaffected and keep the normal update flow.
- Added persistent updater logs under `~/Library/Logs/byson/BysonDB/` to make any future
  update issues easy to diagnose.

> **Already on an older BysonDB and stuck on macOS 26?** If auto-update closes the app but
> doesn't upgrade it, download **v1.1.7** once from the
> [Releases page](https://github.com/vutranHS/byson/releases) and replace the app in your
> Applications folder. From v1.1.7 onward, auto-update works on macOS 26.

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
