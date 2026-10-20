Especialista: Íris (area-front-componentes)

## O que mudou e por quê

- `src/components/layout/PageHeader.tsx`: BreadcrumbSeparator movido de dentro de BreadcrumbItem para irmão dele (React.Fragment wrapper). O bug era `<li><li role="presentation">...</li></li>` — aninhamento inválido que quebra a hierarquia de lista para leitores de tela.
- `src/components/queues/SLADashboard.tsx`: `<h2>` do topo trocado por `<h1>`. O título "Dashboard de SLA" é o nível principal da página e não tinha h1 anterior, pulando um nível hierárquico.

## Pontos NÃO FEITOS

- Ponto 2b (h3 do acordeão do Catálogo fora de ordem): os h3 estão em `CatalogAdvancedFilters.tsx` (arquivo fora da lista de permissão). O cartão permite tocar só em `ExternalProductManagement.tsx` "só o título", que não contém os h3. Registro como NÃO FEITO.
- Ponto 3 (skip links focáveis sob aria-hidden nas telas de Filas): pesquisa com `git grep -n -i 'skip' src` não encontrou skip links sob `aria-hidden` nas páginas de Filas (`QueueDetails.tsx`, `QueuesComparison.tsx`). Registro como NÃO FEITO.

## Prova

- vermelho antes: `npx vitest run src/components/layout/__tests__/PageHeader.a11y.test.tsx` → falha porque BreadcrumbSeparator está dentro de BreadcrumbItem (seleciona `li[aria-hidden="true"]` dentro de `li[class*="inline-flex"]` e encontra 1).
- verde depois: mesmo comando → 3 passed (teste de estrutura, teste de irmãos, teste de h1).
- `npx vitest run src/components/queues/__tests__/SLADashboard.a11y.test.tsx` → 1 passed (h1 presente, h2 ausente).

## Pontos do revisor

- Ponto 1: BreadcrumbSeparator agora é irmão de BreadcrumbItem, não aninhado. Teste prova estrutura DOM correta.
- Ponto 2a: h2→h1 no SLADashboard. Teste prova h1 presente e h2 ausente.
- Ponto 2b: NÃO FEITO (arquivo fora do escopo).
- Ponto 3: NÃO FEITO (não encontrado nas telas de Filas).