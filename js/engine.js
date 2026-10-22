/* engine.js — เครื่องคำนวณ: เวลา/OT/เบี้ยขยัน, เงินเดือน, ประกันสังคม, ภาษีหัก ณ ที่จ่าย, PVD, ค่าชดเชย */
(function (HR) {
  'use strict';

  /** จำนวนเงินเป็นตัวอักษรไทย — ใช้ในหนังสือรับรองการหักภาษี 50 ทวิ */
  HR.bahtText = function (amount) {
    var n = Math.abs(HR.round2(amount));
    var baht = Math.floor(n), satang = Math.round((n - baht) * 100);
    var digit = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
    var unit = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];
    function readGroup(s) {
      var out = '', len = s.length;
      for (var i = 0; i < len; i++) {
        var d = Number(s[i]), pos = len - i - 1;
        if (!d) continue;
        if (pos === 1 && d === 1) out += 'สิบ';
        else if (pos === 1 && d === 2) out += 'ยี่สิบ';
        else if (pos === 0 && d === 1 && len > 1) out += 'เอ็ด';
        else out += digit[d] + unit[pos];
      }
      return out;
    }
    function read(num) {
      if (num === 0) return 'ศูนย์';
      var s = String(num), out = '';
      while (s.length > 6) {
        out += readGroup(s.slice(0, s.length - 6)) + 'ล้าน';
        s = s.slice(s.length - 6);
      }
      return out + readGroup(s);
    }
    var txt = (amount < 0 ? 'ลบ' : '') + read(baht) + 'บาท';
    txt += satang ? read(satang) + 'สตางค์' : 'ถ้วน';
    return txt;
  };

  HR.defaultSettings = function () {
    return {
      autoSaveFile: true,
      workDaysPerMonth: 26,
      workHoursPerDay: 8,
      shiftGraceMinutes: 10,
      otWorkday: 1.5,
      otHoliday: 2,
      otHolidayExtra: 3,
      diligenceAmount: 800,
      diligenceMaxLateCount: 0,
      ssoRate: 5,
      ssoMinWage: 1650,
      ssoMaxWage: 15000,
      ssoMaxContribution: 750,
      pvdEmployerRate: 5,
      taxExpenseRate: 50,
      taxExpenseCap: 100000,
      allowancePersonal: 60000,
      allowanceSpouse: 60000,
      allowanceChild: 30000,
      allowanceChild2nd: 60000,
      allowanceParent: 30000,
      ssoDeductCap: 9000,
      pvdDeductCap: 500000,
      lifeInsuranceCap: 100000,
      probationDays: 119
    };
  };

  var TAX_BRACKETS = [
    { upTo: 150000, rate: 0 },
    { upTo: 300000, rate: 5 },
    { upTo: 500000, rate: 10 },
    { upTo: 750000, rate: 15 },
    { upTo: 1000000, rate: 20 },
    { upTo: 2000000, rate: 25 },
    { upTo: 5000000, rate: 30 },
    { upTo: Infinity, rate: 35 }
  ];
  HR.TAX_BRACKETS = TAX_BRACKETS;

  var E = HR.engine = {

    /* ---------- อัตราค่าจ้าง ---------- */
    dailyRate: function (salary) { return (Number(salary) || 0) / HR.S().workDaysPerMonth; },
    hourlyRate: function (salary) { return E.dailyRate(salary) / HR.S().workHoursPerDay; },

    otMultiplier: function (type) {
      var s = HR.S();
      return type === 'OT วันหยุด' ? s.otHoliday : type === 'OT วันหยุดเกินเวลา' ? s.otHolidayExtra : s.otWorkday;
    },
    otAmount: function (salary, hours, type) {
      return HR.round2(E.hourlyRate(salary) * E.otMultiplier(type) * (Number(hours) || 0));
    },

    /* ---------- ประกันสังคม ---------- */
    sso: function (wage) {
      var s = HR.S();
      var base = Math.min(Math.max(Number(wage) || 0, s.ssoMinWage), s.ssoMaxWage);
      if (!wage) return 0;
      return Math.min(HR.round2(base * s.ssoRate / 100), s.ssoMaxContribution);
    },

    /* ---------- กองทุนสำรองเลี้ยงชีพ ---------- */
    pvdEmployee: function (salary, rate) { return HR.round2((Number(salary) || 0) * (Number(rate) || 0) / 100); },
    pvdEmployer: function (salary, rate) { return HR.round2((Number(salary) || 0) * (rate == null ? HR.S().pvdEmployerRate : rate) / 100); },

    /* ---------- ภาษี ---------- */
    taxFromNet: function (net) {
      var tax = 0, prev = 0;
      for (var i = 0; i < TAX_BRACKETS.length; i++) {
        var b = TAX_BRACKETS[i];
        if (net > prev) tax += (Math.min(net, b.upTo) - prev) * b.rate / 100;
        prev = b.upTo;
        if (net <= b.upTo) break;
      }
      return HR.round2(tax);
    },
    taxBreakdown: function (net) {
      var out = [], prev = 0;
      TAX_BRACKETS.forEach(function (b) {
        var portion = Math.max(0, Math.min(net, b.upTo) - prev);
        if (portion > 0) out.push({ band: HR.num(prev + 1, 0) + ' – ' + (b.upTo === Infinity ? 'ขึ้นไป' : HR.num(b.upTo, 0)), rate: b.rate, base: portion, tax: HR.round2(portion * b.rate / 100) });
        prev = b.upTo;
      });
      return out;
    },

    /** ประมาณภาษีทั้งปีและภาษีหัก ณ ที่จ่ายรายเดือน (วิธีคำนวณจากเงินได้ทั้งปี) */
    withholding: function (emp, monthlyTaxable, extras) {
      var s = HR.S();
      extras = extras || {};
      var annualIncome = HR.round2((Number(monthlyTaxable) || 0) * 12 + (Number(extras.bonus) || 0));
      var expense = Math.min(annualIncome * s.taxExpenseRate / 100, s.taxExpenseCap);
      var ssoAnnual = Math.min(E.sso(emp.salary) * 12, s.ssoDeductCap);
      var pvdAnnual = Math.min((Number(emp.salary) || 0) * (Number(emp.pvdRate) || 0) / 100 * 12, s.pvdDeductCap);
      var kids = Number(emp.children) || 0, kids2 = Number(emp.childrenAfter2018) || 0;
      var allow = s.allowancePersonal
        + (emp.spouseNoIncome ? s.allowanceSpouse : 0)
        + Math.max(0, kids - kids2) * s.allowanceChild
        + kids2 * s.allowanceChild2nd
        + (Number(emp.parents) || 0) * s.allowanceParent
        + Math.min(Number(emp.lifeInsurance) || 0, s.lifeInsuranceCap)
        + (Number(emp.otherAllowance) || 0)
        + ssoAnnual + pvdAnnual;
      var net = Math.max(0, HR.round2(annualIncome - expense - allow));
      var annualTax = E.taxFromNet(net);
      return {
        annualIncome: annualIncome, expense: HR.round2(expense), allowance: HR.round2(allow),
        ssoAnnual: HR.round2(ssoAnnual), pvdAnnual: HR.round2(pvdAnnual),
        netIncome: net, annualTax: annualTax, monthlyTax: HR.round2(annualTax / 12)
      };
    },

    /* ---------- สรุปเวลาทำงานรายเดือน ---------- */
    attendanceSummary: function (empId, ym) {
      var s = HR.S();
      var recs = HR.db.t('attendance').filter(function (r) { return r.employeeId === empId && String(r.date).slice(0, 7) === ym; });
      var lateCount = 0, lateMinutes = 0, earlyMinutes = 0, absentDays = 0, workedDays = 0, otHours = {}, otTotal = 0;
      recs.forEach(function (r) {
        if (r.status === 'ขาดงาน') { absentDays++; return; }
        if (r.status === 'ลา') return;
        workedDays++;
        var late = Number(r.lateMinutes) || 0;
        if (late > s.shiftGraceMinutes) { lateCount++; lateMinutes += late; }
        earlyMinutes += Number(r.earlyLeaveMinutes) || 0;
        var h = Number(r.otHours) || 0;
        if (h > 0) { var t = r.otType || 'OT วันทำงาน'; otHours[t] = (otHours[t] || 0) + h; otTotal += h; }
      });
      var leaves = HR.db.t('leaves').filter(function (l) {
        return l.employeeId === empId && l.status === 'อนุมัติ' && String(l.dateFrom).slice(0, 7) === ym;
      });
      var unpaidDays = HR.sum(leaves.filter(function (l) {
        var lt = HR.db.byId('leaveTypes', l.leaveTypeId);
        return lt && lt.paid === false;
      }), function (l) { return l.days; });
      var paidLeaveDays = HR.sum(leaves, function (l) { return l.days; }) - unpaidDays;
      return {
        records: recs.length, workedDays: workedDays, absentDays: absentDays,
        lateCount: lateCount, lateMinutes: lateMinutes, earlyMinutes: earlyMinutes,
        otHours: otHours, otTotalHours: HR.round2(otTotal),
        unpaidLeaveDays: unpaidDays, paidLeaveDays: paidLeaveDays,
        diligenceEligible: lateCount <= s.diligenceMaxLateCount && absentDays === 0 && unpaidDays === 0 && recs.length > 0
      };
    },

    /* ---------- คำนวณเงินเดือน 1 คน 1 รอบ ---------- */
    payslip: function (emp, period) {
      var s = HR.S(), ym = period.period;
      var att = E.attendanceSummary(emp.id, ym);
      var daily = E.dailyRate(emp.salary), hourly = E.hourlyRate(emp.salary);
      var earnings = [], deductions = [];

      earnings.push({ name: 'เงินเดือน', amount: HR.round2(emp.salary) });
      if (emp.positionAllowance) earnings.push({ name: 'ค่าตำแหน่ง', amount: HR.round2(emp.positionAllowance) });
      if (emp.otherAllowanceMonthly) earnings.push({ name: 'ค่าครองชีพ/เบี้ยเลี้ยง', amount: HR.round2(emp.otherAllowanceMonthly) });

      Object.keys(att.otHours).forEach(function (t) {
        earnings.push({
          name: t + ' (' + HR.num(att.otHours[t], 1) + ' ชม. × ' + E.otMultiplier(t) + ')',
          amount: E.otAmount(emp.salary, att.otHours[t], t), ot: true
        });
      });
      if (att.diligenceEligible && s.diligenceAmount) earnings.push({ name: 'เบี้ยขยัน', amount: HR.round2(s.diligenceAmount) });

      HR.db.t('payAdjustments').filter(function (a) { return a.periodId === period.id && a.employeeId === emp.id; })
        .forEach(function (a) {
          (a.kind === 'รายได้' ? earnings : deductions).push({ name: a.name, amount: HR.round2(a.amount), taxable: a.taxable !== false, adj: true });
        });

      if (att.absentDays) deductions.push({ name: 'ขาดงาน ' + att.absentDays + ' วัน', amount: HR.round2(daily * att.absentDays) });
      if (att.unpaidLeaveDays) deductions.push({ name: 'ลาไม่รับค่าจ้าง ' + HR.num(att.unpaidLeaveDays, 1) + ' วัน', amount: HR.round2(daily * att.unpaidLeaveDays) });
      if (att.lateMinutes) deductions.push({ name: 'มาสาย ' + att.lateMinutes + ' นาที', amount: HR.round2(hourly * att.lateMinutes / 60) });
      if (att.earlyMinutes) deductions.push({ name: 'ออกก่อนเวลา ' + att.earlyMinutes + ' นาที', amount: HR.round2(hourly * att.earlyMinutes / 60) });

      var gross = HR.round2(HR.sum(earnings, function (e) { return e.amount; }));
      var preDeduct = HR.round2(HR.sum(deductions, function (d) { return d.amount; }));
      var taxableBase = HR.round2(gross - preDeduct);

      var sso = emp.ssoMember === false ? 0 : E.sso(taxableBase);
      var pvdEmp = E.pvdEmployee(emp.salary, emp.pvdRate);
      var pvdCom = emp.pvdRate ? E.pvdEmployer(emp.salary, null) : 0;

      var monthlyRegular = HR.round2((Number(emp.salary) || 0) + (Number(emp.positionAllowance) || 0) + (Number(emp.otherAllowanceMonthly) || 0));
      var wht = E.withholding(emp, monthlyRegular, { bonus: HR.sum(earnings.filter(function (e) { return e.adj && e.taxable; }), function (e) { return e.amount; }) });
      var tax = Math.max(0, wht.monthlyTax);

      if (sso) deductions.push({ name: 'ประกันสังคม (' + s.ssoRate + '%)', amount: sso, statutory: true });
      if (pvdEmp) deductions.push({ name: 'กองทุนสำรองเลี้ยงชีพ (' + emp.pvdRate + '%)', amount: pvdEmp, statutory: true });
      if (tax) deductions.push({ name: 'ภาษีหัก ณ ที่จ่าย', amount: tax, statutory: true });

      var totalDeduct = HR.round2(HR.sum(deductions, function (d) { return d.amount; }));
      return {
        employeeId: emp.id, periodId: period.id, period: ym,
        earnings: earnings, deductions: deductions,
        gross: gross, taxableBase: taxableBase,
        sso: sso, ssoEmployer: sso, pvdEmployee: pvdEmp, pvdEmployer: pvdCom,
        tax: tax, totalDeduction: totalDeduct,
        net: HR.round2(gross - totalDeduct),
        attendance: att, taxDetail: wht,
        laborCost: HR.round2(gross + sso + pvdCom)
      };
    },

    /* ---------- ค่าชดเชยตามกฎหมายแรงงาน ---------- */
    severanceDays: function (years) {
      if (years >= 20) return 400;
      if (years >= 10) return 300;
      if (years >= 6) return 240;
      if (years >= 3) return 180;
      if (years >= 1) return 90;
      if (years >= 120 / 365) return 30;
      return 0;
    },
    severance: function (emp, lastDay, reason) {
      var years = HR.yearsBetween(emp.hireDate, lastDay);
      var daily = E.dailyRate(emp.salary);
      var eligible = ['เลิกจ้าง', 'ปรับโครงสร้างองค์กร', 'ครบสัญญาจ้าง'].indexOf(reason) > -1;
      var days = eligible ? E.severanceDays(years) : 0;
      var vacBalance = E.leaveBalance(emp.id, 'ลาพักร้อน');
      return {
        years: years, days: days, dailyRate: HR.round2(daily),
        severance: HR.round2(days * daily),
        unusedLeaveDays: vacBalance.remaining,
        unusedLeavePay: HR.round2(vacBalance.remaining * daily),
        noticePay: eligible ? HR.round2(daily * 30) : 0,
        eligible: eligible,
        note: eligible ? 'คิดตาม พ.ร.บ.คุ้มครองแรงงาน มาตรา 118' : 'ลาออกเอง/เลิกจ้างด้วยเหตุร้ายแรง ไม่มีสิทธิค่าชดเชย'
      };
    },

    /* ---------- สิทธิวันลา ---------- */
    leaveBalance: function (empId, leaveTypeName) {
      var lt = HR.db.t('leaveTypes').filter(function (t) { return t.name === leaveTypeName; })[0];
      if (!lt) return { entitled: 0, used: 0, remaining: 0 };
      var emp = HR.db.byId('employees', empId) || {};
      var yrs = HR.yearsBetween(emp.hireDate);
      var entitled = Number(lt.days) || 0;
      if (lt.proRateFirstYear && yrs < 1) entitled = Math.floor(entitled * yrs * 10) / 10;
      var extra = HR.db.t('leaveEntitlements').filter(function (e) { return e.employeeId === empId && e.leaveTypeId === lt.id; })[0];
      if (extra && extra.days != null) entitled = Number(extra.days);
      var yr = String(new Date().getFullYear());
      var used = HR.sum(HR.db.t('leaves').filter(function (l) {
        return l.employeeId === empId && l.leaveTypeId === lt.id && l.status === 'อนุมัติ' && String(l.dateFrom).slice(0, 4) === yr;
      }), function (l) { return l.days; });
      return { type: lt, entitled: entitled, used: HR.round2(used), remaining: HR.round2(entitled - used) };
    },

    /* ---------- คะแนนคัดกรองเรซูเม่ ---------- */
    screenResume: function (applicant, job) {
      if (!job) return 0;
      var kw = String(job.keywords || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      var hay = [applicant.skills, applicant.education, applicant.lastPosition, applicant.notes].join(' ').toLowerCase();
      var hit = kw.filter(function (k) { return hay.indexOf(k) > -1; }).length;
      var kwScore = kw.length ? hit / kw.length * 60 : 30;
      var expScore = Math.min(Number(applicant.experienceYears) || 0, Number(job.minExperience) || 3) / Math.max(1, Number(job.minExperience) || 3) * 25;
      var salaryFit = 15;
      if (job.salaryMax && applicant.expectedSalary) salaryFit = applicant.expectedSalary <= job.salaryMax ? 15 : applicant.expectedSalary <= job.salaryMax * 1.15 ? 8 : 0;
      return Math.round(kwScore + expScore + salaryFit);
    },

    /* ---------- รูปแบบการทำงานรายบุคคล ---------- */
    /** วันนี้เป็นวันหยุดประจำสัปดาห์ของพนักงานคนนี้หรือไม่ */
    isOffDay: function (emp, isoDate) {
      var DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
      var dow = new Date(isoDate).getDay();
      var name = DOW[dow];
      var offs = emp.offDays || [];
      var pattern = emp.workPattern || 'หยุดประจำสัปดาห์';

      if (pattern === 'กะหมุนเวียน (ลงเอง)') return false;
      if (offs.indexOf(name) > -1) {
        /* เสาร์เว้นเสาร์: วันเสาร์หยุดเฉพาะสัปดาห์ที่ตรงกับวันอ้างอิง */
        if (pattern === 'เสาร์เว้นเสาร์' && dow === 6 && emp.altRefDate) {
          var diff = Math.round((new Date(isoDate) - new Date(emp.altRefDate)) / 864e5);
          return ((diff / 7) % 2 + 2) % 2 === 0;
        }
        return true;
      }
      return false;
    },

    /** รหัสกะที่ควรลงให้พนักงานในวันนั้นตามรูปแบบการทำงาน (คืน shiftId หรือ null) */
    plannedShift: function (emp, isoDate, codes) {
      var isHoliday = HR.db.t('holidays').some(function (h) { return h.date === isoDate; });
      if (isHoliday && codes.holiday) return codes.holiday;
      if (E.isOffDay(emp, isoDate) && codes.weeklyOff) return codes.weeklyOff;
      return emp.defaultShiftId || null;
    },

    /** คำอธิบายรูปแบบการทำงานแบบอ่านง่าย */
    patternText: function (emp) {
      var offs = (emp.offDays || []).map(function (d) { return 'วัน' + d; });
      var p = emp.workPattern || 'หยุดประจำสัปดาห์';
      if (p === 'กะหมุนเวียน (ลงเอง)') return 'กะหมุนเวียน — ลงตารางกะเอง';
      if (!offs.length) return 'ยังไม่ได้กำหนดวันหยุด';
      if (p === 'เสาร์เว้นเสาร์') {
        return 'หยุด ' + offs.join(' และ ') + ' แบบเสาร์เว้นเสาร์' +
          (emp.altRefDate ? ' (อ้างอิงเสาร์ที่หยุด ' + HR.date(emp.altRefDate) + ')' : ' — ยังไม่ได้ระบุเสาร์อ้างอิง');
      }
      return 'หยุด ' + offs.join(' และ ') + ' ทุกสัปดาห์';
    },

    /* ---------- สรุปเงินได้ทั้งปีของพนักงาน 1 คน (ใช้ออก 50 ทวิ และ ภ.ง.ด.1ก) ---------- */
    yearSummary: function (empId, taxYear) {
      var slips = HR.db.t('payslips').filter(function (s) {
        return s.employeeId === empId && String(s.period).slice(0, 4) === String(taxYear);
      });
      var emp = HR.db.byId('employees', empId) || {};
      return {
        months: slips.length,
        periods: slips.map(function (s) { return s.period; }).sort(),
        totalIncome: HR.round2(HR.sum(slips, function (s) { return s.gross; })),
        totalTax: HR.round2(HR.sum(slips, function (s) { return s.tax; })),
        ssoTotal: HR.round2(HR.sum(slips, function (s) { return s.sso; })),
        pvdTotal: HR.round2(HR.sum(slips, function (s) { return s.pvdEmployee; })),
        lifeInsurance: Number(emp.lifeInsurance) || 0,
        lastPayDate: slips.length ? slips.map(function (s) {
          var p = HR.db.byId('payPeriods', s.periodId);
          return p ? p.payDate : s.period + '-25';
        }).sort().pop() : null
      };
    },

    /* ---------- อัตราการลาออก ---------- */
    turnover: function (ym) {
      var emps = HR.db.t('employees');
      var leavers = emps.filter(function (e) { return e.terminationDate && String(e.terminationDate).slice(0, 7) === ym; }).length;
      var active = emps.filter(function (e) {
        var started = e.hireDate && String(e.hireDate).slice(0, 7) <= ym;
        var left = e.terminationDate && String(e.terminationDate).slice(0, 7) < ym;
        return started && !left;
      }).length;
      return { leavers: leavers, headcount: active, rate: active ? HR.round2(leavers / active * 100) : 0 };
    }
  };
})(window.HR);
