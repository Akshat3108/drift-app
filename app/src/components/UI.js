import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';

// Card
export function Card({ children, style, color, pad = 16, radius = 16 }) {
  return (
    <View style={[{ backgroundColor: color || '#fff', borderRadius: radius, padding: pad }, style]}>
      {children}
    </View>
  );
}

// Button
export function Btn({ label, onPress, variant = 'primary', F, style, disabled }) {
  const bg = variant === 'primary' ? F.coral : variant === 'danger' ? '#fee2e2' : F.surface;
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? '#e55' : F.ink;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8}
      style={[{ backgroundColor: bg, borderRadius: 12, paddingVertical: 13,
        paddingHorizontal: 20, alignItems: 'center', opacity: disabled ? 0.5 : 1,
        borderWidth: variant === 'outline' ? 1.5 : 0, borderColor: F.coral }, style]}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );
}

// Chip
export function Chip({ label, color, fg, style }) {
  return (
    <View style={[{ backgroundColor: color || '#fdeede', borderRadius: 99,
      paddingVertical: 3, paddingHorizontal: 10, alignSelf: 'flex-start' }, style]}>
      <Text style={{ color: fg || '#e85d44', fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

// Section header
export function SectionHeader({ title, onAction, actionLabel, F }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
      <Text style={{ fontSize: 18, color: F.ink, fontWeight: '400' }}>{title}</Text>
      {onAction && (
        <TouchableOpacity onPress={onAction}>
          <Text style={{ color: F.coral, fontSize: 13, fontWeight: '600' }}>{actionLabel || 'See all'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Stat tile
export function StatTile({ label, value, sub, color, icon, F }) {
  return (
    <View style={{ flex: 1, backgroundColor: F.surface, borderRadius: 16,
      padding: 16, borderWidth: 1, borderColor: F.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 10, color: F.ink3, fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Text>
        {icon && <Text style={{ fontSize: 18 }}>{icon}</Text>}
      </View>
      <Text style={{ fontSize: 26, color: color || F.ink, marginTop: 8, fontWeight: '400' }}>{value}</Text>
      {sub && <Text style={{ fontSize: 11, color: F.ink3, marginTop: 4 }}>{sub}</Text>}
    </View>
  );
}

// Progress bar
export function ProgressBar({ value, max, color, F, height = 6 }) {
  const pct = Math.min(value / max, 1);
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: F.line, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: color || F.coral, borderRadius: height / 2 }}/>
    </View>
  );
}

// Toggle
export function Toggle({ value, onChange, F }) {
  return (
    <TouchableOpacity onPress={() => onChange(!value)} activeOpacity={0.8}
      style={{ width: 44, height: 26, borderRadius: 13,
        backgroundColor: value ? F.coral : F.line, justifyContent: 'center' }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
        position: 'absolute', left: value ? 22 : 2,
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 }}/>
    </TouchableOpacity>
  );
}

// Mood picker row
export function MoodPicker({ value, onChange, F }) {
  const moods = [
    { e: '😍', l: 'Loved it' }, { e: '😌', l: 'Worth it' }, { e: '😐', l: 'Neutral' },
    { e: '😬', l: 'Unsure'  }, { e: '😞', l: 'Regret'   },
  ];
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {moods.map((m, i) => (
          <TouchableOpacity key={m.e} onPress={() => onChange(i)} activeOpacity={0.8}
            style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
              backgroundColor: value === i ? F.cream : 'transparent',
              borderWidth: 2, borderColor: value === i ? F.coral : 'transparent' }}>
            <Text style={{ fontSize: 26 }}>{m.e}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ textAlign: 'center', fontSize: 12, color: F.ink2, marginTop: 8 }}>
        "{moods[value]?.l}"
      </Text>
    </View>
  );
}

// Pot circle progress
export function PotRing({ pct, color, over, size = 28 }) {
  // Simple arc using a native View trick
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', inset: 0, borderRadius: size / 2,
        borderWidth: 3, borderColor: '#fff' }}/>
      <View style={{ position: 'absolute', inset: 0, borderRadius: size / 2,
        borderWidth: 3, borderColor: over ? '#e85d44' : '#5d8569',
        opacity: Math.min(pct, 1) }}/>
    </View>
  );
}

// Donut chart (SVG-less, CSS-based approximation using View)
export function DonutChart({ data, palette, size = 160, F }) {
  // Simple colored segments using border-radius trick
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2,
      backgroundColor: F.line, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
      {/* Simplified: just show legend colors as arcs via rotation */}
      {data.map((d, i) => {
        const pct = d.value / total;
        return (
          <View key={i} style={{
            position: 'absolute', width: size, height: size, borderRadius: size / 2,
            borderWidth: size * 0.14, borderColor: palette[i % palette.length],
            transform: [{ rotate: `${i * 45}deg` }], opacity: pct > 0.01 ? 1 : 0,
          }}/>
        );
      })}
      <View style={{ width: size * 0.58, height: size * 0.58, borderRadius: size * 0.29,
        backgroundColor: F.surface, zIndex: 10 }}/>
    </View>
  );
}

// Spark line (simplified bar-based)
export function SparkBars({ data, color, F, height = 60 }) {
  const max = Math.max(...data.map(d => d.v || d));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 4 }}>
      {data.map((d, i) => {
        const v = d.v || d;
        const h = (v / max) * (height - 14);
        const isLast = i === data.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ width: '100%', height: h, borderRadius: 4,
              backgroundColor: isLast ? color : color, opacity: isLast ? 1 : 0.25 }}/>
            {d.m && <Text style={{ fontSize: 8, color: F.ink3, marginTop: 3 }}>{d.m}</Text>}
          </View>
        );
      })}
    </View>
  );
}
