/**
 * =========================================================================
 * API.JS — API Layer: ระบบสร้างเกียรติบัตร (Netlify Version)
 * =========================================================================
 * ทดแทน google.script.run ทั้งหมด
 * ใช้ fetch() ส่ง POST request ไปยัง /api (Netlify Proxy → GAS)
 * =========================================================================
 */

var API_BASE = '/api';

var api = {

  /**
   * เรียก GAS Backend ผ่าน Netlify Proxy
   * @param {string} action - ชื่อ action (ตรงกับ doPost router ใน Code.gs)
   * @param {object} params - พารามิเตอร์ทั้งหมด
   * @returns {Promise<object>} - ผลลัพธ์จาก GAS
   */
  call: function(action, params) {
    params = params || {};
    var token = getToken();
    var body = { action: action, token: token };

    // Merge params into body
    for (var key in params) {
      if (params.hasOwnProperty(key)) {
        body[key] = params[key];
      }
    }

    return fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body)
    })
    .then(function(response) {
      if (!response.ok) {
        throw new Error('HTTP Error ' + response.status);
      }
      return response.json();
    })
    .then(function(result) {
      // Session expired → กลับ Login
      if (result && result.status === false && result.message &&
          result.message.indexOf('เข้าสู่ระบบ') !== -1) {
        clearToken();
        showLoginScreen();
        showToast('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', 'warning');
        return Promise.reject(new Error('SESSION_EXPIRED'));
      }
      return result;
    })
    .catch(function(err) {
      if (err.message === 'SESSION_EXPIRED') throw err;
      console.error('API Error [' + action + ']:', err);
      throw err;
    });
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CONVENIENCE METHODS
  // ═══════════════════════════════════════════════════════════════════════

  // 🔐 Authentication
  login: function(username, password) {
    return api.call('loginUser', { username: username, password: password });
  },
  checkSession: function() {
    return api.call('checkSession');
  },
  logout: function() {
    return api.call('logoutUser');
  },
  changePassword: function(oldPassword, newPassword) {
    return api.call('changePassword', { oldPassword: oldPassword, newPassword: newPassword });
  },

  // 📋 Data CRUD
  getData: function(options) {
    return api.call('getData', { options: options });
  },
  getAllRecords: function() {
    return api.call('getAllRecords');
  },
  addRecord: function(record) {
    return api.call('addRecord', { record: record });
  },
  editRecord: function(rowIndex, record) {
    return api.call('editRecord', { rowIndex: rowIndex, record: record });
  },
  deleteRecords: function(rowIndexes) {
    return api.call('deleteRecords', { rowIndexes: rowIndexes });
  },
  importData: function(jsonData, mode) {
    return api.call('importData', { jsonData: jsonData, mode: mode });
  },

  // 🎨 Template Management
  saveTemplateConfig: function(config) {
    return api.call('saveTemplateConfig', { config: config });
  },
  loadTemplateConfig: function(templateId) {
    return api.call('loadTemplateConfig', { templateId: templateId });
  },
  getTemplateList: function() {
    return api.call('getTemplateList');
  },
  getTemplateListWithCounts: function() {
    return api.call('getTemplateListWithCounts');
  },
  switchTemplateContext: function(templateId) {
    return api.call('switchTemplateContext', { templateId: templateId });
  },
  deleteTemplate: function(templateId) {
    return api.call('deleteTemplate', { templateId: templateId });
  },
  renameTemplate: function(templateId, newName, newPrefix) {
    return api.call('renameTemplate', { templateId: templateId, newName: newName, newPrefix: newPrefix });
  },
  duplicateTemplate: function(templateId, newName, newPrefix) {
    return api.call('duplicateTemplate', { templateId: templateId, newName: newName, newPrefix: newPrefix });
  },

  // 🖼️ Upload
  uploadTemplateImage: function(base64Data, filename) {
    return api.call('uploadTemplateImage', { base64Data: base64Data, filename: filename });
  },
  uploadElementImage: function(base64Data, filename) {
    return api.call('uploadElementImage', { base64Data: base64Data, filename: filename });
  },

  // 🖼️ Image & Drive
  getImageBase64: function(fileId) {
    return api.call('getImageBase64', { fileId: fileId });
  },
  getImagePublicUrl: function(fileId) {
    return api.call('getImagePublicUrl', { fileId: fileId });
  },
  getUploadConfig: function(templateName) {
    return api.call('getUploadConfig', { templateName: templateName });
  },

  // 📤 Export & Status
  saveCertificateImage: function(base64Data, filename, rowIndex, templateName) {
    return api.call('saveCertificateImage', { base64Data: base64Data, filename: filename, rowIndex: rowIndex, templateName: templateName });
  },
  saveZipFile: function(base64Data, filename) {
    return api.call('saveZipFile', { base64Data: base64Data, filename: filename });
  },
  batchUpdateCertStatus: function(results) {
    return api.call('batchUpdateCertStatus', { results: results });
  },
  updateRecordStatuses: function(updates) {
    return api.call('updateRecordStatuses', { updates: updates });
  },
  getExportHistory: function() {
    return api.call('getExportHistory');
  },
  clearExportHistory: function() {
    return api.call('clearExportHistory');
  },

  // 📊 Dashboard & Settings
  getStats: function() {
    return api.call('getStats');
  },
  getRecentActivity: function() {
    return api.call('getRecentActivity');
  },
  getSettings: function() {
    return api.call('getSettings');
  },
  updateSettings: function(settingsObj) {
    return api.call('updateSettings', { settingsObj: settingsObj });
  },
  getNextCertNumber: function() {
    return api.call('getNextCertNumber');
  },

  // 🌐 Public
  guestSearchCertificates: function(searchName, templateId) {
    return api.call('guestSearchCertificates', { searchName: searchName, templateId: templateId });
  },
  getPublicTemplateList: function() {
    return api.call('getPublicTemplateList');
  },

  // 🔧 Diagnostic
  diagnoseCertSystem: function() {
    return api.call('diagnoseCertSystem');
  },
  getTemplateNameCount: function(templateId) {
    return api.call('getTemplateNameCount', { templateId: templateId });
  }
};
