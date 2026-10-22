/* views-analytics.js — โมดูล 6: แดชบอร์ด การวิเคราะห์ข้อมูล และการพ้นสภาพการจ้างงาน */
(function (HR) {
  'use strict';
  var el = HR.el;

  function actives() {
    return HR.rows('employees').filter(function (e) { return e.status === 'ทำงาน' || e.status === 'ทดลองงาน'; });
  }
  function lastMonths(n) {
    var out = [], d = new Date();
    for (var i = n - 1; i >= 0; i--) {
      out.push(HR.ymOf(new Date(d.getFullYear(), d.getMonth() - i, 1)));
    }
    return out;
  }

  /* ---------- หน้าแรก ---------- */
  HR.view('dashboard', {
    title: 'ภาพรวมองค์กร',
    render: function () {
      var act = actives(), all = HR.rows('employees');
      var months = lastMonths(6);
      var to = months.map(function (m) { return HR.engine.turnover(m); });
      var ytdLeavers = all.filter(function (e) { return e.terminationDate && e.terminationDate.slice(0, 4) === String(new Date().getFullYear()); }).length;
      var avgHead = HR.sum(to, function (t) { return t.headcount; }) / Math.max(1, to.length);

      var byDept = HR.groupBy(act, function (e) { return HR.nameOf('departments', e.deptId); });
      var deptData = Object.keys(byDept).map(function (k) { return { label: k.replace(/^ฝ่าย|^สำนัก/, ''), value: byDept[k].length }; });
      var byGender = HR.groupBy(act, function (e) { return e.gender || 'ไม่ระบุ'; });
      var genderData = Object.keys(byGender).map(function (k) { return { label: k, value: byGender[k].length }; });

      var pending = ['leaves', 'otRequests', 'expenses'].reduce(function (a, n) {
        return a + HR.rows(n).filter(function (r) { return r.status === 'รออนุมัติ'; }).length;
      }, 0);
      var laborCost = HR.sum(act, function (e) {
        return (e.salary || 0) + (e.positionAllowance || 0) + (e.otherAllowanceMonthly || 0)
          + HR.engine.sso(e.salary) + HR.engine.pvdEmployer(e.salary, e.pvdRate ? null : 0);
      });

      var events = [];
      HR.rows('interviews').filter(function (i) { return i.date >= HR.today() && i.result === 'รอตรวจ'; }).forEach(function (i) {
        events.push({ date: i.date, kind: 'สัมภาษณ์', what: HR.nameOf('applicants', i.applicantId) + ' · ' + i.round, who: HR.nameOf('employees', i.interviewerId) });
      });
      act.filter(function (e) { return e.status === 'ทดลองงาน' && e.probationEnd >= HR.today(); }).forEach(function (e) {
        events.push({ date: e.probationEnd, kind: 'ครบทดลองงาน', what: HR.label('employees', e), who: HR.nameOf('departments', e.deptId) });
      });
      HR.rows('offboardings').filter(function (o) { return o.lastDay >= HR.today(); }).forEach(function (o) {
        events.push({ date: o.lastDay, kind: 'วันทำงานวันสุดท้าย', what: HR.nameOf('employees', o.employeeId), who: o.reason });
      });
      HR.rows('holidays').filter(function (h) { return h.date >= HR.today(); }).forEach(function (h) {
        events.push({ date: h.date, kind: 'วันหยุด', what: h.name, who: h.type });
      });
      events.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

      return el('div', [
        HR.pageHead('ภาพรวมองค์กร',
          (HR.CO() ? HR.CO().name : 'ทุกบริษัทในเครือ') + ' · ข้อมูล ณ ' + HR.dateTH(HR.today()), [
          HR.btn('Export แดชบอร์ด (Excel)', function () { dashboardExport(act, months, to, deptData, genderData); }, 'btn-primary'),
          HR.btn('ไปที่กล่องอนุมัติ' + (pending ? ' (' + pending + ')' : ''), function () { HR.go('approvals'); })
        ]),

        el('div.grid.cols-4', [
          HR.kpi('พนักงานปัจจุบัน', act.length, 'คน', 'ทดลองงาน ' + act.filter(function (e) { return e.status === 'ทดลองงาน'; }).length + ' คน', 'lift'),
          HR.kpi('อัตราการลาออกสะสมปีนี้', avgHead ? HR.num(ytdLeavers / avgHead * 100, 1) : '0', '%', ytdLeavers + ' คนลาออกจากกำลังคนเฉลี่ย ' + HR.num(avgHead, 0) + ' คน', ytdLeavers / Math.max(1, avgHead) > 0.15 ? 'dangerbar' : ''),
          HR.kpi('ต้นทุนค่าแรงต่อเดือน', HR.money(laborCost), 'บาท', 'รวมเงินสมทบนายจ้าง'),
          HR.kpi('คำขอรออนุมัติ', pending, 'รายการ', pending ? 'หัวหน้างานยังไม่ได้พิจารณา' : 'เคลียร์หมดแล้ว', pending ? 'warnbar' : '')
        ]),

        el('div', { style: 'height:14px' }),
        el('div.grid.cols-2', [
          HR.card('กำลังคนและการลาออกย้อนหลัง 6 เดือน', 'เส้นบน = กำลังคน · เส้นล่าง = จำนวนผู้ลาออก', el('div', [
            HR.chartLine({
              labels: months.map(function (m) { return HR.monthName(m).split(' ')[0].slice(0, 3); }),
              series: [
                { name: 'กำลังคน', color: HR.palette[0], values: to.map(function (t) { return t.headcount; }) },
                { name: 'ผู้ลาออก', color: HR.palette[3], values: to.map(function (t) { return t.leavers; }) }
              ], height: 240
            }),
            HR.legend([{ label: 'กำลังคน (คน)', color: HR.palette[0] }, { label: 'ผู้ลาออก (คน)', color: HR.palette[3] }])
          ])),
          HR.card('กำลังคนตามฝ่าย', 'รวม ' + act.length + ' คน', el('div', [
            HR.chartBar({ data: deptData, height: 240, fmt: function (v) { return HR.num(v, 0); } })
          ]))
        ]),

        el('div', { style: 'height:14px' }),
        el('div.grid.cols-3', [
          HR.card('สัดส่วนเพศ', 'ความหลากหลายของพนักงาน', el('div', [
            HR.chartDonut({ data: genderData, centerTop: String(act.length), centerSub: 'พนักงาน' }),
            HR.legend(genderData)
          ])),
          HR.card('ช่วงอายุงาน', null, (function () {
            var bands = [['น้อยกว่า 1 ปี', 0, 1], ['1–3 ปี', 1, 3], ['3–6 ปี', 3, 6], ['6–10 ปี', 6, 10], ['มากกว่า 10 ปี', 10, 99]];
            var data = bands.map(function (b) {
              return { label: b[0], value: act.filter(function (e) { var y = HR.yearsBetween(e.hireDate); return y >= b[1] && y < b[2]; }).length };
            });
            return el('div', [HR.chartBar({ data: data, height: 240, fmt: function (v) { return HR.num(v, 0); } })]);
          })()),
          HR.card('ปฏิทินที่ต้องเตรียม', events.length + ' รายการข้างหน้า', el('div.checklist',
            events.slice(0, 8).map(function (v) {
              return el('div.check-item', [
                el('div.ci-body', [el('b', v.what), el('div', v.kind + ' · ' + (v.who || ''))]),
                HR.badge(HR.date(v.date), 'accent')
              ]);
            })
          ))
        ]),

        el('div', { style: 'height:14px' }),
        el('div.grid.cols-2', [
          HR.card('สถานะการสรรหา', null, (function () {
            var jobs = HR.rows('jobs').filter(function (j) { return j.status === 'เผยแพร่'; });
            return HR.table({
              cols: [
                { k: 'title', l: 'ตำแหน่ง' },
                { k: 'openings', l: 'อัตรา', num: 1, dec: 0 },
                { k: 'cand', l: 'ผู้สมัคร', num: 1, dec: 0, fmt: function (j) { return HR.rows('applicants').filter(function (a) { return a.jobId === j.id; }).length; }, raw: function (j) { return HR.rows('applicants').filter(function (a) { return a.jobId === j.id; }).length; } },
                { k: 'iv', l: 'อยู่ชั้นสัมภาษณ์', num: 1, dec: 0, fmt: function (j) { return HR.rows('applicants').filter(function (a) { return a.jobId === j.id && ['สัมภาษณ์', 'ยื่นข้อเสนอ'].indexOf(a.stage) > -1; }).length; } },
                { k: 'days', l: 'เปิดรับมาแล้ว (วัน)', num: 1, dec: 0, fmt: function (j) { return Math.round(HR.yearsBetween(j.postedDate) * 365); }, raw: function (j) { return Math.round(HR.yearsBetween(j.postedDate) * 365); } }
              ],
              rows: jobs, search: false, exportName: 'สถานะการสรรหา',
              empty: { title: 'ไม่มีประกาศที่เปิดรับ', hint: 'สร้างประกาศใหม่ได้ที่โมดูลสรรหา' }
            });
          })()),
          HR.card('ต้นทุนค่าแรงตามฝ่าย', 'เงินเดือนและค่าตำแหน่งต่อเดือน', (function () {
            var rows = Object.keys(byDept).map(function (k) {
              var g = byDept[k];
              return {
                dept: k, head: g.length,
                base: HR.round2(HR.sum(g, function (e) { return (e.salary || 0) + (e.positionAllowance || 0); })),
                avg: HR.round2(HR.sum(g, function (e) { return e.salary; }) / g.length)
              };
            }).sort(function (a, b) { return b.base - a.base; });
            return HR.table({
              cols: [{ k: 'dept', l: 'ฝ่าย' }, { k: 'head', l: 'จำนวนคน', num: 1, dec: 0 },
                { k: 'base', l: 'ค่าแรงต่อเดือน', num: 1 }, { k: 'avg', l: 'เงินเดือนเฉลี่ย', num: 1 }],
              rows: rows, search: false, exportName: 'ต้นทุนค่าแรงตามฝ่าย', footerSum: ['head', 'base']
            });
          })())
        ])
      ]);
    }
  });

  function dashboardExport(act, months, to, deptData, genderData) {
    HR.excel.exportWorkbook([
      {
        name: 'ตัวชี้วัดหลัก', aoa: [['ตัวชี้วัด', 'ค่า', 'หน่วย'],
          ['พนักงานปัจจุบัน', act.length, 'คน'],
          ['อยู่ระหว่างทดลองงาน', act.filter(function (e) { return e.status === 'ทดลองงาน'; }).length, 'คน'],
          ['ฐานเงินเดือนรวม', HR.round2(HR.sum(act, function (e) { return e.salary; })), 'บาท/เดือน'],
          ['เงินเดือนเฉลี่ย', act.length ? HR.round2(HR.sum(act, function (e) { return e.salary; }) / act.length) : 0, 'บาท'],
          ['อายุงานเฉลี่ย', act.length ? HR.round2(HR.sum(act, function (e) { return HR.yearsBetween(e.hireDate); }) / act.length) : 0, 'ปี'],
          ['อายุเฉลี่ย', HR.round2(HR.sum(act.filter(function (e) { return e.dob; }), function (e) { return HR.yearsBetween(e.dob); }) / Math.max(1, act.filter(function (e) { return e.dob; }).length)), 'ปี']]
      },
      { name: 'กำลังคนรายเดือน', aoa: [['เดือน', 'กำลังคน', 'ผู้ลาออก', 'อัตราการลาออก (%)']].concat(months.map(function (m, i) { return [HR.monthName(m), to[i].headcount, to[i].leavers, to[i].rate]; })) },
      { name: 'กำลังคนตามฝ่าย', aoa: [['ฝ่าย', 'จำนวนคน']].concat(deptData.map(function (d) { return [d.label, d.value]; })) },
      { name: 'ความหลากหลาย', aoa: [['มิติ', 'กลุ่ม', 'จำนวนคน']].concat(
        genderData.map(function (d) { return ['เพศ', d.label, d.value]; }),
        Object.keys(HR.groupBy(act, function (e) { return e.eduLevel || 'ไม่ระบุ'; })).map(function (k) { return ['วุฒิการศึกษา', k, HR.groupBy(act, function (e) { return e.eduLevel || 'ไม่ระบุ'; })[k].length]; }),
        Object.keys(HR.groupBy(act, function (e) { return e.employmentType || 'ไม่ระบุ'; })).map(function (k) { return ['ประเภทการจ้าง', k, HR.groupBy(act, function (e) { return e.employmentType || 'ไม่ระบุ'; })[k].length]; })
      ) }
    ], 'แดชบอร์ด HR');
  }

  /* ---------- HR Analytics ---------- */
  HR.view('analytics', {
    title: 'วิเคราะห์ข้อมูลบุคลากร',
    render: function () {
      var all = HR.rows('employees'), act = actives();
      var months = lastMonths(12);
      var to = months.map(function (m) { return HR.engine.turnover(m); });
      var leavers = all.filter(function (e) { return e.terminationDate; });
      var offs = HR.rows('offboardings');

      var byReason = HR.groupBy(offs, function (o) { return o.reasonDetail || 'ไม่ระบุ'; });
      var reasonData = Object.keys(byReason).map(function (k) { return { label: k, value: byReason[k].length }; });

      var deptTurn = Object.keys(HR.groupBy(all, function (e) { return HR.nameOf('departments', e.deptId); })).map(function (d) {
        var g = all.filter(function (e) { return HR.nameOf('departments', e.deptId) === d; });
        var lv = g.filter(function (e) { return e.terminationDate; }).length;
        var ac = g.filter(function (e) { return e.status === 'ทำงาน' || e.status === 'ทดลองงาน'; }).length;
        return { dept: d, head: ac, leavers: lv, rate: ac ? HR.round2(lv / (ac + lv) * 100) : 0 };
      }).sort(function (a, b) { return b.rate - a.rate; });

      var exits = HR.rows('exitSurveys');
      var exitDims = [['เนื้องาน', 'sWork'], ['หัวหน้างาน', 'sManager'], ['ค่าตอบแทน', 'sPay'], ['โอกาสเติบโต', 'sGrowth'], ['วัฒนธรรมองค์กร', 'sCulture']];
      var exitData = exitDims.map(function (d) {
        var v = exits.map(function (x) { return Number(x[d[1]]) || 0; }).filter(Boolean);
        return { label: d[0], value: v.length ? HR.round2(HR.sum(v) / v.length) : 0 };
      });

      var firstYearLeavers = leavers.filter(function (e) { return HR.yearsBetween(e.hireDate, e.terminationDate) < 1; }).length;
      var slips = HR.rows('payslips');
      var costMonths = lastMonths(6);
      var costSeries = costMonths.map(function (m) {
        return HR.round2(HR.sum(slips.filter(function (s) { return s.period === m; }), function (s) { return s.laborCost; }));
      });

      return el('div', [
        HR.pageHead('วิเคราะห์ข้อมูลบุคลากร (HR Analytics)',
          'ตัวเลขทั้งหมดคำนวณสดจากข้อมูลในระบบ — ส่งออกเป็น Excel ได้ทุกตารางเพื่อนำไปทำรายงานผู้บริหารต่อ', [
          HR.btn('Export รายงานวิเคราะห์ (Excel)', function () {
            HR.excel.exportWorkbook([
              { name: 'อัตราการลาออกรายเดือน', aoa: [['เดือน', 'กำลังคน', 'ผู้ลาออก', 'อัตราการลาออก (%)']].concat(months.map(function (m, i) { return [HR.monthName(m), to[i].headcount, to[i].leavers, to[i].rate]; })) },
              { name: 'การลาออกตามฝ่าย', rows: deptTurn, cols: [{ k: 'dept', l: 'ฝ่าย' }, { k: 'head', l: 'กำลังคนปัจจุบัน', num: 1, dec: 0 }, { k: 'leavers', l: 'ผู้ลาออกสะสม', num: 1, dec: 0 }, { k: 'rate', l: 'อัตราการลาออก (%)', num: 1, dec: 2 }] },
              { name: 'เหตุผลการลาออก', aoa: [['เหตุผล', 'จำนวนคน']].concat(reasonData.map(function (d) { return [d.label, d.value]; })) },
              { name: 'คะแนน Exit Interview', aoa: [['มิติ', 'คะแนนเฉลี่ย (เต็ม 5)']].concat(exitData.map(function (d) { return [d.label, d.value]; })) },
              { name: 'ต้นทุนแรงงานรายเดือน', aoa: [['เดือน', 'ต้นทุนแรงงานรวม']].concat(costMonths.map(function (m, i) { return [HR.monthName(m), costSeries[i]]; })) },
              { name: 'ความหลากหลาย', aoa: diversityAoa(act) },
              { name: 'ข้อมูลพนักงานทั้งหมด', rows: all, cols: HR.exportCols('employees') }
            ], 'รายงานวิเคราะห์บุคลากร');
          }, 'btn-primary')
        ]),

        el('div.grid.cols-4', { style: 'margin-bottom:14px' }, [
          HR.kpi('อัตราการลาออก 12 เดือน', HR.num(HR.sum(to, function (t) { return t.leavers; }) / Math.max(1, HR.sum(to, function (t) { return t.headcount; }) / 12) * 100, 1), '%', HR.sum(to, function (t) { return t.leavers; }) + ' คนใน 12 เดือน', 'lift'),
          HR.kpi('ลาออกภายในปีแรก', firstYearLeavers, 'คน', leavers.length ? HR.num(firstYearLeavers / leavers.length * 100, 0) + '% ของผู้ลาออกทั้งหมด' : '', firstYearLeavers ? 'warnbar' : ''),
          HR.kpi('อายุงานเฉลี่ยผู้ลาออก', leavers.length ? HR.num(HR.sum(leavers, function (e) { return HR.yearsBetween(e.hireDate, e.terminationDate); }) / leavers.length, 1) : '0', 'ปี'),
          HR.kpi('ต้นทุนแรงงานต่อหัว', act.length ? HR.money(HR.sum(act, function (e) { return (e.salary || 0) + (e.positionAllowance || 0) + HR.engine.sso(e.salary); }) / act.length) : '0', 'บาท/เดือน')
        ]),

        el('div.grid.cols-2', [
          HR.card('อัตราการลาออกรายเดือน', '12 เดือนย้อนหลัง (%)', el('div', [
            HR.chartLine({
              labels: months.map(function (m) { return m.slice(5, 7); }),
              series: [{ name: 'อัตราการลาออก', color: HR.palette[3], values: to.map(function (t) { return t.rate; }) }],
              height: 230
            }),
            el('div.faint', { style: 'margin-top:6px' }, 'แกนนอนคือเลขเดือน · คิดจากผู้ลาออกในเดือนนั้นหารกำลังคนต้นเดือน')
          ])),
          HR.card('ต้นทุนแรงงานรวมรายเดือน', 'จากงวดที่คำนวณแล้ว (บาท)', el('div', [
            costSeries.some(Boolean) ? HR.chartBar({
              data: costMonths.map(function (m, i) { return { label: m.slice(5, 7), value: costSeries[i] }; }),
              height: 230, fmt: function (v) { return v ? HR.num(v / 1000, 0) + 'k' : '0'; }
            }) : el('div.empty', [el('b', 'ยังไม่มีงวดที่คำนวณแล้ว'), 'คำนวณเงินเดือนในโมดูลที่ 4 แล้วกลับมาดูกราฟนี้'])
          ]))
        ]),

        el('div', { style: 'height:14px' }),
        el('div.grid.cols-2', [
          HR.card('การลาออกตามฝ่าย', 'เรียงจากอัตราสูงสุด', HR.table({
            cols: [{ k: 'dept', l: 'ฝ่าย' }, { k: 'head', l: 'กำลังคน', num: 1, dec: 0 },
              { k: 'leavers', l: 'ผู้ลาออกสะสม', num: 1, dec: 0 }, { k: 'rate', l: 'อัตรา (%)', num: 1, dec: 2 }],
            rows: deptTurn, search: false, exportName: 'การลาออกตามฝ่าย', footerSum: ['head', 'leavers']
          })),
          HR.card('เหตุผลการลาออกที่พบบ่อย', reasonData.length ? 'จาก ' + offs.length + ' ราย' : null,
            reasonData.length ? el('div', [
              HR.chartBar({ data: reasonData, height: 230, fmt: function (v) { return HR.num(v, 0); } })
            ]) : el('div.empty', [el('b', 'ยังไม่มีข้อมูลการพ้นสภาพ'), 'บันทึกได้ที่หน้าการสิ้นสุดการจ้างงาน']))
        ]),

        el('div', { style: 'height:14px' }),
        el('div.grid.cols-2', [
          HR.card('คะแนน Exit Interview', 'คะแนนเต็ม 5 — มิติที่ต่ำที่สุดคือจุดที่ควรแก้ก่อน', exits.length ? el('div', [
            HR.chartBar({ data: exitData, height: 230, fmt: function (v) { return HR.num(v, 1); } }),
            el('div.callout.warn', { style: 'margin-top:10px' },
              'มิติที่ได้คะแนนต่ำสุด: ' + exitData.slice().sort(function (a, b) { return a.value - b.value; })[0].label)
          ]) : el('div.empty', [el('b', 'ยังไม่มีแบบสำรวจ'), 'บันทึกได้ที่หน้า Exit Interview'])),
          HR.card('ความหลากหลายของพนักงาน', null, HR.table({
            cols: [{ k: 'dim', l: 'มิติ' }, { k: 'group', l: 'กลุ่ม' }, { k: 'n', l: 'จำนวนคน', num: 1, dec: 0 },
              { k: 'pct', l: 'สัดส่วน (%)', num: 1, dec: 1 }],
            rows: diversityRows(act), search: false, exportName: 'ความหลากหลาย', pageSize: 20
          }))
        ])
      ]);
    }
  });

  function diversityRows(act) {
    var dims = [['เพศ', 'gender'], ['วุฒิการศึกษา', 'eduLevel'], ['ประเภทการจ้าง', 'employmentType'], ['สถานที่ทำงาน', 'workLocation']];
    var out = [];
    dims.forEach(function (d) {
      var g = HR.groupBy(act, function (e) { return e[d[1]] || 'ไม่ระบุ'; });
      Object.keys(g).forEach(function (k) {
        out.push({ dim: d[0], group: k, n: g[k].length, pct: HR.round2(g[k].length / Math.max(1, act.length) * 100) });
      });
    });
    var bands = [['น้อยกว่า 30 ปี', 0, 30], ['30–39 ปี', 30, 40], ['40–49 ปี', 40, 50], ['50 ปีขึ้นไป', 50, 200]];
    bands.forEach(function (b) {
      var n = act.filter(function (e) { var a = e.dob ? HR.yearsBetween(e.dob) : null; return a != null && a >= b[1] && a < b[2]; }).length;
      out.push({ dim: 'ช่วงอายุ', group: b[0], n: n, pct: HR.round2(n / Math.max(1, act.length) * 100) });
    });
    return out;
  }
  function diversityAoa(act) {
    return [['มิติ', 'กลุ่ม', 'จำนวนคน', 'สัดส่วน (%)']].concat(diversityRows(act).map(function (r) { return [r.dim, r.group, r.n, r.pct]; }));
  }

  /* ---------- การพ้นสภาพ ---------- */
  HR.view('offboardings', {
    title: 'การสิ้นสุดการจ้างงาน',
    render: HR.crud('offboardings', {
      desc: 'บันทึกการพ้นสภาพ ตรวจการคืนทรัพย์สิน ทำ Exit Interview และคำนวณค่าชดเชยตามกฎหมายแรงงาน',
      footerSum: ['severanceAmount'],
      defaults: function () { return { noticeDate: HR.today(), lastDay: HR.today(), status: 'กำลังดำเนินการ' }; },
      rowActions: function (r) {
        return [
          { label: 'คำนวณค่าชดเชย', fn: function () { severance(r); } },
          { label: 'ตรวจคืนทรัพย์สิน', fn: function () { clearance(r); } },
          { label: 'Exit Interview', fn: function () { HR.openEditor('exitSurveys', { employeeId: r.employeeId, date: r.lastDay, interviewerId: (HR.myEmployee() || {}).id }); } }
        ];
      },
      actions: function () {
        return [HR.btn('ใบตรวจสอบการพ้นสภาพ (Excel)', clearanceExport)];
      },
      before: function () {
        var offs = HR.rows('offboardings');
        var inProgress = offs.filter(function (o) { return o.status === 'กำลังดำเนินการ'; });
        var outstanding = HR.rows('assets').filter(function (a) { return a.status === 'ค้างคืน'; });
        return el('div', { style: 'margin-bottom:16px' }, [
          el('div.grid.cols-4', [
            HR.kpi('รายการพ้นสภาพทั้งหมด', offs.length, 'ราย', null, 'lift'),
            HR.kpi('กำลังดำเนินการ', inProgress.length, 'ราย', null, inProgress.length ? 'warnbar' : ''),
            HR.kpi('ค่าชดเชยที่จ่ายรวม', HR.money(HR.sum(offs, function (o) { return o.severanceAmount; })), 'บาท'),
            HR.kpi('ทรัพย์สินค้างคืน', outstanding.length, 'รายการ', outstanding.length ? HR.money(HR.sum(outstanding, function (a) { return a.value; })) + ' บาท' : 'ไม่มีค้าง', outstanding.length ? 'dangerbar' : '')
          ])
        ]);
      }
    })
  });

  function severance(off) {
    var e = HR.db.byId('employees', off.employeeId);
    if (!e) { HR.toast('ไม่พบข้อมูลพนักงานของรายการนี้', 'err'); return; }
    var s = HR.engine.severance(e, off.lastDay, off.reason);
    var total = HR.round2(s.severance + s.unusedLeavePay + (s.noticePay || 0));

    var rows = [
      { item: 'ค่าชดเชยตามกฎหมาย (' + s.days + ' วัน × ' + HR.money(s.dailyRate) + ' บาท)', amount: s.severance, note: s.note },
      { item: 'ค่าจ้างแทนการบอกกล่าวล่วงหน้า (30 วัน)', amount: s.noticePay, note: s.eligible ? 'กรณีไม่ได้บอกกล่าวล่วงหน้าตามกฎหมาย' : 'ไม่เข้าเงื่อนไข' },
      { item: 'ค่าจ้างวันลาพักร้อนที่ยังไม่ได้ใช้ (' + HR.num(s.unusedLeaveDays, 1) + ' วัน)', amount: s.unusedLeavePay, note: 'ตามสิทธิ์คงเหลือในระบบ' }
    ];

    var body = el('div.stack', [
      el('div.grid.cols-3', [
        HR.kpi('อายุงาน', HR.num(s.years, 2), 'ปี', 'เริ่มงาน ' + HR.dateTH(e.hireDate), 'lift'),
        HR.kpi('ค่าจ้างรายวัน', HR.money(s.dailyRate), 'บาท', 'จากเงินเดือน ' + HR.money(e.salary) + ' ÷ ' + HR.S().workDaysPerMonth + ' วัน'),
        HR.kpi('สิทธิ์ค่าชดเชย', s.days, 'วัน', s.eligible ? 'เข้าเงื่อนไขตามมาตรา 118' : 'ไม่เข้าเงื่อนไข', s.eligible ? '' : 'warnbar')
      ]),
      HR.card('รายการเงินที่ต้องจ่าย', 'เหตุผลการพ้นสภาพ: ' + off.reason, HR.table({
        cols: [{ k: 'item', l: 'รายการ' }, { k: 'amount', l: 'จำนวนเงิน', num: 1 }, { k: 'note', l: 'หมายเหตุ' }],
        rows: rows, search: false, exportName: 'ค่าชดเชย', footerSum: ['amount']
      })),
      el('div.slip-net', [el('div', 'รวมเงินที่ต้องจ่ายเมื่อสิ้นสุดการจ้าง'), el('b', HR.money(total) + ' บาท')]),
      el('div.callout', 'เกณฑ์ค่าชดเชยตาม พ.ร.บ.คุ้มครองแรงงาน มาตรา 118: ทำงานครบ 120 วัน–1 ปี ได้ 30 วัน · 1–3 ปี ได้ 90 วัน · 3–6 ปี ได้ 180 วัน · 6–10 ปี ได้ 240 วัน · 10–20 ปี ได้ 300 วัน · 20 ปีขึ้นไป ได้ 400 วัน — กรณีลาออกเองหรือเลิกจ้างด้วยเหตุร้ายแรงไม่มีสิทธิ์ค่าชดเชย ตัวเลขนี้เป็นการคำนวณเบื้องต้น ควรให้ฝ่ายกฎหมายตรวจก่อนจ่าย')
    ]);

    HR.modal({
      title: 'คำนวณค่าชดเชย — ' + HR.label('employees', e), size: 'wide', body: body,
      buttons: [
        { label: 'ปิด' },
        {
          label: 'Export ใบคำนวณ (Excel)', fn: function () {
            HR.excel.exportAOA([
              ['ใบคำนวณเงินเมื่อสิ้นสุดการจ้างงาน'], [HR.nameOf('companies', e.companyId)], [],
              ['พนักงาน', HR.label('employees', e)], ['ตำแหน่ง', HR.nameOf('positions', e.positionId)],
              ['ฝ่าย', HR.nameOf('departments', e.deptId)], ['วันเริ่มงาน', HR.dateTH(e.hireDate)],
              ['วันทำงานวันสุดท้าย', HR.dateTH(off.lastDay)], ['อายุงาน (ปี)', HR.round2(s.years)],
              ['เหตุผลการพ้นสภาพ', off.reason], ['เงินเดือน', e.salary], ['ค่าจ้างรายวัน', s.dailyRate],
              ['สิทธิ์ค่าชดเชย (วัน)', s.days], [],
              ['รายการ', 'จำนวนเงิน', 'หมายเหตุ']
            ].concat(rows.map(function (r) { return [r.item, r.amount, r.note]; }), [['รวมทั้งสิ้น', total, '']]),
              'ค่าชดเชย', 'ค่าชดเชย_' + e.code);
          }
        },
        {
          label: 'บันทึกยอดเข้ารายการพ้นสภาพ', cls: 'btn-primary', fn: function () {
            HR.db.update('offboardings', off.id, { severanceAmount: total });
            HR.db.update('employees', e.id, {
              status: off.reason === 'ลาออกเอง' ? 'ลาออก' : 'เลิกจ้าง',
              terminationDate: off.lastDay
            });
            HR.toast('บันทึกค่าชดเชย ' + HR.money(total) + ' บาท และปรับสถานะพนักงานเป็นพ้นสภาพแล้ว');
            HR.render();
          }
        }
      ]
    });
  }

  function clearance(off) {
    var e = HR.db.byId('employees', off.employeeId) || {};
    var assets = HR.rows('assets').filter(function (a) { return a.employeeId === off.employeeId; });
    var tasks = off.clearTasks || [
      { task: 'ส่งมอบงานและเอกสารให้ผู้รับผิดชอบคนใหม่', owner: 'หัวหน้างาน', done: false },
      { task: 'คืนทรัพย์สินบริษัททั้งหมด', owner: 'ฝ่ายสนับสนุน', done: false },
      { task: 'ยกเลิกสิทธิ์เข้าระบบและบัญชีผู้ใช้', owner: 'ฝ่ายเทคโนโลยีสารสนเทศ', done: false },
      { task: 'ตรวจยอดเงินกู้สวัสดิการและเงินค้างชำระ', owner: 'ฝ่ายบัญชีและการเงิน', done: false },
      { task: 'แจ้งออกจากการเป็นผู้ประกันตน (สปส. 6-09)', owner: 'ฝ่ายทรัพยากรบุคคล', done: false },
      { task: 'ออกหนังสือรับรองการทำงาน', owner: 'ฝ่ายทรัพยากรบุคคล', done: false },
      { task: 'สัมภาษณ์ก่อนลาออก (Exit Interview)', owner: 'ฝ่ายทรัพยากรบุคคล', done: false }
    ];

    var list = el('div.checklist'), assetHost = el('div');
    function redraw() {
      HR.clear(list);
      tasks.forEach(function (c, i) {
        var cb = el('input', { type: 'checkbox' });
        cb.checked = !!c.done;
        cb.addEventListener('change', function () {
          c.done = cb.checked;
          HR.db.update('offboardings', off.id, { clearTasks: tasks });
          redraw();
        });
        list.appendChild(el('div.check-item' + (c.done ? '.done' : ''), [
          cb, el('div.ci-body', [el('b', (i + 1) + '. ' + c.task), el('div', 'ผู้รับผิดชอบ: ' + c.owner)])
        ]));
      });
      HR.clear(assetHost).appendChild(HR.table({
        cols: HR.listCols('assets'), rows: assets, search: false, exportName: 'ทรัพย์สิน_' + (e.code || ''),
        footerSum: ['value'],
        actions: function (a) {
          return a.status !== 'คืนแล้ว' ? [{
            label: 'รับคืนแล้ว', fn: function () {
              HR.db.update('assets', a.id, { status: 'คืนแล้ว', returnedDate: HR.today() });
              a.status = 'คืนแล้ว'; a.returnedDate = HR.today();
              HR.toast('บันทึกการรับคืน ' + a.name);
              redraw();
            }
          }, {
            label: 'ค้างคืน', cls: 'btn-danger', fn: function () {
              HR.db.update('assets', a.id, { status: 'ค้างคืน' });
              a.status = 'ค้างคืน'; redraw();
            }
          }] : [];
        }
      }));
    }
    redraw();

    HR.modal({
      title: 'ตรวจสอบการคืนทรัพย์สิน — ' + HR.label('employees', e), size: 'wide',
      body: el('div.stack', [
        el('div.grid.cols-3', [
          HR.kpi('ทรัพย์สินที่ถือครอง', assets.length, 'รายการ'),
          HR.kpi('คืนแล้ว', assets.filter(function (a) { return a.status === 'คืนแล้ว'; }).length, 'รายการ'),
          HR.kpi('มูลค่าที่ยังไม่คืน', HR.money(HR.sum(assets.filter(function (a) { return a.status !== 'คืนแล้ว'; }), function (a) { return a.value; })), 'บาท')
        ]),
        HR.card('รายการทรัพย์สิน', 'วันทำงานวันสุดท้าย ' + HR.dateTH(off.lastDay), assetHost, [
          HR.btn('+ เพิ่มทรัพย์สิน', function () { HR.openEditor('assets', { employeeId: off.employeeId, issuedDate: HR.today(), status: 'ถือครอง' }); }, 'btn-sm')
        ]),
        HR.card('เช็กลิสต์การพ้นสภาพ', null, list)
      ]),
      buttons: [
        { label: 'ปิด', fn: function () { HR.render(); } },
        {
          label: 'ปิดงานพ้นสภาพ', cls: 'btn-primary', fn: function () {
            var left = assets.filter(function (a) { return a.status !== 'คืนแล้ว'; });
            if (left.length) { HR.toast('ยังมีทรัพย์สินไม่คืน ' + left.length + ' รายการ — บันทึกการรับคืนหรือทำเครื่องหมายค้างคืนก่อน', 'err'); return; }
            if (tasks.some(function (t) { return !t.done; })) { HR.toast('ยังมีรายการในเช็กลิสต์ที่ไม่เสร็จ', 'err'); return; }
            HR.db.update('offboardings', off.id, { status: 'เสร็จสิ้น', clearTasks: tasks });
            HR.toast('ปิดงานพ้นสภาพของ ' + HR.label('employees', e) + ' แล้ว');
            HR.render();
          }
        }
      ]
    });
  }

  function clearanceExport() {
    var aoa = [['พนักงาน', 'ฝ่าย', 'วันทำงานวันสุดท้าย', 'เหตุผล', 'สถานะ', 'ค่าชดเชย',
      'ทรัพย์สินทั้งหมด', 'คืนแล้ว', 'ค้างคืน', 'มูลค่าที่ยังไม่คืน', 'ทำ Exit Interview', 'เช็กลิสต์ที่เสร็จ']];
    HR.rows('offboardings').forEach(function (o) {
      var as = HR.rows('assets').filter(function (a) { return a.employeeId === o.employeeId; });
      var tasks = o.clearTasks || [];
      aoa.push([HR.nameOf('employees', o.employeeId), HR.nameOf('departments', (HR.db.byId('employees', o.employeeId) || {}).deptId),
        HR.date(o.lastDay), o.reason, o.status, o.severanceAmount || 0,
        as.length, as.filter(function (a) { return a.status === 'คืนแล้ว'; }).length,
        as.filter(function (a) { return a.status === 'ค้างคืน'; }).length,
        HR.round2(HR.sum(as.filter(function (a) { return a.status !== 'คืนแล้ว'; }), function (a) { return a.value; })),
        HR.rows('exitSurveys').some(function (x) { return x.employeeId === o.employeeId; }) ? 'ทำแล้ว' : 'ยังไม่ทำ',
        tasks.length ? tasks.filter(function (t) { return t.done; }).length + '/' + tasks.length : '-']);
    });
    HR.excel.exportAOA(aoa, 'ใบตรวจสอบพ้นสภาพ', 'ใบตรวจสอบการพ้นสภาพ');
  }

  HR.view('assets', {
    title: 'ทรัพย์สินที่พนักงานถือครอง',
    render: HR.crud('assets', {
      desc: 'ทะเบียนทรัพย์สินที่มอบให้พนักงาน ใช้เป็นฐานของการตรวจคืนเมื่อพ้นสภาพ (Clearance Check)',
      footerSum: ['value'],
      defaults: function () { return { issuedDate: HR.today(), status: 'ถือครอง' }; },
      rowActions: function (r) {
        return r.status !== 'คืนแล้ว' ? [{
          label: 'รับคืน', fn: function () {
            HR.db.update('assets', r.id, { status: 'คืนแล้ว', returnedDate: HR.today() });
            HR.toast('บันทึกการรับคืนแล้ว'); HR.render();
          }
        }] : [];
      },
      before: function () {
        var as = HR.rows('assets');
        return el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('ทรัพย์สินทั้งหมด', as.length, 'รายการ', null, 'lift'),
          HR.kpi('มูลค่ารวม', HR.money(HR.sum(as, function (a) { return a.value; })), 'บาท'),
          HR.kpi('ถือครองอยู่', as.filter(function (a) { return a.status === 'ถือครอง'; }).length, 'รายการ'),
          HR.kpi('ค้างคืน', as.filter(function (a) { return a.status === 'ค้างคืน'; }).length, 'รายการ', null, as.some(function (a) { return a.status === 'ค้างคืน'; }) ? 'dangerbar' : '')
        ]);
      }
    })
  });

  HR.view('exitSurveys', {
    title: 'Exit Interview',
    render: HR.crud('exitSurveys', {
      desc: 'เก็บเสียงของคนที่กำลังออกอย่างเป็นระบบ 5 มิติ เพื่อหาสาเหตุที่แก้ได้จริง — ผลรวมแสดงที่หน้าวิเคราะห์ข้อมูลบุคลากร',
      defaults: function () { return { date: HR.today() }; },
      before: function () {
        var ex = HR.rows('exitSurveys');
        if (!ex.length) return null;
        var dims = [['เนื้องาน', 'sWork'], ['หัวหน้างาน', 'sManager'], ['ค่าตอบแทน', 'sPay'], ['โอกาสเติบโต', 'sGrowth'], ['วัฒนธรรมองค์กร', 'sCulture']];
        var data = dims.map(function (d) {
          var v = ex.map(function (x) { return Number(x[d[1]]) || 0; }).filter(Boolean);
          return { label: d[0], value: v.length ? HR.round2(HR.sum(v) / v.length) : 0 };
        });
        var rec = ex.filter(function (x) { return x.recommend === 'ใช่'; }).length;
        return el('div', { style: 'margin-bottom:16px' }, [
          el('div.grid.cols-4', [
            HR.kpi('แบบสำรวจที่ทำแล้ว', ex.length, 'ราย', null, 'lift'),
            HR.kpi('คะแนนเฉลี่ยรวม', HR.num(HR.sum(data, function (d) { return d.value; }) / data.length, 2), '/5'),
            HR.kpi('ยังแนะนำองค์กรให้คนอื่น', HR.num(rec / ex.length * 100, 0), '%', rec + ' จาก ' + ex.length + ' ราย'),
            HR.kpi('พร้อมกลับมาทำงานอีก', HR.num(ex.filter(function (x) { return x.wouldReturn === 'ใช่'; }).length / ex.length * 100, 0), '%')
          ]),
          el('div', { style: 'margin-top:14px' }, [
            HR.card('คะแนนเฉลี่ยแต่ละมิติ', 'คะแนนเต็ม 5', el('div', [HR.chartBar({ data: data, height: 220, fmt: function (v) { return HR.num(v, 1); } })]))
          ])
        ]);
      }
    })
  });
})(window.HR);
