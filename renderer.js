// --- Global UI Variables ---
let currentUser = null;
let currentRole = null;
let calculatedData = {};
let selectedSaleRowId = null;
let selectedUserRowId = null;

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
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize theme
  initTheme();
  const btnToggleTheme = document.getElementById('btn-toggle-theme');
  if (btnToggleTheme) btnToggleTheme.addEventListener('click', toggleTheme);
  const btnToggleThemeLogin = document.getElementById('btn-toggle-theme-login');
  if (btnToggleThemeLogin) btnToggleThemeLogin.addEventListener('click', toggleTheme);

  // Load synced rates
  await loadPaymentRates();
  
  // Periodically refresh payment rates every 5 seconds to sync between clients
  setInterval(loadPaymentRates, 5000);

  // Check for Github updates on startup
  checkUpdates();
  
  // Bind Update trigger
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

  // Manual update check button
  const btnCheckUpdateManual = document.getElementById('btn-check-update-manual');
  if (btnCheckUpdateManual) {
    btnCheckUpdateManual.addEventListener('click', handleManualUpdateCheck);
  }

  // Bind change/blur listeners to rate inputs to save changes to DB
  document.querySelectorAll('.rate-input').forEach(el => {
    el.addEventListener('change', saveRatesToDb);
    el.addEventListener('blur', saveRatesToDb);
  });

  setupTabEvents();
  setupCalculationTraces();
  setupModalEvents();
  await refreshConnectionIndicator();
  
  // Bind Login Trigger
  document.getElementById('btn-login').addEventListener('click', handleLogin);
  document.getElementById('login-password').addEventListener('keyup', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  
  // Connection panel
  document.getElementById('btn-open-conn-settings').addEventListener('click', openConnectionSettingsModal);
  document.getElementById('btn-test-conn-settings').addEventListener('click', testConnectionSettings);
  document.getElementById('btn-save-conn-settings').addEventListener('click', saveConnectionSettings);
  
  // Dashboard Action Triggers
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
  document.getElementById('btn-refresh-sales').addEventListener('click', refreshSalesTable);
  document.getElementById('btn-export-all-excel').addEventListener('click', handleExportAllSalesExcel);
  document.getElementById('btn-export-all-pdf').addEventListener('click', handleExportAllSalesPdf);
  document.getElementById('btn-refresh-history-products').addEventListener('click', refreshHistoryProducts);
  document.getElementById('history-product-dropdown').addEventListener('change', refreshPriceHistory);
  document.getElementById('btn-refresh-users').addEventListener('click', refreshUsersTable);
  
  // Calculation Tab Action Buttons
  document.getElementById('btn-export-excel').addEventListener('click', exportPriceAnalysisExcel);
  document.getElementById('btn-export-pdf').addEventListener('click', exportPriceAnalysisPdf);
  document.getElementById('btn-save-sale').addEventListener('click', saveSaleRecord);
  
  // Sales Tab Action Buttons
  document.getElementById('btn-view-sale-detail').addEventListener('click', viewSaleDetail);
  document.getElementById('btn-edit-sale').addEventListener('click', openEditSaleModal);
  document.getElementById('btn-save-edit-sale').addEventListener('click', saveEditSaleRecord);
  setupEditSaleCalculationTraces();

  document.getElementById('btn-upload-waybill').addEventListener('click', uploadWaybillFile);
  document.getElementById('btn-view-waybill').addEventListener('click', viewWaybillFile);
  document.getElementById('btn-reprint-pdf').addEventListener('click', reprintReceiptPdf);
  document.getElementById('btn-detail-pdf').addEventListener('click', printDetailPdf);
  document.getElementById('btn-detail-excel').addEventListener('click', printDetailExcel);
  document.getElementById('btn-delete-sale').addEventListener('click', deleteSaleRecord);
  
  // User Management Tab Action Buttons
  document.getElementById('btn-add-user').addEventListener('click', openAddUserModal);
  document.getElementById('btn-edit-user').addEventListener('click', openEditUserModal);
  document.getElementById('btn-reset-password').addEventListener('click', openResetPasswordModal);
  document.getElementById('btn-toggle-user').addEventListener('click', toggleUserActiveStatus);
  document.getElementById('btn-delete-user').addEventListener('click', deleteUserRecord);
  
  // Server Tab Action Buttons
  document.getElementById('server-btn-change-conn').addEventListener('click', openConnectionSettingsModal);
  document.getElementById('server-btn-show-db-folder').addEventListener('click', openDbFolderInExplorer);
  document.getElementById('btn-toggle-integrated-server').addEventListener('click', toggleIntegratedExpressServer);
  
  // Pre-load default local connection configs if files ready
  const config = await window.api.loadConfig();
  if (config) {
    document.getElementById('conn-db-path').value = config.db_yolu || '';
    document.getElementById('conn-server-url').value = config.sunucu_url || '';
  }
  
  // Bind Kuisoft Signature clicks to open externally
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
  try {
    const config = await window.api.loadConfig();
    const indicator = document.getElementById('login-mode-indicator');
    if (!indicator) return;
    
    if (config.mod === 'istemci') {
      indicator.textContent = `🌐 İstemci: ${config.sunucu_url}`;
    } else if (config.mod === 'paylasim') {
      indicator.textContent = `🖥 Ağ Paylaşım: SQLite`;
    } else {
      indicator.textContent = `🖥 Yerel Mod`;
    }
  } catch (e) {
    console.error('Error refreshing connection indicator:', e);
  }
}

function openConnectionSettingsModal() {
  window.api.loadConfig().then(config => {
    // Select correct radio
    const radio = document.querySelector(`input[name="conn-mode"][value="${config.mod}"]`);
    if (radio) {
      radio.checked = true;
      triggerConnectionSubForms(config.mod);
    }
    
    document.getElementById('conn-db-path').value = config.db_yolu || '';
    document.getElementById('conn-server-url').value = config.sunucu_url || '';
    
    openModal('modal-conn-settings');
  });
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
  
  if (mode === 'paylasim') {
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

  // Connection settings modal: only Süper Admin can edit connection settings
  const connSettingsInputs = document.querySelectorAll('#modal-conn-settings input, #modal-conn-settings button');
  if (currentRole === 'Süper Admin') {
    connSettingsInputs.forEach(el => el.removeAttribute('disabled'));
  } else {
    connSettingsInputs.forEach(el => el.setAttribute('disabled', 'true'));
  }

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
      el.setAttribute('disabled', 'true');
      el.value = '';
    }
    runCumulativePriceCalculation();
  });
}

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
  if (hasTorba) {
    bagInput.removeAttribute('disabled');
  } else {
    bagInput.setAttribute('disabled', 'true');
  }
  
  // Weight mappings
  const weights = {
    'KG': 1.0,
    'TON': 1000.0,
    'TORBA': bagWeight,
    'M2': 1.0
  };
  
  // 1. Convert Purchase Price to Quantity Unit
  let purConversionFactor = 1.0;
  if (uQtyType !== uPurType && uQtyType !== 'M2' && uPurType !== 'M2') {
    const wQ = weights[uQtyType] || 1.0;
    const wPur = weights[uPurType] || 1.0;
    purConversionFactor = wQ / wPur;
  }
  
  // 2. Convert Selling Price to Quantity Unit
  let selConversionFactor = 1.0;
  if (uQtyType !== uSelType && uQtyType !== 'M2' && uSelType !== 'M2') {
    const wQ = weights[uQtyType] || 1.0;
    const wSel = weights[uSelType] || 1.0;
    selConversionFactor = wQ / wSel;
  }
  
  const convertedPurchasePrice = purchasePrice * purConversionFactor;
  const convertedBasePrice = basePrice * selConversionFactor;
  
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
  
  // Calculate unit extra costs
  const unitExtraCost = (shipCost + unloadCost) / qty;
  const unitBasePrice = convertedBasePrice + unitExtraCost;
  const unitCost = convertedPurchasePrice > 0 ? (convertedPurchasePrice + unitExtraCost) : 0.0;
  
  // Payment Type base rates
  const paymentTypes = [
    { name: 'Nakit', rate: getFloatValue('rate-cash', 0.0) },
    { name: 'Kredi Kartı', rate: getFloatValue('rate-cc', 0.0) },
    { name: 'Çek', rate: getFloatValue('rate-check', 0.0) },
    { name: 'Senet', rate: getFloatValue('rate-note', 0.0) },
    { name: 'Evrak', rate: getFloatValue('rate-doc', 0.0) },
    { name: 'DBS', rate: getFloatValue('rate-dbs', 0.0) }
  ];

  console.log(`[Calc] qty=${qty}, basePrice=${basePrice}, purchasePrice=${purchasePrice}, bagWeight=${bagWeight}`);
  console.log(`[Calc] uQtyType=${uQtyType}, uPurType=${uPurType}, uSelType=${uSelType}`);
  console.log(`[Calc] purConversionFactor=${purConversionFactor}, selConversionFactor=${selConversionFactor}`);
  console.log(`[Calc] convertedPurchasePrice=${convertedPurchasePrice}, convertedBasePrice=${convertedBasePrice}`);
  console.log(`[Calc] totalVadeSurcharge=${totalVadeSurcharge}, shipCost=${shipCost}, unloadCost=${unloadCost}`);
  console.log(`[Calc] unitExtraCost=${unitExtraCost}, unitBasePrice=${unitBasePrice}, unitCost=${unitCost}`);
  
  // Clear table grid
  const tableBody = document.querySelector('#analysis-table tbody');
  tableBody.innerHTML = '';
  calculatedData = {};
  
  if (basePrice <= 0) return;
  
  paymentTypes.forEach(p => {
    const finalAppliedRate = p.name === 'Nakit' ? p.rate : (p.rate + totalVadeSurcharge);
    const unitFinalPrice = unitBasePrice * (1 + (finalAppliedRate / 100));
    const totalFinalPrice = unitFinalPrice * qty;
    const totalProfit = unitCost > 0 ? (totalFinalPrice - (unitCost * qty)) : 0.0;
    const profitMarginPct = (unitCost > 0) ? (totalProfit / (unitCost * qty) * 100) : 0.0;
    
    // Store calculations locally
    calculatedData[p.name] = {
      unit_price: unitFinalPrice,
      total_price: totalFinalPrice,
      profit: totalProfit,
      profit_margin: profitMarginPct,
      cumulative_rate: finalAppliedRate,
      base_rate: p.rate
    };
    
    const profitText = purchasePrice > 0 
      ? `${formatMoney(totalProfit)} ₺ (${profitMarginPct >= 0 ? '+' : ''}${profitMarginPct.toFixed(2)}%)` 
      : '-';
      
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>%${p.rate.toFixed(2)}</td>
      <td>%${finalAppliedRate.toFixed(2)}</td>
      <td>${formatMoney(unitFinalPrice)} ₺</td>
      <td>${formatMoney(totalFinalPrice)} ₺</td>
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

  const pName = document.getElementById('prod-name').value.trim().toUpperCase();
  if (!pName) {
    alert('Lütfen Ürün Adı / Kodu giriniz.');
    return;
  }

  const saleData = {
    tarih: getFormattedCurrentDateTime(),
    kullanici: currentUser,
    musteri_adi: document.getElementById('cust-name').value.trim().toUpperCase() || '..............',
    urun_adi: pName,
    miktar: getFloatValue('qty', 1.0, 0.0001),
    birim: document.getElementById('unit-type').value,
    fiyat_birimi: document.getElementById('base-price-type').value,
    torba_agirligi: getFloatValue('bag-weight', 50.0, 0.0001),
    alis_fiyati: getFloatValue('purchase-price', 0.0),
    alis_birimi: document.getElementById('purchase-price-type').value,
    baz_satis_fiyati: getFloatValue('base-price', 0.0),
    odeme_turu: selectedType,
    vade_ay: parseInt(document.getElementById('vade-months').value) || 0,
    vade_orani: getFloatValue('vade-rate', 0.0),
    birim_fiyat: 0.0, // Will be set below
    toplam_tutar: pricing.total_price,
    kar: pricing.profit,
    irsaliye_yolu: '',
    nakliye_dahil: document.getElementById('has-shipping').checked ? 1 : 0,
    nakliye_maliyeti: getFloatValue('shipping-cost', 0.0),
    indirme_dahil: document.getElementById('has-unloading').checked ? 1 : 0,
    indirme_maliyeti: getFloatValue('unloading-cost', 0.0)
  };

  saleData.birim_fiyat = getSaleBaseUnitPrice(saleData);

  try {
    await window.api.addSale(saleData);
    alert('Satış kaydı başarıyla kaydedildi.');
    // Refresh tables/lists without clearing the inputs, matching Python behavior
    refreshSalesTable();
    refreshHistoryProducts();
  } catch (err) {
    alert(`Kaydetme sırasında hata oluştu:\n${err.message}`);
  }
}

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
      const isUploaded = sale.irsaliye_yolu ? '✅ Yüklendi' : '❌ Yüklenmedi';
      const tr = document.createElement('tr');
      tr.setAttribute('data-id', sale.id);
      
      const totalCost = sale.toplam_tutar - sale.kar;
      const profitMarginPct = totalCost > 0 ? (sale.kar / totalCost * 100) : 0.0;
      const profitText = (sale.kar !== undefined && sale.kar !== null && totalCost > 0)
        ? `${formatMoney(sale.kar)} ₺ (${profitMarginPct >= 0 ? '+' : ''}${profitMarginPct.toFixed(2)}%)`
        : (sale.kar !== undefined && sale.kar !== null ? `${formatMoney(sale.kar)} ₺` : '-');

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
        <td>${isUploaded}</td>
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
    'edit-sale-qty', 'edit-sale-purchase-price', 'edit-sale-base-price', 'edit-sale-vade-rate',
    'edit-sale-bag-weight', 'edit-sale-shipping-cost', 'edit-sale-unloading-cost',
    'edit-sale-unit-type', 'edit-sale-purchase-price-type', 'edit-sale-base-price-type',
    'edit-sale-receipt-type', 'edit-sale-vade-months'
  ];
  
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
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
  const qty = getFloatValue('edit-sale-qty', 1.0, 0.0001);
  const basePrice = getFloatValue('edit-sale-base-price', 0.0);
  const purchasePrice = getFloatValue('edit-sale-purchase-price', 0.0);
  const bagWeight = getFloatValue('edit-sale-bag-weight', 50.0, 0.0001);
  
  const uQtyType = document.getElementById('edit-sale-unit-type').value;
  const uPurType = document.getElementById('edit-sale-purchase-price-type').value;
  const uSelType = document.getElementById('edit-sale-base-price-type').value;
  
  // Toggle Bag Weight field visibility
  const hasTorba = [uQtyType, uPurType, uSelType].includes('TORBA');
  const bagInput = document.getElementById('edit-sale-bag-weight');
  if (hasTorba) {
    bagInput.removeAttribute('disabled');
  } else {
    bagInput.setAttribute('disabled', 'true');
  }
  
  // Weight mappings
  const weights = {
    'KG': 1.0,
    'TON': 1000.0,
    'TORBA': bagWeight,
    'M2': 1.0
  };
  
  // 1. Convert Purchase Price to Quantity Unit
  let purConversionFactor = 1.0;
  if (uQtyType !== uPurType && uQtyType !== 'M2' && uPurType !== 'M2') {
    const wQ = weights[uQtyType] || 1.0;
    const wPur = weights[uPurType] || 1.0;
    purConversionFactor = wQ / wPur;
  }
  
  // 2. Convert Selling Price to Quantity Unit
  let selConversionFactor = 1.0;
  if (uQtyType !== uSelType && uQtyType !== 'M2' && uSelType !== 'M2') {
    const wQ = weights[uQtyType] || 1.0;
    const wSel = weights[uSelType] || 1.0;
    selConversionFactor = wQ / wSel;
  }
  
  const convertedPurchasePrice = purchasePrice * purConversionFactor;
  const convertedBasePrice = basePrice * selConversionFactor;
  
  // Vade interest Calculations
  const vadeMonths = parseInt(document.getElementById('edit-sale-vade-months').value) || 0;
  const vadeRate = getFloatValue('edit-sale-vade-rate', 0.0);
  const totalVadeSurcharge = vadeMonths * vadeRate;
  
  // Shipping / Unloading values
  const hasShipping = document.getElementById('edit-sale-has-shipping').checked;
  const shipCost = hasShipping ? getFloatValue('edit-sale-shipping-cost', 0.0) : 0.0;
  
  const hasUnloading = document.getElementById('edit-sale-has-unloading').checked;
  const unloadCost = hasUnloading ? getFloatValue('edit-sale-unloading-cost', 0.0) : 0.0;
  
  // Calculate unit extra costs
  const unitExtraCost = (shipCost + unloadCost) / qty;
  const unitBasePrice = convertedBasePrice + unitExtraCost;
  const unitCost = convertedPurchasePrice > 0 ? (convertedPurchasePrice + unitExtraCost) : 0.0;
  
  // Get base rate for current payment type
  const currentPayType = document.getElementById('edit-sale-receipt-type').value;
  let baseRate = 0.0;
  if (currentPayType === 'Nakit') baseRate = getFloatValue('rate-cash', 0.0);
  else if (currentPayType === 'Kredi Kartı') baseRate = getFloatValue('rate-cc', 0.0);
  else if (currentPayType === 'Çek') baseRate = getFloatValue('rate-check', 0.0);
  else if (currentPayType === 'Senet') baseRate = getFloatValue('rate-note', 0.0);
  else if (currentPayType === 'Evrak') baseRate = getFloatValue('rate-doc', 0.0);
  else if (currentPayType === 'DBS') baseRate = getFloatValue('rate-dbs', 0.0);

  const finalAppliedRate = currentPayType === 'Nakit' ? baseRate : (baseRate + totalVadeSurcharge);
  const unitFinalPrice = unitBasePrice * (1 + (finalAppliedRate / 100));
  const totalFinalPrice = unitFinalPrice * qty;
  const totalProfit = unitCost > 0 ? (totalFinalPrice - (unitCost * qty)) : 0.0;
  const profitMarginPct = (unitCost > 0) ? (totalProfit / (unitCost * qty) * 100) : 0.0;

  // Update DOM labels
  document.getElementById('edit-sale-lbl-base-unit-price').textContent = `${formatMoney(convertedBasePrice)} ₺`;
  document.getElementById('edit-sale-lbl-unit-price').textContent = `${formatMoney(unitFinalPrice)} ₺`;
  document.getElementById('edit-sale-lbl-total-price').textContent = `${formatMoney(totalFinalPrice)} ₺`;
  
  const profitText = purchasePrice > 0 
    ? `${formatMoney(totalProfit)} ₺ (${profitMarginPct >= 0 ? '+' : ''}${profitMarginPct.toFixed(2)}%)` 
    : '-';
  document.getElementById('edit-sale-lbl-profit').textContent = profitText;

  return {
    convertedBasePrice,
    unitFinalPrice,
    totalFinalPrice,
    totalProfit
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
    document.getElementById('edit-sale-prod-name').value = sale.urun_adi || '';
    document.getElementById('edit-sale-qty').value = sale.miktar || 1;
    document.getElementById('edit-sale-unit-type').value = sale.birim || 'TORBA';
    document.getElementById('edit-sale-bag-weight').value = sale.torba_agirligi || 50;
    
    document.getElementById('edit-sale-purchase-price').value = sale.alis_fiyati || '';
    document.getElementById('edit-sale-purchase-price-type').value = sale.alis_birimi || sale.birim || 'TORBA';
    
    document.getElementById('edit-sale-base-price').value = sale.baz_satis_fiyati || '';
    document.getElementById('edit-sale-base-price-type').value = sale.fiyat_birimi || 'TON';
    
    document.getElementById('edit-sale-receipt-type').value = sale.odeme_turu || 'Nakit';
    document.getElementById('edit-sale-vade-months').value = sale.vade_ay || 0;
    document.getElementById('edit-sale-vade-rate').value = sale.vade_orani || 0;
    
    document.getElementById('edit-sale-waybill-path').value = sale.irsaliye_yolu ? 'Yüklendi' : 'Yüklenmedi';
    
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
    
    // Set visibility of manager only sections in edit modal based on current user role (always visible since managers columns are visible to all users)
    const managerFields = document.querySelectorAll('#modal-edit-sale .manager-only');
    managerFields.forEach(el => el.classList.remove('hidden'));

    openModal('modal-edit-sale');
    runEditSaleCalculation();
  } catch (err) {
    alert(`Satış bilgileri yüklenemedi:\n${err.message}`);
  }
}

async function saveEditSaleRecord() {
  const sid = parseInt(document.getElementById('edit-sale-id').value);
  if (!sid) return;

  const pName = document.getElementById('edit-sale-prod-name').value.trim().toUpperCase();
  if (!pName) {
    alert('Lütfen Ürün Adı / Kodu giriniz.');
    return;
  }

  const calc = runEditSaleCalculation();
  if (!calc) return;

  const saleData = {
    tarih: editingSaleMetadata.tarih,
    kullanici: editingSaleMetadata.kullanici,
    irsaliye_yolu: editingSaleMetadata.irsaliye_yolu,
    musteri_adi: document.getElementById('edit-sale-cust-name').value.trim().toUpperCase() || '..............',
    urun_adi: pName,
    miktar: getFloatValue('edit-sale-qty', 1.0, 0.0001),
    birim: document.getElementById('edit-sale-unit-type').value,
    fiyat_birimi: document.getElementById('edit-sale-base-price-type').value,
    torba_agirligi: getFloatValue('edit-sale-bag-weight', 50.0, 0.0001),
    alis_fiyati: getFloatValue('edit-sale-purchase-price', 0.0),
    alis_birimi: document.getElementById('edit-sale-purchase-price-type').value,
    baz_satis_fiyati: getFloatValue('edit-sale-base-price', 0.0),
    odeme_turu: document.getElementById('edit-sale-receipt-type').value,
    vade_ay: parseInt(document.getElementById('edit-sale-vade-months').value) || 0,
    vade_orani: getFloatValue('edit-sale-vade-rate', 0.0),
    birim_fiyat: calc.convertedBasePrice,
    toplam_tutar: calc.totalFinalPrice,
    kar: calc.totalProfit,
    nakliye_dahil: document.getElementById('edit-sale-has-shipping').checked ? 1 : 0,
    nakliye_maliyeti: getFloatValue('edit-sale-shipping-cost', 0.0),
    indirme_dahil: document.getElementById('edit-sale-has-unloading').checked ? 1 : 0,
    indirme_maliyeti: getFloatValue('edit-sale-unloading-cost', 0.0)
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
      const totalCost = sale.toplam_tutar - sale.kar;
      const profitMarginPct = totalCost > 0 ? (sale.kar / totalCost * 100) : 0.0;
      const detKarText = totalCost > 0 
        ? `${formatMoney(sale.kar)} ₺ (${profitMarginPct >= 0 ? '+' : ''}${profitMarginPct.toFixed(2)}%)`
        : `${formatMoney(sale.kar)} ₺`;
      document.getElementById('det-kar').textContent = detKarText;
    } else {
      adminFields.forEach(el => el.classList.add('hidden'));
    }
    
    document.getElementById('det-irsaliye').textContent = sale.irsaliye_yolu ? 'Yüklendi' : 'Yüklenmedi';
    
    openModal('modal-sale-details');
  } catch (err) {
    alert(`Detaylar yüklenemedi:\n${err.message}`);
  }
}

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
