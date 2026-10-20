# Aba Arquivos — miniaturas e figurinhas (painel da conversa)

> **Escopo documentado:** o que a aba **Arquivos** do painel da conversa mostra em cada cartão
> hoje — miniaturas de **imagem**, **vídeo** e **PDF**, os documentos sem prévia, e a **figurinha**
> como tipo próprio, separada da imagem. Do dado até a tela: a classificação de tipo
> (`src/hooks/chat/useContactMedia.ts`), a contagem por tipo (`useContactMediaCounts.ts`), os
> cartões dos três modos (`src/components/inbox/tabs/FileThumb.tsx`, `FileCard.tsx`,
> `FilesListView.tsx`, `FilesTableView.tsx`, `fileDisplay.ts`), a prévia de PDF
> (`src/lib/pdfThumbnail.ts`, `src/hooks/chat/usePdfThumbnail.ts`) e os chips da aba
> (`FilesTab.tsx`).
> **Base do código:** árvore local `dia/2026-10-09` (agentes não acessam produção — regra R1).
> **Plano de origem:** `docs/plans/PLANO_MINIATURAS_E_FIGURINHAS_ARQUIVOS_2026-10-07.md`
> (decisões D01–D05 na §3; ondas na §4–§5). Este documento descreve o que está no código — não é
> status de execução.
> **Regras permanentes que valem aqui:** nenhuma informação sai do sistema (este documento não cria
> exportar/baixar/copiar tudo/imprimir/compartilhar); download de arquivo só pelo caminho existente
> `useDownloadPermission`; só as cores que o sistema já tem; **sem selo de canal ou de origem** do
> arquivo. Sem DDL, sem Edge Function, sem migration, sem dependência nova. O que não deu para
> provar no código está marcado **NÃO VERIFICADO**.

---

## 1. O que é e para quem

- **É:** a régua de miniaturas da aba **Arquivos**. Antes, **Vídeos** e **Docs** mostravam só um
  ícone; agora vídeo mostra o **primeiro quadro** e PDF mostra a **1ª página**. As **figurinhas**
  deixaram de cair em "Imagens" e ganharam chip próprio.
- **Para quem:** o atendente na linha de frente do Inbox/Chat; supervisor e admin usam a mesma tela
  (não há permissão nova nem recorte por papel aqui).
- **Onde fica:** no painel da conversa, na aba **Arquivos** (`FilesTab`), em três modos — Grid,
  Lista e Tabela — e três tamanhos de cartão (`card`, `row`, `cell`).
- **Fonte dos arquivos:** os itens vêm de `messages` via `useContactMedia` (`media_url` preenchido,
  não apagados). A classificação de cada item em tipo é o que decide o que o cartão desenha.

---

## 2. Os cinco tipos de arquivo

O tipo é decidido por `classify()` em `src/hooks/chat/useContactMedia.ts:153-170` e chega à tela no
campo `type: ContactMediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker'`. A ordem de
decisão é:

1. **`message_type === 'sticker'` → `sticker`**, e isso decide **antes** do MIME e da extensão. A
   figurinha chega como `image/webp` — ou sem MIME nenhum — e sem esta primeira linha cairia em
   `image`.
2. `media_type`/`media_mimetype` começando com `image/` → `image`; `video/` → `video`;
   `audio/` **ou** `ptt` → `audio`; qualquer outro MIME → `document`.
3. Sem MIME (registro antigo), cai na heurística por extensão/`message_type` de
   `getMediaType` (`src/components/inbox/media-gallery/mediaUtils.ts`).

O rótulo em português de cada tipo fica em `TYPE_LABEL` (`fileDisplay.ts:11-13`):
`Imagem`, `Vídeo`, `Áudio`, `Documento`, `Figurinha`. Ele é o mesmo no cartão, na lista e na tabela.

---

## 3. Os três tamanhos de cartão e o que cada um mostra

O mesmo componente de miniatura (`FileThumb`) serve os três modos, variando só o `size`
(`FileThumb.tsx:28-38`). `renderThumb` (`:272-277`) despacha pelo tipo:

| Tamanho | Onde aparece | Caixa | O que o cartão mostra |
|---|---|---|---|
| `card` | Grid — `FileCard.tsx:142` | ocupa o cartão | miniatura grande + selo/overlay (play no vídeo, selo de extensão no documento); nome, tipo·tamanho, data e remetente ficam fora da miniatura (no cartão) |
| `row` | Lista — `FilesListView.tsx:78` | 48×48 px | miniatura pequena; a linha mostra nome, `Tipo · tamanho · data · remetente` |
| `cell` | Tabela — `FilesTableView.tsx:146` | 32×32 px | miniatura mínima; a tabela tem colunas próprias de Tipo/Tamanho/Data/Remetente |

O despacho por tipo é:

- **`image`** e **`sticker`** → `ThumbImage` (mesma miniatura de imagem);
- **`video`** e **`audio`** → `MediaTile`;
- **`document`** → `DocumentTile` (que, para a família `pdf`, vira `PdfDocumentTile`).

---

## 4. Miniatura de imagem (e da figurinha)

`ThumbImage` (`FileThumb.tsx:92-129`) mostra o arquivo com `<img>`:

- a URL vem de `useResolvedStorageUrl` (`item.url` como locator **sempre** com o resolver, e a URL
  assinada em lote de `useContactMedia` como semente) — é o mesmo hook que **renova a assinatura**
  quando ela vence (`R2-INB-059`);
- `srcSet`/`sizes` usam `cfImagesSrcSet` para servir a imagem no tamanho certo;
- **`object-contain` no `card`** (print de planilha não pode ser cortado) e **`object-cover`** em
  `row`/`cell`;
- enquanto a URL assinada não resolve: **esqueleto** (`ThumbSkeleton`);
- **falha**: faz **um** `refresh` automático da assinatura (o cooldown de 5 s mora no hook) e, se
  ainda falhar, cai num **placeholder estável** — o ícone de imagem com `title="Prévia
  indisponível"`. A falha fica amarrada à URL que falhou: quando a URL muda, o placeholder cai
  sozinho (sem laço de `onError`).

A **figurinha é imagem para a miniatura**: `renderThumb` manda `sticker` para o mesmo `ThumbImage`
(`FileThumb.tsx:273-274`) — nunca o ícone de documento. O que muda é só o rótulo do tipo
("Figurinha") e o chip que a lista.

---

## 5. Miniatura de vídeo — primeiro quadro, sob demanda quando visível

`MediaTile` (`FileThumb.tsx:131-195`), para `video`:

- monta um `<video src={`${url}#t=0.1`} preload="metadata" muted playsInline>` — o `#t=0.1` existe
  porque, sem esse deslocamento, alguns navegadores não desenham o quadro de abertura; `muted` +
  `playsInline` mantêm o comportamento de prévia sem tocar som;
- **os três tamanhos** (`card`, `row` e `cell`) mostram o primeiro quadro — antes só o `card` mostrava;
- **montado só quando entra na zona de pré-carregamento**: o `useInView` do tile
  (`FileThumb.tsx:49-72`) usa `IntersectionObserver` com `rootMargin: '200px'` e observa uma única
  vez, então em lista longa **não existe `<video>` fora da zona**. Em ambiente sem
  `IntersectionObserver`, o tile nasce visível (melhor montar do que nunca mostrar quadro);
- **selo de duração**: vem do `loadedmetadata` do próprio vídeo, formatado por `formatDuration`
  (`fileDisplay.ts:63-67`) em `mm:ss`; aparece no `card` e no `row`, e **não** na `cell` de 32 px;
- **overlay de play** no `card` (prévia da etapa 27);
- **fallback**: sem URL, ou `onError` do `<video>`, cai no ícone de play com o rótulo "Vídeo"
  (no `card`). Não há URL de poster derivada de `media_meta` (G14): só o primeiro quadro do próprio
  arquivo.

O **`audio`** usa o mesmo `MediaTile`, mas mostra o ícone `AudioLines` (e o rótulo "Áudio" no
`card`) — não há prévia possível de áudio, e `media_meta` não tem contrato de duração no
`schema-catalog.json`, então nada de duração inventada. O play/pause do áudio é outro componente
(`AudioPlayButton`).

---

## 6. Miniatura de PDF — 1ª página, sob demanda quando visível

Para `document` de família **`pdf`**, `DocumentTile` monta `PdfDocumentTile`
(`FileThumb.tsx:210-251`), que usa o hook `usePdfThumbnail` (M01) com o **mesmo portão do vídeo** —
o `useInView` do tile. Logo, rolagem de lista longa não renderiza PDF nenhum fora da zona.

### 6.1. O hook (ciclo de vida e estado)

`src/hooks/chat/usePdfThumbnail.ts` — `usePdfThumbnail(item, habilitado)` devolve `{ url, estado }`:

- **`habilitado`** é o portão do chamador (na aba, "o tile entrou na zona"). Enquanto for falso,
  **nada** é assinado nem renderizado.
- lê a URL do objeto por `useResolvedStorageUrl` (bucket privado exige URL assinada; o hook renova) e
  entrega à biblioteca a **URL assinada**, não o locator;
- cada `Blob` vira um **object URL**, **revogado** quando o próximo resultado entra em cena (o
  `<img>` antigo continua válido até lá, sem piscar) e também no desmonte; `AbortSignal` é abortado no
  desmonte, então a renderização em voo para de verdade; resposta que chega depois do desmonte é
  descartada sem tocar em estado nem criar object URL;
- estados devolvidos (`usePdfThumbnail.ts:16-24`):
  - **`loading`** — assinatura da URL em andamento ou miniatura sendo gerada;
  - **`ready`** — `url` tem o object URL do Blob pronto para o `<img>`;
  - **`sem-previa`** — não há prévia possível (item que não é PDF, `habilitado` falso, item sem URL,
    PDF protegido por senha/corrompido/lento/grande demais, sem CORS ou falha de rede);
  - **`erro`** — **reservado à falha ao ASSINAR a URL** do objeto (permissão/expiração). Falha de
    renderização não vira `erro`, vira `sem-previa`.

### 6.2. A biblioteca (o trabalho pesado)

`src/lib/pdfThumbnail.ts` — `renderPdfThumbnail(url, { largura, sinal, chave })` devolve um `Blob`
ou `null` (nunca lança). Regras:

- **`pdfjs-dist` só sob demanda**: `import('pdfjs-dist')` **dinâmico**, na primeira miniatura
  pedida, e o worker resolvido com `import('pdfjs-dist/build/pdf.worker.min.mjs?url')` apontado em
  `GlobalWorkerOptions.workerSrc`. **Nunca import estático** — é o contrato M03
  (`tests/contracts/pdfjs-sob-demanda.contract.test.ts`) que proíbe, para a biblioteca não entrar no
  bundle inicial (decisão D03). A dependência está em `dependencies` do `package.json`
  (`"pdfjs-dist": "^6.4.299"`), nunca em `devDependencies`;
- **só a página 1** é renderizada, num `canvas`, e sai como `Blob` via `toBlob` (`image/jpeg`, 0.82)
  — nunca `toDataURL`, que devolveria base64 ~33% maior;
- **fila** de no máximo **2** renderizações ao mesmo tempo (FIFO), porque a aba monta um tile por
  arquivo e a rolagem pede várias de uma vez; um abort na fila sai na hora, sem segurar vaga;
- **cache LRU de 60** miniaturas, por chave **estável** — a chave é o **id** do item (o token da URL
  assinada não entra na chave, porque ele muda a cada renovação e nunca acertaria o cache); sem chave
  explícita, a chave sai da URL sem a query (`origem + caminho`);
- **teto de 25 MB** (`PDF_THUMBNAIL_MAX_BYTES`) — medido pelo `content-length` e confirmado pelos
  bytes baixados; acima disso, `null` sem nem carregar a biblioteca;
- **prazo de 15 s** (`PDF_THUMBNAIL_TIMEOUT_MS`) que **aborta de verdade** o download e a
  renderização em voo (não só abandona a resposta);
- **cancelamento** por `AbortSignal`;
- **falha vira `null`, nunca exceção**: PDF protegido por senha, corrompido, lento demais, grande
  demais, sem CORS, `pdfjs` indisponível ou falha de rede. A URL assinada **não vai para o log** (só
  origem + caminho, sem token).

### 6.3. O que aparece na tela

- **pronto e visível** (`ready` **e** dentro da zona): a 1ª página em `object-contain` sobre o fundo
  neutro do quadro, com o **selo da extensão** (`documentBadge`) por cima **no `card`** — o mesmo selo
  de antes;
- **`loading`**: o mesmo esqueleto da imagem;
- **todo o resto** (protegido por senha, corrompido, grande demais, sem CORS, `pdfjs` indisponível ou
  falha ao assinar): o **ícone de família** de sempre, **sem erro nenhum na tela**.

---

## 7. Documentos sem prévia (decisão D02)

As famílias de documento vêm de `documentFamily(extension)` (`fileDisplay.ts:38-51`):
`pdf | sheet | doc | ppt | archive | generic`. Só a **`pdf`** ganha ramo próprio de miniatura.

**Word, Excel, PowerPoint e ZIP** ficam com o **ícone da família** (e o selo da extensão no `card`):
não há como renderizá-los no navegador sem um serviço no servidor, e esse serviço seria um projeto à
parte (Edge Function + custo) — fora do escopo desta entrega. Extensão desconhecida cai em
`generic` (ícone genérico, sem selo).

**PDF só pelo MIME** (sem extensão no nome/path): a família vista pelo tile é `generic`, então o
tile mostra o ícone genérico — ele **não inventa** prévia nem selo para um arquivo que não se
identifica como `.pdf` pela extensão.

---

## 8. Como a figurinha é separada da imagem

Sem migration e sem Edge Function: a coluna que separa já é buscada pela aba, e a mudança é só de
classificação e de interface.

1. **Origem do dado.** O webhook grava `message_type = 'sticker'` quando a mensagem é figurinha
   (`supabase/functions/_shared/evolution-media.ts:255-256`). A consulta de mídia da aba já pede
   `message_type` (`useContactMedia.ts`, `SELECT_COLUMNS`).
2. **Classificação antes do MIME.** Em `classify()`, `message_type === 'sticker'` decide **antes** do
   MIME e da extensão (`useContactMedia.ts:160-163`). A figurinha chega como `image/webp` — ou sem
   MIME — e sem esta linha cairia em `image`. *(O comentário do código registra a motivação medida no
   banco real: 484 figurinhas contra 3.600 imagens; esta medição é do plano/código, não foi refeita
   aqui.)*
3. **Chip próprio.** Em `CHIPS` (`FilesTab.tsx:75-82`) existe o chip **"Figurinhas"**
   (`id: 'sticker'`), **depois de "Imagens"** e **antes de "Vídeos"**. O filtro por tipo
   (`FilesTypeFilter = 'all' | ContactMediaKind`) então separa `sticker` de `image`.
4. **Contagem própria.** `useContactMediaCounts` conta por tipo no **banco** (contagem exata por
   `message_type`), com `sticker: ['sticker']` e `image: ['image']`
   (`MESSAGE_TYPES_BY_KIND`, `useContactMediaCounts.ts`) — "Imagens" **não** conta a figurinha. Com
   período ativo, as contagens passam a ser derivadas dos itens carregados do recorte
   (`FilesTab.tsx:211-221`), e o tipo `sticker` entra nessa conta como qualquer outro.
5. **Rótulo.** `TYPE_LABEL.sticker = 'Figurinha'` (`fileDisplay.ts:12`) — é o que a lista e a tabela
   mostram na coluna/linha de tipo.
6. **Miniatura.** A figurinha usa a **mesma** miniatura de imagem (`ThumbImage`), nunca o ícone de
   documento (`FileThumb.tsx:273-274`).
7. **Encaminhamento.** Ao encaminhar, a figurinha sai pelo transporte de **imagem**
   (`FilesTab.tsx:299-307`): o encaminhamento de mídia só conhece imagem/vídeo/áudio/documento, e a
   figurinha **não** vira tipo desconhecido.

---

## 9. Limites e fallbacks (resumo)

| Situação | Limite / comportamento |
|---|---|
| PDF grande | teto de **25 MB**; acima disso, `null` → ícone |
| PDF lento / pendurado | prazo de **15 s**, que aborta download e render em voo; `null` → ícone |
| Vários PDFs na tela | no máximo **2** renderizando ao mesmo tempo (fila) |
| Memória do navegador | cache LRU de **60** miniaturas + object URLs revogados no desmonte |
| PDF protegido por senha / corrompido / sem CORS | **sem-previa** → ícone da família, **sem erro na tela** |
| Falha ao assinar a URL do objeto | estado **`erro`** (o único caminho que não é o PDF em si) → ícone |
| Vídeo / PDF fora da viewport | nada é montado/baixado (portão `useInView`, `rootMargin` 200 px) |
| Imagem que falha ao carregar | **um** refresh da assinatura → placeholder estável, sem laço |
| Word/Excel/PPT/ZIP | ícone da família (sem prévia no navegador) |
| Sem `IntersectionObserver` | o tile nasce visível (monta, em vez de nunca mostrar) |
| Assinatura que expira | renovada por `useResolvedStorageUrl` |

---

## 10. Onde está o código e onde estão os testes

**Código (produção):**

| Arquivo | Papel |
|---|---|
| `src/components/inbox/tabs/FileThumb.tsx` | os cartões (`ThumbImage`, `MediaTile`, `DocumentTile`, `PdfDocumentTile`), os três tamanhos e o `useInView` |
| `src/components/inbox/tabs/fileDisplay.ts` | família de documento, selo de extensão, rótulo de tipo, duração, nome/data |
| `src/components/inbox/tabs/FileCard.tsx` | cartão do Grid (`size="card"`) |
| `src/components/inbox/tabs/FilesListView.tsx` | linha da Lista (`size="row"`) |
| `src/components/inbox/tabs/FilesTableView.tsx` | célula da Tabela (`size="cell"`) |
| `src/hooks/chat/useContactMedia.ts` | consulta das mídias, `classify` (tipo), assinatura em lote |
| `src/hooks/chat/useContactMediaCounts.ts` | contagem exata por tipo (banco) |
| `src/hooks/chat/useFilesViewState.ts` | `FilesTypeFilter` / `typeFilter` (o "recorte de tipo" dos chips) |
| `src/components/inbox/tabs/FilesTab.tsx` | os chips (incl. "Figurinhas") e o encaminhamento |
| `src/lib/pdfThumbnail.ts` | biblioteca da miniatura de PDF (pdfjs sob demanda) |
| `src/hooks/chat/usePdfThumbnail.ts` | hook de estado/ciclo de vida da miniatura de PDF |

**Testes:**

| Arquivo | O que prova |
|---|---|
| `src/lib/__tests__/pdfThumbnail.test.ts` | biblioteca de PDF: sob demanda, página 1, fila de 2, cache LRU, 25 MB, abort, erro → `null` |
| `src/hooks/chat/__tests__/usePdfThumbnail.test.tsx` | portões e estados do hook, object URL (criar/revogar), desmonte |
| `tests/contracts/pdfjs-sob-demanda.contract.test.ts` | contrato M03: nenhum import **estático** de `pdfjs-dist` em `src/**`; dependência em `dependencies` |
| `src/components/inbox/tabs/__tests__/FileThumb.video.test.tsx` | vídeo: primeiro quadro em cartão/linha/célula, selo de duração, fallback de play |
| `src/components/inbox/tabs/__tests__/FileThumb.pdf.test.tsx` | tile de PDF: estados, selo no `card`, fora da zona não pede miniatura |
| `src/components/inbox/tabs/__tests__/FileThumb.pdf.integration.test.tsx` | caminho completo: assinatura → miniatura → `<img>`; desmonte revoga; falhas caem no ícone |
| `src/components/inbox/tabs/__tests__/FilesTab.figurinhas.test.tsx` | chip "Figurinhas": contagem própria, filtro, miniatura de imagem, encaminhamento |
| `src/hooks/chat/__tests__/useContactMedia.sticker.test.tsx` | classificação da figurinha como tipo próprio |
| `src/hooks/chat/__tests__/useContactMedia.stickers.test.tsx` | (M06) figurinhas: classificação, contadores dos chips e filtro "Figurinhas" |
| `src/hooks/chat/__tests__/useContactMediaCounts.test.tsx` | contagem por tipo, com o chip de figurinha |
| `src/components/inbox/tabs/__tests__/FileThumb.test.tsx` / `FileThumb.assinatura-em-lote.test.tsx` | estados do tile e renovação da assinatura em lote |

---

## 11. Planos de 07/10 (liga com o plano de origem)

- `docs/plans/PLANO_MINIATURAS_E_FIGURINHAS_ARQUIVOS_2026-10-07.md` — **plano de origem** desta
  entrega (D01–D05, ondas 1 e 2, verificações finais, riscos).
- `docs/plans/AUTOMACAO_ONDAS_DOS_PLANOS_2026-10-07.md` — como os cartões das ondas nascem sozinhos
  quando as dependências são integradas.
- Outros planos de Arquivos da mesma data, para contexto da aba:
  `PLANO_FILTRO_DATA_ARQUIVOS_8_ETAPAS_2026-10-07.md`,
  `PLANO_REMOVER_COLUNAS_6_8_ARQUIVOS_4_ETAPAS_2026-10-07.md`,
  `PLANO_JANELA_ARQUIVO_MENOR_5_ETAPAS_2026-10-07.md`,
  `PLANO_AUDIO_PLAY_NO_CARTAO_6_ETAPAS_2026-10-07.md`,
  `PLANO_CARTAO_ARQUIVO_MOCKUP_REMETENTE_60_ETAPAS_2026-10-07.md`.

---

## 12. O que NÃO está aqui

- **Prévia de servidor** para Word/Excel/PPT/ZIP (decisão D02 — projeto à parte).
- **Selo de canal ou de origem** do arquivo — não existe e não entra (regra permanente).
- **Exportar/baixar/copiar tudo/imprimir/compartilhar** novos — nada disso foi criado; o download
  continua só pelo caminho existente (`useDownloadPermission`).
- **DDL, Edge Function, migration ou dependência nova** — a entrega é front-end. A única dependência
  tocada foi `pdfjs-dist`, já declarada em `dependencies`, carregada sob demanda.
