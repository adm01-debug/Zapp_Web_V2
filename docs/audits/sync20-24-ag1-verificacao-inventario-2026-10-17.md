# SYNC20-24 — Verificação formal do inventário Git do SYNC-AG1 (F01–F04 / F18prep)

- Carimbo da verificação: 2026-10-17 11:57 (UTC-3). Medição do AG1: 08:55–09:59 do mesmo dia.
- Cartão verificado: t_4ad0d8ca ([SYNC-AG1] Git local: inventário refs, cherry, lista curta e deleção candidata) — entrega `3ad90bb7b4`.
- Artefatos verificados: `.tmp/sync/` do workspace `~/hermes-workspaces/Zapp_Web_V2/sync-ag1-git-2610170855737f` (698 MB no total).
- Foto de referência ("foto de 17/10"): seção *Diagnóstico medido (2026-10-17)* do plano de sincronização; cópia usada nas contas: `plan.md` do próprio AG1 (48 KB).
- Base da verificação: `dia/2026-10-17 = d723a9010796`, `main = 025d0258dc64`, `origin/main = a9b4d6c6fb35`.
- Modo: **somente leitura**. Nenhum branch, tag, stash ou worktree foi criado, apagado, movido ou aplicado; nenhum push; nenhum comando de rede.
- Reprodução: os scripts usados estão em `.tmp/verifica_inventario.py`, `.tmp/verifica_fino.py` e `.tmp/verifica_arvores.py` deste workspace, com a saída crua em `.tmp/verificacao-raw.txt`, `.tmp/verificacao-fina-raw.txt` e `.tmp/verificacao-arvores-raw.txt`.

## 1. Stat do commit da entrega

```
$ git show --stat --name-only --format="%H%n%p%n%s" 3ad90bb7b4
3ad90bb7b485e7cee5a916992588c44ecb572018
parents=d723a9010796f1ea4aea5270d881da2974328ba4
chore(sync): inventario read-only de refs, branches e stashes (F01-F04 do plano de sincronizacao)
(nenhuma linha de arquivo)
```

**ACEITE com nota.** O commit tem 1 pai (`d723a9010796`, a base do dia) e **zero arquivos alterados** — é o carimbo do fechar, não o conteúdo. O conteúdo é a pasta `.tmp/sync/`, que não é versionada: `branch-cherry.csv` (148 MB), `branch-unique.csv` (155 MB), `f03b-diffnum.json` (414 MB) e `f03b-diffnum`-derivados não são versionáveis de forma sadia. **Recomendação para o F18/F19:** não tentar versionar esses CSV; regenerar por script (`f03b_cherry_rapido.py`, 216 s) a partir de `refs.csv` quando precisar, e versionar só os derivados pequenos (`lista-curta.csv` 967 KB, `veredito-branches.csv` 2,9 MB, `lista-delecao-candidata.csv` 6 KB).

## 2. Contagens de refs, branches, tags, stashes e worktrees

| Item | Foto 17/10 | refs.csv do AG1 | Medido agora (11:57) | Veredito |
|---|---|---|---|---|
| refs totais | — | 4574 | — | ACEITE |
| heads locais | 4131 | 4136 | 4163 | ACEITE com ressalva (delta explicado) |
| heads `v2/*` | 4052 | 4057 | 4084 | ACEITE com ressalva (delta explicado) |
| remotas | 107 | 107 | 107 | ACEITE (idêntico) |
| tags | 331 | 331 | 331 | ACEITE (idêntico) |
| stashes | 8 | 8 | 8 | ACEITE (idêntico) |
| worktrees registrados | 3329 | — (F02 é o SYNC20-12) | 3362 | ACEITE com ressalva (móvel) |

Comandos e saídas:

```
$ git for-each-ref refs/heads --format='%(refname)' | wc -l                     -> 4163
$ git for-each-ref refs/heads --format='%(refname)' | grep -c 'refs/heads/v2/'  -> 4084
$ git for-each-ref refs/remotes --format='%(refname)' | wc -l                   -> 107
$ git tag | wc -l                                                               -> 331
$ git stash list | wc -l                                                        -> 8
$ git worktree list | wc -l                                                     -> 3362
```

- **Soma exata:** 4136 + 107 + 331 = **4574** = linhas de `refs.csv` (menos o cabeçalho). O `refs.csv` do AG1 fecha com o próprio conteúdo.
- **Delta da foto (4131/4052 → 4136/4057 = +5):** as 5 branches `v2/sync-ag1-git-2610170855737f`, `…-ag2-front-…`, `…-ag3-edge-…`, `…-ag4-banco-…`, `…-ag5-qualidade-…` foram criadas às **08:55** pelo `hermes-tarefa-iniciar` dos próprios cartões SYNC-AG, ou seja, **depois** da foto e **antes/na** medição do AG1. O delta fecha.
- **Delta até agora (4136 → 4163 = +27):** cada cartão despachado cria uma branch; a campanha SYNC20 roda desde 09:00 e hoje há 65 branches `v2/*` com carimbo `261017`. **Não é erro** — é contagem de alvo móvel (ver Achado 3).
- **Worktrees:** a foto registra 3329 registrados / 3419 diretórios; hoje são 3362 registrados (+33 em ~4 h, mesmo motivo). O inventário fino de worktrees é do SYNC20-12 (t_cf9a514c), fora deste cartão.

## 3. Clusters por OID repetido

```
$ recomputado dos heads: heads_unicos=3910 clusters(>=2 refs)=54 refs_em_clusters=307
$ clusters.csv do AG1: 54 linhas  |  soma de n_refs = 309  |  0 refs/remotes listadas
$ OIDs do AG1 presentes agora: 54/54  |  só no AG1: 0  |  novos agora: 0
```

**ACEITE.** Os **54 OIDs repetidos** batem exatamente (nenhum entrou, nenhum saiu). A diferença é só na contagem de refs por cluster: **309 → 307**, e a causa está localizada em **um** cluster — `d723a9010796` (`dia/2026-10-17`), que tinha 51 refs às 08:56 e tem 47 agora (−4 refs). Isso fecha: das 4 refs que saíram do cluster do dia, 2 aparecem em outro cluster existente (309 − 4 + 2 = 307). É o mesmo efeito de alvo móvel do item 2.

## 4. F04 reproduzido linha por linha

| Medida | Foto 17/10 e AG1 | Medido agora | Veredito |
|---|---|---|---|
| `origin/main...dia/2026-10-17` | 79 / 1546 | 79 / 1546 | ACEITE |
| `main...dia/2026-10-17` | 62 / 1546 | 62 / 1546 | ACEITE |
| `origin/main...main` | 17 / 0 | 17 / 0 | ACEITE |
| merge-base(origin/main, dia) | `7a15852791` | `7a1585279182` | ACEITE |
| merge-base(dia, main) | `7a15852791` | `7a1585279182` | ACEITE |
| Árvores: dia / origin / comuns | 6660 / 7526 / 6621 | 6660 / 7526 / 6621 | ACEITE |
| Blobs diferentes / origin-only / dia-only | 952 / 905 / 39 | 952 / 905 / 39 | ACEITE |
| Classes das 952 divergências | 952 origin-mais-novo, 0 dia-mais-novo, 0 conflito | 952/952 `origin-mais-novo` | ACEITE |
| Commits origin-only / main-não-no-dia / faltam-em-main-local | 79 / 62 / 17 | 79 / 62 / 17 (arquivos correspondentes) | ACEITE |

O conjunto inteiro de F04 foi **reproduzido exatamente**, inclusive a contagem de blobs por árvore (`git ls-tree -r` de `dia/2026-10-17` × `origin/main`). A conclusão registrada pelo AG1 no comentário do cartão — "as 952 divergências são todas `origin-mais-novo`, é ordem temporal, não conflito" — está sustentada pelos dados: 0 `dia-mais-novo`, 0 conflito de último commit.

## 5. Lista de deleção candidata (`lista-delecao-candidata.csv`, 24 itens)

Prova refeita item a item: `git rev-parse <ref>` (a ref ainda aponta para o OID declarado), `git rev-list --count <oid> ^origin/main` e, quando > 0, `git cherry origin/main <oid>`.

| # | OID | ref | classe declarada | minha medição | veredito |
|---|---|---|---|---|---|
| 1 | 6d15254110a1 | chore/graphifyignore-imagem-sensivel | equivalente-integrada | cherry 1 equiv / 0 únicas | ACEITE |
| 2 | ca9cee565cba | chore/regen-database-types | equivalente-integrada | cherry 2 equiv / 0 únicas | ACEITE |
| 3 | 3f4417b3e39d | chore/regen-types-zapp-v2-correto | ancestor-integrada | rev-list ^origin/main = 0 | ACEITE |
| 4 | 4991d7c3fa20 | chore/types-sync-lote-0810 | equivalente-integrada | cherry 1 equiv / 0 únicas | ACEITE |
| 5 | c75c304bd8a5 | fix/delivery-stats-remove-cast-obsoleto | equivalente-integrada | cherry 1 equiv / 0 únicas | ACEITE |
| 6 | fbd422204a21 | fix/migration-p1-001-timestamp-duplicate | ancestor-integrada | rev-list = 0 | ACEITE |
| 7 | 384815b06186 | fix/migration-timestamp-collision | equivalente-integrada | cherry 1 equiv / 0 únicas | ACEITE |
| 8 | 10ce408b20aa | fix/p2-iserror-consumers-20261016 | ancestor-integrada | rev-list = 0 | ACEITE |
| 9 | 895fb5a14a8a | fix/p2-search-events-doc-20261016 | equivalente-integrada | cherry 1 equiv / 0 únicas | ACEITE |
| 10 | 64687a52481a | fix/revert-security-regressions-20261016 | equivalente-integrada | cherry 2 equiv / 0 únicas | ACEITE |
| 11 | 95352ff88593 | fix/types-connection-alert-preferences | equivalente-integrada | cherry 3 equiv / 0 únicas | ACEITE |
| 12 | 71e81924356d | fix/types-ts-banco-errado | equivalente-integrada | cherry 1 equiv / 0 únicas | ACEITE |
| 13 | a81d81237023 | hermes/arquivos-fase9-pr-i-… | ancestor-integrada | rev-list = 0 | ACEITE |
| 14 | 694bf0849c19 | hermes/audit-a1-db-… | ancestor-integrada | rev-list = 0 | ACEITE |
| 15 | 283e9caed5e3 | hermes/bloco-b-permissoes-cache-docs-… | ancestor-integrada | rev-list = 0 | ACEITE |
| 16 | 7b8fc4a41a8b | hermes/bloco-h-f65-fila-tts-… | ancestor-integrada | rev-list = 0 | ACEITE |
| 17 | 2118cecf01cc | hermes/e53-resumo-drift-… | ancestor-integrada | rev-list = 0 | ACEITE |
| 18 | 6c8a59316322 | hermes/ia059-conteudo-sensivel-em-logs-… | ancestor-integrada | rev-list = 0 | ACEITE |
| 19 | 60762ce20a30 | hermes/melhorias50-e37-srcset-inbox-… | ancestor-integrada | rev-list = 0 | ACEITE |
| 20 | bf266d2f890e | hermes/talkx-vinculo-crm-lote-… | ancestor-integrada | rev-list = 0 | ACEITE |
| 21 | 1cf77ea87fa4 | lote/2026-10-16-880-completo | equivalente-integrada | cherry 1 equiv / 0 únicas | ACEITE |
| 22 | 025d0258dc64 | main | ancestor-integrada | rev-list = 0 | ACEITE |
| 23 | 78ea3b73e0bf | teste/dia-20261004 | obsoleta-provada | 4 únicas, mas **prova própria confere** | ACEITE (ver nota) |
| 24 | **4032cdf0db36** | **v2/alternador-agrupar-quadro-prazo-102-…** | **ancestor-integrada** | **rev-list ^origin/main = 1547** | **RESSALVA BLOQUEANTE — item FALSO** |

- Itens 1–22: **22 de 22 provados** por medição independente — 12 `ancestor-integrada` com `git rev-list --count <oid> ^origin/main = 0`, 9 `equivalente-integrada` com `git cherry` sem nenhuma única, 1 `obsoleta-provada` (item 23, abaixo).
- Item 23 (`teste/dia-20261004`, classe `obsoleta-provada`): a prova declarada é outra — "todos os 3 arquivos tocados removidos de origin/main". Conferi: `docs/v2/PORTAO_bom.md`, `docs/v2/PORTAO_vago.md` e `docs/v2/TESTE_MODO_V2.md` **não existem** em `origin/main` e existem no commit (`git cat-file -e`). Prova confere; a classe não é "integrada", é "obsoleta", e está corretamente separada.
- Item 24: **não é integrado**, ver Achado 1. **Não executar a deleção desse branch.**

## 6. Stashes

`git stash list | wc -l = 8` — igual à foto. O `stashes.txt` (101 linhas) mostra por stash o `diff --stat`; a amostra do topo confere com a nota do cartão: `stash@{0}` é resíduo de merge (`40 × .merge_file_*`, 2203 linhas cada). **ACEITE.** Nada foi aplicado nem descartado por esta verificação.

## 7. Achados — números que não fecham

### Achado 1 (bloqueante para o F19) — 1 dos 24 itens de deleção não está integrado

`refs/heads/v2/alternador-agrupar-quadro-prazo-102-2610161132f05f` = `4032cdf0db36`, classificado `ancestor-integrada` com a prova `rev-list --count <oid> ^origin/main = 0`. Medido agora:

```
$ git rev-list --count 4032cdf0db36 ^origin/main     -> 1547
$ git merge-base --is-ancestor 4032cdf0db36 origin/main -> NÃO é ancestral
$ git log -1 --format='%h %p' 4032cdf0db36          -> 4032cdf0db d723a90107   (1 commit acima de dia/2026-10-17)
$ git cherry origin/main 4032cdf0db36 | grep -c '^+' -> 1546 únicas
$ git show --stat 4032cdf0db36
  src/components/tasks/__tests__/quadroAgruparPorPrazo.test.tsx | 198 +++++
  src/components/tasks/board/BoardDueColumn.tsx                 |  76 +++
  src/components/tasks/board/TasksBoardMode.tsx                 | 167 +++++----
```

Conteúdo próprio **não** está em `origin/main`: `BoardDueColumn.tsx` e `quadroAgruparPorPrazo.test.tsx` **não existem** em `origin/main` (`git ls-tree -r --name-only origin/main`), e `TasksBoardMode.tsx` difere (206+/116−, `git diff --numstat origin/main 4032cdf0db36`). **Deletar esse branch apaga o alternador "Agrupar por: Estado | Prazo" do Quadro (etapa 102).**

**Causa-raiz medida (não é erro de digitação no CSV, é lacuna de medição herdada do F01/F02):** em `refs.csv` essa é a **única** das 4136 heads com `ahead_main` **vazio** (e `ahead_dia` também vazio) — o cálculo de ahead/behind não foi produzido para ela. O gerador do veredito trata ausência como zero (`grep -n 'ahead_main' f06_veredito.py` → linha 35: `ahead = int(refs[0]["ahead_main"] or 0)` e linha 36–37: `if ahead == 0: classe, prova = "ancestor-integrada", "rev-list --count <oid> ^origin/main = 0"`). Ou seja: **campo vazio virou "integrado", e a prova impressa ("rev-list = 0") nunca foi executada** — a classe veio do campo, não do comando. Confirmação no próprio artefato: `veredito-branches.csv` traz para esse OID `unicas=1546` (contagem real de commits não-merge fora de origin/main), coerente com o que medi.

**Ação pedida ao F18/F19:** remover esse item da lista de deleção (ou reclassificá-lo como `unica-pendente` / candidato de resgate no F09 da trilha de branches) e, no F18, recalcular `ahead_main` para toda ref com o campo vazio antes de decidir qualquer deleção por essa classe (aqui é 1 ref; basta um `WHERE ahead_main = ''`).

### Achado 2 (rastreabilidade) — "0 divergências na validação" não é o que o artefato entregue mostra

O resumo da entrega afirma "patch-id validado 0 divergências vs git cherry em 30 amostras". O arquivo entregue no mesmo pacote, `f03b-validacao.txt`, registra **1 divergência em 30**:

```
$ tail -n +2 f03b-validacao.txt | grep -c OK            -> 29
$ grep DIVERGE f03b-validacao.txt
19|4c2347295b00 equiv=0/0 unicas=620/619 DIVERGE      (620 = git cherry, 619 = método patch-id)
```

Refiz o caso:

```
$ git cherry origin/main 4c2347295b00 | grep -c '^+'   -> 620
$ git cherry origin/main 4c2347295b00 | grep -c '^-'   -> 0
```

Então o **git cherry (620) está certo e o `branch-cherry.csv` entregue subconta 1 única** (619) nesse OID. O `f03b.log` (09:59) da rodada que gerou os CSVs diz `divergencias=1`; as rodadas `f03c.log` e `f03d.log` dizem `divergencias=0` mas são de 09:17/09:34, ou seja, **os CSVs entregues foram sobrescritos pela rodada posterior com 1 divergência**, e o texto do resumo ficou com o número da rodada anterior. Impacto prático: **nenhum na classificação entregue** — `veredito-branches.csv` traz `unicas=620` para esse OID (correto) e a classe é `squash-provavel`, fora da lista de deleção; a subcontagem ficou confinada ao CSV intermediário, na direção perigosa (favorece "equivalente"). Ressalva de rastreabilidade, não de acervo: **a afirmação "0 divergências" não corresponde ao arquivo entregue**; a validação correta é "29/30 OK, 1 subcontagem de 1 commit no patch-id, corrigida no veredito".

### Achado 3 (método) — as contagens de refs são alvo móvel e não devem ser comparadas sem carimbo

Entre 09:59 (fim do AG1) e 11:57 (esta verificação): heads 4136 → **4163**, `v2/*` 4057 → **4084**, 1 cluster perdeu 4 refs. Cada cartão despachado cria uma branch (`hermes-tarefa-iniciar`), e a campanha SYNC20 está com vários cartões em paralelo. **Veredito:** as contagens do AG1 são corretas para o instante da medição (a foto era 08:0x, o AG1 mediu 08:55); para o F27, comparar sempre com carimbo de hora e por delta, nunca contra a foto "crua".

### Achado 4 (coerência de documento) — `f07.log` × `f08.log`

`f07.log`: "lista curta real: 3749 | banco=3335 ci=3185". `f08.log`: "lista curta: 3249 | banco=1296". Os dois números convivem no mesmo pacote sem uma linha dizendo que o segundo é o **pós-filtro de conteúdo** (arquivos próprios ausentes do diff 2-dot contra origin/main). O `lista-curta.csv` entregue tem 3249 linhas de dados (3250 com cabeçalho), então o número do resumo está certo; a ressalva é de leitura: quem abrir `f07.log` antes de `f08.log` vai achar que falta 500 branches. Registrar a ordem das etapas no F18.

## 8. Não verificado por mim

- A amostra `gh pr view` de 20 PRs (19 MERGED / 1 outro, `f08-gh-amostra.txt`): depende de rede/GitHub e este cartão é git local somente-leitura. Permanece como está — e a ressalva do próprio AG1 (a classe `squash-provavel`, 3677 branches, é critério fraco) continua valendo para o F18.
- Os 3 CSVs gigantes (`branch-cherry.csv` 148 MB, `branch-unique.csv` 155 MB, `f03b-diffnum.json` 414 MB) não foram lidos linha a linha; foram conferidos por amostragem dirigida (o caso do Achado 2, os 24 itens da deleção e os agregados de `veredito-branches.csv`).

## 9. Conclusão

**ACEITE COM RESSALVA.** Todos os números da foto de 17/10 que o AG1 declarou (identidades, 79/1546, 62/1546, 17/0, merge-base `7a15852791`, árvores 6660/7526/6621, 952/905/39, 107 remotas, 331 tags, 8 stashes, 18 refs ancestrais, 54 clusters, refs.csv 4574, vereditos 3677/180/13/10/1 = 3881, lista curta 3249) **foram reproduzidos por medição independente**. As diferenças de contagem de heads são de alvo móvel, com causa identificada.

Ressalvas:

1. **Bloqueante para o F19:** o item `4032cdf0db36` (`v2/alternador-agrupar-quadro-prazo-102-…`) da lista de deleção candidata é **falso** — não está integrado em `origin/main`, tem 1 commit próprio sobre `dia/2026-10-17` e 2 arquivos que não existem em `origin/main`. Causa-raiz: `ahead_main` vazio em `refs.csv` tratado como 0 por `f06_veredito.py`. **A lista tem 23 itens confiáveis, não 24.**
2. Rastreabilidade: a validação de patch-id tem 29/30 OK e 1 subcontagem de 1 commit (`4c2347295b00`, `branch-cherry.csv` = 619 vs `git cherry` = 620), não "0 divergências" como o resumo do cartão diz; o `veredito-branches.csv` (que alimenta a deleção e a lista curta) tem o valor correto.
3. Método: contagens de refs/clusters são alvo móvel — comparar por carimbo de hora; versionar só os derivados pequenos, regenerando os grandes por script.
