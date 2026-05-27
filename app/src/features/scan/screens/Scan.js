import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, TextInput, Modal, Platform } from 'react-native';
import DriftImage from '@components/DriftImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useApp } from '../../../hooks/useAppState';
import { useExpenses } from '@features/expenses/context';
import { useFuel } from '@features/fuel/context';
import { scanAndProcess, scanAndProcessMore, recalcItem, fingerprintReceipt, softFingerprint, CancelledError } from '@features/scan/ScanService';
import { persistReceipt } from '@media/receipts';
import { UNIT_OPTIONS } from '@core/domain/units';
import { PRODUCE } from '@core/domain/produce';
import { normalizeName } from '@core/domain/normalize';
import { useToast } from '@components/Toast';
import { writeCandidate as writeGoldenCandidate } from '@ocr/golden/capture';
import { templates as receiptTemplates } from '@features/scan/templates.repo';

function Scan({ navigation, route }) {
  const { F, sym, pots, addExpenseWithItems } = useApp();
  const { findDuplicate } = useExpenses();
  // 7.6 — Fuel & vehicle linkage. When the parser detects a fuel receipt and
  // the user has at least one vehicle, the review screen surfaces a vehicle
  // chip and saves the row via addFillup (atomic expense + fillup write)
  // instead of the generic addExpenseWithItems path.
  const { vehicles: fuelVehicles, addFillup, lastVehicleUsed } = useFuel();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [stage, setStage]     = useState('idle');
  const [image, setImage]     = useState(null);
  const [merchant, setMerchant] = useState('');
  const [date, setDate]       = useState('');
  const [items, setItems]     = useState([]);
  const [total, setTotal]     = useState(0);
  const [potId, setPotId]     = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [editingIdx, setEditingIdx] = useState(null);
  const [savingExpense, setSavingExpense] = useState(false);
  const [format, setFormat]   = useState('');
  // 7.6 — selected vehicle for the fuel-fillup write. null = "don't link to a
  // vehicle, save as a normal expense". Initialised on processImage when
  // parsed.format === 'fuel'.
  const [vehicleId, setVehicleId] = useState(null);
  // Optional odometer reading captured at scan time; null = unknown.
  const [odometerKm, setOdometerKm] = useState('');
  const [formatLabel, setFormatLabel] = useState('');
  const [confidence, setConfidence]   = useState(null);
  const [fees, setFees]               = useState([]);
  const [taxInvoice, setTaxInvoice]   = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  // 4.14 — pending duplicate prompt. When non-null, the dedup modal is open
  // and `pendingDupSave` holds the about-to-be-saved expense + items.
  const [dupCheck, setDupCheck] = useState(null);
  const [pendingDupSave, setPendingDupSave] = useState(null);
  // 4.19 — snapshot of the raw OCR + parser output captured at scan time,
  // used by the golden-candidate capture pipeline at save time. Refs (not
  // state) because nothing in the UI reads them and we don't want edits to
  // re-render. Cleared by resetScreen.
  const captureRef = useRef({ ocr: null, processed: null });
  // 4.22 — material the templates.recordSample call needs after save. Lives
  // in a ref so resetScreen() doesn't have to remember to clear it (the next
  // processImage call will overwrite). merchantId is set during scan to the
  // resolved merchants.id; parsedForTemplate carries format/bands/columns
  // for the running-average update.
  const templateRef = useRef({ merchantId: null, parsedForTemplate: null });
  // 4.24 — multi-page state. pagesRef accumulates per-page parsed snapshots
  // in capture order; scanAndProcessMore merges them on every page add.
  // pageCount is mirrored as state so the "Add another page" pill on the
  // review screen re-renders when a page lands.
  const pagesRef = useRef([]);
  const [pageCount, setPageCount] = useState(0);
  const [addingPage, setAddingPage] = useState(false);

  // 8.5 — Monotonic per-scan counter. Each invocation of processImage /
  // addPageFromPicker snapshots ++scanRequestRef.current; subsequent bumps
  // (re-tap Scan, Reset, unmount) make every snapshot stale, which the
  // signal below uses to throw CancelledError after the next stage yield.
  const scanRequestRef = useRef(0);

  // 8.5 — Bump the request counter when the screen unmounts so any in-flight
  // scan is invalidated and its post-resolve state writes are dropped.
  useEffect(() => () => { scanRequestRef.current += 1; }, []);

  const dateAsDate = (() => {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [y, m, d] = date.split('-').map(Number);
      const candidate = new Date(y, m - 1, d);
      if (!isNaN(candidate)) return candidate;
    }
    return new Date();
  })();

  const formatDateLong = (d) => {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'Select date';
    const [y, m, day] = d.split('-').map(Number);
    const dt = new Date(y, m - 1, day);
    return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const onDateChange = (event, selected) => {
    // Android closes the dialog itself; iOS keeps it open until dismissed.
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event?.type === 'dismissed') return;
    if (selected instanceof Date && !isNaN(selected)) {
      const y = selected.getFullYear();
      const m = String(selected.getMonth() + 1).padStart(2, '0');
      const d = String(selected.getDate()).padStart(2, '0');
      setDate(`${y}-${m}-${d}`);
    }
  };

  const pickImage = async () => {
    const cam  = await ImagePicker.requestCameraPermissionsAsync();
    if (cam.status !== 'granted' && cam.status !== 'undetermined') {
      Alert.alert('Camera access needed', 'Please allow camera access to scan receipts.');
    }
    Alert.alert('Add receipt', 'Choose source', [
      { text: 'Camera', onPress: openCamera },
      { text: 'Gallery', onPress: openGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openCamera = async () => {
    const result = await ImagePicker.launchCameraAsync({ quality: 1.0 });
    if (!result.canceled && result.assets?.[0]) processImage(result.assets[0]);
  };

  const openGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 1.0 });
    if (!result.canceled && result.assets?.[0]) processImage(result.assets[0]);
  };

  // PS-16 — Share-target intent (Gallery → Drift). When the user shares an
  // image to Drift, MainActivity.kt rewrites the SEND intent into a
  // `drift://scan?image=<encoded uri>` VIEW intent; the linking config
  // routes us here with `route.params.image` set. Trigger the scan
  // automatically (idempotent — clears the param via navigation.setParams).
  const sharedImageProcessedRef = useRef(false);
  useEffect(() => {
    const sharedUri = route?.params?.image;
    if (!sharedUri || sharedImageProcessedRef.current) return;
    sharedImageProcessedRef.current = true;
    try {
      const decoded = typeof sharedUri === 'string' ? decodeURIComponent(sharedUri) : sharedUri;
      processImage({ uri: decoded });
    } catch (_) {
      // URI unreadable — silently ignore so the user lands on the regular Scan screen.
    }
    // Clear so re-renders don't loop.
    navigation?.setParams?.({ image: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.image]);

  const processImage = async (asset) => {
    // 8.5 — Stale-scan guard. Snapshot the counter; if it changes before we
    // finish (re-tap, Reset, unmount), the signal's throwIfCancelled() pops
    // a CancelledError on the next inter-stage yield AND the post-resolve
    // check below drops the state writes if the parse completed between
    // yields too quickly for the cancel to fire.
    const requestId = ++scanRequestRef.current;
    const signal = {
      throwIfCancelled() {
        if (scanRequestRef.current !== requestId) throw new CancelledError();
      },
    };
    setImage(asset.uri);
    setStage('scanning');
    setErrorMsg('');
    try {
      const result = await scanAndProcess(asset.uri, pots, { signal });
      if (scanRequestRef.current !== requestId) return;
      // 4.19 — stash raw OCR and the parser's pre-edit snapshot for the
      // golden capture pipeline. `_ocr` is the ML Kit JSON the parser ate;
      // `result` minus `_ocr` is the review payload the user will edit.
      captureRef.current = {
        ocr: result._ocr || null,
        processed: { ...result, _ocr: undefined },
      };
      // 4.22 — stash the merchant id resolved during scan + the parsed-side
      // material the templates repo needs to update the running averages.
      templateRef.current = {
        merchantId: result.merchantId ?? null,
        parsedForTemplate: result._parsedForTemplate || null,
      };
      // 4.24 — seed the multi-page state. First page items get _pageId=0
      // and _origIdx tags so subsequent merges can preserve user edits via
      // the (pageId, origIdx) lookup.
      pagesRef.current = result._parsed ? [result._parsed] : [];
      setPageCount(pagesRef.current.length);
      const seededItems = result.items.map((it, oi) =>
        it._pageId != null ? it : { ...it, _pageId: 0, _origIdx: oi });
      setMerchant(result.merchant);
      setDate(result.date);
      setItems(seededItems);
      setTotal(result.total);
      setFormatLabel(result.formatLabel);
      setFormat(result.format);
      setConfidence(result.confidence);
      setFees(result.fees);
      setPotId(result.suggestedPotId);
      // 7.6 — when this is a fuel receipt AND the user has at least one
      // vehicle, default the vehicle chip to the most-recently-used vehicle
      // (or the only vehicle, whichever resolves). Failure here is silent:
      // the chip simply stays empty and save falls back to the generic path.
      if (result.format === 'fuel' && fuelVehicles.length > 0) {
        try {
          const last = await lastVehicleUsed();
          setVehicleId(last ?? fuelVehicles[0].id);
        } catch {
          setVehicleId(fuelVehicles[0].id);
        }
      } else {
        setVehicleId(null);
      }
      setOdometerKm('');
      setTaxInvoice({
        gstin:          result.gstin,
        invoice_number: result.invoiceNumber,
        cgst:           result.cgst,
        sgst:           result.sgst,
        igst:           result.igst,
      });
      setStage('review');
    } catch (err) {
      // 8.5 — cancelled scans silently drop. The next scan owns the screen.
      if (err instanceof CancelledError) return;
      if (scanRequestRef.current !== requestId) return;
      setErrorMsg(err.message || String(err));
      setStage('error');
    }
  };

  // 4.24 — Add another page to the current scan. Runs the full OCR+parse
  // pipeline on a fresh image, merges with prior pages, and refreshes the
  // review state. Edits the user has already made to existing items are
  // preserved by looking up (_pageId, _origIdx) tags. Header fields
  // (merchant, date, taxInvoice, potId) that the user has manually
  // changed survive too — we only overwrite when the current value
  // equals the prior-merged value.
  const addAnotherPage = () => {
    Alert.alert('Add another page', 'Choose source', [
      { text: 'Camera',  onPress: () => addPageFromPicker('camera')  },
      { text: 'Gallery', onPress: () => addPageFromPicker('gallery') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const addPageFromPicker = async (source) => {
    const picker = source === 'camera'
      ? ImagePicker.launchCameraAsync({ quality: 1.0 })
      : ImagePicker.launchImageLibraryAsync({ quality: 1.0 });
    const result = await picker;
    if (result.canceled || !result.assets?.[0]) return;
    // 8.5 — same scanRequestRef as processImage so Reset / unmount / a fresh
    // single-page scan invalidates an in-flight page-add too.
    const requestId = ++scanRequestRef.current;
    const signal = {
      throwIfCancelled() {
        if (scanRequestRef.current !== requestId) throw new CancelledError();
      },
    };
    setAddingPage(true);
    try {
      const merged = await scanAndProcessMore(result.assets[0].uri, pagesRef.current, pots, { signal });
      if (scanRequestRef.current !== requestId) return;
      pagesRef.current = merged._pages || pagesRef.current;
      setPageCount(pagesRef.current.length);

      // Edit preservation: build a map of the current items keyed by
      // (pageId, origIdx). Walk the freshly merged items; if a key
      // matches the current state, keep the user's version; otherwise
      // take the merged version. Items the user added manually (no
      // pageId) survive too — appended to the end after the merge.
      setItems(prev => {
        const editMap = new Map();
        const manuallyAdded = [];
        for (const it of prev) {
          if (it._pageId != null && it._origIdx != null) {
            editMap.set(`${it._pageId}:${it._origIdx}`, it);
          } else {
            manuallyAdded.push(it);
          }
        }
        const out = merged.items.map(mi => {
          const k = `${mi._pageId}:${mi._origIdx}`;
          return editMap.has(k) ? editMap.get(k) : mi;
        });
        return out.concat(manuallyAdded);
      });

      // Headers: overwrite only when the current value equals the prior
      // merged value (user hasn't touched). We rely on captureRef's last
      // snapshot for the prior values — refresh captureRef to point at
      // the new merged shape so future header writes compare correctly.
      const priorProcessed = captureRef.current?.processed;
      if (priorProcessed) {
        if (merchant === priorProcessed.merchant) setMerchant(merged.merchant);
        if (date     === priorProcessed.date)     setDate(merged.date);
        if (total    === priorProcessed.total)    setTotal(merged.total);
        const prevTax = priorProcessed.gstin || priorProcessed.invoiceNumber;
        const curTax  = taxInvoice?.gstin   || taxInvoice?.invoice_number;
        if (prevTax === curTax) {
          setTaxInvoice({
            gstin:          merged.gstin,
            invoice_number: merged.invoiceNumber,
            cgst:           merged.cgst,
            sgst:           merged.sgst,
            igst:           merged.igst,
          });
        }
      } else {
        // No prior snapshot — first add. Just take the merged values.
        setMerchant(merged.merchant);
        setDate(merged.date);
        setTotal(merged.total);
        setTaxInvoice({
          gstin:          merged.gstin,
          invoice_number: merged.invoiceNumber,
          cgst:           merged.cgst,
          sgst:           merged.sgst,
          igst:           merged.igst,
        });
      }
      setFormatLabel(`${merged.formatLabel || ''} · ${pagesRef.current.length} pages`.trim());
      setConfidence(merged.confidence);
      setFees(merged.fees);

      // Update refs to point at the merged shape so subsequent page adds
      // and save-time capture see the latest combined state.
      captureRef.current = {
        ocr: merged._ocr || captureRef.current?.ocr || null,
        processed: { ...merged, _ocr: undefined },
      };
      templateRef.current = {
        merchantId: merged.merchantId ?? templateRef.current?.merchantId ?? null,
        parsedForTemplate: merged._parsedForTemplate || templateRef.current?.parsedForTemplate || null,
      };
      toast(`Page ${pagesRef.current.length} added`);
    } catch (err) {
      // 8.5 — silent drop on cancel; the next scan / reset already owns the screen.
      if (err instanceof CancelledError) return;
      if (scanRequestRef.current !== requestId) return;
      Alert.alert('Could not add page', err.message || String(err));
    } finally {
      // Only clear the addingPage spinner if this invocation is still current.
      // A superseded run leaving setAddingPage(false) here would race with
      // a fresh one's setAddingPage(true).
      if (scanRequestRef.current === requestId) setAddingPage(false);
    }
  };

  const updateItem = (i, patch) => {
    setItems(prev => {
      const next = prev.slice();
      const cur = { ...next[i], ...patch };
      if (patch.name !== undefined && cur.name !== prev[i].name) {
        const norm = normalizeName(cur.name);
        cur.normalized_name = norm.normalized_name;
        cur.kind = PRODUCE.has(norm.normalized_name) ? 'produce' : 'grocery';
      }
      next[i] = recalcItem(cur);
      return next;
    });
  };

  const addLine = () => {
    setItems(prev => [
      ...prev,
      recalcItem({
        name: '', normalized_name: '', kind: 'other',
        qty: 1, unit: 'pcs', price: 0,
      }),
    ]);
    setEditingIdx(items.length);
  };

  const removeLine = (i) => {
    setItems(prev => prev.filter((_, k) => k !== i));
  };

  const recomputeTotal = () => {
    const t = items.reduce((s, it) => s + (it.price || 0), 0);
    setTotal(+t.toFixed(2));
  };

  // Build the expense + items payload from current screen state. Reused by
  // the dedup pre-check and the actual save so hash recompute and shape
  // match exactly.
  const buildSavePayload = () => {
    const validItems = items.filter(it => it.name?.trim() && it.price > 0);
    const parsedShape = {
      merchant: merchant.trim(),
      date: date || new Date().toISOString().slice(0, 10),
      total,
      items: validItems,
    };
    const expense = {
      category_id: potId,
      // 4.22 — reuse the scan-time merchants.resolve result so the save
      // transaction doesn't re-run the JW match. Null when scan-time
      // resolve failed (empty merchant string); save path falls back to
      // resolving inside the transaction.
      merchant_id: templateRef.current.merchantId ?? null,
      merchant: merchant.trim(),
      amount: total,
      expense_date: date || undefined,
      mood: null,
      carbon: 0,
      receipt_uri: image,
      receipt_hash: fingerprintReceipt(parsedShape),
      receipt_soft_hash: softFingerprint(parsedShape),
      ...(taxInvoice || {}),
    };
    return { expense, items: validItems, parsedShape };
  };

  const performSave = async ({ expense, items: validItems }) => {
    setSavingExpense(true);
    try {
      // 5.12 — Copy the receipt out of the cache into permanent storage,
      // generate a thumbnail, and stamp the path columns. Failure is
      // non-fatal: persistReceipt returns null, and the row still saves
      // with just the legacy `receipt_uri` populated (5.15 owns the
      // reader flip). Runs synchronously inline because the file paths
      // are bound into the same INSERT as the expense row.
      // 8.6 — pipeline now writes WebP into yyyy/mm partitions and returns
      // a SHA-1 image hash. `expenseDate` drives the partition so files
      // land alongside other receipts from the same month.
      const stored = expense.receipt_uri
        ? await persistReceipt(expense.receipt_uri, { expenseDate: expense.expense_date })
        : null;
      const expenseWithStorage = stored ? {
        ...expense,
        receipt_path:       stored.path,
        receipt_thumb:      stored.thumb,
        receipt_bytes:      stored.bytes,
        receipt_image_hash: stored.imageHash,
      } : expense;
      // 7.6 — fuel-receipt dual-write path. When the parser detected a fuel
      // format AND the user has a vehicle selected on the chip, we route the
      // save through addFillup which atomically inserts the expense row +
      // the linked fuel_fillups row. The fuel line item carries qty=liters
      // and price=total; we pull from validItems[0] when present and fall
      // back to total when the user wiped the line. Falls through to the
      // normal addExpenseWithItems path whenever vehicleId is null.
      if (format === 'fuel' && vehicleId != null) {
        const fuelItem = validItems[0] || null;
        const litersN = fuelItem?.qty ?? null;
        const ratePerL = fuelItem?.unit_price ?? null;
        const ftype = fuelItem?.name
          ? (/diesel/i.test(fuelItem.name) ? 'Diesel'
            : /cng/i.test(fuelItem.name) ? 'CNG'
            : /electric/i.test(fuelItem.name) ? 'Electric'
            : 'Petrol')
          : null;
        const odoN = odometerKm.trim() ? parseFloat(odometerKm) : null;
        await addFillup({
          expense: expenseWithStorage,
          fillup: {
            vehicle_id: vehicleId,
            fill_date: expense.expense_date || null,
            liters: litersN ?? 0,
            rate_per_l: ratePerL,
            amount: expense.amount,
            odometer_km: Number.isFinite(odoN) ? odoN : null,
            is_full_tank: true,
            fuel_type: ftype,
            notes: null,
          },
        });
      } else {
        await addExpenseWithItems({ expense: expenseWithStorage, items: validItems });
      }
      // 4.19 — fire-and-forget golden-candidate capture. Failures here must
      // not block the save UX (a write error on the candidate file would
      // still let the expense save succeed). Runs OFF the critical path.
      const cap = captureRef.current;
      if (cap?.ocr && cap?.processed) {
        writeGoldenCandidate({
          ocr: cap.ocr,
          processed: cap.processed,
          saved: {
            merchant: expense.merchant,
            date: expense.expense_date,
            total: expense.amount,
            items: validItems,
            potId: expense.category_id,
          },
        }).catch(() => {});
      }
      // 4.22 — fire-and-forget template-learning update. Only fires when
      // the scan-time merchants.resolve gave us an id AND the orchestrator
      // attached a parsed-side payload. A failure here (DB locked, sample
      // shape malformed) must not block the save toast — same discipline
      // as the golden capture call above.
      const tpl = templateRef.current;
      if (tpl?.merchantId && tpl?.parsedForTemplate) {
        receiptTemplates.recordSample({
          merchantId: tpl.merchantId,
          parsed: tpl.parsedForTemplate,
        }).catch(() => {});
      }
      toast(`Saved · ${validItems.length} item${validItems.length === 1 ? '' : 's'} added`);
      resetScreen();
      navigation.navigate('Home');
    } catch (err) {
      Alert.alert('Could not save', err.message || String(err));
    } finally {
      setSavingExpense(false);
    }
  };

  const save = async () => {
    if (!potId) return Alert.alert('Pick a category');
    if (!merchant.trim()) return Alert.alert('Enter the store name');
    const payload = buildSavePayload();
    if (!payload.items.length && total <= 0) {
      return Alert.alert('Add at least one item or set the total');
    }
    // 4.14 — dedup pre-check. We re-hash on the in-memory parsed shape
    // (post-edit) so user corrections invalidate the OCR-time hash before
    // we look it up.
    const dup = await findDuplicate({
      hash: payload.expense.receipt_hash,
      softHash: payload.expense.receipt_soft_hash,
      date: payload.parsedShape.date,
    });
    if (dup) {
      setPendingDupSave(payload);
      setDupCheck(dup);
      return;
    }
    await performSave(payload);
  };

  // "Keep both" path from the dedup modal. The hashes are kept on the new
  // row regardless, so a later third scan of the same bill will still match
  // either of them.
  const confirmKeepBoth = async () => {
    const payload = pendingDupSave;
    setDupCheck(null);
    setPendingDupSave(null);
    if (payload) await performSave(payload);
  };

  const cancelDup = () => {
    setDupCheck(null);
    setPendingDupSave(null);
  };

  const resetScreen = () => {
    // 8.5 — invalidate any in-flight scan so its post-resolve state writes
    // don't overwrite the freshly-reset screen.
    scanRequestRef.current += 1;
    setStage('idle');
    setImage(null);
    setItems([]);
    setMerchant('');
    setDate('');
    setTotal(0);
    setEditingIdx(null);
    setFormatLabel('');
    setFormat('');
    setVehicleId(null);
    setOdometerKm('');
    setConfidence(null);
    setFees([]);
    setTaxInvoice(null);
    setDupCheck(null);
    setPendingDupSave(null);
    captureRef.current = { ocr: null, processed: null };
    // 4.24 — clear multi-page state so the next scan starts at page 1.
    pagesRef.current = [];
    setPageCount(0);
    setAddingPage(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
          Scan a receipt
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginTop: 4 }}>
          On-device OCR — works offline.
        </Text>
      </View>

      {stage === 'idle' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <TouchableOpacity onPress={pickImage} activeOpacity={0.85}
            style={{ width: '100%', aspectRatio: 3 / 4, maxHeight: 400,
              backgroundColor: '#1a1612', borderRadius: 28, alignItems: 'center',
              justifyContent: 'center', borderWidth: 2.5, borderColor: F.coral,
              borderStyle: 'dashed' }}>
            <Text style={{ fontSize: 64 }}>📷</Text>
            <Text style={{ color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '500' }}>Tap to scan</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 6, fontSize: 13 }}>Camera or gallery</Text>
          </TouchableOpacity>
          <Text style={{ marginTop: 16, fontSize: 12, color: F.ink3, textAlign: 'center' }}>
            Detects merchant, items, qty, unit & price.
          </Text>
        </View>
      )}

      {stage === 'scanning' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          {image && <DriftImage source={{ uri: image }} style={{ width: 200, height: 260, borderRadius: 16, opacity: 0.7 }}/>}
          <ActivityIndicator size="large" color={F.coral}/>
          <Text style={{ fontSize: 16, color: F.ink, fontWeight: '500' }}>Reading line items…</Text>
          <Text style={{ fontSize: 13, color: F.ink2 }}>This stays on your device</Text>
        </View>
      )}

      {stage === 'error' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48 }}>⚠️</Text>
          <Text style={{ fontSize: 18, color: F.ink, marginTop: 12, fontWeight: '500' }}>Scan failed</Text>
          <Text style={{ fontSize: 13, color: F.ink2, textAlign: 'center', marginTop: 8 }}>{errorMsg}</Text>
          <TouchableOpacity onPress={resetScreen} style={{ marginTop: 24,
            backgroundColor: F.coral, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      {stage === 'review' && (
        <ScrollView style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 120 }}>
          {(formatLabel || confidence) && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              {formatLabel ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
                  backgroundColor: F.cream, borderWidth: 1, borderColor: F.line }}>
                  <Text style={{ fontSize: 11, color: F.ink2, fontWeight: '600' }}>{formatLabel}</Text>
                </View>
              ) : null}
              {confidence ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
                  backgroundColor: confidence.label === 'high' ? '#dcf5e3'
                                   : confidence.label === 'medium' ? '#fff4d9' : '#fde4e1',
                  borderWidth: 1,
                  borderColor: confidence.label === 'high' ? '#7fc89a'
                              : confidence.label === 'medium' ? '#e9c46a' : '#f0a89e' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600',
                    color: confidence.label === 'high' ? '#1d6b3a'
                          : confidence.label === 'medium' ? '#7a5a14' : '#a13a2a' }}>
                    {confidence.label === 'high' ? '✓' : confidence.label === 'medium' ? '!' : '⚠'}
                    {' '}Confidence: {Math.round(confidence.overall * 100)}%
                  </Text>
                </View>
              ) : null}
            </View>
          )}
          <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 20, marginBottom: 16 }}>
            <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1 }}>STORE</Text>
            <TextInput
              value={merchant}
              onChangeText={setMerchant}
              style={{ fontSize: 22, color: F.ink, fontWeight: '400', paddingVertical: 6,
                borderBottomWidth: 1, borderBottomColor: F.line, marginBottom: 10 }}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1 }}>DATE</Text>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                  style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: F.line }}
                >
                  <Text style={{ fontSize: 14, color: date ? F.ink : F.ink3 }}>
                    {formatDateLong(date)}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1 }}>TOTAL</Text>
                <TextInput
                  value={String(total)}
                  onChangeText={v => setTotal(parseFloat(v.replace(/[^0-9.]/g, '')) || 0)}
                  keyboardType="decimal-pad"
                  style={{ fontSize: 22, color: F.coral, fontWeight: '600', paddingVertical: 2,
                    borderBottomWidth: 1, borderBottomColor: F.line }}/>
              </View>
            </View>

            {/* 7.6 — vehicle chip for fuel receipts. Only renders when the
                parser detected a fuel format. Tapping "None" un-links the
                fillup so the row saves as a normal expense. */}
            {format === 'fuel' && fuelVehicles.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 11, color: F.ink3, marginBottom: 8, fontWeight: '700', letterSpacing: 1 }}>
                  VEHICLE
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => setVehicleId(null)}
                      accessibilityRole="button"
                      accessibilityLabel="Don't link to a vehicle"
                      accessibilityState={{ selected: vehicleId == null }}
                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99,
                        backgroundColor: vehicleId == null ? F.coral : F.surface,
                        borderWidth: 1, borderColor: vehicleId == null ? F.coral : F.line }}>
                      <Text style={{ fontSize: 12, color: vehicleId == null ? '#fff' : F.ink2,
                        fontWeight: vehicleId == null ? '600' : '400' }}>None</Text>
                    </TouchableOpacity>
                    {fuelVehicles.map((v) => {
                      const sel = v.id === vehicleId;
                      return (
                        <TouchableOpacity key={v.id} onPress={() => setVehicleId(v.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Vehicle ${v.name}`}
                          accessibilityState={{ selected: sel }}
                          style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99,
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                            backgroundColor: sel ? F.coral : F.surface,
                            borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                          <Text style={{ fontSize: 13 }}>{v.icon || '🚗'}</Text>
                          <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink2,
                            fontWeight: sel ? '600' : '400' }}>{v.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
                {vehicleId != null && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ fontSize: 10, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>
                      ODOMETER (KM, OPTIONAL)
                    </Text>
                    <TextInput
                      value={odometerKm}
                      onChangeText={setOdometerKm}
                      placeholder="42150"
                      placeholderTextColor={F.ink3}
                      keyboardType="decimal-pad"
                      style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: F.line,
                        fontSize: 14, color: F.ink }}/>
                  </View>
                )}
              </View>
            )}

            <Text style={{ fontSize: 11, color: F.ink3, marginTop: 16, marginBottom: 8, fontWeight: '700', letterSpacing: 1 }}>
              SAVE TO CATEGORY
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {pots.map(p => {
                  const sel = potId === p.id;
                  return (
                    <TouchableOpacity key={p.id} onPress={() => setPotId(p.id)}
                      hitSlop={{ top: 8, bottom: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Category: ${p.label}`}
                      accessibilityState={{ selected: sel }}
                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99,
                        backgroundColor: sel ? F.coral : F.surface,
                        borderWidth: 1, borderColor: sel ? F.coral : F.line,
                        flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={{ fontSize: 13 }}>{p.emoji}</Text>
                      <Text style={{ fontSize: 12, color: sel ? '#fff' : F.ink2, fontWeight: sel ? '600' : '400' }}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontSize: 15, color: F.ink, fontWeight: '500' }}>
              Items ({items.length})
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={recomputeTotal}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Recompute total from items">
                <Text style={{ color: F.coral, fontSize: 12, fontWeight: '600' }}>↺ Recompute total</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addLine}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Add a blank item line">
                <Text style={{ color: F.coral, fontSize: 12, fontWeight: '600' }}>+ Add line</Text>
              </TouchableOpacity>
            </View>
          </View>

          {items.length === 0 && (
            <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 24,
              alignItems: 'center', borderWidth: 1, borderColor: F.line }}>
              <Text style={{ fontSize: 13, color: F.ink2 }}>No items detected — tap "Add line" or just save with the total.</Text>
            </View>
          )}

          {fees.length > 0 && (
            <View style={{ backgroundColor: F.cream, borderRadius: 14, padding: 14, marginTop: 12 }}>
              <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>FEES & CHARGES</Text>
              {fees.map((f, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                  <Text style={{ fontSize: 13, color: F.ink2 }}>{f.label}</Text>
                  <Text style={{ fontSize: 13, color: F.ink2, fontWeight: '500' }}>{sym}{f.amount.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}

          {items.length > 0 && (
            <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
              {items.map((it, i) => (
                <TouchableOpacity key={i} onPress={() => setEditingIdx(i)} activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit item ${it.name || 'unnamed'}, ${sym}${it.price.toFixed(2)}`}
                  style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: F.cream,
                      alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 16 }}>{it.kind === 'produce' ? '🥬' : '🛒'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: F.ink, textTransform: 'capitalize' }}>
                        {it.name || '(no name)'}
                      </Text>
                      <Text style={{ fontSize: 11, color: F.ink3 }}>
                        {it.qty} {it.unit} · {sym}{(it.unit_price || 0).toFixed(2)}/{it.canonical_unit}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: F.ink }}>{sym}{it.price.toFixed(2)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 4.24 — Multi-page capture. Visible after the first page lands.
              On tap, prompts Camera/Gallery, OCRs the new page, and merges
              into the current review. Edits to existing rows are preserved
              by (_pageId, _origIdx) lookup in addPageFromPicker. */}
          <TouchableOpacity onPress={addAnotherPage} disabled={addingPage}
            accessibilityRole="button"
            accessibilityLabel={addingPage ? 'Adding page' : `Add page ${pageCount + 1} for long receipts`}
            style={{ marginTop: 20, padding: 12, borderRadius: 12,
              backgroundColor: F.cream, borderWidth: 1, borderColor: F.line,
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
              opacity: addingPage ? 0.6 : 1 }}>
            {addingPage
              ? <ActivityIndicator size="small" color={F.ink2}/>
              : <Text style={{ fontSize: 16 }}>📄</Text>}
            <Text style={{ color: F.ink, fontWeight: '600', fontSize: 13 }}>
              {addingPage
                ? 'Adding page…'
                : `Add page ${pageCount + 1} · for long receipts`}
            </Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity onPress={resetScreen} style={{ flex: 1,
              padding: 14, borderRadius: 12, backgroundColor: F.surface,
              borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
              <Text style={{ color: F.ink, fontWeight: '600', fontSize: 14 }}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} disabled={savingExpense}
              style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: F.coral,
                alignItems: 'center', opacity: savingExpense ? 0.6 : 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                {savingExpense ? 'Saving…' : `Save · ${sym}${total.toFixed(2)}`}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      <ItemEditor
        F={F} sym={sym}
        visible={editingIdx !== null}
        item={editingIdx !== null ? items[editingIdx] : null}
        onClose={() => setEditingIdx(null)}
        onChange={(patch) => updateItem(editingIdx, patch)}
        onDelete={() => { removeLine(editingIdx); setEditingIdx(null); }}
      />

      {showDatePicker && (
        <DateTimePicker
          value={dateAsDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={new Date()}
          onChange={onDateChange}
        />
      )}

      <DuplicateModal
        F={F}
        sym={sym}
        visible={!!dupCheck}
        dup={dupCheck}
        onCancel={cancelDup}
        onKeepBoth={confirmKeepBoth}
      />
    </View>
  );
}

function DuplicateModal({ visible, dup, F, sym, onCancel, onKeepBoth }) {
  if (!dup) return null;
  const exact = dup.kind === 'exact';
  const title = exact ? 'Exact duplicate' : 'Possible duplicate';
  const body = exact
    ? 'A receipt with the same merchant, date, total, and items is already saved.'
    : 'A receipt with the same merchant and total exists within a day of this one.';
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 24 }}>
        <View style={{ backgroundColor: F.bg, padding: 22, borderRadius: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: F.ink, marginBottom: 8 }}>{title}</Text>
          <Text style={{ fontSize: 13, color: F.ink2, lineHeight: 19 }}>{body}</Text>
          <View style={{ backgroundColor: F.cream, borderRadius: 12, padding: 12, marginTop: 14 }}>
            <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1 }}>EXISTING</Text>
            <Text style={{ fontSize: 14, color: F.ink, marginTop: 4 }}>
              {dup.expense?.merchant || 'Unknown'} · {sym}{Number(dup.expense?.amount || 0).toFixed(2)}
            </Text>
            <Text style={{ fontSize: 12, color: F.ink3, marginTop: 2 }}>{dup.expense?.expense_date}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <TouchableOpacity onPress={onCancel}
              style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: F.surface,
                borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
              <Text style={{ color: F.ink, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onKeepBoth}
              style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: F.coral, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Keep both</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ItemEditor({ visible, item, F, sym, onClose, onChange, onDelete }) {
  if (!item) return null;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: F.bg, padding: 22,
          borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <Text style={{ fontSize: 18, color: F.ink, fontWeight: '500', marginBottom: 16 }}>
            Edit item
          </Text>

          <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>NAME</Text>
          <TextInput
            value={item.name}
            onChangeText={t => onChange({ name: t })}
            placeholder="e.g. Tomato"
            placeholderTextColor={F.ink3}
            autoCapitalize="words"
            style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: F.line,
              backgroundColor: F.surface, fontSize: 16, color: F.ink, marginBottom: 12 }}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>QTY</Text>
              <TextInput
                value={String(item.qty)}
                onChangeText={t => {
                  const v = parseFloat(t.replace(/[^0-9.]/g, ''));
                  onChange({ qty: isFinite(v) && v > 0 ? v : 1 });
                }}
                keyboardType="decimal-pad"
                style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: F.line,
                  backgroundColor: F.surface, fontSize: 16, color: F.ink }}
              />
            </View>
            <View style={{ flex: 2 }}>
              <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>UNIT</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {UNIT_OPTIONS.map(u => {
                    const sel = u === item.unit;
                    return (
                      <TouchableOpacity key={u} onPress={() => onChange({ unit: u })}
                        style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
                          backgroundColor: sel ? F.coral : F.surface,
                          borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                        <Text style={{ color: sel ? '#fff' : F.ink, fontSize: 13, fontWeight: '600' }}>{u}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </View>

          <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>PRICE</Text>
          <TextInput
            value={String(item.price)}
            onChangeText={t => {
              const v = parseFloat(t.replace(/[^0-9.]/g, ''));
              onChange({ price: isFinite(v) ? v : 0 });
            }}
            keyboardType="decimal-pad"
            style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: F.line,
              backgroundColor: F.surface, fontSize: 18, color: F.ink, marginBottom: 12 }}
          />

          <View style={{ backgroundColor: F.cream, borderRadius: 12, padding: 12, marginBottom: 16 }}>
            <Text style={{ fontSize: 11, color: F.ink3 }}>UNIT PRICE</Text>
            <Text style={{ fontSize: 20, color: F.coral, fontWeight: '600' }}>
              {sym}{(item.unit_price || 0).toFixed(2)}/{item.canonical_unit}
            </Text>
            <Text style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>
              = {sym}{item.price.toFixed(2)} ÷ {item.canonical_qty} {item.canonical_unit}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={onDelete}
              style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#fee2e2',
                alignItems: 'center' }}>
              <Text style={{ color: '#e55', fontWeight: '600' }}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose}
              style={{ flex: 2, padding: 14, borderRadius: 12, backgroundColor: F.coral, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default React.memo(Scan);
