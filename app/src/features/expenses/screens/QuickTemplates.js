// PS-09 — Quick-Entry Templates CRUD.
//
// Lists every live template + lets the user add / edit / delete / reorder
// them. Writes through `templatesRepo.create / update / remove / reorder`.
// `default_day_of_month` is captured but no scheduler ships in PS-09 — the
// caption tells the user it's reserved for a future auto-create feature.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { templatesRepo } from '@features/expenses/templates.repo';
import PaymentPicker from '@components/primitives/PaymentPicker';
import { potBg } from '../../../theme';

const ICONS = ['🧷', '🏠', '⚡', '📱', '🛒', '🍽', '⛽', '🎟', '💊', '🚆', '📚', '✈️', '🐶'];

const emptyDraft = () => ({
  id: null, label: '', amount: '', category_id: null,
  payment_method: null, default_day_of_month: '', icon: '🧷',
});

function QuickTemplates({ navigation }) {
  const { F, sym, pots } = useApp();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null); // { id, label, amount, ... }
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await templatesRepo.list();
      setRows(r || []);
    } catch { /* swallow */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const closeEditor = () => setEditing(null);

  const saveEditor = useCallback(async () => {
    if (!editing) return;
    const label = (editing.label || '').trim();
    if (!label) { Alert.alert('Need a label', 'Templates need a short name.'); return; }
    const amt = Number(editing.amount);
    if (!Number.isFinite(amt) || amt <= 0) { Alert.alert('Need an amount', 'Enter a positive amount.'); return; }
    const dom = editing.default_day_of_month === '' || editing.default_day_of_month == null
      ? null
      : Math.max(1, Math.min(31, Number(editing.default_day_of_month)));
    const patch = {
      label,
      amount: amt,
      category_id: editing.category_id ?? null,
      payment_method: editing.payment_method ?? null,
      default_day_of_month: dom,
      icon: editing.icon || '🧷',
    };
    try {
      if (editing.id == null) await templatesRepo.create(patch);
      else                    await templatesRepo.update(editing.id, patch);
      await load();
      setEditing(null);
    } catch (e) {
      Alert.alert('Save failed', e?.message || String(e));
    }
  }, [editing, load]);

  const deleteEditor = useCallback(async () => {
    if (!editing?.id) { setEditing(null); return; }
    Alert.alert(
      'Delete template?',
      `"${editing.label || 'this template'}" will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await templatesRepo.remove(editing.id);
            await load();
            setEditing(null);
          } catch (e) { Alert.alert('Delete failed', e?.message || String(e)); }
        }},
      ],
    );
  }, [editing, load]);

  const moveRow = useCallback(async (index, dir) => {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    const reordered = rows.slice();
    [reordered[index], reordered[j]] = [reordered[j], reordered[index]];
    setRows(reordered); // optimistic
    try {
      await templatesRepo.reorder(reordered.map((r) => r.id));
    } catch (e) {
      Alert.alert('Reorder failed', e?.message || String(e));
      await load();
    }
  }, [rows, load]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 60, paddingHorizontal: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
        Quick <Text style={{ color: F.coral, fontStyle: 'italic' }}>templates</Text>
      </Text>
      <Text style={{ fontSize: 12, color: F.ink2, marginTop: 4 }}>
        One-tap saved expenses. Tap a chip on the Add screen to prefill.
      </Text>

      <TouchableOpacity
        onPress={() => setEditing(emptyDraft())}
        activeOpacity={0.85}
        style={{ marginTop: 14, backgroundColor: F.coral, borderRadius: 14,
          paddingVertical: 12, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>+ New template</Text>
      </TouchableOpacity>

      {loading ? (
        <Text style={{ fontSize: 12, color: F.ink3, marginTop: 14 }}>Loading…</Text>
      ) : rows.length === 0 && !editing ? (
        <View style={{ marginTop: 18, padding: 18, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ fontSize: 32 }}>🧷</Text>
          <Text style={{ fontSize: 13, color: F.ink2, marginTop: 8, textAlign: 'center' }}>
            No templates yet.{'\n'}Tap '+ New template' to set up a one-tap saved expense.
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 14, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
          {rows.map((r, i) => {
            const cat = (pots || []).find((p) => p.id === r.category_id) || null;
            return (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 10, paddingVertical: 10,
                borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
                <View style={{ flexDirection: 'column' }}>
                  <TouchableOpacity onPress={() => moveRow(i, -1)} disabled={i === 0} hitSlop={6}
                    style={{ opacity: i === 0 ? 0.3 : 1, paddingHorizontal: 4 }}>
                    <Text style={{ fontSize: 12, color: F.ink2 }}>▲</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => moveRow(i, +1)} disabled={i === rows.length - 1} hitSlop={6}
                    style={{ opacity: i === rows.length - 1 ? 0.3 : 1, paddingHorizontal: 4 }}>
                    <Text style={{ fontSize: 12, color: F.ink2 }}>▼</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => setEditing({
                    id: r.id, label: r.label || '', amount: String(r.amount || ''),
                    category_id: r.category_id, payment_method: r.payment_method,
                    default_day_of_month: r.default_day_of_month == null ? '' : String(r.default_day_of_month),
                    icon: r.icon || '🧷',
                  })}
                  activeOpacity={0.7}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12,
                    backgroundColor: cat ? potBg(F, cat.color || 'cream') : F.cream,
                    alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 18 }}>{r.icon || '🧷'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }} numberOfLines={1}>
                      {r.label}
                    </Text>
                    <Text style={{ fontSize: 11, color: F.ink3 }} numberOfLines={1}>
                      {sym}{Math.round(r.amount).toLocaleString()}
                      {cat ? ` · ${cat.emoji || ''} ${cat.label || cat.name}` : ' · No category'}
                      {r.payment_method ? ` · ${r.payment_method}` : ''}
                      {r.default_day_of_month ? ` · day ${r.default_day_of_month}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16, color: F.ink3 }}>›</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* Inline editor */}
      {editing && (
        <View style={{ marginTop: 18, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.coral, padding: 14 }}>
          <Text style={{ fontSize: 12, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            {editing.id == null ? 'New template' : 'Edit template'}
          </Text>

          <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 4 }}>Icon</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {ICONS.map((ic) => {
              const sel = editing.icon === ic;
              return (
                <TouchableOpacity key={ic} onPress={() => setEditing((e) => ({ ...e, icon: ic }))}
                  style={{ width: 36, height: 36, borderRadius: 10,
                    backgroundColor: sel ? F.coral : F.bg,
                    borderWidth: 1, borderColor: sel ? F.coral : F.line,
                    alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18 }}>{ic}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 4 }}>Label</Text>
          <TextInput
            value={editing.label}
            onChangeText={(v) => setEditing((e) => ({ ...e, label: v }))}
            placeholder="e.g. Rent"
            placeholderTextColor={F.ink3}
            style={{ borderWidth: 1, borderColor: F.line, borderRadius: 12, paddingHorizontal: 12,
              paddingVertical: 10, fontSize: 14, color: F.ink, marginBottom: 12 }}/>

          <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 4 }}>Amount ({sym})</Text>
          <TextInput
            value={editing.amount}
            onChangeText={(v) => setEditing((e) => ({ ...e, amount: v.replace(/[^0-9.]/g, '') }))}
            placeholder="0"
            keyboardType="decimal-pad"
            placeholderTextColor={F.ink3}
            style={{ borderWidth: 1, borderColor: F.line, borderRadius: 12, paddingHorizontal: 12,
              paddingVertical: 10, fontSize: 14, color: F.ink, marginBottom: 12 }}/>

          <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 4 }}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }} style={{ marginBottom: 12 }}>
            <TouchableOpacity onPress={() => setEditing((e) => ({ ...e, category_id: null }))}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
                backgroundColor: editing.category_id == null ? F.coral : F.bg,
                borderWidth: 1, borderColor: editing.category_id == null ? F.coral : F.line }}>
              <Text style={{ fontSize: 12, color: editing.category_id == null ? '#fff' : F.ink, fontWeight: '600' }}>
                None
              </Text>
            </TouchableOpacity>
            {(pots || []).map((p) => {
              const sel = editing.category_id === p.id;
              return (
                <TouchableOpacity key={p.id} onPress={() => setEditing((e) => ({ ...e, category_id: p.id }))}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
                    backgroundColor: sel ? F.coral : F.bg,
                    borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                  <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink, fontWeight: '600' }}>
                    {p.emoji} {p.label || p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 4 }}>Payment method</Text>
          <PaymentPicker
            value={editing.payment_method}
            onChange={(v) => setEditing((e) => ({ ...e, payment_method: v }))}
            F={F}/>
          <View style={{ height: 12 }}/>

          <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 4 }}>Day of month (optional)</Text>
          <TextInput
            value={editing.default_day_of_month}
            onChangeText={(v) => setEditing((e) => ({ ...e, default_day_of_month: v.replace(/[^0-9]/g, '').slice(0, 2) }))}
            placeholder="e.g. 1 for the 1st"
            keyboardType="number-pad"
            placeholderTextColor={F.ink3}
            style={{ borderWidth: 1, borderColor: F.line, borderRadius: 12, paddingHorizontal: 12,
              paddingVertical: 10, fontSize: 14, color: F.ink, marginBottom: 6 }}/>
          <Text style={{ fontSize: 10, color: F.ink3, marginBottom: 12 }}>
            Stored for a future auto-create-on-day-X feature. Not acted on yet.
          </Text>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={saveEditor} activeOpacity={0.85}
              style={{ flex: 1, backgroundColor: F.coral, borderRadius: 12,
                paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                {editing.id == null ? 'Create' : 'Save'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={closeEditor} activeOpacity={0.85}
              style={{ flex: 1, backgroundColor: F.surface, borderWidth: 1, borderColor: F.line,
                borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: F.ink2, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            {editing.id != null && (
              <TouchableOpacity onPress={deleteEditor} activeOpacity={0.85}
                style={{ width: 44, backgroundColor: '#fbe6e3', borderWidth: 1, borderColor: F.coral,
                  borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 16 }}>🗑</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

export default React.memo(QuickTemplates);
