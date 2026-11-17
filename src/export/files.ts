import { ARM, BACK_HALF, FRONT_HALF, HEAD, UPPER_BACK, incisionPath, sideFor } from '../components/BodyMap';
import type { Incision } from '../lib/types';

/** Hand a file to the iOS share sheet (Save to Files, Mail, AirDrop…), or download it. */
export async function shareOrDownload(file: File) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* Self-contained SVG (literal colours) of both body views as a heat map, for the PDF. */
export function bodyMapSvg(heat: Record<string, number>, incision: Incision | null) {
  const fill = (id: string) => {
    const v = heat[id] ?? 0;
    if (v <= 0) return '#ebe6de';
    const a = 0.18 + v * 0.82;
    const mix = (c1: number, c2: number) => Math.round(c1 * a + c2 * (1 - a));
    return `rgb(${mix(229, 235)},${mix(98, 230)},${mix(59, 222)})`;
  };
  const view = (v: 'front' | 'back', dx: number) => {
    const a = sideFor(v, 'a');
    const b = sideFor(v, 'b');
    const half = v === 'front' ? FRONT_HALF : BACK_HALF;
    const p = (id: string, d: string, mirror = false, clip = '') =>
      `<path d="${d}" fill="${fill(id)}" stroke="#fff" stroke-width="2" stroke-linejoin="round"${mirror ? ' transform="matrix(-1 0 0 1 320 0)"' : ''}${clip ? ` clip-path="url(#${clip})"` : ''}/>`;
    let s = `<g transform="translate(${dx} 0)">`;
    s += `<ellipse cx="127" cy="56" rx="5" ry="10" fill="#ebe6de" opacity=".55"/><ellipse cx="193" cy="56" rx="5" ry="10" fill="#ebe6de" opacity=".55"/>`;
    for (const [id, , d] of ARM) s += p(`${id}-${a}`, d) + p(`${id}-${b}`, d, true);
    for (const [id, , d] of half) s += p(`${id}-${a}`, d) + p(`${id}-${b}`, d, true);
    if (v === 'back') {
      s += p('upper-back', UPPER_BACK);
      s += p('head-back', HEAD, false, 'crown') + p(`skull-base-${a}`, HEAD, false, 'base-a') + p(`skull-base-${b}`, HEAD, false, 'base-b');
      s += `<path d="M126 72 L194 72 M160 72 L160 96" stroke="#fff" stroke-width="2"/>`;
    } else s += p('head', HEAD);
    if (incision && incision.view === v) {
      const { x, y, orient } = incision;
      if (heat.incision) {
        const d = orient === 'h' ? `M${x - 17} ${y - 5} h34 a5 5 0 0 1 0 10 h-34 a5 5 0 0 1 0 -10 Z` : `M${x - 5} ${y - 17} a5 5 0 0 1 10 0 v34 a5 5 0 0 1 -10 0 Z`;
        s += p('incision', d);
      }
      s += `<path d="${incisionPath(incision)}" stroke="#6c6c70" stroke-width="1.8" stroke-linecap="round" fill="none" opacity=".7"/>`;
    }
    s += `<text x="22" y="140" font-size="14" font-weight="700" fill="#8b8881" text-anchor="middle" font-family="Helvetica, Arial">${a}</text>`;
    s += `<text x="298" y="140" font-size="14" font-weight="700" fill="#8b8881" text-anchor="middle" font-family="Helvetica, Arial">${b}</text>`;
    s += `<text x="160" y="436" font-size="15" font-weight="700" fill="#57554f" text-anchor="middle" font-family="Helvetica, Arial">${v === 'front' ? 'Front' : 'Back'}</text>`;
    return s + '</g>';
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 4 620 440" width="1240" height="880">
<defs><clipPath id="crown"><rect x="0" y="0" width="320" height="72"/></clipPath><clipPath id="base-a"><rect x="0" y="72" width="160" height="40"/></clipPath><clipPath id="base-b"><rect x="160" y="72" width="160" height="40"/></clipPath></defs>
${view('front', 0)}${view('back', 310)}</svg>`;
}

export async function svgToPng(svg: string, w = 1240, h = 880): Promise<string | null> {
  try {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}
