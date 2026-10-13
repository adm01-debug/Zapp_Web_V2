Especialista: Íris (area-front-componentes)

## Arquivos fora da lista do cartão — por quê
- `AdminView.tsx`, `VoipRamalField.tsx`, `useAdminData.ts`: o cartão cita `UserFormDialog.tsx`, que
  NÃO existe no V2 (nem no V3) — o formulário de edição de usuário é inline em `AdminView.tsx`, na
  MESMA pasta/área (`src/components/admin/**`, area-front-componentes). Sem tocar `AdminView.tsx` não
  haveria como o campo aparecer no cadastro (critério nº 1); `VoipRamalField.tsx` é o bloco do campo
  (novo, testável); `useAdminData.ts` é o hook de dados do Admin, onde a RPC é chamada porque
  componente não importa `@/integrations/supabase/client` (regra de lint) — é o único jeito de o
  formulário chamar a RPC sem criar import restrito novo. Nada fora de `src/components/admin/**`.
- `supabase/migrations/20261013230011_voip_profile_credentials.sql` e
  `supabase/tests/voip_profile_credentials_vault.sql`: NÃO editei — chegaram na branch por
  cherry-pick do commit da tarefa pai `t_c0087e07` (a migration da credencial SIP). São a dependência
  que este cartão consome; o diff os mostra só porque estão no mesmo branch.

## O que mudou e por quê
- `src/components/admin/VoipRamalField.tsx` (novo): bloco "Telefonia (ramal)" do formulário de
  usuário — campo Ramal e campo Senha SIP (`type="password"`, nasce vazio e é limpo depois de
  salvar; a senha salva NUNCA volta para a tela). Botão "Salvar ramal" habilita só com os dois
  campos preenchidos e bloqueia inputs/botão durante a gravação. Status do salvamento em
  `role="status" aria-live="polite"`, rótulos ligados por `htmlFor`/`aria-describedby`. O spinner de
  gravação usa `motion-safe:animate-spin` (respeita reduzir movimento).
- `src/components/admin/AdminView.tsx`: renderiza o bloco no diálogo de edição de usuário, gated
  por `{isAdmin && (...)}` — supervisor não alcança (a linha só oferece "Editar" para admin).
- `src/components/admin/useAdminData.ts`: `handleSaveRamal(profileId, ramal, sipPassword)` chama a
  RPC `set_voip_profile_credentials` com `p_profile_id`, `p_ramal`, `p_sip_password` e traduz os
  erros de negócio (`ramal_em_uso`, `not_authorized`, `invalid_ramal`, `invalid_sip_password`,
  `profile_not_found`) em mensagem pt-BR; não anuncia sucesso quando o banco recusa.
- Testes: `VoipRamalField.test.tsx`, `useAdminDataRamal.test.ts`, `AdminView.ramalAdmin.test.tsx`.

## Prova
- vermelho antes (capacidade inexistente na base `dia/2026-10-13`):
  - `git show dia/2026-10-13:src/components/admin/useAdminData.ts | grep -c handleSaveRamal` → `0`
  - `src/components/admin/VoipRamalField.tsx` ausente no base (o teste importa o componente real)
- verde depois: `npx vitest run` nos 3 arquivos →
  `Test Files  3 passed (3); Tests  10 passed (10)`
- sem regressão nos vizinhos: `npx vitest run` em AdminView.{a11y,section-error-boundary,servicosGoogle},
  AdminUsersTable.a11y, useAdminData{ToggleActive,RoleChange,Columns} →
  `Test Files  7 passed (7); Tests  23 passed (23)`
- eslint nos 6 arquivos: 0 errors (1 warning pré-existente, o import do client em `useAdminData.ts`)

## O que NÃO fiz e por quê
- O cartão lista `src/components/admin/UserFormDialog.tsx`, que NÃO existe no V2 (nem no V3): o
  formulário de edição é inline no `AdminView.tsx`. Entreguei o campo ali, na mesma pasta/área.
- A RPC é chamada em `src/components/admin/useAdminData.ts` (não num service/hook novo): componentes
  não importam `@/integrations/supabase/client` (regra de lint, ratchet) e esse hook já é o ponto de
  dados do Admin, que já importa o client — nenhuma ocorrência nova de import restrito foi criada.
- O ramal atual do atendente não é exibido no formulário porque `get_voip_profile_credentials` exige
  `service_role` (só a Edge lê); se o produto quiser pré-preencher, é cartão de banco (worker sql).
- A migration `20261013230011_voip_profile_credentials.sql` + `supabase/tests/voip_profile_credentials_vault.sql`
  já chegaram na branch por cherry-pick do commit da tarefa pai `t_c0087e07` (não é trabalho meu).
- Sem push/PR/deploy: modo V2 local.
