import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { normalizeName } from '../core/domain/normalize';
import { toCanonical, UNIT_OPTIONS } from '../core/domain/units';
import { useItemActions } from '@features/items/context';
import { logError } from '../core/utils/log';

const nextKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `r_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;

export function emptyRow(overrides = {}) {
  return {
    key: nextKey(),
    name: '',
    qty: '',
    unit: 'kg',
    rate: '',
    total: '',
    totalManual: false,
    kind: 'other',
    ...overrides,
  };
}

export function rowsFromExisting(items) {
  return items.map(it => ({
    key: nextKey(),
    name: it.name,
    qty: String(it.qty ?? ''),
    unit: it.unit || 'pcs',
    rate: String(it.unit_price ?? ''),
    total: String(it.price ?? ''),
    totalManual: true,
    kind: it.kind || 'other',
  }));
}

export function toPersistedItems(rows) {
  const out = [];
  for (const r of rows) {
    const name = r.name.trim();
    const qty = parseFloat(r.qty);
    const rate = parseFloat(r.rate);
    const total = parseFloat(r.total);
    if (!name || !isFinite(qty) || qty <= 0) continue;
    const unit = r.unit || 'pcs';
    const { canonical_qty, canonical_unit } = toCanonical(qty, unit);
    const finalTotal = isFinite(total) && total > 0
      ? total
      : (isFinite(rate) && rate > 0 ? +(rate * qty).toFixed(2) : 0);
    const finalRate = isFinite(rate) && rate > 0
      ? rate
      : (qty > 0 ? +(finalTotal / qty).toFixed(4) : 0);
    const canonicalUnitPrice = canonical_qty > 0 ? +(finalTotal / canonical_qty).toFixed(4) : 0;
    const norm = normalizeName(name);
    out.push({
      name,
      normalized_name: norm.normalized_name || name.toLowerCase(),
      kind: r.kind || 'other',
      qty,
      unit,
      canonical_qty,
      canonical_unit,
      unit_price: canonicalUnitPrice || finalRate,
      price: finalTotal,
    });
  }
  return out;
}

export function rowsTotal(rows) {
  return rows.reduce((s, r) => {
    const t = parseFloat(r.total);
    if (isFinite(t)) return s + t;
    const q = parseFloat(r.qty);
    const rt = parseFloat(r.rate);
    if (isFinite(q) && isFinite(rt)) return s + q * rt;
    return s;
  }, 0);
}

function recomputeTotal(row) {
  if (row.totalManual) return row;
  const q = parseFloat(row.qty);
  const r = parseFloat(row.rate);
  if (isFinite(q) && isFinite(r) && q > 0 && r > 0) {
    return { ...row, total: (+(q * r).toFixed(2)).toString() };
  }
  return row;
}

export default function ItemRows({ rows, onChange, F, sym }) {
  const { suggest } = useItemActions();
  const [focused, setFocused] = useState(null);
  const [unitOpenFor, setUnitOpenFor] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const debounceRef = useRef(null);

  const update = useCallback((key, patch) => {
    onChange(rows.map(r => r.key === key ? recomputeTotal({ ...r, ...patch }) : r));
  }, [rows, onChange]);

  const remove = useCallback((key) => {
    onChange(rows.filter(r => r.key !== key));
  }, [rows, onChange]);

  const add = useCallback(() => {
    onChange([...rows, emptyRow()]);
  }, [rows, onChange]);

  useEffect(() => {
    if (!focused) { setSuggestions([]); return; }
    const r = rows.find(x => x.key === focused);
    const q = r?.name?.trim();
    if (!q || q.length < 1) { setSuggestions([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const s = await suggest(q);
        setSuggestions(s);
      } catch (e) {
        logError('itemrows.suggest', e);
        setSuggestions([]);
      }
    }, 150);
    return () => clearTimeout(debounceRef.current);
  }, [focused, rows, suggest]);

  const applySuggestion = (key, sug) => {
    onChange(rows.map(r => {
      if (r.key !== key) return r;
      const next = {
        ...r,
        name: sug.display_name || sug.normalized_name,
        unit: sug.last_unit || r.unit,
        rate: sug.last_unit_price ? String(sug.last_unit_price) : r.rate,
        kind: sug.kind || r.kind,
      };
      return recomputeTotal({ ...next, totalManual: false });
    }));
    setSuggestions([]);
    setFocused(null);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 4, marginBottom: 6 }}>
        <Text style={[h, { flex: 2.2, color: F.ink3 }]}>ITEM</Text>
        <Text style={[h, { flex: 1.4, color: F.ink3, textAlign: 'center' }]}>QTY</Text>
        <Text style={[h, { flex: 1.2, color: F.ink3, textAlign: 'right' }]}>RATE</Text>
        <Text style={[h, { flex: 1.2, color: F.ink3, textAlign: 'right' }]}>TOTAL</Text>
        <View style={{ width: 26 }}/>
      </View>

      {rows.map((r) => {
        const isFocused = focused === r.key;
        const showSugs = isFocused && suggestions.length > 0;
        const unitOpen = unitOpenFor === r.key;
        return (
          <View key={r.key} style={{
            backgroundColor: F.surface, borderRadius: 14, borderWidth: 1, borderColor: F.line,
            marginBottom: 8, paddingVertical: 6, paddingHorizontal: 6,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                value={r.name}
                onChangeText={(t) => update(r.key, { name: t })}
                onFocus={() => { setFocused(r.key); setUnitOpenFor(null); }}
                onBlur={() => setTimeout(() => setFocused(f => f === r.key ? null : f), 200)}
                placeholder="Item"
                placeholderTextColor={F.ink3}
                style={[inp, { flex: 2.2, color: F.ink }]}
              />
              <View style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <TextInput
                  value={r.qty}
                  onChangeText={(t) => update(r.key, { qty: t.replace(/[^0-9.]/g, '') })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={F.ink3}
                  style={[inp, { width: 44, textAlign: 'right', color: F.ink, paddingHorizontal: 2 }]}
                />
                <TouchableOpacity onPress={() => setUnitOpenFor(unitOpen ? null : r.key)}
                  style={{ backgroundColor: F.cream, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, color: F.ink2, fontWeight: '600' }}>{r.unit} ▾</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                value={r.rate}
                onChangeText={(t) => update(r.key, { rate: t.replace(/[^0-9.]/g, ''), totalManual: false })}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={F.ink3}
                style={[inp, { flex: 1.2, textAlign: 'right', color: F.ink }]}
              />
              <TextInput
                value={r.total}
                onChangeText={(t) => update(r.key, { total: t.replace(/[^0-9.]/g, ''), totalManual: true })}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={F.ink3}
                style={[inp, { flex: 1.2, textAlign: 'right', color: F.ink, fontWeight: '600' }]}
              />
              <TouchableOpacity onPress={() => remove(r.key)} hitSlop={10}
                style={{ width: 26, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, color: F.ink3 }}>×</Text>
              </TouchableOpacity>
            </View>

            {unitOpen && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ marginTop: 6 }}
                contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}>
                {UNIT_OPTIONS.map(u => {
                  const sel = u === r.unit;
                  return (
                    <TouchableOpacity key={u}
                      onPress={() => { update(r.key, { unit: u }); setUnitOpenFor(null); }}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99,
                        backgroundColor: sel ? F.coral : F.cream,
                        borderWidth: 1, borderColor: sel ? F.coral : F.line,
                      }}>
                      <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink, fontWeight: '600' }}>{u}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {showSugs && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                style={{ marginTop: 6 }}
                contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}>
                {suggestions.map(s => (
                  <TouchableOpacity key={s.normalized_name}
                    onPress={() => applySuggestion(r.key, s)}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                      backgroundColor: F.cream, borderWidth: 1, borderColor: F.line,
                    }}>
                    <Text style={{ fontSize: 12, color: F.ink, fontWeight: '600', textTransform: 'capitalize' }}>
                      {s.display_name}
                    </Text>
                    {s.last_unit_price > 0 && (
                      <Text style={{ fontSize: 10, color: F.ink3, marginTop: 1 }}>
                        last {sym}{s.last_unit_price.toFixed(2)}/{s.last_canonical_unit || s.last_unit}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        );
      })}

      <TouchableOpacity onPress={add} activeOpacity={0.7}
        style={{
          borderWidth: 1, borderColor: F.coral, borderStyle: 'dashed',
          borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4,
        }}>
        <Text style={{ color: F.coral, fontWeight: '600', fontSize: 13 }}>+ Add item</Text>
      </TouchableOpacity>
    </View>
  );
}

const h = { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 };
const inp = {
  paddingVertical: 8, paddingHorizontal: 8, fontSize: 14,
};
