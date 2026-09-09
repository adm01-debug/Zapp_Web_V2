import React, { useState, useCallback, useRef } from 'react';
import {
  X, Check, Copy, Bold, Italic, List, Smile, Hash, ChevronLeft, FileText, BarChart3, Image, Video, Music,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PrimaryButton, GhostButton, Pill } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { useTalkXTemplates, type TalkXTemplate, type TemplateInput } from '@/hooks/integrations/useTalkXTemplates';
import {
  IconTile, RailCard, PhoneFrame, TalkXSkeletonRows, TEMPLATE_CATEGORIES, TEMPLATE_STATUS,
  VARIABLE_KEYS, personalizePreview, fmtInt,
} from './talkxShared';

interface Props {
  templates: TalkXTemplate[];
  isLoading: boolean;
  editing: TalkXTemplate | null;
  onClose: () => void;
}

export function TalkXTemplateEditor({ templates, isLoading, editing, onClose }: Props) {
  const { createTemplate, updateTemplate, duplicateTemplate } = useTalkXTemplates();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Inicializa campos do template sendo editado
  const [eName, setEName] = useState(editing?.name ?? '');
  const [eDesc, setEDesc] = useState(editing?.description ?? '');
  const [eCat, setECat] = useState(editing?.category ?? 'geral');
  const [eContent, setEContent] = useState(editing?.content ?? '');
  const [eMediaUrl, setEMediaUrl] = useState(editing?.media_url ?? '');
  const [eMediaType, setEMediaType] = useState(editing?.media_type ?? '');
  const [eHasMedia, setEHasMedia] = useState(!!editing?.media_url);
  const [eStatus, setEStatus] = useState<'draft' | 'review' | 'approved'>(editing?.status ?? 'approved');
  const [eTags, setETags] = useState<string[]>(editing?.tags ?? []);
  const [eTagInput, setETagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(editing?.id ?? null);
  const [libSearch, setLibSearch] = useState('');
  const [libCat, setLibCat] = useState('all');

  // Dirty-check: qualquer campo alterado em relação ao original
  const isDirty = editing
    ? eName !== editing.name
      || eDesc !== (editing.description ?? '')
      || eCat !== editing.category
      || eContent !== editing.content
      || eStatus !== editing.status
      || JSON.stringify(eTags) !== JSON.stringify(editing.tags ?? [])
      || eHasMedia !== !!editing.media_url
      || eMediaUrl !== (editing.media_url ?? '')
      || eMediaType !== (editing.media_type ?? '')
    : eName.trim().length > 0 || eContent.trim().length > 0;

  const save = async () => {
    if (saving) return;
    if (!eName.trim() || !eContent.trim()) return;
    setSaving(true);
    const payload: TemplateInput = {
      name: eName, description: eDesc || null, category: eCat, content: eContent,
      media_url: eHasMedia && eMediaUrl ? eMediaUrl : null,
      media_type: eHasMedia && eMediaType ? eMediaType : null,
      tags: eTags, status: eStatus,
    };
    try {
      if (activeTemplateId) await updateTemplate.mutateAsync({ id: activeTemplateId, ...payload });
      else await createTemplate.mutateAsync(payload);
      onClose();
    } finally { setSaving(false); }
  };

  const loadTemplate = (t: TalkXTemplate) => {
    setActiveTemplateId(t.id);
    setEName(t.name); setEDesc(t.description ?? ''); setECat(t.category);
    setEContent(t.content); setEMediaUrl(t.media_url ?? ''); setEMediaType(t.media_type ?? '');
    setEHasMedia(!!t.media_url); setEStatus(t.status); setETags(t.tags ?? []);
  };

  /** Insere markup na posicao do cursor no textarea */
  const insertAtCursor = useCallback((prefix: string, suffix = '', placeholder = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = eContent.slice(start, end) || placeholder;
    const before = eContent.slice(0, start);
    const after = eContent.slice(end);
    const next = (before + prefix + selected + suffix + after).slice(0, 1024);
    setEContent(next);
    // Reposiciona cursor apos a insercao
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + prefix.length + selected.length + suffix.length;
      el.setSelectionRange(cursor, cursor);
    });
  }, [eContent]);

  const libFiltered = templates.filter((t) => {
    const q = libSearch.toLowerCase();
    const matchCat = libCat === 'all' || t.category === libCat;
    const matchQ = !q || t.name.toLowerCase().includes(q) || t.category.includes(q);
    return matchCat && matchQ;
  });

  return (
    <div className="flex gap-4 min-w-0" style={{ minHeight: 'calc(100vh - 160px)' }}>
      {/* === COLUNA ESQUERDA: biblioteca === */}
      <aside className="hidden lg:flex flex-col w-[220px] xl:w-[240px] flex-shrink-0 gap-3">
        <div className="rounded-2xl bg-card border border-border/70 p-3 flex flex-col gap-2 flex-1">
          <p className="text-[12.5px] font-semibold text-foreground">Biblioteca</p>
          <Input
            value={libSearch}
            onChange={(e) => setLibSearch(e.target.value)}
            placeholder="Buscar…"
            className="h-8 text-[12px] bg-input/40 border-border/70"
          />
          {/* Chips de categoria */}
          <div className="flex flex-wrap gap-1">
            {(['all', ...TEMPLATE_CATEGORIES]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setLibCat(c)}
                className={cn(
                  'h-6 px-2 rounded-md text-[10.5px] font-medium border transition-colors',
                  libCat === c
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:border-primary/40',
                )}
              >
                {c === 'all' ? 'Todos' : c}
              </button>
            ))}
          </div>
          {/* Lista compacta */}
          <div className="flex-1 overflow-y-auto space-y-1">
            {isLoading
              ? <TalkXSkeletonRows rows={5} />
              : libFiltered.length === 0
                ? <p className="text-[11.5px] text-muted-foreground text-center pt-4">Nenhum template</p>
                : libFiltered.map((t) => {
                  const sm = TEMPLATE_STATUS[t.status] ?? TEMPLATE_STATUS.draft;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => loadTemplate(t)}
                      className={cn(
                        'w-full text-left rounded-xl px-2 py-1.5 border transition-colors',
                        editing?.id === t.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border/50 hover:border-primary/30 hover:bg-muted/20',
                      )}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', sm.tone === 'success' ? 'bg-dash-green' : sm.tone === 'muted' ? 'bg-muted-foreground' : 'bg-dash-amber')} />
                        <p className="text-[11px] font-semibold text-foreground truncate flex-1">{t.name}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{t.category} · {fmtInt(t.use_count)} usos</p>
                    </button>
                  );
                })
            }
          </div>
        </div>
      </aside>

      {/* === COLUNA CENTRO: editor === */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Header */}
        <div className="rounded-2xl bg-card border border-border/70 p-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (isDirty && !confirm('Descartar alterações?')) return;
              onClose();
            }}
            className="h-9 w-9 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50 shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <IconTile icon={FileText} size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-[19px] font-bold font-display text-foreground">{editing ? 'Editar template' : 'Novo template'}</p>
            <p className="text-[12px] text-foreground-secondary">Personalize a mensagem e adicione variáveis</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editing && (
              <GhostButton icon={Copy} onClick={() => { duplicateTemplate.mutate(editing); onClose(); }}>Duplicar</GhostButton>
            )}
            <PrimaryButton
              icon={saving ? undefined : Check}
              onClick={save}
              className={cn((!eName.trim() || !eContent.trim() || saving) && 'opacity-50 pointer-events-none')}
            >
              {saving ? 'Salvando…' : 'Salvar template'}
            </PrimaryButton>
          </div>
        </div>

        {/* Campos */}
        <section className="rounded-2xl bg-card border border-border/70 p-4 md:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-3">
            <div><Label className="text-[12px] text-foreground-secondary">Nome do Template</Label><Input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="Boas-vindas" className="mt-1.5 h-10 bg-input/40 border-border/70" /></div>
            <div>
              <Label className="text-[12px] text-foreground-secondary">Categoria</Label>
              <Select value={eCat} onValueChange={setECat}>
                <SelectTrigger className="mt-1.5 h-10 bg-input/40 border-border/70"><SelectValue /></SelectTrigger>
                <SelectContent>{TEMPLATE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[12px] text-foreground-secondary">Status</Label>
              <Select value={eStatus} onValueChange={(v) => setEStatus(v as 'draft' | 'review' | 'approved')}>
                <SelectTrigger className="mt-1.5 h-10 bg-input/40 border-border/70"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TEMPLATE_STATUS).map(([v, m]) => <SelectItem key={v} value={v}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Toolbar WhatsApp */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-[12px] text-foreground-secondary">Mensagem</Label>
              <span className={cn('text-[11px]', eContent.length > 980 ? 'text-dash-red' : 'text-muted-foreground')}>{eContent.length}/1024</span>
            </div>
            {/* Toolbar */}
            <div className="flex items-center gap-1 mb-1.5 p-1 rounded-t-lg border border-border/60 bg-muted/20 border-b-0">
              <button type="button" title="Negrito (*texto*)" onClick={() => insertAtCursor('*', '*', 'texto')} className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted/50 text-foreground-secondary hover:text-foreground"><Bold className="w-3.5 h-3.5" /></button>
              <button type="button" title="Itálico (_texto_)" onClick={() => insertAtCursor('_', '_', 'texto')} className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted/50 text-foreground-secondary hover:text-foreground"><Italic className="w-3.5 h-3.5" /></button>
              <button type="button" title="Lista (- item)" onClick={() => insertAtCursor('\n- ', '', 'item')} className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted/50 text-foreground-secondary hover:text-foreground"><List className="w-3.5 h-3.5" /></button>
              <div className="w-px h-4 bg-border/60 mx-0.5" />
              {VARIABLE_KEYS.slice(0, 6).map((v) => (
                <button key={v} type="button" title={`Inserir ${v}`} onClick={() => insertAtCursor(v)} className="h-7 px-1.5 rounded text-[10px] font-mono border border-primary/30 bg-primary/10 text-primary-glow hover:bg-primary/20 whitespace-nowrap">{v.replace(/[{}]/g, '')}</button>
              ))}
              <button type="button" title="Mais variáveis" className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted/50 text-foreground-secondary"><Hash className="w-3.5 h-3.5" /></button>
              <div className="w-px h-4 bg-border/60 mx-0.5" />
              <button type="button" title="Emoji" className="h-7 w-7 rounded flex items-center justify-center hover:bg-muted/50 text-foreground-secondary"><Smile className="w-3.5 h-3.5" /></button>
            </div>
            <Textarea
              ref={textareaRef}
              value={eContent}
              onChange={(e) => setEContent(e.target.value.slice(0, 1024))}
              rows={7}
              className="resize-none bg-input/40 border-border/70 text-[13.5px] leading-relaxed font-mono rounded-t-none border-t-0 rounded-tl-none rounded-tr-none"
              placeholder="{{saudacao}}, {{nome}}! Temos uma novidade especial…"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); void save(); }
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void save(); }
              }}
            />
          </div>

          {/* Todas as variáveis disponíveis */}
          <div>
            <p className="text-[11.5px] text-foreground-secondary mb-1.5">Variáveis disponíveis</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLE_KEYS.map((v) => (
                <button key={v} type="button" onClick={() => insertAtCursor(v)} className="h-7 px-2 rounded-md text-[11px] font-mono font-medium border border-primary/30 bg-primary/10 text-primary-glow hover:bg-primary/20">{v}</button>
              ))}
            </div>
          </div>

          {/* Mídia */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Label className="text-[12px] text-foreground-secondary">Mídia (opcional)</Label>
              <div className="flex gap-1.5">
                {[{ v: '', l: 'Sem mídia', icon: X }, { v: 'image', l: 'Imagem', icon: Image }, { v: 'video', l: 'Vídeo', icon: Video }, { v: 'document', l: 'Doc', icon: FileText }, { v: 'audio', l: 'Áudio', icon: Music }].map(({ v, l, icon: Icon }) => {
                  const active = v === '' ? !eHasMedia : eHasMedia && eMediaType === v;
                  return (
                    <button key={l} type="button" onClick={() => {
                      if (v === '') { setEHasMedia(false); setEMediaType(''); }
                      else { setEHasMedia(true); setEMediaType(v); }
                    }} className={cn('h-7 px-2 rounded-md text-[11px] font-medium border flex items-center gap-1', active ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 text-muted-foreground hover:border-primary/40')}>
                      <Icon className="w-3 h-3" />{l}
                    </button>
                  );
                })}
              </div>
            </div>
            {eHasMedia && <Input value={eMediaUrl} onChange={(e) => setEMediaUrl(e.target.value)} placeholder="URL da mídia (ex: https://…/imagem.jpg)" className="h-9 bg-input/40 border-border/70 text-[12.5px]" />}
          </div>

          {/* Tags */}
          <div>
            <Label className="text-[12px] text-foreground-secondary">Tags</Label>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {eTags.map((t) => (
                <span key={t} className="flex items-center gap-1 h-7 px-2 rounded-lg bg-primary/10 border border-primary/20 text-[12px] font-medium text-primary-glow">
                  #{t}
                  <button type="button" onClick={() => setETags((p) => p.filter((x) => x !== t))} className="hover:text-dash-red"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <Input
                value={eTagInput}
                onChange={(e) => setETagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && eTagInput.trim()) {
                    setETags((p) => [...new Set([...p, eTagInput.trim().toLowerCase()])]);
                    setETagInput('');
                    e.preventDefault();
                  }
                }}
                placeholder="+ tag (Enter)"
                className="h-7 w-32 bg-input/40 border-border/70 text-[12px]"
              />
            </div>
          </div>
        </section>
      </div>

      {/* === COLUNA DIREITA: preview === */}
      <aside className="hidden xl:flex flex-col w-[300px] flex-shrink-0 gap-3">
        <RailCard icon={FileText} color="green" title="Pré-visualização" subtitle="Como aparece no WhatsApp">
          <PhoneFrame
            text={personalizePreview(eContent)}
            mediaUrl={eHasMedia ? eMediaUrl : null}
            mediaType={eHasMedia ? eMediaType : null}
          />
        </RailCard>
        {editing && (
          <RailCard icon={BarChart3} title="Desempenho" subtitle={`${fmtInt(editing.use_count)} usos totais`}>
            <div className="grid grid-cols-2 gap-2 text-center">
              {([['—', 'Taxa resposta'], ['—', 'Conversão'], ['—', 'Rejeição'], [fmtInt(editing.use_count), 'Envios']]).map(([v, l]) => (
                <div key={l} className="rounded-xl bg-muted/30 border border-border/50 py-2 px-1">
                  <p className="text-[14px] font-bold text-foreground tabular-nums">{v}</p>
                  <p className="text-[10px] text-foreground-secondary">{l}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(editing.tags ?? []).map((t) => <Badge key={t} variant="outline" className="text-[10.5px]">#{t}</Badge>)}
            </div>
          </RailCard>
        )}
      </aside>
    </div>
  );
}
