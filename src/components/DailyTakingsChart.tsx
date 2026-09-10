import { useMemo, useState } from 'react';
import type { DailyPoint } from '../lib/api';
import { formatDayLabel, formatMoney, formatMoneyCompact } from '../lib/format';

export interface DailyTakingsChartProps {
  points: DailyPoint[];
  currency: string;
}

/**
 * Money taken per day.
 *
 * Bars rather than a line: the data is one value per calendar day, and a line
 * would draw slopes between days that mean nothing - a fundraiser's sales are
 * discrete events, not a continuous signal. One measure, so one hue and no
 * legend; the heading above says what is plotted.
 *
 * Built from HTML and CSS rather than SVG, and that is the second attempt. A
 * fluid SVG needs either `preserveAspectRatio="none"`, which stretches the
 * axis text into illegible smears, or a fixed viewBox that letterboxes on a
 * wide screen. Percentage-height divs are fluid by nature and their labels are
 * real text at the real font size, so neither problem exists.
 *
 * No charting library for eleven lines of geometry: a dependency here would be
 * a bigger supply-chain surface than the whole rest of this app.
 *
 * Accessibility: bars carry a hover tooltip, the highest day is labelled
 * directly so the peak reads without interaction, and the same figures sit in a
 * table below for anyone not reading the picture. A single series means nothing
 * here is conveyed by colour alone.
 */

const PLOT_HEIGHT = 176;
/** Keeps one or two days from becoming an absurd slab across the whole card. */
const MAX_BAR_WIDTH = 56;

export function DailyTakingsChart({ points, currency }: DailyTakingsChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const { max, ticks } = useMemo(() => {
    const highest = points.reduce(
      (running, point) => Math.max(running, point.grossCents),
      0
    );
    const step = niceStep(highest);
    const top = Math.max(step, Math.ceil(highest / step) * step);
    const lines: number[] = [];
    for (let value = top; value >= 0; value -= step) lines.push(value);
    return { max: top, ticks: lines };
  }, [points]);

  if (points.length === 0) {
    return (
      <p
        className="flex h-[200px] items-center justify-center text-[12.5px]"
        style={{ color: 'var(--text-muted)' }}
      >
        No payments yet. Days will appear here as they are paid.
      </p>
    );
  }

  const peakIndex = points.reduce(
    (best, point, index) =>
      point.grossCents > points[best].grossCents ? index : best,
    0
  );
  /** Only some x labels fit; aim for about six, always including the last day. */
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <figure className="m-0">
      <div
        role="img"
        aria-label={`Money taken per day, ${formatDayLabel(points[0].date)} to ${formatDayLabel(
          points[points.length - 1].date
        )}. Highest day ${formatDayLabel(points[peakIndex].date)} at ${formatMoney(
          points[peakIndex].grossCents,
          currency
        )}.`}
        className="relative flex"
        onMouseLeave={() => setHovered(null)}
      >
        {/* Value axis. Right-aligned so the digits line up with the gridlines. */}
        <div
          className="tabular relative w-[52px] shrink-0"
          style={{ height: PLOT_HEIGHT }}
          aria-hidden="true"
        >
          {ticks.map((value) => (
            <span
              key={value}
              className="absolute right-2 text-[10px] leading-none"
              style={{
                bottom: `${(value / max) * 100}%`,
                transform: 'translateY(50%)',
                color: 'var(--text-muted)'
              }}
            >
              {formatMoneyCompact(value, currency)}
            </span>
          ))}
        </div>

        <div className="relative flex-1" style={{ height: PLOT_HEIGHT }}>
          {/* Gridlines, recessive: the baseline reads, the rest recede. */}
          {ticks.map((value) => (
            <div
              key={value}
              aria-hidden="true"
              className="absolute inset-x-0"
              style={{
                bottom: `${(value / max) * 100}%`,
                borderTop: `1px solid ${
                  value === 0 ? 'var(--baseline)' : 'var(--gridline)'
                }`
              }}
            />
          ))}

          {/* One column per day. The column is the hit target, so a short bar
              is still easy to hover. */}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {points.map((point, index) => {
              const height =
                point.grossCents > 0
                  ? Math.max((point.grossCents / max) * 100, 1)
                  : 0;
              const isHovered = hovered === index;

              return (
                <div
                  key={point.date}
                  className="flex h-full flex-1 cursor-default flex-col justify-end"
                  onMouseEnter={() => setHovered(index)}
                >
                  {index === peakIndex && (
                    <div
                      className="tabular mb-1 text-center text-[10.5px] font-bold leading-none"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {formatMoney(point.grossCents, currency)}
                    </div>
                  )}
                  <div
                    className="mx-auto w-full rounded-t transition-opacity"
                    style={{
                      height: `${height}%`,
                      maxWidth: MAX_BAR_WIDTH,
                      backgroundColor: 'var(--series-1)',
                      opacity: hovered === null || isHovered ? 1 : 0.5
                    }}
                  />
                </div>
              );
            })}
          </div>

          {hovered !== null && (
            <div
              role="status"
              className="pointer-events-none absolute -top-1 z-10 whitespace-nowrap rounded-lg border bg-[var(--surface-1)] px-2.5 py-1.5 text-[11.5px] shadow-lg"
              style={{
                borderColor: 'var(--hairline)',
                left: `${((hovered + 0.5) / points.length) * 100}%`,
                transform: 'translateX(-50%)'
              }}
            >
              <div className="font-bold">
                {formatDayLabel(points[hovered].date)}
              </div>
              <div className="tabular" style={{ color: 'var(--text-secondary)' }}>
                {formatMoney(points[hovered].grossCents, currency)} ·{' '}
                {points[hovered].orders}{' '}
                {points[hovered].orders === 1 ? 'payment' : 'payments'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Day axis, aligned to the same columns as the bars above. */}
      <div className="mt-1.5 flex" aria-hidden="true">
        <div className="w-[52px] shrink-0" />
        <div className="flex flex-1 gap-[2px]">
          {points.map((point, index) => (
            <div
              key={point.date}
              className="flex-1 truncate text-center text-[10px]"
              style={{ color: 'var(--text-muted)' }}
            >
              {index % labelEvery === 0 || index === points.length - 1
                ? formatDayLabel(point.date)
                : ''}
            </div>
          ))}
        </div>
      </div>

      {/* The same figures, for anyone not reading the picture. */}
      <table className="sr-only">
        <caption>Money taken per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Payments</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{formatDayLabel(point.date)}</th>
              <td>{point.orders}</td>
              <td>{formatMoney(point.grossCents, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A round step - 1, 2 or 5 times a power of ten - giving 3-5 gridlines. */
function niceStep(maxCents: number): number {
  if (maxCents <= 0) return 10000;
  const rough = maxCents / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  for (const multiple of [1, 2, 5, 10]) {
    if (magnitude * multiple >= rough) return magnitude * multiple;
  }
  return magnitude * 10;
}

export default DailyTakingsChart;
