/* core.js — storage, DOM helpers, router, table + form builders, charts */
window.HR = window.HR || {};
(function (HR) {
  'use strict';

  /* ============ สภาพแวดล้อมที่รันอยู่ ============ */
  /* เวอร์ชันออนไลน์ (Artifact) รันในกรอบ sandbox ที่เขียนไฟล์และดาวน์โหลดไม่ได้ */
  HR.env = (function () {
    var framed = false;
    try { framed = window.self !== window.top; } catch (e) { framed = true; }
    return {
      framed: framed,
      canDownload: !framed,
      canUseFiles: !framed && typeof window.showSaveFilePicker === 'function'
    };
  })();

  /* ============ small utils ============ */
  HR.uid = function (p) {
    /* โหมดออนไลน์ใช้ UUID เพราะฐานข้อมูลบังคับชนิดนี้ */
    if (HR.sb && HR.sb.enabled && window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };
  HR.num = function (n, d) {
    n = Number(n);
    if (!isFinite(n)) return '-';
    return n.toLocaleString('en-US', { minimumFractionDigits: d == null ? 0 : d, maximumFractionDigits: d == null ? 0 : d });
  };
  HR.money = function (n) { return HR.num(n, 2); };
  HR.round2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };
  HR.pct = function (n, d) { return HR.num(n, d == null ? 1 : d) + '%'; };
  /* วันที่ท้องถิ่นเสมอ — toISOString() จะเลื่อนวันเมื่อเขตเวลาไม่ใช่ UTC */
  HR.isoOf = function (d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  HR.ymOf = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  HR.addDays = function (iso, n) { var d = new Date(iso); d.setDate(d.getDate() + n); return HR.isoOf(d); };
  HR.today = function () { return HR.isoOf(new Date()); };
  HR.thisMonth = function () { return HR.ymOf(new Date()); };
  HR.date = function (iso) {
    if (!iso) return '-';
    var p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  };
  HR.dateTH = function (iso) {
    if (!iso) return '-';
    var p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return iso;
    var m = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return Number(p[2]) + ' ' + m[Number(p[1]) - 1] + ' ' + (Number(p[0]) + 543);
  };
  HR.monthName = function (ym) {
    if (!ym) return '-';
    var p = String(ym).slice(0, 7).split('-');
    var m = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    return m[Number(p[1]) - 1] + ' ' + (Number(p[0]) + 543);
  };
  HR.yearsBetween = function (fromISO, toISO) {
    if (!fromISO) return 0;
    var a = new Date(fromISO), b = toISO ? new Date(toISO) : new Date();
    return Math.max(0, (b - a) / (365.25 * 864e5));
  };
  HR.daysBetween = function (fromISO, toISO) {
    if (!fromISO || !toISO) return 0;
    return Math.round((new Date(toISO) - new Date(fromISO)) / 864e5) + 1;
  };
  HR.age = function (dob) { return dob ? Math.floor(HR.yearsBetween(dob)) : null; };
  HR.minutes = function (hhmm) {
    if (!hhmm) return null;
    var p = String(hhmm).split(':');
    return Number(p[0]) * 60 + Number(p[1] || 0);
  };
  HR.hhmm = function (mins) {
    if (mins == null) return '-';
    var s = mins < 0 ? '-' : '', m = Math.abs(Math.round(mins));
    return s + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
  HR.sum = function (arr, fn) { return (arr || []).reduce(function (a, b) { return a + (Number(fn ? fn(b) : b) || 0); }, 0); };
  HR.groupBy = function (arr, fn) {
    var o = {};
    (arr || []).forEach(function (r) { var k = fn(r); (o[k] = o[k] || []).push(r); });
    return o;
  };
  HR.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ============ DOM ============ */
  function el(tag, attrs, kids) {
    var parts = String(tag).split(/(?=[.#])/), node = document.createElement(parts[0] || 'div');
    parts.slice(1).forEach(function (p) {
      if (p[0] === '.') node.classList.add(p.slice(1));
      else if (p[0] === '#') node.id = p.slice(1);
    });
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids = attrs; attrs = null; }
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') node.className += (node.className ? ' ' : '') + v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'value') node.value = v;
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    });
    (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return node;
  }
  HR.el = el;
  HR.frag = function (kids) {
    var f = document.createDocumentFragment();
    (kids || []).forEach(function (c) { if (c) f.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); });
    return f;
  };
  HR.clear = function (node) { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  /* ============ storage ============ */
  HR.db = {
    KEY: 'hrms.v1',
    data: null,
    load: function () {
      try {
        var raw = localStorage.getItem(this.KEY);
        this.data = raw ? JSON.parse(raw) : null;
      } catch (e) { this.data = null; }
      return this.data;
    },
    /** บันทึกสำเนากันลืมไว้ในเบราว์เซอร์เสมอ และแจ้งแฟ้มข้อมูล Excel ว่ามีการแก้ไข */
    _settingsHash: null,
    save: function () {
      try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {}
      if (HR.file && HR.file.markDirty) HR.file.markDirty();
      if (HR.sb && HR.sb.ready && this.data && this.data.settings) {
        var h = JSON.stringify(this.data.settings);
        if (h !== this._settingsHash) { this._settingsHash = h; HR.sb.writeSettings(this.data.settings); }
      }
    },
    _push: function (name, row) { if (HR.sb && HR.sb.ready) HR.sb.write(name, row); },
    _drop: function (name, id) { if (HR.sb && HR.sb.ready) HR.sb.erase(name, id); },
    t: function (name) {
      if (!this.data) this.data = {};
      if (!Array.isArray(this.data[name])) this.data[name] = [];
      return this.data[name];
    },
    byId: function (name, id) { return this.t(name).filter(function (r) { return r.id === id; })[0] || null; },
    where: function (name, fn) { return this.t(name).filter(fn); },
    insert: function (name, row) {
      row.id = row.id || HR.uid(name.slice(0, 3));
      row._created = new Date().toISOString();
      this.t(name).push(row); this.save(); this._push(name, row); return row;
    },
    update: function (name, id, patch) {
      var r = this.byId(name, id);
      if (r) { Object.assign(r, patch); r._updated = new Date().toISOString(); this.save(); this._push(name, r); }
      return r;
    },
    upsert: function (name, row) { return row.id && this.byId(name, row.id) ? this.update(name, row.id, row) : this.insert(name, row); },
    remove: function (name, id) {
      var t = this.t(name), i = t.findIndex(function (r) { return r.id === id; });
      if (i > -1) { t.splice(i, 1); this.save(); this._drop(name, id); }
    },
    set: function (name, rows) {
      this.data[name] = rows; this.save();
      var self = this;
      rows.forEach(function (r) { self._push(name, r); });
    },
    wipe: function () { try { localStorage.removeItem(this.KEY); } catch (e) {} this.data = null; }
  };
  HR.S = function () { return HR.db.data.settings; };

  /* ============ toast / modal ============ */
  HR.toast = function (msg, kind) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var t = el('div.toast' + (kind === 'err' ? '.err' : kind === 'warn' ? '.warn' : ''), { text: msg });
    host.appendChild(t);
    setTimeout(function () { t.remove(); }, kind === 'err' ? 7000 : 3800);
  };

  HR.modal = function (opt) {
    var host = document.getElementById('modalHost');
    HR.clear(host); host.hidden = false;
    var closed = false;
    function close() { if (closed) return; closed = true; host.hidden = true; HR.clear(host); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    var foot = el('div.modal-foot');
    (opt.buttons || []).forEach(function (b) {
      foot.appendChild(el('button.btn' + (b.cls ? '.' + b.cls : ''), {
        type: 'button',
        onclick: function () { if (!b.fn || b.fn(close) !== false) { if (!b.keepOpen) close(); } }
      }, b.label));
    });
    if (!opt.buttons) foot.appendChild(el('button.btn', { type: 'button', onclick: close }, 'ปิด'));

    var box = el('div.modal' + (opt.size ? '.' + opt.size : ''), [
      el('div.modal-head', [
        el('h3', opt.title || ''),
        el('button.icon-btn', { type: 'button', 'aria-label': 'ปิด', onclick: close }, '✕')
      ]),
      el('div.modal-body', [opt.body || '']),
      foot
    ]);
    host.appendChild(box);
    host.onclick = function (e) { if (e.target === host) close(); };
    var f = box.querySelector('input,select,textarea,button.btn-primary');
    if (f) setTimeout(function () { try { f.focus(); } catch (e) {} }, 30);
    return close;
  };

  HR.confirm = function (msg, okLabel) {
    return new Promise(function (res) {
      HR.modal({
        title: 'ยืนยันการทำรายการ', size: 'narrow',
        body: el('p', { text: msg, style: 'margin:0' }),
        buttons: [
          { label: 'ยกเลิก', fn: function () { res(false); } },
          { label: okLabel || 'ยืนยัน', cls: 'btn-danger', fn: function () { res(true); } }
        ]
      });
    });
  };

  /* ============ router ============ */
  HR.views = {};
  HR.nav = [];
  HR.view = function (id, def) { HR.views[id] = def; return def; };
  HR.go = function (id) { location.hash = '#' + id; };
  HR.current = null;

  HR.render = function () {
    var id = (location.hash || '#dashboard').slice(1).split('?')[0] || 'dashboard';
    var q = (location.hash.split('?')[1] || '');
    var params = {};
    q.split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); params[p[0]] = decodeURIComponent(p[1] || ''); });
    var def = HR.views[id];
    var home = HR.homeOf ? HR.homeOf(HR.myRole()) : 'dashboard';
    if (!def) { id = home; def = HR.views[id]; }
    if (HR.canView && !HR.canView(id)) {
      HR.toast('บัญชีของคุณไม่มีสิทธิ์เข้าถึงหน้า "' + (def.title || id) + '"', 'err');
      id = home; def = HR.views[id];
      location.replace('#' + id);
    }
    HR.current = id;
    var app = HR.clear(document.getElementById('app'));
    document.querySelectorAll('#nav a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + id); });
    var group = '';
    HR.nav.forEach(function (g) { (g.items || []).forEach(function (it) { if (it.id === id) group = g.title; }); });
    document.getElementById('crumb').innerHTML =
      (group ? HR.esc(group) + ' <span class="dim">/</span> ' : '') + '<b>' + HR.esc(def.title || id) + '</b>';
    try {
      if (HR.banner) { var b = HR.banner(); if (b) app.appendChild(b); }
      app.appendChild(def.render(params) || el('div'));
    } catch (e) {
      app.appendChild(el('div.callout.warn', 'หน้านี้เกิดข้อผิดพลาด: ' + e.message));
      console.error(e);
    }
    window.scrollTo(0, 0);
  };

  HR.pageHead = function (title, desc, actions) {
    return el('div.page-head', [
      el('div', [el('h1', title), desc ? el('p', desc) : null]),
      actions && actions.length ? el('div.page-actions', actions.filter(Boolean)) : null
    ]);
  };
  HR.btn = function (label, fn, cls) {
    return el('button.btn' + (cls ? '.' + cls : ''), { type: 'button', onclick: fn }, label);
  };
  HR.badge = function (text, kind) { return el('span.badge' + (kind ? '.' + kind : ''), text == null ? '-' : String(text)); };
  HR.kpi = function (k, v, unit, d, cls) {
    return el('div.kpi' + (cls ? '.' + cls : ''), [
      el('div.k', k),
      el('div.v', [String(v), unit ? el('span.u', unit) : null]),
      d ? el('div.d', d) : null
    ]);
  };
  HR.progress = function (ratio) {
    return el('div.progress', el('i', { style: 'width:' + Math.max(0, Math.min(100, ratio * 100)).toFixed(1) + '%' }));
  };
  HR.tabs = function (items, activeIdx, onPick) {
    var bar = el('div.tabs');
    items.forEach(function (t, i) {
      bar.appendChild(el('button' + (i === activeIdx ? '.on' : ''), { type: 'button', onclick: function () { onPick(i); } }, t));
    });
    return bar;
  };

  /* ============ table ============ */
  /* cols: {k,l,num,w,fmt(row),badge(row)->kind,nosort,cls} */
  HR.table = function (opt) {
    var cols = opt.cols, rows = opt.rows || [];
    var state = { sort: opt.sort || null, dir: opt.dir || 1, q: '', page: 0, size: opt.pageSize || 25 };
    var wrap = el('div');
    var toolbar = el('div.toolbar');
    var search = el('input.search', { type: 'text', placeholder: opt.searchPlaceholder || 'ค้นหา...', 'aria-label': 'ค้นหา' });

    if (opt.search !== false) {
      search.addEventListener('input', function () { state.q = search.value.trim().toLowerCase(); state.page = 0; draw(); });
      toolbar.appendChild(search);
    }
    (opt.toolbar || []).forEach(function (n) { if (n) toolbar.appendChild(n); });
    toolbar.appendChild(el('div.spacer'));
    (opt.toolbarRight || []).forEach(function (n) { if (n) toolbar.appendChild(n); });
    if (opt.exportName !== false) {
      toolbar.appendChild(HR.btn('Export Excel', function () {
        HR.excel.exportRows(visible(), cols, opt.exportName || opt.title || 'data');
      }, 'btn-sm'));
    }
    if (opt.onImport) {
      toolbar.appendChild(HR.btn('Import Excel', function () { HR.excel.pickAndImport(cols, opt.onImport); }, 'btn-sm'));
    }
    if (toolbar.childNodes.length) wrap.appendChild(toolbar);

    var tw = el('div.table-wrap');
    var pager = el('div.pager');
    wrap.appendChild(tw); wrap.appendChild(pager);

    function cellText(c, r) {
      var v = c.fmt ? c.fmt(r) : r[c.k];
      if (v instanceof Node) return v.textContent;
      return v == null || v === '' ? '' : String(v);
    }
    function visible() {
      var out = rows.slice();
      if (state.q) {
        out = out.filter(function (r) {
          return cols.some(function (c) { return cellText(c, r).toLowerCase().indexOf(state.q) > -1; });
        });
      }
      if (state.sort) {
        var c = cols.filter(function (x) { return x.k === state.sort; })[0];
        out.sort(function (a, b) {
          var av = c && c.sortVal ? c.sortVal(a) : (c && c.num ? Number(a[c.k]) || 0 : cellText(c, a));
          var bv = c && c.sortVal ? c.sortVal(b) : (c && c.num ? Number(b[c.k]) || 0 : cellText(c, b));
          return (av > bv ? 1 : av < bv ? -1 : 0) * state.dir;
        });
      }
      return out;
    }
    function draw() {
      HR.clear(tw); HR.clear(pager);
      var all = visible();
      var pages = Math.max(1, Math.ceil(all.length / state.size));
      if (state.page >= pages) state.page = pages - 1;
      var slice = all.slice(state.page * state.size, (state.page + 1) * state.size);

      if (!rows.length) {
        tw.appendChild(el('div.empty', [
          el('b', (opt.empty && opt.empty.title) || 'ยังไม่มีข้อมูล'),
          (opt.empty && opt.empty.hint) || 'กดปุ่มเพิ่มรายการ หรือ Import จากไฟล์ Excel'
        ]));
        return;
      }

      var thead = el('thead'), trh = el('tr');
      cols.forEach(function (c) {
        var th = el('th' + (c.num ? '.num' : '') + (c.nosort ? '.nosort' : ''), {
          style: c.w ? 'width:' + c.w + 'px' : null,
          onclick: c.nosort ? null : function () {
            if (state.sort === c.k) state.dir = -state.dir; else { state.sort = c.k; state.dir = 1; }
            draw();
          }
        }, [c.l, state.sort === c.k ? el('span.ar', state.dir > 0 ? ' ▲' : ' ▼') : null]);
        trh.appendChild(th);
      });
      if (opt.actions) trh.appendChild(el('th.nosort', { style: 'text-align:right' }, 'จัดการ'));
      thead.appendChild(trh);

      var tbody = el('tbody');
      slice.forEach(function (r) {
        var tr = el('tr');
        cols.forEach(function (c) {
          var v = c.fmt ? c.fmt(r) : r[c.k];
          if (c.badge) {
            var kind = typeof c.badge === 'function' ? c.badge(r) : c.badge;
            v = HR.badge(v == null ? '-' : v, kind);
          } else if (c.num && typeof v === 'number') {
            v = HR.num(v, c.dec == null ? 2 : c.dec);
          }
          tr.appendChild(el('td' + (c.num ? '.num' : '') + (c.cls ? '.' + c.cls : ''), v instanceof Node ? v : (v == null || v === '' ? '-' : String(v))));
        });
        if (opt.actions) {
          var acts = el('td.acts');
          (opt.actions(r) || []).forEach(function (a) {
            if (!a) return;
            acts.appendChild(HR.btn(a.label, function (e) { e.stopPropagation(); a.fn(r); }, 'btn-sm' + (a.cls ? '.' + a.cls : '')));
            acts.appendChild(document.createTextNode(' '));
          });
          tr.appendChild(acts);
        }
        if (opt.onRow) { tr.style.cursor = 'pointer'; tr.addEventListener('click', function () { opt.onRow(r); }); }
        tbody.appendChild(tr);
      });

      var table = el('table.tbl', [thead, tbody]);

      if (opt.footerSum && opt.footerSum.length) {
        var trf = el('tr');
        cols.forEach(function (c, i) {
          if (i === 0) { trf.appendChild(el('td', 'รวม ' + all.length + ' รายการ')); return; }
          if (opt.footerSum.indexOf(c.k) > -1) {
            trf.appendChild(el('td.num', HR.num(HR.sum(all, function (r) {
              if (c.raw) return c.raw(r);
              if (c.fmt) { var v = c.fmt(r); return typeof v === 'number' ? v : Number(String(v).replace(/,/g, '')); }
              return r[c.k];
            }), c.dec == null ? 2 : c.dec)));
          } else trf.appendChild(el('td', ''));
        });
        if (opt.actions) trf.appendChild(el('td', ''));
        table.appendChild(el('tfoot', trf));
      }
      tw.appendChild(table);

      if (all.length > state.size) {
        pager.appendChild(el('span', 'หน้า ' + (state.page + 1) + ' / ' + pages + ' · ' + all.length + ' รายการ'));
        pager.appendChild(HR.btn('‹ ก่อนหน้า', function () { if (state.page > 0) { state.page--; draw(); } }, 'btn-sm'));
        pager.appendChild(HR.btn('ถัดไป ›', function () { if (state.page < pages - 1) { state.page++; draw(); } }, 'btn-sm'));
      } else if (all.length) {
        pager.appendChild(el('span', all.length + ' รายการ'));
      }
    }
    draw();
    wrap.refresh = draw;
    return wrap;
  };

  HR.card = function (title, sub, body, actions) {
    return el('div.card', [
      (title || actions) ? el('div.card-head', [
        el('div', [el('h3', title || ''), sub ? el('div.sub', sub) : null]),
        actions && actions.length ? el('div.row', actions.filter(Boolean)) : null
      ]) : null,
      el('div.card-body', [body])
    ]);
  };

  /* ============ form ============ */
  HR.form = function (fields, value) {
    value = value || {};
    var grid = el('div.form-grid'), inputs = {};
    fields.forEach(function (f) {
      if (f.t === 'section') { grid.appendChild(el('div.form-sec', f.l)); return; }
      if (f.hide && f.hide(value)) return;
      var v = value[f.k];
      if (v == null) v = (f.def != null ? f.def : '');
      var inp;
      if (f.t === 'select' || f.t === 'ref') {
        inp = el('select');
        inp.appendChild(el('option', { value: '' }, f.placeholder || '— เลือก —'));
        var opts = f.t === 'ref' ? HR.refOptions(f) : (typeof f.opts === 'function' ? f.opts(value) : f.opts).map(function (o) {
          return typeof o === 'string' ? { v: o, l: o } : o;
        });
        opts.forEach(function (o) { inp.appendChild(el('option', { value: o.v }, o.l)); });
        inp.value = v == null ? '' : String(v);
      } else if (f.t === 'textarea') {
        inp = el('textarea', { value: v });
      } else if (f.t === 'bool') {
        inp = el('input', { type: 'checkbox' });
        inp.checked = !!v;
      } else if (f.t === 'multi') {
        inp = el('div.row');
        var box = inp, chosen = Array.isArray(v) ? v.slice() : (v ? String(v).split(',').map(function (s) { return s.trim(); }) : []);
        (typeof f.opts === 'function' ? f.opts(value) : f.opts).forEach(function (o) {
          var cb = el('input', { type: 'checkbox' });
          cb.checked = chosen.indexOf(o) > -1;
          cb.dataset.val = o;
          box.appendChild(el('label.chk', [cb, o]));
        });
        box._multi = true;
      } else {
        var map = { money: 'number', percent: 'number', number: 'number', date: 'date', time: 'time', month: 'month', email: 'email', tel: 'tel' };
        inp = el('input', {
          type: map[f.t] || 'text', value: v,
          step: f.t === 'money' ? '0.01' : f.step || null,
          min: f.min != null ? f.min : null, max: f.max != null ? f.max : null,
          placeholder: f.placeholder || null
        });
      }
      if (f.readonly) { inp.setAttribute('disabled', ''); }
      inputs[f.k] = { node: inp, f: f };
      var label = el('span.lbl', [f.l, f.req ? el('em', ' *') : null]);
      grid.appendChild(el('div.field' + (f.w === 2 ? '.span2' : ''), [
        f.t === 'bool' ? el('label.chk', [inp, f.l]) : label,
        f.t === 'bool' ? null : inp,
        f.hint ? el('div.hint', f.hint) : null
      ]));
    });

    function get() {
      var out = Object.assign({}, value);
      Object.keys(inputs).forEach(function (k) {
        var o = inputs[k], f = o.f, n = o.node;
        if (f.t === 'bool') out[k] = n.checked;
        else if (n._multi) out[k] = Array.prototype.slice.call(n.querySelectorAll('input:checked')).map(function (c) { return c.dataset.val; });
        else if (f.t === 'money' || f.t === 'number' || f.t === 'percent') out[k] = n.value === '' ? null : Number(n.value);
        else out[k] = n.value;
      });
      return out;
    }
    function validate() {
      var bad = [];
      Object.keys(inputs).forEach(function (k) {
        var o = inputs[k];
        if (o.f.req && !o.f.readonly) {
          var val = o.f.t === 'bool' ? o.node.checked : o.node.value;
          if (val === '' || val == null) bad.push(o.f.l);
        }
      });
      return bad;
    }
    return { el: grid, get: get, validate: validate, inputs: inputs };
  };

  HR.refOptions = function (f) {
    var rows = HR.db.t(f.ref);
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

  /* ============ charts (plain SVG, drawn to scale) ============ */
  var SVG = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, kids) {
    var n = document.createElementNS(SVG, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  HR.svgText = function (x, y, txt, attrs) {
    var n = s('text', Object.assign({ x: x, y: y, fill: 'currentColor', 'font-size': 11, 'font-family': 'inherit' }, attrs || {}));
    n.textContent = txt;
    return n;
  };
  HR.palette = ['#0b6b5f', '#15539e', '#9a5b06', '#a81e13', '#5b3fa8', '#1d6b35', '#a8266f', '#2f7d8a'];

  HR.chartBar = function (opt) {
    var data = opt.data || [], W = 640, H = opt.height || 220, pad = { t: 14, r: 14, b: 44, l: 54 };
    var max = Math.max(1, Math.max.apply(null, data.map(function (d) { return Number(d.value) || 0; })));
    var step = max / 4, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var g = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img' });
    for (var i = 0; i <= 4; i++) {
      var y = pad.t + ih - (ih * i / 4);
      g.appendChild(s('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: 'currentColor', 'stroke-opacity': i ? .12 : .35 }));
      g.appendChild(HR.svgText(pad.l - 7, y + 4, HR.num(step * i, max < 10 ? 1 : 0), { 'text-anchor': 'end', 'fill-opacity': .6, 'font-size': 10 }));
    }
    var bw = Math.min(54, iw / Math.max(1, data.length) * .62);
    data.forEach(function (d, i) {
      var cx = pad.l + iw * (i + .5) / data.length;
      var h = ih * (Number(d.value) || 0) / max;
      g.appendChild(s('rect', { x: cx - bw / 2, y: pad.t + ih - h, width: bw, height: Math.max(h, 1), rx: 3, fill: d.color || HR.palette[i % 8] }));
      g.appendChild(HR.svgText(cx, pad.t + ih - h - 5, opt.fmt ? opt.fmt(d.value) : HR.num(d.value, 0), { 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 600 }));
      g.appendChild(HR.svgText(cx, H - pad.b + 16, d.label, { 'text-anchor': 'middle', 'font-size': 10, 'fill-opacity': .75 }));
    });
    return g;
  };

  HR.chartLine = function (opt) {
    var labels = opt.labels || [], series = opt.series || [], W = 640, H = opt.height || 220, pad = { t: 14, r: 14, b: 40, l: 54 };
    var all = series.reduce(function (a, sr) { return a.concat(sr.values); }, []);
    var max = Math.max(1, Math.max.apply(null, all.map(Number)));
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var g = s('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img' });
    for (var i = 0; i <= 4; i++) {
      var y = pad.t + ih - ih * i / 4;
      g.appendChild(s('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: 'currentColor', 'stroke-opacity': i ? .12 : .35 }));
      g.appendChild(HR.svgText(pad.l - 7, y + 4, HR.num(max * i / 4, max < 10 ? 1 : 0), { 'text-anchor': 'end', 'fill-opacity': .6, 'font-size': 10 }));
    }
    var X = function (i) { return pad.l + (labels.length < 2 ? iw / 2 : iw * i / (labels.length - 1)); };
    var Y = function (v) { return pad.t + ih - ih * (Number(v) || 0) / max; };
    series.forEach(function (sr, si) {
      var col = sr.color || HR.palette[si % 8];
      var d = sr.values.map(function (v, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(' ');
      g.appendChild(s('path', { d: d + ' L' + X(sr.values.length - 1) + ' ' + (pad.t + ih) + ' L' + X(0) + ' ' + (pad.t + ih) + ' Z', fill: col, 'fill-opacity': .09, stroke: 'none' }));
      g.appendChild(s('path', { d: d, fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
      sr.values.forEach(function (v, i) {
        g.appendChild(s('circle', { cx: X(i), cy: Y(v), r: i === sr.values.length - 1 ? 4 : 2.5, fill: col }));
      });
    });
    labels.forEach(function (l, i) {
      g.appendChild(HR.svgText(X(i), H - pad.b + 16, l, { 'text-anchor': 'middle', 'font-size': 10, 'fill-opacity': .75 }));
    });
    return g;
  };

  HR.chartDonut = function (opt) {
    var data = (opt.data || []).filter(function (d) { return Number(d.value) > 0; });
    var total = HR.sum(data, function (d) { return d.value; }) || 1;
    var W = 240, cx = 120, cy = 110, R = 84, r = 52;
    var g = s('svg', { viewBox: '0 0 ' + W + ' 220', class: 'chart', role: 'img' });
    var a0 = -Math.PI / 2;
    data.forEach(function (d, i) {
      var a1 = a0 + 2 * Math.PI * d.value / total, large = (a1 - a0) > Math.PI ? 1 : 0;
      var p = ['M', cx + R * Math.cos(a0), cy + R * Math.sin(a0),
        'A', R, R, 0, large, 1, cx + R * Math.cos(a1), cy + R * Math.sin(a1),
        'L', cx + r * Math.cos(a1), cy + r * Math.sin(a1),
        'A', r, r, 0, large, 0, cx + r * Math.cos(a0), cy + r * Math.sin(a0), 'Z'].join(' ');
      g.appendChild(s('path', { d: p, fill: d.color || HR.palette[i % 8] }));
      a0 = a1;
    });
    g.appendChild(HR.svgText(cx, cy - 2, opt.centerTop || HR.num(total, 0), { 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 600 }));
    g.appendChild(HR.svgText(cx, cy + 16, opt.centerSub || '', { 'text-anchor': 'middle', 'font-size': 10, 'fill-opacity': .65 }));
    return g;
  };

  HR.legend = function (data) {
    return el('div.legend', data.map(function (d, i) {
      return el('span', [el('i', { style: 'background:' + (d.color || HR.palette[i % 8]) }), d.label + (d.value != null ? ' · ' + HR.num(d.value, 0) : '')]);
    }));
  };

})(window.HR);
