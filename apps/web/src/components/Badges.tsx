import type { Priority, Status } from '@qalynks/shared';

export function PriorityBadge({ value }: { value: Priority }) {
  return <span className={`badge priority-${value.toLowerCase()}`}>{value}</span>;
}

export function StatusBadge({ value }: { value: Status }) {
  return (
    <span className={`badge status-${value.toLowerCase()}`}>
      <span className="dot" aria-hidden="true" />
      {value}
    </span>
  );
}
