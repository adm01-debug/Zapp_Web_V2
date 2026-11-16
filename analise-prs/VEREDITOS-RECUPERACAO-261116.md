# Vereditos da recuperação — lote 1 (16/11/2026)

Continuação de `analise-prs/RECUPERACAO-TOTAL-261116.md`. Lá está o inventário; aqui começam os
**vereditos**, que são o que autoriza fechar uma branch.

Regra: cada item sai como **recuperar** (a funcionalidade falta na `main` e o trabalho é
aproveitável — então é terminado e entra por PR) ou **obsoleto** (com motivo verificável).
Enquanto um item não tiver veredito, a branch dele não fecha.

## A fila real: de 2.231 para 211

Três triagens medidas, nenhuma delas descartando item por amostragem:

**1. Direção do tamanho.** Para cada par (arquivo, branch) com linha ausente, a versão da branch
é maior ou menor que a da `main`?

| | Pares |
|---|---|
| Branch **menor** que a `main` — a `main` está à frente, nada a recuperar | **1.259** |
| Branch não menor — pode conter trabalho não recuperado | 972 |

Desses 972, deduplicando por conteúdo (mesmo arquivo e mesmo blob em várias branches):
**873 versões distintas**, em 506 arquivos distintos.

**2. Contagem de casos de teste.** Das 873 versões, **673 são arquivo de teste** (77%). Para
teste, o que importa não é linha: é caso coberto. Contando `it(` e `test(` na branch e na `main`:

| | Versões de teste |
|---|---|
| Mesma contagem de casos | 650 |
| Branch com **menos** casos | 12 |
| Branch com **mais** casos — possível cobertura perdida | **11** |

**3. Existência da API e do objeto.** Um teste que importa função que a `main` não exporta não
compila contra a `main`: ele testa uma API removida. Uma migration é conferida pelo objeto que
cria, no catálogo de produção — não pelo nome do arquivo.

**Resultado: a fila de adjudicação é de 211 itens** — 11 versões de teste com casos a mais e 200
versões de código de produção — e não os 2.231 pares brutos. Distribuição das 200 de código:

| Assunto | Versões | | Assunto | Versões |
|---|---|---|---|---|
| outros | 31 | | copiloto | 10 |
| hooks | 28 | | admin | 8 |
| inbox | 23 | | team-chat | 6 |
| edge | 20 | | settings | 6 |
| Talk X | 18 | | security | 4 |
| ui | 14 | | lib | 3 |
| migrations | 13 | | conexões, páginas, monitoramento | 1 cada |
| chat | 13 | | | |

---

## Veredito 1 — `claude_pink/nice-hypatia-iikl82`: **OBSOLETA**. Recuperar seria regressão

É a maior branch do repositório por trabalho não incorporado: **347 caminhos**. O nome dos
arquivos sugeria recurso inteiro faltando (carteira, conexão WhatsApp). O conteúdo diz o oposto.

**Os arquivos "novos" são stubs e re-exports:**

| Arquivo | Linhas | O que realmente é |
|---|---|---|
| `src/hooks/wallet/useWallet.ts` | 22 | `useState(null)` e `useState([])` e **nunca atribui nada**. Sem consulta, sem Supabase: devolve carteira nula e lista vazia para sempre |
| `src/components/wallet/WalletCard.tsx` | 17 | Só formata o que recebe por prop — alimentado pelo stub acima |
| `src/components/wallet/TransactionList.tsx` | 23 | Idem |
| `src/components/connections/ConnectWhatsAppDialog.tsx` | 16 | `<div role="dialog">` com **um único botão Fechar**. Sem QR, sem formulário, sem conexão |
| `src/hooks/connections/useConnections.ts` | 20 | `select('*')` sem filtro, duplicando o `useConnectionsManager` — de onde ela importa o próprio tipo |
| `src/types/connections.ts` | **1** | `export type { WhatsAppConnection } from '@/hooks/inbox/useConnectionsManager'` |
| `src/shadcn/ui/button.tsx` | **1** | `export { Button, buttonVariants } from '@/components/ui/button'` |
| `src/components/ui/AuroraBorealis.tsx` | 12 | Decorativo |
| `src/components/ui/FloatingParticles.tsx` | 17 | Decorativo |

**E os arquivos existentes foram esvaziados.** Dos 316 arquivos de `src/` em que a branch difere
da `main`: **166 são menores** na branch, 134 têm o mesmo tamanho e 16 são maiores. Os dois casos
extremos:

| Arquivo | `main` | branch |
|---|---|---|
| `src/components/connections/ConnectionsView.tsx` | 287 linhas | **73** |
| `src/components/wallet/ClientWalletView.tsx` | 137 linhas | **35** |

A branch não acrescentou carteira: ela **esvaziou a carteira real** para pendurar os stubs. A
carteira de verdade está na `main` desde antes desta branch bifurcar —
`src/components/wallet/ClientWalletView.tsx`, `src/hooks/business/useClientWallet.ts`, a migration
`20261015213324_client_wallet_apply.sql` (15/10, a branch bifurcou em 19/10), teste de componente,
teste de edge e teste SQL.

**O único trecho que parecia ganho real também não é.** `src/hooks/integrations/useTalkXSuppression.ts`
é 109 linhas maior na branch, com `addEntry` e `removeEntry` escrevendo direto em
`talkx_blacklist` (`.insert()` e `.delete()`). A `main` documenta, no cabeçalho do próprio
arquivo, por que esse código saiu:

> O hook de lista que morava neste módulo (listagem própria, `isSuppressed` em dois passos e
> remoção com `DELETE` físico) foi removido pelo TL-002: nenhum arquivo o importava — a tela faz
> as próprias queries — e o `DELETE` físico contrariava a trilha append-only do módulo.

Trazer de volta reintroduziria `DELETE` físico numa trilha append-only. O comportamento vive em
`src/components/talkx/TalkXSuppression.tsx`, com 8 arquivos de teste na `main`.

**Resta verificar antes de fechar a branch:** `src/hooks/__tests__/helpers/alertBehaviorTestKit.ts`
(+152 linhas, helper de teste) e 13 arquivos com diferença de 1 a 28 linhas. **NÃO VERIFICADO** —
nada nesta branch é fechado até esses 14 terem veredito.

---

## Veredito 2 — `src/lib/__tests__/talkxCsv.test.ts`: **OBSOLETO** (API removida)

`claude_juca/practical-rubin-8xnw0u` tem 15 casos onde a `main` tem 3, incluindo proteção contra
injeção de CSV (prefixo `+`, TAB inicial), BOM UTF-8 e escape de aspas, quebra de linha e `;`.
Parecia o achado mais forte da fila. Não é, por dois motivos medidos:

1. **A proteção já está implementada na `main`**, e documentada em `src/lib/talkxCsv.ts:4-5`:
   "UTF-8 BOM + separador `;` (padrão do Excel BR) + guard contra injeção CSV (células que começam
   com `=`, `+`, `-`, `@`, TAB ou CR recebem prefixo `'`)"; o guard em si está em `:33-34`. O
   teste da `main` cobre as combinações **difíceis** (fórmula com `;`, fórmula com quebra de
   linha), que são as que podem partir a coluna.
2. **O teste da branch não compila contra a `main`.** Ele importa `serializeTalkXCsv` e
   `downloadCsv`; a `main` exporta `buildTalkXCampaignCsvBlob`. A API foi redesenhada, e
   `downloadCsv` não existe em nenhum lugar da `main`.

Os 12 casos a mais são granularidade (um por caractere perigoso) sobre uma API que não existe
mais. Nada a recuperar.

---

## Veredito 3 — as 6 migrations de copiloto: **INCORPORADAS, renumeradas**

`claude/feat-copiloto-cv011-020-migrations-261016-1930` tem 6 migrations que não existem na
`main` por nome. Conferindo pelo **objeto** no catálogo de produção (consulta de leitura):

| Tabela em produção | RLS | Policies | Linhas |
|---|---|---|---|
| `copilot_sessions` | ligado | `service_role_sessions`, `vendor_own_sessions` | **212** |
| `copilot_insights` | ligado | `service_role_insights`, `vendor_own_insights` | **1.666** |
| `copilot_retention_aggregates` | ligado | `own_retention`, `service_role_retention` | 0 |

As policies **têm outro nome** do que as migrations da branch criariam
(`copilot_sessions_own`/`copilot_sessions_service`). Foi por isso que a busca por nome não as
achou. Quem as criou na `main`:

- `supabase/migrations/20261030100000_copilot_sessions.sql`
- `supabase/migrations/20261030110000_copilot_insights.sql`

Ou seja: o trabalho de banco do copiloto **entrou**, 14 dias depois, renumerado e com as policies
renomeadas — e está em uso (1.666 insights, 212 sessões). Também existem em produção
`run_copilot_retention`, `enqueue_copilot_tick_on_contact_message`, `commit_copilot_tick` e o
trigger `trg_copilot_tick_on_contact_message`.

Das 6, sobraram dois objetos fora de produção:

- **`copilot_presence`** — já adjudicado e arquivado em `docs/_arquivo/copilot-presence-261108/`
  (PR #3191, mergeada em 16/11): zero consumidor, decisão de não aplicar, SQL preservado byte a
  byte.
- **`copilot_insight_feedback`** — tabela, 3 índices, policies e o guard
  `guard_copilot_insight_feedback_retained_at`. **Não existe em produção e não tem consumidor
  nenhum**: `git grep copilot_insight_feedback` em `src/` e `supabase/functions/` da `main` não
  retorna nada, e nenhuma migration da `main` o cria. Mesma situação do `copilot_presence` →
  **arquivar com o motivo, não aplicar**.

---

## Objetos do bloco A1 que NÃO existem em produção

Medido por catálogo (`pg_proc`, `pg_class`, `pg_policies`, `pg_indexes`, `pg_trigger`). São os
candidatos de banco que seguem na fila, cada um ainda **sem veredito**:

| Objeto | Tipo | Vem de |
|---|---|---|
| `copilot_presence`, `copilot_insight_feedback` | tabela | migrations de copiloto — adjudicados acima |
| `copilot_has_presence`, `upsert_copilot_presence` | função | `copilot_presence` — arquivado na #3191 |
| `guard_copilot_insight_feedback_retained_at` | função | `copilot_insight_feedback` — arquivar |
| `e2e_fixture_message` | função | `20261016250000_e2e_fixture_message_rpc.sql` (versão colidida) |
| `idx_login_attempts_updated_at` | índice | `20261026110300_login_attempts_ttl_lgpd.sql` |
| `idx_job_run_details_jobid_start` | índice | `20261026200300_fix-talkx-cron-startup-timeout.sql` |
| `touch_copilot_sessions_updated_at` + `trg_touch_copilot_sessions` | função e trigger | `copilot_sessions` — a `main` usa outro nome; conferir objeto a objeto |
| `trg_enqueue_copilot_tick` | trigger | a `main` tem `trg_copilot_tick_on_contact_message`; conferir equivalência |

**NÃO VERIFICADO:** se `login_attempts` (que tem 3 índices e 4 policies em produção) já cobre o
TTL de LGPD por outro índice, e se o diagnóstico de cron do Talk X precisa do
`idx_job_run_details_jobid_start`. São os dois próximos itens de banco, e nenhum dos dois foi
aplicado por este trabalho — **nenhuma DDL foi executada**.

---

## Testes com casos a mais: 1 julgado, 10 na fila

| Arquivo | Casos branch / `main` | Branch | Veredito |
|---|---|---|---|
| `src/lib/__tests__/talkxCsv.test.ts` | 15 / 3 | `claude_juca/practical-rubin-8xnw0u` | **obsoleto** (veredito 2) |
| `src/components/talkx/__tests__/TalkXSegments.detailPanel.test.tsx` | 17 / 11 | `claude/fix-talkx-segmentos-regressao-261101-1944` | na fila |
| `src/components/talkx/__tests__/TalkX.test.tsx` | 37 / 33 | `claude/fix-talkx-x006-test-limites-261101-2130` | na fila |
| `e2e/talkx-demo.spec.ts` | 4 / 1 | `claude/feat-talkx-x003-demo-fixtures-261101-2143` | na fila (vem com 17 fixtures) |
| `src/hooks/integrations/__tests__/useTalkXSegments.test.ts` | 35 / 34 | `codex/publish-followup-20261021` | na fila |
| `src/hooks/delivery/__tests__/useUnconfirmedMessages.test.tsx` | 6 / 5 | `claude/fix-pd79-compat-pre-migration-261111` | na fila |
| `src/components/tasks/__tests__/primitivosCompartilhados.test.tsx` | 30 / 29 | `claude/feat-cores-prioridade-d12-261101-1425` | na fila |
| `src/components/tasks/__tests__/movimentoEContraste.test.tsx` | 10 / 9 | `claude/feat-cores-prioridade-d12-261101-1425` | na fila |
| `src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx` | 10 / 9 | `claude/fix-paleta-filtros-celebracoes-261025-2110` | na fila |
| `src/hooks/gamification/__tests__/useAgentCelebrations.test.tsx` | 9 / 8 | `claude/fix-paleta-filtros-celebracoes-261025-2110` | na fila |
| `e2e/auth.spec.ts` | 6 / 5 | `fix/ci-workflows-vermelhos` | na fila |

Esses 10 são cobertura potencialmente perdida e cada um tem nome de caso legível — é por eles que
a próxima rodada começa, porque teste adicional é o item de **menor risco e maior ganho** da fila
inteira: não muda comportamento de produção.

---

## O que este lote NÃO decide

- As **200 versões de código de produção** da fila (tabela de assuntos acima) seguem sem veredito,
  fora os arquivos da `claude_pink/nice-hypatia-iikl82` julgados aqui.
- Nenhuma branch foi fechada nem apagada por este documento.
- Nenhuma DDL foi executada. Toda consulta a produção foi `SELECT` em catálogo.
- Os **1.259 pares** em que a branch encurtou o arquivo ficam provados como "a `main` está à
  frente" **pela direção do tamanho e pela contenção de linha**, não por leitura individual. É uma
  prova forte, não absoluta: um arquivo pode encurtar e ainda trazer uma linha nova. Para esses,
  a linha ausente está registrada em `linhas.tsv` e volta pelo recorte do README de
  `scripts/recuperacao-branches/`.
