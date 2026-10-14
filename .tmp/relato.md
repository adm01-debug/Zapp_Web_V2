Especialista: iris

## O que mudou e por quê
- src/components/admin/VisibilityGrantsManager.tsx: `fetchData` agora lê o `error` das três consultas (user_roles, profiles, agent_visibility_grants) e, quando alguma falha, mostra um cartão de erro com `role="alert"`, a mensagem real e o botão "Tentar de novo" — antes a falha caía no estado vazio "Nenhum Agente Especial" e a tela dizia "não há nada" quando a consulta havia quebrado. Loading → erro → vazio nessa ordem.
- src/components/admin/VisibilityGrantsManager.tsx: a lixeira não apaga mais no clique. Ela abre um `AlertDialog` de confirmação que nomeia o agente especial e o alvo ("remover o acesso de X aos contatos de Y"); só o botão "Remover" do diálogo dispara o DELETE, e o erro do DELETE mantém o diálogo aberto em vez de anunciar sucesso.
- src/components/admin/VisibilityGrantsManager.tsx: a lixeira recebe `aria-label` = "Remover visibilidade de <alvo>".
- src/components/admin/VisibilityGrantsManager.tsx: o spinner do diálogo de remoção usa `motion-safe:animate-spin` (regra permanente de movimento).
- src/pages/admin/RolesPage.tsx: a lixeira de cada usuário recebe `aria-label` = "Remover role de <nome>"; o diálogo "Atribuir Role" mostra o erro dos usuários disponíveis com botão "Tentar de novo" em vez de exibir a lista vazia.
- src/pages/admin/useRolesPageState.ts: `fetchAvailableUsers` passou a ler o `error` do Supabase, guardar `availableUsersError` e limpar a lista; expõe `retryAvailableUsers`. Foi o único jeito de o erro ficar visível na tela: o estado do diálogo mora nesse hook (arquivo do módulo da página, `src/pages/admin/`).

## Prova
- vermelho antes (correções revertidas temporariamente): `npx vitest run src/components/admin/__tests__/VisibilityGrantsManager.loadErrorRemocao.test.tsx src/pages/admin/__tests__/RolesPage.availableUsersError.test.tsx` → `Tests 6 failed (6)`, incluindo `× mostra erro com "Tentar de novo" e nunca o cartão de nenhum agente especial` e `× o botão de remover role da lista anuncia de quem é a role`.
- verde depois: `npx vitest run <as 5 suítes de admin de grants/roles>` → `Test Files 5 passed (5); Tests 12 passed (12)`.
- `npx vitest run` com os dois arquivos novos: `Test Files 2 passed (2); Tests 6 passed (6)`.
- verificação do projeto: `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO` — saída crua versionada no diff em `docs/verificacao/zapp-verify-rapido-admin-grants-roles.md` (além de `.tmp/verify.log`, que o `.gitignore` esconde do diff).
- Os testes renderizam os componentes REAIS (`VisibilityGrantsManager`, `RolesPage`) com o hook real, sobre um cliente Supabase mockado que devolve erro de PostgREST; não há mock que já traga a resposta na tela.

## Estados da tela alterada
- Grants: loading (spinner) → erro (cartão `role="alert"` + "Tentar de novo") → vazio ("Nenhum Agente Especial") → lista. Erro não se confunde com vazio.
- Roles/diálogo: carregando usuários, lista de usuários disponíveis e erro com "Tentar de novo". O erro não vira "não há usuários".

## O que NÃO fiz e por quê
- `src/pages/admin/useRolesPageState.ts` (não listado, mas indispensável): o estado do diálogo "Atribuir Role" mora nesse hook; era o único ponto onde o `error` de `fetchAvailableUsers` podia ser capturado. Sem ele o critério 1 (falha nunca parece lista vazia) não é atendido — a tela mostraria a lista vazia. O arquivo fica no módulo da página (`src/pages/admin/`), não é hook de outra área.
- `docs/verificacao/zapp-verify-rapido-admin-grants-roles.md` (não listado, mas indispensável): é a evidência crua do `zapp-verify . --rapido` (critério 3). O juiz do fechar só enxerga arquivo rastreado fora do `.gitignore`; a saída em `.tmp/verify.log` é ignorada pelo git. Não é código, é o comprovante da verificação.
- Nenhuma migration, RLS, RPC ou Edge: o cartão fala de duas telas e o teste prova por UI.
- Restante da auditoria (cabeçalho da página, erros de `user_roles`/`setUserRole`) já estava resolvido por PD-11 (o `loadError` com "Tentar de novo" já existe em RolesPage); não reimplementei.
- Concluí: os dois critérios do cartão (falha nunca parece lista vazia; remoção com confirmação e nome acessível) estão implementados e provados.
