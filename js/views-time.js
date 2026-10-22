/* views-time.js — โมดูล 3: เวลาทำงาน กะงาน และการจัดการวันลา */
(function (HR) {
  'use strict';
  var el = HR.el;

  /* ---------- บันทึกเวลาเข้า-ออกงาน ---------- */
  HR.view('attendance', {
    title: 'บันทึกเวลาเข้า-ออกงาน',
    render: HR.crud('attendance', {
      desc: 'รองรับการลงเวลาผ่านแอป (GPS/Beacon) สแกนใบหน้า สแกนนิ้ว หรือบันทึกย้อนหลังโดย HR — ระบบคำนวณสายและ OT ให้จากกะที่กำหนด',
      pageSize: 20,
      footerSum: ['lateMinutes', 'otHours'],
      defaults: function () { return { date: HR.today(), status: 'ปกติ', method: 'บันทึกโดย HR' }; },
      actions: function () {
        return [
          HR.btn('ลงเวลาตอนนี้', clockNow, 'btn-primary'),
          HR.btn('ใบลงเวลารายเดือน (Excel)', timesheetReport)
        ];
      },
      before: function () {
        var today = HR.today();
        var recs = HR.rows('attendance').filter(function (r) { return r.date === today; });
        var actives = HR.rows('employees').filter(function (e) { return e.status === 'ทำงาน' || e.status === 'ทดลองงาน'; });
        var late = recs.filter(function (r) { return (r.lateMinutes || 0) > HR.S().shiftGraceMinutes; });
        return el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('ลงเวลาวันนี้', recs.length, '/' + actives.length + ' คน', HR.dateTH(today), 'lift'),
          HR.kpi('มาสายวันนี้', late.length, 'คน', late.length ? 'รวม ' + HR.sum(late, function (r) { return r.lateMinutes; }) + ' นาที' : 'ไม่มีผู้มาสาย', late.length ? 'warnbar' : ''),
          HR.kpi('ขาดงานวันนี้', recs.filter(function (r) { return r.status === 'ขาดงาน'; }).length, 'คน'),
          HR.kpi('OT วันนี้', HR.num(HR.sum(recs, function (r) { return r.otHours; }), 1), 'ชม.')
        ]);
      }
    })
  });

  function clockNow() {
    var now = new Date();
    var hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    var form = HR.form([
      { k: 'employeeId', l: 'พนักงาน', t: 'ref', ref: 'employees', req: true },
      { k: 'shiftId', l: 'กะงาน', t: 'ref', ref: 'shifts', req: true },
      { k: 'method', l: 'วิธีลงเวลา', t: 'select', opts: ['แอป GPS', 'Beacon', 'สแกนใบหน้า', 'สแกนนิ้ว'], def: 'แอป GPS', req: true },
      { k: 'kind', l: 'ประเภทการลงเวลา', t: 'select', opts: ['เข้างาน', 'ออกงาน'], def: 'เข้างาน', req: true },
      { k: 'time', l: 'เวลา', t: 'time', def: hhmm, req: true },
      { k: 'location', l: 'ตำแหน่งที่ลงเวลา', t: 'text', w: 2, placeholder: 'กดปุ่มดึงพิกัด หรือพิมพ์ชื่อสถานที่' }
    ], { date: HR.today() });

    var body = el('div.stack', [
      el('div.callout', 'เวลาจากเครื่องคือ ' + hhmm + ' น. ของวันที่ ' + HR.dateTH(HR.today()) + ' — ระบบจะเทียบกับเวลาเข้างานของกะเพื่อคำนวณนาทีที่มาสายและชั่วโมง OT'),
      form.el,
      el('div.row', [HR.btn('ดึงพิกัด GPS จากอุปกรณ์', function () {
        if (!navigator.geolocation) { HR.toast('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการระบุพิกัด', 'err'); return; }
        navigator.geolocation.getCurrentPosition(function (p) {
          form.inputs.location.node.value = p.coords.latitude.toFixed(5) + ', ' + p.coords.longitude.toFixed(5);
          HR.toast('ดึงพิกัดเรียบร้อย');
        }, function () { HR.toast('ดึงพิกัดไม่สำเร็จ — กรอกชื่อสถานที่แทนได้', 'err'); });
      }, 'btn-sm')])
    ]);

    HR.modal({
      title: 'ลงเวลาเข้า-ออกงาน', size: 'wide', body: body,
      buttons: [{ label: 'ยกเลิก' }, {
        label: 'บันทึกเวลา', cls: 'btn-primary', keepOpen: true, fn: function (close) {
          var bad = form.validate();
          if (bad.length) { HR.toast('กรอกให้ครบ: ' + bad.join(', '), 'err'); return false; }
          var v = form.get();
          var shift = HR.db.byId('shifts', v.shiftId);
          var exist = HR.db.t('attendance').filter(function (r) { return r.employeeId === v.employeeId && r.date === v.date; })[0];
          if (v.kind === 'เข้างาน') {
            var late = Math.max(0, HR.minutes(v.time) - HR.minutes(shift.startTime));
            var patch = {
              employeeId: v.employeeId, date: v.date, shiftId: v.shiftId, clockIn: v.time,
              method: v.method, location: v.location, lateMinutes: late,
              status: late > HR.S().shiftGraceMinutes ? 'มาสาย' : 'ปกติ'
            };
            if (exist) HR.db.update('attendance', exist.id, patch); else HR.db.insert('attendance', patch);
            HR.toast(late > HR.S().shiftGraceMinutes ? 'บันทึกเข้างานแล้ว — มาสาย ' + late + ' นาที' : 'บันทึกเข้างานแล้ว ตรงเวลา');
          } else {
            if (!exist) { HR.toast('ยังไม่มีบันทึกเข้างานของวันนี้', 'err'); return false; }
            var ot = Math.max(0, (HR.minutes(v.time) - HR.minutes(shift.endTime)) / 60);
            HR.db.update('attendance', exist.id, {
              clockOut: v.time, otHours: HR.round2(Math.floor(ot * 2) / 2),
              otType: ot >= 0.5 ? 'OT วันทำงาน' : '',
              earlyLeaveMinutes: Math.max(0, HR.minutes(shift.endTime) - HR.minutes(v.time))
            });
            HR.toast('บันทึกออกงานแล้ว' + (ot >= 0.5 ? ' — OT ' + HR.num(Math.floor(ot * 2) / 2, 1) + ' ชม.' : ''));
          }
          close(); HR.render();
        }
      }]
    });
  }

  function timesheetReport() {
    var ym = HR.thisMonth();
    var inp = el('input', { type: 'month', value: ym });
    HR.modal({
      title: 'ใบลงเวลารายเดือน', size: 'narrow',
      body: el('div.stack', [
        el('div.field', [el('span.lbl', 'เลือกงวดเดือน'), inp]),
        el('div.faint', 'ไฟล์จะมี 2 ชีต: สรุปรายคน และบันทึกเวลารายวันทั้งเดือน')
      ]),
      buttons: [{ label: 'ยกเลิก' }, {
        label: 'สร้างไฟล์ Excel', cls: 'btn-primary', fn: function () {
          var m = inp.value || ym;
          var emps = HR.rows('employees').filter(function (e) { return e.status !== 'ลาออก' && e.status !== 'เลิกจ้าง'; });
          var head = [['รหัส', 'ชื่อ-นามสกุล', 'ฝ่าย', 'วันทำงาน', 'ขาดงาน (วัน)', 'ลาได้ค่าจ้าง (วัน)', 'ลาไม่รับค่าจ้าง (วัน)',
            'มาสาย (ครั้ง)', 'มาสาย (นาที)', 'ออกก่อนเวลา (นาที)', 'OT (ชม.)', 'ได้เบี้ยขยัน']];
          emps.forEach(function (e) {
            var s = HR.engine.attendanceSummary(e.id, m);
            head.push([e.code, e.firstName + ' ' + e.lastName, HR.nameOf('departments', e.deptId),
              s.workedDays, s.absentDays, s.paidLeaveDays, s.unpaidLeaveDays,
              s.lateCount, s.lateMinutes, s.earlyMinutes, s.otTotalHours, s.diligenceEligible ? 'ใช่' : 'ไม่']);
          });
          var daily = HR.rows('attendance').filter(function (r) { return String(r.date).slice(0, 7) === m; });
          HR.excel.exportWorkbook([
            { name: 'สรุปรายคน', aoa: head },
            { name: 'บันทึกรายวัน', rows: daily, cols: HR.exportCols('attendance') }
          ], 'ใบลงเวลา_' + m);
        }
      }]
    });
  }

  /* ---------- กะงาน ---------- */
  HR.view('shifts', {
    title: 'กะงาน',
    render: HR.crud('shifts', {
      desc: 'กำหนดเวลาเข้า-ออกของแต่ละกะ เวลาพัก และค่ากะกลางคืน — ใช้เป็นฐานคำนวณสายและ OT',
      before: function () {
        return el('div.callout', { style: 'margin-bottom:16px' },
          'ผ่อนผันการมาสายที่ตั้งไว้ปัจจุบัน ' + HR.S().shiftGraceMinutes + ' นาที · เบี้ยขยัน ' + HR.money(HR.S().diligenceAmount) +
          ' บาท/เดือน (ต้องไม่มาสายเกิน ' + HR.S().diligenceMaxLateCount + ' ครั้ง ไม่ขาดงาน และไม่ลาแบบไม่รับค่าจ้าง) — แก้ได้ที่หน้าตั้งค่าระบบ');
      }
    })
  });

  /* ---------- ตารางกะรายเดือน ---------- */
  var DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

  /** ข้อมูลประกอบของเดือนที่เลือก: รายการวัน วันหยุดนักขัตฤกษ์ และจำนวนสัปดาห์ */
  function monthInfo(ym) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
    var days = new Date(y, m, 0).getDate();
    var hol = {};
    HR.db.t('holidays').forEach(function (h) {
      if (String(h.date).slice(0, 7) === ym) hol[Number(String(h.date).slice(8, 10))] = h.name;
    });
    var list = [];
    for (var d = 1; d <= days; d++) {
      var iso = ym + '-' + String(d).padStart(2, '0');
      list.push({ day: d, iso: iso, dow: new Date(iso).getDay(), holiday: hol[d] || null });
    }
    return { y: y, m: m, days: days, list: list, weeks: Math.floor(days / 7) };
  }

  /** สรุปของพนักงาน 1 คนในเดือนนั้น ตามคอลัมน์สรุปท้ายตาราง */
  function rowSummary(cells, info) {
    var work = 0, off = 0, leave = 0, blank = 0, onHoliday = 0;
    info.list.forEach(function (d, i) {
      var s = cells[i];
      if (!s) { blank++; return; }
      if (HR.isWorkShift(s)) { work++; if (d.holiday) onHoliday++; }
      else if (s.kind === 'ลา') leave++;
      else off++;
    });
    var weekly = cells.filter(function (s) { return s && s.kind === 'วันหยุด' && s.code === 'O'; }).length;
    return {
      work: work, off: off, leave: leave, blank: blank, onHoliday: onHoliday,
      weeklyCheck: weekly >= info.weeks ? 'OK' : 'ขาด ' + (info.weeks - weekly) + ' วัน'
    };
  }

  HR.view('roster', {
    title: 'ตารางกะรายเดือน',
    render: function () {
      var ym = HR.ctx.rosterMonth || HR.thisMonth();
      var host = el('div');

      var monthInp = el('input', { type: 'month', value: ym, style: 'max-width:170px' });
      monthInp.addEventListener('change', function () {
        if (!monthInp.value) return;
        HR.ctx.rosterMonth = monthInp.value;
        HR.render();
      });
      function shiftMonth(n) {
        var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
        HR.ctx.rosterMonth = HR.ymOf(new Date(y, m - 1 + n, 1));
        HR.render();
      }

      function employees() {
        return HR.rows('employees')
          .filter(function (e) { return e.status !== 'ลาออก' && e.status !== 'เลิกจ้าง'; })
          .sort(function (a, b) { return String(a.code) < String(b.code) ? -1 : 1; });
      }
      function cellsOf(emp, info, ros) {
        return info.list.map(function (d) {
          var r = ros.filter(function (x) { return x.employeeId === emp.id && x.date === d.iso; })[0];
          return r ? HR.db.byId('shifts', r.shiftId) : null;
        });
      }

      function draw() {
        HR.clear(host);
        var info = monthInfo(ym);
        var emps = employees();
        var ros = HR.db.t('roster');
        var shifts = HR.db.t('shifts');

        if (!emps.length) {
          host.appendChild(el('div.empty', [el('b', 'ยังไม่มีพนักงานในบริษัทที่เลือก'), 'เพิ่มพนักงานที่หน้าทะเบียนพนักงานก่อน']));
          return;
        }
        if (!shifts.length) {
          host.appendChild(el('div.empty', [el('b', 'ยังไม่มีรหัสกะในระบบ'), 'สร้างรหัสกะที่หน้า "รหัสกะ" ก่อน แล้วกลับมาจัดตารางกะ']));
          return;
        }

        var tw = el('div.table-wrap.roster-wrap');
        var thead = el('thead');

        /* แถววันที่ */
        var trDay = el('tr', [el('th.rst-fix', { colspan: 4 }, 'วันที่')]);
        info.list.forEach(function (d) {
          trDay.appendChild(el('th.rst-day' + (d.holiday ? '.hol' : (d.dow === 0 ? '.sun' : '')), { title: d.holiday || '' }, String(d.day)));
        });
        ['วันทำงาน', 'วันหยุด', 'ลา', 'ยังไม่ลงกะ', 'ทำงานวันนักขัตฯ', 'ตรวจวันหยุด/สัปดาห์'].forEach(function () {
          trDay.appendChild(el('th.rst-sum', ''));
        });
        thead.appendChild(trDay);

        /* แถววันในสัปดาห์ + หัวคอลัมน์สรุป */
        var trDow = el('tr', [
          el('th.rst-fix', 'ลำดับ'), el('th.rst-fix', 'รหัส'),
          el('th.rst-fix', 'ชื่อ-สกุล'), el('th.rst-fix', 'ฝ่าย')
        ]);
        info.list.forEach(function (d) {
          trDow.appendChild(el('th.rst-day' + (d.holiday ? '.hol' : (d.dow === 0 ? '.sun' : '')), { title: d.holiday || '' }, DOW[d.dow]));
        });
        ['วันทำงาน', 'วันหยุด', 'ลา', 'ยังไม่ลงกะ', 'ทำงานวันนักขัตฯ', 'ตรวจวันหยุด/สัปดาห์'].forEach(function (h) {
          trDow.appendChild(el('th.rst-sum', h));
        });
        thead.appendChild(trDow);

        var tbody = el('tbody');
        emps.forEach(function (e, idx) {
          var tr = el('tr');
          tr.appendChild(el('td.rst-fix.num', String(idx + 1)));
          tr.appendChild(el('td.rst-fix.mono', e.code || ''));
          tr.appendChild(el('td.rst-fix.nowrap', e.firstName + ' ' + e.lastName));
          tr.appendChild(el('td.rst-fix.nowrap', HR.nameOf('departments', e.deptId)));

          info.list.forEach(function (d) {
            var r = ros.filter(function (x) { return x.employeeId === e.id && x.date === d.iso; })[0];
            var cur = r ? HR.db.byId('shifts', r.shiftId) : null;
            var sel = el('select.rst-cell', { title: cur ? cur.name : 'ยังไม่ลงกะ' });
            sel.appendChild(el('option', { value: '' }, '–'));
            shifts.forEach(function (s) { sel.appendChild(el('option', { value: s.id }, s.code)); });
            sel.value = r ? r.shiftId : '';
            sel.className = 'rst-cell ' + kindClass(cur);
            sel.addEventListener('change', function () {
              if (!sel.value) { if (r) HR.db.remove('roster', r.id); }
              else if (r) HR.db.update('roster', r.id, { shiftId: sel.value });
              else HR.db.insert('roster', { employeeId: e.id, date: d.iso, shiftId: sel.value });
              draw();
            });
            tr.appendChild(el('td.rst-td' + (d.holiday ? '.hol' : (d.dow === 0 ? '.sun' : '')), sel));
          });

          var sm = rowSummary(cellsOf(e, info, ros), info);
          [sm.work, sm.off, sm.leave, sm.blank, sm.onHoliday].forEach(function (v, i) {
            tr.appendChild(el('td.rst-sum.num' + (i === 3 && v ? '.warnish' : ''), String(v)));
          });
          tr.appendChild(el('td.rst-sum' + (sm.weeklyCheck === 'OK' ? '' : '.warnish'), sm.weeklyCheck));
          tbody.appendChild(tr);
        });

        tw.appendChild(el('table.tbl.roster', [thead, tbody]));
        host.appendChild(tw);

        /* คำอธิบายรหัส */
        host.appendChild(el('div.legend', { style: 'margin-top:12px' },
          shifts.map(function (s) {
            return el('span', [
              el('span.badge.' + badgeOf(s), s.code), ' ' + s.name +
              (s.startTime ? ' (' + s.startTime + '-' + s.endTime + ')' : '')
            ]);
          })
        ));
      }

      function kindClass(s) {
        if (!s) return 'k-none';
        return s.kind === 'ลา' ? 'k-leave' : s.kind === 'วันหยุด' ? 'k-off'
          : s.kind === 'นอกสถานที่' ? 'k-away' : 'k-work';
      }
      function badgeOf(s) {
        return s.kind === 'ลา' ? 'warn' : s.kind === 'วันหยุด' ? 'danger'
          : s.kind === 'นอกสถานที่' ? 'info' : 'ok';
      }

      draw();

      return el('div', [
        HR.pageHead('ตารางกะประจำเดือน ' + HR.monthName(ym),
          'เลือกรหัสกะในแต่ละช่อง ระบบบันทึกทันที · คอลัมน์สีแดงคือวันหยุดนักขัตฤกษ์ · คอลัมน์ขวาสุดสรุปวันทำงาน วันหยุด และวันลาให้อัตโนมัติ', [
          HR.btn('Export ตารางกะ (Excel)', function () { exportRoster(ym); }, 'btn-primary'),
          HR.btn('ลงกะทั้งเดือนอัตโนมัติ', function () { autoFill(ym); }),
          HR.btn('ล้างกะทั้งเดือน', function () { clearMonth(ym); }, 'btn-danger')
        ]),
        el('div.toolbar', [
          HR.btn('‹ เดือนก่อน', function () { shiftMonth(-1); }, 'btn-sm'),
          monthInp,
          HR.btn('เดือนถัดไป ›', function () { shiftMonth(1); }, 'btn-sm'),
          el('span.faint', 'ทั้งหมด ' + monthInfo(ym).days + ' วัน'),
          HR.btn('จัดการรหัสกะ', function () { HR.go('shifts'); }, 'btn-sm')
        ]),
        host
      ]);
    }
  });

  /* ---------- ลงกะทั้งเดือนอัตโนมัติ (ใช้รูปแบบการทำงานรายบุคคล) ---------- */
  function specialCodes() {
    var shifts = HR.db.t('shifts');
    return {
      weeklyOff: (shifts.filter(function (s) { return s.kind === 'วันหยุด' && s.code === 'O'; })[0] || {}).id,
      holiday: (shifts.filter(function (s) { return s.kind === 'วันหยุด' && s.code === 'DO'; })[0] ||
        shifts.filter(function (s) { return s.kind === 'วันหยุด'; })[0] || {}).id
    };
  }

  function autoFill(ym) {
    var info = monthInfo(ym);
    var codes = specialCodes();
    var emps = HR.rows('employees').filter(function (e) { return e.status !== 'ลาออก' && e.status !== 'เลิกจ้าง'; });
    var ready = emps.filter(function (e) { return e.defaultShiftId; });
    var notReady = emps.filter(function (e) { return !e.defaultShiftId; });

    var overwrite = el('input', { type: 'checkbox' });
    var rows = emps.map(function (e) {
      return {
        code: e.code, name: e.firstName + ' ' + e.lastName,
        shift: e.defaultShiftId ? (HR.db.byId('shifts', e.defaultShiftId) || {}).code : '— ยังไม่ได้ตั้ง —',
        pattern: HR.engine.patternText(e)
      };
    });

    HR.modal({
      title: 'ลงกะทั้งเดือน — ' + HR.monthName(ym), size: 'wide',
      body: el('div.stack', [
        el('div.callout', 'ระบบจะลงกะตาม "รูปแบบการทำงาน" ที่ตั้งไว้ของแต่ละคน: ใส่ ' +
          (codes.holiday ? 'DO' : 'วันหยุด') + ' ในวันหยุดนักขัตฤกษ์ · ' +
          (codes.weeklyOff ? 'O' : 'วันหยุด') + ' ในวันหยุดประจำสัปดาห์ · ที่เหลือใส่กะประจำของคนนั้น'),
        notReady.length ? el('div.callout.warn', [
          notReady.length + ' คนยังไม่ได้ตั้งกะประจำ จะถูกข้าม — ',
          HR.btn('ไปตั้งรูปแบบการทำงาน', function () { HR.go('workPatterns'); }, 'btn-sm')
        ]) : null,
        el('label.chk', [overwrite, 'ทับกะที่ลงไว้แล้วด้วย (ไม่ติ๊ก = เติมเฉพาะช่องว่าง)']),
        HR.table({
          cols: [{ k: 'code', l: 'รหัส', w: 80 }, { k: 'name', l: 'ชื่อ-นามสกุล' },
            { k: 'shift', l: 'กะประจำ' }, { k: 'pattern', l: 'รูปแบบวันหยุด' }],
          rows: rows, search: false, exportName: false, pageSize: 10
        })
      ]),
      buttons: [{ label: 'ยกเลิก' }, {
        label: 'ลงกะ ' + ready.length + ' คน', cls: 'btn-primary', fn: function () {
          if (!ready.length) { HR.toast('ยังไม่มีใครตั้งกะประจำไว้', 'err'); return; }
          var n = 0, skipped = 0;
          ready.forEach(function (e) {
            info.list.forEach(function (d) {
              var exist = HR.db.t('roster').filter(function (x) { return x.employeeId === e.id && x.date === d.iso; })[0];
              if (exist && !overwrite.checked) { skipped++; return; }
              var sid = HR.engine.plannedShift(e, d.iso, codes);
              if (!sid) return;
              if (exist) HR.db.update('roster', exist.id, { shiftId: sid });
              else HR.db.insert('roster', { employeeId: e.id, date: d.iso, shiftId: sid });
              n++;
            });
          });
          HR.toast('ลงกะเดือน ' + HR.monthName(ym) + ' แล้ว ' + n + ' ช่อง' + (skipped ? ' (ข้ามช่องที่มีอยู่แล้ว ' + skipped + ' ช่อง)' : ''));
          HR.render();
        }
      }]
    });
  }

  /* ---------- รูปแบบการทำงานรายบุคคล ---------- */
  HR.view('workPatterns', {
    title: 'รูปแบบการทำงานรายบุคคล',
    render: function () {
      var DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
      var emps = HR.rows('employees').filter(function (e) { return e.status !== 'ลาออก' && e.status !== 'เลิกจ้าง'; })
        .sort(function (a, b) { return String(a.code) < String(b.code) ? -1 : 1; });
      var workShifts = HR.db.t('shifts').filter(function (s) { return HR.isWorkShift(s); });
      var host = el('div');

      function draw() {
        HR.clear(host);
        if (!emps.length) { host.appendChild(el('div.empty', [el('b', 'ยังไม่มีพนักงาน')])); return; }

        var tw = el('div.table-wrap');
        var thead = el('thead', el('tr', [
          el('th', 'รหัส'), el('th', 'ชื่อ-นามสกุล'), el('th', 'กะประจำ'),
          el('th', 'รูปแบบวันหยุด'), el('th', 'วันหยุดประจำสัปดาห์'),
          el('th', 'เสาร์แรกที่หยุด'), el('th', 'สรุป')
        ]));
        var tbody = el('tbody');

        emps.forEach(function (e) {
          var shiftSel = el('select', { style: 'min-width:120px' });
          shiftSel.appendChild(el('option', { value: '' }, '— ยังไม่ตั้ง —'));
          workShifts.forEach(function (s) { shiftSel.appendChild(el('option', { value: s.id }, s.code + ' · ' + s.name)); });
          shiftSel.value = e.defaultShiftId || '';

          var patSel = el('select', { style: 'min-width:150px' });
          ['หยุดประจำสัปดาห์', 'เสาร์เว้นเสาร์', 'กะหมุนเวียน (ลงเอง)'].forEach(function (p) {
            patSel.appendChild(el('option', { value: p }, p));
          });
          patSel.value = e.workPattern || 'หยุดประจำสัปดาห์';

          var dayBox = el('div.row', { style: 'gap:5px' });
          var checks = {};
          DAYS.forEach(function (d) {
            var cb = el('input', { type: 'checkbox' });
            cb.checked = (e.offDays || []).indexOf(d) > -1;
            checks[d] = cb;
            dayBox.appendChild(el('label.chk', { style: 'font-size:11.5px;gap:3px' }, [cb, d.slice(0, 2)]));
          });

          var refInp = el('input', { type: 'date', value: e.altRefDate || '', style: 'max-width:145px' });
          var sumCell = el('td.faint', HR.engine.patternText(e));

          function save() {
            var offs = DAYS.filter(function (d) { return checks[d].checked; });
            HR.db.update('employees', e.id, {
              defaultShiftId: shiftSel.value || null,
              workPattern: patSel.value,
              offDays: offs,
              altRefDate: refInp.value || null
            });
            e.defaultShiftId = shiftSel.value || null;
            e.workPattern = patSel.value; e.offDays = offs; e.altRefDate = refInp.value || null;
            sumCell.textContent = HR.engine.patternText(e);
            refInp.disabled = patSel.value !== 'เสาร์เว้นเสาร์';
            HR.toast('บันทึกรูปแบบการทำงานของ ' + e.firstName + ' แล้ว');
          }
          [shiftSel, patSel, refInp].forEach(function (n) { n.addEventListener('change', save); });
          Object.keys(checks).forEach(function (d) { checks[d].addEventListener('change', save); });
          refInp.disabled = patSel.value !== 'เสาร์เว้นเสาร์';

          tbody.appendChild(el('tr', [
            el('td.mono', e.code || ''), el('td.nowrap', e.firstName + ' ' + e.lastName),
            el('td', shiftSel), el('td', patSel), el('td', dayBox), el('td', refInp), sumCell
          ]));
        });

        tw.appendChild(el('table.tbl', [thead, tbody]));
        host.appendChild(tw);
      }
      draw();

      return el('div', [
        HR.pageHead('รูปแบบการทำงานรายบุคคล',
          'กำหนดกะประจำและวันหยุดของแต่ละคน — รองรับหยุดวันเดิมทุกสัปดาห์ หยุดหลายวัน และเสาร์เว้นเสาร์ · ระบบใช้ค่านี้ลงตารางกะทั้งเดือนให้อัตโนมัติ', [
          HR.btn('ไปที่ตารางกะรายเดือน', function () { HR.go('roster'); }, 'btn-primary'),
          HR.btn('Export รูปแบบการทำงาน (Excel)', function () {
            HR.excel.exportRows(emps, [
              { k: 'code', l: 'รหัส' },
              { k: 'name', l: 'ชื่อ-นามสกุล', fmt: function (e) { return e.firstName + ' ' + e.lastName; } },
              { k: 'dept', l: 'ฝ่าย', fmt: function (e) { return HR.nameOf('departments', e.deptId); } },
              { k: 'shift', l: 'กะประจำ', fmt: function (e) { return e.defaultShiftId ? (HR.db.byId('shifts', e.defaultShiftId) || {}).code : ''; } },
              { k: 'workPattern', l: 'รูปแบบวันหยุด' },
              { k: 'offDays', l: 'วันหยุดประจำสัปดาห์', fmt: function (e) { return (e.offDays || []).join(', '); } },
              { k: 'altRefDate', l: 'เสาร์แรกที่หยุด', fmt: function (e) { return HR.date(e.altRefDate); } },
              { k: 'summary', l: 'สรุป', fmt: function (e) { return HR.engine.patternText(e); } }
            ], 'รูปแบบการทำงาน');
          })
        ]),
        el('div.callout', { style: 'margin-bottom:14px' },
          'ตัวอย่าง — หยุดวันอาทิตย์: ติ๊ก "อา" · หยุดเสาร์-อาทิตย์: ติ๊ก "ส" และ "อา" · ' +
          'เสาร์เว้นเสาร์: เลือกรูปแบบ "เสาร์เว้นเสาร์" ติ๊ก "ส" แล้วระบุวันเสาร์แรกที่หยุด ระบบจะเว้นสัปดาห์ให้เอง'),
        host
      ]);
    }
  });

  function clearMonth(ym) {
    var info = monthInfo(ym);
    var ids = {};
    info.list.forEach(function (d) { ids[d.iso] = 1; });
    var emps = HR.rows('employees').map(function (e) { return e.id; });
    var target = HR.db.t('roster').filter(function (r) { return ids[r.date] && emps.indexOf(r.employeeId) > -1; });
    if (!target.length) { HR.toast('เดือนนี้ยังไม่มีการลงกะ', 'warn'); return; }
    HR.confirm('ล้างตารางกะเดือน ' + HR.monthName(ym) + ' ทั้งหมด ' + target.length + ' ช่อง?', 'ล้างตารางกะ')
      .then(function (ok) {
        if (!ok) return;
        target.forEach(function (r) { HR.db.remove('roster', r.id); });
        HR.toast('ล้างตารางกะแล้ว');
        HR.render();
      });
  }

  /* ---------- Export ตารางกะรายเดือน ---------- */
  function exportRoster(ym) {
    var info = monthInfo(ym);
    var co = HR.CO();
    var emps = HR.rows('employees')
      .filter(function (e) { return e.status !== 'ลาออก' && e.status !== 'เลิกจ้าง'; })
      .sort(function (a, b) { return String(a.code) < String(b.code) ? -1 : 1; });
    var ros = HR.db.t('roster');
    var SUM = ['วันทำงาน', 'วันหยุด', 'ลา', 'ยังไม่ลงกะ', 'ทำงานวันนักขัตฯ', 'ตรวจวันหยุด/สัปดาห์'];

    var aoa = [];
    aoa.push(['ตารางกะประจำเดือน ' + HR.monthName(ym) + '  ·  ' + (co ? co.name : 'ทุกบริษัทในเครือ')]);
    aoa.push(['รหัสกะดูได้ที่ชีต "รหัสกะ" · ช่องว่าง = ยังไม่ลงกะ']);
    aoa.push(['', '', '', 'วันนักขัตฯ'].concat(info.list.map(function (d) { return d.holiday ? 'นักขัตฯ' : ''; }), SUM.map(function () { return ''; })));
    aoa.push(['', '', '', 'วันที่'].concat(info.list.map(function (d) { return d.day; }), SUM.map(function () { return ''; })));
    aoa.push(['ลำดับ', 'รหัส', 'ชื่อ-สกุล', 'วัน'].concat(info.list.map(function (d) { return DOW[d.dow]; }), SUM));

    emps.forEach(function (e, i) {
      var cells = info.list.map(function (d) {
        var r = ros.filter(function (x) { return x.employeeId === e.id && x.date === d.iso; })[0];
        return r ? HR.db.byId('shifts', r.shiftId) : null;
      });
      var sm = rowSummary(cells, info);
      aoa.push([i + 1, e.code, e.firstName + ' ' + e.lastName, HR.nameOf('departments', e.deptId)]
        .concat(cells.map(function (s) { return s ? s.code : ''; }),
          [sm.work, sm.off, sm.leave, sm.blank, sm.onHoliday, sm.weeklyCheck]));
    });

    var codes = [['รหัส', 'คำอธิบาย', 'ประเภท', 'เวลาเข้า', 'เวลาออก', 'พัก (นาที)', 'ชม.ทำงาน', 'ต้องสแกน', 'หมายเหตุ']];
    HR.db.t('shifts').forEach(function (s) {
      codes.push([s.code, s.name, s.kind || 'ทำงาน', s.startTime || '', s.endTime || '',
        s.breakMinutes || 0, HR.shiftHours(s), s.requireScan === false ? 'N' : 'Y', s.note || '']);
    });

    var hol = [['วันที่', 'วัน', 'ชื่อวันหยุด', 'ประเภท']];
    info.list.filter(function (d) { return d.holiday; }).forEach(function (d) {
      var h = HR.db.t('holidays').filter(function (x) { return x.date === d.iso; })[0] || {};
      hol.push([HR.date(d.iso), DOW[d.dow], d.holiday, h.type || '']);
    });

    HR.excel.exportWorkbook([
      { name: 'ตารางกะ', aoa: aoa },
      { name: 'รหัสกะ', aoa: codes },
      { name: 'วันหยุด', aoa: hol }
    ], 'ตารางกะ_' + ym);
  }

  /* ---------- วันหยุด ---------- */
  HR.view('holidays', {
    title: 'วันหยุดประจำปี',
    render: HR.crud('holidays', { desc: 'ปฏิทินวันหยุดที่ระบบใช้ข้ามการคิดขาดงานและใช้แยกประเภท OT วันหยุด' })
  });

  /* ---------- ประเภทวันลาและสิทธิ์ ---------- */
  HR.view('leaveTypes', {
    title: 'ประเภทวันลาและเกณฑ์',
    render: HR.crud('leaveTypes', {
      desc: 'ตั้งสิทธิ์วันลาต่อปี กำหนดว่าได้ค่าจ้างหรือไม่ และเกณฑ์เอกสารประกอบ — ประเภทที่ไม่ได้ค่าจ้างจะถูกหักเงินในรอบเงินเดือนอัตโนมัติ',
      footerSum: ['days']
    })
  });

  HR.view('leaveBalances', {
    title: 'สิทธิ์วันลาคงเหลือ',
    render: function () {
      var types = HR.db.t('leaveTypes');
      var emps = HR.rows('employees').filter(function (e) { return e.status !== 'ลาออก' && e.status !== 'เลิกจ้าง'; });
      var rows = emps.map(function (e) {
        var o = { code: e.code, name: HR.label('employees', e), dept: HR.nameOf('departments', e.deptId), years: HR.round2(HR.yearsBetween(e.hireDate)) };
        types.forEach(function (t) {
          var b = HR.engine.leaveBalance(e.id, t.name);
          o['u_' + t.id] = b.used; o['r_' + t.id] = b.remaining;
        });
        return o;
      });
      var cols = [{ k: 'code', l: 'รหัส', w: 90 }, { k: 'name', l: 'พนักงาน' }, { k: 'dept', l: 'ฝ่าย' }, { k: 'years', l: 'อายุงาน (ปี)', num: 1, dec: 1 }];
      types.forEach(function (t) {
        cols.push({ k: 'u_' + t.id, l: t.name + ' — ใช้ไป', num: 1, dec: 1 });
        cols.push({ k: 'r_' + t.id, l: t.name + ' — คงเหลือ', num: 1, dec: 1 });
      });

      return el('div', [
        HR.pageHead('สิทธิ์วันลาคงเหลือรายบุคคล',
          'คำนวณจากสิทธิ์ตามประเภทการลา (คิดตามสัดส่วนในปีแรกถ้าตั้งไว้) หักด้วยใบลาที่อนุมัติแล้วในปีปัจจุบัน', [
          HR.btn('กำหนดสิทธิ์เฉพาะราย', function () { HR.go('leaveEntitlements'); }),
          HR.btn('Export ตารางสิทธิ์ (Excel)', function () { HR.excel.exportRows(rows, cols, 'สิทธิ์วันลาคงเหลือ'); }, 'btn-primary')
        ]),
        HR.table({ cols: cols, rows: rows, exportName: 'สิทธิ์วันลาคงเหลือ', pageSize: 30 })
      ]);
    }
  });

  HR.view('leaveEntitlements', {
    title: 'สิทธิ์วันลาเฉพาะราย',
    render: HR.crud('leaveEntitlements', {
      desc: 'ใช้เมื่อพนักงานบางรายมีสิทธิ์ต่างจากเกณฑ์กลาง เช่น สิทธิ์เพิ่มตามอายุงานหรือตามข้อตกลงพิเศษ — ค่าที่ใส่ที่นี่จะทับเกณฑ์กลาง'
    })
  });

  HR.view('leaves', {
    title: 'ใบลาทั้งหมด',
    render: HR.crud('leaves', {
      desc: 'ใบลาทุกใบในระบบ ตรวจสิทธิ์คงเหลืออัตโนมัติ และเชื่อมกับการหักเงินในรอบเงินเดือนสำหรับการลาที่ไม่ได้ค่าจ้าง',
      footerSum: ['days'],
      defaults: function () { return { dateFrom: HR.today(), dateTo: HR.today(), days: 1, status: 'รออนุมัติ' }; },
      rowActions: function (r) {
        return r.status === 'รออนุมัติ' ? [
          { label: 'อนุมัติ', fn: function () { HR.approve('leaves', r, 'อนุมัติ'); } },
          { label: 'ไม่อนุมัติ', cls: 'btn-danger', fn: function () { HR.approve('leaves', r, 'ไม่อนุมัติ'); } }
        ] : [];
      },
      actions: function () {
        return [HR.btn('สรุปวันลาตามประเภท (Excel)', function () {
          var types = HR.db.t('leaveTypes');
          var aoa = [['ประเภทการลา', 'ได้ค่าจ้าง', 'จำนวนใบลา', 'รวมวันลา', 'อนุมัติแล้ว (วัน)', 'รออนุมัติ (วัน)']];
          types.forEach(function (t) {
            var rows = HR.rows('leaves').filter(function (l) { return l.leaveTypeId === t.id; });
            aoa.push([t.name, t.paid === false ? 'ไม่' : 'ใช่', rows.length,
              HR.round2(HR.sum(rows, function (l) { return l.days; })),
              HR.round2(HR.sum(rows.filter(function (l) { return l.status === 'อนุมัติ'; }), function (l) { return l.days; })),
              HR.round2(HR.sum(rows.filter(function (l) { return l.status === 'รออนุมัติ'; }), function (l) { return l.days; }))]);
          });
          HR.excel.exportAOA(aoa, 'สรุปวันลา', 'สรุปวันลาตามประเภท');
        })];
      },
      before: function () {
        var all = HR.rows('leaves');
        return el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('ใบลาทั้งหมด', all.length, 'ใบ', null, 'lift'),
          HR.kpi('รออนุมัติ', all.filter(function (l) { return l.status === 'รออนุมัติ'; }).length, 'ใบ', null, 'warnbar'),
          HR.kpi('วันลาที่อนุมัติแล้ว', HR.num(HR.sum(all.filter(function (l) { return l.status === 'อนุมัติ'; }), function (l) { return l.days; }), 1), 'วัน'),
          HR.kpi('ลาไม่รับค่าจ้าง', HR.num(HR.sum(all.filter(function (l) {
            var t = HR.db.byId('leaveTypes', l.leaveTypeId);
            return l.status === 'อนุมัติ' && t && t.paid === false;
          }), function (l) { return l.days; }), 1), 'วัน', 'ถูกหักค่าจ้างในรอบเงินเดือน')
        ]);
      }
    })
  });

  /* ---------- OT ---------- */
  HR.view('otRequests', {
    title: 'การทำงานล่วงเวลา (OT)',
    render: HR.crud('otRequests', {
      desc: 'อัตรา OT ตามกฎหมาย: วันทำงาน 1.5 เท่า วันหยุด 2 เท่า และวันหยุดเกินเวลา 3 เท่าของค่าจ้างรายชั่วโมง (แก้อัตราได้ที่หน้าตั้งค่า)',
      footerSum: ['hours', 'amount'],
      defaults: function () { return { date: HR.today(), status: 'รออนุมัติ', otType: 'OT วันทำงาน' }; },
      rowActions: function (r) {
        return r.status === 'รออนุมัติ' ? [
          { label: 'อนุมัติ', fn: function () { HR.approve('otRequests', r, 'อนุมัติ'); } },
          { label: 'ไม่อนุมัติ', cls: 'btn-danger', fn: function () { HR.approve('otRequests', r, 'ไม่อนุมัติ'); } }
        ] : [];
      },
      before: function () {
        var all = HR.rows('otRequests').filter(function (r) { return r.status === 'อนุมัติ'; });
        var thisM = all.filter(function (r) { return String(r.date).slice(0, 7) === HR.thisMonth(); });
        var cost = HR.sum(thisM, function (r) {
          var e = HR.db.byId('employees', r.employeeId);
          return e ? HR.engine.otAmount(e.salary, r.hours, r.otType) : 0;
        });
        return el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('OT เดือนนี้', HR.num(HR.sum(thisM, function (r) { return r.hours; }), 1), 'ชม.', null, 'lift'),
          HR.kpi('ค่า OT เดือนนี้', HR.money(cost), 'บาท'),
          HR.kpi('รออนุมัติ', HR.rows('otRequests').filter(function (r) { return r.status === 'รออนุมัติ'; }).length, 'รายการ'),
          HR.kpi('คนที่ทำ OT', Object.keys(HR.groupBy(thisM, function (r) { return r.employeeId; })).length, 'คน')
        ]);
      }
    })
  });

  HR.view('expenses', {
    title: 'เบิกค่าใช้จ่าย',
    render: HR.crud('expenses', {
      desc: 'คำขอเบิกค่าใช้จ่ายของพนักงาน อนุมัติแล้วสามารถส่งเข้ารอบเงินเดือนเป็นรายการรายได้ที่ไม่คิดภาษีได้',
      footerSum: ['amount'],
      defaults: function () { return { date: HR.today(), status: 'รออนุมัติ' }; },
      rowActions: function (r) {
        var acts = [];
        if (r.status === 'รออนุมัติ') {
          acts.push({ label: 'อนุมัติ', fn: function () { HR.approve('expenses', r, 'อนุมัติ'); } });
          acts.push({ label: 'ไม่อนุมัติ', cls: 'btn-danger', fn: function () { HR.approve('expenses', r, 'ไม่อนุมัติ'); } });
        } else if (r.status === 'อนุมัติ') {
          acts.push({
            label: 'ส่งเข้ารอบเงินเดือน', fn: function () {
              var draft = HR.rows('payPeriods').filter(function (p) { return p.status === 'ร่าง' || p.status === 'คำนวณแล้ว'; })[0];
              if (!draft) { HR.toast('ยังไม่มีรอบจ่ายที่เปิดอยู่ — สร้างรอบใหม่ในหน้ารอบจ่ายเงินเดือนก่อน', 'err'); return; }
              HR.db.insert('payAdjustments', {
                periodId: draft.id, employeeId: r.employeeId, kind: 'รายได้',
                name: 'คืนเงินค่าใช้จ่าย: ' + r.category, amount: r.amount, taxable: false
              });
              HR.db.update('expenses', r.id, { status: 'เบิกจ่ายแล้ว' });
              HR.toast('ส่งเข้ารอบ ' + HR.monthName(draft.period) + ' แล้ว (ไม่คิดภาษี)');
              HR.render();
            }
          });
        }
        return acts;
      }
    })
  });
})(window.HR);
