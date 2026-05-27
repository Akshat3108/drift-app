// PS-05 — global month picker (single-month, no ranges).
//
// Bottom-sheet `Modal` reachable from Home + Trends + the analytics screens
// via a header chip. Tap a preset / use prev-next arrows to set the active
// viewing month. Future months are not selectable (clamped at "current").
// Swipe-down / × dismisses without changing the month.
//
// Pure helpers `prevMonth(m)` / `nextMonth(m)` / `currentMonthKey()` are
// exported so /tmp/ validation can exercise the boundary arithmetic.

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function currentMonthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function prevMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function nextMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function isFutureMonth(monthKey, now = new Date()) {
  return monthKey > currentMonthKey(now);
}

export function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'long', year: 'numeric',
  });
}

export function MonthPicker({ visible, onClose, value, onChange, F }) {
  const insets = useSafeAreaInsets();
  const today = currentMonthKey();

  const prev = useMemo(() => prevMonth(value), [value]);
  const next = useMemo(() => nextMonth(value), [value]);
  const nextDisabled = isFutureMonth(next);

  const presets = useMemo(() => {
    const t = currentMonthKey();
    return [
      { key: 'this',  label: 'This month',  value: t },
      { key: 'last',  label: 'Last month',  value: prevMonth(t) },
      { key: 'last2', label: 'Two months ago', value: prevMonth(prevMonth(t)) },
    ];
  }, []);

  const isCurrent = value === today;

  const choose = (m) => {
    if (isFutureMonth(m)) return;
    onChange(m);
    onClose?.();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: F.bg,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          paddingHorizontal: 18, paddingTop: 14,
          paddingBottom: insets.bottom + 18,
          maxHeight: '80%',
        }}>
          {/* drag handle */}
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: F.line }}/>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 18, color: F.ink, fontWeight: '700' }}>View month</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Text style={{ fontSize: 22, color: F.ink3 }}>×</Text>
            </TouchableOpacity>
          </View>

          {/* prev / current / next strip */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line,
            paddingVertical: 14, paddingHorizontal: 12, marginBottom: 14 }}>
            <TouchableOpacity onPress={() => choose(prev)} hitSlop={10}
              style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 22, color: F.ink }}>‹</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 18, color: F.ink, fontWeight: '700' }}>
                {formatMonthLabel(value)}
              </Text>
              {isCurrent ? (
                <Text style={{ fontSize: 11, color: F.sageD, marginTop: 2 }}>Current month</Text>
              ) : (
                <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>Viewing history</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => choose(next)} disabled={nextDisabled} hitSlop={10}
              style={{ paddingHorizontal: 10, paddingVertical: 6, opacity: nextDisabled ? 0.3 : 1 }}>
              <Text style={{ fontSize: 22, color: F.ink }}>›</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 11, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
            Jump to
          </Text>
          <ScrollView style={{ maxHeight: 240 }}>
            {presets.map((p) => {
              const selected = p.value === value;
              return (
                <TouchableOpacity
                  key={p.key}
                  onPress={() => choose(p.value)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingHorizontal: 12, paddingVertical: 12,
                    borderBottomWidth: 1, borderBottomColor: F.line,
                  }}>
                  <Text style={{ fontSize: 14, color: F.ink, fontWeight: selected ? '700' : '500' }}>
                    {p.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: selected ? F.coral : F.ink3 }}>
                    {formatMonthLabel(p.value)}{selected ? '  •' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {!isCurrent && (
            <TouchableOpacity
              onPress={() => choose(today)}
              activeOpacity={0.85}
              style={{ marginTop: 14, backgroundColor: F.coral, borderRadius: 14,
                paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                Reset to current month
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default MonthPicker;
