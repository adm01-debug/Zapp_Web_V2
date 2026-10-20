Especialista: hugo

## O que mudou e por quê

Vinte e cinco atalhos do registry apareciam em Configurações → Atalhos; 18 deles
não tinham executor nenhum (nenhuma ação no registry, nenhum `customActions` no
provider, nenhum listener de tela). Gravar uma tecla neles não mudava nada.

- `src/hooks/shortcuts/defaultShortcuts.ts:80` — `SHORTCUTS_SOMENTE_INFORMATIVOS`
  com os 18 ids; `:109-110` — `listarAtalhosEditaveis()`. O diff do arquivo é
  `52 + / 0 -`: o registry (`:11-59`, 32 entradas) não perdeu nem trocou linha —
  mesmas teclas, mesmos `alternateKeys`, mesmos `scope` (nenhuma captura nova fora
  do escopo — decisão E16; os 7 de Tarefas seguem com `scope: TASKS_VIEWS`).
- `src/hooks/ui/useGlobalKeyboardShortcuts.ts:41` — a tabela de ações saiu de dentro
  do hook para `criarAcoesGlobais({ pathname, navigate })`, exportada; o hook a chama
  em `:113`. É refatoração de forma: o corpo das ações é o mesmo, só `location.pathname`
  virou o parâmetro `pathname`. Serve para o teste enumerar os executores REAIS em vez
  de repetir uma lista à mão (lista copiada não prova nada).
- `src/components/settings/KeyboardShortcutsSettings.tsx:207` — a tela de rebind passa
  `listarAtalhosEditaveis(shortcuts)` ao `aplicarRotulos`; `:182` não renderiza categoria
  que ficou vazia; `:219` a contagem de "personalizado" conta o que está na tela.
- `src/components/keyboard/KeyboardShortcutsDialog.tsx:151` — mesma filtragem na ajuda.
- `src/components/inbox/KeyboardShortcutsHelp.tsx:23` — mesma filtragem na ajuda do Inbox.
- `src/components/inbox/InboxEmptyChat.tsx:28` — a barra de dicas do estado vazio também
  filtra (arquivo fora da lista do cartão, mas era a mesma promessa falsa: Alt+↑/↓). O
  comentário do arquivo foi ajustado para o que o código faz.

Decisão por id (os 18 sem executor → "somente informativo", fora da tela de rebind e da ajuda):

- `send-message`, `focus-input`, `ai-suggestions`, `emoji-picker`, `attach-file` (chat):
  só existem por caminho fixo (`useChatKeyboardNavigation.ts:30`, Ctrl+Enter) ou por
  nenhum caminho; remapear não muda nada.
- `templates`, `transfer-chat`, `archive-chat`, `pin-conversation`, `mute-conversation`,
  `new-message`, `mark-resolved` (ações): nenhum listener. `useChatShortcuts` não tem
  chamador no repositório.
- `next-conversation`, `prev-conversation` (Alt+↑/↓): ninguém escuta; `useKeyboardNavigation`
  só trata Alt+←/→ e Alt+Home.
- `select-all`, `clear-selection`, `mark-read`, `bulk-archive` (seleção): nenhum listener
  do registry. `select-all` e `mark-read` existem por caminho fixo em
  `RealtimeInboxView.tsx:193` e `:196`, que também não lê a tecla gravada.
- Os que FICARAM (têm executor em `criarAcoesGlobais`): global-search, open-tasks-tab,
  show-shortcuts-help, toggle-sidebar, go-to-inbox, go-to-dashboard, refresh-data e os 7 `tasks-*`.

Prova (arquivo:linha + teste) de cada item do critério:

1. Nenhum atalho editável sem efeito → `defaultShortcuts.ts:109` + teste
   `src/hooks/shortcuts/__tests__/atalhosSemExecutor.test.ts:35` ("nada que a tela mostra
   é editável sem efeito") e `:31` (a lista de informativos é exatamente o conjunto sem
   executor); nas telas, `KeyboardShortcutsSettings.tsx:207` e `KeyboardShortcutsDialog.tsx:151`.
2. Atalhos que TÊM executor seguem intactos → `atalhosSemExecutor.test.ts:42` exige os 7
   globais presentes e editáveis; `defaultShortcuts.test.ts` (inalterado) passa inteiro.
3. Nenhuma captura global nova fora do escopo → o diff não toca no listener nem em
   `scope`/`alternateKeys`; `defaultShortcuts.ts:11-59` está sem uma linha alterada.

Quatro testes existentes tiveram a expectativa ATUALIZADA porque afirmavam o contrário do
critério (é o comportamento novo, não afrouxamento):
`KeyboardShortcutsSettings.test.tsx:67-77` e `KeyboardShortcutsDialog.test.tsx:63-70`
(esperavam ler 'Enviar mensagem', que deixou de ser anunciado); `command-palette-acoes.test.tsx:142`
troca a linha de prova por 'Alternar barra lateral' (o que o teste prova — a ajuda abre de
verdade a partir da paleta — é o mesmo); `useCustomShortcuts.instancias.test.tsx:173-182`
troca `send-message` por `toggle-sidebar` (id que segue na tela) e `InboxEmptyChat.atalhos.test.tsx:45-66`
passa a exigir a ausência de Alt+↑/↓ — o que cada um prova continua sendo o mesmo.

## Prova

- vermelho antes (com `listarAtalhosEditaveis` devolvendo tudo, ou seja, o mundo de antes):
  `npx vitest run src/hooks/shortcuts/__tests__/atalhosSemExecutor.test.ts src/components/settings/__tests__/KeyboardShortcutsSettings.test.tsx`
  → `× nada que a tela mostra é editável sem efeito` — `AssertionError: expected [ 'send-message', …(17) ] to deeply equal []`;
  `× lista só os atalhos que têm executor — nenhuma tecla sem efeito` — `expected document not to contain element`.
- verde depois: `npx vitest run src/hooks/shortcuts/__tests__/atalhosSemExecutor.test.ts` → `Test Files 1 passed (1); Tests 3 passed (3)`
- verde depois (suítes do assunto): `npx vitest run src/components/inbox/__tests__/InboxEmptyChat.atalhos.test.tsx src/components/inbox/__tests__/ConversationListSidebar.empty-state.test.tsx src/hooks/shortcuts/__tests__ src/components/settings/__tests__ src/components/keyboard/__tests__ src/components/ui/__tests__/command-palette-acoes.test.tsx`
  → `Test Files 34 passed (34); Tests 465 passed (465)`

## O que NÃO fiz e por quê

- Arquivos que o juiz marcou como fora da lista: `KeyboardShortcutsSettings.tsx`,
  `KeyboardShortcutsDialog.tsx` e `inbox/KeyboardShortcutsHelp.tsx` são exatamente o item
  "telas de configuração e ajuda de atalhos (só o que listam)" do cartão — e o diff neles
  é só o filtro. `InboxEmptyChat.tsx` (e o teste dele) é o único de fato fora da lista, e
  entra porque a barra do estado vazio é uma segunda lista de atalhos: deixá-la anunciando
  Alt+↑/↓ seria a mesma promessa falsa numa segunda tela (correção incompleta).
- Os eventos `toggle-theme`, `quick-compose` e `toggle-notifications` (citados no PROBLEMA)
  continuam sem ouvinte em `criarAcoesGlobais`: nenhum deles está em `DEFAULT_SHORTCUTS`, logo
  não aparece em tela nenhuma e não é remapeável — não fere o critério 1. Ligá-los é criar
  comportamento novo (tema/compose/notificações), fora do escopo deste cartão.
- Não liguei nenhum dos 18 a um executor real de tela: os executores que o cartão cita
  (próxima/anterior conversa, marcar resolvida, fixar) não existem em tela nenhuma —
  criá-los mexe em ChatPanel/RealtimeInboxView, fora dos arquivos do cartão.
- Não mexi em `useChatShortcuts` nem nos caminhos fixos (Ctrl+Enter, Ctrl+A): legado fora
  do escopo; a consequência é que essas teclas seguem funcionando sem passar pelo remapeamento.
