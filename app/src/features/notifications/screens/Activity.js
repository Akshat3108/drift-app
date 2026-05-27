// PS-08 — Notification Center / in-app activity feed.
//
// Reads `notificationsRepo.list()` (via the NotificationsContext). Renders a
// chronological list grouped by day with type-specific emojis + tap-to-
// navigate per kind. Long-press or header button marks all rows read.
// Pull-to-refresh re-evaluates the budget + pantry checkers so a recently
// raised threshold can land a fresh row without requiring a mutation.
//
// Pure helpers `groupByDay`, `iconForKind`, `relativeTime`, `navTargetForRow`
// are exported for /tmp/ validation.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useNotifications } from '../context';

const KIND_ICON = {
  budget_threshold: '🎯',
  sub_due:          '📅',
  price_alert:      '🔔',
  pantry_low_stock: '🥗',
  other:            '·',
};

export function iconForKind(kind) {
  return KIND_ICON[kind] || KIND_ICON.other;
}

// Group `[{ created_at, ... }]` (sorted desc by created_at) into day buckets.
// Returns `[{ title, items[] }]` with newest day first. `nowIso` is injected
// for test determinism; defaults to current time in production.
export function groupByDay(rows, nowIso) {
  const now = nowIso ? new Date(nowIso) : new Date();
  const today = ymd(now);
  const yest = ymd(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const groups = new Map();
  for (const r of rows || []) {
    const d = (r.created_at || '').slice(0, 10);
    if (!d) continue;
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(r);
  }
  // Sort dates desc.
  const dates = [...groups.keys()].sort((a, b) => b.localeCompare(a));
  return dates.map((d) => ({
    date: d,
    title: d === today ? 'Today' : d === yest ? 'Yesterday' : titleForDate(d),
    items: groups.get(d),
  }));
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function titleForDate(d) {
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

// Pretty relative timestamp. Pure / null-safe.
export function relativeTime(createdAt, nowIso) {
  if (!createdAt) return '';
  const then = new Date(createdAt.replace(' ', 'T') + (createdAt.endsWith('Z') ? '' : 'Z'));
  const now = nowIso ? new Date(nowIso) : new Date();
  if (isNaN(then.getTime())) return '';
  const diff = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Translate a notification row to a `{ name, params }` nav target. Returns
// `null` for kinds we don't have a deep-link for (the screen still marks the
// row read but doesn't navigate). Pure for /tmp/ testing.
export function navTargetForRow(row) {
  if (!row || !row.kind) return null;
  const p = row.payload || {};
  switch (row.kind) {
    case 'budget_threshold':
      if (p.category_id != null) {
        return { name: 'PotDetail', params: { potId: p.category_id } };
      }
      return null;
    case 'sub_due':
      return { name: 'Subs' };
    case 'price_alert':
      if (p.normalized_name) {
        return { name: 'ItemTrend', params: {
          normalizedName: p.normalized_name,
          displayName: p.normalized_name,
        } };
      }
      return null;
    default:
      return null;
  }
}

function Activity({ navigation }) {
  const { F } = useApp();
  const insets = useSafeAreaInsets();
  const notif = useNotifications();
  const [rows, setRows] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const list = await notif.list({ limit: 200 });
      setRows(Array.isArray(list) ? list : []);
    } catch { /* swallow */ }
    finally { setLoading(false); }
  }, [notif]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Re-run the in-app checkers so a freshly-raised threshold can fire
      // without needing a mutation. Best-effort; failures are silent.
      await notif.evaluateBudgets?.().catch(() => {});
      await notif.evaluatePantry?.().catch(() => {});
      await load();
    } finally { setRefreshing(false); }
  }, [notif, load]);

  const handleRowPress = useCallback(async (row) => {
    if (!row.read_at) {
      await notif.markRead?.(row.id);
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, read_at: new Date().toISOString() } : r));
    }
    const target = navTargetForRow(row);
    if (target) {
      navigation.navigate(target.name, target.params || undefined);
    }
  }, [notif, navigation]);

  const handleMarkAll = useCallback(async () => {
    await notif.markAllRead?.();
    const nowIso = new Date().toISOString();
    setRows((prev) => prev.map((r) => r.read_at ? r : { ...r, read_at: nowIso }));
  }, [notif]);

  const groups = groupByDay(rows);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={F.coral}/>}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
          Your <Text style={{ color: F.coral, fontStyle: 'italic' }}>activity</Text>
        </Text>
        {notif.unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAll} activeOpacity={0.7}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99,
              backgroundColor: F.cream, borderWidth: 1, borderColor: F.line }}>
            <Text style={{ fontSize: 11, color: F.ink2, fontWeight: '600' }}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <Text style={{ fontSize: 12, color: F.ink3, marginTop: 12 }}>Loading…</Text>
      ) : groups.length === 0 ? (
        <View style={{ marginTop: 24, padding: 20, backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line }}>
          <Text style={{ fontSize: 32, textAlign: 'center' }}>🔔</Text>
          <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600', marginTop: 8, textAlign: 'center' }}>
            No notifications yet
          </Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginTop: 8, lineHeight: 18 }}>
            You'll see entries here when:{'\n'}
            🎯 a budget crosses your alert threshold{'\n'}
            📅 a subscription is about to bill{'\n'}
            🔔 a tracked item's price jumps{'\n'}
            🥗 a pantry staple runs low
          </Text>
          <Text style={{ fontSize: 11, color: F.ink3, marginTop: 10, textAlign: 'center' }}>
            Pull down to re-evaluate budget thresholds.
          </Text>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.date} style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 11, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
              {g.title}
            </Text>
            <View style={{ backgroundColor: F.surface, borderRadius: 16, borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
              {g.items.map((r, i) => {
                const unread = !r.read_at;
                return (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => handleRowPress(r)}
                    onLongPress={handleMarkAll}
                    delayLongPress={400}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', gap: 10,
                      paddingHorizontal: 12, paddingVertical: 12,
                      borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                      backgroundColor: unread ? F.bg : 'transparent' }}>
                    <Text style={{ fontSize: 20 }}>{iconForKind(r.kind)}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {unread && (
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: F.coral }}/>
                        )}
                        <Text style={{ fontSize: 13, color: F.ink, fontWeight: unread ? '700' : '500', flex: 1 }} numberOfLines={1}>
                          {r.title}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: F.ink2, marginTop: 2 }} numberOfLines={2}>
                        {r.body}
                      </Text>
                      <Text style={{ fontSize: 10, color: F.ink3, marginTop: 4 }}>
                        {relativeTime(r.created_at)}
                      </Text>
                    </View>
                    {navTargetForRow(r) && (
                      <Text style={{ fontSize: 14, color: F.ink3, alignSelf: 'center' }}>›</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))
      )}

      {!loading && groups.length > 0 && (
        <Text style={{ fontSize: 10, color: F.ink3, marginTop: 18, textAlign: 'center', lineHeight: 14 }}>
          Long-press any row to mark all as read.
        </Text>
      )}
    </ScrollView>
  );
}

export default React.memo(Activity);
