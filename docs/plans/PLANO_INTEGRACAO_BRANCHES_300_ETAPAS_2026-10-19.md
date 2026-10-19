# Plano de integração de branches — 300 etapas (2026-10-19)

> **Objetivo:** sobrar só a `main`. Todo conteúdo útil das outras 153 branches entra na `main` (ou é
> descartado com prova de que já está lá / é obsoleto), cada branch ganha uma **tag de arquivo** antes de
> ser apagada, e nenhuma PR fica aberta sem dono.
>
> **Quem executa:** agente executor (modelo mais barato). **Quem decide:** Joaquim, só nos pontos
> marcados **[J]**. Este documento é autossuficiente: não é preciso reanalisar o repositório inteiro.
>
> **Medição de origem:** `origin/main` = `ee2947491` (2026-10-18 21:12), 153 branches remotas além da
> `main`, 82 PRs abertas. Toda medição deste plano foi feita com `git merge-tree --write-tree` (merge real,
> sem tocar em nada) e com a API do GitHub. Se a `main` tiver andado quando você começar, refaça a
> etapa **E006** antes de confiar nos números.

---

## 1. Diagnóstico (o que foi encontrado)

### 1.1 Números

| Situação da branch em relação à `main` | Qtde | O que significa |
|---|---|---|
| **Absorvida** (merge com a `main` não muda nenhum arquivo) | 7 | conteúdo já está na `main`; só falta apagar |
| **Merge limpo** (sem conflito, muda N arquivos) | 92 | integrável, mas muita coisa é duplicata ou obsoleta |
| **Conflito** | 54 | precisa de rebase, triagem ou descarte |
| PRs abertas | 82 | 33 do lote F1a, 14 do RADAR Copiloto, 20 de CI, 3 dependabot, 12 outras |
| Branches sem PR nenhuma | 13 | `dia/*`, `backup/*`, 4 de docs, 4 de banco, `fix-plano-190` |

Grupos usados no inventário (seção 6):

| Grupo | Qtde | Conteúdo |
|---|---|---|
| G0 | 7 | absorvidas — só apagar |
| G2 | 6 | consertam a `main` vermelha — **primeiro** |
| G3 | 21 | CI / governança / edge pequenas (séries W, GA, Z, E) |
| G4 | 2 | mega-branches `sharp-faraday` (351 arq.) e `charming-mccarthy` (398 arq.) |
| G5 | 32 | lote F1a (correções de teste e pequenos bugs, 1 PR por arquivo) |
| G6 | 21 | RADAR Copiloto (14 canônicas + 7 duplicatas) |
| G7 | 14 | snapshots diários, backups, lote 880, codex, hermes de produto |
| G8 | 41 | legado de banco/CI de 26–28/09 e 01–02/10 (base 300–1450 commits atrás) |
| G9 | 6 | planos em `.md` |
| G10 | 3 | dependabot |

### 1.2 Falhas e lacunas (achados)

| # | Achado | Prova | Efeito no negócio | Onde se resolve |
|---|---|---|---|---|
| A01 | **A `main` está vermelha.** No commit `ee2947491` falham CI/CD (TypeCheck + Unit Tests 1/3, 2/3, 3/3 + E2E), DB Guard offline, E2E logado, Deploy Edge Functions, talkx-status-regen, types-sync e DB Live Guard. | runs 39179756055, 39179756065, 39250234085, 39206940746, 39212157834 | Com `strict=true`, **nenhuma PR consegue ficar verde** enquanto a base estiver vermelha. Bloqueia todo o resto. | Fase 2 |
| A02 | `talkx-status-regen.yml` tem a chave `concurrency:` **duas vezes** → YAML inválido, o GitHub nem cria job (falha a cada push). | linhas 38–45 do arquivo na `main` | placar do Talk X parado; ruído vermelho a cada merge | E041 (PR #2042) |
| A03 | TypeCheck: `useTalkXSuppression.ts(365)` TS2322 (`reason_code` string vs união). Ratchet: baseline 93, atual 92, **1 nova**. | log do job 117829799588 | bloqueia o check obrigatório "Lint & TypeCheck" | E046 (PR #2091) |
| A04 | Unit Tests: módulos chamam `createLogger` no import (`invokeEdge.ts:36`, `useOfflineCache.ts:5`) e os mocks locais de `@/lib/logger` não exportam `createLogger`; `src/test/setup.ts` não tem mock global. | logs dos 3 shards | bloqueia "Unit Tests" | E051 (PR #2035) |
| A05 | DB Guard offline falha no passo "Testar comparadores de catálogo, manifesto e migrations" (usuário do Postgres). | job 117829800380 | bloqueia "Contrato DB offline" | E056 (PR #2104, só o commit PGUSER) |
| A06 | **`settings-guard.yml` e `auto-update-pr-branch.yml` foram apagados da `main`** em 16/10 (commit `5721e4f50`, "limpa environments E94"). O `CLAUDE.md` ainda diz que existem e que o settings-guard "restaura" o perímetro. | `git log --diff-filter=D` | perímetro do GitHub sem vigia; PRs `BEHIND` não se atualizam sozinhas com `strict=true` | E101 (PR #2056) + D1 |
| A07 | **Contradição de política `strict`.** PR #2078 (`f3/strict-false-baseline`) grava `strict=false` no baseline ("decisão 18/10, opção A"); o `CLAUDE.md` diz que `false` foi **revogado** em 02/10 e o ao vivo está `true`. | branch protection lida hoje: `strict: true` | se mergear sem decisão, o settings-guard vira contra a configuração real | **D1 [J]** |
| A08 | **Duas mega-branches sobrepostas.** `sharp-faraday` (#2054) e `charming-mccarthy` (#2040) estão em cima da `main` atual, mas conflitam entre si em 10 arquivos de CI e repetem dezenas de arquivos do F1a com conteúdo diferente. | merge-tree entre as duas | merge na ordem errada = retrabalho em 10 workflows | Fase 5 |
| A09 | **sharp-faraday apaga a migration `20261011000019`** ("órfã, sem ledger"). Apagar arquivo de migration exige conferir o ledger — se a version estiver registrada, o db-live-guard acusa. | commit `7ffa58d93` | risco de drift arquivo↔ledger | E143 |
| A10 | **RADAR Copiloto em 21 branches, 7 duplicadas.** Cada fase existe duas vezes (uma com PR aberta, outra com PR fechada). Todas criam `src/hooks/copilot/index.ts` e `src/components/copilot/index.ts` (16 branches no mesmo arquivo → conflito add/add em cadeia). | sobreposição de arquivos | 14 merges em série = 14 conflitos | Fase 7 |
| A11 | **Migrations do RADAR com versão inválida.** `cv011-020` cria 6 migrations `20261016193000…193500` e `cv021-030` cria `20261016194000` — todas **menores** que a última da `main` (`20261016240000`). `cv031-040` cria `20261016200000_copilot_phase4…` que **colide** com `20261016200000_revoke_passkey_anon_insert.sql` já na `main`. | `ls supabase/migrations` | guard de migration reprova; se aplicado, ordem de replay quebra | E213–E215 |
| A12 | `cv011-020` **corta 395 linhas** de `docs/LGPD-RETENTION-POLICY.md` (commit "restaurar schema-catalog… vazio acidentalmente" sugere edição acidental). | diffstat | perda de documentação de LGPD | E214 |
| A13 | **Lote F1a: 32 PRs de 1 arquivo, cada uma com commit "chore(fmt): prettier" do arquivo inteiro.** Diff de 1 linha de lógica vira 100–470 linhas. Várias mexem nos mesmos arquivos que sharp/charming com conteúdo diferente. | diffstat (ex.: `WhatsAppTemplatesManager.tsx` +408/−77) | revisão impossível; 32 ciclos de CI de ~6 min com `strict=true` | Fase 6 |
| A14 | **PRs duplicadas na série GA.** #2033 (GA09) ⊂ #2100; #2103 (GA62/GA75) mexe nos mesmos 4 arquivos que #2100. | sobreposição | merge das três = conflito | E097 |
| A15 | **Três PRs mexem na versão do Playwright** (#2093 Z024 "desafixar", #2044 W39 "versão dinâmica", #2051 W85). | sobreposição em `e2e-logado.yml`/`e2e-talkx.yml` | regressão no E2E obrigatório | E117–E118 |
| A16 | #2041 (W13/W48) está **aberta mas já absorvida**. | merge-tree = árvore da `main` | PR fantasma | E074 |
| A17 | **lote/2026-10-16-880-cards (#1983 aberta)** já está no squash `025d0258d` (3.113 de 3.115 arquivos idênticos). | comparação por blob | PR fantasma de 3.115 arquivos | E262 |
| A18 | **Branches `dia/*` e `backup/*` (4)** são snapshots pré-lote: 370–1.543 commits, base 04/10. Amostra de 80 arquivos divergentes: em 80/80 a versão da `main` é mais nova. 17 arquivos só existem no backup e foram **apagados de propósito** pelo lote (ex.: `CampaignsView.tsx`). | `git log --diff-filter=D` | ruído; nenhuma perda | E263–E264 |
| A19 | **Legado de banco (G8) colide com versões já ocupadas na `main`.** Ex.: branches criam `20260927430000_fix_execute_public…`, `20260927440000_fix_gaps…`, `20260930140000_harden_default…` — a `main` já tem **outros arquivos** nessas versions. | `ls-tree` | mergear = colisão de version / drift | Fase 8 (nunca mergear) |
| A20 | `hermes/v06-replay-safe-autorizado` **edita migration já aplicada** (`20260916230000`). | diff | quebra a regra "nunca editar migration existente" do db-guard | E256 |
| A21 | `pensive-cori` (#2023) é **superada**: a `main` já exporta `nextBestActionKey` e tem um só `isOverdue`. | grep | PR fantasma | E081 |
| A22 | `ci/cors-zappweb-app-br` é **superada**: `zappweb.app.br` já está em `_shared/cors-origins.ts`. | grep | — | E270 |
| A23 | `fix-ci-tests` (#2098): 9 dos 11 arquivos são **idênticos** aos da `sharp-faraday`. | comparação por blob | duplicata | E066 / E150 |
| A24 | Nomes com data impossível ou fora do padrão: `…-291029-1520`, `…-261029-1400`, `…-270927-…` (dia 29/10, 27/09 escrito como 270927), `claude_pink/…`, `f3/…`, `fix/f1a-lote-b-batchN` sem carimbo. | nomes | `branch-hygiene-audit` não consegue datar; regra do Joaquim pede `claude/<tipo>-<slug>-<AAMMDD-HHMM>` | E293 |
| A25 | `types-sync` falha **todo dia** no gate e o `db-live-guard` falha no veredito — alertas viram ruído e escondem drift real. | runs de 19/10 | drift real passa despercebido | E110–E111, E297 |
| A26 | Branch Hygiene Audit de 19/10 terminou **cancelado**. | run de 08:04 | ninguém vê branches velhas | E294 |
| A27 | 3 planos `.md` existem só fora da `main` (`PLANO_CORRECOES_190_ETAPAS`, `PLANO_CONTATOS_CABECALHO…`, `PLANO_ORDEM_BANNER…`); 1 plano de 200 etapas está dentro de #1979. | diff | trabalho planejado invisível | E274 |

---

## 2. Decisões do Joaquim (antes ou durante a execução)

| ID | Decisão | Opções | Recomendação | Bloqueia |
|---|---|---|---|---|
| **D1** | `strict` da branch protection | (a) manter `true` (política do `CLAUDE.md`) e restaurar o `auto-update-pr-branch`; (b) `false` (PR #2078) | **(a) manter `true`** — é o que está ao vivo e o que protege a `main`; este plano já reduz o número de merges (consolidações), então o ciclo `BEHIND` cai de ~80 para ~25 merges | E101–E107 |
| **D2** | RADAR Copiloto (14 fases, ~16 mil linhas, 7 migrations, edge nova) | (a) integrar agora atrás de feature flag desligada; (b) arquivar em tag e retomar depois | **(a)** se o RADAR é prioridade comercial deste trimestre; senão **(b)** — custo zero e nada se perde | Fase 7 |
| **D3** | DDL em produção (migrations do RADAR, `20261016250000` revoke anon) | aplicar pelo `db-migrate.yml` após o merge | aplicar **depois** do merge e do deploy, pelo workflow com dry-run; você aprova o environment `producao-ddl` | E146, E232 |
| **D4** | Deploy de edge functions tocadas (copilot-live, external-db-proxy, cleanup-rate-limit-logs, searchbox-budget-alert, whatsapp-webhook, evolution-api…) | dispatch de `deploy-functions.yml` | um único dispatch no fim de cada fase que tocar edge; você aprova `producao-edge-functions` | E155, E170, E233 |
| **D5** | Merge de PRs que mexem em CI / workflows / settings (regra 8 das suas instruções) | aprovar por pacote | o plano agrupa em **4 pacotes** (CI-0, CI-1, CI-2, CI-3) para você aprovar 4 vezes, não 20 | Fases 2–4 |
| **D6** | Apagar as branches depois da tag | apagar / manter | **apagar** — a tag `arquivo/2026-10-19/<branch>` guarda o commit para sempre e pode recriar a branch em 1 comando | Fases 3, 8–10 |

Enquanto uma decisão **[J]** estiver pendente, o executor **pula** as etapas bloqueadas e segue nas demais.

---

## 3. Regras para o agente executor

1. **Leia o `CLAUDE.md` da raiz antes de começar.** Ele vence este plano em qualquer conflito.
2. **Nunca** commit, push, rebase ou force-push na `main`. **Nunca** reescreva histórico de branch de outro
   agente. Integração acontece **só** por PR com os 6 checks obrigatórios verdes.
3. Toda branch nova do executor: `claude/<tipo>-<slug>-<AAMMDD-HHMM>` (tipo = `fix` | `feat` | `chore` | `infra`),
   criada a partir da `main` atualizada.
4. **Nada é apagado sem tag de arquivo antes** (procedimento P1) e sem conferir que a tag existe no remoto.
5. **DDL em produção, segredos, deploy de edge e merge de workflow: só com [J].** O executor deixa a PR verde e
   avisa; não mergeia essas.
6. Escrita no GitHub: MCP `GITHUB - MCP - FOREVER` (o MCP padrão dá 403 em escrita).
7. Se uma etapa disser "verifique X" e X não bater com o esperado, **pare a etapa**, registre o que viu na
   tabela de execução (seção 7) e siga para a próxima etapa independente. Não improvise correção fora do plano.
8. Antes de cada merge: `github_list_pull_requests` (state=open) para ver se outra sessão abriu PR nos mesmos
   arquivos. Se abriu, pare e avise.
9. Toda PR aberta pelo executor termina com a linha de atribuição e cita as etapas (`E0xx`) que cumpre.
10. Ao fechar PR de outra sessão, comente **sempre** onde o conteúdo foi parar (commit/PR na `main`) ou por que
    foi descartado. Nunca feche em silêncio.

### 3.1 Procedimentos reutilizáveis

**P0 — Preparar o clone**
```sh
git fetch origin --prune --tags
git rev-parse --is-shallow-repository   # se "true": git fetch --unshallow origin
```

**P1 — Arquivar branch em tag** (obrigatório antes de apagar)
```sh
B="<branch>"; T="arquivo/2026-10-19/$B"
git tag -a "$T" "origin/$B" -m "arquivo da branch $B antes da limpeza (plano 300 etapas)"
git push origin "refs/tags/$T"
git ls-remote --tags origin "refs/tags/$T"   # tem que imprimir 1 linha com o mesmo SHA de origin/$B
```
Recriar no futuro: `git push origin "refs/tags/$T^{commit}:refs/heads/$B"`.

**P2 — Provar absorção** (a branch não traz nada novo)
```sh
B="<branch>"
t=$(git merge-tree --write-tree origin/main "origin/$B" | head -1)
[ "$t" = "$(git rev-parse 'origin/main^{tree}')" ] && echo ABSORVIDA || git diff --stat "origin/main" "$t"
```

**P3 — Fechar PR de outra sessão** (comentário padrão, depois `github_update_pull_request state=closed`)
```
Fechada pelo plano de integração de branches (docs/plans/PLANO_INTEGRACAO_BRANCHES_300_ETAPAS_2026-10-19.md, etapa E<nnn>).
Motivo: <absorvida na main em <sha/PR> | superada por <PR> | consolidada em <PR>>.
A branch foi arquivada na tag arquivo/2026-10-19/<branch> antes de ser apagada.

---
_Generated by [Claude Code](https://claude.ai/code)_
```

**P4 — Apagar branch remota** (só depois de P1 conferido): `github_delete_branch` (MCP FOREVER) ou
`git push origin --delete <branch>`. Conferir com `git ls-remote --heads origin <branch>` (saída vazia).

**P5 — Integrar PR pequena existente**
1. `github_update_pr_branch` (traz a `main` para a PR; merge commit, sem force-push).
2. Esperar os 6 checks obrigatórios. Vermelho → `github_get_run_failure_summary`; se a falha é da própria PR e
   cabe em ≤ 20 linhas, corrigir na **branch nova do executor** (P6), nunca na branch alheia.
3. Squash-merge (`github_merge_pull_request`, `merge_method=squash`). Conferir que a branch sumiu
   (`delete_branch_on_merge=true`); se não sumiu → P1 + P4.

**P6 — Consolidar várias branches numa branch de integração**
```sh
git switch -c claude/chore-integra-<slug>-<AAMMDD-HHMM> origin/main
git cherry-pick -x <sha1> <sha2> ...          # só os commits listados na etapa
# conflito: resolver mantendo a versão da main + o delta da branch; se não for óbvio → abortar esse commit,
# anotar na seção 7 e seguir
```
Depois: P7 → push → PR (draft→ready quando P7 passar) → P5 a partir do passo 2 → P3 em cada PR de origem
apontando para a PR consolidada → P1 + P4 em cada branch de origem.

**P7 — Portão local antes de qualquer push**
```sh
bun install --frozen-lockfile
node scripts/ci/typecheck-ratchet.mjs        # 0 novas
bun run lint                                  # ou: node scripts/ci/lint-ratchet.mjs
bun run test -- <arquivos de teste tocados>   # e, no fim de cada fase, bun run test completo
bun run build
node scripts/ci/check-workflow-pins.mjs       # se mexeu em .github/workflows
node scripts/db-audit/supabase-usage-guard.mjs   # se mexeu em supabase/ ou em chamadas .from()/.rpc()
```

**P8 — Verificar intenção na `main`** (para branch legada): pegar 1 marcador do diff da branch (nome de
função, string, nome de arquivo) e rodar `git grep -n "<marcador>" origin/main`. Achou equivalente →
"superada"; não achou → anotar como "intenção perdida" na seção 7 e **não** mergear a branch velha; vira
item novo para o Joaquim priorizar.

---

## 4. Ordem das fases

```
F0 Preparação ─► F1 Tags de tudo ─► F2 main verde ─► F3 limpeza rápida ─► F4 CI/GA/W/Z
                                                            │
                                    F5 mega-branches ◄──────┘
                                         │
                       F6 F1a ◄──────────┤
                       F7 RADAR (D2) ◄───┤
                       F8 legado banco ──┤  (independente, pode correr junto de F4)
                       F9 lotes/docs ────┘
                                         ▼
                              F10 dependabot + trava contra recaída
```

F2 é pré-requisito de tudo que precisa de CI verde. F1, F3, F8 e F9 só arquivam/apagam/fecham, então podem
rodar em paralelo com F4–F7.

---

## 5. As 300 etapas

### Fase 0 — Preparação e congelamento (E001–E020)

- **E001** — P0 no clone de trabalho. Pronto quando `git rev-parse --is-shallow-repository` = `false`.
- **E002** — Ler `CLAUDE.md` da raiz inteiro; anotar na seção 7 a data do "Atualizado em" e se algo diverge deste plano.
- **E003** — `github_get_branch_protection main`: conferir `strict`, `enforce_admins=true` e os 6 contexts. Anotar.
- **E004** — `github_list_pull_requests state=open per_page=100` (pode vir grande; filtrar com `node -e` por `number, head.ref, draft`). Comparar com as 82 da seção 6; anotar PRs novas.
- **E005** — Listar branches remotas (`git branch -r | wc -l`); anotar branches novas desde `ee2947491`.
- **E006** — Regerar a tabela de estado: para cada branch, `ahead/behind` (`git rev-list --count`), merge-tree contra `origin/main` (ABSORVIDA/LIMPA:n/CONFLITO:n). Se a `main` andou, atualizar a coluna "Merge com main" da seção 6.
- **E007** — Para cada branch nova (E005), classificar num dos grupos G0–G10 com o mesmo critério e acrescentar ao fim da seção 6.
- **E008** — Ler `docs/ci/README.md` e confirmar a lista de workflows da `main` (hoje 14 arquivos; sem `settings-guard.yml` e `auto-update-pr-branch.yml`).
- **E009** — Rodar P7 completo na `main` local e salvar o resultado (quais checks falham localmente) na seção 7 — é a linha de base da Fase 2.
- **E010** — Abrir issue "Plano de integração de branches — acompanhamento" com o link deste arquivo e a tabela de fases (P3 com footer). Esta issue recebe 1 comentário por fase concluída.
- **E011** — Comentar em cada PR **aberta** do grupo G5 (F1a) e G6 (RADAR) uma única vez: "Esta PR será consolidada pelo plano de integração (E<etapa>); por favor não empurrar commits novos nela." (evita sessão paralela empurrando no meio).
- **E012** — Idem para #2040 (charming) e #2054 (sharp).
- **E013** — Conferir se existe tag `arquivo/` no remoto (`git ls-remote --tags origin 'arquivo/*' | wc -l`). Esperado 0; se houver, não sobrescrever.
- **E014** — Conferir o espaço livre local (`df -h .`); cada tag é só um ponteiro, mas os clones de integração precisam ~2 GB.
- **E015** — Confirmar acesso de escrita do MCP FOREVER com `github_get_me` + `github_rate_limit` (precisa de folga ≥ 2.000 chamadas).
- **E016** — Registrar no topo da seção 7: SHA da `main` no início da execução, hora, nº de branches e de PRs.
- **E017** — Perguntar ao Joaquim as decisões **D1 e D2** (só elas bloqueiam fases inteiras). Seguir sem esperar.
- **E018** — Verificar se o `branch-hygiene-audit.yml` apaga branches sozinho (ler o arquivo). Se apagar, pausar a execução dele até a Fase 10 com `github_disable_workflow` **[J]** — evita apagar algo antes da tag.
- **E019** — Verificar se o `auto-update-pr-branch.yml` existe na `main` (esperado: não). Anotar — sem ele, PRs `BEHIND` precisam de `github_update_pr_branch` manual (P5.1).
- **E020** — Fechar a Fase 0: comentário na issue de E010 com o resumo de E003–E019.

### Fase 1 — Tag de arquivo para TODAS as branches (E021–E035)

> Tag antes de qualquer outra coisa: a partir daqui nada se perde, mesmo que uma etapa posterior erre.

- **E021** — Gerar a lista `branches.txt` (todas as remotas exceto `main` e `HEAD`).
- **E022** — Script de tags em lote (rodar local, não push ainda):
  ```sh
  while read B; do git tag -a "arquivo/2026-10-19/$B" "origin/$B" -m "arquivo pré-limpeza: $B" ; done < branches.txt
  ```
- **E023** — Conferir: `git tag -l 'arquivo/2026-10-19/*' | wc -l` = nº de linhas de `branches.txt`.
- **E024** — Conferir SHA a SHA: para cada B, `git rev-parse "arquivo/2026-10-19/$B^{commit}"` = `git rev-parse origin/$B`. Zero divergências.
- **E025** — Push das tags do grupo G7 (dia/backup/lote/codex — as mais pesadas) primeiro: `git push origin 'refs/tags/arquivo/2026-10-19/dia/*' …` (uma por vez se o push recusar em lote).
- **E026** — Push das tags G8 (41).
- **E027** — Push das tags G5 (32) e G6 (21).
- **E028** — Push das tags G0, G2, G3, G4, G9, G10.
- **E029** — Conferir no remoto: `git ls-remote --tags origin 'refs/tags/arquivo/2026-10-19/*' | wc -l` = total da E023.
- **E030** — Conferir 5 tags aleatórias com `github_get_ref` (MCP) — SHA igual ao da branch.
- **E031** — Se algum push de tag falhar por rede, repetir com espera 2s/4s/8s/16s; se falhar por regra (ruleset de tags), parar a fase e avisar o Joaquim.
- **E032** — Gerar `docs/plans/PLANO_INTEGRACAO_BRANCHES_300_ETAPAS_2026-10-19.tags.txt` com `branch → SHA → tag` (vai no PR de fechamento da Fase 10, não agora).
- **E033** — Garantir que tag não dispara workflow: conferir que nenhum `on: push: tags:` existe em `.github/workflows` (`grep -n "tags:" .github/workflows/*.yml`). Se existir, avisar antes de E025.
- **E034** — Registrar na seção 7 o total de tags e o horário.
- **E035** — Fechar a Fase 1 com comentário na issue de E010.

### Fase 2 — Deixar a `main` verde (E036–E070) — pacote **CI-0 [J]**

> Pré-requisito de tudo que precisa dos 6 checks. Ordem pensada para cada merge destravar o seguinte.

- **E036** — Confirmar os 5 sintomas de A01–A05 no último run da `main` (`github_list_workflow_runs branch=main`). Se algum já estiver verde, pular a etapa correspondente.
- **E037** — Confirmar que nenhuma outra sessão abriu PR nova para os mesmos sintomas (busca por "TS2322", "createLogger", "PGUSER", "concurrency" nas PRs abertas).
- **E038** — Ler a PR #2042 (`claude/w32-w94-migrations-concurrency`): 3 arquivos (`talkx-status-regen.yml` −3 linhas da `concurrency` duplicada, `docs/MIGRATIONS.md`, `scripts/ci/ci-docs-baseline.unit.mjs`).
- **E039** — Validar o YAML localmente: `node -e` com um parser YAML (ex.: `bunx yaml-lint .github/workflows/talkx-status-regen.yml` ou `npx --yes js-yaml …`) — sem chave duplicada.
- **E040** — Rodar `node scripts/ci/ci-docs-baseline.unit.mjs` na branch da #2042.
- **E041** — P5 na #2042 **[J]** (workflow). Pronto quando o próximo push na `main` gerar run do "Talk X V4 placar regen" **com job**.
- **E042** — Se #2042 ficar vermelha só por causa de A03/A04 (base vermelha), não corrigir nela: seguir para E043 e voltar depois.
- **E043** — Ler a PR #2091 (`claude/fix-z011bc-timing-safe`): `useTalkXSuppression.ts` (tipo `reason_code` união) + `timingSafeStringEqual` em 2 edges.
- **E044** — Conferir na sharp-faraday o commit `d5701893e` "reverter timingSafeStringEqual Z011 — `(ab[i] ?? 0)` quebra type-check do Deno": a #2091 usa essa forma? `git show origin/claude/fix-z011bc-timing-safe-261018-1855 -- supabase/functions/` e procurar `?? 0`.
- **E045** — Se a #2091 tiver o padrão que quebra o Deno, criar branch do executor só com a parte TS2322 (`src/hooks/integrations/useTalkXSuppression.ts`) e deixar a parte edge para E128. Senão, seguir com a #2091 inteira.
- **E046** — P7 (typecheck-ratchet deve dar `novas=0`) e P5 da PR escolhida em E045. Pronto quando o job "🔎 TypeCheck" da `main` ficar verde.
- **E047** — Rodar `deno check` nas 2 edges tocadas (se a #2091 inteira foi): `deno check supabase/functions/searchbox-budget-alert/index.ts supabase/functions/whatsapp-webhook/index.ts`.
- **E048** — Ler a PR #2035 (`claude/fix-logger-vitest-mock`): mock global de `@/lib/logger` em `src/test/setup.ts` (+27 linhas).
- **E049** — Conferir que o mock global exporta **tudo** que `src/lib/logger.ts` exporta (`createLogger`, `logger`, tipos): `git grep -n "^export" origin/main -- src/lib/logger.ts`.
- **E050** — Rodar localmente `bun run test` com a #2035 aplicada; anotar quantos testes ainda falham e quais (devem cair muito).
- **E051** — P5 na #2035. Pronto quando os 3 shards de Unit Tests deixarem de falhar por `createLogger`.
- **E052** — Se ainda houver falha de shard por outro motivo, registrar arquivo e erro na seção 7 (vira entrada de E061/E066).
- **E053** — Ler a PR #2104 (`claude/fix-db-guard-pguser`): 2 commits — (1) `PGUSER=postgres` no `db-guard.yml`; (2) GA75/GA77 que **cria** `settings-guard.yml` e mexe em `github-settings-guard.mjs` e `CLAUDE.md`.
- **E054** — Criar branch do executor `claude/fix-db-guard-pguser-<AAMMDD-HHMM>` a partir da `main` e `git cherry-pick -x` **só** do commit PGUSER.
- **E055** — Rodar localmente o passo do db-guard que falhava (ver nome no YAML: "Testar comparadores de catalogo, manifesto e migrations") com `PGUSER=postgres` e o `docker-shim` conforme `CLAUDE.md`.
- **E056** — PR + P5 **[J]** (workflow). Pronto quando "Contrato DB offline" ficar verde na `main`.
- **E057** — Comentar na #2104 que o commit PGUSER entrou via a PR de E056 e que o commit settings-guard será tratado em E101 (não fechar ainda).
- **E058** — Ler a PR #2097 (`fix-unit-tests-main`): `useKnowledgeBase.ts`, `useTalkXSegments.ts`.
- **E059** — Conferir sobreposição com `fix/f1a-lote-b-useknowledgebase`, `fix/f1a-lote-b-talkxsegments` e com a sharp-faraday (os 4 mexem nesses 2 arquivos). Decidir: a #2097 é a menor (28+/9−) e sem prettier → **ela entra; as outras serão revalidadas depois**.
- **E060** — Atualizar a #2097 com a `main` (P5.1) e rodar os testes dos 2 hooks.
- **E061** — P5 na #2097.
- **E062** — Investigar o E2E sem autenticação que falhou na `main` (job "🎭 E2E Tests (Playwright)" do run 39179756055): baixar o artifact de relatório (`github_list_run_artifacts` + `github_download_artifact`) e listar specs vermelhos.
- **E063** — Se os specs vermelhos forem consequência de A03/A04 (build/teste), re-rodar o CI da `main` depois de E061 (`github_rerun_workflow` uma vez) e conferir.
- **E064** — Se continuar vermelho, abrir branch do executor `claude/fix-e2e-main-<ts>` com a correção mínima do spec/código; nunca `test.skip`/`test.fixme` (regra do `CLAUDE.md`).
- **E065** — P5 na correção de E064.
- **E066** — Rodar P2 na `claude/fix-ci-tests-261019-1200` (#2098). Se ainda trouxer algo que a `main` não tem e que não está na sharp-faraday → manter para E150. Se não → P3 ("superada pela sharp-faraday/E041–E061") e P4.
- **E067** — Verificar o run do `Deploy Edge Functions (all)` que falhou em push na `main`: é o workflow de **verificação** (não de deploy)? Ler o log; se a falha for a mesma de A03, deve sumir após E046.
- **E068** — Verificar o `E2E logado` (push na `main`): se ainda vermelho, registrar na seção 7 (será tratado pelo pacote GA em E098/E117).
- **E069** — Conferir o próximo push na `main`: CI/CD, DB Guard offline e talkx-status-regen **verdes**. Pronto quando os 6 checks obrigatórios estiverem verdes no HEAD da `main`.
- **E070** — Fechar a Fase 2 com comentário na issue (lista de PRs mergeadas e SHA da `main` verde).

### Fase 3 — Limpeza rápida: absorvidas, duplicadas e superadas (E071–E095)

- **E071** — Rodar P2 de novo nas 7 G0 (a `main` mudou na Fase 2). Todas devem continuar ABSORVIDA.
- **E072** — `automation/types-sync`: P4 (tag já feita em E022). Observação: o `types-sync` recria essa branch quando abrir nova PR — isso é esperado e a branch some no merge.
- **E073** — P4 em `claude/fix-migration-evidence-hash-261029-1400`, `claude/friendly-mccarthy-g4xd5z`, `claude/w35-bun-cache`, `claude/w70-deploy-paths-ignore`, `hermes/tarefas-b4-concluidas-7d-26093006501293`.
- **E074** — #2041 (`w13-w48`): P3 ("absorvida na main") e P4.
- **E075** — Duplicatas do RADAR com PR fechada (7): conferir que cada uma tem par canônico aberto (tabela da seção 6, G6 "DUPLICATA"). Não apagar ainda — E212 faz isso depois de comparar conteúdo.
- **E076** — `claude/fix-e2e-logado-ga09-261017-1410` (#2033): diff contra #2100 em `e2e-logado.yml`. Se a #2100 contém a mesma `concurrency` → marcar para fechar em E097.
- **E077** — `claude_pink/cool-dijkstra-xk9ek2` (#2103): diff contra #2100 nos 4 arquivos. Anotar diferenças (a #2103 tira 7 linhas do baseline; a #2100 tira 3).
- **E078** — `claude/fix-fase2-rls-search-path-261018-1440` (#2094): `git diff origin/claude/fix-fase2-rls-search-path-261018-1440 origin/claude/sharp-faraday-qfortu -- supabase/migrations/20261016250000_revoke_anon_write_grants_all_tables.sql` deve sair vazio (medido: vazio). Marcar #2094 como superada pela sharp (fechar em E146).
- **E079** — `lote/2026-10-16-880-cards` (#1983): repetir a comparação por blob contra `025d0258d` (esperado 3113/3115). Listar os 2 arquivos diferentes (`git diff --name-only 025d0258d origin/lote/2026-10-16-880-cards`).
- **E080** — Para os 2 arquivos de E079: P8. Se a `main` atual já tiver o equivalente → #1983 é superada (fechar em E262).
- **E081** — `claude/pensive-cori-i93zgf` (#2023): `git grep -c "export.*isOverdue" origin/main -- src/hooks/tasks/workItemAggregates.ts` = 1 e `nextBestActionKey` exportado → P3 ("superada") e P4.
- **E082** — `ci/cors-zappweb-app-br`: `git grep -n "zappweb.app.br" origin/main -- supabase/functions/_shared/` com resultado → P4 (PR #1899 já fechada).
- **E083** — `codex/talk-me-carousel-refinement-20260930`: P8 com o marcador do commit ("fila de espera" em `TalkMeView.tsx`). Superada → P4.
- **E084** — `hermes/a11y-aria-hidden-focus-2610021746e07a`: P8 ("espera o app montar antes de medir" em `src/main.tsx`). Anotar resultado; P4.
- **E085** — `hermes/mapa-f4-p3-observabilidade-2610011830d2a2`: `git grep -n "location_sent" origin/main`. Se presente → P4; se ausente → anotar "intenção perdida: evento location_sent" na seção 7 e P4.
- **E086** — `docs/plano-talk-me-100-etapas` e `codex/docs-email-navy-plan-100-20261002`: o arquivo já existe na `main`; `git diff origin/main origin/<b> -- <arquivo>` — se a diferença for só formatação/metadado → P4. Se tiver seção nova → copiar para o PR de docs (E274).
- **E087** — `hermes/plano-volume-50-etapas-finalizacao-2610011018e48d` (PR #1395 mergeada): mesmo critério de E086.
- **E088** — `fix/migration-p1-001-timestamp-duplicate` (PR fechada, só `types.ts`): P4 (types.ts é gerado; nunca se mergeia à mão).
- **E089** — `codex/sincronizacao-canonica-20261016` (PR fechada, 2 arquivos): diff de `ChatMessagesArea.tsx` e `github-settings-guard.unit.mjs` contra a `main`; se a `main` já tem a estabilização de rolagem (`git grep -n "scrollTo" origin/main -- src/components/inbox/chat/ChatMessagesArea.tsx`) → P4.
- **E090** — Atualizar a seção 6 marcando como **APAGADA** cada branch desta fase.
- **E091** — Rodar `git fetch --prune` e confirmar a contagem de branches remotas (esperado: 153 − apagadas).
- **E092** — Conferir que nenhuma PR aberta ficou sem branch (`github_list_pull_requests` — PR com `head.repo=null` ou ref inexistente) → fechar com P3.
- **E093** — Conferir que nenhum workflow falhou por causa das deleções (runs de `delete` event).
- **E094** — Registrar na seção 7 a contagem: apagadas / fechadas nesta fase.
- **E095** — Fechar a Fase 3 com comentário na issue.

### Fase 4 — CI, governança e edges pequenas (E096–E140) — pacotes **CI-1, CI-2, CI-3 [J]**

> Todas mexem em `.github/workflows` ou `scripts/ci` — regra 8 do Joaquim: o executor deixa verde e
> pede o merge **por pacote**. Dentro do pacote, a ordem evita conflito.

**Pacote CI-1 — governança e perímetro (E096–E108)**

- **E096** — Pré-requisito: D1 respondida. Se não, fazer E097–E100 e pular E101–E107.
- **E097** — P3 + P4 em #2033 (`fix-e2e-logado-ga09`) e #2103 (`claude_pink/cool-dijkstra`) apontando para #2100 — **só** se E076/E077 confirmaram que a #2100 cobre as duas. Se a #2103 tiver algo a mais em `github-settings-baseline.json` que a #2100 não tem, cherry-pick dessa linha numa branch do executor sobre a #2100 (não na branch alheia).
- **E098** — #2100 (`fix-fase5-GA09-GA62-GA75-GA92`): P5.1, rodar `node scripts/ci/github-settings-guard.unit.mjs` e `node scripts/ci/actions-kpi.mjs --help` (sintaxe).
- **E099** — Conferir na #2100 a troca no `allowed-actions.json` (remove 1 ação): a ação removida não pode estar em uso (`grep -rn "<ação>" .github/workflows`).
- **E100** — Conferir que a #2100 muda o `CLAUDE.md` só nas linhas de CodeQL/agenda e que a tabela "Perímetro do GitHub" continua batendo com `scripts/ci/github-settings-baseline.json`.
- **E101** — #2056 (`fix/ci-f1b-restaura-workflows`): restaura `auto-update-pr-branch.yml` (203 linhas) e `settings-guard.yml` (77 linhas). Comparar com a versão apagada: `git diff 5721e4f50^:.github/workflows/settings-guard.yml origin/fix/ci-f1b-restaura-workflows-20261018:.github/workflows/settings-guard.yml`.
- **E102** — Comparar o `settings-guard.yml` da #2056 (77 linhas) com o da #2104 commit GA75/GA77 (64 linhas). Escolher **um** como base: o da #2056 (restaura o que existia) + aplicar por cima o delta GA75/GA77 da #2104 (endpoint corrigido, sem restauração automática) numa branch do executor.
- **E103** — Na branch de E102: `node scripts/ci/github-settings-guard.unit.mjs` e `node scripts/ci/check-workflow-pins.mjs`.
- **E104** — Conferir que o `auto-update-pr-branch.yml` restaurado tem o schedule **desligado** (commit "desliga schedule do auto-update-pr-branch antes de religar") e roda em `push` na `main` como o `CLAUDE.md` descreve.
- **E105** — Abrir PR consolidada "CI-1: restaura settings-guard + auto-update-pr-branch (GA75/GA77)" com os commits de E102; P3 em #2056 e #2104 apontando para ela, depois que ela mergear.
- **E106** — #2078 (`f3/strict-false-baseline`): se D1 = (a) **manter `true`** → P3 ("decisão D1 do Joaquim: strict permanece true") + P4. Se D1 = (b) → integrar a #2078 **e** atualizar a tabela "Perímetro do GitHub" do `CLAUDE.md` no mesmo PR (regra da tabela).
- **E107** — Pedir ao Joaquim o merge do pacote CI-1 **[J]**: #2100 + PR de E105 (+ #2078 se D1=b). Ordem: #2100 → E105 → #2078.
- **E108** — Após o merge: disparar `settings-guard` por `workflow_dispatch` e conferir que não acusa regressão (403 de campo administrativo = "NÃO VERIFICÁVEL", não falha — ver `CLAUDE.md`).

**Pacote CI-2 — workflows de PR, types-sync e testes (E109–E124)**

- **E109** — Criar branch do executor `claude/chore-integra-ci2-<AAMMDD-HHMM>` a partir da `main` (já com CI-1).
- **E110** — Cherry-pick do commit de #2037 (`fix-types-sync-ga20-ga21`): Gate 3 com `git show` e `DESTINO_URL` fora do `GITHUB_ENV`.
- **E111** — Cherry-pick de #2092 (`fix-z029-z015-summary-500`, +29 linhas no mesmo `types-sync.yml`). Resolver conflito juntando os dois blocos.
- **E112** — Cherry-pick de #2034 (`fix-notify-names-ga10-ga02`): 3 linhas no `ci.yml` + teste de contrato.
- **E113** — Rodar `node scripts/ci/workflow-contracts.unit.mjs`.
- **E114** — Verificar se os nomes de workflow que o teste GA10 exige batem com os `name:` atuais (o `notifica-falha-main.yml` lista nomes; um nome errado = notificação muda).
- **E115** — Comparar #1991 (`fix-codex-findings`, commit "corrige nomes de workflows no notificador") com E112/E114 — se for a mesma correção, anotar para fechar em E131.
- **E116** — Cherry-pick de #2057 (`feat/ci-lint-ratchet-base-f2b`, sem o merge commit): `lint-ratchet.mjs --base` + 129 linhas de teste. Rodar `node scripts/ci/lint-ratchet.unit.mjs`.
- **E117** — Cherry-pick de #2044 (`w39-w49-w50`): Playwright com versão dinâmica, `VITE_*` com escopo, CodeQL com dispatch. Rodar `node scripts/ci/ci-docs-baseline.unit.mjs`.
- **E118** — #2093 (`fix-z022-z024`, "desafixar Playwright"): comparar com E117. Se a W39 já resolve a versão → **não** aplicar a #2093; fechar com P3 depois do merge do pacote. Se a #2093 tiver algo além do Playwright → cherry-pick só desse algo.
- **E119** — Conferir a versão do Playwright resultante contra `package.json`/`bun.lock` (`grep -n playwright package.json`) — o runner tem de baixar a mesma versão que o projeto usa.
- **E120** — Cherry-pick de #2046 (`w45-draft-fast-exit`): pular jobs pesados em PR draft. **Atenção:** os 6 checks obrigatórios precisam continuar **reportando** em PR draft (com `skipped` o GitHub conta como sucesso só se o job existir); conferir que a condição está no nível de *step* ou que o job reporta. Se derrubar o reporte dos required checks, **não aplicar** e anotar.
- **E121** — Rodar P7 completo na branch CI-2 (inclui `check-workflow-pins.mjs`).
- **E122** — Push + PR draft "CI-2: types-sync, notificador, lint-ratchet, Playwright, draft fast-exit"; marcar ready quando os 6 checks passarem.
- **E123** — #2051 (`w85-w86-w87-ossf-scorecard`): **pacote separado (CI-3)** porque cria workflow novo (`scorecard.yml`) e **corta 18 linhas** do `allowed-actions.json`. Listar as ações removidas e provar com `grep -rn` que nenhuma está em uso; conferir que as ações novas do scorecard estão pinadas por SHA.
- **E124** — Pedir ao Joaquim o merge do pacote CI-2 **[J]**; após o merge, P3 em #2037, #2092, #2034, #2057, #2044, #2046 (+#2093 se superada) apontando para a PR de E122.

**Pacote CI-3 — rebases, edges e residuais (E125–E140)**

- **E125** — #2036 (`fix-db-migrate-ga04-ga05`, conflito em `db-migrate.yml`): branch do executor a partir da `main`, aplicar o delta à mão (console.error no heredoc + fixtures GA05). Rodar `node scripts/ci/db-migrate-contratos.unit.mjs`.
- **E126** — #1922 (`w10-mutacao-mapa-so-pr`, 1 commit útil + 3 merges): cherry-pick só de "fix(ci): mutacao do mapa so roda em pull_request (W10)" e resolver o conflito em `ci.yml`.
- **E127** — #1930 (`w21-classificar-migration-drift`): cherry-pick + resolver `check-migration-drift.test.mjs`; rodar o teste.
- **E128** — #2095 (`fix-z017-z020-auth-cors`): 2 edges (`external-db-proxy`, `cleanup-rate-limit-logs`) passam a usar `internalErrorResponse`. `deno check` nas duas; conferir que o 502 não vaza `code` interno. Se E045 separou a parte edge da #2091, aplicar aqui também (sem o `?? 0` que quebra o Deno).
- **E129** — #1975 (`fix-ci-reativar-suites`): resolver `check-test-inventory.mjs`; rodar `node scripts/ci/check-test-inventory.unit.mjs` e as 8 suítes reativadas, uma a uma. Suíte que falhar fica fora (não reativar quebrado).
- **E130** — Rodar `node scripts/ci/render-workflow-docs.mjs --check` (inventário gerado de workflows) e regenerar `docs/ci/README.md` se preciso.
- **E131** — #1991 (`fix-codex-findings`, 21 commits, conflito em 5): P8 para cada achado — `Number.isInteger` em `talkx-window.ts` (**já na main**), nomes do notificador (E115), dedup test N011, regex do contrato talkx-send, "Mais convertidos"→"Melhor resposta". Cherry-pick só do que faltar.
- **E132** — Juntar E125–E131 numa PR "CI-3" (ou 2 PRs se as edges precisarem de deploy separado).
- **E133** — Para as edges de E128: anotar a lista para o dispatch único de D4.
- **E134** — #1979 (`tender-heisenberg`, conflito em 4): extrair **só o plano** "200 etapas dos workflows em FAILURE" (doc) para o PR de docs (E274); os fixes de CI dela (E20, E62/E76 Playwright, E67/E69/E98) comparar com CI-2 — se cobertos, descartar.
- **E135** — #2051 (CI-3b, scorecard): P5 depois de E123 aprovado.
- **E136** — Pedir ao Joaquim o merge do pacote CI-3 **[J]**.
- **E137** — Após o merge: P3 em #2036, #1922, #1930, #2095, #1975, #1991, #1979, #2051 apontando para as PRs consolidadas; P4 nas branches.
- **E138** — Disparar `types-sync` por `workflow_dispatch` e conferir que o gate não falha mais (A25). Se falhar por drift real, **não** mexer no banco — registrar e avisar.
- **E139** — Conferir o `notifica-falha-main` no próximo vermelho simulado (ou no último run) — deve citar o nome certo do workflow.
- **E140** — Fechar a Fase 4 com comentário na issue (PRs mergeadas, fechadas, branches apagadas).

### Fase 5 — Mega-branches `sharp-faraday` e `charming-mccarthy` (E141–E175)

> As duas estão em cima da `main` de 18/10 mas conflitam entre si em 10 arquivos de CI. Ordem: **sharp
> primeiro** (segurança Z011–Z032 + requireAuth + split de node-scripts), **charming depois** (testes, a11y,
> âncoras do ESTADO.md, evolution-api).

- **E141** — `github_update_pr_branch` na #2054 (sharp). Conferir conflitos com o que entrou nas Fases 2 e 4 (os 10 arquivos de CI). Se houver conflito, **não** resolver na branch alheia: criar `claude/chore-integra-sharp-<ts>` a partir da `main` e fazer `git merge --no-ff origin/claude/sharp-faraday-qfortu`, resolvendo lá.
- **E142** — Listar os 68 commits da sharp (`git log --oneline origin/main..origin/claude/sharp-faraday-qfortu`) e agrupar por tema na seção 7 (segurança edge, testes, CI, migration, types).
- **E143** — **A09:** antes de aceitar a remoção de `supabase/migrations/20261011000019_n011_storage_drop_duplicate_avatar_policies.sql`, consultar o ledger em **leitura** (`SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '20261011000019'`). Se a version **existir** no ledger → **reverter** a remoção na branch de integração (arquivo fica). Se não existir → manter a remoção e conferir que o `migration-evidence.json` não referencia o arquivo.
- **E144** — Conferir que a sharp não reescreve outras migrations existentes: `git diff --name-status origin/main origin/claude/sharp-faraday-qfortu -- supabase/migrations | grep -v '^A'` deve listar só E143.
- **E145** — Conferir a migration nova `20261016250000_revoke_anon_write_grants_all_tables.sql`: versão > max da `main`? (`20261016240000` hoje) — sim. Se outra migration ocupou a 250000 nesse meio tempo → reservar nova version com `supabase_migrations.reserve_migration_version` (regra do `CLAUDE.md`) e renomear em **dois commits** (delete e create).
- **E146** — P3 na #2094 (`fix-fase2-rls-search-path`) apontando para a sharp; P4.
- **E147** — Rodar `node scripts/db-audit/supabase-usage-guard.mjs` (`novas: 0`) e `node scripts/db-audit/check-migration-drift.mjs` em modo offline.
- **E148** — Edges tocadas pela sharp (`_shared/cron-secret-auth.ts`, `evolution-api`, `external-db-bridge`, `get-sip-password`, `multiplix-send`, `talkx-report`, `webhook-diagnostic`): `deno check` em cada uma.
- **E149** — Conferir `supabase/deployment-manifest.json` regenerado (`node scripts/edge-deploy/…` conforme `docs/ci/README.md`); manifesto desatualizado reprova o CI.
- **E150** — Comparar a sharp com `fix-ci-tests` (#2098): os 2 arquivos que diferem (`CRMAutoSync.tsx`, `icon-buttons-baseline.json`?) — se a #2098 tiver correção que a sharp não tem, cherry-pick na branch de integração. Depois P3 + P4 na #2098.
- **E151** — P7 completo na branch de integração da sharp, incluindo `bun run test` inteiro (é a maior mudança do plano).
- **E152** — Rodar o E2E sem autenticação localmente (`bun run test:e2e --project=chromium`) apontando para o banco **local** (seção 0 do `CLAUDE.md`), nunca produção.
- **E153** — PR (ou atualizar a #2054 se não houve conflito) → P5. Esta PR mexe em workflow e DDL → **[J]**.
- **E154** — Após o merge: o DDL `20261016250000` **não** vai para produção pelo merge; registrar para o lote de `db-migrate.yml` (D3).
- **E155** — Edges da sharp entram na lista do dispatch único (D4).
- **E156** — `github_update_pr_branch` na #2040 (charming) **depois** da sharp na `main`. Esperado: conflitos nos 10 arquivos de CI + arquivos de teste comuns.
- **E157** — Criar `claude/chore-integra-charming-<ts>` a partir da `main` e `git merge --no-ff origin/claude/charming-mccarthy-jbxy56`. Regra de resolução: arquivo de CI → versão da `main` (já tem CI-1/2/3 e sharp) + só o delta que a charming adiciona e que não existe; arquivo de teste → a versão que passa no teste.
- **E158** — Commit "restaura W71 — workflow_run em vez de push na main" (`e2e-logado.yml`): conferir se a `main` já tem `workflow_run`; se não, manter. P3 + P4 em `claude/w71-e2e-logado-workflow-run` (PR #1941 já fechada) depois.
- **E159** — Conferir as mudanças de `supabase/functions/evolution-api/index.ts` (+108/−?): conflitam com a sharp (+28)? Juntar as duas; `deno check`; anotar para D4.
- **E160** — Conferir os commits "corrigir âncoras … ESTADO.md": rodar o verificador de âncoras do ESTADO (procurar em `scripts/ci` o script que valida `ESTADO.md`) e garantir 0 âncoras quebradas.
- **E161** — Conferir `vitest.config.ts` (a charming muda 1 linha): não pode tirar suítes do run.
- **E162** — Conferir a mudança de a11y (CommandPalette combobox/listbox, `aria-label` em CRMSyncButton): rodar `node scripts/ci/a11y-button-name-ratchet.mjs`.
- **E163** — P7 completo + `bun run test` inteiro.
- **E164** — PR + P5 **[J]** (mexe em workflow).
- **E165** — Após o merge: P3 na #2040 apontando para a PR de E164; P4.
- **E166** — Após o merge: P3 na #2054 (se E141 usou branch de integração); P4.
- **E167** — Rodar P2 em cada branch F1a (G5) contra a nova `main`: anotar quais ficaram ABSORVIDA (a sharp/charming já trouxe o conserto) — essas vão direto para P3/P4 na Fase 6.
- **E168** — Rodar P2 em `fix-unit-tests-main` (se ainda existir), `fix-z011bc`, `fix-ci-tests` — devem estar absorvidas/fechadas.
- **E169** — Conferir a `main` verde nos 6 checks após as duas mega-merges.
- **E170** — Pedir ao Joaquim **[J]** o dispatch único de `deploy-functions.yml` com as edges acumuladas (E133, E155, E159) e aprovar `producao-edge-functions` (D4).
- **E171** — Após o deploy: chamar `functions_ping`/requisição real em 2 edges alteradas (ex.: `external-db-proxy` com erro forçado → 502 sem `code`) e registrar a evidência.
- **E172** — Pedir ao Joaquim **[J]** o `db-migrate.yml` com `apply=false` (dry-run) para `20261016250000`; depois `apply=true` com o hash (D3).
- **E173** — Após o apply: conferir grants de `anon` em leitura (`SELECT … FROM information_schema.role_table_grants WHERE grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE')` = 0 linhas) e o `db-live-guard` verde.
- **E174** — Atualizar a seção 6 (charming, sharp, fix-ci-tests, fix-fase2, w71 = APAGADA).
- **E175** — Fechar a Fase 5 com comentário na issue.

### Fase 6 — Consolidar o lote F1a (E176–E210)

> 32 branches, 1 PR cada, cada uma com um commit de lógica + um commit "chore(fmt): prettier" do arquivo
> inteiro. Integração em **uma** PR, só com os commits de lógica. O prettier do arquivo inteiro fica fora
> (é churn — regra "zero churn" do Joaquim); se o lint exigir formatação, rodar prettier **só nas linhas tocadas**.

- **E176** — Listar, para cada branch `fix/f1a-*`, o SHA do commit de lógica e o do commit `chore(fmt)` (`git log --format='%h %s' origin/main..origin/<b>`).
- **E177** — Descartar as que E167 marcou como ABSORVIDA: P3 ("conserto já entrou pela sharp/charming") + P4.
- **E178** — Criar `claude/chore-integra-f1a-<AAMMDD-HHMM>` a partir da `main`.
- **E179** — Grupo "mocks de teste" (só arquivos `__tests__`): cherry-pick dos commits de lógica de `fix/f1a-lote-b-main` (createLogger em 9 testes — **reavaliar**: com o mock global de E051 pode ser desnecessário; se o teste passa sem o commit, não aplicar).
- **E180** — Cherry-pick: `fix/f1a-authprovider-mock-inbox-20261018`, `fix/f1a-lote-b-authprovider`.
- **E181** — Cherry-pick: `fix/f1a-framer-motion-mock-voicechangerpicker-20261018`, `fix/f1a-lote-b-batch2` (framer-motion `useReducedMotion`/`MotionConfig`).
- **E182** — Cherry-pick: `fix/f1a-logger-ttsvoice-mock-arquivos-conversa-20261018`, `fix/f1a-supabase-channel-mock-audiomeme-20261018`, `fix/f1a-lote-b-realtime-channel-mock`.
- **E183** — Cherry-pick: `fix/f1a-order-mock-usecustomemojis-20261018`, `fix/f1a-lote-b-useadmindata-select`, `fix/f1a-lote-b-admin-audit-page-size` (3 commits nesta).
- **E184** — Cherry-pick: `fix/f1a-lote-b-batch3` (canal do `useTeamReadState`), `fix/f1a-lote-b-batch10` (rpc em `GmailInboxView.paginacao`).
- **E185** — Cherry-pick: `fix/f1a-lote-b-connectioncard-dialog` — **atenção:** muda `ConnectionCard.tsx` (produto), não só teste; conferir `handleDisconnectDialogOpenChange` definido e o teste passando.
- **E186** — `fix/f1a-lote-b-gamificacao-sem-escrita` (apaga `mutations.test.tsx`): só aplicar se `src/hooks/gamification/mutations.ts` **não existe** mais na `main` (`git ls-tree origin/main src/hooks/gamification/`). Se o módulo existe, o teste não é órfão → não aplicar.
- **E187** — Rodar `bun run test` só nos arquivos de E179–E186. Todos verdes.
- **E188** — Grupo "produto" (muda comportamento): cherry-pick de `fix/f1a-lote-b-audiomemes-storage-path` (upload na pasta do usuário — PK-16/PK-17). Conferir que a policy do bucket exige pasta `auth.uid()/…`.
- **E189** — Cherry-pick: `fix/f1a-lote-b-batch4` (contagem de `whatsapp_connections` não derruba o diagnóstico), `fix/f1a-lote-b-batch5` (erro de leitura do `useUserSettings` visível).
- **E190** — Cherry-pick: `fix/f1a-lote-b-batch6` (NPSDashboard erro/teto), `fix/f1a-lote-b-batch7` (Leaderboard RPC caída ≠ vazio).
- **E191** — Cherry-pick: `fix/f1a-lote-b-batch8` (WhatsAppTemplatesManager com gate admin-only). Conferir com o RLS real da tabela de templates (leitura: `db_list_policies` só SELECT de catálogo) que a UI não promete o que o banco nega.
- **E192** — Cherry-pick: `fix/f1a-lote-b-batch9` (QueueCard nome acessível + toque).
- **E193** — Cherry-pick: `fix/f1a-lote-b-batch12` (`utilities.css` safe-area/scrollbar-none) — **só** as regras novas, sem reformatar o arquivo inteiro (+218/−126 é quase tudo prettier).
- **E194** — Cherry-pick: `fix/f1a-lote-b-batch13` (`ChatService.uploadAudio` respeita o MIME do Blob). Conferir que a extensão gerada bate com o MIME aceito pela Evolution GO.
- **E195** — Cherry-pick: `fix/f1a-lote-b-batch14` (fila offline por usuário; cria `src/lib/authSession.ts`). Alto impacto: rodar os testes de `outbound-message.service`, `useAuth` e `mediaVolumeStore`.
- **E196** — Cherry-pick: `fix/f1a-lote-b-hooks-misc-1` (overlay `role=alert/aria-live`) — conferir se a sharp/fix-ci-tests já não acrescentou o mesmo em `useScreenProtection.ts` (3 branches mexem nele).
- **E197** — Cherry-pick: `fix/f1a-lote-b-usewarroomalerts` (aviso de desktop sem exigir Service Worker).
- **E198** — Cherry-pick: `fix/f1a-lote-b-useteamchatnotifications` (canal estável, aviso sem SW, cache do inbox).
- **E199** — `fix/f1a-lote-b-talkxsegments` e `fix/f1a-lote-b-useknowledgebase`: comparar com o que a #2097 (E061) e a sharp/charming já trouxeram para `useTalkXSegments.ts` / `useKnowledgeBase.ts`. Aplicar **só** o delta que falta (ex.: `lead_origin` com `comingSoon`, `real_sector/real_uf` fail-closed, `KnowledgeBaseView` com erro visível).
- **E200** — `fix/f1a-lote-b-talkxsuppression-hook-morto` (remove hook `useTalkXSuppression`, TL-002): conferir com `git grep -n "useTalkXSuppression" origin/main -- src ':!*__tests__*'` que **ninguém** importa o hook. Se alguém importa → não remover; anotar.
- **E201** — `fix/f1a-lote-b-useadmindata-createuser-avatar` (avatar assinado + testes de `handleCreateUser`): cherry-pick; rodar os 3 testes do admin.
- **E202** — Rodar prettier **só nos arquivos tocados** e conferir que o diff não reformata trechos não tocados (`git diff --stat` por arquivo ≈ tamanho da lógica).
- **E203** — P7 completo + `bun run test` inteiro.
- **E204** — Push + PR "F1a consolidado: N correções de teste e M de produto" com tabela `branch → commit → arquivo → efeito` no corpo.
- **E205** — P5 até os 6 checks verdes (esta PR não mexe em workflow → o executor pode mergear se as regras do Joaquim permitirem front/teste; senão **[J]**).
- **E206** — Após o merge: P3 em cada uma das PRs #2058–#2090 do F1a com o link da PR consolidada (texto: "consolidada em #<n>; o commit de prettier do arquivo inteiro não entrou — churn").
- **E207** — P4 nas 32 branches `fix/f1a-*`.
- **E208** — Rodar P2 em qualquer `fix/f1a-*` que tenha sobrado (não deve sobrar nenhuma).
- **E209** — Registrar na seção 7 quais branches F1a foram descartadas e por quê (E177, E186, E200).
- **E210** — Fechar a Fase 6 com comentário na issue.

### Fase 7 — RADAR Copiloto (E211–E240) — depende de **D2**

> Se D2 = (b) arquivar: fazer só E211, E212, E238–E240 (P3 + P4 em todas, com a tag já feita). Se D2 = (a)
> integrar: tudo, numa branch de integração única, com a feature **desligada por padrão**.

- **E211** — Montar a tabela fase → branch canônica (PR aberta) → duplicata (PR fechada): 061-070 (2142 × 2200), 091-100 (2305 × 2240-lead-signals), 101-110 (0730 × 2310), 111-120 (0810 × 2315), 121-130 (2304 × 2320), 131-140 (2310-aprendizado × 2325-analytics), 141-150 (2317-piloto × 2330-integration).
- **E212** — Para cada par, comparar conteúdo: a duplicata tem arquivo útil que a canônica não tem (ex.: `AnalyticsDashboard.tsx` na 131-140-analytics, `RadarMasterPanel.tsx` na 141-150-integration)? Se sim, anotar o arquivo para cherry-pick em E227/E228; depois P4 na duplicata (PR já fechada).
- **E213** — Reservar versões de migration novas e **maiores** que a última da `main`: 1 chamada `SELECT supabase_migrations.reserve_migration_version('<sessao>', 'radar copilot <n>')` por migration (7 ao todo: 6 da fase 2 + `copilot_live_helpers`; + 1 da fase 4 = 8). Conferir também `ls supabase/migrations | tail` e PRs abertas (regra de alocação do `CLAUDE.md`).
- **E214** — Criar `claude/feat-integra-radar-<AAMMDD-HHMM>` a partir da `main`. Aplicar a fase 2 (`cv011-020`, 5 commits) **renomeando** as 6 migrations para as versions de E213 (arquivo novo, nunca existiu na `main` → pode nascer com o nome certo). **Não** aplicar o corte de 395 linhas em `docs/LGPD-RETENTION-POLICY.md` (A12): manter o arquivo da `main` e só **acrescentar** a seção do RADAR.
- **E215** — Atualizar `supabase/schema-catalog.json` só com as 5 tabelas `copilot_*` (sem esvaziar nada; conferir `git diff --stat` pequeno) e `scripts/db-audit/known-violations.json` se o guard pedir.
- **E216** — Fase 3 (`cv021-030`): `copilot-live/index.ts` + teste + `ai-response-contracts.ts` + migration `copilot_live_helpers` com a version de E213.
- **E217** — Fase 4 (`cv031-040`): aplicar **só** os arquivos de UI/hook/dados (`OccasionAlert`, `StageIndicator`, `StakeholdersCard`, `BrindeMeter.test`, `brinde-questions`, `commercial-calendar`, `useCopilotSession`). Ela traz cópia própria do `copilot-live` e da migration 194000 — **descartar** essas cópias; o delta de `ai-response-contracts.ts` (+87) aplicar por cima do E216. Migration `copilot_phase4_brinde_intelligence` com version nova (a 20261016200000 colide — A11).
- **E218** — Fase 5 (`cv041-050`): `LiveSuggestions`, `winning-plays`, `useLiveSuggestions`; o `copilot-live/index.ts` desta branch é uma reescrita (+644) — fazer diff contra o E216 e aplicar só as funções novas (tier-2). Rodar `deno test supabase/functions/copilot-live/`.
- **E219** — Fase 6 (`cv051-060`, conflito em 2 arquivos): cherry-pick só do commit "Fase 6 RADAR painel flutuante" e "defaultShortcuts RADAR"; **descartar** os commits `isOverdue`/`nextBestActionKey` (já na `main`, A21).
- **E220** — Fase 7 (`cv061-070`, canônica 2142): hooks `useGhostText`, `useVoiceDictation`, `useSmartTemplates`, `useAttachmentSuggestion`, `useCopilotFeedback` + mudança em `ChatInputArea.tsx` (+27). A mudança no input de chat deve ficar **atrás da flag** (sem flag ligada, o input se comporta igual).
- **E221** — Fase 8 (`cv071-080`): objeções, battlecard, desconto, risco de perda.
- **E222** — Fase 9 (`cv081-090`, 2 commits): catálogo, prazo reverso, rascunho de orçamento, mockup.
- **E223** — Fase 10 (`cv091-100-signals`): termômetro, sinais de compra, speed-to-lead, follow-up. Conferir com a duplicata (E212) se `useFollowUp`/`SilenceAlert` têm teste que vale trazer.
- **E224** — Fase 11 (`cv101-110-multimodal-0730`) + arquivos úteis da duplicata 2310 (ex.: `MultimodalInsightCard.tsx` + teste `useMultimodalContext`).
- **E225** — Fase 12 (`cv111-120-guardrails-0810`) + `usePrivacyGuard` + teste da duplicata 2315, se não houver equivalente.
- **E226** — Fase 13 (`cv121-130-supervisor-2304`) + `SupervisorPanel`/`useSupervisorView` + teste da duplicata 2320, se não houver equivalente.
- **E227** — Fase 14 (`cv131-140-aprendizado-2310`) + `AnalyticsDashboard`/`useCopilotAnalytics` + teste da duplicata 2325.
- **E228** — Fase 15 (`cv141-150-piloto-2317`) + `RadarMasterPanel`/`useRadarOrchestrator` + teste da duplicata 2330.
- **E229** — Barris `src/hooks/copilot/index.ts` e `src/components/copilot/index.ts`: reescrever **uma vez**, no fim, como a união ordenada dos exports de todas as fases; zero export duplicado (`tsc` acusa).
- **E230** — Feature flag: confirmar que todo ponto de montagem do RADAR na UI (inbox, ChatInputArea) lê a flag criada na fase 2 e que o padrão é **desligado**. Sem flag = não mergear.
- **E231** — P7 completo + `bun run test` + `deno test` do `copilot-live` + `supabase-usage-guard` (`novas: 0`) + `check-migration-drift` offline.
- **E232** — Validar as 8 migrations no **banco local** (`scripts/db-audit/replay-local.sh`, com `/etc/hosts` e `cron.launch_active_jobs=off` — regra 6 da seção 0 do `CLAUDE.md`). Nunca em produção nesta etapa.
- **E233** — PR "RADAR Copiloto CV-011–150 (flag desligada)" com a tabela fase → commits → arquivos; P5 até verde. Mexe em DDL e edge → **[J]** para merge.
- **E234** — Após o merge: pedir **[J]** o `db-migrate.yml` dry-run + apply das 8 migrations (D3) e o dispatch do `copilot-live` (D4).
- **E235** — Após o apply: `SELECT to_regclass('public.copilot_sessions')` etc. (5 tabelas) e políticas RLS presentes (`db_list_policies` filtrando `copilot_`).
- **E236** — `functions_ping` no `copilot-live`; requisição sem JWT deve dar 401.
- **E237** — Conferir no front de produção que, com a flag desligada, nada do RADAR aparece (abrir uma conversa).
- **E238** — P3 nas 14 PRs canônicas (#1997, #1998, #2000, #2002, #2003, #2005, #2013, #2022, #2024, #2025, #2026, #2029, #2030, #2032) apontando para a PR de E233 (ou "arquivada na tag" se D2=b).
- **E239** — P4 nas 21 branches `claude/feat-copiloto-*`.
- **E240** — Fechar a Fase 7 com comentário na issue.

### Fase 8 — Legado de banco e CI de setembro/outubro (E241–E260)

> 41 branches de 26/09–02/10, base 300–1.450 commits atrás, PR fechada ou já mergeada. **Nenhuma é
> mergeada.** Cada uma: P8 (a intenção está na `main`?) → anotar → P4. Migration velha **nunca** entra
> (versions já ocupadas por outros arquivos — A19).

- **E241** — Para cada branch G8, gerar a linha `branch | commits únicos | arquivos | marcador P8 | achado na main? (S/N)` na seção 7. Usar como marcador o nome da função/tabela/variável principal do diff.
- **E242** — Migrations com version já ocupada na `main` por **outro** arquivo (provar com `git ls-tree origin/main supabase/migrations | grep <version>`): `fix-db-security-execute-public-search-path` (430000), `fix-db-gaps-guards-closures-null` (440000), `fix-migration-version-collision-300000` (300000), `fix-rls-contacts-version-collision` (000000), `hermes/acl-default-privileges-revoke-anon` (140000). Para cada: consultar o ledger em leitura pela **função/política** alvo (`… LATERAL unnest(statements) s WHERE s LIKE '%<objeto>%'`) e anotar se o efeito existe em produção (`pg_get_functiondef`/`pg_policies`).
- **E243** — Se o efeito de alguma migration de E242 **não** existe em produção nem na `main` → anotar "intenção perdida" e propor ao Joaquim uma migration **nova** (version reservada, arquivo novo, PR própria) — fora deste plano, vai para "Próximos passos".
- **E244** — `fix-540000-agent-stats-260928-1230` e `fix-540000-doc-agent-stats-260928-1046`: a correção "UPDATE agent_stats, não conversations" na 540000 — `git show origin/main:supabase/migrations/20260927540000_*.sql | grep -n "UPDATE public"`. Se a `main` já tem `agent_stats` → superada.
- **E245** — `fix-db-ledger-parity`, `fix-db-live-guard-260928-0930`, `fix-db-live-guard-drift`, `fix-db-live-guard-missing-migrations`, `fix-migration-parity`, `fix-missing-migrations`, `fix-migration-drift-*`, `chore-reconcilia-db-live-guard`, `fix-db-guard-consolidated`: todas tratam paridade arquivo↔ledger de setembro. Rodar `node scripts/db-audit/check-migration-drift.mjs` contra o ledger (shim de leitura, regra 6 do `CLAUDE.md`). Se der **0 drift** → todas superadas.
- **E246** — `chore-supersede-duplicate-fk-indexes`: conferir `supabase/migrations/_superseded/20260926410000_add_fk_support_indexes.sql` na `main`. Presente → superada.
- **E247** — `resolve-conflicting-prs-afl1fp` (audit FSM, lockout, RLS, FK): P8 por "lockout" e "fsm" nas migrations da `main`.
- **E248** — `fix-attestation-timeout`, `fix-attestation-e09-stable-inv`, `fix-migration-drift-attest`: `grep -n "maxAttempts" scripts/edge-deploy/stable-inventory.mjs` na `main` — valor atual ≥ 144 ou equivalente em minutos → superadas.
- **E249** — `fix-ci-banned-actions` (troca `setup-bun`/`setup-deno` por download com SHA256): a `main` ainda usa `oven-sh/setup-bun` (visto nos logs de 19/10). A política atual é `allowed_actions=selected` com pin por SHA — se `setup-bun` está na allowlist, a branch é **superada por decisão**; anotar.
- **E250** — `fix-ci-types-sync-husky-e2e`, `fix-types-sync-husky`: `grep -n "HUSKY" .github/workflows/types-sync.yml` na `main`. Presente → superadas.
- **E251** — `fix-codeql-stack-trace`: `grep -n "internalErrorResponse" supabase/functions/create-user/index.ts supabase/functions/migrate-media-storage/index.ts` na `main`. Presente → superada.
- **E252** — `fix-e50-db-guard-261002-1256`, `feat-e50-db-guard-261002-1905`, `fix-known-violations-kick`: conferir os 3 contratos E50 no `db-guard.yml` da `main` e `kick_talkx_campaign` fora do `known-violations.json`.
- **E253** — `hermes/acl-default-privileges…` (PR #1255 mergeada): a branch ainda traz `20260930140000_harden_default_privileges…` (version ocupada por `align_ai_read_policies…`) + README de `_superseded`. Superada — P4.
- **E254** — `fix-gamification-guard-xp-cap` (PR #1009 mergeada): a `main` tem `20260927430000_gamification_guard_fix_xp_cap.sql` com o mesmo nome; diff de 6 linhas — conferir se o cap `≤ 500` está no arquivo da `main` e/ou em migration posterior.
- **E255** — `fix-types-gate1-*` (2), `fix-multiplix-send-auth` (PR mergeada), `fix/migration-p1-001-timestamp-duplicate`: P8 (`created_by` com fallback `auth.uid()` em `useConversationTasks.ts`/`useMyTasks.ts`; teste de auth em `multiplix-send/index.test.ts`).
- **E256** — `hermes/talkx-v06-replay-*` (2): **não** editar migration aplicada (A20). Conferir se o `db-guard` já tem exceção/replay-safe para `20260916230000` (`scripts/db-audit/replay-known-failures.json`). Anotar e P4.
- **E257** — `hermes/l5-followup-contrato-e-jobs` (PR mergeada): conferir `cron-secret-l5-contract.test.sh` na `main`; superada.
- **E258** — `fix-e09-e2e-fixme`, `w17-w19-guard-artifact-automergeguard`, `w59-secrets-scope-fail-closed`, `w71-e2e-logado-workflow-run` (se ainda existir após E158): P8. `w59` (fail-closed do secrets-scope) — se **não** estiver na `main`, é segurança: anotar como "intenção perdida" prioritária.
- **E259** — P4 em todas as G8 (as tags estão desde a Fase 1). Atualizar a seção 6.
- **E260** — Fechar a Fase 8 com comentário na issue + lista das "intenções perdidas" encontradas (se houver) para o Joaquim priorizar.

### Fase 9 — Lotes, snapshots, codex, hermes de produto e docs (E261–E280)

- **E261** — Reconfirmar que `025d0258d` está na `main` (`git merge-base --is-ancestor 025d0258d origin/main`).
- **E262** — `lote/2026-10-16-880-cards` (#1983): com E079–E080 confirmados, P3 ("o lote entrou pelo squash 025d0258d") + P4.
- **E263** — `dia/2026-10-07` e `dia/2026-10-08`: rodar a amostra de "qual lado é mais novo" (como em A18) em 50 arquivos de cada; esperado 100% `main` mais nova. P4.
- **E264** — `backup/dia-2026-10-13` e `backup/dia-2026-10-14`: mesma amostra; para os 17 arquivos que só existem no backup, conferir com `git log origin/main --diff-filter=D -1 -- <arquivo>` que a deleção foi do lote (`025d0258d`). P4.
- **E265** — Registrar na seção 7 que os 4 snapshots ficam recuperáveis pelas tags `arquivo/2026-10-19/dia/*` e `…/backup/*`.
- **E266** — `codex/sincronizacao-ledger-20261016` (#1987, 114 arquivos, só 1 igual à `main`): listar os 8 commits; o tema é "reconciliar regressões do lote 880 sem liberar produção" e é **anterior** ao squash `025d0258d`. Para cada arquivo, conferir se a `main` tem versão mais nova (data do último commit). Esperado: superada.
- **E267** — Para os 7 arquivos que só existem na #1987: P8 cada um; se algum for teste que cobre IA ("preservar cobertura de IA ao integrar copilot live"), anotar para a Fase 7 (se D2=a) ou "Próximos passos".
- **E268** — P3 na #1987 + P4; P4 em `codex/sincronizacao-canonica-20261016` (já tratada em E089).
- **E269** — `claude/confident-babbage-ivgmmn` (PRs #969/#1119 mergeadas; 37 commits, 62 conflitos, Team Chat E82–E91): P8 por marcadores ("useRedeemDepartmentInvite", "typing indicator", "Badge unread count Team Chat"). Esperado: todos na `main`. P4.
- **E270** — Superadas já verificadas na Fase 3 (`ci/cors-zappweb-app-br`, `codex/talk-me-carousel…`, `hermes/mapa-f4…`, `hermes/a11y-aria…`): conferir que foram apagadas; senão P4.
- **E271** — Se E269 encontrar algum marcador ausente → "intenção perdida" na seção 7.
- **E272** — `hermes/sonar-s7773-number-parseint` (PR fechada, refactor `Number.parseInt` em 48 arquivos, 23 conflitos): **não** reaplicar (churn em 48 arquivos, regra zero churn). Anotar em "Próximos passos" como item de lint automático (`eslint unicorn/prefer-number-properties`) se o Joaquim quiser. P4.
- **E273** — `hermes/telefonia-contrato-dados` (PR #875 fechada, 20 arquivos, 15 conflitos): P8 em `docs/telefonia/CONTRATO.md`, `src/lib/calls/callStatus` e `calls-telefonia-contract.test.sh` na `main`. Anotar o que a `main` não tem; P4.
- **E274** — Criar `claude/chore-docs-planos-arquivados-<AAMMDD-HHMM>` e trazer os planos ausentes da `main`: `docs/plans/PLANO_CORRECOES_190_ETAPAS_2026-10-19.md` (de `claude/fix-plano-190-etapas`), `docs/plans/PLANO_CONTATOS_CABECALHO_BOTAO_VERDE_50_ETAPAS_2026-09-30.md`, `docs/plans/PLANO_ORDEM_BANNER_SUPERIOR_20_ETAPAS_2026-09-30.md`, o plano de 200 etapas da #1979 (E134) e as seções novas de E086/E087, se houver. Cabeçalho de cada um: "status: arquivado — não executar sem nova aprovação" quando já estiver superado.
- **E275** — PR de docs + P5 (só `.md`, o executor pode mergear se as regras permitirem docs). Depois P4 nas branches de docs.
- **E276** — Atualizar o `CLAUDE.md` (mesmo PR de E275): corrigir a frase "settings-guard … restaura" se E105 mudou o comportamento (GA77 remove restauração automática) e citar este plano como vigente para higiene de branches.
- **E277** — Conferir que `docs/ci/README.md` (gerado) está em dia (`render-workflow-docs.mjs --check`).
- **E278** — Conferir que nenhum `.md` de plano novo quebra o `ci-docs-baseline.unit.mjs`.
- **E279** — Atualizar a seção 6.
- **E280** — Fechar a Fase 9 com comentário na issue.

### Fase 10 — Dependabot, fechamento e trava contra recaída (E281–E300)

- **E281** — #2102 (dependabot bun, 11 libs): P5.1; ler o changelog de cada lib com bump **major**; rodar P7 completo + `bun run test` + `bun run build` + E2E local.
- **E282** — Se alguma lib quebrar teste/build: comentar no PR qual lib e não mergear (dependabot recria); senão P5.
- **E283** — #2101 (actions-misc, 3) e #2099 (codeql-action, 2): conferir que os novos SHAs resolvem (`node scripts/ci/check-workflow-pins-resolvem.mjs`) e P5 **[J]** (workflow).
- **E284** — `git fetch --prune` e listar branches remotas restantes. Esperado: `main` + branches criadas pelo executor ainda abertas + branches novas de outras sessões depois de E005.
- **E285** — Para cada branch restante que não seja da execução: classificar (G0–G10) e aplicar a fase correspondente. Não deixar sobra sem destino.
- **E286** — `github_list_pull_requests state=open`: esperado 0 PRs das 82 originais. Qualquer sobra → P3 com motivo.
- **E287** — Conferir que todas as tags `arquivo/2026-10-19/*` continuam no remoto (contagem = E029).
- **E288** — Commitar `docs/plans/PLANO_INTEGRACAO_BRANCHES_300_ETAPAS_2026-10-19.tags.txt` (E032) num PR de fechamento junto com a seção 7 preenchida.
- **E289** — Reativar o `branch-hygiene-audit.yml` se E018 o desativou **[J]**.
- **E290** — Rodar o `branch-hygiene-audit` por `workflow_dispatch` e conferir que ele termina (o de 19/10 foi **cancelado** — A26) e reporta 0 branches velhas.
- **E291** — Ligar no `branch-hygiene-audit` (se ainda não existir) o alerta de branch **sem PR há > 3 dias** e de PR **draft parada há > 7 dias** (só relatório/issue, sem apagar sozinho).
- **E292** — Confirmar `delete_branch_on_merge=true` no repo (`github_get_repo`) — é o que impede o acúmulo de branch mergeada.
- **E293** — Acrescentar ao `branch-hygiene-audit` (ou a um teste de contrato em `scripts/ci`) a validação do padrão de nome `^(claude|codex|hermes)/(fix|feat|chore|infra)-[a-z0-9-]+-\d{6}-\d{4}$` (com exceções `dependabot/*` e `automation/types-sync`) e da data plausível do carimbo (A24). Só aviso, não bloqueio.
- **E294** — Acrescentar ao mesmo relatório a contagem de PRs abertas que se sobrepõem em arquivos (a regra 3 do fluxo Git do Joaquim) — o que causou A08, A10, A14, A15.
- **E295** — Conferir a `main` verde nos 6 checks + talkx-status-regen + types-sync + db-live-guard no último run agendado.
- **E296** — Conferir produção: Vercel (último deploy da `main` `READY`, `mcp__Vercel__list_deployments`) e as edges deployadas em E170/E234 respondendo.
- **E297** — Se o `db-live-guard` continuar vermelho por drift real (não por guard quebrado), abrir issue com o veredito do artifact e **não** corrigir dentro deste plano.
- **E298** — Comentário final na issue de E010: total de branches (antes 153 → depois N), PRs (82 → 0), merges feitos, branches descartadas com motivo, "intenções perdidas" encontradas.
- **E299** — Fechar a issue de E010.
- **E300** — Apagar a branch deste plano (`claude_pink/nice-hypatia-iikl82`) depois que o PR dele estiver mergeado — com isso a regra "só a `main`" vale também para o próprio plano.

---

## 6. Inventário completo (153 branches)

Coluna "Merge com main": resultado de `git merge-tree` contra `ee2947491` — "absorvida" = não muda nada;
"limpo, difere em N arq." = merge sem conflito alterando N arquivos; "conflito em N arq." = N arquivos em
conflito. "à frente / atrás" em commits. PR: A = aberta, F = fechada sem merge, M = mergeada.

| # | Branch | PR (A=aberta F=fechada M=mergeada) | à frente / atrás | Merge com main | Grupo | Destino | Etapa |
|---|---|---|---|---|---|---|---|
| 1 | `automation/types-sync` | #44,#55 M | 1 / 30 | ABSORVIDA | G0 | ABSORVIDA — branch do bot; apagar (o types-sync recria quando precisar) | E072 |
| 2 | `claude/fix-migration-evidence-hash-261029-1400` | — | 0 / 787 | ABSORVIDA | G0 | ABSORVIDA — apagar | E073 |
| 3 | `claude/friendly-mccarthy-g4xd5z` | #1603 M | 0 / 363 | ABSORVIDA | G0 | ABSORVIDA — apagar | E073 |
| 4 | `claude/w13-w48-ci-fetch-env-guard` | #2041 A | 2 / 1 | ABSORVIDA | G0 | ABSORVIDA mas PR #2041 aberta — fechar PR como "já na main" e apagar | E074 |
| 5 | `claude/w35-bun-cache` | #1937,#2043 F | 0 / 9 | ABSORVIDA | G0 | ABSORVIDA — apagar | E073 |
| 6 | `claude/w70-deploy-paths-ignore` | #1940,#2049 F | 0 / 9 | ABSORVIDA | G0 | ABSORVIDA — apagar | E073 |
| 7 | `hermes/tarefas-b4-concluidas-7d-26093006501293` | #1235 M | 0 / 718 | ABSORVIDA | G0 | ABSORVIDA — apagar | E073 |
| 8 | `dependabot/bun/deps-semanal-5ea84fa56f` | #2102 A | 1 / 0 | limpo, difere em:2 arq. | G10 | INTEGRAR por último (11 libs) com CI completo | E281 |
| 9 | `dependabot/github_actions/actions-misc-9516c9c45d` | #2101 A | 1 / 0 | limpo, difere em:4 arq. | G10 | INTEGRAR (pins SHA) | E283 |
| 10 | `dependabot/github_actions/codeql-action-e40781d787` | #2099 A | 1 / 0 | limpo, difere em:1 arq. | G10 | INTEGRAR (pins SHA) | E283 |
| 11 | `claude/fix-ci-tests-261019-1200` | #2098 A | 2 / 0 | limpo, difere em:11 arq. | G2 | SUPERADA por sharp-faraday (9/11 arquivos idênticos) — revalidar após E150 e fechar | E066 |
| 12 | `claude/fix-db-guard-pguser-261019-1430` | #2104 A | 2 / 0 | limpo, difere em:5 arq. | G2 | INTEGRAR parcial — só o commit PGUSER (db-guard); commit settings-guard vai para E101 | E056 |
| 13 | `claude/fix-logger-vitest-mock-261017-1000` | #2035 A | 1 / 12 | limpo, difere em:1 arq. | G2 | INTEGRAR — mock global createLogger; derruba Unit Tests 1-3/3 da main | E051 |
| 14 | `claude/fix-unit-tests-main-261019-1500` | #2097 A | 1 / 0 | limpo, difere em:2 arq. | G2 | INTEGRAR — falhas pré-existentes de Unit Tests | E061 |
| 15 | `claude/fix-z011bc-timing-safe-261018-1855` | #2091 A | 2 / 1 | limpo, difere em:3 arq. | G2 | INTEGRAR — corrige TS2322 que derruba o TypeCheck da main | E046 |
| 16 | `claude/w32-w94-migrations-concurrency` | #2042 A (#1932 M) | 6 / 1 | limpo, difere em:3 arq. | G2 | INTEGRAR 1º — corrige YAML inválido (chave concurrency duplicada) do talkx-status-regen | E041 |
| 17 | `claude_pink/cool-dijkstra-xk9ek2` | #2103 A | 1 / 0 | limpo, difere em:4 arq. | G3 | SUPERADA por #2100 (GA62/GA75 nos mesmos 4 arquivos) — fechar | E097 |
| 18 | `claude/fix-ci-reativar-suites-261016-1530` | #1975 A | 1 / 33 | conflito em:1 arq. | G3 | REBASE + INTEGRAR (check-test-inventory.mjs) | E129 |
| 19 | `claude/fix-codex-findings-161016-1906` | #1991 A | 21 / 12 | conflito em:5 arq. | G3 | TRIAGEM — Number.isInteger já na main; aproveitar só o que faltar | E131 |
| 20 | `claude/fix-db-migrate-ga04-ga05-261016-0011` | #2036 A | 1 / 52 | conflito em:2 arq. | G3 | REBASE + INTEGRAR (conflito em db-migrate.yml) | E125 |
| 21 | `claude/fix-e2e-logado-ga09-261017-1410` | #2033 A | 1 / 12 | limpo, difere em:1 arq. | G3 | SUPERADA por #2100 (mesmo GA09) — fechar | E097 |
| 22 | `claude/fix-fase5-GA09-GA62-GA75-GA92-261019-1206` | #2100 A | 1 / 0 | limpo, difere em:7 arq. | G3 | INTEGRAR no pacote CI-1 (governança) | E098 |
| 23 | `claude/fix-notify-names-ga10-ga02-261017-0900` | #2034 A | 1 / 12 | limpo, difere em:2 arq. | G3 | INTEGRAR no pacote CI-2 | E112 |
| 24 | `claude/fix-types-sync-ga20-ga21-261017-0015` | #2037 A | 1 / 12 | limpo, difere em:2 arq. | G3 | INTEGRAR no pacote CI-2 (types-sync falha toda manhã) | E110 |
| 25 | `claude/fix-z017-z020-auth-cors-261018-1950` | #2095 A | 1 / 1 | limpo, difere em:2 arq. | G3 | INTEGRAR (edge; deploy só com dispatch+aprovação) | E128 |
| 26 | `claude/fix-z022-z024-dbguard-ci-261018-1930` | #2093 A | 1 / 1 | limpo, difere em:2 arq. | G3 | REVALIDAR contra W39 (#2044) e W85 — os três mexem na versão do Playwright; manter 1 | E118 |
| 27 | `claude/fix-z029-z015-summary-500-261018-1940` | #2092 A | 1 / 1 | limpo, difere em:1 arq. | G3 | INTEGRAR no pacote CI-2 (mesmo arquivo que GA20/21) | E111 |
| 28 | `claude/pensive-cori-i93zgf` | #2023 A | 1 / 13 | limpo, difere em:2 arq. | G3 | SUPERADA — main já exporta nextBestActionKey e tem 1 só isOverdue | E081 |
| 29 | `claude/tender-heisenberg-a4jk3s` | #1979 A | 13 / 13 | conflito em:4 arq. | G3 | TRIAGEM — plano 200 etapas (doc) + fixes CI já superados | E134 |
| 30 | `claude/w10-mutacao-mapa-so-pr` | #1922 A | 4 / 64 | conflito em:1 arq. | G3 | REBASE + INTEGRAR (conflito ci.yml) | E126 |
| 31 | `claude/w21-classificar-migration-drift` | #1930 A | 1 / 66 | conflito em:1 arq. | G3 | REBASE + INTEGRAR (conflito 1 teste) | E127 |
| 32 | `claude/w39-w49-w50-ci-cleanup` | #2044 A | 2 / 1 | limpo, difere em:3 arq. | G3 | INTEGRAR no pacote CI-2 (escolhida para Playwright) | E117 |
| 33 | `claude/w45-draft-fast-exit` | #2046 A | 1 / 9 | limpo, difere em:2 arq. | G3 | INTEGRAR no pacote CI-2 | E120 |
| 34 | `claude/w85-w86-w87-ossf-scorecard` | #2051 A | 4 / 1 | limpo, difere em:9 arq. | G3 | INTEGRAR com cuidado — apaga 18 linhas de allowed-actions.json e cria scorecard.yml | E123 |
| 35 | `f3/strict-false-baseline-20261018` | #2078 A | 2 / 1 | limpo, difere em:4 arq. | G3 | DECISÃO D1 do Joaquim (strict) — contradiz CLAUDE.md | E106 |
| 36 | `feat/ci-lint-ratchet-base-f2b` | #2057 A | 2 / 1 | limpo, difere em:2 arq. | G3 | INTEGRAR no pacote CI-2 | E116 |
| 37 | `fix/ci-f1b-restaura-workflows-20261018` | #2056 A | 3 / 1 | limpo, difere em:4 arq. | G3 | INTEGRAR — main perdeu settings-guard.yml e auto-update-pr-branch.yml em 16/10 (5721e4f50) | E101 |
| 38 | `claude/charming-mccarthy-jbxy56` | #2040 A (#1924,#1942 M) | 106 / 0 | limpo, difere em:398 arq. | G4 | INTEGRAR (mega, 106 commits/398 arquivos) depois da sharp; 10 arquivos de CI em conflito | E156 |
| 39 | `claude/sharp-faraday-qfortu` | #2054 A (#2039 M) | 68 / 0 | limpo, difere em:351 arq. | G4 | INTEGRAR (mega, 68 commits/351 arquivos) após main verde | E141 |
| 40 | `fix/f1a-authprovider-mock-inbox-20261018` | #2061 A | 2 / 2 | limpo, difere em:2 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 41 | `fix/f1a-framer-motion-mock-voicechangerpicker-20261018` | #2062 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 42 | `fix/f1a-logger-ttsvoice-mock-arquivos-conversa-20261018` | #2067 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 43 | `fix/f1a-lote-b-admin-audit-page-size` | #2068 A | 3 / 2 | limpo, difere em:3 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 44 | `fix/f1a-lote-b-audiomemes-storage-path` | #2066 A | 2 / 2 | limpo, difere em:2 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 45 | `fix/f1a-lote-b-authprovider` | #2063 A | 2 / 2 | limpo, difere em:2 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 46 | `fix/f1a-lote-b-batch10` | #2087 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 47 | `fix/f1a-lote-b-batch12` | #2088 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 48 | `fix/f1a-lote-b-batch13` | #2089 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 49 | `fix/f1a-lote-b-batch14` | #2090 A | 2 / 2 | limpo, difere em:4 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 50 | `fix/f1a-lote-b-batch2` | #2076 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 51 | `fix/f1a-lote-b-batch3` | #2079 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 52 | `fix/f1a-lote-b-batch4` | #2081 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 53 | `fix/f1a-lote-b-batch5` | #2082 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 54 | `fix/f1a-lote-b-batch6` | #2083 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 55 | `fix/f1a-lote-b-batch7` | #2084 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 56 | `fix/f1a-lote-b-batch8` | #2085 A | 2 / 2 | limpo, difere em:2 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 57 | `fix/f1a-lote-b-batch9` | #2086 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 58 | `fix/f1a-lote-b-connectioncard-dialog` | #2059 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 59 | `fix/f1a-lote-b-gamificacao-sem-escrita` | #2077 A | 1 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 60 | `fix/f1a-lote-b-hooks-misc-1` | #2074 A | 1 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 61 | `fix/f1a-lote-b-main` | #2058 A | 2 / 2 | limpo, difere em:9 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 62 | `fix/f1a-lote-b-realtime-channel-mock` | #2065 A | 2 / 2 | limpo, difere em:2 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 63 | `fix/f1a-lote-b-talkxsegments` | #2072 A | 2 / 2 | limpo, difere em:2 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 64 | `fix/f1a-lote-b-talkxsuppression-hook-morto` | #2071 A | 2 / 2 | limpo, difere em:2 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 65 | `fix/f1a-lote-b-useadmindata-createuser-avatar` | #2070 A | 2 / 2 | limpo, difere em:4 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 66 | `fix/f1a-lote-b-useadmindata-select` | #2069 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 67 | `fix/f1a-lote-b-useknowledgebase` | #2073 A | 2 / 2 | limpo, difere em:2 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 68 | `fix/f1a-lote-b-useteamchatnotifications` | #2080 A | 2 / 2 | limpo, difere em:2 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 69 | `fix/f1a-lote-b-usewarroomalerts` | #2075 A | 1 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 70 | `fix/f1a-order-mock-usecustomemojis-20261018` | #2060 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 71 | `fix/f1a-supabase-channel-mock-audiomeme-20261018` | #2064 A | 2 / 2 | limpo, difere em:1 arq. | G5 | CONSOLIDAR no trilho F1a (cherry-pick sem o commit de prettier) | E176 |
| 72 | `claude/feat-copiloto-cv011-020-migrations-261016-1930` | #1997 A | 5 / 19 | limpo, difere em:9 arq. | G6 | CONSOLIDAR RADAR — 6 migrations com versão ANTIGA (<max da main) + corta 395 linhas do LGPD-RETENTION-POLICY.md (regressão) | E214 |
| 73 | `claude/feat-copiloto-cv021-030-worker-261016-2100` | #1998 A | 1 / 19 | limpo, difere em:4 arq. | G6 | CONSOLIDAR RADAR (fase 3, edge copilot-live) | E216 |
| 74 | `claude/feat-copiloto-cv031-040-brinde-intelligence-261016-2025` | #2000 A | 1 / 19 | limpo, difere em:16 arq. | G6 | CONSOLIDAR RADAR — contém cópia da fase 3; migration 20261016200000 COLIDE com versão já na main | E217 |
| 75 | `claude/feat-copiloto-cv041-050-suggest-reply-261016-2145` | #2002 A | 1 / 18 | limpo, difere em:6 arq. | G6 | CONSOLIDAR RADAR — reescreve copilot-live/index.ts (add/add com fase 3) | E218 |
| 76 | `claude/feat-copiloto-cv051-060-radar-popup-261016-2130` | #2003 A | 4 / 18 | conflito em:2 arq. | G6 | CONSOLIDAR no trilho RADAR (fase 6); commits isOverdue/nextBestActionKey descartados (já na main) | E219 |
| 77 | `claude/feat-copiloto-cv061-070-ghost-text-261016-2142` | #2005 A | 1 / 17 | limpo, difere em:18 arq. | G6 | CONSOLIDAR RADAR (canônica, PR aberta) | E220 |
| 78 | `claude/feat-copiloto-cv061-070-ghost-text-261016-2200` | #2006 F | 1 / 17 | limpo, difere em:18 arq. | G6 | DUPLICATA (PR fechada) — tag e apagar | E212 |
| 79 | `claude/feat-copiloto-cv071-080-objection-battlecard-261016-2230` | #2013 A | 1 / 16 | limpo, difere em:14 arq. | G6 | CONSOLIDAR RADAR | E221 |
| 80 | `claude/feat-copiloto-cv081-090-catalog-budget-261016-2235` | #2022 A | 2 / 16 | limpo, difere em:9 arq. | G6 | CONSOLIDAR RADAR | E222 |
| 81 | `claude/feat-copiloto-cv091-100-lead-signals-261016-2240` | #2007 F | 1 / 17 | limpo, difere em:11 arq. | G6 | DUPLICATA (PR fechada) — tag e apagar | E212 |
| 82 | `claude/feat-copiloto-cv091-100-signals-261016-2305` | #2024 A | 1 / 13 | limpo, difere em:14 arq. | G6 | CONSOLIDAR RADAR | E223 |
| 83 | `claude/feat-copiloto-cv101-110-multimodal-261016-0730` | #2025 A | 1 / 13 | limpo, difere em:16 arq. | G6 | CONSOLIDAR RADAR | E224 |
| 84 | `claude/feat-copiloto-cv101-110-multimodal-261016-2310` | #2010 F | 1 / 16 | limpo, difere em:8 arq. | G6 | DUPLICATA (PR fechada) — tag e apagar | E212 |
| 85 | `claude/feat-copiloto-cv111-120-guardrails-261016-0810` | #2026 A | 1 / 13 | limpo, difere em:12 arq. | G6 | CONSOLIDAR RADAR | E225 |
| 86 | `claude/feat-copiloto-cv111-120-guardrails-261016-2315` | #2009 F | 1 / 16 | limpo, difere em:8 arq. | G6 | DUPLICATA (PR fechada) — tag e apagar | E212 |
| 87 | `claude/feat-copiloto-cv121-130-supervisor-261016-2304` | #2029 A | 1 / 12 | limpo, difere em:12 arq. | G6 | CONSOLIDAR RADAR | E226 |
| 88 | `claude/feat-copiloto-cv121-130-supervisor-261016-2320` | #2011 F | 1 / 16 | limpo, difere em:8 arq. | G6 | DUPLICATA (PR fechada) — tag e apagar | E212 |
| 89 | `claude/feat-copiloto-cv131-140-analytics-261016-2325` | #2012 F | 1 / 16 | limpo, difere em:8 arq. | G6 | DUPLICATA (PR fechada) — tag e apagar | E212 |
| 90 | `claude/feat-copiloto-cv131-140-aprendizado-261016-2310` | #2030 A | 1 / 12 | limpo, difere em:12 arq. | G6 | CONSOLIDAR RADAR | E227 |
| 91 | `claude/feat-copiloto-cv141-150-integration-261016-2330` | #2015 F | 1 / 15 | limpo, difere em:8 arq. | G6 | DUPLICATA (PR fechada) — tag e apagar | E212 |
| 92 | `claude/feat-copiloto-cv141-150-piloto-261016-2317` | #2032 A | 1 / 12 | limpo, difere em:12 arq. | G6 | CONSOLIDAR RADAR | E228 |
| 93 | `backup/dia-2026-10-13` | — | 1360 / 89 | conflito em:625 arq. | G7 | BACKUP superado (amostra: 80/80 arquivos mais novos na main) — tag e apagar | E264 |
| 94 | `backup/dia-2026-10-14` | — | 1543 / 89 | conflito em:588 arq. | G7 | BACKUP superado; 17 arquivos só nele foram apagados de propósito no lote — tag e apagar | E264 |
| 95 | `ci/cors-zappweb-app-br` | #1899 F | 9 / 61 | conflito em:2 arq. | G7 | SUPERADA — main já tem zappweb.app.br em _shared/cors-origins.ts | E270 |
| 96 | `claude/confident-babbage-ivgmmn` | #969,#1119 M | 37 / 802 | conflito em:62 arq. | G7 | PRs mergeadas; 37 commits pós-merge em conflito (Team Chat E82–E91) — TRIAGEM | E269 |
| 97 | `codex/sincronizacao-canonica-20261016` | #1985 F | 1 / 29 | conflito em:2 arq. | G7 | SUPERADA (PR fechada) — tag e apagar após diff de 2 arquivos | E268 |
| 98 | `codex/sincronizacao-ledger-20261016` | #1987 A | 8 / 19 | conflito em:17 arq. | G7 | TRIAGEM fina — 114 arquivos, 1 igual à main; provável superada pelo squash 025d0258d | E266 |
| 99 | `codex/talk-me-carousel-refinement-20260930` | #1351 F | 4 / 612 | conflito em:4 arq. | G7 | PR fechada; Talk Me reescrito depois — superada | E270 |
| 100 | `dia/2026-10-07` | — | 370 / 89 | conflito em:317 arq. | G7 | SNAPSHOT diário superado pelo lote 880 — tag e apagar | E263 |
| 101 | `dia/2026-10-08` | — | 604 / 89 | conflito em:449 arq. | G7 | SNAPSHOT diário superado pelo lote 880 — tag e apagar | E263 |
| 102 | `hermes/a11y-aria-hidden-focus-2610021746e07a` | #1699 F | 1 / 280 | conflito em:1 arq. | G7 | PR fechada; main.tsx divergiu — superada | E270 |
| 103 | `hermes/mapa-f4-p3-observabilidade-2610011830d2a2` | #1463 F | 2 / 508 | conflito em:2 arq. | G7 | PR fechada; LocationPicker divergiu — verificar location_sent e apagar | E270 |
| 104 | `hermes/sonar-s7773-number-parseint-2610022025ac4f` | #1730 F | 5 / 252 | conflito em:23 arq. | G7 | PR fechada; refactor S7773 em 48 arquivos — refazer do zero se quiser, não mergear | E272 |
| 105 | `hermes/telefonia-contrato-dados-26092615475e51` | #875 F | 6 / 1469 | conflito em:15 arq. | G7 | PR fechada; contrato telefonia fase 1-2 — TRIAGEM contra main | E273 |
| 106 | `lote/2026-10-16-880-cards` | #1983 A (#1976 M) | 7 / 33 | conflito em:39 arq. | G7 | ABSORVIDA pelo squash 025d0258d (3113/3115 arquivos idênticos) — fechar #1983 | E262 |
| 107 | `claude/chore-reconcilia-db-live-guard-260926-2040` | #911 F | 2 / 1450 | conflito em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 108 | `claude/chore-supersede-duplicate-fk-indexes-260927-0100` | #939 F | 1 / 1422 | limpo, difere em:2 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 109 | `claude/feat-e50-db-guard-261002-1905` | #1588 F | 2 / 388 | conflito em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 110 | `claude/fix-540000-agent-stats-260928-1230` | #1099 F | 2 / 886 | conflito em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 111 | `claude/fix-540000-doc-agent-stats-260928-1046` | #1086 F | 1 / 894 | conflito em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 112 | `claude/fix-attestation-e09-stable-inv-291029-1520` | #1206 F | 7 / 594 | conflito em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 113 | `claude/fix-attestation-timeout-260928-1630` | #1076 F | 1 / 919 | conflito em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 114 | `claude/fix-ci-banned-actions-261002-1430` | #1610 F | 4 / 364 | conflito em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 115 | `claude/fix-ci-types-sync-husky-e2e-260927-1245` | #973 M | 1 / 1385 | conflito em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 116 | `claude/fix-codeql-stack-trace-270927-2200` | #1064 F | 3 / 1008 | conflito em:4 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 117 | `claude/fix-db-gaps-guards-closures-null-260927-1731` | #1022 F | 5 / 1081 | limpo, difere em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 118 | `claude/fix-db-guard-consolidated-260928-1220` | — | 1 / 888 | conflito em:3 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 119 | `claude/fix-db-ledger-parity-260927-1900` | #1045 F | 3 / 1076 | conflito em:9 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 120 | `claude/fix-db-live-guard-260928-0930` | #1077 F | 14 / 919 | conflito em:4 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 121 | `claude/fix-db-live-guard-drift-260928-1045` | #1081 M | 11 / 911 | conflito em:3 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 122 | `claude/fix-db-live-guard-missing-migrations-270927-1730` | #1026 M | 2 / 1104 | conflito em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 123 | `claude/fix-db-security-execute-public-search-path-260927-1730` | #1021 F | 5 / 1080 | limpo, difere em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 124 | `claude/fix-e09-e2e-fixme-261001-1740` | #1430 F | 1 / 545 | limpo, difere em:3 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 125 | `claude/fix-e50-db-guard-261002-1256` | #1592 F | 2 / 383 | conflito em:2 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 126 | `claude/fix-fase2-rls-search-path-261018-1440` | #2094 A | 1 / 1 | limpo, difere em:1 arq. | G8 | SUPERADA — migration 20261016250000 idêntica já vem na sharp-faraday; DDL só com Joaquim | E146 |
| 127 | `claude/fix-gamification-guard-xp-cap-270927-1750` | #1009 M | 1 / 1128 | limpo, difere em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 128 | `claude/fix-known-violations-kick-261002-1240` | #1584 F | 1 / 388 | conflito em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 129 | `claude/fix-migration-drift-270926-0121` | #947 F | 1 / 1421 | conflito em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 130 | `claude/fix-migration-drift-attest-260928-1600` | — | 1 / 919 | conflito em:2 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 131 | `claude/fix-migration-parity-270927-1742` | #1017 F | 4 / 1110 | conflito em:3 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 132 | `claude/fix-migration-version-collision-300000-270927-1400` | #981 F | 2 / 1336 | limpo, difere em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 133 | `claude/fix-missing-migrations-260928-2200` | #1150 F | 1 / 802 | conflito em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 134 | `claude/fix-multiplix-send-auth-270927-1530` | #1020 M | 1 / 1075 | conflito em:2 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 135 | `claude/fix-rls-contacts-version-collision-260927-0046` | #938 F | 1 / 1423 | limpo, difere em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 136 | `claude/fix-types-gate1-280928-2100` | #1142 F | 1 / 808 | conflito em:2 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 137 | `claude/fix-types-gate1-created-by-280928-2230` | #1149,#1153 F | 1 / 802 | conflito em:2 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 138 | `claude/fix-types-sync-husky-270927-1306` | #976 F | 2 / 1385 | conflito em:2 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 139 | `claude/resolve-conflicting-prs-afl1fp` | #942 F | 1 / 1421 | conflito em:2 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 140 | `claude/w17-w19-guard-artifact-automergeguard` | #1925 F | 2 / 64 | conflito em:3 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 141 | `claude/w59-secrets-scope-fail-closed` | #1929 F | 1 / 66 | conflito em:2 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 142 | `claude/w71-e2e-logado-workflow-run` | #1941 F | 1 / 64 | limpo, difere em:1 arq. | G8 | LEGADO set/out (PR fechada/mergeada; base 300–1450 commits atrás) — verificar intenção na main, tag e apagar | E241 |
| 143 | `fix/migration-p1-001-timestamp-duplicate` | #1999 F | 2 / 27 | conflito em:1 arq. | G8 | PR fechada; só types.ts — superada | E255 |
| 144 | `hermes/acl-default-privileges-revoke-anon-2609300840a808` | #1255 M | 1 / 698 | limpo, difere em:2 arq. | G8 | PR mergeada; 140000 desta branch COLIDE com 20260930140000 da main — descartar | E253 |
| 145 | `hermes/l5-followup-contrato-e-jobs-261001070612ac` | #1368 M | 1 / 597 | conflito em:1 arq. | G8 | PR mergeada; resto superado | E257 |
| 146 | `hermes/talkx-v06-replay-26093016291fca` | #1333 F | 1 / 627 | conflito em:1 arq. | G8 | PR fechada — superada pela v06-replay-safe | E256 |
| 147 | `hermes/v06-replay-safe-autorizado-2610021151ca8d` | #1624 F | 2 / 350 | limpo, difere em:1 arq. | G8 | PR fechada; edita migration 20260916230000 já aplicada — NÃO mergear; tag e apagar | E256 |
| 148 | `claude/fix-plano-190-etapas-261019-1200` | — | 1 / 0 | limpo, difere em:1 arq. | G9 | DOC sem PR — absorver no PR de docs | E274 |
| 149 | `codex/docs-email-navy-plan-100-20261002` | — | 1 / 291 | conflito em:1 arq. | G9 | DOC já na main com outra versão — superada | E275 |
| 150 | `docs/plano-contatos-cabecalho-botao-50-etapas-2026-09-30` | — | 1 / 705 | limpo, difere em:1 arq. | G9 | DOC ausente na main — absorver no PR de docs | E274 |
| 151 | `docs/plano-ordem-banner-20-etapas-2026-09-30` | — | 1 / 711 | limpo, difere em:1 arq. | G9 | DOC ausente na main — absorver no PR de docs | E274 |
| 152 | `docs/plano-talk-me-100-etapas` | #1301 F | 1 / 663 | conflito em:1 arq. | G9 | DOC já na main com outra versão — superada | E275 |
| 153 | `hermes/plano-volume-50-etapas-finalizacao-2610011018e48d` | #1395 M | 1 / 564 | conflito em:1 arq. | G9 | PR #1395 mergeada; doc divergente — superada | E275 |

---

## 7. Registro de execução (preenchido pelo executor)

| Etapa | Data/hora | Resultado | Evidência (SHA, PR, run, query) | Observação |
|---|---|---|---|---|
| E001 | | | | |

### 7.1 Intenções perdidas (achadas na Fase 8/9, para o Joaquim priorizar)

| Branch de origem | O que ela fazia | Está em produção? | Proposta |
|---|---|---|---|

---

*Plano gerado em 2026-10-19 a partir de medição real (`git merge-tree`, API do GitHub, logs dos runs da
`main`). Não executado — aguardando aprovação do Joaquim.*
