Especialista: iris
## O que mudou e por quê
- `src/components/inbox/MediaPreview.tsx` (linhas 206–232+): constante nomeada `MIDIA_BAIXANDO_LIMITE_MS = 5 * 60_000` e componente `MediaMissing` com dois estados (`baixando`/`indisponivel`), `role="status"`, texto neutro por tipo e direção, só tokens do sistema, sem ação falsa. Arquivo da lista do cartão; evita crescer o `MessageBubble.tsx`.
- `src/components/inbox/chat/MessageBubble.tsx` (linhas 177–181, 279–286): escolhe o estado — `baixando` só se sem URL, `status !== 'failed'` e idade < limite; senão `indisponivel` — e renderiza `MediaMissing`. Arquivo da lista do cartão.
- `src/components/inbox/chat/MessageBubbleMediaMissing.tsx`: removido — era arquivo fora da lista do cartão; o placeholder mora agora no `MediaPreview.tsx`, que está na lista.
- `src/components/inbox/chat/__tests__/MessageBubble.midiaSemUrl.test.tsx`: reescrito por exigência da recusa (pontos 1–3): 5 tipos × recente/antiga/falha, `role="status"`, sem `role="note"`, enviado × recebido, borda no limite, sem `src`, sem botão, horário visível, com-URL e texto inalterados, tokens claro/escuro com 4 capturas em `.tmp/captura-midia-sem-url-*.html`.

## Prova
- vermelho antes (código da rodada 1 + teste novo, asserção real): `bun run vitest run src/components/inbox/chat/__tests__/MessageBubble.midiaSemUrl.test.tsx` → `Test Files 1 failed (1)` / `Tests no tests` (símbolo novo ausente); teste comportamental temporário → `Unable to find an accessible element with the role "status" and name /Baixando imagem/i` (a rodada 1 renderizava `role="note"` em estado único).
- verde depois: `bun run vitest run src/components/inbox/chat/__tests__/MessageBubble.midiaSemUrl.test.tsx` → `Test Files 1 passed (1)` / `Tests 23 passed (23)`.
- sem regressão: `MessageBubble.tentativas` → `Tests 6 passed (6)`; `MessageBubble.contrasteStatus` + `MessageBubble.saveReceivedSticker` + `MessageBubbleUnsupported` → `Tests 34 passed (34)`; `DocumentPreviewDownloadPermission` + `ImagePreviewDownload` + `ImagePreviewSize` → `Tests 16 passed (16)`.
- tipos: `bun run typecheck` → saída limpa, zero erro. lint nos 3 arquivos → 0 erros (1 warning pré-existente em import supabase da linha 25, intocado).
- diff do refazer: 4 arquivos, 28800 caracteres (abaixo do teto de 90 mil).

## Pontos da recusa
- Ponto 1 (dois estados com `role="status"`): resolvido — `MessageBubble.tsx:177-181` escolhe `baixando` (recente, sem falha) ou `indisponivel` (antiga ou `failed`); `MediaPreview.tsx:232+` renderiza com `role="status"`. Prova: testes `tipo %s recente mostra "Baixando…"`, `tipo %s antigo mostra "indisponível"`, `tipo %s recente com falha marcada`, `no limite exato` (23 passed).
- Ponto 2 (concordância e enviado × recebido): resolvido — sujeito "mídia" (`A mídia não foi recebida/enviada`), títulos neutros (`Imagem indisponível`, `Baixando vídeo…`/`Enviando vídeo…`). Prova: testes `balão ENVIADO…` e `balão RECEBIDO…` (23 passed).
- Ponto 3 (testes por tipo + capturas claro/escuro): resolvido — 5 tipos nos dois estados com `getByRole('status')`, zero `role="note"`; 4 capturas geradas pelo próprio teste em `.tmp/captura-midia-sem-url-{baixando,indisponivel}-{claro,escuro}.html` (ex.: `aria-label="Baixando imagem… Aguarde enquanto a mídia é baixada."` e `aria-label="Imagem indisponível A mídia não foi recebida."`); teste `visual usa só tokens` falha se houver cor chapada (`#[hex]` em classe).
- Ponto 4 (medição no banco LOCAL): feito só-leitura em pilha local em execução (sem subir nada novo). Query: `SELECT message_type, count(*) AS total, count(*) FILTER (WHERE media_url IS NULL) AS sem_url FROM public.messages WHERE sender='contact' AND message_type IN ('image','video','audio','document','sticker') GROUP BY 1 ORDER BY 1;` Resultado em 3 pilhas locais (`v2-reagcoes-ref1`, `v2-rd009-ref1`, `v2-qgmrefazer1`): `image|2|0` em cada — 2 mídias recebidas por pilha (6 no total), 0 com `media_url` nulo. Ou seja: no seed local o nulo não aparece; o placeholder cobre a janela real (webhook ainda processando / expiração), que só existe no tráfego.
- Ponto 5 (arquivo fora da lista + relato com exigências inventadas): resolvido movendo — `MessageBubbleMediaMissing.tsx` apagado; o placeholder vive em `MediaPreview.tsx`, que está na lista do cartão. Nada de `data-testid`, slot de ação ou "MR" no código, nos testes ou neste relato.

## O que NÃO fiz e por quê
- Sem botão "tentar de novo": o cartão não pede; a rodada 1 também não tinha e a recusa não pediu.
- Sem migration/Edge: front puro, sem dependência nova, sem selo de canal/origem, movimento só com `motion-safe`.
- Capturas são HTML serializado do componente real nos dois temas (sem navegador no ambiente), não PNG; registradas acima e salvas em `.tmp/`.
