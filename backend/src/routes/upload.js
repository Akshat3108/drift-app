const router = require('express').Router();
const multer = require('multer');
const fs = require('fs');
const auth = require('../middleware/auth');

router.use(auth);

const upload = multer({
  dest: '/tmp/drift-uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

// Gemini configuration
//
// Drift is fully offline by default (on-device ML Kit OCR on the app side).
// This endpoint is here as an OPTIONAL cloud fallback for hard cases
// (handwritten bills, faded thermal prints, very low confidence parses).
// The app does not call it today; you can wire it in later from the Scan
// flow when parser confidence is low.
//
// Set GEMINI_API_KEY in .env to enable. Without it, this endpoint returns
// mock data so the route stays functional in local dev.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;

// JSON shape we ask Gemini to return. Mirrors what parseReceipt produces on
// the client so this is a drop-in fallback.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    merchant: { type: 'string', description: 'Store / restaurant / merchant name' },
    date:     { type: 'string', description: 'YYYY-MM-DD or empty if unreadable' },
    currency: { type: 'string', description: 'Currency symbol or ISO code (₹, $, EUR, etc.)' },
    format:   {
      type: 'string',
      description: 'Bill type',
      enum: ['quick_commerce', 'food_delivery', 'restaurant', 'online_retail',
             'departmental', 'pharmacy', 'fuel', 'transport', 'utility',
             'handwritten', 'generic'],
    },
    subtotal: { type: 'number' },
    tax:      { type: 'number' },
    total:    { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name:  { type: 'string' },
          qty:   { type: 'number' },
          unit:  { type: 'string', description: "Unit: pcs, kg, g, L, mL, pack, dozen" },
          price: { type: 'number', description: 'Line total (qty × rate)' },
        },
        required: ['name', 'price'],
      },
    },
    fees: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label:  { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['label', 'amount'],
      },
    },
    discounts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label:  { type: 'string' },
          amount: { type: 'number', description: 'Positive value (will be subtracted)' },
        },
        required: ['label', 'amount'],
      },
    },
  },
  required: ['merchant', 'total', 'items'],
};

const PROMPT = `You are extracting structured data from a receipt or bill photo.
Return ONLY JSON matching the schema. Be precise with amounts. Use null/empty
strings if a field is unreadable. Skip metadata rows (order id, payment
method, address). Track fees (handling, delivery, service charge, platform
fee, tip) separately from items. Track discounts/savings as a separate list
with POSITIVE amounts. The total should be the final payable amount.`;

function mockResponse() {
  return {
    merchant: 'Sample Store',
    date: new Date().toISOString().split('T')[0],
    currency: '₹',
    format: 'generic',
    subtotal: 50.97,
    tax: 0,
    total: 55.91,
    items: [
      { name: 'Item 1', qty: 1, unit: 'pcs', price: 12.99 },
      { name: 'Item 2', qty: 2, unit: 'pcs', price: 18.99 },
      { name: 'Item 3', qty: 1, unit: 'pcs', price: 23.93 },
    ],
    fees: [],
    discounts: [],
    raw_text: '[OCR not configured — add GEMINI_API_KEY to .env]',
  };
}

async function callGemini({ base64, mimeType, apiKey }) {
  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: PROMPT },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  };

  const res = await fetch(GEMINI_ENDPOINT(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');

  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) { throw new Error('Gemini returned non-JSON: ' + text.slice(0, 200)); }
  return parsed;
}

// POST /api/upload/receipt
router.post('/receipt', upload.single('receipt'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    fs.unlink(req.file.path, () => {});
    return res.json(mockResponse());
  }

  try {
    const imageData = fs.readFileSync(req.file.path);
    const base64 = imageData.toString('base64');
    const parsed = await callGemini({
      base64,
      mimeType: req.file.mimetype,
      apiKey,
    });
    res.json(parsed);
  } catch (err) {
    console.error('OCR error:', err.message);
    res.status(500).json({ error: 'OCR failed: ' + err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

module.exports = router;
