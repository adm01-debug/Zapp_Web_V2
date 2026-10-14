Especialista: iris

Refazer 1 — o caminho 2xx do `handleApprove` prometia "enviado" sem ler `data.emailSent`.

## Ponto 1 da recusa — 2xx com emailSent=false/ausente dizia "enviado"
O que mudei: `src/components/security/PasswordResetRequestsPanel.tsx` (`handleApprove`) — passei a desestruturar `data` do `invoke` e só chamo `toast.success(... maskEmail ...)` + `setEmailFailedRequest(null)` quando `(data as FunctionErrorPayload | null)?.emailSent === true`. Qualquer outro valor (false, ausente, malformado) segue o mesmo caminho da falha fechada: `setEmailFailedRequest(request)` + `toast.error('Aprovado, mas o e-mail não foi enviado — tente novamente')` + botão Reenviar. Reaproveitei o tipo `FunctionErrorPayload` já existente; nenhum chamador novo (só `handleApprove` e o botão Reenviar, já cobertos).
Teste que prova: `2xx com emailSent=false: NÃO promete envio` (mais 2 variantes: sem `emailSent` e malformado) em `PasswordResetRequestsPanel.resultado.test.tsx`.
Saída vermelha antes da correção: `Tests 3 failed | 5 passed (8)` (`findByRole('alert')` expira — o código ia ao `toast.success`).
Saída verde depois: `Tests 8 passed (8)`.

## Ponto 2 da recusa — testes do 2xx com emailSent=false e sem emailSent
O que mudei: `src/components/security/__tests__/PasswordResetRequestsPanel.resultado.test.tsx` — 3 testes novos com `invoke` resolvendo `{ data: { success: true, emailSent: false }, error: null }`, `{ data: { success: true }, error: null }` e `{ data: { success: true, emailSent: 'yes' }, error: null }`; os 3 esperam o alerta com Reenviar e `toast.success` não chamado.
Saída vermelha/verde: idem ao Ponto 1 (3 falhavam, 8 passam).

## Pedido original (conferências, sem mudança)
- `resetLink`: `rg "resetLink|action_link|actionLink" src/` — nenhum uso em produção (só a regex do próprio teste de ausência de link).
- Admin-only: painel montado na aba `admin` de `SecurityView.tsx` (trigger sob `{isAdmin && ...}`, l.129); sem mudança.
- Nenhum link exibido em nenhum estado (teste existente `nenhum link de reset aparece no DOM` continua verde).

## Arquivos (`git diff --name-only dia/2026-10-14...HEAD`, colado)
.tmp/relato.md
src/components/security/PasswordResetRequestsPanel.tsx
src/components/security/__tests__/PasswordResetRequestsPanel.resultado.test.tsx

## Verificação (comandos rodados agora)
- `bunx vitest run src/components/security/__tests__/PasswordResetRequestsPanel.resultado.test.tsx` → `Test Files 1 passed (1)`, `Tests 8 passed (8)`.
- `bunx tsc --noEmit -p tsconfig.app.json` → saída vazia, RC=0.
- `bunx eslint` nos 2 arquivos → 0 erros; 1 warning pré-existente (l.10, import do client Supabase, do trabalho pai, fora do escopo da recusa).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard OK, tipos OK, lint OK, migrations OK; banco_local AVISO — sem conjunto, sem mudança de banco no cartão).

## Fechamento
- `hermes-tarefa-iniciar`/`hermes-tarefa-fechar` recusam com RC=75 (CONGELADO; modo V1 suspenso). Trabalhei no worktree do trabalho anterior e commitei no mesmo branch, sem push.
