/* views-corehr.js — โมดูล 2: ฐานข้อมูลพนักงาน ผังองค์กร และการอนุมัติคำขอ */
(function (HR) {
  'use strict';
  var el = HR.el;

  function kv(k, v) { return el('div.field', [el('span.lbl', k), el('div', v == null || v === '' ? '-' : String(v))]); }

  /* ---------- ทะเบียนพนักงาน ---------- */
  HR.view('employees', {
    title: 'ทะเบียนพนักงาน',
    render: HR.crud('employees', {
      desc: 'ฐานข้อมูลกลางของพนักงานทุกบริษัทในเครือ — บริษัทที่สังกัดคือผู้จ่ายเงินได้และผู้หักภาษีในหนังสือ 50 ทวิ',
      footerSum: ['salary'],
      rowActions: function (r) { return [{ label: 'แฟ้มประวัติ', fn: function () { profile(r); } }]; },
      actions: function () {
        return [
          HR.btn('Export ทะเบียนเต็ม (Excel)', function () { HR.excel.exportRows(HR.rows('employees'), HR.exportCols('employees'), 'ทะเบียนพนักงาน'); }),
          HR.btn('แบบฟอร์มเปล่าเพื่อนำเข้า', function () {
            HR.excel.exportRows([], HR.exportCols('employees').filter(function (c) { return !c.noImport; }), 'แบบฟอร์มนำเข้าพนักงาน');
          })
        ];
      },
      before: function () {
        var all = HR.rows('employees');
        var active = all.filter(function (e) { return e.status === 'ทำงาน' || e.status === 'ทดลองงาน'; });
        var probation = all.filter(function (e) { return e.status === 'ทดลองงาน'; });
        var dueProbation = probation.filter(function (e) { return e.probationEnd && e.probationEnd <= HR.addDays(HR.today(), 30); });
        return el('div', { style: 'margin-bottom:16px' }, [
          el('div.grid.cols-4', [
            HR.kpi('พนักงานปัจจุบัน', active.length, 'คน', 'จากทั้งหมด ' + all.length + ' ระเบียน', 'lift'),
            HR.kpi('อยู่ระหว่างทดลองงาน', probation.length, 'คน', dueProbation.length ? dueProbation.length + ' คนครบกำหนดภายใน 30 วัน' : 'ไม่มีรายที่ใกล้ครบกำหนด', dueProbation.length ? 'warnbar' : ''),
            HR.kpi('ฐานเงินเดือนรวม', HR.num(HR.sum(active, function (e) { return e.salary; }), 0), 'บาท/เดือน'),
            HR.kpi('อายุงานเฉลี่ย', active.length ? HR.num(HR.sum(active, function (e) { return HR.yearsBetween(e.hireDate); }) / active.length, 1) : '0', 'ปี')
          ]),
          dueProbation.length ? el('div.callout.warn', { style: 'margin-top:12px' },
            'ครบกำหนดทดลองงานภายใน 30 วัน: ' + dueProbation.map(function (e) { return HR.label('employees', e) + ' (' + HR.date(e.probationEnd) + ')'; }).join(' · ')
          ) : null
        ]);
      }
    })
  });

  function profile(e) {
    var tabs = ['ข้อมูลพนักงาน', 'เวลาทำงาน', 'วันลา', 'ผลประเมิน', 'ทรัพย์สิน', 'ค่าจ้างและเอกสารภาษี'];
    var host = el('div'), idx = 0;

    function draw() {
      HR.clear(host);
      host.appendChild(HR.tabs(tabs, idx, function (i) { idx = i; draw(); }));
      host.appendChild(content());
    }
    function content() {
      if (idx === 0) {
        return el('div.stack', [
          el('div.grid.cols-3', [
            HR.kpi('อายุงาน', HR.num(HR.yearsBetween(e.hireDate, e.terminationDate), 1), 'ปี', 'เริ่มงาน ' + HR.dateTH(e.hireDate), 'lift'),
            HR.kpi('เงินเดือน', HR.num(e.salary, 0), 'บาท', e.positionAllowance ? 'ค่าตำแหน่งอีก ' + HR.num(e.positionAllowance, 0) + ' บาท' : ''),
            HR.kpi('อายุ', e.dob ? HR.age(e.dob) : '-', 'ปี', e.dob ? 'เกิด ' + HR.dateTH(e.dob) : '')
          ]),
          el('div.form-grid', [
            kv('รหัสพนักงาน', e.code), kv('บริษัทที่สังกัด', HR.nameOf('companies', e.companyId)),
            kv('ชื่อ-นามสกุล', (e.prefix || '') + e.firstName + ' ' + e.lastName),
            kv('เลขบัตรประชาชน', e.nationalId), kv('เพศ / สถานภาพ', (e.gender || '-') + ' / ' + (e.maritalStatus || '-')),
            kv('โทรศัพท์', e.phone), kv('อีเมล', e.email),
            kv('ฝ่าย', HR.nameOf('departments', e.deptId)), kv('ตำแหน่ง', HR.nameOf('positions', e.positionId)),
            kv('หัวหน้างาน', HR.nameOf('employees', e.managerId)), kv('ประเภทการจ้าง', e.employmentType),
            kv('สถานะ', e.status), kv('ครบทดลองงาน', HR.date(e.probationEnd)),
            kv('การศึกษา', [e.eduLevel, e.eduMajor, e.eduSchool].filter(Boolean).join(' · ')),
            kv('ประสบการณ์ก่อนเข้างาน', e.priorExperience ? e.priorExperience + ' ปี' : '-'),
            kv('ทักษะ', e.skills), kv('ที่อยู่', e.address),
            kv('ธนาคาร / เลขบัญชี', (e.bankName || '-') + ' ' + (e.bankAccount || '')),
            kv('เลขประกันสังคม', e.ssoNumber), kv('สะสม PVD', (e.pvdRate || 0) + '%'),
            kv('ผู้ติดต่อฉุกเฉิน', (e.emergencyContact || '-') + ' ' + (e.emergencyPhone || ''))
          ])
        ]);
      }
      if (idx === 1) {
        var att = HR.db.t('attendance').filter(function (a) { return a.employeeId === e.id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
        var sum = HR.engine.attendanceSummary(e.id, HR.thisMonth());
        return el('div.stack', [
          el('div.grid.cols-4', [
            HR.kpi('วันทำงานเดือนนี้', sum.workedDays, 'วัน'),
            HR.kpi('มาสาย', sum.lateCount, 'ครั้ง', 'รวม ' + sum.lateMinutes + ' นาที', sum.lateCount ? 'warnbar' : ''),
            HR.kpi('ขาดงาน', sum.absentDays, 'วัน', null, sum.absentDays ? 'dangerbar' : ''),
            HR.kpi('OT เดือนนี้', HR.num(sum.otTotalHours, 1), 'ชม.', sum.diligenceEligible ? 'ได้เบี้ยขยันเดือนนี้' : 'ไม่ได้เบี้ยขยันเดือนนี้')
          ]),
          HR.table({ cols: HR.listCols('attendance'), rows: att, exportName: 'เวลาทำงาน_' + e.code, pageSize: 12 })
        ]);
      }
      if (idx === 2) {
        var lv = HR.db.t('leaves').filter(function (l) { return l.employeeId === e.id; });
        var balRows = HR.db.t('leaveTypes').map(function (t) {
          var b = HR.engine.leaveBalance(e.id, t.name);
          return { type: t.name, entitled: b.entitled, used: b.used, remaining: b.remaining, paid: t.paid === false ? 'ไม่ได้ค่าจ้าง' : 'ได้ค่าจ้าง' };
        });
        return el('div.stack', [
          HR.card('สิทธิ์วันลาคงเหลือ ปี ' + (new Date().getFullYear() + 543), null, HR.table({
            cols: [{ k: 'type', l: 'ประเภทการลา' }, { k: 'entitled', l: 'สิทธิ์ (วัน)', num: 1, dec: 1 },
              { k: 'used', l: 'ใช้ไป', num: 1, dec: 1 }, { k: 'remaining', l: 'คงเหลือ', num: 1, dec: 1 }, { k: 'paid', l: 'ค่าจ้าง' }],
            rows: balRows, search: false, exportName: 'สิทธิ์วันลา_' + e.code
          })),
          HR.table({ cols: HR.listCols('leaves'), rows: lv, exportName: 'ใบลา_' + e.code, pageSize: 10 })
        ]);
      }
      if (idx === 3) {
        var gl = HR.db.t('goals').filter(function (g) { return g.employeeId === e.id; });
        var rv = HR.db.t('reviews').filter(function (r) { return r.employeeId === e.id; });
        var wScore = HR.sum(gl, function (g) { return (g.weight || 0) * (g.target ? Math.min(1.2, (g.actual || 0) / g.target) : 0); });
        var wTotal = HR.sum(gl, function (g) { return g.weight; });
        return el('div.stack', [
          el('div.grid.cols-3', [
            HR.kpi('คะแนน KPI ถ่วงน้ำหนัก', wTotal ? HR.num(wScore / wTotal * 100, 1) : '0', '%', 'น้ำหนักรวม ' + HR.num(wTotal, 0) + '%', 'lift'),
            HR.kpi('คะแนน 360 เฉลี่ย', rv.length ? HR.num(HR.sum(rv, HR.avgScore) / rv.length, 2) : '-', '/5', rv.length + ' มุมมอง'),
            HR.kpi('จำนวนเป้าหมาย', gl.length, 'ข้อ')
          ]),
          HR.table({ cols: HR.listCols('goals'), rows: gl, exportName: 'เป้าหมาย_' + e.code, search: false }),
          HR.table({ cols: HR.listCols('reviews'), rows: rv, exportName: 'ประเมิน_' + e.code, search: false })
        ]);
      }
      if (idx === 4) {
        var as = HR.db.t('assets').filter(function (a) { return a.employeeId === e.id; });
        return HR.table({ cols: HR.listCols('assets'), rows: as, exportName: 'ทรัพย์สิน_' + e.code, footerSum: ['value'] });
      }
      var slips = HR.db.t('payslips').filter(function (p) { return p.employeeId === e.id; })
        .sort(function (a, b) { return a.period < b.period ? 1 : -1; });
      var certs = HR.db.t('wht50').filter(function (c) { return c.employeeId === e.id; });
      return el('div.stack', [
        HR.table({
          cols: [{ k: 'period', l: 'งวด', fmt: function (s) { return HR.monthName(s.period); } }].concat(HR.listCols('payslips').slice(1)),
          rows: slips, exportName: 'ประวัติเงินเดือน_' + e.code, footerSum: ['gross', 'net', 'tax', 'sso'],
          actions: function (s) {
            return [{ label: 'ดูสลิป', fn: function () { HR.showPayslip(s, HR.db.byId('payPeriods', s.periodId) || { payDate: s.period + '-25' }); } }];
          }
        }),
        HR.card('หนังสือรับรองการหักภาษี 50 ทวิ', certs.length + ' ฉบับ', HR.table({
          cols: [
            { k: 'taxYear', l: 'ปีภาษี', fmt: function (c) { return c.taxYear + 543; } },
            { k: 'seq', l: 'เล่มที่/เลขที่', fmt: function (c) { return (c.bookNo || '-') + ' / ' + (c.seq || '-'); } },
            { k: 'totalIncome', l: 'เงินได้ทั้งปี', num: 1 },
            { k: 'totalTax', l: 'ภาษีที่หัก', num: 1 },
            { k: 'issuedDate', l: 'วันที่ออก', fmt: function (c) { return HR.date(c.issuedDate); } }
          ],
          rows: certs, search: false, exportName: '50ทวิ_' + e.code,
          empty: { title: 'ยังไม่ได้ออกหนังสือ 50 ทวิ', hint: 'ออกได้ที่เมนู "หนังสือรับรองการหักภาษี 50 ทวิ"' },
          actions: function (c) { return [{ label: 'เปิดหนังสือ', fn: function () { HR.show50Twi(c); } }]; }
        }))
      ]);
    }
    draw();

    HR.modal({
      title: 'แฟ้มประวัติ — ' + HR.label('employees', e), size: 'wide', body: host,
      buttons: [
        { label: 'ปิด' },
        { label: 'Export แฟ้มนี้ (Excel)', fn: function () { exportProfile(e); } },
        { label: 'แก้ไขข้อมูล', cls: 'btn-primary', fn: function () { HR.openEditor('employees', e); } }
      ]
    });
  }

  function exportProfile(e) {
    HR.excel.exportWorkbook([
      { name: 'ข้อมูลพนักงาน', aoa: [['หัวข้อ', 'ข้อมูล']].concat(HR.exportCols('employees').map(function (c) { return [c.l, c.fmt ? String(c.fmt(e)) : (e[c.k] == null ? '' : e[c.k])]; })) },
      { name: 'เวลาทำงาน', rows: HR.db.t('attendance').filter(function (a) { return a.employeeId === e.id; }), cols: HR.exportCols('attendance') },
      { name: 'ใบลา', rows: HR.db.t('leaves').filter(function (l) { return l.employeeId === e.id; }), cols: HR.exportCols('leaves') },
      { name: 'เป้าหมาย', rows: HR.db.t('goals').filter(function (g) { return g.employeeId === e.id; }), cols: HR.exportCols('goals') },
      { name: 'ผลประเมิน', rows: HR.db.t('reviews').filter(function (r) { return r.employeeId === e.id; }), cols: HR.exportCols('reviews') },
      { name: 'ทรัพย์สิน', rows: HR.db.t('assets').filter(function (a) { return a.employeeId === e.id; }), cols: HR.exportCols('assets') },
      { name: 'สลิปเงินเดือน', rows: HR.db.t('payslips').filter(function (p) { return p.employeeId === e.id; }), cols: HR.exportCols('payslips') },
      { name: '50ทวิ', rows: HR.db.t('wht50').filter(function (c) { return c.employeeId === e.id; }), cols: HR.exportCols('wht50') }
    ], 'แฟ้มประวัติ_' + e.code);
  }

  /* ---------- ฝ่าย / ตำแหน่ง ---------- */
  HR.view('departments', {
    title: 'ฝ่าย/แผนก',
    render: HR.crud('departments', {
      desc: 'โครงสร้างฝ่ายและศูนย์ต้นทุน — เว้นช่อง "บริษัท" ไว้ถ้าต้องการใช้ฝ่ายนี้ร่วมกันทุกบริษัทในเครือ',
      footerSum: ['headcountPlan'],
      before: function () {
        var rows = HR.rows('departments').map(function (d) {
          var act = HR.db.t('employees').filter(function (e) { return e.deptId === d.id && e.status !== 'ลาออก' && e.status !== 'เลิกจ้าง'; });
          return { name: d.name, plan: d.headcountPlan || 0, actual: act.length, gap: (d.headcountPlan || 0) - act.length, cost: HR.sum(act, function (e) { return e.salary; }) };
        });
        return el('div', { style: 'margin-bottom:16px' }, [
          HR.card('อัตรากำลังเทียบแผน', null, HR.table({
            cols: [{ k: 'name', l: 'ฝ่าย' }, { k: 'plan', l: 'แผน', num: 1, dec: 0 }, { k: 'actual', l: 'มีจริง', num: 1, dec: 0 },
              { k: 'gap', l: 'ขาด/เกิน', num: 1, dec: 0 }, { k: 'cost', l: 'ฐานเงินเดือนรวม', num: 1 }],
            rows: rows, search: false, exportName: 'อัตรากำลัง', footerSum: ['plan', 'actual', 'gap', 'cost']
          }))
        ]);
      }
    })
  });

  HR.view('positions', {
    title: 'ตำแหน่งงาน',
    render: HR.crud('positions', { desc: 'โครงสร้างตำแหน่ง ระดับงาน และกรอบเงินเดือนที่ใช้ตรวจความสอดคล้องของค่าจ้าง' })
  });

  /* ---------- ผังองค์กร ---------- */
  HR.view('orgchart', {
    title: 'ผังองค์กร',
    render: function () {
      var emps = HR.rows('employees').filter(function (e) { return e.status !== 'ลาออก' && e.status !== 'เลิกจ้าง'; });
      var ids = {};
      emps.forEach(function (e) { ids[e.id] = true; });
      var byMgr = HR.groupBy(emps, function (e) { return (e.managerId && ids[e.managerId]) ? e.managerId : '_root'; });

      function node(e, depth) {
        var kids = (byMgr[e.id] || []).sort(function (a, b) { return a.code < b.code ? -1 : 1; });
        var box = el('div', [
          el('div.org-node', [
            el('span.nm', e.firstName + ' ' + e.lastName),
            el('span.faint', HR.nameOf('positions', e.positionId)),
            HR.badge(HR.nameOf('departments', e.deptId), 'accent'),
            kids.length ? HR.badge('ทีม ' + kids.length + ' คน') : null
          ])
        ]);
        if (kids.length && depth < 6) box.appendChild(el('div.org-kids', kids.map(function (k) { return node(k, depth + 1); })));
        return box;
      }
      var roots = (byMgr._root || []).sort(function (a, b) { return a.code < b.code ? -1 : 1; });
      var tree = el('div.org', roots.map(function (r) { return node(r, 0); }));

      return el('div', [
        HR.pageHead('ผังองค์กร', 'สร้างจากฟิลด์ "หัวหน้างาน" ในทะเบียนพนักงาน — แสดงเฉพาะบริษัทที่เลือกอยู่', [
          HR.btn('Export ผังองค์กร (Excel)', function () {
            var aoa = [['ระดับ', 'รหัสพนักงาน', 'ชื่อ-นามสกุล', 'บริษัท', 'ตำแหน่ง', 'ฝ่าย', 'หัวหน้างาน', 'จำนวนลูกทีม', 'เงินเดือน']];
            (function walk(list, lvl) {
              list.sort(function (a, b) { return a.code < b.code ? -1 : 1; }).forEach(function (e) {
                aoa.push([lvl, e.code, e.firstName + ' ' + e.lastName, HR.nameOf('companies', e.companyId),
                  HR.nameOf('positions', e.positionId), HR.nameOf('departments', e.deptId),
                  HR.nameOf('employees', e.managerId), (byMgr[e.id] || []).length, e.salary]);
                walk(byMgr[e.id] || [], lvl + 1);
              });
            })(roots.slice(), 1);
            HR.excel.exportAOA(aoa, 'ผังองค์กร', 'ผังองค์กร');
          }, 'btn-primary')
        ]),
        el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('จำนวนระดับการบังคับบัญชา', depthOf(roots, byMgr), 'ระดับ', null, 'lift'),
          HR.kpi('ผู้บังคับบัญชา', emps.filter(function (e) { return (byMgr[e.id] || []).length; }).length, 'คน'),
          HR.kpi('ขนาดทีมเฉลี่ย', avgSpan(emps, byMgr), 'คน/หัวหน้า'),
          HR.kpi('พนักงานทั้งหมด', emps.length, 'คน')
        ]),
        HR.card('แผนภาพสายการบังคับบัญชา', null, tree)
      ]);
    }
  });
  function depthOf(roots, byMgr) {
    var max = 0;
    (function walk(list, d) {
      if (!list.length) return;
      max = Math.max(max, d);
      list.forEach(function (e) { walk(byMgr[e.id] || [], d + 1); });
    })(roots, 1);
    return max;
  }
  function avgSpan(emps, byMgr) {
    var mgrs = emps.filter(function (e) { return (byMgr[e.id] || []).length; });
    return mgrs.length ? HR.num(HR.sum(mgrs, function (m) { return byMgr[m.id].length; }) / mgrs.length, 1) : '0';
  }

  /* ---------- ฟอร์มส่งคำขอ (ใช้ร่วมกับหน้าของพนักงาน) ---------- */
  HR.newRequest = function (name, empId) {
    var pre = { employeeId: empId, status: 'รออนุมัติ' };
    if (name === 'leaves') { pre.dateFrom = HR.today(); pre.dateTo = HR.today(); pre.days = 1; }
    else { pre.date = HR.today(); }
    var d = HR.schema[name];
    var form = HR.form(d.fields, pre);
    if (name === 'leaves' && form.inputs.dateFrom) {
      var f = form.inputs.dateFrom.node, t = form.inputs.dateTo.node, dd = form.inputs.days.node;
      var recalc = function () {
        if (f.value && t.value) { var n = HR.daysBetween(f.value, t.value); if (n > 0) dd.value = n; }
      };
      f.addEventListener('change', recalc); t.addEventListener('change', recalc);
    }
    HR.modal({
      title: 'ส่งคำขอ — ' + d.title, size: 'wide', body: form.el,
      buttons: [{ label: 'ยกเลิก' }, {
        label: 'ส่งคำขอ', cls: 'btn-primary', keepOpen: true, fn: function (close) {
          var bad = form.validate();
          if (bad.length) { HR.toast('กรอกให้ครบ: ' + bad.join(', '), 'err'); return false; }
          var v = form.get();
          if (name === 'leaves') {
            var lt = HR.db.byId('leaveTypes', v.leaveTypeId);
            if (lt) {
              var b = HR.engine.leaveBalance(v.employeeId, lt.name);
              if (v.days > b.remaining && lt.paid !== false) {
                HR.toast('วันลาคงเหลือของ ' + lt.name + ' มี ' + b.remaining + ' วัน แต่ขอลา ' + v.days + ' วัน — ส่วนที่เกินจะถูกหักค่าจ้าง', 'warn');
              }
            }
          }
          HR.db.insert(name, v);
          HR.toast('ส่งคำขอเรียบร้อย รอหัวหน้างานอนุมัติ');
          close(); HR.render();
        }
      }]
    });
  };

  /* ---------- กล่องอนุมัติ ---------- */
  HR.view('approvals', {
    title: 'กล่องอนุมัติคำขอ', perm: 'lead',
    render: function () {
      var hrView = HR.isHR();
      var teamIds = {};
      HR.myTeam().forEach(function (e) { teamIds[e.id] = true; });
      var sources = [
        { name: 'leaves', label: 'ใบลา', amount: function (r) { return r.days + ' วัน'; } },
        { name: 'otRequests', label: 'ขอ OT', amount: function (r) { var e = HR.db.byId('employees', r.employeeId); return HR.num(r.hours, 1) + ' ชม. ≈ ' + HR.money(e ? HR.engine.otAmount(e.salary, r.hours, r.otType) : 0) + ' บาท'; } },
        { name: 'expenses', label: 'เบิกค่าใช้จ่าย', amount: function (r) { return HR.money(r.amount) + ' บาท'; } }
      ];
      var pending = [];
      sources.forEach(function (s) {
        HR.rows(s.name).filter(function (r) { return r.status === 'รออนุมัติ'; }).forEach(function (r) {
          var emp = HR.db.byId('employees', r.employeeId) || {};
          if (!hrView && !teamIds[r.employeeId]) return;   /* หัวหน้างานเห็นเฉพาะลูกทีมสายตรง */
          pending.push({
            kind: s.label, src: s.name, row: r,
            employee: HR.nameOf('employees', r.employeeId),
            dept: HR.nameOf('departments', emp.deptId),
            company: HR.nameOf('companies', emp.companyId),
            manager: HR.nameOf('employees', emp.managerId),
            date: r.dateFrom || r.date,
            detail: (r.leaveTypeId ? HR.nameOf('leaveTypes', r.leaveTypeId) : r.category || r.otType || '') + ' — ' + (r.reason || r.detail || ''),
            value: s.amount(r)
          });
        });
      });
      var host = el('div', HR.table({
        cols: [
          { k: 'kind', l: 'ประเภทคำขอ', badge: function () { return 'accent'; } },
          { k: 'employee', l: 'พนักงาน' },
          { k: 'company', l: 'บริษัท' },
          { k: 'dept', l: 'ฝ่าย' },
          { k: 'manager', l: 'หัวหน้างาน' },
          { k: 'date', l: 'วันที่', fmt: function (r) { return HR.date(r.date); } },
          { k: 'detail', l: 'รายละเอียด' }, { k: 'value', l: 'จำนวน' }
        ],
        rows: pending, exportName: 'คำขอที่รออนุมัติ',
        empty: { title: 'ไม่มีคำขอค้างอนุมัติ', hint: 'คำขอลา ขอ OT และเบิกค่าใช้จ่ายที่บันทึกไว้จะมารออนุมัติที่นี่' },
        actions: function (p) {
          return [
            { label: 'อนุมัติ', fn: function () { HR.approve(p.src, p.row, 'อนุมัติ'); } },
            { label: 'ไม่อนุมัติ', cls: 'btn-danger', fn: function () { HR.approve(p.src, p.row, 'ไม่อนุมัติ'); } }
          ];
        }
      }));

      return el('div', [
        HR.pageHead('กล่องอนุมัติคำขอ',
          hrView ? 'รวมคำขอลา ขอ OT และเบิกค่าใช้จ่ายที่รอการอนุมัติในบริษัทที่เลือกอยู่'
                 : 'คำขอของลูกทีมสายตรงที่รอคุณพิจารณา', [
          HR.btn('อนุมัติทั้งหมด', function () {
            if (!pending.length) { HR.toast('ไม่มีคำขอค้างอยู่', 'warn'); return; }
            HR.confirm('อนุมัติคำขอที่ค้างอยู่ทั้งหมด ' + pending.length + ' รายการ?', 'อนุมัติทั้งหมด').then(function (ok) {
              if (!ok) return;
              pending.forEach(function (p) {
                HR.db.update(p.src, p.row.id, { status: 'อนุมัติ', approvedAt: HR.today() });
              });
              HR.toast('อนุมัติ ' + pending.length + ' รายการแล้ว'); HR.render();
            });
          }, 'btn-primary')
        ]),
        el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('คำขอค้างทั้งหมด', pending.length, 'รายการ', null, pending.length ? 'warnbar' : 'lift'),
          HR.kpi('ใบลา', pending.filter(function (p) { return p.src === 'leaves'; }).length, 'รายการ'),
          HR.kpi('ขอ OT', pending.filter(function (p) { return p.src === 'otRequests'; }).length, 'รายการ'),
          HR.kpi('ยอดเบิกค่าใช้จ่าย', HR.money(HR.sum(pending.filter(function (p) { return p.src === 'expenses'; }), function (p) { return p.row.amount; })), 'บาท')
        ]),
        host
      ]);
    }
  });
})(window.HR);
