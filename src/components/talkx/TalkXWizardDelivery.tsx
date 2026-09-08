import React, { useState } from 'react';
import {
  CalendarDays, Clock, Gauge, ShieldCheck, Users, Send, MessageSquare, Target, Bookmark, Ban, FileText,
  Sliders, Smartphone, ShieldAlert, Check, Rocket, Pencil, X, AlertTriangle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PrimaryButton, GhostButton, Pill } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import type { WizardState } from './TalkXCampaignWizard';
import { IconTile, WhatsAppBubble, RailCard, MetaRow, OBJECTIVES, SPEED_PROFILES, fmtInt, fmtPct, fmtDateTime, fmtDurationShort, personalizePreview, extractVariables } from './talkxShared';

function Section({ icon, color = 'blue', title, subtitle, right, children }: { icon: React.ElementType; color?: 'blue' | 'green' | 'red' | 'violet' | 'amber'; title: string; subtitle?: string; right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card border border-border/70 p-4 md:p-5">
      <div className="flex items-center gap-3 mb-4">
        <IconTile icon={icon as never} color={color} size={40} />
        <div className="min-w-0 flex-1"><p className="text-[15px] font-bold text-foreground">{title}</p>{subtitle && <p className="text-[12px] text-foreground-secondary">{subtitle}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

function OptionPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('h-10 px-3.5 rounded-xl border text-[12.5px] font-medium flex items-center gap-2 transition-colors', active ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 bg-input/30 text-foreground-secondary hover:border-primary/40')}>
      <span className={cn('w-3.5 h-3.5 rounded-full border-2', active ? 'border-primary bg-primary shadow-[inset_0_0_0_2.5px_hsl(var(--card))]' : 'border-border')} />{label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 3 — Entrega / Agendamento                                    */
/* ------------------------------------------------------------------ */

export function TalkXWizardDelivery({ ed }: { ed: WizardState }) {
  const [minLocal] = useState<string>(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  return (
    <>
      <Section icon={CalendarDays} title="Configurações de agendamento" subtitle="Defina quando, como e em que condições a campanha será enviada."
        right={<Pill label={ed.isScheduled && ed.scheduledAt ? `Agendada para ${fmtDateTime(new Date(ed.scheduledAt).toISOString())}` : 'Envio imediato ao lançar'} tone={ed.isScheduled ? 'success' : 'info'} dot />}
      >
        <div className="flex flex-wrap gap-2 mb-4">
          <OptionPill active={!ed.isScheduled} label="Enviar ao lançar" onClick={() => ed.toggleSchedule(false)} />
          <OptionPill active={ed.isScheduled} label="Agendar data e hora" onClick={() => ed.toggleSchedule(true)} />
        </div>
        {ed.isScheduled && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-[12px] text-foreground-secondary">Data e horário de início</Label>
              <Input type="datetime-local" value={ed.scheduledAt} min={minLocal} onChange={(e) => ed.setScheduledAt(e.target.value)} className="mt-1.5 h-10 bg-input/40 border-border/70" />
            </div>
            <div>
              <Label className="text-[12px] text-foreground-secondary">Fuso horário</Label>
              <div className="mt-1.5 h-10 rounded-md border border-border/70 bg-input/40 px-3 flex items-center text-[13px] text-foreground">{Intl.DateTimeFormat().resolvedOptions().timeZone} (local)</div>
            </div>
          </div>
        )}
      </Section>

      <Section icon={Clock} color="violet" title="Janela de envio" subtitle="Período do dia em que os envios podem ser realizados."
        right={<Switch checked={ed.sendWindowEnabled} onCheckedChange={ed.setSendWindowEnabled} />}
      >
        <div className={cn('grid grid-cols-1 md:grid-cols-[1fr_1fr_1.4fr] gap-3', !ed.sendWindowEnabled && 'opacity-50 pointer-events-none')}>
          <div><Label className="text-[12px] text-foreground-secondary">Início da janela</Label><Input type="time" value={ed.sendWindowStart} onChange={(e) => ed.setSendWindowStart(e.target.value)} className="mt-1.5 h-10 bg-input/40 border-border/70" /></div>
          <div><Label className="text-[12px] text-foreground-secondary">Fim da janela</Label><Input type="time" value={ed.sendWindowEnd} onChange={(e) => ed.setSendWindowEnd(e.target.value)} className="mt-1.5 h-10 bg-input/40 border-border/70" /></div>
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-primary-glow shrink-0 mt-0.5" />
            <div><p className="text-[12.5px] font-semibold text-foreground">Envios apenas neste período</p><p className="text-[11.5px] text-foreground-secondary">Fora da janela, o envio pausa e retoma automaticamente no próximo início ({ed.sendWindowStart}), no horário de Brasília.</p></div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-input/20 p-3">
          <div className="flex items-center gap-3">
            <IconTile icon={CalendarDays as never} size={36} />
            <div><p className="text-[13px] font-semibold text-foreground">Limitar por horário comercial</p><p className="text-[11.5px] text-foreground-secondary">Envia somente de segunda a sexta, das 08:00 às 18:00 (Brasília).</p></div>
          </div>
          <div className="flex items-center gap-2"><span className={cn('text-[12px] font-semibold', ed.businessHoursOnly ? 'text-dash-green' : 'text-muted-foreground')}>{ed.businessHoursOnly ? 'Ativado' : 'Desativado'}</span><Switch checked={ed.businessHoursOnly} onCheckedChange={ed.setBusinessHoursOnly} /></div>
        </div>
      </Section>

      <Section icon={Gauge} color="green" title="Throttle / Simulação humana" subtitle="Controla a velocidade de envio para um comportamento mais natural.">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-4">
          <div className="space-y-4">
            <div>
              <Label className="text-[12px] text-foreground-secondary">Velocidade de envio</Label>
              <div className="flex flex-col gap-2 mt-1.5">
                {SPEED_PROFILES.map((p) => <OptionPill key={p.value} active={ed.speedProfile === p.value} label={`${p.label} · ${p.interval[0]}–${p.interval[1]}s entre mensagens`} onClick={() => ed.setSpeedProfile(p.value)} />)}
              </div>
            </div>
          </div>
          <div className="space-y-5 rounded-xl border border-border/60 bg-input/20 p-4">
            <div>
              <div className="flex justify-between mb-2"><Label className="text-[12px] text-foreground-secondary">Tempo "digitando…"</Label><span className="text-[11px] font-mono text-foreground">{ed.typingDelay[0]}s – {ed.typingDelay[1]}s</span></div>
              <Slider value={ed.typingDelay} onValueChange={ed.setTypingDelay} min={0.5} max={10} step={0.5} />
            </div>
            <div>
              <div className="flex justify-between mb-2"><Label className="text-[12px] text-foreground-secondary">Intervalo entre envios</Label><span className="text-[11px] font-mono text-foreground">{ed.sendInterval[0]}s – {ed.sendInterval[1]}s</span></div>
              <Slider value={ed.sendInterval} onValueChange={ed.setSendInterval} min={3} max={60} step={1} />
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 flex items-start gap-2.5">
              <Sliders className="w-4 h-4 text-primary-glow shrink-0 mt-0.5" />
              <div><p className="text-[12.5px] font-semibold text-foreground">Simulação humana ativa</p><p className="text-[11.5px] text-foreground-secondary">~{ed.messagesPerMinute} mensagens/min · {ed.estimatedTime ? `duração estimada ${ed.estimatedTime}` : 'selecione o público para estimar a duração'}.</p></div>
            </div>
          </div>
        </div>
      </Section>

      <Section icon={ShieldCheck} color="amber" title="Confirmação e supressão" subtitle="Evita o envio para contatos que não devem receber.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-input/20 p-3 cursor-pointer">
            <Checkbox checked={ed.respectSuppression} onCheckedChange={(v) => ed.setRespectSuppression(!!v)} className="mt-0.5" />
            <div><p className="text-[13px] font-medium text-foreground">Não enviar para contatos em lista de supressão</p><p className="text-[11.5px] text-foreground-secondary">Opt-outs, bloqueios manuais e LGPD são removidos do público{ed.suppressedCount > 0 ? ` (${ed.suppressedCount} no público atual)` : ''}.</p></div>
          </label>
          <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-input/20 p-3">
            <Checkbox checked disabled className="mt-0.5" />
            <div><p className="text-[13px] font-medium text-foreground">Respeitar opt-outs e bloqueados no envio</p><p className="text-[11.5px] text-foreground-secondary">O motor de envio sempre pula contatos suprimidos, mesmo os adicionados após o agendamento.</p></div>
          </div>
        </div>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 4 — Revisão final                                            */
/* ------------------------------------------------------------------ */

const Row = ({ icon, label, value, sub, ok, step, ed }: { icon: React.ElementType; label: string; value: React.ReactNode; sub?: React.ReactNode; ok?: boolean; step: 1 | 2 | 3; ed: WizardState }) => (
    <div className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
      <IconTile icon={icon as never} size={36} color={ok === false ? 'red' : 'blue'} />
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] text-foreground-secondary">{label}</p>
        <p className="text-[13px] font-semibold text-foreground truncate">{value}</p>
        {sub && <p className={cn('text-[11.5px]', ok === false ? 'text-dash-red' : ok ? 'text-dash-green' : 'text-muted-foreground')}>{sub}</p>}
      </div>
      <button type="button" onClick={() => ed.setStep(step)} className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-[12px] font-medium text-foreground-secondary hover:bg-muted/50 flex items-center gap-1.5 shrink-0"><Pencil className="w-3 h-3" />Editar</button>
    </div>
  );

export function TalkXWizardReview({ ed, campaign, onLaunched }: { ed: WizardState; campaign: TalkXCampaign | null; onLaunched: (id: string) => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sample = ed.contacts?.[0];
  const variables = extractVariables(ed.messageTemplate);
  const objective = OBJECTIVES.find((o) => o.value === ed.objective)?.label ?? ed.objective;
  const connection = (ed.connections ?? []).find((c) => c.id === ed.connectionId);
  const responses = null; // sem histórico de respostas no motor atual — não estimamos
  const waOk = !!connection;
  const audienceOk = ed.eligibleCount > 0 || !!campaign;
  const allGood = waOk && audienceOk && ed.messageTemplate.trim().length > 0;

  const launch = async () => {
    setError(null);
    try {
      const id = await ed.handleSave(ed.isScheduled && ed.scheduledAt ? 'schedule' : 'launch');
      if (id) { setConfirmOpen(false); onLaunched(id); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao lançar a campanha');
    }
  };


  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr_0.9fr] gap-4 min-w-0">
      <Section icon={FileText} title="Resumo da campanha" subtitle="Verifique se todas as informações estão corretas.">
        <Row icon={FileText} label="Nome da campanha" value={ed.name || '—'} step={1} ed={ed} />
        <Row icon={Target} label="Objetivo" value={objective} sub={ed.description || undefined} step={1} ed={ed} />
        <Row icon={ed.audienceSource === 'segment' ? Bookmark : Users} label={ed.audienceSource === 'segment' ? 'Segmento selecionado' : 'Público selecionado'} value={ed.audienceSource === 'segment' ? ed.selectedSegment?.name ?? '—' : `${fmtInt(ed.selectedContacts.length)} contatos`} sub={`${fmtInt(ed.eligibleCount)} contatos elegíveis`} ok={audienceOk} step={1} ed={ed} />
        <Row icon={Ban} label="Exclusões / Supressão" value={ed.respectSuppression ? 'Lista de supressão ativa' : 'Supressão desativada'} sub={ed.respectSuppression ? `${fmtInt(ed.suppressedCount)} contatos excluídos` : 'Atenção: opt-outs ainda são pulados no envio'} ok={ed.respectSuppression} step={3} ed={ed} />
        <Row icon={MessageSquare} label="Template de mensagem" value={ed.selectedTemplate?.name ?? 'Mensagem personalizada'} sub={ed.selectedTemplate ? (ed.selectedTemplate.status === 'approved' ? 'Template aprovado' : 'Template em revisão') : `${ed.messageTemplate.length} caracteres`} ok={ed.selectedTemplate ? ed.selectedTemplate.status === 'approved' : undefined} step={2} ed={ed} />
        <Row icon={Sliders} label="Variáveis de personalização" value={variables.length > 0 ? variables.join(', ') : 'Nenhuma'} sub={`${variables.length} variáveis configuradas`} step={2} ed={ed} />
        <Row icon={Gauge} label="Velocidade de entrega" value={SPEED_PROFILES.find((p) => p.value === ed.speedProfile)?.label ?? ed.speedProfile} sub={`~${ed.messagesPerMinute} mensagens/min`} step={3} ed={ed} />
        <Row icon={CalendarDays} label="Agendamento" value={ed.isScheduled && ed.scheduledAt ? fmtDateTime(new Date(ed.scheduledAt).toISOString()) : 'Imediato ao lançar'} sub={ed.sendWindowEnabled ? `Janela ${ed.sendWindowStart}–${ed.sendWindowEnd}${ed.businessHoursOnly ? ' · horário comercial' : ''}` : ed.businessHoursOnly ? 'Somente horário comercial' : 'Sem janela de envio'} step={3} ed={ed} />
        <Row icon={Smartphone} label="Conexão WhatsApp" value={connection ? `${connection.name} (${connection.phone_number || 'sem número'})` : 'Nenhuma conexão'} sub={connection ? 'Conectada e pronta' : 'Selecione uma conexão ativa'} ok={waOk} step={1} ed={ed} />
        <Row icon={ShieldCheck} label="Conformidade" value="LGPD e políticas do WhatsApp" sub={ed.respectSuppression && ed.confirmConsent ? 'Verificações confirmadas' : 'Confirme as verificações abaixo'} ok={ed.respectSuppression && ed.confirmConsent} step={3} ed={ed} />
      </Section>

      <Section icon={Smartphone} color="green" title="Prévia no WhatsApp" subtitle="Veja como sua mensagem será exibida para o contato.">
        <WhatsAppBubble text={personalizePreview(ed.messageTemplate, sample)} mediaUrl={ed.hasMedia ? ed.mediaUrl : null} mediaType={ed.hasMedia ? ed.mediaType : null} senderName={connection?.name ?? 'ZAPP'} />
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
              <span className="text-[12.5px] text-foreground leading-snug">{c.l}</span>
            </label>
          ))}
        </RailCard>

        <div className={cn('rounded-2xl border p-4 flex items-start gap-3', allGood ? 'border-dash-green/40 bg-dash-green/10' : 'border-dash-amber/40 bg-dash-amber/10')}>
          <div className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', allGood ? 'bg-dash-green text-white' : 'bg-dash-amber text-black')}>{allGood ? <Check className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}</div>
          <div>
            <p className="text-[13.5px] font-bold text-foreground">{allGood ? 'Tudo pronto para lançar!' : 'Pendências antes de lançar'}</p>
            <p className="text-[12px] text-foreground-secondary">{allGood ? 'Sua campanha está configurada e em conformidade com as políticas do WhatsApp.' : !waOk ? 'Selecione uma conexão WhatsApp ativa.' : !audienceOk ? 'Nenhum contato elegível no público.' : 'Escreva a mensagem da campanha.'}</p>
          </div>
        </div>

        <PrimaryButton size="lg" icon={Rocket} className={cn('w-full justify-center h-12 text-[15px]', (!allGood || !ed.canProceed[4]) && 'opacity-50 pointer-events-none')} onClick={() => setConfirmOpen(true)}>
          {ed.isScheduled && ed.scheduledAt ? 'Agendar campanha' : 'Lançar campanha'}
        </PrimaryButton>
        {error && <p className="text-[12px] text-dash-red">{error}</p>}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md rounded-2xl border-border/70">
          <DialogHeader>
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center mb-2"><Send className="w-7 h-7 text-primary-glow" /></div>
            <DialogTitle className="text-center text-[20px] font-bold">Confirmar disparo?</DialogTitle>
            <DialogDescription className="text-center text-[12.5px]">
              {ed.isScheduled && ed.scheduledAt ? `A campanha ficará agendada para ${fmtDateTime(new Date(ed.scheduledAt).toISOString())}` : 'Após o lançamento, a campanha será enviada'} para <b className="text-foreground">{fmtInt(ed.eligibleCount)} contatos</b>. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-border/60 bg-input/20 p-3 space-y-1.5 text-[12.5px]">
            {[['Campanha', ed.name], ['Público', ed.audienceSource === 'segment' ? ed.selectedSegment?.name ?? '—' : 'Contatos ZAPP'], ['Destinatários', `${fmtInt(ed.eligibleCount)} contatos`], ['Duração estimada', ed.estimatedTime ?? '—'], ['Envio', ed.isScheduled && ed.scheduledAt ? 'Agendado' : 'Imediato']].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><span className="text-foreground-secondary">{k}</span><span className="font-medium text-foreground text-right truncate">{v}</span></div>
            ))}
          </div>
          <div className="space-y-1.5 text-[12px]">
            {[ed.confirmConsent, ed.confirmContent, ed.confirmSuppression].every(Boolean) && ['Consentimento dos contatos confirmado', 'Conteúdo da mensagem revisado', 'Lista de supressão aplicada'].map((t) => (
              <p key={t} className="flex items-center gap-2 text-dash-green"><Check className="w-3.5 h-3.5" /> <span className="text-foreground">{t}</span></p>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <GhostButton icon={X} onClick={() => setConfirmOpen(false)}>Cancelar</GhostButton>
            <PrimaryButton icon={Send} onClick={launch} className={cn(ed.saving && 'opacity-60 pointer-events-none')}>{ed.saving ? 'Lançando…' : ed.isScheduled && ed.scheduledAt ? 'Confirmar agendamento' : 'Confirmar lançamento'}</PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
