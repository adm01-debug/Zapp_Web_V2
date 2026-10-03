import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CallHistoryCardProps {
  total: number;
  escopo: string;
  onEscopoChange: (valor: string) => void;
  /** Só admin e supervisor escolhem o escopo; agente comum vê apenas "Minhas ligações". */
  podeEscolherEscopo: boolean;
  children: ReactNode;
}

/**
 * Moldura do histórico (T43): título, contagem e escopo.
 *
 * O escopo é o mesmo parâmetro `scope` que já vive na URL (T36), então trocar
 * aqui refaz a consulta do servidor pelo caminho normal dos filtros.
 */
export function CallHistoryCard({ total, escopo, onEscopoChange, podeEscolherEscopo, children }: CallHistoryCardProps) {
  return (
    <Card data-testid="tel-history-card" className="w-full min-w-0">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Histórico de ligações</h2>
            {/* contagem do servidor (total_count da RPC), não a quantidade da página */}
            <Badge variant="secondary" data-testid="tel-history-total" className="text-3xs">
              {total}
            </Badge>
          </div>

          {podeEscolherEscopo ? (
            <Select value={escopo} onValueChange={onEscopoChange}>
              <SelectTrigger data-testid="tel-history-scope" className="h-10 w-[168px]" aria-label="Escopo das ligações">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">Minhas ligações</SelectItem>
                <SelectItem value="all">Todas as ligações</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs text-muted-foreground" data-testid="tel-history-scope-label">
              Minhas ligações
            </span>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
