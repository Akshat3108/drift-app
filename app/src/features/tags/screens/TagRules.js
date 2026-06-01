// PS-35 — Auto-tag rules CRUD.
//
// Each rule maps a predicate (any of: merchant_contains, notes_contains,
// category_id, payment_method, amount_min, amount_max — AND semantics) to a
// tag. On every expense save the enabled rules are evaluated and matching tags
// are auto-attached (see expenses/context.js + tags/ruleMatch.js).

import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Switch, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@core/theme/ThemeContext';
import { useTags } from '@features/tags/context';
import { useCategories } from '@features/categories/context';
import { tagRulesRepo } from '@features/tags/rulesRepo';
import { PAYMENT_METHODS, PAYMENT_LABELS } from '@features/expenses/filters';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

// Human-readable one-liner for a rule's predicate.
function describe(predicate, categories) {
  const p = predicate || {};
  const parts = [];
  if (p.merchant_contains) parts.push(`merchant ~ "${p.merchant_contains}"`);
  if (p.notes_contains) parts.push(`notes ~ "${p.notes_contains}"`);
  if (p.category_id != null) {
    const c = (categories || []).find((x) => x.id === Number(p.category_id));
    parts.push(`in ${c ? c.name : `#${p.category_id}`}`);
  }
  if (p.payment_method) parts.push(`pay = ${p.payment_method}`);
  if (p.amount_min != null) parts.push(`≥ ${p.amount_min}`);
  if (p.amount_max != null) parts.push(`≤ ${p.amount_max}`);
  return parts.length ? parts.join(' · ') : 'no conditions (never matches)';
}

function Chip({ label, selected, onPress, F }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      accessibilityRole="button" accessibilityState={{ selected }}
      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
        backgroundColor: selected ? F.coral : F.surface,
        borderWidth: 1, borderColor: selected ? F.coral : F.line }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? '#fff' : F.ink2 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const FieldLabel = ({ F, children }) => (
  <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6, marginTop: 14 }}>
    {children}
  </Text>
);

function TagRules() {
  const { F } = useTheme();
  const insets = useSafeAreaInsets();
  const { tags } = useTags();
  const { categories } = useCategories();
  const toast = useToast();

  const [rules, setRules] = useState([]);
  const [adding, setAdding] = useState(false);

  // draft predicate + target tag for the add form
  const [tagId, setTagId] = useState(null);
  const [merchant, setMerchant] = useState('');
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [payment, setPayment] = useState(null);
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await tagRulesRepo.list();
      setRules(list.map((r) => ({ ...r, predicate: safeParse(r.predicate_json) })));
    } catch (e) { logError('tagrules:load', e); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resetForm = () => {
    setTagId(null); setMerchant(''); setNotes(''); setCategoryId(null);
    setPayment(null); setAmountMin(''); setAmountMax('');
  };

  const buildPredicate = () => {
    const p = {};
    if (merchant.trim()) p.merchant_contains = merchant.trim();
    if (notes.trim()) p.notes_contains = notes.trim();
    if (categoryId != null) p.category_id = categoryId;
    if (payment) p.payment_method = payment;
    if (amountMin.trim() && Number.isFinite(parseFloat(amountMin))) p.amount_min = parseFloat(amountMin);
    if (amountMax.trim() && Number.isFinite(parseFloat(amountMax))) p.amount_max = parseFloat(amountMax);
    return p;
  };

  const saveRule = async () => {
    if (tagId == null) return Alert.alert('Pick a tag', 'Choose which tag this rule applies.');
    const predicate = buildPredicate();
    if (Object.keys(predicate).length === 0) {
      return Alert.alert('Add a condition', 'A rule with no conditions would never match.');
    }
    try {
      await tagRulesRepo.create({ predicate, tag_id: tagId, enabled: 1 });
      toast('Rule added');
      resetForm(); setAdding(false);
      await load();
    } catch (e) {
      logError('tagrules:create', e);
      Alert.alert('Could not save rule', e?.message || String(e));
    }
  };

  const toggleRule = async (rule) => {
    try { await tagRulesRepo.setEnabled(rule.id, rule.enabled ? 0 : 1); await load(); }
    catch (e) { logError('tagrules:toggle', e); }
  };

  const deleteRule = (rule) => {
    Alert.alert('Delete rule?', `Stops auto-tagging "${rule.tag_name}". Past expenses keep their tags.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await tagRulesRepo.remove(rule.id);
          await load();
          toast(`Deleted rule for ${rule.tag_name}`, {
            actionLabel: 'Undo',
            onAction: async () => { try { await tagRulesRepo.restore(rule.id); await load(); } catch (e) { logError('tagrules:restore', e); } },
          });
        } catch (e) { logError('tagrules:delete', e); Alert.alert('Delete failed', e?.message || String(e)); }
      } },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>

      <View style={{ backgroundColor: F.cream, borderRadius: 22, padding: 20, marginBottom: 16 }}>
        <Text style={{ fontSize: 22, color: F.ink, fontWeight: '400' }}>
          Auto-tag <Text style={{ color: F.coral, fontStyle: 'italic' }}>rules</Text>
        </Text>
        <Text style={{ fontSize: 12, color: F.ink2, marginTop: 6, lineHeight: 17 }}>
          When a new expense matches all of a rule's conditions, its tag is attached automatically.
        </Text>
      </View>

      {rules.length === 0 && !adding && (
        <View style={{ alignItems: 'center', padding: 28, backgroundColor: F.surface,
          borderRadius: 18, borderWidth: 1, borderColor: F.line, marginBottom: 14 }}>
          <Text style={{ fontSize: 30, marginBottom: 6 }}>⚡</Text>
          <Text style={{ fontSize: 14, color: F.ink2 }}>No rules yet</Text>
        </View>
      )}

      {rules.map((r) => (
        <View key={r.id} style={{ backgroundColor: F.surface, borderRadius: 14, borderWidth: 1,
          borderColor: F.line, padding: 14, marginBottom: 8, opacity: r.enabled ? 1 : 0.55 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: r.tag_color || F.coral }} />
            <Text style={{ flex: 1, fontSize: 14, color: F.ink, fontWeight: '600' }}>#{r.tag_name}</Text>
            <Switch value={!!r.enabled} onValueChange={() => toggleRule(r)}
              trackColor={{ true: F.coral, false: F.line }} />
            <TouchableOpacity onPress={() => deleteRule(r)} hitSlop={10} accessibilityRole="button"
              accessibilityLabel={`Delete rule for ${r.tag_name}`}>
              <Text style={{ color: '#e55', fontSize: 12, fontWeight: '600' }}>Delete</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 6 }}>{describe(r.predicate, categories)}</Text>
        </View>
      ))}

      {adding ? (
        <View style={{ backgroundColor: F.surface, borderRadius: 16, borderWidth: 1,
          borderColor: F.line, padding: 16, marginTop: 8 }}>
          <FieldLabel F={F}>TAG TO APPLY</FieldLabel>
          {tags.length === 0 ? (
            <Text style={{ fontSize: 12, color: F.ink3 }}>Create a tag first (from Add/Edit expense).</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {tags.map((t) => (
                <Chip key={t.id} label={`#${t.name}`} selected={tagId === t.id}
                  onPress={() => setTagId(t.id)} F={F} />
              ))}
            </View>
          )}

          <FieldLabel F={F}>MERCHANT CONTAINS</FieldLabel>
          <TextInput value={merchant} onChangeText={setMerchant} placeholder="e.g. uber" placeholderTextColor={F.ink3}
            autoCapitalize="none"
            style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: F.line, backgroundColor: F.bg, color: F.ink }} />

          <FieldLabel F={F}>NOTES CONTAIN</FieldLabel>
          <TextInput value={notes} onChangeText={setNotes} placeholder="e.g. office" placeholderTextColor={F.ink3}
            autoCapitalize="none"
            style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: F.line, backgroundColor: F.bg, color: F.ink }} />

          <FieldLabel F={F}>CATEGORY</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Chip label="Any" selected={categoryId == null} onPress={() => setCategoryId(null)} F={F} />
            {(categories || []).map((c) => (
              <Chip key={c.id} label={`${c.emoji} ${c.name}`} selected={categoryId === c.id}
                onPress={() => setCategoryId(categoryId === c.id ? null : c.id)} F={F} />
            ))}
          </View>

          <FieldLabel F={F}>PAYMENT METHOD</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Chip label="Any" selected={payment == null} onPress={() => setPayment(null)} F={F} />
            {PAYMENT_METHODS.map((m) => (
              <Chip key={m} label={PAYMENT_LABELS[m]} selected={payment === m}
                onPress={() => setPayment(payment === m ? null : m)} F={F} />
            ))}
          </View>

          <FieldLabel F={F}>AMOUNT RANGE</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput value={amountMin} onChangeText={(t) => setAmountMin(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad" placeholder="min" placeholderTextColor={F.ink3}
              style={{ flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: F.line, backgroundColor: F.bg, color: F.ink }} />
            <TextInput value={amountMax} onChangeText={(t) => setAmountMax(t.replace(/[^0-9.]/g, ''))}
              keyboardType="decimal-pad" placeholder="max" placeholderTextColor={F.ink3}
              style={{ flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: F.line, backgroundColor: F.bg, color: F.ink }} />
          </View>

          <TouchableOpacity onPress={saveRule}
            style={{ backgroundColor: F.coral, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 18 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Add rule</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { resetForm(); setAdding(false); }}
            style={{ padding: 12, alignItems: 'center', marginTop: 4 }}>
            <Text style={{ color: F.ink2, fontSize: 13 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={() => setAdding(true)}
          style={{ borderWidth: 2, borderColor: F.line, borderStyle: 'dashed', borderRadius: 16,
            padding: 16, alignItems: 'center', marginTop: 8 }}>
          <Text style={{ fontSize: 13, color: F.ink2 }}>+ Add rule</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }

export default React.memo(TagRules);
