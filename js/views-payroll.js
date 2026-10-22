/* views-payroll.js — โมดูล 4: เงินเดือน ภาษี ประกันสังคม PVD ไฟล์ธนาคาร และหนังสือรับรอง 50 ทวิ */
(function (HR) {
  'use strict';
  var el = HR.el;

  function companyOfPeriod(period) {
    return (period && period.companyId ? HR.db.byId('companies', period.companyId) : null) || HR.CO() || HR.db.t('companies')[0] || {};
  }
  function activeIn(period) {
    return HR.db.t('employees').filter(function (e) {
      if (period.companyId && e.companyId !== period.companyId) return false;
      if (!e.hireDate || e.hireDate.slice(0, 7) > period.period) return false;
      if (e.terminationDate && e.terminationDate.slice(0, 7) < period.period) return false;
      return true;
    });
  }

  /* ================= รอบจ่ายเงินเดือน ================= */
  HR.view('payPeriods', {
    title: 'รอบจ่ายเงินเดือน',
    render: HR.crud('payPeriods', {
      desc: 'แต่ละบริษัทในเครือมีรอบจ่ายของตัวเอง คำนวณและปิดงวดแยกกัน',
      defaults: function () {
        var co = HR.CO() || HR.myCompanies()[0] || {};
        var m = HR.thisMonth();
        return { companyId: co.id, period: m, payDate: m + '-' + String(co.payDay || 25).padStart(2, '0'), status: 'ร่าง' };
      },
      rowActions: function (r) {
        return [
          { label: 'เปิดรอบ', fn: function () { HR.go('payrollRun?id=' + r.id); } },
          { label: 'คำนวณ', fn: function () { runPayroll(r); } }
        ];
      },
      before: function () {
        var periods = HR.rows('payPeriods');
        var last = periods.filter(function (p) { return p.status === 'จ่ายแล้ว'; }).sort(function (a, b) { return a.period < b.period ? 1 : -1; })[0];
        var slips = last ? HR.db.t('payslips').filter(function (s) { return s.periodId === last.id; }) : [];
        return el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('งวดในขอบเขตที่ดูอยู่', periods.length, 'งวด', null, 'lift'),
          HR.kpi('งวดล่าสุดที่จ่าย', last ? HR.monthName(last.period) : '-', '', last ? HR.nameOf('companies', last.companyId) : ''),
          HR.kpi('เงินสุทธิงวดล่าสุด', HR.money(HR.sum(slips, function (s) { return s.net; })), 'บาท'),
          HR.kpi('ต้นทุนแรงงานงวดล่าสุด', HR.money(HR.sum(slips, function (s) { return s.laborCost; })), 'บาท', 'รวมเงินสมทบนายจ้าง')
        ]);
      }
    })
  });

  function runPayroll(period) {
    var emps = activeIn(period);
    if (!emps.length) { HR.toast('ไม่มีพนักงานของบริษัทนี้ในงวดดังกล่าว', 'err'); return; }
    HR.confirm('คำนวณเงินเดือนงวด ' + HR.monthName(period.period) + ' ของ ' + HR.nameOf('companies', period.companyId) +
      ' สำหรับพนักงาน ' + emps.length + ' คน? ผลการคำนวณเดิมของงวดนี้จะถูกแทนที่', 'คำนวณเงินเดือน')
      .then(function (ok) {
        if (!ok) return;
        HR.db.t('payslips').filter(function (s) { return s.periodId === period.id; }).forEach(function (s) { HR.db.remove('payslips', s.id); });
        emps.forEach(function (e) { HR.db.insert('payslips', HR.engine.payslip(e, period)); });
        HR.db.update('payPeriods', period.id, { status: 'คำนวณแล้ว' });
        HR.toast('คำนวณเงินเดือน ' + emps.length + ' คนเรียบร้อย');
        HR.go('payrollRun?id=' + period.id);
      });
  }

  /* ================= หน้าทำงานของรอบจ่าย ================= */
  HR.view('payrollRun', {
    title: 'คำนวณและตรวจเงินเดือน',
    render: function (p) {
      var all = HR.rows('payPeriods').sort(function (a, b) { return a.period < b.period ? 1 : -1; });
      var period = p.id ? HR.db.byId('payPeriods', p.id) : all[0];
      if (!period) {
        return el('div', [
          HR.pageHead('คำนวณและตรวจเงินเดือน'),
          el('div.callout.warn', 'ยังไม่มีรอบจ่ายของบริษัทที่เลือกอยู่'),
          el('div.row', { style: 'margin-top:12px' }, [HR.btn('สร้างรอบจ่ายใหม่', function () { HR.go('payPeriods'); }, 'btn-primary')])
        ]);
      }
      var co = companyOfPeriod(period);
      var slips = HR.db.t('payslips').filter(function (s) { return s.periodId === period.id; });
      var emps = activeIn(period);

      var sel = el('select', { style: 'max-width:340px' });
      all.forEach(function (x) {
        sel.appendChild(el('option', { value: x.id }, HR.monthName(x.period) + ' · ' + HR.nameOf('companies', x.companyId) + ' · ' + x.status));
      });
      sel.value = period.id;
      sel.addEventListener('change', function () { HR.go('payrollRun?id=' + sel.value); });

      var cols = [
        { k: 'code', l: 'รหัส', w: 90, fmt: function (s) { return (HR.db.byId('employees', s.employeeId) || {}).code; } },
        { k: 'name', l: 'ชื่อ-นามสกุล', fmt: function (s) { var e = HR.db.byId('employees', s.employeeId) || {}; return e.firstName + ' ' + e.lastName; } },
        { k: 'dept', l: 'ฝ่าย', fmt: function (s) { return HR.nameOf('departments', (HR.db.byId('employees', s.employeeId) || {}).deptId); } },
        { k: 'gross', l: 'รายได้รวม', num: 1 },
        { k: 'ot', l: 'ค่า OT', num: 1, fmt: otOf, raw: otOf },
        { k: 'sso', l: 'ประกันสังคม', num: 1 },
        { k: 'pvdEmployee', l: 'PVD ลูกจ้าง', num: 1 },
        { k: 'tax', l: 'ภาษีหัก ณ ที่จ่าย', num: 1 },
        { k: 'totalDeduction', l: 'หักรวม', num: 1 },
        { k: 'net', l: 'เงินสุทธิ', num: 1 },
        { k: 'laborCost', l: 'ต้นทุนนายจ้าง', num: 1 }
      ];
      function otOf(s) { return HR.sum(s.earnings.filter(function (x) { return x.ot; }), function (x) { return x.amount; }); }

      return el('div', [
        HR.pageHead('รอบจ่าย ' + HR.monthName(period.period) + ' — ' + (co.name || ''),
          'ดึงข้อมูลจากบันทึกเวลา OT ที่อนุมัติ ขาด/ลา/สาย และรายการปรับพิเศษ แล้วคำนวณประกันสังคม PVD และภาษีหัก ณ ที่จ่ายให้อัตโนมัติ', [
          HR.btn('คำนวณ/คำนวณใหม่', function () { runPayroll(period); }, 'btn-primary'),
          HR.btn('รายการปรับพิเศษ', function () { HR.go('payAdjustments'); }),
          HR.btn('ทะเบียนจ่ายทั้งงวด (Excel)', function () { payrollRegister(period, slips, co); }),
          HR.btn('ไฟล์ส่งธนาคาร', function () { bankFile(period, slips, co); }),
          HR.btn('ภ.ง.ด.1', function () { pnd1(period, slips, co); })
        ]),

        el('div.row', { style: 'margin-bottom:14px' }, [el('span.faint', 'เลือกงวด'), sel, HR.badge(period.status, HR.bk(period.status)),
          el('span.faint', 'วันจ่าย ' + HR.dateTH(period.payDate))]),

        el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('พนักงานในงวด', slips.length, '/' + emps.length + ' คน', slips.length ? 'คำนวณแล้ว' : 'ยังไม่ได้คำนวณ', slips.length ? 'lift' : 'warnbar'),
          HR.kpi('รายได้รวม', HR.money(HR.sum(slips, function (s) { return s.gross; })), 'บาท'),
          HR.kpi('เงินสุทธิที่ต้องโอน', HR.money(HR.sum(slips, function (s) { return s.net; })), 'บาท'),
          HR.kpi('ต้นทุนแรงงานรวม', HR.money(HR.sum(slips, function (s) { return s.laborCost; })), 'บาท', 'รวมสมทบประกันสังคมและ PVD ฝั่งนายจ้าง')
        ]),

        el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('ประกันสังคมลูกจ้าง', HR.money(HR.sum(slips, function (s) { return s.sso; })), 'บาท'),
          HR.kpi('ประกันสังคมนายจ้าง', HR.money(HR.sum(slips, function (s) { return s.ssoEmployer; })), 'บาท', 'ยอดนำส่ง สปส. รวม ' + HR.money(HR.sum(slips, function (s) { return s.sso + s.ssoEmployer; })) + ' บาท'),
          HR.kpi('ภาษีหัก ณ ที่จ่าย', HR.money(HR.sum(slips, function (s) { return s.tax; })), 'บาท', 'นำส่งตาม ภ.ง.ด.1'),
          HR.kpi('กองทุนสำรองเลี้ยงชีพ', HR.money(HR.sum(slips, function (s) { return s.pvdEmployee + s.pvdEmployer; })), 'บาท', 'ลูกจ้าง + นายจ้าง')
        ]),

        slips.length ? HR.table({
          cols: cols, rows: slips, exportName: 'ทะเบียนจ่ายเงินเดือน_' + period.period,
          footerSum: ['gross', 'ot', 'sso', 'pvdEmployee', 'tax', 'totalDeduction', 'net', 'laborCost'],
          pageSize: 30,
          actions: function (s) { return [{ label: 'ดูสลิป', fn: function () { HR.showPayslip(s, period); } }]; }
        }) : el('div.empty', [el('b', 'ยังไม่ได้คำนวณงวดนี้'), 'กดปุ่ม "คำนวณ/คำนวณใหม่" เพื่อดึงข้อมูลเวลาทำงานและคำนวณเงินเดือน']),

        el('div', { style: 'height:16px' }),
        el('div.row', [
          HR.btn('อนุมัติงวดนี้', function () {
            if (!slips.length) { HR.toast('คำนวณเงินเดือนก่อนอนุมัติ', 'err'); return; }
            HR.db.update('payPeriods', period.id, { status: 'อนุมัติ' });
            HR.toast('อนุมัติงวด ' + HR.monthName(period.period) + ' แล้ว'); HR.render();
          }),
          HR.btn('บันทึกว่าจ่ายแล้ว', function () {
            HR.confirm('ยืนยันว่าโอนเงินงวด ' + HR.monthName(period.period) + ' เรียบร้อยแล้ว? งวดนี้จะถูกปิด', 'ยืนยันการจ่าย').then(function (ok) {
              if (!ok) return;
              HR.db.update('payPeriods', period.id, { status: 'จ่ายแล้ว' });
              HR.toast('ปิดงวดเรียบร้อย'); HR.render();
            });
          })
        ])
      ]);
    }
  });

  /* ================= สลิปเงินเดือน ================= */
  HR.showPayslip = function (s, period) {
    var e = HR.db.byId('employees', s.employeeId) || {};
    var co = companyOfPeriod(period);
    var lines = function (arr) {
      var t = el('table.slip-lines');
      arr.forEach(function (x) { t.appendChild(el('tr', [el('td', x.name), el('td', HR.money(x.amount))])); });
      return t;
    };
    var body = el('div.slip.printable', [
      el('div.slip-head', [
        el('div', [
          el('h3', co.name || ''),
          el('div.faint', co.address || ''),
          el('div.faint', 'เลขประจำตัวผู้เสียภาษี ' + (co.taxId || '-'))
        ]),
        el('div', { style: 'text-align:right' }, [
          el('h3', 'สลิปเงินเดือน'),
          el('div.faint', 'งวด ' + HR.monthName(s.period)),
          el('div.faint', 'วันจ่าย ' + HR.dateTH(period.payDate))
        ])
      ]),
      el('div.slip-grid', [
        el('div', [
          el('div.faint', 'พนักงาน'),
          el('div', { style: 'font-weight:600' }, (e.prefix || '') + e.firstName + ' ' + e.lastName + ' (' + e.code + ')'),
          el('div.faint', HR.nameOf('positions', e.positionId) + ' · ' + HR.nameOf('departments', e.deptId)),
          el('div.faint', 'เลขประกันสังคม ' + (e.ssoNumber || '-')),
          el('div.faint', 'โอนเข้า ' + (e.bankName || '-') + ' เลขที่ ' + (e.bankAccount || '-'))
        ]),
        el('div', [
          el('div.faint', 'สรุปเวลาทำงาน'),
          el('div', 'วันทำงาน ' + s.attendance.workedDays + ' วัน · ขาดงาน ' + s.attendance.absentDays + ' วัน'),
          el('div', 'มาสาย ' + s.attendance.lateCount + ' ครั้ง (' + s.attendance.lateMinutes + ' นาที)'),
          el('div', 'OT รวม ' + HR.num(s.attendance.otTotalHours, 1) + ' ชั่วโมง'),
          el('div', 'ลาไม่รับค่าจ้าง ' + HR.num(s.attendance.unpaidLeaveDays, 1) + ' วัน')
        ])
      ]),
      el('div.slip-grid', { style: 'margin-top:16px' }, [
        el('div', [el('div.faint', { style: 'font-weight:600;margin-bottom:6px' }, 'รายได้'), lines(s.earnings),
          el('table.slip-lines', el('tr.tot', [el('td', 'รวมรายได้'), el('td', HR.money(s.gross))]))]),
        el('div', [el('div.faint', { style: 'font-weight:600;margin-bottom:6px' }, 'รายการหัก'), lines(s.deductions),
          el('table.slip-lines', el('tr.tot', [el('td', 'รวมรายการหัก'), el('td', HR.money(s.totalDeduction))]))])
      ]),
      el('div.slip-net', [el('div', 'เงินได้สุทธิที่โอนเข้าบัญชี'), el('b', HR.money(s.net) + ' บาท')]),
      el('div', { style: 'margin-top:14px' }, [
        el('div.faint', { style: 'font-weight:600' }, 'ที่มาของภาษีหัก ณ ที่จ่าย (ประมาณการทั้งปี)'),
        el('table.slip-lines', [
          el('tr', [el('td', 'เงินได้พึงประเมินทั้งปี'), el('td', HR.money(s.taxDetail.annualIncome))]),
          el('tr', [el('td', 'หักค่าใช้จ่าย 50% (ไม่เกิน 100,000)'), el('td', HR.money(s.taxDetail.expense))]),
          el('tr', [el('td', 'หักค่าลดหย่อนรวม'), el('td', HR.money(s.taxDetail.allowance))]),
          el('tr', [el('td', 'เงินได้สุทธิเพื่อคำนวณภาษี'), el('td', HR.money(s.taxDetail.netIncome))]),
          el('tr', [el('td', 'ภาษีทั้งปี'), el('td', HR.money(s.taxDetail.annualTax))]),
          el('tr.tot', [el('td', 'ภาษีที่หักต่อเดือน'), el('td', HR.money(s.taxDetail.monthlyTax))])
        ]),
        el('div.faint', { style: 'margin-top:8px' }, 'เอกสารนี้สร้างโดยระบบ ไม่ต้องลงนาม — เก็บไว้เป็นหลักฐานการจ่ายค่าจ้างตามกฎหมาย')
      ])
    ]);

    HR.modal({
      title: 'สลิปเงินเดือน — ' + HR.label('employees', e), size: 'wide', body: body,
      buttons: [
        { label: 'ปิด' },
        {
          label: 'ดาวน์โหลด Excel', fn: function () {
            var aoa = [[co.name], ['สลิปเงินเดือน งวด ' + HR.monthName(s.period)], [],
              ['พนักงาน', (e.prefix || '') + e.firstName + ' ' + e.lastName], ['รหัสพนักงาน', e.code],
              ['ตำแหน่ง', HR.nameOf('positions', e.positionId)], ['ฝ่าย', HR.nameOf('departments', e.deptId)],
              ['ธนาคาร', (e.bankName || '') + ' ' + (e.bankAccount || '')], [], ['รายได้', 'จำนวนเงิน']];
            s.earnings.forEach(function (x) { aoa.push([x.name, x.amount]); });
            aoa.push(['รวมรายได้', s.gross], [], ['รายการหัก', 'จำนวนเงิน']);
            s.deductions.forEach(function (x) { aoa.push([x.name, x.amount]); });
            aoa.push(['รวมรายการหัก', s.totalDeduction], [], ['เงินได้สุทธิ', s.net]);
            HR.excel.exportAOA(aoa, 'สลิป', 'สลิป_' + e.code + '_' + s.period);
          }
        },
        { label: 'พิมพ์', cls: 'btn-primary', fn: function () { HR.printNode(body, 'สลิปเงินเดือน'); return false; } }
      ]
    });
  };

  /* ================= ทะเบียนจ่ายเงินเดือน ================= */
  function payrollRegister(period, slips, co) {
    if (!slips.length) { HR.toast('ยังไม่มีผลการคำนวณในงวดนี้', 'err'); return; }
    var head = [['รหัส', 'ชื่อ-นามสกุล', 'ฝ่าย', 'ตำแหน่ง', 'เงินเดือน', 'ค่าตำแหน่ง', 'ค่า OT', 'เบี้ยขยัน', 'ปรับเพิ่มอื่น',
      'รายได้รวม', 'หักขาด/ลา/สาย', 'ประกันสังคม', 'PVD ลูกจ้าง', 'ภาษีหัก ณ ที่จ่าย', 'หักอื่น', 'หักรวม', 'เงินสุทธิ',
      'สปส.นายจ้าง', 'PVD นายจ้าง', 'ต้นทุนนายจ้างรวม', 'ธนาคาร', 'เลขที่บัญชี']];
    function pick(arr, test) { return HR.round2(HR.sum(arr.filter(test), function (x) { return x.amount; })); }
    slips.forEach(function (s) {
      var e = HR.db.byId('employees', s.employeeId) || {};
      head.push([e.code, e.firstName + ' ' + e.lastName, HR.nameOf('departments', e.deptId), HR.nameOf('positions', e.positionId),
        pick(s.earnings, function (x) { return x.name === 'เงินเดือน'; }),
        pick(s.earnings, function (x) { return x.name === 'ค่าตำแหน่ง'; }),
        pick(s.earnings, function (x) { return x.ot; }),
        pick(s.earnings, function (x) { return x.name === 'เบี้ยขยัน'; }),
        pick(s.earnings, function (x) { return x.adj; }),
        s.gross,
        pick(s.deductions, function (x) { return !x.statutory && !x.adj; }),
        s.sso, s.pvdEmployee, s.tax,
        pick(s.deductions, function (x) { return x.adj; }),
        s.totalDeduction, s.net, s.ssoEmployer, s.pvdEmployer, s.laborCost,
        e.bankName || '', e.bankAccount || '']);
    });

    var byDept = HR.groupBy(slips, function (s) { return HR.nameOf('departments', (HR.db.byId('employees', s.employeeId) || {}).deptId); });
    var deptAoa = [['ฝ่าย', 'จำนวนคน', 'รายได้รวม', 'เงินสุทธิ', 'ต้นทุนนายจ้างรวม']];
    Object.keys(byDept).forEach(function (d) {
      deptAoa.push([d, byDept[d].length, HR.round2(HR.sum(byDept[d], function (s) { return s.gross; })),
        HR.round2(HR.sum(byDept[d], function (s) { return s.net; })), HR.round2(HR.sum(byDept[d], function (s) { return s.laborCost; }))]);
    });

    var ssoAoa = [['สถานประกอบการ', co.name, 'เลขที่บัญชีนายจ้าง', co.ssoAccount || ''], [],
      ['ลำดับ', 'เลขประกันสังคม', 'เลขบัตรประชาชน', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'ค่าจ้าง', 'เงินสมทบลูกจ้าง', 'เงินสมทบนายจ้าง', 'รวม']];
    slips.filter(function (s) { return s.sso > 0; }).forEach(function (s, i) {
      var e = HR.db.byId('employees', s.employeeId) || {};
      ssoAoa.push([i + 1, e.ssoNumber || '', e.nationalId || '', e.prefix || '', e.firstName, e.lastName,
        s.taxableBase, s.sso, s.ssoEmployer, HR.round2(s.sso + s.ssoEmployer)]);
    });

    var pvdAoa = [['รหัส', 'ชื่อ-นามสกุล', 'ค่าจ้าง', 'อัตราสะสมลูกจ้าง (%)', 'เงินสะสมลูกจ้าง', 'อัตราสมทบนายจ้าง (%)', 'เงินสมทบนายจ้าง', 'รวมเข้ากองทุน']];
    slips.filter(function (s) { return s.pvdEmployee > 0 || s.pvdEmployer > 0; }).forEach(function (s) {
      var e = HR.db.byId('employees', s.employeeId) || {};
      pvdAoa.push([e.code, e.firstName + ' ' + e.lastName, e.salary, e.pvdRate || 0, s.pvdEmployee,
        HR.S().pvdEmployerRate, s.pvdEmployer, HR.round2(s.pvdEmployee + s.pvdEmployer)]);
    });

    HR.excel.exportWorkbook([
      { name: 'ทะเบียนจ่าย', aoa: head },
      { name: 'สรุปตามฝ่าย', aoa: deptAoa },
      { name: 'นำส่งประกันสังคม', aoa: ssoAoa },
      { name: 'กองทุนสำรองเลี้ยงชีพ', aoa: pvdAoa }
    ], 'ทะเบียนจ่าย_' + (co.code || '') + '_' + period.period);
  }

  /* ================= ไฟล์ส่งธนาคาร ================= */
  function bankFile(period, slips, co) {
    if (!slips.length) { HR.toast('ยังไม่มีผลการคำนวณในงวดนี้', 'err'); return; }
    var fmtSel = el('select');
    [['pipe', 'ข้อความคั่นด้วย | (ทั่วไป)'], ['fixed', 'ความกว้างคงที่ (Fixed width)'], ['csv', 'CSV คั่นด้วยจุลภาค']]
      .forEach(function (o) { fmtSel.appendChild(el('option', { value: o[0] }, o[1])); });

    function pad(s, n) { return (String(s) + new Array(n + 1).join(' ')).slice(0, n); }
    function padNum(v, n) { return String(Math.round((Number(v) || 0) * 100)).padStart(n, '0'); }
    function build(kind) {
      var payDate = String(period.payDate).replace(/-/g, '');
      var rows = slips.filter(function (s) { return s.net > 0; });
      var out = [];
      if (kind === 'fixed') {
        out.push('H' + (co.bankCode || '000') + pad(co.bankAccount || '', 15) + payDate + padNum(HR.sum(rows, function (s) { return s.net; }), 15) + padNum(rows.length, 6));
        rows.forEach(function (s, i) {
          var e = HR.db.byId('employees', s.employeeId) || {};
          out.push('D' + padNum(i + 1, 6) + pad(String(e.bankAccount || '').replace(/\D/g, ''), 15) +
            padNum(s.net, 15) + pad((e.firstName + ' ' + e.lastName), 40) + pad('SALARY' + period.period.replace('-', ''), 20));
        });
        out.push('T' + padNum(rows.length, 6) + padNum(HR.sum(rows, function (s) { return s.net; }), 15));
      } else {
        var sep = kind === 'csv' ? ',' : '|';
        out.push(['HDR', co.bankCode || '', co.bankAccount || '', payDate, rows.length, HR.round2(HR.sum(rows, function (s) { return s.net; })).toFixed(2), co.taxId || ''].join(sep));
        rows.forEach(function (s, i) {
          var e = HR.db.byId('employees', s.employeeId) || {};
          out.push([i + 1, e.bankName || '', String(e.bankAccount || '').replace(/\D/g, ''),
            (e.firstName + ' ' + e.lastName), s.net.toFixed(2), e.nationalId || '',
            'เงินเดือน ' + HR.monthName(period.period), e.email || ''].join(sep));
        });
        out.push(['TRL', rows.length, HR.round2(HR.sum(rows, function (s) { return s.net; })).toFixed(2)].join(sep));
      }
      return out.join('\r\n');
    }

    var preview = el('textarea', { style: 'min-height:220px;font-family:var(--font-num);font-size:12px' });
    function refresh() { preview.value = build(fmtSel.value); }
    fmtSel.addEventListener('change', refresh);
    refresh();

    HR.modal({
      title: 'ไฟล์โอนเงินเข้าบัญชีพนักงาน — ' + (co.name || ''), size: 'wide',
      body: el('div.stack', [
        el('div.callout', 'ตรวจรูปแบบกับธนาคารผู้รับไฟล์ก่อนใช้งานจริง — ส่วนหัวมีวันที่จ่าย จำนวนรายการ และยอดรวม ส่วนรายการมีเลขบัญชีและจำนวนเงินของแต่ละคน (แบบความกว้างคงที่ระบุจำนวนเงินเป็นสตางค์)'),
        el('div.field', [el('span.lbl', 'รูปแบบไฟล์'), fmtSel]),
        el('div.grid.cols-3', [
          HR.kpi('จำนวนรายการ', slips.filter(function (s) { return s.net > 0; }).length, 'รายการ'),
          HR.kpi('ยอดโอนรวม', HR.money(HR.sum(slips, function (s) { return s.net; })), 'บาท'),
          HR.kpi('วันที่จ่าย', HR.date(period.payDate), '')
        ]),
        el('div.field', [el('span.lbl', 'ตัวอย่างเนื้อไฟล์'), preview])
      ]),
      buttons: [
        { label: 'ปิด' },
        {
          label: 'ดาวน์โหลดเป็น Excel', fn: function () {
            var aoa = [['ลำดับ', 'รหัสพนักงาน', 'ชื่อ-นามสกุล', 'ธนาคาร', 'เลขที่บัญชี', 'จำนวนเงิน', 'เลขบัตรประชาชน', 'อ้างอิง']];
            slips.filter(function (s) { return s.net > 0; }).forEach(function (s, i) {
              var e = HR.db.byId('employees', s.employeeId) || {};
              aoa.push([i + 1, e.code, e.firstName + ' ' + e.lastName, e.bankName, e.bankAccount, s.net, e.nationalId, 'เงินเดือน ' + HR.monthName(period.period)]);
            });
            HR.excel.exportAOA(aoa, 'โอนเงิน', 'ไฟล์โอนเงิน_' + period.period);
          }
        },
        { label: 'ดาวน์โหลดไฟล์ .txt', cls: 'btn-primary', fn: function () { HR.excel.exportText(build(fmtSel.value), 'BANK_' + (co.code || '') + '_' + period.period.replace('-', '') + '.txt'); } }
      ]
    });
  }

  /* ================= ภ.ง.ด.1 ================= */
  function pnd1(period, slips, co) {
    if (!slips.length) { HR.toast('ยังไม่มีผลการคำนวณในงวดนี้', 'err'); return; }
    var aoa = [['แบบยื่นรายการภาษีเงินได้หัก ณ ที่จ่าย (ภ.ง.ด.1) — งวด ' + HR.monthName(period.period)],
      ['ผู้มีหน้าที่หักภาษี', co.name, 'เลขประจำตัวผู้เสียภาษี', co.taxId || ''],
      ['สถานประกอบการ', (co.branchType || '') + (co.branchNo ? ' เลขที่ ' + co.branchNo : '')], [],
      ['ลำดับ', 'เลขประจำตัวผู้เสียภาษี (13 หลัก)', 'คำนำหน้า', 'ชื่อ', 'นามสกุล', 'วันเดือนปีที่จ่าย',
        'ประเภทเงินได้', 'จำนวนเงินได้', 'ภาษีที่หักและนำส่ง', 'เงื่อนไขการหักภาษี']];
    slips.forEach(function (s, i) {
      var e = HR.db.byId('employees', s.employeeId) || {};
      aoa.push([i + 1, e.nationalId || '', e.prefix || '', e.firstName, e.lastName, HR.dateTH(period.payDate),
        '1. เงินได้ตามมาตรา 40(1)', s.gross, s.tax, '1. หัก ณ ที่จ่าย']);
    });
    aoa.push([], ['รวม', '', '', '', '', '', '', HR.round2(HR.sum(slips, function (s) { return s.gross; })), HR.round2(HR.sum(slips, function (s) { return s.tax; }))]);
    HR.excel.exportAOA(aoa, 'ภ.ง.ด.1', 'ภงด1_' + (co.code || '') + '_' + period.period);
  }

  HR.view('payAdjustments', {
    title: 'รายการปรับเพิ่ม/หักพิเศษ',
    render: HR.crud('payAdjustments', {
      desc: 'โบนัส คอมมิชชั่น เงินคืนค่าใช้จ่าย หักเงินกู้ หรือรายการพิเศษอื่นของแต่ละงวด — รายการที่ติ๊ก "นำไปคิดภาษี" จะถูกรวมในการประมาณภาษีทั้งปี',
      footerSum: ['amount'],
      defaults: function () {
        var open = HR.rows('payPeriods').filter(function (p) { return p.status !== 'จ่ายแล้ว'; })[0];
        return { periodId: open ? open.id : null, kind: 'รายได้', taxable: true };
      }
    })
  });

  HR.view('payslips', {
    title: 'สลิปเงินเดือนทั้งหมด',
    render: function () {
      var slips = HR.rows('payslips').sort(function (a, b) { return a.period < b.period ? 1 : -1; });
      return el('div', [
        HR.pageHead('สลิปเงินเดือนอิเล็กทรอนิกส์', 'ประวัติสลิปทุกงวดที่คำนวณแล้ว เปิดดูรายตัวหรือส่งออกเป็น Excel ได้', [
          HR.btn('Export ทุกสลิป (Excel)', function () {
            HR.excel.exportRows(slips, HR.exportCols('payslips').concat([
              { k: 'laborCost', l: 'ต้นทุนนายจ้าง', num: 1 }, { k: 'taxableBase', l: 'ฐานคำนวณภาษี/สปส.', num: 1 }
            ]), 'สลิปเงินเดือนทั้งหมด');
          }, 'btn-primary')
        ]),
        HR.table({
          cols: [{ k: 'period', l: 'งวด', fmt: function (s) { return HR.monthName(s.period); } }].concat(HR.listCols('payslips').slice(1)),
          rows: slips, exportName: 'สลิปเงินเดือน', footerSum: ['gross', 'sso', 'pvdEmployee', 'tax', 'totalDeduction', 'net'],
          pageSize: 30,
          actions: function (s) {
            return [{ label: 'ดูสลิป', fn: function () { HR.showPayslip(s, HR.db.byId('payPeriods', s.periodId) || { payDate: s.period + '-25' }); } }];
          }
        })
      ]);
    }
  });

  /* ================= หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ================= */
  HR.view('wht50', {
    title: 'หนังสือรับรองการหักภาษี 50 ทวิ',
    render: function () {
      var years = HR.rows('wht50').map(function (c) { return c.taxYear; });
      var year = Number(HR.ctx.taxYear || (years.length ? Math.max.apply(null, years) : new Date().getFullYear()));
      var certs = HR.rows('wht50').filter(function (c) { return c.taxYear === year; });

      var yearSel = el('select', { style: 'max-width:160px' });
      for (var y = new Date().getFullYear(); y >= new Date().getFullYear() - 5; y--) {
        yearSel.appendChild(el('option', { value: y }, 'ปีภาษี ' + (y + 543)));
      }
      yearSel.value = String(year);
      yearSel.addEventListener('change', function () { HR.ctx.taxYear = Number(yearSel.value); HR.render(); });

      var cols = HR.listCols('wht50').concat([{
        k: 'bahtText', l: 'ภาษีเป็นตัวอักษร', fmt: function (c) { return HR.bahtText(c.totalTax); }
      }]);

      return el('div', [
        HR.pageHead('หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)',
          'ออกให้พนักงานปีละครั้งตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร — ระบบรวมเงินได้และภาษีจากสลิปทุกงวดของปีนั้น แยกตามบริษัทผู้จ่ายเงินได้ พนักงานดาวน์โหลดเองได้จากหน้า "เอกสารของฉัน"', [
          HR.btn('ออกหนังสือทั้งบริษัท', function () { bulkIssue(year); }, 'btn-primary'),
          HR.btn('Export ทะเบียน 50 ทวิ (Excel)', function () { registerExport(certs, year); })
        ]),

        el('div.row', { style: 'margin-bottom:14px' }, [el('span.faint', 'ปีภาษี'), yearSel]),

        el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('หนังสือที่ออกแล้ว', certs.length, 'ฉบับ', 'ปีภาษี ' + (year + 543), 'lift'),
          HR.kpi('เงินได้รวมตามหนังสือ', HR.money(HR.sum(certs, function (c) { return c.totalIncome; })), 'บาท'),
          HR.kpi('ภาษีที่หักและนำส่ง', HR.money(HR.sum(certs, function (c) { return c.totalTax; })), 'บาท'),
          HR.kpi('ประกันสังคมรวม', HR.money(HR.sum(certs, function (c) { return c.ssoTotal; })), 'บาท')
        ]),

        certs.length ? HR.table({
          cols: cols, rows: certs, exportName: '50ทวิ_' + (year + 543),
          footerSum: ['totalIncome', 'totalTax', 'ssoTotal', 'pvdTotal'],
          pageSize: 30,
          actions: function (c) {
            return [
              { label: 'เปิดหนังสือ', fn: function () { HR.show50Twi(c); } },
              { label: 'แก้ไข', fn: function () { HR.openEditor('wht50', c); } },
              { label: 'ยกเลิก', cls: 'btn-danger', fn: function () { HR.deleteRow('wht50', c); } }
            ];
          }
        }) : el('div.empty', [
          el('b', 'ยังไม่มีหนังสือรับรองของปีภาษี ' + (year + 543)),
          'กด "ออกหนังสือทั้งบริษัท" เพื่อสร้างจากสลิปเงินเดือนที่คำนวณแล้วของปีนั้น'
        ])
      ]);
    }
  });

  function bulkIssue(year) {
    var co = HR.CO();
    if (!co) { HR.toast('เลือกบริษัทที่มุมขวาบนก่อน แล้วออกหนังสือทีละบริษัท', 'err'); return; }
    var emps = HR.db.t('employees').filter(function (e) { return e.companyId === co.id; });
    var candidates = emps.map(function (e) {
      return { emp: e, sum: HR.engine.yearSummary(e.id, year) };
    }).filter(function (x) { return x.sum.months > 0; });

    if (!candidates.length) {
      HR.toast('ไม่พบสลิปเงินเดือนปี ' + (year + 543) + ' ของบริษัทนี้ — คำนวณเงินเดือนก่อน', 'err');
      return;
    }
    var existing = HR.db.t('wht50').filter(function (c) { return c.taxYear === year && c.companyId === co.id; });
    var bookNo = el('input', { type: 'text', value: String(year + 543).slice(2) + '/1' });
    var startSeq = el('input', { type: 'number', value: existing.length + 1, min: 1 });
    var issueDate = el('input', { type: 'date', value: HR.today() });
    var signer = el('input', { type: 'text', value: co.signerName || '' });
    var signerPos = el('input', { type: 'text', value: co.signerPosition || 'กรรมการผู้จัดการ' });

    HR.modal({
      title: 'ออกหนังสือรับรอง 50 ทวิ — ' + co.name, size: 'wide',
      body: el('div.stack', [
        el('div.callout', 'พบพนักงาน ' + candidates.length + ' คนที่มีเงินได้ในปีภาษี ' + (year + 543) +
          (existing.length ? ' · มีหนังสือเดิมอยู่แล้ว ' + existing.length + ' ฉบับ ระบบจะออกทับให้เป็นฉบับล่าสุด' : '')),
        el('div.form-grid', [
          el('div.field', [el('span.lbl', 'เล่มที่'), bookNo]),
          el('div.field', [el('span.lbl', 'เริ่มเลขที่'), startSeq]),
          el('div.field', [el('span.lbl', 'วันที่ออกหนังสือ'), issueDate]),
          el('div.field', [el('span.lbl', 'ผู้มีอำนาจลงนาม'), signer]),
          el('div.field', [el('span.lbl', 'ตำแหน่งผู้ลงนาม'), signerPos])
        ]),
        HR.table({
          cols: [
            { k: 'code', l: 'รหัส', fmt: function (x) { return x.emp.code; } },
            { k: 'name', l: 'ชื่อ-นามสกุล', fmt: function (x) { return x.emp.firstName + ' ' + x.emp.lastName; } },
            { k: 'months', l: 'เดือนที่จ่าย', num: 1, dec: 0, fmt: function (x) { return x.sum.months; }, raw: function (x) { return x.sum.months; } },
            { k: 'income', l: 'เงินได้ทั้งปี', num: 1, fmt: function (x) { return x.sum.totalIncome; }, raw: function (x) { return x.sum.totalIncome; } },
            { k: 'tax', l: 'ภาษีที่หัก', num: 1, fmt: function (x) { return x.sum.totalTax; }, raw: function (x) { return x.sum.totalTax; } },
            { k: 'sso', l: 'ประกันสังคม', num: 1, fmt: function (x) { return x.sum.ssoTotal; }, raw: function (x) { return x.sum.ssoTotal; } }
          ],
          rows: candidates, search: false, exportName: false, pageSize: 8
        })
      ]),
      buttons: [{ label: 'ยกเลิก' }, {
        label: 'ออกหนังสือ ' + candidates.length + ' ฉบับ', cls: 'btn-primary', fn: function () {
          var seq = Number(startSeq.value) || 1, n = 0;
          candidates.forEach(function (x) {
            var prev = existing.filter(function (c) { return c.employeeId === x.emp.id; })[0];
            var row = {
              companyId: co.id, employeeId: x.emp.id, taxYear: year,
              bookNo: bookNo.value, seq: prev ? prev.seq : String(seq++),
              formType: 'ภ.ง.ด.1ก', months: x.sum.months,
              totalIncome: x.sum.totalIncome, totalTax: x.sum.totalTax,
              ssoTotal: x.sum.ssoTotal, pvdTotal: x.sum.pvdTotal, lifeInsurance: x.sum.lifeInsurance,
              issuedDate: issueDate.value, signerName: signer.value, signerPosition: signerPos.value,
              status: 'ออกแล้ว'
            };
            if (prev) HR.db.update('wht50', prev.id, row); else HR.db.insert('wht50', row);
            n++;
          });
          HR.toast('ออกหนังสือรับรอง 50 ทวิ ' + n + ' ฉบับแล้ว — พนักงานดาวน์โหลดได้จากหน้า "เอกสารของฉัน"');
          HR.render();
        }
      }]
    });
  }

  /** เอกสาร 50 ทวิ ฉบับเต็ม (เปิดดู พิมพ์ และดาวน์โหลด Excel) */
  HR.show50Twi = function (c) {
    var co = HR.db.byId('companies', c.companyId) || {};
    var e = HR.db.byId('employees', c.employeeId) || {};
    var payDate = HR.engine.yearSummary(c.employeeId, c.taxYear).lastPayDate || (c.taxYear + '-12-31');

    function party(title, name, taxId, addr) {
      return el('div.twi-party', [
        el('div.faint', title),
        el('div', { style: 'font-weight:600' }, name || '-'),
        el('div.mono', 'เลขประจำตัวผู้เสียภาษีอากร  ' + spaced(taxId)),
        el('div.faint', addr || '-')
      ]);
    }
    function spaced(id) { return String(id || '').replace(/\D/g, '').split('').join(' '); }

    var body = el('div.twi.printable', [
      el('div.twi-head', [
        el('div', [
          el('h3', 'หนังสือรับรองการหักภาษี ณ ที่จ่าย'),
          el('div.faint', 'ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร')
        ]),
        el('div', { style: 'text-align:right' }, [
          el('div', 'เล่มที่ ' + (c.bookNo || '-')),
          el('div', 'เลขที่ ' + (c.seq || '-')),
          el('div.faint', 'ปีภาษี ' + (c.taxYear + 543))
        ])
      ]),

      el('div.twi-parties', [
        party('ผู้มีหน้าที่หักภาษี ณ ที่จ่าย', co.name, co.taxId,
          (co.address || '') + (co.branchType ? ' (' + co.branchType + (co.branchNo ? ' เลขที่ ' + co.branchNo : '') + ')' : '')),
        party('ผู้ถูกหักภาษี ณ ที่จ่าย', (e.prefix || '') + e.firstName + ' ' + e.lastName, e.nationalId, e.address)
      ]),

      el('div.twi-form', 'ลำดับที่ ' + (c.seq || '-') + '  ในแบบ  ' +
        ['ภ.ง.ด.1ก', 'ภ.ง.ด.1ก พิเศษ', 'ภ.ง.ด.2', 'ภ.ง.ด.3'].map(function (f) {
          return (c.formType === f ? '☑ ' : '☐ ') + f;
        }).join('   ')),

      el('table.twi-table', [
        el('thead', el('tr', [
          el('th', 'ประเภทเงินได้พึงประเมินที่จ่าย'),
          el('th', { style: 'width:150px' }, 'วัน เดือน ปี ที่จ่าย'),
          el('th.num', { style: 'width:140px' }, 'จำนวนเงินที่จ่าย'),
          el('th.num', { style: 'width:140px' }, 'ภาษีที่หักและนำส่งไว้')
        ])),
        el('tbody', [
          el('tr', [
            el('td', '1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)'),
            el('td', HR.dateTH(payDate)),
            el('td.num', HR.money(c.totalIncome)),
            el('td.num', HR.money(c.totalTax))
          ]),
          el('tr', [el('td', '2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)'), el('td', '-'), el('td.num', '-'), el('td.num', '-')]),
          el('tr', [el('td', '3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)'), el('td', '-'), el('td.num', '-'), el('td.num', '-')]),
          el('tr.tot', [
            el('td', 'รวมเงินที่จ่ายและภาษีที่หักนำส่ง'),
            el('td', ''),
            el('td.num', HR.money(c.totalIncome)),
            el('td.num', HR.money(c.totalTax))
          ])
        ])
      ]),

      el('div.twi-amount', 'รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)  ' + HR.bahtText(c.totalTax)),

      el('div.twi-funds', [
        el('div', { style: 'font-weight:600;margin-bottom:6px' }, 'เงินที่จ่ายเข้ากองทุนและเบี้ยประกัน'),
        el('table.slip-lines', [
          el('tr', [el('td', 'กองทุนประกันสังคม'), el('td', HR.money(c.ssoTotal) + ' บาท')]),
          el('tr', [el('td', 'กองทุนสำรองเลี้ยงชีพ'), el('td', HR.money(c.pvdTotal) + ' บาท')]),
          el('tr', [el('td', 'เบี้ยประกันชีวิต'), el('td', HR.money(c.lifeInsurance) + ' บาท')])
        ])
      ]),

      el('div.twi-declare', 'ผู้จ่ายเงิน  ☑ (1) หัก ณ ที่จ่าย   ☐ (2) ออกให้ตลอดไป   ☐ (3) ออกให้ครั้งเดียว   ☐ (4) อื่น ๆ'),

      el('div.twi-sign', [
        el('div.faint', 'ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ'),
        el('div.twi-sign-line', [
          el('div', '....................................................................'),
          el('div', 'ลงชื่อ ' + (c.signerName || co.signerName || '')),
          el('div.faint', 'ตำแหน่ง ' + (c.signerPosition || co.signerPosition || '')),
          el('div.faint', 'วันที่ออกหนังสือ ' + HR.dateTH(c.issuedDate))
        ])
      ])
    ]);

    HR.modal({
      title: 'หนังสือรับรองการหักภาษี 50 ทวิ — ' + HR.label('employees', e), size: 'wide', body: body,
      buttons: [
        { label: 'ปิด' },
        { label: 'ดาวน์โหลด Excel', fn: function () { twiExcel(c, co, e, payDate); } },
        { label: 'พิมพ์ / บันทึกเป็น PDF', cls: 'btn-primary', fn: function () { HR.printNode(body, 'หนังสือรับรองการหักภาษี 50 ทวิ'); return false; } }
      ]
    });
  };

  function twiExcel(c, co, e, payDate) {
    HR.excel.exportAOA([
      ['หนังสือรับรองการหักภาษี ณ ที่จ่าย'],
      ['ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร'],
      ['เล่มที่', c.bookNo || '', 'เลขที่', c.seq || '', 'ปีภาษี', c.taxYear + 543], [],
      ['ผู้มีหน้าที่หักภาษี ณ ที่จ่าย'],
      ['ชื่อ', co.name], ['เลขประจำตัวผู้เสียภาษีอากร', co.taxId],
      ['ที่อยู่', co.address], ['สถานประกอบการ', (co.branchType || '') + (co.branchNo ? ' เลขที่ ' + co.branchNo : '')], [],
      ['ผู้ถูกหักภาษี ณ ที่จ่าย'],
      ['ชื่อ', (e.prefix || '') + e.firstName + ' ' + e.lastName],
      ['เลขประจำตัวผู้เสียภาษีอากร', e.nationalId], ['ที่อยู่', e.address], [],
      ['ลำดับที่', c.seq || '', 'ในแบบ', c.formType || 'ภ.ง.ด.1ก'], [],
      ['ประเภทเงินได้พึงประเมินที่จ่าย', 'วัน เดือน ปี ที่จ่าย', 'จำนวนเงินที่จ่าย', 'ภาษีที่หักและนำส่งไว้'],
      ['1. เงินเดือน ค่าจ้าง ฯลฯ ตามมาตรา 40 (1)', HR.dateTH(payDate), c.totalIncome, c.totalTax],
      ['รวมเงินที่จ่ายและภาษีที่หักนำส่ง', '', c.totalIncome, c.totalTax],
      ['รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)', HR.bahtText(c.totalTax)], [],
      ['เงินที่จ่ายเข้ากองทุนประกันสังคม', c.ssoTotal],
      ['เงินที่จ่ายเข้ากองทุนสำรองเลี้ยงชีพ', c.pvdTotal],
      ['เบี้ยประกันชีวิต', c.lifeInsurance], [],
      ['ผู้จ่ายเงิน', '(1) หัก ณ ที่จ่าย'],
      ['ผู้มีอำนาจลงนาม', c.signerName || co.signerName || ''],
      ['ตำแหน่ง', c.signerPosition || co.signerPosition || ''],
      ['วันที่ออกหนังสือ', HR.dateTH(c.issuedDate)]
    ], '50ทวิ', '50ทวิ_' + (e.code || '') + '_' + (c.taxYear + 543));
  }

  function registerExport(certs, year) {
    var aoa = [['ทะเบียนหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ปีภาษี ' + (year + 543)], [],
      ['เล่มที่', 'เลขที่', 'บริษัทผู้จ่ายเงินได้', 'เลขผู้เสียภาษีผู้จ่าย', 'รหัสพนักงาน', 'ชื่อผู้ถูกหักภาษี',
        'เลขประจำตัวผู้เสียภาษี', 'ยื่นตามแบบ', 'เดือนที่จ่าย', 'เงินได้ทั้งปี', 'ภาษีที่หักและนำส่ง',
        'ประกันสังคม', 'กองทุนสำรองเลี้ยงชีพ', 'เบี้ยประกันชีวิต', 'วันที่ออกหนังสือ', 'สถานะ']];
    certs.forEach(function (c) {
      var co = HR.db.byId('companies', c.companyId) || {}, e = HR.db.byId('employees', c.employeeId) || {};
      aoa.push([c.bookNo, c.seq, co.name, co.taxId, e.code, (e.prefix || '') + e.firstName + ' ' + e.lastName,
        e.nationalId, c.formType, c.months, c.totalIncome, c.totalTax, c.ssoTotal, c.pvdTotal, c.lifeInsurance,
        HR.date(c.issuedDate), c.status]);
    });
    aoa.push([], ['รวม', '', '', '', '', certs.length + ' ฉบับ', '', '', '',
      HR.round2(HR.sum(certs, function (c) { return c.totalIncome; })),
      HR.round2(HR.sum(certs, function (c) { return c.totalTax; })),
      HR.round2(HR.sum(certs, function (c) { return c.ssoTotal; })),
      HR.round2(HR.sum(certs, function (c) { return c.pvdTotal; }))]);
    HR.excel.exportAOA(aoa, 'ทะเบียน 50 ทวิ', 'ทะเบียน50ทวิ_' + (year + 543));
  }

  /* ================= รายงานภาษีและประกันสังคม ================= */
  HR.view('taxReports', {
    title: 'ภาษีและประกันสังคม',
    render: function () {
      var co = HR.CO();
      var year = String(new Date().getFullYear());
      var slips = HR.rows('payslips');
      var yearSlips = slips.filter(function (s) { return String(s.period).slice(0, 4) === year; });
      var byEmp = HR.groupBy(yearSlips, function (s) { return s.employeeId; });
      var rows = Object.keys(byEmp).map(function (id) {
        var e = HR.db.byId('employees', id) || {}, g = byEmp[id];
        return {
          code: e.code, name: (e.prefix || '') + e.firstName + ' ' + e.lastName, nationalId: e.nationalId,
          company: HR.nameOf('companies', e.companyId), months: g.length,
          gross: HR.round2(HR.sum(g, function (s) { return s.gross; })),
          sso: HR.round2(HR.sum(g, function (s) { return s.sso; })),
          pvd: HR.round2(HR.sum(g, function (s) { return s.pvdEmployee; })),
          tax: HR.round2(HR.sum(g, function (s) { return s.tax; }))
        };
      });

      return el('div', [
        HR.pageHead('ภาษีและประกันสังคม',
          'สรุปยอดนำส่งสะสมปี ' + (Number(year) + 543) + (co ? ' ของ ' + co.name : ' (ทุกบริษัทในเครือ)'), [
          HR.btn('ภ.ง.ด.1ก (สรุปทั้งปี)', function () {
            var aoa = [['ใบแนบ ภ.ง.ด.1ก ปีภาษี ' + (Number(year) + 543)],
              ['ผู้มีหน้าที่หักภาษี', co ? co.name : 'ทุกบริษัทในเครือ', 'เลขประจำตัวผู้เสียภาษี', co ? co.taxId : ''], [],
              ['ลำดับ', 'เลขประจำตัวผู้เสียภาษี', 'คำนำหน้า-ชื่อ-นามสกุล', 'บริษัทผู้จ่าย', 'จำนวนเดือนที่จ่าย', 'เงินได้ทั้งปี',
                'เงินสมทบประกันสังคม', 'เงินสะสมกองทุนสำรองเลี้ยงชีพ', 'ภาษีที่หักและนำส่งทั้งปี']];
            rows.forEach(function (r, i) { aoa.push([i + 1, r.nationalId, r.name, r.company, r.months, r.gross, r.sso, r.pvd, r.tax]); });
            aoa.push([], ['รวม', '', '', '', '', HR.round2(HR.sum(rows, function (r) { return r.gross; })),
              HR.round2(HR.sum(rows, function (r) { return r.sso; })), HR.round2(HR.sum(rows, function (r) { return r.pvd; })),
              HR.round2(HR.sum(rows, function (r) { return r.tax; }))]);
            HR.excel.exportAOA(aoa, 'ภ.ง.ด.1ก', 'ภงด1ก_' + year);
          }, 'btn-primary'),
          HR.btn('แบบนำส่งประกันสังคม (สปส. 1-10)', function () {
            var m = HR.rows('payPeriods').filter(function (p) { return p.status !== 'ร่าง'; }).sort(function (a, b) { return a.period < b.period ? 1 : -1; })[0];
            if (!m) { HR.toast('ยังไม่มีงวดที่คำนวณแล้ว', 'err'); return; }
            var mco = HR.db.byId('companies', m.companyId) || {};
            var ms = HR.db.t('payslips').filter(function (s) { return s.periodId === m.id; });
            var aoa = [['แบบรายการแสดงการส่งเงินสมทบ (สปส. 1-10) งวด ' + HR.monthName(m.period)],
              ['สถานประกอบการ', mco.name, 'เลขที่บัญชีนายจ้าง', mco.ssoAccount || ''], [],
              ['ลำดับ', 'เลขประกันสังคม', 'เลขบัตรประชาชน', 'ชื่อ-นามสกุล', 'ค่าจ้างที่จ่าย', 'เงินสมทบลูกจ้าง', 'เงินสมทบนายจ้าง']];
            ms.filter(function (s) { return s.sso > 0; }).forEach(function (s, i) {
              var e = HR.db.byId('employees', s.employeeId) || {};
              aoa.push([i + 1, e.ssoNumber, e.nationalId, e.firstName + ' ' + e.lastName, s.taxableBase, s.sso, s.ssoEmployer]);
            });
            aoa.push([], ['รวม', '', '', ms.filter(function (s) { return s.sso > 0; }).length + ' คน',
              HR.round2(HR.sum(ms, function (s) { return s.taxableBase; })),
              HR.round2(HR.sum(ms, function (s) { return s.sso; })), HR.round2(HR.sum(ms, function (s) { return s.ssoEmployer; }))]);
            HR.excel.exportAOA(aoa, 'สปส1-10', 'ประกันสังคม_' + m.period);
          }),
          HR.btn('ไปที่หนังสือ 50 ทวิ', function () { HR.go('wht50'); })
        ]),

        el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('เงินได้ที่จ่ายสะสม', HR.money(HR.sum(rows, function (r) { return r.gross; })), 'บาท', 'ปี ' + (Number(year) + 543), 'lift'),
          HR.kpi('ภาษีนำส่งสะสม', HR.money(HR.sum(rows, function (r) { return r.tax; })), 'บาท'),
          HR.kpi('ประกันสังคมสะสม (ลูกจ้าง)', HR.money(HR.sum(rows, function (r) { return r.sso; })), 'บาท'),
          HR.kpi('PVD สะสม (ลูกจ้าง)', HR.money(HR.sum(rows, function (r) { return r.pvd; })), 'บาท')
        ]),

        HR.card('ยอดสะสมรายบุคคล (ใช้ยื่น ภ.ง.ด.1ก และออก 50 ทวิ)', 'ปีภาษี ' + (Number(year) + 543), HR.table({
          cols: [{ k: 'code', l: 'รหัส', w: 90 }, { k: 'name', l: 'ชื่อ-นามสกุล' }, { k: 'company', l: 'บริษัทผู้จ่าย' },
            { k: 'nationalId', l: 'เลขประจำตัวผู้เสียภาษี' },
            { k: 'months', l: 'เดือนที่จ่าย', num: 1, dec: 0 }, { k: 'gross', l: 'เงินได้ทั้งปี', num: 1 },
            { k: 'sso', l: 'ประกันสังคม', num: 1 }, { k: 'pvd', l: 'PVD', num: 1 }, { k: 'tax', l: 'ภาษีที่หัก', num: 1 }],
          rows: rows, exportName: 'ยอดสะสมภาษี', footerSum: ['gross', 'sso', 'pvd', 'tax']
        })),

        el('div', { style: 'height:16px' }),
        HR.card('อัตราภาษีเงินได้บุคคลธรรมดาที่ระบบใช้', 'คำนวณจากเงินได้สุทธิทั้งปี', HR.table({
          cols: [{ k: 'band', l: 'เงินได้สุทธิ (บาท)' }, { k: 'rate', l: 'อัตราภาษี' }],
          rows: HR.TAX_BRACKETS.map(function (b, i) {
            var prev = i ? HR.TAX_BRACKETS[i - 1].upTo : 0;
            return { band: HR.num(prev, 0) + ' – ' + (b.upTo === Infinity ? 'ขึ้นไป' : HR.num(b.upTo, 0)), rate: b.rate + '%' };
          }), search: false, exportName: 'อัตราภาษี'
        }))
      ]);
    }
  });

  /* ================= ตั้งค่าการคำนวณ ================= */
  HR.view('settings', {
    title: 'ตั้งค่าระบบ',
    render: function () {
      var groups = [
        ['เวลาทำงานและ OT', [
          { k: 'workDaysPerMonth', l: 'วันทำงานต่อเดือน (ฐานคิดค่าจ้างรายวัน)', t: 'number' },
          { k: 'workHoursPerDay', l: 'ชั่วโมงทำงานต่อวัน', t: 'number' },
          { k: 'shiftGraceMinutes', l: 'ผ่อนผันการมาสาย (นาที)', t: 'number' },
          { k: 'otWorkday', l: 'อัตรา OT วันทำงาน (เท่า)', t: 'number', step: '0.1' },
          { k: 'otHoliday', l: 'อัตราทำงานวันหยุด (เท่า)', t: 'number', step: '0.1' },
          { k: 'otHolidayExtra', l: 'อัตรา OT วันหยุดเกินเวลา (เท่า)', t: 'number', step: '0.1' },
          { k: 'diligenceAmount', l: 'เบี้ยขยัน (บาท/เดือน)', t: 'money' },
          { k: 'diligenceMaxLateCount', l: 'มาสายได้ไม่เกิน (ครั้ง) จึงยังได้เบี้ยขยัน', t: 'number' },
          { k: 'probationDays', l: 'ระยะทดลองงาน (วัน)', t: 'number' }
        ]],
        ['ประกันสังคมและกองทุน', [
          { k: 'ssoRate', l: 'อัตราเงินสมทบ (%)', t: 'percent' },
          { k: 'ssoMinWage', l: 'ฐานค่าจ้างต่ำสุด', t: 'money' },
          { k: 'ssoMaxWage', l: 'ฐานค่าจ้างสูงสุด', t: 'money' },
          { k: 'ssoMaxContribution', l: 'เงินสมทบสูงสุดต่อเดือน', t: 'money' },
          { k: 'pvdEmployerRate', l: 'นายจ้างสมทบ PVD (%)', t: 'percent' }
        ]],
        ['เกณฑ์ภาษีและค่าลดหย่อน', [
          { k: 'taxExpenseRate', l: 'หักค่าใช้จ่าย (%)', t: 'percent' },
          { k: 'taxExpenseCap', l: 'หักค่าใช้จ่ายสูงสุด', t: 'money' },
          { k: 'allowancePersonal', l: 'ลดหย่อนส่วนตัว', t: 'money' },
          { k: 'allowanceSpouse', l: 'ลดหย่อนคู่สมรส', t: 'money' },
          { k: 'allowanceChild', l: 'ลดหย่อนบุตร (คนแรก)', t: 'money' },
          { k: 'allowanceChild2nd', l: 'ลดหย่อนบุตรคนที่ 2 ขึ้นไป (เกิดปี 2561+)', t: 'money' },
          { k: 'allowanceParent', l: 'ลดหย่อนบิดามารดา (ต่อคน)', t: 'money' },
          { k: 'ssoDeductCap', l: 'ลดหย่อนประกันสังคมสูงสุด/ปี', t: 'money' },
          { k: 'pvdDeductCap', l: 'ลดหย่อน PVD สูงสุด/ปี', t: 'money' },
          { k: 'lifeInsuranceCap', l: 'ลดหย่อนเบี้ยประกันชีวิตสูงสุด/ปี', t: 'money' }
        ]]
      ];
      var fields = [];
      groups.forEach(function (g) {
        fields.push({ k: '_s' + g[0], l: g[0], t: 'section' });
        g[1].forEach(function (f) { fields.push(f); });
      });
      var form = HR.form(fields, HR.S());

      return el('div', [
        HR.pageHead('ตั้งค่าระบบ',
          'พารามิเตอร์เหล่านี้ใช้ร่วมกันทุกบริษัทในเครือ — ข้อมูลนายจ้าง เลขผู้เสียภาษี และบัญชีธนาคารตั้งแยกรายบริษัทที่หน้า "บริษัทในเครือ"', [
          HR.btn('บันทึกการตั้งค่า', function () {
            var v = form.get();
            Object.keys(v).forEach(function (k) { if (k[0] !== '_') HR.S()[k] = v[k]; });
            HR.db.save();
            HR.toast('บันทึกการตั้งค่าแล้ว');
          }, 'btn-primary'),
          HR.btn('Export การตั้งค่า (Excel)', function () {
            HR.excel.exportAOA([['คีย์', 'คำอธิบาย', 'ค่า']].concat(fields.filter(function (f) { return f.t !== 'section'; })
              .map(function (f) { return [f.k, f.l, HR.S()[f.k]]; })), 'ตั้งค่า', 'ตั้งค่าระบบ');
          })
        ]),
        HR.card('พารามิเตอร์การคำนวณ', null, form.el),
        el('div', { style: 'height:16px' }),
        HR.card('แฟ้มข้อมูล',
          HR.file.name ? 'กำลังทำงานกับไฟล์ ' + HR.file.name : 'ยังไม่ได้ผูกกับไฟล์ — ข้อมูลอยู่ในเบราว์เซอร์อย่างเดียว',
          el('div.stack', [
          el('div.row', [
            HR.btn('เปิดแฟ้มข้อมูล…', function () { HR.file.open(); }),
            HR.btn('บันทึกลงไฟล์', function () { HR.file.save(); }, 'btn-primary'),
            HR.btn('บันทึกเป็นไฟล์ใหม่…', function () { HR.file.saveAs(); }),
            HR.btn('Export รายงานทุกตาราง', function () { HR.excel.exportAll(); }),
            HR.btn('โหลดข้อมูลตัวอย่างใหม่', function () {
              HR.confirm('ล้างข้อมูลทั้งหมดและโหลดข้อมูลตัวอย่างชุดใหม่? ข้อมูลที่กรอกไว้จะหายทั้งหมด — บันทึกลงไฟล์ก่อนถ้ายังต้องการ', 'ล้างและโหลดใหม่')
                .then(function (ok) {
                  if (!ok) return;
                  HR.db.data = HR.seed(); HR.db.save();
                  HR.ctx.companyId = '';
                  HR.toast('โหลดข้อมูลตัวอย่างชุดใหม่แล้ว');
                  HR.buildNav(); HR.buildTopbar(); HR.go('dashboard'); HR.render();
                });
            }, 'btn-danger'),
            HR.btn('ล้างข้อมูลทั้งหมด (เริ่มจากศูนย์)', function () {
              HR.confirm('ล้างข้อมูลทั้งหมดและเริ่มระบบเปล่า? การลบนี้ย้อนกลับไม่ได้ — บันทึกลงไฟล์ก่อนถ้ายังต้องการ', 'ล้างข้อมูล').then(function (ok) {
                if (!ok) return;
                var blank = {};
                Object.keys(HR.schema).forEach(function (k) { blank[k] = []; });
                blank.settings = HR.defaultSettings();
                HR.db.data = blank; HR.db.save();
                HR.ctx.companyId = '';
                HR.buildTopbar();
                HR.toast('ล้างข้อมูลแล้ว — เริ่มจากหน้าบริษัทในเครือและทะเบียนพนักงาน');
                HR.buildNav(); HR.go('companies'); HR.render();
              });
            }, 'btn-danger')
          ]),
          el('div.faint', 'จำนวนระเบียนในระบบ: ' + Object.keys(HR.schema).map(function (k) {
            return HR.schema[k].title + ' ' + HR.db.t(k).length;
          }).join(' · '))
        ]))
      ]);
    }
  });
})(window.HR);
