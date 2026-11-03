-- 20261103201500_remove_pagamentos_e_special_agent
-- Decisao do dono em 2026-11-03 (docs/contexto/regras/manual/regras.md, §2 e §8): o modulo de
-- pagamentos/compras saiu do front na #2690 e o papel `special_agent` deixa de existir como
-- conceito de produto (todo agente pode receber grants de visibilidade — front #2692).
-- Versao reservada via supabase_migrations.reserve_migration_version (2026-11-03).
--
-- Estado medido em producao (tnnnlkbymytvtqngbbqh, 2026-11-03, SELECT via MCP):
--   * public.contact_purchases e public.payment_links: 0 linhas; nenhuma FK aponta PARA elas.
--     Triggers: update_payment_links_updated_at, update_contact_purchases_updated_at,
--     guard_contact_purchase_identity_insert/update (caem com o DROP TABLE ... CASCADE).
--     payment_links esta na publicacao supabase_realtime (sai sozinha no DROP).
--   * Funcoes que citam as tabelas e nao tem chamador (0 em cron.job, 0 no front, 0 nas edges,
--     0 em outras funcoes): talkx_attribute_purchases(timestamptz) e
--     talkx_recompute_purchase_metrics(integer) -> DROP.
--   * guard_contact_purchase_identity(): funcao de trigger usada SO pelos dois triggers de
--     contact_purchases (nenhuma outra funcao a cita) -> DROP depois da tabela.
--   * special_agent: 0 linhas em user_roles e 0 em profiles com esse papel.
--   * agent_visibility_grants: 0 linhas em producao (2026-11-03 20:27Z) — nenhum grant antigo passa
--     a valer para 'agent' com a troca em get_visible_agent_ids.
--
-- O que muda (corpo-base = pg_get_functiondef em producao, 2026-11-03):
--   (a) effective_role(uuid)              md5 base c9e9842e86cefd715be8a3545d06b726 — remove o ramo
--       WHEN bool_or(role = 'special_agent') (cai em 'agent').
--   (b) sync_profile_role_from_user_roles() md5 base d9150a6a5887680d6eaf3deab343ee18 — idem.
--   (c) get_visible_agent_ids(uuid)       md5 base 6470a82c30de88980935fe58ff2ff082 — os
--       agent_visibility_grants passam a valer para role = 'agent' (antes: 'special_agent').
--   (d) policy "Special agents can view own grants" (agent_visibility_grants) ->
--       "Agents can view own grants", mesmo corpo com has_role(auth.uid(), 'agent').
--   (e) CHECK profiles_role_check: lista sem 'special_agent'.
--
-- RESIDUO DELIBERADO: o rotulo 'special_agent' do enum public.app_role FICA. Postgres nao remove
-- valor de enum; recriar o tipo nas 3 colunas que o usam nao compensa com 0 usuarios. Nenhuma
-- funcao, policy ou CHECK passa a aceitar/produzir esse valor depois desta migration.
--
-- Rollback (ordem inversa; as tabelas tinham 0 linhas, nada a restaurar de dado):
--   ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_no_special_agent;
--   ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
--   ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
--     CHECK (role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'agent'::text, 'special_agent'::text]));
--   DROP POLICY "Agents can view own grants" ON public.agent_visibility_grants;
--   CREATE POLICY "Special agents can view own grants" ON public.agent_visibility_grants
--     FOR SELECT TO authenticated USING (has_role(auth.uid(), 'special_agent'::app_role)
--       AND agent_id IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()));
--   reaplicar 20260909200000 (get_visible_agent_ids) e 20260830070000 (effective_role + sync);
--   reaplicar 20260409222809 + 20261015190000 (contact_purchases/payment_links + RLS + triggers),
--   20261009031958 (talkx_attribute_purchases) e 20261009032406 (talkx_recompute_purchase_metrics).

-- 1. Funcoes mortas que leem as tabelas (ninguem chama).
DROP FUNCTION IF EXISTS public.talkx_attribute_purchases(timestamp with time zone);
DROP FUNCTION IF EXISTS public.talkx_recompute_purchase_metrics(integer);

-- 2. Tabelas do modulo de pagamentos (CASCADE: policies, triggers, indices, publicacao).
--    Policies derrubadas explicitamente antes do DROP TABLE para o guard de paridade
--    (src/lib/__tests__/rlsSchemaGuard.test.ts) enxergar a mudanca como "em transito".
DROP POLICY IF EXISTS "Agents can delete purchases for assigned contacts" ON public.contact_purchases;
DROP POLICY IF EXISTS "Agents can insert purchases for assigned contacts" ON public.contact_purchases;
DROP POLICY IF EXISTS "Agents can update purchases for assigned contacts" ON public.contact_purchases;
DROP POLICY IF EXISTS "Agents can view purchases for assigned contacts" ON public.contact_purchases;
DROP POLICY IF EXISTS "Admins can delete payment links" ON public.payment_links;
DROP POLICY IF EXISTS "Authenticated can insert payment links" ON public.payment_links;
DROP POLICY IF EXISTS "Users can update own payment links" ON public.payment_links;
DROP POLICY IF EXISTS "Users can view own payment links" ON public.payment_links;
DROP TABLE IF EXISTS public.contact_purchases CASCADE;
DROP TABLE IF EXISTS public.payment_links CASCADE;

-- 3. Funcao de trigger que so existia para contact_purchases.
DROP FUNCTION IF EXISTS public.guard_contact_purchase_identity();

-- 4. (a) effective_role sem o ramo special_agent.
CREATE OR REPLACE FUNCTION public.effective_role(_user_id uuid)
 RETURNS app_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN bool_or(role = 'admin'::app_role)         THEN 'admin'::app_role
    WHEN bool_or(role = 'supervisor'::app_role)    THEN 'supervisor'::app_role
    ELSE 'agent'::app_role
  END
  FROM public.user_roles
  WHERE user_id = _user_id
$function$;

-- 5. (b) sync_profile_role_from_user_roles sem o ramo special_agent.
CREATE OR REPLACE FUNCTION public.sync_profile_role_from_user_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id  uuid;
  v_new_role app_role;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT CASE
    WHEN bool_or(role = 'admin'::app_role)         THEN 'admin'::app_role
    WHEN bool_or(role = 'supervisor'::app_role)    THEN 'supervisor'::app_role
    ELSE 'agent'::app_role
  END
  INTO v_new_role
  FROM public.user_roles
  WHERE user_id = v_user_id;

  IF v_new_role IS NOT NULL THEN
    -- Sinaliza operação interna para prevent_privilege_escalation
    PERFORM set_config('app.internal_role_sync', 'true', true);

    UPDATE public.profiles
    SET role = v_new_role::text
    WHERE user_id = v_user_id
      AND role IS DISTINCT FROM v_new_role::text;

    -- Reset flag (set_config com local=true já reseta no fim da transação,
    -- mas reset explícito é mais claro e seguro em casos de nested txn)
    PERFORM set_config('app.internal_role_sync', 'false', true);
  END IF;

  RETURN NULL;
END;
$function$;

-- 6. (c) get_visible_agent_ids: grants valem para 'agent'. ACL reafirmada igual a 20260909200000.
CREATE OR REPLACE FUNCTION public.get_visible_agent_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT profile.id
  FROM public.profiles AS profile
  WHERE _user_id = auth.uid()
    AND profile.user_id = _user_id
  UNION
  SELECT visibility.can_see_agent_id
  FROM public.agent_visibility_grants AS visibility
  JOIN public.profiles AS viewer ON viewer.id = visibility.agent_id
  WHERE _user_id = auth.uid()
    AND viewer.user_id = _user_id
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS role_assignment
      WHERE role_assignment.user_id = _user_id
        AND role_assignment.role = 'agent'
    );
$function$;

REVOKE ALL ON FUNCTION public.get_visible_agent_ids(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_visible_agent_ids(uuid)
  TO authenticated, service_role;

-- 7. (d) policy de leitura dos proprios grants: agente comum.
DROP POLICY IF EXISTS "Special agents can view own grants" ON public.agent_visibility_grants;
DROP POLICY IF EXISTS "Agents can view own grants" ON public.agent_visibility_grants;
CREATE POLICY "Agents can view own grants"
  ON public.agent_visibility_grants
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'agent'::app_role)
    AND agent_id IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid())
  );

-- 8. (e) CHECK de profiles.role sem special_agent (0 linhas com esse valor em producao).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'agent'::text]));

-- 9. (f) user_roles: o rotulo 'special_agent' continua no enum (nao recriado), entao o banco
--    ainda aceitaria o valor por INSERT direto; o front/edges (#2692) ja nao o oferecem. O CHECK
--    fecha a porta sem recriar o tipo. 0 linhas com esse valor em producao (2026-11-03).
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_no_special_agent;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_no_special_agent
  CHECK (role <> 'special_agent'::app_role);
