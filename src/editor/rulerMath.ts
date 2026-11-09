export type RulerTick = { mm: number; px: number; major: boolean };

export function mmToRulerPx(mm: number, translationPx: number, scale: number) {
  return translationPx + mm * scale;
}

export function rulerPxToMm(px: number, translationPx: number, scale: number) {
  if (!Number.isFinite(scale) || scale <= 0) return Number.NaN;
  return (px - translationPx) / scale;
}

/**
 * A 1/2/5 × 10^n step that keeps labels at least `minLabelPx` apart. Ruler
 * pixels are CSS pixels; document positions remain exact millimetres.
 */
export function niceRulerStep(scale: number, minLabelPx = 56) {
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(minLabelPx))
    return Number.NaN;
  const raw = minLabelPx / scale;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  const multiplier =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * power;
}

/**
 * Ticks only for the currently visible ruler span. Minor ticks are suppressed
 * when they would become denser than roughly 4 CSS pixels.
 */
export function rulerTicks(
  translationPx: number,
  scale: number,
  lengthPx: number,
  minLabelPx = 56,
): RulerTick[] {
  if (
    !Number.isFinite(translationPx) ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    !Number.isFinite(lengthPx) ||
    lengthPx <= 0
  )
    return [];
  const step = niceRulerStep(scale, minLabelPx);
  if (!Number.isFinite(step) || step <= 0) return [];
  const minorStep = step / 5;
  const showMinor = minorStep * scale >= 4;
  const interval = showMinor ? minorStep : step;
  const startMm = rulerPxToMm(0, translationPx, scale);
  const endMm = rulerPxToMm(lengthPx, translationPx, scale);
  const first = Math.ceil(startMm / interval - 1e-9);
  const last = Math.floor(endMm / interval + 1e-9);
  if (last < first || last - first > 500) return [];
  const ticks: RulerTick[] = [];
  for (let index = first; index <= last; index++) {
    const mm = index * interval;
    ticks.push({
      mm,
      px: mmToRulerPx(mm, translationPx, scale),
      // With minor ticks showing, every fifth tick carries a label.
      major: showMinor ? index % 5 === 0 : true,
    });
  }
  return ticks;
}
