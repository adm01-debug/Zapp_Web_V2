# PLANO — MINIATURAS DE ARQUIVOS E FIGURINHAS NA ABA "ARQUIVOS" (CHAT PANEL)

> **Data:** 2026-10-07 · **Escopo:** front-end · **Sem DDL, sem Edge Function, sem migration.**
> Este documento é plano; nenhuma linha de código de produto foi alterada ao escrevê-lo.

## 1. Pedido do dono
Na aba **Arquivos** do painel do chat, as visões **Vídeos** e **Docs** mostram só um ícone; deveriam mostrar uma **miniatura** do arquivo, como já acontece com as imagens. E: **separar as figurinhas das imagens**.

## 2. Estado verificado (dia/2026-10-07)

- `FileThumb.tsx` (210 linhas) já mostra miniatura de **imagem** (URL assinada, `object-contain` no cartão) e o **primeiro quadro do vídeo** só no tamanho `card`; nos tamanhos `row`/`cell` o vídeo mostra ícone de play. **Documentos** mostram só ícone da família (`documentFamily`).
- A classificação (`useContactMedia.ts`, `classify`) decide por MIME e cai numa heurística de extensão; os tipos são `image|video|audio|document`.
- Figurinhas: o webhook grava `message_type = 'sticker'` (`_shared/evolution-media.ts:255`). No banco oficial (consulta de agregação, só leitura): **484 mensagens `sticker`** e 3.600 `image`, todas com MIME nulo. Hoje a figurinha cai em **imagem**. A coluna já é buscada pela aba (`message_type`), então **separar não exige migration nem Edge Function**.
- `pdfjs-dist` NÃO existia no projeto. Foi adicionado (commit `02c5c6e0a`, `^6.4.299`, Apache-2.0, `bun.lock` só acrescenta linhas) para a prévia de PDF, carregado **sob demanda**.

## 3. Decisões (o dono pode reverter)

- **D01.** **Prévia real** para: imagem (já existe), vídeo (primeiro quadro em todos os tamanhos), PDF (1ª página no navegador).
- **D02.** **Limite declarado:** Word, Excel, PowerPoint e ZIP **não** têm como ser renderizados no navegador sem um serviço no servidor; ficam com o ícone da família (já existe). Um serviço de miniaturas no servidor seria um projeto à parte, com Edge Function e custo.
- **D03.** A biblioteca de PDF **nunca entra no bundle inicial** (import dinâmico), para não estourar o teto de 343 KB; um contrato (M03) protege isso.
- **D04.** **Figurinhas** ganham um filtro próprio "Figurinhas" na aba, usando `message_type = 'sticker'`, sem migration; saem do filtro "Imagens".
- **D05.** **Duas ondas**, porque os cartões da onda 2 usam código novo da onda 1 (que precisa estar integrado antes) e mexem nos mesmos arquivos.

## 4. Onda 1 — cartões da fábrica (arquivos disjuntos)

- **M01** [hugo] **Miniatura da 1ª página de PDF: biblioteca e hook.** Criar `src/lib/pdfThumbnail.ts`: `renderPdfThumbnail(url, {largura, sinal})` com `import('pdfjs-dist')` DINÂMICO (nunca estático), worker via `import('pdfjs-dist/build/pdf.worker.min.mjs?url')`, renderiza só a página 1 num canvas e devolve um Blob (`toBlob`, nunca `toDataURL` de canvas tocado por outra origem), com: fila de no máximo 2 renderizações ao mesmo tempo, cache LRU de 60 itens por chave estável, cancelamento por AbortSignal, limite de 25 MB, e `null` (nunca exceção) para PDF protegido por senha, corrompido ou lento (timeout 15 s). Criar `src/hooks/chat/usePdfThumbnail.ts`: `usePdfThumbnail(item, habilitado)` devolve `{ url, estado }` (`loading|ready|sem-previa|erro`), usa `useResolvedStorageUrl` para a URL assinada, cria o object URL e o revoga ao desmontar. A biblioteca `pdfjs-dist` JÁ está instalada e no package.json (commit 02c5c6e0a): não mexa em package.json nem em bun.lock. Testes com `vi.mock` de `pdfjs-dist` cobrindo fila, cache, cancelamento, limite, erro e revogação do object URL.
  *Arquivos:* src/lib/pdfThumbnail.ts; src/lib/__tests__/pdfThumbnail.test.ts; src/hooks/chat/usePdfThumbnail.ts; src/hooks/chat/__tests__/usePdfThumbnail.test.tsx (todos novos).
  *Aceite:* Nenhum import estático de pdfjs-dist; fila de 2; cache; cancelamento; erro vira `sem-previa`; testes verdes (vermelho antes onde houver comportamento novo).
- **M02** [iris] **Miniatura de vídeo: primeiro quadro em todos os tamanhos.** Em `src/components/inbox/tabs/FileThumb.tsx` (`MediaTile`), o vídeo só mostra o primeiro quadro no tamanho `card`; nos tamanhos `row` e `cell` mostra um ícone de play. Fazer os três tamanhos mostrarem o primeiro quadro: `src={`${url}#t=0.1`}` (sem o deslocamento alguns navegadores não desenham o quadro), `preload="metadata"`, `muted`, `playsInline`, montado só quando entra na zona de pré-carregamento (já existe `useInView`, estenda para os três tamanhos), selo de duração em `card` e `row`, e ícone de play como fallback se o vídeo falhar ao carregar (`onError`). NÃO mexer em `DocumentTile` nem em `renderThumb` para PDF (é a onda 2). Testes em arquivo NOVO `FileThumb.video.test.tsx`.
  *Arquivos:* src/components/inbox/tabs/FileThumb.tsx (só MediaTile e o hook useInView); src/components/inbox/tabs/__tests__/FileThumb.video.test.tsx (novo).
  *Aceite:* Vídeo mostra o primeiro quadro em card, row e cell; fallback de play em erro; selo de duração; testes verdes.
- **M03** [workertestes] **Contrato: pdfjs-dist só carrega sob demanda.** Criar `tests/contracts/pdfjs-sob-demanda.contract.test.ts`: varre `src/**` (fora de `__tests__`) e falha se houver `import ... from 'pdfjs-dist'` ou `import 'pdfjs-dist...'` ESTÁTICO; só `import('pdfjs-dist...')` dinâmico é permitido. Também prova que `pdfjs-dist` está em `dependencies` do package.json (não em devDependencies). Prove a utilidade do contrato por mutação: crie temporariamente um import estático num arquivo de teste do próprio contrato e mostre vermelho.
  *Arquivos:* tests/contracts/pdfjs-sob-demanda.contract.test.ts (novo).
  *Aceite:* Contrato verde hoje; vermelho se alguém importar pdfjs-dist de forma estática.

## 5. Onda 2 — criada depois que a onda 1 estiver integrada

- **M04** [iris] Miniatura de PDF no tile de documentos (usa o hook da M01).
- **M05** [iris/complexo] Figurinhas: novo tipo, filtro "Figurinhas" e tile.
- **M06** [workertestes] Testes do tile de PDF e do filtro de figurinhas.
- **M07** [vera] Documentação da aba Arquivos.

## 6. Verificações finais (Claude, depois da integração)

1. tsc, lint, testes e contratos completos
2. build e teto do bundle (o chunk do PDF deve ser separado; o inicial não pode passar de 343 KB)
3. pré-visualização local com um PDF real, um vídeo real e uma figurinha real: miniaturas aparecem, figurinhas saem de Imagens, contagens batem (484 figurinhas / 3.600 imagens no banco real)
4. PDF protegido por senha e arquivo corrompido não quebram a tela
5. rolagem com muitos arquivos: no máximo 2 PDFs renderizando ao mesmo tempo, sem travar
6. acessibilidade (teclado e leitor) e mobile 390 px

## 7. Riscos
- URLs assinadas expiram: o hook usa `useResolvedStorageUrl`, que já renova.
- CORS do storage para ler o PDF no navegador: se faltar, a prévia cai em `sem-previa` (ícone), nunca em erro de tela.
- PDFs grandes: limite de 25 MB e timeout de 15 s.
- Memória do navegador: cache LRU e revogação dos object URLs.
