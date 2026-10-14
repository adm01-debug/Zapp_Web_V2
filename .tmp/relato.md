Especialista: iris
## O que mudou e por quê
- `src/components/ui/command-palette-data.tsx` (linhas 53 e 59): as actions de `action-new-chat` e `action-quick-reply` publicavam com `document.dispatchEvent(new CustomEvent(...))` — sem `bubbles`, o evento nunca chegava aos donos que escutam em `window`. Passaram a `window.dispatchEvent(...)`: emissor e ouvinte no mesmo alvo. O `action-keyboard` (linha 67) foi mantido em `document` porque o `GlobalKeyboardProvider` escuta `show-shortcuts-help` em `document` (GlobalKeyboardProvider.tsx:83) — mesmo princípio (mesmo alvo nos dois lados), alvos diferentes por dono diferente. Comentário do bloco (linhas 39-49) atualizado para registrar o porquê.
- `src/components/ui/__tests__/command-palette-acoes.test.tsx`: os dois casos de clique na paleta (linhas 63 e 78) passaram a escutar em `window` (alvo real dos donos) em vez de `document`; novo bloco `paleta → dono, ponte de ponta a ponta` (linha 163) com `it.each` que chama a `action` REAL do catálogo (`defaultActionCommands`) e prova que um listener em `window` recebe o evento.

## Prova
- vermelho antes (só teste mudado, código ainda com `document.dispatchEvent`): `npx vitest run src/components/ui/__tests__/command-palette-acoes.test.tsx` → `Test Files 1 failed (1); Tests 4 failed | 5 passed (9)` — os 2 cliques escutando em `window` e os 2 casos da ponte falham com `expected "vi.fn()" to be called 1 times, but got 0 times`; o caso de `show-shortcuts-help` (document→document) segue verde, provando que só a ponte quebrada falhava.
- verde depois (mesmo comando + donos): `npx vitest run src/components/ui/__tests__/command-palette-acoes.test.tsx src/components/inbox/__tests__/RealtimeInboxView.mobile-nova-conversa.test.tsx src/components/inbox/__tests__/ChatPanel.paleta-respostas-rapidas.test.tsx` → `Test Files 3 passed (3); Tests 15 passed (15)`.
- entorno: `npx vitest run src/components/inbox/__tests__/ src/components/ui/__tests__/` → `Tests 548 passed (548)` (546 anteriores + 2 da ponte). Há 1 `Unhandled Error` de ambiente (jsdom × undici WebSocket, `TypeError: The "event" argument must be an instance of Event`, stack só em `node:internal`/`undici`) sem relação com os arquivos do cartão; a suíte sai com código 0.
- `npx tsc --noEmit` → saída vazia, exit 0. `npx eslint` nos 2 arquivos → saída vazia, exit 0.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (`OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`; `AVISO banco_local NÃO VERIFICADO` — o cartão não tem migration).

## Pontos do revisor
- Ponto 1: resolvido — emissor e ouvinte no mesmo alvo (`window.dispatchEvent` em command-palette-data.tsx:53 e :59; donos em `window`: ChatPanel.tsx:297, RealtimeInboxView.tsx:221). Conferido o `action-keyboard`: emissão em `document` (linha 67) porque a escuta é em `document` (GlobalKeyboardProvider.tsx:83) — segui o mesmo padrão (alvo igual nos dois lados), sem tocar no que funciona. Prova: ponte ponta a ponta + cliques em `window` (vermelho antes, verde depois, acima).
- Ponto 2: resolvido — command-palette-acoes.test.tsx:63-90 escutam em `window` (mesmo alvo dos donos reais) e o bloco novo (linha 163, `it.each` para `action-new-chat`/`action-quick-reply`) prova a ponte ponta a ponta chamando a `action` REAL do catálogo: o evento publicado pelo comando é recebido por listener em `window`, como o dos donos.
- Ponto 3: resolvido sem mexer — os testes dos donos (`RealtimeInboxView.mobile-nova-conversa.test.tsx:175` e `ChatPanel.paleta-respostas-rapidas.test.tsx:177`, ambos com `window.dispatchEvent`) foram mantidos intactos e passam (15/15 acima).
- Ponto 4 (só relato): (a) primeira linha deste relato é exatamente `Especialista: iris`; (b) `ChatPanel.tsx` e `RealtimeInboxView.tsx` NÃO estão na lista de arquivos que o cartão permite tocar — registro que ficam fora dela, com a justificativa: são os donos dos dois fluxos (seletor de respostas rápidas do compositor; NewConversationModal), não existe outro gatilho global para esses fluxos (varredura em `dia/2026-10-14` não achou nenhum listener de `open-new-conversation`/`open-quick-replies` fora deles) e o `CommandPaletteHost` só executa a `action` do item, sem poder abrir os fluxos sozinho; revertê-los apagaria os listeners que os pontos 1–3 exigem, recriando o defeito do #378; (c) o conflito do atalho `n` está registrado em comentário neste cartão (comment_id 14303, 14/10/2026): `n` puro é do `tasks-focus-quickadd` (defaultShortcuts.ts:52, escopo TASKS_VIEWS) e `Ctrl+N` é do `new-message` (linha 34) — por isso os dois comandos seguem sem campo `shortcut`.

## O que NÃO fiz e por quê
- Não registrei atalho `n` (ver Ponto 4c acima): viraria selo de tecla sem binding real.
- Não toquei `CommandPaletteHost.tsx`, `ChatPanel.tsx`, `RealtimeInboxView.tsx` nem nos testes dos donos neste refazer: o ponto 3 manda mantê-los e o host não precisou mudar (a `action` vive no item, como a de "Atalhos de teclado").
- Não incluí o comando "Etiquetas" da V3 (pedido original, item 3: a V2 não tem a tela).

## Arquivos (`git diff --name-only HEAD`)
- src/components/ui/__tests__/command-palette-acoes.test.tsx
- src/components/ui/command-palette-data.tsx
