# Reauditoria de infraestrutura, CI/CD, scripts e provas

Baseline: `da307ba5626dce892f0b37cb6762463f55d14a96`. Escopo: leitura de fonte e documentação com probes sintéticos offline. Comparação: 104 achados anteriores e tarefas P006 preservadas.

## Resultado: 43 mecanismos adicionais (8 P1, 31 P2, 4 P3)

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
| R2-INF-026 | P2 | Diagnóstico marca falhas rápidas de banco/Storage e Realtime não testado como saudáveis | novo; lote observabilidade delegado |
| R2-INF-027 | P2 | SLA de 24h e disponibilidade de 7 dias usam janela selecionada e aprovam ausência de checks | novo; lote observabilidade delegado |
| R2-INF-028 | P2 | Gráfico de mensagens perde linhas válidas ao montar buckets de 7 dias e colapsa buckets de 1 hora | novo; lote observabilidade delegado |
| R2-INF-029 | P2 | Score de desempenho trata APIs ausentes como memória livre, RTT zero e conexão 4g | novo; lote observabilidade delegado |
| R2-INF-030 | P2 | Limpar snapshots informa remoção mesmo quando DELETE devolve erro | novo; lote observabilidade delegado |
| R2-INF-031 | P3 | Coletor local rotula agregações incompatíveis como CLS e INP | novo; lote observabilidade delegado |
| R2-INF-032 | P2 | Busca antiga do catálogo pode substituir os resultados da consulta atual na paleta | novo; lote UI/effects/performance |
| R2-INF-033 | P2 | Três ações padrão da paleta são exibidas sem executor e apenas fecham o diálogo | novo; lote UI/effects/performance |
| R2-INF-034 | P3 | Acesso rápido inicial fica fora da navegação por setas e Enter da paleta | novo; lote UI/effects/performance |
| R2-INF-035 | P3 | Progress aplica value à barra visual e o descarta antes do Root semântico | novo; lote UI/effects/performance |
| R2-INF-036 | P3 | Checklist marca tema como concluído quando a consulta não devolve configuração | novo; lote layout/onboarding |
| R2-INF-037 | P2 | Controle de movimento reduzido e transições de rota usam preferências desconectadas | novo; lote layout/onboarding |
| R2-INF-038 | P2 | Tour padrão aponta para dois alvos ausentes e avança até a conclusão sem mostrá-los | novo; lote layout/onboarding |
| R2-INF-039 | P2 | Modais próprios anunciam modalidade sem implementar o contrato de foco | novo; lote layout/onboarding |
| R2-INF-040 | P2 | Falha de leitura da telemetria aparece como sistema com bom desempenho | novo; telemetria e tratamento de erros |
| R2-INF-041 | P2 | ErrorBoundary ignora fallback nulo usado para retirar overlays com falha | novo; telemetria e tratamento de erros |
| R2-INF-042 | P2 | Gate E98 de contraste descarta violações serious da regra que promete proteger | novo; testes e contratos de prova |
| R2-INF-043 | P2 | Fixture para dispensar onboarding procura nome acessível removido e deixa o modal ativo | novo; testes e contratos de prova |



## Evidência executada e limites

`offline-probes.json` contém 9 resultados sintéticos. Os executáveis usados foram módulos Node revisados, uma função TS extraída e doubles de fetch. A rede de produto foi bloqueada nos probes; nenhuma instrução SQL foi encaminhada a banco. `probe-source-pins.json` fixa 25 entradas e o probe exige o HEAD e os hashes antes de carregar o código.

`meta-tests.json` registra 15 testes existentes com sucesso. Eles demonstram que a suite do próprio repositório aceita o estado atual dos arquivos de runtime e do SQL pós-apply. Não demonstram que psql consegue executá-los. Essa diferença é o ponto de R2-INF-004/005.

## Cobertura real desta área

Foram inventariados 785 arquivos: 505 com revisão semântica, 55 com revisão dirigida e 225 com revisão estrutural. A segunda passagem registra 93 arquivos com faixas, SHA256, consumidor, efeitos e avaliação própria; 91 foram lidos integralmente e dois arquivos de ambiente apenas por nomes. Esses números são leitura de fonte, não cobertura de execução.

| Camada | Semântica | Dirigida | Estrutural | Total |
|---|---:|---:|---:|---:|
| ai_delegated | 12 | 0 | 0 | 12 |
| ai_support | 6 | 22 | 0 | 28 |
| config_and_support | 25 | 6 | 1 | 32 |
| e2e | 38 | 0 | 42 | 80 |
| entrypoint_support | 3 | 0 | 0 | 3 |
| infrastructure | 5 | 0 | 0 | 5 |
| layout_onboarding_delegated | 25 | 0 | 0 | 25 |
| layout_onboarding_support | 11 | 9 | 0 | 20 |
| observability_delegated | 27 | 0 | 0 | 27 |
| observability_support | 7 | 3 | 0 | 10 |
| scripts/catalog | 2 | 0 | 0 | 2 |
| scripts/ci | 64 | 0 | 8 | 72 |
| scripts/db-audit | 75 | 1 | 107 | 183 |
| scripts/db-tests | 6 | 0 | 0 | 6 |
| scripts/edge-deploy | 27 | 0 | 5 | 32 |
| scripts/graphify | 1 | 0 | 0 | 1 |
| scripts/lib | 2 | 0 | 0 | 2 |
| scripts/mutation | 1 | 0 | 1 | 2 |
| scripts/qa | 6 | 0 | 1 | 7 |
| scripts/talkx | 3 | 0 | 0 | 3 |
| scripts/team-chat-db-validate.mjs | 1 | 0 | 0 | 1 |
| scripts/team-chat-db-validate.unit.mjs | 1 | 0 | 0 | 1 |
| scripts/ui-audit | 3 | 0 | 0 | 3 |
| shell_contract_support | 0 | 2 | 0 | 2 |
| src/test | 2 | 0 | 6 | 8 |
| telemetry_error_delegated | 7 | 0 | 0 | 7 |
| telemetry_error_support | 3 | 1 | 0 | 4 |
| test_review | 31 | 0 | 0 | 31 |
| tests/contracts | 4 | 3 | 54 | 61 |
| ui_performance_delegated | 87 | 0 | 0 | 87 |
| ui_performance_support | 4 | 8 | 0 | 12 |
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

## Ampliação finita — observabilidade, diagnósticos e desempenho

### Revisão de monitoramento, diagnósticos e desempenho

Fonte fixa: `da307ba5626dce892f0b37cb6762463f55d14a96`. Leitura integral de 27 arquivos primários,4.550 linhas; 37 arquivos no lote incluindo apoios, 32 semânticos integrais e 5 dirigidos. Não houve execução do produto.

## Resultado

Seis achados adicionais: cinco P2 e um P3. Os seis casos sintéticos abaixo sustentam esses seis achados; não são seis descobertas adicionais. As rotas passam pelo gate de papéis/permissões do ViewRouter. Não há alegação de acesso anônimo, incidente de produção ou indisponibilidade real.

| ID | Prioridade | Contrato observado |
|---|---|---|
| R2-INF-026 | P2 | Diagnóstico marca falhas rápidas de banco/Storage e Realtime não testado como saudáveis |
| R2-INF-027 | P2 | SLA de 24h e disponibilidade de 7 dias usam janela selecionada e aprovam ausência de checks |
| R2-INF-028 | P2 | Gráfico de mensagens perde linhas válidas ao montar buckets de 7 dias e colapsa buckets de 1 hora |
| R2-INF-029 | P2 | Score de desempenho trata APIs ausentes como memória livre, RTT zero e conexão 4g |
| R2-INF-030 | P2 | Limpar snapshots informa remoção mesmo quando DELETE devolve erro |
| R2-INF-031 | P3 | Coletor local rotula agregações incompatíveis como CLS e INP |

## Evidência comportamental delimitada

| Probe | Fonte realmente executada | Fixture e resultado | Limite |
|---|---|---|---|
| INF-OBS-P01 | callback fetchSystemHealth | SELECT/List com error rápido → DB/Storage saudáveis; Realtime constante; Edge.error → degraded no controle | SDK e latência falsos; UI lida no fonte |
| INF-OBS-P02 | fetchData + computeUptime | mesmos dois checks →100% em1h,50% em24h; vazio→100%/0checks | Não mede SLA real |
| INF-OBS-P03 | fetchData e loop de buckets | duas mensagens7d →total2/plot1; seis âncoras1h→duas chaves | Dados completos e UTC explícito |
| INF-OBS-P04 | collectMetrics | memória/rede ausentes→score100; controle observado90%/2g/500ms→63 | Payload capturado, sem INSERT |
| INF-OBS-P05 | clearOldSnapshots | DELETE.error resolvido→sucesso/recarga; rejeição→toast.error | Nenhum DELETE real |
| INF-OBS-P06 | módulo web-vitals completo em VM | CLS0.12 vs referência0.06; INP1000 vs160 em50interações | Coletor próprio local, sem Vercel RUM |

Os sete arquivos executados como texto e o compilador foram verificados por SHA256 antes da importação do compilador. VM recebeu interfaces falsas explícitas; nenhum hook React, SDK, handler Edge ou biblioteca de analytics do produto foi importado. Compilar trechos com transpileModule não é typecheck, build ou suíte completa.

## R2-INF-026 — Diagnóstico marca falhas rápidas de banco/Storage e Realtime não testado como saudáveis

fetchSystemHealth mede a duração de consultas de banco e listagem de Storage, mas não inspeciona seus campos error. O status depende apenas de latência; um erro que retorna rápido vira healthy. Realtime é definido diretamente como healthy sem subscribe/ack/status. DiagnosticsView converte isso em Saudável, Canal de tempo real ativo e, quando a Edge também retorna sem erro, Todos os sistemas operacionais.

**Precondições:** Usuário admitido no gate da rota abre diagnósticos. A consulta/listagem resolve com error em menos dos limiares500ms/1000ms, ou o canal Realtime está indisponível sem erro correspondente nas outras consultas.

**Efeito:** O operador pode interpretar falha de permissão/serviço como saúde confirmada; o painel não distingue teste com falha, teste não realizado e sucesso. O achado não presume que todo error prove indisponibilidade global: ele prova que a saúde exibida não é sustentada pela coleta.

**Evidência:**

- `src/hooks/system/useDiagnosticsData.ts:137–167` — Duração usada como status; error ignorado e realtime constante. SHA256 `c665f66b86eb8a1116c77e34150d25fa0554a82e75684dc9c7ed867d4b46628a`.
- `src/hooks/system/useDiagnosticsData.ts:249–275` — Coleta inicial/periódica e refresh. SHA256 `c665f66b86eb8a1116c77e34150d25fa0554a82e75684dc9c7ed867d4b46628a`.
- `src/components/diagnostics/DiagnosticsView.tsx:31–42` — healthy é apresentado como Saudável. SHA256 `9e23c355bbd03e5be2ee5d8102d88b32d551505b8032156d42ae2d862092ed8d`.
- `src/components/diagnostics/DiagnosticsView.tsx:72–86` — Realtime ativo sem medição e hook consumidor. SHA256 `9e23c355bbd03e5be2ee5d8102d88b32d551505b8032156d42ae2d862092ed8d`.
- `src/components/diagnostics/DiagnosticsView.tsx:237–270` — Resumo de todos os sistemas operacionais. SHA256 `9e23c355bbd03e5be2ee5d8102d88b32d551505b8032156d42ae2d862092ed8d`.
- `src/pages/ViewRouter.tsx:129–151` — Gate de autorização precede montagem do painel. SHA256 `6cf287e71a19309582ed6406005bd43710fed41505b6c8127b825e130bf4c530`.

**Critérios de aceite:**

- Representar sucesso, falha de coleta e não testado separadamente; só avaliar latência de resultado bem-sucedido.
- Marcar Realtime a partir de estado/ack observado com validade temporal ou mostrar não medido.
- Teste com SELECT/List retornando error rápido não pode produzir Saudável; falha de autorização deve ser distinguida de serviço fora do ar.
- Manter controle existente de error nas Edge Functions e derivar resumo apenas de sinais válidos.

**Limites:** Sem browser autenticado, SQL, consulta de saúde/Storage, modelo pago, deploy ou rede de produto nesta revisão. Probe executa callback real com interfaces falsas; texto da UI foi verificado no fonte, sem renderização React. API001/API037 cobrem autorização e contagens globais da Edge webhook-diagnostic, que são mecanismos separados. Não se alegou acesso anônimo às rotas.

## R2-INF-027 — SLA de 24h e disponibilidade de 7 dias usam janela selecionada e aprovam ausência de checks

useMonitoringData consulta connection_health_logs a partir do período selecionado (padrão12h). computeUptime filtra mais24h sobre esse resultado já reduzido, sem recuperar as horas faltantes, e devolve100% quando não há checks. O mesmo estado abastece Uptime24h e SLA últimas24h; o heatmap7dias recebe os mesmos logs filtrados. Sua grade indica corretamente células sem dados, mas o badge agregado também mostra100% no vazio e o gauge de SLA diz Atingido.

**Precondições:** Há seleção inferior à janela anunciada, ou o conjunto de checks resolvido está vazio. Para o caso numérico, um check saudável está na última hora e outro com falha está oito horas antes, ambos nas últimas24h.

**Efeito:** Sem mudança dos checks, selecionar1h produz uptime100% e selecionar24h produz50%, enquanto o texto de SLA permanece24h. Zero checks resulta SLA atingido. Não é medida observada de disponibilidade ou violação real de contrato de serviço; é inconsistência na janela e na suficiência do dado usado pelo painel.

**Evidência:**

- `src/components/monitoring/hooks/useMonitoringData.ts:9–18` — Filtro adicional24h e default100% sem amostras. SHA256 `2f866d9a0e6d6ea033f64f2063f50feacf684c4a873616e3e0f408a2d079d7ee`.
- `src/components/monitoring/hooks/useMonitoringData.ts:68–83` — Consulta limitada pelo período antes de calcular uptime. SHA256 `2f866d9a0e6d6ea033f64f2063f50feacf684c4a873616e3e0f408a2d079d7ee`.
- `src/components/monitoring/hooks/useEvolutionMonitoring.ts:10–23` — Período inicial12h e encaminhamento da seleção. SHA256 `432cee260294b361c1d943bd2aa7043f60784c08290691ba8928b00692a6ab1d`.
- `src/components/monitoring/MonitoringStatsCards.tsx:83–92` — Título Uptime24h e Sem dados apenas no subtítulo. SHA256 `6329681044c353e56a8cf0041dda9d663e55a3aee50090548caa5fcc59ee6237`.
- `src/components/monitoring/MonitoringSLAPanel.tsx:16–42` — Gauge interpreta100 como SLA atingido. SHA256 `9b0edabce5756c3f769f552641ab09c5fda09c7faa524908e3196122e64b3cee`.
- `src/components/monitoring/MonitoringSLAPanel.tsx:46–69` — Descrição últimas24h e counts. SHA256 `9b0edabce5756c3f769f552641ab09c5fda09c7faa524908e3196122e64b3cee`.
- `src/components/monitoring/EvolutionMonitoringDashboard.tsx:310–328` — Mesmo dataset encaminhado ao SLA e heatmap. SHA256 `97802933f3d40202b9b802b28f0a90c1a671979e46e7aa37e82a04b703fea257`.
- `src/components/monitoring/MonitoringAvailabilityHeatmap.tsx:43–89` — Grade 7 dias, células vazias diferenciadas e agregado vazio100. SHA256 `1aac00d58a918f0ba45d98c3df251108f0fa4c73fb63e99d7a4b03e88741c6b0`.

**Critérios de aceite:**

- Consultar a janela prometida por cada painel ou ajustar seu título, critério e tooltip à seleção efetiva.
- Representar ausência de checks como dado insuficiente, sem sucesso do SLA ou porcentagem100 por default.
- Definir e mostrar janela real/quantidade/cobertura de checks; tratar limite2000 e paginação antes de afirmar completude.
- Fixar teste com check falho fora de1h mas dentro de 24h, e caso zero checks; preservar o estado cinza correto da grade.

**Limites:** Sem browser autenticado, SQL, consulta de saúde/Storage, modelo pago, deploy ou rede de produto nesta revisão. Probe usa duas linhas sintéticas e queries filtradas em memória; nenhum dado real de disponibilidade foi coletado. Porcentagem de checks não é automaticamente disponibilidade ponderada por duração. Esta auditoria não impõe uma nova definição de SLA; exige coerência com a janela/estado anunciados. Rótulos adicionais Checks(7d) sobre últimos50 e Última hora sobre health logs sem cutoff constam da cobertura como extensões de apresentação, sem novos IDs.

## R2-INF-028 — Gráfico de mensagens perde linhas válidas ao montar buckets de 7 dias e colapsa buckets de 1 hora

fetchData calcula buckets de tamanhos variáveis, mas usa chaves de hora civil tanto para a âncora quanto para cada mensagem. Em7d há sete âncoras diárias na hora atual; mensagens de outras horas do dia não encontram chave e são ignoradas no gráfico, embora contem no total. Em1h seis âncoras de10min geram chaves HH:00 repetidas, reduzindo a resolução a uma ou duas entradas.

**Precondições:** Resposta de messages contém linhas válidas dentro do período selecionado; não depende de erro, truncamento de API ou dados malformados. Em7d ao menos uma mensagem está em hora diferente da âncora diária.

**Efeito:** O volume/forma da série apresentados ao operador podem divergir do tráfego consultado. No probe, duas mensagens válidas somam total2 e apenas1 chega à área plotada; em1h seis buckets previstos viram dois.

**Evidência:**

- `src/components/monitoring/hooks/types.ts:3–13` — Duração e quantidade de buckets por período. SHA256 `4564f84805039c7199daca72211a4f91425e6e169bfa2a2f5f3ec941864286c9`.
- `src/components/monitoring/hooks/useMonitoringData.ts:84–104` — Totais e chave por hora incompatível com bucketSize. SHA256 `2f866d9a0e6d6ea033f64f2063f50feacf684c4a873616e3e0f408a2d079d7ee`.
- `src/components/monitoring/EvolutionMonitoringDashboard.tsx:196–206` — Cards e gráfico consomem o mesmo messageStats. SHA256 `97802933f3d40202b9b802b28f0a90c1a671979e46e7aa37e82a04b703fea257`.
- `src/components/monitoring/MonitoringMessageChart.tsx:37–73` — Série e período são apresentados ao usuário. SHA256 `add3ef18394dd94b624f1272a6d528df92316ac76351004105b6013cd50ee4bf`.

**Critérios de aceite:**

- Agrupar por índice temporal floor((timestamp-início)/bucketSize), ou por uma política equivalente explicitamente definida, e formatar o rótulo somente após agrupar.
- Garantir que cada mensagem elegível entre em exatamente um bucket e que soma dos buckets corresponda aos totais do mesmo conjunto.
- Testar limites inicial/final, horas diferentes no mesmo dia em7d, seis intervalos10min em1h e fusos/virada de dia.

**Limites:** Sem browser autenticado, SQL, consulta de saúde/Storage, modelo pago, deploy ou rede de produto nesta revisão. Probe executa o callback real e as funções auxiliares com respostas completas em memória; usa UTC explicitamente. Não inferido volume real, limite efetivo do PostgREST ou comportamento em horário de verão a partir do caso sintético.

## R2-INF-029 — Score de desempenho trata APIs ausentes como memória livre, RTT zero e conexão 4g

collectMetrics transforma ausência de performance.memory em0MB/256MB e0% de uso, e ausência de navigator.connection em4g/RTT0. Esses valores recebem status good e entram com o mesmo peso no score; o payload salvo não inclui uma indicação de não medido. Navegação/pintura ausentes também viram0. A UI pode declarar Excelente com parcela relevante dos critérios inventada como default.

**Precondições:** Navegador não fornece memory ou connection (ou entradas de timing ainda não estão disponíveis). Os demais critérios têm valores bons para o exemplo100; gravação real depende de profile.id e sucesso do INSERT.

**Efeito:** O score e o histórico tentado confundem desconhecido com bom. No mesmo fixture de navegação/DOM, APIs ausentes dão100 pontos; memória90%,2g e RTT500 observados dão63. Isso não mede diferença real entre navegadores, apenas demonstra a contribuição indevida dos valores de substituição.

**Evidência:**

- `src/components/performance/PerformanceMonitor.tsx:26–56` — Defaults e critérios good das medições ausentes. SHA256 `a5a7ad68039227a5fa4c45a141f8fb99021ca0edfc944fc31310e3206fe707f1`.
- `src/components/performance/PerformanceMonitor.tsx:70–97` — Score, payload e coleta periódica. SHA256 `a5a7ad68039227a5fa4c45a141f8fb99021ca0edfc944fc31310e3206fe707f1`.
- `src/components/performance/PerformanceMonitor.tsx:165–187` — Texto Excelente e apresentação do score/histórico. SHA256 `a5a7ad68039227a5fa4c45a141f8fb99021ca0edfc944fc31310e3206fe707f1`.
- `src/hooks/analytics/usePerformanceSnapshots.ts:32–55` — Payload segue para INSERT se profile existir. SHA256 `53af871c26874ca6981a66dc74d2926a1f5641c73bd077a577e9c4e4877d43d0`.
- `src/pages/ViewRouter.tsx:80–84` — Rota produtiva de PerformanceMonitor. SHA256 `6cf287e71a19309582ed6406005bd43710fed41505b6c8127b825e130bf4c530`.

**Critérios de aceite:**

- Usar estado indisponível/não medido para APIs ou entries ausentes; não fabricar valor numérico normal.
- Calcular score apenas sobre medições válidas e exibir sua cobertura, ou não emitir score quando a amostra for insuficiente.
- Persistir validade/origem das medições para que histórico não trate defaults como observações.
- Teste com memory/connection ausentes deve mostrar cobertura parcial e nenhum4g ou memória livre presumidos; controle com APIs válidas deve manter classificação correspondente.

**Limites:** Sem browser autenticado, SQL, consulta de saúde/Storage, modelo pago, deploy ou rede de produto nesta revisão. Callback real executado com objetos de navegador falsos; payload capturado em saveSnapshot falso, sem gravação real. Testes de metricThresholds isolados não provam a coleta: PerformanceMonitor possui thresholds inline; teste de suporte inicial foi lido, não executado como gate.

## R2-INF-030 — Limpar snapshots informa remoção mesmo quando DELETE devolve erro

clearOldSnapshots aguarda a cadeia delete().lt(), mas ignora o resultado com error. Como erro normal de SDK pode resolver a Promise, o catch não roda, o hook dispara Dados antigos removidos e recarrega histórico. O botão Limpar antigos da rota performance chama esse caminho diretamente.

**Precondições:** A chamada DELETE retorna erro por envelope resolvido, em vez de lançar rejeição. Usuário está admitido na rota performance; não se pressupõe qual política/serviço originou o erro.

**Efeito:** Confirmação falsa de uma ação solicitada e nenhuma orientação para tentar novamente ou corrigir a causa. O probe faz o mesmo callback mostrar sucesso para error resolvido e erro para Promise rejeitada.

**Evidência:**

- `src/hooks/analytics/usePerformanceSnapshots.ts:78–90` — Retorno de DELETE ignorado antes da confirmação. SHA256 `53af871c26874ca6981a66dc74d2926a1f5641c73bd077a577e9c4e4877d43d0`.
- `src/components/performance/PerformanceMonitor.tsx:145–161` — Botão produtivo chama clearOldSnapshots. SHA256 `a5a7ad68039227a5fa4c45a141f8fb99021ca0edfc944fc31310e3206fe707f1`.
- `src/hooks/analytics/usePerformanceSnapshots.ts:58–76` — loadHistory verifica seu próprio error, mas não confirma a remoção. SHA256 `53af871c26874ca6981a66dc74d2926a1f5641c73bd077a577e9c4e4877d43d0`.

**Critérios de aceite:**

- Inspecionar error do DELETE antes de anunciar sucesso e propagar causa de falha de forma tratável.
- No erro, preservar estado e avisar que a limpeza não foi confirmada; não converter simples recarga em prova de remoção.
- Cobrir envelope {error} e rejeição, mais controle de sucesso; manter período selecionado ao recarregar.

**Limites:** Sem browser autenticado, SQL, consulta de saúde/Storage, modelo pago, deploy ou rede de produto nesta revisão. Nenhuma exclusão real executada e nenhuma inferência de RLS/global delete baseada na ausência de filtro de profile_id. Hook coordenado com revisão de módulos: não há ID duplicado criado por ela para este callback.

## R2-INF-031 — Coletor local rotula agregações incompatíveis como CLS e INP

O observador CLS soma shifts por toda a sessão visível, sem separar janelas; o INP usa o maior duration bruto, sem contar interações ou desconsiderar um pico por 50. As definições atuais usam maior janela de shifts para CLS e descartam um maior valor de interação por 50 no INP. O erro se manifesta no Map/log do coletor próprio inicializado em main, cujo getRating consulta o budget correto sobre um valor agregado incorretamente.

**Precondições:** Navegador fornece entries de layout-shift/event e ocorre flush. CLS: shifts separados por mais de1s; INP:50 interações distintas com um pico isolado.

**Efeito:** Diagnóstico local contra o budget pode classificar estabilidade/responsividade incorretamente. No fixture, dois shifts0.06 separados por2s produzem0.12 em vez de0.06;50 interações com pico1000 e segundo valor160 produzem1000 em vez de160. PrioridadeP3 porque o consumidor confirmado é local/desenvolvimento: info é suprimido em produção e não foi identificado consumidor produtivo adicional de getWebVitalsReport.

**Evidência:**

- `src/lib/web-vitals.ts:34–64` — Threshold correto é aplicado ao valor agregado e salvo no Map/log. SHA256 `1ec1771de586802ede66a77abb32f033ad36607c934c42b65b8c2fa54acd562d`.
- `src/lib/web-vitals.ts:111–141` — Soma de shifts e máximo bruto de event.duration. SHA256 `1ec1771de586802ede66a77abb32f033ad36607c934c42b65b8c2fa54acd562d`.
- `src/lib/web-vitals.ts:143–166` — Flush por visibilidade/pagehide. SHA256 `1ec1771de586802ede66a77abb32f033ad36607c934c42b65b8c2fa54acd562d`.
- `src/lib/web-vitals.ts:185–187` — Export de relatório local. SHA256 `1ec1771de586802ede66a77abb32f033ad36607c934c42b65b8c2fa54acd562d`.
- `src/main.tsx:30–33` — Coletor próprio e Speed Insights são inicializações separadas. SHA256 `df91ccf7d1d34c0321952a8ac9dcf9849a8b8092190912382d16c3aa9c742a1f`.
- `src/lib/logger.ts:50–64` — info/debug desativados fora de DEV. SHA256 `f45d5ba0fed8fcd36784de3223c995206f9767e7c961d5dab5f4badca8e1666e`.
- `src/lib/__tests__/web-vitals-budget.test.ts:22–49` — Teste verifica targets/rating, sem exercitar observadores ou agregação. SHA256 `3990316d15c353fbc44f021f7e0a3c273fb96e66c9e8b1bf408d231ce15c481e`.

**Critérios de aceite:**

- Usar implementação mantida das métricas ou implementar integralmente janelaCLS e cálculoINP por interação com os limites definidos.
- Preservar o consumo dos thresholds do budget, separado da medição do valor.
- Comparar fixtures de shifts separados/mesma janela e49/50+ interações com referência; incluir visibilidade e BFCache conforme a política adotada.
- Não usar o resultado local como prova de métricas do Speed Insights sem demonstrar a cadeia real de dados.

**Limites:** Sem browser autenticado, SQL, consulta de saúde/Storage, modelo pago, deploy ou rede de produto nesta revisão. Probe executa o módulo completo em VM com PerformanceObserver/DOM/logger falsos e entradas sintéticas; não certifica Web Vitals de browser ou tráfego real. Nenhuma falha atribuída à coleta independente do Speed Insights ou aos gates de tamanho de bundle. P008E36 e P041033 já são PARTIAL; apenas o subcontrato do coletor local recebe evidência adicional.

**Planos:** P008/E36 permanece PARTIAL: Agregação CLS/INP do coletor próprio, sem alterar aceite de budget ou statusPARTIAL.; P041/033 permanece PARTIAL: Coletor local e qualidade do valor; envio/RUM independente continua com limites já registrados.

**Definições primárias consultadas:** [CLS](https://web.dev/articles/cls) e [INP](https://web.dev/articles/inp), consultadas em04/10/2026. A primeira usa a maior janela de shifts; a segunda descarta um pico por 50interações. Essas definições fundamentam somente a referência dos fixtures do coletor local.

## Controles preservados e observações sem novo ID

- O roteador espera papéis/permissões e nega acesso antes de montar views restritas. Os achados de UI pressupõem admissão no gate.
- ConnectionHealthPanel faz polling de dados armazenados com sinal/timeout e usa ação manual para a Edge. Não se atribuiu auto-fix a esse polling.
- A grade do heatmap diferencia corretamente células sem dados. A falha está no agregado/janela anunciados, não na cor de toda célula vazia.
- O cartão Checks(7d) de ConnectionHealthPanel usa os últimos50checks, sem cutoff7d; MonitoringEventTimeline mistura mensagens1h com15healthlogs sem cutoff1h. São extensões do contrato temporal documentadas na cobertura, sem multiplicar o número de mecanismos.
- Conectar/reiniciar trata data.error===true; não foi registrada falha genérica de toast nesses ramos.
- HotRoutePrefetcher está montado, respeita saveData/2g e tem cancel flag para novos imports. Ganho de navegação permanece sem medição, coerente com P008E35.
- OptimizedImage/Avatar, VirtualizedList/Grid e Prefetcher legado tiveram leitura integral, mas a busca de consumidores produtivos só encontrou definições/exports nos caminhos relevantes. Estados de imagem ou callbacks de fim latentes não foram promovidos a problemas de fluxo ativo.
- Testes de threshold/getRating não exercitam automaticamente coleta; o teste web-vitals-budget completo valida a origem dos alvos, não o algoritmo dos observadores.
- SentryIntegrationView, AIProviderHealthPanel, webhook-diagnostic e Shadow Webhooks ficaram com providers; nenhum achado novo deste lote os substitui.
- A assertiva de400–700LIDs está no relatório histórico de replay. Sua descoberta por leitura integral é revalidação de limite conhecido, não novo incidente.

## Cobertura por arquivo

observability-coverage.json contém SHA256, contagem de linhas, faixa lida e avaliação de função/ramo por arquivo. Todos os27 primários estão com 1–EOF. Apoios de rota, main, Index e teste parcial continuam dirigidos. src/hooks/monitoring não existe nesta fonte.

| Arquivo | Nível | Faixas | Avaliação |
|---|---|---|---|
| `src/components/monitoring/MonitoringDiagnosticPanel.tsx` | semantic | 1–202 | Execução manual do diagnóstico, erro/loading, metadados, recomendações e exportação TXT/PDF. Confronto de dados da Edge com os rótulos; autorização/backend e estatística global permanecem API001/API037, sem nova contagem. |
| `src/components/performance/PerformanceMonitor.tsx` | semantic | 1–291 | collectMetrics: Navigation/Paint, memória/rede opcionais, classificação, score, snapshot e timer; histórico/seleção/limpeza e JSX. Ausência de APIs vira valores bons no score; cleanup depende de hook externo. Métricas de cache locais não certificam taxa real. |
| `src/lib/web-vitals.ts` | semantic | 1–187 | Observadores LCP/FID/CLS/INP, inicialização idempotente, Map limitado por nome, visibilidade, TTFB e thresholds do budget. CLS soma shifts sem janela dentro do ciclo visível e INP usa máximo bruto; efeito restrito ao coletor local, separado do Speed Insights. |
| `src/components/diagnostics/DiagnosticsView.tsx` | semantic | 1–324 | Cards de conexões/mensagens, HealthBadge, textos de estado operacional, erros e Refresh; segue o hook useDiagnosticsData. Realtime ativo é afirmado a partir de constante, e erros rápidos da coleta podem virar saudáveis. |
| `src/components/monitoring/MonitoringStatsCards.tsx` | semantic | 1–164 | Indicadores por dados, empty state, ratio e sparkline; uptime anunciado 24h vem do período selecionado. Texto Sem dados preservado no subtítulo, mas valor e estilo ainda vêm de 100% por default. |
| `src/components/monitoring/EvolutionMonitoringDashboard.tsx` | semantic | 1–346 | Composição de período, notificações, conexões, webhook, diagnóstico, SLA, heatmap e loading; rastreado que os mesmos healthLogs filtrados abastecem cartões 24h e grade 7d. LastUpdatedBadge exibe relógio, não reivindicação explícita de última coleta. |
| `src/components/monitoring/MonitoringConnectionsList.tsx` | semantic | 1–135 | QR/conectar/reiniciar por instância, chave de pendência, status/latência e mensagens de erro. Ramos data.error===true são tratados; ausência de QR retorna informação. Nenhum envio real ou reinício executado. |
| `src/hooks/system/useDiagnosticsData.ts` | semantic | 1–288 | Todas as consultas, contagens, erros recentes, saúde DB/Storage/Edge/Realtime, atualização e polling. Retornos error não lançados são ignorados em várias consultas; latência é usada como sucesso e realtime não é testado. |
| `src/components/monitoring/hooks/useMonitoringData.ts` | semantic | 1–115 | computeUptime, uptime por instância, sparkline, consultas por período, limites, totais e formação de buckets. Vazio vira100%, consulta já limita janela e chaves por hora divergem de buckets 10min/1d. Erros e concorrência de fetch ficam explicitados. |
| `src/components/monitoring/MonitoringAvailabilityHeatmap.tsx` | semantic | 1–151 | Grade7d/24h, agrupamento de checks, tooltip, ratio e cores. Células sem dados são corretamente cinzas; agregado vazio=100 e dados recebidos podem ser apenas1h/12h. Não se atribuiu saúde a cada célula vazia. |
| `src/components/performance/OptimizedImage.tsx` | semantic | 1–296 | IntersectionObserver, lazy image, skeleton, src/srcset/error/load, prioridade, estilos e OptimizedAvatar. Estados não reiniciam em troca de src e props podem substituir handlers, mas busca produtiva só encontrou exports/definições: limitações latentes, sem novo achado de fluxo ativo. |
| `src/components/monitoring/MonitoringEventTimeline.tsx` | semantic | 1–209 | Carga de mensagens1h e últimos15 health logs, merge/ordem/corte, filtro, pausa e intervalo15s. Health logs sem filtro1h podem aparecer sob Última hora; tabela deixa sua idade visível. Nenhuma alegação de canal realtime foi inferida de LiveDot. |
| `src/components/diagnostics/ConnectionHealthPanel.tsx` | semantic | 1–270 | Consultas com AbortSignal/timeout, polling visível de dados armazenados, execução manual, resumo/status/histórico. Polled fetch não invoca auto-fix. Checks(7d) usa últimos50 sem filtro temporal; ausência de latência contribui0 na média. |
| `src/components/performance/VirtualizedList.tsx` | semantic | 1–264 | Virtualizer, medições/overscan/keys/scroll, empty/loading/end reached e VirtualizedGrid. Callbacks de fim/guardas de coluna têm contratos latentes; nenhum consumidor JSX produtivo encontrado no escopo de busca. Sem promover export a bug ativo. |
| `src/components/monitoring/MonitoringWebhookPanel.tsx` | semantic | 1–176 | Estado/filtros/eventos esperados, cópia, configuração e verificação manual; erros da API tratados. Configuração única e check por instância foram cruzados com API037; nenhum achado duplicado de tráfego global. |
| `src/components/monitoring/hooks/useMonitoringActions.ts` | semantic | 1–88 | Invocações de obter/configurar/verificar webhook e diagnóstico, estados loading/result, toast e erros retornados/lançados. Somente leitura de fonte; mutações do handler ficam com providers. |
| `src/components/monitoring/MonitoringHealthLogs.tsx` | semantic | 1–124 | Filtro/status/contadores/tabela, metadados, ordem e empty state; todos os cálculos são do dataset recebido. Não há prova de cobertura temporal maior que o fetch. |
| `src/components/monitoring/MonitoringSLAPanel.tsx` | semantic | 1–148 | Meta99.5, attainment, progresso, contagem e detalhe por instância. Afirma últimas24h com stats derivados do período selecionado; zero amostras resulta Atingido por uptime100. |
| `src/components/performance/Prefetcher.tsx` | semantic | 1–187 | Prefetch por hover/delay, hooks/cleanup, loader catch, CriticalRoutePrefetcher e resource hints. Caminhos legados sem consumidor produtivo encontrado; sem inferir ganho de navegação ou bug ativo só por export. |
| `src/components/monitoring/hooks/useMonitoringNotifications.ts` | semantic | 1–70 | Estado anterior, transição de conexão, mute/volume/horário silencioso, áudio e desktop notification. Contextos de áudio e preferências de notificação registrados como fronteira de revisão; sem chamar Notification/áudio reais. |
| `src/components/performance/LazyRoutes.tsx` | semantic | 1–161 | Mapas de imports dinâmicos, fallbacks Suspense, factory/HOC e placeholders. Exports e nomes conferidos; presença de lazy wrapper não é métrica de bundle/runtime. |
| `src/components/performance/HotRoutePrefetcher.tsx` | semantic | 1–59 | Uso ativo pelo Index, política saveData/2g, idle/timer, fila de imports, captura de falha e cancel flag. Cancelamento impede novos imports; não alegado cancelamento de import em andamento. |
| `src/components/monitoring/MonitoringMessageChart.tsx` | semantic | 1–83 | Selecionador de período, toggle enviados/recebidos, área/tooltip e ligação hourlyData. Não reconcilia soma plotada com total consultado; consumidor do defeito de buckets. |
| `src/components/performance/metricThresholds.ts` | semantic | 1–19 | Funções puras de limiares; sem estado desconhecido. PerformanceMonitor duplica limiares inline, portanto testes do helper isolado não provam o ramo de coleta no painel. |
| `src/components/monitoring/hooks/useEvolutionMonitoring.ts` | semantic | 1–57 | Período inicial12h, refetch, interval, listener de conexão, troca de período e exposição de estados/actions. Sem request fence/abort entre períodos; janela de healthLogs é a seleção atual. |
| `src/components/performance/hotRoutePrefetch.ts` | semantic | 1–40 | Tabela das cinco views quentes e decisão por connection/saveData/2g. Nenhum import é executado na declaração; decisão desconhecida permite prefetch. |
| `src/components/monitoring/MonitoringSkeletons.tsx` | semantic | 1–96 | Skeletons acessíveis dos painéis, estrutura, variabilidade visual e nenhum efeito de produto; leitura completa sem achado novo. |
| `src/components/monitoring/hooks/types.ts` | semantic | 1–90 | Tipos de conexão/check/mensagem/uptime, periodMs/bucketCounts e conjunto HEALTHY. Nenhum valor externo validado pelo TypeScript em runtime. |
| `src/components/performance/index.ts` | semantic | 1–16 | Barrel de exports completo; existência de export não promove helper/virtualização a fluxo ativo. |
| `src/hooks/analytics/usePerformanceSnapshots.ts` | semantic | 1–99 | Hook completo: insert de telemetria, query de histórico, auth/profile, janela/limite e clearOldSnapshots. DELETE resolve com error e ainda anuncia sucesso; não inferida RLS/visibilidade global a partir da falta de filtro. |
| `src/lib/logger.ts` | semantic | 1–131 | Logger completo, correlação e filtros DEV. info/debug são suprimidos fora de DEV: resultados do coletor Web Vitals não foram atribuídos a logs de produção ou a Speed Insights. |
| `src/pages/ViewRouter.tsx` | targeted | 1–155 | Mapa das rotas diagnostics/performance/evolution-monitor e gate NavigationService.canAccess após carga de papéis/permissões. Consumo efetivo demonstrado, não alegação de acesso anônimo. |
| `src/pages/lazyViews.ts` | targeted | 1–60 | Bindings lazy dos três painéis e demais exports no trecho. Não promovida leitura das linhas finais não vistas. |
| `src/pages/Index.tsx` | targeted | 20–40, 115–148 | Binding lazy e montagem ativa de HotRoutePrefetcher em Suspense. Trechos restantes fora deste lote. |
| `src/main.tsx` | targeted | 1–50 | Inicialização do coletor manual e import separado de Speed Insights; handlers de erro e preparação do root. Não confundir os dois canais de coleta. |
| `src/components/performance/__tests__/PerformanceMonitor.test.tsx` | targeted | 1–140 | Inspeção inicial do teste/mocks de navegação, memória/rede e painel. Sem execução ou alegação de cobertura dos demais casos não lidos. |
| `src/lib/__tests__/web-vitals-budget.test.ts` | semantic | 1–50 | Teste integral verifica origem dos thresholds via mock e getRating; não alimenta PerformanceObserver nem comprova agregação CLS/INP. |

## Lacunas remanescentes

- Sem observação em browser real, permissões atuais, dados de produção, SDK de navegador ou métricas de usuário.
- Ramos latentes de componentes exportados sem consumidor produtivo não viraram falhas alcançáveis por suposição.
- Não é revisão integral de todos os testes nem de diretórios vizinhos; limites dos apoios permanecem nas faixas por arquivo.

Nenhum pedido de deploy, SQL, credenciais ou teste de produto é necessário para revisar estes resultados. Correções de produção ficam para etapa autorizada própria; a entrega atual preserva a fonte auditada.

## Ampliação finita — UI, efeitos e hooks de performance

### Revisão de UI, efeitos e hooks de performance

Fonte fixa `da307ba5626dce892f0b37cb6762463f55d14a96`. Todos os87 arquivos primários foram lidos integralmente:78 em UI,5 em effects e4 hooks de performance, somando10.095 linhas. O inventário com apoios tem101 caminhos, com91 leituras integrais e10 dirigidas. Nenhum arquivo de produto foi alterado.

## Resultado delimitado

| ID | Prioridade | Contrato |
|---|---|---|
| R2-INF-032 | P2 | Busca antiga do catálogo pode substituir os resultados da consulta atual na paleta |
| R2-INF-033 | P2 | Três ações padrão da paleta são exibidas sem executor e apenas fecham o diálogo |
| R2-INF-034 | P3 | Acesso rápido inicial fica fora da navegação por setas e Enter da paleta |
| R2-INF-035 | P3 | Progress aplica value à barra visual e o descarta antes do Root semântico |

Quatro casos de prova confirmam esses quatro registros; não são quatro defeitos adicionais. A ordem de resolução, a filtragem e os handlers vêm do texto de fonte fixado. SHA256 dos sete arquivos do probe e do compilador é validado antes da importação do compilador. O pacote de produto, SDK, rede e banco não são fornecidos à VM.

## Probes e controles

| Probe | Execução delimitada | Controle |
|---|---|---|
| INF-UI-P01 | Debounce real e callbacks de busca/agrupamento, A e B iniciadas, B resolve antes de A | Timers ainda pendentes coalescem; a falha depende de pedidos já iniciados |
| INF-UI-P02 | Dados padrão, filtro e executor reais | nav-, action explícita e disabled mantêm seus efeitos esperados |
| INF-UI-P03 | Coleção e handler de teclado reais | Um item consultado entra em allItems e Enter o executa |
| INF-UI-P04 | Módulo Progress completo com captura inerte de JSX | max e aria-label chegam ao Root; value não chega |

Primeira execução do P01 usou await Promise.resolve() insuficiente para Promise entre VM/host e parou por TypeError antes de gravar resultado. Harness corrigido para aguardar a Promise exata do callback capturada na fronteira; quatro casos então passaram. Nenhuma falha desse harness virou achado.

## R2-INF-032 — Busca antiga do catálogo pode substituir os resultados da consulta atual na paleta

A paleta dispara um callback com debounce, mas toda resolução grava searchResults sem comparar a consulta ou geração corrente. O debounce só cancela timers ainda pendentes. Depois que A e B iniciaram, B pode terminar primeiro e ser substituída por A. O agrupamento concatena searchResults ao filtro da consulta atual sem refiltrar o resultado remoto.

**Precondições:** Paleta aberta e duas consultas de pelo menos dois caracteres já iniciadas após o debounce. A consulta antiga resolve depois da atual, com conjunto diferente de produtos.

**Efeito e alcance:** A entrada pode dizer vermelho e a seção Resultados mostrar produto azul da consulta anterior. O link preserva o ID do resultado antigo e abre o fluxo do catálogo para esse item se selecionado. Não há envio automático de mensagem. Um finally antigo também pode encerrar o indicador enquanto outra busca continua.

**Evidência:**

- `src/components/ui/command-palette.tsx:40–68` — Filtro local, concatenação de resultados e await sem geração. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:70–94` — Mudança de consulta, executor e limpeza sem invalidar requisição em voo. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/hooks/system/useDebounce.ts:7–20` — Cancela apenas timeout; callback iniciado não é abortado. SHA256 `e1a8716e995f6732963fd06d57df463dde9325aa55a96bfa29a2e9c7a24daba4`.
- `src/components/keyboard/CommandPaletteHost.tsx:16–27` — Consumidor injeta busca real do catálogo. SHA256 `34609b36fb8616345b10f2b49f26bfeafaf03f70cb5090eb99b3b44cf3f30f97`.
- `src/hooks/integrations/useCatalogQuickSearch.ts:9–31` — Query no endpoint e retorno de href por produto, sem geração. SHA256 `6e015b754e5e3f4d12867f3f7f864b37a2bd4447c29c8499805ba8a4942b2dc7`.
- `src/components/keyboard/GlobalKeyboardProvider.tsx:58–63` — Host permanece montado após primeira abertura. SHA256 `16dcf2e44b55d936320e7da0d4677482b952e0d952840483632274d735feb020`.
- `src/components/keyboard/GlobalKeyboardProvider.tsx:146–154` — Montagem da paleta atual. SHA256 `16dcf2e44b55d936320e7da0d4677482b952e0d952840483632274d735feb020`.
- `src/App.tsx:124–143` — Provider atual envolve AppRoutes. SHA256 `3e05e3ea5f9c194799d123aa46a8dc80967dc8ef846f8efe7e97e8d96f659220`.

**Critérios de aceite:**

- Invalidar respostas anteriores a cada mudança de consulta, limpeza e fechamento; só a geração atual pode alterar resultados/loading.
- Preservar debounce e usar cancelamento quando suportado, sem depender dele como única proteção contra resposta já resolvida.
- Verificar A→B com resolução B→A, erro tardio de A, consulta vazia/curta e fechamento; uma resposta antiga não deve substituir nem apagar B.
- Exercitar o callback consumidor e a seleção do produto, mantendo o ID associado à consulta atual.

**Limites:** Fonte fixa; nenhuma escrita no produto, chamada de catálogo, SDK, SQL, envio, login ou deploy. Probe usa texto de fonte e fronteiras sintéticas; não certifica interação de navegador ou comportamento de tecnologia assistiva. Fixture usa dois resultados sintéticos e o debounce real com avanço manual de timers. Não invoca promogifts-catalog nem presume falha de RLS. A prova é a troca de consulta dentro da paleta; não se afirma vazamento entre contas ou envio involuntário.

## R2-INF-033 — Três ações padrão da paleta são exibidas sem executor e apenas fecham o diálogo

Nova conversa, Respostas rápidas e Atalhos de teclado são CommandItems de categoria action sem action nem href. executeCommand só trata callback, href ou id nav- e depois fecha incondicionalmente. O Host injeta itens Talk X e busca, mas não conecta handlers às três entradas padrão.

**Precondições:** Usuário abre a paleta atual e busca um dos três títulos. Seleciona a entrada padrão habilitada, pelo clique ou pela lista consultada.

**Efeito e alcance:** A operação anunciada não começa: não abre conversa, templates nem ajuda de atalhos. O fechamento aparenta ter aceitado o comando. Navegações nav- e itens com action explícita continuam funcionando no controle do probe.

**Evidência:**

- `src/components/ui/command-palette-data.tsx:39–43` — Três action-* sem action/href. SHA256 `5abe68e6324949e730211977509079358132b9c97bc31982c1e94984dcbc8cf5`.
- `src/components/ui/command-palette.tsx:40–48` — Itens padrão entram na filtragem. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:72–78` — Executor não despacha IDs action-* e fecha. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:168–186` — Itens habilitados chamam executor. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/keyboard/CommandPaletteHost.tsx:16–27` — Host não fornece handlers para defaults. SHA256 `34609b36fb8616345b10f2b49f26bfeafaf03f70cb5090eb99b3b44cf3f30f97`.
- `src/components/keyboard/GlobalKeyboardProvider.tsx:146–154` — Consumer atual montado. SHA256 `16dcf2e44b55d936320e7da0d4677482b952e0d952840483632274d735feb020`.

**Critérios de aceite:**

- Conectar cada ação anunciada ao mecanismo real existente, com contexto/permissão necessários, ou removê-la/desabilitá-la com explicação quando não disponível.
- Selecionar cada entrada deve abrir o fluxo indicado e produzir o efeito observável correspondente.
- Manter controles para nav-, href, action explícita e disabled; não considerar o simples fechamento como sucesso de execução.

**Limites:** Fonte fixa; nenhuma escrita no produto, chamada de catálogo, SDK, SQL, envio, login ou deploy. Probe usa texto de fonte e fronteiras sintéticas; não certifica interação de navegador ou comportamento de tecnologia assistiva. Não duplica a paleta antiga src/components/CommandPalette.tsx, governança de tags ou configuração global de atalhos. Nenhuma ação de negócio real foi executada pelo probe.

## R2-INF-034 — Acesso rápido inicial fica fora da navegação por setas e Enter da paleta

Com query vazia, groupedCommands é vazio e allItems também. Mesmo assim o JSX mostra cinco destinos de acesso rápido e destaca o índice0. O listener de teclado usa exclusivamente allItems: setas ficam no índice0 e Enter não executa item. A UI anuncia as duas teclas como navegação/seleção.

**Precondições:** Paleta aberta, busca ainda vazia e foco no input de pesquisa. Usuário segue as dicas visíveis de setas e Enter.

**Efeito e alcance:** O acesso rápido não funciona pelo caminho de teclado anunciado até que haja uma consulta. O clique e a navegação nativa por Tab permanecem alternativas; não se afirma bloqueio de toda operação por teclado.

**Evidência:**

- `src/components/ui/command-palette.tsx:50–62` — Lista de teclado vazia quando query vazia. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:80–89` — Listener usa apenas allItems. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:91–94` — Abertura dirige foco para o input. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:115–119` — Dicas de setas e Enter. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.
- `src/components/ui/command-palette.tsx:143–155` — Cinco atalhos visíveis usam outra lista. SHA256 `cc46e105039b75d50a41f784b83287453b7165c616b6b9d0b3ec9987e6f3fa7c`.

**Critérios de aceite:**

- Construir uma coleção de itens visíveis usada pelo destaque, teclado e clique, incluindo acesso rápido quando query vazia.
- Setas devem percorrer os itens exibidos e Enter deve executar o item destacado a partir do foco na busca.
- Cobrir estados zero/um/vários resultados e manter comportamento de itens desabilitados; não depender de Tab/click para cumprir as dicas anunciadas.

**Limites:** Fonte fixa; nenhuma escrita no produto, chamada de catálogo, SDK, SQL, envio, login ou deploy. Probe usa texto de fonte e fronteiras sintéticas; não certifica interação de navegador ou comportamento de tecnologia assistiva. Probe chama apenas agrupamento/lista e handler reais com evento sintético; não simula ativação nativa de botões ou ordem DOM. A falha é distinta das ações sem executor: aqui o destino nav-inbox tem executor, mas não entra na coleção do listener.

## R2-INF-035 — Progress aplica value à barra visual e o descarta antes do Root semântico

O wrapper remove value na desestruturação e o usa no transform do Indicator, mas não passa value para ProgressPrimitive.Root. O Root recebe os demais props. A API oficial usa Root.value para fornecer a medida do progresso; nos consumidores lidos nenhum aria-valuenow alternativo compensa a omissão.

**Precondições:** Um consumidor monta Progress com value determinado. Consumidor não injeta manualmente o valor semântico por atributo alternativo; os caminhos inspecionados não o fazem.

**Efeito e alcance:** O controle deixa de transmitir a medida pelo contrato semântico do Radix, embora a largura visual represente25% ou100%. O probe confirma a prop omitida. Textos percentuais adjacentes continuam existentes nos exemplos; não se afirma ausência total de informação para leitor de tela nem falha de envio.

**Evidência:**

- `src/components/ui/progress.tsx:6–19` — value sai dos props de Root e só alimenta transform. SHA256 `bdc4847f05de3aea1276966e0df9b4a293297f0ca7d7b430a1cb16cf5626728f`.
- `src/components/catalog/CatalogBulkSendDialog.tsx:213–228` — Uso determinado com texto percentual adjacente. SHA256 `aa84d2e5e54f2667f870c1a91358fc79b0ed064b548e6ec0c8c9ea9e78a7fc14`.
- `src/components/catalog/ExternalProductCatalog.tsx:709–721` — Montagem real do diálogo em massa. SHA256 `5658830363331ff54f5ec01121ce2eef2bfc9ed1aea8071ee51c4b5e4ac965e5`.
- `src/components/inbox/FileUploader.tsx:178–185` — Upload passa value sem alternativa aria-valuenow. SHA256 `b3dee842e813c8c8b8c192f945dd096e6daba2de41163208fb26ff7a65acb0f9`.
- `src/components/inbox/FileUploader.tsx:207–211` — Progresso da fila também usa wrapper. SHA256 `b3dee842e813c8c8b8c192f945dd096e6daba2de41163208fb26ff7a65acb0f9`.
- `src/components/inbox/chat/ChatInputArea.tsx:210–216` — FileUploader no composer. SHA256 `2afe2fca8725cc54161998a384a3eb332cc2488e4535d97121f97a80fcbaf70c`.
- `package.json:52–52` — Dependência Progress declarada. SHA256 `1f8a4113677be5d92b90ba65c6e98b7e807a3a9b499ada8ec35f6349220debcb`.
- `bun.lock:382–382` — Versão1.1.16 fixada. SHA256 `81a17a8b7cc56ef4a9aa584cc341de640c0fe8d59fca3fc7b399431db10a695f`.

**Critérios de aceite:**

- Encaminhar value ao Root e manter medida visual/semântica coerentes, incluindo zero,100 e indeterminado.
- Verificar o DOM gerado com a dependência fixada: role e valor/estado acessível devem refletir a medida recebida.
- Manter texto contextual e nome acessível adequados no consumidor; a correção de props não é prova de aceitação completa por tecnologia assistiva.

**Limites:** Fonte fixa; nenhuma escrita no produto, chamada de catálogo, SDK, SQL, envio, login ou deploy. Probe usa texto de fonte e fronteiras sintéticas; não certifica interação de navegador ou comportamento de tecnologia assistiva. Documentação primária consultada em04/10/2026. Não foi baixado/importado o pacote Radix1.1.16; duas tentativas de consultar o código GitHub foram bloqueadas pelo provedor de pesquisa. Probe captura o JSX produzido pelo wrapper com tipos inertes; não simula o algoritmo interno do Radix nem relata aria-valuenow observado em browser. P3 delimitado pela existência de textos de progresso adjacentes e ausência de efeito sobre a operação de upload/envio.

**Contrato primário:** [Progress — Radix](https://www.radix-ui.com/primitives/docs/components/progress), consultado em04/10/2026. A API/exemplo fornece a medida em Root.value. Esta é documentação geral, não captura de execução da versão1.1.16.

## Adjudicação de planos

- P010/56 DONE_VERIFIED certifica remoção de nav-tags; continua preservado e não é reaberto pelos novos defeitos de busca/execução.
- P015/E38 do catálogo e P043/E26 são SUPERSEDED; a relação histórica com a paleta não reativa planos substituídos.
- P046/X054 PARTIAL trata integração específica de Talk X; este lote não altera esse status nem certifica todos os itens Talk X.
- Nenhuma tarefa genérica DONE_VERIFIED foi reaberta por associação temática. Os defeitos atuais têm seu próprio subcontrato executável e aceite.

## Controles e candidatos não promovidos

- OfflineIndicator: HTTP404/500 ainda comprova transporte/conectividade; o rótulo não promete saúde de API e SW/PWA foi deliberadamente desativado. Rejeitado como defeito.
- ReactionPicker: falta de preventDefault sozinha não prova duplo evento. Wrapper TeamMessageItem antigo não está no Panel ativo e fechamento é síncrono; sem novo ID.
- Prefetch/observers/counters/QuickPeek e vários efeitos exportados têm riscos latentes sem consumidor ativo confirmado; não foram convertidos em incidentes de produto.
- useTimingHooks tem consumidor real do debounce de valor em useTalkMeQueue; a nota inicial de ausência genérica foi corrigida após busca transversal de imports. Esse debounce limpa timer e não é o callback debounce da paleta.
- ChartContainer foi rastreado até config CSS literal em AIStatsWidget; dados de série remotos não demonstram injeção no CSS.
- Easter eggs, partículas e skeletons são apresentação deliberada; animação ou placeholders não provam regressão de performance ou conclusão falsa de negócio.
- useAnnounce ignora politeness e tem timer sem cleanup, mas só sua definição foi localizada; LiveRegion ativo é componente distinto.

## Cobertura por arquivo

| Arquivo | Nível | Faixas | Avaliação |
|---|---|---|---|
| `bun.lock` | targeted | 27–27, 382–382 | Pin versionado de Progress1.1.16 identificado no lock; leitura dirigida da dependência, sem baixar/importar pacote. |
| `package.json` | targeted | 52–52 | Dependência de Progress identificada em contrato; leitura dirigida da linha52 apenas, sem executar install/scripts. |
| `src/App.tsx` | targeted | 1–75, 118–147 | Imports/DeferredProviders e retorno principal lidos por faixas: confirma EasterEggs lazy e montagem, GlobalKeyboardProvider ao redor de AppRoutes, Toaster/Sonner e LiveRegion. Restante não é declarado integral. |
| `src/components/catalog/CatalogBulkSendDialog.tsx` | targeted | 1–60, 205–234 | Imports e ramo sending confirmam Progress com valor conhecido e texto percentual adjacente. Caminho real faz envio por serviço, mas não foi executado; revisão desta fronteira é apenas do controle visual/acessível. |
| `src/components/catalog/ExternalProductCatalog.tsx` | targeted | 35–45, 706–729 | Lazy import e montagem condicionada bulkSendOpen confirmam alcance do diálogo em massa. Nenhum envio/chamada de produto realizado. |
| `src/components/dashboard/AIStatsWidget.tsx` | targeted | 50–65, 185–212 | Verificação dirigida do consumidor de ChartContainer: chartConfig em 57–61 usa cores literais confiáveis e passagem em 192 não inclui id externo; valores de série não entram na string CSS. Caminho de CSS não confiável não demonstrado. Restante deste widget pertence à revisão de módulos. |
| `src/components/dashboard/GoalsDashboard.tsx` | targeted | 1–52 | Faixa de imports/estado/cálculo/primeiro JSX confirma uso real de CelebrationOverlay com callback inline para limpar showCelebration; não executa nem comprova conclusão de meta. |
| `src/components/effects/AuroraBorealis.tsx` | semantic | 1–151 | Camadas decorativas/partículas e variantes de intensidade lidas integralmente. Pointer-events-none mantém camada fora da interação; loops visuais não comprovam regressão de desempenho sem medição. |
| `src/components/effects/Confetti.tsx` | semantic | 1–296 | Partículas, temporizador, CelebrationOverlay e useCelebration completos. Cleanup ao trocar active interrompe timer; saídas cosméticas de cancelamento não promovidas sem consumidor afetado. Overlay recebe callbacks e a composição é responsabilidade do consumidor; não pressupõe persistência de conquista. |
| `src/components/effects/EasterEggs.tsx` | semantic | 1–250 | Provider/atalhos completos: Konami e sequências ativam party/matrix/disco; listeners e timers removidos, CSS removido. Evento global não filtra campos de texto, mas efeito cosmético deliberado, sem efeito de negócio demonstrado. Texto de XP e estado celebrating não provam integração de gamificação; não promovidos. |
| `src/components/effects/ParallaxContainer.tsx` | semantic | 1–268 | Parallax, imagem/texto, reveal, progress bar e float completos; transforms e variants são apresentação. Nenhum import produtivo fora dos próprios exports localizado; não inventada falha de desempenho ou alcance. |
| `src/components/effects/ScrollEffects.tsx` | semantic | 1–309 | Todos exports lidos: magnetic, reveals, counter/spring, gradient, perspective, ripple DOM e blur. Counter/blur obtêm valores de motion via get durante render; risco latente sem consumidor produtivo localizado. Ripple cria/remove elemento cosmético com timeout. Nenhum efeito de dados ou rede. |
| `src/components/inbox/FileUploader.tsx` | targeted | 1–20, 156–187, 198–216 | Import e ramos de upload simples/múltiplo confirmam Progress com value e textos adjacentes. Não afirmar ausência total de informação a leitor de tela; perda é no contrato numérico do controle. Upload real não executado. |
| `src/components/inbox/chat/ChatInputArea.tsx` | targeted | 202–221 | Montagem dirigida de FileUploader no composer ativo; passa contato e callbacks. Revisão completa do composer fica com inbox/root. |
| `src/components/keyboard/CommandPaletteHost.tsx` | semantic | 1–30 | Host ativo liga open/onNavigate a UI palette, onSearch do catálogo e comandos TalkX. Leitura integral para comprovar alcançabilidade da busca e actions default. |
| `src/components/keyboard/GlobalKeyboardProvider.tsx` | semantic | 1–157 | Corpo integral lido como suporte: listener global/custom event, lazy Host e paletteMounted que persiste após primeira abertura; navegação via ref e cleanup listeners. Comprova consumer atual. Gates/atalhos duplicados da plataforma são propriedade do root. |
| `src/components/ui/EmptyState.tsx` | semantic | 1–197 | Variantes, defaults, ícone, descrição, ações e classes lidos. Botões só aparecem com texto e callback correspondentes; estado puramente apresentado por props, sem leitura de negócio ou rede. |
| `src/components/ui/GenericEmptyState.tsx` | semantic | 1–84 | JSX integral e guardas dos botões lidos. Comentário chama wrapper/reexport, porém implementação é própria; inconsistência documental sem defeito funcional comprovado. Sem efeito externo. |
| `src/components/ui/SkeletonList.tsx` | semantic | 1–150 | Ramos list/card/table e composição com StaggerList lidos, contagens e placeholders apenas visuais. Nenhum acesso a dados. |
| `src/components/ui/VolumeSliderPopoverContent.tsx` | semantic | 1–88 | Slider vertical controlado, array de valores, bounds/step, callback, mute label/aria/disabled e footer completos. Usa botão type=button; efeito de mídia é delegado ao consumidor. |
| `src/components/ui/VolumeTriggerButton.tsx` | semantic | 1–64 | Botão type=button, foco/long-press/cancel/click/teclas via rocker, aria e indicador completos. ariaDisabled é informativo; política interativa depende do hook useVolumeRocker (root), sem duplicação presumida. |
| `src/components/ui/accessible-toast.tsx` | semantic | 1–200 | Provider add/update/remove, timeout, ToastContainer live region e progresso completos. Loading atualizado não agenda auto-removal e duration0 difere no progress, mas nenhum useAccessibleToast fora da definição localizado. Provider montado não significa toast ativo. |
| `src/components/ui/accordion.tsx` | semantic | 1–52 | Root/Item/Trigger/Content e composição de heading completos; forwarded refs e props preservam estado/eventos do Radix. Chevron/expansão são apresentação, sem efeito de negócio. |
| `src/components/ui/alert-dialog.tsx` | semantic | 1–104 | Todos primitives e wrappers de portal, overlay, content, title, description, action e cancel lidos. Ações/fechamento e foco são delegados ao Radix e callbacks do consumidor; não há confirmação ou mutação interna. |
| `src/components/ui/alert.tsx` | semantic | 1–43 | Variants default/destructive, role alert, título/descrição e ref/props completos; apenas apresentação de conteúdo fornecido. |
| `src/components/ui/avatar.tsx` | semantic | 1–201 | Radix root/image/fallback, indicador de status, posições/tamanhos e grupo com overflow lidos; status vem de props, não é inferido de saúde/backend. Imagem mantém contrato do Radix. |
| `src/components/ui/badge.tsx` | semantic | 1–35 | Todas variantes semânticas visuais e ref/props lidos; não calcula status nem valida resultado de negócio. |
| `src/components/ui/breadcrumb.tsx` | semantic | 1–90 | Nav/ordered list/Slot links, página atual/separadores/ellipsis lidos; sem efeitos. Props/aria encaminhadas, foco dos links controlado pelo elemento renderizado. |
| `src/components/ui/button.tsx` | semantic | 1–113 | Button/MotionButton, variants, Slot, isLoading/disabled e passagem de props completos. Loading desabilita botão nativo; asChild depende de semântica do filho. Tipo default permanece nativo; não alegada submissão acidental sem form consumidor concreto. |
| `src/components/ui/calendar.tsx` | semantic | 1–54 | DayPicker com classes default/overrides, ícones e props lido; seleção, modo, disabled/datas encaminhados ao DayPicker. Wrapper não converte timezone nem produz dados. |
| `src/components/ui/card.tsx` | semantic | 1–104 | Variants/ref/props, motion hover e seções/títulos completos; elementos são wrappers de apresentação sem mutações. |
| `src/components/ui/chart.tsx` | semantic | 1–305 | Context/ResponsiveContainer, CSS por tema, tooltip/legend e helper payload completos. CSS bruto exige config confiável; único importador localizado AIStatsWidget, a ser checado para origem de config. Zero no JSX item.value&& resulta nó0, não prova de sumiço; sem finding falso de contagem. Consumidor AIStatsWidget 57–61/192 usa config CSS literal; dados remotos da série não atravessam dangerouslySetInnerHTML. |
| `src/components/ui/checkbox.tsx` | semantic | 1–26 | Root e Indicator completos; checked/disabled/name/eventos continuam em props e são encaminhados ao primitive. Aparência de check não introduz mutação própria. |
| `src/components/ui/command-palette-data.tsx` | semantic | 1–71 | Tipos, default navigation/action commands, fuzzy matching e highlight com JSX escapado. Três action-* são só metadados sem action/href; correlacionado com executor. Nenhum HTML bruto produzido. |
| `src/components/ui/command-palette.tsx` | semantic | 1–211 | Busca/debounce async, merge/fuzzy/group, teclas, executar ação/href/nav, abrir/fechar, recentes e JSX completos. Rastreadas buscas fora de ordem, actions sem callback e allItems vazio no acesso rápido sem query. Candidatos pendentes de deduplicação/probe. |
| `src/components/ui/command.tsx` | semantic | 1–135 | Wrappers cmdk e CommandDialog completos, incluindo title sr-only e aria-describedby undefined deliberado; Item preserva onSelect e disabled. Não confundir com CommandPalette própria que implementa outra busca/teclado. |
| `src/components/ui/context-menu.tsx` | semantic | 1–178 | Todos exports lidos: submenus, portal principal, checkbox/radio/labels/separadores. checked e handlers encaminhados, disabled/focus delegado; strings de shortcuts não registram atalhos globais. |
| `src/components/ui/dialog.tsx` | semantic | 1–122 | Portal/overlay/content/close/header/footer/title/description e sizes lidos; max-height e overflow-y-auto presentes na base. Foco/modalidade do Radix mantidos, botão de fechar opcional explícito; altura do consumidor não presumida defeituosa. |
| `src/components/ui/drawer.tsx` | semantic | 1–107 | Vaul Root/portal/overlay/content, headers/footers/títulos e gesto delegado completos. shouldScaleBackground false deliberado sem wrapper marcado. Alça aria-hidden decorativa, ref/props preservados. |
| `src/components/ui/dropdown-menu.tsx` | semantic | 1–179 | Todos exports e submenus lidos; portal principal, checked, ref e callbacks preservados. Nenhuma autorização/mutação de itens está no wrapper; consumidores devem prover handlers e gates. |
| `src/components/ui/emoji-picker.tsx` | semantic | 1–331 | Banco/busca/categorias/recentes/storage, seleção, quick picker e animação completos. JSON local recente só catch parse sem shape e gravação pode lançar; somente referências internas neste arquivo, sem consumidor produtivo de exports identificado. |
| `src/components/ui/empty-state-illustrations.tsx` | semantic | 1–176 | Todas ilustrações SVG e Record de presets lidos; faixa inicial foi relida após truncamento para assegurar corpo integral. Sem conteúdo HTML externo, dados ou rede. |
| `src/components/ui/empty-state.tsx` | semantic | 1–143 | Ícone, tamanho, ilustração e botões primário/secundário lidos; ações exigem label e handler. Apenas apresentação controlada pelo consumidor. |
| `src/components/ui/empty-states.tsx` | semantic | 1–191 | Contextos e presets inbox/contacts/dashboard/search/notifications/tags/calls/transcriptions lidos; ilustração e mensagens têm fallback. CTA depende de action. Preset legado não prova feature montada. |
| `src/components/ui/empty-states/ContextualEmptyState.tsx` | semantic | 1–86 | Context lookup e fallback messages, query, CTAs condicionais e ajuda lidos integralmente. Valores de config importada são conteúdo; callbacks vêm do consumidor. Não infere resultado de operação. |
| `src/components/ui/empty-states/ConvenienceExports.tsx` | semantic | 1–37 | Nove wrappers de presets/ações lidos e mapeamento de contexto conferido; nenhum efeito adicional oculto. |
| `src/components/ui/error-boundary-retry.tsx` | semantic | 1–140 | Boundary completo: captura, callback, limite2/retry exponential, timer cleanup, manual reset e fallback. Render de mensagem de erro via JSX escapado; nenhum HTML bruto. Retry não prova que causa do erro foi resolvida. |
| `src/components/ui/form.tsx` | semantic | 1–129 | Contextos Field/Item, Controller/FormProvider, ids/aria, errors e refs completos. Exige árvore de providers; guarda do contexto{} não protege uso incorreto, mas sem consumidor inválido demonstrado. Textos de erro são JSX, não HTML. |
| `src/components/ui/hover-card.tsx` | semantic | 1–27 | Root/trigger/content e props de alinhamento lidos. Content não usa Portal próprio, mas clipping só seria defeito com contêiner consumidor demonstrado; nenhum import produtivo encontrado no levantamento transversal. |
| `src/components/ui/icon-button.tsx` | semantic | 1–151 | Props/ref/Slot, aria-label exigido, tooltip opcional e versão motion completos. Nenhuma lógica remota. Trecho truncado foi reaberto integralmente antes desta promoção. |
| `src/components/ui/input.tsx` | semantic | 1–83 | Ref/type/props, variants, ícones, addons e estados de erro/sucesso lidos. Elementos laterais são apresentação; interatividade de addons não é pressuposta sem consumidor específico. |
| `src/components/ui/label.tsx` | semantic | 1–17 | Radix label com ref/class/props lido; htmlFor/associação continuam contrato do consumidor. |
| `src/components/ui/liquid-metal-button.tsx` | semantic | 1–130 | Import lazy de shader, capability/reduced-motion gate, cancel flag, dispose e estados/contagem/handlers completos. Tipo button e disabled/loading aplicados após props; fallback estático. Sem montagem de WebGL ou alegação de ganho medido. |
| `src/components/ui/menubar.tsx` | semantic | 1–207 | Root/menu/trigger/submenus/itens checkbox-radio/labels/portal e separadores lidos integralmente; forwarded props preservam contratos do Radix. displayname minúsculo é metadado de depuração, não promovido como falha de produto. |
| `src/components/ui/message-reactions.tsx` | semantic | 1–184 | ReactionBadge, picker por grid/ref/teclas, bar/popover e quick strip completos. Teclas Enter/Space chamam onSelect antes de default nativo; requer provar consumidor/unmount antes de alegar dupla mutação. Backend/toggle pertence a Inbox. |
| `src/components/ui/micro-interactions/buttons.tsx` | semantic | 1–284 | Ripple, icon, bounce, magnetic, glow e press feedback completos. Disabled impede callback nos controles pertinentes, props/types variam; não há rede ou escrita de dados. Timers/hover/semântica do div registrados como contrato de componentes genéricos, sem assumir consumidor ativo. |
| `src/components/ui/micro-interactions/feedback.tsx` | semantic | 1–83 | MicroFeedback, LoadingDots/Spinner e FeedbackAnimation completos. Tipo/show controlam apresentação; não são prova de sucesso de ação remota por si. |
| `src/components/ui/micro-interactions/skeletons.tsx` | semantic | 1–106 | SkeletonPulse e cinco ramos de ContentSkeleton completos. Apenas repetição/estilos/placeholders; count vem do chamador e não foi presumido input não confiável. |
| `src/components/ui/mobile-components.tsx` | semantic | 1–263 | MobileDrawer gesto/body overflow, BottomNavigation ativo/vibração/badge, PullToRefresh await e TouchFeedback completos. BottomNavigation é consumidor real; Drawer/PullToRefresh genéricos não aparecem montados e seus riscos latentes não viraram findings. |
| `src/components/ui/motion/components.tsx` | semantic | 1–127 | PageTransition, neon/card/buttons, stagger/fade/slide/scale, interactive e shimmer completos. PageTransition respeita useReducedMotion; outros wrappers delegam motion ao contexto/props, sem alegar falha a11y sem conferir consumidor/Config global. |
| `src/components/ui/motion/effects.tsx` | semantic | 1–94 | AnimatedCounter/progress/presence/stagger/slide/list/typewriter completos, com RAF/interval cleanup. prevRef é objeto recriado e value0 retorna sem reset no contador; falta consumidor real para promover. Não alegada corrupção de métrica apenas pelo export. |
| `src/components/ui/motion/variants.ts` | semantic | 1–83 | Todos os variants declarativos e factory talkxStagger lidos; nenhum efeito/IO ou cálculo de dado de produto. Escala/duração são apresentação. |
| `src/components/ui/offline-indicator.tsx` | semantic | 1–131 | Eventos navigator.onLine, retry HEAD favicon, toast restaurado e timers completos. Root confirmou SW/PWA desabilitado por configuração. Candidato response.ok rejeitado: HTTP404/500 ainda comprova transporte de rede e rótulo não promete saúde de API. |
| `src/components/ui/pagination.tsx` | semantic | 1–81 | Nav/list/link, aria-current, links previous/next e ellipsis lidos; href/onClick são contrato do consumidor, não há paginação de dados implícita. |
| `src/components/ui/popover.tsx` | semantic | 1–31 | Root/trigger/anchor/content e portal completos, align/offset overridable. Foco/dismissal e open vêm do primitive; nenhum efeito externo. |
| `src/components/ui/progress.tsx` | semantic | 1–23 | Corpo integral lido: value é consumido no transform visual e omitido das props de Root. Candidato de contrato acessível separado, com consumidores/probe a verificar; max segue encaminhado, enquanto cálculo visual assume escala100. |
| `src/components/ui/quick-peek.tsx` | semantic | 1–73 | Hover enter/leave/timer, preview/enabled e JSX completos. Timer não tem cleanup no unmount/alteração enabled, mas nenhum efeito de dados; consumidor terá de definir impacto antes de promover achado. |
| `src/components/ui/radio-group.tsx` | semantic | 1–36 | Root/Item/Indicator lidos integralmente, ref/props preservados. Checked/value/keyboard/input permanecem no primitive. |
| `src/components/ui/resizable.tsx` | semantic | 1–37 | PanelGroup, Panel e handle completo; direção e callbacks da lib preservados e pega visual opcional. Não persiste layout por conta própria. |
| `src/components/ui/route-loading-bar.tsx` | semantic | 1–74 | Loading determina visibilidade, percentuais visuais temporizados e término; todos timers cancelados na troca/unmount. Progresso indeterminado simulado não é declarado como bytes medidos ou resultado de negócio. |
| `src/components/ui/scroll-area.tsx` | semantic | 1–38 | Root/Viewport/Scrollbar/Corner e dois eixos lidos; props/ref de Root não representam ref do viewport. Nenhum uso incorreto de consumidor é inferido pelo wrapper isolado. |
| `src/components/ui/scroll-to-top.tsx` | semantic | 1–57 | Ref de container, listener scroll com cleanup, limiar e ação smooth completos. Não inicializa visibilidade pelo scroll atual até primeiro evento; impacto condicionado a consumidor, sem mutação de produto. |
| `src/components/ui/section-error-boundary.tsx` | semantic | 1–71 | Boundary por seção completo: log/reportClientError, captura com stack truncada, retry local e fallback. Egress e sanitização do reporter pertencem ao lote lib/root; não inferidos pela chamada. |
| `src/components/ui/separator.tsx` | semantic | 1–20 | Orientação/decorative e ref/props completos; default decorativo deliberado, classes correspondem aos dois eixos. |
| `src/components/ui/sheet.tsx` | semantic | 1–107 | Lados top/bottom/left/right, overlay/portal, content e close, header/footer/título/descrição lidos. Foco do Radix e close encaminhados. Falta de overflow interno só afetaria consumidor alto comprovado, não promovida genericamente. |
| `src/components/ui/sidebar/sidebar-context.tsx` | semantic | 1–111 | Provider controlado/não controlado, callback toggle, mobile, cookie booleano7dias, Ctrl+B com cleanup e dimensões/context completos. Cookie é preferência não credencial; não promove acesso ou risco de segurança. |
| `src/components/ui/sidebar/sidebar-menu.tsx` | semantic | 1–192 | Botões/Slot ativos, tooltip colapsado, actions/badge/submenu e skeleton completo. Preferências vêm do contexto e não são ACL. Sem consumidor produtivo importando esse sidebar no scan. |
| `src/components/ui/sidebar/sidebar-primitives.tsx` | semantic | 1–242 | Sidebar desktop/mobile/none, Sheet controlado, trigger/rail/inset/header/footer/group/input completos. Callbacks/props/roles inspecionados; sem importador produtivo do sidebar genérico localizado no scan, não confundir com Sidebar aplicativo. |
| `src/components/ui/skeleton.tsx` | semantic | 1–139 | Variants, delay, role/status/label e composição Card/List/Text/Avatar/Button lidos; placeholders dependem de props e não representam sucesso real de operação. |
| `src/components/ui/skip-link.tsx` | semantic | 1–141 | Links condicionados à existência do target, foco/scroll, detector1500ms e indicador de Tab completos. Cleanup de listener/interval; foco efetivo depende do target focusable, não presumido defeito sem consumidor. |
| `src/components/ui/slider.tsx` | semantic | 1–56 | Wrapper Radix completo com número de thumbs derivado do value/defaultValue, labels por índice, orientação vertical/horizontal e props. Corrige número de thumbs; nenhum valor fictício de mídia. |
| `src/components/ui/sonner.tsx` | semantic | 1–38 | Integração com resolvedTheme, opções/duração e classes lida; props finais permitem override. Componente apenas hospeda toast, não cria mensagem de sucesso nem altera operação. |
| `src/components/ui/sparkline.tsx` | semantic | 1–53 | Normalização min/max, largura/altura, pontos e área SVG completos; <2amostras retorna null e série constante usa range1. Entrada finita é contrato do chamador; nenhuma medição ou acesso remoto. |
| `src/components/ui/step-progress.tsx` | semantic | 1–79 | Passos derivados por índice, estado atual/concluído, rótulos e conexões completos. Só apresentação; ausência de aria-current anotada como contrato, sem nova certificação a11y ou finding genérico. |
| `src/components/ui/switch.tsx` | semantic | 1–27 | Root/thumb lidos; checked/disabled/eventos/ref encaminhados ao Radix, sem estado paralelo ou persistência. |
| `src/components/ui/table.tsx` | semantic | 1–72 | Table/head/body/footer/row/cell/caption lidos, elementos nativos e props/ref preservados; overflow wrapper permite rolagem. Ordenação/paginação/seleção são do consumidor. |
| `src/components/ui/tabs.tsx` | semantic | 1–53 | Root/list/trigger/content completos; state/value/disabled/focus seguem primitive, sem reset de dados externo ou efeito de negócio no wrapper. |
| `src/components/ui/textarea.tsx` | semantic | 1–21 | Forward ref e HTML props lidos; valor/eventos/disabled encaminhados, sem estado interno ou sanitização presuntiva. |
| `src/components/ui/toast.tsx` | semantic | 1–111 | Provider/viewport/root/action/close/title/description e variants lidos. Root recebe duration/open/handlers, foco/swipe delegados à lib. Mensagem e confirmação de operação são contrato do chamador. |
| `src/components/ui/toaster.tsx` | semantic | 1–24 | Map de toasts do hook encaminha props/id/title/description/action e close; não consome promessa de operação. Vida útil dos itens é gerida por use-toast, lido pelo root. |
| `src/components/ui/toggle-group.tsx` | semantic | 1–49 | Contexto de variants/size e Root/Item lidos; grupo precede estilo local, props/eventos/refs preservados. Estado do toggle permanece na lib. |
| `src/components/ui/toggle.tsx` | semantic | 1–37 | Variants e Root completos, value/pressed/handlers continuam em props; nenhuma mutação externa. |
| `src/components/ui/tooltip.tsx` | semantic | 1–139 | Wrappers Radix, portais em content/enhanced, offsets/variants e wrapper simplificado lidos. Portal evita clipping conhecido; foco e dismissal delegados ao primitive. Nenhum handler de negócio. |
| `src/components/ui/visually-hidden.tsx` | semantic | 1–77 | VisuallyHidden, useAnnounce e LiveRegion completos. Hook ignora politeness e usa timer sem cleanup, mas sem consumidor localizado fora da definição; não promovido como ramo ativo. LiveRegion é montado no App e mantém aria-live polite/status. |
| `src/features/talk-me/useTalkMeQueue.ts` | targeted | 1–8, 70–120 | Correção de alcance: importa useDebounce do módulo performance e o usa para pesquisa normalizada; guarda searchPending e refs de geração aparecem nesta faixa. Debounce de valor tem cleanup, distinto do debounce de callback da paleta. Restante do hook não é declarado lido aqui. |
| `src/hooks/integrations/useCatalogQuickSearch.ts` | semantic | 1–34 | Busca promogifts-catalog compact limit8; erro retorna[]; produtos mapeados para CommandItem search e href /?view=catalog&product=...&send=1. Sem guard de geração próprio; retorno async controlado pelo chamador. |
| `src/hooks/performance/useDataOptimization.ts` | semantic | 1–116 | Paginação acumulada/reset, hover prefetch e preload resources completos. Prefetch não limpa timer no unmount nem reinicia cache ao mudar fetcher; nenhum consumidor produtivo desses exports localizado, só reexports. Preload remove links no cleanup. |
| `src/hooks/performance/useMonitoring.ts` | semantic | 1–105 | Contagem de renders, memória dev-only, FPS via RAF e medição entre dois effects. Medição de slow render cobre intervalo pós-commit, não corpo de render; exports sem consumidor produtivo localizado, portanto limite latente sem finding. |
| `src/hooks/performance/useObservers.ts` | semantic | 1–72 | Intersection/lazy/load flags e event listener passivo completos. RemoveEventListener omite capture usado por options, mas não há consumidor ativo identificado: risco latente, sem ID. Observer exige API; cleanup unobserve. |
| `src/hooks/performance/useTimingHooks.ts` | semantic | 1–103 | Todos hooks lidos: debounce de valor e throttle limpam timers, RAF cancela request, stable callback usa ref atualizada e idle tem fallback/cleanup. Consumidor real confirmado: useTalkMeQueue93 usa o debounce de valor corretamente; outros exports têm somente reexports/chamada interna de useFPS localizados. Não confundir com useDebounce de callback em hooks/system. |
| `src/hooks/system/useDebounce.ts` | semantic | 1–21 | Callback debounce integral: cancela timer pendente, não cancela promessa já iniciada, não existe fence de geração/consulta. Usado pela CommandPalette; temporizador não tem cleanup no unmount. Sem executar timer real. |

## Lacunas remanescentes

- Sem browser/assistive technology, medições de FPS/memória ou regressão visual; leitura integral não é teste de renderização.
- Dependências Radix/cmdk/vaul são fronteiras não executadas. Eventos/foco/scroll internos não foram reimplementados em mocks como se fossem comprovação do pacote.
- Probes cobrem quatro riscos concretos; não são suíte completa, typecheck, build nem aceite final de acessibilidade.
- A auditoria global continua IN_PROGRESS; conclusão se refere somente aos87 arquivos primários deste lote.

## Ampliação finita — layout, transições e onboarding

### Revisão de layout, transições e onboarding

Fonte fixa `da307ba5626dce892f0b37cb6762463f55d14a96`. Os 25 arquivos primários foram lidos integralmente, somando 2.136 linhas. Com apoios, o inventário tem 47 caminhos: 37 leituras integrais e 10 dirigidas. Nenhum arquivo de produto foi alterado.

## Resultado delimitado

| ID | Prioridade | Contrato |
|---|---|---|
| R2-INF-036 | P3 | Checklist marca tema como concluído quando a consulta não devolve configuração |
| R2-INF-037 | P2 | Controle de movimento reduzido e transições de rota usam preferências desconectadas |
| R2-INF-038 | P2 | Tour padrão aponta para dois alvos ausentes e avança até a conclusão sem mostrá-los |
| R2-INF-039 | P2 | Modais próprios anunciam modalidade sem implementar o contrato de foco |

Há três casos offline para os três primeiros registros e análise estática para o quarto. Os dois modais são loci de um único mecanismo, sem aumentar a contagem. O harness valida SHA256 de 11 fontes e do compilador antes de importá-lo; as fronteiras de SDK, timers e hooks são sintéticas.

## Probes e controles

| Caso | Execução delimitada | Controle |
|---|---|---|
| INF-LO-P01 | Módulo checklistSteps completo e callback checkAllSteps real | data ausente/erro concluem tema; system não conclui e dark conclui |
| INF-LO-P02 | Efeito global, leitor/hook de preferência e decisão de variante de rota | Chave privada de rota ou preferência do sistema produz none |
| INF-LO-P03 | Etapas padrão e callbacks de retry, avanço e conclusão | Apenas getters de navegação lidos são usados para verificar IDs; nenhuma query de produto |

Os três casos passaram na execução delimitada registrada. Não se repetiram suítes anteriores nem se simulou o motor de movimento ou um navegador.

## R2-INF-036 — Checklist marca tema como concluído quando a consulta não devolve configuração

A condição de tema compara data?.theme com null e system. Quando data é null, o valor é undefined e ambas as comparações são verdadeiras. O error resolvido pelo SDK também é ignorado. O callback real do card incorpora esse true ao conjunto de etapas concluídas.

**Precondições:** Usuário autenticado e card ainda visível no dashboard. A consulta de user_settings resolve sem registro ou com error e data null.

**Efeito e alcance:** A interface afirma que o usuário escolheu tema claro ou escuro sem evidência dessa configuração e remove a ação pendente dessa etapa. A prova mantém as outras cinco etapas falsas; não afirma que o onboarding inteiro é concluído nessa situação.

**Evidência:**

- `src/components/onboarding/checklistSteps.ts:103–119` — Promessa da etapa e condição undefined diferente de null/system. SHA256 `554a022f5172c80cfc1ddb9c6c4dafddf89d7d799c1f9b36ddf5ef0dfd219813`.
- `src/components/onboarding/OnboardingChecklist.tsx:33–47` — Callback inclui a etapa verdadeira e não vê error resolvido. SHA256 `69a62b48b1d515ebf301e6538a1418dfb9075649a0933d56aeb7292e002bdb5b`.
- `src/components/onboarding/OnboardingChecklist.tsx:94–123` — Contagem, estado visual e ação condicionados a completedSteps. SHA256 `69a62b48b1d515ebf301e6538a1418dfb9075649a0933d56aeb7292e002bdb5b`.
- `src/pages/Index.tsx:87–87` — Card limitado ao dashboard. SHA256 `971796f4112ea03b82db11b40592e340314767f4dd1a8d0df6ac5b80335e2268`.
- `src/components/layout/AppShell.tsx:141–145` — Consumidor atual monta card. SHA256 `30552c0b530b0b14122f4dc09e06c62bcf61e5a1e3ac28d536153e84f350185e`.
- `src/hooks/ui/useOnboardingChecklist.ts:58–68` — Hook vizinho exige settings existente; não compensa condição do card. SHA256 `4c12ac595f89c390c24038f72552acea564c9f0e6f37db4f62a14b994741453d`.

**Critérios de aceite:**

- Validar presença e valor permitido de theme antes de concluir a etapa; ausência ou erro não deve virar conclusão.
- Manter a regra do card coerente com o hook de estado de onboarding, preservando distinção entre pendente e falha de leitura.
- Cobrir data null, error resolvido, theme system, theme dark/light e valor malformado no callback consumidor; a contagem deve refletir apenas estados comprovados.

**Limites:** Fonte fixa; nenhum endpoint, SDK real, SQL, envio, login, browser ou deploy executado. Nenhum arquivo de produto foi alterado. P3 delimitado ao estado de orientação; não há concessão de permissão, perda de dados ou gravação no probe. O card desmonta fora do dashboard e remonta ao voltar; a hipótese anterior de falta de atualização ao retornar foi rejeitada.

## R2-INF-037 — Controle de movimento reduzido e transições de rota usam preferências desconectadas

O controle global de acessibilidade grava reducedMotion=true/false e aplica a classe reduced-motion. O hook das transições lê zapp:reduce-motion=1/0 e o media query do sistema; ele não lê o contexto global, sua chave ou sua classe. Com a opção global ligada e o sistema sem redução, RouteTransition continua escolhendo slide/zoom/fade em vez de none.

**Precondições:** Usuário liga Reduzir Movimento pela interface global. Sistema operacional não pede redução e zapp:reduce-motion não está em 1. Usuário navega entre rotas abrangidas pelo PageTransitionProvider.

**Efeito e alcance:** A preferência anunciada como desativação das animações não chega à decisão de variante das rotas. O controle CSS global reduz duração de animações e transições CSS e continua válido; o probe comprova a divergência da configuração JavaScript, sem medir a duração visual do Framer Motion.

**Evidência:**

- `src/components/theme/HighContrastToggle.tsx:49–51` — Estado inicial usa reducedMotion. SHA256 `7b52b8272d32b9d5538c285bd98cafb4c5c7f37970562eb6539a43f209a2f9a9`.
- `src/components/theme/HighContrastToggle.tsx:107–114` — Efeito escreve chave/classe globais. SHA256 `7b52b8272d32b9d5538c285bd98cafb4c5c7f37970562eb6539a43f209a2f9a9`.
- `src/components/theme/HighContrastToggle.tsx:240–254` — Controle e promessa apresentados ao usuário. SHA256 `7b52b8272d32b9d5538c285bd98cafb4c5c7f37970562eb6539a43f209a2f9a9`.
- `src/components/layout/Sidebar.tsx:251–252` — Controle acessível na Sidebar. SHA256 `445291acd74493e9ec82e7622176ad269f9b1d3f100ff8ee6eeb79b596a38e9e`.
- `src/components/transitions/transitionConfig.ts:29–44` — Chave e codificação diferentes nas rotas. SHA256 `856077f41ff388e078b4b67bfe1491045b808d2a0d1a212998e47c32e337cafc`.
- `src/components/transitions/useTransitionPreferences.ts:11–30` — Preferências de sistema e chave privada, sem contexto global. SHA256 `52c1d2762bdb214e6070424b05bf735386bdca313d32e36d593d673702660f10`.
- `src/components/transitions/RouteTransition.tsx:12–30` — Flag decide none versus transição animada. SHA256 `9a8a5b1dce73e8c1290f9ff71af7b73e00e9ae4cc7d4f1405d2d28145b0ba1d9`.
- `src/routes/AppRoutes.tsx:44–84` — Provider e rotas reais que usam slide/zoom. SHA256 `30c6f9981e0f9b86c37154eba2f87e24e2e2f7720259e95da1899c49fbf11da3`.
- `src/styles/accessibility.css:57–70` — Controle CSS existe e não é negado pelo achado. SHA256 `ab0c400cb831f529da67e359a0b7c7dd61b45cd78eab905206d09c09fd863c67`.

**Critérios de aceite:**

- Usar uma fonte de preferência de usuário para a interface global e as transições, combinada com a preferência do sistema.
- Garantir atualização da variante após ligar ou desligar a opção sem exigir outra chave escondida ou recarga.
- Cobrir UI ligada/desligada e sistema ligado/desligado; verificar none no ramo esperado e depois validar em browser a animação efetiva.

**Limites:** Fonte fixa; nenhum endpoint, SDK real, SQL, envio, login, browser ou deploy executado. Nenhum arquivo de produto foi alterado. O probe executa efeito, leitura e decisão de configuração de fonte com fronteiras inertes; não importa Framer Motion nem reimplementa seu motor. Não se afirma que toda animação CSS continua ativa ou que houve sintomas observados em usuário. O efeito demonstrado é a escolha incorreta de variante.

## R2-INF-038 — Tour padrão aponta para dois alvos ausentes e avança até a conclusão sem mostrá-los

As duas últimas etapas padrão procuram data-tour=notifications e data-tour=theme. A produção de data-tour vem de SidebarNavItem com IDs de navegação; nenhum dos getters ativos fornece esses dois IDs. Os controles reais de notificações e tema da Sidebar não têm esses atributos. Após dez tentativas, TourOverlay chama nextStep; na última etapa isso chama endTour/onComplete.

**Precondições:** Usuário inicia o tour padrão e chega às duas últimas etapas. Layout usa os componentes da fonte atual; não há plugin externo inserindo os atributos ausentes.

**Efeito e alcance:** As explicações de notificações e personalização não recebem alvo visível no fluxo atual e o callback de conclusão pode ser chamado mesmo sem essas etapas terem sido mostradas. O salto de uma etapa indisponível por permissão pode ser deliberado; aqui os dois seletores não são produzidos sequer para o layout desktop completo lido.

**Evidência:**

- `src/components/onboarding/defaultTourSteps.ts:32–45` — Dois seletores ausentes do layout. SHA256 `b7570face27ff498e26ea801e2bd09aaa3dfc752f03a94231258b51e825324c0`.
- `src/components/layout/SidebarNavItem.tsx:33–44` — Único produtor dinâmico de data-tour em UI de produto. SHA256 `be8efae696b82ddc7896f6601b536909e0d7a1f4570cf259afa576b12cd68776`.
- `src/services/navigation.service.ts:1–155` — Getters de navegação não fornecem os dois IDs. SHA256 `8e128c5cc1aa208f96570c68295d6e4836ca1febed4d7d1e603f648d4c294d48`.
- `src/components/layout/Sidebar.tsx:92–124` — Controles de notificações não têm o atributo esperado. SHA256 `445291acd74493e9ec82e7622176ad269f9b1d3f100ff8ee6eeb79b596a38e9e`.
- `src/components/layout/Sidebar.tsx:236–252` — Controles de tema/acessibilidade não têm data-tour=theme. SHA256 `445291acd74493e9ec82e7622176ad269f9b1d3f100ff8ee6eeb79b596a38e9e`.
- `src/components/onboarding/TourOverlay.tsx:16–39` — Retries e salto automático por ausência/medida zero. SHA256 `e96f75433ceab7f93324a25573d89e614682935f8594e516d64a82f6096ef6f5`.
- `src/components/onboarding/OnboardingTour.tsx:50–63` — Último nextStep chama endTour e onComplete. SHA256 `066e3caa337f58ae0f87adad74073c1e64c68466aa47f8e5f1a25f75b2c1649b`.
- `src/pages/Index.tsx:135–142` — Início real do tour padrão. SHA256 `971796f4112ea03b82db11b40592e340314767f4dd1a8d0df6ac5b80335e2268`.
- `src/pages/Index.tsx:183–192` — Callback de conclusão conectado ao estado de onboarding. SHA256 `971796f4112ea03b82db11b40592e340314767f4dd1a8d0df6ac5b80335e2268`.

**Critérios de aceite:**

- Conectar seletores aos controles reais ou corrigir as etapas para os alvos realmente renderizados, respeitando layout e permissões.
- Validar os seletores no layout composto, não apenas sua sintaxe em um document vazio.
- Distinguir salto deliberado de ausência inesperada e evitar registrar conclusão de etapa obrigatória que não foi apresentada.
- Cobrir caminho desktop, mobile e usuário sem uma seção permitida, com política de passos disponíveis explícita.

**Limites:** Fonte fixa; nenhum endpoint, SDK real, SQL, envio, login, browser ou deploy executado. Nenhum arquivo de produto foi alterado. Três getters de navegação e callbacks reais foram analisados/executados em fronteiras sintéticas; nenhum DOM de aplicação foi montado. O probe usa a ausência estática dos IDs e querySelector sintético null; não mede posicionamento, scroll ou visibilidade em browser. O teste existente que só verifica seletor válido/consulta sem throw não prova que o alvo exista. Não foi reexecutado.

## R2-INF-039 — Modais próprios anunciam modalidade sem implementar o contrato de foco

WelcomeModal e MobileDrawerMenu renderizam motion.div com role=dialog e aria-modal=true, mas não gerenciam foco inicial, contenção de Tab, inércia do conteúdo externo ou retorno do foco. Seus consumidores mantêm a aplicação e seus controles montados. WelcomeModal já implementa Escape corretamente; o drawer não possui handler de Escape no componente ou em MobileShell.

**Precondições:** Um dos dois overlays está aberto e há controles focáveis da aplicação ao fundo. Usuário depende de teclado ou do contrato de modalidade comunicado à tecnologia assistiva.

**Efeito e alcance:** A semântica declara que a interação está restrita ao diálogo, enquanto a implementação não estabelece essa restrição nem transfere/restaura o foco. Isso cria um caminho de interação incompatível com o contrato modal. O achado é de fonte e contrato primário; nenhuma sequência DOM/AT foi executada ou apresentada como observação de produção.

**Evidência:**

- `src/components/onboarding/WelcomeModal.tsx:13–47` — Comentário reconhece ausência de trap; único efeito trata Escape; modal sem primitive de foco. SHA256 `b4b1d9fa2fb5a4ff1a7e736595eb9414f614b567df89632120ba95a1f8a5ef9c`.
- `src/components/onboarding/WelcomeModal.tsx:56–62` — Botão de fechar rotulado preservado. SHA256 `b4b1d9fa2fb5a4ff1a7e736595eb9414f614b567df89632120ba95a1f8a5ef9c`.
- `src/pages/Index.tsx:110–143` — AppShell permanece montado como irmão do modal. SHA256 `971796f4112ea03b82db11b40592e340314767f4dd1a8d0df6ac5b80335e2268`.
- `src/components/mobile/MobileDrawerMenu.tsx:133–164` — Drawer próprio com aria-modal, backdrop e drag, sem foco. SHA256 `9df67cc307562d9464297b710086bb26602719a2abb44cd2a54348d1c88d556c`.
- `src/components/mobile/MobileDrawerMenu.tsx:184–220` — Controles internos e busca sem autofoco/gerenciamento modal. SHA256 `9df67cc307562d9464297b710086bb26602719a2abb44cd2a54348d1c88d556c`.
- `src/components/mobile/MobileShell.tsx:33–105` — Consumidor mantém Header/bottom navigation e não adiciona foco/Escape. SHA256 `bd36c452c890fae93dedb2e1da1a0f79568eca6fd3cff7036f146c342ae923d4`.
- `src/providers/AppProviders.tsx:61–90` — Providers globais não oferecem um escopo de foco para estes overlays. SHA256 `7105ef85cebbef40787859cfa9e50ec541efbe86cdd0ca0c2e6e8d230a218d1f`.

**Critérios de aceite:**

- Usar o Dialog/Sheet acessível já existente ou implementar integralmente foco inicial apropriado, contenção de Tab/Shift+Tab, conteúdo externo inerte e retorno ao acionador ou destino lógico.
- Preservar Escape no WelcomeModal e fornecer fechamento por Escape no drawer sem quebrar botão, backdrop ou drag.
- Testar cada modal com um controle focável externo: abertura, ciclo de Tab/Shift+Tab, Escape, fechamento e retorno. Complementar com tecnologia assistiva em browser.
- Não considerar role/aria-modal ou uma regra isolada de axe como prova suficiente do ciclo de foco.

**Limites:** Fonte fixa; nenhum endpoint, SDK real, SQL, envio, login, browser ou deploy executado. Nenhum arquivo de produto foi alterado. Dois loci foram agrupados em um único mecanismo; MobileDrawerMenu foi revisto também pelo root. WelcomeModal já tem nome acessível, um único role de diálogo e Escape. Essas correções anteriores são preservadas. Não há probe adicional para este registro. Foco nativo, ordem DOM e comportamento de tecnologia assistiva continuam pendentes de execução controlada.

**Contrato primário:** [WAI-ARIA APG — Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), consultado em 04/10/2026. O documento fornece o contrato de foco; não representa uma observação da aplicação.

## Adjudicação e controles

- Nenhuma tarefa DONE_VERIFIED foi reaberta por associação temática; os quatro achados especificam novos subcontratos de produto.
- P055/090 já está PARTIAL e trata onboarding/ambiente local do projeto, não certifica este tour visual. O status é preservado.
- P015/E97 está SUPERSEDED e trata onboarding do catálogo. Não é reativado pelo defeito no tour global.
- Tarefas de movimento reduzido de Contatos, Tarefas e Telefonia mantêm seus estados próprios. O defeito 037 é a preferência global versus roteador, não rejeição genérica dos controles por módulo.
- Root PLAT010/011 cobrem busca e notificações mobile; a navegação filtrada por permissões permanece um controle válido. Esses mecanismos não foram recontados.
- Atualização do checklist ao voltar ao dashboard: rejeitada, pois o card é desmontado fora da view e remonta no retorno.
- PageTemplate/scroll: sem prova do DOM e dos estilos computados, não foi promovida a hipótese de dois donos de scroll.
- Posicionamento do tour durante scroll e passos ocultos por permissão são limites adicionais; não recebem IDs sem cenário composto comprovado.
- Heurísticas de perfil/conexão/notificações foram lidas. Um indicador de orientação simplificado não foi automaticamente tratado como requisito novo de negócio.
- WelcomeModal Escape, nome acessível e diálogo único são correções presentes. O registro 039 cobre somente o contrato restante de foco e o drawer correspondente.
- A redução CSS existente e o media query do sistema são controles reais; o achado 037 não os descreve como ausentes.

## Cobertura por arquivo

| Arquivo | Nível | Faixas | Avaliação |
|---|---|---|---|
| `src/components/layout/A11yBoilerplate.tsx` | semantic | 1–29 | Skip-link e live regions polite/assertive completos; não é focus trap de modal e não altera tab-order global. |
| `src/components/layout/AppShell.tsx` | targeted | 110–163 | Suporte dirigido: Sidebar fora de Zen/mobile, main focusable, card só dashboard e ViewRouter. Root é dono da leitura integral. |
| `src/components/layout/MediaVolumeToggle.tsx` | semantic | 1–11 | Wrapper inteiro encaminha variant sidebar ao controle de mídia, preservando diferença em relação aos alertas; operações do MediaVolumeControl pertencem à revisão Inbox. |
| `src/components/layout/PageHeader.tsx` | semantic | 1–169 | Todos ramos de título/ações/breadcrumb/back completos. hidePageBreadcrumbs contextual é decisão preservada; Início explícito evita duplicar rótulo. Callbacks interceptam href quando fornecidos; retorno sem callback usa navigate(-1). Não reintroduzir breadcrumb desktop por diagnóstico antigo. |
| `src/components/layout/PageTemplate.tsx` | semantic | 1–133 | Props e ramos header/actions/filters/content, padding/fullBleed/constrained e variants completos. Consumidor real SettingsView; CSS/layout visual não foi medido. Fonte não tem scroller próprio apesar de comentário do ViewContainer; rastreamento dirigido deve avaliar alcance, não prometer captura visual. |
| `src/components/layout/ProfileMenuContent.tsx` | semantic | 1–54 | Conteúdo completo: status chama callback opcional+fecha, settings navega e logout opcional. Nenhum SDK ou persistência própria; papel/heartbeat não derivado no menu. |
| `src/components/layout/RoleBadge.tsx` | semantic | 1–24 | Mapas de labels/variants completos e papel vindo do consumidor. Badge não concede autorização e não compara precedência de papéis. |
| `src/components/layout/Sidebar.tsx` | semantic | 1–258 | Corpo completo: filtra navegação por NavigationService/roles/permissões, filtra favoritos por canAccess e retira duplicados da primária; scroll único, modos recolhido/expandido e controles do rodapé. Busca dispara open-global-search da paleta antiga, fronteira de GOV001 do root, sem novo ID. Notificações/tema não recebem data-tour neste JSX. |
| `src/components/layout/SidebarBackButton.tsx` | semantic | 1–46 | Guarda canGoBack+callback e placeholder do modo recolhido completos; preserva altura e foco/label no botão presente. onGoBack é do dono do histórico, não histórico implementado aqui. |
| `src/components/layout/SidebarNavGroup.tsx` | semantic | 1–137 | Leitura/escrita local de grupos, default/persistência/active override, trigger, AnimatePresence e mapa de itens completos. Armazenamento indisponível é capturado; hasActiveItem mantém grupo aberto deliberadamente. Payload JSON fora do contrato é limite de robustez local, não incidente alegado. |
| `src/components/layout/SidebarNavItem.tsx` | semantic | 1–139 | Ref/ícone/active/badge, prefetch e dois modos completos. data-tour vem do id da navegação. Favorito chama stopPropagation; botão aninhado no botão principal em modo expandido documentado como estrutura a validar por browser/AT, sem inferir duplo clique ou quebrar navegação automaticamente. Badge texto genérico não certifica não lidas de toda entidade. |
| `src/components/layout/SidebarUserPill.tsx` | semantic | 1–80 | Avatar/nome/role, estado de presença e popover completos; passa setMyPresenceStatus ao menu e fecha após ações. Presença é valor do hook, não heartbeat comprovado. API031 do providers continua dono do contrato de presença. |
| `src/components/layout/ViewContainer.tsx` | semantic | 1–55 | Reset de scroll por viewId, ramos fullScreen/ownScroll e wrapper scroll compartilhado lidos. ownScroll=settings conforme ViewRouter; contexto ref apenas no ramo padrão. Não amplia LT-LAYOUT001 antigo nem julga viewport sem medição. |
| `src/components/layout/ViewLoadingFallback.tsx` | semantic | 1–44 | Skeletons, role status/aria-busy e padding opcional completos. Loading é estado de apresentação, não sucesso de query. |
| `src/components/layout/VoiceCopilotFAB.tsx` | semantic | 1–25 | Botão flutuante+tooltip completos; onClick vem do consumidor, nenhum acesso ao microfone/rede acontece neste wrapper. |
| `src/components/layout/sidebarNavConfig.ts` | semantic | 1–14 | Exports e aliases inteiros, derivados de NavigationService. Ordem dos seis grupos é pressuposto atual; não modifica dados. |
| `src/components/mobile/MobileDrawerMenu.tsx` | semantic | 1–320 | Leitura integral por extensão do contrato modal: navegação e recentes filtram canAccessView; busca local funciona. Wrapper motion declara dialog/aria-modal, fecha por backdrop, botão e drag; não implementa foco inicial, contenção, retorno, inert ou Escape. Storage de recentes e interação foram lidos, sem browser ou mutação. Root mantém PLAT010/011 nos estados de busca/notificações; não recontados. |
| `src/components/mobile/MobileShell.tsx` | semantic | 1–109 | Leitura integral como consumidor do drawer: controla isOpen por Header/BottomNavigation e onClose; não oferece gerenciamento de foco ou Escape ao drawer. Busca e notificações locais são achados PLAT010/011 do root e ficam fora desta contagem. |
| `src/components/onboarding/OnboardingChecklist.tsx` | semantic | 1–137 | Timers, checkAllSteps sequencial, dismiss por usuário, progress e dois layouts completos. Efeito[user] remonta ao voltar ao dashboard; hipótese stale por navegar a Settings foi rejeitada após consumer. Exibe tema marcado quando checkCondition recebe data ausente; fechamento/progresso não escreve configuração. |
| `src/components/onboarding/OnboardingTour.tsx` | semantic | 1–86 | Contexto, guarda de uso, start/end/next/prev/goTo e onComplete completos. End é usado tanto no término quanto no fechamento/skip; não promete tour inteiramente assistido. Overlay sempre montado no Provider. |
| `src/components/onboarding/TourOverlay.tsx` | semantic | 1–217 | Posicionamento, retry10, skip de alvo ausente/zerado, listeners+cleanup, SVG/callout/controles completos. Falta reset de targetRect durante alvo faltante; mede antes de scrollIntoView e só escuta resize (limite geométrico a validar). Ausência de alvos padrão rastreada; não inferido duplo Enter nativo sem DOM. |
| `src/components/onboarding/WelcomeModal.tsx` | semantic | 1–177 | Todo modal lido: guarda open, listener Escape e cleanup, conteúdo/ações e aria-modal. Não põe foco inicial, trap de Tab, restauração ou inert no fundo; fluxo Index mantém AppShell irmão montado. Tests só labels/landmark/Escape não provam ciclo de foco. |
| `src/components/onboarding/__tests__/OnboardingTour.test.tsx` | semantic | 1–310 | Teste inteiro310 lido, não executado: estado/transições do Provider, formato de seletores, callback de ações e Escape/aria do Welcome. querySelector não lançar não prova alvo existente; não há tour real contra Sidebar nem scroll/focus fixture. |
| `src/components/onboarding/__tests__/WelcomeModal.a11y.test.tsx` | semantic | 1–53 | Teste inteiro lido, não executado: verifica um dialog, aria-modal+label, axe region e fechado. Não exercita foco inicial/Tab/inert/restauração; manter a prova positiva de landmark. |
| `src/components/onboarding/checklistSteps.ts` | semantic | 1–121 | Seis checks integralmente lidos e comparados aos rótulos. Queries SDK ignoram error; tema compara undefined contra null/system e devolve true, ao contrário do hook agregado que guarda settings. Perfil usa nome (foto descrita mas não exigida pelo check), conexão depende visibilidade/RLS; não inventada obrigação global nova. |
| `src/components/onboarding/defaultTourSteps.ts` | semantic | 1–46 | Seis passos/seletores completos. notifications/theme não correspondem a produtores data-tour atuais; parte do contrato atual do tour, não apenas formato CSS. |
| `src/components/settings/AppearanceSettings.tsx` | targeted | 1–86 | Controle real de tema oferece dark/light/system e chama updateSettings; campos adjacentes de perfil e densidade. Não certifica toda persistência por trecho. |
| `src/components/settings/SettingsView.tsx` | targeted | 40–75, 211–236 | Suporte dirigido ao PageTemplate: header/ações e conteúdo da aba de aparência. Possível owner de scroll não promovido: comportamento CSS overflow-y depende do DOM e não foi medido. |
| `src/components/theme/HighContrastToggle.tsx` | semantic | 1–298 | Corpo completo298: preferências de contraste e sistema, reaplicação de preset, multiplicador, reducedMotion/classe+Storage, largeText e diálogo de configurações. UI reduz movimento escreve reducedMotion=true, rota lê outra chave. Storage getters/setters não guardados no provider; não testado browser privado. Esta leitura encerra saldo298 que root pediu depois. |
| `src/components/transitions/PageTransitionProvider.tsx` | semantic | 1–14 | Wrapper integral delega RouteTransition e declara respeito à preferência do usuário; consumidor AppRoutes confirmado por faixa. |
| `src/components/transitions/RouteTransition.tsx` | semantic | 1–37 | Config memo, variant reduzida, AnimatePresence por pathname e filho completos. Chave pathname é da rota, não troca de view interna no Index. Contrato de preferência própria rastreado; não reimplementar o motor Framer em prova. |
| `src/components/transitions/index.ts` | semantic | 1–17 | Reexports integrais; não instala handlers nem publica setter de preferência por conta própria. |
| `src/components/transitions/transitionConfig.ts` | semantic | 1–45 | Lookup por prefixo mais longo e store zapp:reduce-motion completos; guards de Storage preservados. Chave/formato distintos do controle de acessibilidade ativo, rastreados no consumidor. |
| `src/components/transitions/transitionVariants.ts` | semantic | 1–93 | Todos ramos none/fade/slide/zoom/flip/parallax completos; duração limitada0.05–0.4 e defaults. none ainda faz fade80ms, reduz movimento geométrico; não equivale a provar que toda animação foi desativada. |
| `src/components/transitions/useTransitionPreferences.ts` | semantic | 1–33 | Estado local, leitura inicial, media query/change cleanup e setter persistente completos. reducedMotion = sistema OU chave própria; não consome contexto HighContrast nem classe reduced-motion. Divergência de preferência confirmada, sem render medido. |
| `src/contexts/LayoutContext.tsx` | semantic | 1–17 | Contexto/provider/hook completos, default hidePageBreadcrumbs false e estado Zen opcional. Ocultar trilha no desktop é decisão preservada do AppShell. |
| `src/contexts/LayoutScrollContext.tsx` | semantic | 1–9 | Contexto/ref/hook completos; default current null, provider do ViewContainer no ramo scroll. Ausência do contexto nos ramos sem scroller é deliberada. |
| `src/hooks/system/useUserSettings.ts` | targeted | 151–202 | Persistência dirigida inclui theme no upsert e valida error. Confirma que SDK data ausente não é prova de tema selecionado; fonte não executada. |
| `src/hooks/ui/useOnboardingChecklist.ts` | semantic | 1–137 | Hook completo comparado ao card: guarda if(settings) antes de theme, enabled muda ao dashboard, estado/dismiss/reset e queries. Não duplica achado de scope global sem RLS; ausência de dados e freshness devem ser explicitadas. |
| `src/hooks/ui/useTheme.ts` | targeted | 1–185 | Suporte dirigido à preferência visual de tema: sincroniza estado/store/localStorage theme e classes. Isso não transforma data ausente do SDK em confirmação de tema persistido; restante do hook não foi integralmente lido neste lote. |
| `src/index.css` | targeted | 35–56 | Regra nativa de View Transitions tem media query do sistema. Não vincula o toggle interno nem corrige preferência do hook por si só. |
| `src/pages/Index.tsx` | semantic | 1–196 | Corpo integral lido como suporte: auth guard, navegação, checklist habilitado só dashboard, AppShell persistente mas card condicional, Welcome e TourProvider. Antiga CommandPalette/Gmail/audit são fronteiras do root; não duplicadas. |
| `src/pages/ViewRouter.tsx` | targeted | 1–47, 88–124, 150–183 | Suporte dirigido: metadata de layouts/ownScroll=settings e ViewContainer; view interna tem AnimatePresence/OS reduced motion, não usa a preferência do HighContrast. |
| `src/providers/AppProviders.tsx` | semantic | 1–90 | Corpo completo: ErrorBoundary/retry3 e fallbacks, Query/Auth/HighContrast/toast/tooltip/ThemeSync e providers. Não existe gestão global de foco para Welcome. Limpar Cache chama localStorage.clear, observado sem execução; classificar recuperação depende do consumidor de ErrorBoundary. |
| `src/routes/AppRoutes.tsx` | targeted | 40–119 | Montagem do PageTransitionProvider ao redor de rotas, incluindo /queues/rotas de auth nos mapas; acesso depende de ProtectedRoute onde aplicável. |
| `src/services/navigation.service.ts` | targeted | 1–160 | Getters completos de navegação primária/grupos/avançado conferidos; seus IDs não incluem notifications ou theme singular. Restante da autorização canAccess não lido nesta ampliação e pertence ao root. |
| `src/styles/accessibility.css` | targeted | 50–76 | Regra reduced-motion reduz CSS animation/transition durations e scroll behavior; não é consumo da flag no hook de transição. Não se relata duração observada de Framer. |

## Lacunas remanescentes

- Não houve browser, axe, tecnologia assistiva, medição visual ou chamada de produto. Leitura integral não é aceite de interação.
- Três casos offline sustentam 036–038. O registro 039 é uma análise estática do contrato modal, sem quarto teste executado.
- A cobertura primária fecha somente estes 25 arquivos e suas 2.136 linhas; a reauditoria global continua em andamento.

### Extensão documental de R2-INF-019 — runner histórico de volume

Extensão histórica: mut-plano-volume.py recebe alvo em rodar, mas não o usa. Qualquer returncode não zero na execução do mutante satisfaz esperado_verde=False e vira PEGA, inclusive erro do runner ou compilação sem assertion relevante executada. Diferentemente do runner original do mapa, este script exige baseline verde, confere alvo literal, restaura bytes em finally e compara SHA. Esses controles são preservados; não se atribui falha a uma execução histórica não observada.

- `docs/evidencias/plano-volume-50/mut-plano-volume.py:99–109` — alvo não usado; classificação apenas por returncode. SHA256 `ba8d01e742131b5da5c1f323ad885174e0e10cdea36553fa07ce95201cf33aa5`.
- `docs/evidencias/plano-volume-50/mut-plano-volume.py:112–125` — Controle positivo: baseline verde antes de qualquer mutação. SHA256 `ba8d01e742131b5da5c1f323ad885174e0e10cdea36553fa07ce95201cf33aa5`.
- `docs/evidencias/plano-volume-50/mut-plano-volume.py:127–149` — Alvo literal, finally e SHA preservados; resultado classificado PEGA pelo booleano permissivo. SHA256 `ba8d01e742131b5da5c1f323ad885174e0e10cdea36553fa07ce95201cf33aa5`.

## Ampliação finita — telemetria e tratamento de erros

### Revisão de telemetria e tratamento de erros

Sete arquivos primários lidos integralmente: 685 linhas. HighContrastToggle já foi fechado como apoio no lote anterior. Há 16 caminhos com apoio: 12 integrais e 4 dirigidos. Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`; nenhuma alteração de produto.

## Resultado e prova delimitada

Dois achados, dois casos offline. INF-TE-P01 verifica a falha lançada pela query real com SDK sintético e a apresentação real da página/tabela para um estado documentado de erro. INF-TE-P02 chama somente render do ErrorBoundary. Nenhum caso executa React, TanStack, browser, rede ou reload.

Primeira execução interrompida por guarda do harness: import.meta.env.DEV aparece também em comentário, tornando a contagem textual 2. A substituição foi restringida à expressão JSX exata; os dois casos passaram depois. Nenhuma falha do harness virou achado.

## R2-INF-040 — Falha de leitura da telemetria aparece como sistema com bom desempenho

A queryFn lança o error do SDK, mas AdminTelemetriaPage não consome error/isError/status. Sem dados prévios, o default rows=[] chega à tabela quando a primeira consulta terminou em falha. TelemetryTable usa somente isLoading e rows.length e exibe uma mensagem explícita de bom desempenho, enquanto os cards mostram zero erros e média 0ms.

**Precondições:** Usuário com acesso à view de telemetria. Consulta inicial falha depois das tentativas configuradas e não há dados de sucesso no cache dessa chave; não há configuração externa que faça throwOnError.

**Efeito:** Uma indisponibilidade ou erro de autorização/consulta é apresentada como ausência de consultas lentas e bom desempenho, justamente quando a tela deveria comunicar que não conseguiu medir. O achado não depende de números reais do banco nem afirma exposição a usuários sem acesso.

**Evidência:**

- `src/pages/AdminTelemetriaPage.tsx:37–59` — Estado de erro omitido; queryFn lança SDK error. SHA256 `a84e4f28ce99e418b6d2dc4c8f83960e1bb003fb04ceabd175f20bffb453d65d`.
- `src/pages/AdminTelemetriaPage.tsx:70–98` — Cards calculados do array vazio. SHA256 `a84e4f28ce99e418b6d2dc4c8f83960e1bb003fb04ceabd175f20bffb453d65d`.
- `src/pages/AdminTelemetriaPage.tsx:145–148` — Contador e tabela sem estado de erro. SHA256 `a84e4f28ce99e418b6d2dc4c8f83960e1bb003fb04ceabd175f20bffb453d65d`.
- `src/pages/admin-telemetria/TelemetryTable.tsx:13–28` — Sem dados vira mensagem explícita de bom desempenho. SHA256 `351510648414af0ce45528db1ed08ec743d02894d50e0899083481b885eab0b4`.
- `src/lib/queryClient.ts:9–25` — Configura retries, mas não eleva todo erro de query à ErrorBoundary. SHA256 `5036c273782cf6aca3d756b2ac74710edbd0b5d8fe177a0991e5fdc2a390fac5`.
- `src/pages/ViewRouter.tsx:81–87` — View telemetry é consumidor ativo. SHA256 `6cf287e71a19309582ed6406005bd43710fed41505b6c8127b825e130bf4c530`.
- `src/pages/ViewRouter.tsx:129–151` — Gate de acesso presente antes da montagem. SHA256 `6cf287e71a19309582ed6406005bd43710fed41505b6c8127b825e130bf4c530`.
- `src/services/navigation.service.ts:142–155` — Telemetria restrita por papel no mapa de navegação. SHA256 `8e128c5cc1aa208f96570c68295d6e4836ca1febed4d7d1e603f648d4c294d48`.

**Aceite:**

- Consumir e apresentar falha da query, separada de carregamento, sucesso vazio e sucesso com registros.
- Não derivar saúde do sistema de ausência de dados por falha; se houver dados de cache, sinalizar atualização falha/defasagem.
- Verificar falha inicial, sucesso vazio, sucesso com alertas e falha de refetch; manter os gates de acesso e o erro já validado pelo cleanup.

**Limites:** Nenhuma query de produto, biblioteca React/TanStack, browser ou retry real executado. Probe usa o queryFn real com SDK sintético e fornece o estado de erro documentado à fronteira do hook; testa as decisões de página/tabela reais. A classe de severidade e o limite de 500 registros não foram convertidos em defeitos adicionais.

Contrato primário: [TanStack Query — Queries](https://tanstack.com/query/latest/docs/framework/react/guides/queries), consultado em 04/10/2026. Estados de erro e sucesso são distintos; a documentação não é captura de execução do produto.

## R2-INF-041 — ErrorBoundary ignora fallback nulo usado para retirar overlays com falha

O contrato de Props aceita fallback ReactNode, mas render verifica seu valor por truthiness. Quando App fornece fallback={null} para os providers diferidos, a condição é falsa e o boundary renderiza a tela padrão de erro, com min-h-screen e role=alert. App documenta expressamente que esse fallback deve retirar silenciosamente a camada opcional.

**Precondições:** O boundary de overlays da aplicação captura uma falha e permanece em hasError. O fallback fornecido é null, como no consumidor atual; para chunk load, após a recuperação automática não ser possível ou já ter sido usada.

**Efeito:** Uma falha de componente opcional produz um painel de erro com altura mínima de uma viewport e anúncio assertivo em vez de desaparecer. AppRoutes continua fora e montado; não se afirma que o roteamento ou toda a aplicação foi derrubado. A ocupação visual foi confirmada como classe/JSX, não medida em navegador.

**Evidência:**

- `src/components/errors/ErrorBoundary.tsx:8–13` — Fallback é ReactNode opcional. SHA256 `fecb028508cd26cc018163f3a21c18093761ffc4fc07eb780ec8b9c940bd18ca`.
- `src/components/errors/ErrorBoundary.tsx:129–142` — if truthy ignora null e cai na UI padrão. SHA256 `fecb028508cd26cc018163f3a21c18093761ffc4fc07eb780ec8b9c940bd18ca`.
- `src/App.tsx:15–24` — Contrato de recuperação silenciosa dos overlays. SHA256 `3e05e3ea5f9c194799d123aa46a8dc80967dc8ef846f8efe7e97e8d96f659220`.
- `src/App.tsx:128–143` — Consumidor real fornece null e mantém AppRoutes fora do boundary. SHA256 `3e05e3ea5f9c194799d123aa46a8dc80967dc8ef846f8efe7e97e8d96f659220`.

**Aceite:**

- Distinguir fallback não fornecido de fallback fornecido como null/false/zero/string vazia; retornar o ReactNode explícito.
- Verificar erro com fallback=null, fallback customizado e ausência de fallback, além do caminho sem erro.
- Manter os wrappers de sessionStorage, limitação de autoreload e isolamento de AppRoutes; validar em browser que a camada opcional desaparece sem deslocar a aplicação.

**Limites:** Probe chama o método render real isolado, com DEV=false e JSX inerte; não executa componentDidCatch, reportClientError ou reload. O comentário de main.tsx sobre um wrapper não montado foi tratado pelo root como observação; não compõe este achado. Os controles de chunk recovery e ocultação de detalhes em produção foram lidos e preservados.

## Controles e adjudicação

Cleanup da telemetria já verifica SDK error. Os períodos de sete dias são deliberadamente de calendário em São Paulo e os testes importam o helper real. O gate de acesso à view foi preservado. Chunk recovery possui wrappers de storage e limitação de recarga; ErrorFallback exportado não foi promovido sem consumidor. Nenhuma tarefa DONE_VERIFIED foi reaberta por semelhança temática.

INF-019 recebeu um locus histórico adicional por revisão compartilhada com root. O script de volume tem baseline, alvo literal, finally e SHA; o achado preserva esses controles e limita a extensão à contagem de qualquer nonzero como PEGA. Não é um terceiro achado deste lote.

## Cobertura por arquivo

| Arquivo | Nível | Faixas | Avaliação |
|---|---|---|---|
| `docs/evidencias/plano-volume-50/mut-plano-volume.py` | targeted | 95–154 | Trechos de apoio da extensão INF-019 revisada integralmente pelo root: baseline, rodar e mutações com finally/SHA. Nonzero indiscriminado continua inadequado para provar assertion alvo; não se executou o script. |
| `infrastructure/preview-egress-proxy/main.go` | semantic | 1–355 | Releitura integral para explicitar a faixa antes implícita: HMAC corpo/timestamp/nonce, retenção até expiração da aceitação, mutex/capacidade, limites de body/time/redirect, validação de todas respostas DNS e dial de IP validado preservando SNI/Host. Erros externos genéricos. Nenhum Go/servidor/rede iniciado. |
| `infrastructure/preview-egress-proxy/main_test.go` | semantic | 1–182 | Releitura integral de assertions: IP/URL privados, autenticação/replay com clock à frente, pin de dial/SNI/Host e rejeição de DNS privado antes do dial. TLS insecure é fixture do httptest; teste inicia serviço local se executado, mas não foi executado nesta auditoria. |
| `src/App.tsx` | targeted | 1–45, 118–150 | Apoio dirigido: contrato e montagem de overlays opcionais com fallback null, AppRoutes irmão fora do boundary. Nenhum handler global foi executado. |
| `src/components/admin/telemetry/TelemetryCharts.tsx` | semantic | 1–187 | Leitura integral de apoio: buckets floor por duração, severidade/contagem/média/máximo e ranking. Usa somente rows filtrado; 500 mais recentes limitam série. Sem chamada ou mutação, sem nova medição fictícia. |
| `src/components/errors/ErrorBoundary.tsx` | semantic | 1–254 | Leitura integral: recuperação de chunks exige storage legível e gravável, flag evita loop; retry/home/reload limpam flag com catch. Detalhes DEV condicionados, render fallback truthy é INF-041. Export ErrorFallback não teve consumidor produtivo localizado além de reexport; sem alegação de exposição desse export. |
| `src/lib/queryClient.ts` | semantic | 1–33 | Leitura integral de apoio: singleton, retries de queries e networkMode online; mutations sem retry. Não configura throwOnError global nem converte toda query em suspense. |
| `src/pages/AdminTelemetriaPage.tsx` | semantic | 1–151 | Leitura integral: queryKey inclui filtros, query limitada a 500 mais recentes com erro lançado; apresentação ignora isError (INF-040). Cleanup verifica SDK error. Calendário custom e polling lidos; truncamento e ausência de datas explícitos como limites, não novo defeito automático. |
| `src/pages/ViewRouter.tsx` | targeted | 75–90, 125–152 | Apoio dirigido: mapeamento ativo telemetry e gate de acesso antes de ViewComponent. Erro de useQuery não é automaticamente exceção de render. |
| `src/pages/admin-telemetria/TelemetryStatsCards.tsx` | semantic | 1–60 | Leitura integral: quatro cards recebem agregados; não buscam dados. Rótulos e zero/média seguem o pai, sustentando efeito de INF-040 sem ID separado. |
| `src/pages/admin-telemetria/TelemetryTable.tsx` | semantic | 1–88 | Leitura integral: loading, sucesso vazio e linhas; vazio afirma bom desempenho sem receber erro do pai (INF-040). Colunas/limiares/labels de data e severidade inspecionados. |
| `src/pages/admin-telemetria/TelemetryTopOffenders.tsx` | semantic | 1–44 | Leitura integral: oculta vazio e exibe até oito grupos recebidos, count/max/média; divisor só ocorre em grupo com linha. Contrato é alertas dos registros carregados, sem query adicional. |
| `src/pages/admin-telemetria/__tests__/telemetryUtils.periodo.test.ts` | semantic | 1–77 | Asserções/fixtures integrais lidas, sem executar: importa helper real; data fixa e Intl São Paulo testam meia-noite, sete dias calendário e horas corridas. Não prova a apresentação de erro da página. |
| `src/pages/admin-telemetria/telemetryTypes.ts` | semantic | 1–18 | Tipos integrais de linha, severidade e período; schema estático não valida dados remotos por si só. |
| `src/pages/admin-telemetria/telemetryUtils.tsx` | semantic | 1–70 | Leitura integral: formatos, badges e agrupamento top oito por frequência; dias de calendário em São Paulo são decisão explícita para 7d, horas corridas preservadas para 1h/6h/24h. |
| `src/services/navigation.service.ts` | targeted | 142–155 | Apoio dirigido: item telemetry com ADMIN_ONLY; não se presume acesso universal. |

## Lacunas


- Nenhum browser, SDK real, banco, TLS, Go runtime ou serviço iniciado.
- Probes usam fonte real e fronteiras inertes; não substituem React/TanStack nem a execução de seus ciclos.
- O limite de 500 registros representa uma amostra recente, não certifica métricas de todo o banco; não foi promovido a um novo mecanismo sem promessa mais específica.
- A leitura integral dos sete arquivos fecha apenas o lote delegado; o roster final de testes permanece em andamento.

## Ampliação finita — testes e contratos de prova

### Revisão integral do roster fixo de testes

Fechados 118 arquivos e 14.473 linhas do roster alocado no HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`: 117 leituras integrais neste lote e 1 leitura integral anterior citada. Não houve execução de suítes, serviços, browser ou novos probes. Cada linha do journal contém avaliação específica de assertions, fixtures/mocks, controles positivos, limites, SHA256, blob Git e faixa efetivamente lida. O roster original é histórico da alocação; `test-review.json` é o estado final.

Foram adicionados R2-INF-042 e R2-INF-043, ambos P2. O primeiro identifica o filtro `critical` do spec E98: a regra color-contrast é `serious`, portanto o próprio gate a descarta. Outros specs de contraste exigem todas as violações vazias; nenhuma regressão visual atual foi inferida. O segundo identifica o nome acessível antigo na fixture de onboarding; se o modal abre, o timeout absorvido leva a um retorno sem dispensá-lo. O teste do próprio onboarding precisa de navegação que preserve seu modal, mesmo após correção do helper compartilhado.

A deduplicação considerou os 104 achados anteriores e os relatórios atuais. TC-011 é mantido como família de prova insuficiente/tautológica sob responsabilidade do root. OTH010/CT94 é outro teste; VOL03/SK04 preservam a decisão de skin. A tolerância 4.4 documentada para alto contraste não foi tratada como defeito.

O suporte adicional `contraste-balao-midia.contract.test.ts` foi lido integralmente: o parser casa `.high-contrast` dentro de `.dark.high-contrast`, de modo que o estado rotulado claro termina com tokens escuros. Isso foi encaminhado como extensão de TC-011, sem outro ID INF. As verificações de classes reais e o parser exato do teste vizinho são controles positivos preservados.

Os limites de prova registrados por arquivo não tornam as suítes inteiras tautológicas. Exemplos: os testes de realtime incluem uma corrida real com deferred; os testes de segurança incluem chamadas reais a logAudit além de um mockRpc autorreferente; os contratos de manifesto distinguem fonte e bundle corretamente; testes de CI verificam ordenação textual, mas não reproduzem o dry-run que grava secrets antes de chegar ao deploy. Os testes de OnboardingTour lidos pelo root verificam Escape, estados e nome, mas querySelector apenas não lançar aceita null e não demonstra foco/trap/inert (apoio INF038/039).

Para consolidação da família TC-011, também foram comunicados os casos de Array.sort local em ordenar.unit, assert do campo já visível em TalkX, oráculos locais de PerformanceMonitor, fallback de teste de exclusão sem remover no RateLimitConfigPanel e logging de catálogo consultado sem marcador/limite temporal. No catálogo, a mensagem em si possui marcador e janela temporal: a insuficiência é limitada à correlação do evento de log.

`test-review-coverage.json` usa semantic apenas para leitura integral do código do teste; não afirma cobertura integral do produto testado. Os arquivos de apoio possuem faixas explícitas. Permanecem sem prova de runtime: accessible-name/browser, axe/contraste renderizado, CI remoto, SDK real, PostgreSQL e provedores. Os dois novos achados têm zero probes atribuídos e prova estática delimitada.

## Ampliação finita — scripts shell de contrato

### Leitura integral dos 12 scripts shell de contrato

Lote fechado: 12 arquivos/3.554 linhas no HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`. Zero scripts, SQL, Docker, Deno, serviço, suíte ou probe executado. A leitura incluiu setup, SQL embutido, migrations selecionadas, branches/assertions, status de erro e cleanup. Credenciais nos fixtures são sintéticas; nenhum segredo real foi lido ou publicado.

As operações mutáveis desses scripts, quando executados, apontam para containers criados pelo próprio runner. Não foram confundidas com execução somente leitura nem com o cleanup de reações do E2E produtivo. Os controles positivos reais são preservados, assim como o limite de schema mínimo. Nenhum novo ID INF foi criado. Limites concretos de oráculo (pausa com item já inelegível, ACL PUBLIC não medido, psql permissivo/role ausente) foram encaminhados à família TC-011.

## scripts/db-audit/calls-telefonia-contract.test.sh

Faixa 1–373; SHA256 `c9a6e49def217142809123698aa5ccc77a1641312a1af1a299dbc31d8afee650`; blob `a1982fa70f7d983fed7c5a04edb6baa0629100a2`.

Docker com nome PID e cleanup restrito; readiness estável; set-Eeuo/ON_ERROR_STOP1. Schema/roles/policies mínimos, três migrations, asserts de escopo/raw RLS, filtro/paginação/KPI, dono, NULL profile/owner, notas, chamadas WhatsApp, grants e reaplicação.

expect_failure41–51 aceita qualquer erro, sem SQLSTATE; positivos e queries de estado reduzem o risco, mas não provam a causa de toda recusa. Reaplicação365 cobre a migration base, não as duas correções posteriores. Não certifica a cadeia completa nem o overload mais recente.

## scripts/db-audit/mapa-f1-address-contract.test.sh

Faixa 1–126; SHA256 `f02c1c695cf4e5701714c5381f9258100e10205c090cc278dc2579bbe986b801`; blob `980a69a0bbc8bcbd66aed4e680ed8514a20913f8`.

Container PID network none, mktemp/cleanup, readiness por log+SELECT, ON_ERROR_STOP1. Aplica migrations reais, mede assinatura/campo de endereço, trigger só em mudança, cleared e ausência de PII no audit.

ACL98–103 consulta grantees diretos e verifica anon ausente/authenticated presente, sem testar PUBLIC apesar do título; PUBLIC permitiria anon por herança. A função is_admin_or_supervisor da fixture sempre true: não prova escopo de agente.

## scripts/db-audit/multiplix-delivery-leases.test.sh

Faixa 1–743; SHA256 `ac3707ca66fdbf97753f7ecb8d79fe4933fac733a93f0eec3e27e74eb8883f06`; blob `461817346b9bfe24dc79d113e6c213e357406dc7`.

Container PID, retry apenas bootstrap, ON_ERROR_STOP1, migrations reais em fixture explícita auth/vault/cron/net. Verifica tokens distintos, reclaim e conflito do token antigo, cancel/timeout, ordem de três blocos, heartbeat, dead letters, optout, risco de conexão e atribuição linked/inferred com janela/contato.

Claims339–349 são sequenciais: não simulam corrida simultânea. F57.3 declara item pending, mas item1 foi reclaimado365 e permanece sending com lease90; recusa392 não isola pausa. O timeout claim422 ocorre após dispatch cancelled, também não isola só outcome_unknown. F59.4–5 mede gravação da supressão e lista imutável, não um envio real. Erros tolerados nos captures são em geral confrontados com valores/exceções específicos. positivos de outro item e token velho preservados.

## scripts/db-audit/talkx-campaign-worker-lease.test.sh

Faixa 1–330; SHA256 `26945f6a3f2a8579c884dda47ac58bf4636787ba3e76c59001f44dd21bec5c19`; blob `28d2c91d85445b0a12e7221a2f1f4e7506f47b65`.

Docker PID/cleanup, bootstrap até duas respostas estáveis, ON_ERROR_STOP1; expect_error exige nonzero+needle. ACL has_function_privilege, negativas42501, start idempotente, bloqueio worker direto, claim/renew/release, duas fixtures de fila (47/limite20 e subconjunto2), segredo só avaliado como não nulo.

Fixture mínima; leases sequenciais e expiração por UPDATE com escape GUC, sem concorrência real. Sorting313 reordena recipient_id na query externa, portanto não certifica a ordem original do set retornado; conjunto pequeno319 também reordena. Não leu segredo real.

## scripts/db-audit/talkx-lifecycle-events.test.sh

Faixa 1–195; SHA256 `5faa79d910550bc5aeaa7224647b48e935cfcd2f19e346f9e4febfcf99b315f5`; blob `88c1a10e71ddd3e274b0ecf460e04aafe936c30d`.

Docker PID e cleanup, retry bootstrap, ON_ERROR_STOP1. Fixture de perfis/campanhas/recipients/events; migration real. Transições reais+persistência de quatro eventos/ator/motivo, cancel5, no-complete cancelada, resumed_auto e complete com resumo.

Cabeçalho promete soltar leases, mas recipients são criados com leases NULL e não há assertion das colunas de lease. Conclusão usa UPDATE sent direto e contadores0, coerentes com resumo esperado; não prova contadores de envio reais.

## scripts/db-audit/talkx-overview-stats.test.sh

Faixa 1–423; SHA256 `6caf4c7aa6a36966353139e115b4e2b16b848b9f9cac55655ad65e4ad11ebb67`; blob `c8887e8e6db4f97d24a6bb993b9d22485c8dcc36`.

Docker PID/cleanup, fail-fast SQL. Registro CASES_SEEN exige todos13 casos após asserts. Fixture de políticas e roles, migration real+replay, eliminação de overload, has_function_privilege, números atuais/anteriores, dias/zero-fill/somas, dedup, filtros, canal, previous null e sessão agente/admin.

Escopo é schema/policies mínimos declarados, não cadeia completa. Fluxo muda dados só no container; maior parte numérica é como postgres, e o bloco RLS usa SET ROLE real. Não se executou nem confirmou resultado das13 medições nesta auditoria.

## scripts/db-audit/talkx-send-budget.test.sh

Faixa 1–253; SHA256 `ed3bf0fb60ec92b30d9161c42f4dd0c03372ba68adc237a4ee50af2782fce1fe`; blob `c96249c591a955feb158e823b42f2eabd5b3cce9`.

Docker PID/cleanup e retrybootstrap; ON_ERROR_STOP1. Cadeia explícita10migrations e schema mínimo. Assert objetos3, orçamento minuto/dia, soma Multiplix/TalkX por conexão, pace, clampfast e exceção específica de max_per_minute.

GUC role/sub sem SET ROLE nos casos: testa gates internos, não grants/RLS de um usuário autenticado. Orçamento lido sequencialmente, sem reserva concorrente; não substitui provas de envio. jqget definido181 não usado e sem ON_ERROR_STOP, sem consumidor ativo no script.

## scripts/db-audit/talkx-suppress-phone-axis.test.sh

Faixa 1–206; SHA256 `6b22e13ddeebb34e43d81a73caf5c551a25164923666aab80c11b18d614d04c8`; blob `a7223aa7d0fce61dc434c74fac2ccff6dc132236`.

Docker RANDOM+PID/cleanupvalidado, readiness por segundo marker, ON_ERROR_STOP1. Migrations phoneaxis+X029 reaplicadas, overload antigo eliminado, conflitos phone/contato retornam NULL, nova supressão UUID, has_function_privilege dos3roles.

Captures com ||true confrontam saída vazia/UUID; erros típicos não passam como sucesso vazio. Casos comportamentais usam postgres+GUC; ACL verificada separadamente. Não mede disputa simultânea nem serviço real.

## scripts/db-audit/talkx-transition-overload-postgrest.test.sh

Faixa 1–294; SHA256 `bfda297740566b20db21a02b727ec6ae685e08ad5f30c7c417977847fe6b7518`; blob `d0e345dc07d1bce4a9bd6e10922698e682f5eb1b`.

Docker PG+PostgREST+rede com nomes PID e cleanup restrito. SQL failfast, guard exige status+mensagem; reproduz2overloads, erro CHECK, aplica3migrations, NOTIFY schema, prepara JWT sintético HMAC e invoca testeDeno com falha propagada.

Se executado, faz pull de imagem/redeDocker e inicia serviços: não é script read-only. /tmp/talkx-transition-deno.log é caminho compartilhado, não isolado por PID; nota de robustez, sem corrida executada. ChamadaDeno/HTTP não ocorreu. Comentário de estado vigente é histórico do conjunto aplicado, não atestado de deployment.

## scripts/db-audit/talkx-v16-time-series.test.sh

Faixa 1–119; SHA256 `aa659a60f2f2b60c3de48f7fe6e065accb00302c4e3fdfacce0a0da49efdd399`; blob `3305ac8f65e62653051e5fc698a3ad96dc493527`.

Docker RANDOM/cleanupvalidado, readiness, fixture mínima; função antiga transcrita para RED3, migration real para GREEN5 e campo médio não nulo. Assert diferencia somas3/5 e mede resultado real se rodado.

psql helper9 usa ON_ERROR_STOP0; não prova aplicação integral sem erro, mesmo com ||fail na migration109. RED é cópia local da função antiga, não checkout histórico. Verifica presença de avg_reply_secs, não seu valor. Nenhuma execução.

## scripts/db-audit/talkx-v21-launch-flags.test.sh

Faixa 1–156; SHA256 `fd7df0f245f6a36ffe25525fec713b3fa5cb1e3f2d08f600d4cadf0e04637f69`; blob `305f5713485f5a1233dbb5709ddcb19399cb2e2a`.

Docker RANDOM/cleanupvalidado e readiness; fixture mínima, RED semcoluna, migration real, quatrocolunas/defaults, launched_by/at, erro específico adminonly e flags persistidas.

ON_ERROR_STOP0linha10 permite prosseguir em erros de arquivo. Fixture cria service_role/authenticated39–40, mas omite anon citado nos REVOKEs da migration114–115/369–370; assertions comportamentais não medem ACL. Captura save_out permissiva152 é seguida de checkreal true:true153–154, controle positivo preservado.

## scripts/db-audit/team-reaction-membership.test.sh

Faixa 1–336; SHA256 `1fe8efb02f1610e99db5d2f69893a2b7d1f20721c0e00350958f1e1c89a94457`; blob `b631998b263c5fcf87508427add1e3596436ade4`.

Docker PID e mktemp/cleanup, failfast ON_ERROR_STOP1, helpers de negativos com status+needle. SQL anterior transcrito com duas policies permissivas e NOTNULL; migration real aplicada entre A/B, reseed, ataques diretos/RPC, visibilidade vítima, bloqueios, controles legítimos e contagem/predicado final da policy.

Prova é sobre fixture de policies e migration escolhida; não inclui todas as RLS de tabelas vizinhas nem estado atual de plataforma. SQL de seed contém DELETE globais apenas no container recém-criado pelo script; não é cleanup de produto nem INF006. Não foi executado.

## Ampliação finita — entrypoints e metadados públicos

### Entrypoints sem extensão e metadados públicos

Lidos integralmente 5 arquivos/177 linhas; zero execução. Os hooks encaminham os gates já revisados; o HTML inicializa tema/watchdog/mount e os JSONs são metadados declarativos. PWA/SW desligado permanece decisão preservada. Não foram promovidos riscos hipotéticos de bootstrap, metadados antigos sem promessa de frescor ou limites genéricos.

- `.husky/pre-commit`,1–5: Invoca lint-ratchet --staged; status da única chamada Node é status do hook. Gate incremental por dívida nova, não lint integral. Nenhuma execução; consumidor do runner já revisado.
- `.husky/pre-push`,1–10: set-e propaga erro dos runners typecheck, lint e migration-drift em sequência. Não corrige falsa aceitação dentro de typecheck (INF008); comentário offline supõe ambiente sem DESTINO_URL, o hook não limpa a variável. Não foi invocado nem se inferiu consulta de banco nesta revisão.
- `index.html`,1–108: Entry HTML integral: idioma/viewport/fonts; bootstrap theme cachev6/v5 e clamp raio; tratamento de exceção; remoção de flag session; watchdog até primeiro filho root, erros window/unhandledrejection e fallback HTML; mount src/main.tsx. Sem DOM/render/rede. O fallback concatena mensagens em innerHTML, mas não foi estabelecido dado adversário alcançável durante bootstrap: observação, não novo XSS. Tema HC antecipado está dentro do cachev6; componentes de tema posteriores não foram confundidos com bootstrap. Prazo8s e override já explicitam limite cold-start, sem novo ID genérico.
- `public/manifest.json`,1–46: Manifest declarativo integral: start/scope/display standalone, idioma, ícones any/maskable, sem shortcuts/handlers. Não há link manifest neste index.html; PWA/SW desabilitado é decisão preservada. Não equivale a instalação ativa nem nova falha.
- `public/version.json`,1–8: Metadados estáticos integrais de versão, ambiente, endpoints públicos e data histórica. Não é atestado de deploy recente; sem segredo ou consulta de endpoint. Nenhum ID por metadado estático sem consumidor que prometa frescor.
