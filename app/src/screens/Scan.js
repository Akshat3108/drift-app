import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image, TextInput, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../hooks/useAppState';
import { recognize } from '../ocr/textRecognition';
import { parseReceipt, recalcItem } from '../ocr/parseReceipt';
import { UNIT_OPTIONS } from '../ocr/units';
import { PRODUCE } from '../ocr/produceList';
import { normalizeName } from '../ocr/normalizeName';

export default function Scan({ navigation }) {
  const { F, sym, pots, addExpenseWithItems } = useApp();
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
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) processImage(result.assets[0]);
  };

  const openGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) processImage(result.assets[0]);
  };

  const processImage = async (asset) => {
    setImage(asset.uri);
    setStage('scanning');
    setErrorMsg('');
    try {
      const ocr = await recognize(asset.uri);
      const parsed = parseReceipt(ocr);
      setMerchant(parsed.merchant);
      setDate(parsed.date);
      setItems(parsed.items);
      setTotal(parsed.total || parsed.items.reduce((s, i) => s + i.price, 0));
      const guess = parsed.items.some(i => i.kind === 'produce')
        ? pots.find(p => /grocer/i.test(p.name))?.id
        : pots.find(p => /grocer/i.test(p.name))?.id;
      setPotId(guess || pots[0]?.id || null);
      setStage('review');
    } catch (err) {
      setErrorMsg(err.message || String(err));
      setStage('error');
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

  const save = async () => {
    if (!potId) return Alert.alert('Pick a category');
    if (!merchant.trim()) return Alert.alert('Enter the store name');
    const validItems = items.filter(it => it.name?.trim() && it.price > 0);
    if (!validItems.length && total <= 0) {
      return Alert.alert('Add at least one item or set the total');
    }
    setSavingExpense(true);
    try {
      await addExpenseWithItems({
        expense: {
          category_id: potId,
          merchant: merchant.trim(),
          amount: total,
          expense_date: date || undefined,
          mood: '😌',
          carbon: 0,
          receipt_uri: image,
        },
        items: validItems,
      });
      Alert.alert(
        'Saved!',
        `${validItems.length} item${validItems.length === 1 ? '' : 's'} added`,
        [{ text: 'OK', onPress: () => {
          resetScreen();
          navigation.navigate('Home');
        } }],
      );
    } catch (err) {
      Alert.alert('Could not save', err.message || String(err));
    } finally {
      setSavingExpense(false);
    }
  };

  const resetScreen = () => {
    setStage('idle');
    setImage(null);
    setItems([]);
    setMerchant('');
    setDate('');
    setTotal(0);
    setEditingIdx(null);
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
          {image && <Image source={{ uri: image }} style={{ width: 200, height: 260, borderRadius: 16, opacity: 0.7 }}/>}
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
                <TextInput value={date} onChangeText={setDate}
                  placeholder="YYYY-MM-DD" placeholderTextColor={F.ink3}
                  style={{ fontSize: 14, color: F.ink, paddingVertical: 4,
                    borderBottomWidth: 1, borderBottomColor: F.line }}/>
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

            <Text style={{ fontSize: 11, color: F.ink3, marginTop: 16, marginBottom: 8, fontWeight: '700', letterSpacing: 1 }}>
              SAVE TO CATEGORY
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {pots.map(p => {
                  const sel = potId === p.id;
                  return (
                    <TouchableOpacity key={p.id} onPress={() => setPotId(p.id)}
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
              <TouchableOpacity onPress={recomputeTotal}>
                <Text style={{ color: F.coral, fontSize: 12, fontWeight: '600' }}>↺ Recompute total</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addLine}>
                <Text style={{ color: F.coral, fontSize: 12, fontWeight: '600' }}>+ Add line</Text>
              </TouchableOpacity>
            </View>
          </View>

          {items.length === 0 ? (
            <View style={{ backgroundColor: F.surface, borderRadius: 20, padding: 24,
              alignItems: 'center', borderWidth: 1, borderColor: F.line }}>
              <Text style={{ fontSize: 13, color: F.ink2 }}>No items detected — tap "Add line" or just save with the total.</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
              {items.map((it, i) => (
                <TouchableOpacity key={i} onPress={() => setEditingIdx(i)} activeOpacity={0.7}
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

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
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
    </View>
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
