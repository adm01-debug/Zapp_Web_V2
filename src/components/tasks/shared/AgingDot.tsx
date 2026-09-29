interface Props { days: number; }

export function AgingDot({ days }: Props) {
  if (days < 3) return null;
  const color = days >= 7 ? 'bg-destructive' : 'bg-warning';
  const label = days + 'd';
  return (
    <span className={`inline-flex items-center gap-1 text-2xs font-medium ${days >= 7 ? 'text-destructive' : 'text-warning'}`}
          title={`${days} dias nesta coluna`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
