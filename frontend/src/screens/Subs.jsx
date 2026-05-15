import { useNavigate } from 'react-router-dom';
import { useTheme, useApp } from '../App';
import { Card, Chip, Blob, Screen, Avatar } from '../components/primitives';

export default function Subs() {
  const F = useTheme();
  const nav = useNavigate();
  const { subs, sym, cancelSub, showToast } = useApp();

  const activeSubs = subs.filter(s => !s.cancelled);
  const total = activeSubs.reduce((s, x) => s + x.amount, 0);
  const cancellable = subs.filter(s => s.verdict === 'cancel' && !s.cancelled);

  const cancelBoth = () => {
    cancellable.forEach(s => cancelSub(s.name));
    showToast(
      `Saved ${sym}${cancellable.reduce((s, x) => s + x.amount, 0).toFixed(2)}/mo · cancelled ${cancellable.length}`,
      { icon: '✿' },
    );
  };

  return (
    <Screen>
      <div style={{ padding: '0 20px' }}>
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 12, color: F.ink2 }}>You're paying</div>
            <h2 style={{ margin: '4px 0 0', fontFamily: F.display, fontSize: 38, fontWeight: 400, letterSpacing: '-0.02em' }}>
              {sym}{total.toFixed(2)}<span style={{ fontSize: 18, color: F.ink2 }}> /mo</span>
            </h2>
            <div style={{ fontSize: 12, color: F.ink2, marginTop: 2 }}>
              for {activeSubs.length} things · <span style={{ color: F.coral }}>{sym}{(total * 12).toFixed(0)}/yr</span>
            </div>
          </div>
          <Avatar size={36} onClick={() => nav('/profile')}/>
        </div>

        {cancellable.length > 0 && (
          <Card color={F.coral} radius={26} pad={20} border={false}
            style={{ position: 'relative', overflow: 'hidden' }}>
            <Blob color="#ff8a73" size={200} style={{ position: 'absolute', top: -50, right: -50, opacity: 0.5 }}/>
            <div style={{ position: 'relative', color: '#fff' }}>
              <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                ✨ a gentle suggestion
              </div>
              <div style={{ marginTop: 10, fontFamily: F.display, fontSize: 22, fontWeight: 400, lineHeight: 1.3 }}>
                Cancel <em style={{ borderBottom: '2px solid #fff' }}>{cancellable.map(c => c.name).join(' & ')}</em> — you haven't opened them in 60+ days.
              </div>
              <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={cancelBoth} style={{
                  padding: '10px 14px', background: '#fff',
                  color: F.coral, border: 'none', borderRadius: 99,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                  Cancel · save {sym}{cancellable.reduce((s, x) => s + x.amount, 0).toFixed(2)}/mo
                </button>
                <button style={{
                  padding: '10px 14px', background: 'transparent', color: '#fff',
                  border: '1.5px solid rgba(255,255,255,0.6)', borderRadius: 99,
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                }}>
                  Keep
                </button>
              </div>
            </div>
          </Card>
        )}

        <div style={{
          marginTop: 22, display: 'flex', gap: 14,
          borderBottom: `1px solid ${F.line}`, paddingBottom: 6,
        }}>
          {[['Active', activeSubs.length], ['Cancelled', subs.filter(s => s.cancelled).length]].map(([l, n], i) => (
            <div key={l} style={{
              display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6,
              borderBottom: i === 0 ? `2px solid ${F.coral}` : 'none', marginBottom: -7,
              color: i === 0 ? F.ink : F.ink3, fontSize: 13, fontWeight: 500, fontFamily: F.sans,
            }}>
              {l} <Chip color={i === 0 ? F.cream : F.surface} fg={F.ink3}>{n}</Chip>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          {subs.map((s) => {
            const vcolor = s.cancelled ? F.ink3
              : s.verdict === 'cancel' ? F.coral
              : s.verdict === 'review' ? F.butterD : F.sageD;
            const vbg = s.cancelled ? F.surface
              : s.verdict === 'cancel' ? '#fde2dc'
              : s.verdict === 'review' ? '#fdf0d4' : F.mint;
            return (
              <div key={s.name} style={{
                background: F.surface, border: `1px solid ${F.line}`, borderRadius: 18,
                padding: 14, display: 'flex', alignItems: 'center', gap: 12,
                opacity: s.cancelled ? 0.55 : 1, fontFamily: F.sans, color: F.ink,
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 12, background: s.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                  flexShrink: 0,
                }}>{s.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500,
                    textDecoration: s.cancelled ? 'line-through' : 'none',
                  }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: F.ink2 }}>{s.cancelled ? 'Cancelled' : s.used}</div>
                </div>
                <div style={{
                  padding: '3px 8px', borderRadius: 99, background: vbg, color: vcolor,
                  fontSize: 10, fontWeight: 600,
                }}>{s.cancelled ? 'done' : s.verdict}</div>
                <div style={{ fontFamily: F.display, fontSize: 16, minWidth: 56, textAlign: 'right' }}>
                  {sym}{s.amount.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Screen>
  );
}
