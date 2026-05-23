import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView, TextInput, Alert, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useApp } from '../../../hooks/useAppState';
import { expenses as expRepo } from '@features/expenses/repo';
import { merchants as merchantRepo } from '@features/expenses/merchants.repo';
import { savedFilters as savedFiltersRepo } from '@features/expenses/savedFilters.repo';
import { useTags } from '@features/tags/context';
import {
  normalizeCriteria, hasActiveFilters, criteriaToHumanLabel,
  PAYMENT_METHODS, PAYMENT_LABELS,
} from '@features/expenses/filters';
import { logError } from '@core/utils/log';
import { useToast } from '@components/Toast';

const PRESETS = [
  { id: 'all',       label: 'All time' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'last3',     label: 'Last 3 mo' },
  { id: 'ytd',       label: 'YTD' },
  { id: 'custom',    label: 'Custom' },
];

const MOODS = ['😍', '😌', '😐', '😬', '😞'];

// Pure setter helpers — make the section JSX easier to read.
function toggleInArray(arr, value) {
  const a = Array.isArray(arr) ? arr.slice() : [];
  const i = a.indexOf(value);
  if (i >= 0) a.splice(i, 1);
  else a.push(value);
  return a;
}

export default function FilterSheet({ visible, onClose, onApply, initialCriteria }) {
  const { F } = useTheme();
  const toast = useToast();
  const { pots } = useApp();
  const { tags } = useTags();
  const insets = useSafeAreaInsets();

  const [criteria, setCriteria] = useState(() => normalizeCriteria(initialCriteria || {}));
  const [merchants, setMerchants] = useState([]);
  const [matchCount, setMatchCount] = useState(null);
  const [saved, setSaved] = useState([]);
  const [savingName, setSavingName] = useState('');
  const [showSaveSheet, setShowSaveSheet] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCriteria(normalizeCriteria(initialCriteria || {}));
  }, [visible, initialCriteria]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const [ms, sf] = await Promise.all([
          merchantRepo.list(),
          savedFiltersRepo.list(),
        ]);
        if (cancelled) return;
        setMerchants(ms || []);
        setSaved(sf || []);
      } catch (e) { logError('filtersheet.load', e); }
    })();
    return () => { cancelled = true; };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const n = await expRepo.count({ criteria });
        if (!cancelled) setMatchCount(n);
      } catch (e) {
        if (!cancelled) setMatchCount(null);
        logError('filtersheet.count', e);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, criteria]);

  const categoryMap = useMemo(() => Object.fromEntries((pots || []).map((p) => [p.id, p])), [pots]);
  const merchantMap = useMemo(() => Object.fromEntries(merchants.map((m) => [m.id, m])), [merchants]);
  const tagMap      = useMemo(() => Object.fromEntries((tags || []).map((t) => [t.id, t])), [tags]);

  const toggleCategory   = useCallback((id) => setCriteria((c) => ({ ...c, categoryIds: toggleInArray(c.categoryIds, id) })), []);
  const toggleMerchant   = useCallback((id) => setCriteria((c) => ({ ...c, merchantIds: toggleInArray(c.merchantIds, id) })), []);
  const toggleMood       = useCallback((m)  => setCriteria((c) => ({ ...c, moods: toggleInArray(c.moods, m) })), []);
  const togglePayment    = useCallback((p)  => setCriteria((c) => ({ ...c, paymentMethods: toggleInArray(c.paymentMethods, p) })), []);
  const toggleTag        = useCallback((id) => setCriteria((c) => ({ ...c, tagIds: toggleInArray(c.tagIds, id) })), []);
  const setPreset        = useCallback((preset) => setCriteria((c) => preset === 'custom'
    ? { ...c, dateRange: { from: c.dateRange?.from || '', to: c.dateRange?.to || '' } }
    : { ...c, dateRange: preset === 'all' ? undefined : { preset } }), []);
  const setRecurring     = useCallback((v) => setCriteria((c) => ({ ...c, recurring: v })), []);
  const setHasReceipt    = useCallback((v) => setCriteria((c) => ({ ...c, hasReceipt: v })), []);
  const setAmount        = useCallback((field, raw) => setCriteria((c) => {
    const n = parseFloat(raw);
    const next = { ...(c.amountRange || {}) };
    if (Number.isFinite(n)) next[field] = n; else delete next[field];
    return { ...c, amountRange: Object.keys(next).length ? next : undefined };
  }), []);
  const setCustomDate = useCallback((field, raw) => setCriteria((c) => {
    const dr = { ...(c.dateRange || {}) };
    if (raw) dr[field] = raw; else delete dr[field];
    delete dr.preset;
    return { ...c, dateRange: (dr.from || dr.to) ? dr : undefined };
  }), []);

  const clearAll = useCallback(() => setCriteria({}), []);

  const apply = () => {
    onApply(normalizeCriteria(criteria));
    onClose();
  };

  const applySaved = (sf) => {
    setCriteria(normalizeCriteria(sf.criteria || {}));
    // do NOT auto-close — user might tweak before applying
  };

  const removeSaved = async (sf) => {
    try {
      await savedFiltersRepo.remove(sf.id);
      setSaved((prev) => prev.filter((x) => x.id !== sf.id));
      toast(`Deleted: ${sf.name}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try {
            await savedFiltersRepo.restore(sf.id);
            const fresh = await savedFiltersRepo.list();
            setSaved(fresh);
          } catch (err) {
            logError('filtersheet:undo-remove', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (e) {
      logError('filtersheet.remove', e);
      Alert.alert('Delete failed', e?.message || String(e));
    }
  };

  const openSaveSheet = () => {
    if (!hasActiveFilters(criteria)) {
      Alert.alert('Nothing to save', 'Add at least one filter before saving.');
      return;
    }
    setSavingName(criteriaToHumanLabel(criteria, { categoryMap, merchantMap, tagMap }) || '');
    setShowSaveSheet(true);
  };

  const commitSave = async () => {
    const trimmed = savingName.trim();
    if (!trimmed) {
      Alert.alert('Name required');
      return;
    }
    try {
      const row = await savedFiltersRepo.create(trimmed, criteria);
      setSaved((prev) => [row, ...prev]);
      setShowSaveSheet(false);
    } catch (e) {
      logError('filtersheet.save', e);
      Alert.alert('Could not save filter', e.message || String(e));
    }
  };

  const presetActive = criteria.dateRange?.preset;
  const isCustomDate = !!criteria.dateRange && !presetActive;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            maxHeight: '88%', backgroundColor: F.bg,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingBottom: insets.bottom + 8,
          }}>
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: F.line }}/>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 4 }}>
            <Text style={{ fontSize: 20, color: F.ink, flex: 1 }}>Filters</Text>
            <TouchableOpacity onPress={clearAll} activeOpacity={0.6}>
              <Text style={{ fontSize: 13, color: F.coral }}>Clear all</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
            {/* Saved filters */}
            {saved.length > 0 && (
              <Section F={F} title="Saved">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                  {saved.map((sf) => (
                    <View key={sf.id} style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      backgroundColor: F.cream, borderRadius: 99,
                      paddingLeft: 12, paddingRight: 4, paddingVertical: 4,
                      borderWidth: 1, borderColor: F.line,
                    }}>
                      <TouchableOpacity onPress={() => applySaved(sf)} activeOpacity={0.7}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: F.ink }} numberOfLines={1}>{sf.name}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeSaved(sf)} activeOpacity={0.6}
                        style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 12, color: F.ink3 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </Section>
            )}

            <Section F={F} title="Category">
              <ChipRow>
                {(pots || []).map((p) => (
                  <Chip key={p.id} F={F}
                    active={(criteria.categoryIds || []).includes(p.id)}
                    onPress={() => toggleCategory(p.id)}>
                    {p.emoji} {p.name}
                  </Chip>
                ))}
              </ChipRow>
            </Section>

            <Section F={F} title="Date">
              <ChipRow>
                {PRESETS.map((p) => (
                  <Chip key={p.id} F={F}
                    active={p.id === 'custom' ? isCustomDate : presetActive === p.id || (p.id === 'all' && !criteria.dateRange)}
                    onPress={() => setPreset(p.id)}>
                    {p.label}
                  </Chip>
                ))}
              </ChipRow>
              {isCustomDate && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <DateField F={F} label="From" value={criteria.dateRange?.from || ''} onChange={(v) => setCustomDate('from', v)} />
                  <DateField F={F} label="To"   value={criteria.dateRange?.to   || ''} onChange={(v) => setCustomDate('to',   v)} />
                </View>
              )}
            </Section>

            <Section F={F} title="Amount">
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <NumberField F={F} label="Min" value={criteria.amountRange?.min ?? ''} onChange={(v) => setAmount('min', v)} />
                <NumberField F={F} label="Max" value={criteria.amountRange?.max ?? ''} onChange={(v) => setAmount('max', v)} />
              </View>
            </Section>

            <Section F={F} title="Merchant">
              {merchants.length === 0 ? (
                <Text style={{ fontSize: 12, color: F.ink3 }}>No merchants yet — scan a few receipts first.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                  <ChipRow wrap>
                    {merchants.map((m) => (
                      <Chip key={m.id} F={F}
                        active={(criteria.merchantIds || []).includes(m.id)}
                        onPress={() => toggleMerchant(m.id)}>
                        {m.canonical_name || m.name}
                      </Chip>
                    ))}
                  </ChipRow>
                </ScrollView>
              )}
            </Section>

            <Section F={F} title="Recurring">
              <ChipRow>
                <Chip F={F} active={criteria.recurring === true}  onPress={() => setRecurring(criteria.recurring === true  ? undefined : true )}>Recurring</Chip>
                <Chip F={F} active={criteria.recurring === false} onPress={() => setRecurring(criteria.recurring === false ? undefined : false)}>One-off</Chip>
              </ChipRow>
            </Section>

            <Section F={F} title="Receipt">
              <ChipRow>
                <Chip F={F} active={criteria.hasReceipt === true}  onPress={() => setHasReceipt(criteria.hasReceipt === true  ? undefined : true )}>With receipt</Chip>
                <Chip F={F} active={criteria.hasReceipt === false} onPress={() => setHasReceipt(criteria.hasReceipt === false ? undefined : false)}>No receipt</Chip>
              </ChipRow>
            </Section>

            <Section F={F} title="Mood">
              <ChipRow>
                {MOODS.map((m) => (
                  <Chip key={m} F={F}
                    active={(criteria.moods || []).includes(m)}
                    onPress={() => toggleMood(m)}>
                    <Text style={{ fontSize: 18 }}>{m}</Text>
                  </Chip>
                ))}
              </ChipRow>
            </Section>

            <Section F={F} title="Payment">
              <ChipRow wrap>
                {PAYMENT_METHODS.map((pm) => (
                  <Chip key={pm} F={F}
                    active={(criteria.paymentMethods || []).includes(pm)}
                    onPress={() => togglePayment(pm)}>
                    {PAYMENT_LABELS[pm]}
                  </Chip>
                ))}
              </ChipRow>
            </Section>

            {/* 7.3 — tags. OR semantics: any-of-these selection matches an
                expense that has at least one selected tag. */}
            <Section F={F} title="Tags">
              {tags.length === 0 ? (
                <Text style={{ fontSize: 12, color: F.ink3 }}>
                  No tags yet — add one when creating or editing an expense.
                </Text>
              ) : (
                <ChipRow wrap>
                  {tags.map((t) => (
                    <Chip key={t.id} F={F}
                      active={(criteria.tagIds || []).includes(t.id)}
                      onPress={() => toggleTag(t.id)}>
                      #{t.name}
                    </Chip>
                  ))}
                </ChipRow>
              )}
            </Section>
          </ScrollView>

          <View style={{
            flexDirection: 'row', gap: 10, alignItems: 'center',
            paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
            borderTopWidth: 1, borderTopColor: F.line, backgroundColor: F.bg,
          }}>
            <TouchableOpacity onPress={openSaveSheet} activeOpacity={0.7}
              style={{
                paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
                backgroundColor: F.cream, borderWidth: 1, borderColor: F.line,
              }}>
              <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>Save…</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={apply} activeOpacity={0.85}
              style={{
                flex: 1, paddingVertical: 14, borderRadius: 14,
                backgroundColor: F.coral, alignItems: 'center',
              }}>
              <Text style={{ fontSize: 14, color: '#fff', fontWeight: '700' }}>
                {matchCount == null ? 'Apply' : `Apply (${matchCount})`}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>

      <Modal visible={showSaveSheet} animationType="fade" transparent onRequestClose={() => setShowSaveSheet(false)}>
        <Pressable onPress={() => setShowSaveSheet(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <Pressable onPress={(e) => e.stopPropagation()}
            style={{ backgroundColor: F.bg, borderRadius: 20, padding: 22 }}>
            <Text style={{ fontSize: 18, color: F.ink, marginBottom: 10 }}>Save this filter</Text>
            <TextInput
              value={savingName}
              onChangeText={setSavingName}
              placeholder="e.g. Groceries · This month"
              placeholderTextColor={F.ink3}
              autoFocus
              style={{
                padding: 12, borderRadius: 12, borderWidth: 1, borderColor: F.line,
                backgroundColor: F.surface, fontSize: 15, color: F.ink, marginBottom: 14,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setShowSaveSheet(false)}
                style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: F.surface,
                  borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
                <Text style={{ color: F.ink, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={commitSave}
                style={{ flex: 2, padding: 12, borderRadius: 12, backgroundColor: F.coral, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

function Section({ F, title, children }) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function ChipRow({ children, wrap }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap', gap: 8 }}>
      {children}
    </View>
  );
}

function Chip({ F, active, onPress, children }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}
      style={{
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
        backgroundColor: active ? F.coral : F.cream,
        borderWidth: 1, borderColor: active ? F.coral : F.line,
      }}>
      <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500',
        color: active ? '#fff' : F.ink }}>{children}</Text>
    </TouchableOpacity>
  );
}

function NumberField({ F, label, value, onChange }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value === '' ? '' : String(value)}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="—"
        placeholderTextColor={F.ink3}
        style={{
          padding: 10, borderRadius: 10, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 14, color: F.ink,
        }}
      />
    </View>
  );
}

function DateField({ F, label, value, onChange }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value || ''}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={F.ink3}
        autoCapitalize="none"
        style={{
          padding: 10, borderRadius: 10, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, fontSize: 13, color: F.ink,
        }}
      />
    </View>
  );
}
