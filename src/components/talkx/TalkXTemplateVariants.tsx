import React, { useEffect, useRef, useState } from 'react';
import { Check, Send, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TalkXMessageEditor } from './TalkXMessageEditor';
import { WhatsAppBubble, fmtInt, personalizePreview } from './talkxShared';
import {
  MIN_SENT_FOR_WINNER, VARIANT_LABELS, isVariantInUseError, splitWeightsEvenly, variantWeights,
  type TalkXVariantResult, type TemplateVariantDraft,
} from './talkxVariants';
import type { TemplateVariant } from '@/hooks/integrations/useTalkXTemplates';

/**
 * X097 — aba Variações A/B do editor de template.
 *
 * Substitui os DOIS blocos duplicados que viviam em `TalkXTemplateEditor`
 * (rail xl + faixa < xl). Aqui a atribuição fica explícita:
 *
 * - Colunas lado a lado: **Controle** (o texto-base, editado na aba Conteúdo) e
 *   as variantes B e, opcionalmente, C — cada variante com o `TalkXMessageEditor`
 *   único do Talk X, mídia própria e prévia.
 * - O peso do controle é o que sobra de 100% (`100 - soma das variantes`), então
 *   mexer em B ajusta o controle no mesmo passo. "Dividir igualmente" reparte
 *   100% entre o controle e as variantes.
 * - O conjunto só é gravado pelo botão **Salvar variações** (nada de salvar no
 *   blur); soma diferente de 100% nunca é enviada para a RPC.
 * - O resultado por variante (CAP-070) aparece em cada coluna; sem dado, "sem
 *   dados ainda".
 * - "Declarar vencedora" explica o efeito e só libera abaixo de 100 enviadas
 *   com a marcação "sem base suficiente".
 *
 * As regras puras (pesos, rótulos e tipos) ficam em `talkxVariants.ts`.
 */

const MEDIA_OPTIONS = [
  { value: '', label: 'Sem mídia' },
  { value: 'image', label: 'Imagem' },
  { value: 'video', label: 'Vídeo' },
  { value: 'document', label: 'Doc' },
] as const;

export interface TalkXTemplateVariantsProps {
  templateId: string | null;
  /** Texto-base (controle), editado na aba Conteúdo. */
  baseContent: string;
  baseMediaUrl?: string | null;
  baseMediaType?: string | null;
  variants: TemplateVariant[];
  saving?: boolean;
  knownVariables?: readonly string[];
  /** Resultado por variante já carregado (CAP-070). */
  results?: TalkXVariantResult[];
  /** Contagem de destinatários atribuídos; guarda de exclusão (X085). */
  countRecipients?: (variantId: string) => Promise<number>;
  onRemoveVariant: (variant: TemplateVariantDraft) => void | Promise<void>;
  onSaveVariants: (drafts: TemplateVariantDraft[]) => void | Promise<void>;
  onDeclareWinner: (variant: TemplateVariantDraft) => void | Promise<void>;
  onTestVariant?: (variant: TemplateVariantDraft) => void;
}

export function TalkXTemplateVariants({
  templateId,
  baseContent,
  baseMediaUrl,
  baseMediaType,
  variants,
  saving = false,
  knownVariables,
  results,
  countRecipients,
  onRemoveVariant,
  onSaveVariants,
  onDeclareWinner,
  onTestVariant,
}: TalkXTemplateVariantsProps) {
  const [drafts, setDrafts] = useState<TemplateVariantDraft[]>(variants);
  const [removePrompt, setRemovePrompt] = useState<{ variant: TemplateVariantDraft; count: number } | null>(null);
  const [removeBusy, setRemoveBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [winnerFor, setWinnerFor] = useState<TemplateVariantDraft | null>(null);
  const [noBase, setNoBase] = useState<Record<string, boolean>>({});
  const mountedRef = useRef(true);

  // Rascunhos acompanham o conjunto carregado; edição local não é descartada por
  // um render do pai (só a troca de id/rótulo — carga, save ou troca de template).
  const draftsKey = `${templateId ?? 'sem-template'}|${variants.map((variant) => variant.id ?? `nova:${variant.label}`).join('|')}`;
  const lastKeyRef = useRef(draftsKey);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    if (lastKeyRef.current === draftsKey) return;
    lastKeyRef.current = draftsKey;
    setDrafts(variants);
    setError(null);
  }, [draftsKey, variants]);

  const weights = variantWeights(drafts);
  const usedLabels = new Set(drafts.map((draft) => draft.label));
  const nextLabel = VARIANT_LABELS.find((label) => !usedLabels.has(label)) ?? null;

  const patchDraft = (label: TemplateVariant['label'], patch: Partial<TemplateVariantDraft>) => {
    setError(null);
    setDrafts((current) => current.map((draft) => (draft.label === label ? { ...draft, ...patch } : draft)));
  };

  const addVariant = () => {
    if (!nextLabel || !templateId) return;
    setError(null);
    setDrafts((current) => {
      const { variants: shares } = splitWeightsEvenly(current.length + 1);
      return [
        ...current.map((draft, index) => ({ ...draft, weight: shares[index] ?? 1 })),
        {
          template_id: templateId,
          label: nextLabel,
          content: baseContent,
          media_url: null,
          media_type: null,
          weight: shares[current.length] ?? 1,
        },
      ];
    });
  };

  const splitEvenly = () => {
    setError(null);
    setDrafts((current) => {
      const { variants: shares } = splitWeightsEvenly(current.length);
      return current.map((draft, index) => ({ ...draft, weight: shares[index] ?? 1 }));
    });
  };

  /** Toda falha de exclusão aparece na tela (inclusive a guarda do banco). */
  const reportRemoveError = (cause: unknown) => {
    if (!mountedRef.current) return;
    setError(
      isVariantInUseError(cause)
        ? 'Esta variante está em uso (talkx_variant_in_use) e não pode ser excluída.'
        : cause instanceof Error ? cause.message : 'Não foi possível excluir a variante.',
    );
  };

  const requestRemove = async (variant: TemplateVariantDraft) => {
    setError(null);
    // Rascunho nunca gravado: sai só da lista local (nada a apagar no banco).
    if (!variant.id) {
      setDrafts((current) => current.filter((draft) => draft.label !== variant.label));
      return;
    }
    if (!countRecipients) {
      try {
        await onRemoveVariant(variant);
      } catch (cause) {
        reportRemoveError(cause);
      }
      return;
    }
    setRemoveBusy(variant.label);
    let count = 0;
    try {
      count = await countRecipients(variant.id);
    } catch (cause) {
      if (!mountedRef.current) return;
      setRemoveBusy(null);
      if (isVariantInUseError(cause)) {
        setRemovePrompt({ variant, count: 0 });
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Não foi possível verificar a variante.');
      return;
    }
    if (!mountedRef.current) return;
    setRemoveBusy(null);
    if (count > 0) {
      setRemovePrompt({ variant, count });
      return;
    }
    try {
      await onRemoveVariant(variant);
    } catch (cause) {
      reportRemoveError(cause);
    }
  };

  const confirmRemove = async () => {
    const prompt = removePrompt;
    if (!prompt) return;
    setRemovePrompt(null);
    try {
      await onRemoveVariant(prompt.variant);
    } catch (cause) {
      reportRemoveError(cause);
    }
  };

  const normalizeDraftForSave = (draft: TemplateVariantDraft): TemplateVariantDraft => {
    const mediaUrl = draft.media_url?.trim() || null;
    return {
      ...draft,
      media_url: mediaUrl,
      media_type: mediaUrl ? draft.media_type : null,
    };
  };

  const handleSave = async () => {
    if (!templateId || drafts.some((draft) => draft.template_id !== templateId)) {
      setError('As variações pertencem a outro template; reabra a aba de variações.');
      return;
    }
    if (!weights.valid) {
      setError(`Os pesos somam ${weights.total}%: o controle fica com o restante e o conjunto precisa fechar 100%.`);
      return;
    }
    setError(null);
    try {
      await onSaveVariants(drafts.map(normalizeDraftForSave));
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'Não foi possível salvar as variações.');
    }
  };

  const resultFor = (variant: TemplateVariantDraft) => results?.find((item) => item.variant_id === variant.id) ?? null;
  const sentFor = (variant: TemplateVariantDraft) => resultFor(variant)?.sent ?? 0;
  const canDeclare = (variant: TemplateVariantDraft) =>
    sentFor(variant) >= MIN_SENT_FOR_WINNER || !!noBase[variant.label];

  const declareWinner = async () => {
    const variant = winnerFor;
    setWinnerFor(null);
    if (!variant) return;
    try {
      await onDeclareWinner(variant);
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : 'Não foi possível declarar a vencedora.');
    }
  };

  return (
    <section className="rounded-2xl bg-card border border-border/70 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">Variações A/B</p>
        <span className="text-2xs text-muted-foreground">
          Peso total: {weights.total}% {weights.valid ? '✓' : '— deve somar 100%'}
        </span>
      </div>
      {/* Faixa fixa com a regra do sorteio (mesma frase do plano X097). */}
      <p className="text-2xs text-foreground-secondary rounded-xl border border-border/60 bg-input/20 px-2.5 py-1.5">
        O texto-base é o controle e entra no sorteio; campanha com texto alterado no wizard não sorteia variação.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {/* Coluna Controle — o texto-base, editado na aba Conteúdo. */}
        <div
          data-testid="talkx-variant-controle"
          className="rounded-xl border border-primary/30 bg-input/20 p-3 space-y-2 min-w-0"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs font-bold text-primary">Controle</span>
            <span data-testid="talkx-variant-controle-peso" className="text-2xs font-bold text-primary tabular-nums">
              {weights.control}%
            </span>
          </div>
          <p className="text-3xs text-muted-foreground">O texto-base, editado na aba Conteúdo.</p>
          <div data-testid="talkx-variant-controle-conteudo" className="rounded-lg border border-border/60 bg-input/30 px-2 py-1.5 text-2xs text-foreground whitespace-pre-wrap min-h-[64px]">
            {baseContent || <span className="text-muted-foreground italic">Sem texto ainda.</span>}
          </div>
          <WhatsAppBubble
            text={personalizePreview(baseContent)}
            mediaUrl={baseMediaUrl ?? null}
            mediaType={baseMediaType ?? null}
            className="text-2xs"
          />
        </div>

        {/* Colunas das variantes */}
        {drafts.map((draft) => {
          const result = resultFor(draft);
          const sent = sentFor(draft);
          const declare = canDeclare(draft);
          return (
            <div
              key={draft.id ?? `nova:${draft.label}`}
              data-testid={`talkx-variant-${draft.label}`}
              className="rounded-xl border border-border/60 bg-input/20 p-3 space-y-2 min-w-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs font-bold text-primary flex items-center gap-1">
                  Variante {draft.label} ·
                  <input
                    type="number"
                    min={1}
                    max={100}
                    aria-label={`Peso da variante ${draft.label}`}
                    value={draft.weight}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      patchDraft(draft.label, { weight: Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 1 });
                    }}
                    className="w-10 text-center bg-transparent border-b border-primary/40 outline-none text-2xs font-bold text-primary tabular-nums"
                  />
                  %
                </span>
                <div className="flex items-center gap-1">
                  {onTestVariant && (
                    <button
                      type="button"
                      onClick={() => onTestVariant(draft)}
                      aria-label={`Testar variante ${draft.label}`}
                      className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10"
                    >
                      <Send className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={removeBusy === draft.label}
                    onClick={() => void requestRemove(draft)}
                    aria-label={`Excluir variante ${draft.label}`}
                    className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/20 disabled:opacity-40"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <TalkXMessageEditor
                value={draft.content}
                onChange={(next) => patchDraft(draft.label, { content: next.slice(0, 1024) })}
                rows={5}
                limit={1024}
                knownVariables={knownVariables}
                placeholder={`Conteúdo da variante ${draft.label}…`}
              />

              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1">
                  {MEDIA_OPTIONS.map((option) => {
                    const active = option.value === '' ? !draft.media_type : draft.media_type === option.value;
                    return (
                      <button
                        key={option.value || 'none'}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          patchDraft(draft.label, option.value === ''
                            ? { media_url: null, media_type: null }
                            : { media_type: option.value, media_url: draft.media_url?.trim() || null })
                        }
                        className={cn(
                          'h-6 px-2 rounded-md text-3xs font-medium border',
                          active ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 text-muted-foreground hover:border-primary/40',
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {!!draft.media_type && (
                  <Input
                    value={draft.media_url ?? ''}
                    onChange={(event) => patchDraft(draft.label, { media_url: event.target.value })}
                    aria-label={`URL da mídia da variante ${draft.label}`}
                    placeholder="URL da mídia (ex: https://…/imagem.jpg)"
                    className="h-8 bg-input/40 border-border/70 text-2xs"
                  />
                )}
              </div>

              <WhatsAppBubble
                text={personalizePreview(draft.content)}
                mediaUrl={draft.media_url}
                mediaType={draft.media_type}
                className="text-2xs"
              />

              <div className="rounded-lg border border-border/50 bg-muted/20 p-2">
                {result ? (
                  <div className="grid grid-cols-2 gap-1">
                    {([
                      ['Destinatários', fmtInt(result.recipients)],
                      ['Enviadas', fmtInt(result.sent)],
                      ['Entregues', fmtInt(result.delivered)],
                      ['Respostas', fmtInt(result.replies)],
                      ['Taxa', result.sent > 0 ? `${Math.round((result.replies / result.sent) * 100)}%` : '—'],
                    ] as const).map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <p className="text-3xs text-foreground-secondary truncate">{label}</p>
                        <p className="text-2xs font-semibold text-foreground tabular-nums">{value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-3xs text-muted-foreground">sem dados ainda</p>
                )}
              </div>

              <label className="flex items-center gap-1.5 text-3xs text-foreground-secondary">
                <input
                  type="checkbox"
                  checked={!!noBase[draft.label]}
                  onChange={(event) => {
                    setError(null);
                    setNoBase((current) => ({ ...current, [draft.label]: event.target.checked }));
                  }}
                  className="h-3 w-3 accent-primary"
                />
                sem base suficiente (variante {draft.label})
              </label>
              <button
                type="button"
                disabled={!declare}
                onClick={() => setWinnerFor(draft)}
                className="w-full h-7 rounded-lg border border-primary/40 text-2xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50 disabled:pointer-events-none"
              >
                Declarar vencedora
              </button>
              {!declare && (
                <p className="text-3xs text-muted-foreground">
                  Libera com {MIN_SENT_FOR_WINNER} enviadas ({sent} até agora) ou marcando "sem base suficiente".
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {nextLabel && (
          <button
            type="button"
            disabled={saving || !templateId}
            onClick={addVariant}
            className="h-7 px-2 rounded-lg border border-dashed border-primary/40 text-2xs text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            + Adicionar variante {nextLabel}
          </button>
        )}
        <button
          type="button"
          disabled={saving || drafts.length === 0}
          onClick={splitEvenly}
          className="h-7 px-2 rounded-lg border border-border/70 bg-input/40 text-2xs font-medium hover:bg-muted/50 disabled:opacity-50"
        >
          Dividir igualmente
        </button>
        <button
          type="button"
          disabled={saving || !templateId}
          onClick={() => void handleSave()}
          className="h-7 px-3 rounded-lg border border-primary/40 bg-primary/10 text-2xs font-semibold text-primary flex items-center gap-1 hover:bg-primary/20 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : (<><Check className="w-3 h-3" /> Salvar variações</>)}
        </button>
      </div>

      {removePrompt && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-2.5 py-2 space-y-1.5">
          <p className="text-2xs text-foreground">
            {removePrompt.count > 0
              ? `Variante ${removePrompt.variant.label} usada em ${fmtInt(removePrompt.count)} envio(s). Excluir apaga a atribuição A/B.`
              : `Variante ${removePrompt.variant.label} em uso (talkx_variant_in_use). Excluir apaga a atribuição A/B.`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRemovePrompt(null)}
              className="h-7 px-2 rounded-lg border border-border/70 bg-input/40 text-2xs font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmRemove()}
              className="h-7 px-2 rounded-lg border border-destructive/50 bg-destructive/20 text-2xs font-semibold text-destructive"
            >
              Confirmar exclusão
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-2xs text-destructive">{error}</p>}

      <Dialog open={!!winnerFor} onOpenChange={(open) => { if (!open) setWinnerFor(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Declarar vencedora</DialogTitle>
            <DialogDescription>
              O conteúdo vencedor passa a ser o texto-base do template — salve o template para confirmar.
              Os envios já atribuídos às variantes não são alterados.
            </DialogDescription>
          </DialogHeader>
          {winnerFor && (
            <div className="space-y-2">
              <p className="text-2xs text-foreground-secondary">
                Variante {winnerFor.label} · {fmtInt(sentFor(winnerFor))} enviada(s).
              </p>
              {sentFor(winnerFor) < MIN_SENT_FOR_WINNER && (
                <p className="text-2xs text-warning">
                  Abaixo de {MIN_SENT_FOR_WINNER} enviadas: confirme apenas se quiser adotar sem essa base.
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setWinnerFor(null)}
                  className="flex-1 h-9 rounded-lg border border-border/70 bg-input/40 text-[13px] font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void declareWinner()}
                  className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold"
                >
                  Confirmar vencedora
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
