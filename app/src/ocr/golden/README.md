# Drift OCR — Golden Dataset

Goal: a set of *real-receipt OCR fixtures* with known-correct expected outputs,
so changes to the parser can be regression-tested without a device round-trip.

## Status (2026-05-19)

- **Harness landed** — `runner.js` runs `processReceipt(ocr, pots)` against
  each fixture and reports field-level diffs.
- **Auto-capture pipeline landed** — see `capture.js`. The app saves
  golden-candidate JSONs to the device sandbox during normal scans; the user
  exports the bundle via Profile → "Export receipts for parser improvement".
- **5 hand-built fixtures** in `fixtures/` covering: tabular grocery,
  columnar supermarket, card-format coffee shop, fuel slip, totals-only
  utility bill. These exist primarily to exercise the harness, not to
  represent the full receipt-format distribution.
- **45 more fixtures pending** — populated incrementally as users export
  real anonymised scans (see `SOURCES.md` for vetted public corpora to
  consider as a secondary feed).

When the fixture count crosses 50, task 4.19 flips from `[!]` to `[x]`.

## File layout

```
app/src/ocr/golden/
├── README.md          ← this file
├── SOURCES.md         ← vetted public datasets (license-aware shortlist)
├── runner.js          ← pure harness: runGolden({fixtures, processReceipt})
├── capture.js         ← on-device auto-capture pipeline
└── fixtures/
    ├── tabular_grocery.json
    ├── columnar_supermarket.json
    ├── card_coffee.json
    ├── fuel_petrol.json
    └── totals_only_restaurant.json
```

## Fixture format

Each fixture is a single JSON object:

```jsonc
{
  "name": "tabular_grocery_dmart",
  "notes": "optional free-text",
  "pots": [{ "id": 1, "name": "Groceries" }, …],
  "expected": {
    "merchant": "DMart",
    "date": "2026-04-15",
    "total": 487.50,
    "format": "departmental",       // optional
    "items": [{ "name": "...", "price": 12.34 }, …]
  },
  "ocr": {                          // the ML Kit JSON shape extractLines() reads
    "blocks": [
      {
        "lines": [
          {
            "text": "...",
            "frame": { "left": 80, "top": 280, "width": 1400, "height": 22 },
            "elements": [
              { "text": "...", "frame": { "left": 80, "width": 80 } },
              …
            ]
          }
        ]
      }
    ]
  }
}
```

**The OCR side must include per-element `frame.left` and `frame.width`** for
the columnar strategy (`detectColumns` reads token positions). Lines that
don't need columnar bucketing can omit `elements: []`.

## Running the harness

In-app (debug menu or a future test screen):

```js
import { runGolden } from '@ocr/golden/runner';
import { processReceipt } from '@features/scan/ScanService';
import fixture from '@ocr/golden/fixtures/tabular_grocery.json';

const { passed, failed, results } = runGolden({
  fixtures: [fixture],
  processReceipt,
});
```

Tolerances: merchant compare is case-insensitive trimmed; amount compare is
±0.01; date compare is the first 10 chars (`YYYY-MM-DD`).

## Auto-capture pipeline

`capture.js` runs during normal scans:

1. After `processReceipt`, `assessForCapture(processed)` scores the result
   (low-confidence / needs-review / no-items-with-total / generic-format /
   low-format-confidence → score, threshold 2).
2. On save, `writeCandidate({ ocr, processed, saved })` writes a JSON to
   `documentDirectory/drift/golden-candidates/`. Score is boosted by 3 if
   the user edited any of merchant / date / total / items.
3. Cap is 200 candidates; oldest unedited ones rotate out first.

User flow from the Profile screen:

1. Scan receipts normally.
2. Periodically tap **"Export receipts for parser improvement"** → the
   share sheet opens with `drift-golden-export.json`.
3. Share to email / Drive / Files / etc., then attach the JSON to a chat
   session for ingestion.

Settings toggle: Profile → Auto-capture switch. Default ON. Stored in
`documentDirectory/drift/golden-candidates/.config.json` (no DB migration).

## Ingestion (when user returns with an export)

```js
import bundle from '/path/to/drift-golden-export.json';
for (const cand of bundle.candidates) {
  // cand = { ocr, parsed, saved?, score, reasons, edited, ... }
  // Build a fixture: { name: cand.timestamp, ocr: cand.ocr, pots: ..., expected: cand.saved ?? cand.parsed }
  // Write to app/src/ocr/golden/fixtures/<name>.json
}
```

Then re-run the harness; failures highlight where the parser regressed
relative to the user's lived experience.
