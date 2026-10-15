Especialista: workersql

## O que mudou e por quê
- `supabase/migrations/20261013230003_log_audit_event_allowlist.sql` (veio do trabalho anterior, sem retoque): recria `public.log_audit_event` com ALLOWLIST (`login, logout, client_error, unauthorized_access, searchbox_session, searchbox_cost_guard, searchbox_budget_warning, searchbox_selected, location_sent, call_started, call_ended, gdpr_deletion_request`); fora da lista retorna neutro sem gravar. Guardas neutras: teto 4096 bytes em `p_details`, 60 eventos/min por usuário, `login` 1x/dia, `pg_advisory_xact_lock` por usuário. Só o corpo da função muda; sem RLS/policy/tabela.
- `supabase/tests/log_audit_event_allowlist.sql` (MEU diff: 3 linhas): A2/A3/A5 passam a chamar `pg_temp.cartao_conta(uid, ...)` esperando `OK / n=0` em vez de só `pg_temp.conta(...) = 0` (Ponto 1).
- `.tmp/relato.md`: este relato; primeira linha corrigida para o formato exigido (Ponto 3).

## Pontos da recusa
- Ponto 1: A2/A3/A5 só contavam (`pg_temp.conta`), sem chamar a RPC — corrigido em `supabase/tests/log_audit_event_allowlist.sql:119-126`, agora `pg_temp.cartao_conta(uid, 'settings_changed'|' '| 'xpto_qualquer')` esperando `OK / n=0`. Prova abaixo: vermelho contra a função antiga, verde contra a nova.
- Ponto 2: cabeçalho e relato afirmavam só o exercido — o cabeçalho da suíte (linhas 10-29) já diz que TODA escrita é exercida sob papel real e que A1..A5 chamam a RPC; o relato agora cita só comandos que rodei e cola as saídas reais (seção Prova). Nada aqui afirma teste que não rodei.
- Ponto 3: primeira linha agora é exatamente `Especialista: workersql` (era `Especialista: worker (sql) (area-sql-banco)`).

## Prova
Comandos reais (banco LOCAL; conjunto próprio `v2-26101304032a5b` não subiu — `zapp-db-local up` estourou 420 s com a máquina em load 32 e 21 stacks; rodei transacional com ROLLBACK num contêiner local existente `supabase-v2-base-596f08c8-...-database-...`, migration REAL aplicada dentro da transação, papéis reais via `SET LOCAL ROLE`; `select count(*) from audit_logs` = 32 antes e depois, nada persistiu):
- vermelho A2 (função antiga): `ERROR:  ALLOWLIST FALHOU [A2 settings_changed NAO grava]: esperado OK / n=0, obtido OK / n=1`
- vermelho A3 (função antiga): `ERROR:  ALLOWLIST FALHOU [A3 action vazia NAO grava]: esperado OK / n=0, obtido ERRO 23514 new row for relation "audit_logs" violates check constraint "audit_logs_action_not_empty" / n=0` (a antiga errava em vazio; a nova retorna neutro)
- vermelho A5 (função antiga): `ERROR:  ALLOWLIST FALHOU [A5 acao inventada NAO grava]: esperado OK / n=0, obtido OK / n=1`
- verde (migration nova + suíte completa): 26 `NOTICE: PASS`, zero `ERROR`, incluindo `PASS [A2 settings_changed NAO grava] -> OK / n=0`, `PASS [A3 action vazia NAO grava] -> OK / n=0`, `PASS [A5 acao inventada NAO grava] -> OK / n=0`, e `PASS [I1 depois do rollback a acao sensivel volta a gravar] -> OK / n=1` (bloco I executa o Rollback do cabeçalho e a transação termina em ROLLBACK).

## Arquivos (`git diff --name-only dia/2026-10-13...HEAD`, colado do comando)
.tmp/relato.md
supabase/migrations/20261013230003_log_audit_event_allowlist.sql
supabase/tests/log_audit_event_allowlist.sql

## O que NÃO fiz e por quê
- Não mexi em policy/RLS/tabela nem na migration: o furo é a RPC e o INSERT direto já é negado (blocos F1/F2 PASS com 42501).
- Não criei `scripts/db-audit/*.test.sh` (fora dos arquivos do cartão).
  REGISTRO PENDENTE: supabase/tests/log_audit_event_allowlist.sql
- Não toquei o front: ação nova fora da allowlist é ignorada até ser incluída (decisão do cartão).

CONCLUÍ: A2/A3/A5 exercem a RPC de verdade, vermelho→verde provado no banco local com papel real, rollback testado.
