/**
 * Fase 2 do assistente pessoal — leituras do "Resumo do dia".
 *
 * Puro (sem React) para ser testável: três contagens em paralelo sobre tabelas
 * já existentes. Uma leitura que falha NÃO vira "zero": sai na lista
 * `failures` e a UI mostra "não verificado" — mesmo critério de
 * `useNextBestAction`, porque ausência de dado não é ausência de urgência.
 */
import { supabase } from '@/integrations/supabase/client';

export interface DailyBrief {
  todayCommitments: number;
  stalledConversations: number;
  unreadProposals: number;
  failures: string[];
}

/** Janela considerada "conversa parada" (cliente falou e ninguém respondeu). */
const STALLED_AFTER_MS = 2 * 60 * 60 * 1000;

export async function fetchDailyBrief(profileId: string, now: Date = new Date()): Promise<DailyBrief> {
  const failures: string[] = [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const stalledBefore = new Date(now.getTime() - STALLED_AFTER_MS).toISOString();

  const [commitments, stalled, proposals] = await Promise.all([
    supabase
      .from('conversation_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', profileId)
      .not('remind_at', 'is', null)
      .gte('remind_at', start.toISOString())
      .lte('remind_at', end.toISOString())
      .not('status', 'in', '(done,cancelled)'),
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender', 'contact')
      .lt('created_at', stalledBefore),
    supabase
      .from('sales_deals')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', profileId)
      .eq('status', 'open'),
  ]);

  if (commitments.error) failures.push('compromissos');
  if (stalled.error) failures.push('conversas paradas');
  if (proposals.error) failures.push('propostas');

  return {
    todayCommitments: commitments.error ? 0 : (commitments.count ?? 0),
    stalledConversations: stalled.error ? 0 : (stalled.count ?? 0),
    unreadProposals: proposals.error ? 0 : (proposals.count ?? 0),
    failures,
  };
}