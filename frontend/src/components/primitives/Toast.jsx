import { useApp, useTheme } from '../../App';

export default function Toast() {
  const F = useTheme();
  const { toast } = useApp();
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      background: F.ink, color: F.bg, padding: '12px 20px', borderRadius: 12,
      fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 8px 30px rgba(0,0,0,0.22)',
      zIndex: 9999, whiteSpace: 'nowrap',
      transition: 'opacity .22s, transform .22s',
      opacity: toast ? 1 : 0,
      pointerEvents: toast ? 'auto' : 'none',
      fontFamily: F.sans,
    }}>
      {toast?.icon && <span style={{ fontSize: 16 }}>{toast.icon}</span>}
      <span>{toast?.msg}</span>
    </div>
  );
}
