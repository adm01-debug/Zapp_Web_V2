# Baseline da consolidação

## Medição atual — 01/11/2026

Executada em **01/11/2026, 09:40–09:51 (America/Sao_Paulo)** no SHA `df4d597dcbaa6fbdb4eb4c8ee672e39e1f2d2a05`, confirmado como `origin/main` antes e depois da execução. A medição foi feita em uma worktree limpa (`zapp-worktrees/mission-baseline-20261101`), com Bun `1.4.0`, Node `v24.19.0` e `bun install` concluído (645 pacotes). A árvore de trabalho permaneceu limpa após as verificações.

| Verificação | Comando | Resultado atual |
|---|---|---|
| Build | `bun run build` | Passou; **0 erros**, 2 avisos de classes Tailwind ambíguas e aviso de chunks maiores que 1.200 kB. |
| Lint | `bun run lint` | **606 erros e 213 avisos**; exit code 1. O total de erros é 3 acima da medição de 28/10; a origem da diferença ainda não foi atribuída. |
| Typecheck | `bun run typecheck` | **3 erros TypeScript**; exit code 2: atributo JSX duplicado em `QueueAlertsDisplay.tsx:94` e duas propriedades `tags` incompatíveis nos testes `useInboxFilters.type-url.test.tsx:123–124`. |
| Testes unitários | `bun run test` | **15.683 passaram**, 0 falharam, 19 falhas esperadas e 43 `todo`; 1.856 arquivos passaram e 5 foram pulados. Exit code 0; duração 533,57 s. |

Em relação à referência inicial de 28/10 abaixo: **+121 testes passando**, uma falha esperada a menos e **19 erros TypeScript a menos**; o lint tem três erros a mais e o mesmo total de avisos. Esses resultados são a nova referência para comparar alterações seguintes. Os logs completos estão em `/tmp/baseline-build.log`, `/tmp/baseline-lint.log`, `/tmp/baseline-typecheck.log` e `/tmp/baseline-test.log` nesta máquina; os exit codes foram `0`, `1`, `2` e `0`.

---

## Referência inicial — 28/10/2026

Medição concluída em **28/10/2026, 09:00 (America/Sao_Paulo)**, a partir da `main` do GitHub no commit `653f3d3304eec342a4360fd14d1b0c1d45d1f202`.

O clone principal tinha 215 entradas no `git status --porcelain` antes da medição. Para preservá-las, os comandos foram executados na árvore de trabalho limpa `zapp-worktrees/consolidacao-baseline-20261028`, criada diretamente de `origin/main`. As dependências foram instaladas com `bun install --frozen-lockfile`; a árvore permaneceu sem alterações após os comandos.

| Verificação | Comando | Resultado inicial |
|---|---|---|
| Build | `bun run build` | Passou; 0 erros. Há avisos sobre classes Tailwind ambíguas e tamanho de alguns arquivos gerados. |
| Lint | `bun run lint` | Falhou; **603 erros e 213 avisos** (816 ocorrências). |
| Typecheck | `bun run typecheck` | Falhou; **22 erros TypeScript**. |
| Testes unitários | `bun run test` | **15.562 passaram**, 0 falharam como asserção, 20 falhas esperadas, 43 `todo`; 1.839 arquivos passaram e 5 foram pulados. O comando saiu com erro por **1 exceção não tratada** após um teste, portanto a suíte completa não está verde. |

A exceção dos testes é `ReferenceError: document is not defined` em um `setTimeout` de `@hello-pangea/dnd`, associado pelo Vitest a `src/components/tasks/__tests__/TasksBoardMode.a11y.test.tsx`. Esta medição não prova estabilidade entre execuções; as comparações futuras devem preservar pelo menos **15.562 testes passando**, sem novos erros ou falhas.

Os logs completos desta execução estão em `/tmp/baseline-build.log`, `/tmp/baseline-lint.log`, `/tmp/baseline-typecheck.log` e `/tmp/baseline-test.log` nesta máquina. Os respectivos códigos de saída foram `0`, `1`, `2` e `1`.
