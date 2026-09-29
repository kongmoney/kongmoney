export function requireDb(env) {
  if (!env?.DB || typeof env.DB.prepare !== 'function') {
    const err = new Error('D1 연결이 필요합니다. Cloudflare Pages의 D1 database binding 이름을 DB로 설정해주세요.');
    err.status = 503;
    throw err;
  }
  return env.DB;
}

export async function ensureAppTables(env) {
  const db = requireDb(env);
  // DDL은 batch가 아니라 각각 실행해 초기화 실패 지점을 명확히 한다.
  await db.prepare(`CREATE TABLE IF NOT EXISTS recurring_expenses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    amount INTEGER NOT NULL,
    split_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS month_meta (
    month TEXT PRIMARY KEY,
    memo TEXT NOT NULL DEFAULT '',
    closed INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    amount INTEGER NOT NULL,
    split_type TEXT NOT NULL,
    manager REAL NOT NULL DEFAULT 0,
    member_a REAL NOT NULL DEFAULT 0,
    member_b REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_expenses_month ON expenses(month)').run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`).run();

  return db;
}
