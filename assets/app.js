/* =====================================================================
 * Al-Asas School Management System — UI layer (vanilla JS)
 * ===================================================================== */
'use strict';

const SESSION_KEY = 'alasas_session';
const PAGE_SIZE = 15;

/* =========================== Utilities =========================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => `<span class="num">${Number(n || 0).toLocaleString('en-US')}</span> د.ع`;
const moneyText = n => `${Number(n || 0).toLocaleString('en-US')} د.ع`;
const intFmt = n => Number(n || 0).toLocaleString('en-US');
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const initials = name => String(name || '?').replace(/^(د\.|أ\.|م\.)\s*/, '').trim().charAt(0);
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function safeStorage(kind) {
  return {
    get(k) { try { return window[kind].getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window[kind].setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { window[kind].removeItem(k); } catch (e) { /* ignore */ } },
  };
}
const session = safeStorage('sessionStorage');

function paymentStatus(paid, fee) {
  if (paid >= fee) return { key: 'paid', label: 'مدفوع بالكامل', cls: 'b-green', color: 'var(--success)' };
  if (paid > 0) return { key: 'partial', label: 'مدفوع جزئياً', cls: 'b-yellow', color: 'var(--warning)' };
  return { key: 'unpaid', label: 'غير مدفوع', cls: 'b-red', color: 'var(--danger)' };
}
function statusBadge(paid, fee) { const s = paymentStatus(paid, fee); return `<span class="badge ${s.cls}">${s.label}</span>`; }
function progressBar(paid, fee) {
  const pct = fee > 0 ? Math.min(100, Math.round(paid / fee * 100)) : 100;
  return `<div class="row" style="gap:8px;flex-wrap:nowrap"><div class="progress" style="flex:1"><span style="width:${pct}%;background:${paymentStatus(paid, fee).color}"></span></div><small class="muted num">${pct}%</small></div>`;
}
function roleBadge(role) { const r = ROLES[role]; return r ? `<span class="badge plain ${r.badge}">${esc(r.label)}</span>` : esc(role); }

function download(filename, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function toCSV(headers, rows) {
  const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [headers.map(cell).join(','), ...rows.map(r => r.map(cell).join(','))].join('\n');
}

/* ---------- Toasts ---------- */
function toast(message, type = 'info', ms = 3500) {
  const icons = { success: '✓', error: '✕', warning: '!', info: 'i' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<strong>${icons[type] || ''}</strong><div>${esc(message)}</div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 300); }, ms);
}

/* ---------- Tooltip ---------- */
const tip = {
  show(e, html) { const t = $('#tooltip'); t.innerHTML = html; t.hidden = false; this.move(e); },
  move(e) { const t = $('#tooltip'); t.style.left = (e.clientX + 14) + 'px'; t.style.top = (e.clientY + 14) + 'px'; },
  hide() { $('#tooltip').hidden = true; },
};
document.addEventListener('mouseover', e => { const el = e.target.closest('[data-tip]'); if (el) tip.show(e, el.dataset.tip); });
document.addEventListener('mousemove', e => { if (e.target.closest('[data-tip]')) tip.move(e); });
document.addEventListener('mouseout', e => { if (e.target.closest('[data-tip]')) tip.hide(); });

/* ---------- Modals ---------- */
function openModal({ title, body, size = '', buttons = [], onOpen, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="close-x" data-close aria-label="إغلاق">×</button></div>
      <div class="modal-body">${body}</div>
      ${buttons.length ? `<div class="modal-foot">${buttons.map((b, i) => `<button type="button" class="btn ${b.cls || ''}" data-btn="${i}">${esc(b.label)}</button>`).join('')}</div>` : ''}
    </div>`;
  let closed = false;
  const close = () => { if (closed) return; closed = true; wrap.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  wrap.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return close();
    const b = e.target.closest('[data-btn]');
    if (b) { const def = buttons[+b.dataset.btn]; def.onClick ? def.onClick(close, wrap) : close(); }
  });
  document.addEventListener('keydown', onKey);
  $('#modal-root').appendChild(wrap);
  onOpen && onOpen(wrap, close);
  const first = $('input:not([type=hidden]):not([disabled]), select, textarea', wrap);
  first && setTimeout(() => first.focus(), 30);
  return close;
}
function confirmDialog({ title = 'تأكيد', message, confirmLabel = 'تأكيد', danger = true }) {
  return new Promise(resolve => {
    let result = false;
    openModal({
      title, size: 'sm', body: `<p style="margin:0">${message}</p>`,
      onClose: () => resolve(result), // also fires on X / Esc / backdrop
      buttons: [
        { label: confirmLabel, cls: danger ? 'btn-danger' : 'btn-primary', onClick: c => { result = true; c(); } },
        { label: 'إلغاء', cls: 'btn-ghost' },
      ],
    });
  });
}
/* ---------- Form validation ---------- */
const V = {
  clear(form) { $$('.field', form).forEach(f => { f.classList.remove('invalid'); const e = $('.err', f); if (e) e.textContent = ''; }); },
  set(form, name, msg) {
    const input = form.elements[name];
    const field = input && (input.closest ? input.closest('.field') : input[0]?.closest('.field'));
    if (!field) { toast(msg, 'error'); return; }
    field.classList.add('invalid');
    $('.err', field).textContent = msg;
  },
  /** rules: { field: [fn(value, values) => errorMsg|null, ...] } → returns values or null */
  run(form, rules) {
    V.clear(form);
    const values = Object.fromEntries(new FormData(form).entries());
    let ok = true, firstBad = null;
    for (const [name, fns] of Object.entries(rules)) {
      for (const fn of fns) {
        const msg = fn((values[name] ?? '').toString().trim(), values);
        if (msg) { V.set(form, name, msg); ok = false; firstBad = firstBad || name; break; }
      }
    }
    if (!ok && form.elements[firstBad] && form.elements[firstBad].focus) form.elements[firstBad].focus();
    return ok ? values : null;
  },
  required: msg => v => (v ? null : msg || 'هذا الحقل مطلوب'),
  minLen: (n, msg) => v => (!v || v.length >= n ? null : msg || `يجب ألا يقل عن ${n} أحرف`),
  email: v => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'صيغة البريد الإلكتروني غير صحيحة'),
  phone: v => (!v || /^07\d{9}$/.test(v.replace(/[\s-]/g, '')) ? null : 'رقم الهاتف يجب أن يكون 11 رقماً ويبدأ بـ 07'),
  int: (min, msg) => v => (v === '' || (/^\d+$/.test(v.replace(/,/g, '')) && +v.replace(/,/g, '') >= min) ? null : msg || `أدخل رقماً صحيحاً لا يقل عن ${min}`),
  date: v => (!v || !isNaN(Date.parse(v)) ? null : 'تاريخ غير صالح'),
  notFuture: v => (!v || v <= today() ? null : 'لا يمكن أن يكون التاريخ في المستقبل'),
};
const toInt = v => parseInt(String(v).replace(/,/g, ''), 10) || 0;

/* =========================== Auth =========================== */
const Auth = {
  user: null,
  failed: 0,
  lockedUntil: 0,

  perms() {
    if (!this.user) return [];
    let p = [];
    try { p = JSON.parse(this.user.permissions || '[]'); } catch (e) { /* malformed */ }
    return ['dashboard', ...p.filter(k => MODULES[k] && k !== 'dashboard')];
  },
  can(perm) { return this.perms().includes(perm); },

  refresh() {
    if (!this.user) return false;
    let u = null;
    try { u = DB.get('SELECT * FROM employees WHERE employee_id = ?', [this.user.employee_id]); } catch (e) { /* table missing */ }
    if (!u || u.status !== 'active') { this.logout(true); return false; }
    this.user = u;
    return true;
  },

  login(email, password) {
    if (Date.now() < this.lockedUntil) {
      throw new Error(`تم إيقاف المحاولات مؤقتاً. حاول بعد ${Math.ceil((this.lockedUntil - Date.now()) / 1000)} ثانية`);
    }
    const u = DB.get('SELECT * FROM employees WHERE email = ? COLLATE NOCASE', [email]);
    if (!u || !verifyPassword(password, u.password)) {
      this.failed++;
      DB.log('login_failed', `محاولة دخول فاشلة للبريد: ${email}`, u ? u.employee_id : null);
      DB.persist();
      if (this.failed >= 5) { this.lockedUntil = Date.now() + 30000; this.failed = 0; }
      throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }
    if (u.status !== 'active') {
      DB.log('login_blocked', `محاولة دخول لحساب موقوف: ${u.email}`, u.employee_id);
      DB.persist();
      throw new Error('هذا الحساب موقوف. يرجى مراجعة مدير النظام');
    }
    this.failed = 0;
    this.user = u;
    session.set(SESSION_KEY, String(u.employee_id));
    DB.log('login', `تسجيل دخول: ${u.name}`, u.employee_id);
    DB.persist();
  },

  logout(forced = false) {
    if (this.user && !forced) { DB.log('logout', `تسجيل خروج: ${this.user.name}`, this.user.employee_id); DB.persist(); }
    this.user = null;
    session.del(SESSION_KEY);
    if (forced) toast('انتهت الجلسة أو تم إيقاف الحساب', 'warning');
    showLogin();
  },

  restore() {
    const id = session.get(SESSION_KEY);
    if (!id) return false;
    let u = null;
    try { u = DB.get('SELECT * FROM employees WHERE employee_id = ?', [+id]); } catch (e) { /* schema damaged */ }
    if (!u || u.status !== 'active') { session.del(SESSION_KEY); return false; }
    this.user = u;
    return true;
  },
};

/** Mutate + audit + persist in one place. */
function commit(eventType, details, fn) {
  const result = DB.tx(() => {
    const r = fn ? fn() : undefined;
    DB.log(eventType, details, Auth.user ? Auth.user.employee_id : null);
    return r;
  });
  DB.persist();
  return result;
}
function friendlyError(e) {
  const m = String(e && e.message || e);
  if (/FOREIGN KEY/i.test(m)) return 'لا يمكن تنفيذ العملية لوجود سجلات مرتبطة بهذا العنصر';
  if (/UNIQUE.*email/i.test(m)) return 'البريد الإلكتروني مستخدم مسبقاً';
  if (/UNIQUE.*sections/i.test(m)) return 'يوجد شعبة بنفس الاسم في هذا الصف';
  if (/UNIQUE/i.test(m)) return 'القيمة مكررة وموجودة مسبقاً';
  if (/CHECK constraint/i.test(m)) return 'القيمة المدخلة لا تطابق قيود قاعدة البيانات';
  return m;
}

/* =========================== Lookups =========================== */
const Lookup = {
  levels: () => DB.all('SELECT * FROM levels ORDER BY sort_order'),
  grades: levelId => DB.all('SELECT * FROM grades' + (levelId ? ' WHERE level_id = ?' : '') + ' ORDER BY number', levelId ? [levelId] : []),
  sections: gradeId => DB.all(`SELECT s.*, (SELECT COUNT(*) FROM students st WHERE st.section = s.section_id) AS cnt
                               FROM sections s WHERE grade_id = ? ORDER BY name`, [gradeId]),
  grade: id => DB.get('SELECT * FROM grades WHERE grade_id = ?', [id]),
};
const opt = (value, label, selected) => `<option value="${esc(value)}" ${String(selected) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;
function levelOptions(sel, all = 'كل المراحل') { return (all ? opt('', all, sel) : '') + Lookup.levels().map(l => opt(l.level_id, l.name, sel)).join(''); }
function gradeOptions(levelId, sel, all = 'كل الصفوف') { return (all ? opt('', all, sel) : '') + Lookup.grades(levelId).map(g => opt(g.grade_id, g.name, sel)).join(''); }
function sectionOptions(gradeId, sel, all = 'كل الشعب') {
  return (all ? opt('', all, sel) : '') + (gradeId ? Lookup.sections(gradeId).map(s => opt(s.section_id, `${s.name} (${s.cnt}/${s.capacity})`, sel)).join('') : '');
}

/** Shared student query used by Students, Fees and Class lists. */
function queryStudents(f = {}, { sort = 'student_id', dir = 'ASC', limit, offset } = {}) {
  const where = [], params = [];
  if (f.q) {
    where.push('(s.name LIKE ? OR s.student_id LIKE ? OR s.guardian_phone LIKE ?)');
    params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  if (f.id) { where.push('s.student_id = ?'); params.push(f.id); }
  if (f.level) { where.push('s.academic_level = ?'); params.push(+f.level); }
  if (f.grade) { where.push('s.grade_level = ?'); params.push(+f.grade); }
  if (f.section === 'none') where.push('s.section IS NULL');
  else if (f.section) { where.push('s.section = ?'); params.push(+f.section); }
  if (f.gender) { where.push('s.gender = ?'); params.push(f.gender); }
  if (f.study) { where.push('s.study_type = ?'); params.push(f.study); }
  if (f.track) { where.push('s.track = ?'); params.push(f.track); }
  if (f.status === 'paid') where.push('COALESCE(p.paid,0) >= s.annual_fee');
  if (f.status === 'partial') where.push('COALESCE(p.paid,0) > 0 AND COALESCE(p.paid,0) < s.annual_fee');
  if (f.status === 'unpaid') where.push('COALESCE(p.paid,0) = 0 AND s.annual_fee > 0');
  const sortable = { student_id: 's.student_id', name: 's.name', grade: 'g.number, sec.name', reg: 's.registration_date', paid: 'paid', remaining: 'remaining', fee: 's.annual_fee' };
  const order = `${sortable[sort] || 's.student_id'} ${dir === 'DESC' ? 'DESC' : 'ASC'}, s.student_id`;
  const base = `FROM students s
    JOIN grades g ON g.grade_id = s.grade_level
    JOIN levels l ON l.level_id = s.academic_level
    LEFT JOIN sections sec ON sec.section_id = s.section
    LEFT JOIN (SELECT student_id, SUM(amount) AS paid, COUNT(*) AS n, MAX(payment_date) AS last_date FROM payments GROUP BY student_id) p ON p.student_id = s.student_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  const total = DB.val(`SELECT COUNT(*) ${base}`, params);
  const rows = DB.all(`SELECT s.*, g.name AS grade_name, g.number AS grade_no, l.name AS level_name, sec.name AS section_name,
      COALESCE(p.paid,0) AS paid, s.annual_fee - COALESCE(p.paid,0) AS remaining, COALESCE(p.n,0) AS pay_count, p.last_date
      ${base} ORDER BY ${order}${limit ? ` LIMIT ${+limit} OFFSET ${+offset || 0}` : ''}`, params);
  return { total, rows };
}

function pager(total, page, key) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return `<div class="pager"><small class="muted">إجمالي النتائج: <b class="num">${intFmt(total)}</b></small>
    <div class="row"><button class="btn btn-sm btn-ghost" data-page="${key}" data-to="${page - 1}" ${page <= 1 ? 'disabled' : ''}>السابق</button>
    <small class="muted">صفحة <span class="num">${page}</span> من <span class="num">${pages}</span></small>
    <button class="btn btn-sm btn-ghost" data-page="${key}" data-to="${page + 1}" ${page >= pages ? 'disabled' : ''}>التالي</button></div></div>`;
}
function sortTh(label, key, state) {
  const arrow = state.sort === key ? (state.dir === 'ASC' ? ' ▲' : ' ▼') : '';
  return `<th style="cursor:pointer" data-sort="${key}">${label}${arrow}</th>`;
}

/* =========================== Charts (SVG) =========================== */
function barChart(items, { height = 240, onClickKey = '' } = {}) {
  const W = 640, H = height, pad = { t: 16, r: 36, b: 46, l: 8 };
  const max = Math.max(1, ...items.map(i => i.value));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const bw = (W - pad.l - pad.r) / Math.max(1, items.length);
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (H - pad.t - pad.b) * (1 - i / 4);
    g += `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}"/><text x="${W - pad.r + 8}" y="${y + 4}" text-anchor="start">${step * i}</text>`;
  }
  items.forEach((it, i) => {
    const h = (H - pad.t - pad.b) * (it.value / top);
    const x = W - pad.r - (i + 1) * bw + bw * 0.18, w = bw * 0.64, y = H - pad.b - h; // RTL: first item on the right
    g += `<rect class="bar" data-key="${esc(it.key)}" data-chart="${onClickKey}" x="${x}" y="${y}" width="${w}" height="${Math.max(h, 0.5)}" rx="5" fill="${it.color}"
            data-tip="${esc(`<b>${esc(it.label)}</b><br>${it.tip || it.value + ' طالب'}`)}"/>`;
    if (it.value) g += `<text x="${x + w / 2}" y="${y - 5}" text-anchor="middle" style="fill:var(--text);font-weight:700">${it.value}</text>`;
    g += `<text x="${x + w / 2}" y="${H - pad.b + 18}" text-anchor="middle">${esc(it.short || it.label)}</text>`;
  });
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg></div>`;
}
function donutChart(items, { centerLabel = '', onClickKey = '' } = {}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  const R = 70, C = 2 * Math.PI * R;
  let offset = 0, segs = '';
  if (!total) segs = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="var(--surface-3)" stroke-width="26"/>`;
  items.forEach(it => {
    if (!it.value) return;
    const len = C * it.value / total;
    segs += `<circle class="seg" data-key="${esc(it.key)}" data-chart="${onClickKey}" r="${R}" cx="90" cy="90" fill="none" stroke="${it.color}" stroke-width="26"
              stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 90 90)"
              data-tip="${esc(`<b>${esc(it.label)}</b><br>${intFmt(it.value)} (${Math.round(it.value / total * 100)}%)`)}"/>`;
    offset += len;
  });
  return `<div class="donut-wrap chart"><svg viewBox="0 0 180 180">${segs}
      <text x="90" y="88" text-anchor="middle" class="donut-center">${intFmt(total)}</text>
      <text x="90" y="110" text-anchor="middle">${esc(centerLabel)}</text></svg>
    <div class="legend">${items.map(i => `<span><i style="background:${i.color}"></i>${esc(i.label)}: <b class="num">${intFmt(i.value)}</b></span>`).join('')}</div></div>`;
}

/* =========================== Router =========================== */
const Pages = {};
const ui = {}; // per-page persistent state (filters, paging, sorting)

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  return { page: path || 'dashboard', params: Object.fromEntries(new URLSearchParams(qs || '')) };
}
function go(page, params) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const target = `#/${page}${qs}`;
  if (location.hash === target) route(); else location.hash = target;
}

function renderNav(active) {
  const perms = Auth.perms();
  let html = '', lastGroup = '';
  for (const [key, m] of Object.entries(MODULES)) {
    if (!perms.includes(key)) continue;
    if (m.group !== lastGroup) { html += `<div class="nav-group">${esc(m.group)}</div>`; lastGroup = m.group; }
    html += `<a href="#/${key}" class="${key === active ? 'active' : ''}"><span class="ico">${m.icon}</span>${esc(m.label)}</a>`;
  }
  $('#nav').innerHTML = html;
  $('#me-name').textContent = Auth.user.name;
  $('#me-role').textContent = ROLES[Auth.user.role]?.label || Auth.user.role;
  $('#me-avatar').textContent = initials(Auth.user.name);
}

function route() {
  if (!Auth.user) return;
  if (!Auth.refresh()) return;
  const { page, params } = parseHash();
  const target = MODULES[page] && Auth.can(page) ? page : 'dashboard';
  if (target !== page && page !== 'dashboard') toast('ليست لديك صلاحية للوصول إلى هذه الصفحة', 'warning');
  renderNav(target);
  $('#page-title').textContent = MODULES[target].label;
  document.title = `${MODULES[target].label} — نظام الأساس`;
  $('#app-view').classList.remove('nav-open');
  const el = $('#page');
  for (const h of ['onclick', 'onchange', 'oninput', 'ondragstart', 'ondragend', 'ondragover', 'ondragleave', 'ondrop']) el[h] = null;
  try {
    Pages[target](el, params);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="card"><div class="alert alert-danger">حدث خطأ أثناء عرض الصفحة: ${esc(e.message)}</div>
      <p class="muted">إذا عدّلت بنية قاعدة البيانات من وحدة SQL فقد تحتاج إلى استيراد نسخة احتياطية أو إعادة التهيئة.</p></div>`;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* =========================== Dashboard =========================== */
Pages.dashboard = el => {
  const fin = Auth.can('fees');
  const s = DB.get(`SELECT COUNT(*) AS total, SUM(gender='male') AS male, SUM(gender='female') AS female,
      SUM(study_type='Morning') AS morning, SUM(study_type='Evening') AS evening,
      SUM(registration_date >= date('now','localtime','-30 days')) AS recent,
      COALESCE(SUM(annual_fee),0) AS expected FROM students`);
  const collected = DB.val('SELECT COALESCE(SUM(amount),0) FROM payments');
  const collectedMonth = DB.val("SELECT COALESCE(SUM(amount),0) FROM payments WHERE payment_date >= date('now','localtime','start of month')");
  const staff = DB.get("SELECT COUNT(*) AS total, SUM(status='active') AS active FROM employees");
  const statusCounts = DB.get(`SELECT SUM(paid >= annual_fee) AS paid, SUM(paid > 0 AND paid < annual_fee) AS partial, SUM(paid = 0 AND annual_fee > 0) AS unpaid
      FROM (SELECT s.annual_fee, COALESCE((SELECT SUM(amount) FROM payments p WHERE p.student_id = s.student_id),0) AS paid FROM students s)`);
  const outstanding = DB.val(`SELECT COALESCE(SUM(MAX(s.annual_fee - COALESCE(p.paid,0), 0)),0) FROM students s
      LEFT JOIN (SELECT student_id, SUM(amount) paid FROM payments GROUP BY student_id) p USING (student_id)`);
  const perGrade = DB.all(`SELECT g.grade_id, g.number, g.name, g.level_id, COUNT(s.student_id) AS cnt,
      SUM(s.gender='male') AS m, SUM(s.gender='female') AS f
      FROM grades g LEFT JOIN students s ON s.grade_level = g.grade_id GROUP BY g.grade_id ORDER BY g.number`);
  const levelColors = { 1: '#4f8cff', 2: '#a78bfa', 3: '#22c55e' };

  const stat = (cls, ico, label, value, sub) => `<div class="card stat ${cls}"><div class="badge-ico">${ico}</div>
      <div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;

  const clickTarget = Auth.can('students') ? 'students' : Auth.can('classlists') ? 'classlists' : '';
  const recentPayments = fin ? DB.all(`SELECT p.*, s.name AS student_name, e.name AS emp_name FROM payments p
      JOIN students s USING (student_id) LEFT JOIN employees e ON e.employee_id = p.employee_id
      ORDER BY p.payment_date DESC, p.payment_id DESC LIMIT 6`) : [];
  const activeStaff = DB.all("SELECT * FROM employees WHERE status = 'active' ORDER BY role = 'admin' DESC, name LIMIT 8");
  const recentStudents = DB.all(`SELECT s.student_id, s.name, s.registration_date, g.name AS grade_name, sec.name AS section_name FROM students s
      JOIN grades g ON g.grade_id = s.grade_level LEFT JOIN sections sec ON sec.section_id = s.section
      ORDER BY s.registration_date DESC, s.student_id DESC LIMIT 6`);

  el.innerHTML = `
    <div class="row" style="margin-bottom:18px">
      <div><h3 style="font-size:20px">مرحباً، ${esc(Auth.user.name)} 👋</h3>
      <small class="muted">${esc(DB.setting('school_name', ''))} — العام الدراسي <span class="num">${esc(DB.setting('academic_year', ''))}</span></small></div>
      <div class="spacer"></div>
      ${Auth.can('register') ? '<a class="btn btn-primary" href="#/register">✚ تسجيل طالب</a>' : ''}
      ${fin ? '<a class="btn btn-ghost" href="#/fees">◈ تسجيل دفعة</a>' : ''}
    </div>
    <div class="grid grid-4">
      ${stat('c-blue', '🎓', 'إجمالي الطلاب', `<span class="num">${intFmt(s.total)}</span>`, `ذكور <span class="num">${intFmt(s.male)}</span> · إناث <span class="num">${intFmt(s.female)}</span> · جدد (30 يوماً) <span class="num">${intFmt(s.recent)}</span>`)}
      ${fin ? stat('c-green', '💰', 'إجمالي الأقساط المحصّلة', money(collected), `هذا الشهر: ${money(collectedMonth)}`) : ''}
      ${fin ? stat('c-red', '⏳', 'المبالغ المتبقية', money(outstanding), `نسبة التحصيل: <span class="num">${s.expected ? Math.round(collected / s.expected * 100) : 0}%</span> من ${money(s.expected)}`) : ''}
      ${stat('c-purple', '👥', 'الموظفون النشطون', `<span class="num">${intFmt(staff.active)}</span>`, `من أصل <span class="num">${intFmt(staff.total)}</span> حساباً`)}
    </div>

    <div class="grid grid-3-1 mt">
      <div class="card">
        <div class="card-head"><h3>توزيع الطلاب على الصفوف</h3>
          <div class="legend" style="margin:0">${Lookup.levels().map(l => `<span><i style="background:${levelColors[l.level_id] || '#888'}"></i>${esc(l.name)}</span>`).join('')}</div></div>
        ${barChart(perGrade.map(g => ({ key: g.grade_id, label: g.name, short: String(g.number), value: g.cnt, color: levelColors[g.level_id] || '#888',
            tip: `${g.cnt} طالب — ذكور ${g.m || 0} · إناث ${g.f || 0}` })), { onClickKey: 'grade' })}
        ${clickTarget ? '<small class="muted">انقر على أي عمود لعرض طلاب ذلك الصف.</small>' : ''}
      </div>
      <div class="card">
        <div class="card-head"><h3>${fin ? 'حالة الأقساط' : 'الطلاب حسب المرحلة'}</h3></div>
        ${fin
          ? donutChart([
              { key: 'paid', label: 'مدفوع بالكامل', value: statusCounts.paid || 0, color: 'var(--success)' },
              { key: 'partial', label: 'مدفوع جزئياً', value: statusCounts.partial || 0, color: 'var(--warning)' },
              { key: 'unpaid', label: 'غير مدفوع', value: statusCounts.unpaid || 0, color: 'var(--danger)' }], { centerLabel: 'طالب', onClickKey: 'status' })
          : donutChart(Lookup.levels().map(l => ({ key: l.level_id, label: l.name, color: levelColors[l.level_id] || '#888',
              value: perGrade.filter(g => g.level_id === l.level_id).reduce((a, g) => a + g.cnt, 0) })), { centerLabel: 'طالب' })}
      </div>
    </div>

    <div class="grid grid-2 mt">
      <div class="card"><div class="card-head"><h3>الجنس ونوع الدوام</h3></div>
        <div class="grid" style="grid-template-columns:1fr 1fr">
          ${donutChart([{ key: 'male', label: 'ذكور', value: s.male || 0, color: '#38bdf8' }, { key: 'female', label: 'إناث', value: s.female || 0, color: '#f472b6' }], { centerLabel: 'الجنس', onClickKey: 'gender' })}
          ${donutChart([{ key: 'Morning', label: 'صباحي', value: s.morning || 0, color: 'var(--primary)' }, { key: 'Evening', label: 'مسائي', value: s.evening || 0, color: 'var(--purple)' }], { centerLabel: 'الدوام', onClickKey: 'study' })}
        </div>
      </div>
      ${fin ? `<div class="card"><div class="card-head"><h3>آخر المدفوعات</h3><a href="#/fees?tab=payments" class="btn btn-sm btn-ghost">عرض الكل</a></div>
        <ul class="list">${recentPayments.map(p => `<li><div class="avatar" style="background:rgba(34,197,94,.15)">◈</div>
          <div class="grow"><b>${esc(p.student_name)}</b><small>${esc(p.payment_date)} · بواسطة ${esc(p.emp_name || '—')}</small></div><b>${money(p.amount)}</b></li>`).join('')
          || '<li class="muted">لا توجد مدفوعات بعد</li>'}</ul></div>`
      : `<div class="card"><div class="card-head"><h3>أحدث التسجيلات</h3></div>
        <ul class="list">${recentStudents.map(r => `<li><div class="avatar">${esc(initials(r.name))}</div><div class="grow"><b>${esc(r.name)}</b>
          <small>${esc(r.grade_name)} · ${esc(r.section_name || 'بدون شعبة')} · ${esc(r.registration_date)}</small></div><small class="mono muted">${esc(r.student_id)}</small></li>`).join('')
          || '<li class="muted">لا يوجد طلاب مسجلون بعد</li>'}</ul></div>`}
    </div>

    <div class="grid grid-2 mt">
      <div class="card"><div class="card-head"><h3>الموظفون النشطون</h3>${Auth.can('employees') ? '<a href="#/employees" class="btn btn-sm btn-ghost">إدارة</a>' : ''}</div>
        <ul class="list">${activeStaff.map(e => `<li><div class="avatar">${esc(initials(e.name))}</div><div class="grow"><b>${esc(e.name)}</b>
          <small class="mono">${esc(e.email)}</small></div>${roleBadge(e.role)}</li>`).join('')}</ul></div>
      ${fin ? `<div class="card"><div class="card-head"><h3>أحدث التسجيلات</h3></div>
        <ul class="list">${recentStudents.map(r => `<li><div class="avatar">${esc(initials(r.name))}</div><div class="grow"><b>${esc(r.name)}</b>
          <small>${esc(r.grade_name)} · ${esc(r.section_name || 'بدون شعبة')} · ${esc(r.registration_date)}</small></div><small class="mono muted">${esc(r.student_id)}</small></li>`).join('')
          || '<li class="muted">لا يوجد طلاب مسجلون بعد</li>'}</ul></div>` : ''}
    </div>
    ${!s.total && Auth.can('sql') ? `<div class="alert alert-info mt">قاعدة البيانات فارغة. يمكنك تحميل بيانات تجريبية من <a href="#/sql?tab=tools">وحدة SQL ← الأدوات</a>.</div>` : ''}
  `;

  el.onclick = e => {
    const t = e.target.closest('[data-chart]');
    if (!t || !t.dataset.chart) return;
    const kind = t.dataset.chart, key = t.dataset.key;
    tip.hide();
    if (kind === 'status') return go('fees', { status: key });
    if (!clickTarget) return;
    if (clickTarget === 'classlists') return kind === 'grade' ? go('classlists', { grade: key }) : null;
    go('students', { [kind]: key });
  };
};

/* =========================== Student form (shared) =========================== */
function studentFormHTML(s = {}, { showFee = true } = {}) {
  const levelId = s.academic_level || '';
  const gradeId = s.grade_level || '';
  const grade = gradeId ? Lookup.grade(gradeId) : null;
  return `
    <form class="student-form" novalidate>
      <div class="form-grid">
        <div class="field" style="grid-column:1/-1"><label>الاسم الكامل <span class="req">*</span></label>
          <input name="name" value="${esc(s.name)}" placeholder="الاسم الثلاثي واللقب" maxlength="120"><small class="err"></small></div>
        <div class="field"><label>الجنس <span class="req">*</span></label>
          <select name="gender">${opt('', '— اختر —', s.gender)}${Object.entries(GENDERS).map(([k, v]) => opt(k, v, s.gender)).join('')}</select><small class="err"></small></div>
        <div class="field"><label>نوع الدوام <span class="req">*</span></label>
          <select name="study_type">${Object.entries(STUDY_TYPES).map(([k, v]) => opt(k, v, s.study_type || 'Morning')).join('')}</select><small class="err"></small></div>
        <div class="field"><label>المرحلة الدراسية <span class="req">*</span></label>
          <select name="academic_level">${levelOptions(levelId, '— اختر المرحلة —')}</select><small class="err"></small></div>
        <div class="field"><label>الصف <span class="req">*</span></label>
          <select name="grade_level" ${levelId ? '' : 'disabled'}>${levelId ? gradeOptions(levelId, gradeId, '— اختر الصف —') : opt('', 'اختر المرحلة أولاً')}</select><small class="err"></small></div>
        <div class="field"><label>الشعبة <span class="req">*</span></label>
          <select name="section" ${gradeId ? '' : 'disabled'}>${gradeId ? sectionOptions(gradeId, s.section, '— اختر الشعبة —') : opt('', 'اختر الصف أولاً')}</select><small class="err"></small></div>
        <div class="field track-field" ${grade && grade.has_tracks ? '' : 'hidden'}><label>الفرع <span class="req">*</span></label>
          <select name="track">${opt('', '— اختر الفرع —', s.track)}${Object.entries(TRACKS).map(([k, v]) => opt(k, v, s.track)).join('')}</select><small class="err"></small></div>
        <div class="field"><label>هاتف ولي الأمر</label>
          <input name="guardian_phone" value="${esc(s.guardian_phone)}" dir="ltr" placeholder="07XXXXXXXXX" inputmode="tel"><small class="err"></small></div>
        <div class="field"><label>تاريخ التسجيل <span class="req">*</span></label>
          <input type="date" name="registration_date" value="${esc(s.registration_date || today())}" max="${today()}"><small class="err"></small></div>
        ${showFee ? `<div class="field"><label>القسط السنوي (د.ع) <span class="req">*</span></label>
          <input name="annual_fee" value="${esc(s.annual_fee ?? DB.setting('default_fee', DEFAULT_FEE))}" dir="ltr" inputmode="numeric"><small class="err"></small></div>` : ''}
      </div>
    </form>`;
}
function bindStudentForm(form) {
  const lv = form.elements.academic_level, gr = form.elements.grade_level, sec = form.elements.section;
  const trackField = $('.track-field', form);
  lv.addEventListener('change', () => {
    gr.innerHTML = lv.value ? gradeOptions(lv.value, '', '— اختر الصف —') : opt('', 'اختر المرحلة أولاً');
    gr.disabled = !lv.value;
    sec.innerHTML = opt('', 'اختر الصف أولاً'); sec.disabled = true;
    trackField.hidden = true;
  });
  gr.addEventListener('change', () => {
    sec.innerHTML = gr.value ? sectionOptions(gr.value, '', '— اختر الشعبة —') : opt('', 'اختر الصف أولاً');
    sec.disabled = !gr.value;
    const g = gr.value ? Lookup.grade(gr.value) : null;
    trackField.hidden = !(g && g.has_tracks);
    if (trackField.hidden) form.elements.track.value = '';
  });
  // live re-validation of a field once the user edits it
  form.addEventListener('input', e => { const f = e.target.closest('.field'); if (f) { f.classList.remove('invalid'); $('.err', f).textContent = ''; } });
}
/** Validates & persists. Returns student_id or null. */
function saveStudent(form, existing) {
  const showFee = !!form.elements.annual_fee;
  const rules = {
    name: [V.required('اسم الطالب مطلوب'), V.minLen(6, 'يرجى إدخال الاسم الثلاثي (6 أحرف على الأقل)'),
           v => (/^[\p{L}\s.'-]+$/u.test(v) ? null : 'الاسم يجب أن يحتوي على أحرف فقط')],
    gender: [V.required('يرجى اختيار الجنس')],
    study_type: [V.required()],
    academic_level: [V.required('يرجى اختيار المرحلة')],
    grade_level: [V.required('يرجى اختيار الصف')],
    section: [V.required('يرجى اختيار الشعبة'), (v, all) => {
      if (!v) return null;
      const s = DB.get(`SELECT capacity, (SELECT COUNT(*) FROM students WHERE section = ? AND student_id != ?) AS cnt FROM sections WHERE section_id = ?`, [+v, existing?.student_id || '', +v]);
      return s && s.cnt >= s.capacity ? `الشعبة ممتلئة (${s.cnt}/${s.capacity})` : null;
    }],
    track: [(v, all) => { const g = all.grade_level && Lookup.grade(all.grade_level); return g && g.has_tracks && !v ? 'يرجى اختيار الفرع (علمي/أدبي)' : null; }],
    guardian_phone: [V.phone],
    registration_date: [V.required('تاريخ التسجيل مطلوب'), V.date, V.notFuture],
  };
  if (showFee) rules.annual_fee = [V.required('القسط السنوي مطلوب'), V.int(0, 'أدخل مبلغاً صحيحاً (بدون كسور)'), v => {
    if (!existing) return null;
    const paid = DB.val('SELECT COALESCE(SUM(amount),0) FROM payments WHERE student_id = ?', [existing.student_id]);
    return toInt(v) < paid ? `لا يمكن أن يقل القسط عن المبلغ المدفوع (${moneyText(paid)})` : null;
  }];
  const v = V.run(form, rules);
  if (!v) return null;
  const grade = Lookup.grade(v.grade_level);
  const data = {
    name: v.name.replace(/\s+/g, ' ').trim(), gender: v.gender, study_type: v.study_type, academic_level: +v.academic_level,
    grade_level: +v.grade_level, section: +v.section, track: grade.has_tracks ? v.track : null,
    guardian_phone: (v.guardian_phone || '').replace(/[\s-]/g, '') || null, registration_date: v.registration_date,
  };
  if (showFee) data.annual_fee = toInt(v.annual_fee);
  try {
    if (existing) {
      const keys = Object.keys(data);
      const changed = keys.filter(k => String(existing[k] ?? '') !== String(data[k] ?? ''));
      commit('student_update', `تعديل بيانات الطالب ${existing.student_id} (${data.name}) — الحقول: ${changed.join(', ') || 'لا تغيير'}`, () =>
        DB.run(`UPDATE students SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE student_id = ?`, [...keys.map(k => data[k]), existing.student_id]));
      return existing.student_id;
    }
    return commit('student_create', `تسجيل طالب جديد: ${data.name} — ${grade.name}`, () => {
      const id = DB.nextStudentId();
      if (!showFee) data.annual_fee = toInt(DB.setting('default_fee', DEFAULT_FEE));
      const keys = ['student_id', ...Object.keys(data)];
      DB.run(`INSERT INTO students (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, [id, ...Object.values(data)]);
      return id;
    });
  } catch (e) {
    toast(friendlyError(e), 'error');
    return null;
  }
}
function editStudentModal(id, onDone) {
  const s = DB.get('SELECT * FROM students WHERE student_id = ?', [id]);
  if (!s) return toast('الطالب غير موجود', 'error');
  openModal({
    title: `تعديل بيانات الطالب — ${s.student_id}`, size: 'lg',
    body: studentFormHTML(s, { showFee: Auth.can('fees') }),
    onOpen: m => bindStudentForm($('form', m)),
    buttons: [
      { label: 'حفظ التعديلات', cls: 'btn-primary', onClick: (close, m) => { if (saveStudent($('form', m), s)) { close(); toast('تم حفظ التعديلات', 'success'); onDone && onDone(); } } },
      { label: 'إلغاء', cls: 'btn-ghost' },
    ],
  });
}
function viewStudentModal(id) {
  const { rows: [s] } = queryStudents({ id });
  if (!s) return;
  const fin = Auth.can('fees');
  const pays = fin ? DB.all(`SELECT p.*, e.name AS emp FROM payments p LEFT JOIN employees e ON e.employee_id = p.employee_id WHERE student_id = ? ORDER BY payment_date DESC, payment_id DESC`, [id]) : [];
  const kv = (k, v) => `<div><small class="muted">${k}</small><div><b>${v}</b></div></div>`;
  openModal({
    title: s.name, size: 'lg',
    body: `<div class="form-grid" style="gap:14px 16px">
      ${kv('رقم الطالب', `<span class="mono">${esc(s.student_id)}</span>`)}${kv('الجنس', GENDERS[s.gender])}${kv('نوع الدوام', STUDY_TYPES[s.study_type])}
      ${kv('المرحلة', esc(s.level_name))}${kv('الصف', esc(s.grade_name))}${kv('الشعبة', esc(s.section_name || '—'))}
      ${kv('الفرع', s.track ? TRACKS[s.track] : '—')}${kv('هاتف ولي الأمر', `<span class="num">${esc(s.guardian_phone || '—')}</span>`)}${kv('تاريخ التسجيل', esc(s.registration_date))}
      </div>
      ${fin ? `<hr style="border-color:var(--border);margin:18px 0">
      <div class="form-grid" style="gap:14px 16px">${kv('القسط السنوي', money(s.annual_fee))}${kv('المدفوع', money(s.paid))}${kv('المتبقي', money(Math.max(0, s.remaining)))}${kv('الحالة', statusBadge(s.paid, s.annual_fee))}</div>
      <h4 style="margin:18px 0 10px">سجل الدفعات</h4>
      <div class="table-wrap"><table><thead><tr><th>#</th><th>التاريخ</th><th>المبلغ</th><th>المستلم</th><th>ملاحظات</th></tr></thead><tbody>
      ${pays.map(p => `<tr><td class="num">${p.payment_id}</td><td>${esc(p.payment_date)}</td><td>${money(p.amount)}</td><td>${esc(p.emp || '—')}</td><td>${esc(p.notes || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">لا توجد دفعات</td></tr>'}
      </tbody></table></div>` : ''}`,
    buttons: [{ label: 'إغلاق', cls: 'btn-ghost' }],
  });
}
async function deleteStudent(id, onDone) {
  const s = DB.get('SELECT s.name, (SELECT COUNT(*) FROM payments WHERE student_id = s.student_id) AS n FROM students s WHERE student_id = ?', [id]);
  if (!s) return;
  const ok = await confirmDialog({
    title: 'حذف طالب', confirmLabel: 'حذف نهائي',
    message: `هل أنت متأكد من حذف الطالب <b>${esc(s.name)}</b> (${esc(id)})؟${s.n ? `<br><span style="color:#fca5a5">سيتم أيضاً حذف <b>${s.n}</b> دفعة مالية مرتبطة به.</span>` : ''}<br>لا يمكن التراجع عن هذه العملية.`,
  });
  if (!ok) return;
  try {
    commit('student_delete', `حذف الطالب ${id} (${s.name}) مع ${s.n} دفعة`, () => DB.run('DELETE FROM students WHERE student_id = ?', [id]));
    toast('تم حذف الطالب', 'success');
    onDone && onDone();
  } catch (e) { toast(friendlyError(e), 'error'); }
}

/* =========================== Students =========================== */
Pages.students = (el, params) => {
  const st = ui.students = ui.students || { f: {}, page: 1, sort: 'student_id', dir: 'ASC' };
  if (Object.keys(params).length) { st.f = { ...params }; st.page = 1; if (params.grade && !params.level) st.f.level = Lookup.grade(params.grade)?.level_id || ''; }
  const fin = Auth.can('fees');
  const f = st.f;
  el.innerHTML = `
    <div class="card">
      <div class="card-head"><h3>سجلات الطلاب</h3>
        <div class="row">
          <button class="btn btn-ghost btn-sm" data-act="csv">⇩ تصدير CSV</button>
          ${Auth.can('register') ? '<a class="btn btn-primary btn-sm" href="#/register">✚ طالب جديد</a>' : ''}
        </div></div>
      <form class="filters" id="st-filters" onsubmit="return false">
        <input name="q" placeholder="🔍 بحث بالاسم أو الرقم أو الهاتف" value="${esc(f.q)}" style="grid-column:span 2">
        <select name="level">${levelOptions(f.level)}</select>
        <select name="grade">${gradeOptions(f.level, f.grade)}</select>
        <select name="section">${f.grade ? sectionOptions(f.grade, f.section) + opt('none', 'بدون شعبة', f.section) : opt('', 'كل الشعب')}</select>
        <select name="gender">${opt('', 'كل الجنسين', f.gender)}${Object.entries(GENDERS).map(([k, v]) => opt(k, v, f.gender)).join('')}</select>
        <select name="study">${opt('', 'كل أنواع الدوام', f.study)}${Object.entries(STUDY_TYPES).map(([k, v]) => opt(k, v, f.study)).join('')}</select>
        <select name="track">${opt('', 'كل الفروع', f.track)}${Object.entries(TRACKS).map(([k, v]) => opt(k, v, f.track)).join('')}</select>
        ${fin ? `<select name="status">${opt('', 'كل حالات الدفع', f.status)}${opt('paid', 'مدفوع بالكامل', f.status)}${opt('partial', 'مدفوع جزئياً', f.status)}${opt('unpaid', 'غير مدفوع', f.status)}</select>` : ''}
        <button class="btn btn-ghost" type="button" data-act="reset">مسح الفلاتر</button>
      </form>
      <div id="st-table"></div>
    </div>`;
  const form = $('#st-filters', el);

  const renderTable = () => {
    const { total, rows } = queryStudents(st.f, { sort: st.sort, dir: st.dir, limit: PAGE_SIZE, offset: (st.page - 1) * PAGE_SIZE });
    $('#st-table', el).innerHTML = `<div class="table-wrap"><table><thead><tr>
        ${sortTh('رقم الطالب', 'student_id', st)}${sortTh('الاسم', 'name', st)}<th>الجنس</th>${sortTh('الصف / الشعبة', 'grade', st)}<th>الفرع</th><th>الدوام</th>
        ${sortTh('تاريخ التسجيل', 'reg', st)}${fin ? sortTh('المتبقي', 'remaining', st) + '<th>حالة الدفع</th>' : ''}<th>إجراءات</th></tr></thead><tbody>
      ${rows.map(s => `<tr>
        <td class="mono">${esc(s.student_id)}</td><td><b>${esc(s.name)}</b></td><td>${GENDERS[s.gender]}</td>
        <td>${esc(s.grade_name)} <small class="muted">/ ${esc(s.section_name || 'بدون شعبة')}</small></td>
        <td>${s.track ? TRACKS[s.track] : '<span class="muted">—</span>'}</td><td>${STUDY_TYPES[s.study_type]}</td><td class="num">${esc(s.registration_date)}</td>
        ${fin ? `<td>${money(Math.max(0, s.remaining))}</td><td>${statusBadge(s.paid, s.annual_fee)}</td>` : ''}
        <td class="actions"><button class="btn btn-sm btn-ghost" data-view="${esc(s.student_id)}">عرض</button>
          <button class="btn btn-sm" data-edit="${esc(s.student_id)}">تعديل</button>
          <button class="btn btn-sm btn-danger" data-del="${esc(s.student_id)}">حذف</button></td></tr>`).join('')
        || `<tr><td colspan="${fin ? 10 : 8}" class="empty">لا توجد نتائج مطابقة</td></tr>`}
      </tbody></table></div>${pager(total, st.page, 'students')}`;
  };

  const readFilters = () => { st.f = Object.fromEntries(Array.from(new FormData(form)).filter(([, v]) => v)); st.page = 1; };
  form.addEventListener('input', debounce(e => { if (e.target.name === 'q') { readFilters(); renderTable(); } }, 200));
  form.addEventListener('change', e => {
    if (e.target.name === 'level') { form.elements.grade.innerHTML = gradeOptions(e.target.value, ''); form.elements.section.innerHTML = opt('', 'كل الشعب'); }
    if (e.target.name === 'grade') form.elements.section.innerHTML = e.target.value ? sectionOptions(e.target.value, '') + opt('none', 'بدون شعبة', '') : opt('', 'كل الشعب');
    if (e.target.name !== 'q') { readFilters(); renderTable(); }
  });
  el.onclick = e => {
    const t = e.target.closest('button, th');
    if (!t) return;
    if (t.dataset.act === 'reset') { st.f = {}; st.page = 1; return go('students'); }
    if (t.dataset.act === 'csv') {
      const { rows } = queryStudents(st.f, { sort: st.sort, dir: st.dir });
      const head = ['رقم الطالب', 'الاسم', 'الجنس', 'المرحلة', 'الصف', 'الشعبة', 'الفرع', 'الدوام', 'هاتف ولي الأمر', 'تاريخ التسجيل', ...(fin ? ['القسط', 'المدفوع', 'المتبقي', 'الحالة'] : [])];
      download(`students-${today()}.csv`, toCSV(head, rows.map(s => [s.student_id, s.name, GENDERS[s.gender], s.level_name, s.grade_name, s.section_name || '', TRACKS[s.track] || '',
        STUDY_TYPES[s.study_type], s.guardian_phone || '', s.registration_date, ...(fin ? [s.annual_fee, s.paid, Math.max(0, s.remaining), paymentStatus(s.paid, s.annual_fee).label] : [])])), 'text/csv;charset=utf-8');
      commit('export_csv', `تصدير ${rows.length} سجل طالب إلى CSV`);
      return;
    }
    if (t.dataset.sort) { st.dir = st.sort === t.dataset.sort && st.dir === 'ASC' ? 'DESC' : 'ASC'; st.sort = t.dataset.sort; return renderTable(); }
    if (t.dataset.page) { st.page = +t.dataset.to; return renderTable(); }
    if (t.dataset.view) return viewStudentModal(t.dataset.view);
    if (t.dataset.edit) return editStudentModal(t.dataset.edit, renderTable);
    if (t.dataset.del) return deleteStudent(t.dataset.del, renderTable);
  };
  renderTable();
  if (location.hash.includes('?')) history.replaceState(null, '', '#/students');
};

/* =========================== Register =========================== */
Pages.register = el => {
  const recent = () => DB.all(`SELECT s.student_id, s.name, s.registration_date, g.name AS grade_name, sec.name AS section_name, s.study_type
      FROM students s JOIN grades g ON g.grade_id = s.grade_level LEFT JOIN sections sec ON sec.section_id = s.section
      ORDER BY s.rowid DESC LIMIT 10`);
  const nextId = () => { const seq = parseInt(DB.setting('student_seq', '0'), 10) + 1; return `STU-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`; };
  const draw = () => {
    el.innerHTML = `<div class="grid grid-3-1">
      <div class="card"><div class="card-head"><h3>استمارة تسجيل طالب جديد</h3><span class="badge plain b-blue">الرقم التالي: <span class="mono">${esc(nextId())}</span></span></div>
        ${studentFormHTML({}, { showFee: Auth.can('fees') })}
        ${Auth.can('fees') ? '' : `<p class="muted small">سيُطبّق القسط السنوي الافتراضي: ${money(DB.setting('default_fee', DEFAULT_FEE))}</p>`}
        <div class="row"><button class="btn btn-primary" data-act="save">✓ تسجيل الطالب</button><button class="btn btn-ghost" data-act="clear">تفريغ الحقول</button></div>
      </div>
      <div class="card"><div class="card-head"><h3>آخر التسجيلات</h3></div>
        <ul class="list">${recent().map(r => `<li><div class="avatar">${esc(initials(r.name))}</div><div class="grow"><b>${esc(r.name)}</b>
          <small>${esc(r.grade_name)} · ${esc(r.section_name || '—')} · ${STUDY_TYPES[r.study_type]}</small><small class="mono">${esc(r.student_id)}</small></div></li>`).join('')
          || '<li class="muted">لا توجد تسجيلات بعد</li>'}</ul></div></div>`;
    bindStudentForm($('form', el));
  };
  el.onclick = e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'clear') draw();
    if (a === 'save') {
      const id = saveStudent($('form', el), null);
      if (id) { toast(`تم تسجيل الطالب بنجاح — الرقم ${id}`, 'success'); draw(); }
    }
  };
  draw();
};

/* =========================== Sections =========================== */
Pages.sections = (el, params) => {
  const st = ui.sections = ui.sections || { grade: 1 };
  if (params.grade) st.grade = +params.grade;
  const draw = () => {
    const grade = Lookup.grade(st.grade) || Lookup.grades()[0];
    if (!grade) { el.innerHTML = '<div class="card empty">لا توجد صفوف معرفة</div>'; return; }
    st.grade = grade.grade_id;
    const secs = Lookup.sections(grade.grade_id);
    const students = DB.all('SELECT student_id, name, gender, section, track FROM students WHERE grade_level = ? ORDER BY name', [grade.grade_id]);
    const moveSel = s => `<select data-move="${esc(s.student_id)}" title="نقل إلى شعبة">${opt('', 'نقل…', '')}${secs.filter(x => x.section_id !== s.section).map(x => opt(x.section_id, x.name, '')).join('')}</select>`;
    const chip = s => `<div class="chip" draggable="true" data-sid="${esc(s.student_id)}"><span>${s.gender === 'male' ? '♂' : '♀'} ${esc(s.name)}${s.track ? ` <small class="muted">(${TRACKS[s.track]})</small>` : ''}</span>${moveSel(s)}</div>`;
    const unassigned = students.filter(s => !s.section);
    el.innerHTML = `
      <div class="card"><div class="card-head"><h3>توزيع الطلاب على الشعب</h3>
        <div class="row"><select id="sec-grade" style="width:auto">${Lookup.levels().map(l => `<optgroup label="${esc(l.name)}">${Lookup.grades(l.level_id).map(g => opt(g.grade_id, g.name, grade.grade_id)).join('')}</optgroup>`).join('')}</select>
        <button class="btn btn-primary btn-sm" data-act="add">✚ إضافة شعبة</button><button class="btn btn-ghost btn-sm" data-act="balance" ${students.length ? '' : 'disabled'}>⇄ توزيع متوازن تلقائي</button></div></div>
        <p class="muted small" style="margin-top:-6px">اسحب بطاقة الطالب وأفلتها في الشعبة المطلوبة، أو استخدم قائمة "نقل…". ${grade.has_tracks ? 'هذا الصف يحتوي على فرعَي علمي وأدبي.' : ''}</p>
        <div class="sec-board">
          ${secs.map(s => `<div class="sec-col" data-drop="${s.section_id}">
            <h4><span>${esc(s.name)} <small class="muted num">(${s.cnt}/${s.capacity})</small></span>
              <span class="row" style="gap:4px"><button class="btn btn-sm btn-ghost" data-edit-sec="${s.section_id}" title="تعديل">✎</button>
              <button class="btn btn-sm btn-danger" data-del-sec="${s.section_id}" title="حذف">✕</button></span></h4>
            <div class="progress" style="margin-bottom:10px"><span style="width:${Math.min(100, s.cnt / s.capacity * 100)}%;background:${s.cnt >= s.capacity ? 'var(--danger)' : 'var(--primary)'}"></span></div>
            ${students.filter(x => x.section === s.section_id).map(chip).join('') || '<small class="muted">لا يوجد طلاب</small>'}</div>`).join('')}
          ${unassigned.length ? `<div class="sec-col" data-drop="" style="border-style:dashed"><h4><span>بدون شعبة <small class="muted num">(${unassigned.length})</small></span></h4>${unassigned.map(chip).join('')}</div>` : ''}
        </div></div>`;
  };

  const move = (sid, secId) => {
    secId = secId ? +secId : null;
    const s = DB.get('SELECT name, section FROM students WHERE student_id = ?', [sid]);
    if (!s || s.section === secId) return;
    if (secId) {
      const sec = DB.get('SELECT name, capacity, (SELECT COUNT(*) FROM students WHERE section = ?) AS cnt FROM sections WHERE section_id = ?', [secId, secId]);
      if (sec.cnt >= sec.capacity) return toast(`لا يمكن النقل: ${sec.name} ممتلئة (${sec.cnt}/${sec.capacity})`, 'error');
      commit('section_assign', `نقل الطالب ${sid} (${s.name}) إلى ${sec.name}`, () => DB.run('UPDATE students SET section = ? WHERE student_id = ?', [secId, sid]));
      toast(`تم نقل ${s.name} إلى ${sec.name}`, 'success');
    } else {
      commit('section_assign', `إلغاء تعيين شعبة الطالب ${sid}`, () => DB.run('UPDATE students SET section = NULL WHERE student_id = ?', [sid]));
    }
    draw();
  };

  const sectionModal = sec => {
    openModal({
      title: sec ? `تعديل ${sec.name}` : 'إضافة شعبة جديدة', size: 'sm',
      body: `<form novalidate><div class="field"><label>اسم الشعبة <span class="req">*</span></label><input name="name" value="${esc(sec ? sec.name : 'شعبة ')}"><small class="err"></small></div>
        <div class="field"><label>السعة القصوى <span class="req">*</span></label><input name="capacity" value="${esc(sec ? sec.capacity : 35)}" dir="ltr" inputmode="numeric"><small class="err"></small></div></form>`,
      buttons: [{ label: 'حفظ', cls: 'btn-primary', onClick: (close, m) => {
        const form = $('form', m);
        const cnt = sec ? DB.val('SELECT COUNT(*) FROM students WHERE section = ?', [sec.section_id]) : 0;
        const v = V.run(form, { name: [V.required('اسم الشعبة مطلوب'), V.minLen(2)], capacity: [V.required(), V.int(1, 'السعة يجب أن تكون 1 على الأقل'), x => (toInt(x) < cnt ? `السعة أقل من عدد الطلاب الحاليين (${cnt})` : null)] });
        if (!v) return;
        try {
          if (sec) commit('section_update', `تعديل الشعبة ${sec.name} → ${v.name} (سعة ${v.capacity})`, () => DB.run('UPDATE sections SET name = ?, capacity = ? WHERE section_id = ?', [v.name.trim(), toInt(v.capacity), sec.section_id]));
          else commit('section_create', `إضافة ${v.name} إلى ${Lookup.grade(st.grade).name}`, () => DB.run('INSERT INTO sections (grade_id, name, capacity) VALUES (?, ?, ?)', [st.grade, v.name.trim(), toInt(v.capacity)]));
          close(); toast('تم الحفظ', 'success'); draw();
        } catch (e) { V.set(form, 'name', friendlyError(e)); }
      } }, { label: 'إلغاء', cls: 'btn-ghost' }],
    });
  };

  el.onclick = async e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.act === 'add') return sectionModal(null);
    if (t.dataset.editSec) return sectionModal(DB.get('SELECT * FROM sections WHERE section_id = ?', [+t.dataset.editSec]));
    if (t.dataset.delSec) {
      const sec = DB.get('SELECT *, (SELECT COUNT(*) FROM students WHERE section = section_id) AS cnt FROM sections WHERE section_id = ?', [+t.dataset.delSec]);
      if (!await confirmDialog({ title: 'حذف شعبة', message: `حذف <b>${esc(sec.name)}</b>؟${sec.cnt ? `<br>سيصبح <b>${sec.cnt}</b> طالباً بدون شعبة.` : ''}`, confirmLabel: 'حذف' })) return;
      commit('section_delete', `حذف ${sec.name} من ${Lookup.grade(sec.grade_id).name} (${sec.cnt} طالب أصبحوا بدون شعبة)`, () => DB.run('DELETE FROM sections WHERE section_id = ?', [sec.section_id]));
      toast('تم حذف الشعبة', 'success');
      return draw();
    }
    if (t.dataset.act === 'balance') {
      const secs = Lookup.sections(st.grade);
      if (!secs.length) return toast('لا توجد شعب لهذا الصف', 'error');
      const cap = secs.reduce((a, s) => a + s.capacity, 0);
      const studs = DB.all('SELECT student_id FROM students WHERE grade_level = ? ORDER BY gender, name', [st.grade]);
      if (studs.length > cap) return toast(`عدد الطلاب (${studs.length}) يتجاوز السعة الكلية (${cap})`, 'error');
      if (!await confirmDialog({ title: 'توزيع تلقائي', message: `سيتم إعادة توزيع <b>${studs.length}</b> طالباً على <b>${secs.length}</b> شعب بالتساوي مع موازنة الجنسين. متابعة؟`, confirmLabel: 'توزيع', danger: false })) return;
      const load = secs.map(() => 0);
      commit('section_balance', `توزيع تلقائي لطلاب ${Lookup.grade(st.grade).name} على ${secs.length} شعب`, () => {
        studs.forEach((s, i) => {
          let idx = i % secs.length;
          while (load[idx] >= secs[idx].capacity) idx = (idx + 1) % secs.length;
          load[idx]++;
          DB.run('UPDATE students SET section = ? WHERE student_id = ?', [secs[idx].section_id, s.student_id]);
        });
      });
      toast('تم التوزيع بنجاح', 'success');
      draw();
    }
  };
  el.onchange = e => {
    if (e.target.id === 'sec-grade') { st.grade = +e.target.value; draw(); }
    if (e.target.dataset.move !== undefined && e.target.value) move(e.target.dataset.move, e.target.value);
  };
  el.ondragstart = e => { const c = e.target.closest('.chip'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.sid); c.classList.add('dragging'); } };
  el.ondragend = e => { const c = e.target.closest('.chip'); if (c) c.classList.remove('dragging'); };
  el.ondragover = e => { const col = e.target.closest('[data-drop]'); if (col) { e.preventDefault(); $$('.sec-col', el).forEach(x => x.classList.toggle('drop', x === col)); } };
  el.ondragleave = e => { if (!e.relatedTarget || !el.contains(e.relatedTarget)) $$('.sec-col', el).forEach(x => x.classList.remove('drop')); };
  el.ondrop = e => {
    const col = e.target.closest('[data-drop]');
    $$('.sec-col', el).forEach(x => x.classList.remove('drop'));
    if (!col) return;
    e.preventDefault();
    move(e.dataTransfer.getData('text/plain'), col.dataset.drop);
  };
  draw();
};

/* =========================== Class lists (read-only) =========================== */
Pages.classlists = (el, params) => {
  const st = ui.classlists = ui.classlists || { grade: '', section: '' };
  if (params.grade) { st.grade = params.grade; st.section = ''; }
  const draw = () => {
    const { rows } = st.grade ? queryStudents({ grade: st.grade, section: st.section }, { sort: 'name' }) : { rows: [] };
    const grade = st.grade ? Lookup.grade(st.grade) : null;
    el.innerHTML = `<div class="card">
      <div class="card-head"><h3>قوائم الصفوف <span class="badge plain b-gray">للعرض فقط</span></h3>
        <button class="btn btn-ghost btn-sm" data-act="print" ${rows.length ? '' : 'disabled'}>⎙ طباعة القائمة</button></div>
      <div class="filters">
        <select id="cl-grade">${opt('', '— اختر الصف —', st.grade)}${Lookup.levels().map(l => `<optgroup label="${esc(l.name)}">${Lookup.grades(l.level_id).map(g => opt(g.grade_id, g.name, st.grade)).join('')}</optgroup>`).join('')}</select>
        <select id="cl-section" ${st.grade ? '' : 'disabled'}>${st.grade ? sectionOptions(st.grade, st.section) : opt('', 'كل الشعب')}</select>
      </div>
      ${!st.grade ? '<div class="empty">اختر صفاً لعرض قائمة الطلاب</div>' : `
      <div class="row" style="margin-bottom:12px"><span class="badge plain b-blue">عدد الطلاب: <span class="num">${rows.length}</span></span>
        <span class="badge plain b-gray">ذكور: <span class="num">${rows.filter(r => r.gender === 'male').length}</span></span>
        <span class="badge plain b-gray">إناث: <span class="num">${rows.filter(r => r.gender === 'female').length}</span></span></div>
      <div id="print-src"><div class="table-wrap"><table><thead><tr><th>#</th><th>اسم الطالب</th><th>رقم الطالب</th><th>الجنس</th><th>الشعبة</th>${grade.has_tracks ? '<th>الفرع</th>' : ''}<th>الدوام</th></tr></thead><tbody>
      ${rows.map((s, i) => `<tr><td class="num">${i + 1}</td><td><b>${esc(s.name)}</b></td><td class="mono">${esc(s.student_id)}</td><td>${GENDERS[s.gender]}</td>
        <td>${esc(s.section_name || '—')}</td>${grade.has_tracks ? `<td>${TRACKS[s.track] || '—'}</td>` : ''}<td>${STUDY_TYPES[s.study_type]}</td></tr>`).join('')
        || '<tr><td colspan="7" class="empty">لا يوجد طلاب في هذا الاختيار</td></tr>'}</tbody></table></div></div>`}
    </div>`;
  };
  el.onchange = e => {
    if (e.target.id === 'cl-grade') { st.grade = e.target.value; st.section = ''; draw(); }
    if (e.target.id === 'cl-section') { st.section = e.target.value; draw(); }
  };
  el.onclick = e => {
    if (e.target.closest('[data-act="print"]')) {
      const g = Lookup.grade(st.grade), sec = st.section ? DB.get('SELECT name FROM sections WHERE section_id = ?', [+st.section]) : null;
      printHTML(`<h2>${esc(DB.setting('school_name', ''))}</h2><h3>قائمة طلاب ${esc(g.name)} ${sec ? '— ' + esc(sec.name) : ''}</h3>${$('#print-src', el).innerHTML}`);
    }
  };
  draw();
};

function printHTML(html) {
  const area = document.createElement('div');
  area.id = 'print-area';
  area.dir = 'rtl';
  area.innerHTML = `<style>#print-area table{width:100%;border-collapse:collapse}#print-area th,#print-area td{border:1px solid #999;padding:6px;color:#000;background:#fff;text-align:right}#print-area *{color:#000}</style>${html}`;
  document.body.appendChild(area);
  window.print();
  setTimeout(() => area.remove(), 500);
}

/* =========================== Fees =========================== */
function paymentModal(studentId, onDone) {
  const { rows: [s] } = queryStudents({ id: studentId });
  if (!s) return;
  const remaining = Math.max(0, s.remaining);
  if (remaining <= 0) return toast('هذا الطالب مسدد بالكامل', 'info');
  openModal({
    title: `تسجيل دفعة — ${s.name}`,
    body: `<div class="grid" style="grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
        <div class="card" style="padding:12px"><small class="muted">القسط السنوي</small><div><b>${money(s.annual_fee)}</b></div></div>
        <div class="card" style="padding:12px;margin:0"><small class="muted">المدفوع</small><div><b style="color:#4ade80">${money(s.paid)}</b></div></div>
        <div class="card" style="padding:12px;margin:0"><small class="muted">المتبقي</small><div><b style="color:#f87171">${money(remaining)}</b></div></div></div>
      <form novalidate>
        <div class="field"><label>المبلغ (د.ع) <span class="req">*</span></label><input name="amount" dir="ltr" inputmode="numeric" placeholder="0"><small class="err"></small>
          <div class="chips-row" style="margin-top:8px">
            <button type="button" class="btn btn-sm btn-ghost" data-fill="${remaining}">كامل المتبقي</button>
            <button type="button" class="btn btn-sm btn-ghost" data-fill="${Math.round(remaining / 2)}">نصف المتبقي</button>
            ${[250000, 500000, 750000].filter(a => a < remaining).map(a => `<button type="button" class="btn btn-sm btn-ghost" data-fill="${a}">${intFmt(a)}</button>`).join('')}</div></div>
        <div class="form-grid">
          <div class="field"><label>تاريخ الدفع <span class="req">*</span></label><input type="date" name="payment_date" value="${today()}" max="${today()}"><small class="err"></small></div>
          <div class="field"><label>ملاحظات</label><input name="notes" maxlength="200" placeholder="مثال: القسط الثاني نقداً"><small class="err"></small></div>
        </div>
        <label class="row small muted" style="gap:6px"><input type="checkbox" name="print" value="1"> طباعة وصل بعد الحفظ</label>
      </form>`,
    onOpen: m => {
      m.addEventListener('click', e => { const b = e.target.closest('[data-fill]'); if (b) { $('[name=amount]', m).value = intFmt(b.dataset.fill); $('[name=amount]', m).dispatchEvent(new Event('input')); } });
      $('[name=amount]', m).addEventListener('input', e => {
        const n = toInt(e.target.value);
        if (n) e.target.value = intFmt(n);
        const f = e.target.closest('.field'); f.classList.remove('invalid'); $('.err', f).textContent = '';
      });
    },
    buttons: [{ label: '✓ حفظ الدفعة', cls: 'btn-primary', onClick: (close, m) => {
      const form = $('form', m);
      const v = V.run(form, {
        amount: [V.required('المبلغ مطلوب'), V.int(1, 'أدخل مبلغاً صحيحاً أكبر من صفر'), x => (toInt(x) > remaining ? `المبلغ يتجاوز المتبقي (${moneyText(remaining)})` : null)],
        payment_date: [V.required('التاريخ مطلوب'), V.date, V.notFuture],
      });
      if (!v) return;
      const amount = toInt(v.amount);
      try {
        const pid = commit('payment_create', `دفعة ${moneyText(amount)} للطالب ${s.student_id} (${s.name})`, () =>
          DB.run('INSERT INTO payments (student_id, amount, payment_date, employee_id, notes) VALUES (?, ?, ?, ?, ?)',
            [s.student_id, amount, v.payment_date, Auth.user.employee_id, v.notes?.trim() || null]).lastId);
        close();
        toast(`تم تسجيل دفعة بمبلغ ${moneyText(amount)}`, 'success');
        if (v.print) printReceipt(pid);
        onDone && onDone();
      } catch (e) { toast(friendlyError(e), 'error'); }
    } }, { label: 'إلغاء', cls: 'btn-ghost' }],
  });
}
function printReceipt(pid) {
  const p = DB.get(`SELECT p.*, s.name AS student, s.annual_fee, g.name AS grade, e.name AS emp,
      (SELECT SUM(amount) FROM payments WHERE student_id = p.student_id) AS total_paid
      FROM payments p JOIN students s USING (student_id) JOIN grades g ON g.grade_id = s.grade_level LEFT JOIN employees e ON e.employee_id = p.employee_id WHERE payment_id = ?`, [pid]);
  if (!p) return;
  printHTML(`<div style="max-width:520px;margin:auto;border:2px solid #000;padding:20px">
    <h2 style="text-align:center;margin:0">${esc(DB.setting('school_name', ''))}</h2><p style="text-align:center">وصل استلام قسط دراسي</p>
    <table><tr><th>رقم الوصل</th><td>${p.payment_id}</td></tr><tr><th>التاريخ</th><td>${esc(p.payment_date)}</td></tr>
    <tr><th>اسم الطالب</th><td>${esc(p.student)} (${esc(p.student_id)})</td></tr><tr><th>الصف</th><td>${esc(p.grade)}</td></tr>
    <tr><th>المبلغ المستلم</th><td><b>${moneyText(p.amount)}</b></td></tr><tr><th>إجمالي المدفوع</th><td>${moneyText(p.total_paid)}</td></tr>
    <tr><th>المتبقي</th><td>${moneyText(Math.max(0, p.annual_fee - p.total_paid))}</td></tr><tr><th>المستلم</th><td>${esc(p.emp || '')}</td></tr>
    ${p.notes ? `<tr><th>ملاحظات</th><td>${esc(p.notes)}</td></tr>` : ''}</table><p style="margin-top:40px">التوقيع: ....................</p></div>`);
}
function feeModal(id, onDone) {
  const s = DB.get('SELECT s.*, COALESCE((SELECT SUM(amount) FROM payments WHERE student_id = s.student_id),0) AS paid FROM students s WHERE student_id = ?', [id]);
  openModal({
    title: `تعديل القسط السنوي — ${s.name}`, size: 'sm',
    body: `<form novalidate><div class="field"><label>القسط السنوي (د.ع) <span class="req">*</span></label><input name="fee" dir="ltr" value="${intFmt(s.annual_fee)}" inputmode="numeric"><small class="err"></small></div>
      <p class="muted small">المبلغ المدفوع حالياً: ${money(s.paid)}</p></form>`,
    buttons: [{ label: 'حفظ', cls: 'btn-primary', onClick: (close, m) => {
      const v = V.run($('form', m), { fee: [V.required(), V.int(0, 'أدخل مبلغاً صحيحاً'), x => (toInt(x) < s.paid ? `لا يمكن أن يقل عن المدفوع (${moneyText(s.paid)})` : null)] });
      if (!v) return;
      commit('fee_update', `تعديل قسط الطالب ${id} من ${moneyText(s.annual_fee)} إلى ${moneyText(toInt(v.fee))}`, () => DB.run('UPDATE students SET annual_fee = ? WHERE student_id = ?', [toInt(v.fee), id]));
      close(); toast('تم تحديث القسط', 'success'); onDone && onDone();
    } }, { label: 'إلغاء', cls: 'btn-ghost' }],
  });
}

Pages.fees = (el, params) => {
  const st = ui.fees = ui.fees || { tab: 'balances', f: {}, page: 1, sort: 'remaining', dir: 'DESC', pf: {}, ppage: 1 };
  if (params.tab) st.tab = params.tab;
  if (params.status) { st.tab = 'balances'; st.f = { status: params.status }; st.page = 1; }
  if (location.hash.includes('?')) history.replaceState(null, '', '#/fees');

  const summary = () => {
    const t = DB.get(`SELECT COUNT(*) AS n, COALESCE(SUM(annual_fee),0) AS expected FROM students`);
    const paid = DB.val('SELECT COALESCE(SUM(amount),0) FROM payments');
    const outstanding = DB.val(`SELECT COALESCE(SUM(MAX(s.annual_fee - COALESCE(p.paid,0),0)),0) FROM students s LEFT JOIN (SELECT student_id, SUM(amount) paid FROM payments GROUP BY student_id) p USING (student_id)`);
    return `<div class="grid grid-4" style="margin-bottom:18px">
      <div class="card stat c-blue"><div class="badge-ico">∑</div><div class="label">إجمالي الأقساط المستحقة</div><div class="value">${money(t.expected)}</div><div class="sub"><span class="num">${t.n}</span> طالب</div></div>
      <div class="card stat c-green"><div class="badge-ico">✓</div><div class="label">المحصّل</div><div class="value">${money(paid)}</div><div class="sub">نسبة التحصيل <span class="num">${t.expected ? Math.round(paid / t.expected * 100) : 0}%</span></div></div>
      <div class="card stat c-red"><div class="badge-ico">!</div><div class="label">المتبقي</div><div class="value">${money(outstanding)}</div><div class="sub">القسط الافتراضي ${money(DB.setting('default_fee', DEFAULT_FEE))}</div></div>
    </div>`;
  };

  const draw = () => {
    el.innerHTML = `${summary()}<div class="card">
      <div class="tabs"><button data-tab="balances" class="${st.tab === 'balances' ? 'active' : ''}">أرصدة الطلاب</button>
        <button data-tab="payments" class="${st.tab === 'payments' ? 'active' : ''}">سجل المعاملات</button>
        <button data-tab="settings" class="${st.tab === 'settings' ? 'active' : ''}">إعدادات الأقساط</button></div>
      <div id="fee-body"></div></div>`;
    ({ balances: drawBalances, payments: drawPayments, settings: drawSettings })[st.tab]();
  };

  const drawBalances = () => {
    const f = st.f;
    $('#fee-body', el).innerHTML = `<form class="filters" id="fee-filters" onsubmit="return false">
        <input name="q" placeholder="🔍 اسم الطالب أو رقمه" value="${esc(f.q)}" style="grid-column:span 2">
        <select name="level">${levelOptions(f.level)}</select><select name="grade">${gradeOptions(f.level, f.grade)}</select>
        <select name="status">${opt('', 'كل الحالات', f.status)}${opt('paid', '🟢 مدفوع بالكامل', f.status)}${opt('partial', '🟡 مدفوع جزئياً', f.status)}${opt('unpaid', '🔴 غير مدفوع', f.status)}</select>
        <button class="btn btn-ghost" type="button" data-act="csv">⇩ CSV</button></form><div id="fee-table"></div>`;
    const form = $('#fee-filters', el);
    const read = () => { st.f = Object.fromEntries(Array.from(new FormData(form)).filter(([, v]) => v)); st.page = 1; table(); };
    form.oninput = debounce(e => { if (e.target.name === 'q') read(); });
    form.onchange = e => { if (e.target.name === 'level') form.elements.grade.innerHTML = gradeOptions(e.target.value, ''); if (e.target.name !== 'q') read(); };
    const table = () => {
      const { total, rows } = queryStudents(st.f, { sort: st.sort, dir: st.dir, limit: PAGE_SIZE, offset: (st.page - 1) * PAGE_SIZE });
      $('#fee-table', el).innerHTML = `<div class="table-wrap"><table><thead><tr>${sortTh('الطالب', 'name', st)}<th>الصف</th>${sortTh('القسط السنوي', 'fee', st)}${sortTh('المدفوع', 'paid', st)}${sortTh('المتبقي', 'remaining', st)}<th>نسبة السداد</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>
        ${rows.map(s => `<tr><td><b>${esc(s.name)}</b><br><small class="mono muted">${esc(s.student_id)}</small></td><td>${esc(s.grade_name)}<br><small class="muted">${esc(s.section_name || '')}</small></td>
          <td>${money(s.annual_fee)}</td><td style="color:#4ade80">${money(s.paid)}</td><td style="color:${s.remaining > 0 ? '#f87171' : 'inherit'}">${money(Math.max(0, s.remaining))}</td>
          <td style="min-width:130px">${progressBar(s.paid, s.annual_fee)}</td><td>${statusBadge(s.paid, s.annual_fee)}</td>
          <td class="actions"><button class="btn btn-sm btn-success" data-pay="${esc(s.student_id)}" ${s.remaining > 0 ? '' : 'disabled'}>+ دفعة</button>
            <button class="btn btn-sm btn-ghost" data-hist="${esc(s.student_id)}">السجل (${s.pay_count})</button>
            <button class="btn btn-sm btn-ghost" data-fee="${esc(s.student_id)}" title="تعديل القسط">✎</button></td></tr>`).join('')
          || '<tr><td colspan="8" class="empty">لا توجد نتائج</td></tr>'}</tbody></table></div>${pager(total, st.page, 'fees')}`;
    };
    $('#fee-body', el).onclick = e => {
      const t = e.target.closest('button, th');
      if (!t) return;
      if (t.dataset.sort) { st.dir = st.sort === t.dataset.sort && st.dir === 'DESC' ? 'ASC' : 'DESC'; st.sort = t.dataset.sort; return table(); }
      if (t.dataset.page) { st.page = +t.dataset.to; return table(); }
      if (t.dataset.pay) return paymentModal(t.dataset.pay, draw);
      if (t.dataset.hist) return viewStudentModal(t.dataset.hist);
      if (t.dataset.fee) return feeModal(t.dataset.fee, draw);
      if (t.dataset.act === 'csv') {
        const { rows } = queryStudents(st.f, { sort: st.sort, dir: st.dir });
        download(`balances-${today()}.csv`, toCSV(['رقم الطالب', 'الاسم', 'الصف', 'القسط', 'المدفوع', 'المتبقي', 'الحالة'],
          rows.map(s => [s.student_id, s.name, s.grade_name, s.annual_fee, s.paid, Math.max(0, s.remaining), paymentStatus(s.paid, s.annual_fee).label])), 'text/csv;charset=utf-8');
      }
    };
    table();
  };

  const drawPayments = () => {
    const f = st.pf;
    const where = [], p = [];
    if (f.q) { where.push('(s.name LIKE ? OR p.student_id LIKE ? OR p.notes LIKE ?)'); p.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }
    if (f.from) { where.push('p.payment_date >= ?'); p.push(f.from); }
    if (f.to) { where.push('p.payment_date <= ?'); p.push(f.to); }
    if (f.emp) { where.push('p.employee_id = ?'); p.push(+f.emp); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const agg = DB.get(`SELECT COUNT(*) AS n, COALESCE(SUM(p.amount),0) AS sum FROM payments p JOIN students s USING (student_id) ${w}`, p);
    const rows = DB.all(`SELECT p.*, s.name AS student, e.name AS emp FROM payments p JOIN students s USING (student_id) LEFT JOIN employees e ON e.employee_id = p.employee_id ${w}
      ORDER BY p.payment_date DESC, p.payment_id DESC LIMIT ${PAGE_SIZE} OFFSET ${(st.ppage - 1) * PAGE_SIZE}`, p);
    const emps = DB.all('SELECT DISTINCT e.employee_id, e.name FROM payments p JOIN employees e ON e.employee_id = p.employee_id ORDER BY e.name');
    $('#fee-body', el).innerHTML = `<form class="filters" id="pay-filters" onsubmit="return false">
        <input name="q" placeholder="🔍 طالب أو ملاحظة" value="${esc(f.q)}">
        <label class="row small muted" style="gap:6px;flex-wrap:nowrap">من <input type="date" name="from" value="${esc(f.from)}"></label>
        <label class="row small muted" style="gap:6px;flex-wrap:nowrap">إلى <input type="date" name="to" value="${esc(f.to)}"></label>
        <select name="emp">${opt('', 'كل الموظفين', f.emp)}${emps.map(e => opt(e.employee_id, e.name, f.emp)).join('')}</select></form>
      <div class="row" style="margin-bottom:12px"><span class="badge plain b-green">إجمالي المعاملات المعروضة: ${money(agg.sum)} (<span class="num">${agg.n}</span>)</span></div>
      <div class="table-wrap"><table><thead><tr><th>رقم الوصل</th><th>التاريخ</th><th>الطالب</th><th>المبلغ</th><th>المستلم</th><th>ملاحظات</th><th>إجراءات</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="num">${r.payment_id}</td><td class="num">${esc(r.payment_date)}</td><td><b>${esc(r.student)}</b> <small class="mono muted">${esc(r.student_id)}</small></td>
        <td><b>${money(r.amount)}</b></td><td>${esc(r.emp || '—')}</td><td>${esc(r.notes || '')}</td>
        <td class="actions"><button class="btn btn-sm btn-ghost" data-print="${r.payment_id}">⎙ وصل</button>
          <button class="btn btn-sm btn-danger" data-delpay="${r.payment_id}">إلغاء</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">لا توجد معاملات</td></tr>'}
      </tbody></table></div>${pager(agg.n, st.ppage, 'payments')}`;
    const form = $('#pay-filters', el);
    const read = () => { st.pf = Object.fromEntries(Array.from(new FormData(form)).filter(([, v]) => v)); st.ppage = 1; drawPayments(); };
    form.onchange = read;
    form.oninput = debounce(e => { if (e.target.name === 'q') { read(); const q = $('#pay-filters [name=q]', el); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 350);
    $('#fee-body', el).onclick = async e => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.page) { st.ppage = +t.dataset.to; return drawPayments(); }
      if (t.dataset.print) return printReceipt(+t.dataset.print);
      if (t.dataset.delpay) {
        const pay = DB.get('SELECT p.*, s.name FROM payments p JOIN students s USING (student_id) WHERE payment_id = ?', [+t.dataset.delpay]);
        if (!await confirmDialog({ title: 'إلغاء معاملة', message: `إلغاء الدفعة رقم <b>${pay.payment_id}</b> بمبلغ <b>${moneyText(pay.amount)}</b> للطالب ${esc(pay.name)}؟ سيُسجَّل ذلك في سجل التدقيق.`, confirmLabel: 'إلغاء الدفعة' })) return;
        commit('payment_delete', `إلغاء الدفعة #${pay.payment_id} (${moneyText(pay.amount)}) للطالب ${pay.student_id} (${pay.name})`, () => DB.run('DELETE FROM payments WHERE payment_id = ?', [pay.payment_id]));
        toast('تم إلغاء المعاملة', 'success');
        draw();
      }
    };
  };

  const drawSettings = () => {
    const fee = toInt(DB.setting('default_fee', DEFAULT_FEE));
    $('#fee-body', el).innerHTML = `<form id="fee-settings" novalidate style="max-width:520px">
      <div class="field"><label>القسط السنوي الافتراضي للطلاب الجدد (د.ع)</label><input name="fee" dir="ltr" value="${intFmt(fee)}" inputmode="numeric"><small class="err"></small></div>
      <div class="field"><label>تطبيق القسط على الطلاب الحاليين</label>
        <select name="apply">${opt('', 'لا — للطلاب الجدد فقط', '')}${opt('all', 'جميع الطلاب الحاليين', '')}${Lookup.levels().map(l => opt('level:' + l.level_id, 'طلاب ' + l.name, '')).join('')}</select>
        <small class="muted">لن يُطبّق على طالب دفع أكثر من القسط الجديد.</small></div>
      <button class="btn btn-primary" type="submit">حفظ الإعدادات</button></form>`;
    $('#fee-settings', el).onsubmit = async e => {
      e.preventDefault();
      const v = V.run(e.target, { fee: [V.required(), V.int(0, 'أدخل مبلغاً صحيحاً')] });
      if (!v) return;
      const amount = toInt(v.fee);
      if (v.apply && !await confirmDialog({ title: 'تطبيق جماعي', message: `سيتم تعيين القسط السنوي إلى <b>${moneyText(amount)}</b> للطلاب المحددين. متابعة؟`, danger: false })) return;
      commit('fee_settings', `تعيين القسط الافتراضي إلى ${moneyText(amount)}${v.apply ? ' وتطبيقه على: ' + v.apply : ''}`, () => {
        DB.setSetting('default_fee', amount);
        if (v.apply) {
          const lvl = v.apply.startsWith('level:') ? +v.apply.split(':')[1] : null;
          DB.run(`UPDATE students SET annual_fee = ? WHERE COALESCE((SELECT SUM(amount) FROM payments p WHERE p.student_id = students.student_id),0) <= ?${lvl ? ' AND academic_level = ?' : ''}`,
            lvl ? [amount, amount, lvl] : [amount, amount]);
        }
      });
      toast('تم حفظ إعدادات الأقساط', 'success');
      draw();
    };
  };

  el.onclick = e => { const t = e.target.closest('[data-tab]'); if (t) { st.tab = t.dataset.tab; draw(); } };
  draw();
};

/* =========================== Employees =========================== */
function adminCoverageCheck() {
  const n = DB.all("SELECT permissions FROM employees WHERE status = 'active'").filter(r => { try { return JSON.parse(r.permissions).includes('employees'); } catch (e) { return false; } }).length;
  if (n === 0) throw new Error('يجب أن يبقى حساب نشط واحد على الأقل يملك صلاحية إدارة الموظفين');
}
function employeeModal(emp, onDone) {
  const isSelf = emp && emp.employee_id === Auth.user.employee_id;
  let perms = emp ? (() => { try { return JSON.parse(emp.permissions); } catch (e) { return []; } })() : ROLES.teacher.perms;
  const permBoxes = (list) => Object.entries(MODULES).map(([k, m]) =>
    `<label><input type="checkbox" name="perm" value="${k}" ${list.includes(k) || k === 'dashboard' ? 'checked' : ''} ${k === 'dashboard' ? 'disabled' : ''}> ${m.icon} ${esc(m.label)}</label>`).join('');
  openModal({
    title: emp ? `تعديل الموظف — ${emp.name}` : 'إضافة موظف جديد', size: 'lg',
    body: `<form novalidate><div class="form-grid">
      <div class="field"><label>الاسم الكامل <span class="req">*</span></label><input name="name" value="${esc(emp?.name)}"><small class="err"></small></div>
      <div class="field"><label>البريد الإلكتروني <span class="req">*</span></label><input name="email" type="email" dir="ltr" value="${esc(emp?.email)}"><small class="err"></small></div>
      <div class="field"><label>رقم الهاتف</label><input name="phone" dir="ltr" value="${esc(emp?.phone)}" placeholder="07XXXXXXXXX"><small class="err"></small></div>
      <div class="field"><label>الدور الوظيفي <span class="req">*</span></label><select name="role">${Object.entries(ROLES).map(([k, r]) => opt(k, r.label, emp?.role || 'teacher')).join('')}</select><small class="err"></small></div>
      <div class="field"><label>${emp ? 'كلمة مرور جديدة (اتركها فارغة للإبقاء)' : 'كلمة المرور <span class="req">*</span>'}</label><input name="password" type="password" dir="ltr" autocomplete="new-password"><small class="err"></small></div>
      <div class="field"><label>تأكيد كلمة المرور</label><input name="password2" type="password" dir="ltr" autocomplete="new-password"><small class="err"></small></div>
      <div class="field"><label>حالة الحساب</label><select name="status" ${isSelf ? 'disabled' : ''}>${opt('active', 'نشط', emp?.status || 'active')}${opt('suspended', 'موقوف', emp?.status)}</select><small class="err"></small></div>
      </div>
      <div class="field"><div class="row" style="margin-bottom:8px"><label style="margin:0">الصلاحيات المخصصة</label><div class="spacer"></div>
        <button type="button" class="btn btn-sm btn-ghost" data-reset-perms>استعادة صلاحيات الدور الافتراضية</button></div>
        <div class="perm-grid">${permBoxes(perms)}</div><small class="err" data-perm-err></small></div></form>`,
    onOpen: m => {
      const form = $('form', m);
      const applyRole = () => { $('.perm-grid', m).innerHTML = permBoxes(ROLES[form.elements.role.value].perms); };
      form.elements.role.addEventListener('change', applyRole);
      m.addEventListener('click', e => { if (e.target.closest('[data-reset-perms]')) applyRole(); });
    },
    buttons: [{ label: 'حفظ', cls: 'btn-primary', onClick: (close, m) => {
      const form = $('form', m);
      const v = V.run(form, {
        name: [V.required('الاسم مطلوب'), V.minLen(3)],
        email: [V.required('البريد مطلوب'), V.email, x => (DB.val('SELECT 1 FROM employees WHERE email = ? COLLATE NOCASE AND employee_id != ?', [x, emp?.employee_id || 0]) ? 'البريد الإلكتروني مستخدم مسبقاً' : null)],
        phone: [V.phone],
        password: [x => (!emp && !x ? 'كلمة المرور مطلوبة' : null), x => (x && x.length < 6 ? 'كلمة المرور يجب ألا تقل عن 6 أحرف' : null)],
        password2: [(x, all) => (all.password && x !== all.password ? 'كلمتا المرور غير متطابقتين' : null)],
      });
      if (!v) return;
      const chosen = ['dashboard', ...$$('input[name=perm]:checked:not(:disabled)', m).map(c => c.value)];
      if (isSelf && !chosen.includes('employees') && Auth.can('employees')) { $('[data-perm-err]', m).textContent = 'لا يمكنك إزالة صلاحية إدارة الموظفين من حسابك'; return; }
      const status = isSelf ? 'active' : v.status;
      try {
        commit(emp ? 'employee_update' : 'employee_create', `${emp ? 'تعديل' : 'إضافة'} الموظف ${v.name} (${v.email}) — الدور: ${ROLES[v.role].label} — الصلاحيات: ${chosen.join(', ')}${v.password && emp ? ' — تم تغيير كلمة المرور' : ''}`, () => {
          if (emp) {
            DB.run('UPDATE employees SET name = ?, email = ?, phone = ?, role = ?, permissions = ?, status = ? WHERE employee_id = ?',
              [v.name.trim(), v.email.trim(), v.phone || null, v.role, JSON.stringify(chosen), status, emp.employee_id]);
            if (v.password) DB.run('UPDATE employees SET password = ? WHERE employee_id = ?', [hashPassword(v.password), emp.employee_id]);
          } else {
            DB.run('INSERT INTO employees (name, email, password, phone, role, permissions, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [v.name.trim(), v.email.trim(), hashPassword(v.password), v.phone || null, v.role, JSON.stringify(chosen), status]);
          }
          adminCoverageCheck();
        });
        close();
        toast(emp ? 'تم تحديث بيانات الموظف' : 'تمت إضافة الموظف', 'success');
        onDone && onDone();
      } catch (e) { $('[data-perm-err]', m).textContent = friendlyError(e); toast(friendlyError(e), 'error'); }
    } }, { label: 'إلغاء', cls: 'btn-ghost' }],
  });
}

Pages.employees = el => {
  const st = ui.employees = ui.employees || { q: '', role: '', status: '' };
  const draw = () => {
    const where = [], p = [];
    if (st.q) { where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)'); p.push(`%${st.q}%`, `%${st.q}%`, `%${st.q}%`); }
    if (st.role) { where.push('role = ?'); p.push(st.role); }
    if (st.status) { where.push('status = ?'); p.push(st.status); }
    const rows = DB.all(`SELECT e.*, (SELECT COUNT(*) FROM payments WHERE employee_id = e.employee_id) AS pays,
        (SELECT MAX(timestamp) FROM db_log WHERE user_id = e.employee_id AND event_type = 'login') AS last_login
        FROM employees e ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY status, role = 'admin' DESC, name`, p);
    const counts = DB.all('SELECT role, COUNT(*) AS n FROM employees GROUP BY role');
    $('#emp-table', el).innerHTML = `<div class="row" style="margin-bottom:12px">${Object.entries(ROLES).map(([k, r]) => `<span class="badge plain ${r.badge}">${esc(r.label)}: <span class="num">${counts.find(c => c.role === k)?.n || 0}</span></span>`).join('')}</div>
      <div class="table-wrap"><table><thead><tr><th>الموظف</th><th>الهاتف</th><th>الدور</th><th>الصلاحيات</th><th>آخر دخول</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>
      ${rows.map(e => {
        let perms = []; try { perms = JSON.parse(e.permissions); } catch (_) { /* ignore */ }
        const custom = JSON.stringify([...perms].filter(x => x !== 'dashboard').sort()) !== JSON.stringify(ROLES[e.role].perms.filter(x => x !== 'dashboard').sort());
        const self = e.employee_id === Auth.user.employee_id;
        return `<tr style="${e.status === 'suspended' ? 'opacity:.6' : ''}">
          <td><div class="row" style="flex-wrap:nowrap"><div class="avatar">${esc(initials(e.name))}</div><div><b>${esc(e.name)}</b>${self ? ' <span class="badge plain b-blue">أنت</span>' : ''}<br><small class="mono muted">${esc(e.email)}</small></div></div></td>
          <td class="num">${esc(e.phone || '—')}</td><td>${roleBadge(e.role)}</td>
          <td><span data-tip="${esc(perms.map(k => MODULES[k]?.label).filter(Boolean).join('<br>'))}" class="badge plain ${custom ? 'b-yellow' : 'b-gray'}">${perms.length} صلاحيات${custom ? ' (مخصصة)' : ''}</span></td>
          <td class="num small">${esc(e.last_login || '—')}</td>
          <td><label class="switch" title="${self ? 'لا يمكنك إيقاف حسابك' : 'تفعيل / إيقاف'}"><input type="checkbox" data-toggle="${e.employee_id}" ${e.status === 'active' ? 'checked' : ''} ${self ? 'disabled' : ''}><span></span></label></td>
          <td class="actions"><button class="btn btn-sm" data-edit="${e.employee_id}">تعديل</button>
            <button class="btn btn-sm btn-danger" data-del="${e.employee_id}" ${self ? 'disabled' : ''}>حذف</button></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="empty">لا يوجد موظفون مطابقون</td></tr>'}</tbody></table></div>`;
  };
  el.innerHTML = `<div class="card"><div class="card-head"><h3>الموظفون والصلاحيات</h3><button class="btn btn-primary btn-sm" data-act="add">✚ موظف جديد</button></div>
    <div class="filters"><input id="emp-q" placeholder="🔍 الاسم أو البريد أو الهاتف" value="${esc(st.q)}">
      <select id="emp-role">${opt('', 'كل الأدوار', st.role)}${Object.entries(ROLES).map(([k, r]) => opt(k, r.label, st.role)).join('')}</select>
      <select id="emp-status">${opt('', 'كل الحالات', st.status)}${opt('active', 'نشط', st.status)}${opt('suspended', 'موقوف', st.status)}</select></div>
    <div id="emp-table"></div></div>
    <div class="card"><div class="card-head"><h3>مصفوفة الصلاحيات الافتراضية للأدوار</h3></div>
      <div class="table-wrap"><table><thead><tr><th>الدور</th>${Object.values(MODULES).map(m => `<th style="text-align:center">${esc(m.label)}</th>`).join('')}</tr></thead><tbody>
      ${Object.values(ROLES).map(r => `<tr><td>${esc(r.label)}</td>${Object.keys(MODULES).map(k => `<td style="text-align:center">${r.perms.includes(k) ? '<span style="color:var(--success)">✓</span>' : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div></div>`;
  $('#emp-q', el).oninput = debounce(e => { st.q = e.target.value.trim(); draw(); });
  $('#emp-role', el).onchange = e => { st.role = e.target.value; draw(); };
  $('#emp-status', el).onchange = e => { st.status = e.target.value; draw(); };
  el.onclick = async e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.act === 'add') return employeeModal(null, draw);
    if (t.dataset.edit) return employeeModal(DB.get('SELECT * FROM employees WHERE employee_id = ?', [+t.dataset.edit]), () => { draw(); renderNav('employees'); });
    if (t.dataset.del) {
      const emp = DB.get('SELECT e.*, (SELECT COUNT(*) FROM payments WHERE employee_id = e.employee_id) AS pays FROM employees e WHERE employee_id = ?', [+t.dataset.del]);
      if (emp.pays) return toast(`لا يمكن حذف ${emp.name} لارتباطه بـ ${emp.pays} معاملة مالية. يمكنك إيقاف الحساب بدلاً من ذلك.`, 'warning', 5000);
      if (!await confirmDialog({ title: 'حذف موظف', message: `حذف حساب <b>${esc(emp.name)}</b> نهائياً؟ ستبقى سجلات التدقيق محفوظة.`, confirmLabel: 'حذف' })) return;
      try {
        commit('employee_delete', `حذف الموظف ${emp.name} (${emp.email})`, () => { DB.run('DELETE FROM employees WHERE employee_id = ?', [emp.employee_id]); adminCoverageCheck(); });
        toast('تم حذف الموظف', 'success'); draw();
      } catch (err) { toast(friendlyError(err), 'error'); }
    }
  };
  el.onchange = e => {
    const id = e.target.dataset.toggle;
    if (!id) return;
    const emp = DB.get('SELECT * FROM employees WHERE employee_id = ?', [+id]);
    const status = e.target.checked ? 'active' : 'suspended';
    try {
      commit('employee_status', `${status === 'active' ? 'تفعيل' : 'إيقاف'} حساب ${emp.name} (${emp.email})`, () => {
        DB.run('UPDATE employees SET status = ? WHERE employee_id = ?', [status, emp.employee_id]);
        adminCoverageCheck();
      });
      toast(status === 'active' ? `تم تفعيل حساب ${emp.name}` : `تم إيقاف حساب ${emp.name}`, status === 'active' ? 'success' : 'warning');
    } catch (err) { toast(friendlyError(err), 'error'); }
    draw();
  };
  draw();
};

/* =========================== SQL console & tools =========================== */
const SAMPLE_QUERIES = [
  ['الطلاب حسب الصف', "SELECT g.name AS grade, COUNT(s.student_id) AS students\nFROM grades g LEFT JOIN students s ON s.grade_level = g.grade_id\nGROUP BY g.grade_id ORDER BY g.number;"],
  ['أرصدة الأقساط', 'SELECT * FROM v_student_balances ORDER BY remaining DESC LIMIT 20;'],
  ['التحصيل الشهري', "SELECT strftime('%Y-%m', payment_date) AS month, COUNT(*) AS payments, SUM(amount) AS total\nFROM payments GROUP BY month ORDER BY month DESC;"],
  ['الموظفون', 'SELECT employee_id, name, email, role, status, created_at FROM employees;'],
  ['آخر الأحداث', 'SELECT * FROM db_log ORDER BY log_id DESC LIMIT 25;'],
  ['الجداول', "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name;"],
];
Pages.sql = (el, params) => {
  const st = ui.sql = ui.sql || { tab: 'console', query: SAMPLE_QUERIES[0][1], history: [] };
  if (params.tab) { st.tab = params.tab; history.replaceState(null, '', '#/sql'); }
  const draw = () => {
    el.innerHTML = `<div class="card"><div class="tabs">
      <button data-tab="console" class="${st.tab === 'console' ? 'active' : ''}">محرر الاستعلامات</button>
      <button data-tab="schema" class="${st.tab === 'schema' ? 'active' : ''}">مخطط قاعدة البيانات</button>
      <button data-tab="tools" class="${st.tab === 'tools' ? 'active' : ''}">التصدير والاستيراد والأدوات</button></div><div id="sql-body"></div></div>`;
    ({ console: drawConsole, schema: drawSchema, tools: drawTools })[st.tab]();
  };

  const drawConsole = () => {
    $('#sql-body', el).innerHTML = `
      <div class="alert alert-warning small">تنفّذ الاستعلامات مباشرةً على قاعدة البيانات وتُحفظ التغييرات فوراً. تعديل بنية الجداول قد يعطّل النظام — صدّر نسخة احتياطية أولاً.</div>
      <div class="chips-row" style="margin-bottom:10px">${SAMPLE_QUERIES.map(([l], i) => `<button class="btn btn-sm btn-ghost" data-sample="${i}">${esc(l)}</button>`).join('')}</div>
      <textarea id="sql-input" class="sql-editor" spellcheck="false">${esc(st.query)}</textarea>
      <div class="row" style="margin:10px 0 16px"><button class="btn btn-primary" data-act="run">▶ تنفيذ (Ctrl+Enter)</button>
        <button class="btn btn-ghost" data-act="clear">مسح</button><div class="spacer"></div><small class="muted" id="sql-meta"></small></div>
      <div id="sql-out"></div>
      ${st.history.length ? `<h4 style="margin:20px 0 8px">سجل الجلسة</h4><ul class="list">${st.history.slice(0, 8).map((h, i) => `<li><code class="grow" style="direction:ltr;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;cursor:pointer" data-hist="${i}">${esc(h.q)}</code><small class="muted">${esc(h.t)}</small></li>`).join('')}</ul>` : ''}`;
    const ta = $('#sql-input', el);
    ta.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
      if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); }
    });
    ta.addEventListener('input', () => { st.query = ta.value; });
  };

  const run = () => {
    const q = $('#sql-input', el).value.trim();
    if (!q) return toast('اكتب استعلاماً أولاً', 'warning');
    st.query = q;
    const out = $('#sql-out', el);
    const t0 = performance.now();
    const before = DB.val('SELECT total_changes()');
    try {
      const results = DB.db.exec(q);
      const changes = DB.val('SELECT total_changes()') - before;
      const ms = (performance.now() - t0).toFixed(1);
      DB.log('sql_exec', q.slice(0, 500), Auth.user.employee_id);
      DB.persist();
      st.history.unshift({ q, t: new Date().toLocaleTimeString('en-GB') });
      $('#sql-meta', el).innerHTML = `<span class="num">${ms}ms</span> · ${results.length} مجموعة نتائج · <span class="num">${changes}</span> صف متأثر`;
      out.innerHTML = results.length ? results.map(r => `<div class="table-wrap sql-result" style="max-height:420px;margin-bottom:14px"><table><thead><tr>${r.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
          <tbody>${r.values.slice(0, 1000).map(row => `<tr>${row.map(v => v === null ? '<td class="null">NULL</td>' : v instanceof Uint8Array ? `<td class="null">BLOB(${v.length})</td>` : `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
          <small class="muted">${r.values.length} صف${r.values.length > 1000 ? ' (عُرض أول 1000)' : ''}</small>`).join('')
        : `<div class="alert alert-info">تم التنفيذ بنجاح. الصفوف المتأثرة: <b class="num">${changes}</b></div>`;
      if (changes) toast(`تم التنفيذ — ${changes} صف متأثر`, 'success');
      if (!Auth.refresh()) return;
      renderNav('sql');
    } catch (e) {
      out.innerHTML = `<div class="alert alert-danger" style="direction:ltr;text-align:left">${esc(e.message)}</div>`;
      $('#sql-meta', el).textContent = '';
      try { DB.log('sql_error', `${q.slice(0, 300)} → ${e.message}`, Auth.user.employee_id); DB.persist(); } catch (_) { /* db_log may be gone */ }
    }
  };

  const drawSchema = () => {
    const objs = DB.all("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND type IN ('table','view') ORDER BY type, name");
    const idx = DB.all("SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'");
    $('#sql-body', el).innerHTML = `<p class="muted small">${objs.filter(o => o.type === 'table').length} جداول · ${objs.filter(o => o.type === 'view').length} عروض · ${idx.length} فهارس</p>` + objs.map(o => {
      const cols = DB.all(`PRAGMA table_info("${o.name}")`);
      const fks = o.type === 'table' ? DB.all(`PRAGMA foreign_key_list("${o.name}")`) : [];
      const count = DB.val(`SELECT COUNT(*) FROM "${o.name}"`);
      const tIdx = idx.filter(i => i.tbl_name === o.name);
      return `<details class="schema-table" ${['students', 'payments', 'employees', 'db_log'].includes(o.name) ? 'open' : ''}>
        <summary><span class="mono">${o.type === 'view' ? '👁 ' : '▦ '}${esc(o.name)}</span><span class="badge plain b-gray"><span class="num">${intFmt(count)}</span> صف</span></summary>
        <div class="table-wrap"><table><thead><tr><th>#</th><th>Column</th><th>Type</th><th>Not Null</th><th>Default</th><th>Key</th></tr></thead><tbody>
        ${cols.map(c => { const fk = fks.find(f => f.from === c.name); return `<tr><td>${c.cid}</td><td class="mono"><b>${esc(c.name)}</b></td><td class="mono">${esc(c.type)}</td><td>${c.notnull ? '✓' : ''}</td>
          <td class="mono">${esc(c.dflt_value ?? '')}</td><td>${c.pk ? '<span class="badge plain b-yellow">PK</span> ' : ''}${fk ? `<span class="badge plain b-blue">FK → ${esc(fk.table)}.${esc(fk.to)}${fk.on_delete !== 'NO ACTION' ? ' · ' + esc(fk.on_delete) : ''}</span>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>
        ${tIdx.length ? `<div style="padding:8px 0" class="chips-row">${tIdx.map(i => `<span class="badge plain b-purple mono" data-tip="${esc(esc(i.sql || 'auto index'))}">⚡ ${esc(i.name)}</span>`).join('')}</div>` : ''}
        <pre class="ddl">${esc(o.sql)}</pre></details>`;
    }).join('');
  };

  const drawTools = () => {
    let size = 0;
    try { size = (localStorage.getItem(STORAGE_KEY) || '').length; } catch (e) { /* ignore */ }
    $('#sql-body', el).innerHTML = `<div class="grid grid-2">
      <div class="card"><h3 style="margin-bottom:10px">⇩ تصدير قاعدة البيانات</h3><p class="muted small">حجم البيانات المحفوظة في المتصفح: <b class="num">${(size / 1024).toFixed(1)} KB</b></p>
        <div class="row"><button class="btn btn-primary" data-act="exp-sqlite">ملف SQLite (.sqlite)</button><button class="btn btn-ghost" data-act="exp-json">ملف JSON</button></div></div>
      <div class="card" style="margin:0"><h3 style="margin-bottom:10px">⇧ استيراد قاعدة بيانات</h3><p class="muted small">يستبدل جميع البيانات الحالية. الصيغ المدعومة: <code>.sqlite</code> <code>.db</code> <code>.json</code></p>
        <input type="file" id="imp-file" accept=".sqlite,.db,.sqlite3,.json,application/json"></div>
      <div class="card" style="margin:0"><h3 style="margin-bottom:10px">🧪 بيانات تجريبية</h3><p class="muted small">يضيف 90 طالباً عشوائياً مع دفعات، و 5 موظفين (كلمة المرور 123456) لكل دور.</p>
        <button class="btn btn-ghost" data-act="demo">تحميل بيانات تجريبية</button></div>
      <div class="card" style="margin:0"><h3 style="margin-bottom:10px">⚙ إعدادات المدرسة</h3>
        <form id="school-form" novalidate><div class="form-grid"><div class="field"><label>اسم المدرسة</label><input name="school_name" value="${esc(DB.setting('school_name', ''))}"><small class="err"></small></div>
        <div class="field"><label>العام الدراسي</label><input name="academic_year" dir="ltr" value="${esc(DB.setting('academic_year', ''))}" placeholder="2026-2027"><small class="err"></small></div></div>
        <button class="btn btn-ghost" type="submit">حفظ</button></form></div>
      <div class="card" style="margin:0;border-color:rgba(239,68,68,.4)"><h3 style="margin-bottom:10px;color:#fca5a5">⚠ إعادة تهيئة النظام</h3><p class="muted small">يحذف كل البيانات ويعيد الهيكل الافتراضي وحساب المدير.</p>
        <button class="btn btn-danger" data-act="reset">إعادة التهيئة</button></div></div>`;
    $('#imp-file', el).onchange = e => importFile(e.target.files[0], e.target);
    $('#school-form', el).onsubmit = e => {
      e.preventDefault();
      const v = V.run(e.target, { school_name: [V.required('اسم المدرسة مطلوب')], academic_year: [V.required(), x => (/^\d{4}-\d{4}$/.test(x) ? null : 'الصيغة: 2026-2027')] });
      if (!v) return;
      commit('settings_update', `تحديث إعدادات المدرسة: ${v.school_name} / ${v.academic_year}`, () => { DB.setSetting('school_name', v.school_name.trim()); DB.setSetting('academic_year', v.academic_year); });
      toast('تم حفظ الإعدادات', 'success');
    };
  };

  const importFile = async (file, input) => {
    if (!file) return;
    const ok = await confirmDialog({ title: 'استيراد قاعدة بيانات', message: `سيتم استبدال <b>جميع</b> البيانات الحالية بمحتوى الملف <b>${esc(file.name)}</b>. يُنصح بتصدير نسخة احتياطية أولاً. متابعة؟`, confirmLabel: 'استيراد واستبدال' });
    if (!ok) { input.value = ''; return; }
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const isSqlite = new TextDecoder().decode(buf.subarray(0, 15)) === 'SQLite format 3';
      if (isSqlite) DB.importBinary(buf);
      else DB.importJSON(JSON.parse(new TextDecoder().decode(buf)));
      const me = Auth.user;
      const still = DB.get("SELECT * FROM employees WHERE email = ? COLLATE NOCASE AND status = 'active'", [me.email]);
      DB.log('db_import', `استيراد قاعدة بيانات من ${file.name} (${isSqlite ? 'SQLite' : 'JSON'}) بواسطة ${me.name}`, still ? still.employee_id : null);
      DB.persist();
      toast('تم استيراد قاعدة البيانات بنجاح', 'success');
      if (still) { Auth.user = still; session.set(SESSION_KEY, String(still.employee_id)); route(); }
      else { toast('حسابك غير موجود في قاعدة البيانات المستوردة — سجّل الدخول من جديد', 'warning', 5000); Auth.logout(true); }
    } catch (e) {
      console.error(e);
      toast('فشل الاستيراد: ' + (e instanceof SyntaxError ? 'ملف JSON غير صالح' : e.message), 'error', 6000);
      input.value = '';
    }
  };

  el.onclick = async e => {
    const t = e.target.closest('button, [data-hist]');
    if (!t) return;
    if (t.dataset.tab) { st.tab = t.dataset.tab; return draw(); }
    if (t.dataset.sample) { st.query = SAMPLE_QUERIES[+t.dataset.sample][1]; $('#sql-input', el).value = st.query; return run(); }
    if (t.dataset.hist) { st.query = st.history[+t.dataset.hist].q; $('#sql-input', el).value = st.query; return; }
    const a = t.dataset.act;
    if (a === 'run') return run();
    if (a === 'clear') { $('#sql-input', el).value = ''; st.query = ''; $('#sql-out', el).innerHTML = ''; return; }
    if (a === 'exp-sqlite') {
      commit('db_export', 'تصدير قاعدة البيانات بصيغة SQLite');
      download(`alasas-school-${today()}.sqlite`, DB.exportBinary(), 'application/vnd.sqlite3');
      return toast('تم تصدير الملف', 'success');
    }
    if (a === 'exp-json') {
      commit('db_export', 'تصدير قاعدة البيانات بصيغة JSON');
      download(`alasas-school-${today()}.json`, JSON.stringify(DB.exportJSON(), null, 2), 'application/json');
      return toast('تم تصدير الملف', 'success');
    }
    if (a === 'demo') {
      if (!await confirmDialog({ title: 'بيانات تجريبية', message: 'إضافة 90 طالباً تجريبياً مع دفعات وحسابات موظفين؟', confirmLabel: 'إضافة', danger: false })) return;
      try { const n = DB.seedDemo(Auth.user.employee_id); toast(`تمت إضافة ${n} طالباً تجريبياً`, 'success'); } catch (err) { toast(friendlyError(err), 'error'); }
      return;
    }
    if (a === 'reset') {
      const close = openModal({
        title: 'تأكيد إعادة التهيئة', size: 'sm',
        body: `<p>سيتم <b>حذف جميع البيانات</b> نهائياً. اكتب <code>RESET</code> للتأكيد.</p><form novalidate><div class="field"><input name="c" dir="ltr"><small class="err"></small></div></form>`,
        buttons: [{ label: 'حذف كل البيانات', cls: 'btn-danger', onClick: (c, m) => {
          if ($('[name=c]', m).value.trim() !== 'RESET') return V.set($('form', m), 'c', 'اكتب RESET بالأحرف الكبيرة');
          DB.reset();
          c();
          toast('تمت إعادة تهيئة النظام. سجّل الدخول بالحساب الافتراضي.', 'success', 5000);
          Auth.user = null; session.del(SESSION_KEY); showLogin();
        } }, { label: 'إلغاء', cls: 'btn-ghost' }],
      });
    }
  };
  draw();
};

/* =========================== Audit log =========================== */
const EVENT_LABELS = {
  system_init: 'تهيئة النظام', login: 'تسجيل دخول', logout: 'تسجيل خروج', login_failed: 'دخول فاشل', login_blocked: 'دخول محظور',
  student_create: 'تسجيل طالب', student_update: 'تعديل طالب', student_delete: 'حذف طالب', section_assign: 'نقل شعبة', section_balance: 'توزيع تلقائي',
  section_create: 'إضافة شعبة', section_update: 'تعديل شعبة', section_delete: 'حذف شعبة', payment_create: 'دفعة جديدة', payment_delete: 'إلغاء دفعة',
  fee_update: 'تعديل قسط', fee_settings: 'إعدادات الأقساط', employee_create: 'إضافة موظف', employee_update: 'تعديل موظف', employee_delete: 'حذف موظف',
  employee_status: 'حالة حساب', sql_exec: 'تنفيذ SQL', sql_error: 'خطأ SQL', db_export: 'تصدير', db_import: 'استيراد', demo_seed: 'بيانات تجريبية',
  export_csv: 'تصدير CSV', settings_update: 'إعدادات',
};
const eventClass = t => (/delete|failed|blocked|error/.test(t) ? 'b-red' : /create|login$|seed|init/.test(t) ? 'b-green' : /sql|import|export/.test(t) ? 'b-purple' : /update|status|assign|balance|settings/.test(t) ? 'b-yellow' : 'b-gray');
Pages.logs = el => {
  const st = ui.logs = ui.logs || { f: {}, page: 1 };
  const types = DB.all('SELECT event_type, COUNT(*) AS n FROM db_log GROUP BY event_type ORDER BY n DESC');
  const users = DB.all('SELECT DISTINCT e.employee_id, e.name FROM db_log l JOIN employees e ON e.employee_id = l.user_id ORDER BY e.name');
  el.innerHTML = `<div class="card"><div class="card-head"><h3>سجل التدقيق</h3><button class="btn btn-ghost btn-sm" data-act="csv">⇩ تصدير CSV</button></div>
    <form class="filters" id="log-filters" onsubmit="return false">
      <input name="q" placeholder="🔍 بحث في التفاصيل" value="${esc(st.f.q)}">
      <select name="type">${opt('', 'كل الأحداث', st.f.type)}${types.map(t => opt(t.event_type, `${EVENT_LABELS[t.event_type] || t.event_type} (${t.n})`, st.f.type)).join('')}</select>
      <select name="user">${opt('', 'كل المستخدمين', st.f.user)}${users.map(u => opt(u.employee_id, u.name, st.f.user)).join('')}</select>
      <input type="date" name="from" value="${esc(st.f.from)}" title="من تاريخ"><input type="date" name="to" value="${esc(st.f.to)}" title="إلى تاريخ"></form>
    <div id="log-table"></div></div>`;
  const build = () => {
    const w = [], p = [], f = st.f;
    if (f.q) { w.push('l.details LIKE ?'); p.push(`%${f.q}%`); }
    if (f.type) { w.push('l.event_type = ?'); p.push(f.type); }
    if (f.user) { w.push('l.user_id = ?'); p.push(+f.user); }
    if (f.from) { w.push('date(l.timestamp) >= ?'); p.push(f.from); }
    if (f.to) { w.push('date(l.timestamp) <= ?'); p.push(f.to); }
    return { w: w.length ? 'WHERE ' + w.join(' AND ') : '', p };
  };
  const table = () => {
    const { w, p } = build();
    const total = DB.val(`SELECT COUNT(*) FROM db_log l ${w}`, p);
    const rows = DB.all(`SELECT l.*, e.name AS user FROM db_log l LEFT JOIN employees e ON e.employee_id = l.user_id ${w} ORDER BY l.log_id DESC LIMIT ${PAGE_SIZE} OFFSET ${(st.page - 1) * PAGE_SIZE}`, p);
    $('#log-table', el).innerHTML = `<div class="table-wrap"><table><thead><tr><th>#</th><th>الوقت</th><th>الحدث</th><th>المستخدم</th><th>التفاصيل</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="num">${r.log_id}</td><td class="num small">${esc(r.timestamp)}</td><td><span class="badge plain ${eventClass(r.event_type)}">${esc(EVENT_LABELS[r.event_type] || r.event_type)}</span></td>
        <td>${esc(r.user || '—')}</td><td style="white-space:normal;min-width:280px;${/^sql/.test(r.event_type) ? 'direction:ltr;text-align:left;font-family:monospace;font-size:12.5px' : ''}">${esc(r.details)}</td></tr>`).join('')
        || '<tr><td colspan="5" class="empty">لا توجد أحداث</td></tr>'}</tbody></table></div>${pager(total, st.page, 'logs')}`;
  };
  const form = $('#log-filters', el);
  const read = () => { st.f = Object.fromEntries(Array.from(new FormData(form)).filter(([, v]) => v)); st.page = 1; table(); };
  form.onchange = read;
  form.oninput = debounce(e => { if (e.target.name === 'q') read(); });
  el.onclick = e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.page) { st.page = +t.dataset.to; table(); }
    if (t.dataset.act === 'csv') {
      const { w, p } = build();
      const rows = DB.all(`SELECT l.*, e.name AS user FROM db_log l LEFT JOIN employees e ON e.employee_id = l.user_id ${w} ORDER BY l.log_id DESC`, p);
      download(`audit-log-${today()}.csv`, toCSV(['#', 'timestamp', 'event', 'user', 'details'], rows.map(r => [r.log_id, r.timestamp, r.event_type, r.user || '', r.details])), 'text/csv;charset=utf-8');
    }
  };
  table();
};

/* =========================== Shell / boot =========================== */
function showLogin() {
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  $('#modal-root').innerHTML = '';
  const form = $('#login-form');
  form.reset();
  V.clear(form);
  $('#login-error').hidden = true;
  setTimeout(() => form.elements.email.focus(), 30);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}
function showApp() {
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  route();
}

$('#login-form').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  $('#login-error').hidden = true;
  const v = V.run(form, { email: [V.required('البريد الإلكتروني مطلوب'), V.email], password: [V.required('كلمة المرور مطلوبة')] });
  if (!v) return;
  try {
    Auth.login(v.email, form.elements.password.value);
    toast(`أهلاً ${Auth.user.name}`, 'success');
    if (!location.hash) location.hash = '#/dashboard';
    showApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
    $('#login-error').hidden = false;
    form.elements.password.value = '';
    form.elements.password.focus();
  }
});
$('#login-form').addEventListener('input', e => { const f = e.target.closest('.field'); if (f) { f.classList.remove('invalid'); $('.err', f).textContent = ''; } });
$('#logout-btn').addEventListener('click', () => Auth.logout());
$('#menu-btn').addEventListener('click', () => $('#app-view').classList.toggle('nav-open'));
$('#backdrop').addEventListener('click', () => $('#app-view').classList.remove('nav-open'));

DB.onSaveState = (state, err) => {
  const el = $('#db-status');
  el.className = 'pill' + (state === 'saving' ? ' saving' : state === 'error' ? ' error' : '');
  el.textContent = state === 'saving' ? '● جارٍ الحفظ…' : state === 'error' ? '● فشل الحفظ' : '● محفوظ';
  if (state === 'error') toast('تعذّر الحفظ في التخزين المحلي للمتصفح: ' + (err && err.name === 'QuotaExceededError' ? 'المساحة ممتلئة — صدّر نسخة واحذف بيانات قديمة' : (err && err.message)), 'error', 6000);
};

(async function boot() {
  try {
    if (typeof initSqlJs === 'undefined') throw new Error('تعذّر تحميل مكتبة sql.js');
    const { restored } = await DB.init();
    $('#boot').hidden = true;
    if (!restored) toast('تم إنشاء قاعدة بيانات جديدة بالهيكل المدرسي الافتراضي', 'info', 4500);
    if (Auth.restore()) showApp(); else showLogin();
  } catch (e) {
    console.error(e);
    $('#boot-msg').innerHTML = `<span style="color:#fca5a5">فشل تشغيل قاعدة البيانات: ${esc(e.message)}</span><br>
      <small class="muted">إذا فتحت الملف مباشرةً بدون اتصال بالإنترنت، شغّله عبر خادم محلي: <code dir="ltr">python -m http.server</code></small>`;
    $('.spinner').hidden = true;
  }
})();
