-- ============================================================================
-- R2-DB-022 B1 — a TRAVA da ACL de mídia: sensibilidade MEDIDA no banco
-- ============================================================================
-- Prova portada do antigo `scripts/db-audit/rls-whatsapp-media-storage-acl.test.sh`
-- (blocos A/B/C + modo `--sem-acl`), que saiu do repositório: um `.test.sh` novo
-- dentro de `scripts/` entra como órfão no inventário de testes
-- (`scripts/ci/check-test-inventory.mjs`) e derruba o CI. A pergunta dos blocos
-- A/B/C é a mesma e agora mora no lugar coberto (`supabase/tests/*.sql`, que o
-- inventário não olha).
--
-- A trava é o filtro T2 de
-- `supabase/tests/rls_whatsapp_media_select_via_messages.sql`: `storage.objects`
-- não pode autorizar SELECT nos buckets `whatsapp-media`/`audio-messages` por
-- join em `messages`, por `media_url` nem por comparação de padrão
-- (~~/LIKE, position, substring, replace, right). Aqui a trava é executada contra
-- policies ADVERSARIAIS criadas na hora, para medir o que ela pega e o que não
-- pega — o mesmo que o bloco C do extinto `.test.sh` media no container, agora
-- medido no Postgres de verdade, com as formas que o deparse do `pg_policies.qual`
-- realmente produz:
--
--   T1 o filtro corrigido pega as 4 formas do vetor ................. 4 de 4
--   T2 a forma que o filtro ANTIGO perdia: `FROM (messages m JOIN contacts c`
--      (o `FROM (` do deparse do JOIN não casava `from\s+messages`) ... [vermelho antes] antigo 0 / corrigido 1
--   T3 função reservada vem com aspas no deparse (`"right"(`) e a trava
--      reconhece ..................................................... 1 policy
--   T4 `audio-messages` NÃO casa (o filtro ingênuo `qual ~ 'messages'`
--      casava) ........................................................ corrigido 0 / ingênuo 1  [vermelho antes]
--   T5 as fixtures saem e o conjunto da trava volta EXATAMENTE ao da base,
--      sem sobra nenhuma .............................................. 0 sobras / delta 0
--   T0 (registro, não asserção) o estado da base é impresso: vazio = contrato
--      instalado; com a policy legada = o vermelho ESPERADO (era o que o modo
--      `--sem-acl` aceitava: vermelho pelo nome do item, não erro de sintaxe).
--
-- O que esta prova NÃO cobre (declarado, não escondido):
--  · o replay de duas pontas do container (aplicar a migration da ACL
--    `20261006175251_r2_db_022_storage_acl.sql` num PostgreSQL 17 descartável e
--    comparar com o estado sem ela): SQL puro não sobe container. O efeito dessas
--    duas pontas é o T0/T3/T4 de `rls_whatsapp_media_select_via_messages.sql`
--    (estrutura: verde com a migration instalada, vermelho identificado sem ela).
--  · enforcement com papel sem BYPASSRLS sobre objetos reais destes buckets:
--    provado in-DB por `supabase/tests/sec_p2_definer_storage.sql` (T8/T9,
--    `SET LOCAL ROLE authenticated`); a forja na fronteira de escrita de
--    `messages` por `supabase/tests/r2_db_022_provenance_trigger.sql`.
--  · concorrência real entre sessões (o container abria duas conexões); nenhuma
--    asserção daqui depende de corrida.
--
-- Sem efeito colateral: as fixtures adversariais são criadas APENAS dentro desta
-- transação, que termina em ROLLBACK; qualquer FALHOU aborta e desfaz.
--
-- Uso: zapp-db-local psql . <nome-do-banco> < supabase/tests/rls_whatsapp_media_storage_acl.sql
-- Sai != 0 quando qualquer verificação falha (ON_ERROR_STOP).
\set ON_ERROR_STOP on

BEGIN;

DO $trava_acl$
DECLARE
  -- as 3 policies do contrato (mesma lista usada pela trava em
  -- rls_whatsapp_media_select_via_messages.sql)
  v_policies text[] := ARRAY['Users can read assigned whatsapp media',
                             'Users can read assigned audio messages',
                             'whatsapp media readable via visible message'];
  -- o filtro corrigido (card: `\m(from|join)\s+\(?(public\.)?messages\M`) e o
  -- filtro anterior a esta correção, com o mesmo resto do predicado
  v_re_novo      text := '\m(from|join)\s+\(?(public\.)?messages\M';
  v_re_antigo    text := '\m(from|join)\s+(public\.)?messages\M';
  v_adv          text[] := ARRAY['r2db022 trava adv join sem schema',
                                 'r2db022 trava adv join public.messages',
                                 'r2db022 trava adv media_url'];
  v_citadas      text   := 'r2db022 trava adv funcoes citadas';
  v_benigna      text   := 'r2db022 trava benigna audio';
  v_fixtures     text[] := v_adv || v_citadas || v_benigna;
  v_base         text[];
  v_com_fixtures text[];
  v_depois       text[];
  v_q            text;
  v_n            integer;
BEGIN
  --------------------------------------------------------------------------
  -- T0 (registro): estado da base antes de qualquer fixture
  --------------------------------------------------------------------------
  SELECT coalesce(array_agg(p.policyname ORDER BY p.policyname), '{}')
    INTO v_base
    FROM pg_policies p
   WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd = 'SELECT'
     AND (p.qual ~* 'media_url'
          OR p.qual ~ '~~'
          OR p.qual ~* '"?position"?\('
          OR p.qual ~* '"?substring"?\('
          OR p.qual ~* '"?replace"?\('
          OR p.qual ~* '"?right"?\('
          OR p.qual ~* v_re_novo
          OR p.qual ~ 'public\.messages')
     AND (p.qual ~ 'whatsapp-media' OR p.qual ~ 'audio-messages'
          OR p.policyname = ANY (v_policies));
  SELECT count(*) INTO v_n FROM pg_policies p
   WHERE p.schemaname = 'storage' AND p.tablename = 'objects'
     AND p.policyname = ANY (v_policies);
  IF array_length(v_base, 1) IS NOT NULL THEN
    RAISE NOTICE 'T0 base: vermelho esperado (a migration da ACL não está nesta base): %', v_base;
  ELSIF v_n > 0 THEN
    RAISE NOTICE 'T0 base: contrato instalado — % policies do contrato, nenhuma por media_url/join', v_n;
  ELSE
    RAISE NOTICE 'T0 base: nenhuma das 3 policies do contrato nesta base (replay/baseline sem os migrations do app) — a trava abaixo mede sensibilidade, não o estado da base';
  END IF;

  --------------------------------------------------------------------------
  -- fixtures: as formas do vetor que a trava tem de pegar, e uma que não pode
  -- ser pega. Nomes sem esquema (`messages`) e com esquema (`public.messages`)
  -- de propósito: o deparse de um JOIN sai como `FROM (messages m JOIN ...)`.
  --------------------------------------------------------------------------
  CREATE POLICY "r2db022 trava adv join sem schema" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id IN ('whatsapp-media','audio-messages')
           AND EXISTS (SELECT 1 FROM messages m JOIN contacts c ON c.id = m.contact_id
                        WHERE c.assigned_to = auth.uid()));

  CREATE POLICY "r2db022 trava adv join public.messages" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id IN ('whatsapp-media','audio-messages')
           AND EXISTS (SELECT 1 FROM public.messages m
                        WHERE m.contact_id IN (SELECT c.id FROM contacts c
                                                WHERE c.assigned_to = auth.uid())));

  CREATE POLICY "r2db022 trava adv media_url" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id IN ('whatsapp-media','audio-messages')
           AND name = ANY (ARRAY(SELECT m.media_url FROM public.messages m)));

  CREATE POLICY "r2db022 trava adv funcoes citadas" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id IN ('whatsapp-media','audio-messages')
           AND right(name, 6) = 'legado'
           AND substring(name from 1 for 5) = 'image');

  CREATE POLICY "r2db022 trava benigna audio" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'audio-messages' AND (storage.foldername(name))[1] = auth.uid()::text);

  --------------------------------------------------------------------------
  -- T1: a trava pega as 4 formas do vetor
  --------------------------------------------------------------------------
  SELECT coalesce(array_agg(p.policyname ORDER BY p.policyname), '{}')
    INTO v_com_fixtures
    FROM pg_policies p
   WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd = 'SELECT'
     AND (p.qual ~* 'media_url'
          OR p.qual ~ '~~'
          OR p.qual ~* '"?position"?\('
          OR p.qual ~* '"?substring"?\('
          OR p.qual ~* '"?replace"?\('
          OR p.qual ~* '"?right"?\('
          OR p.qual ~* v_re_novo
          OR p.qual ~ 'public\.messages')
     AND (p.qual ~ 'whatsapp-media' OR p.qual ~ 'audio-messages'
          OR p.policyname = ANY (v_policies));
  IF NOT (v_fixtures[1:4] <@ v_com_fixtures) THEN
    RAISE EXCEPTION 'T1 FALHOU: a trava não pegou todas as formas do vetor. pegou=%, faltou=%',
      v_com_fixtures, (SELECT coalesce(array_agg(x ORDER BY x), '{}')
                         FROM unnest(v_fixtures[1:4]) x WHERE x <> ALL (v_com_fixtures));
  END IF;
  RAISE NOTICE 'T1 ok: trava pegou as 4 formas adversariais (%)', v_fixtures[1:4];

  --------------------------------------------------------------------------
  -- T2: a forma que o filtro ANTIGO perdia (JOIN deparsado com parêntese).
  -- Vermelho sem a correção: com `from\s+(public\.)?messages` o deparse
  -- `FROM (messages m JOIN contacts c ...)` não casa.
  --------------------------------------------------------------------------
  SELECT p.qual INTO v_q FROM pg_policies p
   WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = v_adv[1];
  RAISE NOTICE 'T2 deparse do JOIN sem esquema: %', replace(v_q, E'\n', ' ');
  IF v_q !~* v_re_novo THEN
    RAISE EXCEPTION 'T2 FALHOU: o filtro corrigido não pegou o deparse do JOIN: %', v_q;
  END IF;
  IF v_q ~* v_re_antigo THEN
    RAISE EXCEPTION 'T2 FALHOU: o filtro anterior (sem `\(?`) já pegava esta forma — a correção não se prova aqui: %', v_q;
  END IF;
  SELECT p.qual INTO v_q FROM pg_policies p
   WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = v_adv[2];
  IF v_q !~* v_re_novo THEN
    RAISE EXCEPTION 'T2 FALHOU: o filtro corrigido não pegou `public.messages`: %', v_q;
  END IF;
  RAISE NOTICE 'T2 ok: JOIN casado pelo filtro corrigido e perdido pelo anterior (vermelho antes)';

  --------------------------------------------------------------------------
  -- T3: função reservada sai com aspas no deparse e a trava reconhece
  --------------------------------------------------------------------------
  SELECT p.qual INTO v_q FROM pg_policies p
   WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = v_citadas;
  IF position('"right"(' IN v_q) = 0 THEN
    RAISE EXCEPTION 'T3 FALHOU: o deparse não citou a função reservada como esperado: %', v_q;
  END IF;
  IF v_citadas <> ALL (v_com_fixtures) THEN
    RAISE EXCEPTION 'T3 FALHOU: a trava não pegou a policy que cita função reservada';
  END IF;
  RAISE NOTICE 'T3 ok: %', v_q;

  --------------------------------------------------------------------------
  -- T4: sem falso positivo no literal `audio-messages`. Vermelho antes: o
  -- filtro ingênuo (`qual ~ ''messages''`) casava o bucket `audio-messages`.
  --------------------------------------------------------------------------
  IF v_benigna = ANY (v_com_fixtures) THEN
    RAISE EXCEPTION 'T4 FALHOU: falso positivo — a trava pegou a policy benigna do bucket audio-messages';
  END IF;
  SELECT p.qual INTO v_q FROM pg_policies p
   WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = v_benigna;
  IF v_q !~ 'messages' THEN
    RAISE EXCEPTION 'T4 FALHOU: a fixture benigna deixou de citar `audio-messages` (a prova perdeu o sentido): %', v_q;
  END IF;
  RAISE NOTICE 'T4 ok: `audio-messages` não é pego pelo filtro corrigido (e era pelo ingênuo `qual ~ ''messages''`)';

  --------------------------------------------------------------------------
  -- T5: as fixtures saem e o conjunto da trava volta ao da base (delta 0)
  --------------------------------------------------------------------------
  DROP POLICY "r2db022 trava adv join sem schema" ON storage.objects;
  DROP POLICY "r2db022 trava adv join public.messages" ON storage.objects;
  DROP POLICY "r2db022 trava adv media_url" ON storage.objects;
  DROP POLICY "r2db022 trava adv funcoes citadas" ON storage.objects;
  DROP POLICY "r2db022 trava benigna audio" ON storage.objects;

  SELECT coalesce(array_agg(p.policyname ORDER BY p.policyname), '{}')
    INTO v_depois
    FROM pg_policies p
   WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd = 'SELECT'
     AND (p.qual ~* 'media_url'
          OR p.qual ~ '~~'
          OR p.qual ~* '"?position"?\('
          OR p.qual ~* '"?substring"?\('
          OR p.qual ~* '"?replace"?\('
          OR p.qual ~* '"?right"?\('
          OR p.qual ~* v_re_novo
          OR p.qual ~ 'public\.messages')
     AND (p.qual ~ 'whatsapp-media' OR p.qual ~ 'audio-messages'
          OR p.policyname = ANY (v_policies));
  IF v_depois <> v_base THEN
    RAISE EXCEPTION 'T5 FALHOU: delta != 0 — antes=%, depois=%', v_base, v_depois;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies p
   WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = ANY (v_fixtures);
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'T5 FALHOU: % fixture(s) ficaram para trás', v_n;
  END IF;
  RAISE NOTICE 'T5 ok: 0 sobras, conjunto da trava igual ao da base (%)', v_depois;

  RAISE NOTICE 'rls_whatsapp_media_storage_acl: ok — a trava T2 pega as 4 formas do vetor (join sem esquema, join com public., media_url, funções reservadas citadas), não tem falso positivo em audio-messages e não deixa resíduo';
END $trava_acl$;

ROLLBACK;
