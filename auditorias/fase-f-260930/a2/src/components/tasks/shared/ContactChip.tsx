interface Props {
  contactName: string;
  onClick?: () => void;
}

export function ContactChip({ contactName, onClick }: Props) {
  const initials = contactName.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-2xs font-medium text-primary hover:bg-primary/20 transition-colors max-w-[140px] truncate"
      title={`Abrir ${contactName}`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
        {initials}
      </span>
      <span className="truncate">{contactName}</span>
    </button>
  );
}
