# claude__feat-remove-special-agent-261113 — INCORPORADA

- Ref: `origin/claude/feat-remove-special-agent-261113` (tip `08625ec76`, merge_base `cb6576b2a`)
- PR: #3033 "feat(db): remover o rotulo special_agent do enum app_role"
- Veredito: **INCORPORADA** · confiança **alta** · `apagar_branch_seguro = true`

## Propósito
Fechar o último resíduo da decisão do dono de 2026-11-03 (papel `special_agent` extinto): a
`20261103201500` tirou o papel de funções, policies e CHECKs, mas o **rótulo** continuava no enum
`public.app_role`. A branch recria o tipo só com `admin/supervisor/agent`, limpa 7 linhas mortas de
`role_permissions`, recria as 21 policies/view/funções dependentes, e traz a prova em Postgres
descartável + o passo no `db-guard.yml` + atualização de `types.ts` e `regras.md`.

Commits: `d8b7ee03e` (feat), `0f746ebfc` (merge main), `08625ec76` (renumera migration + LOCK único).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261113140000_remove_enum_special_agent.sql` | **Na main renumerada** para `20261113172000_remove_enum_special_agent.sql`; conteúdo idêntico exceto 3 linhas que a main **melhora** | `git ls-tree origin/main supabase/migrations/` lista `20261113172000_remove_enum_special_agent.sql`; `diff` branch×main = só o cabeçalho (número) + comentário e policy `"Only admins can view audit logs"` com o predicado initplan da `20261113150000` (`USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)))`, main_mig.sql:351) no lugar do predicado antigo da branch |
| `supabase/tests/db-audit/remove-enum-special-agent.test.sh` | **Na main, superset** | main acrescenta `F_AUDIT_TRAIL` (`20261113150000_audit_logs_trilha_conexao_rapida.sql`), `apply "$F_AUDIT_TRAIL"` + assert do initplan no snapshot A, e troca `grep -nE ... \| head -1` por `grep -m1 -nE`. As 4 linhas de `missing_in_main` são só a referência ao nome antigo `20261113140000` |
| `.github/workflows/db-guard.yml` | **Na main**, com o número correto | main:659 `# 20261113172000: recria public.app_role sem 'special_agent'...` + step `Simular ...` rodando `supabase/tests/db-audit/remove-enum-special-agent.test.sh`. A única linha "faltando" é o comentário com o número antigo `20261113140000` |
| `docs/contexto/regras/manual/regras.md` | **Na main**, com o número correto | main:10 e main:20 trazem o mesmo texto da branch, citando `20261113172000_remove_enum_special_agent` |
| `src/integrations/supabase/types.ts` | **Na main** | `git show origin/main:src/integrations/supabase/types.ts \| grep special_agent` → 0 ocorrências (`app_role: "admin" \| "supervisor" \| "agent"`) |
| 10 arquivos de `src/` (VisibilityGrantsManager, useVisibleAgents, testes) | `IDENTICAL_TO_MAIN` / `PRESENT_BYTE` | pré-classificação mecânica |

Commit de entrada na main: `ab657aa34` — *"chore(pacote): pacote 5 — #3037, #3034, #3033, #2971, #2943, #2838 e #2894 concluídas e num ciclo de CI (#3064)"* (`git log --oneline -1 origin/main -- supabase/migrations/20261113172000_remove_enum_special_agent.sql`). Confirma o comentário de fechamento da PR #3033.

## Produção (leitura, MCP `SUPABASE - ZAPP WEB V2 - MCP`, 2026-11-15, projeto tnnnlkbymytvtqngbbqh)
```sql
select (select string_agg(enumlabel,',' order by enumsortorder) from pg_enum where enumtypid='public.app_role'::regtype),
       (select string_agg(version,',') from supabase_migrations.schema_migrations where version in ('20261113140000','20261113172000')),
       (select count(*) from public.role_permissions where role::text='special_agent');
```
→ `enum_app_role = admin,supervisor,agent` · `migs_aplicadas = 20261113172000` · `rp_special_agent = 0`

Ou seja: **ponta a ponta concluído** — migration da main aplicada em produção, enum sem o rótulo, seed morto removido. A versão `20261113140000` da branch nunca foi (nem deve ser) aplicada.

## Lacunas a recuperar
Nenhuma. Toda diferença entre branch e main é o número antigo da migration (`20261113140000`) em
cabeçalho/comentários/referências — valor nenhum, e portar seria **regressão**: quebraria a referência
`$MIG_DIR/20261113172000_...` do teste e desfaria o predicado initplan de `audit_logs` que a main
preserva.

## Observação (fora do escopo da branch)
`docs/contexto/regras/manual/regras.md` na main (linhas 10 e 20) ainda diz que o rótulo "ainda existe
no enum do banco até a migration `20261113172000` ser aplicada (PR aguardando o dono)" — a migration
**já está aplicada** em produção (consulta acima). Doc desatualizada na main, não lacuna desta branch.

## Verificação adversarial

Veredito da triagem **INCORPORADA confirmado** (concorda=true, apagar branch seguro). Tentei refutar arquivo por arquivo; nenhum hunk de valor ≥ médio ficou fora da `main` (`origin/main` = `dac285f62`).

- **Migration** — branch `supabase/migrations/20261113140000_remove_enum_special_agent.sql` (537 linhas) vs main `supabase/migrations/20261113172000_remove_enum_special_agent.sql` (541): `diff -u` dá 3 hunks, todos a favor da main — (1) número no cabeçalho linha 1; (2) +2 linhas de comentário sobre a policy de `audit_logs`; (3) linhas 345-351, `CREATE POLICY "Only admins can view audit logs"` recriada com o predicado initplan `USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)))` da 20261113150000, em vez do predicado por linha da branch. Portar a versão da branch **desfaria** a correção de HTTP 500 na trilha de auditoria. As 467 linhas `missing_in_main` do JSON são artefato de o arquivo ter nome diferente.
- **Teste** — `supabase/tests/db-audit/remove-enum-special-agent.test.sh`: main é superset estrito (+`F_AUDIT_TRAIL=20261113150000_audit_logs_trilha_conexao_rapida.sql`, `apply` + assert do initplan no snapshot A, `grep -m1` no lugar de `grep | head -1`). As 4 linhas `missing_in_main` são só referências ao número antigo.
- **Workflow** — `origin/main:.github/workflows/db-guard.yml:662` tem o comentário com `20261113172000`, `:667` o step "Simular remocao do rotulo special_agent" e `:671` roda o mesmo `remove-enum-special-agent.test.sh`. Única linha ausente = o comentário com o número antigo.
- **Docs** — `docs/contexto/regras/manual/regras.md` na main repete os 2 parágrafos da branch com `20261113172000`; o resto do diff só mostra decisões novas que a main tem a mais (FSM waiting→archived, Talk X, Multiplix).
- **`src/`** — os 10 arquivos marcados `IDENTICAL_TO_MAIN` conferem por SHA de blob (`git rev-parse <ref>:<path>` igual nos dois lados, incluindo `VisibilityGrantsManager.tsx` e `useVisibleAgents.ts`); `src/integrations/supabase/types.ts` na main tem **0** ocorrências de `special_agent` e `app_role: "admin" | "supervisor" | "agent"`.
- **Produção** (`tnnnlkbymytvtqngbbqh`, SELECT via MCP, 2026-11-15): `pg_enum public.app_role = admin,supervisor,agent`; `supabase_migrations.schema_migrations` tem `20261113172000` e **não** tem `20261113140000`; a policy `Only admins can view audit logs` está com o predicado initplan. Aplicar a migration da branch agora falharia/regrediria.
- Entrada na main: `git log -1 origin/main -- supabase/migrations/20261113172000_...` → `ab657aa34` "chore(pacote): pacote 5 — ... #3033 ... (#3064)", batendo com o comentário de fechamento da PR #3033.

Nenhuma lacuna adicional. Risco de apagar a branch: zero — ela só carrega o número antigo da migration e a versão pior da policy de `audit_logs`.
