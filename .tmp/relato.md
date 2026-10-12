Especialista: iris (area-front-componentes)

## O que mudou e por quê
- `src/components/inbox/tabs/SectionCard.tsx`: prop `headingLevel?: 'h2' | 'h3' | 'h4'` (default `h2`), título renderizado via JSX direto `<Heading>` (sem mapa objeto); botão pill `+ Adicionar` com `text-[hsl(var(--primary-text))]` (contraste AA sobre `bg-primary/15`).
- `src/components/inbox/tabs/SalesViewTab.tsx`: 3 cartões passam `headingLevel="h3"` (página tem `<h2>SalesView</h2>`).
- `src/components/inbox/tabs/JourneyTab.tsx`: cartão "Estatísticas do contato" passa `headingLevel="h3"` (página tem `<h2>Journey</h2>`).
- `src/components/inbox/tabs/__tests__/SectionCard.test.tsx`: 5 testes novos — token `--primary-text` + clique no pill, default h2, `headingLevel="h3"`, e bloco `axe heading-order` com 3 testes (irmãos h2 sem violação; h3 após h2 de página sem violação; controle negativo h4 após h2 COM violação, provando que o axe detecta salto).

## Usos fora das abas (git grep em TODO <SectionCard — `git grep -n "<SectionCard" -- src`)
Só as abas do inbox importam `./SectionCard` (AiTab, Crm360Tab, JourneyTab, NotesTab, SalesViewTab). `FilesTab`/`TasksTab` não usam SectionCard. `catalog/ProductDetailDialog` e `talkx/TalkXCampaignWizard` usam OUTRO `SectionCard` (de `catalogShared`), fora do escopo: `grep "import.*SectionCard"` confirma origens distintas. Notas/IA/CRM 360° não têm `<h2>` de página (grep `<h2|<h1` só acha `JourneyTab:94` e `SalesViewTab:28`), então o default h2 está correto nelas.

## Prova
- vermelho antes (SectionCard antigo restaurado via `git show 85c44d0bd^:...`): `npx vitest run src/components/inbox/tabs/__tests__/SectionCard.test.tsx` → `Test Files 1 failed (1); Tests 4 failed | 7 passed (11)`
- verde depois (fix restaurado, árvore limpa, `git diff --stat HEAD` vazio): mesmo comando → `Test Files 1 passed (1); Tests 11 passed (11)`
- `npx tsc --noEmit -p tsconfig.app.json` → EXIT=0; `npx eslint` nos 4 arquivos → sem saída (limpo).

## Pontos do revisor ([refazer 2], um a um)
- Ponto 1 (teste axe heading-order): atendido — bloco `describe('axe heading-order')` com `color-contrast` desligado (jsdom não calcula contraste; contraste provado pela asserção do token `--primary-text`).
- Ponto 2 (relato lista git grep + confirma SalesView/Journey/Arquivos): atendido — seção "Usos fora das abas" acima.
- Ponto 3 (primeira linha `Especialista: iris (area-front-componentes)`): atendido — é a primeira linha deste relato.
- Ponto 4 (usos fora das abas checados): atendido — JourneyTab e SalesViewTab com `headingLevel="h3"` explícito; catalog/talkx usam outro componente.
- Ponto 5 (JSX direto, sem mapa objeto): atendido — `<Heading className=...>` direto em `SectionCard.tsx:40`, sem `Record`/`as const` de níveis.

## O que NÃO fiz e por quê
- Não alterei `catalogShared` nem `TalkXCampaignWizard`: usam outro `SectionCard`, fora do escopo do cartão.
- Não habilitei `color-contrast` no axe: jsdom não tem CSS/layout; o contraste é provado pela asserção do token.

Concluí: critério de pronto atendido (pill com token + clique, h2 default, h3 em SalesView/Journey, 0 erro axe heading-order).
