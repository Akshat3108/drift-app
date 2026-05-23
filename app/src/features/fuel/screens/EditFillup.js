// 7.6 — EditFillup screen: create / edit a fuel fill-up.
//
// Manual log path: form fields are the merchant (pump name), date, liters,
// rate, amount (auto-computed from liters*rate when both present, manually
// overridable), odometer, full-tank toggle, fuel type chips, notes. Save
// creates BOTH the expense row and the fill-up row atomically via the
// fuel context.
//
// Edit path: route.params.id targets an existing fill-up. We load the linked
// expense for the merchant/category and patch both rows in one transaction.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, Alert,
         Platform, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '@core/theme/ThemeContext';
import { useFuel } from '@features/fuel/context';
import { useExpenses } from '@features/expenses/context';
import { useSettings } from '@features/profile/settings.context';
import { useToast } from '@components/Toast';
import { logError } from '@core/utils/log';

const FUEL_TYPES = ['Petrol', 'Diesel', 'CNG', 'Electric'];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateLong(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return 'Select date';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined,
    { day: 'numeric', month: 'short', year: 'numeric' });
}

function Field({ F, label, sub, children }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 11, color: F.ink3, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </Text>
      {children}
      {!!sub && (
        <Text style={{ fontSize: 11, color: F.ink3, marginTop: 4 }}>{sub}</Text>
      )}
    </View>
  );
}

function NumericInput({ F, value, onChange, placeholder }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={F.ink3}
      keyboardType="decimal-pad"
      style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
        backgroundColor: F.surface, fontSize: 14, color: F.ink }}
    />
  );
}

function EditFillup({ route, navigation }) {
  const { F } = useTheme();
  const { vehicles, addFillup, updateFillup, getFillupByExpense } = useFuel();
  const { pots, expenses } = useExpenses();
  const { sym } = useSettings();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const fillupId = route?.params?.id ?? null;
  const initialVehicleId = route?.params?.vehicleId ?? null;

  const [vehicleId,   setVehicleId]   = useState(initialVehicleId);
  const [merchant,    setMerchant]    = useState('');
  const [potId,       setPotId]       = useState(null);
  const [fillDate,    setFillDate]    = useState(todayIso());
  const [liters,      setLiters]      = useState('');
  const [ratePerL,    setRatePerL]    = useState('');
  const [amount,      setAmount]      = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [odometer,    setOdometer]    = useState('');
  const [isFullTank,  setIsFullTank]  = useState(true);
  const [fuelType,    setFuelType]    = useState(null);
  const [notes,       setNotes]       = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loadedEditing, setLoadedEditing] = useState(false);
  const [saving,      setSaving]      = useState(false);

  // Hydrate from existing fill-up when editing. The linked expense row is in
  // the in-memory expenses slice (cap 500) — fall back to looking up via
  // getFillupByExpense's reverse only as a last resort.
  useEffect(() => {
    if (fillupId == null) { setLoadedEditing(true); return; }
    (async () => {
      try {
        // We have fillupId but the context doesn't keep fill-up lists globally,
        // so use getFillupByExpense in reverse: pull the fill-up by its id via
        // a direct repo call inside listByVehicle of every vehicle is wasteful.
        // Simpler: each vehicle row is small; load them lazily until we hit one.
        // For v1 we keep this O(vehicles) — fine for the small N we expect.
        const { fillupsRepo } = await import('@features/fuel/repo');
        const f = await fillupsRepo.get(fillupId);
        if (!f) { setLoadedEditing(true); return; }
        setVehicleId(f.vehicle_id);
        setFillDate(f.fill_date || todayIso());
        setLiters(String(f.liters ?? ''));
        setRatePerL(f.rate_per_l != null ? String(f.rate_per_l) : '');
        setAmount(String(f.amount ?? ''));
        setOdometer(f.odometer_km != null ? String(f.odometer_km) : '');
        setIsFullTank(!!f.is_full_tank);
        setFuelType(f.fuel_type ?? null);
        setNotes(f.notes || '');
        const linkedExpense = expenses.find(e => e.id === f.expense_id);
        if (linkedExpense) {
          setMerchant(linkedExpense.merchant || '');
          setPotId(linkedExpense.category_id ?? null);
        }
      } catch (err) {
        logError('editfillup:hydrate', err);
      } finally {
        setLoadedEditing(true);
      }
    })();
  }, [fillupId, expenses]);

  const vehicle = useMemo(() => vehicles.find(v => v.id === vehicleId), [vehicles, vehicleId]);

  // Default the category to a "transport"-shaped pot the first time the user
  // lands on the new-fill-up form. Matches ScanService.guessCategoryId().
  useEffect(() => {
    if (potId != null || !loadedEditing) return;
    const matcher = /transport|fuel/i;
    const guess = pots.find(p => matcher.test(p.name));
    setPotId(guess?.id ?? pots[0]?.id ?? null);
  }, [potId, pots, loadedEditing]);

  // Default the fuel-type chip to the vehicle's default the first time.
  useEffect(() => {
    if (fuelType != null || !loadedEditing) return;
    if (vehicle?.fuel_type) setFuelType(vehicle.fuel_type);
  }, [fuelType, vehicle, loadedEditing]);

  // Default merchant for new fill-ups: empty until user types or chooses one
  // from autocomplete (out of scope for v1). Keep blank rather than guessing.

  // Auto-compute amount = liters * rate when both are valid AND the user
  // hasn't manually edited the amount field.
  useEffect(() => {
    if (amountTouched) return;
    const L = parseFloat(liters);
    const R = parseFloat(ratePerL);
    if (Number.isFinite(L) && L > 0 && Number.isFinite(R) && R > 0) {
      setAmount(String(+(L * R).toFixed(2)));
    }
  }, [liters, ratePerL, amountTouched]);

  const onDateChange = (event, selected) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event?.type === 'dismissed') return;
    if (selected instanceof Date && !isNaN(selected)) {
      const y = selected.getFullYear();
      const m = String(selected.getMonth() + 1).padStart(2, '0');
      const d = String(selected.getDate()).padStart(2, '0');
      setFillDate(`${y}-${m}-${d}`);
    }
  };

  const save = async () => {
    if (vehicleId == null) return Alert.alert('Pick a vehicle');
    if (!merchant.trim()) return Alert.alert('Enter the pump name');
    const L = parseFloat(liters);
    if (!Number.isFinite(L) || L <= 0) return Alert.alert('Enter the litres dispensed');
    const A = parseFloat(amount);
    if (!Number.isFinite(A) || A <= 0) return Alert.alert('Enter the total amount');
    const R = ratePerL.trim() ? parseFloat(ratePerL) : null;
    if (R != null && (!Number.isFinite(R) || R <= 0)) return Alert.alert('Rate must be a positive number');
    const O = odometer.trim() ? parseFloat(odometer) : null;
    if (O != null && (!Number.isFinite(O) || O < 0)) return Alert.alert('Odometer must be a positive number');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fillDate)) return Alert.alert('Pick a fill date');

    setSaving(true);
    try {
      if (fillupId == null) {
        await addFillup({
          expense: {
            category_id: potId,
            merchant: merchant.trim(),
            amount: A,
            expense_date: fillDate,
            mood: null, carbon: 0, recurring: false,
            notes: notes.trim() || null,
          },
          fillup: {
            vehicle_id: vehicleId,
            fill_date: fillDate,
            liters: L,
            rate_per_l: R,
            amount: A,
            odometer_km: O,
            is_full_tank: isFullTank,
            fuel_type: fuelType,
            notes: notes.trim() || null,
          },
        });
        toast('Fill-up logged');
      } else {
        await updateFillup(fillupId, {
          expensePatch: {
            category_id: potId,
            merchant: merchant.trim(),
            amount: A,
            expense_date: fillDate,
            notes: notes.trim() || null,
          },
          fillupPatch: {
            vehicle_id: vehicleId,
            fill_date: fillDate,
            liters: L,
            rate_per_l: R,
            amount: A,
            odometer_km: O,
            is_full_tank: isFullTank,
            fuel_type: fuelType,
            notes: notes.trim() || null,
          },
        });
        toast('Fill-up updated');
      }
      navigation.goBack();
    } catch (err) {
      logError('editfillup:save', err);
      Alert.alert('Could not save', err?.message || String(err));
    } finally { setSaving(false); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: F.bg }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>

      <Field F={F} label="VEHICLE">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {vehicles.length === 0 && (
            <Text style={{ fontSize: 12, color: F.ink3 }}>
              No vehicles yet — add one from the Vehicles screen first.
            </Text>
          )}
          {vehicles.map((v) => {
            const sel = v.id === vehicleId;
            return (
              <TouchableOpacity key={v.id} onPress={() => setVehicleId(v.id)} activeOpacity={0.7}
                accessibilityRole="button" accessibilityLabel={`Vehicle ${v.name}`}
                accessibilityState={{ selected: sel }}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: sel ? F.coral : F.surface,
                  borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                <Text style={{ fontSize: 14 }}>{v.icon || '🚗'}</Text>
                <Text style={{ fontSize: 13, color: sel ? '#fff' : F.ink, fontWeight: '600' }}>
                  {v.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <Field F={F} label="PUMP / MERCHANT">
        <TextInput value={merchant} onChangeText={setMerchant}
          placeholder="HP Petroleum"
          placeholderTextColor={F.ink3}
          autoCapitalize="words"
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink }}/>
      </Field>

      <Field F={F} label="CATEGORY">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {pots.map((p) => {
            const sel = p.id === potId;
            return (
              <TouchableOpacity key={p.id} onPress={() => setPotId(p.id)} activeOpacity={0.7}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
                  backgroundColor: sel ? F.coral : F.surface,
                  borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                <Text style={{ fontSize: 13, color: sel ? '#fff' : F.ink, fontWeight: '600' }}>
                  {p.emoji || ''} {p.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <Field F={F} label="FILL DATE">
        <TouchableOpacity onPress={() => setShowDatePicker(true)}
          activeOpacity={0.7}
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface }}>
          <Text style={{ fontSize: 14, color: F.ink }}>{fmtDateLong(fillDate)}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={(() => {
              const [y, m, d] = fillDate.split('-').map(Number);
              return new Date(y, m - 1, d);
            })()}
            mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'}
            maximumDate={new Date()}
            onChange={onDateChange}
          />
        )}
      </Field>

      <Field F={F} label="LITRES">
        <NumericInput F={F} value={liters} onChange={setLiters} placeholder="12.5"/>
      </Field>

      <Field F={F} label="RATE PER LITRE" sub={`Optional. ${liters && ratePerL ? `Amount auto = ${sym}${(parseFloat(liters) * parseFloat(ratePerL) || 0).toFixed(2)}` : ''}`}>
        <NumericInput F={F} value={ratePerL} onChange={setRatePerL} placeholder="105.50"/>
      </Field>

      <Field F={F} label="AMOUNT" sub={`Total paid in ${sym}`}>
        <NumericInput F={F} value={amount}
          onChange={(v) => { setAmountTouched(true); setAmount(v); }}
          placeholder="1318.75"/>
      </Field>

      <Field F={F} label="ODOMETER (KM)" sub="Optional — needed to compute mileage">
        <NumericInput F={F} value={odometer} onChange={setOdometer} placeholder="42150"/>
      </Field>

      <Field F={F} label="FULL TANK" sub="Mileage is computed from consecutive full-tank fills">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 4 }}>
          <Switch value={isFullTank} onValueChange={setIsFullTank}
            trackColor={{ false: F.line, true: F.coral }}/>
          <Text style={{ fontSize: 13, color: F.ink2 }}>
            {isFullTank ? 'Yes — full tank' : 'No — partial fill'}
          </Text>
        </View>
      </Field>

      <Field F={F} label="FUEL TYPE" sub="Defaults to the vehicle's fuel">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FUEL_TYPES.map((ft) => {
            const sel = ft === fuelType;
            return (
              <TouchableOpacity key={ft} onPress={() => setFuelType(ft)} activeOpacity={0.7}
                style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
                  backgroundColor: sel ? F.coral : F.surface,
                  borderWidth: 1, borderColor: sel ? F.coral : F.line }}>
                <Text style={{ fontSize: 13, color: sel ? '#fff' : F.ink, fontWeight: '600' }}>
                  {ft}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      <Field F={F} label="NOTES">
        <TextInput value={notes} onChangeText={setNotes}
          placeholder="Optional" placeholderTextColor={F.ink3}
          multiline
          style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: F.line,
            backgroundColor: F.surface, fontSize: 14, color: F.ink, minHeight: 70,
            textAlignVertical: 'top' }}/>
      </Field>

      <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.85}
        style={{ backgroundColor: F.coral, padding: 16, borderRadius: 14, alignItems: 'center',
          opacity: saving ? 0.6 : 1 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
          {saving ? 'Saving…' : (fillupId == null ? 'Log fill-up' : 'Save changes')}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export default React.memo(EditFillup);
