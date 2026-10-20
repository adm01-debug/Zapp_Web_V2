- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 159s;OK lint 5s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (13/10 01:33, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  18 --
 src/integrations/supabase/types.ts                 |  20 ++
 .../admin/__tests__/useRolesPageState.rpc.test.tsx | 228 ++++++++++++++++
 src/pages/admin/useRolesPageState.ts               |  77 +++++-
 .../20261013035338_admin_add_remove_role_rpc.sql   | 129 +++++++++
 supabase/tests/user_roles_add_remove_role.sql      | 288 +++++++++++++++++++++
 6 files changed, 734 insertions(+), 26 deletions(-)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 8 passed (8)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261013035338_admin_add_remove_role_rpc.sql, supabase/tests/user_roles_add_remove_role.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\.delete\(\)|\bDELET, padrão:\bDROP\b, padrão:\bGRANT\b

Especialista: hugo

## O que mudou e por quê
- `src/pages/admin/useRolesPageState.ts`: as duas mutações da tela `/admin/roles` saíram da escrita direta em `user_roles` e passaram a chamar `supabase.rpc('admin_add_role', { _user_id, _role })` e `supabase.rpc('admin_remove_role', { _user_id, _role })` — o `from('user_roles').insert(...)` e o `from('user_roles').delete().eq('id', ...)` sumiram (critério 1: nenhuma escrita direta em `user_roles` no front). O `_user_id`/`_role` na remoção vêm de `userToRemove.user_id`/`userToRemove.role`, e não mais do `id` da linha.
- No mesmo arquivo, cada recusa da RPC ganhou texto em pt-BR num mapa `MENSAGENS_RPC` (critério 2): `cannot_demote_last_admin` → “Não é possível remover o último administrador.”, `cannot_remove_own_admin` → “Você não pode remover a sua própria role de administrador.”, `role_already_assigned` → “Este usuário já possui esta role.”, `role_not_assigned` → “Este usuário não possui esta role.”, `admin_required` → “Apenas administradores podem alterar roles.”, `jwt_session_required` → “Sessão expirada. Entre novamente para alterar roles.”. Código desconhecido cai na mensagem genérica anterior (“Erro ao adicionar role” / “Erro ao remover role”) e o código cru vai para `console.warn`, nunca para a tela.
- As duas mutações agora têm `try/catch/finally`: uma exceção de rede do client vira o mesmo toast de erro e o `updating` volta a `false` no `finally` (antes, uma exceção deixava o botão preso em “Atualizando”). Na recusa, o diálogo continua aberto e a lista NÃO é recarregada; no sucesso, `fetchUsers()` volta a ser chamado — é a invalidação do cache de papéis desta tela.
- `src/pages/admin/__tests__/useRolesPageState.rpc.test.tsx` (NOVO, 8 casos, só teste): chama o hook REAL com o client Supabase mockado e prova (a) `admin_add_role`/`admin_remove_role` chamados com os argumentos certos e `from('user_roles')` nunca tocado, (b) cada texto de recusa, (c) a lista não recarrega na recusa e recarrega no sucesso, (d) `updating` volta a `false` inclusive quando o client lança.

## Prova
- vermelho antes: `npx vitest run src/pages/admin/__tests__/useRolesPageState.rpc.test.tsx` → `Test Files 1 failed (1)`; `Tests 8 failed (8)` (os mutadores chamavam `from('user_roles')`; nenhuma RPC era chamada).
- verde depois: `npx vitest run src/pages/admin/__tests__/` → `Test Files 4 passed (4)`; `Tests 18 passed (18)` (os 8 novos + os 3 arquivos de teste de admin que já existiam, sem regressão).
- `zapp-verify . --rapido` → `VERIFY: VERDE` (db_guard/tipos/lint/migrations OK).

## Dependência (pai t_911b61b1, ainda não integrado no meu workspace)
- A faixa do pai não estava aqui (`git merge-base --is-ancestor` falso), então trouxe os dois commits do pai por `git cherry-pick`: `94b81c2e5` (migration `20261013035338_admin_add_remove_role_rpc.sql`, `supabase/tests/user_roles_add_remove_role.sql` e as entradas em `src/integrations/supabase/types.ts`) e `7d9004a3e` (tira `.tmp/relato.md` do versionamento). Sem conflito.
- As `Args` geradas (`_user_id: string`, `_role: app_role`) batem com as chamadas do front — é o que o teste de tipos do `zapp-verify` confere.

## O que NÃO fiz e por quê
- Não toquei migration, banco, RLS, gatilho nem `types.ts`: as RPCs e as travas são do cartão pai; aqui só o front que as chama.
- Não mexi em `RolesPage.tsx` nem em texto de interface: os avisos de recusa vão por toast, que a página já usa, e o critério não pede mudança de tela.
- Não alterei nenhum teste existente.
