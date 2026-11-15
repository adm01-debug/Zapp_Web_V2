# Dossiê — claude__fix-talkx-segmentos-regressao-261101-1944 (PR #2535)

**Ref:** `origin/claude/fix-talkx-segmentos-regressao-261101-1944` · tip `d8eb518aa` · merge-base `1252bb5a4` (2026-11-01) · 1 commit, 2 arquivos (+304/−91).
**PR #2535:** CLOSED sem merge em 2026-11-01 23:50Z. Motivo (último comentário): "Fechada pelo congelamento de features (#2545)… Branch preservada — reabrir quando destravar fluxo crítico". Não foi fechada por incorporação.

## Propósito
Restaurar, por cima do X115 (#2240, squash `a6fbadfa3`), o que o `e1f2ee4dd` (X111/X112/X116) tinha em `TalkXSegments.tsx` e o squash apagou: painel "Detalhes do segmento" completo (↻ no cabeçalho com disabled+spin, critérios por extenso sem corte em 5, origem por extenso, **Criado em**, **Amostra de contatos**), `SegmentGridCard`/`ViewModeToggle` com `viewMode` vindo do hook, `rowRefs` (Esc/✕ devolvem foco à linha OU ao cartão da grade), typo `font--semibold`. Teste `detailPanel` ampliado (+6 casos) e rótulos revertidos.

## Arquivo × achado × evidência (tudo contra `origin/main` em 2026-11-15)

| Arquivo | Achado | Evidência na main |
|---|---|---|
| `src/components/talkx/TalkXSegments.tsx` | **PERDIDO** — nenhuma das restaurações está na main | `git grep teclaDe\|SegmentGridCard\|ViewModeToggle origin/main -- src/components/talkx/` → vazio. `git show origin/main:src/components/talkx/TalkXSegments.tsx`: L57 `useState<'list'|'grid'>` local (hook `useTalkXSegments.ts` L725/L822 exporta `viewMode` sem consumidor); L58/L96 `selectedRowRef` só no `<tr>` (L536) — cartão da grade (L512) sem ref → Esc/✕ não devolvem foco na grade; L514 typo `font--semibold` (nome do cartão sem negrito; `git log -S'font--semibold'` → introduzido em `a6fbadfa3`, nunca removido); L782 `rulesFlat.slice(0, 5)` (corte em 5 critérios); L794 `GhostButton "Recontar público"` sem `disabled`/spin; sem "Criado em" nem "Amostra de contatos" (`git log -S'Amostra de contatos' -- TalkXSegments.tsx` → último commit a tocar = `a6fbadfa3`, que removeu) |
| idem — helper `teclaDe` | **OBSOLETO** (valor nenhum) | A regra `local/no-secret-compare` já ignora `e.key` de evento (`scripts/eslint/no-secret-compare.js` L7-9); main L103 usa `e.key === 'Escape'` sem `eslint-disable`. Portar sem `teclaDe`. |
| `src/components/talkx/__tests__/TalkXSegments.detailPanel.test.tsx` | **PERDIDO** — 6 testes novos ausentes; 5 rótulos da main seguem os do X115 | main (317 linhas) tem 13 `it(`; nenhum com "Criado em", "Amostra de contatos", "segments-grid", "font-semibold", "sem corte", "Recontar público deste segmento" (`grep -n` → vazio). Patch da branch aplica limpo (`hunk: ABSENT_APPLIES_CLEAN`). |

Observação: o `TalkXSegments.viewMode.test.tsx` da main (X112) cobre só alternância e conteúdo do cartão; não cobre foco na grade, descrição no cartão, nem typo.

## Veredito
**PERDIDA_TOTAL** (confiança alta). Nada do trabalho útil chegou à main; o único trecho dispensável é o helper `teclaDe` (lint já resolvido de outra forma). Valor **médio**: regressão de UX/a11y já entregue antes (X111/X112/X116) + typo visível + código morto no hook (`viewMode` sem consumidor). Não é fluxo crítico (WhatsApp/inbox/envio/contatos/login). `apagar_branch_seguro = false`.

## Cuidados ao portar (achados de review na PR, não corrigidos na branch)
1. `ruleText` não tem o retorno antecipado de `is_set`/`is_empty` que o `describeRule` da main tem (L745-756) → mostraria "Tags está vazio VIP". Manter os dois `if` da main.
2. `SegmentGridCard` perdeu `role="button"` do cartão (main L512 tem). Avaliar manter `role="button"` sem botão aninhado (a estrela é `<button>` dentro) — ou aceitar o trade-off da branch.
3. A branch remove o botão "Favoritar/Desfavoritar" do rail (main L795) e por isso o teste da main escopa `within(linhaDoSegmento())`. Decisão de UX menor; se mantiver o botão do rail, manter o escopo no teste.
4. Rebase: a main mudou `fmtInt(x)` → `x != null ? fmtInt(x) : '—'` (#2826, L525 e L786) — preservar.
5. `fmtDateTime` no teste: importar de `../kit/format` (convenção), não `@/`.

## Hunks essenciais (branch × merge-base) — para portar sem reler a branch

### `src/components/talkx/TalkXSegments.tsx`
```diff
diff --git a/src/components/talkx/TalkXSegments.tsx b/src/components/talkx/TalkXSegments.tsx
index 935142dfd..b5317b6a2 100644
--- a/src/components/talkx/TalkXSegments.tsx
+++ b/src/components/talkx/TalkXSegments.tsx
@@ -1,7 +1,7 @@
 import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
 import {
   Plus, Bookmark, Star, StarOff, Pencil, Trash2, Zap, BarChart3, X, MoreVertical, Users, Shield, Check, Database, Search,
-  Archive, AlertTriangle, PowerOff, Tag, RefreshCw, LayoutList, LayoutGrid,
+  Archive, AlertTriangle, PowerOff, Tag, List, LayoutGrid, RefreshCw,
 } from 'lucide-react';
 import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
 
@@ -22,12 +22,20 @@ interface Props {
   onUseCampaign: (segmentIds: string[]) => void;
 }
 
+/** Tecla do evento (lida por função: o lint de credenciais confunde `.key` com segredo). */
+const teclaDe = (e: { key: string }): string => e.key;
+
+/** Rótulo do status (o rascunho do X115 também aparece por extenso). */
+const statusLabel = (status: string): string => (status === 'active' ? 'Ativo' : status === 'inactive' ? 'Inativo' : 'Rascunho');
+
 /** Rascunho aberto no construtor (X099): o id é o do segmento em edição, ou null no novo. */
 interface EditingSeed extends SegmentBuilderContent { id: string | null }
 
 export function TalkXSegments({ onUseCampaign }: Props) {
   const {
     segments, isLoading, isError, error, refetch, createSegment, updateSegment, deleteSegment,
+    // X112 — alternância lista/grade (preferência vive no hook). Defaults só para mocks mínimos.
+    viewMode = 'list', setViewMode = () => {},
     libraryStats = null, libraryStatsLoading = false, libraryStatsError = null, refetchLibraryStats = () => {},
     // X114 — seleção/ações em massa. Defaults só para os mocks de tela que
     // injetam um hook mínimo: o hook real sempre devolve os seis.
@@ -53,9 +61,10 @@ export function TalkXSegments({ onUseCampaign }: Props) {
   const [deleting, setDeleting] = useState<TalkXSegment | null>(null);
   const [editing, setEditing] = useState<EditingSeed | null>(null);
   const [saving, setSaving] = useState(false);
-  // X112 — alternância lista/grade da biblioteca de segmentos.
-  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
-  const selectedRowRef = useRef<HTMLTableRowElement | null>(null);
+  // Linhas/cartões da biblioteca: o Esc do painel devolve o foco ao que o abriu
+  // (linha da lista OU cartão da grade), pela id do segmento aberto.
+  const rowRefs = useRef(new Map<string, HTMLElement>());
+  const selectedIdRef = useRef<string | null>(null);
   // TL-134: gaveta "Meus segmentos" (<xl) e guarda de edição suja do construtor
   // (o construtor registra a guarda via onGuardChange a cada render).
   const [sideListOpen, setSideListOpen] = useState(false);
@@ -92,15 +101,16 @@ export function TalkXSegments({ onUseCampaign }: Props) {
     const selectedTs = selected.updated_at ?? '';
     return cachedTs >= selectedTs ? cached : selected;
   }, [segments, selected]);
+  useEffect(() => { selectedIdRef.current = selected?.id ?? null; }, [selected?.id]);
   const closePanel = useCallback(() => {
-    const row = selectedRowRef.current;
+    const id = selectedIdRef.current;
     setSelected(null);
-    row?.focus();
+    if (id) rowRefs.current.get(id)?.focus();
   }, []);
   useEffect(() => {
     if (!selected || activeEditing) return;
     const handler = (e: KeyboardEvent) => {
-      if (e.key === 'Escape' && !e.defaultPrevented) closePanel(); // eslint-disable-line local/no-secret-compare
+      if (teclaDe(e) === 'Escape' && !e.defaultPrevented) closePanel();
     };
     document.addEventListener('keydown', handler);
     return () => document.removeEventListener('keydown', handler);
@@ -247,7 +257,7 @@ export function TalkXSegments({ onUseCampaign }: Props) {
   useEffect(() => {
     if (!activeEditing) return;
     const handler = (e: KeyboardEvent) => {
-      if (e.key === 'Escape' && !e.defaultPrevented) { // eslint-disable-line local/no-secret-compare
+      if (teclaDe(e) === 'Escape' && !e.defaultPrevented) {
         const guard = builderGuardRef.current;
         if (guard) { guard(closeBuilder); } else { closeBuilder(); }
       }
@@ -449,10 +459,7 @@ export function TalkXSegments({ onUseCampaign }: Props) {
           onClear={clearFilters}
           rightSlot={(
             <>
-              <div className="flex items-center gap-0.5 rounded-lg border border-border/70 bg-input/40 p-0.5">
-                <button type="button" data-testid="segments-view-list" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')} aria-label="Visualização em lista" className={cn('h-7 w-7 rounded-md inline-flex items-center justify-center', viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50')}><LayoutList className="w-3.5 h-3.5" /></button>
-                <button type="button" data-testid="segments-view-grid" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')} aria-label="Visualização em grade" className={cn('h-7 w-7 rounded-md inline-flex items-center justify-center', viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50')}><LayoutGrid className="w-3.5 h-3.5" /></button>
-              </div>
+              <ViewModeToggle value={viewMode} onChange={setViewMode} />
               <PrimaryButton icon={Plus} onClick={openNew}>Novo segmento</PrimaryButton>
             </>
           )}
@@ -489,26 +496,15 @@ export function TalkXSegments({ onUseCampaign }: Props) {
           >
            {filtered.length === 0 ? (<div className="p-4"><TalkXEmptyState icon={Search} title="Nenhum segmento encontrado" description="Ajuste os filtros ou tente outro termo." /></div>)
            : viewMode === 'grid' ? (
-            <div data-testid="segments-grid" className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 p-4">
-              {paged.map((s) => {
-                const rulesFlat = (s.rules?.groups ?? []).flatMap((g) => g.rules);
-                const originLabel = s.origin === 'crm360' ? 'CRM 360°' : s.origin === 'zapp' ? 'ZAPP' : 'Personalizado';
-                const statusLabel = s.status === 'active' ? 'Ativo' : s.status === 'inactive' ? 'Inativo' : 'Rascunho';
-                return (
-                  <div key={s.id} data-testid="segment-card" role="button" tabIndex={0} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setSelected(s); } /* eslint-disable-line local/no-secret-compare */ }} onClick={() => setSelected(s)} className={cn('bg-card border border-border/70 rounded-xl p-3 cursor-pointer hover:bg-muted/20 transition-colors space-y-2', selected?.id === s.id && 'ring-1 ring-primary')}>
-                    <div className="flex items-start justify-between gap-2">
-                      <p className="text-sm font--semibold text-foreground line-clamp-2">{s.name}</p>
-                      <button type="button" onClick={(e) => { e.stopPropagation(); void toggleFav(s); }} aria-label={s.is_favorite ? 'Remover favorito' : 'Favoritar'} className="shrink-0 text-muted-foreground hover:text-dash-amber">{s.is_favorite ? <Star className="w-4 h-4 text-dash-amber fill-dash-amber" /> : <StarOff className="w-4 h-4" />}</button>
-                    </div>
-                    <div className="flex flex-wrap gap-1">
-                      <Pill label={originLabel} tone={s.origin === 'crm360' ? 'violet' : 'info'} />
-                      <Pill label={statusLabel} tone={s.status === 'active' ? 'success' : 'muted'} dot />
-                    </div>
-                    <p className="text-xs text-foreground-secondary">{rulesFlat.length === 0 ? 'Toda a base' : `${rulesFlat.length} critério${rulesFlat.length === 1 ? '' : 's'}`}</p>
-                    <p className="text-sm font-bold text-foreground">{fmtInt(s.estimated_count)} <span className="text-2xs text-foreground-secondary font-normal">contatos</span></p>
-                  </div>
-                );
-              })}
+            <div data-testid="segments-grid" className="p-4 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
+              {paged.map((s) => (
+                <SegmentGridCard
+                  key={s.id} s={s} active={selected?.id === s.id}
+                  registerRef={(el) => { if (el) rowRefs.current.set(s.id, el); else rowRefs.current.delete(s.id); }}
+                  onSelect={() => setSelected(s)}
+                  onToggleFav={() => { void toggleFav(s); }}
+                />
+              ))}
             </div>
            ) : (
             <div data-testid="segments-list" className="overflow-x-auto">
@@ -519,7 +515,14 @@ export function TalkXSegments({ onUseCampaign }: Props) {
                 </tr></thead>
                 <tbody>
                   {paged.map((s) => (
-                    <tr key={s.id} data-testid="segment-card" ref={selected?.id === s.id ? selectedRowRef : null} tabIndex={0} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setSelected(s); } /* eslint-disable-line local/no-secret-compare */ }} className={cn('border-b border-border/40 hover:bg-muted/20 cursor-pointer transition-colors', selected?.id === s.id && 'bg-primary/5')} onClick={() => setSelected(s)}>
+                    <tr
+                      key={s.id} data-testid="segment-card"
+                      ref={(el) => { if (el) rowRefs.current.set(s.id, el); else rowRefs.current.delete(s.id); }}
+                      tabIndex={0}
+                      onKeyDown={(e) => { if (e.target === e.currentTarget && (teclaDe(e) === 'Enter' || teclaDe(e) === ' ')) { e.preventDefault(); setSelected(s); } }}
+                      className={cn('border-b border-border/40 hover:bg-muted/20 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40', selected?.id === s.id && 'bg-primary/5')}
+                      onClick={() => setSelected(s)}
+                    >
                       <Td><div onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(s.id)} onChange={() => toggleSelect(s.id)} aria-label={`Selecionar ${s.name}`} className="w-3.5 h-3.5 accent-primary cursor-pointer" /></div></Td>
                       <Td><button type="button" onClick={(e) => { e.stopPropagation(); void toggleFav(s); }} aria-label={s.is_favorite ? 'Remover favorito' : 'Favoritar'} className="text-muted-foreground hover:text-dash-amber">{s.is_favorite ? <Star className="w-4 h-4 text-dash-amber fill-dash-amber" /> : <StarOff className="w-4 h-4" />}</button></Td>
                       <Td>
@@ -570,8 +573,8 @@ export function TalkXSegments({ onUseCampaign }: Props) {
 
       {/* Detail rail */}
       <div className="space-y-4 min-w-0">
-        {selected ? (
-          <SegmentDetailRail s={selectedSegment!} onEdit={() => openEdit(selectedSegment!)} onCampaign={() => onUseCampaign([selectedSegment!.id])} onClose={closePanel} onFavorite={() => updateSegment.mutateAsync({ id: selectedSegment!.id, is_favorite: !selectedSegment!.is_favorite })} />
+        {selectedSegment ? (
+          <SegmentDetailRail s={selectedSegment} onEdit={() => openEdit(selectedSegment)} onCampaign={() => onUseCampaign([selectedSegment.id])} onClose={closePanel} />
         ) : (
           <RailCard icon={Bookmark} title="Selecione um segmento" subtitle="Clique em um segmento para ver os detalhes e ações disponíveis.">
             <p className="text-xs text-foreground-secondary">Os segmentos permitem direcionar suas campanhas para grupos específicos de contatos com base em regras de comportamento e dados do CRM.</p>
@@ -728,59 +731,156 @@ function BulkResultPanel({ results, nameOf, onClose }: { results: TalkXSegmentBu
   );
 }
 
-function describeRule(rule: SegmentRule): string {
-  const fieldDef = RULE_FIELDS.find((f) => f.value === rule.field);
-  const fieldLabel = fieldDef?.label ?? rule.field;
-  if (rule.op === 'in_last_days') return `${fieldLabel} nos últimos ${rule.value} dias`;
-  if (rule.op === 'not_in_last_days') return `${fieldLabel} há mais de ${rule.value} dias`;
-  if (rule.op === 'is_set') return `${fieldLabel} está preenchido`;
-  if (rule.op === 'is_empty') return `${fieldLabel} está vazio`;
-  const kindOps = RULE_OPS[fieldDef?.kind ?? 'text'] ?? [];
-  const opLabel = kindOps.find((o) => o.value === rule.op)?.label ?? rule.op;
-  return `${fieldLabel} ${opLabel} ${rule.value}`;
+const ORIGIN_LABEL: Record<string, string> = { crm360: 'CRM 360°', zapp: 'ZAPP', custom: 'Personalizado' };
+const ORIGIN_LONG: Record<string, string> = {
+  zapp: 'Dados do ZAPP, em tempo real',
+  crm360: 'Dados do CRM 360°, sincronizados',
+  custom: 'Segmento personalizado',
+};
+const originLabel = (o: string) => ORIGIN_LABEL[o] ?? 'Personalizado';
+
+/** Critério por extenso ("Tags contém VIP", "Última interação nos últimos 30 dias"). */
+function ruleText(r: SegmentRule): string {
+  const field = RULE_FIELDS.find((f) => f.value === r.field);
+  const kind = field?.kind ?? 'text';
+  const op = (RULE_OPS[kind] ?? RULE_OPS.text).find((o) => o.value === r.op);
+  const label = field?.label ?? String(r.field);
+  const value = (r.value ?? '').trim();
+  if (r.op === 'in_last_days') return `${label} nos últimos ${value} dias`;
+  if (r.op === 'not_in_last_days') return `${label} há mais de ${value} dias`;
+  const opText = op?.label ?? String(r.op);
+  return value ? `${label} ${opText} ${value}` : `${label} ${opText}`;
+}
+const rulesOf = (s: TalkXSegment): SegmentRule[] => (s.rules?.groups ?? []).flatMap((g) => g.rules);
+
+/** X112 — alternância lista/grade: troca SÓ o contêiner, o cartão é o mesmo. */
+function ViewModeToggle({ value, onChange }: { value: 'list' | 'grid'; onChange: (v: 'list' | 'grid') => void }) {
+  const options = [
+    { id: 'list' as const, label: 'Ver em lista', icon: List },
+    { id: 'grid' as const, label: 'Ver em grade', icon: LayoutGrid },
+  ];
+  return (
+    <div role="group" aria-label="Modo de visualização" className="inline-flex rounded-lg border border-border/70 overflow-hidden bg-input/40">
+      {options.map((o) => (
+        <button
+          key={o.id} type="button" data-testid={`segments-view-${o.id}`} aria-pressed={value === o.id}
+          aria-label={o.label} title={o.label} onClick={() => onChange(o.id)}
+          className={cn(
+            'h-9 w-9 flex items-center justify-center transition-colors border-r border-border/50 last:border-r-0',
+            value === o.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
+          )}
+        >
+          <o.icon className="w-4 h-4" aria-hidden />
+        </button>
+      ))}
+    </div>
+  );
 }
 
-function SegmentDetailRail({ s, onEdit, onCampaign, onClose, onFavorite }: {
-  s: TalkXSegment; onEdit: () => void; onCampaign: () => void; onClose: () => void;
-  onFavorite: () => void;
+/** Cartão do modo grade: o mesmo que a linha da lista mostra (origem, status, público, critério). */
+function SegmentGridCard({ s, active, registerRef, onSelect, onToggleFav }: {
+  s: TalkXSegment; active: boolean; registerRef: (el: HTMLElement | null) => void; onSelect: () => void; onToggleFav: () => void;
 }) {
-  const { data: est, refetch: refetchEst } = useAudienceEstimate(s.rules, true);
-  const rulesFlat = (s.rules?.groups ?? []).flatMap((g) => g.rules);
-  const originLabel = s.origin === 'crm360' ? 'Dados do CRM 360°, sincronizado' : s.origin === 'zapp' ? 'Dados do ZAPP, em tempo real' : 'Personalizado';
+  const rules = rulesOf(s);
   return (
-    <section className="bg-card border border-border/70 rounded-xl flex flex-col overflow-hidden">
-      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-border/50">
-        <h2 className="text-sm font-semibold text-foreground">Detalhes do segmento</h2>
-        <button type="button" onClick={onClose} aria-label="Fechar" className="h-7 w-7 rounded-md border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50"><X className="w-4 h-4" /></button>
+    <div
+      ref={registerRef} data-testid="segment-card" tabIndex={0} onClick={onSelect}
+      onKeyDown={(e) => { if (e.target === e.currentTarget && (teclaDe(e) === 'Enter' || teclaDe(e) === ' ')) { e.preventDefault(); onSelect(); } }}
+      className={cn(
+        'rounded-2xl border bg-input/20 p-4 cursor-pointer hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
+        active ? 'border-primary/50 bg-primary/5' : 'border-border/70',
+      )}
+    >
+      <div className="flex items-start gap-2">
+        <div className="min-w-0 flex-1">
+          <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
+          <p className="text-2xs text-foreground-secondary truncate">{s.description || 'Sem descrição'}</p>
+        </div>
+        <button
+          type="button" onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
+          aria-label={s.is_favorite ? 'Remover favorito' : 'Favoritar'} className="text-muted-foreground hover:text-dash-amber shrink-0"
+        >
+          {s.is_favorite ? <Star className="w-4 h-4 text-dash-amber fill-dash-amber" /> : <StarOff className="w-4 h-4" />}
+        </button>
       </div>
-      <div className="p-3 flex flex-col gap-2 overflow-y-auto">
-        <div>
-          <p className="text-sm font-medium text-foreground">{s.name}</p>
-          {s.description && <p className="text-xs text-foreground-secondary">{s.description}</p>}
+      <div className="mt-3 flex flex-wrap items-center gap-2">
+        <Pill label={originLabel(s.origin)} tone={s.origin === 'crm360' ? 'violet' : 'info'} />
+        <Pill label={statusLabel(s.status)} tone={s.status === 'active' ? 'success' : 'muted'} dot />
+      </div>
+      <div className="mt-3 flex flex-wrap gap-1">
+        {rules.slice(0, 3).map((r, i) => {
+          const field = RULE_FIELDS.find((f) => f.value === r.field)?.label ?? r.field;
+          return <span key={i} className="text-3xs px-1.5 py-0.5 rounded bg-primary/10 text-[hsl(var(--primary-text))] border border-primary/20">{field}</span>;
+        })}
+        {rules.length > 3 && <span className="text-3xs text-muted-foreground">+{rules.length - 3}</span>}
+        {rules.length === 0 && <span className="text-2xs text-muted-foreground italic">Toda a base</span>}
+      </div>
+      <p className="mt-3"><span className="text-sm font-bold text-foreground">{fmtInt(s.estimated_count)}</span><span className="text-2xs text-foreground-secondary ml-1">contatos</span></p>
+    </div>
+  );
+}
+
+/**
+ * X116 — painel "Detalhes do segmento": cabeçalho fixo com ↻ (reconta o público) e ✕ (o Esc, tratado
+ * pela tela, também fecha e devolve o foco à linha/cartão que abriu o painel), "Principais critérios" por extenso com "Editar", origem por
+ * extenso e "Usar em campanha" desabilitado com o motivo quando o segmento está inativo.
+ */
+function SegmentDetailRail({ s, onEdit, onCampaign, onClose }: { s: TalkXSegment; onEdit: () => void; onCampaign: () => void; onClose: () => void }) {
+  const { data: est, refetch: recount, isFetching: recounting } = useAudienceEstimate(s.rules, true);
+  const rules = rulesOf(s);
+  const inactive = s.status !== 'active';
+
+  return (
+    <RailCard icon={Bookmark} color="violet" title="Detalhes do segmento" subtitle={s.description || undefined}
+      right={(
+        <div className="flex items-center gap-1.5">
+          <button
+            type="button" onClick={() => { void recount(); }} disabled={recounting}
+            aria-label="Recontar público deste segmento" title="Recontar público"
+            className="h-7 w-7 rounded-md border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50 disabled:opacity-60"
+          >
+            <RefreshCw className={cn('w-4 h-4', recounting && 'motion-safe:animate-spin')} aria-hidden />
+          </button>
+          <button type="button" onClick={onClose} aria-label="Fechar" className="h-7 w-7 rounded-md border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50"><X className="w-4 h-4" /></button>
+        </div>
+      )}
+    >
+      <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
+      <div className="flex items-center gap-2 flex-wrap">
+        <Pill label={statusLabel(s.status)} tone={s.status === 'active' ? 'success' : 'muted'} dot />
+        <Pill label={s.is_favorite ? '⭐ Favorito' : 'Padrão'} tone={s.is_favorite ? 'warning' : 'muted'} />
+      </div>
+      <div>
+        <div className="flex items-center justify-between gap-2 mb-1.5">
+          <p className="text-2xs font-semibold text-foreground-secondary">Principais critérios</p>
+          <button type="button" onClick={onEdit} className="text-2xs font-semibold text-[hsl(var(--primary-text))] underline underline-offset-2 hover:opacity-80">Editar</button>
         </div>
-        <div className="flex items-center gap-2 flex-wrap">
-          <Pill label={s.status === 'active' ? 'Ativo' : s.status === 'inactive' ? 'Inativo' : 'Rascunho'} tone={s.status === 'active' ? 'success' : 'muted'} dot />
-          {s.is_favorite && <Pill label="⭐ Favorito" tone="warning" />}
+        <div className="flex flex-wrap gap-1.5">
+          {rules.length === 0
+            ? <span className="text-2xs text-muted-foreground italic">Toda a base</span>
+            : rules.map((r) => <span key={r.id} className="text-2xs px-2 py-0.5 rounded-md bg-primary/10 text-[hsl(var(--primary-text))] border border-primary/20">{ruleText(r)}</span>)}
         </div>
-        {rulesFlat.length > 0 && (
-          <div>
-            <p className="text-xs font-semibold text-foreground mb-1">Principais critérios</p>
-            {rulesFlat.slice(0, 5).map((r) => (
-              <p key={r.id} className="text-xs text-foreground-secondary py-0.5">{describeRule(r)}</p>
-            ))}
-          </div>
-        )}
-        <MetaRow label="Público estimado" value={<span className="font-bold text-sm">{fmtInt(est?.count ?? s.estimated_count)} contatos</span>} />
-        <MetaRow label="Origem" value={originLabel} />
-        <MetaRow label="Último uso" value={s.last_used_at ? fmtDateTime(s.last_used_at) : 'Nunca'} />
-        <div className="flex flex-col gap-2 mt-1">
-          <PrimaryButton icon={Zap} onClick={onCampaign} disabled={s.status !== 'active'} className="w-full justify-center">Usar em campanha</PrimaryButton>
-          {s.status !== 'active' && <p className="text-xs text-destructive text-center">Segmento inativo: não pode ser usado em campanha.</p>}
-          <GhostButton icon={Pencil} onClick={onEdit} className="w-full justify-center">Editar segmento</GhostButton>
-          <GhostButton icon={RefreshCw} onClick={() => refetchEst()} className="w-full justify-center">Recontar público</GhostButton>
-          <GhostButton icon={s.is_favorite ? StarOff : Star} onClick={onFavorite} className="w-full justify-center">{s.is_favorite ? 'Desfavoritar' : 'Favoritar'}</GhostButton>
+      </div>
+      <MetaRow label="Público estimado" value={<span className="font-bold text-sm">{fmtInt(est?.count ?? s.estimated_count)} contatos</span>} />
+      <MetaRow label="Origem" value={ORIGIN_LONG[s.origin] ?? ORIGIN_LONG.custom} />
+      <MetaRow label="Último uso" value={s.last_used_at ? fmtDateTime(s.last_used_at) : 'Nunca'} />
+      <MetaRow label="Criado em" value={fmtDateTime(s.created_at)} />
+      {est?.sample && est.sample.length > 0 && (
+        <div className="mt-2">
+          <p className="text-2xs text-foreground-secondary mb-1.5">Amostra de contatos</p>
+          {est.sample.map((c) => (
+            <div key={c.id} className="flex items-center gap-2 py-1.5">
+              <InitialsAvatar name={c.name || '?'} size={28} />
+              <div className="min-w-0"><p className="text-xs font-medium text-foreground truncate">{c.name}</p><p className="text-2xs text-foreground-secondary truncate">{c.company || c.phone}</p></div>
+            </div>
+          ))}
         </div>
+      )}
+      <div className="flex flex-col gap-2 mt-3">
+        <PrimaryButton icon={Zap} onClick={onCampaign} disabled={inactive} className="w-full justify-center">Usar em campanha</PrimaryButton>
+        {inactive && <p className="text-2xs text-foreground-secondary">Segmento inativo: não pode ser usado em campanha.</p>}
+        <GhostButton icon={Pencil} onClick={onEdit} className="w-full justify-center">Editar segmento</GhostButton>
       </div>
-    </section>
+    </RailCard>
   );
 }
```

### `src/components/talkx/__tests__/TalkXSegments.detailPanel.test.tsx` (aplica limpo na main)
```diff
diff --git a/src/components/talkx/__tests__/TalkXSegments.detailPanel.test.tsx b/src/components/talkx/__tests__/TalkXSegments.detailPanel.test.tsx
index 980e1c2c5..16505201c 100644
--- a/src/components/talkx/__tests__/TalkXSegments.detailPanel.test.tsx
+++ b/src/components/talkx/__tests__/TalkXSegments.detailPanel.test.tsx
@@ -9,7 +9,7 @@ import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  * O painel do rail era um card com o nome do segmento no título, origem em uma
  * linha de texto e nenhuma condição. Faltava: cabeçalho fixo "Detalhes do
  * segmento" com ✕ (Esc fecha e devolve o foco à linha), "Principais critérios"
- * com os chips legíveis + "Editar segmento", origem por extenso, ↻ que reconta o público
+ * com os chips legíveis + "Editar", origem por extenso, ↻ que reconta o público
  * do segmento, leitura pela id no cache (favoritar reflete sem novo clique) e
  * "Usar em campanha" desabilitado com motivo para segmento inativo.
  *
@@ -18,7 +18,10 @@ import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  */
 
 const f = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn(), rpc: vi.fn() }));
-const state = vi.hoisted(() => ({ segments: [] as unknown[] }));
+const state = vi.hoisted(() => ({ segments: [] as unknown[], viewMode: 'list' as 'list' | 'grid' }));
+
+/** Liga a contagem pendente do teste do ↻ (fora do mock para valer só dentro dele). */
+const recontando = { on: false, liberar: null as (() => void) | null };
 
 const countResposta = { mode: 'count', matched: 42, eligible: 42, suppressed: 0, invalid_phone: 0, legacy_or_deleted: 0 };
 const pageResposta = { mode: 'page', rows: [], has_more: false, next_after: null };
@@ -56,12 +59,15 @@ vi.mock('@/hooks/integrations/useTalkXSegments', async (importOriginal) => {
       updateSegment: { mutateAsync: f.update },
       deleteSegment: { mutate: vi.fn() },
       refreshEstimates: { mutate: vi.fn() },
+      viewMode: state.viewMode,
+      setViewMode: vi.fn(),
     }),
   };
 });
 
 import { TalkXSegments } from '@/components/talkx/TalkXSegments';
 import type { TalkXSegment } from '@/hooks/integrations/useTalkXSegments';
+import { fmtDateTime } from '@/components/talkx/kit/format';
 
 const segmento: TalkXSegment = {
   id: 'seg-1',
@@ -115,6 +121,9 @@ describe('TalkXSegments · painel "Detalhes do segmento" (X116)', () => {
     // teste monta direto no construtor em vez da biblioteca.
     window.history.replaceState({}, '', '/');
     state.segments = [{ ...segmento }];
+    state.viewMode = 'list';
+    recontando.on = false;
+    recontando.liberar = null;
     f.update.mockReset();
     f.create.mockReset();
     f.rpc.mockReset();
@@ -123,7 +132,7 @@ describe('TalkXSegments · painel "Detalhes do segmento" (X116)', () => {
     );
   });
 
-  it('mostra "Detalhes do segmento", os critérios por extenso e o "Editar segmento" do construtor', async () => {
+  it('mostra "Detalhes do segmento", os critérios por extenso e o "Editar" do construtor', async () => {
     renderView();
     await abrirPainel();
 
@@ -137,8 +146,8 @@ describe('TalkXSegments · painel "Detalhes do segmento" (X116)', () => {
     // Origem por extenso, não a sigla.
     expect(screen.getByText('Dados do ZAPP, em tempo real')).toBeInTheDocument();
 
-    // "Editar segmento" abre o construtor com o segmento aberto.
-    fireEvent.click(screen.getByRole('button', { name: 'Editar segmento' }));
+    // "Editar" abre o construtor com o segmento aberto.
+    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
     const nome = (await screen.findByPlaceholderText('Nome do segmento…')) as HTMLInputElement;
     expect(nome.value).toBe('Segmento teste');
   });
@@ -171,7 +180,7 @@ describe('TalkXSegments · painel "Detalhes do segmento" (X116)', () => {
 
     // O botão Favoritar da linha: a lista volta com a cópia nova (updated_at mais
     // novo) e o painel, que lê o segmento pela id no cache, reflete sem novo clique.
-    fireEvent.click(within(linhaDoSegmento()).getByRole('button', { name: 'Favoritar' }));
+    fireEvent.click(screen.getByRole('button', { name: 'Favoritar' }));
     state.segments = [{ ...segmento, is_favorite: true, updated_at: '2026-10-09T12:00:00.000Z' }];
     // Re-render equivalente ao da invalidação da query (o hook está mockado).
     fireEvent.change(screen.getByPlaceholderText('Buscar segmentos…'), { target: { value: 'Segmento' } });
@@ -190,12 +199,12 @@ describe('TalkXSegments · painel "Detalhes do segmento" (X116)', () => {
     expect(screen.getByText('Inativo')).toBeInTheDocument();
   });
 
-  it('Esc com o construtor aberto via "Editar segmento" fecha só o construtor e mantém o painel (linha sem foco)', async () => {
+  it('Esc com o construtor aberto via "Editar" fecha só o construtor e mantém o painel (linha sem foco)', async () => {
     renderView();
     await abrirPainel();
 
-    // "Editar segmento" do painel abre o construtor (tela interna do módulo, X111).
-    fireEvent.click(screen.getByRole('button', { name: 'Editar segmento' }));
+    // "Editar" do painel abre o construtor (tela interna do módulo, X111).
+    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
     await screen.findByPlaceholderText('Nome do segmento…');
 
     fireEvent.keyDown(document, { key: 'Escape' });
@@ -213,7 +222,7 @@ describe('TalkXSegments · painel "Detalhes do segmento" (X116)', () => {
     renderView();
     await abrirPainel();
 
-    fireEvent.click(screen.getByRole('button', { name: 'Editar segmento' }));
+    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
     const nome = (await screen.findByPlaceholderText('Nome do segmento…')) as HTMLInputElement;
     // Mexer no nome deixa o construtor "sujo": o "Voltar" abre o aviso do próprio construtor.
     fireEvent.change(nome, { target: { value: 'Segmento mexido' } });
@@ -310,8 +319,112 @@ describe('TalkXSegments · painel "Detalhes do segmento" (X116)', () => {
     await waitFor(() => expect(contagens()).toBeGreaterThan(0));
     const antes = contagens();
 
-    fireEvent.click(screen.getByRole('button', { name: 'Recontar público' }));
+    fireEvent.click(screen.getByRole('button', { name: 'Recontar público deste segmento' }));
 
     await waitFor(() => expect(contagens()).toBeGreaterThan(antes));
   });
+  it('mostra "Criado em" e a "Amostra de contatos" do público (RPC em modo página)', async () => {
+    f.rpc.mockImplementation((_name: string, args?: { p_mode?: string }) =>
+      Promise.resolve({
+        data: args?.p_mode === 'page'
+          ? { mode: 'page', rows: [
+            { id: 'c1', name: 'Ana Souza', nickname: null, phone: '+55 11 9****-0001', company: 'Acme Ltda', avatar_url: null, tags: null },
+            { id: 'c2', name: 'Bruno Lima', nickname: null, phone: '+55 11 9****-0002', company: null, avatar_url: null, tags: null },
+          ], has_more: false, next_after: null }
+          : countResposta,
+        error: null,
+      }),
+    );
+    renderView();
+    await abrirPainel();
+
+    // "Criado em": rótulo + data formatada pelo mesmo formatador da tela.
+    const criadoEm = screen.getByText('Criado em');
+    expect(criadoEm).toBeInTheDocument();
+    expect(within(criadoEm.parentElement as HTMLElement).getByText(fmtDateTime(segmento.created_at))).toBeInTheDocument();
+
+    // "Amostra de contatos": nome + empresa (ou telefone, sem empresa).
+    expect(await screen.findByText('Amostra de contatos')).toBeInTheDocument();
+    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
+    expect(screen.getByText('Acme Ltda')).toBeInTheDocument();
+    expect(screen.getByText('Bruno Lima')).toBeInTheDocument();
+    expect(screen.getByText('+55 11 9****-0002')).toBeInTheDocument();
+  });
+
+  it('sem contatos na amostra, o bloco "Amostra de contatos" não aparece', async () => {
+    renderView();
+    await abrirPainel();
+    await waitFor(() => expect(f.rpc).toHaveBeenCalled());
+    expect(screen.queryByText('Amostra de contatos')).toBeNull();
+  });
+
+  it('modo grade: o cartão mostra descrição e Esc/✕ devolvem o foco ao cartão que abriu o painel', async () => {
+    state.viewMode = 'grid';
+    renderView();
+    const grade = await screen.findByTestId('segments-grid');
+    expect(screen.queryByTestId('segments-list')).toBeNull();
+
+    const cartao = within(grade).getByText('Segmento teste').closest('[data-testid="segment-card"]') as HTMLElement;
+    expect(within(cartao).getByText('Clientes que já compraram')).toBeInTheDocument();
+    fireEvent.click(cartao);
+    await screen.findByText('Detalhes do segmento');
+
+    fireEvent.keyDown(document, { key: 'Escape' });
+    await waitFor(() => expect(screen.queryByText('Detalhes do segmento')).toBeNull());
+    expect(cartao).toHaveFocus();
+
+    // Mesmo caminho pelo ✕, depois de reabrir pelo teclado (Enter no cartão focado).
+    cartao.focus();
+    fireEvent.keyDown(cartao, { key: 'Enter' });
+    await screen.findByText('Detalhes do segmento');
+    cartao.blur();
+    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
+    await waitFor(() => expect(screen.queryByText('Detalhes do segmento')).toBeNull());
+    expect(cartao).toHaveFocus();
+  });
+
+  it('o ↻ do cabeçalho tem o nome acessível "Recontar público deste segmento" e fica desabilitado enquanto conta', async () => {
+    f.rpc.mockImplementation((_name: string, args?: { p_mode?: string }) =>
+      args?.p_mode === 'count' && recontando.on
+        ? new Promise((ok) => { recontando.liberar = () => ok({ data: countResposta, error: null }); })
+        : Promise.resolve({ data: args?.p_mode === 'page' ? pageResposta : countResposta, error: null }),
+    );
+    renderView();
+    await abrirPainel();
+
+    const botao = await screen.findByRole('button', { name: 'Recontar público deste segmento' });
+    await waitFor(() => expect(botao).toBeEnabled());
+
+    // A nova contagem fica pendente: o botão desabilita e o ícone gira (motion-safe).
+    recontando.on = true;
+    fireEvent.click(botao);
+    await waitFor(() => expect(botao).toBeDisabled());
+    expect(botao.querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
+
+    // Resolvida a contagem, o botão volta a ficar disponível e para de girar.
+    recontando.on = false;
+    recontando.liberar?.();
+    await waitFor(() => expect(botao).toBeEnabled());
+    expect(botao.querySelector('svg')?.getAttribute('class') ?? '').not.toContain('animate-spin');
+  });
+
+  it('o nome no cartão da grade usa a classe "font-semibold" (typo "font--semibold" corrigido)', async () => {
+    state.viewMode = 'grid';
+    renderView();
+    const grade = await screen.findByTestId('segments-grid');
+    const nome = within(grade).getByText('Segmento teste');
+    expect(nome.className).toContain('font-semibold');
+    expect(nome.className).not.toContain('font--semibold');
+  });
+
+  it('o painel lista TODOS os critérios por extenso (sem corte em 5)', async () => {
+    const extras = Array.from({ length: 4 }, (_, i) => ({ id: `rx${i}`, field: 'tags', op: 'contains', value: `T${i}` }));
+    state.segments = [{ ...segmento, rules: { groups: [{ id: 'g1', match: 'and', rules: [...segmento.rules.groups[0].rules, ...extras] }] } }];
+    renderView();
+    await abrirPainel();
+
+    // 3 originais + 4 extras = 7 chips; o 7º ("Tags contém T3") passaria do corte de 5.
+    expect(screen.getByText('Tags contém T3')).toBeInTheDocument();
+    expect(screen.getByText('Lead score maior que 50')).toBeInTheDocument();
+  });
 });
```

## Verificação adversarial

Parecer: **CONCORDO** com `PERDIDA_TOTAL` (confiança alta). Tentei refutar por três vias — (a) main já cobre, (b) remoção deliberada, (c) trabalho não encaixa mais — e as três falharam.

Base da verificação: `origin/main` = `dac285f62` (mais novo que o usado na triagem; o arquivo foi tocado depois por `cb6576b2a` e `d084ca753`, e **mesmo assim** nada foi restaurado). Tip `d8eb518aa` **não é ancestral de `origin/main`** (`git merge-base --is-ancestor` → falso): não houve incorporação por outro caminho.

(a) Main NÃO cobre (tudo reconferido em `git show origin/main:src/components/talkx/TalkXSegments.tsx`):
- L514 `className="text-sm font--semibold ..."` — typo ainda vivo (nome do cartão da grade sem negrito).
- L782 `rulesFlat.slice(0, 5)` — corte dos critérios ainda vivo.
- L794 `<GhostButton icon={RefreshCw} onClick={() => refetchEst()}>Recontar público</GhostButton>` — sem `disabled`, sem `animate-spin`, sem `aria-label` "Recontar público deste segmento" e fora do cabeçalho.
- `SegmentDetailRail` (L757-800): **não há** `MetaRow label="Criado em"` nem bloco "Amostra de contatos" (`est.sample`).
- L58/L96/L536 `selectedRowRef` é `HTMLTableRowElement` ligado só ao `<tr>`; o cartão da grade (L512) não registra ref → Esc/✕ não devolvem foco na grade.
- L57 `const [viewMode, setViewMode] = useState(...)` local, enquanto `useTalkXSegments` exporta `viewMode/setViewMode` (L725/L822) sem consumidor — export morto.
- `git grep -n -E 'teclaDe|SegmentGridCard|ViewModeToggle|Amostra de contatos|Recontar público deste segmento' origin/main -- src/` → só `segments-grid` (L506, grade que já existe) e "Amostra de contatos (5)" em `segments/TalkXSegmentBuilder.tsx:296` (outra tela, o construtor — não cobre o rail).
- Teste: `git diff --stat 1252bb5a4 origin/main -- src/components/talkx/__tests__/TalkXSegments.detailPanel.test.tsx` → vazio (inalterado desde a base, patch aplica limpo); main tem 11 `it(` e zero ocorrência de "Criado em", "Amostra", "segments-grid", "font-semibold" ou "Recontar público deste segmento".

(b) Não foi remoção deliberada: `git log -S'Amostra de contatos' --oneline origin/main -- src/components/talkx/TalkXSegments.tsx` → último `a6fbadfa3 feat(talkx): filtros, paginação persistida e URL sync ... (#2240)`; o diff desse commit mostra `-<MetaRow label="Criado em" ...>`, `-"Amostra de contatos"`, `+font--semibold` e `+rulesFlat.slice(0, 5)` — commit `feat` de escopo "filtros/paginação/URL sync", sem "remove"/"revert"/"desativa" na mensagem. Perda colateral de squash, como a triagem afirma.

(c) Encaixa no código atual: `RailCard`, `MetaRow`, `fmtDateTime` existem em `talkxShared` (usados em `TalkXCampaignRunning.tsx:19`), `fmtDateTime` em `kit/format.ts:14`, `est.sample` existe (`useTalkXSegments.ts:366-367`), `viewMode/setViewMode` exportados (L725/L822). `ORIGIN_LONG` é definido pelo próprio branch (`d8eb518aa:...:735`). Conflito de port confirmado (arquivo mudou na main desde a base), mas nenhuma API citada desapareceu.

Correções à triagem (não mudam o veredito):
1. "origem por extenso" **já está na main** (`SegmentDetailRail` L764 + `MetaRow label="Origem"` L788: 'Dados do CRM 360°, sincronizado'). Não contar como lacuna no port.
2. "alternância lista/grade" existe na main (botões L467/L468 + grade L506 + `TalkXSegments.viewMode.test.tsx`); a lacuna real é só **ligar ao hook** (persistência na sessão) e o conteúdo do cartão (descrição + ref de foco + typo). O cartão da main já tem `role="button"`, `tabIndex` e Enter/Espaço — ao portar, **não regredir** isso.
3. Caveat de port confirmado no código: `d8eb518aa:...:743-753` `ruleText` não tem o early-return de `is_set`/`is_empty` que `describeRule` da main tem (L751-752) → portar como está produz "Tags está vazio VIP". Manter a versão da main.

Conclusão: `apagar_branch_seguro = false`. Valor líquido médio (UX/a11y de tela não crítica), ~2 arquivos, port com conflito.
