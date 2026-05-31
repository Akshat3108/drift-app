// Compact segmented control for picking a chart's render type. Each segment is
// a tiny hand-drawn SVG glyph (bar / line / area / dot / donut) rather than a
// text label or an icon-font dependency — keeps the footprint small so it can
// sit unobtrusively in a chart card's top-right corner.
//
// Falls back to short text labels if react-native-svg can't load (dev shell).

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

let Svg = null, Rect = null, Polyline = null, Polygon = null, Circle = null, Line = null;
try {
  const mod = require('react-native-svg');
  Svg = mod.Svg ?? mod.default;
  Rect = mod.Rect;
  Polyline = mod.Polyline;
  Polygon = mod.Polygon;
  Circle = mod.Circle;
  Line = mod.Line;
} catch (_) { /* dev shell — text-label fallback below */ }

const W = 20, H = 14;

const TEXT_FALLBACK = { bar: 'Bar', line: 'Line', area: 'Area', dot: 'Dot', donut: 'Ring' };

function Glyph({ type, color }) {
  if (!Svg) return null;
  switch (type) {
    case 'line':
      return (
        <Svg width={W} height={H}>
          <Polyline points="1,11 6,5 11,8 19,2" fill="none" stroke={color} strokeWidth="1.6"
            strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      );
    case 'area':
      return (
        <Svg width={W} height={H}>
          <Polygon points="1,11 6,6 11,8 19,3 19,13 1,13" fill={color} opacity={0.35} />
          <Polyline points="1,11 6,6 11,8 19,3" fill="none" stroke={color} strokeWidth="1.4"
            strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      );
    case 'dot':
      return (
        <Svg width={W} height={H}>
          <Line x1="3" y1="13" x2="3" y2="9" stroke={color} strokeWidth="1.2" />
          <Line x1="10" y1="13" x2="10" y2="4" stroke={color} strokeWidth="1.2" />
          <Line x1="17" y1="13" x2="17" y2="7" stroke={color} strokeWidth="1.2" />
          <Circle cx="3" cy="9" r="2" fill={color} />
          <Circle cx="10" cy="4" r="2" fill={color} />
          <Circle cx="17" cy="7" r="2" fill={color} />
        </Svg>
      );
    case 'donut':
      return (
        <Svg width={W} height={H}>
          <Circle cx={W / 2} cy={H / 2} r="5" fill="none" stroke={color} strokeWidth="3" />
        </Svg>
      );
    case 'bar':
    default:
      return (
        <Svg width={W} height={H}>
          <Rect x="1.5" y="7" width="3.5" height="6" rx="1" fill={color} />
          <Rect x="6.5" y="3" width="3.5" height="10" rx="1" fill={color} />
          <Rect x="11.5" y="9" width="3.5" height="4" rx="1" fill={color} />
          <Rect x="16" y="5" width="3.5" height="8" rx="1" fill={color} />
        </Svg>
      );
  }
}

export default function ChartTypeToggle({ types, value, onChange, F }) {
  if (!types || types.length < 2) return null;
  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        backgroundColor: F.cream,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: F.line,
        padding: 2,
        gap: 2,
      }}
    >
      {types.map((t) => {
        const sel = t === value;
        return (
          <TouchableOpacity
            key={t}
            onPress={() => onChange?.(t)}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={`${t} chart`}
            style={{
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderRadius: 8,
              backgroundColor: sel ? F.coral : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 30,
            }}
          >
            {Svg ? (
              <Glyph type={t} color={sel ? '#fff' : F.ink3} />
            ) : (
              <Text style={{ fontSize: 10, fontWeight: '600', color: sel ? '#fff' : F.ink3 }}>
                {TEXT_FALLBACK[t] || t}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
