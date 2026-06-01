import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useApp } from '../../../hooks/useAppState';
import { useItemActions } from '@features/items/context';
import { PAYMENT_LABELS } from '@features/expenses/filters';
import ReceiptViewer from '@features/expenses/components/ReceiptViewer';
import { pickReceiptUri, hasReceipt as rowHasReceipt } from '@features/expenses/receiptUri';
import { singleReceiptHTML, MIME_TYPES } from '@features/expenses/export';
import SwipeableRow from '@components/SwipeableRow';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';
import { categoryAnomalyStats, classifyExpenseAnomaly } from '../../../analytics';
import { expenses as expRepo } from '@features/expenses/repo';

const MOOD_LABELS = { '😍': 'Loved it', '😌': 'Worth it', '😐': 'Neutral', '😬': 'Unsure', '😞': 'Regret' };

// 5.11 — Build the row set for the "Tax invoice" card. Pure: takes the
// expense row and the currency symbol, returns an ordered list of rows
// (or null when there's nothing tax-related to surface). Extracted so the
// visibility + rate logic is testable without React.
//
// Subtotal row is hidden when no tax amounts are set (gstin-only case) OR
// when (amount − Σtax) is negative or zero (OCR-driven amounts can be
// inconsistent — better to hide than display a misleading subtotal).
//
// Each tax row's label appends an effective-rate suffix (e.g. "CGST (2.5%)")
// only when both subtotal > 0 and the component value is positive.
export function buildTaxRows(e, sym) {
  if (!e) return null;
  const cgst = num(e.cgst);
  const sgst = num(e.sgst);
  const igst = num(e.igst);
  const gstin = (e.gstin ?? '').trim();
  const invoice = (e.invoice_number ?? '').trim();
  const hasTaxAmt = cgst > 0 || sgst > 0 || igst > 0;
  const hasMeta = !!gstin || !!invoice;
  if (!hasTaxAmt && !hasMeta) return null;

  const taxTotal = +(cgst + sgst + igst).toFixed(2);
  const subtotal = hasTaxAmt ? +(num(e.amount) - taxTotal).toFixed(2) : null;
  const showSubtotal = subtotal != null && subtotal > 0;
  const rateOf = (part) => (showSubtotal && part > 0) ? ` (${(part / subtotal * 100).toFixed(1)}%)` : '';
  const money = (v) => `${sym}${v.toFixed(2)}`;

  const rows = [];
  if (showSubtotal) rows.push({ key: 'subtotal', label: 'Subtotal', value: money(subtotal) });
  if (cgst > 0)     rows.push({ key: 'cgst',     label: `CGST${rateOf(cgst)}`, value: money(cgst) });
  if (sgst > 0)     rows.push({ key: 'sgst',     label: `SGST${rateOf(sgst)}`, value: money(sgst) });
  if (igst > 0)     rows.push({ key: 'igst',     label: `IGST${rateOf(igst)}`, value: money(igst) });
  if (hasTaxAmt)    rows.push({ key: 'tax-total', label: 'Tax total', value: money(taxTotal), emphasis: true });
  if (gstin)        rows.push({ key: 'gstin',    label: 'GSTIN',     value: gstin, mono: true });
  if (invoice)      rows.push({ key: 'invoice',  label: 'Invoice #', value: invoice });
  return rows;
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function Detail({ route, navigation }) {
  const { F, sym, expenses, removeExpense, restoreExpense } = useApp();
  const { listByExpense, remove: removeItem, restore: restoreItemRow } = useItemActions();
  const toast = useToast();
  const { id } = route.params;
  const e = expenses.find(x => x.id === id);
  const [items, setItems] = useState([]);
  // PS-37 — refunds that point at THIS expense (→ "Refunded on …" badge), and,
  // when this row is itself a refund, the original it credits (→ back-link).
  const [refunds, setRefunds] = useState([]);
  const [refundOrigin, setRefundOrigin] = useState(null);
  // PS-48 — single-receipt PDF export busy flag.
  const [exportingPdf, setExportingPdf] = useState(false);

  // 5.13 — receipt viewer modal + 5.15 — shadow the row's receipt fields so a
  // successful lazy-migrate refreshes the thumb without a full provider hop.
  const [viewerOpen, setViewerOpen] = useState(false);
  const [receiptOverlay, setReceiptOverlay] = useState(null);
  const eForReceipt = receiptOverlay ? { ...e, ...receiptOverlay } : e;
  const receiptUris = useMemo(() => pickReceiptUri(eForReceipt), [eForReceipt]);
  const showReceiptCard = rowHasReceipt(eForReceipt);

  useEffect(() => {
    if (e?.id) {
      listByExpense(e.id).then(setItems).catch(() => setItems([]));
    }
  }, [e?.id, listByExpense]);

  // PS-37 — load refund linkage. refundsFor(id) drives the "Refunded" badge;
  // when this row is a refund itself, fetch the original for the back-link.
  // On focus (not just mount) so the badge appears after returning from the
  // refund-entry modal without a remount.
  useFocusEffect(useCallback(() => {
    if (!e?.id) return;
    expRepo.refundsFor(e.id).then(setRefunds).catch(() => setRefunds([]));
    if (e.refund_of_expense_id != null) {
      expRepo.get(e.refund_of_expense_id).then(setRefundOrigin).catch(() => setRefundOrigin(null));
    } else {
      setRefundOrigin(null);
    }
  }, [e?.id, e?.refund_of_expense_id]));

  // 8.13 — Per-category anomaly flag. Load cached stats once per category +
  // amount; null result hides the banner entirely.
  const [anomaly, setAnomaly] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!e?.category_id || !Number.isFinite(e.amount)) { setAnomaly(null); return; }
    categoryAnomalyStats()
      .then((stats) => {
        if (cancelled) return;
        const catStats = stats?.byCategory?.[e.category_id];
        setAnomaly(classifyExpenseAnomaly(e.amount, catStats));
      })
      .catch(() => { if (!cancelled) setAnomaly(null); });
    return () => { cancelled = true; };
  }, [e?.category_id, e?.amount]);

  if (!e) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: F.bg }}>
      <Text style={{ color: F.ink2 }}>Expense not found</Text>
    </View>
  );

  const similar = expenses.filter(x => x.category_id === e.category_id && x.id !== e.id).slice(0, 3);
  const taxRows = buildTaxRows(e, sym);

  // PS-37 — refund derivations.
  const isRefundRow = e.refund_of_expense_id != null;
  const refundedTotal = refunds.reduce((s, r) => s + Math.abs(Number(r.amount) || 0), 0);
  const latestRefundDate = refunds[0]?.expense_date || null;
  const canRefund = !isRefundRow && Number(e.amount) > 0;

  const handleDelete = async () => {
    const merchant = e.merchant;
    const id = e.id;
    try {
      await removeExpense(id);
      navigation.goBack();
      toast(`Deleted: ${merchant}`, {
        actionLabel: 'Undo',
        onAction: async () => {
          try { await restoreExpense(id); }
          catch (err) {
            logError('detail:undo-delete', err);
            Alert.alert('Restore failed', err?.message || String(err));
          }
        },
      });
    } catch (err) {
      logError('detail:delete', err);
      Alert.alert('Delete failed', err?.message || String(err));
    }
  };

  // PS-48 — export this single expense (+ items, GST, receipt image) as a
  // one-page PDF for reimbursement. Generated + shared locally via expo-print /
  // expo-sharing; nothing leaves the device. Native modules lazy-required so
  // Metro doesn't choke before an Android rebuild.
  const handleExportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      let receiptDataUri = null;
      if (receiptUris.full) {
        try {
          const FS = require('expo-file-system/legacy');
          const b64 = await FS.readAsStringAsync(receiptUris.full, {
            encoding: FS.EncodingType?.Base64 ?? 'base64',
          });
          const mime = /\.png$/i.test(receiptUris.full) ? 'image/png' : 'image/jpeg';
          receiptDataUri = `data:${mime};base64,${b64}`;
        } catch (imgErr) {
          logError('detail:pdf:receipt-read', imgErr); // proceed without the image
        }
      }
      const html = singleReceiptHTML({ expense: e, items, receiptDataUri, sym });
      let Print, Sharing;
      try { Print = require('expo-print'); }
      catch { Alert.alert('PDF unavailable', 'Install `expo-print` and rebuild Android to enable PDF export.'); return; }
      const { uri } = await Print.printToFileAsync({ html });
      try { Sharing = require('expo-sharing'); } catch { Sharing = null; }
      if (Sharing && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: MIME_TYPES.pdf, dialogTitle: `${e.merchant} receipt` });
      } else {
        Alert.alert('PDF saved', `Saved at:\n${uri}`);
      }
    } catch (err) {
      logError('detail:pdf', err);
      Alert.alert('Could not export PDF', err?.message || String(err));
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
      <View style={{ backgroundColor: F.cream, borderRadius: 26, padding: 24,
        alignItems: 'center', marginTop: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: 52 }}>{e.category_emoji || '💰'}</Text>
        <Text style={{ fontSize: 48, color: e.amount < 0 ? F.sageD : F.ink, fontWeight: '400', marginTop: 8 }}>
          {e.amount < 0 ? '−' : ''}{sym}{Math.abs(e.amount).toFixed(2)}
        </Text>
        {e.merchant_id ? (
          <TouchableOpacity onPress={() => navigation.navigate('MerchantDetail', {
            merchantId: e.merchant_id, displayName: e.merchant,
          })} hitSlop={8}>
            <Text style={{ fontSize: 18, color: F.ink, marginTop: 6, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}>
              {e.merchant}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ fontSize: 18, color: F.ink, marginTop: 6 }}>{e.merchant}</Text>
        )}
        <Text style={{ fontSize: 13, color: F.ink2, marginTop: 4 }}>
          {e.expense_date} · {e.category_name || 'Uncategorised'}
        </Text>
      </View>

      {/* PS-37 — this row is a refund: link back to the original spend. */}
      {isRefundRow && (
        <TouchableOpacity
          activeOpacity={refundOrigin ? 0.7 : 1}
          onPress={() => refundOrigin && navigation.replace('Detail', { id: refundOrigin.id })}
          style={{ backgroundColor: F.mint, borderRadius: 18, padding: 14, marginBottom: 12,
            borderWidth: 1, borderColor: F.sageD, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 20 }}>↩</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>
              Refund of {refundOrigin?.merchant || e.merchant}
            </Text>
            {refundOrigin && (
              <Text style={{ fontSize: 12, color: F.ink2, marginTop: 2 }}>
                Original: {sym}{Math.abs(Number(refundOrigin.amount)).toFixed(2)} on {refundOrigin.expense_date}
              </Text>
            )}
          </View>
          {refundOrigin && <Text style={{ fontSize: 18, color: F.ink2 }}>›</Text>}
        </TouchableOpacity>
      )}

      {/* PS-37 — this spend has been (partially) refunded. */}
      {!isRefundRow && refunds.length > 0 && (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 14, marginBottom: 12,
          borderWidth: 1, borderColor: F.sageD, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: F.mint,
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>↩</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>
              Refunded {sym}{refundedTotal.toFixed(2)}
            </Text>
            <Text style={{ fontSize: 12, color: F.ink2, marginTop: 2 }}>
              {refunds.length === 1 ? `on ${latestRefundDate}` : `${refunds.length} refunds · latest ${latestRefundDate}`}
            </Text>
          </View>
        </View>
      )}

      {anomaly && (
        <View style={{
          backgroundColor: anomaly.severity === 'severe' ? '#fee2e2' : F.surface,
          borderRadius: 18, padding: 14, marginBottom: 12,
          borderWidth: 1, borderColor: anomaly.severity === 'severe' ? '#fecaca' : F.coral,
          flexDirection: 'row', alignItems: 'center', gap: 12,
        }}>
          <View style={{ width: 40, height: 40, borderRadius: 20,
            backgroundColor: anomaly.severity === 'severe' ? '#fecaca' : F.cream,
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20 }}>🔥</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: F.ink, fontWeight: '600' }}>
              Unusual for {e.category_name || 'this category'}
            </Text>
            <Text style={{ fontSize: 12, color: F.ink2, marginTop: 2 }}>
              {anomaly.multiple != null
                ? `${anomaly.multiple.toFixed(1)}× the 90-day average`
                : `${anomaly.z.toFixed(1)}σ above typical`}
              {' · typical '}{sym}{anomaly.mean.toFixed(0)}
              {' (n='}{anomaly.n}{')'}
            </Text>
          </View>
        </View>
      )}

      {e.mood && (
        <View style={{ backgroundColor: F.surface, borderRadius: 18, padding: 16,
          borderWidth: 1, borderColor: F.line, flexDirection: 'row', alignItems: 'center',
          gap: 14, marginBottom: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: F.cream,
            alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 26 }}>{e.mood}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: F.ink2 }}>You felt</Text>
            <Text style={{ fontSize: 16, color: F.ink }}>{MOOD_LABELS[e.mood] || '—'}</Text>
          </View>
        </View>
      )}

      <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
        borderColor: F.line, overflow: 'hidden', marginBottom: 16 }}>
        {[
          ['Category', e.category_name || 'Uncategorised'],
          ['Date',     e.expense_date],
          ...(e.payment_method ? [['Payment', PAYMENT_LABELS[e.payment_method] || e.payment_method]] : []),
          ...(e.carbon ? [['Carbon', `${e.carbon} kg CO₂e`]] : []),
          ['Recurring', e.recurring ? 'Monthly' : 'One-time'],
          ...(e.notes ? [['Notes', e.notes]] : []),
        ].map(([l, v], i) => (
          <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between',
            padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
            <Text style={{ fontSize: 14, color: F.ink2 }}>{l}</Text>
            <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500', maxWidth: '60%', textAlign: 'right' }}>{v}</Text>
          </View>
        ))}
      </View>

      {taxRows && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 16, color: F.ink, marginBottom: 10 }}>Tax invoice</Text>
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
            borderColor: F.line, overflow: 'hidden' }}>
            {taxRows.map((r, i) => (
              <View key={r.key} style={{ flexDirection: 'row', justifyContent: 'space-between',
                padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                backgroundColor: r.emphasis ? F.cream : 'transparent' }}>
                <Text style={{ fontSize: 14, color: F.ink2 }}>{r.label}</Text>
                <Text style={{ fontSize: 14, color: F.ink,
                  fontWeight: r.emphasis ? '600' : '500',
                  fontVariant: r.mono ? ['tabular-nums'] : undefined,
                  letterSpacing: r.mono ? 0.5 : 0,
                  maxWidth: '60%', textAlign: 'right' }}>{r.value}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {showReceiptCard && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 16, color: F.ink, marginBottom: 10 }}>Receipt</Text>
          <TouchableOpacity
            onPress={() => setViewerOpen(true)}
            activeOpacity={0.85}
            style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
              borderColor: F.line, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {receiptUris.thumb ? (
              <Image
                source={{ uri: receiptUris.thumb }}
                style={{ width: 64, height: 88, borderRadius: 10, backgroundColor: F.cream }}
                resizeMode="cover"
              />
            ) : (
              <View style={{ width: 64, height: 88, borderRadius: 10, backgroundColor: F.cream,
                alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 28 }}>🧾</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500' }}>Tap to view</Text>
              <Text style={{ fontSize: 12, color: F.ink3, marginTop: 2 }}>Pinch to zoom · drag to pan</Text>
            </View>
            <Text style={{ fontSize: 18, color: F.ink2 }}>›</Text>
          </TouchableOpacity>
        </View>
      )}

      {items.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 16, color: F.ink, marginBottom: 10 }}>Items on this receipt</Text>
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
            borderColor: F.line, overflow: 'hidden' }}>
            {items.map((it, i) => {
              const onSwipeRemove = async () => {
                try {
                  await removeItem(it.id);
                  setItems((prev) => prev.filter((x) => x.id !== it.id));
                  toast(`Removed: ${it.name}`, {
                    actionLabel: 'Undo',
                    onAction: async () => {
                      try {
                        await restoreItemRow(it.id);
                        // refetch — the item's joined columns and rollup
                        // state need to come back consistent, and the
                        // sort order matches `ORDER BY id`.
                        const fresh = await listByExpense(e.id);
                        setItems(fresh);
                      } catch (err) {
                        logError('detail:item-undo-remove', err);
                        Alert.alert('Restore failed', err?.message || String(err));
                      }
                    },
                  });
                } catch (err) {
                  logError('detail:item-swipe-remove', err);
                  Alert.alert('Remove failed', err?.message || String(err));
                }
              };
              return (
              <SwipeableRow key={it.id} F={F} rightLabel="Remove" onRightAction={onSwipeRemove}>
              <TouchableOpacity
                onPress={() => navigation.navigate('ItemTrend', { normalizedName: it.normalized_name, displayName: it.name })}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
                  borderTopWidth: i ? 1 : 0, borderTopColor: F.line,
                  backgroundColor: F.surface,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: F.cream,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16 }}>{it.kind === 'produce' ? '🥬' : '🛒'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: F.ink, fontWeight: '500', textTransform: 'capitalize' }}>
                    {it.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: F.ink3 }}>
                    {it.qty} {it.unit} · {sym}{it.unit_price.toFixed(2)}/{it.canonical_unit}
                  </Text>
                </View>
                <Text style={{ fontSize: 14, color: F.ink }}>{sym}{it.price.toFixed(2)}</Text>
              </TouchableOpacity>
              </SwipeableRow>
              );
            })}
          </View>
        </View>
      )}

      {similar.length > 0 && (
        <View>
          <Text style={{ fontSize: 16, color: F.ink, marginBottom: 10 }}>
            More in {e.category_name || 'this category'}
          </Text>
          <View style={{ backgroundColor: F.surface, borderRadius: 18, borderWidth: 1,
            borderColor: F.line, overflow: 'hidden', marginBottom: 16 }}>
            {similar.map((s, i) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => navigation.replace('Detail', { id: s.id })}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                  padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
                <Text style={{ fontSize: 20 }}>{s.category_emoji || '💰'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: F.ink }}>{s.merchant}</Text>
                  <Text style={{ fontSize: 11, color: F.ink3 }}>{s.expense_date}</Text>
                </View>
                <Text style={{ fontSize: 14, color: F.ink }}>{sym}{s.amount.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* PS-37 — log a refund/return of this spend. Prefills Add's refund mode
          with the original merchant/category/amount; the saved row is negative
          and linked back here. Hidden once already refunded or on a refund row. */}
      {canRefund && refunds.length === 0 && (
        <TouchableOpacity
          onPress={() => navigation.navigate('Add', {
            refundOfExpenseId: e.id,
            prefillAmount: e.amount,
            prefillMerchant: e.merchant,
            prefillCategoryId: e.category_id,
          })}
          style={{ padding: 14, borderRadius: 12, marginBottom: 10,
            backgroundColor: F.mint, borderWidth: 1, borderColor: F.sageD, alignItems: 'center' }}>
          <Text style={{ color: F.sageD, fontWeight: '600' }}>↩ Mark as refunded</Text>
        </TouchableOpacity>
      )}

      {/* PS-48 — one-page PDF for reimbursement (expense + items + GST + receipt). */}
      <TouchableOpacity
        onPress={handleExportPdf}
        disabled={exportingPdf}
        accessibilityRole="button" accessibilityLabel="Export this expense as PDF"
        style={{ padding: 14, borderRadius: 12, marginBottom: 10, opacity: exportingPdf ? 0.6 : 1,
          backgroundColor: F.surface, borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
        <Text style={{ color: F.ink, fontWeight: '600' }}>
          {exportingPdf ? 'Preparing PDF…' : '📄 Export as PDF'}
        </Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          onPress={() => navigation.navigate('EditExpense', { id: e.id })}
          style={{ flex: 1, padding: 14, borderRadius: 12,
            backgroundColor: F.surface, borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
          <Text style={{ color: F.ink, fontWeight: '600' }}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDelete}
          style={{ flex: 1, padding: 14, borderRadius: 12,
            backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca', alignItems: 'center' }}>
          <Text style={{ color: '#e55', fontWeight: '600' }}>Delete</Text>
        </TouchableOpacity>
      </View>

      <ReceiptViewer
        visible={viewerOpen}
        expense={eForReceipt}
        onClose={() => setViewerOpen(false)}
        onMigrated={(next) => setReceiptOverlay({
          receipt_path: next.receipt_path,
          receipt_thumb: next.receipt_thumb,
          receipt_bytes: next.receipt_bytes,
        })}
      />
    </ScrollView>
  );
}

export default React.memo(Detail);
