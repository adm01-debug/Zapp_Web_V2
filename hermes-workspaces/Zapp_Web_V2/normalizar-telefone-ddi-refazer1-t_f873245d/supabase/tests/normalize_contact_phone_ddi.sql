-- normalize_contact_phone_ddi — prova comportamental do gatilho de normalização de
-- contacts.phone com DDI (cartão t_567fa759; migration
-- supabase/migrations/20261013051843_normalize_contact_phone_ddi.sql).
--
-- O QUE PROVA (o gatilho REAL, não uma cópia):
--   RED  — estado ANTERIOR: a trigger só tira não-dígitos; um número brasileiro de
--          10-11 dígitos fica SEM o 55 (o defeito do PD-53).
--   G1   — após a migration, o backfill põe 55 nos 5 contatos legados de 10-11 dígitos.
--   G2   — número estrangeiro (12 dígitos) e número já com 55 (13 dígitos) ficam intactos.
--   G3   — colisão: a linha legada cuja forma com 55 já existe em OUTRO contato é
--          PRESERVADA (nenhuma linha apagada/sobrescrita) e a contagem total não muda.
--   G4   — backfill NÃO reescreve updated_at das linhas normalizadas.
--   G5   — INSERT/UPDATE novos: 11 e 10 dígitos ganham 55; 13 dígitos inalterado; e
--          re-gravar um número já normalizado não duplica o DDI (idempotente).
--   G6   — papel real: `authenticated` insere contato (a trigger dispara) e PASSA;
--          chamar public.normalize_contact_phone() direto é NEGADO (42501).
--   G7   — reaplicar a migration não muda nada (idempotência).
--   R    — o bloco `-- Rollback (SQL executável...)` do cabeçalho roda e devolve o
--          estado anterior (dados, tabela de apoio e corpo da função).
--
-- COMO RODA. Em Postgres descartável (a superfície mínima é criada à mão aqui; no
-- banco da tarefa a tabela e os gatilhos já existem). O bloco de rollback é extraído
-- do PRÓPRIO arquivo da migration (não reescrito à mão) e passado por -v rollback_file:
--   mig=supabase/migrations/20261013051843_normalize_contact_phone_ddi.sql
--   awk '/^-- Rollback \(SQL executável, na ordem\):/{f=1;next} f&&/^--   /{sub(/^--   /,"");print;next} f{exit}' "$mig" > .tmp/rollback.sql
--   docker run --rm -d --name zapp-v2-norm-phone-$$ -v "$PWD:/repo:ro" \
--     -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--   docker exec -i zapp-v2-norm-phone-$$ psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres \
--     -v mig=/repo/$mig -v rollback_file=/repo/.tmp/rollback.sql \
--     < supabase/tests/normalize_contact_phone_ddi.sql
-- Tudo numa transação que termina em ROLLBACK: zero efeito colateral, reaplicável.

\set ON_ERROR_STOP on

\if :{?mig}
\else
  \set mig 'supabase/migrations/20261013051843_normalize_contact_phone_ddi.sql'
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima à mão, no estado ANTERIOR à migration (trigger antiga)
-- ---------------------------------------------------------------------------
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text,
  phone      text NOT NULL UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;

-- Gatilho genérico de updated_at (corpo REAL de update_updated_at_column).
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Gatilho de normalização ANTES da migration (só tira não-dígitos).
CREATE FUNCTION public.normalize_contact_phone() RETURNS trigger
LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    NEW.phone := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_normalize_contact_phone BEFORE INSERT OR UPDATE OF phone
  ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.normalize_contact_phone();

-- ---------------------------------------------------------------------------
-- Fixtures (inseridos com a trigger ANTIGA ativa): 5 legados de 10-11 dígitos,
-- 1 colisor já com 55, 1 estrangeiro, 1 já normalizado. updated_at de L1 fixo.
-- ---------------------------------------------------------------------------
INSERT INTO public.contacts (id, name, phone, updated_at) VALUES
  ('c0000000-0000-0000-0000-000000000001','legado L1','(11) 98888-0001','2020-01-02T03:04:05Z'),
  ('c0000000-0000-0000-0000-000000000002','legado L2','1133330002',        '2020-01-02T03:04:05Z'),
  ('c0000000-0000-0000-0000-000000000003','legado L3','11988880003',       '2020-01-02T03:04:05Z'),
  ('c0000000-0000-0000-0000-000000000004','legado L4','11 9 9999-0004',    '2020-01-02T03:04:05Z'),
  ('c0000000-0000-0000-0000-000000000005','legado L5','1133330005',        '2020-01-02T03:04:05Z'),
  ('c0000000-0000-0000-0000-000000000009','colisor ja com 55','5511988880009','2020-01-02T03:04:05Z'),
  ('c0000000-0000-0000-0000-00000000000a','colisor legado','11988880009',  '2020-01-02T03:04:05Z'),
  ('c0000000-0000-0000-0000-00000000000b','estrangeiro','351912345678',    '2020-01-02T03:04:05Z'),
  ('c0000000-0000-0000-0000-00000000000c','ja normalizado','5511977776666','2020-01-02T03:04:05Z');
-- total inicial de contatos: 9

-- ---------------------------------------------------------------------------
-- RED — sem a migration, o número de 11 dígitos NÃO recebe 55
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT phone FROM public.contacts WHERE id='c0000000-0000-0000-0000-000000000001') <> '11988880001' THEN
    RAISE EXCEPTION 'RED FALHOU: trigger antiga ja alterou o telefone de L1';
  END IF;
  IF (SELECT phone FROM public.contacts WHERE id='c0000000-0000-0000-0000-000000000002') LIKE '55%' THEN
    RAISE EXCEPTION 'RED FALHOU: L2 ja veio com 55 (a migration nao e a prova)';
  END IF;
  RAISE NOTICE 'RED OK: trigger antiga deixa 10-11 digitos sem DDI (defeito confirmado)';
END $$;

-- ---------------------------------------------------------------------------
-- Aplica a migration REAL
-- ---------------------------------------------------------------------------
\i :mig

-- ---------------------------------------------------------------------------
-- G1 — backfill: os 5 legados ganham 55; 11 e 10 dígitos
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('c0000000-0000-0000-0000-000000000001'::uuid,'5511988880001'),
      ('c0000000-0000-0000-0000-000000000002'::uuid,'551133330002'),
      ('c0000000-0000-0000-0000-000000000003'::uuid,'5511988880003'),
      ('c0000000-0000-0000-0000-000000000004'::uuid,'5511999990004'),
      ('c0000000-0000-0000-0000-000000000005'::uuid,'551133330005')) v(id, esperado)
  LOOP
    IF (SELECT phone FROM public.contacts WHERE id = r.id) <> r.esperado THEN
      RAISE EXCEPTION 'G1 FALHOU: % ficou com % (esperado %)',
        r.id, (SELECT phone FROM public.contacts WHERE id = r.id), r.esperado;
    END IF;
  END LOOP;
  RAISE NOTICE 'G1 OK: backfill pos 55 nos 5 legados de 10-11 digitos';
END $$;

-- ---------------------------------------------------------------------------
-- G2 — estrangeiro e já-normalizado ficam intactos
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT phone FROM public.contacts WHERE id='c0000000-0000-0000-0000-00000000000b') <> '351912345678' THEN
    RAISE EXCEPTION 'G2 FALHOU: numero estrangeiro foi alterado';
  END IF;
  IF (SELECT phone FROM public.contacts WHERE id='c0000000-0000-0000-0000-00000000000c') <> '5511977776666' THEN
    RAISE EXCEPTION 'G2 FALHOU: numero ja com 55 foi alterado';
  END IF;
  RAISE NOTICE 'G2 OK: estrangeiro (12 digitos) e numero ja com 55 (13) preservados';
END $$;

-- ---------------------------------------------------------------------------
-- G3 — colisão: nada apagado nem sobrescrito; contagem total inalterada
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_total integer;
BEGIN
  IF (SELECT phone FROM public.contacts WHERE id='c0000000-0000-0000-0000-00000000000a') <> '11988880009' THEN
    RAISE EXCEPTION 'G3 FALHOU: linha legada em colisao foi alterada';
  END IF;
  IF (SELECT phone FROM public.contacts WHERE id='c0000000-0000-0000-0000-000000000009') <> '5511988880009' THEN
    RAISE EXCEPTION 'G3 FALHOU: contato que ja tinha o 55 foi sobrescrito';
  END IF;
  SELECT count(*) INTO v_total FROM public.contacts;
  IF v_total <> 9 THEN
    RAISE EXCEPTION 'G3 FALHOU: contagem de contatos mudou (% <> 9) — alguma linha foi apagada', v_total;
  END IF;
  RAISE NOTICE 'G3 OK: colisao preservada, nenhuma linha apagada/sobrescrita (9 contatos)';
END $$;

-- ---------------------------------------------------------------------------
-- G4 — updated_at das linhas normalizadas NÃO foi reescrito
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT updated_at FROM public.contacts WHERE id='c0000000-0000-0000-0000-000000000001')
     <> '2020-01-02T03:04:05Z'::timestamptz THEN
    RAISE EXCEPTION 'G4 FALHOU: backfill reescreveu updated_at de L1';
  END IF;
  RAISE NOTICE 'G4 OK: updated_at preservado no backfill';
END $$;

-- ---------------------------------------------------------------------------
-- G5 — INSERT/UPDATE novos e idempotência do DDI
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO public.contacts (name, phone) VALUES ('novo 11','21988887777');
  IF (SELECT phone FROM public.contacts WHERE name='novo 11') <> '5521988887777' THEN
    RAISE EXCEPTION 'G5 FALHOU: INSERT de 11 digitos nao ganhou 55';
  END IF;

  INSERT INTO public.contacts (name, phone) VALUES ('novo 10','2133337777');
  IF (SELECT phone FROM public.contacts WHERE name='novo 10') <> '552133337777' THEN
    RAISE EXCEPTION 'G5 FALHOU: INSERT de 10 digitos nao ganhou 55';
  END IF;

  INSERT INTO public.contacts (name, phone) VALUES ('novo 13','5511999991234');
  IF (SELECT phone FROM public.contacts WHERE name='novo 13') <> '5511999991234' THEN
    RAISE EXCEPTION 'G5 FALHOU: INSERT de 13 digitos foi alterado';
  END IF;

  -- idempotência: regravar um valor já normalizado não duplica o DDI
  UPDATE public.contacts SET phone='5521988887777' WHERE name='novo 11';
  IF (SELECT phone FROM public.contacts WHERE name='novo 11') <> '5521988887777' THEN
    RAISE EXCEPTION 'G5 FALHOU: UPDATE idempotente duplicou o 55';
  END IF;
  RAISE NOTICE 'G5 OK: 11/10 digitos ganham 55; 13 fica; regravar nao duplica';
END $$;

-- ---------------------------------------------------------------------------
-- G6 — papel real: authenticated insere (trigger dispara) e chama a função -> negado
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_negado boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  INSERT INTO public.contacts (name, phone) VALUES ('via authenticated','11912345678');
  RESET ROLE;
  IF (SELECT phone FROM public.contacts WHERE name='via authenticated') <> '5511912345678' THEN
    RAISE EXCEPTION 'G6 FALHOU: INSERT por authenticated nao passou pela trigger';
  END IF;

  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.normalize_contact_phone();
  EXCEPTION WHEN insufficient_privilege THEN v_negado := true;
  END;
  RESET ROLE;
  IF NOT v_negado THEN
    RAISE EXCEPTION 'G6 FALHOU: authenticated conseguiu chamar normalize_contact_phone() direto';
  END IF;
  RAISE NOTICE 'G6 OK: authenticated insere com normalizacao; chamada direta negada (42501)';
END $$;

-- ---------------------------------------------------------------------------
-- G7 — idempotência: reaplicar a migration não muda nada
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _g7_antes AS SELECT id, phone FROM public.contacts;
\i :mig
DO $$
DECLARE v_antes text; v_depois text; v_apoio integer;
BEGIN
  SELECT string_agg(phone, '|' ORDER BY id) INTO v_antes FROM _g7_antes;
  SELECT string_agg(phone, '|' ORDER BY id) INTO v_depois FROM public.contacts;
  IF v_antes <> v_depois THEN
    RAISE EXCEPTION 'G7 FALHOU: reaplicar a migration alterou os telefones';
  END IF;
  SELECT count(*) INTO v_apoio FROM public._rb_normalize_contact_phone_ddi;
  IF v_apoio <> 5 THEN
    RAISE EXCEPTION 'G7 FALHOU: tabela de apoio com % linhas (esperado 5, sem duplicar)', v_apoio;
  END IF;
  RAISE NOTICE 'G7 OK: reaplicacao idempotente (telefones estaveis; apoio sem duplicar)';
END $$;

-- ---------------------------------------------------------------------------
-- R — o bloco de rollback do cabeçalho roda e devolve o estado anterior
-- ---------------------------------------------------------------------------
\if :{?rollback_file}
\i :rollback_file
DO $$
BEGIN
  IF (SELECT phone FROM public.contacts WHERE id='c0000000-0000-0000-0000-000000000001') <> '11988880001' THEN
    RAISE EXCEPTION 'R FALHOU: telefone de L1 nao voltou ao valor anterior';
  END IF;
  IF to_regclass('public._rb_normalize_contact_phone_ddi') IS NOT NULL THEN
    RAISE EXCEPTION 'R FALHOU: tabela de apoio nao foi removida';
  END IF;
  -- corpo anterior restaurado: um INSERT de 11 dígitos NÃO ganha 55
  INSERT INTO public.contacts (name, phone) VALUES ('pos rollback','31987654321');
  IF (SELECT phone FROM public.contacts WHERE name='pos rollback') <> '31987654321' THEN
    RAISE EXCEPTION 'R FALHOU: funcao anterior nao foi restaurada (ainda adiciona 55)';
  END IF;
  RAISE NOTICE 'R OK: rollback devolveu dados, removeu a tabela de apoio e restaurou a funcao';
END $$;
\else
\echo 'ATENCAO: rode com -v rollback_file=<bloco extraido do cabecalho da migration> (BLOCO R nao executado)'
\endif

DO $$ BEGIN RAISE NOTICE 'normalize_contact_phone_ddi: TODAS as assercoes passaram (RED/G1-G7/R)'; END $$;

ROLLBACK;
