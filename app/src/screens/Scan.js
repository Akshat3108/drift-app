import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useApp } from '../hooks/useAppState';
import { Btn } from '../components/UI';

const API = 'http://10.0.2.2:3001'; // Android emulator → localhost; replace with your IP for physical device

export default function Scan({ navigation }) {
  const { F, sym, pots, addExpense } = useApp();
  const insets = useSafeAreaInsets();
  const [stage, setStage]   = useState('idle'); // idle | scanning | review | error
  const [image, setImage]   = useState(null);
  const [items, setItems]   = useState([]);
  const [merchant, setMerchant] = useState('');
  const [total, setTotal]   = useState(0);
  const [potKey, setPotKey] = useState('groc');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const pickImage = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera access needed', 'Please allow camera access to scan receipts.');
      return;
    }
    Alert.alert('Add receipt', 'Choose source', [
      { text: 'Camera', onPress: () => openCamera() },
      { text: 'Gallery', onPress: () => openGallery() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openCamera = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) processImage(result.assets[0]);
  };

  const openGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) processImage(result.assets[0]);
  };

  const processImage = async (asset) => {
    setImage(asset.uri);
    setStage('scanning');
    setLoading(true);
    setErrorMsg('');
    try {
      const formData = new FormData();
      formData.append('receipt', {
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: 'receipt.jpg',
      });
      const resp = await fetch(`${API}/api/upload/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'OCR failed');

      setMerchant(data.merchant || 'Unknown store');
      setItems(data.items || []);
      setTotal(data.total || (data.items || []).reduce((s, i) => s + i.price, 0));
      setStage('review');
    } catch (err) {
      setErrorMsg(err.message);
      setStage('error');
    } finally {
      setLoading(false);
    }
  };

  const save = () => {
    const pot = pots.find(p => p.key === potKey);
    addExpense({
      merchant, cat: pot?.label || 'Groceries', icon: pot?.emoji || '🥬',
      amount: total, time: 'Just now', mood: '😌', carbon: 3.2, potKey,
    });
    Alert.alert('Saved!', `${items.length} items added to ${pot?.label}`, [
      { text: 'OK', onPress: () => { setStage('idle'); navigation.navigate('Home'); } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: F.bg }}>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text style={{ fontSize: 24, color: F.ink, fontWeight: '400' }}>
          Scan a receipt
        </Text>
        <Text style={{ fontSize: 13, color: F.ink2, marginTop: 4 }}>
          Claude AI reads every line item automatically
        </Text>
      </View>

      {stage === 'idle' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <TouchableOpacity onPress={pickImage} activeOpacity={0.85}
            style={{ width: '100%', aspectRatio: 3/4, maxHeight: 400,
              backgroundColor: '#1a1612', borderRadius: 28, alignItems: 'center',
              justifyContent: 'center', borderWidth: 2.5, borderColor: F.coral,
              borderStyle: 'dashed' }}>
            <Text style={{ fontSize: 64 }}>📷</Text>
            <Text style={{ color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '500' }}>Tap to scan</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 6, fontSize: 13 }}>Camera or gallery</Text>
          </TouchableOpacity>
          <Text style={{ marginTop: 16, fontSize: 12, color: F.ink3, textAlign: 'center' }}>
            Supports JPG, PNG, HEIC up to 10 MB
          </Text>
        </View>
      )}

      {stage === 'scanning' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          {image && <Image source={{ uri: image }} style={{ width: 200, height: 260, borderRadius: 16, opacity: 0.7 }}/>}
          <ActivityIndicator size="large" color={F.coral}/>
          <Text style={{ fontSize: 16, color: F.ink, fontWeight: '500' }}>Reading line items…</Text>
          <Text style={{ fontSize: 13, color: F.ink2 }}>Claude is extracting your receipt</Text>
        </View>
      )}

      {stage === 'error' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 48 }}>⚠️</Text>
          <Text style={{ fontSize: 18, color: F.ink, marginTop: 12, fontWeight: '500' }}>Scan failed</Text>
          <Text style={{ fontSize: 13, color: F.ink2, textAlign: 'center', marginTop: 8 }}>{errorMsg}</Text>
          <TouchableOpacity onPress={() => setStage('idle')} style={{ marginTop: 24,
            backgroundColor: F.coral, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      {stage === 'review' && (
        <ScrollView style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 100 }}>
          {/* Store + total */}
          <View style={{ backgroundColor: F.cream, borderRadius: 24, padding: 20, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text style={{ fontSize: 22, color: F.ink, fontWeight: '400' }}>{merchant}</Text>
                <Text style={{ fontSize: 13, color: F.ink2 }}>{items.length} items extracted</Text>
              </View>
              <Text style={{ fontSize: 28, color: F.ink }}>{sym}{total.toFixed(2)}</Text>
            </View>

            {/* Pot selector */}
            <Text style={{ fontSize: 12, color: F.ink3, marginTop: 16, marginBottom: 8 }}>Save to category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {pots.map(p => {
                  const sel = potKey === p.key;
                  return (
                    <TouchableOpacity key={p.key} onPress={() => setPotKey(p.key)}
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

          {/* Line items */}
          <View style={{ backgroundColor: F.surface, borderRadius: 20, borderWidth: 1, borderColor: F.line, overflow: 'hidden' }}>
            {items.map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: F.line }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: F.cream,
                  alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16 }}>🛒</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: F.ink }}>{it.name}</Text>
                  {it.qty && <Text style={{ fontSize: 11, color: F.ink3 }}>{it.qty}</Text>}
                </View>
                <Text style={{ fontSize: 14, fontWeight: '500', color: F.ink }}>{sym}{it.price?.toFixed(2)}</Text>
              </View>
            ))}
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <TouchableOpacity onPress={() => setStage('idle')} style={{ flex: 1,
              padding: 14, borderRadius: 12, backgroundColor: F.surface,
              borderWidth: 1, borderColor: F.line, alignItems: 'center' }}>
              <Text style={{ color: F.ink, fontWeight: '600', fontSize: 14 }}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} style={{ flex: 2,
              padding: 14, borderRadius: 12, backgroundColor: F.coral, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Save · {sym}{total.toFixed(2)}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
