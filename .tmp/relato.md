Especialista: iris

## O que mudou e por quê
- `src/components/admin/AdminView.tsx`: a tela passou a consumir o contrato do hook (`auditTotal`, `error`) e a entregar os estados que faltavam: bloco de erro com `role="alert"` e botão "Tentar novamente" (chama `fetchData`), mensagens de vazio diferentes para "sem busca", "busca sem resultado" e "período sem log", e — só na aba auditoria — o filtro de data (`Data inicial`/`Data final`) mais a paginação (Anterior/Próxima com total de registros). A busca deixou de ser renderizada nas abas em que o termo não filtra nada (CRM, Gerentes, Copilot, Treinamento, Sala de Crise), que era o controle decorativo que o título do cartão proíbe. No diálogo de novo usuário o campo de senha usa `MIN_PASSWORD_LENGTH` (régua da Edge `create-user`) e o `PasswordStrengthMeter`, que estava sem uso no módulo.
- `src/components/admin/AdminUsersTable.tsx` e `AdminAuditTable.tsx`: prop `emptyMessage`, com uma linha de estado vazio ocupando todas as colunas (`colSpan` = número real de colunas, 6 com Ações para admin) em vez de tabela só com cabeçalho.
- `src/components/admin/useAdminData.ts`: o hook vem do cartão pai (t_0438f11e), trazido por cherry-pick da faixa `dia/2026-10-12..23d5f122f` porque a dependência não estava no meu workspace. Nele corrigi os limites do filtro de data para o FUSO LOCAL do navegador (`inicioDoDiaLocal`/`fimDoDiaLocal`), que era o Ponto 1 do revisor do cartão pai: montar `T00:00:00.000Z` cortava 3 horas de cada dia no Brasil e, como este é o cartão que liga o filtro na tela, seria o usuário quem veria o intervalo errado. Também tirei os `vi.unstubAllGlobals()` de dentro dos testes e pus um `afterEach` (Ponto 5 do revisor do pai).
- `src/components/admin/__tests__/AdminView.estados-tabelas.test.tsx` (novo): prova pela tela, com `useAdminData` mockado — erro na tela + retry, vazio de usuários (cadastro e busca), vazio de auditoria (registrado e por período), busca ausente nas abas onde não filtra, filtro de data e página chegando ao hook, paginação andando e voltando à página 1 ao trocar o período, e o campo de senha com a régua de 8 e o medidor.
- `src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts`: o teste do filtro fixa `TZ=America/Sao_Paulo` e confere o instante UTC exato do dia local (2026-10-01T00:00 BRT = 03:00Z; fim do dia 12/10 = 13/10T02:59:59.999Z).
- `AdminView.a11y/servicosGoogle/section-error-boundary.test.tsx`: os mocks do módulo ganharam `error`, `auditTotal`, `MIN_PASSWORD_LENGTH` e `AUDIT_PAGE_SIZE`, que a tela agora lê.

## Prova
- vermelho antes (AdminView/tabelas na versão de HEAD, hook do índice):
  `npx vitest run src/components/admin/__tests__/AdminView.estados-tabelas.test.tsx` → `Tests 8 failed | 1 passed (9)`, com `Unable to find an element with the text: Nenhum usuário cadastrado.` e `expected <input …> to be null` (a busca aparecia na aba onde não filtra).
- vermelho antes (fuso): mesma base, `useAdminData` do índice →
  `Tests 1 failed | 8 passed (9)`, diff `- "2026-10-01T03:00:00.000Z"` / `+ "2026-10-01T00:00:00.000Z"`.
- verde depois: `npx vitest run src/components/admin/` → `Test Files 18 passed (18); Tests 69 passed (69)`.
- verde depois (só os dois arquivos novos/alterados): `npx vitest run src/components/admin/__tests__/AdminView.estados-tabelas.test.tsx src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts` → `Test Files 2 passed (2); Tests 18 passed (18)`.
- eslint nos arquivos alterados: `1 problem (0 errors, 1 warning)` — o warning é o `no-restricted-imports` do import do client do Supabase dentro de `useAdminData.ts`, que já existe igual em HEAD (não é ocorrência nova).

## O que NÃO fiz e por quê
- Não toquei em Edge Function, migration nem no hook de senha do pai: a senha só mudou de texto/medidor na tela, a validação continua na Edge.
- Não reescrevi a busca da auditoria para o servidor (ela filtra a página carregada, como já fazia); trocar isso seria trilha de hooks/banco, não deste cartão.
- Não mexi no `.tmp/relato.md` do cartão pai trazido no cherry-pick; os dois commits de relato da faixa não foram aplicados (sobrescreveriam este relato).
