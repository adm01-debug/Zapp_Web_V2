# Zapp Web V2 — Auditoria de histórico declarado (06/09/2026)

**Repo:** `zapp-web-v2-main` | **HEAD:** `c117efb` | **HANDOFF score declarado:** 10/10
**Agentes:** 5 paralelos (fan-out) | **Duração total:** 461s

---

## O que estava realmente verde

| Domínio | Status real |
|---------|-------------|
| Testes (2.525 + 167 contracts) | ✅ 158 test files, todos passam |
| Build Vite | ✅ exit 0 em 7.54s |
| Segurança: IDOR QR/instance | ✅ `is_admin_or_supervisor(auth.uid())` confirmado |
| Segurança: Webhook ACL dead-letter | ✅ service_role only |
| Segurança: normalizePhone LIDs | ✅ `@lid` → null, ≥14 dígitos sem DDI → null |
| Segurança: credenciais hardcoded | ✅ JWTs em types.ts são truncados (não reais) |
| Segurança: funções mortas | ✅ 4 funções dropadas, zero invocações residuais |
| Segurança: TLS CA pin | ✅ fingerprint versionado e auditável |
| E08 upsert ignoreDuplicates | ✅ 5 handlers com constraint `(whatsapp_connection_id, external_id, sender)` |
| `ux_messages_dedup` parcial→não-parcial | ✅ migration 20260901100002 correta |
| resolveBestJid prioridade | ✅ não prioriza dígitos-LID |
| Orphan creation stop | ✅ guards antes de criar stub |
| `contact_identity_map` | ✅ PK em `lid`, índice em `jid`, RLS supervisor_read |
| Virtualizer ChatPanel | ✅ `measureElement` via ResizeObserver + `getItemKey` por `message.id` |
| `useRef<T>()` sem tipo | ✅ zero residuais |
| `useEvolutionApi` 5 sub-hooks | ✅ barrel re-export correto |
| ErrorBoundary shim (BUG-1/ARCH-1) | ✅ named import `ComponentType`, shim deprecated |
| BUG-5 `import.meta.env.DEV` | ✅ confirmado |
| BUG-6/7 `useAuth` try/catch/finally | ✅ `fetchingRef` reset antes de `fetchProfile` |
| BUG-8 `ProtectedRoute` useEffect | ✅ dep em `user?.id` |
| BUG-2 vite.config `drop:['debugger']` | ✅ `console.error` preservado |

---

## Gaps encontrados (código real diverge do HANDOFF)

### 🔴 Crítico

**GAP-1: 133 erros TypeScript** (`exit 1`)
- Causa: Supabase retorna `string | null`, código espera `string` — null-safety drift acumulado
- Arquivos: 79 arquivos, incluíndo `App.tsx`, `services/contact.service.ts`, `services/role.service.ts`, `lib/audit.ts`, dezenas de hooks
- Tipos principais: TS2322/TS2345

**GAP-2: 884 lint errors** (`exit 1`, total 1.112 problemas)
- Causa principal: `@typescript-eslint/no-explicit-any` em Edge Functions (`supabase/functions/`)
- Secundário: `@typescript-eslint/no-require-imports` em `tailwind.config.ts`
- 9 deles auto-fixáveis com `--fix`

**GAP-3: Race condition em `auto_assign_to_queue_agent`**
- Migration `20260901200001`: usa `FOR UPDATE` sem `SKIP LOCKED`
- Sob carga concorrente (múltiplos webhooks simultâneos), agentes bloqueiam uns aos outros
- Correção: `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1`

### 🟠 Médio

**GAP-4: BUG-10 client.ts parcialmente corrigido**
- `detectSessionInUrl: true` ✅
- Env vars: **não há validação runtime** — se `VITE_SUPABASE_URL` for undefined, crash opaco

**GAP-5: Realtime publication — contagem errada no HANDOFF**
- HANDOFF declara "50 → 36 → 24 tabelas"
- Contagem real via migrations: **~30 tabelas**
- `evolution_webhook_events_wpp2` aparece só em comentários de migration, nunca em `DROP TABLE FROM PUBLICATION` — ou seja, **nunca foi removida** da publication

**GAP-6: Avatar inconsistente (3 componentes)**
- `VirtualizedRealtimeList.tsx`: `w-12 h-12` (48px) ✅
- `ConversationList.tsx`: `w-11 h-11` (44px) ❌
- `ForwardMessageDialog.tsx`: `w-10 h-10` (40px) ❌
- Commit 5570bc9 corrigiu apenas 1 dos 3 componentes de lista

**GAP-7: Performance budget não-enforçado**
- `performance-budget.json` declara `largest-chunk: 200 kB`
- Build real: `vendor-maps` = 1.87 MB (9x acima), `vendor-pdf` = 465 kB, `vendor-ui` = 458 kB
- O budget **não é verificado no CI** — arquivo ornamental

**GAP-8: Zero migrations com rollback**
- Migrations 20260902100001-4: DROP INDEX, CHECK CONSTRAINT, UPDATE backfill, ALTER FUNCTION
- Nenhuma documenta reversão; nenhuma usa `BEGIN/COMMIT` explícito

### 🟡 Baixo

**GAP-9: `getContactByPhone` race de `connection_id`**
- Ao encontrar contato por número, atualiza `connection_id` sem filtro de empresa
- Dois webhooks de conexões diferentes para o mesmo número causam thrashing

**GAP-10: Zero testes para ChatPanel/virtualizer**
- `ChatPanelHeader.test.tsx` existe (só o header)
- `ChatMessagesArea.tsx` (componente do fix f668828) sem cobertura
- 5 sub-hooks do Evolution API sem testes

**GAP-11: `main.tsx:12` condição sempre-true (TS2774)**
- Função comparada como objeto em vez de chamada

---

## Plano de ação priorizado

| P | Gap | Esforço | Impacto |
|---|-----|---------|--------|
| P1 | 133 erros TypeScript (null-safety) | M | Bloqueia CI rigoroso |
| P1 | Race condition SKIP LOCKED na fila | P | Corrupção de assign |
| P2 | 884 lint errors (Edge Functions `any`) | M | Code quality |
| P2 | Avatar inconsistente (3 componentes) | P | UX drift |
| P2 | Confirmar estado real da publication no banco | P | Performance |
| P3 | BUG-10 client.ts env validation | P | DX/debug |
| P3 | Performance budget enforçado no CI | P | Regressão |
| P3 | Testes ChatPanel + sub-hooks Evolution | G | Cobertura |
| P4 | Rollback nas migrations | M | Operational safety |
| P4 | `getContactByPhone` race de connection_id | M | Consistência |

---

## Observações de operação do fan-out

- Agente 2 (DB) falhou com HTTP 503 em provider sobrecarregado — não conseguiu conectar via MCP Supabase. Análise ficou baseada em leitura estática dos arquivos SQL de migration.
- Agentes 4 e 5 começaram a falhar com `cd: wsl.localhost...` por falta de `workdir`. Steer corrigiu, mas resultados de build/test do agente 5 ficaram incompletos (rodados diretamente pelo líder em paralelo para compensar).
- Sempre passar `workdir='/home/joaquim_ataides/projetos/<repo>'` explicitamente no contexto de cada subagente. Ver secção "Subagentes WSL" no SKILL.md principal.
