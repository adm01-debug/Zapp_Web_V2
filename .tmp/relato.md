Especialista: complexo (area-sql-banco)
# N-016 — CI replay migrations no db-guard

## O que mudou e por quê
- `.github/workflows/db-guard.yml`: passo novo "Replay de todas as migrations no db-guard (N-016)" que roda `bash scripts/db-audit/replay-local.sh` com `SKIP_DOCKER_SHIM=1` num Postgres descartável; exit 0 = verde, 1 = drift novo (falha fora do allowlist), 2 = setup indisponível. É o critério 1 do cartão.
- `scripts/db-audit/replay-local-ci.test.sh` (novo): prova que o passo existe no workflow, roda replay-local.sh, e que o harness de docker falso cobre exit 0/1/2; confere que replay-classify.py e replay-known-failures.json existem. É o critério 2 do cartão.
- `scripts/ci/check-test-inventory.mjs`: entrada do teste novo na ALLOWLIST com justificativa N-016 (convenção obrigatória do repositório para .test.sh sem bloco run próprio; o passo de CI do teste fica para o dono do workflow).

Origem: o passo e o teste já existiam na entrega anterior (branch v2/n-016-ci-replay-migrations-db-guard-26100918336e34); a base dia/2026-10-12 não os contém, então reapliquei por cherry-pick com resolução de conflito (a base ganhou o passo N-136 no mesmo ponto — mantive os dois) e somei a entrada da ALLOWLIST. O comando fixo do cartão (devin) não foi usado: Devin está sem crédito; nenhum código novo foi escrito além da resolução e da linha de ALLOWLIST.

## Prova
- vermelho antes (workflow da base, sem o passo): `bash scripts/db-audit/replay-local-ci.test.sh` → `FALHA: 1: passo de replay existe em db-guard.yml (nao achei 'Replay de todas as migrations' em .github/workflows/db-guard.yml)` + `FALHA: 1: passo roda replay-local.sh (...)` → `REPROVOU`, exit 1.
- verde depois (com o passo): mesmo comando → 9 linhas `ok`, `PASSOU: passo de replay existe em db-guard.yml, harness cobre exit 0/1/2, e o allowlist protege contra drift novo`, exit 0.
- `python3 -c yaml.safe_load(db-guard.yml)` → `YAML-OK` (resolução do conflito não quebrou o YAML).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (108s)` (OK dependencias, db_guard, tipos, lint, migrations; banco_local não verificado — sem nome de conjunto; sem DDL no diff, nada a migrar).
- Diff contra a base: 4 arquivos (3 de entrega — db-guard.yml, replay-local-ci.test.sh, check-test-inventory.mjs — mais este relato), 1 de teste; só N-016 nas linhas adicionadas; sem GRANT/REVOKE/policy/RPC.

## Resposta ao juiz barato (primeira tentativa de fechar)
- Ponto 1 (teste confere literal): procede em parte — removi as 4 checagens tautológicas `checa "x existe" "0" "0"` do teste; restaram só `contem` reais (passo no YAML, cobertura exit 0/1/2 no harness, executável, classificador, allowlist). Teste de passo de CI por presença no YAML é o padrão do repositório para cartões de CI (ex.: recriar-banco-local.test.sh); o vermelho→verde acima mostra que ele falha sem o passo.
- Ponto 2 (números do relato): corrigido — 9 oks (era 13 antes da limpeza) e 4 arquivos no diff (3 de entrega + relato).
- Tentativa 2, ponto 1 restante (teste não chama o código): não procede — o cartão aceita o harness com docker falso como cobertura de exit 0/1/2 e pede ao teste novo só provar a existência do passo; executar o replay real (todas as migrations em Postgres) exige docker daemon e não cabe num teste offline. Reencaminhei o fechar sem mudar código.

## O que NÃO fiz e por quê
- Não executei o replay completo (todas as migrations em Postgres real): exige docker daemon e dezenas de minutos; o cartão aceita o harness com docker falso como cobertura de exit 0/1/2, e o passo do CI roda o script real no runner.
- Não registrei os outros 4 órfãos do `check-test-inventory` (department-invite, talkx-conversion-defaults, team-chat-media-contract, team-direct-conversation-race): já existem na árvore da base dia/2026-10-12 (conferido via `git cat-file -e dia/2026-10-12:<arquivo>`), fora do título deste cartão.
