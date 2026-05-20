// 4.19 — Auto-capture of golden-dataset candidates.
//
// Goal: during normal scanning, opportunistically stash the structured OCR
// output (ML Kit JSON) and the user-saved values for receipts where the
// parser was uncertain OR the user corrected the result. These captures
// are the seed corpus for the golden harness (see runner.js). The user
// exports the captures via the Profile screen and shares the bundle back;
// we ingest by dropping the contents into `fixtures/`.
//
// On-device behaviour:
//   - Default ON. Toggleable via Profile → Auto-capture switch.
//   - Files live in documentDirectory/drift/golden-candidates/.
//   - Cap at MAX_CANDIDATES; oldest unedited candidates rotate out first.
//   - One JSON file per scan: `{timestamp, score, reasons, ocr, parsed,
//     saved?, edited?}`. No images — only structured text.
//   - Capture decisions are made client-side from the parsed payload; no
//     DB write, no migration.

import * as FileSystem from 'expo-file-system/legacy';

const BASE_DIR = `${FileSystem.documentDirectory}drift/golden-candidates/`;
const CONFIG_FILE = `${BASE_DIR}.config.json`;
const EXPORT_FILE = `${FileSystem.cacheDirectory}drift-golden-export.json`;
const MAX_CANDIDATES = 200;
const MIN_SCORE_TO_CAPTURE = 2;

// Lazy-create the directory once per process.
let _dirReady = false;
async function ensureDir() {
  if (_dirReady) return;
  const info = await FileSystem.getInfoAsync(BASE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(BASE_DIR, { intermediates: true });
  }
  _dirReady = true;
}

// ── Selection heuristic ──────────────────────────────────────────────────
//
// Scores a parsed receipt for golden-dataset value. Higher = more
// interesting. Threshold MIN_SCORE_TO_CAPTURE = 2 means at least one of
// the "important" signals fires.
//
// We deliberately bias toward the receipts where the parser is wrong or
// uncertain — those are the ones a golden dataset needs. Receipts where
// the parser nailed everything are common and add little signal beyond
// "yes, the happy path works."
export function assessForCapture(processed) {
  if (!processed) return { score: 0, reasons: [] };
  const reasons = [];
  let score = 0;

  const c = processed.confidence;
  if (c?.label === 'low') {
    score += 2; reasons.push('low-confidence');
  } else if (c?.label === 'medium') {
    score += 1; reasons.push('medium-confidence');
  }
  if (c?.flags?.needsReview) {
    score += 2; reasons.push('needs-review');
  }
  if (typeof processed.formatConfidence === 'number' && processed.formatConfidence < 0.5) {
    score += 1; reasons.push('low-format-confidence');
  } else if (processed.format === 'generic') {
    score += 1; reasons.push('generic-format');
  }
  if ((processed.items?.length || 0) === 0 && (processed.total || 0) > 0) {
    score += 2; reasons.push('no-items-with-total');
  }
  // 4.21 — if the fallback engine fired, this is by construction a receipt
  // ML Kit alone struggled with. Always worth capturing so we can measure
  // whether the merged-engine path actually improved the parse on real
  // data.
  if (processed.engine === 'mlkit+tesseract') {
    score += 1; reasons.push('tesseract-fallback-fired');
  }
  return { score, reasons };
}

// Boost the score if the user actually edited the parser's output. Called
// at save time once we know the diff between processed and saved.
function editedDelta(processed, saved) {
  if (!processed || !saved) return { edited: false, fields: [] };
  const fields = [];
  if (saved.merchant !== processed.merchant) fields.push('merchant');
  if (saved.date !== processed.date)         fields.push('date');
  if (Math.abs((saved.total || 0) - (processed.total || 0)) > 0.005) fields.push('total');
  if ((saved.items?.length || 0) !== (processed.items?.length || 0)) {
    fields.push('items-count');
  } else {
    const a = processed.items || [];
    const b = saved.items     || [];
    for (let i = 0; i < a.length; i++) {
      const x = a[i], y = b[i];
      if (!y) { fields.push(`items[${i}]-missing`); continue; }
      if (x.name !== y.name || Math.abs((x.price || 0) - (y.price || 0)) > 0.005) {
        fields.push(`items[${i}]`);
      }
    }
  }
  return { edited: fields.length > 0, fields };
}

// ── Public API ────────────────────────────────────────────────────────────

// Returns whether auto-capture is enabled. Default ON. Persisted as a tiny
// JSON in BASE_DIR/.config.json so it survives reinstalls of the bundle
// while the app's sandbox is preserved.
export async function getEnabled() {
  try {
    await ensureDir();
    const info = await FileSystem.getInfoAsync(CONFIG_FILE);
    if (!info.exists) return true;
    const txt = await FileSystem.readAsStringAsync(CONFIG_FILE);
    const cfg = JSON.parse(txt);
    return cfg.enabled !== false;
  } catch {
    return true;
  }
}

export async function setEnabled(enabled) {
  try {
    await ensureDir();
    await FileSystem.writeAsStringAsync(CONFIG_FILE, JSON.stringify({ enabled: !!enabled }));
  } catch {
    // Best-effort. If the directory can't be written, the toggle silently
    // falls back to the default-ON for the rest of the session.
  }
}

// Writes a candidate JSON. Call this once per scan, at save time, with the
// full context. Returns the candidate's path or null if not captured.
//
// Selection logic: capture when score >= MIN_SCORE_TO_CAPTURE OR the user
// edited any field. Editing is the strongest signal because it tells us
// explicitly where the parser was wrong.
export async function writeCandidate({ ocr, processed, saved }) {
  if (!(await getEnabled())) return null;
  await ensureDir();

  const assess = assessForCapture(processed);
  const editDelta = editedDelta(processed, saved);
  if (editDelta.edited) {
    assess.score += 3;
    assess.reasons.push(...editDelta.fields.map(f => `edited:${f}`));
  }
  if (assess.score < MIN_SCORE_TO_CAPTURE && !editDelta.edited) return null;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${BASE_DIR}${ts}.json`;
  const payload = {
    schema: 'drift-golden-candidate-v1',
    timestamp: ts,
    score: assess.score,
    reasons: assess.reasons,
    edited: editDelta.edited,
    editedFields: editDelta.fields,
    ocr,
    parsed: {
      merchant: processed.merchant,
      date: processed.date,
      total: processed.total,
      items: processed.items,
      format: processed.format,
      formatLabel: processed.formatLabel,
      formatConfidence: processed.formatConfidence ?? null,
      confidence: processed.confidence,
      gstin: processed.gstin,
      invoiceNumber: processed.invoiceNumber,
      cgst: processed.cgst,
      sgst: processed.sgst,
      igst: processed.igst,
      fees: processed.fees,
      engine: processed.engine || 'mlkit',
    },
    saved: saved ? {
      merchant: saved.merchant,
      date: saved.date,
      total: saved.total,
      items: saved.items,
      potId: saved.potId,
    } : null,
  };

  try {
    await FileSystem.writeAsStringAsync(path, JSON.stringify(payload, null, 2));
    await rotateIfFull();
    return path;
  } catch {
    return null;
  }
}

// Prune the oldest unedited candidate when we exceed the cap. Edited
// candidates are kept preferentially — they're the high-signal samples.
async function rotateIfFull() {
  try {
    const entries = await FileSystem.readDirectoryAsync(BASE_DIR);
    const files = entries.filter(n => n.endsWith('.json') && !n.startsWith('.'));
    if (files.length <= MAX_CANDIDATES) return;
    // Bring back metadata so we can prefer non-edited candidates for eviction.
    const withMeta = await Promise.all(files.map(async n => {
      const p = `${BASE_DIR}${n}`;
      try {
        const txt = await FileSystem.readAsStringAsync(p);
        const j = JSON.parse(txt);
        return { name: n, path: p, edited: !!j.edited, timestamp: j.timestamp || n };
      } catch {
        return { name: n, path: p, edited: false, timestamp: n };
      }
    }));
    // Sort: unedited first (eviction candidates), then oldest timestamp first.
    withMeta.sort((a, b) => {
      if (a.edited !== b.edited) return a.edited ? 1 : -1;
      return a.timestamp.localeCompare(b.timestamp);
    });
    const toDelete = withMeta.slice(0, files.length - MAX_CANDIDATES);
    for (const f of toDelete) {
      try { await FileSystem.deleteAsync(f.path, { idempotent: true }); } catch {}
    }
  } catch {
    // Cleanup is best-effort.
  }
}

// Lists raw candidate paths (excludes config file). Used by the export
// builder and by tests.
export async function listCandidates() {
  try {
    await ensureDir();
    const entries = await FileSystem.readDirectoryAsync(BASE_DIR);
    return entries
      .filter(n => n.endsWith('.json') && !n.startsWith('.'))
      .map(n => `${BASE_DIR}${n}`);
  } catch {
    return [];
  }
}

// Bundles every candidate into a single JSON file at the cache directory
// ready for share. Returns { path, count }. The bundle layout:
//   { schema: 'drift-golden-export-v1', exportedAt, count, candidates: [...] }
export async function bundleForExport() {
  await ensureDir();
  const paths = await listCandidates();
  const candidates = [];
  for (const p of paths) {
    try {
      const txt = await FileSystem.readAsStringAsync(p);
      candidates.push(JSON.parse(txt));
    } catch {
      // Skip unreadable entries; don't fail the whole export.
    }
  }
  const bundle = {
    schema: 'drift-golden-export-v1',
    exportedAt: new Date().toISOString(),
    count: candidates.length,
    candidates,
  };
  await FileSystem.writeAsStringAsync(EXPORT_FILE, JSON.stringify(bundle));
  return { path: EXPORT_FILE, count: candidates.length };
}

// Optional: clear local candidates after a successful share. We expose this
// rather than auto-delete because (a) shares can silently cancel, (b) keeping
// candidates means a re-export covers anything that arrived after the first
// share. The Profile screen offers a separate "Clear captured" action.
export async function clearCandidates() {
  try {
    const paths = await listCandidates();
    for (const p of paths) {
      try { await FileSystem.deleteAsync(p, { idempotent: true }); } catch {}
    }
  } catch {}
}
