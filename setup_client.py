# -*- coding: utf-8 -*-
"""
Hausmart Satış Takip Sistemi - İstemci Kurulum Sihirbazı
"""
import os
import sys
import json
import threading
import subprocess
import tkinter as tk
from tkinter import ttk, messagebox

# Tasarım Renkleri (Sleek Dark Mode)
BG_COLOR = "#1E1E2E"
CARD_BG = "#2D2D44"
TEXT_COLOR = "#F8F8F2"
ACCENT_COLOR = "#00D2FF"  # Cyan/Blue accent for client
SUCCESS_COLOR = "#50FA7B"
ERROR_COLOR = "#FF5555"

class ClientSetupWizard:
    def __init__(self, root):
        self.root = root
        self.root.title("Hausmart İstemci Kurulum Sihirbazı")
        self.root.geometry("550x450")
        self.root.configure(bg=BG_COLOR)
        self.root.resizable(False, False)
        self._center_window(550, 450)

        self.setup_finished = False
        self._load_icon()
        self._build_ui()

    def _center_window(self, w, h):
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.root.geometry(f"{w}x{h}+{int(sw/2 - w/2)}+{int(sh/2 - h/2)}")

    def _load_icon(self):
        icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hausmart_icon.ico")
        if os.path.exists(icon_path):
            try:
                self.root.iconbitmap(icon_path)
            except Exception:
                pass

    def _build_ui(self):
        # Üst Başlık Bandı
        header_frame = tk.Frame(self.root, bg=ACCENT_COLOR, height=70)
        header_frame.pack(fill=tk.X)
        header_frame.pack_propagate(False)
        
        tk.Label(header_frame, text="💻 Hausmart İstemci Kurulumu", 
                 font=("Helvetica", 14, "bold"), fg="black", bg=ACCENT_COLOR).pack(expand=True)

        # İçerik Alanı
        self.content_frame = tk.Frame(self.root, bg=BG_COLOR, padx=25, pady=20)
        self.content_frame.pack(fill=tk.BOTH, expand=True)

        # Bilgi Etiketi
        tk.Label(self.content_frame, 
                 text="Bu sihirbaz, Hausmart Satış Sistemini bu bilgisayara\nİstemci (Client) olarak kuracak ve sunucuya bağlayacaktır.",
                 font=("Helvetica", 10), fg=TEXT_COLOR, bg=BG_COLOR, justify=tk.LEFT).pack(anchor=tk.W, pady=(0, 15))

        # Giriş Alanları
        input_frame = tk.Frame(self.content_frame, bg=BG_COLOR)
        input_frame.pack(fill=tk.X, pady=(0, 15))

        tk.Label(input_frame, text="Sunucu IP Adresi (Server IP):", font=("Helvetica", 10, "bold"), 
                 fg=TEXT_COLOR, bg=BG_COLOR).grid(row=0, column=0, sticky=tk.W, pady=5)
        
        self.ip_var = tk.StringVar(value="192.168.1.100")
        self.ent_ip = tk.Entry(input_frame, textvariable=self.ip_var, font=("Helvetica", 10), 
                               bg=CARD_BG, fg=TEXT_COLOR, insertbackground="white", relief=tk.FLAT, width=20)
        self.ent_ip.grid(row=0, column=1, sticky=tk.W, padx=10, pady=5)

        tk.Label(input_frame, text="Port (Varsayılan 8765):", font=("Helvetica", 10, "bold"), 
                 fg=TEXT_COLOR, bg=BG_COLOR).grid(row=1, column=0, sticky=tk.W, pady=5)
        
        self.port_var = tk.StringVar(value="8765")
        self.ent_port = tk.Entry(input_frame, textvariable=self.port_var, font=("Helvetica", 10), 
                                 bg=CARD_BG, fg=TEXT_COLOR, insertbackground="white", relief=tk.FLAT, width=8)
        self.ent_port.grid(row=1, column=1, sticky=tk.W, padx=10, pady=5)

        # Durum ve İlerleme Alanı
        log_frame = tk.LabelFrame(self.content_frame, text="Kurulum & Bağlantı Durumu", 
                                   fg="#8B92A5", bg=BG_COLOR, font=("Helvetica", 9, "bold"))
        log_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 15))

        self.status_var = tk.StringVar(value="Gereksinimleri kurmak ve bağlantıyı test etmek için başlatın.")
        self.lbl_status = tk.Label(log_frame, textvariable=self.status_var, font=("Helvetica", 9, "italic"),
                                   fg="#8B92A5", bg=BG_COLOR, wraplength=480, justify=tk.LEFT)
        self.lbl_status.pack(anchor=tk.W, padx=10, pady=(8, 2))

        self.progress = ttk.Progressbar(log_frame, mode="determinate", length=460)
        self.progress.pack(padx=10, pady=(5, 10))

        # Alt Butonlar
        self.btn_frame = tk.Frame(self.content_frame, bg=BG_COLOR)
        self.btn_frame.pack(fill=tk.X)

        self.btn_test = tk.Button(self.btn_frame, text="Bağlantıyı Test Et", font=("Helvetica", 10),
                                  bg=CARD_BG, fg=TEXT_COLOR, relief=tk.FLAT, padx=12, pady=6, cursor="hand2",
                                  command=self.test_connection)
        self.btn_test.pack(side=tk.LEFT)

        self.btn_start = tk.Button(self.btn_frame, text="Kurulumu Başlat", font=("Helvetica", 10, "bold"),
                                   bg=ACCENT_COLOR, fg="black", relief=tk.FLAT, padx=15, pady=6, cursor="hand2",
                                   command=self.start_setup)
        self.btn_start.pack(side=tk.RIGHT, padx=5)

        self.btn_close = tk.Button(self.btn_frame, text="Kapat", font=("Helvetica", 10),
                                   bg=CARD_BG, fg=TEXT_COLOR, relief=tk.FLAT, padx=15, pady=6, cursor="hand2",
                                   command=self.root.destroy)
        self.btn_close.pack(side=tk.RIGHT, padx=5)

    def log(self, message, is_error=False, val=None):
        color = ERROR_COLOR if is_error else TEXT_COLOR
        self.status_var.set(message)
        self.lbl_status.config(fg=color)
        if val is not None:
            self.progress["value"] = val
        self.root.update_idletasks()

    def test_connection(self):
        ip = self.ip_var.get().strip()
        port = self.port_var.get().strip()
        if not ip or not port:
            messagebox.showwarning("Eksik Bilgi", "Sunucu IP adresi ve Port boş bırakılamaz.")
            return

        url = f"http://{ip}:{port}"
        self.log(f"Sunucuya bağlanmaya çalışılıyor: {url}...")
        
        def run_test():
            try:
                import requests
                resp = requests.get(f"{url}/api/durum", timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    self.root.after(0, lambda: self.log(f"Bağlantı Başarılı!\nSunucu durumu: Aktif\nVeritabanı: {data.get('db','')}", val=100))
                else:
                    self.root.after(0, lambda: self.log(f"Hata: Sunucu geçersiz yanıt verdi ({resp.status_code})", is_error=True))
            except Exception as e:
                self.root.after(0, lambda: self.log(f"Bağlantı Hatası: Sunucuya erişilemiyor.\n{e}", is_error=True))

        threading.Thread(target=run_test, daemon=True).start()

    def start_setup(self):
        self.btn_start.config(state=tk.DISABLED)
        self.btn_test.config(state=tk.DISABLED)
        self.btn_close.config(state=tk.DISABLED)
        threading.Thread(target=self.run_setup_process, daemon=True).start()

    def run_setup_process(self):
        # 1. Kütüphane Kurulumları
        deps = ["requests", "pillow", "pandas", "reportlab", "openpyxl"]
        total_steps = len(deps) + 4
        current_step = 0

        self.log("Sistem kütüphaneleri kontrol ediliyor...", val=0)
        for dep in deps:
            current_step += 1
            percent = int((current_step / total_steps) * 100)
            self.log(f"Kuruluyor: {dep} ({percent}%)", val=percent)
            try:
                subprocess.run([sys.executable, "-m", "pip", "install", dep], 
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            except Exception:
                pass

        # 2. Config oluşturma
        current_step += 1
        percent = int((current_step / total_steps) * 100)
        self.log(f"Yapılandırma dosyası hazırlanıyor... ({percent}%)", val=percent)
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(base_dir, "config.json")
        
        ip = self.ip_var.get().strip()
        port = self.port_var.get().strip()
        server_url = f"http://{ip}:{port}"
        
        cfg = {
            "mod": "istemci",
            "db_yolu": "", # İstemci yerel DB kullanmaz
            "sunucu_url": server_url
        }
        
        try:
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump(cfg, f, ensure_ascii=False, indent=2)
        except Exception as e:
            self.log(f"Yapılandırma hatası: {e}", is_error=True)
            self.btn_close.config(state=tk.NORMAL)
            return

        # 3. Kısayol Oluşturma
        current_step += 1
        percent = int((current_step / total_steps) * 100)
        self.log(f"Masaüstü kısayolu oluşturuluyor... ({percent}%)", val=percent)
        
        desktop_path = os.path.join(os.environ["USERPROFILE"], "Desktop")
        client_script = os.path.join(base_dir, "satis_hesap.py")
        icon_path = os.path.join(base_dir, "hausmart_icon.ico")
        
        ps_code = f"""
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("{desktop_path}\\Hausmart Satis.lnk")
        $Shortcut.TargetPath = "{sys.executable}"
        $Shortcut.Arguments = "`"{client_script}`""
        $Shortcut.WorkingDirectory = "`"{base_dir}`""
        if (Test-Path "{icon_path}") {{
            $Shortcut.IconLocation = "{icon_path}"
        }}
        $Shortcut.Save()
        """
        try:
            subprocess.run(["powershell", "-Command", ps_code], 
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception as e:
            self.log(f"Kısayol oluşturma hatası: {e}", is_error=True)

        # 4. Bitiş
        current_step += 2
        self.log("İstemci kurulumu başarıyla tamamlandı!", val=100)
        
        self.root.after(0, self.finish_setup_ui)

    def finish_setup_ui(self):
        self.lbl_status.config(fg=SUCCESS_COLOR)
        self.status_var.set("Kurulum ve yapılandırma tamamlandı!\n\nMasaüstüne 'Hausmart Satis' kısayolu başarıyla eklendi.\nGiriş yapmak için uygulamayı başlatabilirsiniz.")
        
        self.btn_start.config(text="Uygulamayı Başlat", state=tk.NORMAL, command=self.launch_app)
        self.btn_close.config(state=tk.NORMAL)

    def launch_app(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        client_script = os.path.join(base_dir, "satis_hesap.py")
        try:
            subprocess.Popen([sys.executable, client_script], cwd=base_dir)
            self.root.destroy()
        except Exception as e:
            messagebox.showerror("Hata", f"Uygulama başlatılamadı:\n{e}")

if __name__ == "__main__":
    root = tk.Tk()
    app = ClientSetupWizard(root)
    root.mainloop()
