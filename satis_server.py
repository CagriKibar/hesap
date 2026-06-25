"""
Hausmart Sunucu Uygulaması
==========================
Bu betik, Hausmart veritabanını HTTP REST API üzerinden paylaşır.
Sunucu olarak kullanılacak bilgisayarda çalıştırın.
Diğer bilgisayarlar satis_hesap.py'yi "İstemci" modunda açarak bağlanır.
"""

import os
import sys
import json
import sqlite3
import datetime
import threading
import socket
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext

# Flask kurulu değilse kullanıcıyı bilgilendir
try:
    from flask import Flask, request, jsonify
    FLASK_OK = True
except ImportError:
    FLASK_OK = False

# ───────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DB_PATH    = os.path.join(BASE_DIR, "satis_takip.db")
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
DEFAULT_PORT = 8765
# ───────────────────────────────────────────────

def get_local_ips():
    """Bu makinenin tüm ağ IP adreslerini döner."""
    ips = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127.") and ":" not in ip:
                ips.append(ip)
    except Exception:
        pass
    if not ips:
        ips.append("127.0.0.1")
    return ips

def db():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(satislar)")
        cols = [r["name"] for r in cursor.fetchall()]
        if "fatura_no" not in cols:
            cursor.execute("ALTER TABLE satislar ADD COLUMN fatura_no TEXT")
            cursor.execute("ALTER TABLE satislar ADD COLUMN irsaliye_no TEXT")
            cursor.execute("ALTER TABLE satislar ADD COLUMN fatura_yolu TEXT")
            cursor.execute("ALTER TABLE satislar ADD COLUMN teslim_durumu INTEGER DEFAULT 0")
            cursor.execute("ALTER TABLE satislar ADD COLUMN teslim_yeri TEXT")
            cursor.execute("ALTER TABLE satislar ADD COLUMN teslim_notu TEXT")
            conn.commit()
    except Exception as e:
        print(f"Db migration error: {e}")
    return conn

# ─── Flask uygulaması ───────────────────────────
if FLASK_OK:
    app = Flask(__name__)

    @app.route("/api/durum", methods=["GET"])
    def durum():
        return jsonify({"durum": "aktif", "zaman": datetime.datetime.now().isoformat(), "db": DB_PATH})

    @app.route("/api/login", methods=["POST"])
    def login():
        data = request.get_json()
        u, p = data.get("kullanici_adi",""), data.get("sifre","")
        conn = db()
        row = conn.execute(
            "SELECT kullanici_adi, rol, aktif FROM kullanicilar WHERE kullanici_adi=? AND sifre=?",
            (u, p)
        ).fetchone()
        conn.close()
        if not row:
            return jsonify({"hata": "Geçersiz kimlik bilgileri"}), 401
        if row["aktif"] == 0:
            return jsonify({"hata": "Hesap pasif"}), 403
        return jsonify({"kullanici_adi": row["kullanici_adi"], "rol": row["rol"], "aktif": row["aktif"]})

    def calculate_kar_orani(r):
        qty = r["miktar"] if r["miktar"] is not None else 0.0
        if qty <= 0:
            return 0.0
        base_price = r["baz_satis_fiyati"] if r["baz_satis_fiyati"] is not None else 0.0
        purchase_price = r["alis_fiyati"] if r["alis_fiyati"] is not None else 0.0
        bag_weight = r["torba_agirligi"] if r["torba_agirligi"] is not None else 50.0
        u_qty_type = r["birim"] if r["birim"] is not None else 'TORBA'
        u_pur_type = r["alis_birimi"] if r["alis_birimi"] is not None else u_qty_type
        u_sel_type = r["fiyat_birimi"] if r["fiyat_birimi"] is not None else u_qty_type

        weights = {
            'KG': 1.0,
            'TON': 1000.0,
            'TORBA': bag_weight,
            'M2': 1.0
        }

        pur_conversion_factor = 1.0
        if u_qty_type != u_pur_type and u_qty_type != 'M2' and u_pur_type != 'M2':
            w_q = weights.get(u_qty_type, 1.0)
            w_pur = weights.get(u_pur_type, 1.0)
            pur_conversion_factor = w_q / w_pur

        sel_conversion_factor = 1.0
        if u_qty_type != u_sel_type and u_qty_type != 'M2' and u_sel_type != 'M2':
            w_q = weights.get(u_qty_type, 1.0)
            w_sel = weights.get(u_sel_type, 1.0)
            sel_conversion_factor = w_q / w_sel

        converted_purchase_price = purchase_price * pur_conversion_factor
        converted_base_price = base_price * sel_conversion_factor
        ship_cost = r["nakliye_maliyeti"] if (r["nakliye_dahil"] == 1 and r["nakliye_maliyeti"] is not None) else 0.0
        unload_cost = r["indirme_maliyeti"] if (r["indirme_dahil"] == 1 and r["indirme_maliyeti"] is not None) else 0.0

        unit_extra_cost = (ship_cost + unload_cost) / qty
        unit_cost = (converted_purchase_price + unit_extra_cost) if converted_purchase_price > 0 else 0.0
        unit_base_price = converted_base_price + unit_extra_cost

        expected_profit = ((unit_base_price - unit_cost) * qty) if unit_cost > 0 else 0.0
        return (expected_profit / (unit_cost * qty) * 100) if unit_cost > 0 else 0.0

    def recalculate_and_heal_sales_profits():
        try:
            conn = db()
            conn.row_factory = sqlite3.Row
            sales = conn.execute("SELECT * FROM satislar").fetchall()
            for r in sales:
                qty = r["miktar"] if r["miktar"] is not None else 0.0
                if qty <= 0:
                    continue
                base_price = r["baz_satis_fiyati"] if r["baz_satis_fiyati"] is not None else 0.0
                purchase_price = r["alis_fiyati"] if r["alis_fiyati"] is not None else 0.0
                bag_weight = r["torba_agirligi"] if r["torba_agirligi"] is not None else 50.0
                u_qty_type = r["birim"] if r["birim"] is not None else 'TORBA'
                u_pur_type = r["alis_birimi"] if r["alis_birimi"] is not None else u_qty_type
                u_sel_type = r["fiyat_birimi"] if r["fiyat_birimi"] is not None else u_qty_type

                weights = {
                    'KG': 1.0,
                    'TON': 1000.0,
                    'TORBA': bag_weight,
                    'M2': 1.0
                }

                pur_conversion_factor = 1.0
                if u_qty_type != u_pur_type and u_qty_type != 'M2' and u_pur_type != 'M2':
                    w_q = weights.get(u_qty_type, 1.0)
                    w_pur = weights.get(u_pur_type, 1.0)
                    pur_conversion_factor = w_q / w_pur

                sel_conversion_factor = 1.0
                if u_qty_type != u_sel_type and u_qty_type != 'M2' and u_sel_type != 'M2':
                    w_q = weights.get(u_qty_type, 1.0)
                    w_sel = weights.get(u_sel_type, 1.0)
                    sel_conversion_factor = w_q / w_sel

                converted_purchase_price = purchase_price * pur_conversion_factor
                converted_base_price = base_price * sel_conversion_factor
                ship_cost = r["nakliye_maliyeti"] if (r["nakliye_dahil"] == 1 and r["nakliye_maliyeti"] is not None) else 0.0
                unload_cost = r["indirme_maliyeti"] if (r["indirme_dahil"] == 1 and r["indirme_maliyeti"] is not None) else 0.0

                unit_extra_cost = (ship_cost + unload_cost) / qty
                unit_cost = (converted_purchase_price + unit_extra_cost) if converted_purchase_price > 0 else 0.0
                unit_base_price = converted_base_price + unit_extra_cost

                expected_profit = ((unit_base_price - unit_cost) * qty) if unit_cost > 0 else 0.0
                stored_profit = r["kar"] if r["kar"] is not None else 0.0
                diff = abs(expected_profit - stored_profit)

                if diff > 0.02:
                    conn.execute("UPDATE satislar SET kar=? WHERE id=?", (expected_profit, r["id"]))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Auto-heal failed: {e}")

    @app.route("/api/satislar", methods=["GET"])
    def satislar_listele():
        recalculate_and_heal_sales_profits()
        conn = db()
        rows = conn.execute("SELECT * FROM satislar ORDER BY id DESC").fetchall()
        conn.close()
        
        res = []
        for r in rows:
            rd = dict(r)
            kar_orani = calculate_kar_orani(r)
            res.append({
                "id": rd["id"],
                "tarih": rd["tarih"],
                "kullanici": rd["kullanici"],
                "musteri_adi": rd["musteri_adi"],
                "urun_adi": rd["urun_adi"],
                "miktar": rd["miktar"],
                "birim": rd["birim"],
                "toplam_tutar": rd["toplam_tutar"],
                "kar": rd["kar"],
                "irsaliye_yolu": rd["irsaliye_yolu"],
                "kar_orani": kar_orani,
                "fatura_no": rd.get("fatura_no"),
                "irsaliye_no": rd.get("irsaliye_no"),
                "fatura_yolu": rd.get("fatura_yolu"),
                "teslim_durumu": rd.get("teslim_durumu"),
                "teslim_yeri": rd.get("teslim_yeri"),
                "teslim_notu": rd.get("teslim_notu")
            })
        return jsonify(res)

    @app.route("/api/satislar", methods=["POST"])
    def satis_ekle():
        data = request.get_json()
        conn = db()
        conn.execute("""
            INSERT INTO satislar (
                tarih, kullanici, musteri_adi, urun_adi, miktar, birim, fiyat_birimi, torba_agirligi,
                alis_fiyati, baz_satis_fiyati, odeme_turu, vade_ay, vade_orani,
                birim_fiyat, toplam_tutar, kar, irsaliye_yolu,
                nakliye_dahil, nakliye_maliyeti, indirme_dahil, indirme_maliyeti, alis_birimi,
                fatura_no, irsaliye_no, fatura_yolu, teslim_durumu, teslim_yeri, teslim_notu
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            data["tarih"], data["kullanici"], data.get("musteri_adi"), data.get("urun_adi"),
            data.get("miktar"), data.get("birim"), data.get("fiyat_birimi"), data.get("torba_agirligi"),
            data.get("alis_fiyati",0), data.get("baz_satis_fiyati",0), data.get("odeme_turu"),
            data.get("vade_ay",0), data.get("vade_orani",0),
            data.get("birim_fiyat",0), data.get("toplam_tutar",0), data.get("kar",0),
            data.get("irsaliye_yolu",""),
            data.get("nakliye_dahil",0), data.get("nakliye_maliyeti",0.0),
            data.get("indirme_dahil",0), data.get("indirme_maliyeti",0.0),
            data.get("alis_birimi",""),
            data.get("fatura_no", ""), data.get("irsaliye_no", ""), data.get("fatura_yolu", ""),
            data.get("teslim_durumu", 0), data.get("teslim_yeri", ""), data.get("teslim_notu", "")
        ))
        conn.commit()
        lid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.close()
        return jsonify({"id": lid}), 201

    @app.route("/api/satislar/<int:sid>", methods=["GET"])
    def satis_detay(sid):
        conn = db()
        row = conn.execute("SELECT * FROM satislar WHERE id=?", (sid,)).fetchone()
        conn.close()
        if not row:
            return jsonify({"hata": "Bulunamadı"}), 404
        rd = dict(row)
        rd["kar_orani"] = calculate_kar_orani(row)
        return jsonify(rd)

    @app.route("/api/satislar/<int:sid>", methods=["PUT"])
    def satis_guncelle(sid):
        data = request.get_json()
        conn = db()
        conn.execute("""
            UPDATE satislar SET
                tarih=?, musteri_adi=?, urun_adi=?, miktar=?, birim=?, fiyat_birimi=?, torba_agirligi=?,
                alis_fiyati=?, baz_satis_fiyati=?, odeme_turu=?, vade_ay=?, vade_orani=?,
                birim_fiyat=?, toplam_tutar=?, kar=?,
                nakliye_dahil=?, nakliye_maliyeti=?, indirme_dahil=?, indirme_maliyeti=?, alis_birimi=?,
                fatura_no=?, irsaliye_no=?
            WHERE id=?
        """, (
            data["tarih"], data["musteri_adi"], data["urun_adi"],
            data["miktar"], data["birim"], data["fiyat_birimi"], data["torba_agirligi"],
            data.get("alis_fiyati",0), data.get("baz_satis_fiyati",0), data["odeme_turu"],
            data.get("vade_ay",0), data.get("vade_orani",0),
            data.get("birim_fiyat",0), data.get("toplam_tutar",0), data.get("kar",0),
            data.get("nakliye_dahil",0), data.get("nakliye_maliyeti",0.0),
            data.get("indirme_dahil",0), data.get("indirme_maliyeti",0.0),
            data.get("alis_birimi",""),
            data.get("fatura_no", ""), data.get("irsaliye_no", ""),
            sid
        ))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})

    @app.route("/api/satislar/<int:sid>", methods=["DELETE"])
    def satis_sil(sid):
        conn = db()
        conn.execute("DELETE FROM satislar WHERE id=?", (sid,))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})

    @app.route("/api/satislar/<int:sid>/irsaliye", methods=["PUT"])
    def irsaliye_guncelle(sid):
        data = request.get_json()
        conn = db()
        conn.execute("UPDATE satislar SET irsaliye_yolu=? WHERE id=?", (data.get("yol",""), sid))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})

    @app.route("/api/satislar/<int:sid>/fatura", methods=["PUT"])
    def fatura_guncelle(sid):
        data = request.get_json()
        conn = db()
        conn.execute("UPDATE satislar SET fatura_yolu=? WHERE id=?", (data.get("yol",""), sid))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})

    @app.route("/api/satislar/<int:sid>/teslim", methods=["PUT"])
    def teslim_guncelle(sid):
        data = request.get_json()
        conn = db()
        conn.execute(
            "UPDATE satislar SET teslim_durumu=1, teslim_yeri=?, teslim_notu=? WHERE id=?",
            (data.get("teslim_yeri",""), data.get("teslim_notu",""), sid)
        )
        conn.commit()
        conn.close()
        return jsonify({"ok": True})

    @app.route("/api/kullanicilar", methods=["GET"])
    def kullanicilar_listele():
        conn = db()
        rows = conn.execute("SELECT id, kullanici_adi, rol, aktif FROM kullanicilar ORDER BY id").fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])

    @app.route("/api/kullanicilar", methods=["POST"])
    def kullanici_ekle():
        data = request.get_json()
        try:
            conn = db()
            conn.execute(
                "INSERT INTO kullanicilar (kullanici_adi, sifre, rol, aktif) VALUES (?,?,?,1)",
                (data["kullanici_adi"], data["sifre"], data["rol"])
            )
            conn.commit()
            conn.close()
            return jsonify({"ok": True}), 201
        except sqlite3.IntegrityError:
            return jsonify({"hata": "Kullanıcı adı mevcut"}), 409

    @app.route("/api/kullanicilar/<int:uid>", methods=["PUT"])
    def kullanici_guncelle(uid):
        data = request.get_json()
        conn = db()
        if "sifre" in data:
            conn.execute("UPDATE kullanicilar SET sifre=? WHERE id=?", (data["sifre"], uid))
        if "rol" in data or "kullanici_adi" in data:
            conn.execute(
                "UPDATE kullanicilar SET kullanici_adi=COALESCE(?,kullanici_adi), rol=COALESCE(?,rol) WHERE id=?",
                (data.get("kullanici_adi"), data.get("rol"), uid)
            )
        if "aktif" in data:
            conn.execute("UPDATE kullanicilar SET aktif=? WHERE id=?", (data["aktif"], uid))
        conn.commit()
        conn.close()
        return jsonify({"ok": True})

    @app.route("/api/kullanicilar/<int:uid>", methods=["DELETE"])
    def kullanici_sil(uid):
        conn = db()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT kullanici_adi FROM kullanicilar WHERE id = ?", (uid,))
            row = cursor.fetchone()
            if row:
                uName = row["kullanici_adi"]
                cursor.execute("SELECT COUNT(*) as count FROM satislar WHERE kullanici = ?", (uName,))
                sales_count = cursor.fetchone()["count"]
                if sales_count > 0:
                    return jsonify({"hata": "Bu kullanıcıya ait satış kayıtları bulunmaktadır. Silme işlemine izin verilmez."}), 400
            
            conn.execute("DELETE FROM kullanicilar WHERE id=?", (uid,))
            conn.commit()
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"hata": str(e)}), 500
        finally:
            conn.close()

    @app.route("/api/ayarlar", methods=["GET"])
    def get_ayarlar():
        conn = db()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT anahtar, deger FROM ayarlar")
            rows = cursor.fetchall()
            rates = {row["anahtar"]: row["deger"] for row in rows}
            return jsonify(rates)
        except Exception as e:
            return jsonify({"hata": str(e)}), 500
        finally:
            conn.close()

    @app.route("/api/ayarlar", methods=["POST"])
    def save_ayarlar():
        data = request.json
        if not data or not isinstance(data, dict):
            return jsonify({"hata": "Geçersiz veri formatı"}), 400
        conn = db()
        try:
            for key, val in data.items():
                conn.execute("INSERT OR REPLACE INTO ayarlar (anahtar, deger) VALUES (?, ?)", (key, str(val)))
            conn.commit()
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"hata": str(e)}), 500
        finally:
            conn.close()

    @app.route("/api/urunler", methods=["GET"])
    def urun_listesi():
        conn = db()
        rows = conn.execute(
            "SELECT DISTINCT urun_adi FROM satislar WHERE urun_adi IS NOT NULL AND urun_adi != '' ORDER BY urun_adi"
        ).fetchall()
        conn.close()
        return jsonify([r[0] for r in rows])

    @app.route("/api/fiyat_gecmisi/<urun_adi>", methods=["GET"])
    def fiyat_gecmisi(urun_adi):
        conn = db()
        rows = conn.execute(
            "SELECT tarih, musteri_adi, miktar, birim, odeme_turu, vade_ay, birim_fiyat, toplam_tutar "
            "FROM satislar WHERE urun_adi=? ORDER BY tarih DESC",
            (urun_adi,)
        ).fetchall()
        conn.close()
        return jsonify([dict(r) for r in rows])

# ─── Tkinter Kontrol Paneli ────────────────────
class SunucuPaneli:
    def __init__(self, root):
        self.root = root
        self.root.title("Hausmart Sunucu Kontrol Paneli")
        self.root.geometry("720x540")
        self.root.configure(bg="#1E1E2E")
        self.root.resizable(False, False)
        self._center(720, 540)

        self.server_thread = None
        self.server_running = False
        self.port_var = tk.StringVar(value=str(DEFAULT_PORT))

        self._load_icon()
        self._build_ui()

    def _center(self, w, h):
        sw, sh = self.root.winfo_screenwidth(), self.root.winfo_screenheight()
        self.root.geometry(f"{w}x{h}+{int(sw/2-w/2)}+{int(sh/2-h/2)}")

    def _load_icon(self):
        try:
            from PIL import Image, ImageDraw
            icon_path = os.path.join(BASE_DIR, "hausmart_icon.ico")
            if os.path.exists(icon_path):
                self.root.iconbitmap(icon_path)
        except Exception:
            pass

    def _build_ui(self):
        # ─ Başlık ─
        hdr = tk.Frame(self.root, bg="#6C5CE7", height=70)
        hdr.pack(fill=tk.X)
        hdr.pack_propagate(False)
        tk.Label(hdr, text="🖧  Hausmart Sunucu Kontrol Paneli",
                 font=("Helvetica", 15, "bold"), bg="#6C5CE7", fg="white").pack(expand=True)

        # ─ İçerik ─
        content = tk.Frame(self.root, bg="#1E1E2E", padx=20, pady=15)
        content.pack(fill=tk.BOTH, expand=True)

        # Durum satırı
        status_row = tk.Frame(content, bg="#1E1E2E")
        status_row.pack(fill=tk.X, pady=(0,10))

        tk.Label(status_row, text="Durum:", bg="#1E1E2E", fg="#aaaaaa",
                 font=("Helvetica", 10)).pack(side=tk.LEFT)
        self.lbl_status = tk.Label(status_row, text="⏹  Durduruldu",
                                   bg="#1E1E2E", fg="#FF7675",
                                   font=("Helvetica", 10, "bold"))
        self.lbl_status.pack(side=tk.LEFT, padx=8)

        # Port
        port_row = tk.Frame(content, bg="#1E1E2E")
        port_row.pack(fill=tk.X, pady=(0,10))
        tk.Label(port_row, text="Port:", bg="#1E1E2E", fg="#aaaaaa",
                 font=("Helvetica", 10)).pack(side=tk.LEFT)
        tk.Entry(port_row, textvariable=self.port_var, width=8,
                 font=("Helvetica", 10), bg="#2D2D44", fg="white",
                 insertbackground="white", relief=tk.FLAT).pack(side=tk.LEFT, padx=8)

        # DB Yolu
        db_row = tk.Frame(content, bg="#1E1E2E")
        db_row.pack(fill=tk.X, pady=(0,10))
        tk.Label(db_row, text="Veritabanı:", bg="#1E1E2E", fg="#aaaaaa",
                 font=("Helvetica", 10)).pack(side=tk.LEFT)
        tk.Label(db_row, text=DB_PATH, bg="#1E1E2E", fg="#00D2FF",
                 font=("Helvetica", 9)).pack(side=tk.LEFT, padx=8)

        # IP Adresleri
        ips = get_local_ips()
        ip_frame = tk.LabelFrame(content, text="Bu Sunucunun IP Adresleri",
                                  bg="#1E1E2E", fg="#aaaaaa",
                                  font=("Helvetica", 10), padx=10, pady=8)
        ip_frame.pack(fill=tk.X, pady=(0,10))

        port = self.port_var.get()
        for ip in ips:
            url = f"http://{ip}:{port}"
            row = tk.Frame(ip_frame, bg="#1E1E2E")
            row.pack(fill=tk.X, pady=2)
            tk.Label(row, text=f"🌐  {url}", bg="#1E1E2E", fg="#00D2FF",
                     font=("Courier", 10, "bold")).pack(side=tk.LEFT)
            tk.Button(row, text="Kopyala", bg="#2D2D44", fg="#aaaaaa",
                      font=("Helvetica", 8), relief=tk.FLAT, cursor="hand2",
                      command=lambda u=url: self._copy(u)).pack(side=tk.LEFT, padx=6)

        # Kontrol butonları
        btn_row = tk.Frame(content, bg="#1E1E2E")
        btn_row.pack(fill=tk.X, pady=10)

        self.btn_start = tk.Button(btn_row, text="▶  Sunucuyu Başlat",
                                   bg="#6C5CE7", fg="white", font=("Helvetica", 11, "bold"),
                                   relief=tk.FLAT, padx=14, pady=8, cursor="hand2",
                                   command=self.start_server)
        self.btn_start.pack(side=tk.LEFT, padx=(0,8))

        self.btn_stop = tk.Button(btn_row, text="⏹  Durdur",
                                  bg="#2D2D44", fg="#aaaaaa", font=("Helvetica", 11, "bold"),
                                  relief=tk.FLAT, padx=14, pady=8, cursor="hand2",
                                  state=tk.DISABLED, command=self.stop_server)
        self.btn_stop.pack(side=tk.LEFT)

        # Log alanı
        log_frame = tk.LabelFrame(content, text="Sunucu Logu",
                                   bg="#1E1E2E", fg="#aaaaaa", font=("Helvetica", 10))
        log_frame.pack(fill=tk.BOTH, expand=True, pady=(10,0))
        self.log_text = scrolledtext.ScrolledText(
            log_frame, height=10, bg="#0D0D1A", fg="#00D2FF",
            font=("Courier", 9), state=tk.DISABLED, relief=tk.FLAT
        )
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=4, pady=4)

        if not FLASK_OK:
            self.log("⚠  Flask kurulu değil. Kurmak için: pip install flask", "red")
            self.btn_start.config(state=tk.DISABLED)
        else:
            self.log("✅  Flask hazır. Sunucuyu başlatmak için ▶ butonuna tıklayın.")

    def log(self, msg, color="#00D2FF"):
        self.log_text.config(state=tk.NORMAL)
        ts = datetime.datetime.now().strftime("%H:%M:%S")
        self.log_text.insert(tk.END, f"[{ts}] {msg}\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)

    def _copy(self, text):
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        messagebox.showinfo("Kopyalandı", f"Panoya kopyalandı:\n{text}")

    def start_server(self):
        if not FLASK_OK:
            return
        try:
            port = int(self.port_var.get())
        except ValueError:
            messagebox.showerror("Hata", "Geçerli bir port numarası girin.")
            return

        self.server_running = True
        self.log(f"🚀  Sunucu başlatılıyor — Port: {port}")

        def run():
            import logging
            log = logging.getLogger("werkzeug")
            log.setLevel(logging.ERROR)
            try:
                app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)
            except Exception as e:
                self.root.after(0, lambda: self.log(f"❌  Sunucu hatası: {e}", "red"))
                self.root.after(0, self._stopped_ui)

        self.server_thread = threading.Thread(target=run, daemon=True)
        self.server_thread.start()

        ips = get_local_ips()
        for ip in ips:
            self.log(f"   → İstemciler şu adresi kullanmalı: http://{ip}:{port}")
        self.log("   → satis_hesap.py'de: Bağlantı Ayarları → İstemci modunu seçin")

        self.lbl_status.config(text="✅  Çalışıyor", fg="#00B894")
        self.btn_start.config(state=tk.DISABLED)
        self.btn_stop.config(state=tk.NORMAL)

    def stop_server(self):
        self.log("⏹  Sunucu durduruluyor (uygulamayı kapatınca tamamen durur)...")
        messagebox.showinfo("Bilgi",
            "Flask sunucusu arka plan thread'i olarak çalışır.\n"
            "Tamamen durdurmak için uygulamayı kapatın.")

    def _stopped_ui(self):
        self.lbl_status.config(text="⏹  Durduruldu", fg="#FF7675")
        self.btn_start.config(state=tk.NORMAL)
        self.btn_stop.config(state=tk.DISABLED)


if __name__ == "__main__":
    # Flask yoksa kur
    if not FLASK_OK:
        print("Flask kurulu değil. Kurmak için: pip install flask")

    root = tk.Tk()
    app_ui = SunucuPaneli(root)
    root.mainloop()
