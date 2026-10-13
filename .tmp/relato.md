Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/chat/useNewConversation.ts: no envio para um contato existente, a conexão usada passa a ser a do próprio contato (`contacts.whatsapp_connection_id`), e a busca já traz essa coluna. Antes o parâmetro explícito mandado era a 1ª conexão conectada da tela, que vence no RPC e fazia a mensagem sair de outro número. Agora a conexão do contato vence o seletor.
- src/hooks/chat/useNewConversation.ts: ao escolher o contato, o hook sincroniza `selectedConnection` com a conexão dele — o seletor "Conexão WhatsApp" do modal passa a mostrar de qual número a mensagem sai.
- src/hooks/chat/useNewConversation.ts: se a conexão do contato não está entre as conectadas, o envio é interrompido com aviso (`toast.error`), sem trocar de número em silêncio; contato novo e contato sem conexão própria seguem usando a conexão escolhida na tela.
- src/hooks/chat/__tests__/useNewConversation.connection.test.tsx: prova os quatro caminhos.

## Prova
- vermelho antes: `npx vitest run src/hooks/chat/__tests__/useNewConversation.connection.test.tsx` na base → 2 testes falham (envio saía por 'conexao-b' em vez de 'conexao-a'; e a desconectada não avisava, enviava por outro número)
- verde depois: `npx vitest run src/hooks/chat/__tests__/useNewConversation.connection.test.tsx src/hooks/chat/__tests__/useNewConversation.test.tsx` → Test Files 2 passed; Tests 6 passed

## O que NÃO fiz e por quê
- Não toquei no RPC de envio (migration é de outra área; o cartão manda registrar): em `enqueue_outbound_message` o parâmetro `p_whatsapp_connection_id` vence a conexão do contato — por isso a correção é passar a conexão do contato no front.
- Não alterei src/components (fora da minha área): o modal já renderiza o seletor de conexão, e ele passa a refletir a conexão do contato via o estado do hook.
