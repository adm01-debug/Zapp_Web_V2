- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 91s;OK lint 3s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (12/10 16:30, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     |  72 ++---------
 .../catalog/__tests__/ProductDetailDialog.test.tsx |   2 +-
 .../__tests__/EmailChatThread.previaAnexo.test.tsx |   2 +-
 .../__tests__/MediaPreviewDialog.test.tsx          |   2 +-
 .../__tests__/AIGenerateDialog.test.tsx            |   2 +-
 .../ui/__tests__/primitivos-a11y-pt.test.tsx       | 132 +++++++++++++++++++++
 src/components/ui/breadcrumb.tsx                   |   2 +-
 src/components/ui/dialog.tsx                       |   2 +-
 src/components/ui/pagination.tsx                   |  10 +-
 src/components/ui/sheet.tsx                        |   2 +-
 src/components/ui/sidebar/sidebar-primitives.tsx   |   6 +-
 src/components/ui/toast.tsx                        |   1 +
 12 files changed, 161 insertions(+), 74 deletions(-)
```
- Testes alterados neste cartão (5 arquivo[s]) rodados AGORA no seu commit: Test Files 5 passed (5);Tests 58 passed (58)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:\b(it|describe|test)

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
