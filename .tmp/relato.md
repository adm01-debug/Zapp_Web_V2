Especialista: vera

FATOS: diff contra a base do dia = 2 arquivos, 1 deles de teste
(e2e/a11y-inbox-teams.spec.ts, novo, +235 linhas) e 1 de config (playwright.config.ts, 1 linha
trocada); 4 casos de teste novos (2 views × 2 viewports). Nenhum outro arquivo entra no diff.
Ambos os arquivos constam em "ARQUIVOS QUE PODE TOCAR" do cartão (o `playwright.config.ts` é a linha
do projeto chromium-a11y que o próprio cartão concede).

## O que mudou e por quê
- e2e/a11y-inbox-teams.spec.ts (novo, 235 linhas): régua axe restrita a `button-name` e `list` no
  Inbox (`?view=inbox`) e no Teams (`?view=team-chat`), nos viewports 390x844 e 1280x900, com sessão
  falsa + backend mockado (padrão de `e2e/a11y-contraste.spec.ts`). Os mocks devolvem DADOS e cada
  teste espera o item da lista (`conversation-item` / `option`) ficar visível antes de rodar o axe.
- playwright.config.ts (1 linha): `testMatch` do projeto `chromium-a11y` passa a casar
  `a11y-(contraste|inbox-teams)\.spec\.ts` — a linha que o próprio cartão concede.
- Nesta rodada o código estava correto e no escopo (o revisor confirmou os Pontos 1–4); a mudança de
  conteúdo é a MESMA entrega, trazida por `git checkout 20ed4a752 -- e2e/a11y-inbox-teams.spec.ts
  playwright.config.ts` (equivale ao cherry-pick dos dois commits, só os arquivos do cartão). Só o
  RELATO foi refeito, como o revisor mandou.

## Pontos do revisor (os 5 da recusa anterior)
A lista anterior tinha 6 pontos com numeração e conteúdo que não batiam com a recusa; ela foi
substituída por estes 5 pontos reais, na mesma ordem da recusa. (Critério "A lista atual tem 6 pontos
com numeração e conteúdo que não batem com a recusa": resolvido — não há mais 6 pontos; há 5.)
- Ponto 1 (faltava prova vermelho→verde): feito. Provei numa cópia com a correção do Inbox desfeita
  (removi o `aria-label` real do botão de favoritar em
  `src/components/inbox/VirtualizedRealtimeList.tsx:534`), rodei a spec e colei o vermelho abaixo; o
  arquivo foi restaurado (`git checkout --`) e o verde é a base sem a mutação. O teste MIDE o defeito:
  falha com `button-name (critical): 2 no(s)` e passa com 0.
- Ponto 2 (mocks com dados + espera pelo item): feito. `mockInboxComDados` devolve 2 contatos e 2
  mensagens (com `conversation_status: open` e `assigned_to` do usuário, senão a Inbox cai no estado
  vazio) e `mockTeamsComDados` devolve 2 conversas de equipe + tabela + membros. Cada teste faz
  `await expect(...).toBeVisible({ timeout: 20_000 })` no item da lista antes do axe (linhas 205, 212,
  224, 231).
- Ponto 3 (código morto e parâmetro `seletor`): feito. `mockTeamVazio` não existe mais; `git grep -n
  "mockTeamVazio\|seletor" e2e/a11y-inbox-teams.spec.ts` → nada. Teams usa `mockTeamsComDados`, e a
  função de medição não recebe mais o parâmetro `seletor` (o alvo do axe é sempre `document.body`).
- Ponto 4 (mensagem do expect, tipo do `impact`, newline final): feito. A mensagem diz `zero violacoes
  de button-name, list` (linha 57), `impact: string | null` (linha 30) e o arquivo termina com newline
  (último byte `0a`).
- Ponto 5 (relato): refeito. Começa com `Especialista: vera`, lista os caminhos do mesmo defeito e cita
  o juiz barato.

## Caminhos do mesmo defeito (botões sem nome acessível e listas no Inbox/Teams)
Comando e saída completos em `.tmp/git-grep.txt`:
- `git grep -nE 'role="tab"|role="listbox"' -- src/components/inbox src/components/team-chat` →
  `inbox/chat/ChatSearchFilters.tsx:79`, `inbox/chat/ConversationTabs.tsx:62`,
  `inbox/location-picker/SuggestionList.tsx:170`, `inbox/stickers/CategorySelector.tsx:41`,
  `inbox/stickers/StickerCategoryBar.tsx:33,47,61,80`, `team-chat/AddMembersDialog.tsx:98`,
  `team-chat/DepartmentManagementDialog.tsx:41`, `team-chat/NewConversationDialog.tsx:159`,
  `team-chat/TeamConversationList.tsx:108,123`, `team-chat/TransferConversationDialog.tsx:78`.
- `git grep -nE '<ul|<ol' -- src/components/inbox src/components/team-chat` →
  `inbox/FileUploader.tsx:205`, `inbox/ForwardMessageDialog.tsx:243`, `inbox/ai-tools/KeyPointsTab.tsx:34,62`,
  `inbox/chat/MessageSendHistorySheet.tsx:51`, `inbox/summary/SummaryResult.tsx:72,86`,
  `inbox/tabs/AiTab.tsx:127,146`, `inbox/tabs/Crm360Tab.tsx:142,177,197,287`, `inbox/tabs/NotesTab.tsx:111`,
  `inbox/tabs/OpenDealsList.tsx:34`, `inbox/tabs/journey/JourneyStatsHero.tsx:498,528`,
  `team-chat/GroupManagementDialog.tsx:116`, `team-chat/TransferConversationDialog.tsx:76`.
Os do cartão são só as duas LISTAS cobertas — a lista de conversas do Inbox
(`src/components/inbox/VirtualizedRealtimeList.tsx`) e a do Teams
(`src/components/team-chat/TeamConversationList.tsx`). Os demais caminhos (abas de stickers e busca,
diálogos de equipe, abas de conteúdo, notas) não estão nas views cobertas por esta spec e NÃO foram
tratados aqui; se renderem `button-name`/`list`, viram cartão próprio.

## Commit de origem e a regra `list`
O commit de origem do cartão é `bbc11d9b4` (spec + linha do `playwright.config.ts`). No repositório o
mesmo conteúdo também aparece como `8611cc2c7` — é o mesmo commit reaplicado sobre a base da branch
do dia: a mensagem é idêntica e o blob da spec não muda entre os dois
(`git diff bbc11d9b4:e2e/a11y-inbox-teams.spec.ts 8611cc2c7:e2e/a11y-inbox-teams.spec.ts` → vazio). A
branch anterior deste trabalho trazia `8611cc2c7` + `20ed4a752`; foi o estado final que eu trouxe.
A regra `list` só foi provada por quebra proposital: as views cobertas (Inbox e Teams) não têm
`<ul>`/`<ol>` — a lista do Inbox são `div` de conversa e a do Teams é `role="listbox"` com filhos
`role="option"` —, então ela reporta 0 nelas por construção. Prova de que a regra está ativa no mesmo
axe do harness (`.tmp/prova-list.mjs`):
```
CONTROLE: []                              # <ul><li> bem formado + botão com nome -> 0 violações
QUEBRA:   ["list (serious): 1 no(s)"]     # <ul><div> -> a regra list dispara
```

## Prova
- vermelho antes (com a correção do Inbox desfeita):
  `npx playwright test e2e/a11y-inbox-teams.spec.ts --project=chromium-a11y --grep "Inbox"` →
  `Error: Inbox desktop: zero violacoes de button-name, list` / `button-name (critical): 2 no(s)`;
  `Error: Inbox mobile: zero violacoes de button-name, list` / `button-name (critical): 2 no(s)` →
  `2 failed` `2 passed (36.3s)`. Log: `.tmp/e2e-vermelho.log`.
- verde depois (base sem a mutação; arquivo restaurado):
  `npx playwright test e2e/a11y-inbox-teams.spec.ts --project=chromium-a11y` → `4 passed (37.0s)`.
  Log: `.tmp/e2e-verde.log`.
- `git diff --stat dia/2026-10-10...HEAD`:
  `e2e/a11y-inbox-teams.spec.ts | 235 +++...` e `playwright.config.ts | 2 +-` → `2 files changed,
  236 insertions(+), 1 deletion(-)`. `--name-only` traz só esses dois, dentro da lista do cartão.
- Juiz barato: `jev-juiz pronto .tmp/relato.md` →
  `jev-juiz (pronto-5): nada a apontar no diff (2 arquivos) nem no relato. Pode fechar.`

## Nota sobre o aviso do juiz barato (pontos que não procedem)
- "Critério de pronto ainda não demonstrado: 'A lista atual tem 6 pontos...'": NÃO procede. Esse texto
  é o item 4 do "O QUE CORRIGIR" do cartão (descrição do defeito da entrega antiga), não do relato
  atual. O relato de agora não tem lista de 6 pontos: tem os 5 pontos reais, na ordem da recusa, e diz
  isso explicitamente na seção "Pontos do revisor". Não há o que demonstrar no diff — a correção é só
  no relato.
- "Você mexeu em arquivo que o cartão não lista: playwright.config.ts": NÃO procede. O cartão lista
  literalmente `playwright.config.ts (só a linha do projeto chromium-a11y citada no commit anterior)`.
  A mudança é exatamente essa 1 linha, e o revisor confirmou ser "a isenção que o próprio cartão
  concede". O arquivo não está fora da lista.

## O que NÃO fiz e por quê
- `playwright.config.ts` ESTÁ em "ARQUIVOS QUE PODE TOCAR" do cartão ("só a linha do projeto
  chromium-a11y citada no commit anterior"); a mudança é exatamente essa 1 linha, o que o revisor
  confirmou como "a isenção que o próprio cartão concede". Não é arquivo fora da lista.
- Não toquei em `src/**`: as correções do Inbox/Teams já estão na base; a mutação do `aria-label` foi
  só para o vermelho e foi revertida (`git status` final = só os dois arquivos do cartão).
- Não cobri as abas de conteúdo (Aba/Stickers/Notas) nem os diálogos de equipe: fora das views
  cobertas do cartão; listados acima para virarem cartão próprio se acusarem violação.

## Rebase em cima da dia de 12/10
- Conflito: `playwright.config.ts`, linha `testMatch` do projeto `chromium-a11y`. A dia passou a casar `/a11y-(contraste|config-admin)\.spec\.ts/` (cartão N-080) e a entrega casava `/a11y-(contraste|inbox-teams)\.spec\.ts/`. Resolvi preservando os dois: `/a11y-(contraste|config-admin|inbox-teams)\.spec\.ts/`. As 4 commits da entrega foram comprimidas em 1 antes do rebase; `e2e/a11y-inbox-teams.spec.ts` aplicou sem conflito.
- Ajuste de conteúdo necessário: na dia a lista do Teams deixou de expor `role="option"` e passou a ser `list "Conversas"` com `listitem`; a espera `getByRole('option')` do spec não achava item e os 2 testes do Teams estouravam. Troquei as 2 esperas (linhas 212 e 231) por `getByRole('list', { name: 'Conversas' }).getByRole('listitem').first()`. Nada mais no spec mudou; as regras axe seguem `button-name` e `list`.
- Provas: `./node_modules/.bin/playwright test --project=chromium-a11y e2e/a11y-inbox-teams.spec.ts --reporter=line` -> antes do ajuste `2 failed, 2 passed` (os dois do Teams, `element(s) not found`); depois do ajuste `4 passed (30.3s)`.
- Vermelho preservado: removi `aria-label` do botão de favoritar (`src/components/inbox/VirtualizedRealtimeList.tsx:534`) e rodei o spec: o Inbox desktop falhou com `button-name (critical): 2 no(s)`; arquivo restaurado com `git checkout --`.
- Os logs de vermelho/verde dos Pontos 1 a 5 acima são da execução original e não foram refeitos além do que está listado aqui. Não rodei a suíte completa de e2e nem typecheck.
