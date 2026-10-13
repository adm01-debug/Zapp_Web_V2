Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/dashboard/DashboardView.tsx: monta o WidgetConfigSheet no topo da aba Visão Geral (`data-testid="dash-personalizar"`) e cria a instância única de `useDashboardWidgets`; passa `widgetConfig.visibleWidgets` para a GamificationSection. Antes o componente existia pronto, mas nada o abria (PROBLEMA do cartão).
- src/components/dashboard/WidgetConfigSheet.tsx: o botão passa a se chamar "Personalizar"; a lista ganha arrastar (`@hello-pangea/dnd`) COM alternativa de teclado (setas ↑/↓, cada uma com `aria-label`) e uma região `aria-live` (`LiveRegion`) que anuncia a nova posição; os cartões fixos `stats`/`queues`/`activity` ficam com interruptor travado e selo "Obrigatório". "Restaurar Padrão" segue chamando `resetToDefaults`.
- src/components/dashboard/overview/GamificationSection.tsx: aceita `visibleWidgets` por prop. Antes tinha uma 2ª instância própria do hook, então o painel não surtia efeito nela até recarregar a página — agora visibilidade e ordem vêm da config compartilhada.
- src/components/dashboard/DraggableWidgetContainer.tsx: repassa `onReorder` para o WidgetConfigSheet, mantendo o mesmo contrato de reordenação (arrastar + teclado).

## Prova
- vermelho antes: `npx vitest run src/components/dashboard/__tests__/WidgetConfigSheet.test.tsx src/components/dashboard/__tests__/GamificationSection.customizacao.test.tsx` com os dois componentes na versão da base (`git show HEAD~1:...`) → `Test Files 2 failed (2); Tests 8 failed | 2 passed (10)` (no botão `btn-personalizar`, sem setas, sem `aria-live`, seção ignorando a prop).
- verde depois: mesmo comando → `Test Files 2 passed (2); Tests 10 passed (10)`.
- regressão da área: `npx vitest run src/components/dashboard/__tests__ src/hooks/__tests__/useDashboardWidgets.test.ts` → `Test Files 35 passed (35); Tests 168 passed (168)`.
- lint no pre-commit: `baseline=2, atual=2, novas=0`.

## Estados da tela alterada
- Painel fechado (só o botão "Personalizar"), aberto com a lista, e "Modo de edição" ligado/desligado: cobertos pelo teste do painel.
- Lista vazia e erro de carregamento do dashboard: inalterados por este cartão; o painel fica dentro de `SectionErrorBoundary sectionName="Personalizar widgets"`, então uma falha nele não derruba o resto da Visão Geral.

## O que NÃO fiz e por quê
- Não alterei o hook `useDashboardWidgets` (src/hooks/** é da área de hooks): a persistência por navegador em localStorage e a leitura com try/catch continuam as do hook; esta entrega é só a montagem e o comportamento da tela.
- Sem banco, sem migration, sem Edge Function: o cartão é de tela e nada aqui decide estado no servidor.
- A DraggableWidgetContainer não ganhou montagem própria na Visão Geral (evita duplicar a grade de cards fixos); a superfície montada é o WidgetConfigSheet. Foi ajustada só para manter o mesmo contrato de reordenação.
