# claude__loving-lovelace-esc3l2 (PR #2186) — OBSOLETA

- Ref: `origin/claude/loving-lovelace-esc3l2` · tip `bc79d33b5` · merge_base `78fe258e7` (2026-10-31) · 43 commits (2026-10-22 → 2026-11-01)
- Pré-classificação mecânica: MISTO_CONFLITO · 76 arquivos com lacuna · 5.271 linhas
- Veredito: **OBSOLETA** — toda lacuna foi (a) absorvida na main em forma consolidada ou (b) substituída de propósito por implementação melhor, já aplicada em produção. `apagar_branch_seguro = true`.

## Propósito
Auditoria exaustiva do Supabase de produção (`tnnnlkbymytvtqngbbqh`), em 12 seções (S1–S12), com:
1. diretório `auditoria-supabase/` (relatório + inventário + propostas SQL + roteiros de teste RLS) — 62 arquivos novos;
2. 3 migrations corrigindo achados de segurança/LGPD;
3. correções colaterais em `src/` (MediaMigrationTool → service, mocks de teste, setup.ts).

## Achado-chave: a main já consolidou formalmente esta auditoria
`git show origin/main:auditoria-supabase/achados.json` → `_meta.fontes` lista literalmente:

```
"sessao-2026-10-31 (39 achados S01-S12)",
"PR #2414 (47 achados A/M/C)",
"PR #2186 (68 achados P001-P010)",   <-- esta branch
```

E `origin/main:auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` (linhas 1–30, auditado 2026-10-30, re-verificado 2026-11-01 e 2026-11-08) diz:
> "**Achados unificados (`auditoria-supabase/achados.json`):** 47 ZW-nnnn consolidando 3 sessões anteriores (S-series 39, A/M/C 47, **P001-P010 68**) com deduplicação."

Ou seja: o conteúdo intelectual dos 62 arquivos de `auditoria-supabase/` desta branch foi reescrito na main como ledger ZW-nnnn deduplicado. A main também mantém o inventário arquivado em `docs/_arquivo/auditoria-supabase/inventario/`.

## Tabela arquivo × achado × evidência

| Arquivo (branch) | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261026100300_dept_invites_ownership_fix.sql` | **Superseded.** A main resolveu o mesmo achado (S3-01/S3-02: policies DELETE/INSERT com `true`) de forma mais restritiva | main tem `supabase/migrations/20261102012200_department_invites_restringe_escrita.sql` + `20261107143000_reconciliar_rls_department_policies.sql`. Produção (`pg_policies`): `dept_invites_delete_admin` qual=`is_admin(auth.uid())`; `dept_invites_insert_admin` with_check=`is_admin(auth.uid()) AND (created_by IS NULL OR created_by IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()))`. A versão da branch permitia DELETE pelo próprio criador; a main só admin — mais estrita. |
| `supabase/migrations/20261026110300_login_attempts_ttl_lgpd.sql` | **Superseded.** TTL LGPD já em produção, com regra melhor | main tem `20261102012400_login_attempts_retencao_90d.sql`; produção `cron.job`: `login-attempts-retention-90d`, `41 4 * * *`, active=true. O DELETE da main preserva lockout ativo (`locked_until IS NULL OR locked_until < now()`) — a versão da branch apagaria lockouts. |
| `supabase/migrations/20261026120300_log_search_event_rpc.sql` | **Superseded.** RPC existe com assinatura mais completa | main tem `20261031130000_search_event_rpc.sql`; produção: `log_search_event(p_term text, p_result_count integer, p_clicked boolean, p_event_id uuid, p_result_kind text)`. A da branch tinha 3 args e `result_kind='other'` chumbado; a da main correlaciona busca↔clique por `client_event_id` idempotente. |
| `src/components/admin/MediaMigrationTool.tsx` + `src/services/mediaMigration.service.ts` | **INCORPORADA.** O refactor (extrair acesso a dados para service) está na main | `src/services/mediaMigration.service.ts` = IDENTICAL_TO_MAIN. `diff` main↔branch do componente mostra **apenas ordem do import** (linhas 9–10 vs 19–20). Main já importa `countPendingMedia`/`fetchMigrationHistory` do service e não importa `supabase`. |
| `src/hooks/business/useWarRoomAlerts.ts` | **Regressão.** A branch REMOVE `showBrowserNotification` e volta ao `new Notification(...)` cru | `git show origin/main:src/hooks/business/useWarRoomAlerts.ts` usa `showBrowserNotification` de `@/utils/notificationSounds`, com comentário explicando que o push via Service Worker falhava em silêncio. Portar a branch desfaria essa correção. |
| `src/hooks/team-chat/useDepartmentManagement.ts` | **Alvo removido.** A branch corrigia `created_by: user.id` → `profiles.id` no INSERT direto; a main trocou o INSERT por RPC | main `useCreateDepartmentInvite` chama `supabase.rpc('create_department_invite', {p_department_id, p_max_uses, p_expires_hours})` — "A RPC decide a permissao, grava criador (perfil) e auditoria". O bug que a branch corrigia não existe mais no caminho atual. |
| `src/test/setup.ts` | **Abordagem superada + texto corrompido.** Define `clientHeight=600`/`clientWidth=800` GLOBAL no `HTMLElement.prototype` | A main resolve o mesmo problema do virtual-core de forma escopada e reversível: `medirLayout()` em `src/pages/__tests__/ChatPopup.pagination.test.tsx:32`, `ChatPopup.messageBalloon.test.tsx:251`, `ChatPopup.rolagem-mensagem-nova.test.tsx:28` (salva e restaura o descriptor). Override global quebraria testes que dependem de `clientHeight=0`. Os hunks da branch também introduzem erros de digitação em comentários (`anom key`, `por Um`, `findBy**`, `CSScompilado`). |
| `src/components/admin/__tests__/AdminView.{limiteChats,ramalAdmin,tarefas-agendadas}.test.tsx` | **Ruído.** Só move `AUDIT_PAGE_SIZE`/`MIN_PASSWORD_LENGTH` do fim para o início do mock | diff puro de reordenação; main já tem as duas chaves com os mesmos valores. |
| `src/components/admin/__tests__/MediaMigrationTool.progresso.test.tsx` | **Versão mais fraca.** A branch tira `within(dialogo)`, `findByRole('alertdialog')` e o `await` | main já mocka `@/services/mediaMigration.service` e `@/lib/invokeEdge`, e asserta `/Migrando mídias\.\.\./` dentro do alertdialog. A branch asserta menos. |
| `src/hooks/__tests__/useRateLimitLogs.test.tsx` | **Superseded.** A branch adiciona `count` e `.in()` à cadeia mockada | main tem a suíte canônica `src/hooks/system/__tests__/useRateLimitLogs.test.ts`, que dubla o encadeamento completo (`range()`, `count` exato, LIKE escapado, resposta obsoleta descartada) contra o hook real `src/hooks/system/useRateLimitLogs.ts:157` (`select('*', {count:'exact'})`). |
| `src/pages/__tests__/ChatPopup.pagination.test.tsx` | **Superseded.** A branch move `medirLayout()` para `beforeEach`/`afterEach` e adiciona mock de `channel`/`removeChannel` | main chama `medirLayout()` dentro do próprio teste (`:338`), com restauração local — mesmo efeito, escopo menor. |
| `scripts/ci/eslint-baseline.json` | **Artefato gerado.** Só hashes/linhas de `MediaMigrationTool.tsx` e `MessageBubble.tsx` | baseline é regenerado pelo CI; valores da branch são de 2026-10-31 e já não correspondem ao HEAD. |
| `auditoria-supabase/` (62 arquivos: `RELATORIO…md`, `inventario/*`, `propostas/*.sql`, `testes/*`, `PENDENCIAS.md`, `progresso.json`, `antes-depois.md`) | **Absorvidos em forma consolidada; números já obsoletos** | ver seção "Achado-chave" acima. Os dados são snapshot de 2026-10-22/11-01 e já divergem da produção de hoje (ver próxima seção). |

## Propostas SQL da branch × produção HOJE (consultas SOMENTE LEITURA, 2026-11-15)

| Proposta | Alegação da branch | Produção hoje | Situação |
|---|---|---|---|
| `01_revogar_grants_anon.sql` (CRITICAL-1) | grants de escrita de `anon` em **99** tabelas | **1** tabela com INSERT/UPDATE/DELETE para `anon` (`information_schema.role_table_grants`) | resolvido na main |
| `P001` dept_invites ownership | DELETE/INSERT com `true` | policies admin-only (acima) | resolvido |
| `P002` wrapper `get_search_insights` | frontend chamava RPC inexistente → PGRST202 | só existe `search_insights(p_days integer)`; a main corrigiu o **frontend**: `src/hooks/admin/useSearchInsights.ts:71` chama `supabase.rpc('search_insights', {p_days})` | resolvido pelo lado oposto; wrapper desnecessário |
| `P003` FKs sem índice | 20 FKs sem índice | **6** FKs de 1 coluna sem índice | em grande parte resolvido; resto é ZW-nnnn na main |
| `P004` índice duplicado | `idx_dept_invites_code` duplica `department_invites_code_key` | ambos ainda existem em `department_invites` | **em aberto** (valor baixo: espaço/escrita) |
| `P005` `multiplix-voice` sem `file_size_limit` | NULL | `52428800` (50 MB) | resolvido |
| `P010` TTL login_attempts | sem job | `login-attempts-retention-90d` ativo | resolvido |
| `P01` UPDATE sem WITH CHECK | 39 policies | **29** policies UPDATE com `with_check IS NULL` em `public` | **em aberto**, já rastreado na main como **ZW-0007** (ALTO) no RELATORIO |
| `P02` MFA admin/supervisor, `P05` pool pg_cron, `P06` retenção auth audit, `P08` vacuum-messages anual, `P09` autovacuum tabelas pequenas | — | não re-verificados aqui | rastreados na main como ZW-nnnn (ver `auditoria-supabase/achados.json` da main) |

## Nada a recuperar
Não há hunk desta branch que valha portar:
- as 3 migrations seriam **downgrade** de regras já em produção;
- os 3 arquivos `src/` de produto são regressão (`useWarRoomAlerts`), alvo inexistente (`useDepartmentManagement`) ou já idênticos (`MediaMigrationTool`);
- os testes e o `setup.ts` são versões mais fracas/mais invasivas do que a main tem, e trazem typos;
- os 62 arquivos de auditoria são snapshot obsoleto de dados cujos achados já estão no ledger ZW-nnnn da main — reintroduzi-los traria números errados (99 vs 1 grant anon, 39 vs 29 policies, 20 vs 6 FKs).

Único resíduo com valor: manter rastreados os itens ainda abertos — **29 policies UPDATE sem WITH CHECK** (ZW-0007 na main) e o **índice duplicado `idx_dept_invites_code`**. Ambos devem ser re-derivados do banco ao vivo (a verdade), não do relatório da branch.

## Comandos de prova (reprodutíveis, somente leitura)
```
git show origin/main:auditoria-supabase/achados.json | head -c 600          # _meta.fontes inclui "PR #2186 (68 achados P001-P010)"
git ls-tree origin/main --name-only supabase/migrations/ | grep -E '20261031130000|20261102012200|20261102012400|20261107143000'
diff <(git show origin/main:src/components/admin/MediaMigrationTool.tsx) \
     <(git show origin/claude/loving-lovelace-esc3l2:src/components/admin/MediaMigrationTool.tsx)   # só ordem de import
git grep -n "showBrowserNotification" origin/main -- src/hooks/business/useWarRoomAlerts.ts
git grep -n "create_department_invite" origin/main -- src/hooks/team-chat/useDepartmentManagement.ts
git grep -n "medirLayout" origin/main -- src/pages/__tests__/
```
SQL (MCP `SUPABASE - ZAPP WEB V2 - MCP`, SELECT apenas):
```sql
select version from supabase_migrations.schema_migrations
 where version in ('20261026100300','20261026110300','20261026120300');           -- 0 linhas
select proname, pg_get_function_identity_arguments(oid) from pg_proc
 where proname='log_search_event';                                                 -- 5 args (versão da main)
select policyname, cmd, qual, with_check from pg_policies where tablename='department_invites';
select jobname, schedule, active from cron.job where command ilike '%login_attempts%';
select count(*) from pg_policies where schemaname='public' and cmd='UPDATE' and with_check is null;  -- 29
```

## Verificação adversarial

Papel: refutar o veredito OBSOLETA. Resultado: **não refutado — concordo com OBSOLETA e com `apagar_branch_seguro=true`.**
Tudo abaixo foi re-conferido por mim (git só leitura em `origin/main` @ `dac285f62`; banco só SELECT via MCP `SUPABASE - ZAPP WEB V2 - MCP`, 2026-11-15).

### O que tentei e falhou em achar
Varri os 77 arquivos do `git diff 78fe258e7 origin/claude/loving-lovelace-esc3l2` procurando qualquer hunk de valor ≥ médio fora da main. Nenhum sobreviveu:

1. **3 migrations — substituição confirmada abrindo o arquivo da main, não só o nome.**
   - `20261026100300_dept_invites_ownership_fix.sql` (branch) vs `origin/main:supabase/migrations/20261102012200_department_invites_restringe_escrita.sql`: a da main é **superconjunto estrito** — fecha escrita nas DUAS tabelas (`department_invites` *e* `department_invitations`), restringe a RPC `create_department_invite` a `is_admin`, e o DELETE é admin-only (a da branch deixava o criador apagar). Produção `pg_policies`: `dept_invites_delete_admin` qual=`is_admin(auth.uid())`.
   - `20261026110300_login_attempts_ttl_lgpd.sql` vs `20261102012400_login_attempts_retencao_90d.sql`: a da main usa `coalesce(last_attempt_at, updated_at, created_at)` **e** `(locked_until IS NULL OR locked_until < now())` — a da branch apagaria lockout ativo. Cron em produção: `login-attempts-retention-90d`, `41 4 * * *`, active=true. O único extra da branch (índice `idx_login_attempts_updated_at`) é inútil: `public.login_attempts` tem **19 linhas** e **3 índices** hoje.
   - `20261026120300_log_search_event_rpc.sql` vs `20261031130000_search_event_rpc.sql`: a da main adiciona `search_events.client_event_id` + índice único `(user_id, client_event_id)`, revoga INSERT direto do cliente e correlaciona busca↔clique; a da branch tinha 3 args e `result_kind='other'` chumbado. Produção `pg_proc`: **1** função `log_search_event` (a de 5 args, da main).
   - Nenhuma das 3 versions da branch está no ledger (`schema_migrations`: 0 de 3) — portar seria downgrade do que já roda.

2. **`src/` — conferido por `diff` arquivo a arquivo, não por mensagem de commit.**
   - `MediaMigrationTool.tsx`: diff main↔branch = **só a posição de 2 linhas de import**. `src/services/mediaMigration.service.ts` = byte-idêntico.
   - `useWarRoomAlerts.ts`: a branch é **regressão dupla** — remove `showBrowserNotification` (volta a `new Notification(...)` cru) *e* remove o pré-check de `dedupe_key` em `warroom_alerts` que a main usa para não transformar violação de unicidade em fluxo normal (409 no navegador).
   - `useDepartmentManagement.ts`: a branch ainda escreve na tabela **legada** `department_invites` e gera o código no cliente (`secureRandomChars`); a main usa `supabase.rpc('create_department_invite')`, que grava em `department_invitations` (a única tabela que `accept_department_invite` lê) + auditoria. Alvo do patch da branch não existe mais.
   - `src/test/setup.ts`: a branch define `clientHeight=600`/`clientWidth=800` no **`HTMLElement.prototype` global** e introduz 4 typos em comentários (`anom key`, `por Um`, `CSScompilado`, `findBy**`). A main resolve escopado: `medirLayout()` em `ChatPopup.pagination.test.tsx`, `ChatPopup.messageBalloon.test.tsx`, `ChatPopup.rolagem-mensagem-nova.test.tsx`.
   - Testes (`AdminView.*`, `MediaMigrationTool.progresso`, `useRateLimitLogs`, `ChatPopup.pagination`) e `scripts/ci/eslint-baseline.json`: reordenação, asserções mais fracas ou artefato gerado.

3. **Propostas SQL — li as 18, inclusive as que a triagem não re-verificou.** `P02_enable_mfa`, `P05_fix_pgcron_pool`, `P06_add_auth_audit_retention` são **diagnóstico + template comentado** ("configurar no painel", "não testado"); `P01_add_with_check_update_policies` se autodeclara "TEMPLATE — não aplicar diretamente" e lista 39 tabelas de 2026-10-22 (produção hoje: **29** policies UPDATE com `with_check IS NULL`; o relatório da main já registra ZW-0007 com 42→46→29). `P007` admite que as colunas do índice são suposição ("ajustar conforme o body real da função"). Nada disso é código aplicável.

4. **`auditoria-supabase/` (62 arquivos) — absorção confirmada na fonte.** `origin/main:auditoria-supabase/achados.json` → `_meta.fontes` inclui literalmente `"PR #2186 (68 achados P001-P010)"`, e o ledger ZW-0001…ZW-0048 mapeia as P-series no campo `origem` (ZW-0001 = `S03-001 / C-01 / P006`; ZW-0002 = `.../P003`; ZW-0006 = `.../P002`; ZW-0022 = `S03-008 / P010`; ZW-0028 = `S04-002 / P004`). O inventário equivalente está em `docs/_arquivo/auditoria-supabase/`. O `testes/s11-rls-matrix.sql` (468 linhas) parte de premissa **errada** (isolamento por `organization_id` em JWT) que o próprio `inventario/s11_rls_tenant.md` da branch contradiz ("single-tenant por instância"); o resultado efetivamente rodado (`s11_rls_matrix_RESULTADO.md`) usa schema sintético de 1 tabela, equivalente ao ZW-0037 (8/8 PASS) já na main.

### Lacunas alegadas pela triagem — re-checadas ao vivo
- `P004` índice duplicado: `pg_indexes` ainda traz `department_invites_code_key` **e** `idx_dept_invites_code`. Mas `pg_stat_user_indexes`: **8192 bytes** cada, `idx_scan=0` em todos os 5 índices da tabela — cabe em ZW-0030 (637 índices `idx_scan=0`, BAIXO) na main. Valor **baixo**, confirmado; não justifica portar arquivo.
- `P01` 29 policies UPDATE sem WITH CHECK: real e **em aberto**, porém já é ZW-0007 (ALTO) na main (`RELATORIO_AUDITORIA_SUPABASE.md:25,52`), com histórico de PRs (#2481) registrado. O SQL da branch não é aplicável (template) e sua lista está defasada.

### Conclusão
Nenhum hunk de valor ≥ médio não coberto. A branch é snapshot obsoleto cujos achados estão no ledger da main e cujas correções foram substituídas por versões mais estritas **já em produção**. Reintroduzi-la traria números errados (99→1 grant anon, 39→29 policies, 20→6 FKs), 2 regressões em `src/` e 4 typos. `apagar_branch_seguro = true`.
