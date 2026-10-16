-- ia_outbox_stats_hmac — prova do item 090 (fatia de banco SL-195c1):
-- outbox de eventos NÃO confirmados + assinatura HMAC-SHA256 (formato conferido no
-- banco) + negação a anon/authenticated.
--
-- O QUE PROVA.
--   B0 a estrutura existe (é o bloco que fica VERMELHO sem a migration);
--   B1 desenho e travas de catálogo (RLS ligada, policy só de service_role, ACL de
--      tabela, UNIQUE de idempotência, índice parcial da fila, nenhum gatilho);
--   B2 service_role GRAVA, LÊ, marca pendente e dá baixa (papel real);
--   B3 idempotência (UNIQUE + ON CONFLICT) e ENTRADA INVÁLIDA (assinatura fora do
--      formato HMAC-SHA256, maiúscula, tamanho errado, vazia; payload nulo/escalar;
--      origem, event_id e tipo em branco; tentativas negativas; algoritmo ≠ sha256);
--   B4/B5 authenticated e anon NÃO leem, NÃO gravam, NÃO dão baixa e NÃO apagam;
--   B6 o ROLLBACK da migration (linha 2 do arquivo) é EXECUTADO e conferido;
--   B7 (só com -v mig=...) a migration é REAPLICADA e a estrutura volta igual
--      (idempotência + ciclo rollback/reaplicação).
--
-- COMO RODA. Tudo dentro de UMA transação que termina em ROLLBACK: nada fica no banco.
-- Papel de usuário SEMPRE por SET LOCAL ROLE, nunca superusuário (postgres ignora RLS
-- e GRANT: nenhuma asserção de ACESSO roda como postgres).
--
--   (a) banco LOCAL da tarefa, migration já aplicada por hermes-db-migrar
--       (o container do banco não monta a cópia, então não há caminho p/ o \i):
--         zapp-db-local psql . <nome-do-banco-local> -v sem_migration=1 \
--           < supabase/tests/ia_outbox_stats_hmac.sql
--   (b) Postgres 17 descartável, aplicando a PRÓPRIA migration do repositório:
--         docker run --rm -d --name zapp-v2-090-$$ -v "$PWD:/repo:ro" \
--           -e POSTGRES_PASSWORD=test_only postgres:17-alpine
--         docker exec -i zapp-v2-090-$$ psql -X -U postgres -d postgres \
--           -v mig=/repo/supabase/migrations/20261009012702_ia_outbox_stats_hmac.sql \
--           < supabase/tests/ia_outbox_stats_hmac.sql
--   VERMELHO: o mesmo comando de (b) com -v sem_migration=1 em vez de -v mig=...
--   (a migration não é aplicada e B0 falha).
--
-- A verificação criptográfica do HMAC (Web Crypto) é da Edge Function, não do banco:
-- aqui se prova o ENVELOPE — nenhuma linha entra sem assinatura HMAC-SHA256 bem
-- formada, e o papel sem permissão não entra nem lê.

\set ON_ERROR_STOP on

-- Caminho da migration sob teste: `-v mig=<caminho>` aplica o arquivo real. Sem ele
-- (-v sem_migration=1) presume-se que a migration já foi aplicada por fora.
\if :{?sem_migration}
\else
  \if :{?mig}
  \else
    \set mig 'supabase/migrations/20261009012702_ia_outbox_stats_hmac.sql'
  \endif
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- Superfície mínima do Supabase: no banco da tarefa os papéis já existem (o bloco
-- não faz nada); em Postgres descartável eles são criados AQUI, com os mesmos
-- atributos do Supabase (service_role com BYPASSRLS, anon/authenticated sem).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Migration sob teste (o arquivo real do repositório), quando informada
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
\else
\i :mig
\endif

-- ---------------------------------------------------------------------------
-- BLOCO 0 — a estrutura existe (VERMELHO sem a migration)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.outbox_events') IS NULL THEN
    RAISE EXCEPTION '[FALHA] public.outbox_events nao existe: a migration do item 090 nao esta aplicada';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- BLOCO 1 — contrato de forma e de segurança (catálogo, como postgres: aqui NÃO se
-- prova acesso — quem prova acesso são os blocos 2 a 5, por papel)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_papeis text;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.outbox_events'::regclass) THEN
    RAISE EXCEPTION '[FALHA] RLS nao esta ligada em public.outbox_events';
  END IF;

  SELECT string_agg(DISTINCT r::text, ', ') INTO v_papeis
    FROM pg_policies p, unnest(p.roles) AS r
   WHERE p.schemaname = 'public' AND p.tablename = 'outbox_events'
     AND r::text <> 'service_role';
  IF v_papeis IS NOT NULL THEN
    RAISE EXCEPTION '[FALHA] policy de outbox_events alcanca papel indevido: %', v_papeis;
  END IF;

  -- trava de TABELA: privilégio só para service_role
  IF NOT has_table_privilege('service_role', 'public.outbox_events', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.outbox_events', 'SELECT') THEN
    RAISE EXCEPTION '[FALHA] service_role sem INSERT/SELECT em public.outbox_events';
  END IF;
  IF has_table_privilege('anon', 'public.outbox_events', 'INSERT')
     OR has_table_privilege('anon', 'public.outbox_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.outbox_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.outbox_events', 'SELECT') THEN
    RAISE EXCEPTION '[FALHA] anon/authenticated com privilegio de tabela em public.outbox_events';
  END IF;

  -- chave de idempotência e índice parcial da fila
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.outbox_events'::regclass
                    AND contype = 'u'
                    AND conname = 'outbox_events_origem_event_id_unico') THEN
    RAISE EXCEPTION '[FALHA] falta a UNIQUE (origem, event_id) da outbox';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public' AND tablename = 'outbox_events'
                    AND indexname = 'idx_outbox_events_pendentes') THEN
    RAISE EXCEPTION '[FALHA] falta o indice parcial da fila de pendentes';
  END IF;

  -- sem efeito colateral escondido: nenhum gatilho na tabela
  IF EXISTS (SELECT 1 FROM pg_trigger
              WHERE tgrelid = 'public.outbox_events'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION '[FALHA] gatilho inesperado em public.outbox_events';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- BLOCO 2 — service_role GRAVA, LÊ e dá baixa (papel real, não postgres)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
  VALUES ('ai-proxy', 'evt-pendente-1', 'ai.usage', '{"tokens": 10}'::jsonb, repeat('ab', 32))
  RETURNING id INTO v_id;

  IF NOT EXISTS (SELECT 1 FROM public.outbox_events WHERE id = v_id) THEN
    RAISE EXCEPTION '[FALHA] service_role gravou o evento e nao conseguiu le-lo';
  END IF;
  IF (SELECT count(*) FROM public.outbox_events WHERE processed_at IS NULL) <> 1 THEN
    RAISE EXCEPTION '[FALHA] evento recem-gravado nao ficou PENDENTE (processed_at is null)';
  END IF;

  -- o formato com prefixo `sha256=` também entra, e payload em lista também
  INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
  VALUES ('n8n', 'evt-pendente-2', 'stats.consumer', '{"msgs": 3}'::jsonb, 'sha256=' || repeat('cd', 32));
  INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
  VALUES ('n8n', 'evt-lista-1', 'stats.consumer', '[{"msgs": 1}]'::jsonb, repeat('12', 32));

  IF (SELECT count(*) FROM public.outbox_events WHERE processed_at IS NULL) <> 3 THEN
    RAISE EXCEPTION '[FALHA] a outbox nao guardou os tres eventos pendentes';
  END IF;

  UPDATE public.outbox_events
     SET processed_at = now(), tentativas = tentativas + 1
   WHERE origem = 'ai-proxy' AND event_id = 'evt-pendente-1';

  IF (SELECT count(*) FROM public.outbox_events WHERE processed_at IS NULL) <> 2 THEN
    RAISE EXCEPTION '[FALHA] a baixa nao tirou o evento da fila de pendentes';
  END IF;
  IF (SELECT tentativas FROM public.outbox_events WHERE event_id = 'evt-pendente-1') <> 1 THEN
    RAISE EXCEPTION '[FALHA] a baixa nao contou a tentativa';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- BLOCO 3 — idempotência e entrada inválida (a linha só entra íntegra e uma vez)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- evento repetido da MESMA origem: barrado pela UNIQUE (sem consultar-antes-de-inserir)
  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
    VALUES ('n8n', 'evt-pendente-2', 'stats.consumer', '{"msgs": 3}'::jsonb, repeat('cd', 32));
    RAISE EXCEPTION '[FALHA] a UNIQUE (origem, event_id) nao barrou o evento repetido';
  EXCEPTION WHEN unique_violation THEN NULL;  -- esperado
  END;

  -- reenvio pelo caminho do ON CONFLICT: não duplica e não estoura
  INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
  VALUES ('n8n', 'evt-pendente-2', 'stats.consumer', '{"msgs": 3}'::jsonb, repeat('cd', 32))
  ON CONFLICT (origem, event_id) DO NOTHING;
  IF (SELECT count(*) FROM public.outbox_events WHERE origem = 'n8n' AND event_id = 'evt-pendente-2') <> 1 THEN
    RAISE EXCEPTION '[FALHA] ON CONFLICT DO NOTHING duplicou o evento';
  END IF;

  -- a MESMA origem com OUTRO event_id é outro evento (a chave é o par)
  INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
  VALUES ('n8n', 'evt-pendente-4', 'stats.consumer', '{"msgs": 5}'::jsonb, repeat('34', 32));

  -- assinatura que não é HMAC-SHA256 hex: barrada
  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
    VALUES ('n8n', 'evt-ruim-1', 'stats.consumer', '{}'::jsonb, 'md5=abc');
    RAISE EXCEPTION '[FALHA] assinatura de outro algoritmo entrou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
    VALUES ('n8n', 'evt-ruim-2', 'stats.consumer', '{}'::jsonb, upper(repeat('ab', 32)));
    RAISE EXCEPTION '[FALHA] assinatura em MAIUSCULA entrou (o formato canonico e hex minusculo)';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
    VALUES ('n8n', 'evt-ruim-3', 'stats.consumer', '{}'::jsonb, repeat('ab', 31));
    RAISE EXCEPTION '[FALHA] assinatura com 62 caracteres entrou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
    VALUES ('n8n', 'evt-ruim-4', 'stats.consumer', '{}'::jsonb, '');
    RAISE EXCEPTION '[FALHA] assinatura vazia entrou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- payload: nulo, JSON nulo e escalar
  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
    VALUES ('n8n', 'evt-ruim-5', 'stats.consumer', NULL, repeat('ab', 32));
    RAISE EXCEPTION '[FALHA] payload nulo entrou';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
    VALUES ('n8n', 'evt-ruim-6', 'stats.consumer', 'null'::jsonb, repeat('ab', 32));
    RAISE EXCEPTION '[FALHA] payload JSON nulo entrou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
    VALUES ('n8n', 'evt-ruim-7', 'stats.consumer', '42'::jsonb, repeat('ab', 32));
    RAISE EXCEPTION '[FALHA] payload escalar entrou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- identidade em branco, contador negativo e algoritmo diferente de sha256
  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
    VALUES ('   ', 'evt-ruim-8', 'stats.consumer', '{}'::jsonb, repeat('ab', 32));
    RAISE EXCEPTION '[FALHA] origem em branco entrou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
    VALUES ('n8n', '', 'stats.consumer', '{}'::jsonb, repeat('ab', 32));
    RAISE EXCEPTION '[FALHA] event_id vazio entrou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
    VALUES ('n8n', 'evt-ruim-9', '', '{}'::jsonb, repeat('ab', 32));
    RAISE EXCEPTION '[FALHA] tipo vazio entrou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura, tentativas)
    VALUES ('n8n', 'evt-ruim-10', 'stats.consumer', '{}'::jsonb, repeat('ab', 32), -1);
    RAISE EXCEPTION '[FALHA] tentativas negativas entrou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura, algoritmo)
    VALUES ('n8n', 'evt-ruim-11', 'stats.consumer', '{}'::jsonb, repeat('ab', 32), 'sha512');
    RAISE EXCEPTION '[FALHA] algoritmo diferente de sha256 entrou';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- nada das linhas inválidas ficou gravada
  IF (SELECT count(*) FROM public.outbox_events WHERE event_id LIKE 'evt-ruim-%') <> 0 THEN
    RAISE EXCEPTION '[FALHA] alguma entrada invalida ficou gravada';
  END IF;

  -- e o que é válido entrou de verdade
  IF (SELECT count(*) FROM public.outbox_events) <> 4 THEN
    RAISE EXCEPTION '[FALHA] a outbox nao tem os 4 eventos validos';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- BLOCO 4 — authenticated: NÃO lê e NÃO escreve (papel real)
-- ---------------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_qtd int;
BEGIN
  BEGIN
    SELECT count(*) INTO v_qtd FROM public.outbox_events;
    IF v_qtd <> 0 THEN
      RAISE EXCEPTION '[FALHA] authenticated leu % linha(s) da outbox', v_qtd;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;  -- negado na trava de tabela: esperado
  END;

  BEGIN
    IF EXISTS (SELECT 1 FROM public.outbox_events WHERE event_id = 'evt-pendente-2') THEN
      RAISE EXCEPTION '[FALHA] authenticated viu o evento gravado pelo service_role';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
    VALUES ('authenticated', 'evt-proibido-1', 'stats.consumer', '{}'::jsonb, repeat('ab', 32));
    RAISE EXCEPTION '[FALHA] authenticated GRAVOU na outbox';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.outbox_events SET processed_at = now();
    RAISE EXCEPTION '[FALHA] authenticated deu baixa na outbox';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.outbox_events;
    RAISE EXCEPTION '[FALHA] authenticated apagou a outbox';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

-- ---------------------------------------------------------------------------
-- BLOCO 5 — anon: NÃO lê e NÃO escreve (papel real)
-- ---------------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;

DO $$
DECLARE
  v_qtd int;
BEGIN
  BEGIN
    SELECT count(*) INTO v_qtd FROM public.outbox_events;
    IF v_qtd <> 0 THEN
      RAISE EXCEPTION '[FALHA] anon leu % linha(s) da outbox', v_qtd;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.outbox_events (origem, event_id, tipo, payload, assinatura)
    VALUES ('anon', 'evt-proibido-2', 'stats.consumer', '{}'::jsonb, repeat('ab', 32));
    RAISE EXCEPTION '[FALHA] anon GRAVOU na outbox';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.outbox_events SET processed_at = now();
    RAISE EXCEPTION '[FALHA] anon deu baixa na outbox';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

-- ---------------------------------------------------------------------------
-- BLOCO 6 — o ROLLBACK da migration (linha 2 do arquivo) é EXECUTADO, não narrado:
-- `drop table` desfaz tabela, constraints, índice, policy, GRANTs e comentários.
-- ---------------------------------------------------------------------------
RESET ROLE;

DROP TABLE IF EXISTS public.outbox_events;

DO $$
BEGIN
  IF to_regclass('public.outbox_events') IS NOT NULL THEN
    RAISE EXCEPTION '[FALHA] o rollback da migration nao removeu public.outbox_events';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- BLOCO 7 — reaplicar a migration devolve exatamente o mesmo estado (idempotência
-- e ciclo rollback → reaplicação). Roda só quando a migration foi informada.
-- ---------------------------------------------------------------------------
\if :{?sem_migration}
\else
\i :mig

DO $$
BEGIN
  IF to_regclass('public.outbox_events') IS NULL THEN
    RAISE EXCEPTION '[FALHA] reaplicar a migration nao recriou public.outbox_events';
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.outbox_events'::regclass) THEN
    RAISE EXCEPTION '[FALHA] reaplicada, a RLS nao esta ligada';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.outbox_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.outbox_events', 'INSERT')
     OR has_table_privilege('anon', 'public.outbox_events', 'SELECT') THEN
    RAISE EXCEPTION '[FALHA] reaplicada, a ACL de tabela ficou diferente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.outbox_events'::regclass
                    AND conname = 'outbox_events_origem_event_id_unico') THEN
    RAISE EXCEPTION '[FALHA] reaplicada, falta a UNIQUE (origem, event_id)';
  END IF;
END
$$;
\endif

DO $$
BEGIN
  RAISE NOTICE 'ia_outbox_stats_hmac: SUITE VERDE — estrutura, escrita/leitura por service_role, negacao a authenticated/anon, entradas invalidas, idempotencia e rollback provados';
END
$$;

-- Nada fica no banco: a transação devolve o estado anterior (inclusive a tabela).
ROLLBACK;
