import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { MoodPicker } from '@components/primitives/MoodPicker';
import PaymentPicker from '@components/primitives/PaymentPicker';
import ItemRows, { emptyRow, toPersistedItems, rowsTotal } from '@components/ItemRows';
import { merchants as merchantRepo } from '@features/expenses/merchants.repo';
import { expenses as expRepo } from '@features/expenses/repo';
import { aliases } from '@features/expenses/aliases.repo';
import { useTags } from '@features/tags/context';
import TagChipSurface from '@features/tags/components/TagChipSurface';
import { logError } from '@core/utils/log';
import { useToast } from '@components/Toast';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];
const MOODS = ['😍', '😌', '😐', '😬', '😞'];

// 5.14 — Convert a numeric amount into the keypad's X.YY string so the chip's
// auto-fill produces the same shape the user would have typed manually. The
// keypad's `press()` reducer expects exactly two decimal places.
export function formatAmountForKeypad(n) {
  if (!Number.isFinite(n) || n <= 0) return '0.00';
  return n.toFixed(2);
}

// 5.14 — Human-readable short date for the chip ("12 May"). YYYY-MM-DD is
// the storage shape; output local-month-and-day. Falls back to "" on bad
// input so the chip simply omits the date suffix.
export function formatChipDate(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${MONTHS[m - 1] || ''}`.trim();
}

function Add({ navigation, route }) {
  const { F, sym, pots, expenses, addExpense, addExpenseWithItems, addIncome, settings } = useApp();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  // 7.11 — optional prefill params from Home's "Expected this month" tile.
  // Read once on mount via useState initialisers so subsequent navigations
  // don't fight the user's edits.
  const prefill = route?.params || null;

  // 5.5 — top-level Expense | Income toggle. Income mode bypasses
  // pots/mood/recurring/items/payment and writes to the income table instead.
  const [kind, setKind] = useState('expense');
  const isIncome = kind === 'income';

  // Auto-select the most-recently used category. Falls back to the first pot
  // if there are no expenses yet, or if the last expense's category was deleted.
  const initialPotId = useMemo(() => {
    const lastCategoryId = expenses.find(e => e.category_id)?.category_id;
    if (lastCategoryId && pots.some(p => p.id === lastCategoryId)) return lastCategoryId;
    return pots[0]?.id || null;
  }, [expenses, pots]);

  // 5.4 — seed payment_method from the most recent expense that had one set
  // (matches QW-17's last-category pattern). Defaults to 'upi' on a clean
  // install: most common Indian retail payment, sensible default.
  const initialPayment = useMemo(() => {
    const last = expenses.find(e => e.payment_method);
    return last?.payment_method || 'upi';
  }, [expenses]);

  const [mode, setMode]         = useState('quick'); // 'quick' | 'detailed'
  const [amount, setAmount]     = useState(
    prefill?.prefillAmount != null ? formatAmountForKeypad(Number(prefill.prefillAmount)) : '0.00'
  );
  const [merchant, setMerchant] = useState(prefill?.prefillMerchant || '');
  const [potId, setPotId]       = useState(prefill?.prefillCategoryId ?? initialPotId);
  const [paymentMethod, setPaymentMethod] = useState(initialPayment);

  useEffect(() => {
    if (potId == null && initialPotId != null) setPotId(initialPotId);
  }, [initialPotId, potId]);
  const [moodIdx, setMoodIdx]   = useState(1);
  const [moodOn, setMoodOn]     = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [rows, setRows]         = useState([emptyRow({ unit: 'kg' })]);
  // 7.3 — per-entry tag selection (list of tag names). Cleared on save.
  const { tags: allTags, getOrCreateTag } = useTags();
  const [tagNames, setTagNames] = useState([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [pendingTagName, setPendingTagName] = useState('');

  // 5.9 — autocomplete + 5.10 — silent auto-cat.
  // `pickedMerchantId` is the merchants.id when the user tapped a dropdown
  // suggestion; falls back to null and the create() path re-resolves on save.
  // `userTouchedCategory` is the gate for silent auto-switching: once the user
  // taps a category pill, we never override their choice again in this session.
  const [merchantSuggestions, setMerchantSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const pickedMerchantIdRef = useRef(null);
  // 7.11 — when the user opened Add via the "Expected this month" tile, the
  // category is already an intentional pick; pre-set the touched flag so the
  // 5.10 silent auto-cat path can't override the prefill mid-typing.
  const userTouchedCategoryRef = useRef(prefill?.prefillCategoryId != null);
  const suggestReqIdRef = useRef(0);
  const debounceRef = useRef(null);

  // 5.14 — predictive amount. `lastSpend` is the most-recent expense at the
  // recognised merchant; `chipApplied` flips when the user taps the chip to
  // accept the prefill so a second tap can dismiss.
  const [lastSpend, setLastSpend] = useState(null);
  const [chipApplied, setChipApplied] = useState(false);
  const lastSpendReqIdRef = useRef(0);

  const lookupLastSpend = useCallback(async (merchantId) => {
    if (merchantId == null || isIncome) {
      setLastSpend(null);
      return;
    }
    const reqId = ++lastSpendReqIdRef.current;
    try {
      const row = await expRepo.lastAtMerchant(merchantId);
      if (reqId !== lastSpendReqIdRef.current) return;
      setLastSpend(row || null);
    } catch (err) {
      logError('add:last-spend', err);
    }
  }, [isIncome]);

  // Reset the category-touched gate when the user clears the merchant —
  // typing a new merchant should be eligible for the silent swap again.
  useEffect(() => {
    if (!merchant.trim()) {
      userTouchedCategoryRef.current = false;
      pickedMerchantIdRef.current = null;
      setLastSpend(null);
      setChipApplied(false);
    }
  }, [merchant]);

  const onMerchantChange = useCallback((text) => {
    setMerchant(text);
    pickedMerchantIdRef.current = null; // typing invalidates a prior pick
    // 5.14 — typing invalidates a prior chip too: the new text may resolve
    // to a different merchant (or none). The chip rehydrates from
    // pickSuggestion/applyAliasIfAny once the user picks/blurs.
    setLastSpend(null);
    setChipApplied(false);
    setShowSuggestions(text.trim().length > 0 && !isIncome);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim() || isIncome) {
      setMerchantSuggestions([]);
      return;
    }
    const reqId = ++suggestReqIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const list = await merchantRepo.suggest(text, { limit: 5 });
        if (reqId !== suggestReqIdRef.current) return; // stale
        setMerchantSuggestions(list);
      } catch (err) {
        logError('add:merchant-suggest', err);
      }
    }, 180);
  }, [/* isIncome captured below via stale-closure proof */]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply an alias hit silently: only swap the pot when the user hasn't
  // manually changed it. The auto-seeded `initialPotId` doesn't count as a
  // manual touch — we still want bundle/user aliases to override it.
  const applyAliasIfAny = useCallback(async (name, merchantId) => {
    if (isIncome) return;
    if (userTouchedCategoryRef.current) return;
    try {
      const hit = await aliases.lookup(name, { categories: pots });
      if (!hit) return;
      // Only swap if the suggested category actually exists in the user's pots
      // (guard against a stale alias pointing at a since-deleted category).
      if (pots.some((p) => p.id === hit.categoryId)) {
        setPotId(hit.categoryId);
      }
      if (hit.merchantId != null && pickedMerchantIdRef.current == null) {
        pickedMerchantIdRef.current = hit.merchantId;
      }
      // 5.14 — alias hit means we know the merchant id; surface the chip.
      if (hit.merchantId != null) {
        lookupLastSpend(hit.merchantId);
      }
    } catch (err) {
      logError('add:alias-lookup', err);
    }
  }, [isIncome, pots, lookupLastSpend]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickSuggestion = useCallback((s) => {
    setMerchant(s.name);
    pickedMerchantIdRef.current = s.id;
    setShowSuggestions(false);
    setMerchantSuggestions([]);
    setChipApplied(false);
    lookupLastSpend(s.id);
    applyAliasIfAny(s.name, s.id);
  }, [applyAliasIfAny, lookupLastSpend]);

  const onMerchantBlur = useCallback(() => {
    setShowSuggestions(false);
    if (!isIncome && merchant.trim()) {
      applyAliasIfAny(merchant.trim(), pickedMerchantIdRef.current);
    }
  }, [merchant, isIncome, applyAliasIfAny]);

  // 5.14 — Tap fills the keypad amount, second tap clears.
  const onChipPress = () => {
    if (!lastSpend) return;
    if (chipApplied) {
      setAmount('0.00');
      setChipApplied(false);
    } else {
      setAmount(formatAmountForKeypad(lastSpend.amount));
      setChipApplied(true);
    }
  };

  // 5.14 — show only while it's still helpful: a recognised merchant exists,
  // we're in expense mode, and the user hasn't already typed an amount that
  // wasn't from the chip itself.
  const chipVisible = !isIncome && !!lastSpend && (parseFloat(amount) === 0 || chipApplied);

  const press = (key) => {
    // 5.14 — any manual keypad press cancels the chip-applied state. The
    // chip itself stays visible (in case the user wants to retap to prefill
    // again) until the merchant clears or changes.
    if (chipApplied) setChipApplied(false);
    setAmount(prev => {
      if (key === '⌫') {
        const s = prev.replace('.', '').slice(0, -1) || '0';
        const p = s.padStart(3, '0');
        return `${parseInt(p.slice(0, -2), 10)}.${p.slice(-2)}`;
      }
      if (key === '.') return prev.includes('.') ? prev : prev + '.';
      const s = prev.replace('.', '') + key;
      const p = s.padStart(3, '0');
      return `${parseInt(p.slice(0, -2), 10)}.${p.slice(-2)}`;
    });
  };

  const selected = pots.find(p => p.id === potId);
  const itemsSum = useMemo(() => rowsTotal(rows), [rows]);

  const save = async () => {
    if (!merchant.trim()) {
      return Alert.alert(kind === 'income' ? 'Enter a source' : 'Enter a merchant name');
    }

    // 2.D.16 — snapshot whether this is the user's first-ever expense before
    // the save (after the optimistic patch lands, expenses.length will be 1
    // and we'd miss the gate). Income doesn't qualify — celebration is
    // specifically for the first spend.
    const isFirstEver = kind === 'expense' && expenses.length === 0;

    if (kind === 'income') {
      if (parseFloat(amount) === 0) return Alert.alert('Enter an amount');
      setSaving(true);
      try {
        await addIncome({
          source: merchant.trim(),
          amount: parseFloat(amount),
          recurring,
        });
        navigation.goBack();
      } catch (err) {
        Alert.alert('Could not save', err.message || String(err));
      } finally { setSaving(false); }
      return;
    }

    if (!selected) return Alert.alert('Pick a category');

    if (mode === 'quick') {
      if (parseFloat(amount) === 0) return Alert.alert('Enter an amount');
      setSaving(true);
      try {
        const saved = await addExpense({
          category_id: selected.id,
          merchant: merchant.trim(),
          merchant_id: pickedMerchantIdRef.current ?? undefined,
          amount: parseFloat(amount),
          mood: moodOn ? MOODS[moodIdx] : null,
          carbon: settings.carbon_tracking ? 0.4 : 0,
          recurring,
          payment_method: paymentMethod,
          tags: tagNames,
        });
        // 5.10 — every successful save reinforces the alias mapping so the
        // user's most recent choice wins the next time this merchant comes up.
        const mid = saved?.merchant_id ?? pickedMerchantIdRef.current ?? null;
        aliases.recordUserChoice({
          alias: merchant.trim(),
          merchantId: mid,
          categoryId: selected.id,
        }).catch((err) => logError('add:alias-record', err));
        if (isFirstEver) toast('🎉 First spend logged — welcome to Drift', { durationMs: 4500 });
        navigation.goBack();
      } catch (err) {
        Alert.alert('Could not save', err.message || String(err));
      } finally { setSaving(false); }
      return;
    }

    const items = toPersistedItems(rows);
    if (items.length === 0) return Alert.alert('Add at least one item');
    const total = +items.reduce((s, it) => s + it.price, 0).toFixed(2);
    setSaving(true);
    try {
      const saved = await addExpenseWithItems({
        expense: {
          category_id: selected.id,
          merchant: merchant.trim(),
          merchant_id: pickedMerchantIdRef.current ?? undefined,
          amount: total,
          mood: moodOn ? MOODS[moodIdx] : null,
          carbon: settings.carbon_tracking ? 0.4 : 0,
          recurring,
          payment_method: paymentMethod,
          tags: tagNames,
        },
        items,
      });
      const mid = saved?.merchant_id ?? pickedMerchantIdRef.current ?? null;
      aliases.recordUserChoice({
        alias: merchant.trim(),
        merchantId: mid,
        categoryId: selected.id,
      }).catch((err) => logError('add:alias-record', err));
      if (isFirstEver) toast('🎉 First spend logged — welcome to Drift', { durationMs: 4500 });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Could not save', err.message || String(err));
    } finally { setSaving(false); }
  };

  if (kind === 'expense' && pots.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: F.bg, padding: 24,
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>🍃</Text>
        <Text style={{ fontSize: 16, color: F.ink, fontWeight: '500' }}>No categories yet</Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginTop: 8, textAlign: 'center' }}>
          Add a category from Profile → Manage categories before logging spends.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 24, backgroundColor: F.coral, borderRadius: 12,
            paddingVertical: 12, paddingHorizontal: 32 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>OK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const heroAccent = isIncome ? F.sageD : F.ink;
  const ctaColor = isIncome ? F.sageD : F.coral;

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12,
        flexDirection: 'row', alignItems: 'center', backgroundColor: F.surface,
        borderBottomWidth: 1, borderBottomColor: F.line }}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Cancel and close">
          <Text style={{ color: F.ink2, fontSize: 16 }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, color: F.ink, fontWeight: '400' }}>
          {isIncome ? 'Add income' : 'Add a spend'}
        </Text>
        {/* Save lives on the bottom CTA — header right intentionally empty. */}
        <View style={{ width: 48 }}/>
      </View>

      {/* 5.5 — Expense | Income segmented toggle. Sits above Quick/Detailed so
          the rest of the form swaps wholesale when kind flips. */}
      <View style={{ flexDirection: 'row', backgroundColor: F.surface,
        paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 8 }}>
        {[['expense', 'Expense'], ['income', 'Income']].map(([k, l]) => {
          const sel = kind === k;
          return (
            <TouchableOpacity key={k} onPress={() => setKind(k)}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${l} mode`}
              accessibilityState={{ selected: sel }}
              style={{
                flex: 1, paddingVertical: 9, borderRadius: 99,
                backgroundColor: sel ? (k === 'income' ? F.sageD : F.ink) : F.cream,
                alignItems: 'center',
              }}>
              <Text style={{ fontSize: 13, color: sel ? '#fff' : F.ink2, fontWeight: sel ? '700' : '500' }}>{l}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!isIncome && (
        <View style={{ flexDirection: 'row', backgroundColor: F.surface,
          paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
          {[['quick', 'Quick'], ['detailed', 'Detailed']].map(([k, l]) => {
            const sel = mode === k;
            return (
              <TouchableOpacity key={k} onPress={() => setMode(k)}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${l} mode`}
                accessibilityState={{ selected: sel }}
                style={{
                  flex: 1, paddingVertical: 9, borderRadius: 99,
                  backgroundColor: sel ? F.ink : F.cream,
                  alignItems: 'center',
                }}>
                <Text style={{ fontSize: 13, color: sel ? '#fff' : F.ink2, fontWeight: sel ? '700' : '500' }}>{l}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <ScrollView style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: (!isIncome && mode === 'detailed') ? insets.bottom + 100 : 12 }}>

        {(isIncome || mode === 'quick') ? (
          <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 24, marginTop: 16,
            alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: F.ink2 }}>{isIncome ? 'I earned' : 'I spent'}</Text>
            <Text style={{ fontSize: 56, color: heroAccent, fontWeight: '400', marginTop: 4 }}>
              {sym}{amount.split('.')[0]}
              <Text style={{ fontSize: 30, color: F.ink3 }}>.{(amount.split('.')[1] || '00').slice(0, 2)}</Text>
            </Text>
            <TextInput value={merchant} onChangeText={isIncome ? setMerchant : onMerchantChange}
              onBlur={isIncome ? undefined : onMerchantBlur}
              placeholder={isIncome ? 'Source (e.g. Salary)' : 'Merchant name'}
              placeholderTextColor={F.ink3}
              style={{ marginTop: 12, borderBottomWidth: 1, borderBottomColor: F.ink3,
                textAlign: 'center', fontSize: 15, color: F.ink, paddingBottom: 4, width: '80%' }}/>
            {!isIncome && showSuggestions && merchantSuggestions.length > 0 && (
              <View style={{ marginTop: 10, alignSelf: 'stretch', backgroundColor: F.surface,
                borderRadius: 14, borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
                {merchantSuggestions.map((s, i) => (
                  <TouchableOpacity key={s.id} onPress={() => pickSuggestion(s)}
                    style={{ paddingHorizontal: 14, paddingVertical: 10,
                      borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
                    <Text style={{ fontSize: 14, color: F.ink }}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {chipVisible && (
              <LastSpendChip F={F} sym={sym} row={lastSpend} applied={chipApplied} onPress={onChipPress}/>
            )}
          </View>
        ) : (
          <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 18, marginTop: 16 }}>
            <Text style={{ fontSize: 11, color: F.ink2, marginBottom: 4 }}>MERCHANT</Text>
            <TextInput value={merchant} onChangeText={onMerchantChange}
              onBlur={onMerchantBlur}
              placeholder="e.g. Mandi House" placeholderTextColor={F.ink3}
              style={{ borderBottomWidth: 1, borderBottomColor: F.ink3,
                fontSize: 18, color: F.ink, paddingBottom: 6, marginBottom: 14 }}/>
            {showSuggestions && merchantSuggestions.length > 0 && (
              <View style={{ marginTop: -8, marginBottom: 12, backgroundColor: F.surface,
                borderRadius: 14, borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
                {merchantSuggestions.map((s, i) => (
                  <TouchableOpacity key={s.id} onPress={() => pickSuggestion(s)}
                    style={{ paddingHorizontal: 14, paddingVertical: 10,
                      borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
                    <Text style={{ fontSize: 14, color: F.ink }}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {chipVisible && (
              <View style={{ marginBottom: 12 }}>
                <LastSpendChip F={F} sym={sym} row={lastSpend} applied={chipApplied} onPress={onChipPress}/>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <Text style={{ fontSize: 11, color: F.ink2 }}>TOTAL (auto)</Text>
                <Text style={{ fontSize: 32, color: F.coral, fontWeight: '600', marginTop: 2 }}>
                  {sym}{itemsSum.toFixed(2)}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 6 }}>
                {rows.filter(r => r.name.trim()).length} item{rows.filter(r => r.name.trim()).length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
        )}

        {!isIncome && (
          <>
            <Text style={{ fontSize: 15, color: F.ink, marginTop: 20, marginBottom: 10 }}>What kind?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>
                {pots.map(p => {
                  const sel = potId === p.id;
                  return (
                    <TouchableOpacity key={p.id} onPress={() => {
                      userTouchedCategoryRef.current = true; // 5.10 — gate silent auto-cat
                      setPotId(p.id);
                    }}
                      style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 99,
                        backgroundColor: sel ? F.coral : F.surface,
                        borderWidth: 1, borderColor: sel ? F.coral : F.line,
                        flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 14 }}>{p.emoji}</Text>
                      <Text style={{ fontSize: 13, color: sel ? '#fff' : F.ink, fontWeight: sel ? '600' : '500' }}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={{ fontSize: 15, color: F.ink, marginTop: 20, marginBottom: 10 }}>Paid with?</Text>
            <PaymentPicker value={paymentMethod} onChange={setPaymentMethod} F={F}/>

            {mode === 'detailed' && (
              <View style={{ marginTop: 18 }}>
                <Text style={{ fontSize: 15, color: F.ink, marginBottom: 10 }}>Items</Text>
                <ItemRows rows={rows} onChange={setRows} F={F} sym={sym}/>
              </View>
            )}

            <Text style={{ fontSize: 15, color: F.ink, marginTop: 20, marginBottom: 10 }}>How did it feel?</Text>
            <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 16,
              borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
              <MoodPicker
                selected={moodOn}
                value={moodIdx}
                onChange={(i) => { setMoodIdx(i); setMoodOn(true); }}
                onClear={moodOn ? () => setMoodOn(false) : undefined}
                F={F}/>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {settings.carbon_tracking ? (
                <View style={{ flex: 1, backgroundColor: F.mint, borderRadius: 18, padding: 14 }}>
                  <Text style={{ fontSize: 11, color: F.ink2 }}>🌱 Carbon</Text>
                  <Text style={{ fontSize: 20, color: F.sageD, marginTop: 6 }}>0.4 kg</Text>
                  <Text style={{ fontSize: 10, color: F.ink3 }}>low impact ✿</Text>
                </View>
              ) : <View style={{ flex: 1 }}/>}
              <TouchableOpacity onPress={() => setRecurring(!recurring)}
                style={{ flex: 1, backgroundColor: recurring ? F.lilac : F.sky, borderRadius: 18, padding: 14 }}>
                <Text style={{ fontSize: 11, color: F.ink2 }}>🔄 Repeat?</Text>
                <Text style={{ fontSize: 14, color: F.ink, marginTop: 6, fontWeight: '500' }}>
                  {recurring ? 'Every month' : 'Just once'}
                </Text>
                <Text style={{ fontSize: 10, color: F.ink3 }}>tap to toggle</Text>
              </TouchableOpacity>
            </View>

            <TagChipSurface
              F={F}
              allTags={allTags}
              tagNames={tagNames}
              setTagNames={setTagNames}
              showTagInput={showTagInput}
              setShowTagInput={setShowTagInput}
              pendingTagName={pendingTagName}
              setPendingTagName={setPendingTagName}
              getOrCreateTag={getOrCreateTag}
              style={{ marginBottom: 24 }}
            />
          </>
        )}

        {isIncome && (
          <TouchableOpacity onPress={() => setRecurring(!recurring)}
            style={{ marginTop: 20, padding: 14, borderRadius: 18,
              backgroundColor: recurring ? F.lilac : F.sky, marginBottom: 16 }}>
            <Text style={{ fontSize: 11, color: F.ink2 }}>🔄 Recurring?</Text>
            <Text style={{ fontSize: 14, color: F.ink, marginTop: 6, fontWeight: '500' }}>
              {recurring ? 'Yes — every month' : 'No — one-off'}
            </Text>
            <Text style={{ fontSize: 10, color: F.ink3 }}>tap to toggle</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {(isIncome || mode === 'quick') && (
        <View style={{ backgroundColor: F.surface, borderTopWidth: 1, borderTopColor: F.line,
          paddingHorizontal: 12, paddingTop: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {KEYS.map(k => (
              <TouchableOpacity key={k} onPress={() => press(k)} activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={k === '⌫' ? 'Backspace' : k === '.' ? 'Decimal point' : `Digit ${k}`}
                style={{ width: '33.33%', paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ fontSize: k === '⌫' ? 20 : 24, color: F.ink, fontWeight: '400' }}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={{ backgroundColor: F.surface, borderTopWidth: 1, borderTopColor: F.line,
        paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 12 }}>
        <TouchableOpacity
          onPress={save}
          disabled={saving}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={saving ? 'Saving' : 'Save'}
          style={{
            backgroundColor: ctaColor, borderRadius: 14, paddingVertical: 16,
            alignItems: 'center', opacity: saving ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
            {saving
              ? 'Saving…'
              : isIncome
                ? `Save · ${sym}${amount}`
                : mode === 'quick'
                  ? `Save · ${sym}${amount}`
                  : `Save · ${sym}${itemsSum.toFixed(2)}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// 5.14 — small dismissible chip showing the user's last amount at the
// recognised merchant. Acts on a single row from `expenses.lastAtMerchant`.
// Tapping prefills the keypad; tapping again (when `applied`) clears it.
function LastSpendChip({ F, sym, row, applied, onPress }) {
  if (!row) return null;
  const dateStr = formatChipDate(row.expense_date);
  const amount = `${sym}${Number(row.amount).toFixed(2)}`;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        marginTop: 12, alignSelf: 'center',
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: applied ? F.coral : F.cream,
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
        borderWidth: 1, borderColor: applied ? F.coral : F.line,
      }}>
      <Text style={{ fontSize: 14 }}>{applied ? '✓' : '🕒'}</Text>
      <Text style={{ fontSize: 13, color: applied ? '#fff' : F.ink, fontWeight: applied ? '600' : '500' }}>
        Last time: {amount}
        {dateStr ? ` · ${dateStr}` : ''}
      </Text>
    </TouchableOpacity>
  );
}

export default React.memo(Add);
