/**
   * =========================================================================
   * SCRIPT-EXPORT.HTML — Export Logic: ระบบสร้างเกียรติบัตร (KRUSB85)
   * =========================================================================
   * 🚀 Direct Drive API Upload + Parallel Processing
   * Certificate generation, progress tracking, export history
   * =========================================================================
   */

  // ═══════════════════════════════════════════════════════════════════════
  // EXPORT STATE
  // ═══════════════════════════════════════════════════════════════════════

  var ExportState = {
    source: 'all',
    isExporting: false,
    isCancelled: false,
    totalRecords: 0,
    processedRecords: 0,
    startTime: null,
    exportedFiles: [],
    selectedRecordRows: [],
    uploadConfig: null
  };

  var CONCURRENCY = 5; // Upload 5 ไฟล์พร้อมกัน

  // ═══════════════════════════════════════════════════════════════════════
  // EXPORT SOURCE SELECTION
  // ═══════════════════════════════════════════════════════════════════════

  function selectExportSource(source) {
    ExportState.source = source;

    document.querySelectorAll('#exportSourceOptions .export-option-card').forEach(function (card) {
      card.classList.toggle('selected', card.dataset.source === source);
    });

    // ถ้าเลือก "เฉพาะที่เลือก" → เปิด Modal เลือกรายชื่อ
    if (source === 'selected') {
      openNameSelectModal();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NAME SELECTION MODAL (สำหรับ "เฉพาะที่เลือก")
  // ═══════════════════════════════════════════════════════════════════════

  var NameSelectState = {
    allRecords: [],
    filteredRecords: [],
    selectedRows: new Set()
  };

  function openNameSelectModal() {
    showLoading('กำลังโหลดรายชื่อ...');

    api.getAllRecords()
      .then(function(result) {
        hideLoading();
        if (!result || !result.status) {
          showToast(result ? result.message : 'โหลดรายชื่อไม่สำเร็จ', 'error');
          return;
        }

        NameSelectState.allRecords = result.data;
        NameSelectState.filteredRecords = result.data.slice();
        NameSelectState.selectedRows = new Set();

        // เลือกเฉพาะ pending เป็นค่าเริ่มต้น
        result.data.forEach(function (r) {
          if (r.status === 'pending') {
            NameSelectState.selectedRows.add(r.rowIndex);
          }
        });

        populateSchoolFilter(result.data);
        renderNameSelectList();
        updateNameSelectCount();
        openModal('selectNamesModal');
      })
      .catch(function(err) {
        hideLoading();
        showToast('โหลดรายชื่อไม่สำเร็จ: ' + err.message, 'error');
      });
  }

  function populateSchoolFilter(records) {
    var schools = {};
    records.forEach(function (r) { if (r.school) schools[r.school] = true; });

    var sel = document.getElementById('nameSelectSchool');
    sel.innerHTML = '<option value="">ทั้งหมด</option>';
    Object.keys(schools).sort().forEach(function (s) {
      sel.innerHTML += '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>';
    });
  }

  function filterNameSelectList() {
    var search = (document.getElementById('nameSelectSearch').value || '').toLowerCase().trim();
    var school = document.getElementById('nameSelectSchool').value;
    var status = document.getElementById('nameSelectStatus').value;

    NameSelectState.filteredRecords = NameSelectState.allRecords.filter(function (r) {
      if (search && r.name.toLowerCase().indexOf(search) === -1 &&
        r.school.toLowerCase().indexOf(search) === -1 &&
        r.certNumber.toLowerCase().indexOf(search) === -1) return false;
      if (school && r.school !== school) return false;
      if (status && r.status !== status) return false;
      return true;
    });

    renderNameSelectList();
    updateNameSelectCount();
  }

  function renderNameSelectList() {
    var list = document.getElementById('nameSelectList');
    var records = NameSelectState.filteredRecords;

    if (records.length === 0) {
      list.innerHTML = '<div class="name-select-empty">ไม่พบรายชื่อ</div>';
      return;
    }

    var html = '';
    records.forEach(function (r) {
      var checked = NameSelectState.selectedRows.has(r.rowIndex) ? 'checked' : '';
      var statusBadge = r.status === 'pending'
        ? '<span class="status-badge pending">⏳ รอ</span>'
        : r.status === 'generated'
          ? '<span class="status-badge generated">✅ สร้างแล้ว</span>'
          : '<span class="status-badge exported">📤 ส่งแล้ว</span>';

      html += '<label class="name-select-item" data-row="' + r.rowIndex + '">' +
        '<input type="checkbox" ' + checked + ' onchange="toggleNameSelect(' + r.rowIndex + ', this.checked)">' +
        '<span class="name-select-name">' + escapeHtml(r.name) + '</span>' +
        '<span class="name-select-school">' + escapeHtml(r.school) + '</span>' +
        statusBadge +
        '</label>';
    });

    list.innerHTML = html;
  }

  function toggleNameSelect(rowIndex, checked) {
    if (checked) {
      NameSelectState.selectedRows.add(rowIndex);
    } else {
      NameSelectState.selectedRows.delete(rowIndex);
    }
    updateNameSelectCount();
  }

  function toggleAllNames(checked) {
    NameSelectState.filteredRecords.forEach(function (r) {
      if (checked) {
        NameSelectState.selectedRows.add(r.rowIndex);
      } else {
        NameSelectState.selectedRows.delete(r.rowIndex);
      }
    });
    renderNameSelectList();
    updateNameSelectCount();
  }

  function updateNameSelectCount() {
    var count = NameSelectState.selectedRows.size;
    var total = NameSelectState.allRecords.length;
    document.getElementById('nameSelectCount').textContent = 'เลือกแล้ว ' + count + ' / ' + total + ' รายการ';

    var btn = document.getElementById('btnStartFromModal');
    btn.textContent = '🚀 เริ่มสร้าง (' + count + ')';
    btn.disabled = count === 0;

    // Update "select all" checkbox
    var selectAll = document.getElementById('nameSelectAll');
    if (selectAll) {
      var filtered = NameSelectState.filteredRecords;
      var allChecked = filtered.length > 0 && filtered.every(function (r) {
        return NameSelectState.selectedRows.has(r.rowIndex);
      });
      selectAll.checked = allChecked;
    }
  }

  function startExportFromModal() {
    if (NameSelectState.selectedRows.size === 0) {
      showToast('กรุณาเลือกรายชื่ออย่างน้อย 1 รายการ', 'warning');
      return;
    }

    ExportState.selectedRecordRows = Array.from(NameSelectState.selectedRows);
    closeModal('selectNamesModal');
    startExport();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // START EXPORT (Main Flow)
  // ═══════════════════════════════════════════════════════════════════════

  function startExport() {
    if (!Canvas.initialized || Canvas.elements.length === 0) {
      showToast('กรุณาออกแบบ Template ก่อน Export', 'warning');
      return;
    }

    if (!Canvas.bgImage) {
      showToast('กรุณาอัปโหลดรูปพื้นหลัง Template ก่อน', 'warning');
      return;
    }

    ExportState.isExporting = true;
    ExportState.isCancelled = false;
    ExportState.processedRecords = 0;
    ExportState.exportedFiles = [];
    ExportState.startTime = Date.now();

    document.getElementById('exportProgressCard').style.display = '';
    document.getElementById('exportResultCard').style.display = 'none';
    document.getElementById('btnStartExport').disabled = true;
    document.getElementById('btnCancelExport').disabled = false;

    showLoading('กำลังเตรียมข้อมูล...');

    api.getAllRecords()
      .then(function(result) {
        hideLoading();

        if (!result || !result.status) {
          showToast(result ? result.message : 'เกิดข้อผิดพลาด', 'error');
          resetExportUI();
          return;
        }

        var records = result.data;

        // Filter by source
        if (ExportState.source === 'pending') {
          records = records.filter(function (r) { return r.status === 'pending'; });
        } else if (ExportState.source === 'selected') {
          var selectedRows = ExportState.selectedRecordRows;
          if (selectedRows.length === 0) {
            showToast('กรุณาเลือกรายชื่อก่อน', 'warning');
            resetExportUI();
            return;
          }
          records = records.filter(function (r) {
            return selectedRows.indexOf(r.rowIndex) !== -1;
          });
        }

        if (records.length === 0) {
          showToast('ไม่พบรายชื่อสำหรับ Export', 'warning');
          resetExportUI();
          return;
        }

        ExportState.totalRecords = records.length;
        updateExportProgress(0, records.length, 'กำลังเตรียม...');

        var format = document.getElementById('exportFormat').value;

        if (format === 'direct') {
          // 🚀 Direct Drive API Upload (Parallel)
          startDirectDriveExport(records);
        } else if (format === 'zip') {
          // ZIP mode (client-side)
          processExportBatch(records, 0);
        } else {
          // Legacy: individual via GAS
          processExportBatch(records, 0);
        }
      })
      .catch(function(err) {
        hideLoading();
        showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
        resetExportUI();
      });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🚀 DIRECT DRIVE API UPLOAD (NEW — Parallel)
  // ═══════════════════════════════════════════════════════════════════════

  function startDirectDriveExport(records) {
    updateExportProgress(0, records.length, '⚡ กำลังเตรียม Direct Upload...');

    api.getUploadConfig(Canvas.currentTemplateName || AppState.activeTemplateName || '')
      .then(function(config) {
        if (!config || !config.status) {
          showToast(config ? config.message : 'ไม่สามารถเตรียม Upload ได้', 'error');
          resetExportUI();
          return;
        }

        ExportState.uploadConfig = config;
        processDirectExport(records, config);
      })
      .catch(function(err) {
        showToast('เตรียม Upload ไม่สำเร็จ: ' + err.message, 'error');
        resetExportUI();
      });
  }

  function processDirectExport(records, config) {
    var scale = parseFloat(document.getElementById('exportResolution').value) || 1;
    var filenamePattern = document.getElementById('exportFilename').value;
    var imageFormat = document.getElementById('exportImageFormat').value || 'jpeg';
    var jpegQuality = parseFloat(document.getElementById('exportJpegQuality').value) || 0.92;
    var isPdf = imageFormat === 'pdf';
    var mimeType = isPdf ? 'application/pdf' : (imageFormat === 'png' ? 'image/png' : 'image/jpeg');
    var ext = isPdf ? '.pdf' : (imageFormat === 'png' ? '.png' : '.jpg');

    var index = 0;
    var results = [];
    var errors = [];
    var completedCount = 0;  // ✅ นับจำนวนที่เสร็จ (แทน activeWorkers)

    function updateUI() {
      var done = results.length + errors.length;
      var current = done < records.length ? records[Math.min(index, records.length - 1)] : null;
      updateExportProgress(done, records.length,
        current ? '⚡ ' + (current.name || 'กำลังอัปโหลด...') : '⚡ กำลังอัปโหลด...');
    }

    function checkDone() {
      if (completedCount >= records.length) {
        finishDirectExport(records, results, errors, config);
      }
    }

    function worker() {
      if (ExportState.isCancelled || index >= records.length) {
        return;  // ✅ แค่ return ไม่ต้องนับ
      }

      var i = index++;
      var record = records[i];

      // Render canvas → Blob (Image or PDF)
      var canvas = renderForExportCanvas(record, scale);

      var blobPromise;
      if (isPdf) {
        blobPromise = Promise.resolve(canvasToPdfBlob(canvas));
      } else {
        blobPromise = canvasToBlob(canvas, mimeType, jpegQuality);
      }

      blobPromise.then(function (blob) {
        var filename = generateFilename(filenamePattern, record) + ext;

        // Upload ตรงไป Drive
        return uploadToDriveAPI(blob, filename, config.folderId, config.accessToken, mimeType);
      }).then(function (driveFile) {
        results.push({
          rowIndex: record.rowIndex,
          fileId: driveFile.id,
          name: record.name,
          filename: driveFile.name
        });
        ExportState.processedRecords++;
        completedCount++;  // ✅ นับเมื่อเสร็จ
        updateUI();
        checkDone();       // ✅ ตรวจว่าครบหรือยัง
        worker();          // หยิบ item ถัดไป
      }).catch(function (err) {
        console.error('Export error for', record.name, ':', err);
        errors.push({ rowIndex: record.rowIndex, name: record.name, error: err.message || String(err) });
        ExportState.processedRecords++;
        completedCount++;  // ✅ นับ error ด้วย
        updateUI();
        checkDone();
        worker();
      });
    }

    // Start parallel workers
    var workerCount = Math.min(CONCURRENCY, records.length);
    for (var w = 0; w < workerCount; w++) {
      worker();
    }
  }

  function uploadToDriveAPI(blob, filename, folderId, accessToken, mimeType) {
    var metadata = {
      name: filename,
      mimeType: mimeType,
      parents: [folderId]
    };

    var formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', blob);

    return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + accessToken },
      body: formData
    }).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (text) {
          throw new Error('Drive API Error ' + response.status + ': ' + text);
        });
      }
      return response.json();
    });
  }

  function canvasToBlob(canvas, mimeType, quality) {
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob returned null'));
          }
        }, mimeType, quality);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Canvas → PDF Blob (ใช้ jsPDF)
   * ภาษาไทยถูกต้อง 100% เพราะใช้ Canvas render ก่อนแล้วฝังเป็น image ใน PDF
   */
  function canvasToPdfBlob(canvas) {
    // ตรวจว่า jsPDF library โหลดแล้วหรือยัง
    var jsPDFClass;
    if (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) {
      jsPDFClass = window.jspdf.jsPDF;
    } else if (typeof jspdf !== 'undefined' && jspdf.jsPDF) {
      jsPDFClass = jspdf.jsPDF;
    } else if (typeof jsPDF !== 'undefined') {
      jsPDFClass = jsPDF;
    } else {
      throw new Error('jsPDF library ไม่ได้โหลด — กรุณา Refresh หน้าแล้วลองใหม่');
    }

    var orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';

    // ใช้ pt (1px ≈ 0.75pt) เพื่อให้ขนาดถูกต้อง
    var widthPt = canvas.width * 0.75;
    var heightPt = canvas.height * 0.75;

    var doc = new jsPDFClass({
      orientation: orientation,
      unit: 'pt',
      format: [widthPt, heightPt]
    });

    var imgData = canvas.toDataURL('image/jpeg', 0.95);
    doc.addImage(imgData, 'JPEG', 0, 0, widthPt, heightPt);

    return doc.output('blob');
  }

  /**
   * ซ่อน/แสดง JPEG Quality ตามรูปแบบที่เลือก
   */
  function toggleJpegQuality() {
    var format = document.getElementById('exportImageFormat').value;
    var qualityGroup = document.getElementById('exportJpegQuality').closest('.form-group');
    if (qualityGroup) {
      qualityGroup.style.display = format === 'jpeg' ? '' : 'none';
    }
  }

  function renderForExportCanvas(record, scale) {
    scale = scale || 1;
    var offCanvas = document.createElement('canvas');
    offCanvas.width = Canvas.width * scale;
    offCanvas.height = Canvas.height * scale;
    var ctx = offCanvas.getContext('2d');

    ctx.scale(scale, scale);

    // Background
    if (Canvas.bgImage) {
      ctx.drawImage(Canvas.bgImage, 0, 0, Canvas.width, Canvas.height);
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, Canvas.width, Canvas.height);
    }

    // Render elements
    Canvas.elements.forEach(function (el) {
      if (el.type === 'text') {
        renderTextElement(ctx, el, record);
      } else if (el.type === 'image') {
        ctx.save();
        ctx.globalAlpha = el.opacity !== undefined ? el.opacity : 1;
        if (el._imgObj) {
          ctx.drawImage(el._imgObj, el.x, el.y, el.imgWidth || 200, el.imgHeight || 200);
        } else if (el.imgDataUrl) {
          try {
            var tmpImg = new Image();
            tmpImg.src = el.imgDataUrl;
            ctx.drawImage(tmpImg, el.x, el.y, el.imgWidth || 200, el.imgHeight || 200);
          } catch (e) { /* skip */ }
        }
        ctx.restore();
      }
    });

    return offCanvas;
  }

  function finishDirectExport(records, results, errors, config) {
    var elapsed = Math.round((Date.now() - ExportState.startTime) / 1000);

    if (ExportState.isCancelled) {
      showToast('ยกเลิก Export แล้ว (สร้างไป ' + results.length + ' รายการ)', 'warning');
    }

    // Batch update Sheet
    if (results.length > 0) {
      updateExportProgress(results.length, records.length, '📊 กำลังอัปเดตข้อมูล...');

      api.batchUpdateCertStatus(results)
        .then(function(updateResult) {
          showExportResult(results.length, elapsed, config.folderUrl, null, errors);
        })
        .catch(function(err) {
          console.error('Batch update failed:', err);
          showExportResult(results.length, elapsed, config.folderUrl, null, errors);
        });
    } else {
      showExportResult(0, elapsed, null, null, errors);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LEGACY: SEQUENTIAL EXPORT (ZIP + Individual GAS)
  // ═══════════════════════════════════════════════════════════════════════

  function processExportBatch(records, index) {
    if (ExportState.isCancelled || index >= records.length) {
      finishExport(records);
      return;
    }

    var record = records[index];
    var scale = parseFloat(document.getElementById('exportResolution').value) || 1;
    var filenamePattern = document.getElementById('exportFilename').value;

    updateExportProgress(index + 1, records.length, '🏆 กำลังสร้าง: ' + (record.name || 'ไม่มีชื่อ'));

    try {
      var imageFormat = document.getElementById('exportImageFormat').value || 'jpeg';
      var isPdf = imageFormat === 'pdf';
      var ext = isPdf ? '.pdf' : '.png';
      var filename = generateFilename(filenamePattern, record);
      var format = document.getElementById('exportFormat').value;

      if (isPdf) {
        // PDF mode: render canvas → PDF blob → base64
        var canvas = renderForExportCanvas(record, scale);
        var pdfBlob = canvasToPdfBlob(canvas);
        var reader = new FileReader();
        reader.onload = function() {
          var base64Data = reader.result.split(',')[1];
          if (format === 'individual') {
            api.saveCertificateImage(base64Data, filename + ext, record.rowIndex, Canvas.currentTemplateName || AppState.activeTemplateName || '')
              .then(function(result) {
                ExportState.processedRecords++;
                if (result && result.status) {
                  ExportState.exportedFiles.push({ filename: filename, url: result.url, record: record });
                }
                setTimeout(function () { processExportBatch(records, index + 1); }, 100);
              })
              .catch(function(err) {
                console.error('Save cert error:', err);
                ExportState.processedRecords++;
                setTimeout(function () { processExportBatch(records, index + 1); }, 100);
              });
          } else {
            ExportState.exportedFiles.push({ filename: filename + ext, base64: base64Data, record: record });
            ExportState.processedRecords++;
            setTimeout(function () { processExportBatch(records, index + 1); }, 50);
          }
        };
        reader.readAsDataURL(pdfBlob);
      } else {
        // Image mode (PNG/JPEG)
        var dataUrl = renderForExport(record, scale);
        var base64Data = dataUrl.split(',')[1];

        if (format === 'individual') {
          api.saveCertificateImage(base64Data, filename, record.rowIndex, Canvas.currentTemplateName || AppState.activeTemplateName || '')
            .then(function(result) {
              ExportState.processedRecords++;
              if (result && result.status) {
                ExportState.exportedFiles.push({ filename: filename, url: result.url, record: record });
              }
              setTimeout(function () { processExportBatch(records, index + 1); }, 100);
            })
            .catch(function(err) {
              console.error('Save cert error:', err);
              ExportState.processedRecords++;
              setTimeout(function () { processExportBatch(records, index + 1); }, 100);
            });
        } else {
          ExportState.exportedFiles.push({ filename: filename + ext, base64: base64Data, record: record });
          ExportState.processedRecords++;
          setTimeout(function () { processExportBatch(records, index + 1); }, 50);
        }
      }
    } catch (err) {
      console.error('Render error:', err);
      ExportState.processedRecords++;
      setTimeout(function () { processExportBatch(records, index + 1); }, 50);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PROGRESS & RESULT UI
  // ═══════════════════════════════════════════════════════════════════════

  function updateExportProgress(current, total, message) {
    var percent = total > 0 ? Math.round((current / total) * 100) : 0;
    document.getElementById('exportPercent').textContent = percent + '%';
    document.getElementById('exportProgressBar').style.width = percent + '%';
    document.getElementById('exportCurrentName').textContent = message || '';
    document.getElementById('exportProgressDetail').textContent = current + ' / ' + total + ' รายการ';

    var elapsed = Math.round((Date.now() - ExportState.startTime) / 1000);
    document.getElementById('exportTimeElapsed').textContent = 'ผ่านไป ' + formatDuration(elapsed);
  }

  function finishExport(records) {
    var format = document.getElementById('exportFormat').value;
    var elapsed = Math.round((Date.now() - ExportState.startTime) / 1000);

    if (ExportState.isCancelled) {
      showToast('ยกเลิก Export แล้ว (สร้างไป ' + ExportState.processedRecords + ' รายการ)', 'warning');
      resetExportUI();
      return;
    }

    if (format === 'zip' && ExportState.exportedFiles.length > 0) {
      document.getElementById('exportCurrentName').textContent = '📦 กำลังสร้างไฟล์ ZIP...';

      createZipFile(ExportState.exportedFiles, function (zipBlob) {
        var reader = new FileReader();
        reader.onload = function () {
          var zipBase64 = reader.result.split(',')[1];
          var zipFilename = 'เกียรติบัตร_' + new Date().toISOString().split('T')[0];

          api.saveZipFile(zipBase64, zipFilename)
            .then(function(result) {
              if (result && result.status) {
                showExportResult(ExportState.processedRecords, elapsed, result.url, result.download_url);
                var updates = records.map(function (r) { return { rowIndex: r.rowIndex, status: 'exported' }; });
                api.updateRecordStatuses(updates);
              } else {
                showExportResult(ExportState.processedRecords, elapsed, null, null);
              }
            })
            .catch(function(err) {
              showToast('บันทึก ZIP ล้มเหลว: ' + err.message, 'error');
              showExportResult(ExportState.processedRecords, elapsed, null, null);
              downloadBlobDirectly(zipBlob, zipFilename + '.zip');
            });
        };
        reader.readAsDataURL(zipBlob);
      });
    } else {
      showExportResult(ExportState.processedRecords, elapsed, null, null);
      if (records && records.length > 0 && format === 'individual') {
        var updates = ExportState.exportedFiles.map(function (f) {
          return { rowIndex: f.record.rowIndex, status: 'generated', driveUrl: f.url || '' };
        });
        api.updateRecordStatuses(updates);
      }
    }
  }

  function showExportResult(count, elapsed, driveUrl, downloadUrl, errors) {
    document.getElementById('exportProgressCard').style.display = 'none';
    document.getElementById('exportResultCard').style.display = '';

    var summary = 'สร้างเกียรติบัตรสำเร็จ ' + count + ' รายการ';
    if (errors && errors.length > 0) {
      summary += ' (ผิดพลาด ' + errors.length + ' รายการ)';
    }
    document.getElementById('exportResultSummary').textContent = summary;
    document.getElementById('exportResultTime').textContent = 'ใช้เวลา ' + formatDuration(elapsed);

    var downloadBtn = document.getElementById('exportDownloadBtn');
    if (downloadUrl) {
      downloadBtn.href = downloadUrl;
      downloadBtn.style.display = '';
      downloadBtn.textContent = '📥 ดาวน์โหลด ZIP';
    } else if (driveUrl) {
      downloadBtn.href = driveUrl;
      downloadBtn.target = '_blank';
      downloadBtn.style.display = '';
      downloadBtn.textContent = '📁 เปิด Drive';
    } else {
      downloadBtn.style.display = 'none';
    }

    document.getElementById('btnStartExport').disabled = false;
    ExportState.isExporting = false;

    loadExportHistory();
    loadDashboard();
  }

  function resetExportUI() {
    document.getElementById('exportProgressCard').style.display = 'none';
    document.getElementById('btnStartExport').disabled = false;
    ExportState.isExporting = false;
  }

  function cancelExport() {
    ExportState.isCancelled = true;
    document.getElementById('btnCancelExport').disabled = true;
    document.getElementById('exportCurrentName').textContent = '⏹️ กำลังยกเลิก...';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ZIP CREATION (JSZip)
  // ═══════════════════════════════════════════════════════════════════════

  function createZipFile(files, callback) {
    if (typeof JSZip === 'undefined') {
      showToast('JSZip library ไม่ได้โหลด', 'error');
      return;
    }

    var zip = new JSZip();
    var folder = zip.folder('เกียรติบัตร');

    files.forEach(function (f) {
      if (f.base64) {
        folder.file(f.filename, f.base64, { base64: true });
      }
    });

    zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    }).then(function (blob) {
      callback(blob);
    }).catch(function (err) {
      showToast('สร้าง ZIP ล้มเหลว: ' + err.message, 'error');
      resetExportUI();
    });
  }

  function downloadBlobDirectly(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('ดาวน์โหลด ZIP โดยตรงแล้ว', 'success');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FILENAME GENERATION
  // ═══════════════════════════════════════════════════════════════════════

  function generateFilename(pattern, record) {
    var name = pattern
      .replace('{certNumber}', sanitizeFilename(record.certNumber || 'NO'))
      .replace('{name}', sanitizeFilename(record.name || 'Unknown'))
      .replace('{school}', sanitizeFilename(record.school || ''))
      .replace('{date}', sanitizeFilename(record.date || ''));

    return name || 'certificate';
  }

  function sanitizeFilename(name) {
    return String(name).replace(/[\\/:*?"<>|]/g, '_').trim();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXPORT HISTORY
  // ═══════════════════════════════════════════════════════════════════════

  function loadExportHistory() {
    api.getExportHistory()
      .then(function(result) {
        if (result && result.status) {
          renderExportHistory(result.logs);
        }
      });
  }

  function renderExportHistory(logs) {
    var tbody = document.getElementById('exportHistoryBody');

    if (!logs || logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">ยังไม่มีประวัติ</td></tr>';
      return;
    }

    var html = '';
    logs.forEach(function (log) {
      var statusBadge = log.status === 'success'
        ? '<span class="status-badge generated">✅ สำเร็จ</span>'
        : '<span class="status-badge pending">⚠️ ' + escapeHtml(log.status) + '</span>';

      html += '<tr>' +
        '<td>' + escapeHtml(log.timestamp) + '</td>' +
        '<td>' + escapeHtml(log.username) + '</td>' +
        '<td>' + escapeHtml(log.action) + '</td>' +
        '<td>' + (log.recordCount || 0) + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + escapeHtml(log.note || '') + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // OPEN DRIVE FOLDER
  // ═══════════════════════════════════════════════════════════════════════

  function openDriveFolder() {
    api.getSettings()
      .then(function(result) {
        if (result && result.status && result.settings) {
          var folderId = result.settings.drive_generated_folder ? result.settings.drive_generated_folder.value : '';
          if (folderId) {
            window.open('https://drive.google.com/drive/folders/' + folderId, '_blank');
          } else {
            showToast('ไม่พบ Folder ID', 'warning');
          }
        }
      });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════════════════════════════════════

  function formatDuration(seconds) {
    if (seconds < 60) return seconds + ' วินาที';
    var minutes = Math.floor(seconds / 60);
    var secs = seconds % 60;
    return minutes + ' นาที ' + secs + ' วินาที';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLEAR EXPORT HISTORY
  // ═══════════════════════════════════════════════════════════════════════

  function confirmClearExportHistory() {
    showConfirm(
      'ล้างประวัติ Export',
      'ต้องการล้างประวัติ Export ทั้งหมดหรือไม่?\nข้อมูลที่ลบจะไม่สามารถกู้คืนได้',
      function() {
        showLoading('กำลังล้างประวัติ...');
        api.clearExportHistory()
          .then(function(result) {
            hideLoading();
            if (result && result.status) {
              showToast('ล้างประวัติ Export สำเร็จ (' + result.deleted + ' รายการ)', 'success');
              document.getElementById('exportHistoryBody').innerHTML =
                '<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">ยังไม่มีประวัติ</td></tr>';
            } else {
              showToast(result ? result.message : 'เกิดข้อผิดพลาด', 'error');
            }
          })
          .catch(function(err) {
            hideLoading();
            showToast('ล้างประวัติไม่สำเร็จ: ' + err.message, 'error');
          });
      }
    );
  }