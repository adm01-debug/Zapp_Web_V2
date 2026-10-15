Especialista: semisenior (area-testes-do-produto)
## O que mudou e por quê
- src/__tests__/security-and-performance.test.ts: fixture `entityId: 'user-1'` (não-UUID) virou UUID válido `123e4567-e89b-12d3-a456-426614174000`, e a asserção `p_entity_id` acompanha o mesmo UUID — a entrega 1334ce3b2 manda não-UUID para `details.entity_id_text` e omite `p_entity_id` (pedido original do cartão), então o teste antigo, que esperava o texto cru na coluna uuid, codificava o comportamento bugado e quebrava no empilhamento. Força da asserção inalterada (igualdade exata).
## Prova
- vermelho antes: `bun run test src/__tests__/security-and-performance.test.ts` → `Test Files 1 failed (1); Tests 1 failed | 7 passed (8)` (esperava `p_entity_id: 'user-1'`, recebeu `undefined` + `details.entity_id_text: 'user-1'`).
- verde depois: `bun run test src/__tests__/security-and-performance.test.ts src/lib/__tests__/audit.test.ts src/components/auth/__tests__/ProtectedRoute.auditoria-rota.test.tsx src/components/auth/__tests__/ProtectedRoute.acesso-negado.test.tsx` → `Test Files 4 passed (4); Tests 28 passed (28)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (31s)` (OK db_guard, tipos, lint, migrations).
## Pontos do revisor
- Ponto 1 (empilhamento quebra em security-and-performance; correção estaria em t_efa9b1c5): conferi o t_efa9b1c5 e ele está bloqueado SEM correção entregue (hugo bloqueou por falta do flag MODO_V2; decisão 20261014-150729-f818-sem-tarefa sem resposta), então fiz a correção aqui. Causa: o teste de empilhamento é idêntico na ponta dia/2026-10-14 e na entrega (`git diff f5885801 HEAD -- src/__tests__/security-and-performance.test.ts` vazio) e passava `entityId: 'user-1'` cru para a coluna uuid; com a normalização da entrega isso vira omitido + `entity_id_text`. Corrigi o teste desalinhado (fixture UUID válido), sem afrouxar asserção. Verifiquei os vizinhos: LGPDComplianceView chama `supabase.rpc` direto (não passa por `logAudit`, 3/3 verde) e ProtectedRoute.acesso-negado testa o chamador com `logAudit` mockado (contrato `entityId: '/painel'` inalterado).
## O que NÃO fiz e por quê
- Não toquei em `src/lib/audit.ts`: a normalização é o pedido original do cartão (não-UUID fora da coluna uuid).
- `zapp-verify . full` → VERMELHO em `travas` (infra: `conjunto full não está de pé`); OK db_guard, tipos, lint, migrations. Prova entregue com `--rapido` + 4 suites. `hermes-tarefa-iniciar/fechar` recusam (rc=75, sem MODO_V2), então trabalhei no workspace da entrega (arquivos já em 1334ce3b2, sem cherry-pick) e fecho pelo kanban.
## Arquivos (commit deste refazer)
- src/__tests__/security-and-performance.test.ts (2+/2-)
- .tmp/relato.md (este relato)
