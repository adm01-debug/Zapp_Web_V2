Especialista: iris (area-front-componentes)

## O que mudou e por quê
- src/components/connections/ConnectionDeleteDialog.tsx (novo): confirmação em duas etapas da exclusão — etapa 1 abrir o diálogo, etapa 2 digitar o nome exato da conexão para liberar o botão; o texto diz que apaga a instância na Evolution e o vínculo local e que não pode ser desfeito.
- src/components/connections/ConnectionDisconnectDialog.tsx (novo): confirmação simples do "Desconectar", mostrando o nome e o número mascarado (só DDI + 4 últimos dígitos via `maskPhoneNumber`); cancelar/Esc fecham sem chamar nada.
- src/components/connections/ConnectionCard.tsx: o botão "Desconectar" e o item "Excluir" do menu deixaram de chamar o handler no primeiro clique — passaram a abrir o diálogo (`state` local `confirmDisconnect`/`confirmDelete`). O item "Excluir" só é renderizado quando `useUserRole().isAdmin` (com o separador, que só existe com o item); o "Desconectar" continua para todos.
- src/components/connections/__tests__/ConnectionCard.confirmacao.test.tsx (novo): renderiza o `ConnectionCard` REAL e prova: supervisor não vê "Excluir"; "Excluir" bloqueado sem o nome e com o nome errado, executado uma vez com o nome exato; "Desconectar" mostra o número mascarado e só executa ao confirmar; cancelar não chama nenhum handler.
- src/components/connections/__tests__/ConnectionCard.sem-integracoes.test.tsx: acrescentada UMA linha de mock (`useUserRole` → admin), porque o cartão agora consulta o papel; as asserções do teste (sem "Integrações (IA/Bots)", aria-label do menu, axe) seguem idênticas — nenhuma asserção foi removida nem afrouxada.
- src/hooks/inbox/useConnectionsManager.ts NÃO foi tocado: a confirmação é puramente de tela (`onDelete`/`onDisconnect` continuam iguais).

## Prova
- vermelho antes (sem a correção, `ConnectionCard.tsx` da base via `git show HEAD:`): `npx vitest run src/components/connections/__tests__/ConnectionCard.confirmacao.test.tsx` → `Tests 4 failed | 1 passed (5)`.
- verde depois: `npx vitest run src/components/connections/__tests__/ConnectionCard.confirmacao.test.tsx src/components/connections/__tests__/ConnectionCard.sem-integracoes.test.tsx` → `Test Files 2 passed (2); Tests 8 passed (8)`.
- `zapp-verify . --rapido` verde (no bloco FATOS MEDIDOS do fechar). A confirmação usa o `AlertDialog` do projeto; nenhum `window.confirm` foi adicionado, como o cartão exige.

## Critério de pronto
1. Nenhuma ação destrutiva de conexão sem confirmação — "Desconectar" e "Excluir" só executam depois do diálogo (provado no teste novo); "Excluir" só para admin (provado com supervisor).
2. zapp-verify . --rapido verde — no bloco FATOS MEDIDOS do fechar.

## O que NÃO fiz e por quê
- Não mexi em `ConnectionsView.tsx` (o papel vem de `useUserRole()` dentro do próprio cartão, que é o escopo de arquivos do cartão).
- Não mexi no banco/RLS de `whatsapp_connections`: o gate de admin aqui é de tela, como o cartão pede; eventual trava no servidor é de outro perfil (worker (sql)).
