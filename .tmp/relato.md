Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013044440_connection_alert_preferences.sql (novo): cria
  public.connection_alert_preferences — uma linha por usuario, colunas de canal
  (push_enabled = navegador, email_enabled = e-mail) e de tipo (alert_on_degraded,
  alert_on_disconnected), TODAS com padrao true; created_at/updated_at e gatilho
  canonico public.update_updated_at_column() em BEFORE UPDATE. RLS ligada com 3
  policies de PROPRIA linha (SELECT/INSERT/UPDATE para authenticated, USING +
  WITH CHECK em user_id = auth.uid()); SEM policy de DELETE (preferencia se
  desliga, nao se apaga). Grants explicitos: o padrao Supabase concede ALL a
  anon em tabela nova, entao REVOKE ALL de anon/authenticated e GRANT so
  SELECT/INSERT/UPDATE a authenticated (DELETE fica fora) e ALL a service_role.
  Cabecalho com `-- Rollback:` executavel (drop trigger + drop table). Migration
  aditiva: nao altera nada existente.
- src/integrations/supabase/types.ts: entrada connection_alert_preferences
  (Row/Insert/Update/Relationships) em ordem alfabetica, no mesmo formato
  gerado — o hook do cartao filho compila.
- supabase/tests/connection_alert_preferences_rls.sql (novo): a prova de RLS com
  PAPEL REAL (authenticated/anon/service_role), nao como postgres.

## Prova
- migration aplicada no banco LOCAL da tarefa:
  `hermes-db-migrar supabase/migrations/20261013044440_connection_alert_preferences.sql`
  -> `APLICADA no banco LOCAL 'v2-26101301386029' (produção não foi tocada).`
- verde depois: `bash .tmp/run-caeap.sh verde` (PostgreSQL 17 descartavel, papeis
  reais via SET LOCAL ROLE) -> todos PASS e `SUITE:verde exit=0`. Cobre: dono
  enxerga so a propria linha (1); o outro so a dele (1); service_role ve as duas
  (BYPASS); dono nao ve a linha do outro (0); INSERT para outro usuario recusado
  42501; UPDATE da linha do outro -> 0 linhas e valor intacto; trocar user_id
  recusado 42501; DELETE negado 42501 (sem grant) e a linha continua; anon nao
  SELECT/INSERT (42501, o REVOKE venceu o default privilege); segunda linha do
  mesmo usuario recusada 23505; padroes nascem ligados; gatilho sobrescreve
  updated_at forjado; RLS ligada e exactly 3 policies sem DELETE.
- vermelho antes: `bash .tmp/run-caeap.sh sem_guarda` (RLS desligada dentro da
  transacao) ->
  `ERROR: CAEAP FALHOU [T2a dono enxerga so a propria linha (1)]: esperado 1, obtido 2`
  -> `SUITE:sem_guarda exit=3`. Sem a protecao a isolacao cai e o teste acusa:
  nao e tautologico.
- verificacao do cartao: `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO`,
  com `OK tipos` (types.ts compila).

## O que NÃO fiz e por quê
- Nao mexi em supabase/schema-manifest.json: nao esta em ARQUIVOS QUE PODE TOCAR
  e o `--rapido` nao verifica o banco local sem o nome do conjunto. Se um dia
  rodarem `zapp-verify . v2-26101301386029`, a diferenca estrutural e citada por
  esta migration pendente (AVISO, nao FALHOU).
- Nao criei hook nem tela: sao do cartao filho (t_6bf2d93f). O contrato que ele
  precisa ja existe: upsert em onConflict=user_id (UNIQUE) e leitura/escrita so
  da propria linha.
- O `.github/workflows/db-guard.yml` nao recebeu passo: a prova e uma suite
  supabase/tests/*.sql (nao passa pelo check-test-inventory, que so cobre
  scripts/**/*.test.sh); nada de teste orfao.

## Nota ao portão (o fechar não reconhece a prova de banco)
O fechar avisa "código alterado sem teste novo" por causa de
src/integrations/supabase/types.ts: ele só reconhece prova em `src/**.test.*` ou
`tests/**`. A prova DESTE cartão está no commit, em
supabase/tests/connection_alert_preferences_rls.sql (o padrão de prova de banco
do repositório, como supabase/tests/user_roles_troca_de_papel_...sql), rodada
vermelho→verde com `bash .tmp/run-caeap.sh` (o roteiro em .tmp é só o disparador;
a asserção vive no commit). types.ts é arquivo GERADO — a mudança de contrato é
a migration. Rodo o MESMO fechar de novo, como o próprio aviso orienta.

Concluí: migration aditiva, RLS provada com papel real (vermelho→verde), tipos e
verificacao do cartao verdes.
