/* schema.js — นิยามทุกตาราง + ขอบเขตบริษัท + สิทธิ์การเข้าถึง + ตัวสร้างหน้าจอ CRUD */
(function (HR) {
  'use strict';

  var BADGE = {
    'ทำงาน': 'ok', 'ผ่านทดลองงาน': 'ok', 'อนุมัติ': 'ok', 'ผ่าน': 'ok', 'จ้าง': 'ok', 'เสร็จสิ้น': 'ok', 'จ่ายแล้ว': 'ok',
    'คืนแล้ว': 'ok', 'ปกติ': 'ok', 'เผยแพร่': 'ok', 'ออกแล้ว': 'ok', 'เบิกจ่ายแล้ว': 'ok', 'ใช้งาน': 'ok',
    'ทดลองงาน': 'warn', 'รออนุมัติ': 'warn', 'ร่าง': 'warn', 'มาสาย': 'warn', 'รอตรวจ': 'warn',
    'คำนวณแล้ว': 'warn', 'กำลังดำเนินการ': 'warn', 'ยื่นข้อเสนอ': 'warn',
    'ไม่อนุมัติ': 'danger', 'ขาดงาน': 'danger', 'ลาออก': 'danger', 'ยกเลิก': 'danger', 'ไม่ผ่าน': 'danger',
    'ค้างคืน': 'danger', 'ปฏิเสธข้อเสนอ': 'danger', 'เลิกจ้าง': 'danger', 'ปิดรับสมัคร': 'danger', 'ปิดใช้งาน': 'danger',
    'สมัครใหม่': 'info', 'คัดกรอง': 'info', 'สัมภาษณ์': 'info', 'ลา': 'info'
  };
  HR.bk = function (v) { return BADGE[v] || 'info'; };

  var YN = ['ใช่', 'ไม่ใช่'];
  HR.schema = {};
  function ent(name, def) { def.name = name; HR.schema[name] = def; return def; }

  /* ================================================================
     บริบทการใช้งาน: ผู้ใช้ที่เข้าระบบ + บริษัทที่กำลังดูอยู่
     ================================================================ */
  HR.ctx = { userId: null, companyId: '' };

  HR.ROLES = ['HR', 'หัวหน้างาน', 'พนักงาน'];

  HR.me = function () { return HR.ctx.userId ? HR.db.byId('users', HR.ctx.userId) : null; };
  HR.myRole = function () { var u = HR.me(); return u ? u.role : null; };
  HR.myEmployee = function () {
    var u = HR.me();
    return u && u.employeeId ? HR.db.byId('employees', u.employeeId) : null;
  };
  HR.isHR = function () { return HR.myRole() === 'HR'; };
  HR.isLead = function () { var r = HR.myRole(); return r === 'HR' || r === 'หัวหน้างาน'; };

  /** ลูกทีมสายตรงของผู้ใช้ปัจจุบัน */
  HR.myTeam = function () {
    var me = HR.myEmployee();
    if (!me) return [];
    return HR.db.t('employees').filter(function (e) { return e.managerId === me.id; });
  };
  /** พนักงานคนนี้อยู่ในขอบเขตที่ผู้ใช้ปัจจุบันดูได้หรือไม่ */
  HR.canSeeEmployee = function (empId) {
    if (HR.isHR()) return true;
    var me = HR.myEmployee();
    if (!me || !empId) return false;
    if (empId === me.id) return true;
    var e = HR.db.byId('employees', empId);
    return !!(e && e.managerId === me.id && HR.myRole() === 'หัวหน้างาน');
  };

  /** บริษัทที่กำลังทำงานอยู่ (null = เลือก "ทุกบริษัท") */
  HR.CO = function () { return HR.ctx.companyId ? HR.db.byId('companies', HR.ctx.companyId) : null; };
  HR.myCompanies = function () {
    var all = HR.db.t('companies').filter(function (c) { return c.active !== false; });
    var u = HR.me();
    if (u && u.companyId) return all.filter(function (c) { return c.id === u.companyId; });
    if (!HR.isHR()) {
      var e = HR.myEmployee();
      if (e && e.companyId) return all.filter(function (c) { return c.id === e.companyId; });
    }
    return all;
  };

  /* ================================================================
     สิทธิ์การเข้าถึงหน้าจอ
       hr   = เฉพาะ HR (ค่าเริ่มต้นของทุกหน้า)
       lead = HR และหัวหน้างาน
       self = ทุกคนที่เข้าระบบ (หน้าของตัวเอง)
     ================================================================ */
  HR.canView = function (viewId) {
    var def = HR.views[viewId];
    if (!def) return false;
    var perm = def.perm || 'hr';
    var role = HR.myRole();
    if (!role) return false;
    if (role === 'HR') return true;
    if (role === 'หัวหน้างาน') return perm === 'lead' || perm === 'self';
    return perm === 'self';
  };
  /** แก้ไขข้อมูลหลักได้เฉพาะ HR */
  HR.canEdit = function () { return HR.isHR(); };

  ent('users', {
    title: 'ผู้ใช้ระบบและสิทธิ์', sheet: 'ผู้ใช้ระบบ', noExport: true,
    label: function (r) { return r.username; },
    fields: [
      { k: 'username', l: 'ชื่อผู้ใช้', t: 'text', req: true, list: 1, w: 150 },
      { k: 'password', l: 'รหัสผ่าน', t: 'text', req: true, hint: 'ผู้ใช้เปลี่ยนเองได้หลังเข้าระบบครั้งแรก' },
      {
        k: 'role', l: 'สิทธิ์', t: 'select', req: true, list: 1, badge: 1, opts: HR.ROLES, def: 'พนักงาน',
        hint: 'HR = เข้าได้ทุกหน้า · หัวหน้างาน = ดูและอนุมัติเฉพาะลูกทีมสายตรง · พนักงาน = เห็นเฉพาะข้อมูลตนเอง'
      },
      { k: 'employeeId', l: 'ผูกกับพนักงาน', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'companyId', l: 'จำกัดเฉพาะบริษัท', t: 'ref', ref: 'companies', list: 1, fmt: function (r) { return r.companyId ? HR.nameOf('companies', r.companyId) : 'ทุกบริษัทในเครือ'; } },
      { k: 'active', l: 'เปิดใช้งาน', t: 'bool', def: true, list: 1, fmt: function (r) { return r.active === false ? 'ปิดใช้งาน' : 'ใช้งาน'; }, badge: 1 },
      { k: 'lastLogin', l: 'เข้าใช้ล่าสุด', t: 'text', readonly: true, list: 1 },
      { k: 'note', l: 'หมายเหตุ', t: 'text', w: 2 }
    ]
  });

  /** แถวนี้อยู่ในขอบเขตบริษัทที่เลือกอยู่หรือไม่ */
  HR.inScope = function (table, row) {
    var cid = HR.ctx.companyId;
    if (!cid) return true;
    var d = HR.schema[table];
    if (!d) return true;
    if (d.companyField) {
      var v = row[d.companyField];
      return !v || v === cid;           /* ไม่ระบุบริษัท = ใช้ร่วมกันทุกบริษัท */
    }
    if (d.viaEmployee) {
      var e = HR.db.byId('employees', row[d.viaEmployee]);
      return !e || !e.companyId || e.companyId === cid;
    }
    return true;
  };
  /** รายการของตารางนี้เฉพาะในขอบเขตบริษัทที่เลือก */
  HR.rows = function (table) {
    return HR.db.t(table).filter(function (r) { return HR.inScope(table, r); });
  };
  HR.companyOf = function (row, table) {
    var d = HR.schema[table];
    if (d && d.companyField) return row[d.companyField];
    if (d && d.viaEmployee) { var e = HR.db.byId('employees', row[d.viaEmployee]); return e ? e.companyId : null; }
    return null;
  };

  /* ================================================================
     บริษัทในเครือ
     ================================================================ */
  ent('companies', {
    title: 'บริษัทในเครือ', sheet: 'บริษัท',
    label: function (r) { return r.name; },
    fields: [
      { k: 'code', l: 'รหัสบริษัท', t: 'text', req: true, list: 1, w: 110 },
      { k: 'name', l: 'ชื่อนิติบุคคล', t: 'text', req: true, list: 1, w: 2 },
      { k: 'nameEn', l: 'ชื่อภาษาอังกฤษ', t: 'text' },
      { k: 'taxId', l: 'เลขประจำตัวผู้เสียภาษี (13 หลัก)', t: 'text', req: true, list: 1 },
      { k: 'branchType', l: 'ประเภทสถานประกอบการ', t: 'select', opts: ['สำนักงานใหญ่', 'สาขา'], def: 'สำนักงานใหญ่', list: 1 },
      { k: 'branchNo', l: 'เลขที่สาขา', t: 'text', hint: 'กรอกเมื่อเป็นสาขา เช่น 00001' },
      { k: 'address', l: 'ที่อยู่ตามหนังสือรับรอง', t: 'textarea', w: 2 },
      { k: 'phone', l: 'โทรศัพท์', t: 'tel' },
      { k: 'ssoAccount', l: 'เลขที่บัญชีนายจ้าง (ประกันสังคม)', t: 'text', list: 1 },
      { k: 'bankCode', l: 'รหัสธนาคารผู้โอน', t: 'text' },
      { k: 'bankAccount', l: 'บัญชีที่ใช้จ่ายเงินเดือน', t: 'text' },
      { k: 'payDay', l: 'วันจ่ายเงินเดือนประจำเดือน', t: 'number', def: 25, min: 1, max: 31, list: 1, num: 1, dec: 0 },
      { k: 'signerName', l: 'ผู้มีอำนาจลงนาม', t: 'text', hint: 'ใช้ลงนามในหนังสือรับรองการหักภาษี 50 ทวิ' },
      { k: 'signerPosition', l: 'ตำแหน่งผู้ลงนาม', t: 'text', def: 'กรรมการผู้จัดการ' },
      { k: 'active', l: 'เปิดใช้งาน', t: 'bool', def: true, list: 1, fmt: function (r) { return r.active === false ? 'ปิดใช้งาน' : 'ใช้งาน'; }, badge: 1 }
    ],
    listExtra: [{
      k: 'heads', l: 'พนักงานปัจจุบัน', num: 1, dec: 0,
      fmt: function (r) { return headcountOf(r.id); }, raw: function (r) { return headcountOf(r.id); }
    }]
  });
  function headcountOf(cid) {
    return HR.db.t('employees').filter(function (e) {
      return e.companyId === cid && (e.status === 'ทำงาน' || e.status === 'ทดลองงาน');
    }).length;
  }

  /* ================================================================
     โครงสร้างองค์กร
     ================================================================ */
  ent('departments', {
    title: 'ฝ่าย/แผนก', sheet: 'ฝ่ายแผนก', companyField: 'companyId',
    label: function (r) { return r.name; },
    fields: [
      { k: 'code', l: 'รหัสฝ่าย', t: 'text', req: true, list: 1, w: 110 },
      { k: 'name', l: 'ชื่อฝ่าย/แผนก', t: 'text', req: true, list: 1 },
      { k: 'companyId', l: 'บริษัท', t: 'ref', ref: 'companies', list: 1, fmt: function (r) { return r.companyId ? HR.nameOf('companies', r.companyId) : 'ใช้ร่วมทุกบริษัท'; } },
      { k: 'parentId', l: 'สังกัดฝ่าย', t: 'ref', ref: 'departments', list: 1, fmt: function (r) { return HR.nameOf('departments', r.parentId); } },
      { k: 'headId', l: 'ผู้บังคับบัญชา', t: 'ref', ref: 'employees', list: 1, fmt: function (r) { return HR.nameOf('employees', r.headId); } },
      { k: 'costCenter', l: 'ศูนย์ต้นทุน', t: 'text', list: 1 },
      { k: 'headcountPlan', l: 'อัตรากำลังที่วางแผน', t: 'number', list: 1, num: 1, dec: 0 }
    ]
  });

  ent('positions', {
    title: 'ตำแหน่งงาน', sheet: 'ตำแหน่งงาน', companyField: 'companyId',
    label: function (r) { return r.name; },
    fields: [
      { k: 'code', l: 'รหัสตำแหน่ง', t: 'text', req: true, list: 1, w: 110 },
      { k: 'name', l: 'ชื่อตำแหน่ง', t: 'text', req: true, list: 1 },
      { k: 'companyId', l: 'บริษัท', t: 'ref', ref: 'companies', fmt: function (r) { return r.companyId ? HR.nameOf('companies', r.companyId) : 'ใช้ร่วมทุกบริษัท'; } },
      { k: 'deptId', l: 'ฝ่าย', t: 'ref', ref: 'departments', req: true, list: 1, fmt: function (r) { return HR.nameOf('departments', r.deptId); } },
      { k: 'level', l: 'ระดับ', t: 'select', opts: ['ปฏิบัติการ', 'ชำนาญการ', 'หัวหน้างาน', 'ผู้จัดการ', 'ผู้อำนวยการ', 'ผู้บริหารระดับสูง'], list: 1 },
      { k: 'grade', l: 'เกรดงาน', t: 'text', list: 1 },
      { k: 'salaryMin', l: 'เงินเดือนขั้นต่ำ', t: 'money', list: 1, num: 1 },
      { k: 'salaryMax', l: 'เงินเดือนขั้นสูง', t: 'money', list: 1, num: 1 },
      { k: 'jobDesc', l: 'หน้าที่ความรับผิดชอบ', t: 'textarea', w: 2 }
    ]
  });

  /* ================================================================
     พนักงาน
     ================================================================ */
  ent('employees', {
    title: 'ทะเบียนพนักงาน', sheet: 'พนักงาน', companyField: 'companyId',
    label: function (r) { return (r.code ? r.code + ' ' : '') + r.firstName + ' ' + r.lastName; },
    fields: [
      { k: '_sec1', l: 'ข้อมูลส่วนตัว', t: 'section' },
      { k: 'code', l: 'รหัสพนักงาน', t: 'text', req: true, list: 1, w: 100 },
      { k: 'companyId', l: 'บริษัทที่สังกัด (นายจ้าง)', t: 'ref', ref: 'companies', req: true, list: 1, fmt: function (r) { return HR.nameOf('companies', r.companyId); }, hint: 'บริษัทนี้คือผู้จ่ายเงินได้และผู้หักภาษีในหนังสือรับรอง 50 ทวิ' },
      { k: 'prefix', l: 'คำนำหน้า', t: 'select', opts: ['นาย', 'นาง', 'นางสาว'] },
      { k: 'firstName', l: 'ชื่อ', t: 'text', req: true, list: 1 },
      { k: 'lastName', l: 'นามสกุล', t: 'text', req: true, list: 1 },
      { k: 'nickname', l: 'ชื่อเล่น', t: 'text' },
      { k: 'nationalId', l: 'เลขบัตรประชาชน', t: 'text', hint: '13 หลัก ใช้ยื่น ภ.ง.ด.1 สปส. และออกหนังสือรับรอง 50 ทวิ' },
      { k: 'dob', l: 'วันเกิด', t: 'date' },
      { k: 'gender', l: 'เพศ', t: 'select', opts: ['ชาย', 'หญิง', 'ไม่ระบุ'], list: 1 },
      { k: 'maritalStatus', l: 'สถานภาพสมรส', t: 'select', opts: ['โสด', 'สมรส', 'หย่า', 'หม้าย'] },
      { k: 'nationality', l: 'สัญชาติ', t: 'text', def: 'ไทย' },
      { k: 'disability', l: 'ผู้ทุพพลภาพ', t: 'bool' },
      { k: 'phone', l: 'โทรศัพท์', t: 'tel', list: 1 },
      { k: 'email', l: 'อีเมล', t: 'email', list: 1 },
      { k: 'address', l: 'ที่อยู่', t: 'textarea', w: 2 },
      { k: 'emergencyContact', l: 'ผู้ติดต่อฉุกเฉิน', t: 'text' },
      { k: 'emergencyPhone', l: 'โทรฉุกเฉิน', t: 'tel' },

      { k: '_sec2', l: 'การศึกษาและประสบการณ์', t: 'section' },
      { k: 'eduLevel', l: 'วุฒิการศึกษา', t: 'select', opts: ['ต่ำกว่า ม.6', 'ม.6/ปวช.', 'ปวส.', 'ปริญญาตรี', 'ปริญญาโท', 'ปริญญาเอก'], list: 1 },
      { k: 'eduMajor', l: 'สาขา', t: 'text' },
      { k: 'eduSchool', l: 'สถาบัน', t: 'text' },
      { k: 'eduYear', l: 'ปีที่จบ', t: 'number' },
      { k: 'priorExperience', l: 'ประสบการณ์ก่อนเข้างาน (ปี)', t: 'number' },
      { k: 'skills', l: 'ทักษะ/ความสามารถ', t: 'textarea', w: 2 },

      { k: '_sec3', l: 'การจ้างงาน', t: 'section' },
      { k: 'deptId', l: 'ฝ่าย', t: 'ref', ref: 'departments', req: true, list: 1, fmt: function (r) { return HR.nameOf('departments', r.deptId); } },
      { k: 'positionId', l: 'ตำแหน่ง', t: 'ref', ref: 'positions', req: true, list: 1, fmt: function (r) { return HR.nameOf('positions', r.positionId); } },
      { k: 'managerId', l: 'หัวหน้างาน', t: 'ref', ref: 'employees', list: 1, fmt: function (r) { return HR.nameOf('employees', r.managerId); } },
      { k: 'employmentType', l: 'ประเภทการจ้าง', t: 'select', opts: ['ประจำ', 'สัญญาจ้าง', 'รายวัน', 'พาร์ทไทม์', 'ฝึกงาน'], def: 'ประจำ', list: 1 },
      { k: 'hireDate', l: 'วันเริ่มงาน', t: 'date', req: true, list: 1, fmt: function (r) { return HR.date(r.hireDate); } },
      { k: 'probationEnd', l: 'ครบทดลองงาน', t: 'date', fmt: function (r) { return HR.date(r.probationEnd); } },
      { k: 'status', l: 'สถานะ', t: 'select', opts: ['ทดลองงาน', 'ทำงาน', 'ลาออก', 'เลิกจ้าง'], def: 'ทดลองงาน', req: true, list: 1, badge: 1 },
      { k: 'terminationDate', l: 'วันสิ้นสุดการจ้าง', t: 'date', fmt: function (r) { return HR.date(r.terminationDate); } },
      { k: 'workLocation', l: 'สถานที่ทำงาน', t: 'select', opts: ['สำนักงานใหญ่', 'สาขา', 'โรงงาน', 'ทำงานจากบ้าน'] },

      { k: '_secWP', l: 'รูปแบบการทำงานและวันหยุด', t: 'section' },
      { k: 'defaultShiftId', l: 'กะประจำ', t: 'ref', ref: 'shifts', filter: function (s) { return HR.isWorkShift(s); }, list: 1, fmt: function (r) { return HR.nameOf('shifts', r.defaultShiftId); }, hint: 'กะที่ใช้ลงตารางกะอัตโนมัติในวันทำงานปกติ' },
      {
        k: 'workPattern', l: 'รูปแบบวันหยุด', t: 'select', def: 'หยุดประจำสัปดาห์', list: 1,
        opts: ['หยุดประจำสัปดาห์', 'เสาร์เว้นเสาร์', 'กะหมุนเวียน (ลงเอง)'],
        hint: 'หยุดประจำสัปดาห์ = หยุดวันเดิมทุกสัปดาห์ · เสาร์เว้นเสาร์ = หยุดเสาร์สลับสัปดาห์ · กะหมุนเวียน = ไม่ลงวันหยุดให้อัตโนมัติ'
      },
      {
        k: 'offDays', l: 'วันหยุดประจำสัปดาห์', t: 'multi', w: 2, list: 1,
        opts: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'],
        fmt: function (r) { return (r.offDays || []).join(', '); },
        hint: 'เลือกได้มากกว่า 1 วัน เช่น หยุดเสาร์-อาทิตย์'
      },
      { k: 'altRefDate', l: 'เสาร์แรกที่หยุด', t: 'date', hint: 'ใช้เฉพาะรูปแบบ "เสาร์เว้นเสาร์" — ระบุวันเสาร์ที่หยุด แล้วระบบจะเว้นสัปดาห์ให้เอง', fmt: function (r) { return HR.date(r.altRefDate); } },
      { k: 'scanId', l: 'รหัสในเครื่องสแกน', t: 'text', hint: 'เลขผู้ใช้ในเครื่องสแกนใบหน้า ใช้จับคู่ตอนนำเข้าข้อมูลสแกน (ตั้งให้อัตโนมัติเมื่อจับคู่ในหน้านำเข้า)' },

      { k: '_sec4', l: 'ค่าจ้างและสวัสดิการ', t: 'section' },
      { k: 'salary', l: 'เงินเดือน (บาท)', t: 'money', req: true, list: 1, num: 1 },
      { k: 'positionAllowance', l: 'ค่าตำแหน่ง', t: 'money', num: 1 },
      { k: 'otherAllowanceMonthly', l: 'ค่าครองชีพ/เบี้ยเลี้ยงต่อเดือน', t: 'money', num: 1 },
      { k: 'bankName', l: 'ธนาคาร', t: 'select', opts: ['กสิกรไทย', 'ไทยพาณิชย์', 'กรุงเทพ', 'กรุงไทย', 'กรุงศรีอยุธยา', 'ทีทีบี', 'ออมสิน'] },
      { k: 'bankAccount', l: 'เลขที่บัญชี', t: 'text', list: 1 },
      { k: 'ssoNumber', l: 'เลขประกันสังคม', t: 'text' },
      { k: 'ssoMember', l: 'เป็นผู้ประกันตน', t: 'bool', def: true },
      { k: 'pvdRate', l: 'สะสม PVD (%)', t: 'percent', num: 1, dec: 0, hint: 'ลูกจ้างสะสม — นายจ้างสมทบตามอัตราในหน้าตั้งค่า' },

      { k: '_sec5', l: 'ข้อมูลลดหย่อนภาษี', t: 'section' },
      { k: 'spouseNoIncome', l: 'คู่สมรสไม่มีเงินได้', t: 'bool' },
      { k: 'children', l: 'จำนวนบุตร', t: 'number' },
      { k: 'childrenAfter2018', l: 'บุตรคนที่ 2 ขึ้นไป (เกิดปี 2561+)', t: 'number', hint: 'ลดหย่อนได้คนละ 60,000 บาท' },
      { k: 'parents', l: 'จำนวนบิดามารดาที่อุปการะ', t: 'number' },
      { k: 'lifeInsurance', l: 'เบี้ยประกันชีวิต/ปี', t: 'money', num: 1 },
      { k: 'otherAllowance', l: 'ลดหย่อนอื่น/ปี', t: 'money', num: 1 }
    ],
    listExtra: [
      { k: 'years', l: 'อายุงาน (ปี)', num: 1, dec: 1, fmt: function (r) { return HR.round2(HR.yearsBetween(r.hireDate, r.terminationDate)); }, raw: function (r) { return HR.round2(HR.yearsBetween(r.hireDate, r.terminationDate)); } }
    ]
  });

  /* ================================================================
     สรรหาและคัดเลือก
     ================================================================ */
  ent('jobs', {
    title: 'ประกาศรับสมัครงาน', sheet: 'ประกาศงาน', companyField: 'companyId',
    label: function (r) { return r.title; },
    fields: [
      { k: 'code', l: 'รหัสประกาศ', t: 'text', req: true, list: 1, w: 110 },
      { k: 'title', l: 'ตำแหน่งที่เปิดรับ', t: 'text', req: true, list: 1 },
      { k: 'companyId', l: 'บริษัทผู้ว่าจ้าง', t: 'ref', ref: 'companies', req: true, list: 1, fmt: function (r) { return HR.nameOf('companies', r.companyId); } },
      { k: 'deptId', l: 'ฝ่าย', t: 'ref', ref: 'departments', req: true, list: 1, fmt: function (r) { return HR.nameOf('departments', r.deptId); } },
      { k: 'openings', l: 'จำนวนที่รับ', t: 'number', def: 1, list: 1, num: 1, dec: 0 },
      { k: 'hiringManagerId', l: 'ผู้จัดการที่ขอ', t: 'ref', ref: 'employees', fmt: function (r) { return HR.nameOf('employees', r.hiringManagerId); } },
      { k: 'channels', l: 'ช่องทางประกาศ', t: 'multi', opts: ['เว็บไซต์บริษัท', 'JobsDB', 'JobThai', 'LinkedIn', 'Facebook', 'พนักงานแนะนำ', 'มหาวิทยาลัย'], w: 2, list: 1, fmt: function (r) { return (r.channels || []).join(', '); } },
      { k: 'minExperience', l: 'ประสบการณ์ขั้นต่ำ (ปี)', t: 'number', def: 3 },
      { k: 'salaryMin', l: 'งบเงินเดือนต่ำสุด', t: 'money', num: 1 },
      { k: 'salaryMax', l: 'งบเงินเดือนสูงสุด', t: 'money', list: 1, num: 1 },
      { k: 'keywords', l: 'คำสำคัญคัดกรองเรซูเม่', t: 'textarea', w: 2, hint: 'คั่นด้วยจุลภาค เช่น SQL, Power BI, ภาษาอังกฤษ — ระบบใช้คำนวณคะแนนคัดกรอง' },
      { k: 'postedDate', l: 'วันประกาศ', t: 'date', list: 1, fmt: function (r) { return HR.date(r.postedDate); } },
      { k: 'closeDate', l: 'ปิดรับ', t: 'date', fmt: function (r) { return HR.date(r.closeDate); } },
      { k: 'status', l: 'สถานะ', t: 'select', opts: ['ร่าง', 'เผยแพร่', 'ปิดรับสมัคร'], def: 'ร่าง', list: 1, badge: 1 },
      { k: 'detail', l: 'รายละเอียดงาน', t: 'textarea', w: 2 }
    ],
    listExtra: [
      { k: 'applicants', l: 'ผู้สมัคร', num: 1, dec: 0, fmt: function (r) { return HR.db.t('applicants').filter(function (a) { return a.jobId === r.id; }).length; }, raw: function (r) { return HR.db.t('applicants').filter(function (a) { return a.jobId === r.id; }).length; } }
    ]
  });

  ent('applicants', {
    title: 'ผู้สมัครงาน (ATS)', sheet: 'ผู้สมัคร',
    label: function (r) { return r.name; },
    inScopeFn: true,
    fields: [
      { k: 'code', l: 'รหัสผู้สมัคร', t: 'text', list: 1, w: 110 },
      { k: 'name', l: 'ชื่อ-นามสกุล', t: 'text', req: true, list: 1 },
      { k: 'jobId', l: 'สมัครตำแหน่ง', t: 'ref', ref: 'jobs', req: true, list: 1, fmt: function (r) { return HR.nameOf('jobs', r.jobId); } },
      { k: 'phone', l: 'โทรศัพท์', t: 'tel' },
      { k: 'email', l: 'อีเมล', t: 'email', list: 1 },
      { k: 'source', l: 'ช่องทางที่มา', t: 'select', opts: ['เว็บไซต์บริษัท', 'JobsDB', 'JobThai', 'LinkedIn', 'Facebook', 'พนักงานแนะนำ', 'มหาวิทยาลัย', 'Walk-in'], list: 1 },
      { k: 'education', l: 'การศึกษา', t: 'text' },
      { k: 'lastPosition', l: 'ตำแหน่งล่าสุด', t: 'text', list: 1 },
      { k: 'experienceYears', l: 'ประสบการณ์ (ปี)', t: 'number', list: 1, num: 1, dec: 1 },
      { k: 'expectedSalary', l: 'เงินเดือนที่คาดหวัง', t: 'money', list: 1, num: 1 },
      { k: 'skills', l: 'ทักษะ', t: 'textarea', w: 2 },
      { k: 'appliedDate', l: 'วันที่สมัคร', t: 'date', list: 1, fmt: function (r) { return HR.date(r.appliedDate); } },
      { k: 'stage', l: 'ขั้นตอน', t: 'select', opts: ['สมัครใหม่', 'คัดกรอง', 'สัมภาษณ์', 'ยื่นข้อเสนอ', 'จ้าง', 'ไม่ผ่าน', 'ปฏิเสธข้อเสนอ'], def: 'สมัครใหม่', req: true, list: 1, badge: 1 },
      { k: 'notes', l: 'บันทึก', t: 'textarea', w: 2 }
    ],
    listExtra: [
      {
        k: 'score', l: 'คะแนนคัดกรอง', num: 1, dec: 0,
        fmt: function (r) { return HR.engine.screenResume(r, HR.db.byId('jobs', r.jobId)); },
        raw: function (r) { return HR.engine.screenResume(r, HR.db.byId('jobs', r.jobId)); }
      }
    ]
  });

  ent('interviews', {
    title: 'ตารางสัมภาษณ์', sheet: 'สัมภาษณ์',
    label: function (r) { return HR.nameOf('applicants', r.applicantId) + ' รอบ ' + r.round; },
    fields: [
      { k: 'applicantId', l: 'ผู้สมัคร', t: 'ref', ref: 'applicants', req: true, list: 1, fmt: function (r) { return HR.nameOf('applicants', r.applicantId); } },
      { k: 'round', l: 'รอบที่', t: 'select', opts: ['1 - คัดกรองทางโทรศัพท์', '2 - สัมภาษณ์กับ HR', '3 - สัมภาษณ์กับผู้จัดการสายงาน', '4 - สัมภาษณ์ผู้บริหาร'], req: true, list: 1 },
      { k: 'date', l: 'วันสัมภาษณ์', t: 'date', req: true, list: 1, fmt: function (r) { return HR.date(r.date); } },
      { k: 'time', l: 'เวลา', t: 'time', list: 1 },
      { k: 'mode', l: 'รูปแบบ', t: 'select', opts: ['ที่สำนักงาน', 'วิดีโอคอล', 'โทรศัพท์'], list: 1 },
      { k: 'interviewerId', l: 'ผู้สัมภาษณ์', t: 'ref', ref: 'employees', list: 1, fmt: function (r) { return HR.nameOf('employees', r.interviewerId); } },
      { k: 'score', l: 'คะแนน (เต็ม 100)', t: 'number', list: 1, num: 1, dec: 0 },
      { k: 'result', l: 'ผล', t: 'select', opts: ['รอตรวจ', 'ผ่าน', 'ไม่ผ่าน'], def: 'รอตรวจ', list: 1, badge: 1 },
      { k: 'feedback', l: 'ความเห็นผู้สัมภาษณ์', t: 'textarea', w: 2 }
    ]
  });

  /* ================================================================
     วันลาและคำขอ
     ================================================================ */
  ent('leaveTypes', {
    title: 'ประเภทวันลา', sheet: 'ประเภทวันลา',
    label: function (r) { return r.name; },
    fields: [
      { k: 'code', l: 'รหัส', t: 'text', req: true, list: 1, w: 90 },
      { k: 'name', l: 'ประเภทการลา', t: 'text', req: true, list: 1 },
      { k: 'days', l: 'สิทธิ์ต่อปี (วัน)', t: 'number', req: true, list: 1, num: 1, dec: 1 },
      { k: 'paid', l: 'ได้รับค่าจ้าง', t: 'bool', def: true, list: 1, fmt: function (r) { return r.paid === false ? 'ไม่' : 'ใช่'; } },
      { k: 'proRateFirstYear', l: 'คิดตามสัดส่วนปีแรก', t: 'bool', list: 1, fmt: function (r) { return r.proRateFirstYear ? 'ใช่' : 'ไม่'; } },
      { k: 'requireDoc', l: 'ต้องแนบเอกสาร', t: 'bool', list: 1, fmt: function (r) { return r.requireDoc ? 'ใช่' : 'ไม่'; } },
      { k: 'maxConsecutive', l: 'ลาต่อเนื่องได้ไม่เกิน (วัน)', t: 'number', num: 1, dec: 0 },
      { k: 'note', l: 'เกณฑ์/หมายเหตุ', t: 'textarea', w: 2 }
    ]
  });

  ent('leaveEntitlements', {
    title: 'สิทธิ์วันลารายบุคคล', sheet: 'สิทธิ์วันลา', viaEmployee: 'employeeId',
    label: function (r) { return HR.nameOf('employees', r.employeeId); },
    fields: [
      { k: 'employeeId', l: 'พนักงาน', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'leaveTypeId', l: 'ประเภทการลา', t: 'ref', ref: 'leaveTypes', req: true, list: 1, fmt: function (r) { return HR.nameOf('leaveTypes', r.leaveTypeId); } },
      { k: 'year', l: 'ปี', t: 'number', def: new Date().getFullYear(), list: 1, num: 1, dec: 0 },
      { k: 'days', l: 'สิทธิ์ (วัน)', t: 'number', req: true, list: 1, num: 1, dec: 1 },
      { k: 'note', l: 'เหตุผลที่กำหนดเอง', t: 'text', w: 2 }
    ]
  });

  ent('leaves', {
    title: 'ใบลา', sheet: 'ใบลา', viaEmployee: 'employeeId',
    label: function (r) { return HR.nameOf('employees', r.employeeId) + ' ' + HR.date(r.dateFrom); },
    fields: [
      { k: 'employeeId', l: 'พนักงาน', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'leaveTypeId', l: 'ประเภทการลา', t: 'ref', ref: 'leaveTypes', req: true, list: 1, fmt: function (r) { return HR.nameOf('leaveTypes', r.leaveTypeId); } },
      { k: 'dateFrom', l: 'ลาตั้งแต่', t: 'date', req: true, list: 1, fmt: function (r) { return HR.date(r.dateFrom); } },
      { k: 'dateTo', l: 'ถึงวันที่', t: 'date', req: true, list: 1, fmt: function (r) { return HR.date(r.dateTo); } },
      { k: 'days', l: 'จำนวนวัน', t: 'number', req: true, list: 1, num: 1, dec: 1 },
      { k: 'reason', l: 'เหตุผล', t: 'textarea', w: 2, list: 1 },
      { k: 'status', l: 'สถานะ', t: 'select', opts: ['รออนุมัติ', 'อนุมัติ', 'ไม่อนุมัติ', 'ยกเลิก'], def: 'รออนุมัติ', list: 1, badge: 1 },
      { k: 'approverId', l: 'ผู้อนุมัติ', t: 'ref', ref: 'employees', list: 1, fmt: function (r) { return HR.nameOf('employees', r.approverId); } },
      { k: 'approvedAt', l: 'อนุมัติเมื่อ', t: 'date', fmt: function (r) { return HR.date(r.approvedAt); } }
    ]
  });

  ent('otRequests', {
    title: 'ใบขอทำงานล่วงเวลา', sheet: 'ขอ OT', viaEmployee: 'employeeId',
    label: function (r) { return HR.nameOf('employees', r.employeeId) + ' ' + HR.date(r.date); },
    fields: [
      { k: 'employeeId', l: 'พนักงาน', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'date', l: 'วันที่', t: 'date', req: true, list: 1, fmt: function (r) { return HR.date(r.date); } },
      { k: 'otType', l: 'ประเภท OT', t: 'select', opts: ['OT วันทำงาน', 'OT วันหยุด', 'OT วันหยุดเกินเวลา'], def: 'OT วันทำงาน', req: true, list: 1 },
      { k: 'hours', l: 'จำนวนชั่วโมง', t: 'number', req: true, list: 1, num: 1, dec: 1 },
      { k: 'reason', l: 'เหตุผล/งานที่ทำ', t: 'textarea', w: 2, list: 1 },
      { k: 'status', l: 'สถานะ', t: 'select', opts: ['รออนุมัติ', 'อนุมัติ', 'ไม่อนุมัติ'], def: 'รออนุมัติ', list: 1, badge: 1 },
      { k: 'approverId', l: 'ผู้อนุมัติ', t: 'ref', ref: 'employees', list: 1, fmt: function (r) { return HR.nameOf('employees', r.approverId); } }
    ],
    listExtra: [{
      k: 'amount', l: 'เงิน OT (ประมาณ)', num: 1,
      fmt: function (r) { var e = HR.db.byId('employees', r.employeeId); return e ? HR.engine.otAmount(e.salary, r.hours, r.otType) : 0; },
      raw: function (r) { var e = HR.db.byId('employees', r.employeeId); return e ? HR.engine.otAmount(e.salary, r.hours, r.otType) : 0; }
    }]
  });

  ent('expenses', {
    title: 'ใบเบิกค่าใช้จ่าย', sheet: 'เบิกค่าใช้จ่าย', viaEmployee: 'employeeId',
    label: function (r) { return HR.nameOf('employees', r.employeeId) + ' ' + r.category; },
    fields: [
      { k: 'employeeId', l: 'พนักงาน', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'date', l: 'วันที่ใช้จ่าย', t: 'date', req: true, list: 1, fmt: function (r) { return HR.date(r.date); } },
      { k: 'category', l: 'ประเภท', t: 'select', opts: ['ค่าเดินทาง', 'ค่าที่พัก', 'ค่ารับรองลูกค้า', 'ค่าอบรม', 'ค่าโทรศัพท์', 'ค่าอุปกรณ์', 'อื่น ๆ'], req: true, list: 1 },
      { k: 'amount', l: 'จำนวนเงิน', t: 'money', req: true, list: 1, num: 1 },
      { k: 'detail', l: 'รายละเอียด', t: 'textarea', w: 2, list: 1 },
      { k: 'receiptNo', l: 'เลขที่ใบเสร็จ', t: 'text', list: 1 },
      { k: 'status', l: 'สถานะ', t: 'select', opts: ['รออนุมัติ', 'อนุมัติ', 'ไม่อนุมัติ', 'เบิกจ่ายแล้ว'], def: 'รออนุมัติ', list: 1, badge: 1 },
      { k: 'approverId', l: 'ผู้อนุมัติ', t: 'ref', ref: 'employees', list: 1, fmt: function (r) { return HR.nameOf('employees', r.approverId); } }
    ]
  });

  /* ================================================================
     เวลาทำงาน
     ================================================================ */
  ent('shifts', {
    title: 'รหัสกะ', sheet: 'รหัสกะ',
    label: function (r) { return r.code + ' — ' + r.name + (r.startTime ? ' (' + r.startTime + '-' + r.endTime + ')' : ''); },
    fields: [
      { k: 'code', l: 'รหัสกะ', t: 'text', req: true, list: 1, w: 80, hint: 'ตัวย่อสั้น ๆ ที่จะแสดงในตารางกะรายเดือน เช่น A, N1, O, AL' },
      { k: 'name', l: 'คำอธิบาย', t: 'text', req: true, list: 1 },
      {
        k: 'kind', l: 'ประเภท', t: 'select', req: true, def: 'ทำงาน', list: 1, badge: 1,
        opts: ['ทำงาน', 'นอกสถานที่', 'วันหยุด', 'ลา'],
        hint: 'ทำงาน = ต้องสแกนเวลา · นอกสถานที่ = ทำงานแต่ไม่บังคับสแกน · วันหยุด และ ลา = ไม่นับเป็นวันทำงาน'
      },
      { k: 'startTime', l: 'เวลาเข้า', t: 'time', list: 1 },
      { k: 'endTime', l: 'เวลาออก', t: 'time', list: 1 },
      { k: 'breakMinutes', l: 'พัก (นาที)', t: 'number', def: 60, list: 1, num: 1, dec: 0 },
      { k: 'requireScan', l: 'ต้องสแกนเวลา', t: 'bool', def: true, list: 1, fmt: function (r) { return r.requireScan === false ? 'ไม่' : 'ใช่'; } },
      { k: 'isNight', l: 'กะกลางคืน', t: 'bool', list: 1, fmt: function (r) { return r.isNight ? 'ใช่' : 'ไม่'; } },
      { k: 'nightAllowance', l: 'ค่ากะ (บาท/วัน)', t: 'money', num: 1 },
      { k: 'note', l: 'หมายเหตุ', t: 'text', w: 2 }
    ],
    listExtra: [{
      k: 'workHours', l: 'ชม.ทำงาน', num: 1, dec: 2,
      fmt: function (r) { return HR.shiftHours(r); }, raw: function (r) { return HR.shiftHours(r); }
    }]
  });

  /** ชั่วโมงทำงานสุทธิของกะ (หักเวลาพัก) */
  HR.shiftHours = function (s) {
    if (!s || !s.startTime || !s.endTime) return 0;
    var a = HR.minutes(s.startTime), b = HR.minutes(s.endTime);
    if (b <= a) b += 1440;
    return HR.round2((b - a - (Number(s.breakMinutes) || 0)) / 60);
  };
  /** รหัสกะนี้นับเป็นวันทำงานหรือไม่ */
  HR.isWorkShift = function (s) { return !!s && (s.kind === 'ทำงาน' || s.kind === 'นอกสถานที่' || !s.kind); };

  ent('roster', {
    title: 'ตารางกะพนักงาน', sheet: 'ตารางกะ', viaEmployee: 'employeeId',
    label: function (r) { return HR.nameOf('employees', r.employeeId) + ' ' + HR.date(r.date); },
    fields: [
      { k: 'employeeId', l: 'พนักงาน', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'date', l: 'วันที่', t: 'date', req: true, list: 1, fmt: function (r) { return HR.date(r.date); } },
      { k: 'shiftId', l: 'กะ', t: 'ref', ref: 'shifts', req: true, list: 1, fmt: function (r) { return HR.nameOf('shifts', r.shiftId); } },
      { k: 'swapWithId', l: 'สลับกะกับ', t: 'ref', ref: 'employees', list: 1, fmt: function (r) { return HR.nameOf('employees', r.swapWithId); } },
      { k: 'note', l: 'หมายเหตุ', t: 'text', w: 2 }
    ]
  });

  ent('attendance', {
    title: 'บันทึกเวลาเข้า-ออกงาน', sheet: 'บันทึกเวลา', viaEmployee: 'employeeId',
    label: function (r) { return HR.nameOf('employees', r.employeeId) + ' ' + HR.date(r.date); },
    fields: [
      { k: 'employeeId', l: 'พนักงาน', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'date', l: 'วันที่', t: 'date', req: true, list: 1, fmt: function (r) { return HR.date(r.date); } },
      { k: 'shiftId', l: 'กะ', t: 'ref', ref: 'shifts', list: 1, fmt: function (r) { return HR.nameOf('shifts', r.shiftId); } },
      { k: 'clockIn', l: 'เวลาเข้า', t: 'time', list: 1 },
      { k: 'clockOut', l: 'เวลาออก', t: 'time', list: 1 },
      { k: 'method', l: 'วิธีลงเวลา', t: 'select', opts: ['แอป GPS', 'Beacon', 'สแกนใบหน้า', 'สแกนนิ้ว', 'บันทึกโดย HR'], def: 'แอป GPS', list: 1 },
      { k: 'location', l: 'พิกัด/สถานที่', t: 'text', list: 1 },
      { k: 'lateMinutes', l: 'สาย (นาที)', t: 'number', list: 1, num: 1, dec: 0 },
      { k: 'earlyLeaveMinutes', l: 'ออกก่อน (นาที)', t: 'number', num: 1, dec: 0 },
      { k: 'otHours', l: 'OT (ชม.)', t: 'number', list: 1, num: 1, dec: 1 },
      { k: 'otType', l: 'ประเภท OT', t: 'select', opts: ['OT วันทำงาน', 'OT วันหยุด', 'OT วันหยุดเกินเวลา'] },
      { k: 'status', l: 'สถานะ', t: 'select', opts: ['ปกติ', 'มาสาย', 'ขาดงาน', 'ลา', 'วันหยุด'], def: 'ปกติ', list: 1, badge: 1 },
      { k: 'note', l: 'หมายเหตุ', t: 'text', w: 2 }
    ]
  });

  ent('holidays', {
    title: 'วันหยุดประจำปี', sheet: 'วันหยุด',
    label: function (r) { return r.name; },
    fields: [
      { k: 'date', l: 'วันที่', t: 'date', req: true, list: 1, fmt: function (r) { return HR.date(r.date); } },
      { k: 'name', l: 'ชื่อวันหยุด', t: 'text', req: true, list: 1 },
      { k: 'type', l: 'ประเภท', t: 'select', opts: ['วันหยุดตามประเพณี', 'วันหยุดนักขัตฤกษ์', 'วันหยุดบริษัท'], list: 1 }
    ]
  });

  /* ================================================================
     เงินเดือน
     ================================================================ */
  ent('payPeriods', {
    title: 'รอบจ่ายเงินเดือน', sheet: 'รอบจ่าย', companyField: 'companyId',
    label: function (r) { return HR.monthName(r.period) + ' · ' + HR.nameOf('companies', r.companyId); },
    fields: [
      { k: 'companyId', l: 'บริษัท', t: 'ref', ref: 'companies', req: true, list: 1, fmt: function (r) { return HR.nameOf('companies', r.companyId); } },
      { k: 'period', l: 'งวดเดือน', t: 'month', req: true, list: 1, fmt: function (r) { return HR.monthName(r.period); } },
      { k: 'payDate', l: 'วันจ่าย', t: 'date', req: true, list: 1, fmt: function (r) { return HR.date(r.payDate); } },
      { k: 'status', l: 'สถานะ', t: 'select', opts: ['ร่าง', 'คำนวณแล้ว', 'อนุมัติ', 'จ่ายแล้ว'], def: 'ร่าง', list: 1, badge: 1 },
      { k: 'note', l: 'หมายเหตุ', t: 'text', w: 2, list: 1 }
    ]
  });

  ent('payAdjustments', {
    title: 'รายการปรับเพิ่ม/หักพิเศษ', sheet: 'ปรับเพิ่มหัก', viaEmployee: 'employeeId',
    label: function (r) { return r.name; },
    fields: [
      { k: 'periodId', l: 'งวด', t: 'ref', ref: 'payPeriods', req: true, list: 1, fmt: function (r) { return HR.nameOf('payPeriods', r.periodId); } },
      { k: 'employeeId', l: 'พนักงาน', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'kind', l: 'ประเภท', t: 'select', opts: ['รายได้', 'รายหัก'], def: 'รายได้', req: true, list: 1 },
      { k: 'name', l: 'ชื่อรายการ', t: 'text', req: true, list: 1, placeholder: 'เช่น โบนัส, คอมมิชชั่น, หักเงินกู้สวัสดิการ' },
      { k: 'amount', l: 'จำนวนเงิน', t: 'money', req: true, list: 1, num: 1 },
      { k: 'taxable', l: 'นำไปคิดภาษี', t: 'bool', def: true, list: 1, fmt: function (r) { return r.taxable === false ? 'ไม่' : 'ใช่'; } }
    ]
  });

  ent('payslips', {
    title: 'สลิปเงินเดือน', sheet: 'สลิปเงินเดือน', viaEmployee: 'employeeId',
    label: function (r) { return HR.nameOf('employees', r.employeeId); },
    fields: [
      { k: 'periodId', l: 'งวด', t: 'ref', ref: 'payPeriods', list: 1, fmt: function (r) { return HR.monthName(r.period); } },
      { k: 'employeeId', l: 'พนักงาน', t: 'ref', ref: 'employees', list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'gross', l: 'รายได้รวม', t: 'money', list: 1, num: 1 },
      { k: 'sso', l: 'ประกันสังคม', t: 'money', list: 1, num: 1 },
      { k: 'pvdEmployee', l: 'PVD ลูกจ้าง', t: 'money', list: 1, num: 1 },
      { k: 'tax', l: 'ภาษีหัก ณ ที่จ่าย', t: 'money', list: 1, num: 1 },
      { k: 'totalDeduction', l: 'หักรวม', t: 'money', list: 1, num: 1 },
      { k: 'net', l: 'เงินสุทธิ', t: 'money', list: 1, num: 1 }
    ]
  });

  /* หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) */
  ent('wht50', {
    title: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)', sheet: '50ทวิ',
    companyField: 'companyId',
    label: function (r) { return HR.nameOf('employees', r.employeeId) + ' ปี ' + (r.taxYear + 543); },
    fields: [
      { k: 'companyId', l: 'บริษัทผู้จ่ายเงินได้', t: 'ref', ref: 'companies', req: true, list: 1, fmt: function (r) { return HR.nameOf('companies', r.companyId); } },
      { k: 'employeeId', l: 'ผู้ถูกหักภาษี', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'taxYear', l: 'ปีภาษี (ค.ศ.)', t: 'number', req: true, list: 1, num: 1, dec: 0, fmt: function (r) { return r.taxYear + 543; } },
      { k: 'bookNo', l: 'เล่มที่', t: 'text', list: 1 },
      { k: 'seq', l: 'เลขที่', t: 'text', req: true, list: 1 },
      { k: 'formType', l: 'ยื่นตามแบบ', t: 'select', opts: ['ภ.ง.ด.1ก', 'ภ.ง.ด.1ก พิเศษ', 'ภ.ง.ด.2', 'ภ.ง.ด.3'], def: 'ภ.ง.ด.1ก', list: 1 },
      { k: 'months', l: 'จำนวนเดือนที่จ่าย', t: 'number', num: 1, dec: 0, list: 1 },
      { k: 'totalIncome', l: 'เงินได้ที่จ่ายทั้งปี', t: 'money', req: true, list: 1, num: 1 },
      { k: 'totalTax', l: 'ภาษีที่หักและนำส่ง', t: 'money', req: true, list: 1, num: 1 },
      { k: 'ssoTotal', l: 'เงินสมทบประกันสังคม', t: 'money', num: 1, list: 1 },
      { k: 'pvdTotal', l: 'เงินสะสมกองทุนสำรองเลี้ยงชีพ', t: 'money', num: 1, list: 1 },
      { k: 'lifeInsurance', l: 'เบี้ยประกันชีวิต', t: 'money', num: 1 },
      { k: 'issuedDate', l: 'วันที่ออกหนังสือ', t: 'date', req: true, list: 1, fmt: function (r) { return HR.date(r.issuedDate); } },
      { k: 'signerName', l: 'ผู้มีอำนาจลงนาม', t: 'text' },
      { k: 'signerPosition', l: 'ตำแหน่งผู้ลงนาม', t: 'text' },
      { k: 'status', l: 'สถานะ', t: 'select', opts: ['ร่าง', 'ออกแล้ว', 'ยกเลิก'], def: 'ออกแล้ว', list: 1, badge: 1 },
      { k: 'note', l: 'หมายเหตุ', t: 'text', w: 2 }
    ]
  });

  /* ================================================================
     ประเมินผลงาน
     ================================================================ */
  ent('goals', {
    title: 'เป้าหมาย KPI / OKR', sheet: 'เป้าหมาย', viaEmployee: 'employeeId',
    label: function (r) { return r.name; },
    fields: [
      { k: 'employeeId', l: 'พนักงาน', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'cycle', l: 'รอบประเมิน', t: 'text', req: true, def: new Date().getFullYear() + ' H1', list: 1 },
      { k: 'framework', l: 'รูปแบบ', t: 'select', opts: ['KPI', 'OKR'], def: 'KPI', list: 1 },
      { k: 'name', l: 'เป้าหมาย/Objective', t: 'text', req: true, list: 1 },
      { k: 'measure', l: 'ตัวชี้วัด/Key Result', t: 'text', list: 1 },
      { k: 'weight', l: 'น้ำหนัก (%)', t: 'percent', req: true, list: 1, num: 1, dec: 0 },
      { k: 'target', l: 'เป้า', t: 'number', list: 1, num: 1, dec: 1 },
      { k: 'actual', l: 'ผลจริง', t: 'number', list: 1, num: 1, dec: 1 },
      { k: 'unit', l: 'หน่วย', t: 'text' },
      { k: 'note', l: 'หมายเหตุ', t: 'textarea', w: 2 }
    ],
    listExtra: [{
      k: 'achieve', l: 'บรรลุ (%)', num: 1, dec: 0,
      fmt: function (r) { return r.target ? HR.round2((r.actual || 0) / r.target * 100) : 0; },
      raw: function (r) { return r.target ? HR.round2((r.actual || 0) / r.target * 100) : 0; }
    }]
  });

  ent('reviews', {
    title: 'ผลประเมิน 360 องศา', sheet: 'ประเมิน360', viaEmployee: 'employeeId',
    label: function (r) { return HR.nameOf('employees', r.employeeId) + ' / ' + r.relation; },
    fields: [
      { k: 'employeeId', l: 'ผู้ถูกประเมิน', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'cycle', l: 'รอบประเมิน', t: 'text', req: true, def: new Date().getFullYear() + ' H1', list: 1 },
      { k: 'reviewerId', l: 'ผู้ประเมิน', t: 'ref', ref: 'employees', list: 1, fmt: function (r) { return HR.nameOf('employees', r.reviewerId); } },
      { k: 'relation', l: 'มุมมอง', t: 'select', opts: ['ประเมินตนเอง', 'หัวหน้า', 'เพื่อนร่วมงาน', 'ลูกทีม', 'ลูกค้าภายใน'], req: true, list: 1 },
      { k: 'scoreResult', l: 'ผลงาน (1-5)', t: 'number', min: 1, max: 5, list: 1, num: 1, dec: 1 },
      { k: 'scoreCompetency', l: 'สมรรถนะ (1-5)', t: 'number', min: 1, max: 5, list: 1, num: 1, dec: 1 },
      { k: 'scoreCulture', l: 'ค่านิยมองค์กร (1-5)', t: 'number', min: 1, max: 5, list: 1, num: 1, dec: 1 },
      { k: 'scoreLeadership', l: 'ภาวะผู้นำ (1-5)', t: 'number', min: 1, max: 5, num: 1, dec: 1 },
      { k: 'strength', l: 'จุดแข็ง', t: 'textarea', w: 2 },
      { k: 'improve', l: 'สิ่งที่ควรพัฒนา', t: 'textarea', w: 2 },
      { k: 'status', l: 'สถานะ', t: 'select', opts: ['ร่าง', 'เสร็จสิ้น'], def: 'ร่าง', list: 1, badge: 1 }
    ],
    listExtra: [{
      k: 'avg', l: 'เฉลี่ย', num: 1, dec: 2,
      fmt: function (r) { return avgScore(r); }, raw: function (r) { return avgScore(r); }
    }]
  });
  function avgScore(r) {
    var v = [r.scoreResult, r.scoreCompetency, r.scoreCulture, r.scoreLeadership].filter(function (x) { return x != null && x !== ''; }).map(Number);
    return v.length ? HR.round2(HR.sum(v) / v.length) : 0;
  }
  HR.avgScore = avgScore;

  /* ================================================================
     การพ้นสภาพ
     ================================================================ */
  ent('offboardings', {
    title: 'การสิ้นสุดการจ้างงาน', sheet: 'Offboarding', viaEmployee: 'employeeId',
    label: function (r) { return HR.nameOf('employees', r.employeeId); },
    fields: [
      { k: 'employeeId', l: 'พนักงาน', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'noticeDate', l: 'วันที่แจ้ง', t: 'date', list: 1, fmt: function (r) { return HR.date(r.noticeDate); } },
      { k: 'lastDay', l: 'วันทำงานวันสุดท้าย', t: 'date', req: true, list: 1, fmt: function (r) { return HR.date(r.lastDay); } },
      { k: 'reason', l: 'เหตุผลการพ้นสภาพ', t: 'select', opts: ['ลาออกเอง', 'เลิกจ้าง', 'ปรับโครงสร้างองค์กร', 'ครบสัญญาจ้าง', 'เกษียณอายุ', 'เลิกจ้างด้วยเหตุร้ายแรง'], req: true, list: 1 },
      { k: 'reasonDetail', l: 'เหตุผลโดยละเอียด', t: 'select', opts: ['ค่าตอบแทน', 'โอกาสเติบโต', 'หัวหน้างาน', 'ภาระงาน', 'ย้ายถิ่นฐาน', 'เรียนต่อ', 'ปัญหาสุขภาพ', 'ครอบครัว', 'อื่น ๆ'], list: 1 },
      { k: 'status', l: 'สถานะ', t: 'select', opts: ['กำลังดำเนินการ', 'เสร็จสิ้น'], def: 'กำลังดำเนินการ', list: 1, badge: 1 },
      { k: 'severanceAmount', l: 'ค่าชดเชยที่จ่าย', t: 'money', list: 1, num: 1 },
      { k: 'note', l: 'บันทึก', t: 'textarea', w: 2 }
    ]
  });

  ent('assets', {
    title: 'ทรัพย์สินที่ถือครอง', sheet: 'ทรัพย์สิน', viaEmployee: 'employeeId',
    label: function (r) { return r.name; },
    fields: [
      { k: 'employeeId', l: 'ผู้ถือครอง', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'name', l: 'รายการทรัพย์สิน', t: 'text', req: true, list: 1 },
      { k: 'serial', l: 'หมายเลขเครื่อง/รหัส', t: 'text', list: 1 },
      { k: 'value', l: 'มูลค่า', t: 'money', list: 1, num: 1 },
      { k: 'issuedDate', l: 'วันที่รับมอบ', t: 'date', list: 1, fmt: function (r) { return HR.date(r.issuedDate); } },
      { k: 'returnedDate', l: 'วันที่คืน', t: 'date', list: 1, fmt: function (r) { return HR.date(r.returnedDate); } },
      { k: 'status', l: 'สถานะ', t: 'select', opts: ['ถือครอง', 'คืนแล้ว', 'ค้างคืน', 'ชำรุด/สูญหาย'], def: 'ถือครอง', list: 1, badge: 1 },
      { k: 'note', l: 'หมายเหตุ', t: 'text', w: 2 }
    ]
  });

  ent('exitSurveys', {
    title: 'แบบสำรวจ Exit Interview', sheet: 'ExitInterview', viaEmployee: 'employeeId',
    label: function (r) { return HR.nameOf('employees', r.employeeId); },
    fields: [
      { k: 'employeeId', l: 'พนักงาน', t: 'ref', ref: 'employees', req: true, list: 1, fmt: function (r) { return HR.nameOf('employees', r.employeeId); } },
      { k: 'date', l: 'วันสัมภาษณ์', t: 'date', req: true, list: 1, fmt: function (r) { return HR.date(r.date); } },
      { k: 'interviewerId', l: 'ผู้สัมภาษณ์', t: 'ref', ref: 'employees', list: 1, fmt: function (r) { return HR.nameOf('employees', r.interviewerId); } },
      { k: 'sWork', l: 'เนื้องาน (1-5)', t: 'number', min: 1, max: 5, list: 1, num: 1, dec: 0 },
      { k: 'sManager', l: 'หัวหน้างาน (1-5)', t: 'number', min: 1, max: 5, list: 1, num: 1, dec: 0 },
      { k: 'sPay', l: 'ค่าตอบแทน (1-5)', t: 'number', min: 1, max: 5, list: 1, num: 1, dec: 0 },
      { k: 'sGrowth', l: 'โอกาสเติบโต (1-5)', t: 'number', min: 1, max: 5, list: 1, num: 1, dec: 0 },
      { k: 'sCulture', l: 'วัฒนธรรมองค์กร (1-5)', t: 'number', min: 1, max: 5, list: 1, num: 1, dec: 0 },
      { k: 'recommend', l: 'จะแนะนำองค์กรให้คนอื่น', t: 'select', opts: YN, list: 1 },
      { k: 'wouldReturn', l: 'พร้อมกลับมาทำงานอีก', t: 'select', opts: YN, list: 1 },
      { k: 'comment', l: 'ข้อเสนอแนะ', t: 'textarea', w: 2 }
    ],
    listExtra: [{
      k: 'avg', l: 'คะแนนเฉลี่ย', num: 1, dec: 2,
      fmt: function (r) { return exitAvg(r); }, raw: function (r) { return exitAvg(r); }
    }]
  });
  function exitAvg(r) {
    var v = [r.sWork, r.sManager, r.sPay, r.sGrowth, r.sCulture].filter(function (x) { return x != null && x !== ''; }).map(Number);
    return v.length ? HR.round2(HR.sum(v) / v.length) : 0;
  }
  HR.exitAvg = exitAvg;

  /* ================================================================
     คอลัมน์ ฟอร์ม และหน้าจอมาตรฐาน
     ================================================================ */
  function colFrom(f) {
    return {
      k: f.k, l: f.l, num: !!f.num, dec: f.dec, fmt: f.fmt, raw: f.raw,
      badge: f.badge ? function (r) { return HR.bk(f.fmt ? f.fmt(r) : r[f.k]); } : null,
      w: f.w
    };
  }
  HR.listCols = function (name) {
    var d = HR.schema[name];
    var cols = d.fields.filter(function (f) { return f.list && f.t !== 'section'; }).map(colFrom);
    (d.listExtra || []).forEach(function (f) { cols.push({ k: f.k, l: f.l, num: !!f.num, dec: f.dec, fmt: f.fmt, raw: f.raw }); });
    return cols;
  };
  HR.exportCols = function (name) {
    var d = HR.schema[name];
    var cols = d.fields.filter(function (f) { return f.t !== 'section' && f.k !== 'password'; }).map(colFrom);
    (d.listExtra || []).forEach(function (f) { cols.push({ k: f.k, l: f.l, num: !!f.num, dec: f.dec, fmt: f.fmt, raw: f.raw, noImport: true }); });
    return cols;
  };

  HR.refOptions = function (f) {
    var rows = HR.rows(f.ref);
    if (f.filter) rows = rows.filter(f.filter);
    return rows.map(function (r) { return { v: r.id, l: HR.label(f.ref, r) }; })
      .sort(function (a, b) { return a.l.localeCompare(b.l, 'th'); });
  };
  HR.label = function (table, row) {
    if (typeof row === 'string') row = HR.db.byId(table, row);
    if (!row) return '-';
    var d = HR.schema[table];
    return d && d.label ? d.label(row) : (row.name || row.title || row.code || row.id);
  };
  HR.nameOf = function (table, id) { return id ? HR.label(table, id) : '-'; };

  /* ---------- Editor ---------- */
  HR.openEditor = function (name, row, after) {
    if (!HR.canEdit()) { HR.toast('บัญชีของคุณไม่มีสิทธิ์แก้ไขข้อมูลนี้', 'err'); return; }
    var d = HR.schema[name];
    var seed = Object.assign({}, row || {});
    if (d.companyField && !seed[d.companyField] && HR.ctx.companyId) seed[d.companyField] = HR.ctx.companyId;
    var form = HR.form(d.fields, seed);
    HR.modal({
      title: (row && row.id ? 'แก้ไข' : 'เพิ่ม') + ' — ' + d.title,
      size: 'wide', body: form.el,
      buttons: [
        { label: 'ยกเลิก' },
        {
          label: 'บันทึก', cls: 'btn-primary', keepOpen: true,
          fn: function (close) {
            var bad = form.validate();
            if (bad.length) { HR.toast('กรอกข้อมูลที่จำเป็นให้ครบ: ' + bad.join(', '), 'err'); return false; }
            var v = form.get();
            if (d.beforeSave) { var err = d.beforeSave(v); if (err) { HR.toast(err, 'err'); return false; } }
            HR.db.upsert(name, v);
            HR.toast('บันทึก ' + d.title + ' แล้ว');
            close();
            if (after) after(v); else HR.render();
          }
        }
      ]
    });
  };

  HR.deleteRow = function (name, row, after) {
    if (!HR.canEdit()) { HR.toast('บัญชีของคุณไม่มีสิทธิ์ลบข้อมูลนี้', 'err'); return; }
    HR.confirm('ลบ "' + HR.label(name, row) + '" ออกจาก' + HR.schema[name].title + '? การลบนี้ย้อนกลับไม่ได้', 'ลบรายการ')
      .then(function (ok) {
        if (!ok) return;
        HR.db.remove(name, row.id);
        HR.toast('ลบรายการแล้ว');
        if (after) after(); else HR.render();
      });
  };

  /* ---------- ตัวสร้างหน้าจอมาตรฐาน ---------- */
  HR.crud = function (name, opt) {
    opt = opt || {};
    return function () {
      var d = HR.schema[name];
      var rows = opt.rows ? opt.rows() : HR.rows(name);
      var wrap = HR.el('div');
      wrap.appendChild(HR.pageHead(d.title, opt.desc, [
        HR.canEdit() ? HR.btn('+ เพิ่มรายการ', function () { HR.openEditor(name, opt.defaults ? opt.defaults() : {}); }, 'btn-primary') : null
      ].concat(opt.actions ? opt.actions() : []).filter(Boolean)));
      if (opt.before) { var b = opt.before(); if (b) wrap.appendChild(b); }
      wrap.appendChild(HR.table({
        title: d.title, cols: HR.listCols(name), rows: rows,
        exportName: d.sheet || d.title,
        footerSum: opt.footerSum,
        pageSize: opt.pageSize || 25,
        toolbar: opt.toolbar ? opt.toolbar() : [],
        onImport: HR.canEdit() ? function (imported) {
          var n = 0;
          imported.forEach(function (r) {
            if (d.companyField && !r[d.companyField] && HR.ctx.companyId) r[d.companyField] = HR.ctx.companyId;
            var existing = r.code ? HR.db.t(name).filter(function (x) { return x.code && x.code === r.code; })[0] : null;
            if (existing) HR.db.update(name, existing.id, r); else HR.db.insert(name, r);
            n++;
          });
          HR.toast('นำเข้า ' + n + ' รายการแล้ว');
          HR.render();
        } : null,
        actions: HR.canEdit() ? function (r) {
          return [
            { label: 'แก้ไข', fn: function () { HR.openEditor(name, r); } },
            { label: 'ลบ', cls: 'btn-danger', fn: function () { HR.deleteRow(name, r); } }
          ].concat(opt.rowActions ? opt.rowActions(r) : []);
        } : (opt.rowActions ? function (r) { return opt.rowActions(r); } : null)
      }));
      if (opt.after) { var a = opt.after(); if (a) wrap.appendChild(a); }
      return wrap;
    };
  };

  /* ---------- อนุมัติคำขอ ---------- */
  HR.approve = function (name, row, decision) {
    var me = HR.myEmployee();
    HR.db.update(name, row.id, {
      status: decision, approvedAt: HR.today(), approverId: me ? me.id : null
    });
    HR.toast(decision === 'อนุมัติ' ? 'อนุมัติรายการแล้ว' : 'ไม่อนุมัติรายการแล้ว');
    HR.render();
  };
})(window.HR);
