import { PhoneOff, SearchX, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Carregando: 8 linhas de 57px, a mesma altura da linha real (T47), para a tabela nao pular. */
export function CallHistorySkeleton({ linhas = 8 }: { linhas?: number }) {
  return (
    <div data-testid="tel-history-loading" className="divide-y divide-border">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="flex h-[57px] items-center gap-3 px-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="ml-auto h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

interface VazioProps {
  /** true: o filtro nao achou nada. false: nao ha ligacao nenhuma ainda. */
  porFiltro: boolean;
  onLimparFiltros: () => void;
  onNovaLigacao: () => void;
}

export function CallHistoryEmpty({ porFiltro, onLimparFiltros, onNovaLigacao }: VazioProps) {
  const Icone = porFiltro ? SearchX : PhoneOff;
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center" data-testid="tel-history-empty">
      <Icone className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">
        {porFiltro ? 'Nenhuma ligação encontrada com esses filtros.' : 'Você ainda não fez nenhuma ligação.'}
      </p>
      {porFiltro ? (
        <Button variant="outline" size="sm" className="h-10" onClick={onLimparFiltros}>
          Limpar filtros
        </Button>
      ) : (
        <Button variant="outline" size="sm" className="h-10" onClick={onNovaLigacao}>
          Fazer uma ligação
        </Button>
      )}
    </div>
  );
}

export function CallHistoryError({ onTentarNovamente }: { onTentarNovamente: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center" data-testid="tel-history-error">
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Não foi possível carregar o histórico.</p>
      <Button variant="outline" size="sm" className="h-10" onClick={onTentarNovamente}>
        Tentar novamente
      </Button>
    </div>
  );
}
