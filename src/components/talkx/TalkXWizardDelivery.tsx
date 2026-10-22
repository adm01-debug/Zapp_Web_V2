import React, { useState } from 'react';
import {
  CalendarDays, Clock, Gauge, ShieldCheck, Users, Send, MessageSquare, Target, Bookmark, Ban, FileText,
  Sliders, Smartphone, ShieldAlert, Check, Rocket, Pencil, AlertTriangle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { PrimaryButton, Pill } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import type { WizardState } from './TalkXCampaignWizard';
import { IconTile, WhatsAppBubble, RailCard, MetaRow, InsightCard, OBJECTIVES, SPEED_PROFILES, fmtInt, fmtPct, fmtDateTime, fmtDurationShort, personalizePreview, extractVariables, TalkXWhatsAppDisconnectedState, TalkXConfirmDialog } from './talkxShared';
import type { TalkXPreviewInteractive } from './TalkXMessagePreview';
import { TalkXNoData } from './kit/states';
import { useTalkXInsights } from '@/hooks/integrations/useTalkXInsights';
import { formatScheduleRelative, type WizardStep } from './useCampaignEditor';
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
  return `${day}/${month}/${year} ${time} (${timezone})`;
}

function Section({ icon, color = 'blue', title, subtitle, right, children }: { icon: React.ElementType; color?: 'blue' | 'green' | 'red' | 'violet' | 'amber'; title: string; subtitle?: string; right?: React.ReactNode; children?: React.ReactNode }) {
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

function OptionPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('h-10 px-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 transition-colors', active ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 bg-input/30 text-foreground-secondary hover:border-primary/40')}>
      <span className={cn('w-3.5 h-3.5 rounded-full border-2', active ? 'border-primary bg-primary shadow-[inset_0_0_0_2.5px_hsl(var(--card))]' : 'border-border')} />{label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 3 — Entrega / Agendamento                                    */
/* ------------------------------------------------------------------ */

export function TalkXWizardDelivery({ ed }: { ed: WizardState }) {
  const scheduleLabel = ed.isScheduled && ed.scheduledAt
    ? formatLocalSchedule(ed.scheduledAt, ed.scheduleTimezone)
    : 'Envio imediato ao lançar';
  return (
    <>
      {/* E65 — sem conexão WhatsApp 'connected' o envio é impossível: o passo 3
          mostra o estado dedicado com caminho para a tela de Conexões. */}
      {(ed.connections ?? []).length === 0 && (
        <TalkXWhatsAppDisconnectedState onConnect={() => navigateToView('connections')} />
      )}
      <Section icon={CalendarDays} title="Configurações de agendamento" subtitle="Defina quando, como e em que condições a campanha será enviada."
        right={<Pill label={ed.isScheduled ? `Agendada para ${scheduleLabel}` : scheduleLabel} tone={ed.isScheduled ? 'success' : 'info'} dot />}
      >
        <div className="flex flex-wrap gap-2 mb-4">
          <OptionPill active={!ed.isScheduled} label="Enviar ao lançar" onClick={() => ed.toggleSchedule(false)} />
          <OptionPill active={ed.isScheduled} label="Agendar data e hora" onClick={() => ed.toggleSchedule(true)} />
        </div>
        {ed.isScheduled && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs text-foreground-secondary">Data e horário de início</Label>
              <Input type="datetime-local" value={ed.scheduledAt} min={ed.minimumScheduledAt} onChange={(e) => ed.setScheduledAt(e.target.value)} aria-invalid={!!ed.scheduleConfigError} className="mt-1.5 h-10 bg-input/40 border-border/70" />
              {ed.scheduleConfigError && <p role="alert" className="mt-1.5 text-2xs text-dash-red">{ed.scheduleConfigError}</p>}
            </div>
            <div>
              <Label className="text-xs text-foreground-secondary">Fuso horário</Label>
              <Select value={ed.scheduleTimezone} onValueChange={ed.setScheduleTimezone}><SelectTrigger className="mt-1.5 h-10 bg-input/40 border-border/70"><SelectValue /></SelectTrigger><SelectContent><SelectItem key="America/Sao_Paulo" value="America/Sao_Paulo">America/Sao Paulo</SelectItem><SelectItem key="America/Manaus" value="America/Manaus">America/Manaus</SelectItem><SelectItem key="America/Belem" value="America/Belem">America/Belem</SelectItem><SelectItem key="America/Fortaleza" value="America/Fortaleza">America/Fortaleza</SelectItem><SelectItem key="America/Recife" value="America/Recife">America/Recife</SelectItem><SelectItem key="America/Cuiaba" value="America/Cuiaba">America/Cuiaba</SelectItem><SelectItem key="America/Porto_Velho" value="America/Porto_Velho">America/Porto Velho</SelectItem><SelectItem key="America/Rio_Branco" value="America/Rio_Branco">America/Rio Branco</SelectItem><SelectItem key="America/New_York" value="America/New_York">America/New York</SelectItem><SelectItem key="America/Chicago" value="America/Chicago">America/Chicago</SelectItem><SelectItem key="America/Los_Angeles" value="America/Los_Angeles">America/Los Angeles</SelectItem><SelectItem key="America/Buenos_Aires" value="America/Buenos_Aires">America/Buenos Aires</SelectItem><SelectItem key="America/Santiago" value="America/Santiago">America/Santiago</SelectItem><SelectItem key="America/Bogota" value="America/Bogota">America/Bogota</SelectItem><SelectItem key="America/Lima" value="America/Lima">America/Lima</SelectItem><SelectItem key="Europe/London" value="Europe/London">Europe/London</SelectItem><SelectItem key="Europe/Lisbon" value="Europe/Lisbon">Europe/Lisbon</SelectItem><SelectItem key="UTC" value="UTC">UTC</SelectItem></SelectContent></Select>
            </div>
          </div>
        )}
      </Section>

      <Section icon={Clock} color="violet" title="Janela de envio" subtitle="Período do dia em que os envios podem ser realizados."
        right={<Switch checked={ed.sendWindowEnabled} onCheckedChange={ed.setSendWindowEnabled} />}
      >
        <div className={cn('grid grid-cols-1 md:grid-cols-[1fr_1fr_1.4fr] gap-3', !ed.sendWindowEnabled && 'opacity-50 pointer-events-none')}>
          <div><Label className="text-xs text-foreground-secondary">Início da janela</Label><Input type="time" value={ed.sendWindowStart} onChange={(e) => ed.setSendWindowStart(e.target.value)} className="mt-1.5 h-10 bg-input/40 border-border/70" /></div>
          <div><Label className="text-xs text-foreground-secondary">Fim da janela</Label><Input type="time" value={ed.sendWindowEnd} onChange={(e) => ed.setSendWindowEnd(e.target.value)} className="mt-1.5 h-10 bg-input/40 border-border/70" /></div>
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-primary-glow shrink-0 mt-0.5" />
            <div><p className="text-xs font-semibold text-foreground">Envios apenas neste período</p><p className="text-2xs text-foreground-secondary">Fora da janela, o envio pausa e retoma automaticamente no próximo início ({ed.sendWindowStart}), no fuso {ed.scheduleTimezone}.</p></div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-input/20 p-3">
          <div className="flex items-center gap-3">
            <IconTile icon={CalendarDays as never} size={36} />
            <div><p className="text-[13px] font-semibold text-foreground">Limitar por horário comercial</p><p className="text-2xs text-foreground-secondary">Envia somente de segunda a sexta, das 08:00 às 18:00 no fuso {ed.scheduleTimezone}.</p></div>
          </div>
          <div className="flex items-center gap-2"><span className={cn('text-xs font-semibold', ed.businessHoursOnly ? 'text-dash-green' : 'text-muted-foreground')}>{ed.businessHoursOnly ? 'Ativado' : 'Desativado'}</span><Switch checked={ed.businessHoursOnly} onCheckedChange={ed.setBusinessHoursOnly} /></div>
        </div>
      </Section>

      <Section icon={Gauge} color="green" title="Throttle / Simulação humana" subtitle="Controla a velocidade de envio para um comportamento mais natural.">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-4">
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-foreground-secondary">Velocidade de envio</Label>
              <div className="flex flex-col gap-2 mt-1.5">
                {SPEED_PROFILES.map((p) => <OptionPill key={p.value} active={ed.speedProfile === p.value} label={`${p.label} · ${p.interval[0]}–${p.interval[1]}s entre mensagens`} onClick={() => ed.setSpeedProfile(p.value)} />)}
              </div>
            </div>
          </div>
          <div className="space-y-5 rounded-xl border border-border/60 bg-input/20 p-4">
            <div>
              <div className="flex justify-between mb-2"><Label className="text-xs text-foreground-secondary">Tempo "digitando…"</Label><span className="text-2xs font-mono text-foreground">{ed.typingDelay[0]}s – {ed.typingDelay[1]}s</span></div>
              <Slider value={ed.typingDelay} onValueChange={ed.setTypingDelay} min={0.5} max={10} step={0.5} />
            </div>
            <div>
              <div className="flex justify-between mb-2"><Label className="text-xs text-foreground-secondary">Intervalo entre envios</Label><span className="text-2xs font-mono text-foreground">{ed.sendInterval[0]}s – {ed.sendInterval[1]}s</span></div>
              <Slider value={ed.sendInterval} onValueChange={ed.setSendInterval} min={3} max={60} step={1} />
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 flex items-start gap-2.5">
              <Sliders className="w-4 h-4 text-primary-glow shrink-0 mt-0.5" />
              <div><p className="text-xs font-semibold text-foreground">Simulação humana ativa</p><p className="text-2xs text-foreground-secondary">~{ed.messagesPerMinute} mensagens/min · {ed.estimatedTime ? `duração estimada ${ed.estimatedTime}` : 'selecione o público para estimar a duração'}.</p></div>
            </div>
          </div>
        </div>
      </Section>

      <Section icon={ShieldCheck} color="amber" title="Confirmação e supressão" subtitle="Evita o envio para contatos que não devem receber.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-input/20 p-3 cursor-pointer">
            <Checkbox checked={ed.respectSuppression} onCheckedChange={(v) => ed.setRespectSuppression(!!v)} className="mt-0.5" />
            <div><p className="text-[13px] font-medium text-foreground">Não enviar para contatos em lista de supressão</p><p className="text-2xs text-foreground-secondary">Opt-outs, bloqueios manuais e LGPD são removidos do público{ed.suppressedCount > 0 ? ` (${ed.suppressedCount} no público atual)` : ''}.</p></div>
          </label>
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-input/20 p-3">
            <Checkbox checked disabled className="mt-0.5" />
            <div><p className="text-[13px] font-medium text-foreground">Respeitar opt-outs e bloqueados no envio</p><p className="text-2xs text-foreground-secondary">O motor de envio sempre pula contatos suprimidos, mesmo os adicionados após o agendamento.</p></div>
          </div>
        </div>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 4 — Revisão final                                            */
/* ------------------------------------------------------------------ */

/**
 * T09 — CTA do template na prévia da revisão.
 *
 * Extrai o `interactive` que o template carrega para o formato simples que a
 * prévia entende (`TalkXPreviewInteractive`): botões viram rótulos (a forma
 * rica do X096 — `{ type, label, url? }` — ou `string[]`), enquete vira
 * pergunta + opções. Só passa adiante texto não vazio; sem `interactive` no
 * template devolve `null` e a prévia não inventa botão nenhum.
 */
function templatePreviewInteractive(template: unknown): TalkXPreviewInteractive | null {
  if (!template || typeof template !== 'object') return null;
  const raw = (template as { interactive?: unknown }).interactive;
  if (!raw || typeof raw !== 'object') return null;
  const { buttons, poll } = raw as { buttons?: unknown; poll?: unknown };
  const labels = Array.isArray(buttons)
    ? buttons
      .map((button) => typeof button === 'string' ? button : (button as { label?: unknown } | null)?.label)
      .filter((label): label is string => typeof label === 'string' && label.trim().length > 0)
      .map((label) => label.trim())
    : [];
  let pollPreview: TalkXPreviewInteractive['poll'];
  if (poll && typeof poll === 'object') {
    const { question, options } = poll as { question?: unknown; options?: unknown };
    const cleanQuestion = typeof question === 'string' ? question.trim() : '';
    const cleanOptions = Array.isArray(options)
      ? options
        .filter((option): option is string => typeof option === 'string' && option.trim().length > 0)
        .map((option) => option.trim())
      : [];
    if (cleanQuestion) pollPreview = { question: cleanQuestion, ...(cleanOptions.length > 0 ? { options: cleanOptions } : {}) };
  }
  if (labels.length === 0 && !pollPreview) return null;
  return { ...(labels.length > 0 ? { buttons: labels } : {}), ...(pollPreview ? { poll: pollPreview } : {}) };
}

const Row = ({ icon, label, value, sub, ok, step, onEditStep }: { icon: React.ElementType; label: string; value: React.ReactNode; sub?: React.ReactNode; ok?: boolean; step: 1 | 2 | 3; onEditStep?: (step: 1 | 2 | 3, returnTo: 4) => void }) => (
    <div className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
      <IconTile icon={icon as never} size={36} color={ok === false ? 'red' : 'blue'} />
      <div className="min-w-0 flex-1">
        <p className="text-2xs text-foreground-secondary">{label}</p>
        <p className="text-[13px] font-semibold text-foreground truncate">{value}</p>
        {sub && <p className={cn('text-2xs', ok === false ? 'text-dash-red' : ok ? 'text-dash-green' : 'text-muted-foreground')}>{sub}</p>}
      </div>
      <button type="button" onClick={() => onEditStep?.(step, 4)} className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium text-foreground-secondary hover:bg-muted/50 flex items-center gap-1.5 shrink-0"><Pencil className="w-3 h-3" />Editar</button>
    </div>
  );

/* ------------------------------------------------------------------ */
/* X135 — previsões do "Resumo operacional" (CAP-087)                  */
/* ------------------------------------------------------------------ */

/**
 * Base mínima para a revisão mostrar uma previsão: 5 campanhas concluídas com
 * 100 ou mais enviados nos últimos 90 dias. Quem calcula a previsão é o SERVIDOR
 * (CAP-087: taxa projetada e risco de opt-out); sem essa base ele não devolve
 * valor, e a revisão mostra "sem dados ainda" (A9) em vez de um número sem lastro.
 */
const FORECAST_MIN_CAMPAIGNS = 5;
const FORECAST_MIN_SENT = 100;
const FORECAST_WINDOW_DAYS = 90;

const FORECAST_EMPTY_HINT =
  `Sem base ainda: a projeção aparece depois de ${FORECAST_MIN_CAMPAIGNS} campanhas concluídas ` +
  `com ${FORECAST_MIN_SENT} ou mais enviados nos últimos ${FORECAST_WINDOW_DAYS} dias.`;

/**
 * X135 — linha de previsão do "Resumo operacional". As duas previsões (taxa de
 * resposta projetada e risco de opt-out) ficam no estado vazio do kit enquanto o
 * servidor não indicar base suficiente — a revisão não promete resultado que não
 * tem histórico para sustentar.
 */
function ForecastRow({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="pt-3">
      <p className="flex items-center gap-2 text-xs text-foreground-secondary mb-1.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        {label}
      </p>
      <TalkXNoData hint={FORECAST_EMPTY_HINT} />
    </div>
  );
}

export function TalkXWizardReview({ ed, campaign, onLaunched, onEditStep }: { ed: WizardState; campaign: TalkXCampaign | null; onLaunched: (id: string, status: 'scheduled' | 'sending') => void; onEditStep?: (step: 1 | 2 | 3, returnTo: 4) => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
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
  // X134/T09-018: relativo calculado no fuso da campanha, uma vez por render.
  const schedule = ed.isScheduled && ed.scheduledAt
    ? formatScheduleRelative(ed.scheduledAt, ed.scheduleTimezone)
    : null;
  const scheduleWindow = ed.sendWindowEnabled
    ? `Janela ${ed.sendWindowStart}–${ed.sendWindowEnd}${ed.businessHoursOnly ? ` · horário comercial (${ed.scheduleTimezone})` : ''}`
    : ed.businessHoursOnly
      ? `Somente horário comercial (${ed.scheduleTimezone})`
      : 'Sem janela de envio';
  // X134/T09-020: a linha lista o resultado das duas checagens reais do
  // operador (supressão e consentimento), em vez de um texto fixo.
  const suppressionOk = ed.respectSuppression;
  const consentOk = ed.confirmConsent;
  const complianceOk = suppressionOk && consentOk;
  const complianceSub = complianceOk
    ? 'Supressão aplicada · Consentimento confirmado'
    : [
        !suppressionOk && 'Pendente: lista de supressão desativada',
        !consentOk && 'Pendente: consentimento dos contatos',
      ].filter(Boolean).join(' · ');
  const waOk = !!connection;
  const audienceOk = ed.eligibleCount > 0 || !!campaign;
  const allGood = waOk && audienceOk && (ed.messageTemplate.trim().length > 0 || (ed.hasMedia && ed.mediaUrl.trim().length > 0));
  const launchAllowed = allGood && ed.canProceed[4] && !ed.saving;
  // T09 — CTA do template na prévia: só o que o template carrega (nunca inventado).
  const templateInteractive = templatePreviewInteractive(ed.selectedTemplate);
  // T09 — 2 recomendações REAIS do motor (horário ideal + template campeão).
  // O motor se abstém sem dados (buildInsights devolve []); sem dado não há card.
  const { data: insights } = useTalkXInsights();
  const timingInsight = insights?.find((insight) => insight.id === 'best-hour') ?? null;
  const templateInsight = insights?.find((insight) => insight.id === 'best-template') ?? null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr_0.9fr] gap-4 min-w-0">
      <Section icon={FileText} title="Resumo da campanha" subtitle="Verifique se todas as informações estão corretas.">
        <Row icon={FileText} label="Nome da campanha" value={ed.name || '—'} step={1} onEditStep={onEditStep} />
        <Row icon={Target} label="Objetivo" value={objective} sub={objectiveSub} step={1} onEditStep={onEditStep} />
        <Row icon={ed.audienceSource === 'segment' ? Bookmark : Users} label={ed.audienceSource === 'segment' ? 'Segmentos selecionados' : 'Público selecionado'} value={ed.audienceSource === 'segment' ? (ed.selectedSegments.length > 0 ? ed.selectedSegments.map((s) => s.name).join(', ') : '—') : `${fmtInt(ed.selectedContacts.length)} contatos`} sub={ed.audienceSource === 'segment' ? (ed.selectedSegments.length > 0 ? `${fmtInt(ed.audienceTotal)} contatos na união · ${ed.selectedSegments.map((s) => `${s.name} (${fmtInt(ed.segmentEstimates?.[s.id] ?? s.estimated_count ?? 0)})`).join(' · ')}` : `${fmtInt(ed.audienceTotal)} contatos na união`) : `${fmtInt(ed.eligibleCount)} contatos elegíveis`} ok={audienceOk} step={1} onEditStep={onEditStep} />
        <Row icon={Ban} label="Exclusões / Supressão" value={ed.respectSuppression ? 'Lista de supressão ativa' : 'Supressão desativada'} sub={ed.respectSuppression ? `${fmtInt(ed.suppressedCount)} contatos excluídos` : 'Atenção: opt-outs ainda são pulados no envio'} ok={ed.respectSuppression} step={3} onEditStep={onEditStep} />
        <Row icon={MessageSquare} label="Template de mensagem" value={ed.selectedTemplate?.name ?? 'Mensagem personalizada'} sub={ed.selectedTemplate ? (ed.selectedTemplate.status === 'approved' ? 'Template aprovado' : 'Template em revisão') : `${ed.messageTemplate.length} caracteres`} ok={ed.selectedTemplate ? ed.selectedTemplate.status === 'approved' : undefined} step={2} onEditStep={onEditStep} />
        <Row icon={Sliders} label="Variáveis de personalização" value={variables.length > 0 ? variables.join(', ') : 'Nenhuma'} sub={`${variables.length} variáveis configuradas`} step={2} onEditStep={onEditStep} />
        <Row icon={Gauge} label="Velocidade de entrega" value={SPEED_PROFILES.find((p) => p.value === ed.speedProfile)?.label ?? ed.speedProfile} sub={`~${ed.messagesPerMinute} mensagens/min`} step={3} onEditStep={onEditStep} />
        <Row icon={CalendarDays} label="Agendamento" value={schedule ? `${schedule.when} (${ed.scheduleTimezone})` : 'Imediato ao lançar'} sub={[schedule?.relative, scheduleWindow].filter(Boolean).join(' · ')} step={3} onEditStep={onEditStep} />
        <Row icon={Smartphone} label="Conexão WhatsApp" value={connection ? `${connection.name} (${connection.phone_number || 'sem número'})` : 'Nenhuma conexão'} sub={connection ? 'Conectada e pronta' : 'Selecione uma conexão ativa'} ok={waOk} step={1} onEditStep={onEditStep} />
        <Row icon={ShieldCheck} label="Conformidade" value="LGPD e políticas do WhatsApp" sub={complianceSub} ok={complianceOk} step={3} onEditStep={onEditStep} />
      </Section>

      <Section icon={Smartphone} color="green" title="Prévia no WhatsApp" subtitle="Veja como sua mensagem será exibida para o contato.">
        <WhatsAppBubble text={personalizePreview(ed.messageTemplate, sample, sampleCustomValues)} mediaUrl={ed.hasMedia ? ed.mediaUrl : null} mediaType={ed.hasMedia ? ed.mediaType : null} senderName={connection?.name ?? 'ZAPP'} interactive={templateInteractive} />
      </Section>

      <div className="space-y-4 min-w-0">
        <RailCard icon={Users} title="Resumo operacional">
          <MetaRow icon={Users} label="Público total" value={<span><b className="text-[15px]">{fmtInt(ed.eligibleCount)}</b> <span className="text-foreground-secondary font-normal">contatos elegíveis</span></span>} />
          <MetaRow icon={Clock} label="Tempo estimado de entrega" value={<span><b className="text-[15px]">{ed.estimatedTime ?? '—'}</b> <span className="text-foreground-secondary font-normal">a ~{ed.messagesPerMinute} msg/min</span></span>} />
          <MetaRow icon={Ban} label="Suprimidos" value={<span><b className="text-[15px]">{fmtInt(ed.suppressedCount)}</b> <span className="text-foreground-secondary font-normal">{fmtPct(ed.suppressedCount, ed.audienceTotal)}</span></span>} />
          <ForecastRow icon={MessageSquare} label="Taxa de resposta projetada" />
          <ForecastRow icon={ShieldAlert} label="Risco de opt-out" />
        </RailCard>

        {/* T09 — 2 recomendações REAIS do motor (`useTalkXInsights`, o mesmo das
            telas Resumo/Análise): horário ideal + template campeão, com o selo
            honesto "Heurístico" do `InsightCard`. Sem dado no motor não há card
            (o 3º — reativação/opt-out — fica de fora, como manda o cartão). */}
        {(timingInsight || templateInsight) && (
          <RailCard icon={MessageSquare} title="Recomendações" subtitle="Sinais do histórico da conta.">
            <div className="space-y-2">
              {timingInsight && <InsightCard key={timingInsight.id} {...timingInsight} />}
              {templateInsight && <InsightCard key={templateInsight.id} {...templateInsight} />}
            </div>
          </RailCard>
        )}

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
      </div>

      {/* X051 — o disparo confirma pelo controlador único de ciclo de vida:
          as confirmações obrigatórias (X136) ficam no cartão externo e
          controlam `ed.canProceed[4]` — não são duplicadas dentro do diálogo. */}
      <TalkXConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          const mode = ed.isScheduled && ed.scheduledAt ? 'schedule' : 'launch';
          const id = await ed.handleSave(mode);
          if (!id) throw new Error('O envio não foi aceito pelo servidor. Verifique os dados e tente novamente.');
          onLaunched(id, mode === 'schedule' ? 'scheduled' : 'sending');
        }}
        icon={Send}
        iconColor="blue"
        title="Confirmar disparo?"
        description={ed.isScheduled && ed.scheduledAt
          ? `A campanha ficará agendada para ${formatLocalSchedule(ed.scheduledAt, ed.scheduleTimezone)} e será enviada para ${fmtInt(ed.eligibleCount)} contatos. Esta ação não pode ser desfeita.`
          : `A campanha será enviada para ${fmtInt(ed.eligibleCount)} contatos. Esta ação não pode ser desfeita.`}
        details={[
          { label: 'Campanha', value: ed.name || '—' },
          { label: 'Segmento', value: ed.audienceSource === 'segment' ? (ed.selectedSegments.length > 0 ? ed.selectedSegments.map((s) => s.name).join(', ') : '—') : 'Contatos ZAPP' },
          { label: 'Destinatários', value: `${fmtInt(ed.eligibleCount)} contatos` },
          { label: 'Duração estimada', value: ed.estimatedTime ?? '—' },
          { label: 'Envio', value: ed.isScheduled && ed.scheduledAt ? formatLocalSchedule(ed.scheduledAt, ed.scheduleTimezone) : 'Imediato' },
        ]}
        confirmLabel="Confirmar envio"
        cancelLabel="Cancelar"
        loading={ed.saving}
      />
    </div>
  );
}
