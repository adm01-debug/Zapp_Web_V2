Especialista: iris
Área: area-front-componentes (telas e componentes)

## O que mudou e por quê
- `src/components/ui/dialog.tsx`, `sheet.tsx`, `breadcrumb.tsx`, `pagination.tsx`, `sidebar/sidebar-primitives.tsx`: troquei os textos em inglês do nome acessível dos primitivos (`Close`, `More`, `Previous`, `Next`, `More pages`, `Toggle Sidebar`) pelos equivalentes PT-BR do padrão do V3 (`Fechar`, `Mais`, `Anterior`, `Próximo`, `Mais páginas`, `Alternar barra lateral`), sem tocar em classes, cores, layout ou comportamento.
- `src/components/ui/toast.tsx`: restaurei `aria-label="Fechar"` no `ToastClose` (antes o ícone X não tinha nome acessível).
- `src/components/ui/__tests__/primitivos-a11y-pt.test.tsx` (novo): renderiza cada primitivo REAL e prova o nome acessível em PT-BR (Dialog, Sheet, BreadcrumbEllipsis, Pagination, ToastClose, SidebarTrigger/SidebarRail), além de afirmar a ausência do texto em inglês.
- Testes que buscavam o texto `Close` foram atualizados na mesma troca de string: `settings/media-library/__tests__/AIGenerateDialog.test.tsx`, `email/__tests__/EmailChatThread.previaAnexo.test.tsx`, `catalog/__tests__/ProductDetailDialog.test.tsx`, `inbox/media-gallery/__tests__/MediaPreviewDialog.test.tsx`. O grep em `e2e/` e `tests/` não encontrou nenhuma outra referência a esses textos.

## Prova
- vermelho antes: `npx vitest run src/components/ui/__tests__/primitivos-a11y-pt.test.tsx` com o `dialog.tsx` ainda em "Close" → `Test Files 1 failed (1)` / `Tests 1 failed | 5 passed (6)` — falha em `primitivos-a11y-pt.test.tsx:39` (`getByRole('button', { name: 'Fechar' })` não encontrado).
- verde depois: `npx vitest run src/components/ui/__tests__/primitivos-a11y-pt.test.tsx src/components/settings/media-library/__tests__/AIGenerateDialog.test.tsx src/components/email/__tests__/EmailChatThread.previaAnexo.test.tsx src/components/catalog/__tests__/ProductDetailDialog.test.tsx src/components/inbox/media-gallery/__tests__/MediaPreviewDialog.test.tsx` → `Test Files 5 passed (5)` / `Tests 58 passed (58)`.
- grep de sobra: nenhuma ocorrência de `>Close<`, `>More<`, `>Previous<`, `>Next<`, `Toggle Sidebar`, `More pages`, `Go to previous`, `Go to next` nos 6 arquivos.

## O que NÃO fiz e por quê
- Não mexi em cores, `className`, tokens nem em `data-*`: o cartão é só o texto do nome acessível.
- Não toquei em nenhum outro componente que consome esses primitivos (fora dos 4 testes que buscavam "Close").
