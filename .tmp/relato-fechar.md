- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 99s;OK lint 3s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (12/10 22:06, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  24 +--
 .../__tests__/useAdminData.erros-auditoria.test.ts | 214 +++++++++++++++++++++
 .../admin/__tests__/useAdminDataColumns.test.ts    |   3 +
 src/components/admin/useAdminData.ts               | 136 +++++++++----
 4 files changed, 329 insertions(+), 48 deletions(-)
```
- Testes alterados neste cartão (2 arquivo[s]) rodados AGORA no seu commit: Test Files 2 passed (2);Tests 12 passed (12)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — risco: p(Alto)=0.60; relato sem evidência limpa de verificação

Especialista: worker (geral) — o roteador do quadro reencaminhou o cartão ao worker; assino como worker.

## O que mudou
- `src/components/admin/useAdminData.ts`: `fetchData` agora lê o `error` de cada consulta. Aba Usuários: `profiles` ou `user_roles` com erro → estado `error` + `toast.error`, sem lista vazia silenciosa. Aba Auditoria: `audit_logs` com erro → `error` + toast; se só os nomes dos autores falharem, os registros continuam e um toast avisa. A aba Auditoria ganhou filtro de data (`from`/`to` `YYYY-MM-DD` inclusivos → `gte ${from}T00:00:00.000Z` / `lte ${to}T23:59:59.999Z`) e paginação (`page`/`pageSize` 1-based → `range`, `count: 'exact'` → `auditTotal`), com `AuditLogFilter` e `AUDIT_PAGE_SIZE = 50` exportados e dependências primitivas no `useCallback`. `handleCreateUser` passou a exigir senha de 8 caracteres, igual à Edge `create-user` (`z.string().min(8)`), via `MIN_PASSWORD_LENGTH = 8` exportado e a mensagem `A senha deve ter pelo menos 8 caracteres`.
- `src/components/admin/__tests__/useAdminDataColumns.test.ts`: só o mock da cadeia Supabase ganhou `range`, `gte` e `lte`; as asserções de colunas explícitas ficaram iguais.
- `src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts` (novo): hook real + mock controlável cobrindo erro em `profiles`, `user_roles` e `audit_logs`, sucesso sem erro, intervalo e página da auditoria, o `range` padrão e a régua de senha (constante 8, 7 recusados antes da Edge, 8 chamando a Edge).
- Escopo: os 3 arquivos acima. `PasswordStrengthMeter` é componente de `AdminView.tsx`, fora da lista de ARQUIVOS QUE PODE TOCAR deste cartão; a régua compartilhada ficou em `MIN_PASSWORD_LENGTH`, que a tela usa.

## Prova
- vermelho antes: com `useAdminData.ts` na versão da base, `npx vitest run src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts` → `Test Files 1 failed (1); Tests 8 failed | 1 passed (9)`.
- verde depois: `npx vitest run src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts src/components/admin/__tests__/useAdminDataColumns.test.ts src/components/admin/__tests__/adminDownloadPermission.test.ts` → `Test Files 3 passed (3); Tests 16 passed (16)`.
- módulo: `npx vitest run src/components/admin/__tests__` → `Test Files 17 passed (17); Tests 60 passed (60)`.
