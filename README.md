# نظام الأساس لإدارة المدارس — Al-Asas School Management System

A single-page school management system that runs entirely in the browser.
It uses vanilla HTML, CSS and JavaScript, with SQLite through `sql.js`, and persists to `localStorage`.

## Run
- Open `index.html` directly. In this mode the SQLite WASM loads from cdnjs, so you need an internet connection.
- Or serve the folder to run fully offline from the bundled `vendor/` copy: `python -m http.server 8000`, then open http://localhost:8000

Default login: `admin@school.edu` / `123456`

To get sample data: **وحدة SQL والأدوات ← التصدير والاستيراد والأدوات ← تحميل بيانات تجريبية**.
This adds 90 students with payments, plus one account per role (`supervisor@`, `accountant@`, `admission@`, `teacher@school.edu`, all with password `123456`).

## Files
| File | Purpose |
|---|---|
| `index.html` | App shell (login, sidebar, modal/toast roots) |
| `assets/db.js` | Schema, seed data, roles/permissions, persistence, import/export, SHA-256 password hashing |
| `assets/app.js` | Router, auth, validation, modals/toasts, SVG charts, all pages |
| `assets/styles.css` | Dark RTL theme (Tajawal) |
| `vendor/` | sql.js 1.10.3 (JS + WASM) for offline use |

## Schema
`employees`, `students`, `payments`, `db_log` as specified, plus:
- `levels`, `grades`, `sections`: the school structure. Grades 11–12 have Scientific/Literary tracks.
- `settings`: school name, academic year, default fee, student ID sequence.
- `v_student_balances`: a view of fee, paid, remaining and status per student.

`students.academic_level`, `grade_level` and `section` are foreign keys into the structure tables.
Students also carry `track`, `annual_fee` (default 1,500,000 IQD) and `guardian_phone`.
Payments cascade when a student is deleted.
An employee who has recorded payments can't be deleted; suspend the account instead.

## Notes
- Passwords are stored as salted SHA-256. All of this is client-side, so treat it as a demo or single-machine tool, not a security boundary.
- `localStorage` is usually limited to about 5 MB, which is thousands of students. Use Export (.sqlite / .json) for backups.
