# claude__auditoria-temp-261101 — OBSOLETA

- Ref: `origin/claude/auditoria-temp-261101` · tip `f258d5acf` · merge_base `1252bb5a4` · PR #2462
- Escopo: **docs-only**. 0 migrations, 0 edges, 0 workflows, 0 `src/`.

## Propósito da branch
`git log --format='%h %ad %s' 1252bb5a4..origin/claude/auditoria-temp-261101`:

```
f258d5acf 2026-11-01 Merge branch 'main' into claude/auditoria-temp-261101
bc0ec0dc8 2026-11-01 Merge branch 'main' ...
ff6037bf5 2026-11-01 Merge branch 'main' ...
a32f58cd4 2026-11-01 Merge branch 'main' ...
c142c024e 2026-11-01 fix: progresso.json — multiplix-voice reclassificado HIGH→INFO (bucket privado=default-deny)
f28940497 2026-10-25 chore: auditoria Supabase — relatório e progresso finais de 2026-10-25
```

`git diff --stat 1252bb5a4 origin/claude/auditoria-temp-261101` → só 2 arquivos:
`auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` (+1328/−…) e `auditoria-supabase/progresso.json` (505 linhas).
Ou seja: a branch **congela o snapshot da auditoria de 2026-10-25** e aplica **uma única correção de conteúdo própria** (commit `c142c024e`).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` | Branch = versão 10-25 (947 linhas); main = versão consolidada (840 linhas) reescrita por `f120344f9` (#2844, 2026-11-10, "consolida achados.json/RELATORIO/progresso — FASES 0 e A") sobre `049094e02` (#2397, 10-31) e `6a6afde19` (#2241, 10-30). Aplicar a branch **regrediria** a main. | `git log origin/main -- auditoria-supabase/`; `git show origin/main:...` \| `wc -l` = 840 vs 947 na branch |
| `auditoria-supabase/progresso.json` | Branch = 118 linhas (sessão 10-25). Main = 483 linhas, com re-verificações até 2026-11-08 (`before_after_re_verificado_em: 2026-10-31T00:27Z`, `ZW-0004_cron_failures_24h`, mapa de PRs #2460/#2471/#2476…). A branch remove 228 linhas que a main ainda tem. | `git show origin/main:auditoria-supabase/progresso.json` \| `wc -l` = 483; linhas 140/164/203/241/311/434 só existem na main |
| Única entrega própria: reclassificação multiplix-voice HIGH→INFO | **Alvo da correção não existe mais na main.** O achado "multiplix-voice — 0 policies de storage = HIGH" foi eliminado da main na consolidação; a main só mantém o achado distinto `S03-008`/`S09-002` (**MÉDIO**, `allowed_mime_types=null`). | `git show origin/main:auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` → linhas 464, 587, 730 (só MIME); grep por `default-deny\|0 policies\|bucket privado` na main = **0 ocorrências**; `achados.json` da main não tem nenhum achado de bucket/storage (grep `multiplix-voice\|allowed_mime\|storage.buckets` = 0) |
| Cópia arquivada | `docs/_arquivo/auditoria-supabase/{RELATORIO…md,progresso.json}` (745 e 397 linhas, criadas por `c570d5d46` #2630, 11-02) **também não** carregam o HIGH de multiplix-voice policies. Nada a retificar lá. | grep `default-deny\|design intencional\|retificar` = 0; grep `findings_count\|"HIGH"` em `_arquivo/progresso.json` = 0 |
| `auditoria-supabase/inventario/**`, `propostas/**`, `testes/**` (39 arquivos) | **Não é perda da branch**: idênticos entre merge_base e tip (não aparecem no diff MB..tip). A main os moveu de propósito para `docs/_arquivo/auditoria-supabase/…` em `c570d5d46` (#2630, "arquiva prosa morta em docs/_arquivo (fase B)"). Continuam no repo. | `git ls-tree -r --name-only origin/main \| grep docs/_arquivo/auditoria-supabase/inventario` lista todos |

## Trecho da única entrega própria (para registro; não precisa ser portado)

`git show c142c024e -- auditoria-supabase/progresso.json`:

```diff
     "S09_auth_storage": {
-      "resumo": "... multiplix-voice: 0 policies (HIGH — sem restricao de acesso via RLS policy). ..."
-      "inconsistencia_resolvida": "... multiplix-voice tem 0 policies = HIGH finding adicionado."
+      "resumo": "... multiplix-voice: 0 policies — DESIGN INTENCIONAL (bucket privado = default-deny sem policies; acesso so via service-role signed URL). ..."
+      "inconsistencia_resolvida": "... Reclassificado de HIGH para design-intencional em 2026-11-01."
+      "finding": "INFO — multiplix-voice sem RLS policies; comportamento esperado (default-deny em bucket privado)"
   "findings_count": {
-    "HIGH": 4,  "LOW": 2
+    "HIGH": 3,  "LOW": 2, "INFO": 2,
+    "nota": "multiplix-voice reclassificado HIGH→INFO em 2026-11-01 (bucket privado=default-deny)"
```

A justificativa técnica (branch `RELATORIO…md:666`) segue válida de fato — bucket `public=false` com 0 policies é default-deny, acesso via `supabase/functions/multiplix-voices/index.ts` (`requireAuth`, `canRecoverAsset`) + `supabase/migrations/20261003132707_f64_voz_assets_e_grants.sql` — mas **não há classificação errada na main para corrigir**.

## Veredito
**OBSOLETA** (confiança alta). Os 1.398 "gap lines" são o snapshot velho da auditoria; a main tem a versão mais nova e mais completa dos mesmos dois arquivos. A única contribuição exclusiva da branch corrigia um achado que a main já descartou. Nada a recuperar.

`apagar_branch_seguro = true` — prova completa para os 2 arquivos com lacuna.

---

## Verificação adversarial

Papel: refutar a triagem (OBSOLETA). Resultado: **triagem confirmada** — nenhum hunk de valor ≥ médio sem cobertura na main.

### Tentativas de refutação e o que cada uma mostrou

1. **A branch tem 37 arquivos que a main não tem em `auditoria-supabase/`** (`inventario/*`, `propostas/*.sql`, `testes/*`) — apareceria como perda enorme, mas o `git diff` vs merge-base só lista 2 arquivos porque esses 37 vieram da própria main. Verificação blob a blob contra `docs/_arquivo/auditoria-supabase/`: **ausentes=0, diferentes=0** (37/37 byte-idênticos). O arquivamento (#2630) preservou tudo, inclusive as propostas de correção.
2. **Relatório da branch (947 linhas, esquema CRITICAL-n/HIGH-n) nunca existiu na main.** Confirmado: em `6a6afde19` (#2241) o arquivo na main era só o título (51 bytes) e `git log -S'CRITICAL-1 — Anon role…'` em `origin/main` → 0 commits. Então é conteúdo exclusivo — mas exclusivo ≠ útil: é a redação de 2026-10-25, substituída pelo re-audit Sxx/ZW-nnnn de 10-30/31 + re-verificações 11-01 e **11-08**.
3. **Achados candidatos a lacuna real, um por um** (grep em `origin/main` inteiro, não só no relatório):
   - HIGH-7 "0 fatores MFA em 10 usuários" → `PENDENCIAS.md:347-363` (item 8, com prova `auth.mfa_factors`=0 e as 3 opções para o dono) + `docs/prod-readiness.md:1487` (X22) e `:1539` (X45, "mfa_factors verified = 0"). **Coberto e com decisão pendente do dono já registrada.**
   - HIGH-1/HIGH-3 "17 tabelas RLS sem policy", incl. `link_preview_cache` → `auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md:358` e `:627` (S11-002). **Coberto.**
   - HIGH-5 índices trigram sem uso (38MB) → `docs/_arquivo/auditoria-supabase/propostas/03_drop_unused_indexes.sql:2-52` (os 4 índices GIN, MB por índice e rollback). **Coberto, com o SQL.**
   - HIGH-4 `email_threads` seq scans → `docs/_arquivo/.../inventario/S05_performance.json:21` (S05-005). **Coberto.**
   - HIGH-6 `catalog_send_stats` sem `security_invoker` → `auditoria-supabase/achados.json:303-304`: **resolvido** (13/13 views de public com security_invoker em 11-08).
   - MEDIUM-8 `department_invites DELETE USING(true)` → **corrigido em produção** por `supabase/migrations/20261102012200_department_invites_restringe_escrita.sql` (listada em `origin/main:auditoria-supabase/progresso.json`).
   - MEDIUM-5 `multiplix-voice` sem MIME → main `:464` (S03-008), `:587` (S09-002), `:730`. **Coberto** (mesma evidência `allowed_mime_types=null`).
   - MEDIUM-3 `_bkp_261023` sem RLS → main `:398` + migration `20261026240300_drop_bkp_261023.sql`. MEDIUM-2 (60 migrations NULL) → S02-001 (65). MEDIUM-9 (`conversations`/`tasks`/`accounts`) → seção "Drift `.from()`/`.rpc()` × banco" (`:418`), re-verificada sem orphans reais. LOW-3 `_zapp_fn_before` sem PK → main `:358`. **Cobertos.**
   - Sem contrapartida em nenhum doc de auditoria da main: HIGH-2 (autovacuum ausente), LOW-4 (nome `sicoob_service_role_key`), LOW-5 (`pg_timezone_names` 380 chamadas). Todos informativos/BAIXO; autovacuum tem menção colateral em `propostas/03` e no cron `vacuum-contacts-daily` (main `:186`). **Abaixo do limiar de médio.**
4. **A reclassificação multiplix-voice HIGH→INFO (c142c024e) corrige algo na main?** Não: `grep -ci 'default-deny'` no relatório da main = 0 — o achado HIGH "bucket privado = 0 policies" não existe lá; a main carrega só o achado de MIME, já como MÉDIO. Nada a retificar.
5. **Aplicar a branch regrediria a main**: `progresso.json` 483 → 118 linhas (perderia `fase_0_fechamento_20261108`, `fase_A_estado_secoes_20261108`, `re_verificacao_final_20261101`) e o relatório 840 (consolidado) → 947 (10-25).
6. **Decisão já registrada na main**: `origin/main:auditoria-supabase/progresso.json` → `sessao_20261101.pr_2462_triagem` = *"ABSORVER — docs 2026-10-25 (RELATORIO+progresso.json com 5 correções); sobreposição com PR #2498; fechar após commit desta sessão"*. A PR #2462 (mesmo tip da branch) foi triada e destinada ao fechamento pela própria sessão que consolidou os arquivos.

### Lacuna fora do escopo desta branch (não altera o veredito)
`supabase/migrations/20261026200300_fix-talkx-cron-startup-timeout.sql` — citado em `corrections_this_session` da branch como o fix de CRITICAL-3 (PR #2245) — **não existe em `origin/main`** (`git ls-tree origin/main -- supabase/migrations/` só traz `20261026190300_saved_filters_inbox_limites.sql`). É código de outra branch/PR, não desta (esta é docs-only); vale triar #2245 à parte. O incidente de startup timeout aparece como RESOLVIDO em 2026-10-31 no relatório da main (Onda 1), então pode ter sido resolvido por outro caminho.

**Parecer:** concordo com OBSOLETA. `apagar_branch_seguro = true`.
