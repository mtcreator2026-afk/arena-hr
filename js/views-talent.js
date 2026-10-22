/* views-talent.js — โมดูล 5: ประเมินผลงาน (KPI/OKR และ 360 องศา) */
(function (HR) {
  'use strict';
  var el = HR.el;

  function score(list) {
    var w = HR.sum(list, function (g) { return g.weight; });
    if (!w) return 0;
    return HR.round2(HR.sum(list, function (g) {
      return (g.weight || 0) * (g.target ? Math.min(1.2, (g.actual || 0) / g.target) : 0);
    }) / w * 100);
  }
  HR.kpiScore = score;
  function grade(sc) { return sc >= 110 ? 'A+ เกินเป้าอย่างมาก' : sc >= 100 ? 'A บรรลุเป้า' : sc >= 90 ? 'B ใกล้เป้า' : sc >= 75 ? 'C ต่ำกว่าเป้า' : 'D ต้องปรับปรุง'; }

  /* ---------- เป้าหมาย KPI / OKR ---------- */
  HR.view('goals', {
    title: 'เป้าหมาย KPI / OKR',
    render: HR.crud('goals', {
      desc: 'ตั้งเป้าหมายรายบุคคลพร้อมน้ำหนัก แล้วบันทึกผลจริง ระบบคิดเปอร์เซ็นต์การบรรลุและคะแนนถ่วงน้ำหนักให้',
      footerSum: ['weight'],
      actions: function () { return [HR.btn('คะแนนถ่วงน้ำหนักรายคน (Excel)', weightedReport)]; },
      before: function () {
        var gl = HR.rows('goals');
        var byEmp = HR.groupBy(gl, function (g) { return g.employeeId; });
        var scored = Object.keys(byEmp).map(function (id) { return score(byEmp[id]); });
        return el('div', { style: 'margin-bottom:16px' }, [
          el('div.grid.cols-4', [
            HR.kpi('เป้าหมายทั้งหมด', gl.length, 'ข้อ', null, 'lift'),
            HR.kpi('พนักงานที่มีเป้าหมาย', Object.keys(byEmp).length, 'คน'),
            HR.kpi('คะแนนบรรลุเฉลี่ย', scored.length ? HR.num(HR.sum(scored) / scored.length, 1) : '0', '%'),
            HR.kpi('บรรลุเป้าครบ 100%', scored.filter(function (s) { return s >= 100; }).length, 'คน')
          ]),
          weightWarning(byEmp)
        ]);
      }
    })
  });

  function weightWarning(byEmp) {
    var bad = Object.keys(byEmp).filter(function (id) {
      return Math.abs(HR.sum(byEmp[id], function (g) { return g.weight; }) - 100) > 0.5;
    });
    if (!bad.length) return null;
    return el('div.callout.warn', { style: 'margin-top:12px' },
      'น้ำหนักเป้าหมายไม่เท่ากับ 100%: ' + bad.map(function (id) {
        return HR.nameOf('employees', id) + ' (' + HR.num(HR.sum(byEmp[id], function (g) { return g.weight; }), 0) + '%)';
      }).join(' · '));
  }

  function weightedReport() {
    var byEmp = HR.groupBy(HR.rows('goals'), function (g) { return g.employeeId; });
    var aoa = [['รหัส', 'ชื่อ-นามสกุล', 'บริษัท', 'ฝ่าย', 'รอบประเมิน', 'จำนวนเป้าหมาย', 'น้ำหนักรวม (%)', 'คะแนนถ่วงน้ำหนัก (%)', 'เกรด']];
    Object.keys(byEmp).forEach(function (id) {
      var e = HR.db.byId('employees', id) || {}, list = byEmp[id], sc = score(list);
      aoa.push([e.code, e.firstName + ' ' + e.lastName, HR.nameOf('companies', e.companyId), HR.nameOf('departments', e.deptId),
        list[0].cycle, list.length, HR.sum(list, function (g) { return g.weight; }), sc, grade(sc)]);
    });
    HR.excel.exportAOA(aoa, 'คะแนนถ่วงน้ำหนัก', 'คะแนน KPI รายคน');
  }

  /* ---------- ประเมิน 360 องศา ---------- */
  HR.view('reviews', {
    title: 'ประเมินผลงาน 360 องศา',
    render: function () {
      var rv = HR.rows('reviews');
      var byEmp = HR.groupBy(rv, function (r) { return r.employeeId; });
      var summary = Object.keys(byEmp).map(function (id) {
        var e = HR.db.byId('employees', id) || {}, list = byEmp[id];
        var per = function (rel) {
          var f = list.filter(function (r) { return r.relation === rel; });
          return f.length ? HR.round2(HR.sum(f, HR.avgScore) / f.length) : null;
        };
        var self = per('ประเมินตนเอง'), boss = per('หัวหน้า');
        var gl = HR.db.t('goals').filter(function (g) { return g.employeeId === id; });
        return {
          code: e.code, name: HR.label('employees', e), dept: HR.nameOf('departments', e.deptId),
          views: list.length, self: self, boss: boss, peer: per('เพื่อนร่วมงาน'), team: per('ลูกทีม'),
          overall: HR.round2(HR.sum(list, HR.avgScore) / list.length),
          gap: self != null && boss != null ? HR.round2(self - boss) : null,
          kpi: gl.length ? score(gl) : null
        };
      });

      return el('div', [
        HR.pageHead('ประเมินผลงาน 360 องศา',
          'รวมมุมมองจากตนเอง หัวหน้า เพื่อนร่วมงาน และลูกทีม — ช่องว่าง (Gap) ที่เป็นบวกมากหมายถึงประเมินตนเองสูงกว่าหัวหน้ามาก', [
          HR.btn('+ บันทึกแบบประเมิน', function () { HR.openEditor('reviews', { cycle: new Date().getFullYear() + ' H2', status: 'ร่าง' }); }, 'btn-primary'),
          HR.btn('Export สรุป 360 (Excel)', function () {
            HR.excel.exportWorkbook([
              { name: 'สรุปรายคน', rows: summary, cols: sumCols() },
              { name: 'แบบประเมินทั้งหมด', rows: rv, cols: HR.exportCols('reviews') }
            ], 'ประเมิน360');
          })
        ]),
        el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('แบบประเมินที่บันทึก', rv.length, 'ชุด', null, 'lift'),
          HR.kpi('พนักงานที่ถูกประเมิน', summary.length, 'คน'),
          HR.kpi('คะแนนเฉลี่ยองค์กร', summary.length ? HR.num(HR.sum(summary, function (s) { return s.overall; }) / summary.length, 2) : '-', '/5'),
          HR.kpi('ประเมินตนเองสูงกว่าหัวหน้า', summary.filter(function (s) { return s.gap != null && s.gap >= 0.5; }).length, 'คน', 'ช่องว่างตั้งแต่ 0.5 ขึ้นไป')
        ]),
        HR.card('สรุปคะแนนรายคน', 'คะแนนเต็ม 5', HR.table({
          cols: sumCols(), rows: summary, exportName: 'สรุป360'
        })),
        el('div', { style: 'height:16px' }),
        HR.table({
          cols: HR.listCols('reviews'), rows: rv, exportName: 'แบบประเมิน360',
          actions: function (r) {
            return [
              { label: 'แก้ไข', fn: function () { HR.openEditor('reviews', r); } },
              { label: 'ลบ', cls: 'btn-danger', fn: function () { HR.deleteRow('reviews', r); } }
            ];
          }
        })
      ]);
    }
  });

  function sumCols() {
    return [
      { k: 'code', l: 'รหัส', w: 90 }, { k: 'name', l: 'พนักงาน' }, { k: 'dept', l: 'ฝ่าย' },
      { k: 'views', l: 'จำนวนมุมมอง', num: 1, dec: 0 },
      { k: 'self', l: 'ประเมินตนเอง', num: 1, dec: 2 }, { k: 'boss', l: 'หัวหน้า', num: 1, dec: 2 },
      { k: 'peer', l: 'เพื่อนร่วมงาน', num: 1, dec: 2 }, { k: 'team', l: 'ลูกทีม', num: 1, dec: 2 },
      { k: 'overall', l: 'เฉลี่ยรวม', num: 1, dec: 2 }, { k: 'gap', l: 'ช่องว่าง (ตนเอง−หัวหน้า)', num: 1, dec: 2 },
      { k: 'kpi', l: 'คะแนน KPI (%)', num: 1, dec: 1 }
    ];
  }
})(window.HR);
