import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useSettings } from '@features/profile/settings.context';
import { useProfile } from '@features/profile/context';
import { expenses as expRepo } from '@features/expenses/repo';
import { items as itemRepo } from '@features/items/repo';
import FilterSheet from '@features/expenses/components/FilterSheet';
import { hasActiveFilters, criteriaToHumanLabel, normalizeCriteria } from '@features/expenses/filters';
import { potBg } from '../../../theme';
import { logError } from '@core/utils/log';

const DEBOUNCE_MS = 250;

function Search({ navigation }) {
  const { F } = useTheme();
  const { sym } = useSettings();
  const { recentSearches, pushRecentSearch, removeRecentSearch, clearRecentSearches } = useProfile();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState('expenses');     // 'expenses' | 'items'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [criteria, setCriteria] = useState({});     // 5.3 — search ∧ filter
  const [sheetOpen, setSheetOpen] = useState(false);

  const debounceRef = useRef(null);
  const reqIdRef = useRef(0);
  const lastQueryRef = useRef('');

  const runSearch = useCallback(async (raw, m, c) => {
    const q = String(raw || '').trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    const myId = ++reqIdRef.current;
    setSearching(true);
    try {
      const rows = m === 'items'
        ? await itemRepo.search({ query: q, limit: 100 })
        : await expRepo.search({ query: q, criteria: c, limit: 100 });
      if (myId !== reqIdRef.current) return;     // stale response — drop
      setResults(rows);
      // Persist into recents only after a successful query that returned ≥1 hit.
      // Fire-and-forget; the chain in ProfileProvider serialises writes.
      if (rows.length > 0 && lastQueryRef.current !== q.toLowerCase()) {
        lastQueryRef.current = q.toLowerCase();
        pushRecentSearch(q).catch((e) => logError('search.pushRecent', e));
      }
    } catch (e) {
      if (myId !== reqIdRef.current) return;
      logError('search.run', e);
      setResults([]);
    } finally {
      if (myId === reqIdRef.current) setSearching(false);
    }
  }, [pushRecentSearch]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    debounceRef.current = setTimeout(() => runSearch(query, mode, criteria), DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, mode, criteria, runSearch]);

  const showRecents = !query.trim();

  const onRecentTap = (q) => setQuery(q);
  const onRecentRemove = (q) => removeRecentSearch(q).catch((e) => logError('search.removeRecent', e));

  const openExpense = (id) => {
    navigation.replace('Detail', { id });
  };
  const openItem = (row) => {
    navigation.replace('ItemTrend', {
      normalizedName: row.normalized_name,
      displayName: row.name,
    });
  };

  const renderExpenseRow = ({ item: e }) => (
    <TouchableOpacity
      onPress={() => openExpense(e.id)}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
        backgroundColor: F.surface, borderBottomWidth: 1, borderBottomColor: F.line,
      }}>
      <View style={{
        width: 42, height: 42, borderRadius: 13,
        backgroundColor: potBg(F, e.category_color || 'cream'),
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 20 }}>{e.category_emoji || '💰'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }} numberOfLines={1}>{e.merchant}</Text>
        <Text style={{ fontSize: 12, color: F.ink2 }} numberOfLines={1}>
          {e.expense_date}{e.category_name ? ` · ${e.category_name}` : ''}
        </Text>
      </View>
      <Text style={{ fontSize: 15, color: F.ink }}>−{sym}{(e.amount || 0).toFixed(2)}</Text>
    </TouchableOpacity>
  );

  const renderItemRow = ({ item: r }) => (
    <TouchableOpacity
      onPress={() => openItem(r)}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
        backgroundColor: F.surface, borderBottomWidth: 1, borderBottomColor: F.line,
      }}>
      <View style={{
        width: 42, height: 42, borderRadius: 13,
        backgroundColor: potBg(F, r.category_color || 'cream'),
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 20 }}>{r.category_emoji || '🛒'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: F.ink }} numberOfLines={1}>{r.name}</Text>
        <Text style={{ fontSize: 12, color: F.ink2 }} numberOfLines={1}>
          {r.merchant || '—'} · {r.purchase_date}
        </Text>
      </View>
      <Text style={{ fontSize: 15, color: F.ink }}>{sym}{(r.price || 0).toFixed(2)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: F.bg, paddingTop: insets.top }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
      }}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.6}
          style={{ width: 40, height: 40, borderRadius: 12,
            backgroundColor: F.cream, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 18, color: F.ink }}>✕</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 22, color: F.ink, flex: 1 }}>Search</Text>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <ModePill active={mode === 'expenses'} onPress={() => setMode('expenses')} F={F}>Expenses</ModePill>
        <ModePill active={mode === 'items'}    onPress={() => setMode('items')}    F={F}>Items</ModePill>
        <View style={{ flex: 1 }}/>
        {mode === 'expenses' && (
          <TouchableOpacity onPress={() => setSheetOpen(true)} activeOpacity={0.75}
            style={{
              paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
              backgroundColor: hasActiveFilters(criteria) ? F.coral : F.cream,
              borderWidth: 1, borderColor: hasActiveFilters(criteria) ? F.coral : F.line,
            }}>
            <Text style={{ fontSize: 12, fontWeight: '700',
              color: hasActiveFilters(criteria) ? '#fff' : F.ink }}>
              🎚 {hasActiveFilters(criteria) ? criteriaToHumanLabel(criteria) : 'Filter'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: F.surface, borderRadius: 14,
          borderWidth: 1, borderColor: F.line, paddingHorizontal: 14, paddingVertical: 10,
        }}>
          <Text style={{ fontSize: 16, color: F.ink3 }}>🔍</Text>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={mode === 'items' ? 'Search items (milk, paneer…)' : 'Search merchant or notes'}
            placeholderTextColor={F.ink3}
            returnKeyType="search"
            onSubmitEditing={() => runSearch(query, mode)}
            style={{ flex: 1, fontSize: 15, color: F.ink, paddingVertical: 0 }}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.6}>
              <Text style={{ fontSize: 14, color: F.ink3 }}>✕</Text>
            </TouchableOpacity>
          )}
          {searching && <ActivityIndicator size="small" color={F.coral}/>}
        </View>
      </View>

      {showRecents ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
              Recent searches
            </Text>
            {recentSearches.length > 0 && (
              <TouchableOpacity onPress={() => clearRecentSearches().catch(() => {})} activeOpacity={0.6}>
                <Text style={{ fontSize: 12, color: F.coral }}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          {recentSearches.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Text style={{ fontSize: 36, marginBottom: 10 }}>🔍</Text>
              <Text style={{ fontSize: 14, color: F.ink2 }}>Start typing to search</Text>
              <Text style={{ fontSize: 12, color: F.ink3, marginTop: 4 }}>
                {mode === 'items'
                  ? 'Items by name (English / Hindi)'
                  : 'Merchant or note text'}
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: F.surface, borderRadius: 16, borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
              {recentSearches.map((q, i) => (
                <View key={`${q}-${i}`} style={{
                  flexDirection: 'row', alignItems: 'center',
                  borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                }}>
                  <TouchableOpacity onPress={() => onRecentTap(q)} activeOpacity={0.7}
                    style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 14 }}>
                    <Text style={{ fontSize: 14, color: F.ink }} numberOfLines={1}>🕘  {q}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onRecentRemove(q)} activeOpacity={0.5}
                    style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
                    <Text style={{ fontSize: 14, color: F.ink3 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : results.length === 0 && !searching ? (
        <View style={{ alignItems: 'center', paddingVertical: 60 }}>
          <Text style={{ fontSize: 36, marginBottom: 10 }}>🌾</Text>
          <Text style={{ fontSize: 14, color: F.ink2 }}>No matches for &ldquo;{query}&rdquo;</Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 4 }}>Try fewer or different words</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(row) => mode === 'items' ? `i-${row.id}` : `e-${row.id}`}
          renderItem={mode === 'items' ? renderItemRow : renderExpenseRow}
          ListHeaderComponent={() => (
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              <Text style={{ fontSize: 12, color: F.ink3 }}>
                {results.length} {results.length === 1 ? 'result' : 'results'}
              </Text>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <FilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onApply={(next) => setCriteria(normalizeCriteria(next))}
        initialCriteria={criteria}
      />
    </View>
  );
}

function ModePill({ active, onPress, F, children }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}
      style={{
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
        backgroundColor: active ? F.coral : F.cream,
        borderWidth: 1, borderColor: active ? F.coral : F.line,
      }}>
      <Text style={{
        fontSize: 12, fontWeight: active ? '700' : '500',
        color: active ? '#fff' : F.ink,
      }}>{children}</Text>
    </TouchableOpacity>
  );
}

export default React.memo(Search);
