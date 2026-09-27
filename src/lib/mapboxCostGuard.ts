// Guarda de custo do Search Box (Fase 5, E37). A Mapbox libera 500 sessões/mês; acima disso cobra
// US$3/1000. Este módulo checa a contagem do mês corrente (RPC no banco, nunca lendo audit_logs
// direto do cliente) e cacheia o resultado por 5 min — nunca bloqueia a digitação esperando rede.
// Quando o teto estoura, `isSearchBudgetOk()` vira false: quem chama para de disparar `/suggest` e
// cai no `/forward` de sempre, sem mostrar erro pro operador.
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/lib/audit';

export const MONTHLY_SESSION_LIMIT = 450;
const POLL_INTERVAL_MS = 5 * 60 * 1000;

let budgetOk = true;
let lastCheckedAt = 0;
let inFlight: Promise<void> | null = null;

async function refresh(): Promise<void> {
  try {
    const { data, error } = await (supabase as any).rpc('count_searchbox_sessions_this_month'); // eslint-disable-line @typescript-eslint/no-explicit-any -- cast temporário até sync de types
    if (error) return;
    const count = typeof data === 'number' ? data : Number(data);
    if (Number.isNaN(count)) return;
    const wasOk = budgetOk;
    budgetOk = count < MONTHLY_SESSION_LIMIT;
    if (wasOk && !budgetOk) {
      void logAudit({
        action: 'searchbox_cost_guard',
        details: { event: 'degraded', limit: MONTHLY_SESSION_LIMIT, count },
      });
    }
  } catch {
    // RPC indisponível: mantém o último estado conhecido, autocomplete não trava por isso.
  }
}

/**
 * `true` = autocomplete liberado. `false` = mês passou de `MONTHLY_SESSION_LIMIT` sessões.
 * Síncrono e otimista: dispara a checagem em background (cacheada 5 min) e devolve o último
 * estado conhecido na hora — nunca espera a rede.
 */
export function isSearchBudgetOk(): boolean {
  const now = Date.now();
  if (now - lastCheckedAt > POLL_INTERVAL_MS && !inFlight) {
    lastCheckedAt = now;
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
  }
  return budgetOk;
}

export function resetSearchBudgetGuardForTests(): void {
  budgetOk = true;
  lastCheckedAt = 0;
  inFlight = null;
}

/** Força a checagem agora e espera o resultado — só para teste determinístico. */
export function forceSearchBudgetRefreshForTests(): Promise<void> {
  lastCheckedAt = Date.now();
  inFlight = refresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
