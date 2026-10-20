# Dívida de lint — mapa e plano de fatias

**Data:** 29/09/2026 · **Base:** `main` com os PRs #1213, #1218, #1222, #1224 e #1227
merged · **Medição:** `bun run lint` (cru, sem `--fix`) no workspace da tarefa

```
955 problems (657 errors, 298 warnings)
```

O `lint-ratchet` (`scripts/ci/lint-ratchet.mjs`) mantém o **baseline em 971** e recusa
qualquer PR que **aumente** a dívida; ele também conta as **removidas**. Regra da casa: o
baseline só sobe com aprovação explícita — descer é sempre bem-vindo.

## Onde está a dívida (por regra, medido)

| # | Regra | Ocorrências | Natureza |
|---|---|---|---|
| 1 | `@typescript-eslint/no-explicit-any` | 335 | refactor real (tipar de verdade) |
| 2 | `no-restricted-imports` | 133 | regra arquitetural (imports proibidos) |
| 3 | `react-refresh/only-export-components` | 98 | mecânica por arquivo (extrair export não-componente) |
| 4 | `react-hooks/set-state-in-effect` | 91 | refactor real (fluxo de estado) |
| 5 | `react-hooks/refs` | 88 | refactor real (leitura de `ref` no render) |
| 6 | `@typescript-eslint/ban-ts-comment` | 58 | política de supressão |
| 7 | `no-console` | 35 | **precisa de decisão** (ver abaixo) |
| 8 | `react-hooks/exhaustive-deps` | 30 | refactor real (deps de efeito) |
| 9 | `no-constant-condition` | 28 | revisar caso a caso |
| 10 | `react-hooks/purity` | 18 | refactor real |
| 11 | `@typescript-eslint/no-unsafe-function-type` | 13 | tipar de verdade |
| 12 | `react-hooks/preserve-manual-memoization` | 6 | refactor real |
| 13 | `@typescript-eslint/no-unused-expressions` | 5 | mecânica (segura) |
| 14 | `react-hooks/use-memo` | 3 | mecânica (segura) |
| 15 | `react-hooks/incompatible-library` | 2 | revisar |

## Fatias propostas (uma PR cada, ordem por risco crescente)

- **F1 — mecânicas seguras (10 problemas):** `no-unused-expressions` (5), `use-memo` (3),
  `incompatible-library` (2). Sem mudança de comportamento; a suíte é a rede.
- **F2 — `react-refresh/only-export-components` (98):** extrair export que não é
  componente para módulo irmão, arquivo por arquivo, com teste do arquivo tocado.
  Mantém HMR honesto e o Vite deixa de recarregar a árvore inteira.
- **F3 — `react-hooks/*` (179 no total):** `set-state-in-effect` (91), `refs` (88),
  `exhaustive-deps` (30), `purity` (18), `preserve-manual-memoization` (6). Cada caso é
  decisão de fluxo — fatia por diretório (`inbox`, `settings`, `calls`, …), começando pelos
  hooks com teste.
- **F4 — `no-explicit-any` (335) + `no-unsafe-function-type` (13):** tipar por domínio
  (tipos do Supabase, payloads de realtime, retornos de edge). A maior fatia e a mais lenta.
- **F5 — `no-restricted-imports` (133):** entender a intenção de cada restrição no
  `eslint.config.js` e substituir pelo caminho permitido (não é "remover a regra").
- **F6 — `no-constant-condition` (28) + `ban-ts-comment` (58):** revisar caso a caso
  (`@ts-ignore` → `@ts-expect-error` **quebra o build** quando não há erro para esperar).

## Duas decisões que são do Joaquim (não mexi)

1. **`no-console` (35) — escopo, não código.** A regra bane `console.log/info/debug` e
   permite `warn/error`. Os infratores são só **4 arquivos**, e todos usam console **por
   design**:
   - `src/lib/logger.ts` (linhas 59, 64, 118, 130) — **é o logger**; ele é o único lugar do
     front que deve falar com o `console`;
   - `supabase/functions/evolution-webhook/index.ts` e `_shared/{validation,hmac-validation}.ts`
     — **edge functions (Deno)**, onde `console.log` é o log padrão da plataforma.
   Proposta: no `eslint.config.js`, manter `no-console` ligado em `src/**` e desligá-lo
   apenas para `src/lib/logger.ts` e `supabase/functions/**` (com comentário do porquê).
   Mexe em arquivo de gate → **só com o seu OK**.
2. **`ban-ts-comment` (58).** Converter `@ts-ignore` em `@ts-expect-error` é o padrão, mas
   quebra quando não existe erro para esperar. Proposta: converter em fatia, rodando
   `typecheck` em cada arquivo tocado — ou manter e documentar a exceção.

## Como medir cada fatia

```bash
bun run lint                                   # total cru
node scripts/ci/lint-ratchet.mjs               # novas / mantidas / removidas
node scripts/ci/lint-ratchet.mjs --update-baseline   # só com aprovação, para BAIXAR
```

Fatias menores são mais fáceis de revisar e de reverter — o objetivo é a dívida **cair a
cada merge**, nunca subir.
