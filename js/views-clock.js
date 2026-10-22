/* views-clock.js — ลงเวลาด้วยรูปถ่ายและพิกัด (ใช้ได้เฉพาะโหมดออนไลน์)
 *
 * รูปเก็บในที่เก็บแบบส่วนตัว "clockin" เส้นทาง <employee_id>/<yyyy-mm>/<id>.jpg
 * เวลาที่บันทึกมาจากนาฬิกาเซิร์ฟเวอร์เสมอ แก้จากเครื่องพนักงานไม่ได้
 * รูปและบันทึกที่เก่ากว่า 3 เดือนถูกลบทุกคืนโดยฟังก์ชัน clockin-cleanup
 */
(function (HR) {
  'use strict';
  var el = HR.el;
  var BUCKET = 'clockin';
  var stream = null;

  function stopCamera() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }
  window.addEventListener('hashchange', stopCamera);

  function pad(n) { return String(n).padStart(2, '0'); }
  function timeOf(iso) { var d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function dateOf(iso) { return HR.isoOf(new Date(iso)); }
  function mapUrl(r) { return r.lat == null ? '' : 'https://www.google.com/maps?q=' + r.lat + ',' + r.lng; }

  function offline() {
    return el('div.callout.warn', 'การลงเวลาด้วยรูปถ่ายใช้ได้เฉพาะเวอร์ชันออนไลน์');
  }

  /** ขอ URL ชั่วคราวของรูปทีละชุด */
  function signUrls(paths, seconds) {
    paths = paths.filter(Boolean);
    if (!paths.length) return Promise.resolve({});
    return HR.sb.client.storage.from(BUCKET).createSignedUrls(paths, seconds || 3600).then(function (r) {
      var map = {};
      (r.data || []).forEach(function (x) { if (x.signedUrl) map[x.path] = x.signedUrl; });
      return map;
    });
  }

  function thumb(url, caption) {
    if (!url) return el('span.dim', 'ไม่มีรูป');
    return el('img', {
      src: url, alt: 'รูปลงเวลา',
      style: 'width:48px;height:48px;object-fit:cover;border-radius:6px;cursor:zoom-in;display:block',
      onclick: function () {
        HR.modal({
          title: caption, size: 'narrow',
          body: el('img', { src: url, alt: caption, style: 'width:100%;border-radius:8px;display:block' })
        });
      }
    });
  }

  function placeCell(r) {
    if (r.lat == null) return HR.badge('ไม่ได้รับพิกัด', 'warn');
    return el('span', [
      el('a', { href: mapUrl(r), target: '_blank', rel: 'noopener' }, 'เปิดแผนที่'),
      r.accuracy != null ? el('span.dim', ' ±' + Math.round(r.accuracy) + ' ม.') : null
    ]);
  }

  /** ถ่ายภาพจากวิดีโอ ย่อเหลือกว้างไม่เกิน 640px แล้วบีบเป็น JPEG */
  function capture(video) {
    var w = video.videoWidth, h = video.videoHeight;
    var scale = Math.min(1, 640 / w);
    var c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    var g = c.getContext('2d');
    g.drawImage(video, 0, 0, c.width, c.height);
    return new Promise(function (ok, bad) {
      c.toBlob(function (b) { b ? ok(b) : bad(new Error('ถ่ายรูปไม่สำเร็จ')); }, 'image/jpeg', 0.72);
    });
  }

  function locate() {
    return new Promise(function (ok) {
      if (!navigator.geolocation) { ok(null); return; }
      navigator.geolocation.getCurrentPosition(
        function (p) { ok({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); },
        function () { ok(null); },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
      );
    });
  }

  /* ================= ลงเวลา (พนักงานทุกคน) ================= */
  HR.view('clockIn', {
    title: 'ลงเวลาเข้างาน', perm: 'self',
    render: function () {
      if (!HR.sb || !HR.sb.enabled) return el('div', [HR.pageHead('ลงเวลาเข้างาน'), offline()]);
      /* ลงเวลาได้เฉพาะบัญชีของตัวเอง (ฐานข้อมูลบังคับซ้ำอีกชั้น) */
      var me = HR.myEmployee();
      if (!me) return el('div', [HR.pageHead('ลงเวลาเข้างาน'), el('div.callout.warn', 'บัญชีนี้ยังไม่ได้ผูกกับทะเบียนพนักงาน จึงลงเวลาไม่ได้')]);
      var nameLine = el('div', { style: 'font-weight:600' }, (me.code ? me.code + ' · ' : '') + me.firstName + ' ' + me.lastName);

      var video = el('video', { autoplay: true, muted: true, playsinline: true,
        style: 'width:100%;max-width:420px;aspect-ratio:3/4;object-fit:cover;background:#000;border-radius:12px;display:block;transform:scaleX(-1)' });
      video.setAttribute('playsinline', '');
      var camMsg = el('div.dim', 'กำลังเปิดกล้อง…');
      var locMsg = el('div.dim', 'กำลังหาตำแหน่ง…');
      var clock = el('div', { style: 'font:600 34px/1.1 "IBM Plex Mono",monospace;margin:4px 0 2px' }, '--:--:--');
      var btnIn = HR.btn('เข้างาน', function () { submit('เข้างาน'); }, 'btn-primary');
      var btnOut = HR.btn('ออกงาน', function () { submit('ออกงาน'); });
      [btnIn, btnOut].forEach(function (b) { b.disabled = true; b.style.cssText = 'flex:1;min-height:52px;font-size:17px'; });
      var history = el('div', el('div.dim', 'กำลังโหลดประวัติ…'));
      var busy = false;

      var tick = setInterval(function () {
        if (!document.body.contains(clock)) { clearInterval(tick); return; }
        var d = new Date();
        clock.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      }, 1000);

      stopCamera();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        camMsg.textContent = 'เบราว์เซอร์นี้เปิดกล้องไม่ได้ ลองเปิดด้วย Chrome หรือ Safari';
      } else {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false })
          .then(function (s) {
            if (!document.body.contains(video)) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
            stream = s; video.srcObject = s;
            camMsg.textContent = 'กล้องพร้อม';
            btnIn.disabled = false; btnOut.disabled = false;
          })
          .catch(function () {
            camMsg.textContent = 'เปิดกล้องไม่ได้ — กดอนุญาตให้ใช้กล้องในเบราว์เซอร์ แล้วโหลดหน้านี้ใหม่';
          });
      }
      locate().then(function (p) {
        locMsg.textContent = p ? 'พบตำแหน่ง (แม่นยำ ±' + Math.round(p.accuracy) + ' ม.)'
          : 'ไม่ได้รับตำแหน่ง — กดอนุญาตตำแหน่งในเบราว์เซอร์ (ยังลงเวลาได้ แต่ HR จะเห็นว่าไม่มีพิกัด)';
      });

      function submit(kind) {
        if (busy || !stream) return;
        busy = true; btnIn.disabled = true; btnOut.disabled = true;
        var label = kind === 'เข้างาน' ? btnIn : btnOut, orig = label.textContent;
        label.textContent = 'กำลังบันทึก…';
        var id = HR.uid(), path = me.id + '/' + HR.thisMonth() + '/' + id + '.jpg';
        var shot;
        capture(video)
          .then(function (b) { shot = b; return locate(); })
          .then(function (pos) {
            return HR.sb.client.storage.from(BUCKET).upload(path, shot, { contentType: 'image/jpeg' }).then(function (r) {
              if (r.error) throw new Error('อัปโหลดรูปไม่สำเร็จ: ' + r.error.message);
              return HR.sb.client.from('clock_events').insert({
                id: id, employee_id: me.id, company_id: me.companyId || null, kind: kind,
                lat: pos ? pos.lat : null, lng: pos ? pos.lng : null, accuracy: pos ? pos.accuracy : null,
                photo_path: path, device: navigator.userAgent.slice(0, 200)
              }).select('taken_at').single();
            }).then(function (r) {
              if (r.error) throw new Error('บันทึกเวลาไม่สำเร็จ: ' + r.error.message);
              HR.toast(me.firstName + ' · ' + kind + ' ' + timeOf(r.data.taken_at) + (pos ? '' : ' (ไม่มีพิกัด)'));
              loadHistory();
            });
          })
          .catch(function (e) { HR.toast(e.message || String(e), 'err'); })
          .then(function () {
            busy = false; label.textContent = orig;
            if (stream) { btnIn.disabled = false; btnOut.disabled = false; }
          });
      }

      function loadHistory() {
        var since = new Date(); since.setDate(since.getDate() - 30);
        HR.sb.client.from('clock_events').select('*').eq('employee_id', me.id)
          .gte('taken_at', since.toISOString()).order('taken_at', { ascending: false }).limit(200)
          .then(function (r) {
            if (r.error) { HR.clear(history).appendChild(el('div.callout.warn', r.error.message)); return; }
            var rows = r.data || [];
            return signUrls(rows.map(function (x) { return x.photo_path; })).then(function (urls) {
              HR.clear(history).appendChild(HR.table({
                cols: [
                  { k: 'd', l: 'วันที่', fmt: function (x) { return HR.dateTH(dateOf(x.taken_at)); } },
                  { k: 't', l: 'เวลา', fmt: function (x) { return timeOf(x.taken_at); } },
                  { k: 'kind', l: 'ประเภท', badge: function (x) { return x.kind === 'เข้างาน' ? 'ok' : 'info'; } },
                  { k: 'p', l: 'ตำแหน่ง', nosort: 1, fmt: placeCell },
                  { k: 'img', l: 'รูป', nosort: 1, fmt: function (x) { return thumb(urls[x.photo_path], x.kind + ' ' + HR.dateTH(dateOf(x.taken_at)) + ' ' + timeOf(x.taken_at)); } }
                ],
                rows: rows, pageSize: 10, exportName: false,
                empty: { title: 'ยังไม่มีการลงเวลา', hint: 'กดปุ่ม "เข้างาน" เพื่อลงเวลาครั้งแรก' }
              }));
            });
          });
      }
      loadHistory();

      return el('div', [
        HR.pageHead('ลงเวลาเข้างาน', 'เวลามาจากเซิร์ฟเวอร์ พร้อมรูปถ่ายและตำแหน่ง'),
        el('div.grid.cols-2', { style: 'align-items:start;gap:16px' }, [
          HR.card('ถ่ายรูปลงเวลา', null, el('div.stack', [
            nameLine,
            video, clock, camMsg, locMsg,
            el('div', { style: 'display:flex;gap:10px;margin-top:6px' }, [btnIn, btnOut]),
            el('p.dim', { style: 'font-size:12px;margin:4px 0 0' },
              'รูปและตำแหน่งใช้เพื่อยืนยันการลงเวลาเท่านั้น เห็นได้เฉพาะคุณ หัวหน้างานของคุณ และ HR และถูกลบอัตโนมัติเมื่อครบ 3 เดือน')
          ])),
          HR.card('ประวัติ 30 วันล่าสุด', null, history)
        ])
      ]);
    }
  });

  /* ================= ดูการลงเวลาด้วยรูปถ่าย (HR / หัวหน้างาน) ================= */
  HR.view('clockLog', {
    title: 'ลงเวลาด้วยรูปถ่าย', perm: 'lead',
    render: function () {
      if (!HR.sb || !HR.sb.enabled) return el('div', [HR.pageHead('ลงเวลาด้วยรูปถ่าย'), offline()]);

      var emps = HR.db.t('employees').filter(function (e) { return HR.canSeeEmployee(e.id) && HR.inScope('employees', e); });
      var byId = {}; emps.forEach(function (e) { byId[e.id] = e; });
      var first = HR.thisMonth() + '-01';
      var from = el('input', { type: 'date', value: first });
      var to = el('input', { type: 'date', value: HR.today() });
      var who = el('select', [el('option', { value: '' }, 'ทุกคน (' + emps.length + ')')].concat(emps.map(function (e) {
        return el('option', { value: e.id }, (e.code ? e.code + ' · ' : '') + e.firstName + ' ' + e.lastName);
      })));
      var out = el('div', el('div.dim', 'กำลังโหลด…'));
      var current = [];

      function load() {
        HR.clear(out).appendChild(el('div.dim', 'กำลังโหลด…'));
        var a = new Date(from.value + 'T00:00:00'), b = new Date(to.value + 'T00:00:00');
        b.setDate(b.getDate() + 1);
        var q = HR.sb.client.from('clock_events').select('*')
          .gte('taken_at', a.toISOString()).lt('taken_at', b.toISOString())
          .order('taken_at', { ascending: false }).limit(3000);
        if (who.value) q = q.eq('employee_id', who.value);
        q.then(function (r) {
          if (r.error) { HR.clear(out).appendChild(el('div.callout.warn', r.error.message)); return; }
          var rows = (r.data || []).map(function (x) {
            var e = byId[x.employee_id] || HR.db.byId('employees', x.employee_id) || {};
            x.code = e.code || ''; x.name = e.firstName ? e.firstName + ' ' + e.lastName : '(ไม่พบในทะเบียน)';
            x.date = dateOf(x.taken_at); x.time = timeOf(x.taken_at); x.map = mapUrl(x);
            return x;
          });
          current = rows;
          return signUrls(rows.map(function (x) { return x.photo_path; })).then(function (urls) {
            var noLoc = rows.filter(function (x) { return x.lat == null; }).length;
            HR.clear(out);
            out.appendChild(el('div.grid.cols-4', { style: 'margin-bottom:16px' }, [
              HR.kpi('รายการทั้งหมด', rows.length, 'ครั้ง'),
              HR.kpi('เข้างาน', rows.filter(function (x) { return x.kind === 'เข้างาน'; }).length, 'ครั้ง'),
              HR.kpi('ออกงาน', rows.filter(function (x) { return x.kind === 'ออกงาน'; }).length, 'ครั้ง'),
              HR.kpi('ไม่มีพิกัด', noLoc, 'ครั้ง', null, noLoc ? 'warnbar' : '')
            ]));
            out.appendChild(HR.table({
              cols: [
                { k: 'date', l: 'วันที่', fmt: function (x) { return HR.dateTH(x.date); } },
                { k: 'time', l: 'เวลา' },
                { k: 'code', l: 'รหัส', w: 70 },
                { k: 'name', l: 'ชื่อ-นามสกุล' },
                { k: 'kind', l: 'ประเภท', badge: function (x) { return x.kind === 'เข้างาน' ? 'ok' : 'info'; } },
                { k: 'p', l: 'ตำแหน่ง', nosort: 1, fmt: placeCell },
                { k: 'img', l: 'รูป', nosort: 1, fmt: function (x) { return thumb(urls[x.photo_path], x.name + ' · ' + x.kind + ' ' + HR.dateTH(x.date) + ' ' + x.time); } }
              ],
              rows: rows, pageSize: 25, exportName: false,
              empty: { title: 'ไม่มีการลงเวลาในช่วงนี้', hint: 'ลองเปลี่ยนช่วงวันที่หรือพนักงาน' },
              searchPlaceholder: 'ค้นหาชื่อหรือรหัส…'
            }));
          });
        });
      }

      function exportXlsx() {
        if (!current.length) { HR.toast('ไม่มีข้อมูลในช่วงที่เลือก', 'err'); return; }
        /* ลิงก์รูปในไฟล์ Excel ใช้ได้ 7 วัน */
        signUrls(current.map(function (x) { return x.photo_path; }), 7 * 24 * 3600).then(function (urls) {
          HR.excel.exportRows(current.map(function (x) {
            return {
              date: x.date, time: x.time, code: x.code, name: x.name, kind: x.kind,
              lat: x.lat, lng: x.lng, acc: x.accuracy == null ? '' : Math.round(x.accuracy),
              map: x.map, photo: urls[x.photo_path] || ''
            };
          }), [
            { k: 'date', l: 'วันที่' }, { k: 'time', l: 'เวลา' }, { k: 'code', l: 'รหัส' }, { k: 'name', l: 'ชื่อ-นามสกุล' },
            { k: 'kind', l: 'ประเภท' }, { k: 'lat', l: 'ละติจูด' }, { k: 'lng', l: 'ลองจิจูด' },
            { k: 'acc', l: 'ความแม่นยำ (ม.)' }, { k: 'map', l: 'ลิงก์แผนที่' }, { k: 'photo', l: 'ลิงก์รูป (ใช้ได้ 7 วัน)' }
          ], 'ลงเวลาถ่ายรูป_' + from.value + '_' + to.value);
        });
      }

      [from, to, who].forEach(function (x) { x.addEventListener('change', load); });
      load();

      return el('div', [
        HR.pageHead('ลงเวลาด้วยรูปถ่าย',
          (HR.isHR() ? 'พนักงานทุกคน' : 'ลูกทีมสายตรงของคุณ') + ' · รูปเก็บไว้ 3 เดือนแล้วลบอัตโนมัติ', [
            HR.btn('Export Excel', exportXlsx, 'btn-primary')
          ]),
        el('div.toolbar', { style: 'gap:10px;flex-wrap:wrap;margin-bottom:12px' }, [
          el('label.field', [el('span.lbl', 'ตั้งแต่'), from]),
          el('label.field', [el('span.lbl', 'ถึง'), to]),
          el('label.field', [el('span.lbl', 'พนักงาน'), who])
        ]),
        out
      ]);
    }
  });
})(window.HR);
