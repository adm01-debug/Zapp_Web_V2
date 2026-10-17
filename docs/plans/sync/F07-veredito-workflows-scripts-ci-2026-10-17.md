# F07 — Veredito dos workflows e scripts de CI (SYNC20-14)

- Cartao: `t_b40e7566` — **F07 Trilha scripts, CI e workflows** (plano de sincronizacao
  total Local-GitHub-Banco em 300 etapas, etapas 071–073/080).
- Base do dia: `dia/2026-10-17` (`d723a90107`) · comparado com `origin/main` (`a9b4d6c6fb`).
- Metodo: inventario por arvore (`git ls-tree` + `comm`) e prova por execucao real
  (`node --test scripts/ci/*.unit.mjs`), nunca por leitura.

## Como cada linha foi medida

```
git ls-tree -r --name-only HEAD       -- .github/workflows scripts/ci | sort
git ls-tree -r --name-only origin/main -- .github/workflows scripts/ci | sort   # comm -23 / comm -13
who=so-HEAD     -> existe no dia e nao na origin
who=so-origin   -> existe na origin e nao no dia
```

Inventario apurado: workflows `HEAD=16 · origin=14`; `so-HEAD=3 · so-origin=1`.
`scripts/ci`: `HEAD=135 · origin=151`; `so-origin=16 · so-HEAD=0`.

## A) Workflows so-HEAD — veredito por arquivo

| Arquivo | Gatilho (provado no YAML) | Dono (quem criou) | Quem apagou na origin | Decisao |
|---|---|---|---|---|
| `auto-update-pr-branch.yml` | `schedule` + `workflow_dispatch` (atualiza PRs `behind`) | `093f3d23b5` "ci: auto-atualiza branches de PR... (#686)" | `5721e4f500` "fix(ci): corrige testes pos-CI-minimo + limpa environments E94" | **MANTER** (portar num PR de CI proprio) |
| `settings-guard.yml` | `schedule` + `workflow_dispatch` (detecta/restaura regressao de strict e auto-merge) | `4ba2e1b94e` "feat(ci): settings-guard... (#1436)" | `5721e4f500` (mesmo commit) | **MANTER** — e guarda de perimetro; desligar afrouxa |
| `supabase-sync.yml` | `workflow_dispatch` (importacao legado, desarmada) | `812c637ec9` "Changes" (2026-05-12) | `8d990fdb9f` "ci: arquitetura sem desperdicio... (#1949)" | **MANTER desarmado** (nao portar) |

Nenhum dos tres e "morto": os dois primeiros sobraram da poda de ambientes da origin
(`5721e4f500`) e o terceiro caiu no lote da arquitetura sem desperdicio (`8d990fdb9f`) por
ser importacao legado. Portar para a origin e PR de CI com revisao de terceiro (etapa 080) —
nao cabe a este cartao, que nao publica.

## B) Workflow so-origin — `notifica-falha-main.yml`

- Gatilho: `workflow_run` `completed` em `main`, `if conclusion == 'failure'`.
- Dono: `4dadbb74d8` "ci(W50...W94): CI/CD score batch (#1942)".
- **Prova de gatilho (nao duplica alerta existente):** a arvore do dia tem **zero** workflow
  com o gatilho `workflow_run` (`git grep -n "^  workflow_run:" HEAD -- .github/workflows` → 0
  linhas). Os 5 workflows que abrem issue (`branch-hygiene-audit`, `db-live-guard`,
  `e2e-logado`, `settings-guard`, `types-sync`) disparam por `schedule`/`push` e so para o proprio
  sintoma; nenhum reage a conclusao de outro workflow. Os 7 nomes monitorados existem na arvore
  do dia (conferidos pelo campo `name:` de `ci.yml`, `deploy-functions.yml`, `db-migrate.yml`,
  `db-live-guard.yml`, `types-sync.yml`, `e2e-logado.yml`, `db-guard.yml`).
- Decisao: **MANTER da origin** (adotar).
- **Adocao local PENDENTE:** o ratchet de inventario `scripts/ci/ci-docs-baseline.unit.mjs`
  trava o numero de workflows em 16 (`test('inventario: 16 YAML ...')`, `**16 workflows.**` no
  README gerado e a contagem em `CLAUDE.md`). Adotar o arquivo exige mover o ratchet 16 → 17,
  o que inclui `CLAUDE.md` — arquivo de instrucao protegido, cuja escrita exige aprovacao do
  dono (o worker headless nao consegue esse prompt). Prova do travamento: com o arquivo
  presente, a suite acusa exatamente 1 falha nova,
  `✖ inventario: 16 YAML em .github/workflows e a fonte gerada em paridade`.
  → Cartao proprio (dono) para reconciliar o inventario; depois o arquivo entra inteiro.
  O texto exato do bloco `# docs:` que a localidade exige ja esta pronto em anexo de comentario.

## C) `scripts/ci` so-origin — 16 arquivos, veredito por arquivo

Prova de cada par: `node --test scripts/ci/<x>.unit.mjs` na arvore do dia.

| Arquivo | Dono (origin) | Teste local (par) | Decisao |
|---|---|---|---|
| `branch-podaveis.mjs` + `.unit.mjs` | `f9818f1b8c` (#1951) | **14/14 pass** | MANTER da origin (adotado) |
| `check-workflow-pins-resolvem.mjs` + `.unit.mjs` | `8d990fdb9f` (#1949) | **4/4 pass** | MANTER da origin (adotado) |
| `issue-rotativa.mjs` + `.unit.mjs` | `4dadbb74d8` (#1942) | **14/14 pass** | MANTER da origin (adotado) |
| `reuso-arvore.mjs` + `.unit.mjs` | `8d990fdb9f` (#1949) | **13/13 pass** | MANTER da origin (adotado) |
| `sla-code-scanning.mjs` + `.unit.mjs` | `8d990fdb9f` (#1949) | **5/5 pass** | MANTER da origin (adotado) |
| `fila-merge.mjs` + `.unit.mjs` | `8d990fdb9f` (#1949) | 17 pass / **1 fail** | MANTER da origin, adocao **bloqueada** |
| `secrets-environments.unit.mjs` | `f9818f1b8c` (#1951) | 2 pass / **4 fail** | MANTER da origin, adocao **bloqueada** |
| `arquitetura-sem-desperdicio.unit.mjs` | `8d990fdb9f` (#1949) | 8 testes, **8 SKIP** | MANTER da origin, adocao **bloqueada** |
| `bump-toolchain.mjs` | `4dadbb74d8` (#1942) | sem teste proprio | MANTER da origin, adocao bloqueada |
| `check-claude-md-integrity.mjs` | `025d0258dc` (lote 880) | sem teste proprio | MANTER da origin, adocao bloqueada |

Motivo do bloqueio (medido, nao suposto):
- `fila-merge.unit.mjs` exige `'🧩 Node CI Scripts'` na lista de checks obrigatorios, que vem do
  baseline do `settings-guard` da origin; o baseline local nao tem essa entrada.
- `secrets-environments.unit.mjs` afirma os environments da origin (E94), que a arvore do dia
  ainda nao tem.
- `arquitetura-sem-desperdicio.unit.mjs` e um contrato **100% `test.skip`**: cada R1–R5 chama
  `test.skip(...)`, entao ele nunca valida nada — nem aqui, nem na origin. Adota-lo aqui seria
  trazer um check que finge vigiar. Vira achado proprio.
- `bump-toolchain.mjs` e `check-claude-md-integrity.mjs` nao tem consumidor na arvore do dia
  (nenhum workflow os chama): inertes, entram junto do PR de CI da origin.

Nenhum dos 16 foi classificado **aposentar**: todos estao vivos na origin (gatilho = a suite
`node --test scripts/ci/*.unit.mjs` do `ci.yml:131`). O que existe e adocao bloqueada por
dependencia, nao arquivo morto.

## D) PR local (o que este cartao aplica)

Adotados os 5 pares com teste verde — 10 arquivos. O glob do CI local (`ci.yml:101`,
`node --test scripts/ci/*.unit.mjs scripts/edge-deploy/*.unit.mjs`) passa a rodar 50 testes novos.

| Medida | Antes | Depois |
|---|---|---|
| testes | 829 | 881 |
| pass | 819 | 869 |
| fail | 10 | 10 (os mesmos 10 pre-existentes) |
| skip | 0 | 2 |

Nenhuma falha nova: a lista de testes vermelhos e identica antes e depois
(`comm -13` entre as duas listas nao devolve nada). Nao foi tocada nenhuma guarda: nenhum
limite foi afrouxado, nenhuma excecao foi criada, nenhuma faixa substituiu verificacao exata.

## E) Pendencias (viram cartao proprio, nao entram aqui)

1. Inventario 16 → 17 (`CLAUDE.md` protegido + README gerado + plano P006) e so entao a adocao
   de `notifica-falha-main.yml`.
2. Os 6 arquivos de adocao bloqueada (fila-merge, secrets-environments, arquitetura sem
   desperdicio, bump-toolchain, check-claude-md-integrity) entram junto do PR de CI da origin.
3. Achado: `arquitetura-sem-desperdicio.unit.mjs` e 100% `test.skip` na origin — o contrato do
   desperdicio de CI (R1–R5) nao esta sendo vigiado por ninguem.
