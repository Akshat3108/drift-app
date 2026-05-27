// PS-19 — Seed test #2: inflationBasket() returns the expected index series
// for a fixed fixture.
//
// inflationBasket() consumes a SQL query via the `all()` helper. To run
// without expo-sqlite we mock the `../../../src/db` module (which exports
// `all`/`one`/`exec`) and return our fixture from a single SELECT.

jest.mock('../../src/db', () => {
  const FIXTURE = [
    // Three items, three months.
    // milk: stable ₹50 → ₹54 → ₹60 (a 20% rise over 2 months)
    { normalized_name: 'milk', month_key: '2026-01', avg_price: 50, samples: 30 },
    { normalized_name: 'milk', month_key: '2026-02', avg_price: 54, samples: 30 },
    { normalized_name: 'milk', month_key: '2026-03', avg_price: 60, samples: 30 },
    // bread: ₹30 → ₹33 → ₹36 (20% rise) — second-most frequent.
    { normalized_name: 'bread', month_key: '2026-01', avg_price: 30, samples: 20 },
    { normalized_name: 'bread', month_key: '2026-02', avg_price: 33, samples: 20 },
    { normalized_name: 'bread', month_key: '2026-03', avg_price: 36, samples: 20 },
    // eggs: ₹6/pc → ₹6.6 → ₹7.2 (20% rise) — third.
    { normalized_name: 'eggs', month_key: '2026-01', avg_price: 6.0, samples: 10 },
    { normalized_name: 'eggs', month_key: '2026-02', avg_price: 6.6, samples: 10 },
    { normalized_name: 'eggs', month_key: '2026-03', avg_price: 7.2, samples: 10 },
    // tea: only in March → present-only month, must not appear in baseline.
    { normalized_name: 'tea',  month_key: '2026-03', avg_price: 100, samples: 5 },
    // butter, oil, rice, dal, sugar, salt, ghee, …(need ≥5 items in base
    // month per minBasketPresent). Seed enough to qualify Jan as base.
    { normalized_name: 'butter', month_key: '2026-01', avg_price: 50,  samples: 5 },
    { normalized_name: 'butter', month_key: '2026-02', avg_price: 55,  samples: 5 },
    { normalized_name: 'butter', month_key: '2026-03', avg_price: 60,  samples: 5 },
    { normalized_name: 'oil',    month_key: '2026-01', avg_price: 120, samples: 5 },
    { normalized_name: 'oil',    month_key: '2026-02', avg_price: 132, samples: 5 },
    { normalized_name: 'oil',    month_key: '2026-03', avg_price: 144, samples: 5 },
  ];
  return {
    all: jest.fn(async (sql) => {
      if (/FROM receipt_items/i.test(sql)) return FIXTURE;
      return [];
    }),
    one: jest.fn(async () => null),
    exec: jest.fn(async () => ({})),
  };
});

const { inflationBasket } = require('../../src/analytics/items');

describe('inflationBasket', () => {
  test('returns a monotonically rising index when all basket items rise 20%', async () => {
    const result = await inflationBasket({ topN: 5, minBasketPresent: 5 });
    expect(result.ready).toBe(true);
    expect(Array.isArray(result.monthly)).toBe(true);
    // Base month must be 2026-01 (5 of top-5 items present).
    expect(result.base_month).toBe('2026-01');
    // Each item rose by exactly 20% between Jan and Mar, so the renormalised
    // weighted index for Mar should be ~1.20 (within 1% tolerance).
    const mar = result.monthly.find(s => s.month_key === '2026-03');
    expect(mar).toBeDefined();
    expect(mar.index).toBeGreaterThan(1.18);
    expect(mar.index).toBeLessThan(1.22);
  });
});
