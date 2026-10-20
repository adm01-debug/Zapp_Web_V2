Especialista: worker (geral)

Refazer 1 do SL-095 (cache do Bun nos jobs). Trabalho anterior: commit 382fd5e163 na branch v2/t-1c6fb64f-261008215386ad (6 arquivos, +146/-1). Veredito: gap já fechado na ponta — cherry-pick dispensado (duplicaria), sem commit de código, conforme o próprio cartão manda para esse caso.

Ponto 1 — Rebase: trazer a branch do dia atualizada e resolver o conflito preservando o que já entrou
- O que achei: o conteúdo integral do commit anterior já vive na linha do dia. O irmão 18f4560cf0 ("fix(ci): cache do Bun nos jobs com bun install (SL-095)", 09/10) integrou o SL-095 e é ancestral confirmado da ponta atual (`git merge-base --is-ancestor 18f4560cf0 dia/2026-10-14`, exit=0). Conferência hunk a hunk contra dia/2026-10-14 (ponta f5885801b1, a mais nova; dia/2026-10-14 existe e é posterior à dia/2026-10-12 citada na recusa):
  - .github/workflows/ci.yml: os 6 passos de cache do commit anterior presentes (linhas 73, 229, 286, 355, 412 e 540 com `if: steps.paths.outputs.map_changed == 'true'`); a ponta tem ainda um 7º passo (linha 607, `multiplix_changed`) adicionado depois por irmão — preservado, não tocado.
  - .github/workflows/db-guard.yml, e2e-logado.yml, e2e-talkx.yml, types-sync.yml: 1 passo de cache cada (mesmo `uses: actions/cache@55cc834... # v6.1.0`, `path: ~/.bun/install/cache`, `key: bun-${{ hashFiles('bun.lock') }}`; types-sync mantém o `if: schema_changed`).
  - scripts/ci/workflow-contracts.unit.mjs: caso E67 "todo job que roda bun install restaura o cache do Bun antes de instalar" presente (linha 403) e ajuste do E68 presente (linhas 252–261).
- O que mudei: nada em código (arquivo nenhum alterado). Fazer cherry-pick de 382fd5e16 agora recriaria os mesmos 10 passos de cache por cima dos que já existem — duplicação e conflito artificial. Conflito da recusa resolvido por absorção: a ponta já contém as duas pontas (SL-095 + mudanças posteriores dos irmãos nos mesmos arquivos).
- Caminhos do mesmo defeito (todos os `bun install` da ponta, por arquivo, install x cache): ci 7x7, db-guard 1x1, e2e-logado 1x1, e2e-talkx 1x1, types-sync 1x1. O E67 varre TODOS os .yml de .github/workflows (não só esses 5) e passou — não há outro job com `bun install` sem cache na ponta.

Ponto 2 — Teste do cartão + verificação
- Teste do cartão: `node --test scripts/ci/workflow-contracts.unit.mjs` (casos E67/E68 do SL-095) rodado contra os arquivos extraídos da dia/2026-10-14 — VERDE: 15 pass, 0 fail (inclui "E67: todo job que roda bun install restaura o cache do Bun antes de instalar").
- Prova de que o teste guarda o gap (vermelho sem a correção): cópia mutante em `.tmp/mutante` com 1 passo de cache removido de e2e-talkx.yml → E67 FALHA (14 pass, 1 fail) com "job com bun install sem cache do Bun: e2e-talkx.yml → e2e-talkx: cache DEPOIS do bun install / cache sem path ~/.bun/install/cache". Vermelho antes (mutante), verde depois (ponta intacta).
- `zapp-verify . --rapido` tentado no workspace: dependencias OK, db_guard OK; tipos não executa aqui (workspace esparso sem node_modules/src: "TypeScript local nao encontrado"). Sem relação com a mudança (diff vazio, só YAML); a ponta dia/2026-10-14 tem seus próprios gates.

Arquivos (workspace esparso `~/hermes-workspaces/Zapp_Web_V2/sl-095-cache-bun-refazer1-t_6d1e5d1b/`, extração fiel da dia/2026-10-14 via `git show`, nenhum byte alterado):
- .github/workflows/*.yml (16 arquivos, todos os da ponta)
- scripts/ci/* (inclui workflow-contracts.unit.mjs da ponta)
- .tmp/mutante/ (cópia com 1 cache removido — prova vermelha)
- .tmp/relato.md (este arquivo)
Nenhum commit criado; não há diff.

Comandos e resultados reais:
- `git show --stat 382fd5e16` → 6 arquivos, +146/-1 (ci.yml 37, contracts 85+, demais 6–7).
- `git merge-base --is-ancestor 18f4560cf0 dia/2026-10-14` → exit=0 (SL-095 na linha do dia desde 09/10).
- `node --test scripts/ci/workflow-contracts.unit.mjs` → 15 pass / 0 fail.
- `node --test .tmp/mutante/scripts/ci/workflow-contracts.unit.mjs` → 14 pass / 1 fail (só E67).
- `timeout 240 zapp-verify . --rapido` → dependencias OK, db_guard OK, tipos não aplicável no workspace esparso.

O QUE EU NÃO FIZ: `hermes-tarefa-iniciar` / `hermes-tarefa-fechar` / `zapp-verify full` — o ciclo V2 por script está congelado nesta máquina (CONGELADO presente, MODO_V2 ausente; iniciar/fechar saem 75; `git worktree` negado pela guarda). Por isso trabalhei em workspace esparso com extração fiel da ponta e fecho no nível do cartão. Nenhum push, PR, merge, deploy ou banco tocado (só leitura do git de referência).
