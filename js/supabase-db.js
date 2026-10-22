/* supabase-db.js — โหมดออนไลน์: เก็บข้อมูลบน Supabase และล็อกอินด้วยรหัสพนักงาน
 *
 * โหลดข้อมูลที่ผู้ใช้มีสิทธิ์เห็นเข้าหน่วยความจำครั้งเดียวตอนเข้าระบบ
 * หน้าจอทุกหน้ายังเรียก HR.db แบบเดิม ส่วนการบันทึกจะส่งขึ้นฐานข้อมูลให้เบื้องหลัง
 * สิทธิ์จริงบังคับที่ Postgres (Row Level Security) ไม่ใช่ที่หน้าจอ
 */
(function (HR) {
  'use strict';

  var CFG = window.HR_SUPABASE || {};
  var SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  var MAIL = '@arena.local';

  var S = HR.sb = {
    enabled: !!(CFG.url && CFG.key),
    ready: false,
    client: null,
    uid: null,
    profile: null,
    queue: {},
    timer: null,
    writing: false,
    lastError: null
  };

  /** ตารางที่ผูกกับพนักงานรายคน — ใช้เติมคอลัมน์ employee_id ให้ RLS ตรวจได้ */
  var EMP_KEY = {
    employees: 'id', payslips: 'employeeId', wht50: 'employeeId', leaves: 'employeeId',
    otRequests: 'employeeId', expenses: 'employeeId', attendance: 'employeeId',
    roster: 'employeeId', leaveEntitlements: 'employeeId', goals: 'employeeId',
    reviews: 'employeeId', assets: 'employeeId', offboardings: 'employeeId',
    exitSurveys: 'employeeId', payAdjustments: 'employeeId'
  };
  function empIdOf(table, row) {
    var k = EMP_KEY[table];
    if (!k) return null;
    var v = k === 'id' ? row.id : row[k];
    return isUuid(v) ? v : null;
  }
  function coIdOf(table, row) {
    var d = HR.schema[table];
    if (d && d.companyField && isUuid(row[d.companyField])) return row[d.companyField];
    if (table === 'employees' && isUuid(row.companyId)) return row.companyId;
    return null;
  }
  function isUuid(v) {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  }
  HR.isUuid = isUuid;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('โหลดไลบรารี Supabase ไม่สำเร็จ')); };
      document.head.appendChild(s);
    });
  }

  S.init = function () {
    if (!S.enabled) return Promise.resolve(false);
    if (S.ready) return Promise.resolve(true);
    return loadScript(SDK).then(function () {
      S.client = window.supabase.createClient(CFG.url, CFG.key, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
      S.ready = true;
      return true;
    }).catch(function (e) {
      S.lastError = e.message;
      S.enabled = false;
      return false;
    });
  };

  /* ---------------- เข้าสู่ระบบ ---------------- */
  S.signIn = function (username, password) {
    return S.client.auth.signInWithPassword({
      email: String(username).trim().toLowerCase() + MAIL,
      password: password
    });
  };
  S.signOut = function () { return S.client.auth.signOut(); };
  S.session = function () { return S.client.auth.getSession(); };

  S.errorText = function (e) {
    var m = String((e && e.message) || '');
    if (/Invalid login credentials/i.test(m)) return 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง';
    if (/Email not confirmed/i.test(m)) return 'บัญชีนี้ยังไม่ถูกเปิดใช้งาน — แจ้ง HR';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ต (ถ้าเพิ่งไม่ได้ใช้นาน เซิร์ฟเวอร์อาจกำลังปลุกขึ้นมา รอ 1-2 นาทีแล้วลองใหม่)';
    return m || 'เข้าสู่ระบบไม่สำเร็จ';
  };

  /** อ่านโปรไฟล์ของผู้ใช้ที่ล็อกอินอยู่ */
  S.loadProfile = function () {
    return S.client.from('app_users').select('*').eq('id', S.uid).maybeSingle()
      .then(function (r) {
        if (r.error) throw r.error;
        if (!r.data) throw new Error('บัญชีนี้ยังไม่ได้ตั้งสิทธิ์ในระบบ — แจ้ง HR');
        if (r.data.active === false) throw new Error('บัญชีนี้ถูกปิดใช้งาน — แจ้ง HR');
        S.profile = r.data;
        return r.data;
      });
  };

  /* ---------------- โหลดข้อมูล ---------------- */
  S.loadAll = function () {
    var data = {};
    Object.keys(HR.schema).forEach(function (k) { data[k] = []; });
    data.settings = HR.defaultSettings();

    return S.client.from('records').select('id,table_name,data').limit(20000)
      .then(function (r) {
        if (r.error) throw r.error;
        (r.data || []).forEach(function (row) {
          if (row.table_name === 'settings') {
            data.settings = Object.assign(HR.defaultSettings(), row.data || {});
            data.settings.__id = row.id;
            return;
          }
          if (!data[row.table_name]) return;
          data[row.table_name].push(Object.assign({ id: row.id }, row.data));
        });
        return data;
      });
  };

  /* ---------------- บันทึกขึ้นฐานข้อมูล ---------------- */
  S.write = function (table, row) {
    if (!S.ready || !S.uid) return;
    S.queue[table + '/' + row.id] = { op: 'up', table: table, row: row };
    schedule();
  };
  S.erase = function (table, id) {
    if (!S.ready || !S.uid) return;
    S.queue[table + '/' + id] = { op: 'del', table: table, id: id };
    schedule();
  };
  S.writeSettings = function (settings) {
    if (!S.ready || !S.uid) return;
    S.queue.__settings = { op: 'settings', data: settings };
    schedule();
  };

  function schedule() {
    if (S.timer) clearTimeout(S.timer);
    S.timer = setTimeout(flush, 600);
  }

  function clean(o) {
    var out = {};
    Object.keys(o || {}).forEach(function (k) {
      if (k === 'id' || k === '__id') return;
      if (o[k] === undefined || typeof o[k] === 'function') return;
      out[k] = o[k];
    });
    return out;
  }

  function flush() {
    if (!S.ready || S.writing) return;
    var keys = Object.keys(S.queue);
    if (!keys.length) return;
    S.writing = true;
    HR.syncStatus && HR.syncStatus('saving');

    var jobs = keys.map(function (k) { return S.queue[k]; });
    var ups = jobs.filter(function (j) { return j.op === 'up'; }).map(function (j) {
      return {
        id: j.row.id, table_name: j.table,
        company_id: coIdOf(j.table, j.row), employee_id: empIdOf(j.table, j.row),
        data: clean(j.row)
      };
    });
    var dels = jobs.filter(function (j) { return j.op === 'del'; });
    var st = jobs.filter(function (j) { return j.op === 'settings'; })[0];

    var steps = [];
    if (ups.length) steps.push(S.client.from('records').upsert(ups, { onConflict: 'id' }));
    dels.forEach(function (d) { steps.push(S.client.from('records').delete().eq('id', d.id)); });
    if (st) {
      var sid = (HR.db.data.settings && HR.db.data.settings.__id) || null;
      steps.push(sid
        ? S.client.from('records').update({ data: clean(st.data) }).eq('id', sid)
        : S.client.from('records').insert({ table_name: 'settings', data: clean(st.data) }));
    }

    Promise.all(steps).then(function (res) {
      var bad = res.filter(function (r) { return r && r.error; });
      S.writing = false;
      if (bad.length) {
        S.lastError = bad[0].error.message;
        HR.syncStatus && HR.syncStatus('error', S.lastError);
        HR.toast('บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ: ' + S.lastError, 'err');
        return;
      }
      keys.forEach(function (k) { delete S.queue[k]; });
      HR.syncStatus && HR.syncStatus('saved');
      if (Object.keys(S.queue).length) schedule();
    }).catch(function (e) {
      S.writing = false;
      S.lastError = e.message;
      HR.syncStatus && HR.syncStatus('error', e.message);
      HR.toast('บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ: ' + e.message, 'err');
    });
  }
  S.flushNow = flush;
  S.pending = function () { return Object.keys(S.queue).length; };

  /* ---------------- แปลงรหัสเดิมให้เป็น UUID ก่อนย้ายขึ้นเซิร์ฟเวอร์ ---------------- */
  /** ข้อมูลเดิมใช้รหัสแบบ emp_xxxx ซึ่งฐานข้อมูลไม่รับ จึงต้องแปลงทั้งชุดพร้อมอ้างอิง */
  S.toUuidData = function (src) {
    var map = {};
    Object.keys(HR.schema).forEach(function (t) {
      (src[t] || []).forEach(function (r) {
        if (r.id && !isUuid(r.id)) map[r.id] = crypto.randomUUID();
      });
    });
    function conv(v) {
      if (typeof v === 'string') return map[v] || v;
      if (Array.isArray(v)) return v.map(conv);
      if (v && typeof v === 'object') {
        var o = {};
        Object.keys(v).forEach(function (k) { o[k] = conv(v[k]); });
        return o;
      }
      return v;
    }
    var out = { settings: src.settings };
    Object.keys(HR.schema).forEach(function (t) {
      out[t] = (src[t] || []).map(function (r) {
        var n = conv(r);
        n.id = map[r.id] || r.id;
        return n;
      });
    });
    return { data: out, converted: Object.keys(map).length };
  };

  /* ---------------- ย้ายข้อมูลขึ้นเซิร์ฟเวอร์ครั้งแรก ---------------- */
  S.uploadAll = function (data, onProgress) {
    var rows = [];
    Object.keys(HR.schema).forEach(function (name) {
      (data[name] || []).forEach(function (row) {
        if (!isUuid(row.id)) return;      /* ต้องเป็น uuid เท่านั้น */
        rows.push({
          id: row.id, table_name: name,
          company_id: coIdOf(name, row), employee_id: empIdOf(name, row),
          data: clean(row)
        });
      });
    });
    var done = 0;
    function step(i) {
      if (i >= rows.length) {
        return S.client.from('records')
          .insert({ table_name: 'settings', data: clean(data.settings || {}) })
          .then(function () { return rows.length; });
      }
      var chunk = rows.slice(i, i + 300);
      return S.client.from('records').upsert(chunk, { onConflict: 'id' }).then(function (r) {
        if (r.error) throw r.error;
        done += chunk.length;
        if (onProgress) onProgress(done, rows.length);
        return step(i + 300);
      });
    }
    return step(0);
  };

  /** HR ตั้งบัญชี/รหัสผ่านให้ผู้ใช้คนอื่น (ตรวจสิทธิ์ที่เซิร์ฟเวอร์) */
  S.setLogin = function (username, password, role, employeeId, companyId) {
    return S.client.rpc('hr_set_login', {
      p_username: username, p_password: password, p_role: role,
      p_employee: employeeId || null, p_company: companyId || null
    });
  };
  S.listUsers = function () {
    return S.client.from('app_users').select('*').order('username');
  };
  S.updateUser = function (id, patch) {
    return S.client.from('app_users').update(patch).eq('id', id);
  };
  S.changeMyPassword = function (newPass) {
    return S.client.auth.updateUser({ password: newPass });
  };
})(window.HR);
