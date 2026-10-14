Especialista: vera

## O que mudou e por quê
- .github/workflows/db-guard.yml (passo Lint de conteudo das migrations alteradas): sem `|| true` no `git diff` (falha fecha o passo) e base do merge_group resolvida via `github.event.merge_group.base_ref` (sem `refs/heads/`).
- scripts/db-audit/lint-migrations-content.mjs: ANTIPADRAO avalia cada handler com matchAll; ML-001 limita a janela ao fim da propria definicao (proximo CREATE FUNCTION); ML-008 avalia por funcao (corpo da funcao que recebe o GRANT).
- scripts/db-audit/lint-migrations-content.test.mjs: 3 testes novos, um para cada ponto de 3 a 5 da recusa.

## Prova
- verde depois: `node --test scripts/db-audit/lint-migrations-content.test.mjs` → `tests 13, pass 13, fail 0`
- vermelho antes: mesmos 13 testes contra o script da entrega anterior (`git show HEAD:...lint-migrations-content.mjs`) → `pass 10, fail 3` (caem exatamente os 3 testes novos)
- pontos 1 e 2 (workflow): bloco antigo extraido do YAML com base inexistente → `Nenhuma migration alterada neste diff — lint de conteudo pulado`, EXIT=0; bloco novo → EXIT=128. Bloco antigo com `BASE_REF` vazio em merge_group → `Sem base_ref — lint de conteudo pulado`, EXIT=0; bloco novo com `MERGE_GROUP_BASE_REF=refs/heads/main` → `Lintando migrations alteradas:` (50 arquivos, lint real executado)
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (8s)` (sem migration no escopo: nada de banco a verificar)

## Pontos do revisor
- Ponto 1: resolvido — .github/workflows/db-guard.yml: `changed="$(git diff ...)"` sem `|| true`; sob `bash -euo pipefail` o diff quebrado falha o passo (prova: bloco novo com base inexistente → EXIT=128; bloco antigo → EXIT=0 com "pulado").
- Ponto 2: resolvido pela via (a) — .github/workflows/db-guard.yml: novo env `MERGE_GROUP_BASE_REF: ${{ github.event.merge_group.base_ref }}` e resolucao `base_ref="${MERGE_GROUP_BASE_REF#refs/heads/}"` quando `BASE_REF` vem vazio; o `if:` com merge_group foi mantido porque agora ha cobertura real (prova: bloco novo em modo merge_group lista e linta as 50 migrations do diff `origin/main...HEAD`).
- Ponto 3: resolvido — lint-migrations-content.mjs (`SWALLOW_RE_ALL` + `matchAll`, cada handler confrontado com `hasImmediateReRaise`); teste `ANTIPADRAO avalia cada handler: re-raise no primeiro nao esconde o segundo` (2 handlers, 1 violacao na linha do segundo + variante com 2 que engolem → 2 violacoes).
- Ponto 4: resolvido — lint-migrations-content.mjs (ML-001: janela termina no proximo `CREATE FUNCTION`, teto de 20 linhas mantido); teste `ML-001 nao herda SET search_path da funcao seguinte` (insegura antes da segura e ordem inversa: 1 violacao so na insegura).
- Ponto 5: resolvido — lint-migrations-content.mjs (ML-008: cada `GRANT ... TO authenticated` e confrontado com a definicao `CREATE FUNCTION` de mesmo nome no arquivo — cabecalho ate o `AS` para SECURITY DEFINER, corpo dolar-quotado para a guarda; funcao outorgada definida noutra migration nao e avaliada aqui); teste `ML-008 avalia por funcao: guardada nao libera a aberta` (mista → 1 violacao na linha do grant da aberta; ambas guardadas → 0). O achado anterior (`talkx_engine_window_open`, :263) continua barrado.

## O que NÃO fiz e por quê
- Nao corrigi as 2 falhas pre-existentes em `scripts/db-audit/talkx-*.test.mjs` (outro cartao, outra area; nao referenciam o lint) — registradas em comentario no cartao.
- Nao corrigi as 2 ML-008 novas que o lint por-funcao revela no historico (`20261004185228_team_membership_bootstrap_owner_grants.sql`: grants sobre `is_team_conversation_creator` e `is_last_team_conversation_owner`, predicados SECDEF sem amarra ao chamador) — divida ja aplicada, fora do titulo; registradas em comentario no cartao para cartao futuro.
