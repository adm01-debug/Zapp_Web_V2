/**
 * X150 — tabela ÚNICA de destinatários do Talk X (telas 11 e 12).
 *
 * Antes desta etapa cada tela desenhava a própria lista do MESMO destinatário:
 *  - tela 11 (`TalkXCampaignRunning` › Destinatários): tabela com colunas fixas
 *    (Contato/Telefone/Status/Enviada em/Entregue em) e um mapa de estado LOCAL
 *    (`STATUS_LABEL`/`STATUS_TONE`), sem busca, filtro nem paginação;
 *  - tela 12 (`TalkXLiveMonitor` › Destinatários): lista de cartões, com outro
 *    mapa de estado (o do kit), sem telefone, sem busca e sem contagem.
 * O mesmo destinatário aparecia com rótulos diferentes nas duas telas
 * ("Enviado" x "Enviada", "Pendente" x "Na fila").
 *
 * Esta tabela resolve os pontos do título num componente só:
 *  - COLUNAS configuráveis por tela (`columns`, com `RECIPIENT_COLUMNS_LIVE` e
 *    `RECIPIENT_COLUMNS_DELIVERIES`);
 *  - ESTADOS por um mapa único (`RECIPIENT_STATUS` do kit) e derivados da linha:
 *    "Respondida" (replied_at), "Lida" (read_at) e "Sem telefone" (linha que não
 *    pode ser enviada);
 *  - BUSCA por nome/apelido/telefone/empresa com espera de 300 ms;
 *  - FILTRO por estado (na tela, porque a leitura paginada por cursor que levaria
 *    a busca ao banco é a etapa X144 — hook `useTalkXRecipientsPage`, em
 *    `src/hooks/**`, fora desta área);
 *  - PAGINAÇÃO por página (padrão) ou "Carregar mais" (`pagination='more'`), com
 *    contagem total;
 *  - HORÁRIO sempre em HH:mm (lido de lido/entregue/enviado/atualizado), como o
 *    plano pede "HH:mm para todos os estados".
 *
 * Componente APRESENTACIONAL: recebe as linhas já lidas pela tela (a leitura roda
 * na consulta de cada tela; nenhum acesso a dados aqui).
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, Eye, MessageSquare, RefreshCw, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InitialsAvatar } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { RECIPIENT_STATUS } from '../kit/constants';
import { fmtInt, fmtTime } from '../kit/format';
import { StatusPill } from '../kit/primitives';
import { RowActionsMenu, TalkXPagination } from '../kit/table';
import { TalkXEmptyState, TalkXQueryBoundary, TalkXSkeletonRows } from '../kit/states';
import { talkXMessageSnapshotDisplay } from '../talkxMessageSnapshot';

/** Espera da busca antes de filtrar (o plano X150 pede 300 ms). */
const DEBOUNCE_MS = 300;
/** Teto da leitura atual das telas (`limit(200)`); a tela usa para avisar do corte. */
export const RECIPIENTS_READ_LIMIT = 200;

export interface TalkXRecipientContact {
  name?: string | null;
  nickname?: string | null;
  phone?: string | null;
  company?: string | null;
  avatar_url?: string | null;
  lead_origin?: string | null;
}

export interface TalkXRecipientRow {
  id?: string | null;
  status: string;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  replied_at?: string | null;
  updated_at?: string | null;
  personalized_message?: string | null;
  error_message?: string | null;
  /** Nome do segmento do público — vem da leitura paginada (X144); hoje fica "—". */
  segment_name?: string | null;
  contacts?: TalkXRecipientContact | null;
}

/**
 * Estado EXIBIDO da linha. Lido/respondido são timestamps, não valores de
 * `status` no banco — o CHECK de `talkx_recipients.status` aceita apenas
 * pending/sending/sent/delivered/failed/skipped/outcome_unknown. Por isso
 * "Respondida" e "Lida" são derivados AQUI, e "Sem telefone" cobre a linha que
 * ainda não foi (e não pode ser) enviada por falta de telefone. O desfecho real
 * (entregue/falha/suprimido) nunca é escondido por esses dois derivados.
 */
function talkXRecipientState(row: TalkXRecipientRow): string {
  if (row.replied_at) return 'replied';
  if (row.read_at) return 'read';
  if ((row.status === 'pending' || row.status === 'sending') && !row.contacts?.phone) return 'no_phone';
  return row.status;
}

/**
 * Horário da linha em HH:mm — em TODOS os estados. A ordem é do evento mais
 * avançado para o mais antigo; `updated_at` garante que até uma linha "Na fila"
 * (sem envio) mostre o horário em que o destinatário entrou na lista.
 */
function talkXRecipientTime(row: TalkXRecipientRow): string {
  return fmtTime(row.read_at ?? row.delivered_at ?? row.sent_at ?? row.updated_at ?? null);
}

export type TalkXRecipientColumnKey =
  | 'contact' | 'origin' | 'segment' | 'status' | 'ticks' | 'time' | 'message' | 'actions';

/** Tela 11 — "Destinatários em tempo real". */
const LIVE_COLUMNS: TalkXRecipientColumnKey[] = ['contact', 'origin', 'segment', 'status', 'time', 'actions'];
/** Tela 12 — "Entregas em Tempo Real". */
const DELIVERIES_COLUMNS: TalkXRecipientColumnKey[] = ['contact', 'segment', 'status', 'ticks', 'time', 'message', 'actions'];

const COLUMN_HEADER: Record<string, string> = {
  contact: 'Contato', origin: 'Origem', segment: 'Segmento', status: 'Status',
  ticks: 'Tiques', time: 'Horário', message: 'Mensagem',
};

const CELL_CLASS: Record<string, string> = {
  contact: 'min-w-[220px]',
  time: 'whitespace-nowrap',
  message: 'max-w-[280px]',
  actions: 'text-right',
};

function Ticks({ row }: { row: TalkXRecipientRow }) {
  const marks = [
    { label: 'Enviado', on: !!row.sent_at, Icon: Check, tone: 'text-primary' },
    { label: 'Entregue', on: !!row.delivered_at, Icon: CheckCheck, tone: 'text-dash-green' },
    { label: 'Lido', on: !!row.read_at, Icon: Eye, tone: 'text-dash-green' },
  ];
  return (
    <span className="inline-flex items-center gap-1.5">
      {marks.map(({ label, on, Icon, tone }) => (
        <span
          key={label} role="img" aria-label={label} title={label} data-on={on ? 'true' : 'false'}
          className={cn('inline-flex', on ? tone : 'text-muted-foreground/40')}
        >
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
      ))}
    </span>
  );
}

export interface TalkXRecipientsTableProps {
  rows: TalkXRecipientRow[];
  /** Variante de colunas: `live` (tela 11) ou `deliveries` (tela 12). */
  variant?: 'live' | 'deliveries';
  /** Sobreposição de colunas (e ordem) — vence a variante. */
  columns?: TalkXRecipientColumnKey[];
  title?: string;
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  error?: Error | null;
  /** Refaz a consulta da lista ("Tentar novamente" e botão "Atualizar"). */
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  searchPlaceholder?: string;
  pageSize?: number;
  pagination?: 'pages' | 'more';
  /** Observação no rodapé (ex.: corte de 200 linhas da leitura atual). */
  note?: string;
  className?: string;
}

export function TalkXRecipientsTable({
  rows,
  variant = 'live',
  columns,
  title,
  isLoading = false,
  isFetching = false,
  isError = false,
  error = null,
  onRetry,
  emptyTitle = 'Nenhum destinatário encontrado',
  emptyDescription = 'Ajuste o filtro de estado ou aguarde os primeiros envios.',
  searchPlaceholder = 'Buscar destinatário…',
  pageSize: pageSizeProp = 10,
  pagination = 'pages',
  note,
  className,
}: TalkXRecipientsTableProps) {
  const cols = columns ?? (variant === 'deliveries' ? DELIVERIES_COLUMNS : LIVE_COLUMNS);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeProp);
  const [visible, setVisible] = useState(pageSizeProp);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Busca com espera de 300 ms (setState no callback do timer, nunca no corpo do efeito).
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && talkXRecipientState(row) !== statusFilter) return false;
      if (!q) return true;
      const c = row.contacts;
      return [c?.name, c?.nickname, c?.phone, c?.company, c?.lead_origin]
        .some((value) => (value ?? '').toLowerCase().includes(q));
    });
  }, [rows, debounced, statusFilter]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Trocar busca/filtro/tamanho volta para a 1ª página — sem isso a página 2 de um
  // recorte menor mostraria um intervalo vazio ("Mostrando 21 a 12 de 12").
  const resetKey = `${statusFilter}|${debounced}|${pageSize}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setPage(1);
    setVisible(pageSize);
  }
  const safePage = Math.min(page, totalPages);
  const shown = pagination === 'more'
    ? filtered.slice(0, visible)
    : filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className={cn('rounded-2xl bg-card border border-border/70 overflow-hidden', className)}>
      {/* X047: carregando -> erro -> vazio -> conteúdo (cabeçalho e lista juntos) */}
      <TalkXQueryBoundary
        query={{ isLoading, isFetching, isError, error }}
        entity="informações dos destinatários"
        onRetry={onRetry}
        skeleton={<div className="p-4"><TalkXSkeletonRows rows={5} /></div>}
        isEmpty={rows.length === 0}
        empty={<div className="py-4"><TalkXEmptyState title={emptyTitle} description={emptyDescription} /></div>}
      >
        <div className="px-4 py-3 border-b border-border/40 flex flex-wrap items-center gap-2">
          {title && <p className="text-[13px] font-bold text-foreground mr-auto">{title}</p>}
          <div className={cn('relative', !title && 'mr-auto')}>
            <Search aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Buscar destinatário"
              className="h-9 pl-8 w-56 text-xs bg-input/40 border-border/70 rounded-lg"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="Filtrar por estado" className="h-9 w-auto min-w-[150px] bg-input/40 border-border/70 text-xs">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(RECIPIENT_STATUS).map(([value, meta]) => (
                <SelectItem key={value} value={value}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button" aria-label="Atualizar" onClick={onRetry} disabled={!onRetry || isFetching}
            className="h-9 w-9 rounded-lg inline-flex items-center justify-center bg-input/40 border border-border/70 disabled:opacity-40"
          >
            <RefreshCw aria-hidden="true" className={cn('w-3.5 h-3.5', isFetching && 'motion-safe:animate-spin')} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr>
                {cols.map((key) => (
                  <th key={key} scope="col" className="text-left text-2xs font-semibold text-foreground-secondary px-4 py-2">
                    {key === 'actions' ? <span className="sr-only">Ações</span> : COLUMN_HEADER[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, idx) => {
                const contact = row.contacts;
                const name = contact?.name || 'Contato indisponível';
                const snapshot = row.personalized_message?.trim() ?? '';
                const rowKey = row.id ?? `${contact?.phone ?? 'sem-telefone'}-${idx}`;
                const expanded = expandedKey === rowKey;
                return (
                  <Fragment key={rowKey}>
                    <tr className="border-t border-border/40 hover:bg-muted/10">
                      {cols.map((key) => (
                        <td key={key} className={cn('px-4 py-2.5 border-t border-border/40', CELL_CLASS[key])}>
                          {key === 'contact' && (
                            <div className="flex items-center gap-2.5 min-w-0">
                              <InitialsAvatar name={contact?.name || '?'} src={contact?.avatar_url ?? undefined} size={28} />
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{name}</p>
                                <p className="text-2xs font-mono text-foreground-secondary truncate">{contact?.phone ?? '—'}</p>
                              </div>
                            </div>
                          )}
                          {key === 'origin' && <span className="text-xs text-foreground-secondary">{contact?.lead_origin || '—'}</span>}
                          {key === 'segment' && <span className="text-xs text-foreground-secondary">{row.segment_name || '—'}</span>}
                          {key === 'status' && <StatusPill status={talkXRecipientState(row)} map={RECIPIENT_STATUS} />}
                          {key === 'ticks' && <Ticks row={row} />}
                          {key === 'time' && <span className="text-2xs tabular-nums text-muted-foreground">{talkXRecipientTime(row)}</span>}
                          {key === 'message' && (
                            <div className="min-w-0">
                              <p className="text-xs text-foreground-secondary line-clamp-2">{snapshot || '—'}</p>
                              {row.error_message && <p className="text-2xs text-dash-red truncate">{row.error_message}</p>}
                            </div>
                          )}
                          {key === 'actions' && (
                            <div className="flex justify-end">
                              <RowActionsMenu
                                label={`Ações de ${name}`}
                                actions={[{
                                  label: expanded ? 'Ocultar mensagem' : 'Ver mensagem',
                                  icon: MessageSquare,
                                  disabled: !snapshot,
                                  onSelect: () => setExpandedKey(expanded ? null : rowKey),
                                }]}
                              />
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                    {expanded && (
                      <tr className="bg-muted/20">
                        <td colSpan={cols.length} className="px-4 py-3">
                          <p className="text-2xs font-semibold text-foreground-secondary">{`Mensagem enviada para ${name}`}</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-foreground-secondary">
                            {talkXMessageSnapshotDisplay(row.personalized_message ?? null, row.status)}
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {total === 0 && (
                <tr>
                  <td colSpan={cols.length} className="px-4 py-8 text-center">
                    <p className="text-xs font-semibold text-foreground">Nenhum destinatário corresponde à busca ou ao filtro.</p>
                    <button
                      type="button"
                      onClick={() => { setTerm(''); setDebounced(''); setStatusFilter('all'); }}
                      className="mt-1 text-2xs font-semibold text-primary hover:underline"
                    >
                      Limpar busca e filtro
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-border/40">
          {pagination === 'more' ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-foreground-secondary">{`Mostrando ${fmtInt(shown.length)} de ${fmtInt(total)} destinatários`}</p>
              {shown.length < total && (
                <button
                  type="button" onClick={() => setVisible((current) => current + pageSize)}
                  className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-semibold text-foreground-secondary hover:bg-muted/50"
                >
                  Carregar mais
                </button>
              )}
            </div>
          ) : (
            <TalkXPagination
              page={safePage} pageSize={pageSize} total={total} noun="destinatários"
              onPage={setPage} onPageSize={setPageSize}
            />
          )}
          {note && <p className="mt-2 text-2xs text-muted-foreground">{note}</p>}
        </div>
      </TalkXQueryBoundary>
    </div>
  );
}

export default TalkXRecipientsTable;
