Especialista: iris

## O que mudou e por quê
- `src/components/inbox/AdvancedMessageMenu.tsx`: o item "Status/Story" do menu de mensagem passa a ser montado só quando `useUserRole().isSupervisor` é verdadeiro (admin ou supervisor, o mesmo par papel que o servidor exige) — agente comum deixava o clique chegar até o servidor, que nega `send-status` (R2EXT-STATUS, cartão pai t_99f46c1d). Não oferecemos botão que o servidor vai negar.
- `src/components/inbox/AdvancedMessageMenu.tsx`: o "Publicar" do diálogo de status agora abre uma confirmação (AlertDialog) com o texto "Isso aparece para todos os seus contatos." e só o confirmar chama `sendStatusMessage` — a publicação vai para toda a base da conexão, então o alcance é avisado antes do envio. Cancelar não publica nada.
- `src/components/inbox/__tests__/AdvancedMessageMenu.status-admin.test.tsx`: teste novo que prova os dois lados (agente sem o item; supervisor com item + confirmação antes do envio; admin também vê).

## Prova
- vermelho antes: `npx vitest run src/components/inbox/__tests__/AdvancedMessageMenu.status-admin.test.tsx` (com o componente original em `src/`, vindo de `git show HEAD:...`) → `Test Files 1 failed (1); Tests 2 failed | 1 passed (3)` — o teste pegou o item aparecendo para agente e a falta da confirmação.
- verde depois: `npx vitest run src/components/inbox/__tests__/AdvancedMessageMenu.status-admin.test.tsx` → `Test Files 1 passed (1); Tests 3 passed (3)`.
- regressão do consumidor: `npx vitest run src/components/inbox/chat/__tests__/ChatInputArea.limite-enter.test.tsx` → `Test Files 1 passed (1); Tests 8 passed (8)`.
- `zapp-verify . --rapido` roda no fechar.

## O que NÃO fiz e por quê
- DEPENDÊNCIA: o cartão mandou trazer a faixa inteira do pai (t_99f46c1d), então o diff contra a base do dia também mostra 4 arquivos de Edge — `supabase/functions/evolution-api/index.ts`, `supabase/functions/evolution-api/index.test.ts`, `supabase/functions/_shared/evolution-control-authz.ts` e `supabase/functions/_shared/__tests__/evolution-control-authz.test.ts`. Eles vêm do cherry-pick dos commits 8e4b8e3/3717651c (cadeia t_890bceea -> t_99f46c1d), não desta correção de tela; são a fonte do contrato admin/supervisor que a tela passou a respeitar.
- Não toquei em `src/hooks/evolution/useEvolutionMessaging.ts`: o defeito do cartão é só de visibilidade do item; o `body: object` sem tipo (chave `instanceName` do chamador sobrescrevendo a instância) é do dono do hook, não desta correção.
- Não mexi no resultado da publicação para grupos/canais com alcance restrito: o cartão pede o aviso "aparece para todos os seus contatos", cobrindo o caso do status.

## Estados da tela
- Diálogo de status: vazio (botão Publicar desabilitado sem texto), preenchido e carregando (`isLoading` no Publicar). Confirmação: aparece só após o Publicar; Cancelar fecha sem envio; sucesso fecha os dois diálogos e limpa o texto.
