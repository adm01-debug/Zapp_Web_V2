/**
 * N-135 — Ajuda do Talk X: "tópicos mais vistos".
 *
 * Os mais vistos vêm da RPC `talkx_help_top_topics` (só `article_id` e contagens,
 * nunca o usuário). Cada artigo aberto grava uma linha em `talkx_help_views` por
 * `recordTalkXHelpView`.
 */
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabaseHelpers';

import { findHelpDoc, loadTalkXHelpDocs } from './help/talkxHelpIndex';
import { recordTalkXHelpView } from './help/recordTalkXHelpView';

export interface TalkXHelpTopTopic {
  article_id: string;
  views: number;
  unique_viewers: number;
}

async function fetchTopTopics(days: number): Promise<TalkXHelpTopTopic[]> {
  const rpc = supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: TalkXHelpTopTopic[] | null; error: { message: string } | null }>;
  const { data, error } = await rpc('talkx_help_top_topics', { p_days: days });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface TalkXHelpProps {
  days?: number;
  onOpenArticle?: (articleId: string) => void;
}

export function TalkXHelp({ days = 30, onOpenArticle }: TalkXHelpProps) {
  const top = useQuery({ queryKey: ['talkx-help-top-topics', days], queryFn: () => fetchTopTopics(days) });
  const docs = useQuery({ queryKey: ['talkx-help-docs'], queryFn: loadTalkXHelpDocs });

  const titleOf = (id: string) => (docs.data ? findHelpDoc(docs.data, id)?.title : undefined) ?? id;

  return (
    <section aria-label="Ajuda do Talk X">
      <h2>Mais vistos</h2>
      {top.isLoading ? <p>Carregando…</p> : null}
      {top.isError ? <p role="alert">Não foi possível carregar os mais vistos.</p> : null}
      {top.data && top.data.length === 0 ? <p>Ainda não há visualizações.</p> : null}
      {top.data && top.data.length > 0 ? (
        <ol>
          {top.data.map((t) => (
            <li key={t.article_id}>
              <button
                type="button"
                onClick={() => {
                  void recordTalkXHelpView(t.article_id);
                  onOpenArticle?.(t.article_id);
                }}
              >
                {titleOf(t.article_id)}
              </button>{' '}
              <span>{t.views} {t.views === 1 ? 'visualização' : 'visualizações'}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

export default TalkXHelp;
