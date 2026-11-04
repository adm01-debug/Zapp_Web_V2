# E2E em ambiente descartável

Esta automação prepara o substituto isolado do E2E autenticado. Não usa credenciais de produção. O primeiro corte executável cobre bootstrap e o teste real `setup/authenticate`. Seu sucesso não significa que os 15 projetos da suíte autenticada tenham sido executados. A preparação de imagens continua uma etapa separada.

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

## Bootstrap e login real

    bun install --frozen-lockfile --ignore-scripts
    bash scripts/e2e-isolated/run.sh login /tmp/e2e-isolated-login

O comando exige Linux, Docker local, Bun 1.4.0, OpenSSL 3, `certutil` (pacote `libnss3-tools`) e as dependências do checkout. A origem deste corte é `https://127.0.0.1:5173`; o tráfego dos serviços dentro do namespace continua em loopback. Rejeita qualquer uma das sete imagens sem digest e exige que a versão instalada do Playwright seja a mesma da imagem de navegador. O SHA registrado é o `git rev-parse HEAD` do checkout executado, inclusive quando o evento de PR usa um merge-ref.

A sequência executada é:

1. Validar o lock, o checkout e as dependências; conferir OpenSSL/NSS antes de gerar qualquer chave. Puxar os digests exatos e conferir `install`/`update-ca-certificates` na imagem do driver, sem credenciais.
2. Gerar ESZIP do loader, do handler real `auth-login` e de um probe TLS separado, usando a própria imagem Edge fixada. O probe não entra no registro das funções de aplicação. Essa compilação tem acesso às dependências públicas, recebe somente o código/cache e ocorre antes de criar credenciais ou banco.
3. Conferir o blob Git de cada migration SQL na raiz ativa. `_foreign` e `_superseded` não entram. Duas configurações históricas de URL no Vault recebem a origem local em cópia temporária, vinculadas a hashes revisados; o SQL original permanece intacto. O único JWT histórico revisado, na migration do cron incremental Gmail, é substituído em cópia por uma leitura do setting local app.settings.e2e_anon_key; a URL desse cron também recebe a origem local. Nome e blob precisam coincidir exatamente com a revisão. Qualquer outro JWT literal ou nova configuração Vault sem revisão bloqueiam antes de executar SQL. O manifesto registra os hashes antes/depois e a transformação, sem gravar o corpo SQL.
4. Emitir uma CA por execução e certificados leaf para a origem local e os dois controles negativos. Apagar a chave privada da CA após a emissão. Gerar chaves e usuário exclusivamente sintéticos. Criar uma âncora Docker com `--network none`; todos os serviços compartilham somente esse namespace. A âncora também mapeia o hostname oficial para `127.0.0.1`; o driver e o PostgreSQL precisam confirmar esse `/etc/hosts` antes da cadeia SQL de aplicação. Inspecionar posse, rede e mounts, além de ler as interfaces e o identificador do namespace de dentro do driver.
5. Instalar a CA somente no driver descartável após conferir posse, usuário e mounts. Iniciar gateway HTTPS e Edge temporário sem credenciais de aplicação. Node, Bun, Chromium, Firefox, WebKit e Edge precisam aceitar identidade/imagem locais e recusar certificado sem confiança e SAN incorreto por erro TLS. Os quatro comandos de gate devem fornecer provas completas do mesmo run/SHA/origem. Remover o Edge temporário com conferência de posse antes de seguir. Falha nessa etapa impede até a criação do PostgreSQL.
6. Inicializar PostgreSQL com `cron.launch_active_jobs=off`, Auth, PostgREST, Storage e Realtime reais. Aguardar os endpoints e as tabelas/funções da plataforma; Realtime exige `data.healthy=true`, pois HTTP 200 sozinho não prova prontidão.
7. Configurar e conferir por leitura booleana o setting local da chave anon sintética, enviado somente pela entrada do psql. Aplicar a cadeia ativa de migrations. As falhas históricas já classificadas no replay continuam registradas separadamente; qualquer falha nova ou erro de processo bloqueia. O seed e o login reais ainda precisam demonstrar que a estrutura necessária existe. Revalidar cron e recarregar o schema do PostgREST.
8. Iniciar Edge Runtime com ESZIP local, módulos remotos desativados e a CA pública local, e Vite em modo de desenvolvimento. O gateway encaminha somente para portas de loopback conhecidas; as rotas Realtime de API e WebSocket conservam os prefixos oficiais distintos.
9. Criar o usuário confirmado pelo Auth real, exigir seu perfil criado pelo trigger, atribuir o papel de supervisor e chamar o `auth-login` real. Conferir a leitura do perfil com o JWT desse usuário, sem substituir a chamada por uma RPC ou sessão simulada.
10. Emitir a prova de prontidão de no máximo 60 minutos após as verificações. Executar a coleta separada e o teste `setup` com a configuração isolada. A admissão verifica namespace, interfaces, origem/configuração Vite e chave anon antes de ler as credenciais e novamente depois da leitura no browser.
11. Remover somente contêineres e volumes com os rótulos desta execução. Falha ou posse divergente na limpeza mantém resultado de falha; não existe comando global de poda.

### Confiança TLS e limites da prova

A chave leaf privada é montada somente no gateway. Driver e Edge recebem apenas a CA pública; o browser não recebe credenciais de backend. Node usa `NODE_EXTRA_CA_CERTS`, Edge usa o store de sistema com `SSL_CERT_FILE`, e o driver descartável recebe a CA no store do sistema, NSS e política específica do Firefox. O HOME NSS é montado no mesmo caminho absoluto com UID:GID do runner. Nenhum passo usa bypass de validação TLS. O truststore do host não é modificado.

O controle de emissor usa um leaf válido para `127.0.0.1`, assinado por uma segunda CA exclusiva da execução. Essa CA fica na área privada do gateway e nunca é importada no sistema, NSS ou Firefox; somente a CA principal é distribuída aos clientes. O emissor confere a assinatura pela segunda CA, a rejeição pela principal e que o leaf não é autoassinado. As duas chaves de CA são apagadas após a emissão e também no caminho de falha. Os controles conservam RSA 2048, SHA-256, `serverAuth` e validade de um dia; `SSL_ERROR_UNKNOWN`, timeout ou erro de rede não substituem a prova exigida pelo classificador de cada cliente.

`tls-proof.json` publica somente fingerprints, versões e resultados dos clientes. O campo `runtime` identifica o cliente sondado; `probe_runner`/`probe_runner_version` identificam o processo que executou a sondagem, sem atribuir a versão Node ao Edge. Certificados, chaves, base NSS e políticas não entram nos artifacts. O controle de boot verifica identidade e prontidão; os gates seguintes é que provam o transporte.

### Escrita e credenciais

O checkout é montado somente para leitura. Os alvos vazios dos mounts são preparados antes, preservando os arquivos existentes. Sessão, relatórios, capturas e caches `.vite`/`.vite-temp` recebem diretórios efêmeros separados; os alvos novos são removidos apenas se continuam vazios após desmontar os contêineres. Compiladores, driver, Vite e gateway usam o UID:GID do runner para os arquivos desses binds continuarem removíveis. Os serviços de plataforma preservam seus usuários oficiais e seus volumes são removidos pelo Docker após a conferência de posse. As baselines de screenshot são copiadas para um mount próprio e `updateSnapshots` permanece `none`.

PostgreSQL, Auth, PostgREST, Storage, Realtime e Edge preservam o diretório de trabalho definido em suas imagens. O construtor define `/work` apenas para âncora, driver, Vite e gateway; a compilação do checkout mantém sua configuração explícita separada. Isso permite que comandos relativos das imagens oficiais, como o servidor do Storage, resolvam seus próprios arquivos sem presumir um caminho na automação.

As envs dos serviços são escritas em arquivos privados temporários, sem valores na linha de comando. A chave local `service_role` pode estar no driver Node para fixtures e nos serviços necessários; não entra nas variáveis `VITE_*` nem no ambiente do processo do navegador. `launchOptions.env` usa uma lista explícita de variáveis de sistema. Credenciais, sessão e chave JWT não entram na prova pública, que contém apenas o hash da chave anon.

O reporter JSON, HTML, traces e screenshots brutos ficam somente no runner efêmero. O artifact usa exclusivamente o subdiretório `public/`: metadados, resumo de resultados e logs redigidos. Isso evita publicar tokens de sessão emitidos pelo login real que não existiam quando o seed gerou suas chaves. Logs do PostgreSQL viram apenas contagens e nomes dos arquivos de inicialização, pois erros podem citar SQL. Uma falha do redator impede o upload. A retenção é de três dias.

### Limite deste corte e regressões

    node --test scripts/ci/e2e-isolated*.unit.mjs scripts/ci/e2e-auth-*.unit.mjs

As regressões executam funções reais e o controlador com interfaces Docker, Git e serviços simuladas, além do redator real. Elas provam decisões e interrupções. O teste do gateway faz handshake HTTPS real em Node com uma CA temporária e recusa a conexão sem essa confiança; não usa serviços da aplicação. As demais simulações não são prova de PostgreSQL, Deno, ESZIP, Realtime, Bun ou Playwright nativos. Essa prova é produzida pelo job `bootstrap-login` no Actions, sobre a branch, sem secrets.

A configuração isolada preserva os projetos e assertions originais; nesta etapa o comando seleciona somente `setup`. O restante ainda exige seed de conversas, catálogo, arquivos e Talk X, fake Evolution local e o fluxo real de `message-delivery`, além das correções de fixture que ainda apontam para hosts oficiais. Sucesso do login não é usado para declarar esses testes aprovados. A reativação do workflow autenticado anterior depende da substituição completa e validada.
