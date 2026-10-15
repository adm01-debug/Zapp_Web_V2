Especialista: semisenior (area-front-hooks)

## O que mudou e por quê

- `src/lib/__tests__/redactPII.test.ts`: 2 testes novos de `redactPII` (Bearer/key=value), 1 teste de subobjeto aninhado e 1 `it.each` com as 7 chaves sensíveis — provas que faltavam na entrega anterior.
- `src/lib/__tests__/errorReporter.test.ts`: 1 teste novo provando que `message`/`stack` canônicos sobrescrevem chaves do contexto.
- Nenhum arquivo de produção foi alterado: o código trazido já continha os 5 comportamentos exigidos (detalhe por ponto abaixo); o que faltava era a prova, e é isso que este refazer adiciona.

## FAIXA DO PAI

- O commit `6c1e0657` citado no cartão não existe no repositório (`git cat-file -t 6c1e0657` → `fatal: Not a valid object name`); o trabalho anterior real é `7884696d6a feat(pii): redige e-mail, telefone BR e segredos em erros e logs` da branch `v2/erros-pii-redact-2610130355d5e5`, trazido com `git cherry-pick 7884696d6a` (commit `7958b2412d` neste histórico).
- O workspace adotado por este chat continha 3 commits de OUTRO cartão (hooks: `c26b6dfa1b`, `c5778fc4d4`, `a310ec4af5`); foram neutralizados com revert aditivo (`0ab5bcdb8e`), sem reescrever história alheia. `git diff 96dd72dc5f...HEAD --name-only -- src/hooks` volta vazio: zero difusão de outro cartão.

## Prova

- Verde depois: `node_modules/.bin/vitest run src/lib/__tests__/redactPII.test.ts src/lib/__tests__/errorReporter.test.ts src/lib/__tests__/logger.test.ts` → `Test Files 3 passed (3)` / `Tests 38 passed (38)` (27 pré-existentes + 11 novos).
- Vermelho antes: cada teste novo foi rodado contra mutação que reintroduz o defeito recusado (detalhe por ponto abaixo); todos falharam sem a correção e passaram com ela. Mutações revertidas com `git checkout -- <arquivo>`; `git status --short src/` ao fim mostra só os 2 arquivos de teste.
- `node_modules/.bin/tsc -b --force` → saída vazia, exit 0.
- `node_modules/.bin/eslint` nos 2 testes + 3 arquivos de produção → saída vazia, exit 0.

## Pontos do revisor

- Ponto 1: comportamento já presente em `src/lib/redactPII.ts:42` (`bearer` na alternação da `KEY_VALUE_RE`); faltava a prova — adicionado `mascara Authorization: Bearer <jwt> inteiro` + `mascara bearer=/token=/api-key:` em `src/lib/__tests__/redactPII.test.ts`. Vermelho (mutação: `|bearer` removido): `FAIL mascara bearer=/token=/api-key:` / `AssertionError: expected 'query ?bearer=abcdef1234567890 fim' not to contain 'abcdef1234567890'`. Verde: passa com o código trazido.
- Ponto 2: comportamento já presente em `src/lib/redactPII.ts:86` (`Object.entries(value as Record<string, unknown>)` com recursão); faltava o teste de subobjeto — adicionado `redige subobjeto { user: { email, password } }` em `src/lib/__tests__/redactPII.test.ts`. Vermelho (mutação: sem recursão, `: val`): `FAIL redige subobjeto { user: { email, password } } (ponto 2 da recusa)` / `AssertionError: expected 'maria.souza@example.com' to be '[EMAIL_REDACTED]'`. Verde: passa com o código trazido.
- Ponto 3: comportamento já presente em `src/lib/errorReporter.ts:76-78` (`...context` antes dos canônicos); faltava o teste de sobrescrita — adicionado `campos canônicos sobrescrevem message/stack vindos no contexto` em `src/lib/__tests__/errorReporter.test.ts`. Vermelho (mutação: `...context` depois): `FAIL campos canônicos sobrescrevem message/stack vindos no contexto (ponto 3 da recusa)` / `AssertionError: expected 'texto do chamador' to be 'falha real do runtime'`. Verde: passa com o código trazido.
- Ponto 4: comportamento já presente em `src/lib/logger.ts:49` (`${redactPII(message)}` no `formatMessage`) e teste já presente (`redige PII e segredo antes de imprimir no console` em `src/lib/__tests__/logger.test.ts`, vindo na entrega anterior). Vermelho (mutação: `${message}` sem redact): `FAIL logger > redige PII e segredo antes de imprimir no console` / `AssertionError: expected '[2026-10-15T01:28:39.173Z] [ERROR] [A…' not to contain 'maria.souza@example.com'`. Verde: passa com o código trazido. Nenhuma mudança necessária neste ponto.
- Ponto 5: comportamento já presente em `src/lib/redactPII.ts:13-28` (`SENSITIVE_KEYS` com as 7 chaves: `password`, `secret`, `token`, `api_key`, `authorization`, `cookie`, `senha`); faltava o teste por chave — adicionado `it.each` das 7 chaves em `src/lib/__tests__/redactPII.test.ts`. Vermelho (mutação: `'cookie'` removido do Set): `Test Files 1 failed (1)` / `Tests 1 failed | 18 skipped (19)` no caso `cookie`. Verde: os 7 casos passam com o código trazido.

## O que NÃO fiz e por quê

- Não alterei código de produção: as 5 mutações de prova confirmam que cada teste guarda o comportamento exigido, e o código trazido já o implementa. Mudar regex/ordem/set "por garantia" seria comportamento a mais fora da recusa.
- Não corrigi `Authorization: Basic <credencial-curta>`: `redactPII('Authorization: Basic dXNlcjpwYXNz')` devolve `Authorization: [SEGREDO_REDACTED] dXNlcjpwYXNz` (a credencial curta sobrevive; só JWT ≥40 chars cai no `LONG_SECRET_RE`). Fora dos 5 pontos da recusa; registrado como achado em `kanban_comment`, sem correção neste commit.
- Não toquei em hooks, telas, Edge, SQL, CI ou manifestos. Segunda passada anti-defeito-novo: só testes adicionados; nenhum chamador de produção muda de comportamento.

## Arquivos (`git diff --name-only 96dd72dc5f...HEAD`)

- .tmp/relato.md
- src/lib/__tests__/errorReporter.test.ts
- src/lib/__tests__/logger.test.ts
- src/lib/__tests__/redactPII.test.ts
- src/lib/errorReporter.ts
- src/lib/logger.ts
- src/lib/redactPII.ts
