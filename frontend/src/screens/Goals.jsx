import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext, useTheme } from '../App';
import { Card, Button, Header } from '../components/primitives';
import Icon from '../components/Icon';

export default function Goals() {
  const F = useTheme();
  const nav = useNavigate();
  const { goals, sym } = useContext(AppContext);
  const totalSaved = goals.reduce((s, g) => s + g.have, 0);
  const totalGoal  = goals.reduce((s, g) => s + g.need, 0);

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      background: F.bg, color: F.ink, fontFamily: F.sans,
    }}>
      <Header title="Goals" onBack={() => nav(-1)}
        right={
          <button style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
            <Icon name="plus" size={20} color={F.coral} stroke={2}/>
          </button>
        }/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 30px' }}>
        <Card color={F.cream} radius={26} pad={22} border={false}>
          <div style={{ fontSize: 12, color: F.ink2 }}>Saved toward goals</div>
          <div style={{ marginTop: 4, fontFamily: F.display, fontSize: 44, fontWeight: 400, letterSpacing: '-0.02em' }}>
            {sym}{totalSaved.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: F.ink2 }}>
            of {sym}{totalGoal.toLocaleString()} ({Math.round((totalSaved / totalGoal) * 100)}%)
          </div>
          <div style={{ marginTop: 12, height: 10, borderRadius: 5, background: F.surface, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(totalSaved / totalGoal) * 100}%`, background: F.coral }}/>
          </div>
        </Card>

        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          {goals.map((g, i) => {
            const pct = g.have / g.need;
            const emoji = g.emoji || ['✈️', '🛟', '💻', '🏠', '🎓', '🚗'][i % 6];
            const bg = [F.cream, F.mint, F.sky, F.lilac][i % 4];
            const c = [F.coral, F.sageD, F.sky2, '#9d8fc8'][i % 4];
            return (
              <Card key={g.id || g.name} pad={18} radius={22} color={bg} border={false}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 14, background: F.surface,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                    }}>{emoji}</div>
                    <div>
                      <div style={{ fontFamily: F.display, fontSize: 17, color: F.ink }}>{g.name}</div>
                      <div style={{ fontSize: 11, color: F.ink2 }}>ETA · {g.eta}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: F.display, fontSize: 22, color: c }}>{Math.round(pct * 100)}%</div>
                </div>
                <div style={{ marginTop: 14, height: 8, borderRadius: 4, background: F.surface, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct * 100}%`, background: c, borderRadius: 4 }}/>
                </div>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: F.ink2 }}>
                  <span><strong style={{ color: F.ink }}>{sym}{g.have}</strong> saved</span>
                  <span>{sym}{g.need - g.have} to go</span>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                  <Button variant="secondary" size="sm" style={{ flex: 1 }}>+ Add {sym}50</Button>
                  <Button variant="ghost" size="sm">Edit</Button>
                </div>
              </Card>
            );
          })}
        </div>

        <Button variant="outline" size="md" style={{ marginTop: 18, width: '100%' }}>
          + New goal
        </Button>
      </div>
    </div>
  );
}
