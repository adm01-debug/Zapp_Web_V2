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
export async function provisionarSip(): Promise<SipProvisioning | null> {
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
    toast.error(isMissingSecret ? 'Senha SIP não configurada. Adicione o segredo SIP_PASSWORD no Supabase.' : error ? 'Erro ao conectar ao servidor SIP. Verifique sua sessão e tente novamente.' : 'Provisionamento SIP indisponível (função desatualizada). Tente novamente após a publicação.');
    return null;
  }
  return { server, user, password, wsPort };
}
