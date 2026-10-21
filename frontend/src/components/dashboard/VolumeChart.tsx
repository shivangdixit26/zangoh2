import { useEffect, useRef, useState } from 'react';
import { clockShort } from '../../lib/format';
import type { Metrics } from '../../types';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

const H = 190;
const PAD = { top: 12, right: 12, bottom: 22, left: 30 };

/** Live load (solid) vs SLA exposure (dashed), as in the design. Hover shows exact values. */
export function VolumeChart({ series }: { series: Metrics['series'] }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pts = series.points;
  // "Nice" axis: 4 equal steps of 1/2/2.5/5 × 10^n that cover the data with some headroom.
  const rawStep = (Math.max(4, ...pts.map((p) => Math.max(p.live, p.exposure))) * 1.15) / 4;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = ([1, 2, 2.5, 5, 10].find((n) => n * mag >= rawStep) ?? 10) * mag;
  const maxY = step * 4;
  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (pts.length <= 1 ? 0 : (i / (pts.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / maxY) * innerH;
  const path = (key: 'live' | 'exposure') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const ticks = [0, 1, 2, 3, 4].map((i) => Number((step * i).toFixed(2)));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = e.clientX - rect.left - PAD.left;
    const i = Math.round((rel / innerW) * (pts.length - 1));
    setHover(Math.max(0, Math.min(pts.length - 1, i)));
  };

  const hp = hover != null ? pts[hover] : null;

  return (
    <div ref={ref} className="relative w-full">
      <svg width={width} height={H} role="img" aria-label="Conversation volume and SLA exposure over time" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="#ecebf1" />
            <text x={PAD.left - 8} y={y(t) + 3} textAnchor="end" className="fill-muted text-[10px]">{t}</text>
          </g>
        ))}
        {pts.length > 1 && [0, Math.floor((pts.length - 1) / 2), pts.length - 1].map((i) => (
          <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'} className="fill-muted text-[10px]">
            {i === pts.length - 1 ? 'now' : clockShort(pts[i].t)}
          </text>
        ))}
        <path d={path('exposure')} fill="none" stroke="#e3a336" strokeWidth={2.5} strokeDasharray="7 7" strokeLinecap="round" />
        <path d={path('live')} fill="none" stroke="#4b3c86" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1]?.live ?? 0)} r={4} fill="#4b3c86" className="pulse-dot" />
        {hp && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="#b9addf" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(hp.live)} r={4} fill="#4b3c86" />
            <circle cx={x(hover)} cy={y(hp.exposure)} r={4} fill="#e3a336" />
          </g>
        )}
      </svg>
      {hp && hover != null && (
        <div className="pointer-events-none absolute top-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs shadow-pop" style={{ left: Math.min(Math.max(x(hover) - 60, 0), width - 130) }}>
          <p className="font-semibold text-ink">{hover === pts.length - 1 ? 'Now' : clockShort(hp.t)}</p>
          <p className="text-brand-800">Live load: {hp.live}</p>
          <p className="text-warn-ink">SLA exposure: {hp.exposure}</p>
        </div>
      )}
    </div>
  );
}
