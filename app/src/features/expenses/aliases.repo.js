// 5.10 — merchant_aliases learning loop.
//
// Two-tier lookup: user-source rows (from prior saves on the Add screen) win
// over bundle-source rows (from merchantMap.json). The bundle is loaded
// lazily — its entries don't sit in the DB; we read them at lookup time and
// only persist a row when the user makes a choice.
//
// Returned categoryId is mapped against the user's *current* categories at
// lookup time. If the user renames "Food & Drink" to "Eating Out", the bundle
// still matches via case-insensitive name search; if they delete a category
// entirely, the bundle entry silently becomes inert (returns null).

import { all, exec, one } from '../../db';
import { lightNormMerchant } from '@core/utils/strings';
import bundleMap from './merchantMap.json';

// Drop the `_meta` field so iteration loops don't have to skip it.
const BUNDLE = Object.fromEntries(
  Object.entries(bundleMap).filter(([k]) => k !== '_meta')
);

// Pre-sorted longest-key-first so substring lookup tries "swiggy instamart"
// before "swiggy" when both are present.
const BUNDLE_KEYS = Object.keys(BUNDLE).sort((a, b) => b.length - a.length);

function normCategoryName(s) {
  return String(s || '').toLowerCase().trim();
}

function matchUserCategory(targetName, categories) {
  if (!targetName || !Array.isArray(categories)) return null;
  const target = normCategoryName(targetName);
  for (const c of categories) {
    if (normCategoryName(c.name) === target) return c.id;
  }
  return null;
}

// Pure-JS bundle lookup. Exported for the validation harness; in-app callers
// go through aliases.lookup which also consults the user-source table first.
export function lookupBundle(aliasKey) {
  if (!aliasKey) return null;
  const exact = BUNDLE[aliasKey];
  if (exact) return { ...exact, matchedKey: aliasKey };
  // Longest-key-first substring match — handles "swiggy instamart mumbai"
  // hitting "swiggy instamart" before "swiggy".
  for (const key of BUNDLE_KEYS) {
    if (aliasKey.includes(key)) return { ...BUNDLE[key], matchedKey: key };
  }
  return null;
}

export const aliases = {
  // Lookup is silent — never inserts, never mutates. Callers that want to
  // persist a bundle hit should call recordUserChoice() after the user
  // confirms.
  //
  // Returns:
  //   { categoryId, merchantId, source: 'user'|'bundle', display? } | null
  async lookup(merchantText, { categories } = {}) {
    const canonical = lightNormMerchant(merchantText);
    if (!canonical) return null;

    // user-source first. The partial unique index covers (alias_key, source)
    // among live rows so a single SELECT is sufficient.
    const userRow = await one(
      `SELECT category_id, merchant_id
         FROM merchant_aliases
        WHERE alias_key = ?
          AND source    = 'user'
          AND deleted_at IS NULL
        LIMIT 1`,
      [canonical]
    );
    if (userRow && userRow.category_id != null) {
      return {
        categoryId: userRow.category_id,
        merchantId: userRow.merchant_id ?? null,
        source: 'user',
      };
    }

    // Bundle fallback — never persisted at lookup time. The first user save
    // for this alias will materialise a source='user' row that shadows it.
    const bundleHit = lookupBundle(canonical);
    if (!bundleHit) return null;
    const categoryId = matchUserCategory(bundleHit.category, categories);
    if (categoryId == null) return null;
    return {
      categoryId,
      merchantId: null,
      source: 'bundle',
      display: bundleHit.display || null,
      matchedKey: bundleHit.matchedKey,
    };
  },

  // Persist (or refresh) a user-source mapping. Called from Add.js on save —
  // every save reinforces the most-recent choice so the auto-cat reflects
  // current intent, not stale history.
  async recordUserChoice({ alias, merchantId, categoryId }) {
    const canonical = lightNormMerchant(alias);
    if (!canonical || categoryId == null) return null;

    const existing = await one(
      `SELECT id FROM merchant_aliases
        WHERE alias_key = ?
          AND source    = 'user'
          AND deleted_at IS NULL
        LIMIT 1`,
      [canonical]
    );
    if (existing) {
      await exec(
        `UPDATE merchant_aliases
            SET category_id = ?, merchant_id = ?, updated_at = datetime('now')
          WHERE id = ?`,
        [categoryId, merchantId ?? null, existing.id]
      );
      return existing.id;
    }
    const res = await exec(
      `INSERT INTO merchant_aliases (alias_key, merchant_id, category_id, source)
       VALUES (?, ?, ?, 'user')`,
      [canonical, merchantId ?? null, categoryId]
    );
    return res.lastInsertRowId;
  },

  // Surface for a future "Clear merchant memory" affordance — not wired this
  // round. Soft-deletes every user-source row so the bundle takes over again.
  async clearUserAliases() {
    await exec(
      `UPDATE merchant_aliases
          SET deleted_at = datetime('now')
        WHERE source = 'user' AND deleted_at IS NULL`
    );
  },

  // Debug / inspection. Surface for /tmp validation harnesses.
  async list({ source } = {}) {
    if (source) {
      return all(
        `SELECT * FROM merchant_aliases
          WHERE source = ? AND deleted_at IS NULL
          ORDER BY updated_at DESC, id DESC`,
        [source]
      );
    }
    return all(
      `SELECT * FROM merchant_aliases
        WHERE deleted_at IS NULL
        ORDER BY updated_at DESC, id DESC`
    );
  },

  // Exposed so the validation harness can assert the bundle keys without
  // re-importing the JSON. Not consumed by the app.
  bundleSize() {
    return BUNDLE_KEYS.length;
  },
};
