-- ============================================================================
-- contacts_scores_nullable — pontuacao de lead/risco nasce NULL ("sem score")
-- (cartao t_c18cd308)
--
-- DEFEITO QUE ESTE TESTE TRAVA: public.contacts.lead_score e risk_score nasceram
-- com DEFAULT 0 (20260409014536_...sql:136-137) e NENHUM escritor de pontuacao
-- existe no banco (fora do Talk X, que so FILTRA por essas colunas). Como 0 e um
-- score VALIDO ("risco/lead muito baixo"), a linha sem pontuacao ficou
-- indistinguivel da linha pontuada com 0: a tela mostra 'Lead score 0 / Baixo'
-- e 'Risk score 0' para todo mundo mesmo sem ninguem ter calculado nada, e o 0
-- gravado por um UPDATE parcial (achado lead_score_failed_load_writes_defaults)
-- passa por medicao.
--
-- O QUE PROVA (criterio de pronto do cartao), na ordem de execucao:
--   T0 PRE-ESTADO E MEDICAO — recria o pre-estado de producao quando as colunas
--      faltarem no banco local (lead_score/risk_score integer DEFAULT 0, mais
--      consent_status TEXT DEFAULT 'unknown', as TRES colunas que a
--      20260409014536 adiciona a public.contacts e que o replay local nao aplica)
--      e mede: nenhum valor != 0 existe, ou seja, todo 0 das colunas e ausencia
--      de score, nao medicao; consent_status entra porque T6 chama a RPC real
--      talkx_audience_query, cujo WHERE le c.consent_status — sem ele a RPC nao
--      roda no banco local;
--   T1 CONSERTO — a MIGRATION REAL entra VERBATIM com \i (nao ha DDL reescrita
--      a mao neste arquivo);
--   T2 ESTRUTURA pos-migration — DEFAULT NULL, tipo continua integer e as duas
--      colunas continuam NULLABLE (nada de NOT NULL: sem score o INSERT passa);
--   T3 COMPORTAMENTO service_role — contato novo sem pontuacao nasce NULL e
--      pontuacao informada explicitamente continua gravada (dado real intacto);
--   T4 CONVERSAO + EFEITO COLATERAL — recriando o pre-estado (DEFAULT 0 + linha
--      legada nascida com 0) e reaplicando a migration: o 0 herdado vira NULL,
--      quem tem valor real (42/7) fica intacto e o updated_at de NINGUEM e
--      reescrito (o gatilho de updated_at fica desligado no entorno do UPDATE);
--   T5 PAPEL REAL authenticated — o INSERT que o app faz (agente, com assigned_to
--      proprio) nasce sem pontuacao (NULL), com a RLS valendo;
--   T6 NENHUMA FUNCAO QUEBRA COM NULL — a RPC real talkx_audience_query
--      (service_role, o papel que a chama) filtra lead_score > 0 sem erro: o
--      contato NULL fica de fora, o de 42 entra; e lead_score = 0 nao casa quem
--      nao tem score (ausencia != 0);
--   T7 ROLLBACK executavel — as linhas de rollback do cabecalho da migration
--      rodam e devolvem o mundo anterior (contato novo volta a nascer 0).
--
-- VERMELHO antes do verde (reproduzivel):
--   verde:    docker cp supabase/migrations/20261016005948_contacts_scores_nullable.sql \
--               "$DB":/tmp/mig_scores.sql
--             zapp-db-local psql . v2-26101521543d0d -v mig=/tmp/mig_scores.sql \
--               < supabase/tests/contacts_scores_nullable.sql
--   vermelho: a MESMA suite com -v mig=/dev/null (o \i nao aplica nada = sem o
--      conserto): T2 falha — "lead_score ainda nasce com DEFAULT 0" — e T3 falha
--      junto, o contato novo nasce 0 em vez de NULL.
--
-- PAPEL REAL: as asserções rodam com SET LOCAL ROLE (service_role, o chamador real
-- das RPCs do Talk X; e authenticated com request.jwt.claims sintetico) — nunca
-- como postgres, que tem BYPASSRLS e nao exerce policy alguma.
--
-- ZERO EFEITO COLATERAL: tudo numa transacao que termina em ROLLBACK. A migration
-- roda dentro dela (um unico DO ... $$ = uma transacao: falhou, nada aplicado).
--
-- COMO RODA (a partir da RAIZ do repositorio, contra o banco local da tarefa):
--   o psql de zapp-db-local roda DENTRO do container (docker exec -i) e o
--   container NAO tem o repositorio montado — o `\i :mig` precisa de um caminho
--   que exista la dentro, e o banco local desta fabrica nao aplica a
--   20260409014536 (ver T0). Por isso, duas etapas:
--     DB=$(docker ps --format '{{.Names}}' | grep -m1 'v2-26101521543d0d-database')
--     docker cp supabase/migrations/20261016005948_contacts_scores_nullable.sql "$DB":/tmp/mig_scores.sql
--     zapp-db-local psql . v2-26101521543d0d -v mig=/tmp/mig_scores.sql \
--       < supabase/tests/contacts_scores_nullable.sql
--   (o padrao de :mig e o caminho do repositorio — vale quando o psql roda com a
--   raiz do repositorio como diretorio de trabalho; `-v mig=` sempre sobrepoe)
-- ============================================================================

\set ON_ERROR_STOP on
\if :{?mig}
\else
\set mig supabase/migrations/20261016005948_contacts_scores_nullable.sql
\endif

BEGIN;

-- T0 — pre-estado + estado de partida ----------------------------------------
\echo 'T0: recria o pre-estado das colunas (quando faltarem) e mede os zeros existentes'
-- As colunas de score vem de 20260409014536_...sql, que FALHA no replay local desta fabrica
-- ("function public.is_admin_or_supervisor(uuid) does not exist" — falha pre-existente,
-- registrada em <stack>/estado/falhas.tsv antes desta migration existir), entao o banco
-- local nao as tem. Recriar aqui o pre-estado exato de producao (integer DEFAULT 0) e o que
-- permite exercitar a migration REAL logo adiante. Se o banco ja tiver as colunas, isto e
-- no-op e o DEFAULT vigente fica intacto (o T2 pega o DEFAULT 0 se ainda estiver la).
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lead_score integer DEFAULT 0;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS risk_score integer DEFAULT 0;
-- consent_status vem da MESMA migration que falha (linha 139 dela) e entra pelo mesmo
-- motivo: a RPC real de T6 (talkx_audience_query) filtra `c.consent_status IS DISTINCT
-- FROM 'revoked'` e nao roda no banco local sem a coluna. Nao e objeto deste cartao: nada
-- aqui depende do DEFAULT dela, so da existencia da coluna.
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS consent_status text DEFAULT 'unknown';

DO $$
DECLARE
  v_zeros_lead int;
  v_zeros_risk int;
  v_reais_lead int;
  v_reais_risk int;
BEGIN
  SELECT count(*) FILTER (WHERE lead_score = 0),
         count(*) FILTER (WHERE risk_score = 0),
         count(*) FILTER (WHERE lead_score IS NOT NULL AND lead_score <> 0),
         count(*) FILTER (WHERE risk_score IS NOT NULL AND risk_score <> 0)
    INTO v_zeros_lead, v_zeros_risk, v_reais_lead, v_reais_risk
    FROM public.contacts;

  RAISE NOTICE 'T0: zeros existentes -> lead_score=% risk_score=%', v_zeros_lead, v_zeros_risk;
  RAISE NOTICE 'T0: valores medidos (!= 0) -> lead_score=% risk_score=%', v_reais_lead, v_reais_risk;

  -- Nenhum valor diferente de 0 existe: o 0 dessas colunas so pode ter vindo do
  -- DEFAULT da coluna, nunca de um calculo de score (nao ha escritor).
  IF v_reais_lead <> 0 OR v_reais_risk <> 0 THEN
    RAISE EXCEPTION 'T0 FALHOU: ja existe pontuacao medida (!= 0) no banco; a conversao dos 0 precisa ser reavaliada';
  END IF;
  RAISE NOTICE 'T0 OK: todo 0 das colunas e ausencia de score, nao medicao';
END $$;

-- T1 — o conserto entra: migration REAL, verbatim -----------------------------
\echo 'T1: aplica a migration real (verbatim, via \i)'
\i :mig

-- T2 — estrutura pos-migration: DEFAULT NULL, integer, NULLABLE ---------------
\echo 'T2: estrutura pos-migration - sem DEFAULT, tipo integer e coluna NULLABLE'
DO $$
DECLARE
  v_rec record;
  v_visto int := 0;
BEGIN
  FOR v_rec IN
    SELECT column_name, column_default, is_nullable, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'contacts'
       AND column_name IN ('lead_score', 'risk_score')
     ORDER BY column_name
  LOOP
    v_visto := v_visto + 1;
    IF v_rec.column_default IS NOT NULL THEN
      RAISE EXCEPTION 'T2 FALHOU: contacts.% ainda nasce com DEFAULT % (o 0 herdado volta a ser gravado)',
        v_rec.column_name, v_rec.column_default;
    END IF;
    IF v_rec.data_type <> 'integer' THEN
      RAISE EXCEPTION 'T2 FALHOU: % virou tipo % (esperado integer: nenhuma tela/RPC quebra)',
        v_rec.column_name, v_rec.data_type;
    END IF;
    IF v_rec.is_nullable <> 'YES' THEN
      RAISE EXCEPTION 'T2 FALHOU: % ficou NOT NULL; sem score o INSERT passaria a falhar', v_rec.column_name;
    END IF;
  END LOOP;

  IF v_visto <> 2 THEN
    RAISE EXCEPTION 'T2 FALHOU: encontrei % das 2 colunas de score em public.contacts', v_visto;
  END IF;
  RAISE NOTICE 'T2 OK: lead_score e risk_score sem DEFAULT, integer e NULLABLE';
END $$;

-- T3 — service_role: contato novo sem pontuacao nasce NULL --------------------
\echo 'T3: service_role cria contato sem pontuacao (nasce NULL) e com pontuacao (preserva)'
SET LOCAL ROLE service_role;
INSERT INTO public.contacts (id, name, phone)
VALUES ('d0000000-0000-0000-0000-0000000000a1', 'Prova sem score', '5511999900001');
INSERT INTO public.contacts (id, name, phone, lead_score, risk_score)
VALUES ('d0000000-0000-0000-0000-0000000000b1', 'Prova com score', '5511999900002', 42, 7);
RESET ROLE;
DO $$
DECLARE
  v_lead_sem int;
  v_risk_sem int;
  v_lead_real int;
  v_risk_real int;
BEGIN
  SELECT lead_score, risk_score INTO v_lead_sem, v_risk_sem
    FROM public.contacts WHERE id = 'd0000000-0000-0000-0000-0000000000a1';
  SELECT lead_score, risk_score INTO v_lead_real, v_risk_real
    FROM public.contacts WHERE id = 'd0000000-0000-0000-0000-0000000000b1';

  IF v_lead_sem IS NOT NULL OR v_risk_sem IS NOT NULL THEN
    RAISE EXCEPTION 'T3 FALHOU: contato sem pontuacao nasceu com lead_score=% risk_score=% (esperado NULL)',
      v_lead_sem, v_risk_sem;
  END IF;
  IF v_lead_real <> 42 OR v_risk_real <> 7 THEN
    RAISE EXCEPTION 'T3 FALHOU: pontuacao informada foi alterada (lead_score=% risk_score=%)',
      v_lead_real, v_risk_real;
  END IF;
  RAISE NOTICE 'T3 OK: sem pontuacao -> NULL; com pontuacao informada -> 42/7 preservados';
END $$;

-- T4 — conversao dos 0 herdados + updated_at preservado (migration real via \i)
\echo 'T4: pre-estado (DEFAULT 0) + migration real reaplicada converte o 0 herdado'
CREATE TEMP TABLE tt_contatos_antes (
  id uuid PRIMARY KEY,
  lead_score integer,
  risk_score integer,
  updated_at timestamptz
) ON COMMIT DROP;

-- recria o pre-estado do defeito: DEFAULT 0 nas duas colunas
ALTER TABLE public.contacts ALTER COLUMN lead_score SET DEFAULT 0;
ALTER TABLE public.contacts ALTER COLUMN risk_score SET DEFAULT 0;
INSERT INTO public.contacts (id, name, phone)
VALUES ('d0000000-0000-0000-0000-0000000000c1', 'Prova legado com 0', '5511999900003');

DO $$
DECLARE
  v_legado record;
BEGIN
  SELECT lead_score, risk_score INTO v_legado
    FROM public.contacts WHERE id = 'd0000000-0000-0000-0000-0000000000c1';
  IF v_legado.lead_score IS DISTINCT FROM 0 OR v_legado.risk_score IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'T4 nao conseguiu recriar o pre-estado: linha legada veio lead_score=% risk_score=%',
      v_legado.lead_score, v_legado.risk_score;
  END IF;
  RAISE NOTICE 'T4: pre-estado recriado - linha legada nasceu com 0/0 (DEFAULT 0 vigente)';
END $$;

-- foto de TODOS os contatos: quem a migration toca (score = 0) e quem nao toca
INSERT INTO tt_contatos_antes (id, lead_score, risk_score, updated_at)
SELECT id, lead_score, risk_score, updated_at FROM public.contacts;

\i :mig

DO $$
DECLARE
  v_zero int;
  v_nulos_com_zero_antes int;
  v_legado_lead int;
  v_legado_risk int;
  v_real_lead int;
  v_real_risk int;
  v_reescritos int;
  v_pendentes int;
  v_defaults int;
BEGIN
  SELECT count(*) FILTER (WHERE lead_score = 0 OR risk_score = 0) INTO v_zero FROM public.contacts;
  IF v_zero <> 0 THEN
    RAISE EXCEPTION 'T4 FALHOU: sobraram % contato(s) com 0 nas colunas de score', v_zero;
  END IF;

  SELECT count(*) INTO v_nulos_com_zero_antes
    FROM tt_contatos_antes a
   WHERE (a.lead_score = 0 OR a.risk_score = 0)
     AND EXISTS (SELECT 1 FROM public.contacts c
                  WHERE c.id = a.id AND (c.lead_score IS NOT NULL OR c.risk_score IS NOT NULL));
  IF v_nulos_com_zero_antes <> 0 THEN
    RAISE EXCEPTION 'T4 FALHOU: % linha(s) com 0 nao viraram NULL', v_nulos_com_zero_antes;
  END IF;

  SELECT lead_score, risk_score INTO v_legado_lead, v_legado_risk
    FROM public.contacts WHERE id = 'd0000000-0000-0000-0000-0000000000c1';
  IF v_legado_lead IS NOT NULL OR v_legado_risk IS NOT NULL THEN
    RAISE EXCEPTION 'T4 FALHOU: 0 herdado do DEFAULT nao virou NULL (lead_score=% risk_score=%)',
      v_legado_lead, v_legado_risk;
  END IF;

  SELECT lead_score, risk_score INTO v_real_lead, v_real_risk
    FROM public.contacts WHERE id = 'd0000000-0000-0000-0000-0000000000b1';
  IF v_real_lead <> 42 OR v_real_risk <> 7 THEN
    RAISE EXCEPTION 'T4 FALHOU: a conversao mexeu em pontuacao real (lead_score=% risk_score=%)',
      v_real_lead, v_real_risk;
  END IF;

  -- efeito colateral que ja foi recusa uma vez: UPDATE em massa reescrevendo updated_at
  SELECT count(*) INTO v_reescritos
    FROM public.contacts c
    JOIN tt_contatos_antes a ON a.id = c.id
   WHERE c.updated_at IS DISTINCT FROM a.updated_at;
  IF v_reescritos <> 0 THEN
    RAISE EXCEPTION 'T4 FALHOU: a migration reescreveu updated_at de % contato(s)', v_reescritos;
  END IF;

  SELECT count(*) INTO v_pendentes FROM tt_contatos_antes WHERE lead_score = 0 OR risk_score = 0;
  IF v_pendentes = 0 THEN
    RAISE EXCEPTION 'T4 FALHOU: nenhuma linha para converter - a foto do pre-estado ficou vazia';
  END IF;

  SELECT count(*) INTO v_defaults
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'contacts'
     AND column_name IN ('lead_score', 'risk_score') AND column_default IS NOT NULL;
  IF v_defaults <> 0 THEN
    RAISE EXCEPTION 'T4 FALHOU: DEFAULT voltou em % coluna(s)', v_defaults;
  END IF;

  RAISE NOTICE 'T4 OK: 0 herdado convertido para NULL, 42/7 preservado, updated_at intacto em % linha(s)',
    (SELECT count(*) FROM tt_contatos_antes);
END $$;

-- T5 — papel real authenticated: INSERT do app nasce sem pontuacao ------------
\echo 'T5: agente (authenticated) cria contato pelo app e nasce sem pontuacao'
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, raw_user_meta_data)
    VALUES ('44444444-4444-4444-4444-444444444444', jsonb_build_object('name', 'Agente prova score'))
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.profiles (user_id, name, role, is_active)
VALUES ('44444444-4444-4444-4444-444444444444', 'Agente prova score', 'agent', true)
ON CONFLICT (user_id) DO NOTHING;

SELECT set_config('request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.contacts (id, name, phone, assigned_to)
SELECT 'd0000000-0000-0000-0000-0000000000d1', 'Prova do agente', '5511999900004', p.id
  FROM public.profiles p WHERE p.user_id = '44444444-4444-4444-4444-444444444444';
RESET ROLE;
DO $$
DECLARE
  v_lead int;
  v_risk int;
BEGIN
  SELECT lead_score, risk_score INTO v_lead, v_risk
    FROM public.contacts WHERE id = 'd0000000-0000-0000-0000-0000000000d1';
  IF v_lead IS NOT NULL OR v_risk IS NOT NULL THEN
    RAISE EXCEPTION 'T5 FALHOU: contato criado pelo agente nasceu lead_score=% risk_score=%', v_lead, v_risk;
  END IF;
  RAISE NOTICE 'T5 OK: contato do agente nasceu sem pontuacao (NULL) sob RLS';
END $$;

-- T6 — nenhuma funcao quebra com NULL (RPC real do Talk X) -------------------
\echo 'T6: talkx_audience_query filtra lead_score > 0 sem erro; NULL fica de fora'
DO $$
BEGIN
  IF to_regclass('public.talkx_blacklist') IS NULL THEN
    RAISE EXCEPTION 'T6 FALHOU: talkx_blacklist ausente no banco local';
  END IF;
  IF to_regclass('auth.users') IS NOT NULL THEN
    INSERT INTO auth.users (id, raw_user_meta_data)
    VALUES ('55555555-5555-5555-5555-555555555555', jsonb_build_object('name', 'Admin prova score'))
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

INSERT INTO public.profiles (user_id, name, role, is_active)
VALUES ('55555555-5555-5555-5555-555555555555', 'Admin prova score', 'admin', true)
ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
VALUES ('55555555-5555-5555-5555-555555555555', 'admin')
ON CONFLICT DO NOTHING;

SELECT set_config('request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(r.id ORDER BY r.id) INTO v_ids
    FROM public.talkx_audience_query(
      '{"groups":[{"match":"and","rules":[{"field":"lead_score","op":"gt","value":"0"}]}]}'::jsonb,
      ARRAY['d0000000-0000-0000-0000-0000000000a1'::uuid,
            'd0000000-0000-0000-0000-0000000000b1'::uuid]
    ) r;

  IF v_ids IS NULL OR v_ids <> ARRAY['d0000000-0000-0000-0000-0000000000b1'::uuid] THEN
    RAISE EXCEPTION 'T6 FALHOU: filtro lead_score > 0 devolveu % (esperado so o contato de 42)', v_ids;
  END IF;
  RAISE NOTICE 'T6 OK: lead_score > 0 sem erro; NULL fora do resultado e o 42 dentro';
END $$;

DO $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(r.id) INTO v_ids
    FROM public.talkx_audience_query(
      '{"groups":[{"match":"and","rules":[{"field":"lead_score","op":"eq","value":"0"}]}]}'::jsonb,
      ARRAY['d0000000-0000-0000-0000-0000000000a1'::uuid,
            'd0000000-0000-0000-0000-0000000000b1'::uuid]
    ) r;
  IF v_ids IS NOT NULL THEN
    RAISE EXCEPTION 'T6 FALHOU: filtro lead_score = 0 casou quem nao tem score: %', v_ids;
  END IF;
  RAISE NOTICE 'T6 OK: lead_score = 0 nao casa contato sem score (ausencia != 0)';
END $$;
RESET ROLE;

-- T7 — rollback executavel do cabecalho ---------------------------------------
\echo 'T7: rollback do cabecalho devolve o mundo anterior (contato novo volta a nascer 0)'
ALTER TABLE public.contacts ALTER COLUMN lead_score SET DEFAULT 0;
ALTER TABLE public.contacts ALTER COLUMN risk_score SET DEFAULT 0;
ALTER TABLE public.contacts DISABLE TRIGGER "update_contacts_updated_at";
UPDATE public.contacts SET lead_score = 0 WHERE lead_score IS NULL;
UPDATE public.contacts SET risk_score = 0 WHERE risk_score IS NULL;
ALTER TABLE public.contacts ENABLE TRIGGER "update_contacts_updated_at";

INSERT INTO public.contacts (id, name, phone)
VALUES ('d0000000-0000-0000-0000-0000000000e1', 'Prova pos-rollback', '5511999900005');

DO $$
DECLARE
  v_lead int;
  v_risk int;
  v_voltaram int;
BEGIN
  SELECT lead_score, risk_score INTO v_lead, v_risk
    FROM public.contacts WHERE id = 'd0000000-0000-0000-0000-0000000000e1';
  IF v_lead IS DISTINCT FROM 0 OR v_risk IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'T7 FALHOU: com o rollback o contato novo deveria nascer 0/0 e veio %/%', v_lead, v_risk;
  END IF;

  SELECT count(*) INTO v_voltaram FROM public.contacts WHERE lead_score IS NULL OR risk_score IS NULL;
  IF v_voltaram <> 0 THEN
    RAISE EXCEPTION 'T7 FALHOU: o rollback deixou % linha(s) com pontuacao nula', v_voltaram;
  END IF;
  RAISE NOTICE 'T7 OK: rollback roda, contato novo nasce 0/0 e nenhum NULL sobra';
END $$;

ROLLBACK;
\echo 'SUITE contacts_scores_nullable: TODOS OS BLOCOS PASSARAM (T0..T7)'
