// 5.7 — Export modal. Date range + entity toggles + format buttons. Reads
// from expenses/items/income repos via the shared `criteria` shape so the
// same screen drives both full-corpus exports (from Profile) and the 5.8
// batch-export path (with `route.params.ids` pre-seeded).
//
// Native deps: expo-sharing (already installed), expo-print (new — needs
// `npx expo install expo-print` + Android rebuild). Both are lazy-required
// so Metro doesn't choke before the rebuild lands.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@core/theme/ThemeContext';
import { useSettings } from '@features/profile/settings.context';
import { Toggle } from '@components/primitives/Toggle';
import { expenses as expRepo } from '@features/expenses/repo';
import { items as itemRepo } from '@features/items/repo';
import { income as incRepo } from '@features/income/repo';
import { presetToDateRange } from '@features/expenses/filters';
import {
  bundleToCSV, bundleToJSON, bundleToHTML, humanFilename, MIME_TYPES,
} from '@features/expenses/export';
import { logError } from '@core/utils/log';

const PRESETS = [
  { id: 'last30',    label: 'Last 30 days' },
  { id: 'last3',     label: 'Last 3 months' },
  { id: 'last12',    label: 'Last 12 months' },
  { id: 'ytd',       label: 'Year to date' },
  { id: 'all',       label: 'All time' },
  { id: 'custom',    label: 'Custom' },
];

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Returns {from, to, label} for a preset id. `last30` is window-based so
// presetToDateRange (which is calendar-month based) isn't quite right for it
// — handle the day-window presets here and defer calendar ones to filters.js.
function resolvePreset(id) {
  const today = new Date();
  if (id === 'all') return { from: null, to: null, label: 'All time' };
  if (id === 'last30') {
    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    return { from: isoDate(from), to: isoDate(today), label: 'Last 30 days' };
  }
  if (id === 'last12') {
    const from = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    return { from: isoDate(from), to: isoDate(today), label: 'Last 12 months' };
  }
  if (id === 'last3') {
    const r = presetToDateRange('last3', today);
    return { from: r.from, to: r.to, label: 'Last 3 months' };
  }
  if (id === 'ytd') {
    return { from: `${today.getFullYear()}-01-01`, to: isoDate(today), label: 'Year to date' };
  }
  return { from: null, to: null, label: 'All time' };
}

function monthsBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return Infinity;
  const [fy, fm] = fromIso.split('-').map(Number);
  const [ty, tm] = toIso.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

export default function Export({ navigation, route }) {
  const { F } = useTheme();
  const { sym } = useSettings();
  const insets = useSafeAreaInsets();

  // 5.8 — when launched with route.params.ids, lock the export to that
  // selection and skip the date-range UI entirely.
  const lockedIds = useMemo(
    () => Array.isArray(route?.params?.ids) ? route.params.ids.filter(Number.isFinite) : null,
    [route?.params?.ids]
  );
  const isBatchMode = lockedIds && lockedIds.length > 0;

  const [presetId, setPresetId] = useState('last12');
  const [customFrom, setCustomFrom] = useState(null); // 'YYYY-MM-DD' or null
  const [customTo, setCustomTo]     = useState(null);
  const [pickerOpen, setPickerOpen] = useState(null); // 'from' | 'to' | null

  const [includeExpenses, setIncludeExpenses] = useState(true);
  const [includeItems, setIncludeItems]       = useState(true);
  const [includeIncome, setIncludeIncome]     = useState(!isBatchMode); // 5.8: ids never reach income

  const [busy, setBusy]   = useState(null); // 'csv' | 'json' | 'pdf' | null
  const [counts, setCounts] = useState({ exp: null, item: null, inc: null });

  // Resolve the active range. In batch mode the range is "selected" (no
  // dateRange criterion at all — ids handle row selection).
  const range = useMemo(() => {
    if (isBatchMode) return { from: null, to: null, label: `${lockedIds.length} selected` };
    if (presetId === 'custom') {
      return {
        from: customFrom,
        to: customTo,
        label: customFrom && customTo
          ? `${customFrom} → ${customTo}`
          : customFrom ? `From ${customFrom}` : customTo ? `Through ${customTo}` : 'Custom',
      };
    }
    return resolvePreset(presetId);
  }, [isBatchMode, lockedIds, presetId, customFrom, customTo]);

  // Build the shared criteria object passed to each repo.listForExport.
  const criteria = useMemo(() => {
    const c = {};
    if (isBatchMode) {
      c.ids = lockedIds;
    } else if (range.from || range.to) {
      c.dateRange = { from: range.from || undefined, to: range.to || undefined };
    }
    return c;
  }, [isBatchMode, lockedIds, range]);

  // Live counts so the user sees what each format will contain before tapping.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [eN, iRows, incRows] = await Promise.all([
          expRepo.count({ criteria }),
          itemRepo.listForExport({ criteria, limit: 5000 }),
          isBatchMode
            ? Promise.resolve([])
            : incRepo.listForExport({ criteria, limit: 5000 }),
        ]);
        if (!cancelled) setCounts({ exp: eN, item: iRows.length, inc: incRows.length });
      } catch (e) {
        if (!cancelled) setCounts({ exp: 0, item: 0, inc: 0 });
        logError('export.counts', e);
      }
    })();
    return () => { cancelled = true; };
  }, [criteria, isBatchMode]);

  const fetchAll = useCallback(async () => {
    const out = {};
    if (includeExpenses) out.expenses = await expRepo.list({ criteria, limit: 5000 });
    if (includeItems)    out.items    = await itemRepo.listForExport({ criteria, limit: 5000 });
    if (includeIncome && !isBatchMode) {
      out.income = await incRepo.listForExport({ criteria, limit: 5000 });
    }
    return out;
  }, [criteria, includeExpenses, includeItems, includeIncome, isBatchMode]);

  const share = useCallback(async (uri, mimeType, dialogTitle) => {
    let Sharing;
    try {
      Sharing = require('expo-sharing');
    } catch (e) {
      Alert.alert('Sharing unavailable',
        `Install \`expo-sharing\` in app/ to enable share-sheet. File saved at:\n${uri}`);
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Sharing unavailable', `The OS doesn't expose a share sheet on this device. File saved at:\n${uri}`);
      return;
    }
    await Sharing.shareAsync(uri, { mimeType, dialogTitle });
  }, []);

  const writeText = useCallback(async (text, filename) => {
    let FileSystem;
    try {
      FileSystem = require('expo-file-system/legacy');
    } catch (e) {
      throw new Error('expo-file-system not available');
    }
    const path = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(path, text);
    return path;
  }, []);

  const runExport = useCallback(async (format) => {
    if (busy) return;
    if (!includeExpenses && !includeItems && !(includeIncome && !isBatchMode)) {
      Alert.alert('Nothing selected', 'Toggle at least one entity to include in the export.');
      return;
    }
    // PDF soft cap — discourage > 12-month exports because the HTML renderer
    // gets unwieldy. Not a hard block; user can override.
    if (format === 'pdf' && !isBatchMode) {
      const span = monthsBetween(range.from, range.to);
      if (!Number.isFinite(span) || span > 12) {
        const proceed = await new Promise((resolve) => {
          Alert.alert(
            'Large PDF',
            'PDF export is best with 12 months or less. CSV / JSON handle longer ranges more reliably.',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue', onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) return;
      }
    }

    setBusy(format);
    try {
      const { expenses, items, income } = await fetchAll();
      const generatedAt = new Date().toISOString();
      const meta = { generatedAt, rangeLabel: range.label };

      if (format === 'csv') {
        const text = bundleToCSV({ expenses, items, income, meta });
        const path = await writeText(text, humanFilename({ format: 'csv', rangeLabel: range.label, generatedAt }));
        await share(path, MIME_TYPES.csv, 'Share Drift export');
        return;
      }
      if (format === 'json') {
        const text = bundleToJSON({ expenses, items, income, meta });
        const path = await writeText(text, humanFilename({ format: 'json', rangeLabel: range.label, generatedAt }));
        await share(path, MIME_TYPES.json, 'Share Drift export');
        return;
      }
      if (format === 'pdf') {
        const html = bundleToHTML({ expenses, items, income, meta, sym });
        let Print;
        try {
          Print = require('expo-print');
        } catch (e) {
          Alert.alert('PDF unavailable',
            'Install `expo-print` in app/ and rebuild Android to enable PDF export. CSV and JSON still work.');
          return;
        }
        const { uri } = await Print.printToFileAsync({ html });
        await share(uri, MIME_TYPES.pdf, 'Share Drift export');
      }
    } catch (e) {
      logError('export.run', e);
      Alert.alert('Export failed', e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }, [busy, includeExpenses, includeItems, includeIncome, isBatchMode, range, fetchAll, share, writeText, sym]);

  const onCustomChange = (which, _event, date) => {
    setPickerOpen(null);
    if (!date) return;
    const iso = isoDate(date);
    if (which === 'from') setCustomFrom(iso);
    else setCustomTo(iso);
  };

  return (
    <View style={{ flex: 1, backgroundColor: F.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
        paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: F.line }}>
        <Text style={{ flex: 1, fontSize: 20, color: F.ink }}>Export your data</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}
          style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ fontSize: 18, color: F.ink2 }}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {isBatchMode ? (
          <View style={{ backgroundColor: F.cream, borderRadius: 16, padding: 14, marginBottom: 18 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: F.ink3, letterSpacing: 1,
              textTransform: 'uppercase' }}>Selection</Text>
            <Text style={{ fontSize: 20, color: F.ink, marginTop: 4 }}>
              {lockedIds.length} selected spend{lockedIds.length === 1 ? '' : 's'}
            </Text>
            <Text style={{ fontSize: 12, color: F.ink2, marginTop: 2 }}>
              Income is not included in a batch export.
            </Text>
          </View>
        ) : (
          <View style={{ marginBottom: 18 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
              textTransform: 'uppercase', marginBottom: 8 }}>Date range</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PRESETS.map((p) => {
                const active = presetId === p.id;
                return (
                  <TouchableOpacity key={p.id} onPress={() => setPresetId(p.id)} activeOpacity={0.75}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
                      backgroundColor: active ? F.coral : F.cream,
                      borderWidth: 1, borderColor: active ? F.coral : F.line,
                    }}>
                    <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500',
                      color: active ? '#fff' : F.ink }}>{p.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {presetId === 'custom' && (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <TouchableOpacity onPress={() => setPickerOpen('from')} activeOpacity={0.75}
                  style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: F.line, backgroundColor: F.surface }}>
                  <Text style={{ fontSize: 10, color: F.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>From</Text>
                  <Text style={{ fontSize: 14, color: F.ink, marginTop: 2 }}>{customFrom || 'Pick'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPickerOpen('to')} activeOpacity={0.75}
                  style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: F.line, backgroundColor: F.surface }}>
                  <Text style={{ fontSize: 10, color: F.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>To</Text>
                  <Text style={{ fontSize: 14, color: F.ink, marginTop: 2 }}>{customTo || 'Pick'}</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={{ fontSize: 12, color: F.ink2, marginTop: 10 }}>Range: {range.label}</Text>
          </View>
        )}

        <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
          textTransform: 'uppercase', marginBottom: 8 }}>Include</Text>
        <View style={{ backgroundColor: F.surface, borderRadius: 16, borderWidth: 1,
          borderColor: F.line, marginBottom: 18, overflow: 'hidden' }}>
          <ToggleRow F={F} icon="💸" label="Spends" sub={counts.exp == null ? '—' : `${counts.exp} row${counts.exp === 1 ? '' : 's'}`}
            value={includeExpenses} onChange={setIncludeExpenses}/>
          <ToggleRow F={F} icon="🧾" label="Items" sub={counts.item == null ? '—' : `${counts.item} row${counts.item === 1 ? '' : 's'}`}
            value={includeItems} onChange={setIncludeItems}/>
          {!isBatchMode && (
            <ToggleRow F={F} icon="💰" label="Income" sub={counts.inc == null ? '—' : `${counts.inc} row${counts.inc === 1 ? '' : 's'}`}
              value={includeIncome} onChange={setIncludeIncome}/>
          )}
        </View>

        <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
          textTransform: 'uppercase', marginBottom: 8 }}>Format</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <FormatButton F={F} label="CSV" sub="Spreadsheet" emoji="📄" busy={busy === 'csv'} disabled={!!busy}
            onPress={() => runExport('csv')}/>
          <FormatButton F={F} label="JSON" sub="Combined data" emoji="📋" busy={busy === 'json'} disabled={!!busy}
            onPress={() => runExport('json')}/>
          <FormatButton F={F} label="PDF" sub="Statement" emoji="📑" busy={busy === 'pdf'} disabled={!!busy}
            onPress={() => runExport('pdf')}/>
        </View>

        <Text style={{ fontSize: 12, color: F.ink3, marginTop: 16, lineHeight: 18 }}>
          Files are written to your device's cache and shared via the OS share sheet — nothing leaves the device unless you send it.
        </Text>
      </ScrollView>

      {pickerOpen && (
        <DateTimePicker
          value={(() => {
            const v = pickerOpen === 'from' ? customFrom : customTo;
            return v ? new Date(`${v}T00:00:00`) : new Date();
          })()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={new Date()}
          onChange={(event, date) => onCustomChange(pickerOpen, event, date)}
        />
      )}
    </View>
  );
}

function ToggleRow({ F, icon, label, sub, value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14,
      borderTopWidth: 0, borderColor: F.line }}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: 12, color: F.ink2 }}>{sub}</Text>
      </View>
      <Toggle value={value} onChange={onChange} F={F}/>
    </View>
  );
}

function FormatButton({ F, label, sub, emoji, busy, disabled, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} disabled={disabled}
      style={{
        flex: 1, padding: 14, borderRadius: 16,
        backgroundColor: disabled && !busy ? F.cream : F.surface,
        borderWidth: 1, borderColor: busy ? F.coral : F.line,
        alignItems: 'center', gap: 4,
        opacity: disabled && !busy ? 0.6 : 1,
      }}>
      {busy ? (
        <ActivityIndicator size="small" color={F.coral}/>
      ) : (
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
      )}
      <Text style={{ fontSize: 13, color: F.ink, fontWeight: '700' }}>{label}</Text>
      <Text style={{ fontSize: 10, color: F.ink3 }}>{busy ? 'Working…' : sub}</Text>
    </TouchableOpacity>
  );
}
