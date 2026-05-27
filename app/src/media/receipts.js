// 8.6 — Receipt image pipeline (complete).
//
// Pipeline shape:
//   srcUri (cache or content://)
//     → expo-image-manipulator: resize + WebP re-encode (full @ 1600px / q=0.80)
//     → moveOrCopy → documentDirectory/drift/receipts/full/YYYY/MM/<uuid>.webp
//     → same for thumb @ 320px / q=0.60 → .../thumb/YYYY/MM/<uuid>.webp
//     → expo-crypto SHA-1 of the full WebP bytes (hex) → imageHash
//     → return { path, thumb, bytes, imageHash } | null
//
// EXIF strip: implicit — re-encoding from decoded RGBA discards the original
// EXIF block entirely. No extra step.
//
// Partition layout (YYYY/MM): keeps any single directory to ≤ a year's worth
// of receipts even for power users. Avoids ext4/SAF stat slowdowns at year-10
// scale (per Rule 6) without adding any query complexity — file paths are
// stored opaquely in receipt_path/receipt_thumb.
//
// Hash policy: store-only (no save-time dedup). The image hash is the
// load-bearing identifier for 8.7's maintenance-job orphan sweep and any
// future receipt-level dedup. Two scans of the same paper bill that happen
// to produce identical bytes are deliberately allowed to coexist.
//
// Failure mode: any internal throw → logError + return null. Callers (Scan,
// ReceiptViewer lazy-migrate) treat null as "skip the permanent-storage write
// for now; legacy receipt_uri stays as the safety net". Never throws.

import { logError } from '@core/utils/log';

const FULL_QUALITY  = 0.80;
const THUMB_QUALITY = 0.60;
const FULL_MAX      = 1600;
const THUMB_MAX     = 320;

function uuid() {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Pure helper — exported so the validation harness can exercise it without
// needing FileSystem / Crypto loaded.
export function computePartition(dateISO) {
  // Accept 'YYYY-MM-DD' (the canonical expense_date shape). Anything else
  // (null, malformed, future-dated) falls through to today's partition —
  // file-layout hygiene, not a data-integrity boundary.
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateISO || '');
  if (m) return { yyyy: m[1], mm: m[2] };
  const now = new Date();
  return {
    yyyy: String(now.getFullYear()),
    mm: String(now.getMonth() + 1).padStart(2, '0'),
  };
}

async function ensureDir(FileSystem, dir) {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info?.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

// Fast path on Android: moveAsync. Falls back to copy+delete on the rare
// cross-volume case (some emulators put cacheDirectory on a different mount).
async function moveOrCopy(FileSystem, from, to) {
  try {
    await FileSystem.moveAsync({ from, to });
  } catch {
    await FileSystem.copyAsync({ from, to });
    try { await FileSystem.deleteAsync(from, { idempotent: true }); } catch {}
  }
}

export async function persistReceipt(srcUri, opts = {}) {
  if (!srcUri) return null;

  let FileSystem, manipulateAsync, SaveFormat, Crypto;
  try {
    // Lazy-require so Metro doesn't choke when a dev shell hasn't been
    // rebuilt against expo-image-manipulator / expo-crypto yet. Same
    // pattern as @ocr/golden/capture.js.
    FileSystem = require('expo-file-system/legacy');
    ({ manipulateAsync, SaveFormat } = require('expo-image-manipulator'));
    Crypto = require('expo-crypto');
  } catch (e) {
    logError('persistReceipt:require', e);
    return null;
  }

  try {
    const { yyyy, mm } = computePartition(opts.expenseDate);
    const baseDir  = `${FileSystem.documentDirectory}drift/receipts/`;
    const fullDir  = `${baseDir}full/${yyyy}/${mm}/`;
    const thumbDir = `${baseDir}thumb/${yyyy}/${mm}/`;
    await ensureDir(FileSystem, fullDir);
    await ensureDir(FileSystem, thumbDir);

    const id        = uuid();
    const fullPath  = `${fullDir}${id}.webp`;
    const thumbPath = `${thumbDir}${id}.webp`;

    const full = await manipulateAsync(
      srcUri,
      [{ resize: { width: FULL_MAX } }],
      { compress: FULL_QUALITY, format: SaveFormat.WEBP }
    );
    await moveOrCopy(FileSystem, full.uri, fullPath);

    const thumb = await manipulateAsync(
      srcUri,
      [{ resize: { width: THUMB_MAX } }],
      { compress: THUMB_QUALITY, format: SaveFormat.WEBP }
    );
    await moveOrCopy(FileSystem, thumb.uri, thumbPath);

    // SHA-1 of the full-size WebP bytes. Loading the file as base64 briefly
    // allocates ~4/3 the file size as a string (≤ ~270KB for a 200KB WebP),
    // which is well off the UI path. Hash is hex so it's safe to use in
    // SQL equality lookups without binding-collation surprises.
    let imageHash = null;
    try {
      const b64 = await FileSystem.readAsStringAsync(fullPath, {
        encoding: FileSystem.EncodingType?.Base64 ?? 'base64',
      });
      imageHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA1,
        b64,
        { encoding: Crypto.CryptoEncoding?.HEX ?? 'hex' }
      );
    } catch (e) {
      // Hash failure is non-fatal: the file is still written and usable.
      // 8.7's maintenance job can backfill the hash on a later sweep.
      logError('persistReceipt:hash', e);
    }

    const info = await FileSystem.getInfoAsync(fullPath);
    return {
      path:      fullPath,
      thumb:     thumbPath,
      bytes:     info?.size ?? 0,
      imageHash: imageHash || null,
    };
  } catch (e) {
    logError('persistReceipt', e);
    return null;
  }
}
