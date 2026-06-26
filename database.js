const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

let dbInstance = null;
let SQL = null;
let dbFilePath = '';

/**
 * Initializes the SQLite database.
 * Loads the existing file from dbPath or creates a new one.
 * @param {string} targetDbPath - The absolute path of the sqlite database file.
 */
async function initDatabase(targetDbPath) {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  dbFilePath = targetDbPath;
  const dbDir = path.dirname(dbFilePath);
  
  // Create parent directory if it doesn't exist
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(dbFilePath)) {
    const fileBuffer = fs.readFileSync(dbFilePath);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
    saveToDisk();
  }

  // Create tables and seed default users if necessary
  createSchema();
  return dbInstance;
}

/**
 * Saves the in-memory database to the disk file.
 */
function saveToDisk() {
  if (dbInstance && dbFilePath) {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbFilePath, buffer);
  }
}

/**
 * Creates the database tables and inserts default users.
 */
function createSchema() {
  // 1. Users Table
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS kullanicilar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kullanici_adi TEXT UNIQUE NOT NULL,
      sifre TEXT NOT NULL,
      rol TEXT NOT NULL,
      aktif INTEGER DEFAULT 1
    )
  `);

  // Migration to check if 'aktif' column exists
  try {
    const columns = execQuery("PRAGMA table_info(kullanicilar)");
    const hasAktif = columns.some(c => c.name === 'aktif');
    if (!hasAktif) {
      dbInstance.run("ALTER TABLE kullanicilar ADD COLUMN aktif INTEGER DEFAULT 1");
      saveToDisk();
    }
  } catch (e) {
    console.error("Migration error:", e);
  }

  // 2. Sales Table
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS satislar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tarih TEXT NOT NULL,
      kullanici TEXT NOT NULL,
      musteri_adi TEXT,
      urun_adi TEXT,
      miktar REAL,
      birim TEXT,
      fiyat_birimi TEXT,
      torba_agirligi REAL,
      alis_fiyati REAL,
      baz_satis_fiyati REAL,
      odeme_turu TEXT,
      vade_ay INTEGER,
      vade_orani REAL,
      birim_fiyat REAL,
      toplam_tutar REAL,
      kar REAL,
      irsaliye_yolu TEXT,
      nakliye_dahil INTEGER DEFAULT 0,
      nakliye_maliyeti REAL DEFAULT 0.0,
      indirme_dahil INTEGER DEFAULT 0,
      indirme_maliyeti REAL DEFAULT 0.0,
      alis_birimi TEXT,
      fatura_no TEXT,
      irsaliye_no TEXT,
      fatura_yolu TEXT,
      teslim_durumu INTEGER DEFAULT 0,
      teslim_yeri TEXT,
      teslim_notu TEXT
    )
  `);

  // Migration to check if new columns exist in satislar
  try {
    const columns = execQuery("PRAGMA table_info(satislar)");
    const hasNakliyeDahil = columns.some(c => c.name === 'nakliye_dahil');
    if (!hasNakliyeDahil) {
      dbInstance.run("ALTER TABLE satislar ADD COLUMN nakliye_dahil INTEGER DEFAULT 0");
      dbInstance.run("ALTER TABLE satislar ADD COLUMN nakliye_maliyeti REAL DEFAULT 0.0");
      dbInstance.run("ALTER TABLE satislar ADD COLUMN indirme_dahil INTEGER DEFAULT 0");
      dbInstance.run("ALTER TABLE satislar ADD COLUMN indirme_maliyeti REAL DEFAULT 0.0");
      dbInstance.run("ALTER TABLE satislar ADD COLUMN alis_birimi TEXT");
      saveToDisk();
    }
    
    const hasFaturaNo = columns.some(c => c.name === 'fatura_no');
    if (!hasFaturaNo) {
      dbInstance.run("ALTER TABLE satislar ADD COLUMN fatura_no TEXT");
      dbInstance.run("ALTER TABLE satislar ADD COLUMN irsaliye_no TEXT");
      dbInstance.run("ALTER TABLE satislar ADD COLUMN fatura_yolu TEXT");
      dbInstance.run("ALTER TABLE satislar ADD COLUMN teslim_durumu INTEGER DEFAULT 0");
      dbInstance.run("ALTER TABLE satislar ADD COLUMN teslim_yeri TEXT");
      dbInstance.run("ALTER TABLE satislar ADD COLUMN teslim_notu TEXT");
      saveToDisk();
    }
  } catch (e) {
    console.error("Migration error (satislar):", e);
  }

  // 2.5. Sales Products Table
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS satis_urunleri (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      satis_id INTEGER NOT NULL,
      urun_adi TEXT,
      miktar REAL,
      birim TEXT,
      fiyat_birimi TEXT,
      torba_agirligi REAL,
      alis_fiyati REAL,
      baz_satis_fiyati REAL,
      alis_birimi TEXT,
      birim_fiyat REAL,
      toplam_tutar REAL,
      kar REAL,
      irsaliye_no TEXT,
      irsaliye_yolu TEXT,
      FOREIGN KEY (satis_id) REFERENCES satislar(id) ON DELETE CASCADE
    )
  `);

  // Migrate existing single product records in satislar to satis_urunleri if satis_urunleri is empty
  try {
    const productCount = execQuery("SELECT COUNT(*) as count FROM satis_urunleri")[0].count;
    if (productCount === 0) {
      const sales = execQuery("SELECT * FROM satislar");
      if (sales.length > 0) {
        console.log(`Migrating ${sales.length} existing sales to satis_urunleri...`);
        for (const s of sales) {
          dbInstance.run(`
            INSERT INTO satis_urunleri (
              satis_id, urun_adi, miktar, birim, fiyat_birimi, torba_agirligi,
              alis_fiyati, baz_satis_fiyati, alis_birimi, birim_fiyat, toplam_tutar, kar,
              irsaliye_no, irsaliye_yolu
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            s.id, s.urun_adi || '', s.miktar || 0, s.birim || 'TORBA', s.fiyat_birimi || 'TON', s.torba_agirligi || 50.0,
            s.alis_fiyati || 0, s.baz_satis_fiyati || 0, s.alis_birimi || '',
            s.birim_fiyat || 0, s.toplam_tutar || 0, s.kar || 0,
            s.irsaliye_no || '', s.irsaliye_yolu || ''
          ]);
        }
        saveToDisk();
        console.log("Migration to satis_urunleri completed successfully.");
      }
    }
  } catch (e) {
    console.error("Migration error (satis_urunleri):", e);
  }

  // 3. Settings (Ayarlar) Table
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS ayarlar (
      anahtar TEXT PRIMARY KEY,
      deger TEXT NOT NULL
    )
  `);

  // Insert default users if table is empty
  const userCount = execQuery("SELECT COUNT(*) as count FROM kullanicilar")[0].count;
  if (userCount === 0) {
    const defaults = [
      ["superadmin", "super123", "Süper Admin"],
      ["admin", "admin123", "Yönetici"],
      ["satis", "satis123", "Personel"]
    ];
    for (const [name, pass, role] of defaults) {
      dbInstance.run(
        "INSERT INTO kullanicilar (kullanici_adi, sifre, rol, aktif) VALUES (?, ?, ?, 1)",
        [name, pass, role]
      );
    }
    saveToDisk();
  }

  // Insert default settings if table is empty
  const settingsCount = execQuery("SELECT COUNT(*) as count FROM ayarlar")[0].count;
  if (settingsCount === 0) {
    const defaultSettings = [
      ["rate_cash", "0"],
      ["rate_cc", "3"],
      ["rate_check", "5"],
      ["rate_note", "8"],
      ["rate_doc", "4"],
      ["rate_dbs", "2"]
    ];
    for (const [key, val] of defaultSettings) {
      dbInstance.run("INSERT INTO ayarlar (anahtar, deger) VALUES (?, ?)", [key, val]);
    }
    saveToDisk();
  }
}

/**
 * Executes a SELECT query and returns all rows as objects.
 */
function execQuery(sql, params = []) {
  if (!dbInstance) throw new Error("Database not initialized");
  const stmt = dbInstance.prepare(sql);
  const sanitizedParams = params.map(p => p === undefined ? null : p);
  stmt.bind(sanitizedParams);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * Executes an INSERT query and returns the last inserted row ID.
 */
function execInsert(sql, params = []) {
  if (!dbInstance) throw new Error("Database not initialized");
  const stmt = dbInstance.prepare(sql);
  const sanitizedParams = params.map(p => p === undefined ? null : p);
  stmt.run(sanitizedParams);
  stmt.free();
  
  // Get last insert ID
  const idStmt = dbInstance.prepare("SELECT last_insert_rowid() as id");
  idStmt.step();
  const result = idStmt.getAsObject();
  idStmt.free();

  saveToDisk();
  return result.id;
}

/**
 * Executes an UPDATE/DELETE query.
 */
function execRun(sql, params = []) {
  if (!dbInstance) throw new Error("Database not initialized");
  const stmt = dbInstance.prepare(sql);
  const sanitizedParams = params.map(p => p === undefined ? null : p);
  stmt.run(sanitizedParams);
  stmt.free();
  saveToDisk();
}

module.exports = {
  initDatabase,
  execQuery,
  execInsert,
  execRun,
  saveToDisk
};
