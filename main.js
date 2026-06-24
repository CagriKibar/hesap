const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { exec } = require('child_process');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const db = require('./database');
const expressApp = require('./express_app');

let mainWindow = null;
let localServerInstance = null;
let localServerPort = 8765;

const userDataPath = app.getPath('userData');
const CONFIG_FILE = path.join(userDataPath, 'config.json');

// --- Helper Functions ---

function loadConfigSync() {
  const defaults = {
    mod: 'yerel', // yerel | paylasim | istemci
    db_yolu: path.join(userDataPath, 'satis_takip.db'),
    sunucu_url: 'http://127.0.0.1:8765',
    github_repo: 'CagriKibar/hesap'
  };
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const stored = JSON.parse(data);
      return { ...defaults, ...stored };
    } catch (e) {
      console.error('Error reading config.json:', e);
    }
  }
  return defaults;
}

function saveConfigSync(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

async function apiCall(method, endpoint, body = null) {
  const cfg = loadConfigSync();
  const baseUrl = cfg.sunucu_url.replace(/\/$/, "");
  const url = `${baseUrl}${endpoint}`;
  const options = {
    method: method.toUpperCase(),
    headers: {
      'Content-Type': 'application/json'
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.hata || `HTTP Error: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

function formatMoney(value) {
  if (value === undefined || value === null) return "0,00";
  return Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getSaleBaseUnitPrice(sale) {
  const basePrice = sale.baz_satis_fiyati || 0.0;
  const bagWeight = sale.torba_agirligi || 50.0;
  const uQtyType = sale.birim || 'TORBA';
  const uSelType = sale.fiyat_birimi || uQtyType;

  const weights = {
    'KG': 1.0,
    'TON': 1000.0,
    'TORBA': bagWeight,
    'M2': 1.0
  };

  let selConversionFactor = 1.0;
  if (uQtyType !== uSelType && uQtyType !== 'M2' && uSelType !== 'M2') {
    const wQ = weights[uQtyType] || 1.0;
    const wSel = weights[uSelType] || 1.0;
    selConversionFactor = wQ / wSel;
  }
  return basePrice * selConversionFactor;
}

// Get the Arial TTF font or system Helvetica fallback
function getFontPaths() {
  let regular = 'Helvetica';
  let bold = 'Helvetica-Bold';
  if (process.platform === 'win32') {
    const winArial = 'C:/Windows/Fonts/arial.ttf';
    const winArialBold = 'C:/Windows/Fonts/arialbd.ttf';
    if (fs.existsSync(winArial) && fs.existsSync(winArialBold)) {
      regular = winArial;
      bold = winArialBold;
    }
  } else if (process.platform === 'darwin') {
    const macArial = '/Library/Fonts/Arial.ttf';
    const macArialBold = '/Library/Fonts/Arial Bold.ttf';
    if (fs.existsSync(macArial) && fs.existsSync(macArialBold)) {
      regular = macArial;
      bold = macArialBold;
    }
  }
  return { regular, bold };
}

// --- Electron Window Startup ---

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 880,
    minWidth: 1000,
    minHeight: 700,
    title: 'Hausmart Fiyatlandırma & Satış Takip Sistemi',
    icon: path.join(__dirname, 'hausmart_icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Remove default menu bar
  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadFile('index.html');

  // Redirect console logs to terminal
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (line ${line} in ${sourceId})`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopIntegratedServer();
  });
}

// --- Local API Server Control ---

function startIntegratedServer(port) {
  if (localServerInstance) return;
  localServerPort = port;
  try {
    localServerInstance = expressApp.listen(port, '0.0.0.0', () => {
      console.log(`Integrated API server running on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start integrated server:', err);
  }
}

function stopIntegratedServer() {
  if (localServerInstance) {
    localServerInstance.close();
    localServerInstance = null;
    console.log('Integrated API server stopped');
  }
}

app.whenReady().then(async () => {
  const cfg = loadConfigSync();
  
  // Migration: If no database file exists in AppData, copy the existing one from the workspace if available
  const defaultDbPath = path.join(userDataPath, 'satis_takip.db');
  if (cfg.db_yolu === defaultDbPath && !fs.existsSync(defaultDbPath)) {
    const workspaceDb = path.join(__dirname, 'satis_takip.db');
    if (fs.existsSync(workspaceDb)) {
      try {
        fs.mkdirSync(userDataPath, { recursive: true });
        fs.copyFileSync(workspaceDb, defaultDbPath);
        console.log('Migrated existing SQLite database to AppData');
      } catch (e) {
        console.error('Failed to migrate database to AppData:', e);
      }
    }
  }

  // Migration: If no irsaliyeler folder exists in AppData, copy the existing one from the workspace if available
  const defaultIrsFolder = path.join(userDataPath, 'irsaliyeler');
  if (!fs.existsSync(defaultIrsFolder)) {
    const workspaceIrs = path.join(__dirname, 'irsaliyeler');
    if (fs.existsSync(workspaceIrs)) {
      try {
        fs.mkdirSync(userDataPath, { recursive: true });
        fs.cpSync(workspaceIrs, defaultIrsFolder, { recursive: true });
        console.log('Migrated existing waybills to AppData');
      } catch (e) {
        console.error('Failed to migrate waybills:', e);
      }
    }
  }

  // In Yerel / Paylasim modes, open the database locally inside Electron
  if (cfg.mod !== 'istemci') {
    try {
      await db.initDatabase(cfg.db_yolu);
    } catch (e) {
      console.error('Failed to initialize local SQLite database:', e);
    }
  }
  
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC IPC Handler Registrations ---

// Load Config
ipcMain.handle('load-config', () => {
  return loadConfigSync();
});

// Save Config
ipcMain.handle('save-config', async (event, cfg) => {
  saveConfigSync(cfg);
  
  // Re-init local DB if we switched back to Yerel or Paylasim modes
  if (cfg.mod !== 'istemci') {
    try {
      await db.initDatabase(cfg.db_yolu);
    } catch (e) {
      console.error('Failed to initialize SQLite on config save:', e);
      throw e;
    }
  }
  return true;
});

// Test Connection
ipcMain.handle('test-connection', async (event, { mode, url, dbPath }) => {
  if (mode === 'yerel') {
    return { ok: true, msg: 'Yerel mod seçildi, veritabanı doğrudan açılacak.' };
  }
  if (mode === 'paylasim') {
    try {
      const dir = path.dirname(dbPath);
      if (fs.existsSync(dir)) {
        return { ok: true, msg: `Ağ klasörüne erişim başarılı:\n${dir}` };
      } else {
        return { ok: false, msg: `Ağ klasörüne erişilemedi:\n${dir}\nYolu veya izinleri kontrol edin.` };
      }
    } catch (e) {
      return { ok: false, msg: `Hata: ${e.message}` };
    }
  }
  if (mode === 'istemci') {
    try {
      const baseUrl = url.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/durum`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, msg: `Bağlantı Başarılı!\nSunucu durumu: Aktif\nVeritabanı: ${data.db || '-'}` };
      } else {
        return { ok: false, msg: `Sunucu hata kodu döndürdü: ${res.status}` };
      }
    } catch (e) {
      return { ok: false, msg: `Sunucuya bağlanılamadı:\n${e.message}` };
    }
  }
});

// Login
ipcMain.handle('login', async (event, { username, password }) => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('post', '/api/login', { kullanici_adi: username, sifre: password });
  } else {
    const rows = db.execQuery(
      "SELECT kullanici_adi, rol, aktif FROM kullanicilar WHERE kullanici_adi=? AND sifre=?",
      [username, password]
    );
    if (rows.length === 0) {
      throw new Error("Geçersiz kullanıcı adı veya şifre!");
    }
    const user = rows[0];
    if (user.aktif === 0) {
      throw new Error("Hesabınız pasif durumda.\nLütfen yöneticinizle iletişime geçin.");
    }
    return user;
  }
});

// Get Sales
ipcMain.handle('get-sales', async () => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('get', '/api/satislar');
  } else {
    return db.execQuery("SELECT id, tarih, kullanici, musteri_adi, urun_adi, miktar, birim, toplam_tutar, kar, irsaliye_yolu FROM satislar ORDER BY id DESC");
  }
});

// Add Sale
ipcMain.handle('add-sale', async (event, saleData) => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('post', '/api/satislar', saleData);
  } else {
    const lastId = db.execInsert(`
      INSERT INTO satislar (
        tarih, kullanici, musteri_adi, urun_adi, miktar, birim, fiyat_birimi, torba_agirligi,
        alis_fiyati, baz_satis_fiyati, odeme_turu, vade_ay, vade_orani,
        birim_fiyat, toplam_tutar, kar, irsaliye_yolu,
        nakliye_dahil, nakliye_maliyeti, indirme_dahil, indirme_maliyeti, alis_birimi
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      saleData.tarih, saleData.kullanici, saleData.musteri_adi, saleData.urun_adi,
      saleData.miktar, saleData.birim, saleData.fiyat_birimi, saleData.torba_agirligi,
      saleData.alis_fiyati, saleData.baz_satis_fiyati, saleData.odeme_turu,
      saleData.vade_ay, saleData.vade_orani,
      saleData.birim_fiyat, saleData.toplam_tutar, saleData.kar,
      saleData.irsaliye_yolu || '',
      saleData.nakliye_dahil || 0, saleData.nakliye_maliyeti || 0.0,
      saleData.indirme_dahil || 0, saleData.indirme_maliyeti || 0.0,
      saleData.alis_birimi || ''
    ]);
    return { id: lastId };
  }
});

// Edit Sale
ipcMain.handle('edit-sale', async (event, { sid, saleData }) => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('put', `/api/satislar/${sid}`, saleData);
  } else {
    db.execRun(`
      UPDATE satislar SET
        tarih=?, musteri_adi=?, urun_adi=?, miktar=?, birim=?, fiyat_birimi=?, torba_agirligi=?,
        alis_fiyati=?, baz_satis_fiyati=?, odeme_turu=?, vade_ay=?, vade_orani=?,
        birim_fiyat=?, toplam_tutar=?, kar=?,
        nakliye_dahil=?, nakliye_maliyeti=?, indirme_dahil=?, indirme_maliyeti=?, alis_birimi=?
      WHERE id=?
    `, [
      saleData.tarih, saleData.musteri_adi, saleData.urun_adi,
      saleData.miktar, saleData.birim, saleData.fiyat_birimi, saleData.torba_agirligi,
      saleData.alis_fiyati, saleData.baz_satis_fiyati, saleData.odeme_turu,
      saleData.vade_ay, saleData.vade_orani,
      saleData.birim_fiyat, saleData.toplam_tutar, saleData.kar,
      saleData.nakliye_dahil || 0, saleData.nakliye_maliyeti || 0.0,
      saleData.indirme_dahil || 0, saleData.indirme_maliyeti || 0.0,
      saleData.alis_birimi || '',
      sid
    ]);
    return { ok: true };
  }
});

// Get Sale Details
ipcMain.handle('get-sale-details', async (event, saleId) => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('get', `/api/satislar/${saleId}`);
  } else {
    const rows = db.execQuery("SELECT * FROM satislar WHERE id=?", [saleId]);
    if (rows.length === 0) throw new Error("Satış bulunamadı.");
    return rows[0];
  }
});

// Delete Sale
ipcMain.handle('delete-sale', async (event, saleId) => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('delete', `/api/satislar/${saleId}`);
  } else {
    db.execRun("DELETE FROM satislar WHERE id=?", [saleId]);
    return { ok: true };
  }
});

// Upload Waybill
ipcMain.handle('upload-waybill', async (event, saleId) => {
  const cfg = loadConfigSync();
  
  // Show file dialog
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'İrsaliye Dosyası Seçin',
    filters: [
      { name: 'Resim & Belge', extensions: ['pdf', 'png', 'jpg', 'jpeg'] },
      { name: 'Tüm Dosyalar', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const sourcePath = result.filePaths[0];
  const ext = path.extname(sourcePath);
  const destFileName = `irsaliye_${saleId}${ext}`;
  
  // Determine waybill folder location relative to DB folder or cwd
  let irsFolder = path.join(userDataPath, 'irsaliyeler');
  if (cfg.mod !== 'istemci' && cfg.db_yolu) {
    irsFolder = path.join(path.dirname(cfg.db_yolu), 'irsaliyeler');
  }
  
  if (!fs.existsSync(irsFolder)) {
    fs.mkdirSync(irsFolder, { recursive: true });
  }

  const destPath = path.join(irsFolder, destFileName);
  fs.copyFileSync(sourcePath, destPath);

  // Update DB pathway
  if (cfg.mod === 'istemci') {
    await apiCall('put', `/api/satislar/${saleId}/irsaliye`, { yol: destPath });
  } else {
    db.execRun("UPDATE satislar SET irsaliye_yolu=? WHERE id=?", [destPath, saleId]);
  }

  return destPath;
});

// View Waybill
ipcMain.handle('view-waybill', async (event, saleId) => {
  let sale = null;
  const cfg = loadConfigSync();
  
  if (cfg.mod === 'istemci') {
    sale = await apiCall('get', `/api/satislar/${saleId}`);
  } else {
    const rows = db.execQuery("SELECT irsaliye_yolu FROM satislar WHERE id=?", [saleId]);
    sale = rows[0];
  }

  if (sale && sale.irsaliye_yolu) {
    if (fs.existsSync(sale.irsaliye_yolu)) {
      shell.openPath(sale.irsaliye_yolu);
      return { ok: true };
    } else {
      throw new Error(`İrsaliye dosyası bulunamadı:\n${sale.irsaliye_yolu}`);
    }
  } else {
    throw new Error("Bu satış kaydına ait bir irsaliye yüklenmemiş.");
  }
});

// Products List
ipcMain.handle('get-products', async () => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('get', '/api/urunler');
  } else {
    const rows = db.execQuery("SELECT DISTINCT urun_adi FROM satislar WHERE urun_adi IS NOT NULL AND urun_adi != '' ORDER BY urun_adi ASC");
    return rows.map(r => r.urun_adi);
  }
});

// Product Price History
ipcMain.handle('get-price-history', async (event, prodName) => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('get', `/api/fiyat_gecmisi/${encodeURIComponent(prodName)}`);
  } else {
    return db.execQuery("SELECT tarih, musteri_adi, miktar, birim, odeme_turu, vade_ay, birim_fiyat, toplam_tutar FROM satislar WHERE urun_adi=? ORDER BY tarih DESC", [prodName]);
  }
});

// User Management (Admin)
ipcMain.handle('get-users', async () => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('get', '/api/kullanicilar');
  } else {
    return db.execQuery("SELECT id, kullanici_adi, rol, aktif FROM kullanicilar ORDER BY id ASC");
  }
});

ipcMain.handle('add-user', async (event, userData) => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('post', '/api/kullanicilar', userData);
  } else {
    db.execInsert("INSERT INTO kullanicilar (kullanici_adi, sifre, rol, aktif) VALUES (?,?,?,1)", [userData.kullanici_adi, userData.sifre, userData.rol]);
    return { ok: true };
  }
});

ipcMain.handle('edit-user', async (event, { uid, userData }) => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('put', `/api/kullanicilar/${uid}`, userData);
  } else {
    db.execRun("UPDATE kullanicilar SET kullanici_adi=?, rol=? WHERE id=?", [userData.kullanici_adi, userData.rol, uid]);
    return { ok: true };
  }
});

ipcMain.handle('reset-password', async (event, { uid, password }) => {
  console.log(`[IPC] reset-password called for uid: ${uid}`);
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('put', `/api/kullanicilar/${uid}`, { sifre: password });
  } else {
    db.execRun("UPDATE kullanicilar SET sifre=? WHERE id=?", [password, uid]);
    return { ok: true };
  }
});

ipcMain.handle('toggle-user-active', async (event, { uid, active }) => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('put', `/api/kullanicilar/${uid}`, { aktif: active });
  } else {
    db.execRun("UPDATE kullanicilar SET aktif=? WHERE id=?", [active, uid]);
    return { ok: true };
  }
});

ipcMain.handle('delete-user', async (event, uid) => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('delete', `/api/kullanicilar/${uid}`);
  } else {
    // Get username of the user to delete
    const userRows = db.execQuery("SELECT kullanici_adi FROM kullanicilar WHERE id = ?", [uid]);
    if (userRows.length > 0) {
      const uName = userRows[0].kullanici_adi;
      // Check if this user has any sales records
      const salesRows = db.execQuery("SELECT COUNT(*) as count FROM satislar WHERE kullanici = ?", [uName]);
      if (salesRows[0].count > 0) {
        throw new Error("Bu kullanıcıya ait satış kayıtları bulunmaktadır. Silme işlemine izin verilmez. Kullanıcıyı pasif yapabilirsiniz.");
      }
    }
    db.execRun("DELETE FROM kullanicilar WHERE id=?", [uid]);
    return { ok: true };
  }
});

// Rates Synchronization (Ayarlar)
ipcMain.handle('get-rates', async () => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('get', '/api/ayarlar');
  } else {
    const rows = db.execQuery("SELECT anahtar, deger FROM ayarlar");
    const rates = {};
    rows.forEach(r => {
      rates[r.anahtar] = parseFloat(r.deger) || 0.0;
    });
    return rates;
  }
});

ipcMain.handle('save-rates', async (event, rates) => {
  const cfg = loadConfigSync();
  if (cfg.mod === 'istemci') {
    return await apiCall('post', '/api/ayarlar', rates);
  } else {
    for (const key of Object.keys(rates)) {
      db.execRun("INSERT OR REPLACE INTO ayarlar (anahtar, deger) VALUES (?, ?)", [key, String(rates[key])]);
    }
    return { ok: true };
  }
});

// Network Details
ipcMain.handle('get-local-ips', () => {
  const ips = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips.length > 0 ? ips : ['127.0.0.1'];
});

ipcMain.handle('show-in-explorer', async (event, dirPath) => {
  const resolvedPath = path.resolve(dirPath);
  shell.openPath(resolvedPath);
  return true;
});

// Integrated Server Control
ipcMain.handle('toggle-local-server', (event, { port, start }) => {
  if (start) {
    startIntegratedServer(port);
    return { running: true, port };
  } else {
    stopIntegratedServer();
    return { running: false };
  }
});

ipcMain.handle('get-server-status', () => {
  return {
    running: localServerInstance !== null,
    port: localServerPort
  };
});

// Show native non-blocking dialogs
// Show native non-blocking dialogs
ipcMain.handle('show-alert', async (event, { message, title }) => {
  await dialog.showMessageBox({
    type: 'info',
    title: title,
    message: message,
    buttons: ['Tamam']
  });
  if (mainWindow) {
    mainWindow.focus();
  }
  return true;
});

ipcMain.handle('show-error', async (event, { message, title }) => {
  await dialog.showMessageBox({
    type: 'error',
    title: title,
    message: message,
    buttons: ['Tamam']
  });
  if (mainWindow) {
    mainWindow.focus();
  }
  return true;
});

ipcMain.on('show-confirm', (event, { message, title }) => {
  const result = dialog.showMessageBoxSync({
    type: 'question',
    title: title,
    message: message,
    buttons: ['Hayır', 'Evet'], // 0: Hayır, 1: Evet
    defaultId: 0,
    cancelId: 0
  });
  if (mainWindow) {
    mainWindow.focus();
  }
  event.returnValue = (result === 1);
});

// Open external website URL in system browser
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return true;
  } catch (err) {
    console.error('Failed to open external link:', err);
    return false;
  }
});

// Update & Version Control
ipcMain.handle('check-for-update', async () => {
  const cfg = loadConfigSync();
  const repo = cfg.github_repo || 'CagriKibar/hesap';
  const url = `https://raw.githubusercontent.com/${repo}/main/package.json`;
  
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Electron-Updater' } }, (res) => {
      if (res.statusCode !== 200) {
        resolve({ updateAvailable: false, error: `HTTP ${res.statusCode}` });
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const pkg = JSON.parse(data);
          const localVersion = require('./package.json').version;
          const remoteVersion = pkg.version;
          const updateAvailable = remoteVersion !== localVersion;
          resolve({
            updateAvailable,
            localVersion,
            remoteVersion,
            repo
          });
        } catch (e) {
          resolve({ updateAvailable: false, error: e.message });
        }
      });
    }).on('error', (err) => {
      resolve({ updateAvailable: false, error: err.message });
    });
  });
});

ipcMain.handle('install-update', async () => {
  const cfg = loadConfigSync();
  const repo = cfg.github_repo || 'CagriKibar/hesap';
  const zipUrl = `https://github.com/${repo}/archive/refs/heads/main.zip`;
  const workspacePath = __dirname;
  const zipPath = path.join(workspacePath, 'update.zip');
  const tempExtractPath = path.join(workspacePath, 'update_temp');
  
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(zipPath);
    https.get(zipUrl, { headers: { 'User-Agent': 'Electron-Updater' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.headers.location;
        https.get(redirectUrl, (redirectRes) => {
          redirectRes.pipe(file);
          file.on('finish', () => {
            file.close(async () => {
              try {
                await extractAndApplyUpdate(zipPath, tempExtractPath, workspacePath);
                resolve({ success: true });
              } catch (err) {
                reject(err);
              }
            });
          });
        }).on('error', (err) => {
          file.close();
          if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
          reject(err);
        });
      } else if (res.statusCode === 200) {
        res.pipe(file);
        file.on('finish', () => {
          file.close(async () => {
            try {
              await extractAndApplyUpdate(zipPath, tempExtractPath, workspacePath);
              resolve({ success: true });
            } catch (err) {
              reject(err);
            }
          });
        });
      } else {
        file.close();
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        reject(new Error(`HTTP ${res.statusCode} when downloading update`));
      }
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      reject(err);
    });
  });
});

ipcMain.handle('relaunch-app', () => {
  app.relaunch();
  app.exit(0);
});

function extractAndApplyUpdate(zipPath, tempExtractPath, workspacePath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(tempExtractPath)) {
      fs.rmSync(tempExtractPath, { recursive: true, force: true });
    }
    fs.mkdirSync(tempExtractPath, { recursive: true });
    
    const psCmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempExtractPath}' -Force"`;
    exec(psCmd, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`Extraction failed: ${stderr || err.message}`));
        return;
      }
      
      try {
        const folders = fs.readdirSync(tempExtractPath);
        if (folders.length === 0) {
          reject(new Error('Archive is empty'));
          return;
        }
        const innerFolder = path.join(tempExtractPath, folders[0]);
        const items = fs.readdirSync(innerFolder);
        
        for (const item of items) {
          if (item === 'satis_takip.db' || item === 'config.json' || item === 'node_modules' || item === 'node_temp' || item === 'update.zip' || item === 'update_temp') {
            continue;
          }
          const srcPath = path.join(innerFolder, item);
          const destPath = path.join(workspacePath, item);
          
          if (fs.statSync(srcPath).isDirectory()) {
            fs.cpSync(srcPath, destPath, { recursive: true, force: true });
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
        
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        fs.rmSync(tempExtractPath, { recursive: true, force: true });
        resolve();
      } catch (copyErr) {
        reject(copyErr);
      }
    });
  });
}

// --- PDF & Excel Reports Generators ---

// A. Export Cumulative Price Analysis (Tab 1 Grid) to Excel
ipcMain.handle('export-excel', async (event, data) => {
  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Excel Fiyat Listesi Kaydet',
    defaultPath: `Fiyat_Listesi_${(data.urun_adi || 'Urun').replace(/[\/\\?%*:|"<>\s.]/g, '_')}.xlsx`,
    filters: [{ name: 'Excel Dosyaları', extensions: ['xlsx'] }]
  });

  if (saveResult.canceled || !saveResult.filePath) return false;

  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Fiyat Analizi');

    // Title Row
    sheet.mergeCells('A1:F1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'HAUSMART - FİYAT ANALİZ RAPORU';
    titleCell.font = { bold: true, size: 13, color: { argb: '000000' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8CD24' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    // Info Section
    const info = [
      ['Müşteri:', data.musteri_adi || '-'],
      ['Ürün:', data.urun_adi || '-'],
      ['Miktar:', `${data.miktar} ${data.birim}`],
      ['Satış Fiyat Birimi:', data.fiyat_birimi],
      ['Baz Satış Fiyatı:', `${formatMoney(data.baz_satis_fiyati)} ₺`],
      ['Tarih:', new Date().toLocaleString('tr-TR')]
    ];
    if (data.role === 'Yönetici' || data.role === 'Süper Admin') {
      if (data.alis_fiyati > 0) {
        info.push(['Alış Fiyatı:', `${formatMoney(data.alis_fiyati)} ₺ (${data.alis_birimi})`]);
      }
    }

    info.forEach((row, idx) => {
      const r = sheet.getRow(idx + 2);
      r.getCell(1).value = row[0];
      r.getCell(1).font = { bold: true };
      r.getCell(2).value = row[1];
    });

    // Table Header Row
    const dataStartRow = info.length + 4;
    const headers = ['Ödeme Türü', 'Baz Oran (%)', 'Kümülatif Oran (%)', '1 Birim Fiyatı (₺)', 'Toplam Tutar (₺)'];
    if (data.role === 'Yönetici' || data.role === 'Süper Admin') {
      headers.push('Tahmini Toplam Kâr (₺)');
    }

    const headerRow = sheet.getRow(dataStartRow);
    headerRow.height = 25;
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8CD24' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Table Data
    data.rows.forEach((row, index) => {
      const r = sheet.getRow(dataStartRow + 1 + index);
      r.height = 20;
      
      r.getCell(1).value = row.tur;
      r.getCell(2).value = Number(row.baz_oran);
      r.getCell(3).value = Number(row.kum_oran);
      r.getCell(4).value = Number(row.birim_fiyat);
      r.getCell(5).value = Number(row.toplam_tutar);
      
      r.getCell(2).numFmt = '0.00"%"';
      r.getCell(3).numFmt = '0.00"%"';
      r.getCell(4).numFmt = '#,##0.00';
      r.getCell(5).numFmt = '#,##0.00';

      if (data.role === 'Yönetici' || data.role === 'Süper Admin') {
        if (data.alis_fiyati > 0) {
          r.getCell(6).value = Number(row.kar);
          r.getCell(6).numFmt = '#,##0.00';
        } else {
          r.getCell(6).value = '-';
        }
      }

      // Zebra striping
      if (index % 2 === 1) {
        for (let col = 1; col <= headers.length; col++) {
          r.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F5F5' } };
        }
      }
    });

    // Autofit column widths
    sheet.columns.forEach(col => {
      let maxLen = 0;
      col.eachCell({ includeEmpty: true }, cell => {
        const val = cell.value ? String(cell.value) : '';
        if (val.length > maxLen) maxLen = val.length;
      });
      col.width = Math.max(maxLen + 4, 14);
    });

    await workbook.xlsx.writeFile(saveResult.filePath);
    return saveResult.filePath;
  } catch (err) {
    console.error('Error generating Excel:', err);
    throw err;
  }
});

// B. Save printed PDF Receipt (A4 Delivery Slip)
ipcMain.handle('export-receipt-pdf', async (event, data) => {
  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'PDF Teslim Fişi Kaydet',
    defaultPath: `Hausmart_Fis_${(data.musteri_adi || 'musteri').replace(/[\/\\?%*:|"<>\s.]/g, '_')}.pdf`,
    filters: [{ name: 'PDF Dosyaları', extensions: ['pdf'] }]
  });

  if (saveResult.canceled || !saveResult.filePath) return false;

  await generatePdfSlip(saveResult.filePath, data);
  shell.openPath(saveResult.filePath);
  return saveResult.filePath;
});

// C. Re-generate PDF Receipt from history
ipcMain.handle('regenerate-receipt-pdf', async (event, saleId) => {
  const cfg = loadConfigSync();
  let sale = null;
  if (cfg.mod === 'istemci') {
    sale = await apiCall('get', `/api/satislar/${saleId}`);
  } else {
    const rows = db.execQuery("SELECT * FROM satislar WHERE id=?", [saleId]);
    sale = rows[0];
  }

  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'PDF Teslim Fişi Tekrar Çıkar',
    defaultPath: `Hausmart_Fis_${(sale.musteri_adi || 'musteri').replace(/[\/\\?%*:|"<>\s.]/g, '_')}.pdf`,
    filters: [{ name: 'PDF Dosyaları', extensions: ['pdf'] }]
  });

  if (saveResult.canceled || !saveResult.filePath) return false;

  await generatePdfSlip(saveResult.filePath, sale);
  shell.openPath(saveResult.filePath);
  return saveResult.filePath;
});

// D. Export order detail PDF (Detailed Invoice)
ipcMain.handle('export-detail-pdf', async (event, saleId) => {
  const cfg = loadConfigSync();
  let sale = null;
  if (cfg.mod === 'istemci') {
    sale = await apiCall('get', `/api/satislar/${saleId}`);
  } else {
    const rows = db.execQuery("SELECT * FROM satislar WHERE id=?", [saleId]);
    sale = rows[0];
  }

  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Sipariş Detay Raporu Kaydet',
    defaultPath: `Siparis_Detay_${saleId}_${(sale.musteri_adi || 'musteri').replace(/[\/\\?%*:|"<>\s.]/g, '_')}.pdf`,
    filters: [{ name: 'PDF Dosyaları', extensions: ['pdf'] }]
  });

  if (saveResult.canceled || !saveResult.filePath) return false;

  await generatePdfDetailReport(saveResult.filePath, sale);
  shell.openPath(saveResult.filePath);
  return saveResult.filePath;
});

// E. Export order detail to Excel
ipcMain.handle('export-detail-excel', async (event, saleId) => {
  const cfg = loadConfigSync();
  let sale = null;
  if (cfg.mod === 'istemci') {
    sale = await apiCall('get', `/api/satislar/${saleId}`);
  } else {
    const rows = db.execQuery("SELECT * FROM satislar WHERE id=?", [saleId]);
    sale = rows[0];
  }

  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Sipariş Detay Excel Kaydet',
    defaultPath: `Siparis_${saleId}_${(sale.musteri_adi || 'musteri').replace(/[\/\\?%*:|"<>\s.]/g, '_')}.xlsx`,
    filters: [{ name: 'Excel Dosyaları', extensions: ['xlsx'] }]
  });

  if (saveResult.canceled || !saveResult.filePath) return false;

  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sipariş Detayı');

    // Title Row
    sheet.mergeCells('A1:C1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `HAUSMART - SİPARİŞ DETAYI (ID: ${saleId})`;
    titleCell.font = { bold: true, size: 13, color: { argb: '000000' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8CD24' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    const baseUnitPrice = getSaleBaseUnitPrice(sale);
    const qty = sale.miktar || 1.0;
    const netProductTotal = baseUnitPrice * qty;
    const nakliyeBedeli = (sale.nakliye_dahil === 1) ? (sale.nakliye_maliyeti || 0) : 0;
    const indirmeBedeli = (sale.indirme_dahil === 1) ? (sale.indirme_maliyeti || 0) : 0;
    const totalWithoutVade = netProductTotal + nakliyeBedeli + indirmeBedeli;
    const vadeFarki = Math.max(0, sale.toplam_tutar - totalWithoutVade);

    const fields = [
      ['Satış Tarihi', sale.tarih],
      ['Satışı Yapan', sale.kullanici],
      ['Müşteri', sale.musteri_adi || '-'],
      ['Ürün Adı / Kodu', sale.urun_adi || '-'],
      ['Miktar', `${sale.miktar} ${sale.birim}`],
      ['Satış Fiyat Birimi', sale.fiyat_birimi],
      ['Torba Ağırlığı (kg)', (sale.birim === 'TORBA' || sale.fiyat_birimi === 'TORBA') ? sale.torba_agirligi : '-'],
      ['Ödeme Türü', sale.odeme_turu],
      ['Vade (Ay)', sale.vade_ay],
      ['Aylık Vade Oranı (%)', `${sale.vade_orani}%`],
      ['Baz Satış Fiyatı (₺)', sale.baz_satis_fiyati],
      ['Birim Satış Fiyatı (Net) (₺)', baseUnitPrice],
      ['Net Ürün Bedeli (₺)', netProductTotal],
      ['Nakliye Bedeli (₺)', nakliyeBedeli],
      ['İndirme Bedeli (₺)', indirmeBedeli],
      ['Vade / Ödeme Farkı (₺)', vadeFarki],
      ['Toplam Tutar (₺)', sale.toplam_tutar]
    ];

    // Admin fields
    const sessionConfig = loadConfigSync();
    // Assuming UI filters admin fields appropriately before display or we just let it export based on role stored in client
    // Since IPC doesn't naturally hold session state here, we can export profit if it was calculated and exists in the sale data
    if (sale.alis_fiyati !== undefined && sale.alis_fiyati > 0) {
      fields.push(['Alış Fiyatı (₺)', sale.alis_fiyati]);
      fields.push(['Toplam Kâr (₺)', sale.kar]);
    }

    fields.forEach((row, index) => {
      const r = sheet.getRow(index + 2);
      r.height = 22;
      r.getCell(1).value = row[0];
      r.getCell(1).font = { bold: true };
      r.getCell(2).value = row[1];
      
      if (typeof row[1] === 'number') {
        r.getCell(2).numFmt = '#,##0.00';
      }

      // Zebra striping
      if (index % 2 === 0) {
        r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F0F0' } };
        r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F0F0F0' } };
      }
    });

    sheet.column_dimensions = {
      A: { width: 28 },
      B: { width: 22 }
    };
    sheet.getColumn(1).width = 28;
    sheet.getColumn(2).width = 22;

    await workbook.xlsx.writeFile(saveResult.filePath);
    return saveResult.filePath;
  } catch (err) {
    console.error('Error exporting order details to Excel:', err);
    throw err;
  }
});

// PDF Rendering Core - A4 Delivery Slip (Fiş)
function generatePdfSlip(filePath, sale) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const fonts = getFontPaths();
    doc.font(fonts.regular);

    // Draw header background (yellow)
    doc.rect(0, 0, 595.28, 100).fill('#F8CD24');

    // Header Content
    doc.fillColor('black');
    doc.font(fonts.bold).fontSize(14).text("YILDIZ ÖZYAPI GEREÇLERİ", 40, 20);
    doc.fontSize(24).text("Hausmart", 40, 38);

    doc.font(fonts.regular).fontSize(9);
    doc.text("Buğday Pazarı Mahallesi, Şehit Selim Çelikel Sokak", 40, 70);
    doc.text("Başakkent Sitesi D-E Blok, No : 16 Merkez / ÇANKIRI", 40, 82);
    doc.text("Telefon : +90 (376) 212 03 65 - +90 (549) 730 68 95", 40, 94);
    doc.text("www.yildizozyapi.com | www.hausmart.com.tr", 40, 106);

    doc.font(fonts.bold).fontSize(12).text("ÇANKIRI        VERESİYE TESLİM FİŞİ", 320, 20, { align: 'right', width: 235 });

    const now = new Date();
    const dateStr = now.toLocaleTimeString('tr-TR') + "        " + now.toLocaleDateString('tr-TR');
    doc.font(fonts.regular).fontSize(9).text(dateStr, 320, 38, { align: 'right', width: 235 });

    doc.text("YILDIZ ÖZYAPI GEREÇLERİ İNŞ. SAN. TİC. LTD. ŞTİ.", 300, 53, { align: 'right', width: 255 });
    doc.text("TİCARET SİCİL NO : 2-1866 | MERSİS NO : 0985004080500018", 300, 65, { align: 'right', width: 255 });
    doc.text("VERGİ DAİRESİ : ÇANKIRI | VERGİ NO : 985 004 0805", 300, 77, { align: 'right', width: 255 });

    // Customer
    doc.font(fonts.regular).fontSize(10).text("SAYIN", 40, 140);
    doc.font(fonts.bold).fontSize(11).text(sale.musteri_adi || "..............", 40, 155);
    doc.font(fonts.regular).fontSize(10).text("VERGİ DAİRESİ : ÇANKIRI", 350, 140, { align: 'right', width: 200 });
    doc.text("VERGİ NO :", 350, 155, { align: 'right', width: 200 });

    // Table Header
    doc.rect(40, 190, 515.28, 20).fill('#F8CD24');
    doc.fillColor('black').font(fonts.bold).fontSize(9);
    doc.text("ÜRÜN KODU", 45, 196);
    doc.text("ÜRÜN ADI", 130, 196);
    doc.text("MİKTAR", 320, 196);
    doc.text("İSKONTO", 380, 196);
    doc.text("BİRİM", 440, 196);
    doc.text("BİRİM FİYAT", 490, 196, { width: 60, align: 'right' });

    // Rows
    const baseUnitPrice = getSaleBaseUnitPrice(sale);
    doc.font(fonts.regular).fontSize(9);
    let y = 210;
    for (let i = 0; i < 15; i++) {
      if (i % 2 === 0) {
        doc.rect(40, y, 515.28, 20).fill('#F5F5F5');
      }
      doc.fillColor('black');
      if (i === 0) {
        doc.text("-", 45, y + 6);
        doc.font(fonts.bold).text(sale.urun_adi || "", 130, y + 6).font(fonts.regular);
        doc.text(String(sale.miktar), 320, y + 6);
        doc.text("0,00", 380, y + 6);
        doc.text(sale.birim || "", 440, y + 6);
        doc.text(formatMoney(baseUnitPrice), 490, y + 6, { width: 60, align: 'right' });
      }
      y += 20;
    }

    // Totals Breakdown
    const qty = sale.miktar || 1.0;
    const netProductTotal = baseUnitPrice * qty;
    const nakliyeBedeli = (sale.nakliye_dahil === 1) ? (sale.nakliye_maliyeti || 0) : 0;
    const indirmeBedeli = (sale.indirme_dahil === 1) ? (sale.indirme_maliyeti || 0) : 0;
    const totalWithoutVade = netProductTotal + nakliyeBedeli + indirmeBedeli;
    const vadeFarki = Math.max(0, sale.toplam_tutar - totalWithoutVade);

    y += 15;
    doc.font(fonts.regular).fontSize(10);
    doc.text("Net Ürün Bedeli :", 350, y, { width: 120, align: 'right' });
    doc.text(formatMoney(netProductTotal), 480, y, { width: 75, align: 'right' });

    if (nakliyeBedeli > 0) {
      y += 15;
      doc.text("Nakliye Bedeli :", 350, y, { width: 120, align: 'right' });
      doc.text(formatMoney(nakliyeBedeli), 480, y, { width: 75, align: 'right' });
    }

    if (indirmeBedeli > 0) {
      y += 15;
      doc.text("İndirme Bedeli :", 350, y, { width: 120, align: 'right' });
      doc.text(formatMoney(indirmeBedeli), 480, y, { width: 75, align: 'right' });
    }

    if (vadeFarki > 0.01) {
      y += 15;
      doc.text("Vade / Ödeme Farkı :", 350, y, { width: 120, align: 'right' });
      doc.text(formatMoney(vadeFarki), 480, y, { width: 75, align: 'right' });
    }

    y += 15;
    doc.rect(340, y - 4, 215, 18).fill('#D8D8D8');
    doc.fillColor('black').font(fonts.bold).fontSize(11);
    doc.text("TOPLAM :", 350, y, { width: 120, align: 'right' });
    doc.text(formatMoney(sale.toplam_tutar), 480, y, { width: 75, align: 'right' });

    // Disclaimers
    y += 40;
    doc.font(fonts.regular).fontSize(8);
    doc.text("YUKARIDA ADI VE MİKTARI BELİRTİLEN ÜRÜNLERİ NOKSANSIZ VE TAM OLARAK TESLİM ALDIM.", 40, y, { align: 'center', width: 515.28 });
    doc.text("BEDELİ BORCUMDUR 15 GÜN İÇERİSİNDE ÖDEYECEĞİM. AKSİ TAKTİRDE ÇANKIRI MAHMEMELERİ VE İCRA DAİRELERİ YETKİLİDİR.", 40, y + 12, { align: 'center', width: 515.28 });

    // Signatures
    y += 40;
    doc.font(fonts.bold).fontSize(9);
    doc.text("EKSİKSİZ TESLİM EDEN", 80, y);
    doc.font(fonts.regular).text("İMZA", 100, y + 15);

    doc.font(fonts.bold).text("EKSİKSİZ TESLİM ALAN", 380, y);
    doc.font(fonts.regular).text("İMZA", 410, y + 15);

    doc.end();
    stream.on('finish', () => resolve(true));
    stream.on('error', (e) => reject(e));
  });
}

// PDF Rendering Core - Detailed Order Rapor
function generatePdfDetailReport(filePath, sale) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const fonts = getFontPaths();
    doc.font(fonts.regular);

    // Draw header background (yellow)
    doc.rect(0, 0, 595.28, 100).fill('#F8CD24');

    // Header Content
    doc.fillColor('black');
    doc.font(fonts.bold).fontSize(14).text("YILDIZ ÖZYAPI GEREÇLERİ", 40, 20);
    doc.fontSize(24).text("Hausmart", 40, 38);

    doc.font(fonts.regular).fontSize(9);
    doc.text("Buğday Pazarı Mahallesi, Şehit Selim Çelikel Sokak", 40, 70);
    doc.text("Başakkent Sitesi D-E Blok, No : 16 Merkez / ÇANKIRI", 40, 82);
    doc.text("Telefon : +90 (376) 212 03 65 - +90 (549) 730 68 95", 40, 94);
    doc.text("www.yildizozyapi.com | www.hausmart.com.tr", 40, 106);

    doc.font(fonts.bold).fontSize(12).text("SİPARİŞ DETAY RAPORU", 320, 20, { align: 'right', width: 235 });
    doc.font(fonts.regular).fontSize(9);
    doc.text(`Rapor No: ${sale.id}`, 320, 38, { align: 'right', width: 235 });
    doc.text(`Oluşturma: ${new Date().toLocaleString('tr-TR')}`, 320, 50, { align: 'right', width: 235 });

    let y = 140;
    doc.rect(40, y, 515.28, 22).fill('#F8CD24');
    doc.fillColor('black').font(fonts.bold).fontSize(11).text("SİPARİŞ BİLGİLERİ", 50, y + 6);

    y += 8;
    const fields = [
      ['Satış Tarihi', sale.tarih],
      ['Satışı Yapan', sale.kullanici],
      ['Müşteri', sale.musteri_adi || '-'],
      ['Ürün Adı / Kodu', sale.urun_adi || '-'],
      ['Miktar', `${sale.miktar} ${sale.birim}`],
      ['Satış Fiyat Birimi', sale.fiyat_birimi]
    ];
    if (sale.birim === 'TORBA' || sale.fiyat_birimi === 'TORBA') {
      fields.push(['Torba Ağırlığı', `${sale.torba_agirligi} kg`]);
    }
    const baseUnitPrice = getSaleBaseUnitPrice(sale);
    const qty = sale.miktar || 1.0;
    const netProductTotal = baseUnitPrice * qty;
    const nakliyeBedeli = (sale.nakliye_dahil === 1) ? (sale.nakliye_maliyeti || 0) : 0;
    const indirmeBedeli = (sale.indirme_dahil === 1) ? (sale.indirme_maliyeti || 0) : 0;
    const totalWithoutVade = netProductTotal + nakliyeBedeli + indirmeBedeli;
    const vadeFarki = Math.max(0, sale.toplam_tutar - totalWithoutVade);

    fields.push(
      ['Ödeme Türü', sale.odeme_turu],
      ['Vade', sale.vade_ay > 0 ? `${sale.vade_ay} Ay (Aylık %${sale.vade_orani})` : 'Nakit / Vadesiz'],
      ['Baz Satış Fiyatı', `${formatMoney(sale.baz_satis_fiyati)} ₺ (${sale.fiyat_birimi})`],
      ['Birim Satış Fiyatı (Net)', `${formatMoney(baseUnitPrice)} ₺ / ${sale.birim}`],
      ['Net Ürün Bedeli', `${formatMoney(netProductTotal)} ₺`]
    );

    if (nakliyeBedeli > 0) {
      fields.push(['Nakliye Bedeli', `${formatMoney(nakliyeBedeli)} ₺`]);
    }
    if (indirmeBedeli > 0) {
      fields.push(['İndirme Bedeli', `${formatMoney(indirmeBedeli)} ₺`]);
    }
    if (vadeFarki > 0.01) {
      fields.push(['Vade / Ödeme Farkı', `${formatMoney(vadeFarki)} ₺`]);
    }
    fields.push(['Toplam Tutar', `${formatMoney(sale.toplam_tutar)} ₺`]);

    if (sale.alis_fiyati !== undefined && sale.alis_fiyati > 0) {
      fields.push(['Alış Fiyatı', `${formatMoney(sale.alis_fiyati)} ₺`]);
      fields.push(['Toplam Kâr', `${formatMoney(sale.kar)} ₺`]);
    }

    fields.forEach((row, idx) => {
      y += 22;
      if (idx % 2 === 0) {
        doc.rect(40, y - 4, 515.28, 20).fill('#F5F5F5');
      }
      doc.fillColor('black');
      doc.font(fonts.bold).fontSize(10).text(row[0] + ":", 50, y + 1);
      doc.font(fonts.regular).fontSize(10).text(String(row[1]), 250, y + 1);
    });

    // Total display box
    y += 40;
    doc.rect(295, y - 5, 260, 22).fill('#D8D8D8');
    doc.fillColor('black').font(fonts.bold).fontSize(12);
    doc.text("GENEL TOPLAM :", 305, y, { width: 120, align: 'right' });
    doc.text(`${formatMoney(sale.toplam_tutar)} ₺`, 435, y, { width: 110, align: 'right' });

    doc.end();
    stream.on('finish', () => resolve(true));
    stream.on('error', (e) => reject(e));
  });
}
