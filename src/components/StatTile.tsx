import type { ReactNode } from 'react';

export interface StatTileProps {
  label: string;
  /** The figure itself, already formatted. */
  value: string;
  /** One short line of context, e.g. what the figure excludes. */
  detail?: ReactNode;
  /** Draws the eye to the one number that answers "how are we doing?". */
  hero?: boolean;
  /** Reserved status colour, for tiles that report a state rather than a total. */
  tone?: 'neutral' | 'good' | 'warning' | 'critical';
}

const TONE_INK: Record<string, string> = {
  neutral: 'var(--text-primary)',
  good: 'var(--status-good)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-critical)'
};

/**
 * A single figure.
 *
 * Deliberately not a chart: a count or a total has no shape to show, and the
 * fastest way to read one number is to read the number. The label sits above
 * the value so a column of tiles scans as a list of questions and answers.
 */
export function StatTile({
  label,
  value,
  detail,
  hero = false,
  tone = 'neutral'
}: StatTileProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className="rounded-xl border bg-[var(--surface-1)] px-4 py-3.5"
      style={{ borderColor: 'var(--hairline)' }}
    >
      <div
        className="text-[10.5px] font-semibold uppercase tracking-[0.07em]"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      <div
        className={`mt-1.5 font-extrabold leading-none ${hero ? 'text-[34px]' : 'text-[24px]'}`}
        style={{ color: TONE_INK[tone] }}
      >
        {value}
      </div>
      {detail && (
        <div
          className="mt-1.5 text-[11.5px] leading-snug"
          style={{ color: 'var(--text-secondary)' }}
        >
          {detail}
        </div>
      )}
    </div>
  );
}

export default StatTile;
