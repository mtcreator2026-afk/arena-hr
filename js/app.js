/* app.js — ประกอบระบบ: เมนูตามสิทธิ์ ตัวเลือกบริษัท ธีม และการเริ่มระบบ */
(function (HR) {
  'use strict';
  var el = HR.el;

  HR.nav = [
    {
      title: 'ของฉัน', items: [
        { id: 'clockIn', l: 'ลงเวลาเข้างาน', show: function () { return !!HR.myEmployee(); } },
        { id: 'myPortal', l: 'ยื่นคำร้อง' },
        { id: 'myTeam', l: 'ทีมของฉัน' },
        { id: 'approvals', l: 'กล่องอนุมัติคำขอ', count: pendingCount }
      ]
    },
    { title: 'ภาพรวม', items: [{ id: 'dashboard', l: 'แดชบอร์ดผู้บริหาร' }] },
    {
      no: '1', title: 'สรรหาและคัดเลือก', items: [
        { id: 'jobs', l: 'ประกาศรับสมัครงาน' },
        { id: 'applicants', l: 'ผู้สมัครงาน (ATS)' },
        { id: 'interviews', l: 'ตารางสัมภาษณ์' }
      ]
    },
    {
      no: '2', title: 'ข้อมูลพนักงาน', items: [
        { id: 'employees', l: 'ทะเบียนพนักงาน' },
        { id: 'orgchart', l: 'ผังองค์กร' },
        { id: 'departments', l: 'ฝ่าย/แผนก' },
        { id: 'positions', l: 'ตำแหน่งงาน' }
      ]
    },
    {
      no: '3', title: 'เวลาทำงานและการลา', items: [
        { id: 'attendance', l: 'บันทึกเวลาเข้า-ออกงาน' },
        { id: 'scanImport', l: 'นำเข้าข้อมูลเครื่องสแกน' },
        { id: 'clockLog', l: 'ลงเวลาด้วยรูปถ่าย' },
        { id: 'shifts', l: 'รหัสกะ' },
        { id: 'workPatterns', l: 'รูปแบบการทำงานรายบุคคล' },
        { id: 'roster', l: 'ตารางกะรายเดือน' },
        { id: 'otRequests', l: 'ทำงานล่วงเวลา (OT)' },
        { id: 'leaves', l: 'ใบลาทั้งหมด' },
        { id: 'leaveBalances', l: 'สิทธิ์วันลาคงเหลือ' },
        { id: 'leaveTypes', l: 'ประเภทวันลาและเกณฑ์' },
        { id: 'holidays', l: 'วันหยุดประจำปี' },
        { id: 'expenses', l: 'เบิกค่าใช้จ่าย' }
      ]
    },
    {
      no: '4', title: 'เงินเดือนและภาษี', items: [
        { id: 'payrollRun', l: 'คำนวณและตรวจเงินเดือน' },
        { id: 'payPeriods', l: 'รอบจ่ายเงินเดือน' },
        { id: 'payAdjustments', l: 'ปรับเพิ่ม/หักพิเศษ' },
        { id: 'payslips', l: 'สลิปเงินเดือน' },
        { id: 'taxReports', l: 'ภาษีและประกันสังคม' },
        { id: 'wht50', l: 'หนังสือรับรอง 50 ทวิ' }
      ]
    },
    {
      no: '5', title: 'ประเมินผลงาน', items: [
        { id: 'goals', l: 'เป้าหมาย KPI / OKR' },
        { id: 'reviews', l: 'ประเมิน 360 องศา' }
      ]
    },
    {
      no: '6', title: 'วิเคราะห์และพ้นสภาพ', items: [
        { id: 'analytics', l: 'วิเคราะห์ข้อมูลบุคลากร' },
        { id: 'offboardings', l: 'การสิ้นสุดการจ้างงาน' },
        { id: 'assets', l: 'ทรัพย์สินที่ถือครอง' },
        { id: 'exitSurveys', l: 'Exit Interview' }
      ]
    },
    {
      title: 'ตั้งค่า', items: [
        { id: 'companies', l: 'บริษัทในเครือ' },
        { id: 'users', l: 'ผู้ใช้ระบบและสิทธิ์' },
        { id: 'settings', l: 'ตั้งค่าระบบและแฟ้มข้อมูล' }
      ]
    }
  ];

  function pendingCount() {
    var hrView = HR.isHR(), team = {};
    HR.myTeam().forEach(function (e) { team[e.id] = true; });
    return ['leaves', 'otRequests', 'expenses'].reduce(function (a, n) {
      return a + HR.rows(n).filter(function (r) {
        return r.status === 'รออนุมัติ' && (hrView || team[r.employeeId]);
      }).length;
    }, 0);
  }

  HR.buildNav = function () {
    var host = HR.clear(document.getElementById('nav'));
    HR.nav.forEach(function (g) {
      var items = g.items.filter(function (it) { return HR.canView(it.id) && (!it.show || it.show()); });
      if (!items.length) return;
      var box = el('div.nav-group', [el('div.nav-group-title', [g.no ? el('i', g.no) : null, g.title])]);
      items.forEach(function (it) {
        var n = it.count ? it.count() : 0;
        box.appendChild(el('a', { href: '#' + it.id }, [it.l, n ? el('span.cnt', String(n)) : null]));
      });
      host.appendChild(box);
    });

    var u = HR.me(), e = HR.myEmployee(), co = HR.CO();
    document.getElementById('who').innerHTML =
      '<b>' + HR.esc(u ? u.username : '-') + '</b> <span class="badge ' +
      (u && u.role === 'HR' ? 'accent' : u && u.role === 'หัวหน้างาน' ? 'info' : '') + '">' +
      HR.esc(u ? u.role : '') + '</span><br>' +
      (e ? HR.esc(e.firstName + ' ' + e.lastName) + '<br>' : '') +
      HR.esc(co ? co.name : 'ทุกบริษัทในเครือ');
  };

  /* ---------- แถบบน: ตัวเลือกบริษัทและเครื่องมือข้อมูล ---------- */
  HR.buildTopbar = function () {
    var host = HR.clear(document.getElementById('topbarActions'));
    var u = HR.me();
    if (!u) return;
    var cos = HR.myCompanies();

    if (HR.isHR() && cos.length > 1) {
      var sel = el('select#companySelect', { style: 'max-width:230px', 'aria-label': 'เลือกบริษัท' });
      sel.appendChild(el('option', { value: '' }, 'ทุกบริษัทในเครือ'));
      cos.forEach(function (c) { sel.appendChild(el('option', { value: c.id }, c.name)); });
      sel.value = HR.ctx.companyId || '';
      sel.addEventListener('change', function () { HR.setCompany(sel.value); });
      host.appendChild(sel);
    }

    if (HR.sb && HR.sb.ready) {
      host.appendChild(el('span.badge.ok#syncChip', { title: 'ข้อมูลเก็บบนเซิร์ฟเวอร์ ใช้ร่วมกันทุกคน' }, 'ออนไลน์'));
    }

    if (HR.isHR() && HR.env.canDownload) {
      if (!HR.sb || !HR.sb.ready) host.appendChild(el('span.filechip#fileChip', { onclick: fileDialog, title: 'จัดการแฟ้มข้อมูล Excel' }, ''));
      if (!HR.sb || !HR.sb.ready) host.appendChild(HR.btn('บันทึกไฟล์', function () { HR.file.save(); }, 'btn-primary'));
      host.appendChild(HR.btn('Export รายงาน', function () { HR.excel.exportAll(); }, 'btn-ghost'));
    } else if (HR.isHR()) {
      host.appendChild(el('span.badge.info', { title: 'เวอร์ชันออนไลน์: ดูและกรอกข้อมูลได้ แต่บันทึกไฟล์ Excel ไม่ได้' }, 'โหมดดูออนไลน์'));
    }
    host.appendChild(el('button.icon-btn#themeBtn', { type: 'button', 'aria-label': 'สลับธีม', onclick: toggleTheme }, '◐'));
    host.appendChild(HR.btn(u.username, function () {
      HR.modal({
        title: 'บัญชีของฉัน', size: 'narrow',
        body: el('div.form-grid', [
          el('div.field', [el('span.lbl', 'ชื่อผู้ใช้'), el('div', u.username)]),
          el('div.field', [el('span.lbl', 'สิทธิ์'), el('div', u.role)]),
          el('div.field', [el('span.lbl', 'พนักงาน'), el('div', u.employeeId ? HR.nameOf('employees', u.employeeId) : '-')]),
          el('div.field', [el('span.lbl', 'เข้าใช้ล่าสุด'), el('div', u.lastLogin || '-')])
        ]),
        buttons: [
          { label: 'ปิด' },
          { label: 'เปลี่ยนรหัสผ่าน', fn: function () { setTimeout(HR.changeMyPassword, 60); } },
          { label: 'ออกจากระบบ', cls: 'btn-danger', fn: function () { HR.logout(); } }
        ]
      });
    }, 'btn-ghost'));
    if (HR.isHR() && HR.env.canDownload) HR.fileStatus();
  };

  /* แถบแจ้งข้อจำกัดของเวอร์ชันออนไลน์ */
  HR.banner = function () {
    if (HR.env.canDownload) return null;
    return el('div.callout.warn', { style: 'margin-bottom:14px' },
      'เวอร์ชันออนไลน์ — ดู แก้ไข และกรอกข้อมูลได้ทุกอย่าง ข้อมูลเก็บในเบราว์เซอร์ที่คุณเปิด ' +
      'แต่ Export Excel และบันทึกแฟ้มข้อมูล .xlsx ใช้ไม่ได้ (ตัวแสดงผลบล็อกการดาวน์โหลดไฟล์) — ' +
      'ใช้เวอร์ชันในเครื่องสำหรับงานที่ต้องส่งออกไฟล์');
  };

  /* ---------- ตัวบอกสถานะการซิงก์กับเซิร์ฟเวอร์ ---------- */
  HR.syncStatus = function (state, msg) {
    var n = document.getElementById('syncChip');
    if (!n) return;
    var map = {
      saving: ['กำลังบันทึก…', 'warn'], saved: ['บันทึกแล้ว', 'ok'],
      error: ['บันทึกไม่สำเร็จ', 'danger'], loading: ['กำลังโหลด…', 'warn']
    };
    var m = map[state] || ['ออนไลน์', 'ok'];
    n.className = 'badge ' + m[1];
    n.textContent = m[0];
    n.title = msg || '';
    if (state === 'saved') setTimeout(function () {
      if (n.textContent === 'บันทึกแล้ว') { n.textContent = 'ออนไลน์'; n.className = 'badge ok'; }
    }, 2200);
  };

  /* ---------- ตัวบอกสถานะแฟ้มข้อมูล ---------- */
  HR.fileStatus = function (state) {
    var n = document.getElementById('fileChip');
    if (!n) return;
    var F = HR.file;
    n.textContent = state === 'saving' ? (F.name || '') + ' · กำลังบันทึก…' : F.statusText();
    n.className = 'filechip' +
      (!F.name ? ' none' : F.needsPermission ? ' warn' : state === 'error' ? ' err' : F.dirty || state === 'saving' ? ' dirty' : ' ok');
  };

  function fileDialog() {
    var F = HR.file;
    var auto = el('input', { type: 'checkbox' });
    auto.checked = HR.S().autoSaveFile !== false;
    auto.addEventListener('change', function () {
      HR.S().autoSaveFile = auto.checked;
      HR.db.save();
      HR.toast(auto.checked ? 'เปิดบันทึกอัตโนมัติแล้ว' : 'ปิดบันทึกอัตโนมัติแล้ว — ต้องกด "บันทึกไฟล์" เอง');
    });

    HR.modal({
      title: 'แฟ้มข้อมูล Excel', size: 'narrow',
      body: el('div.stack', [
        el('div.callout' + (F.name ? '.ok' : ''), F.name
          ? 'กำลังทำงานกับไฟล์ ' + F.name + (F.dirty ? ' — ยังมีการแก้ไขที่ยังไม่ได้บันทึก' : ' — บันทึกครบแล้ว')
          : 'ยังไม่ได้ผูกกับไฟล์ ข้อมูลอยู่ในเบราว์เซอร์อย่างเดียว กด "บันทึกเป็นไฟล์ใหม่" เพื่อเริ่มเก็บลงไฟล์ Excel'),
        F.needsPermission ? el('div.callout.warn', 'เบราว์เซอร์ขอให้ยืนยันสิทธิ์เข้าถึงไฟล์อีกครั้ง (ทุกครั้งที่เปิดระบบใหม่) กด "เชื่อมไฟล์ล่าสุด"') : null,
        el('div.row', [
          F.needsPermission ? HR.btn('เชื่อมไฟล์ล่าสุด', function () { HR.file.reconnect(); }, 'btn-primary') : null,
          HR.btn('เปิดแฟ้มข้อมูล…', function () { HR.file.open(); }),
          HR.btn('บันทึกเป็นไฟล์ใหม่…', function () { HR.file.saveAs(); }),
          F.handle ? HR.btn('โหลดจากไฟล์ใหม่อีกครั้ง', function () { HR.file.reload(); }) : null,
          F.name ? HR.btn('เลิกเชื่อมไฟล์', function () { HR.file.detach(); }, 'btn-danger') : null
        ]),
        el('label.chk', [auto, 'บันทึกลงไฟล์อัตโนมัติทุกครั้งที่แก้ข้อมูล']),
        el('div.faint', HR.file.supported
          ? 'เบราว์เซอร์นี้เขียนทับไฟล์เดิมได้โดยตรง ไม่สร้างไฟล์ซ้ำ'
          : 'เบราว์เซอร์นี้เขียนทับไฟล์เดิมไม่ได้ การบันทึกจะเป็นการดาวน์โหลดไฟล์ใหม่ทุกครั้ง (แนะนำให้ใช้ Chrome หรือ Edge)'),
        el('div.faint', 'ระบบเก็บสำเนากันลืมไว้ในเบราว์เซอร์เสมอ ถึงยังไม่กดบันทึกก็ไม่หาย')
      ])
    });
  }

  /* ---------- ธีม ---------- */
  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    var isDark = cur === 'dark' || (!cur && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('hrms.theme', next); } catch (e) {}
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem('hrms.theme'); } catch (e) {}
    if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  }

  /* ---------- เมนูบนจอแคบ ---------- */
  function initMenu() {
    var sb = document.getElementById('sidebar'), scrim = document.getElementById('scrim');
    function close() { sb.classList.remove('open'); scrim.hidden = true; }
    document.getElementById('menuBtn').addEventListener('click', function () {
      sb.classList.add('open'); scrim.hidden = false;
    });
    scrim.addEventListener('click', close);
    sb.addEventListener('click', function (e) { if (e.target.tagName === 'A') close(); });
  }

  /* ---------- เริ่มต้น ---------- */
  function boot() {
    HR.db.load();
    if (!HR.db.data || !HR.db.data.settings || !HR.db.data.companies || !HR.db.data.companies.length) {
      /* เวอร์ชันออนไลน์มีข้อมูลตั้งต้นมาให้ ส่วนเวอร์ชันในเครื่องใช้ข้อมูลตัวอย่าง */
      HR.db.data = window.HR_INITIAL_DATA ? JSON.parse(JSON.stringify(window.HR_INITIAL_DATA)) : HR.seed();
      HR.db.save();
    }
    Object.keys(HR.schema).forEach(function (k) { HR.db.t(k); });
    var def = HR.defaultSettings();
    Object.keys(def).forEach(function (k) { if (HR.db.data.settings[k] == null) HR.db.data.settings[k] = def[k]; });

    initTheme();
    initMenu();

    window.addEventListener('hashchange', function () {
      if (!HR.me()) { HR.showLogin(); return; }
      HR.buildNav(); HR.render();
    });

    /* Ctrl+S = บันทึกลงไฟล์ */
    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        HR.file.save();
      }
    });

    /* เตือนถ้าปิดแท็บขณะยังไม่ได้บันทึกลงไฟล์ */
    window.addEventListener('beforeunload', function (e) {
      if (HR.file.dirty) { e.preventDefault(); e.returnValue = ''; }
    });

    /* โหมดออนไลน์ (Supabase) หรือโหมดในเครื่อง */
    if (HR.sb && HR.sb.enabled) {
      HR.showLogin('กำลังเชื่อมต่อเซิร์ฟเวอร์…');
      HR.sb.init().then(function (ok) {
        if (!ok) { HR.showLogin('ต่อเซิร์ฟเวอร์ไม่ได้: ' + (HR.sb.lastError || '')); return; }
        return HR.sb.session().then(function (r) {
          var s = r && r.data && r.data.session;
          if (!s) { HR.showLogin(); return; }
          HR.sb.uid = s.user.id;
          return HR.enterCloud().catch(function (e) {
            HR.sb.signOut();
            HR.showLogin(e.message || 'เข้าสู่ระบบใหม่อีกครั้ง');
          });
        });
      });
      return;
    }

    if (HR.restoreSession()) HR.openApp();
    else HR.showLogin();
    HR.file.restore().then(function () { if (HR.isHR()) HR.fileStatus(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.HR);
