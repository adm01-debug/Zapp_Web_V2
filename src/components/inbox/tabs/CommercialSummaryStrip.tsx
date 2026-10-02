import { useContactCrm360 } from '@/hooks/crm/useContactCrm360';

interface CommercialSummaryStripProps {
  contactId: string;
}

const formatCurrency = (v: number) => v > 0 ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

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
  const ticketMedio = data?.ticketMedio;

  if (isLoading) {
    return <div data-testid="commercial-summary-strip" className="grid grid-cols-2 xl:grid-cols-4 gap-2 animate-pulse">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/20" />)}</div>;
  }

  return (
    <div data-testid="commercial-summary-strip" className="grid grid-cols-2 xl:grid-cols-4 gap-2">
      <Tile value={resumo ? formatCurrency(resumo.comprasTotal) : '—'} label={`Compras (${resumo?.comprasCount ?? 0})`} />
      <Tile value={ticketMedio ? formatCurrency(ticketMedio) : '—'} label="Ticket médio" />
      <Tile value={resumo?.propostas ?? '—'} label="Propostas" />
      <Tile value={resumo?.emAberto ?? '—'} label="Em aberto" />
    </div>
  );
}
