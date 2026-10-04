# Reauditoria de infraestrutura, CI/CD, scripts e provas

Baseline: `da307ba5626dce892f0b37cb6762463f55d14a96`. Escopo: leitura de fonte e documentação com probes sintéticos offline. Comparação: 104 achados anteriores e tarefas P006 preservadas.

## Resultado: 25 mecanismos adicionais (8 P1, 17 P2)

Os caminhos mais graves são o ensaio de deploy que ainda escreve secrets, a publicação de artifact após falha da remoção de secrets, o DSN endurecido que é sobrescrito, os contratos Bash entregues a psql, e mutações E2E fora do dado de teste. Os probes demonstram defeitos no código local; não houve deploy, SQL, login, envio de mensagem, consulta de configuração real ou teste de produção.

O runner de runtime tem 12 arquivos de contrato, todos iniciados por Bash. Existem 779 arquivos/versões distintas de migrations e 767 não têm arquivo dedicado. Esses números medem arquivos e seleção do runner quando ele é alcançado, sem promover todas as versões a alvos autorizados pelo preflight. A falha SQL do ledger é posterior e atualmente fica atrás desse bloqueio; não constitui prova de apply ocorrido.

## Inventário de achados

| ID | Prioridade | Achado | Relação com auditoria anterior |
|---|---|---|---|
| R2-INF-001 | P1 | O dry_run de Edge Functions pode reescrever secrets do projeto | novo; sem duplicação identificada |
| R2-INF-002 | P1 | Artifact de deploy pode ser publicado depois de falhar a remoção de secrets | novo; sem duplicação identificada |
| R2-INF-003 | P1 | DB Migrate sobrescreve o DSN endurecido e perde verify-full no transporte | novo; sem duplicação identificada |
| R2-INF-004 | P1 | Os 12 contratos de runtime são Bash enviados como SQL; 767 versões não têm arquivo | novo; TRA-009 como contexto |
| R2-INF-005 | P1 | Consulta pós-apply do ledger contém comentários Bash inválidos em SQL | novo; sem duplicação identificada |
| R2-INF-006 | P1 | Limpeza de E2E apaga todas as reações do usuário logado | novo; sem duplicação identificada |
| R2-INF-007 | P1 | E2E de mensagens envia para o primeiro contato sem validar a fixture | novo; sem duplicação identificada |
| R2-INF-008 | P2 | Ratchets de TypeScript tratam falha do compilador como zero erros | novo; TRA-008 como contexto |
| R2-INF-009 | P2 | Gate de dependências aceita erro de registry como relatório sem vulnerabilidade | novo; sem duplicação identificada |
| R2-INF-010 | P2 | Suite scripts/db-tests não entende a RPC e pode passar com zero assertivas | novo; TC-011, TC-012 como contexto |
| R2-INF-011 | P2 | Prova de IA coloca senha/token em argv e deixa sessão Auth no arquivo de saída | novo; sem duplicação identificada |
| R2-INF-012 | P2 | Prova de orçamento/rate limit termina com ok sem verificar o comportamento | novo; sem duplicação identificada |
| R2-INF-013 | P2 | Inventário de testes ignora quatro suites Node fora dos globs de CI | novo; TC-011, TC-012, OTH-011 como contexto |
| R2-INF-014 | P2 | Replay local reutiliza nome destrutivamente e tem exit0 após falhas de migrations | novo; sem duplicação identificada |
| R2-INF-015 | P2 | Três probes anteriores rotulam baseline fixo sem validar a fonte executada | novo; sem duplicação identificada |
| R2-INF-016 | P2 | Guarda de exposição de erro não encontra respostas 500 presentes no repositório | novo; sem duplicação identificada |
| R2-INF-017 | P2 | Atestação de Edge aceita inventário anterior sem prova de no-op do deploy | novo; sem duplicação identificada |
| R2-INF-018 | P2 | KPI semanal limita runs a 100 e publica ranking de jobs sem consultá-los | novo; sem duplicação identificada |
| R2-INF-019 | P2 | Runner de mutação conta falha de infraestrutura como mutante morto | novo; sem duplicação identificada |
| R2-INF-020 | P2 | Prova dos classificadores pode aprovar consumo sem comprovar seus registros | novo; sem duplicação identificada |
| R2-INF-021 | P2 | Falha dos fixtures E2E é omitida do veredito e do alerta do DB Live Guard | novo; sem duplicação identificada |
| R2-INF-022 | P1 | Classificadores visuais leem mídia privada com service role sem autorizar o objeto do usuário | novo; lote IA delegado |
| R2-INF-023 | P2 | Revalidação de contexto fora da RPC deixa análise antiga substituir uma projeção concorrente | novo; lote IA delegado |
| R2-INF-024 | P2 | Sugestões com JSON inválido para o contrato chegam à interface ou viram frases fixas sem sinal de degradação | novo; lote IA delegado |
| R2-INF-025 | P2 | Reescrita atrasada substitui edição mais nova do mesmo rascunho | novo; lote IA delegado |

## Evidência executada e limites

`offline-probes.json` contém 9 resultados sintéticos. Os executáveis usados foram módulos Node revisados, uma função TS extraída e doubles de fetch. A rede de produto foi bloqueada nos probes; nenhuma instrução SQL foi encaminhada a banco. `probe-source-pins.json` fixa 25 entradas e o probe exige o HEAD e os hashes antes de carregar o código.

`meta-tests.json` registra 15 testes existentes com sucesso. Eles demonstram que a suite do próprio repositório aceita o estado atual dos arquivos de runtime e do SQL pós-apply. Não demonstram que psql consegue executá-los. Essa diferença é o ponto de R2-INF-004/005.

## Cobertura real desta área

Foram inventariados 557 arquivos: 200 com revisão semântica, 35 com revisão dirigida e 322 com revisão estrutural. A segunda passagem registra 93 arquivos com faixas, SHA256, consumidor, efeitos e avaliação própria; 91 foram lidos integralmente e dois arquivos de ambiente apenas por nomes. Esses números são leitura de fonte, não cobertura de execução.

| Camada | Semântica | Dirigida | Estrutural | Total |
|---|---:|---:|---:|---:|
| ai_delegated | 12 | 0 | 0 | 12 |
| ai_support | 6 | 22 | 0 | 28 |
| config_and_support | 23 | 6 | 3 | 32 |
| e2e | 6 | 3 | 71 | 80 |
| infrastructure | 5 | 0 | 0 | 5 |
| scripts/catalog | 2 | 0 | 0 | 2 |
| scripts/ci | 30 | 0 | 42 | 72 |
| scripts/db-audit | 63 | 1 | 119 | 183 |
| scripts/db-tests | 6 | 0 | 0 | 6 |
| scripts/edge-deploy | 16 | 0 | 16 | 32 |
| scripts/graphify | 1 | 0 | 0 | 1 |
| scripts/lib | 1 | 0 | 1 | 2 |
| scripts/mutation | 1 | 0 | 1 | 2 |
| scripts/qa | 6 | 0 | 1 | 7 |
| scripts/talkx | 2 | 0 | 1 | 3 |
| scripts/team-chat-db-validate.mjs | 1 | 0 | 0 | 1 |
| scripts/team-chat-db-validate.unit.mjs | 0 | 0 | 1 | 1 |
| scripts/ui-audit | 3 | 0 | 0 | 3 |
| src/test | 0 | 0 | 8 | 8 |
| tests/contracts | 0 | 3 | 58 | 61 |
| workflows | 16 | 0 | 0 | 16 |

Wiring preservado: 16 workflows, 72 suites Edge .test.ts, 87 suites Node .unit/.test.mjs, 84 contratos .test.sh e 61 arquivos de contracts Vitest. A descoberta e os globs não comprovam cenários executados.

Os quatro workflows extensos, todos os executáveis menores no escopo e os SQL de apoio foram concluídos nesta passagem. O proxy tem revisão integral da fonte, testes, Dockerfile, compose e go.mod; nenhum achado adicional foi confirmado nesse componente.

### Lacunas que permanecem

- A maioria dos 84 contratos .test.sh e das suites Node repetitivas permanece estrutural nesta área; arquivos invocados foram mapeados, sem inferir assertions integralmente auditadas ou execuções.
- 61 arquivos tests/contracts, 8 arquivos src/test e a maior parte dos specs E2E permanecem estruturais ou dirigidos; não foram executados nesta auditoria.
- Baselines JSON extensos, lockfiles, fixtures e documentação auxiliar não foram automaticamente promovidos a leitura semântica por terem consumidores revisados.
- Os dois arquivos de ambiente foram inspecionados apenas por nomes de variáveis e linhas de declaração; valores e disponibilidade real não foram lidos.
- Nenhum lint/type/build completo foi executado; os probes específicos não substituem essas suites.
- Nenhum binário Go/PostgreSQL/Docker nem browser foi iniciado; proxy foi revisto na fonte, sem homologação de rede/TLS/IPv6.
- Estado real de Vercel/VPS, secrets configurados, regras GitHub, agendamentos e deploy remoto não foi consultado.
- Formato interno comprimido/serializado de artifacts reais de Playwright não foi inspecionado; não se atribuiu uma falha nova de redator a esse formato sem prova concreta.
- Sinais lexicais e hashes são inventário, não cobertura de execução. Revisão dos probes de outras áreas foi seletiva; governança global permanece com root.

## Reconciliação de tarefas P006

E65 deve sair de DONE_VERIFIED apenas para o subcontrato de integração SQL pós-apply. E62 já era PARTIAL e agora inclui falha funcional na extração, além do tamanho do YAML. E29/E57/E58/E33/E74 precisam refletir os contratos locais que não estão completos. E48 mantém a conclusão estreita de inventário .test.ts/.test.sh; a expansão a outras suites é trabalho adicional. E63/E64/E66 não são automaticamente reabertas: seus parsers, composição de confirmação e parâmetros de timeout/retry podem estar corretos isoladamente, enquanto a cadeia maior está bloqueada.

A identificação exata e o assessment anterior de cada tarefa afetada estão em findings.json. Nenhum status do baseline anterior foi reescrito por esta área.

## Achados detalhados

### R2-INF-001 — O dry_run de Edge Functions pode reescrever secrets do projeto

**P1 · novo.** O input promete ensaio sem publicação, mas o passo Configurar secrets nas edges não depende de dry_run. A decisão reescrever fica true com rotação explícita, nomes ausentes ou falha na listagem remota. O primeiro bloqueio por dry_run só aparece no deploy, depois de secrets set.

**Fluxo consumidor:** workflow_dispatch dry_run=true → .github/workflows/deploy-functions.yml → decisoes_secrets → secrets-scope.mjs → reescrever=true → Configurar secrets nas edges → supabase secrets set.

**Precondições:** Dispatch passa pelas validações anteriores e possui credenciais válidas. Ao menos um secret aplicável está disponível e REESCREVER=true.

**Efeito:** Um ensaio autorizado como leitura pode alterar configuração usada por funções já publicadas, mesmo sem novo deploy.

**Evidência:**

- `.github/workflows/deploy-functions.yml:44–48` — Promessa do input. SHA256 `e863384f47250579a99fe17e880a533b0811ed2683497680f1ecde1b01e36686`. Origem: source.
- `.github/workflows/deploy-functions.yml:188–230` — Decisão e primeira escrita sem if de dry_run. SHA256 `e863384f47250579a99fe17e880a533b0811ed2683497680f1ecde1b01e36686`. Origem: source.
- `.github/workflows/deploy-functions.yml:283–338` — Demais escritas de secrets. SHA256 `e863384f47250579a99fe17e880a533b0811ed2683497680f1ecde1b01e36686`. Origem: source.
- `.github/workflows/deploy-functions.yml:362–363` — Bloqueio só no deploy. SHA256 `e863384f47250579a99fe17e880a533b0811ed2683497680f1ecde1b01e36686`. Origem: source.
- `scripts/edge-deploy/secrets-scope.mjs:43–82` — Fallback e rotação permitem reescrita. SHA256 `3950de5c8efee1815be60e17bb8b46c7eaab6dd4121892c72525ed6ddcdef9a2`. Origem: source.

**Critérios de aceite:**

- Bloquear cada mutação remota por dry_run=false antes de invocar a CLI.
- Prova com CLI falsa registra zero comandos mutantes em dry_run nas condições rotate, secret ausente e listagem indisponível.
- Plano de ensaio informa a decisão e permanece disponível sem alterar configuração.

**Comparação:** Mecanismo não descrito nos 104 achados anteriores.

**Probe:** dry_run_secret_decisions.

**Tarefas:** P006 E57: IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE → PARTIAL; Ensaio deve impedir secrets set, além do deploy.; P006 E58: IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE → PARTIAL; Decisão de reescrita precisa respeitar o modo de ensaio do chamador.

### R2-INF-002 — Artifact de deploy pode ser publicado depois de falhar a remoção de secrets

**P1 · novo.** A remoção de secrets e o upload usam independentemente always() && inputs.dry_run != true. A etapa de remoção não tem id nem há condição que exija seu sucesso. Se a leitura ou gravação do redator falhar, o diretório ainda é enviado com o log original.

**Fluxo consumidor:** Deploy → deploy-output.log → redigir-log.mjs altera o arquivo no lugar → upload-artifact always() envia edge-deployment-evidence.

**Precondições:** Existe log bruto contendo credencial ou URL sensível. A remoção de secrets falha antes de terminar a gravação do arquivo limpo.

**Efeito:** Artifact pode reter credencial fora da proteção de mascaramento do log do Actions. Trata-se de caminho condicional de exposição, sem evidência de incidente já ocorrido.

**Evidência:**

- `.github/workflows/deploy-functions.yml:486–505` — Upload independe de sucesso do redator. SHA256 `e863384f47250579a99fe17e880a533b0811ed2683497680f1ecde1b01e36686`. Origem: source.
- `scripts/edge-deploy/redigir-log.mjs:45–85` — Leitura/gravação e possíveis erros. SHA256 `35669bfe5eb17f0e53200a4729ae999a02ea464b6a9c3481bd9fd32a09347d1a`. Origem: source.

**Critérios de aceite:**

- Dar id ao redator e só publicar saída cujo processo terminou com sucesso.
- Escrever versão limpa em diretório separado e impedir que o artifact inclua o bruto.
- Injetar erro de leitura/gravação e verificar que nenhum artifact bruto é selecionado.

**Comparação:** Mecanismo não descrito nos 104 achados anteriores.

**Tarefas:** P006 E74: IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE → PARTIAL; O contrato de remover credenciais precisa cobrir falha do redator; a presença do script não fecha a cadeia.

### R2-INF-003 — DB Migrate sobrescreve o DSN endurecido e perde verify-full no transporte

**P1 · novo.** A validação inicial aceita um DSN sem parâmetros TLS, acrescenta verify-full/CA e o exporta por GITHUB_ENV. Outros 20 passos voltam a declarar DESTINO_URL a partir do secret bruto. withPsqlEnvironment remove todos os PG* herdados e só recompõe os parâmetros presentes no DSN recebido; PGSSLMODE exportado não corrige essa sobrescrita. Há 21 declarações do secret no workflow contando a validação inicial.

**Fluxo consumidor:** Exigir credencial → endurecerDestinoTls → GITHUB_ENV → Preflight/runtime/validações → env DESTINO_URL bruto → psql-safe ou outro chamador → withPsqlEnvironment → libpq.

**Precondições:** O secret contém DSN sem sslmode/sslrootcert, forma aceita pela validação inicial. Um passo posterior redeclara o secret bruto e usa o transporte psql.

**Efeito:** A verificação de certificado/hostname prometida pelo workflow deixa de ser imposta nessas conexões. O apply do Supabase CLI usa env.DESTINO_URL normalizado e foi distinguido dos passos afetados.

**Evidência:**

- `.github/workflows/db-migrate.yml:118–170` — Exportação endurecida e sobrescrita no preflight. SHA256 `79cfd806819412dc1d0a83312a1cd2b2b944070078365c16f194aee8d19a41e5`. Origem: source.
- `.github/workflows/db-migrate.yml:235–241` — Reintrodução do DSN bruto. SHA256 `79cfd806819412dc1d0a83312a1cd2b2b944070078365c16f194aee8d19a41e5`. Origem: source.
- `.github/workflows/db-migrate.yml:891–917` — CLI usa DSN endurecido; ledger volta ao bruto. SHA256 `79cfd806819412dc1d0a83312a1cd2b2b944070078365c16f194aee8d19a41e5`. Origem: source.
- `scripts/db-audit/database-identity.mjs:164–200` — Ausência de parâmetros aceita e normalizada. SHA256 `08dbca35be2b379bab6df089f4a08241ea556e48a66c02408fb979c48788dded`. Origem: source.
- `scripts/db-audit/psql-environment.mjs:77–116` — PG* herdado descartado; URI é a fonte efetiva. SHA256 `31b08abff2637b7667da21ea86e1502fd27d9dab090bb8cb43bbc82d99349e68`. Origem: source.

**Critérios de aceite:**

- Usar a mesma conexão normalizada em todos os consumidores após validação.
- Teste da cadeia passa DSN sem parâmetros TLS e observa PGSSLMODE=verify-full e CA correta em cada processo filho.
- Erros omitem DSN/senha e não aceitam rebaixamento explícito.

**Comparação:** Mecanismo não descrito nos 104 achados anteriores.

**Probe:** tls_raw_override.

**Tarefas:** P006 E29: IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE → PARTIAL; Endurecimento existe, mas não chega a todos os processos filhos do workflow.

### R2-INF-004 — Os 12 contratos de runtime são Bash enviados como SQL; 767 versões não têm arquivo

**P1 · novo.** A extração preservou o corpo inteiro do case, inclusive RUNTIME=$(node ...), delimitadores shell e, no último arquivo, o ramo genérico. run-runtime-contract.mjs lê esse texto e o passa a psql-safe -c como se fosse SQL. Todos os 12 arquivos começam por RUNTIME=$(. Para as outras 767 versões de migration há ausência de arquivo, recusada antes de qualquer fallback. Isso descreve os contratos versionados e o comportamento do runner quando alcançado; não afirma que todas as 779 versões satisfazem o preflight de seleção.

**Fluxo consumidor:** Dispatch com alvo que passa identidade/preflight/paridade → Provar estado runtime antes do push → run-runtime-contract.mjs → lerContrato → psql-safe -c <corpo Bash> ou erro de arquivo ausente.

**Precondições:** O fluxo alcança Provar estado runtime antes do push. Alvo corresponde a um dos 12 arquivos extraídos ou a uma versão sem contrato dedicado.

**Efeito:** A rota não produz a prova JSON de runtime: nos 12 contratos, o texto é de linguagem incompatível com psql; nos demais, o runner encerra com código 2. O compare de hash e as verificações posteriores não tornam o fluxo executável.

**Evidência:**

- `scripts/db-audit/run-runtime-contract.mjs:22–57` — Arquivo é enviado inteiro via -c. SHA256 `05cdd5802c16932ce6c4166b90cdebbc5d16b929ac2c3e152125a03c5ada73b1`. Origem: source.
- `scripts/db-audit/contracts/20260830170000.sql:1–20` — Exemplo de wrapper Bash. SHA256 `2c9ce0e23b6a88392e1f9159c4ec97c18b54c11fff923bcda060458d7d9301e1`. Origem: source.
- `scripts/db-audit/contracts/20260922220000.sql:1–14` — Ramo genérico e delimitadores presos no arquivo. SHA256 `ea301f0bec2c58acfab248ba23bcac26a51f106f031f0ad1b07d1c8b8f1dd3ab`. Origem: source.
- `.github/workflows/db-migrate.yml:238–259` — Consumidor exige JSON comum. SHA256 `79cfd806819412dc1d0a83312a1cd2b2b944070078365c16f194aee8d19a41e5`. Origem: source.
- `scripts/db-audit/extrair-contratos-runtime.mjs:33–50` — Extração de texto shell com extensão .sql. SHA256 `d853db33c22be5d7f9138ded6e42550ae8a8ba5fd19213fc6c39ab138ee87ba1`. Origem: source.
- `scripts/ci/db-migrate-contratos.unit.mjs:13–67` — Metatestes verificam texto/hash/contagem, não executabilidade. SHA256 `aa7ffa918e611fff19247a3f8ce1578bfd900fe12c505fd4f87cbe59cdcb38ee`. Origem: source.

**Critérios de aceite:**

- Extrair SQL executável e parâmetros explicitamente, ou executar um contrato de tipo declarado sem confundir shell e SQL.
- Definir versões suportadas e fallback equivalente com cobertura do inventário aceito pelo preflight.
- Em PostgreSQL descartável, invocar exatamente o runner do workflow para cada classe de contrato e validar a forma completa do JSON.
- Conservar guardas de identidade e confirmação; hash textual não substitui o teste do consumidor.

**Comparação:** TRA-009 registrava a extração e o tamanho do YAML, não a incompatibilidade Bash→SQL nem a ausência do fallback no runner.

**Probe:** runtime_contract_shell.

**Tarefas:** P006 E62: PARTIAL → PARTIAL; Extração textual quebrou o contrato de execução, além da meta de linhas já pendente.

**Limite específico:** 779 arquivos/779 versões distintas; 12 nomes de contrato; 767 versões sem arquivo. A existência de arquivo não implica elegibilidade de apply. A incompatibilidade foi demonstrada pela fonte e pelo leitor do contrato; PostgreSQL não foi iniciado.

### R2-INF-005 — Consulta pós-apply do ledger contém comentários Bash inválidos em SQL

**P1 · novo.** Três linhas iniciadas por # estão dentro do heredoc passado ao psql no passo Validar registro no ledger. São parte do SQL enviado, não comentários do Bash. A consulta não consegue verificar count/statements. O teste E65 só procura a presença dos ANDs e do nome do verificador, por isso continua verde.

**Fluxo consumidor:** Apply autorizado ou alvo já no ledger → Validar registro no ledger → psql-safe recebe heredoc → Parser SQL encontra texto # E65 → Falha antes de verify-ledger-statements.mjs.

**Precondições:** Os bloqueios anteriores foram superados; atualmente R2-INF-004 bloqueia a rota antes. inputs.apply=true ou needs_apply=false.

**Efeito:** Depois de consertada a barreira anterior, a validação continuará falhando. Quando apply já tiver ocorrido, falha do job não equivale a ausência de efeito no banco. Reabrir somente o subcontrato de integração SQL de E65.

**Evidência:**

- `.github/workflows/db-migrate.yml:914–939` — Heredoc SQL contém # nas linhas927–929. SHA256 `79cfd806819412dc1d0a83312a1cd2b2b944070078365c16f194aee8d19a41e5`. Origem: source.
- `scripts/ci/verify-ledger-statements.unit.mjs:79–88` — Teste de presença de texto passa sem analisar/executar a consulta. SHA256 `928d114b46a9001fe3a7af4506e6644153b791cbf52b48cb07de889adfef48bf`. Origem: source.

**Critérios de aceite:**

- Usar comentários SQL e executar o heredoc exato em PostgreSQL descartável.
- Ledger NULL, vazio e divergente falha; ledger equivalente passa pela consulta e pelo verificador.
- Evidência distingue falha pré-apply de falha após efeitos confirmados, sem retry cego.

**Comparação:** Mecanismo não descrito nos 104 achados anteriores.

**Tarefas:** P006 E65: DONE_VERIFIED → PARTIAL; A consulta SQL real não executa, apesar do teste de comparador passar.

**Limite específico:** Defeito latente atrás de R2-INF-004; não foi observado um apply real falhando.

### R2-INF-006 — Limpeza de E2E apaga todas as reações do usuário logado

**P1 · novo.** cleanupE2EReactions resolve o perfil da sessão corrente e envia DELETE apenas com user_id. Não inclui message_id, contato fixture ou identificador do run. O próprio comentário admite qualquer mensagem. reactions.spec chama a limpeza antes de cada teste e no afterAll.

**Fluxo consumidor:** E2E autenticado/QA local → sessão corrente → reactions.spec beforeEach/afterAll → cleanupE2EReactions → DELETE message_reactions?user_id=eq.<perfil>.

**Precondições:** A conta usada possui reações fora da fixture. RLS permite apagar suas próprias reações, conforme o comportamento esperado pelo helper.

**Efeito:** Rodar uma prova de UI remove dados de negócio do mesmo perfil em conversas não relacionadas ao teste. A limitação ao usuário não é uma limitação ao dado de teste.

**Evidência:**

- `e2e/fixtures/e2e-contact.ts:138–197` — Perfil dinâmico e DELETE sem escopo de mensagem. SHA256 `1fd8ce6091aee395a8e43fbb18ebd9b3b81d99eb99a76f5adb43ee78e9315b2a`. Origem: source.
- `e2e/reactions.spec.ts:20–42` — Execução automática antes/depois dos testes. SHA256 `e984806347a3b7a2ef582264358528e47aad104791f334be41d061e3c4ac9e53`. Origem: source.

**Critérios de aceite:**

- Limpar apenas IDs criados ou pertencentes à fixture/run autorizado.
- Verificar conta e projeto esperados antes de mutações.
- Teste negativo mantém intacta reação da mesma conta em mensagem externa à fixture.

**Comparação:** Mecanismo não descrito nos 104 achados anteriores.

**Probe:** reaction_cleanup_scope.

### R2-INF-007 — E2E de mensagens envia para o primeiro contato sem validar a fixture

**P1 · novo.** messaging.spec seleciona o primeiro conversation-item após o chip Todas, digita texto e pressiona Enter. Não importa o identificador da fixture nem confirma o contato antes do envio. A segurança depende da suposição documental de que a conta sempre enxerga só um contato, enquanto o setup permite credenciais de QA e CI.

**Fluxo consumidor:** e2e-logado / execução local autenticada → messaging.spec → primeira conversa de Todas → Enter → fluxo real de enqueue/envio.

**Precondições:** A conta vê mais de uma conversa ou a ordem muda. O primeiro item não é o contato E2E e o envio está habilitado.

**Efeito:** Teste pode enfileirar mensagem para contato real não selecionado para QA. Não houve envio nesta auditoria.

**Evidência:**

- `e2e/messaging.spec.ts:25–52` — Escolha do primeiro item e envio. SHA256 `5b17f503e772d9ee279880beb05b6d1851c2b456a899c5b1f5bdcf4d2b1ede87`. Origem: source.
- `e2e/fixtures/e2e-contact.ts:3–10` — Suposição de visibilidade única. SHA256 `1fd8ce6091aee395a8e43fbb18ebd9b3b81d99eb99a76f5adb43ee78e9315b2a`. Origem: source.
- `.github/workflows/e2e-logado.yml:105–121` — Workflow consumidor dos projetos autenticados. SHA256 `0d5a6471c8a0f358b770efab986c8a1418bba4ee1f806e9f76d82294cbb64e3f`. Origem: source.

**Critérios de aceite:**

- Selecionar e conferir identidade inequívoca da fixture antes de digitar/enviar.
- Abortar quando o contato esperado não estiver visível ou houver ambiguidades.
- Fixture com conversa alheia em primeiro lugar demonstra que nenhum enqueue para ela acontece.

**Comparação:** Mecanismo não descrito nos 104 achados anteriores.

### R2-INF-008 — Ratchets de TypeScript tratam falha do compilador como zero erros

**P2 · novo.** typecheck-ratchet aceita status1/2 do tsc e só reconhece diagnósticos com arquivo(linha,coluna). Diagnóstico global TS5083 fica invisível. implicit-any-ratchet captura qualquer falha do subprocesso e só conta error TS7; um compilador ausente produz zero e saída0. Os baselines estão em zero, de modo que não há queda de contagem que alerte.

**Fluxo consumidor:** CI lint-and-typecheck; hook de pre-push; Gate1 types-sync → tsc → saída e status → Parser restrito/contagem TS7 → comparação com baseline0.

**Precondições:** Erro de configuração, execução ou diagnóstico global não encaixa no formato do parser.

**Efeito:** A etapa reporta nenhum novo erro embora não tenha validado o programa. Outros passos independentes ainda podem falhar; o achado não afirma que o CI inteiro ficará verde em todo cenário.

**Evidência:**

- `scripts/ci/typecheck-ratchet.mjs:96–113` — Parser exige coordenadas de arquivo. SHA256 `e3f24788610a528b685ef4b350407e079f9eb21fcdb7545d2553b65fc790f537`. Origem: source.
- `scripts/ci/typecheck-ratchet.mjs:225–248` — Aceita status1/2 sem preservar distinção operacional. SHA256 `e3f24788610a528b685ef4b350407e079f9eb21fcdb7545d2553b65fc790f537`. Origem: source.
- `scripts/ci/typecheck-ratchet.mjs:296–322` — Sem novos diagnósticos produz sucesso. SHA256 `e3f24788610a528b685ef4b350407e079f9eb21fcdb7545d2553b65fc790f537`. Origem: source.
- `scripts/ci/implicit-any-ratchet.mjs:18–41` — Catch universal e contagem parcial. SHA256 `24f5dabb3ba26c3a599badcd39466c531dd7d7f06145a973f0f410db57e8c345`. Origem: source.
- `.github/workflows/ci.yml:166–172` — Consumidores CI. SHA256 `1936bdbf1667de5460e9cf808abe3fe353ae9caa972df0eb0f88fe63d9f9153b`. Origem: source.
- `.github/workflows/types-sync.yml:305–315` — Gate1 de types-sync. SHA256 `0884c62bb924531d58ba603a8adde54183c1b0e5bea5d2a8d9894bfef15e2565`. Origem: source.

**Critérios de aceite:**

- Distinguir falha operacional de lista válida de diagnósticos.
- Falhar para status não zero sem diagnóstico reconhecido e suportar diagnósticos globais.
- Casos de compilador ausente, config ausente e configuração inválida falham; projeto sem erros passa.

**Comparação:** TRA-008 trata Gate3 por contagem de linhas e recuperação; esta falha é do compilador/Gate1, com mecanismo e reproduções distintos.

**Probe:** global_compiler_error_passes, missing_compiler_passes.

### R2-INF-009 — Gate de dependências aceita erro de registry como relatório sem vulnerabilidade

**P2 · novo.** O workflow neutraliza a saída de bun audit com || true e delega a decisão a audit-prod. O script chama de relatório qualquer texto que contenha vulnerability/vulnerabilities; a mensagem sintética de falha ao obter a base é aceita, vira um cabeçalho sem advisory e termina com código0.

**Fluxo consumidor:** CI security → bun audit | tee ... || true → audit-prod --input audit-report.txt → Regex de reconhecimento → parse vazio de advisories → exit0.

**Precondições:** Ferramenta/proxy produz erro operacional contendo a palavra vulnerability ou relatório incompleto equivalente.

**Efeito:** O gate declara nenhuma advisory relevante sem ter demonstrado que consultou e interpretou a base. A reprodução usa uma mensagem sintética; não afirma que uma versão específica do Bun sempre emite esse texto.

**Evidência:**

- `.github/workflows/ci.yml:323–329` — Status original neutralizado. SHA256 `1936bdbf1667de5460e9cf808abe3fe353ae9caa972df0eb0f88fe63d9f9153b`. Origem: source.
- `scripts/ci/audit-prod.mjs:112–127` — Regex permissiva e sucesso. SHA256 `b0be826aa444e58e48f59db249ba17cede5fd68593ea5e789953373185fabb7b`. Origem: source.
- `scripts/ci/audit-prod.mjs:25–49` — Cabeçalhos incompletos são aceitos. SHA256 `b0be826aa444e58e48f59db249ba17cede5fd68593ea5e789953373185fabb7b`. Origem: source.

**Critérios de aceite:**

- Validar resumo/formato completo e consistência das contagens, ou consumir formato estruturado confiável.
- Relatório ausente, parcial ou operacionalmente falho encerra com estado inconclusivo/falha.
- Testes preservam o status do coletor e cobrem erro que contém a palavra vulnerability.

**Comparação:** Mecanismo não descrito nos 104 achados anteriores.

**Probe:** invalid_audit_report_passes.

### R2-INF-010 — Suite scripts/db-tests não entende a RPC e pode passar com zero assertivas

**P2 · novo.** run-all.mjs trata o JSON de mcp_exec como array; a implementação versionada devolve envelope com rows/row_count/truncated/ms. Com envelope válido ocorre rows.filter is not a function; com [] o runner declara 0 PASS / 0 FAIL e sai0. Parte dos testes usa RAISE NOTICE, que o runner não interpreta, e as contagens de comentários usam um prefixo inexistente. O arquivo de gamificação seleciona perfil real e contém chamadas mutantes: não é um instrumento somente de leitura.

**Fluxo consumidor:** Execução manual de scripts/db-tests/run-all.mjs → POST /rpc/mcp_exec com cada arquivo SQL → JSON envelope → rows.filter; ou array vazio → nenhum FAIL.

**Precondições:** Runner recebe o contrato atual da RPC ou resposta vazia. Com credenciais reais, SQL mutante seria enviado; não foi enviado nesta auditoria.

**Efeito:** A suite não comprova as regressões anunciadas. RLS-02 também conta políticas, não dez tabelas cobertas; múltiplas políticas na mesma tabela podem satisfazer a condição. Não se afirma persistência de escrita no script atual: falhas do bloco SQL/RPC podem fazer rollback.

**Evidência:**

- `scripts/db-tests/run-all.mjs:20–67` — Envelope e ausência de mínimo de assertivas. SHA256 `65b53dc65af4302e0b06af15173f6e130185829c03534a56373035442ddfd885`. Origem: source.
- `supabase/migrations/20260829020000_mcp_exec_functions_harden.sql:11–37` — Formato da RPC. SHA256 `09b47d51c3518cf9f8ac2910f3f29290cefc4324bbaf394fdc0072f7db820b0b`. Origem: source.
- `scripts/db-tests/03-gamification-bounds.sql:2–42` — NOTICE, perfil existente e chamadas mutantes. SHA256 `054b75916901357856824cb85b968f7a62411a204fc95473bfa452f124345726`. Origem: source.
- `scripts/db-tests/05-rls-smoke.sql:13–24` — COUNT de políticas apresentado como cobertura de tabelas. SHA256 `91f6d508407a9e1e678484a68328b8ef1f34cce61a33c3b15f544fe52b1921f7`. Origem: source.

**Critérios de aceite:**

- Decodificar envelope e recusar resultado truncado/ausente/incompatível.
- Exigir IDs e quantidade esperada de assertivas e não tratar zero como sucesso.
- Executar mutações em fixtures descartáveis com rollback garantido, sem selecionar perfil arbitrário.
- RLS prova cada tabela e comportamento permitido/negado; erro genérico não vale como negação esperada.

**Comparação:** Arquivos e consumidor diferentes do validator Team Chat já registrado; o problema não estava entre os 104.

**Probe:** db_tests_response_contract.

### R2-INF-011 — Prova de IA coloca senha/token em argv e deixa sessão Auth no arquivo de saída

**P2 · novo.** prova-orcamento-rate-limit.sh constrói JSON de login por jq --arg p e o fornece a curl --data como argumento. A resposta Auth inteira vai para OUT/login.json, sem umask restritiva, chmod ou remoção. Os requests seguintes usam Authorization com JWT em argv. A frase de que --data não vai por argv é incorreta.

**Fluxo consumidor:** Operador autoriza PROVA_PRODUCAO=sim → jq --arg → curl --data → OUT/login.json → JWT extraído → headers curl.

**Precondições:** Prova é executada com conta válida. Processos do ambiente podem observar argumentos ou o diretório de saída é compartilhado/arquivado.

**Efeito:** Credenciais e tokens de sessão têm uma superfície de exposição além da saída de terminal que o script promete limitar. Não foi lido nem criado arquivo de login real.

**Evidência:**

- `scripts/qa/prova-orcamento-rate-limit.sh:21–23` — Promessa de não imprimir token/senha. SHA256 `0304ad58aa59bc069fba5a97fb34e1d54b0c69c0a2016f31556f18ee0d3285e8`. Origem: source.
- `scripts/qa/prova-orcamento-rate-limit.sh:39–68` — Args e arquivo com resposta Auth. SHA256 `0304ad58aa59bc069fba5a97fb34e1d54b0c69c0a2016f31556f18ee0d3285e8`. Origem: source.

**Critérios de aceite:**

- Usar canal protegido para credenciais e corpo do login, sem parâmetros sensíveis em argv.
- Criar temporários privados, redigir apenas evidência necessária e remover tokens ao terminar, inclusive em falha.
- Probe com valores sintéticos verifica argv capturado e ausência de tokens em outputs publicáveis.

**Comparação:** Mecanismo não descrito nos 104 achados anteriores.

### R2-INF-012 — Prova de orçamento/rate limit termina com ok sem verificar o comportamento

**P2 · novo.** A função chamar imprime status/corpo mas não os valida; o script não usa errexit, não verifica as três respostas nem consulta os registros correlacionados. Após login, pode registrar FIM_PROVA=ok com três erros HTTP ou falhas de transporte. As consultas mostradas ao operador são totais sem correlação com o run. Três chamadas aceitas, por si, tampouco comprovam bloqueio por limite.

**Fluxo consumidor:** Prova de produção manual → login válido → Três curl → status impresso → SQL apenas exibido → FIM_PROVA=ok incondicional.

**Precondições:** Login devolve token; chamadas seguintes falham ou não exercitam a restrição.

**Efeito:** Um consumidor da marca final pode confundir término do script com prova de reserva, liquidação, log e rejeição por limite. O texto orienta verificação manual, que deve continuar registrada como pendente até evidência correlacionada.

**Evidência:**

- `scripts/qa/prova-orcamento-rate-limit.sh:62–89` — Ausência de assertivas e ok final. SHA256 `0304ad58aa59bc069fba5a97fb34e1d54b0c69c0a2016f31556f18ee0d3285e8`. Origem: source.

**Critérios de aceite:**

- Distinguir executado/inconclusivo/aprovado e só emitir aprovado com critérios medidos.
- Correlacionar requests e registros por IDs do run, sem inferir a partir de totais globais.
- Provar caminhos de sucesso e rejeição na fixture apropriada; falha HTTP/transporte precisa produzir falha do verificador.

**Comparação:** Mecanismo não descrito nos 104 achados anteriores.

### R2-INF-013 — Inventário de testes ignora quatro suites Node fora dos globs de CI

**P2 · novo.** check-test-inventory cobre apenas .test.ts em supabase/functions e .test.sh em scripts/db-audit. Há 87 arquivos scripts/**/*.unit.mjs ou *.test.mjs; quatro não são selecionados pelos globs nem por nomes nos workflows. A allowlist de nove .test.sh continua sem owner/prazo. E48 deve conservar seu veredito no escopo estreito documentado; a garantia de inventário geral é que permanece incompleta.

**Fluxo consumidor:** CI → check-test-inventory → Descoberta de apenas duas famílias → Suites Node fora dos globs não entram no conjunto comparado.

**Precondições:** Muda uma suite .mjs localizada fora de scripts/ci, edge-deploy, db-audit ou talkx.

**Efeito:** CI pode aprovar o inventário sem executar testes existentes de segurança de processo, validação de catálogo, logs do validator Team Chat e classificador visual de QA. Ausência de wiring não demonstra que esses testes nunca foram executados manualmente.

**Evidência:**

- `scripts/ci/check-test-inventory.mjs:17–57` — Escopo de descoberta e allowlist. SHA256 `6fe5b41e63ccaeadde2f2acb4f45ca64fd5dc01f039a8fdc0887f557a8fc04e7`. Origem: source.
- `.github/workflows/ci.yml:83–92` — Globs executados. SHA256 `1936bdbf1667de5460e9cf808abe3fe353ae9caa972df0eb0f88fe63d9f9153b`. Origem: source.
- `.github/workflows/db-guard.yml:203–205` — Outro glob Node. SHA256 `1fa7a5422f70db628d81722cba2dbcd4853afe238a0614caf4b65d92716ed137`. Origem: source.

**Critérios de aceite:**

- Inventariar suites executáveis por todos os formatos usados e mapear a jobs/commands efetivos.
- Manter exceções explícitas com dono, motivo e condição/prazo de revisão.
- Identificar e decidir o wiring de scripts/lib/seguranca-processo.test.mjs, scripts/catalog/validate-plan.test.mjs, scripts/team-chat-db-validate.unit.mjs e scripts/qa/prova-visao-classificadores.unit.mjs.

**Comparação:** Achado de wiring/descoberta, separado da qualidade dos testes de Team Chat e do defeito de parser de Catálogo já registrados.

**Tarefas:** P006 E48: DONE_VERIFIED → DONE_VERIFIED; Extensão de inventário geral além de .test.ts/.test.sh; não reabrir a conclusão estreita só por esse gap.

### R2-INF-014 — Replay local reutiliza nome destrutivamente e tem exit0 após falhas de migrations

**P2 · novo.** replay-local.sh começa removendo com docker rm -f um nome fixo, sem identificar se o container pertence ao run. O bootstrap não usa ON_ERROR_STOP e o loop continua depois de erros, permitindo que efeitos parciais de uma migration afetem as seguintes. A última operação é echo e não há saída não zero baseada em FALHA. A imagem tem tag, sem digest. A documentação corretamente declara que o replay histórico não ficou verde; não foi reclassificada como sucesso nesta análise.

**Fluxo consumidor:** Execução local documentada → docker rm -f nome fixo → criar container → Bootstrap + migrations sequenciais → contagem de falhas → Remoção + echo final → exit0.

**Precondições:** Já existe container com o nome fixo, ou bootstrap/migration falha. Automação usa o exit code ou interpreta cada falha como independente.

**Efeito:** Pode remover recurso local que não criou e gerar resultado agregado sem distinguir falha raiz/cascata/efeitos parciais. A execução é local e mutante, não somente leitura, ainda que não toque o banco canônico.

**Evidência:**

- `scripts/db-audit/replay-local.sh:16–36` — Nome fixo, rm-f e bootstrap. SHA256 `c81d0c5b1d3dd16ae9e4ae093121caf9d6242c8dac9c98deb66d17eded944270`. Origem: source.
- `scripts/db-audit/replay-local.sh:73–90` — Continua e não propaga FALHA. SHA256 `c81d0c5b1d3dd16ae9e4ae093121caf9d6242c8dac9c98deb66d17eded944270`. Origem: source.
- `docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md:29–39` — Documento declara Não é verde. SHA256 `4d53510614e9482759c22b6efc0410a68c23960d0cfbc74ce8ba60e62f12a328`. Origem: source.

**Critérios de aceite:**

- Nome único e ownership label; remover somente container criado pelo run, com trap seguro.
- Falhar explicitamente em setup indisponível e publicar status distinto quando houver falhas.
- Fixar digest e declarar transação/efeitos parciais por arquivo, separando causa raiz e cascata.
- Preservar a ressalva histórica de que o replay não equivale aos serviços Supabase completos.

**Comparação:** Mecanismo não descrito nos 104 achados anteriores.

### R2-INF-015 — Três probes anteriores rotulam baseline fixo sem validar a fonte executada

**P2 · novo.** Os probes transversal, other e volume aceitam checkout corrente/RECONCILIATION_REPO e carregam código dele, mas escrevem baseline_commit constante sem verificar HEAD ou hashes esperados antes da execução. Volume registra hashes observados, o que ajuda a análise posterior, mas não compara com um conjunto esperado. Transversal importa módulo de fonte antes dos mocks. A contagem network_requests:0 nesses relatórios é declarada, não derivada de um interceptador global. No código revisado, os doubles evitam requests nos caminhos exercitados; não foi observado request real.

**Fluxo consumidor:** README reproduction → RECONCILIATION_REPO → Leitura/import de módulos do checkout selecionado → Relatório baseline_commit constante e contadores declarados.

**Precondições:** Outro checkout ou fonte modificada é usado para reproduzir. O código modificado mantém a assertiva esperada ou introduz efeito antes dos mocks.

**Efeito:** Resultado pode ser atribuído ao commit errado e a alegação de isolamento não é uma barreira contra fonte diferente. Não invalida automaticamente as observações históricas que possuem suas fontes preservadas.

**Evidência:**

- `reproduce/transversal/local-semantic-probes.mjs:1–38` — Root selecionável, import e baseline constante. SHA256 `fe3fef82cebeff4748fa194259ca074580c409f08693b719bf398872934e3d31`. Origem: previous_audit.
- `reproduce/other/reproduce_findings.py:1–62` — Extração de código sem pin prévio. SHA256 `649b13cee3146182cd9ffa623d6020dfe1dcc97f988719321b4e1dd9c585c97c`. Origem: previous_audit.
- `reproduce/volume/volume_offline_probe.mjs:1–25` — Root e baseline/hashes observados. SHA256 `ef56dea05c97f55cb985b674e31463b84956074d51df01ed0b029ff71cb5c1f9`. Origem: previous_audit.
- `reproduce/volume/volume_offline_probe.mjs:218–227` — Metadados declarados. SHA256 `ef56dea05c97f55cb985b674e31463b84956074d51df01ed0b029ff71cb5c1f9`. Origem: previous_audit.

**Critérios de aceite:**

- Verificar HEAD e hashes de todos os módulos executados antes do import, recusando divergência.
- Separar hash esperado, observado e código adaptado pelo harness.
- Instalar bloqueio de rede antes da carga do código e registrar tentativas observadas, sem tratar um literal como medição.
- Os probes desta rodada possuem probe-source-pins.json e verificam seus 25 arquivos antes dos imports.

**Comparação:** Mecanismo não descrito nos 104 achados anteriores.

**Limite específico:** Cross-module, Multiplix e Skins possuem proteções de proveniência mais fortes e não foram incluídos nesta falha. Os probes antigos não foram executados novamente durante esta revisão.

### R2-INF-016 — Guarda de exposição de erro não encontra respostas 500 presentes no repositório

**P2 · novo.** acharExposicoes aplica regex por linha e procura status antes de .message no JSON manual. new Response(JSON.stringify({erro:error.message}), {status:500}) fica invisível porque a ordem é oposta; multiline também escapa. searchbox-budget-alert e webhook-diagnostic têm essa forma e ambos produzem zero achados no scanner offline. O helper compartilhado errorResponse sanitiza status>=500, portanto chamadas por ele não foram tratadas como vazamento.

**Fluxo consumidor:** CI → check-edge-error-exposure.unit.mjs → main com fontes reais → Scanner por linha e ordem restrita → Respostas manuais 500 não passam pelo helper sanitizante.

**Precondições:** Endpoint retorna erro pela construção manual de Response. Erro contém detalhe interno; endpoint é alcançável com a autorização que ele exige.

**Efeito:** A frase nenhuma exposição em todos os edges pode ser emitida apesar de respostas que devolvem message crua. O exemplo searchbox exige cron secret; não foi alegado acesso anônimo nem vazamento já observado.

**Evidência:**

- `scripts/ci/check-edge-error-exposure.mjs:25–46` — Regex por linha e ordem status→message. SHA256 `0f75d9d6636944f836999df17b789b55f7f6837e40a775845e74112db67b8532`. Origem: source.
- `scripts/ci/check-edge-error-exposure.mjs:66–74` — Veredito abrangente. SHA256 `0f75d9d6636944f836999df17b789b55f7f6837e40a775845e74112db67b8532`. Origem: source.
- `scripts/ci/check-edge-error-exposure.unit.mjs:71–87` — Teste do scanner real e mutação estreita. SHA256 `ca855d1b4502eb53bd450c1a82acb3b34eb287968828e2c009b2ef4a5952ab4c`. Origem: source.
- `supabase/functions/searchbox-budget-alert/index.ts:19–34` — Resposta manual após autenticação de cron. SHA256 `2909d2324bfb71d4e298c370280b8cdd45d77a1b2a9ca044dc7092394bbfa1d1`. Origem: source.
- `supabase/functions/webhook-diagnostic/index.ts:233–237` — Outro exemplo manual. SHA256 `df91c8ad62c862151ce56cb1282d0aef775dddf36055dd4573ffad41b5e4d9b6`. Origem: source.
- `supabase/functions/_shared/validation.ts:121–134` — Helper sanitiza >=500. SHA256 `257890b6c2c20f463f6bb01b670306681b00bdc3685eda012c4296aad620d61e`. Origem: source.

**Critérios de aceite:**

- Normalizar respostas internas por helper que sanitiza e provar os handlers com erro sintético.
- Se mantiver análise estática, cobrir AST/multiline/ordem dos argumentos e contexto de helper sanitizante.
- Guard detecta os dois exemplos reais e mutações equivalentes; teste não assume que sua própria ausência de achados demonstra segurança global.

**Comparação:** Mecanismo não descrito nos 104 achados anteriores.

**Probe:** multiline_error_guard.

**Tarefas:** P006 E33: IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE → PARTIAL; Proteção do helper permanece; reabrir somente a cobertura do guard e os produtores manuais de Response.

## Duplicações evitadas

Foram preservados sem nova contagem: TRA-007, TRA-008, TRA-009, TC-011, TC-012, TX02, OTH-010, OTH-011, OTH-012. Os defeitos de E2E/QA e de ratchets relatados acima têm caminhos e critérios próprios, explicitados em cada registro.

## Artefatos

- findings.json: mecanismos, severidade, relações, linhas/SHA e critérios de aceite.
- coverage.json: ledger de revisão por arquivo, wiring, nomes de variáveis e lacunas.
- probe.mjs / probe-source-pins.json / offline-probes.json: reprodução sintética com fonte pinada.
- meta-tests.json: resultado observado dos 15 metatestes existentes.

## Segunda passagem consolidada

A primeira entrega de 16 achados foi preservada. Os cinco acréscimos abaixo afetam atribuição de deploy e integridade das provas de CI/QA. A leitura adicional não executou os entrypoints reais. Somente o probe de inventário estável importou o coletor puro após conferir HEAD e quatro hashes, com rede bloqueada, relógio e respostas sintéticos. O resultado aceitou a versão antiga aos 60 segundos; a versão nova do cenário apareceria aos 70 segundos. Esta é uma demonstração da lógica local, não observação de propagação real.

P006 E79 e E85 passam a PARTIAL somente nos subcontratos de coleta e propagação de falha. E06 conserva NEEDS_REVALIDATION; E55/E56 conservam DONE_VERIFIED. P037 E69 já era PARTIAL e ganha uma razão adicional, sem reescrever a medição histórica de 5/6. As identidades e avaliações anteriores estão no JSON.

### R2-INF-017 — Atestação de Edge aceita inventário anterior sem prova de no-op do deploy

**P2 · novo.** Se versão e digest remoto continuam iguais ao baseline, stable-inventory aceita a função selecionada mesmo com knownUnchanged vazio. Três amostras iguais e o tempo mínimo de 60 segundos bastam. A igualdade entre duas observações remotas não demonstra que o deploy selecionado já apareceu: um inventário ainda não atualizado satisfaz o mesmo ramo. O workflow já captura stdout e stderr e fornece a lista de no-ops, mas ela não é necessária para esse aceite.

**Cadeia:** Deploy CLI bem-sucedido → log combinado → unchanged-from-log → lista vazia → collect-remote → stable-inventory → Inventário pré-deploy repetido → artifact com versões antigas atribuídas ao run.

**Precondições:** Há baseline de versão e digest para funções selecionadas. O inventário da Management API ainda mostra a versão anterior por pelo menos o período mínimo, sem sinal de no-op correspondente do CLI.

**Efeito:** A rotina pode encerrar a observação antes de aparecer a versão realmente implantada e associar os inputs do run às versões anteriores. O probe sintético aceitou 73 versões antigas aos 60 segundos, com a atualização programada para 70 segundos; não mediu latência nem deploy real.

**Evidências:**

- `scripts/edge-deploy/stable-inventory.mjs:101–158` — Aceite por digest prévio sem exigir knownUnchanged, seguido de atestação estável. SHA256 `8e4a354414e096a64ef0ebfd45deae6182f40131c1967dda7893bbad3606968d`.
- `.github/workflows/deploy-functions.yml:362–426` — Consumidor captura stderr, extrai no-ops e chama coletor após deploy. SHA256 `e863384f47250579a99fe17e880a533b0811ed2683497680f1ecde1b01e36686`.
- `scripts/edge-deploy/stable-inventory.unit.mjs:30–62` — Suite ratifica aceite sem bump; não exige observação de mudança atrasada. SHA256 `78d82719c0412b8fe35d75c4c3d080efee793f7129e9a991d2aeefc7df0bdb1a`.

**Critérios de aceite:**

- Exigir incremento de versão/identificador de deploy, ou prova explícita de no-op do comando correspondente aliada ao baseline estável.
- Inventário anterior retido por mais de 60 segundos não deve ser atribuído ao deploy que mudou a função.
- No-op legítimo com sinal correlacionado continua concluindo de forma limitada; baseline sem versão deve produzir estado de evidência explícito.

**Limites:** Sem execução de workflow, deploy, SQL, login, E2E real ou rede de produto nesta segunda passagem. O artifact já declara source_to_bundle_equivalence_proven=false. O achado não atribui a ele uma promessa de equivalência binária. E55 (timeout/lastReason) e E56 (extrator de log/ANSI) conservam DONE_VERIFIED em seus escopos específicos.

### R2-INF-018 — KPI semanal limita runs a 100 e publica ranking de jobs sem consultá-los

**P2 · novo.** principal faz uma única consulta /actions/runs?per_page=100 e agrega apenas essa página como uma janela de sete dias. A tabela de jobs lentos é construída por maisLentos([]), independentemente da API: nenhum job é consultado. As funções de ranking existem, mas o consumidor real lhes passa sempre uma lista vazia antes de publicar summary e issue.

**Cadeia:** branch-hygiene-audit semanal → actions-kpi.mjs → Uma página de runs → agregar janela → maisLentos([]) → tabela vazia → Summary e issue KPI.

**Precondições:** Mais de 100 runs caem na janela para que os totais sejam truncados. Para a lacuna do ranking, basta executar o script: o array de jobs é sempre vazio.

**Efeito:** Volumes e taxas semanais podem representar só a página mais recente, e a afirmação de que não há jobs registrados não é resultado de uma consulta. A publicação parece completa sem marcar esses limites.

**Evidências:**

- `scripts/ci/actions-kpi.mjs:49–85` — Agregação/ranking de jobs disponível, mas requer dados. SHA256 `1aac9444d42a3df2c09bc8b7915e351823f6738373d0f70e076d69e836b68909`.
- `scripts/ci/actions-kpi.mjs:126–141` — Página única, array vazio e publicação. SHA256 `1aac9444d42a3df2c09bc8b7915e351823f6738373d0f70e076d69e836b68909`.
- `.github/workflows/branch-hygiene-audit.yml:40–64` — Invocação do coletor semanal. SHA256 `c98b2eefd284812e6cc7f5d322bcc3a2d436de7f2cad4bb6e0af5dc38f5e636c`.

**Critérios de aceite:**

- Paginar runs até o limite temporal e explicitar qualquer truncamento ou falha parcial.
- Consultar jobs dos runs relevantes para o ranking, ou mostrar que a métrica não foi coletada.
- Uma fixture com mais de 100 runs e um job lento deve aparecer integralmente na janela e no ranking; falha de API não vira zero.

**Limites:** Sem execução de workflow, deploy, SQL, login, E2E real ou rede de produto nesta segunda passagem.

### R2-INF-019 — Runner de mutação conta falha de infraestrutura como mutante morto

**P2 · novo.** runSuite retorna res.status e o chamador considera morto tudo que for diferente de zero, incluindo status null quando o binário não inicia. Não há execução verde do baseline nem exigência de assertion executada/falhada; nomes dos testes e resumo são informativos. O runner ainda termina com zero quando há sobreviventes, salvo erro de restauração. As alterações são feitas nos arquivos reais do worktree e depois restauradas; a pasta temporária guarda backups.

**Cadeia:** Execução manual run-mapa → sed -i no arquivo real → spawnSync de Vitest → status de processo → r.code !== 0 → MORTO → Contagem impressa e restauração → saída sem gate de qualidade.

**Precondições:** A mutação textual é aplicada e o Vitest não inicia, falha por configuração ou por causa não ligada ao assert que deveria detectar a mutação. O consumidor interpreta a contagem MORTO ou exit code como comprovação da qualidade dos testes.

**Efeito:** É possível reportar mutações detectadas sem executar teste algum. Sobrevivência também não determina o status de saída, de modo que a ferramenta não funciona como gate de qualidade sem interpretação adicional. Não foi executada nem se atribuiu invalidez automática ao resultado histórico de 5/6.

**Evidências:**

- `scripts/mutation/run-mapa.mjs:125–142` — Resultado do processo sem baseline ou mínimo de testes. SHA256 `9dc269f60e24e74a05bcc776d6565605817fd4b5fe7b599ac7b18c35ac1bf14e`.
- `scripts/mutation/run-mapa.mjs:145–203` — Muta arquivos reais e classifica qualquer não zero como kill. SHA256 `9dc269f60e24e74a05bcc776d6565605817fd4b5fe7b599ac7b18c35ac1bf14e`.
- `scripts/mutation/run-mapa.mjs:205–229` — Contagens e único exitCode explícito associado à restauração. SHA256 `9dc269f60e24e74a05bcc776d6565605817fd4b5fe7b599ac7b18c35ac1bf14e`.

**Critérios de aceite:**

- Exigir baseline verde e distinguir erro de infraestrutura, mutante detectado, sobrevivente e execução inconclusiva.
- Contar detecção apenas quando o teste relevante executou e falhou por uma assertion rastreável.
- Declarar política para sobreviventes/equivalentes e refletir a conclusão no status; executar mutações em cópia isolada com cleanup seguro.

**Limites:** Sem execução de workflow, deploy, SQL, login, E2E real ou rede de produto nesta segunda passagem.

### R2-INF-020 — Prova dos classificadores pode aprovar consumo sem comprovar seus registros

**P2 · novo.** Após duas classificações, uma resposta HTTP não OK de ai_usage_logs só produz aviso, sem incrementar falhas; a saída final pode ser PROVA OK. Quando a consulta funciona, considera as últimas 20 linhas de cinco minutos e filtra somente nome de função: duas linhas de qualquer um dos classificadores, algum sucesso e algum modelo Gemini satisfazem o teste, sem correlação com as duas requisições realizadas.

**Cadeia:** QA manual autenticado → classify-sticker e classify-emoji → REST ai_usage_logs por janela → erro apenas avisado ou linhas não correlacionadas → falhas === 0 → PROVA OK e exit 0.

**Precondições:** As verificações das duas respostas de classificação passam. A consulta de consumo falha, ou há linhas anteriores de classificadores que satisfazem as condições sem pertencer às invocações da prova.

**Efeito:** O artefato pode declarar sucesso sem demonstrar que ambas as chamadas pagas foram registradas e pelo provedor afirmado. A instrução de conferência manual não está refletida no status final; a evidência deveria ser inconclusiva até a correlação.

**Evidências:**

- `scripts/qa/prova-visao-classificadores.mjs:1–37` — Contrato da prova e condição anunciada de sucesso. SHA256 `020ad6591a073f7cb8ccbc99b95c984bf5b4d87744c37625f4e3ce575d83bf36`.
- `scripts/qa/prova-visao-classificadores.mjs:160–190` — Chamadas, consulta sem correlação, aviso sem falha e saída final. SHA256 `020ad6591a073f7cb8ccbc99b95c984bf5b4d87744c37625f4e3ce575d83bf36`.

**Critérios de aceite:**

- Usar IDs retornados/correlação das duas chamadas e exigir um registro de consumo válido para cada uma.
- Sem permissão para consultar o consumo, produzir status inconclusivo/falha de verificação, sem PROVA OK.
- Dados anteriores, duas linhas de uma só função e erros de REST não devem aprovar a prova.

**Limites:** Sem execução de workflow, deploy, SQL, login, E2E real ou rede de produto nesta segunda passagem. Revisão de fronteira confirmada com a área Providers; este é um defeito do harness, não uma nova alegação de erro de contabilização dentro das Edge Functions.

### R2-INF-021 — Falha dos fixtures E2E é omitida do veredito e do alerta do DB Live Guard

**P2 · novo.** O passo E85 executa check-e2e-fixtures.sql com continue-on-error:true e não tem id. O consolidado lê apenas os dez outcomes nomeados dos outros checks; não inclui fixtures. Se os demais passam, imprime que todos passaram. A abertura de issue depende de failure() e a recuperação depende de success(), permitindo fechar um alerta anterior apesar da falha de fixtures. O arquivo step-e2e-fixtures.log também não integra o upload de evidências.

**Cadeia:** DB Live Guard com credencial válida → SQL E85 → Fixture ausente → psql ON_ERROR_STOP encerra com falha → continue-on-error neutraliza conclusão do passo → Dez outros outcomes OK → veredito verde e fechamento de alerta.

**Precondições:** O check E85 falha por ausência de tabela/fixture, status da conexão ou falha de consulta. As demais verificações e os passos do workflow terminam com sucesso.

**Efeito:** O guard dito fail-closed para fixtures pode terminar verde sem emitir alerta e sem incluir a evidência desse check no artifact. A falha continua visível no log do passo; não se afirma desaparecimento completo dos logs.

**Evidências:**

- `.github/workflows/db-live-guard.yml:192–205` — Passo E85 tolera erro sem id. SHA256 `3a264e1c3b517515140f0e3ab6276e3a8787e0292035d51bd64790440531307e`.
- `.github/workflows/db-live-guard.yml:316–347` — Outcomes consolidados excluem E85. SHA256 `3a264e1c3b517515140f0e3ab6276e3a8787e0292035d51bd64790440531307e`.
- `.github/workflows/db-live-guard.yml:435–451` — Veredito positivo e alerta condicionado a failure. SHA256 `3a264e1c3b517515140f0e3ab6276e3a8787e0292035d51bd64790440531307e`.
- `.github/workflows/db-live-guard.yml:578–630` — Recuperação automática e lista de artifacts sem fixtures. SHA256 `3a264e1c3b517515140f0e3ab6276e3a8787e0292035d51bd64790440531307e`.
- `scripts/db-audit/check-e2e-fixtures.sql:100–110` — SQL falha de verdade; problema está na integração do workflow. SHA256 `e995eb9871c179f260440a0017fb5df304e7332737bef41f0319de0696cb83ea`.

**Critérios de aceite:**

- Dar id ao check e incluir seu outcome no consolidado, no conjunto de falhas e no mapa de logs.
- Falha isolada de fixture deve impedir sucesso/fechamento de alerta e produzir causa identificável.
- Incluir evidência de fixtures no artifact e testar o cenário de apenas E85 falhar, sem rodar contra produção.

**Limites:** Sem execução de workflow, deploy, SQL, login, E2E real ou rede de produto nesta segunda passagem.

### Artefatos da segunda passagem

- `findings-second-pass.json`: cinco achados adicionais, também integrados ao JSON principal.
- `second-pass-review.json`: 93 arquivos, suas faixas reais de leitura e os efeitos dos entrypoints.
- `second-pass-probe-pins.json`, `probe-second-pass.mjs` e `second-pass-offline-probes.json`: proveniência, harness e resultado do caso R2-INF-017.
- `append_second_pass.py`: finalizador documental idempotente; reaplica a segunda passagem após uma regeneração da primeira. Não executa código de produção.

## Lote IA delegado integrado

### Revisão IA delegada — pipeline, classificadores e consumidores

Fonte: `da307ba5626dce892f0b37cb6762463f55d14a96`. Foram lidos integralmente os 12 arquivos primários (2692 linhas), com autenticação, entradas, saída, erros, efeitos, cancelamento e consumidores rastreados. A cobertura de suporte é declarada por faixa no JSON.

## Resultado

Quatro mecanismos novos: 1 P1 e 3 P2. A leitura privilegiada de imagem é um problema de autorização de objeto no ramo de usuário; autenticação e cotas existem. Os outros três tratam recência na projeção, contrato da resposta e preservação do rascunho. Nenhuma conclusão presume que a versão esteja publicada ou que o efeito já tenha ocorrido em produção.

| ID | Prioridade | Resultado |
|---|---|---|
| R2-INF-022 | P1 | Classificadores visuais leem mídia privada com service role sem autorizar o objeto do usuário |
| R2-INF-023 | P2 | Revalidação de contexto fora da RPC deixa análise antiga substituir uma projeção concorrente |
| R2-INF-024 | P2 | Sugestões com JSON inválido para o contrato chegam à interface ou viram frases fixas sem sinal de degradação |
| R2-INF-025 | P2 | Reescrita atrasada substitui edição mais nova do mesmo rascunho |

## Gates e fronteiras conferidas

O gateway remoto não foi consultado. `supabase/config.toml` não declara exceção verify_jwt=false para estas rotas; a análise de alcance se apoia também nos gates internos observados. Os classificadores exigem usuário verificado; sticker permite adicionalmente token exato de serviço para o webhook. Analysis, summary, suggest e enhance verificam Auth e cotas. Churn e tickets usam getUser e cliente JWT. Chatbot tem ramo HMAC de serviço e ramo de usuário; não foi tratado como acessível anonimamente só pela existência do ramo HMAC.

A autorização por contato está presente nas capacidades de conversa que consultam contexto. Tickets lê tags com cliente RLS, não service role. Churn filtra IDs visíveis antes das leituras privilegiadas. O helper de imagem não possui essa verificação por objeto e por isso constitui caso distinto.

## Cobertura primária

| Arquivo | Gate/efeito principal | Consumidor |
|---|---|---|
| `supabase/functions/_shared/ai-conversation-pipeline.ts` | resolveVisibleContactId usa cliente do usuário; ausência/erro de consulta não libera contato. Helper espera autenticação do handler. A revalidação recebe callbacks; request.req não vira AbortSignal na chamada generateWithRouting. | ai-conversation-analysis; ai-conversation-summary |
| `supabase/functions/_shared/ai-image-input.ts` | Origem exata e buckets fixos; download usa service role, sem identidade/cliente RLS no contrato do helper. AbortController interno cobre fetch até headers; req.signal não entra; corpo é lido após clearTimeout. | classify-emoji; classify-sticker |
| `supabase/functions/ai-conversation-analysis/index.ts` | requireAuth, enforceAiGuards, 10/IP/min e cliente RLS para contato; service role apenas após visibilidade. Revalida contato e versão antes da RPC; cliente faz descarte lógico após await. Janela concorrente permanece no servidor. | src/components/inbox/AIConversationAssistant.tsx |
| `supabase/functions/ai-conversation-summary/index.ts` | requireAuth, enforceAiGuards, limite local por IP e visibilidade RLS de contato. Revalida antes da RPC; callback do frontend rejeita retorno antigo após contato/período mudarem, sem desfazer persistência já feita. | src/components/inbox/ConversationSummary.tsx |
| `supabase/functions/ai-churn-analysis/index.ts` | Token validado, guard de IA e IDs filtrados por cliente autenticado antes de leituras service role. Laço serial de consultas, sem sinal de cancelamento propagado. | src/components/ai/ChurnPredictionDashboard.tsx |
| `supabase/functions/ai-classify-tickets/index.ts` | getUser, guard de IA e consulta direta de tags pelo callerClient submetida à RLS, sem cliente service role nesse handler. Sem AbortSignal ou efeito persistente do handler; consultas e retorno podem terminar após desmontagem. | src/components/ai/AutoTicketClassifier.tsx |
| `supabase/functions/ai-enhance-message/index.ts` | requireAuth, enforceAiGuards e 20/IP/min; não consulta objeto privado. Sem req.signal; os dois consumidores examinados aplicam após await sem verificar geração de rascunho/contato. | src/components/inbox/chat/AIEnhanceButton.tsx; src/components/inbox/chat/AIRewriteButton.tsx |
| `supabase/functions/ai-suggest-reply/index.ts` | requireAuth e guard, contato RLS antes do contexto service role; artigos publicados são contexto adicional. Cliente rejeita retorno por geração/contato após await; Edge não persiste e não recebe AbortSignal para provedor. | src/components/inbox/AISuggestions.tsx |
| `supabase/functions/chatbot-l1/index.ts` | Ramo HMAC de serviço ou requireAuth+guard; assinatura de serviço não equivale a endpoint anônimo sem gateway. Configuração remota não medida. Sem cancelamento de provedor; esta rota não prova envio automático nem transferência efetiva. | src/components/settings/ChatbotL1Config.tsx |
| `supabase/functions/classify-audio-meme/index.ts` | requireAiIdentity; identidade verificada antes do provedor. Timeout passado ao dispatcher, sem req.signal; limites centrais ficam na área providers. | src/hooks/communication/useAudioMemes.ts; src/components/settings/media-library/useMediaUpload.ts; src/components/settings/media-library/useMediaLibrary.ts |
| `supabase/functions/classify-emoji/index.ts` | Autenticação e cotas presentes; ausência de autorização de leitura por objeto no ramo usuário. 15s declarado ao download/dispatcher; req.signal não é propagado. | src/hooks/integrations/useCustomEmojis.ts; src/components/settings/media-library/useMediaUpload.ts; src/components/settings/media-library/useMediaLibrary.ts |
| `supabase/functions/classify-sticker/index.ts` | requireAiIdentityOrService; service key comparada pelo helper, cotas por usuário ou limiter de serviço. 15s declarado ao helper/dispatcher, sem vínculo ao AbortSignal da requisição. | src/hooks/sticker-picker/useStickerPicker.ts; supabase/functions/_shared/evolution-webhook-messages.ts; src/components/settings/media-library/useMediaLibrary.ts |

## Provas e alcance

Os 12 arquivos usados nos probes e o compilador TypeScript tiveram SHA256 conferido antes do import. Os módulos avaliados receberam apenas dependências locais revisadas e fixtures; fetch global foi bloqueado. Não foram carregados os handlers Deno, SDKs, React nem Zod remoto.

| Probe | O que executou | Limite |
|---|---|---|
| INF-AI-P01 | toInlineImage e parser reais com imagem sintética e fetch injetado | Não executa RLS, Storage ou provedor; prova conversão privilegiada do locator e confere controles de origem/bucket. |
| INF-AI-P02 | Funções reais de revalidação e barreira assíncrona | O UPDATE é modelo explícito do predicado SQL pinado, sem PostgreSQL. Controle com snapshot atualizado cancela. |
| INF-AI-P03 | Bloco real de parse/fallback extraído por AST | Sem modelo; o erro de render é inferido do shape entregue ao consumidor .map, não sessão de browser. |
| INF-AI-P04 | Dois callbacks reais de reescrita, retorno retardado e setter sintético | Mesma conversa, componente ainda montado; sem React/DOM nem envio. |

Os resultados estão em `ai-review-probes.json`; script em `probe-ai-review.mjs` e pins em `ai-review-probe-pins.json`. As quatro provas passaram suas assertivas. Isso não é resultado de produção, teste E2E ou certificação de todo o dispatcher.

## Achados e critérios de aceite

### R2-INF-022 — Classificadores visuais leem mídia privada com service role sem autorizar o objeto do usuário

classify-emoji autentica o usuário; classify-sticker aceita usuário ou serviço. No ramo de usuário, ambos passam image_url diretamente a toInlineImage. O helper verifica origem, bucket e path, mas baixa o objeto com SUPABASE_SERVICE_ROLE_KEY sem conferir permissão de leitura do usuário, mensagem visível ou vínculo a uma figurinha compartilhada. A allowlist inclui whatsapp-media, que as migrations mantêm privado e sujeito a SELECT por atribuição/visibilidade. Os bytes são embutidos no pedido ao provedor de visão; userId é usado em cota/log, não na autorização do download.

**Precondições:** Usuário válido, não autorizado pela policy a ler determinado objeto privado de whatsapp-media, conhece seu locator/path. O objeto existe, é imagem aceita pelo helper e há provedor de visão configurado para completar a classificação. A versão publicada corresponde ao caminho versionado analisado; essa condição não foi medida remotamente.

**Efeito:** Permite processamento de mídia privada além da permissão do chamador e envio desses bytes ao provedor configurado. A resposta permite inferir a categoria da imagem; não devolve o arquivo bruto, nem demonstra extração integral do conteúdo para o chamador.

**Evidência no fonte:**

- `supabase/functions/classify-emoji/index.ts:40–70` — Identidade validada, mas helper da imagem não recebe autorização do objeto; SHA256 `17398afb5f1a1e4caf8c8e6ecbd3ef00dfb0230f260085a735978f5f60df0e88`.
- `supabase/functions/classify-emoji/index.ts:103–134` — URL do corpo vira imagem enviada ao provedor; SHA256 `17398afb5f1a1e4caf8c8e6ecbd3ef00dfb0230f260085a735978f5f60df0e88`.
- `supabase/functions/classify-sticker/index.ts:39–79` — Ramo de usuário e serviço converge para helper sem autorização do objeto; SHA256 `62eedcddfd167537c4dbc7c9185f1dcaf3dcf09f58b356d8ab77a8530a5d162d`.
- `supabase/functions/classify-sticker/index.ts:102–127` — Imagem privilegiada enviada ao provedor; SHA256 `62eedcddfd167537c4dbc7c9185f1dcaf3dcf09f58b356d8ab77a8530a5d162d`.
- `supabase/functions/_shared/ai-image-input.ts:281–348` — Origin/bucket/path são conferidos; requisição usa credencial de serviço; SHA256 `a5ef80641783858fb58d8f79464cdab38afd35705bfcd8cbdfce1f7f954acc58`.
- `supabase/functions/_shared/ai-image-input.ts:378–398` — Bytes viram data URL; SHA256 `a5ef80641783858fb58d8f79464cdab38afd35705bfcd8cbdfce1f7f954acc58`.
- `supabase/functions/_shared/ai-auth.ts:60–107` — Gate de autenticação/cota é real, sem autorização do objeto; SHA256 `80ec690034f445416c1205b5863a4322fe6e260466d49ffaad45f89dc8633820`.
- `supabase/migrations/20260905030000_private_media_buckets.sql:1–11` — Bucket de clientes privado; SHA256 `893ad17f2d01f3fb410194c62e61289147fafb9756697aa2fe7d44deaa710fd1`.
- `supabase/migrations/20261003142707_whatsapp_media_recebida_select_via_messages.sql:30–50` — SELECT de mídia condicionado a mensagem visível; SHA256 `dcaad99b94189bef2b4960e605f8dffa12de883983f7932c504765dbb93ff84b`.

**Aceite:**

- No ramo de usuário, autorizar a leitura do objeto com identidade do chamador antes de qualquer download privilegiado ou pedido ao modelo.
- Rejeitar locator de contato/mensagem não visível e impedir acesso a imagem arbitrária no bucket, mesmo quando a URL é conhecida.
- Conservar ramo interno de serviço explícito para o webhook e autorizar bibliotecas compartilhadas por sua política própria.
- Fixtures devem distinguir imagem própria, imagem alheia privada, item compartilhado autorizado, origem externa e identidade inválida; a imagem negada não chega ao provedor.

**Limites:** Sem rede de produto, leitura real de Storage, chamada de modelo, SQL/RPC, execução de handler Deno, deploy ou envio nesta revisão. Não é chamada anônima: os gates internos exigem usuário válido. Não se presume verify_jwt=false no gateway; nenhuma exceção dessas rotas existe em config.toml. Policies mais recentes da fonte foram cruzadas com a área database; não foi certificado o estado atual do Storage remoto. R2-API-027 trata URL alternativa na transcrição de áudio com precondição de mensagem visível; este caso é dos classificadores visuais sem esse gate.

**Plano:** P007/IA-004: PARTIAL → PARTIAL; Autorização de leitura de objeto em classificadores de visão; preservar PARTIAL da matriz.; P007/IA-019: PARTIAL → PARTIAL; Minimização exige dados autorizados no prompt; preservar PARTIAL e acrescentar mídia privada sem autorização por objeto.

### R2-INF-023 — Revalidação de contexto fora da RPC deixa análise antiga substituir uma projeção concorrente

Os handlers de analysis/summary leem ai_projection_updated_at no início e o revalidam depois do modelo. A leitura final e persist_conversation_analysis são chamadas separadas. A RPC não recebe a versão esperada: aceita a projeção se seu timestamp atual for <= p_analyzed_at, que o handler gera com new Date() no fim. Se outra análise persiste enquanto a resposta da leitura de revalidação antiga está em trânsito, a antiga recebe current:true e seu timestamp posterior permite substituir a projeção concorrente.

**Precondições:** Duas execuções para o mesmo contato visível partem da mesma versão de projeção e seus contextos/requisições têm ordem relevante. A leitura de revalidação de A captura o estado antes do commit de B, mas A conclui essa leitura e produz p_analyzed_at depois do timestamp usado por B. A saída de A possui sentimento/prioridade a projetar e passa o contrato normal. Nenhuma falha de leitura é necessária.

**Efeito:** A garantia de cancelar resultado superado antes de qualquer persistência não vale nesse interleaving. A análise antiga pode entrar no histórico e assumir a projeção após a análise nova. A transação INSERT+UPDATE continua atômica; o defeito é a ausência de comparação atômica com a versão esperada.

**Evidência no fonte:**

- `supabase/functions/_shared/ai-conversation-pipeline.ts:178–200` — Versão do contexto é lida em uma consulta separada; SHA256 `2aa5c9290cc859bed55c6271b3d4ba9f165e6d6ca845eadaab2dc59bf79dce0f`.
- `supabase/functions/_shared/schemas.ts:440–468` — Revalidação usa snapshot e retorna antes da persistência; SHA256 `7fb6f10bf93306c84c7a4a84b68cb6e53f855e4aa04045dd1e8b96fead3c6cc7`.
- `supabase/functions/ai-conversation-analysis/index.ts:226–272` — Gate externo à RPC e timestamp criado ao concluir; SHA256 `e4731a289d2c7129b40e2281248529e3ab0b26136173323fdf237d4a5347de92`.
- `supabase/functions/ai-conversation-summary/index.ts:194–249` — Mesmo protocolo no resumo; SHA256 `cded06fb6964859231886daab87aad3e0f91d85bba1645c3849888c37dcca969`.
- `supabase/migrations/20260930110000_ai_block03_analysis_persistence.sql:79–83` — Assinatura não recebe versão esperada; SHA256 `348e3d8006109e4e3839c991fd6c5283d82ab4236ecea0c9dafd967f405cea05`.
- `supabase/migrations/20260930110000_ai_block03_analysis_persistence.sql:143–164` — Projeção ordenada apenas por timestamp do payload; SHA256 `348e3d8006109e4e3839c991fd6c5283d82ab4236ecea0c9dafd967f405cea05`.
- `tests/contracts/ai-conversation-analysis-contract.test.ts:110–134` — Testes verificam ordem textual/guarda, sem concorrência; SHA256 `0bc3fd3f155c6932e2b0665bfca0fcbc8eb0914a1b78f523f874b81d1a84b9a9`.
- `tests/contracts/ai-conversation-summary-contract.test.ts:175–200` — Mesmo limite de teste no resumo; SHA256 `8a497126906a472927cfdb2f75aa06bde52921cc88151e8e52ef03a03efb739a`.

**Aceite:**

- Definir identidade/ordem do contexto e levá-la à transação que decide aceitar a análise e projetar o contato.
- Verificar versão esperada sob lock ou condição equivalente, devolvendo cancelled/conflito quando a projeção avançou entre leitura e commit.
- Cobrir o interleaving leitura A → commit B → retorno da leitura A → tentativa de persistir A, preservando o resultado de B.
- Preservar o contrato transacional de análise+projeção e distinguir timestamp de término de identidade/recência do contexto.

**Limites:** Sem rede de produto, leitura real de Storage, chamada de modelo, SQL/RPC, execução de handler Deno, deploy ou envio nesta revisão. A prova executa o helper real e modela explicitamente o predicado SQL verificado; não é execução de PostgreSQL nem medição de concorrência em produção. O controle com leitura final atualizada cancela corretamente. O achado não nega os gates existentes nem a atomicidade da RPC. IA-026 permanece implementada aguardando evidência no seu contrato de persistência completa; não reabrir essa tarefa inteira por este subcontrato de recência.

**Plano:** P007/IA-048: PARTIAL → PARTIAL; Além do descarte lógico no cliente, a garantia de não aplicar contexto superado no servidor exige comparação atômica com a versão; status anterior já PARTIAL e assim permanece.

### R2-INF-024 — Sugestões com JSON inválido para o contrato chegam à interface ou viram frases fixas sem sinal de degradação

ai-suggest-reply extrai um objeto por regex e devolve JSON.parse sem usar SuggestedRepliesOutput. Assim, JSON sintaticamente válido como suggestions:string passa. AISuggestions salva qualquer data.suggestions truthy e renderiza com length e map: uma string não vazia satisfaz a condição e não tem map. Quando o parse falha, a Edge fabrica três frases fixas e responde 200 sem status de degradação, mostrando-as pelo mesmo caminho das sugestões geradas.

**Precondições:** O provedor retorna JSON válido com suggestions fora do formato de array, ou conteúdo que não pode ser parseado. A mesma requisição continua vigente no cliente e sua resposta é aceita pelo descarte lógico existente.

**Efeito:** Shape inválido pode causar falha de renderização ou ausência silenciosa de sugestões; parse inválido apresenta texto padrão como sucesso de geração sem explicitar sua origem. Não há envio automático de WhatsApp nesse caminho.

**Evidência no fonte:**

- `supabase/functions/ai-suggest-reply/index.ts:163–192` — Parsing sem contrato e fallback fixo com HTTP 200; SHA256 `4c90f4ed62d870269d012d8ead3d77a2531fd03291579a8fd4678275925f8a9a`.
- `supabase/functions/_shared/ai-response-contracts.ts:110–120` — Schema de sugestões existe, mas não está aplicado neste handler; SHA256 `b7f4c6f6690e5c02dfbe8b4fea14a03e1ab16357629c823ff70a9542d7b0d38e`.
- `src/components/inbox/AISuggestions.tsx:78–99` — Cliente aceita campo truthy sem validar array; SHA256 `eee9de6283f635d6877e92efc5184a63701d638240e9860057d362061211135a`.
- `src/components/inbox/AISuggestions.tsx:180–217` — Render pressupõe array e texto selecionável; SHA256 `eee9de6283f635d6877e92efc5184a63701d638240e9860057d362061211135a`.
- `tests/contracts/_adv_edge_legacy_producers.test.ts:197–208` — Teste documenta/congela o defeito; não é evidência de contrato correto; SHA256 `148dc546dd551b196d4ceb22167e396012e98c52e6552298d3468e605cb86746`.

**Aceite:**

- Validar o envelope e cada sugestão antes de retornar/renderizar, inclusive tipo do array, quantidade e texto não vazio.
- JSON válido com shape errado deve produzir estado de erro/degradação explícito e não entrar no render normal.
- Se frases locais forem política desejada, identificá-las como fallback local e permitir revisão consciente; não apresentá-las como resultado normal do modelo.
- Cobrir array ausente/string/objeto, itens inválidos, JSON malformado e três sugestões válidas, usando respostas sintéticas do provedor.

**Limites:** Sem rede de produto, leitura real de Storage, chamada de modelo, SQL/RPC, execução de handler Deno, deploy ou envio nesta revisão. Parse/fallback real foi extraído por AST; a consequência no render é sustentada pelo consumidor e checagem de tipo, sem sessão React/browser. Teste de inventário adversarial do próprio repositório já descreve o defeito; ele não consta como mecanismo nos 104 findings reconciliados.

**Plano:** P007/IA-025: PARTIAL → PARTIAL; JSON válido com estrutura errada permanece sem validação em ai-suggest-reply/AISuggestions; conservar PARTIAL com este produtor/consumidor explícito.; P007/IA-142: PARTIAL → PARTIAL; Origem das três frases de fallback não é identificada ao consumidor; conservar PARTIAL.

### R2-INF-025 — Reescrita atrasada substitui edição mais nova do mesmo rascunho

AIRewriteButton e AIEnhanceButton capturam inputValue no clique, aguardam ai-enhance-message e aplicam enhanced sem comparar o rascunho corrente nem uma geração de requisição. O campo de mensagem continua editável. No caminho mobile de ChatInputArea, o botão permanece montado enquanto há texto e seu onRewrite escreve diretamente no textarea via setNativeValue; portanto uma edição feita durante o await é substituída pelo resultado do texto anterior.

**Precondições:** Componente continua montado no mesmo contato/conversa e recebe retorno tardio bem-sucedido. Usuário modifica o rascunho enquanto a reescrita está em andamento; no caminho mobile mantém texto não vazio.

**Efeito:** Perda da edição recente do rascunho e aplicação de conteúdo relativo a uma versão anterior. O usuário ainda precisa enviar a mensagem; o achado não presume envio, troca de contato ou sobrevivência do componente ao remount.

**Evidência no fonte:**

- `src/components/inbox/chat/AIRewriteButton.tsx:33–63` — Resposta aplicada após await sem comparar texto/geração; SHA256 `e350755f36fe88aaf8f3c22c7f3ba7497f7d14c92a7577564a71e38141a7349c`.
- `src/components/inbox/chat/AIEnhanceButton.tsx:45–92` — Mesmo caminho no aprimoramento e undo captura texto anterior; SHA256 `5543da64064a3d9e5ad9068cca08c4878124038144074aff8df455a51d0a4d2e`.
- `src/components/inbox/chat/ChatInputArea.tsx:187–201` — Textarea permanece editável; SHA256 `2afe2fca8725cc54161998a384a3eb332cc2488e4535d97121f97a80fcbaf70c`.
- `src/components/inbox/chat/ChatInputArea.tsx:267–274` — Caminho mobile montado para texto não vazio e aplicação via setter; SHA256 `2afe2fca8725cc54161998a384a3eb332cc2488e4535d97121f97a80fcbaf70c`.
- `src/components/inbox/chat/useChatInputLogic.ts:112–124` — Setter aplica diretamente ao campo e emite input; SHA256 `5f87bfd6aedf159c9724cb33adc752456040bad3315f149de6c3152022de17f3`.
- `src/components/inbox/chat/ChatMessageInput.tsx:140–149` — Consumidor do Enhance compartilha o callback do textarea; SHA256 `59fcd6aa95ee33218b3f9ce83a99fcae7afd3caaf96c0eaebf25bcd19099bee9`.

**Aceite:**

- Associar reescrita à versão do rascunho e só aplicar automaticamente se texto/identidade ainda corresponderem ao clique.
- Ao editar durante a requisição, preservar a edição e descartar ou oferecer o resultado antigo como opção revisável.
- Testar edição no mesmo contato durante await e retorno fora de ordem; o texto novo deve permanecer.
- Definir o escopo de desfazer de forma que não restaure silenciosamente um rascunho anterior após nova edição.

**Limites:** Sem rede de produto, leitura real de Storage, chamada de modelo, SQL/RPC, execução de handler Deno, deploy ou envio nesta revisão. Callbacks reais executados com invoke/setters falsos; wiring do textarea verificado no fonte, sem teste React/DOM. Revisão cruzada com Inbox e grill_me_primary_review excluiu duplicação com UniversityHelp (R2-MOD-012) e AIGenerateDialog (R2-MOD-040).

**Plano:** P007/IA-048: PARTIAL → PARTIAL; Critério inclui rascunho; os consumidores Enhance/Rewrite não têm guarda de geração. Preservar PARTIAL e abrir este ramo sem reclassificar consumidores que já têm proteção.

## Duplicações evitadas e limites adicionais

- `IA-AUDIO-001` (duplicado): Áudio-meme usa nome/URL, não conteúdo sonoro; roteamento central não muda esse fato. Não criar outro ID.
- `IA-CHATBOT-001` (duplicado): connectionId ignorado em fluxo/histórico; retorno de flags não comprova transferência/envio. Manter achado anterior.
- `IA-METRICS-001` (extensão_sem_nova_contagem): UI ignora resultados da Edge e usa proxies locais. Confidence zero no classificador vira 0.5, mas não atribuir esse valor à UI que ignora esse retorno.
- `IA-TIMEOUT-001` (extensão_sem_nova_contagem): Timer do download é limpo após headers antes de arrayBuffer; limite de bytes é verificado depois da leitura integral. Novo consumidor do mesmo padrão de prazo, sem duplicar o ID.
- `IA-QUOTA-001` (contexto_sem_nova_contagem): Handlers calculados passam guard mas não geram chamada ao modelo/log de consumo pelo dispatcher. Contabilização de ação versus consumo já está na auditoria anterior/DB.

O texto de requestId em ai-enhance-message é ecoado na resposta, mas não enviado ao dispatcher; isso foi registrado na cobertura, sem criar mais um ID genérico de correlação. Nenhum dos handlers deste lote passa req.signal ao dispatcher; o cancelamento observado nos consumidores migrados é lógico. Chatbot Testar Conexão usa IDs `test`, incompatíveis com o schema UUID; essa fronteira permanece documentada sem alegar falha do bot inteiro.

## Integração e lacunas

Cobertura deste lote: 44 arquivos, 18 semânticos integrais (12 primários e suporte integral explícito), 26 dirigidos. Os contratos repetitivos e dependências fora das faixas não foram promovidos por mera presença.

Os 21 achados INF anteriores e sua revisão de infraestrutura permanecem preservados. Os quatro novos IDs são integrados aos arquivos principais da mesma área, sem alterar os relatórios de providers/database/Inbox. As tarefas IA relacionadas já eram PARTIAL; não se reabriu uma tarefa DONE_VERIFIED nem se anulou o trabalho dos consumidores que têm gates válidos.

- Sem ensaio pago, leitura Storage real, credenciais reais, execução Deno do handler, RPC/SQL, deploy, rede de produto ou sessão de usuário.
- Políticas e grants considerados como fonte versionada; estado publicado/currente remoto não certificado.
- Helpers centrais ai-generate/ai-routing/ai-usage e migrações/RLS completas ficam com providers/database; somente faixas adicionais de suporte declaradas aqui.
- Provas sintéticas usam funções puras/módulo local revisado e stubs; modelo do predicado SQL não é teste de PostgreSQL.
- Consumidores fora das faixas declaradas, todos os layouts e toda combinação de provedor não foram promovidos a leitura integral.
