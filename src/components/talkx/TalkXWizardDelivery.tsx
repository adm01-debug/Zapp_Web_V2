import React, { useState } from 'react';
import {
  CalendarDays, Clock, Gauge, ShieldCheck, Users, Send, MessageSquare, Target, Bookmark, Ban, FileText,
  Sliders, Smartphone, ShieldAlert, Check, Rocket, Pencil, X, AlertTriangle,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PrimaryButton, GhostButton } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import type { WizardState } from './TalkXCampaignWizard';
import { IconTile, WhatsAppBubble, RailCard, MetaRow, OBJECTIVES, SPEED_PROFILES, fmtInt, fmtPct, fmtDateTime, personalizePreview, extractVariables } from './talkxShared';
// X133 — as seções de Entrega saíram daqui para `TalkXDeliverySections` (o mesmo
// corpo passa a servir a tela 10). O que fica neste arquivo é a montagem do passo
// e a revisão final.
import {
  SectionCard as Section, ScheduleSection, SendWindowSection, ThrottleSection, SuppressionSection,
  ConnectionSection, AdvancedThrottleSliders,
} from './TalkXDeliverySections';
import { readTalkXBusinessHours } from './talkxDeliveryRules';
import { useTalkXSettings } from '@/hooks/integrations/useTalkXSettings';
import { useContactCustomFields } from '@/hooks/crm/useContactCustomFields';
import { navigateToView } from '@/hooks/system/useNavigationHistory';

function formatLocalSchedule(localDateTime: string, timezone: string): string {
  const [date = '', time = ''] = localDateTime.split('T');
  const [year = '', month = '', day = ''] = date.split('-');
  return `${day}/${month}/${year} ${time} (${timezone})`;
}

/* ------------------------------------------------------------------ */
/* Passo 3 — Entrega / Agendamento                                    */
/* ------------------------------------------------------------------ */

export function TalkXWizardDelivery({ ed }: { ed: WizardState }) {
  // X133 — o horário comercial mostrado é o que está GRAVADO nas configurações
  // (`talkx_settings.business_hours`), a mesma fonte que o motor usa; antes era
  // a constante "segunda a sexta, das 08:00 às 18:00".
  const { data: settings } = useTalkXSettings();
  const businessHours = readTalkXBusinessHours(settings);
  const scheduleLabel = ed.isScheduled && ed.scheduledAt
    ? formatLocalSchedule(ed.scheduledAt, ed.scheduleTimezone)
    : 'Envio imediato ao lançar';
  return (
    <>
      <ScheduleSection
        scheduled={ed.isScheduled}
        onScheduledChange={ed.toggleSchedule}
        scheduledAt={ed.scheduledAt}
        onScheduledAtChange={ed.setScheduledAt}
        minimumScheduledAt={ed.minimumScheduledAt}
        timezone={ed.scheduleTimezone}
        onTimezoneChange={ed.setScheduleTimezone}
        error={ed.scheduleConfigError}
        statusLabel={ed.isScheduled ? `Agendada para ${scheduleLabel}` : scheduleLabel}
        statusTone={ed.isScheduled ? 'success' : 'info'}
      />

      <SendWindowSection
        enabled={ed.sendWindowEnabled}
        onEnabledChange={ed.setSendWindowEnabled}
        start={ed.sendWindowStart}
        end={ed.sendWindowEnd}
        onStartChange={ed.setSendWindowStart}
        onEndChange={ed.setSendWindowEnd}
        timezone={ed.scheduleTimezone}
        businessHoursOnly={ed.businessHoursOnly}
        onBusinessHoursOnlyChange={ed.setBusinessHoursOnly}
        businessHours={businessHours}
      />

      <ThrottleSection
        speedProfile={ed.speedProfile}
        onSpeedProfileChange={ed.setSpeedProfile}
        audienceTotal={ed.eligibleCount}
        campaignMaxPerMinute={ed.campaignMaxPerMinute}
        connectionDailyLimit={ed.connectionDailyLimit}
        advanced={(
          <AdvancedThrottleSliders
            typingDelay={ed.typingDelay as [number, number]}
            sendInterval={ed.sendInterval as [number, number]}
            onTypingDelayChange={ed.setTypingDelay}
            onSendIntervalChange={ed.setSendInterval}
          />
        )}
      />

      <SuppressionSection
        respectSuppression={ed.respectSuppression}
        onRespectSuppressionChange={ed.setRespectSuppression}
        suppressedCount={ed.suppressedCount}
      />

      {/* X133 — a conexão passa a ser escolhida no passo Entrega (V25); sem
          conexão ativa, a seção mostra o estado "WhatsApp desconectado" do kit. */}
      <ConnectionSection
        connections={ed.connections ?? []}
        connectionId={ed.connectionId}
        onConnectionChange={ed.setConnectionId}
        onConnect={() => navigateToView('connections')}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 4 — Revisão final                                            */
/* ------------------------------------------------------------------ */

const Row = ({ icon, label, value, sub, ok, step, onEditStep }: { icon: React.ElementType; label: string; value: React.ReactNode; sub?: React.ReactNode; ok?: boolean; step: 1 | 2 | 3; onEditStep?: (step: 1 | 2 | 3) => void }) => (
    <div className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
      <IconTile icon={icon as never} size={36} color={ok === false ? 'red' : 'blue'} />
      <div className="min-w-0 flex-1">
        <p className="text-2xs text-foreground-secondary">{label}</p>
        <p className="text-[13px] font-semibold text-foreground truncate">{value}</p>
        {sub && <p className={cn('text-2xs', ok === false ? 'text-dash-red' : ok ? 'text-dash-green' : 'text-muted-foreground')}>{sub}</p>}
      </div>
      <button type="button" onClick={() => onEditStep?.(step)} className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium text-foreground-secondary hover:bg-muted/50 flex items-center gap-1.5 shrink-0"><Pencil className="w-3 h-3" />Editar</button>
    </div>
  );

export function TalkXWizardReview({ ed, campaign, onLaunched, onEditStep }: { ed: WizardState; campaign: TalkXCampaign | null; onLaunched: (id: string, status: 'scheduled' | 'sending') => void; onEditStep?: (step: 1 | 2 | 3 | 4) => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sample = ed.contacts?.[0];
  // Review da PR #909: sem os campos customizados reais do contato de
  // exemplo, o preview sempre mostrava "[variavel]" mesmo quando o envio
  // real (personalize()) já resolvia o dado verdadeiro de contact_custom_fields.
  const { fields: sampleCustomFields } = useContactCustomFields(sample?.id);
  const sampleCustomValues = React.useMemo(() => {
    // Object.create(null) (não {}): um campo customizado chamado "__proto__"
    // num objeto comum invoca o setter de protótipo em vez de virar
    // propriedade enumerável — o preview mostraria "[__proto__]" mesmo o
    // envio real (que já usa o mesmo padrão) mandando o valor de verdade
    // (achado do review).
    const values = Object.create(null) as Record<string, string>;
    for (const f of sampleCustomFields) {
      if (f.field_value == null) continue;
      values[f.field_name] = f.field_value;
    }
    return values;
  }, [sampleCustomFields]);
  const variables = extractVariables(ed.messageTemplate);
  const objective = OBJECTIVES.find((o) => o.value === ed.objective)?.label ?? ed.objective;
  const connection = (ed.connections ?? []).find((c) => c.id === ed.connectionId);
  const responses = null; // sem histórico de respostas no motor atual — não estimamos
  const waOk = !!connection;
  const audienceOk = ed.eligibleCount > 0 || !!campaign;
  const allGood = waOk && audienceOk && (ed.messageTemplate.trim().length > 0 || (ed.hasMedia && ed.mediaUrl.trim().length > 0));
  const launchAllowed = allGood && ed.canProceed[4] && !ed.saving;

  const launch = async () => {
    if (!launchAllowed) return;
    setError(null);
    try {
      const id = await ed.handleSave(ed.isScheduled && ed.scheduledAt ? 'schedule' : 'launch');
      if (id) {
        setConfirmOpen(false);
        onLaunched(id, ed.isScheduled && ed.scheduledAt ? 'scheduled' : 'sending');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao lançar a campanha');
    }
  };


  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr_0.9fr] gap-4 min-w-0">
      <Section icon={FileText} title="Resumo da campanha" subtitle="Verifique se todas as informações estão corretas.">
        <Row icon={FileText} label="Nome da campanha" value={ed.name || '—'} step={1} onEditStep={onEditStep} />
        <Row icon={Target} label="Objetivo" value={objective} sub={ed.description || undefined} step={1} onEditStep={onEditStep} />
        <Row icon={ed.audienceSource === 'segment' ? Bookmark : Users} label={ed.audienceSource === 'segment' ? 'Segmento selecionado' : 'Público selecionado'} value={ed.audienceSource === 'segment' ? ed.selectedSegment?.name ?? '—' : `${fmtInt(ed.selectedContacts.length)} contatos`} sub={`${fmtInt(ed.eligibleCount)} contatos elegíveis`} ok={audienceOk} step={1} onEditStep={onEditStep} />
        <Row icon={Ban} label="Exclusões / Supressão" value={ed.respectSuppression ? 'Lista de supressão ativa' : 'Supressão desativada'} sub={ed.respectSuppression ? `${fmtInt(ed.suppressedCount)} contatos excluídos` : 'Atenção: opt-outs ainda são pulados no envio'} ok={ed.respectSuppression} step={3} onEditStep={onEditStep} />
        <Row icon={MessageSquare} label="Template de mensagem" value={ed.selectedTemplate?.name ?? 'Mensagem personalizada'} sub={ed.selectedTemplate ? (ed.selectedTemplate.status === 'approved' ? 'Template aprovado' : 'Template em revisão') : `${ed.messageTemplate.length} caracteres`} ok={ed.selectedTemplate ? ed.selectedTemplate.status === 'approved' : undefined} step={2} onEditStep={onEditStep} />
        <Row icon={Sliders} label="Variáveis de personalização" value={variables.length > 0 ? variables.join(', ') : 'Nenhuma'} sub={`${variables.length} variáveis configuradas`} step={2} onEditStep={onEditStep} />
        <Row icon={Gauge} label="Velocidade de entrega" value={SPEED_PROFILES.find((p) => p.value === ed.speedProfile)?.label ?? ed.speedProfile} sub={`~${ed.messagesPerMinute} mensagens/min`} step={3} onEditStep={onEditStep} />
        <Row icon={CalendarDays} label="Agendamento" value={ed.isScheduled && ed.scheduledAt ? formatLocalSchedule(ed.scheduledAt, ed.scheduleTimezone) : 'Imediato ao lançar'} sub={ed.sendWindowEnabled ? `Janela ${ed.sendWindowStart}–${ed.sendWindowEnd}${ed.businessHoursOnly ? ` · horário comercial (${ed.scheduleTimezone})` : ''}` : ed.businessHoursOnly ? `Somente horário comercial (${ed.scheduleTimezone})` : 'Sem janela de envio'} step={3} onEditStep={onEditStep} />
        <Row icon={Smartphone} label="Conexão WhatsApp" value={connection ? `${connection.name} (${connection.phone_number || 'sem número'})` : 'Nenhuma conexão'} sub={connection ? 'Conectada e pronta' : 'Selecione uma conexão ativa'} ok={waOk} step={1} onEditStep={onEditStep} />
        <Row icon={ShieldCheck} label="Conformidade" value="LGPD e políticas do WhatsApp" sub={ed.respectSuppression && ed.confirmConsent ? 'Verificações confirmadas' : 'Confirme as verificações abaixo'} ok={ed.respectSuppression && ed.confirmConsent} step={3} onEditStep={onEditStep} />
      </Section>

      <Section icon={Smartphone} color="green" title="Prévia no WhatsApp" subtitle="Veja como sua mensagem será exibida para o contato.">
        <WhatsAppBubble text={personalizePreview(ed.messageTemplate, sample, sampleCustomValues)} mediaUrl={ed.hasMedia ? ed.mediaUrl : null} mediaType={ed.hasMedia ? ed.mediaType : null} senderName={connection?.name ?? 'ZAPP'} />
      </Section>

      <div className="space-y-4 min-w-0">
        <RailCard icon={Users} title="Resumo operacional">
          <MetaRow icon={Users} label="Público total" value={<span><b className="text-[15px]">{fmtInt(ed.eligibleCount)}</b> <span className="text-foreground-secondary font-normal">contatos elegíveis</span></span>} />
          <MetaRow icon={Clock} label="Tempo estimado de entrega" value={<span><b className="text-[15px]">{ed.estimatedTime ?? '—'}</b> <span className="text-foreground-secondary font-normal">a ~{ed.messagesPerMinute} msg/min</span></span>} />
          <MetaRow icon={Ban} label="Suprimidos" value={<span><b className="text-[15px]">{fmtInt(ed.suppressedCount)}</b> <span className="text-foreground-secondary font-normal">{fmtPct(ed.suppressedCount, ed.audienceTotal)}</span></span>} />
          <MetaRow icon={MessageSquare} label="Taxa de resposta projetada" value={<span className="text-foreground-secondary font-normal">{responses ?? 'sem histórico suficiente'}</span>} />
        </RailCard>

        <RailCard icon={ShieldAlert} color="amber" title="Confirmações obrigatórias" subtitle="Marque para habilitar o lançamento.">
          {[
            { k: 'consent', v: ed.confirmConsent, set: ed.setConfirmConsent, l: 'Confirmo que possuo o consentimento dos contatos.' },
            { k: 'content', v: ed.confirmContent, set: ed.setConfirmContent, l: 'Revisei e estou de acordo com o conteúdo da mensagem.' },
            { k: 'supp', v: ed.confirmSuppression, set: ed.setConfirmSuppression, l: 'A lista de supressão foi aplicada corretamente.' },
          ].map((c) => (
            <label key={c.k} className="flex items-start gap-2.5 cursor-pointer">
              <Checkbox checked={c.v} onCheckedChange={(x) => c.set(!!x)} className="mt-0.5" />
              <span className="text-xs text-foreground leading-snug">{c.l}</span>
            </label>
          ))}
        </RailCard>

        <div className={cn('rounded-2xl border p-4 flex items-start gap-3', allGood ? 'border-dash-green/40 bg-dash-green/10' : 'border-dash-amber/40 bg-dash-amber/10')}>
          <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', allGood ? 'bg-dash-green text-white' : 'bg-dash-amber text-black')}>{allGood ? <Check className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}</div>
          <div>
            <p className="text-sm font-bold text-foreground">{allGood ? 'Tudo pronto para lançar!' : 'Pendências antes de lançar'}</p>
            <p className="text-xs text-foreground-secondary">{allGood ? 'Sua campanha está configurada e em conformidade com as políticas do WhatsApp.' : !waOk ? 'Selecione uma conexão WhatsApp ativa.' : !audienceOk ? 'Nenhum contato elegível no público.' : 'Escreva a mensagem da campanha.'}</p>
          </div>
        </div>

        <PrimaryButton size="lg" icon={Rocket} className="w-full justify-center h-12 text-base" disabled={!launchAllowed} onClick={() => setConfirmOpen(true)}>
          {ed.isScheduled && ed.scheduledAt ? 'Agendar campanha' : 'Lançar campanha'}
        </PrimaryButton>
        {error && <p className="text-xs text-dash-red">{error}</p>}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md rounded-2xl border-border/70">
          <DialogHeader>
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center mb-2"><Send className="w-7 h-7 text-primary-glow" /></div>
            <DialogTitle className="text-center text-xl font-bold">Confirmar disparo?</DialogTitle>
            <DialogDescription className="text-center text-xs">
              {ed.isScheduled && ed.scheduledAt ? `A campanha ficará agendada para ${formatLocalSchedule(ed.scheduledAt, ed.scheduleTimezone)}` : 'Após o lançamento, a campanha será enviada'} para <b className="text-foreground">{fmtInt(ed.eligibleCount)} contatos</b>. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border/60 bg-input/20 p-3 space-y-1.5 text-xs">
            {[['Campanha', ed.name], ['Público', ed.audienceSource === 'segment' ? ed.selectedSegment?.name ?? '—' : 'Contatos ZAPP'], ['Destinatários', `${fmtInt(ed.eligibleCount)} contatos`], ['Duração estimada', ed.estimatedTime ?? '—'], ['Envio', ed.isScheduled && ed.scheduledAt ? 'Agendado' : 'Imediato']].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><span className="text-foreground-secondary">{k}</span><span className="font-medium text-foreground text-right truncate">{v}</span></div>
            ))}
          </div>
          <div className="space-y-1.5 text-xs">
            {[ed.confirmConsent, ed.confirmContent, ed.confirmSuppression].every(Boolean) && ['Consentimento dos contatos confirmado', 'Conteúdo da mensagem revisado', 'Lista de supressão aplicada'].map((t) => (
              <p key={t} className="flex items-center gap-2 text-dash-green"><Check className="w-3.5 h-3.5" /> <span className="text-foreground">{t}</span></p>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <GhostButton icon={X} onClick={() => setConfirmOpen(false)}>Cancelar</GhostButton>
            <PrimaryButton icon={Send} onClick={launch} disabled={!launchAllowed}>{ed.saving ? 'Lançando…' : ed.isScheduled && ed.scheduledAt ? 'Confirmar agendamento' : 'Confirmar lançamento'}</PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
