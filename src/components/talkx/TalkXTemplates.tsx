import React, { useState, useMemo, useRef, useCallback } from 'react';
import { TalkXTemplateEditor } from './TalkXTemplateEditor';
import {
  Plus, FileText, Star, Pencil, Trash2, Copy, Search, Image, Video, Music, X,
  Check, Wand2, BookOpen, ChevronRight, BarChart3, Eye, EyeOff, Upload,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DashboardKpiCard } from '@/components/dashboard/overview/DashboardKpiCard';
import { PrimaryButton, GhostButton, Pill } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { useTalkXTemplates, type TalkXTemplate, type TemplateInput } from '@/hooks/integrations/useTalkXTemplates';
import { IconTile, WhatsAppBubble, RailCard, RailAction, TalkXEmptyState, TalkXSkeletonRows, FilterBar, TalkXPagination, TEMPLATE_CATEGORIES, TEMPLATE_STATUS, VARIABLE_KEYS, personalizePreview, fmtInt, fmtDateTime } from './talkxShared';

interface Props { onUseTemplate: (templateId: string) => void }

const MEDIA_ICONS = { image: Image, video: Video, document: FileText, audio: Music } as const;

type ViewMode = 'list' | 'edit';

export function TalkXTemplates({ onUseTemplate }: Props) {
  const { templates, isLoading, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate } = useTalkXTemplates();
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(8);
  const [mode, setMode] = useState<ViewMode>('list');
  const [editing, setEditing] = useState<TalkXTemplate | null>(null);
  const [deleting, setDeleting] = useState<TalkXTemplate | null>(null);
  const [selected, setSelected] = useState<TalkXTemplate | null>(null);

  // editor state
  const [eName, setEName] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eCat, setECat] = useState('geral');
  const [eContent, setEContent] = useState('');
  const [eMediaUrl, setEMediaUrl] = useState('');
  const [eMediaType, setEMediaType] = useState('');
  const [eHasMedia, setEHasMedia] = useState(false);
  const [eStatus, setEStatus] = useState<'draft'|'review'|'approved'>('approved');
  const [eTags, setETags] = useState<string[]>([]);
  const [eTagInput, setETagInput] = useState('');
  // E48: importar templates
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; fail: number } | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEName(''); setEDesc(''); setECat('geral'); setEContent(''); setEMediaUrl(''); setEMediaType(''); setEHasMedia(false); setEStatus('approved'); setETags([]); setEditing(null); setMode('edit'); };
  const openEdit = (t: TalkXTemplate) => { setEName(t.name); setEDesc(t.description ?? ''); setECat(t.category); setEContent(t.content); setEMediaUrl(t.media_url ?? ''); setEMediaType(t.media_type ?? ''); setEHasMedia(!!t.media_url); setEStatus(t.status); setETags(t.tags ?? []); setEditing(t); setMode('edit'); };

  const save = async () => {
    if (!eName.trim() || !eContent.trim()) return;
    setSaving(true);
    const payload: TemplateInput = { name: eName, description: eDesc || null, category: eCat, content: eContent, media_url: eHasMedia && eMediaUrl ? eMediaUrl : null, media_type: eHasMedia && eMediaType ? eMediaType : null, tags: eTags, status: eStatus };
    try {
      if (editing) await updateTemplate.mutateAsync({ id: editing.id, ...payload });
      else await createTemplate.mutateAsync(payload);
      setMode('list');
    } finally { setSaving(false); }
  };

  const filtered = useMemo(() => {
    let r = templates;
    if (filterCat !== 'all') r = r.filter((t) => t.category === filterCat);
    if (filterStatus !== 'all') r = r.filter((t) => t.status === filterStatus);
    if (search.trim()) { const q = search.toLowerCase(); r = r.filter((t) => t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q) || t.tags.some((x) => x.includes(q))); }
    return r;
  }, [templates, filterCat, filterStatus, search]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const most = useMemo(() => [...templates].sort((a, b) => b.use_count - a.use_count).slice(0, 3), [templates]);

  const totals = useMemo(() => ({
    total: templates.length,
    approved: templates.filter((t) => t.status === 'approved').length,
    withMedia: templates.filter((t) => t.media_url).length,
    bestRate: most[0]?.name,
  }), [templates, most]);

  // E48: parser CSV/JSON e batch insert
  const handleImport = useCallback(async (file: File) => {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      let rows: { name: string; content: string; category?: string; status?: string; description?: string }[] = [];
      if (file.name.endsWith('.json')) {
        rows = JSON.parse(text);
        if (!Array.isArray(rows)) throw new Error('JSON deve ser um array');
      } else {
        const parseCsvRow = (line: string): string[] => {
          const result: string[] = [];
          let cur = '', inQ = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
            else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
            else cur += ch;
          }
          result.push(cur.trim());
          return result;
        };
        const allLines = text.trim().split(/\r?\n/);
        const cols = parseCsvRow(allLines[0]);
        rows = allLines.slice(1).filter(Boolean).map((line: string) => {
          const vals = parseCsvRow(line);
          return Object.fromEntries(cols.map((c: string, i: number) => [c, vals[i] ?? ''])) as typeof rows[0];
        });
      }
      let ok = 0, fail = 0;
      for (const row of rows) {
        if (!row.name || !row.content) { fail++; continue; }
        if (row.content.length > 1024) { fail++; continue; } // enforcar limite do editor
        if (row.content.length > 1024) { fail++; continue; }
        try {
          await createTemplate.mutateAsync({
            name: row.name,
            content: row.content,
            category: row.category || 'geral',
            status: (['draft', 'review', 'approved'].includes(row.status ?? '') ? row.status : 'approved') as 'draft' | 'review' | 'approved',
            description: row.description || null,
          });
          ok++;
        } catch { fail++; }
      }
      setImportResult({ ok, fail });
    } catch {
      setImportResult({ ok: 0, fail: -1 });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }, [createTemplate]);

  if (mode === 'edit') {
    return (
      <TalkXTemplateEditor
        templates={templates}
        isLoading={isLoading}
        editing={editing}
        onClose={() => setMode('list')}
      />
    );
  }

    return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DashboardKpiCard size="hero" index={0} label="Total de templates" value={String(totals.total)} delta={null} tile="blue" icon={FileText} bars={null} barsColor="blue" chart="none" />
          <DashboardKpiCard size="hero" index={1} label="Aprovados" value={String(totals.approved)} delta={totals.total > 0 ? { pct: Math.round((totals.approved / totals.total) * 100), label: 'do total' } : null} tile="green" icon={Check} bars={null} barsColor="green" chart="none" />
          <DashboardKpiCard size="hero" index={2} label="Mais usado" value={totals.bestRate ? most[0].use_count.toString() : '—'} delta={totals.bestRate ? { text: totals.bestRate, tone: 'success' } : null} tile="amber" icon={Star} bars={null} barsColor="amber" chart="none" />
          <DashboardKpiCard size="hero" index={3} label="Templates com mídia" value={String(totals.withMedia)} delta={null} tile="violet" icon={Image} bars={null} barsColor="violet" chart="none" />
        </div>

        <FilterBar search={search} onSearch={setSearch} placeholder="Buscar templates…" selects={[
          { key: 'cat', value: filterCat, onChange: setFilterCat, label: 'Todas as categorias', options: TEMPLATE_CATEGORIES.map((c) => ({ value: c, label: c })) },
          { key: 'st', value: filterStatus, onChange: setFilterStatus, label: 'Todos os status', options: Object.entries(TEMPLATE_STATUS).map(([v, m]) => ({ value: v, label: m.label })) },
        ]} right={<PrimaryButton icon={Plus} onClick={openNew}>Novo Template</PrimaryButton>} />

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
          {isLoading ? (<div className="col-span-full"><TalkXSkeletonRows rows={3} /></div>)
           : templates.length === 0 ? (<div className="col-span-full"><TalkXEmptyState icon={FileText} title="Nenhum template criado" description="Crie templates de mensagem para suas campanhas." actionLabel="Criar template" onAction={openNew} /></div>)
           : paged.length === 0 ? (<div className="col-span-full"><TalkXEmptyState icon={Search} title="Nenhum template encontrado" /></div>)
           : paged.map((t) => (
            <TemplateCard key={t.id} t={t} selected={selected?.id === t.id} onClick={() => setSelected(t === selected ? null : t)} onEdit={() => openEdit(t)} onDuplicate={() => duplicateTemplate.mutate(t)} onDelete={() => setDeleting(t)} onUse={() => onUseTemplate(t.id)} />
          ))}
        </div>
        {filtered.length > 0 && <TalkXPagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={() => {}} noun="templates" />}
      </div>

      <div className="space-y-4 min-w-0">
        <RailCard icon={Star} color="amber" title="Biblioteca inteligente" subtitle="Templates que convertem, recomendações sob medida.">
          <p className="text-[12.5px] font-semibold text-foreground mb-2">Mais convertidos</p>
          {most.map((t, i) => (
            <button key={t.id} type="button" onClick={() => onUseTemplate(t.id)} className="w-full flex items-center gap-2.5 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/20 text-left rounded-xl px-1">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary-glow text-[12px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-foreground truncate">{t.name}</p><p className="text-[11.5px] text-foreground-secondary">{fmtInt(t.use_count)} usos</p></div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </RailCard>
        <RailCard icon={FileText} title="Ações rápidas">
          <div className="space-y-2">
            <RailAction icon={Plus} title="Criar template" subtitle="Do zero ou com IA" onClick={openNew} />
            <RailAction icon={Copy} color="violet" title="Duplicar template" subtitle="Baseado em um existente" onClick={() => selected ? openEdit(selected) : openNew()} />
            <RailAction
              icon={Upload}
              color="amber"
              title={importing ? 'Importando...' : 'Importar templates'}
              subtitle={
                importResult
                  ? importResult.fail === -1
                    ? 'Erro ao ler arquivo'
                    : `${importResult.ok} importados, ${importResult.fail} falhos`
                  : 'JSON array ou CSV (name,category,content,status)'
              }
              onClick={() => !importing && importInputRef.current?.click()}
            />
          </div>
        </RailCard>
      </div>

      {/* E48: input file oculto para importar templates */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="rounded-2xl border-border/70">
          <AlertDialogHeader><AlertDialogTitle>Excluir template?</AlertDialogTitle><AlertDialogDescription>O template <b className="text-foreground">"{deleting?.name}"</b> será excluído permanentemente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-dash-red hover:bg-dash-red/90 text-white" onClick={() => { if (deleting) deleteTemplate.mutate(deleting.id); setDeleting(null); }}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateCard({ t, selected, onClick, onEdit, onDuplicate, onDelete, onUse }: { t: TalkXTemplate; selected: boolean; onClick: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void; onUse: () => void }) {
  const sm = TEMPLATE_STATUS[t.status] ?? TEMPLATE_STATUS.draft;
  return (
    <div onClick={onClick} className={cn('rounded-2xl border cursor-pointer transition-all hover:shadow-md', selected ? 'border-primary bg-primary/5' : 'border-border/70 bg-card hover:border-primary/40')}>
      {/* Bubble preview */}
      <div className="bg-muted/30 rounded-t-2xl p-3 border-b border-border/50">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[hsl(150_45%_16%)] border border-whatsapp/25 px-3 py-2 text-[12px] text-foreground whitespace-pre-wrap leading-relaxed">
            {t.media_url && <div className="rounded-lg mb-1.5 px-2 py-1 bg-black/20 text-[10.5px] text-muted-foreground">📎 {t.media_type}</div>}
            {t.content.slice(0, 140)}{t.content.length > 140 ? '…' : ''}
            <span className="block text-right text-[9.5px] text-muted-foreground mt-0.5">Agora ✓✓</span>
          </div>
        </div>
      </div>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-foreground truncate">{t.name}</p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Pill label={sm.label} tone={sm.tone} dot />
              <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-muted/50 border border-border/60 text-muted-foreground">{t.category}</span>
              {t.tags.slice(0, 2).map((tag) => <span key={tag} className="text-[10px] text-primary-glow">#{tag}</span>)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
          <button type="button" onClick={(e) => { e.stopPropagation(); onUse(); }} className="h-8 px-3 rounded-lg bg-primary text-white text-[12px] font-semibold">Usar template</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50" aria-label="Editar"><Pencil className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50" aria-label="Duplicar"><Copy className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:bg-dash-red/10 hover:text-dash-red ml-auto" aria-label="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
          <span className="text-[10.5px] text-muted-foreground">{fmtInt(t.use_count)} usos</span>
        </div>
      </div>
    </div>
  );
}
