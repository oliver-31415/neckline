import { useRef, useState } from 'preact/hooks';
import type { Incision, Sensation } from '../lib/types';
import { painBg } from './ui';

/*
 * Focused diagram in two panels, both seen from behind:
 *   1. back of the head and neck down to the bottom of the shoulder blades, with the
 *      spine (C1–T7) as individually tappable vertebrae;
 *   2. the right arm, shoulder to fingertips (thumb on the outer edge).
 * Less common areas (front of neck, incision, head, left arm) are toggle chips underneath.
 * In this back view the viewer's left is the person's LEFT.
 */

interface Shape { id: string; d: string; mirror?: boolean }

const M = 'matrix(-1 0 0 1 200 0)'; // mirror across the spine (x = 100)

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

// Left-side shapes are authored once and mirrored for the right.
const BACK_SIDE: [string, string][] = [
  ['shoulder-top', 'M69 116 C50 130 24 139 9 144 C2 146 0 153 2 159 C4 164 8 166 14 165 C30 162 48 156 64 152 L66 138 C67 130 68 122 69 116 Z'],
  ['rhomboid', 'M91 140 L64 152 L54 160 C52 196 48 228 42 258 L91 266 Z'],
  ['scapula', 'M52 160 L15 169 C8 171 6 177 7 185 C10 204 18 224 28 240 C33 248 37 254 40 258 C46 226 50 194 52 160 Z'],
  ['neck-upper', 'M73 60 L92 60 L92 100 L71 100 C72 86 73 74 73 60 Z'],
  ['neck-lower', 'M71 100 L92 100 L92 138 L64 138 C68 126 70 114 71 100 Z'],
];
const HEAD_UP = 'M65.2 50 A42 50 0 1 1 134.8 50 Z';
const SKULL_L = 'M65.2 50 L100 50 L100 72 A42 50 0 0 1 65.2 50 Z';
const SKULL_R = 'M100 50 L134.8 50 A42 50 0 0 1 100 72 Z';

export const BACK_SHAPES: Shape[] = [
  ...BACK_SIDE.flatMap(([id, d]) => [{ id: `${id}-L`, d }, { id: `${id}-R`, d, mirror: true }]),
  { id: 'head-back', d: HEAD_UP },
  { id: 'skull-base-L', d: SKULL_L },
  { id: 'skull-base-R', d: SKULL_R },
];

export const ARM_SHAPES: Shape[] = [
  { id: 'shoulder-R', d: 'M22 40 C24 22 40 10 60 10 C80 10 96 24 97 44 C97 52 97 60 96 66 L26 66 C24 58 22 49 22 40 Z' },
  { id: 'upper-arm-R', d: 'M26 70 L96 70 C94 98 90 122 86 138 L38 138 C34 118 30 94 26 70 Z' },
  { id: 'elbow-R', d: 'M38 142 L86 142 C85 149 84 155 83 160 L41 160 C40 155 39 149 38 142 Z' },
  { id: 'forearm-R', d: 'M41 164 L83 164 C80 186 76 206 73 218 L49 218 C46 206 43 186 41 164 Z' },
  { id: 'hand-little-R', d: 'M47 222 L55 222 L55 264 Q55 269 51 269 Q47 269 47 264 Z' },
  { id: 'hand-middle-R', d: 'M56 222 L65 222 L65 274 Q65 279 60.5 279 Q56 279 56 274 Z' },
  { id: 'hand-thumb-R', d: 'M66 222 L73 222 C75 230 77 236 81 242 C85 248 85 254 81 255 C78 256 76 252 74 250 L74 268 Q74 273 70 273 Q66 273 66 268 Z' },
];

/** Areas offered as chips under the diagram rather than drawn. */
export function extraAreas(incision: Incision | null) {
  return [
    { id: 'neck-front', label: 'Front of neck' },
    ...(incision ? [{ id: 'incision', label: 'Incision' }] : []),
    { id: 'head', label: 'Head' },
    { id: 'arm-L', label: 'Left arm' },
  ];
}

const SIDE = { L: 'Left', R: 'Right' } as const;
export const REGION_LABELS: Record<string, string> = (() => {
  const out: Record<string, string> = {
    head: 'Head', 'head-back': 'Back of head', 'neck-front': 'Front of neck', incision: 'Incision area', 'arm-L': 'Left arm',
    'upper-back': 'Between shoulder blades', 'elbow-R': 'Right elbow', 'elbow-L': 'Left elbow',
  };
  const names: Record<string, string> = {
    'shoulder-top': 'top of shoulder', shoulder: 'shoulder', 'upper-arm': 'upper arm', forearm: 'forearm',
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

export const SENSATION_LABEL: Record<Sensation, string> = { pain: 'pain', tingling: 'tingling', numb: 'numbness' };

interface Props {
  value?: Record<string, Sensation>;
  levels?: Record<string, number>; // 0-10 per area, colours pain areas
  onTap?: (id: string) => void; // makes the map interactive
  heat?: Record<string, number>; // 0..1, read-only heat map
  incision?: Incision | null;
}

export function BodyMap({ value = {}, levels = {}, onTap, heat, incision = null }: Props) {
  const [flash, setFlash] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const interactive = !!onTap;

  function tap(id: string) {
    setFlash(id);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(null), 1600);
    onTap?.(id);
    navigator.vibrate?.(8);
  }

  const style = (id: string) => {
    if (heat) {
      const v = heat[id] ?? 0;
      return v > 0 ? { fill: `color-mix(in srgb, var(--pain) ${Math.round(18 + v * 82)}%, var(--body-fill))` } : undefined;
    }
    if (value[id] === 'pain' && levels[id] != null) return { fill: painBg(levels[id]) };
    return undefined;
  };
  const a11y = (id: string) => ({
    role: interactive ? ('button' as const) : undefined,
    'aria-label': regionLabel(id) + (value[id] ? `, ${SENSATION_LABEL[value[id]]}` : ''),
    'aria-pressed': interactive ? !!value[id] : undefined,
    onClick: (e: Event) => { e.stopPropagation(); tap(id); },
  });
  const shape = (s: Shape) => (
    <path key={s.id} d={s.d} transform={s.mirror ? M : undefined} class={'region' + (value[s.id] ? ' ' + value[s.id] : '')} style={style(s.id)} {...a11y(s.id)} />
  );

  return (
    <div class="bodymap">
      <div class="bodymap-panels">
        <figure>
          <svg class="bodymap-svg" viewBox="0 4 200 280">
            <Defs />
            <g mask="url(#fade-bottom)">
            {BACK_SHAPES.map(shape)}
            {SPINE.map((v, i) => {
              const id = `spine-${v}`;
              const vt = vertebra(i);
              return (
                <g key={id} {...a11y(id)}>
                  <rect x="88" y={vt.top} width="24" height={vt.step} fill="transparent" />
                  <path d={vt.d} class={'vert' + (value[id] ? ' ' + value[id] : '')} style={style(id)} />
                </g>
              );
            })}
            </g>
          </svg>
          <figcaption>Neck &amp; upper back</figcaption>
        </figure>
        <figure>
          <svg class="bodymap-svg" viewBox="0 4 120 280">
            {ARM_SHAPES.map(shape)}
          </svg>
          <figcaption>Right arm</figcaption>
        </figure>
        {flash && <div class="map-flash" aria-live="polite">{regionLabel(flash)}{heat ? ` · ${Math.round((heat[flash] ?? 0) * 100)}%` : ''}</div>}
      </div>
      {!heat && (
        <div class="chips small-chips">
          {extraAreas(incision).map((x) => (
            <button key={x.id} class={'chip' + (value[x.id] ? ' on' : '')} aria-pressed={!!value[x.id]} onClick={() => interactive && tap(x.id)} disabled={!interactive}>{x.label}</button>
          ))}
        </div>
      )}
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
      <pattern id="pat-tingling" width="7" height="7" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="var(--tingling)" />
        <circle cx="3.5" cy="3.5" r="1.3" fill="#fff" opacity="0.75" />
      </pattern>
      <pattern id="pat-numb" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="7" height="7" fill="var(--numb)" />
        <rect width="2" height="7" fill="#fff" opacity="0.45" />
      </pattern>
    </defs>
  );
}

/** Self-contained SVG (literal colours) of both panels as a heat map, for the PDF. */
export function diagramSvg(heat: Record<string, number>) {
  const fill = (id: string, base = '#e3e3e8') => {
    const v = heat[id] ?? 0;
    if (v <= 0) return base;
    const a = 0.18 + v * 0.82;
    const mix = (c1: number, c2: number) => Math.round(c1 * a + c2 * (1 - a));
    return `rgb(${mix(229, 227)},${mix(98, 227)},${mix(59, 232)})`;
  };
  const p = (s: Shape) => `<path d="${s.d}" fill="${fill(s.id)}" stroke="#fff" stroke-width="2" stroke-linejoin="round"${s.mirror ? ` transform="${M}"` : ''}/>`;
  const text = (x: number, y: number, t: string) => `<text x="${x}" y="${y}" font-size="11" font-weight="600" fill="#6c6c70" text-anchor="middle" font-family="Helvetica, Arial">${t}</text>`;
  let back = BACK_SHAPES.map(p).join('');
  SPINE.forEach((v, i) => { back += `<path d="${vertebra(i).d}" fill="${fill(`spine-${v}`, '#c7c7cc')}"/>`; });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 4 340 300" width="1020" height="900">
<g>${back}${text(100, 298, 'Neck &amp; upper back (from behind)')}</g>
<g transform="translate(215 0)">${ARM_SHAPES.map(p).join('')}${text(60, 298, 'Right arm')}</g></svg>`;
}
