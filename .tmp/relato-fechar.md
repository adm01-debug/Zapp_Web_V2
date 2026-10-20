Especialista: hugo
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 28s;OK lint 5s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (14/10 07:31, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     | 33 +++-----
 .../ProtectedRoute.auditoria-rota.test.tsx         | 74 +++++++++++++++++
 src/lib/__tests__/audit.test.ts                    | 94 ++++++++++++++++++++--
 src/lib/audit.ts                                   | 38 ++++++++-
 4 files changed, 209 insertions(+), 30 deletions(-)
```
- Testes alterados neste cartão (2 arquivo[s]) rodados AGORA no seu commit: Test Files 2 passed (2);Tests 14 passed (14)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:requireRole|isAdmin|


## O que mudou e por quê
- src/lib/audit.ts: `logAudit` agora passa por `normalizeEntityId` (nova função exportada). Se o `entityId` não for UUID (rota `/painel`, JID do WhatsApp, e-mail), ele não vai para `p_entity_id`: a chave é omitida (Postgres aplica DEFAULT NULL → coluna uuid fica NULL) e o texto vai para `details.entity_id_text`. Motivo: `audit_logs.entity_id` é uuid e o `log_audit_event` converte o texto — valor inválido vira NULL e a rota tentada se perdia (era o NULL visto nas linhas `unauthorized_access`). Paridade V3 (`audit.ts normalizeEntityId`).
- src/lib/audit.ts: `isValidUUID` (regex RFC 4122, case-insensitive) local, sem dependência nova.
- src/lib/__tests__/audit.test.ts: os casos que passavam `u1`/`c1` como entityId agora usam UUID (a coluna é uuid); novos casos cobrem rota não-UUID indo para `details.entity_id_text`, com e sem detalhes, com espaços nas bordas, entityId vazio (não polui detalhes) e os unitários de `normalizeEntityId`.
- src/components/auth/__tests__/ProtectedRoute.auditoria-rota.test.tsx: teste de integração com o `logAudit` REAL (sem mock de `@/lib/audit`) — renderiza o ProtectedRoute, negação de papel, e confere que o RPC recebe `p_entity_id` omitido e `p_details.entity_id_text: '/painel'`.

## Prova
- vermelho antes: `npx vitest run src/lib/__tests__/audit.test.ts` (antes da mudança em audit.ts) → `Tests  10 failed | 3 passed (13)` (`TypeError: normalizeEntityId is not a function` e as asserções de `p_details.entity_id_text`).
- verde depois: `npx vitest run src/lib/__tests__/audit.test.ts src/components/auth/__tests__/ProtectedRoute.auditoria-rota.test.tsx src/components/auth/__tests__/ProtectedRoute.acesso-negado.test.tsx` → `Test Files 3 passed (3); Tests 20 passed (20)`.
- verificação do cartão: `zapp-verify . --rapido` → `OK tipos / OK lint / OK migrations / OK db_guard` e `VERIFY: VERDE SEM BANCO (34s)`.

## O que NÃO fiz e por quê
- Não toquei em `ProtectedRoute.tsx`: ele continua mandando `entityId: location.pathname` como antes (o cartão pede a correção em `audit.ts`, que é onde a normalização da V3 vive). O teste existente `ProtectedRoute.acesso-negado.test.tsx` segue verde.
- Não mexi em migration nem no `log_audit_event`: a normalização é no front, como na V3.
