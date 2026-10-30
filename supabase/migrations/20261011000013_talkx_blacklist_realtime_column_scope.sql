-- talkx_blacklist_realtime_column_scope
-- Rollback: alter publication supabase_realtime drop table public.talkx_blacklist;
--   alter publication supabase_realtime drop table public.talkx_blacklist;
--
-- Nota de rollback: retira public.talkx_blacklist da publicacao supabase_realtime, devolvendo o
-- estado anterior (tabela NAO publicada). Nenhuma outra mudanca e desfeita porque
-- a migration nao altera tabela, policy, GRANT nem dado.
-- `alter publication ... drop table` nao aceita IF EXISTS: o rollback pressupoe
-- a tabela publicada (estado pos-migration, o mesmo em que o caso (6) o executa).
--
-- X069p1 / Realtime: a lista de supressao (public.talkx_blacklist) precisa atualizar as
-- telas abertas quando um telefone entra ou sai da lista. Para isso ela passa a integrar a
-- publicacao supabase_realtime — mas a tabela guarda o TELEFONE do contato em
-- talkx_blacklist.phone, e a policy de SELECT da tabela e USING (true) para authenticated:
-- publicar a tabela SEM lista de colunas entregaria o telefone no payload do Realtime a
-- qualquer sessao autenticada. Por isso a publicacao entra com LISTA MINIMA DE COLUNAS:
-- so (id, contact_id) — exatamente o que a tela usa para reagir — e NADA alem disso
-- trafega no evento: nem `phone`, nem os metadados que a tela nao consome (reason,
-- blocked_by, created_at, removed_by, removed_at, origin, campaign_id, reason_code,
-- expires_at, source_message_id).
--
-- Fechado por padrao: id e contact_id existem desde a DDL original da tabela, e o
-- `add table (...)` abaixo FALHA ALTO se um nome da lista deixar de existir — deriva de
-- DDL vira erro, nao silencio. Se uma DDL futura adicionar coluna que a tela passe a
-- precisar, uma NOVA migration (revisada) estende a lista; coluna nova nunca entra sozinha.
--
-- Forma guardada (idempotente): se a publicacao nao existir, nada acontece; se a tabela ja
-- estiver publicada (com lista antiga), ela e retirada e readicionada com a lista correta.
-- Um `alter publication ... add table` direto, como em outras migrations do repo, falharia
-- em replay com "is already member of publication" (42710).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'talkx_blacklist'
    ) then
      execute 'alter publication supabase_realtime drop table public.talkx_blacklist';
    end if;
    execute 'alter publication supabase_realtime add table public.talkx_blacklist (id, contact_id)';
  end if;
end $$;
