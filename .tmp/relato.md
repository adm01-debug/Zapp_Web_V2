Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/admin/VisibilityGrantsManager.tsx: `fetchData` agora lê o `error` das três consultas (user_roles, profiles, agent_visibility_grants) e, quando alguma falha, mostra um cartão de erro com `role="alert"`, a mensagem real e o botão "Tentar de novo" — antes a falha caía no estado vazio "Nenhum Agente Especial" e a tela dizia "não há nada" quando a consulta havia quebrado. Loading → erro → vazio nessa ordem.
- src/components/admin/VisibilityGrantsManager.tsx: a lixeira não apaga mais no clique. Ela abre um `AlertDialog` de confirmação que nomeia o agente especial e o alvo ("remover o acesso de X aos contatos de Y"); só o botão "Remover" do diálogo dispara o DELETE, e o erro do DELETE mantém o diálogo aberto em vez de anunciar sucesso.
- src/components/admin/VisibilityGrantsManager.tsx: a lixeira recebe `aria-label` = "Remover visibilidade de <alvo>".
- src/pages/admin/RolesPage.tsx: a lixeira de cada usuário recebe `aria-label` = "Remover role de <nome>"; o diálogo "Atribuir Role" mostra o erro dos usuários disponíveis com botão "Tentar de novo" em vez de exibir a lista vazia.
- src/pages/admin/useRolesPageState.ts: `fetchAvailableUsers` passou a ler o `error` do Supabase, guardar `availableUsersError` e limpar a lista; expõe `retryAvailableUsers`. Foi o único jeito de o erro ficar visível na tela: o estado do diálogo mora nesse hook (arquivo do módulo da página, `src/pages/admin/`).

## Prova
- vermelho antes (correções revertidas temporariamente): `npx vitest run src/components/admin/__tests__/VisibilityGrantsManager.loadErrorRemocao.test.tsx src/pages/admin/__tests__/RolesPage.availableUsersError.test.tsx` → `Tests 6 failed (6)`, incluindo `× mostra erro com "Tentar de novo" e nunca o cartão de nenhum agente especial` e `× o botão de remover role da lista anuncia de quem é a role`.
- verde depois: `npx vitest run <as 5 suítes de admin de grants/roles>` → `Test Files 5 passed (5); Tests 12 passed (12)`.
- `npx vitest run` com os dois arquivos novos: `Test Files 2 passed (2); Tests 6 passed (6)`.
- Os testes renderizam os componentes REAIS (`VisibilityGrantsManager`, `RolesPage`) com o hook real, sobre um cliente Supabase mockado que devolve erro de PostgREST; não há mock que já traga a resposta na tela.

## Estados da tela alterada
- Grants: loading (spinner) → erro (cartão `role="alert"` + "Tentar de novo") → vazio ("Nenhum Agente Especial") → lista. Erro não se confunde com vazio.
- Roles/diálogo: carregando usuários, lista de usuários disponíveis e erro com "Tentar de novo". O erro não vira "não há usuários".

## O que NÃO fiz e por quê
- Nenhuma migration, RLS, RPC ou Edge: o cartão fala de duas telas e o teste prova por UI.
- Restante da auditoria (cabeçalho da página, erros de `user_roles`/`setUserRole`) já estava resolvido por PD-11 (o `loadError` com "Tentar de novo" já existe em RolesPage); não reimplementei.
- Concluí: os dois critérios do cartão (falha nunca parece lista vazia; remoção com confirmação e nome acessível) estão implementados e provados.
