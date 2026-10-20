Especialista: hugo

## O que mudou e por quê
- src/components/admin/useAdminData.ts: `handleCreateUser` deixou o `fetch` cru para
  `${SUPABASE_URL}/functions/v1/create-user` (que montava `Bearer ${session?.access_token}`
  à mão e lia `await response.json()` sem guarda) e agora usa `invokeEdge('create-user', body)`
  de `src/lib/supabaseHelpers` — a camada padrão do PE-43, que anexa o token da sessão e trata
  status/corpo da Edge. O import passou a ser o do helper porque o lint do repositório proíbe
  componentes de importar `@/integrations/supabase/client` direto.
- Refresh de sessão: em erro 401 renova UMA vez (`supabase.auth.refreshSession()`) e repete a
  chamada; se o refresh falhar, não repete.
- Erro por campo: `readEdgeError` lê `error.context` (o `Response` cru do `FunctionsHttpError`)
  com guarda de corpo não-JSON; `mapCreateUserError` traduz a mensagem do servidor para o campo
  do formulário — e-mail duplicado/inválido → `email`, senha → `password`, papel inválido
  (`Invalid enum value`; a Edge não devolve o nome do campo) → `role`, nome → `name` — e o hook
  expõe `createUserError` (`{ field, message }`), limpo no início de cada tentativa. A mensagem
  crua do servidor nunca é mostrada ao usuário.
- Contrato preservado: `handleCreateUser` continua devolvendo `Promise<boolean>` (o AdminView usa
  `const ok = await handleCreateUser(...)`); `createUserError` é aditivo.
- Teste novo: `src/components/admin/__tests__/useAdminDataCreateUser.test.ts` (8 casos).

## Prova
- Vermelho (base, antes do diff — rodei o arquivo de teste novo sobre o `useAdminData.ts` do HEAD):
  `npx vitest run src/components/admin/__tests__/useAdminDataCreateUser.test.ts`
  → `Test Files 1 failed (1)` / `Tests 8 failed (8)`.
- Verde (depois):
  `npx vitest run src/components/admin` → `Test Files 17 passed (17)` / `Tests 59 passed (59)`.
- Lint ratchet: `novas=0` (a dívida de `no-restricted-imports` na linha 2 foi removida).

## Por que confio
R1 (sem acesso a produção): os testes trocam a camada de Edge e o cliente por mocks; nenhuma
chamada real, nenhum segredo. Nenhuma falha é engolida: todo erro da Edge vira `createUserError`
+ `toast.error`, e o refresh falho mantém o retorno `false`.

## Escopo
A camada de estado (meu arquivo) é a dona do resultado: o hook classifica e publica
`createUserError` para o formulário consumir. O destaque visual no AdminView é de um cartão de
telas (Íris).
