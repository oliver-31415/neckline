import { useEffect, useRef, useState } from 'preact/hooks';
import type { DayStat, Reading } from '../lib/analysis';
import { fmt1 } from '../lib/analysis';
import { DAY, HOUR, fmtDay, fmtTime } from '../lib/time';
import type { Entry } from '../lib/types';
import { POSTURES } from '../lib/catalog';
import { editEntry } from '../lib/nav';

function useWidth<T extends HTMLElement>(fallback = 340) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/* ---------------- pain over time ---------------- */
export function PainTrend({ days, rs, from, to, height = 190 }: { days: DayStat[]; rs: Reading[]; from: number; to: number; height?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<{ x: number; y: number; d: DayStat } | null>(null);
  const pad = { l: 24, r: 8, t: 10, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (t: number) => pad.l + ((t - from) / (to - from)) * iw;
  const y = (v: number) => pad.t + ih - (v / 10) * ih;
  const withData = days.filter((d) => d.n > 0);
  const mid = (d: DayStat) => d.day + DAY / 2;
  const line = withData.map((d, i) => `${i ? 'L' : 'M'}${x(mid(d)).toFixed(1)} ${y(d.mean).toFixed(1)}`).join(' ');
  const band = withData.length > 1
    ? withData.map((d, i) => `${i ? 'L' : 'M'}${x(mid(d)).toFixed(1)} ${y(d.max).toFixed(1)}`).join(' ') + ' ' +
      [...withData].reverse().map((d) => `L${x(mid(d)).toFixed(1)} ${y(d.min).toFixed(1)}`).join(' ') + ' Z'
    : '';
  const step = days.length > 45 ? 14 : days.length > 16 ? 7 : days.length > 8 ? 2 : 1;

  function onPoint(clientX: number) {
    const r = ref.current!.getBoundingClientRect();
    const t = from + ((clientX - r.left - pad.l) / iw) * (to - from);
    let best: DayStat | null = null;
    for (const d of withData) if (!best || Math.abs(mid(d) - t) < Math.abs(mid(best) - t)) best = d;
    if (best) setTip({ x: x(mid(best)), y: y(best.mean), d: best });
  }

  return (
    <div ref={ref} style={{ position: 'relative' }} onPointerDown={(e) => onPoint(e.clientX)} onPointerMove={(e) => e.buttons && onPoint(e.clientX)} onPointerLeave={() => setTip(null)}>
      <svg class="chart" width={W} height={height} role="img" aria-label="Pain over time: daily average with daily range">
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line class="grid" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} />
            <text x={pad.l - 6} y={y(v) + 4} text-anchor="end">{v}</text>
          </g>
        ))}
        {days.map((d, i) => i % step === 0 && (
          <text key={d.day} x={x(mid(d))} y={height - 6} text-anchor="middle">
            {days.length > 8 ? fmtDay(d.day, { day: 'numeric', month: 'short' }) : fmtDay(d.day, { weekday: 'short' })}
          </text>
        ))}
        {band && <path d={band} fill="var(--pain)" opacity="0.12" />}
        {rs.map((r) => (
          <circle key={r.t} cx={x(r.t)} cy={y(r.v)} r={3} fill="var(--pain)" opacity="0.35" />
        ))}
        {withData.length > 1 && <path d={line} fill="none" stroke="var(--pain)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />}
        {withData.map((d) => (
          <circle key={d.day} cx={x(mid(d))} cy={y(d.mean)} r={4} fill="var(--pain)" stroke="var(--surface)" stroke-width="2" />
        ))}
        {tip && <line x1={tip.x} x2={tip.x} y1={pad.t} y2={pad.t + ih} stroke="var(--ink-2)" stroke-width="1" opacity="0.4" />}
        {tip && <circle cx={tip.x} cy={tip.y} r={6} fill="var(--pain)" stroke="var(--surface)" stroke-width="2" />}
      </svg>
      {tip && (
        <div class="chart-tip" style={{ left: Math.min(Math.max(tip.x, 80), W - 80), top: tip.y }}>
          {fmtDay(tip.d.day)} · avg {fmt1(tip.d.mean)} · range {tip.d.min}–{tip.d.max} · {tip.d.n} reading{tip.d.n === 1 ? '' : 's'}
        </div>
      )}
      {withData.length === 0 && <div class="empty" style={{ position: 'absolute', inset: 0, justifyContent: 'center' }}>No pain readings in this period</div>}
    </div>
  );
}

export function TrendLegend() {
  return (
    <div class="legend">
      <span><i style={{ background: 'var(--pain)', height: 3, width: 14, borderRadius: 2 }} />Daily average</span>
      <span><i style={{ background: 'var(--pain)', opacity: 0.18 }} />Daily range</span>
      <span><i style={{ background: 'var(--pain)', opacity: 0.4, borderRadius: '50%', width: 7, height: 7 }} />Each reading</span>
    </div>
  );
}

/* ---------------- sparkline ---------------- */
export function Spark({ rs, from, to, height = 44 }: { rs: Reading[]; from: number; to: number; height?: number }) {
  const [ref, W] = useWidth<HTMLDivElement>(200);
  const x = (t: number) => 4 + ((t - from) / (to - from)) * (W - 8);
  const y = (v: number) => 4 + (height - 8) - (v / 10) * (height - 8);
  const d = rs.map((r, i) => `${i ? 'L' : 'M'}${x(r.t).toFixed(1)} ${y(r.v).toFixed(1)}`).join(' ');
  const last = rs[rs.length - 1];
  return (
    <div ref={ref}>
      <svg width={W} height={height} class="chart" aria-hidden="true">
        <line class="grid" x1={4} x2={W - 4} y1={y(0)} y2={y(0)} />
        {rs.length > 1 && <path d={d} fill="none" stroke="var(--pain)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />}
        {last && <circle cx={x(last.t)} cy={y(last.v)} r={4} fill="var(--pain)" stroke="var(--surface)" stroke-width="2" />}
      </svg>
    </div>
  );
}

/* ---------------- 24h day strip with lanes ---------------- */
export const LANES = [
  { id: 'pain', label: 'Pain', color: 'var(--pain)' },
  { id: 'posture', label: 'Posture', color: 'var(--posture)' },
  { id: 'activity', label: 'Activity', color: 'var(--activity)' },
  { id: 'meal', label: 'Food', color: 'var(--meal)' },
  { id: 'treatment', label: 'Treatment', color: 'var(--treatment)' },
] as const;

export function DayStrip({ day, list }: { day: number; list: Entry[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const labelW = 62;
  const painH = 56;
  const laneH = 20;
  const H = painH + laneH * 4 + 22;
  const iw = W - labelW - 8;
  const x = (t: number) => labelW + Math.max(0, Math.min(1, (t - day) / DAY)) * iw;
  const yP = (v: number) => 6 + (painH - 12) - (v / 10) * (painH - 12);
  const laneY = (i: number) => painH + (i - 1) * laneH + laneH / 2;
  const pains = list.filter((e) => e.type === 'pain' && e.intensity != null) as Extract<Entry, { type: 'pain' }>[];
  const painPath = pains.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(1)} ${yP(p.intensity!).toFixed(1)}`).join(' ');

  const show = (e: Entry, cx: number, cy: number, text: string) => (ev: Event) => {
    ev.stopPropagation();
    if (tip && tip.text === text) { editEntry(e); setTip(null); } else setTip({ x: cx, y: cy, text });
  };

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={() => setTip(null)}>
      <svg class="chart" width={W} height={H} role="img" aria-label={`Timeline for ${fmtDay(day)}`}>
        {LANES.map((l, i) => (
          <text key={l.id} x={0} y={i === 0 ? painH / 2 + 4 : laneY(i) + 4} style={{ fontWeight: 600, fill: 'var(--ink-2)' }}>{l.label}</text>
        ))}
        {[0, 6, 12, 18, 24].map((h) => (
          <g key={h}>
            <line class="grid" x1={x(day + h * HOUR)} x2={x(day + h * HOUR)} y1={2} y2={H - 18} />
            <text x={x(day + h * HOUR)} y={H - 4} text-anchor={h === 0 ? 'start' : h === 24 ? 'end' : 'middle'}>{h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}</text>
          </g>
        ))}
        <line class="grid" x1={labelW} x2={W - 8} y1={yP(5)} y2={yP(5)} stroke-dasharray="0" opacity="0.6" />
        {[1, 2, 3, 4].map((i) => <line key={i} class="grid" x1={labelW} x2={W - 8} y1={laneY(i)} y2={laneY(i)} opacity="0.5" />)}
        {pains.length > 1 && <path d={painPath} fill="none" stroke="var(--pain)" stroke-width="2" stroke-linejoin="round" />}
        {list.map((e) => {
          const cx = x(e.time);
          if (e.type === 'pain') {
            if (e.intensity == null) return <circle key={e.id} cx={cx} cy={yP(5)} r={5} fill="var(--surface)" stroke="var(--pain)" stroke-width="2" stroke-dasharray="2 2" onClick={show(e, cx, yP(5), `${fmtTime(e.time)} · pain: not sure`)} />;
            const cy = yP(e.intensity);
            return (
              <g key={e.id} onClick={show(e, cx, cy, `${fmtTime(e.time)} · pain ${e.intensity}/10${e.mode === 'change' ? (e.trend ? ` (${e.trend})` : ' (change)') : ''}`)}>
                <circle cx={cx} cy={cy} r={14} fill="transparent" />
                <circle cx={cx} cy={cy} r={e.mode === 'change' ? 5 : 4.5} fill={e.mode === 'change' ? 'var(--surface)' : 'var(--pain)'} stroke={e.mode === 'change' ? 'var(--pain)' : 'var(--surface)'} stroke-width="2" />
              </g>
            );
          }
          const laneIdx = LANES.findIndex((l) => l.id === e.type);
          if (laneIdx < 1) return null;
          const cy = laneY(laneIdx);
          const color = LANES[laneIdx].color;
          const mins = (e.type === 'posture' || e.type === 'activity') ? e.minutes : null;
          const label = e.type === 'posture' ? (POSTURES[e.posture]?.label ?? e.posture) : e.type === 'activity' ? e.activity : e.type === 'meal' ? (e.tags.join(', ') || 'Meal') : e.type === 'treatment' ? `${e.name}${e.dose ? ' ' + e.dose : ''}` : '';
          const text = `${fmtTime(e.time)} · ${label}${mins ? ` · ~${mins} min` : ''}`;
          if (mins) {
            const w = Math.max(6, x(e.time + mins * 60000) - cx);
            return (
              <g key={e.id} onClick={show(e, cx + w / 2, cy, text)}>
                <rect x={cx} y={cy - 12} width={Math.max(w, 24)} height={24} fill="transparent" />
                <rect x={cx} y={cy - 5} width={w} height={10} rx={4} fill={color} />
              </g>
            );
          }
          return (
            <g key={e.id} onClick={show(e, cx, cy, text)}>
              <circle cx={cx} cy={cy} r={12} fill="transparent" />
              {e.type === 'treatment'
                ? <rect x={cx - 6} y={cy - 4} width={12} height={8} rx={4} fill={color} stroke="var(--surface)" stroke-width="2" />
                : <circle cx={cx} cy={cy} r={5} fill={color} stroke="var(--surface)" stroke-width="2" />}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div class="chart-tip" style={{ left: Math.min(Math.max(tip.x, 90), W - 90), top: tip.y, pointerEvents: 'auto' }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
