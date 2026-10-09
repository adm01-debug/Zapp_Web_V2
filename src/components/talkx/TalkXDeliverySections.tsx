import React from 'react';
import { CalendarDays, Clock, Gauge, ShieldCheck, Smartphone, Sliders, Timer } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { IconTile, SPEED_PROFILES, TalkXWhatsAppDisconnectedState } from './talkxShared';
import { TALKX_TIMEZONES, talkxTimezoneLabel } from './talkxTimezones';
// X133 — as regras puras (horário comercial, velocidade do perfil, "leva N dias")
// ficam em `talkxDeliveryRules` para não misturar componentes e funções soltas
// neste módulo (Fast Refresh).
import {
  formatBusinessHours, businessHourDays, profileMessagesPerMinute, daysToDeliver,
} from './talkxDeliveryRules';
import type { TalkXBusinessHoursSetting } from './talkxDeliveryRules';

export type { TalkXBusinessHoursSetting } from './talkxDeliveryRules';

/**
 * X133 — seções de Entrega reutilizáveis (passo 3 do wizard e tela 10).
 *
 * O corpo destas seções vivia dentro de `TalkXWizardDelivery` preso ao objeto do
 * wizard; a tela 10 não conseguia usar nada. Aqui cada seção recebe VALOR + CALLBACKS,
 * então as duas telas usam a mesma regra (horário comercial real, velocidade do perfil,
 * fuso com rótulo) e a prova renderiza o componente real com props.
 */

export type SectionTone = 'blue' | 'green' | 'red' | 'violet' | 'amber';

export function SectionCard({ icon, color = 'blue', title, subtitle, right, children }: { icon: React.ElementType; color?: SectionTone; title: string; subtitle?: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card border border-border/70 p-4 md:p-5">
      <div className="flex items-center gap-3 mb-4">
        <IconTile icon={icon as never} color={color} size={40} />
        <div className="min-w-0 flex-1"><p className="text-[15px] font-bold text-foreground">{title}</p>{subtitle && <p className="text-xs text-foreground-secondary">{subtitle}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function OptionPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('h-10 px-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 transition-colors', active ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 bg-input/30 text-foreground-secondary hover:border-primary/40')}>
      <span className={cn('w-3.5 h-3.5 rounded-full border-2', active ? 'border-primary bg-primary shadow-[inset_0_0_0_2.5px_hsl(var(--card))]' : 'border-border')} />{label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Agendamento                                                         */
/* ------------------------------------------------------------------ */

export interface ScheduleSectionProps {
  scheduled: boolean;
  onScheduledChange: (scheduled: boolean) => void;
  /** Valor no formato local "YYYY-MM-DDTHH:mm", no fuso da campanha. */
  scheduledAt: string;
  onScheduledAtChange: (value: string) => void;
  /** Menor instante agendável no fuso da campanha ("YYYY-MM-DDTHH:mm"). */
  minimumScheduledAt?: string;
  timezone: string;
  onTimezoneChange: (timezone: string) => void;
  error?: string | null;
  statusLabel: string;
  statusTone?: 'success' | 'info';
}

export function ScheduleSection({
  scheduled, onScheduledChange, scheduledAt, onScheduledAtChange, minimumScheduledAt,
  timezone, onTimezoneChange, error, statusLabel, statusTone = 'info',
}: ScheduleSectionProps) {
  const [date = '', time = ''] = scheduledAt.split('T');
  const minDate = minimumScheduledAt?.slice(0, 10);

  // Manter data e hora em campos separados não pode zerar o outro lado: escolher
  // a data primeiro mantém a hora (ou 09:00 como padrão) e vice-versa.
  const changeDate = (nextDate: string) => onScheduledAtChange(nextDate ? `${nextDate}T${time || '09:00'}` : '');
  const changeTime = (nextTime: string) => {
    const baseDate = date || minDate || '';
    onScheduledAtChange(baseDate && nextTime ? `${baseDate}T${nextTime}` : '');
  };

  return (
    <SectionCard
      icon={CalendarDays}
      title="Configurações de agendamento"
      subtitle="Defina quando, como e em que condições a campanha será enviada."
    >
      <div className="flex flex-wrap gap-2 mb-4">
        <OptionPill active={!scheduled} label="Enviar ao lançar" onClick={() => onScheduledChange(false)} />
        <OptionPill active={scheduled} label="Agendar data e hora" onClick={() => onScheduledChange(true)} />
      </div>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-border/60 bg-input/20 px-3 py-2">
        <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <p className="text-2xs text-foreground-secondary" data-testid="talkx-schedule-status">
          <span className={cn('font-semibold', statusTone === 'success' ? 'text-dash-green' : 'text-primary-glow')}>{statusLabel}</span>
          {scheduled && ` · fuso ${talkxTimezoneLabel(timezone)}`}
        </p>
      </div>
      {scheduled && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-foreground-secondary">Data de início</Label>
            <Input type="date" value={date} min={minDate} onChange={(event) => changeDate(event.target.value)} aria-invalid={!!error} className="mt-1.5 h-10 bg-input/40 border-border/70" />
          </div>
          <div>
            <Label className="text-xs text-foreground-secondary">Horário de início</Label>
            <Input type="time" value={time} onChange={(event) => changeTime(event.target.value)} aria-invalid={!!error} className="mt-1.5 h-10 bg-input/40 border-border/70" />
          </div>
          <div>
            <Label className="text-xs text-foreground-secondary">Fuso horário</Label>
            <Select value={timezone} onValueChange={onTimezoneChange}>
              <SelectTrigger aria-label="Fuso horário" className="mt-1.5 h-10 bg-input/40 border-border/70"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TALKX_TIMEZONES.map((timezoneOption) => (
                  <SelectItem key={timezoneOption.value} value={timezoneOption.value}>{timezoneOption.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p role="alert" className="md:col-span-3 text-2xs text-dash-red">{error}</p>}
        </div>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Janela de envio + horário comercial                                 */
/* ------------------------------------------------------------------ */

export interface SendWindowSectionProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  timezone: string;
  businessHoursOnly: boolean;
  onBusinessHoursOnlyChange: (enabled: boolean) => void;
  /** Horário comercial REAL das configurações (`talkx_settings.business_hours`). */
  businessHours: TalkXBusinessHoursSetting;
}

export function SendWindowSection({
  enabled, onEnabledChange, start, end, onStartChange, onEndChange,
  timezone, businessHoursOnly, onBusinessHoursOnlyChange, businessHours,
}: SendWindowSectionProps) {
  return (
    <SectionCard
      icon={Clock}
      color="violet"
      title="Janela de envio"
      subtitle="Período do dia em que os envios podem ser realizados."
      right={<Switch checked={enabled} onCheckedChange={onEnabledChange} />}
    >
      <div className={cn('grid grid-cols-1 md:grid-cols-[1fr_1fr_1.4fr] gap-3', !enabled && 'opacity-50 pointer-events-none')}>
        <div><Label className="text-xs text-foreground-secondary">Início da janela</Label><Input type="time" value={start} onChange={(event) => onStartChange(event.target.value)} className="mt-1.5 h-10 bg-input/40 border-border/70" /></div>
        <div><Label className="text-xs text-foreground-secondary">Fim da janela</Label><Input type="time" value={end} onChange={(event) => onEndChange(event.target.value)} className="mt-1.5 h-10 bg-input/40 border-border/70" /></div>
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-primary-glow shrink-0 mt-0.5" />
          <div><p className="text-xs font-semibold text-foreground">Envios apenas neste período</p><p className="text-2xs text-foreground-secondary">Fora da janela, o envio pausa e retoma automaticamente no próximo início ({start}), no fuso {timezone}.</p></div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-input/20 p-3">
        <div className="flex items-center gap-3 min-w-0">
          <IconTile icon={CalendarDays as never} size={36} />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">Limitar por horário comercial</p>
            <p className="text-2xs text-foreground-secondary" data-testid="talkx-business-hours">
              {formatBusinessHours(businessHours)} no fuso {timezone}.
            </p>
            <p className="text-2xs text-muted-foreground" data-testid="talkx-send-days">Dias de envio: {businessHourDays(businessHours)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-xs font-semibold', businessHoursOnly ? 'text-dash-green' : 'text-muted-foreground')}>{businessHoursOnly ? 'Ativado' : 'Desativado'}</span>
          <Switch checked={businessHoursOnly} onCheckedChange={onBusinessHoursOnlyChange} />
        </div>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Throttle / Simulação humana                                         */
/* ------------------------------------------------------------------ */

export type TalkXSpeedProfile = 'slow' | 'moderate' | 'fast';

export interface ThrottleSectionProps {
  speedProfile: string;
  onSpeedProfileChange: (profile: TalkXSpeedProfile) => void;
  /** Público elegível — usado no "leva N dias" do limite diário da conexão. */
  audienceTotal?: number;
  /** `talkx_campaigns.max_per_minute` (limite por minuto da campanha). */
  campaignMaxPerMinute?: number | null;
  /** `number_reputation.daily_limit` da conexão escolhida. */
  connectionDailyLimit?: number | null;
  /** Sliders de digitação/intervalo — ficam em "Avançado". */
  advanced?: React.ReactNode;
}

export function ThrottleSection({ speedProfile, onSpeedProfileChange, audienceTotal = 0, campaignMaxPerMinute, connectionDailyLimit, advanced }: ThrottleSectionProps) {
  const activeProfile = SPEED_PROFILES.find((candidate) => candidate.value === speedProfile) ?? SPEED_PROFILES[1];
  const perMinute = profileMessagesPerMinute(activeProfile.value);
  const days = daysToDeliver(audienceTotal, connectionDailyLimit);
  return (
    <SectionCard icon={Gauge} color="green" title="Throttle / Simulação humana" subtitle="Controla a velocidade de envio para um comportamento mais natural.">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-4">
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-foreground-secondary">Velocidade de envio</Label>
            <div className="flex flex-col gap-2 mt-1.5">
              {SPEED_PROFILES.map((profile) => (
                <OptionPill
                  key={profile.value}
                  active={activeProfile.value === profile.value}
                  label={`${profile.label} · ${profile.interval[0]}–${profile.interval[1]}s entre mensagens`}
                  onClick={() => onSpeedProfileChange(profile.value)}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-4 rounded-xl border border-border/60 bg-input/20 p-4">
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 flex items-start gap-2.5">
            <Sliders className="w-4 h-4 text-primary-glow shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-foreground">Simulação humana ativa</p>
              <p className="text-2xs text-foreground-secondary" data-testid="talkx-throttle-interval">
                Intervalo de {activeProfile.interval[0]}s a {activeProfile.interval[1]}s · ~{perMinute} mensagens/min
              </p>
            </div>
          </div>
          <div className="space-y-1.5 text-2xs text-foreground-secondary">
            <p className="flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" /> Limite por minuto da campanha: <span className="font-semibold text-foreground" data-testid="talkx-campaign-limit">{campaignMaxPerMinute ? `${campaignMaxPerMinute}/min` : 'sem limite definido'}</span></p>
            <p className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Limite diário da conexão: <span className="font-semibold text-foreground" data-testid="talkx-connection-daily-limit">{connectionDailyLimit ? `${connectionDailyLimit}/dia` : 'sem limite definido'}</span>{days ? ` · leva ${days} ${days === 1 ? 'dia' : 'dias'}` : ''}</p>
          </div>
          {advanced && (
            <details className="rounded-lg border border-border/60 bg-card/40 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-foreground">Avançado</summary>
              <div className="mt-3 space-y-3">{advanced}</div>
            </details>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

/** Sliders de digitação/intervalo — o corpo de "Avançado" do throttle. */
export function AdvancedThrottleSliders({ typingDelay, sendInterval, onTypingDelayChange, onSendIntervalChange }: {
  typingDelay: [number, number];
  sendInterval: [number, number];
  onTypingDelayChange: (value: number[]) => void;
  onSendIntervalChange: (value: number[]) => void;
}) {
  return (
    <>
      <div>
        <div className="flex justify-between mb-2"><Label className="text-xs text-foreground-secondary">Tempo "digitando…"</Label><span className="text-2xs font-mono text-foreground">{typingDelay[0]}s – {typingDelay[1]}s</span></div>
        <Slider value={typingDelay} onValueChange={onTypingDelayChange} min={0.5} max={10} step={0.5} />
      </div>
      <div>
        <div className="flex justify-between mb-2"><Label className="text-xs text-foreground-secondary">Intervalo entre envios</Label><span className="text-2xs font-mono text-foreground">{sendInterval[0]}s – {sendInterval[1]}s</span></div>
        <Slider value={sendInterval} onValueChange={onSendIntervalChange} min={3} max={60} step={1} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Confirmação e supressão                                            */
/* ------------------------------------------------------------------ */

export function SuppressionSection({ respectSuppression, onRespectSuppressionChange, suppressedCount }: {
  respectSuppression: boolean;
  onRespectSuppressionChange: (value: boolean) => void;
  suppressedCount: number;
}) {
  return (
    <SectionCard icon={ShieldCheck} color="amber" title="Confirmação e supressão" subtitle="Evita o envio para contatos que não devem receber.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-input/20 p-3 cursor-pointer">
          <Checkbox checked={respectSuppression} onCheckedChange={(value) => onRespectSuppressionChange(!!value)} className="mt-0.5" />
          <div><p className="text-[13px] font-medium text-foreground">Não enviar para contatos em lista de supressão</p><p className="text-2xs text-foreground-secondary">Opt-outs, bloqueios manuais e LGPD são removidos do público{suppressedCount > 0 ? ` (${suppressedCount} no público atual)` : ''}.</p></div>
        </label>
        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-input/20 p-3">
          <Checkbox checked disabled className="mt-0.5" />
          <div><p className="text-[13px] font-medium text-foreground">Respeitar opt-outs e bloqueados no envio</p><p className="text-2xs text-foreground-secondary">O motor de envio sempre pula contatos suprimidos, mesmo os adicionados após o agendamento.</p></div>
        </div>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* Conexão WhatsApp (passo Entrega — X133)                             */
/* ------------------------------------------------------------------ */

export interface DeliveryConnectionOption {
  id: string;
  name: string;
  phone_number?: string | null;
}

export function ConnectionSection({ connections, connectionId, onConnectionChange, onConnect }: {
  connections: DeliveryConnectionOption[];
  connectionId: string;
  onConnectionChange: (connectionId: string) => void;
  onConnect: () => void;
}) {
  if (connections.length === 0) {
    return <TalkXWhatsAppDisconnectedState onConnect={onConnect} />;
  }
  const selected = connections.find((connection) => connection.id === connectionId);
  return (
    <SectionCard icon={Smartphone} color="green" title="Conexão WhatsApp" subtitle="Linha que fará os envios desta campanha.">
      <Select value={connectionId} onValueChange={onConnectionChange}>
        <SelectTrigger aria-label="Conexão WhatsApp" className="h-10 bg-input/40 border-border/70"><SelectValue placeholder="Selecione…" /></SelectTrigger>
        <SelectContent>
          {connections.map((connection) => (
            <SelectItem key={connection.id} value={connection.id}>{connection.name} ({connection.phone_number || 'sem número'})</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className={cn('mt-2 text-2xs', selected ? 'text-dash-green' : 'text-foreground-secondary')} data-testid="talkx-connection-state">
        {selected ? `${selected.name} · conectada e pronta` : 'Selecione uma conexão ativa para enviar.'}
      </p>
    </SectionCard>
  );
}
