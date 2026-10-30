# Referência inicial da consolidação

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
