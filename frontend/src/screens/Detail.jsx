import { useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppContext, useTheme } from '../App';
import { Card, Chip, Button, Blob, Header } from '../components/primitives';

export default function Detail() {
  const F = useTheme();
  const nav = useNavigate();
  const { id } = useParams();
  const { expenses, sym } = useContext(AppContext);
  const expense = expenses.find(e => String(e.id) === String(id));

  if (!expense) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: F.bg }}>
        <Header title="Spend detail" onBack={() => nav(-1)}/>
        <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: F.ink2 }}>Not found</div>
      </div>
    );
  }

  const similar = expenses.filter(e => e.cat === expense.cat && e.id !== expense.id).slice(0, 3);
  const monthSum = expenses.filter(e => e.cat === expense.cat).reduce((s, e) => s + e.amount, 0);
  const moodLabel = expense.mood === '😍' ? 'Loved it'
    : expense.mood === '😌' ? 'Worth it'
    : expense.mood === '😐' ? 'Neutral'
    : expense.mood === '😬' ? 'Unsure' : 'Regret';

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      background: F.bg, color: F.ink, fontFamily: F.sans,
    }}>
      <Header title="Spend detail" onBack={() => nav(-1)}/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 30px' }}>
        <Card color={F.cream} radius={26} pad={22} border={false}
          style={{ textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <Blob color={F.blushD} size={200} style={{ position: 'absolute', top: -40, right: -60, opacity: 0.6 }}/>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 36, marginBottom: 4 }}>{expense.icon}</div>
            <div style={{ fontFamily: F.display, fontSize: 56, fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {sym}{expense.amount.toFixed(2)}
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: F.ink }}>{expense.merchant}</div>
            <div style={{ marginTop: 2, fontSize: 11, color: F.ink2 }}>{expense.time} · {expense.cat}</div>
          </div>
        </Card>

        <Card pad={14} radius={18} style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: F.cream,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>{expense.mood}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: F.ink2 }}>You felt</div>
            <div style={{ fontFamily: F.display, fontSize: 16, color: F.ink }}>{moodLabel}</div>
          </div>
          <Chip color={F.mint} fg={F.sageD}>edit</Chip>
        </Card>

        <Card pad={4} radius={18} style={{ marginTop: 12 }}>
          {[
            ['Pot',       expense.cat],
            ['Date',      expense.time],
            ['Carbon',    `${expense.carbon} kg CO₂e · low`],
            ['Recurring', expense.recurring ? 'Monthly' : 'One-time'],
            ['Method',    '•••• 4291'],
          ].map(([l, v], i) => (
            <div key={l} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '12px 14px', borderTop: i ? `1px solid ${F.line}` : 'none',
              fontSize: 13,
            }}>
              <span style={{ color: F.ink2 }}>{l}</span>
              <span>{v}</span>
            </div>
          ))}
        </Card>

        <div style={{ marginTop: 22 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8,
          }}>
            <h4 style={{ margin: 0, fontFamily: F.display, fontSize: 16, fontWeight: 400, color: F.ink }}>
              This month at {expense.cat}
            </h4>
            <span style={{ fontFamily: F.display, fontSize: 17, color: F.coral }}>{sym}{monthSum.toFixed(2)}</span>
          </div>
          <Card pad={4} radius={18}>
            {similar.length === 0 && (
              <div style={{ padding: 16, fontSize: 12, color: F.ink3, textAlign: 'center' }}>
                No other {expense.cat} spends yet
              </div>
            )}
            {similar.map((e, i) => (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderTop: i ? `1px solid ${F.line}` : 'none',
              }}>
                <span style={{ fontSize: 16 }}>{e.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: F.ink }}>{e.merchant}</div>
                  <div style={{ fontSize: 10, color: F.ink3 }}>{e.time}</div>
                </div>
                <div style={{ fontFamily: F.display, fontSize: 15, color: F.ink }}>{sym}{e.amount.toFixed(2)}</div>
              </div>
            ))}
          </Card>
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
          <Button variant="secondary" size="md" style={{ flex: 1 }}>Split bill</Button>
          <Button variant="secondary" size="md" style={{ flex: 1 }}>Edit</Button>
          <Button variant="outline" size="md" style={{ flex: 1 }}>Delete</Button>
        </div>
      </div>
    </div>
  );
}
