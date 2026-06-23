@echo off
:: Encoding set to UTF-8 for Turkish character support in Windows Command Prompt
chcp 65001 > null

echo ======================================================================
echo   Hausmart Yerel Ağ Bağlantısı - Windows Güvenlik Duvarı Port Açıcı
echo ======================================================================
echo.
echo Bu araç, yerel ağdaki (LAN/Wi-Fi) diğer cihazların bu bilgisayarda
echo çalışan Hausmart API Sunucusuna bağlanabilmesi için 8765 nolu portu
echo Windows Güvenlik Duvarı'nda (Firewall) gelen bağlantılara açacaktır.
echo.
echo Lütfen bu dosyaya sağ tıklayıp "YÖNETİCİ OLARAK ÇALIŞTIR" seçeneğini
echo kullandığınızdan emin olun.
echo.
echo ----------------------------------------------------------------------
echo Devam etmek için bir tuşa basın...
pause > null

net session >nul 2>&1
if %errorLevel% == 0 (
    echo [OK] Yönetici yetkileri doğrulandı. Port açma işlemi başlatılıyor...
    powershell -Command "New-NetFirewallRule -DisplayName 'Hausmart REST API Server' -Direction Inbound -LocalPort 8765 -Protocol TCP -Action Allow -Force"
    echo.
    echo ======================================================================
    echo   İŞLEM TAMAMLANDI!
    echo ======================================================================
    echo 8765 nolu TCP portu Windows Güvenlik Duvarı'nda gelen bağlantılara açıldı.
    echo.
    echo Artık diğer cihazlardaki Hausmart İstemcilerinden "Bağlantı Ayarları"
    echo kısmına bu bilgisayarın yerel IP adresini (örn: http://192.168.1.100:8765)
    echo yazarak giriş yapabilirsiniz.
    echo.
) else (
    echo [HATA] Yetersiz Yetki!
    echo Lütfen bu dosyaya sağ tıklayın ve "Yönetici Olarak Çalıştır" seçeneğini kullanın.
    echo.
)

echo Kapatmak için bir tuşa basın...
pause > null
del null
