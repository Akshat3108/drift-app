import { all, exec, one } from '../../db';
import { jaroWinkler, lightNormMerchant } from '@core/utils/strings';

// Merchants live as a feature-side repo because the writers are the Scan path
// (expenses.createWithItems) and the Add screen (expenses.create after 5.9).
// Reads also feed MerchantDetail / the autocomplete typeahead. Kept inside
// features/expenses since they're tied to the expense lifecycle.

const JW_THRESHOLD = 0.92;

// 5.9 — typeahead score gate. Lower than the resolve threshold so the dropdown
// surfaces near-misses (the user can still pick the right one), without
// flooding it with unrelated matches.
const JW_SUGGEST_THRESHOLD = 0.78;

export const merchants = {
  async list() {
    return all(`SELECT id, name, canonical_name FROM merchants ORDER BY id`);
  },

  async get(id) {
    return one(`SELECT id, name, canonical_name FROM merchants WHERE id = ?`, [id]);
  },

  // Resolve an OCR'd merchant string to a merchant_id. If a row's canonical
  // name matches the input's canonical form (NOCASE equality) we use it
  // directly. Otherwise we Jaro-Winkler the input against every existing
  // canonical name; if the best score ≥ JW_THRESHOLD we use that row, else
  // we INSERT a new merchant and return its id.
  //
  // Returns null if `name` is empty/blank so callers leave merchant_id NULL
  // rather than seed a "" row that would then absorb every empty input.
  async resolve(name) {
    const raw = String(name || '').trim();
    if (!raw) return null;
    const canonical = lightNormMerchant(raw);
    if (!canonical) return null;

    const exact = await one(
      `SELECT id FROM merchants WHERE canonical_name = ? COLLATE NOCASE LIMIT 1`,
      [canonical]
    );
    if (exact) return exact.id;

    const rows = await all(`SELECT id, canonical_name FROM merchants`);
    let bestId = null;
    let bestScore = 0;
    for (const r of rows) {
      const score = jaroWinkler(canonical, r.canonical_name);
      if (score > bestScore) {
        bestScore = score;
        bestId = r.id;
      }
    }
    if (bestId && bestScore >= JW_THRESHOLD) return bestId;

    const res = await exec(
      `INSERT INTO merchants (name, canonical_name) VALUES (?, ?)`,
      [raw.slice(0, 120), canonical.slice(0, 120)]
    );
    return res.lastInsertRowId;
  },

  // 5.9 — typeahead source for the Add screen merchant input. Two-pass:
  //   pass 1: prefix-on-canonical (idx_merchants_canonical handles this) +
  //           contains-on-canonical (small linear scan; acceptable: even with
  //           5000 merchants this is sub-ms on Android).
  //   pass 2: JW score for anything not picked up by SQL LIKE — covers
  //           transliteration noise ("zomato" vs "zomatoz").
  //
  // Results are deduped by id, ranked prefix > contains > JW score, capped at
  // `limit`. Returns `[{id, name, canonical_name, score}]`.
  async suggest(prefix, { limit = 5 } = {}) {
    const raw = String(prefix || '').trim();
    if (!raw) return [];
    const canonical = lightNormMerchant(raw);
    if (!canonical) return [];

    // SQL pass: prefix + contains, ranked by length asc (shorter merchant
    // names are usually the more specific match, e.g. "Uber" beats
    // "Uber India Holdings"). LIMIT generously so JW dedup has room.
    const sqlRows = await all(
      `SELECT id, name, canonical_name,
              CASE
                WHEN canonical_name = ? COLLATE NOCASE THEN 3
                WHEN canonical_name LIKE ? COLLATE NOCASE THEN 2
                WHEN canonical_name LIKE ? COLLATE NOCASE THEN 1
                ELSE 0
              END AS rank_kind
         FROM merchants
        WHERE canonical_name LIKE ? COLLATE NOCASE
           OR canonical_name LIKE ? COLLATE NOCASE
        ORDER BY rank_kind DESC, length(canonical_name) ASC, id DESC
        LIMIT ?`,
      [canonical, `${canonical}%`, `%${canonical}%`, `${canonical}%`, `%${canonical}%`, limit * 3]
    );

    const picked = new Map();
    for (const r of sqlRows) {
      picked.set(r.id, { id: r.id, name: r.name, canonical_name: r.canonical_name, score: r.rank_kind + 0.5 });
      if (picked.size >= limit) break;
    }
    if (picked.size >= limit) return [...picked.values()];

    // JW pass — only runs if SQL didn't fill the slate. Scan over remaining
    // rows. Acceptable cost: even 10k merchants × O(name_len) is ~ms.
    const more = await all(
      `SELECT id, name, canonical_name FROM merchants
        WHERE canonical_name NOT LIKE ? COLLATE NOCASE`,
      [`%${canonical}%`]
    );
    const scored = more
      .map((r) => ({ ...r, score: jaroWinkler(canonical, r.canonical_name) }))
      .filter((r) => r.score >= JW_SUGGEST_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    for (const r of scored) {
      if (picked.has(r.id)) continue;
      picked.set(r.id, { id: r.id, name: r.name, canonical_name: r.canonical_name, score: r.score });
      if (picked.size >= limit) break;
    }
    return [...picked.values()];
  },

  // 5.9 — get-or-null version of resolve(). Used by autocomplete to attach a
  // merchant_id to the alias when the user picks a known merchant; never
  // inserts.
  async resolveExisting(name) {
    const raw = String(name || '').trim();
    if (!raw) return null;
    const canonical = lightNormMerchant(raw);
    if (!canonical) return null;
    const exact = await one(
      `SELECT id FROM merchants WHERE canonical_name = ? COLLATE NOCASE LIMIT 1`,
      [canonical]
    );
    if (exact) return exact.id;
    const rows = await all(`SELECT id, canonical_name FROM merchants`);
    let bestId = null;
    let bestScore = 0;
    for (const r of rows) {
      const score = jaroWinkler(canonical, r.canonical_name);
      if (score > bestScore) { bestScore = score; bestId = r.id; }
    }
    return bestId && bestScore >= JW_THRESHOLD ? bestId : null;
  },
};
