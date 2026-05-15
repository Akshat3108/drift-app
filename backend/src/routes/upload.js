const router = require('express').Router();
const multer = require('multer');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
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

// POST /api/upload/receipt
router.post('/receipt', upload.single('receipt'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  if (!process.env.ANTHROPIC_API_KEY) {
    // Return mock data when key not configured
    fs.unlink(req.file.path, () => {});
    return res.json({
      merchant: 'Sample Store',
      date: new Date().toISOString().split('T')[0],
      total: 55.91,
      items: [
        { name: 'Item 1', qty: '1', price: 12.99 },
        { name: 'Item 2', qty: '2', price: 18.99 },
        { name: 'Item 3', qty: '1',  price: 23.93 },
      ],
      raw_text: '[OCR not configured — add ANTHROPIC_API_KEY to .env]',
    });
  }

  try {
    const imageData = fs.readFileSync(req.file.path);
    const base64 = imageData.toString('base64');
    const mediaType = req.file.mimetype;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `Extract all line items from this receipt. Return ONLY valid JSON in this exact format:
{
  "merchant": "Store name",
  "date": "YYYY-MM-DD or null",
  "total": 00.00,
  "items": [
    { "name": "Item name", "qty": "quantity or null", "price": 0.00 }
  ]
}
Be precise with prices. If you cannot determine a value, use null.`,
          },
        ],
      }],
    });

    const text = message.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const parsed = JSON.parse(jsonMatch[0]);

    res.json(parsed);
  } catch (err) {
    console.error('OCR error:', err.message);
    res.status(500).json({ error: 'OCR failed: ' + err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

module.exports = router;
