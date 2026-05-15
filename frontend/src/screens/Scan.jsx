import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext, useTheme } from '../App';
import { Card, Button, Screen, Header } from '../components/primitives';
import { RECEIPT_ITEMS } from '../data/sampleData';
import Icon from '../components/Icon';

export default function Scan() {
  const F = useTheme();
  const nav = useNavigate();
  const { sym, addExpense, showToast } = useContext(AppContext);
  const [stage, setStage] = useState('idle');
  const [items] = useState(RECEIPT_ITEMS);
  const total = items.reduce((s, i) => s + i.price, 0);

  const startScan = () => {
    setStage('scanning');
    setTimeout(() => setStage('review'), 1400);
  };

  const save = () => {
    addExpense({
      merchant: 'Whole Foods Market', cat: 'Groceries', icon: '🥬',
      amount: total, time: 'Just now', mood: '😌', carbon: 3.2, potKey: 'groc',
    });
    showToast('Saved 8 items to Groceries pot', { icon: '✿' });
    setStage('idle');
    nav('/');
  };

  return (
    <Screen padBottom={120}>
      <div style={{ padding: '0 20px' }}>
        <Header
          title={stage === 'review' ? 'Review' : 'Snap a receipt'}
          subtitle={stage === 'review' ? '8 items extracted · tap to edit' : 'AI will read the line items'}
          right={
            <button style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
              <Icon name="settings" size={18} color={F.ink2}/>
            </button>
          }
        />

        {/* Camera viewport */}
        <div style={{
          aspectRatio: '3 / 4', borderRadius: 28, background: '#1a1612',
          position: 'relative', overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(232,93,68,0.18)',
        }}>
          {/* receipt */}
          <div style={{
            position: 'absolute', inset: '8% 12% 14% 12%', background: '#fff8ed',
            transform: 'rotate(-2deg)', borderRadius: 4, padding: '14px 12px',
            fontFamily: 'ui-monospace, monospace', fontSize: 8, color: '#3a2a1a', lineHeight: 1.55,
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 9.5, letterSpacing: 1 }}>♡ WHOLE FOODS ♡</div>
            <div style={{ textAlign: 'center', fontSize: 7, opacity: 0.7, marginBottom: 8 }}>4TH ST · MAY 12 · 19:14</div>
            {RECEIPT_ITEMS.slice(0, 6).map(i => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 7 }}>{i.name.slice(0, 18)}</span>
                <span>{i.price.toFixed(2)}</span>
              </div>
            ))}
            <div style={{
              borderTop: '1px dashed #aaa', marginTop: 6, paddingTop: 6,
              display: 'flex', justifyContent: 'space-between', fontWeight: 700,
            }}>
              <span>TOTAL</span><span>{total.toFixed(2)}</span>
            </div>
          </div>

          {/* scan frame */}
          <div style={{
            position: 'absolute', inset: 18, borderRadius: 22,
            border: `3px solid ${stage === 'scanning' ? F.butterD : F.coral}`, opacity: 0.85,
            transition: 'border-color .3s',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.3)',
          }}/>

          {stage === 'scanning' && (
            <div style={{
              position: 'absolute', left: '14%', right: '14%',
              height: 2, background: `linear-gradient(90deg, transparent, ${F.butterD}, transparent)`,
              animation: 'fScan 1.4s linear infinite',
            }}/>
          )}

          <div style={{
            position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)',
            background: stage === 'review' ? F.sage : F.coral, color: '#fff',
            padding: '8px 14px', borderRadius: 99,
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 500,
            boxShadow: '0 6px 14px rgba(0,0,0,0.3)',
          }}>
            <Icon name="sparkle" size={12} color="#fff"/>
            {stage === 'idle' && 'Center on receipt'}
            {stage === 'scanning' && 'Reading line items…'}
            {stage === 'review' && '✓ 8 items found'}
          </div>

          {stage !== 'review' && (
            <button onClick={startScan} disabled={stage === 'scanning'} style={{
              position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)',
              width: 66, height: 66, borderRadius: '50%', background: '#fff',
              border: `4px solid ${F.coral}`, padding: 0, cursor: 'pointer',
              boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: stage === 'scanning' ? F.butterD : F.coral,
              }}/>
            </button>
          )}
        </div>

        {stage === 'review' && (
          <Card radius={26} pad={20} style={{
            marginTop: -22, position: 'relative', zIndex: 2,
            boxShadow: '0 -10px 30px rgba(0,0,0,0.04)',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: F.line, margin: '0 auto 14px' }}/>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontFamily: F.display, fontSize: 17 }}>Whole Foods</div>
                <div style={{ fontSize: 11, color: F.ink2 }}>{items.length} items · → Groceries</div>
              </div>
              <div style={{ fontFamily: F.display, fontSize: 24 }}>{sym}{total.toFixed(2)}</div>
            </div>
            <div style={{ marginTop: 14, maxHeight: 200, overflowY: 'auto' }}>
              {items.map((it, i) => (
                <div key={it.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 0', borderTop: i ? `1px solid ${F.line}` : 'none',
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 8, background: F.cream,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                  }}>{['🍌','🥛','🍞','🥑','🐟','🥬','🧀','💧'][i % 8]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12 }}>{it.name}</div>
                    <div style={{ fontSize: 10, color: F.ink3 }}>{it.qty}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{sym}{it.price.toFixed(2)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Button variant="secondary" size="md" onClick={() => setStage('idle')} style={{ flex: 1 }}>
                Retry
              </Button>
              <Button variant="primary" size="md" onClick={save} style={{ flex: 2 }}>
                Save · {sym}{total.toFixed(2)}
              </Button>
            </div>
          </Card>
        )}

        {stage === 'idle' && (
          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: F.ink2 }}>
            Tip: align the receipt within the frame, then tap the shutter
          </div>
        )}
      </div>
    </Screen>
  );
}
