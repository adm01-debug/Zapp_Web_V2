Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `src/hooks/integrations/useCustomEmojis.ts` (`fetchEmojis`/`loadMore`): a leitura passou de
  `.order('use_count').limit(500)` para `.order('use_count', {ascending:false}).order('id', {ascending:true})`
  com paginação por `.range()`. Sem o desempate, emojis com o mesmo `use_count` trocavam de lugar entre
  leituras (ordem arbitrária do PostgREST) e a lista acima de 500 itens era inalcançável. O hook agora
  expõe `hasMore` e `loadMore()`, que pede a página seguinte a partir de `emojis.length` e não repete
  linha já carregada (filtro por `id`).
- `src/hooks/integrations/useCustomEmojis.ts` (envio): o corpo do upload saiu de `handleFileSelect` para
  `uploadFile(file)` e a falha passou a viver no estado (`uploadError`), não só no toast. O hook expõe
  `uploadError` e `retryUpload()`, que reenvia o último arquivo validado — é o estado que a tela usa para
  mostrar a mensagem com "Tentar novamente". O texto é pt-BR e cita a ação.
- `src/hooks/integrations/useCustomEmojis.ts` (exclusão): `handleDelete` deixou de remover a linha no
  primeiro clique e passou a só marcar `pendingDelete`; quem remove é `confirmDelete()`, e `cancelDelete()`
  descarta o alvo. A ordem durável (linha antes do arquivo, fila de retomada em falha do Storage) foi
  mantida intacta dentro de `confirmDelete`.
- `src/hooks/integrations/__tests__/useCustomEmojis.ordenacaoUploadErro.test.tsx` (novo): 7 testes para os
  3 pontos — ordem encadeada + `range(0,499)`, segunda página por `range(500,999)` sem duplicata,
  `uploadError` no estado, `retryUpload` reenviando o mesmo arquivo, e a exclusão só depois de
  `confirmDelete` (com `cancelDelete` preservando o emoji).
- `src/hooks/integrations/__tests__/useCustomEmojis.persistencia.test.tsx`: o mock do select passou a
  suportar `.order().order().range()` e as 3 provas de exclusão passaram a chamar `confirmDelete()` depois
  de `handleDelete()` — mudança de contrato exigida pelo item 3 do cartão, não afrouxamento: as mesmas
  asserções (DELETE recusado devolve o emoji; Storage recusado entra na fila e é retomado ao reabrir)
  continuam valendo.

## Prova
- verde depois: `npx vitest run src/hooks/integrations/__tests__/useCustomEmojis.ordenacaoUploadErro.test.tsx src/hooks/integrations/__tests__/useCustomEmojis.persistencia.test.tsx` → `Test Files 2 passed (2); Tests 14 passed (14)`
- vermelho antes: medido pelo fechar (os testes novos referenciam `hasMore`, `loadMore`, `uploadError`,
  `retryUpload`, `confirmDelete` e `cancelDelete`, que não existem na base).

## O que NÃO fiz e por quê
- O botão "Carregar mais" e o diálogo de confirmação são de `src/components/inbox/CustomEmojiPicker.tsx`,
  arquivo fora da lista deste cartão (área da Íris, `area-front-componentes`). O hook entrega o estado e as
  funções que a tela precisa (`hasMore`/`loadMore`, `pendingDelete`/`confirmDelete`/`cancelDelete`,
  `uploadError`/`retryUpload`); ligar isso na tela fica para o cartão do componente.
- `handleSend` segue com o UPDATE direto de `use_count`: a RPC `increment_custom_emoji_use` (PB-35) chega
  pelo cartão t_25ece6dc, que está em refazer neste mesmo arquivo. Não dupliquei a mudança.

## Colisão (aviso ao integrador)
- t_25ece6dc (refazer) muda `handleFileSelect` (pasta `<uid>/`) e `handleSend`; eu mexi em `uploadFile`
  (extraído de `handleFileSelect`) e em `fetchEmojis`/exclusão. Se o empilhamento conflitar, o trecho do
  caminho do Storage é dele; o meu é o tratamento de erro e a lista.
