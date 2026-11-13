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
 * nem toast. Depois do prazo tenta de novo (o administrador pode ter configurado); um
 * pedido explícito do usuário (`ignorarTrava`) tenta na hora.
 */
export const SIP_NOT_CONFIGURED_STORAGE_KEY = 'zapp:sip-nao-configurado-ate';
export const SIP_NOT_CONFIGURED_TTL_MS = 30 * 60_000;

/**
 * Lê a trava. Valor fora de `(now, now + TTL]` é descartado e apagado: um `até`
 * absurdo (relógio adiantado ao gravar e corrigido depois, edição manual)
 * nunca pode travar a telefonia por mais que o prazo.
 */
function sipSabidamenteNaoConfigurado(now: number): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(SIP_NOT_CONFIGURED_STORAGE_KEY);
    if (raw == null) return false;
    const until = Number(raw);
    if (Number.isFinite(until) && until > now && until - now <= SIP_NOT_CONFIGURED_TTL_MS) return true;
    esquecerSipNaoConfigurado();
    return false;
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

function esquecerSipNaoConfigurado(): void {
  try {
    globalThis.localStorage?.removeItem(SIP_NOT_CONFIGURED_STORAGE_KEY);
  } catch {
    /* storage bloqueado: nada a esquecer */
  }
}

type ErrorContext = { status?: number; code?: unknown; clone?: () => { json?: () => Promise<unknown> } };

/**
 * `code` do corpo da resposta de erro. `FunctionsHttpError.context` é a
 * `Response` (corpo lido de um clone) ou, em versões antigas/dublês, o corpo já
 * parseado. Nunca lança: sem corpo JSON = sem código.
 */
async function codigoDoErro(ctx: ErrorContext | undefined): Promise<string | undefined> {
  if (typeof ctx?.code === 'string') return ctx.code;
  try {
    const body = await ctx?.clone?.()?.json?.();
    const code = body && typeof body === 'object' ? (body as { code?: unknown }).code : undefined;
    return typeof code === 'string' ? code : undefined;
  } catch {
    return undefined;
  }
}

export interface ProvisionarSipOptions {
  /**
   * Pedido EXPLÍCITO do usuário (reconectar): ignora a trava, para que a
   * telefonia volte assim que o administrador configurar o segredo, sem esperar
   * o prazo. O provisionamento automático da aba líder respeita a trava.
   */
  ignorarTrava?: boolean;
}

export async function provisionarSip(options: ProvisionarSipOptions = {}): Promise<SipProvisioning | null> {
  if (!options.ignorarTrava && sipSabidamenteNaoConfigurado(Date.now())) return null;
  const { data, error } = await supabase.functions.invoke('get-sip-password');
  const password = data?.password;
  const { server, user, wsPort } = data ?? {};
  if (error || !password || !server || !user || !wsPort) {
    const ctx = (error as { context?: ErrorContext } | null)?.context;
    const code = error ? await codigoDoErro(ctx) : undefined;
    // Só o `SIP_NOT_CONFIGURED` explícito do servidor trava. Outro 503 (ex.:
    // `BOOT_ERROR` da Edge logo após um deploy) é passageiro: travar ali
    // deixaria a telefonia muda por 30 min sem motivo.
    const naoConfigurado = code === 'SIP_NOT_CONFIGURED';
    // Sem erro e sem os campos = função ainda antiga (janela entre o deploy do
    // front, imediato, e o da Edge): avisa em vez de conectar com valor velho.
    const isMissingSecret = error ? naoConfigurado || (ctx?.status === 503 && code === undefined) : !password;
    if (naoConfigurado) lembrarSipNaoConfigurado(Date.now());
    if (isMissingSecret) {
      console.warn('[sipProvisioning] SIP_PASSWORD não configurado no Supabase — segredo ausente ou nome incorreto.');
      toast.error('Senha SIP não configurada. Fale com o administrador do sistema.');
    } else if (error) {
      toast.error('Erro ao conectar ao servidor SIP. Verifique sua sessão e tente novamente.');
    } else {
      toast.error('Provisionamento SIP indisponível (função desatualizada). Tente novamente após a publicação.');
    }
    return null;
  }
  esquecerSipNaoConfigurado();
  return { server, user, password, wsPort };
}
