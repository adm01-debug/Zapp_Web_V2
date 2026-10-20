import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';

export type UnreadEmailCountStatus = 'loading' | 'ok' | 'erro';

export interface UnreadEmailCount {
  /** Conversas (`email_threads`) não lidas de todas as contas visíveis por RLS. */
  count: number;
  status: UnreadEmailCountStatus;
}

/**
 * Recontagem disparada por realtime: um sync de e-mail entrega vários eventos em
 * sequência, e um `count` por evento multiplicaria consultas iguais. 500 ms junta
 * a rajada numa consulta só.
 */
const DEBOUNCE_MS = 500;

/** Estado de quem não consulta (sem acesso ao módulo de E-mail): sem selo. */
const IDLE: UnreadEmailCount = { count: 0, status: 'ok' };

/**
 * Em Vitest, testes de layout que montam a Sidebar real não devem abrir WebSocket
 * externo do Supabase (jsdom/undici mistura classes `Event` e derruba a suíte).
 * O teste deste hook mocka o cliente Supabase; nesse caso a consulta e o realtime
 * continuam exercitados normalmente. Em produção/desenvolvimento real, nada muda.
 */
function canTouchSupabaseClient() {
  if (import.meta.env.MODE !== 'test') return true;
  return isVitestMock(supabase.from) || isVitestMock(supabase.channel);
}

function isVitestMock(value: unknown) {
  return typeof value === 'function' && 'mock' in value;
}

/**
 * Conta as CONVERSAS não lidas (`email_threads.is_unread = true`) de todas as
 * contas do usuário que o RLS deixa ver. Mesma definição do contador do módulo de
 * E-mail (`useGmail`), mas sem depender dele e sem carregar a lista: uma consulta
 * de contagem (`count: 'exact', head: true`) e recontagem por realtime.
 *
 * `enabled = false` (usuário sem acesso ao item Email na barra) não consulta e não
 * assina nada. Erro nunca lança: vira `status: 'erro'` com `count: 0`, para a barra
 * lateral não quebrar nem mostrar selo errado.
 */
export function useUnreadEmailCount(enabled = true): UnreadEmailCount {
  const canRun = enabled && canTouchSupabaseClient();
  const [snapshot, setSnapshot] = useState<UnreadEmailCount>({ count: 0, status: 'loading' });

  useEffect(() => {
    if (!canRun) return;

    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const recount = async () => {
      try {
        const { count, error } = await supabase
          .from('email_threads')
          .select('id', { count: 'exact', head: true })
          .eq('is_unread', true);
        if (cancelled) return;
        if (error) {
          setSnapshot({ count: 0, status: 'erro' });
          return;
        }
        setSnapshot({ count: count ?? 0, status: 'ok' });
      } catch {
        if (!cancelled) setSnapshot({ count: 0, status: 'erro' });
      }
    };

    const scheduleRecount = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { void recount(); }, DEBOUNCE_MS);
    };

    void recount();

    const channel = supabase
      .channel(uniqueRealtimeTopic('email-unread-count'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_threads' }, scheduleRecount)
      .subscribe();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [canRun]);

  return useMemo(() => (canRun ? snapshot : IDLE), [canRun, snapshot]);
}
