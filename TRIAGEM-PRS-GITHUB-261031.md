# TRIAGEM DE PRs - adm01-debug/Zapp_Web_V2
**Data:** 2026-10-31 - **Gerado por:** GitHub Copilot Coding Agent

---

## Secao 1 - Mapa Geral

| Categoria | Quantidade |
|-----------|-----------|
| **Total PRs abertas** | 99 |
| PRs Ready (nao-draft) | 81 |
| PRs Draft | 18 |
| MERGEABLE (sem conflito) | 40 |
| CONFLICTING | 59 |
| CI verde | 39 |
| CI vermelho | 60 |
| CI pendente | 0 |

**CI do main:** verde (ultimo run em 2026-10-31T17:39Z - success)

---

## Secao 2 - PRs Prontas para Merge Agora

> Criterio: **Ready** + **MERGEABLE** + **CI verde** - ordenadas da mais antiga para a mais nova

| # | PR | Titulo | Branch | Criada |
|---|-----|--------|--------|--------|
| 1 | [#2034](https://github.com/adm01-debug/Zapp_Web_V2/pull/2034) | fix(ci): GA02 + GA10 — guarda CLAUDE.md no CI e contrato de nomes do n... | `claude/fix-notify-names-ga10-ga02-261017-0900` | 2026-10-17 |
| 2 | [#2092](https://github.com/adm01-debug/Zapp_Web_V2/pull/2092) | fix(ci): types-sync job summary + gmail-cron-sync raw-500 (Z029+Z015p) | `claude/fix-z029-z015-summary-500-261018-1940` | 2026-10-18 |
| 3 | [#2075](https://github.com/adm01-debug/Zapp_Web_V2/pull/2075) | fix: aviso de desktop do War Room saía pelo caminho que exige Service ... | `fix/f1a-lote-b-usewarroomalerts` | 2026-10-18 |
| 4 | [#2071](https://github.com/adm01-debug/Zapp_Web_V2/pull/2071) | fix: remove hook morto useTalkXSuppression (TL-002) — 1 produto + 1 te... | `fix/f1a-lote-b-talkxsuppression-hook-morto` | 2026-10-18 |
| 5 | [#2046](https://github.com/adm01-debug/Zapp_Web_V2/pull/2046) | W45: pular test/build/security/e2e/db-guard em PR draft | `claude/w45-draft-fast-exit` | 2026-10-18 |
| 6 | [#2044](https://github.com/adm01-debug/Zapp_Web_V2/pull/2044) | ci(W39/W49/W50): playwright versao dinamica, VITE_* scoped, codeql dis... | `claude/w39-w49-w50-ci-cleanup` | 2026-10-18 |
| 7 | [#2042](https://github.com/adm01-debug/Zapp_Web_V2/pull/2042) | ci(W94+W32): talkx-status-regen concurrency + MIGRATIONS daily lote se... | `claude/w32-w94-migrations-concurrency` | 2026-10-18 |
| 8 | [#2100](https://github.com/adm01-debug/Zapp_Web_V2/pull/2100) | fix: GA09/GA62/GA75/GA92/GA98/GA100 — concurrency, codeql diário, endp... | `claude/fix-fase5-GA09-GA62-GA75-GA92-261019-1206` | 2026-10-19 |
| 9 | [#2232](https://github.com/adm01-debug/Zapp_Web_V2/pull/2232) | test(inbox): corrige seletor CSS do TtsButton — h-6.w-6 → h-8.w-8 [rou... | `claude/fix-unit-tests-ui-divergent-round2-261024-1541` | 2026-10-24 |
| 10 | [#2222](https://github.com/adm01-debug/Zapp_Web_V2/pull/2222) | fix(db): corrige TC-009 — aplica predecessora 20261006222024 antes da ... | `claude/fix-tc009-team-receipts-cid-261024-1730` | 2026-10-24 |
| 11 | [#2297](https://github.com/adm01-debug/Zapp_Web_V2/pull/2297) | feat: E70 — job 🦕 Edge contracts separado do node-scripts | `claude/feat-e70-edge-contracts-job-281028-0305` | 2026-10-28 |
| 12 | [#2286](https://github.com/adm01-debug/Zapp_Web_V2/pull/2286) | fix(edge-deploy): E09 — timestampBumped como evidência quando version ... | `claude/fix-stable-inventory-e09-261027-2359` | 2026-10-28 |
| 13 | [#2397](https://github.com/adm01-debug/Zapp_Web_V2/pull/2397) | Reset audit progress to new session baseline | `claude/dreamy-bardeen-m4odyv` | 2026-10-30 |
| 14 | [#2384](https://github.com/adm01-debug/Zapp_Web_V2/pull/2384) | fix(team-chat): accept emitted audit actions | `codex/teamchat-audit-action-contract-20261030` | 2026-10-30 |
| 15 | [#2450](https://github.com/adm01-debug/Zapp_Web_V2/pull/2450) | fix(db-migrate): use validated database URL | `codex/db-migrate-db-url-20261031` | 2026-10-31 |
| 16 | [#2430](https://github.com/adm01-debug/Zapp_Web_V2/pull/2430) | feat(talkx): adiciona p_segment_id à talkx_campaign_recipients_page (N... | `resolve-2190-from-main` | 2026-10-31 |
| 17 | [#2427](https://github.com/adm01-debug/Zapp_Web_V2/pull/2427) | feat(e2e): S3-024 migration GA11 — e2e_fixture_message RPC (resolve #2... | `resolve-2124-from-main` | 2026-10-31 |
| 18 | [#2425](https://github.com/adm01-debug/Zapp_Web_V2/pull/2425) | feat(search): S3-020 migration log_search_event RPC idempotente (20261... | `feat-codex-search-event-rpc-311031` | 2026-10-31 |
| 19 | [#2424](https://github.com/adm01-debug/Zapp_Web_V2/pull/2424) | feat(copilot): S3-019 migration colunas Fase 4 RADAR — CV-031/037-039 ... | `feat-cv031-brinde-intelligence-311031` | 2026-10-31 |
| 20 | [#2423](https://github.com/adm01-debug/Zapp_Web_V2/pull/2423) | feat(copilot): S3-018 migration merge_brinde_state RPC — CV-026 (20261... | `feat-cv021-copilot-live-helpers-311031` | 2026-10-31 |
| 21 | [#2420](https://github.com/adm01-debug/Zapp_Web_V2/pull/2420) | feat: DDL 7 tabelas copiloto RADAR fases 13-15 (CV-121–CV-150) | `feat-copiloto-fases13-15-ddl-v2-311031` | 2026-10-31 |
| 22 | [#2418](https://github.com/adm01-debug/Zapp_Web_V2/pull/2418) | docs: plano de correções e melhorias — 190 etapas (2026-10-19) | `claude/fix-plano-190-etapas-261019-1200` | 2026-10-31 |
| 23 | [#2414](https://github.com/adm01-debug/Zapp_Web_V2/pull/2414) | docs: Auditoria Supabase completa com 47 achados e propostas de correç... | `claude/festive-faraday-kv669k` | 2026-10-31 |

**Total: 23 PRs prontas para merge.**

---

## Secao 3 - PRs Bloqueadas por Conflito

> Total: **59 PRs** com CONFLICTING. Ordenadas por data de criacao.

| PR | Status | Titulo | Branch | Criada | CI | Recomendacao |
|----|--------|--------|--------|--------|-----|-------------|
| [#2095](https://github.com/adm01-debug/Zapp_Web_V2/pull/2095) | ready | fix(security): Z018+Z020 — external-db-proxy code-leak ... | `claude/fix-z017-z020-auth-cors-261018-1950` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2091](https://github.com/adm01-debug/Zapp_Web_V2/pull/2091) | ready | fix: timing-safe comparison em searchbox-budget-alert e... | `claude/fix-z011bc-timing-safe-261018-1855` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2088](https://github.com/adm01-debug/Zapp_Web_V2/pull/2088) | ready | fix: área segura mobile (safe-area-*) e rolagem sem bar... | `fix/f1a-lote-b-batch12` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2084](https://github.com/adm01-debug/Zapp_Web_V2/pull/2084) | ready | fix: Leaderboard não distinguia RPC caída de ranking va... | `fix/f1a-lote-b-batch7` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2082](https://github.com/adm01-debug/Zapp_Web_V2/pull/2082) | ready | fix: falha de leitura em useUserSettings ficava invisív... | `fix/f1a-lote-b-batch5` | 2026-10-18 | X_verde | rebase |
| [#2081](https://github.com/adm01-debug/Zapp_Web_V2/pull/2081) | ready | fix: contagem de whatsapp_connections lançava e derruba... | `fix/f1a-lote-b-batch4` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2080](https://github.com/adm01-debug/Zapp_Web_V2/pull/2080) | ready | fix: useTeamChatNotifications — canal recriado no volum... | `fix/f1a-lote-b-useteamchatnotifications` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2078](https://github.com/adm01-debug/Zapp_Web_V2/pull/2078) | ready | ci(F3): baseline strict=false — opção A sem fila serial | `f3/strict-false-baseline-20261018` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2074](https://github.com/adm01-debug/Zapp_Web_V2/pull/2074) | ready | fix: overlay de useScreenProtection sem role=alert/aria... | `fix/f1a-lote-b-hooks-misc-1` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2069](https://github.com/adm01-debug/Zapp_Web_V2/pull/2069) | ready | fix(test): mock de supabase sem .range()/.gte()/.lte() ... | `fix/f1a-lote-b-useadmindata-select` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2068](https://github.com/adm01-debug/Zapp_Web_V2/pull/2068) | ready | fix(test): mock de useAdminData sem AUDIT_PAGE_SIZE/MIN... | `fix/f1a-lote-b-admin-audit-page-size` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2067](https://github.com/adm01-debug/Zapp_Web_V2/pull/2067) | ready | fix(test): 2 mocks locais incompletos — 1 arquivo (lote... | `fix/f1a-logger-ttsvoice-mock-arquivos-conversa-20261018` | 2026-10-18 | X_verde | rebase |
| [#2066](https://github.com/adm01-debug/Zapp_Web_V2/pull/2066) | ready | fix: useAudioMemes sobe chave solta no bucket com polic... | `fix/f1a-lote-b-audiomemes-storage-path` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2063](https://github.com/adm01-debug/Zapp_Web_V2/pull/2063) | ready | fix(test): useAuth sem AuthProvider no teste — 2 arquiv... | `fix/f1a-lote-b-authprovider` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2059](https://github.com/adm01-debug/Zapp_Web_V2/pull/2059) | ready | fix(test): ConnectionCard — handleDisconnectDialogOpenC... | `fix/f1a-lote-b-connectioncard-dialog` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2058](https://github.com/adm01-debug/Zapp_Web_V2/pull/2058) | ready | fix(test): mock de @/lib/logger sem createLogger — 9 ar... | `fix/f1a-lote-b-main` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2051](https://github.com/adm01-debug/Zapp_Web_V2/pull/2051) | ready | ci(W85/W86/W87): OpenSSF Scorecard semanal + dependency... | `claude/w85-w86-w87-ossf-scorecard` | 2026-10-18 | X_vermelho | rebase + fix CI |
| [#2113](https://github.com/adm01-debug/Zapp_Web_V2/pull/2113) | draft | fix(evolution-api): remover set-presence, find-chats e ... | `claude/fix-evolution-go-gaps-d6-261019-1548` | 2026-10-19 | X_vermelho | rebase + fix CI |
| [#2111](https://github.com/adm01-debug/Zapp_Web_V2/pull/2111) | ready | fix(types): narrowar reason_code em useTalkXSuppression... | `claude/fix-typecheck-suppression-261019-1342` | 2026-10-19 | X_vermelho | rebase + fix CI |
| [#2107](https://github.com/adm01-debug/Zapp_Web_V2/pull/2107) | ready | docs(g9): absorver planos de docs ausentes da main — E2... | `claude/docs-g9-absorb-261019-1300` | 2026-10-19 | X_vermelho | rebase + fix CI |
| [#2097](https://github.com/adm01-debug/Zapp_Web_V2/pull/2097) | ready | fix: corrige falhas pré-existentes nos Unit Tests (useK... | `claude/fix-unit-tests-main-261019-1500` | 2026-10-19 | X_vermelho | rebase + fix CI |
| [#2152](https://github.com/adm01-debug/Zapp_Web_V2/pull/2152) | ready | test(e2e): spec de toque 44px volta ao verde com seleto... | `claude/test-toque44-seletores-261021-0853` | 2026-10-21 | X_vermelho | rebase + fix CI |
| [#2148](https://github.com/adm01-debug/Zapp_Web_V2/pull/2148) | ready | test(e2e): destrava specs deslogados de Contatos com bo... | `claude/test-e2e-contatos-fab-261021-0819` | 2026-10-21 | X_vermelho | rebase + fix CI |
| [#2147](https://github.com/adm01-debug/Zapp_Web_V2/pull/2147) | ready | fix(db-audit): guard n011 com teto dinamico por dominio... | `claude/fix-n011-dinamico-261021-0759` | 2026-10-21 | X_verde | rebase |
| [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185) | ready | docs(pendencias): §8 RESOLVIDO + §9 inventário de workf... | `claude/kind-gates-87mwoe` | 2026-10-22 | X_verde | rebase |
| [#2208](https://github.com/adm01-debug/Zapp_Web_V2/pull/2208) | ready | fix(types): named SuppressionReasonCode type export | `claude/fix-typecheck-suppression-261023-2230` | 2026-10-23 | X_vermelho | rebase + fix CI |
| [#2206](https://github.com/adm01-debug/Zapp_Web_V2/pull/2206) | draft | fix(ci): adiciona copilot_feedback a known-violations p... | `claude/fix-known-violations-copilot-feedback-261023-2035` | 2026-10-23 | X_vermelho | rebase + fix CI |
| [#2200](https://github.com/adm01-debug/Zapp_Web_V2/pull/2200) | ready | analise: dossiê branch hermes/telefonia-contrato-dados-... | `claude/dazzling-cannon-j7iw08` | 2026-10-23 | X_verde | rebase |
| [#2196](https://github.com/adm01-debug/Zapp_Web_V2/pull/2196) | ready | feat: TalkX editor de templates e artefatos gerados (di... | `claude/dia-2026-10-19-ct011-hmac-talkx-artefatos-231023` | 2026-10-23 | X_vermelho | rebase + fix CI |
| [#2238](https://github.com/adm01-debug/Zapp_Web_V2/pull/2238) | ready | feat(message-delivery): carimbo do POST iniciado (PD-79... | `claude/feat-message-delivery-post-iniciado-261024-1719` | 2026-10-24 | X_vermelho | rebase + fix CI |
| [#2233](https://github.com/adm01-debug/Zapp_Web_V2/pull/2233) | ready | fix: corrige 3 falhas de Vitest (SL-070, HZ5-09, a11y T... | `claude/fix-ci-tests-batch2-2610-1830` | 2026-10-24 | X_vermelho | rebase + fix CI |
| [#2228](https://github.com/adm01-debug/Zapp_Web_V2/pull/2228) | ready | fix(tests): corrige falha mecânica de mock em useAdminD... | `claude/fix-unit-tests-mechanical-261024-1527` | 2026-10-24 | X_vermelho | rebase + fix CI |
| [#2226](https://github.com/adm01-debug/Zapp_Web_V2/pull/2226) | ready | fix(db-guard): corrige assertion B.0c no TC-009 — backf... | `claude/fix-db-guard-b0c-261024-1527` | 2026-10-24 | X_vermelho | rebase + fix CI |
| [#2255](https://github.com/adm01-debug/Zapp_Web_V2/pull/2255) | ready | chore: auditoria Supabase — relatório e progresso finai... | `claude/chore-auditoria-supabase-final-251025-1655` | 2026-10-25 | X_verde | rebase |
| [#2249](https://github.com/adm01-debug/Zapp_Web_V2/pull/2249) | draft | fix: 3 falhas de testes unitários (HighContrastToggle, ... | `claude/fix-testes-unitarios-minimo-251025-1230` | 2026-10-25 | X_vermelho | rebase + fix CI |
| [#2245](https://github.com/adm01-debug/Zapp_Web_V2/pull/2245) | draft | fix(talkx): corrige 4.007 falhas/30d do cron talkx-sche... | `claude/fix-talkx-cron-startup-timeout-261025-1700` | 2026-10-25 | X_vermelho | rebase + fix CI |
| [#2277](https://github.com/adm01-debug/Zapp_Web_V2/pull/2277) | ready | chore(db): GOAL backend — classifica 17 tabelas RLS + d... | `claude_04/clever-ramanujan-xllbpo` | 2026-10-27 | X_verde | rebase |
| [#2354](https://github.com/adm01-debug/Zapp_Web_V2/pull/2354) | ready | fix: corrigir 3 workflows com falha no CI (auto-update-... | `claude/keen-galileo-dxai3p` | 2026-10-29 | X_verde | rebase |
| [#2396](https://github.com/adm01-debug/Zapp_Web_V2/pull/2396) | ready | docs(resgate): dossiê hermes/telefonia + plano de coord... | `claude/trusting-albattani-9x3ipg` | 2026-10-30 | X_verde | rebase |
| [#2372](https://github.com/adm01-debug/Zapp_Web_V2/pull/2372) | ready | chore: PENDENCIAS.md e RELATORIO_CI_FINAL.md — workflow... | `claude/fix-ci-workflows-261030-0830` | 2026-10-30 | X_verde | rebase |
| [#2447](https://github.com/adm01-debug/Zapp_Web_V2/pull/2447) | ready | docs(ci): RELATORIO_CI.md e PENDENCIAS.md — estado real... | `fix/ci-workflows` | 2026-10-31 | X_verde | rebase |
| [#2446](https://github.com/adm01-debug/Zapp_Web_V2/pull/2446) | draft | fix(ci): restaura workflows CI F1b — 4 arquivos (S1, 20... | `fix/ci-f1b-restaura-workflows-20261018` | 2026-10-31 | X_vermelho | rebase + fix CI |
| [#2445](https://github.com/adm01-debug/Zapp_Web_V2/pull/2445) | draft | fix(ci): ci-workflows-vermelhos — mega-branch 325 arqui... | `fix/ci-workflows-vermelhos` | 2026-10-31 | X_vermelho | rebase + fix CI |
| [#2444](https://github.com/adm01-debug/Zapp_Web_V2/pull/2444) | draft | fix(ci): ci-verde — 46 arquivos (S1, conflito) | `fix/ci-verde-261021` | 2026-10-31 | X_vermelho | rebase + fix CI |
| [#2443](https://github.com/adm01-debug/Zapp_Web_V2/pull/2443) | draft | fix(ci): fix-failed-workflows — 45 arquivos (S2, confli... | `codex/fix-failed-workflows-20261020` | 2026-10-31 | X_vermelho | rebase + fix CI |
| [#2442](https://github.com/adm01-debug/Zapp_Web_V2/pull/2442) | draft | feat(codex): publish-followup — 59 arquivos (S2, confli... | `codex/publish-followup-20261021` | 2026-10-31 | X_verde | rebase |
| [#2441](https://github.com/adm01-debug/Zapp_Web_V2/pull/2441) | draft | fix(types): tipos RPC ausentes — S3 types-rpc-ausentes-... | `fix/types-rpc-ausentes-261025` | 2026-10-31 | X_vermelho | rebase + fix CI |
| [#2440](https://github.com/adm01-debug/Zapp_Web_V2/pull/2440) | draft | fix(test): lote F1a useAdminData createUser/avatar — co... | `fix/f1a-lote-b-useadmindata-createuser-avatar` | 2026-10-31 | X_vermelho | rebase + fix CI |
| [#2439](https://github.com/adm01-debug/Zapp_Web_V2/pull/2439) | draft | fix(test): lote F1a talkxsegments — corrige testes Talk... | `fix/f1a-lote-b-talkxsegments` | 2026-10-31 | X_vermelho | rebase + fix CI |
| [#2438](https://github.com/adm01-debug/Zapp_Web_V2/pull/2438) | draft | fix(test): lote F1a realtime-channel-mock — corrige moc... | `fix/f1a-lote-b-realtime-channel-mock` | 2026-10-31 | X_vermelho | rebase + fix CI |
| [#2437](https://github.com/adm01-debug/Zapp_Web_V2/pull/2437) | draft | fix(test): lote F1a batch6 — corrige testes unitários C... | `fix/f1a-lote-b-batch6` | 2026-10-31 | X_vermelho | rebase + fix CI |
| [#2436](https://github.com/adm01-debug/Zapp_Web_V2/pull/2436) | draft | fix(test): lote F1a batch2 — corrige testes unitários C... | `fix/f1a-lote-b-batch2` | 2026-10-31 | X_vermelho | rebase + fix CI |
| [#2435](https://github.com/adm01-debug/Zapp_Web_V2/pull/2435) | draft | fix(test): lote F1a batch10 — corrige testes unitários ... | `fix/f1a-lote-b-batch10` | 2026-10-31 | X_vermelho | rebase + fix CI |
| [#2434](https://github.com/adm01-debug/Zapp_Web_V2/pull/2434) | draft | fix(test): mock framer-motion VoiceChangerPicker — lote... | `fix/f1a-framer-motion-mock-voicechangerpicker-20261018` | 2026-10-31 | X_vermelho | rebase + fix CI |
| [#2429](https://github.com/adm01-debug/Zapp_Web_V2/pull/2429) | ready | docs(analise): dossiês lote 4 — BR-031..BR-055 (25 bran... | `claude/br-dossies-lote4-261031` | 2026-10-31 | X_vermelho | rebase + fix CI |
| [#2426](https://github.com/adm01-debug/Zapp_Web_V2/pull/2426) | ready | fix(ci): corrigir timeout do branch-hygiene-audit e bas... | `claude/hopeful-knuth-4brqti` | 2026-10-31 | X_verde | rebase |
| [#2415](https://github.com/adm01-debug/Zapp_Web_V2/pull/2415) | ready | docs(br): dossiês lote 2 — 5 branches analisadas (2 COB... | `claude/br-dossies-lote2-261031` | 2026-10-31 | X_verde | rebase |
| [#2413](https://github.com/adm01-debug/Zapp_Web_V2/pull/2413) | ready | docs(br): dossiês lote 1 — 3 branches analisadas (2 SUP... | `claude/br-dossies-lote1-261031` | 2026-10-31 | X_verde | rebase |
| [#2412](https://github.com/adm01-debug/Zapp_Web_V2/pull/2412) | ready | fix(ci): deno install --frozen=false + @types/node no d... | `claude/fix-deploy-deno-frozen-v2` | 2026-10-31 | X_verde | rebase |

---

## Secao 4 - PRs Draft Notaveis

> As mais relevantes/arriscadas entre as 18 drafts.

| PR | Titulo | Branch | Criada | Mergeable | CI |
|----|--------|--------|--------|-----------|----|
| [#2265](https://github.com/adm01-debug/Zapp_Web_V2/pull/2265) | fix: revoga grants de escrita do anon em public (CRITICAL-1) | `claude/fix-revogar-grants-escrita-anon-261025-2115` | 2026-10-25 | MERGEABLE | X_vermelho |
| [#2445](https://github.com/adm01-debug/Zapp_Web_V2/pull/2445) | fix(ci): ci-workflows-vermelhos — mega-branch 325 arquivos (S1) | `fix/ci-workflows-vermelhos` | 2026-10-31 | CONFLICTING | X_vermelho |
| [#2444](https://github.com/adm01-debug/Zapp_Web_V2/pull/2444) | fix(ci): ci-verde — 46 arquivos (S1, conflito) | `fix/ci-verde-261021` | 2026-10-31 | CONFLICTING | X_vermelho |
| [#2443](https://github.com/adm01-debug/Zapp_Web_V2/pull/2443) | fix(ci): fix-failed-workflows — 45 arquivos (S2, conflito) | `codex/fix-failed-workflows-20261020` | 2026-10-31 | CONFLICTING | X_vermelho |
| [#2442](https://github.com/adm01-debug/Zapp_Web_V2/pull/2442) | feat(codex): publish-followup — 59 arquivos (S2, conflito alto) | `codex/publish-followup-20261021` | 2026-10-31 | CONFLICTING | X_verde |
| [#2441](https://github.com/adm01-debug/Zapp_Web_V2/pull/2441) | fix(types): tipos RPC ausentes — S3 types-rpc-ausentes-261025 | `fix/types-rpc-ausentes-261025` | 2026-10-31 | CONFLICTING | X_vermelho |

### AVISO: Mega-branch #2445
- Branch `fix/ci-workflows-vermelhos` com **325 arquivos** - maior PR do repositorio
- Status: **CONFLICTING + draft + CI vermelho**
- Risco: merge direto gerara conflito massivo. Avaliar se foi absorvido por outras branches; se sim, fechar.

### CRITICO: PR #2265 - CRITICAL-1 (seguranca)
- Revoga grants de escrita do `anon` em public
- Status: MERGEABLE + Draft - DDL sensivel, requer revisao manual antes de mergear

---

## Secao 5 - PRs Antigas Paradas (>7 dias)

> PRs **ready** abertas antes de 24/out/2026 - possivel trabalho abandonado. Total: **42 PRs**

| PR | Titulo | Criada | Mergeable | CI |
|----|--------|--------|-----------|-----|
| [#1930](https://github.com/adm01-debug/Zapp_Web_V2/pull/1930) | feat(db-audit): W21 — check-migration-drift --classificar: 4 c... | 2026-10-14 | MERGEABLE | X_vermelho |
| [#1997](https://github.com/adm01-debug/Zapp_Web_V2/pull/1997) | feat: CV-010–020 — Fase 2 RADAR copilot (migrations + feature ... | 2026-10-16 | MERGEABLE | X_vermelho |
| [#2034](https://github.com/adm01-debug/Zapp_Web_V2/pull/2034) | fix(ci): GA02 + GA10 — guarda CLAUDE.md no CI e contrato de no... | 2026-10-17 | MERGEABLE | X_verde |
| [#2095](https://github.com/adm01-debug/Zapp_Web_V2/pull/2095) | fix(security): Z018+Z020 — external-db-proxy code-leak em 502,... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2092](https://github.com/adm01-debug/Zapp_Web_V2/pull/2092) | fix(ci): types-sync job summary + gmail-cron-sync raw-500 (Z02... | 2026-10-18 | MERGEABLE | X_verde |
| [#2091](https://github.com/adm01-debug/Zapp_Web_V2/pull/2091) | fix: timing-safe comparison em searchbox-budget-alert e whatsa... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2088](https://github.com/adm01-debug/Zapp_Web_V2/pull/2088) | fix: área segura mobile (safe-area-*) e rolagem sem barra (scr... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2086](https://github.com/adm01-debug/Zapp_Web_V2/pull/2086) | fix: botão de remover atendente do QueueCard sem nome exato e ... | 2026-10-18 | MERGEABLE | X_vermelho |
| [#2084](https://github.com/adm01-debug/Zapp_Web_V2/pull/2084) | fix: Leaderboard não distinguia RPC caída de ranking vazio — 1... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2082](https://github.com/adm01-debug/Zapp_Web_V2/pull/2082) | fix: falha de leitura em useUserSettings ficava invisível (C-1... | 2026-10-18 | CONFLICTING | X_verde |
| [#2081](https://github.com/adm01-debug/Zapp_Web_V2/pull/2081) | fix: contagem de whatsapp_connections lançava e derrubava toda... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2080](https://github.com/adm01-debug/Zapp_Web_V2/pull/2080) | fix: useTeamChatNotifications — canal recriado no volume + avi... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2078](https://github.com/adm01-debug/Zapp_Web_V2/pull/2078) | ci(F3): baseline strict=false — opção A sem fila serial | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2075](https://github.com/adm01-debug/Zapp_Web_V2/pull/2075) | fix: aviso de desktop do War Room saía pelo caminho que exige ... | 2026-10-18 | MERGEABLE | X_verde |
| [#2074](https://github.com/adm01-debug/Zapp_Web_V2/pull/2074) | fix: overlay de useScreenProtection sem role=alert/aria-live —... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2071](https://github.com/adm01-debug/Zapp_Web_V2/pull/2071) | fix: remove hook morto useTalkXSuppression (TL-002) — 1 produt... | 2026-10-18 | MERGEABLE | X_verde |
| [#2069](https://github.com/adm01-debug/Zapp_Web_V2/pull/2069) | fix(test): mock de supabase sem .range()/.gte()/.lte() em useA... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2068](https://github.com/adm01-debug/Zapp_Web_V2/pull/2068) | fix(test): mock de useAdminData sem AUDIT_PAGE_SIZE/MIN_PASSWO... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2067](https://github.com/adm01-debug/Zapp_Web_V2/pull/2067) | fix(test): 2 mocks locais incompletos — 1 arquivo (lote F1a) | 2026-10-18 | CONFLICTING | X_verde |
| [#2066](https://github.com/adm01-debug/Zapp_Web_V2/pull/2066) | fix: useAudioMemes sobe chave solta no bucket com policy por p... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2064](https://github.com/adm01-debug/Zapp_Web_V2/pull/2064) | fix(test): mock de supabase.channel incompleto — 1 arquivo (lo... | 2026-10-18 | MERGEABLE | X_vermelho |
| [#2063](https://github.com/adm01-debug/Zapp_Web_V2/pull/2063) | fix(test): useAuth sem AuthProvider no teste — 2 arquivos (lot... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2059](https://github.com/adm01-debug/Zapp_Web_V2/pull/2059) | fix(test): ConnectionCard — handleDisconnectDialogOpenChange i... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2058](https://github.com/adm01-debug/Zapp_Web_V2/pull/2058) | fix(test): mock de @/lib/logger sem createLogger — 9 arquivos ... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2051](https://github.com/adm01-debug/Zapp_Web_V2/pull/2051) | ci(W85/W86/W87): OpenSSF Scorecard semanal + dependency-review... | 2026-10-18 | CONFLICTING | X_vermelho |
| [#2046](https://github.com/adm01-debug/Zapp_Web_V2/pull/2046) | W45: pular test/build/security/e2e/db-guard em PR draft | 2026-10-18 | MERGEABLE | X_verde |
| [#2044](https://github.com/adm01-debug/Zapp_Web_V2/pull/2044) | ci(W39/W49/W50): playwright versao dinamica, VITE_* scoped, co... | 2026-10-18 | MERGEABLE | X_verde |
| [#2042](https://github.com/adm01-debug/Zapp_Web_V2/pull/2042) | ci(W94+W32): talkx-status-regen concurrency + MIGRATIONS daily... | 2026-10-18 | MERGEABLE | X_verde |
| [#2111](https://github.com/adm01-debug/Zapp_Web_V2/pull/2111) | fix(types): narrowar reason_code em useTalkXSuppression para u... | 2026-10-19 | CONFLICTING | X_vermelho |
| [#2107](https://github.com/adm01-debug/Zapp_Web_V2/pull/2107) | docs(g9): absorver planos de docs ausentes da main — E274 | 2026-10-19 | CONFLICTING | X_vermelho |
| [#2100](https://github.com/adm01-debug/Zapp_Web_V2/pull/2100) | fix: GA09/GA62/GA75/GA92/GA98/GA100 — concurrency, codeql diár... | 2026-10-19 | MERGEABLE | X_verde |
| [#2097](https://github.com/adm01-debug/Zapp_Web_V2/pull/2097) | fix: corrige falhas pré-existentes nos Unit Tests (useKnowledg... | 2026-10-19 | CONFLICTING | X_vermelho |
| [#2137](https://github.com/adm01-debug/Zapp_Web_V2/pull/2137) | fix(db): recria canonicamente as policies de receipt do team c... | 2026-10-20 | MERGEABLE | X_vermelho |
| [#2152](https://github.com/adm01-debug/Zapp_Web_V2/pull/2152) | test(e2e): spec de toque 44px volta ao verde com seletores do ... | 2026-10-21 | CONFLICTING | X_vermelho |
| [#2148](https://github.com/adm01-debug/Zapp_Web_V2/pull/2148) | test(e2e): destrava specs deslogados de Contatos com boot e he... | 2026-10-21 | CONFLICTING | X_vermelho |
| [#2147](https://github.com/adm01-debug/Zapp_Web_V2/pull/2147) | fix(db-audit): guard n011 com teto dinamico por dominio e cano... | 2026-10-21 | CONFLICTING | X_verde |
| [#2146](https://github.com/adm01-debug/Zapp_Web_V2/pull/2146) | feat(team-chat): TeamChatView seleciona conversa via ?cid= (re... | 2026-10-21 | MERGEABLE | X_vermelho |
| [#2186](https://github.com/adm01-debug/Zapp_Web_V2/pull/2186) | fix(security): auditoria Supabase 2026-10-22 — department_invi... | 2026-10-22 | MERGEABLE | X_vermelho |
| [#2185](https://github.com/adm01-debug/Zapp_Web_V2/pull/2185) | docs(pendencias): §8 RESOLVIDO + §9 inventário de workflows da... | 2026-10-22 | CONFLICTING | X_verde |
| [#2208](https://github.com/adm01-debug/Zapp_Web_V2/pull/2208) | fix(types): named SuppressionReasonCode type export | 2026-10-23 | CONFLICTING | X_vermelho |
| [#2200](https://github.com/adm01-debug/Zapp_Web_V2/pull/2200) | analise: dossiê branch hermes/telefonia-contrato-dados-2609261... | 2026-10-23 | CONFLICTING | X_verde |
| [#2196](https://github.com/adm01-debug/Zapp_Web_V2/pull/2196) | feat: TalkX editor de templates e artefatos gerados (dia/2026-... | 2026-10-23 | CONFLICTING | X_vermelho |

---

## Resumo Executivo

- **23 PRs prontas para merge agora** (ready + MERGEABLE + CI verde)
- **59 PRs com conflito** - precisam de rebase antes de qualquer merge
- **60 PRs com CI vermelho** - incluindo varias MERGEABLE que precisam de fix de CI
- **42 PRs ready abertas mais de 7 dias** - avaliar se ainda relevantes
- **CI do main: verde** - seguro mergear
- **Mega-branch #2445 (325 arquivos)**: risco critico, tratar separado

---
*Relatorio gerado automaticamente em 2026-10-31 - Sem merge, sem fechamento - somente leitura.*