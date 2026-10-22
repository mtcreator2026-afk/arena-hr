/* views-recruit.js — โมดูล 1: สรรหาและคัดเลือก (ATS) */
(function (HR) {
  'use strict';
  var el = HR.el;

  /* ---------- ประกาศรับสมัครงาน ---------- */
  HR.view('jobs', {
    title: 'ประกาศรับสมัครงาน',
    render: HR.crud('jobs', {
      desc: 'สร้างประกาศครั้งเดียว กระจายได้หลายช่องทาง และกำหนดคำสำคัญให้ระบบคัดกรองเรซูเม่ให้อัตโนมัติ',
      footerSum: ['openings', 'applicants'],
      rowActions: function (r) {
        return [
          { label: 'ดูผู้สมัคร', fn: function () { HR.go('applicants?job=' + r.id); } },
          { label: 'สำเนาประกาศ', fn: function () { copyPosting(r); } }
        ];
      },
      actions: function () {
        return [HR.btn('สรุปช่องทางที่ได้ผล (Excel)', channelReport)];
      },
      before: function () {
        var jobs = HR.rows('jobs'), apps = HR.rows('applicants');
        var open = jobs.filter(function (j) { return j.status === 'เผยแพร่'; });
        var hired = apps.filter(function (a) { return a.stage === 'จ้าง'; }).length;
        return el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('ประกาศที่เปิดรับ', open.length, 'ประกาศ', null, 'lift'),
          HR.kpi('อัตราที่ต้องเติม', HR.sum(open, function (j) { return j.openings; }), 'อัตรา'),
          HR.kpi('ผู้สมัครทั้งหมด', apps.length, 'คน'),
          HR.kpi('อัตราการจ้างสำเร็จ', apps.length ? HR.num(hired / apps.length * 100, 1) : '0', '%', hired + ' คนได้รับการจ้าง')
        ]);
      }
    })
  });

  function copyPosting(job) {
    var txt = [
      job.title + ' (' + job.openings + ' อัตรา)',
      'ฝ่าย: ' + HR.nameOf('departments', job.deptId),
      'ประสบการณ์: ' + (job.minExperience || 0) + ' ปีขึ้นไป',
      'ช่วงเงินเดือน: ' + HR.num(job.salaryMin, 0) + ' - ' + HR.num(job.salaryMax, 0) + ' บาท',
      'คุณสมบัติที่ต้องการ: ' + (job.keywords || '-'),
      '',
      job.detail || '',
      '',
      'ช่องทางรับสมัคร: ' + (job.channels || []).join(' / ')
    ].join('\n');
    HR.modal({
      title: 'ข้อความประกาศสำหรับนำไปเผยแพร่',
      body: el('div.stack', [
        el('textarea', { value: txt, style: 'min-height:260px' }),
        el('div.faint', 'เลือกข้อความทั้งหมดแล้วคัดลอกไปวางในช่องทางที่ต้องการ หรือกดดาวน์โหลดเป็นไฟล์ข้อความ')
      ]),
      buttons: [
        { label: 'ดาวน์โหลด .txt', fn: function () { HR.excel.exportText(txt, 'ประกาศงาน_' + job.code + '.txt'); } },
        { label: 'ปิด' }
      ]
    });
  }

  function channelReport() {
    var apps = HR.rows('applicants');
    var byCh = HR.groupBy(apps, function (a) { return a.source || 'ไม่ระบุ'; });
    var aoa = [['ช่องทาง', 'ผู้สมัคร', 'ผ่านเข้าสัมภาษณ์', 'ได้รับการจ้าง', 'อัตราการจ้าง (%)', 'คะแนนคัดกรองเฉลี่ย']];
    Object.keys(byCh).forEach(function (ch) {
      var rows = byCh[ch];
      var iv = rows.filter(function (a) { return ['สัมภาษณ์', 'ยื่นข้อเสนอ', 'จ้าง'].indexOf(a.stage) > -1; }).length;
      var hi = rows.filter(function (a) { return a.stage === 'จ้าง'; }).length;
      var sc = HR.sum(rows, function (a) { return HR.engine.screenResume(a, HR.db.byId('jobs', a.jobId)); }) / rows.length;
      aoa.push([ch, rows.length, iv, hi, HR.round2(hi / rows.length * 100), HR.round2(sc)]);
    });
    HR.excel.exportAOA(aoa, 'ช่องทางสรรหา', 'รายงานช่องทางสรรหา');
  }

  /* ---------- ผู้สมัคร + Pipeline ---------- */
  var STAGES = ['สมัครใหม่', 'คัดกรอง', 'สัมภาษณ์', 'ยื่นข้อเสนอ', 'จ้าง', 'ไม่ผ่าน'];

  HR.view('applicants', {
    title: 'ผู้สมัครงาน (ATS)',
    render: function (params) {
      var wrap = el('div');
      var all = HR.rows('applicants');
      var jobFilter = params.job || '';
      var rows = jobFilter ? all.filter(function (a) { return a.jobId === jobFilter; }) : all;

      wrap.appendChild(HR.pageHead('ผู้สมัครงาน (ATS)',
        'ระบบให้คะแนนคัดกรองจากคำสำคัญของประกาศ ประสบการณ์ และความสอดคล้องของเงินเดือนที่คาดหวัง — กดการ์ดเพื่อเลื่อนขั้นตอน',
        [
          HR.btn('+ เพิ่มผู้สมัคร', function () { HR.openEditor('applicants', { appliedDate: HR.today(), stage: 'สมัครใหม่', jobId: jobFilter }); }, 'btn-primary'),
          HR.btn('รายงานคัดกรอง (Excel)', screenReport)
        ]));

      var sel = el('select', { style: 'max-width:320px' });
      sel.appendChild(el('option', { value: '' }, 'ทุกประกาศ'));
      HR.rows('jobs').forEach(function (j) { sel.appendChild(el('option', { value: j.id }, j.code + ' ' + j.title)); });
      sel.value = jobFilter;
      sel.addEventListener('change', function () { location.hash = '#applicants' + (sel.value ? '?job=' + sel.value : ''); });
      wrap.appendChild(el('div.row', { style: 'margin-bottom:14px' }, [el('span.faint', 'กรองตามประกาศ'), sel]));

      /* Pipeline */
      var pipe = el('div.pipeline');
      STAGES.forEach(function (st) {
        var inStage = rows.filter(function (a) { return a.stage === st; });
        var col = el('div.pipe-col', [el('h4', [st, el('span', String(inStage.length))])]);
        inStage.forEach(function (a) {
          var score = HR.engine.screenResume(a, HR.db.byId('jobs', a.jobId));
          col.appendChild(el('div.pipe-card', { onclick: function () { openApplicant(a); } }, [
            el('b', a.name),
            el('div.m', HR.nameOf('jobs', a.jobId)),
            el('div.m', 'ประสบการณ์ ' + HR.num(a.experienceYears, 1) + ' ปี · คาดหวัง ' + HR.num(a.expectedSalary, 0) + ' บาท'),
            el('div.score-bar', el('i', { style: 'width:' + Math.min(100, score) + '%' })),
            el('div.m', 'คะแนนคัดกรอง ' + score + '/100')
          ]));
        });
        if (!inStage.length) col.appendChild(el('div.faint', { style: 'padding:10px 2px' }, 'ไม่มีผู้สมัคร'));
        pipe.appendChild(col);
      });
      wrap.appendChild(HR.card('สายท่อผู้สมัคร (Pipeline)', rows.length + ' คน', pipe));

      wrap.appendChild(el('div', { style: 'height:16px' }));
      wrap.appendChild(HR.table({
        cols: HR.listCols('applicants'), rows: rows, exportName: 'ผู้สมัคร',
        onImport: function (im) { im.forEach(function (r) { HR.db.insert('applicants', r); }); HR.toast('นำเข้าผู้สมัคร ' + im.length + ' คน'); HR.render(); },
        actions: function (r) {
          return [
            { label: 'เปิด', fn: function () { openApplicant(r); } },
            { label: 'แก้ไข', fn: function () { HR.openEditor('applicants', r); } },
            { label: 'ลบ', cls: 'btn-danger', fn: function () { HR.deleteRow('applicants', r); } }
          ];
        }
      }));
      return wrap;
    }
  });

  function openApplicant(a) {
    var job = HR.db.byId('jobs', a.jobId);
    var score = HR.engine.screenResume(a, job);
    var ivs = HR.rows('interviews').filter(function (i) { return i.applicantId === a.id; });
    var stageSel = el('select');
    STAGES.concat(['ปฏิเสธข้อเสนอ']).forEach(function (s) { stageSel.appendChild(el('option', { value: s }, s)); });
    stageSel.value = a.stage;

    var body = el('div.stack', [
      el('div.grid.cols-3', [
        HR.kpi('คะแนนคัดกรอง', score, '/100', job ? 'เทียบกับคำสำคัญ: ' + (job.keywords || '-') : '', score >= 70 ? 'lift' : score >= 50 ? 'warnbar' : 'dangerbar'),
        HR.kpi('ประสบการณ์', HR.num(a.experienceYears, 1), 'ปี', job ? 'ตำแหน่งต้องการ ' + (job.minExperience || 0) + ' ปี' : ''),
        HR.kpi('เงินเดือนที่คาดหวัง', HR.num(a.expectedSalary, 0), 'บาท', job ? 'งบสูงสุด ' + HR.num(job.salaryMax, 0) + ' บาท' : '')
      ]),
      HR.card('ข้อมูลผู้สมัคร', null, el('div.form-grid', [
        kv('สมัครตำแหน่ง', HR.nameOf('jobs', a.jobId)), kv('ช่องทาง', a.source),
        kv('อีเมล', a.email), kv('โทรศัพท์', a.phone),
        kv('การศึกษา', a.education), kv('ตำแหน่งล่าสุด', a.lastPosition),
        kv('ทักษะ', a.skills), kv('บันทึก', a.notes)
      ])),
      HR.card('ประวัติการสัมภาษณ์', ivs.length + ' รอบ', ivs.length ? HR.table({
        cols: [
          { k: 'round', l: 'รอบ' }, { k: 'date', l: 'วันที่', fmt: function (r) { return HR.date(r.date); } },
          { k: 'time', l: 'เวลา' }, { k: 'interviewerId', l: 'ผู้สัมภาษณ์', fmt: function (r) { return HR.nameOf('employees', r.interviewerId); } },
          { k: 'score', l: 'คะแนน', num: 1, dec: 0 },
          { k: 'result', l: 'ผล', badge: function (r) { return HR.bk(r.result); } }
        ], rows: ivs, search: false, exportName: 'สัมภาษณ์_' + a.name
      }) : el('div.faint', 'ยังไม่มีการนัดสัมภาษณ์'), [
        HR.btn('+ นัดสัมภาษณ์', function () {
          HR.openEditor('interviews', { applicantId: a.id, date: HR.today(), result: 'รอตรวจ' }, function () { HR.render(); });
        }, 'btn-sm')
      ]),
      el('div.row', [el('span.lbl', { style: 'font-weight:600' }, 'เลื่อนไปขั้นตอน'), stageSel])
    ]);

    HR.modal({
      title: a.name + ' — ' + (a.code || ''), size: 'wide', body: body,
      buttons: [
        { label: 'ปิด' },
        {
          label: 'บรรจุเป็นพนักงาน', fn: function () {
            var co = HR.db.byId('companies', (job || {}).companyId) || HR.CO() || HR.db.t('companies')[0];
            if (!co) { HR.toast('ยังไม่มีบริษัทในระบบ — สร้างบริษัทก่อน', 'err'); return; }
            var nm = String(a.name || '').trim().split(/\s+/);
            var nextCode = 'EMP' + String(HR.db.t('employees').length + 1).padStart(3, '0');
            HR.db.insert('employees', {
              code: nextCode, companyId: co.id, prefix: 'นาย',
              firstName: nm[0] || a.name, lastName: nm.slice(1).join(' '),
              email: a.email, phone: a.phone, eduLevel: 'ปริญญาตรี',
              deptId: job ? job.deptId : null, employmentType: 'ประจำ',
              hireDate: HR.today(), probationEnd: HR.addDays(HR.today(), HR.S().probationDays || 119),
              status: 'ทดลองงาน', salary: a.expectedSalary, ssoMember: true, pvdRate: 0
            });
            HR.db.update('applicants', a.id, { stage: 'จ้าง' });
            HR.toast('บรรจุ ' + a.name + ' เป็นพนักงานรหัส ' + nextCode + ' ของ ' + co.name + ' แล้ว — เปิดทะเบียนพนักงานเพื่อเติมข้อมูลให้ครบ');
            HR.go('employees');
          }
        },
        {
          label: 'บันทึกขั้นตอน', cls: 'btn-primary', fn: function () {
            HR.db.update('applicants', a.id, { stage: stageSel.value });
            HR.toast('อัปเดตขั้นตอนเป็น "' + stageSel.value + '"');
            HR.render();
          }
        }
      ]
    });
  }
  function kv(k, v) {
    return el('div.field', [el('span.lbl', k), el('div', v == null || v === '' ? '-' : String(v))]);
  }

  function screenReport() {
    var cols = HR.exportCols('applicants').concat([
      { k: 'jobKeywords', l: 'คำสำคัญของตำแหน่ง', fmt: function (r) { var j = HR.db.byId('jobs', r.jobId); return j ? j.keywords : ''; } },
      { k: 'rounds', l: 'จำนวนรอบสัมภาษณ์', num: 1, dec: 0, fmt: function (r) { return HR.rows('interviews').filter(function (i) { return i.applicantId === r.id; }).length; } },
      { k: 'bestScore', l: 'คะแนนสัมภาษณ์สูงสุด', num: 1, dec: 0, fmt: function (r) { var s = HR.rows('interviews').filter(function (i) { return i.applicantId === r.id; }).map(function (i) { return Number(i.score) || 0; }); return s.length ? Math.max.apply(null, s) : 0; } }
    ]);
    HR.excel.exportRows(HR.rows('applicants'), cols, 'รายงานคัดกรองผู้สมัคร');
  }

  /* ---------- ตารางสัมภาษณ์ ---------- */
  HR.view('interviews', {
    title: 'ตารางสัมภาษณ์',
    render: HR.crud('interviews', {
      desc: 'นัดสัมภาษณ์ บันทึกคะแนนและความเห็นผู้สัมภาษณ์ — ผลที่บันทึกจะอัปเดตขั้นตอนของผู้สมัครได้ทันที',
      defaults: function () { return { date: HR.today(), result: 'รอตรวจ' }; },
      rowActions: function (r) {
        return [{
          label: 'บันทึกผล', fn: function () {
            var f = HR.form([
              { k: 'score', l: 'คะแนน (เต็ม 100)', t: 'number', req: true },
              { k: 'result', l: 'ผลการสัมภาษณ์', t: 'select', opts: ['ผ่าน', 'ไม่ผ่าน'], req: true },
              { k: 'feedback', l: 'ความเห็นผู้สัมภาษณ์', t: 'textarea', w: 2 },
              { k: 'nextStage', l: 'เลื่อนผู้สมัครไปขั้นตอน', t: 'select', opts: STAGES.concat(['ปฏิเสธข้อเสนอ']) }
            ], r);
            HR.modal({
              title: 'บันทึกผลสัมภาษณ์ — ' + HR.nameOf('applicants', r.applicantId),
              body: f.el,
              buttons: [{ label: 'ยกเลิก' }, {
                label: 'บันทึก', cls: 'btn-primary', fn: function () {
                  var v = f.get();
                  HR.db.update('interviews', r.id, { score: v.score, result: v.result, feedback: v.feedback });
                  if (v.nextStage) HR.db.update('applicants', r.applicantId, { stage: v.nextStage });
                  HR.toast('บันทึกผลสัมภาษณ์แล้ว');
                  HR.render();
                }
              }]
            });
          }
        }];
      },
      before: function () {
        var up = HR.rows('interviews').filter(function (i) { return i.date >= HR.today() && i.result === 'รอตรวจ'; })
          .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
        if (!up.length) return null;
        return el('div', { style: 'margin-bottom:16px' }, [
          HR.card('นัดที่กำลังจะถึง', up.length + ' รายการ', el('div.stack',
            up.slice(0, 6).map(function (i) {
              return el('div.check-item', [
                el('div.ci-body', [
                  el('b', HR.nameOf('applicants', i.applicantId) + ' · ' + i.round),
                  el('div', HR.dateTH(i.date) + ' เวลา ' + (i.time || '-') + ' · ' + (i.mode || '-') + ' · ผู้สัมภาษณ์ ' + HR.nameOf('employees', i.interviewerId))
                ]),
                HR.badge(i.result, 'warn')
              ]);
            })
          ))
        ]);
      }
    })
  });

})(window.HR);
