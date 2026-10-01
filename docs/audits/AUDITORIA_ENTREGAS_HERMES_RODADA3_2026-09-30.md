# Auditoria das entregas do Hermes — rodada 3 (30/09/2026)

**Escopo:** auditar adversarialmente a entrega do PR #1336 (D1 timeline por dia local · D2 nota do contato no dia escolhido), revalidar as entregas anteriores contra a `main` de agora, e — a pedido do Joaquim — provar que **repositório, banco canônico e produção estão sincronizados**.

**Base:** `main` = `826fa1486a51d8bfdab285abb5a6e76ce7921426` (30/09/2026). Produção (`https://zapp-web-v2.vercel.app`) = deploy desse mesmo commit (registro de deployment Vercel de 21:39:37Z).

**Método:** 5 frentes independentes em paralelo (`deleg_d82c9d8c`, 1909 s, 201 chamadas de API), cada uma numa cópia de trabalho isolada dentro do workspace, **e re-medição de todo achado material pelo coordenador** com as expressões copiadas verbatim do fonte, em dois fusos. Regra desta casa: **auto-relato de subagente não entra em documento como fato** — só o que o coordenador reproduziu.

**Ambiente de teste:** `TZ=America/Sao_Paulo` (onde o defeito existe) e `TZ=UTC` (onde ele é invisível); quando útil, também `America/New_York`, `Europe/Lisbon` e `Europe/Berlin`. DST reais de 2026: EUA 01/11, UE 29/03 e 25/10.

---

## 1. Sanidade: repositório × banco canônico × produção (medido pelo coordenador)

| Verificação | Comando / fonte | Resultado |
| --- | --- | --- |
| Estado dos 7 PRs | `gh pr view N` + `git merge-base --is-ancestor` | **7/7 MERGED e ancestrais da `main`**: `db4516f5` (#1257), `5c96c322` (#1270), `f4c3feb5` (#1280), `c221ba2d` (#1296), `cf15a994` (#1302), `b8975f59` (#1318), `4cc74741` (#1336) |
| Migrations: arquivos na `main` × livro-razão do banco | `ls supabase/migrations` × `supabase_migrations.schema_migrations` | **692 × 692, zero diferença nas duas direções** → nada pendente de aplicar; o drift `20260930110000` da rodada 1 **sumiu** (arquivo commitado depois) |
| RPCs que o front chama × existentes em produção | 46 nomes × `pg_proc` | **46/46 existem** |
| Colunas exigidas pelos módulos auditados × produção | 37 pares (tabela, coluna) × `information_schema` | **37/37 existem** |
| Tipos de data das 6 fontes da timeline | `information_schema.columns` | 22 colunas, **todas `timestamp with time zone`** |
| Produção × `main` | registro de deployment + build local | deploy = `826fa148` = HEAD da `main` (21:39:37Z) |
| Produção × build da `main` (conteúdo) | crawler + comparação por **conjunto de módulos** | **376 módulos servidos; 0 só em produção, 0 faltando** (a diferença são 388 `.map`, que a produção não expõe) |
| Chunk do util novo | `sha256` local × produção | `localDay-VHXrUvJF.js` **byte a byte idêntico** (`82f9f5ec…`, 779 B) |
| Edge Function `send-email` | `get_edge_function` × arquivo do repo | **idêntico byte a byte** (`d5d01911…`, 2553 B); o P1 da rodada 1 (remetente escolhido pelo cliente) está **corrigido no ar**: `from: "ZAPP System <noreply@promobrindes.com.br>"` |

**Conclusão da §1: nada estava faltando; não houve nada a importar nem a atualizar.** Repositório, banco canônico e produção servem a mesma coisa.

### 1.1 Duas armadilhas de método encontradas (e corrigidas) aqui

1. **Marcador de bundle não pode ser tirado do fonte.** Procurei o literal `localDayKey` no chunk publicado e não achei — mas ele **também não existe no build local**: o minificador renomeia os símbolos. Julgar por isso acusaria um problema de produção inexistente. Marcador só se lê do **build real** (no caso, `getUTCHours()!==0||`).
2. **O build do projeto não é determinista.** Reconstruir o mesmo commit gera **nomes de chunk diferentes**, e como o nome dos vizinhos entra no conteúdo de cada chunk, isso cascateia. Portanto **comparar produção com repositório por nome ou hash de chunk é inválido** (minha 1ª medição deu "166 chunks diferentes" e quase virou acusação falsa). A régua válida é **conjunto de módulos** + registro de deployment, que foi o que usei.

---

## 2. Frente 1 — timeline agrupada por dia local (`useConversationHistoryTimeline.ts:226`, PR #1336)

**Sem defeito. Correção comprovada adversarialmente.**

- **Varredura exaustiva:** 5419 instantes cobrindo o ano de 2026 (passo de 97 min) × 4 fusos, com oráculo independente (`Intl.DateTimeFormat`), comparando (a) a chave do mapa `days`, (b) o dia reconstruído pelo cabeçalho: **21.676 casos, 0 divergências** — incluindo as duas viradas de DST (EUA 01/11, com 01:30 repetido; UE 29/03, com 01:00–01:59 inexistente em Lisbon).
- **Fronteiras:** 00:00:00.000 local e 23:59:59.999 local caem no dia local correto.
- **Ordem dos dias:** `days` continua estritamente descendente (mais recente primeiro) em 2 fusos. Sonda extra: ordenação por `localeCompare` quebraria com offsets heterogêneos, mas o Postgres serializa sempre `+00:00` — **não alcançável com dado real** (amostra conferida).
- **Consumidores da chave:** nenhum faz `new Date(day.date)`/`format(new Date(day.date))` (o que reinterpretaria a chave como meia-noite UTC e traria o defeito de volta). `HistoryTab.tsx:68` concatena `'T00:00:00'` (parse local, correto); `LastActivityWidget` nunca lê `.date`.
- **"Hoje":** um evento das 23:59:59.999 locais de hoje diz "Hoje"; um das 00:01 de amanhã não diz — nos 4 fusos.
- **Rajada que atravessa a meia-noite:** as mensagens 23:59/23:59:30/00:05 viram **um** evento `count=3` datado pela última (00:05) e caem sob o cabeçalho do dia seguinte — coerente com a hora exibida e **igual ao comportamento anterior ao PR**. Classificado como **cosmético** (`at: burst[last]` é pré-existente, linha 141).

---

## 3. Frente 2 — data das Notas (`calendarDayKey`, PR #1336)

**Correção correta e o escritor continua intacto (nada de dado gravado mudou).**

Tabela medida dos ramos (`src/lib/localDay.ts`), em `America/Sao_Paulo` e UTC:

| Valor gravado | Esperado | Medido em SP |
| --- | --- | --- |
| `2026-09-30T00:00:00.000Z` (data sem hora) | 30/09/2026 (dia escolhido) | **30/09/2026** |
| `2026-09-30T00:00:00.001Z` | 29/09/2026 (instante = 29/09 21:00 SP) | **29/09/2026** |
| `2026-09-30T12:00:00.000Z` | 30/09/2026 | **30/09/2026** |
| `2026-10-01T02:59:00.000Z` (30/09 23:59 SP) | 30/09/2026 | **30/09/2026** |
| `null` / `""` / `"xxx"` | vazio | **vazio, sem exceção** (o caminho cru `format(new Date(v))` estoura `RangeError` em `""` e `"xxx"`) |

- **DST não desloca nada:** o ramo data-sem-hora é aritmética UTC pura — `2026-11-01T00:00Z`@New_York → 01/11; `2026-03-29T00:00Z`@Lisbon → 29/03.
- **Escritor intacto e invariante de fuso:** capturado o argumento real de `onSave` → `["Enviar proposta","promise","2026-09-30T00:00:00.000Z"]`, idêntico em SP e UTC. Data inválida é sanitizada pelo próprio `input type=date` para `""` → grava `null` (a expressão crua que lançaria `RangeError` **é inalcançável pela UI**).
- **Limitação declarada da regra (1 ms):** um **instante real** exatamente em 00:00:00.000Z é lido como o dia UTC, não o local. Só é alcançável se algum escritor gravar instante nesse campo — **não existe** (ver §6).

---

## 4. Frente 3 — fonte única da regra e refactor sem regressão

**Prova diferencial (a mais importante): comportamento IDÊNTICO.**

- O diff entre a versão anterior do arquivo (`git show 4f066651:…`, sha `4231a252…`) e a atual é **exatamente** `+1 import` e **−18 linhas** da cópia privada; **o corpo de `weekBuckets` não foi tocado**.
- Saídas comparadas com `JSON.stringify`: **6 cenários + varredura de 365 inícios de semana × 4 fusos = 28 comparações, 0 divergências**. DST cruzado de verdade (Lisbon com offset `-60→0` na semana de 25/10/2026; New_York idem).
- **4 mutações do util, todas vermelhas** (restauradas ao sha original): M1 partes UTC em `localDayKey` → **12 failed | 1284 passed**; M2 `parseDayKey` com `new Date(key)` → **4 failed**; M3 `calendarDayKey` sem o ramo data-sem-hora → **2 failed**; M4 `calendarDayKey` tratando tudo como UTC → **2 failed**. Quem pega: o teste do próprio util **e** o consumidor real (`NotesTab.test.tsx`).
- **Regressão:** 88 arquivos / **1288 testes, 0 falhas**, em 3 fusos.
- **Duplicatas da regra:** continua reimplementada em ~20 arquivos. A maioria (`format(…, 'yyyy-MM-dd')` de heatmap/relatório/SLA/CSAT) **concorda** com o util e é apenas duplicação. **Duas divergem de verdade** — e são os achados R3-02 e R3-03 da §5.
- Nenhum consumidor importa o util esperando semântica UTC.

---

## 5. Achados NOVOS (todos re-medidos pelo coordenador)

Saída crua do passo de re-medição, com as expressões **copiadas verbatim** do fonte, em SP e UTC (`.tmp/remedir.mjs`).

| id | Arquivo:linha | Classe | Efeito medido |
| --- | --- | --- | --- |
| **R3-01** | `src/components/inbox/ScheduleMessageDialog.tsx:43` (e preview `:179`) | **ATIVO — grava errado** (pior que o defeito corrigido) | Escolher **03/10 09:00** grava **`2026-10-02T12:00:00.000Z`** (= 02/10 09:00 em SP) — **um dia antes** — e o preview confirma "sexta, 02 de outubro"; escolher **01/10 09:00** ("amanhã") é **recusado como passado**. Em UTC ambos corretos → é fuso. `setHours(new Date('yyyy-MM-dd'), h)` interpreta a data do input como meia-noite UTC. |
| **R3-02** | `src/components/security/AuditLogDashboard.tsx:78` | **ATIVO** | Às 22:00 locais a chave "hoje" vira `2026-10-01`; log real de 30/09 21:30 **não entra** → o contador "hoje" da aba de auditoria **zera toda noite entre 21h e meia-noite**. |
| **R3-03** | `src/hooks/inbox/useInboxFilters.ts:69-70` | **ATIVO (menor)** | Preset "Hoje" (30/09) grava `dateTo=2026-10-01` → filtro **1 dia mais largo** (mostra a mais, nunca esconde). A leste de UTC o `dateFrom` também desloca. |
| **R3-04** | `src/components/inbox/contact-details/Contact360Helpers.tsx:121` e `:179` | **Real, alcance indeterminado** | `format(new Date('1998-03-15'), 'dd/MM/yyyy')` → **14/03/1998** (SP); `'2001-05-04'` → **03/05/2001**. O formulário grava a string **crua** `yyyy-MM-dd`. `data_nascimento`/`data_fundacao` **não existem em nenhuma migration nem na tabela `contacts`** do banco canônico → vêm de base externa, e **não é possível medir quantas linhas existem**. |
| **R3-05** | `NotesTab.tsx:243`, `NotesTab.tsx:172-176`, `workItemAggregates.ts:59-63` | **Latente** | Com valor **date-only** a pendência mostra D-1, `isTaskDueSoon` dá falso positivo de 1 dia (22:00 locais) e `bucketByDue` joga "hoje" em `overdue`. Com o valor que tarefa realmente grava (**23:59 local**) os três estão **corretos** — e o banco confirma: `conversation_tasks` tem **1 linha, 0 com prazo**; não há escritor de date-only nessa tabela. |
| **R3-06** | `src/hooks/chat/useConversationHistoryTimeline.ts:266` | **Cosmético / contrato de rótulo** | A janela é rolante (`Date.now() − period×24h` = 168 h), mas a aba se chama "Últimos 7 dias" — o dia de corte sai parcial. |
| **R3-07** | `src/hooks/analytics/useGoalNotifications.ts:145` | **Latente (só a leste de UTC)** | Chave de conquista por dia UTC: em Berlin fatia 29/09 enquanto o util diz 30/09. |

### 5.1 Ordem de gravidade (recomendada ao Claude para virar plano)

1. **R3-01** — é **escrita**: mensagem sai um dia antes do que o usuário escolheu, e data válida é recusada. Correção mínima: montar a data a partir das partes (`localDay.…`) em vez de `new Date('yyyy-MM-dd')` + `setHours`, nos **dois** pontos (gravação e preview) — e teste que falha antes (03/10 09:00 → 02/10 09:00).
2. **R3-02** — contador de auditoria zera todas as noites; correção de uma linha (`localDayKey(new Date())`).
3. **R3-03** — filtro inclui um dia a mais; mesma família do D5 já registrado.
4. **R3-04** — D-1 em nascimento/fundação; antes de corrigir, precisa **descobrir a origem externa** desses campos.
5. **R3-05/R3-07** — latentes: valem como robustez (usar o util), não como urgência.

---

## 6. Banco de dados (leitura, gateway somente-leitura)

- `contact_notes`: **0 linhas** (0 com prazo, 0 em meia-noite UTC, 0 com hora) → o D2 estava **latente**, sem nenhum valor a reclassificar.
- `conversation_tasks`: **1 linha, 0 com prazo** → R3-05 latente, confirmado no dado.
- `messages`: **50.394 linhas**, das quais **66 entre 21h e meia-noite locais** — o conjunto exato que o D1 reagrupa (antes apareciam sob o cabeçalho do dia seguinte).
- Escritores mapeados: `contact_notes.due_date` tem **um único produtor** (`NotesTab.tsx:32`, `new Date('yyyy-MM-dd').toISOString()` = meia-noite UTC por construção); `conversation_tasks.due_date` vem de `QuickAdd.tsx:38/42/46` e `TasksAgendaMode.tsx:54/135` — **23:59 local**, nunca date-only.
- **Risco de leitura errada pelo critério novo: não encontrado.** O `calendarDayKey` só é aplicado em `contact_notes.due_date`, e nenhum caminho grava instante real nesse campo.
- SQL que lê **por dia**: só `messages`, `conversation_closures` e `conversation_sla`, todos em **fuso nomeado `America/Sao_Paulo`**. Uma exceção em **UTC**: `20260927500000_…:111` (`earned_at::date = CURRENT_DATE`, KPI de gamificação — já corrigido para SP em migrations posteriores). **Nenhum SQL agrega `due_date`/`completed_at` por dia.**
- Risco adjacente (não é do front): `due_date::date` em sessão UTC daria D+1 para o 23:59 local de tarefas — **não existe SQL assim hoje**.

---

## 7. Regressão, CI e higiene

- **Suíte completa 5× no código da `main`:** exit 0 nas 5, idênticas — **348 arquivos, 4637 passed + 38 todo (4675)**. Zero teste vermelho, **zero flaky**.
- **Gates:** `typecheck` 0 · `typecheck-ratchet` 0 · `lint-ratchet` 0 (971→945, novas 0) · `db:guard` 0 (692 migrations, violações novas 0) · `build` 0.
- **CI da `main` (últimos 8 runs):** 4 vermelhos, **nenhum atribuível a estas entregas** — `E2E logado` (`e2e/reactions.spec.ts:84` + 2 flaky; não é check obrigatório), **2× `DB Live Guard`** (`O_TYPES/O_MANIFEST/O_CATALOG/O_TRIPLE_PARITY`), `Deploy Edge Functions (ai-enhance-message)` — causa crua no log: **"Remote inventory did not stabilize after 144 attempts; deployment NOT attested"** (etapa de atestação; vários deploys de funções em paralelo; o log confirma `DEPLOYED_GIT_SHA: 826fa148`).
- **Higiene:** nenhum processo meu solto; nenhum workspace órfão meu; disco 310 GB livres de 1007 GB.

---

## 8. Veredito

1. **As entregas auditadas estão corretas e em produção**, provado de três formas independentes: comportamento (testes em 2–4 fusos, mutações), conteúdo (chunks byte a byte) e infraestrutura (deploy = HEAD da `main`, 7/7 PRs ancestrais).
2. **Nenhuma regressão** foi introduzida — incluindo o refactor do util, que tem prova diferencial de comportamento idêntico.
3. **O PR #1336 corrigiu um defeito de leitura; existe um defeito de escrita da mesma família ainda no ar** (R3-01), além de R3-02/R3-03 ativos e R3-04 de alcance indeterminado.
4. **Repositório, banco canônico e produção estão sincronizados** — nada a importar, nada a aplicar, nada a republicar.
5. **Dois métodos de verificação usados antes estavam errados** (§1.1) e foram substituídos; nenhum resultado desta auditoria depende deles.

---

## 9. Verificação de produção do bundle servido (01/10/2026, somente leitura)

Escopo pedido: provar que **R3-01 (#1380), R3-02 (#1392), R3-03 (#1397) e R3-06 (#1401)** estão **no ar** — mergeados não é o mesmo que servidos. Nada foi alterado: só `GET` no site e leitura do repositório.

**Deploy medido.** `https://zapp-web-v2.vercel.app`, deploy de produção `b22b91f8` (2026-10-01T16:06:29Z) — **posterior** aos quatro merges. Ancestralidade conferida pela API (`compare main...<sha>` = `behind frente=0` para `927a5ff9d0`, `c7f870144d`, `824ea0c957` e `409e8fa5fb`): os quatro commits estão contidos na `main` **do commit que foi para produção**.

**Bundle servido.** 385 chunks / 8,4 MB; `index.html` 6.196 B, sha256 `dfd68687ae3b144622720e60eb738ba1e793c1b4611b3cb14417abf03a6d6351`. Grafo fechado a partir do manifesto `m.f=[…]` do entry (build **rolldown**, runtime próprio) e das referências internas de cada chunk.

**O util de data está no ar.** Chunk próprio **`localDay-Dr9m4ORa.js`**, 973 B, sha256 `e7f614bf46ef8b7ac4ad87f938ada4c259c76d704a4b71e669030fdb3b442ec0`, com **4 símbolos exportados** — o quarto (`localInstantFromDayAndTime`) é o que o R3-01 introduziu.

**Consumidores do util — lista fechada, 6 chunks** (todos com `import … from "./localDay-Dr9m4ORa.js"`):

| chunk servido | item | import observado |
| --- | --- | --- |
| `ScheduleMessageDialog-ksul1pLU.js` (4.488 B) | **R3-01** | `import{r as x}` — símbolo **diferente** dos de chave-de-dia |
| `AuditLogDashboard-CWqKoAYw.js` (6.419 B) | **R3-02** | `import{n as O}` |
| `RealtimeInboxView-DRKkSx0h.js` (131.587 B) | **R3-03** | `import{n as Lt}` |
| `useConversationHistoryTimeline-qQoFsadf.js` (5.042 B) | **R3-06** | `import{n as i}` |
| `NotesTab-CmsR55Ri.js` (11.478 B) | #1336 (D2) | `import{n as …}` |
| `useMyWorkItems-DV_K5AMk.js` (13.505 B) | #1336 (D1) | `import{n as …}` |

**R3-06, verbatim no servido.** `queryFn:async()=>{let e=i,c=a>0?n(r(new Date,a-1)).toISOString():null,…` — ou seja `startOfDay(subDays(new Date(), period - 1))`, aplicado como `gte('created_at', c)` nas **cinco** fontes (mensagens, eventos, notas, tarefas, negócios). A janela móvil antiga **não está** nesse chunk.

**Ausência dos padrões antigos, no bundle inteiro (385 chunks):**

- `setHours(new Date(` → **0 chunks** (a construção do R3-01 desapareceu do ar);
- janela móvel `Date.now() - X*864e5` → **1 chunk**: `TalkXView-Cpv1Kz5O.js` (ver achado abaixo);
- `.toISOString().split("T")` → **1 chunk**: `Index-…`, no `p=`${e.id}-${s}-${u.toISOString().split("T")[0]}`` — **dedupe de alerta por dia UTC**, que é o **R3-07 já registrado como latente** (`useGoalNotifications`), não um dos quatro itens.

**Achado novo, mesma família, fora dos quatro — NÃO corrigido.** `src/hooks/integrations/useTalkXSegments.ts:101-108`: os operadores de segmento `in_last_days` / `not_in_last_days`, com rótulos **"nos últimos (dias)"** / **"há mais de (dias)"**, montam o filtro com `Date.now() - d * 86_400_000` — **horas corridas para um rótulo em dias**, exatamente o desencontro do R3-06, agora em **filtro de audiência** (pode incluir/excluir contato um dia fora). Varredura na fonte achou outras janelas móveis que **precisam de triagem** e não foram julgadas aqui: `SupervisorCopilot.tsx:41` e `useDiagnosticsData.ts:71` (24 h), `useAIStats.ts:118` (24 h), `ConversationHeatmap.tsx:62` (30 d), `AdminTelemetriaPage.tsx:66` (7 d), `usePerformanceSnapshots.ts:80` (7 d) — rótulo em **horas** está correto como está; rótulo em **dias** é o mesmo defeito.

**Veredito da verificação.** As quatro correções estão **no ar**, cada uma no chunk da sua tela, consumindo o util compartilhado, e **nenhuma delas carrega o padrão antigo**. Fica aberto como candidato: o `in_last_days` do TalkX (filtro de audiência).

