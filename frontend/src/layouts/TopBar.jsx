import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme, useApp } from '../App';
import Icon from '../components/Icon';
import { CURRENCIES } from '../data/constants';

const TITLES = {
  '/':          'Overview',
  '/expenses':  'Expenses',
  '/scan':      'Scan a Bill',
  '/trends':    'Analytics',
  '/subs':      'Subscriptions',
  '/goals':     'Goals',
  '/net-worth': 'Net Worth',
  '/travel':    'Travel Mode',
  '/profile':   'Profile & Settings',
};

export default function TopBar() {
  const F = useTheme();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { settings, setSetting, sym } = useApp();

  return (
    <header style={{
      height: 60, flexShrink: 0,
      background: F.surface, borderBottom: `1px solid ${F.line}`,
      display: 'flex', alignItems: 'center',
      padding: '0 28px', gap: 16,
    }}>
      <div style={{ fontFamily: F.display, fontSize: 20, fontWeight: 400, color: F.ink, flex: 1 }}>
        {TITLES[pathname] || 'Drift'}
      </div>

      {/* Currency switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6,
        background: F.cream, borderRadius: 8, padding: '5px 10px',
        border: `1px solid ${F.line}`, fontSize: 13 }}>
        <span style={{ color: F.coral, fontFamily: F.mono, fontWeight: 600 }}>{sym}</span>
        <select value={settings.currency} onChange={e => setSetting('currency', e.target.value)}
          style={{ background: 'transparent', border: 'none', color: F.ink, fontFamily: F.sans,
            fontSize: 12, cursor: 'pointer', outline: 'none' }}>
          {Object.keys(CURRENCIES).map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      {/* Dark mode */}
      <button onClick={() => setSetting('dark', !settings.dark)} style={{
        width: 34, height: 34, borderRadius: 8,
        background: F.cream, border: `1px solid ${F.line}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}>
        <Icon name={settings.dark ? 'sun' : 'moon'} size={16} color={F.ink2}/>
      </button>

      {/* Notifications */}
      <button style={{
        width: 34, height: 34, borderRadius: 8,
        background: F.cream, border: `1px solid ${F.line}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', position: 'relative',
      }}>
        <Icon name="bell" size={16} color={F.ink2}/>
        <div style={{ position: 'absolute', top: 7, right: 7,
          width: 7, height: 7, borderRadius: '50%', background: F.coral,
          border: `1.5px solid ${F.surface}` }}/>
      </button>

      {/* Avatar */}
      <button onClick={() => nav('/profile')} style={{
        width: 34, height: 34, borderRadius: '50%',
        background: F.cream, border: `1px solid ${F.line}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: F.display, fontSize: 15, color: F.coral, cursor: 'pointer',
      }}>R</button>
    </header>
  );
}
