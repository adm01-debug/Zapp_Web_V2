# Auditoria exaustiva das entregas do Hermes no Zapp Web V2 — 30/09/2026

**Data:** 30/09/2026
**Snapshot auditado:** `main` = `a27f4a8e` (repo `adm01-debug/Zapp_Web_V2`)
**Estado da `main` ao fechar esta auditoria:** `9f817ac2` (avançou 4 merges durante a auditoria)
**Escopo:** todos os PRs mergeados por branches `hermes/*` — 24 em 30/09/2026 (UTC) e 14 no lote
noturno de 29/09/2026 (20:40–22:02), 38 no total.

**Natureza:** auditoria somente-leitura. Nenhum arquivo de produção, banco canônico ou workflow foi
alterado. Este documento **não autoriza** executar correção alguma: cada achado vira tarefa própria,
planejada antes de ser aplicada.

## 0. Placar

| Dimensão | Resultado |
| --- | --- |
| Migrations do dia aplicadas e idempotentes | **6/6** (a 7ª foi aposentada sem aplicar) |
| Consumidor quebrado por mudança de ACL | **nenhum encontrado** (hipótese adversa testada e refutada) |
| Testes novos provam comportamento (mutação) | **15 de 17 mutações mortas (94%)** — 2 sobreviventes |
| Produção = `main` | **sim** para os 24 merges (24/24 deploy `success`); bundle avançou 4× durante a auditoria |
| Gates do repositório | **verdes**, exceto a instabilidade intermitente da suíte unitária (C-06) |
| CI da `main` depois dos merges | **3 workflows vermelhos** (DB Live Guard, types-sync, E2E logado) + fila de Edge quebrada; a colisão de versão que derrubava o `Contrato DB offline` foi resolvida durante a auditoria (§4/F2) |
| Segredos / escopo / lockfile nos 24 diffs | **limpo** (0 segredo, 0 lockfile, 0 arquivo 100755) |
| Paridade ledger ↔ repositório | **1 divergência real** (DDL fora do Git, C-01) |

## 1. Método

Cinco frentes independentes, cada uma com um método distinto, mais a checagem do coordenador. Nenhum
agente fez commit, push ou escrita no banco de produção.

| Frente | Método | Alvo |
| --- | --- | --- |
| F1 | SQL cru no canônico + PG descartável + hipótese adversa | Estado vivo das 7 migrations de segurança e de seus consumidores |
| F2 | Harness de Postgres descartável do próprio repo | Aplicabilidade, idempotência, ledger, drift e fiação no CI |
| F3 | Vitest + 18 mutações | Testes novos de Tarefas/Alertas/Contatos/Mapa provam comportamento? |
| F4 | Playwright headless em produção + crawl de 376 chunks | O que está no ar corresponde à `main` e funciona? |
| F5 | Gates locais + API do GitHub + SonarCloud + download de Edge | Integridade do repositório, CI e segurança |
| C | Coordenador | Ledger ↔ repo, integridade git, CI, e **re-medição dos 3 achados mais graves** |

## 2. Achados do coordenador (frente C)

### C-01 — DDL aplicado em produção sem arquivo no repositório (drift real)

A versão **`20260930110000` `ai_block03_analysis_persistence`** existe no ledger
`supabase_migrations.schema_migrations` (14 statements) e **não tem arquivo em nenhum branch**
(verificado em todos os `refs/remotes/origin/*`). Conteúdo aplicado no banco, reconstruído do ledger:
colunas novas em `conversation_analyses` (`agent_performance`, `churn_risk`, `sales_opportunity`,
`analysis_version`, `period_days`, `coverage`, `model`, `analyzed_at`), colunas em `contacts`
(`ai_projection_updated_at`, `ai_projection_analysis_id` — FK), índice único
`ai_conversation_tags_contact_tag_uidx` e 5 funções (`persist_conversation_analysis`,
`replace_ai_conversation_tags`, `ai_is_canonical_sentiment`, `ai_is_canonical_priority`,
`ai_text_array`).

**Prova — paridade:** 668 versões do ledger contra 680 versões de arquivo em `origin/main`
(incluindo `_superseded/` e `_foreign/`): esta é a **única** linha sem arquivo (comando:
`python3 /tmp/drift-check.py`). **Reproduzido pelo guard do próprio repo**, no modo com ledger real:
`check-migration-drift.mjs` → **exit 1**, `Registro no banco sem arquivo no repo (DDL fora do Git):
version=20260930110000 ledger_name="ai_block03_analysis_persistence"`.

**Prova — estado vivo:** os objetos existem no banco; não é só a linha do ledger.

```sql
-- 10/10 colunas
select count(*) from (select 1 from information_schema.columns
  where table_schema='public' and table_name='conversation_analyses'
    and column_name in ('agent_performance','churn_risk','sales_opportunity','analysis_version',
                        'period_days','coverage','model','analyzed_at')
  union all select 1 from information_schema.columns
  where table_schema='public' and table_name='contacts'
    and column_name in ('ai_projection_updated_at','ai_projection_analysis_id')) t;
-- 5/5 funções
select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('ai_is_canonical_sentiment','ai_is_canonical_priority',
   'ai_text_array','persist_conversation_analysis','replace_ai_conversation_tags');
-- índice
select indexname from pg_indexes
 where schemaname='public' and indexname='ai_conversation_tags_contact_tag_uidx';
```

**Consequência no CI da `main`** (`DB Live Guard`, run `36713452435` em `a27f4a8e`):
`O_MIGRATIONS`, `O_CATALOG`, `O_MANIFEST`, `O_TYPES` e `O_TRIPLE_PARITY` = **failure**; enquanto
`O_ACL_MCP_EXEC`, `O_ACL_WEBHOOK`, `O_ACL_TALKX_METRICS`, `O_CONTRACT_TALKX_TRANSITION` e
`O_RUNTIME_CONFIG` = success. O `types-sync` (run `36713452483`) morre no próprio gate
(`A sincronizacao foi bloqueada por um ou mais gates`): o mecanismo que regeneraria `types.ts`,
catálogo e manifesto está travado, então o vermelho se sustenta sozinho.

**Impacto:** banco reconstruído a partir de `supabase/migrations/` não reproduz produção (falta todo o
contrato de persistência de IA); artefatos derivados defasados; `DB Live Guard` vermelho mascara
drift novo. `bun run db:guard` **não pega** — em modo offline pula a comparação com o ledger; quem
pega é o `DB Live Guard`, que **não é check obrigatório** e **não roda em PR**.

### C-02 — Três branches `hermes/*` no remoto sem PR nenhum

| Branch | Conteúdo | Situação |
| --- | --- | --- |
| `hermes/telefonia-contrato-dados-26092615475e51` | 6 commits, 4.688 linhas, `src/lib/calls/*` + `20260926190000_calls_telefonia_v2.sql` | **já na `main`** (idênticos: `callStatus.ts` 238/238, `session.ts` 380/380, `events.ts` 145/145, `duration.ts` 105/105; `phone.ts` evoluiu 94 → 141; a migration entrou como `20260926800000`) |
| `hermes/contatos-debitos-pos-1187-26092913299032` | 4 commits, `20260929810000_contacts_can_edit_contact_hoisted_params.sql` (+194) | **já na `main`** |
| `hermes/contatos-f1-banco-26092909260320` | 1 commit em `20260929370000_contacts_soft_delete_and_search_filters.sql` | **já na `main`** |

**Não há trabalho perdido** — é resíduo de branch, e nenhum pode ser reaproveitado (`--adotar`) sem
risco de reintroduzir código velho.

### C-03 — Branches de PRs mergeados que não foram apagados

`hermes/acl-default-privileges-revoke-anon-2609300840a808` (PR #1255) e
`hermes/tarefas-b4-concluidas-7d-26093006501293` (PR #1235) seguem no remoto com o PR `MERGED`.
Higiene.

### C-04 — `20260930120000` nunca foi aplicada (confirmado por reprodução)

O PR #1255 introduziu a migration; o #1260 a moveu para `_superseded/` chamando-a de "quebrada e
redundante". Medido: **não há linha no ledger**. Em PG17 descartável ela falha exatamente como o PR
registrou — como usuário não-superusuário e não-membro de `supabase_admin`,
`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ...` devolve
`permission denied to change default privileges` (42501), e como o aplicador usa **uma transação por
arquivo**, nem os statements anteriores nem os 6 `REVOKE` finais foram registrados. Mecanismo no vivo:
`postgres.rolsuper=false` e `postgres` não é membro de `supabase_admin`. Nesta direção **não há drift
silencioso** (`_superseded/` fica fora do glob por design; e se o DDL tivesse sido registrado, o
checker acusaria explicitamente). **A justificativa de redundância, porém, é parcialmente falsa** —
ver A-01.

### C-05 — Fila de deploy de Edge Functions quebrada (e o comentário do workflow está errado)

`deploy-functions.yml`: **11 runs `cancelled`** e 4 `failure` em 16 execuções hoje, incluindo 4
cancelamentos em 6 segundos (`11:58:46`–`11:58:52`). Causa:
`concurrency: group deploy-edge-functions, cancel-in-progress: false` faz o GitHub **cancelar o
pendente anterior** a cada novo dispatch — o oposto do que o comentário E09 do próprio workflow
(linhas 60–77) afirma. Mesmo erro conceitual em `e2e-logado.yml:28-35` ("enfileira ao invés de
matar"), que explica **10 runs de E2E logado e 9 de CI/CD cancelados** hoje.

**Consequência medida (verificada pelo coordenador com download real):** das 5 funções dos PRs #1240 e
#1252, **3 seguem publicadas com o código antigo**:

| Função | Publicado hoje | Repo (`main`) | Veredito |
| --- | --- | --- | --- |
| `send-email` | `from: body.from \|\| "ZAPP System <noreply@zapp.com>"` | `from: "ZAPP System <noreply@promobrindes.com.br>"` | **DIVERGENTE** — o `from` arbitrário do `body` continua aceito; a correção de segurança **não está viva** |
| `detect-new-device` | `"Segurança <security@resend.dev>"` | `"ZAPP Segurança <seguranca@promobrindes.com.br>"` | **DIVERGENTE** |
| `send-scheduled-report` | `"reports@noreply.lovable.app"` | `"ZAPP Relatórios <relatorios@promobrindes.com.br>"` | **DIVERGENTE** |
| `sentiment-alert` | `"ZAPP Alertas <alertas@promobrindes.com.br>"` | igual | publicado ✔ |
| `voice-copilot-action` | contém `REASSIGN_DENIED_MESSAGE` + `decideReassignConversation` | igual | publicado ✔ |

Método: `supabase functions download <fn> --project-ref tnnnlkbymytvtqngbbqh` fora do workspace,
comparação por marcadores semânticos. Drift adicional: funções em produção **sem fonte no repo**
(`check-account-lock`, `record-failed-login`, `sicoob-bridge`, `sicoob-bridge-reply`) e 4 funções com
`entrypoint_path` apontando para `/home/joaquim_ataides/hermes-workspaces/...` (publicadas por CLI
local, fora do CI).

### C-06 — Suíte unitária da `main` pode sair com código 1 sem nenhum teste falhando (falha latente)

`src/components/catalog/useSendProduct.ts:54-60` agenda `setTimeout(tryDispatch, 150)` e se reagenda
até 15× (~3 s) **sem guardar nem cancelar o id do timer**. Com o ambiente de teste desmontado, o tick
pendente estoura `ReferenceError: window is not defined` → `Errors 1 error` → `exit 1`.

| Rodada (mesma `main`) | Resultado |
| --- | --- |
| `bun run test` | 4342 testes passando + `Errors 1 error` → **exit 1** |
| `vitest run .../useSendProduct.test.tsx` (isolado) | 9/9 → **exit 0** |
| `CI=true bun run test` | 4342 passando, sem erro → **exit 0** |

Não é determinístico — falha latente e intermitente. **Origem:** branch
`hermes/catalogo-ct-bloco-b-2609291308a7d0` (PR #1192, 29/09 16:57Z). **Impacto:** o check obrigatório
`🧪 Unit Tests` pode ficar vermelho em qualquer PR, e o vermelho some no rerun — o que ensina o
reflexo errado de "re-rodar até passar". Conserto: guardar o id do `setTimeout` e cancelá-lo na
limpeza, e/ou sair cedo quando `typeof window === 'undefined'`.

## 3. Integridade dos merges

- **Ancestralidade:** os 24 merges de 30/09 são todos ancestrais de `origin/main` — nada se perdeu.
- **CI dos merges:** os 24 PRs entraram com os **6 checks obrigatórios verdes** no
  `statusCheckRollup`. Onde o SHA do merge aparece com 3–4 checks, é artefato de o check ter rodado
  no merge-ref — não é bypass.
- **Ledger:** 668 linhas, **nenhuma versão duplicada**, suíte estritamente crescente.
- **Arquivos sem linha no ledger (13):** 12 em `_superseded/`/`_foreign/` (fora do glob por design) e
  o 13º é o `20260930120000` do C-04.

## 4. Resultados das cinco frentes

### F1 — Banco/ACL (estado vivo)

- **6/6 migrations presentes na `main` estão APLICADAS**; ledger bate **verbatim** com o repo
  (0 divergência de SQL, 0 versão duplicada/fora de ordem). Estado vivo medido por
  `pg_proc.proacl`, `has_function_privilege`, `pg_policies`, `pg_default_acl`, `pg_class.relacl`.
- **Nenhum consumidor quebrado.** A hipótese adversa principal foi testada e refutada por medição: o
  fixture E2E que usa `set_conversation_status` sobrevive por 2 caminhos (`e2e.zapp@…` é supervisor
  em `profiles` **e** em `user_roles`, e o contato do fixture tem `assigned_to` = o próprio profile);
  o webhook de etiquetas usa `service_role`; a UI de encerramento usa `close_conversation_atomic`.
- **4 harnesses dos PRs: exit 0** (com bloco vermelho-verde). **Dobra de aplicação em PG17: 12/12 PASS.**
  No banco vivo hoje: **0 das 225 funções de `public` com EXECUTE para `anon`**.
- **A-01 (ALTA):** `pg_default_acl` de **`supabase_admin` em `public` ainda concede a `anon`**
  (f/r/S). A `20260930113613` cobre só `FOR ROLE postgres`. O "item 5 já coberto" que justificou
  aposentar a `20260930120000` é **parcialmente falso**: o resíduo segue aberto e mensurável.
- **A-07 (BAIXA):** `talkx_settings` e `talkx_blacklist` ainda têm DML direto concedido a `anon`
  (`relacl`); o que barra é apenas a RLS. A `20260930100000` fez esse `REVOKE` para
  `conversation_analyses`; as outras duas ficaram sem o equivalente (defesa em profundidade).
- **A-08 (BAIXA):** o consumidor citado pelo PR #1253 (`TalkXSettings.tsx`) **não está montado em
  lugar nenhum** do `src` — a premissa "a UI dizia salvo e o valor voltava ao antigo" não é
  reproduzível pela tela hoje (a policy está correta e testada; o `UPDATE` sem linha afetada segue
  silencioso para quem não é admin).
- **A-05 (MÉDIA):** o comentário da `20260929860000` afirma que o furo do `UNIQUE(contact_id)` foi
  corrigido na V07, mas a V07 só chegou ao `main` depois
  (`20260930140000_talkx_blacklist_contact_active_unique`) — e `talkx_blacklist_contact_id_key UNIQUE (contact_id)`
  seguia vivo e válido na medição.

### F2 — Migrations, idempotência e fiação no CI

- **Aplicam e são idempotentes:** 6/6 no snapshot (P1 exit=0 e P2 exit=0 → 12/12). **A ordem do lote
  não importa** (em ordem inversa: 6/6 exit=0 e estado final idêntico). São **incrementais**: 3 de 6
  dependem de tabelas de dias anteriores.
- **Colisão de versão (P0 — introduzida e resolvida DURANTE esta auditoria):** `20260930140000` existiu
  **duas vezes** no `main` (`_align_ai_read_policies_with_contact_visibility`, do PR #1263, e
  `_talkx_blacklist_contact_active_unique`, do PR #1264). O check obrigatório **`Contrato DB offline`
  ficou vermelho** em `9f817ac2` (= completed/**failure**, com `Lint & TypeCheck` = success), com a
  mensagem `versao duplicada 20260930140000`. Os dois PRs passaram **isolados** porque a branch
  protection tem `strict=false` — cada um validou contra uma base sem o outro.
  **Resolvido às 13:52Z pelo PR #1269**, que renumerou a V07 para `20260930160000`: em `1f7ac6a5` o
  check voltou a `success` (medido). A lição estrutural permanece: com `strict=false`, dois PRs podem
  introduzir a mesma versão e cada um passa sozinho.
- **`DROP POLICY` sem `IF EXISTS`** em `20260930100000:36` — a única das migrations do dia que não é
  *replay-safe* (falha `42704` onde a policy não exista).
- **Cobertura de CI furada:** só 3 das 7 migrations do dia têm harness rodando no check obrigatório.
  `talkx-settings-rls.test.sh` **não é citado por workflow nenhum**, e todo o `scripts/db-tests/`
  (asserções `01-SEC-01`/`01-SEC-03`, citadas como prova por duas migrations de hoje) **não é chamado
  por workflow nenhum**. O `DB Live Guard` (único que compara com o ledger) não roda em PR e não é
  check obrigatório.
- **Nomes divergentes (pré-existentes):** 4 versões têm `name` no ledger diferente do arquivo, todas
  já pinadas como exceção no `migration-evidence.json` (`pinned-replay`); não é drift novo.

### F3 — Frontend e teste de mutação

**18 mutações: 15 mortas, 2 sobreviventes, 1 invalidada (94% efetivo).** As 4 de maior risco morreram
(fade de 200 ms, política do "Fazendo cheio", endereço no salvar, retry da pausa 429). Suítes: 104
arquivos / 1004 testes / exit 0; contracts 246 testes; gates verdes.

- **F1 (ALTO) — seção "Concluídas" órfã.** `TasksListMode.tsx:47` faz
  `if (items.length === 0) return null;` **antes** de olhar `olderItems`: com a janela de 7 dias vazia
  e concluídas de 8–30 dias existindo, a seção inteira desaparece — e o botão "ver mais", que é o
  entregável do PR #1235, fica inalcançável. **Verificado no código pelo coordenador.** O Quadro faz
  o oposto (`BoardColumn.tsx:108` mostra o rodapé com 0 recentes) → divergência não intencional.
- **F2 (ALTO) — o gatilho do som de alerta de segurança não tem teste.** Mutar
  `RateLimitRealtimeAlerts.tsx:85` para `if (false) playAlertSound(...)` **não quebra nada** na suíte
  inteira (104 arquivos / 1004 testes) nem nos 2 contratos de som. É o coração do PR #1236.
- **F3 (MÉDIO) — o PR #1244 corrigiu 1 de 2 chamadores.** `ContactDetails.tsx:143` passa
  `{contact, enrichedData}`; `Crm360Tab.tsx:105` chama `buildEditContactShape({ contact })` **sem**
  `enrichedData` → o editor aberto pelo CRM 360° continua abrindo com endereço vazio (o mesmo sintoma
  que o PR declara resolvido). Não há perda de dado (o diálogo omite campo não tocado); o dano é
  operacional: o operador vê branco e sobrescreve.
- **F4 (MÉDIO) — fuso horário inconsistente.** `weekBuckets` fatia em **UTC**
  (`toISOString().slice(0,10)`), enquanto `bucketByDue`/`dayGroupLabel` trabalham em **local**: tarefa
  gravada para "Hoje 23:59" local cai no dia seguinte na Agenda (medido: `02:59Z` do dia seguinte em
  UTC-3). O teste existente de `weekBuckets` usa datas em meia-noite UTC — não vê o problema.
- **F5/F6/F7 (BAIXOS):** ordem das colunas do Quadro não é pinada (inverter passa); o assert genérico
  de contrato de som rejeita só literal decimal (`.volume = 1` escapa); a doc
  `TAREFAS_QUADRO_STATUS.md:163` cita `text-[12px]` que o código não usa (guard de tipografia
  reprovaria quem "cumprisse a doc").
- **Duplicação (risco de Sonar):** proxies locais dão **24,2%** de linhas idênticas entre os 9 arquivos
  de teste novos — o bloco `FakeAudio` está quase duplicado em 3 arquivos e o mock de canal em 2. O
  `useTeamChatNotifications.behavior.test.ts` é o único dos 4 testes de comportamento que **não** usa
  o `alertBehaviorTestKit` criado justamente para isso. O gate do Sonar nos PRs passou (2,55% new).

### F4 — Produção (bundle e comportamento real)

- **24/24 merges com deploy de produção `success`**, com **24 deployment IDs Vercel distintos**.
- **O bundle avançou 4× durante a auditoria** (`index-GrJ7-i9M` → `Hdb0bKkd` → `BiPfAITP` → `DycCSn-G`)
  porque a `main` seguiu recebendo merges: 170 chunks byte-idênticos ao HEAD auditado, 156 diferentes
  só por cascata de nome, 5 com mudança real (`ContactsView`, `ActiveCallBar`, `Index`, `TalkXView`) —
  **nenhum toca os comportamentos auditados**. Build determinístico (10/10 chunks batem byte-a-byte
  com `bun run build` local).
- **Evidência do JS publicado (bate com o build local):** ordem das abas
  `Chat → Arquivos → IA → CRM 360° → Pedidos → Histórico → Tarefas → Notas`; Lista com
  `Atrasadas/Hoje/Amanhã/Próximas/Sem prazo/Concluídas (7 dias)` + `Ordenado por prazo, depois prioridade`;
  `Concluídas (7d)` + `Ver mais antigas (30 dias)`; `exit:{opacity:0,height:0,transition:{duration:T?0:.2}}`.
- **Navegador real (só leitura, 0 escrita):** abas na ordem certa (x crescentes 618→1317 px); Quadro
  com as 5 colunas, `Fazendo = 0/3` e o tooltip *"O que está nas suas mãos agora. Três é o limite."*;
  esqueleto com 3 `animate-pulse` na visita fria; autocomplete devolveu 5 sugestões Mapbox reais para
  "Av Paulista"; slider de volume do alerta presente (`min=10 max=100`, 70%) e o bundle confirma
  `(i.soundVolume??70)/100*0.2`.
- **Não exercitável:** agrupamento da Lista e "Concluído 7 dias" — **a conta de QA tem 0 tarefas**
  (KPIs zerados, empty state). O endereço do editor também não é demonstrável com o dado de QA (todos
  os contatos visíveis têm `address/city/postal_code` nulos), mas a query de produção **pede** as 6
  colunas de endereço.
- **Regressões:** 0 `pageerror`; 1 erro de rede **pré-existente** —
  `GET /rest/v1/messages…limit=1000 → 500` (`57014 statement timeout`) em `useMessages.ts`, arquivo não
  tocado por nenhum commit de hoje.

### F5 — Gates, CI e segurança do repositório

- **Gates na árvore limpa:** `typecheck` 0 · `lint-ratchet` 0 (`baseline=971, atual=955, novas=0`) ·
  `typecheck-ratchet` 0 · tipografia 0 (8/8 cotas) · `build` 0 · `test:contracts` 0 (13 arquivos / 246
  testes) · `db:guard` 0 (1 violação, toda no baseline; **compara com o ledger só com `DESTINO_URL` —
  pulado**). `bun run test`: **exit 1 na 1ª execução, exit 0 na 2ª** — confirma C-06 de forma
  independente.
- **Pós-merge na `main` (101 runs hoje):** `DB Live Guard` **14 failures** (vermelho em série desde
  29/09 21:07), `E2E logado` 9 failures + 10 cancelados, `types-sync` 7 failures, `Deploy Edge
  Functions` 11 cancelled + 4 failures, `CI/CD Pipeline` 9 cancelados. Classificação: DB Live Guard e
  types-sync = pré-existentes/acumulados (drift C-01); cancelamentos = concorrência (C-05); failures
  de Deploy Edge = etapa pós-deploy (`inventory did not stabilize after 144 attempts`), não o deploy.
- **E2E logado:** 3 testes falham de forma consistente (`reactions.spec.ts:84`, `reactions.spec.ts:51`,
  `media-volume.spec.ts:49`), nenhum arquivo `e2e/` foi tocado nos 24 merges e o último `success` é de
  antes do meio-dia — **atribuição de causa não medida** (pendência explícita).
- **Segredos/escopo:** **limpo** — 0 segredo real (5 ocorrências de `service_role` são fixtures), 0
  `bun.lock` alterado, 0 arquivo `100755`, 68 arquivos coerentes com os títulos dos PRs.
- **SonarCloud:** gate **OK nos 24 PRs**; gate da **`main` em ERROR** por `new_reliability_rating=3`
  (1 BUG novo: `typescript:S9383` em `src/components/inbox/location-picker/useAddressAutocomplete.ts:277`,
  do PR #1241) + 10 issues novas. Duplicação `new` = 2,55% (abaixo do teto de 3%).
- **Dívida de lint:** as 16 entradas "removidas" do baseline são **fantasma**: 4 apontam para 2
  arquivos deletados em 29/09 (`SicoobBridgeDashboard.tsx`, `SalesPipelineView.tsx`) e 12 são
  deslocamento de linha em arquivos existentes. Nenhuma é do diff de hoje. **Impacto:** enquanto o
  baseline vale 971, essas 16 ocorrências podem reaparecer sem o gate acusar — inclusive se alguém
  recriar os arquivos deletados. Conserto previsto pelo próprio script:
  `node scripts/ci/lint-ratchet.mjs --update-baseline` (aperta o baseline), em commit próprio.

## 5. Verificações do coordenador sobre os relatórios

Os achados de maior gravidade não foram aceitos como auto-relato; os três mais críticos foram medidos
de novo, por mim:

| Claim | Minha medição | Veredito |
| --- | --- | --- |
| Colisão de versão + check obrigatório vermelho na `main` | `supabase/migrations/` na `main` tinha **dois** arquivos `20260930140000_*`; `Contrato DB offline` = completed/**failure** em `9f817ac2` (com `Lint & TypeCheck` = success) | **confirmado** às 12:50Z; **resolvido** às 13:52Z pelo PR #1269 → `1f7ac6a5` = success |
| 3 funções de e-mail do PR #1240 não publicadas | `supabase functions download send-email` → `from: body.from \|\| "ZAPP System <noreply@zapp.com>"` × repo → `from: "ZAPP System <noreply@promobrindes.com.br>"` | **confirmado** (medido 2×: 12:40Z e 14:20Z; as 3 funções seguem com o fonte antigo) |
| Seção "Concluídas" órfã na Lista | `TasksListMode.tsx:47` retorna `null` por `items.length === 0` antes de considerar `olderItems` | **confirmado** |
| C-06 (suíte sai 1 sem falha) | 3 rodadas próprias com resultados divergentes (exit 1 / exit 0 isolado / exit 0 com `CI=true`) | **confirmado como latente** |

## 6. Matriz de aceite

| Critério | Evidência | Estado |
| --- | --- | --- |
| Toda migration mergeada hoje está no ledger e aplica | F1 + F2 | **6/6 aplicam**; a 7ª aposentada sem aplicar (C-04) |
| Nenhum consumidor legítimo quebrado por revoke/policy | F1 | **nenhum encontrado** |
| Testes novos provam comportamento | F3 (18 mutações) | **94%**; 2 sobreviventes |
| Produção serve a `main` | F4 | **sim** (24/24 deploy `success`); bundle adianta 4 commits |
| Gates do repositório verdes | F5 + C | sim, com flake latente (C-06) |
| Paridade ledger ↔ repo | C (C-01) | **1 divergência aberta** |
| Integridade git dos merges | C | **ok** |
| CI da `main` verde depois dos merges | F5 + C | **não** — 3 workflows vermelhos + fila de Edge |

## 7. Ações priorizadas (nenhuma executada por esta auditoria)

**P0 — resolvido durante a auditoria (mantido como lição estrutural)**
1. ~~Renumerar uma das duas `20260930140000` e revalidar o `Contrato DB offline` na `main`.~~
   **Feito em outro chat: PR #1269, às 13:52Z** (a V07 virou `20260930160000`; `1f7ac6a5` =
   `Contrato DB offline` success). O risco que produziu o vermelho segue aberto: com `strict=false`
   dois PRs podem introduzir a mesma versão e cada um passa isolado — avaliar `strict=true` ou levar
   a checagem de versão duplicada para o PR.

**P1 — produção não tem o que o repositório diz que tem**
2. Publicar `send-email`, `detect-new-device` e `send-scheduled-report` do PR #1240 (a correção do
   `from` arbitrário **não está viva**) e corrigir a `concurrency` do `deploy-functions.yml`
   (`cancel-in-progress: true` com grupo por função, ou enfileirar de verdade).
3. Criar arquivo versionado para `20260930110000` a partir dos statements do ledger (ou piná-la
   explicitamente no `migration-evidence.json`) — é o que mantém `DB Live Guard`/`types-sync`
   vermelhos e a `main` sem paridade.
4. Consertar a seção "Concluídas" órfã na Lista (F3-F1) — o entregável do PR #1235 é inalcançável
   quando não há concluídas nos últimos 7 dias.

**P2 — robustez**
5. Cancelar/limpar o timer de `useSendProduct.ts` (C-06) e cobrir o gatilho do som de alerta de
   segurança (F3-F2).
6. Corrigir o fuso de `weekBuckets` (UTC × local), o `enrichedData` ausente no `Crm360Tab` (F3-F3), o
   `DROP POLICY` sem `IF EXISTS` (`20260930100000:36`) e o resíduo de `default privileges` de
   `supabase_admin` (A-01).
7. Fiar `talkx-settings-rls.test.sh` e `scripts/db-tests/` num workflow; tornar o `DB Live Guard`
   obrigatório (ou rodar a comparação com o ledger em PR) — hoje `strict=false`, então dois PRs podem
   introduzir a mesma versão sem que nenhum veja.
8. `node scripts/ci/lint-ratchet.mjs --update-baseline` em commit próprio (16 entradas fantasma).
9. Limpar os branches resíduo (C-02, C-03).

## 8. Achados fora do escopo (não corrigidos)

- Funções em produção **sem fonte no repo**: `check-account-lock`, `record-failed-login`,
  `sicoob-bridge`, `sicoob-bridge-reply`; e 4 funções com `entrypoint_path` em `~/hermes-workspaces/...`.
- `docs/design/TAREFAS_QUADRO_STATUS.md:163` cita `text-[12px]` que o código não usa.
- `docs/design/PLANO_INBOX_360_CONVERSA.md` (23, 39, 139),
  `docs/design/PLANO_INBOX_FIDELIDADE_CARVAO.md` (75) e
  `docs/design/PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md` (73) citam a ordem antiga das abas / 9 abas.
- `GET /rest/v1/messages…limit=1000` → `500` (`57014 statement timeout`), em `useMessages.ts`.
- Comentários de `deploy-functions.yml` (E09, 60–77) e `e2e-logado.yml` (28–35) afirmam o oposto do
  comportamento real de `concurrency` — corrigir o texto evita repetir a decisão errada.
