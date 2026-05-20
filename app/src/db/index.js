import * as SQLite from 'expo-sqlite';
import { migrations, TABLES, V1_REQUIRED_TABLES } from './schema';
import { logError, logInfo } from '../core/utils/log';

let _db = null;
let _opening = null;

export async function getDB() {
  if (_db) return _db;
  if (_opening) return _opening;
  _opening = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync('drift.db');
      // Runtime PRAGMAs — per-connection settings, must run before any transaction
      // or first read. foreign_keys is a per-connection PRAGMA (not DDL), so it
      // lives here, not inside a migration.
      await db.execAsync(`
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;
        PRAGMA cache_size = -20000;
        PRAGMA mmap_size = 268435456;
        PRAGMA wal_autocheckpoint = 1000;
      `);
      await runMigrations(db);
      _db = db;
      return db;
    } finally {
      _opening = null;
    }
  })();
  return _opening;
}

async function runMigrations(db) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const head = await db.getFirstAsync(
    'SELECT COALESCE(MAX(version), 0) AS v FROM schema_version'
  );
  let currentVersion = head?.v || 0;

  // Legacy stamp: an install from before this runner existed has every v1 table
  // already, but no schema_version row. Record v1 without re-running v1.up.
  if (currentVersion === 0) {
    const placeholders = V1_REQUIRED_TABLES.map(() => '?').join(',');
    const existing = await db.getAllAsync(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${placeholders})`,
      V1_REQUIRED_TABLES
    );
    if (existing.length === V1_REQUIRED_TABLES.length) {
      await db.runAsync(
        'INSERT INTO schema_version (version, name) VALUES (?, ?)',
        [1, 'initial-schema (legacy stamp)']
      );
      currentVersion = 1;
      logInfo('migration', 'stamped legacy install as v1 (no DDL run)');
    }
  }

  for (const mig of migrations) {
    if (mig.version <= currentVersion) continue;
    try {
      if (mig.transactionless) {
        // The migration owns its own transaction discipline. Needed when the
        // body must toggle PRAGMAs (e.g. foreign_keys) that SQLite ignores
        // inside a multi-statement transaction. The migration is responsible
        // for being idempotent on retry — if up() commits but the stamp insert
        // below fails, the next boot will re-run up().
        await mig.up(db);
        await db.runAsync(
          'INSERT INTO schema_version (version, name) VALUES (?, ?)',
          [mig.version, mig.name]
        );
      } else {
        await db.withTransactionAsync(async () => {
          await mig.up(db);
          await db.runAsync(
            'INSERT INTO schema_version (version, name) VALUES (?, ?)',
            [mig.version, mig.name]
          );
        });
      }
      logInfo('migration', `applied v${mig.version} ${mig.name}`);
    } catch (e) {
      logError(`migration:v${mig.version}`, e);
      throw e;
    }
  }
}

export async function resetAll() {
  const db = await getDB();
  await db.withTransactionAsync(async () => {
    for (const t of TABLES) {
      await db.execAsync(`DELETE FROM ${t};`);
    }
  });
}

export async function exec(sql, params = []) {
  const db = await getDB();
  return db.runAsync(sql, params);
}

export async function all(sql, params = []) {
  const db = await getDB();
  return db.getAllAsync(sql, params);
}

export async function one(sql, params = []) {
  const db = await getDB();
  return db.getFirstAsync(sql, params);
}
