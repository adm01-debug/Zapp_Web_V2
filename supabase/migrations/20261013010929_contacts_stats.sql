-- contacts_stats
-- Rollback: DROP FUNCTION IF EXISTS public.contacts_stats(boolean);
-- Rollback (SQL executável, na ordem):
--   DROP FUNCTION IF EXISTS public.contacts_stats(boolean);
--
-- CT-E / PB-30 (paridade V3 -> V2): indicadores agregados de Contatos calculados no
-- servidor. Hoje `useContactsKpi.ts` pagina a tabela `contacts` inteira no navegador
-- (1000 linhas por requisição, o loop em `fetchKpiRows`) só para somar; em qualquer
-- base grande isso é uma varredura completa a cada montagem da tela. Esta RPC devolve
-- os mesmos contadores em UMA chamada, com o MESMO predicado de visibilidade de
-- `search_contacts` (20260930450000) e de `contacts_count_by_type`, para o número
-- bater com o que a aba mostra.
--
-- Contrato (jsonb, uma linha):
--   total                -- contatos visíveis (deleted_at IS NULL + visibilidade)
--   with_email           -- com e-mail não vazio
--   with_company         -- com empresa não vazia
--   by_status            -- { conversation_status: quantidade } dos visíveis
--   recent_30d           -- criados nos últimos 30 dias (numerador do crescimento)
--   base_30d             -- criados há mais de 30 dias (base do crescimento)
--   growth_30d_pct       -- crescimento 30 d em %; NULL quando base_30d < 50 (piso de amostra)
--   duplicate_candidates -- contatos que compartilham telefone normalizado (só dígitos)
--                           ou e-mail normalizado (lower+trim) com outro visível
--   lgpd_pending         -- NULL enquanto LG1 (fila de exclusão LGPD) não existir
--
-- `include_legacy boolean DEFAULT false`: mesmo interruptor de `search_contacts` /
-- `contacts_count_by_type`. Parametrizar sem default criaria ambiguidade no PostgREST.
-- Entrada inválida: `COALESCE(p_include_legacy, false)` — um NULL explícito seria
-- `NULL OR ...` = NULL e esconderia TODOS os contatos (devolveria zero), então o NULL
-- cai no comportamento padrão em vez de virar um filtro que ninguém pediu.
--
-- Escopo: SECURITY DEFINER com a MESMA trava de `search_contacts` — a lista de agentes
-- visíveis, o profile e o flag admin são resolvidos UMA vez e passados a
-- `can_edit_contact` (que os recebe por parâmetro, migration 20260929810000), em vez de
-- chamar os lookups caros por linha. `auth.role() = 'service_role'` (chamador interno)
-- enxerga tudo, que é o comportamento de quem ignora RLS.
--
-- ACL: funções novas ganham EXECUTE de `anon` por ALTER DEFAULT PRIVILEGES, então o
-- REVOKE é explícito em PUBLIC e anon; só authenticated e service_role executam.
--
-- Layout: `DECLARE ...; BEGIN` na mesma linha da abertura do bloco (heurística do
-- hermes-db-migrar que barra BEGIN no início de linha). Sem transação explícita: uma
-- aplicação = uma transação (a falha não deixa rastro).

CREATE FUNCTION public.contacts_stats(p_include_legacy boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE
  v_visible uuid[];
  v_profile uuid;
  v_admin boolean;
  v_out jsonb;
BEGIN
  v_admin := COALESCE(auth.role() = 'service_role', false)
             OR public.is_admin_or_supervisor(auth.uid());
  v_visible := (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v);
  v_profile := (SELECT public.get_profile_id_for_user(auth.uid()));

  WITH base AS (
    SELECT c.id, c.phone, c.email, c.company, c.conversation_status, c.created_at
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (COALESCE(p_include_legacy, false)
           OR (c.is_lid_legacy = false AND c.phone ~ '^[0-9]{10,15}$'))
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_visible, v_profile, v_admin)
  ),
  norm AS (
    SELECT NULLIF(regexp_replace(base.phone, '\D', '', 'g'), '') AS phone_key,
           NULLIF(lower(btrim(base.email)), '') AS email_key
    FROM base
  ),
  dup_phone AS (
    SELECT phone_key FROM norm WHERE phone_key IS NOT NULL
    GROUP BY phone_key HAVING count(*) > 1
  ),
  dup_email AS (
    SELECT email_key FROM norm WHERE email_key IS NOT NULL
    GROUP BY email_key HAVING count(*) > 1
  ),
  agg AS (
    SELECT
      count(*)::integer AS total,
      count(*) FILTER (WHERE NULLIF(btrim(base.email), '') IS NOT NULL)::integer AS with_email,
      count(*) FILTER (WHERE NULLIF(btrim(base.company), '') IS NOT NULL)::integer AS with_company,
      count(*) FILTER (WHERE base.created_at >= now() - interval '30 days')::integer AS recent_30d,
      count(*) FILTER (WHERE base.created_at <  now() - interval '30 days')::integer AS base_30d
    FROM base
  ),
  statuses AS (
    SELECT COALESCE(jsonb_object_agg(s.conversation_status, s.n), '{}'::jsonb) AS j
    FROM (
      SELECT base.conversation_status, count(*)::integer AS n
      FROM base GROUP BY base.conversation_status
    ) s
  ),
  dups AS (
    SELECT count(*)::integer AS n
    FROM norm
    WHERE (norm.phone_key IS NOT NULL AND norm.phone_key IN (SELECT phone_key FROM dup_phone))
       OR (norm.email_key IS NOT NULL AND norm.email_key IN (SELECT email_key FROM dup_email))
  )
  SELECT jsonb_build_object(
    'total',                agg.total,
    'with_email',           agg.with_email,
    'with_company',         agg.with_company,
    'by_status',            statuses.j,
    'recent_30d',           agg.recent_30d,
    'base_30d',             agg.base_30d,
    'growth_30d_pct',       CASE WHEN agg.base_30d < 50 THEN NULL
                                 ELSE round(((agg.recent_30d - agg.base_30d)::numeric
                                             / agg.base_30d) * 100)::integer END,
    'duplicate_candidates', dups.n,
    'lgpd_pending',         NULL
  )
  INTO v_out
  FROM agg, statuses, dups;

  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION public.contacts_stats(boolean) IS
  'Indicadores agregados de Contatos (CT-E/PB-30): total, com e-mail/empresa, por status, crescimento 30d com piso de amostra, candidatos a duplicado e lgpd_pending. Escopo igual ao de search_contacts.';

REVOKE ALL ON FUNCTION public.contacts_stats(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contacts_stats(boolean) TO authenticated, service_role;
