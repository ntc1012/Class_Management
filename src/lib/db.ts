import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient } from "pg";
import type { Row } from "./types";

const globals = globalThis as unknown as {
  cfPool?: Pool;
  cfSqlite?: any;
  cfInit?: Promise<void>;
  cfQueue?: Promise<void>;
};
const txContext = new AsyncLocalStorage<{
  client?: PoolClient;
  sqlite?: boolean;
}>();
const postgres = () => Boolean(process.env.DATABASE_URL);
function sqlite() {
  if (!globals.cfSqlite) {
    if (process.env.NODE_ENV !== "test")
      throw new Error("ClassFlow requires a PostgreSQL DATABASE_URL");
    const target = path.resolve(
      process.env.SQLITE_PATH || "data/classflow.sqlite",
    );
    mkdirSync(path.dirname(target), { recursive: true });
    globals.cfSqlite = new DatabaseSync(target);
    globals.cfSqlite.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
  }
  return globals.cfSqlite;
}
function pool() {
  return (globals.cfPool ||= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 8,
  }));
}
function pgSql(sql: string) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}
async function execute<T extends Row = Row>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (postgres()) {
    const runner = txContext.getStore()?.client || pool();
    return (await runner.query(pgSql(sql), params)).rows as T[];
  }
  const stmt = sqlite().prepare(sql);
  const values = params.map((v) => (v === undefined ? null : v));
  if (/^\s*(SELECT|WITH|PRAGMA)/i.test(sql) || /\bRETURNING\b/i.test(sql))
    return stmt.all(...values).map((row: Row) => ({ ...row })) as T[];
  stmt.run(...values);
  return [];
}
export async function query<T extends Row = Row>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  // A single SQLite connection must not interleave another request's work inside a transaction.
  if (!postgres() && !txContext.getStore())
    return serialized(() => execute<T>(sql, params));
  return execute<T>(sql, params);
}
export async function one(sql: string, params: unknown[] = []) {
  return (await query(sql, params))[0];
}
async function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const previous = globals.cfQueue || Promise.resolve();
  let release!: () => void;
  globals.cfQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (txContext.getStore()) return fn();
  const run = async () => {
    const client = postgres() ? await pool().connect() : undefined;
    return txContext.run({ client, sqlite: !client }, async () => {
      try {
        await execute(client ? "BEGIN" : "BEGIN IMMEDIATE");
        const value = await fn();
        await execute("COMMIT");
        return value;
      } catch (e) {
        await execute("ROLLBACK");
        throw e;
      } finally {
        client?.release();
      }
    });
  };
  return postgres() ? run() : serialized(run);
}
export async function lock(sql: string, params: unknown[]) {
  return one(sql + (postgres() ? " FOR UPDATE" : ""), params);
}
export const now = () => new Date().toISOString();
export async function closeDatabase() {
  await globals.cfQueue;
  if (globals.cfPool) {
    await globals.cfPool.end();
    globals.cfPool = undefined;
  }
  if (globals.cfSqlite) {
    globals.cfSqlite.close();
    globals.cfSqlite = undefined;
  }
  globals.cfInit = undefined;
}
export async function initialize() {
  if (!globals.cfInit)
    globals.cfInit = (async () => {
      for (const statement of schema.split(";"))
        if (statement.trim()) await query(statement);
      for (const [table, column] of [
        ["payment_requests", "provider_account"],
        ["payment_requests", "provider_credentials"],
        ["bank_accounts", "verified_at"],
        ["classes", "created_by"],
        ["sessions", "teacher_id"],
      ]) {
        if (postgres())
          await query(
            `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} TEXT`,
          );
        else if (
          !(await query(`PRAGMA table_info(${table})`)).some(
            (r) => r.name === column,
          )
        )
          await query(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
      }
      if (!postgres()) {
        const definition = await one(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='enrollments'",
        );
        if (definition?.sql.includes("UNIQUE(class_id,student_id)"))
          await transaction(async () => {
            await query(
              "CREATE TABLE enrollments_v2 (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), class_id TEXT NOT NULL REFERENCES classes(id), student_id TEXT NOT NULL REFERENCES students(id), joined_at TEXT NOT NULL, ended_at TEXT)",
            );
            await query("INSERT INTO enrollments_v2 SELECT * FROM enrollments");
            await query("DROP TABLE enrollments");
            await query("ALTER TABLE enrollments_v2 RENAME TO enrollments");
            await query(
              "CREATE UNIQUE INDEX enrollments_active ON enrollments(class_id,student_id) WHERE ended_at IS NULL",
            );
          });
      }
      await transaction(async () => {
        await query(
          "INSERT INTO app_bootstrap(id,completed_at) VALUES('class-assignment-v1',NULL) ON CONFLICT(id) DO NOTHING",
        );
        const migration = await lock(
          "SELECT * FROM app_bootstrap WHERE id='class-assignment-v1'",
          [],
        );
        if (migration.completed_at) return;
        if (postgres())
          await query(
            "ALTER TABLE classes ALTER COLUMN teacher_id DROP NOT NULL",
          );
        await query(
          "UPDATE classes SET created_by=COALESCE((SELECT l.actor_id FROM audit_logs l WHERE l.entity_id=classes.id AND l.action='class.create' ORDER BY l.created_at LIMIT 1),teacher_id) WHERE created_by IS NULL",
        );
        await query(
          "UPDATE sessions SET teacher_id=(SELECT c.teacher_id FROM classes c WHERE c.id=sessions.class_id) WHERE teacher_id IS NULL",
        );
        await query(
          "UPDATE classes SET teacher_id=NULL WHERE teacher_id IN (SELECT id FROM users WHERE role='owner')",
        );
        await query(
          "UPDATE sessions SET teacher_id=NULL WHERE status='scheduled' AND class_id IN (SELECT id FROM classes WHERE teacher_id IS NULL)",
        );
        await query(
          "UPDATE app_bootstrap SET completed_at=? WHERE id='class-assignment-v1'",
          [now()],
        );
      });
    })().catch((e) => {
      globals.cfInit = undefined;
      throw e;
    });
  return globals.cfInit;
}
const schema = `
CREATE TABLE IF NOT EXISTS app_bootstrap (id TEXT PRIMARY KEY, completed_at TEXT);
CREATE TABLE IF NOT EXISTS centers (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','teacher','student')), password_hash TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activations (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL, used_at TEXT);
CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_start TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), teacher_id TEXT NOT NULL REFERENCES users(id), user_id TEXT UNIQUE REFERENCES users(id), name TEXT NOT NULL, school TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), teacher_id TEXT REFERENCES users(id), name TEXT NOT NULL, subject TEXT NOT NULL, level TEXT NOT NULL DEFAULT '', room TEXT NOT NULL DEFAULT '', capacity INTEGER NOT NULL DEFAULT 30, fee INTEGER NOT NULL DEFAULT 50000 CHECK(fee >= 0), color TEXT NOT NULL DEFAULT 'blue', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS enrollments (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), class_id TEXT NOT NULL REFERENCES classes(id), student_id TEXT NOT NULL REFERENCES students(id), joined_at TEXT NOT NULL, ended_at TEXT);
CREATE TABLE IF NOT EXISTS schedules (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), class_id TEXT NOT NULL REFERENCES classes(id), weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6), start_time TEXT NOT NULL, end_time TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), class_id TEXT NOT NULL REFERENCES classes(id), schedule_id TEXT REFERENCES schedules(id), original_date TEXT NOT NULL, date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, fee INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','locked','cancelled')), locked_at TEXT, UNIQUE(schedule_id,original_date));
CREATE TABLE IF NOT EXISTS attendance (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), session_id TEXT NOT NULL REFERENCES sessions(id), student_id TEXT NOT NULL REFERENCES students(id), status TEXT NOT NULL CHECK(status IN ('present','excused','absent')), note TEXT NOT NULL DEFAULT '', marked_by TEXT NOT NULL REFERENCES users(id), marked_at TEXT NOT NULL, UNIQUE(session_id,student_id));
CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), student_id TEXT NOT NULL REFERENCES students(id), teacher_id TEXT NOT NULL REFERENCES users(id), period TEXT NOT NULL, amount INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(teacher_id,student_id,period));
CREATE TABLE IF NOT EXISTS invoice_lines (id TEXT PRIMARY KEY, invoice_id TEXT NOT NULL REFERENCES invoices(id), session_id TEXT NOT NULL REFERENCES sessions(id), label TEXT NOT NULL, amount INTEGER NOT NULL, UNIQUE(invoice_id,session_id));
CREATE TABLE IF NOT EXISTS adjustments (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), invoice_id TEXT NOT NULL REFERENCES invoices(id), amount INTEGER NOT NULL, reason TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payment_requests (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), invoice_id TEXT NOT NULL REFERENCES invoices(id), teacher_id TEXT NOT NULL REFERENCES users(id), order_code BIGINT NOT NULL UNIQUE, amount INTEGER NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', checkout_url TEXT, qr_data TEXT, provider_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), invoice_id TEXT NOT NULL REFERENCES invoices(id), request_id TEXT REFERENCES payment_requests(id), provider TEXT NOT NULL, transaction_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), paid_at TEXT NOT NULL, UNIQUE(provider,transaction_id));
CREATE TABLE IF NOT EXISTS payment_events (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), request_id TEXT REFERENCES payment_requests(id), provider TEXT NOT NULL, transaction_id TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(provider,transaction_id));
CREATE TABLE IF NOT EXISTS bank_accounts (teacher_id TEXT PRIMARY KEY REFERENCES users(id), center_id TEXT NOT NULL REFERENCES centers(id), bank TEXT NOT NULL, account_number TEXT NOT NULL, account_name TEXT NOT NULL, credentials TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), class_id TEXT NOT NULL REFERENCES classes(id), teacher_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, description TEXT NOT NULL, due_at TEXT NOT NULL, closed_at TEXT, max_score INTEGER NOT NULL DEFAULT 10, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS assignment_targets (assignment_id TEXT NOT NULL REFERENCES assignments(id), student_id TEXT NOT NULL REFERENCES students(id), PRIMARY KEY(assignment_id,student_id));
CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), assignment_id TEXT NOT NULL REFERENCES assignments(id), student_id TEXT NOT NULL REFERENCES students(id), version INTEGER NOT NULL, body TEXT NOT NULL, submitted_at TEXT NOT NULL, score REAL, feedback TEXT, graded_by TEXT REFERENCES users(id), graded_at TEXT, UNIQUE(assignment_id,student_id,version));
CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), assignment_id TEXT REFERENCES assignments(id), submission_id TEXT REFERENCES submissions(id), teacher_id TEXT NOT NULL REFERENCES users(id), uploaded_by TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, storage_key TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, center_id TEXT NOT NULL REFERENCES centers(id), actor_id TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS students_teacher ON students(center_id,teacher_id);
CREATE INDEX IF NOT EXISTS classes_teacher ON classes(center_id,teacher_id);
CREATE INDEX IF NOT EXISTS sessions_date ON sessions(center_id,date,class_id);
CREATE INDEX IF NOT EXISTS attendance_student ON attendance(center_id,student_id);
CREATE INDEX IF NOT EXISTS invoices_teacher ON invoices(center_id,teacher_id,period);
CREATE INDEX IF NOT EXISTS submissions_assignment ON submissions(assignment_id,student_id);
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_active ON enrollments(class_id,student_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id,created_at);
CREATE INDEX IF NOT EXISTS audit_center ON audit_logs(center_id,created_at);
`;
