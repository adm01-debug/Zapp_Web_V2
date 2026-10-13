Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261013160000_instance_pause_investigation.sql` (aditiva): as 3 colunas pedidas em `public.instance_pauses` (`investigated_at`, `investigated_by` FK→profiles, `investigation_notes` com limite de 1000 e sem HTML — CHECK no BANCO, não só na função), o consistente `(investigated_at IS NULL) = (investigated_by IS NULL)`, e as 2 RPCs:
  - `mark_pause_investigated(p_pause_id, p_notes)`: só admin/supervisor (nega por padrão → 42501), grava ator (perfil, mesma FK de `paused_by`) + data, valida a nota ANTES de qualquer efeito (22023) e deixa UMA linha em `public.audit_logs`. A auditoria não é reescrita (`COALESCE`): o primeiro ator/data congelam e as notas não são copiadas para o audit_logs.
  - `instance_auth_event_series(p_window DEFAULT '24h')`: '24h' → baldes de 1 hora, '7d' → 1 dia; só admin/supervisor; janela NULL/inválida → 22023.
- `supabase/tests/instance_pause_investigation.sql`: prova em Postgres real, com papel real, grupos T1..T10 (investigação com ator e trilha; negado sem efeito; validação + CHECKs; pausa inexistente; a 2ª chamada não reescreve o ator; supervisor; séries 24h/7d; agregado sem dado pessoal; RLS/ACL; rollback).
- `src/integrations/supabase/types.ts`: as 3 colunas (Row/Insert/Update + a FK nova) e as 2 funções — os RETURNS mudaram, os types vão junto.

Fonte da série (decisão): o V2 não tem tabela de eventos de auth, mas o watchdog `connection-health-check` JÁ grava em `public.connection_health_logs` uma linha por conexão a cada verificação — `no_credentials` quando a Evolution devolve 401/403, `error`/`timeout`/`disconnected` nas demais falhas. A RPC agrega essa tabela; não criei tabela nem appender novos (seria fachada: ninguém escreveria neles). Por isso a coluna é `auth_failures`: a origem separa 401/403 do resto, mas não um do outro. O retorno é só contagem por instância (`bucket, instance, auth_failures, disconnected, errors, total`) — sem error_message, IP, telefone ou identificação de pessoa.

## Prova
- vermelho antes (suite rodada com o schema anterior à migration): `zapp-db-local psql . v2-26101315358410 -v ON_ERROR_STOP=1 < supabase/tests/instance_pause_investigation.sql` → `ERROR: T1 FALHOU: admin deveria investigar a pausa, mas deu erro [42883] function public.mark_pause_investigated(uuid, unknown) does not exist`
- verde depois (mesmo comando): `NOTICE:  instance_pause_investigation: T1..T9 OK — 10 grupo(s)` e `NOTICE:  instance_pause_investigation: suite OK — T1..T10 (investigacao com ator, negado sem efeito, validacao, pausa inexistente, idempotencia, supervisor, serie 24h, serie 7d, so agregado, RLS/ACL, rollback)`
- migration: `hermes-db-migrar supabase/migrations/20261013160000_instance_pause_investigation.sql` → `APLICADA no banco LOCAL 'v2-26101315358410' (produção não foi tocada)`; reapliquei o mesmo arquivo (`zapp-db-local psql .`) sem erro → a migration é idempotente.
- rollback de verdade: o T10 executa o bloco `-- Rollback:` copiado do arquivo contra o schema real, confere que as 2 funções, as 3 colunas e os 3 CHECKs somem, e `ROLLBACK TO SAVEPOINT` restaura.
- efeitos colaterais conferidos: `pg_trigger` em `public.instance_pauses` e `public.audit_logs` → 0 (nenhum gatilho dispara no UPDATE/INSERT); nenhum GRANT, RLS ou papel preexistente foi tocado (os REVOKE/GRANT são só nas 2 funções novas).

## Contrato para os filhos do IP2 (tela)
- série: `instance_auth_event_series(p_window)` → linhas `{bucket, instance, auth_failures, disconnected, errors, total}`.
- investigação: `mark_pause_investigated(p_pause_id, p_notes)` → `{id, instance, investigated_at, investigated_by, investigation_notes, ja_investigada}`.

## O que NÃO fiz e por quê
- Sem tabela/appender novos de auth (a fonte real já existe no watchdog); não editei `schema-manifest.json`/`schema-catalog.json` (regenerados pelo sync).
- Este workspace carrega a faixa do IP1 por cherry-pick (`chore(db): traz faixa do IP1...`): a branch do dia ainda não tinha as pausas; os arquivos do IP1 estão no diff, mas não são desta entrega.
- O juiz avisou "código alterado sem teste novo (`types.ts`)": o teste desta entrega é a suíte SQL `supabase/tests/instance_pause_investigation.sql`, que não casa com o padrão de nome de teste do juiz; os types foram tipados no mesmo escopo — nada a corrigir.
