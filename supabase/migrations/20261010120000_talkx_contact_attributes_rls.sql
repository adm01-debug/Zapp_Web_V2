-- talkx_contact_attributes: projeção de atributos comerciais com RLS (X037)
-- Rollback:
--   DROP POLICY IF EXISTS "talkx_contact_attributes_select_admin" ON public.talkx_contact_attributes;
--   DROP POLICY IF EXISTS "talkx_contact_attributes_select_owner" ON public.talkx_contact_attributes;
--   DROP FUNCTION IF EXISTS public.talkx_refresh_local_attributes(integer);
--   DROP TABLE IF EXISTS public.talkx_contact_attributes;
--
-- PROBLEMA: Talk X não tem projeção local de atributos comerciais por contato
--   (vendedor, UF/região pelo DDD, estágio do funil, última mensagem, RFM).
--   Aplicação lê CRM diretamente ou não tem esses dados disponíveis para
--   filtros e segmentação.
--
-- SOLUÇÃO: Criar a tabela talkx_contact_attributes com RLS, alimentada pela
--   função talkx_refresh_local_attributes() que consolida fontes locais
--   (vendedor, DDD→UF/região, funil, mensagens) em uma visão por contato.
--   Acesso: vendedor lê só seus contatos; admin lê todos; escrita só service_role.

CREATE TABLE IF NOT EXISTS public.talkx_contact_attributes (
  contact_id      uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_name    text,
  company_segment text,
  is_company      boolean NOT NULL DEFAULT false,
  city            text,
  state           text,
  region          text,
  salesperson_name   text,
  salesperson_profile_id uuid,
  funnel_stage    text,
  customer_status text,
  last_purchase_at timestamptz,
  avg_ticket      numeric(10,2),
  orders_count    integer NOT NULL DEFAULT 0,
  total_spent     numeric(12,2) NOT NULL DEFAULT 0,
  rfm_recency_days integer,
  rfm_frequency   integer,
  rfm_monetary    numeric(10,2),
  rfm_segment     text,
  score           integer,
  gender          text,
  birth_date      date,
  birth_month     smallint,
  birth_day       smallint,
  last_message_at timestamptz,
  sources         jsonb NOT NULL DEFAULT '{}'::jsonb,
  crm_synced_at   timestamptz,
  purchases_synced_at timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id)
);

COMMENT ON TABLE public.talkx_contact_attributes IS
  'Talk X (X037): atributos comerciais de cada contato, alimentados por fontes locais (CRM, DDD, vendedor, funil, mensagens).';

-- RLS
ALTER TABLE public.talkx_contact_attributes ENABLE ROW LEVEL SECURITY;

-- SELECT: admin/supervisor vê tudo; demais veem só contatos que enxergam
DROP POLICY IF EXISTS "talkx_contact_attributes_select_admin" ON public.talkx_contact_attributes;
CREATE POLICY "talkx_contact_attributes_select_admin"
  ON public.talkx_contact_attributes FOR SELECT
  USING (public.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS "talkx_contact_attributes_select_owner" ON public.talkx_contact_attributes;
CREATE POLICY "talkx_contact_attributes_select_owner"
  ON public.talkx_contact_attributes FOR SELECT
  USING (public.is_contact_visible_to_user(contact_id, auth.uid()));

-- Nenhum INSERT/UPDATE/DELETE para authenticated; anon sem grant
-- Escrita só via service_role (função talkx_refresh_local_attributes)

-- Grants
REVOKE ALL ON TABLE public.talkx_contact_attributes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.talkx_contact_attributes TO authenticated;
GRANT SELECT ON TABLE public.talkx_contact_attributes TO service_role;

-- Índices nas colunas de filtro
CREATE INDEX IF NOT EXISTS idx_talkx_contact_attributes_salesperson
  ON public.talkx_contact_attributes(salesperson_name);
CREATE INDEX IF NOT EXISTS idx_talkx_contact_attributes_region
  ON public.talkx_contact_attributes(region);
CREATE INDEX IF NOT EXISTS idx_talkx_contact_attributes_state
  ON public.talkx_contact_attributes(state);
CREATE INDEX IF NOT EXISTS idx_talkx_contact_attributes_city
  ON public.talkx_contact_attributes(city);
CREATE INDEX IF NOT EXISTS idx_talkx_contact_attributes_funnel_stage
  ON public.talkx_contact_attributes(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_talkx_contact_attributes_customer_status
  ON public.talkx_contact_attributes(customer_status);
CREATE INDEX IF NOT EXISTS idx_talkx_contact_attributes_rfm_segment
  ON public.talkx_contact_attributes(rfm_segment);
CREATE INDEX IF NOT EXISTS idx_talkx_contact_attributes_last_message
  ON public.talkx_contact_attributes(last_message_at);
CREATE INDEX IF NOT EXISTS idx_talkx_contact_attributes_sources
  ON public.talkx_contact_attributes USING gin(sources);

-- Função de refresh de atributos locais (SECURITY DEFINER, só service_role executa)
CREATE OR REPLACE FUNCTION public.talkx_refresh_local_attributes(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_affected integer := 0;
  v_contact_id uuid;
  v_salesperson_name text;
  v_salesperson_profile_id uuid;
  v_state text;
  v_region text;
  v_last_message_at timestamptz;
  v_funnel_stage text;
  v_ddd_text text;
  v_ddd smallint;
BEGIN
  -- Só admin/supervisor pode executar o refresh
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas admin/supervisor pode executar o refresh de atributos'
      USING errcode = '22023';
  END IF;

  -- Cursor sobre contatos visíveis que ainda não têm atributos ou precisam de atualização
  FOR v_contact_id, v_salesperson_name, v_salesperson_profile_id, v_state, v_region,
      v_last_message_at, v_funnel_stage
  IN
    SELECT
      c.id,
      p.name,
      p.id,
      c.state,
      r.region,
      lm.last_message_at,
      sp.name
    FROM public.contacts c
    JOIN public.profiles p ON p.id = c.assigned_to
    LEFT JOIN public.talkx_ddd_regions r
      ON r.ddd = public.get_ddd_from_phone(c.phone)
    LEFT JOIN LATERAL (
      SELECT max(created_at) AS last_message_at
      FROM public.messages
      WHERE contact_id = c.id AND sender = 'contact'
    ) lm ON true
    LEFT JOIN public.sales_deals sd ON sd.contact_id = c.id
    LEFT JOIN public.sales_pipeline_stages sp ON sp.id = sd.stage_id
    WHERE public.is_contact_visible_to_user(c.id, auth.uid())
    AND c.id IN (
      SELECT contact_id FROM public.talkx_contact_attributes
      UNION
      SELECT c2.id FROM public.contacts c2
      WHERE public.is_contact_visible_to_user(c2.id, auth.uid())
      AND NOT EXISTS (
        SELECT 1 FROM public.talkx_contact_attributes ca2
        WHERE ca2.contact_id = c2.id
      )
      LIMIT p_limit
    )
  LOOP
    -- Upsert do atributo do contato
    INSERT INTO public.talkx_contact_attributes (
      contact_id, salesperson_name, salesperson_profile_id,
      state, region, last_message_at, funnel_stage, updated_at
    ) VALUES (
      v_contact_id, v_salesperson_name, v_salesperson_profile_id,
      v_state, v_region, v_last_message_at, v_funnel_stage, now()
    )
    ON CONFLICT (contact_id) DO UPDATE SET
      salesperson_name = EXCLUDED.salesperson_name,
      salesperson_profile_id = EXCLUDED.salesperson_profile_id,
      state = EXCLUDED.state,
      region = EXCLUDED.region,
      last_message_at = EXCLUDED.last_message_at,
      funnel_stage = EXCLUDED.funnel_stage,
      updated_at = now();

    v_affected := v_affected + 1;
  END LOOP;

  RETURN v_affected;
END;
$$;

-- REVOKE/GRANT para a função
REVOKE ALL ON FUNCTION public.talkx_refresh_local_attributes(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_refresh_local_attributes(integer) TO service_role;
