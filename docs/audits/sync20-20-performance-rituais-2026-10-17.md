# SYNC20-20 - Performance/orcamento e rituais anti-re-divergencia (F22/F26)

- Cartao: `t_929f277a` - Plano: `docs/plans/PLANO_SINCRONIZACAO_TOTAL_LOCAL_GITHUB_BANCO_300_ETAPAS_2026-10-17.md`
  (commit `67da33fdea`; **F22 = etapas 221-230**, **F26 = etapas 261-270**) - Data: 2026-10-17 - Autor: worker (geral).
- Escopo: **doc apenas**. Nenhum arquivo de produto, nenhum workflow de CI, nenhuma automacao foi criada ou
  alterada. As regras e os gatilhos abaixo sao texto para o runbook (F23/F26) e para o humano que decide -
  virar automacao e outro cartao.
- Todos os numeros deste documento foram medidos nesta sessao (comando literal em cada secao). Nada foi estimado
  sem estar marcado como estimativa.

---

## 1. Fonte dos numeros (reproduzivel)

```bash
# tempo e tentativas por cartao (board real do Hermes, so leitura)
python3 - <<'PY'
import sqlite3
db="/mnt/c/Users/Joaquim Ataides/AppData/Local/hermes/kanban/boards/zapp-web-v2/kanban.db"
con=sqlite3.connect(f"file:{db}?mode=ro",uri=True)
# tasks(created_at,started_at,completed_at) + task_runs(started_at,ended_at)
PY

# custo de CI por workflow (so leitura, nao dispara nem altera run)
gh run list --repo adm01-debug/Zapp_Web_V2 --limit 100 --json workflowName,conclusion,createdAt,updatedAt

# custo do gate local
time zapp-verify . --rapido          # -> "VERIFY: VERDE SEM BANCO (74s)"

# divergencia e volume (clone de referencia, GIT_OPTIONAL_LOCKS=0)
git rev-parse origin/main
git rev-list --count HEAD ^origin/main
```

`task_runs` **nao tem coluna de tokens/custo** (`PRAGMA table_info(task_runs)` = id, task_id, profile,
step_key, status, claim_*, worker_pid, worker_started_at, max_runtime_seconds, last_heartbeat_at, started_at,
ended_at, outcome, summary, metadata, error). Ou seja: **token nao e instrumentado no board** - o orcamento
abaixo usa tempo (minutos medidos) e tentativas (runs) como moeda, e a secao 4 diz como instrumentar token.

---

## 2. Orcamento executado - tempo por trilha (medido 2026-10-17T14:23:48Z)

Base: **29 cartoes** do lote (`SYNC20-*` + `SYNC-AG*` no board), `SUM(ended_at - started_at)` em `task_runs`
e `completed_at - started_at` em `tasks`. Soma medida: **504,2 min de execucao e 32 runs**. O board e vivo
(outros cartoes fecham enquanto eu meco), entao o numero vale com a marca de tempo acima.

| Trilha | Cartoes | Minutos | Runs | Retrabalho (cartao com 2 runs) |
|---|---|---|---|---|
| Banco/artefatos | AG4, AG4b, 03, 04, 09, 10 | 105,9 | 7 | AG4 |
| Git/limpeza | AG1, 12, 13 | 91,0 | 3 | - |
| Front | AG2, 05, 06, 07 | 85,3 | 6 | 05, 06 |
| CI/qualidade | 01, 02, 14, AG5 | 74,5 | 4 | - |
| Integracao/merge | 21, 22, 23 | 69,9 | 3 | - |
| Mensageria/IA | 16, 17 | 23,8 | 2 | - |
| Documentos/ambientes | 15, 18 | 18,6 | 2 | - |
| Edge | AG3, 08 | 16,4 | 2 | - |
| Testes | 11 | 12,6 | 2 | 11 |
| **Total (27 cartoes + este + 19 bloqueado)** | **29** | **504,2** | **32** | **4 cartoes** |

Leitura do numero: **4 de 29 cartoes gastaram 2 runs** (14%) - o custo de retrabalho hoje e pequeno e
concentrado em Front (2 de 4) e Banco (1 de 4). Os cartoes mais caros foram os de **sintese/merge**
(`SYNC20-21` 59,5 min), **inventario Git** (`AG1` 39,1) e **replay do banco** (`09` 36,0) - nao os de
correcao. Cartao que so *le e documenta* e mais barato que cartao que *roda suite*.

## 3. Custo de CI medido (runs de 2026-10-17)

```bash
gh run list --repo adm01-debug/Zapp_Web_V2 --limit 100 --json workflowName,conclusion,createdAt,updatedAt
# TOTAL_RUNS_TODAY=62
```

| Workflow | Runs | Duracao media | Verdes | Falhas | Cancelados |
|---|---|---|---|---|---|
| CI/CD Pipeline | 23 | 457 s (7,6 min) | 0 | 12 | 11 |
| DB Guard (offline) | 23 | 119 s (2,0 min) | 0 | 19 | 4 |
| types-sync | 2 | 184 s | 0 | 2 | 0 |
| E2E logado | 2 | 86 s | 0 | 2 | 0 |
| E2E Talk X | 2 | 42 s | 0 | 2 | 0 |
| Talk X V4 placar regen | 2 | 16 s | 2 | 0 | 0 |
| Notifica falha na main | 8 | 9 s | 8 | 0 | 0 |
| **Total** | **62** | - | **10** | **37** | **15** |

- **232,9 min-maquina de runner em um dia** (13.976 s) para **zero verde** em qualquer workflow de produto.
- 15 cancelamentos sao custo puro (run iniciado e abortado) e vem do empilhamento de pushes na main - o
  sintoma exato do anti-padrao que a F26 quer matar.
- Consequencia pratica: enquanto a main estiver vermelha, **cada push queima ~7,6 min de CI/CD + ~2 min de DB
  Guard e nao informa nada**. O gatilho "main vermelha" (secao 7) existe para cortar esse desperdicio.

## 4. Custo de replay local (o que da para medir hoje)

```bash
time zapp-verify . --rapido
# OK dependencias 1s | OK db_guard 0s | OK tipos 72s | OK lint 1s | OK migrations 0s
# AVISO banco_local NAO VERIFICADO   VERIFY: VERDE SEM BANCO (74s)
```

- Gate rapido completo = **74 s**, dos quais **72 s sao o typecheck** (97%). E o unico passo pesado do gate;
  o resto e instantaneo.
- Rodar o gate uma vez por cartao nos 30 cartoes = **34,5 min** maquina - barato e ja embutido nas duracoes da secao 2.
- Replay do banco (aplicar o conjunto de migrations da origin no banco local) e o item **caro**: o cartao
  `SYNC20-09` gastou **36,0 min** so para achar a causa-raiz de 2 migrations quebradas no replay, e o
  `SYNC20-23` esta aberto para reconciliar **153 migrations**. Regra pratica: **1 replay por onda** (etapa 224),
  nunca 1 por cartao.
- Etapa 225 (1 suite pesada por vez) tem base medida: typecheck (72 s) e o pico; Vitest e o E2E logado sao as
  outras suites pesadas. Duas em paralelo nesta maquina nao cabem.

## 5. Tokens - lacuna medida e como fechar

Hoje **nao existe medicao de token** no board (secao 1). Para o orcamento da proxima sync nao ficar cego:

1. Instrumentar o fim de cada run com `metadata.tokens_in`, `metadata.tokens_out` e `metadata.model` no
   proprio handoff (`kanban_complete(metadata=...)`) - e o unico ponto que ja existe e nao muda nada em CI.
2. Enquanto isso, orcar por **minutos de execucao** (moeda medida) e por **runs** (retrabalho medido), com os
   tetos da secao 6.
3. Teto proposto para a proxima sync, derivado do medido: **cartao <= 45 min** e **<= 2 runs**; acima disso o
   cartao esta grande e deve ser partido (o maior medido foi 59,5 min em `SYNC20-21`).
4. Estado de falha e obrigatorio (`novo`, `continuacao`, `retrabalho`) no resumo do run - sem isso a taxa de
   retrabalho nao e comparavel entre cartoes.

## 6. Orcamento-alvo por trilha (proxima sync)

Derivado da secao 2 (medido) com folga de 20% - teto duro, nao meta:

| Trilha | Medido hoje | Teto por lote | Teto por cartao |
|---|---|---|---|
| Banco/artefatos | 105,9 min | 127 min | 45 min / 2 runs |
| Git/limpeza | 91,0 min | 109 min | 45 min / 2 runs |
| Front | 85,3 min | 102 min | 45 min / 2 runs |
| CI/qualidade | 74,5 min | 89 min | 45 min / 2 runs |
| Integracao/merge | 69,9 min | 84 min | 60 min / 3 runs (sintese pode repetir) |
| Mensageria/IA | 23,8 min | 29 min | 30 min / 2 runs |
| Documentos/ambientes | 18,6 min | 22 min | 30 min / 2 runs |
| Edge | 16,4 min | 20 min | 30 min / 2 runs |
| Testes | 12,6 min | 15 min | 40 min / 2 runs |
| **Lote** | **498,0 min** | **~597 min (10 h)** | - |

Etapa 228 do plano: variacao > 20% entre planejado e realizado exige adendo no plano. O teto acima **e** esse
limite de 20%.

## 7. Cadencia anti-re-divergencia (F26) com linha de base de 17/10

### 7.1 Linha de base 17/10 (medida; e o zero do termometro)

| Indicador | Base 17/10 | Fonte |
|---|---|---|
| `origin/main` | `a9b4d6c6fb` | `git rev-parse origin/main` |
| `dia/2026-10-17` | `d723a90107` | `git log -1 dia/2026-10-17` |
| dia ahead / behind de origin/main | **1.546 / 79** | `git rev-list --count` (sync20-13 §2) |
| Branches locais | **4.152** | sync20-13 (13:54Z) |
| Remotas / tags / stashes | 107 / 331 / 8 | sync20-13 §2 |
| Worktrees registrados | **3.351** | sync20-13 §2 |
| PRs abertas | **28** | plano §Diagnostico |
| Arquivos tracked (HEAD x origin) | 6.660 x 7.526; 905 origin-only | plano §Diagnostico |
| Migrations (HEAD x origin) | ~875 x 1.071; **197 origin-only** | plano §Diagnostico |
| Edge (HEAD x origin) | 81 x 84 | plano §Diagnostico |
| `supabase/tests` (HEAD x origin) | 22 x 91 | plano §Diagnostico |
| CI da main | **vermelha** (CI/CD, DB Guard, E2E logado, types-sync) | secao 3 |

### 7.2 Ritual DIARIO (etapa 261/262)

1. **Primeira acao do dia: `git fetch --prune`** em `~/projetos/Zapp_Web_V2`; a branch do dia nasce de
   `origin/main` atualizada (nunca de uma dia anterior).
2. **A branch do dia vive no maximo 1 dia util.** Teto duro: **<= 50 commits ahead de `origin/main`** no fim do
   dia. Base 17/10 = 1.546 (44x o teto) - foi assim que a dia virou rascunho impossivel de publicar.
   Estourou o teto: parada dura do item 7.4, o excedente vira PR aberto no mesmo dia.
3. **Um `zapp-verify . --rapido` por cartao** (74 s) antes de fechar; o gate completo da onda roda 1 vez.
4. Todo cartao fecha com **branch + commit + prova** (ja e regra do modo V2). Nada de trabalho fora de branch.

### 7.3 Ritual SEMANAL (etapa 263/264/265)

| Checagem | Comando | Teto (base 17/10) | Acao se estourar |
|---|---|---|---|
| Branches locais | `git for-each-ref --format='%(refname:short)' refs/heads | wc -l` | <= 3.700 (base 4.152) | lista de limpeza com OID (F18), sem deletar |
| Worktrees orfaos > 7 dias | `git worktree list --porcelain` | lista vazia | aviso automatico, **nunca** delecao automatica (etapa 264) |
| Branches `v2/*` sem PR ha > 15 dias | `gh pr list --state all` x refs | 0 | entra em revisao de obsoleta (etapa 265) |
| PRs abertas | `gh pr list --state open | wc -l` | <= 10 (base 28) | fechar/mergear antes de abrir nova |
| Drift de migrations | ledger x `origin/main` | **0 origin-only** (base 197) | bloqueia a trilha banco; regenerar do canonico |
| CI da main | `gh run list --branch main -L 5` | 100% verde | parada dura do item 7.4 |

### 7.4 Rituais MENSAIS (etapa 269) e dono

- Revisao de tags, branches arquivadas e `ESTADO.md` contra os numeros medidos (base secao 7.1).
- Replay completo do conjunto `origin/main` no **banco local** (nunca producao) - 1 vez por mes, medido.
- Regenerar `types.ts`, catalogo e `schema-manifest` **so do canonico provado** (etapa 266) e conferir identidade.
- **Dono nomeado:** o coordenador da fabrica nomeia, no runbook, **1 dono por ritual**; a verificacao semanal
  (etapa 263) precisa de dono explicito antes do Gate F26 (etapa 270). Sugestao operacional (nao decisao minha):
  Git/limpeza -> dono de CI (`vera`); banco -> dono de banco (`workersql`); front -> dono de telas (`iris`).

## 8. Gatilhos de parada (F27/R8 - o que para o que)

### 8.1 Parada DURA - para todas as trilhas e chama o Joaquim (com pelo menos um lote por instrumentacao)

1. **CI da main vermelho em 2 runs consecutivas de um workflow de produto** (base: hoje sao 37 falhas / 0 verdes).
   Nenhum merge ate a main verde; a F16 ja e pre-requisito da F24.
2. **Segredo ou dado real no diff / no log / no PR.** Para tudo, redige antes de continuar (F21).
3. **Delecao em lote (branch, worktree, tag) sem CSV com OID restauravel.** Sem lista, nao ha limpeza (F18/F27).
4. **Migration aplicada ou deploy sem ordem nominal do Joaquim.** Guard do repo ja bloqueia; o gatilho e nao tentar contornar.
5. **`main` local != `origin/main` com PR ja despachado.** Divergencia de base: parar e re-sincronizar antes de abrir novo cartao.
6. **Custo novo / mudanca de infra/DNS** (F28 etapa 289).

### 8.2 Parada MOLE - bloqueia so o cartao, registra e segue a fila

1. **Etapa/correcao falhou 3 vezes** (etapa 226): vira `kanban_block(kind=capability|needs_input)` com o erro
   literal, nunca insistencia silenciosa.
2. **Cartao passou de 60 min** ou **2 runs** sem fechar: partir o cartao (secao 6).
3. **Replay local falha** e a causa nao aparece em 1 tentativa: bloqueia e devolve como causa-raiz (foi o que
   funcionou no `SYNC20-09`).
4. **Teste novo nao fica vermelho sem a correcao** (prova invalida): refazer o teste antes de fechar.
5. **Falta credencial/acesso RO**: bloqueia com o nome da variavel, nunca procura segredo em disco.

## 9. Amarracoes ao plano (prova dos gates)

- **Etapa 230 (Gate F22)** - "custo e prazo reais registrados e comparados com a estimativa da secao de ondas":
  prova = secao 2 (504,2 min realizados no lote) x secao 6 (teto ~597 min, +20%). Dentro do teto.
- **Etapa 270 (Gate F26)** - "rituais no runbook e dono nomeado para a verificacao semanal":
  prova = secao 7 (cadencia diaria/semanal/mensal + linha de base 17/10) e secao 7.4 (dono nomeado). O texto
  pronto para colar no runbook da F23 e a secao 7 inteira.
- **Etapas 221-229** (regras de economia) ficam cobertas por: 221/223 -> secoes 2 e 6; 222/227 -> so leitura de
  excecao e revisao por diff (ja praticado no lote); 224 -> 1 replay por onda (secao 4); 225 -> 1 suite pesada por
  vez (secao 4); 226 -> gatilho 8.2.1; 228 -> teto de 20% (secao 6); 229 -> nenhuma economia pula prova.
