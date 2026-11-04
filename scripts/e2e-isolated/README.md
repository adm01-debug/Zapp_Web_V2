# E2E em ambiente descartável

Esta automação prepara o substituto isolado do E2E autenticado. Não usa credenciais de produção. A preparação de imagens é uma etapa separada: seu sucesso não significa que banco, login ou suíte foram executados.

## Resolver imagens antes de criar o ambiente

    node scripts/e2e-isolated/resolve-images.mjs /tmp/e2e-isolated-images/report.json

O resolver usa somente o Docker local em unix:///var/run/docker.sock. Lê o arquivo images.lock.json, aceita referências com versão explícita e recusa latest. Para imagens ainda sem digest, executa pull e inspect, registra exatamente um digest da mesma origem e propõe a referência imutável.

O comando não cria contêiner, volume, credencial, banco ou seed e não executa aplicação, SQL ou navegador. Não lê secrets. O cliente recebe somente PATH e uma pasta de configuração vazia e temporária, removida ao terminar; não herda DOCKER_HOST, DOCKER_CONTEXT, Docker credentials ou env de aplicação. O socket local também é passado explicitamente. As saídas persistidas são o relatório de metadados e o sinal report_ready usado pelo Actions para publicá-lo.

### Estados de saída

| Código | Significado |
|---|---|
| 0 | As referências já estavam fixadas por digest. Não houve execução de E2E. |
| 1 | A resolução falhou: contexto Docker externo, referência inválida, erro de pull/inspect ou digest ausente/ambíguo. |
| 2 | Os digests foram obtidos, mas exigem revisão e registro no lock. Bootstrap/login continuam bloqueados. |

O resolver não altera o lock automaticamente. O relatório informa quais imagens foram puxadas nesta etapa e quais já tinham digest no arquivo; não atribui verificação nativa a uma imagem que apenas leu do lock.

Se uma imagem falhar, o relatório preserva os digests anteriores e identifica o nome, referência validada e etapa com erro. Não copia stderr, corpo de erro ou o JSON completo de inspect para os artefatos.

## Origem das versões

PostgreSQL usa o mesmo digest do replay descartável existente. PostgREST v14.5 reaproveita a versão dos harnesses HTTP do próprio repositório. Auth, Storage, Realtime e Edge Runtime seguem o compose oficial em supabase/supabase@4a9b2b6860805d11b76b59ff29b8803925f2ec38. Playwright usa 1.64.1, a versão efetiva da suíte atual. A compatibilidade do conjunto será medida pelo bootstrap isolado, não presumida a partir dos números.

## Validação

    node --test scripts/ci/e2e-isolated-images.unit.mjs

A regressão executa o resolver real com um cliente Docker simulado: caminhos positivos, contexto externo, referências inválidas, falhas de cada comando e digests de outra origem ou ambíguos. Confere que o resolver só permite context/pull/inspect. Não é uma execução de Docker ou de E2E.

O workflow de preparo aceita PR e dispatch para obter a prova antes do merge, com contents:read e checkout sem persistência de credenciais. Publica somente o JSON de metadados por três dias. O workflow autenticado anterior continua suspenso até a substituição segura ser validada; esta etapa não autoriza sua reativação.
