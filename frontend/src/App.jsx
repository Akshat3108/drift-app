import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { FT, FTD } from './theme';
import { useAppState } from './hooks/useAppState';
import { CURRENCIES } from './data/constants';
import Icon from './components/Icon';
import Toast from './components/primitives/Toast';
import AddSheet from './components/AddSheet';

import Home      from './screens/Home';
import Expenses  from './screens/Expenses';
import Detail    from './screens/Detail';
import Scan      from './screens/Scan';
import Trends    from './screens/Trends';
import Subs      from './screens/Subs';
import Goals     from './screens/Goals';
import NetWorth  from './screens/NetWorth';
import Travel    from './screens/Travel';
import Profile   from './screens/Profile';

export const ThemeContext = createContext(FT);
export const AppContext   = createContext(null);

export function useTheme() { return useContext(ThemeContext); }
export function useApp()   { return useContext(AppContext); }

const TABS = [
  { k: '/',       i: 'home',   l: 'Home' },
  { k: '/scan',   i: 'camera', l: 'Scan' },
  { k: 'add',     i: 'plus' },
  { k: '/trends', i: 'chart',  l: 'Trends' },
  { k: '/subs',   i: 'repeat', l: 'Subs' },
];

const TAB_PATHS = new Set(['/', '/scan', '/trends', '/subs']);

function TabBar({ onAdd }) {
  const F = useTheme();
  const { pathname } = useLocation();
  const nav = useNavigate();
  return (
    <div style={{
      position: 'absolute', bottom: 14, left: 14, right: 14, zIndex: 50,
      background: F.surface, borderRadius: 28, padding: '10px 8px',
      display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      boxShadow: '0 14px 36px rgba(232,93,68,0.10), 0 1px 0 rgba(255,255,255,0.8) inset',
      border: `1px solid ${F.line}`,
    }}>
      {TABS.map(t => {
        if (t.k === 'add') {
          return (
            <button key="add" onClick={onAdd} style={{
              width: 50, height: 50, borderRadius: 18, background: F.coral, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 18px rgba(232,93,68,0.4)',
              marginTop: -20, border: 'none', cursor: 'pointer',
            }}>
              <Icon name="plus" size={24} color="#fff" stroke={2.4}/>
            </button>
          );
        }
        const isActive = pathname === t.k;
        return (
          <button key={t.k} onClick={() => nav(t.k)} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '4px 10px', background: 'transparent', border: 'none', cursor: 'pointer',
          }}>
            <Icon name={t.i} size={20} color={isActive ? F.coral : F.ink3} stroke={1.9}/>
            <span style={{ fontSize: 9.5, color: isActive ? F.coral : F.ink3,
              fontWeight: isActive ? 600 : 500, fontFamily: F.sans }}>{t.l}</span>
          </button>
        );
      })}
    </div>
  );
}

function StatusBar() {
  const F = useTheme();
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: 50, zIndex: 30,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 28px 0', pointerEvents: 'none',
      fontFamily: F.sans, fontSize: 13, fontWeight: 600, color: F.ink,
    }}>
      <span>9:41</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11 }}>●●●●</span>
        <span style={{ fontSize: 11 }}>📶</span>
        <span style={{ fontSize: 11 }}>🔋</span>
      </div>
    </div>
  );
}

function PhoneShell({ openAdd }) {
  const F = useTheme();
  const { pathname } = useLocation();
  const showTabBar = TAB_PATHS.has(pathname);

  return (
    <div style={{ position: 'absolute', inset: 0, background: F.bg, overflow: 'hidden' }}>
      <StatusBar/>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Routes>
          <Route path="/"          element={<Home/>}/>
          <Route path="/expenses"  element={<Expenses/>}/>
          <Route path="/detail/:id" element={<Detail/>}/>
          <Route path="/scan"      element={<Scan/>}/>
          <Route path="/trends"    element={<Trends/>}/>
          <Route path="/subs"      element={<Subs/>}/>
          <Route path="/goals"     element={<Goals/>}/>
          <Route path="/net-worth" element={<NetWorth/>}/>
          <Route path="/travel"    element={<Travel/>}/>
          <Route path="/profile"   element={<Profile/>}/>
          <Route path="*"          element={<Navigate to="/"/>}/>
        </Routes>
      </div>
      {showTabBar && <TabBar onAdd={openAdd}/>}
    </div>
  );
}

function PhoneFrame({ children, dark }) {
  return (
    <div style={{
      position: 'relative',
      width: 'min(440px, calc(100vw - 24px))',
      height: 'min(900px, calc(100vh - 24px))',
      maxHeight: 900,
      background: dark ? '#1a1410' : '#fdf6f0',
      borderRadius: 44,
      boxShadow: '0 30px 80px rgba(120, 60, 30, 0.18), 0 8px 30px rgba(120, 60, 30, 0.08), inset 0 0 0 1px rgba(0,0,0,0.04)',
      overflow: 'hidden',
      border: `8px solid ${dark ? '#0a0805' : '#2a1c14'}`,
    }}>
      {children}
    </div>
  );
}

function InfoPanel({ dark, onToggleDark, onPlayOnboarding }) {
  const ink = dark ? '#f6ece2' : '#2a1c14';
  const ink2 = dark ? '#c0aa97' : '#7a5c48';
  const line = dark ? '#332620' : '#f0e3d2';
  return (
    <aside style={{
      width: 280, maxWidth: 280, color: ink,
      fontFamily: '"Geist", -apple-system, system-ui, sans-serif',
    }}>
      <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
        color: '#e85d44', fontWeight: 600, marginBottom: 8 }}>Drift · Flow direction</div>
      <h1 style={{
        fontFamily: '"Fraunces", Georgia, serif', fontWeight: 400, fontSize: 44,
        letterSpacing: '-0.02em', margin: 0, lineHeight: 1,
      }}>
        See where it <em style={{ color: '#e85d44' }}>flows.</em>
      </h1>
      <p style={{ fontSize: 13, lineHeight: 1.55, color: ink2, margin: '14px 0 0' }}>
        A gentle personal expense manager. Snap a receipt, the line items appear.
        Set soft pots instead of rigid budgets. Let the nudges find unused subscriptions for you.
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.55, color: ink2, margin: '14px 0 0' }}>
        Built around a 7-pot budget, a forecast that ends the month with breathing room,
        and a mood tag on every spend so you notice the patterns.
      </p>
      <div style={{
        marginTop: 22, paddingTop: 16, borderTop: `1px solid ${line}`,
        display: 'grid', gap: 8, fontSize: 12, color: ink2,
      }}>
        <div>Tap the avatar → settings</div>
        <div>Tap any spend → detail</div>
        <div>Tap + → add a spend</div>
        <div>Tabs switch screens</div>
      </div>
      <div style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={onToggleDark} style={{
          fontSize: 12, color: '#e85d44', background: 'transparent',
          padding: '6px 12px', borderRadius: 99, border: `1px solid ${line}`,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>{dark ? '☀ Light' : '🌙 Dark'}</button>
        <button onClick={onPlayOnboarding} style={{
          fontSize: 12, color: '#e85d44', background: 'transparent',
          padding: '6px 12px', borderRadius: 99, border: `1px solid ${line}`,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>▶ Onboarding</button>
      </div>
    </aside>
  );
}

function Stage({ children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 40, padding: 24, boxSizing: 'border-box', overflow: 'hidden',
    }}>
      {children}
    </div>
  );
}

function BackgroundBlobs() {
  return (
    <>
      <svg style={{ position: 'fixed', top: -160, right: -200, pointerEvents: 'none', opacity: 0.4, zIndex: -1 }}
        width={500} height={500} viewBox="0 0 200 200">
        <path fill="#f5b9a8" d="M44.6,-58.5C56.1,-49.2,62.5,-33.5,67.5,-17.6C72.5,-1.7,76,14.4,69.6,26.4C63.1,38.3,46.7,46.2,30.7,53.5C14.7,60.8,-1,67.5,-15.8,65.7C-30.5,63.9,-44.4,53.6,-54.2,40.1C-64,26.5,-69.6,9.7,-67.6,-6C-65.6,-21.7,-56,-36.3,-43.5,-46C-31,-55.7,-15.5,-60.6,1.1,-62C17.7,-63.4,33.1,-61.4,44.6,-58.5Z" transform="translate(100 100)"/>
      </svg>
      <svg style={{ position: 'fixed', bottom: -100, left: -100, pointerEvents: 'none', opacity: 0.4, zIndex: -1 }}
        width={400} height={400} viewBox="0 0 200 200">
        <path fill="#f3c969" d="M44.6,-58.5C56.1,-49.2,62.5,-33.5,67.5,-17.6C72.5,-1.7,76,14.4,69.6,26.4C63.1,38.3,46.7,46.2,30.7,53.5C14.7,60.8,-1,67.5,-15.8,65.7C-30.5,63.9,-44.4,53.6,-54.2,40.1C-64,26.5,-69.6,9.7,-67.6,-6C-65.6,-21.7,-56,-36.3,-43.5,-46C-31,-55.7,-15.5,-60.6,1.1,-62C17.7,-63.4,33.1,-61.4,44.6,-58.5Z" transform="translate(100 100)"/>
      </svg>
    </>
  );
}

export default function App() {
  const appState = useAppState();
  const F = appState.settings.dark ? FTD : FT;
  const sym = CURRENCIES[appState.settings.currency]?.symbol || '₹';

  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, opts = {}) => {
    setToast({ msg, ...opts });
    setTimeout(() => setToast(null), opts.duration || 2600);
  }, []);

  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    document.body.style.background = F.bg;
  }, [F.bg]);

  return (
    <ThemeContext.Provider value={F}>
      <AppContext.Provider value={{
        ...appState, sym, toast, showToast,
        openAdd: () => setShowAdd(true),
        closeAdd: () => setShowAdd(false),
      }}>
        <BackgroundBlobs/>
        <Stage>
          <InfoPanel
            dark={appState.settings.dark}
            onToggleDark={() => appState.setSetting('dark', !appState.settings.dark)}
            onPlayOnboarding={() => { /* reserved */ }}
          />
          <PhoneFrame dark={appState.settings.dark}>
            <BrowserRouter>
              <PhoneShell openAdd={() => setShowAdd(true)}/>
              {showAdd && <AddSheet onClose={() => setShowAdd(false)}/>}
              <Toast/>
            </BrowserRouter>
          </PhoneFrame>
        </Stage>
        {/* responsive: hide side panel on narrow viewports */}
        <style>{`
          @media (max-width: 900px) {
            aside { display: none !important; }
          }
          @keyframes fScan {
            0% { top: 18%; opacity: 0; }
            20% { opacity: 1; }
            80% { opacity: 1; }
            100% { top: 78%; opacity: 0; }
          }
        `}</style>
      </AppContext.Provider>
    </ThemeContext.Provider>
  );
}
