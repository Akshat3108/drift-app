import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';

// v2 API: recognize(imageURL, script=LATIN). We default to Latin — Devanagari
// support stays available behind an opt-in script override (a future "Scan as
// Hindi" toggle), but Hindi-on-receipt text is currently handled at the
// canonicaliser level (see core/domain/synonyms.js + hindi_product_map.json
// from 4.2) so the Latin recogniser is sufficient for the common path.
export async function recognize(uri, { script } = {}) {
  return TextRecognition.recognize(uri, script || TextRecognitionScript.LATIN);
}

export { TextRecognitionScript };

// Mean-of-elements confidence. The v2 type definitions don't currently
// surface `confidence` on TextElement (the native bridge stops at text +
// frame + cornerPoints — ML Kit's Text.Element.getConfidence() is not piped
// through). We read it defensively so this code is correct when (a) the lib
// surfaces it, or (b) we patch the native bridge ourselves. Missing values
// fall back to 1.0 so downstream consumers (auto-Devanagari fallback,
// scoreConfidence, golden-dataset gating) treat absence as "no signal" not
// "low signal". 4.10.
function meanConfidence(elements) {
  if (!elements?.length) return 1;
  let sum = 0;
  let n = 0;
  for (const el of elements) {
    const c = typeof el?.confidence === 'number' ? el.confidence : null;
    if (c != null && isFinite(c)) {
      sum += c;
      n++;
    }
  }
  return n > 0 ? sum / n : 1;
}

export function extractLines(result) {
  const lines = [];
  if (!result?.blocks) return lines;
  for (const b of result.blocks) {
    if (!b?.lines) continue;
    for (const ln of b.lines) {
      if (!ln?.text) continue;
      const frame = ln.frame || b.frame || { left: 0, top: 0, width: 0, height: 0 };
      lines.push({
        text: ln.text.trim(),
        x: frame.left ?? frame.x ?? 0,
        y: frame.top ?? frame.y ?? 0,
        width: frame.width ?? 0,
        height: frame.height ?? 0,
        confidence: meanConfidence(ln.elements),
        elements: (ln.elements || []).map(el => ({
          text: el.text,
          x: el.frame?.left ?? 0,
          width: el.frame?.width ?? 0,
        })),
      });
    }
  }
  lines.sort((a, b) => a.y - b.y || a.x - b.x);
  return lines;
}
