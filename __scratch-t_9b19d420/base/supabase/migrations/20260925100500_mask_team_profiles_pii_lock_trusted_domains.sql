-- Auditoria adversarial desta sessão (Próximos passos, item 1): 2 gaps de PII/
-- privilégio que a #654 não cobriu (ela tratou get_last_message_dates,
-- set_conversation_status, get_own_lockout_status).
--
-- 1) get_team_profiles() -- EM USO ATIVO (src/hooks/crm/useTeamProfiles.ts,
--    consumida por TasksTab/TasksView/TalkXView para dropdown de "atribuir a").
--    SECURITY DEFINER, GRANT EXECUTE para authenticated, zero checagem de
--    role: qualquer agente logado lia email/telefone pessoal de TODA a
--    equipe. O uso legítimo (escolher para quem atribuir tarefa/conversa) só
--    precisa de nome/avatar/cargo/departamento — não de email/telefone.
--    Fix: mascara email/phone para NULL quando o caller não é admin
--    (is_admin(auth.uid())). Contrato para admin fica idêntico; para os
--    demais, os dois campos passam a vir NULL em vez do dado real.
CREATE OR REPLACE FUNCTION public.get_team_profiles()
RETURNS TABLE(id uuid, user_id uuid, name text, email text, avatar_url text, role text, is_active boolean, department text, job_title text, phone text, max_chats integer, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Filtra apenas agentes ativos: inativos nao devem aparecer em listas de equipe.
  -- Email/telefone só voltam para quem é admin; demais authenticated recebem NULL.
  SELECT
    p.id, p.user_id, p.name,
    CASE WHEN public.is_admin(auth.uid()) THEN p.email ELSE NULL END AS email,
    p.avatar_url, p.role,
    p.is_active, p.department, p.job_title,
    CASE WHEN public.is_admin(auth.uid()) THEN p.phone ELSE NULL END AS phone,
    p.max_chats, p.created_at
  FROM public.profiles p
  WHERE p.is_active = true;
$function$;

-- 2) handle_new_user_role(): com app.settings.trusted_domains NULL (estado
--    atual em produção), o catch-all "permite todos (backward compat)" faz
--    QUALQUER domínio de email -- incluindo login via Google com conta
--    pessoal -- ganhar a role 'agent' automaticamente no signup, sem revisão
--    humana. Trava para o domínio da empresa. Não é destrutivo: só afeta
--    auto-provisionamento de NOVOS signups; quem já tem role continua com
--    ela, e um admin pode conceder role manualmente a qualquer momento para
--    contas de domínio diferente (parceiro, freelancer etc.).
ALTER DATABASE postgres SET app.settings.trusted_domains = 'promobrindes.com.br';
