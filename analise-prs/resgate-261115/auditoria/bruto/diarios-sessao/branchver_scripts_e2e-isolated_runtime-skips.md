# Exceções de plataforma na suíte autenticada

`results.mjs` preserva o comportamento padrão usado pelo bootstrap. Uma opção
específica permite classificar duas exceções já existentes no teste de fechamento
de conversa, mantendo-as separadas dos testes aprovados. A opção só é válida no
escopo `authenticated-suite` e não aceita uma lista livre de exceções.

```js
const summary = summarizePlaywrightResult(report, {
  scope: 'authenticated-suite',
  expectedProjects,
  inventory,
  conversationPlatformSkips: {
    sourceSha,
    sourceBlobs: {
      'e2e/conversation.spec.ts': conversationSourceBlob,
    },
  },
});
```

O controlador deve obter `sourceSha` do checkout executado e calcular
`conversationSourceBlob` a partir dos bytes desse arquivo, usando o formato de
blob Git: SHA-1 de `blob <tamanho em bytes>\0` seguido do conteúdo. Esses valores
não vêm do JSON do reporter. `inventory` vem da coleta separada com
`playwright test --list`, lida por `readPlaywrightInventory`.

## Contrato fixo

| Vínculo | Valor revisado |
|---|---|
| Arquivo no checkout | `e2e/conversation.spec.ts` |
| Blob Git | `96a821d6c8389d526a9a5d65554687412510a92a` |
| Arquivo no reporter isolado | `conversation.spec.ts` |
| Suítes do reporter | `conversation.spec.ts` → `Conversation state transitions` |
| Teste | `resolving conversation via CloseConversationDialog succeeds` |
| Linha | `59` |
| Projetos com exceção | `firefox-conversation`, `webkit-conversation` |
| Cobertura equivalente exigida | O mesmo caso em `chromium-e2e-core`, efetivamente aprovado |

O motivo exato da anotação `skip` é:

> CloseConversationDialog coberto em Chromium; Radix Select portal nao responde a getByRole('option') de forma confiavel em Firefox/WebKit no CI

O contrato exige os três casos na coleta separada, sem expectativa ou anotação
prévia de skip, fixme ou falha. A chave completa inclui projeto, arquivo, linha,
coluna, caminho das suítes e título. A coluna é a emitida pelo inventário nativo;
não se presume um valor com base na indentação do arquivo.

Para classificar `known_runtime_skip`, o caso precisa ter uma única tentativa,
`retry: 0`, um worker válido, status e expectativa de skip, sem erro. TestCase e
TestResult precisam conter exatamente uma anotação `skip` com o motivo acima.
Anotações informativas adicionais são permitidas quando os multiconjuntos de
tipo e descrição coincidem; a ordem não importa. `fixme`, `fail`, motivos
diferentes ou duplicação de `skip` invalidam a exceção.

Qualquer outro skip, inclusive um skip pré-coletado por fixture ausente, reprova
esse escopo. Ausência de autenticação, RPC, seed ou serviço não recebe exceção.
Mudança no arquivo-fonte invalida o blob e exige revisão explícita da política.
Um novo SHA do checkout pode conservar o mesmo blob revisado.

## Resultado e evidência

Com a opção, o resumo acrescenta `counts.known_runtime_skip` e, se o contrato for
válido, `runtimeSkipContract` com SHA do checkout, caminho e blob revisado. Os
casos recebem o outcome `known_runtime_skip`. Eles não aumentam `passed` nem
`executed`, e a presença de qualquer um deles mantém `allPassed: false`.
`ok: true` significa que as regras do contrato foram atendidas; não significa
que os dois testes de plataforma executaram suas asserções até o fim.

Os motivos, títulos, corpos de erro, anotações e saídas dos testes não são
copiados para o resumo público. Sem a opção nova, as chaves e a semântica do
resumo e do inventário permanecem as mesmas do parser de bootstrap.

```sh
node --test scripts/ci/e2e-isolated-results.unit.mjs
```

Os controles do parser usam fixtures do protocolo documentado. Não constituem
execução de navegador nem coleta nativa da suíte completa. A primeira execução
isolada deve conferir o inventário e os resultados reais; se a representação não
corresponder à identidade revisada, o parser falha em vez de normalizar ou
aceitar outros caminhos.

O formato foi conferido nas fontes oficiais de Playwright 1.64.1:

- [Reporter JSON](https://github.com/microsoft/playwright/blob/v1.64.1/packages/playwright/src/reporters/json.ts): arquivo relativo a `config.rootDir` e anotações do caso e da tentativa.
- [Carregamento de testes](https://github.com/microsoft/playwright/blob/v1.64.1/packages/playwright/src/common/testLoader.ts): título da suíte de arquivo relativo à mesma raiz.
- [TestCase](https://playwright.dev/docs/api/class-testcase), [TestResult](https://playwright.dev/docs/api/class-testresult) e [test.skip](https://playwright.dev/docs/api/class-test#test-skip): expectativa, resultado, anotações de runtime e tentativa não executada.
