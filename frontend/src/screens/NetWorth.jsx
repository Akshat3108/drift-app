import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext, useTheme } from '../App';
import { Card, Blob, Header } from '../components/primitives';
import { Spark } from '../components/charts';

export default function NetWorth() {
  const F = useTheme();
  const nav = useNavigate();
  const { sym } = useContext(AppContext);

  const assets = [
    { l: 'Chase Checking', v: 4287,  k: 'cash', e: '🏦' },
    { l: 'Ally Savings',   v: 12400, k: 'cash', e: '💰' },
    { l: 'Vanguard VTI',   v: 18200, k: 'inv',  e: '📈' },
    { l: 'Bitcoin',        v: 4100,  k: 'inv',  e: '₿' },
    { l: 'Cash on hand',   v: 320,   k: 'cash', e: '💵' },
  ];
  const liabs = [
    { l: 'Amex Gold',    v: 842, e: '💳' },
    { l: 'Student loan', v: 92,  e: '🎓' },
  ];
  const assetTotal = assets.reduce((s, a) => s + a.v, 0);
  const liabTotal  = liabs.reduce((s, l) => s + l.v, 0);
  const net = assetTotal - liabTotal;

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      background: F.bg, color: F.ink, fontFamily: F.sans,
    }}>
      <Header title="Net worth" onBack={() => nav(-1)}/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 30px' }}>
        <Card color={F.cream} radius={26} pad={22} border={false}
          style={{ position: 'relative', overflow: 'hidden' }}>
          <Blob color={F.blushD} size={240} style={{ position: 'absolute', top: -50, right: -80, opacity: 0.5 }}/>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 12, color: F.ink2 }}>Net worth</div>
            <div style={{
              marginTop: 4, fontFamily: F.display, fontSize: 48,
              fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1,
            }}>
              {sym}{net.toLocaleString()}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: F.sageD }}>
              ↑ {sym}820 this month · +2.1%
            </div>
            <div style={{ marginTop: 14, color: F.coral }}>
              <Spark data={[32, 33, 33.2, 34, 34.2, 35, 35.5, 36, 36.4, 37, 37.2, 37.8, 38.4]}
                width={300} height={70} color={F.coral} fill="x" gradient strokeWidth={2}/>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 10, color: F.ink3, marginTop: 4,
            }}>
              <span>Jan</span><span>now</span>
            </div>
          </div>
        </Card>

        <div style={{
          marginTop: 22, display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', marginBottom: 8,
        }}>
          <h4 style={{ margin: 0, fontFamily: F.display, fontSize: 17, fontWeight: 400, color: F.ink }}>Assets</h4>
          <span style={{ fontFamily: F.display, fontSize: 17, color: F.sageD }}>+{sym}{assetTotal.toLocaleString()}</span>
        </div>
        <Card pad={4} radius={18}>
          {assets.map((a, i) => (
            <div key={a.l} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderTop: i ? `1px solid ${F.line}` : 'none',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: a.k === 'cash' ? F.mint : F.lilac,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>{a.e}</div>
              <div style={{ flex: 1, fontSize: 13, color: F.ink }}>{a.l}</div>
              <div style={{ fontFamily: F.display, fontSize: 16, color: F.ink }}>{sym}{a.v.toLocaleString()}</div>
            </div>
          ))}
        </Card>

        <div style={{
          marginTop: 22, display: 'flex', justifyContent: 'space-between',
          alignItems: 'baseline', marginBottom: 8,
        }}>
          <h4 style={{ margin: 0, fontFamily: F.display, fontSize: 17, fontWeight: 400, color: F.ink }}>Liabilities</h4>
          <span style={{ fontFamily: F.display, fontSize: 17, color: F.coral }}>−{sym}{liabTotal.toLocaleString()}</span>
        </div>
        <Card pad={4} radius={18}>
          {liabs.map((a, i) => (
            <div key={a.l} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderTop: i ? `1px solid ${F.line}` : 'none',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10, background: F.blush,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>{a.e}</div>
              <div style={{ flex: 1, fontSize: 13, color: F.ink }}>{a.l}</div>
              <div style={{ fontFamily: F.display, fontSize: 16, color: F.coral }}>−{sym}{a.v.toLocaleString()}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
