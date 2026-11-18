import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Entry, PainEntry, Settings } from '../lib/types';
import {
  buildFactors, compare, countBy, entryKindLabels, daily, dayEntries, fmt1, impactFrequency, inRange, mean, regionFrequency, summary, treatmentStats,
  VERDICT_LABEL, type WindowId,
} from '../lib/analysis';
import { DURATIONS, HELPED_LABELS, IMPACTS } from '../lib/catalog';
import { diagramSvg, regionLabel, SENSATION_LABEL } from '../components/BodyMap';
import { entrySummary } from '../components/EntryRow';
import { DAY, fmtDay, fmtTime, fromDayKey } from '../lib/time';
import { stamp, svgToPng } from './files';

export interface ReportOptions {
  from: number;
  to: number;
  includeLog: boolean;
  includeNotes: boolean;
  includeAssociations: boolean;
}

const INK: [number, number, number] = [27, 27, 26];
const INK2: [number, number, number] = [87, 85, 79];
const MUTED: [number, number, number] = [139, 136, 129];
const LINE: [number, number, number] = [225, 222, 215];
const PAIN: [number, number, number] = [229, 98, 59];
const PAIN_LIGHT: [number, number, number] = [249, 208, 192];
const ACCENT: [number, number, number] = [15, 124, 126];

export async function buildReport(all: Entry[], s: Settings, o: ReportOptions): Promise<File> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 16;
  const CW = W - 2 * M;
  let y = 18;

  const ensure = (h: number) => {
    if (y + h > 280) { doc.addPage(); y = 18; }
  };
  const h2 = (t: string, sub?: string) => {
    ensure(18);
    y += 4;
    doc.setFont('helvetica', 'bold').setFontSize(12.5).setTextColor(...INK).text(t, M, y);
    if (sub) doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...MUTED).text(sub, W - M, y, { align: 'right' });
    y += 2;
    doc.setDrawColor(...LINE).setLineWidth(0.3).line(M, y, W - M, y);
    y += 5;
  };
  const para = (t: string, size = 9.5, color = INK2) => {
    doc.setFont('helvetica', 'normal').setFontSize(size).setTextColor(...color);
    const lines = doc.splitTextToSize(t, CW);
    ensure(lines.length * size * 0.42 + 2);
    doc.text(lines, M, y);
    y += lines.length * size * 0.42 + 2;
  };
  const table = (head: string[] | null, body: (string | number)[][], widths?: number[]) => {
    autoTable(doc, {
      startY: y, head: head ? [head] : undefined, showHead: head ? 'everyPage' : 'never', body, margin: { left: M, right: M },
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
      headStyles: { fillColor: [244, 241, 236], textColor: INK2, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [252, 251, 249] },
      columnStyles: widths ? Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }])) : undefined,
      theme: 'grid',
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 6;
  };

  const sum = summary(all, o.from, o.to);
  const pains = inRange<PainEntry>(all, o.from, o.to).filter((e) => e.type === 'pain');
  const lastDay = o.to - 1;

  /* ---------- header ---------- */
  doc.setFillColor(...ACCENT).rect(0, 0, W, 4, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(19).setTextColor(...INK).text('Neck pain diary: summary', M, y + 2);
  y += 9;
  const meta = [
    s.name && `Name: ${s.name}`,
    `Period: ${fmtDay(o.from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmtDay(lastDay, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    s.surgeryDate && `Surgery: ${fmtDay(fromDayKey(s.surgeryDate), { day: 'numeric', month: 'short', year: 'numeric' })} (${Math.round((lastDay - fromDayKey(s.surgeryDate)) / (7 * DAY))} weeks before end of period)`,
    `Prepared: ${fmtDay(Date.now(), { day: 'numeric', month: 'short', year: 'numeric' })}`,
  ].filter(Boolean) as string[];
  doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...INK2);
  const metaLines = doc.splitTextToSize(meta.join('   ·   '), CW);
  doc.text(metaLines, M, y);
  y += metaLines.length * 4.2 + 1;
  para('Self-recorded by the patient using a personal diary app. Pain is rated 0–10 (0 = none, 10 = worst imaginable). Patterns below describe what occurred alongside pain in these entries. They do not show cause.', 8.5, MUTED);
  y += 2;

  /* ---------- at a glance ---------- */
  const tiles = [
    ['Average pain', isNaN(sum.mean) ? '–' : `${fmt1(sum.mean)} / 10`],
    ['Range', isNaN(sum.min) ? '–' : `${sum.min} – ${sum.max}`],
    ['Pain readings', `${sum.readings.length}${sum.notSure ? ` (+${sum.notSure} unsure)` : ''}`],
    ['Readings 7 or more', `${sum.severe}`],
    ['Days with entries', `${sum.daysLogged} of ${Math.round((o.to - o.from) / DAY)}`],
  ];
  const tw = (CW - 4 * 3) / 5;
  tiles.forEach(([label, value], i) => {
    const x = M + i * (tw + 3);
    doc.setFillColor(246, 244, 240).roundedRect(x, y, tw, 17, 2, 2, 'F');
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED).text(label, x + 3, y + 5.5);
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK).text(value, x + 3, y + 12.5);
  });
  y += 23;

  /* ---------- pain chart ---------- */
  const ds = daily(sum.readings, o.from, o.to);
  h2('Pain over time', 'dot = daily average, bar = daily lowest to highest');
  ensure(52);
  const ch = 42;
  const x0 = M + 8;
  const cw = CW - 8;
  const cx = (i: number) => x0 + ((i + 0.5) / ds.length) * cw;
  const cy = (v: number) => y + ch - (v / 10) * ch;
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUTED);
  for (const v of [0, 5, 10]) {
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(x0, cy(v), x0 + cw, cy(v));
    doc.text(String(v), x0 - 2, cy(v) + 1, { align: 'right' });
  }
  const bw = Math.max(0.8, Math.min(4, (cw / ds.length) * 0.45));
  ds.forEach((d, i) => {
    if (!d.n) return;
    doc.setFillColor(...PAIN_LIGHT).roundedRect(cx(i) - bw / 2, cy(d.max), bw, Math.max(0.6, cy(d.min) - cy(d.max)), Math.min(1, bw / 2), Math.min(1, bw / 2), 'F');
  });
  doc.setDrawColor(...PAIN).setLineWidth(0.6);
  let prev: [number, number] | null = null;
  ds.forEach((d, i) => {
    if (!d.n) { prev = null; return; }
    const p: [number, number] = [cx(i), cy(d.mean)];
    if (prev) doc.line(prev[0], prev[1], p[0], p[1]);
    prev = p;
  });
  ds.forEach((d, i) => d.n && doc.setFillColor(...PAIN).circle(cx(i), cy(d.mean), 0.9, 'F'));
  const step = ds.length > 45 ? 14 : ds.length > 16 ? 7 : ds.length > 8 ? 2 : 1;
  doc.setFontSize(6.8).setTextColor(...MUTED);
  ds.forEach((d, i) => i % step === 0 && doc.text(fmtDay(d.day, { day: 'numeric', month: 'short' }), cx(i), y + ch + 4, { align: 'center' }));
  y += ch + 9;
  const tod = sum.buckets.filter((b) => b.n).map((b) => `${b.label.toLowerCase()} ${fmt1(b.mean)} (${b.n})`).join(', ');
  if (tod) para(`Average by time of day (number of readings): ${tod}.`, 8.5);

  /* ---------- where ---------- */
  const regions = regionFrequency(pains);
  if (regions.total) {
    h2('Where symptoms were felt', `${regions.total} entries with a body map`);
    const heat = Object.fromEntries(regions.counts.map(([r, n]) => [r, n / regions.total]));
    const png = await svgToPng(diagramSvg(heat), 1360, 600);
    const ih = CW * (600 / 1360);
    ensure(ih + 4);
    if (png) { doc.addImage(png, 'PNG', M, y, CW, ih); y += ih + 4; }
    table(['Area', 'How often', 'Average level', 'Described as'], regions.counts.slice(0, 14).map(([r, n]) => {
      const lv = pains.flatMap((p) => (p.levels?.[r] != null ? [p.levels[r]] : []));
      return [
        regionLabel(r), `${Math.round((n / regions.total) * 100)}%`, lv.length ? fmt1(mean(lv)) : '–',
        Object.entries(regions.sensations[r] ?? {}).sort((a, b) => b[1] - a[1]).map(([k]) => SENSATION_LABEL[k as keyof typeof SENSATION_LABEL]).join(', '),
      ];
    }), [62, 24, 26, CW - 112]);
  }

  /* ---------- character ---------- */
  const n = pains.length || 1;
  const q = countBy(pains.map(entryKindLabels));
  const sy = countBy(pains.map((p) => p.symptoms));
  const du = countBy(pains.map((p) => (p.duration ? [p.duration] : [])));
  const im = impactFrequency(pains);
  if (q.length || sy.length || Object.keys(im).length) {
    h2('What it was like', `${pains.length} pain entries`);
    const rows: string[][] = [];
    if (q.length) rows.push(['Described as', q.slice(0, 8).map(([k, c]) => `${k.toLowerCase()} ${Math.round((c / n) * 100)}%`).join(', ')]);
    if (du.length) rows.push(['How long it lasted', du.sort((a, b) => DURATIONS.indexOf(a[0]) - DURATIONS.indexOf(b[0])).map(([k, c]) => `${k.toLowerCase()} (${c})`).join(', ')]);
    if (sy.length) rows.push(['Other symptoms', sy.slice(0, 10).map(([k, c]) => `${k.toLowerCase()} (${c})`).join(', ')]);
    for (const x of ['Headache', 'Migraine']) {
      const lv = pains.flatMap((p) => (p.symptomLevels?.[x] != null ? [p.symptomLevels[x]] : []));
      if (lv.length) rows.push([`${x} strength`, `average ${fmt1(mean(lv))}, highest ${Math.max(...lv)} (${lv.length} rated)`]);
    }
    for (const i of IMPACTS) {
      const x = im[i.id];
      if (x) rows.push([`Affected ${i.label.toLowerCase()}`, `some ${x.some}, a lot ${x.lot}, not at all ${x.answered - x.some - x.lot} (of ${x.answered} answers)`]);
    }
    table(null, rows, [44, CW - 44]);
  }

  /* ---------- treatments ---------- */
  const ts = treatmentStats(all, o.from, o.to);
  if (ts.length) {
    h2('Medication and treatments', 'pain change = before vs 0.5–4 h after, when both were logged');
    table(
      ['Treatment', 'Times', 'Dose(s)', 'Self-rated', 'Pain before -> after', 'Side effects'],
      ts.map((t) => [
        t.name, t.count, t.doses.join(', ') || '–',
        Object.entries(t.helped).map(([h, c]) => `${HELPED_LABELS[h].toLowerCase()} ${c}`).join(', ') || '–',
        t.pairs ? `${fmt1(t.before)} -> ${fmt1(t.after)} (n=${t.pairs})` : '–',
        t.sideEffects.map(([e, c]) => `${e.toLowerCase()} (${c})`).join(', ') || '–',
      ]),
      [32, 13, 24, 34, 31, CW - 134],
    );
  }

  /* ---------- associations ---------- */
  if (o.includeAssociations) {
    const fs = buildFactors(all, o.from, o.to).filter((f) => f.group !== 'Treatment');
    const rows: (string | number)[][] = [];
    for (const f of fs) {
      const win: WindowId = f.daily ? 'same' : '3h';
      const c = compare(f, sum.readings, win);
      if (c.verdict === 'insufficient') continue;
      rows.push([f.label, f.daily ? 'same day' : '0–3 h after', `${fmt1(c.meanE)} (n=${c.exposed.length})`, `${fmt1(c.meanO)} (n=${c.other.length})`, c.occurrences, VERDICT_LABEL[c.verdict]]);
    }
    if (rows.length) {
      h2('Things that occurred alongside pain', 'co-occurrence only, not cause');
      table(['Factor', 'Window', 'Avg pain near', 'Avg pain otherwise', 'Logged', 'Reading'], rows.slice(0, 12), [44, 24, 28, 30, 16, CW - 142]);
      para('“Possible association” needs at least 8 readings on each side, 4 or more occurrences, and an average difference of 0.75 points or more. Other things happening at the same time may explain any difference.', 7.8, MUTED);
    }
  }

  /* ---------- background ---------- */
  const de = dayEntries(all, o.from, o.to);
  if (de.length) {
    h2('Sleep and background', `${de.length} days recorded`);
    const sl = de.filter((d) => d.sleepHours != null).map((d) => d.sleepHours!);
    const bits = [
      sl.length ? `average sleep ${fmt1(mean(sl))} h (${sl.length} nights)` : '',
      `${de.filter((d) => d.sleepQuality === 'poor').length} nights rated poor`,
      `${de.filter((d) => (d.stress ?? 0) >= 7).length} high-stress days`,
      `${de.filter((d) => d.exertion).length} days with unusual exertion`,
    ].filter(Boolean);
    para(bits.join(' · ') + '.');
  }

  /* ---------- questions ---------- */
  const qs = s.questions.filter((x) => !x.done && x.text.trim());
  if (qs.length) {
    h2('Questions for this appointment');
    qs.forEach((x, i) => para(`${i + 1}.  ${x.text}`, 10, INK));
  }

  /* ---------- notes ---------- */
  if (o.includeNotes) {
    const notes = inRange(all, o.from, o.to).filter((e) => e.note?.trim()).sort((a, b) => b.time - a.time).slice(0, 20);
    if (notes.length) {
      h2('Notes', notes.length === 20 ? 'most recent 20' : undefined);
      table(['When', 'Entry', 'Note'], notes.map((e) => [`${fmtDay(e.time, { day: 'numeric', month: 'short' })} ${e.type === 'day' ? '' : fmtTime(e.time)}`, entrySummary(e).title, e.note!.trim()]), [28, 40, CW - 68]);
    }
  }

  /* ---------- log ---------- */
  if (o.includeLog) {
    const list = inRange(all, o.from, o.to).sort((a, b) => a.time - b.time);
    if (list.length) {
      doc.addPage();
      y = 18;
      h2('Entry log', `${list.length} entries`);
      table(['When', 'Pain', 'Entry', 'Details'], list.map((e) => {
        const sm = entrySummary(e);
        return [
          `${fmtDay(e.time, { day: 'numeric', month: 'short' })} ${e.type === 'day' ? '' : fmtTime(e.time)}`,
          e.type === 'pain' ? (e.intensity ?? '?') : '',
          sm.title, sm.detail,
        ];
      }), [26, 11, 40, CW - 77]);
    }
  }

  /* ---------- footer ---------- */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...MUTED);
    doc.text('Self-recorded pain diary (Neckline). Shows co-occurrence, not diagnosis or cause.', M, 290);
    doc.text(`Page ${i} of ${pages}`, W - M, 290, { align: 'right' });
  }

  return new File([doc.output('blob')], `neck-diary-summary-${stamp()}.pdf`, { type: 'application/pdf' });
}
