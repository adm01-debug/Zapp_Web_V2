# Auditoria das entregas do Hermes — rodada 2

**Data:** 30/09/2026 · **Base auditada:** `origin/main` do `adm01-debug/Zapp_Web_V2` (workspace `auditoria-rodada2-entregas-26093015102caf`, criado 15:11 -03:00)
**Método:** 5 frentes independentes em paralelo (fuso/Agenda, pinagem de testes, Lista Concluídas, banco/formatos de data, regressão/CI/higiene), **todo achado re-medido pelo coordenador** antes de entrar aqui. Mutação como prova; nada de "provavelmente".
**Regra de leitura:** cada achado diz **quem mediu** e **quando**. Em repo multi-chat o estado envelhece em horas — o que não foi re-medido no fecho está marcado.

| Frente | Tema | Foco |
| --- | --- | --- |
| F1 | Fuso/dia local (#1296) | 4 fusos, DST, escritores de data, decisores de dia fora do módulo |
| F2 | Testes (#1302) | 25 mutações; contratos visíveis ainda não pinados |
| F3 | Lista × Quadro (#1280) | mesmos dados nas duas visões; limiares; contador |
| F4 | Banco/formatos | SQL que decide dia, RPCs do módulo, formatos de escrita, tipos |
| F5 | Regressão/CI/higiene | suíte 5×, gates, PRs no GitHub, CI da main, sobras |

---

## 0. Veredito em uma tela

| Entrega | O que é | Veredito | Prova |
| --- | --- | --- | --- |
| **#1296** | Agenda agrupa pelo **dia local** (`workItemAggregates.ts`) | **CORRETO** e sem sobre-correção | 4 fusos (SP/UTC/NY/Lisbon), DST de 01/11 (EUA) e 29/03 (UE): **14/14 dias certos**; 9 casos adversariais verdes; 39 testes do arquivo verdes nas 4 TZs |
| **#1302** | Teste que pina a ordem das colunas do Quadro | **CORRETO**, com dentes em 8 de 12 mutações | M1–M7 e M9b vermelhos; 4 mutações **passam verdes** (lacunas de pinagem abaixo) |
| **#1280** | Lista mostra "Concluídas" com só antigas | **CORRETO** e mínimo (3 linhas: 49, 81, 148) | Contador não mente nos 5 estados; limiares Lista = Quadro; Atrasadas/Hoje/Amanhã/Próximas/Sem prazo **byte-a-byte iguais** ao fonte anterior |
| **#1270** | Documento da auditoria rodada 1 | OK | merge `5c96c322` ancestral da `main`; só `docs/audits/...md` no merge |
| **#1257** | Ordem das abas do chat | OK | merge `db4516f5` ancestral da `main`; só `ConversationTabs.tsx` + teste |

Nenhuma das cinco entregas introduziu defeito, regressão ou arquivo inesperado. **Os defeitos reais abaixo são todos pré-existentes e fora do escopo dessas entregas** — ficam registrados porque foram encontrados no caminho, não porque as entregas os criaram.

---

## 1. Defeitos REAIS encontrados (pré-existentes, medidos)

### D1 — A linha do tempo do Histórico agrupa por dia **UTC** (P1)
- **Onde:** `src/hooks/chat/useConversationHistoryTimeline.ts:226` → `const day = event.at.slice(0, 10);`
- **Medido pelo coordenador** (30/09 15:5x, `TZ=America/Sao_Paulo`):

```text
evento local = 01/10/2026, 23:50:00 | chave UTC da timeline = 2026-10-02 | dia local = 2026-10-01 | discordam = true
```

- **Impacto:** todo evento das 21:00–23:59 locais (UTC-3) aparece sob o **cabeçalho do dia seguinte** na timeline do Histórico. É o mesmo defeito que o #1296 corrigiu na Agenda — e é o quebra-cabeça que sobra no mesmo produto, com o módulo de chat.
- **Ação sugerida:** aplicar a mesma chave de dia local (hoje `localDayKey` é privada de `workItemAggregates.ts`; promover para um util compartilhado e usar aqui).

### D2 — Notas do contato exibem a data com **um dia a menos** (P1)
- **Onde:** `src/components/inbox/tabs/NotesTab.tsx:31` (`new Date(dueDate).toISOString()`) alimentado por `<input type="date">` (`:51`) e exibido em `:148` (`format(new Date(note.due_date), 'dd/MM/yyyy')`); coluna `contact_notes.due_date` = `timestamptz` (`supabase/migrations/20260907230000_contact_notes_category_done_due.sql:6`).
- **Medido pelo coordenador** (30/09 15:5x):

```text
date-only 2026-09-30 -> toISOString: 2026-09-30T00:00:00.000Z | exibido em SP: 29/09/2026
```

- **Impacto:** quem marca "30/09" no campo de data do contato lê "29/09". Este é o **único date-only real do front** — a coluna aceita `timestamptz` e o escritor grava meia-noite UTC.
- **Ação sugerida:** gravar fim-do-dia local (`setHours(23,59)`) como o QuickAdd já faz, ou tratar data-only como data (sem fuso) na leitura/escrita.

### D3 — Quadro diz "Coluna vazia" com itens escondidos atrás do rodapé (P2)
- **Onde:** `src/components/tasks/board/BoardColumn.tsx:90` (`visibleItems.length === 0` → `<TasksEmptyState variant="column">` = "Coluna vazia / Feito. Fica 7 dias a vista.") **enquanto** `:108` renderiza o rodapé `doneSplit.older.length > 0` → "Ver mais antigas (30 dias)".
- **Medido:** F3 em teste de render (30/09 15:2x): com 0 recentes + 2 concluídas de 8–30 dias, a coluna Concluído mostra o texto de coluna vazia **e** o rodapé que revela 2 itens. Coordenador confirmou as duas condições no fonte (15:5x).
- **Impacto:** texto falso ("Coluna vazia" com 2 itens), estado alcançável hoje. Não foi tocado pelo #1280 (que é a Lista).
- **Ação sugerida:** o estado vazio da coluna deve considerar `items.length`, não `visibleItems.length` (a Lista já faz isso depois do #1280 — as duas visões divergem aqui).

### D4 — Tarefa `done` sem `completed_at` **some da Lista** (P2)
- **Onde:** `src/hooks/tasks/workItemAggregates.ts:36` (nada com `completed_at` nulo entra em recent/older) vs `:283-287` (Lista mostra o estado vazio quando `done7d` está vazio e o total é 0 para fins de status).
- **Medido:** F3 (30/09 15:2x): 1 item `done` sem carimbo → Lista: `Nada por aqui`, sem card; Quadro: badge `1` e card presente. No banco (medido por F3 via gateway RO, 15:4x): **0** linhas nesse estado hoje (1 tarefa no total, `todo`).
- **Impacto:** perda de visibilidade de uma tarefa concluída; alcançável por código (insert sem `completed_at`; o trigger só cobre UPDATE; não há `CHECK`).
- **Ação sugerida:** decidir o contrato (`completed_at` obrigatório para `done` → `CHECK`/trigger em INSERT) ou a Lista cair para o `status` quando o carimbo faltar.

### D5 — Filtro de data da Inbox usa o dia **UTC** da borda (P2)
- **Onde:** `src/hooks/inbox/useInboxFilters.ts:69-70` → `dateRange.from?.toISOString().split('T')[0]`.
- **Medido:** F1 (15:1x) + coordenador confirmou a expressão (15:5x).
- **Impacto:** em UTC-3 a borda final (23:59 local = 02:59Z do dia seguinte) vira o dia seguinte → o intervalo **ganha** um dia; em fusos positivos **perde**. Não é o mesmo defeito do #1296 (aquele era agrupamento), mas é a mesma família de erro.
- **Ação sugerida:** derivar as bordas com a chave de dia local, não com o ISO UTC.

### D6 — Resíduo UTC em RPC de dashboard (P2)
- **Onde:** `supabase/migrations/20260916180000_*.sql:87` → `date_trunc('day', sent_at)` em `talkx_overview_stats`.
- **Medido:** F4 (15:1x); trecho conferido pelo coordenador (15:5x).
- **Impacto:** o resto do dashboard usa `America/Sao_Paulo` **nomeado** (`dashboard_kpi`, `dashboard_hourly_volume`, `dashboard_leaderboard`…); esta RPC segue em UTC → série diária deslocada 3 h. Não afeta tarefas.
- **Ação sugerida:** alinhar com as demais (`AT TIME ZONE 'America/Sao_Paulo'`).

---

## 2. Lacunas de pinagem (testes) — o que hoje muda em silêncio

| # | Contrato visível | Onde | Mutação que passou verde |
| --- | --- | --- | --- |
| T1 | Ordem **visual** das colunas via CSS (`style`/`order`) | `TasksBoardMode.tsx:65` | M8a/M8b |
| T2 | Ordem das seções da Lista (Atrasadas/Hoje/Próximas/Concluídas) | `TasksListMode.tsx:155-161` | C1a/C1b |
| T3 | Ordem das abas Lista/Quadro/Agenda | `ModeSwitcher.tsx:7-9,21` | C2a/C2b |
| T4 | Destinos do menu "Mover para" | `WorkItemCard.tsx:88-95` | C4b/C4c |
| T5 | `shortLabel` das colunas | `workItem.types.ts:55-56` | M4b |
| T6 | Wrapper acima da linha mantendo `.flex.gap-3` | `TasksBoardMode.tsx:65-80` | M9a |

Medido por F2 (15:1x–15:3x) com 25 mutações, cada uma com backup + `sha256` de ida e volta. Baseline do módulo de tarefas: **124 testes, exit 0**.

---

## 3. Divergências cosméticas (mesma ação, duas visões)

- **Badge do Quadro vs Lista:** com 0 recentes, o Quadro **omite** o contador e a Lista mostra `0` (`BoardColumn.tsx:44-46` vs `TasksListMode.tsx`).
- **Rótulo do rodapé:** Lista `ver mais (30 dias)` / Quadro `Ver mais antigas (30 dias)` (`TasksListMode.tsx:127` vs `BoardColumn.tsx:114`).
- **Grupo "Sem hora"** nunca é populado: todo prazo criado pelo app nasce `setHours(23,59,0,0)` (`QuickAdd.tsx:27,31,35`; `TasksAgendaMode.tsx:52`) → `temHora()` sempre verdadeiro; ramo morto, não esconde item.
- **Janela de "7 dias" é 168 h rolantes**, não 7 dias de calendário (`useMyWorkItems.ts:27-28`): conclusão nas primeiras horas do 7º dia cai em "Ver mais antigas (30 dias)" e o KPI 7d subconta. **Reproduz igual em UTC** (não é fuso), pré-existente.

---

## 4. Banco e formatos de data (o que o back decide)

- **Nenhum SQL decide um dia a partir de `conversation_tasks`.** A tabela aparece com predicado temporal em só dois lugares — `notify_due_tasks()` (`remind_at <= now()`, cron 1/min) e `get_conversation_tab_counts()` (contagem por aba) — nenhum faz bucket de dia (F4, 15:1x).
- **O módulo de tarefas não usa RPC nenhuma:** `useMyWorkItems.ts:183` lê `conversation_tasks` direto.
- **Tipos conferidos na fonte versionada pelo coordenador** (15:5x): `due_date TIMESTAMP WITH TIME ZONE` e `completed_at TIMESTAMP WITH TIME ZONE` (`supabase/migrations/20260409014536_*.sql:49,52`), `started_at TIMESTAMPTZ`, `remind_at` em `20260928140000_tasks_unify_reminders_kanban.sql`, `contact_notes.due_date timestamptz` (`20260907230000:6`).
- **Escritores do front gravam ISO-Z completo** (`QuickAdd.tsx:28/32/36`, `TasksAgendaMode.tsx:133`) → o cenário "data sem hora" que quebraria a correção do #1296 em UTC-3 **é inalcançável** hoje (F1, 15:1x).
- **Risco remanescente (pós-#1296):** prazo gravado como 23:59 local vira `…T02:59:00.000Z` do dia UTC seguinte. O front agora acerta; **qualquer SQL futuro que faça `due_date::date` daria D+1** — o cast de `timestamptz` usa o fuso da sessão. Vale um comentário/regra para quem escrever relatório de tarefas.
- **Estado do banco no momento da medição** (F3, via gateway RO às ~15:4x, **antes** de o gateway ficar inalcançável): `conversation_tasks` com **1 linha** (status `todo`), **0** `done` sem `completed_at`.

⚠️ **O gateway RO (`zapp-v2-db-ro`) ficou inalcançável às 15:5x** (6 falhas consecutivas; auto-retry recusado). O coordenador **não** mexeu nele (decisão do Joaquim). As leituras de banco desta rodada são as do início (semeadas por F3) e o resto do contrato foi conferido nas migrations.

---

## 5. Regressão, CI e higiene

- **Suíte completa 5×** (coordenador F5, 15:2x–15:4x): 3 rodadas `345 files / 4533 passed | 40 todo` exit 0; **1 rodada com 1 falha flaky** (`TasksModule.test.tsx > B13 > mantem 1 request ao alternar Lista->Quadro->Agenda` — `waitFor` de 1 s estourando sob carga; passa 8/8 isolado); **1 rodada com `exit 1` e 0 testes vermelhos** (7 unhandled errors: `useTheme.ts:167` `document is not defined` ×5, `useSendProduct.ts:57` `window is not defined` ×2). Nenhum desses arquivos está no diff de qualquer PR auditado.
- **Gates:** `typecheck`, `typecheck-ratchet`, `lint-ratchet`, `build`, `db:guard` → **exit 0** nos cinco (`db:guard` sem `DESTINO_URL` valida só estrutura local).
- **GitHub:** #1296 (`c221ba2d`), #1302 (`cf15a994`), #1280 (`f4c3feb5`), #1270 (`5c96c322`), #1257 (`db4516f5`) — todos **MERGED** e **ancestrais de `origin/main`**; arquivos de cada merge conferidos, **nenhum inesperado** (`.tmp`, `dist`, `.env`, log: zero).
- **CI da `main`:** os 8 runs mais recentes são de `160f3405` (merge de outro chat, #1314); os failures são `DB Live Guard` (drift de manifesto/paridade de migrations) e `E2E logado` (`reactions.spec.ts:51/84`) — **não atribuíveis** aos PRs auditados.
- **Higiene:** `~/projetos/Zapp_Web_V2` limpo; **5 workspaces órfãos** >24 h de outras sessões (`audit-a1-db`, `audit-a2-mutacao`, `audit-a4-consumidores`, `audit-a5-ci`, `mapa-f3-estados`); 2 `playwright test-server` antigos (1 d 20 h em `~/projetos/Zapp_Web_V2:38455`; 4 d 8 h em `Promo_Brindes_V1:41803`). Energia/CPU/porta.

---

## 6. Limites e erros desta rodada (contra o coordenador)

1. **Minha receita de cópia quebrou o ambiente.** O comando de trabalho que passei às frentes (`rsync` com destino **dentro** da origem e sem `--exclude .tmp`) recursou: 4 `rsync` girando, ~13 GB de cópia aninhada e o SSH caindo. F5 matou os processos e refez a cópia com `--exclude .tmp`; eu removi as cópias no fecho (**651 GB livres** agora). Regra que fica: destino de cópia **fora** da origem e `--exclude .tmp,.git,node_modules`.
2. **Dois caminhos citados por frentes estavam errados** e foram corrigidos por mim: `AuditLogDashboard.tsx` é `src/components/security/AuditLogDashboard.tsx`; "Coluna vazia" **não** está no `BoardColumn.tsx` (vem de `TasksEmptyState`).
3. **Autorelato não virou fato:** os achados D1, D2, D3 e os tipos das colunas foram re-medidos pelo coordenador; e um achado de F1 ("data sem hora") foi **rebaixado** para latente depois de conferir que nenhum escritor produz esse formato.
4. **Banco parcial:** o gateway RO caiu antes do fecho; a leitura de `conversation_tasks` é do início da rodada. Nada de escrita foi feito no banco.

---

## 7. Ações propostas

**P1**
1. **D1** — chave de dia local compartilhada e aplicada na timeline do Histórico (`useConversationHistoryTimeline.ts:226`).
2. **D2** — corrigir o off-by-one de `NotesTab` (data-only não é instante UTC).

**P2**
3. **D3** — estado vazio da coluna do Quadro por `items.length`, não `visibleItems.length`.
4. **D4** — contrato de `completed_at` para `done` (trigger/CHECK) ou fallback da Lista para `status`.
5. **D5** — bordas do filtro de data da Inbox em dia local.
6. **D6** — `talkx_overview_stats` em `America/Sao_Paulo`.
7. **T1–T6** — pinar os contratos visíveis não cobertos (um PR de teste por módulo, não um mutirão).
8. **Flaky** — `useSendProduct`/`useTheme` (timers vazando após o teste) e o `waitFor` de 1 s do `TasksModule B13`.

**Fora do escopo, sem ação aqui:** janela de 7 dias em 168 h (§3) — é desenho de produto, precisa decisão do Joaquim.
