const { contextBridge, ipcRenderer } = require('electron');

// Expose protected APIs to the renderer process (frontend)
contextBridge.exposeInMainWorld('api', {
  // Config & Connection
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  testConnection: (mode, url, dbPath) => ipcRenderer.invoke('test-connection', { mode, url, dbPath }),
  getRates: () => ipcRenderer.invoke('get-rates'),
  saveRates: (rates) => ipcRenderer.invoke('save-rates', rates),
  
  // Auth
  login: (username, password) => ipcRenderer.invoke('login', { username, password }),
  
  // Sales
  getSales: () => ipcRenderer.invoke('get-sales'),
  addSale: (saleData) => ipcRenderer.invoke('add-sale', saleData),
  getSaleDetails: (saleId) => ipcRenderer.invoke('get-sale-details', saleId),
  deleteSale: (saleId) => ipcRenderer.invoke('delete-sale', saleId),
  
  // Waybills
  uploadWaybill: (saleId) => ipcRenderer.invoke('upload-waybill', saleId),
  viewWaybill: (saleId) => ipcRenderer.invoke('view-waybill', saleId),
  
  // Invoices & Delivery
  uploadInvoice: (saleId) => ipcRenderer.invoke('upload-invoice', saleId),
  viewInvoice: (saleId) => ipcRenderer.invoke('view-invoice', saleId),
  deliverSale: (saleId, teslim_yeri, teslim_notu) => ipcRenderer.invoke('deliver-sale', { saleId, teslim_yeri, teslim_notu }),
  
  // Reports
  exportExcel: (data) => ipcRenderer.invoke('export-excel', data),
  exportReceiptPdf: (data) => ipcRenderer.invoke('export-receipt-pdf', data),
  regenerateReceiptPdf: (saleId) => ipcRenderer.invoke('regenerate-receipt-pdf', saleId),
  exportDetailPdf: (saleId) => ipcRenderer.invoke('export-detail-pdf', saleId),
  exportDetailExcel: (saleId) => ipcRenderer.invoke('export-detail-excel', saleId),
  exportAllSalesExcel: (role) => ipcRenderer.invoke('export-all-sales-excel', role),
  exportAllSalesPdf: (role) => ipcRenderer.invoke('export-all-sales-pdf', role),
  
  // Products
  getProducts: () => ipcRenderer.invoke('get-products'),
  getPriceHistory: (prodName) => ipcRenderer.invoke('get-price-history', prodName),
  
  // User Management
  getUsers: () => ipcRenderer.invoke('get-users'),
  addUser: (userData) => ipcRenderer.invoke('add-user', userData),
  editUser: (uid, userData) => ipcRenderer.invoke('edit-user', { uid, userData }),
  resetPassword: (uid, password) => ipcRenderer.invoke('reset-password', { uid, password }),
  toggleUserActive: (uid, active) => ipcRenderer.invoke('toggle-user-active', { uid, active }),
  deleteUser: (uid) => ipcRenderer.invoke('delete-user', uid),
  
  // Network / Server
  getLocalIps: () => ipcRenderer.invoke('get-local-ips'),
  showInExplorer: (dirPath) => ipcRenderer.invoke('show-in-explorer', dirPath),
  toggleLocalServer: (port, start) => ipcRenderer.invoke('toggle-local-server', { port, start }),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  
  // Dialogs
  showAlert: (message, title = 'Bilgi') => ipcRenderer.invoke('show-alert', { message, title }),
  showError: (message, title = 'Hata') => ipcRenderer.invoke('show-error', { message, title }),
  showConfirm: (message, title = 'Onay') => ipcRenderer.sendSync('show-confirm', { message, title }),
  
  // External link opener
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Update & Version Control
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  relaunchApp: () => ipcRenderer.invoke('relaunch-app'),
  editSale: (sid, saleData) => ipcRenderer.invoke('edit-sale', { sid, saleData })
});
