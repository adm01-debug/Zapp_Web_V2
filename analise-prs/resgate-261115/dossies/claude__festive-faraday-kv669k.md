# claude__festive-faraday-kv669k — auditoria Supabase (PRs #2414 e #2506)

- `ref`: `origin/claude/festive-faraday-kv669k` · tip `e3fa619cf` · merge_base `78df1b8` (2026-10-31) · 24 commits
- 22 arquivos, +2340/-263, **100% documentação de auditoria** em `auditoria-supabase/` (relatório, inventário JSON, propostas SQL, teste de matriz RLS). Zero código de app, zero migration aplicável.
- `refs/remotes/pr/2414` aponta para `4ce6db47d`, que é commit **desta branch** → PR #2414 = esta mesma branch em estado anterior (PR #2506 = tip final). Diff 2414→tip: só RELATORIO (+54), progresso.json (+273), testes/01_rls_matrix.sql (+147).

## Propósito
Auditoria exaustiva somente-leitura do Supabase de produção `tnnnlkbymytvtqngbbqh` em 2026-10-30/31: 12 seções (S01–S12), 47 achados (C-01..C-03, A-01..A-08, M-01..M-17, B-01..B-13, I-01..I-06), 10 propostas de correção (SQL/MD, todas marcadas "NAO APLICAR SEM APROVACAO") e um script de matriz RLS A×B.

## Prova central de absorção
`origin/main:auditoria-supabase/achados.json` (PR #2844, 2026-11-10) consolida três auditorias e lista como fonte, textualmente:
`"PR #2414 (47 achados A/M/C)"` — exatamente a taxonomia e o total desta branch (3 C + 8 A + 17 M + 13 B + 6 I = 47). Ou seja: os achados foram lidos e migrados para o ledger `achados.json` (48 achados ZW-nnnn) **sem** mergear os arquivos da branch.
Além disso, PR #2630 (2026-11-02) moveu a prosa de auditoria para `docs/_arquivo/auditoria-supabase/` ("arquiva prosa morta") — reinstalar 2.340 linhas de prosa em `auditoria-supabase/` contraria essa direção.

## Arquivo × achado × evidência

| Arquivo (branch) | Achado | Evidência |
|---|---|---|
| `auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` (+714) | Superado | main tem relatório próprio de 840 linhas (`origin/main:auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md`) + `achados.json` 48 ZW; versão antiga arquivada em `docs/_arquivo/auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` |
| `auditoria-supabase/progresso.json` (+228/-87) | Superado | `origin/main:auditoria-supabase/progresso.json` (483 linhas, PR #2844) |
| `auditoria-supabase/inventario/*.json` + `RESUMO.md` (9 arquivos) | Superado | main tem `docs/_arquivo/auditoria-supabase/inventario/S01_*..S12_lacunas.json` cobrindo as mesmas seções |
| `propostas/FIX-S03-004.sql` (REVOKE TRUNCATE de anon) | **Já aplicado** | prod 2026-11-15: `TRUNCATE` grants p/ anon em public = **0**; migration `supabase/migrations/20261030135126_*` (citada em ZW-0001/ZW-0046) |
| `propostas/FIX-S03-005.sql` (REVOKE SELECT de anon) | **Já aplicado** | prod: `SELECT` grants p/ anon em public = **0**; `supabase/migrations/20261108204000_revoke_anon_select_grants_all_tables.sql` |
| `propostas/FIX-S03-003.sql` (department_invites DELETE USING(true)) | **Já corrigido, outra abordagem** | `supabase/migrations/20261102012200_department_invites_restringe_escrita.sql` dropa `dept_invites_delete_authenticated`; prod hoje só tem `dept_invites_delete_admin qual=is_admin(auth.uid())` |
| `propostas/FIX-S03-002.sql` (policies p/ 17 tabelas com RLS sem policy) | **Obsoleta por decisão oposta** | main decidiu documentar como intencional: `supabase/migrations/20261026220300_classificar_rls_sem_policy.sql` põe `COMMENT ... '[RLS-sem-policy: intencional]'` em ai_jobs, ai_budget_reservations, edge_rate_limits, link_preview_cache, voip_profile_credentials etc. Achado registrado como ZW-0032 (INFO) |
| `propostas/FIX-S03-001.sql` (mcp_exec) | Achado aberto na main | `achados.json` ZW-0013 MEDIO (mcp_exec/mcp_exec_many) |
| `propostas/FIX-S02-001.md` (65 migrations com statements NULL) | Achado aberto na main | ZW-0012 MEDIO (reverificado 2026-11-08: 64) |
| `propostas/FIX-S03-006.sql` (WITH CHECK em 4 policies) | Achado aberto na main | ZW-0007 ALTO (46 policies UPDATE sem WITH CHECK; PR #2481 citada). Prod hoje: as 4 policies ALL sem `with_check` continuam (reminders, catalog_favorites, copilot_insights/vendor_own_insights, copilot_sessions/vendor_own_sessions) |
| `propostas/FIX-S06-001.sql` (escalonar 3 crons) | Premissa refutada na main | ZW-0004: hipótese de saturação de pool **REFUTADA** em 2026-11-08; padrão real = blip simultâneo. Crons inalterados em prod (`crm-sync-outbox=1-59/2`, `expire-stale-agent-presence=1-59/2`, `csat-reply-capture-tick=*/2`) |
| `propostas/FIX-S09-002.sql` (multiplix-voice: MIME + policy) | Parte registrada | MIME registrado na main: relatório linha 587 `S09-002 MÉDIO multiplix-voice allowed_mime_types=null` + plano 🟡4. Prod hoje: `allowed_mime_types=NULL` e **nenhuma** policy de `storage.objects` citando `multiplix-voice` (bucket privado → risco baixo) |
| `propostas/FIX-S09-001.md` (MFA) | **LACUNA: achado não registrado** | `grep -ic mfa` em `origin/main:auditoria-supabase/achados.json` = **0** e no relatório da main = **0**. Prod 2026-11-15: `auth.mfa_factors` total=**0**, verified=**0** |
| `testes/01_rls_matrix.sql` (+192/-114, 254 linhas) | **LACUNA parcial** | main só tem a versão antiga arquivada `docs/_arquivo/auditoria-supabase/testes/01_rls_matrix.sql` (154 linhas, matriz 8×8 — ZW-0037 INFO). A da branch cobre 19 testes A×B em 4 tabelas (messages, contacts, email_threads, profiles) + 1 de integridade |

## Veredito: PERDIDA_PARCIAL (quase toda OBSOLETA)
20 dos 22 arquivos estão superados com prova (consolidação em `achados.json`, arquivamento em `docs/_arquivo`, ou correção já aplicada em produção). Sobram duas lacunas de baixo/médio valor, ambas documentais.

## Lacunas a recuperar (hunks essenciais)

### 1. Achado MFA (A-07) — não existe no ledger da main · valor médio
Verificado em produção hoje: `select count(*) from auth.mfa_factors` → 0 (total e verified).
Texto da branch (`auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md:597`):
> MFA: infraestrutura implantada (`mfa_factors`, `mfa_recovery_codes`, `webauthn_credentials`) porém **0 fatores ativos** — achado A-07.

Proposta (`auditoria-supabase/propostas/FIX-S09-001.md`), resumo portável:
- Problema: nenhum dos 10 usuários tem MFA; sistema guarda mensagens WhatsApp, e-mails, contatos e configuração de produção → senha comprometida = acesso total.
- Correção: **não é SQL** — Dashboard `.../project/tnnnlkbymytvtqngbbqh/auth/policies` → "Multi-Factor Authentication" → "Enforce MFA for all users"; comunicar os 10 usuários (TOTP/WebAuthn no próximo login).
- Verificação: `SELECT u.email, count(f.id) FILTER (WHERE f.status='verified') FROM auth.users u LEFT JOIN auth.mfa_factors f ON f.user_id=u.id GROUP BY u.id,u.email;`
- Rollback: desabilitar "Enforce MFA".
Forma de recuperação recomendada: **um achado novo em `auditoria-supabase/achados.json`** (ex.: ZW-0049, SEGURANÇA, severidade a critério, `origem: "S09-001 / A-07 / PR #2414"`), não o arquivo `.md` inteiro. Ligar MFA obrigatório muda o login de todos → decisão do dono, não do agente.

### 2. Complemento de `multiplix-voice` (opcional) · valor baixo
Main registra só o MIME. A branch também propõe policy de bucket:
```sql
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm','audio/aac']
WHERE id = 'multiplix-voice';

CREATE POLICY "multiplix-voice-service-role" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'multiplix-voice') WITH CHECK (bucket_id = 'multiplix-voice');
```
Confirmado em prod hoje: `allowed_mime_types=NULL`, zero policy de `storage.objects` referenciando o bucket (privado).

### 3. Matriz RLS expandida · valor baixo
`git show origin/claude/festive-faraday-kv669k:auditoria-supabase/testes/01_rls_matrix.sql` (254 linhas) — 19 testes de isolamento tenant A×B em messages/contacts/email_threads/profiles + 1 de integridade, com setup próprio e aviso de rodar como role NOSUPERUSER em Postgres descartável. Substituiria `docs/_arquivo/auditoria-supabase/testes/01_rls_matrix.sql` (154 linhas, 8 testes). É script manual, não entra em CI (`e2e/`, `scripts/ci/`).

## apagar_branch_seguro: false
As lacunas 1–3 só existem nesta branch. Depois de registrado o achado MFA (e, se quiserem, portada a matriz RLS para `docs/_arquivo/auditoria-supabase/testes/`), a branch pode ser apagada.

## Verificação adversarial

Parecer: **DISCORDO** da triagem. Veredito corrigido: **OBSOLETA** · `apagar_branch_seguro = true`.
As três lacunas alegadas caem na verificação. `origin/main` = `dac285f62` (2026-11-15).

### Lacuna 1 (MFA, "valor médio") — REFUTADA: está na main
A triagem buscou só em `auditoria-supabase/achados.json` e no relatório. O achado existe na main, com o
mesmo diagnóstico e a mesma correção, em `origin/main:docs/_arquivo/auditoria-supabase/inventario/07_auth.md`:
- linha 11: `| MFA factors cadastrados | **0** (HIGH-7) |`
- linhas 37-41: seção `## MFA (0 factors) — HIGH-7` + evidência `SELECT count(*) FROM auth.mfa_factors; -- Resultado: 0`
- linha 45 (impacto): "Nenhum dos 10 usuários tem MFA ativo… um único fator comprometido (senha) é suficiente para acesso total"
- linha 47 (correção): "Habilitar MFA obrigatório em Auth Settings da dashboard do Supabase para todos os usuários (TOTP via app). Não requer migration." + esforço 15 min
Também há item de ação na doc viva: `origin/main:docs/INCIDENT-RUNBOOK.md:186` "- [ ] Considerar habilitar MFA obrigatório".
`FIX-S09-001.md` da branch (27 linhas) não acrescenta nada além da URL do painel e do passo "comunicar os 10 usuários" — o conteúdo técnico já está na main. Produção reconfirmada agora (db_query, leitura): `auth.mfa_factors = 0`, `auth.users = 10` — o fato é real, mas **não é trabalho perdido desta branch**.

### Lacuna 2 (policy do bucket `multiplix-voice`, "valor baixo") — REFUTADA: coberta + decisão oposta da main
- MIME registrado na main: `auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md:464` (S03-008), `:587` (S09-002) e plano `:730` "🟡 4 Restringir MIME types do bucket multiplix-voice"; detalhe e risco em `docs/_arquivo/auditoria-supabase/inventario/05_buckets.md:27,39-40,55` (LOW-3, "risco real: baixo").
- A policy de `storage.objects` é no-op: bucket privado, **0 objetos** em produção (`select count(*) from storage.objects where bucket_id='multiplix-voice'` → 0) e RLS sem policy já bloqueia tudo fora de service_role — o próprio arquivo da branch admite ("O acesso atual ja e service_role only pela ausencia de policies").
- A main decidiu o oposto: `supabase/migrations/20261026220300_classificar_rls_sem_policy.sql` documenta RLS-sem-policy como **intencional** via `COMMENT ... '[RLS-sem-policy: intencional]'` em vez de criar policies service_role. Criar a policy contraria a decisão vigente.

### Lacuna 3 (matriz RLS de 254 linhas / 19 testes, "valor baixo") — REFUTADA: testa schema fictício
O script monta um schema próprio `org_id`-based (`origin/claude/festive-faraday-kv669k:auditoria-supabase/testes/01_rls_matrix.sql`, PARTE 1: `CREATE TABLE profiles (… org_id uuid NOT NULL …)`, `contacts`, `email_threads`, `get_my_org_id()`).
Produção não tem `org_id` em nenhuma dessas tabelas (db_query em `information_schema.columns`, 2026-11-15):
`contacts=0, email_threads=0, messages=0, profiles=0` colunas `org_id`.
A própria branch admite em `progresso.json:15`: "rls_esquema_real: NAO_VERIFICADO … isolamento real usa contact_id/assigned_to/gmail_account_id, **não org_id**". Logo os 19 PASS valem para um schema inventado, não para o Zapp.
A main tem a cobertura real do mesmo tema: `docs/audits/rls-matrix-2026-09-16.md` (matriz ao vivo, 144/144 tabelas), `src/__tests__/rls-boundary.test.ts`, `scripts/db-tests/05-rls-smoke.sql` e `scripts/db-audit/{dashboard-rls-authorization,email-rls-sem-ramo-admin,email-signatures-rls,multiplix-rls,scheduled-whisper-visibility-rls,talkx-settings-rls}.test.sh` — todos contra o schema verdadeiro. Substituir isso por um matriz sintético seria regressão.

### Conclusão
Nenhum hunk de valor ≥ médio sobrevive. 22/22 arquivos estão superados (consolidação em `achados.json` com `PR #2414` como fonte declarada, prosa em `docs/_arquivo/auditoria-supabase/`, correções já aplicadas em produção ou decisões opostas documentadas). Branch pode ser apagada sem recuperar nada.

Observação de higiene (da main, não da branch): o achado MFA está só em `docs/_arquivo/…/07_auth.md` (HIGH-7) e não tem ZW no ledger `auditoria-supabase/achados.json`. Se o dono quiser rastreá-lo, é uma linha nova no ledger — ligar "Enforce MFA" muda o login dos 10 usuários e é decisão dele. Não depende desta branch.
