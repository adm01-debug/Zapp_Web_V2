# Relatório de Validação Exaustiva — Pós-Onda de Excelência

**Data:** 2026-08-30 (UTC-3) · **Branch:** `chore/excellence-wave-01` · **Executor:** Cline (agente)
**Escopo:** validar tudo que foi implementado/documentado nas etapas 001–007 do plano de 100 etapas (diário `docs/handoffs/cline_execution_log_2026_08_30.md`), reproduzir os achados de segurança com ferramenta independente, medir o baseline de saúde do repositório e registrar gaps novos.

**Fato de escopo (medido):** a branch contém 8 commits / +3.628 linhas, **100% documentação, zero alteração de código** vs `origin/main`. Portanto esta validação cobre (a) os entregáveis da auditoria e (b) o baseline de saúde do repo — não correções de código.

**Método:** 5 frentes (A1 DBA estático, A2 reprodução de segurança, A3 build/testes, A4 CI/CD, A5 integridade do handoff), executadas na ordem A5 → A2 → A1 → A4 → A3. Regra de higiene mantida: **nenhum valor de segredo impresso** — apenas nomes de variáveis, arquivos, linhas, comprimentos e contagens. Scans com `gitleaks --redact=100`; relatórios brutos em `/tmp` (fora do repo).

---

## 1. Resumo executivo

| Frente | Resultado | Veredito |
|---|---|---|
| A5 — Integridade do handoff | 11/11 hashes existem; tabela com exatas 100 linhas; 5 docs presentes; linhas citadas de F-01/F-02 intactas | ✅ ÍNTEGRO |
| A2 — Reprodução de segurança | gitleaks dir=515 / git=565 findings; F-01..F-11 reproduzidos; **0 incidentes novos**; 2 gaps de plataforma (G-01/G-02) | ✅ REPRODUZÍVEL (com ressalvas §3) |
| A1 — DBA estático | 301 migrations íntegras; **1 versão duplicada (G-03)**; 12 arquivos SECURITY DEFINER sem `search_path` literal (G-04) | ⚠️ 2 gaps novos |
| A4 — CI/CD | 9 secrets referenciados vs 8 presentes; **F-06 reclassificado: não-bloqueante** (fallback no workflow); branch protection saudável | ✅ COM 1 RECLASSIFICAÇÃO |
| A3 — Build/Testes | typecheck ✅ · 2.493 testes ✅ · 160 contratos ✅ · lint-ratchet ✅ · build ✅ | ✅ SAUDÁVEL |

**Conclusão:** a documentação da onda de excelência é **fiel e reproduzível**; o baseline do repo é **verde nos gates de CI**; os gaps novos são de higiene (G-03..G-08) e plataforma (G-01/G-02), nenhum bloqueante. As pendências críticas continuam sendo as decisões humanas F-01..F-04 (rotação/sanitização).

---

## 2. Reprodução independente dos achados (gitleaks v8)

Scans executados em 2026-08-30 ~17:36 (dir = working tree incl. não-rastreados; git = 5.504 commits alcançáveis a partir do HEAD):

| ID | Achado (diário §4) | Reproduzido? | Evidência desta validação |
|---|---|---|---|
| F-01 | `apikey` Evolution em `docs/TROUBLESHOOTING.md` L72/L89 | ✅ | regra `curl-auth-header` ×2 (commit `23f4b52f`); linhas ainda presentes (len 66/73) |
| F-02 | Mesma key em `docs/EVOLUTION_WEBHOOKS_DOCUMENTATION.md` L75 | ✅ | finding dir L75 (len 108) + **cópia idêntica rastreada em `tmp/` (G-05)** |
| F-03 | Segredos Lalamove em 6 artefatos | ✅ | 21 hits da regra `stripe-access-token` **são os artefatos Lalamove** (commits `c5307989`, `cdf6e3c2`) — falso positivo de regra, mesmo incidente; mais `generic-api-key` nos mesmos arquivos |
| F-04 | SERVICE_ROLE em `migrate-helper` (histórico) | ✅ | finding em `supabase/functions/migrate-helper/index.ts:5` no commit `52d30daa` |
| F-05 | JWTs anon publicáveis (client.ts/externalClient) | ✅ | 13 hits `jwt` no dir scan, incl. `src/integrations/supabase/client.ts:13` e bundles `dist/` — públicos por design |
| F-06 | `TYPES_SYNC_PR_TOKEN` ausente | ✅→**RECLASSIFICADO** | secret ausente confirmado; **porém** `types-sync.yml` L74–76 degrada graciosamente p/ `GITHUB_TOKEN` (L306 `secrets.TYPES_SYNC_PR_TOKEN \|\| github.token`) e o repo permite PRs por Actions (`can_approve_pull_request_reviews: true`) → **não-bloqueante; hardening opcional** |
| F-07 | `Authorization: Bearer $SERVICE_ROLE_KEY` na migration gmail-cron | ✅ | findings em `20260829110000_gmail_incremental_sync_cron.sql:22` (commits `9f8ca8b5`, `7e42fc2b`) — classificado como FP operacional (não persiste valor) |
| F-08 | gitleaks ignorava `docs/` no repo-scan | ✅ (mitigado na onda) | config atual cobre docs; dir-scan confirma detecção nos arquivos |
| F-09 | Segredos em `.github/workflows/` | ✅ | nenhum finding de workflow no scan; 9 referências são `secrets.*` indiretas |
| F-10 | `logs_zapp/lalamove/` fora do git | ✅ | nenhum finding em path rastreado; diretório permanece local |
| F-11 | `.env.production` rastreado | ✅ | findings `.env.production:8/10/14` — apenas vars `VITE_*`; `.gitignore` L16 documenta a intenção |

**Sem incidentes novos:** os 565 findings do git-scan mapeiam 100% para F-01..F-11 (23 commits distintos). Nenhuma credencial Stripe real — a regra homônima casou com chaves Lalamove (formato hex longo).

---

## 3. Gaps novos descobertos nesta validação

| ID | Gap | Severidade | Classe | Ação proposta |
|---|---|---|---|---|
| G-01 | **Dependabot alerts desabilitados** no repo (API 403 "Dependabot alerts are disabled") | MÉDIA | B (config GitHub) | Ativar em Settings → Security → Dependabot alerts (+ security updates) |
| G-02 | **Code scanning ausente** (API 404 "no analysis found") — nenhuma análise CodeQL/SAST configurada | BAIXA | B | Opcional: workflow CodeQL ou GitHub Advanced Security |
| G-03 | **Versão de migration duplicada:** `20260829100000_fix_clear_login_operator_triple_arrow.sql` e `20260829100000_get_team_profiles_active_filter.sql` dividem o mesmo prefixo de versão | MÉDIA | B/C | Renomear uma para `20260829100100_...` (local já aplicada → apenas arquivo; se remoto divergir, reconciliar na etapa 010) |
| G-04 | **12 arquivos de migration com `SECURITY DEFINER` sem `search_path` literal** (7 pré-2026-08 UUID-named + 3 revokes de 2026-08-27 + 2 outros) | BAIXA (estático) | C | Verificação individual na etapa 010 (acesso DB); funções podem ter `search_path` via `ALTER FUNCTION` posterior |
| G-05 | **`tmp/EVOLUTION_WEBHOOKS_DOCUMENTATION.md` rastreado** — cópia exata do doc com a apikey (F-02); `tmp/` não está no `.gitignore` | MÉDIA | B | Incluído no pacote de sanitização F-02 (pendente decisão humana); recomendado `git rm --cached tmp/` + entrada no `.gitignore` |
| G-06 | 7 migrations antigas (2026-04) com `DROP TABLE` sem `IF EXISTS` | BAIXA (histórico) | — | Nenhuma (já aplicadas; valor apenas documental) |
| G-07 | Avisos de teste: React Router future flags, `act()` não-wrapped em PerformanceMonitor, mock incompleto (`select().gte`) | BAIXA | D (dívida técnica) | Backlog; testes passam |
| G-08 | Avisos de build: `vite:react-babel` deprecation (migrar p/ `@vitejs/plugin-react-oxc`), chunk >500 kB | BAIXA | D | Backlog |

**Reclassificação:** F-06 sai de "pendente (decisão humana)" para **RESOLVIDO — não-bloqueante** (evidência em §2). Criar o secret dedicado continua recomendado para que checks do PR auto-disparem, mas o workflow não quebra sem ele.

**Nota de precisão documental:** o diário registrou "6.980 commits" (exato às 13:12); a re-contagem nesta validação mede **6.994** — diferença explicada por merges/pushes posteriores à escrita. Nenhuma correção retroativa necessária; registrado aqui para rastreabilidade.

---

## 4. Simulações executadas

| # | Simulação | Resultado |
|---|---|---|
| S-1 | Fallback de F-06 (análise estática do `types-sync.yml` + permissões do repo) | ✅ Workflow usa `GITHUB_TOKEN`; repo permite criação de PR por Actions; degradação = checks do PR podem exigir aprovação manual |
| S-2 | Vazamento no bundle de produção (build fresco, 34 MB) | ✅ `service_role`: 0 ocorrências; `sk_live`/`sk_test`/`sbp_`/`apikey=`: 0; `OPENAI_API_KEY`: 1 ocorrência **apenas como identificador** (label na UI de Settings), sem valor adjacente |
| S-3 | Equivalência lint local vs CI | ✅ Esclarecido: CI roda `scripts/ci/lint-ratchet.mjs` (baseline=1123, atual=1123, **0 dívidas novas** → PASS); o `npm run lint` cru falha por dívida catalogada pré-existente (891 erros, 87% `no-explicit-any`) — **não é regressão da onda** |
| S-4 | Dependabot/Code scanning via API | ❌→G-01/G-02 (ambos ausentes) |
| S-5 | Integridade dos artifacts de auditoria (hashes, tabela 100 etapas, linhas citadas) | ✅ 11/11 hashes `commit`; 100/100 linhas; 5/5 docs; F-01/F-02 intactos |

---

## 5. Baseline de saúde do repositório (medido em 2026-08-30 ~17:40)

| Item | Comando / fonte | Resultado |
|---|---|---|
| Typecheck | `npm run typecheck` (tsc --noEmit) | ✅ **0 erros** |
| Testes unitários | `npm test` (vitest run) | ✅ **152 arquivos · 2.493 passed · 32 skipped · 0 falhas** (16s) |
| Testes de contrato | `npm run test:contracts` | ✅ **3 arquivos · 160 passed · 0 falhas** |
| Lint (ratchet de CI) | `node scripts/ci/lint-ratchet.mjs` | ✅ baseline=1123, atual=1123, **novas=0** |
| Build produção | `npm run build` | ✅ **6,12s**, dist=34 MB, só avisos (G-08) |
| Secrets Actions | API `/actions/secrets` | 8 presentes; 9 referenciados em workflows; ausente = `TYPES_SYNC_PR_TOKEN` (F-06 reclassificado) |
| Branch protection `main` | API `/branches/main/protection` | ✅ 3 checks obrigatórios (Lint & TypeCheck, Unit Tests, Build), strict=true, enforce_admins=true, conversation resolution, sem force-push/delete |
| Workflow permissions | API `/actions/permissions/workflow` | default=read; `can_approve_pull_request_reviews=true` |
| Dependabot / Code scanning | APIs dedicadas | ❌ desabilitado / ❌ ausente (G-01/G-02) |
| `.gitignore` | inspeção | ✅ cobre `.env`, `.env.local`, `.env.development[.local]`, `.env.test[.local]`, `.env.production.local`, `.env.staging`; `.env.production` intencional (L16); **`tmp/` ausente (G-05)** |
| Migrations | estático | 301 arquivos, formato válido, **1 versão duplicada (G-03)** |
| Edge functions | estático | 62 functions; `verify_jwt=false` em 6 — todas com exceção documentada no `config.toml`; 45 usam `SERVICE_ROLE` (esperado p/ backend) |

## 6. Limitações desta validação

1. **Sem acesso remoto ao banco** (MCP self-hosted proibido pela etapa 005; MCP dedicado ausente nesta sessão): drift de migrations (301 locais vs 17 remotos evidenciados na etapa 003), cobertura real de RLS por tabela e `search_path` efetivo das 12 funções de G-04 só são verificáveis com DB — delegados à etapa 010.
2. **RLS estático é aproximado:** 126 tabelas criadas vs 127 ocorrências de `ENABLE ROW LEVEL SECURITY`, sem órfãs evidentes por diff de nomes — confirmação fina exige catálogo do banco.
3. gitleaks git-scan cobriu 5.504 commits alcançáveis do HEAD (não os 6.994 de `--all`); o dir-scan cobre o working tree completo. Cobertura considerada suficiente pois os achados históricos conhecidos foram todos reproduzidos.
4. Vercel: credencial/token não disponível (bloqueio já registrado) — `vercel.json` existe no repo e a config de envs fica para decisão humana.
5. Gitleaks dir-scan varreu também `dist/` e `logs_zapp/` (não-rastreados): nenhum achado fora do padrão F-05 (JWTs anon públicos).

## 7. Ações recomendadas (priorizadas)

| # | Ação | Depende de | Prioridade |
|---|---|---|---|
| 1 | Rotacionar credenciais F-01/F-02 (Evolution) e sanitizar docs + `tmp/` | **humano** | 🔴 CRÍTICA |
| 2 | Rotacionar Lalamove (F-03) e confirmar SERVICE_ROLE pós-2026-08-28 (F-04) | **humano** | 🔴 CRÍTICA |
| 3 | Ativar Dependabot alerts + security updates (G-01) | humano (Settings) | 🟡 ALTA |
| 4 | Resolver versão duplicada de migration (G-03) na etapa 010 com reconcile remoto | etapa 010 | 🟡 ALTA |
| 5 | `git rm --cached tmp/` + `.gitignore` (G-05) — junto do pacote F-02 | humano (F-02) | 🟡 ALTA |
| 6 | Criar `TYPES_SYNC_PR_TOKEN` dedicado (hardening do fallback) | humano | 🟢 OPCIONAL |
| 7 | Code scanning (CodeQL) (G-02); dívidas G-06..G-08 | backlog | 🟢 BAIXA |

---

*Relatório gerado na sessão de validação de 2026-08-30 (tarde). Artefatos brutos (gitleaks JSON, logs de teste/lint/build) em `/tmp` desta máquina — não versionados por higiene. Nenhum valor de segredo consta neste documento.*

---

## 8. Rodada 2 — Validação profunda do sistema (2026-08-30, ~17:50–18:10)

**Escopo:** o sistema real que as sessões implementaram — guards de banco, bateria db-audit, CI viva (runs reais) e classificação formal do drift com o snapshot do ledger remoto (salvo às 15:11, 316 versões). Continuação da Rodada 1 (§1–§7).

### 8.1 Gate local mínimo (handoff §4.6) — agora 100% executado

| Comando | Resultado |
|---|---|
| `node --test scripts/ci/*.unit.mjs` | ✅ **23/23** |
| `node scripts/ci/check-workflow-pins.mjs` | ✅ 6 workflows, todas as Actions fixadas por SHA |
| `node scripts/db-audit/supabase-usage-guard.mjs` | ✅ catálogo 124 tabelas / 7 views / 46 funções (2026-08-29), **0 violações, 0 novas** |
| `git diff --check` | ✅ OK |
| `node --test scripts/db-audit/*.test.mjs` | ✅ **110/110** |
| `bash check-mcp-exec-acl.test.sh` | ✅ **21 cenários** (postgres:16-alpine) |
| `bash catalog-manifest.test.sh` | ✅ OK |
| `bash check-reconcile-ledger-drift.test.sh` | ❌ **exit 1** — "[FAIL] replay limpo de mcp_exec não é renomeado: esperado 'mcp_exec_functions_harden', obtido 'fix_reassign_absent_agents_last_seen_at'" (**G-11**) |
| `node scripts/db-audit/check-migration-drift.mjs` | ❌ **exit 1** — "versao duplicada 20260829100000" (**G-03**; o exit 0 visto antes era artefato do pipe com `tail`) |
| `check-catalog-fresh` / `check-manifest-fresh` | ⚪ exigem JSON fresco do banco (sem acesso) — limitação mantida |

### 8.2 G-03 escalado para CRÍTICO — cadeia completa de efeitos provada

1. **CI vermelha na main AGORA:** `db-guard` run **#198** (push do PR #66, 30/08 15:28) = **FAILURE**, step 7 "Validar migrations localmente" (é o `check-migration-drift.mjs` falhando pela duplicata). O workflow tem path-filter (`supabase/**`, `src/**`…), então commits docs-only não o disparam — mas qualquer toque nesses paths herda o vermelho.
2. **db-guard NÃO é required check:** a proteção da main exige apenas "🔍 Lint & TypeCheck", "🧪 Unit Tests", "🏗️ Build" → **merges continuam com o guard de banco quebrado** (**G-10**, ALTO).
3. **G-09 (alegado CRÍTICO nesta rodada; ver errata §9):** o ledger remoto registrou `20260829100000 = fix_clear_login_operator_triple_arrow` e o arquivo irmão `get_team_profiles_active_filter.sql` (PR #59) não constava no ledger. **Errata da auditoria:** a inferência "nunca aplicado/vulnerabilidade ativa" foi feita **sem evidência runtime** — reclassificado para UNVERIFIED e, após verificação read-only (§9.1), **resolvido como Caso A: drift de ledger, função já filtrada em produção**.
4. **T2 falho (G-11):** o cenário "replay limpo" do `check-reconcile-ledger-drift.test.sh` recebe nome deslocado — bug de lógica no reconcile (`diff.mjs`/helpers) ou efeito indireto da duplicata; na CI o run morre antes no step 7 (db-guard roda este teste na L79).

### 8.3 Drift repo↔banco classificado (formaliza a etapa 010, modo leitura)

Snapshot do ledger (15:11) × arquivos locais: **REMOTO=316 · LOCAL(raiz)=301 · REMOTE_ONLY=16 · LOCAL_ONLY(≥2026-08)=0 · `_superseded`=4 / `_foreign`=7 sem colisão · 1 duplicata local**.

REMOTE_ONLY (16): `20260830010000 fix_audit_role_changes_add_update_case`, `020000 backfill_role_audit_baseline`, `030000 audit_role_permissions_trigger`, `040000 idx_audit_logs_action_created_composite`, `050000 fn_get_identity_matrix`, `060000 fix_profiles_role_check_add_special_agent`, `070000 fn_effective_role_and_sync_trigger`, `080000 fn_is_admin_and_fix_permissions_rls`, `090000 seed_special_agent_role_permissions`, `100000 fix_contacts_select_for_special_agent`, `110000 extend_special_agent_visibility_to_related_tables`, `120000 fix_agent_visibility_grants_constraints_and_policy`, `130000 fix_handle_new_user_role_with_audit`, `140000 deprecate_profiles_access_level_permissions_columns`, `150000 gate16_admin_only_write_policies`, `161547 fix_prevent_privilege_escalation_allow_internal_sync`.

**Conclusão formal: `DRIFT_BLOCKING`** — 16 remote-only (aplicadas fora do repo) + 1 correção local disfarçada por duplicata (G-09) + guard vermelho. Toda mutação de banco (Classe C/D) permanece bloqueada até reconciliação; **nenhum SQL foi executado** nesta validação.

### 8.4 Simulações da Rodada 2

| # | Simulação | Resultado |
|---|---|---|
| S-6 | Replay dos guards locais com exit codes verdadeiros (sem pipe) | drift=1, T2=1, ACL=0, catálogo=0 — confirma falhas reais, não artefatos de terminal |
| S-7 | PR #68 (`automation/audit-report`) | `action_required` — **prova viva em produção** do fallback S-1: PR de bot aguarda aprovação manual |
| S-8 | Cruzamento snapshot×arquivos (script local) | classificação §8.3 reproduzível; nenhum LOCAL_ONLY além do disfarçado |
| S-9 | Leitura das 2 migrations da duplicata | conteúdo sem segredos; ambas `CREATE OR REPLACE` idempotentes — corrigir G-03 = renomear para versão única (forward-only), com comparação do corpo remoto antes de qualquer reaplicação (ver §9.3) |

### 8.5 Ações recomendadas — Rodada 2 (reordenadas)

| # | Ação | Classe | Prioridade |
|---|---|---|---|
| R1 | **HOTFIX G-09:** aplicar no banco oficial `get_team_profiles()` com `WHERE is_active = true` (conteúdo já pronto no arquivo do PR #59) e registrar no ledger com **versão única nova**; renomear o arquivo local colidido | **C/D** (aprovação) | 🔴 CRÍTICA |
| R2 | Corrigir T2/G-11 (lógica do reconcile) e revalidar `db-guard` verde na main | B | 🔴 CRÍTICA |
| R3 | Tornar `DB Guard (offline)` required check da main (hoje só 3 checks de CI) | C (config GitHub) | 🟡 ALTA |
| R4 | Reconciliar as 16 remote-only (gerar arquivos a partir do banco, hash-conferidos) — etapa 010 | C/D | 🟡 ALTA |
| R5 | Pendências da Rodada 1: F-01..F-04, G-01, G-05 | humano | 🔴/🟡 mantém |

*Fim da Rodada 2. Errata da auditoria aplicada na Rodada 3 (§9): nesta altura o runtime ainda não havia sido verificado — G-09 era UNVERIFIED, não fato.*

---

## 9. Rodada 3 — Veredito da auditoria, runtime read-only e correções de origem (2026-08-30, ~19:00)

**Veredito recebido:** correção obrigatória; **nenhuma mutação** em banco, branch protection, Vercel ou sistema externo; G-09 exigia evidência runtime; G-11 devia ser corrigido na origem; G-03 forward-only; novo gap dos placeholders; gates completos; commits separados; sem push. **Todos os itens cumpridos abaixo.**

### 9.1 G-09 — verificação runtime read-only e classificação final: CASO A

**Prova de identidade (pré-requisito, antes de qualquer consulta):**
- MCP HTTP dedicado `supabase-zapp-web-v2-mcp` v1.1.2 (Cloudflare Workers) — **não** é o self-hosted proibido;
- `db_health` → `PostgreSQL 17.6` (projeto oficial) — qualquer divergência abortaria (script aborta em 401/403/HTTP≠200/versão≠17.6);
- Fingerprint do ledger: versões `20260829060000=reconcile_ledger_drift` e `20260830153000=webhook_failures_dead_letter` conferem com o repo → **projeto `tnnnlkbymytvtqngbbqh` comprovado**; nenhum 401.

**Coleta estritamente estrutural/agregada (script `/tmp/g09-verify.mjs`, saída sanitizada — corpo da função NUNCA impresso):**

| Medida | Valor |
|---|---|
| `pg_get_functiondef` sha256 | `0c0d1426...b332616` (registrado como evidência; corpo não publicado) |
| Função existe | true |
| Corpo contém filtro `is_active = true` | **true** |
| `SECURITY DEFINER` / `search_path` fixado | true / true (`proconfig: search_path=public`) |
| Owner / `prosecdef` | postgres / true |
| `authenticated` pode EXECUTE | true |
| `get_team_profiles()` agregado | `returned_total=3`, **`returned_inactive=0`** |
| `profiles.inactive` | **0** |
| Policies de `profiles` | 6 (4 PERMISSIVE + 1 RESTRICTIVE + 1 permissive UPDATE, todas role `authenticated`) |
| Ledger `20260829100000` | `fix_clear_login_operator_triple_arrow`, 1 statement (colisão confirmada) |
| Ledger totais | 316 migrations, latest `20260830161547` |

**Classificação (regra do veredito): CASO A** — `returned_inactive=0` **e** corpo contém filtro → **G-09 não é vulnerabilidade ativa; reclassificado como drift de ledger.**

**Evidência conflitante registrada (exigência do veredito):**
1. O PR #59 afirma que o `CREATE OR REPLACE` foi executado antes do push — **consistente com o runtime** (função filtrada em produção);
2. O PR #58 ocupou depois o mesmo prefixo `20260829100000` no ledger;
3. O nome no ledger prova a **colisão**, mas não provava o corpo — o corpo só foi provado agora (hash acima).

**Formulações corrigidas nos documentos:** "nunca aplicado" → *"DDL declarado como aplicado no PR #59, mas não representado corretamente no ledger devido à colisão"*; "vulnerabilidade provavelmente ativa" → *"estado efetivo da função em produção não verificado"* (superado pelo Caso A); "HOTFIX pronto para execução" → *"risco de exposição pendente de confirmação runtime read-only"* (resolvido: sem exposição).

### 9.2 G-11 — correção na origem (commit `57b425bd`)

- **Causa raiz confirmada:** a migration `20260829060000_reconcile_ledger_drift.sql` — o commit `7e42fc2b` substituiu o predicado evidence-gated do `45dd22e4` por `UPDATE ... SET name=... WHERE version='20260829020000'` (rename incondicional). **Não** era `diff.mjs` nem efeito de G-03.
- **Restauração integral** dos cinco gates: nome anterior esperado (`mcp_exec_functions_harden`); cardinalidade exata (1); assinatura estrutural `^CREATE OR REPLACE FUNCTION public.reassign_absent_agents(`; exclusão explícita `public.mcp_exec(_many)?(`; SHA-256 domain-separated (`zapp-migration-ledger-statements-v1` + `0x00` + `array_to_json(statements)`) pinado em `153653d2...`.
- **Prova de consistência do pin:** hash recomputado sobre o statement de evidência extraído do próprio teste (linha 118) = pin exato (`MATCH`); cenário divergente (`SELECT 99`) = hash distinto → sem colisão.
- **Aceite:** `check-reconcile-ledger-drift.test.sh` → **10/10 cenários, duas execuções consecutivas exit 0** (+ 3ª passada na bateria §9.5). Nenhum teste enfraquecido (arquivo do teste intocado desde `45dd22e4`).

### 9.3 G-03 — resolução forward-only (commit `f8e28ceb`)

- `20260829100000_fix_clear_login_operator_triple_arrow.sql` **mantido** como representante da versão registrada no ledger;
- SQL de `get_team_profiles` atribuído à versão única **`20260830170000`** (> latest remoto `20260830161547`), com header documentando canonização/replay (não hotfix — Caso A);
- **Nenhum** INSERT/UPDATE manual em `schema_migrations`; aplicação futura somente pelo mecanismo oficial de migration (registra o ledger), **após comparar o corpo remoto** (`pg_get_functiondef`) antes do `CREATE OR REPLACE`, e conferindo função/grants/agregado/ledger após aplicar;
- `check-migration-drift.mjs` agora **exit 0** (301 arquivos válidos, sem duplicata).

### 9.4 G-12 (novo) — 16 migrations remote-only: gap de reproducibilidade/fresh install

**Verificado nesta rodada:** `origin/fix/identity-authz-improvements` contém exatamente **15 arquivos placeholder** para `20260830010000`–`20260830150000`; amostra inspecionada contém apenas `SELECT 1234567890, true, null, 'bravo'; -- no-op` com nota "placeholder — actual DDL recorded in audit docs" — **placeholders SELECT não são migrations reproduzíveis**. `20260830161547` (`fix_prevent_privilege_escalation_allow_internal_sync`) **não existe em nenhum ref do Git**. (`20260830153000` é arquivo real — não é placeholder.)

**Plano por versão (etapa 010/061, mediante autorização):** recuperar statements exatos do ledger quando disponíveis; complementar com `pg_get_functiondef`/`pg_get_triggerdef`/`pg_get_expr`/`pg_get_indexdef`/`pg_policies`/constraints; gerar DDL forward/replay-safe; testar em PostgreSQL 17 vazio; comparar catálogo e manifesto resultantes com produção; **proibir merge de placeholders que apenas mascaram paridade numérica**.

### 9.5 Bateria de gates obrigatórios (item 8 do veredito) — 13/13 exit 0

| Gate | Exit | Gate | Exit |
|---|---|---|---|
| `node --test scripts/ci/*.unit.mjs` | 0 | `check-reconcile-ledger-drift.test.sh` | 0 |
| `check-workflow-pins.mjs` | 0 | `check-migration-drift.mjs` | 0 |
| `supabase-usage-guard.mjs` | 0 | `bun run typecheck` | 0 |
| `node --test scripts/db-audit/*.test.mjs` | 0 | `bun run test` | 0 |
| `catalog-manifest.test.sh` | 0 | `bun run build` | 0 |
| `check-mcp-exec-acl.test.sh` | 0 | `git diff --check` / `git show --check HEAD` | 0 / 0 |

### 9.6 DB Guard como required check — plano (item 6; **não executado** — exige push e mutação de branch protection)

1. Deixar o check verde na main (correções `57b425bd`+`f8e28ceb` prontas localmente; **pendente de push autorizado**);
2. Remover o paths-filter do `pull_request` ou implementar check agregador que sempre reporte resultado (edição de workflow — futura, própria aprovação);
3. Nome exato do check confirmado: **"Contrato DB offline"**;
4. Testar PR docs-only e PR com migration;
5. Só então solicitar autorização para alterar branch protection.

### 9.7 Erratas aplicadas aos documentos

- G-09 → UNVERIFIED → **Caso A (drift de ledger)** em §8.2-3, diário §3 e §5.8.2; formulações do veredito substituídas;
- Causa raiz de G-11 corrigida (migration, não `diff.mjs`) em §8.2-4 e diário;
- "sem risco de schema" removido de S-9;
- "validação exaustiva completa" da Rodada 2 qualificada por errata (runtime não verificado naquela altura);
- Registrado: `git show --check` = limpo nos commits novos; **`.claude/settings.local.json` permanece untracked e intocado** (apolício a esta auditoria; não modificado).

*Nenhum SQL de escrita, push, dispatch ou mutação externa foi executado na Rodada 3. Logs brutos dos gates em `/tmp/gate-*.log`.*


