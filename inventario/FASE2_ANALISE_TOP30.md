# Fase 2 — Análise Profunda TOP 30 Branches
*Gerado em 2026-10-23*

---

## Resumo executivo

O inventário das 30 branches de maior potencial revela **três clusters distintos**: (1) o módulo completo **Copiloto de Vendas / RADAR** — 18 branches que constroem sequencialmente um assistente de IA para o inbox de vendas, com banco próprio e edge function; (2) **fixes de CI** — 5 branches que tentam verter a main para verde; e (3) **features e fixes pontuais** — 7 branches com escopo menor.

O maior risco imediato é o CI vermelho na main (`Contrato DB offline`, unit tests). A recomendação é: mergar o fix de CI da data de hoje (`claude/fix-ci-main-verde-261023-1540`) primeiro, depois os fixes pontuais, depois o Copiloto em ordem linear, e por último as branches grandes auto-nomeadas com auditoria prévia.

Há **5 pares de variantes** do Copiloto (mesma fase, dois arquivos com conteúdo diferente): manter sempre a variante mais recente e descartar a mais antiga.

---

## Clusters identificados

### Cluster A: Copiloto de Vendas — RADAR (18 branches)

Módulo AI RADAR que aparece no painel de inbox de vendas e ajuda o atendente em tempo real. Estrutura sequencial com dependência linear nas 3 primeiras:

```
cv011-020 (banco) → cv021-030 (worker / edge) → cv031-040 (BRINDES)
                                                       ↓
                    cv061-070 → cv071-080 → cv091-100 → cv101-110
                                                       ↓
                    cv111-120 → cv121-130 → cv131-140 → cv141-150
```

Cada sub-módulo acrescenta componentes React + hooks em `src/components/copilot/` e `src/hooks/copilot/`. Os sub-módulos de fase 7 em diante não tocam banco.

Para cada fase há **dois variantes** com conteúdos diferentes (não duplicatas exatas, exceto cv061-070):

| Fase | Variante A (mais recente) | Variante B (mais antiga) | Situação |
|---|---|---|---|
| cv061-070 | `261016-2200` | `261016-2142` | **Idênticas** — descartar 2142 |
| cv091-100 | `261016-2240` (11 arq) | `261016-2305` (14 arq) | Variante 2305 tem mais conteúdo |
| cv101-110 | `261016-2310` (8 arq) | `261016-0730` (16 arq) | Variante 0730 tem mais conteúdo |
| cv121-130 | `261016-2320` (8 arq) | `261016-2304` (12 arq) | Variante 2304 tem mais conteúdo |
| cv131-140 | `261016-2325` (8 arq) | `261016-2310` (12 arq) | Variante 2310 tem mais conteúdo |
| cv141-150 | `261016-2330` (8 arq) | `261016-2317` (12 arq) | Variante 2317 tem mais conteúdo |

Recomendação: para cada par, conferir qual tem testes e exportações mais completas antes de mergar; na dúvida, preferir a variante com mais arquivos.

### Cluster B: Fixes de CI (5 branches)

Cinco branches tentam consertar o CI da main. Risco de sobreposição entre elas — não mergar em paralelo.

| Branch | Foco | Tamanho |
|---|---|---|
| `claude/fix-ci-main-verde-261023-1540` | 5 falhas de unit tests + db-guard | 12 arq, 7 commits |
| `fix/ci-verde-261021` | migrations + manifesto + workflow | 46 arq, 7 commits |
| `codex/publish-followup-20261021` | hardening CI + docs | 59 arq, 1 commit |
| `codex/fix-failed-workflows-20261020` | workflow guards | 45 arq, 2 commits |
| `fix/ci-workflows-vermelhos` | destravar workflows | 325 arq (!) |

### Cluster C: Features e fixes pontuais (7 branches)

Menor risco, maior certeza de valor:

| Branch | Escopo |
|---|---|
| `claude/pensive-cori-i93zgf` | Export duplicado — 2 arquivos, trivial |
| `claude/feat-e83-entrar-por-codigo-261020-1935` | Team chat: entrar por código de convite |
| `claude/fix-ga-fase0-banco-e2e-261020-2200` | CI + E2E + fixture banco |
| `claude/fix-canonical-receipt-policies-261020-2005` | 1 migration: recria policies de receipt |

### Cluster D: Branches grandes auto-nomeadas (3 branches)

Branches com muitos commits acumulados, escopo amplo, risco de conflito alto:

| Branch | Commits | Arquivos | Risco |
|---|---|---|---|
| `claude/sharp-faraday-qfortu` | 92 | 374 | ALTO |
| `claude/ecstatic-bardeen-twiveb` | 51 | 92 | MÉDIO |
| `claude/loving-lovelace-esc3l2` | 28 | 58 | MÉDIO |

---

## Análise individual

### 1. `claude/fix-ci-main-verde-261023-1540` — Fix CI main hoje
- **Commits:** 7
- **Arquivos alterados:** 12 (+84 −33)
- **Toca banco:** não
- **Valor de negócio:** Desbloqueia todos os merges futuros — sem CI verde nada passa.
- **Risco:** baixo — cirúrgico, 12 arquivos, commits descritivos
- **Pré-requisito:** nenhum

### 2. `claude/pensive-cori-i93zgf` — Remove export duplicado
- **Commits:** 1
- **Arquivos alterados:** 2 (+2 −2)
- **Toca banco:** não
- **Valor de negócio:** Corrige erro de build — `isOverdue` exportado duas vezes.
- **Risco:** baixo — 2 arquivos, 1 commit
- **Pré-requisito:** nenhum

### 3. `claude/fix-canonical-receipt-policies-261020-2005` — Policies de receipt
- **Commits:** 1
- **Arquivos alterados:** 1 migration (+109)
- **Toca banco:** sim — `20261021000000_recreate_team_message_receipt_policies_canonical.sql`
- **Valor de negócio:** Corrige leitura de recibos no Team Chat (quem leu/recebeu a mensagem).
- **Risco:** baixo — 1 migration, 1 arquivo
- **Pré-requisito:** CI verde

### 4. `claude/feat-e83-entrar-por-codigo-261020-1935` — Team Chat: entrar por código
- **Commits:** 1
- **Arquivos alterados:** 5 (+361)
- **Toca banco:** não
- **Valor de negócio:** Permite que usuários entrem num departamento do Team Chat pelo código de convite, sem precisar de convite individual.
- **Risco:** baixo — 5 arquivos, sem banco
- **Pré-requisito:** CI verde

### 5. `claude/fix-ga-fase0-banco-e2e-261020-2200` — Fix banco + E2E + notificação
- **Commits:** 1
- **Arquivos alterados:** 13 (+389 −84)
- **Toca banco:** sim — `20261020120000_e2e_fixture_message_rpc.sql`
- **Valor de negócio:** Adiciona RPC de fixture para E2E + corrige workflow de notificação de falha na main.
- **Risco:** médio — toca CI, E2E e banco ao mesmo tempo
- **Pré-requisito:** nenhum (não depende de CI verde por ser fix de CI)

### 6. `codex/publish-followup-20261021` — CI hardening + docs
- **Commits:** 1
- **Arquivos alterados:** 59 (+1715 −868)
- **Toca banco:** sim — 2 migrations
- **Valor de negócio:** Consolida vários scripts de CI, atualiza docs de TalkX e edge functions.
- **Risco:** médio — 59 arquivos, toca CLAUDE.md e muitos docs; risco de conflito com main
- **Pré-requisito:** conferir se as 2 migrations já estão no banco antes de mergar

### 7. `fix/ci-verde-261021` — Fix CI + migrations + manifesto
- **Commits:** 7
- **Arquivos alterados:** 46 (+1085 −440)
- **Toca banco:** não (apenas workflow/scripts)
- **Valor de negócio:** Alinha grants, RPCs e manifesto com o banco vivo; corrige workflow CI.
- **Risco:** médio — 46 arquivos, toca workflows (.github/)
- **Pré-requisito:** confirmar que não sobrepõe com `claude/fix-ci-main-verde-261023-1540`

### 8. `codex/fix-failed-workflows-20261020` — Reconcilia guards de workflow
- **Commits:** 2
- **Arquivos alterados:** 45 (+500 −368)
- **Toca banco:** não
- **Valor de negócio:** Repara contratos de CI e recarrega bundles de workflow.
- **Risco:** médio — 45 arquivos, todos em `.github/` e scripts
- **Pré-requisito:** avaliar sobreposição com `fix/ci-verde-261021`

### 9. `claude/feat-copiloto-cv011-020-migrations-261016-1930` — Banco Copiloto (Fase 2)
- **Commits:** 5
- **Arquivos alterados:** 9 (+324 −382)
- **Toca banco:** sim — 6 migrations: `copilot_sessions`, `copilot_insights`, `copilot_feedback`, `copilot_tick_trigger`, `copilot_presence`, `copilot_retention`
- **Valor de negócio:** Cria toda a infraestrutura de banco do Copiloto RADAR: sessões de análise, insights gerados, feedback do atendente, presença, retenção de dados (LGPD).
- **Risco:** médio — 6 migrations novas, sem conflito de tabela existente
- **Pré-requisito:** CI verde; aplicar via workflow db-migrate.yml com dry-run

### 10. `claude/feat-copiloto-cv021-030-worker-261016-2100` — Edge function copilot-live
- **Commits:** 1
- **Arquivos alterados:** 4 (+1005 −3)
- **Toca banco:** sim — `20261016194000_copilot_live_helpers.sql`
- **Valor de negócio:** Motor de análise incremental RADAR — edge function que processa mensagens em tempo real e grava insights.
- **Risco:** médio — toca edge function + migration; deploy requer `deploy-functions.yml`
- **Pré-requisito:** cv011-020 mergeado e banco aplicado

### 11. `claude/feat-copiloto-cv031-040-brinde-intelligence-261016-2025` — Brinde Intelligence
- **Commits:** 1
- **Arquivos alterados:** 16 (+1889 −1)
- **Toca banco:** sim — 2 migrations (`copilot_live_helpers`, `copilot_phase4_brinde_intelligence`)
- **Valor de negócio:** Framework B·R·I·N·D·E ao vivo: mede orçamento, relacionamento, influência, necessidade, decisor e evento — os 6 eixos de qualificação de lead para brindes.
- **Risco:** médio — 16 arquivos, 2 migrations, toca `copilot-live` edge function
- **Pré-requisito:** cv021-030 mergeado

### 12. `claude/feat-copiloto-cv061-070-ghost-text-261016-2200` — Ghost text, voz, templates
- **Commits:** 1
- **Arquivos alterados:** 18 (+1983 −2)
- **Toca banco:** não
- **Valor de negócio:** Ghost text (sugestão inline enquanto digita), ditado por voz, smart templates contextuais, sugestão de anexo, feedback do atendente.
- **Risco:** baixo — sem banco, 18 arquivos de UI/hooks
- **Pré-requisito:** cv031-040 mergeado; descartar `261016-2142` (idêntica)

### 13. `claude/feat-copiloto-cv071-080-objection-battlecard-261016-2230` — Objeções e battlecard
- **Commits:** 1
- **Arquivos alterados:** 14 (+1377)
- **Toca banco:** não
- **Valor de negócio:** Detecta objeções de preço/prazo/concorrente, mostra battlecard, guardrail de desconto e alerta de risco de perda de negócio.
- **Risco:** baixo — sem banco, UI/hooks apenas
- **Pré-requisito:** cv061-070

### 14. `claude/feat-copiloto-cv091-100-signals-261016-2305` — Sinais de lead (variante maior)
- **Commits:** 1
- **Arquivos alterados:** 14 (+1026)
- **Toca banco:** não
- **Valor de negócio:** Termômetro do lead, speed-to-lead badge, alerta de silêncio, follow-up inteligente.
- **Risco:** baixo — sem banco, UI/hooks
- **Pré-requisito:** cv071-080; usar esta variante (14 arq) sobre `261016-2240` (11 arq)

### 15. `claude/feat-copiloto-cv101-110-multimodal-261016-0730` — Análise multimodal (variante maior)
- **Commits:** 1
- **Arquivos alterados:** 16 (+939)
- **Toca banco:** não
- **Valor de negócio:** Análise de áudio, imagem e documento — o copiloto extrai contexto de arquivos enviados no chat.
- **Risco:** baixo — sem banco
- **Pré-requisito:** cv091-100; usar esta variante (16 arq) sobre `261016-2310` (8 arq)

### 16. `claude/feat-copiloto-cv111-120-guardrails-261016-2315` — Guardrails LGPD
- **Commits:** 1
- **Arquivos alterados:** 8 (+600)
- **Toca banco:** não
- **Valor de negócio:** Filtros de privacidade, tone guard (linguagem inapropriada), consentimento LGPD, filtro de sugestões sensíveis.
- **Risco:** baixo — sem banco
- **Pré-requisito:** cv101-110

### 17. `claude/feat-copiloto-cv121-130-supervisor-261016-2304` — Supervisor e coaching (variante maior)
- **Commits:** 1
- **Arquivos alterados:** 12 (+1082)
- **Toca banco:** não
- **Valor de negócio:** Painel de supervisor com visão de todos os atendentes, modo coaching (dicas em tempo real), modo treinamento.
- **Risco:** baixo — sem banco
- **Pré-requisito:** cv111-120; usar esta variante (12 arq) sobre `261016-2320` (8 arq)

### 18. `claude/feat-copiloto-cv131-140-aprendizado-261016-2310` — Aprendizado contínuo (variante maior)
- **Commits:** 1
- **Arquivos alterados:** 12 (+902)
- **Toca banco:** não
- **Valor de negócio:** Base de conhecimento contextual, melhoria contínua, análise de padrões de conversa, funil de conversão, biblioteca de objeções, coaching personalizado, score preditivo de lead.
- **Risco:** baixo — sem banco
- **Pré-requisito:** cv121-130; usar esta variante (12 arq) sobre `261016-2325` (8 arq)

### 19. `claude/feat-copiloto-cv141-150-piloto-261016-2317` — Orquestrador master (variante maior)
- **Commits:** 1
- **Arquivos alterados:** 12 (+1400)
- **Toca banco:** não
- **Valor de negócio:** Orquestrador RADAR que unifica todos os sub-módulos, painel master, persistência de estado, atalhos de teclado.
- **Risco:** médio — integra todos os hooks, risco de conflito em `index.ts` de copilot
- **Pré-requisito:** cv131-140; usar esta variante (12 arq) sobre `261016-2330` (8 arq)

### 20. `claude/ecstatic-bardeen-twiveb` — Admin view + fixes gerais
- **Commits:** 51
- **Arquivos alterados:** 92 (+3729 −1422)
- **Toca banco:** sim — 1 migration
- **Valor de negócio:** Conserta AdminView (useAdminData), MediaMigrationTool, AgentsView, várias páginas de configurações; sincroniza com main.
- **Risco:** médio-alto — 51 commits, 92 arquivos, risco de conflito em arquivos tocados recentemente
- **Pré-requisito:** CI verde; fazer diff completo antes de mergar

### 21. `claude/loving-lovelace-esc3l2` — Admin + migrations de login/search
- **Commits:** 28
- **Arquivos alterados:** 58 (+6440 −385)
- **Toca banco:** sim — 3 migrations: `dept_invites_ownership_fix`, `login_attempts_ttl_lgpd`, `log_search_event_rpc`
- **Valor de negócio:** Corrige MediaMigrationTool, departamento (ownership), TTL de tentativas de login (LGPD), RPC de log de busca.
- **Risco:** médio-alto — 28 commits, migrations de produção, auditoria RLS
- **Pré-requisito:** CI verde; verificar overlap com `ecstatic-bardeen-twiveb`

### 22. `claude/sharp-faraday-qfortu` — Grande consolidação
- **Commits:** 92
- **Arquivos alterados:** 374 (+9806 −4722)
- **Toca banco:** sim — 4 migrations
- **Valor de negócio:** Remove edge functions sem rota na Evolution GO, corrige SL-075, E96/E97 Vercel env, grant em trigger `multiplix_audiences`, vercel-env-cleanup.
- **Risco:** ALTO — 374 arquivos, 92 commits, merge de main incluído; investigar em detalhes antes de mergar
- **Pré-requisito:** CI verde; auditoria prévia obrigatória

### 23. `fix/ci-workflows-vermelhos` — Destravar workflows (enorme)
- **Commits:** 1
- **Arquivos alterados:** 325 (!)
- **Toca banco:** não
- **Valor de negócio:** Um único commit destravando workflows com 325 arquivos alterados é suspeito — provavelmente inclui mudanças não intencionais.
- **Risco:** ALTO — volume anormal para "fix de CI"; investigar o diff antes de qualquer merge
- **Pré-requisito:** auditoria do diff completo

### 24. `claude/ga-ci-verde-261020` — CI verde GA fase 5 (grande)
- **Commits:** 45
- **Arquivos alterados:** 159 (+14260 −12894)
- **Toca banco:** não
- **Valor de negócio:** Múltiplos fixes de CI acumulados da fase GA, incluindo merge de main. Muito overlap esperado com o que já entrou.
- **Risco:** ALTO — 45 commits, +14k/−12k linhas; provavelmente conflita com main atual
- **Pré-requisito:** auditoria; avaliar o que ainda não está em main antes de mergar

---

## Ordem de merge recomendada

| Prioridade | Branch | Motivo |
|---|---|---|
| 1 | `claude/fix-ci-main-verde-261023-1540` | Desbloqueia todo o resto |
| 2 | `claude/pensive-cori-i93zgf` | Trivial, remove bug de build |
| 3 | `claude/fix-canonical-receipt-policies-261020-2005` | 1 migration, baixo risco |
| 4 | `claude/feat-e83-entrar-por-codigo-261020-1935` | Feature pronta, baixo risco |
| 5 | `claude/fix-ga-fase0-banco-e2e-261020-2200` | Habilita E2E dos próximos |
| 6 | `fix/ci-verde-261021` | Alinha manifesto, libera db-guard |
| 7 | `codex/publish-followup-20261021` | Docs + CI hardening (conferir migrations) |
| 8 | `claude/feat-copiloto-cv011-020-migrations-261016-1930` | Base do banco Copiloto |
| 9 | `claude/feat-copiloto-cv021-030-worker-261016-2100` | Edge function copilot-live |
| 10 | `claude/feat-copiloto-cv031-040-brinde-intelligence-261016-2025` | Primeiro valor visível do RADAR |
| 11 | `claude/feat-copiloto-cv061-070-ghost-text-261016-2200` | Ghost text — UX de alto impacto |
| 12 | `claude/feat-copiloto-cv071-080-objection-battlecard-261016-2230` | Objeções + battlecard |
| 13 | `claude/feat-copiloto-cv091-100-signals-261016-2305` | Sinais de lead (variante maior) |
| 14 | `claude/feat-copiloto-cv101-110-multimodal-261016-0730` | Multimodal (variante maior) |
| 15 | `claude/feat-copiloto-cv111-120-guardrails-261016-2315` | Guardrails LGPD |
| 16 | `claude/feat-copiloto-cv121-130-supervisor-261016-2304` | Supervisor (variante maior) |
| 17 | `claude/feat-copiloto-cv131-140-aprendizado-261016-2310` | Aprendizado (variante maior) |
| 18 | `claude/feat-copiloto-cv141-150-piloto-261016-2317` | Orquestrador master (variante maior) |
| 19 | `claude/loving-lovelace-esc3l2` | Admin + migrations (após auditoria) |
| 20 | `claude/ecstatic-bardeen-twiveb` | Admin view (após auditoria, verificar overlap com loving-lovelace) |
| 21 | `claude/sharp-faraday-qfortu` | Somente após auditoria completa |

---

## Branches a descartar ou investigar primeiro

### Descartar (duplicatas exatas):
- `claude/feat-copiloto-cv061-070-ghost-text-261016-2142` — **idêntica** a `261016-2200`; descartar

### Variantes inferiores (descartar após confirmar a outra):
- `claude/feat-copiloto-cv091-100-lead-signals-261016-2240` — 11 arq; preferir `261016-2305` (14 arq)
- `claude/feat-copiloto-cv101-110-multimodal-261016-2310` — 8 arq; preferir `261016-0730` (16 arq)
- `claude/feat-copiloto-cv121-130-supervisor-261016-2320` — 8 arq; preferir `261016-2304` (12 arq)
- `claude/feat-copiloto-cv131-140-analytics-261016-2325` — 8 arq; preferir `261016-2310` (12 arq)
- `claude/feat-copiloto-cv141-150-integration-261016-2330` — 8 arq; preferir `261016-2317` (12 arq)

### Investigar antes de mergar:
- `fix/ci-workflows-vermelhos` — 325 arquivos num único commit; analisar diff completo para confirmar intenção
- `claude/ga-ci-verde-261020` — 14k/12k linhas alteradas; muito provável overlap com main atual
- `codex/fix-failed-workflows-20261020` — verificar se sobrepõe com `fix/ci-verde-261021`
- `claude/sharp-faraday-qfortu` — 374 arquivos, auditoria de escopo obrigatória

---
*Arquivo gerado por análise automática via `git diff --stat` e `git log --oneline` de cada branch contra `origin/main`.*
