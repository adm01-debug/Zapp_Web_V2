import React, { useState, useCallback, useEffect } from 'react';
import {
  CalendarDays, Clock, ArrowLeft, Play, XCircle, Pencil, Save,
  Users, MessageSquare, Zap, Send, ShieldCheck, Timer, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GhostButton, PrimaryButton } from '@/components/dashboard/overview/DashboardCard';
import { IconTile, RailCard, MetaRow, fmtDateTime, fmtDurationShort, fmtInt, estimateSeconds, WhatsAppBubble } from './talkxShared';
import { TalkXEmptyState, TalkXQueryBoundary, TalkXSkeletonRows } from './kit/states';
import { DEFAULT_SCHEDULE_TIMEZONE, localToUTCInTimezone, utcToLocalInTimezone } from './useCampaignEditor';
import { TalkXLifecycleDialog, useTalkXLifecycle } from './useTalkXLifecycle';
import { useTalkX, type TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { useTalkXConnectionStatus } from '@/hooks/integrations/useTalkXConnectionStatus';
import { cn } from '@/lib/utils';
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

/**
 * T10-005 — selo do agendamento no FUSO DA CAMPANHA.
 *
 * `fmtDateTime` formata no fuso do navegador: com o navegador em outro fuso o
 * selo mostrava uma hora diferente da que o motor usa para disparar
 * (`scheduled_at` + `schedule_timezone`). Aqui o instante é convertido para o
 * fuso salvo na campanha, no formato do mock: "27/11 • 09:00".
 */
function fmtScheduleSelo(iso: string | null | undefined, timezone: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone || DEFAULT_SCHEDULE_TIMEZONE,
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('day')}/${get('month')} • ${get('hour')}:${get('minute')}`;
  } catch {
    // Fuso IANA desconhecido (dado legado): mantém o comportamento antigo.
    return fmtDateTime(iso);
  }
}

/**
 * Estado real da linha WhatsApp (o texto fixo "Linha WhatsApp conectada" dizia
 * "conectada" até para conexão caída).
 */
const CONNECTION_STATUS: Record<string, { label: string; className: string }> = {
  connected: { label: 'Conectada', className: 'border-success/30 bg-success/15 text-success' },
  pending: { label: 'Pendente', className: 'border-warning/30 bg-warning/15 text-warning' },
  disconnected: { label: 'Desconectada', className: 'border-destructive/30 bg-destructive/15 text-destructive' },
};

/**
 * Pendências que BLOQUEIAM o envio, com a mesma regra que a revisão do wizard
 * usa (conexão ativa, público com contatos elegíveis, mensagem escrita).
 *
 * A RPC de checagens de lançamento (X120) ainda não existe no banco; enquanto
 * ela não chega, a tela não pode anunciar "pronta para ser enviada" sem olhar
 * o que já é conhecido da campanha. Enquanto o status da conexão está sendo
 * lido (`connectionLoading`) ele não conta como pendência — não se inventa
 * bloqueio com dado ainda não carregado.
 */
function campaignBlockingChecks(
  campaign: Pick<TalkXCampaign, 'whatsapp_connection_id' | 'total_recipients' | 'message_template'>,
  connectionStatus: string | null,
  connectionLoading: boolean,
): string[] {
  const problemas: string[] = [];
  if (!campaign.whatsapp_connection_id) {
    problemas.push('Nenhuma linha WhatsApp selecionada.');
  } else if (!connectionLoading && connectionStatus && connectionStatus !== 'connected') {
    const rotulo = CONNECTION_STATUS[connectionStatus]?.label ?? connectionStatus;
    problemas.push(`A linha WhatsApp está ${rotulo.toLowerCase()}.`);
  }
  if ((campaign.total_recipients ?? 0) <= 0) problemas.push('O público não tem contatos elegíveis.');
  if (!campaign.message_template?.trim()) problemas.push('A mensagem da campanha está vazia.');
  return problemas;
}

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

function TalkXCampaignScheduledEditor({ campaign, onBack, onEdit }: ScheduledEditorProps) {
  const { updateCampaign } = useTalkX();
  // X051: o disparo ("Iniciar agora") sai dos handlers próprios e passa pelo
  // controlador único do ciclo de vida. O "Cancelar agendamento" (devolve a
  // campanha para Rascunhos) NÃO passa por aqui: o hook não expõe essa ação —
  // seguirá no fluxo local até o hook ganhar a ação (ver relato).
  const lifecycle = useTalkXLifecycle();
  // T10-043 — estado real da conexão (o Resumo mostrava "Linha WhatsApp
  // conectada" fixo, mesmo com a conexão caída).
  const { status: connectionStatus, loading: connectionLoading } = useTalkXConnectionStatus(campaign.whatsapp_connection_id);
  const initialTimezone = campaign.schedule_timezone || DEFAULT_SCHEDULE_TIMEZONE;
  const [localTz, setLocalTz] = useState<string>(initialTimezone);
  const [localDate, setLocalDate] = useState<string>(() => (
    campaign.scheduled_at ? utcToLocalInTimezone(campaign.scheduled_at, initialTimezone) : ''
  ));
  const [windowEnabled, setWindowEnabled] = useState<boolean>(!!campaign.send_window_start);
  const [windowStart, setWindowStart] = useState<string>(campaign.send_window_start?.slice(0, 5) ?? '08:00');
  const [windowEnd, setWindowEnd] = useState<string>(campaign.send_window_end?.slice(0, 5) ?? '18:00');
  const [bizHours, setBizHours] = useState<boolean>(campaign.business_hours_only ?? false);
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const handleTimezoneChange = useCallback((nextTimezone: string) => {
    try {
      const nextDate = localDate
        ? utcToLocalInTimezone(localToUTCInTimezone(localDate, localTz), nextTimezone)
        : localDate;
      setLocalDate(nextDate);
      setLocalTz(nextTimezone);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar o fuso horário.');
    }
  }, [localDate, localTz]);

  const calDate = localDate ? new Date(localDate) : undefined;

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!localDate) { toast.error('Defina a data e hora do agendamento.'); return; }
    if (windowEnabled && windowStart >= windowEnd) {
      toast.error('O fim da janela de envio deve ser posterior ao início.');
      return;
    }
    setSaving(true);
    try {
      const scheduledAt = localToUTCInTimezone(localDate, localTz);
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
      });
      toast.success('Agendamento atualizado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar agendamento.');
    } finally {
      setSaving(false);
    }
  }, [campaign, localDate, localTz, windowEnabled, windowStart, windowEnd, bizHours, updateCampaign, saving]);

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
    ? fmtScheduleSelo(campaign.scheduled_at, campaign.schedule_timezone || DEFAULT_SCHEDULE_TIMEZONE)
    : localDate ? fmtScheduleSelo(localToUTCInTimezone(localDate, localTz), localTz) : '—';

  // T10-005 — "Campanha pronta para ser enviada." só quando não há checagem
  // bloqueante; caso contrário a tela mostra quantas pendências faltam e o
  // caminho para resolvê-las no wizard.
  const blockingChecks = campaignBlockingChecks(campaign, connectionStatus, connectionLoading);
  const readyToSend = blockingChecks.length === 0;

  // T10-044 — duração estimada com o ritmo previsto (mesma conta da revisão do
  // wizard: média de digitação + média do intervalo entre envios).
  const { estimatedLabel, messagesPerMinute } = React.useMemo(() => {
    const segundosPorMensagem = ((campaign.typing_delay_min + campaign.typing_delay_max) / 2
      + (campaign.send_interval_min + campaign.send_interval_max) / 2) / 1000;
    if (campaign.total_recipients <= 0 || segundosPorMensagem <= 0) {
      return { estimatedLabel: null, messagesPerMinute: 0 };
    }
    return {
      estimatedLabel: fmtDurationShort(estimateSeconds(
        campaign.total_recipients,
        campaign.typing_delay_min,
        campaign.typing_delay_max,
        campaign.send_interval_min,
        campaign.send_interval_max,
      )),
      messagesPerMinute: Math.round((60 / segundosPorMensagem) * 10) / 10,
    };
  }, [campaign.total_recipients, campaign.typing_delay_min, campaign.typing_delay_max, campaign.send_interval_min, campaign.send_interval_max]);

  const connectionInfo = CONNECTION_STATUS[connectionStatus ?? ''];

  return (
    <div className="min-h-full bg-background p-3 md:p-4 lg:p-6 space-y-4">
      {/* T10-001 — breadcrumb do módulo */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="h-9 px-3 rounded-lg border border-border/70 bg-input/40 flex items-center gap-1.5 text-xs font-medium text-foreground-secondary hover:bg-muted/50"
        >
          <ArrowLeft className="w-4 h-4" />Voltar às campanhas
        </button>
        <nav aria-label="Trilha de navegação" className="hidden sm:flex items-center gap-1.5 text-2xs text-muted-foreground">
          <span>Campanhas</span>
          <span className="text-border">›</span>
          <span>Talk X</span>
          <span className="text-border">›</span>
          <span className="text-foreground font-medium">Campanha Agendada</span>
        </nav>
      </div>

      {/* Header — T10-002 (faixa), T10-003 (título) e T10-004 (subtítulo) */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <IconTile icon={CalendarDays as never} size={40} className="bg-success/15 border-success/30 text-success" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">Talk X · Agendamento de campanha</p>
            <h1 className="text-xl font-bold font-display text-foreground tracking-[-0.02em] truncate">
              Campanha Agendada • {campaign.name}
            </h1>
            <p className="text-xs text-foreground-secondary">Configure o agendamento e revise os detalhes antes de ativar o envio.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GhostButton icon={Pencil} onClick={() => onEdit(campaign)}>Editar no wizard</GhostButton>
          <PrimaryButton icon={Save} onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : 'Salvar agendamento'}</PrimaryButton>
        </div>
      </div>

      {/* T10-005 — selo no fuso da campanha + estado real de prontidão */}
      <div className={cn(
        'rounded-xl border px-4 py-3 flex items-center gap-3 flex-wrap',
        readyToSend ? 'border-success/30 bg-success/8' : 'border-warning/30 bg-warning/8',
      )}>
        {readyToSend
          ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
          : <AlertTriangle className="w-4 h-4 text-warning shrink-0" />}
        <p className="text-[13px] text-foreground">
          <span className={cn('font-semibold', readyToSend ? 'text-success' : 'text-warning')}>Agendada para {scheduledLabel}</span>
          {' '}— {readyToSend
            ? 'Campanha pronta para ser enviada.'
            : `${blockingChecks.length} ${blockingChecks.length === 1 ? 'pendência' : 'pendências'} antes do envio.`}
        </p>
        {!readyToSend && (
          <button
            type="button"
            onClick={() => onEdit(campaign)}
            className="ml-auto h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium text-foreground-secondary hover:bg-muted/50 shrink-0"
          >
            Revisar no wizard
          </button>
        )}
      </div>

      {/* 3 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Col 1 — Configurações de Agendamento */}
        <RailCard title="Configurações de Agendamento" icon={Clock}>
          <div className="space-y-4 pt-1">
            <div>
              <Label className="text-2xs text-muted-foreground mb-1.5 block">Data e hora</Label>
              <Input
                type="datetime-local"
                value={localDate}
                min={new Date().toISOString().slice(0, 16)}
                onChange={(e) => setLocalDate(e.target.value)}
                className="h-10 bg-input/40 border-border/70 text-[13px]"
              />
            </div>

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
              <div className="grid grid-cols-2 gap-2 pl-2 border-l-2 border-border/50">
                <div>
                  <Label className="text-2xs text-muted-foreground mb-1 block">Início</Label>
                  <Input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="h-9 bg-input/40 border-border/70 text-[13px]" />
                </div>
                <div>
                  <Label className="text-2xs text-muted-foreground mb-1 block">Fim</Label>
                  <Input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="h-9 bg-input/40 border-border/70 text-[13px]" />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">Somente horário comercial</p>
                <p className="text-2xs text-muted-foreground">Seg–Sex, 08:00–18:00</p>
              </div>
              <Switch checked={bizHours} onCheckedChange={setBizHours} />
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
                const existingTime = localDate.split('T')[1] || '09:00';
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                setLocalDate(`${y}-${m}-${day}T${existingTime}`);
              }}
              className="rounded-lg border border-border/60 bg-card/50 mx-auto"
            />
            <div className="rounded-lg border border-border/60 bg-card/50 p-3 space-y-2">
              <p className="text-2xs font-semibold text-foreground-secondary uppercase tracking-wide">Resumo da Programação</p>
              <div className="space-y-1.5">
                <MetaRow icon={CalendarDays} label="Data" value={calDate ? calDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : '—'} />
                <MetaRow icon={Clock} label="Hora" value={localDate.split('T')[1] || '—'} />
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
              {/* T10-043 — estado REAL da linha (antes era o texto fixo "Linha WhatsApp conectada") */}
              <MetaRow
                icon={Send}
                label="Linha WhatsApp"
                value={!campaign.whatsapp_connection_id
                  ? 'Sem linha'
                  : connectionInfo
                    ? (
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full border text-2xs font-medium', connectionInfo.className)}>
                        {connectionInfo.label}
                      </span>
                    )
                    : '—'}
              />
              {campaign.speed_profile && (
                <MetaRow icon={Timer} label="Velocidade" value={{ slow: 'Lenta', moderate: 'Moderada', fast: 'Rápida' }[campaign.speed_profile] ?? campaign.speed_profile} />
              )}
              {/* T10-044 — duração estimada com o ritmo previsto */}
              {estimatedLabel && (
                <MetaRow
                  icon={Clock}
                  label="Duração estimada"
                  value={<span><b>{estimatedLabel}</b> <span className="text-foreground-secondary font-normal">· ~{messagesPerMinute} msg/min</span></span>}
                />
              )}
            </div>
            {campaign.message_template && (
              <div>
                <p className="text-2xs text-muted-foreground mb-1.5 font-medium">Mensagem</p>
                <WhatsAppBubble text={campaign.message_template.slice(0, 120) + (campaign.message_template.length > 120 ? '…' : '')} />
              </div>
            )}
            {readyToSend ? (
              <div className="rounded-xl border border-primary/30 bg-primary/8 px-3 py-2.5 flex items-start gap-2.5">
                <MessageSquare className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-primary">Tudo pronto para o envio!</p>
                  <p className="text-2xs text-muted-foreground">Aguardando {scheduledLabel}.</p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-warning/30 bg-warning/8 px-3 py-2.5 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-warning">Pendências antes do envio</p>
                  <ul className="text-2xs text-muted-foreground list-disc pl-4 mt-1 space-y-0.5">
                    {blockingChecks.map((pendencia) => <li key={pendencia}>{pendencia}</li>)}
                  </ul>
                  <button
                    type="button"
                    onClick={() => onEdit(campaign)}
                    className="mt-2 h-7 px-2.5 rounded-lg border border-border/70 bg-input/40 text-2xs font-medium text-foreground-secondary hover:bg-muted/50"
                  >
                    Revisar no wizard
                  </button>
                </div>
              </div>
            )}
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
