/**
 * `JourneyTimeline` — a linha do tempo da aba Journey: dias (S070) em ordem
 * decrescente, cada dia com o cabeçalho vindo de `formatDayLabel` ("Hoje, 7 de
 * outubro de 2026" — `de` minúsculo, S066) e os episódios num trilho vertical
 * (`JourneyEventCard`).
 *
 * Entrada:
 * - `days`: os dias já agrupados (caminho preferido — quem entrega é o hook da
 *   aba, que já conhece o fuso);
 * - `events`: lista achatada; a timeline agrupa por DIA LOCAL usando o mesmo
 *   `localDayKey` do resto do app (nada de `slice(0,10)` em instante ISO, que
 *   erraria o dia no fuso UTC-3).
 * Se `days` vier, ele vence; `events` é só o atalho.
 *
 * `names` e `resolve` resolvem QUEM agiu (foto + nome) sem o cartão saber de
 * onde vem: `names` é o mapa id -> { nome, foto } (perfil/contato) e `resolve`
 * é a função que vence o mapa quando presente (ex.: nomes do sistema). Sem
 * nenhum dos dois, vale o que o próprio evento traz, com o rótulo padrão por
 * tipo de autor ("Cliente"/"Atendente"/"Sistema").
 *
 * `onOpen` é repassado a cada cartão; o cartão entrega o `event.target`.
 */
import { Skeleton } from '@/components/ui/skeleton';
import { formatDayLabel } from '@/lib/journey/model';
import type { JourneyActor, JourneyDay, JourneyEvent, JourneyTarget } from '@/lib/journey/model';
import { localDayKey, parseDayKey } from '@/lib/localDay';
import { JourneyEventCard } from './JourneyEventCard';

/** Nome e foto de um autor, por id — o mapa `names`. */
export interface JourneyActorOverride {
  name: string;
  avatarUrl?: string | null;
}

/** id do autor -> nome/foto (vindo do perfil do usuário ou do contato). */
export type JourneyNameMap = Record<string, JourneyActorOverride>;

/** Função que resolve o autor para exibição; vence o mapa `names`. `null` = usa o mapa. */
export type JourneyActorResolver = (
  actor: JourneyActor,
  event: JourneyEvent,
) => { name: string; avatarUrl: string | null } | null;

export interface JourneyTimelineProps {
  /** Dias já agrupados (vence `events`). */
  days?: JourneyDay[];
  /** Lista achatada — agrupada por dia local quando `days` não vem. */
  events?: JourneyEvent[];
  /** Nome/foto por id de autor. */
  names?: JourneyNameMap;
  /** Resolve o autor para exibição; tem prioridade sobre `names`. */
  resolve?: JourneyActorResolver;
  /** Chamado quando um episódio é aberto (clique, Enter ou Espaço). */
  onOpen: (target: JourneyTarget) => void;
  /** Esqueleto de carregamento. */
  loading?: boolean;
}

/** Rótulo padrão de quem agiu quando não há nome nenhum. */
const NOME_PADRAO: Record<JourneyActor['kind'], string> = {
  contact: 'Cliente',
  user: 'Atendente',
  system: 'Sistema',
};

/** Dia local de um evento: `yyyy-MM-dd` local, ou `null` se `at` não é data. */
function diaDoEvento(at: string): string | null {
  const dia = parseDayKey(at);
  if (dia) return localDayKey(dia);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(at)) return null;
  const instante = new Date(at);
  if (Number.isNaN(instante.getTime())) return null;
  return localDayKey(instante);
}

/** Agrupa a lista achatada por dia local, mais recente primeiro. */
function agruparEmDias(events: JourneyEvent[]): JourneyDay[] {
  const grupos = new Map<string, JourneyEvent[]>();
  for (const ev of events) {
    const chave = diaDoEvento(ev.at) ?? '';
    const lista = grupos.get(chave);
    if (lista) lista.push(ev);
    else grupos.set(chave, [ev]);
  }
  return [...grupos.entries()]
    .map(([date, lista]) => ({
      date,
      events: [...lista].sort((a, b) => b.at.localeCompare(a.at)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Nome + foto de quem agiu, aplicando `resolve` e depois `names`. */
function atorParaExibir(
  event: JourneyEvent,
  names?: JourneyNameMap,
  resolve?: JourneyActorResolver,
): { name: string; avatarUrl: string | null } {
  const resolvido = resolve?.(event.actor, event) ?? null;
  if (resolvido) return resolvido;
  const override = event.actor.id ? names?.[event.actor.id] : undefined;
  return {
    name: override?.name ?? event.actor.name ?? NOME_PADRAO[event.actor.kind],
    avatarUrl: override?.avatarUrl ?? event.actor.avatarUrl ?? null,
  };
}

export function JourneyTimeline({
  days,
  events,
  names,
  resolve,
  onOpen,
  loading = false,
}: JourneyTimelineProps) {
  if (loading) {
    return (
      <div
        data-testid="journey-timeline-loading"
        role="status"
        aria-label="Carregando a linha do tempo"
        className="flex flex-col gap-3"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-2.5">
            <Skeleton className="h-4 w-9 shrink-0 rounded" />
            <Skeleton className="h-16 flex-1 rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  const lista = days ?? agruparEmDias(events ?? []);

  if (lista.length === 0 || lista.every((dia) => dia.events.length === 0)) {
    return (
      <p data-testid="journey-timeline-empty" className="py-8 text-center text-sm text-muted-foreground">
        Nenhum episódio no período.
      </p>
    );
  }

  return (
    <section
      data-testid="journey-timeline"
      aria-label="Linha do tempo do contato"
      className="flex flex-col gap-4"
    >
      {lista.map((dia) => {
        const rotuloDia = formatDayLabel(dia.date);
        const chaveDia = dia.date || 'sem-data';
        return (
          <section key={chaveDia} data-testid={`journey-day-${chaveDia}`} className="flex flex-col gap-2">
            {rotuloDia && (
              <h3 data-testid="journey-day-header" className="text-xs font-semibold text-foreground">
                {rotuloDia}
              </h3>
            )}
            <ul className="flex flex-col">
              {dia.events.map((ev, i) => {
                const ator = atorParaExibir(ev, names, resolve);
                return (
                  <JourneyEventCard
                    key={ev.id}
                    event={ev}
                    index={i}
                    isLast={i === dia.events.length - 1}
                    actorName={ator.name}
                    actorAvatarUrl={ator.avatarUrl}
                    onOpen={onOpen}
                  />
                );
              })}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
