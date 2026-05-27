// 8.7 — Maintenance task: orphan receipt-file GC.
//
// Walks documentDirectory/drift/receipts/{full,thumb}/** recursively to
// build the on-disk Set, then SELECTs receipt_path + receipt_thumb from
// expenses to build the DB-referenced Set. Files in (on-disk - DB) are
// orphans: typically a save that rolled back after persistReceipt
// succeeded, or a row hard-deleted out-of-band.
//
// Per-file sanity check (extra SELECT before each unlink) is the safety
// net: if a race added a row between our SELECT and the unlink, we skip.
// Cost is ~0.2ms per orphan (covering index lookup); negligible.
//
// Per-run cap: 200 files. Runs after oldJpegSweep so the dir layout is
// already post-conversion when we start the diff.

import { logError } from '@core/utils/log';

const PER_RUN_CAP = 200;
const ROOT_SUBDIRS = ['full', 'thumb'];

// Pure helper — exported for the validation harness.
export function findOrphans(onDiskPaths, dbReferencedPaths) {
  const db = new Set(dbReferencedPaths);
  const out = [];
  for (const p of onDiskPaths) {
    if (!db.has(p)) out.push(p);
  }
  return out;
}

// Recursive directory walker. Files only. Bounded by PER_RUN_CAP (caller
// stops draining when the visit list crosses the cap).
async function walkFiles(FileSystem, dir, sink, cap) {
  if (sink.length >= cap) return;
  let entries;
  try {
    entries = await FileSystem.readDirectoryAsync(dir);
  } catch {
    return;  // dir doesn't exist — first-run before any receipts saved
  }
  for (const name of entries) {
    if (sink.length >= cap) return;
    const child = `${dir}${name}`;
    let info;
    try { info = await FileSystem.getInfoAsync(child); } catch { continue; }
    if (info?.isDirectory) {
      await walkFiles(FileSystem, `${child}/`, sink, cap);
    } else if (info?.exists) {
      sink.push(child);
    }
  }
}

export default {
  name: 'orphanGc',
  async run({ db }) {
    let FileSystem;
    try {
      FileSystem = require('expo-file-system/legacy');
    } catch (e) {
      logError('orphanGc:require', e);
      return { skipped: 'deps-missing' };
    }

    const onDisk = [];
    for (const sub of ROOT_SUBDIRS) {
      await walkFiles(
        FileSystem,
        `${FileSystem.documentDirectory}drift/receipts/${sub}/`,
        onDisk,
        PER_RUN_CAP
      );
    }

    if (onDisk.length === 0) return { deleted: 0, considered: 0 };

    // Build the DB-referenced set in one query — UNION across both columns.
    // Deleted-but-soft-deleted rows still count as referenced (the user
    // might restore them); only hard-deleted rows release their paths.
    const dbRows = await db.getAllAsync(`
      SELECT receipt_path  AS p FROM expenses WHERE receipt_path  IS NOT NULL
      UNION
      SELECT receipt_thumb AS p FROM expenses WHERE receipt_thumb IS NOT NULL
    `);
    const dbSet = new Set(dbRows.map(r => r.p));

    const orphans = findOrphans(onDisk, dbSet);

    let deleted = 0;
    for (const path of orphans) {
      // Per-file safety re-check: between the bulk SELECT above and the
      // unlink below, an INSERT may have landed claiming this path. Cheap
      // covering-index lookup (idx_exp_receipt_img_hash doesn't help here
      // — receipt_path isn't indexed — but the scan over a small expenses
      // table is fast enough).
      try {
        const claimed = await db.getFirstAsync(
          `SELECT 1 AS c FROM expenses
            WHERE receipt_path = ? OR receipt_thumb = ?
            LIMIT 1`,
          [path, path]
        );
        if (claimed) continue;
        await FileSystem.deleteAsync(path, { idempotent: true });
        deleted++;
      } catch (e) {
        logError(`orphanGc:${path}`, e);
      }
    }

    return { deleted, considered: onDisk.length, orphans: orphans.length };
  },
};
