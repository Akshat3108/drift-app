import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext, useTheme } from '../App';
import { Card, Blob, Header } from '../components/primitives';

export default function Travel() {
  const F = useTheme();
  const nav = useNavigate();
  const { sym } = useContext(AppContext);

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      background: F.bg, color: F.ink, fontFamily: F.sans,
    }}>
      <Header title="Travel mode" subtitle="Currently planning · ✈ Japan" onBack={() => nav(-1)}/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 30px' }}>
        <div style={{
          margin: '0 20px', borderRadius: 26, padding: 22,
          position: 'relative', overflow: 'hidden',
          background: `linear-gradient(135deg, #f3c969, ${F.coral})`, color: '#fff',
        }}>
          <Blob color="rgba(255,255,255,0.2)" size={220}
            style={{ position: 'absolute', top: -60, right: -80 }}/>
          <div style={{ position: 'relative' }}>
            <div style={{
              fontSize: 11, opacity: 0.9, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}>✈️ Trip to Japan</div>
            <div style={{ marginTop: 8, fontFamily: F.display, fontSize: 30, lineHeight: 1.1 }}>
              <em>Tokyo & Kyoto</em><br/>Aug 14 – 28
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 16 }}>
              <div>
                <div style={{ fontSize: 10, opacity: 0.85 }}>Budget</div>
                <div style={{ fontFamily: F.display, fontSize: 20 }}>{sym}3,000</div>
              </div>
              <div>
                <div style={{ fontSize: 10, opacity: 0.85 }}>Per day</div>
                <div style={{ fontFamily: F.display, fontSize: 20 }}>{sym}214</div>
              </div>
              <div>
                <div style={{ fontSize: 10, opacity: 0.85 }}>Saved</div>
                <div style={{ fontFamily: F.display, fontSize: 20 }}>{sym}1,240</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '22px 20px 0' }}>
          <h4 style={{ margin: '0 0 10px', fontFamily: F.display, fontSize: 16, fontWeight: 400, color: F.ink }}>
            Currencies
          </h4>
          <Card pad={4} radius={18}>
            {[
              { c: 'USD', s: '$', n: 'Home',   rate: '1.00',  amt: 1240 },
              { c: 'JPY', s: '¥', n: 'Japan',  rate: '150.4', amt: 186496, primary: true },
              { c: 'EUR', s: '€', n: 'Wallet', rate: '0.93',  amt: 0 },
            ].map((cu, i) => (
              <div key={cu.c} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderTop: i ? `1px solid ${F.line}` : 'none',
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: cu.primary ? F.coral : F.cream,
                  color: cu.primary ? '#fff' : F.coral,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: F.display, fontSize: 20,
                }}>{cu.s}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: F.ink, fontWeight: 500 }}>{cu.c} · {cu.n}</div>
                  <div style={{ fontSize: 11, color: F.ink2 }}>1 USD = {cu.rate} {cu.c}</div>
                </div>
                <div style={{ fontFamily: F.display, fontSize: 16, color: F.ink }}>
                  {cu.s}{cu.amt.toLocaleString()}
                </div>
              </div>
            ))}
          </Card>
        </div>

        <div style={{ padding: '22px 20px 0' }}>
          <h4 style={{ margin: '0 0 10px', fontFamily: F.display, fontSize: 16, fontWeight: 400, color: F.ink }}>
            Daily budget · trip days
          </h4>
          <Card pad={18} radius={22}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 90 }}>
              {[180, 210, 160, 250, 200, 170, 240, 190, 220, 260, 180, 200, 170, 150].map((v, i) => (
                <div key={i} style={{
                  flex: 1, height: `${(v / 280) * 100}%`,
                  background: v > 214 ? F.coral : F.sageD, borderRadius: 4, opacity: 0.85,
                }}/>
              ))}
            </div>
            <div style={{
              marginTop: 8, display: 'flex', justifyContent: 'space-between',
              fontSize: 10, color: F.ink3,
            }}>
              <span>Aug 14</span>
              <span style={{ color: F.coral, fontWeight: 600 }}>Avg {sym}214</span>
              <span>Aug 28</span>
            </div>
          </Card>
        </div>

        <div style={{ padding: '22px 20px 0' }}>
          <h4 style={{ margin: '0 0 10px', fontFamily: F.display, fontSize: 16, fontWeight: 400, color: F.ink }}>
            What you'll spend on
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['🏨 Stay',       `${sym}1,200`, '40%', F.coral],
              ['🍣 Food',       `${sym}600`,   '20%', F.butterD],
              ['🎌 Activities', `${sym}500`,   '17%', F.sageD],
              ['🚄 Transit',    `${sym}400`,   '13%', F.sky2],
            ].map(([l, v, p, c]) => (
              <Card key={l} pad={14} radius={16}>
                <div style={{ fontSize: 12, color: F.ink2 }}>{l}</div>
                <div style={{ fontFamily: F.display, fontSize: 20, color: F.ink, marginTop: 2 }}>{v}</div>
                <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: F.line, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: p, background: c }}/>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
