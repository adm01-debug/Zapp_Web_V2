# PLANO — JANELA DE VISUALIZAÇÃO DO ARQUIVO MENOR (ABA ARQUIVOS) — 5 ETAPAS

> **Data:** 2026-10-07 · **Escopo:** front-end, um arquivo · **Sem DDL, sem Edge Function, sem migration, sem dependência nova.**
> **Pedido do dono (com prints):** ao clicar num arquivo da aba Arquivos, a janela de visualização abre grande demais. Diminuir a **largura em 40%** e a **altura em 20%**.

## 1. Estado verificado (dia/2026-10-07)
- Componente: `src/components/inbox/media-gallery/MediaPreviewDialog.tsx` (140 linhas), usado só por `FilesTab.tsx`.
- Medidas atuais: janela `max-w-4xl` (896 px) e `max-h-[80vh]`; área do conteúdo `min-h-[400px]`; imagem `max-h-[70vh]`; PDF `h-[70vh]`.

## 2. Decisões (o dono pode reverter)
- **D01.** Largura: 896 × 0,6 = **538 px**, limitada à tela no celular (`max-w-[min(538px,calc(100vw-2rem))]`).
- **D02.** Altura (×0,8): janela 80vh → **64vh**; área do conteúdo 400 → **320 px**; imagem e PDF 70vh → **56vh**; vídeo e áudio recebem a mesma redução se tiverem `vh`.
- **D03.** A imagem continua inteira (`object-contain`), centralizada; cabeçalho, setas, X, baixar e encaminhar não mudam.
- **D04.** Não alterar `src/components/ui/dialog.tsx` (afetaria todas as janelas do sistema).

## 3. Etapas
- **V01** [iris] **Cartão único** `t_15327705`: aplicar D01–D04 no `MediaPreviewDialog.tsx` e ajustar/criar o teste das classes e das setas/X.
- **V02** [Claude] verificação na pré-visualização `localhost:5500`: imagem, PDF, vídeo e áudio; setas entre arquivos; celular (390 px) sem barra horizontal; janela de outras telas inalterada.

## 4. Fora de escopo
Redimensionar a janela pelo usuário; zoom da imagem; outras janelas do sistema.

## 5. Estado de execução
_A preencher._ V01 na fila da iris em 07/10/2026.
