-- talkx_v4_x040_rfm_local_purchases
-- Rollback: DROP FUNCTION IF EXISTS public.talkx_recompute_purchase_metrics(integer);
--   DROP TABLE IF EXISTS public.talkx_contact_attributes;
--   DROP TABLE IF EXISTS public.talkx_data_jobs;
--   DELETE FROM public.talkx_settings WHERE key = 'rfm_bands';
--
-- marcador interno (o teste de banco procura por ele; sobrevive ao rename do --nova):
--   talkx_v4_x040_rfm_local_purchases
--
-- X040 · Fase 4 (Tela dados · camada banco + cron · DDL: sim) — calcular recência,
-- frequência, valor e segmento RFM a partir das COMPRAS LOCAIS (public.contact_purchases).
--
-- Defeito (conferido no código atual, ponta de dia/2026-10-09):
--   `git grep -n "talkx_recompute_purchase_metrics"` só encontra docs;
--   `rfm_*`, `last_purchase_at`, `orders_count`, `total_spent`, `avg_ticket` não existem em
--   supabase/** — o RFM do contato vinha só do selo do CRM (company_rfm_scores, parado em
--   2026-04-12). Nada calculava RFM a partir das compras locais do ZAPP.
--
-- Por que esta migration também cria as tabelas de apoio:
--   A etapa que define a projeção `talkx_contact_attributes` (X037) e a tabela de jobs
--   `talkx_contact_attributes`/`talkx_data_jobs` (X036) NÃO integra a 3ª leva (o plano de
--   08/10 deixa banco/migrations fora da leva) e não existe em nenhum branch
--   (`git grep -l talkx_contact_attributes` = 0) — a própria auditoria (P046.json) registra
--   "dependem do pipeline ainda ausente". Sem elas a função não tem onde gravar e a
--   migration não sobe num banco limpo. A criação aqui é ADITIVA e COMPOSÁVEL
--   (CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS): quando as ondas de banco de
--   X036/X037 rodarem, elas só acrescentam as colunas próprias (CRM, vendedor, região...) e
--   a projeção continua íntegra. As colunas abaixo são exatamente as que a X040 "Fecha":
--   dados:ultima_compra, dados:ticket_medio, dados:total_pedidos, dados:valor_total,
--   dados:rfm_recencia, dados:rfm_frequencia, dados:rfm_monetario, dados:rfm_segmento.
--
-- Contrato da função public.talkx_recompute_purchase_metrics(p_limit integer DEFAULT 5000):
--   * varre public.contact_purchases (compra local) agrupando por contato com compra;
--   * grava last_purchase_at, orders_count, total_spent, avg_ticket, rfm_recency_days,
--     rfm_frequency (nota F), rfm_monetary (nota M), rfm_segment;
--   * notas R/F/M de 1 a 5 por faixas em public.talkx_settings.rfm_bands (default embutido:
--     recência 30/90/180/365 dias; frequência 1, 2, 3–4, 5–9, 10+; valor por faixas), e por
--     QUINTIS quando há >= rfm_bands.monetary_min_buyers_for_quintiles compradores (padrão 100);
--   * SEGMENTO por tabela de decisão versionada abaixo (Campeões, Leais, Em potencial, Novos,
--     Em risco, Hibernando, Perdidos);
--   * contato SEM compra NÃO é gravado e fica com os campos nulos — não vira "Hibernando";
--   * fuso America/Sao_Paulo na conta da recência;
--   * idempotente: p_limit limita os candidatos por chamada; só conta como alterada a linha
--     que muda de fato (ON CONFLICT ... WHERE ... IS DISTINCT FROM), então reexecutar sem
--     compra nova devolve 0;
--   * devolve o número de linhas alteradas (changed).
--   * EXECUTE só para service_role (job de manutenção); nada para anon/PUBLIC/authenticated.
--
-- Job: linha em public.talkx_data_jobs (job='recompute_purchase_metrics', 1x/dia = 1440 min),
--   disparada por talkx_run_data_jobs() (X036) e, quando existir, logo após `pull_won_deals`
--   com alterações (X039).

-- ---------------------------------------------------------------------------
-- (1) Tabela de jobs dos dados da trilha (X036) — mínimo, composável.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.talkx_data_jobs (
  job text PRIMARY KEY,
  interval_minutes integer NOT NULL DEFAULT 1440,
  enabled boolean NOT NULL DEFAULT true,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- composável: se a tabela já existir de outra onda (ou for criada depois), nada é perdido
ALTER TABLE public.talkx_data_jobs ADD COLUMN IF NOT EXISTS interval_minutes integer NOT NULL DEFAULT 1440;
ALTER TABLE public.talkx_data_jobs ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.talkx_data_jobs ADD COLUMN IF NOT EXISTS last_started_at timestamptz;
ALTER TABLE public.talkx_data_jobs ADD COLUMN IF NOT EXISTS last_finished_at timestamptz;
ALTER TABLE public.talkx_data_jobs ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.talkx_data_jobs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.talkx_data_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS talkx_data_jobs_select ON public.talkx_data_jobs;
CREATE POLICY talkx_data_jobs_select ON public.talkx_data_jobs
  FOR SELECT TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

REVOKE ALL ON public.talkx_data_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.talkx_data_jobs TO authenticated;
GRANT ALL ON public.talkx_data_jobs TO service_role;

COMMENT ON TABLE public.talkx_data_jobs IS
  'Talk X · trilha de dados: catálogo dos jobs (X036). Leitura só admin/supervisor; escrita só service_role.';

-- ---------------------------------------------------------------------------
-- (2) Projeção de atributos comerciais (X037) — só as colunas que a X040 fecha.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.talkx_contact_attributes (
  contact_id uuid PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  last_purchase_at timestamptz,
  orders_count integer NOT NULL DEFAULT 0,
  total_spent numeric(14,2) NOT NULL DEFAULT 0,
  avg_ticket numeric(14,2),
  rfm_recency_days integer,
  rfm_frequency integer,
  rfm_monetary integer,
  rfm_segment text,
  purchases_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- composável com as ondas de banco (X037/X038): acrescenta sem conflito
ALTER TABLE public.talkx_contact_attributes ADD COLUMN IF NOT EXISTS last_purchase_at timestamptz;
ALTER TABLE public.talkx_contact_attributes ADD COLUMN IF NOT EXISTS orders_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.talkx_contact_attributes ADD COLUMN IF NOT EXISTS total_spent numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.talkx_contact_attributes ADD COLUMN IF NOT EXISTS avg_ticket numeric(14,2);
ALTER TABLE public.talkx_contact_attributes ADD COLUMN IF NOT EXISTS rfm_recency_days integer;
ALTER TABLE public.talkx_contact_attributes ADD COLUMN IF NOT EXISTS rfm_frequency integer;
ALTER TABLE public.talkx_contact_attributes ADD COLUMN IF NOT EXISTS rfm_monetary integer;
ALTER TABLE public.talkx_contact_attributes ADD COLUMN IF NOT EXISTS rfm_segment text;
ALTER TABLE public.talkx_contact_attributes ADD COLUMN IF NOT EXISTS purchases_synced_at timestamptz;
ALTER TABLE public.talkx_contact_attributes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS talkx_contact_attributes_rfm_segment_idx
  ON public.talkx_contact_attributes (rfm_segment);
CREATE INDEX IF NOT EXISTS talkx_contact_attributes_last_purchase_idx
  ON public.talkx_contact_attributes (last_purchase_at);
CREATE INDEX IF NOT EXISTS talkx_contact_attributes_purchases_synced_idx
  ON public.talkx_contact_attributes (purchases_synced_at);

ALTER TABLE public.talkx_contact_attributes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS talkx_contact_attributes_select ON public.talkx_contact_attributes;
CREATE POLICY talkx_contact_attributes_select ON public.talkx_contact_attributes
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR public.is_contact_visible_to_user(contact_id, auth.uid())
  );

REVOKE ALL ON public.talkx_contact_attributes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.talkx_contact_attributes TO authenticated;
GRANT ALL ON public.talkx_contact_attributes TO service_role;

COMMENT ON TABLE public.talkx_contact_attributes IS
  'Talk X · projeção de atributos comerciais por contato (X037). Nesta leva só as colunas de compra/RFM (X040); as colunas de CRM entram por ALTER nas ondas de banco.';

-- ---------------------------------------------------------------------------
-- (3) Faixas configuráveis das notas R/F/M (talkx_settings.rfm_bands).
--     Seed só se ainda não houver valor (não sobrescreve ajuste do dono).
-- ---------------------------------------------------------------------------
INSERT INTO public.talkx_settings (key, value, description)
VALUES (
  'rfm_bands',
  '{"version":1,"recency_days":[30,90,180,365],"frequency":[1,2,4,9],"monetary":[100,500,1000,5000],"monetary_min_buyers_for_quintiles":100}'::jsonb,
  'Talk X · faixas das notas R/F/M (1 a 5); sobrepõe o default embutido em talkx_recompute_purchase_metrics'
)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- (4) Função de recomputo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.talkx_recompute_purchase_metrics(p_limit integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_bands jsonb;
  v_recency integer[];
  v_frequency integer[];
  v_monetary numeric[];
  v_min_buyers integer;
  v_buyer_count integer;
  v_changed integer := 0;
BEGIN
  v_bands := COALESCE((SELECT value FROM public.talkx_settings WHERE key = 'rfm_bands'), '{}'::jsonb);

  v_recency := CASE WHEN jsonb_typeof(v_bands -> 'recency_days') = 'array'
    THEN ARRAY(SELECT x::integer FROM jsonb_array_elements_text(v_bands -> 'recency_days') AS t(x))
    ELSE ARRAY[30, 90, 180, 365] END;
  IF array_length(v_recency, 1) IS DISTINCT FROM 4 THEN v_recency := ARRAY[30, 90, 180, 365]; END IF;

  v_frequency := CASE WHEN jsonb_typeof(v_bands -> 'frequency') = 'array'
    THEN ARRAY(SELECT x::integer FROM jsonb_array_elements_text(v_bands -> 'frequency') AS t(x))
    ELSE ARRAY[1, 2, 4, 9] END;
  IF array_length(v_frequency, 1) IS DISTINCT FROM 4 THEN v_frequency := ARRAY[1, 2, 4, 9]; END IF;

  v_monetary := CASE WHEN jsonb_typeof(v_bands -> 'monetary') = 'array'
    THEN ARRAY(SELECT x::numeric FROM jsonb_array_elements_text(v_bands -> 'monetary') AS t(x))
    ELSE ARRAY[100, 500, 1000, 5000] END;
  IF array_length(v_monetary, 1) IS DISTINCT FROM 4 THEN v_monetary := ARRAY[100, 500, 1000, 5000]; END IF;

  v_min_buyers := COALESCE(NULLIF(v_bands ->> 'monetary_min_buyers_for_quintiles', '')::integer, 100);

  WITH buyers AS (
    SELECT p.contact_id,
           max(p.purchased_at) AS last_purchase_at,
           count(*)::integer AS orders_count,
           COALESCE(sum(COALESCE(p.amount, 0)), 0)::numeric(14,2) AS total_spent
    FROM public.contact_purchases AS p
    WHERE p.contact_id IS NOT NULL
      AND p.purchased_at IS NOT NULL
    GROUP BY p.contact_id
  ),
  buyer_count AS (
    SELECT count(*)::integer AS n FROM buyers
  ),
  scored AS (
    SELECT b.contact_id,
           b.last_purchase_at,
           b.orders_count,
           b.total_spent,
           GREATEST(
             0,
             (now() AT TIME ZONE 'America/Sao_Paulo')::date
               - (b.last_purchase_at AT TIME ZONE 'America/Sao_Paulo')::date
           )::integer AS recency_days,
           ntile(5) OVER (ORDER BY b.total_spent, b.contact_id) AS monetary_quintile
    FROM buyers AS b
  ),
  noted AS (
    SELECT s.contact_id,
           s.last_purchase_at,
           s.orders_count,
           s.total_spent,
           s.recency_days,
           CASE WHEN s.recency_days <= v_recency[1] THEN 5
                WHEN s.recency_days <= v_recency[2] THEN 4
                WHEN s.recency_days <= v_recency[3] THEN 3
                WHEN s.recency_days <= v_recency[4] THEN 2
                ELSE 1 END AS r_note,
           CASE WHEN s.orders_count <= v_frequency[1] THEN 1
                WHEN s.orders_count <= v_frequency[2] THEN 2
                WHEN s.orders_count <= v_frequency[3] THEN 3
                WHEN s.orders_count <= v_frequency[4] THEN 4
                ELSE 5 END AS f_note,
           CASE WHEN (SELECT n FROM buyer_count) >= v_min_buyers THEN s.monetary_quintile::integer
                WHEN s.total_spent <= v_monetary[1] THEN 1
                WHEN s.total_spent <= v_monetary[2] THEN 2
                WHEN s.total_spent <= v_monetary[3] THEN 3
                WHEN s.total_spent <= v_monetary[4] THEN 4
                ELSE 5 END AS m_note
    FROM scored AS s
  ),
  final AS (
    SELECT n.contact_id,
           n.last_purchase_at,
           n.orders_count,
           n.total_spent,
           n.recency_days,
           n.r_note,
           n.f_note,
           n.m_note,
           CASE
             WHEN n.r_note >= 4 AND n.f_note >= 4 AND n.m_note >= 4 THEN 'Campeões'
             WHEN n.r_note >= 3 AND n.f_note >= 3 AND n.m_note >= 3 THEN 'Leais'
             WHEN n.r_note >= 4 AND n.f_note = 1 THEN 'Novos'
             WHEN n.r_note >= 3 THEN 'Em potencial'
             WHEN n.f_note >= 3 THEN 'Em risco'
             WHEN n.f_note <= 2 AND n.m_note >= 3 THEN 'Hibernando'
             ELSE 'Perdidos'
           END AS segment
    FROM noted AS n
  ),
  upserted AS (
    INSERT INTO public.talkx_contact_attributes AS a
      (contact_id, last_purchase_at, orders_count, total_spent, avg_ticket,
       rfm_recency_days, rfm_frequency, rfm_monetary, rfm_segment,
       purchases_synced_at, updated_at)
    SELECT f.contact_id,
           f.last_purchase_at,
           f.orders_count,
           f.total_spent,
           round(f.total_spent / NULLIF(f.orders_count, 0), 2),
           f.recency_days,
           f.f_note,
           f.m_note,
           f.segment,
           now(),
           now()
    FROM final AS f
    ORDER BY f.contact_id
    LIMIT GREATEST(COALESCE(p_limit, 0), 0)
    ON CONFLICT (contact_id) DO UPDATE SET
      last_purchase_at = EXCLUDED.last_purchase_at,
      orders_count = EXCLUDED.orders_count,
      total_spent = EXCLUDED.total_spent,
      avg_ticket = EXCLUDED.avg_ticket,
      rfm_recency_days = EXCLUDED.rfm_recency_days,
      rfm_frequency = EXCLUDED.rfm_frequency,
      rfm_monetary = EXCLUDED.rfm_monetary,
      rfm_segment = EXCLUDED.rfm_segment,
      purchases_synced_at = EXCLUDED.purchases_synced_at,
      updated_at = EXCLUDED.updated_at
    WHERE (a.last_purchase_at, a.orders_count, a.total_spent, a.avg_ticket,
           a.rfm_recency_days, a.rfm_frequency, a.rfm_monetary, a.rfm_segment)
          IS DISTINCT FROM
          (EXCLUDED.last_purchase_at, EXCLUDED.orders_count, EXCLUDED.total_spent,
           EXCLUDED.avg_ticket, EXCLUDED.rfm_recency_days, EXCLUDED.rfm_frequency,
           EXCLUDED.rfm_monetary, EXCLUDED.rfm_segment)
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_changed FROM upserted;

  RETURN v_changed;
END;
$fn$;

REVOKE ALL ON FUNCTION public.talkx_recompute_purchase_metrics(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_recompute_purchase_metrics(integer) TO service_role;

COMMENT ON FUNCTION public.talkx_recompute_purchase_metrics(integer) IS
  'Talk X · X040: recalcula as métricas de compra e o RFM local por contato (compras em contact_purchases). Só service_role. Devolve quantas linhas mudaram.';

-- ---------------------------------------------------------------------------
-- (5) Registro do job (1x/dia). Roda por talkx_run_data_jobs() (X036) e após pull_won_deals.
-- ---------------------------------------------------------------------------
INSERT INTO public.talkx_data_jobs (job, interval_minutes, enabled)
VALUES ('recompute_purchase_metrics', 1440, true)
ON CONFLICT (job) DO NOTHING;
