# Auditoria de Identidade e Autorização — ZAPP WEB V2
**Data:** 2026-08-30  
**Auditor:** Claude (sessão de engenharia)  
**Banco:** `tnnnlkbymytvtqngbbqh` (299 migrations, PG 17.6)  
**Repo:** `adm01-debug/Zapp_Web_V2` @ `7e42fc2b`

---

## Estado Antes das Correções (baseline)

| Métrica | Valor |
|---|---|
| auth.users | 3 |
| user_roles | 3 (2 admin, 1 agent) |
| profiles | 3 (2 admin, 1 agent — em sincronia) |
| policies totais | 366 |
| policies usando is_admin_or_supervisor | 234 |
| functions públicas | 67 |
| role_permissions.special_agent | 0 |
| agent_visibility_grants | 0 |
| edge functions sem auth check | 36 de 42 com service_role |

## Achados Críticos e Resolução

| ID | Severidade | Achado | Resolução | Migration |
|---|---|---|---|---|
| F01 | CRÍTICO | audit_role_changes() sem ramo UPDATE — promoções invisíveis | Adicionado ramo UPDATE + backfill | 20260830010000 / 020000 |
| F02 | ALTO | Supervisor = admin nas 234 policies — pode reescrever matriz RBAC | permissions/role_permissions → is_admin() | 20260830080000 |
| F03 | ALTO | 36 edge functions com service_role sem auth | requirePermission/requireRole em funções críticas | code: authz.ts |
| F04 | ALTO | profiles.role CHECK sem special_agent | Constraint atualizada | 20260830060000 |
| F05 | ALTO | WhisperMode.tsx usando profiles.role para auth | Trocado por useUserRole() | code |
| F06 | ALTO | special_agent sem role_permissions | Seed com 7 permissões | 20260830090000 |
| F07 | MÉDIO | contacts SELECT não usava get_visible_agent_ids | Policy reescrita | 20260830100000 |
| F08 | MÉDIO | create-user com .single() em user_roles | Trocado por has_role RPC | code |
| F09 | MÉDIO | handle_new_user_role sem auditoria nem allowlist | Adicionado audit + configuração de domínio | 20260830130000 |
| F10 | MÉDIO | access_level/permissions jsonb sem uso | Deprecated via COMMENT | 20260830140000 |
| F11 | MÉ�IO | Apenas 2 rotas com requiredRoles | 4 rotas adicionadas com requiredPermission | code |
| F12 | MÉDIO | safetyForced → falso Acesso Negado em rede lenta | Substituído por retry-first | code |
| F13 | BAIXO | permissions/role_permissions SELECT aberto a todos | Restrito a admin/supervisor | 20260830080000 |
| F14 | BAIXO | Sem CHECK agent_id<>can_see_agent_id | Constraint adicionada | 20260830120000 |
| F15 | BAIXO | 2 contas com last_sign_in=null desde maio | Relatório em dormant-accounts.md | – |

## GATE 16 — APLICADO (2026-08-30, migration 20260830150000)
15 policies de escrita em 7 tabelas administrativas flipadas para `is_admin()`.
SELECTs de supervisor preservados. Detalhes em `policy-role-matrix.md`.

## Arquitetura de Autorização Pós-Correção

```
auth.users
  └─ user_roles (N rows; UNIQUE user_id,role) ← fonte canßnica
        ┌─ TRIGGER audit_user_role_changes ‒ audit_logs (F01 FIXED)
        └─ TRIGGER sync_profile_role → profiles.role (derivado) (STEP 10)

Funções de guarda (SECURITY DEFINER, search_path fixo):
  has_role(uid, role)              ‒ check exato de papel
  is_admin(uid)                   → alias limpo (NOVO)
  is_admin_or_supervisor(uid)     → alias duplo (existente)
  effective_role(uid)            ‒ maior papel (NOVO; resolve multi-papel)
  user_has_permission(uid, name)  ‒ via role_permissions (NOVO uso em edge fns)

Permissões (role_permissions):
  admin: 21/21
  supervisor: 12/21
  special_agent: 7/21 (NOVO seed)
  agent: 6/21
```