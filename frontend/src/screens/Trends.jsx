import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext, useTheme } from '../App';
import { Card, Chip, Screen, Avatar } from '../components/primitives';
import { Donut, Heatmap, Bars } from '../components/charts';
import { flowPalette } from '../theme';
import { MONTH_TREND, HEATMAP } from '../data/sampleData';
import Icon from '../components/Icon';

export default function Trends() {
  const F = useTheme();
  const nav = useNavigate();
  const { pots, goals, sym } = useContext(AppContext);
  const palette = flowPalette(F);
  const total = pots.reduce((s, p) => s + p.spend, 0);
  const [range, setRange] = useState('month');

  return (
    <Screen>
      <div style={{ padding: '0 20px' }}>
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 12, color: F.ink2 }}>This month</div>
            <h2 style={{ margin: '4px 0 0', fontFamily: F.display, fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em' }}>
              Where it <em style={{ color: F.coral }}>flowed</em>
            </h2>
          </div>
          <Avatar size={36} onClick={() => nav('/profile')}/>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {[['week', 'Week'], ['month', 'Month'], ['year', 'Year']].map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)} style={{
              padding: '7px 16px', borderRadius: 99,
              background: range === k ? F.coral : F.surface,
              color: range === k ? '#fff' : F.ink2,
              border: `1px solid ${range === k ? F.coral : F.line}`,
              fontSize: 12, fontWeight: 500, fontFamily: F.sans, cursor: 'pointer',
            }}>{l}</button>
          ))}
        </div>

        <Card radius={24} pad={20}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ color: F.ink, position: 'relative' }}>
              <Donut size={150} thickness={20} data={pots.map(p => ({ value: p.spend }))}
                palette={palette} textColor={F.ink}/>
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ fontFamily: F.display, fontSize: 22, color: F.ink }}>
                  {sym}{(total / 1000).toFixed(1)}k
                </div>
                <div style={{ fontSize: 10, color: F.ink2 }}>spent</div>
              </div>
            </div>
            <div style={{ flex: 1, display: 'grid', gap: 7 }}>
              {pots.slice(0, 5).map((p, i) => (
                <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: palette[i] }}/>
                  <span style={{ flex: 1, fontSize: 11, color: F.ink2 }}>{p.label}</span>
                  <span style={{ fontFamily: F.display, fontSize: 13, color: F.ink }}>{sym}{p.spend.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card radius={22} pad={18} style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <h4 style={{ margin: 0, fontFamily: F.display, fontSize: 16, fontWeight: 400 }}>Spending rhythm</h4>
            <span style={{ fontSize: 11, color: F.ink2 }}>past 5 weeks</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ color: F.coral }}>
              <Heatmap data={HEATMAP} color={F.coral} size={20} gap={5}/>
            </div>
            <div style={{ flex: 1, fontSize: 12, lineHeight: 1.5, color: F.ink2 }}>
              <strong style={{ color: F.ink, fontFamily: F.display, fontSize: 14 }}>Fridays are big.</strong><br/>
              Avg <strong style={{ color: F.ink }}>{sym}82</strong>. Quiet weekends ✿
            </div>
          </div>
        </Card>

        <Card radius={22} pad={18} style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <h4 style={{ margin: 0, fontFamily: F.display, fontSize: 16, fontWeight: 400 }}>Six months</h4>
            <Chip color={F.mint} fg={F.sageD}>↓ 5% vs Apr</Chip>
          </div>
          <div style={{ color: F.blushD }}>
            <Bars data={MONTH_TREND} width={320} height={88} color={F.blushD}
              highlight={5} highlightColor={F.coral} gap={12} rounded={6}/>
          </div>
        </Card>

        <Card radius={22} pad={18} style={{ marginTop: 14 }} color={F.mint} border={false}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Icon name="leaf" size={28} color={F.sageD}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: F.display, fontSize: 17, color: F.ink }}>24 kg CO₂e</div>
              <div style={{ fontSize: 11, color: F.ink2 }}>−12% vs Apr · top 18% of users</div>
            </div>
            <Icon name="arrowR" size={16} color={F.ink3}/>
          </div>
        </Card>

        <div style={{
          marginTop: 22, marginBottom: 6,
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <h3 style={{ margin: 0, fontFamily: F.display, fontSize: 19, fontWeight: 400 }}>Goals in flight</h3>
          <button onClick={() => nav('/goals')} style={{
            background: 'transparent', border: 'none', color: F.coral, fontSize: 12,
            fontFamily: F.sans, cursor: 'pointer', fontWeight: 500,
          }}>manage</button>
        </div>
        {goals.map((g, i) => {
          const pct = g.have / g.need;
          const bg = [F.cream, F.mint, F.sky][i % 3];
          const c = [F.coral, F.sageD, F.sky2][i % 3];
          return (
            <Card key={g.id || g.name} pad={14} radius={18} color={bg} border={false} style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontFamily: F.display, fontSize: 16, color: F.ink }}>
                  {g.emoji || ['✈️', '🛟', '💻'][i % 3]} {g.name}
                </div>
                <div style={{ fontSize: 11, color: F.ink2 }}>{g.eta}</div>
              </div>
              <div style={{ marginTop: 8, height: 8, borderRadius: 4, background: F.surface, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct * 100}%`, background: c, borderRadius: 4 }}/>
              </div>
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: F.ink2 }}>{sym}{g.have} of {sym}{g.need}</span>
                <span style={{ fontFamily: F.display, fontSize: 13, color: F.ink }}>{Math.round(pct * 100)}%</span>
              </div>
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}
