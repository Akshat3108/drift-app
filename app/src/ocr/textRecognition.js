import TextRecognition from '@react-native-ml-kit/text-recognition';

export async function recognize(uri) {
  const result = await TextRecognition.recognize(uri);
  return result;
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
      });
    }
  }
  lines.sort((a, b) => a.y - b.y || a.x - b.x);
  return lines;
}
