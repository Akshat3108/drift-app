import { useNavigate } from 'react-router-dom';
import { AppContext, useTheme } from '../App';
import { useContext } from 'react';
import { Card, Blob, Chip, Screen, Avatar } from '../components/primitives';
import { potBg } from '../data/constants';
import { USER } from '../data/sampleData';
import Icon from '../components/Icon';

export default function Home() {
  const F = useTheme();
  const nav = useNavigate();
  const { pots, expenses, totalSpend, monthBudget, sym, settings } = useContext(AppContext);
  const left = Math.max(0, monthBudget - totalSpend);

  return (
    <Screen>
      {/* Greeting */}
      <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, color: F.ink2 }}>Tuesday morning,</div>
          <div style={{ fontFamily: F.display, fontSize: 28, fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
            Hi <em style={{ fontStyle: 'italic' }}>{USER.name}</em> <span style={{ color: F.coral }}>✿</span>
          </div>
        </div>
        <Avatar onClick={() => nav('/profile')}/>
      </div>

      {/* Balance hero */}
      <div style={{ position: 'relative', margin: '18px 20px 0' }}>
        <Blob color={F.blushD} size={240} style={{ position: 'absolute', top: -30, right: -50, opacity: 0.6 }}/>
        <Blob color={F.butterD} size={150} style={{ position: 'absolute', top: 60, left: -30, opacity: 0.45 }}/>
        <Card color={settings.dark ? 'rgba(46,35,27,0.6)' : 'rgba(255,255,255,0.65)'}
          radius={26} pad={22}
          style={{ position: 'relative', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
          <div style={{ fontSize: 11, color: F.ink2 }}>You have</div>
          <div style={{ marginTop: 4, fontFamily: F.display, fontSize: 56, fontWeight: 400,
            letterSpacing: '-0.02em', lineHeight: 1 }}>
            {sym}{Math.floor(left).toLocaleString()}
            <span style={{ color: F.ink3, fontSize: 30 }}>.{((left % 1) * 100).toFixed(0).padStart(2, '0')}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: F.ink2 }}>left to spend this month</div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={() => nav('/net-worth')} style={{
              flex: 1, padding: '10px 12px', background: F.surface, borderRadius: 14,
              border: `1px solid ${F.line}`, cursor: 'pointer', textAlign: 'left', fontFamily: F.sans,
            }}>
              <div style={{ fontSize: 10, color: F.ink3 }}>Net worth</div>
              <div style={{ fontFamily: F.display, fontSize: 18, color: F.ink, marginTop: 2 }}>{sym}38.4k</div>
              <div style={{ fontSize: 10, color: F.sageD, marginTop: 1 }}>+2.1% this mo</div>
            </button>
            <button onClick={() => nav('/travel')} style={{
              flex: 1, padding: '10px 12px', background: F.surface, borderRadius: 14,
              border: `1px solid ${F.line}`, cursor: 'pointer', textAlign: 'left', fontFamily: F.sans,
            }}>
              <div style={{ fontSize: 10, color: F.ink3 }}>Travel mode</div>
              <div style={{ fontFamily: F.display, fontSize: 18, color: F.ink, marginTop: 2 }}>✈ Japan</div>
              <div style={{ fontSize: 10, color: F.ink2, marginTop: 1 }}>in 84 days</div>
            </button>
          </div>
        </Card>
      </div>

      {/* Pots */}
      <div style={{ padding: '24px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontFamily: F.display, fontSize: 19, fontWeight: 400 }}>Your pots</h3>
          <button onClick={() => nav('/trends')} style={{
            background: 'transparent', border: 'none', color: F.coral, fontSize: 12,
            fontFamily: F.sans, cursor: 'pointer',
          }}>see all</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {pots.slice(0, 4).map((p) => {
            const pct = p.spend / p.budget;
            const over = pct > 1;
            return (
              <button key={p.key} onClick={() => nav('/trends')} style={{
                padding: 14, borderRadius: 18, background: potBg(F, p.color),
                position: 'relative', overflow: 'hidden', border: 'none',
                textAlign: 'left', cursor: 'pointer', fontFamily: F.sans, color: F.ink,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{p.emoji}</span>
                  <span style={{ fontSize: 11, color: F.ink2, fontWeight: 500 }}>{p.label}</span>
                </div>
                <div style={{ marginTop: 8, fontFamily: F.display, fontSize: 22, lineHeight: 1 }}>
                  {sym}{p.spend.toFixed(0)}
                </div>
                <div style={{ marginTop: 2, fontSize: 10, color: F.ink2 }}>of {sym}{p.budget}</div>
                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                  <svg width={26} height={26} viewBox="0 0 28 28">
                    <circle cx={14} cy={14} r={11} fill="none" stroke={F.surface} strokeWidth={3}/>
                    <circle cx={14} cy={14} r={11} fill="none"
                      stroke={over ? F.coral : F.sageD} strokeWidth={3}
                      strokeDasharray={`${Math.min(pct, 1) * 2 * Math.PI * 11} ${2 * Math.PI * 11}`}
                      transform="rotate(-90 14 14)" strokeLinecap="round"/>
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Streak */}
      <Card color={F.cream} radius={18}
        style={{ margin: '22px 20px 0', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: F.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🔥</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: F.display, fontSize: 16 }}>
            <em>7-day</em> streak — under budget
          </div>
          <div style={{ fontSize: 11, color: F.ink2, marginTop: 2 }}>23 more for "Mindful month" badge</div>
        </div>
        <Icon name="arrowR" size={16} color={F.ink3}/>
      </Card>

      {/* Today list */}
      <div style={{ padding: '24px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontFamily: F.display, fontSize: 19, fontWeight: 400 }}>Today</h3>
          <span style={{ fontSize: 11, color: F.ink2 }}>{expenses.length} this month</span>
        </div>
        <Card pad={4} radius={20}>
          {expenses.slice(0, 5).map((r, i) => (
            <button key={r.id} onClick={() => nav(`/detail/${r.id}`)} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '12px 14px', background: 'transparent',
              border: 'none', borderTop: i ? `1px solid ${F.line}` : 'none',
              cursor: 'pointer', fontFamily: F.sans, color: F.ink, textAlign: 'left',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 12, fontSize: 18,
                background: potBg(F, ['cream', 'mint', 'sky', 'blush', 'butter'][i % 5]),
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{r.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{r.merchant}</div>
                <div style={{ fontSize: 11, color: F.ink2 }}>
                  {r.cat} · <span style={{ fontSize: 13 }}>{r.mood}</span>
                  {r.recurring && <Chip color={F.lilac} fg={F.ink2} style={{ marginLeft: 6, fontSize: 9 }}>recurring</Chip>}
                </div>
              </div>
              <div style={{ fontFamily: F.display, fontSize: 17 }}>−{sym}{r.amount.toFixed(2)}</div>
            </button>
          ))}
        </Card>
      </div>

      {/* Forecast nudge */}
      <Card color={F.cream} radius={22} pad={18} style={{ margin: '22px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: 30 }}>🌱</div>
          <div>
            <div style={{ fontFamily: F.display, fontSize: 16, lineHeight: 1.3 }}>
              <em>You're trending lighter.</em>
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: F.ink2, lineHeight: 1.5 }}>
              May ends near <strong style={{ color: F.coral }}>{sym}2,540</strong> — about {sym}260 under budget.
            </div>
            <button onClick={() => nav('/trends')} style={{
              marginTop: 8, background: 'transparent', border: 'none', color: F.coral,
              padding: 0, fontSize: 12, fontWeight: 600, fontFamily: F.sans, cursor: 'pointer',
            }}>See trends →</button>
          </div>
        </div>
      </Card>
    </Screen>
  );
}
