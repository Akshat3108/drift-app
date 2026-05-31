// 8.10 — Hidden Diagnostics screen.
//
// Reachable via 5-tap on the "Drift v1.0.0 · 100% offline" Profile footer
// (not registered in any nav menu). Surfaces:
//   * Per-label aggregates from `db_stats`, sorted by total_ms desc
//   * Last 50 slow-query rows from `db_slow_log` (dev-only writes)
//   * Tap a slow-log row to expand the full SQL
//   * Footer buttons: clear stats, clear slow log
//
// All reads go through `all()`/`one()` which themselves write into
// db_stats — so the screen sees its own activity reflected on refresh.
// That's intentional; it gives an at-a-glance signal that the wrapper
// is wired up.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, Modal, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { all, one, exec } from '../../../db';
import { logError } from '@core/utils/log';

// Mirrors app.json's version (same hardcode as the Profile footer — no
// expo-constants dep in this project). Bump both together.
const APP_VERSION = '1.0.0';

function StatRow({ row, F }) {
  const avg = row.call_count > 0 ? (row.total_ms / row.call_count).toFixed(1) : '0.0';
  return (
    <View style={{ paddingVertical: 10, paddingHorizontal: 14,
      borderBottomWidth: 1, borderBottomColor: F.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: F.ink, flex: 1 }} numberOfLines={1}>
          {row.label}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: F.coral, marginLeft: 8 }}>
          {row.total_ms}ms
        </Text>
      </View>
      <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
        {row.call_count}× · avg {avg}ms · max {row.max_ms}ms
        {row.slow_count > 0 ? ` · ${row.slow_count} slow` : ''}
      </Text>
    </View>
  );
}

function SlowRow({ row, expanded, onToggle, F }) {
  return (
    <TouchableOpacity onPress={onToggle} activeOpacity={0.7}
      style={{ paddingVertical: 10, paddingHorizontal: 14,
        borderBottomWidth: 1, borderBottomColor: F.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontSize: 12, color: F.ink2, flex: 1 }} numberOfLines={1}>
          {row.label}
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: F.coral, marginLeft: 8 }}>
          {row.duration_ms}ms
        </Text>
      </View>
      <Text style={{ fontSize: 10, color: F.ink3, marginTop: 2 }}>
        {row.occurred_at}
      </Text>
      {expanded && (
        <Text style={{ fontSize: 11, color: F.ink2, marginTop: 6,
          fontFamily: 'monospace' }}>
          {row.sql}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function Diagnostics() {
  const { F } = useTheme();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState([]);
  const [slow, setSlow] = useState([]);
  const [schemaV, setSchemaV] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // PS-50 — fallback modal when no mail client can handle the mailto: intent.
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, l, sv] = await Promise.all([
        all(`SELECT label, call_count, total_ms, max_ms, slow_count, last_run_at
             FROM db_stats ORDER BY total_ms DESC LIMIT 100`),
        all(`SELECT id, label, sql, duration_ms, occurred_at
             FROM db_slow_log ORDER BY id DESC LIMIT 50`),
        one(`SELECT COALESCE(MAX(version), 0) AS v FROM schema_version`),
      ]);
      setStats(s || []);
      setSlow(l || []);
      setSchemaV(sv?.v ?? 0);
    } catch (e) { logError('diagnostics:load', e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const clearStats = () => {
    Alert.alert('Clear stats?', 'Removes all aggregate counters. The wrapper continues writing new ones.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        try { await exec(`DELETE FROM db_stats`); await load(); }
        catch (e) { logError('diagnostics:clearStats', e); }
      }},
    ]);
  };

  const clearSlow = () => {
    Alert.alert('Clear slow log?', 'Removes all logged slow queries.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        try { await exec(`DELETE FROM db_slow_log`); await load(); }
        catch (e) { logError('diagnostics:clearSlow', e); }
      }},
    ]);
  };

  // PS-50 — assemble a PII-free diagnostic report. db_stats labels are repo
  // method names and db_slow_log.sql is parameterised (values are bound as `?`,
  // never stored), so no merchant names / amounts appear here.
  const buildReport = useCallback(() => {
    const lines = [];
    lines.push('--- Drift diagnostics (no personal data) ---');
    lines.push(`App version: ${APP_VERSION}`);
    lines.push(`Schema version: ${schemaV}`);
    lines.push(`Platform: ${Platform.OS} ${Platform.Version}`);
    lines.push('');
    lines.push('Top queries by total time:');
    if (stats.length === 0) lines.push('  (none recorded)');
    for (const r of stats.slice(0, 8)) {
      const avg = r.call_count > 0 ? (r.total_ms / r.call_count).toFixed(1) : '0.0';
      lines.push(`  ${r.label} — ${r.total_ms}ms (${r.call_count}×, avg ${avg}ms, max ${r.max_ms}ms)`);
    }
    lines.push('');
    lines.push('Recent slow queries:');
    if (slow.length === 0) lines.push('  (none logged)');
    for (const r of slow.slice(0, 20)) {
      lines.push(`  ${r.label} — ${r.duration_ms}ms @ ${r.occurred_at}`);
    }
    return lines.join('\n');
  }, [stats, slow, schemaV]);

  const sendFeedback = useCallback(async () => {
    const report = buildReport();
    const subject = `Drift feedback v${APP_VERSION}`;
    const body = `Describe your feedback here:\n\n\n\n${report}\n`;
    const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch (e) {
      // No mail client handled the intent — fall back to a selectable modal so
      // the user can long-press-copy the report into any app.
      logError('diagnostics:sendFeedback', e);
      setFeedbackText(`${subject}\n\n${report}`);
      setFeedbackOpen(true);
    }
  }, [buildReport]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 32, paddingHorizontal: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}
        tintColor={F.coral} colors={[F.coral]}/>}>

      <Text style={{ fontSize: 24, fontWeight: '400', color: F.ink, marginBottom: 4 }}>
        Diagnostics
      </Text>
      <Text style={{ fontSize: 12, color: F.ink3, marginBottom: 16 }}>
        Query-level perf counters. Updates live as you use the app.
      </Text>

      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 8 }}>
        Aggregate · {stats.length} labels
      </Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 16, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden', marginBottom: 20 }}>
        {stats.length === 0
          ? <Text style={{ padding: 14, fontSize: 13, color: F.ink3 }}>No counters yet.</Text>
          : stats.map(r => <StatRow key={r.label} row={r} F={F}/>)}
      </View>

      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 8 }}>
        Slow queries · last {slow.length}
      </Text>
      <View style={{ backgroundColor: F.surface, borderRadius: 16, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden', marginBottom: 20 }}>
        {slow.length === 0
          ? <Text style={{ padding: 14, fontSize: 13, color: F.ink3 }}>
              No slow queries logged. {typeof __DEV__ !== 'undefined' && __DEV__
                ? '(Threshold: 50ms)'
                : '(Release build — SQL not persisted)'}
            </Text>
          : slow.map(r => (
              <SlowRow key={r.id} row={r}
                expanded={expanded === r.id}
                onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                F={F}/>
            ))}
      </View>

      {/* PS-50 — send a PII-free diagnostic report via the user's mail client. */}
      <TouchableOpacity onPress={sendFeedback} activeOpacity={0.8}
        style={{ padding: 14, borderRadius: 12, backgroundColor: F.coral,
          alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>✉️  Send feedback</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity onPress={clearStats} activeOpacity={0.7}
          style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1,
            borderColor: F.line, backgroundColor: F.surface, alignItems: 'center' }}>
          <Text style={{ color: F.ink, fontSize: 13 }}>Clear stats</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={clearSlow} activeOpacity={0.7}
          style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1,
            borderColor: F.line, backgroundColor: F.surface, alignItems: 'center' }}>
          <Text style={{ color: F.ink, fontSize: 13 }}>Clear slow log</Text>
        </TouchableOpacity>
      </View>

      {/* PS-50 — fallback when no mail client is installed. Long-press the text
          to select + copy it into any app. */}
      <Modal visible={feedbackOpen} animationType="slide" transparent
        onRequestClose={() => setFeedbackOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: F.bg, padding: 20, maxHeight: '80%',
            borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 20 }}>
            <Text style={{ fontSize: 18, color: F.ink, fontWeight: '500', marginBottom: 4 }}>
              No mail client found
            </Text>
            <Text style={{ fontSize: 12, color: F.ink3, marginBottom: 12 }}>
              Long-press the report below to select and copy it, then paste it wherever you like.
            </Text>
            <ScrollView style={{ backgroundColor: F.surface, borderRadius: 12, borderWidth: 1,
              borderColor: F.line, padding: 12, marginBottom: 14 }}>
              <Text selectable style={{ fontSize: 11, color: F.ink2, fontFamily: 'monospace' }}>
                {feedbackText}
              </Text>
            </ScrollView>
            <TouchableOpacity onPress={() => setFeedbackOpen(false)}
              style={{ padding: 14, borderRadius: 12, backgroundColor: F.coral, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
