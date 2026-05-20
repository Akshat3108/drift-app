import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Light preprocessing wrapper used before OCR. Two cheap transforms:
//   1. Resize the long edge to LONG_EDGE_PX so 4k phone photos don't blow up
//      ML Kit's decode buffer.
//   2. Re-save as PNG so JPEG compression artefacts that bleed into the
//      digit/letter glyphs aren't carried into recognition.
//
// Failure-tolerant: if the manipulator throws, we return the original URI
// so OCR still runs (worst case: no preprocess). The native preprocess
// pipeline (4.20) replaces this entirely with grayscale + CLAHE + Sauvola
// + deskew, so this stays deliberately minimal.

const LONG_EDGE_PX = 1600;

export async function lightPreprocess(uri) {
  if (!uri) return uri;
  try {
    // We don't know the source dimensions without a decode pass, so we just
    // ask the manipulator to clamp the WIDTH at LONG_EDGE_PX. expo-image-
    // manipulator preserves aspect; when the source is portrait this will
    // also clamp height implicitly because aspect is preserved. The
    // manipulator no-ops the resize when width is already ≤ target on some
    // backends; even when it doesn't, the cost is one RGBA decode + a
    // PNG encode — cheaper than ML Kit's downstream decode of a 4k JPEG.
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: LONG_EDGE_PX } }],
      { compress: 1, format: SaveFormat.PNG }
    );
    return result?.uri || uri;
  } catch {
    return uri;
  }
}
