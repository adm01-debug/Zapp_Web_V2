-- Teto de tamanho do bucket `team-chat-files` no SERVIDOR, na coluna
-- `storage.buckets.file_size_limit` (cartao HZ5-10 / N-013).
-- Arquivo PROVA da migration supabase/migrations/20261016102054_team_chat_files_limit.sql.
--
-- DEFEITO. O bucket nasceu em 20260402132435 sem teto de tamanho e a unica validacao viva
-- era a do navegador (`MAX_TEAM_CHAT_FILE_SIZE` em src/lib/teamChatRules.ts, usado por
-- TeamFileUploader). A 20260927270012 tentou fixar o teto com
-- `INSERT ... ON CONFLICT (id) DO NOTHING`, mas o bucket JA existia nessa altura: o INSERT
-- foi ignorado e a coluna ficou NULL. Com NULL nao ha teto — qualquer cliente autenticado
-- sobe arquivo de qualquer tamanho por chamada direta a API do Storage, sem controle de custo.
--
-- COMO E EXECUTADO (banco descartavel local, nunca producao):
--   zapp-db-local psql . <conjunto> < supabase/tests/team_chat_files_bucket_limit.sql
-- O runner aplica as MIGRATIONS REAIS da copia antes de rodar: sem a migration deste cartao
-- o bloco T1 abaixo e o vermelho (a coluna fica NULL).
--
-- O QUE A COLUNA SIGNIFICA. `file_size_limit` NULL = sem teto; o valor e conferido na
-- ADMISSAO pela API do Storage (HTTP 413 quando size > file_size_limit; aceita quando
-- size <= limite). O Postgres nao guarda o tamanho do objeto (ele vive em
-- `storage.objects.metadata->>'size'`) e nao existe CHECK de tamanho, entao T2/T3 sao a
-- MESMA regra de admissao avaliada contra o valor REAL da linha do bucket — o comportamento
-- da API (413 acima do teto, 200 dentro) e provado por HTTP na API local no relato do cartao.
DO $$
DECLARE
  v_public boolean;
  v_limit  bigint;
  v_tam    bigint;
BEGIN
  -- T0 (guarda de regressao): o bucket existe e segue privado (20260402214625 / 20260511233306).
  SELECT public, file_size_limit
    INTO v_public, v_limit
    FROM storage.buckets
   WHERE id = 'team-chat-files';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HZ5-10 T0 FALHOU: bucket team-chat-files nao existe';
  END IF;
  IF v_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'HZ5-10 T0 FALHOU: bucket team-chat-files voltou a public=%', v_public;
  END IF;
  RAISE NOTICE 'HZ5-10: T0 ok (bucket existe e segue privado)';

  -- T1 (o defeito): teto definido NO SERVIDOR, igual ao teto do front.
  --     Sem a migration a coluna e NULL -> este bloco e o vermelho.
  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'HZ5-10 T1 FALHOU: bucket sem file_size_limit no banco (NULL) — qualquer tamanho passa direto no Storage';
  END IF;
  IF v_limit <> 10485760 THEN
    RAISE EXCEPTION 'HZ5-10 T1 FALHOU: file_size_limit=% nao bate com MAX_TEAM_CHAT_FILE_SIZE do front (10485760)', v_limit;
  END IF;
  RAISE NOTICE 'HZ5-10: T1 ok (file_size_limit=10485760, igual ao front)';

  -- T4 (guarda de regressao): a allowlist de MIME do bucket (20260902100002) segue no lugar —
  --     coerente com o `accept` do front. Esta migration NAO mexe nela.
  IF (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'team-chat-files') IS NULL THEN
    RAISE EXCEPTION 'HZ5-10 T4 FALHOU: allowed_mime_types voltou a NULL no bucket team-chat-files';
  END IF;
  IF NOT (SELECT allowed_mime_types @> ARRAY['image/jpeg', 'application/pdf']
            FROM storage.buckets WHERE id = 'team-chat-files') THEN
    RAISE EXCEPTION 'HZ5-10 T4 FALHOU: allowed_mime_types perdeu MIME que o front aceita';
  END IF;
  RAISE NOTICE 'HZ5-10: T4 ok (allowlist de MIME do bucket segue preenchida)';

  -- T2 (ACEITA): dentro do teto a API do Storage admite — 1 byte e exatamente 10 MB.
  FOREACH v_tam IN ARRAY ARRAY[1::bigint, 10485760::bigint] LOOP
    IF v_tam > v_limit THEN
      RAISE EXCEPTION 'HZ5-10 T2 FALHOU: tamanho % deveria ser ACEITO (limite=%)', v_tam, v_limit;
    END IF;
  END LOOP;
  RAISE NOTICE 'HZ5-10: T2 ok (1 B e 10 MB dentro do teto sao admitidos)';

  -- T3 (RECUSA): acima do teto a API do Storage recusa na admissao (HTTP 413) —
  --     10 MB + 1, 11 MB e os 50 MB que a 20260927270012 tentou aplicar sem efeito.
  FOREACH v_tam IN ARRAY ARRAY[10485761::bigint, 11534336::bigint, 52428800::bigint] LOOP
    IF v_tam <= v_limit THEN
      RAISE EXCEPTION 'HZ5-10 T3 FALHOU: tamanho % deveria ser RECUSADO (limite=%)', v_tam, v_limit;
    END IF;
  END LOOP;
  RAISE NOTICE 'HZ5-10: T3 ok (10 MB+1, 11 MB e 50 MB sao recusados)';

  RAISE NOTICE 'HZ5-10: TODAS AS ASSERCOES OK';
END $$;
