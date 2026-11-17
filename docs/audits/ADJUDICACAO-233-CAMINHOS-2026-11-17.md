# Adjudicacao dos 233 caminhos funcionais que so existem em branch — 17/11/2026

Complemento do `LAUDO-BRANCHES-2026-11-17.md`. O laudo responde "esta branch esta contida na
`main`?"; este documento responde a pergunta que de fato autoriza fechar: **cada arquivo
funcional que existe so em branch ja esta na `main`, ficou obsoleto, ou e trabalho a resgatar?**

## Numeros

| | |
|---|---|
| Caminhos funcionais adjudicados | **233** |
| Ja incorporados a `main` | 64 |
| Obsoletos (a `main` seguiu outro caminho) | 131 |
| **A resgatar** | **38** |
| Sem veredito | 0 |
| Branches com codigo proprio nesses caminhos | 42 |
| Branches LIBERADAS (nenhum caminho a resgatar) | **27** |
| Branches que ainda seguram trabalho | **15** |

Detalhe por caminho, com a evidencia de cada veredito:

- `adjudicacao-261117/resgatar.md` — os 38 a resgatar
- `adjudicacao-261117/incorporado.md` — os 64 ja na `main`
- `adjudicacao-261117/obsoleto.md` — os 131 obsoletos

## Metodo, e por que ele e diferente do laudo

O laudo usa **contencao por SHA de blob**: uma branch esta contida quando todo blob dela existe
na `main`, em qualquer caminho. Isso prova o caso facil e nao decide o caso que importa — arquivo
que existe so em branch. Para esses 233, cada um foi lido.

Tres armadilhas custaram tempo e estao registradas para o proximo agente nao cair nelas:

1. **O clone e parcial (`[tree:0]`)**. `git log -- <caminho>` devolve "nunca" mesmo para caminho
   que a `main` ja teve. Historia nao serve de prova aqui.
2. **225 das 236 refs locais nao tem ancestral comum com a `main`** ("refusing to merge unrelated
   histories"). Isso derruba `merge-base`, `merge-tree` e qualquer leitura de `ahead_by`.
3. **Lapide falsa**. Um teste na branch dizia que um hook havia sido removido, e a `main` usa esse
   hook em `TalkXSuppression.tsx:32,305,306,415`. Veredito de arquivo nao substitui leitura do codigo.

Por isso a adjudicacao foi feita em duas fases:

- **Sete adjudicadores**, um por lote, cada veredito obrigado a citar `arquivo:linha` ou saida de
  comando. 233 vereditos, nenhum "nao verificado".
- **Quatro refutadores**, instruidos a **derrubar** todo veredito de "incorporado" ou "obsoleto" —
  isto e, todo veredito que autorizaria apagar. Conferiram 153 e **derrubaram 12**.

## Os 12 vereditos derrubados pela conferencia

Doze trabalhos reais que a primeira passada teria jogado fora. Os mais serios:

- **`src/components/settings/AIAutoTagsConfig.tsx`** — a premissa "a funcao de tags de IA foi
  removida" e FALSA: a edge `supabase/functions/ai-auto-tag/index.ts` esta viva na `main`, com
  teste e contrato. O que saiu foi um bloco de exibicao. A funcionalidade roda em producao **sem
  tela para configurar**.
- **`src/components/inbox/ConversationMemoryPanel.tsx`** — a `main` tem so a metade de leitura, e o
  cabecalho dela admite: "somente leitura... sem edicao". A branch tem o caminho de escrita, com as
  duas guardas que impedem gravar a memoria de um contato em cima da de outro.
- **`supabase/migrations/20261016193200_copilot_feedback.sql`** — a tabela da `main` faz MENOS, e a
  evidencia que dispensava o resgate citava a linha errada do proprio documento.
- **`src/hooks/copilot/useMultimodalAnalysis.ts`** — "chamam a mesma edge" era o nome, nao o
  contrato: os dois sao incompativeis e a `main` faz menos.
- **`src/components/inbox/chat/CrmBadges.tsx`** — os selos ficam no cabecalho da conversa, e a
  `main` nao tem `ChatHeader.tsx` em lugar nenhum.
- **`scripts/db-audit/check-ddl-deployments.mjs`** — a `main` tem a regra, nao o detector: o script
  dela so le JSON de disco, nao consulta o ledger ao vivo.

A lista completa, com o texto integral de cada refutacao, esta em `adjudicacao-261117/resgatar.md`.

## Tres vereditos de resgate que foram derrubados na direcao oposta

`src/hooks/crm/useContactPurchases.ts` e seus dois testes estavam marcados como "resgatar". Nao
devem ser resgatados: a tabela `contact_purchases` foi removida **por decisao do dono**
(`supabase/migrations/20261103201500_remove_pagamentos_e_special_agent.sql:2` e `:63`), e a
producao oficial confirma — `to_regclass('public.contact_purchases')` devolve NULL e a migration
consta aplicada. Resgatar criaria hook e testes contra tabela inexistente. O item fica em
`adjudicacao-261117/obsoleto.md` com essa evidencia.

Isso vale como aviso de metodo: o adjudicador do lote de hooks citou a migration **de criacao**, de
abril; o do lote de componentes achou a de **remocao**, de novembro. Quando dois lotes discordam
sobre o mesmo modulo, vale o estado ao vivo do banco.

## O que este laudo autoriza

**Autoriza fechar** uma branch cujos caminhos funcionais estao todos em `incorporado.md` ou
`obsoleto.md` — sao as 27 abaixo. A prova de cada caminho esta no arquivo correspondente.

**Nao autoriza** fechar as 15 que ainda seguram trabalho, e nao autoriza nada sobre as 72 branches
restantes das 114 vivas: aquelas nao tem caminho funcional exclusivo e sao cobertas pela contencao
por blob do laudo principal.

### 27 branches liberadas

| branch | caminhos funcionais, todos adjudicados |
|---|---|
| `claude/charming-mccarthy-jbxy56` | 1 |
| `claude/chore-laudo-branches-261117-1608` | 1 |
| `claude/chore-secdef-guard-ci-test-261107-1600` | 1 |
| `claude/confident-bardeen-ndq0ch` | 1 |
| `claude/ecstatic-bardeen-twiveb` | 2 |
| `claude/feat-ci-local-espelho-261111` | 1 |
| `claude/feat-completar-c121-261101-1330` | 1 |
| `claude/feat-contexto-ia-261103-0728` | 1 |
| `claude/feat-copilot-radar-20261108-1800` | 5 |
| `claude/feat-message-delivery-post-iniciado-261101-1330` | 1 |
| `claude/feat-radar-fase6-261108-1933` | 1 |
| `claude/feat-remove-special-agent-261113` | 1 |
| `claude/feat-talkx-x003-demo-fixtures-261101-2143` | 17 |
| `claude/feat-talkx-x070-suppression-reasons-261101-2230` | 1 |
| `claude/fix-conversas-p0-p1-backend-261113` | 4 |
| `claude/fix-ga-fase0-banco-e2e-261020-2200` | 1 |
| `claude/fix-gr023-ossf-scorecard` | 1 |
| `claude/fix-inventario-vault-cron-edges-261111-0315` | 1 |
| `claude/fix-logger-vitest-mock-261017-1000` | 1 |
| `claude/fix-pd79-compat-pre-migration-261111` | 2 |
| `claude/fix-unit-tests-pre-existentes-261024-1700` | 1 |
| `claude/loving-lovelace-esc3l2` | 3 |
| `claude/tender-heisenberg-a4jk3s` | 1 |
| `claude_04/nice-cori-7snz6b` | 10 |
| `claude_05/zen-feynman-29b7ix` | 1 |
| `claude_juca/practical-rubin-8xnw0u` | 1 |
| `claude_pink/nice-hypatia-iikl82` | 10 |

### 15 branches que ainda seguram trabalho

| branch | caminhos a resgatar |
|---|---|
| `claude/busy-cannon-40szm9` | `scripts/db-audit/talkx-attribution.test.sh`, `scripts/db-audit/talkx-rfm.test.sh`, `.github/workflows/auto-update-pr-branch.yml` |
| `claude/feat-E90-main-failure-notify-261101-1730` | `.github/workflows/main-failure-notify.yml` |
| `claude/feat-copiloto-cv011-020-migrations-261016-1930` | `supabase/migrations/20261016193200_copilot_feedback.sql`, `supabase/migrations/20261016193500_copilot_retention.sql` |
| `claude/feat-copiloto-edges-261101-1330` | `src/hooks/copilot/useMultimodalAnalysis.ts` |
| `claude/feat-talkx-x048-estados-servico-261101-2100` | `src/hooks/integrations/__tests__/useTalkXServiceStatus.test.ts` |
| `claude/feat-ui-visual-texto-longo-261101-1445` | `src/components/ui/__tests__/primitivos-texto-longo-a11y.test.tsx` |
| `claude/fix-ga-fase78-perimetro-custo-261020-2200` | `scripts/ci/aplicar-perimetro.mjs`, `scripts/ci/aplicar-perimetro.unit.mjs`, `scripts/ci/docker-pins.unit.mjs` |
| `claude/fix-ga-resto-dbmigrate-20261021-0729` | `scripts/ci/assert-runtime-proof.unit.mjs`, `scripts/ci/compose-confirm-hash.unit.mjs`, `scripts/ci/db-migrate-ga13-17.unit.mjs`, `scripts/ci/proof-sha.unit.mjs`, `scripts/db-audit/calcular-lote.sh`, `scripts/db-audit/compose-confirm-hash.mjs`, `scripts/db-audit/proof-sha.mjs`, `scripts/db-audit/provar-lote.sh` |
| `claude/fix-ga-resto-typessync-20261021-0730` | `scripts/ci/ga20-ga25-contratos.unit.mjs` |
| `claude/fix-multiplix-502-codigo-singu-261117-1551` | `supabase/functions/multiplix-audience/__tests__/502-codigo-do-singu.test.ts` |
| `claude_05/serene-feynman-3uuurw` | `.claude/CLAUDE.md` |
| `claude_pink/cool-dijkstra-xk9ek2` | `scripts/ci/check-edge-envs.mjs`, `scripts/ci/edge-env-baseline.json`, `scripts/ci/ga25-ddl-check.mjs`, `scripts/db-audit/check-ddl-deployments.mjs`, `scripts/db-migrate/register-deployments.mjs` |
| `codex/publish-followup-20261021` | `scripts/ci/vercel-env-cleanup-workflow.unit.mjs` |
| `hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423` | `src/components/inbox/chat/CrmBadges.tsx`, `src/components/inbox/contact-details/ExternalContact360Panel.tsx`, `src/components/mobile/MobileSlidePanel.tsx`, `src/components/settings/AIAutoTagsConfig.tsx`, `src/components/ui/__tests__/robustez-primitivos.test.tsx`, `src/hooks/__tests__/useMessageStatus.test.tsx`, `src/hooks/inbox/__tests__/useInboxFilterTags.camada-servico.test.tsx` |
| `hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c` | `src/components/inbox/ConversationMemoryPanel.tsx`, `src/components/inbox/__tests__/ConversationMemoryPanel.test.tsx` |

## Limites — o que NAO foi verificado

- Cada veredito e a leitura de **um** adjudicador; 153 dos 233 passaram por refutacao, os outros 80
  nao. Um veredito nao refutado nao e um veredito conferido duas vezes.
- Os refutadores atacaram so a direcao perigosa (incorporado/obsoleto). Veredito de "resgatar" nao
  foi atacado por eles — a correcao das tres linhas de `useContactPurchases` saiu de conferencia
  manual, nao do processo.
- 21 dos 38 caminhos a resgatar exigem mexer em workflow, CI, DDL ou segredo, o que pela regra do
  repositorio e decisao do dono. Estao marcados nos itens.
