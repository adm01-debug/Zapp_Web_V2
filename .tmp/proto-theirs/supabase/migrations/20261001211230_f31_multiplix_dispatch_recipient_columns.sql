-- f31_multiplix_dispatch_recipient_columns
-- versão 20261001211230 reservada para hermes-bloco-c-multiplix-enums-fila-eventos-aud-26100120014cfb em 2026-10-01T20:36:24-03:00 (hermes-db-migrar --nova)

-- f31_multiplix_modelo_v2_colunas_dedupe
-- F31 · bloco C (modelo de dados v2) de docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
-- Depende do F30 (20261001201230_f30_multiplix_enums_modelo_v2.sql) aplicado ANTES: esta migration usa o
-- tipo public.multiplix_eligibility e o enum public.multiplix_dispatch_status do F30.
--
-- rollback: ALTER TABLE public.multiplix_recipients DROP CONSTRAINT IF EXISTS multiplix_recipients_dispatch_destino_key;
-- rollback: ALTER TABLE public.multiplix_recipients DROP COLUMN IF EXISTS inclusion_reason, DROP COLUMN IF EXISTS audience_version, DROP COLUMN IF EXISTS variables_snapshot, DROP COLUMN IF EXISTS eligibility_reason, DROP COLUMN IF EXISTS eligibility, DROP COLUMN IF EXISTS singu_contact_id;
-- rollback: ALTER TABLE public.multiplix_dispatches DROP CONSTRAINT IF EXISTS multiplix_dispatches_origin_check;
-- rollback: ALTER TABLE public.multiplix_dispatches DROP CONSTRAINT IF EXISTS multiplix_dispatches_whatsapp_connection_id_fkey;
-- rollback: ALTER TABLE public.multiplix_dispatches DROP COLUMN IF EXISTS origin, DROP COLUMN IF EXISTS audience_version, DROP COLUMN IF EXISTS dispatch_version;
-- rollback: ALTER TABLE public.multiplix_dispatches ALTER COLUMN created_by DROP NOT NULL;
-- rollback: -- funcao multiplix_create_draft (a assinatura muda de 3 para 4 colunas de saida, entao e DROP+CREATE): DROP FUNCTION IF EXISTS public.multiplix_create_draft(text, text, jsonb, uuid, uuid, uuid, timestamp with time zone, boolean); e reaplicar o corpo integro de supabase/migrations/20260929630000_multiplix_create_draft.sql (ele volta com o RETURNS TABLE de 3 colunas e o REVOKE/GRANT).
-- nomes-antigos-conferidos: multiplix_create_draft — e DROP+CREATE da MESMA funcao com os MESMOS parametros de entrada; o nome nao morre, so a lista de saida ganha a 4a coluna (duplicated_count). O chamador supabase/functions/multiplix-audience/index.ts continua valido (le os campos por nome em data[0]).
--
-- Escopo F31 (medido no canonico tnnnlkbymytvtqngbbqh, 0 linhas nas duas tabelas):
--   multiplix_dispatches : created_by NOT NULL (0 nulos), dispatch_version/audience_version int NOT NULL DEFAULT 1,
--                          origin text + CHECK (manual|audience|crm360|contacts), FK real em whatsapp_connection_id
--                          -> public.whatsapp_connections(id) (hoje NAO ha FK; alvo medido: PK em whatsapp_connections.id),
--                          client_request_id com UNIQUE (o indice unico PARCIAL WHERE IS NOT NULL de 20260929630000 ja
--                          cumpre: e o UNICO indice possivel para a coluna; um UNIQUE formal criaria indice duplicado).
--   multiplix_recipients : singu_contact_id uuid, eligibility public.multiplix_eligibility NOT NULL DEFAULT 'eligible'
--                          (a RPC so insere quem passou no filtro de elegibilidade), eligibility_reason text,
--                          variables_snapshot jsonb, audience_version int, inclusion_reason text,
--                          UNIQUE NULLS NOT DISTINCT (dispatch_id, destino_e164) (destino_e164 e NULLABLE: o default
--                          do UNIQUE seria NULLS DISTINCT e dois NULLs escapariam; PG 17.6 tem NULLS NOT DISTINCT).
--   RPC multiplix_create_draft : literais de elegibilidade em INGLES, e DEDUPE por destino (2 entradas = 1 linha),
--                          devolvendo duplicated_count como 4a coluna de saida.
--
-- Sem ALTER TYPE: nenhuma coluna tem o tipo trocado aqui (isso foi o F30), entao NAO toca na publication
-- supabase_realtime nem nas policies que citam `status`. So ADD COLUMN / SET NOT NULL / ADD CONSTRAINT.

-- ============ 1. multiplix_dispatches ============

-- 1.1 created_by NOT NULL. Medido: 0 linhas na tabela, 0 created_by nulo -> o SET NOT NULL nao tem o que rejeitar.
-- (Sem FK para profiles: nao estava no escopo do F31 e created_by ja e amarrado pela RLS e pelos guards.)
ALTER TABLE public.multiplix_dispatches
  ALTER COLUMN created_by SET NOT NULL;

-- 1.2 versoes do modelo v2 (default 1 para as linhas existentes/novas) e origem do disparo.
ALTER TABLE public.multiplix_dispatches
  ADD COLUMN IF NOT EXISTS dispatch_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS audience_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS origin text;

-- 1.3 origin e um vocabulario FECHADO de 4 valores (text + CHECK, como o plano pede; nao virou enum no F30).
-- O CHECK aceita NULL (NULL IN (...) nao e FALSE): a coluna e opcional no modelo v2.
ALTER TABLE public.multiplix_dispatches
  ADD CONSTRAINT multiplix_dispatches_origin_check
    CHECK (origin IN ('manual', 'audience', 'crm360', 'contacts'));

-- 1.4 FK real de whatsapp_connection_id. Alvo medido no canonico: public.whatsapp_connections(id) (PK uuid;
-- e o alvo ja usado por TODAS as outras 15+ FKs com esse nome de coluna). ON DELETE SET NULL para nao apagar
-- o historico de disparos quando a conexao sai. 0 linhas -> nao ha orfao para rejeitar.
ALTER TABLE public.multiplix_dispatches
  ADD CONSTRAINT multiplix_dispatches_whatsapp_connection_id_fkey
    FOREIGN KEY (whatsapp_connection_id) REFERENCES public.whatsapp_connections(id) ON DELETE SET NULL;

-- 1.5 client_request_id: o indice unico PARCIAL idx_multiplix_dispatches_client_request_id (WHERE client_request_id
-- IS NOT NULL), criado em 20260929630000, ja garante o "UNIQUE" do plano para todo valor presente (a RPC sempre
-- grava). Manter o parcial evita um segundo indice unico redundante para a mesma coluna (o auditor de indice
-- duplicado acusaria); por isso NAO se adiciona um UNIQUE formal aqui. Decisao registrada no PR.

-- ============ 2. multiplix_recipients ============

-- 2.1 colunas do modelo v2. `eligibility` tem o DEFAULT 'eligible' porque a RPC so materializa quem passou no
-- filtro de elegibilidade: a linha que existe E a elegivel; os motivos de nao-elegibilidade vivem no snapshot
-- da audiencia (audience_version/variables_snapshot), nao viram linha aqui.
ALTER TABLE public.multiplix_recipients
  ADD COLUMN IF NOT EXISTS singu_contact_id uuid,
  ADD COLUMN IF NOT EXISTS eligibility public.multiplix_eligibility NOT NULL DEFAULT 'eligible',
  ADD COLUMN IF NOT EXISTS eligibility_reason text,
  ADD COLUMN IF NOT EXISTS variables_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS audience_version integer,
  ADD COLUMN IF NOT EXISTS inclusion_reason text;

-- 2.2 destino_e164 e NULLABLE. O UNIQUE do plano e (dispatch_id, destino_e164): com o default NULLS DISTINCT
-- dois destinatarios sem numero (destino NULL) escapariam da unicidade. NULLS NOT DISTINCT (PG 15+) e o que
-- expressa "1 linha por (dispatch, numero)"; a normalizacao do destino e a MESMA do INSERT da RPC
-- (NULLIF(btrim(COALESCE(...,'')),'')), entao '5511...' e ' 5511... ' colapsam. Tabela com 0 linhas.
ALTER TABLE public.multiplix_recipients
  ADD CONSTRAINT multiplix_recipients_dispatch_destino_key
    UNIQUE NULLS NOT DISTINCT (dispatch_id, destino_e164);

-- ============ 3. multiplix_create_draft (CREATE OR REPLACE NAO serve) ============
-- CREATE OR REPLACE FUNCTION nao aceita mudar o tipo de retorno (42P13: "cannot change return type of existing
-- function"): acrescentar a 4a coluna de saida exige DROP + CREATE. Os PARAMETROS DE ENTRADA sao os mesmos,
-- entao o chamador PostgREST (edge multiplix-audience) nao muda. Nao ha dependencia no catalogo
-- (pg_depend vazio para esta funcao) -> o DROP e seguro. O REVOKE/GRANT volta no fim (o DROP apaga os grants).

DROP FUNCTION IF EXISTS public.multiplix_create_draft(text, text, jsonb, uuid, uuid, uuid, timestamp with time zone, boolean);

CREATE FUNCTION public.multiplix_create_draft(
  p_name text,
  p_template text,
  p_recipients jsonb,
  p_client_request_id uuid,
  p_created_by uuid,
  p_whatsapp_connection_id uuid DEFAULT NULL::uuid,
  p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_confirm_over_limit boolean DEFAULT false
)
 RETURNS TABLE(dispatch_id uuid, recipient_count integer, created boolean, duplicated_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existing uuid;
  v_dispatch_id uuid;
  v_recipients jsonb;
  v_count integer;
  v_eligible_count integer;
  v_limit integer;
  v_created boolean := true;
  -- F30 tornou status um enum; um parametro/variavel `text` NAO e atribuivel a coluna enum sem cast
  -- (medido: 42804 "column status is of type multiplix_dispatch_status but expression is of type text").
  -- A variavel passa a ser do proprio tipo do F30.
  v_status public.multiplix_dispatch_status;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' OR length(p_name) > 200 THEN
    RAISE EXCEPTION 'multiplix_draft_name_required' USING ERRCODE = '22023';
  END IF;
  IF p_template IS NULL OR btrim(p_template) = '' OR length(p_template) > 65536 THEN
    RAISE EXCEPTION 'multiplix_draft_template_required' USING ERRCODE = '22023';
  END IF;
  IF p_client_request_id IS NULL OR p_created_by IS NULL THEN
    RAISE EXCEPTION 'multiplix_draft_request_identity_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = p_created_by) THEN
    RAISE EXCEPTION 'multiplix_draft_owner_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_scheduled_at IS NOT NULL AND p_scheduled_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'multiplix_draft_schedule_must_be_future' USING ERRCODE = '22023';
  END IF;

  IF p_recipients IS NULL OR jsonb_typeof(p_recipients) <> 'array' THEN
    RAISE EXCEPTION 'multiplix_draft_recipients_required' USING ERRCODE = '22023';
  END IF;

  -- F31/(a): elegibilidade em INGLES (era 'apto'). O valor 'eligible' e o mesmo do enum
  -- public.multiplix_eligibility do F30. A fronteira PT->EN vive em
  -- supabase/functions/_shared/multiplix-eligibility.ts (fromSinguEligibility) e a edge
  -- multiplix-audience (index.ts:320/326) traduz a saida PT do Singu ('apto'|'destino_invalido'|
  -- 'fora_do_escopo') para o enum canonico ANTES de chamar esta RPC. O Singu, externo, continua em PT.
  -- So entra quem o servidor classificou como elegivel: linha sem destino ou fora de escopo/suprimida
  -- nao vira destinatario. WITH ORDINALITY para preservar a ordem de entrada do jsonb.
  --
  -- TOLERANCIA TRANSITORIA (decisao do EXECUTOR, nao do plano — registrada no PR): o filtro aceita
  -- TAMBEM o literal PT 'apto'. Motivo MEDIDO: a edge em producao HOJE manda 'apto', e esta migration
  -- e aditiva (pode ser aplicada ANTES do deploy da edge nova). Sem a tolerancia existe uma janela —
  -- em QUALQUER das duas ordens de aplicacao (RPC nova + edge velha, ou edge nova + RPC velha) — em
  -- que TODOS os destinatarios sao descartados e o dispatch nasce vazio. Com ela as duas versoes da
  -- edge convivem, entao a ordem de aplicacao deixa de ser um risco de producao.
  -- REMOVER o literal 'apto' quando nao houver mais edge antiga em producao (rollout, Bloco J).
  SELECT COALESCE(jsonb_agg(e.entry ORDER BY e.ord), '[]'::jsonb)
    INTO v_recipients
    FROM jsonb_array_elements(p_recipients) WITH ORDINALITY AS e(entry, ord)
   WHERE COALESCE(e.entry->>'elegibilidade', 'eligible') IN ('eligible', 'apto')
     AND e.entry->>'company_id' IS NOT NULL
     AND e.entry->>'company_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  v_eligible_count := COALESCE(jsonb_array_length(v_recipients), 0);

  -- F31/(b) DEDUPE: 2 contatos com o MESMO numero no mesmo dispatch viram 1 linha. Criterio deterministico:
  -- DISTINCT ON sobre o destino NORMALIZADO (a mesma expressao do INSERT: NULLIF(btrim(COALESCE(...,'')),'')),
  -- mantendo a PRIMEIRA entrada na ordem do jsonb (menor ordinal) — a ordem em que o servidor resolveu o
  -- publico. Sem o dedupe aqui o UNIQUE (dispatch_id, destino_e164) estouraria 23505 em vez de colapsar.
  WITH src AS (
    SELECT NULLIF(btrim(COALESCE(e.entry->>'destino_e164', '')), '') AS destino,
           e.entry,
           e.ord
      FROM jsonb_array_elements(v_recipients) WITH ORDINALITY AS e(entry, ord)
  ),
  dedup AS (
    SELECT DISTINCT ON (destino) destino, entry, ord
      FROM src
     ORDER BY destino, ord
  )
  SELECT COALESCE(jsonb_agg(entry ORDER BY ord), '[]'::jsonb)
    INTO v_recipients
    FROM dedup;

  v_count := COALESCE(jsonb_array_length(v_recipients), 0);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'multiplix_draft_no_eligible_recipients' USING ERRCODE = '22023';
  END IF;

  -- F17/ADR-007 D2: teto de destinatarios sem confirmacao explicita. A contagem e a de DESTINATARIOS REAIS
  -- (pos-dedupe), coerente com total_recipients e com recipient_count devolvido.
  SELECT COALESCE((settings.value)::text::integer, 200)
    INTO v_limit
    FROM public.talkx_settings AS settings
   WHERE settings.key = 'multiplix_max_recipients_default';
  v_limit := COALESCE(v_limit, 200);
  IF v_count > v_limit AND NOT p_confirm_over_limit THEN
    RAISE EXCEPTION 'multiplix_over_recipient_limit: % acima do teto de % (confirme explicitamente)', v_count, v_limit
      USING ERRCODE = '22023';
  END IF;

  -- Idempotencia: o mesmo pedido (cliente reenviou/duplo clique) devolve o
  -- dispatch ja criado em vez de criar outro.
  SELECT dispatch.id INTO v_existing
    FROM public.multiplix_dispatches AS dispatch
   WHERE dispatch.client_request_id = p_client_request_id;

  IF FOUND THEN
    SELECT COALESCE(count(*), 0)::integer INTO v_count
      FROM public.multiplix_recipients AS recipient
     WHERE recipient.dispatch_id = v_existing;
    -- Nada foi colapsado nesta chamada (o dispatch ja existia): duplicated_count = 0.
    RETURN QUERY SELECT v_existing, v_count, false, 0;
    RETURN;
  END IF;

  v_status := CASE WHEN p_scheduled_at IS NULL
                   THEN 'draft'::public.multiplix_dispatch_status
                   ELSE 'scheduled'::public.multiplix_dispatch_status
              END;

  INSERT INTO public.multiplix_dispatches AS dispatch (
    name, message_template, status, total_recipients, scheduled_at,
    whatsapp_connection_id, created_by, client_request_id
  ) VALUES (
    btrim(p_name), p_template, v_status, v_count, p_scheduled_at,
    p_whatsapp_connection_id, p_created_by, p_client_request_id
  )
  RETURNING dispatch.id INTO v_dispatch_id;

  INSERT INTO public.multiplix_recipients AS recipient (
    dispatch_id, company_id, company_name_snapshot, destino_e164, destino_origem
  )
  SELECT
    v_dispatch_id,
    (entry->>'company_id')::uuid,
    NULLIF(btrim(COALESCE(entry->>'company_name', '')), ''),
    NULLIF(btrim(COALESCE(entry->>'destino_e164', '')), ''),
    NULLIF(btrim(COALESCE(entry->>'destino_origem', '')), '')
  FROM jsonb_array_elements(v_recipients) AS entry;

  -- duplicated_count = entradas elegiveis que o dedupe colapsou (aviso do plano: "1 linha + aviso").
  RETURN QUERY SELECT v_dispatch_id, v_count, v_created, (v_eligible_count - v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.multiplix_create_draft(text, text, jsonb, uuid, uuid, uuid, timestamp with time zone, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.multiplix_create_draft(text, text, jsonb, uuid, uuid, uuid, timestamp with time zone, boolean) TO service_role;
