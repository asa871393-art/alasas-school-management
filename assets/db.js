/* =====================================================================
 * Al-Asas School Management System — data layer
 * In-browser SQLite (sql.js) persisted to localStorage.
 * ===================================================================== */
'use strict';

const STORAGE_KEY = 'alasas_sms_db_v1';
const SQLJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
const DEFAULT_FEE = 1500000;

/* ---------- Modules & roles ---------- */
const MODULES = {
  dashboard:  { label: 'لوحة التحكم',        icon: '◧', group: 'عام' },
  students:   { label: 'سجلات الطلاب',        icon: '☷', group: 'الشؤون الأكاديمية' },
  register:   { label: 'تسجيل طالب جديد',     icon: '✚', group: 'الشؤون الأكاديمية' },
  sections:   { label: 'توزيع الشعب',         icon: '▦', group: 'الشؤون الأكاديمية' },
  classlists: { label: 'قوائم الصفوف',        icon: '☰', group: 'الشؤون الأكاديمية' },
  fees:       { label: 'الأقساط والمدفوعات',  icon: '◈', group: 'الشؤون المالية' },
  employees:  { label: 'الموظفون والصلاحيات', icon: '☺', group: 'الإدارة' },
  sql:        { label: 'وحدة SQL والأدوات',   icon: '⌘', group: 'الإدارة' },
  logs:       { label: 'سجل التدقيق',         icon: '⎙', group: 'الإدارة' },
};

const ROLES = {
  admin:      { label: 'مدير النظام / المدير', badge: 'b-purple',
                perms: ['dashboard', 'students', 'register', 'sections', 'classlists', 'fees', 'employees', 'sql', 'logs'] },
  supervisor: { label: 'المشرف الأكاديمي',      badge: 'b-blue',   perms: ['dashboard', 'students', 'sections', 'classlists'] },
  accountant: { label: 'المحاسب',               badge: 'b-green',  perms: ['dashboard', 'fees'] },
  admission:  { label: 'موظف القبول والتسجيل',  badge: 'b-yellow', perms: ['dashboard', 'register'] },
  teacher:    { label: 'المعلم',                badge: 'b-gray',   perms: ['dashboard', 'classlists'] },
};

const TRACKS = { scientific: 'علمي', literary: 'أدبي' };
const STUDY_TYPES = { Morning: 'صباحي', Evening: 'مسائي' };
const GENDERS = { male: 'ذكر', female: 'أنثى' };

/* ---------- Schema ---------- */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS employees (
  employee_id INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password    TEXT NOT NULL,
  phone       TEXT,
  role        TEXT NOT NULL CHECK (role IN ('admin','supervisor','accountant','admission','teacher')),
  permissions TEXT NOT NULL DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS levels (
  level_id   INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  name_en    TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS grades (
  grade_id   INTEGER PRIMARY KEY,
  level_id   INTEGER NOT NULL REFERENCES levels(level_id) ON DELETE CASCADE,
  number     INTEGER NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  has_tracks INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sections (
  section_id INTEGER PRIMARY KEY AUTOINCREMENT,
  grade_id   INTEGER NOT NULL REFERENCES grades(grade_id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  capacity   INTEGER NOT NULL DEFAULT 35 CHECK (capacity > 0),
  UNIQUE (grade_id, name)
);

CREATE TABLE IF NOT EXISTS students (
  student_id        TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  gender            TEXT NOT NULL CHECK (gender IN ('male','female')),
  academic_level    INTEGER NOT NULL REFERENCES levels(level_id),
  grade_level       INTEGER NOT NULL REFERENCES grades(grade_id),
  section           INTEGER REFERENCES sections(section_id) ON DELETE SET NULL,
  track             TEXT CHECK (track IS NULL OR track IN ('scientific','literary')),
  study_type        TEXT NOT NULL DEFAULT 'Morning' CHECK (study_type IN ('Morning','Evening')),
  annual_fee        INTEGER NOT NULL DEFAULT ${DEFAULT_FEE} CHECK (annual_fee >= 0),
  guardian_phone    TEXT,
  registration_date TEXT NOT NULL DEFAULT (date('now','localtime'))
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   TEXT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE ON UPDATE CASCADE,
  amount       INTEGER NOT NULL CHECK (amount > 0),
  payment_date TEXT NOT NULL DEFAULT (date('now','localtime')),
  employee_id  INTEGER REFERENCES employees(employee_id),
  notes        TEXT
);

CREATE TABLE IF NOT EXISTS db_log (
  log_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  details    TEXT,
  user_id    INTEGER REFERENCES employees(employee_id) ON DELETE SET NULL,
  timestamp  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_employees_role     ON employees(role);
CREATE INDEX IF NOT EXISTS idx_employees_status   ON employees(status);
CREATE INDEX IF NOT EXISTS idx_grades_level       ON grades(level_id);
CREATE INDEX IF NOT EXISTS idx_sections_grade     ON sections(grade_id);
CREATE INDEX IF NOT EXISTS idx_students_name      ON students(name);
CREATE INDEX IF NOT EXISTS idx_students_level     ON students(academic_level);
CREATE INDEX IF NOT EXISTS idx_students_grade_sec ON students(grade_level, section);
CREATE INDEX IF NOT EXISTS idx_payments_student   ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_date      ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_employee  ON payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_log_time           ON db_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_log_type           ON db_log(event_type);

CREATE VIEW IF NOT EXISTS v_student_balances AS
SELECT s.student_id, s.name, s.annual_fee,
       COALESCE(SUM(p.amount), 0)                AS paid,
       s.annual_fee - COALESCE(SUM(p.amount), 0) AS remaining,
       CASE WHEN COALESCE(SUM(p.amount), 0) >= s.annual_fee THEN 'paid'
            WHEN COALESCE(SUM(p.amount), 0) > 0 THEN 'partial'
            ELSE 'unpaid' END                    AS status
FROM students s LEFT JOIN payments p ON p.student_id = s.student_id
GROUP BY s.student_id;
`;

const REQUIRED_TABLES = ['employees', 'students', 'payments', 'db_log', 'levels', 'grades', 'sections', 'settings'];

/* ---------- SHA-256 (sync, pure JS — works on file:// where crypto.subtle may be unavailable) ---------- */
function sha256(str) {
  const bytes = new TextEncoder().encode(str);
  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
    0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
    0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
    0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const len = bytes.length, padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes); padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, len * 8); view.setUint32(padded.length - 8, Math.floor(len / 0x20000000));
  const W = new Uint32Array(64), rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i-15], 7) ^ rotr(W[i-15], 18) ^ (W[i-15] >>> 3);
      const s1 = rotr(W[i-2], 17) ^ rotr(W[i-2], 19) ^ (W[i-2] >>> 10);
      W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return Array.from(H, x => x.toString(16).padStart(8, '0')).join('');
}

function hashPassword(plain, salt) {
  salt = salt || Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
  return salt + '$' + sha256(salt + ':' + plain);
}
function verifyPassword(plain, stored) {
  const [salt] = String(stored).split('$');
  return hashPassword(plain, salt) === stored;
}

/* ---------- Base64 helpers ---------- */
function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function base64ToBytes(b64) {
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- DB wrapper ---------- */
const DB = {
  SQL: null,
  db: null,
  onSaveState: null, // (state: 'saved'|'saving'|'error', err?) => void

  async init() {
    const localWasm = location.protocol.startsWith('http');
    this.SQL = await initSqlJs({ locateFile: f => (localWasm ? 'vendor/' : SQLJS_CDN) + f });
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage blocked */ }
    if (raw) {
      try {
        this.open(new this.SQL.Database(base64ToBytes(raw)));
        this.migrate();
        return { restored: true };
      } catch (e) {
        console.error('Stored DB is corrupt, recreating', e);
      }
    }
    this.open(new this.SQL.Database());
    this.migrate();
    this.seedDefaults();
    this.persist();
    return { restored: false };
  },

  open(database) {
    if (this.db) try { this.db.close(); } catch (e) { /* ignore */ }
    this.db = database;
    this.db.run('PRAGMA foreign_keys = ON;');
  },

  migrate() {
    this.db.exec(SCHEMA_SQL);
  },

  /* --- query helpers --- */
  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally { stmt.free(); }
  },
  get(sql, params = []) { return this.all(sql, params)[0] || null; },
  val(sql, params = []) { const r = this.get(sql, params); return r ? Object.values(r)[0] : null; },
  run(sql, params = []) {
    this.db.run(sql, params);
    return { changes: this.db.getRowsModified(), lastId: this.val('SELECT last_insert_rowid() AS id') };
  },
  tx(fn) {
    this.db.run('BEGIN');
    try { const r = fn(); this.db.run('COMMIT'); return r; }
    catch (e) { try { this.db.run('ROLLBACK'); } catch (_) { /* already rolled back */ } throw e; }
  },

  /* --- persistence --- */
  persist() {
    this.onSaveState && this.onSaveState('saving');
    try {
      const data = this.db.export();
      // sql.js export() re-opens the connection, which drops connection-level pragmas.
      this.db.run('PRAGMA foreign_keys = ON;');
      localStorage.setItem(STORAGE_KEY, bytesToBase64(data));
      this.onSaveState && this.onSaveState('saved');
      return true;
    } catch (e) {
      console.error(e);
      this.onSaveState && this.onSaveState('error', e);
      return false;
    }
  },

  log(eventType, details, userId = null) {
    this.run('INSERT INTO db_log (event_type, details, user_id) VALUES (?, ?, ?)',
      [eventType, typeof details === 'string' ? details : JSON.stringify(details), userId]);
  },

  setting(key, fallback = null) {
    const v = this.val('SELECT value FROM settings WHERE key = ?', [key]);
    return v === null ? fallback : v;
  },
  setSetting(key, value) {
    this.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(value)]);
  },

  nextStudentId() {
    const year = new Date().getFullYear();
    let seq = parseInt(this.setting('student_seq', '0'), 10) + 1;
    let id;
    do { id = `STU-${year}-${String(seq).padStart(4, '0')}`; seq++; }
    while (this.val('SELECT 1 FROM students WHERE student_id = ?', [id]));
    this.setSetting('student_seq', seq - 1);
    return id;
  },

  /* --- seeding --- */
  seedDefaults() {
    this.tx(() => {
      this.setSetting('school_name', 'مدرسة الأساس الأهلية');
      this.setSetting('academic_year', `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`);
      this.setSetting('default_fee', DEFAULT_FEE);
      this.setSetting('student_seq', 0);

      this.run('INSERT INTO levels (level_id, name, name_en, sort_order) VALUES (1, ?, ?, 1), (2, ?, ?, 2), (3, ?, ?, 3)', [
        'المرحلة الابتدائية', 'Primary / Elementary School',
        'المرحلة المتوسطة', 'Middle / Intermediate School',
        'المرحلة الإعدادية (الثانوية)', 'High / Secondary School',
      ]);
      const gradeNames = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر'];
      for (let n = 1; n <= 12; n++) {
        const level = n <= 6 ? 1 : n <= 9 ? 2 : 3;
        // Scientific / Literary tracks apply to the last two secondary grades.
        const hasTracks = n >= 11 ? 1 : 0;
        this.run('INSERT INTO grades (grade_id, level_id, number, name, has_tracks) VALUES (?, ?, ?, ?, ?)',
          [n, level, n, `الصف ${gradeNames[n - 1]}`, hasTracks]);
        for (const s of ['أ', 'ب', 'ج']) this.run('INSERT INTO sections (grade_id, name) VALUES (?, ?)', [n, `شعبة ${s}`]);
      }
      this.run(`INSERT INTO employees (name, email, password, phone, role, permissions, status)
                VALUES (?, ?, ?, ?, 'admin', ?, 'active')`,
        ['مدير النظام', 'admin@school.edu', hashPassword('123456'), '07700000000', JSON.stringify(ROLES.admin.perms)]);
      this.log('system_init', 'تم إنشاء قاعدة البيانات وتهيئة الهيكل المدرسي الافتراضي');
    });
  },

  seedDemo(userId) {
    const first = { male: ['أحمد', 'محمد', 'علي', 'حسين', 'عمر', 'يوسف', 'مصطفى', 'كرار', 'زيد', 'حيدر', 'سجاد', 'عباس', 'ياسين', 'مرتضى', 'إبراهيم'],
                    female: ['زينب', 'فاطمة', 'مريم', 'نور', 'سارة', 'رقية', 'هدى', 'آية', 'دعاء', 'رغد', 'تبارك', 'زهراء', 'شهد', 'ملاك', 'جنى'] };
    const last = ['الجبوري', 'العبيدي', 'التميمي', 'الدليمي', 'الربيعي', 'الخفاجي', 'الساعدي', 'الزبيدي', 'الشمري', 'الكعبي', 'الموسوي', 'الحسيني', 'العزاوي', 'البياتي'];
    const fathers = ['حسن', 'كريم', 'جاسم', 'سعد', 'خالد', 'ماجد', 'فاضل', 'رعد', 'عادل', 'ناظم', 'صباح', 'قاسم'];
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const sections = this.all('SELECT s.section_id, s.grade_id, g.level_id, g.has_tracks FROM sections s JOIN grades g USING (grade_id)');
    const staff = [
      ['د. سلمى عبد الكريم', 'supervisor@school.edu', 'supervisor'],
      ['أ. حسام الدين علي', 'accountant@school.edu', 'accountant'],
      ['م. رنا فالح', 'admission@school.edu', 'admission'],
      ['أ. كاظم جواد', 'teacher@school.edu', 'teacher'],
      ['أ. هبة ناصر', 'teacher2@school.edu', 'teacher'],
    ];
    let added = 0;
    this.tx(() => {
      for (const [name, email, role] of staff) {
        if (this.val('SELECT 1 FROM employees WHERE email = ?', [email])) continue;
        this.run('INSERT INTO employees (name, email, password, phone, role, permissions) VALUES (?, ?, ?, ?, ?, ?)',
          [name, email, hashPassword('123456'), '077' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'), role, JSON.stringify(ROLES[role].perms)]);
      }
      const accountant = this.val("SELECT employee_id FROM employees WHERE role IN ('accountant','admin') AND status = 'active' ORDER BY role = 'accountant' DESC LIMIT 1");
      const today = new Date();
      for (let i = 0; i < 90; i++) {
        const gender = Math.random() < 0.5 ? 'male' : 'female';
        const sec = pick(sections);
        const id = this.nextStudentId();
        const regDate = new Date(today.getTime() - Math.floor(Math.random() * 120) * 86400000).toISOString().slice(0, 10);
        const fee = Math.random() < 0.85 ? DEFAULT_FEE : pick([1000000, 1250000, 1750000]);
        this.run(`INSERT INTO students (student_id, name, gender, academic_level, grade_level, section, track, study_type, annual_fee, guardian_phone, registration_date)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, `${pick(first[gender])} ${pick(fathers)} ${pick(last)}`, gender, sec.level_id, sec.grade_id, sec.section_id,
           sec.has_tracks ? pick(['scientific', 'literary']) : null, Math.random() < 0.8 ? 'Morning' : 'Evening', fee,
           '078' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'), regDate]);
        const r = Math.random();
        const payTotal = r < 0.35 ? fee : r < 0.75 ? Math.round(fee * (0.2 + Math.random() * 0.6) / 50000) * 50000 : 0;
        let left = payTotal;
        while (left > 0) {
          const amt = Math.min(left, pick([250000, 500000, 750000]));
          const d = new Date(Math.max(new Date(regDate).getTime(), today.getTime() - Math.floor(Math.random() * 90) * 86400000)).toISOString().slice(0, 10);
          this.run('INSERT INTO payments (student_id, amount, payment_date, employee_id, notes) VALUES (?, ?, ?, ?, ?)',
            [id, amt, d, accountant, pick(['قسط نقدي', 'دفعة أولى', 'تحويل مصرفي', null])]);
          left -= amt;
        }
        added++;
      }
      this.log('demo_seed', `تم تحميل بيانات تجريبية: ${added} طالباً و ${staff.length} موظفين`, userId);
    });
    this.persist();
    return added;
  },

  /* --- export / import --- */
  exportBinary() {
    const data = this.db.export();
    this.db.run('PRAGMA foreign_keys = ON;');
    return data;
  },
  exportJSON() {
    const tables = {};
    for (const t of this.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")) {
      tables[t.name] = this.all(`SELECT * FROM "${t.name}"`);
    }
    return { app: 'Al-Asas School Management System', format: 1, exported_at: new Date().toISOString(), tables };
  },
  validateDatabase(database) {
    const names = new Set();
    const res = database.exec("SELECT name FROM sqlite_master WHERE type = 'table'");
    if (res[0]) res[0].values.forEach(v => names.add(v[0]));
    const missing = REQUIRED_TABLES.filter(t => !names.has(t));
    if (missing.length) throw new Error('الملف لا يحتوي على الجداول المطلوبة: ' + missing.join(', '));
  },
  importBinary(bytes) {
    const candidate = new this.SQL.Database(bytes);
    try { this.validateDatabase(candidate); } catch (e) { candidate.close(); throw e; }
    this.open(candidate);
    this.migrate();
    this.persist();
  },
  importJSON(obj) {
    if (!obj || typeof obj.tables !== 'object') throw new Error('صيغة JSON غير صالحة: الحقل "tables" مفقود');
    const missing = REQUIRED_TABLES.filter(t => !Array.isArray(obj.tables[t]));
    if (missing.length) throw new Error('ملف JSON ينقصه الجداول: ' + missing.join(', '));
    const candidate = new this.SQL.Database();
    try {
      candidate.exec(SCHEMA_SQL);
      candidate.run('BEGIN');
      // Insert parents before children so foreign keys stay valid.
      const order = ['settings', 'levels', 'grades', 'sections', 'employees', 'students', 'payments', 'db_log'];
      const rest = Object.keys(obj.tables).filter(t => !order.includes(t));
      for (const t of [...order, ...rest]) {
        const rows = obj.tables[t] || [];
        const cols = new Set();
        const info = candidate.exec(`PRAGMA table_info("${t.replace(/"/g, '')}")`);
        if (!info[0]) continue; // unknown table — skip
        info[0].values.forEach(v => cols.add(v[1]));
        for (const row of rows) {
          const keys = Object.keys(row).filter(k => cols.has(k));
          if (!keys.length) continue;
          candidate.run(`INSERT INTO "${t}" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
            keys.map(k => row[k]));
        }
      }
      candidate.run('COMMIT');
      candidate.run('PRAGMA foreign_keys = ON;');
      const fk = candidate.exec('PRAGMA foreign_key_check');
      if (fk[0] && fk[0].values.length) throw new Error(`يحتوي الملف على ${fk[0].values.length} سجلاً بمفاتيح أجنبية غير صالحة`);
    } catch (e) {
      candidate.close();
      throw e;
    }
    this.open(candidate);
    this.persist();
  },
  reset() {
    this.open(new this.SQL.Database());
    this.migrate();
    this.seedDefaults();
    this.persist();
  },
};
