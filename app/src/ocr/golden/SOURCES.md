# Golden Dataset — Source Candidates

A vetted shortlist of public receipt/invoice datasets that *could* feed the
golden corpus, with license + format notes. Use these as a secondary feed
when the user-export pipeline isn't producing enough volume on its own.

**Caveat:** none of these are a perfect fit. Drift's parser consumes
structured ML Kit JSON (`blocks/lines/elements` with bounding boxes); every
public dataset ships either raw images (require on-device OCR conversion)
or pre-OCR'd flat text (loses spatial info). The user-export pipeline
remains the best source because it produces the exact JSON shape the
parser eats, on real Indian receipts.

## India-specific (preferred)

| Source | Count | Format | License | Notes |
|---|---|---|---|---|
| [MIDD — Multi-Layout Invoice Document Dataset](https://www.mdpi.com/2306-5729/6/7/78) | 630 | Scanned PDFs + NER labels | CC BY 4.0 (typical MDPI Data) | **B2B invoices, not retail receipts.** Format gap with thermal receipts, but useful for GSTIN/HSN extraction smoke-tests. |
| [Invoiscope (ayush2635/Invoiscope)](https://github.com/ayush2635/Invoiscope) | 2,500+ | — | Dataset not in repo | Closed dataset. Useful only if author releases the corpus. |
| [Roboflow GST-tagged datasets](https://universe.roboflow.com/search?q=class:gst) | varies | YOLO bounding boxes | varies (mostly CC) | Bounding boxes for object detection, no OCR text. Would need a separate OCR pass before fixtures can be built. |

## Non-India (geography mismatch — use sparingly)

| Source | Count | Format | License | Notes |
|---|---|---|---|---|
| [CORD — Naver Clova](https://github.com/clovaai/cord) | ~1,000 | Receipt images + JSON | MIT | Indonesian retail receipts. Clean license, well-annotated, structured JSON. **Best non-India option** for smoke-testing the columnar/card strategies; but won't exercise GSTIN/CGST/SGST/IGST/HSN paths. |
| [SROIE (ICDAR 2019)](https://rrc.cvc.uab.es/?ch=13) | ~1,000 | Image + text JSON | Research-only, no redistribute | Singapore. License prohibits checking the corpus into this repo; can be used locally for ad-hoc tests. |
| [ExpressExpense SRD](https://expressexpense.com/blog/free-receipt-images-ocr-machine-learning-dataset/) | 200 | Receipt images | MIT | US restaurants. Useful for the card-format strategy stress-test. |
| [ReceiptSense (arXiv 2406.04493)](https://arxiv.org/html/2406.04493v2) | 20,000 | Annotated receipts | — | Arabic-English. Wrong geography but volume is meaningful for column-detection tuning. |

## What to do with a chosen dataset

1. **Check license** before checking anything into this repo. Research-only
   datasets must stay in a local `~/drift-fixtures/` outside the tree.
2. **Convert to fixture shape** — most datasets ship images. You'd need
   to run them through ML Kit on a device to produce the `blocks.lines.elements`
   shape Drift consumes. A debug screen could automate this conversion
   one-by-one.
3. **Tag the fixture** — `name` field should prefix with the source
   (e.g. `cord_indonesian_grocery_001`) so regression failures can be
   attributed to a known distribution gap.
4. **Don't let non-India dominate** — the parser is India-tuned. A
   golden dataset that's 80% Indonesian will give false confidence on
   the wrong target distribution. Keep non-India fixtures < 20%.
