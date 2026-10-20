import React from 'react';
import {
  ArrowLeft, BarChart3, Bookmark, Check, Copy, Plus, RefreshCw, Redo2, Undo2, X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

import { PrimaryButton, GhostButton, InitialsAvatar } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import {
  RULE_FIELDS, splitRules, useAudienceEstimate, type RuleField, type SegmentRule,
} from '@/hooks/integrations/useTalkXSegments';
import { IconTile, RailCard, fmtInt } from '../talkxShared';
import { toast } from 'sonner';
import { RuleRow } from './RuleRow';
import {
  builderContent, createBuilderState, isDirty, ruleFromField, segmentBuilderReducer,
  type SegmentBuilderContent,
} from './segmentBuilderReducer';
import { SEGMENT_DESCRIPTION_MAX, descriptionCounter, validateSegment } from './segmentValidation';

/**
 * X099 — o construtor de segmentos vira componente próprio (antes era a função
 * interna `SegmentBuilder` em `TalkXSegments.tsx`), com o estado no reducer de
 * `segmentBuilderReducer`: desfazer/refazer (50 passos), "Limpar tudo" que volta,
 * duplicar grupo e validação de nome/descrição.
 */
export interface TalkXSegmentBuilderProps {
  initial: SegmentBuilderContent;
  isNew: boolean;
  saving: boolean;
  /** Nomes já usados na biblioteca, sem o segmento em edição (para o nome repetido). */
  existingNames?: string[];
  onSave: (draft: SegmentBuilderContent) => void;
  onCancel: () => void;
}

export function TalkXSegmentBuilder({
  initial, isNew, saving, existingNames = [], onSave, onCancel,
}: TalkXSegmentBuilderProps) {
  const [state, dispatch] = React.useReducer(segmentBuilderReducer, initial, createBuilderState);
  const { name, description, rules } = state;
  const { data: est, isFetching: estFetching } = useAudienceEstimate(rules, true);
  // Condições em branco ficam fora da estimativa; a tela precisa dizer quantas
  // antes de o usuário tentar publicar. O valor do hook cobre o mesmo cálculo,
  // a derivação local mostra o aviso imediatamente (antes do fetch resolver).
  const incompleteCount = est?.incompleteCount ?? splitRules(rules).incompleteCount;
  const [dragOverGroupId, setDragOverGroupId] = React.useState<string | null>(null);
  const [draggingField, setDraggingField] = React.useState<string | null>(null);
  const [showErrors, setShowErrors] = React.useState(false);
  const [confirmExit, setConfirmExit] = React.useState(false);

  const errors = React.useMemo(
    () => validateSegment({ name, description, rules, existingNames }),
    [name, description, rules, existingNames],
  );
  const dirty = isDirty(state);
  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  // Atalhos do plano: Ctrl/⌘+Z desfaz, Ctrl/⌘+Shift+Z refaz. O construtor é a
  // fonte única da edição (o valor em tela vem do estado), então o atalho é
  // capturado mesmo com o foco em um campo — desfazer é sempre do construtor.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const resolveGroupId = () => {
    if (state.activeGroupId && rules.groups.some((g) => g.id === state.activeGroupId)) return state.activeGroupId;
    return rules.groups[rules.groups.length - 1]?.id ?? null;
  };
  const addFieldToGroup = (field: RuleField) => {
    const gid = resolveGroupId();
    if (!gid) return;
    dispatch({ type: 'addRule', groupId: gid, rule: ruleFromField(field) });
  };

  const handleSave = () => {
    if (saving) return;
    setShowErrors(true);
    if (errors.name) { toast.error(errors.name); return; }
    if (errors.description) { toast.error(errors.description); return; }
    // A condição em branco é barrada por quem publica (a tela de segmentos também
    // confere antes de gravar); aqui o aviso sai na hora do clique.
    if (errors.rules) { toast.error(errors.rules); return; }
    onSave(builderContent(state));
  };
  const requestExit = () => { if (dirty) setConfirmExit(true); else onCancel(); };

  const iconButton = 'h-8 w-8 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center text-foreground-secondary enabled:hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed shrink-0';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)_280px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        {/* Header */}
        <div className="rounded-2xl bg-card border border-border/70 p-4 flex items-center gap-3">
          <button type="button" onClick={requestExit} aria-label="Voltar" className="h-9 w-9 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center hover:bg-muted/50 shrink-0"><ArrowLeft className="w-4 h-4" /></button>
          <IconTile icon={Bookmark} color="violet" size={48} />
          <div className="min-w-0 flex-1">
            <Input value={name} onChange={(e) => dispatch({ type: 'name', value: e.target.value })} placeholder="Nome do segmento…" aria-invalid={showErrors && !!errors.name} className="text-lg font-bold border-0 bg-transparent p-0 h-auto focus-visible:ring-0 text-foreground placeholder:text-muted-foreground/50" />
            <Input value={description} onChange={(e) => dispatch({ type: 'description', value: e.target.value })} placeholder="Adicione uma descrição para este segmento…" aria-invalid={showErrors && !!errors.description} className="text-[13px] border-0 bg-transparent p-0 h-auto mt-0.5 focus-visible:ring-0 text-foreground-secondary placeholder:text-muted-foreground/40" />
            <div className="flex items-center justify-between gap-2">
              {showErrors && errors.name
                ? <p role="alert" className="text-2xs text-dash-red">{errors.name}</p>
                : <span />}
              <p className="text-2xs text-muted-foreground tabular-nums shrink-0">{descriptionCounter(description)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <GhostButton onClick={requestExit}>Cancelar</GhostButton>
            <PrimaryButton icon={saving ? RefreshCw : Check} onClick={handleSave} disabled={saving || !name.trim()}>{isNew ? 'Publicar segmento' : 'Salvar'}</PrimaryButton>
          </div>
        </div>

        {/* Construtor de regras */}
        <section className="rounded-2xl bg-card border border-border/70 p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <div><p className="text-[15px] font-bold text-foreground">Regras do segmento</p><p className="text-xs text-foreground-secondary">Defina os filtros e condições para o seu segmento</p></div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo} aria-label="Desfazer" title="Desfazer (Ctrl+Z)" className={iconButton}><Undo2 className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => dispatch({ type: 'redo' })} disabled={!canRedo} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" className={iconButton}><Redo2 className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => dispatch({ type: 'clear' })} className="h-8 px-3 rounded-lg border border-border/70 bg-input/40 text-xs font-medium text-foreground-secondary hover:bg-muted/50 flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" />Limpar tudo</button>
            </div>
          </div>
          <div className="space-y-4">
            {rules.groups.map((g, gi) => (
              <div
                key={g.id}
                className={cn('rounded-xl border overflow-hidden transition-colors', dragOverGroupId === g.id ? 'border-primary/60 bg-primary/10' : 'border-border/60 bg-input/20')}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOverGroupId(g.id); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGroupId(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = RULE_FIELDS.find((x) => x.value === e.dataTransfer.getData('text/plain'));
                  if (dropped) dispatch({ type: 'addRule', groupId: g.id, rule: ruleFromField(dropped.value) });
                  setDragOverGroupId(null); setDraggingField(null);
                }}
              >
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 bg-muted/20">
                  <span className="w-7 h-7 rounded-lg bg-primary/20 text-primary-glow text-xs font-bold flex items-center justify-center">{['E', 'O', 'G'][Math.min(gi, 2)]}</span>
                  <p className="text-[13px] font-semibold text-foreground flex-1">Grupo {gi + 1}  <span className="text-2xs font-normal text-foreground-secondary ml-1">— {g.match === 'and' ? 'Todas as condições devem ser atendidas (AND)' : 'Pelo menos uma condição deve ser atendida (OR)'}</span></p>
                  <Select value={g.match} onValueChange={(v) => dispatch({ type: 'setMatch', id: g.id, match: v as 'and' | 'or' })}>
                    <SelectTrigger className="h-7 w-[60px] bg-input/40 border-border/60 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="and">AND</SelectItem><SelectItem value="or">OR</SelectItem></SelectContent>
                  </Select>
                  <button type="button" onClick={() => dispatch({ type: 'duplicateGroup', id: g.id })} aria-label="Duplicar grupo" title="Duplicar grupo" className="h-7 w-7 rounded-md border border-border/70 bg-input/40 flex items-center justify-center hover:text-primary-glow"><Copy className="w-3.5 h-3.5" /></button>
                  {rules.groups.length > 1 && <button type="button" onClick={() => dispatch({ type: 'removeGroup', id: g.id })} aria-label="Remover grupo" className="h-7 w-7 rounded-md border border-border/70 bg-input/40 flex items-center justify-center hover:text-dash-red"><X className="w-3.5 h-3.5" /></button>}
                </div>
                <div className="p-4 space-y-2.5">
                  {g.rules.map((r) => (
                    <RuleRow
                      key={r.id}
                      rule={r}
                      onChange={(patch: Partial<SegmentRule>) => dispatch({ type: 'updateRule', groupId: g.id, ruleId: r.id, patch })}
                      onRemove={() => dispatch({ type: 'removeRule', groupId: g.id, ruleId: r.id })}
                    />
                  ))}
                  {g.rules.length === 0 && <p className="text-xs text-muted-foreground italic py-2 text-center">Nenhuma condição adicionada. Clique em + Adicionar condição.</p>}
                  <button type="button" onClick={() => dispatch({ type: 'addRule', groupId: g.id })} className="h-8 px-3 rounded-lg border border-dashed border-primary/40 text-primary-glow text-xs font-medium hover:bg-primary/10 flex items-center gap-1.5 w-full justify-center">+ Adicionar condição</button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button type="button" onClick={() => dispatch({ type: 'addGroup', match: 'and' })} className="h-9 px-4 rounded-xl border border-primary/30 bg-primary/10 text-primary-glow text-xs font-semibold hover:bg-primary/15 flex items-center gap-1.5">+ Adicionar grupo (AND)</button>
            <button type="button" onClick={() => dispatch({ type: 'addGroup', match: 'or' })} className="h-9 px-4 rounded-xl border border-border/70 bg-input/30 text-foreground-secondary text-xs font-medium hover:bg-muted/50 flex items-center gap-1.5">◎ Adicionar grupo (OR)</button>
          </div>
        </section>

      </div>

      {/* Col 3: Catálogo de filtros — primeira coluna no xl: */}
      <aside className="hidden xl:block order-first rounded-2xl bg-card border border-border/70 p-3.5 space-y-3 max-h-[600px] overflow-y-auto">
        <p className="text-[13px] font-bold text-foreground">Filtros</p>
        <p className="text-2xs text-foreground-secondary leading-snug">Clique para adicionar ao grupo ativo</p>
        {(['basico', 'comportamento', 'comercial', 'lgpd'] as const).map((cat) => (
          <div key={cat}>
            <p className="text-3xs uppercase tracking-widest text-muted-foreground mb-1.5">{cat === 'basico' ? 'Básicos' : cat === 'comportamento' ? 'Comportamento' : cat === 'comercial' ? 'Comercial' : 'LGPD'}</p>
            <div className="flex flex-col gap-1">
              {RULE_FIELDS.filter((f) => f.category === cat).map((f) => (
                <button
                  key={f.value}
                  type="button"
                  draggable
                  onDragStart={(e) => { setDraggingField(f.value); e.dataTransfer.setData('text/plain', f.value); e.dataTransfer.effectAllowed = 'copy'; }}
                  onDragEnd={() => { setDraggingField(null); setDragOverGroupId(null); }}
                  onClick={() => addFieldToGroup(f.value)}
                  className={cn('h-8 px-2.5 rounded-lg text-xs font-medium border bg-muted/30 flex items-start gap-1.5 w-full text-left transition-colors', draggingField === f.value ? 'border-primary/60 bg-primary/15 text-primary-glow cursor-grabbing opacity-75' : 'border-border/60 text-foreground-secondary hover:border-primary/40 hover:bg-primary/10 hover:text-primary-glow cursor-grab')}
                >
                  <Plus className="w-3 h-3 mt-0.5 shrink-0" />{f.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      {/* Resumo do segmento */}
      <div className="space-y-4 min-w-0">
        <RailCard icon={BarChart3} title="Resumo do segmento" right={<span className="flex items-center gap-1 text-2xs font-medium">{estFetching ? <><RefreshCw className="w-3 h-3 motion-safe:animate-spin" /><span className="text-muted-foreground">Calculando…</span></> : <><span className="w-2 h-2 rounded-full bg-success motion-safe:animate-pulse" /><span className="text-success">Ao vivo</span></>}</span>}>
          <p className="text-2xs text-foreground-secondary">Audiência estimada</p>
          <p className={cn('text-4xl font-bold tabular-nums tracking-[-0.02em] transition-opacity', estFetching ? 'text-muted-foreground opacity-50' : 'text-foreground opacity-100')}>{fmtInt(est?.count ?? 0)}</p>
          <p className="text-xs text-foreground-secondary">contatos</p>
          {incompleteCount > 0 && (
            <p className="text-2xs text-dash-amber mt-2">{incompleteCount} condição(ões) incompleta(s) fora da estimativa</p>
          )}
          {est?.sample && est.sample.length > 0 && (
            <div className="mt-3">
              <p className="text-2xs text-foreground-secondary mb-1.5">Amostra de contatos (5)</p>
              {est.sample.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-1">
                  <InitialsAvatar name={c.name || '?'} size={28} />
                  <div className="min-w-0"><p className="text-xs font-medium text-foreground truncate">{c.name}</p><p className="text-2xs text-foreground-secondary truncate">{c.phone}</p></div>
                </div>
              ))}
            </div>
          )}
        </RailCard>
      </div>

      <AlertDialog open={confirmExit} onOpenChange={(v) => { if (!v) setConfirmExit(false); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg">Alterações não salvas</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              Este segmento tem alterações que ainda não foram salvas. Salve antes de sair ou descarte o que mudou.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-9 text-[13px]">Continuar editando</AlertDialogCancel>
            <GhostButton onClick={() => { setConfirmExit(false); onCancel(); }} className="h-9 text-[13px]">Descartar</GhostButton>
            <PrimaryButton onClick={() => { setConfirmExit(false); handleSave(); }} className="h-9 text-[13px]">Salvar e sair</PrimaryButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
