-- talkx_contact_attributes_rls (X037 · N-094 refazer 2)
-- Rollback: DROP FUNCTION IF EXISTS public.talkx_refresh_local_attributes(integer, uuid); DROP TABLE IF EXISTS public.talkx_contact_attributes; DROP FUNCTION IF EXISTS public.can_manage_contacts(uuid); DROP TABLE IF EXISTS public.talkx_ddd_regions;
-- Rollback (SQL executável, na ordem; policies morrem com as tabelas):
--   DROP FUNCTION IF EXISTS public.talkx_refresh_local_attributes(integer, uuid);
--   DROP TABLE IF EXISTS public.talkx_contact_attributes;
--   DROP FUNCTION IF EXISTS public.can_manage_contacts(uuid);
--   DROP TABLE IF EXISTS public.talkx_ddd_regions;
--
-- Projeção com RLS e fonte local (X037).
-- Refazer 2: cursor p_after, RLS no DDD. Nada disto pré-existia. Sem BEGIN/COMMIT.

-- 1. DDD -> UF/região (só leitura p/ authenticated).
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

ALTER TABLE public.talkx_ddd_regions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.talkx_ddd_regions FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.talkx_ddd_regions TO authenticated, service_role;
DROP POLICY IF EXISTS talkx_ddd_regions_select ON public.talkx_ddd_regions;
CREATE POLICY talkx_ddd_regions_select
  ON public.talkx_ddd_regions
  FOR SELECT
  TO authenticated, service_role
  USING (true);

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

-- 3. Helper do ramo gestor (dono opera com papel admin; sem coluna nova em
-- profiles: quando o produto definir ownership, entra aqui sem tocar nas policies).
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

-- 4. Refresh dos atributos locais: página (ORDER BY id LIMIT p_limit) a partir de
-- p_after; o chamador repete com o last_id até processed = 0. Elegível (AND): não
-- apagado (deleted_at IS NULL) e não legado (is_lid_legacy = false). Telefone
-- inválido só zera UF/região. DO UPDATE sem guarda: colunas locais são disjuntas
-- das do CRM/compras (X038/X040).
CREATE OR REPLACE FUNCTION public.talkx_refresh_local_attributes(p_limit integer DEFAULT 500, p_after uuid DEFAULT NULL)
RETURNS TABLE (processed integer, last_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$ DECLARE v_processed integer := 0; v_last uuid := NULL; BEGIN
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
      AND (p_after IS NULL OR c.id > p_after)
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
  ),
  ins AS (
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
      updated_at = EXCLUDED.updated_at
    RETURNING contact_id
  )
  SELECT count(*), (SELECT i.contact_id FROM ins i ORDER BY i.contact_id DESC LIMIT 1) INTO v_processed, v_last FROM ins;
  processed := v_processed;
  last_id := v_last;
  RETURN NEXT;
END; $fn$;

REVOKE ALL ON FUNCTION public.talkx_refresh_local_attributes(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_refresh_local_attributes(integer, uuid) TO service_role;
