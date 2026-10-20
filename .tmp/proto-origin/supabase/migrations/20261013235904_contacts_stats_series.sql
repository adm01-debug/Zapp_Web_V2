-- contacts_stats_series
-- Rollback: DROP FUNCTION IF EXISTS public.contacts_stats_series(boolean);
-- Rollback (SQL executável, na ordem):
--   DROP FUNCTION IF EXISTS public.contacts_stats_series(boolean);
--
-- CT-E / PB-30 (paridade V3 -> V2): série aditiva a `contacts_stats` para o
-- `useContactsKpi` parar de paginar a tabela `contacts` no navegador. A RPC de
-- contadores cobre total/e-mail/empresa/status/crescimento/duplicados, mas o
-- `aggregateKpi` também consome `empresasDistinct` e QUATRO séries que alimentam
-- as sparklines e o card "Empresas". Sem elas o card exibe NaN e as sparklines
-- somem. Esta função devolve só o que falta, com o MESMO predicado de
-- visibilidade e o MESMO escopo de `contacts_stats` (deleted_at IS NULL +
-- include_legacy + can_edit_contact(...) com os helpers resolvidos uma vez).
--
-- Contrato (jsonb, uma linha) — chaves EXATAS do hook:
--   empresas_distinct              -- count(distinct lower(btrim(company))) não vazio
--   series_novos_daily_30          -- array de 7 números; diária de 30 dias em buckets
--                                     de 4 dias, EXCETO o 7º que soma 6 (índices 24..29).
--                                     Soma dos 7 = contatos dos últimos 30 dias.
--   series_total_cumulative_12w    -- array de 12; cumulativo semanal (último = total)
--   series_empresas_cumulative_12w -- array de 12; empresas distintas acumuladas (último = empresas_distinct)
--   series_fornecedores_weekly_12  -- array de 12; contact_type='fornecedor' por semana
--
-- Semântica de janelas (idêntica ao `aggregateKpi`): "now" = now(); dia D atrás =
-- created_at com idade em [D, D+1); 12 semanas = idade em [(11-i)*7, (12-i)*7)
-- dias, das mais antigas para as mais novas (i=0 a mais antiga, i=11 a mais nova).
-- O bucket diário i do array de 7 cobre idade em [26-i*4, 30-i*4) para i=0..5 e
-- [0, 6) para i=6 — exatamente os cortes `daily30.slice`/`bucket7` do hook.
--
-- `include_legacy boolean DEFAULT false`: mesmo interruptor de `search_contacts` /
-- `contacts_count_by_type`. Parametrizar sem default criaria ambiguidade no
-- PostgREST. Entrada inválida: `COALESCE(p_include_legacy, false)` — um NULL
-- explícito viraria `NULL OR ...` = NULL e esconderia TODOS os contatos.
--
-- Escopo: SECURITY DEFINER com a MESMA trava de `contacts_stats`/`search_contacts`
-- — lista de agentes visíveis, profile e flag admin resolvidos UMA vez e passados
-- a `can_edit_contact` (parâmetros hoisted, migration 20260929810000) em vez de
-- chamar os lookups caros por linha. `auth.role() = 'service_role'` (chamador
-- interno) enxerga tudo.
--
-- ACL: funções novas ganham EXECUTE de `anon` por ALTER DEFAULT PRIVILEGES, então
-- o REVOKE é explícito em PUBLIC e anon; só authenticated e service_role executam.
--
-- Layout: `DECLARE ...; BEGIN` na mesma linha da abertura do bloco (heurística do
-- hermes-db-migrar). Sem transação explícita: uma aplicação = uma transação.

CREATE FUNCTION public.contacts_stats_series(p_include_legacy boolean DEFAULT false)
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
    SELECT c.company, c.contact_type, now() - c.created_at AS age
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND (COALESCE(p_include_legacy, false)
           OR (c.is_lid_legacy = false AND c.phone ~ '^[0-9]{10,15}$'))
      AND public.can_edit_contact(c.assigned_to, c.queue_id, v_visible, v_profile, v_admin)
  ),
  empr AS (
    SELECT count(DISTINCT lower(btrim(company)))::integer AS n
    FROM base WHERE NULLIF(btrim(company), '') IS NOT NULL
  ),
  buckets AS (
    SELECT i,
      (SELECT count(*)::integer FROM base b
        WHERE b.age >= (CASE WHEN i < 6 THEN (26 - i * 4) ELSE 0 END) * interval '1 day'
          AND b.age <  (CASE WHEN i < 6 THEN (30 - i * 4) ELSE 6 END) * interval '1 day') AS n
    FROM generate_series(0, 6) i
  ),
  total_cum AS (
    SELECT i,
      (SELECT count(*)::integer FROM base b
        WHERE b.age >= (11 - i) * 7 * interval '1 day') AS n
    FROM generate_series(0, 11) i
  ),
  emp_cum AS (
    SELECT i,
      (SELECT count(DISTINCT lower(btrim(b.company)))::integer FROM base b
        WHERE b.age >= (11 - i) * 7 * interval '1 day'
          AND NULLIF(btrim(b.company), '') IS NOT NULL) AS n
    FROM generate_series(0, 11) i
  ),
  forn_cum AS (
    SELECT i,
      (SELECT count(*)::integer FROM base b
        WHERE b.contact_type = 'fornecedor'
          AND b.age >= (11 - i) * 7 * interval '1 day'
          AND b.age <  (12 - i) * 7 * interval '1 day') AS n
    FROM generate_series(0, 11) i
  )
  SELECT jsonb_build_object(
    'empresas_distinct',              empr.n,
    'series_novos_daily_30',          (SELECT jsonb_agg(b.n ORDER BY b.i) FROM buckets b),
    'series_total_cumulative_12w',    (SELECT jsonb_agg(t.n ORDER BY t.i) FROM total_cum t),
    'series_empresas_cumulative_12w', (SELECT jsonb_agg(e.n ORDER BY e.i) FROM emp_cum e),
    'series_fornecedores_weekly_12',  (SELECT jsonb_agg(f.n ORDER BY f.i) FROM forn_cum f)
  )
  INTO v_out
  FROM empr;

  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION public.contacts_stats_series(boolean) IS
  'Séries e empresas distintas de Contatos (CT-E/PB-30) para o useContactsKpi: empresas_distinct + as 4 séries (novos 30d em buckets de 4/6 dias, total cumulativo 12s, empresas cumulativas 12s, fornecedores por semana). Mesmo escopo de contacts_stats/search_contacts.';

REVOKE ALL ON FUNCTION public.contacts_stats_series(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contacts_stats_series(boolean) TO authenticated, service_role;
