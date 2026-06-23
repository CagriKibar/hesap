# Hausmart Fiyatlandırma & Satış Takip Sistemi (Electron.js Portu)

Bu proje, orijinal Python/Tkinter tabanlı Hausmart uygulamasının modern **Electron.js** (Masaüstü İstemci) ve **Node.js/Express** (API Sunucu) mimarisine dönüştürülmüş halidir. Orijinal uygulamanın tüm mantığına, hesaplama formüllerine, yetki sınırlandırmalarına ve Raporlama (PDF/Excel) formatlarına sadık kalınarak, modern ve görsel olarak geliştirilmiş bir web arayüzü ile yeniden yazılmıştır.

---

## Öne Çıkan Özellikler

1. **Sıfır Yerel Derleme Hatası (Zero Native Compilation Issues)**: Standalone SQLite arayüzü, WebAssembly tabanlı `sql.js` motoru ile geliştirilmiştir. Bu sayede uygulamanın paketlenmesi ve farklı bilgisayarlarda derlenmesi esnasında karşılaşılan C++ derleyici (Visual Studio Build Tools, Python) gereksinimleri tamamen ortadan kaldırılmıştır. Her bilgisayarda sıfır hata payıyla çalışır.
2. **Esnek Bağlantı Yapısı**: İstemci uygulaması 3 farklı modda çalışabilir:
   - **Yerel Mod**: SQLite veritabanını doğrudan kendi bilgisayarında açar.
   - **Ağ Paylaşım Modu**: Ortak ağ klasöründeki (`\\SUNUCU\Paylasim\satis_takip.db`) SQLite dosyasına doğrudan bağlanır.
   - **HTTP İstemci Modu**: Sunucu bilgisayarındaki Express REST API'ye HTTP protokolü üzerinden bağlanır.
3. **Bulut / Domain Sunucu Desteği**: Express tabanlı API sunucusu (`server.js`) son derece hafiftir. Herhangi bir yerel Windows bilgisayarda, Linux VPS/VDS sunucuda veya cPanel Node.js servislerinde kolaylıkla çalıştırılabilir.
4. **Entegre Sunucu Başlatıcı**: Süper Admin yetkisine sahip kullanıcılar, Electron masaüstü uygulamasının "Sunucu Yönetimi" sekmesini kullanarak tek tıklamayla entegre API sunucusunu başlatabilir veya durdurabilir.

---

## Gereksinimler & Kurulum

Uygulamayı çalıştırmak ve paketlemek için bilgisayarınızda **Node.js** (LTS sürümü önerilir) kurulu olmalıdır.

### 1. Kütüphanelerin Yüklenmesi
Proje dizininde (komut satırı veya PowerShell'de) aşağıdaki komutu çalıştırarak tüm bağımlılıkları indirin:
```bash
npm install
```

### 2. Uygulamayı Geliştirici Modunda Başlatma
Masaüstü uygulamasını çalıştırmak için:
```bash
npm start
```

### 3. Standalone Sunucuyu Başlatma (Hosting / Server PC)
REST API sunucusunu bağımsız olarak (Masaüstü arayüzü olmadan) çalıştırmak için:
```bash
npm run server
```
*Not: Sunucu varsayılan olarak `8765` portunu kullanır. Dilerseniz ortam değişkenleri (Environment Variables) üzerinden `PORT` ve `DB_PATH` tanımlayabilirsiniz.*

---

## Uygulamayı Paketleme (Tek Dosya `.exe` Oluşturma)

Masaüstü uygulamasını, üzerinde Node.js kurulu olmayan herhangi bir hedef Windows bilgisayara kurup çalıştırmak üzere tek bir `.exe` (portable) haline getirmek için:

```bash
npm run build
```

Bu işlem tamamlandığında, projenin ana dizininde `dist/` klasörü oluşacak ve içerisinde **`Hausmart Satis.exe`** dosyası yer alacaktır. Bu dosyayı dilediğiniz bilgisayara kopyalayıp doğrudan çalıştırabilirsiniz.

---

## Veritabanı Yapısı & Yedekleme
Veritabanı olarak kullanılan SQLite dosyası varsayılan olarak **`satis_takip.db`** ismiyle ana dizinde yer alır. Veritabanını yedeklemek için bu dosyayı kopyalamanız yeterlidir.

Yeni veritabanı kurulumu otomatik olarak yapılır; default kullanıcılar şunlardır:
- **Süper Admin:** `superadmin` / `super123`
- **Yönetici:** `admin` / `admin123`
- **Personel:** `satis` / `satis123`

---

## Yerel Ağdaki (LAN/Wi-Fi) Diğer Cihazları Bağlama Rehberi

Yerel ağdaki diğer bilgisayarların sunucu veritabanına bağlanıp çalışabilmesi için aşağıdaki iki yöntemden birini uygulayabilirsiniz:

### Yöntem A: HTTP REST API Bağlantısı (Önerilen)

1. **Güvenlik Duvarı Portunu Açın**: Sunucu olarak kullanacağınız bilgisayarda `sunucu_port_ac.bat` dosyasına sağ tıklayıp **"Yönetici Olarak Çalıştır"** deyin. Bu işlem, diğer bilgisayarların sunucuya erişebilmesi için `8765` nolu portu Windows Güvenlik Duvarı'nda açar.
2. **Sunucuyu Başlatın**: Sunucu bilgisayarındaki Hausmart uygulamasını açın ve **"Sunucu Yönetimi"** sekmesinden entegre REST API sunucusunu başlatın (veya sunucu bilgisayarda komut satırından `npm run server` çalıştırın).
3. **Sunucu IP Adresini Alın**: Sunucu uygulamasının "Sunucu Yönetimi" sekmesinde listelenen IP adresini kopyalayın (Örn: `http://192.168.1.100:8765`).
4. **İstemcileri Bağlayın**: Diğer bilgisayarlarda Hausmart masaüstü uygulamasını açın:
   - Giriş ekranında en alttaki **"⚙ Bağlantı Ayarları"** butonuna tıklayın.
   - **"HTTP İstemci Modu"** seçeneğini seçin.
   - **Sunucu API Adresi** alanına sunucu IP adresini (örn: `http://192.168.1.100:8765`) yapıştırın.
   - **Bağlantıyı Test Et** butonuna tıklayarak bağlantıyı doğrulayın ve **Kaydet** deyin.

### Yöntem B: Ağ Paylaşımlı SQLite Bağlantısı

1. **Veritabanı Klasörünü Paylaşıma Açın**: Sunucu bilgisayarındaki `satis_takip.db` dosyasının bulunduğu klasörü ağda **Okuma/Yazma** yetkileriyle paylaşıma açın.
2. **Ağ Yolunu Kopyalayın**: Klasörün ağdaki UNC yolunu alın (Örn: `\\SUNUCU-PC\Paylasim\satis_takip.db`).
3. **İstemcileri Yapılandırın**: Diğer bilgisayarlarda Hausmart uygulamasını açın:
   - Giriş ekranında **"⚙ Bağlantı Ayarları"** butonuna tıklayın.
   - **"Ağ Paylaşım Modu"** seçeneğini seçin.
   - **Ağ DB Dosya Yolu** alanına kopyaladığınız yolu girin.
   - Kaydedip uygulamayı yeniden başlatın.

