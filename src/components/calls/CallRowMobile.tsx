import { PhoneOutgoing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CallChannelBadge } from './CallChannelBadge';
import { CallContactCell } from './CallContactCell';
import { CallDirectionCell } from './CallDirectionCell';
import { CallResultCell } from './CallResultCell';
import { toResult, type CallChannel } from '@/lib/calls/callStatus';
import { formatClock, talkSeconds } from '@/lib/calls/duration';
import { formatarDataHora } from '@/lib/calls/historyFormat';
import type { SearchMyCallsRow } from '@/hooks/calls/useMyCalls';

interface CallRowMobileProps {
  rows: SearchMyCallsRow[];
  selecionadaId: string | null;
  onSelecionar: (id: string) => void;
  onLigarDeVolta: (row: SearchMyCallsRow) => void;
  /** T68: Esc limpa a selecao sem listener global. */
  onLimparSelecao?: () => void;
}

/**
 * T77 — histórico da Telefonia em tela de celular (390): a tabela de 7 colunas não cabe
 * (estoura a largura da viewport), então cada ligação vira um cartão com o que a linha
 * mostrava — contato (avatar + nome), canal, direção, resultado, data/hora e duração — e
 * as MESMAS ações do desktop: selecionar e ligar de volta.
 *
 * As células (`CallContactCell`, `CallChannelBadge`, `CallDirectionCell`, `CallResultCell`)
 * são as da tabela, de propósito: mudar a apresentação não pode mudar o que a linha diz.
 * O teclado segue o da tabela (Enter seleciona, Esc limpa a seleção) para o agente não
 * perder os atalhos só porque a tela é estreita.
 */
export function CallRowMobile({
  rows,
  selecionadaId,
  onSelecionar,
  onLigarDeVolta,
  onLimparSelecao,
}: CallRowMobileProps) {
  return (
    <ul className="divide-y divide-border" data-testid="tel-list-mobile" role="listbox" aria-label="Histórico de ligações">
      {rows.map((row) => {
        const selecionada = row.id === selecionadaId;
        const result = toResult(row);
        const emAndamento = result === 'in_progress' || result === 'ringing';
        const duracao = talkSeconds(row);
        const nome = row.peer_name || row.contact_name || row.peer_number || 'este número';
        return (
          <li key={row.id}>
            <div
              data-testid="tel-row-mobile"
              role="option"
              aria-selected={selecionada}
              tabIndex={0}
              onClick={() => onSelecionar(row.id)}
              onKeyDown={(e) => {
                // Eventos dos botões da ação sobem até o cartão: Enter/Espaço precisam
                // manter a ativação nativa do botão (mesma regra da tabela).
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelecionar(row.id);
                } else if (e.key === 'Escape' && selecionada) {
                  e.preventDefault();
                  onLimparSelecao?.();
                }
              }}
              className={`cursor-pointer px-4 py-3 transition-colors hover:bg-muted/40 ${
                selecionada ? 'border-l-2 border-l-primary bg-primary/5' : 'border-l-2 border-l-transparent'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <CallContactCell row={row} />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                  <span className="text-xs text-muted-foreground">{formatarDataHora(row.started_at)}</span>
                  {/* sem atendimento não tem duração: traço, e não "00:00" */}
                  <span className="text-xs text-muted-foreground">{formatClock(duracao)}</span>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <CallChannelBadge channel={row.channel as CallChannel} />
                <CallDirectionCell direction={row.direction} />
                <CallResultCell result={result} emAndamento={emAndamento} />
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0"
                    aria-label={`Ligar de volta para ${nome}`}
                    data-testid="tel-row-mobile-callback"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLigarDeVolta(row);
                    }}
                  >
                    <PhoneOutgoing className="h-4 w-4" />
                  </Button>
                  {/* Sem handler real de reprodução no histórico: não renderiza botão morto. */}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
