// 8.7 — Maintenance task: SHA-1 hash backfill.
//
// Fills receipt_image_hash for rows that landed before 8.6 (column added
// in v39 but only populated by post-8.6 saves) OR whose post-8.6 save
// hit a hash-stage failure inside persistReceipt (file is written and
// usable, hash stays null). 50 rows per run keeps the bg→fg transition
// snappy; the next day's run picks up where we left off.
//
// Loads file as base64 then digests via expo-crypto — same primitive as
// persistReceipt's hash stage. Failures per-row are logged + skipped so
// one bad file (corrupted, deleted out-of-band) doesn't block the rest.

import { logError } from '@core/utils/log';

const PER_RUN_CAP = 50;

export default {
  name: 'hashBackfill',
  async run({ db }) {
    let FileSystem, Crypto;
    try {
      FileSystem = require('expo-file-system/legacy');
      Crypto = require('expo-crypto');
    } catch (e) {
      logError('hashBackfill:require', e);
      return { skipped: 'deps-missing' };
    }

    const rows = await db.getAllAsync(
      `SELECT id, receipt_path FROM expenses
        WHERE receipt_image_hash IS NULL AND receipt_path IS NOT NULL
        LIMIT ?`,
      [PER_RUN_CAP]
    );

    let filled = 0;
    let skipped = 0;
    for (const row of rows) {
      try {
        const info = await FileSystem.getInfoAsync(row.receipt_path);
        if (!info?.exists) { skipped++; continue; }  // file gone — orphanGc will tidy the row
        const b64 = await FileSystem.readAsStringAsync(row.receipt_path, {
          encoding: FileSystem.EncodingType?.Base64 ?? 'base64',
        });
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA1,
          b64,
          { encoding: Crypto.CryptoEncoding?.HEX ?? 'hex' }
        );
        await db.runAsync(
          `UPDATE expenses SET receipt_image_hash = ? WHERE id = ?`,
          [hash, row.id]
        );
        filled++;
      } catch (e) {
        logError(`hashBackfill:row=${row.id}`, e);
        skipped++;
      }
    }

    return { filled, skipped, considered: rows.length };
  },
};
