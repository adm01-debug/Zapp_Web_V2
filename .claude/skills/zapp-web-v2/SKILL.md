---
name: zapp-web-v2
description: Convenções de código e commit do Zapp Web V2 (TypeScript, Conventional Commits). Use ao alterar código, criar testes ou escrever mensagem de commit neste repositório; as regras operacionais ficam em AGENTS.md.
---

# Zapp Web V2 — convenções

As regras de trabalho (banco, fluxo Git, PR, comunicação) estão em `AGENTS.md` na raiz — este skill só
resume convenções de código e commit.

## Commits

Padrão Conventional Commits, cobrado pelo hook `commit-msg` (`scripts/ci/commit-msg-lint.mjs`):
`<tipo>(<escopo>): <descrição>` — escopo opcional e minúsculo; assunto com pelo menos 10 caracteres,
sem ponto final; tipos: `feat fix docs style refactor perf test build ci chore security revert`.
Mensagem em PT-BR, modo imperativo, primeira linha curta.

Exemplo: `fix(db): corrige referências residuais ao banco antigo para o oficial`

## Código

- Linguagem: TypeScript (front Vite + React em `src/`, edge functions Deno em `supabase/functions/`).
- Funções `camelCase`, classes/componentes `PascalCase`, constantes `SCREAMING_SNAKE_CASE`.
- Exports nomeados; siga o padrão de import do arquivo vizinho.
- Testes unitários ao lado do módulo (`__tests__/`) ou em `e2e/` (Playwright); rode só o que tocou:
  `npx vitest run <caminho>`.
- Siga os padrões já existentes no módulo; não desvie sem motivo registrado na PR.
