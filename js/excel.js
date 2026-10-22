/* excel.js — Export / Import ทุกตารางและทุกรายงาน (SheetJS) */
(function (HR) {
  'use strict';
  var X = function () { return window.XLSX; };

  function stamp() { return HR.today().replace(/-/g, ''); }
  function safeName(s) { return String(s).replace(/[\\\/\?\*\[\]:]/g, '-').slice(0, 31); }

  function cellValue(c, r) {
    var v = c.fmt ? c.fmt(r) : r[c.k];
    if (v instanceof Node) v = v.textContent;
    if (c.num) {
      var n = Number(c.raw ? c.raw(r) : (typeof v === 'string' ? v.replace(/,/g, '') : v));
      return isFinite(n) ? n : (v == null ? '' : String(v));
    }
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'ใช่' : 'ไม่';
    return v == null ? '' : v;
  }

  function aoaFrom(rows, cols) {
    var head = cols.map(function (c) { return c.l; });
    var body = (rows || []).map(function (r) { return cols.map(function (c) { return cellValue(c, r); }); });
    return [head].concat(body);
  }

  function widths(aoa) {
    if (!aoa.length) return [];
    return aoa[0].map(function (_, i) {
      var w = 8;
      aoa.forEach(function (row) {
        var t = String(row[i] == null ? '' : row[i]);
        w = Math.max(w, Math.min(42, t.length + 3));
      });
      return { wch: w };
    });
  }

  function sheetFromAOA(aoa) {
    var ws = X().utils.aoa_to_sheet(aoa);
    ws['!cols'] = widths(aoa);
    if (aoa.length) ws['!autofilter'] = { ref: X().utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, aoa.length - 1), c: aoa[0].length - 1 } }) };
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    return ws;
  }

  HR.excel = {
    ready: function () {
      if (!X()) { HR.toast('ยังโหลดไลบรารี Excel ไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วรีเฟรชหน้า', 'err'); return false; }
      if (!HR.env.canDownload) {
        HR.toast('เวอร์ชันออนไลน์ดาวน์โหลดไฟล์ไม่ได้ (ข้อจำกัดของตัวแสดงผล) — เปิดระบบจากเครื่องของคุณเพื่อ Export Excel', 'err');
        return false;
      }
      return true;
    },

    /** ส่งออกตารางเดียว */
    exportRows: function (rows, cols, name) {
      if (!this.ready()) return;
      var wb = X().utils.book_new();
      X().utils.book_append_sheet(wb, sheetFromAOA(aoaFrom(rows, cols)), safeName(name || 'Sheet1'));
      X().writeFile(wb, (name || 'export') + '_' + stamp() + '.xlsx');
      HR.toast('ส่งออก Excel แล้ว: ' + (rows || []).length + ' แถว');
    },

    /** ส่งออกหลายชีตในไฟล์เดียว: sheets = [{name, rows, cols}] หรือ [{name, aoa}] */
    exportWorkbook: function (sheets, filename) {
      if (!this.ready()) return;
      var wb = X().utils.book_new(), n = 0;
      sheets.forEach(function (sh) {
        if (!sh) return;
        var aoa = sh.aoa || aoaFrom(sh.rows, sh.cols);
        X().utils.book_append_sheet(wb, sheetFromAOA(aoa), safeName(sh.name));
        n += Math.max(0, aoa.length - 1);
      });
      X().writeFile(wb, (filename || 'hr_export') + '_' + stamp() + '.xlsx');
      HR.toast('ส่งออก ' + sheets.length + ' ชีต / ' + n + ' แถว');
    },

    /** ส่งออกตารางอิสระ (รายงานที่จัดรูปเอง) */
    exportAOA: function (aoa, sheetName, filename) {
      if (!this.ready()) return;
      var wb = X().utils.book_new();
      X().utils.book_append_sheet(wb, sheetFromAOA(aoa), safeName(sheetName || 'Report'));
      X().writeFile(wb, (filename || sheetName || 'report') + '_' + stamp() + '.xlsx');
      HR.toast('ส่งออกรายงานแล้ว');
    },

    /** ไฟล์ Text สำหรับส่งธนาคาร / ระบบภายนอก */
    exportText: function (text, filename) {
      var blob = new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
      HR.toast('สร้างไฟล์ ' + filename + ' แล้ว');
    },

    /** เปิดกล่องเลือกไฟล์ แล้วส่ง rows ที่แปลงเป็น object ตาม cols กลับไป */
    pickAndImport: function (cols, onRows) {
      if (!this.ready()) return;
      var input = document.getElementById('hiddenFile');
      input.value = '';
      input.onchange = function () {
        var f = input.files && input.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function (e) {
          try {
            var wb = X().read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var raw = X().utils.sheet_to_json(ws, { defval: '', raw: false });
            var byLabel = {};
            cols.forEach(function (c) { byLabel[String(c.l).trim()] = c; byLabel[c.k] = c; });
            var rows = raw.map(function (o) {
              var out = {};
              Object.keys(o).forEach(function (h) {
                var c = byLabel[String(h).trim()];
                if (!c || c.noImport) return;
                var v = o[h];
                if (c.num) { v = Number(String(v).replace(/,/g, '')); if (!isFinite(v)) v = null; }
                out[c.k] = v;
              });
              return out;
            }).filter(function (o) { return Object.keys(o).length; });
            HR.excel.previewImport(rows, cols, onRows);
          } catch (err) {
            HR.toast('อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'err');
          }
        };
        fr.readAsArrayBuffer(f);
      };
      input.click();
    },

    previewImport: function (rows, cols, onRows) {
      if (!rows.length) { HR.toast('ไม่พบข้อมูลในไฟล์ หรือหัวตารางไม่ตรงกับระบบ', 'err'); return; }
      var shown = cols.filter(function (c) { return !c.noImport; }).slice(0, 7);
      var body = HR.el('div.stack', [
        HR.el('div.callout', 'พบ ' + rows.length + ' แถว ระบบจับคู่คอลัมน์จากชื่อหัวตารางให้แล้ว ตรวจตัวอย่าง 5 แถวแรกก่อนยืนยัน'),
        HR.table({ cols: shown, rows: rows.slice(0, 5), search: false, exportName: false, pageSize: 5 })
      ]);
      HR.modal({
        title: 'ตรวจข้อมูลก่อนนำเข้า', size: 'wide', body: body,
        buttons: [
          { label: 'ยกเลิก' },
          { label: 'นำเข้า ' + rows.length + ' แถว', cls: 'btn-primary', fn: function () { onRows(rows); } }
        ]
      });
    },

    /** รายการชีตของทุกตารางในระบบ */
    allSheets: function () {
      return Object.keys(HR.schema).filter(function (k) { return !HR.schema[k].noExport; }).map(function (k) {
        var d = HR.schema[k];
        return { name: d.sheet || d.title, rows: HR.rows(k), cols: HR.exportCols(k) };
      });
    },

    exportAll: function () {
      var sheets = this.allSheets();
      sheets.push({ name: 'ตั้งค่าระบบ', aoa: [['คีย์', 'ค่า']].concat(Object.keys(HR.S()).map(function (k) { return [k, HR.S()[k]]; })) });
      this.exportWorkbook(sheets, 'HR_ทั้งระบบ');
    },

    /** สำรอง/กู้คืนข้อมูลทั้งก้อน (JSON ใน Excel 1 ชีต) */
    backup: function () {
      var json = JSON.stringify(HR.db.data);
      var chunks = json.match(/[\s\S]{1,30000}/g) || [''];
      this.exportAOA(
        [['HRMS_BACKUP_V1', new Date().toISOString()]].concat(chunks.map(function (c, i) { return ['chunk' + i, c]; })),
        'BACKUP', 'HR_สำรองข้อมูล'
      );
    },

    restore: function () {
      if (!this.ready()) return;
      var input = document.getElementById('hiddenFile');
      input.value = '';
      input.onchange = function () {
        var f = input.files && input.files[0]; if (!f) return;
        var fr = new FileReader();
        fr.onload = function (e) {
          try {
            var wb = X().read(new Uint8Array(e.target.result), { type: 'array' });
            var aoa = X().utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
            if (!aoa.length || String(aoa[0][0]) !== 'HRMS_BACKUP_V1') throw new Error('ไม่ใช่ไฟล์สำรองของระบบนี้');
            var json = aoa.slice(1).map(function (r) { return r[1]; }).join('');
            var data = JSON.parse(json);
            HR.db.data = data; HR.db.save();
            HR.toast('กู้คืนข้อมูลสำเร็จ');
            HR.buildNav(); HR.render();
          } catch (err) { HR.toast('กู้คืนไม่สำเร็จ: ' + err.message, 'err'); }
        };
        fr.readAsArrayBuffer(f);
      };
      input.click();
    }
  };
})(window.HR);
