Especialista: iris

## O que mudou e por quê
- ESTADO.md:58: a âncora da edge `ai-kb-ingest` saiu de `src/hooks/integrations/useKnowledgeBase.ts:99` para `:126` — a linha do invoke real (`const { data: ingest, error: ingestError } = await supabase.functions.invoke('ai-kb-ingest', { body: { fileId: inserted.id } })`). Motivo: o próprio cartão inseriu linhas acima desse invoke em `useKnowledgeBase.ts` e a guarda de CI `scripts/ci/docs-estado-registry-convention.unit.mjs` ("ESTADO.md cita só âncoras reais") passou a falhar — é o segundo ponto da recusa.
- O restante do trabalho (botões `Excluir`/`Reprocessar`, `AlertDialog` de confirmação, motivo legível da falha, teclado, `aria-label`/`aria-busy`) veio por cherry-pick da faixa do cartão pai; não foi reescrito nesta rodada.

## Prova (comandos rodados nesta sessão)
- `zapp-verify full .` — reproduzido nesta máquina: parou no conjunto `tipos` porque o `tsc` foi morto pelo OOM killer (`Killed`, exit 137), com a mensagem do próprio portão "falha de execução, NÃO é aprovação". O único vermelho é esse; `db_guard` passou. A causa é a máquina (load average ~44, ≤3.6 GB livres, 18+ agentes), não o diff — que nesta rodada é 1 linha de Markdown e nenhum arquivo `.ts`/`.tsx`.
- Guarda do CI do 2º ponto (vermelho antes → verde depois): `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 scripts/ci/docs-estado-registry-convention.unit.mjs`
  - antes: `ESTADO.md cita só âncoras reais ... FAILED` — `AssertionError: âncora desatualizada: src/hooks/integrations/useKnowledgeBase.ts:99 não cita `ai-kb-ingest``
  - depois: `ok | 11 passed | 0 failed (29s)`
- Guarda do 1º ponto: `node scripts/ci/implicit-any-ratchet.mjs` → `implicit-any errors: 0 (baseline: 0)`
- Testes do cartão: `npx vitest run src/components/knowledge src/hooks/integrations/__tests__/useKnowledgeBase.fileActions.test.tsx src/hooks/integrations/__tests__/useKnowledgeBase.uploadIngest.test.tsx` → `Test Files 4 passed (4); Tests 30 passed (30)`

## Pontos da entrega (refazer 2)
- Ponto 1 — `zapp-verify full .` reproduzido: reproduzi o comando. O conjunto `tipos` ficou vermelho só por OOM do `tsc` (exit 137, "falha de execução, NÃO é aprovação"), sob load ~44 e 3.6 GB livres — não há como o meu diff de 1 linha de `ESTADO.md` (nenhum `.ts`/`.tsx`) gerar erro de tipo. Não é ponto de código; é carga da máquina compartilhada.
- Ponto 2 — `implicit-any-ratchet.mjs`: não havia `any` novo no diff; o vermelho anterior era operacional (o `tsc` local não estava instalado e o ratchet abortava por ausência do compilador). Após `bun install`, roda e devolve `implicit-any errors: 0 (baseline: 0)`.
- Ponto 3 — âncora do `ESTADO.md`: realinhada de `:99` para `:126`, a linha do invoke atual de `ai-kb-ingest`; a guarda deno passa `11 passed | 0 failed`. Nesta rodada só `ESTADO.md` foi tocado.

FAIXA DO PAI: commits 28b1ab9c10, a6f9852e89, ae281b5c0a, db6dad3c26, fdb406e05e, 806e819c9d do cartão t_e9d048e9 (refazer 1 deste mesmo trabalho) — trazidos por `git cherry-pick 453e6b69f9..d2c568974f`; não são desta rodada. Commits desta rodada: 9e031551e5 (`ESTADO.md`) e o commit do relato.

## O que NÃO fiz e por quê
- Não versionei captura nem arquivo gerado.
- Não criei projeto Playwright novo para a Base de Conhecimento: a rota não tem sessão sintética nem projeto visual.
