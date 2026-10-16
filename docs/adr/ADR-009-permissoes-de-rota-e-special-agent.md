# ADR-009 — Permissões de rota e papel `special_agent` no Zapp Web V2

**Status:** Decidido — registro da decisão (paridade V3 → V2). Nenhuma linha de código de produto foi alterada.
**Data:** 2026-10-13
**Contexto:** auditoria de paridade V3 → V2 (documento 17 a 40); V3 é só referência (`~/projetos/Zapp_Web_V3`, lida com `git -C ~/projetos/Zapp_Web_V3 show origin/main:<caminho>`).

## Decisão adotada

1. **NÃO portar o `route_permissions` dinâmico** da V3 para o V2.
2. **NÃO remover** o papel `special_agent` do V2.

As duas são confirmadas com evidência local abaixo.

---

## 1. Route permissions dinâmico (V3 `RoutePermissionsPage`/`useRouteRoles`) — NÃO portar

**Como o V3 faz (evidência local):**
- Hook de leitura: `Zapp_Web_V3` `src/features/auth/hooks/useRouteRoles.ts:30` lê `route_permissions.allowed_roles` por `path`; cache por path; `null` = "sem override, usar o padrão hardcoded".
- Aplicação: `Zapp_Web_V3` `src/features/auth/components/ProtectedRoute.tsx:90` (`// Dynamic override from route_permissions table`) — o override só decide **renderizar ou não** a rota na interface.
- Página: `Zapp_Web_V3` `src/pages/admin/RoutePermissionsPage.tsx` (`/admin/route-permissions`).
- Papéis do V3: `src/features/auth/hooks/useUserRole.ts:25` → `AppRole = 'dev' | 'admin' | 'manager' | 'supervisor' | 'agent'`.

**Por que NÃO portar:**
- **O mecanismo da V3 é só de interface, não é fronteira de segurança.** Como o próprio alvo do cartão registra, na V3 ele "só esconde a rota na interface" — a autorização real é a **RLS**. Portar um override de UI não aumenta a proteção do V2.
- **O V2 já tem autorização por papel × permissão, que é o que vale.** `src/components/permissions/PermissionMatrix.tsx:12-16` monta a matriz dos papéis `admin`/`supervisor`/`agent` sobre `permissions`/`role_permissions`, e `src/hooks/system/usePermissions.ts:99` checa no servidor via RPC `user_has_permission` (`SECURITY DEFINER`). Isso é autorização de verdade, por permissão — a V2 não fica atrás.
- **O gate por papel do V2 já existe** e nega por padrão: `src/components/auth/ProtectedRoute.tsx:121` (`requiredRoles.some(role => hasRole(role))`) e `src/routes/AppRoutes.tsx:145,153` (`requiredRoles={["admin"]}`). Não há lacuna de autorização a fechar aqui.
- **Criar `route_permissions` seria DDL/migration** (tabela nova + policies + quem edita), fora do escopo deste cartão (que é só documentar) e sem ganho de segurança. No V2 não existe essa tabela: `git grep -n "route_permissions" -- src supabase` não retorna nada.

**Conclusão:** a lacuna alegada **não procede** para o V2. Nada a implementar.

---

## 2. Papel `special_agent` — NÃO remover

**Evidência local (V2 usa de verdade):**
- Papel seedado com permissões: `supabase/migrations/20260830090000_seed_special_agent_role_permissions.sql:8-11` ("special_agent VÊ mais dados que agent mas NÃO gerencia nada").
- A RLS **depende** dele: `supabase/migrations/20260909200000_harden_inbox_contact_authorization.sql:38` lê `agent_visibility_grants` e `:46` condiciona a visão estendida a `role_assignment.role = 'special_agent'`; a policy de SELECT dos próprios grants está em `supabase/migrations/20260830120000_fix_agent_visibility_grants_constraints_and_policy.sql:15-19`. `git grep -n "special_agent" -- supabase/migrations` conta 30 ocorrências.
- No V3 o papel foi tratado como descontinuado — `useUserRole.ts:25` não o lista —, mas **a V2 ainda o usa em RLS**. Removê-lo quebraria as policies de visibilidade e o seed.

**Conclusão:** manter `special_agent` no V2. Nada a alterar.

---

## Observação (não decidida aqui)

A `PermissionMatrix` do V2 **não exibe** aba de `special_agent` (`PermissionMatrix.tsx:12-16` e `:35` listam só `admin`/`supervisor`/`agent`), embora o hook já aceite o papel (`src/hooks/system/usePermissions.ts:13`). É uma diferença de UI, **não** de autorização; se um dia entrar, vai em cartão de front/estado próprio, com teste — **fora** deste ADR.

## Evidência (como reconferir)

```
# V2 não tem a tabela (lacuna não existe)
git grep -n "route_permissions" -- src supabase                      # (vazio)
# autorização real do V2
git grep -n "user_has_permission\|rolePermissions" -- src/hooks/system/usePermissions.ts
# gate por papel (nega por padrão)
git grep -n "requiredRoles" -- src/routes/AppRoutes.tsx src/components/auth/ProtectedRoute.tsx
# special_agent no V2 (papel + RLS)
git grep -n "special_agent" -- supabase/migrations | grep -i "role\|visibility"
# lado V3 (referência)
git -C ~/projetos/Zapp_Web_V3 ls-tree -r --name-only origin/main | grep -iE "RoutePermissions|useRouteRoles"
```
