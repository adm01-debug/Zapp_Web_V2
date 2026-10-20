import type { LucideIcon } from 'lucide-react';
import { CalendarCheck2, Clock, Send, Timer, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { MetaRow, estimateSeconds, fmtDurationShort, fmtInt } from './talkxShared';
import { localToUTCInTimezone, utcToLocalInTimezone } from './useCampaignEditor';

/**
 * X138 (TL-150) — "Resumo da Programação" da tela 10 como linha do tempo.
 *
 * A11: a linha do tempo lê o estado EM EDIÇÃO da tela (data, hora, fuso e janela
 * que o operador acabou de mexer), não o que está gravado na campanha. Assim o
 * operador vê o efeito da edição antes de salvar; quando o início em edição
 * difere do gravado, o marco diz "alteração não salva" (distingue gravado de
 * editado). A janela some quando `windowEnabled` está desligado.
 *
 * A12: com campanha sem `scheduled_at`, o início ainda é deduzido da data/hora
 * em edição — a linha do tempo nunca depende de dado gravado para existir.
 *
 * A9: a "Previsão de conclusão" é OCULTA quando não há previsão (público zero
 * não inventa duração).
 *
 * Os horários saem de `localToUTCInTimezone`/`utcToLocalInTimezone`, o mesmo
 * conversor auditado do editor — o fuso do navegador não entra em nenhum ponto.
 */

type ScheduleMilestoneTone = 'info' | 'primary' | 'success' | 'muted';

interface ScheduleMilestone {
  key: 'configured' | 'start' | 'window' | 'eta';
  icon: LucideIcon;
  tone: ScheduleMilestoneTone;
  /** Data e hora locais ("27/11/2026 • 09:00") ou só a faixa da janela. */
  when: string | null;
  label: string;
  detail?: string | null;
}

/** Estado em edição na tela: o que o operador vê antes de salvar. */
export interface ScheduleEditingState {
  /** Data na parede local da tela ('AAAA-MM-DD'). */
  date: string;
  /** Horário na parede local da tela ('HH:mm'). */
  time: string;
  /** Fuso escolhido na tela. */
  timezone: string;
  windowEnabled: boolean;
  /** 'HH:mm' (ou 'HH:mm:ss'); só o par é exibido. */
  windowStart: string;
  windowEnd: string;
}

const TONE_DOT: Record<ScheduleMilestoneTone, string> = {
  info: 'bg-info',
  primary: 'bg-primary',
  success: 'bg-success',
  muted: 'bg-muted-foreground',
};

/** Instante ISO → "dd/mm/aaaa • hh:mm" na parede local do fuso informado. */
function fmtScheduleLocal(iso: string | null | undefined, timezone: string): string | null {
  if (!iso) return null;
  const wall = utcToLocalInTimezone(iso, timezone); // 'AAAA-MM-DDTHH:mm'
  if (!wall) return null;
  const [date, time] = wall.split('T');
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year} • ${time}`;
}

/** "08:00:00" (coluna `time`) → "08:00". */
function windowClock(value: string | null | undefined): string | null {
  return value ? value.slice(0, 5) : null;
}

/** Início em edição → instante UTC. `null` quando falta data ou hora. */
function editingInstant(editing: ScheduleEditingState): string | null {
  if (!editing.date || !editing.time) return null;
  try {
    return localToUTCInTimezone(`${editing.date}T${editing.time}`, editing.timezone);
  } catch {
    // Horário inexistente/ambíguo no fuso (DST): a edição ainda não é um marco.
    return null;
  }
}

function buildScheduleMilestones(campaign: TalkXCampaign, editing: ScheduleEditingState): ScheduleMilestone[] {
  const milestones: ScheduleMilestone[] = [];

  const savedStart = campaign.scheduled_at ?? null;
  const editedStart = editingInstant(editing);
  const startIso = editedStart ?? savedStart;
  const startAt = fmtScheduleLocal(startIso, editing.timezone);

  // Marco "gravado": a data do último evento da campanha existe no banco.
  const configuredAt = fmtScheduleLocal(campaign.updated_at, editing.timezone);
  if (configuredAt) {
    milestones.push({
      key: 'configured', icon: CalendarCheck2, tone: 'info', when: configuredAt,
      label: 'Campanha configurada e aguardando início',
    });
  }

  if (startAt) {
    // A comparação é pelo INSTANTE (Date.parse), não pelo texto: o PostgREST
    // devolve timestamptz como '+00:00' e o conversor gera '.000Z' — o mesmo
    // instante em textos diferentes não é edição.
    const editedNotSaved =
      editedStart != null && (savedStart == null || Date.parse(editedStart) !== Date.parse(savedStart));
    milestones.push({
      key: 'start', icon: Send, tone: 'primary', when: startAt,
      label: 'Início dos envios',
      detail: `${campaign.name}${editedNotSaved ? ' · alteração não salva' : ''}`,
    });
  }

  const windowStart = windowClock(editing.windowEnabled ? editing.windowStart : null);
  const windowEnd = windowClock(editing.windowEnabled ? editing.windowEnd : null);
  if (windowStart && windowEnd) {
    const day = startAt ? `${startAt.split(' • ')[0]} • ` : '';
    milestones.push({
      key: 'window', icon: Clock, tone: 'success', when: `${day}${windowStart} - ${windowEnd}`,
      label: 'Janela de envio ativa',
    });
  }

  const estimate = estimateSeconds(
    campaign.total_recipients,
    campaign.typing_delay_min,
    campaign.typing_delay_max,
    campaign.send_interval_min,
    campaign.send_interval_max,
  );
  // A9: sem público não há previsão — o marco não aparece.
  if (Number.isFinite(estimate) && estimate > 0) {
    milestones.push({
      key: 'eta', icon: TrendingUp, tone: 'muted', when: null,
      label: `Previsão de conclusão em até ${fmtDurationShort(estimate).replace(/^~/, '')}`,
    });
  }

  // A12: nunca fica vazia. Sem nenhum marco (nem gravado, nem em edição) a linha
  // do tempo ainda mostra o estado em edição aguardando data e horário.
  if (milestones.length === 0) {
    milestones.push({
      key: 'configured', icon: CalendarCheck2, tone: 'muted', when: null,
      label: 'Campanha aguardando data e horário no fuso ' + editing.timezone,
    });
  }

  return milestones;
}

interface Props {
  campaign: TalkXCampaign;
  /** Estado em edição da tela; sem ele não há marco a deduzir. */
  editing: ScheduleEditingState;
}

export function TalkXScheduleTimeline({ campaign, editing }: Props) {
  const tz = editing.timezone || campaign.schedule_timezone || 'America/Sao_Paulo';
  const milestones = buildScheduleMilestones(campaign, { ...editing, timezone: tz });

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 p-3 space-y-3" data-talkx-schedule-timeline>
      <p className="text-2xs font-semibold text-foreground-secondary uppercase tracking-wide">Resumo da Programação</p>

      <ol className="space-y-0">
        {milestones.map((milestone, index) => {
          const Icon = milestone.icon;
          return (
            <li key={milestone.key} className="flex gap-3" data-talkx-milestone={milestone.key}>
              <div className="flex flex-col items-center">
                <span className={cn('w-2.5 h-2.5 rounded-full mt-1.5 shrink-0', TONE_DOT[milestone.tone])} aria-hidden="true" />
                {index < milestones.length - 1 && <span className="w-px flex-1 bg-border/50 my-0.5" aria-hidden="true" />}
              </div>
              <div className="pb-3 min-w-0">
                <p className="text-xs leading-snug text-foreground flex items-start gap-1.5">
                  <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0">
                    {milestone.when && <span className="font-semibold text-foreground-secondary">{milestone.when} — </span>}
                    {milestone.label}
                    {milestone.detail && <span className="text-muted-foreground"> · {milestone.detail}</span>}
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="space-y-1.5 pt-1 border-t border-border/40">
        <MetaRow icon={Timer} label="Fuso" value={tz} />
        <MetaRow icon={Users} label="Destinatários" value={`${fmtInt(campaign.total_recipients)} contatos`} />
      </div>
    </div>
  );
}
