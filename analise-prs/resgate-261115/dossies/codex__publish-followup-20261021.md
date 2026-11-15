# codex__publish-followup-20261021 — PERDIDA_PARCIAL

- Ref: `origin/codex/publish-followup-20261021` · tip `47b1c07e3` · merge_base `1fb282e64` (2026-10-21)
- 1 commit: `47b1c07e3 fix: harden CI, integrations, and search event logging` (59 arquivos, +1715/-868)
- PR 2442 (triagem anterior: "JA_NA_MAIN") — **parcialmente falso**: o banco entrou, o frontend da trilha de busca e o endurecimento do wizard Talk X **não**.
- Contexto: no MESMO dia (2026-10-21) a main recebeu `4b9585052` (PR #2156 "Correções validadas de CI, segurança e integrações") com o subconjunto de CI/docs/guards. O resto da branch ficou fora.

## Tabela arquivo × achado × evidência

### Já na main (não recuperar)
| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261026100000_search_event_rpc.sql` | **INCORPORADA byte a byte** sob outro timestamp | `origin/main:supabase/migrations/20261031130000_search_event_rpc.sql` é idêntico (`diff` exit 0); commit `e2e4989fa feat(db): search_event_rpc (#2425)`. Produção: `log_search_event(p_term text, p_result_count integer, p_clicked boolean, p_event_id uuid, p_result_kind text)`, coluna `search_events.client_event_id` presente, nenhuma policy em `search_events` (INSERT revogado), `schema_migrations` tem `20261031130000` |
| `src/components/connections/ConnectionCard.tsx` | **INCORPORADA equivalente** | main 70-71 (`disconnectPending`/`disconnectError`), 77-82 (`handleDisconnectDialogOpenChange`), 84-100 (`disconnected === false` → erro, catch mantém diálogo), 250-254 (`pending`/`errorMessage`) |
| `.github/workflows/vercel-env-cleanup.yml` | 7 dos 8 hunks na main | main tem header `docs:`, `defaults.run.shell`, `if: github.ref == 'refs/heads/main'`, `permissions: contents: read`, `persist-credentials: false`, Node 24. Falta só o par `VERCEL_WRITE_TOKEN`/readonly (ver lacunas) |
| `.github/workflows/ci.yml` (Deno, vercel unit, playwright pin) | na main | `ci.yml:130,214` Setup Deno; `:191 node scripts/vercel/ignore-build.unit.mjs`; `:484 bunx playwright@1.64.1 install --with-deps` |
| `.github/workflows/talkx-status-regen.yml` | na main | `:52 if: github.ref == 'refs/heads/main'` |
| `docs/talkx/ESTADOS.md` | arquivo existe na main (`git ls-tree origin/main docs/talkx/ESTADOS.md`) | só a linha de índice no README falta |

### Obsoleta (a main decidiu o contrário — **não portar, regressão**)
| Arquivo | Por que obsoleta | Evidência |
|---|---|---|
| `supabase/functions/connection-health-check/index.ts` + `.test.ts` | A branch é **anterior** ao módulo de reconexão automática e à regra dos três níveis. Portar apagaria `decideReconnect`, `decideEscalation`, `levelDedupeKey`, `buildConnectionAlertPrefs`/`loadConnectionAlertPrefs` e reverteria `npm:@supabase/supabase-js` → `esm.sh`. O alerta `degraded` fora do bloco de transição e o funil de notificação idempotente já existem na main de forma mais ampla (`main:1011-1024` cobre `webhook_silent` **e** `stale_session`; notificação sai por `escalations` + `notifications.dedupe_key`, não pelo retorno do insert em `warroom_alerts`) | main 578 `dedupeAlerts`, 1051 `runWithConcurrency`, 1081-1110, 1113-1133 |
| idem — hunk `evaluateOpenConnectionHealth` | A branch torna `stale_session` = `disconnected`; a main decidiu `degraded` ("falta de mensagem RECEBIDA não prova queda… não bloqueia envio", main:190-196). Regra de negócio vigente, mais nova | `origin/main:...index.ts:181-196` |
| `src/hooks/integrations/useTalkXSegments.ts` (tudo exceto `summarizeAudience`) | main evoluiu: `status: 'draft'` (X101), abstração `ponteOnly` + `assertNoPonteOnlyFields` (generaliza o `validarRegrasDeAudiencia` da branch), `lead_origin` marcado `comingSoon`. A branch desfaz os três | `git diff origin/main origin/codex/... -- src/hooks/integrations/useTalkXSegments.ts` |
| `src/components/talkx/TalkXCampaignWizard.tsx` (painel de resumo) | main tem `useTalkXCampaignSummary` (X131): total/elegível/suprimido vindos da mesma RPC do disparo, com `isLoading`/`isError` e `—` em vez de `0`. A branch remove o hook para usar o próprio `audienceSnapshot` | `origin/main:src/hooks/integrations/useTalkXCampaignSummary.ts:1-56`; wizard main `:739-760` |
| `scripts/ci/ci-e2e-projects.unit.mjs` | A branch **inverte** o contrato E88 (`!doCi.includes('firefox-auth')` → `doCi.includes(...)`). main mantém a decisão de custo: `firefox-auth` não aparece em `ci.yml` (`git grep -c firefox-auth origin/main -- .github/workflows/ci.yml` = 0). Portar deixa o CI vermelho |
| `scripts/ci/confirm-hash.unit.mjs` | A branch exige validação inline; main usa o script externo `scripts/db-audit/validate-runtime-proof.mjs` (usado por `db-migrate.yml`) |
| `scripts/ci/evolution-edge-fixes.unit.mjs` | A branch apaga o contrato das rotas explícitas da Evolution V2 restauradas por **decisão do dono (12/11)** e troca por asserção de `find-messages`/`find-status-messages` |
| `.github/workflows/ci.yml` (chave de cache `pw-cfw-1.64.1-…`) | main justifica a chave sem versão: "o hash do bun.lock (o Playwright é devDependency e a versão está no lock)" (`ci.yml:475-477`) |
| `CLAUDE.md`, `ESTADO.md`, `FEATURE_REGISTRY.md`, `TESTING_CONVENTION.md`, `docs/DB-INVENTORY.md`, `docs/ci/README.md`, `docs/audits/*`, `scripts/ci/{ci-artifacts,ci-docs-baseline,docs-estado-registry-convention,github-settings-guard,marcador-specs*,security-workflow,workflow-contracts}.*`, `scripts/db-audit/{check-migration-drift.test,n011-storage-policies-dedup.test,talkx-analytics-contract.test}.mjs`, `scripts/vercel/ignore-build.unit.mjs`, `.github/workflows/{db-live-guard,e2e-logado,e2e-talkx,notifica-falha-main}.yml` | Reescrita de texto/guard de 21/10 contra uma main que avançou (último commit da main nesses arquivos: 28/10 a 15/11; os de 21/10 vêm do próprio `4b9585052`/#2156, versão revisada e mergeada) | `git log -1 --date=short origin/main -- <arquivo>` |
| `scripts/db-audit/migration-evidence.json`, `known-violations.json` | ledgers gerados; main mais nova (09/11, 14/11) | idem |
| `supabase/migrations/20261016240000_search_events_rls_decision.sql` | só comentário; a migration é no-op documental e já está aplicada (`schema_migrations` tem `20261016240000`) | nenhum DDL |

## Lacunas reais (trabalho perdido, ainda faz sentido)

### L1 — Correlação busca↔clique na telemetria da busca global (ALTO)
Produção tem a RPC de 5 argumentos; a main chama com 3. Resultado hoje: cada clique insere **nova linha** (`p_event_id` default `gen_random_uuid()`), inflando "buscas"; e `result_kind` nunca chega — com `p_clicked=true` e `p_result_kind=null` o `case` da RPC grava `'other'` para tudo. O `ON CONFLICT … do update` da RPC nunca é exercido.
Prova: `origin/main:src/components/inbox/useGlobalSearchData.ts:63,111` (3 args) vs RPC em produção com `p_event_id uuid, p_result_kind text`.

Arquivos a portar: `src/components/inbox/useGlobalSearchData.ts`, `src/components/inbox/GlobalSearch.tsx`, `src/components/inbox/__tests__/useGlobalSearchData.eventos.test.tsx`.

```ts
// useGlobalSearchData.ts — gerador de UUID com fallback
function createSearchEventId(): string | null {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== 'function') return null;
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

interface LogSearchEventArgs {
  p_term: string; p_result_count: number; p_clicked: boolean;
  p_event_id: string; p_result_kind: SearchResult['type'] | null;
}

const lastSearchEvent = useRef<{ term: string; resultCount: number; eventId: string; clicked: boolean } | null>(null);

const logSearchEvent = useCallback(async (term, resultCount, eventId, clicked, resultKind = null) => {
  if (!isLoggableSearchTerm(term)) return;
  try {
    const { error } = await searchEventsRpc.rpc('log_search_event', {
      p_term: term, p_result_count: resultCount, p_clicked: clicked,
      p_event_id: eventId, p_result_kind: resultKind,
    });
    if (error) throw error;
  } catch (error) { /* log apenas */ }
}, []);

const registerResultClick = useCallback((resultKind: SearchResult['type']) => {
  const last = lastSearchEvent.current;
  if (!last || last.clicked) return;
  last.clicked = true;
  void logSearchEvent(last.term, last.resultCount, last.eventId, true, resultKind);
}, [logSearchEvent]);

// no fim da busca:
if (cleanQuery.length < MIN_SEARCH_EVENT_TERM_LENGTH) {
  lastSearchEvent.current = null; lastLoggedTerm.current = null;   // não herda clique antigo
} else if (cleanQuery !== lastLoggedTerm.current) {
  const eventId = createSearchEventId();
  if (eventId) {
    lastLoggedTerm.current = cleanQuery;
    lastSearchEvent.current = { term: cleanQuery, resultCount: searchResults.length, eventId, clicked: false };
    void logSearchEvent(cleanQuery, searchResults.length, eventId, false);
  } else { lastSearchEvent.current = null; }
}
```
`GlobalSearch.tsx:88`: `registerResultClick()` → `registerResultClick(result.type)`.

### L2 — Wizard Talk X avança/lança sem audiência confirmada (ALTO)
Na main: `src/components/talkx/useCampaignEditor.ts:554` engole o `error` da consulta de conexões (`const { data } = await supabase.from('whatsapp_connections')…`) → falha de rede vira "nenhuma conexão" e o wizard mostra o estado "WhatsApp desconectado"; `:874` o passo 1 só exige `!!connectionId` + contagem de seleção, sem confirmar que a consulta de audiência teve sucesso; `:981-993` o snapshot é tirado e a campanha é agendada/lançada **mesmo com `eligible = 0`**. A branch fecha os três.
Arquivos: `src/components/talkx/useCampaignEditor.ts`, `src/components/talkx/TalkXCampaignWizard.tsx` (só os blocos de erro/carregando + `aria-pressed`/`htmlFor`, **mantendo** `useTalkXCampaignSummary`), `src/components/talkx/TalkXContactSelector.tsx`, testes `__tests__/useCampaignEditor.test.tsx` e `__tests__/TalkXMultiSegmentos.test.tsx`.

```ts
// 1) a consulta de conexões não pode falhar em silêncio
const { data, error } = await supabase.from('whatsapp_connections').select(...)…;
if (error) throw new Error(error.message);
const connectionIsReady = connectionQuery.isSuccess && !connectionIsError
  && connections.some((c) => c.id === connectionId);

// 2) erro/carregamento não viram "público vazio"
const audienceQueryError = (audienceSource === 'contacts'
  ? unsupportedAudienceRuleError ?? contactsQuery.error ?? (hasCompleteAudienceRules ? audienceCountQuery.error : null)
  : audienceSource === 'segment' ? segmentsError ?? segmentUnionQuery.error : null) as Error | null;
const audienceQueryReady = audienceSource === 'contacts'
  ? !hasUnsupportedAudienceRules && contactsQuery.isSuccess && (!hasCompleteAudienceRules || audienceCountQuery.isSuccess) && !audienceQueryError
  : audienceSource === 'segment'
    ? !segmentsLoading && !segmentsIsError && segmentIds.length > 0
      && selectedSegments.length === segmentIds.length
      && selectedSegments.every((s) => s.status === 'active')
      && segmentUnionQuery.isSuccess && !audienceQueryError
    : false;

canProceed[1] = nome válido && connectionIsReady && audienceQueryReady
  && (audienceSource === 'segment'
      ? segmentIds.length > 0 && selectedSegments.length === segmentIds.length && segmentUnionTotal > 0
      : selectedContacts.length > 0);

// 3) agendar/lançar exige elegível > 0
if (mode !== 'draft' && (snapshot?.eligible ?? 0) <= 0) {
  throw new Error('A audiência não tem contatos elegíveis para agendamento ou envio. Revise os filtros e as seleções.');
}

// 4) regras real_sector/real_uf (ponteOnly) barradas com mensagem, não com erro cru
if (hasUnsupportedAudienceRules) throw new Error('Setor/UF reais ainda precisam de pré-resolução Singu; remova esses filtros antes de salvar ou avançar.');
```
No wizard (`StepAudience`): `role="alert"` + "Tentar novamente" para `connectionQueryError`/`audienceQueryError`, `role="status"` para os dois `*Loading`, `&& !loading && !error` nos estados vazios ("Nenhum segmento encontrado", `TalkXWhatsAppDisconnectedState`), `right={... error ? 'Contagem indisponível' : ...}`, e `isLoading`/`hasError` repassados ao `TalkXContactSelector` (que ganha `role="status"` + "Carregando contatos…"/"Não foi possível carregar contatos."). Os `refetchAudience`/`refetchConnections` saem do hook.
Observação de porte: a branch usa `summarizeAudience(rules, segmentIds)` (novo em `useTalkXSegments.ts`) para pegar `matched/eligible/suppressed/invalid_phone/legacy_or_deleted`. Isso **já existe na main** em `useTalkXCampaignSummary` sobre a mesma RPC — reaproveitar o hook da main em vez de duplicar o parser; produção devolve os 5 campos no modo `count` (`talkx_resolve_audience`, `jsonb_build_object('mode','count','matched',…,'legacy_or_deleted',…)`).

### L3 — Tela admin "Insights de Busca" com duas tabelas sempre vazias e dois números jogados fora (MÉDIO)
Produção: `search_insights(p_days integer) RETURNS TABLE(total_searches bigint, searches_without_results bigint, searches_with_click bigint, average_term_length numeric, searches_by_kind jsonb)`. A main (`src/hooks/admin/useSearchInsights.ts`, pós-#2798) ignora `average_term_length` e `searches_by_kind` e devolve `topQueries: []` / `noResultTerms: []` fixos; a view renderiza as duas tabelas vazias (`origin/main:src/components/admin/SearchInsightsView.tsx:223,229,237-238`) — UI morta.
Portar: `src/hooks/admin/useSearchInsights.ts` (tipos `averageTermLength`/`searchesByKind`, `parseSearchInsights` validando linha/array, `toCount` lançando `SearchInsightsError` em valor inválido, checagem `noResults > total || clicks > total`) + `src/components/admin/SearchInsightsView.tsx` (card "Tamanho médio do termo", card "Cliques por tipo de resultado", resumo textual novo, remoção das duas tabelas) + `src/components/admin/__tests__/SearchInsightsView.test.tsx`.

### L4 — pgTAP de `log_search_event` ausente (MÉDIO)
`supabase/tests/search_events.sql` na main é a versão pré-RPC (main == merge_base). A branch adiciona o bloco T9 (+ rollback T8) que prova, contra o banco: assinatura `(text,integer,boolean,uuid,text)`, `authenticated` com EXECUTE e **`anon`/`service_role` sem**, colunas incluindo `client_event_id`, descarte de PII (e-mail, ≥7 dígitos, token ≥32), limites de 3..200 chars, `p_result_count` nulo/negativo, clique sem resultado ignorado, idempotência por `(user_id, client_event_id)` e compatibilidade da chamada de 3 args.

### L5 — Itens pequenos (BAIXO)
- `.github/workflows/vercel-env-cleanup.yml`: `VERCEL_TOKEN: ${{ inputs.dry_run == '0' && secrets.VERCEL_WRITE_TOKEN || secrets.VERCEL_READONLY_TOKEN }}` + step que falha quando `dry_run=0` sem `VERCEL_WRITE_TOKEN`, e o guard `scripts/ci/vercel-env-cleanup-workflow.unit.mjs`. Hoje a main usa sempre o token de leitura e documenta isso como estado consciente ("serve para AUDITAR"); exige criar o secret `VERCEL_WRITE_TOKEN`.
- `scripts/ci/talkx-status-regen-workflow.unit.mjs`: asserção `if: github.ref == 'refs/heads/main'` (o workflow da main já atende; o teste é que falta).
- `scripts/ci/marcador-specs.unit.mjs`: caso de `tituloDe` com `tituloBase` customizado — depende do `tituloBase` que a branch adiciona em `scripts/ci/marcador-specs.mjs` (a main não tem; a mudança da branch lá remove 6 linhas do contrato atual — avaliar isolado).
- `.github/workflows/db-live-guard.yml` / `docs/talkx/README.md`: 1 linha de comentário e 1 linha de índice.

## Veredito
**PERDIDA_PARCIAL.** Banco (RPC + coluna + índice + revoke) incorporado; `ConnectionCard` incorporado; CI/docs/guards obsoletos ou já na main pelo #2156. Perdidos: L1 (telemetria de busca correlacionada), L2 (endurecimento do wizard Talk X), L3 (insights de busca reais na tela admin), L4 (pgTAP da RPC), L5 (miudezas).
`apagar_branch_seguro = false` — L1..L4 só existem nesta branch.

## Verificação adversarial

Tentativa de refutar o PERDIDA_PARCIAL (provar que a main já cobre as lacunas). **Não refutado: concordo.**
Ref `origin/codex/publish-followup-20261021` (tip 47b1c07e3), merge-base 1fb282e64, main em dac285f62.

### L1 — telemetria busca↔clique: CONFIRMADA perdida
- `git show origin/main:src/components/inbox/useGlobalSearchData.ts` — a chamada da RPC passa só
  `p_term`/`p_result_count`/`p_clicked` (bloco `logSearchEvent`), `lastSearchEvent` não guarda `eventId`,
  `registerResultClick()` não recebe parâmetro e `origin/main:src/components/inbox/GlobalSearch.tsx:88`
  chama `registerResultClick()` sem `result.type`. Nenhum `createSearchEventId` na main.
- Produção (MCP, somente leitura): `log_search_event(p_term text, p_result_count integer, p_clicked boolean,
  p_event_id uuid DEFAULT NULL, p_result_kind text DEFAULT NULL)`. O corpo da migration incorporada
  (`origin/main:supabase/migrations/20261031130000_search_event_rpc.sql`) faz
  `v_event_id := coalesce(p_event_id, gen_random_uuid())` → cliente sem `p_event_id` gera linha nova a cada
  clique e `result_kind` cai no `else 'other'`. Defeito latente, não observado: `select count(*) from
  public.search_events` = **0 linhas** hoje, logo nenhuma métrica está distorcida ainda.
- Não foi remoção deliberada: `git log -S'p_event_id' origin/main -- src/components/inbox/useGlobalSearchData.ts`
  = vazio; `git log -S'p_result_kind' origin/main` só retorna commits de banco/docs (e2e4989fa #2425, b04227fb5, b1040225d).
- Encaixa na main: o facade `searchEventsRpc` e os defaults da RPC aceitam os 2 argumentos extras sem migration.

### L2 — wizard Talk X: CONFIRMADA perdida, porta parcial
- `origin/main:src/components/talkx/useCampaignEditor.ts` (1164 linhas, último commit 025d0258d de **16/10/2026**,
  anterior à branch — nenhuma decisão mais nova a respeitar):
  - consulta de conexões ainda `const { data } = await supabase.from('whatsapp_connections')…; return data || []`
    (erro descartado → falha de rede vira lista vazia);
  - `canProceed[1]` = nome + `!!connectionId` + contagem de seleção; não exige sucesso de nenhuma consulta;
  - no `persistSave`, `setSnapshotSuppressedCount(snapshot?.suppressed ?? 0)` e segue para
    `status: 'scheduled'` / `startCampaign(id)` sem olhar `snapshot.eligible`.
- `origin/main:src/hooks/integrations/useTalkX.ts:485,501` já devolve `{ eligible, suppressed, skipped_invalid }`
  → o item (c) (barrar `eligible <= 0`) porta direto na main.
- **Redução honesta:** (d) real_sector/real_uf já falha fechado na main por outro caminho
  (`assertNoPonteOnlyFields` + `ponteOnly: true` em `origin/main:src/hooks/integrations/useTalkXSegments.ts:80,275`),
  então a mensagem amigável antes do save é melhoria, não lacuna. E (b) na forma da branch depende de
  `summarizeAudience`/`AudienceSummary`, que **não existem na main** (lá só há `countAudience`): o port precisa ser
  reescrito sobre as queries atuais, não é cherry-pick. O valor alto está em (a) e (c).

### L3 — Insights de Busca: CONFIRMADA perdida, com ressalva
- Produção: `search_insights(p_days integer DEFAULT 30) RETURNS TABLE(total_searches bigint,
  searches_without_results bigint, searches_with_click bigint, average_term_length numeric, searches_by_kind jsonb)`.
  `origin/main:src/hooks/admin/useSearchInsights.ts` lê só os três primeiros e devolve `topQueries: []` /
  `noResultTerms: []` fixos; `origin/main:src/components/admin/SearchInsightsView.tsx` (~215-232) renderiza
  `TermTable "Mais buscadas"` e `TermTable "Sem resultado"` sempre vazias.
- **Ressalva:** as listas vazias são decisão POSTERIOR e deliberada da main — c6c7697af (#2798, 08/11/2026,
  "topQueries/noResultTerms sempre [] (preservação de privacidade)"). Portanto a lacuna real de L3 é só
  (i) exibir `average_term_length` e `searches_by_kind`, (ii) tirar as duas tabelas mortas da tela.
  Valor médio, não alto; a privacidade da main vence o desenho antigo da branch.

### Confirmação do que a triagem chamou de obsoleto (amostra)
- `useTalkXSegments.ts`: a branch marca `real_sector/real_uf` como `comingSoon`; a main já resolveu o mesmo risco
  com `ponteOnly` + `assertNoPonteOnlyFields` + `.bind(supabase)` — portar seria regressão. Única coisa nova e
  não coberta é a decomposição `summarizeAudience` (`matched/invalid_phone/legacy_or_deleted`): valor baixo/médio,
  registro abaixo como lacuna adicional opcional.

**Parecer:** veredito mantido **PERDIDA_PARCIAL**; `apagar_branch_seguro = false` (L1 e L2(a)(c) só existem aqui).
