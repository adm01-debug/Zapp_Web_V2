// X157 — "Tags mais usadas no público". A RPC `public.talkx_segment_tags(uuid)`
// existe desde o pacote de segmentos (C-11) e não tinha nenhuma tela lendo: o
// operador via os critérios do segmento, mas não o que os contatos daquele
// público realmente tinham de tag — informação que muda a próxima campanha
// (filtro por tag, mensagem por interesse).
//
// A RPC é `STABLE`, não é SECURITY DEFINER e não recebe parâmetro de dono: o
// recorte é feito pelas RLS de `talkx_campaigns`/`talkx_recipients`/`contacts`
// do usuário logado, e o servidor já devolve no máximo 10 tags ordenadas por
// quantidade de contatos distintos.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TalkXSegmentTag {
  tag: string;
  /** Quantos contatos do público carregam esta tag. */
  count: number;
}

type TalkXRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

export const SEGMENT_TAGS_LIMIT = 10;

/**
 * Converte o jsonb de `talkx_segment_tags` em itens de tela. Formato real
 * conferido em produção (2026-11-27): `[{"tag":"TESTE-DESIGN","count":3}, …]`.
 * Qualquer item fora do contrato é descartado em vez de virar "undefined" na
 * tela; tag repetida é somada uma única vez (a RPC já agrupa, mas o parser não
 * confia no servidor para não duplicar contagem).
 */
export function parseSegmentTags(raw: unknown): TalkXSegmentTag[] {
  if (!Array.isArray(raw)) return [];
  const byTag = new Map<string, number>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { tag, count } = item as { tag?: unknown; count?: unknown };
    if (typeof tag !== 'string') continue;
    const label = tag.trim();
    if (!label) continue;
    const n = Number(count);
    const value = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
    byTag.set(label, (byTag.get(label) ?? 0) + value);
  }
  return Array.from(byTag, ([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, SEGMENT_TAGS_LIMIT);
}

export interface UseTalkXSegmentTagsResult {
  tags: TalkXSegmentTag[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Lê as tags do público de um segmento (RPC X157). Sem segmento, não consulta. */
export function useTalkXSegmentTags(segmentId: string | null | undefined): UseTalkXSegmentTagsResult {
  const query = useQuery({
    queryKey: ['talkx-segment-tags', segmentId],
    queryFn: async (): Promise<unknown> => {
      const rpc = supabase.rpc.bind(supabase) as unknown as TalkXRpc;
      const { data, error } = await rpc('talkx_segment_tags', { p_segment: segmentId ?? '' });
      if (error) throw new Error('talkx-segment-tags: falha ao consultar talkx_segment_tags');
      return data;
    },
    enabled: !!segmentId,
    staleTime: 60_000,
  });

  const tags = useMemo(() => (query.data === undefined ? undefined : parseSegmentTags(query.data)), [query.data]);

  return {
    tags,
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: () => { void query.refetch(); },
  };
}