import { supabase } from '@/integrations/supabase/client';

/**
 * Marca um alerta de segurança como resolvido no servidor.
 *
 * Devolve o erro do `update` de propósito: quem chama só pode esconder o card
 * DEPOIS do sucesso. Se a RLS recusar (a política é de admin) ou a rede cair,
 * o alerta continua aberto no banco e precisa voltar à tela em vez de sumir
 * só para quem clicou.
 *
 * `resolved_by` guarda o id da sessão (mesmo id de perfil usado em `user_id`),
 * para o admin que resolveu ficar registrado — a coluna já existe.
 */
export async function resolveSecurityAlert(alertId: string) {
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('security_alerts')
    .update({
      is_resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id ?? null,
    })
    .eq('id', alertId);

  return { error };
}

/**
 * Conta no servidor os alertas não resolvidos. Não depende da lista de 5
 * carregada pela tela, então alerta antigo fora da janela não desaparece do
 * contador.
 *
 * `userId` escopa a contagem à conta do dono (mesmo filtro da lista da tela);
 * sem ele, vale o que a RLS permitir ver.
 */
export async function countUnresolvedSecurityAlerts(userId: string | null) {
  const query = () =>
    supabase
      .from('security_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('is_resolved', false);

  const { count, error } = userId
    ? await query().eq('user_id', userId)
    : await query();

  return { count: count ?? 0, error };
}
