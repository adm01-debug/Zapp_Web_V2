Especialista: edgar
## O que mudou e por quê
- supabase/functions/revoke-auth-sessions/index.ts: IP da auditoria agora é mascarado (`maskIpForAudit`: IPv4 zera o último octeto, IPv6 trunca, resto vira `unknown`); tentativa negada pela matriz (403) gera linha em `audit_logs` com `resultado: "negado"` via `buildDeniedRevocationAudit`; sucesso grava `resultado: "revogado"`; handler dividido em núcleo testável `handleRevokeAuthSessionsCore(req, clients)` + wrapper fino `handleRevokeAuthSessions(req)` que cria os clients reais. Falha na auditoria mantém a resposta (200 com `audited:false` no sucesso, 403 no negado) e vai ao log — decisão documentada no cabeçalho do arquivo. Colunas `user_id` e `action: "auth_sessions_revoke"` mantidas.
- supabase/functions/revoke-auth-sessions/index.test.ts: teste do IP corrigido para esperar máscara; 9 testes novos (máscara IPv4/IPv6/fail-closed, linha do negado, handler real com clientes falsos nos 3 cenários da matriz, ramo `audited:false`, negado com auditoria fora do ar).
## Prova
- verde depois: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/revoke-auth-sessions/index.test.ts` → `ok | 34 passed | 0 failed (14ms)`
- vermelho A (sem a chamada de auditoria do negado): mesmo comando → `handler: supervisor revogando admin recebe 403 e audita o negado => ./supabase/functions/revoke-auth-sessions/index.test.ts:264:6` e `FAILED | 0 passed | 1 failed | 33 filtered out (14ms)`
- vermelho B (sem a máscara, retornando o IP cru): mesmo comando → `FAILED | 28 passed | 6 failed (15ms)` (caem: auditoria global self, 2 de maskIpForAudit, linha do negado, 2 de handler com assert de IP)
- verificação: `zapp-verify . --rapido` → `OK dependencias / tipos / lint / migrations` e `VERIFY: VERDE SEM BANCO (158s)` (sem banco: cartão sem migration)
- patch: `.tmp/refazer1.patch` (base = entrega anterior 5ee63abde, 400 linhas) aplica limpo e gera bytes idênticos aos entregues (`PATCH_ROUNDTRIP_OK`)
## Pontos do revisor
- Ponto 1: resolvido — `maskIpForAudit` em index.ts; teste do IP agora exige `203.0.113.0` e `resultado: revogado`; testes novos de máscara (IPv4/IPv6/mapeado/fail-closed).
- Ponto 2: resolvido — ramo 403 audita antes de responder com `buildDeniedRevocationAudit` (ator, alvo, escopo, `resultado: negado`, IP mascarado, `revoked: 0`); 400 de validação não geram linha (decisão documentada no código).
- Ponto 3: resolvido — `handleRevokeAuthSessionsCore` recebe os clients; testes com duplos falsos provam 403+auditoria do negado (supervisor→admin), 200+auditoria (supervisor→agente, admin→supervisor); sem a chamada de auditoria o teste do negado falha (vermelho A acima). A matriz real (`effective_role` via `decideThirdPartyRevocation`) passa pelos fakes — nenhum escopo pré-autorizado é injetado.
- Ponto 4: resolvido — falha na auditoria mantém a resposta e marca `audited:false` (sucesso) ou mantém o 403 (negado), com teste de handler para cada ramo; decisão documentada no cabeçalho de index.ts.
## O que NÃO fiz e por quê
- Não auditei erros 400 de validação (corpo inválido, sessão ausente): não são tentativas negadas pela matriz; só 403 gera linha.
- Não mudei o contrato HTTP: corpo de sucesso `{revoked, scope, audited}` e 403 inalterados; chamadores (`ForceLogoutButton.tsx`, `useDeviceDetection.ts`) consomem só `{ error }` — conferidos, sem regressão.
- Não entreguei commit/branch: `hermes-tarefa-iniciar` está congelado nesta sessão (CONGELADO, sem MODO_V2) e a guarda bloqueia clone/worktree; a entrega é `.tmp/refazer1.patch` sobre a entrega anterior, com round-trip provado.
## Arquivos
- supabase/functions/revoke-auth-sessions/index.ts
- supabase/functions/revoke-auth-sessions/index.test.ts
