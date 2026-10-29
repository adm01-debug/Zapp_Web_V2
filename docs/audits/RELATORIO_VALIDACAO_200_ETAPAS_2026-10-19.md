# Validação exaustiva do PLANO de auditoria (Z001–Z200) — medido em 2026-10-19

- Base medida: `origin/main` (oloog do workspace em `.tmp/`).
- Método: 8 subagentes em 2 levas + verificação direta do executor nos pontos
  divergentes (`playwright.config.ts`, `ci.yml`, `e2e/`, workflows).
- Status dos branches do plano: **0 PRs `(ZNNN)` mergeados**; 4 branches
  `claude/*zNNN*` de 18/10 continuam **não mergeados** (Z011/Z012 só existem em
  `fix-z011bc-timing-safe-261018-1855`; Z018/Z019 só em `fix-z017-z020-auth-cors-261018-1950`).

## Placar geral (200/200 classificadas)

| Fase                                           | Etapas  | Implementado | Parcial      | Não impl.       | [JOAQUIM]    |
| ---------------------------------------------- | ------- | ------------ | ------------ | --------------- | ------------ |
| FASE 0 — Segurança/borda (Z001–Z020)           | 20      | 8            | 4            | 8               | 0            |
| FASE 1+2 — Portão+banco (Z021–Z065)            | 45      | 6            | 6            | 33              | 0            |
| FASE 3 — Migrations/ledger (Z066–Z085)         | 20      | 12           | 2            | 6               | 0            |
| FASE 4 — Edge functions (Z086–Z110)            | 25      | 0            | 5            | 20              | 0            |
| FASE 5 — Frontend (Z111–Z135)                  | 25      | 3            | 5            | 17              | 0            |
| FASES 6–9 — E2E/CI/proc/docs/fecho (Z136–Z200) | 65      | 11           | 12           | 39              | 3            |
| **TOTAL**                                      | **200** | **40 (20%)** | **34 (17%)** | **123 (61,5%)** | **3 (1,5%)** |

## Correções aplicadas sobre os relatórios dos subagentes (com prova)

1. **Z084 IMPLEMENTADO → PARCIAL.** O subagente marcou implementado, mas Z139
   (outro subagente) prova `SUPABASE_SERVICE_ROLE_KEY` ainda presente em
   `e2e-logado.yml:252-260`. As duas marcas não podem coexistir.
2. **Z145 NÃO → IMPLEMENTADO.** Alegado "zero E2E em PR", mas o job `e2e`
   (`.github/workflows/ci.yml:249`, gatilho `pull_request`, sem `if` restritivo)
   roda `test:e2e` com 10 projetos deslogados (`ci.yml:305`). Escopo deslogado é
   restrição deliberada de secrets (comentário em `ci.yml:299-303`).
3. **Z146 NÃO → PARCIAL.** Alegados "10 projetos órfãos"; medido: 28 projetos no
   config, 3 nunca invocados em nenhum workflow (`chromium-onboarding-dispensar`,
   `chromium-multiplix-responsivo`, `chromium-tarefas-linha-de-base`); destes, 2
   também excluídos do catch-all → nunca rodam.
4. **Z147 → PARCIAL** (faltava classificar). `chromium-a11y` roda no PR, mas
   `a11y-inbox-teams` e `a11y-tarefas-dashboard` estão em **0** `testMatch`
   (grep retorna vazio) e caem no catch-all `chromium` sem o mock que esperam.
5. **Z148 → PARCIAL** (faltava classificar). 3 projetos `email-navy` rodam no PR,
   mas o `testIgnore` do catch-all (`playwright.config.ts:137`) **não** exclui
   `email-navy-visual.spec.ts` → roda também com sessão real.
6. **Z143/Z197:** "21 skips" corrigido para **51** ocorrências
   (`it.skip|test.skip|test.fixme|it.fixme` em `e2e/`, medido via `git grep`).
7. **Contagens internas:** FASE 4 tem 20 NÃO (não 18 — `Z087–Z091, Z093–Z094,
Z096, Z098–Z109` = 5+2+1+12); FASE 5 vale por linhas (I3/P5/N17);
   FASES 6–9 valem por linhas (I10/P9/N41/J3 antes das correções 2–5).
8. **FASE 1+2 — linhas reescritas (erro meu, corrigido):** a primeira versão
   trazia Z021 como N, Z022 como P, Z036 como I e Z059 como P. O correto,
   conforme `.tmp/validacao-fase1-fase2.md`: I = Z022, Z023, Z027, Z028, Z032,
   Z059; P = Z021, Z024, Z030, Z036, Z060, Z061; N = demais (33). Totais
   inalterados (I6/P6/N33).

## FASE 0 (Z001–Z020): I8 / P4 / N8

| Z    | St  | Evidência                                                                 |
| ---- | --- | ------------------------------------------------------------------------- |
| Z001 | P   | revokes anon existem (3 migrations) mas sem confirmação runtime           |
| Z002 | I   | `20260903260000_revoke_unnecessary_anon_grants.sql` aplica REVOKE         |
| Z003 | N   | sem teste de regressão de grants anon                                     |
| Z004 | I   | `generate-manifest.mjs:43` `--check`/stale                                |
| Z005 | I   | `validation.ts:359` `ctx` com default                                     |
| Z006 | I   | `validation.ts:473` `rateLimitLogWriter`                                  |
| Z007 | P   | try em 3 edges; `csp-report:98`, `talkx-link:137/186` fora (fail-open)    |
| Z008 | N   | `talkx_suppress_contact` fora de try/catch (opt-out fail-open ausente)    |
| Z009 | I   | `ci.yml:449-454` deno check                                               |
| Z010 | I   | `deploy-functions.yml` deno gate                                          |
| Z011 | N   | timingSafe só no branch `fix-z011bc` (n/ mergeado)                        |
| Z012 | N   | idem whatsapp-webhook                                                     |
| Z013 | P   | máscara parcial `substring(0,6)+'***'`, sem função dedicada               |
| Z014 | N   | sem máscara CPF/tel dedicada                                              |
| Z015 | P   | `internalErrorResponse` em 2 edges; `evolution-api/index.ts:1207` direto  |
| Z016 | I   | `requireAuth` em `validation.ts:493`                                      |
| Z017 | N   | `webhook-diagnostic`, `get-sip-password` sem requireAuth/isAllowedOrigin  |
| Z018 | N   | `external-db-bridge` sem internalErrorResponse (só no branch n/ mergeado) |
| Z019 | N   | `external-db-proxy` sem catch internalErrorResponse                       |
| Z020 | I   | `cors-origins.ts:28-31` localhost gateado                                 |

## FASE 1+2 (Z021–Z065): I6 / P6 / N33

> Fonte: `.tmp/validacao-fase1-fase2.md` (reescrita em 2026-10-19 após erro de
> transcrição da primeira versão — ver item 8 das Correções).

| Z | St | Evidência |
|---|---|---|
| Z021 | P | baseline afirma strict/enforce_admins/6 checks; decisão Joaquim pendente |
| Z022 | I | `c41f5e5737` sql-sha256 nas 51 pinned-replay; drift exit 0 |
| Z023 | I | sem duplicatas de versão; `f0b5b7cd26` confirma |
| Z024 | P | branch desafixa playwright; main ainda tem 4 `bunx playwright@1.63.0` |
| Z025, Z026 | N | sem split blocking/informative; 8 contratos não reescritos |
| Z027 | I | 0 `test.skip` em `scripts/ci/*.unit.mjs` |
| Z028 | I | `9bf8014e40` mock getLogger |
| Z029 | N | sem motivo do gate types-sync no Job Summary |
| Z030 | P | `settings-guard.yml` vazio em main; scripts existem (605+485 linhas) |
| Z031 | N | baseline afirma proteção divergente da API real |
| Z032 | I | `db-guard.yml:62` `--health-cmd pg_isready` |
| Z033–Z035 | N | ci.yml sem CODEOWNERS; sem agregadores unit/e2e-logado |
| Z036 | P | 935 CREATE POLICY sem TO inventariadas, sem correção |
| Z037–Z041 | N | sem correção policies sem TO (auth-only/service_role/anon/escrita/resto) |
| Z042–Z046 | N | sem inventário/correção 100 UPDATE sem WITH CHECK |
| Z047–Z049 | N | SECURITY DEFINER sem search_path em 3 migrations |
| Z050 | N | DO block dinâmico em pg_proc, sem função estática |
| Z051, Z052 | N | sem guard offline p/ DEFINER novo (search_path / REVOKE PUBLIC) |
| Z053–Z055 | N | comentário pg_temp incorreto; grants-baseline só anon_table_select, de 04/10 |
| Z056 | N | `f18bed48f0` (REVOKE anon) fora da main |
| Z057, Z058 | N | GRANT ALL talkx_settings sem lint; 9 tabelas RLS-sem-policy s/ doc |
| Z059 | I | `check-mcp-exec-acl.sql` (381 linhas) em `db-guard.yml:248` |
| Z060, Z061 | P | lockout não confirmado; 7 FORCE RLS sem registro formal |
| Z062–Z065 | N | sem medição/drop/criação/padronização de índices |

## FASE 3 (Z066–Z085): I12 / P2 / N6

| Z    | St  | Evidência                                                                |
| ---- | --- | ------------------------------------------------------------------------ |
| Z066 | N   | sem `reserve_migration_version`/`migration_version_reservations`         |
| Z067 | N   | drift sem classificar "apply pendente" × "drift"                         |
| Z068 | I   | `ATOMIC_DELIVERY_BUNDLE` em `db-migrate.yml:195`                         |
| Z069 | I   | `schema-catalog.json` + `schema-manifest.json` com `generated_at`        |
| Z070 | N   | `scripts/db-audit/evidence/` com 0 arquivos                              |
| Z071 | I   | `migration-evidence.json` com 51+9+2 exceptions justificadas             |
| Z072 | I   | `_superseded/` (7 SQL+README) e `_foreign/` versionados                  |
| Z073 | I   | `known-violations.json` com 5 entradas                                   |
| Z074 | I   | `supabase-usage-guard.mjs:196,222` cutoff forward-only                   |
| Z075 | N   | `reconcile-local-replay.mjs` não existe                                  |
| Z076 | I   | `sql-lexer.mjs` (96 linhas)                                              |
| Z077 | I   | 51 `pinned-replay` com `file_sha256`+`ledger_*_sha256`                   |
| Z078 | P   | diff de baseline só no `types-sync.yml`, não no `db-guard.yml`           |
| Z079 | I   | `types-sync.yml:228-303` falha com `::error::` se schema mudou           |
| Z080 | N   | `check-remocoes-destrutivas.mjs` sem proteção de tabelas `_rb_`          |
| Z081 | N   | reconciliações pontuais ainda em `scripts/db-audit/`                     |
| Z082 | I   | `ledger-history-limitations.json` com `historical_content_proven: false` |
| Z083 | I   | `db-migrate.yml:255` roda `run-runtime-contract.mjs`                     |
| Z084 | P   | E2E usa chave local, mas service-role ainda presente (ver Z139)          |
| Z085 | I   | 12 contratos em `scripts/db-audit/contracts/` validados no CI            |

## FASE 4 (Z086–Z110): I0 / P5 / N20

| Z    | St  | Evidência                                                            |
| ---- | --- | -------------------------------------------------------------------- |
| Z086 | P   | manifest versionado mas CI só `--check`, não regenera                |
| Z087 | N   | CI só roda `*.unit.mjs`; zero teste de edge no CI                    |
| Z088 | N   | `_shared/http.ts` não existe (só `AbortSignal.timeout` isolados)     |
| Z089 | N   | 9 fn ElevenLabs sem timeout (`elevenlabs-tts:52` etc.)               |
| Z090 | N   | 5 fn Gmail sem timeout (`gmail-send:49` etc.)                        |
| Z091 | N   | 10 fn Resend sem timeout (`send-email:104` etc.)                     |
| Z092 | P   | 429 retenta, mas sem `Retry-After` + tudo vira 200 `{error:true}`    |
| Z093 | N   | `_shared/resend.ts` não existe (7 impl. à mão)                       |
| Z094 | N   | `_shared/elevenlabs.ts` não existe (`xi-api-key` ×9)                 |
| Z095 | P   | `resolveInstanceToken` unificado, mas webhook tem cache próprio      |
| Z096 | N   | `ZAPP_BUILD_ID` nunca setado no deploy (`status:26` lê `unknown`)    |
| Z097 | P   | `?? ''` em segredos espalhado (5 arquivos)                           |
| Z098 | N   | proxy esconde status real (200 `{error:true}` ×6 pontos)             |
| Z099 | N   | breaker/rate-limit por isolate (`Map` em `validation.ts:269`)        |
| Z100 | N   | máquina de estados Evolution sem função pura/testes                  |
| Z101 | N   | sem `stripSecrets()` única (2 pontos — vetor do 4º vazamento)        |
| Z102 | N   | "testar entrega" sem token → 401 sempre                              |
| Z103 | N   | rotas GO com `subscribe:['ALL']` fixo                                |
| Z104 | N   | ~25 rotas passthrough + `set-evoai` 404 disfarçado                   |
| Z105 | N   | `toUserJid` manda 14+ dígitos p/ `@lid`                              |
| Z106 | N   | webhook sem HMAC/IP allowlist                                        |
| Z107 | N   | shadow sem expiração                                                 |
| Z108 | N   | 140 linhas mortas de shadow-log sem chamadores                       |
| Z109 | N   | redirect sem allowlist https (`talkx-link:148`)                      |
| Z110 | P   | órfãs listadas, mas allowlist cita `sicoob-bridge` inexistente no FS |

## FASE 5 (Z111–Z135): I3 / P5 / N17

| Z          | St  | Evidência                                                                           |
| ---------- | --- | ----------------------------------------------------------------------------------- |
| Z111       | I   | `icon-button.tsx:44-73` label→aria-label                                            |
| Z112       | N   | zero regras jsx-a11y no eslint                                                      |
| Z113, Z114 | N   | 65 `<button>` restantes × 11 IconButton usages                                      |
| Z115       | I   | 3 specs cobrem default/light/high-contrast                                          |
| Z116, Z117 | P   | 7 fixed colors + 9 `bg-primary text-white` restantes                                |
| Z118       | P   | FE-04 (`as unknown as any`), FE-09 (`campaign!.id`), FE-11 (`find()!`), 14 `as any` |
| Z119       | N   | `src/lib/queryKeys.ts` não existe                                                   |
| Z120–Z122  | N   | 25+5 literal keys; só team-chat migrado                                             |
| Z123       | P   | `useRealtimeInbox` exporta function, não type                                       |
| Z124       | N   | sem `mutationCache.onError`; 164 useMutation sem onError                            |
| Z125       | N   | sem QueryBoundary; 8 useQuery sem error boundary                                    |
| Z126       | N   | `JSON.stringify` em queryKey ×3                                                     |
| Z127       | N   | blacklist com paging client-side                                                    |
| Z128       | I   | `fetchAllRows` em 3 módulos                                                         |
| Z129–Z131  | N   | `useCampaignEditor.ts` 1112 linhas/47 useState — não decomposto                     |
| Z132       | N   | `catalogShared.tsx` 1065 linhas/40 exports — não decomposto                         |
| Z133       | N   | sem virtualização nas listas                                                        |
| Z134       | P   | inbox object prop não memoizado                                                     |
| Z135       | N   | 3 keys sem userId                                                                   |

## FASES 6–9 (Z136–Z200): I11 / P12 / N39 / J3

E2E: Z136 P, Z137 P, Z138 N (20 sleeps), Z139 P (service-role ainda no YAML),
Z140 N (sem environment), Z141 N (sem banco local), Z142 N (sem falha explícita),
Z143 N (**51** skips medidos), Z144 N (tour autoanulável), Z145 **I** (E2E
deslogado em PR — `ci.yml:249-305`), Z146 **P** (3 órfãos medidos, não 10),
Z147 **P** (2 specs a11y em 0 testMatch, caem no catch-all),
Z148 **P** (email-navy roda em PR mas também no catch-all com sessão real).
Guards: Z149 I, Z150 I, Z151 I, Z152 N (sem eslint no CI), Z153 I, Z154 N
(`audit --low`, CodeQL sem filtro), Z155 I, Z156 N (arquivo inexistente),
Z157 N (12 guards órfãos sem inventário).
Cobertura: Z158 I, Z159 P, Z160 P.
Processo: Z161 N (130 `it.fails`), Z162–Z164 N, Z165–Z170 N, Z171 **[JOAQUIM]**,
Z172–Z174 N, Z175 **[JOAQUIM]**.
Docs: Z176 I, Z177 I, Z178 P, Z179–Z182 N, Z183 I, Z184–Z190 N.
Fecho: Z191 N, Z192 P, Z193 N, Z194 I, Z195 N, Z196 P, Z197 P (0 skip em
unit, 51 em e2e), Z198 N, Z199 N (conserto-de-conserto 77% > 40%),
Z200 **[JOAQUIM]**.

## [JOAQUIM] — 3 etapas exigem decisão humana (não executáveis por agente)

Z171, Z175, Z200 (portador/decisão de negócio — ver plano original).

## Top 10 gaps por risco (opinião do executor)

1. Z106/Z107/Z101 — webhook Evolution sem HMAC/IP + shadow sem expirar + sem
   `stripSecrets()` (4º vazamento veio daqui).
2. Z003/Z193 — REVOKE feito (Z002) mas sem teste que trave regressão.
3. Z025/Z026 — sem `db-live-guard` nem teste anti-bypass (guard só offline).
4. Z096 — `ZAPP_BUILD_ID` nunca injetado: impossível saber o que está em prod.
5. Z098 — proxy devolve 200 em tudo: monitor externo não vê falha.
6. Z008 — opt-out TalkX fail-open ausente (risco LGPD em supressão).
7. Z140/Z141 — E2E logado sem environment e sem banco local.
8. Z037–Z058 — 22 etapas de endurecimento de banco zeradas (12/12 NÃO).
9. Z011/Z012/Z018 + Z022/Z024 — correções prontas em branches não mergeados.
10. Z199 — conserto-de-conserto 77% (processo gerando retrabalho).
