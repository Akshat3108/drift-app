// 8.7 — Maintenance task: convert legacy 5.12-era JPEGs to the 8.6 WebP
// + partitioned-dirs layout.
//
// 5.12 wrote receipts to documentDirectory/drift/receipts/{full,thumb}/<uuid>.jpg
// (flat dirs, JPEG). 8.6 shipped a new layout at .../{full,thumb}/YYYY/MM/<uuid>.webp.
// Both layouts coexist because pickReceiptUri reads either; this task is the
// background process that gradually migrates the old ones forward.
//
// Per-run cap: 50 receipts. Each processed receipt costs ~150-300ms
// (manipulateAsync re-encode + move + UPDATE), so 50 keeps the bg→fg
// transition under ~15s wall-time worst-case. Daily-rate-limited via
// the orchestrator gate.
//
// Files whose owning row can't be found are LEFT IN PLACE — orphanGc
// (runs immediately after this task) handles those on the same pass.
// Doing the delete here would race with orphanGc's per-file sanity check.

import { persistReceipt } from '@media/receipts';
import { logError } from '@core/utils/log';

const PER_RUN_CAP = 50;

export default {
  name: 'oldJpegSweep',
  async run({ db }) {
    let FileSystem;
    try {
      FileSystem = require('expo-file-system/legacy');
    } catch (e) {
      logError('oldJpegSweep:require', e);
      return { skipped: 'deps-missing' };
    }

    const fullDir = `${FileSystem.documentDirectory}drift/receipts/full/`;
    let entries;
    try {
      const info = await FileSystem.getInfoAsync(fullDir);
      if (!info?.exists) return { converted: 0, considered: 0 };
      entries = await FileSystem.readDirectoryAsync(fullDir);
    } catch (e) {
      logError('oldJpegSweep:readDir', e);
      return { error: e.message };
    }

    // Legacy entries are flat JPEG filenames (uuid.jpg / uuid.jpeg). 8.6
    // entries are YYYY subdirectories. Only the flat .jpg / .jpeg files
    // are conversion candidates.
    const candidates = entries.filter(e => /\.(jpg|jpeg)$/i.test(e));
    const slice = candidates.slice(0, PER_RUN_CAP);

    let converted = 0;
    let skipped = 0;
    for (const name of slice) {
      const oldFullPath  = `${fullDir}${name}`;
      const oldThumbPath = `${FileSystem.documentDirectory}drift/receipts/thumb/${name}`;
      try {
        const row = await db.getFirstAsync(
          `SELECT id, expense_date FROM expenses WHERE receipt_path = ? LIMIT 1`,
          [oldFullPath]
        );
        if (!row) { skipped++; continue; }  // owner gone — orphanGc will catch on next step

        const stored = await persistReceipt(oldFullPath, { expenseDate: row.expense_date });
        if (!stored) { skipped++; continue; }  // pipeline failure — leave the JPEG; retry next run

        await db.runAsync(
          `UPDATE expenses
              SET receipt_path       = ?,
                  receipt_thumb      = ?,
                  receipt_bytes      = ?,
                  receipt_image_hash = COALESCE(?, receipt_image_hash)
            WHERE id = ?`,
          [stored.path, stored.thumb, stored.bytes, stored.imageHash ?? null, row.id]
        );

        // Old files only get deleted AFTER the UPDATE commits. If the
        // delete fails, orphanGc will catch them on a later run.
        try { await FileSystem.deleteAsync(oldFullPath,  { idempotent: true }); } catch {}
        try { await FileSystem.deleteAsync(oldThumbPath, { idempotent: true }); } catch {}
        converted++;
      } catch (e) {
        logError(`oldJpegSweep:${name}`, e);
        skipped++;
      }
    }

    return { converted, skipped, considered: candidates.length, capped: candidates.length > PER_RUN_CAP };
  },
};
