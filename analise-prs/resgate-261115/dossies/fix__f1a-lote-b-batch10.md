# Dossiê — fix__f1a-lote-b-batch10 (branch `origin/fix/f1a-lote-b-batch10`, PRs #2087 e #2435)

- merge_base `bac62ba98`, tip `56187bdae` (2026-10-23), 3 commits:
  - `eccf52dde chore(fmt): prettier em GmailInboxView.paginacao.test.tsx (F1a lote B)`
  - `a7cf28b9d fix(test): mock de supabase.rpc ausente ao buscar em GmailInboxView.paginacao (lote F1a)`
  - `56187bdae Merge branch 'main' into fix/f1a-lote-b-batch10`
- Único arquivo tocado: `src/components/gmail/__tests__/GmailInboxView.paginacao.test.tsx` (+166/−44).

## Propósito
Destravar o teste de paginação da tela antiga de Gmail: toda busca chama a RPC `search_email_threads` (PE-09) e, sem `supabase.rpc` mockado, a busca lançava. Correção funcional = 1 linha (`vi.mocked(supabase.rpc).mockResolvedValue(...)` no `setup()`). O resto do diff (≈95%) é só reformatação Prettier (quebra de linha, `(entry) =>`), sem mudança semântica.

## Arquivo × achado × evidência

| Hunk | Natureza | Está na main? | Evidência |
|---|---|---|---|
| `setup()`: `vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)` + comentário PE-09 | fix funcional (único) | **SIM**, texto equivalente | `origin/main:src/components/gmail/__tests__/GmailInboxView.paginacao.test.tsx:123-124` — `// PE-09: a busca consulta a RPC search_email_threads (corpo/anexo); aqui ela não casa nada.` / `vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);`. Entrou pelo commit `e1f2ee4dd 2026-10-27 fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)` (`git log -S'vi.mocked(supabase.rpc).mockResolvedValue' origin/main -- <arquivo>`). Diferença: cast `as never` (branch) vs `as unknown as Awaited<...>` (main) — mesmo efeito. |
| Todos os demais hunks (mocks `vi.mock(...)` multilinha, `MOCK_ACCOUNT`, `makeThread`, `makeRecordingChain`, `(entry) =>`, `waitFor(() =>\n ...)`) | formatação Prettier | NÃO (main mantém a versão de uma linha) | `line_check.missing_in_main=132` / `removed_still_in_main=44` são exatamente estas linhas. Prettier **não é gate**: nenhum workflow em `.github/workflows` cita prettier (`git grep -iE prettier origin/main -- .github/workflows` vazio); `.husky/pre-commit` roda só `lint-ratchet.mjs --staged`; `package.json` não tem script `format`/`format:check`. Valor para o negócio: nenhum. |
| mock `framer-motion` | branch mantém versão antiga (`vi.mock('framer-motion', () => ({...}))`) | main tem versão **mais nova** | `origin/main:...:34-42` usa `importOriginal` + `useReducedMotion` (commit `a5760922c 2026-10-29 test: integra dia/2026-10-23 na main (mocks framer-motion p/ Vitest 4)`). Aplicar a branch regrediria este mock. |

## Veredito
**INCORPORADA** (confiança alta). A única mudança com conteúdo (mock de `supabase.rpc`) já está na main desde `e1f2ee4dd`; o restante é reformatação sem efeito, não exigida por nenhum gate do repo, e a main já evoluiu o arquivo além da branch (mock framer-motion para Vitest 4). Triagem 2804 classificou #2087/#2435 como OBSOLETA — na prática o fix entrou por outro commit, logo INCORPORADA é mais preciso; conclusão operacional igual.

Não verificado: execução do vitest neste clone (`node_modules` ausente; `npx vitest` falhou com EOVERRIDE do npm). O CI Gate da main em `e1f2ee4dd` cita "136 → 0 arquivos vermelhos", mas isso é afirmação do commit, não prova direta.

## Lacunas a recuperar
Nenhuma. `apagar_branch_seguro = true`.

## Verificação adversarial

Papel: refutar o veredito INCORPORADA. **Não encontrei nada a refutar — concordo.**

Método: em vez de confiar no `line_check` (que conta linhas cruas e por isso infla 132 "faltantes"
que são só quebra de linha do Prettier), extraí os dois arquivos completos e comparei ignorando
espaço em branco:

```
git show origin/fix/f1a-lote-b-batch10:src/.../GmailInboxView.paginacao.test.tsx > branch.tsx
git show origin/main:src/.../GmailInboxView.paginacao.test.tsx                   > main.tsx
git diff --no-index -w --ignore-blank-lines main.tsx branch.tsx
```

Resultado: branch 319 linhas, main 204 linhas; `git diff --name-only bac62ba98 origin/fix/f1a-lote-b-batch10`
confirma **1 único arquivo**. Com `-w`, sobram exatamente **duas** diferenças de conteúdo em todo o diff:

1. **Mock de `supabase.rpc`** — já na main. `main.tsx:123-124` tem
   `// PE-09: a busca consulta a RPC search_email_threads (corpo/anexo); aqui ela não casa nada.` +
   `vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as unknown as Awaited<ReturnType<typeof supabase.rpc>>);`
   A branch tem a mesma chamada com cast `as never` e um comentário de 3 linhas em vez de 1.
   Efeito em runtime: idêntico (ambos resolvem `{data:[],error:null}`); o cast só silencia o TS.
   `git log -S'vi.mocked(supabase.rpc).mockResolvedValue' origin/main -- <arquivo>` → `e1f2ee4dd`
   ("destrava o CI Gate da main"), confirmado.
   Única coisa que a branch tem e a main não: as 2 linhas extras de comentário explicando que a RPC
   roda *antes* do `.or()` e paginada por cursor. Valor = baixo (comentário, não código; a main já
   documenta o mesmo ponto em 1 linha). Não chega a lacuna de valor médio.

2. **Mock de `framer-motion`** — a main está **à frente**, não atrás. `main.tsx:34-42` usa
   `vi.mock('framer-motion', async (importOriginal) => { const actual = await importOriginal<...>(); return { ...actual, AnimatePresence, motion, useReducedMotion: vi.fn(() => null) }; })`
   (commit `a5760922c` 2026-10-29, "mocks framer-motion p/ Vitest 4", confirmado por
   `git log -S'useReducedMotion' origin/main -- <arquivo>`). A branch tem a forma antiga,
   objeto literal sem `importOriginal` e sem `useReducedMotion`. **Aplicar esta branch regrediria
   o mock e voltaria a quebrar o teste no Vitest 4.** Isso é argumento *a favor* de apagar, não contra.

Checagens de refutação que falharam (ou seja, nada apareceu):
- Nenhum `it(` novo: 5 testes na main, 5 na branch (`grep -c "  it("`). Nenhuma asserção nova,
  nenhum cenário novo, nenhum `expect` que a main não tenha.
- Todo o resto do diff (`MOCK_ACCOUNT`, `makeThread`, `makeRecordingChain`, `(entry) =>`,
  `waitFor(() =>\n…)`, `setup()`, `renderView`) desaparece sob `-w`: é 100% Prettier.
- Prettier não é gate, reconfirmado: `git grep -il prettier origin/main -- .github/workflows` vazio;
  `package.json` tem a dependência `prettier ^3.9.10` mas **nenhum** script `format`/`format:check`;
  `.husky/pre-commit` roda só `lint-ratchet.mjs --staged` (+ manifesto de edges). Logo a reformatação
  não destrava nem trava nada.

Conclusão: `apagar_branch_seguro = true` mantido. O rótulo INCORPORADA é mais preciso que o
OBSOLETA da triagem 2804 (o fix entrou por `e1f2ee4dd`, não por uma substituição), e a conclusão
operacional é a mesma. Único resíduo descartável: 2 linhas de comentário explicativo.

Não verificado (igual à triagem): execução real do vitest neste clone — `node_modules` ausente.
