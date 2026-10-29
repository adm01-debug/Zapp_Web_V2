import { fromTable } from '@/lib/supabaseHelpers';

/**
 * N-135 — registra a visualização de um artigo de ajuda do Talk X.
 * Uma linha por artigo aberto (`user_id` vem do DEFAULT `auth.uid()`).
 * Falha aqui não atrapalha a leitura.
 */
export async function recordTalkXHelpView(articleId: string): Promise<void> {
  const res = await fromTable('talkx_help_views').insert({ article_id: articleId });
  if (res?.error) console.warn('talkx_help_views: visualização não registrada', res.error.message);
}
