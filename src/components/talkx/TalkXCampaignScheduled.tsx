import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  CalendarDays, Clock, ArrowLeft, Play, XCircle, Pencil, Save,
  Users, MessageSquare, Zap, Send, ShieldCheck, Timer, CheckCircle2, Gauge,
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GhostButton, PrimaryButton } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { IconTile, RailCard, MetaRow, PhoneFrame, fmtDateTime, fmtInt, SPEED_PROFILES } from './talkxShared';
import { TalkXEmptyState, TalkXQueryBoundary, TalkXSkeletonRows } from './kit/states';
import { DEFAULT_SCHEDULE_TIMEZONE, localToUTCInTimezone, utcToLocalInTimezone } from './useCampaignEditor';
import { intervalForProfile } from './talkxLimits';
import { TalkXLifecycleDialog, useTalkXLifecycle } from './useTalkXLifecycle';
import { useTalkX, type TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { toast } from 'sonner';

const TIMEZONES = [
  ['America/Sao_Paulo', 'America/São Paulo'],
  ['America/Manaus', 'America/Manaus'],
  ['America/Belem', 'America/Belém'],
  ['America/Fortaleza', 'America/Fortaleza'],
  ['America/Recife', 'America/Recife'],
  ['America/Cuiaba', 'America/Cuiabá'],
  ['America/Porto_Velho', 'America/Porto Velho'],
  ['America/Rio_Branco', 'America/Rio Branco'],
  ['America/New_York', 'America/New York'],
  ['America/Chicago', 'America/Chicago'],
  ['America/Los_Angeles', 'America/Los Angeles'],
  ['America/Buenos_Aires', 'America/Buenos Aires'],
  ['America/Santiago', 'America/Santiago'],
  ['America/Bogota', 'America/Bogotá'],
  ['America/Lima', 'America/Lima'],
  ['Europe/London', 'Europe/London'],
  ['Europe/Lisbon', 'Europe/Lisboa'],
  ['UTC', 'UTC'],
] as const;

interface Props {
  campaignId: string; // P1: recebe ID, deriva da query -- evita stale
  onBack: () => void;
  onEdit: (c: TalkXCampaign) => void;
  onStatusChange: (campaign: TalkXCampaign) => void;
}

export function TalkXCampaignScheduled({ campaignId, onBack, onEdit, onStatusChange }: Props) {
  const { campaigns, isLoading, isError, error, isFetching, refetchCampaigns } = useTalkX();
  // P1: deriva sempre da query -- nunca stale
  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;

  // Não confunda uma campanha cancelada com uma campanha em execução: cada
  // estado possui um destino de navegação próprio no contêiner pai.
  useEffect(() => {
    if (campaign && campaign.status !== 'scheduled') onStatusChange(campaign);
  }, [campaign, onStatusChange]);

  // X047: erro e vazio deixam de ser decididos à mão aqui (antes a lista vazia
  // no erro virava `return null`, uma tela em branco). O boundary decide na
  // ordem carregando -> erro -> vazio -> conteúdo, com o erro vencendo o vazio,
  // e o retry refaz a consulta mantendo esta campanha aberta.
  return (
    <TalkXQueryBoundary
      query={{ isLoading, isFetching, isError, error }}
      entity="campanhas agendadas"
      onRetry={() => { void refetchCampaigns(); }}
      skeleton={<TalkXSkeletonRows rows={3} variant="cards" />}
      isEmpty={!campaign}
      empty={(
        <TalkXEmptyState
          title="Campanha agendada não encontrada"
          description="Ela pode ter sido cancelada ou enviada. Volte para a lista de campanhas e abra novamente."
        />
      )}
    >
      {/* Montar o editor somente depois de localizar a campanha permite derivar
          o estado inicial sem um efeito que sobrescreva alterações ainda não
          salvas pelo operador. */}
      {campaign && (
        <TalkXCampaignScheduledEditor
          key={campaign.id}
          campaign={campaign}
          onBack={onBack}
          onEdit={onEdit}
        />
      )}
    </TalkXQueryBoundary>
  );
}

interface ScheduledEditorProps {
  campaign: TalkXCampaign;
  onBack: () => void;
  onEdit: (campaign: TalkXCampaign) => void;
}

/**
 * X137: o piso da data vinha de `new Date().toISOString()`, ou seja, do relógio
 * em UTC — num fuso a oeste o operador podia escolher um dia que já passou na
 * campanha (e vice-versa). O piso passa a ser "hoje" no fuso da campanha,
 * medido pelo mesmo conversor usado ao salvar.
 */
function todayInTimezone(tz: string): string {
  try {
    return utcToLocalInTimezone(new Date().toISOString(), tz).slice(0, 10);
  } catch {
    return '';
  }
}

/** X137: intervalo real do perfil, em segundos, como o motor o aplica. */
function fmtIntervalRange(intervalMs: [number, number]): string {
  return `${Math.round(intervalMs[0] / 1000)}–${Math.round(intervalMs[1] / 1000)}s`;
}

function TalkXCampaignScheduledEditor({ campaign, onBack, onEdit }: ScheduledEditorProps) {
  const { updateCampaign } = useTalkX();
  // X051: o disparo ("Iniciar agora") sai dos handlers próprios e passa pelo
  // controlador único do ciclo de vida. O "Cancelar agendamento" (devolve a
  // campanha para Rascunhos) NÃO passa por aqui: o hook não expõe essa ação —
  // seguirá no fluxo local até o hook ganhar a ação (ver relato).
  const lifecycle = useTalkXLifecycle();
  const initialTimezone = campaign.schedule_timezone || DEFAULT_SCHEDULE_TIMEZONE;
  // X137: data e horário deixam de ser um único `datetime-local`. O instante
  // gravado é convertido para a parede local do fuso da campanha e separado em
  // dois campos — o que o operador vê é o que ele edita.
  const [localTz, setLocalTz] = useState<string>(initialTimezone);
  const [localDate, setLocalDate] = useState<string>(() => (
    campaign.scheduled_at ? utcToLocalInTimezone(campaign.scheduled_at, initialTimezone).split('T')[0] ?? '' : ''
  ));
  const [localTime, setLocalTime] = useState<string>(() => (
    campaign.scheduled_at ? utcToLocalInTimezone(campaign.scheduled_at, initialTimezone).split('T')[1] ?? '09:00' : '09:00'
  ));
  const [windowEnabled, setWindowEnabled] = useState<boolean>(!!campaign.send_window_start);
  const [windowStart, setWindowStart] = useState<string>(campaign.send_window_start?.slice(0, 5) ?? '08:00');
  const [windowEnd, setWindowEnd] = useState<string>(campaign.send_window_end?.slice(0, 5) ?? '18:00');
  const [bizHours, setBizHours] = useState<boolean>(campaign.business_hours_only ?? false);
  const [speedProfile, setSpeedProfile] = useState<'slow' | 'moderate' | 'fast'>(campaign.speed_profile ?? 'moderate');
  const [sendInterval, setSendInterval] = useState<[number, number]>(() => {
    const fallback = intervalForProfile(campaign.speed_profile ?? 'moderate');
    return [campaign.send_interval_min ?? fallback[0], campaign.send_interval_max ?? fallback[1]];
  });
  // A supressão é sempre aplicada neste envio (o banco é quem libera); a tela
  // apenas a exibe travada e a reenvia no payload.
  const respectSuppression = campaign.respect_suppression ?? true;
  const [confirmConsent, setConfirmConsent] = useState<boolean>(campaign.confirm_consent ?? false);
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const minimumDate = todayInTimezone(localTz);

  const messagesPerMinute = useMemo(() => {
    const avg = ((campaign.typing_delay_min + campaign.typing_delay_max) / 2 + (sendInterval[0] + sendInterval[1]) / 2) / 1000;
    return avg > 0 ? Math.round((60 / avg) * 10) / 10 : 0;
  }, [campaign.typing_delay_min, campaign.typing_delay_max, sendInterval]);

  const handleTimezoneChange = useCallback((nextTimezone: string) => {
    setLocalTz(nextTimezone);
    if (!localDate || !localTime) return;
    try {
      // Preserva o INSTANTE: mudar o fuso não pode "andar" o horário agendado.
      const nextLocal = utcToLocalInTimezone(localToUTCInTimezone(`${localDate}T${localTime}`, localTz), nextTimezone);
      const [nextDay, nextClock] = nextLocal.split('T');
      if (nextDay && nextClock) {
        setLocalDate(nextDay);
        setLocalTime(nextClock);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar o fuso horário.');
    }
  }, [localDate, localTime, localTz]);

  const handleSpeedProfileChange = useCallback((next: string) => {
    const profile = next as 'slow' | 'moderate' | 'fast';
    setSpeedProfile(profile);
    // O intervalo acompanha o perfil (é o valor que o motor usa); o cartão
    // abaixo mostra exatamente esse par, não um número fixo.
    setSendInterval(intervalForProfile(profile));
  }, []);

  const calDate = localDate ? new Date(`${localDate}T00:00:00`) : undefined;

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!localDate || !localTime) { toast.error('Defina a data e o horário do agendamento.'); return; }
    if (windowEnabled && windowStart >= windowEnd) {
      toast.error('O fim da janela de envio deve ser posterior ao início.');
      return;
    }
    setSaving(true);
    try {
      const scheduledAt = localToUTCInTimezone(`${localDate}T${localTime}`, localTz);
      if (new Date(scheduledAt).getTime() <= Date.now()) {
        throw new Error('O agendamento deve estar no futuro no fuso selecionado.');
      }
      await updateCampaign.mutateAsync({
        id: campaign.id,
        scheduled_at: scheduledAt,
        schedule_timezone: localTz,
        send_window_start: windowEnabled ? `${windowStart}:00` : null,
        send_window_end: windowEnabled ? `${windowEnd}:00` : null,
        business_hours_only: bizHours,
        speed_profile: speedProfile,
        send_interval_min: sendInterval[0],
        send_interval_max: sendInterval[1],
        respect_suppression: respectSuppression,
        confirm_consent: confirmConsent,
      });
      toast.success('Agendamento atualizado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar agendamento.');
    } finally {
      setSaving(false);
    }
  }, [campaign, localDate, localTime, localTz, windowEnabled, windowStart, windowEnd, bizHours, speedProfile, sendInterval, respectSuppression, confirmConsent, updateCampaign, saving]);

  const handleCancelSchedule = useCallback(async () => {
    setCancelOpen(false);
    try {
      await updateCampaign.mutateAsync({ id: campaign.id, scheduled_at: null, status: 'draft' });
      toast.info('Agendamento cancelado. Campanha voltou para Rascunhos.');
      onBack();
    } catch {
      toast.error('Erro ao cancelar agendamento.');
    }
  }, [campaign, updateCampaign, onBack]);

  const scheduledLabel = campaign?.scheduled_at
    ? fmtDateTime(campaign.scheduled_at)
    : localDate && localTime ? fmtDateTime(localToUTCInTimezone(`${localDate}T${localTime}`, localTz)) : '—';

  return (
    <div className="min-h-full bg-background p-3 md:p-4 lg:p-6 space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-9 px-3 rounded-lg border border-border/70 bg-input/40 flex items-center gap-1.5 text-xs font-medium text-foreground-secondary hover:bg-muted/50"
        >
          <ArrowLeft className="w-4 h-4" />Voltar às campanhas
        </button>
        <span className="text-2xs text-muted-foreground hidden sm:inline">
          Campanhas / <span className="text-foreground">{campaign.name}</span>
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <IconTile icon={CalendarDays as never} size={40} className="bg-success/15 border-success/30 text-success" />
          <div>
            <p className="text-[13px] font-semibold text-foreground">Talk X · Agendamento de campanha</p>
            <p className="text-2xs text-muted-foreground">{campaign.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GhostButton icon={Pencil} onClick={() => onEdit(campaign)}>Editar no wizard</GhostButton>
          <PrimaryButton icon={Save} onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : 'Salvar agendamento'}</PrimaryButton>
        </div>
      </div>

      {/* Status pill */}
      <div className="rounded-xl border border-success/30 bg-success/8 px-4 py-3 flex items-center gap-3">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        <p className="text-[13px] text-foreground">
          <span className="font-semibold text-success">Agendada para {scheduledLabel}</span>
          {' '}— Campanha pronta para ser enviada.
        </p>
      </div>

      {/* 3 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Col 1 — Configurações de Agendamento */}
        <RailCard title="Configurações de Agendamento" icon={Clock}>
          <div className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="talkx-schedule-date" className="text-2xs text-muted-foreground mb-1.5 block">Data de início</Label>
                <Input
                  id="talkx-schedule-date"
                  type="date"
                  value={localDate}
                  min={minimumDate}
                  onChange={(e) => setLocalDate(e.target.value)}
                  className="h-10 bg-input/40 border-border/70 text-[13px]"
                />
              </div>
              <div>
                <Label htmlFor="talkx-schedule-time" className="text-2xs text-muted-foreground mb-1.5 block">Horário de início</Label>
                <Input
                  id="talkx-schedule-time"
                  type="time"
                  value={localTime}
                  onChange={(e) => setLocalTime(e.target.value)}
                  className="h-10 bg-input/40 border-border/70 text-[13px]"
                />
              </div>
            </div>
            <p className="text-2xs text-muted-foreground">Data e horário no fuso {localTz}.</p>

            <div>
              <Label className="text-2xs text-muted-foreground mb-1.5 block">Fuso horário</Label>
              <Select value={localTz} onValueChange={handleTimezoneChange}>
                <SelectTrigger className="h-10 bg-input/40 border-border/70 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(([tz, label]) => (
                    <SelectItem key={tz} value={tz}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">Janela de envio</p>
                <p className="text-2xs text-muted-foreground">Envia somente neste intervalo</p>
              </div>
              <Switch aria-label="Janela de envio" checked={windowEnabled} onCheckedChange={setWindowEnabled} />
            </div>

            {windowEnabled && (
              <div className="space-y-3 pl-2 border-l-2 border-border/50">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="talkx-window-start" className="text-2xs text-muted-foreground mb-1 block">Início</Label>
                    <Input id="talkx-window-start" type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="h-9 bg-input/40 border-border/70 text-[13px]" />
                  </div>
                  <div>
                    <Label htmlFor="talkx-window-end" className="text-2xs text-muted-foreground mb-1 block">Fim</Label>
                    <Input id="talkx-window-end" type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="h-9 bg-input/40 border-border/70 text-[13px]" />
                  </div>
                </div>
                <div className="rounded-xl border border-primary/30 bg-primary/8 p-3 flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-primary">Envios apenas neste período</p>
                    <p className="text-2xs text-muted-foreground">
                      Fora da janela, o envio pausa e retoma automaticamente no próximo início ({windowStart}), no fuso {localTz}.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-input/20 p-3">
              <div className="flex items-center gap-3">
                <IconTile icon={CalendarDays as never} size={36} />
                <div>
                  <p className="text-[13px] font-semibold text-foreground">Limitar por horário comercial</p>
                  <p className="text-2xs text-muted-foreground">Seg–Sex, 08:00–18:00 no fuso {localTz}.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('text-xs font-semibold', bizHours ? 'text-success' : 'text-muted-foreground')}>
                  {bizHours ? 'Ativado' : 'Desativado'}
                </span>
                <Switch aria-label="Limitar por horário comercial" checked={bizHours} onCheckedChange={setBizHours} />
              </div>
            </div>

            {/* Throttle / Simulação humana — o intervalo do cartão é o valor real
                do perfil escolhido (ms no banco), não um texto fixo. */}
            <div className="rounded-xl border border-border/60 bg-input/20 p-3 space-y-3">
              <div className="flex items-center gap-3">
                <IconTile icon={Gauge as never} color="green" size={36} />
                <div>
                  <p className="text-[13px] font-semibold text-foreground">Throttle / Simulação humana</p>
                  <p className="text-2xs text-muted-foreground">Velocidade de envio e intervalo entre mensagens.</p>
                </div>
              </div>
              <div>
                <Label htmlFor="talkx-speed-profile" className="text-2xs text-muted-foreground mb-1.5 block">Velocidade de envio</Label>
                <Select value={speedProfile} onValueChange={handleSpeedProfileChange}>
                  <SelectTrigger id="talkx-speed-profile" className="h-9 bg-input/40 border-border/70 text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPEED_PROFILES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border border-border/50 bg-card/50 p-2.5">
                <p className="text-2xs text-muted-foreground">Intervalo do perfil selecionado</p>
                <p className="text-[13px] font-semibold text-foreground">
                  {fmtIntervalRange(sendInterval)} entre mensagens · ~{messagesPerMinute} msgs/min
                </p>
              </div>
            </div>

            {/* Confirmação e supressão */}
            <div className="rounded-xl border border-border/60 bg-input/20 p-3 space-y-2.5">
              <div className="flex items-center gap-3">
                <IconTile icon={ShieldCheck as never} color="violet" size={36} />
                <div>
                  <p className="text-[13px] font-semibold text-foreground">Confirmação e supressão</p>
                  <p className="text-2xs text-muted-foreground">Proteções aplicadas no lançamento.</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Checkbox id="talkx-respect-suppression" checked={respectSuppression} disabled className="mt-0.5" />
                <Label htmlFor="talkx-respect-suppression" className="text-xs font-normal text-foreground leading-snug">
                  Respeitar a lista de supressão
                  <span className="block text-2xs text-muted-foreground">
                    Aplicada automaticamente neste envio; desmarcar exige liberação no banco.
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id="talkx-confirm-consent"
                  checked={confirmConsent}
                  onCheckedChange={(v) => setConfirmConsent(!!v)}
                  className="mt-0.5"
                />
                <Label htmlFor="talkx-confirm-consent" className="text-xs font-normal text-foreground leading-snug">
                  Confirmo que possuo o consentimento dos contatos
                  <span className="block text-2xs text-muted-foreground">
                    Sem esta confirmação a campanha não é lançada.
                  </span>
                </Label>
              </div>
            </div>
          </div>
        </RailCard>

        {/* Col 2 — Calendário + Resumo */}
        <RailCard title="Selecionar Data" icon={CalendarDays}>
          <div className="flex flex-col gap-3">
            <Calendar
              mode="single"
              selected={calDate}
              onSelect={(d) => {
                if (!d) return;
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                setLocalDate(`${y}-${m}-${day}`);
              }}
              className="rounded-lg border border-border/60 bg-card/50 mx-auto"
            />
            <div className="rounded-lg border border-border/60 bg-card/50 p-3 space-y-2">
              <p className="text-2xs font-semibold text-foreground-secondary uppercase tracking-wide">Resumo da Programação</p>
              <div className="space-y-1.5">
                <MetaRow icon={CalendarDays} label="Data" value={calDate ? calDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : '—'} />
                <MetaRow icon={Clock} label="Hora" value={localTime || '—'} />
                <MetaRow icon={Timer} label="Fuso" value={localTz} />
                {windowEnabled && <MetaRow icon={ShieldCheck} label="Janela" value={`${windowStart} – ${windowEnd}`} />}
                <MetaRow icon={Users} label="Destinatários" value={`${fmtInt(campaign.total_recipients)} contatos`} />
              </div>
            </div>
          </div>
        </RailCard>

        {/* Col 3 — Resumo da Campanha */}
        <RailCard title="Resumo da Campanha" icon={Zap}>
          <div className="space-y-3">
            {campaign.media_url ? (
              <div className="h-20 rounded-lg overflow-hidden border border-border/60">
                {(campaign.media_type ?? '').startsWith('image') ? (
                  <img src={campaign.media_url} alt="banner" className="w-full h-full object-cover" />
                ) : (
                  <div className="h-full bg-gradient-to-br from-primary/20 to-success/20 flex items-center justify-center">
                    <Send className="w-6 h-6 text-primary/60" />
                  </div>
                )}
              </div>
            ) : (
              <div className="h-16 rounded-lg bg-gradient-to-br from-primary/10 to-success/10 border border-border/40 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary/40" />
              </div>
            )}
            <div className="space-y-1.5">
              <MetaRow icon={Zap} label="Campanha" value={campaign.name} />
              <MetaRow icon={Users} label="Público" value={`${fmtInt(campaign.total_recipients)} contatos`} />
              <MetaRow icon={Send} label="Canal" value={campaign.whatsapp_connection_id ? 'Linha WhatsApp conectada' : 'Sem linha'} />
              <MetaRow icon={Timer} label="Velocidade" value={{ slow: 'Lenta', moderate: 'Moderada', fast: 'Rápida' }[speedProfile]} />
            </div>
            {campaign.message_template && (
              <div>
                <p className="text-2xs text-muted-foreground mb-1.5 font-medium">Mensagem</p>
                <PhoneFrame
                  text={campaign.message_template.slice(0, 120) + (campaign.message_template.length > 120 ? '…' : '')}
                  mediaUrl={campaign.media_url ?? null}
                  mediaType={campaign.media_type ?? null}
                />
              </div>
            )}
            <div className="rounded-xl border border-primary/30 bg-primary/8 px-3 py-2.5 flex items-start gap-2.5">
              <MessageSquare className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-primary">Tudo pronto para o envio!</p>
                <p className="text-2xs text-muted-foreground">Aguardando {scheduledLabel}.</p>
              </div>
            </div>
          </div>
        </RailCard>

      </div>

      {/* Ações inferiores */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <GhostButton icon={XCircle} onClick={() => setCancelOpen(true)} className="text-destructive hover:bg-destructive/10 border-destructive/30">
          Cancelar agendamento
        </GhostButton>
        <PrimaryButton icon={Play} onClick={() => { lifecycle.request({ kind: 'start', target: campaign }); }} className="shadow-[var(--shadow-glow-primary)]">
          {lifecycle.isPending ? 'Iniciando…' : 'Iniciar agora'}
        </PrimaryButton>
      </div>

      {/* X051 (parcial): o "Cancelar agendamento" segue local porque o hook
          único não expõe a ação de devolver a campanha para Rascunhos
          (`scheduled_at = null`, `status = 'draft'`). */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              A campanha voltará para Rascunhos. Você pode reagendar ou editar a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter agendamento</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelSchedule} className="bg-destructive hover:bg-destructive/90">
              Cancelar agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* X051: diálogo único do ciclo de vida — o disparo não tem mais modal próprio. */}
      <TalkXLifecycleDialog controller={lifecycle} />
    </div>
  );
}
