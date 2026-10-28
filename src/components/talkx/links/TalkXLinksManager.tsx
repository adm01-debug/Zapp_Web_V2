import React from 'react';
import { Link2, Plus, Pencil, Trash2, MousePointerClick } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PrimaryButton, GhostButton } from '@/components/dashboard/overview/DashboardCard';
import { TalkXConfirmDialog } from '../talkxShared';
import { cn } from '@/lib/utils';
import {
  buildTalkxLinkPlaceholder,
  buildTalkxLinkUrl,
  normalizeTalkxLinkLabel,
  suggestTalkxUtm,
  useTalkXLinks,
  validateTalkxLinkLabel,
  validateTalkxLinkTargetUrl,
  type TalkXLink,
  type TalkXLinkInput,
} from '@/hooks/integrations/useTalkXLinks';

/**
 * X118 (TL-072) — gerenciador de links rastreáveis do Talk X.
 *
 * Fica no passo "Mensagem" do assistente (tela 08): cria o link medido pela RPC
 * `talkx_upsert_link`, mostra a URL final e insere `{{link:rotulo}}` na posição
 * do cursor do editor único pelo callback `onInsertPlaceholder`.
 *
 * Quem edita é decidido FORA daqui (`canEdit`, do mesmo
 * `is_admin_or_supervisor` que o banco usa) — sem permissão, a lista continua
 * visível e nenhum botão de escrita aparece. O servidor continua sendo a
 * autoridade: se a regra mudar, a RPC recusa e o erro aparece em toast.
 */

export interface TalkXLinksManagerProps {
  /** `campaign_id` do rascunho; sem ele não há onde pendurar o link. */
  campaignId: string | null | undefined;
  /** Nome da campanha — só alimenta a sugestão de `utm_campaign`. */
  campaignName?: string;
  /** `true` só para admin/supervisor (mesmo predicado da RPC). */
  canEdit: boolean;
  /** Insere o placeholder no editor da mensagem (no cursor). */
  onInsertPlaceholder?: (placeholder: string) => void;
}

interface LinkFormState {
  id?: string;
  label: string;
  target_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
}

const ROW_ACTION =
  'h-7 px-2 rounded-md text-2xs font-medium border border-border/70 bg-input/40 text-foreground-secondary hover:bg-muted/50 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1';

function utmSummary(link: TalkXLink): string[] {
  const pairs: [string, string | null][] = [
    ['utm_source', link.utm_source],
    ['utm_medium', link.utm_medium],
    ['utm_campaign', link.utm_campaign],
    ['utm_content', link.utm_content],
    ['utm_term', link.utm_term],
  ];
  return pairs.filter(([, value]) => Boolean(value)).map(([key, value]) => `${key}=${value}`);
}

export function TalkXLinksManager({ campaignId, campaignName = '', canEdit, onInsertPlaceholder }: TalkXLinksManagerProps) {
  const { links, clicks, isLoading, isError, refetch, upsertLink, deleteLink } = useTalkXLinks(campaignId);
  const [form, setForm] = React.useState<LinkFormState | null>(null);
  const [showUtm, setShowUtm] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<TalkXLink | null>(null);

  const labelError = form ? validateTalkxLinkLabel(form.label) : null;
  const targetError = form ? validateTalkxLinkTargetUrl(form.target_url) : null;
  const canSave = Boolean(form) && !labelError && !targetError && !upsertLink.isPending;

  const openNew = () => {
    const utm = suggestTalkxUtm(campaignName);
    setForm({ label: '', target_url: '', ...utm, utm_content: '', utm_term: '' });
    setShowUtm(false);
  };

  const openEdit = (link: TalkXLink) => {
    setForm({
      id: link.id,
      label: link.label,
      target_url: link.target_url,
      utm_source: link.utm_source ?? '',
      utm_medium: link.utm_medium ?? '',
      utm_campaign: link.utm_campaign ?? '',
      utm_content: link.utm_content ?? '',
      utm_term: link.utm_term ?? '',
    });
    setShowUtm(utmSummary(link).length > 0);
  };

  const save = () => {
    if (!form || !canSave) return;
    const input: TalkXLinkInput = { ...form, label: normalizeTalkxLinkLabel(form.label) };
    upsertLink.mutate(input, { onSuccess: () => setForm(null) });
  };

  const update = (patch: Partial<LinkFormState>) => setForm((current) => (current ? { ...current, ...patch } : current));

  return (
    <section className="rounded-xl border border-border/70 bg-input/30">
      <header className="flex items-start justify-between gap-3 p-3 border-b border-border/60">
        <div className="flex items-start gap-2 min-w-0">
          <Link2 className="w-4 h-4 text-[hsl(var(--primary-text))] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">Links rastreáveis</p>
            <p className="text-2xs text-muted-foreground">Crie o link medido, insira na mensagem e acompanhe os cliques.</p>
          </div>
        </div>
        {canEdit && campaignId && !form && (
          <PrimaryButton size="sm" icon={Plus} onClick={openNew}>Novo link</PrimaryButton>
        )}
      </header>

      <div className="p-3 space-y-2">
        {!campaignId ? (
          <p className="text-2xs text-muted-foreground">Salve o rascunho da campanha para criar links rastreáveis.</p>
        ) : (
          <>
            {form && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="talkx-link-label" className="text-2xs">Rótulo</Label>
                  <Input
                    id="talkx-link-label"
                    value={form.label}
                    onChange={(event) => update({ label: event.target.value })}
                    placeholder="promo"
                    className="h-9 bg-input/40 border-border/70 text-xs"
                  />
                  <p className={cn('text-2xs', labelError ? 'text-dash-red' : 'text-muted-foreground')} role={labelError ? 'alert' : undefined}>
                    {labelError ?? 'Como o contato não vê: serve para você escrever {{link:rotulo}} na mensagem.'}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="talkx-link-target" className="text-2xs">Destino</Label>
                  <Input
                    id="talkx-link-target"
                    value={form.target_url}
                    onChange={(event) => update({ target_url: event.target.value })}
                    placeholder="https://suaempresa.com/oferta"
                    className="h-9 bg-input/40 border-border/70 text-xs"
                  />
                  {targetError && <p className="text-2xs text-dash-red" role="alert">{targetError}</p>}
                </div>

                <div>
                  <button
                    type="button"
                    aria-expanded={showUtm}
                    onClick={() => setShowUtm((value) => !value)}
                    className="text-2xs text-[hsl(var(--primary-text))] hover:underline"
                  >
                    {showUtm ? 'Ocultar UTM' : 'Medir origem (UTM)'}
                  </button>
                  {showUtm && (
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {([
                        ['utm_source', 'Origem', 'whatsapp'],
                        ['utm_medium', 'Mídia', 'talkx'],
                        ['utm_campaign', 'Campanha', 'nome-da-campanha'],
                        ['utm_content', 'Conteúdo', 'opcional'],
                        ['utm_term', 'Termo', 'opcional'],
                      ] as const).map(([field, label, placeholder]) => (
                        <div key={field} className="space-y-1">
                          <Label htmlFor={`talkx-link-${field}`} className="text-2xs">{label}</Label>
                          <Input
                            id={`talkx-link-${field}`}
                            value={form[field]}
                            onChange={(event) => update({ [field]: event.target.value })}
                            placeholder={placeholder}
                            className="h-8 bg-input/40 border-border/70 text-2xs"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <PrimaryButton size="sm" onClick={save} disabled={!canSave}>
                    {upsertLink.isPending ? 'Salvando…' : 'Salvar link'}
                  </PrimaryButton>
                  <GhostButton size="sm" onClick={() => setForm(null)}>Cancelar</GhostButton>
                </div>
              </div>
            )}

            {isLoading && <p className="text-2xs text-muted-foreground">Carregando links…</p>}

            {isError && (
              <div className="flex items-center gap-2 text-2xs text-dash-red">
                <span>Não foi possível carregar os links.</span>
                <button type="button" onClick={() => { void refetch(); }} className="hover:underline">Tentar novamente</button>
              </div>
            )}

            {!isLoading && !isError && links.length === 0 && !form && (
              <p className="text-2xs text-muted-foreground">Nenhum link rastreável nesta campanha ainda.</p>
            )}

            {links.map((link) => (
              <div key={link.id} className="rounded-lg border border-border/70 bg-input/20 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="text-2xs font-mono px-1.5 py-0.5 rounded bg-primary/10 text-[hsl(var(--primary-text))]">{buildTalkxLinkPlaceholder(link.label)}</code>
                    <span className="text-2xs text-muted-foreground flex items-center gap-1">
                      <MousePointerClick className="w-3 h-3" />{clicks[link.id] ?? 0} clique{(clicks[link.id] ?? 0) === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {onInsertPlaceholder && (
                      <button
                        type="button"
                        aria-label={`Inserir link ${link.label} na mensagem`}
                        onClick={() => onInsertPlaceholder(buildTalkxLinkPlaceholder(link.label))}
                        className={ROW_ACTION}
                      >
                        <Link2 className="w-3 h-3" />Inserir na mensagem
                      </button>
                    )}
                    {canEdit && !form && (
                      <>
                        <button type="button" aria-label={`Editar link ${link.label}`} onClick={() => openEdit(link)} className={ROW_ACTION}>
                          <Pencil className="w-3 h-3" />Editar
                        </button>
                        <button type="button" aria-label={`Excluir link ${link.label}`} onClick={() => setPendingDelete(link)} className={ROW_ACTION}>
                          <Trash2 className="w-3 h-3" />Excluir
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-2xs text-foreground-secondary break-all">{link.target_url}</p>
                {utmSummary(link).length > 0 && (
                  <p className="text-2xs text-muted-foreground break-all">{utmSummary(link).join(' · ')}</p>
                )}
                <p className="text-2xs text-muted-foreground break-all font-mono">{buildTalkxLinkUrl(link.slug)}</p>
              </div>
            ))}
          </>
        )}
      </div>

      <TalkXConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteLink.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) });
        }}
        icon={Trash2}
        iconColor="red"
        tone="danger"
        title="Excluir link?"
        entityName={pendingDelete?.label}
        description="A mensagem passa a mostrar o rótulo sem link. Links com cliques não podem ser excluídos."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        loading={deleteLink.isPending}
      />
    </section>
  );
}
