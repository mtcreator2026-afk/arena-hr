/* seed.js — ข้อมูลตัวอย่างสำหรับทดลองใช้ (ลบทิ้งได้จากหน้าตั้งค่า) */
(function (HR) {
  'use strict';

  var rnd = (function (s) { return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })(20261012);
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function iso(y, m, d) { return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }

  /* ปฏิทินอ้างอิงจากวันที่ปัจจุบัน เพื่อให้ข้อมูลตัวอย่างสดเสมอไม่ว่าจะเปิดใช้เมื่อไร */
  var NOW = new Date();
  var TODAY = HR.isoOf(NOW);
  var YEAR = NOW.getFullYear();
  function ym(back) { return HR.ymOf(new Date(YEAR, NOW.getMonth() - back, 1)); }
  function lastDayOf(back) { return new Date(YEAR, NOW.getMonth() - back + 1, 0).getDate(); }
  function rel(n) { return HR.addDays(TODAY, n); }
  function dayIn(back, day) { return ym(back) + '-' + String(day).padStart(2, '0'); }

  HR.seed = function () {
    var D = {};
    Object.keys(HR.schema).forEach(function (k) { D[k] = []; });
    D.settings = HR.defaultSettings();

    function add(t, o) { o.id = o.id || HR.uid(t.slice(0, 3)); D[t].push(o); return o.id; }

    /* ---- บริษัทในเครือ ---- */
    var co = {};
    [['C01', 'บริษัท สยามเวิร์คฟอร์ซ โฮลดิ้ง จำกัด', 'Siam Workforce Holding Co., Ltd.', '0105566001234',
      '99/1 อาคารสำนักงานใหญ่ ชั้น 18 ถนนพระราม 9 แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310',
      '02-111-2200', '1000123456', '014', '0141234567', 'ธนกฤต ศรีวิไล', 'กรรมการผู้จัดการ'],
     ['C02', 'บริษัท สยามรีเทล ซัพพลาย จำกัด', 'Siam Retail Supply Co., Ltd.', '0105566005678',
      '88/9 หมู่ 4 ถนนบางนา-ตราด กม.19 ตำบลบางโฉลง อำเภอบางพลี จังหวัดสมุทรปราการ 10540',
      '02-111-3300', '1000234567', '004', '0049876543', 'ณัฐพงษ์ วัฒนกุล', 'กรรมการ'],
     ['C03', 'บริษัท สยามเทคโนโลยี เซอร์วิส จำกัด', 'Siam Technology Service Co., Ltd.', '0105566009012',
      '191 อาคารสีลมคอมเพล็กซ์ ชั้น 24 ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500',
      '02-111-4400', '1000345678', '002', '0025551234', 'อนุชา ทองดีเลิศ', 'กรรมการ']]
      .forEach(function (r) {
        co[r[0]] = add('companies', {
          code: r[0], name: r[1], nameEn: r[2], taxId: r[3], branchType: 'สำนักงานใหญ่', branchNo: '00000',
          address: r[4], phone: r[5], ssoAccount: r[6], bankCode: r[7], bankAccount: r[8],
          payDay: 25, signerName: r[9], signerPosition: r[10], active: true
        });
      });

    /* ---- ฝ่าย (แต่ละฝ่ายสังกัดบริษัทใดบริษัทหนึ่งในเครือ) ---- */
    var dep = {}, depCo = {};
    [['D01', 'สำนักผู้บริหาร', 'CC-100', 'C01'], ['D02', 'ฝ่ายขาย', 'CC-200', 'C02'], ['D03', 'ฝ่ายการตลาด', 'CC-210', 'C02'],
     ['D04', 'ฝ่ายปฏิบัติการและคลังสินค้า', 'CC-300', 'C02'], ['D05', 'ฝ่ายบัญชีและการเงิน', 'CC-400', 'C01'],
     ['D06', 'ฝ่ายทรัพยากรบุคคล', 'CC-410', 'C01'], ['D07', 'ฝ่ายเทคโนโลยีสารสนเทศ', 'CC-420', 'C03']]
      .forEach(function (r, i) {
        depCo[r[0]] = co[r[3]];
        dep[r[0]] = add('departments', {
          code: r[0], name: r[1], costCenter: r[2], companyId: co[r[3]], headcountPlan: [3, 8, 5, 10, 4, 4, 5][i]
        });
      });
    D.departments.forEach(function (d) { if (d.code !== 'D01') d.parentId = dep.D01; });

    /* ---- ตำแหน่ง ---- */
    var pos = {};
    [['P01', 'กรรมการผู้จัดการ', 'D01', 'ผู้บริหารระดับสูง', 'E1', 180000, 260000],
     ['P02', 'ผู้จัดการฝ่ายขาย', 'D02', 'ผู้จัดการ', 'M2', 60000, 95000],
     ['P03', 'พนักงานขาย', 'D02', 'ปฏิบัติการ', 'S2', 18000, 32000],
     ['P04', 'ผู้จัดการการตลาด', 'D03', 'ผู้จัดการ', 'M2', 55000, 85000],
     ['P05', 'นักการตลาดดิจิทัล', 'D03', 'ชำนาญการ', 'S3', 28000, 45000],
     ['P06', 'หัวหน้าคลังสินค้า', 'D04', 'หัวหน้างาน', 'M1', 32000, 48000],
     ['P07', 'พนักงานคลังสินค้า', 'D04', 'ปฏิบัติการ', 'S1', 12000, 18000],
     ['P08', 'สมุห์บัญชี', 'D05', 'ผู้จัดการ', 'M2', 55000, 80000],
     ['P09', 'เจ้าหน้าที่บัญชี', 'D05', 'ปฏิบัติการ', 'S2', 20000, 32000],
     ['P10', 'ผู้จัดการฝ่ายทรัพยากรบุคคล', 'D06', 'ผู้จัดการ', 'M2', 58000, 88000],
     ['P11', 'เจ้าหน้าที่สรรหาว่าจ้าง', 'D06', 'ปฏิบัติการ', 'S2', 22000, 34000],
     ['P12', 'ผู้จัดการฝ่ายไอที', 'D07', 'ผู้จัดการ', 'M2', 70000, 110000],
     ['P13', 'นักพัฒนาระบบ', 'D07', 'ชำนาญการ', 'S3', 40000, 70000],
     ['P14', 'นักวิเคราะห์ข้อมูล', 'D07', 'ชำนาญการ', 'S3', 38000, 62000]]
      .forEach(function (r) {
        pos[r[0]] = add('positions', { code: r[0], name: r[1], deptId: dep[r[2]], level: r[3], grade: r[4], salaryMin: r[5], salaryMax: r[6] });
      });

    /* ---- พนักงาน ---- */
    var emp = {};
    var people = [
      ['EMP001', 'นาย', 'ธนกฤต', 'ศรีวิไล', 'D01', 'P01', null, 220000, '2016-04-01', 'ชาย', 'ปริญญาโท', 5],
      ['EMP002', 'นางสาว', 'ปิยะวรรณ', 'เจริญทรัพย์', 'D06', 'P10', 'EMP001', 78000, '2018-06-15', 'หญิง', 'ปริญญาโท', 5],
      ['EMP003', 'นาย', 'ณัฐพงษ์', 'วัฒนกุล', 'D02', 'P02', 'EMP001', 82000, '2017-09-01', 'ชาย', 'ปริญญาตรี', 5],
      ['EMP004', 'นางสาว', 'ชญาดา', 'พูนสวัสดิ์', 'D03', 'P04', 'EMP001', 72000, '2019-02-01', 'หญิง', 'ปริญญาโท', 5],
      ['EMP005', 'นาย', 'อนุชา', 'ทองดีเลิศ', 'D07', 'P12', 'EMP001', 95000, '2018-11-01', 'ชาย', 'ปริญญาโท', 5],
      ['EMP006', 'นาง', 'สุภาพร', 'ไกรศรี', 'D05', 'P08', 'EMP001', 68000, '2017-03-16', 'หญิง', 'ปริญญาตรี', 5],
      ['EMP007', 'นาย', 'กิตติศักดิ์', 'แสนสุข', 'D04', 'P06', 'EMP001', 42000, '2019-07-01', 'ชาย', 'ปวส.', 3],
      ['EMP008', 'นางสาว', 'ธิดารัตน์', 'บุญมาก', 'D02', 'P03', 'EMP003', 26000, '2021-01-04', 'หญิง', 'ปริญญาตรี', 2],
      ['EMP009', 'นาย', 'วรเมธ', 'อินทรสุวรรณ', 'D02', 'P03', 'EMP003', 24000, '2022-05-02', 'ชาย', 'ปริญญาตรี', 2],
      ['EMP010', 'นางสาว', 'พิมพ์ชนก', 'รุ่งเรือง', 'D03', 'P05', 'EMP004', 38000, '2021-08-16', 'หญิง', 'ปริญญาตรี', 3],
      ['EMP011', 'นาย', 'สหรัฐ', 'มีชัย', 'D07', 'P13', 'EMP005', 58000, '2020-03-02', 'ชาย', 'ปริญญาตรี', 3],
      ['EMP012', 'นางสาว', 'อรปรียา', 'สุขเกษม', 'D07', 'P14', 'EMP005', 48000, '2022-02-01', 'หญิง', 'ปริญญาโท', 2],
      ['EMP013', 'นาย', 'จิรายุ', 'ประเสริฐสุข', 'D04', 'P07', 'EMP007', 15000, '2023-04-03', 'ชาย', 'ม.6/ปวช.', 1],
      ['EMP014', 'นางสาว', 'เบญจวรรณ', 'ใจงาม', 'D05', 'P09', 'EMP006', 26000, '2022-09-01', 'หญิง', 'ปริญญาตรี', 2],
      ['EMP015', 'นาย', 'ภูริช', 'ตั้งมั่น', 'D04', 'P07', 'EMP007', 14000, '2024-06-03', 'ชาย', 'ม.6/ปวช.', 0],
      ['EMP016', 'นางสาว', 'ณิชกานต์', 'วงศ์สว่าง', 'D06', 'P11', 'EMP002', 29000, '2023-10-02', 'หญิง', 'ปริญญาตรี', 2],
      ['EMP017', 'นาย', 'ปรเมศวร์', 'หาญกล้า', 'D02', 'P03', 'EMP003', 21000, dayIn(2, 3), 'ชาย', 'ปริญญาตรี', 1],
      ['EMP018', 'นางสาว', 'กัญญาณัฐ', 'เลิศวิไล', 'D03', 'P05', 'EMP004', 32000, dayIn(1, 1), 'หญิง', 'ปริญญาตรี', 2],
      ['EMP019', 'นาย', 'ชลธาร', 'ภักดีวงศ์', 'D04', 'P07', 'EMP007', 13500, '2024-01-15', 'ชาย', 'ม.6/ปวช.', 1],
      ['EMP020', 'นางสาว', 'มนัสนันท์', 'ศิริโชค', 'D05', 'P09', 'EMP006', 24000, '2023-02-01', 'หญิง', 'ปริญญาตรี', 2]
    ];
    var banks = ['กสิกรไทย', 'ไทยพาณิชย์', 'กรุงเทพ', 'กรุงไทย'];
    people.forEach(function (p, i) {
      var hire = p[8], probation = HR.addDays(hire, 119);
      var isNew = HR.yearsBetween(hire) < 0.33;
      emp[p[0]] = add('employees', {
        code: p[0], companyId: depCo[p[4]], prefix: p[1], firstName: p[2], lastName: p[3],
        nationalId: '1' + String(100000000000 + i * 7654321).slice(0, 12),
        dob: iso(1975 + (i * 3) % 25, 1 + (i * 5) % 12, 1 + (i * 7) % 27),
        gender: p[9], maritalStatus: i % 3 === 0 ? 'สมรส' : 'โสด', nationality: 'ไทย',
        phone: '08' + String(10000000 + i * 1234567).slice(0, 8),
        email: p[0].toLowerCase() + '@example.co.th',
        address: String(10 + i) + '/' + (i + 3) + ' ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110',
        emergencyContact: 'ญาติสายตรง', emergencyPhone: '089' + String(1000000 + i * 54321).slice(0, 7),
        eduLevel: p[10], eduMajor: pick(['บริหารธุรกิจ', 'การตลาด', 'บัญชี', 'วิทยาการคอมพิวเตอร์', 'การจัดการ']),
        eduSchool: pick(['มหาวิทยาลัยธรรมศาสตร์', 'จุฬาลงกรณ์มหาวิทยาลัย', 'มหาวิทยาลัยเกษตรศาสตร์', 'มหาวิทยาลัยขอนแก่น']),
        eduYear: 2000 + (i * 3) % 24, priorExperience: p[11],
        skills: pick(['Excel ขั้นสูง, การเจรจาต่อรอง', 'SQL, Power BI, Python', 'การบริหารทีม, งบประมาณ', 'คลังสินค้า, WMS, ความปลอดภัย', 'บัญชีภาษีอากร, ERP']),
        deptId: dep[p[4]], positionId: pos[p[5]], managerId: null,
        employmentType: p[5] === 'P07' ? 'รายวัน' : 'ประจำ',
        hireDate: hire, probationEnd: probation,
        status: isNew ? 'ทดลองงาน' : 'ทำงาน',
        workLocation: p[4] === 'D04' ? 'โรงงาน' : 'สำนักงานใหญ่',
        salary: p[7],
        positionAllowance: ['P01', 'P02', 'P04', 'P06', 'P08', 'P10', 'P12'].indexOf(p[5]) > -1 ? 8000 : 0,
        otherAllowanceMonthly: p[4] === 'D04' ? 1200 : 0,
        bankName: banks[i % 4], bankAccount: String(1000000000 + i * 1357913).slice(0, 10),
        ssoNumber: '1' + String(230000000 + i * 97531).slice(0, 12), ssoMember: true,
        pvdRate: i % 4 === 0 ? 5 : i % 4 === 1 ? 3 : 0,
        spouseNoIncome: i % 6 === 0, children: i % 5 === 0 ? 2 : i % 7 === 0 ? 1 : 0,
        childrenAfter2018: i % 5 === 0 ? 1 : 0, parents: i % 4 === 0 ? 2 : 0,
        lifeInsurance: i % 3 === 0 ? 30000 : 0, otherAllowance: 0
      });
    });
    D.employees.forEach(function (e, i) { if (people[i][6]) e.managerId = emp[people[i][6]]; });
    D.departments.forEach(function (d) {
      var head = D.employees.filter(function (e) { return e.deptId === d.id && /ผู้จัดการ|กรรมการ|สมุห์|หัวหน้า/.test(HR.nameOfRaw(D, 'positions', e.positionId)); })[0];
      if (head) d.headId = head.id;
    });

    /* ---- พนักงานที่ลาออกแล้ว (ใช้คำนวณ turnover) ---- */
    [['EMP901', 'นาย', 'ศุภกร', 'เรืองฤทธิ์', 'D02', 'P03', 23000, '2022-03-01', dayIn(3, lastDayOf(3)), 'ลาออกเอง', 'ค่าตอบแทน'],
     ['EMP902', 'นางสาว', 'วริศรา', 'คงสมบูรณ์', 'D04', 'P07', 14500, '2023-05-15', dayIn(2, lastDayOf(2)), 'ลาออกเอง', 'หัวหน้างาน'],
     ['EMP903', 'นาย', 'ธีรเดช', 'นิลสุวรรณ', 'D07', 'P13', 52000, '2021-11-01', dayIn(1, lastDayOf(1)), 'ลาออกเอง', 'โอกาสเติบโต']]
      .forEach(function (p, i) {
        var id = add('employees', {
          code: p[0], companyId: depCo[p[4]], prefix: p[1], firstName: p[2], lastName: p[3], gender: i === 1 ? 'หญิง' : 'ชาย',
          deptId: dep[p[4]], positionId: pos[p[5]], salary: p[6], hireDate: p[7], terminationDate: p[8],
          status: 'ลาออก', employmentType: 'ประจำ', eduLevel: 'ปริญญาตรี', ssoMember: true, pvdRate: 0,
          bankName: 'กสิกรไทย', bankAccount: '900000000' + i, email: p[0].toLowerCase() + '@example.co.th'
        });
        var sev = HR.engine ? 0 : 0;
        add('offboardings', {
          employeeId: id, noticeDate: HR.addDays(p[8], -30), lastDay: p[8],
          reason: p[9], reasonDetail: p[10], status: 'เสร็จสิ้น', severanceAmount: sev,
          note: 'ส่งมอบงานครบและคืนทรัพย์สินแล้ว'
        });
        add('exitSurveys', {
          employeeId: id, date: p[8], interviewerId: emp.EMP002,
          sWork: 4, sManager: p[10] === 'หัวหน้างาน' ? 2 : 4, sPay: p[10] === 'ค่าตอบแทน' ? 2 : 3,
          sGrowth: p[10] === 'โอกาสเติบโต' ? 2 : 3, sCulture: 4,
          recommend: p[10] === 'หัวหน้างาน' ? 'ไม่ใช่' : 'ใช่', wouldReturn: 'ใช่',
          comment: 'ขอบคุณสำหรับโอกาส — อยากให้ปรับเรื่อง' + p[10] + 'ให้ชัดเจนขึ้น'
        });
      });

    /* ---- ประเภทวันลา ---- */
    var lt = {};
    [['LV1', 'ลาพักร้อน', 6, true, true, false, 'ครบ 1 ปีได้ 6 วัน และเพิ่มตามอายุงาน'],
     ['LV2', 'ลาป่วย', 30, true, false, true, 'ลาเกิน 3 วันต้องมีใบรับรองแพทย์'],
     ['LV3', 'ลากิจธุระจำเป็น', 3, true, false, false, 'ตามกฎหมายขั้นต่ำ 3 วันทำงาน/ปี'],
     ['LV4', 'ลาคลอด', 98, true, false, true, 'ได้ค่าจ้าง 45 วันจากนายจ้าง ส่วนที่เหลือจากประกันสังคม'],
     ['LV5', 'ลาไม่รับค่าจ้าง', 30, false, false, false, 'หักค่าจ้างตามจำนวนวันที่ลา'],
     ['LV6', 'ลาเพื่อรับราชการทหาร', 60, true, false, true, 'ตามหมายเรียก']]
      .forEach(function (r) {
        lt[r[0]] = add('leaveTypes', { code: r[0], name: r[1], days: r[2], paid: r[3], proRateFirstYear: r[4], requireDoc: r[5], note: r[6], maxConsecutive: r[2] });
      });

    /* ---- กะงาน ---- */
    var sh = {};
    [['SH1', 'กะปกติ (สำนักงาน)', '08:30', '17:30', 60, false, 0],
     ['SH2', 'กะเช้า (คลังสินค้า)', '06:00', '14:00', 30, false, 0],
     ['SH3', 'กะบ่าย (คลังสินค้า)', '14:00', '22:00', 30, false, 50],
     ['SH4', 'กะกลางคืน (คลังสินค้า)', '22:00', '06:00', 30, true, 150]]
      .forEach(function (r) { sh[r[0]] = add('shifts', { code: r[0], name: r[1], startTime: r[2], endTime: r[3], breakMinutes: r[4], isNight: r[5], nightAllowance: r[6] }); });

    /* ---- วันหยุด ---- */
    [['01-01', 'วันขึ้นปีใหม่'], ['04-13', 'วันสงกรานต์'], ['04-14', 'วันสงกรานต์'], ['04-15', 'วันสงกรานต์'],
     ['05-01', 'วันแรงงานแห่งชาติ'], ['07-28', 'วันเฉลิมพระชนมพรรษา'], ['10-13', 'วันนวมินทรมหาราช'],
     ['12-05', 'วันชาติ'], ['12-31', 'วันสิ้นปี']]
      .forEach(function (r) { add('holidays', { date: YEAR + '-' + r[0], name: r[1], type: 'วันหยุดนักขัตฤกษ์' }); });

    /* ---- บันทึกเวลา: เดือนก่อนหน้าเต็มเดือน + เดือนปัจจุบันถึงวันนี้ ---- */
    var actives = D.employees.filter(function (e) { return e.status !== 'ลาออก' && e.status !== 'เลิกจ้าง'; });
    [[1, lastDayOf(1)], [0, NOW.getDate()]].forEach(function (mm) {
      for (var d = 1; d <= mm[1]; d++) {
        var date = dayIn(mm[0], d), dow = new Date(date).getDay();
        if (dow === 0 || dow === 6) continue;
        if (D.holidays.some(function (h) { return h.date === date; })) continue;
        actives.forEach(function (e) {
          if (e.hireDate > date) return;
          var warehouse = D.positions.filter(function (p) { return p.id === e.positionId; })[0];
          var shiftId = warehouse && /คลังสินค้า/.test(warehouse.name) ? pick([sh.SH2, sh.SH3, sh.SH4]) : sh.SH1;
          var shift = D.shifts.filter(function (s) { return s.id === shiftId; })[0];
          var roll = rnd();
          if (roll > 0.965) {
            add('attendance', { employeeId: e.id, date: date, shiftId: shiftId, status: 'ลา', method: 'บันทึกโดย HR', note: 'ตามใบลาที่อนุมัติ' });
            return;
          }
          if (roll > 0.955) {
            add('attendance', { employeeId: e.id, date: date, shiftId: shiftId, status: 'ขาดงาน', method: 'บันทึกโดย HR' });
            return;
          }
          var late = roll > 0.86 ? Math.floor(rnd() * 42) + 3 : 0;
          var inMin = HR.minutes(shift.startTime) + late;
          var ot = rnd() > 0.82 ? Math.round((rnd() * 3 + 1) * 2) / 2 : 0;
          var outMin = HR.minutes(shift.endTime) + ot * 60;
          add('attendance', {
            employeeId: e.id, date: date, shiftId: shiftId,
            clockIn: HR.hhmm(inMin), clockOut: HR.hhmm(outMin % 1440),
            method: warehouse && /คลังสินค้า/.test(warehouse.name) ? pick(['สแกนนิ้ว', 'สแกนใบหน้า']) : pick(['แอป GPS', 'สแกนใบหน้า', 'Beacon']),
            location: warehouse && /คลังสินค้า/.test(warehouse.name) ? 'คลังสินค้าบางนา' : '13.7290, 100.5600 (สำนักงานใหญ่)',
            lateMinutes: late, earlyLeaveMinutes: 0,
            otHours: ot, otType: ot ? 'OT วันทำงาน' : '',
            status: late > 10 ? 'มาสาย' : 'ปกติ'
          });
          if (ot) {
            add('otRequests', {
              employeeId: e.id, date: date, otType: 'OT วันทำงาน', hours: ot,
              reason: pick(['ปิดยอดขายสิ้นเดือน', 'จัดส่งสินค้าเร่งด่วน', 'ปิดงบรายเดือน', 'แก้ปัญหาระบบนอกเวลา']),
              status: 'อนุมัติ', approverId: e.managerId
            });
          }
        });
      }
    });

    /* ---- ตารางกะสัปดาห์ปัจจุบัน ---- */
    actives.filter(function (e) {
      var p = D.positions.filter(function (x) { return x.id === e.positionId; })[0];
      return p && /คลังสินค้า/.test(p.name);
    }).forEach(function (e, i) {
      for (var d = 0; d < 7; d++) {
        add('roster', { employeeId: e.id, date: rel(d), shiftId: [sh.SH2, sh.SH3, sh.SH4][(i + d) % 3] });
      }
    });

    /* ---- ใบลา ---- */
    [[emp.EMP008, lt.LV1, rel(-7), rel(-5), 3, 'พาครอบครัวไปต่างจังหวัด', 'อนุมัติ'],
     [emp.EMP010, lt.LV2, rel(-24), rel(-23), 2, 'เป็นไข้หวัดใหญ่ มีใบรับรองแพทย์', 'อนุมัติ'],
     [emp.EMP013, lt.LV5, rel(-18), rel(-17), 2, 'ธุระส่วนตัวที่ต่างจังหวัด', 'อนุมัติ'],
     [emp.EMP014, lt.LV3, rel(2), rel(2), 1, 'ไปติดต่อราชการที่อำเภอ', 'รออนุมัติ'],
     [emp.EMP011, lt.LV1, rel(8), rel(12), 5, 'เดินทางท่องเที่ยวต่างประเทศ', 'รออนุมัติ'],
     [emp.EMP016, lt.LV2, rel(-10), rel(-10), 1, 'ปวดฟันต้องไปพบทันตแพทย์', 'อนุมัติ'],
     [emp.EMP009, lt.LV1, rel(21), rel(23), 3, 'ลาพักผ่อนประจำปี', 'รออนุมัติ']]
      .forEach(function (r) {
        var e = D.employees.filter(function (x) { return x.id === r[0]; })[0] || {};
        add('leaves', {
          employeeId: r[0], leaveTypeId: r[1], dateFrom: r[2], dateTo: r[3], days: r[4], reason: r[5],
          status: r[6], approverId: r[6] === 'อนุมัติ' ? e.managerId : null, approvedAt: r[6] === 'อนุมัติ' ? r[2] : null
        });
      });

    /* ---- เบิกค่าใช้จ่าย ---- */
    [[emp.EMP008, rel(-9), 'ค่าเดินทาง', 1850, 'เดินทางพบลูกค้าที่ระยอง (น้ำมัน+ทางด่วน)', 'รออนุมัติ'],
     [emp.EMP003, rel(-14), 'ค่ารับรองลูกค้า', 6400, 'เลี้ยงรับรองลูกค้ารายใหญ่ 4 ท่าน', 'อนุมัติ'],
     [emp.EMP012, rel(-22), 'ค่าอบรม', 12000, 'คอร์ส Data Analytics ภายนอก', 'เบิกจ่ายแล้ว'],
     [emp.EMP010, rel(-4), 'ค่าโทรศัพท์', 699, 'ค่าโทรศัพท์ประจำเดือน', 'รออนุมัติ'],
     [emp.EMP007, rel(-11), 'ค่าอุปกรณ์', 3200, 'ซื้อรถเข็นและอุปกรณ์ความปลอดภัยคลังสินค้า', 'อนุมัติ']]
      .forEach(function (r, i) {
        var e = D.employees.filter(function (x) { return x.id === r[0]; })[0] || {};
        add('expenses', {
          employeeId: r[0], date: r[1], category: r[2], amount: r[3], detail: r[4], status: r[5],
          receiptNo: 'RC-' + YEAR + String(1001 + i), approverId: r[5] === 'รออนุมัติ' ? null : e.managerId
        });
      });

    /* ---- รอบจ่ายเงินเดือน ---- */
    var cur = {};   /* งวดปัจจุบันของแต่ละบริษัท */
    ['C01', 'C02', 'C03'].forEach(function (ck) {
      [[2, 'จ่ายแล้ว'], [1, 'จ่ายแล้ว'], [0, 'ร่าง']].forEach(function (r) {
        var id = add('payPeriods', {
          companyId: co[ck], period: ym(r[0]), payDate: dayIn(r[0], Math.min(25, lastDayOf(r[0]))), status: r[1],
          note: r[1] === 'ร่าง' ? 'รอคำนวณเมื่อปิดเวลาทำงานสิ้นเดือน' : 'โอนผ่านธนาคารเรียบร้อย'
        });
        if (r[0] === 0) cur[ck] = id;
      });
    });

    /* ---- ปรับเพิ่ม/หักพิเศษ ---- */
    [[cur.C02, emp.EMP008, 'รายได้', 'คอมมิชชั่นยอดขายเดือนก่อน', 18500, true],
     [cur.C02, emp.EMP009, 'รายได้', 'คอมมิชชั่นยอดขายเดือนก่อน', 9200, true],
     [cur.C02, emp.EMP013, 'รายหัก', 'หักเงินกู้สวัสดิการพนักงาน', 2000, false],
     [cur.C02, emp.EMP003, 'รายได้', 'โบนัสพิเศษตามเป้าไตรมาส', 45000, true],
     [cur.C02, emp.EMP015, 'รายหัก', 'หักค่าชุดยูนิฟอร์ม', 450, false]]
      .forEach(function (r) { add('payAdjustments', { periodId: r[0], employeeId: r[1], kind: r[2], name: r[3], amount: r[4], taxable: r[5] }); });

    /* ---- สรรหา ---- */
    var jb = {};
    [['JR-' + YEAR + '-01', 'นักพัฒนาระบบ (Backend)', 'D07', 2, ['เว็บไซต์บริษัท', 'JobsDB', 'LinkedIn'], 3, 45000, 70000, 'Node.js, SQL, REST API, Docker', rel(-41), rel(19), 'เผยแพร่', 'EMP005'],
     ['JR-' + YEAR + '-02', 'พนักงานขายภาคกลาง', 'D02', 3, ['JobThai', 'Facebook', 'พนักงานแนะนำ'], 1, 18000, 30000, 'งานขาย, เจรจาต่อรอง, ใบขับขี่', rel(-32), rel(34), 'เผยแพร่', 'EMP003'],
     ['JR-' + YEAR + '-03', 'เจ้าหน้าที่บัญชีต้นทุน', 'D05', 1, ['JobsDB', 'เว็บไซต์บริษัท'], 2, 22000, 34000, 'บัญชีต้นทุน, ERP, ภาษีอากร', rel(-53), rel(8), 'เผยแพร่', 'EMP006'],
     ['JR-' + YEAR + '-04', 'นักการตลาดดิจิทัล', 'D03', 1, ['LinkedIn', 'Facebook', 'มหาวิทยาลัย'], 2, 28000, 42000, 'Facebook Ads, Google Analytics, SEO', rel(-103), rel(-42), 'ปิดรับสมัคร', 'EMP004']]
      .forEach(function (r) {
        jb[r[0]] = add('jobs', {
          code: r[0], title: r[1], companyId: depCo[r[2]], deptId: dep[r[2]], openings: r[3], channels: r[4], minExperience: r[5],
          salaryMin: r[6], salaryMax: r[7], keywords: r[8], postedDate: r[9], closeDate: r[10], status: r[11],
          hiringManagerId: emp[r[12]],
          detail: 'รับผิดชอบงานตามที่ได้รับมอบหมาย ทำงานร่วมกับทีมข้ามสายงาน และรายงานต่อผู้จัดการฝ่าย'
        });
      });

    function J(n) { return 'JR-' + YEAR + '-0' + n; }
    var apps = [
      ['AP-1001', 'สมชาย พัฒนกิจ', J(1), 'JobsDB', 'ปริญญาตรี วิทยาการคอมพิวเตอร์', 'Backend Developer', 4, 62000, 'Node.js, SQL, Docker, REST API', rel(-37), 'สัมภาษณ์'],
      ['AP-1002', 'กานต์ธิดา ศรีสุข', J(1), 'LinkedIn', 'ปริญญาโท วิศวกรรมคอมพิวเตอร์', 'Senior Developer', 6, 78000, 'Node.js, Kubernetes, SQL, AWS', rel(-35), 'ยื่นข้อเสนอ'],
      ['AP-1003', 'ธนวัฒน์ แก้วใส', J(1), 'เว็บไซต์บริษัท', 'ปริญญาตรี เทคโนโลยีสารสนเทศ', 'Junior Developer', 1, 35000, 'PHP, MySQL', rel(-30), 'ไม่ผ่าน'],
      ['AP-1004', 'ปวีณา ทรัพย์เจริญ', J(2), 'JobThai', 'ปริญญาตรี การตลาด', 'พนักงานขาย', 3, 28000, 'งานขาย, เจรจาต่อรอง, ใบขับขี่', rel(-27), 'สัมภาษณ์'],
      ['AP-1005', 'อภิวัฒน์ รุ่งโรจน์', J(2), 'พนักงานแนะนำ', 'ปวส. การขาย', 'ผู้แทนขาย', 2, 24000, 'งานขาย, ใบขับขี่', rel(-24), 'คัดกรอง'],
      ['AP-1006', 'ชนิดาภา ประทีป', J(2), 'Facebook', 'ปริญญาตรี บริหารธุรกิจ', 'เจ้าหน้าที่ลูกค้าสัมพันธ์', 1, 20000, 'บริการลูกค้า', rel(-17), 'สมัครใหม่'],
      ['AP-1007', 'ศิริพร มั่นคง', J(3), 'JobsDB', 'ปริญญาตรี บัญชี', 'เจ้าหน้าที่บัญชี', 3, 30000, 'บัญชีต้นทุน, ERP, ภาษีอากร', rel(-45), 'ยื่นข้อเสนอ'],
      ['AP-1008', 'นพดล จันทร์เพ็ง', J(3), 'เว็บไซต์บริษัท', 'ปริญญาตรี บัญชี', 'ผู้ช่วยบัญชี', 1, 24000, 'บัญชีทั่วไป', rel(-40), 'คัดกรอง'],
      ['AP-1009', 'กัญญาณัฐ เลิศวิไล', J(4), 'LinkedIn', 'ปริญญาตรี นิเทศศาสตร์', 'Digital Marketing Executive', 2, 32000, 'Facebook Ads, Google Analytics, SEO', rel(-94), 'จ้าง'],
      ['AP-1010', 'เอกรัตน์ สว่างวงศ์', J(4), 'มหาวิทยาลัย', 'ปริญญาตรี การตลาด', 'นักศึกษาฝึกงาน', 0, 25000, 'SEO, Content', rel(-86), 'ไม่ผ่าน']
    ];
    var ap = {};
    apps.forEach(function (r) {
      ap[r[0]] = add('applicants', {
        code: r[0], name: r[1], jobId: jb[r[2]], source: r[3], education: r[4], lastPosition: r[5],
        experienceYears: r[6], expectedSalary: r[7], skills: r[8], appliedDate: r[9], stage: r[10],
        phone: '09' + String(10000000 + r[0].charCodeAt(5) * 97531).slice(0, 8),
        email: r[1].split(' ')[0].toLowerCase() + '@mail.example',
        notes: r[10] === 'ไม่ผ่าน' ? 'ประสบการณ์ยังไม่ตรงกับความต้องการของตำแหน่ง' : 'ประวัติน่าสนใจ ตรงกับคำสำคัญของตำแหน่ง'
      });
    });

    [[ap['AP-1001'], '2 - สัมภาษณ์กับ HR', rel(-20), '10:00', 'วิดีโอคอล', 'EMP016', 78, 'ผ่าน'],
     [ap['AP-1001'], '3 - สัมภาษณ์กับผู้จัดการสายงาน', rel(2), '14:00', 'ที่สำนักงาน', 'EMP005', null, 'รอตรวจ'],
     [ap['AP-1002'], '3 - สัมภาษณ์กับผู้จัดการสายงาน', rel(-16), '13:30', 'ที่สำนักงาน', 'EMP005', 88, 'ผ่าน'],
     [ap['AP-1003'], '1 - คัดกรองทางโทรศัพท์', rel(-26), '09:30', 'โทรศัพท์', 'EMP016', 52, 'ไม่ผ่าน'],
     [ap['AP-1004'], '2 - สัมภาษณ์กับ HR', rel(-13), '11:00', 'ที่สำนักงาน', 'EMP016', 74, 'ผ่าน'],
     [ap['AP-1004'], '3 - สัมภาษณ์กับผู้จัดการสายงาน', rel(3), '10:30', 'ที่สำนักงาน', 'EMP003', null, 'รอตรวจ'],
     [ap['AP-1007'], '3 - สัมภาษณ์กับผู้จัดการสายงาน', rel(-34), '15:00', 'ที่สำนักงาน', 'EMP006', 82, 'ผ่าน']]
      .forEach(function (r) {
        add('interviews', {
          applicantId: r[0], round: r[1], date: r[2], time: r[3], mode: r[4], interviewerId: emp[r[5]],
          score: r[6], result: r[7],
          feedback: r[7] === 'ผ่าน' ? 'สื่อสารชัดเจน พื้นฐานแน่น เหมาะกับทีม' : r[7] === 'ไม่ผ่าน' ? 'ยังขาดประสบการณ์ในงานหลักของตำแหน่ง' : ''
        });
      });

    /* ---- เป้าหมาย KPI/OKR ---- */
    var goalSet = [
      ['EMP008', 'KPI', 'ยอดขายรวมไตรมาส', 'มูลค่าคำสั่งซื้อที่ปิดได้ (ล้านบาท)', 50, 12, 13.4, 'ล้านบาท'],
      ['EMP008', 'KPI', 'ลูกค้าใหม่', 'จำนวนลูกค้าใหม่ที่เปิดบัญชี', 30, 10, 8, 'ราย'],
      ['EMP008', 'KPI', 'ความพึงพอใจลูกค้า', 'คะแนนสำรวจหลังการขาย', 20, 90, 93, 'คะแนน'],
      ['EMP010', 'OKR', 'สร้างการรับรู้แบรนด์ในช่องทางออนไลน์', 'ผู้ติดตามใหม่รวมทุกช่องทาง', 40, 20000, 17800, 'คน'],
      ['EMP010', 'OKR', 'ลดต้นทุนต่อ Lead', 'ต้นทุนต่อ Lead (บาท)', 30, 120, 104, 'บาท'],
      ['EMP010', 'OKR', 'เพิ่มอัตราการเปลี่ยนเป็นลูกค้า', 'Conversion rate (%)', 30, 3.5, 3.9, '%'],
      ['EMP011', 'KPI', 'ส่งมอบฟีเจอร์ตามแผน', 'ฟีเจอร์ที่ขึ้นระบบจริง', 50, 12, 11, 'รายการ'],
      ['EMP011', 'KPI', 'ลดข้อผิดพลาดบนระบบจริง', 'จำนวน Bug ระดับสูง', 25, 3, 2, 'รายการ'],
      ['EMP011', 'KPI', 'ความครอบคลุมการทดสอบ', 'Test coverage (%)', 25, 80, 72, '%'],
      ['EMP013', 'KPI', 'ความถูกต้องของการจัดสินค้า', 'อัตราจัดสินค้าถูกต้อง (%)', 60, 99.5, 99.7, '%'],
      ['EMP013', 'KPI', 'ความปลอดภัยในการทำงาน', 'อุบัติเหตุจากการทำงาน', 40, 0, 0, 'ครั้ง'],
      ['EMP014', 'KPI', 'ปิดงบรายเดือนตามกำหนด', 'จำนวนเดือนที่ปิดงบทันกำหนด', 50, 9, 9, 'เดือน'],
      ['EMP014', 'KPI', 'ความถูกต้องของรายการบัญชี', 'รายการที่ต้องแก้ไขย้อนหลัง', 50, 5, 3, 'รายการ'],
      ['EMP016', 'KPI', 'เวลาเฉลี่ยในการปิดตำแหน่ง', 'จำนวนวันเฉลี่ย', 50, 45, 38, 'วัน'],
      ['EMP016', 'KPI', 'อัตราผ่านทดลองงานของคนที่สรรหา', 'สัดส่วนผ่านทดลองงาน (%)', 50, 90, 95, '%']
    ];
    goalSet.forEach(function (r) {
      add('goals', { employeeId: emp[r[0]], cycle: YEAR + ' H2', framework: r[1], name: r[2], measure: r[3], weight: r[4], target: r[5], actual: r[6], unit: r[7] });
    });

    /* ---- ประเมิน 360 ---- */
    [['EMP008', 'EMP008', 'ประเมินตนเอง', 4, 4, 4, 3],
     ['EMP008', 'EMP003', 'หัวหน้า', 4.5, 4, 4.5, 3.5],
     ['EMP008', 'EMP009', 'เพื่อนร่วมงาน', 4, 4.5, 4, 3],
     ['EMP011', 'EMP011', 'ประเมินตนเอง', 4, 4, 4, 3],
     ['EMP011', 'EMP005', 'หัวหน้า', 4, 4.5, 4.5, 4],
     ['EMP011', 'EMP012', 'เพื่อนร่วมงาน', 4.5, 4, 4, 3.5],
     ['EMP010', 'EMP004', 'หัวหน้า', 4.5, 4.5, 4.5, 4],
     ['EMP010', 'EMP010', 'ประเมินตนเอง', 4, 4, 4.5, 3.5],
     ['EMP013', 'EMP007', 'หัวหน้า', 3.5, 3, 4, 2.5],
     ['EMP014', 'EMP006', 'หัวหน้า', 4, 4, 4, 3],
     ['EMP016', 'EMP002', 'หัวหน้า', 4.5, 4, 4.5, 4],
     ['EMP015', 'EMP007', 'หัวหน้า', 2.5, 3, 3, 2]]
      .forEach(function (r) {
        add('reviews', {
          employeeId: emp[r[0]], cycle: YEAR + ' H1', reviewerId: emp[r[1]], relation: r[2],
          scoreResult: r[3], scoreCompetency: r[4], scoreCulture: r[5], scoreLeadership: r[6],
          strength: 'รับผิดชอบงานได้ครบถ้วนและทำงานร่วมกับทีมได้ดี',
          improve: 'พัฒนาการวางแผนระยะยาวและการนำเสนอต่อผู้บริหาร',
          status: 'เสร็จสิ้น'
        });
      });

    /* ---- ทรัพย์สิน ---- */
    var assetKinds = [['โน้ตบุ๊ก Dell Latitude', 32000], ['โทรศัพท์มือถือบริษัท', 12000], ['บัตรพนักงาน (Keycard)', 200], ['ซิมการ์ดบริษัท', 0], ['เครื่องสแกนบาร์โค้ด', 8500]];
    D.employees.filter(function (e) { return e.status !== 'ลาออก'; }).forEach(function (e, i) {
      add('assets', {
        employeeId: e.id, name: assetKinds[i % 5][0], serial: 'AST-' + String(2600 + i),
        value: assetKinds[i % 5][1], issuedDate: e.hireDate, status: 'ถือครอง'
      });
      if (i % 3 === 0) add('assets', { employeeId: e.id, name: 'บัตรพนักงาน (Keycard)', serial: 'KC-' + String(500 + i), value: 200, issuedDate: e.hireDate, status: 'ถือครอง' });
    });
    D.employees.filter(function (e) { return e.status === 'ลาออก'; }).forEach(function (e, i) {
      add('assets', { employeeId: e.id, name: assetKinds[i % 5][0], serial: 'AST-' + String(2500 + i), value: assetKinds[i % 5][1], issuedDate: e.hireDate, returnedDate: e.terminationDate, status: i === 2 ? 'ค้างคืน' : 'คืนแล้ว' });
    });

    /* ---- หนังสือรับรองการหักภาษี 50 ทวิ ของปีภาษีที่แล้ว ---- */
    var lastTaxYear = YEAR - 1;
    D.employees.filter(function (e) {
      return e.status !== 'ลาออก' && e.status !== 'เลิกจ้าง' && e.hireDate < lastTaxYear + '-01-01';
    }).forEach(function (e, i) {
      var monthly = (e.salary || 0) + (e.positionAllowance || 0) + (e.otherAllowanceMonthly || 0);
      var income = HR.round2(monthly * 12);
      var ssoYear = Math.min(750, HR.round2(Math.min(Math.max(e.salary, 1650), 15000) * 0.05)) * 12;
      var pvdYear = HR.round2((e.salary || 0) * (e.pvdRate || 0) / 100 * 12);
      var expense = Math.min(income * 0.5, 100000);
      var kids = Number(e.children) || 0, kids2 = Number(e.childrenAfter2018) || 0;
      var allow = 60000 + (e.spouseNoIncome ? 60000 : 0) + Math.max(0, kids - kids2) * 30000 + kids2 * 60000
        + (Number(e.parents) || 0) * 30000 + Math.min(Number(e.lifeInsurance) || 0, 100000)
        + Math.min(ssoYear, 9000) + Math.min(pvdYear, 500000);
      var net = Math.max(0, HR.round2(income - expense - allow));
      var tax = 0, prev = 0;
      [[150000, 0], [300000, 5], [500000, 10], [750000, 15], [1000000, 20], [2000000, 25], [5000000, 30], [Infinity, 35]]
        .forEach(function (b) {
          if (net > prev) tax += (Math.min(net, b[0]) - prev) * b[1] / 100;
          prev = b[0];
        });
      var company = D.companies.filter(function (c) { return c.id === e.companyId; })[0] || {};
      add('wht50', {
        companyId: e.companyId, employeeId: e.id, taxYear: lastTaxYear,
        bookNo: String(lastTaxYear + 543).slice(2) + '/1', seq: String(i + 1),
        formType: 'ภ.ง.ด.1ก', months: 12,
        totalIncome: income, totalTax: HR.round2(tax),
        ssoTotal: HR.round2(ssoYear), pvdTotal: pvdYear, lifeInsurance: Number(e.lifeInsurance) || 0,
        issuedDate: YEAR + '-02-14', signerName: company.signerName, signerPosition: company.signerPosition,
        status: 'ออกแล้ว'
      });
    });

    D.settings.seeded = true;
    return D;

    function defaultChecklist(done) {
      var items = [
        'ส่งหนังสือแสดงเจตนาจ้าง (Offer Letter)',
        'กรอกแบบฟอร์มประวัติพนักงานออนไลน์',
        'อัปโหลดสำเนาบัตรประชาชนและทะเบียนบ้าน',
        'อัปโหลดวุฒิการศึกษาและใบรับรองการทำงาน',
        'ลงนามสัญญาจ้างอิเล็กทรอนิกส์',
        'แจ้งขึ้นทะเบียนผู้ประกันตน (สปส. 1-03)',
        'เปิดบัญชีเงินเดือนและแจ้งเลขบัญชี',
        'เตรียมอุปกรณ์ทำงานและบัญชีผู้ใช้ระบบ',
        'นัดวันปฐมนิเทศและแนะนำทีม',
        'มอบหมายพี่เลี้ยง 90 วันแรก'
      ];
      return items.map(function (t, i) { return { task: t, owner: i < 5 ? 'ฝ่ายทรัพยากรบุคคล' : i < 8 ? 'ฝ่ายสนับสนุน' : 'หัวหน้างาน', done: done ? i < done : false }; });
    }
  };

  /* ใช้ตอน seed ก่อนที่ข้อมูลจะเข้า HR.db */
  HR.nameOfRaw = function (D, table, id) {
    var r = (D[table] || []).filter(function (x) { return x.id === id; })[0];
    return r ? (r.name || r.title || r.code || '') : '';
  };
})(window.HR);
