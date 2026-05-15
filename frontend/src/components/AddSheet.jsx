import { useState } from 'react';
import { useTheme, useApp } from '../App';
import { Card, Blob, Button } from './primitives';
import Icon from './Icon';

const MOODS = [
  { e: '😍', l: 'Loved it' },
  { e: '😌', l: 'Worth it' },
  { e: '😐', l: 'Neutral' },
  { e: '😬', l: 'Unsure' },
  { e: '😞', l: 'Regret' },
];

export default function AddSheet({ onClose }) {
  const F = useTheme();
  const { pots, sym, addExpense, showToast } = useApp();
  const [amount, setAmount] = useState('24.50');
  const [merchant, setMerchant] = useState('Tartine Bakery');
  const [potKey, setPotKey] = useState(pots[0]?.key || 'food');
  const [mood, setMood] = useState(1);
  const [recurring, setRecurring] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Slide in
  if (!mounted) requestAnimationFrame(() => setMounted(true));

  const press = (key) => {
    setAmount(prev => {
      const s = prev.replace('.', '');
      let next;
      if (key === 'del') next = s.slice(0, -1) || '0';
      else if (key === '.') return prev.includes('.') ? prev : prev + '.';
      else next = s + key;
      const padded = next.padStart(3, '0');
      const dollars = padded.slice(0, -2);
      const cents = padded.slice(-2);
      return `${parseInt(dollars, 10)}.${cents}`;
    });
  };

  const selectedPot = pots.find(p => p.key === potKey);

  const save = () => {
    addExpense({
      merchant,
      cat: selectedPot?.label || 'Food',
      icon: selectedPot?.emoji || '🍴',
      amount: parseFloat(amount),
      time: 'Just now',
      mood: MOODS[mood].e,
      carbon: 0.4,
      potKey,
      recurring,
    });
    onClose();
    showToast(`Saved to ${selectedPot?.label} pot`, { icon: MOODS[mood].e });
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 200,
      background: F.bg, color: F.ink, fontFamily: F.sans,
      display: 'flex', flexDirection: 'column',
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      overflow: 'hidden',
      transform: mounted ? 'translateY(0%)' : 'translateY(100%)',
      transition: 'transform .32s cubic-bezier(.2,.7,.2,1)',
      boxShadow: '0 -12px 40px rgba(0,0,0,0.18)',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 20px 4px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onClose} style={{
          background: 'transparent', border: 'none', padding: 0,
          cursor: 'pointer', fontFamily: F.sans, color: F.ink2, fontSize: 13,
        }}>Cancel</button>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: F.display, fontSize: 18 }}>Add a spend</div>
        <button onClick={save} style={{
          background: 'transparent', border: 'none', padding: 0,
          cursor: 'pointer', fontFamily: F.sans, color: F.coral, fontSize: 13, fontWeight: 600,
        }}>Save</button>
      </div>

      {/* Scrollable middle */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
        <Card color={F.cream} radius={26} pad={22} border={false}
          style={{ textAlign: 'center', position: 'relative', overflow: 'hidden', marginTop: 10 }}>
          <Blob color={F.blushD} size={200} style={{ position: 'absolute', top: -50, right: -60, opacity: 0.6 }}/>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 11, color: F.ink2 }}>I spent</div>
            <div style={{ marginTop: 4, fontFamily: F.display, fontSize: 64, fontWeight: 400,
              letterSpacing: '-0.03em', lineHeight: 1, color: F.ink }}>
              {sym}{amount.split('.')[0]}
              <span style={{ color: F.ink3 }}>.{amount.split('.')[1] || '00'}</span>
            </div>
            <input value={merchant} onChange={(e) => setMerchant(e.target.value)}
              style={{
                marginTop: 10, background: 'transparent', border: 'none',
                borderBottom: `1px dashed ${F.ink3}`,
                textAlign: 'center', fontFamily: F.sans, fontSize: 13,
                color: F.ink2, outline: 'none', width: '80%',
              }}/>
          </div>
        </Card>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: F.display, fontSize: 15, marginBottom: 10, color: F.ink }}>What kind?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {pots.map(p => {
              const sel = potKey === p.key;
              return (
                <button key={p.key} onClick={() => setPotKey(p.key)} style={{
                  padding: '8px 14px', borderRadius: 99,
                  background: sel ? F.coral : F.surface, color: sel ? '#fff' : F.ink,
                  border: `1px solid ${sel ? F.coral : F.line}`,
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                  cursor: 'pointer', fontFamily: F.sans, fontWeight: sel ? 600 : 500,
                }}>
                  <span>{p.emoji}</span>{p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: F.display, fontSize: 15, marginBottom: 10, color: F.ink }}>How did it feel?</div>
          <Card pad={12} radius={20}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {MOODS.map((m, i) => (
                <button key={m.e} onClick={() => setMood(i)} style={{
                  width: 50, height: 50, borderRadius: '50%',
                  background: mood === i ? F.cream : 'transparent',
                  border: mood === i ? `2px solid ${F.coral}` : '2px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, cursor: 'pointer', padding: 0,
                  transform: mood === i ? 'scale(1.08)' : 'none',
                  transition: 'transform .12s, background .12s, border-color .12s',
                }}>{m.e}</button>
              ))}
            </div>
            <div style={{
              marginTop: 8, fontSize: 12, color: F.ink2, textAlign: 'center',
              fontFamily: F.display, fontStyle: 'italic',
            }}>"{MOODS[mood].l}"</div>
          </Card>
        </div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Card pad={14} radius={18} color={F.mint} border={false}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: F.ink2 }}>
              <Icon name="leaf" size={13} color={F.sageD}/> Carbon
            </div>
            <div style={{ marginTop: 6, fontFamily: F.display, fontSize: 20, color: F.sageD }}>0.4 kg</div>
            <div style={{ fontSize: 10, color: F.ink3 }}>low impact ✿</div>
          </Card>
          <button onClick={() => setRecurring(!recurring)} style={{
            background: recurring ? F.lilac : F.sky, border: 'none', borderRadius: 18,
            padding: 14, textAlign: 'left', cursor: 'pointer', fontFamily: F.sans, color: F.ink,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: F.ink2 }}>
              <Icon name="repeat" size={13} color={recurring ? '#9d8fc8' : F.sky2}/> Repeat?
            </div>
            <div style={{ marginTop: 6, fontFamily: F.display, fontSize: 14, color: F.ink }}>
              {recurring ? 'Every month' : 'Just once'}
            </div>
            <div style={{ fontSize: 10, color: F.ink3 }}>tap to toggle</div>
          </button>
        </div>

        <div style={{ height: 16 }}/>
      </div>

      {/* Keypad */}
      <div style={{
        background: F.surface, borderTop: `1px solid ${F.line}`,
        padding: '12px 16px 20px', display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
      }}>
        {['1','2','3','4','5','6','7','8','9','.','0','del'].map(k => (
          <button key={k} onClick={() => press(k)} style={{
            padding: 14, background: F.bg, border: 'none', borderRadius: 14,
            fontSize: k === 'del' ? 16 : 22, fontFamily: F.display, color: F.ink,
            cursor: 'pointer',
          }}>{k === 'del' ? '⌫' : k}</button>
        ))}
      </div>
    </div>
  );
}
