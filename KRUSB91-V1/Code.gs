/**
 * =========================================================================
 * CODE.GS — Backend: ระบบสร้างเกียรติบัตรอัตโนมัติ (KRUSB85)
 * =========================================================================
 * Certificate Generation System
 * Architecture: Google Apps Script + Google Sheets + Google Drive + Canvas API
 *
 * Sections:
 * 1. CORE WEB APP (doGet, include)
 * 2. SETUP & CONFIGURATION (initialSetup)
 * 3. AUTHENTICATION (login, session, password, brute-force)
 * 4. DATA CRUD (รายชื่อ - pagination, search, filter, sort)
 * 5. TEMPLATE MANAGEMENT
 * 6. CERTIFICATE GENERATION & EXPORT
 * 7. DASHBOARD & STATS
 * 8. SETTINGS
 * 9. UTILITY FUNCTIONS
 * =========================================================================
 */

// =========================================================================
// 1. CORE WEB APP
// =========================================================================

/**
 * Web App Entry Point — แสดงหน้า index.html (สำหรับ GAS iframe mode เดิม)
 * + REST API GET endpoint (สำหรับ Netlify frontend)
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';

  // ═══ REST API GET (สำหรับเรียกจาก Netlify frontend) ═══
  if (action === 'guestSearch') {
    return jsonResponse(guestSearchCertificates(
      e.parameter.name || '',
      e.parameter.templateId || ''
    ));
  }
  if (action === 'publicTemplates') {
    return jsonResponse(getPublicTemplateList());
  }
  if (action === 'ping') {
    return jsonResponse({ status: true, message: 'Certificate API v1.0', timestamp: new Date().toISOString() });
  }

  // ═══ HTML Pages (สำหรับ GAS iframe mode เดิม) ═══
  var page = (e && e.parameter && e.parameter.page) || '';

  if (page === 'guest') {
    return HtmlService.createTemplateFromFile('guest')
      .evaluate()
      .setTitle('ค้นหาเกียรติบัตร')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('ระบบสร้างเกียรติบัตรอัตโนมัติ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * REST API Router (doPost) — สำหรับ Netlify Frontend
 * ═══════════════════════════════════════════════════════════════════════
 * รับ JSON body: { action: "functionName", token: "xxx", ...params }
 * คืน JSON response ผ่าน ContentService
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var token = body.token || '';

    // ─── Route Map: action → function ───
    var routes = {
      // 🔐 Authentication
      'loginUser':              function() { return loginUser(body.username, body.password); },
      'checkSession':           function() { return checkSession(token); },
      'logoutUser':             function() { return logoutUser(token); },
      'changePassword':         function() { return changePassword(token, body.oldPassword, body.newPassword); },

      // 📋 Data CRUD
      'getData':                function() { return getData(token, body.options); },
      'getAllRecords':           function() { return getAllRecords(token); },
      'addRecord':              function() { return addRecord(token, body.record); },
      'editRecord':             function() { return editRecord(token, body.rowIndex, body.record); },
      'deleteRecords':          function() { return deleteRecords(token, body.rowIndexes); },
      'importData':             function() { return importData(token, body.jsonData, body.mode); },

      // 🎨 Template Management
      'saveTemplateConfig':     function() { return saveTemplateConfig(token, body.config); },
      'loadTemplateConfig':     function() { return loadTemplateConfig(token, body.templateId); },
      'getTemplateList':        function() { return getTemplateList(token); },
      'getTemplateListWithCounts': function() { return getTemplateListWithCounts(token); },
      'switchTemplateContext':   function() { return switchTemplateContext(token, body.templateId); },
      'deleteTemplate':         function() { return deleteTemplate(token, body.templateId); },
      'renameTemplate':         function() { return renameTemplate(token, body.templateId, body.newName, body.newPrefix); },
      'duplicateTemplate':      function() { return duplicateTemplate(token, body.templateId, body.newName, body.newPrefix); },

      // 🖼️ Upload (via Base64)
      'uploadTemplateImage':    function() { return uploadTemplateImage(token, body.base64Data, body.filename); },
      'uploadElementImage':     function() { return uploadElementImage(token, body.base64Data, body.filename); },

      // 🖼️ Image & Drive
      'getImageBase64':         function() { return getImageBase64(token, body.fileId); },
      'getImagePublicUrl':      function() { return getImagePublicUrl(token, body.fileId); },
      'getUploadConfig':        function() { return getUploadConfig(token, body.templateName); },

      // 📤 Export & Status
      'saveCertificateImage':   function() { return saveCertificateImage(token, body.base64Data, body.filename, body.rowIndex, body.templateName); },
      'saveZipFile':            function() { return saveZipFile(token, body.base64Data, body.filename); },
      'batchUpdateCertStatus':  function() { return batchUpdateCertStatus(token, body.results); },
      'updateRecordStatuses':   function() { return updateRecordStatuses(token, body.updates); },
      'getExportHistory':       function() { return getExportHistory(token); },
      'clearExportHistory':     function() { return clearExportHistory(token); },

      // 📊 Dashboard & Settings
      'getStats':               function() { return getStats(token); },
      'getRecentActivity':      function() { return getRecentActivity(token); },
      'getSettings':            function() { return getSettings(token); },
      'updateSettings':         function() { return updateSettings(token, body.settingsObj); },
      'getNextCertNumber':      function() { return getNextCertNumber(token); },

      // 🌐 Public (ไม่ต้อง Token)
      'guestSearchCertificates': function() { return guestSearchCertificates(body.searchName, body.templateId); },
      'getPublicTemplateList':  function() { return getPublicTemplateList(); },

      // 🔧 Diagnostic
      'diagnoseCertSystem':     function() { return diagnoseCertSystem(token); },
      'getTemplateNameCount':   function() { return getTemplateNameCount(token, body.templateId); }
    };

    if (!routes[action]) {
      return jsonResponse({ status: false, message: 'Unknown action: ' + action });
    }

    var result = routes[action]();
    return jsonResponse(result);

  } catch (err) {
    return jsonResponse({ status: false, message: 'Server Error: ' + err.toString() });
  }
}

/**
 * JSON Response Helper — คืน JSON ผ่าน ContentService
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Template Include — รวมไฟล์ HTML/CSS/JS (ใช้กับ GAS iframe mode เดิม)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// =========================================================================
// 2. SETUP & CONFIGURATION
// =========================================================================

/**
 * 🚀 initialSetup() — ตั้งค่าระบบฐานข้อมูลทั้งหมด (กดครั้งเดียวจบ!)
 *
 * 📌 ใช้กับ Container-bound Script (สร้าง Apps Script จาก Spreadsheet)
 *
 * ⚙️ สิ่งที่ฟังก์ชันนี้ทำ:
 * 1. ใช้ Spreadsheet ปัจจุบัน + เก็บ ID ใน PropertiesService
 * 2. สร้าง 6 Sheets พร้อมหัวตาราง + Column Width + Validation + Protection
 * 3. สร้าง Admin Account เริ่มต้น (hash SHA-256)
 * 4. ตั้งค่า Settings เริ่มต้น
 * 5. สร้าง Drive Folder Structure อัตโนมัติ + เก็บ ID ใน PropertiesService
 */
function initialSetup() {
  var props = PropertiesService.getScriptProperties();

  // ── Guard: ตรวจสอบว่าเคย Setup แล้วหรือยัง ──
  var existingId = props.getProperty('SPREADSHEET_ID');
  if (existingId) {
    Logger.log('⚠️ ระบบเคย Setup แล้ว! Spreadsheet ID: ' + existingId);
    Logger.log('หากต้องการ Setup ใหม่ กรุณาลบ Script Properties ก่อน');
    return;
  }

  // ── Step 1: ใช้ Spreadsheet ปัจจุบัน (Container-bound) ──
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    Logger.log('❌ ไม่พบ Spreadsheet! กรุณารันจาก Script ที่ผูกกับ Spreadsheet');
    return;
  }
  var ssId = ss.getId();
  props.setProperty('SPREADSHEET_ID', ssId);
  Logger.log('✅ Step 1: Spreadsheet ID = ' + ssId);

  // ── Step 2: สร้าง / ตั้งค่า Sheets ทั้งหมด ──

  // -- 2A: Sheet "รายชื่อ" --
  var sheetData = ss.getSheetByName('รายชื่อ') || ss.insertSheet('รายชื่อ');
  sheetData.clearContents();
  var headersData = [
    'ชื่อ-นามสกุล','โรงเรียน/หน่วยงาน','เลขที่เกียรติบัตร',
    'วัน เดือน ปี','คนลงนาม','ตำแหน่ง',
    'ข้อมูลเพิ่มเติม 1','ข้อมูลเพิ่มเติม 2','ข้อมูลเพิ่มเติม 3',
    'ข้อมูลเพิ่มเติม 4','ข้อมูลเพิ่มเติม 5',
    'สถานะ','Drive File URL','วันที่สร้าง/อัปเดต',
    'template_id'
  ];
  sheetData.getRange(1, 1, 1, headersData.length).setValues([headersData]);
  sheetData.getRange(1, 1, 1, headersData.length)
    .setBackground('#1D4ED8').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheetData.setFrozenRows(1);
  [160,160,160,120,160,160,140,140,140,140,140,100,250,180,140]
    .forEach(function(w, i) { sheetData.setColumnWidth(i + 1, w); });
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['pending','generated','exported'], true)
    .setAllowInvalid(false).build();
  sheetData.getRange('L2:L1000').setDataValidation(statusRule);
  Logger.log('✅ Step 2A: Sheet "รายชื่อ" พร้อมแล้ว');

  // -- 2B: Sheet "Template_Config" --
  var sheetTpl = ss.getSheetByName('Template_Config') || ss.insertSheet('Template_Config');
  sheetTpl.clearContents();
  var headersTpl = [
    'template_id','template_name','drive_file_id',
    'field_positions_json','canvas_width','canvas_height',
    'created_at','updated_at','number_prefix'
  ];
  sheetTpl.getRange(1, 1, 1, headersTpl.length).setValues([headersTpl]);
  sheetTpl.getRange(1, 1, 1, headersTpl.length)
    .setBackground('#1D4ED8').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheetTpl.setFrozenRows(1);
  [120,200,250,400,120,120,180,180,120]
    .forEach(function(w, i) { sheetTpl.setColumnWidth(i + 1, w); });
  Logger.log('✅ Step 2B: Sheet "Template_Config" พร้อมแล้ว');

  // -- 2C: Sheet "Export_Log" --
  var sheetLog = ss.getSheetByName('Export_Log') || ss.insertSheet('Export_Log');
  sheetLog.clearContents();
  var headersLog = ['timestamp','username','action','record_count','status','note'];
  sheetLog.getRange(1, 1, 1, headersLog.length).setValues([headersLog]);
  sheetLog.getRange(1, 1, 1, headersLog.length)
    .setBackground('#1D4ED8').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheetLog.setFrozenRows(1);
  [180,140,160,120,100,300]
    .forEach(function(w, i) { sheetLog.setColumnWidth(i + 1, w); });
  Logger.log('✅ Step 2C: Sheet "Export_Log" พร้อมแล้ว');

  // -- 2D: Sheet "Settings" --
  var sheetSet = ss.getSheetByName('Settings') || ss.insertSheet('Settings');
  sheetSet.clearContents();
  var settingsData = [
    ['KEY',                  'VALUE',          'DESCRIPTION'],
    ['active_template_id',   '',               'ID ของ Template ที่ใช้งานอยู่'],
    ['default_font',         'TH Sarabun New', 'Font เริ่มต้นบน Canvas'],
    ['drive_root_folder_id', '',               'Root Folder ID (ระบบเกียรติบัตร)'],
    ['drive_template_folder','',               'Folder ID สำหรับ Template Images'],
    ['drive_generated_folder','',              'Folder ID สำหรับ PNG ที่สร้างแล้ว'],
    ['drive_zip_folder',     '',               'Folder ID สำหรับไฟล์ ZIP'],
    ['drive_temp_folder',    '',               'Folder ID สำหรับไฟล์ชั่วคราว'],
    ['auto_numbering',       'TRUE',           'สร้างเลขที่อัตโนมัติ'],
    ['number_prefix',        'กบ.',            'คำนำหน้าเลขที่เกียรติบัตร'],
    ['number_format',        '0000',           'รูปแบบตัวเลข (0000 = 0001,0002...)'],
    ['session_expire_hours', '8',              'Session หมดอายุกี่ชั่วโมง'],
    ['max_failed_attempts',  '5',              'ครั้งสูงสุดก่อนล็อคบัญชี'],
    ['lockout_minutes',      '15',             'ล็อคบัญชีกี่นาที'],
    ['app_name',             'ระบบสร้างเกียรติบัตร', 'ชื่อแอปที่แสดงบน UI'],
    ['version',              '1.0.0',          'เวอร์ชันระบบ'],
    ['setup_date',           new Date().toLocaleString('th-TH'), 'วันที่ติดตั้ง']
  ];
  sheetSet.getRange(1, 1, settingsData.length, 3).setValues(settingsData);
  sheetSet.getRange(1, 1, 1, 3)
    .setBackground('#1D4ED8').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheetSet.setFrozenRows(1);
  [200, 250, 300].forEach(function(w, i) { sheetSet.setColumnWidth(i + 1, w); });
  var protection = sheetSet.protect().setDescription('Settings Protection');
  protection.setWarningOnly(true);
  Logger.log('✅ Step 2D: Sheet "Settings" พร้อมแล้ว');

  // -- 2E: Sheet "Users" --
  var sheetUsers = ss.getSheetByName('Users') || ss.insertSheet('Users');
  sheetUsers.clearContents();
  var headersUsers = [
    'username','password_hash','role','display_name',
    'last_login','is_active','failed_attempts','lockout_until'
  ];
  sheetUsers.getRange(1, 1, 1, headersUsers.length).setValues([headersUsers]);
  sheetUsers.getRange(1, 1, 1, headersUsers.length)
    .setBackground('#1D4ED8').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheetUsers.setFrozenRows(1);
  var roleRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['admin','editor','viewer'], true)
    .setAllowInvalid(false).build();
  sheetUsers.getRange('C2:C100').setDataValidation(roleRule);
  var boolRule = SpreadsheetApp.newDataValidation()
    .requireCheckbox().build();
  sheetUsers.getRange('F2:F100').setDataValidation(boolRule);
  [140,300,100,180,180,100,140,180]
    .forEach(function(w, i) { sheetUsers.setColumnWidth(i + 1, w); });
  var userProtect = sheetUsers.protect().setDescription('Users Protection');
  userProtect.setWarningOnly(true);
  Logger.log('✅ Step 2E: Sheet "Users" พร้อมแล้ว');

  // -- 2F: Sheet "Login_Log" --
  var sheetLoginLog = ss.getSheetByName('Login_Log') || ss.insertSheet('Login_Log');
  sheetLoginLog.clearContents();
  var headersLoginLog = ['timestamp','username','action','status','note'];
  sheetLoginLog.getRange(1, 1, 1, headersLoginLog.length).setValues([headersLoginLog]);
  sheetLoginLog.getRange(1, 1, 1, headersLoginLog.length)
    .setBackground('#1D4ED8').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');
  sheetLoginLog.setFrozenRows(1);
  [180,140,120,100,300]
    .forEach(function(w, i) { sheetLoginLog.setColumnWidth(i + 1, w); });
  Logger.log('✅ Step 2F: Sheet "Login_Log" พร้อมแล้ว');

  // ── Step 3: สร้าง Admin Account เริ่มต้น ──
  var rawPassword = 'admin1234';
  var passBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, rawPassword, Utilities.Charset.UTF_8
  );
  var passHex = passBytes.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');

  sheetUsers.getRange(2, 1, 1, 8).setValues([[
    'admin', passHex, 'admin', 'ผู้ดูแลระบบ', '', true, 0, ''
  ]]);
  Logger.log('✅ Step 3: Admin Account สร้างแล้ว (admin / admin1234)');

  // ── Step 4: สร้าง Google Drive Folder Structure ──
  var rootFolder = DriveApp.createFolder('ระบบเกียรติบัตร');
  var tplFolder  = rootFolder.createFolder('Templates');
  var genFolder  = rootFolder.createFolder('Generated');
  var zipFolder  = rootFolder.createFolder('Exports_ZIP');
  var tmpFolder  = rootFolder.createFolder('Temp');

  var rootId = rootFolder.getId();
  var tplId  = tplFolder.getId();
  var genId  = genFolder.getId();
  var zipId  = zipFolder.getId();
  var tmpId  = tmpFolder.getId();

  props.setProperties({
    'DRIVE_ROOT_FOLDER_ID':      rootId,
    'DRIVE_TEMPLATE_FOLDER_ID':  tplId,
    'DRIVE_GENERATED_FOLDER_ID': genId,
    'DRIVE_ZIP_FOLDER_ID':       zipId,
    'DRIVE_TEMP_FOLDER_ID':      tmpId
  });

  // อัปเดต Folder IDs กลับลง Settings Sheet
  var settingsSheet = ss.getSheetByName('Settings');
  var settingsRange = settingsSheet.getRange('A2:A20').getValues();
  var folderMap = {
    'drive_root_folder_id':    rootId,
    'drive_template_folder':   tplId,
    'drive_generated_folder':  genId,
    'drive_zip_folder':        zipId,
    'drive_temp_folder':       tmpId
  };
  settingsRange.forEach(function(row, i) {
    if (folderMap[row[0]] !== undefined) {
      settingsSheet.getRange(i + 2, 2).setValue(folderMap[row[0]]);
    }
  });

  Logger.log('✅ Step 4: Drive Folders สร้างแล้ว');
  Logger.log('   📁 Root     : ' + rootFolder.getUrl());
  Logger.log('   📁 Templates: ' + tplFolder.getUrl());
  Logger.log('   📁 Generated: ' + genFolder.getUrl());
  Logger.log('   📁 ZIP      : ' + zipFolder.getUrl());
  Logger.log('   📁 Temp     : ' + tmpFolder.getUrl());

  // ── Step 5: จัด Sheet Order + ลบ Sheet1 เริ่มต้น (ถ้ามี) ──
  var defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('แผ่น1');
  if (defaultSheet) {
    try { ss.deleteSheet(defaultSheet); } catch(e) { /* ข้าม */ }
  }

  var sheetOrder = ['รายชื่อ','Users','Settings','Template_Config','Export_Log','Login_Log'];
  sheetOrder.forEach(function(name, i) {
    var s = ss.getSheetByName(name);
    if (s) { ss.setActiveSheet(s); ss.moveActiveSheet(i + 1); }
  });

  // ── Summary ──
  Logger.log('');
  Logger.log('══════════════════════════════════════════');
  Logger.log('🎉 initialSetup() เสร็จสมบูรณ์!');
  Logger.log('══════════════════════════════════════════');
  Logger.log('📋 Spreadsheet ID : ' + ssId);
  Logger.log('📁 Root Folder ID : ' + rootId);
  Logger.log('👤 Admin Login    : admin / admin1234');
  Logger.log('');
  Logger.log('📌 ขั้นตอนถัดไป:');
  Logger.log('   1. Extensions → Apps Script → Services');
  Logger.log('   2. เพิ่ม Drive API + Sheets API');
  Logger.log('   3. Deploy → New Deployment → Web App');
  Logger.log('   4. Execute as: Me | Who has access: Anyone');
  Logger.log('   5. เข้าใช้งานด้วย admin / admin1234');
  Logger.log('   ⚠️  เปลี่ยนรหัสผ่านทันทีหลังเข้าสู่ระบบ!');
  Logger.log('══════════════════════════════════════════');
}

// ── Helpers ──

function getSpreadsheetId() {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!ssId) throw new Error('ยังไม่ได้ Setup ระบบ! กรุณารัน initialSetup() ก่อน');
  return ssId;
}

function getSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  return SpreadsheetApp.openById(getSpreadsheetId());
}

function getDriveFolder(propKey) {
  var folderId = PropertiesService.getScriptProperties().getProperty(propKey);
  if (!folderId) {
    // Fallback: อ่านจาก Settings sheet
    var keyMap = {
      'DRIVE_ROOT_FOLDER_ID': 'drive_root_folder_id',
      'DRIVE_TEMPLATE_FOLDER_ID': 'drive_template_folder',
      'DRIVE_GENERATED_FOLDER_ID': 'drive_generated_folder',
      'DRIVE_ZIP_FOLDER_ID': 'drive_zip_folder',
      'DRIVE_TEMP_FOLDER_ID': 'drive_temp_folder'
    };
    folderId = getSettingValue(keyMap[propKey] || '');
  }
  if (!folderId) throw new Error('ไม่พบ Folder ID สำหรับ ' + propKey);
  return DriveApp.getFolderById(folderId);
}

// =========================================================================
// 3. AUTHENTICATION
// =========================================================================

/**
 * Login — ตรวจสอบ Username/Password → สร้าง Session Token
 * พร้อม Brute-force Protection
 */
function loginUser(username, password) {
  try {
    var cache = CacheService.getScriptCache();
    var allSettings = getAllSettingsMap();
    var maxAttempts = parseInt(allSettings['max_failed_attempts'] || '5', 10);
    var lockoutMin = parseInt(allSettings['lockout_minutes'] || '15', 10);

    // ── Brute-force Protection ──
    var failKey = 'login_fail_' + username;
    var failCount = parseInt(cache.get(failKey) || '0', 10);
    if (failCount >= maxAttempts) {
      logLoginActivity(username, 'login_blocked', 'blocked', 'ถูกล็อคเนื่องจากพยายามเข้าสู่ระบบผิดเกินกำหนด');
      return { status: false, message: 'บัญชีถูกระงับชั่วคราว กรุณาลองใหม่ใน ' + lockoutMin + ' นาที' };
    }

    var sheet = getSpreadsheet().getSheetByName('Users');
    var finder = sheet.getRange('A:A').createTextFinder(username)
      .matchEntireCell(true).matchCase(true);
    var cell = finder.findNext();

    if (!cell) {
      cache.put(failKey, String(failCount + 1), lockoutMin * 60);
      logLoginActivity(username, 'login_failed', 'failed', 'ไม่พบชื่อผู้ใช้');
      return { status: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    }

    var row = cell.getRow();
    var data = sheet.getRange(row, 1, 1, 8).getValues()[0];
    // [username, password_hash, role, display_name, last_login, is_active, failed_attempts, lockout_until]

    // ตรวจสอบสถานะ
    if (!data[5]) {
      return { status: false, message: 'บัญชีนี้ถูกระงับการใช้งาน' };
    }

    // ตรวจสอบ Password
    var hashedInput = hashPassword(password);
    if (hashedInput !== data[1]) {
      var newFail = failCount + 1;
      cache.put(failKey, String(newFail), lockoutMin * 60);
      sheet.getRange(row, 7).setValue(newFail);
      logLoginActivity(username, 'login_failed', 'failed', 'รหัสผ่านไม่ถูกต้อง (ครั้งที่ ' + newFail + ')');
      return { status: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
    }

    // ✅ Login สำเร็จ
    cache.remove(failKey);
    var expireHours = parseInt(allSettings['session_expire_hours'] || '8', 10);
    var token = generateUUID();
    var sessionData = {
      username: data[0],
      role: data[2],
      displayName: data[3]
    };

    cache.put('session_' + token, JSON.stringify(sessionData), expireHours * 3600);

    // อัปเดต last_login + reset failed_attempts
    sheet.getRange(row, 5).setValue(new Date().toLocaleString('th-TH'));
    sheet.getRange(row, 7).setValue(0);
    sheet.getRange(row, 8).setValue('');

    logLoginActivity(username, 'login_success', 'success', '');

    return {
      status: true,
      token: token,
      role: sessionData.role,
      userData: sessionData
    };
  } catch (e) {
    console.error('Login Error:', e);
    return { status: false, message: 'เกิดข้อผิดพลาด: ' + e.toString() };
  }
}

/**
 * Validate Session Token
 */
function validateSession(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var cached = cache.get('session_' + token);
  if (!cached) return null;

  var expireHours = parseInt(getSettingValue('session_expire_hours') || '8', 10);
  cache.put('session_' + token, cached, expireHours * 3600);
  return JSON.parse(cached);
}

/**
 * Logout
 */
function logoutUser(token) {
  if (token) {
    var session = validateSession(token);
    if (session) {
      logLoginActivity(session.username, 'logout', 'success', '');
    }
    CacheService.getScriptCache().remove('session_' + token);
  }
  return { status: true };
}

/**
 * เปลี่ยนรหัสผ่าน
 */
function changePassword(token, oldPassword, newPassword) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  if (!newPassword || newPassword.length < 4) {
    return { status: false, message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var sheet = getSpreadsheet().getSheetByName('Users');
    var finder = sheet.getRange('A:A').createTextFinder(session.username)
      .matchEntireCell(true).matchCase(true);
    var cell = finder.findNext();
    if (!cell) return { status: false, message: 'ไม่พบบัญชีผู้ใช้' };

    var row = cell.getRow();
    var currentHash = sheet.getRange(row, 2).getValue();

    if (hashPassword(oldPassword) !== currentHash) {
      return { status: false, message: 'รหัสผ่านเก่าไม่ถูกต้อง' };
    }

    sheet.getRange(row, 2).setValue(hashPassword(newPassword));
    SpreadsheetApp.flush();

    CacheService.getScriptCache().remove('session_' + token);
    logLoginActivity(session.username, 'change_password', 'success', '');

    return { status: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่' };
  } catch (e) {
    return { status: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ตรวจสอบ Session (เรียกจาก client)
 */
function checkSession(token) {
  var session = validateSession(token);
  if (!session) return { status: false };
  return { status: true, userData: session };
}

// =========================================================================
// 4. DATA CRUD (รายชื่อ)
// =========================================================================

/**
 * ดึงข้อมูลรายชื่อ — พร้อม pagination, search, filter, sort
 */
function getData(token, options) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  try {
    options = options || {};
    var page = parseInt(options.page || 1, 10);
    var perPage = parseInt(options.perPage || 50, 10);
    var search = (options.search || '').toLowerCase().trim();
    var filterStatus = options.filterStatus || '';
    var filterSchool = options.filterSchool || '';
    var sortBy = parseInt(options.sortBy || 0, 10);
    var sortDir = options.sortDir || 'asc';

    var sheet = getSpreadsheet().getSheetByName('รายชื่อ');
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { status: true, data: [], total: 0, page: 1, totalPages: 0, schools: [] };
    }

    var allData = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
    var activeTemplateId = String(getSettingValue('active_template_id') || '');

    // เก็บ unique schools สำหรับ filter dropdown
    var schoolSet = {};

    // Map to objects พร้อม rowIndex (สำหรับ edit/delete)
    var records = [];
    allData.forEach(function(row, idx) {
      var tplId = String(row[14] || '');
      // กรองตาม template_id
      if (activeTemplateId && tplId !== activeTemplateId) return;
      if (row[1]) schoolSet[String(row[1])] = true;
      records.push({
        rowIndex: idx + 2,
        name: String(row[0] || ''),
        school: String(row[1] || ''),
        certNumber: String(row[2] || ''),
        date: String(row[3] || ''),
        signer: String(row[4] || ''),
        position: String(row[5] || ''),
        extra1: String(row[6] || ''),
        extra2: String(row[7] || ''),
        extra3: String(row[8] || ''),
        extra4: String(row[9] || ''),
        extra5: String(row[10] || ''),
        status: String(row[11] || 'pending'),
        driveUrl: String(row[12] || ''),
        timestamp: String(row[13] || ''),
        templateId: tplId
      });
    });

    // Filter
    if (search) {
      records = records.filter(function(r) {
        return r.name.toLowerCase().indexOf(search) !== -1 ||
               r.school.toLowerCase().indexOf(search) !== -1 ||
               r.certNumber.toLowerCase().indexOf(search) !== -1 ||
               r.signer.toLowerCase().indexOf(search) !== -1 ||
               r.position.toLowerCase().indexOf(search) !== -1;
      });
    }
    if (filterStatus) {
      records = records.filter(function(r) { return r.status === filterStatus; });
    }
    if (filterSchool) {
      records = records.filter(function(r) { return r.school === filterSchool; });
    }

    // Sort
    var sortKeys = ['name','school','certNumber','date','signer','position','status'];
    var sortKey = sortKeys[sortBy] || 'name';
    records.sort(function(a, b) {
      var va = String(a[sortKey]).toLowerCase();
      var vb = String(b[sortKey]).toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    var total = records.length;
    var totalPages = Math.ceil(total / perPage) || 1;
    page = Math.min(page, totalPages);

    // Paginate
    var start = (page - 1) * perPage;
    var pageData = records.slice(start, start + perPage);

    return {
      status: true,
      data: pageData,
      total: total,
      page: page,
      totalPages: totalPages,
      schools: Object.keys(schoolSet).sort()
    };
  } catch (e) {
    console.error('getData Error:', e);
    return { status: false, message: e.toString() };
  }
}

/**
 * ดึงข้อมูลทั้งหมด (สำหรับ Canvas Preview / Export)
 */
function getAllRecords(token) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  try {
    var sheet = getSpreadsheet().getSheetByName('รายชื่อ');
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { status: true, data: [] };

    var allData = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
    var activeTemplateId = String(getSettingValue('active_template_id') || '');

    var records = [];
    allData.forEach(function(row, idx) {
      var tplId = String(row[14] || '');
      if (activeTemplateId && tplId !== activeTemplateId) return;
      records.push({
        rowIndex: idx + 2,
        name: String(row[0] || ''),
        school: String(row[1] || ''),
        certNumber: String(row[2] || ''),
        date: String(row[3] || ''),
        signer: String(row[4] || ''),
        position: String(row[5] || ''),
        extra1: String(row[6] || ''),
        extra2: String(row[7] || ''),
        extra3: String(row[8] || ''),
        extra4: String(row[9] || ''),
        extra5: String(row[10] || ''),
        status: String(row[11] || 'pending'),
        driveUrl: String(row[12] || ''),
        timestamp: String(row[13] || ''),
        templateId: tplId
      });
    });

    return { status: true, data: records };
  } catch (e) {
    return { status: false, message: e.toString() };
  }
}

/**
 * เพิ่มรายชื่อ (Manual Add)
 */
function addRecord(token, record) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var sheet = getSpreadsheet().getSheetByName('รายชื่อ');
    var now = new Date().toLocaleString('th-TH');

    // Auto-generate cert number if enabled
    var certNumber = record.certNumber || '';
    if (!certNumber && getSettingValue('auto_numbering') === 'TRUE') {
      certNumber = generateNextCertNumber();
    }

    var activeTemplateId = String(getSettingValue('active_template_id') || '');

    sheet.appendRow([
      record.name || '',
      record.school || '',
      certNumber,
      record.date || '',
      record.signer || '',
      record.position || '',
      record.extra1 || '',
      record.extra2 || '',
      record.extra3 || '',
      record.extra4 || '',
      record.extra5 || '',
      'pending',
      '',
      now,
      activeTemplateId
    ]);

    SpreadsheetApp.flush();
    logActivity(session.username, 'เพิ่มรายชื่อ', 1, 'success', record.name);

    return { status: true, message: 'เพิ่มรายชื่อสำเร็จ', certNumber: certNumber };
  } catch (e) {
    return { status: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * แก้ไขรายชื่อ (Inline Edit / Modal Edit)
 */
function editRecord(token, rowIndex, record) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var sheet = getSpreadsheet().getSheetByName('รายชื่อ');
    var now = new Date().toLocaleString('th-TH');

    sheet.getRange(rowIndex, 1, 1, 11).setValues([[
      record.name || '',
      record.school || '',
      record.certNumber || '',
      record.date || '',
      record.signer || '',
      record.position || '',
      record.extra1 || '',
      record.extra2 || '',
      record.extra3 || '',
      record.extra4 || '',
      record.extra5 || ''
    ]]);
    sheet.getRange(rowIndex, 14).setValue(now);

    SpreadsheetApp.flush();
    return { status: true, message: 'แก้ไขข้อมูลสำเร็จ' };
  } catch (e) {
    return { status: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ลบรายชื่อ (Single / Bulk)
 */
function deleteRecords(token, rowIndexes) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };
  if (session.role !== 'admin' && session.role !== 'editor') {
    return { status: false, message: 'ไม่มีสิทธิ์ลบข้อมูล' };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('รายชื่อ');

    // Sort descending เพื่อลบจากล่างขึ้นบน (ไม่ให้ row เลื่อน)
    var sorted = rowIndexes.slice().sort(function(a, b) { return b - a; });

    // ลบไฟล์ใน Drive ก่อน
    sorted.forEach(function(ri) {
      try {
        var driveUrl = sheet.getRange(ri, 13).getValue();
        if (driveUrl) {
          var fileId = extractFileIdFromUrl(driveUrl);
          if (fileId) DriveApp.getFileById(fileId).setTrashed(true);
        }
      } catch (de) { /* ข้าม */ }
    });

    // ลบแถว
    sorted.forEach(function(ri) {
      sheet.deleteRow(ri);
    });

    SpreadsheetApp.flush();
    logActivity(session.username, 'ลบรายชื่อ', sorted.length, 'success', '');

    return { status: true, message: 'ลบข้อมูล ' + sorted.length + ' รายการสำเร็จ' };
  } catch (e) {
    return { status: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * นำเข้าข้อมูล (Import)
 */
function importData(token, jsonData, mode) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var sheet = getSpreadsheet().getSheetByName('รายชื่อ');
    var now = new Date().toLocaleString('th-TH');
    var data = JSON.parse(jsonData);

    if (!data || !data.length) {
      return { status: false, message: 'ไม่พบข้อมูลสำหรับนำเข้า' };
    }

    // Validate
    var errors = [];
    var validRows = [];
    var existingCerts = {};

    // ดึงเลขที่เกียรติบัตรที่มีอยู่แล้ว (เฉพาะ Template ปัจจุบัน)
    if (mode !== 'replace') {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var existing = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
        existing.forEach(function(r) {
          // ✅ กรองเฉพาะ template_id ปัจจุบัน
          if (r[2] && String(r[14] || '') === activeTemplateId) {
            existingCerts[String(r[2])] = true;
          }
        });
      }
    }

    data.forEach(function(row, idx) {
      if (!row.name || !row.name.trim()) {
        errors.push({ row: idx + 1, message: 'ไม่มีชื่อ-นามสกุล' });
        return;
      }
      if (row.certNumber && existingCerts[String(row.certNumber)]) {
        errors.push({ row: idx + 1, message: 'เลขที่เกียรติบัตร "' + row.certNumber + '" ซ้ำ' });
        return;
      }
      if (row.certNumber) existingCerts[String(row.certNumber)] = true;
      validRows.push(row);
    });

    // Mode: replace → ลบข้อมูลเฉพาะ template นี้
    var activeTemplateId = String(getSettingValue('active_template_id') || '');
    if (mode === 'replace' && activeTemplateId) {
      var lr = sheet.getLastRow();
      if (lr > 1) {
        var allRows = sheet.getRange(2, 15, lr - 1, 1).getValues();
        var rowsToDelete = [];
        allRows.forEach(function(r, idx) {
          if (String(r[0] || '') === activeTemplateId) rowsToDelete.push(idx + 2);
        });
        rowsToDelete.sort(function(a, b) { return b - a; }).forEach(function(ri) {
          sheet.deleteRow(ri);
        });
      }
    } else if (mode === 'replace') {
      var lr = sheet.getLastRow();
      if (lr > 1) {
        sheet.getRange(2, 1, lr - 1, 15).clearContent();
      }
    }

    // เขียนข้อมูล (Batch)
    if (validRows.length > 0) {
      var autoNum = getSettingValue('auto_numbering') === 'TRUE';
      // ใช้ prefix จาก Template_Config ก่อน, fallback ไป Settings
      var prefix = getTemplatePrefixById(activeTemplateId) || getSettingValue('number_prefix') || '';
      var format = getSettingValue('number_format') || '0000';

      var nextNum = 1;
      if (autoNum) {
        nextNum = getMaxCertNumber() + 1;
      }

      var rowsToWrite = validRows.map(function(row) {
        var certNum = row.certNumber || '';
        if (!certNum && autoNum) {
          certNum = prefix + padNumber(nextNum, format.length);
          nextNum++;
        }
        return [
          row.name || '', row.school || '', certNum,
          row.date || '', row.signer || '', row.position || '',
          row.extra1 || '', row.extra2 || '', row.extra3 || '',
          row.extra4 || '', row.extra5 || '',
          'pending', '', now,
          activeTemplateId
        ];
      });

      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rowsToWrite.length, 15).setValues(rowsToWrite);
    }

    SpreadsheetApp.flush();
    logActivity(session.username, 'นำเข้าข้อมูล (' + mode + ')', validRows.length, 'success',
      'สำเร็จ ' + validRows.length + ' / ข้อผิดพลาด ' + errors.length);

    return {
      status: true,
      inserted: validRows.length,
      errors: errors,
      message: 'นำเข้าสำเร็จ ' + validRows.length + ' รายการ' +
        (errors.length ? ' (ข้อผิดพลาด ' + errors.length + ' รายการ)' : '')
    };
  } catch (e) {
    return { status: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ดึงเลขที่เกียรติบัตรถัดไป
 */
function getNextCertNumber(token) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  var prefix = getSettingValue('number_prefix') || '';
  var format = getSettingValue('number_format') || '0000';
  var nextNum = getMaxCertNumber() + 1;

  return {
    status: true,
    certNumber: prefix + padNumber(nextNum, format.length)
  };
}

// =========================================================================
// 5. TEMPLATE MANAGEMENT
// =========================================================================

/**
 * บันทึก Template Config
 */
function saveTemplateConfig(token, config) {
  var lock = LockService.getScriptLock();
  try {
    var session = validateSession(token);
    if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

    lock.waitLock(15000);
    var sheet = getSpreadsheet().getSheetByName('Template_Config');
    if (!sheet) return { status: false, message: 'ไม่พบ Sheet "Template_Config"' };
    var now = new Date().toLocaleString('th-TH');
    var templateId = config.template_id || generateUUID();

    // ✅ อัปเดต template_id ใน config ให้ตรงกับ key จริง
    config.template_id = templateId;

    // Sanitize elements: ลบ imgDataUrl ที่ใหญ่เกิน (ใช้ imgFileId แทน)
    var cleanElements = (config.elements || []).map(function(el) {
      var copy = {};
      for (var k in el) {
        if (k === '_imgObj') continue;
        if (k === 'imgDataUrl' && el.imgFileId) continue;
        copy[k] = el[k];
      }
      return copy;
    });

    // ค้นหา template เดิม
    var finder = sheet.getRange('A:A').createTextFinder(templateId)
      .matchEntireCell(true).matchCase(true);
    var cell = finder.findNext();

    var elementsJson = JSON.stringify(cleanElements);
    var rowData = [
      templateId,
      config.template_name || 'Template ไม่มีชื่อ',
      config.drive_file_id || '',
      elementsJson,
      config.canvas_width || 3508,
      config.canvas_height || 2480,
      cell ? sheet.getRange(cell.getRow(), 7).getValue() : now,
      now,
      config.number_prefix || ''
    ];

    if (cell) {
      sheet.getRange(cell.getRow(), 1, 1, 9).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }

    // อัปเดต active template
    updateSettingValue('active_template_id', templateId);

    SpreadsheetApp.flush();

    // ✅ Cache แยก try-catch (ไม่ให้กระทบ function หลัก)
    try {
      var cacheConfig = {
        template_id: templateId,
        template_name: config.template_name,
        drive_file_id: config.drive_file_id || '',
        elements: cleanElements,
        canvas_width: config.canvas_width || 3508,
        canvas_height: config.canvas_height || 2480
      };
      var cacheStr = JSON.stringify(cacheConfig);
      if (cacheStr.length < 90000) {
        CacheService.getScriptCache().put('template_' + templateId, cacheStr, 3600);
      }
    } catch(cacheErr) {
      // Cache ล้มเหลว (เช่น ขนาดเกิน) — ไม่กระทบการ save
      console.log('Template cache skipped: ' + cacheErr);
    }

    logActivity(session.username, 'บันทึก Template', 1, 'success', config.template_name);

    return { status: true, template_id: templateId, message: 'บันทึก Template สำเร็จ' };
  } catch (e) {
    return { status: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * โหลด Template Config
 */
function loadTemplateConfig(token, templateId) {
  try {
    var session = validateSession(token);
    if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

    // ✅ ลองจาก Cache ก่อน (พร้อม safety)
    try {
      var cache = CacheService.getScriptCache();
      var cached = cache.get('template_' + templateId);
      if (cached) {
        var cachedConfig = JSON.parse(cached);
        // ตรวจสอบว่า cache มีข้อมูลครบ
        if (cachedConfig && cachedConfig.template_id && cachedConfig.elements) {
          return { status: true, config: cachedConfig };
        }
      }
    } catch(cacheErr) {
      // Cache เสียหาย — ข้ามไปอ่านจาก Sheet
      console.log('Cache read failed, reading from Sheet: ' + cacheErr);
    }

    // ✅ อ่านจาก Sheet (แหล่งข้อมูลหลัก)
    var sheet = getSpreadsheet().getSheetByName('Template_Config');
    if (!sheet) return { status: false, message: 'ไม่พบ Sheet "Template_Config"' };
    var finder = sheet.getRange('A:A').createTextFinder(templateId)
      .matchEntireCell(true).matchCase(true);
    var cell = finder.findNext();

    if (!cell) return { status: false, message: 'ไม่พบ Template ID: ' + templateId };

    var row = cell.getRow();
    var data = sheet.getRange(row, 1, 1, 9).getValues()[0];

    // ✅ Parse elements พร้อม safety
    var elements = [];
    try {
      elements = JSON.parse(data[3] || '[]');
    } catch(parseErr) {
      console.error('JSON parse error for template elements: ' + parseErr);
      elements = [];
    }

    var config = {
      template_id: String(data[0] || ''),
      template_name: String(data[1] || ''),
      drive_file_id: String(data[2] || ''),
      elements: elements,
      canvas_width: Number(data[4]) || 3508,
      canvas_height: Number(data[5]) || 2480,
      created_at: String(data[6] || ''),
      updated_at: String(data[7] || ''),
      number_prefix: String(data[8] || '')
    };

    // ✅ Cache พร้อม safety (ไม่ throw)
    try {
      var cacheStr = JSON.stringify(config);
      if (cacheStr.length < 90000) {
        CacheService.getScriptCache().put('template_' + templateId, cacheStr, 3600);
      }
    } catch(cacheWriteErr) {
      console.log('Cache write skipped: ' + cacheWriteErr);
    }

    return { status: true, config: config };
  } catch (e) {
    return { status: false, message: 'loadTemplateConfig Error: ' + e.toString() };
  }
}

/**
 * รายการ Templates ทั้งหมด
 */
function getTemplateList(token) {
  try {
    var session = validateSession(token);
    if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

    var sheet = getSpreadsheet().getSheetByName('Template_Config');
    if (!sheet) {
      return { status: false, message: 'ไม่พบ Sheet "Template_Config" — กรุณารัน initialSetup() ก่อน' };
    }
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { status: true, templates: [] };

    var data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    var activeId = String(getSettingValue('active_template_id') || '');

    var templates = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      templates.push({
        template_id: String(row[0] || ''),
        template_name: String(row[1] || ''),
        drive_file_id: String(row[2] || ''),
        canvas_width: Number(row[4]) || 3508,
        canvas_height: Number(row[5]) || 2480,
        created_at: String(row[6] || ''),
        updated_at: String(row[7] || ''),
        number_prefix: String(row[8] || ''),
        isActive: String(row[0] || '') === activeId
      });
    }

    return { status: true, templates: templates, activeId: activeId };
  } catch (e) {
    return { status: false, message: 'getTemplateList Error: ' + e.toString() };
  }
}

/**
 * นับจำนวนรายชื่อที่ผูกกับ Template (สำหรับ confirm ก่อนลบ)
 */
function getTemplateNameCount(token, templateId) {
  try {
    var session = validateSession(token);
    if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

    var sheet = getSpreadsheet().getSheetByName('รายชื่อ');
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { status: true, count: 0 };

    var tplIds = sheet.getRange(2, 15, lastRow - 1, 1).getValues();
    var count = 0;
    tplIds.forEach(function(r) {
      if (String(r[0] || '') === templateId) count++;
    });

    return { status: true, count: count };
  } catch (e) {
    return { status: false, count: 0, message: e.toString() };
  }
}

/**
 * ลบ Template
 */
function deleteTemplate(token, templateId) {
  var lock = LockService.getScriptLock();
  try {
    var session = validateSession(token);
    if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

    lock.waitLock(15000);
    var sheet = getSpreadsheet().getSheetByName('Template_Config');
    var finder = sheet.getRange('A:A').createTextFinder(templateId)
      .matchEntireCell(true).matchCase(true);
    var cell = finder.findNext();
    if (!cell) return { status: false, message: 'ไม่พบ Template' };

    // ลบ background image จาก Drive
    var driveFileId = sheet.getRange(cell.getRow(), 3).getValue();
    if (driveFileId) {
      try { DriveApp.getFileById(driveFileId).setTrashed(true); } catch(e) {}
    }

    sheet.deleteRow(cell.getRow());
    CacheService.getScriptCache().remove('template_' + templateId);

    // ลบรายชื่อที่ผูกกับ Template นี้
    var nameSheet = getSpreadsheet().getSheetByName('รายชื่อ');
    if (nameSheet) {
      var nameLR = nameSheet.getLastRow();
      if (nameLR > 1) {
        var tplIds = nameSheet.getRange(2, 15, nameLR - 1, 1).getValues();
        var rowsToDelete = [];
        tplIds.forEach(function(r, idx) {
          if (String(r[0] || '') === templateId) rowsToDelete.push(idx + 2);
        });
        rowsToDelete.sort(function(a, b) { return b - a; }).forEach(function(ri) {
          nameSheet.deleteRow(ri);
        });
      }
    }

    SpreadsheetApp.flush();

    return { status: true, message: 'ลบ Template สำเร็จ' };
  } catch (e) {
    return { status: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * เปลี่ยนชื่อ Template
 */
function renameTemplate(token, templateId, newName, newPrefix) {
  var lock = LockService.getScriptLock();
  try {
    var session = validateSession(token);
    if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };
    if (!newName || !newName.trim()) return { status: false, message: 'กรุณากรอกชื่อ Template' };

    lock.waitLock(15000);
    var sheet = getSpreadsheet().getSheetByName('Template_Config');
    var finder = sheet.getRange('A:A').createTextFinder(templateId)
      .matchEntireCell(true).matchCase(true);
    var cell = finder.findNext();
    if (!cell) return { status: false, message: 'ไม่พบ Template' };

    var row = cell.getRow();
    sheet.getRange(row, 2).setValue(newName.trim());
    // ✅ บันทึก prefix ด้วย (column 9)
    if (newPrefix !== undefined) {
      sheet.getRange(row, 9).setValue((newPrefix || '').trim());
    }
    sheet.getRange(row, 8).setValue(new Date().toLocaleString('th-TH'));
    SpreadsheetApp.flush();

    // ล้าง cache
    CacheService.getScriptCache().remove('template_' + templateId);

    logActivity(session.username, 'เปลี่ยนชื่อ Template', 1, 'success', newName.trim());

    return { status: true, message: 'เปลี่ยนชื่อสำเร็จ', newName: newName.trim(), newPrefix: (newPrefix || '').trim() };
  } catch (e) {
    return { status: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * นับจำนวนรายชื่อที่ผูกกับ Template
 */
function getRecordCountByTemplate(token, templateId) {
  try {
    var session = validateSession(token);
    if (!session) return { status: false, count: 0 };

    var sheet = getSpreadsheet().getSheetByName('รายชื่อ');
    if (!sheet) return { status: true, count: 0 };
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { status: true, count: 0 };

    var tplIds = sheet.getRange(2, 15, lastRow - 1, 1).getValues();
    var count = 0;
    tplIds.forEach(function(r) {
      if (String(r[0] || '') === templateId) count++;
    });

    return { status: true, count: count };
  } catch (e) {
    return { status: false, count: 0, message: e.toString() };
  }
}

/**
 * คัดลอก Template
 */
function duplicateTemplate(token, templateId, newName, newPrefix) {
  try {
    var session = validateSession(token);
    if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

    var result = loadTemplateConfig(token, templateId);
    if (!result.status) return result;

    var config = result.config;
    config.template_id = generateUUID();
    config.template_name = newName || (config.template_name + ' (สำเนา)');
    // ✅ ใช้ prefix ใหม่ถ้ามี (รวมกรณีเปลี่ยนเป็นค่าว่าง)
    if (newPrefix !== undefined && newPrefix !== null) {
      config.number_prefix = newPrefix;
    }

    return saveTemplateConfig(token, config);
  } catch (e) {
    return { status: false, message: e.toString() };
  }
}

/**
 * อัปโหลดรูปพื้นหลัง Template
 */
function uploadTemplateImage(token, base64Data, filename) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  try {
    var folder = getDriveFolder('DRIVE_TEMPLATE_FOLDER_ID');
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, 'image/png', filename);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      status: true,
      file_id: file.getId(),
      url: 'https://drive.google.com/uc?id=' + file.getId(),
      message: 'อัปโหลดสำเร็จ'
    };
  } catch (e) {
    return { status: false, message: e.toString() };
  }
}

/**
 * อัปโหลดรูป Element (ลายเซ็น, ตราสัญลักษณ์)
 */
function uploadElementImage(token, base64Data, filename) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  try {
    var folder = getDriveFolder('DRIVE_TEMPLATE_FOLDER_ID');
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, 'image/png', filename);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      status: true,
      file_id: file.getId(),
      url: 'https://drive.google.com/uc?id=' + file.getId(),
      message: 'อัปโหลดสำเร็จ'
    };
  } catch (e) {
    return { status: false, message: e.toString() };
  }
}

/**
 * ดึงรูปภาพจาก Drive เป็น Base64
 */
function getImageBase64(token, fileId) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  try {
    var cache = CacheService.getScriptCache();
    var cacheKey = 'img_' + fileId;
    var cached = cache.get(cacheKey);
    if (cached) return { status: true, base64: cached };

    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var b64 = Utilities.base64Encode(blob.getBytes());
    var mimeType = blob.getContentType();
    var dataUrl = 'data:' + mimeType + ';base64,' + b64;

    // Cache (ถ้าไม่เกิน 100KB)
    if (dataUrl.length < 90000) {
      cache.put(cacheKey, dataUrl, 3600);
    }

    return { status: true, base64: dataUrl };
  } catch (e) {
    return { status: false, message: e.toString() };
  }
}

/**
 * ดึง Public URL สำหรับรูปภาพจาก Drive (ไม่ต้องแปลง base64)
 */
function getImagePublicUrl(token, fileId) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  try {
    var file = DriveApp.getFileById(fileId);
    // ตั้ง sharing ให้ anyone สามารถ view ได้
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var url = 'https://lh3.googleusercontent.com/d/' + fileId;
    return { status: true, url: url, fileId: fileId };
  } catch (e) {
    return { status: false, message: e.toString() };
  }
}

// =========================================================================
// 6. CERTIFICATE GENERATION & EXPORT
// =========================================================================

/**
 * บันทึกเกียรติบัตร PNG ลง Google Drive
 */
function saveCertificateImage(token, base64Data, filename, rowIndex, templateName) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  try {
    var genFolder = getDriveFolder('DRIVE_GENERATED_FOLDER_ID');

    // ✅ สร้าง subfolder ตามชื่อ Template (แทนวันที่)
    var folderName = (templateName || 'ไม่ระบุ Template')
      .replace(/[\/\\:*?"<>|]/g, '_').trim();
    var targetFolder;
    var folders = genFolder.getFoldersByName(folderName);
    if (folders.hasNext()) {
      targetFolder = folders.next();
    } else {
      targetFolder = genFolder.createFolder(folderName);
    }

    // สร้างไฟล์ PNG
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, 'image/png', filename + '.png');
    var file = targetFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileUrl = file.getUrl();

    // อัปเดต Sheets: status + Drive URL + timestamp
    if (rowIndex) {
      var sheet = getSpreadsheet().getSheetByName('รายชื่อ');

      // ✅ ลบไฟล์เกียรติบัตรเดิมออกจาก Drive (ย้ายไปถังขยะ)
      var oldUrl = String(sheet.getRange(rowIndex, 13).getValue() || '');
      if (oldUrl) {
        var match = oldUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          try { DriveApp.getFileById(match[1]).setTrashed(true); } catch(e) { /* ไฟล์อาจถูกลบไปแล้ว */ }
        }
      }

      sheet.getRange(rowIndex, 12).setValue('generated');
      sheet.getRange(rowIndex, 13).setValue(fileUrl);
      sheet.getRange(rowIndex, 14).setValue(new Date().toLocaleString('th-TH'));
    }

    return {
      status: true,
      file_id: file.getId(),
      url: fileUrl,
      message: 'บันทึกเกียรติบัตรสำเร็จ'
    };
  } catch (e) {
    return { status: false, message: e.toString() };
  }
}

/**
 * บันทึก ZIP ลง Google Drive
 */
function saveZipFile(token, base64Data, filename) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  try {
    var zipFolder = getDriveFolder('DRIVE_ZIP_FOLDER_ID');
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, 'application/zip', filename + '.zip');
    var file = zipFolder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    logActivity(session.username, 'Export ZIP', 0, 'success', filename);

    return {
      status: true,
      file_id: file.getId(),
      url: file.getUrl(),
      download_url: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
      message: 'สร้าง ZIP สำเร็จ'
    };
  } catch (e) {
    return { status: false, message: e.toString() };
  }
}

/**
 * 🚀 Direct Drive API: ส่ง OAuth Token + Folder ID ให้ Client upload ตรง
 */
function getUploadConfig(token, templateName) {
  try {
    var session = validateSession(token);
    if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

    var genFolder = getDriveFolder('DRIVE_GENERATED_FOLDER_ID');

    // ✅ สร้าง subfolder ตามชื่อ Template (แทนวันที่)
    var folderName = (templateName || 'ไม่ระบุ Template')
      .replace(/[\/\\:*?"<>|]/g, '_').trim();
    var targetFolder;
    var folders = genFolder.getFoldersByName(folderName);

    if (folders.hasNext()) {
      targetFolder = folders.next();
    } else {
      targetFolder = genFolder.createFolder(folderName);
      // ตั้ง sharing ที่ folder level (ครั้งเดียว! ไม่ต้อง set ทีละไฟล์)
      targetFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }

    return {
      status: true,
      accessToken: ScriptApp.getOAuthToken(),
      folderId: String(targetFolder.getId()),
      folderUrl: String(targetFolder.getUrl()),
      folderName: folderName,
      tokenExpiry: Date.now() + 3500000  // ~58 นาที
    };
  } catch (e) {
    return { status: false, message: 'getUploadConfig Error: ' + e.toString() };
  }
}

/**
 * 🚀 Batch อัปเดต Sheet หลัง Client upload ตรงไป Drive เสร็จ
 */
function batchUpdateCertStatus(token, results) {
  try {
    var session = validateSession(token);
    if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      var sheet = getSpreadsheet().getSheetByName('รายชื่อ');
      var lastRow = sheet.getLastRow();
      var now = new Date().toLocaleString('th-TH');

      if (lastRow > 1 && results && results.length > 0) {
        var range = sheet.getRange(2, 1, lastRow - 1, 15);
        var values = range.getValues();

        results.forEach(function(r) {
          if (r.rowIndex && r.rowIndex >= 2 && r.rowIndex <= lastRow) {
            var idx = r.rowIndex - 2;

            // ✅ ลบไฟล์เกียรติบัตรเดิมออกจาก Drive (ย้ายไปถังขยะ)
            var oldUrl = String(values[idx][12] || '');
            if (oldUrl) {
              var match = oldUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
              if (match && match[1]) {
                try { DriveApp.getFileById(match[1]).setTrashed(true); } catch(e) { /* ไฟล์อาจถูกลบไปแล้ว */ }
              }
            }

            values[idx][11] = 'generated';
            values[idx][12] = r.fileId
              ? 'https://drive.google.com/file/d/' + r.fileId + '/view'
              : '';
            values[idx][13] = now;
          }
        });

        range.setValues(values);
      }

      SpreadsheetApp.flush();

      // Log activity
      var templateName = String(getSettingValue('active_template_name') || 'Template');
      logActivity(session.username, 'บันทึก Certificate', results.length, 'success', templateName);

      return { status: true, count: results.length, message: 'อัปเดต ' + results.length + ' รายการ' };
    } finally {
      lock.releaseLock();
    }
  } catch (e) {
    return { status: false, message: 'batchUpdateCertStatus Error: ' + e.toString() };
  }
}

/**
 * อัปเดตสถานะหลาย rows พร้อมกัน
 */
function updateRecordStatuses(token, updates) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var sheet = getSpreadsheet().getSheetByName('รายชื่อ');
    var lastRow = sheet.getLastRow();
    var now = new Date().toLocaleString('th-TH');

    if (lastRow > 1) {
      // Batch update: อ่านทั้ง range → แก้ใน memory → เขียนกลับครั้งเดียว
      var range = sheet.getRange(2, 1, lastRow - 1, 15);
      var values = range.getValues();

      updates.forEach(function(u) {
        if (u.rowIndex && u.rowIndex >= 2 && u.rowIndex <= lastRow) {
          var idx = u.rowIndex - 2; // convert to 0-based array index
          values[idx][11] = u.status || 'generated';  // column 12 (status)
          if (u.driveUrl) values[idx][12] = u.driveUrl; // column 13 (drive url)
          values[idx][13] = now;                        // column 14 (timestamp)
        }
      });

      range.setValues(values);
    }

    SpreadsheetApp.flush();
    logActivity(session.username, 'สร้างเกียรติบัตร', updates.length, 'success', '');

    return { status: true, message: 'อัปเดตสถานะ ' + updates.length + ' รายการสำเร็จ' };
  } catch (e) {
    return { status: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ดึงประวัติ Export
 */
function getExportHistory(token) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  try {
    var sheet = getSpreadsheet().getSheetByName('Export_Log');
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { status: true, logs: [] };

    var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    var logs = data.map(function(row) {
      return {
        timestamp: String(row[0] || ''),
        username: String(row[1] || ''),
        action: String(row[2] || ''),
        recordCount: Number(row[3]) || 0,
        status: String(row[4] || ''),
        note: String(row[5] || '')
      };
    }).reverse(); // ล่าสุดก่อน

    return { status: true, logs: logs.slice(0, 50) };
  } catch (e) {
    return { status: false, message: e.toString() };
  }
}

/**
 * 🗑️ ล้างประวัติ Export ทั้งหมด
 */
function clearExportHistory(token) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  try {
    var sheet = getSpreadsheet().getSheetByName('Export_Log');
    if (!sheet) return { status: false, message: 'ไม่พบ Sheet Export_Log' };

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { status: true, deleted: 0, message: 'ไม่มีประวัติให้ลบ' };

    var deleted = lastRow - 1;
    sheet.deleteRows(2, deleted);
    SpreadsheetApp.flush();

    logActivity(session.username, 'ล้างประวัติ Export', deleted, 'success', '');

    return { status: true, deleted: deleted, message: 'ลบ ' + deleted + ' รายการ' };
  } catch (e) {
    return { status: false, message: 'clearExportHistory Error: ' + e.toString() };
  }
}

// =========================================================================
// 7. DASHBOARD & STATS
// =========================================================================

/**
 * ดึงสถิติสำหรับ Dashboard
 */
function getStats(token) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  try {
    var sheet = getSpreadsheet().getSheetByName('รายชื่อ');
    var lastRow = sheet.getLastRow();
    var activeTemplateId = String(getSettingValue('active_template_id') || '');

    var stats = { total: 0, totalAll: 0, pending: 0, generated: 0, exported: 0, templates: 0 };

    if (lastRow > 1) {
      var data = sheet.getRange(2, 12, lastRow - 1, 4).getValues(); // col L(status), M, N, O(template_id)
      data.forEach(function(r) {
        var s = (r[0] || 'pending').toString().toLowerCase();
        var tplId = String(r[3] || '');
        stats.totalAll++;
        // กรองตาม template_id
        if (activeTemplateId && tplId !== activeTemplateId) return;
        stats.total++;
        if (s === 'pending') stats.pending++;
        else if (s === 'generated') stats.generated++;
        else if (s === 'exported') stats.exported++;
      });
    }

    // Template count
    var tplSheet = getSpreadsheet().getSheetByName('Template_Config');
    var tplLastRow = tplSheet.getLastRow();
    stats.templates = tplLastRow > 1 ? tplLastRow - 1 : 0;

    // Active template info
    if (activeTemplateId) {
      var finder = tplSheet.getRange('A:A').createTextFinder(activeTemplateId)
        .matchEntireCell(true).matchCase(true);
      var cell = finder.findNext();
      if (cell) {
        stats.activeTemplateName = String(tplSheet.getRange(cell.getRow(), 2).getValue() || '');
      }
    }

    return { status: true, stats: stats };
  } catch (e) {
    return { status: false, message: e.toString() };
  }
}

/**
 * ดึง Activity Log ล่าสุด (5 รายการ)
 */
function getRecentActivity(token) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  try {
    var sheet = getSpreadsheet().getSheetByName('Export_Log');
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { status: true, activities: [] };

    var startRow = Math.max(2, lastRow - 4);
    var data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 6).getValues();

    var activities = data.map(function(row) {
      return {
        timestamp: String(row[0] || ''),
        username: String(row[1] || ''),
        action: String(row[2] || ''),
        recordCount: Number(row[3]) || 0,
        status: String(row[4] || ''),
        note: String(row[5] || '')
      };
    }).reverse();

    return { status: true, activities: activities };
  } catch (e) {
    return { status: false, message: e.toString() };
  }
}

// =========================================================================
// 8. SETTINGS
// =========================================================================

/**
 * ดึง Settings ทั้งหมด
 */
function getSettings(token) {
  var session = validateSession(token);
  if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

  try {
    var sheet = getSpreadsheet().getSheetByName('Settings');
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { status: true, settings: {} };

    var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    var settings = {};
    data.forEach(function(row) {
      settings[String(row[0] || '')] = { value: String(row[1] != null ? row[1] : ''), description: String(row[2] || '') };
    });

    return { status: true, settings: settings };
  } catch (e) {
    return { status: false, message: e.toString() };
  }
}

/**
 * อัปเดต Settings
 */
function updateSettings(token, settingsObj) {
  var session = validateSession(token);
  if (!session || session.role !== 'admin') {
    return { status: false, message: 'เฉพาะ Admin เท่านั้น' };
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var sheet = getSpreadsheet().getSheetByName('Settings');

    Object.keys(settingsObj).forEach(function(key) {
      var finder = sheet.getRange('A:A').createTextFinder(key)
        .matchEntireCell(true).matchCase(true);
      var cell = finder.findNext();
      if (cell) {
        sheet.getRange(cell.getRow(), 2).setValue(settingsObj[key]);
      }
    });

    SpreadsheetApp.flush();
    return { status: true, message: 'บันทึกการตั้งค่าสำเร็จ' };
  } catch (e) {
    return { status: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

// =========================================================================
// 9. UTILITY FUNCTIONS
// =========================================================================

/**
 * SHA-256 Hash
 */
function hashPassword(password) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8
  );
  return bytes.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/**
 * Generate UUID
 */
function generateUUID() {
  return Utilities.getUuid();
}

/**
 * Log Activity → Export_Log sheet
 */
function logActivity(username, action, recordCount, status, note) {
  try {
    var sheet = getSpreadsheet().getSheetByName('Export_Log');
    sheet.appendRow([
      new Date().toLocaleString('th-TH'),
      username || '',
      action || '',
      recordCount || 0,
      status || '',
      note || ''
    ]);
  } catch (e) {
    console.error('logActivity Error:', e);
  }
}

/**
 * Log Login Activity → Login_Log sheet
 */
function logLoginActivity(username, action, status, note) {
  try {
    var sheet = getSpreadsheet().getSheetByName('Login_Log');
    sheet.appendRow([
      new Date().toLocaleString('th-TH'),
      username || '',
      action || '',
      status || '',
      note || ''
    ]);
  } catch (e) {
    console.error('logLoginActivity Error:', e);
  }
}

/**
 * ดึงค่า Setting ตาม Key
 */
function getSettingValue(key) {
  try {
    var sheet = getSpreadsheet().getSheetByName('Settings');
    var finder = sheet.getRange('A:A').createTextFinder(key)
      .matchEntireCell(true).matchCase(true);
    var cell = finder.findNext();
    if (!cell) return '';
    return sheet.getRange(cell.getRow(), 2).getValue().toString();
  } catch (e) {
    return '';
  }
}

/**
 * ดึงค่า Settings ทั้งหมดเป็น Map (key → value)
 * ลด API calls จาก N ครั้ง เหลือ 1 ครั้ง
 */
function getAllSettingsMap() {
  try {
    var sheet = getSpreadsheet().getSheetByName('Settings');
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return {};
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    var map = {};
    data.forEach(function(row) {
      if (row[0]) map[row[0].toString()] = row[1] ? row[1].toString() : '';
    });
    return map;
  } catch (e) {
    return {};
  }
}

/**
 * อัปเดตค่า Setting
 */
function updateSettingValue(key, value) {
  try {
    var sheet = getSpreadsheet().getSheetByName('Settings');
    var finder = sheet.getRange('A:A').createTextFinder(key)
      .matchEntireCell(true).matchCase(true);
    var cell = finder.findNext();
    if (cell) {
      sheet.getRange(cell.getRow(), 2).setValue(value);
    }
  } catch (e) {
    console.error('updateSettingValue Error:', e);
  }
}

/**
 * ดึงเลขที่เกียรติบัตรสูงสุดที่มีอยู่
 */
function getMaxCertNumber() {
  try {
    var sheet = getSpreadsheet().getSheetByName('รายชื่อ');
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return 0;
    var activeTemplateId = String(getSettingValue('active_template_id') || '');

    // อ่าน column C (cert number) + column O (template_id)
    var data = sheet.getRange(2, 3, lastRow - 1, 1).getValues();
    var tplIds = sheet.getRange(2, 15, lastRow - 1, 1).getValues();
    var maxNum = 0;
    data.forEach(function(r, idx) {
      // กรองตาม template
      if (activeTemplateId && String(tplIds[idx][0] || '') !== activeTemplateId) return;
      var cert = String(r[0] || '');
      var numPart = cert.replace(/[^\d]/g, '');
      var num = parseInt(numPart, 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    });

    return maxNum;
  } catch (e) {
    return 0;
  }
}

/**
 * Auto-generate เลขที่ถัดไป
 */
function generateNextCertNumber() {
  var activeTemplateId = String(getSettingValue('active_template_id') || '');
  // ใช้ prefix จาก Template_Config ก่อน, fallback ไป Settings
  var prefix = getTemplatePrefixById(activeTemplateId) || getSettingValue('number_prefix') || '';
  var format = getSettingValue('number_format') || '0000';
  var nextNum = getMaxCertNumber() + 1;
  return prefix + padNumber(nextNum, format.length);
}

/**
 * ดึง number_prefix จาก Template_Config ตาม template_id
 */
function getTemplatePrefixById(templateId) {
  if (!templateId) return '';
  try {
    var sheet = getSpreadsheet().getSheetByName('Template_Config');
    var finder = sheet.getRange('A:A').createTextFinder(templateId)
      .matchEntireCell(true).matchCase(true);
    var cell = finder.findNext();
    if (cell) {
      return String(sheet.getRange(cell.getRow(), 9).getValue() || '');
    }
  } catch(e) {}
  return '';
}

/**
 * Pad number with leading zeros
 */
function padNumber(num, length) {
  var s = String(num);
  while (s.length < length) s = '0' + s;
  return s;
}

/**
 * Extract File ID from Drive URL
 */
function extractFileIdFromUrl(url) {
  if (!url) return '';
  var match = url.match(/[-\w]{25,}/);
  return match ? match[0] : '';
}

// =========================================================================
// 10. TEMPLATE GATE — Template-Centric Workflow
// =========================================================================

/**
 * ดึงรายชื่อ Templates พร้อมจำนวนรายชื่อแต่ละ Template (1 API call)
 */
function getTemplateListWithCounts(token) {
  try {
    var session = validateSession(token);
    if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName('Template_Config');
    if (!sheet) {
      return { status: true, templates: [], activeId: '' };
    }
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { status: true, templates: [], activeId: '' };

    var data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    var activeId = String(getSettingValue('active_template_id') || '');

    // นับจำนวนรายชื่อต่อ Template (batch read)
    var countMap = {};
    var nameSheet = ss.getSheetByName('รายชื่อ');
    if (nameSheet) {
      var nameLR = nameSheet.getLastRow();
      if (nameLR > 1) {
        var tplIds = nameSheet.getRange(2, 15, nameLR - 1, 1).getValues();
        tplIds.forEach(function(r) {
          var id = String(r[0] || '');
          if (id) countMap[id] = (countMap[id] || 0) + 1;
        });
      }
    }

    var templates = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var tplId = String(row[0] || '');
      templates.push({
        template_id: tplId,
        template_name: String(row[1] || ''),
        drive_file_id: String(row[2] || ''),
        canvas_width: Number(row[4]) || 3508,
        canvas_height: Number(row[5]) || 2480,
        created_at: String(row[6] || ''),
        updated_at: String(row[7] || ''),
        number_prefix: String(row[8] || ''),
        isActive: tplId === activeId,
        recordCount: countMap[tplId] || 0
      });
    }

    return { status: true, templates: templates, activeId: activeId };
  } catch (e) {
    return { status: false, message: 'getTemplateListWithCounts Error: ' + e.toString() };
  }
}

/**
 * 🚀 switchTemplateContext() — สลับ Template + โหลดทุกอย่างใน 1 API call
 * แทนที่จะเรียก 4 API (updateSettings + loadTemplateConfig + getStats + getData)
 */
function switchTemplateContext(token, templateId) {
  try {
    var session = validateSession(token);
    if (!session) return { status: false, message: 'กรุณาเข้าสู่ระบบใหม่' };

    // 1. อัปเดต active_template_id
    updateSettingValue('active_template_id', templateId);

    // 2. โหลด Template Config
    var config = null;
    var tplSheet = getSpreadsheet().getSheetByName('Template_Config');
    if (tplSheet) {
      var finder = tplSheet.getRange('A:A').createTextFinder(templateId)
        .matchEntireCell(true).matchCase(true);
      var cell = finder.findNext();
      if (cell) {
        var row = cell.getRow();
        var d = tplSheet.getRange(row, 1, 1, 9).getValues()[0];
        var elements = [];
        try { elements = JSON.parse(d[3] || '[]'); } catch(pe) { elements = []; }
        config = {
          template_id: String(d[0] || ''),
          template_name: String(d[1] || ''),
          drive_file_id: String(d[2] || ''),
          elements: elements,
          canvas_width: Number(d[4]) || 3508,
          canvas_height: Number(d[5]) || 2480,
          created_at: String(d[6] || ''),
          updated_at: String(d[7] || ''),
          number_prefix: String(d[8] || '')
        };
      }
    }

    // 3. โหลด Stats (กรองตาม template ใหม่)
    var sheet = getSpreadsheet().getSheetByName('รายชื่อ');
    var lastRow = sheet.getLastRow();
    var stats = { total: 0, pending: 0, generated: 0, exported: 0, templates: 0 };

    if (lastRow > 1) {
      var sData = sheet.getRange(2, 12, lastRow - 1, 4).getValues();
      sData.forEach(function(r) {
        var s = (r[0] || 'pending').toString().toLowerCase();
        var tplId = String(r[3] || '');
        if (templateId && tplId !== templateId) return;
        stats.total++;
        if (s === 'pending') stats.pending++;
        else if (s === 'generated') stats.generated++;
        else if (s === 'exported') stats.exported++;
      });
    }

    var tplLastRow = tplSheet ? tplSheet.getLastRow() : 1;
    stats.templates = tplLastRow > 1 ? tplLastRow - 1 : 0;
    if (config) stats.activeTemplateName = config.template_name;

    // 4. โหลด Data (page 1, 50 records)
    var records = [];
    if (lastRow > 1) {
      var allData = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
      allData.forEach(function(r, idx) {
        var tplId = String(r[14] || '');
        if (templateId && tplId !== templateId) return;
        records.push({
          rowIndex: idx + 2,
          name: String(r[0] || ''),
          school: String(r[1] || ''),
          certNumber: String(r[2] || ''),
          date: String(r[3] || ''),
          signer: String(r[4] || ''),
          position: String(r[5] || ''),
          extra1: String(r[6] || ''),
          extra2: String(r[7] || ''),
          extra3: String(r[8] || ''),
          extra4: String(r[9] || ''),
          extra5: String(r[10] || ''),
          status: String(r[11] || 'pending'),
          driveUrl: String(r[12] || ''),
          timestamp: String(r[13] || ''),
          templateId: tplId
        });
      });
    }

    // Collect unique schools
    var schoolSet = {};
    records.forEach(function(r) { if (r.school) schoolSet[r.school] = true; });

    var total = records.length;
    var perPage = 50;
    var totalPages = Math.ceil(total / perPage) || 1;
    var pageData = records.slice(0, perPage);

    return {
      status: true,
      config: config,
      stats: stats,
      data: {
        status: true,
        data: pageData,
        total: total,
        page: 1,
        totalPages: totalPages,
        schools: Object.keys(schoolSet).sort()
      }
    };
  } catch (e) {
    return { status: false, message: 'switchTemplateContext Error: ' + e.toString() };
  }
}

/**
 * 🔧 Diagnostic — ทดสอบว่า Code.gs เวอร์ชันล่าสุดหรือไม่
 */
function diagnoseCertSystem(token) {
  var result = {
    version: '2026-06-14-fix3',
    timestamp: new Date().toISOString(),
    checks: {}
  };

  // 1. Check validateSession
  try {
    var session = validateSession(token);
    result.checks.session = session ? 'VALID: ' + session.username : 'INVALID (null)';
  } catch(e) {
    result.checks.session = 'ERROR: ' + e.toString();
  }

  // 2. Check Spreadsheet
  try {
    var ss = getSpreadsheet();
    result.checks.spreadsheet = ss ? 'OK: ' + ss.getName() : 'NULL';
  } catch(e) {
    result.checks.spreadsheet = 'ERROR: ' + e.toString();
  }

  // 3. Check Template_Config sheet
  try {
    var sheet = getSpreadsheet().getSheetByName('Template_Config');
    if (sheet) {
      result.checks.templateSheet = 'OK: ' + sheet.getLastRow() + ' rows';
    } else {
      result.checks.templateSheet = 'NOT FOUND';
    }
  } catch(e) {
    result.checks.templateSheet = 'ERROR: ' + e.toString();
  }

  // 4. Check Settings sheet
  try {
    var activeId = getSettingValue('active_template_id');
    result.checks.activeTemplate = activeId || '(empty)';
  } catch(e) {
    result.checks.activeTemplate = 'ERROR: ' + e.toString();
  }

  return result;
}

// =========================================================================
// 10. GUEST / PUBLIC API (ไม่ต้อง Login)
// =========================================================================

/**
 * 🔍 ค้นหาเกียรติบัตร (Public — ไม่ต้อง Login)
 * ค้นหาตามชื่อ + filter ตาม template (optional)
 * แสดงเฉพาะที่ Export แล้ว (status = generated/exported)
 */
function guestSearchCertificates(searchName, templateId) {
  try {
    if (!searchName || searchName.trim().length < 2) {
      return { status: false, message: 'กรุณาพิมพ์ชื่ออย่างน้อย 2 ตัวอักษร' };
    }

    var search = searchName.trim().toLowerCase();

    // Rate Limit (10 ครั้ง/นาที ต่อ search term)
    var cache = CacheService.getScriptCache();
    var rateKey = 'guest_rate_' + search.substring(0, 10);
    var rateCount = parseInt(cache.get(rateKey) || '0');
    if (rateCount >= 10) {
      return { status: false, message: 'ค้นหาบ่อยเกินไป กรุณารอ 1 นาที' };
    }
    cache.put(rateKey, String(rateCount + 1), 60);

    var sheet = getSpreadsheet().getSheetByName('รายชื่อ');
    if (!sheet) return { status: false, message: 'ไม่พบข้อมูล' };

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { status: true, results: [], message: 'ไม่พบข้อมูล' };

    var data = sheet.getRange(2, 1, lastRow - 1, 15).getValues();

    // โหลดชื่อ Template สำหรับแสดงผล
    var tplSheet = getSpreadsheet().getSheetByName('Template_Config');
    var tplMap = {};
    if (tplSheet && tplSheet.getLastRow() > 1) {
      var tplData = tplSheet.getRange(2, 1, tplSheet.getLastRow() - 1, 2).getValues();
      tplData.forEach(function(t) { tplMap[String(t[0])] = String(t[1]); });
    }

    var results = [];
    data.forEach(function(row) {
      var name = String(row[0] || '').trim();
      var status = String(row[11] || '');
      var driveUrl = String(row[12] || '');
      var tplId = String(row[14] || '');

      // เฉพาะที่ Export แล้ว + ชื่อตรงกัน
      if ((status === 'generated' || status === 'exported') && driveUrl && name) {
        if (name.toLowerCase().indexOf(search) !== -1) {
          // Filter ตาม template (ถ้าเลือก)
          if (templateId && templateId !== 'all' && tplId !== templateId) return;

          results.push({
            name: name,
            school: String(row[1] || ''),
            certNumber: String(row[2] || ''),
            date: String(row[3] || ''),
            driveUrl: driveUrl,
            templateName: tplMap[tplId] || '',
            exportDate: String(row[13] || '')
          });
        }
      }
    });

    // จำกัดผลลัพธ์ไม่เกิน 50 รายการ
    if (results.length > 50) {
      results = results.slice(0, 50);
    }

    return { status: true, results: results, total: results.length };
  } catch (e) {
    return { status: false, message: 'เกิดข้อผิดพลาด: ' + e.toString() };
  }
}

/**
 * 📋 ดึงรายชื่อ Template (Public — สำหรับ dropdown)
 */
function getPublicTemplateList() {
  try {
    var sheet = getSpreadsheet().getSheetByName('Template_Config');
    if (!sheet || sheet.getLastRow() <= 1) return { status: true, templates: [] };

    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    var templates = [];
    data.forEach(function(row) {
      if (row[0] && row[1]) {
        templates.push({ id: String(row[0]), name: String(row[1]) });
      }
    });

    return { status: true, templates: templates };
  } catch (e) {
    return { status: false, templates: [], message: e.toString() };
  }
}
