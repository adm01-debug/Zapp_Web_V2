import { useContactCrm360 } from '@/hooks/crm/useContactCrm360';

interface CommercialSummaryStripProps {
  contactId: string;
}

function Tile({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-2.5">
      <p className="text-[15px] font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-2xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function CommercialSummaryStrip({ contactId }: CommercialSummaryStripProps) {
  const { data, isLoading } = useContactCrm360(contactId);
  const resumo = data?.resumo;
  const gridClass = 'grid-cols-2';

  if (isLoading) {
    return <div data-testid="commercial-summary-strip" className={`grid ${gridClass} gap-2 animate-pulse`}>{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/20" />)}</div>;
  }

  return (
    <div data-testid="commercial-summary-strip" className={`grid ${gridClass} gap-2`}>
      <Tile value={resumo?.propostas ?? '—'} label="Propostas" />
      <Tile value={resumo?.emAberto ?? '—'} label="Em aberto" />
    </div>
  );
}
