import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext, useTheme } from '../App';
import { Card, Chip, Header } from '../components/primitives';
import { potBg } from '../data/constants';

export default function Expenses() {
  const F = useTheme();
  const nav = useNavigate();
  const { expenses, sym } = useContext(AppContext);

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      background: F.bg, color: F.ink, fontFamily: F.sans,
    }}>
      <Header title="All spends" subtitle={`${expenses.length} this month`} onBack={() => nav(-1)}/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 30px' }}>
        <Card pad={4} radius={20}>
          {expenses.map((r, i) => (
            <button key={r.id} onClick={() => nav(`/detail/${r.id}`)} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '12px 14px', background: 'transparent',
              border: 'none', borderTop: i ? `1px solid ${F.line}` : 'none',
              cursor: 'pointer', fontFamily: F.sans, color: F.ink, textAlign: 'left',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 12, fontSize: 18,
                background: potBg(F, ['cream','mint','sky','blush','butter','lilac'][i % 6]),
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
    </div>
  );
}
