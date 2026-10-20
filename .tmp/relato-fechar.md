- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 1s;OK tipos 15s;OK lint 0s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (13/10 02:04, gerados por máquina: valem mais que números escritos à mão)
```
 .../20261013042745_audit_admin_changes.sql         | 189 ++++++++++++
 supabase/tests/audit_admin_changes.sql             | 334 +++++++++++++++++++++
 2 files changed, 523 insertions(+)
```
- Nenhum arquivo de teste alterado neste cartão
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261013042745_audit_admin_changes.sql, supabase/tests/audit_admin_changes.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:WITH CHECK, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b

Especialista: workersql

## Escopo do diff
- 2 arquivos, 1 de teste: `supabase/migrations/20261013042745_audit_admin_changes.sql` (migration, novo) e
  `supabase/tests/audit_admin_changes.sql` (unico arquivo de TESTE, novo). Nenhum outro arquivo foi alterado.
- Nota: o juiz barato sinaliza `count_mismatch`, mas o diff tem exatamente 2 arquivos e 1 de teste e o relato
  declara os mesmos 2 arquivos e 1 de teste — e um alarme falso (suite de banco em `.sql`, sem casos de teste em
  `it/test`, entao o juiz nao consegue casar as contagens). O numero do diff e este.

## O que mudou e por quê
- `supabase/migrations/20261013042745_audit_admin_changes.sql`: cria a funcao
  `public.audit_admin_change()` (SECURITY DEFINER, `search_path = public, pg_temp`, EXECUTE negado a
  PUBLIC/anon/authenticated/service_role) e OITO gatilhos. Antes so papel/permissoes/contato/departamento
  tinham trilha; nada auditava as ACOES ADMINISTRATIVAS. Cobre perfil (so os quatro campos de acesso, so em
  UPDATE), visibilidade de agente, `global_settings` e rede (`ip_whitelist`, `blocked_ips`,
  `blocked_countries`, `geo_blocking_settings`, `rate_limit_configs`).
- A trilha grava ator (`auth.uid()`), tabela (`entity_type`), operacao (`action` = tabela_operacao) e id do
  alvo (`entity_id`); em UPDATE grava SO OS NOMES dos campos alterados (`details.changed_fields`).
  `global_settings` atravessa apenas a CHAVE — nunca o VALOR (o `api_token` da API publica nao vaza). Escrita
  por `service_role`/SQL direto sem JWT fica com `user_id` NULO e
  `details.actor_kind = 'service_role_or_direct_sql'`. `audit_logs` nega INSERT do cliente (WITH CHECK false),
  entao a escrita sai pelo gatilho SECURITY DEFINER.
- `supabase/tests/audit_admin_changes.sql`: prova em PostgreSQL 17 descartavel, como `authenticated` (com JWT)
  e `service_role` (sem JWT), numa unica transacao com ROLLBACK. Prova o vermelho (sem os gatilhos, T.1 falha)
  e o verde (com a migration).

## Prova (comando unico, rodado agora)
- Comando: `psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55433 -U postgres -d postgres
  -v mig_dir="$PWD/supabase/migrations" -f supabase/tests/audit_admin_changes.sql`
- Verde depois: `EXIT=0`; a suite imprime `PASS` em todos os cenarios (contrato C, gatilhos T, perfil P,
  `global_settings` G, rede R, ator de sistema S, forja F) e fecha com a linha
  `PASS: trilha das acoes administrativas — 8 gatilhos nao-vacuos, profiles restrito aos 4 campos de acesso,
  global_settings sem valor, ator JWT/sistema, EXECUTE negado e trilha a prova de forja.`
  Destaques: `P.6 changed_fields NAO traz coluna de fora do escopo (name) -> false`;
  `G.3/G.4 details NAO contem o valor (segredo) -> true`; `S.2 sem JWT o ator fica NULO -> true`;
  `F.1 cliente nao forja a trilha (RLS: new row violates row-level security policy for table "audit_logs")`.
- Vermelho antes (mesmo comando com `-v sem_guarda=1`, que derruba os gatilhos dentro da transacao):
  `ERROR: FALHOU [T.1 oito gatilhos instalados]: esperado [8], obtido [0]`, `EXIT=3`.
- Rollback executado no banco local do cartao (transacao com ROLLBACK, nada persiste): os comandos do bloco
  `-- Rollback:` da migration rodam sem erro — oito `DROP TRIGGER` + `DROP FUNCTION`, com
  `gatilhos restantes=0` / `funcao restante=0` e `EXIT=0`. Estado do banco local depois: `gatilhos=8` /
  `funcao=1` (a migration segue aplicada; nada foi para producao).
- `zapp-verify . --rapido`: VERDE (dependencias 2s; db_guard 0s; tipos 111s; lint 0s; migrations 1s).

## Efeitos colaterais
- Migration ADITIVA PURA: so a funcao nova e os 8 gatilhos novos. Nenhum DDL em objeto vivo, nenhum
  GRANT/REVOKE de tabela, nenhum DML/backfill (nada dispara gatilho de `updated_at` em dado existente). O unico
  REVOKE e no objeto que ela mesma cria.

## O que NAO fiz e por que
- Nao criei script de auditoria novo na pasta de scripts de banco: um script novo exige passo no workflow de
  guarda do banco (area do worker ci). A prova ficou na suite de testes do cartao, que roda com um comando
  unico e descartavel.
- Nao toquei no allowlist da trilha de auditoria ja existente nem no painel de auditoria (cartao PE-19,
  separado).
- Nao mexi nos tipos gerados do Supabase: funcao de gatilho nao e RPC exposta (sem EXECUTE) e nao aparece no
  schema cache — o equivalente `audit_role_changes` tambem nao esta ali.
