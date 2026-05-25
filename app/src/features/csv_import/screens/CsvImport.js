// 7.15 — CSV import entry screen.
//
// Tap "Pick CSV" → expo-document-picker → read file → detectFormat → if
// recognized, parseCSV → push to CsvReview. If the file can't be read or
// the format is unknown, show an inline error with a "Pick another file"
// affordance.

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { parseCSV, detectFormat } from '@features/csv_import/parsers';
import { csvImportsRepo } from '@features/csv_import/repo';
import { logError } from '@core/utils/log';

let DocumentPicker = null;
let FileSystem = null;
try { DocumentPicker = require('expo-document-picker'); } catch (_) {}
try { FileSystem    = require('expo-file-system'); } catch (_) {}

function fmtDate(iso) {
  if (!iso) return '';
  return String(iso).replace('T', ' ').slice(0, 16);
}

function CsvImport({ navigation }) {
  const { F } = useTheme();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState(null);
  const [busy, setBusy]   = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await csvImportsRepo.list({ limit: 10 });
        if (!cancelled) setHistory(rows);
      } catch (_) { /* table may not exist yet in dev */ }
    })();
    return () => { cancelled = true; };
  }, []);

  async function pickFile() {
    setError(null);
    if (!DocumentPicker || !FileSystem) {
      setError('Document picker not available on this build. Rebuild with expo-document-picker installed.');
      return;
    }
    setBusy(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled) { setBusy(false); return; }
      const asset = res.assets?.[0];
      if (!asset) { setBusy(false); return; }
      const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'utf8' });
      const fmt = detectFormat(text);
      if (fmt === 'unknown') {
        setError('Unrecognised CSV format. Drift currently supports HDFC, SBI, and ICICI credit card statements.');
        setBusy(false);
        return;
      }
      const parsed = parseCSV(text);
      if (parsed.error) {
        setError(parsed.error);
        setBusy(false);
        return;
      }
      navigation.navigate('CsvReview', {
        format: parsed.format,
        rows: parsed.rows,
        filename: asset.name || null,
      });
    } catch (err) {
      logError('csv_import:pick', err);
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 60, paddingHorizontal: 20 }}>

      <Text style={{ fontSize: 24, color: F.ink, marginBottom: 8 }}>Import CSV statement</Text>
      <Text style={{ fontSize: 13, color: F.ink3, marginBottom: 22 }}>
        Pick a downloaded bank statement and Drift will parse the rows, flag duplicates,
        and let you review before importing as expenses.
      </Text>

      <View style={{ backgroundColor: F.cream, borderRadius: 18, padding: 16,
        borderWidth: 1, borderColor: F.line, marginBottom: 20 }}>
        <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>
          SUPPORTED FORMATS
        </Text>
        <Text style={{ fontSize: 13, color: F.ink, lineHeight: 20 }}>
          • HDFC Bank savings statement (CSV){'\n'}
          • State Bank of India savings statement (CSV){'\n'}
          • ICICI credit card statement (CSV)
        </Text>
        <Text style={{ fontSize: 11, color: F.ink3, marginTop: 8 }}>
          Other banks coming later. The format is auto-detected from the file header.
        </Text>
      </View>

      <TouchableOpacity onPress={pickFile} disabled={busy}
        activeOpacity={0.85}
        style={{ padding: 18, borderRadius: 14, backgroundColor: F.coral,
          alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
          {busy ? 'Reading…' : '📥 Pick CSV file'}
        </Text>
      </TouchableOpacity>

      {error && (
        <View style={{ marginTop: 14, padding: 14, borderRadius: 12,
          backgroundColor: '#fde2dd', borderWidth: 1, borderColor: F.coral }}>
          <Text style={{ color: F.coral, fontSize: 13, fontWeight: '600', marginBottom: 4 }}>
            Could not parse
          </Text>
          <Text style={{ color: F.ink, fontSize: 13 }}>{error}</Text>
        </View>
      )}

      {history.length > 0 && (
        <View style={{ marginTop: 28 }}>
          <Text style={{ fontSize: 13, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>
            RECENT IMPORTS
          </Text>
          {history.map((h) => (
            <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              padding: 12, borderRadius: 12, backgroundColor: F.surface,
              borderWidth: 1, borderColor: F.line, marginBottom: 8 }}>
              <Text style={{ fontSize: 18 }}>📥</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: F.ink, fontWeight: '500' }}>
                  {h.format.toUpperCase()} · {h.imported_rows} imported
                </Text>
                <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                  {fmtDate(h.imported_at)}
                  {h.filename && ` · ${h.filename}`}
                  {h.skipped_rows > 0 && ` · ${h.skipped_rows} skipped`}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

export default React.memo(CsvImport);
