import type { LucideIcon } from 'lucide-react';
import { CalendarCheck2, Clock, Send, Timer, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { MetaRow, estimateSeconds, fmtDurationShort, fmtInt } from './talkxShared';
import { DEFAULT_SCHEDULE_TIMEZONE, utcToLocalInTimezone } from './useCampaignEditor';

/**
 * X138 (TL-150) — "Resumo da Programação" da tela 10 como linha do tempo.
 *
 * Antes eram cinco linhas soltas (Data/Hora/Fuso/Janela/Destinatários) que não
 * diziam o que acontece nem em que ordem. Agora a coluna central mostra os
 * marcos do mock 10, sempre na parede local da CAMPANHA:
 *   1. "Campanha configurada e aguardando início" — quando o agendamento foi
 *      gravado (`updated_at`; o inventário da tela 10 lista `updated_at`/evento
 *      `scheduled` como fonte do marco);
 *   2. "Início dos envios · <campanha>" — `scheduled_at`;
 *   3. "Janela de envio ativa" — `send_window_start`–`send_window_end`, só
 *      quando a janela está ligada;
 *   4. "Previsão de conclusão em até X" — estimativa de `estimateSeconds`, e
 *      OCULTA quando não há previsão (A9): público zero não inventa duração.
 *
 * Os três horários saem de `utcToLocalInTimezone`, o mesmo conversor auditado
 * do editor — o fuso do navegador não entra em nenhum ponto da linha do tempo.
 * O marco das próximas ocorrências da repetição depende do campo `recurrence`,
 * que chega com a X137 (TL-149) junto da regra do servidor (X059, ainda não
 * implementada): sem o dado, a linha do tempo não inventa ocorrência.
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

function buildScheduleMilestones(campaign: TalkXCampaign, timezone: string): ScheduleMilestone[] {
  const milestones: ScheduleMilestone[] = [];

  const configuredAt = fmtScheduleLocal(campaign.updated_at, timezone);
  if (configuredAt) {
    milestones.push({
      key: 'configured', icon: CalendarCheck2, tone: 'info', when: configuredAt,
      label: 'Campanha configurada e aguardando início',
    });
  }

  const startAt = fmtScheduleLocal(campaign.scheduled_at, timezone);
  if (startAt) {
    milestones.push({
      key: 'start', icon: Send, tone: 'primary', when: startAt,
      label: 'Início dos envios', detail: campaign.name,
    });
  }

  const windowStart = windowClock(campaign.send_window_start);
  const windowEnd = windowClock(campaign.send_window_end);
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
  if (Number.isFinite(estimate) && estimate > 0) {
    milestones.push({
      key: 'eta', icon: TrendingUp, tone: 'muted', when: null,
      label: `Previsão de conclusão em até ${fmtDurationShort(estimate).replace(/^~/, '')}`,
    });
  }

  return milestones;
}

interface Props {
  campaign: TalkXCampaign;
  /** Fuso em edição na tela; sem ele vale o fuso salvo na campanha. */
  timezone?: string | null;
}

export function TalkXScheduleTimeline({ campaign, timezone }: Props) {
  const tz = timezone || campaign.schedule_timezone || DEFAULT_SCHEDULE_TIMEZONE;
  const milestones = buildScheduleMilestones(campaign, tz);

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
