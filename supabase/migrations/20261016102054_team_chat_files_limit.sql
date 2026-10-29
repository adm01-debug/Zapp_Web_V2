-- team_chat_files_limit
-- Rollback: tira o teto de tamanho do bucket, devolvendo a coluna ao estado anterior (NULL), que e o que o replay completo das migrations reais deixa.
-- Rollback (SQL executavel, na ordem):
--   update storage.buckets set file_size_limit = null where id = 'team-chat-files';
--
-- Teto de tamanho do bucket `team-chat-files` no SERVIDOR (storage.buckets.file_size_limit)
-- — HZ5-10 / N-013.
--
-- DEFEITO. O bucket nasceu em 20260402132435 sem file_size_limit (o INSERT que o cria nao traz
-- a coluna) e a unica validacao viva e a do navegador: MAX_TEAM_CHAT_FILE_SIZE em
-- src/lib/teamChatRules.ts (10 * 1024 * 1024), usado por TeamFileUploader. A migration
-- 20260927270012 tentou fixar o teto com `INSERT ... ON CONFLICT (id) DO NOTHING`, mas o bucket
-- JA existia nessa altura: o INSERT foi ignorado e a coluna continuou NULL. Sem teto no
-- servidor, qualquer cliente autenticado sobe arquivo de qualquer tamanho por chamada direta a
-- API do Storage — fora do front, sem controle de custo. PROVA:
-- supabase/tests/team_chat_files_bucket_limit.sql; o bloco T1 (file_size_limit IS NULL) e o
-- vermelho ANTES desta migration e o verde DEPOIS.
--
-- ESCOPO. Um UPDATE idempotente de configuracao em UMA linha de storage.buckets. Nao cria, nao
-- apaga e nao altera coluna, tabela, policy, funcao, gatilho ou grant; nenhum papel/ACL muda.
-- `allowed_mime_types` do bucket NAO e tocado aqui: ele ja foi fixado em
-- 20260902100002_mime_restrictions_team_chat_files.sql, coerente com o `accept` do front
-- (image/*, video/*, audio/*, pdf, doc(x), xls(x), ppt(x), txt, csv, zip); o teste T4 garante
-- que ele segue preenchido. Sem funcao nesta migration, nao ha `SET search_path` a fixar nem
-- grant novo a declarar.
--
-- 10485760 (10 MB) e exatamente o teto que o front aplica em MAX_TEAM_CHAT_FILE_SIZE
-- (10 * 1024 * 1024): arquivo que o front aceita nao passa a ser recusado pelo Storage, e o
-- caminho direto (fora do front) para de aceitar tamanho ilimitado. O enforcement do valor e da
-- API do Storage (HTTP 413 na admissao; 200 dentro do teto); o Postgres apenas guarda o valor.

update storage.buckets
   set file_size_limit = 10485760
 where id = 'team-chat-files';
