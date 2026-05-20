import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../../hooks/useAppState';
import { useItemActions } from '@features/items/context';

function ItemTrend({ route, navigation }) {
  const { F, sym } = useApp();
  const { priceHistory, stats: statsQuery, sameQtyHistory, consumption: consumptionQuery } = useItemActions();
  const insets = useSafeAreaInsets();
  const { normalizedName, displayName } = route.params;

  const [history, setHistory] = useState([]);
  const [stats, setStats]     = useState(null);
  const [tab, setTab]         = useState('price');
  const [bucket, setBucket]   = useState('month');
  const [consumption, setConsumption] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [sameQty, setSameQty] = useState([]);

  useEffect(() => {
    (async () => {
      const h = await priceHistory(normalizedName);
      setHistory(h);
      const s = await statsQuery(normalizedName);
      setStats(s);
      const latest = h[h.length - 1];
      if (latest && latest.qty > 0) {
        const sq = await sameQtyHistory(normalizedName, latest.qty, latest.unit);
        setSameQty(sq);
      } else {
        setSameQty([]);
      }
    })();
  }, [normalizedName, priceHistory, statsQuery, sameQtyHistory]);

  useEffect(() => {
    consumptionQuery(normalizedName, { bucket, range: 12 }).then(setConsumption);
  }, [normalizedName, bucket, consumptionQuery]);

  const last = history[history.length - 1];
  const first = history[0];
  const changeAll = first && last && first.unit_price > 0
    ? ((last.unit_price - first.unit_price) / first.unit_price) * 100
    : null;

  const priceData = history.map(h => h.unit_price);
  const maxPrice  = priceData.length ? Math.max(...priceData) : 0;
  const minPrice  = priceData.length ? Math.min(...priceData) : 0;

  const consMax = consumption.length ? Math.max(...consumption.map(c => c.qty_canonical)) : 0;
  const consTotal = consumption.reduce((s, c) => s + c.qty_canonical, 0);
  const canonicalUnit = stats?.canonical_unit || last?.canonical_unit || 'pcs';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>

      <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 22, marginBottom: 16 }}>
        <Text style={{ fontSize: 28, color: F.ink, fontWeight: '400', textTransform: 'capitalize' }}>
          {displayName}
        </Text>
        {last ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <Text style={{ fontSize: 36, color: F.coral, fontWeight: '600' }}>
                {sym}{last.unit_price.toFixed(2)}
              </Text>
              <Text style={{ fontSize: 16, color: F.ink2 }}>/{canonicalUnit}</Text>
              {changeAll !== null && (
                <Text style={{ fontSize: 13, color: changeAll > 0 ? F.coral : F.sageD, fontWeight: '700' }}>
                  {changeAll > 0 ? '↑' : '↓'} {Math.abs(changeAll).toFixed(0)}%
                </Text>
              )}
            </View>
            <Text style={{ fontSize: 12, color: F.ink2, marginTop: 6 }}>
              Last bought: {last.qty} {last.unit} from {last.merchant || 'unknown'} on {last.purchase_date}
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 13, color: F.ink2, marginTop: 6 }}>No purchases yet</Text>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {[['price', 'Price'], ['consumption', 'Consumption']].map(([k, l]) => {
          const sel = tab === k;
          return (
            <TouchableOpacity key={k} onPress={() => setTab(k)}
              style={{ flex: 1, padding: 12, borderRadius: 14,
                backgroundColor: sel ? F.coral : F.surface,
                borderWidth: 1, borderColor: sel ? F.coral : F.line,
                alignItems: 'center' }}>
              <Text style={{ color: sel ? '#fff' : F.ink, fontWeight: sel ? '700' : '500', fontSize: 13 }}>
                {l}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'price' && (
        <>
          <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 18,
            borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 12 }}>
              {sym}/{canonicalUnit} over time
            </Text>
            {selectedIdx !== null && history[selectedIdx] && (
              <View style={{ backgroundColor: F.cream, borderRadius: 12, padding: 10,
                marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 12, color: F.ink2 }}>
                    {history[selectedIdx].purchase_date} · {history[selectedIdx].merchant || 'unknown'}
                  </Text>
                  <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
                    {history[selectedIdx].qty} {history[selectedIdx].unit} = {sym}{history[selectedIdx].price.toFixed(2)}
                  </Text>
                </View>
                <Text style={{ fontSize: 20, color: F.coral, fontWeight: '600' }}>
                  {sym}{history[selectedIdx].unit_price.toFixed(2)}
                </Text>
              </View>
            )}
            {history.length === 0 ? (
              <Text style={{ textAlign: 'center', color: F.ink3, padding: 20 }}>No data yet</Text>
            ) : history.length === 1 ? (
              <Text style={{ textAlign: 'center', color: F.ink3, padding: 20 }}>
                Scan another receipt to see the trend.
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 }}>
                {history.slice(-12).map((h, i) => {
                  const range = Math.max(1, maxPrice - minPrice);
                  const norm = (h.unit_price - minPrice) / range;
                  const barH = 20 + norm * 80;
                  const isSel = selectedIdx === (history.length - Math.min(12, history.length)) + i;
                  return (
                    <TouchableOpacity key={i}
                      onPress={() => setSelectedIdx((history.length - Math.min(12, history.length)) + i)}
                      style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 120 }}>
                      <View style={{
                        width: '100%', height: barH, borderRadius: 6,
                        backgroundColor: isSel ? F.coral : F.blushD,
                        opacity: isSel ? 1 : 0.5,
                      }}/>
                      <Text style={{ fontSize: 9, color: F.ink3, marginTop: 4 }}>
                        {h.purchase_date.slice(5)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {stats && history.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[
                ['Lowest', `${sym}${stats.min_price.toFixed(2)}`, F.sageD],
                ['Average', `${sym}${stats.avg_price.toFixed(2)}`, F.ink],
                ['Highest', `${sym}${stats.max_price.toFixed(2)}`, F.coral],
              ].map(([l, v, c]) => (
                <View key={l} style={{ flex: 1, backgroundColor: F.surface, borderRadius: 14,
                  borderWidth: 1, borderColor: F.line, padding: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: F.ink3, textTransform: 'uppercase', letterSpacing: 0.6 }}>{l}</Text>
                  <Text style={{ fontSize: 16, color: c, fontWeight: '600', marginTop: 4 }}>{v}</Text>
                  <Text style={{ fontSize: 10, color: F.ink3 }}>per {canonicalUnit}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {tab === 'consumption' && (
        <>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
            {[['week','Week'],['month','Month'],['year','Year']].map(([k,l]) => {
              const sel = bucket === k;
              return (
                <TouchableOpacity key={k} onPress={() => setBucket(k)}
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99,
                    backgroundColor: sel ? F.coral : F.surface,
                    borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                  <Text style={{ color: sel ? '#fff' : F.ink2, fontSize: 12, fontWeight: '600' }}>{l}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 18,
            borderWidth: 1, borderColor: F.line, marginBottom: 16 }}>
            <Text style={{ fontSize: 13, color: F.ink2, marginBottom: 12 }}>
              {canonicalUnit} consumed per {bucket}
            </Text>
            {consumption.length === 0 ? (
              <Text style={{ textAlign: 'center', color: F.ink3, padding: 20 }}>No data yet</Text>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 }}>
                {consumption.map((c, i) => {
                  const barH = consMax > 0 ? (c.qty_canonical / consMax) * 100 : 0;
                  return (
                    <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 120 }}>
                      <Text style={{ fontSize: 9, color: F.ink3, marginBottom: 3 }}>
                        {c.qty_canonical.toFixed(canonicalUnit === 'pcs' ? 0 : 1)}
                      </Text>
                      <View style={{
                        width: '100%', height: Math.max(8, barH), borderRadius: 6,
                        backgroundColor: F.sageD,
                      }}/>
                      <Text style={{ fontSize: 9, color: F.ink3, marginTop: 4 }}>
                        {String(c.period).slice(-5)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            {consumption.length > 0 && (
              <Text style={{ fontSize: 12, color: F.ink2, marginTop: 14, textAlign: 'center' }}>
                Total: <Text style={{ color: F.coral, fontWeight: '700' }}>
                  {consTotal.toFixed(canonicalUnit === 'pcs' ? 0 : 2)} {canonicalUnit}
                </Text> across {consumption.length} {bucket}{consumption.length === 1 ? '' : 's'}
              </Text>
            )}
          </View>
        </>
      )}

      {sameQty.length > 1 && last && (
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 15, color: F.ink, marginBottom: 4, fontWeight: '500' }}>
            Same quantity matches
          </Text>
          <Text style={{ fontSize: 12, color: F.ink3, marginBottom: 10 }}>
            Past buys near {last.qty} {last.unit} (±20%) so you can compare apples-to-apples.
          </Text>
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
            {sameQty.map((h, i) => {
              const diff = h.price - sameQty[0].price;
              const isLatest = i === 0;
              return (
                <TouchableOpacity
                  key={h.id}
                  onPress={() => navigation.navigate('Detail', { id: h.expense_id })}
                  activeOpacity={0.7}
                  style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    backgroundColor: isLatest ? F.cream : 'transparent' }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: F.ink, fontWeight: '500' }}>
                      {h.merchant || 'Unknown store'}
                    </Text>
                    <Text style={{ fontSize: 11, color: F.ink3 }}>
                      {h.purchase_date} · {h.qty} {h.unit}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, color: F.ink, fontWeight: '600' }}>
                      {sym}{h.price.toFixed(2)}
                    </Text>
                    {!isLatest && Math.abs(diff) >= 0.01 && (
                      <Text style={{ fontSize: 11, color: diff > 0 ? F.coral : F.sageD, fontWeight: '600' }}>
                        {diff > 0 ? '↑' : '↓'} {sym}{Math.abs(diff).toFixed(2)} vs latest
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {history.length > 0 && (
        <View>
          <Text style={{ fontSize: 15, color: F.ink, marginBottom: 8, fontWeight: '500' }}>History</Text>
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
            {history.slice().reverse().map((h, i) => (
              <TouchableOpacity
                key={h.id}
                onPress={() => navigation.navigate('Detail', { id: h.expense_id })}
                activeOpacity={0.7}
                style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                  flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: F.ink, fontWeight: '500' }}>
                    {h.merchant || 'Unknown store'}
                  </Text>
                  <Text style={{ fontSize: 11, color: F.ink3 }}>
                    {h.purchase_date} · {h.qty} {h.unit}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>
                    {sym}{h.price.toFixed(2)}
                  </Text>
                  <Text style={{ fontSize: 11, color: F.coral }}>
                    {sym}{h.unit_price.toFixed(2)}/{h.canonical_unit}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

export default React.memo(ItemTrend);
