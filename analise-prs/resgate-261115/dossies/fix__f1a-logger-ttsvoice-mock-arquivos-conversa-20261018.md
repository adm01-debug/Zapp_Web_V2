# Dossiê — fix/f1a-logger-ttsvoice-mock-arquivos-conversa-20261018 (PR #2067)

**Veredito: INCORPORADA** · confiança alta · apagar branch: seguro.

## Propósito
Lote F1a (2026-10-18): completar 2 mocks locais no teste
`src/components/inbox/__tests__/arquivos-ver-na-conversa.test.tsx` — `@/lib/logger` e
`@/hooks/communication/useTextToSpeech` (manter `LOCAL_VOICE_ID` via `importOriginal`).
Commits: `8cd0c0b26` (prettier), `d08b8e84c` (fix dos mocks, +5 linhas), `70e03266d` (merge main),
`0fd17f8d1` "resolve conflict — use main version" (2026-10-31).

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/inbox/__tests__/arquivos-ver-na-conversa.test.tsx` | Intenção JÁ está na main | `origin/main` linhas 111-118: `vi.mock('@/hooks/communication/useTextToSpeech', async (importOriginal) => ({ ...(await importOriginal<...>()), useTextToSpeech: () => ({...}), LOCAL_VOICE_ID: 'local' }))`. Entrou pelo commit `a5760922c` (test: integra dia/2026-10-23 na main). Mock de `@/lib/logger` já existia no merge-base (linha 53) e segue na main (linha 54). |
| idem — as 3 "linhas que faltam na main" | RUÍDO: corrupção sintática introduzida pelo commit `0fd17f8d1` | `git diff origin/main <branch>`: branch tem `useTextToSpeech: () => {` (abre `{` e fecha `})` → erro de sintaxe), `waitFor('() => expect(...)` (string não fechada) e `creen.getByRole` (typo). A main tem as versões corretas (linhas 115, 214, 274). Nenhuma delas é trabalho; são bugs que quebrariam o arquivo. |
| idem — linhas que a main tem e a branch não (9) | Main está à frente | `QueryClientProvider`/`queryClient` no Harness e mock de `UnconfirmedMessagesPanel` foram adicionados na main depois do merge-base (commit `d084ca753` / `9727aaedd`); a branch simplesmente é antiga. |

## Lacunas a recuperar
Nenhuma. O único conteúdo exclusivo da branch são 3 linhas sintaticamente inválidas (valor: nenhum).

## Nota
Triagem anterior (2026-11-08) marcou #2067 como OBSOLETA; a classificação correta é INCORPORADA
(mesma intenção, mesmo texto, já na main via `a5760922c`). Efeito prático igual: branch pode ser apagada.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA** · apagar branch continua seguro · nada a recuperar.

Ordem dos commits (`git log --oneline --no-merges bac62ba9..origin/fix/f1a-...`):
`8cd0c0b26` (prettier) → `d08b8e84c` (fix dos mocks) → `70e03266d` (merge main) → `0fd17f8d1`
"resolve conflict — use main version" (removedor de ambos os achados: 46 inserções, 113 deleções no arquivo).

### Achado 1 — `8cd0c0b26`, 62 linhas (mock Proxy do supabase e demais `vi.mock`)
`git show 8cd0c0b26 -- src/components/inbox/__tests__/arquivos-ver-na-conversa.test.tsx`: commit é
`chore(fmt)`, 105 inserções / 40 deleções, **só quebra de linha** (Proxy multi-linha, `storage: {`,
`useResolvedStorageUrl`, `ChatMessagesArea`, botões do `FilesTab`, lista de hooks). Nenhum identificador,
guarda, assertiva ou estado novo. `0fd17f8d1` devolveu exatamente a formatação de uma linha da main.
`git show origin/main:<arquivo>` linhas 34-46 confirmam: o Proxy e todo o conteúdo existem na main, em
formato single-line. Valor do que se perdeu: **nenhum** (formatação).

### Achado 2 — `d08b8e84c`, 1 linha: `createLogger: () => mocks.logStub,`
Foi o conteúdo real do commit (+5 linhas: `createLogger` no mock de `@/lib/logger` e `LOCAL_VOICE_ID: 'local'`
no mock de `useTextToSpeech`, cada um com um comentário). `0fd17f8d1` removeu as duas.
**A intenção das duas sobrevive na main, em versão mais completa:**
- `origin/main:<arquivo>` **linha 62**: `createLogger: vi.fn(() => ({ debug, info, warn, error, withCorrelation: vi.fn(() => ({...})) }))`
  — cobre o `createLogger` que `outbound-message.service.ts` chama e ainda o `withCorrelation`, que o stub
  da branch não tinha.
- `origin/main:<arquivo>` **linhas 111-118**: `vi.mock('@/hooks/communication/useTextToSpeech', async (importOriginal) => ({ ...(await importOriginal<...>()), useTextToSpeech: () => ({...}), LOCAL_VOICE_ID: 'local' }))`
  — mesma constante, com `importOriginal` preservando as reais.
Valor do que se perdeu: **nenhum** (equivalente já na main, mais abrangente).

### Sobre o removedor `0fd17f8d1`
O título promete "use main version", mas o commit **não** reproduziu a main fielmente: introduziu três
corrupções sintáticas, visíveis em `git diff origin/main origin/fix/f1a-... -- <arquivo>`:
`useTextToSpeech: () => {` (abre `{`, fecha `})`), `await waitFor('() => expect(...)` (string não fechada) e
`creen.getByRole` (typo). A main tem as formas corretas nas linhas 114, 208 e 268. Ou seja: o removedor não
reverteu trabalho — ele degradou o arquivo. Esse é o único conteúdo exclusivo da ponta, e apagá-lo é
desejável, não perda.

Nada na branch (nem na ponta, nem nos intermediários) está ausente da main com valor. Classificação da
triagem (INCORPORADA) e a decisão de apagar permanecem.

## Verificação adversarial

Parecer: CONCORDO com a triagem. Veredito final INCORPORADA; apagar a branch é seguro.

Tentei refutar procurando qualquer hunk de valor na ponta que não esteja na main. Não há.

1. Diff completo `bac62ba9..origin/fix/f1a-...` toca **1 arquivo** (`src/components/inbox/__tests__/arquivos-ver-na-conversa.test.tsx`, +7/-4). Nenhum outro arquivo, migration, edge ou workflow.
2. A intenção da branch (mock de `useTextToSpeech` com `importOriginal` + `LOCAL_VOICE_ID`) **já está na main**: `git show origin/main:src/components/inbox/__tests__/arquivos-ver-na-conversa.test.tsx` linhas 111-119 — `vi.mock('@/hooks/communication/useTextToSpeech', async (importOriginal) => ({ ...(await importOriginal<...>()), useTextToSpeech: () => ({...}), LOCAL_VOICE_ID: 'local' }))`, idêntico ao pretendido.
3. Correção de SHA na triagem: quem trouxe isso para a main foi **e1f2ee4dd (2026-10-27, "fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)")**, não `a5760922c` (que é 2026-10-29, "integra dia/2026-10-23"). `git log -S"importOriginal<typeof import('@/hooks/communication/useTextToSpeech')>" origin/main -- <arquivo>`. Erro de atribuição, não de conclusão.
4. O mock de `@/lib/logger` já existia no merge-base: `git show bac62ba9:<arquivo>` linhas 54-62 (log, logger, getLogger, generateCorrelationId, getSessionId, logPerformance, logAsyncPerformance, createLogger) — igual à main (linhas 54-62). Zero delta.
5. As 3 linhas exclusivas da ponta são **corrupção sintática**, não trabalho: `useTextToSpeech: () => {` (abre bloco e devolve literal de objeto), `await waitFor('() => expect(...)` (aspas desbalanceadas) e `creen.getByRole(...)` (identificador truncado). Prova dura: `npx esbuild <ponta>.tsx` → `✘ [ERROR] Expected ";" but found ":"` em 114:24. O arquivo da ponta **não compila**.
6. Pior: `git diff origin/main origin/fix/f1a-...` mostra que a ponta, além da corrupção, **remove** o que a main ganhou depois — o import de `QueryClient/QueryClientProvider`, o wrapper `QueryClientProvider` no `Harness` (necessário para a "Próxima melhor ação" do ChatPanel, P1-8) e o mock de `../chat/UnconfirmedMessagesPanel`. Aplicar a branch seria regressão.
7. A main está verde neste arquivo: `npx vitest run src/components/inbox/__tests__/arquivos-ver-na-conversa.test.tsx` → `Test Files 1 passed (1) · Tests 4 passed (4)` (executado nesta sessão, arquivo local idêntico a `origin/main` por `git diff --quiet origin/main -- <arquivo>`).

Lacunas adicionais: nenhuma. PR 2067 (mesma ponta) pode ser fechada sem resgate.
