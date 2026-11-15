# Dossiê — fix__f1a-lote-b-connectioncard-dialog (PR #2059)

**Ref:** `origin/fix/f1a-lote-b-connectioncard-dialog` · tip `ab04821` · merge-base `9d65fed` (2026-10-18) · 2 commits, 1 arquivo.

## Propósito
No merge-base, `ConnectionCard.tsx` referenciava `handleDisconnectDialogOpenChange` (linha 221) sem defini-la e já declarava `disconnectPending`/`disconnectError` (linhas 70-71) sem usá-los — o arquivo não compilava. A branch:
1. `b9ea69668` — prettier no arquivo inteiro (ruído de formatação, ~250 linhas).
2. `ab0482162` — define `handleDisconnectDialogOpenChange`, reescreve `handleConfirmDisconnect` com `disconnectPending`/`disconnectError` (try/catch, `false` = sessão não caiu), alarga o tipo de `onDisconnect` para `boolean | void | Promise<boolean | void>` e passa `pending={disconnecting || disconnectPending}` + `errorMessage` ao `ConnectionDisconnectDialog`.

## Arquivo × achado × evidência

| Arquivo | Hunk | Achado | Evidência na main |
|---|---|---|---|
| `src/components/connections/ConnectionCard.tsx` | tipo `onDisconnect` | **JÁ NA MAIN** (mesma união, ordem diferente) | `origin/main:...ConnectionCard.tsx:41` `void \| boolean \| Promise<void \| boolean>` |
| idem | `handleDisconnectDialogOpenChange` | **JÁ NA MAIN**, versão mais estrita (trava também com `disconnecting`) | linhas 77-81 |
| idem | `handleConfirmDisconnect` com pending/erro/try-catch | **JÁ NA MAIN** (texto do erro diferente, mesma semântica: `false` ou rejeição mantém o diálogo aberto com motivo) | linhas 83-103 |
| idem | `pending={disconnecting \|\| disconnectPending}` + `errorMessage={disconnectError ?? undefined}` | **JÁ NA MAIN** | linhas 253-254; `ConnectionDisconnectDialog.tsx:34,52-53` aceita e renderiza `errorMessage` em `role="alert"` |
| idem | reformatação prettier (imports multilinha, JSX quebrado, ordem de classes tailwind) | **RUÍDO** — sem efeito funcional; não há check de prettier em `.github/workflows` (`git grep prettier origin/main -- .github/workflows` vazio) | — |

Commit da main que incorporou o fix: `4b9585052` (2026-10-21, PR #2156 "Correções validadas de CI, segurança e integrações") — diff em `ConnectionCard.tsx`: +28/-4, exatamente os quatro hunks funcionais acima.

A main ainda recebeu depois mudanças que a branch não tem (gate `isAdmin` no botão Conectar/QR, `data-testid="connection-card"`, linhas 107, 178-187, 211-214) — por isso o hunk mecânico deu CONFLICT; nada disso é lacuna da branch.

## Veredito
**INCORPORADA** (confiança alta). Nenhuma lacuna a recuperar; as 251 "linhas em lacuna" são formatação prettier. `apagar_branch_seguro = true`.

## Verificação adversarial

Tentei refutar o veredito INCORPORADA procurando qualquer hunk de valor na branch que a main não tenha. Não achei. **Concordo: INCORPORADA, `apagar_branch_seguro = true`.**

**1. Os 4 hunks funcionais (commit `ab0482162`, +44/-6) estão na main, lidos linha por linha em `git show origin/main:src/components/connections/ConnectionCard.tsx`:**

| Hunk da branch | Main |
|---|---|
| tipo `onDisconnect` com `boolean` | linha 41 — `(c: WhatsAppConnection) => void \| boolean \| Promise<void \| boolean>` |
| `handleDisconnectDialogOpenChange` (novo) | linhas 77-81 — existe; trava com `disconnecting \|\| disconnectPending` e limpa `disconnectError` ao fechar |
| `handleConfirmDisconnect` com pending/try-catch/`false` | linhas 83-103 — guarda de reentrada, `setDisconnectPending`, `disconnected === false` → grava erro e não fecha, `catch` usa `error.message`, `finally` libera |
| `pending` + `errorMessage` no diálogo | linhas 253-254 — `pending={disconnecting \|\| disconnectPending}`, `errorMessage={disconnectError ?? undefined}`; `ConnectionDisconnectDialog.tsx:32-34,52-53` aceita e renderiza em `role="alert"` |

A versão da main é **mais estrita**, não mais fraca (bloqueia também abrir/fechar enquanto `disconnecting` externo está em voo; o botão do cartão já é `disabled={disconnecting}`). Textos de erro são diferentes mas o teste casa por regex `/não foi possível desconectar/i`.

**2. As ~250 linhas restantes da lacuna são o commit `b9ea69668` (prettier) e são provadamente só formatação.** Comparação caractere a caractere das duas versões do arquivo, normalizando espaços, vírgulas e literais de string (`difflib.SequenceMatcher`): as **únicas** diferenças são 13 pares de parênteses que o prettier adiciona em volta de JSX e um `{' '}`. O que sobra é reordenação de classes Tailwind (plugin `prettier-plugin-tailwindcss`), sem efeito em runtime. E a formatação não é exigida por nada: `git grep -i 'prettier\|--check' origin/main -- .github/workflows package.json` → prettier só como devDependency (package.json:133-134), nenhuma invocação em workflow; `git grep prettier origin/main -- eslint.config.*` → vazio.

**3. Prova de execução (não só leitura de código):** rodei na árvore atual, cujo `src/components/connections/` é idêntico a `origin/main` (`git diff origin/main --stat -- src/components/connections/` → vazio):
`npx vitest run ConnectionCard.desconectar-erro.test.tsx ConnectionCard.confirmacao.test.tsx ConnectionCard.espera.test.tsx` → **3 arquivos / 18 testes, todos verdes**. Os 5 casos do `t_cce2f0f7` (retorno `false`, rejeição, sucesso fecha, botão travado em voo, reabrir não mostra motivo antigo) passam com o código da main — exatamente o contrato que esta branch existia para fechar.

**4. Incorporação rastreada:** `git log -S'handleDisconnectDialogOpenChange' origin/main -- ConnectionCard.tsx` → `4b9585052` ("Correções validadas de CI, segurança e integrações", PR #2156); `git merge-base --is-ancestor 4b9585052 origin/main` → verdadeiro.

Nenhuma lacuna adicional.
