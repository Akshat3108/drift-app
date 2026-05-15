import { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext, useTheme } from '../App';
import { Card, Toggle, Chip, Blob, Header } from '../components/primitives';
import { CURRENCIES } from '../data/constants';
import Icon from '../components/Icon';

function SettingsSection({ title, children }) {
  const F = useTheme();
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontFamily: F.display, fontSize: 14, color: F.ink2, marginBottom: 8, paddingLeft: 4 }}>{title}</div>
      <Card pad={2} radius={18}>{children}</Card>
    </div>
  );
}

function SettingsRow({ icon, label, subtitle, right, onClick }) {
  const F = useTheme();
  const inner = (
    <div style={{
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: F.cream,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, textAlign: 'left' }}>
        <div style={{ fontSize: 13, color: F.ink, fontWeight: 500 }}>{label}</div>
        {subtitle && <div style={{ fontSize: 11, color: F.ink2 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
  if (onClick) {
    return (
      <button onClick={onClick} style={{
        background: 'transparent', border: 'none', borderTop: `1px solid ${F.line}`,
        padding: 0, width: '100%', cursor: 'pointer', color: F.ink, fontFamily: F.sans,
        display: 'block',
      }}>{inner}</button>
    );
  }
  return <div style={{ borderTop: `1px solid ${F.line}` }}>{inner}</div>;
}

export default function Profile() {
  const F = useTheme();
  const nav = useNavigate();
  const { settings, setSetting, goals, subs, sym } = useContext(AppContext);

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      background: F.bg, color: F.ink, fontFamily: F.sans,
    }}>
      <Header title="You" onBack={() => nav(-1)}/>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 30px' }}>
        <Card color={F.cream} radius={26} pad={20} border={false}
          style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', overflow: 'hidden' }}>
          <Blob color={F.blushD} size={180} style={{ position: 'absolute', top: -50, right: -50, opacity: 0.5 }}/>
          <div style={{
            position: 'relative', width: 64, height: 64, borderRadius: '50%',
            background: F.surface, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: F.display, fontSize: 32, color: F.coral,
          }}>R</div>
          <div style={{ position: 'relative' }}>
            <div style={{ fontFamily: F.display, fontSize: 20, color: F.ink }}>Riya Kapoor</div>
            <div style={{ fontSize: 12, color: F.ink2 }}>riya@drift.app · Pro</div>
            <Chip color={F.surface} fg={F.coral} style={{ marginTop: 4 }}>🔥 7-day streak</Chip>
          </div>
        </Card>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            ['Saved this mo', `${sym}920`, F.sageD],
            ['Net worth',     `${sym}38.4k`, F.coral],
            ['Bills tracked', `${subs.length}`, F.sky2],
          ].map(([l, v, c]) => (
            <Card key={l} pad={12} radius={14} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: F.ink2 }}>{l}</div>
              <div style={{ fontFamily: F.display, fontSize: 17, color: c, marginTop: 2 }}>{v}</div>
            </Card>
          ))}
        </div>

        <SettingsSection title="Preferences">
          <SettingsRow icon="🌐" label="Currency" right={
            <select value={settings.currency} onChange={(e) => setSetting('currency', e.target.value)} style={{
              background: 'transparent', border: 'none', fontFamily: F.sans, fontSize: 13,
              color: F.ink, textAlign: 'right',
            }}>
              {Object.keys(CURRENCIES).map(k => <option key={k} value={k}>{CURRENCIES[k].symbol} {k}</option>)}
            </select>
          }/>
          <SettingsRow icon={settings.dark ? '🌙' : '☀️'} label="Dark mode"
            right={<Toggle value={settings.dark} onChange={(v) => setSetting('dark', v)}/>}/>
          <SettingsRow icon="🎨" label="Accent color" right={
            <div style={{ display: 'flex', gap: 6 }}>
              {['#e85d44', '#7da587', '#a8c4d8', '#f3c969'].map(c => (
                <div key={c} style={{
                  width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: c === '#e85d44' ? `2px solid ${F.ink}` : '2px solid transparent',
                }}/>
              ))}
            </div>
          }/>
        </SettingsSection>

        <SettingsSection title="Features">
          <SettingsRow icon="✈️" label="Travel mode" subtitle="Multi-currency · daily budget"
            onClick={() => nav('/travel')} right={<Icon name="arrowR" size={14} color={F.ink3}/>}/>
          <SettingsRow icon="🎯" label="Goals" subtitle={`${goals.length} active`}
            onClick={() => nav('/goals')} right={<Icon name="arrowR" size={14} color={F.ink3}/>}/>
          <SettingsRow icon="💰" label="Net worth" subtitle="Assets + liabilities"
            onClick={() => nav('/net-worth')} right={<Icon name="arrowR" size={14} color={F.ink3}/>}/>
          <SettingsRow icon="🌱" label="Carbon tracking" subtitle="Estimate CO₂ per spend"
            right={<Toggle value={true} onChange={() => {}}/>}/>
          <SettingsRow icon="🎤" label="Voice add" subtitle='"Add 12 for lunch"'
            right={<Toggle value={true} onChange={() => {}}/>}/>
        </SettingsSection>

        <SettingsSection title="Accounts">
          {[
            ['🏦', 'Chase ···4291', 'Checking · linked'],
            ['💳', 'Amex Gold ···6021', 'Card · linked'],
            ['📈', 'Vanguard', 'Investment · linked'],
          ].map(([e, l, s]) => (
            <SettingsRow key={l} icon={e} label={l} subtitle={s}
              right={<Chip color={F.mint} fg={F.sageD}>✓</Chip>}/>
          ))}
          <SettingsRow icon="➕" label="Link new account" right={<Icon name="arrowR" size={14} color={F.ink3}/>}/>
        </SettingsSection>

        <SettingsSection title="More">
          <SettingsRow icon="🔔" label="Alerts & nudges" right={<Icon name="arrowR" size={14} color={F.ink3}/>}/>
          <SettingsRow icon="📤" label="Export · CSV / PDF" right={<Icon name="arrowR" size={14} color={F.ink3}/>}/>
          <SettingsRow icon="❔" label="Help & feedback" right={<Icon name="arrowR" size={14} color={F.ink3}/>}/>
        </SettingsSection>

        <div style={{ marginTop: 22, textAlign: 'center', fontSize: 10, color: F.ink3 }}>
          Drift · v2.4.1
        </div>
      </div>
    </div>
  );
}
