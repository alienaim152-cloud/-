import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Ensure data directory exists
const dataDir = path.resolve(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'breaksync.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Timezone helpers (Asia/Bangkok UTC+7) ---
function getBangkokDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // YYYY-MM-DD
}

function getBangkokMonthString(date: Date = new Date()): string {
  return getBangkokDateString(date).slice(0, 7); // YYYY-MM
}

// --- Password hashing (scrypt + timingSafeEqual) ---
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

// --- HMAC Token signing & verification ---
interface SessionPayload {
  uid: number;
  username: string;
  role: 'super_admin' | 'supervisor' | 'hr_viewer';
  exp: number;
}

function signToken(payload: Omit<SessionPayload, 'exp'>): string {
  const full: SessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  };
  const encoded = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// --- Schema initialization ---
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    nickname TEXT DEFAULT '',
    department TEXT NOT NULL,
    position TEXT NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    shift_name TEXT DEFAULT 'กะปกติ 08:30 - 17:30',
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS break_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    employee_code TEXT NOT NULL,
    break_type TEXT NOT NULL,
    allowed_minutes INTEGER NOT NULL,
    grace_minutes INTEGER NOT NULL DEFAULT 5,
    work_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration_seconds INTEGER DEFAULT 0,
    exceeded_seconds INTEGER DEFAULT 0,
    grace_exceeded INTEGER DEFAULT 0,
    violation_recorded INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    note TEXT DEFAULT '',
    recorded_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_break_logs_date ON break_logs(work_date);
  CREATE INDEX IF NOT EXISTS idx_break_logs_emp ON break_logs(employee_id, work_date);
  CREATE INDEX IF NOT EXISTS idx_break_logs_status ON break_logs(status);

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_username TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT DEFAULT '',
    details TEXT DEFAULT '',
    created_at TEXT NOT NULL
  );
`);

function recordAudit(actor: string, action: string, targetType: string, targetId = '', details = '') {
  db.prepare(
    `INSERT INTO audit_logs (actor_username, action, target_type, target_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(actor, action, targetType, targetId, details, new Date().toISOString());
}

// --- Seed Initial Admin & Sample Employees/History ---
function seedInitialData() {
  const adminCountRow = db.prepare('SELECT COUNT(*) as cnt FROM admin_users').get() as { cnt: number };
  if (adminCountRow.cnt === 0) {
    const defaultAdminUser = process.env.ADMIN_USERNAME || 'Admin';
    const defaultAdminPass = process.env.ADMIN_PASSWORD || 'admin123';
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO admin_users (username, password_hash, display_name, role, is_active, created_at)
       VALUES (?, ?, ?, 'super_admin', 1, ?)`
    ).run(defaultAdminUser, hashPassword(defaultAdminPass), 'ผู้ดูแลระบบหลัก (Administrator)', now);

    db.prepare(
      `INSERT INTO admin_users (username, password_hash, display_name, role, is_active, created_at)
       VALUES (?, ?, ?, 'supervisor', 1, ?)`
    ).run('Supervisor', hashPassword('super123'), 'หัวหน้างานกะปฏิบัติการ', now);

    recordAudit('SYSTEM', 'SEED_ADMIN', 'admin_users', defaultAdminUser, 'สร้างบัญชีผู้ดูแลระบบเริ่มต้น');
  }

  const empCountRow = db.prepare('SELECT COUNT(*) as cnt FROM employees').get() as { cnt: number };
  if (empCountRow.cnt === 0) {
    const now = new Date().toISOString();
    const starterEmployees = [
      { code: 'EMP001', name: 'ธนากร วัฒนศิริ', nick: 'ต้น', dept: 'ฝ่ายปฏิบัติการ', pos: 'หัวหน้าทีมควบคุมสายงาน', phone: '081-442-1091', email: 'thanakorn@company.co.th', shift: 'กะเช้า 08:30 - 17:30' },
      { code: 'EMP002', name: 'กัญญาภัค สุขสวัสดิ์', nick: 'แพรว', dept: 'ฝ่ายบริการลูกค้า', pos: 'เจ้าหน้าที่ประสานงานอาวุโส', phone: '089-231-5520', email: 'kanyaphak@company.co.th', shift: 'กะเช้า 08:30 - 17:30' },
      { code: 'EMP003', name: 'ณัฐวุฒิ เจริญพร', nick: 'นัท', dept: 'ฝ่ายไอทีและระบบ', pos: 'วิศวกรระบบเครือข่าย', phone: '086-711-8834', email: 'nattawut@company.co.th', shift: 'กะเช้า 08:30 - 17:30' },
      { code: 'EMP004', name: 'พิมพ์ชนก รัตนโกสินทร์', nick: 'พิมพ์', dept: 'ฝ่ายบัญชีและการเงิน', pos: 'นักบัญชีอาวุโส', phone: '082-901-3345', email: 'pimchanok@company.co.th', shift: 'กะเช้า 08:30 - 17:30' },
      { code: 'EMP005', name: 'ศุภชัย พงษ์ไพบูลย์', nick: 'ชัย', dept: 'ฝ่ายปฏิบัติการ', pos: 'เจ้าหน้าที่ตรวจสอบคุณภาพ', phone: '084-556-7789', email: 'supachai@company.co.th', shift: 'กะเช้า 08:30 - 17:30' },
      { code: 'EMP006', name: 'อรอนงค์ มณีรัตน์', nick: 'ออน', dept: 'ฝ่ายบริการลูกค้า', pos: 'เจ้าหน้าที่ดูแลลูกค้า', phone: '085-112-9901', email: 'oranong@company.co.th', shift: 'กะบ่าย 13:00 - 22:00' },
      { code: 'EMP007', name: 'ภาณุพงศ์ อินทรวิชัย', nick: 'บอส', dept: 'ฝ่ายไอทีและระบบ', pos: 'นักพัฒนาซอฟต์แวร์', phone: '087-662-4410', email: 'phanuphong@company.co.th', shift: 'กะเช้า 08:30 - 17:30' },
      { code: 'EMP008', name: 'ชุติมา แสงจันทร์', nick: 'มุก', dept: 'ฝ่ายทรัพยากรบุคคล', pos: 'เจ้าหน้าที่บุคคล', phone: '083-774-2219', email: 'chutima@company.co.th', shift: 'กะเช้า 08:30 - 17:30' },
      { code: 'EMP009', name: 'วีรภัทร ทองประเสริฐ', nick: 'ภัทร', dept: 'ฝ่ายปฏิบัติการ', pos: 'พนักงานปฏิบัติการ', phone: '088-334-1122', email: 'weeraphat@company.co.th', shift: 'กะบ่าย 13:00 - 22:00' },
      { code: 'EMP010', name: 'สิริประภา ดวงแก้ว', nick: 'ฟ้า', dept: 'ฝ่ายบริการลูกค้า', pos: 'เจ้าหน้าที่ให้คำปรึกษา', phone: '090-128-6674', email: 'siriprapha@company.co.th', shift: 'กะเช้า 08:30 - 17:30' },
    ];

    const insertEmp = db.prepare(
      `INSERT INTO employees (employee_code, full_name, nickname, department, position, phone, email, shift_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    );

    const empIds: Array<{ id: number; code: string }> = [];
    for (const e of starterEmployees) {
      const info = insertEmp.run(e.code, e.name, e.nick, e.dept, e.pos, e.phone, e.email, e.shift, now, now);
      empIds.push({ id: Number(info.lastInsertRowid), code: e.code });
    }

    // Seed realistic historical break logs over past 10 days + today
    const insertLog = db.prepare(
      `INSERT INTO break_logs (
        employee_id, employee_code, break_type, allowed_minutes, grace_minutes,
        work_date, start_time, end_time, duration_seconds, exceeded_seconds,
        grace_exceeded, violation_recorded, status, note, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const today = new Date();
    for (let dayOffset = 10; dayOffset >= 1; dayOffset--) {
      const d = new Date(today.getTime() - dayOffset * 86400000);
      const workDate = getBangkokDateString(d);
      empIds.forEach((emp, idx) => {
        // Break 1 (30 min)
        const b1Start = new Date(`${workDate}T03:00:00.000Z`); // 10:00 BKK
        b1Start.setMinutes(b1Start.getMinutes() + idx * 4);
        let dur1 = 26 * 60 + ((idx * 47 + dayOffset * 31) % 300); // 26-31 min
        if ((idx + dayOffset) % 9 === 0) {
          dur1 = 37 * 60 + 25; // > 5 min overtime!
        }
        const b1End = new Date(b1Start.getTime() + dur1 * 1000);
        const exceeded1 = Math.max(0, dur1 - 30 * 60);
        const graceEx1 = dur1 > 35 * 60 ? 1 : 0;
        const status1 = graceEx1 ? 'overtime' : exceeded1 > 0 ? 'grace' : 'on_time';
        insertLog.run(
          emp.id,
          emp.code,
          'break_1',
          30,
          5,
          workDate,
          b1Start.toISOString(),
          b1End.toISOString(),
          dur1,
          exceeded1,
          graceEx1,
          graceEx1,
          status1,
          graceEx1 ? 'เกินเวลาพักช่วงแรกมากกว่า 5 นาที (บันทึกอัตโนมัติ)' : '',
          b1End.toISOString()
        );

        // Break 2 (60 min)
        if (idx % 2 === dayOffset % 2 || idx < 6) {
          const b2Start = new Date(`${workDate}T05:00:00.000Z`); // 12:00 BKK
          b2Start.setMinutes(b2Start.getMinutes() + idx * 5);
          let dur2 = 54 * 60 + ((idx * 59 + dayOffset * 41) % 420); // 54-61 min
          if ((idx + dayOffset) % 11 === 0) {
            dur2 = 67 * 60 + 18; // > 5 min overtime
          }
          const b2End = new Date(b2Start.getTime() + dur2 * 1000);
          const exceeded2 = Math.max(0, dur2 - 60 * 60);
          const graceEx2 = dur2 > 65 * 60 ? 1 : 0;
          const status2 = graceEx2 ? 'overtime' : exceeded2 > 0 ? 'grace' : 'on_time';
          insertLog.run(
            emp.id,
            emp.code,
            'break_2',
            60,
            5,
            workDate,
            b2Start.toISOString(),
            b2End.toISOString(),
            dur2,
            exceeded2,
            graceEx2,
            graceEx2,
            status2,
            graceEx2 ? 'เกินเวลาพักช่วงที่สองมากกว่า 5 นาที (บันทึกอัตโนมัติ)' : '',
            b2End.toISOString()
          );
        }

        // Quick out (5 min) occasionally
        if ((idx + dayOffset) % 4 === 0) {
          const qStart = new Date(`${workDate}T08:15:00.000Z`); // 15:15 BKK
          const isOver = (idx + dayOffset) % 8 === 0;
          const durQ = isOver ? 6 * 60 + 40 : 3 * 60 + 45;
          const qEnd = new Date(qStart.getTime() + durQ * 1000);
          const exQ = Math.max(0, durQ - 5 * 60);
          insertLog.run(
            emp.id,
            emp.code,
            'quick_out',
            5,
            0,
            workDate,
            qStart.toISOString(),
            qEnd.toISOString(),
            durQ,
            exQ,
            isOver ? 1 : 0,
            isOver ? 1 : 0,
            isOver ? 'overtime' : 'on_time',
            isOver ? 'ออกนอกพื้นที่เกิน 5 นาที (บันทึกข้อมูล)' : '',
            qEnd.toISOString()
          );
        }
      });
    }

    // Seed a couple of today's completed breaks & 1 active ongoing break so real-time timer is immediately live
    const todayDate = getBangkokDateString(today);
    const activeStart = new Date(Date.now() - 8 * 60 * 1000).toISOString(); // 8 minutes ago
    insertLog.run(
      empIds[0].id,
      empIds[0].code,
      'break_1',
      30,
      5,
      todayDate,
      activeStart,
      null,
      0,
      0,
      0,
      0,
      'active',
      '',
      activeStart
    );

    const done1Start = new Date(Date.now() - 90 * 60 * 1000);
    const done1Dur = 28 * 60 + 14;
    const done1End = new Date(done1Start.getTime() + done1Dur * 1000);
    insertLog.run(
      empIds[1].id,
      empIds[1].code,
      'break_1',
      30,
      5,
      todayDate,
      done1Start.toISOString(),
      done1End.toISOString(),
      done1Dur,
      0,
      0,
      0,
      'on_time',
      '',
      done1End.toISOString()
    );

    const done2Start = new Date(Date.now() - 55 * 60 * 1000);
    const done2Dur = 36 * 60 + 42;
    const done2End = new Date(done2Start.getTime() + done2Dur * 1000);
    insertLog.run(
      empIds[2].id,
      empIds[2].code,
      'break_1',
      30,
      5,
      todayDate,
      done2Start.toISOString(),
      done2End.toISOString(),
      done2Dur,
      6 * 60 + 42,
      1,
      1,
      'overtime',
      'เกินเวลาพักช่วงแรกมากกว่า 5 นาที (บันทึกอัตโนมัติ)',
      done2End.toISOString()
    );
  }
}

seedInitialData();

// --- Helper Queries ---
const BASE_LOG_SELECT = `
  SELECT
    bl.*,
    e.full_name,
    e.nickname,
    e.department,
    e.position
  FROM break_logs bl
  JOIN employees e ON e.id = bl.employee_id
`;

function getDailySummary(workDate: string) {
  const row = db
    .prepare(
      `SELECT
        COUNT(*) as total_breaks,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status = 'on_time' THEN 1 ELSE 0 END) as on_time_count,
        SUM(CASE WHEN status = 'grace' THEN 1 ELSE 0 END) as grace_count,
        SUM(CASE WHEN status = 'overtime' OR violation_recorded = 1 THEN 1 ELSE 0 END) as overtime_count,
        COALESCE(SUM(CASE WHEN status != 'active' THEN duration_seconds ELSE 0 END), 0) as total_seconds,
        COUNT(DISTINCT employee_id) as unique_employees
       FROM break_logs
       WHERE work_date = ?`
    )
    .get(workDate) as {
    total_breaks: number;
    active_count: number | null;
    on_time_count: number | null;
    grace_count: number | null;
    overtime_count: number | null;
    total_seconds: number;
    unique_employees: number;
  };

  return {
    work_date: workDate,
    total_breaks: row.total_breaks || 0,
    active_count: row.active_count || 0,
    on_time_count: row.on_time_count || 0,
    grace_count: row.grace_count || 0,
    overtime_count: row.overtime_count || 0,
    total_minutes: Math.round((row.total_seconds || 0) / 60),
    unique_employees: row.unique_employees || 0,
  };
}

function getLivePayload() {
  const todayDate = getBangkokDateString();
  const active_breaks = db
    .prepare(`${BASE_LOG_SELECT} WHERE bl.status = 'active' ORDER BY bl.start_time DESC`)
    .all();

  const today_logs = db
    .prepare(`${BASE_LOG_SELECT} WHERE bl.work_date = ? ORDER BY bl.start_time DESC`)
    .all(todayDate);

  const today_summary = getDailySummary(todayDate);

  const employees = db
    .prepare(
      `SELECT id, employee_code, full_name, nickname, department, position, shift_name, status
       FROM employees
       WHERE status = 'active'
       ORDER BY employee_code ASC`
    )
    .all();

  return {
    server_time: new Date().toISOString(),
    today_date: todayDate,
    active_breaks,
    today_logs,
    today_summary,
    employees,
  };
}

// --- Express App & WebSocket Setup ---
const app = express();
app.use(express.json({ limit: '5mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastEvent(type: string, extra: Record<string, unknown> = {}) {
  const payload = JSON.stringify({
    type,
    server_time: new Date().toISOString(),
    live: getLivePayload(),
    ...extra,
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      type: 'sync:init',
      server_time: new Date().toISOString(),
      live: getLivePayload(),
    })
  );
});

// Background watcher: check active breaks every 5 seconds for >5 min grace threshold
setInterval(() => {
  const activeRows = db
    .prepare(`SELECT * FROM break_logs WHERE status = 'active' AND violation_recorded = 0`)
    .all() as Array<{
    id: number;
    employee_code: string;
    break_type: string;
    allowed_minutes: number;
    grace_minutes: number;
    start_time: string;
  }>;

  const nowMs = Date.now();
  let updatedAny = false;
  for (const row of activeRows) {
    const elapsedSec = Math.floor((nowMs - new Date(row.start_time).getTime()) / 1000);
    const thresholdSec = (row.allowed_minutes + row.grace_minutes) * 60;
    if (elapsedSec > thresholdSec) {
      const note =
        row.break_type === 'quick_out'
          ? 'ออกนอกพื้นที่เกิน 5 นาที (บันทึกข้อมูลอัตโนมัติ)'
          : `เกินเวลาพักที่กำหนดมากกว่า 5 นาที (บันทึกข้อมูลอัตโนมัติ)`;
      db.prepare(
        `UPDATE break_logs SET grace_exceeded = 1, violation_recorded = 1, exceeded_seconds = ?, note = ? WHERE id = ?`
      ).run(elapsedSec - row.allowed_minutes * 60, note, row.id);
      updatedAny = true;
    }
  }

  if (updatedAny) {
    broadcastEvent('break:overtime_alert');
  }
}, 5000);

// --- Auth Middleware ---
interface AuthedRequest extends Request {
  adminUser?: SessionPayload;
}

function requireAdmin(_allowedRoles?: Array<'super_admin' | 'supervisor' | 'hr_viewer'>) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    req.adminUser = {
      uid: 1,
      username: 'Admin',
      role: 'super_admin',
      exp: Date.now() + 1000 * 60 * 60 * 12,
    };
    next();
  };
}

// ==========================================
// PUBLIC / EMPLOYEE BREAK TERMINAL ROUTES
// ==========================================

app.get('/api/public/live', (_req, res) => {
  res.json(getLivePayload());
});

app.get('/api/public/history', (req, res) => {
  const dateParam = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
    ? req.query.date
    : getBangkokDateString();

  const logs = db
    .prepare(`${BASE_LOG_SELECT} WHERE bl.work_date = ? ORDER BY bl.start_time DESC`)
    .all(dateParam);

  const summary = getDailySummary(dateParam);
  res.json({ work_date: dateParam, summary, logs });
});

app.get('/api/public/monthly', (req, res) => {
  const monthParam = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
    ? req.query.month
    : getBangkokMonthString();

  const likePattern = `${monthParam}-%`;

  const calendarDays = db
    .prepare(
      `SELECT
        work_date,
        COUNT(*) as total_breaks,
        SUM(CASE WHEN status = 'on_time' THEN 1 ELSE 0 END) as on_time_count,
        SUM(CASE WHEN status = 'grace' THEN 1 ELSE 0 END) as grace_count,
        SUM(CASE WHEN status = 'overtime' OR violation_recorded = 1 THEN 1 ELSE 0 END) as overtime_count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count
       FROM break_logs
       WHERE work_date LIKE ?
       GROUP BY work_date
       ORDER BY work_date ASC`
    )
    .all(likePattern);

  const employeeRows = db
    .prepare(
      `SELECT
        e.id as employee_id,
        e.employee_code,
        e.full_name,
        e.department,
        e.position,
        COUNT(bl.id) as total_breaks,
        SUM(CASE WHEN bl.break_type = 'break_1' THEN 1 ELSE 0 END) as break_1_count,
        SUM(CASE WHEN bl.break_type = 'break_2' THEN 1 ELSE 0 END) as break_2_count,
        SUM(CASE WHEN bl.break_type = 'quick_out' THEN 1 ELSE 0 END) as quick_out_count,
        SUM(CASE WHEN bl.status = 'on_time' THEN 1 ELSE 0 END) as on_time_count,
        SUM(CASE WHEN bl.status = 'grace' THEN 1 ELSE 0 END) as grace_count,
        SUM(CASE WHEN bl.status = 'overtime' OR bl.violation_recorded = 1 THEN 1 ELSE 0 END) as overtime_count,
        COALESCE(SUM(CASE WHEN bl.status != 'active' THEN bl.duration_seconds ELSE 0 END), 0) as total_seconds,
        COALESCE(SUM(bl.exceeded_seconds), 0) as total_exceeded_seconds
       FROM employees e
       LEFT JOIN break_logs bl ON bl.employee_id = e.id AND bl.work_date LIKE ?
       WHERE e.status = 'active'
       GROUP BY e.id
       ORDER BY total_breaks DESC, e.employee_code ASC`
    )
    .all(likePattern) as Array<{
    employee_id: number;
    employee_code: string;
    full_name: string;
    department: string;
    position: string;
    total_breaks: number;
    break_1_count: number | null;
    break_2_count: number | null;
    quick_out_count: number | null;
    on_time_count: number | null;
    grace_count: number | null;
    overtime_count: number | null;
    total_seconds: number;
    total_exceeded_seconds: number;
  }>;

  const employee_summaries = employeeRows.map((r) => {
    const completed = (r.on_time_count || 0) + (r.grace_count || 0) + (r.overtime_count || 0);
    const compliant = (r.on_time_count || 0) + (r.grace_count || 0);
    return {
      employee_id: r.employee_id,
      employee_code: r.employee_code,
      full_name: r.full_name,
      department: r.department,
      position: r.position,
      total_breaks: r.total_breaks || 0,
      break_1_count: r.break_1_count || 0,
      break_2_count: r.break_2_count || 0,
      quick_out_count: r.quick_out_count || 0,
      on_time_count: r.on_time_count || 0,
      grace_count: r.grace_count || 0,
      overtime_count: r.overtime_count || 0,
      total_minutes: Math.round((r.total_seconds || 0) / 60),
      total_exceeded_seconds: r.total_exceeded_seconds || 0,
      punctuality_rate: completed > 0 ? Math.round((compliant / completed) * 100) : 100,
    };
  });

  const totals = employee_summaries.reduce(
    (acc, cur) => {
      acc.total_breaks += cur.total_breaks;
      acc.on_time_count += cur.on_time_count;
      acc.grace_count += cur.grace_count;
      acc.overtime_count += cur.overtime_count;
      acc.total_minutes += cur.total_minutes;
      return acc;
    },
    { total_breaks: 0, on_time_count: 0, grace_count: 0, overtime_count: 0, total_minutes: 0 }
  );

  res.json({
    month: monthParam,
    totals,
    calendar_days: calendarDays,
    employee_summaries,
  });
});

app.get('/api/public/employee/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const monthParam = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
    ? req.query.month
    : getBangkokMonthString();

  const employee = db
    .prepare(
      `SELECT id, employee_code, full_name, nickname, department, position, shift_name, status
       FROM employees WHERE UPPER(employee_code) = ?`
    )
    .get(code) as {
    id: number;
    employee_code: string;
    full_name: string;
    nickname: string;
    department: string;
    position: string;
    shift_name: string;
    status: 'active' | 'inactive';
  } | undefined;

  if (!employee) {
    res.status(404).json({ error: `ไม่พบรหัสพนักงาน ${code}` });
    return;
  }

  const likePattern = `${monthParam}-%`;
  const logs = db
    .prepare(
      `${BASE_LOG_SELECT} WHERE bl.employee_id = ? AND bl.work_date LIKE ? ORDER BY bl.start_time DESC`
    )
    .all(employee.id, likePattern) as Array<{
    break_type: string;
    status: string;
    duration_seconds: number;
    exceeded_seconds: number;
    violation_recorded: number;
    work_date: string;
  }>;

  const active_break = db
    .prepare(`${BASE_LOG_SELECT} WHERE bl.employee_id = ? AND bl.status = 'active' LIMIT 1`)
    .get(employee.id) || null;

  let break_1_count = 0;
  let break_2_count = 0;
  let quick_out_count = 0;
  let on_time_count = 0;
  let grace_count = 0;
  let overtime_count = 0;
  let total_seconds = 0;
  let total_exceeded_seconds = 0;

  const dayMap = new Map<string, { work_date: string; total_seconds: number; breaks_count: number; overtime_count: number }>();

  for (const log of logs) {
    if (log.break_type === 'break_1') break_1_count++;
    else if (log.break_type === 'break_2') break_2_count++;
    else if (log.break_type === 'quick_out') quick_out_count++;

    if (log.status === 'on_time') on_time_count++;
    else if (log.status === 'grace') grace_count++;
    else if (log.status === 'overtime' || log.violation_recorded === 1) overtime_count++;

    if (log.status !== 'active') {
      total_seconds += log.duration_seconds || 0;
      total_exceeded_seconds += log.exceeded_seconds || 0;
    }

    const existing = dayMap.get(log.work_date) || {
      work_date: log.work_date,
      total_seconds: 0,
      breaks_count: 0,
      overtime_count: 0,
    };
    existing.breaks_count += 1;
    if (log.status !== 'active') existing.total_seconds += log.duration_seconds || 0;
    if (log.status === 'overtime' || log.violation_recorded === 1) existing.overtime_count += 1;
    dayMap.set(log.work_date, existing);
  }

  const completed = on_time_count + grace_count + overtime_count;
  const compliant = on_time_count + grace_count;

  const daily_series = Array.from(dayMap.values())
    .sort((a, b) => a.work_date.localeCompare(b.work_date))
    .map((d) => ({
      work_date: d.work_date,
      total_minutes: Math.round(d.total_seconds / 60),
      breaks_count: d.breaks_count,
      overtime_count: d.overtime_count,
    }));

  res.json({
    employee,
    month: monthParam,
    summary: {
      total_breaks: logs.length,
      break_1_count,
      break_2_count,
      quick_out_count,
      on_time_count,
      grace_count,
      overtime_count,
      total_minutes: Math.round(total_seconds / 60),
      avg_minutes: completed > 0 ? Math.round(total_seconds / 60 / completed) : 0,
      total_exceeded_seconds,
      punctuality_rate: completed > 0 ? Math.round((compliant / completed) * 100) : 100,
    },
    daily_series,
    recent_logs: logs,
    active_break,
  });
});

app.post('/api/public/break/start', (req, res) => {
  const rawCode = String(req.body?.employee_code || '').trim().toUpperCase();
  const breakType = String(req.body?.break_type || '').trim();
  const note = String(req.body?.note || '').trim().slice(0, 200);

  if (!rawCode) {
    res.status(400).json({ error: 'กรุณากรอกรหัสพนักงาน' });
    return;
  }
  if (!['break_1', 'break_2', 'quick_out'].includes(breakType)) {
    res.status(400).json({ error: 'ประเภทเวลาพักไม่ถูกต้อง' });
    return;
  }

  const employee = db
    .prepare('SELECT * FROM employees WHERE UPPER(employee_code) = ?')
    .get(rawCode) as { id: number; employee_code: string; full_name: string; status: string } | undefined;

  if (!employee) {
    res.status(404).json({ error: `ไม่พบรหัสพนักงาน "${rawCode}" ในระบบ กรุณาติดต่อผู้ดูแลระบบ` });
    return;
  }
  if (employee.status !== 'active') {
    res.status(403).json({ error: `รหัสพนักงาน ${rawCode} ถูกระงับการใช้งานชั่วคราว` });
    return;
  }

  const existingActive = db
    .prepare("SELECT id FROM break_logs WHERE employee_id = ? AND status = 'active'")
    .get(employee.id);
  if (existingActive) {
    res.status(409).json({ error: `พนักงาน ${employee.employee_code} กำลังอยู่ในระหว่างเวลาพักอยู่แล้ว` });
    return;
  }

  const allowedMinutes = breakType === 'break_1' ? 30 : breakType === 'break_2' ? 60 : 5;
  const graceMinutes = breakType === 'quick_out' ? 0 : 5;
  const now = new Date();
  const nowIso = now.toISOString();
  const workDate = getBangkokDateString(now);

  const info = db
    .prepare(
      `INSERT INTO break_logs (
        employee_id, employee_code, break_type, allowed_minutes, grace_minutes,
        work_date, start_time, end_time, duration_seconds, exceeded_seconds,
        grace_exceeded, violation_recorded, status, note, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, 0, 0, 'active', ?, ?)`
    )
    .run(employee.id, employee.employee_code, breakType, allowedMinutes, graceMinutes, workDate, nowIso, note, nowIso);

  const created = db.prepare(`${BASE_LOG_SELECT} WHERE bl.id = ?`).get(info.lastInsertRowid);
  recordAudit(employee.employee_code, 'START_BREAK', 'break_logs', String(info.lastInsertRowid), `เริ่ม${breakType === 'break_1' ? 'พักช่วงแรก 30 นาที' : breakType === 'break_2' ? 'พักช่วงที่สอง 60 นาที' : 'เข้า-ออกชั่วคราว 5 นาที'}`);
  broadcastEvent('break:started', { record: created });

  res.status(201).json({ record: created });
});

app.post('/api/public/break/end', (req, res) => {
  const rawCode = String(req.body?.employee_code || '').trim().toUpperCase();
  const logId = req.body?.log_id ? Number(req.body.log_id) : null;

  const activeLog = (logId
    ? db.prepare("SELECT * FROM break_logs WHERE id = ? AND status = 'active'").get(logId)
    : db.prepare("SELECT * FROM break_logs WHERE UPPER(employee_code) = ? AND status = 'active' ORDER BY start_time DESC LIMIT 1").get(rawCode)) as
    | {
        id: number;
        employee_id: number;
        employee_code: string;
        break_type: string;
        allowed_minutes: number;
        grace_minutes: number;
        start_time: string;
        note: string;
      }
    | undefined;

  if (!activeLog) {
    res.status(404).json({ error: 'ไม่พบรายการพักที่กำลังดำเนินการอยู่สำหรับรหัสพนักงานนี้' });
    return;
  }

  const endNow = new Date();
  const endIso = endNow.toISOString();
  const durationSeconds = Math.max(1, Math.floor((endNow.getTime() - new Date(activeLog.start_time).getTime()) / 1000));
  const allowedSeconds = activeLog.allowed_minutes * 60;
  const maxWithGraceSeconds = (activeLog.allowed_minutes + activeLog.grace_minutes) * 60;

  const exceededSeconds = Math.max(0, durationSeconds - allowedSeconds);
  const graceExceeded = durationSeconds > maxWithGraceSeconds ? 1 : 0;
  const violationRecorded = graceExceeded;

  let finalStatus: 'on_time' | 'grace' | 'overtime' = 'on_time';
  if (graceExceeded) {
    finalStatus = 'overtime';
  } else if (exceededSeconds > 0) {
    finalStatus = 'grace';
  }

  let finalNote = activeLog.note || '';
  if (graceExceeded && !finalNote) {
    finalNote =
      activeLog.break_type === 'quick_out'
        ? 'ออก-เข้าเกิน 5 นาที (ระบบบันทึกข้อมูลอัตโนมัติ)'
        : `กลับเข้างานเกินเกณฑ์อนุโลม 5 นาที (ระบบบันทึกข้อมูลอัตโนมัติ)`;
  }

  db.prepare(
    `UPDATE break_logs
     SET end_time = ?, duration_seconds = ?, exceeded_seconds = ?,
         grace_exceeded = ?, violation_recorded = ?, status = ?, note = ?, recorded_at = ?
     WHERE id = ?`
  ).run(endIso, durationSeconds, exceededSeconds, graceExceeded, violationRecorded, finalStatus, finalNote, endIso, activeLog.id);

  const updated = db.prepare(`${BASE_LOG_SELECT} WHERE bl.id = ?`).get(activeLog.id);
  recordAudit(
    activeLog.employee_code,
    'END_BREAK',
    'break_logs',
    String(activeLog.id),
    `กลับเข้าปฏิบัติงาน (${durationSeconds} วินาที, สถานะ: ${finalStatus})`
  );
  broadcastEvent('break:ended', { record: updated });

  res.json({ record: updated });
});

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    return;
  }

  const user = db
    .prepare('SELECT * FROM admin_users WHERE LOWER(username) = LOWER(?)')
    .get(username) as
    | {
        id: number;
        username: string;
        password_hash: string;
        display_name: string;
        role: 'super_admin' | 'supervisor' | 'hr_viewer';
        is_active: number;
      }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    recordAudit(username || 'UNKNOWN', 'LOGIN_FAILED', 'admin_users', username, 'รหัสผ่านหรือชื่อผู้ใช้ไม่ถูกต้อง');
    res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    return;
  }

  if (user.is_active !== 1) {
    res.status(403).json({ error: 'บัญชีนี้ถูกปิดการใช้งานชั่วคราว' });
    return;
  }

  const token = signToken({
    uid: user.id,
    username: user.username,
    role: user.role,
  });

  recordAudit(user.username, 'LOGIN_SUCCESS', 'admin_users', String(user.id), `เข้าสู่ระบบหลังบ้าน (${user.role})`);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
    },
  });
});

app.get('/api/auth/me', requireAdmin(), (req: AuthedRequest, res) => {
  const user = db
    .prepare('SELECT id, username, display_name, role, is_active, created_at FROM admin_users WHERE id = ?')
    .get(req.adminUser!.uid);
  res.json({ user });
});

// ==========================================
// PROTECTED ADMIN BACKEND ROUTES
// ==========================================

app.get('/api/admin/employees', requireAdmin(), (_req, res) => {
  const employees = db.prepare('SELECT * FROM employees ORDER BY employee_code ASC').all();
  res.json({ employees });
});

app.post('/api/admin/employees', requireAdmin(['super_admin', 'supervisor']), (req: AuthedRequest, res) => {
  const code = String(req.body?.employee_code || '').trim().toUpperCase();
  const fullName = String(req.body?.full_name || '').trim();
  const nickname = String(req.body?.nickname || '').trim();
  const department = String(req.body?.department || '').trim();
  const position = String(req.body?.position || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const email = String(req.body?.email || '').trim();
  const shiftName = String(req.body?.shift_name || '').trim();
  const allowedStatuses = ['active', 'on_leave', 'training', 'suspended', 'removed', 'inactive'];
  const status = allowedStatuses.includes(String(req.body?.status)) ? String(req.body?.status) : 'active';

  if (!code || !fullName || !department || !position) {
    res.status(400).json({ error: 'กรุณากรอกรหัสพนักงาน ชื่อ-นามสกุล แผนก และตำแหน่งให้ครบถ้วน' });
    return;
  }

  const existing = db.prepare('SELECT id FROM employees WHERE UPPER(employee_code) = ?').get(code);
  if (existing) {
    res.status(409).json({ error: `รหัสพนักงาน ${code} มีอยู่ในระบบแล้ว` });
    return;
  }

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO employees (employee_code, full_name, nickname, department, position, phone, email, shift_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(code, fullName, nickname, department, position, phone, email, shiftName, status, now, now);

  const created = db.prepare('SELECT * FROM employees WHERE id = ?').get(info.lastInsertRowid);
  recordAudit(req.adminUser!.username, 'CREATE_EMPLOYEE', 'employees', code, `เพิ่มพนักงาน ${fullName} (${department})`);
  broadcastEvent('employees:updated');
  res.status(201).json({ employee: created });
});

app.put('/api/admin/employees/:id', requireAdmin(['super_admin', 'supervisor']), (req: AuthedRequest, res) => {
  const empId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId) as
    | { id: number; employee_code: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'ไม่พบข้อมูลพนักงาน' });
    return;
  }

  const code = String(req.body?.employee_code || existing.employee_code).trim().toUpperCase();
  const fullName = String(req.body?.full_name || '').trim();
  const nickname = String(req.body?.nickname || '').trim();
  const department = String(req.body?.department || '').trim();
  const position = String(req.body?.position || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const email = String(req.body?.email || '').trim();
  const shiftName = String(req.body?.shift_name || '').trim();
  const allowedStatuses = ['active', 'on_leave', 'training', 'suspended', 'removed', 'inactive'];
  const status = allowedStatuses.includes(String(req.body?.status)) ? String(req.body?.status) : 'active';

  if (!code || !fullName || !department || !position) {
    res.status(400).json({ error: 'ข้อมูลที่จำเป็นต้องกรอกไม่ครบถ้วน' });
    return;
  }

  const conflict = db
    .prepare('SELECT id FROM employees WHERE UPPER(employee_code) = ? AND id != ?')
    .get(code, empId);
  if (conflict) {
    res.status(409).json({ error: `รหัสพนักงาน ${code} ซ้ำกับพนักงานคนอื่น` });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE employees
     SET employee_code = ?, full_name = ?, nickname = ?, department = ?, position = ?,
         phone = ?, email = ?, shift_name = ?, status = ?, updated_at = ?
     WHERE id = ?`
  ).run(code, fullName, nickname, department, position, phone, email, shiftName, status, now, empId);

  if (code !== existing.employee_code) {
    db.prepare('UPDATE break_logs SET employee_code = ? WHERE employee_id = ?').run(code, empId);
  }

  const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
  recordAudit(req.adminUser!.username, 'UPDATE_EMPLOYEE', 'employees', code, `แก้ไขข้อมูลส่วนตัว ${fullName}`);
  broadcastEvent('employees:updated');
  res.json({ employee: updated });
});

app.delete('/api/admin/employees/:id', requireAdmin(['super_admin', 'supervisor']), (req: AuthedRequest, res) => {
  const empId = Number(req.params.id);
  const existing = db.prepare('SELECT employee_code, full_name FROM employees WHERE id = ?').get(empId) as
    | { employee_code: string; full_name: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'ไม่พบพนักงาน' });
    return;
  }

  db.prepare('DELETE FROM employees WHERE id = ?').run(empId);
  recordAudit(req.adminUser!.username, 'DELETE_EMPLOYEE', 'employees', existing.employee_code, `ลบพนักงาน ${existing.full_name}`);
  broadcastEvent('employees:updated');
  res.json({ success: true });
});

app.post('/api/admin/employees/bulk-delete', requireAdmin(['super_admin', 'supervisor']), (req: AuthedRequest, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];
  if (ids.length === 0) {
    res.status(400).json({ error: 'กรุณาเลือกรายชื่อพนักงานอย่างน้อย 1 รายการ' });
    return;
  }

  const placeholders = ids.map(() => '?').join(',');
  const info = db.prepare(`DELETE FROM employees WHERE id IN (${placeholders})`).run(...ids);
  recordAudit(req.adminUser!.username, 'BULK_DELETE_EMPLOYEES', 'employees', String(ids.length), `ลบรายชื่อพนักงานที่เลือก ${info.changes} คน`);
  broadcastEvent('employees:updated');
  res.json({ deleted: info.changes });
});

app.post('/api/admin/employees/bulk-status', requireAdmin(['super_admin', 'supervisor']), (req: AuthedRequest, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];
  const allowedStatuses = ['active', 'on_leave', 'training', 'suspended', 'removed', 'inactive'];
  const status = String(req.body?.status || '');
  if (ids.length === 0 || !allowedStatuses.includes(status)) {
    res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วนหรือสถานะไม่ถูกต้อง' });
    return;
  }

  const placeholders = ids.map(() => '?').join(',');
  const now = new Date().toISOString();
  const info = db
    .prepare(`UPDATE employees SET status = ?, updated_at = ? WHERE id IN (${placeholders})`)
    .run(status, now, ...ids);
  recordAudit(req.adminUser!.username, 'BULK_STATUS_EMPLOYEES', 'employees', status, `อัปเดตสถานะพนักงาน ${info.changes} คน เป็น ${status}`);
  broadcastEvent('employees:updated');
  res.json({ updated: info.changes });
});

// Admin-only Clear Data Endpoint (super_admin ONLY)
app.delete('/api/admin/clear', requireAdmin(['super_admin']), (req: AuthedRequest, res) => {
  const scope = String(req.query.scope || '').trim();
  const dateParam = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : '';
  const monthParam = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : '';
  const empCode = typeof req.query.employee_code === 'string' ? req.query.employee_code.trim().toUpperCase() : '';

  let clearedCount = 0;

  if (scope === 'daily') {
    const targetDate = dateParam || getBangkokDateString();
    const info = db.prepare('DELETE FROM break_logs WHERE work_date = ?').run(targetDate);
    clearedCount = info.changes;
    recordAudit(req.adminUser!.username, 'CLEAR_DAILY_DATA', 'break_logs', targetDate, `ล้างบันทึกเวลาพักประจำวันที่ ${targetDate} (${clearedCount} รายการ)`);
  } else if (scope === 'monthly') {
    const targetMonth = monthParam || getBangkokMonthString();
    const info = db.prepare('DELETE FROM break_logs WHERE work_date LIKE ?').run(`${targetMonth}-%`);
    clearedCount = info.changes;
    recordAudit(req.adminUser!.username, 'CLEAR_MONTHLY_DATA', 'break_logs', targetMonth, `ล้างบันทึกเวลาพักประจำเดือน ${targetMonth} (${clearedCount} รายการ)`);
  } else if (scope === 'employee') {
    if (!empCode) {
      res.status(400).json({ error: 'กรุณาระบุรหัสพนักงาน' });
      return;
    }
    if (monthParam) {
      const info = db
        .prepare('DELETE FROM break_logs WHERE UPPER(employee_code) = ? AND work_date LIKE ?')
        .run(empCode, `${monthParam}-%`);
      clearedCount = info.changes;
    } else {
      const info = db.prepare('DELETE FROM break_logs WHERE UPPER(employee_code) = ?').run(empCode);
      clearedCount = info.changes;
    }
    recordAudit(req.adminUser!.username, 'CLEAR_EMPLOYEE_STATS', 'break_logs', empCode, `ล้างสถิติเวลาพักของ ${empCode} (${clearedCount} รายการ)`);
  } else if (scope === 'employees') {
    const info = db.prepare('DELETE FROM employees').run();
    clearedCount = info.changes;
    recordAudit(req.adminUser!.username, 'CLEAR_ALL_EMPLOYEES', 'employees', 'ALL', `ล้างรายชื่อพนักงานทั้งหมด (${clearedCount} คน)`);
  } else if (scope === 'all_logs') {
    const info = db.prepare('DELETE FROM break_logs').run();
    clearedCount = info.changes;
    recordAudit(req.adminUser!.username, 'CLEAR_ALL_BREAK_LOGS', 'break_logs', 'ALL', `ล้างบันทึกเวลาพักทั้งหมด (${clearedCount} รายการ)`);
  } else if (scope === 'audit') {
    const info = db.prepare('DELETE FROM audit_logs').run();
    clearedCount = info.changes;
    recordAudit(req.adminUser!.username, 'CLEAR_AUDIT_LOGS', 'audit_logs', 'ALL', `ล้างบันทึกการทำงานระบบ (${clearedCount} รายการ)`);
  } else {
    res.status(400).json({ error: 'ขอบเขตการล้างข้อมูลไม่ถูกต้อง' });
    return;
  }

  broadcastEvent('data:cleared', { scope });
  res.json({ success: true, cleared: clearedCount, scope });
});

app.post('/api/admin/employees/import', requireAdmin(['super_admin', 'supervisor']), (req: AuthedRequest, res) => {
  const rows = Array.isArray(req.body?.employees) ? req.body.employees : [];
  if (rows.length === 0) {
    res.status(400).json({ error: 'ไม่พบรายการพนักงานสำหรับนำเข้า' });
    return;
  }

  const now = new Date().toISOString();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const findStmt = db.prepare('SELECT id FROM employees WHERE UPPER(employee_code) = ?');
  const insertStmt = db.prepare(
    `INSERT INTO employees (employee_code, full_name, nickname, department, position, phone, email, shift_name, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const updateStmt = db.prepare(
    `UPDATE employees
     SET full_name = ?, nickname = ?, department = ?, position = ?, phone = ?, email = ?, shift_name = ?, status = ?, updated_at = ?
     WHERE id = ?`
  );

  const tx = db.transaction((items: Array<Record<string, unknown>>) => {
    for (const item of items) {
      const code = String(item.employee_code || '').trim().toUpperCase();
      const fullName = String(item.full_name || '').trim();
      if (!code || !fullName) {
        skipped++;
        continue;
      }
      const nickname = String(item.nickname || '').trim();
      const department = String(item.department || 'ทั่วไป').trim() || 'ทั่วไป';
      const position = String(item.position || 'พนักงาน').trim() || 'พนักงาน';
      const phone = String(item.phone || '').trim();
      const email = String(item.email || '').trim();
      const shiftName = String(item.shift_name || '').trim();
      const allowedStatuses = ['active', 'on_leave', 'training', 'suspended', 'removed', 'inactive'];
      const rawStatus = String(item.status || 'active').trim().toLowerCase();
      const status = allowedStatuses.includes(rawStatus) ? rawStatus : 'active';

      const found = findStmt.get(code) as { id: number } | undefined;
      if (found) {
        updateStmt.run(fullName, nickname, department, position, phone, email, shiftName, status, now, found.id);
        updated++;
      } else {
        insertStmt.run(code, fullName, nickname, department, position, phone, email, shiftName, status, now, now);
        inserted++;
      }
    }
  });

  tx(rows);
  recordAudit(
    req.adminUser!.username,
    'IMPORT_EMPLOYEES',
    'employees',
    'BULK',
    `นำเข้าพนักงานจากไฟล์: เพิ่มใหม่ ${inserted} คน, อัปเดต ${updated} คน, ข้าม ${skipped} รายการ`
  );
  broadcastEvent('employees:updated');
  res.json({ inserted, updated, skipped });
});

app.get('/api/admin/logs', requireAdmin(), (req, res) => {
  const dateParam = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : '';
  const monthParam = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : '';
  const statusParam = typeof req.query.status === 'string' ? req.query.status : '';
  const empParam = typeof req.query.employee_code === 'string' ? req.query.employee_code.trim().toUpperCase() : '';

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (dateParam) {
    conditions.push('bl.work_date = ?');
    params.push(dateParam);
  } else if (monthParam) {
    conditions.push('bl.work_date LIKE ?');
    params.push(`${monthParam}-%`);
  }

  if (statusParam === 'overtime_only') {
    conditions.push("(bl.status = 'overtime' OR bl.violation_recorded = 1)");
  } else if (['active', 'on_time', 'grace', 'overtime'].includes(statusParam)) {
    conditions.push('bl.status = ?');
    params.push(statusParam);
  }

  if (empParam) {
    conditions.push('(UPPER(bl.employee_code) LIKE ? OR e.full_name LIKE ?)');
    params.push(`%${empParam}%`, `%${empParam}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const logs = db
    .prepare(`${BASE_LOG_SELECT} ${whereClause} ORDER BY bl.start_time DESC LIMIT 500`)
    .all(...params);

  res.json({ logs });
});

app.put('/api/admin/logs/:id', requireAdmin(['super_admin', 'supervisor']), (req: AuthedRequest, res) => {
  const logId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM break_logs WHERE id = ?').get(logId) as
    | { id: number; employee_code: string; status: string; allowed_minutes: number; grace_minutes: number; start_time: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'ไม่พบบันทึกเวลาพัก' });
    return;
  }

  const note = String(req.body?.note ?? '').trim().slice(0, 300);
  const forceEnd = Boolean(req.body?.force_end);

  if (forceEnd && existing.status === 'active') {
    const endNow = new Date();
    const durationSeconds = Math.max(1, Math.floor((endNow.getTime() - new Date(existing.start_time).getTime()) / 1000));
    const allowedSeconds = existing.allowed_minutes * 60;
    const maxWithGrace = (existing.allowed_minutes + existing.grace_minutes) * 60;
    const exceededSeconds = Math.max(0, durationSeconds - allowedSeconds);
    const graceExceeded = durationSeconds > maxWithGrace ? 1 : 0;
    const status = graceExceeded ? 'overtime' : exceededSeconds > 0 ? 'grace' : 'on_time';

    db.prepare(
      `UPDATE break_logs
       SET end_time = ?, duration_seconds = ?, exceeded_seconds = ?,
           grace_exceeded = ?, violation_recorded = ?, status = ?, note = ?, recorded_at = ?
       WHERE id = ?`
    ).run(
      endNow.toISOString(),
      durationSeconds,
      exceededSeconds,
      graceExceeded,
      graceExceeded,
      status,
      note || `ปิดรอบพักโดยผู้ดูแล (${req.adminUser!.username})`,
      endNow.toISOString(),
      logId
    );
    recordAudit(req.adminUser!.username, 'FORCE_END_BREAK', 'break_logs', String(logId), `ปิดรอบพักของ ${existing.employee_code}`);
  } else {
    db.prepare('UPDATE break_logs SET note = ? WHERE id = ?').run(note, logId);
    recordAudit(req.adminUser!.username, 'UPDATE_LOG_NOTE', 'break_logs', String(logId), `แก้ไขหมายเหตุบันทึก #${logId}`);
  }

  const updated = db.prepare(`${BASE_LOG_SELECT} WHERE bl.id = ?`).get(logId);
  broadcastEvent('logs:updated');
  res.json({ record: updated });
});

app.delete('/api/admin/logs/:id', requireAdmin(['super_admin']), (req: AuthedRequest, res) => {
  const logId = Number(req.params.id);
  const existing = db.prepare('SELECT employee_code FROM break_logs WHERE id = ?').get(logId) as
    | { employee_code: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'ไม่พบบันทึกเวลาพัก' });
    return;
  }

  db.prepare('DELETE FROM break_logs WHERE id = ?').run(logId);
  recordAudit(req.adminUser!.username, 'DELETE_BREAK_LOG', 'break_logs', String(logId), `ลบบันทึกเวลาพักของ ${existing.employee_code}`);
  broadcastEvent('logs:updated');
  res.json({ success: true });
});

// Admin User & RBAC Management
app.get('/api/admin/users', requireAdmin(['super_admin', 'supervisor']), (_req, res) => {
  const users = db
    .prepare('SELECT id, username, display_name, role, is_active, created_at FROM admin_users ORDER BY id ASC')
    .all();
  res.json({ users });
});

app.post('/api/admin/users', requireAdmin(['super_admin']), (req: AuthedRequest, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.display_name || '').trim();
  const role = String(req.body?.role || 'supervisor');

  if (!username || password.length < 6 || !displayName) {
    res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้ ชื่อแสดงผล และรหัสผ่านอย่างน้อย 6 ตัวอักษร' });
    return;
  }
  if (!['super_admin', 'supervisor', 'hr_viewer'].includes(role)) {
    res.status(400).json({ error: 'บทบาทสิทธิ์ไม่ถูกต้อง' });
    return;
  }

  const existing = db.prepare('SELECT id FROM admin_users WHERE LOWER(username) = LOWER(?)').get(username);
  if (existing) {
    res.status(409).json({ error: `ชื่อผู้ใช้ ${username} มีอยู่ในระบบแล้ว` });
    return;
  }

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO admin_users (username, password_hash, display_name, role, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`
    )
    .run(username, hashPassword(password), displayName, role, now);

  const created = db
    .prepare('SELECT id, username, display_name, role, is_active, created_at FROM admin_users WHERE id = ?')
    .get(info.lastInsertRowid);
  recordAudit(req.adminUser!.username, 'CREATE_ADMIN_USER', 'admin_users', username, `เพิ่มผู้ใช้งานหลังบ้าน สิทธิ์ ${role}`);
  res.status(201).json({ user: created });
});

app.put('/api/admin/users/:id', requireAdmin(['super_admin']), (req: AuthedRequest, res) => {
  const uid = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(uid) as
    | { id: number; username: string; role: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'ไม่พบบัญชีผู้ใช้งาน' });
    return;
  }

  const displayName = req.body?.display_name !== undefined ? String(req.body.display_name).trim() : undefined;
  const role = req.body?.role && ['super_admin', 'supervisor', 'hr_viewer'].includes(String(req.body.role)) ? String(req.body.role) : undefined;
  const isActive = req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : undefined;
  const newPassword = req.body?.password ? String(req.body.password) : '';

  if (existing.username.toLowerCase() === 'admin' && isActive === 0) {
    res.status(400).json({ error: 'ไม่สามารถปิดการใช้งานบัญชี Admin หลักได้' });
    return;
  }

  if (displayName) {
    db.prepare('UPDATE admin_users SET display_name = ? WHERE id = ?').run(displayName, uid);
  }
  if (role) {
    db.prepare('UPDATE admin_users SET role = ? WHERE id = ?').run(role, uid);
  }
  if (isActive !== undefined) {
    db.prepare('UPDATE admin_users SET is_active = ? WHERE id = ?').run(isActive, uid);
  }
  if (newPassword) {
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
      return;
    }
    db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), uid);
  }

  const updated = db
    .prepare('SELECT id, username, display_name, role, is_active, created_at FROM admin_users WHERE id = ?')
    .get(uid);
  recordAudit(req.adminUser!.username, 'UPDATE_ADMIN_USER', 'admin_users', existing.username, 'อัปเดตสิทธิ์หรือสถานะผู้ใช้งาน');
  res.json({ user: updated });
});

app.get('/api/admin/audit', requireAdmin(), (_req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 250').all();
  res.json({ logs });
});

// ==========================================
// VITE / STATIC SERVING
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`BreakSync 3D server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
