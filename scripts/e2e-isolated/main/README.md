# Main loader do Edge Runtime isolado

`index.ts` e `memory-pressure.ts` vêm de [supabase/supabase@4a9b2b6860805d11b76b59ff29b8803925f2ec38](https://github.com/supabase/supabase/tree/4a9b2b6860805d11b76b59ff29b8803925f2ec38/docker/volumes/functions/main), sob Apache-2.0. A licença original está em `LICENSE.supabase`.

| Arquivo oficial | Git blob de origem | Adaptação local |
| --- | --- | --- |
| `index.ts` | `cd8cd445a3893c6a3cba5716c8702599f3d58fe0` | JOSE 6.2.15, registro por função, paths isolados e bundle ESZIP verificado |
| `memory-pressure.ts` | `ceb1149b731d55a68bdac194cbd6a51dd7e71f0a` | Cópia integral, sem alteração |
| `LICENSE` | `49ea124025275674563eeff03af0f653ca49fdc0` | Cópia integral como `LICENSE.supabase` |

O controlador gera `/run/zapp-e2e/functions.json` com `{"functions":{"nome":{"verify_jwt":false,"bundle_sha256":"64 caracteres hexadecimais"}}}`. O registro, o código em `/work/supabase/functions/` e os bundles em `/bundles/` devem ser montados somente para leitura. O registro inválido impede a inicialização; nomes fora do registro retornam 404. Cada requisição confere o SHA-256 dos bytes de `/bundles/<nome>.eszip` antes de passá-los a `EdgeRuntime.userWorkers.create` com `allowRemoteModules: false`, sem import map comum ou fallback de download. Hash correto não substitui a validação do ESZIP pelo runtime.

O proxy remove `/functions/v1/` antes do encaminhamento. `verify_jwt` vem da configuração de cada função; a exceção de OPTIONS, a verificação JWT, os códigos de erro, os limites de worker e as três tentativas adicionais para worker aposentado preservam o loader oficial. Os ambientes de cada worker vêm do contêiner; o controlador deve fornecer somente as variáveis locais necessárias. O main e os handlers devem ser empacotados previamente pela mesma versão fixada do Edge Runtime.

Execute `node --test scripts/ci/e2e-isolated-loader.unit.mjs` com Node 24. A suíte executa este `index.ts`, após remover apenas os imports fornecidos por doubles e as declarações de export, em 47 cenários de registro, rotas, política JWT, integridade e erros/repetição; há mais uma trava estrutural de dependência fixada. SHA-256, Request e Response são reais. Deno, JOSE e workers são doubles: a suíte não executa handlers, criptografia JWT, ESZIP, banco, contêiner ou rede. A execução nativa continua obrigatória no workflow isolado.
