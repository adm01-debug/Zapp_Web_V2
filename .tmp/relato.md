Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/inbox/stickers/StickerManager.tsx: o "+" virou botão real (abre um input de arquivo com `aria-label`), converte para WebP, sobe para o bucket `stickers` e mostra a revisão (`StickerUploadPreview`); a linha de `stickers` nasce no "Salvar" e o "Cancelar" devolve o objeto — acabou o toast de sucesso sem escrita e o aviso que mandava usar um botão inexistente.
- src/components/inbox/stickers/StickerManager.tsx: mutações de favorito/excluir/categoria passam a usar `select('id')` e a tratar erro e 0 linhas (RLS filtra em silêncio, sem `error`), com toast de erro; a consulta ganhou estado de erro com "Tentar de novo".
- src/components/inbox/stickers/StickerManager.tsx: o contador de uso é aguardado e conferido (0 linhas e `use_count` nulo tratados) — antes o update era disparado sem consumir a promessa e nunca chegava ao banco. O envio da figurinha em si continua imediato: a falha ao contar não interrompe.
- src/components/inbox/stickers/StickerTypes.ts: "Despedida" ganhou emoji distinto (🫡) de "Cumprimento" (👋); eram os dois 👋.
- src/components/inbox/stickers/PersonalStickers.tsx: o selo da pasta pessoal diz "figurinhas" em vez de "fotos".
- src/components/inbox/stickers/StickerCategoryBar.tsx + src/hooks/sticker-picker/useStickerPicker.ts + src/components/inbox/StickerPicker.tsx: no Seletor, "Recentes" ordena por `created_at` (mais novas primeiro) e "Mais usadas" virou filtro próprio (por `use_count`), com a legenda do rodapé coerente ("· Recentes" / "· Mais usadas").
- src/components/inbox/stickers/StickerManager.tsx: `aria-label` nos dois botões de tamanho da grade; o spinner do envio usa `motion-safe:animate-spin` (respeita reduzir movimento).

## Prova
- vermelho antes: `npx vitest run src/components/inbox/stickers/__tests__/StickerManager.envio.test.tsx src/hooks/sticker-picker/__tests__/useStickerPicker.recentes.test.tsx` → `Test Files  2 failed (2)` / `Tests  9 failed (9)` (o "+" real não existia, o contador não era consumido, "Mais usadas" não existia).
- verde depois: mesmo comando → `Test Files  2 passed (2)` / `Tests  9 passed (9)`.
- regressão da área: `npx vitest run src/components/inbox/stickers src/hooks/sticker-picker src/hooks/integrations/__tests__/usePersonalStickers.webp.test.tsx src/lib/__tests__/stickerImage.test.ts src/components/inbox` → `1 failed | 206 passed (207)`, `1681 passed | 1 todo (1683)`; a única falha (`FilesTab.period.integration.test.tsx`, alheia a figurinhas) roda verde isolada: `Tests  9 passed | 1 todo (10)` — era falso vermelho por carga.
- `npx tsc -b --force` → exit 0 (sem erro de tipo).

## Estados da tela alterada
- Carregando: a grade segue em `loading` (`isLoading`). Vazio: mensagem própria da grade. Erro: novo bloco `role="alert"` com "Não foi possível carregar as figurinhas" e botão "Tentar de novo" (`refetch`).

## O que NÃO fiz e por quê
- Não removo o objeto de storage ao excluir a linha no gerenciador: o cartão cobre envio/erros/contador/filtros; limpeza de objeto na exclusão não está no pedido.
- Não chamo a classificação por IA no upload do gerenciador (`aiCategory: 'outros'`): mantém a revisão sem acionar Edge nova.
