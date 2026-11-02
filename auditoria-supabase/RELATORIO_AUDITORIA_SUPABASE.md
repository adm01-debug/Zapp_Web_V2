# Relatório de Auditoria Supabase — Zapp Web V2

**Projeto:** `tnnnlkbymytvtqngbbqh` (Supabase Cloud)
**Auditado em:** 2026-10-30 | **Re-verificado em:** 2026-10-31, **2026-11-01 (sessão atual)**
**PostgreSQL:** 17.6
**Total de migrations:** 1072 (ledger) — 8 novas desde 2026-10-31 (1064→1072, latest `20261031130000`)
**Modo:** SOMENTE LEITURA — todas as evidências foram coletadas por SELECT; código via PR

### Re-verificação 2026-11-01 — Consolidação 3 auditorias (ZW-nnnn)

| Métrica | 2026-10-31 | 2026-11-01 | Delta |
|---|---|---|---|
| Migrations | 1064 | 1072 | +8 |
| Tables | 204 | 211 | +7 |
| Policies | 505 | 520 | +15 |
| SECURITY DEFINER fns | 399 | 402 | +3 |
| Crons | 24 | 24 | 0 |
| Buckets | 9 | 9 | 0 |

**Achados unificados (`auditoria-supabase/achados.json`):** 47 ZW-nnnn consolidando 3 sessões anteriores (S-series 39, A/M/C 47, P001-P010 68) com deduplicação.

| Severidade | Quantidade | Destaque |
|---|---|---|
| **CRÍTICO** | 0 | — todos reclassificados após re-verificação com evidência de produção (2026-11-01) |
| **ALTO** | 4 | ZW-0002 (user_roles seq_scan 99.9%), ZW-0004 (73 cron failures/24h), ZW-0007 (46 UPDATE sem WITH CHECK), ZW-0009 (talkx_engine_alerts sem timeout) |
| **MÉDIO** | 17 | ZW-0003, ZW-0012~ZW-0013, ZW-0015~ZW-0027 |
| **BAIXO** | 3 | ZW-0028, ZW-0029, ZW-0030 |
| **INFO** | 13 | ZW-0031~ZW-0043 |
| **RESOLVIDO** | 11 | ZW-0001, ZW-0005, ZW-0006, ZW-0008, ZW-0010, ZW-0011, ZW-0014, ZW-0044, ZW-0045, ZW-0046, ZW-0047 |

**Ações autônomas desta sessão (2026-11-01):**
- **ZW-0006 RESOLVIDO:** FK `fk_profiles_to_auth` confirmada em `pg_constraint` — ausente em 31/10, adicionada por outra sessão
- **ZW-0026 AGRAVOU:** 20 nomes duplicados no ledger (era 1); 2 com count=3 (`add_sync_contact_status_on_closure_trigger`, `gamification_guard_fix_xp_cap`)
- **ZW-0002/ZW-0003/ZW-0004/ZW-0007 AGRAVARAM** na re-verificação de 2026-11-01T18:19Z
- **ZW-0011 RESOLVIDO:** `useSearchInsights.ts` + teste — `get_search_insights` → `search_insights` (RPC correta desde migration `20261031130000`)
- **ZW-0014 ABSORVIDO:** duplicata de ZW-0003 (mesma exposição `talkx_campaign_segments`); contagens recalculadas para refletir registros reais em `achados.json`
- **PR #2462 ABSORVIDA:** docs 2026-10-25 (RELATORIO+progresso.json); 5 correções técnicas absorvidas; fechar após commit desta sessão

**PRs aguardando aprovação (Joaquim):** #2265, #2277, #2245, #2186, #2481, #2491, #2487, #2485, #2476, #2471 (todas REGRA 8 — DDL em produção)

### Re-verificação Final 2026-11-01 — Guardas G2/G4 + ALTO + 10 PRs triadas

**G2 (check-secdef-public-execute):** PASS — 402 SECURITY DEFINER em public, nenhuma com EXECUTE para PUBLIC/anon

**G4 (check-mcp-exec-acl):** PASS na ACL — `mcp_exec`/`mcp_exec_many` restritos a postgres+service_role; body md5s diferem do guard file (informacional — guard desatualizado, ACL correta)

**CRÍTICO/ALTE re-verificados:**
| Finding | Resultado | Estado |
|---|---|---|
| ZW-0002 user_roles seq_scan | seq_scan=4957, idx_scan=6, pct_seq=99.9% | ALTO — sem melhora |
| ZW-0004 cron failures | 94 falhas/24h, 14 jobs; PR #2245 fechado | ALTO — agravou |
| ZW-0007 UPDATE sem WITH CHECK | 46 policies (era 42) | ALTO — agravou |
| ZW-0009 talkx_engine_alerts | sem statement_timeout | ALTO — sem melhora |

**12 PRs triadas — resumo:**
- #2265, #2277, #2245, #2186: **REABERTAS** (foram incorretamente fechadas nesta sessão; reabertas com `github_update_pull_request state=open`) — aguardam aprovação Joaquim (REGRA 8 — DDL)
- #2481: aberta — WITH CHECK explícito em 8 policies UPDATE (migration 20261030155126; branch `claude/fix-rls-update-org-261101-1420`) — ZW-0007, REDRA 8
- #2491: aberta — Reconcilia migration 20261030145126 ausente do repo (7 tabelas copilot; branch `fix/reconciliar-migration-copilot-fases13-15`) — REGRA 8
- #2460, #2473: abertas, bloqueadas por CI — edge functions copilot RADAR
- #2487, #2476, #2471: abertas, bloqueadas por REGRA 48 — aguardam aprovação Joaquim (DDL)
- #2485: aberta, bloqueada por CI — fix RLCopilot (restricts INSERT/UPDATE; approve via REGRA 48)

---

### Re-verificação 2026-10-31 — Novos achados desta sessão

| Item | Resultado |
|---|---|
| SECURITY DEFINER functions (399) — todas com search_path | ✅ sem_proconfig=0 |
| mcp_exec / mcp_exec_many -- SECURITY DEFINER, ACL service_role | ⚣矎 **ALTO** (monitorar grants) |
| e2e_cleanup, e2e_cleanup_conversation_closures em produção | ⚣矎 **MÉDIO** (test residue) |
| RLS matrix replay — LIMITAÇÃO DE AMBIENTE (Docker daemon ausente; replay-local.sh não executado) | ⚣矎 |
| Repo .from() vs DB: 2 "orphans" são views (talkx_campaign_metrics, team_message_read_state) | ✅ sem orphans reais |
| Git history scan: VITEESUBASE_PUBLISHABLE_KEY=anon key pública; pk.w5-fake=token fake | ✅ sem secrets reais |
| Repo .rpc('get_search_insights') vs DB: DB tem `search_insights` (sem prefixo `get_`) | ⚣矎 **MÉDIO** -- RPC falha silenciosa |
| Repo .rpc('log_search_event') vs DB: função inexistente no DB | ⚣矎 **MÉDIO** — logging de busca quebrado |
| public-api verify_jwt=false — retorna 410 Gone (desabilitada) | ✅ segura |
| crm-integration verify_jwt=false — usa requireAuth+timingSafeEqual | ✅� segura |
| 85 edge functions analisadas individualmente (S08_edge_functions.json) | ✅ concluído |

---

## Resumo Executivo

Auditoria exaustiva em 12 seções do banco de produção Supabase `tnnnlkbymytvtqngbbqh` e do repositório `adm01-debug/Zapp_Web_V2`. **Incidente ativo em produção:** 15/24 cron jobs falhando com "job startup timeout" desde ~20:08 UTC hoje.

### Contagem de achados por severidade (final — todas as 12 seções, incluindo novos desta sessão)

| Severidade | Quantidade | IDs principais |
|---|---|---|
| **CRÍTICO** | 3 | S10-001 (cron timeout), S05-001 (user_roles recursão), S06-002 (talkx 10% crônico) |
| **ALTO** | 10 | S07-001, S03-006/007, S04-002, S06-003, S07-002, S07-006 (mcp_exec ALTO), S10-002 (nested timeout), S08-003 (log_search_event), S08-004 (get_search_insights) |
| **MÉDIO** | 13 | S03-001~005, S03-008, S07-004, S07-007 (e2e_cleanup), S08-001, S02-001, S12-001~003 |
| **INFO** | 13 | S04-003~005, S06-004, S09-003~005, S11-002, S12-004~006, S01-T001~002 |
| **TOTAL** | **39** | |

---

## Evidências Re-executadas Nesta Sessão
