import { PhoneOutgoing, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CallChannelBadge } from './CallChannelBadge';
import { CallContactCell } from './CallContactCell';
import { CallDirectionCell } from './CallDirectionCell';
import { CallResultCell } from './CallResultCell';
import { toResult, type CallChannel } from '@/lib/calls/callStatus';
import { formatClock, talkSeconds } from '@/lib/calls/duration';
import { formatarDataHora } from '@/lib/calls/historyFormat';
import type { SearchMyCallsRow } from '@/hooks/calls/useMyCalls';

interface CallHistoryTableProps {
  rows: SearchMyCallsRow[];
  selecionadaId: string | null;
  onSelecionar: (id: string) => void;
  /** T68: Esc limpa a selecao sem listener global. */
  onLimparSelecao?: () => void;
  /** "Ligar de volta": mesma origem de discagem do click-to-call (evento `zapp:start-call`). */
  onLigarDeVolta: (row: SearchMyCallsRow) => void;
}

const COLUNAS = ['Contato', 'Canal', 'Direção', 'Resultado', 'Data e hora', 'Duração', 'Ações'];

export function CallHistoryTable({ rows, selecionadaId, onSelecionar, onLimparSelecao, onLigarDeVolta }: CallHistoryTableProps) {
  return (
    <table className="w-full table-fixed border-collapse" data-testid="tel-history-table">
      {/* T76: nome acessivel da tabela. O caption nao aparece na tela (sr-only) e
          nao duplica nenhuma coluna visivel — so leitor de tela le. */}
      <caption className="sr-only">Histórico de chamadas</caption>
      <thead>
        <tr className="border-b border-border text-left">
          {COLUNAS.map((c) => (
            <th key={c} scope="col" className="px-3 py-2 text-3xs font-medium uppercase tracking-wide text-muted-foreground">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const selecionada = row.id === selecionadaId;
          const result = toResult(row);
          const emAndamento = result === 'in_progress' || result === 'ringing';
          return (
            <tr
              key={row.id}
              data-testid="tel-row"
              aria-selected={selecionada}
              tabIndex={0}
              onClick={() => onSelecionar(row.id)}
              onKeyDown={(e) => {
                // Eventos dos botoes da celula de acoes sobem ate a linha. Nao os
                // cancele: Enter/Espaco precisam manter a ativacao nativa do botao.
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelecionar(row.id);
                } else if (e.key === 'Escape' && selecionada) {
                  // T68: Esc limpa a selecao. Fica no proprio item (e nao num listener
                  // global) para nao fechar o detalhe enquanto o agente digita a anotacao.
                  e.preventDefault();
                  onLimparSelecao?.();
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  // T76: as linhas sao focaveis (tabIndex=0); as setas andam entre elas
                  // sem sair da tabela. Na primeira/ultima linha o foco fica onde esta
                  // (sem wrap), mas a rolagem da pagina nao acontece: o default da seta
                  // e cancelado em qualquer linha.
                  e.preventDefault();
                  const linhas = Array.from(
                    e.currentTarget.parentElement?.querySelectorAll<HTMLTableRowElement>('tr[data-testid="tel-row"]') ?? [],
                  );
                  const destino = linhas[linhas.indexOf(e.currentTarget) + (e.key === 'ArrowDown' ? 1 : -1)];
                  destino?.focus();
                }
              }}
              className={`h-[57px] cursor-pointer border-b border-border transition-colors hover:bg-muted/40 ${
                selecionada ? 'border-l-2 border-l-primary bg-primary/5' : 'border-l-2 border-l-transparent'
              }`}
            >
              <td className="px-3">
                <CallContactCell row={row} />
              </td>
              <td className="px-3">
                <CallChannelBadge channel={row.channel as CallChannel} />
              </td>
              <td className="px-3">
                <CallDirectionCell direction={row.direction} />
              </td>
              <td className="px-3">
                <CallResultCell result={result} emAndamento={emAndamento} />
              </td>
              <td className="px-3 text-xs text-muted-foreground">{formatarDataHora(row.started_at)}</td>
              <td className="px-3 text-xs text-muted-foreground">
                {/* sem atendimento nao tem duracao: traco, e nao "00:00" que pareceria ligacao de zero segundo */}
                {talkSeconds(row) === null ? '—' : formatClock(talkSeconds(row))}
              </td>
              <td className="px-3">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0"
                    aria-label={`Ligar de volta para ${row.peer_name || row.contact_name || row.peer_number || 'este número'}`}
                    data-testid="tel-row-callback"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLigarDeVolta(row);
                    }}
                  >
                    <PhoneOutgoing className="h-4 w-4" />
                  </Button>
                  {/* Ouvir gravacao SO quando o arquivo existe de verdade (hoje nunca) */}
                  {row.recording_status === 'available' && (
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label="Ouvir gravação" data-testid="tel-row-play">
                      <Play className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
