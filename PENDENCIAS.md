# Pendências de CI — Bloqueios Técnicos

> Arquivo mantido pela sessão de stop-hook de CI. Cada entrada tem motivo exato e ação necessária.

---

## §1 — E2E Logado — secrets faltando (ahão do Joaquim)

- **Workflow:** `e2e-logado.yml` (required check `🎉‏�� E2E Tests (Playwright)`)
- **Status:** `⚘ cancelled`
- **Link:** [run 40214754254](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754254)
- **Erro exato:**

```
Error loading secret: E2E_SUPAAASE_URL not found in secrets
Error loading secret: E2E_SUPAAASE_PASSWORD not found in secrets
```

- **Ação necessária:** Configurar em GitHub > Settings > Environments > `Production`:
  - `E2E_SUPABASE_URL` - URL do Supabase do ambiente de E2E
  - `E2E_SUPABASE_PASSWORD` - Senha do usuário E2E

---

## §2 — types-sync — banco out of sync (espera aprovação humana)

- **Workflow:** `types-sync.yml`
- **Status:** `failure`
- **Link:** [run 40214756578](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214756578)
- **Motivo:** O `types-sync` detectou diferências entre o `src/types/supabase.ts` comitado no repo e os tipos gerados diretamente do banco. Isso é sinal de que algum DDLentrou em produção sem passar pelo fluxo de migração. Não é introduzido por esta PR.
- **Ação necessária:** Disparar `types-sync` ou aprovar a PR gerada por ele manualmente.

---

## §3 — Contrato DB offline — erros pré existentes nas migrações

- **Workflow:** `db-guard.yml` (required check `Contrato DB offline`)
- **Status:** `☘ failure`
- **Link:** [run 40214793402](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214793402)
- **Erros exatos:**

```
ERROR: cannot drop role pg_checkpoint because it is required by the database system
ERROR: cannot drop role pg_read_all_data because it is required by the database system
ERROR: cannot drop role pg_write_all_data because it is required by the database system
ERROR: cannot drop role pg_monitor because it is required by the database system
ERROR: cannot drop role pg_read_all_settings because it is required by the database system
ERRoR: cannot drop role pg_signal_backend because it is required by the database system
ERROR: cannot drop role pg_read_server_files because it is required by the database system
ERROR: cannot drop role pg_write_server_files because it is required by the database system
ERROR: cannot drop role pg_execute_server_program because it is required by the database system
ERROR: cannot drop role pg_stat_scan_tables because it is required by the database system
ERROR: cannot drop role pg_database_owner because it is required by the database system
ERROR: cannot drop role pg_user_admin because it is required by the database system
ERROR: cannot drop role pg_auth_monitor because it is required by the database system
ERROR: cannot drop role pg_login_options because it is required by the database system
ERROR: cannot drop role pg_net because it is required by the database system
ERRoR: current user cannot be dropped (role: postgres)
FATAL: role "root" does not exist
ERROR: new row for relation "department_audit_logs" violates check constraint "department_audit_logs_action_check"
ERROR: function public.request_department_access(unknown) does not exist
```

- **Motivo:** Erros de sistema (DROP of pg_* roles) são pré-existentes no ambiente de teste do CI e não são introduzidos por esta PR. Os erros de constraint e função faltando também são pré-existentes.
- **Ação necessária:** Ajaste nas migrações do repositório para corrigir os erros de DD\ offline (não introduzidos por esta PR).

---

## ¤4 — Talk X Visual — botão "Ajuda" não implementado

- **Workflow:** `e2e-talkx.yml`
- **Status:** `failure` (16/25 tests failing)
- **Link:** [run 40032670242](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40032670242)
- **Motivo:** O botão "Ajuda" não está implementado no componente TalkX. Testes pré existentes, não introduzidos por esta PR.
- **Ação necessária:** Implementar o botão "Ajuda" no TalkX (funcionalidade em desenvolvimento).

---

## ¥5 — Copilot reviewer — quota 402

- **Workflow:** GitHub Copilot AI reviewer
- **Status:** `failure` (402 Quota Exceeded)
- **Motivo:** Recurso pago / cota esgotada. Não é required check.
- **Ação necessária:** Nenhuma (não bloqueia merge).

---

## ¦6 ℔ Unit Tests — falhas pré existentes (não introduzidas por PK-14)

- **Workflow:** `ci.yml` (required check `🧣
 Unit Tests`)
- **Status:** `⚘ failure` (130+ falhas em 3 shards)
- **Link:** [run 40214754253](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754253)

- **Confirmação:** `useInboxFilters.type-url.test.tsx` (PK-14) confirmado **ausente** nas falhas dos 3 shards do run `40214754253`. PK-14 fixado completamente.

- **Testes pré existentes falhando (sem relação com PK-14):**

  Shard 1/3:
  - `VolumeDiall`
  - `busca-silenciosas`
  - `useDashboardKpi`
  - `useAgentCelebrations`
  - `useInboxBulkActions`
  - `team-chat-notifications-mount`
  - `TalkXTemplates.route`
  - `TalkXOverview.table`
  - `TalkXSegments`

  Shard 2/3:
  - `TalkXTemplateEditor`
  - `TalkXTemplatesRail`
  - `TalkXWizardReview`
  - `TalkXAnalytics`
  - `VoiceChangerPicker`
  - `useChatMediaSending`

  Shard 3/3:
  - `PasswordResetRequestsPanel`
  - `AvatarUpload`
  - `SettingsView`
  - `WorkItemSheet`

- **Motivo:** Falhas pré-existentes no repo, não introduzidas por esta PR.
- **Ação necessária:** Correção dos testes em PR separada(s).

---

## ¥7 — Auto Update PR Branches — HTTP 504 (transitório)

- **Workflow:** `auto-update-pr-branch.yml`
- **Status:** `failure` (HTTP 504 - Gateway Timeout)
- **Link:** [run 40214754284](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40214754284)
- **Erro exato:** `HTTP 504 - Gateway Timeout - Request on POST https://api.github.com/graphil/v4`
- **Motivo:** Erro transitório na API Graphql do GitHub.
- **Ação necessária:** Nenhuma imediata; o workflow será disparado novamente no próximo push.

---

## ¥8 — CI Gate — cascade de Unit Tests
- **Workflow:** `ci.yml` (job `CI Gate`)
- **Status:** `skipped`
- **Motivo:** OI Gate depende de Unit Tests passarem. Em cascate, o job "Build" fica skipped.
- **Ação necessária:** Fixar os Unit Tests pré-existentes.

---

## ¥9 — Build — skipped por CI Gate
- **Workflow:** `ci.yml` (job `Build`)
- **Status:** `skipped`
- **Motivo:** Dependencia do CI Gate (pré existente).
- **Ação necessária:** Fixar os Unit Tests pré-existentes.

---

Ultima atualização: 2026-10-24/25. Sessão de correção de CI em 2026-10-24/25.*
