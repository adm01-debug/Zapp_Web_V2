import { supabase } from '@/integrations/supabase/client';
// t_fd52bf49: a fachada pede o sonner por import() — a lib fica fora do bundle inicial.
import { toast } from '@/lib/lazyToast';

export interface SipProvisioning {
  server: string;
  user: string;
  password: string;
  wsPort: number;
}

/**
 * T15: host, usuário e porta vêm do servidor — o front não conhece a linha.
 * Decisão daquele passo: os defaults moram **só** na função Edge, porque o front
 * sobe na hora (Vercel) e a Edge só depois do deploy; um fallback no front
 * discaria com host velho em silêncio.
 *
 * T17: o corpo saiu de `useSipClient` para lá caber o gate de microfone sem
 * estourar o orçamento de linhas do aceite T09 (`useSipClient.ts` < 120).
 */
/**
 * Trava "telefonia não configurada": a aba que vira líder da sessão de chamadas
 * provisiona o SIP sozinha a cada carregamento (`useTabLeaderRole`). Com o
 * segredo `SIP_PASSWORD` ausente no servidor, isso virava um 503 no console +
 * aviso + toast de erro em TODO carregamento e em toda troca de aba líder, para
 * todo usuário — mesmo quem nunca usa telefonia. Ao receber o 503
 * `SIP_NOT_CONFIGURED`, a resposta fica lembrada por `SIP_NOT_CONFIGURED_TTL_MS`
 * neste navegador (todas as abas): nesse intervalo não há nova chamada, nem log,
 * nem toast. Depois do prazo tenta de novo (o administrador pode ter configurado).
 */
export const SIP_NOT_CONFIGURED_STORAGE_KEY = 'zapp:sip-nao-configurado-ate';
export const SIP_NOT_CONFIGURED_TTL_MS = 30 * 60_000;

function sipSabidamenteNaoConfigurado(now: number): boolean {
  try {
    const until = Number(globalThis.localStorage?.getItem(SIP_NOT_CONFIGURED_STORAGE_KEY));
    return Number.isFinite(until) && until > now;
  } catch {
    return false; // storage bloqueado: segue o caminho normal
  }
}

function lembrarSipNaoConfigurado(now: number): void {
  try {
    globalThis.localStorage?.setItem(SIP_NOT_CONFIGURED_STORAGE_KEY, String(now + SIP_NOT_CONFIGURED_TTL_MS));
  } catch {
    /* storage bloqueado: sem memória, o comportamento é o antigo */
  }
}

export async function provisionarSip(): Promise<SipProvisioning | null> {
  if (sipSabidamenteNaoConfigurado(Date.now())) return null;
  const { data, error } = await supabase.functions.invoke('get-sip-password');
  const password = data?.password;
  const { server, user, wsPort } = data ?? {};
  if (error || !password || !server || !user || !wsPort) {
    // FunctionsHttpError.context pode ser Response (status) ou corpo já
    // parseado (code), dependendo da versão do supabase-js.
    const ctx = (error as { context?: { status?: number; code?: string } } | null)?.context;
    const isMissingSecret = error ? ctx?.status === 503 || ctx?.code === 'SIP_NOT_CONFIGURED' : !password;
    // Sem erro e sem os campos = função ainda antiga (janela entre o deploy do
    // front, imediato, e o da Edge): avisa em vez de conectar com valor velho.
    if (isMissingSecret) {
      // Só o 503 explícito do servidor trava: resposta sem erro e sem senha
      // (função antiga na janela de deploy) continua tentando a cada vez.
      if (error) lembrarSipNaoConfigurado(Date.now());
      console.warn('[sipProvisioning] SIP_PASSWORD não configurado no Supabase — segredo ausente ou nome incorreto.');
      toast.error('Senha SIP não configurada. Fale com o administrador do sistema.');
    } else if (error) {
      toast.error('Erro ao conectar ao servidor SIP. Verifique sua sessão e tente novamente.');
    } else {
      toast.error('Provisionamento SIP indisponível (função desatualizada). Tente novamente após a publicação.');
    }
    return null;
  }
  return { server, user, password, wsPort };
}
