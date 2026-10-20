/**
 * JourneyFilters — barra de filtros da aba Journey (Histórico).
 *
 * Etapas S045–S046 e S051–S060 do PLANO_JOURNEY_HISTORICO_COMPLETO_100_ETAPAS:
 *   (1) PERÍODO com o MESMO seletor da aba IA (`PeriodFilterSelector`: atalhos + calendário
 *       De/Até), SEM "Última interação" (não faz sentido no histórico da conversa) e com
 *       padrão "Últimos 30 dias". O seletor da IA fala em `AnalysisPeriod`; aqui o estado do
 *       período é o `JourneyPeriod` do J02 (`src/lib/journey/periodRange.ts`), fonte única do
 *       cálculo — a troca acontece só na borda (os dois mapas abaixo).
 *   (2) TIPO: `Select` do design system com as opções de `TYPE_FILTER_OPTIONS` (Todos,
 *       Mensagens, E-mail, Telefone, Notas, Tarefas, Transferências, Arquivos, Propostas,
 *       Atendimento) e a contagem de cada uma.
 *   (3) USUÁRIOS de seleção MÚLTIPLA: botão que mostra "Todos" ou "Maria +1", lista com caixas
 *       de marcar, foto (`SenderAvatar`) e contagem, e as opções "Cliente"/"Sistema" quando o
 *       chamador as inclui em `users`. NENHUMA marcada = todos. A busca dentro da lista só
 *       aparece quando há mais de 8 opções (limiar do plano).
 *   (4) Etiquetas dos filtros ativos (com X) e botão "Limpar filtros".
 *
 * Componente de APRESENTAÇÃO: não consulta banco nem Supabase, não guarda dado de negócio e não
 * exporta/baixa/copia nada — recebe tudo por props e devolve mudança por callback.
 *
 * Efeitos (D12 via `./motion`, J05): só os sutis e sempre sob `motion-safe:` — o cartão do
 * gatilho de usuários eleva levemente no hover (`CARD_INTERACTIVE`) e as etiquetas entram em
 * fade + deslize de 8 px (`FadeSlideIn`). Com `prefers-reduced-motion: reduce` nada se move.
 *
 * Cores: só tokens que o sistema já tem (`primary`, `success`, `warning`, `info`, `destructive`,
 * `muted`, `border`) — nenhuma cor nova.
 */
import { useCallback, useId, useMemo, useState } from 'react';
import { Search, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { TYPE_FILTER_OPTIONS, type JourneyActor, type JourneyTypeFilterValue } from '@/lib/journey/model';
import { describePeriod, type JourneyPeriod, type JourneyPeriodPreset } from '@/lib/journey/periodRange';
import { localDayKey, parseDayKey } from '@/lib/localDay';
import { PeriodFilterSelector, type AnalysisPeriod } from '@/components/inbox/ai-tools/PeriodFilterSelector';
import { SenderAvatar } from '../SenderAvatar';
import { CARD_INTERACTIVE, FadeSlideIn } from './motion';

/** Período com que a aba abre (S045: "padrão Últimos 30 dias"). */
const PERIODO_PADRAO: JourneyPeriod = { preset: '30d' };

/** Texto do intervalo aberto (`describePeriod`) — é ele que diz "sem filtro de data". */
const TEXTO_QUALQUER_DATA = 'Qualquer data';

/** Limiar do plano (S053): a busca aparece na lista de usuários só a partir daqui. */
const MIN_USUARIOS_PARA_BUSCA = 8;

/** Uma opção do filtro de usuários — já resolvida e contada por quem chama (J08/J09). */
export interface JourneyFilterUser {
  /** Chave estável da pessoa; `contact` e `system` são as chaves do contato e da automação. */
  id: string;
  /** Natureza do autor — o mesmo vocabulário do `JourneyActor` do J01. */
  kind: JourneyActor['kind'];
  name: string;
  avatarUrl: string | null;
  /** Episódios desta pessoa no recorte contado (mesmo recorte do período/tipo). */
  count: number;
}

export interface JourneyFiltersProps {
  /** Período atual; sem a prop a barra abre em "Últimos 30 dias" (`PERIODO_PADRAO`). */
  period?: JourneyPeriod;
  onPeriodChange: (period: JourneyPeriod) => void;
  /** Tipo fino selecionado; `all` = todos. */
  type?: JourneyTypeFilterValue;
  onTypeChange: (type: JourneyTypeFilterValue) => void;
  /** Ids marcados (em ordem de escolha); vazio ou ausente = todos. */
  userIds?: string[];
  onUserIdsChange: (userIds: string[]) => void;
  /** Opções do filtro de usuários (inclui "Cliente" e "Sistema" quando o chamador as manda). */
  users: JourneyFilterUser[];
  /** Contagem por opção do filtro de tipo; opção sem número não mostra parênteses. */
  typeCounts?: Partial<Record<JourneyTypeFilterValue, number>>;
  /** Itens do recorte atual e do carregado — o contador do gatilho de período, como na IA. */
  filteredCount?: number;
  totalCount?: number;
}

/** `JourneyPeriodPreset` (J02) -> `AnalysisPeriod` (seletor da IA). */
function paraAnalise(preset: JourneyPeriodPreset): AnalysisPeriod {
  return preset === 'any' ? 'all' : preset;
}

/** `AnalysisPeriod` (seletor da IA) -> `JourneyPeriodPreset` (J02). */
function paraJourneyPreset(preset: AnalysisPeriod): JourneyPeriodPreset {
  // A IA tem "Última interação", que o histórico não oferece (fica escondida no seletor); se um
  // dia chegar por engano, cai em intervalo aberto em vez de inventar janela.
  if (preset === 'all' || preset === 'last_interaction') return 'any';
  return preset;
}

/** Minúsculas sem acento — para a busca da lista casar "Joao" com "João". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

interface EtiquetaFiltro {
  key: string;
  label: string;
  onRemove: () => void;
}

export function JourneyFilters({
  period,
  onPeriodChange,
  type = 'all',
  onTypeChange,
  userIds = [],
  onUserIdsChange,
  users,
  typeCounts,
  filteredCount = 0,
  totalCount = 0,
}: JourneyFiltersProps) {
  const periodo = period ?? PERIODO_PADRAO;
  const idBase = useId();

  const customFrom = periodo.preset === 'custom' && periodo.from ? parseDayKey(periodo.from) ?? undefined : undefined;
  const customTo = periodo.preset === 'custom' && periodo.to ? parseDayKey(periodo.to) ?? undefined : undefined;

  /**
   * O seletor da IA avisa a data escolhida (`onCustomFromChange`/`onCustomToChange`) e, em seguida,
   * chama `onPeriodChange('custom')`. Como o estado do período é controlado por quem usa a barra,
   * quem manda o período COMPLETO é o tratador da data; o 'custom' puro que vem depois não muda
   * nada — o mesmo vale para `onClearCustom`, que o seletor só chama junto de outro
   * `onPeriodChange` (o "Limpar datas" manda 'all', que aqui vira 'any').
   */
  const aoTrocarAtalho = useCallback(
    (preset: AnalysisPeriod) => {
      if (preset === 'custom') return;
      onPeriodChange({ preset: paraJourneyPreset(preset) });
    },
    [onPeriodChange],
  );

  const aoTrocarDe = useCallback(
    (dia: Date | undefined) => {
      onPeriodChange({
        preset: 'custom',
        from: dia ? localDayKey(dia) ?? undefined : undefined,
        to: periodo.to,
      });
    },
    [onPeriodChange, periodo.to],
  );

  const aoTrocarAte = useCallback(
    (dia: Date | undefined) => {
      onPeriodChange({
        preset: 'custom',
        to: dia ? localDayKey(dia) ?? undefined : undefined,
        from: periodo.from,
      });
    },
    [onPeriodChange, periodo.from],
  );

  const aoLimparDatas = useCallback(() => {}, []);

  // ── Usuários ────────────────────────────────────────────────────────────────
  const [usuariosAberto, setUsuariosAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const usuariosPorId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const mostrarBusca = users.length > MIN_USUARIOS_PARA_BUSCA;
  const usuariosVisiveis = useMemo(() => {
    if (!mostrarBusca) return users;
    const termo = normalizar(busca);
    if (!termo) return users;
    return users.filter((u) => normalizar(u.name).includes(termo));
  }, [users, busca, mostrarBusca]);

  const alternarUsuario = useCallback(
    (id: string) => {
      onUserIdsChange(userIds.includes(id) ? userIds.filter((atual) => atual !== id) : [...userIds, id]);
    },
    [userIds, onUserIdsChange],
  );

  const nomesSelecionados = userIds.map((id) => usuariosPorId.get(id)?.name ?? id);
  const rotuloUsuarios =
    nomesSelecionados.length === 0
      ? 'Todos'
      : nomesSelecionados.length === 1
        ? nomesSelecionados[0]
        : `${nomesSelecionados[0]} +${nomesSelecionados.length - 1}`;

  // ── Etiquetas dos filtros ativos (S057) ─────────────────────────────────────
  const rotuloPeriodo = describePeriod(periodo);
  const etiquetas: EtiquetaFiltro[] = [];
  if (rotuloPeriodo !== TEXTO_QUALQUER_DATA) {
    etiquetas.push({
      key: 'period',
      label: rotuloPeriodo,
      onRemove: () => onPeriodChange({ preset: 'any' }),
    });
  }
  const opcaoTipo = TYPE_FILTER_OPTIONS.find((o) => o.value === type);
  if (type !== 'all') {
    etiquetas.push({ key: 'type', label: opcaoTipo?.label ?? type, onRemove: () => onTypeChange('all') });
  }
  for (const id of userIds) {
    const nome = usuariosPorId.get(id)?.name ?? id;
    etiquetas.push({ key: `user:${id}`, label: nome, onRemove: () => alternarUsuario(id) });
  }

  const limparFiltros = useCallback(() => {
    onPeriodChange({ preset: 'any' });
    onTypeChange('all');
    onUserIdsChange([]);
  }, [onPeriodChange, onTypeChange, onUserIdsChange]);

  return (
    <div data-testid="journey-filters" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[160px] flex-1 sm:max-w-[260px]" data-testid="journey-period-filter">
          <PeriodFilterSelector
            period={paraAnalise(periodo.preset)}
            onPeriodChange={aoTrocarAtalho}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={aoTrocarDe}
            onCustomToChange={aoTrocarAte}
            onClearCustom={aoLimparDatas}
            filteredCount={filteredCount}
            totalCount={totalCount}
            hiddenPeriods={['last_interaction']}
          />
        </div>

        <Select value={type} onValueChange={(valor) => onTypeChange(valor as JourneyTypeFilterValue)}>
          <SelectTrigger
            aria-label="Tipo de evento"
            className="h-9 w-[220px] bg-input border-border"
            data-testid="journey-type-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTER_OPTIONS.map((opcao) => {
              const contagem = typeCounts?.[opcao.value];
              return (
                <SelectItem key={opcao.value} value={opcao.value}>
                  {typeof contagem === 'number' ? `${opcao.label} (${contagem})` : opcao.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Popover
          open={usuariosAberto}
          onOpenChange={(aberto) => {
            setUsuariosAberto(aberto);
            if (!aberto) setBusca('');
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Filtrar por usuário"
              title="Ver só o que cada pessoa falou"
              data-testid="journey-users-trigger"
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors',
                CARD_INTERACTIVE,
                userIds.length > 0
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border bg-input text-muted-foreground hover:text-foreground',
              )}
            >
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-[140px] truncate">{rotuloUsuarios}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={4}
            className="w-[min(320px,calc(100vw_-_2rem))] p-2"
            data-testid="journey-users-panel"
          >
            {mostrarBusca && (
              <div className="relative mb-1.5">
                <Search
                  className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={busca}
                  onChange={(evento) => setBusca(evento.target.value)}
                  placeholder="Buscar pessoa"
                  aria-label="Buscar pessoa"
                  className="h-8 pl-8 text-xs"
                  data-testid="journey-users-search"
                />
              </div>
            )}

            <p className="px-2 pb-1 text-3xs text-muted-foreground">Nenhuma marcada = todos</p>

            {usuariosVisiveis.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground" data-testid="journey-users-empty">
                Nenhuma pessoa no recorte atual.
              </p>
            ) : (
              <div
                className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto"
                data-testid="journey-users-options"
              >
                {usuariosVisiveis.map((usuario) => {
                  const id = `${idBase}-user-${usuario.id}`;
                  const marcado = userIds.includes(usuario.id);
                  return (
                    <div
                      key={usuario.id}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60"
                      data-testid={`journey-user-${usuario.id}`}
                    >
                      <Checkbox
                        id={id}
                        checked={marcado}
                        onCheckedChange={() => alternarUsuario(usuario.id)}
                        aria-label={usuario.name}
                      />
                      <SenderAvatar
                        name={usuario.name}
                        avatarUrl={usuario.avatarUrl}
                        colorKey={usuario.id}
                        size="md"
                      />
                      <label
                        htmlFor={id}
                        className={cn(
                          'min-w-0 flex-1 cursor-pointer truncate text-[13px]',
                          marcado ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {usuario.name}
                      </label>
                      <span className="shrink-0 tabular-nums text-3xs text-muted-foreground">{usuario.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </PopoverContent>
        </Popover>

        {etiquetas.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            data-testid="journey-filters-clear"
            onClick={limparFiltros}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Limpar filtros
          </Button>
        )}
      </div>

      {etiquetas.length > 0 && (
        <ul
          aria-label="Filtros ativos"
          data-testid="journey-filter-chips"
          className="flex flex-wrap items-center gap-1.5"
        >
          {etiquetas.map((etiqueta, indice) => (
            <li key={etiqueta.key}>
              <FadeSlideIn index={indice}>
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 py-0.5 pl-2.5 pr-1 text-2xs text-foreground">
                  {etiqueta.label}
                  <button
                    type="button"
                    onClick={etiqueta.onRemove}
                    aria-label={`Remover filtro ${etiqueta.label}`}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              </FadeSlideIn>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
