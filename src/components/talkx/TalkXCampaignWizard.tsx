import React, { useEffect } from 'react';
import {
  ArrowLeft, ArrowRight, Zap, FileText, Users, Database, Bookmark, Filter, MessageSquare, Image, Video, Music,
  Paperclip, X, Wand2, BookOpen, Save, Check, Clock, CalendarDays, Ban, Smartphone, Sparkles, RefreshCw,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PrimaryButton, GhostButton, Pill } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { useAudienceEstimate } from '@/hooks/integrations/useTalkXSegments';
import { useCampaignEditor, VARIABLES, MESSAGE_TEMPLATES, MEDIA_TYPES, type WizardStep } from './useCampaignEditor';
import { TalkXContactSelector } from './TalkXContactSelector';
import { TalkXWizardDelivery, TalkXWizardReview } from './TalkXWizardDelivery';
import { IconTile, WhatsAppBubble, OBJECTIVES, fmtInt, fmtPct, personalizePreview, RailCard, MetaRow, fmtDateTime } from './talkxShared';
import { InitialsAvatar } from '@/components/dashboard/overview/DashboardCard';

const MEDIA_ICONS = { image: Image, video: Video, document: FileText, audio: Music } as const;

const STEPS: { n: WizardStep; label: string; hint: string }[] = [
  { n: 1, label: 'Público', hint: 'Segmentos e filtros' },
  { n: 2, label: 'Mensagem', hint: 'Template e conteúdo' },
  { n: 3, label: 'Entrega', hint: 'Agendamento' },
  { n: 4, label: 'Revisão', hint: 'Confira e lance' },
];

interface Props {
  campaign: TalkXCampaign | null;
  onClose: () => void;
  onLaunched?: (campaignId: string) => void;
  initial?: { segmentId?: string; templateId?: string };
}

export type WizardState = ReturnType<typeof useCampaignEditor>;

export function TalkXCampaignWizard({ campaign, onClose, onLaunched, initial }: Props) {
  const ed = useCampaignEditor(campaign, onClose, initial);

  // E61: beforeunload se campanha tem dados nao salvos
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (ed.name.trim().length > 0 || ed.selectedContacts.length > 0) { e.preventDefault(); } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [ed.name, ed.selectedContacts.length]);
  const step = ed.step;

  // E61: deep link ?wizard=<id>&step=N
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wizardId = campaign?.id ?? 'new';
    params.set('wizard', wizardId);
    params.set('step', String(step));
    const newUrl = window.location.pathname + '?' + params.toString();
    window.history.replaceState(null, '', newUrl);
  }, [step, campaign?.id]);
  const next = () => ed.setStep(Math.min(4, step + 1) as WizardStep);
  const prev = () => ed.setStep(Math.max(1, step - 1) as WizardStep);

  const saveDraft = async () => { const id = await ed.handleSave('draft'); if (id) onClose(); };

  return (
    <div className="w-full min-w-0 space-y-4">
      {/* E61: Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground px-0.5">
        <span>Talk X</span>
        <span className="text-border">›</span>
        <span>Campanhas</span>
        <span className="text-border">›</span>
        <span>Nova Campanha</span>
        <span className="text-border">›</span>
        <span className="text-foreground font-medium">{STEPS.find(s => s.n === step)?.label}</span>
      </nav>

            {/* Header + stepper */}
      <div className="rounded-2xl bg-card border border-border/70 p-4 flex flex-col xl:flex-row xl:items-center gap-4">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50 shrink-0" aria-label="Voltar"><ArrowLeft className="w-4 h-4" /></button>
          <IconTile icon={step === 4 ? Check : Zap} color={step === 4 ? 'green' : 'blue'} size={48} />
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold font-display text-foreground tracking-[-0.02em] leading-tight truncate">{step === 4 ? 'Revisão Final' : campaign ? 'Editar campanha' : 'Nova campanha'}</h1>
            <p className="text-[12.5px] text-foreground-secondary">{step === 4 ? 'Confira todos os detalhes da sua campanha antes de lançar.' : 'Configure público, mensagem e entrega com segurança.'}</p>
          </div>
        </div>
        <ol className="flex items-center gap-2 xl:gap-0 flex-wrap">
          {STEPS.map((s, i) => {
            const done = step > s.n; const active = step === s.n;
            return (
              <li key={s.n} className="flex items-center">
                <button type="button" onClick={() => (done || s.n < step) && ed.setStep(s.n)} className="flex items-center gap-2.5 group">
                  <span className={cn('w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold border transition-colors', active ? 'bg-primary border-primary text-white shadow-[0_0_0_4px_hsl(var(--primary)/.2)]' : done ? 'bg-dash-green border-dash-green text-white' : 'border-border/70 text-muted-foreground bg-input/40')}>
                    {done ? <Check className="w-4 h-4" /> : s.n}
                  </span>
                  <span className="hidden md:block text-left">
                    <span className={cn('block text-[13px] font-semibold leading-tight', active ? 'text-foreground' : 'text-foreground-secondary')}>{s.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{s.hint}</span>
                  </span>
                </button>
                {i < STEPS.length - 1 && <span className={cn('hidden xl:block h-px w-10 mx-3', done ? 'bg-dash-green' : 'bg-border')} />}
              </li>
            );
          })}
        </ol>
      </div>

      <div className={cn('grid gap-4 min-w-0', step === 4 ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px]')}>
        <div className="min-w-0 space-y-4">
          {step === 1 && <StepAudience ed={ed} campaign={campaign} />}
          {step === 2 && <StepMessage ed={ed} />}
          {step === 3 && <TalkXWizardDelivery ed={ed} />}
          {step === 4 && <TalkXWizardReview ed={ed} campaign={campaign} onLaunched={(id) => { onLaunched?.(id); onClose(); }} />}

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              {step > 1 && <GhostButton icon={ArrowLeft} onClick={prev}>Voltar</GhostButton>}
              <GhostButton icon={Save} onClick={saveDraft}>{ed.saving ? 'Salvando…' : 'Salvar rascunho'}</GhostButton>
            </div>
            {step < 4 && (
              <PrimaryButton size="lg" onClick={next} className={cn(!ed.canProceed[step] && 'opacity-50 pointer-events-none')}>
                Continuar <ArrowRight className="w-4 h-4" />
              </PrimaryButton>
            )}
          </div>
        </div>

        {step < 4 && <WizardRail ed={ed} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 1 — Público                                                  */
/* ------------------------------------------------------------------ */

function SectionCard({ icon, title, subtitle, right, children }: { icon: React.ElementType; title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const Icon = icon;
  return (
    <section className="rounded-2xl bg-card border border-border/70 p-4 md:p-5">
      <div className="flex items-center gap-3 mb-4">
        <IconTile icon={Icon as never} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-foreground">{title}</p>
          {subtitle && <p className="text-[12px] text-foreground-secondary">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function SourceCard({ icon, title, desc, active, onClick, disabled, badge }: { icon: React.ElementType; title: string; desc: string; active: boolean; onClick: () => void; disabled?: boolean; badge?: string }) {
  const Icon = icon;
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn('relative text-left rounded-xl border p-3.5 transition-all flex items-start gap-3', active ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/.5)]' : 'border-border/70 bg-input/30 hover:border-primary/40', disabled && 'opacity-50 cursor-not-allowed')}>
      <IconTile icon={Icon as never} size={40} color={active ? 'blue' : 'blue'} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-foreground">{title}</p>
        <p className="text-[11.5px] text-foreground-secondary leading-snug mt-0.5">{desc}</p>
        {badge && <span className="inline-block mt-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">{badge}</span>}
      </div>
      <span className={cn('w-4 h-4 rounded-full border-2 shrink-0 mt-0.5', active ? 'border-primary bg-primary shadow-[inset_0_0_0_3px_hsl(var(--card))]' : 'border-border')} />
    </button>
  );
}

function StepAudience({ ed, campaign }: { ed: WizardState; campaign: TalkXCampaign | null }) {
  return (
    <>
      <SectionCard icon={FileText} title="Informações da campanha">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-3">
          <div><Label className="text-[12px] text-foreground-secondary">Nome da campanha</Label><Input value={ed.name} onChange={(e) => ed.setName(e.target.value)} placeholder="Ex: Lançamento Linha Office" className="mt-1.5 h-10 bg-input/40 border-border/70" /></div>
          <div>
            <Label className="text-[12px] text-foreground-secondary">Objetivo</Label>
            <Select value={ed.objective} onValueChange={ed.setObjective}>
              <SelectTrigger className="mt-1.5 h-10 bg-input/40 border-border/70"><SelectValue /></SelectTrigger>
              <SelectContent>{OBJECTIVES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[12px] text-foreground-secondary">Conexão WhatsApp</Label>
            <Select value={ed.connectionId} onValueChange={ed.setConnectionId}>
              <SelectTrigger className="mt-1.5 h-10 bg-input/40 border-border/70"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {(ed.connections ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.phone_number || 'sem número'})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3"><Label className="text-[12px] text-foreground-secondary">Descrição (opcional)</Label><Input value={ed.description} onChange={(e) => ed.setDescription(e.target.value)} placeholder="Produtos em destaque para escritórios" className="mt-1.5 h-10 bg-input/40 border-border/70" /></div>
        {(ed.connections ?? []).length === 0 && <p className="text-[12px] text-dash-amber mt-3 flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" /> Nenhuma conexão WhatsApp conectada — conecte em Conexões antes de enviar.</p>}
      </SectionCard>

      <SectionCard icon={Users} title="Origem do público" subtitle="Escolha de onde virão os contatos para esta campanha.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SourceCard icon={Users} title="Contatos ZAPP" desc="Use seus contatos da plataforma com filtros avançados." active={ed.audienceSource === 'contacts'} onClick={() => ed.setAudienceSource('contacts')} />
          <SourceCard icon={Bookmark} title="Segmento salvo" desc="Utilize um segmento de audiência já salvo." active={ed.audienceSource === 'segment'} onClick={() => ed.setAudienceSource('segment')} disabled={ed.segments.length === 0} badge={ed.segments.length === 0 ? 'Nenhum segmento salvo' : `${ed.segments.length} segmentos`} />
          <SourceCard icon={Database} title="CRM 360°" desc="Selecione contatos do seu CRM com base em negócios e estágios." active={ed.audienceSource === 'crm360'} onClick={() => ed.setAudienceSource('crm360')} disabled badge="Vinculação CRM 360° não configurada" />
        </div>
        {ed.audienceSource === 'segment' && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {ed.segments.map((s) => {
              const active = ed.segmentId === s.id;
              return (
                <button key={s.id} type="button" onClick={() => ed.setSegmentId(s.id)} className={cn('text-left rounded-xl border p-3 transition-all', active ? 'border-primary bg-primary/10' : 'border-border/70 bg-input/30 hover:border-primary/40')}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-foreground truncate">{s.name}</p>
                    <Pill label={s.status === 'active' ? 'Ativo' : 'Inativo'} tone={s.status === 'active' ? 'success' : 'muted'} dot />
                  </div>
                  <p className="text-[11.5px] text-foreground-secondary line-clamp-1 mt-0.5">{s.description || 'Sem descrição'}</p>
                  <p className="text-[12px] font-semibold text-primary-glow mt-1.5">{fmtInt(s.estimated_count)} contatos</p>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>

      {ed.audienceSource === 'contacts' && (
        <SectionCard icon={Filter} title="Filtros de audiência" subtitle="Refine seu público com filtros e selecione os contatos." right={<button type="button" onClick={ed.clearFilters} className="text-[12px] font-medium text-primary-glow hover:underline">Limpar filtros</button>}>
          <TalkXContactSelector
            campaign={campaign}
            contacts={ed.contacts || []}
            filteredContacts={ed.filteredContacts}
            selectedContacts={ed.selectedContacts}
            contactSearch={ed.contactSearch}
            setContactSearch={ed.setContactSearch}
            companyFilter={ed.companyFilter}
            setCompanyFilter={ed.setCompanyFilter}
            tagFilter={ed.tagFilter}
            setTagFilter={ed.setTagFilter}
            companies={ed.companies}
            tags={ed.tags}
            toggleContact={ed.toggleContact}
            selectAll={ed.selectAll}
            clearFilters={ed.clearFilters}
          />
        </SectionCard>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Passo 2 — Mensagem                                                 */
/* ------------------------------------------------------------------ */

function StepMessage({ ed }: { ed: WizardState }) {
  const approved = ed.templates.filter((t) => t.status === 'approved');
  return (
    <>
      <SectionCard icon={MessageSquare} title="Mensagem" subtitle="Escreva sua mensagem e personalize com variáveis."
        right={(
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="h-8 px-3 rounded-lg text-[12px] font-medium text-primary-glow border border-primary/30 bg-primary/10 hover:bg-primary/15 flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" />Templates</button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 max-h-80 overflow-auto">
              {approved.length > 0 && <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Biblioteca</p>}
              {approved.map((t) => (
                <DropdownMenuItem key={t.id} onClick={() => ed.applyTemplate(t.id)} className="flex flex-col items-start gap-0.5">
                  <span className="font-medium text-xs">{t.name}</span><span className="text-[10px] text-muted-foreground line-clamp-1">{t.content}</span>
                </DropdownMenuItem>
              ))}
              <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Rápidos</p>
              {MESSAGE_TEMPLATES.map((t) => (
                <DropdownMenuItem key={t.name} onClick={() => ed.setMessageTemplate(t.template)} className="flex flex-col items-start gap-0.5">
                  <span className="font-medium text-xs">{t.name}</span><span className="text-[10px] text-muted-foreground line-clamp-1">{t.template}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      >
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {[{ v: '', l: 'Texto', I: MessageSquare }, ...MEDIA_TYPES.map((m) => ({ v: m.value, l: m.label, I: MEDIA_ICONS[m.value as keyof typeof MEDIA_ICONS] }))].map(({ v, l, I }) => {
            const active = v === '' ? !ed.hasMedia : ed.hasMedia && ed.mediaType === v;
            return (
              <button key={l} type="button" onClick={() => { if (v === '') ed.toggleMedia(false); else { ed.toggleMedia(true); ed.setMediaType(v); } }} className={cn('h-8 px-3 rounded-lg text-[12px] font-medium border flex items-center gap-1.5 transition-colors', active ? 'bg-primary border-primary text-white' : 'border-border/70 bg-input/40 text-foreground-secondary hover:bg-muted/50')}>
                <I className="w-3.5 h-3.5" />{l}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-3">
          <div className="rounded-xl border border-border/70 bg-input/30 overflow-hidden">
            <Textarea value={ed.messageTemplate} onChange={(e) => ed.setMessageTemplate(e.target.value)} placeholder="{{saudacao}}, {{nome}}! Temos uma novidade especial para a sua empresa…" rows={7} className="resize-none border-0 bg-transparent text-[13.5px] leading-relaxed focus-visible:ring-0" />
            <div className="flex items-center justify-between px-3 py-2 border-t border-border/50 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-2"><Wand2 className="w-3.5 h-3.5" /> Variáveis são substituídas por contato no envio</span>
              <span>{ed.messageTemplate.length}/4096</span>
            </div>
          </div>
          <div className="rounded-xl border border-border/70 bg-input/30 p-3">
            <p className="text-[12px] font-semibold text-foreground mb-2">Variáveis</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <Tooltip key={v.key}>
                  <TooltipTrigger asChild>
                    <button type="button" onClick={() => ed.insertVariable(v.key)} className="h-7 px-2 rounded-md text-[11px] font-mono font-medium border border-primary/30 bg-primary/10 text-primary-glow hover:bg-primary/20">{v.key}</button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]"><p className="text-xs">{v.desc}</p></TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        </div>
        {ed.hasMedia && (
          <div className="mt-3 rounded-xl border border-border/70 bg-input/30 p-3 flex items-center gap-3">
            <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-medium text-foreground">Adicionar mídia ({ed.mediaType || 'imagem'})</p>
              <p className="text-[11px] text-muted-foreground">Imagens, vídeos, documentos ou áudios via URL pública. Máx. 16 MB.</p>
            </div>
            <div className="relative w-full max-w-sm">
              <Input value={ed.mediaUrl} onChange={(e) => ed.setMediaUrl(e.target.value)} placeholder="https://exemplo.com/arquivo.jpg" className="h-9 pr-8 bg-input/40 border-border/70 text-[12.5px]" />
              {ed.mediaUrl && <button type="button" onClick={() => ed.setMediaUrl('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
            </div>
          </div>
        )}
      </SectionCard>

      {ed.templates.length > 0 && (
        <SectionCard icon={Sparkles} title="Sugestões da biblioteca" subtitle="Templates aprovados mais usados.">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {approved.slice(0, 3).map((t) => (
              <button key={t.id} type="button" onClick={() => ed.applyTemplate(t.id)} className={cn('text-left rounded-xl border p-3 transition-all', ed.templateId === t.id ? 'border-primary bg-primary/10' : 'border-border/70 bg-input/30 hover:border-primary/40')}>
                <p className="text-[13px] font-semibold text-foreground truncate">{t.name}</p>
                <p className="text-[11.5px] text-foreground-secondary line-clamp-2 mt-0.5">{t.content}</p>
                <div className="flex items-center gap-2 mt-2"><Badge variant="outline" className="text-[10px] h-4">{t.category}</Badge><span className="text-[10.5px] text-muted-foreground">{fmtInt(t.use_count)} usos</span></div>
              </button>
            ))}
          </div>
        </SectionCard>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Rail — Resumo da campanha + prévia                                  */
/* ------------------------------------------------------------------ */

function StatTile({ icon, color, label, value, sub, subTone }: { icon: React.ElementType; color: 'blue' | 'green' | 'red' | 'violet' | 'amber'; label: string; value: string; sub?: string; subTone?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-input/20 p-3 flex items-start gap-2.5 min-w-0">
      <IconTile icon={icon as never} color={color} size={36} />
      <div className="min-w-0">
        <p className="text-[11px] text-foreground-secondary leading-tight">{label}</p>
        <p className="text-[18px] font-bold text-foreground leading-tight tabular-nums mt-0.5 truncate">{value}</p>
        {sub && <p className={cn('text-[11px] mt-0.5', subTone ?? 'text-muted-foreground')}>{sub}</p>}
      </div>
    </div>
  );
}

function SegmentPreviewCard({ segment, estimatedCount }: { segment: { id: string; name: string; description?: string | null; rules: unknown; estimated_count: number; last_used_at?: string | null }; estimatedCount?: number }) {
  const { data: est, isFetching } = useAudienceEstimate(segment.rules as import('@/hooks/integrations/useTalkXSegments').SegmentRules, true);
  const count = est?.count ?? estimatedCount ?? segment.estimated_count;
  return (
    <RailCard icon={Bookmark} color="violet" title={segment.name} subtitle={segment.description || 'Segmento salvo'}
      right={isFetching ? <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" /> : undefined}
    >
      <p className="text-[11px] text-foreground-secondary">Público estimado</p>
      <p className={cn('text-[24px] font-bold tabular-nums', isFetching ? 'text-muted-foreground opacity-50' : 'text-foreground')}>{fmtInt(count)}<span className="text-[12px] font-normal text-muted-foreground ml-1">contatos</span></p>
      {est?.sample && est.sample.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-foreground-secondary">Amostra (5)</p>
          {est.sample.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <InitialsAvatar name={c.name || '?'} size={24} />
              <div className="min-w-0">
                <p className="text-[11.5px] font-medium text-foreground truncate">{c.name}</p>
                <p className="text-[10.5px] text-foreground-secondary truncate">{c.company || c.phone}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </RailCard>
  );
}

function WizardRail({ ed }: { ed: WizardState }) {
  const sample = ed.contacts?.[0];
  const start = ed.isScheduled && ed.scheduledAt ? fmtDateTime(new Date(ed.scheduledAt).toISOString()) : 'Imediato';
  return (
    <div className="space-y-4 min-w-0">
      <RailCard icon={Zap} title="Resumo da campanha" subtitle="Confira os detalhes da sua campanha antes de continuar.">
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile icon={Users} color="blue" label="Público total (estimado)" value={fmtInt(ed.audienceTotal)} />
          <StatTile icon={Check} color="green" label="Elegíveis para envio" value={fmtInt(ed.eligibleCount)} sub={ed.audienceTotal > 0 ? fmtPct(ed.eligibleCount, ed.audienceTotal) : undefined} subTone="text-dash-green" />
          <StatTile icon={Ban} color="red" label="Bloqueados por supressão" value={fmtInt(ed.suppressedCount)} sub={ed.audienceTotal > 0 ? fmtPct(ed.suppressedCount, ed.audienceTotal) : undefined} subTone="text-dash-red" />
          <StatTile icon={CalendarDays} color="violet" label="Início" value={start === 'Imediato' ? 'Imediato' : start.split(',')[0]} sub={start === 'Imediato' ? 'ao lançar' : start.split(',')[1]?.trim()} />
          <StatTile icon={Clock} color="amber" label="Duração estimada" value={ed.estimatedTime ?? '—'} sub={`~${ed.messagesPerMinute} msg/min`} />
          <StatTile icon={MessageSquare} color="green" label="Canal" value="WhatsApp" sub={ed.hasMedia ? `Texto + ${ed.mediaType}` : 'Mensagem única'} />
        </div>
      </RailCard>
      <RailCard icon={Smartphone} color="green" title="Prévia da mensagem" subtitle={sample ? `Exemplo com ${sample.name}` : 'Exemplo com contato fictício'}>
        <WhatsAppBubble text={personalizePreview(ed.messageTemplate, sample)} mediaUrl={ed.hasMedia ? ed.mediaUrl : null} mediaType={ed.hasMedia ? ed.mediaType : null} />
      </RailCard>
      {ed.selectedSegment && <SegmentPreviewCard segment={ed.selectedSegment} estimatedCount={ed.segmentEstimate} />}
    </div>
  );
}
