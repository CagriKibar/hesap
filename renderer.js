// --- Global UI Variables ---
let currentUser = null;
let currentRole = null;
let calculatedData = {};
let currentSaleProducts = [];
let editSaleProducts = [];
let selectedSaleRowId = null;
let selectedUserRowId = null;
let paymentRates = {
  'Nakit': 0.0,
  'Kredi Kartı': 3.0,
  'Çek': 5.0,
  'Senet': 8.0,
  'Evrak': 4.0,
  'DBS': 2.0
};

function formatMoney(value) {
  if (value === undefined || value === null || isNaN(value)) return "0,00";
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

function calculateSaleProfitMarginPct(sale) {
  if (sale.kar_orani !== undefined) {
    return sale.kar_orani;
  }
  
  const qty = sale.miktar || 0.0;
  if (qty <= 0) return 0.0;
  const basePrice = sale.baz_satis_fiyati || 0.0;
  const purchasePrice = sale.alis_fiyati || 0.0;
  const bagWeight = sale.torba_agirligi || 50.0;
  const uQtyType = sale.birim || 'TORBA';
  const uPurType = sale.alis_birimi || uQtyType;
  const uSelType = sale.fiyat_birimi || uQtyType;

  const weights = {
    'KG': 1.0,
    'TON': 1000.0,
    'TORBA': bagWeight,
    'M2': 1.0
  };

  let purConversionFactor = 1.0;
  if (uQtyType !== uPurType && uQtyType !== 'M2' && uPurType !== 'M2') {
    const wQ = weights[uQtyType] || 1.0;
    const wPur = weights[uPurType] || 1.0;
    purConversionFactor = wQ / wPur;
  }

  let selConversionFactor = 1.0;
  if (uQtyType !== uSelType && uQtyType !== 'M2' && uSelType !== 'M2') {
    const wQ = weights[uQtyType] || 1.0;
    const wSel = weights[uSelType] || 1.0;
    selConversionFactor = wQ / wSel;
  }

  const convertedPurchasePrice = purchasePrice * purConversionFactor;
  const convertedBasePrice = basePrice * selConversionFactor;
  const shipCost = sale.nakliye_dahil === 1 ? (sale.nakliye_maliyeti || 0.0) : 0.0;
  const unloadCost = sale.indirme_dahil === 1 ? (sale.indirme_maliyeti || 0.0) : 0.0;

  const unitExtraCost = (shipCost + unloadCost) / qty;
  const unitCost = convertedPurchasePrice > 0 ? (convertedPurchasePrice + unitExtraCost) : 0.0;
  const unitBasePrice = convertedBasePrice + unitExtraCost;

  const expectedProfit = unitCost > 0 ? ((unitBasePrice - unitCost) * qty) : 0.0;
  
  if (unitCost > 0) {
    return expectedProfit / (unitCost * qty) * 100;
  }
  
  // Fallback to old formula if no cost fields available (e.g. connected to old client mode server)
  const totalCost = sale.toplam_tutar - sale.kar;
  return totalCost > 0 ? (sale.kar / totalCost * 100) : 0.0;
}

// Override global dialogs to use native non-blocking Electron APIs
window.alert = function(message) {
  window.api.showAlert(message, 'Hausmart');
};

window.confirm = function(message) {
  return window.api.showConfirm(message, 'Hausmart');
};

function getFloatValue(id, defaultValue = 0.0, minVal = 0.0) {
  const el = document.getElementById(id);
  if (!el) return defaultValue;
  const clean = el.value.trim().replace(/,/g, '.');
  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return defaultValue;
  return parsed < minVal ? defaultValue : parsed;
}

// --- Theme Management ---
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButtonUI(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeButtonUI(newTheme);
}

// --- Payment Rates Syncing ---
async function loadPaymentRates() {
  try {
    const rates = await window.api.getRates();
    if (rates) {
      paymentRates = {
        'Nakit': rates.rate_cash !== undefined ? rates.rate_cash : 0.0,
        'Kredi Kartı': rates.rate_cc !== undefined ? rates.rate_cc : 3.0,
        'Çek': rates.rate_check !== undefined ? rates.rate_check : 5.0,
        'Senet': rates.rate_note !== undefined ? rates.rate_note : 8.0,
        'Evrak': rates.rate_doc !== undefined ? rates.rate_doc : 4.0,
        'DBS': rates.rate_dbs !== undefined ? rates.rate_dbs : 2.0
      };

      const activeEl = document.activeElement;
      const updateVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && el !== activeEl) {
          el.value = val;
        }
      };
      if (rates.rate_cash !== undefined) updateVal('rate-cash', rates.rate_cash);
      if (rates.rate_cc !== undefined) updateVal('rate-cc', rates.rate_cc);
      if (rates.rate_check !== undefined) updateVal('rate-check', rates.rate_check);
      if (rates.rate_note !== undefined) updateVal('rate-note', rates.rate_note);
      if (rates.rate_doc !== undefined) updateVal('rate-doc', rates.rate_doc);
      if (rates.rate_dbs !== undefined) updateVal('rate-dbs', rates.rate_dbs);
      
      // Trigger calculation
      runCumulativePriceCalculation();
    }
  } catch (e) {
    console.error('Error loading rates:', e);
  }
}

async function saveRatesToDb() {
  const rates = {
    rate_cash: getFloatValue('rate-cash', 0.0),
    rate_cc: getFloatValue('rate-cc', 0.0),
    rate_check: getFloatValue('rate-check', 0.0),
    rate_note: getFloatValue('rate-note', 0.0),
    rate_doc: getFloatValue('rate-doc', 0.0),
    rate_dbs: getFloatValue('rate-dbs', 0.0)
  };
  try {
    await window.api.saveRates(rates);
  } catch (e) {
    console.error('Error saving rates:', e);
  }
}

async function checkUpdates() {
  const updateBanner = document.getElementById('update-banner');
  const updateText = document.getElementById('update-text');
  if (!updateBanner) return;

  try {
    const status = await window.api.checkForUpdate();
    if (status) {
      const versionTextEl = document.getElementById('app-version-text');
      if (versionTextEl && status.localVersion) {
        versionTextEl.textContent = `Sürüm: v${status.localVersion}`;
      }
      if (status.updateAvailable) {
        updateText.innerHTML = `Yeni Sürüm Mevcut: <strong>v${status.remoteVersion}</strong> (Mevcut: v${status.localVersion})`;
        updateBanner.classList.remove('hidden');
      } else {
        updateBanner.classList.add('hidden');
      }
    }
  } catch (err) {
    console.error('Update check failed:', err);
  }
}

async function handleManualUpdateCheck() {
  const btn = document.getElementById('btn-check-update-manual');
  const updateBanner = document.getElementById('update-banner');
  const updateText = document.getElementById('update-text');
  
  if (btn) {
    btn.setAttribute('disabled', 'true');
    btn.textContent = 'Kontrol Ediliyor...';
  }

  try {
    const status = await window.api.checkForUpdate();
    if (status) {
      const versionTextEl = document.getElementById('app-version-text');
      if (versionTextEl && status.localVersion) {
        versionTextEl.textContent = `Sürüm: v${status.localVersion}`;
      }
      
      if (status.updateAvailable) {
        updateText.innerHTML = `Yeni Sürüm Mevcut: <strong>v${status.remoteVersion}</strong> (Mevcut: v${status.localVersion})`;
        updateBanner.classList.remove('hidden');
        alert(`Yeni sürüm mevcut: v${status.remoteVersion}\n"Son Sürüme Güncelle" butonunu kullanarak güncelleyebilirsiniz.`);
      } else {
        updateBanner.classList.add('hidden');
        alert(`Uygulamanız günceldir.\nMevcut Sürüm: v${status.localVersion}`);
      }
    } else {
      alert('Sürüm bilgisi alınamadı.');
    }
  } catch (err) {
    alert(`Sürüm kontrolü başarısız oldu:\n${err.message}`);
  } finally {
    if (btn) {
      btn.removeAttribute('disabled');
      btn.textContent = '🔄 Sürüm Kontrol Et';
    }
  }
}

function updateThemeButtonUI(theme) {
  const btn = document.getElementById('btn-toggle-theme');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  const btnLogin = document.getElementById('btn-toggle-theme-login');
  if (btnLogin) {
    btnLogin.textContent = theme === 'dark' ? '☀️ Tema Değiştir' : '🌙 Tema Değiştir';
  }
}

// --- Load Initialization on Startup ---
function safeOn(id, event, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, fn);
}

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize theme synchronously
  initTheme();
  safeOn('btn-toggle-theme', 'click', toggleTheme);
  safeOn('btn-toggle-theme-login', 'click', toggleTheme);

  // 2. Bind ALL UI Event Listeners FIRST so buttons always work unconditionally
  safeOn('btn-login', 'click', handleLogin);
  const passEl = document.getElementById('login-password');
  if (passEl) {
    passEl.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
  }
  
  // Connection settings panel
  safeOn('btn-open-conn-settings', 'click', openConnectionSettingsModal);
  safeOn('btn-test-conn-settings', 'click', testConnectionSettings);
  safeOn('btn-save-conn-settings', 'click', saveConnectionSettings);
  const btnBrowseDb = document.getElementById('btn-browse-db-path');
  if (btnBrowseDb) {
    btnBrowseDb.addEventListener('click', async () => {
      const selected = await window.api.selectDbFile();
      if (selected) {
        const pEl = document.getElementById('conn-db-path');
        if (pEl) pEl.value = selected;
      }
    });
  }
  
  // Update buttons
  const btnInstallUpdate = document.getElementById('btn-install-update');
  if (btnInstallUpdate) {
    btnInstallUpdate.addEventListener('click', async () => {
      btnInstallUpdate.setAttribute('disabled', 'true');
      btnInstallUpdate.textContent = 'Güncelleniyor...';
      try {
        const res = await window.api.installUpdate();
        if (res && res.success) {
          alert('Güncelleme başarıyla tamamlandı. Uygulama yeniden başlatılacak.');
          window.api.relaunchApp();
        }
      } catch (err) {
        alert(`Güncelleme hatası:\n${err.message}`);
        btnInstallUpdate.removeAttribute('disabled');
        btnInstallUpdate.textContent = 'Son Sürüme Güncelle';
      }
    });
  }
  safeOn('btn-check-update-manual', 'click', handleManualUpdateCheck);

  // Dashboard Action Triggers
  safeOn('btn-logout', 'click', handleLogout);
  safeOn('btn-refresh-sales', 'click', refreshSalesTable);
  safeOn('btn-export-all-excel', 'click', handleExportAllSalesExcel);
  safeOn('btn-export-all-pdf', 'click', handleExportAllSalesPdf);
  safeOn('btn-refresh-history-products', 'click', refreshHistoryProducts);
  safeOn('history-product-dropdown', 'change', refreshPriceHistory);
  safeOn('btn-refresh-users', 'click', refreshUsersTable);
  
  // Calculation Tab Action Buttons
  safeOn('btn-export-excel', 'click', exportPriceAnalysisExcel);
  safeOn('btn-export-pdf', 'click', exportPriceAnalysisPdf);
  safeOn('btn-save-sale', 'click', saveSaleRecord);
  safeOn('btn-add-product-to-list', 'click', addProductToCurrentList);
  
  // Sales Tab Action Buttons
  safeOn('btn-view-sale-detail', 'click', viewSaleDetail);
  safeOn('btn-edit-sale', 'click', openEditSaleModal);
  safeOn('btn-save-edit-sale', 'click', saveEditSaleRecord);
  safeOn('btn-edit-sale-add-product', 'click', addProductToEditList);
  setupEditSaleCalculationTraces();

  safeOn('btn-upload-waybill', 'click', uploadWaybillFile);
  safeOn('btn-view-waybill', 'click', viewWaybillFile);
  safeOn('btn-upload-invoice', 'click', uploadInvoiceFile);
  safeOn('btn-view-invoice', 'click', viewInvoiceFile);
  safeOn('btn-deliver-sale', 'click', openDeliverSaleModal);
  safeOn('btn-save-deliver-sale', 'click', saveDeliverSaleRecord);
  safeOn('btn-reprint-pdf', 'click', reprintReceiptPdf);
  safeOn('btn-detail-pdf', 'click', printDetailPdf);
  safeOn('btn-detail-excel', 'click', printDetailExcel);
  safeOn('btn-delete-sale', 'click', deleteSaleRecord);
  
  // User Management Tab Action Buttons
  safeOn('btn-add-user', 'click', openAddUserModal);
  safeOn('btn-edit-user', 'click', openEditUserModal);
  safeOn('btn-reset-password', 'click', openResetPasswordModal);
  safeOn('btn-toggle-user', 'click', toggleUserActiveStatus);
  safeOn('btn-delete-user', 'click', deleteUserRecord);
  
  // Server Tab Action Buttons
  safeOn('server-btn-change-conn', 'click', openConnectionSettingsModal);
  safeOn('server-btn-show-db-folder', 'click', openDbFolderInExplorer);
  safeOn('btn-toggle-integrated-server', 'click', toggleIntegratedExpressServer);

  document.querySelectorAll('.rate-input').forEach(el => {
    el.addEventListener('change', saveRatesToDb);
    el.addEventListener('blur', saveRatesToDb);
  });

  setupTabEvents();
  setupCalculationTraces();
  setupModalEvents();

  // Signature links
  const sigLogin = document.getElementById('link-signature-login');
  if (sigLogin) {
    sigLogin.addEventListener('click', (e) => {
      e.preventDefault();
      window.api.openExternal('https://www.kuisoft.com/');
    });
  }
  const sigDash = document.getElementById('link-signature-dashboard');
  if (sigDash) {
    sigDash.addEventListener('click', (e) => {
      e.preventDefault();
      window.api.openExternal('https://www.kuisoft.com/');
    });
  }

  // 3. Asynchronous initializations (isolated in try-catch so failures never break UI)
  (async () => {
    try {
      await refreshConnectionIndicator();
    } catch (e) { console.error('refreshConnectionIndicator failed:', e); }
    
    try {
      await loadPaymentRates();
      setInterval(loadPaymentRates, 5000);
    } catch (e) { console.error('loadPaymentRates failed:', e); }

    try {
      checkUpdates();
    } catch (e) { console.error('checkUpdates failed:', e); }

    try {
      const config = await window.api.loadConfig();
      if (config) {
        document.getElementById('conn-db-path').value = config.db_yolu || '';
        document.getElementById('conn-server-url').value = config.sunucu_url || '';
      }
    } catch (e) { console.error('loadConfig failed:', e); }
  })();
});

// ==================== TABS MANAGEMENT ====================
function setupTabEvents() {
  document.querySelectorAll('.tab-link').forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      
      // Deactivate all
      document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
      
      // Activate selected
      button.classList.add('active');
      const targetPanel = document.getElementById(tabId);
      if (targetPanel) targetPanel.classList.add('active');
      
      // Refresh tab contents dynamically
      if (tabId === 'tab-hareketler') {
        refreshSalesTable();
      } else if (tabId === 'tab-gecmis') {
        refreshHistoryProducts();
      } else if (tabId === 'tab-kullanicilar') {
        refreshUsersTable();
      } else if (tabId === 'tab-sunucu') {
        refreshServerSettingsTab();
      } else if (tabId === 'tab-hesapla') {
        loadPaymentRates();
      }
    });
  });
}

// ==================== CONNECTION & CONFIGS ====================
async function refreshConnectionIndicator() {
  const indicator = document.getElementById('login-mode-indicator');
  try {
    const config = await window.api.loadConfig();
    if (!indicator) return;
    
    if (config && config.mod === 'istemci') {
      indicator.textContent = `🌐 İstemci: ${config.sunucu_url}`;
    } else if (config && config.mod === 'paylasim') {
      indicator.textContent = `🖥 Ağ Paylaşım: SQLite`;
    } else {
      indicator.textContent = `🖥 Yerel Mod`;
    }
  } catch (e) {
    console.error('Error refreshing connection indicator:', e);
    if (indicator) indicator.textContent = `🖥 Yerel Mod`;
  }
}

async function openConnectionSettingsModal() {
  openModal('modal-conn-settings');
  try {
    const config = await window.api.loadConfig();
    if (config) {
      const radio = document.querySelector(`input[name="conn-mode"][value="${config.mod}"]`);
      if (radio) {
        radio.checked = true;
        triggerConnectionSubForms(config.mod);
      }
      const dbPathEl = document.getElementById('conn-db-path');
      if (dbPathEl) dbPathEl.value = config.db_yolu || '';
      const srvUrlEl = document.getElementById('conn-server-url');
      if (srvUrlEl) srvUrlEl.value = config.sunucu_url || '';
    }
  } catch (err) {
    console.error('Error loading config in modal:', err);
  }
}

// Handle radio sub-forms visibility
document.querySelectorAll('input[name="conn-mode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    triggerConnectionSubForms(e.target.value);
  });
});

function triggerConnectionSubForms(mode) {
  const dbRow = document.getElementById('conn-row-db-path');
  const urlRow = document.getElementById('conn-row-server-url');
  
  dbRow.classList.add('hidden');
  urlRow.classList.add('hidden');
  
  if (mode === 'yerel' || mode === 'paylasim') {
    dbRow.classList.remove('hidden');
  } else if (mode === 'istemci') {
    urlRow.classList.remove('hidden');
  }
}

async function testConnectionSettings() {
  const mode = document.querySelector('input[name="conn-mode"]:checked').value;
  const url = document.getElementById('conn-server-url').value.trim();
  const dbPath = document.getElementById('conn-db-path').value.trim();
  
  try {
    const result = await window.api.testConnection(mode, url, dbPath);
    alert(result.msg);
  } catch (err) {
    alert(`Bağlantı testi başarısız:\n${err.message}`);
  }
}

async function saveConnectionSettings() {
  const mode = document.querySelector('input[name="conn-mode"]:checked').value;
  let url = document.getElementById('conn-server-url').value.trim();
  let dbPath = document.getElementById('conn-db-path').value.trim();
  
  if (mode === 'paylasim' && !dbPath) {
    alert('Lütfen ağ veritabanı dosya yolunu belirtin.');
    return;
  }
  if (mode === 'istemci') {
    if (!url) {
      alert('Lütfen sunucu API adresini belirtin.');
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }
    // Append port if missing
    const urlPart = url.startsWith('http://') ? url.slice(7) : url.slice(8);
    if (!urlPart.includes(':')) {
      url = url.replace(/\/$/, "") + ':8765';
    }
  }

  try {
    await window.api.saveConfig({ mod: mode, db_yolu: dbPath, sunucu_url: url });
    alert('Ayarlar başarıyla kaydedildi. Veritabanı bağlantısı yenilendi.');
    closeAllModals();
    await refreshConnectionIndicator();
  } catch (err) {
    alert(`Ayarlar kaydedilirken hata oluştu:\n${err.message}`);
  }
}

// ==================== AUTHENTICATION ====================
async function handleLogin() {
  const user = document.getElementById('login-username').value.trim();
  const pass = document.getElementById('login-password').value;
  
  if (!user || !pass) {
    alert('Lütfen kullanıcı adı ve şifre giriniz.');
    return;
  }
  
  try {
    const session = await window.api.login(user, pass);
    
    // Store user session info
    currentUser = session.kullanici_adi;
    currentRole = session.rol;
    
    // Set up role UI views
    setupRoleUIViews();
    
    // Load payment rates from DB
    await loadPaymentRates();
    
    // Switch Screen view
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    
    // Set profile info
    document.getElementById('current-user-name').textContent = currentUser;
    document.getElementById('current-user-role').textContent = currentRole;
    
    // Trigger first calculation
    runCumulativePriceCalculation();
  } catch (err) {
    alert(`Giriş Hatası:\n${err.message}`);
    const passInput = document.getElementById('login-password');
    if (passInput) {
      passInput.value = '';
      passInput.focus();
      passInput.select();
    }
  }
}

function handleLogout() {
  currentUser = null;
  currentRole = null;
  
  // Clear inputs
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  
  // Reset tabs
  document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  document.querySelector('[data-tab="tab-hesapla"]').classList.add('active');
  document.getElementById('tab-hesapla').classList.add('active');
  
  // Re-enable connection settings for login screen config
  const connSettingsInputs = document.querySelectorAll('#modal-conn-settings input, #modal-conn-settings button');
  connSettingsInputs.forEach(el => el.removeAttribute('disabled'));
  
  // Switch view back to Login
  document.getElementById('dashboard-container').classList.add('hidden');
  document.getElementById('login-container').classList.remove('hidden');
}

function setupRoleUIViews() {
  // 1. Tab visibility
  // Sunucu Yönetimi tab button: Hidden for everyone except Süper Admin
  const navBtnSunucu = document.getElementById('nav-btn-sunucu');
  if (navBtnSunucu) {
    if (currentRole === 'Süper Admin') {
      navBtnSunucu.classList.remove('hidden');
    } else {
      navBtnSunucu.classList.add('hidden');
    }
  }

  // Kullanıcı Yönetimi tab button: Visible for all logged-in roles
  const navBtnKullanicilar = document.getElementById('nav-btn-kullanicilar');
  if (navBtnKullanicilar) {
    navBtnKullanicilar.classList.remove('hidden');
  }

  // 2. Tab panels inputs/buttons disabling
  // Sunucu Yönetimi tab inputs: enabled only for Süper Admin
  const sunucuInputs = document.querySelectorAll('#tab-sunucu input, #tab-sunucu select, #tab-sunucu button');
  if (currentRole === 'Süper Admin') {
    sunucuInputs.forEach(el => el.removeAttribute('disabled'));
  } else {
    sunucuInputs.forEach(el => el.setAttribute('disabled', 'true'));
  }

  // 3. tab-kullanicilar elements based on role (fully enabled for all roles)
  const btnAddUser = document.getElementById('btn-add-user');
  const btnToggleUser = document.getElementById('btn-toggle-user');
  const btnDeleteUser = document.getElementById('btn-delete-user');
  
  if (btnAddUser) btnAddUser.classList.remove('hidden');
  if (btnToggleUser) btnToggleUser.classList.remove('hidden');
  if (btnDeleteUser) btnDeleteUser.classList.remove('hidden');

  const usersTabInputs = document.querySelectorAll('#tab-kullanicilar input, #tab-kullanicilar select, #tab-kullanicilar button');
  usersTabInputs.forEach(el => el.removeAttribute('disabled'));

  // 4. Modals inputs/buttons disabling (fully enabled for all roles)
  const addUserModalInputs = document.querySelectorAll('#modal-add-user input, #modal-add-user select, #modal-add-user button');
  addUserModalInputs.forEach(el => el.removeAttribute('disabled'));

  const editUserModalInputs = document.querySelectorAll('#modal-edit-user input, #modal-edit-user select, #modal-edit-user button');
  editUserModalInputs.forEach(el => el.removeAttribute('disabled'));

  const resetPasswordModalInputs = document.querySelectorAll('#modal-reset-password input, #modal-reset-password button');
  resetPasswordModalInputs.forEach(el => el.removeAttribute('disabled'));

  // Connection settings modal: unlocked for all roles so anyone can edit DB path or IP
  const connSettingsInputs = document.querySelectorAll('#modal-conn-settings input, #modal-conn-settings button, #modal-conn-settings select');
  connSettingsInputs.forEach(el => el.removeAttribute('disabled'));

  // 5. Pricing & Sales fields permissions (payment rates inputs are now enabled for everyone so they can be edited)
  document.querySelectorAll('.manager-only').forEach(el => el.classList.remove('hidden'));
  document.querySelectorAll('.manager-col').forEach(el => el.classList.remove('hidden'));
  
  const purchasePriceInput = document.getElementById('purchase-price');
  const purchasePriceType = document.getElementById('purchase-price-type');
  const deleteSaleBtn = document.getElementById('btn-delete-sale');
  
  if (purchasePriceInput) purchasePriceInput.removeAttribute('disabled');
  if (purchasePriceType) purchasePriceType.removeAttribute('disabled');
  
  // Everyone (including Personel) can edit base rates now as requested
  document.querySelectorAll('.rate-input').forEach(el => el.removeAttribute('disabled'));
  
  if (currentRole === 'Yönetici' || currentRole === 'Süper Admin') {
    if (deleteSaleBtn) deleteSaleBtn.removeAttribute('disabled');
  } else {
    // Personel Mod
    if (deleteSaleBtn) deleteSaleBtn.setAttribute('disabled', 'true');
  }
}

// ==================== TAB 1: PRICING CALCULATION ====================
function setupCalculationTraces() {
  const inputs = [
    'qty', 'purchase-price', 'base-price', 'vade-rate', 'bag-weight',
    'shipping-cost', 'unloading-cost', 'rate-cash', 'rate-cc', 'rate-check',
    'rate-note', 'rate-doc', 'rate-dbs', 'unit-type', 'purchase-price-type',
    'base-price-type', 'receipt-type', 'vade-months'
  ];
  
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(eventName, runCumulativePriceCalculation);
    }
  });
  
  // Shipping & Unloading Cost inputs toggling
  document.getElementById('has-shipping').addEventListener('change', (e) => {
    const el = document.getElementById('shipping-cost');
    if (e.target.checked) {
      el.removeAttribute('disabled');
    } else {
      el.setAttribute('disabled', 'true');
      el.value = '';
    }
    runCumulativePriceCalculation();
  });
  
  document.getElementById('has-unloading').addEventListener('change', (e) => {
    const el = document.getElementById('unloading-cost');
    if (e.target.checked) {
      el.removeAttribute('disabled');
    } else {
function runCumulativePriceCalculation() {
  const qty = getFloatValue('qty', 1.0, 0.0001);
  const basePrice = getFloatValue('base-price', 0.0);
  const purchasePrice = getFloatValue('purchase-price', 0.0);
  const bagWeight = getFloatValue('bag-weight', 50.0, 0.0001);
  
  const uQtyType = document.getElementById('unit-type').value;
  const uPurType = document.getElementById('purchase-price-type').value;
  const uSelType = document.getElementById('base-price-type').value;
  
  // Toggle Bag Weight field visibility
  const hasTorba = [uQtyType, uPurType, uSelType].includes('TORBA');
  const bagInput = document.getElementById('bag-weight');
  if (bagInput) {
    if (hasTorba) {
      bagInput.removeAttribute('disabled');
    } else {
      bagInput.setAttribute('disabled', 'true');
    }
  }
  
  // Vade interest Calculations
  const vadeMonths = parseInt(document.getElementById('vade-months').value) || 0;
  const vadeRate = getFloatValue('vade-rate', 0.0);
  const totalVadeSurcharge = vadeMonths * vadeRate;
  document.getElementById('lbl-vade-summary-pct').textContent = `%${totalVadeSurcharge.toFixed(2)}`;
  
  // Shipping / Unloading values
  const hasShipping = document.getElementById('has-shipping').checked;
  const shipCost = hasShipping ? getFloatValue('shipping-cost', 0.0) : 0.0;
  
  const hasUnloading = document.getElementById('has-unloading').checked;
  const unloadCost = hasUnloading ? getFloatValue('unloading-cost', 0.0) : 0.0;

  let targetProducts = [];
  if (currentSaleProducts.length === 0) {
    if (basePrice > 0) {
      const weights = { 'KG': 1.0, 'TON': 1000.0, 'TORBA': bagWeight, 'M2': 1.0 };
      let purConversionFactor = 1.0;
      if (uQtyType !== uPurType && uQtyType !== 'M2' && uPurType !== 'M2') {
        purConversionFactor = (weights[uQtyType] || 1.0) / (weights[uPurType] || 1.0);
      }
      let selConversionFactor = 1.0;
      if (uQtyType !== uSelType && uQtyType !== 'M2' && uSelType !== 'M2') {
        selConversionFactor = (weights[uQtyType] || 1.0) / (weights[uSelType] || 1.0);
      }
      
      const convertedPurchasePrice = purchasePrice * purConversionFactor;
      const convertedBasePrice = basePrice * selConversionFactor;
      const kar = purchasePrice > 0 ? (convertedBasePrice - convertedPurchasePrice) * qty : 0.0;
      
      targetProducts.push({
        base_subtotal: convertedBasePrice * qty,
        kar: kar,
        birim_fiyat: convertedBasePrice,
        miktar: qty,
        birim: uQtyType
      });
      
      // Build conversion display info banner text
      const banner = document.getElementById('conversion-info-banner');
      let conversionMsgs = [];
      if (uQtyType !== uPurType && uQtyType !== 'M2' && uPurType !== 'M2' && purchasePrice > 0) {
        conversionMsgs.push(`Maliyet Dönüşümü: 1 ${uQtyType} = ${purConversionFactor.toFixed(4)} ${uPurType} (${formatMoney(convertedPurchasePrice)} ₺/${uQtyType})`);
      }
      if (uQtyType !== uSelType && uQtyType !== 'M2' && uSelType !== 'M2' && basePrice > 0) {
        conversionMsgs.push(`Satış Dönüşümü: 1 ${uQtyType} = ${selConversionFactor.toFixed(4)} ${uSelType} (${formatMoney(convertedBasePrice)} ₺/${uQtyType})`);
      }
      if (conversionMsgs.length > 0) {
        banner.innerHTML = conversionMsgs.join('<br>');
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    } else {
      document.getElementById('conversion-info-banner').classList.add('hidden');
    }
  } else {
    targetProducts = currentSaleProducts;
    document.getElementById('conversion-info-banner').classList.add('hidden');
  }

  // Clear table grid
  const tableBody = document.querySelector('#analysis-table tbody');
  tableBody.innerHTML = '';
  calculatedData = {};
  
  if (targetProducts.length === 0) return;

  const netProductTotal = targetProducts.reduce((sum, p) => sum + p.base_subtotal, 0);
  const totalProfit = targetProducts.reduce((sum, p) => sum + p.kar, 0);

  // Payment Type base rates
  const paymentTypes = [
    { name: 'Nakit', rate: getFloatValue('rate-cash', 0.0) },
    { name: 'Kredi Kartı', rate: getFloatValue('rate-cc', 0.0) },
    { name: 'Çek', rate: getFloatValue('rate-check', 0.0) },
    { name: 'Senet', rate: getFloatValue('rate-note', 0.0) },
    { name: 'Evrak', rate: getFloatValue('rate-doc', 0.0) },
    { name: 'DBS', rate: getFloatValue('rate-dbs', 0.0) }
  ];

  // Update global paymentRates
  paymentTypes.forEach(p => {
    paymentRates[p.name] = p.rate;
  });

  paymentTypes.forEach(p => {
    const finalAppliedRate = p.name === 'Nakit' ? p.rate : (p.rate + totalVadeSurcharge);
    const totalFinalPrice = (netProductTotal + shipCost + unloadCost) * (1 + (finalAppliedRate / 100));
    
    let unitFinalPrice = 0;
    if (targetProducts.length === 1) {
      unitFinalPrice = totalFinalPrice / targetProducts[0].miktar;
    }
    
    const profitMarginPct = (netProductTotal - totalProfit > 0) ? (totalProfit / (netProductTotal - totalProfit) * 100) : 0.0;
    
    calculatedData[p.name] = {
      unit_price: unitFinalPrice,
      total_price: totalFinalPrice,
      profit: totalProfit,
      profit_margin: profitMarginPct,
      cumulative_rate: finalAppliedRate,
      base_rate: p.rate
    };
    
    const profitText = totalProfit > 0 
      ? `${formatMoney(totalProfit)} ₺` 
      : '-';
      
    const unitPriceText = targetProducts.length === 1 ? `${formatMoney(unitFinalPrice)} ₺` : 'Çoklu Ürün';
      
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>%${p.rate.toFixed(2)}</td>
      <td>%${finalAppliedRate.toFixed(2)}</td>
      <td>${unitPriceText}</td>
      <td>${formatMoney(totalFinalPrice)} ₺</td>
      <td class="manager-col ${currentRole ? '' : 'hidden'}">${profitText}</td>
    `;
    tableBody.appendChild(tr);
  });
}ice)} ₺</td>
      <td class="manager-col ${currentUser ? '' : 'hidden'}">${profitText}</td>
    `;
    tableBody.appendChild(tr);
  });
}

// Action A: Export Excel price sheet
async function exportPriceAnalysisExcel() {
  if (Object.keys(calculatedData).length === 0) {
    alert('Hesaplanmış bir veri bulunmuyor. Önce fiyat giriniz.');
    return;
  }
  
  const excelData = {
    musteri_adi: document.getElementById('cust-name').value.toUpperCase(),
    urun_adi: document.getElementById('prod-name').value.toUpperCase(),
    miktar: getFloatValue('qty', 1.0, 0.0001),
    birim: document.getElementById('unit-type').value,
    fiyat_birimi: document.getElementById('base-price-type').value,
    baz_satis_fiyati: getFloatValue('base-price', 0.0),
    alis_fiyati: getFloatValue('purchase-price', 0.0),
    alis_birimi: document.getElementById('purchase-price-type').value,
    role: currentRole,
    rows: Object.keys(calculatedData).map(k => ({
      tur: k,
      baz_oran: calculatedData[k].base_rate,
      kum_oran: calculatedData[k].cumulative_rate,
      birim_fiyat: calculatedData[k].unit_price,
      toplam_tutar: calculatedData[k].total_price,
      kar: calculatedData[k].profit
    }))
  };

  try {
    const savedPath = await window.api.exportExcel(excelData);
    if (savedPath) alert(`Excel başarıyla kaydedildi:\n${savedPath}`);
  } catch (err) {
    alert(`Excel dosyası kaydedilemedi:\n${err.message}`);
  }
}

// Action B: Print PDF Delivery Slip
async function exportPriceAnalysisPdf() {
  if (Object.keys(calculatedData).length === 0) {
    alert('Hesaplanmış bir veri bulunmuyor. Önce fiyat giriniz.');
    return;
  }

  const selectedType = document.getElementById('receipt-type').value;
  const pricing = calculatedData[selectedType];
  if (!pricing) {
    alert('Seçili ödeme türü için hesaplama bulunamadı.');
    return;
  }

  const pdfData = {
    musteri_adi: document.getElementById('cust-name').value.toUpperCase() || '..............',
    urun_adi: document.getElementById('prod-name').value.toUpperCase(),
    miktar: getFloatValue('qty', 1.0, 0.0001),
    birim: document.getElementById('unit-type').value,
    birim_fiyat: pricing.unit_price,
    toplam_tutar: pricing.total_price
  };

  try {
    const savedPath = await window.api.exportReceiptPdf(pdfData);
    if (savedPath) alert(`Teslim fişi PDF olarak kaydedildi.`);
  } catch (err) {
    alert(`PDF oluşturulamadı:\n${err.message}`);
  }
}

async function handleExportAllSalesExcel() {
  try {
    const savedPath = await window.api.exportAllSalesExcel(currentRole);
    if (savedPath) alert(`Tüm satışlar Excel olarak kaydedildi:\n${savedPath}`);
  } catch (err) {
    alert(`Excel dosyası oluşturulamadı:\n${err.message}`);
  }
}

async function handleExportAllSalesPdf() {
  try {
    const savedPath = await window.api.exportAllSalesPdf(currentRole);
    if (savedPath) alert(`Tüm satışlar PDF olarak kaydedildi:\n${savedPath}`);
  } catch (err) {
    alert(`PDF dosyası oluşturulamadı:\n${err.message}`);
  }
}

// Action C: Save Sale directly
async function saveSaleRecord() {
  if (Object.keys(calculatedData).length === 0) {
    alert('Hesaplanmış bir veri bulunmuyor. Önce fiyat giriniz.');
    return;
  }

  const selectedType = document.getElementById('receipt-type').value;
  const pricing = calculatedData[selectedType];
  if (!pricing) {
    alert('Seçili ödeme türü için hesaplama bulunamadı.');
    return;
  }

  const hasShipping = document.getElementById('has-shipping').checked;
  const shipCost = hasShipping ? getFloatValue('shipping-cost', 0.0) : 0.0;
  const hasUnloading = document.getElementById('has-unloading').checked;
  const unloadCost = hasUnloading ? getFloatValue('unloading-cost', 0.0) : 0.0;

  const vadeMonths = parseInt(document.getElementById('vade-months').value) || 0;
  const vadeRate = getFloatValue('vade-rate', 0.0);
  const totalVadeSurcharge = vadeMonths * vadeRate;

  const currentPayType = selectedType;
  const baseRate = paymentRates[currentPayType] !== undefined ? paymentRates[currentPayType] : 0.0;
  const finalAppliedRate = currentPayType === 'Nakit' ? baseRate : (baseRate + totalVadeSurcharge);

  let urunlerForSave = [];
  
  if (currentSaleProducts.length === 0) {
    const pName = document.getElementById('prod-name').value.trim().toUpperCase();
    if (!pName) {
      alert('Lütfen Ürün Adı / Kodu giriniz veya Satıştaki Ürünler listesine ürün ekleyiniz.');
      return;
    }

    const qty = getFloatValue('qty', 1.0, 0.0001);
    const unitType = document.getElementById('unit-type').value;
    const basePriceType = document.getElementById('base-price-type').value;
    const bagWeight = getFloatValue('bag-weight', 50.0, 0.0001);
    const purchasePrice = getFloatValue('purchase-price', 0.0);
    const purchasePriceType = document.getElementById('purchase-price-type').value;
    const basePrice = getFloatValue('base-price', 0.0);
    const irsaliyeNo = document.getElementById('irsaliye-no').value.trim();

    const weights = { 'KG': 1.0, 'TON': 1000.0, 'TORBA': bagWeight, 'M2': 1.0 };
    let purConversionFactor = 1.0;
    if (unitType !== purchasePriceType && unitType !== 'M2' && purchasePriceType !== 'M2') {
      purConversionFactor = (weights[unitType] || 1.0) / (weights[purchasePriceType] || 1.0);
    }
    let selConversionFactor = 1.0;
    if (unitType !== basePriceType && unitType !== 'M2' && basePriceType !== 'M2') {
      selConversionFactor = (weights[unitType] || 1.0) / (weights[basePriceType] || 1.0);
    }

    const convertedPurchasePrice = purchasePrice * purConversionFactor;
    const convertedBasePrice = basePrice * selConversionFactor;

    const baseSubtotal = convertedBasePrice * qty;
    const finalItemTotal = pricing.total_price;
    const finalItemUnitPrice = qty > 0 ? finalItemTotal / qty : 0.0;
    const kar = purchasePrice > 0 ? (convertedBasePrice - convertedPurchasePrice) * qty : 0.0;

    urunlerForSave.push({
      urun_adi: pName,
      miktar: qty,
      birim: unitType,
      fiyat_birimi: basePriceType,
      torba_agirligi: bagWeight,
      alis_fiyati: purchasePrice,
      alis_birimi: purchasePriceType,
      baz_satis_fiyati: basePrice,
      birim_fiyat: finalItemUnitPrice,
      toplam_tutar: finalItemTotal,
      kar: kar,
      irsaliye_no: irsaliyeNo,
      irsaliye_yolu: ''
    });
  } else {
    const netProductTotal = currentSaleProducts.reduce((sum, p) => sum + p.base_subtotal, 0);

    urunlerForSave = currentSaleProducts.map(p => {
      const shareOfExtra = netProductTotal > 0 ? (p.base_subtotal / netProductTotal) * (shipCost + unloadCost) : 0.0;
      const finalItemTotal = (p.base_subtotal + shareOfExtra) * (1 + finalAppliedRate / 100);
      const finalItemUnitPrice = p.miktar > 0 ? finalItemTotal / p.miktar : 0.0;

      return {
        urun_adi: p.urun_adi,
        miktar: p.miktar,
        birim: p.birim,
        fiyat_birimi: p.fiyat_birimi,
        torba_agirligi: p.torba_agirligi,
        alis_fiyati: p.alis_fiyati,
        alis_birimi: p.alis_birimi,
        baz_satis_fiyati: p.baz_satis_fiyati,
        birim_fiyat: finalItemUnitPrice,
        toplam_tutar: finalItemTotal,
        kar: p.kar,
        irsaliye_no: p.irsaliye_no,
        irsaliye_yolu: p.irsaliye_yolu || ''
      };
    });
  }

  const saleData = {
    tarih: getFormattedCurrentDateTime(),
    kullanici: currentUser,
    musteri_adi: document.getElementById('cust-name').value.trim().toUpperCase() || '..............',
    urun_adi: '',
    miktar: 0.0,
    birim: '',
    fiyat_birimi: '',
    torba_agirligi: 0.0,
    alis_fiyati: 0.0,
    alis_birimi: '',
    baz_satis_fiyati: 0.0,
    odeme_turu: selectedType,
    vade_ay: vadeMonths,
    vade_orani: vadeRate,
    birim_fiyat: 0.0,
    toplam_tutar: pricing.total_price,
    kar: pricing.profit,
    irsaliye_yolu: '',
    nakliye_dahil: hasShipping ? 1 : 0,
    nakliye_maliyeti: shipCost,
    indirme_dahil: hasUnloading ? 1 : 0,
    indirme_maliyeti: unloadCost,
    fatura_no: document.getElementById('fatura-no').value.trim(),
    irsaliye_no: '',
    fatura_yolu: '',
    teslim_durumu: 0,
    teslim_yeri: '',
    teslim_notu: '',
    urunler: urunlerForSave
  };

  try {
    await window.api.addSale(saleData);
    alert('Satış kaydı başarıyla kaydedildi.');
    
    currentSaleProducts = [];
    renderAddedProductsTable();
    
    document.getElementById('prod-name').value = '';
    document.getElementById('irsaliye-no').value = '';
    document.getElementById('qty').value = '1';
    document.getElementById('purchase-price').value = '';
    document.getElementById('base-price').value = '';
    document.getElementById('fatura-no').value = '';
    
    refreshSalesTable();
    refreshHistoryProducts();
  } catch (err) {
    alert(`Kaydetme sırasında hata oluştu:\n${err.message}`);
  }
}

function addProductToCurrentList(e) {
  if (e) e.preventDefault();
  
  const prodName = document.getElementById('prod-name').value.trim().toUpperCase();
  if (!prodName) {
    alert('Lütfen Ürün Adı / Kodu giriniz.');
    return;
  }
  
  const qty = getFloatValue('qty', 1.0, 0.0001);
  if (qty <= 0) {
    alert('Miktar 0\'dan büyük olmalıdır.');
    return;
  }
  
  const basePrice = getFloatValue('base-price', 0.0);
  if (basePrice <= 0) {
    alert('Baz Satış Fiyatı 0\'dan büyük olmalıdır.');
    return;
  }
  
  const purchasePrice = getFloatValue('purchase-price', 0.0);
  const bagWeight = getFloatValue('bag-weight', 50.0, 0.0001);
  const unitType = document.getElementById('unit-type').value;
  const purchasePriceType = document.getElementById('purchase-price-type').value;
  const basePriceType = document.getElementById('base-price-type').value;
  const irsaliyeNo = document.getElementById('irsaliye-no').value.trim();
  
  const weights = {
    'KG': 1.0,
    'TON': 1000.0,
    'TORBA': bagWeight,
    'M2': 1.0
  };
  
  let purConversionFactor = 1.0;
  if (unitType !== purchasePriceType && unitType !== 'M2' && purchasePriceType !== 'M2') {
    purConversionFactor = (weights[unitType] || 1.0) / (weights[purchasePriceType] || 1.0);
  }
  
  let selConversionFactor = 1.0;
  if (unitType !== basePriceType && unitType !== 'M2' && basePriceType !== 'M2') {
    selConversionFactor = (weights[unitType] || 1.0) / (weights[basePriceType] || 1.0);
  }
  
  const convertedPurchasePrice = purchasePrice * purConversionFactor;
  const convertedBasePrice = basePrice * selConversionFactor;
  
  const baseSubtotal = convertedBasePrice * qty;
  const kar = purchasePrice > 0 ? (convertedBasePrice - convertedPurchasePrice) * qty : 0.0;
  
  currentSaleProducts.push({
    urun_adi: prodName,
    miktar: qty,
    birim: unitType,
    fiyat_birimi: basePriceType,
    torba_agirligi: bagWeight,
    alis_fiyati: purchasePrice,
    alis_birimi: purchasePriceType,
    baz_satis_fiyati: basePrice,
    birim_fiyat: convertedBasePrice,
    base_subtotal: baseSubtotal,
    kar: kar,
    irsaliye_no: irsaliyeNo,
    irsaliye_yolu: ''
  });
  
  document.getElementById('prod-name').value = '';
  document.getElementById('irsaliye-no').value = '';
  document.getElementById('qty').value = '1';
  document.getElementById('purchase-price').value = '';
  document.getElementById('base-price').value = '';
  
  renderAddedProductsTable();
  runCumulativePriceCalculation();
}

function renderAddedProductsTable() {
  const tableBody = document.querySelector('#added-products-table tbody');
  if (!tableBody) return;
  tableBody.innerHTML = '';
  
  if (currentSaleProducts.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 15px;">Henüz ürün eklenmedi. Lütfen alanları doldurup "Ürünü Satışa Ekle" butonuna basın.</td>
      </tr>
    `;
    return;
  }
  
  currentSaleProducts.forEach((p, idx) => {
    const tr = document.createElement('tr');
    
    const purPriceText = p.alis_fiyati > 0 
      ? `${formatMoney(p.alis_fiyati)} ₺/${p.alis_birimi}` 
      : '-';
      
    tr.innerHTML = `
      <td>${p.urun_adi}</td>
      <td>${p.miktar}</td>
      <td>${p.birim}</td>
      <td class="manager-col ${currentRole ? '' : 'hidden'}">${purPriceText}</td>
      <td>${formatMoney(p.baz_satis_fiyati)} ₺/${p.fiyat_birimi}</td>
      <td>${p.irsaliye_no || '-'}</td>
      <td style="text-align: center;">
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); removeProductFromList(${idx})">Sil</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

window.removeProductFromList = function(idx) {
  currentSaleProducts.splice(idx, 1);
  renderAddedProductsTable();
  runCumulativePriceCalculation();
};

// ==================== TAB 2: RECENT MOVEMENTS ====================
async function refreshSalesTable() {
  selectedSaleRowId = null;
  const tableBody = document.querySelector('#sales-history-table tbody');
  tableBody.innerHTML = '<tr><td colspan="11" style="text-align: center;">Yükleniyor...</td></tr>';
  
  try {
    const list = await window.api.getSales();
    tableBody.innerHTML = '';
    
    if (list.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="11" style="text-align: center;">Kayıt bulunamadı.</td></tr>';
      return;
    }
    
    list.forEach(sale => {
      let doc_status = '❌ Yüklenmedi';
      if (sale.irsaliye_yolu && sale.fatura_yolu) {
        doc_status = 'Eşleşti (Fatura & İrsaliye)';
      } else if (sale.fatura_yolu) {
        doc_status = '📄 Fatura Yüklendi';
      } else if (sale.irsaliye_yolu) {
        doc_status = '📁 İrsaliye Yüklendi';
      }
      
      const tr = document.createElement('tr');
      tr.setAttribute('data-id', sale.id);
      
      const profitMarginPct = calculateSaleProfitMarginPct(sale);
      const profitText = (sale.kar !== undefined && sale.kar !== null)
        ? `${formatMoney(sale.kar)} ₺ (${profitMarginPct >= 0 ? '+' : ''}${profitMarginPct.toFixed(2)}%)`
        : '-';

      tr.innerHTML = `
        <td>${sale.id}</td>
        <td>${sale.tarih}</td>
        <td>${sale.kullanici}</td>
        <td>${sale.musteri_adi || '-'}</td>
        <td>${sale.urun_adi}</td>
        <td>${sale.miktar}</td>
        <td>${sale.birim}</td>
        <td>${formatMoney(sale.toplam_tutar)} ₺</td>
        <td class="manager-col ${currentRole ? '' : 'hidden'}">${profitText}</td>
        <td>${doc_status}</td>
        <td>
          <div class="row-actions">
            <button class="btn-action-icon btn-detail" title="Detay Gör" onclick="event.stopPropagation(); handleRowViewDetail(${sale.id})">🔍</button>
            <button class="btn-action-icon btn-edit" title="Satışı Düzenle" onclick="event.stopPropagation(); handleRowEdit(${sale.id})">✏️</button>
            <button class="btn-action-icon btn-waybill" title="İrsaliye Ekle/Gör" onclick="event.stopPropagation(); handleRowWaybill(${sale.id}, '${sale.irsaliye_yolu ? '1' : '0'}')">📁</button>
            <button class="btn-action-icon btn-delete ${currentRole === 'Personel' ? 'hidden' : ''}" title="Satışı Sil" onclick="event.stopPropagation(); handleRowDelete(${sale.id})">🗑️</button>
          </div>
        </td>
      `;
      
      tr.addEventListener('click', () => {
        document.querySelectorAll('#sales-history-table tbody tr').forEach(r => r.classList.remove('selected'));
        tr.classList.add('selected');
        selectedSaleRowId = sale.id;
      });
      
      tableBody.appendChild(tr);
    });
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--danger-color);">Hata: ${err.message}</td></tr>`;
  }
}

let editingSaleMetadata = {};

function setupEditSaleCalculationTraces() {
  const inputs = [
    'edit-sale-vade-rate', 'edit-sale-shipping-cost', 'edit-sale-unloading-cost',
    'edit-sale-receipt-type', 'edit-sale-vade-months'
  ];
  
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(eventName, runEditSaleCalculation);
    }
  });

  // Shipping & Unloading Cost inputs toggling
  document.getElementById('edit-sale-has-shipping').addEventListener('change', (e) => {
    const el = document.getElementById('edit-sale-shipping-cost');
    if (e.target.checked) {
      el.removeAttribute('disabled');
    } else {
      el.setAttribute('disabled', 'true');
      el.value = '';
    }
    runEditSaleCalculation();
  });
  
  document.getElementById('edit-sale-has-unloading').addEventListener('change', (e) => {
    const el = document.getElementById('edit-sale-unloading-cost');
    if (e.target.checked) {
      el.removeAttribute('disabled');
    } else {
      el.setAttribute('disabled', 'true');
      el.value = '';
    }
    runEditSaleCalculation();
  });
}

function runEditSaleCalculation() {
  editSaleProducts.forEach(u => {
    const weights = { 'KG': 1.0, 'TON': 1000.0, 'TORBA': u.torba_agirligi || 50.0, 'M2': 1.0 };
    
    let purConversionFactor = 1.0;
    if (u.birim !== u.alis_birimi && u.birim !== 'M2' && u.alis_birimi !== 'M2') {
      purConversionFactor = (weights[u.birim] || 1.0) / (weights[u.alis_birimi] || 1.0);
    }
    const convertedPurchasePrice = (u.alis_fiyati || 0) * purConversionFactor;
    
    let selConversionFactor = 1.0;
    if (u.birim !== u.fiyat_birimi && u.birim !== 'M2' && u.fiyat_birimi !== 'M2') {
      selConversionFactor = (weights[u.birim] || 1.0) / (weights[u.fiyat_birimi] || 1.0);
    }
    const convertedBasePrice = (u.baz_satis_fiyati || 0) * selConversionFactor;
    
    u.birim_fiyat = convertedBasePrice;
    u.base_subtotal = convertedBasePrice * u.miktar;
    u.kar = u.alis_fiyati > 0 ? (convertedBasePrice - convertedPurchasePrice) * u.miktar : 0.0;
  });

  const netProductTotal = editSaleProducts.reduce((sum, u) => sum + u.base_subtotal, 0);
  const totalProfit = editSaleProducts.reduce((sum, u) => sum + u.kar, 0);

  const hasShipping = document.getElementById('edit-sale-has-shipping').checked;
  const shipCost = hasShipping ? getFloatValue('edit-sale-shipping-cost', 0.0) : 0.0;
  
  const hasUnloading = document.getElementById('edit-sale-has-unloading').checked;
  const unloadCost = hasUnloading ? getFloatValue('edit-sale-unloading-cost', 0.0) : 0.0;
  
  const vadeMonths = parseInt(document.getElementById('edit-sale-vade-months').value) || 0;
  const vadeRate = getFloatValue('edit-sale-vade-rate', 0.0);
  const totalVadeSurcharge = vadeMonths * vadeRate;
  
  const currentPayType = document.getElementById('edit-sale-receipt-type').value;
  const baseRate = paymentRates[currentPayType] !== undefined ? paymentRates[currentPayType] : 0.0;

  const finalAppliedRate = currentPayType === 'Nakit' ? baseRate : (baseRate + totalVadeSurcharge);
  const totalFinalPrice = (netProductTotal + shipCost + unloadCost) * (1 + (finalAppliedRate / 100));

  document.getElementById('edit-sale-lbl-total-price').textContent = `${formatMoney(totalFinalPrice)} ₺`;
  
  const profitText = totalProfit > 0 
    ? `${formatMoney(totalProfit)} ₺` 
    : '-';
  document.getElementById('edit-sale-lbl-profit').textContent = profitText;

  return {
    netProductTotal,
    totalFinalPrice,
    totalProfit,
    finalAppliedRate
  };
}

async function openEditSaleModal() {
  if (!selectedSaleRowId) {
    alert('Lütfen düzenlemek istediğiniz satışı listeden seçin.');
    return;
  }
  
  try {
    const sale = await window.api.getSaleDetails(selectedSaleRowId);
    
    editingSaleMetadata = {
      tarih: sale.tarih,
      kullanici: sale.kullanici,
      irsaliye_yolu: sale.irsaliye_yolu
    };
    
    document.getElementById('edit-sale-title').textContent = `Satış Kaydını Düzenle - ID: ${sale.id}`;
    document.getElementById('edit-sale-id').value = sale.id;
    document.getElementById('edit-sale-cust-name').value = sale.musteri_adi || '';
    document.getElementById('edit-sale-fatura-no').value = sale.fatura_no || '';
    
    document.getElementById('edit-sale-receipt-type').value = sale.odeme_turu || 'Nakit';
    document.getElementById('edit-sale-vade-months').value = sale.vade_ay || 0;
    document.getElementById('edit-sale-vade-rate').value = sale.vade_orani || 0;
    
    const hasShipping = sale.nakliye_dahil === 1;
    document.getElementById('edit-sale-has-shipping').checked = hasShipping;
    const shipInput = document.getElementById('edit-sale-shipping-cost');
    shipInput.value = hasShipping ? (sale.nakliye_maliyeti || '') : '';
    if (hasShipping) shipInput.removeAttribute('disabled');
    else shipInput.setAttribute('disabled', 'true');
    
    const hasUnloading = sale.indirme_dahil === 1;
    document.getElementById('edit-sale-has-unloading').checked = hasUnloading;
    const unloadInput = document.getElementById('edit-sale-unloading-cost');
    unloadInput.value = hasUnloading ? (sale.indirme_maliyeti || '') : '';
    if (hasUnloading) unloadInput.removeAttribute('disabled');
    else unloadInput.setAttribute('disabled', 'true');
    
    document.getElementById('edit-sale-new-prod-name').value = '';
    document.getElementById('edit-sale-new-irsaliye-no').value = '';
    document.getElementById('edit-sale-new-qty').value = '1';
    document.getElementById('edit-sale-new-purchase-price').value = '';
    document.getElementById('edit-sale-new-base-price').value = '';
    
    if (sale.urunler && sale.urunler.length > 0) {
      editSaleProducts = sale.urunler.map(u => ({ ...u }));
    } else {
      editSaleProducts = [{
        id: null,
        urun_adi: sale.urun_adi || '',
        miktar: sale.miktar || 0.0,
        birim: sale.birim || 'TORBA',
        fiyat_birimi: sale.fiyat_birimi || 'TON',
        torba_agirligi: sale.torba_agirligi || 50.0,
        alis_fiyati: sale.alis_fiyati || 0.0,
        alis_birimi: sale.alis_birimi || '',
        baz_satis_fiyati: sale.baz_satis_fiyati || 0.0,
        birim_fiyat: sale.birim_fiyat || 0.0,
        toplam_tutar: sale.toplam_tutar || 0.0,
        kar: sale.kar || 0.0,
        irsaliye_no: sale.irsaliye_no || '',
        irsaliye_yolu: sale.irsaliye_yolu || ''
      }];
    }
    
    renderEditSaleProductsTable();
    openModal('modal-edit-sale');
    runEditSaleCalculation();
  } catch (err) {
    alert(`Satış bilgileri yüklenemedi:\n${err.message}`);
  }
}

function renderEditSaleProductsTable() {
  const tableBody = document.querySelector('#edit-sale-products-table tbody');
  if (!tableBody) return;
  tableBody.innerHTML = '';
  
  if (editSaleProducts.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 15px;">Henüz ürün eklenmedi. Lütfen en az bir ürün ekleyin.</td>
      </tr>
    `;
    return;
  }
  
  editSaleProducts.forEach((p, idx) => {
    const tr = document.createElement('tr');
    
    const purPriceText = p.alis_fiyati > 0 
      ? `${formatMoney(p.alis_fiyati)} ₺/${p.alis_birimi || p.birim}` 
      : '-';
      
    tr.innerHTML = `
      <td>${p.urun_adi}</td>
      <td>${p.miktar}</td>
      <td>${p.birim}</td>
      <td class="manager-col ${currentRole ? '' : 'hidden'}">${purPriceText}</td>
      <td>${formatMoney(p.baz_satis_fiyati)} ₺/${p.fiyat_birimi}</td>
      <td>${p.irsaliye_no || '-'}</td>
      <td style="text-align: center;">
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); removeProductFromEditList(${idx})">Sil</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

window.removeProductFromEditList = function(idx) {
  editSaleProducts.splice(idx, 1);
  renderEditSaleProductsTable();
  runEditSaleCalculation();
};

function addProductToEditList(e) {
  if (e) e.preventDefault();
  
  const prodName = document.getElementById('edit-sale-new-prod-name').value.trim().toUpperCase();
  if (!prodName) {
    alert('Lütfen Ürün Adı / Kodu giriniz.');
    return;
  }
  
  const qty = getFloatValue('edit-sale-new-qty', 1.0, 0.0001);
  if (qty <= 0) {
    alert('Miktar 0\'dan büyük olmalıdır.');
    return;
  }
  
  const basePrice = getFloatValue('edit-sale-new-base-price', 0.0);
  if (basePrice <= 0) {
    alert('Baz Satış Fiyatı 0\'dan büyük olmalıdır.');
    return;
  }
  
  const purchasePrice = getFloatValue('edit-sale-new-purchase-price', 0.0);
  const bagWeight = getFloatValue('edit-sale-new-bag-weight', 50.0, 0.0001);
  const unitType = document.getElementById('edit-sale-new-unit-type').value;
  const purchasePriceType = document.getElementById('edit-sale-new-purchase-price-type').value;
  const basePriceType = document.getElementById('edit-sale-new-base-price-type').value;
  const irsaliyeNo = document.getElementById('edit-sale-new-irsaliye-no').value.trim();
  
  const weights = { 'KG': 1.0, 'TON': 1000.0, 'TORBA': bagWeight, 'M2': 1.0 };
  let purConversionFactor = 1.0;
  if (unitType !== purchasePriceType && unitType !== 'M2' && purchasePriceType !== 'M2') {
    purConversionFactor = (weights[unitType] || 1.0) / (weights[purchasePriceType] || 1.0);
  }
  let selConversionFactor = 1.0;
  if (unitType !== basePriceType && unitType !== 'M2' && basePriceType !== 'M2') {
    selConversionFactor = (weights[unitType] || 1.0) / (weights[basePriceType] || 1.0);
  }
  
  const convertedPurchasePrice = purchasePrice * purConversionFactor;
  const convertedBasePrice = basePrice * selConversionFactor;
  
  const baseSubtotal = convertedBasePrice * qty;
  const kar = purchasePrice > 0 ? (convertedBasePrice - convertedPurchasePrice) * qty : 0.0;
  
  editSaleProducts.push({
    urun_adi: prodName,
    miktar: qty,
    birim: unitType,
    fiyat_birimi: basePriceType,
    torba_agirligi: bagWeight,
    alis_fiyati: purchasePrice,
    alis_birimi: purchasePriceType,
    baz_satis_fiyati: basePrice,
    birim_fiyat: convertedBasePrice,
    base_subtotal: baseSubtotal,
    kar: kar,
    irsaliye_no: irsaliyeNo,
    irsaliye_yolu: ''
  });
  
  document.getElementById('edit-sale-new-prod-name').value = '';
  document.getElementById('edit-sale-new-irsaliye-no').value = '';
  document.getElementById('edit-sale-new-qty').value = '1';
  document.getElementById('edit-sale-new-purchase-price').value = '';
  document.getElementById('edit-sale-new-base-price').value = '';
  
  renderEditSaleProductsTable();
  runEditSaleCalculation();
}

async function saveEditSaleRecord() {
  const sid = parseInt(document.getElementById('edit-sale-id').value);
  if (!sid) return;

  if (editSaleProducts.length === 0) {
    alert('Lütfen en az bir ürün ekleyin.');
    return;
  }

  const calc = runEditSaleCalculation();
  if (!calc) return;

  const hasShipping = document.getElementById('edit-sale-has-shipping').checked;
  const shipCost = hasShipping ? getFloatValue('edit-sale-shipping-cost', 0.0) : 0.0;
  const hasUnloading = document.getElementById('edit-sale-has-unloading').checked;
  const unloadCost = hasUnloading ? getFloatValue('edit-sale-unloading-cost', 0.0) : 0.0;

  const urunlerForSave = editSaleProducts.map(p => {
    const shareOfExtra = calc.netProductTotal > 0 ? (p.base_subtotal / calc.netProductTotal) * (shipCost + unloadCost) : 0.0;
    const finalItemTotal = (p.base_subtotal + shareOfExtra) * (1 + calc.finalAppliedRate / 100);
    const finalItemUnitPrice = p.miktar > 0 ? finalItemTotal / p.miktar : 0.0;

    return {
      id: p.id || null,
      urun_adi: p.urun_adi,
      miktar: p.miktar,
      birim: p.birim,
      fiyat_birimi: p.fiyat_birimi,
      torba_agirligi: p.torba_agirligi,
      alis_fiyati: p.alis_fiyati,
      alis_birimi: p.alis_birimi,
      baz_satis_fiyati: p.baz_satis_fiyati,
      birim_fiyat: finalItemUnitPrice,
      toplam_tutar: finalItemTotal,
      kar: p.kar,
      irsaliye_no: p.irsaliye_no || '',
      irsaliye_yolu: p.irsaliye_yolu || ''
    };
  });

  const saleData = {
    tarih: editingSaleMetadata.tarih,
    kullanici: editingSaleMetadata.kullanici,
    irsaliye_yolu: editingSaleMetadata.irsaliye_yolu,
    musteri_adi: document.getElementById('edit-sale-cust-name').value.trim().toUpperCase() || '..............',
    urun_adi: '',
    miktar: 0.0,
    birim: '',
    fiyat_birimi: '',
    torba_agirligi: 0.0,
    alis_fiyati: 0.0,
    alis_birimi: '',
    baz_satis_fiyati: 0.0,
    odeme_turu: document.getElementById('edit-sale-receipt-type').value,
    vade_ay: parseInt(document.getElementById('edit-sale-vade-months').value) || 0,
    vade_orani: getFloatValue('edit-sale-vade-rate', 0.0),
    birim_fiyat: 0.0,
    toplam_tutar: calc.totalFinalPrice,
    kar: calc.totalProfit,
    nakliye_dahil: hasShipping ? 1 : 0,
    nakliye_maliyeti: shipCost,
    indirme_dahil: hasUnloading ? 1 : 0,
    indirme_maliyeti: unloadCost,
    fatura_no: document.getElementById('edit-sale-fatura-no').value.trim(),
    irsaliye_no: '',
    urunler: urunlerForSave
  };

  try {
    await window.api.editSale(sid, saleData);
    alert('Satış kaydı başarıyla güncellendi.');
    closeAllModals();
    refreshSalesTable();
  } catch (err) {
    alert(`Güncelleme sırasında hata oluştu:\n${err.message}`);
  }
}

async function viewSaleDetail() {
  if (!selectedSaleRowId) {
    alert('Lütfen detayını görüntülemek istediğiniz satışı listeden seçin.');
    return;
  }
  
  try {
    const sale = await window.api.getSaleDetails(selectedSaleRowId);
    
    document.getElementById('detail-title').textContent = `Satış Detayı - ID: ${sale.id}`;
    document.getElementById('det-tarih').textContent = sale.tarih;
    document.getElementById('det-kullanici').textContent = sale.kullanici;
    document.getElementById('det-musteri').textContent = sale.musteri_adi || '-';
    document.getElementById('det-urun').textContent = sale.urun_adi;
    document.getElementById('det-miktar').textContent = `${sale.miktar} ${sale.birim}`;
    document.getElementById('det-fiyat-birimi').textContent = sale.fiyat_birimi;
    
    const torbaRow = document.getElementById('det-row-torba');
    if (sale.birim === 'TORBA' || sale.fiyat_birimi === 'TORBA') {
      torbaRow.classList.remove('hidden');
      document.getElementById('det-torba').textContent = `${sale.torba_agirligi} kg`;
    } else {
      torbaRow.classList.add('hidden');
    }
    
    document.getElementById('det-odeme').textContent = sale.odeme_turu;
    document.getElementById('det-vade').textContent = sale.vade_ay > 0 ? `${sale.vade_ay} Ay (Aylık %${sale.vade_orani})` : 'Nakit / Vadesiz';
    document.getElementById('det-birim-fiyat').textContent = `${formatMoney(getSaleBaseUnitPrice(sale))} ₺`;
    document.getElementById('det-toplam').textContent = `${formatMoney(sale.toplam_tutar)} ₺`;
    
    const adminFields = document.querySelectorAll('#modal-sale-details .manager-only');
    if (currentRole) {
      adminFields.forEach(el => el.classList.remove('hidden'));
      document.getElementById('det-alis').textContent = `${formatMoney(sale.alis_fiyati)} ₺`;
      const profitMarginPct = calculateSaleProfitMarginPct(sale);
      const detKarText = `${formatMoney(sale.kar)} ₺ (${profitMarginPct >= 0 ? '+' : ''}${profitMarginPct.toFixed(2)}%)`;
      document.getElementById('det-kar').textContent = detKarText;
    } else {
      adminFields.forEach(el => el.classList.add('hidden'));
    }
    
    document.getElementById('det-irsaliye-no').textContent = sale.irsaliye_no || '-';
    document.getElementById('det-fatura-no').textContent = sale.fatura_no || '-';
    document.getElementById('det-irsaliye').textContent = sale.irsaliye_yolu ? 'Yüklendi' : 'Yüklenmedi';
    document.getElementById('det-fatura').textContent = sale.fatura_yolu ? 'Yüklendi' : 'Yüklenmedi';
    
    if (sale.irsaliye_yolu && sale.fatura_yolu) {
      document.getElementById('det-eslesme').textContent = 'Eşleşti (Fatura & İrsaliye)';
    } else {
      document.getElementById('det-eslesme').textContent = 'Eşleşmedi (Belgeler Eksik)';
    }

    if (sale.teslim_durumu === 1) {
      document.getElementById('det-teslim-durum').textContent = 'Teslim Edildi';
      document.getElementById('det-teslim-yeri').textContent = sale.teslim_yeri || '-';
      document.getElementById('det-teslim-notu').textContent = sale.teslim_notu || '-';
    } else {
      document.getElementById('det-teslim-durum').textContent = 'Teslimat Bekliyor';
      document.getElementById('det-teslim-yeri').textContent = '-';
      document.getElementById('det-teslim-notu').textContent = '-';
    }
    
    const productsTableBody = document.querySelector('#det-products-table tbody');
    productsTableBody.innerHTML = '';
    
    const urunler = sale.urunler || [];
    if (urunler.length === 0) {
      productsTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 10px;">Ürün detay bilgisi bulunamadı.</td>
        </tr>
      `;
    } else {
      urunler.forEach(u => {
        const tr = document.createElement('tr');
        
        let waybillBtnHtml = '';
        if (u.irsaliye_yolu) {
          waybillBtnHtml = `
            <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); viewItemWaybill(${sale.id}, ${u.id})">Gör</button>
            <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); uploadItemWaybill(${sale.id}, ${u.id})">Değiştir</button>
          `;
        } else {
          waybillBtnHtml = `
            <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); uploadItemWaybill(${sale.id}, ${u.id})">Yükle</button>
          `;
        }
        
        const profitMarginPct = (u.alis_fiyati > 0) ? ((u.birim_fiyat - u.alis_fiyati) / u.alis_fiyati * 100) : 0.0;
        const profitText = u.alis_fiyati > 0 
          ? `${formatMoney(u.kar)} ₺ (${profitMarginPct >= 0 ? '+' : ''}${profitMarginPct.toFixed(2)}%)` 
          : '-';
          
        tr.innerHTML = `
          <td>${u.urun_adi}</td>
          <td>${u.miktar}</td>
          <td>${u.birim}</td>
          <td>${formatMoney(u.birim_fiyat)} ₺</td>
          <td>${formatMoney(u.toplam_tutar)} ₺</td>
          <td class="manager-col ${currentRole ? '' : 'hidden'}">${u.alis_fiyati > 0 ? formatMoney(u.alis_fiyati) + ' ₺/' + (u.alis_birimi || u.birim) : '-'}</td>
          <td class="manager-col ${currentRole ? '' : 'hidden'}">${profitText}</td>
          <td>${u.irsaliye_no || '-'}</td>
          <td>${waybillBtnHtml}</td>
        `;
        productsTableBody.appendChild(tr);
      });
    }
    
    openModal('modal-sale-details');
  } catch (err) {
    alert(`Detaylar yüklenemedi:\n${err.message}`);
  }
}

window.uploadItemWaybill = async function(saleId, productId) {
  try {
    const destPath = await window.api.uploadWaybill({ saleId, urunId: productId });
    if (destPath) {
      alert('İrsaliye dosyası başarıyla yüklendi.');
      await viewSaleDetail();
      refreshSalesTable();
    }
  } catch (err) {
    alert(`Dosya yüklenirken hata oluştu:\n${err.message}`);
  }
};

window.viewItemWaybill = async function(saleId, productId) {
  try {
    await window.api.viewWaybill({ saleId, urunId: productId });
  } catch (err) {
    alert(err.message);
  }
};

async function uploadWaybillFile() {
  if (!selectedSaleRowId) {
    alert('Lütfen irsaliye yüklemek istediğiniz satışı listeden seçin.');
    return;
  }
  
  try {
    const destPath = await window.api.uploadWaybill(selectedSaleRowId);
    if (destPath) {
      alert('İrsaliye dosyası başarıyla yüklendi.');
      refreshSalesTable();
    }
  } catch (err) {
    alert(`Dosya yüklenirken hata oluştu:\n${err.message}`);
  }
}

async function viewWaybillFile() {
  if (!selectedSaleRowId) {
    alert('Lütfen irsaliyesini görüntülemek istediğiniz satışı listeden seçin.');
    return;
  }
  try {
    await window.api.viewWaybill(selectedSaleRowId);
  } catch (err) {
    alert(err.message);
  }
}

async function uploadInvoiceFile() {
  if (!selectedSaleRowId) {
    alert('Lütfen fatura yüklemek istediğiniz satışı listeden seçin.');
    return;
  }
  
  try {
    const destPath = await window.api.uploadInvoice(selectedSaleRowId);
    if (destPath) {
      alert('Fatura dosyası başarıyla yüklendi.');
      refreshSalesTable();
    }
  } catch (err) {
    alert(`Dosya yüklenirken hata oluştu:\n${err.message}`);
  }
}

async function viewInvoiceFile() {
  if (!selectedSaleRowId) {
    alert('Lütfen faturasını görüntülemek istediğiniz satışı listeden seçin.');
    return;
  }
  try {
    await window.api.viewInvoice(selectedSaleRowId);
  } catch (err) {
    alert(err.message);
  }
}

function openDeliverSaleModal() {
  if (!selectedSaleRowId) {
    alert('Lütfen teslim etmek istediğiniz satışı listeden seçin.');
    return;
  }
  document.getElementById('deliver-sale-id').value = selectedSaleRowId;
  document.getElementById('deliver-sale-yeri').value = '';
  document.getElementById('deliver-sale-notu').value = '';
  openModal('modal-deliver-sale');
}

async function saveDeliverSaleRecord() {
  const saleId = parseInt(document.getElementById('deliver-sale-id').value);
  const yeri = document.getElementById('deliver-sale-yeri').value.trim();
  const notu = document.getElementById('deliver-sale-notu').value.trim();
  
  if (!yeri) {
    alert('Lütfen teslim edilen yer/şantiye bilgisini giriniz.');
    return;
  }
  
  try {
    await window.api.deliverSale(saleId, yeri, notu);
    alert('Satış başarıyla teslim edildi.');
    closeAllModals();
    refreshSalesTable();
  } catch (err) {
    alert(`Teslimat kaydedilirken hata oluştu:\n${err.message}`);
  }
}

async function reprintReceiptPdf() {
  if (!selectedSaleRowId) {
    alert('Lütfen teslim fişini tekrar çıkarmak istediğiniz satışı seçin.');
    return;
  }
  try {
    const savedPath = await window.api.regenerateReceiptPdf(selectedSaleRowId);
    if (savedPath) alert(`PDF Teslim Fişi tekrar başarıyla oluşturuldu.`);
  } catch (err) {
    alert(`PDF oluşturulamadı:\n${err.message}`);
  }
}

async function printDetailPdf() {
  if (!selectedSaleRowId) {
    alert('Lütfen detay raporu almak istediğiniz satışı seçin.');
    return;
  }
  try {
    const savedPath = await window.api.exportDetailPdf(selectedSaleRowId);
    if (savedPath) alert(`Sipariş Detay Raporu PDF olarak kaydedildi.`);
  } catch (err) {
    alert(`PDF oluşturulamadı:\n${err.message}`);
  }
}

async function printDetailExcel() {
  if (!selectedSaleRowId) {
    alert('Lütfen Excel çıktısı almak istediğiniz satışı seçin.');
    return;
  }
  try {
    const savedPath = await window.api.exportDetailExcel(selectedSaleRowId);
    if (savedPath) alert(`Excel başarıyla kaydedildi:\n${savedPath}`);
  } catch (err) {
    alert(`Excel oluşturulurken hata oluştu:\n${err.message}`);
  }
}

async function deleteSaleRecord() {
  if (!selectedSaleRowId) {
    alert('Silmek istediğiniz satışı seçin.');
    return;
  }
  
  const confirmDelete = confirm(`ID'si ${selectedSaleRowId} olan satış kaydını kalıcı olarak silmek istiyor musunuz?`);
  if (!confirmDelete) return;
  
  try {
    await window.api.deleteSale(selectedSaleRowId);
    alert('Satış kaydı başarıyla silindi.');
    refreshSalesTable();
  } catch (err) {
    alert(`Silme işlemi başarısız:\n${err.message}`);
  }
}

// ==================== TAB 3: PRODUCT PRICE HISTORY ====================
async function refreshHistoryProducts() {
  const dropdown = document.getElementById('history-product-dropdown');
  dropdown.innerHTML = '<option value="">Yükleniyor...</option>';
  
  try {
    const list = await window.api.getProducts();
    dropdown.innerHTML = '';
    
    if (list.length === 0) {
      dropdown.innerHTML = '<option value="">(Kayıtlı ürün bulunamadı)</option>';
      const tableBody = document.querySelector('#price-history-table tbody');
      tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Geçmiş satış bulunmamaktadır.</td></tr>';
      return;
    }
    
    list.forEach(pName => {
      const option = document.createElement('option');
      option.value = pName;
      option.textContent = pName;
      dropdown.appendChild(option);
    });
    
    refreshPriceHistory();
  } catch (err) {
    dropdown.innerHTML = `<option value="">Hata: ${err.message}</option>`;
  }
}

async function refreshPriceHistory() {
  const tableBody = document.querySelector('#price-history-table tbody');
  const prodName = document.getElementById('history-product-dropdown').value;
  
  if (!prodName) {
    tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Lütfen bir ürün seçin.</td></tr>';
    return;
  }
  
  tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Yükleniyor...</td></tr>';
  
  try {
    const history = await window.api.getPriceHistory(prodName);
    tableBody.innerHTML = '';
    
    if (history.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Ürüne ait geçmiş hareket bulunamadı.</td></tr>';
      return;
    }
    
    history.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.tarih}</td>
        <td>${item.musteri_adi || '-'}</td>
        <td>${item.miktar}</td>
        <td>${item.birim}</td>
        <td>${item.odeme_turu}</td>
        <td>${item.vade_ay > 0 ? item.vade_ay : '-'}</td>
        <td>${formatMoney(getSaleBaseUnitPrice(item))} ₺</td>
        <td>${formatMoney(item.toplam_tutar)} ₺</td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger-color);">Hata: ${err.message}</td></tr>`;
  }
}

// ==================== TAB 4: USER ADMINISTRATION ====================
async function refreshUsersTable() {
  selectedUserRowId = null;
  const tableBody = document.querySelector('#users-table tbody');
  tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Yükleniyor...</td></tr>';
  
  try {
    const list = await window.api.getUsers();
    tableBody.innerHTML = '';
    
    list.forEach(usr => {
      const isAktif = usr.aktif ? '✅ Aktif' : '❌ Pasif';
      const isAktifClass = usr.aktif ? 'status-active' : 'status-passive';
      
      let roleClass = 'role-personel';
      if (usr.rol === 'Yönetici') roleClass = 'role-yonetici';
      else if (usr.rol === 'Süper Admin') roleClass = 'role-superadmin';
      
      const tr = document.createElement('tr');
      if (!usr.aktif) tr.classList.add('passive-user');
      tr.setAttribute('data-id', usr.id);
      
      tr.innerHTML = `
        <td>${usr.id}</td>
        <td>${usr.kullanici_adi}</td>
        <td class="${roleClass}">${usr.rol}</td>
        <td class="${isAktifClass}">${isAktif}</td>
      `;
      
      tr.addEventListener('click', () => {
        document.querySelectorAll('#users-table tbody tr').forEach(r => r.classList.remove('selected'));
        tr.classList.add('selected');
        selectedUserRowId = usr.id;
      });
      
      tableBody.appendChild(tr);
    });
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--danger-color);">Hata: ${err.message}</td></tr>`;
  }
}

function openAddUserModal() {
  document.getElementById('usr-add-name').value = '';
  document.getElementById('usr-add-pass').value = '';
  document.getElementById('usr-add-role').value = 'Personel';
  openModal('modal-add-user');
}

async function openEditUserModal() {
  if (!selectedUserRowId) {
    alert('Lütfen listeden bir kullanıcı seçin.');
    return;
  }
  
  // Find selected row info
  const selectedRow = document.querySelector(`#users-table tbody tr[data-id="${selectedUserRowId}"]`);
  const uName = selectedRow.cells[1].textContent;
  const uRole = selectedRow.cells[2].textContent;
  
  document.getElementById('usr-edit-id').value = selectedUserRowId;
  document.getElementById('usr-edit-name').value = uName;
  document.getElementById('usr-edit-role').value = uRole;
  
  document.getElementById('edit-user-title').textContent = `Kullanıcı Güncelle — ${uName}`;
  openModal('modal-edit-user');
}

function openResetPasswordModal() {
  if (!selectedUserRowId) {
    alert('Lütfen listeden bir kullanıcı seçin.');
    return;
  }
  const selectedRow = document.querySelector(`#users-table tbody tr[data-id="${selectedUserRowId}"]`);
  const uName = selectedRow.cells[1].textContent;
  
  document.getElementById('usr-reset-id').value = selectedUserRowId;
  document.getElementById('usr-reset-pass1').value = '';
  document.getElementById('usr-reset-pass2').value = '';
  
  document.getElementById('reset-pass-title').textContent = `Şifre Sıfırla — ${uName}`;
  openModal('modal-reset-password');
}

// Saves Add User
document.getElementById('btn-save-add-user').addEventListener('click', async () => {
  const username = document.getElementById('usr-add-name').value.trim();
  const password = document.getElementById('usr-add-pass').value.trim();
  const role = document.getElementById('usr-add-role').value;
  
  if (!username || !password) {
    alert('Kullanıcı adı ve şifre boş bırakılamaz.');
    return;
  }
  
  try {
    await window.api.addUser({ kullanici_adi: username, sifre: password, rol: role });
    alert(`'${username}' kullanıcısı başarıyla eklendi.`);
    closeAllModals();
    refreshUsersTable();
  } catch (err) {
    alert(`Hata: ${err.message}`);
  }
});

// Saves Edit User Info
document.getElementById('btn-save-edit-user').addEventListener('click', async () => {
  const uid = parseInt(document.getElementById('usr-edit-id').value);
  const uName = document.getElementById('usr-edit-name').value.trim();
  const uRole = document.getElementById('usr-edit-role').value;
  
  if (!uName) {
    alert('Kullanıcı adı boş bırakılamaz.');
    return;
  }
  
  try {
    await window.api.editUser(uid, { kullanici_adi: uName, rol: uRole });
    alert('Kullanıcı bilgileri başarıyla güncellendi.');
    closeAllModals();
    refreshUsersTable();
  } catch (err) {
    alert(`Güncelleme başarısız:\n${err.message}`);
  }
});

// Saves Password Reset
document.getElementById('btn-save-reset-pass').addEventListener('click', async () => {
  const uid = parseInt(document.getElementById('usr-reset-id').value);
  const p1 = document.getElementById('usr-reset-pass1').value.trim();
  const p2 = document.getElementById('usr-reset-pass2').value.trim();
  
  if (!p1) {
    alert('Şifre boş bırakılamaz.');
    return;
  }
  if (p1 !== p2) {
    alert('Şifreler eşleşmiyor.');
    return;
  }
  
  try {
    await window.api.resetPassword(uid, p1);
    alert('Kullanıcı şifresi güncellendi.');
    closeAllModals();
  } catch (err) {
    alert(`Şifre güncellenemedi:\n${err.message}`);
  }
});

async function toggleUserActiveStatus() {
  if (!selectedUserRowId) {
    alert('Lütfen listeden bir kullanıcı seçin.');
    return;
  }
  
  const selectedRow = document.querySelector(`#users-table tbody tr[data-id="${selectedUserRowId}"]`);
  const uName = selectedRow.cells[1].textContent;
  const isCurrentlyActive = selectedRow.cells[3].textContent.includes('Aktif');
  
  if (uName === currentUser) {
    alert('Kendi hesabınızı pasif yapamazsınız.');
    return;
  }
  
  const targetState = isCurrentlyActive ? 0 : 1;
  const stateStr = targetState ? 'aktif' : 'pasif';
  const confirmToggle = confirm(`'${uName}' kullanıcısı ${stateStr} yapılsın mı?`);
  if (!confirmToggle) return;
  
  try {
    await window.api.toggleUserActive(selectedUserRowId, targetState);
    refreshUsersTable();
  } catch (err) {
    alert(`İşlem başarısız:\n${err.message}`);
  }
}

async function deleteUserRecord() {
  if (!selectedUserRowId) {
    alert('Lütfen listeden bir kullanıcı seçin.');
    return;
  }
  
  const selectedRow = document.querySelector(`#users-table tbody tr[data-id="${selectedUserRowId}"]`);
  const uName = selectedRow.cells[1].textContent;
  
  if (uName === currentUser) {
    alert('Kendi hesabınızı silemezsiniz.');
    return;
  }
  
  const confirmDelete = confirm(`'${uName}' kullanıcısı kalıcı olarak silinsin mi?\n\nBu işlem geri alınamaz.`);
  if (!confirmDelete) return;
  
  try {
    await window.api.deleteUser(selectedUserRowId);
    alert(`'${uName}' kullanıcısı başarıyla silindi.`);
    refreshUsersTable();
  } catch (err) {
    alert(`Silme işlemi başarısız:\n${err.message}`);
  }
}

// ==================== TAB 5: SYSTEM & SERVER SETTINGS ====================
async function refreshServerSettingsTab() {
  try {
    const config = await window.api.loadConfig();
    
    // Status text displays
    document.getElementById('server-lbl-mode').textContent = config.mod === 'istemci' ? 'İstemci Modu' : 'Yerel / Paylaşım Modu';
    document.getElementById('server-lbl-db-path').textContent = config.db_yolu || '(Mevcut Değil)';
    
    const apiRow = document.getElementById('server-row-api-url');
    if (config.mod === 'istemci') {
      apiRow.classList.remove('hidden');
      document.getElementById('server-lbl-api-url').textContent = config.sunucu_url;
    } else {
      apiRow.classList.add('hidden');
    }
    
    // Fetch Local host IP Addresses
    const ipListDiv = document.getElementById('local-ips-list');
    ipListDiv.innerHTML = '';
    const ips = await window.api.getLocalIps();
    const port = document.getElementById('integrated-server-port').value;
    
    ips.forEach(ip => {
      const url = `http://${ip}:${port}`;
      const div = document.createElement('div');
      div.className = 'ip-item';
      div.innerHTML = `
        <span class="ip-address">🌐  ${url}</span>
        <button class="btn btn-outline btn-sm" onclick="copyTextToClipboard('${url}')">Kopyala</button>
      `;
      ipListDiv.appendChild(div);
    });
    
    // Fetch running Server state
    const status = await window.api.getServerStatus();
    updateServerStatusUI(status.running, status.port);
    
  } catch (e) {
    console.error('Error refreshing server settings tab:', e);
  }
}

async function openDbFolderInExplorer() {
  try {
    const config = await window.api.loadConfig();
    if (config.db_yolu) {
      await window.api.showInExplorer(config.db_yolu);
    } else {
      alert('Kayıtlı veritabanı yolu bulunamadı.');
    }
  } catch (e) {
    alert(`Klasör açılamadı: ${e.message}`);
  }
}

async function toggleIntegratedExpressServer() {
  const btn = document.getElementById('btn-toggle-integrated-server');
  const portInput = document.getElementById('integrated-server-port');
  const port = parseInt(portInput.value) || 8765;
  const isRunning = btn.textContent.includes('Durdur');
  
  try {
    const status = await window.api.toggleLocalServer(port, !isRunning);
    updateServerStatusUI(status.running, status.port);
    
    if (status.running) {
      alert(`Entegre API Sunucusu port ${port} üzerinde başlatıldı.`);
    } else {
      alert('API Sunucusu durduruldu.');
    }
  } catch (err) {
    alert(`Sunucu başlatılamadı:\n${err.message}`);
  }
}

function updateServerStatusUI(running, port) {
  const lbl = document.getElementById('lbl-integrated-server-status');
  const btn = document.getElementById('btn-toggle-integrated-server');
  const portInput = document.getElementById('integrated-server-port');
  
  if (running) {
    lbl.textContent = `✅ Çalışıyor (Port: ${port})`;
    lbl.className = 'status-on';
    btn.textContent = '⏹ Sunucuyu Durdur';
    btn.className = 'btn btn-danger';
    portInput.setAttribute('disabled', 'true');
  } else {
    lbl.textContent = '⏹ Durduruldu';
    lbl.className = 'status-off';
    btn.textContent = '▶ Sunucuyu Başlat';
    btn.className = 'btn btn-success';
    portInput.removeAttribute('disabled');
  }
}

// ==================== WINDOWS & GENERAL UTILS ====================

// Format Date to: YYYY-MM-DD HH:MM:SS
function getFormattedCurrentDateTime() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const sec = pad(now.getSeconds());
  
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`;
}

// Clipboard copying utility
window.copyTextToClipboard = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert(`Kopyalandı:\n${text}`);
  }).catch(err => {
    alert('Kopyalama başarısız.');
  });
};

// ==================== MODALS ACTIONS ====================
function setupModalEvents() {
  // Bind close buttons in modals
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });
  
  // Close modal when clicking backdrop
  document.getElementById('modal-backdrop').addEventListener('click', closeAllModals);
}

function openModal(modalId) {
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById(modalId).classList.remove('hidden');
}

function closeAllModals() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.querySelectorAll('.modal-card').forEach(m => m.classList.add('hidden'));
}

// Global Row Level Handlers
window.handleRowViewDetail = async function(saleId) {
  selectedSaleRowId = saleId;
  await viewSaleDetail();
};

window.handleRowEdit = async function(saleId) {
  selectedSaleRowId = saleId;
  await openEditSaleModal();
};

window.handleRowWaybill = async function(saleId, hasWaybill) {
  selectedSaleRowId = saleId;
  if (hasWaybill === '1') {
    await viewWaybillFile();
  } else {
    await uploadWaybillFile();
  }
};

window.handleRowDelete = async function(saleId) {
  selectedSaleRowId = saleId;
  await deleteSaleRecord();
};
