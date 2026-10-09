import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fromTable } from '@/lib/supabaseHelpers';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * X118 (CAP-062, front) — links rastreáveis de uma campanha do Talk X.
 *
 * O banco já tem a escrita (X021): `talkx_upsert_link` cria/edita e
 * `talkx_delete_link` apaga, ambas SECURITY DEFINER com o gate
 * `is_admin_or_supervisor`. Aqui NÃO se recalcula permissão nem se gera slug:
 * o servidor é a autoridade — o cliente repete apenas a MESMA regra de forma
 * do rótulo/destino (`talkx_links_label_format_check` e
 * `^https://`) para o usuário ver o erro antes de gastar uma viagem.
 *
 * O placeholder `{{link:rotulo}}` e a URL final (com `?r=<destinatário>`,
 * preenchido no envio) seguem EXATAMENTE o mesmo formato do motor:
 * `supabase/functions/talkx-send/index.ts` (`loadTrackingLinks`) e o
 * `personalize` do edge (X022) — este módulo é a cópia do front, não uma
 * segunda regra.
 */

export interface TalkXLink {
  id: string;
  campaign_id: string;
  label: string;
  target_url: string;
  slug: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  created_at: string;
}

export interface TalkXLinkInput {
  /** Presente = edição; ausente = criação (o slug nasce no servidor). */
  id?: string;
  label: string;
  target_url: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
}

export const TALKX_LINK_SELECT =
  'id, campaign_id, label, target_url, slug, utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at';

/** Mesma forma do CHECK `talkx_links_label_format_check` e da RPC. */
export const TALKX_LINK_LABEL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Caminho público do link medido (mesmo do `loadTrackingLinks` do motor). */
export const TALKX_LINK_PATH = '/functions/v1/talkx-link';

export function normalizeTalkxLinkLabel(raw: string): string {
  return raw.trim().toLowerCase();
}

/** `null` = rótulo aceito; texto = mensagem para o usuário. */
export function validateTalkxLinkLabel(raw: string): string | null {
  const label = normalizeTalkxLinkLabel(raw);
  if (!label) return 'Informe um rótulo para o link.';
  if (!TALKX_LINK_LABEL_PATTERN.test(label)) {
    return 'Use até 40 caracteres: letras minúsculas sem acento, números, "-" ou "_", começando por letra ou número.';
  }
  return null;
}

/** `null` = destino aceito; texto = mensagem para o usuário. */
export function validateTalkxLinkTargetUrl(raw: string): string | null {
  const target = raw.trim();
  if (!target) return 'Informe o destino do link.';
  if (!target.startsWith('https://')) return 'O destino precisa começar com https://.';
  return null;
}

/**
 * URL final do link medido. Sem destinatário (o caso da tela) sai a forma base;
 * no envio o motor acrescenta `&r=<recipient_id>` para atribuir o clique.
 */
export function buildTalkxLinkUrl(slug: string, baseUrl: string = SUPABASE_URL, recipientId?: string): string {
  const base = `${baseUrl.replace(/\/+$/, '')}${TALKX_LINK_PATH}`;
  const query = `s=${encodeURIComponent(slug)}${recipientId ? `&r=${encodeURIComponent(recipientId)}` : ''}`;
  return `${base}?${query}`;
}

/** O token que vai para a mensagem — lido pelo `personalize` do edge (X022). */
export function buildTalkxLinkPlaceholder(label: string): string {
  return `{{link:${normalizeTalkxLinkLabel(label)}}}`;
}

function talkxSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Sugestão de UTM mostrada no formulário (o usuário pode trocar tudo). */
export function suggestTalkxUtm(campaignName: string): { utm_source: string; utm_medium: string; utm_campaign: string } {
  return { utm_source: 'whatsapp', utm_medium: 'talkx', utm_campaign: talkxSlug(campaignName) };
}

/** Código de erro da RPC (`talkx_*`) → frase para o usuário. */
export function talkxLinkErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error
    ? error.message
    : (typeof error === 'object' && error !== null && 'message' in error)
      ? String((error as { message: unknown }).message)
      : '';
  const known: [string, string][] = [
    ['talkx_link_not_authorized', 'Só admin ou supervisor pode criar, editar e excluir links da campanha.'],
    ['talkx_link_campaign_not_editable', 'A campanha não está mais em rascunho ou agendada: os links ficam só para leitura.'],
    ['talkx_link_invalid_label', 'Rótulo inválido: use letras minúsculas, números, "-" ou "_", começando por letra ou número.'],
    ['talkx_link_invalid_target', 'O destino precisa começar com https://.'],
    ['talkx_link_has_clicks', 'Este link já recebeu cliques; por isso não pode ser excluído.'],
    ['talkx_link_not_found', 'Link não encontrado. Recarregue a lista.'],
    ['talkx_link_campaign_not_found', 'Campanha não encontrada para este link.'],
  ];
  for (const [code, text] of known) if (message.includes(code)) return text;
  return fallback;
}

function optionalText(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function useTalkXLinks(campaignId: string | null | undefined) {
  const qc = useQueryClient();
  const queryKey = ['talkx-links', campaignId ?? null];

  const query = useQuery({
    queryKey,
    enabled: Boolean(campaignId),
    queryFn: async () => {
      const { data, error } = await fromTable('talkx_links')
        .select(TALKX_LINK_SELECT)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const links = (data ?? []) as TalkXLink[];
      // Cliques por link em UMA consulta (a RLS já limita aos links das
      // campanhas do usuário). Sem cliques, a lista só mostra zeros.
      const clicks: Record<string, number> = {};
      if (links.length > 0) {
        const { data: rows } = await fromTable('talkx_link_clicks')
          .select('link_id')
          .in('link_id', links.map((link) => link.id));
        for (const row of (rows ?? []) as { link_id?: string | null }[]) {
          if (!row.link_id) continue;
          clicks[row.link_id] = (clicks[row.link_id] ?? 0) + 1;
        }
      }
      return { links, clicks };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const upsertLink = useMutation({
    mutationFn: async (input: TalkXLinkInput) => {
      if (!campaignId) throw new Error('Salve o rascunho da campanha antes de criar o link.');
      const labelError = validateTalkxLinkLabel(input.label);
      if (labelError) throw new Error(labelError);
      const targetError = validateTalkxLinkTargetUrl(input.target_url);
      if (targetError) throw new Error(targetError);
      const { data, error } = await supabase.rpc('talkx_upsert_link', {
        p_campaign_id: campaignId,
        p_label: normalizeTalkxLinkLabel(input.label),
        p_target_url: input.target_url.trim(),
        ...(input.id ? { p_link_id: input.id } : {}),
        p_utm_source: optionalText(input.utm_source),
        p_utm_medium: optionalText(input.utm_medium),
        p_utm_campaign: optionalText(input.utm_campaign),
        p_utm_content: optionalText(input.utm_content),
        p_utm_term: optionalText(input.utm_term),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidate(); toast.success('Link salvo'); },
    onError: (error: unknown) => toast.error(talkxLinkErrorMessage(error, 'Não foi possível salvar o link.')),
  });

  const deleteLink = useMutation({
    mutationFn: async (linkId: string) => {
      const { data, error } = await supabase.rpc('talkx_delete_link', { p_link_id: linkId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { invalidate(); toast.success('Link excluído'); },
    onError: (error: unknown) => toast.error(talkxLinkErrorMessage(error, 'Não foi possível excluir o link.')),
  });

  return {
    links: query.data?.links ?? [],
    clicks: query.data?.clicks ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
    upsertLink,
    deleteLink,
  };
}
