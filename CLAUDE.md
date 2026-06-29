# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hausmart Satis Takip — a sales tracking and pricing desktop application for a building materials company (Yildiz Ozyapi Gerecleri). Built with Electron + Express + sql.js (WebAssembly SQLite). Turkish-language UI and business domain throughout.

There is also a legacy Python/Tkinter client (`satis_hesap.py`, `satis_server.py`) — these are excluded from the Electron build but remain in the repo.

## Commands

```bash
npm install          # install dependencies
npm start            # launch Electron desktop app (dev mode)
npm run server       # run standalone REST API server (no UI, port 8765)
npm run build        # package Windows .exe installer via electron-builder → dist/
```

The standalone server accepts: `node server.js [port] [db_path]` or env vars `PORT`, `DB_PATH`.

## Architecture

### Three Connection Modes

The app operates in one of three modes (set in config.json `mod` field):

- **yerel** (local) — Electron opens SQLite DB directly via sql.js in the main process
- **paylasim** (network share) — same as yerel but points to a UNC path like `\\SERVER\Share\satis_takip.db`
- **istemci** (HTTP client) — Electron acts as a thin client, all data via REST API calls to a remote Express server

Every IPC handler in `main.js` branches on `cfg.mod === 'istemci'`: if true, calls `apiCall()` to the Express server; otherwise, uses `database.js` directly. The Express API in `express_app.js` duplicates the same business logic for the server-side path. **Both code paths must stay in sync.**

### File Roles

| File | Role |
|---|---|
| `main.js` | Electron main process — IPC handlers, window management, PDF/Excel export, auto-update, integrated server control |
| `preload.js` | Context bridge — exposes `window.api.*` to renderer (all IPC channels) |
| `renderer.js` | Frontend logic — DOM manipulation, form handling, UI state (no framework) |
| `index.html` | Single-page HTML with all views/modals inline |
| `styles.css` | All styling |
| `database.js` | sql.js wrapper — `initDatabase()`, `execQuery()`, `execInsert()`, `execRun()`, auto-`saveToDisk()` after writes |
| `express_app.js` | Express REST API — mirrors all IPC data operations for HTTP client mode |
| `server.js` | Standalone server entry point — initializes DB then starts Express |

### Database (sql.js / WebAssembly)

Uses `sql.js` (not native `better-sqlite3`) to avoid C++ build toolchain requirements. The DB is loaded entirely into memory from `satis_takip.db`, and `saveToDisk()` is called after every write operation.

**Tables:** `kullanicilar` (users), `satislar` (sales — master), `satis_urunleri` (sale products — detail), `ayarlar` (settings/rates key-value).

Schema migrations are inline in `database.js:createSchema()` using PRAGMA table_info checks and ALTER TABLE.

### Business Logic: Unit Conversion & Profit Calculation

Price calculations involve unit conversions between KG, TON, TORBA (bag), and M2 with a configurable bag weight (`torba_agirligi`, default 50 kg). The functions `getSaleBaseUnitPrice()`, `calculateProfitMarginPct()`, and `recalculateAndHealSalesProfits()` are **duplicated in three places**: `main.js`, `express_app.js`, and `renderer.js`. All three must be kept consistent.

### Auto-Update Mechanism

`main.js` checks `package.json` version from the GitHub repo (`CagriKibar/hesap`). In packaged mode, downloads the NSIS installer from `dist/` in the repo. In dev mode, downloads and extracts the source ZIP.

### User Roles

Three tiers: **Super Admin** (`Süper Admin`), **Yönetici** (Manager), **Personel** (Staff). Role determines UI visibility — managers see purchase prices and profit columns; staff see only sale prices.

## Key Conventions

- All user-facing strings are in Turkish
- Money formatting uses Turkish locale (`tr-TR`, comma decimal)
- Payment types have configurable rate surcharges stored in `ayarlar` table (cash, credit card, check, promissory note, DBS, etc.)
- Electron contextIsolation is enabled; all main↔renderer communication via IPC through `preload.js`
- No test suite exists in this project
- The `node_temp/` directory contains a bundled Node.js binary for the packaged app — do not modify
