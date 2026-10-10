-- talkx_contact_attributes_rls (X037 · N-094 refazer 1)
-- Rollback: drop function public.talkx_refresh_local_attributes(integer); drop table public.talkx_contact_attributes; drop function public.can_manage_contacts(uuid); drop table public.talkx_ddd_regions;
--
-- Projeção talkx_contact_attributes com RLS e atributos de fonte local (plano
-- docs/talkx/v4/etapas/F04-dados-comerciais-e-vinculo-com-o-crm.md, X037).
-- Corrige o refazer anterior: a função de refresh era inalcançável (grant só
-- para service_role mas com trava interna de admin que reprova uid NULL), fazia
-- loop linha a linha com WHERE ambíguo, resolvia vendedor via JOIN interno
-- (contato sem vendedor ficava fora) e referenciava talkx_ddd_regions e
-- get_ddd_from_phone, que não existiam. Aqui: tabela DDD criada e populada
-- (67 DDDs, portada de src/components/contacts/getRegionFromPhone.ts, origem
-- 'ddd'), refresh em UPSERT ÚNICO com ON CONFLICT, vendedor resolvido do lado
-- do banco (assigned_to -> profiles, LEFT JOIN: sem vendedor mantém a linha
-- com região), funil pelo deal mais recente (determinístico) e última mensagem
-- só de sender='contact'. Ramo gestor da leitura num helper dedicado
-- (can_manage_contacts) + policy; vendedor isolado via
-- is_contact_visible_to_user; anon sem grant; authenticated sem escrita.
--
-- Rollback (completo — nada disto pré-existia; grants morrem com os objetos):
--   drop function if exists public.talkx_refresh_local_attributes(integer);
--   drop table if exists public.talkx_contact_attributes; (a policy morre com a tabela)
--   drop function if exists public.can_manage_contacts(uuid);
--   drop table if exists public.talkx_ddd_regions;
--
-- Sem BEGIN/COMMIT: a migration aplica numa única transação; qualquer erro desfaz tudo.

-- 1. DDD -> UF/região (X037: "tabela talkx_ddd_regions, portada de getRegionFromPhone.ts").
CREATE TABLE IF NOT EXISTS public.talkx_ddd_regions (
  ddd smallint PRIMARY KEY,
  state char(2) NOT NULL,
  region text NOT NULL
);

INSERT INTO public.talkx_ddd_regions (ddd, state, region) VALUES
  (11,'SP','Sudeste'),(12,'SP','Sudeste'),(13,'SP','Sudeste'),(14,'SP','Sudeste'),
  (15,'SP','Sudeste'),(16,'SP','Sudeste'),(17,'SP','Sudeste'),(18,'SP','Sudeste'),
  (19,'SP','Sudeste'),(21,'RJ','Sudeste'),(22,'RJ','Sudeste'),(24,'RJ','Sudeste'),
  (27,'ES','Sudeste'),(28,'ES','Sudeste'),(31,'MG','Sudeste'),(32,'MG','Sudeste'),
  (33,'MG','Sudeste'),(34,'MG','Sudeste'),(35,'MG','Sudeste'),(37,'MG','Sudeste'),
  (38,'MG','Sudeste'),(41,'PR','Sul'),(42,'PR','Sul'),(43,'PR','Sul'),
  (44,'PR','Sul'),(45,'PR','Sul'),(46,'PR','Sul'),(47,'SC','Sul'),
  (48,'SC','Sul'),(49,'SC','Sul'),(51,'RS','Sul'),(53,'RS','Sul'),
  (54,'RS','Sul'),(55,'RS','Sul'),(61,'DF','Centro-Oeste'),(62,'GO','Centro-Oeste'),
  (63,'TO','Norte'),(64,'GO','Centro-Oeste'),(65,'MT','Centro-Oeste'),
  (66,'MT','Centro-Oeste'),(67,'MS','Centro-Oeste'),(68,'AC','Norte'),
  (69,'RO','Norte'),(71,'BA','Nordeste'),(73,'BA','Nordeste'),(74,'BA','Nordeste'),
  (75,'BA','Nordeste'),(77,'BA','Nordeste'),(79,'SE','Nordeste'),(81,'PE','Nordeste'),
  (82,'AL','Nordeste'),(83,'PB','Nordeste'),(84,'RN','Nordeste'),(85,'CE','Nordeste'),
  (86,'PI','Nordeste'),(87,'PE','Nordeste'),(88,'CE','Nordeste'),(89,'PI','Nordeste'),
  (91,'PA','Norte'),(92,'AM','Norte'),(93,'PA','Norte'),(94,'PA','Norte'),
  (95,'RR','Norte'),(96,'AP','Norte'),(97,'AM','Norte'),(98,'MA','Nordeste'),
  (99,'MA','Nordeste')
ON CONFLICT (ddd) DO NOTHING;

REVOKE ALL ON TABLE public.talkx_ddd_regions FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.talkx_ddd_regions TO authenticated, service_role;

-- 2. Projeção (colunas do plano X037).
CREATE TABLE IF NOT EXISTS public.talkx_contact_attributes (
  contact_id uuid PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  salesperson_name text,
  salesperson_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  state text,
  region text,
  funnel_stage text,
  last_message_at timestamptz,
  company_name text,
  segment text,
  purchases_total numeric(12,2) NOT NULL DEFAULT 0,
  purchases_count integer NOT NULL DEFAULT 0,
  avg_ticket numeric(12,2) NOT NULL DEFAULT 0,
  last_purchase_at timestamptz,
  rfm_recency_days integer,
  rfm_frequency integer,
  rfm_monetary numeric(12,2),
  sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  crm_synced_at timestamptz,
  purchases_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.talkx_contact_attributes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.talkx_contact_attributes FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.talkx_contact_attributes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.talkx_contact_attributes TO service_role;

-- 3. Helper dedicado do ramo gestor (dono da conta opera com papel admin;
-- sem coluna nova em profiles: quando o produto definir ownership, entra aqui
-- sem tocar nas policies).
CREATE OR REPLACE FUNCTION public.can_manage_contacts(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin_or_supervisor(p_user_id)
$$;

REVOKE ALL ON FUNCTION public.can_manage_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_contacts(uuid) TO authenticated, service_role;

-- Leitura: gestor (helper dedicado) OU vendedor com visibilidade no contato.
DROP POLICY IF EXISTS talkx_contact_attributes_select ON public.talkx_contact_attributes;
CREATE POLICY talkx_contact_attributes_select
  ON public.talkx_contact_attributes
  FOR SELECT
  TO authenticated
  USING (
    public.can_manage_contacts(auth.uid())
    OR public.is_contact_visible_to_user(contact_id, auth.uid())
  );

-- 4. Refresh dos atributos locais em UPSERT ÚNICO (sem loop).
-- Elegibilidade (duas condições com AND, sem OR): contato não apagado
-- (deleted_at IS NULL) e não legado (is_lid_legacy = false, mesmo critério de
-- "contato visível" de search_contacts). Telefone ausente/inválido só zera
-- UF/região, sem excluir a linha (vendedor/funil independem do DDD).
-- DO UPDATE sem WHERE de guarda: as colunas locais (vendedor, UF/região,
-- funil, última mensagem) são disjuntas das colunas do CRM/compras (X038/X040),
-- então reprocessar nunca destrói dado de outra fonte.
CREATE OR REPLACE FUNCTION public.talkx_refresh_local_attributes(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$ DECLARE v_processed integer := 0; BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'p_limit deve ser >= 1' USING ERRCODE = '2201W';
  END IF;

  WITH page AS (
    SELECT
      c.id,
      c.assigned_to,
      regexp_replace(c.phone, '\D', '', 'g') AS digits
    FROM public.contacts c
    WHERE c.deleted_at IS NULL
      AND c.is_lid_legacy = false
    ORDER BY c.id
    LIMIT p_limit
  ),
  ddd AS (
    SELECT
      id,
      assigned_to,
      CASE
        WHEN digits LIKE '55%' AND length(digits) >= 12
          THEN substring(digits from 3 for 2)::smallint
        WHEN length(digits) >= 10
          THEN substring(digits from 1 for 2)::smallint
        ELSE NULL
      END AS ddd_code
    FROM page
  )
  INSERT INTO public.talkx_contact_attributes (
    contact_id, salesperson_name, salesperson_profile_id,
    state, region, funnel_stage, last_message_at, sources, updated_at
  )
  SELECT
    d.id,
    p.name,
    p.id,
    r.state::text,
    r.region,
    s.name,
    lm.last_message_at,
    '{"vendedor":"local","state":"ddd","region":"ddd","funnel_stage":"local","last_message_at":"local"}'::jsonb,
    now()
  FROM ddd d
  LEFT JOIN public.profiles p ON p.id = d.assigned_to
  LEFT JOIN public.talkx_ddd_regions r ON r.ddd = d.ddd_code
  LEFT JOIN LATERAL (
    SELECT st.name
    FROM public.sales_deals sd
    JOIN public.sales_pipeline_stages st ON st.id = sd.stage_id
    WHERE sd.contact_id = d.id
    ORDER BY sd.updated_at DESC, sd.id DESC
    LIMIT 1
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT max(m.created_at) AS last_message_at
    FROM public.messages m
    WHERE m.contact_id = d.id
      AND m.sender = 'contact'
  ) lm ON true
  ON CONFLICT (contact_id) DO UPDATE SET
    salesperson_name = EXCLUDED.salesperson_name,
    salesperson_profile_id = EXCLUDED.salesperson_profile_id,
    state = EXCLUDED.state,
    region = EXCLUDED.region,
    funnel_stage = EXCLUDED.funnel_stage,
    last_message_at = EXCLUDED.last_message_at,
    sources = EXCLUDED.sources,
    updated_at = EXCLUDED.updated_at;

  GET DIAGNOSTICS v_processed = ROW_COUNT;
  RETURN v_processed;
END; $fn$;

REVOKE ALL ON FUNCTION public.talkx_refresh_local_attributes(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_refresh_local_attributes(integer) TO service_role;
