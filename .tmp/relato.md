Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/theme/useChatTextSize.ts` (novo): os 5 níveis (Pequeno 12px … Enorme 20px, padrão 14px = o `text-sm` de
  antes), o lembrete em `localStorage` com try/catch e o gancho `useChatTextSize`, que escreve `--chat-font-size` no `<html>`.
- `src/components/theme/ChatTextSize.tsx` (novo): só a tela — grupo de rádio com nome acessível ("Tamanho do texto do chat"),
  5 opções com `aria-checked` nativo e uma pré-visualização que usa a MESMA classe `.chat-message-text` dos balões reais.
- `src/styles/components.css`: regra `.chat-message-text { font-size: var(--chat-font-size, 0.875rem); }`. Sem a variável o
  valor é o `0.875rem` de antes — quem nunca escolheu não vê diferença. Sem `!important`, de propósito: no modo "Texto
  Grande" o alto contraste vence por `!important` (accessibility.css:105), então a acessibilidade não é quebrada.
- `src/components/inbox/chat/MessageBubble.tsx`: o `<p>` do texto da mensagem trocou `text-sm` fixo por `chat-message-text`
  (linha 365). **Desvio explicado:** o cartão supõe que a bolha é a classe `.message-bubble`; em V2 ela é código morto
  (só aparece em components.css, nenhum `.tsx` a usa — `git grep` confirma). O consumidor vivo do texto do balão é o
  `MessageBubble.tsx`, e é ele que passou a ler a variável. Sem isso a escolha seria decorativa (o CSS não chegaria à tela).
- `src/components/settings/AppearanceSettings.tsx`: seção "Tamanho do texto do chat" com `<ChatTextSize />` logo abaixo de
  Densidade, no mesmo padrão dos outros seletores da tela.
- Testes novos/alterados: `ChatTextSize.test.tsx` (comportamento: padrão, troca, permanece ao remontar, storage bloqueado,
  valor salvo corrompido, a11y do grupo), `MessageBubble.chat-text-size.test.tsx` (balão REAL enviado e recebido usam a
  classe), `styles/__tests__/chatTextSize.test.ts` (contrato CSS: a classe lê a variável, sem `!important`, e o Texto Grande
  do alto contraste continua com `!important`), e 1 caso em `AppearanceSettings.a11y.test.tsx` (a tela oferece o controle e
  o axe segue limpo).

## Prova
- vermelho antes: `git show dia/2026-10-13:src/components/inbox/chat/MessageBubble.tsx` → linha 365 era
  `<p className="text-sm whitespace-pre-wrap leading-[1.45]">`; a base tinha 0 ocorrências de `ChatTextSize` e 0 de
  `chat-font-size` em components.css — os testes novos caem na base.
- verde depois: `npx vitest run src/components/theme/__tests__/ChatTextSize.test.tsx src/styles/__tests__/chatTextSize.test.ts src/components/inbox/chat/__tests__/MessageBubble.chat-text-size.test.tsx src/components/settings/__tests__/AppearanceSettings.a11y.test.tsx`
- regressão da área: `npx vitest run src/components/inbox/chat src/components/settings/__tests__/AppearanceSettings.a11y.test.tsx src/components/theme`
- lint dos arquivos tocados: `npx eslint ...` → 0 warnings novos (o ratchet do pre-commit ficou `novas=0`); o arquivo do hook
  foi separado do componente justamente para não criar warning de fast refresh.

## Arquivos fora da lista do cartão — por que foram indispensáveis
- `src/components/inbox/chat/MessageBubble.tsx`: é o único consumidor VIVO do texto do balão. O cartão presume que a
  bolha é a classe `.message-bubble` (components.css), mas em V2 essa classe é código morto — `git grep -n message-bubble
  src` devolve só o próprio components.css e nenhum `.tsx`. Sem trocar `text-sm` fixo por `chat-message-text` aqui, a
  variável `--chat-font-size` não chegaria a balão nenhum e a escolha do usuário seria decorativa (o defeito nº 1 do meu
  perfil: "mudou o valor e esqueceu quem o lê"). Arquivo da minha área (src/components/**), 1 linha mudada.
- `src/components/theme/useChatTextSize.ts`: o hook + constantes precisam ficar fora do arquivo do componente porque o
  lint `react-refresh/only-export-components` reprova .tsx que exporta componente e função; mantê-lo dentro do
  `ChatTextSize.tsx` criaria warning NOVO e o ratchet do pre-commit (baseline=0) recusaria a entrega. Foi a forma de
  cumprir o "deixe o gancho" do cartão sem dívida de lint.
- `src/components/inbox/chat/__tests__/MessageBubble.chat-text-size.test.tsx`: é a prova do comportamento acima pelo
  balão REAL (enviado e recebido); sem ele o consumidor da variável não teria teste de tela.

## O que NÃO fiz e por quê
- Não usei dinheiro nenhum à mão: os números desta entrega saem do bloco FATOS MEDIDOS do fechar.
- Não mexi em `.message-bubble` (código morto em V2) nem em `accessibility.css` (o alto contraste já está certo).
- Não montei o hook no topo do app: isso mora fora dos arquivos do cartão. As preferências de interface (PD-41/42) não
  existem no repositório nem no plano atual (`git grep` e o plano de paridade não têm PD-41/PD-42), então o lembrete ficou
  em `localStorage` e `useChatTextSize` ficou exportado como o gancho para o dia em que essa preferência for global.
