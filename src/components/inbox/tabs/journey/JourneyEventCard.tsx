/**
 * `JourneyEventCard` — o cartão de UM episódio da timeline do contato
 * (etapas S061–S065, S067 e S069 do PLANO_JOURNEY_HISTORICO_COMPLETO_100_ETAPAS).
 *
 * O que o cartão mostra, e de onde vem cada peça:
 * - ícone num quadrado na cor da categoria -> `CATEGORY_META[event.category]`;
 * - trilho vertical com ponto na cor da categoria -> `meta.railClass` (o
 *   segmento do trilho só desce quando o item NÃO é o último do dia);
 * - título do episódio, resumo (SEMPRE passado por `safeEventText`: JSON cru
 *   nunca vai para a tela — D07/S067) e selo de status -> `event.badge`;
 * - detalhes em linhas "rótulo: valor" -> `event.details`;
 * - foto + nome de quem agiu -> `SenderAvatar`; ações do robô/IA
 *   (`actor.kind === 'system'`) aparecem como "Sistema" com ícone, sem foto;
 * - horário à esquerda -> `event.at` (vazio quando o instante não é completo).
 *
 * O CARTÃO INTEIRO É UM BOTÃO (`<button type="button">`): clique, Enter e
 * Espaço abrem o episódio chamando `onOpen(event.target)` — é o alvo que diz o
 * que a aba abre (S096/J13). O botão tem `aria-label` com categoria, título,
 * horário e autor, então quem usa leitor de tela ouve a mesma informação antes
 * de ativar (S097).
 *
 * Episódios AGRUPADOS (`count > 1`) trocam os detalhes por um `Collapse` (J05):
 * o rótulo "N mensagens recebidas" (etc.) é o gatilho que expande as linhas do
 * grupo. O gatilho do `Collapse` é IRMÃO do botão do cartão — nunca um botão
 * dentro do outro (isso seria HTML/ARIA inválido).
 *
 * Entrada: `FadeSlideIn` (J05) com o `index` do item no dia e os atalhos
 * `CARD_INTERACTIVE`/`CHEVRON_REVEAL` do mesmo pacote. Toda animação respeita
 * `prefers-reduced-motion` (o J05 cuida disso).
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { Bot, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SenderAvatar } from '@/components/inbox/tabs/SenderAvatar';
import { CATEGORY_META, safeEventText } from '@/lib/journey/model';
import type { JourneyBadgeTone, JourneyEvent, JourneyTarget } from '@/lib/journey/model';
import { CARD_INTERACTIVE, CHEVRON_REVEAL, Collapse, FadeSlideIn } from './motion';

/** Tons do selo — as MESMAS classes do `PILL_CLASS` da aba Journey. */
const BADGE_CLASS: Record<JourneyBadgeTone, string> = {
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  primary: 'bg-primary/15 text-primary border-primary/30',
  destructive: 'bg-destructive/15 text-destructive border-destructive/30',
  muted: 'bg-muted text-muted-foreground border-border',
};

/** Só um instante ISO completo tem hora para exibir (data parcial não tem). */
const INSTANTE_ISO = /^\d{4}-\d{2}-\d{2}T/;

/** Horário `HH:mm` no fuso local — `''` quando `at` não é um instante completo. */
function horaDoEvento(at: string): string {
  if (!INSTANTE_ISO.test(at)) return '';
  const instante = new Date(at);
  if (Number.isNaN(instante.getTime())) return '';
  return format(instante, 'HH:mm');
}

/** Rótulo do grupo de um episódio agrupado (`count > 1`). */
function groupLabel(event: JourneyEvent): string {
  const n = event.count ?? 0;
  switch (event.kind) {
    case 'message_in':
      return `${n} mensagens recebidas`;
    case 'message_out':
      return `${n} mensagens enviadas`;
    case 'email_in':
      return `${n} e-mails recebidos`;
    case 'email_out':
      return `${n} e-mails enviados`;
    default:
      return `${n} episódios agrupados`;
  }
}

/** Detalhes em linhas "rótulo: valor". Phrasing content: mora dentro do botão. */
function Detalhes({ detalhes, testId }: { detalhes: JourneyEvent['details']; testId: string }) {
  if (!detalhes || detalhes.length === 0) return null;
  return (
    <span data-testid={testId} className="mt-1.5 flex flex-col gap-0.5">
      {detalhes.map((linha, i) => (
        <span key={`${linha.label}-${i}`} className="flex flex-wrap gap-1 text-xs leading-snug">
          <span className="text-muted-foreground">{linha.label}:</span>
          <span className="break-words text-foreground">{linha.value}</span>
        </span>
      ))}
    </span>
  );
}

export interface JourneyEventCardProps {
  event: JourneyEvent;
  /** Nome já resolvido de quem agiu (o chamador aplica `names`/`resolve`). */
  actorName: string;
  /** Foto já resolvida de quem agiu (`null` = iniciais do `SenderAvatar`). */
  actorAvatarUrl: string | null;
  /** Posição no dia — atraso escalonado da entrada (`FadeSlideIn`). */
  index?: number;
  /** Último item do dia: o trilho não desce além do ponto. */
  isLast?: boolean;
  /** Chamado pelo cartão inteiro (clique, Enter ou Espaço) com o alvo do episódio. */
  onOpen: (target: JourneyTarget) => void;
}

export function JourneyEventCard({
  event,
  actorName,
  actorAvatarUrl,
  index = 0,
  isLast = false,
  onOpen,
}: JourneyEventCardProps) {
  const meta = CATEGORY_META[event.category];
  const Icone = meta.icon;
  const hora = horaDoEvento(event.at);
  const resumo = safeEventText(event.summary);
  const detalhes = event.details ?? [];
  const agrupado = (event.count ?? 1) > 1;
  const sistema = event.actor.kind === 'system';
  const [aberto, setAberto] = useState(false);
  const painelId = `journey-grupo-${event.id}`;

  const rotulo = [
    meta.label,
    event.title,
    event.badge?.label,
    hora ? `às ${hora}` : null,
    actorName,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <li data-testid="journey-event" className="relative flex gap-2.5">
      {/* horário à esquerda */}
      <time
        data-testid="journey-event-time"
        dateTime={event.at || undefined}
        className="w-9 shrink-0 pt-3 text-right text-2xs tabular-nums text-muted-foreground"
      >
        {hora || '—'}
      </time>

      {/* trilho vertical + ponto na cor da categoria */}
      <div className="relative flex w-3 shrink-0 justify-center">
        {!isLast && (
          <span
            aria-hidden="true"
            data-testid="journey-rail-line"
            className="absolute bottom-0 top-3 w-px bg-border"
          />
        )}
        <span
          aria-hidden="true"
          data-testid="journey-rail-dot"
          className={cn('relative mt-3 h-2.5 w-2.5 rounded-full ring-2 ring-background', meta.railClass)}
        />
      </div>

      {/* cartão + (agrupados) gatilho do Collapse como IRMÃO do botão */}
      <div className="min-w-0 flex-1 pb-3">
        <FadeSlideIn index={index}>
          <button
            type="button"
            data-testid="journey-event-card"
            aria-label={rotulo}
            onClick={() => onOpen(event.target)}
            className={cn(
              'group flex w-full items-start gap-2.5 rounded-xl border border-border/60 bg-card p-3 text-left',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              CARD_INTERACTIVE,
            )}
          >
            <span
              aria-hidden="true"
              data-testid="journey-event-icon"
              className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.iconClass)}
            >
              <Icone className="h-4 w-4" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-start gap-2">
                <span
                  data-testid="journey-event-title"
                  className="min-w-0 flex-1 break-words text-sm font-medium text-foreground"
                >
                  {event.title}
                </span>
                {event.badge && (
                  <span
                    data-testid="journey-event-badge"
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 text-2xs font-semibold',
                      BADGE_CLASS[event.badge.tone],
                    )}
                  >
                    {event.badge.label}
                  </span>
                )}
                <ChevronRight
                  aria-hidden="true"
                  data-testid="journey-event-chevron"
                  className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground', CHEVRON_REVEAL)}
                />
              </span>

              {resumo && (
                <span
                  data-testid="journey-event-summary"
                  className="mt-0.5 block break-words text-xs text-muted-foreground"
                >
                  {resumo}
                </span>
              )}

              {!agrupado && <Detalhes detalhes={detalhes} testId="journey-event-details" />}

              <span className="mt-1.5 flex items-center gap-1.5">
                {sistema ? (
                  <span
                    aria-hidden="true"
                    data-testid="journey-event-system"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                  >
                    <Bot className="h-3 w-3" />
                  </span>
                ) : (
                  <SenderAvatar
                    name={actorName}
                    avatarUrl={actorAvatarUrl}
                    colorKey={event.actor.id ?? undefined}
                    size="sm"
                  />
                )}
                <span data-testid="journey-event-actor" className="min-w-0 truncate text-2xs text-muted-foreground">
                  {actorName}
                </span>
              </span>
            </span>
          </button>
        </FadeSlideIn>

        {agrupado &&
          (detalhes.length > 0 ? (
            <Collapse
              id={painelId}
              open={aberto}
              onToggle={() => setAberto((v) => !v)}
              className="mt-1.5"
              trigger={
                <span
                  data-testid="journey-event-group-label"
                  className="inline-flex items-center gap-1 rounded-md py-0.5 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {groupLabel(event)}
                  <ChevronDown
                    aria-hidden="true"
                    className={cn('h-3.5 w-3.5 motion-safe:transition-transform', aberto && 'rotate-180')}
                  />
                </span>
              }
            >
              <Detalhes detalhes={detalhes} testId="journey-event-group-details" />
            </Collapse>
          ) : (
            <p data-testid="journey-event-group-label" className="mt-1.5 text-xs font-medium text-muted-foreground">
              {groupLabel(event)}
            </p>
          ))}
      </div>
    </li>
  );
}
