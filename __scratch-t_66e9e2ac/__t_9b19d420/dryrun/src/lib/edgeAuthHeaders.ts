import { supabase, SUPABASE_ANON_KEY } from '@/integrations/supabase/client';

/**
 * Headers para fetch direto em Edge Function que roda requireAuth: o bearer e o
 * token da sessao do usuario. A anon key so entra como fallback (sem sessao a
 * edge responde 401, que e o comportamento esperado).
 */
export async function edgeAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
  };
}
