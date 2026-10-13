Especialista: worker (geral) — cartão de área front-hooks (hugo) reencaminhado ao worker pelo roteador do quadro; assino como worker, não como hugo.

## O que mudou e por quê
- `src/components/admin/useAdminData.ts` (hook, arquivo do cartão):
  * `fetchData` da aba Usuários deixou de tratar só o caso feliz: agora lê `error` de `profiles` e de `user_roles`. Se a consulta falhar, o hook guarda o motivo no novo estado `error` e dispara `toast.error` — a lista vazia silenciosa não existe mais (critério 1). O caso feliz cai no mesmo caminho de antes (`profiles ?? []` + `roles ?? []`).
  * Aba Auditoria: mesma coisa para `audit_logs`. Erro vira `error` + toast. Se só a busca dos nomes dos autores (`profiles`) falhar, a auditoria continua na tela sem nome e um toast avisa — não esconde os registros.
  * Aba Auditoria ganhou filtro de data e paginação: novo `AuditLogFilter` (`from`/`to` em `YYYY-MM-DD`, inclusivos, viram `gte ${from}T00:00:00.000Z` e `lte ${to}T23:59:59.999Z`; `page`/`pageSize` 1-based, `range(start, start+pageSize-1)`, com `count: 'exact'`) e o total exposto em `auditTotal`. Novas exportações `AUDIT_PAGE_SIZE = 50` e o tipo `AuditLogFilter`, para a tela (cartão filho t_672cd537, PD-16) consumir o mesmo hook. As dependências do `useCallback` são primitivas (`auditFrom/auditTo/auditPage/auditPageSize`), então passar filtro inline não gera refetch a cada render.
  * `handleCreateUser`: a régua de senha saiu de 6 para 8, igual à Edge `create-user` (`z.string().min(8)`), via `MIN_PASSWORD_LENGTH = 8` exportado e mensagem `A senha deve ter pelo menos 8 caracteres` (critério 2).
- `src/components/admin/__tests__/useAdminDataColumns.test.ts` (teste existente): só o mock da cadeia Supabase ganhou `range`, `gte` e `lte` para a consulta nova de auditoria passar por ele. Nenhuma asserção foi removida ou afrouxada — as 3 checagens de colunas explícitas continuam iguais.
- `src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts` (NOVO): chama o hook real com um mock de Supabase controlável e cobre erro em `profiles`, erro em `user_roles`, erro em `audit_logs`, sucesso sem estado de erro, `gte`/`lte`/`range` da auditoria com o intervalo e a página certos, o `range` padrão e a régua de senha (constante = 8, 7 caracteres recusados antes de chamar a Edge, 8 caracteres chamando a Edge).

## Prova
- vermelho antes: com `src/components/admin/useAdminData.ts` na versão da base e o teste novo no lugar, `npx vitest run src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts` → `Test Files 1 failed (1); Tests 8 failed | 1 passed (9)` (na base 7 caracteres passavam pela régua e chamavam a Edge; erro de consulta não deixava estado nem toast). O único que passava é o de 8 caracteres, que é guarda de regressão.
- verde depois: `npx vitest run src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts src/components/admin/__tests__/useAdminDataColumns.test.ts src/components/admin/__tests__/adminDownloadPermission.test.ts` → `Test Files 3 passed (3); Tests 16 passed (16)`.
- regressão no módulo: `npx vitest run src/components/admin/__tests__` → `Test Files 17 passed (17); Tests 60 passed (60)`.

## O que NÃO fiz e por quê
- Não usei `PasswordStrengthMeter` na tela: o componente é `src/components/auth/PasswordStrengthMeter.tsx` e o formulário de criação de usuário está em `AdminView.tsx`, nenhum dos dois na lista de ARQUIVOS QUE PODE TOCAR deste cartão (`useAdminData.ts` + testes). Deixei `MIN_PASSWORD_LENGTH` exportado para a tela (cartão filho t_672cd537, dono do `AdminView.tsx`) montar o medidor com a mesma régua. O critério 2 ("senha mínima igual à da Edge") está cumprido no hook.
- Não mexi em banco, Edge, produção nem dependências.
