// PS-19 — Seed test #3: parseReceipt() on a golden OCR fixture extracts
// the expected items + total + merchant.
//
// Golden fixtures live at app/src/ocr/golden/fixtures/. They contain the
// canonical OCR `blocks` shape that parseReceipt accepts (ocr.blocks[].lines[]).
// We use `card_coffee.json` because it's the most regression-prone (card
// strategy = two-line items, easy to mis-split).

const { readFileSync } = require('node:fs');
const path = require('node:path');

const FIXTURE_PATH = path.resolve(
  __dirname, '..', '..', 'src', 'ocr', 'golden', 'fixtures', 'card_coffee.json'
);

// parseReceipt is plain JS and imports only pure modules — no expo-sqlite,
// no react-native. It's safe to require directly under Jest's node project.
const { parseReceipt } = require('../../src/ocr/parseReceipt');

describe('parseReceipt golden — card_coffee_starbucks', () => {
  let fixture;
  beforeAll(() => {
    fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  });

  test('extracts merchant, total, and the three expected items', async () => {
    const parsed = await parseReceipt(fixture.ocr);
    // Merchant assertion is loose — parser may title-case or join differently.
    expect(String(parsed.merchant || '').toLowerCase()).toMatch(/starbucks/);
    // Total is 615.00 exactly.
    expect(parsed.total).toBeCloseTo(615.00, 1);
    // Items: expect three rows with the right prices (order-insensitive).
    const got = (parsed.items || []).map(i => Math.round(Number(i.price))).sort((a, b) => a - b);
    expect(got).toEqual([100, 220, 295]);
    // Format detector should recognise this as a restaurant card layout.
    expect(['restaurant', 'card', 'card_restaurant', 'restaurant_card']).toContain(parsed.format);
  });
});
