# Dossiê — claude/fix-codex-findings-161016-1906 (PR #2770)

- Ref: `origin/claude/fix-codex-findings-161016-1906` · tip `f6b3e105e` · merge-base `f66d7331` (2026-10-16) · 25 commits, último 2026-11-07.
- Propósito: lote de correções de achados do Codex para deixar a CI verde em 16/10/2026 — baselines (typecheck, known-violations, realtime), regex de contract tests, timeout do typecheck, `--shm-size` nos Postgres descartáveis, guarda `Number.isInteger` na janela do Talk X, `isProgrammaticScrollRef` no ChatMessagesArea, contornos de lint/mock (logger lazy, eslint-disable), renomeação "Mais convertidos" → "Melhor resposta".
- Veredito: **PERDIDA_PARCIAL** (tudo de valor alto/médio já está na main ou foi superado; sobram 4 lacunas de valor baixo, nenhuma necessária para o negócio). Triagem anterior (2026-11-08): OBSOLETA.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência (origin/main) |
|---|---|---|
| `.github/workflows/ci.yml` | LACUNA baixo — branch sobe `timeout-minutes` do typecheck 15→30; main mantém 15 | `ci.yml:41 timeout-minutes: 15`; main reduziu 30→15 de propósito em `5721e4f50` (CI mínimo 16/10). Necessidade do 30 NÃO VERIFICADA (main verde em 14/11, `b24e31500`). |
| `scripts/ci/typecheck-baseline.json` | OBSOLETA — main tem baseline próprio regenerado (schemaVersion 2, 93 issues) | `git show origin/main:scripts/ci/typecheck-baseline.json` (93 `"line"`); linha faltante é só uma coordenada divergente |
| `scripts/ci/workflow-contracts.unit.mjs` | INCORPORADA (outra forma) — E98 tolera paths vazio; E67 ignora linha comentada | `workflow-contracts.unit.mjs:137-138` (`if (trechoPaths.length === 0) return;`), `:444` (`!l.trimStart().startsWith('#')`). `KEY_CACHE_BUN` main mantém `\s*$` (`:408`) e CI passa — a remoção do `$` não é necessária |
| `scripts/db-audit/ai-projection-version-guard.test.mjs` | LACUNA baixo — `--shm-size 256m` ausente | `ai-projection-version-guard.test.mjs:191` sem shm; `git grep shm-size origin/main -- scripts/db-audit .github` = 0 hits; 6 testes na main fazem `docker run` sem shm e CI verde |
| `scripts/db-audit/talkx-engine-window-contract.test.mjs` | LACUNA baixo — idem `--shm-size` | `talkx-engine-window-contract.test.mjs:124-125` |
| `scripts/db-audit/consolidar-veredito.mjs` | OBSOLETA — branch removia `live-invariants` alegando "sem step no YAML"; main TEM o step e teste que exige o registro | `db-live-guard.yml:234 id: live-invariants`, `:240 ... tee /tmp/step-live-invariants.log`; `scripts/ci/workflow-invariants.unit.mjs:271-280`; `consolidar-veredito.mjs:42,63` |
| `scripts/db-audit/known-violations.json` | OBSOLETA — branch adicionava 28 exceções; main zerou `known: []` (catálogo regenerado do banco vivo) | `known-violations.json` main `"known": []` desde `b24e31500` (2026-11-14); 0 hits para as 28 chaves |
| `scripts/db-audit/migration-evidence.json` | INCORPORADA — 0 linhas faltando | line_check `missing_in_main: 0` |
| `scripts/db-audit/n011-storage-policies-dedup.test.mjs` | OBSOLETA — main reescreveu o teste por outra abordagem (replay limpo + drifted) que já contempla `avatars authenticated read` | main `:1-17` (cabeçalho), `:230 AVATAR_SELECT_VIGENTE = 'avatars authenticated read'`; commit `4b9585052` (2026-10-21) |
| `scripts/db-audit/realtime-publication-baseline.json` | OBSOLETA — `audio_memes`/`audio_meme_favorites` já na main; `audit_logs` foi REMOVIDA de propósito e não está na publicação em produção | main (JSON 1 linha) contém `public.audio_meme_favorites`,`public.audio_memes`; `587ec25f8` removeu `public.audit_logs`; `pg_publication_tables` (tnnnlkbymytvtqngbbqh) devolve só `audio_meme_favorites`,`audio_memes` |
| `scripts/db-audit/talkx-schedule-timezone-contract.test.mjs` | INCORPORADA (outra forma) — regex aceita imports extras; `\_shared` escapado | `:37 /import \{ DEFAULT_SCHEDULE_TIMEZONE, deliveryWindowStatus, parseBusinessHours[^}]* \} .../`, `:77 \_shared`; `talkx-send/index.ts:9` importa `parseDndHours, type DndSetting` e o teste passa |
| `src/components/inbox/VirtualizedRealtimeList.tsx` | OBSOLETA — main aceita o aviso via `eslint-baseline.json` em vez de `eslint-disable` | `scripts/ci/eslint-baseline.json:440,3904-3912` |
| `src/components/inbox/chat/ChatMessagesArea.tsx` | INCORPORADA — `isProgrammaticScrollRef` + guarda no `handleScroll` + set no `scrollToMessage` | `ChatMessagesArea.tsx:125,131-133,319` |
| `src/components/talkx/TalkXTemplates.tsx` | OBSOLETA (copy) — main mantém "Mais convertidos" por spec T04-039 e teste | `TalkXTemplates.tsx:357`; `__tests__/TalkXTemplatesRail.test.tsx:130,139,151`; `useTalkXTemplatesConversion.ts:4`. Renomear é decisão de produto nova, não resgate |
| `src/hooks/system/useOfflineCache.ts` | LACUNA baixo — inicializador lazy do `useState` (evita setState em effect + 1 render) | main `:5 const log`, `:63 useState(null)` + effect `:80-86`; aviso aceito em `eslint-baseline.json:1020,7194`. Motivo original era contorno de mock do Vitest |
| `src/hooks/tasks/workItemAggregates.ts` | NENHUM — troca `̀-ͯ` por caracteres combinantes literais (mesma semântica, menos legível; artefato) | main `:102` mantém escapes |
| `src/lib/invokeEdge.ts` | NENHUM — logger lazy só para contornar mock do Vitest; main verde com `const log` de módulo | `invokeEdge.ts:36`; `0912c408a` (motivo: "falha de mock no Vitest") |
| `supabase/functions/_shared/talkx-window.ts` | INCORPORADA — main tem superconjunto (`=== null` E `!Number.isInteger`) | `talkx-window.ts:329` |

## Lacunas a recuperar (todas valor baixo; portar só se a CI acusar)

### 1. `--shm-size 256m` nos Postgres descartáveis (robustez de CI; não há sinal de falha na main)
`scripts/db-audit/ai-projection-version-guard.test.mjs` (linha 191 na main):
```diff
-    docker(['run', '--rm', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=test_only', 'postgres:17-alpine']);
+    docker(['run', '--rm', '-d', '--name', CONTAINER, '--shm-size', '256m', '-e', 'POSTGRES_PASSWORD=test_only', 'postgres:17-alpine']);
```
`scripts/db-audit/talkx-engine-window-contract.test.mjs` (linha 124 na main):
```diff
     'run', '--rm', '-d', '--name', CONTAINER,
+    '--shm-size', '256m',
     '-e', 'POSTGRES_PASSWORD=test_only', IMAGE,
```
Se portar, aplicar também nos outros 4 testes da main que fazem `docker run` (ledger-postapply-query, psql-environment, sla-first-response-delivery-contract, sla-granular-contract).

### 2. `useOfflineCache.ts` — inicializador lazy (remove 1 entrada do eslint-baseline e um render extra)
```diff
-  const [cachedData, setCachedData] = useState<ConversationWithMessages[] | null>(null);
+  const [cachedData, setCachedData] = useState<ConversationWithMessages[] | null>(() => {
+    const cached = readCache();
+    if (cached) log.info(`Loaded ${cached.length} conversations from offline cache`);
+    return cached;
+  });
...
-  // Load cache on mount
-  useEffect(() => {
-    const cached = readCache();
-    if (cached) {
-      setCachedData(cached);
-      log.info(`Loaded ${cached.length} conversations from offline cache`);
-    }
-  }, []);
```
(Manter o `const log` de módulo da main; o `getLogger()` inline da branch era contorno de mock.) Ao portar, remover a entrada correspondente de `scripts/ci/eslint-baseline.json:1020/7194` (ratchet).

### 3. `ci.yml` typecheck `timeout-minutes: 30` — só se o job voltar a estourar 15 min (main reduziu de propósito em `5721e4f50`).

### 4. Renomear "Mais convertidos" → "Melhor resposta" (TalkXTemplates.tsx:357) — decisão de produto; contraria spec T04-039 + teste `TalkXTemplatesRail.test.tsx`. Não portar sem o dono pedir.

## apagar_branch_seguro
false — sobram 3 hunks não presentes na main (shm-size ×2, useOfflineCache lazy init) sem prova de que sejam desnecessários; todos estão colados acima, então a branch pode ser apagada após este dossiê ser aceito como registro.

## Verificação adversarial

Parecer: **CONCORDO** com `PERDIDA_PARCIAL`. Tentei refutar por dois lados (main já cobre tudo → OBSOLETA; ou há lacuna ≥ média não listada) e nenhum se sustentou. `origin/main` em `dac285f62`. Diff tem 18 arquivos (`git diff f66d7331 origin/claude/fix-codex-findings-161016-1906 --name-status`) — todos auditados, nenhum fora do dossiê.

Lacunas confirmadas como AUSENTES da main (não foram removidas de propósito, e as APIs que usam existem):
- `git grep -n shm-size origin/main -- scripts .github` → único hit é `scripts/e2e-isolated/network-proof.mjs:227`; `scripts/db-audit/ai-projection-version-guard.test.mjs:191` e `scripts/db-audit/talkx-engine-window-contract.test.mjs:123-125` seguem sem `--shm-size`. Nunca existiu na main (não há remoção a reverter). Valor baixo: sem sinal de falha.
- `.github/workflows/ci.yml:41` na main = `timeout-minutes: 15`; o hunk da branch é exatamente `15 → 30` no job `typecheck`. Correção factual ao dossiê: `5721e4f50` não reduziu 30→15 — ele reescreveu o `ci.yml` do CI mínimo e, no job que virou `typecheck`, trocou `20 → 15` (`git show 5721e4f50 -- .github/workflows/ci.yml`, linhas 124-125 do diff). A conclusão não muda: o 15 é deliberado e o 30 só se justifica se o job estourar.
- `src/hooks/system/useOfflineCache.ts:63` main = `useState(...)(null)` + effect `:80-86`; o aviso correspondente está aceito em `scripts/ci/eslint-baseline.json:7194,7202` ("Calling setState synchronously within an effect"). Lacuna real, valor baixo→médio-baixo (paga 1 entrada do ratchet + 1 render; o cache passa a existir no 1º render para quem abre offline). Mantenho **baixo**: não há bug de negócio.
- `src/components/talkx/TalkXTemplates.tsx` — o hunk é só copy (`title="Mais convertidos"` → `"Melhor resposta"` + 2 comentários). Main tem `TalkXTemplates.tsx:357` e teste vivo em `__tests__/TalkXTemplatesRail.test.tsx:130,139,151`, mais `useTalkXTemplates.ts:86` e `useTalkXTemplatesConversion.ts:4` citando a spec T04-039. Portar QUEBRA teste da main → não é lacuna de resgate; é pedido de produto. (Inconsistência menor do dossiê: a tabela marca OBSOLETA e a lista de lacunas repete como "lacuna baixo". Fica como decisão do dono, não como resgate.)

Refutações que falharam (main cobre, com prova):
- `supabase/functions/_shared/talkx-window.ts:329` (main): `if (start === null || !Number.isInteger(start) || end === null || !Number.isInteger(end) || ...)` — superconjunto do hunk.
- `src/components/inbox/chat/ChatMessagesArea.tsx:124-133` e `:319` (main): `isProgrammaticScrollRef` criado, lido/zerado em `handleScroll` (`if (!nearBottom && !wasProgrammatic) …cancelScroll()`) e setado em `scrollToMessage`. Incorporada.
- `scripts/ci/workflow-contracts.unit.mjs:137-138` (main): `if (trechoPaths.length === 0) return;` cobre o `if (trechoPaths.length > 0)` da branch; `:444` usa `!l.trimStart().startsWith('#')` no lugar do `!/^\s*#/` da branch. Sobre a remoção do `\s*$` em `KEY_CACHE_BUN` (`:408`): as 14 ocorrências de `key: bun-${{ hashFiles('bun.lock') }}` na main (`git grep -n "key: bun-" origin/main -- .github/workflows`) terminam na própria chave, logo a âncora `$` casa — remover o `$` só afrouxa o contrato. Não é lacuna.
- `scripts/db-audit/known-violations.json` (main): `known` é lista **vazia** (0 itens, lido com `json.load`). A branch adiciona 33 exceções; reintroduzi-las afrouxaria o ratchet já zerado. OBSOLETA, não lacuna.
- `scripts/db-audit/realtime-publication-baseline.json` (main) já lista `public.audio_meme_favorites` e `public.audio_memes`; `public.audit_logs` não está — e não está na publicação de produção. Só `audit_logs` separava branch e main. OBSOLETA.
- `scripts/db-audit/consolidar-veredito.mjs`: a branch REMOVE `live-invariants`; main tem o step (`db-live-guard.yml:234,240`) e teste que o exige (`workflow-invariants.unit.mjs:271-285`). Portar quebraria a CI. OBSOLETA (bom que não foi portada).
- `scripts/db-audit/n011-storage-policies-dedup.test.mjs`: main reescrito (replay limpo + drifted + idempotência, 9 testes; `:29,230-231,247-324`). Cobre o mesmo contrato da branch por outra via. OBSOLETA.
- `scripts/db-audit/talkx-schedule-timezone-contract.test.mjs:37` (main): regex já com `parseBusinessHours[^}]* \}` e `\_shared` escapado. Incorporada.
- `scripts/ci/typecheck-baseline.json` / `migration-evidence.json`: baselines regenerados na main (`missing_in_main` 1 e 0 — coordenada divergente). Sem conteúdo a resgatar.
- `src/components/inbox/VirtualizedRealtimeList.tsx`: main aceita o aviso via `eslint-baseline.json:440,3904-3918` em vez de `eslint-disable` inline. Equivalente.
- `src/hooks/tasks/workItemAggregates.ts` e `src/lib/invokeEdge.ts`: hunks trocam escapes Unicode por caracteres combinantes literais e logger de módulo por inline (contorno de mock). Mesma semântica, pior legibilidade. Nenhum valor.

`apagar_branch_seguro`: mantenho **false** enquanto as 3 lacunas técnicas (shm-size ×2, lazy init) não forem portadas ou descartadas pelo dono — os diffs estão colados no dossiê, então o risco de perda é baixo, mas a branch é a única cópia versionada.
