Especialista: hugo

## O que mudou e por quê
- src/lib/audit.ts: `logAudit` agora passa por `normalizeEntityId` (nova função exportada). Se o `entityId` não for UUID (rota `/painel`, JID do WhatsApp, e-mail), ele não vai para `p_entity_id`: vira `null` na coluna e o texto vai para `details.entity_id_text`. Motivo: `audit_logs.entity_id` é uuid e o `log_audit_event` converte o texto — valor inválido vira NULL e a rota tentada se perdia (era o NULL visto nas linhas `unauthorized_access`). Paridade V3 (`audit.ts normalizeEntityId`).
- src/lib/audit.ts: `isValidUUID` (regex RFC 4122, case-insensitive) local, sem dependência nova.
- src/lib/__tests__/audit.test.ts: os casos que passavam `u1`/`c1` como entityId agora usam UUID (a coluna é uuid); novos casos cobrem rota não-UUID indo para `details.entity_id_text`, com e sem detalhes, com espaços nas bordas, entityId vazio (não polui detalhes) e os unitários de `normalizeEntityId`.
- src/components/auth/__tests__/ProtectedRoute.auditoria-rota.test.tsx: teste de integração com o `logAudit` REAL (sem mock de `@/lib/audit`) — renderiza o ProtectedRoute, negação de papel, e confere que o RPC recebe `p_entity_id: null` e `p_details.entity_id_text: '/painel'`.

## Prova
- vermelho antes: `npx vitest run src/lib/__tests__/audit.test.ts` (sem a mudança em audit.ts) → `Tests  10 failed | 3 passed (13)` (`TypeError: normalizeEntityId is not a function` e as asserções de `p_details.entity_id_text`).
- verde depois: `npx vitest run src/lib/__tests__/audit.test.ts src/components/auth/__tests__/ProtectedRoute.auditoria-rota.test.tsx src/components/auth/__tests__/ProtectedRoute.acesso-negado.test.tsx` → `Test Files 3 passed (3); Tests 20 passed (20)`.

## O que NÃO fiz e por quê
- Não toquei em `ProtectedRoute.tsx`: ele continua mandando `entityId: location.pathname` como antes (o cartão pede a correção em `audit.ts`, que é onde a normalização da V3 vive). O teste existente `ProtectedRoute.acesso-negado.test.tsx` segue verde.
- Não mexi em migration nem no `log_audit_event`: a normalização é no front, como na V3.
