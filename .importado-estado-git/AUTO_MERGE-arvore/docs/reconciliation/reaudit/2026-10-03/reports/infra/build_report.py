from pathlib import Path
import json, hashlib, re, subprocess, collections

ROOT=Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
OUT=Path('/workspace/scratch/f8f9b9cbce53/reaudit/reports/infra')
OLD=Path('/workspace/scratch/8b95153002da/reconciliation/docs/reconciliation')
HEAD='da307ba5626dce892f0b37cb6762463f55d14a96'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def ev(path,start,end,why,origin='source'):
    root=ROOT if origin=='source' else OLD
    p=root/path
    lines=p.read_text().splitlines()
    assert 1<=start<=end<=len(lines),(path,start,end,len(lines))
    return dict(path=path,line_start=start,line_end=end,sha256=sha(p),baseline_sha=HEAD if origin=='source' else None,origin=origin,reason=why)
tasks={t['id']:t for t in json.loads((OLD/'tasks/P006.json').read_text())['tasks']}
def task(i,reason,proposed=None):
    t=tasks[i]
    return dict(plan_record_id='P006',task_id=i,canonical_id=t['canonical_id'],previous_status=t['status'],previous_assessment=t['assessment'],affected_subcontract=reason,proposed_status=proposed or t['status'],baseline_task_file='tasks/P006.json',baseline_task_sha256=sha(OLD/'tasks/P006.json'))

findings=[]
def add(n,title,severity,description,chain,preconditions,effect,evidence,acceptance,probes=(),related=(),classification='novo',tasks=(),limits=(),reopen_basis='Mecanismo não descrito nos 104 achados anteriores.'):
    findings.append(dict(id=f'R2-INF-{n:03}',title=title,severity=severity,classification=classification,baseline_sha=HEAD,description=description,consumer_chain=chain,preconditions=preconditions,effect=effect,evidence=evidence,acceptance=acceptance,probe_ids=list(probes),related_previous_findings=list(related),novelty_basis=reopen_basis,affected_tasks=list(tasks),limitations=['Não houve execução de workflow, deploy, PostgreSQL, E2E real ou consulta de configuração de produção nesta reauditoria.']+list(limits),proof_type='STATIC_AND_SYNTHETIC_OFFLINE' if probes else 'STATIC_CODE_PATH'))

add(1,'O dry_run de Edge Functions pode reescrever secrets do projeto','P1',
    'O input promete ensaio sem publicação, mas o passo Configurar secrets nas edges não depende de dry_run. A decisão reescrever fica true com rotação explícita, nomes ausentes ou falha na listagem remota. O primeiro bloqueio por dry_run só aparece no deploy, depois de secrets set.',
    ['workflow_dispatch dry_run=true','.github/workflows/deploy-functions.yml → decisoes_secrets','secrets-scope.mjs → reescrever=true','Configurar secrets nas edges → supabase secrets set'],
    ['Dispatch passa pelas validações anteriores e possui credenciais válidas.','Ao menos um secret aplicável está disponível e REESCREVER=true.'],
    'Um ensaio autorizado como leitura pode alterar configuração usada por funções já publicadas, mesmo sem novo deploy.',
    [ev('.github/workflows/deploy-functions.yml',44,48,'Promessa do input'),ev('.github/workflows/deploy-functions.yml',188,230,'Decisão e primeira escrita sem if de dry_run'),ev('.github/workflows/deploy-functions.yml',283,338,'Demais escritas de secrets'),ev('.github/workflows/deploy-functions.yml',362,363,'Bloqueio só no deploy'),ev('scripts/edge-deploy/secrets-scope.mjs',43,82,'Fallback e rotação permitem reescrita')],
    ['Bloquear cada mutação remota por dry_run=false antes de invocar a CLI.','Prova com CLI falsa registra zero comandos mutantes em dry_run nas condições rotate, secret ausente e listagem indisponível.','Plano de ensaio informa a decisão e permanece disponível sem alterar configuração.'],['dry_run_secret_decisions'],tasks=[task('E57','Ensaio deve impedir secrets set, além do deploy.','PARTIAL'),task('E58','Decisão de reescrita precisa respeitar o modo de ensaio do chamador.','PARTIAL')])

add(2,'Artifact de deploy pode ser publicado depois de falhar a remoção de secrets','P1',
    'A remoção de secrets e o upload usam independentemente always() && inputs.dry_run != true. A etapa de remoção não tem id nem há condição que exija seu sucesso. Se a leitura ou gravação do redator falhar, o diretório ainda é enviado com o log original.',
    ['Deploy → deploy-output.log','redigir-log.mjs altera o arquivo no lugar','upload-artifact always() envia edge-deployment-evidence'],
    ['Existe log bruto contendo credencial ou URL sensível.','A remoção de secrets falha antes de terminar a gravação do arquivo limpo.'],
    'Artifact pode reter credencial fora da proteção de mascaramento do log do Actions. Trata-se de caminho condicional de exposição, sem evidência de incidente já ocorrido.',
    [ev('.github/workflows/deploy-functions.yml',486,505,'Upload independe de sucesso do redator'),ev('scripts/edge-deploy/redigir-log.mjs',45,85,'Leitura/gravação e possíveis erros')],
    ['Dar id ao redator e só publicar saída cujo processo terminou com sucesso.','Escrever versão limpa em diretório separado e impedir que o artifact inclua o bruto.','Injetar erro de leitura/gravação e verificar que nenhum artifact bruto é selecionado.'],tasks=[task('E74','O contrato de remover credenciais precisa cobrir falha do redator; a presença do script não fecha a cadeia.','PARTIAL')])

add(3,'DB Migrate sobrescreve o DSN endurecido e perde verify-full no transporte','P1',
    'A validação inicial aceita um DSN sem parâmetros TLS, acrescenta verify-full/CA e o exporta por GITHUB_ENV. Outros 20 passos voltam a declarar DESTINO_URL a partir do secret bruto. withPsqlEnvironment remove todos os PG* herdados e só recompõe os parâmetros presentes no DSN recebido; PGSSLMODE exportado não corrige essa sobrescrita. Há 21 declarações do secret no workflow contando a validação inicial.',
    ['Exigir credencial → endurecerDestinoTls → GITHUB_ENV','Preflight/runtime/validações → env DESTINO_URL bruto','psql-safe ou outro chamador → withPsqlEnvironment → libpq'],
    ['O secret contém DSN sem sslmode/sslrootcert, forma aceita pela validação inicial.','Um passo posterior redeclara o secret bruto e usa o transporte psql.'],
    'A verificação de certificado/hostname prometida pelo workflow deixa de ser imposta nessas conexões. O apply do Supabase CLI usa env.DESTINO_URL normalizado e foi distinguido dos passos afetados.',
    [ev('.github/workflows/db-migrate.yml',118,170,'Exportação endurecida e sobrescrita no preflight'),ev('.github/workflows/db-migrate.yml',235,241,'Reintrodução do DSN bruto'),ev('.github/workflows/db-migrate.yml',891,917,'CLI usa DSN endurecido; ledger volta ao bruto'),ev('scripts/db-audit/database-identity.mjs',164,200,'Ausência de parâmetros aceita e normalizada'),ev('scripts/db-audit/psql-environment.mjs',77,116,'PG* herdado descartado; URI é a fonte efetiva')],
    ['Usar a mesma conexão normalizada em todos os consumidores após validação.','Teste da cadeia passa DSN sem parâmetros TLS e observa PGSSLMODE=verify-full e CA correta em cada processo filho.','Erros omitem DSN/senha e não aceitam rebaixamento explícito.'],['tls_raw_override'],tasks=[task('E29','Endurecimento existe, mas não chega a todos os processos filhos do workflow.','PARTIAL')])

add(4,'Os 12 contratos de runtime são Bash enviados como SQL; 767 versões não têm arquivo','P1',
    'A extração preservou o corpo inteiro do case, inclusive RUNTIME=$(node ...), delimitadores shell e, no último arquivo, o ramo genérico. run-runtime-contract.mjs lê esse texto e o passa a psql-safe -c como se fosse SQL. Todos os 12 arquivos começam por RUNTIME=$(. Para as outras 767 versões de migration há ausência de arquivo, recusada antes de qualquer fallback. Isso descreve os contratos versionados e o comportamento do runner quando alcançado; não afirma que todas as 779 versões satisfazem o preflight de seleção.',
    ['Dispatch com alvo que passa identidade/preflight/paridade','Provar estado runtime antes do push','run-runtime-contract.mjs → lerContrato','psql-safe -c <corpo Bash> ou erro de arquivo ausente'],
    ['O fluxo alcança Provar estado runtime antes do push.','Alvo corresponde a um dos 12 arquivos extraídos ou a uma versão sem contrato dedicado.'],
    'A rota não produz a prova JSON de runtime: nos 12 contratos, o texto é de linguagem incompatível com psql; nos demais, o runner encerra com código 2. O compare de hash e as verificações posteriores não tornam o fluxo executável.',
    [ev('scripts/db-audit/run-runtime-contract.mjs',22,57,'Arquivo é enviado inteiro via -c'),ev('scripts/db-audit/contracts/20260830170000.sql',1,20,'Exemplo de wrapper Bash'),ev('scripts/db-audit/contracts/20260922220000.sql',1,14,'Ramo genérico e delimitadores presos no arquivo'),ev('.github/workflows/db-migrate.yml',238,259,'Consumidor exige JSON comum'),ev('scripts/db-audit/extrair-contratos-runtime.mjs',33,50,'Extração de texto shell com extensão .sql'),ev('scripts/ci/db-migrate-contratos.unit.mjs',13,67,'Metatestes verificam texto/hash/contagem, não executabilidade')],
    ['Extrair SQL executável e parâmetros explicitamente, ou executar um contrato de tipo declarado sem confundir shell e SQL.','Definir versões suportadas e fallback equivalente com cobertura do inventário aceito pelo preflight.','Em PostgreSQL descartável, invocar exatamente o runner do workflow para cada classe de contrato e validar a forma completa do JSON.','Conservar guardas de identidade e confirmação; hash textual não substitui o teste do consumidor.'],['runtime_contract_shell'],related=['TRA-009'],tasks=[task('E62','Extração textual quebrou o contrato de execução, além da meta de linhas já pendente.','PARTIAL')],limits=['779 arquivos/779 versões distintas; 12 nomes de contrato; 767 versões sem arquivo. A existência de arquivo não implica elegibilidade de apply.','A incompatibilidade foi demonstrada pela fonte e pelo leitor do contrato; PostgreSQL não foi iniciado.'],reopen_basis='TRA-009 registrava a extração e o tamanho do YAML, não a incompatibilidade Bash→SQL nem a ausência do fallback no runner.')

add(5,'Consulta pós-apply do ledger contém comentários Bash inválidos em SQL','P1',
    'Três linhas iniciadas por # estão dentro do heredoc passado ao psql no passo Validar registro no ledger. São parte do SQL enviado, não comentários do Bash. A consulta não consegue verificar count/statements. O teste E65 só procura a presença dos ANDs e do nome do verificador, por isso continua verde.',
    ['Apply autorizado ou alvo já no ledger','Validar registro no ledger → psql-safe recebe heredoc','Parser SQL encontra texto # E65','Falha antes de verify-ledger-statements.mjs'],
    ['Os bloqueios anteriores foram superados; atualmente R2-INF-004 bloqueia a rota antes.','inputs.apply=true ou needs_apply=false.'],
    'Depois de consertada a barreira anterior, a validação continuará falhando. Quando apply já tiver ocorrido, falha do job não equivale a ausência de efeito no banco. Reabrir somente o subcontrato de integração SQL de E65.',
    [ev('.github/workflows/db-migrate.yml',914,939,'Heredoc SQL contém # nas linhas927–929'),ev('scripts/ci/verify-ledger-statements.unit.mjs',79,88,'Teste de presença de texto passa sem analisar/executar a consulta')],
    ['Usar comentários SQL e executar o heredoc exato em PostgreSQL descartável.','Ledger NULL, vazio e divergente falha; ledger equivalente passa pela consulta e pelo verificador.','Evidência distingue falha pré-apply de falha após efeitos confirmados, sem retry cego.'],tasks=[task('E65','A consulta SQL real não executa, apesar do teste de comparador passar.','PARTIAL')],limits=['Defeito latente atrás de R2-INF-004; não foi observado um apply real falhando.'])

add(6,'Limpeza de E2E apaga todas as reações do usuário logado','P1',
    'cleanupE2EReactions resolve o perfil da sessão corrente e envia DELETE apenas com user_id. Não inclui message_id, contato fixture ou identificador do run. O próprio comentário admite qualquer mensagem. reactions.spec chama a limpeza antes de cada teste e no afterAll.',
    ['E2E autenticado/QA local → sessão corrente','reactions.spec beforeEach/afterAll','cleanupE2EReactions → DELETE message_reactions?user_id=eq.<perfil>'],
    ['A conta usada possui reações fora da fixture.','RLS permite apagar suas próprias reações, conforme o comportamento esperado pelo helper.'],
    'Rodar uma prova de UI remove dados de negócio do mesmo perfil em conversas não relacionadas ao teste. A limitação ao usuário não é uma limitação ao dado de teste.',
    [ev('e2e/fixtures/e2e-contact.ts',138,197,'Perfil dinâmico e DELETE sem escopo de mensagem'),ev('e2e/reactions.spec.ts',20,42,'Execução automática antes/depois dos testes')],
    ['Limpar apenas IDs criados ou pertencentes à fixture/run autorizado.','Verificar conta e projeto esperados antes de mutações.','Teste negativo mantém intacta reação da mesma conta em mensagem externa à fixture.'],['reaction_cleanup_scope'])

add(7,'E2E de mensagens envia para o primeiro contato sem validar a fixture','P1',
    'messaging.spec seleciona o primeiro conversation-item após o chip Todas, digita texto e pressiona Enter. Não importa o identificador da fixture nem confirma o contato antes do envio. A segurança depende da suposição documental de que a conta sempre enxerga só um contato, enquanto o setup permite credenciais de QA e CI.',
    ['e2e-logado / execução local autenticada','messaging.spec → primeira conversa de Todas','Enter → fluxo real de enqueue/envio'],
    ['A conta vê mais de uma conversa ou a ordem muda.','O primeiro item não é o contato E2E e o envio está habilitado.'],
    'Teste pode enfileirar mensagem para contato real não selecionado para QA. Não houve envio nesta auditoria.',
    [ev('e2e/messaging.spec.ts',25,52,'Escolha do primeiro item e envio'),ev('e2e/fixtures/e2e-contact.ts',3,10,'Suposição de visibilidade única'),ev('.github/workflows/e2e-logado.yml',105,121,'Workflow consumidor dos projetos autenticados')],
    ['Selecionar e conferir identidade inequívoca da fixture antes de digitar/enviar.','Abortar quando o contato esperado não estiver visível ou houver ambiguidades.','Fixture com conversa alheia em primeiro lugar demonstra que nenhum enqueue para ela acontece.'])

add(8,'Ratchets de TypeScript tratam falha do compilador como zero erros','P2',
    'typecheck-ratchet aceita status1/2 do tsc e só reconhece diagnósticos com arquivo(linha,coluna). Diagnóstico global TS5083 fica invisível. implicit-any-ratchet captura qualquer falha do subprocesso e só conta error TS7; um compilador ausente produz zero e saída0. Os baselines estão em zero, de modo que não há queda de contagem que alerte.',
    ['CI lint-and-typecheck; hook de pre-push; Gate1 types-sync','tsc → saída e status','Parser restrito/contagem TS7 → comparação com baseline0'],
    ['Erro de configuração, execução ou diagnóstico global não encaixa no formato do parser.'],
    'A etapa reporta nenhum novo erro embora não tenha validado o programa. Outros passos independentes ainda podem falhar; o achado não afirma que o CI inteiro ficará verde em todo cenário.',
    [ev('scripts/ci/typecheck-ratchet.mjs',96,113,'Parser exige coordenadas de arquivo'),ev('scripts/ci/typecheck-ratchet.mjs',225,248,'Aceita status1/2 sem preservar distinção operacional'),ev('scripts/ci/typecheck-ratchet.mjs',296,322,'Sem novos diagnósticos produz sucesso'),ev('scripts/ci/implicit-any-ratchet.mjs',18,41,'Catch universal e contagem parcial'),ev('.github/workflows/ci.yml',166,172,'Consumidores CI'),ev('.github/workflows/types-sync.yml',305,315,'Gate1 de types-sync')],
    ['Distinguir falha operacional de lista válida de diagnósticos.','Falhar para status não zero sem diagnóstico reconhecido e suportar diagnósticos globais.','Casos de compilador ausente, config ausente e configuração inválida falham; projeto sem erros passa.'],['global_compiler_error_passes','missing_compiler_passes'],related=['TRA-008'],reopen_basis='TRA-008 trata Gate3 por contagem de linhas e recuperação; esta falha é do compilador/Gate1, com mecanismo e reproduções distintos.')

add(9,'Gate de dependências aceita erro de registry como relatório sem vulnerabilidade','P2',
    'O workflow neutraliza a saída de bun audit com || true e delega a decisão a audit-prod. O script chama de relatório qualquer texto que contenha vulnerability/vulnerabilities; a mensagem sintética de falha ao obter a base é aceita, vira um cabeçalho sem advisory e termina com código0.',
    ['CI security → bun audit | tee ... || true','audit-prod --input audit-report.txt','Regex de reconhecimento → parse vazio de advisories → exit0'],
    ['Ferramenta/proxy produz erro operacional contendo a palavra vulnerability ou relatório incompleto equivalente.'],
    'O gate declara nenhuma advisory relevante sem ter demonstrado que consultou e interpretou a base. A reprodução usa uma mensagem sintética; não afirma que uma versão específica do Bun sempre emite esse texto.',
    [ev('.github/workflows/ci.yml',323,329,'Status original neutralizado'),ev('scripts/ci/audit-prod.mjs',112,127,'Regex permissiva e sucesso'),ev('scripts/ci/audit-prod.mjs',25,49,'Cabeçalhos incompletos são aceitos')],
    ['Validar resumo/formato completo e consistência das contagens, ou consumir formato estruturado confiável.','Relatório ausente, parcial ou operacionalmente falho encerra com estado inconclusivo/falha.','Testes preservam o status do coletor e cobrem erro que contém a palavra vulnerability.'],['invalid_audit_report_passes'])

add(10,'Suite scripts/db-tests não entende a RPC e pode passar com zero assertivas','P2',
    'run-all.mjs trata o JSON de mcp_exec como array; a implementação versionada devolve envelope com rows/row_count/truncated/ms. Com envelope válido ocorre rows.filter is not a function; com [] o runner declara 0 PASS / 0 FAIL e sai0. Parte dos testes usa RAISE NOTICE, que o runner não interpreta, e as contagens de comentários usam um prefixo inexistente. O arquivo de gamificação seleciona perfil real e contém chamadas mutantes: não é um instrumento somente de leitura.',
    ['Execução manual de scripts/db-tests/run-all.mjs','POST /rpc/mcp_exec com cada arquivo SQL','JSON envelope → rows.filter; ou array vazio → nenhum FAIL'],
    ['Runner recebe o contrato atual da RPC ou resposta vazia.','Com credenciais reais, SQL mutante seria enviado; não foi enviado nesta auditoria.'],
    'A suite não comprova as regressões anunciadas. RLS-02 também conta políticas, não dez tabelas cobertas; múltiplas políticas na mesma tabela podem satisfazer a condição. Não se afirma persistência de escrita no script atual: falhas do bloco SQL/RPC podem fazer rollback.',
    [ev('scripts/db-tests/run-all.mjs',20,67,'Envelope e ausência de mínimo de assertivas'),ev('supabase/migrations/20260829020000_mcp_exec_functions_harden.sql',11,37,'Formato da RPC'),ev('scripts/db-tests/03-gamification-bounds.sql',2,42,'NOTICE, perfil existente e chamadas mutantes'),ev('scripts/db-tests/05-rls-smoke.sql',13,24,'COUNT de políticas apresentado como cobertura de tabelas')],
    ['Decodificar envelope e recusar resultado truncado/ausente/incompatível.','Exigir IDs e quantidade esperada de assertivas e não tratar zero como sucesso.','Executar mutações em fixtures descartáveis com rollback garantido, sem selecionar perfil arbitrário.','RLS prova cada tabela e comportamento permitido/negado; erro genérico não vale como negação esperada.'],['db_tests_response_contract'],related=['TC-011','TC-012'],reopen_basis='Arquivos e consumidor diferentes do validator Team Chat já registrado; o problema não estava entre os 104.')

add(11,'Prova de IA coloca senha/token em argv e deixa sessão Auth no arquivo de saída','P2',
    'prova-orcamento-rate-limit.sh constrói JSON de login por jq --arg p e o fornece a curl --data como argumento. A resposta Auth inteira vai para OUT/login.json, sem umask restritiva, chmod ou remoção. Os requests seguintes usam Authorization com JWT em argv. A frase de que --data não vai por argv é incorreta.',
    ['Operador autoriza PROVA_PRODUCAO=sim','jq --arg → curl --data → OUT/login.json','JWT extraído → headers curl'],
    ['Prova é executada com conta válida.','Processos do ambiente podem observar argumentos ou o diretório de saída é compartilhado/arquivado.'],
    'Credenciais e tokens de sessão têm uma superfície de exposição além da saída de terminal que o script promete limitar. Não foi lido nem criado arquivo de login real.',
    [ev('scripts/qa/prova-orcamento-rate-limit.sh',21,23,'Promessa de não imprimir token/senha'),ev('scripts/qa/prova-orcamento-rate-limit.sh',39,68,'Args e arquivo com resposta Auth')],
    ['Usar canal protegido para credenciais e corpo do login, sem parâmetros sensíveis em argv.','Criar temporários privados, redigir apenas evidência necessária e remover tokens ao terminar, inclusive em falha.','Probe com valores sintéticos verifica argv capturado e ausência de tokens em outputs publicáveis.'])

add(12,'Prova de orçamento/rate limit termina com ok sem verificar o comportamento','P2',
    'A função chamar imprime status/corpo mas não os valida; o script não usa errexit, não verifica as três respostas nem consulta os registros correlacionados. Após login, pode registrar FIM_PROVA=ok com três erros HTTP ou falhas de transporte. As consultas mostradas ao operador são totais sem correlação com o run. Três chamadas aceitas, por si, tampouco comprovam bloqueio por limite.',
    ['Prova de produção manual → login válido','Três curl → status impresso','SQL apenas exibido → FIM_PROVA=ok incondicional'],
    ['Login devolve token; chamadas seguintes falham ou não exercitam a restrição.'],
    'Um consumidor da marca final pode confundir término do script com prova de reserva, liquidação, log e rejeição por limite. O texto orienta verificação manual, que deve continuar registrada como pendente até evidência correlacionada.',
    [ev('scripts/qa/prova-orcamento-rate-limit.sh',62,89,'Ausência de assertivas e ok final')],
    ['Distinguir executado/inconclusivo/aprovado e só emitir aprovado com critérios medidos.','Correlacionar requests e registros por IDs do run, sem inferir a partir de totais globais.','Provar caminhos de sucesso e rejeição na fixture apropriada; falha HTTP/transporte precisa produzir falha do verificador.'])

add(13,'Inventário de testes ignora quatro suites Node fora dos globs de CI','P2',
    'check-test-inventory cobre apenas .test.ts em supabase/functions e .test.sh em scripts/db-audit. Há 87 arquivos scripts/**/*.unit.mjs ou *.test.mjs; quatro não são selecionados pelos globs nem por nomes nos workflows. A allowlist de nove .test.sh continua sem owner/prazo. E48 deve conservar seu veredito no escopo estreito documentado; a garantia de inventário geral é que permanece incompleta.',
    ['CI → check-test-inventory','Descoberta de apenas duas famílias','Suites Node fora dos globs não entram no conjunto comparado'],
    ['Muda uma suite .mjs localizada fora de scripts/ci, edge-deploy, db-audit ou talkx.'],
    'CI pode aprovar o inventário sem executar testes existentes de segurança de processo, validação de catálogo, logs do validator Team Chat e classificador visual de QA. Ausência de wiring não demonstra que esses testes nunca foram executados manualmente.',
    [ev('scripts/ci/check-test-inventory.mjs',17,57,'Escopo de descoberta e allowlist'),ev('.github/workflows/ci.yml',83,92,'Globs executados'),ev('.github/workflows/db-guard.yml',203,205,'Outro glob Node')],
    ['Inventariar suites executáveis por todos os formatos usados e mapear a jobs/commands efetivos.','Manter exceções explícitas com dono, motivo e condição/prazo de revisão.','Identificar e decidir o wiring de scripts/lib/seguranca-processo.test.mjs, scripts/catalog/validate-plan.test.mjs, scripts/team-chat-db-validate.unit.mjs e scripts/qa/prova-visao-classificadores.unit.mjs.'],related=['TC-011','TC-012','OTH-011'],tasks=[task('E48','Extensão de inventário geral além de .test.ts/.test.sh; não reabrir a conclusão estreita só por esse gap.')],reopen_basis='Achado de wiring/descoberta, separado da qualidade dos testes de Team Chat e do defeito de parser de Catálogo já registrados.')

add(14,'Replay local reutiliza nome destrutivamente e tem exit0 após falhas de migrations','P2',
    'replay-local.sh começa removendo com docker rm -f um nome fixo, sem identificar se o container pertence ao run. O bootstrap não usa ON_ERROR_STOP e o loop continua depois de erros, permitindo que efeitos parciais de uma migration afetem as seguintes. A última operação é echo e não há saída não zero baseada em FALHA. A imagem tem tag, sem digest. A documentação corretamente declara que o replay histórico não ficou verde; não foi reclassificada como sucesso nesta análise.',
    ['Execução local documentada','docker rm -f nome fixo → criar container','Bootstrap + migrations sequenciais → contagem de falhas','Remoção + echo final → exit0'],
    ['Já existe container com o nome fixo, ou bootstrap/migration falha.','Automação usa o exit code ou interpreta cada falha como independente.'],
    'Pode remover recurso local que não criou e gerar resultado agregado sem distinguir falha raiz/cascata/efeitos parciais. A execução é local e mutante, não somente leitura, ainda que não toque o banco canônico.',
    [ev('scripts/db-audit/replay-local.sh',16,36,'Nome fixo, rm-f e bootstrap'),ev('scripts/db-audit/replay-local.sh',73,90,'Continua e não propaga FALHA'),ev('docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md',29,39,'Documento declara Não é verde')],
    ['Nome único e ownership label; remover somente container criado pelo run, com trap seguro.','Falhar explicitamente em setup indisponível e publicar status distinto quando houver falhas.','Fixar digest e declarar transação/efeitos parciais por arquivo, separando causa raiz e cascata.','Preservar a ressalva histórica de que o replay não equivale aos serviços Supabase completos.'])

add(15,'Três probes anteriores rotulam baseline fixo sem validar a fonte executada','P2',
    'Os probes transversal, other e volume aceitam checkout corrente/RECONCILIATION_REPO e carregam código dele, mas escrevem baseline_commit constante sem verificar HEAD ou hashes esperados antes da execução. Volume registra hashes observados, o que ajuda a análise posterior, mas não compara com um conjunto esperado. Transversal importa módulo de fonte antes dos mocks. A contagem network_requests:0 nesses relatórios é declarada, não derivada de um interceptador global. No código revisado, os doubles evitam requests nos caminhos exercitados; não foi observado request real.',
    ['README reproduction → RECONCILIATION_REPO','Leitura/import de módulos do checkout selecionado','Relatório baseline_commit constante e contadores declarados'],
    ['Outro checkout ou fonte modificada é usado para reproduzir.','O código modificado mantém a assertiva esperada ou introduz efeito antes dos mocks.'],
    'Resultado pode ser atribuído ao commit errado e a alegação de isolamento não é uma barreira contra fonte diferente. Não invalida automaticamente as observações históricas que possuem suas fontes preservadas.',
    [ev('reproduce/transversal/local-semantic-probes.mjs',1,38,'Root selecionável, import e baseline constante','previous_audit'),ev('reproduce/other/reproduce_findings.py',1,62,'Extração de código sem pin prévio','previous_audit'),ev('reproduce/volume/volume_offline_probe.mjs',1,25,'Root e baseline/hashes observados','previous_audit'),ev('reproduce/volume/volume_offline_probe.mjs',218,227,'Metadados declarados','previous_audit')],
    ['Verificar HEAD e hashes de todos os módulos executados antes do import, recusando divergência.','Separar hash esperado, observado e código adaptado pelo harness.','Instalar bloqueio de rede antes da carga do código e registrar tentativas observadas, sem tratar um literal como medição.','Os probes desta rodada possuem probe-source-pins.json e verificam seus 25 arquivos antes dos imports.'],limits=['Cross-module, Multiplix e Skins possuem proteções de proveniência mais fortes e não foram incluídos nesta falha.','Os probes antigos não foram executados novamente durante esta revisão.'])

add(16,'Guarda de exposição de erro não encontra respostas 500 presentes no repositório','P2',
    'acharExposicoes aplica regex por linha e procura status antes de .message no JSON manual. new Response(JSON.stringify({erro:error.message}), {status:500}) fica invisível porque a ordem é oposta; multiline também escapa. searchbox-budget-alert e webhook-diagnostic têm essa forma e ambos produzem zero achados no scanner offline. O helper compartilhado errorResponse sanitiza status>=500, portanto chamadas por ele não foram tratadas como vazamento.',
    ['CI → check-edge-error-exposure.unit.mjs → main com fontes reais','Scanner por linha e ordem restrita','Respostas manuais 500 não passam pelo helper sanitizante'],
    ['Endpoint retorna erro pela construção manual de Response.','Erro contém detalhe interno; endpoint é alcançável com a autorização que ele exige.'],
    'A frase nenhuma exposição em todos os edges pode ser emitida apesar de respostas que devolvem message crua. O exemplo searchbox exige cron secret; não foi alegado acesso anônimo nem vazamento já observado.',
    [ev('scripts/ci/check-edge-error-exposure.mjs',25,46,'Regex por linha e ordem status→message'),ev('scripts/ci/check-edge-error-exposure.mjs',66,74,'Veredito abrangente'),ev('scripts/ci/check-edge-error-exposure.unit.mjs',71,87,'Teste do scanner real e mutação estreita'),ev('supabase/functions/searchbox-budget-alert/index.ts',19,34,'Resposta manual após autenticação de cron'),ev('supabase/functions/webhook-diagnostic/index.ts',233,237,'Outro exemplo manual'),ev('supabase/functions/_shared/validation.ts',121,134,'Helper sanitiza >=500')],
    ['Normalizar respostas internas por helper que sanitiza e provar os handlers com erro sintético.','Se mantiver análise estática, cobrir AST/multiline/ordem dos argumentos e contexto de helper sanitizante.','Guard detecta os dois exemplos reais e mutações equivalentes; teste não assume que sua própria ausência de achados demonstra segurança global.'],['multiline_error_guard'],tasks=[task('E33','Proteção do helper permanece; reabrir somente a cobertura do guard e os produtores manuais de Response.','PARTIAL')])

old=json.loads((OLD/'FINDINGS.json').read_text());old=old.get('findings',[]) if isinstance(old,dict) else old
duplicate_ids=['TRA-007','TRA-008','TRA-009','TC-011','TC-012','TX02','OTH-010','OTH-011','OTH-012']
duplicates=[{'id':f['id'],'title':f['title'],'disposition':'Não recontado; preservado como achado anterior.','source':'FINDINGS.json','sha256':sha(OLD/'FINDINGS.json')} for f in old if f.get('id') in duplicate_ids]
result={'schema_version':1,'area':'infra','baseline_sha':HEAD,'mode':'read_only_source_review_and_offline_synthetic_probes','classification_note':'novo significa descoberta adicional; não implica regressão introduzida após a auditoria anterior.','previous_findings_compared':len(old),'findings':findings,'duplicates_not_recounted':duplicates}
(OUT/'findings.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

# Review levels are a manual ledger, never inferred from an rg hit alone.
semantic='''AGENTS.md
package.json
vercel.json
vite.config.ts
vitest.config.ts
vitest.contracts.config.ts
eslint.config.js
tsconfig.json
tsconfig.app.json
tsconfig.node.json
tsconfig.strict.json
tsconfig.e2e.json
playwright.config.ts
.github/workflows/ci.yml
.github/workflows/deploy-functions.yml
.github/workflows/e2e-logado.yml
.github/workflows/e2e-talkx.yml
.github/workflows/auto-update-pr-branch.yml
.github/workflows/branch-hygiene-audit.yml
.github/workflows/codeql.yml
.github/workflows/crm-sync-worker.yml
.github/workflows/settings-guard.yml
.github/workflows/supabase-sync.yml
.github/workflows/targeted-ledger-evidence.yml
.github/workflows/talkx-status-regen.yml
infrastructure/preview-egress-proxy/main.go
infrastructure/preview-egress-proxy/main_test.go
infrastructure/preview-egress-proxy/Dockerfile
infrastructure/preview-egress-proxy/docker-compose.yml
scripts/ci/check-test-inventory.mjs
scripts/ci/check-quarantine.mjs
scripts/ci/check-quarantine.unit.mjs
scripts/ci/audit-prod.mjs
scripts/ci/check-audit-pdf-determinism.mjs
scripts/ci/check-workflow-pins.mjs
scripts/ci/implicit-any-ratchet.mjs
scripts/ci/typecheck-ratchet.mjs
scripts/ci/lint-ratchet.mjs
scripts/ci/bundle-budget.mjs
scripts/ci/check-pr-workflow-secrets.mjs
scripts/ci/check-edge-error-exposure.mjs
scripts/ci/check-edge-error-exposure.unit.mjs
scripts/ci/deploy-functions-workflow.unit.mjs
scripts/ci/db-migrate-contratos.unit.mjs
scripts/ci/db-migrate-workflow.unit.mjs
scripts/ci/verify-ledger-statements.unit.mjs
scripts/ci/security-workflow.unit.mjs
scripts/ci/psql-safe.unit.mjs
scripts/lib/seguranca-processo.mjs
scripts/edge-deploy/redigir-log.mjs
scripts/edge-deploy/secrets-scope.mjs
scripts/edge-deploy/deploy-plan.mjs
scripts/edge-deploy/serialize-scope.mjs
scripts/edge-deploy/smoke-functions.mjs
scripts/db-audit/psql-safe.mjs
scripts/db-audit/psql-environment.mjs
scripts/db-audit/database-identity.mjs
scripts/db-audit/run-runtime-contract.mjs
scripts/db-audit/extrair-contratos-runtime.mjs
scripts/db-audit/generic-migration-runtime.sql
scripts/db-audit/dry-run-plan.mjs
scripts/db-audit/confirm-hash.mjs
scripts/db-audit/replay-local.sh
scripts/db-audit/docker-shim
scripts/db-audit/retry-disposable-postgres-test.sh
scripts/db-audit/verify-ledger-statements.mjs
scripts/db-audit/local-pg-proxy.mjs
scripts/db-audit/contracts/20260830170000.sql
scripts/db-audit/contracts/20260908180000.sql
scripts/db-audit/contracts/20260909200000.sql
scripts/db-audit/contracts/20260909210000.sql
scripts/db-audit/contracts/20260909230000.sql
scripts/db-audit/contracts/20260910100000.sql
scripts/db-audit/contracts/20260922220000.sql
scripts/db-tests/run-all.mjs
scripts/db-tests/01-security-grants.sql
scripts/db-tests/02-fsm-transitions.sql
scripts/db-tests/03-gamification-bounds.sql
scripts/db-tests/04-schema-contracts.sql
scripts/db-tests/05-rls-smoke.sql
scripts/qa/prova-orcamento-rate-limit.sh
scripts/qa/prova-visao-classificadores.unit.mjs
scripts/catalog/validate-plan.test.mjs
scripts/graphify/setup.sh
e2e/fixtures/e2e-contact.ts
e2e/fixtures/supabase-env.ts
e2e/fixtures/e2e-talkx.ts
e2e/conversation.spec.ts
e2e/messaging.spec.ts
e2e/quarantine.json
docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md'''.splitlines()
targeted='''.github/workflows/db-migrate.yml
.github/workflows/db-live-guard.yml
.github/workflows/types-sync.yml
.github/workflows/db-guard.yml
scripts/db-audit/psql-environment.test.mjs
scripts/db-audit/check-migration-drift.mjs
scripts/db-audit/register-migration.mjs
scripts/db-audit/manifest-lib.mjs
scripts/edge-deploy/manifest-lib.mjs
scripts/edge-deploy/stable-inventory.mjs
scripts/edge-deploy/talkx-preflight.mjs
e2e/reactions.spec.ts
e2e/auth.setup.ts
e2e/catalog.spec.ts
supabase/functions/_shared/validation.ts
supabase/functions/searchbox-budget-alert/index.ts
supabase/functions/webhook-diagnostic/index.ts
supabase/migrations/20260829020000_mcp_exec_functions_harden.sql
scripts/db-audit/contracts/20260831120000.sql
scripts/db-audit/contracts/20260831150000.sql
scripts/db-audit/contracts/20260908220000.sql
scripts/db-audit/contracts/20260909120000.sql
scripts/db-audit/contracts/20260909180000.sql'''.splitlines()
tracked=subprocess.check_output(['git','-C',str(ROOT),'ls-files'],text=True).splitlines()
rootconfig={p for p in tracked if '/' not in p and (p.endswith(('.json','.toml','.yaml','.yml')) or p.startswith(('vite.','vitest.','playwright.','eslint.','tsconfig.','.env','.sonar')))}
scope={p for p in tracked if p.startswith(('.github/','infrastructure/','scripts/','e2e/','tests/contracts/','src/test/','.husky/'))}|rootconfig|set(semantic)|set(targeted)
scope={p for p in scope if (ROOT/p).is_file()}
sem={p for p in semantic if p in scope};tar={p for p in targeted if p in scope}-sem
def layer(p):
    if p.startswith('.github/workflows/'):return 'workflows'
    if p.startswith('scripts/'):return '/'.join(p.split('/')[:2])
    if p.startswith('e2e/'):return 'e2e'
    if p.startswith('tests/contracts/'):return 'tests/contracts'
    if p.startswith('infrastructure/'):return 'infrastructure'
    if p.startswith('src/test/'):return 'src/test'
    return 'config_and_support'
inventory=[];env_contracts={}
for p in sorted(scope):
    f=ROOT/p;raw=f.read_bytes();binary=b'\0' in raw
    text=raw.decode('utf8',errors='replace') if not binary else ''
    level='semantic' if p in sem else 'targeted' if p in tar else 'structural'
    envs=sorted(set(re.findall(r'(?:process\.env\.|import\.meta\.env\.)([A-Z][A-Z0-9_]*)',text)+re.findall(r'Deno\.env\.get\([\'"]([A-Z][A-Z0-9_]*)',text)+re.findall(r'\b(?:secrets|vars)\.([A-Z][A-Z0-9_]*)',text)))
    envfile=p.startswith('.env')
    if envfile: envs=sorted(set(re.findall(r'^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=',text,re.M)))
    if envs: env_contracts[p]=envs
    inventory.append(dict(path=p,sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),lines=len(text.splitlines()) if not binary else None,layer=layer(p),review_level=level,binary=binary,review_basis={'semantic':'Fluxo/condições/efeitos e consumidores relevantes lidos; não significa execução.','targeted':'Trechos concretos examinados e associados ao fluxo; restante não certificado.','structural':'Inventário e sinais lexicais; sem revisão de comportamento completo.'}[level],lexical_signals={} if binary or envfile else dict(test_declarations=len(re.findall(r'\b(?:test|it)\s*\(',text)),network_markers=len(re.findall(r'\b(?:fetch|curl|wget|https?\.request|http\.Client)\b',text)),write_markers=len(re.findall(r'\b(?:writeFile|writeFileSync|appendFile|appendFileSync|DELETE|INSERT|UPDATE|docker rm|secrets set|db push|functions deploy)\b',text)),permissive_error_markers=len(re.findall(r'continue-on-error|\|\|\s*true|catch\s*\{\s*\}',text)))))

node_tests=[p for p in tracked if p.startswith('scripts/') and re.search(r'\.(unit|test)\.mjs$',p)]
wfiles=[p for p in tracked if p.startswith('.github/workflows/') and p.endswith('.yml')]
workflowtext='\n'.join((ROOT/p).read_text() for p in wfiles)
def selected_node(p):
    return ((p.startswith(('scripts/ci/','scripts/edge-deploy/','scripts/talkx/')) and p.endswith('.unit.mjs')) or (p.startswith('scripts/db-audit/') and p.endswith('.test.mjs')) or p in workflowtext)
unwired=[p for p in node_tests if not selected_node(p)]
sh_tests=[p for p in tracked if p.startswith('scripts/db-audit/') and p.endswith('.test.sh')]
allowlist=re.findall(r"  '(scripts/db-audit/[^']+\.test\.sh)'",(ROOT/'scripts/ci/check-test-inventory.mjs').read_text())
migrations=[p for p in tracked if re.fullmatch(r'supabase/migrations/\d{14}_.+\.sql',p)]
contracts=[p for p in tracked if re.fullmatch(r'scripts/db-audit/contracts/\d{14}\.sql',p)]
contractversions={Path(p).stem for p in contracts}
missingcontracts=[p for p in migrations if Path(p).name.split('_')[0] not in contractversions]
counts=collections.Counter(x['review_level'] for x in inventory)
bylayer={}
for x in inventory:
    d=bylayer.setdefault(x['layer'],collections.Counter());d[x['review_level']]+=1;d['total']+=1
external=[]
for p in ['FINDINGS.json','tasks/P006.json','reproduce/README.md','reproduce/transversal/local-semantic-probes.mjs','reproduce/other/reproduce_findings.py','reproduce/volume/volume_offline_probe.mjs','reproduce/cross-module/reproduce_cross_module.mjs','reproduce/multiplix/reproduce_multiplix.mjs','reproduce/skins/skins_probe.mjs']:
    f=OLD/p
    if f.exists():external.append(dict(path=p,absolute_path=str(f),sha256=sha(f),review_level='semantic' if p.startswith(('FINDINGS','tasks/','reproduce/transversal','reproduce/other','reproduce/volume')) or p=='reproduce/README.md' else 'targeted'))
gaps=[
 'A maioria dos 84 contratos SQL em shell recebeu inventário estrutural; execução e assertions específicas não foram revisadas integralmente nesta área. Database/Providers cobrem partes desses consumidores, sem herdar automaticamente cobertura semântica.',
 'Db-migrate com 1515 linhas, db-live-guard, db-guard e types-sync foram revisados por fluxos/trechos prioritários, não linha a linha integralmente.',
 'Scripts não citados como semantic/targeted permanecem estruturais, inclusive collectors, exporters, instaladores, QA visual e parte das unidades de CI.',
 '61 arquivos tests/contracts e a maior parte dos specs E2E foram inventariados, não executados nem integralmente auditados aqui.',
 'Nenhum lint/type/build completo foi executado; dependências do projeto não foram instaladas para esse fim. Os probes não são substituto dessas suites.',
 'Nenhum binário Go/PostgreSQL/Docker nem browsers foram iniciados. Proxy teve revisão de fonte, não homologação de rede, TLS real ou IPv6 em ambiente real.',
 'Estado atual de Vercel/VPS, secrets configurados, regras GitHub, agendamentos e deploy remoto não consultados. Configuração versionada não prova configuração remota.',
 'Sinais lexicais contam candidatos, não funções exercitadas, efeitos confirmados ou cobertura de linhas. Environment inventory contém nomes e não verifica disponibilidade/valores.',
 'Probes de reprodução de outras áreas foram inspecionados seletivamente; auditoria global do manifesto/hash e dos planos fica com root.'
]
coverage=dict(schema_version=1,area='infra',baseline_sha=HEAD,source_root=str(ROOT),counts=dict(total=len(inventory),**counts),layers=bylayer,scope='Todos os paths rastreados em .github, infrastructure, scripts, e2e, tests/contracts, src/test, hooks/configs relevantes; evidências cruzadas acrescentadas explicitamente.',definitions={'semantic':'Leitura de fluxo, erro e efeito no arquivo; nenhuma presunção de execução.','targeted':'Leitura parcial dirigida a chamadas/condições concretas.','structural':'Path/hash/extensão/sinais lexicais; não prova comportamento.'},inventory=inventory,environment_names_only=env_contracts,test_wiring=dict(workflows=len(wfiles),edge_test_ts=len([p for p in tracked if p.startswith('supabase/functions/') and p.endswith('.test.ts')]),node_unit_test_files=len(node_tests),node_without_workflow_selection=unwired,db_shell_tests=len(sh_tests),shell_allowlist=allowlist,shell_allowlist_not_mentioned_in_workflow=[p for p in allowlist if p not in workflowtext],contracts_vitest=len([p for p in tracked if p.startswith('tests/contracts/') and p.endswith('.ts')])),runtime_contract_inventory=dict(migration_files=len(migrations),migration_distinct_versions=len({Path(p).name.split('_')[0] for p in migrations}),contract_files=len(contracts),missing_dedicated_contract_count=len(missingcontracts),missing_dedicated_contract_paths=missingcontracts,shell_first_token_contracts=[p for p in contracts if (ROOT/p).read_text().lstrip().startswith('RUNTIME=$(')],note='Presença/ausência de arquivo de contrato; não representa elegibilidade de apply após preflight.'),external_audit_artifacts=external,remaining_gaps=gaps)
(OUT/'coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2)+'\n')

meta=dict(baseline_sha=HEAD,observed_command='node --test scripts/ci/db-migrate-contratos.unit.mjs scripts/ci/db-migrate-workflow.unit.mjs scripts/ci/verify-ledger-statements.unit.mjs',cwd=str(ROOT),exit_code=0,tests=15,passed=15,failed=0,skipped=0,interpretation='Testes de metacontrato/helper passaram; não exercitam SQL do runner nem heredoc pós-apply. Não comprovam fluxo DB Migrate.',network_requests=0,database_statements=0)
(OUT/'meta-tests.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')

sev=collections.Counter(f['severity'] for f in findings)
md=['# Reauditoria de infraestrutura, CI/CD, scripts e provas', '', f'Baseline: `{HEAD}`. Escopo: leitura de fonte e documentação com probes sintéticos offline. Comparação: {len(old)} achados anteriores e tarefas P006 preservadas.', '',
f'## Resultado: {len(findings)} mecanismos adicionais ({sev["P1"]} P1, {sev["P2"]} P2)', '',
'Os caminhos mais graves são o ensaio de deploy que ainda escreve secrets, a publicação de artifact após falha da remoção de secrets, o DSN endurecido que é sobrescrito, os contratos Bash entregues a psql, e mutações E2E fora do dado de teste. Os probes demonstram defeitos no código local; não houve deploy, SQL, login, envio de mensagem, consulta de configuração real ou teste de produção.', '',
'O runner de runtime tem 12 arquivos de contrato, todos iniciados por Bash. Existem 779 arquivos/versões distintas de migrations e 767 não têm arquivo dedicado. Esses números medem arquivos e seleção do runner quando ele é alcançado, sem promover todas as versões a alvos autorizados pelo preflight. A falha SQL do ledger é posterior e atualmente fica atrás desse bloqueio; não constitui prova de apply ocorrido.', '',
'## Inventário de achados', '', '| ID | Prioridade | Achado | Relação com auditoria anterior |', '|---|---|---|---|']
for f in findings:md.append(f'| {f["id"]} | {f["severity"]} | {f["title"]} | {f["classification"]}; '+(', '.join(f['related_previous_findings'])+' como contexto' if f['related_previous_findings'] else 'sem duplicação identificada')+' |')
md += ['', '## Evidência executada e limites', '',
'`offline-probes.json` contém 9 resultados sintéticos. Os executáveis usados foram módulos Node revisados, uma função TS extraída e doubles de fetch. A rede de produto foi bloqueada nos probes; nenhuma instrução SQL foi encaminhada a banco. `probe-source-pins.json` fixa 25 entradas e o probe exige o HEAD e os hashes antes de carregar o código.', '',
'`meta-tests.json` registra 15 testes existentes com sucesso. Eles demonstram que a suite do próprio repositório aceita o estado atual dos arquivos de runtime e do SQL pós-apply. Não demonstram que psql consegue executá-los. Essa diferença é o ponto de R2-INF-004/005.', '',
'## Cobertura real desta área', '', f'Foram inventariados {len(inventory)} arquivos: {counts["semantic"]} com revisão semântica de fluxo, {counts["targeted"]} com revisão dirigida e {counts["structural"]} com revisão estrutural. O arquivo coverage.json discrimina cada path, SHA256 e nível. Um hit de rg ou um hash não foi promovido a leitura semântica.', '', '| Camada | Semântica | Dirigida | Estrutural | Total |', '|---|---:|---:|---:|---:|']
for layername,d in sorted(bylayer.items()):md.append(f'| {layername} | {d.get("semantic",0)} | {d.get("targeted",0)} | {d.get("structural",0)} | {d["total"]} |')
md += ['', f'Wiring: {len(wfiles)} workflows, 72 suites Edge .test.ts, 87 suites Node .unit/.test.mjs, 84 contratos .test.sh e 61 arquivos de contracts Vitest. Os quatro Node não selecionados estão no JSON. A allowlist de shell possui 9 entradas. Estes totais são inventário, não quantidade de cenários nem cobertura de requisitos.', '',
'O proxy de preview foi lido em conjunto com testes, Dockerfile e compose. Há controles explícitos de DNS/IP, autenticação HMAC, replay, limites e bind local. Não foi formulado novo achado confirmado nessa camada. Vercel/Vite/Playwright/manifestos foram inspecionados como configuração versionada; não houve consulta ao serviço/VPS.', '',
'### Lacunas que permanecem', '']+[f'- {g}' for g in gaps]+['', '## Reconciliação de tarefas P006', '',
'E65 deve sair de DONE_VERIFIED apenas para o subcontrato de integração SQL pós-apply. E62 já era PARTIAL e agora inclui falha funcional na extração, além do tamanho do YAML. E29/E57/E58/E33/E74 precisam refletir os contratos locais que não estão completos. E48 mantém a conclusão estreita de inventário .test.ts/.test.sh; a expansão a outras suites é trabalho adicional. E63/E64/E66 não são automaticamente reabertas: seus parsers, composição de confirmação e parâmetros de timeout/retry podem estar corretos isoladamente, enquanto a cadeia maior está bloqueada.', '',
'A identificação exata e o assessment anterior de cada tarefa afetada estão em findings.json. Nenhum status do baseline anterior foi reescrito por esta área.', '',
'## Achados detalhados', '']
for f in findings:
    md += [f'### {f["id"]} — {f["title"]}', '', f'**{f["severity"]} · {f["classification"]}.** {f["description"]}', '', '**Fluxo consumidor:** '+' → '.join(f['consumer_chain'])+'.', '', '**Precondições:** '+' '.join(f['preconditions']), '', '**Efeito:** '+f['effect'], '', '**Evidência:**', '']
    for e in f['evidence']:
        root=ROOT if e['origin']=='source' else OLD
        md.append(f'- `{e["path"]}:{e["line_start"]}–{e["line_end"]}` — {e["reason"]}. SHA256 `{e["sha256"]}`. Origem: {e["origin"]}.')
    md += ['', '**Critérios de aceite:**', '']+[f'- {a}' for a in f['acceptance']]
    md += ['', '**Comparação:** '+f['novelty_basis']]
    if f['probe_ids']:md += ['', '**Probe:** '+', '.join(f['probe_ids'])+'.']
    if f['affected_tasks']:
        md += ['', '**Tarefas:** '+ '; '.join(f'P006 {t["task_id"]}: {t["previous_status"]} → {t["proposed_status"]}; {t["affected_subcontract"]}' for t in f['affected_tasks'])]
    if len(f['limitations'])>1:md += ['', '**Limite específico:** '+' '.join(f['limitations'][1:])]
    md += ['']
md += ['## Duplicações evitadas', '', 'Foram preservados sem nova contagem: '+', '.join(duplicate_ids)+'. Os defeitos de E2E/QA e de ratchets relatados acima têm caminhos e critérios próprios, explicitados em cada registro.', '',
'## Artefatos', '', '- findings.json: mecanismos, severidade, relações, linhas/SHA e critérios de aceite.','- coverage.json: ledger de revisão por arquivo, wiring, nomes de variáveis e lacunas.','- probe.mjs / probe-source-pins.json / offline-probes.json: reprodução sintética com fonte pinada.','- meta-tests.json: resultado observado dos 15 metatestes existentes.', '']
(OUT/'report.md').write_text('\n'.join(md))
print(json.dumps({'findings':len(findings),'severity':dict(sev),'coverage':dict(total=len(inventory),**counts),'unwired_node':unwired},ensure_ascii=False))
