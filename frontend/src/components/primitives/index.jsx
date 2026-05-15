import { useTheme } from '../../App';
import Icon from '../Icon';

export { useTheme };

export function Card({ children, style, color, pad = 18, radius = 22, border = true }) {
  const F = useTheme();
  return (
    <div style={{
      background: color || F.surface, borderRadius: radius, padding: pad,
      border: border ? `1px solid ${F.line}` : 'none', ...style,
    }}>{children}</div>
  );
}

export function Button({ children, onClick, variant = 'primary', size = 'md', style, disabled }) {
  const F = useTheme();
  const variants = {
    primary:   { background: F.coral, color: '#fff', boxShadow: '0 6px 16px rgba(232,93,68,0.28)' },
    secondary: { background: F.surface, color: F.ink, border: `1px solid ${F.line}` },
    ghost:     { background: 'transparent', color: F.coral },
    outline:   { background: 'transparent', color: F.coral, border: `1.5px solid ${F.coral}` },
    danger:    { background: 'transparent', color: '#e55', border: '1.5px solid #e55' },
  };
  const pads = { sm: '8px 14px', md: '12px 18px', lg: '16px 22px' };
  const fss  = { sm: 12, md: 13, lg: 15 };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: pads[size], fontSize: fss[size], fontWeight: 600, borderRadius: 99,
      border: 'none', cursor: disabled ? 'default' : 'pointer',
      fontFamily: F.sans, opacity: disabled ? 0.5 : 1,
      transition: 'transform .12s, opacity .12s',
      ...variants[variant], ...style,
    }}>{children}</button>
  );
}

export function Chip({ children, color, fg, style }) {
  const F = useTheme();
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 9px', borderRadius: 99,
      background: color || F.cream, color: fg || F.coral,
      fontSize: 10.5, fontWeight: 600, ...style,
    }}>{children}</span>
  );
}

export function StatCard({ label, value, sub, color, icon, onClick, style }) {
  const F = useTheme();
  return (
    <div onClick={onClick} style={{
      background: F.surface, border: `1px solid ${F.line}`,
      borderRadius: 16, padding: '14px 16px',
      cursor: onClick ? 'pointer' : 'default', ...style,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 10, color: F.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
        {icon && <div style={{ width: 28, height: 28, borderRadius: 8, background: F.cream,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{icon}</div>}
      </div>
      <div style={{ marginTop: 8, fontFamily: F.display, fontSize: 22, fontWeight: 400,
        letterSpacing: '-0.02em', color: color || F.ink, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ marginTop: 5, fontSize: 11, color: F.ink3 }}>{sub}</div>}
    </div>
  );
}

export function SectionHeader({ title, action, actionLabel }) {
  const F = useTheme();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
      <h3 style={{ margin: 0, fontFamily: F.display, fontSize: 19, fontWeight: 400, color: F.ink }}>{title}</h3>
      {action && <button onClick={action} style={{
        background: 'transparent', border: 'none', color: F.coral,
        fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
      }}>{actionLabel || 'see all'}</button>}
    </div>
  );
}

export function Toggle({ value, onChange }) {
  const F = useTheme();
  return (
    <button onClick={() => onChange && onChange(!value)} style={{
      width: 42, height: 24, borderRadius: 99, background: value ? F.coral : F.line,
      border: 'none', position: 'relative', cursor: 'pointer', padding: 0,
      transition: 'background .14s', flexShrink: 0,
    }}>
      <div style={{ position: 'absolute', top: 2, left: value ? 20 : 2,
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left .18s' }}/>
    </button>
  );
}

export function Blob({ color, size = 200, style }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} style={{ pointerEvents: 'none', ...style }}>
      <path fill={color} d="M44.6,-58.5C56.1,-49.2,62.5,-33.5,67.5,-17.6C72.5,-1.7,76,14.4,69.6,26.4C63.1,38.3,46.7,46.2,30.7,53.5C14.7,60.8,-1,67.5,-15.8,65.7C-30.5,63.9,-44.4,53.6,-54.2,40.1C-64,26.5,-69.6,9.7,-67.6,-6C-65.6,-21.7,-56,-36.3,-43.5,-46C-31,-55.7,-15.5,-60.6,1.1,-62C17.7,-63.4,33.1,-61.4,44.6,-58.5Z" transform="translate(100 100)"/>
    </svg>
  );
}

// Mobile-style scrollable screen body. Pads top below status bar and bottom above tab bar.
export function Screen({ children, padBottom = 110, padTop = 50 }) {
  const F = useTheme();
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: F.bg, color: F.ink, fontFamily: F.sans,
      overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch',
      paddingTop: padTop, paddingBottom: padBottom,
    }}>{children}</div>
  );
}

// Mobile-style header with optional back button + right slot.
export function Header({ title, onBack, right, subtitle }) {
  const F = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 20px 14px', gap: 12 }}>
      {onBack ? (
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%', background: F.surface,
          border: `1px solid ${F.line}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, cursor: 'pointer',
        }}>
          <Icon name="arrowR" size={16} color={F.ink} stroke={2} style={{ transform: 'rotate(180deg)' }}/>
        </button>
      ) : <div style={{ width: 36 }}/>}
      <div style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ fontFamily: F.display, fontSize: 17, color: F.ink, lineHeight: 1.1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: F.ink2, marginTop: 1 }}>{subtitle}</div>}
      </div>
      <div style={{ width: 36, display: 'flex', justifyContent: 'flex-end' }}>{right || <div style={{ width: 36 }}/>}</div>
    </div>
  );
}

export function Avatar({ size = 40, onClick, letter = 'R' }) {
  const F = useTheme();
  return (
    <button onClick={onClick} style={{
      width: size, height: size, borderRadius: '50%', background: F.cream,
      border: `1px solid ${F.line}`, padding: 0, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: F.display, fontSize: size * 0.45, color: F.coral, flexShrink: 0,
    }}>{letter}</button>
  );
}
