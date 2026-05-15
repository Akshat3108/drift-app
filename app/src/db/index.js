import * as SQLite from 'expo-sqlite';
import { SCHEMA, TABLES } from './schema';

let _db = null;
let _opening = null;

export async function getDB() {
  if (_db) return _db;
  if (_opening) return _opening;
  _opening = (async () => {
    const db = await SQLite.openDatabaseAsync('drift.db');
    await db.execAsync(SCHEMA);
    _db = db;
    _opening = null;
    return db;
  })();
  return _opening;
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
