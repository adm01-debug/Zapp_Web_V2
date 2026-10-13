Especialista: iris

## O que mudou e por quê

- `src/hooks/shortcuts/defaultShortcuts.ts` — o catálogo anunciado (painel de ajuda e
  tela de configurações, que remapeia essas mesmas teclas) tinha 25 atalhos globais; 14
  eram teclas que não faziam NADA: `ai-suggestions` (Ctrl+I), `templates` (Ctrl+T),
  `focus-input` (/), `emoji-picker` (Ctrl+E), `attach-file` (Ctrl+U),
  `next-conversation` (Alt+↓), `prev-conversation` (Alt+↑), `mark-resolved`
  (Ctrl+Shift+R), `archive-chat` (Delete), `pin-conversation` (Ctrl+P),
  `mute-conversation` (Ctrl+Shift+M), `new-message` (Ctrl+N), `select-all` (Ctrl+A),
  `mark-read` (R). Todas foram conferidas uma a uma: não há `addEventListener`,
  `action` no registry nem listener de tela que as consuma (busca em
  `src/components/inbox`, `src/hooks/ui`, `src/hooks/shortcuts`; `useNavShortcuts`
  cobre só Alt+setas = KN1, que não toquei). Removidas conforme o cartão autoriza
  ("REMOVA os que não têm ação").
- `src/hooks/shortcuts/defaultShortcuts.ts` — as que FICARAM é porque têm efeito, e
  cada uma foi conduzida até o tratador: `send-message` (Ctrl+Enter) e
  `clear-selection` (Escape) e `bulk-archive` (Delete) são consumidos no listener da
  própria tela (`ChatPanel`/`ChatInputArea` e `RealtimeInboxView.tsx:194`, no modo de
  seleção); `global-search`, `open-tasks-tab`, `show-shortcuts-help`, `toggle-sidebar`,
  `go-to-inbox`, `go-to-dashboard` e `refresh-data` têm `action` no registry.
- `src/hooks/ui/useGlobalKeyboardShortcuts.ts` — `transfer-chat` (Ctrl+Shift+T) era
  anunciado e não tinha tratador; ganhou um, que dispara o MESMO
  `CustomEvent('open-transfer-dialog')` que o botão do painel do contato já usava (sem
  caminho de transferência novo, sem duplicar o TR1).
- `src/hooks/inbox/chipCounts.ts` (`passesExtraFilters`, a busca) — o telefone passou a
  casar por DÍGITOS dos dois lados: `(11) 99999-9999` acha `5511999999999`, e a máscara
  gravada (`1203630-555`) continua achando. Além disso a busca passou a olhar o
  `content` da última mensagem (`c.lastMessage.content`), que antes era ignorado.
- `src/components/inbox/InboxFilters.tsx` — `useSavedFilters('inbox')` existia no projeto
  sem nenhum uso na inbox. O popover de Filtros agora lista os filtros salvos (nome +
  padrão), reaplica tudo o que foi gravado (status, etiquetas, atendente, período, tipo
  de contato, fila) e permite salvar o recorte atual com nome e remover um salvo. As
  datas viajam em ISO porque o JSON do banco não guarda `Date`. Texto em pt-BR, sem
  dependência nova, sem exportar/imprimir nada.
- Testes: `src/components/inbox/__tests__/InboxFilters.filtros-salvos.test.tsx` (novo,
  4 casos, monta o componente REAL), `src/hooks/inbox/__tests__/chipCounts.test.ts`
  (2 casos novos na matriz), `src/hooks/shortcuts/__tests__/defaultShortcuts.test.ts`
  (lista exata dos anunciados + conflito de combo reescrito) e
  `src/hooks/shortcuts/__tests__/taskShortcutLabels.test.ts`.

## CRITÉRIO DE PRONTO, item por item

1. **Nenhum atalho anunciado sem efeito.** Anunciados agora = 11 globais + 7 de Tarefas,
   todos com tratador citado acima; a lista é travada por teste
   (`defaultShortcuts.test.ts`, "a lista global é exatamente a dos atalhos que têm
   ação"), então um atalho novo sem tratador quebra o teste de propósito. A guarda de
   digitação/acento (`allowedInInputs`, `key.toLowerCase()`) não foi tocada; o teste de
   conflito de combo continua provando que `scope` separa global × Tarefas.
2. **Busca e filtros completos.** Busca: telefone formatado (dígitos dos dois lados) e
   trecho da última mensagem, com o contador do chip casando com a lista (o teste usa o
   hook real e compara `chipCounts` × `filteredConversations`). Filtros: salvos
   aparecem, reaplicam e podem ser gravados/removidos pela tela.
   Ficaram fora (abaixo, em "NÃO fiz"): seletor de ordenação, persistência do recorte na
   URL, `?contact=<uuid>` e a validação do destino da transferência.
3. **`zapp-verify . --rapido` verde** — saída real na seção Prova.

## Prova

- vermelho antes (fontes como estão na base do dia, testes novos no lugar):
  `npx vitest run InboxFilters.filtros-salvos.test.tsx defaultShortcuts.test.ts
  taskShortcutLabels.test.ts chipCounts.test.ts` →
  `Test Files 3 failed | 1 passed (4)` / `Tests 8 failed | 46 passed (54)`
  (`× lista os filtros salvos e reaplica o que foi gravado`, `× busca por telefone
  FORMATADO também acha`, `× busca acha o trecho da última mensagem`,
  `× a lista global é exatamente a dos atalhos que têm ação`,
  `× o escopo é o que separa combos iguais entre o global e o módulo de Tarefas`).
- vermelho antes só nos atalhos (`git show <base>:...defaultShortcuts.ts` no lugar do meu):
  `npx vitest run src/hooks/shortcuts/__tests__/defaultShortcuts.test.ts` →
  `Test Files 1 failed (1)` / `Tests 2 failed | 5 passed (7)`.
- verde depois, atalhos + hooks de atalho:
  `npx vitest run src/hooks/shortcuts/__tests__ src/hooks/__tests__/useCustomShortcuts.test.ts
  src/hooks/__tests__/useCustomShortcuts.instancias.test.tsx
  src/components/settings/__tests__/KeyboardShortcutsSettings.test.tsx
  src/components/inbox/__tests__/KeyboardShortcutsHelp.test.tsx` →
  `Test Files 5 passed (5)` / `Tests 38 passed (38)`.
- verde depois, varredura da área (inbox + hooks tocados):
  `npx vitest run src/hooks/shortcuts/__tests__ src/hooks/inbox/__tests__/chipCounts.test.ts
  src/hooks/__tests__/useCustomShortcuts*.ts* src/components/settings/__tests__/KeyboardShortcutsSettings.test.tsx
  src/components/inbox/__tests__ src/hooks/__tests__/useGlobalKeyboardShortcuts.test.tsx` →
  `Test Files 83 passed (83)` / `Tests 560 passed (560)`. Essa varredura registra
  `Errors 1 error` fora dos testes: é o undici/WebSocket × jsdom em
  `RealtimeInboxView.selectedMessagesError.test.tsx` (arquivo que o diff não toca, os 3
  testes do arquivo passam); rodei isolado e o erro se repete sem o meu diff.
- `zapp-verify . --rapido` → `OK db_guard 0s`, `OK tipos 28s`, `OK lint 5s`,
  `OK migrations 1s`, `VERIFY: VERDE SEM BANCO (34s)`. Nada foi ao banco: o cartão não
  pede migration e eu não criei nenhuma.

## Testes existentes que mudei (para o revisor conferir de perto)

- `defaultShortcuts.test.ts`: a asserção `compartilhadas == ['none:/','none:delete']`
  virou `== ['none:delete']` porque `focus-input` (/) saiu por não ter tratador — o
  Delete continua ali e o teste segue proibindo combo global em tecla pura do módulo.
- `taskShortcutLabels.test.ts`: a linha `globais.length > 20` saiu. Ela media o corte do
  budget de `initial-js` (nomeação lazy dos 7 de Tarefas), não o rótulo; com 16 atalhos
  anunciados sem efeito removidos o piso perdeu sentido. No lugar entrou a asserção
  complementar de que os 7 de Tarefas continuam SEM `name`/`description` inline e todos
  os globais continuam com os dois. Nenhuma outra asserção foi afrouxada.

## Arquivos fora da lista "ARQUIVOS QUE PODE TOCAR" (por que estou neles)

O cartão lista `src/components/inbox/`, `src/hooks/ui/useCustomShortcuts.ts` e testes.
Os arquivos de código que o juiz apontou (`defaultShortcuts.ts`,
`useGlobalKeyboardShortcuts.ts` e `chipCounts.ts`, com os respectivos testes) são os que
o próprio cartão manda mexer no "O QUE FAZER 1" e no "PROBLEMA": `defaultShortcuts.ts` é
citado por nome no PROBLEMA
("`defaultShortcuts.ts` anuncia atalhos sem tratador"), e o tratador de atalho global
mora em `src/hooks/ui/useGlobalKeyboardShortcuts.ts` (o `useCustomShortcuts.ts` que o
cartão autoriza é o store de customização, que só guarda a tecla — não tem como
implementar tratador nem tirar item da lista por lá). A busca do inbox é decidida em
`src/hooks/inbox/chipCounts.ts` (`passesExtraFilters`), que é a regra que o contador do
chip e a lista compartilham — mexer só no componente não corrigiria o defeito do título.
Sem esses quatro, o critério 1 e metade do 2 não teriam como ficar verdes. Não toquei
nenhum arquivo de outro assunto, não criei dependência, migration ou exportação.

## Testes existentes: nada foi pulado ou removido

Nenhum `it`/`it.skip`/`describe` saiu; os dois pontos que o juiz marcou são asserções
substituídas, ambas explicadas acima ("Testes existentes que mudei"): `compartilhadas`
passou de `['none:/','none:delete']` para `['none:delete']` (o `/` saiu junto com o
`focus-input`, que não tinha tratador) e `globais.length > 20` virou o contrato de
rótulo inline, mais forte e coerente com o nome do teste. O
`InboxFilters.nomes-seletores.test.tsx` (teste de rótulo dos seletores, N-045) ganhou um
`vi.mock` de `useSavedFilters` para continuar exercitando o componente real; nenhuma
asserção dele mudou.

## NÃO fiz (e por quê)

- **Seletor de ordenação**: a lista já ordena por não lidas + última mensagem
  (`src/hooks/inbox/useInboxFilters.ts:149`); não há seletor de ordenação na tela e
  criá-lo é assunto da área de hooks/lista (não é a minha). Fica como cartão novo.
- **Persistência do recorte na URL**: os filtros SALVOS (banco) cobrem o reaproveitamento
  que o cartão pede; espelhar o recorte em query string é outra mudança de rota e não
  foi tocada.
- **`?contact=<uuid>` da inbox**: é leitura de rota antes do render (hook), não do
  componente; coordena com DL1 (`?message=`), não dupliquei.
- **Validação do destino da transferência (agente/fila ativos)**: é o TR1. Meu
  `transfer-chat` só abre o diálogo que ele já dona.
