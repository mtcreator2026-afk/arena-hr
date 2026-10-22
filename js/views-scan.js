/* views-scan.js — นำเข้าข้อมูลจากเครื่องสแกนใบหน้า
 *
 * รับไฟล์ที่ export จากเครื่องสแกน (CSV ภาษาไทย TIS-620/UTF-8 หรือ Excel) ซึ่งเป็น
 * "การสแกนดิบ" หนึ่งแถวต่อหนึ่งครั้งที่สแกน แล้ว:
 *   1. จับคู่รหัสในเครื่องสแกนกับพนักงาน (จำไว้ที่ฟิลด์ scanId ของพนักงาน)
 *   2. รวมการสแกนเป็นรายวัน: สแกนแรก = เข้างาน, สแกนสุดท้าย = ออกงาน
 *   3. เทียบกับกะของวันนั้น (ตารางกะ → รูปแบบวันหยุด → กะประจำ) คำนวณสาย/ออกก่อน/OT
 *   4. ให้ HR ตรวจก่อน แล้วจึงบันทึกลงตาราง attendance
 */
(function (HR) {
  'use strict';
  var el = HR.el;
  var DUP_MINUTES = 2;               /* สแกนซ้ำภายใน 2 นาทีถือเป็นครั้งเดียว */
  var TIME_RE = /^\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\s+(\d{1,2}):(\d{2})/;

  function pad(n) { return String(n).padStart(2, '0'); }
  function hm(min) { return min == null ? '' : pad(Math.floor(min / 60)) + ':' + pad(min % 60); }

  /* ---------- อ่านไฟล์ ---------- */

  /** ถอดรหัสข้อความ: ลอง UTF-8 ก่อน ถ้าไม่ใช่ใช้ภาษาไทยของ Windows (TIS-620) */
  function decode(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-874').decode(buf); }
  }

  function readRows(file) {
    return file.arrayBuffer().then(function (buf) {
      var wb = /\.xlsx?$/i.test(file.name)
        ? XLSX.read(buf, { type: 'array', cellDates: false })
        : XLSX.read(decode(buf), { type: 'string', raw: true });
      var ws = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
        .map(function (r) { return r.map(function (v) { return String(v == null ? '' : v).trim(); }); });
    });
  }

  /** หาคอลัมน์เวลา รหัส และชื่อ จากลักษณะข้อมูล (หัวตารางของเครื่องมักอ่านไม่ออก) */
  function detectColumns(rows) {
    var body = rows.filter(function (r) { return r.some(function (v) { return TIME_RE.test(v); }); });
    if (!body.length) return null;
    var width = Math.max.apply(null, body.map(function (r) { return r.length; }));
    var stat = [];
    for (var c = 0; c < width; c++) {
      var vals = body.map(function (r) { return r[c] || ''; });
      var filled = vals.filter(Boolean);
      var distinct = {}; filled.forEach(function (v) { distinct[v] = 1; });
      stat.push({
        c: c,
        time: vals.filter(function (v) { return TIME_RE.test(v); }).length,
        filled: filled.length,
        distinct: Object.keys(distinct).length,
        digits: filled.filter(function (v) { return /^\d+$/.test(v); }).length
      });
    }
    var timeCol = stat.slice().sort(function (a, b) { return b.time - a.time; })[0].c;
    var cand = stat.filter(function (s) { return s.c !== timeCol && s.distinct > 1 && s.filled >= body.length * 0.9; });
    var idCol = cand.filter(function (s) { return s.digits === s.filled; })
      .sort(function (a, b) { return b.distinct - a.distinct; })[0];
    var nameCol = cand.filter(function (s) { return !idCol || s.c !== idCol.c; })
      .sort(function (a, b) { return (a.digits / a.filled) - (b.digits / b.filled) || b.distinct - a.distinct; })[0];
    if (!idCol && nameCol) { idCol = nameCol; }
    if (!idCol) return null;
    return { time: timeCol, id: idCol.c, name: nameCol ? nameCol.c : idCol.c, body: body };
  }

  function parsePunches(rows) {
    var cols = detectColumns(rows);
    if (!cols) throw new Error('ไม่พบคอลัมน์วันเวลาในไฟล์ (รูปแบบที่รองรับ เช่น 21/09/2026 08:55)');
    var people = {}, bad = 0, minD = null, maxD = null;
    cols.body.forEach(function (r) {
      var m = TIME_RE.exec(r[cols.time] || '');
      var id = r[cols.id];
      if (!m || !id) { bad++; return; }
      var y = Number(m[3]); if (y > 2400) y -= 543;   /* ปี พ.ศ. */
      var date = y + '-' + pad(m[2]) + '-' + pad(m[1]);
      var min = Number(m[4]) * 60 + Number(m[5]);
      var p = people[id] || (people[id] = { id: id, name: r[cols.name] || id, days: {}, count: 0 });
      (p.days[date] || (p.days[date] = [])).push(min);
      p.count++;
      if (!minD || date < minD) minD = date;
      if (!maxD || date > maxD) maxD = date;
    });
    Object.keys(people).forEach(function (k) {
      var p = people[k];
      Object.keys(p.days).forEach(function (d) {
        var t = p.days[d].sort(function (a, b) { return a - b; }), out = [];
        t.forEach(function (x) { if (!out.length || x - out[out.length - 1] > DUP_MINUTES) out.push(x); });
        p.days[d] = out;
      });
    });
    return { people: people, from: minD, to: maxD, total: cols.body.length - bad, bad: bad };
  }

  /* ---------- เทียบกับกะและสร้างรายการบันทึกเวลา ---------- */

  function buildPlan(parsed, mapping, opt) {
    var roster = {}, att = {};
    HR.db.t('roster').forEach(function (r) { roster[r.employeeId + '|' + r.date] = r.shiftId; });
    HR.db.t('attendance').forEach(function (r) { att[r.employeeId + '|' + r.date] = r; });
    var leaves = HR.db.t('leaves').filter(function (l) { return l.status === 'อนุมัติ'; });
    var grace = HR.S().shiftGraceMinutes || 0;
    var lastFull = parsed.to;                  /* วันสุดท้ายของไฟล์มักไม่ครบวัน ไม่ใช้ตัดสินขาดงาน */
    var today = HR.today();

    function shiftFor(emp, date) {
      var sid = roster[emp.id + '|' + date];
      if (sid) return { shift: HR.db.byId('shifts', sid), from: 'ตารางกะ' };
      var prev = att[emp.id + '|' + date];
      if (prev && prev.shiftId) return { shift: HR.db.byId('shifts', prev.shiftId), from: 'บันทึกเวลาเดิม' };
      if (HR.engine.isOffDay(emp, date)) return { shift: null, off: true, from: 'วันหยุดประจำสัปดาห์' };
      return { shift: emp.defaultShiftId ? HR.db.byId('shifts', emp.defaultShiftId) : null, from: 'กะประจำ' };
    }
    function onLeave(empId, date) {
      return leaves.some(function (l) { return l.employeeId === empId && l.dateFrom <= date && (l.dateTo || l.dateFrom) >= date; });
    }

    var out = [];
    Object.keys(mapping).forEach(function (scanId) {
      var emp = HR.db.byId('employees', mapping[scanId]);
      var p = parsed.people[scanId];
      if (!emp || !p) return;

      var d = parsed.from;
      while (d <= parsed.to) {
        var times = p.days[d];
        var sf = shiftFor(emp, d), s = sf.shift;
        var off = sf.off || (s && !HR.isWorkShift(s));
        var start = s ? HR.minutes(s.startTime) : null, end = s ? HR.minutes(s.endTime) : null;
        var flags = [];
        var row = {
          employeeId: emp.id, code: emp.code, name: emp.firstName + ' ' + emp.lastName,
          date: d, shiftId: s ? s.id : '', shiftName: s ? (s.code + ' ' + (s.name || '')) : (sf.off ? 'วันหยุด' : '-'),
          clockIn: '', clockOut: '', lateMinutes: 0, earlyLeaveMinutes: 0, otHours: 0, otType: '',
          status: 'ปกติ', scans: times ? times.length : 0, flags: flags
        };

        if (times && times.length) {
          var inT = times[0], outT = times.length > 1 ? times[times.length - 1] : null;
          if (times.length === 1) {
            flags.push('สแกนครั้งเดียว');
            if (start != null && end != null && inT > (start + end) / 2) { outT = inT; inT = null; }
          }
          row.clockIn = hm(inT); row.clockOut = hm(outT);
          if (off) {
            flags.push(s && s.kind === 'ลา' ? 'มีสแกนในวันลา' : 'มาทำงานวันหยุด');
          } else {
            if (start != null && inT != null) row.lateMinutes = Math.max(0, inT - start);
            if (end != null && outT != null) {
              row.earlyLeaveMinutes = Math.max(0, end - outT);
              var ot = Math.floor(Math.max(0, outT - end) / 30) / 2;
              if (ot >= 0.5) { row.otHours = ot; row.otType = 'OT วันทำงาน'; }
            }
            if (!s) flags.push('ไม่พบกะของวันนี้');
            else if (start == null) flags.push('กะไม่มีเวลาเข้า-ออก');
            if (row.lateMinutes > grace) row.status = 'มาสาย';
            if (row.earlyLeaveMinutes > 0) flags.push('ออกก่อนเวลา');
          }
          row.note = 'สแกนใบหน้า ' + times.length + ' ครั้ง: ' + times.map(hm).join(', ');
        } else {
          /* ไม่มีการสแกน: บันทึกเป็นขาดงานเฉพาะวันที่ต้องสแกนและไม่ได้ลา */
          var mustScan = s && s.kind === 'ทำงาน' && s.requireScan !== false && !off;
          if (!opt.absent || !mustScan || d >= lastFull || d > today) { d = HR.addDays(d, 1); continue; }
          if (onLeave(emp.id, d)) { d = HR.addDays(d, 1); continue; }
          row.status = 'ขาดงาน';
          flags.push('ไม่มีการสแกน');
          row.note = 'ไม่พบการสแกนในวันที่มีกะทำงาน';
        }
        if (flags.length && row.scans) row.note += ' · ' + flags.join(', ');

        var exist = att[emp.id + '|' + d];
        row.existId = exist ? exist.id : null;
        row.action = exist ? (opt.replace ? 'แทนที่' : 'ข้าม') : 'เพิ่ม';
        out.push(row);
        d = HR.addDays(d, 1);
      }
    });
    return out.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.code).localeCompare(String(b.code));
    });
  }

  /* ---------- หน้าจอ ---------- */
  HR.view('scanImport', {
    title: 'นำเข้าข้อมูลเครื่องสแกน',
    render: function () {
      var state = { parsed: null, mapping: {}, file: '' };
      var fileIn = el('input', { type: 'file', accept: '.csv,.xlsx,.xls', hidden: true });
      var replace = el('input', { type: 'checkbox' });
      var absent = el('input', { type: 'checkbox', checked: true });
      var onlyIssues = el('input', { type: 'checkbox' });
      var info = el('div');
      var mapBox = el('div');
      var preview = el('div');

      var emps = HR.rows('employees').slice().sort(function (a, b) { return String(a.code || '').localeCompare(String(b.code || '')); });

      fileIn.addEventListener('change', function () {
        var f = fileIn.files && fileIn.files[0];
        if (!f) return;
        HR.clear(info).appendChild(el('div.dim', 'กำลังอ่านไฟล์…'));
        readRows(f).then(function (rows) {
          var parsed = parsePunches(rows);
          state.parsed = parsed; state.file = f.name; state.mapping = {};
          Object.keys(parsed.people).forEach(function (id) {
            var e = emps.filter(function (x) { return String(x.scanId || '') === id; })[0];
            if (e) state.mapping[id] = e.id;
          });
          drawAll();
        }).catch(function (e) {
          HR.clear(info).appendChild(el('div.callout.warn', 'อ่านไฟล์ไม่ได้: ' + (e.message || e)));
        });
        fileIn.value = '';
      });
      [replace, absent, onlyIssues].forEach(function (x) { x.addEventListener('change', drawPreview); });

      function drawAll() {
        var p = state.parsed;
        var ids = Object.keys(p.people);
        HR.clear(info).appendChild(el('div.grid.cols-4', [
          HR.kpi('ไฟล์', state.file.length > 22 ? state.file.slice(0, 20) + '…' : state.file, '', HR.dateTH(p.from) + ' – ' + HR.dateTH(p.to)),
          HR.kpi('การสแกนทั้งหมด', p.total, 'ครั้ง', p.bad ? 'อ่านไม่ได้ ' + p.bad + ' แถว' : null),
          HR.kpi('คนในเครื่องสแกน', ids.length, 'คน'),
          HR.kpi('จับคู่แล้ว', Object.keys(state.mapping).length, '/' + ids.length + ' คน')
        ]));
        drawMapping();
        drawPreview();
      }

      function drawMapping() {
        var p = state.parsed;
        var rows = Object.keys(p.people).map(function (id) { return p.people[id]; })
          .sort(function (a, b) { return b.count - a.count; });
        var used = {};
        Object.keys(state.mapping).forEach(function (k) { used[state.mapping[k]] = k; });
        HR.clear(mapBox).appendChild(HR.card('1. จับคู่คนในเครื่องสแกนกับพนักงาน',
          'ระบบจำการจับคู่ไว้ที่ข้อมูลพนักงาน ครั้งหน้าจับคู่ให้อัตโนมัติ · คนที่ไม่ได้เลือกจะไม่ถูกนำเข้า',
          HR.table({
            cols: [
              { k: 'id', l: 'รหัสในเครื่อง', w: 110 },
              { k: 'name', l: 'ชื่อในเครื่อง' },
              { k: 'count', l: 'สแกน (ครั้ง)', num: 1, dec: 0 },
              { k: 'days', l: 'วันที่มีสแกน', num: 1, dec: 0, fmt: function (r) { return Object.keys(r.days).length; } },
              {
                k: 'emp', l: 'พนักงานในระบบ', nosort: 1, fmt: function (r) {
                  var sel = el('select', { style: 'min-width:220px' }, [el('option', { value: '' }, '— ไม่นำเข้า —')].concat(emps.map(function (e) {
                    var taken = used[e.id] && used[e.id] !== r.id;
                    return el('option', { value: e.id, selected: state.mapping[r.id] === e.id, disabled: taken },
                      (e.code ? e.code + ' · ' : '') + e.firstName + ' ' + e.lastName + (taken ? ' (จับคู่แล้ว)' : ''));
                  })));
                  sel.addEventListener('change', function () {
                    if (sel.value) state.mapping[r.id] = sel.value; else delete state.mapping[r.id];
                    drawAll();
                  });
                  return sel;
                }
              }
            ],
            rows: rows, pageSize: 50, exportName: false, search: false
          })));
      }

      function drawPreview() {
        if (!state.parsed) return;
        var plan = buildPlan(state.parsed, state.mapping, { replace: replace.checked, absent: absent.checked });
        var shown = onlyIssues.checked ? plan.filter(function (r) { return r.status !== 'ปกติ' || r.flags.length; }) : plan;
        var todo = plan.filter(function (r) { return r.action !== 'ข้าม'; });
        var kind = function (r) { return r.status === 'ขาดงาน' ? 'danger' : r.status === 'มาสาย' ? 'warn' : 'ok'; };
        HR.clear(preview);
        if (!Object.keys(state.mapping).length) {
          preview.appendChild(el('div.callout', 'เลือกพนักงานในข้อ 1 อย่างน้อย 1 คน แล้วระบบจะแสดงผลตรวจสอบที่นี่'));
          return;
        }
        /* คนที่ไม่มีกะ คำนวณสาย/ขาดงานไม่ได้ ต้องบอก HR ให้ชัดว่าแก้ที่ไหน */
        var noShift = {};
        plan.forEach(function (r) { if (r.flags.indexOf('ไม่พบกะของวันนี้') > -1) noShift[r.code + ' ' + r.name] = (noShift[r.code + ' ' + r.name] || 0) + 1; });
        var noShiftList = Object.keys(noShift);
        preview.appendChild(HR.card('2. ตรวจสอบก่อนบันทึก', 'สแกนแรกของวัน = เข้างาน · สแกนสุดท้าย = ออกงาน · เทียบกับกะของวันนั้น', el('div.stack', [
          noShiftList.length ? el('div.callout.warn', [
            el('b', noShiftList.length + ' คนยังไม่มีกะในบางวัน จึงคำนวณมาสาย/ขาดงานของวันนั้นไม่ได้: '),
            noShiftList.map(function (k) { return k + ' (' + noShift[k] + ' วัน)'; }).join(', '),
            el('br'),
            'แก้ได้โดยตั้ง "กะประจำ" ที่หน้า ',
            el('a', { href: '#workPatterns' }, 'รูปแบบการทำงานรายบุคคล'),
            ' หรือลง ',
            el('a', { href: '#roster' }, 'ตารางกะรายเดือน'),
            ' แล้วกลับมานำเข้าไฟล์นี้ใหม่ (ยังบันทึกเวลาเข้า-ออกไปก่อนได้)'
          ]) : null,
          el('div.grid.cols-4', [
            HR.kpi('วันทำงานที่พบ', plan.filter(function (r) { return r.scans; }).length, 'วัน'),
            HR.kpi('มาสาย', plan.filter(function (r) { return r.status === 'มาสาย'; }).length, 'วัน',
              'เกินผ่อนผัน ' + (HR.S().shiftGraceMinutes || 0) + ' นาที'),
            HR.kpi('ขาดงาน', plan.filter(function (r) { return r.status === 'ขาดงาน'; }).length, 'วัน', null,
              plan.some(function (r) { return r.status === 'ขาดงาน'; }) ? 'warnbar' : ''),
            HR.kpi('ต้องตรวจสอบ', plan.filter(function (r) { return r.flags.length; }).length, 'วัน', 'สแกนครั้งเดียว ฯลฯ',
              plan.some(function (r) { return r.flags.length; }) ? 'warnbar' : '')
          ]),
          el('div', { style: 'display:flex;gap:18px;flex-wrap:wrap' }, [
            el('label', [absent, ' บันทึกวันขาดงาน (มีกะทำงานแต่ไม่มีการสแกน และไม่ได้ลา)']),
            el('label', [replace, ' แทนที่ข้อมูลเดิมของวันเดียวกัน']),
            el('label', [onlyIssues, ' แสดงเฉพาะรายการที่ต้องตรวจ'])
          ]),
          HR.table({
            cols: [
              { k: 'date', l: 'วันที่', fmt: function (r) { return HR.date(r.date); } },
              { k: 'code', l: 'รหัส', w: 70 },
              { k: 'name', l: 'ชื่อ-นามสกุล' },
              { k: 'shiftName', l: 'กะ' },
              { k: 'clockIn', l: 'เข้า' },
              { k: 'clockOut', l: 'ออก' },
              { k: 'lateMinutes', l: 'สาย (นาที)', num: 1, dec: 0 },
              { k: 'earlyLeaveMinutes', l: 'ออกก่อน (นาที)', num: 1, dec: 0 },
              { k: 'otHours', l: 'OT (ชม.)', num: 1, dec: 1 },
              { k: 'status', l: 'สถานะ', badge: kind },
              { k: 'flags', l: 'ต้องตรวจ', fmt: function (r) { return r.flags.join(', '); } },
              { k: 'action', l: 'การบันทึก', badge: function (r) { return r.action === 'ข้าม' ? '' : r.action === 'แทนที่' ? 'warn' : 'info'; } }
            ],
            rows: shown, pageSize: 50, exportName: 'ตรวจสอบนำเข้าสแกน_' + state.parsed.from + '_' + state.parsed.to,
            footerSum: ['lateMinutes', 'earlyLeaveMinutes', 'otHours'],
            empty: { title: 'ไม่มีรายการที่ต้องตรวจ', hint: 'ทุกวันปกติ' }
          }),
          el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
            HR.btn('บันทึก ' + todo.length + ' รายการลงบันทึกเวลา', function () { commit(plan); }, 'btn-primary'),
            plan.length - todo.length ? el('span.dim', 'ข้าม ' + (plan.length - todo.length) + ' วันที่มีข้อมูลอยู่แล้ว (ติ๊ก "แทนที่ข้อมูลเดิม" ถ้าต้องการใช้ข้อมูลสแกนแทน)') : null
          ])
        ])));
      }

      function commit(plan) {
        var todo = plan.filter(function (r) { return r.action !== 'ข้าม'; });
        if (!todo.length) { HR.toast('ไม่มีรายการที่ต้องบันทึก', 'err'); return; }
        HR.modal({
          title: 'ยืนยันการนำเข้า', size: 'narrow',
          body: el('div.stack', [
            el('p', 'บันทึก ' + todo.length + ' รายการลงบันทึกเวลาเข้า-ออกงาน'),
            el('ul', [
              el('li', 'เพิ่มใหม่ ' + todo.filter(function (r) { return r.action === 'เพิ่ม'; }).length + ' รายการ'),
              el('li', 'แทนที่ของเดิม ' + todo.filter(function (r) { return r.action === 'แทนที่'; }).length + ' รายการ'),
              el('li', 'ขาดงาน ' + todo.filter(function (r) { return r.status === 'ขาดงาน'; }).length + ' รายการ')
            ])
          ]),
          buttons: [{ label: 'ยกเลิก' }, {
            label: 'บันทึก', cls: 'btn-primary', fn: function () {
              todo.forEach(function (r) {
                var rec = {
                  employeeId: r.employeeId, date: r.date, shiftId: r.shiftId, clockIn: r.clockIn, clockOut: r.clockOut,
                  method: 'สแกนใบหน้า', location: '', lateMinutes: r.lateMinutes, earlyLeaveMinutes: r.earlyLeaveMinutes,
                  otHours: r.otHours, otType: r.otType, status: r.status, note: r.note
                };
                if (r.existId) HR.db.update('attendance', r.existId, rec); else HR.db.insert('attendance', rec);
              });
              Object.keys(state.mapping).forEach(function (scanId) {
                var e = HR.db.byId('employees', state.mapping[scanId]);
                if (e && String(e.scanId || '') !== scanId) HR.db.update('employees', e.id, { scanId: scanId });
              });
              HR.toast('นำเข้าแล้ว ' + todo.length + ' รายการ');
              HR.go('attendance');
            }
          }]
        });
      }

      return el('div', [
        HR.pageHead('นำเข้าข้อมูลเครื่องสแกน',
          'อัปโหลดไฟล์ที่ export จากเครื่องสแกนใบหน้า (CSV หรือ Excel) ระบบรวมการสแกนเป็นรายวัน เทียบกับตารางกะ แล้วให้ตรวจก่อนบันทึก', [
            HR.btn('เลือกไฟล์จากเครื่องสแกน', function () { fileIn.click(); }, 'btn-primary'),
            fileIn
          ]),
        info,
        el('div', { style: 'height:16px' }),
        mapBox,
        el('div', { style: 'height:16px' }),
        preview
      ]);
    }
  });

  /* ใช้ทดสอบจากคอนโซล */
  HR.scanImport = { parsePunches: parsePunches, buildPlan: buildPlan, decode: decode };
})(window.HR);
