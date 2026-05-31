import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@core/theme/ThemeContext';
import { useSettings } from '../settings.context';
import { ACCENTS, ACCENT_KEYS } from '../../../theme/accent';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// PS-49 — Theme sub-screen. Eight named swatches + a custom-hex fallback +
// reset-to-default. Writing `accent_color` re-renders ThemedChildren, so the
// whole app (and the live preview below) re-themes immediately on tap.
function EditTheme() {
  const { F } = useTheme();
  const { settings, setSetting } = useSettings();
  const insets = useSafeAreaInsets();
  const [hexDraft, setHexDraft] = useState('');

  const current = settings.accent_color || null;        // named key or hex, or null
  const hexValid = HEX_RE.test(hexDraft.trim());
  // A swatch is "selected" when accent_color equals its key. A custom hex is
  // selected when accent_color is a hex string not present in the named set.
  const customActive = !!current && !ACCENTS[current];

  const Swatch = ({ k }) => {
    const sel = current === k;
    return (
      <TouchableOpacity
        key={k}
        onPress={() => setSetting('accent_color', k)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Accent ${k}`}
        accessibilityState={{ selected: sel }}
        style={{
          width: 54, height: 54, borderRadius: 27,
          backgroundColor: ACCENTS[k],
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 3, borderColor: sel ? F.ink : 'transparent',
        }}>
        {sel && <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>✓</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 60, paddingHorizontal: 20 }}>

      <Text style={{ fontSize: 13, color: F.ink3, marginBottom: 20 }}>
        Pick an accent colour. It restyles buttons, highlights, and chips across Drift.
      </Text>

      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 12 }}>Palette</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
        {ACCENT_KEYS.map(k => <Swatch k={k} key={k} />)}
      </View>

      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginBottom: 12 }}>Custom hex</Text>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <View style={{ width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: F.line,
          backgroundColor: hexValid ? hexDraft.trim() : (customActive ? current : F.cream) }} />
        <TextInput
          value={hexDraft}
          onChangeText={setHexDraft}
          placeholder={customActive ? current : '#rrggbb'}
          placeholderTextColor={F.ink3}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={7}
          style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 16, color: F.ink }}
        />
        <TouchableOpacity
          onPress={() => { if (hexValid) { setSetting('accent_color', hexDraft.trim().toLowerCase()); setHexDraft(''); } }}
          disabled={!hexValid}
          style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
            backgroundColor: hexValid ? F.coral : F.cream, opacity: hexValid ? 1 : 0.6 }}>
          <Text style={{ color: hexValid ? '#fff' : F.ink3, fontWeight: '700' }}>Apply</Text>
        </TouchableOpacity>
      </View>
      {customActive && (
        <Text style={{ fontSize: 12, color: F.ink3, marginBottom: 8 }}>Custom accent {current} active.</Text>
      )}

      <TouchableOpacity
        onPress={() => { setSetting('accent_color', null); setHexDraft(''); }}
        disabled={!current}
        style={{ marginTop: 20, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
          backgroundColor: F.surface, alignItems: 'center', opacity: current ? 1 : 0.5 }}>
        <Text style={{ color: F.ink, fontWeight: '600' }}>Reset to default</Text>
      </TouchableOpacity>

      {/* Live preview — these read the just-updated F.coral / F.coralD. */}
      <Text style={{ fontSize: 11, fontWeight: '700', color: F.ink3, letterSpacing: 1,
        textTransform: 'uppercase', marginTop: 28, marginBottom: 12 }}>Preview</Text>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: F.coral }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Primary</Text>
        </View>
        <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: F.coralD }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Pressed</Text>
        </View>
        <Text style={{ color: F.coral, fontSize: 16, fontWeight: '700' }}>₹1,240</Text>
      </View>
    </ScrollView>
  );
}

export default React.memo(EditTheme);
