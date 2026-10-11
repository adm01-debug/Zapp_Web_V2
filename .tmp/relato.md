Especialista: senior (ci/guarda + banco; sem skill de área dedicada — o cartão traz a causa e a receita)

## O que mudou e por quê
- `.github/workflows/db-guard.yml`: etapa nova "Simular pedido anônimo de recuperação de senha (item 72)" que executa o teste da entrega via `retry-disposable-postgres-test.sh`, com `RECUPERACAO_ANONIMA_TEST_POSTGRES_IMAGE` vinda de `env.POSTGRES_TEST_IMAGE` (padrão das demais etapas; sem `SKIP_DOCKER_SHIM` porque o teste usa só `docker run/exec/rm` + psql num único banco, sem `docker logs` nem asserção de `current_database`). É a causa do vermelho: a entrega trouxe o `.test.sh` sem o registro no CI.
- `scripts/db-audit/recuperacao-anonima-pedido-reset.test.sh` + `supabase/migrations/20261006221242_recuperacao_anonima_pedido_reset.sql`: trazidos da entrega recusada (`abb0d3116`) por `cherry-pick -n`, sem alteração — são o conteúdo do título do cartão.

## Prova
- vermelho antes (só com o cherry-pick, sem a etapa): `node scripts/ci/check-test-inventory.mjs` → `check-test-inventory: FALHOU — testes no disco sem correspondente no CI YAML: scripts/db-audit/recuperacao-anonima-pedido-reset.test.sh (não encontrado em db-guard.yml). Total: 1 teste(s) órfão(s).`
- verde depois (com a etapa): `node scripts/ci/check-test-inventory.mjs` → `check-test-inventory: OK — ci.yml usa glob (supabase/functions/**/*.test.ts); 149 suite(s) Node cobertas por bloco run: (8 na allowlist); .test.sh verificados individualmente`
- a etapa registrada executa de verdade (mesmo comando do YAML, imagem fixada do `env.POSTGRES_TEST_IMAGE`): `bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/recuperacao-anonima-pedido-reset.test.sh` → blocos A e B todos `[PASS]`, linha final `PASS: R2-AUTH-006 — o pedido anonimo de recuperacao persiste como solicitacao pendente ...`
- `python3 -c yaml.safe_load(db-guard.yml)` → `YAML valido`

## Pontos do revisor
- Ponto 1 (o órfão que quebra o ESPELHO DO CI quando empilhado): resolvido — o caminho `scripts/db-audit/recuperacao-anonima-pedido-reset.test.sh` agora aparece num bloco `run:` real do `db-guard.yml`, que é exatamente o que a regex do inventário procura; inventário verde acima. Não usei ALLOWLIST (seria afrouxar a asserção) nem comentário citando o caminho (o inventário conta, mas o teste não rodaria — maquiar o espelho, vedado pelo cartão).
- Ponto 2 (instrução de reproduzir sobre a ponta atual com cherry-pick): cumprido — `cherry-pick -n abb0d3116` sobre a ponta de `dia/2026-10-11`, vermelho reproduzido antes da correção.
- Ponto 3 (higiene: inventário verde, sem defeito novo, só arquivos do título, comandos verificados): cumprido — inventário verde acima; a etapa nova usa a mesma receita das outras 100+ etapas (harness + imagem fixada + nome de var que o teste lê), e o teste foi executado de verdade pelo mesmo comando (todos os `[PASS]`, `PASS: R2-AUTH-006`); o diff contra a base tem só os 3 arquivos do título (teste + migration da entrega, inalterados, + 8 linhas no `db-guard.yml`); YAML válido; segunda passada sem defeito novo (nenhum chamador além do workflow; sem `SKIP_DOCKER_SHIM` porque o teste não precisa; sem ALLOWLIST; sem toque na guarda).

## O que NÃO fiz e por quê
- Não alterei o teste nem a migration da entrega: o teste passa integralmente no container descartável (prova acima); mexer neles seria escopo fora da recusa.
- Não toquei em `check-test-inventory.mjs` nem na ALLOWLIST: a guarda está certa, a entrega é que estava incompleta.

## Arquivos do diff contra a base
- `.github/workflows/db-guard.yml` (etapa nova, 8 linhas)
- `scripts/db-audit/recuperacao-anonima-pedido-reset.test.sh` (da entrega, inalterado)
- `supabase/migrations/20261006221242_recuperacao_anonima_pedido_reset.sql` (da entrega, inalterado)
