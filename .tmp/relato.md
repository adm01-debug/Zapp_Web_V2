Especialista: iris

## O que mudou e por quê
- ESTADO.md:58: a âncora da edge `ai-kb-ingest` saiu de `src/hooks/integrations/useKnowledgeBase.ts:99` para `:126` — a linha do invoke real (`const { data: ingest, error: ingestError } = await supabase.functions.invoke('ai-kb-ingest', { body: { fileId: inserted.id } })`). Motivo: o trabalho deste cartão inseriu linhas acima do invoke em `useKnowledgeBase.ts` e a guarda de CI `scripts/ci/docs-estado-registry-convention.unit.mjs` ("ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge") passou a falhar. É o ponto 2 da recusa.
- O restante do trabalho (botões `Excluir`/`Reprocessar`, `AlertDialog` de confirmação, motivo legível da falha, teclado, `aria-label`/`aria-busy`) veio por cherry-pick da faixa do cartão pai e não foi reescrito nesta rodada.

## Prova
- vermelho antes (guarda do CI, ainda com a âncora `:99`): `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 scripts/ci/docs-estado-registry-convention.unit.mjs` → `ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge ... FAILED` / `AssertionError: âncora desatualizada: src/hooks/integrations/useKnowledgeBase.ts:99 não cita `ai-kb-ingest``
- verde depois (mesmo comando, âncora `:126`): `ok | 11 passed | 0 failed (29s)`
- implicit-any-ratchet (ponto 1 da recusa): `node scripts/ci/implicit-any-ratchet.mjs` → `implicit-any errors: 0 (baseline: 0)`
- testes do cartão: `npx vitest run src/components/knowledge src/hooks/integrations/__tests__/useKnowledgeBase.fileActions.test.tsx src/hooks/integrations/__tests__/useKnowledgeBase.uploadIngest.test.tsx` → `Test Files 4 passed (4); Tests 30 passed (30)`
- `zapp-verify full .`: o único passo vermelho foi `tipos`, e por execução — o `tsc` foi morto pelo OOM killer (`Killed`, exit 137), com a própria mensagem da ferramenta `falha de execução, NÃO é aprovação`. A máquina está com load ~45 e ~7 GB livres (dezenas de agentes); o diff desta rodada é 1 linha de documentação e nenhum `.ts`/`.tsx`, então a morte do `tsc` não tem relação com a mudança. As guardas efetivamente citadas na recusa rodaram verdes acima.

## Pontos do revisor (refazer 2)
- Ponto 1 (guarda `implicit-any-ratchet.mjs`): não era defeito de código — o `tsc` local não estava instalado e o ratchet abortava por ausência do compilador (`TypeScript local nao encontrado ... falha operacional, nao "zero erros implicitos"`). Depois de `bun install`, o ratchet roda e devolve `implicit-any errors: 0 (baseline: 0)`; nenhum `any` novo entrou no diff.
- Ponto 2 (âncora do `ESTADO.md`): realinhada para `src/hooks/integrations/useKnowledgeBase.ts:126`, a linha do invoke atual de `ai-kb-ingest`; a guarda deno passa `11 passed | 0 failed`. Nesta rodada só `ESTADO.md` foi alterado.

FAIXA DO PAI: commits 28b1ab9c10, a6f9852e89, ae281b5c0a, db6dad3c26, fdb406e05e, 806e819c9d do cartão t_e9d048e9 (refazer 1 deste mesmo trabalho), trazidos por `git cherry-pick 453e6b69f9..d2c568974f` — não são desta rodada. Commit desta rodada: 9e031551e5 (`ESTADO.md`).

## O que NÃO fiz e por quê
- Não versionei captura nem arquivo gerado; nenhuma proveniência de imagem afirmada.
- Não criei projeto/sessão nova do Playwright para a Base de Conhecimento (a rota não tem sessão sintética nem projeto visual; seria outro cartão).
- Não usei cor, token, fonte ou biblioteca nova: só o `destructive`/`text-destructive` que o projeto já define.
