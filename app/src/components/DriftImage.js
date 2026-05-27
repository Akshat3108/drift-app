// 8.4 — Thin wrapper around expo-image. Centralises Drift-wide defaults
// (cachePolicy=memory-disk for offline-first reuse, contentFit=cover which
// matches the only existing call-site's intent) and exposes `recyclingKey`
// as a first-class prop so future in-list usage (after 8.6 receipt
// thumbnails land) gets correct view-recycling automatically.
//
// Use anywhere we'd reach for `<Image>` from `react-native`. The two APIs
// differ in two small ways:
//   - expo-image uses `contentFit` instead of `resizeMode`. The wrapper
//     maps `resizeMode` → `contentFit` for drop-in compatibility.
//   - expo-image's `source` accepts a `{ uri }` object or a string. The
//     wrapper passes it through unchanged.

import React from 'react';
import { Image as ExpoImage } from 'expo-image';

const RESIZE_TO_FIT = {
  cover: 'cover',
  contain: 'contain',
  stretch: 'fill',
  center: 'none',
  repeat: 'cover', // expo-image has no exact repeat; cover is the closest
};

function DriftImage({
  source,
  style,
  recyclingKey,
  contentFit,
  resizeMode,
  cachePolicy = 'memory-disk',
  ...rest
}) {
  const fit = contentFit || RESIZE_TO_FIT[resizeMode] || 'cover';
  return (
    <ExpoImage
      source={source}
      style={style}
      contentFit={fit}
      cachePolicy={cachePolicy}
      recyclingKey={recyclingKey}
      {...rest}
    />
  );
}

export default DriftImage;
export { DriftImage };
