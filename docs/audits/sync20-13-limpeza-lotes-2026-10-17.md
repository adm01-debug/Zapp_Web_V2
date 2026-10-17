# SYNC20-13 — Limpeza: tag de arquivo e lotes de deleção (preparo do F18, execução parada no gate)

- Cartão: `t_d163ac19` · Plano:
  `docs/plans/PLANO_SINCRONIZACAO_TOTAL_LOCAL_GITHUB_BANCO_300_ETAPAS_2026-10-17.md` (commit `67da33fdea`;
  F18 = etapas 181–190, F27 = etapas 271–280) · Data: 2026-10-17 · Autor: worker (geral).
- **Regra cumprida: SOMENTE LEITURA.** Nada foi deletado, nenhuma tag foi criada, nenhum worktree foi
  movido, nenhum stash foi aplicado ou descartado. Todo `git` rodou com `GIT_OPTIONAL_LOCKS=0`.
- Nesta fase **não há execução destrutiva**: este documento é o insumo do gate. A ordem de deleção é do
  Joaquim, **lote por lote** (etapa 183) — e a criação de tag não é ato de agente por decisão do próprio
  guard do repositório: `HERMES-GUARD (git): git tag com escrita é proibido / tags são do Joaquim`.
- Entregáveis versionados: `docs/audits/evidence/sync20-13-delecao-candidata.csv` (os 260 refs com OID
  dos lotes executáveis), `docs/audits/evidence/sync20-13-f18_prep.py` (gera) e
  `docs/audits/evidence/sync20-13-f18_verifica.py` (prova).
- Artefatos brutos, **não versionados** (o clone é vivo e o arquivo tem 4.152 linhas / 733 KB):
  `.tmp/sync/oids-restauraveis.csv` (todas as branches, com motivo) — regenerável em um comando com o
  gerador versionado —, `.tmp/sync/refs.csv` (4.590), `.tmp/sync/clusters.csv` (305) e
  `.tmp/sync/resumo-f18.json`.
- Medição abaixo: **2026-10-17T13:54Z**. O clone de referência é vivo (outras tarefas criam e movem
  branches durante o dia): entre duas medições minhas de hoje um ref passou de `medio` para `grande`
  porque a branch que servia de representante recebeu commit novo. Os números deste documento são os da
  medição final de 13:54Z, e a §6 reconcilia a soma com o `git` no momento da prova.

## 1. Comandos (reproduzível)

```
export GIT_OPTIONAL_LOCKS=0                     # nem o .git/index é tocado
git for-each-ref --format='%(refname)|%(refname:short)|%(objectname)|%(committerdate:iso8601)|%(subject)' \
                 refs/heads refs/tags refs/remotes > .tmp/sync/refs.csv
git for-each-ref --merged origin/main --format='%(refname:short)' refs/heads   # 18
git log -g --format='%H|%gd|%gs' refs/stash                                     # 8
git worktree list --porcelain                                                   # 3.351
python3 docs/audits/evidence/sync20-13-f18_prep.py > .tmp/sync/resumo-f18.json
python3 docs/audits/evidence/sync20-13-f18_verifica.py   # sai 1 se qualquer verificação falhar
```

## 2. Universo medido (clone de referência `~/projetos/Zapp_Web_V2`)

| Fonte | Baseline do plano | Medido às 13:54Z | Δ |
|---|---|---|---|
| Branches locais (`refs/heads`) | 4.131 | **4.152** | +21 |
| Remotas (`refs/remotes`) | 107 | **107** | 0 |
| Tags | 331 | **331** | 0 |
| Stashes | 8 | **8** | 0 |
| Worktrees registrados | 3.329 | **3.351** | +22 |
| Refs no `for-each-ref` (heads+tags+remotes) | — | **4.590** | — |

- `origin/main` = `a9b4d6c6fb35625e8a4794895f733ce696201b28`.
- `dia/2026-10-17` = `d723a9010796f1ea4aea5270d881da2974328ba4`, com **1.546 commits que não existem em
  `origin/main`** (e 79 commits de `origin/main` ausentes no dia) — é por isso que a branch do dia precisa
  de tag de arquivo antes de qualquer limpeza.
- OIDs distintos entre as 4.152 branches: **3.901**. Clusters de OID repetido: **54 grupos cobrindo 305
  refs** (o AG1 mediu 54/309 no mesmo dia). Maior cluster: **47 refs** no OID `d723a9010796`
  (`dia/2026-10-15`, `...-16`, `...-17` e 44 `v2/*` apontando para o mesmo commit) — eram 48 no começo da
  manhã; a branch que recebeu commit novo saiu do cluster e levou o lote `medio` de 244 para 243.
- Prefixos das 4.152 branches: `v2` 4.073 · `hermes` 15 · `dia` 14 · `fix` 10 · `v2-devin` 10 · `lote` 9 ·
  `integra` 7 · `chore` 4 · `ci` 2 · `codex` 2 · `local` 2 · `teste` 2 · `resgate` 1 · `main` 1.
- Branches atualmente **checkadas em algum worktree**: **3.329** (etapa 185).
- Tags: **330 são `edge-deploy/*`** (arquivo de deploy) + 1 na raiz. **Zero `sync/*` existem hoje.**

## 3. Tag de arquivo — nome, destino e quem executa

**Nome (segue a etapa 182 do plano):** `sync/pre-limpeza-2026-10-17`

**Destino:** `d723a9010796f1ea4aea5270d881da2974328ba4` — a ponta de `dia/2026-10-17` (que hoje é também a
ponta de `dia/2026-10-15` e `dia/2026-10-16`). A tag cobre a branch do dia inteira, com os 1.546 commits
que não estão em `origin/main`.

**Quem executa:** o Joaquim, no gate. O guard do repositório recusa `git tag` para agentes
(`tags são do Joaquim`), então o comando fica preparado e **não executado**:

```
git tag -a sync/pre-limpeza-2026-10-17 d723a9010796f1ea4aea5270d881da2974328ba4 \
        -m "arquivo pre-limpeza SYNC20 (dia/2026-10-17)"
```

A tag nasce **antes** de qualquer deleção (etapa 182) e **não é publicada**: push de tag é ato externo,
só com ordem nominal (etapa 187). Verificação: `git rev-parse sync/pre-limpeza-2026-10-17` tem que
devolver `d723a9010796f1ea4aea5270d881da2974328ba4`.

**Sobre os "HEADs não classificáveis":** não é preciso uma tag por OID. A §4 mostra que os OIDs dos lotes
`pequeno` e `medio` continuam alcançáveis (de `origin/main` ou de uma ref que fica) — o que some é o
*nome*, e o nome está no CSV da §5. Criar `sync/arq/<oid12>` para as 3.870 pontas sem prova triplicaria o
`for-each-ref` de todos os agentes da fábrica hoje, sem ganho; a decisão dessas tags pertence ao gate do
lote `grande`, quando (e se) a prova de equivalência da F03/F09 existir.

## 4. Lotes de deleção (nada foi deletado)

| Lote | Nº de refs | Critério | Prova de restauração | Checkadas em worktree | Executável hoje? |
|---|---|---|---|---|---|
| `0-congelado` | 22 | `main` (1) + `dia/*` (14, arquivo histórico) + `integra/*` (7, trilha do integrador) | não se deleta | 8 | **nunca** |
| `1-pequeno` | 17 | ancestor-merged em `origin/main` | 17/17: `merge-base --is-ancestor <oid> origin/main` = 0 — o conteúdo inteiro está na main | 1 | sim, com ordem |
| `2-medio` | 243 | HEAD idêntico ao de uma ref que fica (cluster) | 243/243 com representante preservado: 148 por uma branch do lote `grande` e 95 por uma ref `0-congelado` (`dia/*`) | 186 | sim, com ordem |
| `3-grande` | 3.870 | sem prova de equivalência | nenhuma — exige F03/F09 (equivalência de patch / obsoleta-provada) | 3.134 | **não** |

- Ordem das deleções (etapa 183): **lotes de 100**. Na prática, `1-pequeno` = 1 lote de 17; `2-medio` = 3
  lotes (81/81/81); `3-grande` fica **suspenso** até a F03/F09 entregar prova item a item.
- Barreira de segurança (etapa 184): usar `git branch -d` (nunca `-D`) — o `-d` **recusa** branch
  não-merged, então erro de classificação vira erro do git, não perda. Cada item deletado entra em
  `.tmp/sync/deleted-refs.csv` no formato `<ref>,<oid>,<lote>,<data-utc>` (etapas 184/275).
- Branch checkada em worktree **não pode** ser deletada pelo git: as 186 do lote `medio` e 1 do `pequeno`
  exigem a limpeza do worktree **pela ferramenta de tarefas da Hermes** primeiro (etapa 185).
- O lote `grande` só entra em pauta **depois** de a F03/F09 marcar a branch como integrada ou
  obsoleta-provada; mesmo assim cada item leva seu OID para o CSV.

## 5. CSV de OIDs restauraveis

**Versionado — `docs/audits/evidence/sync20-13-delecao-candidata.csv`:** os lotes executáveis
(`pequeno` + `medio`), **260 linhas**, colunas `lote,ref,oid,checkada_em_worktree,prefixo`. É o que o gate
precisa para restaurar um nome apagado: `git branch <ref> <oid>`.

**Bruto — `.tmp/sync/oids-restauraveis.csv` (não versionado, 4.152 linhas, 733 KB):** todas as branches, por
lote, com o motivo item a item; colunas `lote,ref,oid,data,oid12,checkada_em_worktree,motivo`. Fica fora do
commit porque 733 KB de CSV não são revisáveis e o gerador versionado o reproduz — e a checagem `[7]` da
§6 prova que o CSV versionado é subconjunto fiel do bruto.

As linhas `0-congelado` e `3-grande` ficam **só no bruto** (o versionado traz apenas os lotes
executáveis), e é o bruto que reconcilia com o `git` na §6. Os objetos dos OIDs listados permanecem no
repositório enquanto o clone não sofrer `git gc --prune=now`; por isso a poda de objetos não faz parte
desta limpeza.

## 6. Prova (executada agora)

`python3 docs/audits/evidence/sync20-13-f18_verifica.py` — sai 1 se qualquer checagem falhar:

```
[6] reconciliacao: git=4152 csv=4152 lotes={'congelado': 22, 'grande': 3870, 'medio': 243, 'pequeno': 17}
[2] lote pequeno ancestral de origin/main: 17/17
[3] lote medio com representante preservado: 243/243
    representante dos medios: {'grande': 148, 'congelado': 95}
[4] OIDs existentes no repositorio (restauraveis): 4152/4152
[5] controle negativo (OID fabricado rejeitado por cat-file e por is-ancestor): OK
[1] lote grande (sem prova de equivalencia, FORA de qualquer gate hoje): 3870
[7] CSV versionado (candidata) fiel ao bruto: 260 refs, 0 divergencia(s)

VERDE: todas as verificacoes passaram          (exit 0)
```

**Teste de mutação (a prova discrimina):** o mesmo verificador sobre uma cópia do CSV bruto com **uma**
linha `grande` renomeada para `pequeno` (`.tmp/sync/csv-adulterado.csv`) falha apontando a linha errada —
`FALHOU: 2 problema(s) - pequeno sem ancestralidade: chore/graphifyignore-imagem-sensivel` e
`candidata: 261 refs esperadas x 260 no CSV versionado (faltam 1, sobram 0)` (exit 1): a mutação é pega
duas vezes, pela ancestralidade e pela fidelidade do CSV versionado.

## 7. Plano de rollback nomeado (F27)

| Nome | Gatilho | Procedimento | Verificação | Dono |
|---|---|---|---|---|
| `R1 restaure-branch-do-csv` | sumiu uma branch que era útil | `git branch <ref> <oid>` (OID da §5) | `git rev-parse <ref>` = OID | qualquer agente |
| `R2 restaure-branch-do-dia` | sumiu a branch do dia | `git branch dia/2026-10-17 d723a901…` (ou a partir da tag `sync/pre-limpeza-2026-10-17`) | `git rev-parse dia/2026-10-17` = `d723a901…` | Joaquim |
| `R3 restaure-worktree` | sumiu um worktree que era útil | recriar pela ferramenta de tarefas da Hermes e conferir `git -C <dir> rev-parse HEAD` = OID do CSV | HEAD = OID registrado | qualquer agente |
| `R4 restaure-stash` | sumiu um stash útil | `git stash apply` do patch nomeado `sync/stash-patches/stash-N.patch` (etapa 189) | `git diff --stat` do patch confere | Joaquim |
| `R5 desfaz-tag-de-arquivo` | a tag atrapalhou | `git tag -d sync/pre-limpeza-2026-10-17`, só depois de a branch do dia estar restaurada | `git rev-parse` volta a falhar para a tag | Joaquim |
| `R6 revert-do-PR` | merge ruim em `origin/main` | registrar o OID de `origin/main` **antes** de cada merge; reverter com `git revert -m 1 <merge>` versionado — **nunca** reescrever histórico publicado (precedente #1982) | `git merge-base --is-ancestor <revert> origin/main` | trilha de PR |

Mapa com o F27: **271** (registrar OID de `origin/main` por PR) e **272** (revert versionado) ficam prontos
no procedimento `R6`; **275** é `R1`+`R3`+`R4`; **273/274/276/277** são de banco, artefato e deploy — não
são desta limpeza e só acontecem com ordem nominal; **278/279** (parar tudo e comunicar em linguagem
comum) seguem o modelo abaixo.

Modelo de mensagem de rollback (etapa 279): “O que voltou: <refs restauradas por OID>. O que ficou:
<itens intactos>. O que a limpeza apagou e não volta: nada — tudo tem OID no CSV. Próximo passo: <parar os
lotes / seguir com o lote N-1>”.

## 8. Stashes (etapa 189) — destino nomeado, nada aplicado

8 stashes (`stash@{0}`..`{7}`), OIDs `c759b1be56b0`, `b473042c3876`, `7fcb4967ff55`, `06e6f69c93cf`,
`0a9b556c6873`, `acdb69e32261`, `4798730d1863`, `6d7cd91aee88`. Antes de qualquer descarte, cada um vira
patch em `sync/stash-patches/stash-N.patch` (`git stash show -p stash@{N} > …`, sem aplicar) ou vira branch
de resgate. Os dois destinos ficam nomeados; **nenhum** foi executado aqui.
Dois deles são de **outros agentes** e exigem o dono antes de decidir: `stash@{1}` (conteúdo de filas
restaurado por um `pop` acidental de 11/10) e `stash@{7}` (`r04`, `t_30e8e544`, `pop` acidental de 09/10);
`stash@{0}` é em `main` e é o mais sensível dos oito.

## 9. Tags (etapa 188)

As **331** tags ficam como estão: 330 são `edge-deploy/*` (arquivo de deploy — histórico de release) e 1 na
raiz. Nenhuma tag é candidata a sumir; não há `sync/*` para reconciliar.

## 10. Worktrees (etapas 185 e 186)

3.351 worktrees registrados e 3.329 branches checkadas. Worktree limpo e integrado sai **pela ferramenta de
limpeza de tarefas da Hermes**, nunca por remoção manual de pasta; worktree sujo só sai com a evidência da
F02 salva e decisão nomeada sobre o conteúdo — nada disso foi tocado neste cartão.

## 11. Gate — o que o Joaquim decide

1. Autorizar a criação da tag `sync/pre-limpeza-2026-10-17` (comando pronto na §3) — ato do Joaquim.
2. Autorizar o **lote 1-pequeno** (17 branches; 1 delas exige limpar worktree antes).
3. Autorizar, depois, o **lote 2-medio** em 3 lotes de ~81 (186 exigem limpeza de worktree antes).
4. **Não** autorizar nada do lote `3-grande` antes da prova da F03/F09: hoje ele não tem rollback nomeado
   por item além do CSV + a tag.

## 12. O que NÃO fiz (e por quê)

- Não deletei branch, tag, worktree nem stash (o cartão manda preparar e parar no gate).
- Não criei tag (guarda do repositório: `tags são do Joaquim`).
- Não rodei `git worktree prune`, `git branch -D`, `git fetch`/`prune` nem `git gc`.
- Não apliquei, descartei ou exportei stash; não abri conteúdo de worktree sujo; não toquei em banco.
- Não executei o teste de mutação sobre o CSV bruto: ele rodou sobre uma **cópia** em `.tmp`.
