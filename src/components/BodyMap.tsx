import { useRef, useState } from 'preact/hooks';
import type { Incision, Sensation } from '../lib/types';
import { painBg } from './ui';

/*
 * Stylised upper body, front and back. Geometry is authored for the viewer's left
 * half and mirrored. In the front view the viewer's left is the person's RIGHT;
 * in the back view it's their LEFT. Hand zones keep the thumb on the outside in
 * both views (palms forward), so a hand region means the same thing either way.
 */

type View = 'front' | 'back';
type Side = 'L' | 'R';

const SIDE_NAME: Record<Side, string> = { L: 'Left', R: 'Right' };

// [id-prefix, label, path] for the viewer-left half
export const ARM: [string, string, string][] = [
  ['shoulder-top', 'top of shoulder', 'M134 128 C120 136 104 140 92 146 L96 160 C110 156 124 152 138 150 Z'],
  ['shoulder', 'shoulder', 'M92 146 C80 149 72 160 71 178 L99 180 C99 170 98 164 96 160 Z'],
  ['upper-arm', 'upper arm', 'M71 182 L99 183 C97 210 92 236 88 262 L60 262 C62 236 66 208 71 182 Z'],
  ['forearm', 'forearm', 'M60 266 L88 266 C84 292 80 318 77 340 L55 340 C55 316 57 292 60 266 Z'],
  ['hand-thumb', 'hand – thumb & index side', 'M56 344 L62 344 L62 410 Q62 415 58 415 Q54 415 54 410 L54 392 C52 394 48 396 45 394 C42 392 43 388 45 384 C48 376 50 368 51 360 C52 352 54 347 56 344 Z'],
  ['hand-middle', 'hand – middle finger', 'M62 344 L71 344 L71 420 Q71 425 66.5 425 Q62 425 62 420 Z'],
  ['hand-little', 'hand – ring & little finger side', 'M71 344 L77 344 C80 352 81 364 80 378 L80 410 Q80 415 75.5 415 Q71 415 71 410 Z'],
];

export const FRONT_HALF: [string, string, string][] = [
  ['neck-front', 'front of neck', 'M137 86 C139 106 137 126 132 140 L160 140 L160 86 Z'],
  ['chest', 'collarbone & upper chest', 'M96 160 L136 150 L133 140 L160 140 L160 212 L104 212 C102 198 100 188 99 181 Z'],
];

export const BACK_HALF: [string, string, string][] = [
  ['neck-upper', 'upper back of neck', 'M137 86 C138.5 98 138.3 106 137.6 113 L160 113 L160 86 Z'],
  ['neck-lower', 'lower back of neck', 'M137.6 113 C137 123 135 132 132 140 L160 140 L160 113 Z'],
  ['scapula', 'shoulder blade', 'M96 160 L136 150 L133 140 L142 140 L142 236 L108 236 C105 214 101 196 99 181 Z'],
];

export const HEAD = 'M160 14 C181 14 193 32 193 54 C193 78 179 94 160 94 C141 94 127 78 127 54 C127 32 139 14 160 14 Z';
export const UPPER_BACK = 'M144 140 L176 140 L176 236 L144 236 Z';

export function sideFor(view: View, half: 'a' | 'b'): Side {
  // half 'a' = viewer-left
  if (view === 'front') return half === 'a' ? 'R' : 'L';
  return half === 'a' ? 'L' : 'R';
}

export const REGION_LABELS: Record<string, string> = (() => {
  const out: Record<string, string> = {
    head: 'Head / forehead',
    'head-back': 'Back of head',
    'upper-back': 'Between shoulder blades',
    incision: 'Incision area',
  };
  for (const s of ['L', 'R'] as Side[]) {
    for (const [id, label] of [...ARM, ...FRONT_HALF, ...BACK_HALF]) out[`${id}-${s}`] = `${SIDE_NAME[s]} ${label}`;
    out[`skull-base-${s}`] = `${SIDE_NAME[s]} base of skull`;
  }
  return out;
})();

export function regionLabel(id: string) {
  return REGION_LABELS[id] ?? id;
}

export const SENSATION_LABEL:Record<Sensation, string> = { pain: 'pain', tingling: 'tingling', numb: 'numbness' };

interface Props {
  value?: Record<string, Sensation>;
  levels?: Record<string, number>; // 0-10 per area, colours pain areas
  onTap?: (id: string) => void; // makes the map interactive
  heat?: Record<string, number>; // 0..1, read-only heat map
  incision?: Incision | null;
  onPlaceIncision?: (p: { view: View; x: number; y: number }) => void;
  maxWidth?: number;
  initialView?: View;
}

export function BodyMap({ value = {}, levels = {}, onTap, heat, incision, onPlaceIncision, maxWidth = 260, initialView = 'front' }: Props) {
  const [view, setView] = useState<View>(incision?.view ?? initialView);
  const [flash, setFlash] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const interactive = !!onTap;

  const timer = useRef<number | undefined>(undefined);
  function tap(id: string) {
    setFlash(id);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(null), 1800);
    onTap?.(id);
  }

  function svgTap(e: MouseEvent) {
    if (!onPlaceIncision || !svgRef.current) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svgRef.current.getScreenCTM()!.inverse());
    onPlaceIncision({ view, x: Math.round(p.x), y: Math.round(p.y) });
  }

  const cls = (id: string) => {
    const s = value[id];
    return 'region' + (s ? ' ' + s : '');
  };
  const style = (id: string) => {
    if (heat) {
      const v = heat[id] ?? 0;
      return v > 0 ? { fill: `color-mix(in srgb, var(--pain) ${Math.round(18 + v * 82)}%, var(--body-fill))` } : undefined;
    }
    if (value[id] === 'pain' && levels[id] != null) return { fill: painBg(levels[id]) };
    return undefined;
  };
  const region = (id: string, d: string, transform?: string) => (
    <path
      key={id + view}
      d={d}
      transform={transform}
      class={cls(id)}
      style={style(id)}
      role={interactive ? 'button' : undefined}
      aria-label={regionLabel(id) + (value[id] ? `, ${SENSATION_LABEL[value[id]]}` : '')}
      aria-pressed={interactive ? !!value[id] : undefined}
      onClick={(e) => { if (onPlaceIncision) return; e.stopPropagation(); tap(id); }}
    />
  );

  const MIRROR = 'matrix(-1 0 0 1 320 0)';
  const half = view === 'front' ? FRONT_HALF : BACK_HALF;
  const a = sideFor(view, 'a');
  const b = sideFor(view, 'b');
  const inc = incision && incision.view === view ? incision : null;

  return (
    <div class="bodymap">
      <div class="seg" role="tablist" aria-label="Body view" style={{ alignSelf: 'center', width: 200 }}>
        <button class={view === 'front' ? 'on' : ''} onClick={() => setView('front')}>Front</button>
        <button class={view === 'back' ? 'on' : ''} onClick={() => setView('back')}>Back</button>
      </div>

      <div style={{ position: 'relative' }}>
        <svg ref={svgRef} class="bodymap-svg" viewBox="10 4 300 424" style={{ maxWidth }} onClick={svgTap as any}>
          <defs>
            <pattern id="pat-tingling" width="7" height="7" patternUnits="userSpaceOnUse">
              <rect width="7" height="7" fill="var(--tingling)" />
              <circle cx="3.5" cy="3.5" r="1.3" fill="#fff" opacity="0.75" />
            </pattern>
            <pattern id="pat-numb" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="7" height="7" fill="var(--numb)" />
              <rect width="2" height="7" fill="#fff" opacity="0.45" />
            </pattern>
            <linearGradient id="torso-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="var(--body-fill)" stop-opacity="1" />
              <stop offset="1" stop-color="var(--body-fill)" stop-opacity="0" />
            </linearGradient>
            <clipPath id="clip-crown"><rect x="0" y="0" width="320" height="72" /></clipPath>
            <clipPath id="clip-base-a"><rect x="0" y="72" width="160" height="40" /></clipPath>
            <clipPath id="clip-base-b"><rect x="160" y="72" width="160" height="40" /></clipPath>
          </defs>

          {/* torso fade below the selectable areas */}
          <path class="deco" style={{ fill: 'url(#torso-fade)', opacity: 0.9 }} d={view === 'front' ? 'M104 214 L216 214 C214 250 213 280 212 300 L108 300 C107 280 106 250 104 214 Z' : 'M108 238 L212 238 C211 262 211 284 210 300 L110 300 C109 284 109 262 108 238 Z'} />

          {/* ears */}
          <ellipse class="deco" cx="127" cy="56" rx="5" ry="10" />
          <ellipse class="deco" cx="193" cy="56" rx="5" ry="10" />

          {/* arms and shoulders: both halves */}
          {ARM.map(([id, , d]) => region(`${id}-${a}`, d))}
          {ARM.map(([id, , d]) => region(`${id}-${b}`, d, MIRROR))}
          {half.map(([id, , d]) => region(`${id}-${a}`, d))}
          {half.map(([id, , d]) => region(`${id}-${b}`, d, MIRROR))}
          {view === 'back' && region('upper-back', UPPER_BACK)}

          {/* head */}
          {view === 'front' ? (
            region('head', HEAD)
          ) : (
            <>
              <g clip-path="url(#clip-crown)">{region('head-back', HEAD)}</g>
              <g clip-path="url(#clip-base-a)">{region(`skull-base-${a}`, HEAD)}</g>
              <g clip-path="url(#clip-base-b)">{region(`skull-base-${b}`, HEAD)}</g>
              <path d="M126 72 L194 72 M160 72 L160 96" stroke="var(--body-stroke)" stroke-width="2" style={{ pointerEvents: 'none' }} />
            </>
          )}
          {view === 'front' && (
            <g style={{ pointerEvents: 'none' }} opacity="0.35" stroke="var(--ink-2)" stroke-width="1.6" fill="none" stroke-linecap="round">
              <path d="M147 50 q4 -3 8 0 M165 50 q4 -3 8 0 M153 74 q7 4 14 0" />
            </g>
          )}

          {/* incision site */}
          {inc && (
            <>
              {region('incision', inc.orient === 'h'
                ? `M${inc.x - 17} ${inc.y - 5} h34 a5 5 0 0 1 0 10 h-34 a5 5 0 0 1 0 -10 Z`
                : `M${inc.x - 5} ${inc.y - 17} a5 5 0 0 1 10 0 v34 a5 5 0 0 1 -10 0 Z`)}
              <path class="incision" d={inc.orient === 'h' ? `M${inc.x - 13} ${inc.y} h26` : `M${inc.x} ${inc.y - 13} v26`} />
            </>
          )}

          <text class="side-label" x="22" y="140" text-anchor="middle">{a}</text>
          <text class="side-label" x="298" y="140" text-anchor="middle">{b}</text>
        </svg>
        {flash && (
          <div class="map-flash" aria-live="polite">
            {regionLabel(flash)}
            {heat ? ` · ${Math.round((heat[flash] ?? 0) * 100)}% of the time` : ''}
          </div>
        )}
      </div>

    </div>
  );
}
