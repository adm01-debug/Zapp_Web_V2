Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- `src/__tests__/a11y/scan-icon-buttons.ts`: varredura (parser do TypeScript, `ts.createSourceFile` + AST) que acha botão de ícone sem nome acessível — `<IconButton>` e `<Button size="icon*">` (literal, `size={'icon'}` ou condicional com literal `icon`) sem `aria-label`/`aria-labelledby`/`title` não vazios e sem filho com `sr-only`. Funções `scanSource` (casos isolados) e `scanProject` (`src/**/*.tsx`), chave estável por arquivo+assinatura da tag de abertura.
- `src/__tests__/a11y/icon-button-names.test.ts`: casos sintéticos que CHAMAM a varredura; e o teste de linha de base sobre `src/**` real.
- `src/__tests__/a11y/icon-buttons-baseline.json`: linha de base das ocorrências já existentes (dado para a correção do UK-13b).

## Prova
- vermelho antes (novo botão sem nome): arquivo temporário `src/components/__a11y-mutacao.tsx` com `<Button size="icon" onClick={() => {}}>` → `npx vitest run src/__tests__/a11y/icon-button-names.test.ts -t "linha de base bate"` → `FAIL ... AssertionError: expected [ Array(1) ] to deeply equal []` / `surgiu botão de ícone SEM nome (arquivo src/components/__a11y-mutacao.tsx:6)`; arquivo temporário removido depois.
- vermelho antes (entrada já corrigida): adicionei `aria-label="Atualizar dados"` ao `<Button ... size="icon" ...>` de `src/components/admin/AIUsageDashboard.tsx` → mesmo comando → `FAIL ... linha de base com entrada já corrigida (remova da baseline)`; mudança desfeita.
- verde depois: `npx vitest run src/__tests__/a11y/icon-button-names.test.ts` → `Test Files 1 passed (1); Tests 19 passed (19)`.

## Notas para a correção (UK-13b)
- A varredura achou 46 botões de ícone sem nome, em 32 arquivos, todos `<Button size="icon">` (nenhum `<IconButton>`). Cruzamento independente por grep: das 195 linhas `<Button ... size="icon` em `src/**/*.tsx`, 149 têm nome acessível e 46 não — bate com as 46 da varredura.
- A tag de abertura (atributos) é a chave da linha de base: ao corrigir um botão, o teste fica vermelho até a entrada sair do JSON; a linha de base só encolhe (teto fixo 46).

## O que NÃO fiz e por quê
- Não corrigi nenhum dos 46 botões de produção (só a varredura + linha de base) — a correção é o cartão UK-13b.
- Não mexi em `src/test/setup.ts`, no `vitest.config.ts` nem em teste existente.
