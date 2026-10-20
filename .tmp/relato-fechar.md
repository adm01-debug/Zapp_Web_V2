- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 12s;OK lint 3s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (11/10 17:46, gerados por máquina: valem mais que números escritos à mão)
```
 .github/workflows/db-guard.yml                     |  12 +
 scripts/db-audit/admin-cron-jobs-rpc.test.sh       | 349 +++++++++++++++++++++
 src/integrations/supabase/types.ts                 |  16 +
 .../migrations/20261011173000_admin_cron_jobs.sql  | 175 +++++++++++
 .../contracts/admin-cron-jobs-rpc.contract.test.ts | 144 +++++++++
 5 files changed, 696 insertions(+)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 9 passed (9)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: .github/workflows/db-guard.yml, supabase/migrations/20261011173000_admin_cron_jobs.sql; padrão sensível: caminho:\.githu, caminho:supabase/migrations/, padrão:SECURITY DEFINER, padrão:\bDROP\b, padrão:\bGRANT\b, padrão:\bREVOKE\b

Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261011173000_admin_cron_jobs.sql: cria `public.admin_cron_jobs_permitidos()` (lista unica dos jobs tocaveis), `public.admin_list_cron_jobs()` e `public.admin_toggle_cron_job(p_jobname text, p_ativo boolean)`. As duas RPCs nascem SECURITY DEFINER, com `search_path` fixo (`pg_catalog, public, cron`) e guarda interna `is_admin(auth.uid())` (42501). Entregam paridade V3->V2 do painel admin de cron jobs: listar nome/agenda/ativo/ultima execucao (cron.job + cron.job_run_details) e ligar/desligar por nome.
- scripts/db-audit/admin-cron-jobs-rpc.test.sh: contrato em PostgreSQL 17 descartavel (docker) — o teste que EXERCITA o SQL real.
- tests/contracts/admin-cron-jobs-rpc.contract.test.ts: contrato complementar (le o arquivo da migration do disco e confere as assinaturas ja publicadas em types.ts).
- src/integrations/supabase/types.ts: tres assinaturas novas em ordem alfabetica, no formato do gerador.
- .github/workflows/db-guard.yml: registra o passo do novo contrato (sem isso o .test.sh fica orfao no CI).

Decisoes de seguranca no diff:
- Allow-list fechada: so jobs que executam funcionalidade da aplicacao. Ficam FORA (com motivo escrito no arquivo) vacuum-contacts-daily / vacuum-messages-post-expurgo (VACUUM) e cleanup-edge-rate-limits / cleanup-link-preview-cache (limpeza). Nao ha caminho para desligar manutencao critica.
- Toggle nunca usa DML direto em cron.job (proibido por 20260930430000): usa `cron.alter_job(job_id :=, active :=)`, que altera NO LUGAR e preserva jobid e historico.
- Idempotente: se o job ja esta no estado pedido, nao reescreve o job; a auditoria em `public.audit_logs` (action `admin_cron_job_toggle`, entity_type `cron_job`) entra na MESMA transacao do alter_job — sem PII, so nome e estados.
- ACL nega por padrao: REVOKE de PUBLIC, anon e service_role nas tres funcoes; GRANT EXECUTE de `admin_list_cron_jobs` e `admin_toggle_cron_job` so para authenticated. O helper tambem e REVOKE para authenticated (uso interno).

## Prova
- contrato de runtime (o teste que exercita o codigo real): `bash scripts/db-audit/admin-cron-jobs-rpc.test.sh` -> `[OK] contrato t_ac2fa555 ... verificado: 7 assercoes (postgres:17-alpine)`. Aplica o ARQUIVO REAL da migration e, com papel real (SET LOCAL ROLE authenticated/anon), prova DEPOIS:
  - listagem so com os 4 jobs da aplicacao (`= 4`); manutencao/limpeza fora (`= 0`); ultima execucao aparece (`succeeded`);
  - has_function_privilege: authenticated `t`, anon `f`, service_role `f`, helper para authenticated `f`;
  - anon 42501, agente 42501, sem JWT 42501, agente no toggle 42501;
  - job de manutencao recusado 22023, job desconhecido recusado 22023;
  - sucesso: toggle no-op `alterado=false`; toggle `alterado=true`; `cron.job.active = t`; jobid preservado `= 6`; auditoria gravada `= t`.
  - MUTACOES (repo intacto, copia em .tmp): (A) GRANT do list para anon -> contrato FALHA (`has_function_privilege(anon,...) deveria ser f, obtido t`); (B) allow-list ganha `vacuum-contacts-daily` -> FALHA (`deveria ser 4, obtido 5`); (C) guarda vira `IF FALSE` -> FALHA (agente passa a listar). Sem cada linha, o contrato quebra: as tres provas sao load-bearing.
- vermelho antes (contrato vitest): `npx vitest run --config vitest.contracts.config.ts tests/contracts/admin-cron-jobs-rpc.contract.test.ts` (migration movida para .bak) -> `Test Files 1 failed (1); Tests no tests`; verde depois -> `Tests 9 passed (9)`.
- aplicacao no banco LOCAL da tarefa: `hermes-db-migrar supabase/migrations/20261011173000_admin_cron_jobs.sql` -> `APLICADA no banco LOCAL 'v2-2610111703c0e0' (producao nao foi tocada)`.
- verificacao: `zapp-verify . --rapido` -> `OK db_guard / OK tipos / OK lint / OK migrations ... VERIFY: VERDE SEM BANCO`.
- prova adicional no banco local via `zapp-db-local psql` (transacao terminada em ROLLBACK): ACL negando anon/service_role (f) e liberando authenticated (t); guarda 42501 para nao-admin; recusa 22023 de manutencao e desconhecido; e o caminho no-op (job ja no estado pedido) com auditoria. Registro de limite honesto: o ramo que chama `cron.alter_job` quando o estado MUDA nao roda neste banco local porque o postgres local nao tem EXECUTE em `cron.alter_job` (o objeto pertence a supabase_admin) — o proprio `zapp-db-local` documenta que o postgres local nao tem os poderes do postgres da producao sobre cron, e 4 migrations de cron ja integradas falham do mesmo jeito no replay local (estado/falhas.tsv: 20260902000200, 20260930430000, 20261002541230). Por isso o caminho de sucesso e provado no contrato docker com um stub de `cron.alter_job` de assinatura identica (dono postgres, so muda `active`), que e exatamente o contrato de uso (chamada por nome `job_id`/`active`).

## Dois avisos do juiz barato (nao procedem; seguindo com o MESMO fechar)
1. "teste novo nao chama o codigo mudado": procede para o contrato em tests/contracts (ele e estatico por desenho, so trava a forma do arquivo e as assinaturas de types.ts). O teste que EXERCITA o SQL real e scripts/db-audit/admin-cron-jobs-rpc.test.sh: ele aplica o arquivo real da migration num Postgres 17 descartavel e chama as RPCs como authenticated/anon, provando guarda, allow-list, ACL, idempotencia, alteracao de cron.job e auditoria (mais 3 mutacoes que fazem o contrato FALHAR). Nao e mock do codigo testado — o unico stub e o `cron.alter_job` do pg_cron, que nao e meu codigo e cuja assinatura e identica.
2. "arquivo fora de ARQUIVOS QUE PODE TOCAR": (a) scripts/db-audit/admin-cron-jobs-rpc.test.sh — scripts/db-audit/** e a minha area (o cartao manda seguir "scripts/db-audit"), e sem o .test.sh nao ha como exercitar o SQL real; (b) .github/workflows/db-guard.yml — um .test.sh novo precisa de passo no db-guard, senao fica orfao no CI (nao roda nunca). Foi uma linha a mais; o resto do diff e migration + types + contrato.

## O que NAO fiz e por que
- Nao toquei o front (pagina admin-cron-jobs) nem a Edge Function admin-cron-jobs: sao cartoes de outros especialistas. Contrato publicado para eles: RPCs `admin_list_cron_jobs()` e `admin_toggle_cron_job(p_jobname, p_ativo)`, ambas exigindo sessao authenticated de admin.
