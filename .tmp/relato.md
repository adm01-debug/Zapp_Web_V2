Especialista: Hugo (area-front-hooks)

## O que encontrei (o defeito NÃO existe mais no código atual)
O cartão [retomar] pedia para refazer, na ponta `dia/2026-10-11`, o fix do commit `8ae3846a8`
(prazo de 15 s da miniatura). Antes de tocar em código, conferi o estado ATUAL:
- `src/lib/pdfThumbnail.ts` (406 linhas) JÁ tem a correção: cada execução de `processar` abre um
  `AbortController` INTERNO (linha 324), união do sinal do chamador com o relógio de 15 s, e é esse
  sinal (`interno.signal`) que vai ao `fetch` (linha 332) e às checagens de `aborted` (334/337).
  O vigia (`criarVigia`, linhas 213-239) chama `interno.abort()` + `descarte.atual?.()` (linha 326),
  então o prazo derruba o download/`getDocument`/render em voo.
- `aguardarVaga(sinal)` (linhas 92-113) ouve o `abort` e tira quem espera da fila na hora, resolvendo
  `false` sem reservar vaga; `liberarVaga` passa a vaga direto ao próximo (linhas 115-119).
- O fix já está integrado na base pelo commit `73324bd56` ("fix(arquivos): prazo de 15s aborta o
  download em voo e abort na fila resolve null na hora"), vindo do cartão 2610070925a280.

Conclusão: o pedido está cumprido no código de ponta. Não criei código novo (o cartão manda fechar
sem commit nesse caso). Commit desta entrega é vazio (só registra o SHA da branch).

## Prova (executada agora, neste workspace)
- `npx vitest run src/lib/__tests__/pdfThumbnail.test.ts src/hooks/chat/__tests__/usePdfThumbnail.test.tsx`
  → `Test Files 2 passed (2)` ; `Tests 36 passed (36)`.
- Os dois testes que provam o fix estão na base e passam:
  - `o prazo de 15 s aborta o DOWNLOAD em voo: null, getDocument nunca chamado e a vaga volta`
    (test.ts linha 530): prova `sinalDoFetch.aborted === true`, `getDocument` nunca chamado e a vaga
    de volta (a miniatura seguinte roda normal).
  - `abortar quem está na FILA resolve null na hora, sem baixar e sem ocupar vaga` (test.ts ~linha 439):
    aborta a TERCEIRA chamada em espera e ela resolve `null` sem ninguém liberar vaga.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (140s)` (OK em db_guard, tipos, lint, migrations).

## O que NÃO fiz e por quê
- Não commitei código: a correção já está na base (`73324bd56`); reaplicar `8ae3846a8` seria duplicar.
- Nada fora do escopo do cartão foi tocado.
