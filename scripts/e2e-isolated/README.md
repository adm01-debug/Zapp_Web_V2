# E2E em ambiente descartável

Esta automação executa login ou os grupos E2E em ambiente descartável, sem credenciais de produção. O modo `login` seleciona somente `setup/authenticate`; seu sucesso não significa que os 15 projetos da suíte tenham sido executados. A preparação de imagens continua uma etapa separada.

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

A configuração isolada preserva projetos, dependências e assertions. O modo `login` seleciona somente `setup`; os modos abaixo executam a seleção explícita de cada grupo. Sucesso do login não declara os demais casos aprovados. A reativação do workflow autenticado anterior depende da substituição completa e validada.


## Suíte em três grupos

    bash scripts/e2e-isolated/run.sh suite authenticated /tmp/e2e-isolated-authenticated
    bash scripts/e2e-isolated/run.sh suite deslogado-principal /tmp/e2e-isolated-deslogado-principal
    bash scripts/e2e-isolated/run.sh suite deslogado-secundario /tmp/e2e-isolated-deslogado-secundario

A entrada aceita somente esses três grupos e exige saída fora do checkout, inicialmente vazia. Cada comando cria seu próprio ambiente. Os projetos conservam a união de 9 + 3 + 3; não há expressão livre de shell, nome de projeto arbitrário ou desativação das dependências.

| Grupo | Projetos explícitos |
|---|---|
| `authenticated` | `setup`, `chromium-e2e-core`, `chromium-authenticated`, `firefox-talkx`, `webkit-talkx`, `firefox-conversation`, `webkit-conversation`, `firefox-catalog`, `webkit-catalog` |
| `deslogado-principal` | `chromium-mapa`, `firefox-auth`, `webkit-auth` |
| `deslogado-secundario` | `chromium-telefonia`, `firefox-telefonia`, `webkit-telefonia` |

A coleta `--list --reporter=json` é uma chamada separada da execução. Ambas usam os mesmos projetos e `--workers 1`, porque os testes existentes compartilham recursos. O resumo confronta identidades e resultados; teste ausente, extra, flaky, erro de coleta ou skip inesperado não vira aprovação. O limite de execução do navegador é 45 minutos no grupo autenticado e 15 nos grupos deslogados, além do preparo do ambiente. A prova de isolamento só é emitida após as verificações do seed e mantém validade máxima de 60 minutos.

A coleta define `PLAYWRIGHT_JSON_OUTPUT_FILE` somente no seu processo, em um subdiretório privado novo de output; o browser conserva `/output/results.json`. O controller exige status 0 sem erro/sinal, arquivo regular sem links, tamanho positivo até 64 MiB, UTF-8/JSON integrais e o mesmo parser de inventário. Não interpreta stdout, que pode conter a listagem humana do Playwright e saída de módulos importados. Não há fallback, retry nem mudança de seleção: auxiliares Node elegíveis pelo catch-all continuam sendo importados. Seus guardrails próprios continuam sendo responsabilidade do workflow Talk X.

Falhas de preparo, ausência, tipo, tamanho, leitura, JSON e gravação recebem códigos fechados `collection-report-*`, `collection-inventory-write` ou `collection-public-inventory-write`; falhas de processo e inventário conservam os gates bloqueantes. O JSON bruto permanece privado e somente o inventário sanitizado existente entra no artifact. Os contratos locais verificam o helper e o controller com fronteiras controladas; a execução Docker/Playwright real continua necessária para obter o inventário autenticado e seus resultados.

### Diagnóstico fechado do processo do navegador

`browser-result-diagnostic.json` (schema 1) separa três evidências: término do processo, leitura de `results.json` e decodificação JSON. O controller lê o arquivo uma vez e, quando a leitura termina, tenta decodificá-lo uma vez. Falhas continuam entregando `undefined` ao resumo existente; não há nova leitura, espera ou retry para aproveitar um relatório tardio.

| Campo | Valores publicados |
|---|---|
| `process.status` | Inteiro de 0 a 255, `null` ou `"unknown"` |
| `process.signal` | `null`, sinal da lista fechada ou `"unknown"` |
| `process.error` | `"none"`, `"present"` ou `"unknown"` |
| `process.error_code` | `null`, `ETIMEDOUT`, `ENOBUFS`, `ENOENT`, `EACCES` ou `"unknown"` |
| `report.read` | `"ok"`, `"missing"`, `"failed"` ou `"unknown"` |
| `report.read_error_code` | `null`, `ENOENT`, `EACCES`, `EPERM`, `EISDIR`, `EIO`, `EMFILE`, `ENFILE` ou `"unknown"` |
| `report.parse` | `"decoded"`, `"invalid"`, `"not-attempted"` ou `"unknown"` |

Os sinais permitidos são `SIGTERM`, `SIGKILL`, `SIGINT`, `SIGHUP`, `SIGABRT`, `SIGSEGV`, `SIGBUS`, `SIGILL`, `SIGFPE`, `SIGQUIT`, `SIGPIPE` e `SIGTRAP`. Valores fora desses domínios viram `unknown`. A observação usa descritores de dados com travessia limitada; getters, proxies e conversões de objetos não são executados para classificar os campos.

`decoded` afirma somente que o JSON pôde ser decodificado: `null`, `{}` ou outro formato incompatível continuam reprovados pelo parser Playwright. Saída zero com erro ou sinal continua reprovada pelo gate de processo. Inventário, contagens, política de skips e critérios de aprovação permanecem no resumo e nos gates existentes. Um intervalo próximo do timeout configurado, sozinho, não prova `ETIMEDOUT`; esse código só é publicado quando observado no resultado do processo.

A captura fica em memória antes dos gates. A publicação usa o laço protegido dos diagnósticos reconstruídos, em modo 0600, e passa pelo redator obrigatório. Uma falha de gravação desse diagnóstico não substitui a falha original nem transforma sucesso em falha. A ausência do arquivo pode significar que o navegador não chegou a iniciar ou que a publicação falhou; ela não significa aprovação. O gate `report_ready` continua bloqueando upload quando o redator falha.

O schema não contém duração, stdout/stderr, mensagem, stack, cause, caminho, URL, corpo do relatório ou campos privados. Os objetos publicados têm protótipo nulo e são congelados. Os contratos locais exercitam helpers e controller reais com processos controlados; eles não substituem a execução Docker/Playwright nativa.

O grupo autenticado compila todos os entrypoints Edge ativos e versionados antes de criar credenciais, verificando seus blobs. Não basta compilar `auth-login`. O provider de Evolution GO e do catálogo externo opera apenas em `127.0.0.1:8081`, no namespace fechado; seus dados e recibos são sintéticos. Auth, PostgREST, Storage, Realtime, RPCs e handlers da aplicação continuam reais. A fronteira do catálogo aceita somente as consultas documentadas da fixture e recusa formas desconhecidas; não é um substituto geral de PostgreSQL ou busca textual.

Depois do login real, o controller executa os seeds existentes de Arquivos, o seed de suíte e o verificador de providers. O seed conserva os proprietários de Arquivos, prepara paginação, conversa principal, inbox e Talk X e verifica leituras com o JWT do usuário. A preferência de onboarding do supervisor compartilhado e do usuário de Arquivos precisa ser realmente `true`; o Tour usa usuário novo por teste, preferência comprovada `false`, sessão vazia e limpeza por posse, sem redefinir preferências compartilhadas.

### Proprietários das seis rotinas de entrega

Somente no grupo autenticado, depois do replay e da revalidação de cron desligado, o controller restaura para `postgres` o proprietário de seis assinaturas fixas: `enqueue_outbound_message(uuid,uuid,text,text,text,uuid,uuid,text)`, `claim_outbound_message(uuid,uuid,text,integer)`, `complete_outbound_message(uuid,uuid,text,text)`, `fail_outbound_message(uuid,uuid,boolean)`, `get_instance_token(text)` e `enqueue_ai_job(text,text,text,uuid,jsonb,integer,timestamp with time zone,timestamp with time zone,integer)`, todas em `public`. O snapshot `contexto@51d4d9fb7d6109ead9357025da3ae83389c24d4e` registra esse owner; o replay local cria as seis como `supabase_admin`. O usuário global do replay permanece inalterado.

`routine-ownership.mjs` vincula cada assinatura ao SHA256 integral de sua definição exportada. Antes de qualquer ALTER, exige seis OIDs distintos, função SECURITY DEFINER, owner atual `supabase_admin` ou `postgres` e definição exata. Diferença de formato ou corpo bloqueia; não há normalização de hash, descoberta de funções adicionais, GRANT, mudança de guardas/RLS ou alteração de migrations. Owner já correto é validado sem novo ALTER.

A etapa reinspeciona CID, imagem, rótulos, estado, namespace e volume da execução. O novo `psql` usa o CID conferido, socket local, ambiente mínimo com `env -i`, `-X`, `-w` e limites de tempo. Não herda PGHOSTADDR, PGSERVICE, PGOPTIONS ou URL de conexão. A transação preserva definição, atributos e ACL do replay; a comparação transforma somente as entradas anteriores do proprietário (grantor e grantee), conserva grant options, terceiros e a distinção entre ACL NULL e vazia. Isso não afirma equivalência integral das permissões com produção nem elimina as falhas históricas aceitas pelo replay.

`routine-ownership.json` publica apenas identidades conhecidas, hashes, owners enumerados e flags de preservação. A saída `verified` ocorre antes do COMMIT: confirmação exige também término com status zero, sem error/signal e protocolo completo. Resposta perdida depois de possível COMMIT é falha, sem alegar rollback ou repetir automaticamente; o ambiente é limpo. SQL, ACLs, OIDs, stdout/stderr brutos e mensagens de erro não são publicados. A inspeção tem orçamento próprio; o processo SQL tem 5 segundos, SIGKILL e 8.192 bytes de saída.

As regressões Node executam o helper e o controller reais com fronteiras Docker/SQL controladas. Hash integral, autenticação pelo socket, privilégios de ALTER, transação e preservação real de ACL ainda precisam passar no PostgreSQL nativo. Mesmo após confirmar os owners, o catálogo independente e o verifier abaixo continuam obrigatórios: a etapa não comprova entrega nem identifica sozinha a origem de um `42501`.

A prontidão de entrega precisa provar três fluxos completos: texto, imagem do catálogo via HTTPS e objeto do Storage enviado com JWT e assinado pelo worker real. Cada um usa `enqueue_outbound_message`, `message-delivery`, recibo observado no provider e leitura da linha real de `messages` com RLS. Para mídia, o provider precisa baixar os bytes HTTPS antes de emitir recibo; hash e tamanho devem coincidir. Uma contraprova HTTP deve receber `22023` e não inserir mensagem. Nenhuma linha artificial é inserida para simular a entrega. Só depois disso o SKU recebe `E2E_CATALOG_PRODUCT_SKU_VERIFIED=true` no processo executor.

Os dois skips históricos de plataforma de `conversation.spec.ts` permanecem na categoria `known_runtime_skip`, vinculados a arquivo/blob/linha/título/projeto, motivo exato e inventário independente; o caso Chromium equivalente precisa ter passado. Eles não contam como `passed` e `allPassed` permanece falso. Outras ausências de fixture, Auth ou serviço, e os fixmes estáticos ainda existentes, não são reclassificadas para forçar verde. A lista nativa de testes e a decisão específica sobre essas pendências devem acompanhar o resultado da execução.

Tarefas conserva os três cenários, suas asserções e a guarda R1 deslogada, com seleção explícita no projeto Chromium público e saída apenas do catch-all autenticado. Essa execução pertence ao CI público; não é contada duas vezes entre os 15 projetos acima. O arquivo de conversas permanece intacto para conservar o vínculo preciso da política de plataforma.


## Prova manual de conectividade dos navegadores

O dispatch de `.github/workflows/e2e-logado-isolado.yml` aceita também `scope=network-proof`. Esse diagnóstico não inicia aplicação, banco, seed, sessão de usuário ou provedor de mensagens. Usa a imagem Playwright fixada por digest, certificados sintéticos e um canário HTTP da própria execução. Não usa modelos de IA nem credenciais de aplicação; consome execução do Actions e armazenamento temporário.

O baseline mede Node, Chromium, Firefox e WebKit em um namespace com loopback. Registra o valor nativo de `navigator.onLine` antes de qualquer emulação; online e offline são observações possíveis. A candidata exige prova passiva de que o módulo dummy já está carregado antes da criação de uma interface sem saída. Não carrega módulos nem aceita uma rota desconhecida para obter sucesso. O helper temporário recebe apenas NET_ADMIN; os navegadores não recebem essa capacidade nem socket Docker.

A candidata verifica HTTPS válido, rejeição de certificados inválidos, emulação offline/online, down/up real do link e um contexto novo sem emulação. O canário tem controles positivos antes/depois das tentativas negativas, com contagem de conexões e requests; a orquestração Docker é assíncrona para manter o canário ativo. Containers são conferidos por identidade antes da remoção.

O único artefato é `report.json`, com identidades e resultados fechados, publicado após limpeza válida. Ausência do módulo produz candidata `not_run` e falha, preservando as observações disponíveis do baseline. Falhas de protocolo, topologia, certificado, navegador ou limpeza também reprovam; o relatório não inclui URLs privadas, chaves ou logs livres.

Mesmo um resultado aprovado deste diagnóstico conserva `plan_fully_validated=false`: transporte Bun/Edge e saída IPv6 externa continuam `not_run`. Ele não altera a admissão da aplicação, não substitui os guards atuais de loopback e não autoriza a reativação do workflow legado. Qualquer evolução desses guards depende da análise da evidência nativa.

Os testes locais das políticas e do protocolo usam:

    node --test scripts/ci/e2e-isolated-network-proof.unit.mjs

Esses testes controlam Docker, navegador e transporte. Não devem ser apresentados como execução nativa dessas dependências.

## Comparação dos contextos oficiais do Playwright

O mesmo workflow aceita `scope=network-proof-contexts`. Essa entrada seleciona somente a comparação em loopback: não tenta dummy, veth, rota default, módulo de kernel ou fallback de rede. Containers usam `--cap-drop ALL`. Aplicação, banco e credenciais não são iniciados.

Para cada engine fixada, a comparação mede um contexto direto sem opção offline, a fixture real do Playwright Test com sua opção padrão, a opção explícita `offline: false`, o setter isolado `setOffline(false)`, dois ciclos oficiais true→false e um contexto novo sem emulação. Um setter que não muda o estado não é contado como transição. O segundo ciclo exige eventos offline/online e bloqueio/restauração efetivos do fetch HTTPS. O contexto novo precisa conservar a observação nativa inicial.

A fixture Test roda com uma configuração privada de conteúdo fixo: um teste, um worker e nenhum retry. Fonte, configuração e reporter são montados somente para leitura; o controller confere conteúdo, identidade e inventário dos arquivos. Resultado exige término do processo, reporte de um teste aprovado sem skip e correspondência entre o dado medido e o relatório. Nenhuma configuração ou sessão da aplicação é carregada.

| Campo do relatório | Significado |
|---|---|
| `collection_complete` | Os três processos concluíram e forneceram observações completas válidas. |
| `official_api_cycle_passed` | Os ciclos oficiais bloquearam/restauraram o fetch e produziram os estados e eventos exigidos nas três engines. |
| `native_online_all` | Todos os contextos diretos sem emulação começaram online; `null` indica coleta incompleta. |
| `test_default_online_all` | Todas as fixtures reais do Playwright Test começaram online; `null` indica coleta incompleta. |

Um valor nativo false permanece false mesmo se o ciclo oficial funcionar. HTTPS, controles negativos de CA/SAN, topologia, canário com controles positivos e limpeza continuam obrigatórios. O relatório conserva `native_contract_qualified=false`, `authenticated_admission=false` e `plan_fully_validated=false`; Bun, Edge, IPv6 externo e as variantes de interface continuam explicitamente não executados. Essa medição informa a escolha de uma alteração futura do harness; não a aplica nem reativa o legado.

    node --test scripts/ci/e2e-isolated-network-proof.unit.mjs scripts/ci/e2e-isolated-network-contexts.unit.mjs

## Fixture exclusiva de QR

No grupo autenticado, `seed-qr.mjs` roda depois de `seed-suite.mjs`. A preparação cria o administrador `qr.admin.e2e@example.invalid` e uma terceira conexão desconectada, `e2e-qr-local`, com token próprio no Vault descartável. O supervisor compartilhado, o agente de Arquivos, as duas conexões anteriores, seus tokens e o vínculo do contato canônico são conferidos antes/depois. Colisão com a fixture existente reprova; uma tentativa interrompida exige novo ambiente, sem tratar um seed parcial como concluído.

O provider local aceita somente connect, QR e status para o token dessa conexão. A primeira leitura de QR fica vazia e a segunda fornece PNG com o texto inofensivo `ZAPP-E2E-SYNTHETIC-QR-NO-PAIRING-V1`. O digest, tamanho e decodificação da imagem são verificáveis; o conteúdo não permite pareamento de aparelho. A Edge, a leitura do Vault e a persistência continuam reais. Não há criação, exclusão, logout ou envio habilitados para essa credencial do provider.

A fixture Playwright exige admissão Node e preflight do browser antes de ler as credenciais, faz login real pela UI e confirma usuário, perfil admin e conexão por Auth/RLS. O teste exige resposta HTTP concluída com contrato de QR pendente, imagem carregada, leitura persistida e polling de status. Após fechar o diálogo, observa mais de dois ciclos de três segundos para verificar o cancelamento.

A limpeza rastreia operações conservadoramente: query inesperada, corpo ambíguo, falha ou request ainda pendente impedem o reset. Só depois da conclusão comprovada e do fechamento do contexto, o JWT do admin pode executar PATCH da própria fixture, com filtros de ID, instância, proprietário, não default, status e versão `updated_at`. Exige uma representação única e leitura posterior. Não usa chave de serviço no browser nem substitui erro por sucesso. A limpeza geral por posse do controller continua obrigatória mesmo quando esse reset é recusado.

A prontidão específica de QR fica privada. Password e token exclusivos entram na redaction do controller e são excluídos do ambiente do processo do navegador. Modelos locais com Auth/RLS/Vault controlados validam decisões; só o grupo nativo integrado comprova essas dependências.

    node --test scripts/ci/e2e-isolated-qr.unit.mjs scripts/ci/e2e-isolated-runtime.unit.mjs

