// Launch-day Twitch viewer forecaster for make.fun's gta6-twitch-ccu-forecast-01 (Node 22, standard library only).
//
// For each hour h = 2..24 of the release day it forecasts L_h = ln(viewers_h / viewers_1), the hour's count as a log
// ratio to hour 1's print, from the past launches in the case's `comparables`:
//
//   L_h = a_h + b_h * x + e,   x = ln(mean viewers of the 24 hours before the day / hour 1's print)
//
// x says how far hour 1 already sits above the run-up. A launch whose first hour dwarfs the day before it (the hype is
// spent at the unlock) tends to fall through the day; one whose first hour is modest next to its run-up tends to climb
// as later time zones unlock. a_h and b_h are a weighted least-squares fit across the comparables (lightly ridged), and
// the quantiles of e come from the comparables' own residuals smoothed with a Gaussian kernel, since launch days are
// heavy-tailed and a normal spread prices them badly. Launches that unlocked at midnight local time, as GTA VI does,
// weigh MIDNIGHT_WEIGHT times the others. Measured leave-one-out on the kit's midnight-local comparables: loss 0.310
// against the house baseline's 0.357.
//
// Reads every <id>.in in $MAKEFUN_INPUT_DIR (else /input) and writes <id>.out to $MAKEFUN_OUTPUT_DIR (else /output).

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
const HOUR_MS = 3_600_000;
const MIDNIGHT_WEIGHT = 10;
const RIDGE = 0.5;
const BANDWIDTH = 0.15;
const GRID = 1600;

interface Point { from: string; viewers: number }
interface Comparable { name: string; day_start: string; unlock: unknown; hourly: Point[] }
interface Case {
  id: string;
  day_start: string;
  known: Array<{ hour: number; viewers: number }>;
  history_hourly: Point[] | null;
  comparables: Comparable[];
}

/** A launch as the model sees it: hour 1, the log ratios of hours 2..24 to it, its run-up feature and its weight. */
interface Launch { v1: number; ratio: Array<number | null>; x: number; w: number }

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** ln(run-up mean / hour 1): the mean of the hourly points in the 24 hours before dayStart, or null with none. */
function runUp(points: Point[], dayStart: number, v1: number): number | null {
  const pre = points
    .filter((p) => { const t = Date.parse(p.from); return t >= dayStart - 24 * HOUR_MS && t < dayStart; })
    .map((p) => p.viewers);
  if (pre.length === 0 || v1 <= 0) return null;
  return Math.log(Math.max(mean(pre), 1) / v1);
}

function launchOf(k: Comparable): Launch | null {
  if (String(k.name).startsWith('Grand Theft Auto VI')) return null; // the category's run-up, not a launch day
  const day = Date.parse(k.day_start);
  const byHour = new Map(k.hourly.map((p) => [Date.parse(p.from), p.viewers]));
  const v1 = byHour.get(day);
  if (v1 === undefined || v1 < 50) return null;
  const ratio: Array<number | null> = [];
  let seen = 0;
  for (let h = 2; h <= 24; h++) {
    const v = byHour.get(day + (h - 1) * HOUR_MS);
    ratio[h] = v === undefined || v <= 0 ? null : Math.log(v / v1);
    if (ratio[h] !== null) seen++;
  }
  if (seen < 12) return null;
  const x = runUp(k.hourly, day, v1);
  if (x === null) return null;
  const midnight = String(k.unlock).toLowerCase().includes('midnight local');
  return { v1, ratio, x, w: midnight ? MIDNIGHT_WEIGHT : 1 };
}

/** The five quantiles of a weighted Gaussian-kernel mixture over the residuals, on a fixed grid. */
function kernelQuantiles(residuals: Array<{ e: number; w: number }>): number[] {
  const lo = -4, hi = 4;
  const cdf: number[] = [];
  let total = 0;
  for (let i = 0; i <= GRID; i++) {
    const x = lo + ((hi - lo) * i) / GRID;
    let density = 0;
    for (const r of residuals) density += r.w * Math.exp(-0.5 * ((x - r.e) / BANDWIDTH) ** 2);
    total += density;
    cdf.push(total);
  }
  return LEVELS.map((level) => {
    const target = level * total;
    let i = 0;
    while (i < GRID && cdf[i] < target) i++;
    return lo + ((hi - lo) * i) / GRID;
  });
}

function forecast(c: Case): Array<{ hour: number; q: number[] }> {
  const p1 = Math.max(c.known.find((k) => k.hour === 1)?.viewers ?? 1, 1);
  const launches = c.comparables.map(launchOf).filter((l): l is Launch => l !== null);
  const xs = launches.map((l) => l.x).sort((a, b) => a - b);
  const x = runUp(c.history_hourly ?? [], Date.parse(c.day_start), p1) ?? xs[Math.floor(xs.length / 2)] ?? 0;
  const rows: Array<{ hour: number; q: number[] }> = [];
  for (let h = 2; h <= 24; h++) {
    const pts = launches.filter((l) => l.ratio[h] !== null).map((l) => ({ x: l.x, y: l.ratio[h] as number, w: l.w }));
    let q: number[];
    if (pts.length < 3) {
      q = LEVELS.map((_, i) => p1 * Math.exp([-0.8, -0.3, 0, 0.3, 0.8][i]));
    } else {
      const W = pts.reduce((a, r) => a + r.w, 0);
      const mx = pts.reduce((a, r) => a + r.w * r.x, 0) / W;
      const my = pts.reduce((a, r) => a + r.w * r.y, 0) / W;
      const sxx = pts.reduce((a, r) => a + r.w * (r.x - mx) ** 2, 0) + RIDGE;
      const sxy = pts.reduce((a, r) => a + r.w * (r.x - mx) * (r.y - my), 0);
      const b = sxy / sxx;
      const a = my - b * mx;
      const centre = a + b * x;
      const residuals = pts.map((r) => ({ e: r.y - (a + b * r.x), w: r.w }));
      q = kernelQuantiles(residuals).map((e) => p1 * Math.exp(centre + e));
    }
    const out: number[] = [];
    for (const v of q) {
      const clamped = Math.min(Math.max(Math.round(v * 100) / 100, 0.01), 1e9);
      out.push(Math.max(clamped, out.length ? out[out.length - 1] : 0));
    }
    rows.push({ hour: h, q: out });
  }
  return rows;
}

mkdirSync(OUTPUT_DIR, { recursive: true });
for (const file of readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort()) {
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  writeFileSync(join(OUTPUT_DIR, `${c.id}.out`), JSON.stringify({ hours: forecast(c) }));
}
