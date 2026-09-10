import type { OrderStatus } from '../lib/api';

/**
 * The state of one order.
 *
 * Always a colour *and* a word. Two of the four status colours sit below 3:1
 * against this surface by design, and pending and refunded are close enough in
 * hue that colour alone would not separate them for a colourblind reader - so
 * the label is what carries the meaning and the dot only reinforces it.
 */
const STYLES: Record<
  OrderStatus,
  { label: string; ink: string; wash: string }
> = {
  paid: {
    label: 'Paid',
    ink: 'var(--status-good)',
    wash: 'rgba(12, 163, 12, 0.10)'
  },
  pending: {
    label: 'Pending',
    ink: '#8a6100',
    wash: 'rgba(250, 178, 25, 0.16)'
  },
  failed: {
    label: 'Failed',
    ink: 'var(--status-critical)',
    wash: 'rgba(208, 59, 59, 0.10)'
  },
  canceled: {
    label: 'Canceled',
    ink: 'var(--text-secondary)',
    wash: 'rgba(11, 11, 11, 0.06)'
  },
  refunded: {
    label: 'Refunded',
    ink: '#a2542c',
    wash: 'rgba(236, 131, 90, 0.16)'
  }
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const style = STYLES[status] ?? STYLES.pending;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ color: style.ink, backgroundColor: style.wash }}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: style.ink }}
      />
      {style.label}
    </span>
  );
}

export default StatusBadge;
