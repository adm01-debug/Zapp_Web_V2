# SYNC20-12 — Inventário completo dos worktrees e classes (plano-sync F02, sem podar)

- Cartão: `t_cf9a514c` · Plano: `docs/plans/PLANO_SINCRONIZACAO_TOTAL_LOCAL_GITHUB_BANCO_300_ETAPAS_2026-10-17.md`
  (commit `67da33fdea`, etapas F02 = 021–030) · Data: 2026-10-17 · Autor: worker (geral)
- **Regra cumprida: SOMENTE LEITURA.** Nada foi podado, movido, apagado ou commitado. Todo `git` rodou com
  `GIT_OPTIONAL_LOCKS=0` (nem o `.git/index` é tocado). Tamanho medido por worktree, nunca por varredura da raiz.
- Artefatos brutos (locais, em `.tmp/sync`, não versionados): `worktrees.csv` (3.457 linhas),
  `worktrees-sujos.csv` (160), `registros-cruzados.csv` (4.629), `podaveis-git.csv` (1.277),
  `orfaos.csv` (92), `dirs-sem-registro.csv` (107), `detached-clusters.csv` (14),
  `evidencias/` (160 pastas, uma por worktree sujo), `resumo-f02.json`, e os scripts `f02_inventario.py`,
  `f02_pos.py`, `f02_reg.py` que geraram tudo.

## 1. Comandos (reproduzível)

```
git -C ~/projetos/Zapp_Web_V2              worktree list --porcelain   # 3.350 registros
git -C ~/hermes-workspaces/Zapp_Web_V2     worktree list --porcelain   # 2.325 registros (2º registro!)
find ~/hermes-workspaces/Zapp_Web_V2 -maxdepth 1 -mindepth 1 -type d    # 3.419
find ~/zapp-worktrees -maxdepth 1 -mindepth 1 -type d                   # 29
git -C <worktree> status --porcelain --untracked-files=normal           # estado + contagem
git -C <worktree> log -1 --format=%cI|%ct|%s                            # último commit
ionice -c 2 -n 7 du -sm <worktree>                                      # tamanho, UM worktree por vez
```
O `status`/`log` rodou em 8 threads e o `du` em 6, por worktree; o dono vem de `.v2-fila/<ID>.json` →
`cartao` → `assignee` no `kanban.db` (cópia local em `.tmp/sync`, aberta `mode=ro&immutable=1`).

## 2. Universo e cruzamento (etapas 021–022)

| Fonte | Baseline do plano | Medido agora | Δ |
|---|---|---|---|
| Worktrees registrados (clone de referência `~/projetos/Zapp_Web_V2`) | 3.329 | **3.350** | +21 |
| Diretórios em `~/hermes-workspaces/Zapp_Web_V2` | 3.419 | **3.419** | 0 |
| Diretórios em `~/zapp-worktrees` | 29 | **29** | 0 |
| Universo inventariado (união das três fontes) | — | **3.457** | — |

Diferenças nominais (Etapa 022): **106** diretórios existem sob `~/hermes-workspaces/Zapp_Web_V2` sem registro
de worktree (107 com o de `~/zapp-worktrees`); desses, **15 têm `.git` válido** (worktree órfão de registro) e
**92 não têm** (conteúdo do próprio clone da raiz — ver §3). **Zero** registros do clone de referência apontam
para diretório ausente. Fora do escopo F02: **133** diretórios de outros projetos no topo de `~/hermes-workspaces`
(não medidos — não são Zapp_Web_V2).

## 3. Achado principal: existem DOIS registros de worktree para o mesmo repo

`~/hermes-workspaces/Zapp_Web_V2` não é só a pasta dos workspaces: **é um clone git inteiro**
(remote `github.com/adm01-debug/Zapp_Web_V2.git`), parado na branch `v2/n-007-storage-avatar-private-261009153000`
com último commit `24a01f7c8` de **10/10**, e com **registro próprio de worktrees**:

| | Clone de referência (`~/projetos/…`) | Clone da raiz dos workspaces (`~/hermes-workspaces/…`) |
|---|---|---|
| worktrees registrados | 3.350 | **2.325** |
| deles, `prunable` (diretório ausente) | 0 | **1.277** |
| interseção entre os dois registros | **1.046** | **1.046** |
| só no registro de referência | **2.304** | — |
| só no registro da raiz | — | **1.279** |
| universo dos dois registros | **4.629 caminhos** | **4.629 caminhos** |

As 92 "órfãs sem `.git`" da §2 são, em sua maioria, o **próprio conteúdo do clone da raiz**
(`src/`, `docs/`, `public/`, `scripts/`, `supabase/`, `tests/`, `e2e/`, `.git/`, `node_modules/`…) e não lixo de
worktree. As sobras de verdade, com esse nome, estão listadas em `orfaos.csv` — são ~30 pastas de rascunho
(`__scratch-t_*`, `.tmp-t_*`, `_patch-t_*`, `_probe-t_*`, `_refazer1-t_*`, `base-*`, `.tmp-baseline-t_*`).
**Consequência para a limpeza (F13):** `git worktree prune` no clone de referência não remove nada
(0 ausentes); os 1.277 prunable pertencem ao registro do clone da raiz e só somem com `prune` **naquele** clone.

## 4. Estado de cada worktree (etapa 023)

`git status --porcelain --untracked-files=normal` em cada um dos 3.457 caminhos:

| Estado | Nº |
|---|---|
| limpo | **3.205** |
| sujo | **160** |
| sem-git (não é worktree) | **92** |
| ausente | 0 |
| erro no status | 0 |

Vínculo com o cartão: **3.057** têm `cartao` conhecido; **273** ficaram sem dono (marcador antigo sem `KANBAN=` e
sem entrada na fila). Estados da fila V2 (`~/hermes-workspaces/.v2-fila`) para os 3.457: rejeitado 1.043,
pronto 877, sem entrada 571, vazio 421, falhou 263, integrado 119, conflito 88, humano 72, superado 3.
Donos mais frequentes: senior 710, iris 551, workersql 331, hugo 331, worker 242, sem-dono 240, semisenior 218,
edgar 177, complexo 159, legado/manual 128, workertestes 105, designer 82, vera 80, coordenador 30.

## 5. Classes (ativo / stale / órfão)

- `ativo` = registrado, diretório existe e **último commit ≥ 2026-10-13** (agora − 4 dias) → **1.230**.
- `stale` = registrado, diretório existe e último commit anterior a 13/10 → **2.135**.
- `orfao` = diretório sem `.git` (92) — nenhum registro com diretório ausente existe no clone de referência.

## 6. Tamanho (etapa 024)

Medido **um worktree por vez** (`ionice -c 2 -n 7 du -sm <path>`), sem varredura da raiz, em 3.365 worktrees com
`.git` válido: **3.420.070 MB = 3.339,9 GB (≈ 3,26 TiB)**. Menor 1 MB, maior 4.303 MB (o clone de referência);
seguido de `n142-banco-leitura-reacoes-espelho-ci-…` (3.537 MB) e `retomar-automation-suggest-reply-t-e494c228`
(3.301 MB). Os 92 sem `.git` **não** foram medidos por não serem worktree (são o conteúdo do clone da raiz).

## 7. Sujeira e evidência (etapas 025 e 029)

160 worktrees sujos, classificados pela natureza da sujeira:

| Classe de sujeira | Nº | O que é |
|---|---|---|
| `commitavel` | 84 | alteração em arquivo rastreado fora de `.tmp` |
| `tmp-descartavel` | 53 | só lixo em `.tmp/` e afins |
| `segredo-suspeito` | 7 | `.env*`, `.pem`, `.key`, `*credentials*`, `*service_account*` |
| `desconhecido` | 16 | só arquivos novos fora de `.tmp` (avaliar caso a caso) |
| `build-node-modules` | 0 | não aparece: `node_modules`/`dist` são ignorados e não entram no status |

Os 7 `segredo-suspeito` (nomes, sem conteúdo lido): `merge-inventario-conflitos-por-area-2610160233ec5c` (t_d81eae50),
`q02-volume-midias-usuario-abas-2610082043d8a7` (t_86555469), `resolve-src-conflitos-dia-26101607332f9d`
(t_1dc8d8aa), `retomar-automation-suggest-reply-t-e494c228`, `sl-069-hooks-departamento-rpcs-2610082333cb49`,
`t-1f93b947-2610060332b726`, `t_5f4496a6`.
**Nenhum conteúdo de arquivo foi lido nem copiado** — só o nome entrou no CSV, para a poda conversar com o dono
antes de apagar.

Evidência: `evidencias/<slug>-<cartao>-<hash6>/` com `status.txt` (`status --porcelain` completo),
`diffstat.txt` (`git diff --stat` e `--cached --stat`) e `meta.txt` (path/branch/head/dono/cartão/classe).
**160 sujos, 160 pastas de evidência** (a etiqueta ganhou o hash do caminho porque dois sujos tinham o mesmo
slug+cartão).

## 8. Congelados (etapa 026) — intocáveis, fora de qualquer faixa de poda

11 caminhos: 8 em `~/hermes-workspaces/.integra/` (`conflitos-banco`, `conflitos-inbox`,
`conflitos-integracoes-admin`, `conflitos-plataforma-talkx`, `conflitos-resto`, `dia-menores`, `fase2`,
`lote-main`), `.integrador` e `.noturno` em `~/hermes-workspaces/Zapp_Web_V2/`, e
`~/zapp-worktrees/sincronizacao-canonica-20261016`. Total 4,9 GB.

## 9. Worktrees com diretório ausente (etapa 027) — listados, **não** podados

`podaveis-git.csv`: **0** no registro do clone de referência; **1.277** no registro do clone da raiz
(1.278 linhas com o cabeçalho). Nenhum `git worktree prune` foi executado.

## 10. Worktrees detached repetidos (etapa 028)

14 grupos por OID (`detached-clusters.csv`). O maior: **10** worktrees em `~/zapp-worktrees/lote10-0…9`
apontando para o **mesmo** OID `d72e8c4d49fe00000a12547a6d2547755964c635`; os outros: `.noturno`+`preview`
(`d723a9010…`, a ponta da main) e 12 grupos de 1.

## 11. Faixas para a limpeza (insumo do F13 — nada foi removido)

| Faixa | Nº | Tamanho medido | Critério |
|---|---|---|---|
| `0-congelado` | 11 | 4,9 GB | lista fixa da §8 |
| `1-stale-integrado` | 33 | 34,3 GB | stale + fila V2 diz `integrado` |
| `2-stale-sem-fila` | 2.011 | 1.965,1 GB | stale, sem entrada na fila (maior bloco) |
| `3-orfao-sem-git` | 92 | — | conteúdo do clone da raiz / rascunhos |
| `4-sujo-decidir` | 158 | 144,0 GB | sujo não congelado: precisa do dono antes de apagar |
| `5-ativo-manter` | 1.152 | 1.191,6 GB | último commit ≥ 13/10 |

## 12. Gate F02 (etapa 030)

- **100% classificado:** 3.457 caminhos, todos com `classe` (ativo 1.230 / stale 2.135 / órfão 92) e `estado`
  (limpo 3.205 / sujo 160 / sem-git 92) — `worktrees.csv` sem célula vazia em `classe`/`estado`.
- **Zero worktree sujo sem evidência:** 160 sujos, 160 pastas em `evidencias/`, 0 sem arquivo.
- Podas executadas: **0**.

## 13. O que NÃO fiz (e por quê)

- Não podei, movi, apaguei, commitei nem alterei nenhum worktree, branch ou ref (o cartão manda só inventariar).
- Não abri o conteúdo de arquivo nenhum (nem dos 7 com nome de segredo): só nome e metadados.
- Não medi os 133 diretórios de outros projetos no topo de `~/hermes-workspaces` (fora do escopo Zapp).
- Não medi tamanho dos 92 sem `.git` nem dos 1.277 prunable do clone da raiz (diretório ausente).
- Não rodei `git worktree prune` em nenhum dos dois clones.
