import React, { useState } from 'react';
import {
  CalendarDays, Clock, Gauge, ShieldCheck, Users, Send, MessageSquare, Target, Bookmark, Ban, FileText,
  Sliders, Smartphone, ShieldAlert, Check, Rocket, Pencil, AlertTriangle,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { PrimaryButton } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import type { WizardState } from './TalkXCampaignWizard';
import { IconTile, WhatsAppBubble, RailCard, MetaRow, OBJECTIVES, SPEED_PROFILES, fmtInt, fmtPct, personalizePreview, extractVariables, TalkXConfirmDialog } from './talkxShared';
// X133 — as seções de Entrega saíram daqui para `TalkXDeliverySections` (o mesmo
// corpo passa a servir a tela 10). O que fica neste arquivo é a montagem do passo
// e a revisão final.
import {
  SectionCard as Section, ScheduleSection, SendWindowSection, ThrottleSection, SuppressionSection,
  ConnectionSection, AdvancedThrottleSliders,
} from './TalkXDeliverySections';
import { readTalkXBusinessHours } from './talkxDeliveryRules';
import { useTalkXSettings } from '@/hooks/integrations/useTalkXSettings';
import { talkxTimezoneLabel } from './talkxTimezones';
import { useContactCustomFields } from '@/hooks/crm/useContactCustomFields';
import { navigateToView } from '@/hooks/system/useNavigationHistory';

/**
 * X136 — as três confirmações do disparo, com o texto do mock 09.
 * Ficam DENTRO do modal do kit (`TalkXConfirmDialog`), que só libera
 * "Confirmar lançamento" quando as três estão marcadas.
 */
const LAUNCH_CONFIRMATIONS: { id: string; label: string }[] = [
  { id: 'consent', label: 'Confirmo que possuo o consentimento dos contatos.' },
  { id: 'content', label: 'Revisei e estou de acordo com o conteúdo da mensagem.' },
  { id: 'suppression', label: 'A lista de supressão foi aplicada corretamente.' },
];

function formatLocalSchedule(localDateTime: string, timezone: string): string {
  const [date = '', time = ''] = localDateTime.split('T');
  const [year = '', month = '', day = ''] = date.split('-');
  return `${day}/${month}/${year} ${time} (${talkxTimezoneLabel(timezone)})`;
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
        sendInterval={ed.sendInterval as [number, number]}
        messagesPerMinute={ed.messagesPerMinute}
        estimatedTime={ed.estimatedTime}
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
  const objectiveEntry = OBJECTIVES.find((o) => o.value === ed.objective);
  const objective = objectiveEntry?.label ?? ed.objective;
  // X124/T09-012 — a linha "Objetivo" mostra o que o objetivo significa
  // ("Gerar mais vendas e conversões"); a descrição livre da campanha continua
  // visível na mesma linha, para não sumir do resumo.
  const objectiveSub = [objectiveEntry?.description, ed.description].filter(Boolean).join(' · ') || undefined;
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
        <Row icon={Target} label="Objetivo" value={objective} sub={objectiveSub} step={1} onEditStep={onEditStep} />
        <Row icon={ed.audienceSource === 'segment' ? Bookmark : Users} label={ed.audienceSource === 'segment' ? 'Segmento selecionado' : 'Público selecionado'} value={ed.audienceSource === 'segment' ? ed.selectedSegment?.name ?? '—' : `${fmtInt(ed.selectedContacts.length)} contatos`} sub={`${fmtInt(ed.eligibleCount)} contatos elegíveis`} ok={audienceOk} step={1} onEditStep={onEditStep} />
        <Row icon={Ban} label="Exclusões / Supressão" value={ed.respectSuppression ? 'Lista de supressão ativa' : 'Supressão desativada'} sub={ed.respectSuppression ? `${fmtInt(ed.suppressedCount)} contatos excluídos` : 'Atenção: opt-outs ainda são pulados no envio'} ok={ed.respectSuppression} step={3} onEditStep={onEditStep} />
        <Row icon={MessageSquare} label="Template de mensagem" value={ed.selectedTemplate?.name ?? 'Mensagem personalizada'} sub={ed.selectedTemplate ? (ed.selectedTemplate.status === 'approved' ? 'Template aprovado' : 'Template em revisão') : `${ed.messageTemplate.length} caracteres`} ok={ed.selectedTemplate ? ed.selectedTemplate.status === 'approved' : undefined} step={2} onEditStep={onEditStep} />
        <Row icon={Sliders} label="Variáveis de personalização" value={variables.length > 0 ? variables.join(', ') : 'Nenhuma'} sub={`${variables.length} variáveis configuradas`} step={2} onEditStep={onEditStep} />
        <Row icon={Gauge} label="Velocidade de entrega" value={SPEED_PROFILES.find((p) => p.value === ed.speedProfile)?.label ?? ed.speedProfile} sub={`~${ed.messagesPerMinute} mensagens/min`} step={3} onEditStep={onEditStep} />
        <Row icon={CalendarDays} label="Agendamento" value={ed.isScheduled && ed.scheduledAt ? formatLocalSchedule(ed.scheduledAt, ed.scheduleTimezone) : 'Imediato ao lançar'} sub={ed.sendWindowEnabled ? `Janela ${ed.sendWindowStart}–${ed.sendWindowEnd}${ed.businessHoursOnly ? ` · horário comercial (${talkxTimezoneLabel(ed.scheduleTimezone)})` : ''}` : ed.businessHoursOnly ? `Somente horário comercial (${talkxTimezoneLabel(ed.scheduleTimezone)})` : 'Sem janela de envio'} step={3} onEditStep={onEditStep} />
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

      {/* X136 — o disparo confirma pelo modal do kit (`TalkXConfirmDialog`):
          as 3 caixas ficam DENTRO do modal e "Confirmar lançamento" só
          habilita com as três marcadas. Antes era um `Dialog` próprio, com as
          confirmações num cartão de fora repetidas dentro do modal como texto. */}
      <TalkXConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { void launch(); }}
        icon={Send}
        iconColor="blue"
        title="Confirmar disparo?"
        description={ed.isScheduled && ed.scheduledAt
          ? `A campanha ficará agendada para ${formatLocalSchedule(ed.scheduledAt, ed.scheduleTimezone)} e será enviada para ${fmtInt(ed.eligibleCount)} contatos. Esta ação não pode ser desfeita.`
          : `A campanha será enviada para ${fmtInt(ed.eligibleCount)} contatos. Esta ação não pode ser desfeita.`}
        details={[
          { label: 'Campanha', value: ed.name || '—' },
          { label: 'Público', value: ed.audienceSource === 'segment' ? ed.selectedSegment?.name ?? '—' : 'Contatos ZAPP' },
          { label: 'Destinatários', value: `${fmtInt(ed.eligibleCount)} contatos` },
          { label: 'Duração estimada', value: ed.estimatedTime ?? '—' },
          { label: 'Envio', value: ed.isScheduled && ed.scheduledAt ? 'Agendado' : 'Imediato' },
        ]}
        checks={LAUNCH_CONFIRMATIONS}
        confirmLabel={ed.isScheduled && ed.scheduledAt ? 'Confirmar agendamento' : 'Confirmar lançamento'}
        cancelLabel="Cancelar"
        loading={ed.saving}
      />
    </div>
  );
}
