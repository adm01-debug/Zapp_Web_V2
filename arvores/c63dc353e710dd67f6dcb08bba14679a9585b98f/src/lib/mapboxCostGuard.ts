// Guarda de custo do Search Box (Fase 5, E37). A Mapbox libera 500 sessões/mês; acima disso cobra
// US$3/1000. Este módulo checa a contagem do mês corrente (RPC no banco, nunca lendo audit_logs
// direto do cliente) e cacheia o resultado por 5 min — nunca bloqueia a digitação esperando rede.
// Quando o teto estoura, `isSearchBudgetOk()` vira false: quem chama para de disparar `/suggest` e
// cai no `/forward` de sempre, sem mostrar erro pro operador.
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/lib/audit';

/**
 * Teto mensal padrão: a Mapbox libera 500 sessões/mês e cobra US$3/1000 acima disso; 450 dá margem.
 * É o valor usado quando não há configuração — ver `getMonthlySessionLimit()`.
 */
export const DEFAULT_MONTHLY_SESSION_LIMIT = 450;

/** @deprecated teto fixo (E48). Use `getMonthlySessionLimit()`. Mantido pelo nome histórico. */
export const MONTHLY_SESSION_LIMIT = DEFAULT_MONTHLY_SESSION_LIMIT;

/**
 * Teto efetivo, lido da CONFIGURAÇÃO a cada checagem — mudar o teto não exige recarregar o app
 * (E48). Valor ausente, vazio, não numérico ou <= 0 cai no PADRÃO: `Number('')` é 0 e
 * `Number('abc')` é NaN, e nenhum dos dois pode virar "sem teto" e desligar a guarda em silêncio.
 */
export function getMonthlySessionLimit(): number {
  const raw = import.meta.env.VITE_SEARCHBOX_MONTHLY_SESSION_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MONTHLY_SESSION_LIMIT;
  return Math.floor(parsed);
}
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * E47 — o aviso de degradação sai UMA vez por mês, não a cada carregamento. `budgetOk` nasce `true`
 * a cada reload, então sem esta marca quem recarregasse a página depois de estourar o teto emitiria
 * o evento de novo. A marca é por mês (UTC, o mesmo critério de `count_searchbox_sessions_this_month`).
 */
const NOTIFICADO_PREFIX = 'searchbox_cost_guard_notified:';

function mesAtual(): string {
  return new Date().toISOString().slice(0, 7); // AAAA-MM
}

function jaAvisouEsteMes(): boolean {
  try {
    return localStorage.getItem(NOTIFICADO_PREFIX + mesAtual()) !== null;
  } catch {
    // Storage bloqueado (modo restrito/privado): prefere emitir o evento a ficar calado — o
    // objetivo do evento é observabilidade, e um aviso repetido custa menos que um aviso perdido.
    return false;
  }
}

function marcarAvisoDoMes(): void {
  try {
    localStorage.setItem(NOTIFICADO_PREFIX + mesAtual(), new Date().toISOString());
  } catch {
    // idem: sem storage, o pior caso é repetir o evento, nunca perdê-lo.
  }
}

/**
 * E49 — aviso antecipado: a partir de 80% do teto efetivo, gravar UM evento
 * `searchbox_budget_warning` por mês, com a MESMA mecânica de marca persistida por mês do E47
 * (localStorage, não `budgetOk`, que nasce `true` a cada reload). Sem UI: alimenta o painel (E52).
 * O evento leva só `limit`/`count`/`month` — nunca termo de busca nem coordenada.
 */
const AVISO_ANTECIPADO_PREFIX = 'searchbox_budget_warning_notified:';

/** Limiar em sessões: 80% do teto, em aritmética inteira (evita ruído de ponto flutuante). */
function limiarAntecipado(limit: number): number {
  return Math.ceil((limit * 8) / 10);
}

function jaAvisouAntecipadoEsteMes(): boolean {
  try {
    return localStorage.getItem(AVISO_ANTECIPADO_PREFIX + mesAtual()) !== null;
  } catch {
    return false;
  }
}

function marcarAvisoAntecipadoDoMes(): void {
  try {
    localStorage.setItem(AVISO_ANTECIPADO_PREFIX + mesAtual(), new Date().toISOString());
  } catch {
    // idem: sem storage, repete o evento a perdê-lo — observabilidade em primeiro lugar.
  }
}

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
    const limit = getMonthlySessionLimit();
    budgetOk = count < limit;
    if (wasOk && !budgetOk && !jaAvisouEsteMes()) {
      marcarAvisoDoMes();
      void logAudit({
        action: 'searchbox_cost_guard',
        details: { event: 'degraded', limit, count, month: mesAtual() },
      });
    }
    // E49 — aviso antecipado a 80% do teto. Só quando AINDA liberado (`budgetOk`): depois de
    // degradar, quem fala é o evento do E47, e o aviso de 80% para de fazer sentido.
    if (budgetOk && count >= limiarAntecipado(limit) && !jaAvisouAntecipadoEsteMes()) {
      marcarAvisoAntecipadoDoMes();
      void logAudit({
        action: 'searchbox_budget_warning',
        details: { event: 'warning', limit, count, month: mesAtual() },
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
