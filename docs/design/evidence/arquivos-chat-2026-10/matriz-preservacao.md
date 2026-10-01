# Matriz de preservação funcional — aba Arquivos (etapa 04)

**Base:** `main@547eda6` (2026-10-01). Fonte: `src/components/inbox/tabs/FilesTab.tsx`, `FileCard.tsx`, `FileDetailPanel.tsx`, `src/components/inbox/media-gallery/MediaPreviewDialog.tsx`.

Estado real de cada ação hoje e o `data-testid` que a versão nova expõe. Os testes das etapas 46 e 49 cobrem cada linha marcada "preservar".

| Ação | Componente | Handler (arquivo:linha) | Estado real hoje | Destino no plano | `data-testid` novo |
|---|---|---|---|---|---|
| Visualizar | `FileCard` botão "Visualizar"; `FileDetailPanel` não tem | `FilesTab.tsx` → `setPreviewItem` → `MediaPreviewDialog` | **funciona** (imagem/vídeo inline; documento sem leitor) | preservar; PDF ganha `<iframe>` (D2a, etapa 29/30) | `files-item-<id>` + `files-preview` |
| Baixar | `FileCard` "Baixar"; `FileDetailPanel` "Baixar arquivo"; `MediaPreviewDialog` "Download" | `notifyDownloadBlocked()` (`mediaUtils.ts:22`) | **bloqueado por política** (só toast) | preservar bloqueio; botão desabilitado com motivo (etapa 19) | `files-action-download` |
| Encaminhar | `FileCard` "Encaminhar"; `FileDetailPanel` "Encaminhar" | `setForwardItem` → `ForwardMessageDialog` com `onForward={() => {}}` (`FilesTab.tsx:162`) | **stub** — diálogo abre, nada é enviado (G1) | implementar de verdade, só contatos (D1, etapas 36–40) | `files-action-forward`, `files-forward-dialog` |
| Copiar link | `FileCard` menu "Mais ações" → "Copiar link"; `FileDetailPanel` "Copiar link" | `copyLink` → `navigator.clipboard.writeText(resolvedUrl \|\| item.url)` (`FileCard.tsx:28`, `FileDetailPanel.tsx:25`) | **funciona, mas entrega a URL assinada** (G4) | **remover** (D2) | — (ausência verificada por teste) |
| Excluir | `FileCard` menu → "Excluir mensagem"; `FileDetailPanel` "Excluir" | `deleteMessage`: `window.confirm` + `messages.update({ is_deleted: true, content: '[Mensagem apagada]' })` (`FileCard.tsx:38-45`) | **funciona**; só para `sender === 'agent'` (`FileCard.tsx:91`); item **volta após refetch** porque o hook não filtra `is_deleted` (G3) | preservar; `AlertDialog` no lugar de `window.confirm` (etapa 20); filtro no hook (etapa 09) | `files-action-delete`, `files-delete-dialog` |
| Abrir detalhes | clique no card | `onSelect` → `setSelected` → `FileDetailPanel` (`w-[260px]`) | **funciona** (painel lateral fixo) | preservar; vira Sheet abaixo de 1100 px (etapa 31) | `files-detail` |
| Filtrar por tipo | chips Todos/Imagens/Vídeos/Áudios/Docs | `setTypeFilter`; contagens de `data.counts` do hook | **funciona**; contagens incluem apagadas (G3) | preservar; contagem do banco (etapa 42) | `files-filter-<all\|image\|video\|audio\|document>` |
| Buscar | `Input` "Buscar arquivos..." | filtro por `filename`/`caption` em memória (`FilesTab.tsx:50-53`) | **funciona** (só nos ≤200 carregados) | preservar | `files-search` |
| Ordenar | `Select` Mais recentes / Mais antigos / Maiores | `sort` `recent\|old\|biggest` (`FilesTab.tsx:55-58`) | **funciona** | preservar + `alpha` (etapa 06) | `files-sort` |
| Layout (Grid/Lista/Tabela) | — | — | **não existe** (grid fixo `grid-cols-2 2xl:grid-cols-3`, `FilesTab.tsx:121`) | novo (etapas 06–08, 21–26) | `files-toolbar`, `files-layout-trigger`, `files-view-grid\|list\|table`, `files-columns-N` |
| Selecionar / ações em lote | — | — | **não existe** | novo (etapas 33–35, 38) | `files-select-toggle`, `files-selection-bar` |

`data-testid` já existentes e mantidos: `files-tab` (raiz), `file-card`, `file-detail-panel` (usado em `__tests__/FilesTab.test.tsx`).
