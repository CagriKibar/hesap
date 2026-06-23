# -*- coding: utf-8 -*-
"""
Hausmart Satış Takip Sistemi - Sunucu Kurulum Sihirbazı
"""
import os
import sys
import json
import socket
import threading
import subprocess
import tkinter as tk
from tkinter import ttk, messagebox

# Tasarım Renkleri (Sleek Dark Mode)
BG_COLOR = "#1E1E2E"
CARD_BG = "#2D2D44"
TEXT_COLOR = "#F8F8F2"
ACCENT_COLOR = "#6C5CE7"
SUCCESS_COLOR = "#50FA7B"
ERROR_COLOR = "#FF5555"

class ServerSetupWizard:
    def __init__(self, root):
        self.root = root
        self.root.title("Hausmart Sunucu Kurulum Sihirbazı")
        self.root.geometry("550x420")
        self.root.configure(bg=BG_COLOR)
        self.root.resizable(False, False)
        self._center_window(550, 420)

        self.setup_finished = False
        self.log_messages = []
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
        
        tk.Label(header_frame, text="🖧 Hausmart Sunucu Kurulumu", 
                 font=("Helvetica", 14, "bold"), fg="white", bg=ACCENT_COLOR).pack(expand=True)

        # İçerik Alanı
        self.content_frame = tk.Frame(self.root, bg=BG_COLOR, padx=25, pady=20)
        self.content_frame.pack(fill=tk.BOTH, expand=True)

        # Bilgi Etiketi
        self.lbl_info = tk.Label(self.content_frame, 
                                 text="Bu sihirbaz, Hausmart Satış Sistemini bu bilgisayara\nSunucu (Server) olarak kuracak ve yapılandıracaktır.",
                                 font=("Helvetica", 10), fg=TEXT_COLOR, bg=BG_COLOR, justify=tk.LEFT)
        self.lbl_info.pack(anchor=tk.W, pady=(0, 15))

        # Log & İlerleme Alanı
        log_frame = tk.LabelFrame(self.content_frame, text="Kurulum İşlemleri", 
                                   fg="#8B92A5", bg=BG_COLOR, font=("Helvetica", 9, "bold"))
        log_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 15))

        self.status_var = tk.StringVar(value="Başlamak için Kurulumu Başlat butonuna tıklayın.")
        self.lbl_status = tk.Label(log_frame, textvariable=self.status_var, font=("Helvetica", 9, "italic"),
                                   fg="#8B92A5", bg=BG_COLOR, wraplength=480, justify=tk.LEFT)
        self.lbl_status.pack(anchor=tk.W, padx=10, pady=(8, 2))

        self.progress = ttk.Progressbar(log_frame, mode="determinate", length=460)
        self.progress.pack(padx=10, pady=(5, 10))

        # Alt Butonlar
        self.btn_frame = tk.Frame(self.content_frame, bg=BG_COLOR)
        self.btn_frame.pack(fill=tk.X)

        self.btn_start = tk.Button(self.btn_frame, text="Kurulumu Başlat", font=("Helvetica", 10, "bold"),
                                   bg=ACCENT_COLOR, fg="white", relief=tk.FLAT, padx=15, pady=6, cursor="hand2",
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

    def start_setup(self):
        self.btn_start.config(state=tk.DISABLED)
        self.btn_close.config(state=tk.DISABLED)
        threading.Thread(target=self.run_setup_process, daemon=True).start()

    def run_setup_process(self):
        # 1. Kütüphane Kurulumları
        deps = ["flask", "requests", "pillow", "pandas", "reportlab", "openpyxl"]
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
                # Bazı durumlarda pip install hata verse de devam etmeye çalışalım
                pass

        # 2. Config oluşturma
        current_step += 1
        percent = int((current_step / total_steps) * 100)
        self.log(f"Yapılandırma dosyası hazırlanıyor... ({percent}%)", val=percent)
        
        base_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(base_dir, "config.json")
        
        cfg = {
            "mod": "yerel", # Sunucu kendi veritabanını yerel olarak açar
            "db_yolu": os.path.join(base_dir, "satis_takip.db"),
            "sunucu_url": "http://127.0.0.1:8765"
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
        server_script = os.path.join(base_dir, "satis_server.py")
        icon_path = os.path.join(base_dir, "hausmart_icon.ico")
        
        ps_code = f"""
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("{desktop_path}\\Hausmart Sunucu.lnk")
        $Shortcut.TargetPath = "{sys.executable}"
        $Shortcut.Arguments = "`"{server_script}`""
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

        # 4. Sunucu IP adresini bulup gösterme
        current_step += 2
        self.log("Kurulum başarıyla tamamlandı!", val=100)
        
        # IP'leri bul
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

        ip_list_str = ", ".join(ips)
        
        # Arayüzü başarı durumuna göre güncelle
        self.root.after(0, lambda: self.finish_setup_ui(ip_list_str))

    def finish_setup_ui(self, ip_list_str):
        self.lbl_status.config(fg=SUCCESS_COLOR)
        success_msg = f"Kurulum Tamamlandı!\n\nBu bilgisayarın IP adresleri: {ip_list_str}\n\nİstemci bilgisayarları bağlarken yukarıdaki IP adreslerinden birini kullanın."
        self.status_var.set(success_msg)
        
        self.btn_start.config(text="Sunucuyu Başlat", state=tk.NORMAL, command=self.launch_server)
        self.btn_close.config(state=tk.NORMAL)

    def launch_server(self):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        server_script = os.path.join(base_dir, "satis_server.py")
        try:
            subprocess.Popen([sys.executable, server_script], cwd=base_dir)
            self.root.destroy()
        except Exception as e:
            messagebox.showerror("Hata", f"Sunucu başlatılamadı:\n{e}")

if __name__ == "__main__":
    root = tk.Tk()
    app = ServerSetupWizard(root)
    root.mainloop()
