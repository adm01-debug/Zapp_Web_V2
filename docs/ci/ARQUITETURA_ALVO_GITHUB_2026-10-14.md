# Arquitetura-alvo do GitHub para o ZAPP WEB V2 — velocidade + qualidade, sem desperdício

**Data:** 2026-10-14 · **Autor:** auditoria de Actions (sessão Claude Code) · **Status:** PROPOSTA para decisão do dono.
**Base factual:** `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-14.md` (36 achados medidos ao vivo).
**Relação com o plano:** o plano diz *o que consertar*; este documento diz *para onde ir* e em que ordem, para que
cada etapa do plano tenha um destino e não vire mais uma camada de remendo.

---

## 1. Diagnóstico em uma frase

O repositório tem **muitos guardas e pouca cadeia de produção**: 16 workflows, ~100 contratos de banco, 6 checks
obrigatórios, 5 bots de revisão — e, ainda assim, 42 % das execuções de CI falham, a suíte E2E não roda, todo lote
diário abre uma janela vermelha prevista, e o único humano é o gargalo de três portões (merge do lote, apply do DDL,
deploy manual quando precisa). O custo não está no runner: **repositório público tem minutos de Actions grátis**. O custo
está em agente de IA esperando 17 minutos de CI, refazendo trabalho por falha falsa, e em você aprovando lote.

### Onde o tempo e o dinheiro vão hoje (medido)

| Desperdício | Medida | Por que custa |
|---|---|---|
| CI de PR falhando por motivo que não é código | 27 de 64 runs (42 %), causas: manifesto de edge desatualizado, teste de documento pinando versão | cada falha = um agente relendo log, corrigindo, esperando mais 17 min |
| Feedback lento | `Unit Tests` 16–17 min; `Lint & TypeCheck` com 27 passos é pré-requisito de tudo | o agente fica ocioso ou segue sem saber se quebrou |
| Lote diário com 50–157 arquivos | #1890, #1902, #1905, #1908, #1911 | 1 arquivo vermelho trava 156; ninguém sabe qual agente quebrou o quê |
| Cascata pós-lote | lote → guard vivo ❌ → types-sync ❌/PR extra → apply manual → sync → merge | 2 PRs e horas de vermelho por lote, por desenho |
| Guardas que não enxergam | `settings-guard` 30/30 ❌ com falso positivo; `e2e-logado` 39/40 cancelados | sinal vermelho permanente ensina todo mundo a ignorar vermelho |
| Ruído de bot | PR de 28 linhas com 32 comentários; 3 checks ❌ fixos na `main` | atenção humana, o recurso mais escasso aqui, gasta em ruído |
| Humano como portão de rotina | merge do lote, apply do DDL, religar strict, aprovar environments | você é chamado para o que não precisa de você e não é chamado para o que precisa |

---

## 2. Princípios (as regras que decidem tudo abaixo)

1. **O humano aprova só o irreversível.** DDL em produção, rotação de segredo, mudança de perímetro, deploy de edge
   quando o smoke falha. Tudo o mais é automático e **reversível por bot** (revert, rollback por Deployment).
2. **Feedback em menos de 5 minutos ou não é feedback.** Um agente que espera 17 minutos custa 17 minutos de token
   ocioso ou trabalha às cegas. O portão obrigatório de PR tem de caber em 5 min; o resto roda depois do merge.
3. **Vermelho sempre significa algo.** Check que fica vermelho por mais de 24 h é consertado ou removido. Falso positivo
   é bug P0, porque destrói o valor de todos os outros sinais.
4. **Artefatos derivados nascem na PR, não da produção.** `types.ts`, catálogo, manifesto e grants são gerados a partir
   de um Postgres efêmero que replica o banco, dentro da PR que traz a migration. Produção vira destino, não fonte.
5. **PR pequena, muitas por dia.** O lote diário troca velocidade por "controle" que não existe (ninguém revisa 157
   arquivos). Com portão rápido e merge automático, 20 PRs pequenas custam menos que 1 lote e isolam a culpa.
6. **Uma identidade por papel.** Humano aprova; bot automatiza. Enquanto os dois usam a mesma conta, nenhuma aprovação
   vale nada e nenhum guard distingue regressão de decisão.
7. **Configuração como código, medida contra a realidade.** Perímetro do GitHub, toolchain, lista de apps, origens de
   CORS: tudo em arquivo versionado e conferido por job que **consegue** ler o estado real.

---

## 3. A arquitetura em camadas

```
 agente (cloud ou local)
   │  bun run verify          ← Camada 0: o mesmo portão do CI, antes do push (≤ 2 min, offline)
   ▼
 PR pequena (branch agent/<nome>/<tema>, draft até verde)
   │
   ├─ Camada 1 · PR RÁPIDO (obrigatório, ≤ 5 min, 4 jobs em paralelo, cache quente)
   │     lint+typecheck ratchets · unit tests (shard) · build+budget · guards de workflow/segurança
   │     + "Contrato DB offline" só se o diff toca banco (senão: verde em 30 s com resumo)
   │     + replay das migrations da PR num Postgres efêmero a partir do baseline → gera types/catálogo/manifesto
   │       e FALHA se a PR não os trouxe atualizados
   │
   ├─ Camada 2 · PRÉ-MERGE PESADO (roda na fila de merge ou no merge group; não bloqueia o agente)
   │     contratos de banco completos (shard ×3) · E2E Chromium deslogado · CodeQL · mutação do mapa
   │
   ▼  merge automático (auto-merge + fila) — humano não participa
 main
   │
   ├─ Camada 3 · PÓS-MERGE (assíncrono, avisa por WhatsApp só em falha real)
   │     deploy de edge (se mudou) → smoke → saúde 5 min → rollback automático se falhar
   │     db-migrate: dry-run automático → ESPERA APROVAÇÃO DO JOAQUIM (único clique humano do dia) → apply → paridade
   │     e2e-logado após CI da main verde (workflow_run) + a cada 2 h
   │     guard vivo: compara prod × main SABENDO o que está pendente de apply
   │
   └─ Camada 4 · PERIÓDICO (semanal/diário)
         perímetro do GitHub com credencial que lê de verdade · CodeQL completo · Scorecard · KPI de CI
         bump de toolchain · higiene de branches com poda automática · SLA de alertas
```

### 3.1 Camada 0 — o portão no bolso do agente

Hoje o portão local (`zapp-verify`, `zapp-db-guard`) existe só no WSL do Joaquim. Agente em nuvem não tem. Resultado:
o agente descobre no CI, 17 minutos depois, o que poderia saber em 2.

**Alvo:** `bun run verify` versionado no repo (`scripts/verify.mjs`), idêntico ao que a Camada 1 roda, offline, com
cache do Bun, em ≤ 2 min. Falha fechada se o diff toca `supabase/functions/**` sem regenerar o manifesto, se toca
`supabase/migrations/**` sem trazer types/catálogo (ver 3.2), se introduz dívida nova de lint/tipo. O `husky pre-push`
chama o mesmo script. A instrução para agentes (`AGENTS.md`/`CLAUDE.md`) passa a ser uma linha: **não dê push sem
`bun run verify` verde**.

### 3.2 Camada 1 — PR rápido, e a mudança estrutural do banco

Os 6 checks obrigatórios continuam com os mesmos nomes (renomear quebra a proteção), mas:

- rodam **em paralelo** (hoje 3 deles esperam o `Lint & TypeCheck` de 27 passos);
- `bun install` com cache (hoje 5 instalações sem cache por PR);
- `Unit Tests` em 2 shards com cobertura só na `main`;
- `Contrato DB offline` lê o diff: PR que não toca banco termina verde em segundos com o resumo "contratos pulados";
- Deno/Go/CodeQL saem do caminho crítico e vão para a Camada 2.

**A mudança que elimina a cascata diária:** um Postgres efêmero no CI parte de um **baseline reconciliado do schema de
produção** (`supabase/schema-baseline.sql`, gerado uma vez pelo Joaquim e regenerado a cada apply) e aplica **só as
migrations novas da PR**. Isso leva segundos, não tem as 21 falhas do replay-do-zero, e permite gerar `types.ts`,
`schema-catalog.json`, `schema-manifest.json` e `grants-baseline.json` **dentro da PR**, com `postgres-meta` em
container (o `gen-types.sh --local` já prevê). O check falha se a PR trouxe migration e não trouxe os artefatos
regenerados. Consequências:

- o `types-sync` pós-merge deixa de existir como rotina; vira só uma conferência semanal prod × repo;
- o guard vivo deixa de quebrar no push do lote, porque `main` já carrega os artefatos corretos; ele só compara prod com
  `main` **depois** do apply, sabendo o que está pendente;
- o "2º PR de sincronização" por lote desaparece;
- o Gate 1 do types-sync (TypeScript contra RPC que ainda não existe em prod) desaparece, porque os tipos vêm do
  schema que a PR acabou de provar.

### 3.3 Camada 2 — pesado, mas fora do caminho do agente

Contratos de banco completos (hoje ~100 passos, 400 min/semana), E2E Chromium, CodeQL e mutação rodam **no merge group**
(fila de merge) ou, sem fila, no `push` da `main` com **revert automático** se falharem. O agente não espera por eles; se
quebrar, um bot abre o revert e avisa. Isso é possível porque a Camada 1 já provou tipo, build, migration e artefatos.

### 3.4 Camada 3 — produção com um clique humano

- **Edge functions:** já é automática no push (desde 07/10). Falta: saúde pós-deploy (5xx nos 5 min seguintes) e
  rollback automático para o último Deployment `success`. Secrets no environment, não no repo. Reescrita de secrets
  fail-closed.
- **Banco:** `db-migrate` disparado automaticamente por `workflow_run` quando o push na `main` traz migration. O que
  isso exige do workflow atual: hoje ele é **um job só** com `environment: producao-ddl`, e o GitHub pausa o job
  **antes do primeiro passo** — o dry-run nunca roda sem aprovação e o aprovador decide às cegas. O alvo é **dois
  jobs**: `preflight` (identidade, TLS, ledger, contrato de runtime, `--dry-run`, hash) sem environment, e `apply`
  (`needs: preflight`, `environment: producao-ddl`) que recebe o hash por `outputs` e **para esperando o Joaquim**
  (um clique no celular, já com o resultado do dry-run na tela). Modo `apply_all_missing` substitui bundles
  hardcoded (W27). Após o apply, o próprio job dispara o `types-sync` (W33), o baseline de schema é regenerado e o
  guard vivo confirma paridade. **Este é o único portão humano de rotina na arquitetura inteira**, e é o certo: DDL em
  produção é irreversível.
- **E2E logado:** roda após CI da `main` verde e a cada 2 h, com cancelamento do pendente antigo, não do novo. Falha
  abre issue com causa e avisa por WhatsApp.
- **Vercel:** 1 projeto, 1 domínio canônico, preview por PR nativo da Vercel. Dois projetos deployando o mesmo repo é
  custo dobrado e environments fantasmas.

### 3.5 Camada 4 — governança que enxerga

- `settings-guard` com credencial de leitura administrativa (PAT fine-grained ou GitHub App) em environment próprio:
  lê branch protection, actions, repo, environments, rulesets; alerta extra e faltante; guarda snapshot datado.
- CodeQL com triagem: alertas em teste filtrados por config; SLA de 30 dias para `high`; semanal completo.
- Scorecard + dependency-review: grátis em repo público, dá nota externa e diff de dependências por PR.
- KPI semanal com as métricas da seção 6; bump de toolchain por PR semanal; poda automática de branch morta.

---

## 4. As quatro decisões estruturais (só o dono decide)

### D1 · Transferir o repositório para uma **Organization gratuita** (recomendado)

Conta pessoal não tem **fila de merge**, não tem rulesets com atores de bypass, não tem secrets de organização, não tem
identidade de GitHub App própria. A fila de merge é exatamente o que resolve o dilema `strict` sem escolher entre
segurança e velocidade: as PRs entram na fila, o GitHub cria o merge group, roda os checks obrigatórios **sobre o
resultado da integração** e mergeia em ordem. `ci.yml`, `db-guard.yml` e `codeql.yml` **já têm o gatilho
`merge_group`**, inerte hoje. Repositório público em organização tem fila de merge no plano gratuito.

Custo: zero em dinheiro. Trabalho: criar a org, transferir (URLs antigas redirecionam; issues, PRs e histórico vêm
junto), **reconferir** secrets de Actions, environments, instalações de Apps (Vercel, SonarCloud, Dependabot) e a
integração Supabase/Vercel apontando para o novo caminho. Uma tarde, uma vez.

Sem D1, a alternativa é: `strict=true` + `allow_auto_merge=true` + `auto-update-pr-branch` + Camada 1 ≤ 5 min (para que
o ciclo `BEHIND` custe pouco). Funciona, mas é o remendo que já regrediu 4 vezes.

### D2 · PRs pequenas de agente com auto-merge, no lugar do lote diário

Hoje: agentes trabalham, o Joaquim consolida em `dia/AAAA-MM-DD`, abre 1 PR, mergeia. Proposta: cada agente abre sua PR
(draft até a Camada 0 passar), com auto-merge habilitado; a Camada 1 decide em 5 min; a fila (D1) integra. O Joaquim
sai do caminho das PRs e fica só no apply de DDL. O que impede hoje é a regra 1 da seção 0 do `CLAUDE.md` ("nenhum
agente faz push, abre PR ou mergeia") — regra escrita quando o portão era lento e sem fila. Com portão rápido e fila, a
regra vira: **agente abre PR; o CI mergeia; o humano aprova DDL**.

Se o lote for mantido por outro motivo, o mínimo é: lote **menor** (≤ 30 arquivos), 2–3 por dia, e a geração de
artefatos na PR (3.2) para acabar com a cascata.

### D3 · Baseline de schema versionado (`supabase/schema-baseline.sql`)

Um dump de estrutura (sem dados) do banco oficial, reconciliado, gerado pelo Joaquim com `zapp-db-ler`/`pg_dump
--schema-only` e commitado. É o que permite o Postgres efêmero da Camada 1 em segundos e a geração de artefatos na PR.
Regenerado automaticamente após cada apply bem-sucedido do `db-migrate`. Sem ele, a seção 0 do `CLAUDE.md` ("banco local
por cópia de trabalho") continua valendo só para quem tem WSL.

### D4 · Identidade de bot e política de apps

Um GitHub App `zapp-bot` (grátis) para abrir PR, aprovar runs e comentar; `adm01-debug` fica como único humano. Com isso:
`prevent_self_review` passa a ter sentido, revisor obrigatório em `producao-ddl` vira controle real, e o guard distingue
"bot restaurou" de "humano mudou". No mesmo movimento: **um** bot de revisão de código (não cinco), SonarCloud ajustado
ou removido, Supabase for GitHub removido.

---

## 5. Caminho de migração (4 ondas, cada uma entrega valor sozinha)

| Onda | Semana | Entrega | Etapas do plano |
|---|---|---|---|
| **0 · parar de sangrar** | 1 | política decidida e aplicada; guard sem falso positivo; login E2E de volta; 2 PRs destravadas; `main` sem ❌ fantasma | W01–W10 |
| **1 · PR rápido** | 1–2 | cache, paralelismo, shards, path-filter no db-guard, `bun run verify` no repo, drafts leves | W35–W38, W44, W45, W55 + novo: `scripts/verify.mjs` |
| **2 · banco na PR** | 2–3 | D3 baseline; Postgres efêmero gera artefatos na PR; guard vivo e types-sync aprendem "apply pendente"; `db-migrate` com `apply_all_missing` e `workflow_run` | W21–W34 + novo: job "Replay & artefatos" na Camada 1 |
| **3 · produção com um clique** | 3 | deploy fail-closed, saúde pós-deploy, rollback, secrets em environment, 1 projeto Vercel, e2e-logado que roda | W59–W73, W71 |
| **4 · governança** | 4 | D1 org + fila de merge, D4 bot, perímetro lido de verdade, CodeQL triado, Scorecard, KPI com SLO | W11–W20, W81–W100 |

Dependências: D3 antes da Onda 2; D1 antes de ligar a fila (Onda 4), mas a Onda 1 e 2 não dependem de D1; D4 antes de
qualquer revisor obrigatório.

---

## 6. Como saber se funcionou (SLOs medidos pelo KPI semanal)

| Indicador | Hoje | Alvo em 30 dias |
|---|---|---|
| Tempo até o primeiro veredito de PR (p50) | ~7 min (lint) · ~17 min (tudo) | **≤ 5 min** para os 6 obrigatórios |
| Taxa de falha do CI de PR | 42 % | **< 10 %**, e 0 % por causa não-código |
| Runs "não executados" (cancelados antes de começar) | 94 % no e2e-logado | **< 10 %** em qualquer workflow |
| Janela vermelha na `main` por lote | horas, a cada lote | **0** (artefatos nascem na PR) |
| Checks ❌ permanentes na `main` | 3 | **0** |
| Cliques humanos por dia de rotina | merge de lote + apply + eventuais | **1** (aprovar DDL) |
| Comentários de bot por PR | até 32 | **≤ 3** |
| Alertas `high` de Code Scanning abertos > 30 dias | 10 | **0** |
| Guard de perímetro | 100 % ❌, cego | **100 % ✅ ou divergência real** |

---

## 7. O que esta arquitetura **não** faz, de propósito

- Não cria staging pago (Supabase branching custa por branch/dia e não resolve o problema de artefatos; o Postgres
  efêmero com baseline resolve de graça).
- Não troca Bun/Vite/Playwright/Supabase CLI: o problema é de cadeia, não de ferramenta.
- Não tira o humano do DDL: é o único lugar onde "irreversível" é literal.
- Não remove guardas de banco: move-os para onde não bloqueiam o agente e para onde rodam só quando o diff justifica.
- Não depende de ferramenta fora do repositório (`zapp-verify` do WSL): tudo que o CI exige, o agente roda com um comando
  versionado.

---

## 8. Resumo para decisão

Quatro decisões, nesta ordem: **D3** (baseline de schema, 1 h do Joaquim, destrava a Onda 2), **D2** (PRs pequenas com
auto-merge, muda uma regra do `CLAUDE.md`), **D1** (organização gratuita + fila de merge, uma tarde, acaba com o dilema
`strict`), **D4** (bot com identidade própria, um app grátis). Enquanto nenhuma é tomada, as Ondas 0 e 1 já podem
começar e sozinhas devolvem a maior parte da velocidade perdida.
