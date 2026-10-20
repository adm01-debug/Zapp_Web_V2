# Probes offline da reauditoria Inbox

## Execução

Requer Node **24.19.0** (versão usada nesta rodada), Git e o checkout da fonte auditada. Não exige React, Vitest, TypeScript instalado, serviços ou credenciais: o parser TypeScript é `node:module.stripTypeScriptTypes`, nativo do Node usado.

```bash
node --disable-warning=ExperimentalWarning run.mjs --source /caminho/para/checkout
```

Também aceita `SOURCE` ou `INBOX_SOURCE_ROOT`. O destino opcional é `--out /caminho/results.json` ou `INBOX_RESULTS_PATH`; pins opcionais são `--pins /caminho/pins.json` ou `INBOX_SOURCE_PINS`. O padrão de source é relativo ao runner, em `../../../source`, mantendo o pacote portátil dentro da estrutura `reaudit`.

Não existe dependência `TS` externa: as versões de Node/runner/pins são registradas para tornar explícita a implementação do parser utilizada.

## Proveniência antes da execução

`pins.json` foi derivado de `reaudit/source-integrity.json`, depois de verificar que cada hash carregado na primeira execução coincidia com `git_blob_sha` e `observed_git_blob_sha`. A derivação registra também SHA-256 do manifesto de integridade.

Antes de avaliar qualquer hook/callback da aplicação, `run.mjs`:

1. Lê HEAD com `git rev-parse HEAD` e exige igualdade com o SHA auditado nos pins.
2. Lê **todos os 20 arquivos fixados**, calcula hash Git de blob e recusa qualquer divergência.
3. Mantém em memória exatamente os buffers verificados; a execução usa esses buffers, não uma segunda leitura suscetível a troca.
4. Recusa fonte não listada nos pins.
5. Registra HEAD observado, hashes das fontes utilizadas, SHA-256 dos pins e do runner, versão do Node e método.

`verify-provenance.py` fornece dois controles negativos. Ele cria somente uma cópia temporária dentro da pasta de probes: arquivo alterado com HEAD correto e HEAD esperado incorreto. Ambos devem ser rejeitados antes da execução, sem gerar resultado. O checkout original não é modificado. A referência Git da cópia temporária é usada apenas por `rev-parse`, sem checkout/commit ou outra mutação de Git.

```bash
SOURCE=/caminho/para/checkout python verify-provenance.py
```

O resultado dessa verificação está em `provenance-checks.json`.

## Método e limites

As 20 probes usam as funções reais da fonte. Para arquivos `.ts`, as declarações de import são removidas após a retirada dos tipos e as dependências são injetadas em um contexto VM. Para callbacks dentro de `.tsx`, o runner extrai o corpo exato por marcadores antes de retirar os tipos; não há reprodução manual do algoritmo sob teste.

React é substituído por um harness mínimo de estado, memo, refs, effects e closures. Serviços, relógios, MediaRecorder e respostas de persistência são simulados. A ordem de propagação de teclado nas duas probes pertinentes é modelada explicitamente. Os cenários verificam contratos, dados transmitidos e ordem de operações.

Isto **não** equivale a montar React DOM, executar o banco/RLS, testar rede/provider, gravar microfone, medir navegador físico nem executar a suíte Vitest original. Cada observação tem a precondição descrita em `results.json` e no relatório principal. Não são afirmadas incidência produtiva ou compatibilidade geral de browser a partir desse harness.

Todos os domínios/IDs/nomes usados nas fixtures são fictícios. Nenhum comando contata rede, banco ou serviço.
