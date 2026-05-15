import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '../App';
import Icon from '../components/Icon';

const NAV = [
  { path: '/',          icon: 'home',    label: 'Overview' },
  { path: '/expenses',  icon: 'wallet',  label: 'Expenses' },
  { path: '/scan',      icon: 'camera',  label: 'Scan Bill' },
  { path: '/trends',    icon: 'chart',   label: 'Analytics' },
  { path: '/subs',      icon: 'repeat',  label: 'Subscriptions' },
  { path: '/goals',     icon: 'target',  label: 'Goals' },
  { path: '/net-worth', icon: 'trending',label: 'Net Worth' },
  { path: '/travel',    icon: 'plane',   label: 'Travel' },
];

export default function Sidebar() {
  const F = useTheme();
  const nav = useNavigate();
  const { pathname } = useLocation();

  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: F.surface,
      borderRight: `1px solid ${F.line}`,
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: `1px solid ${F.line}` }}>
        <div style={{ fontFamily: F.display, fontSize: 26, fontWeight: 400, color: F.ink, letterSpacing: '-0.02em' }}>
          Drift<span style={{ color: F.coral }}>.</span>
        </div>
        <div style={{ fontSize: 11, color: F.ink3, marginTop: 2 }}>Personal finance</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {NAV.map(item => {
          const active = pathname === item.path;
          return (
            <button key={item.path} onClick={() => nav(item.path)} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '9px 12px', borderRadius: 10,
              background: active ? F.coral : 'transparent',
              color: active ? '#fff' : F.ink2,
              border: 'none', cursor: 'pointer', fontFamily: F.sans,
              fontSize: 13.5, fontWeight: active ? 600 : 500,
              marginBottom: 2, textAlign: 'left',
              transition: 'background .12s, color .12s',
            }}>
              <Icon name={item.icon} size={17} color={active ? '#fff' : F.ink3} stroke={active ? 2 : 1.7}/>
              {item.label}
            </button>
          );
        })}

        <div style={{ height: 1, background: F.line, margin: '14px 4px' }}/>

        {/* Quick add */}
        <button onClick={() => nav('/scan')} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: '9px 12px', borderRadius: 10,
          background: F.cream, color: F.coral,
          border: `1px dashed ${F.blushD}`,
          cursor: 'pointer', fontFamily: F.sans, fontSize: 13.5, fontWeight: 600,
          textAlign: 'left',
        }}>
          <Icon name="plus" size={17} color={F.coral} stroke={2}/>
          Add expense
        </button>
      </nav>

      {/* User */}
      <div style={{ padding: '14px 16px', borderTop: `1px solid ${F.line}` }}>
        <button onClick={() => nav('/profile')} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'transparent', border: 'none', cursor: 'pointer',
          width: '100%', padding: '6px 4px', borderRadius: 8,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', background: F.cream,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: F.display, fontSize: 16, color: F.coral, flexShrink: 0,
          }}>R</div>
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: F.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Riya Kapoor</div>
            <div style={{ fontSize: 11, color: F.ink3 }}>Pro plan</div>
          </div>
          <Icon name="settings" size={15} color={F.ink3} style={{ marginLeft: 'auto', flexShrink: 0 }}/>
        </button>
      </div>
    </aside>
  );
}
