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
import { GhostButton, PrimaryButton } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import {
  IconTile, RailCard, MetaRow, fmtDateTime, fmtInt, WhatsAppBubble, TalkXConfirmDialog, SPEED_PROFILES,
} from './talkxShared';
import { TalkXEmptyState, TalkXQueryBoundary, TalkXSkeletonRows } from './kit/states';
import { DEFAULT_SCHEDULE_TIMEZONE, localToUTCInTimezone, utcToLocalInTimezone } from './useCampaignEditor';
import { intervalForProfile } from './talkxLimits';
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
 * X137: o mínimo do campo de data vinha de `new Date().toISOString()`, ou seja,
 * do relógio em UTC — num fuso a oeste o operador podia escolher um dia que já
 * passou na campanha (e vice-versa). O piso passa a ser "hoje" no fuso da
 * campanha, medido pelo mesmo conversor usado ao salvar.
 */
function todayInTimezone(tz: string): string {
  try {
    return utcToLocalInTimezone(new Date().toISOString(), tz).slice(0, 10);
  } catch {
    return '';
  }
}

/** X137: intervalo real do perfil, em segundos, como o banco o define (ms). */
function fmtIntervalRange(intervalMs: [number, number]): string {
  return `${Math.round(intervalMs[0] / 1000)}–${Math.round(intervalMs[1] / 1000)}s`;
}

function TalkXCampaignScheduledEditor({ campaign, onBack, onEdit }: ScheduledEditorProps) {
  const { updateCampaign, saveDraftCampaign, startCampaign } = useTalkX();
  const initialTimezone = campaign.schedule_timezone || DEFAULT_SCHEDULE_TIMEZONE;
  // X137: data e horário deixam de ser um único `datetime-local`. O instante
  // gravado é convertido uma vez para a parede local do fuso da campanha e
  // separado em dois campos — o que o operador vê é o que ele edita.
  const initialLocal = campaign.scheduled_at ? utcToLocalInTimezone(campaign.scheduled_at, initialTimezone) : '';
  const [localTz, setLocalTz] = useState<string>(initialTimezone);
  const [localDate, setLocalDate] = useState<string>(initialLocal.split('T')[0] ?? '');
  const [localTime, setLocalTime] = useState<string>(initialLocal.split('T')[1] ?? '09:00');
  const [windowEnabled, setWindowEnabled] = useState<boolean>(!!campaign.send_window_start);
  const [windowStart, setWindowStart] = useState<string>(campaign.send_window_start?.slice(0, 5) ?? '08:00');
  const [windowEnd, setWindowEnd] = useState<string>(campaign.send_window_end?.slice(0, 5) ?? '18:00');
  const [bizHours, setBizHours] = useState<boolean>(campaign.business_hours_only ?? false);
  const [speedProfile, setSpeedProfile] = useState<'slow' | 'moderate' | 'fast'>(campaign.speed_profile ?? 'moderate');
  const [sendInterval, setSendInterval] = useState<[number, number]>(() => {
    const fallback = intervalForProfile(campaign.speed_profile ?? 'moderate');
    return [
      campaign.send_interval_min ?? fallback[0],
      campaign.send_interval_max ?? fallback[1],
    ];
  });
  const [respectSuppression, setRespectSuppression] = useState<boolean>(campaign.respect_suppression ?? true);
  const [confirmConsent, setConfirmConsent] = useState<boolean>(campaign.confirm_consent ?? false);
  const [revisionConflict, setRevisionConflict] = useState(false);
  // Revisão usada no save otimista: começa na linha lida e passa a ser a que o
  // banco devolveu — sem isso um segundo clique mandaria a revisão antiga e
  // receberia "conflito" contra a própria gravação que acabou de acontecer.
  const [revision, setRevision] = useState<number>(campaign.revision ?? 1);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);

  const minimumDate = todayInTimezone(localTz);

  const messagesPerMinute = useMemo(() => {
    const avg = ((campaign.typing_delay_min + campaign.typing_delay_max) / 2 + (sendInterval[0] + sendInterval[1]) / 2) / 1000;
    return avg > 0 ? Math.round((60 / avg) * 10) / 10 : 0;
  }, [campaign.typing_delay_min, campaign.typing_delay_max, sendInterval]);

  function handleTimezoneChange(nextTimezone: string) {
    if (!localDate || !localTime) {
      setLocalTz(nextTimezone);
      return;
    }
    try {
      // Preserva o INSTANTE: mudar o fuso não pode "andar" o horário agendado.
      const nextLocal = utcToLocalInTimezone(localToUTCInTimezone(`${localDate}T${localTime}`, localTz), nextTimezone);
      setLocalDate(nextLocal.split('T')[0] ?? '');
      setLocalTime(nextLocal.split('T')[1] ?? localTime);
      setLocalTz(nextTimezone);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar o fuso horário.');
    }
  }

  function handleSpeedProfileChange(next: string) {
    const profile = next as 'slow' | 'moderate' | 'fast';
    setSpeedProfile(profile);
    // O intervalo acompanha o perfil (é o valor que o motor usa); o cartão
    // abaixo mostra exatamente esse par, não um número fixo.
    setSendInterval(intervalForProfile(profile));
  }

  const calDate = localDate ? new Date(`${localDate}T00:00:00`) : undefined;

  /**
   * X137: o save deixa de ser um UPDATE parcial direto. A RPC
   * `save_talkx_campaign_draft` grava a linha inteira a partir do payload e
   * exige a revisão corrente — por isso o payload carrega TODOS os campos da
   * campanha (os que a tela não edita vão com o valor já gravado, senão os
   * DEFAULTs da RPC apagariam mensagem, público e limites).
   */
  const buildPayload = useCallback((scheduledAt: string): Partial<TalkXCampaign> => ({
    name: campaign.name,
    description: campaign.description ?? null,
    objective: campaign.objective,
    message_template: campaign.message_template,
    audience_source: campaign.audience_source,
    audience_filters: campaign.audience_filters ?? {},
    segment_id: campaign.segment_id ?? null,
    template_id: campaign.template_id ?? null,
    template_version_id: campaign.template_version_id ?? null,
    whatsapp_connection_id: campaign.whatsapp_connection_id ?? null,
    owner: campaign.owner ?? null,
    media_url: campaign.media_url ?? null,
    media_type: campaign.media_type ?? null,
    typing_delay_min: campaign.typing_delay_min,
    typing_delay_max: campaign.typing_delay_max,
    send_interval_min: sendInterval[0],
    send_interval_max: sendInterval[1],
    speed_profile: speedProfile,
    scheduled_at: scheduledAt,
    schedule_timezone: localTz,
    send_window_start: windowEnabled ? `${windowStart}:00` : null,
    send_window_end: windowEnabled ? `${windowEnd}:00` : null,
    business_hours_only: bizHours,
    respect_suppression: respectSuppression,
    confirm_consent: confirmConsent,
    // X137: a campanha agendada volta pela tela 10; deixar o passo em 3 (entrega)
    // faz o "Editar no wizard" reabrir exatamente a coluna que foi ajustada aqui.
    draft_step: 3,
  }), [campaign, sendInterval, speedProfile, localTz, windowEnabled, windowStart, windowEnd, bizHours, respectSuppression, confirmConsent]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!localDate || !localTime) { toast.error('Defina a data e o horário do agendamento.'); return; }
    if (windowEnabled && windowStart >= windowEnd) {
      toast.error('O fim da janela de envio deve ser posterior ao início.');
      return;
    }
    let scheduledAt: string;
    try {
      scheduledAt = localToUTCInTimezone(`${localDate}T${localTime}`, localTz);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'O horário escolhido não existe no fuso selecionado.');
      return;
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      toast.error('O agendamento deve estar no futuro no fuso selecionado.');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveDraftCampaign.mutateAsync({
        campaignId: campaign.id,
        expectedRevision: revision,
        creationKey: null,
        payload: buildPayload(scheduledAt),
      });
      setRevision(saved.revision);
      setRevisionConflict(false);
      toast.success('Agendamento atualizado.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/stale_revision/i.test(message)) {
        // Conflito de revisão: a tela está velha. Não anuncie sucesso nem
        // repita o save por cima da alteração que chegou primeiro.
        setRevisionConflict(true);
        toast.error('A campanha mudou desde que esta tela foi aberta. Recarregue antes de salvar.');
      } else {
        toast.error(error instanceof Error ? error.message : 'Erro ao salvar agendamento.');
      }
    } finally {
      setSaving(false);
    }
  }, [campaign, revision, localDate, localTime, localTz, windowEnabled, windowStart, windowEnd, buildPayload, saveDraftCampaign, saving]);

  const handleLaunch = useCallback(() => {
    setLaunchOpen(false);
    setLaunching(true);
    // P2: fire-and-forget -- talkx-send bloqueia ate o loop completo;
    // a navegacao ocorre via useEffect quando status mudar para 'sending'
    void startCampaign(campaign.id).finally(() => setLaunching(false));
  }, [campaign, startCampaign]);

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

      {/* X137: a revisão mudou em outro lugar. Salvar por cima apagaria essa
          alteração, então a tela avisa e espera recarregar. */}
      {revisionConflict && (
        <div role="alert" className="rounded-xl border border-warning/30 bg-warning/8 px-4 py-3">
          <p className="text-[13px] font-semibold text-warning">Outra pessoa alterou esta campanha.</p>
          <p className="text-2xs text-foreground-secondary">
            O horário, a janela ou a velocidade salvos aqui podem estar desatualizados. Recarregue a tela antes de salvar de novo.
          </p>
        </div>
      )}

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
              <Switch checked={windowEnabled} onCheckedChange={setWindowEnabled} />
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
                <Switch checked={bizHours} onCheckedChange={setBizHours} />
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
                <Checkbox id="talkx-respect-suppression" checked disabled className="mt-0.5" />
                <Label htmlFor="talkx-respect-suppression" className="text-xs font-normal text-foreground leading-snug">
                  Respeitar a lista de supressão
                  <span className="block text-2xs text-muted-foreground">
                    A lista é sempre aplicada neste envio; desmarcar exige liberação no banco.
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
              <MetaRow icon={Timer} label="Velocidade" value={{ slow: 'Lenta', moderate: 'Moderada', fast: 'Rápida' }[speedProfile] ?? speedProfile} />
            </div>
            {campaign.message_template && (
              <div>
                <p className="text-2xs text-muted-foreground mb-1.5 font-medium">Mensagem</p>
                <WhatsAppBubble text={campaign.message_template.slice(0, 120) + (campaign.message_template.length > 120 ? '…' : '')} />
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
        <PrimaryButton icon={Play} onClick={() => setLaunchOpen(true)} className="shadow-[var(--shadow-glow-primary)]">
          {launching ? 'Iniciando…' : 'Iniciar agora'}
        </PrimaryButton>
      </div>

      {/* X137: os dois modais críticos passam pelo modal do kit. */}
      <TalkXConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => { void handleCancelSchedule(); }}
        icon={XCircle}
        iconColor="red"
        tone="danger"
        title="Cancelar agendamento?"
        description="A campanha voltará para Rascunhos. Você pode reagendar ou editar a qualquer momento."
        entityName={campaign.name}
        confirmLabel="Cancelar agendamento"
        cancelLabel="Manter agendamento"
        details={[{ label: 'Agendada para', value: scheduledLabel }]}
      />

      <TalkXConfirmDialog
        open={launchOpen}
        onClose={() => setLaunchOpen(false)}
        onConfirm={handleLaunch}
        icon={Play}
        iconColor="blue"
        tone="primary"
        title="Iniciar campanha agora?"
        description={`A campanha será disparada imediatamente para ${fmtInt(campaign.total_recipients)} contatos. Esta ação não pode ser desfeita.`}
        entityName={campaign.name}
        confirmLabel="Confirmar e iniciar"
        cancelLabel="Cancelar"
        loading={launching}
        details={[
          { label: 'Destinatários', value: `${fmtInt(campaign.total_recipients)} contatos` },
          { label: 'Agendada para', value: scheduledLabel },
        ]}
      />
    </div>
  );
}
