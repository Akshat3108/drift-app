// 8.8 — Backup orchestrators.
//
// createBackup({ passphrase }): zip (drift.db + receipts/) → AES-256-GCM
// encrypt → write to documentDirectory/drift/backups/ → return file path
// so the caller can hand it to expo-sharing.shareAsync().
//
// restoreBackup({ uri, passphrase }): read → decrypt → unzip in memory
// → write to staging dir → close DB → atomic flip with .pre-restore
// rollback → reopen DB → sanity-check schema_version.
//
// Atomic-flip is the critical-correctness path. Order:
//   (a) decrypt + unzip ENTIRELY IN MEMORY — wrong passphrase / corrupt
//       file fails before any disk touch to live paths
//   (b) populate STAGING dir fully
//   (c) closeDB() — release the live SQLite handle
//   (d) rename live → .pre-restore (instant — same-volume rename)
//   (e) rename staging → live
//   (f) reopen + sanity check
//   (g) on success: delete .pre-restore + staging
//   (h) on ANY failure in (d)-(f): rollback restores .pre-restore → live,
//       reopen original, re-throw

import { zipSync, unzipSync } from 'fflate';
import { encryptZip, decryptZip, BackupFormatError } from './crypto';
import { getDB, closeDB } from '../db';
import { logError, logInfo } from '@core/utils/log';
import { queryCache } from '@core/state/useQuery';

// Lazy-required so this module loads cleanly under Node validation harnesses.
function fs() { return require('expo-file-system/legacy'); }

const BACKUPS_DIR        = (FS) => `${FS.documentDirectory}drift/backups/`;
const DB_PATH            = (FS) => `${FS.documentDirectory}SQLite/drift.db`;
const DB_DIR             = (FS) => `${FS.documentDirectory}SQLite/`;
const RECEIPTS_DIR       = (FS) => `${FS.documentDirectory}drift/receipts/`;
const STAGING_DIR        = (FS) => `${FS.documentDirectory}drift/restore-staging/`;
const DB_PRE_RESTORE     = (FS) => `${FS.documentDirectory}SQLite/drift.db.pre-restore`;
const RECEIPTS_PRE_RESTORE = (FS) => `${FS.documentDirectory}drift/receipts.pre-restore/`;

// ── Filesystem helpers ────────────────────────────────────────────────

async function exists(FS, path) {
  try { const i = await FS.getInfoAsync(path); return !!i?.exists; } catch { return false; }
}

async function ensureDir(FS, dir) {
  if (!(await exists(FS, dir))) {
    await FS.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function deleteIfExists(FS, path) {
  try { await FS.deleteAsync(path, { idempotent: true }); } catch (e) { logError('delete', e); }
}

function dirname(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i + 1);
}

async function readBytes(FS, path) {
  const b64 = await FS.readAsStringAsync(path, {
    encoding: FS.EncodingType?.Base64 ?? 'base64',
  });
  return base64ToBytes(b64);
}

async function writeBytes(FS, path, bytes) {
  await FS.writeAsStringAsync(path, bytesToBase64(bytes), {
    encoding: FS.EncodingType?.Base64 ?? 'base64',
  });
}

// Recursive walk that yields file paths under `dir` relative to `dir`.
async function walkRelative(FS, dir, accum = [], prefix = '') {
  if (!(await exists(FS, dir))) return accum;
  let entries;
  try { entries = await FS.readDirectoryAsync(dir); } catch { return accum; }
  for (const name of entries) {
    const child = `${dir}${name}`;
    let info; try { info = await FS.getInfoAsync(child); } catch { continue; }
    if (info?.isDirectory) {
      await walkRelative(FS, `${child}/`, accum, `${prefix}${name}/`);
    } else if (info?.exists) {
      accum.push({ relPath: `${prefix}${name}`, fullPath: child });
    }
  }
  return accum;
}

// Pure base64 ↔ Uint8Array helpers. Avoids depending on Buffer (Node-only)
// or atob/btoa (which mangle binary). Uses Hermes-friendly primitives.
function base64ToBytes(b64) {
  // Hermes / RN provide atob globally on SDK 50+. Fallback for Node tests.
  const a = typeof atob === 'function' ? atob : (s) => Buffer.from(s, 'base64').toString('binary');
  const bin = a(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes) {
  const b = typeof btoa === 'function' ? btoa : (s) => Buffer.from(s, 'binary').toString('base64');
  let bin = '';
  // Chunked to avoid String.fromCharCode arg-count limits on large arrays.
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return b(bin);
}

// ── createBackup ──────────────────────────────────────────────────────

export async function createBackup({ passphrase }) {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('passphrase must be at least 8 characters');
  }
  const FS = fs();
  // The DB may still be holding uncommitted bytes in the WAL. Force a
  // checkpoint via the open handle before reading — getDB() opens the
  // canonical connection which has wal_autocheckpoint=1000.
  const db = await getDB();
  try { await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (e) { logError('backup:checkpoint', e); }

  // Build the zip manifest: drift.db + every file under receipts/.
  const dbBytes = await readBytes(FS, DB_PATH(FS));
  const manifest = { 'drift.db': dbBytes };
  const receipts = await walkRelative(FS, RECEIPTS_DIR(FS));
  for (const r of receipts) {
    try { manifest[`receipts/${r.relPath}`] = await readBytes(FS, r.fullPath); }
    catch (e) { logError(`backup:read:${r.relPath}`, e); }
  }

  const zipBytes = zipSync(manifest);
  const encrypted = await encryptZip(zipBytes, passphrase);

  // Write the encrypted blob to documentDirectory/drift/backups/
  await ensureDir(FS, BACKUPS_DIR(FS));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const path = `${BACKUPS_DIR(FS)}Drift-Backup-${stamp}.driftbackup`;
  await writeBytes(FS, path, encrypted);

  logInfo('backup', `wrote ${(encrypted.length / 1024 / 1024).toFixed(2)}MB to ${path}`);
  return { path, bytes: encrypted.length, fileCount: 1 + receipts.length };
}

// ── previewRestore ────────────────────────────────────────────────────
//
// PS-42 — dry-run before the destructive atomic swap. Decrypts + unzips IN
// MEMORY (so a wrong passphrase / corrupt file fails harmlessly), writes the
// backup's drift.db to a throwaway SQLite file, opens it read-only, and counts
// the key tables. Returns { backup, current } so the UI can show the user what
// a restore would REPLACE before they commit. Touches no live path.
export async function previewRestore({ uri, passphrase }) {
  if (!uri) throw new Error('uri required');
  if (!passphrase) throw new Error('passphrase required');
  const FS = fs();

  const encrypted = await readBytes(FS, uri);
  const zipBytes  = await decryptZip(encrypted, passphrase);   // throws BackupAuthError on wrong passphrase
  let files;
  try { files = unzipSync(zipBytes); }
  catch (e) { throw new BackupFormatError(`zip corrupted: ${e.message}`); }
  if (!files['drift.db']) throw new BackupFormatError('backup missing drift.db');

  const SQLite = require('expo-sqlite');
  const previewName = 'drift-restore-preview.db';
  const previewPath = `${DB_DIR(FS)}${previewName}`;
  await ensureDir(FS, DB_DIR(FS));
  await deleteIfExists(FS, previewPath);
  await deleteIfExists(FS, `${previewPath}-wal`);
  await deleteIfExists(FS, `${previewPath}-shm`);
  await writeBytes(FS, previewPath, files['drift.db']);

  const countTables = async (db) => {
    const n = async (sql) => { try { const r = await db.getFirstAsync(sql); return r?.n ?? 0; } catch { return 0; } };
    return {
      expenses: await n(`SELECT COUNT(*) AS n FROM expenses WHERE deleted_at IS NULL`),
      income:   await n(`SELECT COUNT(*) AS n FROM income`),
      items:    await n(`SELECT COUNT(*) AS n FROM receipt_items`),
      schema:   await n(`SELECT MAX(version) AS n FROM schema_version`),
    };
  };

  let backup;
  const pdb = await SQLite.openDatabaseAsync(previewName);
  try {
    backup = await countTables(pdb);
    backup.receipts = Object.keys(files).filter((k) => k.startsWith('receipts/')).length;
  } finally {
    try { await pdb.closeAsync(); } catch (e) { logError('preview:close', e); }
    await deleteIfExists(FS, previewPath);
    await deleteIfExists(FS, `${previewPath}-wal`);
    await deleteIfExists(FS, `${previewPath}-shm`);
  }

  const live = await getDB();
  const current = await countTables(live);
  current.receipts = (await walkRelative(FS, RECEIPTS_DIR(FS))).length;

  return { backup, current };
}

// ── restoreBackup ─────────────────────────────────────────────────────

export async function restoreBackup({ uri, passphrase }) {
  if (!uri) throw new Error('uri required');
  if (!passphrase) throw new Error('passphrase required');

  const FS = fs();

  // (a) Decrypt + unzip ENTIRELY IN MEMORY. Failures here happen before
  // any live-path disk touch — the user's data is untouched on cancel.
  const encrypted = await readBytes(FS, uri);
  const zipBytes  = await decryptZip(encrypted, passphrase);   // throws BackupAuthError on wrong passphrase
  let files;
  try { files = unzipSync(zipBytes); }
  catch (e) { throw new BackupFormatError(`zip corrupted: ${e.message}`); }
  if (!files['drift.db']) {
    throw new BackupFormatError('backup missing drift.db');
  }

  // (b) Populate STAGING dir
  const staging = STAGING_DIR(FS);
  await deleteIfExists(FS, staging);
  await ensureDir(FS, staging);
  for (const [name, bytes] of Object.entries(files)) {
    const path = `${staging}${name}`;
    await ensureDir(FS, dirname(path));
    await writeBytes(FS, path, bytes);
  }

  // (c) Release the live SQLite handle so we can move the file out.
  await closeDB();

  // (d-h) Atomic flip with rollback.
  const dbPath        = DB_PATH(FS);
  const dbPreRestore  = DB_PRE_RESTORE(FS);
  const receiptsPath  = RECEIPTS_DIR(FS);
  const receiptsPreR  = RECEIPTS_PRE_RESTORE(FS);
  const stagingDb     = `${staging}drift.db`;
  const stagingRcpts  = `${staging}receipts/`;

  try {
    // Clear any leftover .pre-restore from a prior crashed run.
    await deleteIfExists(FS, dbPreRestore);
    await deleteIfExists(FS, receiptsPreR);

    // Move CURRENT → .pre-restore (instant same-volume rename).
    if (await exists(FS, dbPath)) {
      await FS.moveAsync({ from: dbPath, to: dbPreRestore });
    }
    if (await exists(FS, receiptsPath)) {
      await FS.moveAsync({ from: receiptsPath, to: receiptsPreR });
    }

    // Move STAGING → live.
    await ensureDir(FS, DB_DIR(FS));
    await FS.moveAsync({ from: stagingDb, to: dbPath });
    if (await exists(FS, stagingRcpts)) {
      await FS.moveAsync({ from: stagingRcpts, to: receiptsPath });
    }

    // Reopen — getDB() runs PRAGMAs + migrations on the restored file.
    const db = await getDB();
    const v = await db.getFirstAsync(`SELECT MAX(version) AS v FROM schema_version`);
    if (!v?.v) throw new Error('restored DB has no schema_version row');

    // Success — clean up rollback files + staging.
    await deleteIfExists(FS, dbPreRestore);
    await deleteIfExists(FS, receiptsPreR);
    await deleteIfExists(FS, staging);
    // 8.9 — wholesale state replacement; any cache entry from the previous
    // DB is meaningless against the new one. clearForReset() drops them all
    // so the post-restore popToTop()/provider re-mount sees fresh fetches.
    queryCache.clearForReset();
    logInfo('restore', `OK — schema v${v.v}`);
    return { ok: true, schemaVersion: v.v };
  } catch (e) {
    // ROLLBACK — restore .pre-restore → live.
    logError('restore:rollback', e);
    try { await deleteIfExists(FS, dbPath); } catch {}
    try { await deleteIfExists(FS, receiptsPath); } catch {}
    try { if (await exists(FS, dbPreRestore)) await FS.moveAsync({ from: dbPreRestore, to: dbPath }); } catch {}
    try { if (await exists(FS, receiptsPreR)) await FS.moveAsync({ from: receiptsPreR, to: receiptsPath }); } catch {}
    await getDB();   // reopen original
    throw e;
  }
}
