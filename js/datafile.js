/* datafile.js — ใช้ไฟล์ Excel บนเครื่องเป็นฐานข้อมูลของระบบ
 *
 * เปิดไฟล์ .xlsx หนึ่งไฟล์เป็น "แฟ้มข้อมูล" แล้วบันทึกทับไฟล์เดิมได้โดยตรง (เหมือนโปรแกรมเดสก์ท็อป)
 * บนเบราว์เซอร์ที่ไม่รองรับการเขียนไฟล์ จะถอยไปใช้วิธีเปิดไฟล์ + ดาวน์โหลดไฟล์แทน
 * localStorage ยังทำงานเป็นสำเนากันลืมบันทึกเสมอ
 */
(function (HR) {
  'use strict';

  var SHEET_META = '_ระบบ';
  var SHEET_SETTINGS = '_ตั้งค่า';
  var COL_ID = 'id';
  var COL_EXTRA = '_ข้อมูลเพิ่มเติม';
  var IDB_NAME = 'hrms-file', IDB_STORE = 'handles', IDB_KEY = 'current';

  var F = HR.file = {
    supported: HR.env.canUseFiles && typeof window.showOpenFilePicker === 'function',
    handle: null,
    name: null,
    dirty: false,
    savedAt: null,
    busy: false,
    needsPermission: false
  };

  /* ---------------- จำไฟล์ล่าสุดไว้ใน IndexedDB ---------------- */
  function idb() {
    return new Promise(function (res, rej) {
      var rq = indexedDB.open(IDB_NAME, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore(IDB_STORE); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  function idbPut(val) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(val, IDB_KEY);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    }).catch(function () {});
  }
  function idbGet() {
    return idb().then(function (db) {
      return new Promise(function (res) {
        var tx = db.transaction(IDB_STORE, 'readonly');
        var rq = tx.objectStore(IDB_STORE).get(IDB_KEY);
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { res(null); };
      });
    }).catch(function () { return null; });
  }
  function idbClear() {
    return idb().then(function (db) {
      var tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_KEY);
    }).catch(function () {});
  }

  /* ---------------- แปลงข้อมูลเป็นสมุดงาน Excel ---------------- */
  function fieldsOf(name) {
    return HR.schema[name].fields.filter(function (f) { return f.t !== 'section'; });
  }

  function serialize() {
    var X = window.XLSX;
    var wb = X.utils.book_new();
    var map = [['ตาราง', 'ชื่อชีต', 'จำนวนแถว']];

    Object.keys(HR.schema).forEach(function (name) {
      var d = HR.schema[name], fields = fieldsOf(name);
      var sheet = (d.sheet || d.title).slice(0, 31);
      var header = [COL_ID].concat(fields.map(function (f) { return f.l; }), [COL_EXTRA]);
      var known = {};
      fields.forEach(function (f) { known[f.k] = true; });

      var aoa = [header];
      HR.db.t(name).forEach(function (row) {
        var line = [row.id];
        fields.forEach(function (f) {
          var v = row[f.k];
          if (v == null) { line.push(''); return; }
          if (Array.isArray(v)) { line.push(v.join(', ')); return; }
          line.push(v);
        });
        var extra = {};
        Object.keys(row).forEach(function (k) {
          if (known[k] || k === 'id' || k === '_created' || k === '_updated') return;
          if (row[k] === undefined) return;
          extra[k] = row[k];
        });
        line.push(Object.keys(extra).length ? JSON.stringify(extra) : '');
        aoa.push(line);
      });

      var ws = X.utils.aoa_to_sheet(aoa);
      ws['!cols'] = header.map(function (h, i) {
        return { wch: i === 0 ? 20 : Math.min(34, Math.max(10, String(h).length + 4)) };
      });
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      X.utils.book_append_sheet(wb, ws, sheet);
      map.push([name, sheet, HR.db.t(name).length]);
    });

    var s = HR.db.data.settings || {};
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(
      [['คีย์', 'ค่า']].concat(Object.keys(s).map(function (k) { return [k, s[k]]; }))
    ), SHEET_SETTINGS);

    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(
      [['ระบบ HR ครบวงจร — แฟ้มข้อมูล'],
       ['รูปแบบไฟล์', 'HRMS_DATA_V1'],
       ['บันทึกเมื่อ', new Date().toLocaleString('th-TH')],
       ['คำเตือน', 'คอลัมน์ id ใช้เชื่อมโยงข้อมูลระหว่างชีต ห้ามแก้หรือลบ'],
       []].concat(map)
    ), SHEET_META);

    return wb;
  }

  /* ---------------- อ่านสมุดงานกลับเป็นข้อมูล ---------------- */
  function cellToValue(f, v) {
    if (v == null || v === '') return f.t === 'bool' ? false : null;
    if (f.t === 'date' || f.t === 'month' || f.t === 'time') {
      if (v instanceof Date) {
        if (f.t === 'time') return String(v.getHours()).padStart(2, '0') + ':' + String(v.getMinutes()).padStart(2, '0');
        var iso = HR.isoOf(v);
        return f.t === 'month' ? iso.slice(0, 7) : iso;
      }
      return String(v).trim();
    }
    if (f.t === 'money' || f.t === 'number' || f.t === 'percent') {
      var n = Number(String(v).replace(/,/g, ''));
      return isFinite(n) ? n : null;
    }
    if (f.t === 'bool') {
      if (typeof v === 'boolean') return v;
      var s = String(v).trim().toLowerCase();
      return s === 'true' || s === '1' || s === 'ใช่' || s === 'yes';
    }
    if (f.t === 'multi') return String(v).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    return typeof v === 'string' ? v.trim() : v;
  }

  function deserialize(wb) {
    var X = window.XLSX;
    var data = {};
    Object.keys(HR.schema).forEach(function (k) { data[k] = []; });

    /* หาชื่อชีตของแต่ละตารางจากชีต _ระบบ ถ้าไม่มีก็เดาจากชื่อมาตรฐาน */
    var sheetOf = {};
    if (wb.Sheets[SHEET_META]) {
      X.utils.sheet_to_json(wb.Sheets[SHEET_META], { header: 1, defval: '' }).forEach(function (r) {
        if (r[0] && r[1] && HR.schema[r[0]]) sheetOf[r[0]] = r[1];
      });
    }

    var missing = [];
    Object.keys(HR.schema).forEach(function (name) {
      var d = HR.schema[name];
      var sheet = sheetOf[name] || (d.sheet || d.title).slice(0, 31);
      var ws = wb.Sheets[sheet];
      if (!ws) { missing.push(d.title); return; }

      var aoa = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      if (!aoa.length) return;
      var header = aoa[0].map(function (h) { return String(h).trim(); });
      var byLabel = {};
      fieldsOf(name).forEach(function (f) { byLabel[f.l] = f; });

      aoa.slice(1).forEach(function (line) {
        if (!line || line.every(function (c) { return c === '' || c == null; })) return;
        var row = {};
        header.forEach(function (h, i) {
          var v = line[i];
          if (h === COL_ID) { if (v) row.id = String(v); return; }
          if (h === COL_EXTRA) {
            if (v) { try { Object.assign(row, JSON.parse(v)); } catch (e) {} }
            return;
          }
          var f = byLabel[h];
          if (!f) return;
          var val = cellToValue(f, v);
          if (val !== null) row[f.k] = val;
        });
        if (!row.id) row.id = HR.uid(name.slice(0, 3));
        data[name].push(row);
      });
    });

    data.settings = HR.defaultSettings();
    if (wb.Sheets[SHEET_SETTINGS]) {
      X.utils.sheet_to_json(wb.Sheets[SHEET_SETTINGS], { header: 1, raw: true, defval: '' }).slice(1)
        .forEach(function (r) {
          if (!r[0]) return;
          var k = String(r[0]).trim(), v = r[1];
          if (k in data.settings && typeof data.settings[k] === 'number') v = Number(v);
          data.settings[k] = v;
        });
    }
    return { data: data, missing: missing };
  }

  F.toWorkbook = serialize;
  F.fromWorkbook = deserialize;

  /* ---------------- สถานะไฟล์ ---------------- */
  var saveTimer = null;
  F.markDirty = function () {
    if (!F.name && !F.handle) return;        /* ยังไม่ได้ผูกกับไฟล์ */
    F.dirty = true;
    HR.fileStatus && HR.fileStatus();
    if (F.supported && F.handle && HR.db.data.settings && HR.db.data.settings.autoSaveFile !== false) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { F.save(true); }, 1500);
    }
  };

  /* ---------------- เปิด / บันทึก ---------------- */
  var PICKER = {
    types: [{ description: 'แฟ้มข้อมูลระบบ HR (Excel)', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }]
  };

  function applyWorkbook(wb, label) {
    var out = deserialize(wb);
    var counts = Object.keys(HR.schema).reduce(function (a, k) { return a + out.data[k].length; }, 0);
    if (!counts && out.missing.length === Object.keys(HR.schema).length) {
      throw new Error('ไฟล์นี้ไม่ใช่แฟ้มข้อมูลของระบบ (ไม่พบชีตข้อมูล)');
    }
    HR.db.data = out.data;
    HR.db.save();
    F.dirty = false;
    F.savedAt = new Date();
    HR.ctx.companyId = '';
    HR.buildNav(); HR.buildTopbar();
    HR.go('dashboard'); HR.render();
    HR.toast('เปิดแฟ้มข้อมูล ' + label + ' แล้ว · ' + counts + ' ระเบียน' +
      (out.missing.length ? ' (ไม่พบชีต: ' + out.missing.slice(0, 3).join(', ') + (out.missing.length > 3 ? ' และอื่น ๆ' : '') + ')' : ''));
  }

  F.open = function () {
    if (!HR.excel.ready()) return;
    if (!F.supported) return openFallback();
    return window.showOpenFilePicker(PICKER).then(function (handles) {
      var h = handles[0];
      return h.getFile().then(function (file) { return file.arrayBuffer(); }).then(function (buf) {
        applyWorkbook(window.XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true }), h.name);
        F.handle = h; F.name = h.name; F.needsPermission = false;
        idbPut({ handle: h, name: h.name });
        HR.fileStatus && HR.fileStatus();
      });
    }).catch(function (e) {
      if (e && e.name === 'AbortError') return;
      HR.toast('เปิดไฟล์ไม่สำเร็จ: ' + e.message, 'err');
    });
  };

  function openFallback() {
    var input = document.getElementById('hiddenFile');
    input.value = '';
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function (e) {
        try {
          applyWorkbook(window.XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true }), f.name);
          F.name = f.name; F.handle = null;
          HR.fileStatus && HR.fileStatus();
        } catch (err) { HR.toast('เปิดไฟล์ไม่สำเร็จ: ' + err.message, 'err'); }
      };
      fr.readAsArrayBuffer(f);
    };
    input.click();
  }

  F.save = function (silent) {
    if (!HR.excel.ready()) return Promise.resolve();
    if (!F.supported || !F.handle) return F.saveAs();
    if (F.busy) return Promise.resolve();
    F.busy = true;
    HR.fileStatus && HR.fileStatus('saving');
    return F.handle.queryPermission({ mode: 'readwrite' }).then(function (p) {
      if (p === 'granted') return true;
      return F.handle.requestPermission({ mode: 'readwrite' }).then(function (p2) { return p2 === 'granted'; });
    }).then(function (ok) {
      if (!ok) throw new Error('ไม่ได้รับอนุญาตให้เขียนไฟล์');
      var buf = window.XLSX.write(serialize(), { bookType: 'xlsx', type: 'array' });
      return F.handle.createWritable().then(function (w) {
        return w.write(new Blob([buf])).then(function () { return w.close(); });
      });
    }).then(function () {
      F.busy = false; F.dirty = false; F.savedAt = new Date();
      HR.fileStatus && HR.fileStatus();
      if (!silent) HR.toast('บันทึกลงไฟล์ ' + F.name + ' แล้ว');
    }).catch(function (e) {
      F.busy = false;
      HR.fileStatus && HR.fileStatus('error');
      HR.toast('บันทึกไฟล์ไม่สำเร็จ: ' + e.message + ' — ข้อมูลยังอยู่ในเบราว์เซอร์', 'err');
    });
  };

  F.saveAs = function () {
    if (!HR.excel.ready()) return Promise.resolve();
    var suggested = 'ข้อมูลHR_' + HR.today().replace(/-/g, '') + '.xlsx';
    if (!F.supported) {
      window.XLSX.writeFile(serialize(), suggested);
      F.name = suggested; F.dirty = false; F.savedAt = new Date();
      HR.fileStatus && HR.fileStatus();
      HR.toast('ดาวน์โหลดแฟ้มข้อมูลแล้ว — ครั้งต่อไปกด "เปิดแฟ้มข้อมูล" เลือกไฟล์นี้เพื่อทำงานต่อ');
      return Promise.resolve();
    }
    return window.showSaveFilePicker(Object.assign({ suggestedName: F.name || suggested }, PICKER))
      .then(function (h) {
        F.handle = h; F.name = h.name;
        idbPut({ handle: h, name: h.name });
        return F.save();
      })
      .catch(function (e) {
        if (e && e.name === 'AbortError') return;
        HR.toast('บันทึกไฟล์ไม่สำเร็จ: ' + e.message, 'err');
      });
  };

  F.detach = function () {
    F.handle = null; F.name = null; F.dirty = false; F.needsPermission = false;
    idbClear();
    HR.fileStatus && HR.fileStatus();
    HR.toast('เลิกเชื่อมกับไฟล์แล้ว — ข้อมูลยังอยู่ในเบราว์เซอร์');
  };

  /* ---------------- เชื่อมไฟล์ล่าสุดตอนเปิดระบบ ---------------- */
  F.restore = function () {
    if (!F.supported) return Promise.resolve(false);
    return idbGet().then(function (rec) {
      if (!rec || !rec.handle) return false;
      F.name = rec.name;
      return rec.handle.queryPermission({ mode: 'readwrite' }).then(function (p) {
        F.handle = rec.handle;
        if (p === 'granted') return F.reload(true);
        F.needsPermission = true;      /* ต้องให้ผู้ใช้กดปุ่มก่อนถึงขออนุญาตได้ */
        return false;
      });
    }).catch(function () { return false; });
  };

  /** อ่านไฟล์ที่ผูกอยู่ใหม่ทั้งหมด */
  F.reload = function (silent) {
    if (!F.handle) return Promise.resolve(false);
    return F.handle.getFile()
      .then(function (file) { return file.arrayBuffer(); })
      .then(function (buf) {
        applyWorkbook(window.XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true }), F.name);
        F.needsPermission = false;
        HR.fileStatus && HR.fileStatus();
        return true;
      })
      .catch(function (e) {
        if (!silent) HR.toast('อ่านไฟล์ไม่สำเร็จ: ' + e.message, 'err');
        return false;
      });
  };

  /** ผู้ใช้กดปุ่ม "เชื่อมไฟล์ล่าสุด" — ขออนุญาตแล้วโหลด */
  F.reconnect = function () {
    if (!F.handle) return F.open();
    return F.handle.requestPermission({ mode: 'readwrite' }).then(function (p) {
      if (p !== 'granted') { HR.toast('ยังไม่ได้รับอนุญาตให้เข้าถึงไฟล์', 'err'); return false; }
      return F.reload();
    });
  };

  F.statusText = function () {
    if (!F.name) return 'ยังไม่ได้ผูกกับไฟล์';
    if (F.needsPermission) return F.name + ' · รอยืนยันสิทธิ์';
    if (F.busy) return F.name + ' · กำลังบันทึก…';
    if (F.dirty) return F.name + ' · ยังไม่ได้บันทึก';
    return F.name + ' · บันทึกแล้ว' + (F.savedAt ? ' ' + F.savedAt.toLocaleTimeString('th-TH').slice(0, 5) : '');
  };
})(window.HR);
