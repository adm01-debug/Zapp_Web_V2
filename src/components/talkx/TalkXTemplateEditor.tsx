import React, { useState, useCallback, useRef } from 'react';
import {
  X, Check, Copy, Bold, Italic, List, Smile, Hash, ChevronLeft, FileText, BarChart3, Image, Video, Music, Send, CheckCircle, XCircle, History, RotateCcw,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
  const { createTemplate, updateTemplate, duplicateTemplate, testTemplate, fetchVersionHistory, saveVersionSnapshot } = useTalkXTemplates();
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
  const [eCustomVars, setECustomVars] = useState<string[]>(editing?.custom_variables ?? []);
  const [eCustomVarInput, setECustomVarInput] = useState('');
  // E47: test sheet
  const [showTest, setShowTest] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(editing?.id ?? null);
  const [versions, setVersions] = useState<Array<{
    id: string; version_number: number; name: string; content: string;
    category: string; status: string; media_url: string|null; media_type: string|null;
    tags: string[]; custom_variables: string[]; created_at: string;
  }>>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [libSearch, setLibSearch] = useState('');
  const [libCat, setLibCat] = useState('all');

  // Template ativo derivado de activeTemplateId (pode diferir de editing apos carga da biblioteca)
  const activeTemplate = templates.find((t) => t.id === activeTemplateId) ?? editing;

  // Dirty-check: qualquer campo alterado em relação ao original
  const isDirty = activeTemplate
    ? eName !== activeTemplate.name
      || eDesc !== (activeTemplate.description ?? '')
      || eCat !== activeTemplate.category
      || eContent !== activeTemplate.content
      || eStatus !== activeTemplate.status
      || JSON.stringify(eTags) !== JSON.stringify(activeTemplate.tags ?? [])
      || eHasMedia !== !!activeTemplate.media_url
      || eMediaUrl !== (activeTemplate.media_url ?? '')
      || eMediaType !== (activeTemplate.media_type ?? '')
      || JSON.stringify(eCustomVars) !== JSON.stringify(activeTemplate.custom_variables ?? [])
    : eName.trim().length > 0 || eContent.trim().length > 0;

  const save = async () => {
    if (saving) return;
    if (!eName.trim() || !eContent.trim()) return;
    setSaving(true);
    const payload: TemplateInput = {
      name: eName, description: eDesc || null, category: eCat, content: eContent,
      media_url: eHasMedia && eMediaUrl && /^https?:\/\//i.test(eMediaUrl) ? eMediaUrl : null,
      media_type: eHasMedia && eMediaType ? eMediaType : null,
      tags: eTags, status: eStatus,
      custom_variables: eCustomVars,
    };
    try {
      if (activeTemplateId) {
        await saveVersionSnapshot(activeTemplateId, { name: eName, content: eContent, category: eCat, status: eStatus, media_url: eHasMedia && eMediaUrl ? eMediaUrl : null, media_type: eHasMedia && eMediaType ? eMediaType : null, tags: eTags, custom_variables: eCustomVars });
        await updateTemplate.mutateAsync({ id: activeTemplateId, ...payload });
      }
      else await createTemplate.mutateAsync(payload);
      onClose();
    } catch (e) {
      console.error('Falha ao salvar template', e);
    } finally { setSaving(false); }
  };

  const loadTemplate = (t: TalkXTemplate) => {
    if (isDirty && !window.confirm('Tem alteracoes nao salvas. Descartar?')) return;
    setActiveTemplateId(t.id);
    setEName(t.name); setEDesc(t.description ?? ''); setECat(t.category);
    setEContent(t.content); setEMediaUrl(t.media_url ?? ''); setEMediaType(t.media_type ?? '');
    setEHasMedia(!!t.media_url); setEStatus(t.status); setETags(t.tags ?? []); setECustomVars(t.custom_variables ?? []);
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


  /** E47: envia mensagem de teste para o numero informado */
  const handleTest = async () => {
    const phone = testPhone.replace(/\D/g, '');
    if (!phone || phone.length < 10) { setTestResult({ ok: false, msg: 'Numero invalido' }); return; }
    if (!eContent.trim()) { setTestResult({ ok: false, msg: 'Template vazio' }); return; }
    setTesting(true); setTestResult(null);
    try {
      await testTemplate({ templateContent: eContent, mediaUrl: eHasMedia ? eMediaUrl : null, mediaType: eHasMedia ? eMediaType : null, phone, customVariables: eCustomVars });
      setTestResult({ ok: true, msg: `Mensagem enviada para ${phone}` });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Erro desconhecido' });
    } finally {
      setTesting(false);
    }
  };


  /** E46: usa hook para buscar historico de versoes */
  const fetchVersions = async (templateId: string) => {
    setLoadingVersions(true);
    const data = await fetchVersionHistory(templateId);
    setVersions(data);
    setLoadingVersions(false);
  };

  /** E46: restaura campos de uma versao anterior */
  const restoreVersion = (v: typeof versions[0]) => {
    if (!confirm('Restaurar esta versao? Os campos atuais serao substituidos.')) return;
    setEName(v.name); setECat(v.category); setEContent(v.content);
    setEStatus(v.status as 'draft'|'review'|'approved');
    setEMediaUrl(v.media_url ?? ''); setEMediaType(v.media_type ?? ''); setEHasMedia(!!v.media_url);
    setETags(v.tags ?? []); setECustomVars(v.custom_variables ?? []);
    setShowVersions(false);
  };

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
                        activeTemplateId === t.id
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
              <GhostButton icon={Copy} onClick={() => { duplicateTemplate.mutate(activeTemplate ?? editing); onClose(); }}>Duplicar</GhostButton>
            )}
            <GhostButton icon={Send} onClick={() => { setShowTest(true); setTestResult(null); }}>Testar</GhostButton>
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


          {/* E45: Variaveis customizadas */}
          <div>
            <p className="text-[12px] text-foreground-secondary mb-1.5">Variaveis personalizadas</p>
            <p className="text-[11px] text-muted-foreground mb-2">Defina variaveis proprias para este template. Serao inseridas como <span className="font-mono text-primary-glow">{'{{'}var{'}}'}</span> na mensagem.</p>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {eCustomVars.map((v) => (
                <span key={v} className="flex items-center gap-1 h-7 px-2 rounded-lg bg-violet-500/10 border border-violet-400/20 text-[12px] font-mono text-violet-300">
                  {'{{'}{v}{'}}'}
                  <button type="button" onClick={() => setECustomVars((p) => p.filter((x) => x !== v))} className="hover:text-dash-red"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={eCustomVarInput}
                onChange={(e) => setECustomVarInput(e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && eCustomVarInput.trim()) {
                    const v = eCustomVarInput.trim();
                    setECustomVars((p) => [...new Set([...p, v])]);
                    setECustomVarInput('');
                    e.preventDefault();
                  }
                }}
                placeholder="nome_variavel (Enter)"
                className="h-7 w-44 bg-input/40 border-border/70 text-[12px] font-mono"
              />
              <button
                type="button"
                disabled={!eCustomVarInput.trim()}
                onClick={() => {
                  if (eCustomVarInput.trim()) {
                    insertAtCursor('{{' + eCustomVarInput.trim() + '}}');
                    setECustomVars((p) => [...new Set([...p, eCustomVarInput.trim()])]);
                    setECustomVarInput('');
                  }
                }}
                className="h-7 px-2 rounded-md text-[11.5px] font-medium border border-primary/30 bg-primary/10 text-primary-glow hover:bg-primary/20 disabled:opacity-40"
              >
                + Inserir
              </button>
            </div>
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
        <div className="rounded-2xl bg-card border border-border/70 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-foreground-secondary" />
              <p className="text-[12.5px] font-semibold text-foreground">Historico</p>
            </div>
            <button type="button" onClick={() => { setShowVersions(!showVersions); if (!showVersions && activeTemplateId) fetchVersions(activeTemplateId); }} className="h-7 px-2 rounded-md text-[11px] font-medium border border-border/60 bg-input/40 hover:bg-muted/50">{showVersions ? 'Ocultar' : 'Ver versoes'}</button>
          </div>
          {showVersions && (
            <div className="space-y-1">
              {loadingVersions ? <p className="text-[11px] text-muted-foreground">Carregando...</p> : versions.length === 0 ? <p className="text-[11px] text-muted-foreground">Nenhuma versao salva.</p> : versions.map((v) => (
                <div key={v.id} className="flex items-start justify-between gap-1.5 py-1.5 border-b border-border/40 last:border-0">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-foreground">v{v.version_number} · {v.name.slice(0, 20)}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(v.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <button type="button" onClick={() => restoreVersion(v)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-primary/10 text-muted-foreground hover:text-primary flex-shrink-0"><RotateCcw className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
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

      {/* E47: Test Dialog */}
      <Dialog open={showTest} onOpenChange={setShowTest}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Testar template</DialogTitle><DialogDescription>Envia a mensagem personalizada para um numero via WhatsApp.</DialogDescription></DialogHeader>
            <div>
              <Label className="text-[12px] text-foreground-secondary">Numero de destino</Label>
              <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="5541999001234" className="mt-1.5 h-10 bg-input/40 border-border/70 font-mono" />
            </div>
            {testResult && (
              <div className={testResult.ok ? 'flex items-center gap-2 text-dash-green text-[12.5px]' : 'flex items-center gap-2 text-dash-red text-[12.5px]'}>
                {testResult.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
                {testResult.msg}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowTest(false)} className="flex-1 h-9 rounded-lg border border-border/70 bg-input/40 text-[13px] font-medium">Fechar</button>
              <button type="button" onClick={handleTest} disabled={testing || !testPhone.trim()} className="flex-1 h-9 rounded-lg bg-primary text-white text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">{testing ? 'Enviando...' : (<><Send className="w-3.5 h-3.5" /> Enviar</>)}</button>
            </div></DialogContent></Dialog>
    </div>
  );
}
