/* views-admin.js — บริษัทในเครือ และตัวช่วยพิมพ์เอกสาร */
(function (HR) {
  'use strict';
  var el = HR.el;

  /* ================= พิมพ์เอกสารจากกล่องโมดัล ================= */
  HR.printNode = function (node, title) {
    var prev = document.title;
    document.body.classList.add('printing');
    if (title) document.title = title;
    setTimeout(function () {
      window.print();
      setTimeout(function () { document.body.classList.remove('printing'); document.title = prev; }, 400);
    }, 80);
  };

  /* ================= บริษัทในเครือ ================= */
  HR.view('companies', {
    title: 'บริษัทในเครือ',
    render: HR.crud('companies', {
      desc: 'เพิ่มบริษัทย่อยเพื่อทำ Payroll แยกนิติบุคคล — แต่ละบริษัทมีเลขผู้เสียภาษี บัญชีประกันสังคม รอบจ่าย และออกหนังสือ 50 ทวิ ในนามของตนเอง',
      rows: function () { return HR.db.t('companies'); },
      defaults: function () { return { branchType: 'สำนักงานใหญ่', payDay: 25, active: true, signerPosition: 'กรรมการผู้จัดการ' }; },
      rowActions: function (r) {
        return [{ label: 'ทำงานในบริษัทนี้', fn: function () { HR.setCompany(r.id); HR.go('dashboard'); } }];
      },
      before: function () {
        var cos = HR.db.t('companies');
        var emps = HR.db.t('employees');
        var rows = cos.map(function (c) {
          var mine = emps.filter(function (e) { return e.companyId === c.id && (e.status === 'ทำงาน' || e.status === 'ทดลองงาน'); });
          var slips = HR.db.t('payslips').filter(function (s) {
            var e = HR.db.byId('employees', s.employeeId);
            return e && e.companyId === c.id;
          });
          return {
            name: c.name, taxId: c.taxId, head: mine.length,
            base: HR.round2(HR.sum(mine, function (e) { return (e.salary || 0) + (e.positionAllowance || 0); })),
            slips: slips.length, tax: HR.round2(HR.sum(slips, function (s) { return s.tax; }))
          };
        });
        return el('div', { style: 'margin-bottom:16px' }, [
          el('div.grid.cols-4', [
            HR.kpi('บริษัทในเครือ', cos.length, 'บริษัท', null, 'lift'),
            HR.kpi('พนักงานรวมทั้งเครือ', HR.sum(rows, function (r) { return r.head; }), 'คน'),
            HR.kpi('ฐานเงินเดือนรวมทั้งเครือ', HR.money(HR.sum(rows, function (r) { return r.base; })), 'บาท/เดือน'),
            HR.kpi('ภาษีนำส่งสะสมทั้งเครือ', HR.money(HR.sum(rows, function (r) { return r.tax; })), 'บาท')
          ]),
          el('div', { style: 'margin-top:14px' }, [
            HR.card('สรุปรายบริษัท', null, HR.table({
              cols: [{ k: 'name', l: 'บริษัท' }, { k: 'taxId', l: 'เลขผู้เสียภาษี' },
                { k: 'head', l: 'พนักงาน', num: 1, dec: 0 }, { k: 'base', l: 'ฐานเงินเดือน/เดือน', num: 1 },
                { k: 'slips', l: 'สลิปที่ออกแล้ว', num: 1, dec: 0 }, { k: 'tax', l: 'ภาษีนำส่งสะสม', num: 1 }],
              rows: rows, search: false, exportName: 'สรุปรายบริษัท', footerSum: ['head', 'base', 'slips', 'tax']
            }))
          ])
        ]);
      }
    })
  });

  HR.setCompany = function (id) {
    HR.ctx.companyId = id || '';
    HR.buildNav(); HR.buildTopbar(); HR.render();
  };

  /* ================= เข้าสู่ระบบ ================= */
  var SESSION = 'hrms.session';

  HR.homeOf = function (role) { return role === 'HR' ? 'dashboard' : 'myPortal'; };

  function applyLogin(u) {
    HR.ctx.userId = u.id;
    var cos = HR.myCompanies();
    HR.ctx.companyId = HR.isHR() && !u.companyId ? '' : (cos[0] ? cos[0].id : '');
    if (!HR.isHR()) {
      var e = HR.myEmployee();
      if (e && e.companyId) HR.ctx.companyId = e.companyId;
    }
  }

  HR.login = function (username, password) {
    var u = HR.db.t('users').filter(function (x) {
      return String(x.username).toLowerCase() === String(username).trim().toLowerCase() && x.active !== false;
    })[0];
    if (!u || String(u.password) !== String(password)) return null;
    applyLogin(u);
    var n = new Date();
    HR.db.update('users', u.id, {
      lastLogin: HR.isoOf(n) + ' ' + String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0')
    });
    try { sessionStorage.setItem(SESSION, u.id); } catch (e) {}
    return u;
  };

  HR.restoreSession = function () {
    var id = null;
    try { id = sessionStorage.getItem(SESSION); } catch (e) {}
    if (!id) return false;
    var u = HR.db.byId('users', id);
    if (!u || u.active === false) return false;
    applyLogin(u);
    return true;
  };

  HR.logout = function () {
    HR.ctx.userId = null;
    try { sessionStorage.removeItem(SESSION); } catch (e) {}
    location.hash = '';
    if (HR.sb && HR.sb.ready) {
      if (HR.sb.pending()) HR.sb.flushNow();
      HR.sb.uid = null;
      HR.sb.signOut().then(function () { HR.showLogin(); });
      return;
    }
    HR.showLogin();
  };

  HR.openApp = function () {
    document.getElementById('login').hidden = true;
    document.getElementById('appShell').hidden = false;
    HR.buildNav();
    HR.buildTopbar();
    if (!location.hash || location.hash === '#') location.hash = '#' + HR.homeOf(HR.myRole());
    HR.render();
  };

  /* เข้าสู่ระบบผ่าน Supabase: โหลดโปรไฟล์ สิทธิ์ และข้อมูลทั้งหมด */
  HR.enterCloud = function () {
    return HR.sb.loadProfile().then(function (p) {
      return HR.sb.loadAll().then(function (data) {
        HR.db.data = data;
        HR.db._settingsHash = JSON.stringify(data.settings);
        try { localStorage.setItem(HR.db.KEY, JSON.stringify(data)); } catch (e) {}

        /* สร้างผู้ใช้เสมือนให้โค้ดเดิมที่เรียก HR.me() ใช้ต่อได้ */
        HR.db.data.users = [{
          id: p.id, username: p.username, role: p.role,
          employeeId: p.employee_id, companyId: p.company_id, active: p.active,
          lastLogin: p.last_login
        }];
        HR.ctx.userId = p.id;
        var cos = HR.myCompanies();
        HR.ctx.companyId = HR.isHR() && !p.company_id ? '' : (cos[0] ? cos[0].id : '');
        if (!HR.isHR()) {
          var e = HR.myEmployee();
          if (e && e.companyId) HR.ctx.companyId = e.companyId;
        }
        HR.sb.client.from('app_users').update({ last_login: new Date().toISOString() }).eq('id', p.id);
        HR.openApp();
        return true;
      });
    });
  };

  HR.showLogin = function (message) {
    var host = document.getElementById('login');
    HR.clear(host);
    host.hidden = false;
    document.getElementById('appShell').hidden = true;

    var cloud = HR.sb && HR.sb.enabled;
    var user = el('input', {
      type: 'text', id: 'loginUser',
      placeholder: cloud ? 'รหัสพนักงาน เช่น 0004' : 'ชื่อผู้ใช้', autocomplete: 'username'
    });
    var pass = el('input', { type: 'password', id: 'loginPass', placeholder: 'รหัสผ่าน', autocomplete: 'current-password' });
    var msg = el('div.login-msg', { hidden: !message }, message || '');
    var btn = el('button.btn.btn-primary.login-submit', { type: 'button' }, 'เข้าสู่ระบบ');

    function say(t) { msg.hidden = false; msg.textContent = t; }
    function busy(b) { btn.disabled = b; btn.textContent = b ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'; }

    function submit() {
      if (cloud) {
        if (!user.value.trim() || !pass.value) { say('กรอกรหัสพนักงานและรหัสผ่านให้ครบ'); return; }
        busy(true);
        HR.sb.signIn(user.value, pass.value).then(function (r) {
          if (r.error) { busy(false); say(HR.sb.errorText(r.error)); pass.value = ''; return; }
          HR.sb.uid = r.data.user.id;
          return HR.enterCloud().then(function () {
            HR.toast('ยินดีต้อนรับ · สิทธิ์ ' + HR.myRole());
          }).catch(function (e) {
            busy(false); say(e.message || 'เข้าสู่ระบบไม่สำเร็จ'); HR.sb.signOut();
          });
        }).catch(function (e) { busy(false); say(HR.sb.errorText(e)); });
        return;
      }
      var u = HR.login(user.value, pass.value);
      if (!u) {
        say('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกปิดใช้งาน');
        pass.value = '';
        return;
      }
      HR.openApp();
      HR.toast('ยินดีต้อนรับ ' + u.username + ' · สิทธิ์ ' + u.role);
    }
    btn.addEventListener('click', submit);
    [user, pass].forEach(function (i) {
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    });

    var noUsers = !cloud && !HR.db.t('users').length;

    host.appendChild(el('div.login-box', [
      el('div.login-brand', [
        el('span.brand-mark', 'HR'),
        el('div', [el('b', 'ระบบ HR ครบวงจร'), el('small', 'EMPLOYEE LIFECYCLE SUITE')])
      ]),
      el('h2', 'เข้าสู่ระบบ'),
      el('p.faint', 'HR เห็นทุกหน้าจอ · หัวหน้างานเห็นเฉพาะลูกทีม · พนักงานเห็นเฉพาะข้อมูลตนเอง'),
      el('div.row', [el('span.badge' + (cloud ? '.ok' : '.warn'), cloud ? 'ออนไลน์ · ข้อมูลใช้ร่วมกัน' : 'ในเครื่อง')]),
      msg,
      el('div.field', [el('span.lbl', cloud ? 'รหัสพนักงาน' : 'ชื่อผู้ใช้'), user]),
      el('div.field', [el('span.lbl', 'รหัสผ่าน'), pass]),
      btn,
      noUsers ? el('div.callout.warn', { style: 'margin-top:4px' }, [
        'ยังไม่มีบัญชีผู้ใช้ในระบบ ',
        HR.btn('สร้างบัญชี HR เริ่มต้น', function () {
          var emp = HR.db.t('employees')[0];
          var u = HR.db.insert('users', {
            username: 'hr', password: 'hr1234', role: 'HR',
            employeeId: emp ? emp.id : null, active: true, note: 'บัญชีเริ่มต้น — เปลี่ยนรหัสผ่านทันที'
          });
          HR.login('hr', 'hr1234');
          HR.openApp();
          HR.toast('สร้างบัญชี hr / hr1234 แล้ว — กรุณาเปลี่ยนรหัสผ่านทันที');
        }, 'btn-sm')
      ]) : null
    ]));
    setTimeout(function () { user.focus(); }, 50);
  };

  /* ================= ผู้ใช้ระบบและสิทธิ์ ================= */
  HR.view('users', {
    title: 'ผู้ใช้ระบบและสิทธิ์',
    render: HR.crud('users', {
      desc: 'กำหนดว่าใครเข้าระบบได้และเห็นอะไร — HR เห็นทุกหน้าจอ · หัวหน้างานเห็นและอนุมัติเฉพาะลูกทีมสายตรง · พนักงานเห็นเฉพาะข้อมูลตนเอง',
      rows: function () { return HR.db.t('users'); },
      defaults: function () { return { role: 'พนักงาน', active: true }; },
      rowActions: function (r) {
        return [{
          label: 'ตั้งรหัสผ่านใหม่', fn: function () {
            var inp = el('input', { type: 'text', value: randomPass() });
            HR.modal({
              title: 'ตั้งรหัสผ่านใหม่ — ' + r.username, size: 'narrow',
              body: el('div.stack', [
                el('div.field', [el('span.lbl', 'รหัสผ่านใหม่'), inp]),
                el('div.faint', 'แจ้งรหัสนี้ให้ผู้ใช้ด้วยช่องทางที่ปลอดภัย และให้เปลี่ยนเองหลังเข้าใช้ครั้งแรก')
              ]),
              buttons: [{ label: 'ยกเลิก' }, {
                label: 'บันทึก', cls: 'btn-primary', fn: function () {
                  HR.db.update('users', r.id, { password: inp.value });
                  HR.toast('ตั้งรหัสผ่านใหม่ให้ ' + r.username + ' แล้ว'); HR.render();
                }
              }]
            });
          }
        }];
      },
      actions: function () { return [HR.btn('สร้างบัญชีให้พนักงานที่ยังไม่มี', bulkCreate)]; },
      before: function () {
        var us = HR.db.t('users');
        var emps = HR.rows('employees').filter(function (e) { return e.status !== 'ลาออก' && e.status !== 'เลิกจ้าง'; });
        var without = emps.filter(function (e) { return !us.some(function (u) { return u.employeeId === e.id; }); });
        return el('div', { style: 'margin-bottom:16px' }, [
          el('div.grid.cols-4', [
            HR.kpi('บัญชีทั้งหมด', us.length, 'บัญชี', null, 'lift'),
            HR.kpi('HR', us.filter(function (u) { return u.role === 'HR'; }).length, 'บัญชี'),
            HR.kpi('หัวหน้างาน', us.filter(function (u) { return u.role === 'หัวหน้างาน'; }).length, 'บัญชี'),
            HR.kpi('ยังไม่มีบัญชี', without.length, 'คน', without.length ? 'กดปุ่มสร้างบัญชีอัตโนมัติได้' : 'ครบทุกคน', without.length ? 'warnbar' : '')
          ]),
          el('div.callout', { style: 'margin-top:12px' },
            'หัวหน้างานถูกกำหนดจากฟิลด์ "หัวหน้างาน" ในทะเบียนพนักงาน — ใครที่มีลูกทีมควรได้สิทธิ์ "หัวหน้างาน" เพื่ออนุมัติใบลาและ OT ของลูกทีมได้')
        ]);
      }
    })
  });

  function randomPass() {
    var s = 'abcdefghjkmnpqrstuvwxyz23456789', o = '';
    for (var i = 0; i < 8; i++) o += s[Math.floor(Math.random() * s.length)];
    return o;
  }

  function bulkCreate() {
    var us = HR.db.t('users');
    var emps = HR.rows('employees').filter(function (e) {
      return e.status !== 'ลาออก' && e.status !== 'เลิกจ้าง' && !us.some(function (u) { return u.employeeId === e.id; });
    });
    if (!emps.length) { HR.toast('พนักงานทุกคนมีบัญชีแล้ว'); return; }
    var hasTeam = {};
    HR.db.t('employees').forEach(function (e) { if (e.managerId) hasTeam[e.managerId] = true; });
    var created = emps.map(function (e) {
      return {
        employee: HR.label('employees', e),
        username: String(e.code).toLowerCase(),
        password: randomPass(),
        role: hasTeam[e.id] ? 'หัวหน้างาน' : 'พนักงาน',
        emp: e
      };
    });
    HR.modal({
      title: 'สร้างบัญชี ' + created.length + ' บัญชี', size: 'wide',
      body: el('div.stack', [
        el('div.callout.warn', 'ส่งออกรายการนี้เป็น Excel เก็บไว้ก่อนปิดหน้าต่าง เพราะรหัสผ่านจะไม่แสดงอีก — และให้ทุกคนเปลี่ยนรหัสหลังเข้าใช้ครั้งแรก'),
        el('div.faint', 'ระบบตั้งสิทธิ์ "หัวหน้างาน" ให้คนที่มีลูกทีมโดยอัตโนมัติ แก้ได้ภายหลัง'),
        HR.table({
          cols: [{ k: 'employee', l: 'พนักงาน' }, { k: 'username', l: 'ชื่อผู้ใช้' },
            { k: 'password', l: 'รหัสผ่านเริ่มต้น' }, { k: 'role', l: 'สิทธิ์' }],
          rows: created, search: false, exportName: 'บัญชีผู้ใช้ใหม่', pageSize: 10
        })
      ]),
      buttons: [{ label: 'ยกเลิก' }, {
        label: 'สร้างทั้งหมด', cls: 'btn-primary', fn: function () {
          created.forEach(function (c) {
            HR.db.insert('users', {
              username: c.username, password: c.password, role: c.role,
              employeeId: c.emp.id, companyId: c.emp.companyId, active: true
            });
          });
          HR.toast('สร้าง ' + created.length + ' บัญชีแล้ว'); HR.render();
        }
      }]
    });
  }

  /* ================= หน้าของฉัน (ทุกบทบาท) ================= */
  HR.view('myPortal', {
    title: 'ข้อมูลของฉัน', perm: 'self',
    render: function () {
      var e = HR.myEmployee();
      if (!e) {
        return el('div', [
          HR.pageHead('ข้อมูลของฉัน'),
          el('div.callout.warn', 'บัญชีนี้ยังไม่ได้ผูกกับทะเบียนพนักงาน — แจ้ง HR ให้ตั้งค่าในหน้า "ผู้ใช้ระบบและสิทธิ์"')
        ]);
      }
      var co = HR.db.byId('companies', e.companyId) || {};
      var slips = HR.db.t('payslips').filter(function (s) { return s.employeeId === e.id; })
        .sort(function (a, b) { return a.period < b.period ? 1 : -1; });
      var certs = HR.db.t('wht50').filter(function (c) { return c.employeeId === e.id && c.status !== 'ยกเลิก'; })
        .sort(function (a, b) { return b.taxYear - a.taxYear; });
      var myLeaves = HR.db.t('leaves').filter(function (l) { return l.employeeId === e.id; });
      var myOt = HR.db.t('otRequests').filter(function (l) { return l.employeeId === e.id; });
      var myEx = HR.db.t('expenses').filter(function (l) { return l.employeeId === e.id; });
      var att = HR.engine.attendanceSummary(e.id, HR.thisMonth());
      var vac = HR.engine.leaveBalance(e.id, 'ลาพักร้อน');
      var latest = slips[0];

      var host = el('div');
      var idx = Number(HR.ctx.portalTab || 0);
      var tabs = ['สลิปเงินเดือน', 'หนังสือรับรอง 50 ทวิ', 'วันลาและสิทธิ์', 'เวลาทำงานของฉัน', 'คำขออื่น ๆ'];

      function draw() {
        HR.clear(host);
        host.appendChild(HR.tabs(tabs, idx, function (i) { idx = i; HR.ctx.portalTab = i; draw(); }));
        if (idx === 0) {
          host.appendChild(HR.table({
            cols: [
              { k: 'period', l: 'งวด', fmt: function (s) { return HR.monthName(s.period); } },
              { k: 'gross', l: 'รายได้รวม', num: 1 }, { k: 'sso', l: 'ประกันสังคม', num: 1 },
              { k: 'pvdEmployee', l: 'PVD', num: 1 }, { k: 'tax', l: 'ภาษีหัก ณ ที่จ่าย', num: 1 },
              { k: 'totalDeduction', l: 'หักรวม', num: 1 }, { k: 'net', l: 'เงินสุทธิ', num: 1 }
            ],
            rows: slips, exportName: 'สลิปเงินเดือนของฉัน', footerSum: ['gross', 'tax', 'net'],
            empty: { title: 'ยังไม่มีสลิปเงินเดือน', hint: 'สลิปจะปรากฏที่นี่หลัง HR คำนวณและปิดงวด' },
            actions: function (s) {
              return [{ label: 'เปิดสลิป', fn: function () { HR.showPayslip(s, HR.db.byId('payPeriods', s.periodId) || { payDate: s.period + '-25' }); } }];
            }
          }));
        } else if (idx === 1) {
          host.appendChild(el('div.callout', { style: 'margin-bottom:12px' },
            'หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ใช้ยื่นภาษีประจำปี — กด "เปิดหนังสือ" แล้วพิมพ์หรือบันทึกเป็น PDF'));
          host.appendChild(HR.table({
            cols: [
              { k: 'taxYear', l: 'ปีภาษี', fmt: function (c) { return c.taxYear + 543; } },
              { k: 'company', l: 'บริษัทผู้จ่าย', fmt: function (c) { return HR.nameOf('companies', c.companyId); } },
              { k: 'seq', l: 'เล่ม/เลขที่', fmt: function (c) { return (c.bookNo || '-') + ' / ' + (c.seq || '-'); } },
              { k: 'totalIncome', l: 'เงินได้ทั้งปี', num: 1 }, { k: 'totalTax', l: 'ภาษีที่หัก', num: 1 }
            ],
            rows: certs, exportName: '50ทวิของฉัน', search: false,
            empty: { title: 'ยังไม่มีหนังสือรับรอง 50 ทวิ', hint: 'HR จะออกให้ปีละครั้งหลังปิดงวดเดือนธันวาคม' },
            actions: function (c) { return [{ label: 'เปิดหนังสือ', fn: function () { HR.show50Twi(c); } }]; }
          }));
        } else if (idx === 2) {
          var bal = HR.db.t('leaveTypes').map(function (t) {
            var b = HR.engine.leaveBalance(e.id, t.name);
            return { type: t.name, entitled: b.entitled, used: b.used, remaining: b.remaining };
          });
          host.appendChild(HR.card('สิทธิ์วันลาคงเหลือ', 'ปี ' + (new Date().getFullYear() + 543), HR.table({
            cols: [{ k: 'type', l: 'ประเภทการลา' }, { k: 'entitled', l: 'สิทธิ์', num: 1, dec: 1 },
              { k: 'used', l: 'ใช้ไป', num: 1, dec: 1 }, { k: 'remaining', l: 'คงเหลือ', num: 1, dec: 1 },
              { k: 'bar', l: 'สัดส่วนที่ใช้', nosort: true, fmt: function (r) { return HR.progress(r.entitled ? r.used / r.entitled : 0); } }],
            rows: bal, search: false, exportName: 'สิทธิ์วันลาของฉัน'
          })));
          host.appendChild(el('div', { style: 'height:14px' }));
          host.appendChild(HR.table({
            cols: HR.listCols('leaves').filter(function (c) { return c.k !== 'employeeId'; }),
            rows: myLeaves, exportName: 'ใบลาของฉัน',
            empty: { title: 'ยังไม่มีใบลา', hint: 'กดปุ่ม "ขอลางาน" ด้านบนเพื่อส่งคำขอ' },
            actions: function (r) {
              return r.status === 'รออนุมัติ' ? [{
                label: 'ยกเลิกคำขอ', cls: 'btn-danger', fn: function () {
                  HR.db.update('leaves', r.id, { status: 'ยกเลิก' }); HR.toast('ยกเลิกคำขอแล้ว'); HR.render();
                }
              }] : [];
            }
          }));
        } else if (idx === 3) {
          var recs = HR.db.t('attendance').filter(function (a) { return a.employeeId === e.id; })
            .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
          host.appendChild(el('div.grid.cols-4', { style: 'margin-bottom:14px' }, [
            HR.kpi('วันทำงานเดือนนี้', att.workedDays, 'วัน', null, 'lift'),
            HR.kpi('มาสาย', att.lateCount, 'ครั้ง', 'รวม ' + att.lateMinutes + ' นาที', att.lateCount ? 'warnbar' : ''),
            HR.kpi('ขาดงาน', att.absentDays, 'วัน', null, att.absentDays ? 'dangerbar' : ''),
            HR.kpi('OT เดือนนี้', HR.num(att.otTotalHours, 1), 'ชม.')
          ]));
          host.appendChild(HR.table({
            cols: HR.listCols('attendance').filter(function (c) { return c.k !== 'employeeId'; })
              .concat([{ k: 'note', l: 'หมายเหตุ' }]),
            rows: recs, exportName: 'เวลาทำงานของฉัน', pageSize: 20,
            empty: { title: 'ยังไม่มีบันทึกเวลา', hint: 'ข้อมูลจะมาจากเครื่องสแกนที่ HR นำเข้า' }
          }));
        } else {
          [{ t: 'ขอ OT', name: 'otRequests', rows: myOt }, { t: 'เบิกค่าใช้จ่าย', name: 'expenses', rows: myEx }]
            .forEach(function (s) {
              host.appendChild(HR.card(s.t + ' (' + s.rows.length + ')', null, HR.table({
                cols: HR.listCols(s.name).filter(function (c) { return c.k !== 'employeeId'; }),
                rows: s.rows, exportName: s.t + 'ของฉัน',
                actions: function (r) {
                  return r.status === 'รออนุมัติ' ? [{
                    label: 'ยกเลิกคำขอ', cls: 'btn-danger', fn: function () {
                      HR.db.update(s.name, r.id, { status: 'ยกเลิก' }); HR.toast('ยกเลิกคำขอแล้ว'); HR.render();
                    }
                  }] : [];
                }
              })));
              host.appendChild(el('div', { style: 'height:14px' }));
            });
        }
      }
      draw();

      return el('div', [
        HR.pageHead('ข้อมูลของฉัน',
          (e.prefix || '') + e.firstName + ' ' + e.lastName + ' · ' + HR.nameOf('positions', e.positionId) + ' · ' + (co.name || ''), [
          HR.btn('+ ขอลางาน', function () { HR.newRequest('leaves', e.id); }, 'btn-primary'),
          HR.btn('+ ขอทำ OT', function () { HR.newRequest('otRequests', e.id); }),
          HR.btn('+ เบิกค่าใช้จ่าย', function () { HR.newRequest('expenses', e.id); })
        ]),
        el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('เงินสุทธิงวดล่าสุด', latest ? HR.money(latest.net) : '-', 'บาท', latest ? HR.monthName(latest.period) : 'ยังไม่มีสลิป', 'lift'),
          HR.kpi('วันลาพักร้อนคงเหลือ', HR.num(vac.remaining, 1), 'วัน', 'จากสิทธิ์ ' + HR.num(vac.entitled, 1) + ' วัน'),
          HR.kpi('OT เดือนนี้', HR.num(att.otTotalHours, 1), 'ชม.', att.lateCount ? 'มาสาย ' + att.lateCount + ' ครั้ง' : 'ไม่มีมาสาย'),
          HR.kpi('คำขอที่รออนุมัติ', myLeaves.concat(myOt, myEx).filter(function (r) { return r.status === 'รออนุมัติ'; }).length, 'รายการ')
        ]),
        host
      ]);
    }
  });

  /* ================= ทีมของฉัน (หัวหน้างาน) ================= */
  HR.view('myTeam', {
    title: 'ทีมของฉัน', perm: 'lead',
    render: function () {
      var me = HR.myEmployee();
      var team = HR.myTeam();
      if (!me) return el('div', [HR.pageHead('ทีมของฉัน'), el('div.callout.warn', 'บัญชีนี้ยังไม่ได้ผูกกับทะเบียนพนักงาน')]);
      if (!team.length) {
        return el('div', [
          HR.pageHead('ทีมของฉัน'),
          el('div.callout', 'ยังไม่มีพนักงานที่ระบุว่าคุณเป็นหัวหน้างาน — HR กำหนดได้ที่ฟิลด์ "หัวหน้างาน" ในทะเบียนพนักงาน')
        ]);
      }
      var ym = HR.thisMonth();
      var rows = team.map(function (e) {
        var s = HR.engine.attendanceSummary(e.id, ym);
        var pend = ['leaves', 'otRequests', 'expenses'].reduce(function (a, n) {
          return a + HR.db.t(n).filter(function (r) { return r.employeeId === e.id && r.status === 'รออนุมัติ'; }).length;
        }, 0);
        return {
          code: e.code, name: e.firstName + ' ' + e.lastName,
          position: HR.nameOf('positions', e.positionId),
          worked: s.workedDays, late: s.lateCount, lateMin: s.lateMinutes,
          absent: s.absentDays, ot: s.otTotalHours,
          leaveLeft: HR.engine.leaveBalance(e.id, 'ลาพักร้อน').remaining,
          pending: pend, _id: e.id
        };
      });
      return el('div', [
        HR.pageHead('ทีมของฉัน', 'สรุปเวลาทำงานเดือน ' + HR.monthName(ym) + ' ของลูกทีมสายตรง ' + team.length + ' คน', [
          HR.btn('ไปที่กล่องอนุมัติ', function () { HR.go('approvals'); }, 'btn-primary'),
          HR.btn('Export สรุปทีม (Excel)', function () {
            HR.excel.exportRows(rows, [
              { k: 'code', l: 'รหัส' }, { k: 'name', l: 'ชื่อ-นามสกุล' }, { k: 'position', l: 'ตำแหน่ง' },
              { k: 'worked', l: 'วันทำงาน', num: 1, dec: 0 }, { k: 'late', l: 'มาสาย (ครั้ง)', num: 1, dec: 0 },
              { k: 'lateMin', l: 'มาสาย (นาที)', num: 1, dec: 0 }, { k: 'absent', l: 'ขาดงาน (วัน)', num: 1, dec: 0 },
              { k: 'ot', l: 'OT (ชม.)', num: 1, dec: 1 }, { k: 'leaveLeft', l: 'ลาพักร้อนคงเหลือ', num: 1, dec: 1 },
              { k: 'pending', l: 'คำขอรออนุมัติ', num: 1, dec: 0 }
            ], 'สรุปทีม_' + ym);
          })
        ]),
        el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
          HR.kpi('ลูกทีม', team.length, 'คน', null, 'lift'),
          HR.kpi('มาสายรวมเดือนนี้', HR.sum(rows, function (r) { return r.late; }), 'ครั้ง'),
          HR.kpi('ขาดงานรวม', HR.sum(rows, function (r) { return r.absent; }), 'วัน'),
          HR.kpi('คำขอรออนุมัติ', HR.sum(rows, function (r) { return r.pending; }), 'รายการ',
            null, HR.sum(rows, function (r) { return r.pending; }) ? 'warnbar' : '')
        ]),
        HR.table({
          cols: [
            { k: 'code', l: 'รหัส', w: 80 }, { k: 'name', l: 'ชื่อ-นามสกุล' }, { k: 'position', l: 'ตำแหน่ง' },
            { k: 'worked', l: 'วันทำงาน', num: 1, dec: 0 }, { k: 'late', l: 'มาสาย (ครั้ง)', num: 1, dec: 0 },
            { k: 'lateMin', l: 'มาสาย (นาที)', num: 1, dec: 0 }, { k: 'absent', l: 'ขาดงาน', num: 1, dec: 0 },
            { k: 'ot', l: 'OT (ชม.)', num: 1, dec: 1 }, { k: 'leaveLeft', l: 'ลาพักร้อนคงเหลือ', num: 1, dec: 1 },
            { k: 'pending', l: 'รออนุมัติ', num: 1, dec: 0 }
          ],
          rows: rows, exportName: 'สรุปทีม',
          footerSum: ['worked', 'late', 'lateMin', 'absent', 'ot', 'pending']
        })
      ]);
    }
  });

  /* ================= เปลี่ยนรหัสผ่านของตนเอง ================= */
  HR.changeMyPassword = function () {
    var u = HR.me();
    if (!u) return;
    var cur = el('input', { type: 'password' }), a = el('input', { type: 'password' }), b = el('input', { type: 'password' });
    HR.modal({
      title: 'เปลี่ยนรหัสผ่าน — ' + u.username, size: 'narrow',
      body: el('div.stack', [
        el('div.field', [el('span.lbl', 'รหัสผ่านปัจจุบัน'), cur]),
        el('div.field', [el('span.lbl', 'รหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)'), a]),
        el('div.field', [el('span.lbl', 'ยืนยันรหัสผ่านใหม่'), b])
      ]),
      buttons: [{ label: 'ยกเลิก' }, {
        label: 'บันทึก', cls: 'btn-primary', keepOpen: true, fn: function (close) {
          if (String(cur.value) !== String(u.password)) { HR.toast('รหัสผ่านปัจจุบันไม่ถูกต้อง', 'err'); return false; }
          if (!a.value || a.value.length < 6) { HR.toast('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร', 'err'); return false; }
          if (a.value !== b.value) { HR.toast('ยืนยันรหัสผ่านไม่ตรงกัน', 'err'); return false; }
          HR.db.update('users', u.id, { password: a.value });
          HR.toast('เปลี่ยนรหัสผ่านแล้ว');
          close();
        }
      }]
    });
  };
})(window.HR);
