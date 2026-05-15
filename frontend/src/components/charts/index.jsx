export function Donut({ size = 160, thickness = 22, data, palette, label, sublabel, textColor = '#222' }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth={thickness}/>
      {data.map((d, i) => {
        const frac = d.value / total;
        const dash = `${frac * c} ${c}`;
        const off = -acc * c;
        acc += frac;
        return (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none"
            stroke={palette[i % palette.length]} strokeWidth={thickness}
            strokeDasharray={dash} strokeDashoffset={off}
            transform={`rotate(-90 ${size/2} ${size/2})`}
            strokeLinecap="butt"/>
        );
      })}
      {label && (
        <text x={size/2} y={size/2 - 4} textAnchor="middle" fill={textColor}
          style={{ font: '600 22px ui-sans-serif, system-ui' }}>{label}</text>
      )}
      {sublabel && (
        <text x={size/2} y={size/2 + 16} textAnchor="middle" fill={textColor} opacity={0.55}
          style={{ font: '500 10px ui-sans-serif, system-ui', letterSpacing: 1, textTransform: 'uppercase' }}>{sublabel}</text>
      )}
    </svg>
  );
}

export function Spark({ data, width = 240, height = 60, color = '#222', fill = 'none', strokeWidth = 1.6, gradient }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pad = 4;
  const xs = (i) => pad + (i * (width - pad * 2)) / (data.length - 1);
  const ys = (v) => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${xs(i)},${ys(v)}`).join(' ');
  const area = `${path} L${xs(data.length - 1)},${height} L${xs(0)},${height} Z`;
  const gid = `g-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {gradient && (
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4}/>
            <stop offset="100%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>
      )}
      {fill !== 'none' && <path d={area} fill={gradient ? `url(#${gid})` : fill}/>}
      <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

export function Bars({ data, width = 260, height = 100, color = '#222', gap = 6, rounded = 3, highlight = -1, highlightColor }) {
  const max = Math.max(...data.map(d => d.v));
  const bw = (width - gap * (data.length - 1)) / data.length;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {data.map((d, i) => {
        const h = (d.v / max) * (height - 16);
        const x = i * (bw + gap);
        const isHi = i === highlight || (highlight === -1 && i === data.length - 1);
        return (
          <g key={i}>
            <rect x={x} y={height - h - 14} width={bw} height={h} rx={rounded}
              fill={isHi ? (highlightColor || color) : color} opacity={isHi ? 1 : 0.22}/>
            <text x={x + bw/2} y={height - 2} textAnchor="middle" fill="currentColor" opacity={0.55}
              style={{ font: '500 9px ui-sans-serif, system-ui' }}>{d.m}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Heatmap({ data, color = '#222', size = 18, gap = 4 }) {
  const cols = 5; const rows = 7;
  const max = 220;
  return (
    <svg width={cols * (size + gap) - gap} height={rows * (size + gap) - gap}>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const i = c * rows + r;
          const d = data[i] || { amount: 0 };
          const a = Math.min(d.amount / max, 1);
          return (
            <rect key={`${r}-${c}`} x={c * (size + gap)} y={r * (size + gap)}
              width={size} height={size} rx={3}
              fill={color} opacity={d.amount === 0 ? 0.05 : 0.18 + a * 0.82}/>
          );
        })
      )}
    </svg>
  );
}

export function Gauge({ value, size = 120, thickness = 10, color = '#222' }) {
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  const arc = 0.7;
  const filled = Math.min(value, 1) * arc;
  return (
    <svg width={size} height={size * 0.7}>
      <g transform={`translate(${size/2} ${size/2}) rotate(${(1 - arc) * 180})`}>
        <circle cx={0} cy={0} r={r} fill="none" stroke="currentColor" strokeOpacity={0.1}
          strokeWidth={thickness} strokeDasharray={`${arc * c} ${c}`} strokeLinecap="round"/>
        <circle cx={0} cy={0} r={r} fill="none" stroke={color}
          strokeWidth={thickness} strokeDasharray={`${filled * c} ${c}`} strokeLinecap="round"/>
      </g>
    </svg>
  );
}
