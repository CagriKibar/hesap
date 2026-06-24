const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Get status
app.get('/api/durum', (req, res) => {
  res.json({
    durum: 'aktif',
    zaman: new Date().toISOString(),
    db: db.dbFilePath || 'In-Memory'
  });
});

// 2. User login
app.post('/api/login', (req, res) => {
  const { kullanici_adi, sifre } = req.body;
  try {
    const rows = db.execQuery(
      "SELECT kullanici_adi, rol, aktif FROM kullanicilar WHERE kullanici_adi=? AND sifre=?",
      [kullanici_adi, sifre]
    );
    if (rows.length === 0) {
      return res.status(401).json({ hata: "Geçersiz kimlik bilgileri" });
    }
    const user = rows[0];
    if (user.aktif === 0) {
      return res.status(403).json({ hata: "Hesap pasif" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ hata: err.message });
  }
});

// 3. List sales
app.get('/api/satislar', (req, res) => {
  try {
    const rows = db.execQuery(
      "SELECT id, tarih, kullanici, musteri_adi, urun_adi, miktar, birim, toplam_tutar, kar, irsaliye_yolu FROM satislar ORDER BY id DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ hata: err.message });
  }
});

// 4. Create sale
app.post('/api/satislar', (req, res) => {
  const data = req.body;
  try {
    const lastId = db.execInsert(`
      INSERT INTO satislar (
        tarih, kullanici, musteri_adi, urun_adi, miktar, birim, fiyat_birimi, torba_agirligi,
        alis_fiyati, baz_satis_fiyati, odeme_turu, vade_ay, vade_orani,
        birim_fiyat, toplam_tutar, kar, irsaliye_yolu,
        nakliye_dahil, nakliye_maliyeti, indirme_dahil, indirme_maliyeti, alis_birimi
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      data.tarih, data.kullanici, data.musteri_adi, data.urun_adi,
      data.miktar, data.birim, data.fiyat_birimi, data.torba_agirligi,
      data.alis_fiyati || 0, data.baz_satis_fiyati || 0, data.odeme_turu,
      data.vade_ay || 0, data.vade_orani || 0,
      data.birim_fiyat || 0, data.toplam_tutar || 0, data.kar || 0,
      data.irsaliye_yolu || '',
      data.nakliye_dahil || 0, data.nakliye_maliyeti || 0.0,
      data.indirme_dahil || 0, data.indirme_maliyeti || 0.0,
      data.alis_birimi || ''
    ]);
    res.status(201).json({ id: lastId });
  } catch (err) {
    res.status(500).json({ hata: err.message });
  }
});

// 5. Get sale detail
app.get('/api/satislar/:id', (req, res) => {
  const sid = parseInt(req.params.id);
  try {
    const rows = db.execQuery("SELECT * FROM satislar WHERE id=?", [sid]);
    if (rows.length === 0) {
      return res.status(404).json({ hata: "Bulunamadı" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ hata: err.message });
  }
});

// Edit sale
app.put('/api/satislar/:id', (req, res) => {
  const sid = parseInt(req.params.id);
  const data = req.body;
  try {
    db.execRun(`
      UPDATE satislar SET
        tarih=?, musteri_adi=?, urun_adi=?, miktar=?, birim=?, fiyat_birimi=?, torba_agirligi=?,
        alis_fiyati=?, baz_satis_fiyati=?, odeme_turu=?, vade_ay=?, vade_orani=?,
        birim_fiyat=?, toplam_tutar=?, kar=?,
        nakliye_dahil=?, nakliye_maliyeti=?, indirme_dahil=?, indirme_maliyeti=?, alis_birimi=?
      WHERE id=?
    `, [
      data.tarih, data.musteri_adi, data.urun_adi,
      data.miktar, data.birim, data.fiyat_birimi, data.torba_agirligi,
      data.alis_fiyati || 0, data.baz_satis_fiyati || 0, data.odeme_turu,
      data.vade_ay || 0, data.vade_orani || 0,
      data.birim_fiyat || 0, data.toplam_tutar || 0, data.kar || 0,
      data.nakliye_dahil || 0, data.nakliye_maliyeti || 0.0,
      data.indirme_dahil || 0, data.indirme_maliyeti || 0.0,
      data.alis_birimi || '',
      sid
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ hata: err.message });
  }
});

// 6. Delete sale
app.delete('/api/satislar/:id', (req, res) => {
  const sid = parseInt(req.params.id);
  try {
    db.execRun("DELETE FROM satislar WHERE id=?", [sid]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ hata: err.message });
  }
});

// 7. Update waybill path
app.put('/api/satislar/:id/irsaliye', (req, res) => {
  const sid = parseInt(req.params.id);
  const { yol } = req.body;
  try {
    db.execRun("UPDATE satislar SET irsaliye_yolu=? WHERE id=?", [yol || '', sid]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ hata: err.message });
  }
});

// 8. List users
app.get('/api/kullanicilar', (req, res) => {
  try {
    const rows = db.execQuery("SELECT id, kullanici_adi, rol, aktif FROM kullanicilar ORDER BY id");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ hata: err.message });
  }
});

// 9. Add user
app.post('/api/kullanicilar', (req, res) => {
  const { kullanici_adi, sifre, rol } = req.body;
  try {
    db.execInsert(
      "INSERT INTO kullanicilar (kullanici_adi, sifre, rol, aktif) VALUES (?,?,?,1)",
      [kullanici_adi, sifre, rol]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('constraint')) {
      res.status(409).json({ hata: "Kullanıcı adı mevcut" });
    } else {
      res.status(500).json({ hata: err.message });
    }
  }
});

// 10. Update user properties
app.put('/api/kullanicilar/:id', (req, res) => {
  const uid = parseInt(req.params.id);
  const data = req.body;
  try {
    if (data.sifre) {
      db.execRun("UPDATE kullanicilar SET sifre=? WHERE id=?", [data.sifre, uid]);
    }
    if (data.rol !== undefined || data.kullanici_adi !== undefined) {
      db.execRun(
        "UPDATE kullanicilar SET kullanici_adi=COALESCE(?,kullanici_adi), rol=COALESCE(?,rol) WHERE id=?",
        [data.kullanici_adi, data.rol, uid]
      );
    }
    if (data.aktif !== undefined) {
      db.execRun("UPDATE kullanicilar SET aktif=? WHERE id=?", [data.aktif, uid]);
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('constraint')) {
      res.status(409).json({ hata: "Kullanıcı adı mevcut" });
    } else {
      res.status(500).json({ hata: err.message });
    }
  }
});

// 11. Delete user
app.delete('/api/kullanicilar/:id', (req, res) => {
  const uid = parseInt(req.params.id);
  try {
    const userRows = db.execQuery("SELECT kullanici_adi FROM kullanicilar WHERE id = ?", [uid]);
    if (userRows.length > 0) {
      const uName = userRows[0].kullanici_adi;
      const salesRows = db.execQuery("SELECT COUNT(*) as count FROM satislar WHERE kullanici = ?", [uName]);
      if (salesRows[0].count > 0) {
        return res.status(400).json({ hata: "Bu kullanıcıya ait satış kayıtları bulunmaktadır. Silme işlemine izin verilmez." });
      }
    }
    db.execRun("DELETE FROM kullanicilar WHERE id=?", [uid]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ hata: err.message });
  }
});

// 12. List distinct products
app.get('/api/urunler', (req, res) => {
  try {
    const rows = db.execQuery(
      "SELECT DISTINCT urun_adi FROM satislar WHERE urun_adi IS NOT NULL AND urun_adi != '' ORDER BY urun_adi"
    );
    res.json(rows.map(r => r.urun_adi));
  } catch (err) {
    res.status(500).json({ hata: err.message });
  }
});

// 13. Price history for product
app.get('/api/fiyat_gecmisi/:urun_adi', (req, res) => {
  const urun = req.params.urun_adi;
  try {
    const rows = db.execQuery(
      "SELECT tarih, musteri_adi, miktar, birim, odeme_turu, vade_ay, birim_fiyat, toplam_tutar FROM satislar WHERE urun_adi=? ORDER BY tarih DESC",
      [urun]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ hata: err.message });
  }
});

// 14. Get settings (rates)
app.get('/api/ayarlar', (req, res) => {
  try {
    const rows = db.execQuery("SELECT anahtar, deger FROM ayarlar");
    const rates = {};
    rows.forEach(r => {
      rates[r.anahtar] = parseFloat(r.deger) || 0.0;
    });
    res.json(rates);
  } catch (err) {
    res.status(500).json({ hata: err.message });
  }
});

// 15. Save settings (rates)
app.post('/api/ayarlar', (req, res) => {
  const rates = req.body;
  try {
    for (const key of Object.keys(rates)) {
      db.execRun("INSERT OR REPLACE INTO ayarlar (anahtar, deger) VALUES (?, ?)", [key, String(rates[key])]);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ hata: err.message });
  }
});

module.exports = app;
