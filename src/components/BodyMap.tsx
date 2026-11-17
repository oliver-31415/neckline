import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { IconZoomIn, IconZoomOut } from './Icons';
import type { Incision, Sensation } from '../lib/types';
import { painBg } from './ui';

/*
 * Focused diagram in two panels: neck & upper back/chest, and the right arm with
 * individual fingers. Back view: the viewer's left is the person's LEFT. Front view:
 * the viewer's left is the person's RIGHT, so the right arm panel moves to the left.
 */

type View = 'back' | 'front';
interface Shape { id: string; d: string; mirror?: boolean }

const M = 'matrix(-1 0 0 1 200 0)'; // mirror across the midline (x = 100)
const MA = 'matrix(-1 0 0 1 120 0)'; // mirror the arm panel

export const SPINE = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const C_TOP = 74, C_STEP = 64 / 7, T_TOP = 138, T_STEP = 18;
function vertebra(i: number) {
  const cervical = i < 7;
  const top = cervical ? C_TOP + i * C_STEP : T_TOP + (i - 7) * T_STEP;
  const step = cervical ? C_STEP : T_STEP;
  const w = cervical ? 12 : 15;
  const h = step - (cervical ? 2.2 : 3);
  return { top, step, d: `M${100 - w / 2} ${top + 1} h${w} a3 3 0 0 1 3 3 v${h - 6} a3 3 0 0 1 -3 3 h${-w} a3 3 0 0 1 -3 -3 v${-(h - 6)} a3 3 0 0 1 3 -3 Z` };
}

const HEAD = 'M100 -28 A42 50 0 1 1 99.9 -28 Z';
const TRAP = 'M69 116 C50 130 24 139 9 144 C2 146 0 153 2 159 C4 164 8 166 14 165 C30 162 48 156 64 152 L66 138 C67 130 68 122 69 116 Z';

// Authored on the viewer's left and mirrored for the other side.
const BACK_SIDE: [string, string][] = [
  ['shoulder-top', TRAP],
  ['rhomboid', 'M91 140 L64 152 L54 160 C52 196 48 228 42 258 L91 266 Z'],
  ['scapula', 'M52 160 L15 169 C8 171 6 177 7 185 C10 204 18 224 28 240 C33 248 37 254 40 258 C46 226 50 194 52 160 Z'],
  ['neck-upper', 'M73 60 L92 60 L92 100 L71 100 C72 86 73 74 73 60 Z'],
  ['neck-lower', 'M71 100 L92 100 L92 138 L64 138 C68 126 70 114 71 100 Z'],
];
const FRONT_SIDE: [string, string][] = [
  ['chest', 'M66 141 L99 141 L99 290 L40 290 C26 250 12 200 8 172 C8 167 11 165 15 165 C32 162 50 156 64 152 Z'],
  ['shoulder-top', TRAP],
  ['neck-front', 'M73 60 L99 60 L99 140 L64 140 C68 128 71 110 72 90 C72.5 80 73 70 73 60 Z'],
];

const sides = (list: [string, string][], leftSide: 'L' | 'R'): Shape[] => {
  const other = leftSide === 'L' ? 'R' : 'L';
  return list.flatMap(([id, d]) => [{ id: `${id}-${leftSide}`, d }, { id: `${id}-${other}`, d, mirror: true }]);
};

export const BACK_SHAPES: Shape[] = [
  ...sides(BACK_SIDE, 'L'),
  { id: 'head-back', d: 'M65.2 50 A42 50 0 1 1 134.8 50 Z' },
  { id: 'skull-base-L', d: 'M65.2 50 L100 50 L100 72 A42 50 0 0 1 65.2 50 Z' },
  { id: 'skull-base-R', d: 'M100 50 L134.8 50 A42 50 0 0 1 100 72 Z' },
];
export const FRONT_SHAPES: Shape[] = sides(FRONT_SIDE, 'R');

const finger = (x: number, len: number, w = 11) => `M${x} 247 h${w} v${len - w / 2} a${w / 2} ${w / 2} 0 0 1 ${-w} 0 Z`;
// Back of the right arm; thumb on the outer (viewer's right) edge.
export const ARM_SHAPES: Shape[] = [
  { id: 'shoulder-R', d: 'M22 40 C24 22 40 10 60 10 C80 10 96 24 97 44 C97 52 97 60 96 66 L26 66 C24 58 22 49 22 40 Z' },
  { id: 'upper-arm-R', d: 'M26 70 L96 70 C94 98 90 122 86 138 L38 138 C34 118 30 94 26 70 Z' },
  { id: 'elbow-R', d: 'M38 142 L86 142 C85 149 84 155 83 160 L41 160 C40 155 39 149 38 142 Z' },
  { id: 'forearm-R', d: 'M41 164 L83 164 C80 186 76 206 73 218 L49 218 C46 206 43 186 41 164 Z' },
  { id: 'hand-R', d: 'M35 222 L85 222 C86 230 86 238 85 245 L35 245 C34 238 34 230 35 222 Z' },
  { id: 'finger-little-R', d: finger(35, 21) },
  { id: 'finger-ring-R', d: finger(48, 27) },
  { id: 'finger-middle-R', d: finger(61, 31) },
  { id: 'finger-index-R', d: finger(74, 27) },
  { id: 'finger-thumb-R', d: 'M88 224 C94 228 99 236 102 245 C104 251 99 255 95 251 C92 247 89 241 87 236 Z' },
];

/** Areas offered as chips under the diagram rather than drawn. */
export function extraAreas(incision: Incision | null) {
  return [...(incision ? [{ id: 'incision', label: 'Incision' }] : []), { id: 'arm-L', label: 'Left arm' }];
}

const SIDE = { L: 'Left', R: 'Right' } as const;
export const REGION_LABELS: Record<string, string> = (() => {
  const out: Record<string, string> = {
    head: 'Head', 'head-back': 'Back of head', 'neck-front': 'Front of neck', incision: 'Incision', 'arm-L': 'Left arm',
    'upper-back': 'Between shoulder blades',
  };
  const names: Record<string, string> = {
    'shoulder-top': 'top of shoulder', shoulder: 'shoulder', 'upper-arm': 'upper arm', elbow: 'elbow', forearm: 'forearm',
    hand: 'hand', 'finger-thumb': 'thumb', 'finger-index': 'index finger', 'finger-middle': 'middle finger',
    'finger-ring': 'ring finger', 'finger-little': 'little finger',
    'hand-thumb': 'hand – thumb side', 'hand-middle': 'hand – middle fingers', 'hand-little': 'hand – little-finger side',
    'neck-front': 'front of neck', chest: 'collarbone', 'neck-upper': 'upper neck', 'neck-lower': 'lower neck',
    scapula: 'shoulder blade', rhomboid: 'spine-to-blade', 'skull-base': 'base of skull',
  };
  for (const s of ['L', 'R'] as const) for (const [k, v] of Object.entries(names)) out[`${k}-${s}`] = `${SIDE[s]} ${v}`;
  for (const v of SPINE) out[`spine-${v}`] = `Spine ${v}`;
  return out;
})();

export function regionLabel(id: string) {
  return REGION_LABELS[id] ?? id;
}

const spineIndex = (id: string) => (id.startsWith('spine-') ? SPINE.indexOf(id.slice(6)) : -1);

/** "Spine C3–C6" for a run of vertebrae. */
export function spineRangeLabel(from: number, to: number) {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return a === b ? `Spine ${SPINE[a]}` : `Spine ${SPINE[a]}–${SPINE[b]}`;
}

/** Area names with neighbouring vertebrae collapsed into ranges. */
export function regionNames(ids: string[]) {
  const spine = ids.map(spineIndex).filter((i) => i >= 0).sort((a, b) => a - b);
  const runs: string[] = [];
  for (let k = 0; k < spine.length; k++) {
    let e = k;
    while (e + 1 < spine.length && spine[e + 1] === spine[e] + 1) e++;
    runs.push(spineRangeLabel(spine[k], spine[e]));
    k = e;
  }
  const spineAt = ids.findIndex((id) => spineIndex(id) >= 0);
  const out = ids.filter((id) => spineIndex(id) < 0).map(regionLabel);
  if (spineAt >= 0) out.splice(Math.min(spineAt, out.length), 0, ...runs);
  return out;
}

export const SENSATION_LABEL: Record<Sensation, string> = {
  ache: 'ache', nerve: 'sharp nerve pain', tingling: 'tingling', cramp: 'cramping', stiff: 'stiffness', pain: 'pain', numb: 'numbness',
};

interface Props {
  value?: Record<string, Sensation>;
  levels?: Record<string, number>; // 0-10 per area
  onTap?: (id: string) => void; // makes the map interactive
  onRange?: (ids: string[]) => void; // a drag along the spine
  heat?: Record<string, number>; // 0..1, read-only heat map
  incision?: Incision | null;
}

export function BodyMap({ value = {}, levels = {}, onTap, onRange, heat, incision = null }: Props) {
  const [view, setView] = useState<View>('back');
  const [flash, setFlash] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const neckSvg = useRef<SVGSVGElement>(null);
  const interactive = !!onTap;
  const front = view === 'front';

  function showFlash(text: string, ms = 1600) {
    setFlash(text);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(null), ms);
  }
  function tap(id: string) {
    showFlash(regionLabel(id) + (heat ? ` · ${Math.round((heat[id] ?? 0) * 100)}%` : ''));
    onTap?.(id);
    navigator.vibrate?.(8);
  }

  // A finger on the spine drags out a range instead of scrolling the page.
  useEffect(() => {
    const el = neckSvg.current;
    if (!el || !interactive) return;
    const stop = (e: TouchEvent) => { if (e.touches.length === 1 && (e.target as Element).closest?.('[data-v]')) e.preventDefault(); };
    el.addEventListener('touchstart', stop, { passive: false });
    return () => el.removeEventListener('touchstart', stop);
  }, [view, interactive]);

  /** Vertebra under a screen y position. */
  function vertAt(clientY: number) {
    const r = neckSvg.current!.getBoundingClientRect();
    const k = Math.min(r.width / 200, r.height / 280);
    const y = 4 + (clientY - r.top - (r.height - 280 * k) / 2) / k;
    let i = 0;
    for (let j = 0; j < SPINE.length; j++) if (y >= vertebra(j).top) i = j;
    return i;
  }

  function startDrag(e: PointerEvent, from: number) {
    if (!interactive || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const id = e.pointerId;
    let to = from;
    setDrag({ from, to });
    const done = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', done);
      window.removeEventListener('pointerdown', other, true);
      setDrag(null);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const t = vertAt(ev.clientY);
      if (t === to) return;
      to = t;
      setDrag({ from, to });
      showFlash(spineRangeLabel(from, to), 4000);
      navigator.vibrate?.(4);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      done();
      if (from === to) return tap(`spine-${SPINE[from]}`);
      const [a, b] = from < to ? [from, to] : [to, from];
      const ids = SPINE.slice(a, b + 1).map((v) => `spine-${v}`);
      showFlash(spineRangeLabel(a, b));
      if (onRange) onRange(ids);
      else ids.forEach((x) => onTap?.(x));
      navigator.vibrate?.(10);
    };
    // A second finger means a pinch: drop the drag.
    const other = (ev: PointerEvent) => { if (ev.pointerId !== id) done(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', done);
    window.addEventListener('pointerdown', other, true);
  }

  const style = (id: string) => {
    if (heat) {
      const v = heat[id] ?? 0;
      return v > 0 ? { fill: `color-mix(in srgb, var(--pain) ${Math.round(18 + v * 82)}%, var(--body-fill))` } : undefined;
    }
    if (value[id]) return { fill: levels[id] != null ? painBg(Math.max(1, levels[id])) : 'var(--pain)' };
    return undefined;
  };
  const a11y = (id: string) => ({
    role: interactive ? ('button' as const) : undefined,
    'aria-label': regionLabel(id),
    'aria-pressed': interactive ? !!value[id] : undefined,
    onClick: (e: Event) => { e.stopPropagation(); tap(id); },
  });
  const shape = (s: Shape) => (
    <path key={s.id} d={s.d} transform={s.mirror ? M : undefined} class="region" style={style(s.id)} {...a11y(s.id)} />
  );

  const neckPanel = (
    <figure>
      <svg class="bodymap-svg" viewBox="0 4 200 280" ref={neckSvg}>
        <Defs />
        <g mask="url(#fade-bottom)">
          {front ? (
            <>
              {FRONT_SHAPES.map(shape)}
              <path class="head" d={HEAD} />
            </>
          ) : (
            <>
              {BACK_SHAPES.map(shape)}
              {SPINE.map((v, i) => {
                const id = `spine-${v}`;
                const vt = vertebra(i);
                const inDrag = drag && i >= Math.min(drag.from, drag.to) && i <= Math.max(drag.from, drag.to);
                return (
                  <g
                    key={id} data-v={i} {...a11y(id)}
                    // Mouse and touch go through the drag handler; click only fires here from the keyboard.
                    onClick={(e) => { e.stopPropagation(); if (e.detail === 0) tap(id); }}
                    onPointerDown={(e) => startDrag(e as unknown as PointerEvent, i)}
                  >
                    <rect x="88" y={vt.top} width="24" height={vt.step} fill="transparent" />
                    <path d={vt.d} class={'vert' + (inDrag ? ' drag' : '')} style={style(id)} />
                  </g>
                );
              })}
            </>
          )}
        </g>
      </svg>
    </figure>
  );
  const armPanel = (
    <figure>
      <svg class="bodymap-svg" viewBox="0 4 120 280">
        <g transform={front ? MA : undefined}>{ARM_SHAPES.map(shape)}</g>
      </svg>
    </figure>
  );

  return (
    <div class="bodymap" style={{ position: 'relative' }}>
      <Zoomable key={view}>
        <div class={'bodymap-panels' + (front ? ' front' : '')}>
          {front ? <>{armPanel}{neckPanel}</> : <>{neckPanel}{armPanel}</>}
        </div>
      </Zoomable>
      {flash && <div class="map-flash" aria-live="polite">{flash}</div>}
      <div class="bodymap-foot">
        <div class="seg">
          <button class={!front ? 'on' : ''} onClick={() => setView('back')}>Back</button>
          <button class={front ? 'on' : ''} onClick={() => setView('front')}>Front</button>
        </div>
        {!heat && extraAreas(incision).map((x) => (
          <button key={x.id} class={'chip' + (value[x.id] ? ' on' : '')} aria-pressed={!!value[x.id]} onClick={() => interactive && tap(x.id)} disabled={!interactive}>{x.label}</button>
        ))}
      </div>
    </div>
  );
}

function Defs() {
  return (
    <defs>
      <linearGradient id="fade-grad" gradientUnits="userSpaceOnUse" x1="0" y1="246" x2="0" y2="286">
        <stop offset="0" stop-color="#fff" />
        <stop offset="1" stop-color="#000" />
      </linearGradient>
      <mask id="fade-bottom" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="300">
        <rect x="0" y="0" width="200" height="300" fill="url(#fade-grad)" />
      </mask>
    </defs>
  );
}

/** Self-contained SVG (literal colours) of the back and front views as a heat map, for the PDF. */
export function diagramSvg(heat: Record<string, number>) {
  const fill = (id: string, base = '#e3e3e8') => {
    const v = heat[id] ?? 0;
    if (v <= 0) return base;
    const a = 0.18 + v * 0.82;
    const mix = (c1: number, c2: number) => Math.round(c1 * a + c2 * (1 - a));
    return `rgb(${mix(229, 227)},${mix(98, 227)},${mix(59, 232)})`;
  };
  const p = (s: Shape) => `<path d="${s.d}" fill="${fill(s.id)}" stroke="#fff" stroke-width="2" stroke-linejoin="round"${s.mirror ? ` transform="${M}"` : ''}/>`;
  const text = (x: number, y: number, t: string) => `<text x="${x}" y="${y}" font-size="12" font-weight="600" fill="#6c6c70" text-anchor="middle" font-family="Helvetica, Arial">${t}</text>`;
  let back = BACK_SHAPES.map(p).join('');
  SPINE.forEach((v, i) => { back += `<path d="${vertebra(i).d}" fill="${fill(`spine-${v}`, '#c7c7cc')}"/>`; });
  const arm = ARM_SHAPES.map(p).join('');
  const frontNeck = FRONT_SHAPES.map(p).join('') + `<path d="${HEAD}" fill="#e3e3e8"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 4 680 300" width="1360" height="600">
<g>${back}</g><g transform="translate(212 0)">${arm}</g>${text(160, 298, 'Back')}
<g transform="translate(345 0)"><g transform="${MA}">${arm}</g></g><g transform="translate(478 0)">${frontNeck}</g>${text(520, 298, 'Front')}
</svg>`;
}

/*
 * Pinch to zoom and drag to pan, for the diagram only (the rest of the app doesn't zoom).
 * Taps still select areas while zoomed; a drag never does.
 */
interface Z { s: number; x: number; y: number }
const MAX_ZOOM = 5;

function Zoomable({ children }: { children: ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState<Z>({ s: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const zr = useRef(z);
  zr.current = z;

  const clamp = (v: Z): Z => {
    const el = box.current!;
    const W = el.clientWidth, H = el.clientHeight;
    const s = Math.min(MAX_ZOOM, Math.max(1, v.s));
    return { s, x: Math.min(0, Math.max(W - W * s, v.x)), y: Math.min(0, Math.max(H - H * s, v.y)) };
  };

  useEffect(() => {
    const el = box.current!;
    let start: (Z & { mx: number; my: number; d: number; n: number; moved: boolean }) | null = null;
    const at = (t: Touch) => { const r = el.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; };
    const onStart = (e: TouchEvent) => {
      setAnimate(false);
      const cur = zr.current;
      if (e.touches.length === 2) {
        const a = at(e.touches[0]), b = at(e.touches[1]);
        start = { ...cur, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1, n: 2, moved: true };
        e.preventDefault();
      } else if (e.touches.length === 1 && cur.s > 1 && !(e.target as Element).closest?.('[data-v]')) {
        const a = at(e.touches[0]);
        start = { ...cur, mx: a.x, my: a.y, d: 0, n: 1, moved: false };
      } else start = null;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      if (start.n === 2 && e.touches.length === 2) {
        const a = at(e.touches[0]), b = at(e.touches[1]);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const s = start.s * (Math.hypot(a.x - b.x, a.y - b.y) / start.d);
        const px = (start.mx - start.x) / start.s, py = (start.my - start.y) / start.s;
        setZ(clamp({ s, x: mx - px * s, y: my - py * s }));
        e.preventDefault();
      } else if (start.n === 1 && e.touches.length === 1) {
        const a = at(e.touches[0]);
        if (!start.moved && Math.hypot(a.x - start.mx, a.y - start.my) < 6) return;
        start.moved = true;
        setZ(clamp({ s: start.s, x: start.x + a.x - start.mx, y: start.y + a.y - start.my }));
        e.preventDefault();
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0 || (start?.n === 2 && e.touches.length < 2)) start = null;
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  function zoomBy(f: number) {
    const el = box.current!;
    const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
    const s = Math.min(MAX_ZOOM, Math.max(1, z.s * f));
    setAnimate(true);
    setZ(clamp({ s, x: cx - ((cx - z.x) / z.s) * s, y: cy - ((cy - z.y) / z.s) * s }));
  }

  const zoomed = z.s > 1.01;
  return (
    <div ref={box} class={'zoom-box' + (zoomed ? ' zoomed' : '')}>
      <div class={'zoom-inner' + (animate ? ' animate' : '')} style={{ transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})` }}>
        {children}
      </div>
      <div class="zoom-btns">
        <button class="zoom-btn" aria-label="Zoom in" disabled={z.s >= MAX_ZOOM} onClick={() => zoomBy(2)}><IconZoomIn /></button>
        {zoomed && <button class="zoom-btn" aria-label="Zoom out fully" onClick={() => { setAnimate(true); setZ({ s: 1, x: 0, y: 0 }); }}><IconZoomOut /></button>}
      </div>
    </div>
  );
}
