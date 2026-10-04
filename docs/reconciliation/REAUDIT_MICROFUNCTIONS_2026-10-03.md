# Reauditoria da auditoria e das microfuncionalidades

**Estado: EM ANDAMENTO — checkpoint intermediário.**

Checkpoint gerado em `2026-10-04T02:44:31+00:00`. Código fixado em [`da307ba5626dce892f0b37cb6762463f55d14a96`](https://github.com/adm01-debug/Zapp_Web_V2/commit/da307ba5626dce892f0b37cb6762463f55d14a96); auditoria anterior no baseline `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`. Publicação documental no [draft PR #1869](https://github.com/adm01-debug/Zapp_Web_V2/pull/1869).

Esta camada reabre a avaliação dos contratos e da própria evidência anterior, conforme a solicitação de revisão exaustiva. O inventário histórico e seus 104 achados permanecem preservados. Os registros R2 incluem comportamentos confirmados no código, refinamentos e lacunas; não devem ser somados como uma quantidade de bugs independentes, incidentes em produção ou regressões recentes.

## Cobertura demonstrada neste checkpoint

| Dimensão | Resultado | O que comprova |
| --- | ---: | --- |
| Arquivos versionados conferidos | 4068 | HEAD, tamanho e hash Git de cada arquivo; zero divergência da cópia examinada. |
| Arquivos JS/TS analisados estruturalmente | 2.397 | Parsing e catálogo de corpos; zero erro sintático nesses arquivos. Não é revisão semântica de SQL. |
| Corpos JS/TS catalogados | 36853 | Inclui callbacks aninhados e testes, não capacidades de negócio únicas. |
| Corpos JS/TS fora da classificação teste/fixture | 16654 | Denominador com scripts e código de terceiros; classificação auditável. |
| Corpos não teste contidos em faixas revisadas | 12062 | Corpo coberto por leitura declarada; não comprova todos os ramos ou cenários executados. |
| Corpos não teste parcialmente cobertos | 44 | Leitura ainda insuficiente para declarar corpo integral. |
| Corpos não teste sem faixa atual localizada | 4548 | Saldo explícito para orientar a continuação. |
| Arquivos com revisão integral declarada | 1139 | Soma única entre áreas, sem duplicar revisões cruzadas. |
| Corpos candidatos de funções SQL efetivas revisados | 311 | Ordem das definições versionadas e leitura manual; não é introspecção do banco implantado. |
| Referências de código validadas | 1329 | Caminho, faixa e blob correspondem ao pin. |
| Aceite em produção | Não realizado | Nenhum envio, chamada real, migration, deploy, instalação ou correção do produto. |

O saldo de leitura de corpos não teste está distribuído por **540 arquivos**, listados em [reaudit/2026-10-03/consolidated/remaining-production-review.json](reaudit/2026-10-03/consolidated/remaining-production-review.json). O trabalho continua a partir dessa matriz; o fechamento de um diretório não significa encerramento do repositório.

### Correção do denominador, sem promoção artificial de cobertura

58 arquivos `.unit.*`/`.integration.*`, todos com imports de teste/assert, foram corretamente classificados como testes. São 668 corpos transferidos entre categorias; o total estrutural de 36.853 não mudou. A mudança não declarou nenhum corpo adicional como lido. A decisão e os estados anterior/posterior estão em [test-classification-adjudication.json](reaudit/2026-10-03/global/test-classification-adjudication.json).

## Registros por área

| Área | Registros | P1 | P2 | P3 |
| --- | ---: | ---: | ---: | ---: |
| [auth](reaudit/2026-10-03/reports/auth/report.md) | 41 | 11 | 30 | 0 |
| [calls](reaudit/2026-10-03/reports/calls/report.md) | 5 | 1 | 4 | 0 |
| [communication](reaudit/2026-10-03/reports/communication/report.md) | 11 | 2 | 8 | 1 |
| [database](reaudit/2026-10-03/reports/database/report.md) | 16 | 5 | 11 | 0 |
| [inbox](reaudit/2026-10-03/reports/inbox/report.md) | 53 | 13 | 39 | 1 |
| [infra](reaudit/2026-10-03/reports/infra/report.md) | 25 | 8 | 17 | 0 |
| [modules](reaudit/2026-10-03/reports/modules/report.md) | 64 | 6 | 52 | 6 |
| [platform](reaudit/2026-10-03/reports/platform/report.md) | 9 | 0 | 9 | 0 |
| [providers](reaudit/2026-10-03/reports/providers/report.md) | 46 | 8 | 36 | 2 |
| [root](reaudit/2026-10-03/reports/root/report.md) | 12 | 4 | 8 | 0 |

**Total da camada R2 neste snapshot: 282 registros.** CONFIRMED_SOURCE_BEHAVIOR: 275; REFINEMENT_OF_PRIOR_FINDING: 1; GAP_OR_UNRESOLVED_CONTRACT: 5; HYPOTHESIS_REQUIRES_VALIDATION: 1.

As prioridades são classificações de revisão, condicionadas ao consumidor e às precondições descritas. Um risco de autorização demonstrado estaticamente não prova que alguém o explorou. Uma resposta 200 em um probe simulado não certifica acesso ao provedor real. Defeitos que compartilham causa devem ser agrupados antes de virar trabalho de implementação.

## Mecanismos de maior impacto a confrontar

### R2-AUTH-001 — WebAuthn aceita verificação sem assinatura, authenticatorData ou validação de origem

**Condição:** Uma credencial cadastrada e um challenge conhecido para a conta; authentication-options devolve o challenge e IDs de credencial quando encontra o email.

**Comportamento e efeito:** verify-authentication só compara clientData.type e challenge. Não verifica signature, authenticatorData, RP ID hash, origin, flags UP/UV nem contador assinado. O challenge não é filtrado por expires_at. A prova offline retornou200/success com origem errada, nenhum dado de assinatura e challenge vencido. A inscrição também grava attestationObject como public_key sem extrair/verificar a chave. A resposta inclui userId/email e consome challenge; não emite uma sessão Auth. 

**Limites:** O probe executa o handler real transpilado com DB/CORS/entrada de schema sintéticos. Não é exploração de banco vivo. Não classificado como tomada de sessão: o endpoint não retorna tokens, e o handoff quebrado está em R2-AUTH-002.

Registro completo: [auth](reaudit/2026-10-03/reports/auth/report.md). 

### R2-AUTH-003 — MFA no login está fora da cadeia de autorização das rotas

**Condição:** Conta com fator TOTP verificado e sessão aal1 antes do desafio adicional.

**Comportamento e efeito:** Não existe decisão AAL em ProtectedRoute, AppRoutes ou no redirecionamento do login. TwoFactorAuth só inicia verificação se o usuário visitar a rota. O inventário SQL do agente de banco não encontrou cláusula AAL nas779 migrations ativas. Assim a UI e a cadeia analisada não exigem segundo fator para acessar o app, apesar de existir enrollment e tela funcional de desafio. A própria rota fica indefinidamente em Verificando para usuário sem sessão/sem fator ou erro de assurance. 

**Limites:** Ausência de AAL em SQL baseada na cadeia da fonte, corroborada pelo agente SQL; não houve consulta ao dashboard Auth implantado. 1.20 SSO tem implementação de callback; o problema é o gate posterior de MFA, não a inexistência de SSO.

Registro completo: [auth](reaudit/2026-10-03/reports/auth/report.md). 

### R2-COM-009 — Retorno OAuth do Gmail prossegue apesar de state ausente ou inválido

**Condição:** Browser autenticado no Zapp recebe retorno com código de autorização, mas sem state válido vinculado à tentativa. Para vínculo real indevido seria necessário código Google válido, ainda não consumido e emitido para o cliente/redirect configurados; os probes usam somente código sintético.

**Comportamento e efeito:** O parser retorna null quando o nonce não confere, mas o hook usa null apenas como fallback de navegação e continua a troca de code. Se não há nonce armazenado, o parser também não exige um. O handler autenticado recebe code sem state e não verifica uma tentativa vinculada. A proteção CSRF criada pelo projeto não bloqueia o caminho que deveria proteger. Um retorno não vinculado pode iniciar conexão da conta Gmail representada pelo código ao usuário autenticado. A guarda de email já vinculado a outro usuário continua existente; não se afirma roubo de Gmail alheio ou aceitação de código inválido pelo Google.

**Limites:** Parser e hook reais com fronteiras Auth/Edge simuladas. Google não foi chamado. Requisito fundamentado em RFC 6749 §10.12 e documentação oficial Google OAuth web-server, etapa 4.

Registro completo: [communication](reaudit/2026-10-03/reports/communication/report.md). 

### R2-DB-001 — Nova sobrecarga de registro de chamadas permite escrita privilegiada por PUBLIC

**Condição:** Versão de sete argumentos aplicada com a ACL registrada no snapshot local. Um chamador anon ou authenticated consegue alcançar a API RPC do schema public. O chamador conhece um contact_id válido e a whatsapp_connection_id correspondente; esta auditoria não demonstrou obtenção desses UUIDs por anon.

**Comportamento e efeito:** A variante de sete argumentos de record_incoming_call_event é SECURITY DEFINER, não verifica o ator e nasceu sem revogar EXECUTE de PUBLIC. O snapshot de ACL registra esse grant, ao contrário da variante antiga de seis argumentos. Criação ou alteração de registros de chamada e notificações sem a autorização esperada de webhook/service_role. Trata-se de fronteira de escrita, não apenas divulgação de catálogo.

**Limites:** Não houve chamada RPC, exploração, consulta de dados nem confirmação do deploy atual. O snapshot de ACL é datado de 2026-10-03; mudanças posteriores não são conhecidas. A função de trigger multiplix_audiences_validate_shared_roles também aparece no baseline anon, mas não foi tratada como RPC diretamente invocável.

Registro completo: [database](reaudit/2026-10-03/reports/database/report.md). 

### R2-DB-009 — Conquista de mensagens bloqueia o envio do agente ao atingir um marco

**Condição:** Usuário authenticated, ativo, com permissão de envio e contato/conexão acessíveis, mas sem papel admin/supervisor. Antes da nova mensagem, messages_sent+messages_received do perfil é 9, 49, 99, 499 ou 999. A chamada é o enqueue do browser com seu JWT, e não um envio já executado com service_role.

**Comportamento e efeito:** O enqueue autenticado insere uma mensagem e aciona o trigger de gamificação. Nos totais 10/50/100/500/1000, o trigger chama grant_agent_achievement com message_milestone, mas a definição vigente exige JWT privilegiado ou admin/supervisor para esse tipo. O erro desfaz o enqueue inteiro. Uma função de gamificação impede uma operação essencial de atendimento para agentes comuns em marcos previsíveis. Como o incremento também é revertido, repetir o envio não ultrapassa o marco por si só.

**Limites:** Sem execução SQL, envio de mensagem ou consulta de agent_stats em produção. Não foi medido quantos perfis estão imediatamente antes de um marco. A dedução usa a implementação primária de auth.role e a atomicidade de triggers do PostgreSQL; não usa current_user como substituto do JWT.

Registro completo: [database](reaudit/2026-10-03/reports/database/report.md). 

### R2-INB-006 — Falha após enqueue remove o anexo persistido e retry cria outra ação

**Condição:** Upload bem-sucedido; enqueue confirmado; entrega rejeita ou sua resposta é perdida. Usuário reenvia o mesmo arquivo.

**Comportamento e efeito:** useFileUploadLogic faz rollback de storage para qualquer rejeição de sendOutboundMessage. Esse serviço primeiro persiste a mensagem e depois dispara entrega, que pode rejeitar com a linha já criada. Nova tentativa faz novo upload/URL, mudando actionKey/clientMessageId. Mensagem/worker pode apontar para objeto removido. Uma tentativa posterior cria outro ID de ação, podendo duplicar entrega sob resultado anterior incerto.

**Limites:** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

Registro completo: [inbox](reaudit/2026-10-03/reports/inbox/report.md). 

### R2-CALL-001 — Evento tardio da sessão SIP anterior altera a chamada seguinte

**Condição:** SIP disponível e registrado. A chamada A chega ao watchdog local sem Terminated do adapter; após idle, começa B. Só então o adapter entrega um evento Established ou Terminated de A. Não se afirma que este timing já ocorreu no provedor real.

**Comportamento e efeito:** Cada sessão mantém listener, mas handleStateChange não valida a identidade da sessão recebida. O watchdog limpa referências/estado locais sem cancelar a sessão no adapter. Evento Terminated antigo consome callIdPromise da sessão nova; Established antigo marca o ID novo como atendido e anexa o áudio da sessão velha. Uma chamada atual pode receber encerramento, atendimento ou mídia de outra sessão e ter seu registro alterado indevidamente. Os probes do motor real produziram finalização e atendimento de B a partir de eventos de A.

**Limites:** Adapter, sink, relógio e timers simulados; execução da classe inteira fixada por blob. Ausência de fence e efeito são confirmados; a incidência e as garantias de timing do SIP publicado não foram medidas.

Registro completo: [calls](reaudit/2026-10-03/reports/calls/report.md). 

### R2-MOD-025 — Reabrir rascunho TalkX grande pode reduzir audiência pelo autosave da primeira página

**Condição:** Reabrir draft ou scheduled com audience_source=contacts e mais recipients que o cap de retorno da consulta, mantendo válidos os demais campos exigidos pela RPC.

**Comportamento e efeito:** Mesmo sem editar o público, a hidratação da primeira página torna autosaveFields diferente; após 3 s o save grava contact_ids parciais. A RPC vigente preserva audience_filters; o snapshot passa esses IDs ao motor e faz DELETE/INSERT de toda a audiência. Somente reabrir um rascunho grande pode reduzir sua audiência e total_recipients. A operação transacional garante consistência do conjunto errado, sem recuperar os IDs omitidos pelo cliente.

**Limites:** Fonte revisada estaticamente; nenhum navegador, banco ou provedor de produção foi executado. O ramo audience_source=segment define v_contact_ids=NULL e não sofre esta truncação por hidratação manual. SQL foi rastreado estaticamente no conjunto de migrations vencedor confirmado pelo agente de banco, sem executar migração nem consultar banco. Não se presume um valor específico para o cap de linhas remoto.

Registro completo: [modules](reaudit/2026-10-03/reports/modules/report.md). 

### R2-API-027 — Transcrição aceita mensagem visível sem mídia e baixa objeto escolhido pelo cliente com service role

**Condição:** Usuário autenticado tem acesso a uma mensagem com media_url nula/vazia e conhece o caminho de um áudio de terceiro em bucket aprovado do projeto. O impacto de confidencialidade pressupõe que esse objeto não seja legível pelo chamador e seja legível pela service role. ElevenLabs configurado e cotas disponíveis.

**Comportamento e efeito:** assertMessageVisibleToCaller verifica apenas que a mensagem existe sob RLS e retorna ok com mediaUrl=null. O handler começa com requestedAudioUrl e só a substitui se mediaUrl for truthy. downloadAudio valida origem/bucket e depois usa service role para baixar o path. Não há vínculo entre esse objeto e a mensagem aprovada. P16 reproduziu o download do path de outro contato; P17 mostrou que a substituição funciona quando media_url está preenchida. O ID de uma mensagem de texto própria pode funcionar como autorização substituta para transcrever áudio privado de outro contato. O endpoint devolve transcription/words/speakers do objeto escolhido, sem exigir visibilidade de sua mensagem proprietária.

**Limites:** IA-AUDIO-001 anterior trata classificação só por nome/URL; este é bypass distinto no transcritor. Os probes compõem blocos exatos do handler com helpers reais, sem executar Zod nem STT integral; não houve acesso a áudio real de terceiro.

Registro completo: [providers](reaudit/2026-10-03/reports/providers/report.md). 

### R2-INF-001 — O dry_run de Edge Functions pode reescrever secrets do projeto

**Condição:** Dispatch passa pelas validações anteriores e possui credenciais válidas. Ao menos um secret aplicável está disponível e REESCREVER=true.

**Comportamento e efeito:** O input promete ensaio sem publicação, mas o passo Configurar secrets nas edges não depende de dry_run. A decisão reescrever fica true com rotação explícita, nomes ausentes ou falha na listagem remota. O primeiro bloqueio por dry_run só aparece no deploy, depois de secrets set. Um ensaio autorizado como leitura pode alterar configuração usada por funções já publicadas, mesmo sem novo deploy.

**Limites:** Não houve execução de workflow, deploy, PostgreSQL, E2E real ou consulta de configuração de produção nesta reauditoria.

Registro completo: [infra](reaudit/2026-10-03/reports/infra/report.md). 

### R2-INF-004 — Os 12 contratos de runtime são Bash enviados como SQL; 767 versões não têm arquivo

**Condição:** O fluxo alcança Provar estado runtime antes do push. Alvo corresponde a um dos 12 arquivos extraídos ou a uma versão sem contrato dedicado.

**Comportamento e efeito:** A extração preservou o corpo inteiro do case, inclusive RUNTIME=$(node ...), delimitadores shell e, no último arquivo, o ramo genérico. run-runtime-contract.mjs lê esse texto e o passa a psql-safe -c como se fosse SQL. Todos os 12 arquivos começam por RUNTIME=$(. Para as outras 767 versões de migration há ausência de arquivo, recusada antes de qualquer fallback. Isso descreve os contratos versionados e o comportamento do runner quando alcançado; não afirma que todas as 779 versões satisfazem o preflight de seleção. A rota não produz a prova JSON de runtime: nos 12 contratos, o texto é de linguagem incompatível com psql; nos demais, o runner encerra com código 2. O compare de hash e as verificações posteriores não tornam o fluxo executável.

**Limites:** Não houve execução de workflow, deploy, PostgreSQL, E2E real ou consulta de configuração de produção nesta reauditoria. 779 arquivos/779 versões distintas; 12 nomes de contrato; 767 versões sem arquivo. A existência de arquivo não implica elegibilidade de apply. A incompatibilidade foi demonstrada pela fonte e pelo leitor do contrato; PostgreSQL não foi iniciado.

Registro completo: [infra](reaudit/2026-10-03/reports/infra/report.md). 

### R2-COM-001 — Conversa de Email entra em ciclo de atualização ao repassar contexto ao painel

**Condição:** Conta ativa e uma thread selecionada no EmailChatInbox, inclusive quando embutido no Omnichannel.

**Comportamento e efeito:** O pai passa uma arrow inline que grava sempre um objeto novo. O efeito do filho depende dessa função e a chama. A identidade muda em cada render do pai, fechando o ciclo mesmo quando mensagens e anexos estão estáveis. A key é constante dentro da mesma thread e não corta o ciclo. A atualização repetitiva pode impedir o uso normal da conversa e consumir processamento. A prova limitada executou seis ciclos dos callbacks exatos; não mede travamento de navegador nem confirma incidente em produção.

**Limites:** Confirmado por revisão cruzada de auth_users. O probe modela Object.is das dependências; não é um teste de integração React montado.

Registro completo: [communication](reaudit/2026-10-03/reports/communication/report.md). 

## Falhas na evidência e adjudicações da auditoria anterior

O índice anterior já incluía os 352 documentos Markdown do pin atual. A lacuna não era ausência física desses arquivos: dois prompts com tarefas explícitas estavam classificados apenas como documentos de apoio e careciam de correspondência de requisitos. Foram mapeados seis cabeçalhos CRM360 e quatro de Inteligência. Eles não viraram dez novas tarefas de implementação; os sucessores atuais, componentes substituídos e decisões de produto continuam sendo a autoridade para cada caso.

O catálogo histórico apresenta 349 linhas com marcação de conclusão. A reconciliação literal encontrou 185 linhas com caminho existente, 72 com caminho ausente/renomeado (69 caminhos únicos) e 92 referências que não são arquivos. Caminho existente e checkmark não certificam um fluxo, assim como arquivo renomeado não demonstra funcionalidade removida.

Alguns candidatos foram rejeitados ou reclassificados ao encontrar consumidores, guardas e decisões anteriores. Exemplos: a lista de threads Gmail já tem paginação; o problema adicional é o histórico interno. O componente de modo Zen recebe a ação compartilhada do shell. A regra de cinco minutos de SLA e o marco created_at têm decisões versionadas que precisam ser adjudicadas antes de qualquer alteração. Os relatórios de área conservam essas ressalvas.

Rastreabilidade: [relatório transversal](reaudit/2026-10-03/reports/root/report.md), [adjudicação dos prompts](reaudit/2026-10-03/reports/root/omitted-source-adjudication.json), [índice normalizado de registros](reaudit/2026-10-03/consolidated/findings-index.json).

## Evidência e reprodução

Os probes executam módulos ou callbacks exatos sob fronteiras declaradas: bancos, relógios, rede, React e elementos podem ser sintéticos. Os programas verificam o pin e os blobs antes de avaliar o código. Casos positivos, contraexemplos, replays de revisão e verificações de integridade não devem ser contados como se fossem a mesma coisa. A contagem única entre todos os conjuntos de probes será consolidada ao fechar esta passagem.

Comece pelo [guia de reprodução](reaudit/2026-10-03/README.md) e pelo [CHECKPOINT.json](reaudit/2026-10-03/CHECKPOINT.json). Grandes matrizes estão compactadas sem perda; os hashes dos bytes originais e compactados permitem conferir ou materializar a cópia.

## Continuação autorizada

A próxima passagem conclui os corpos restantes de interface, utilitários e integrações, além da composição de políticas SQL. Depois vêm a adjudicação de relações com o ledger anterior, a deduplicação dos mecanismos, o índice único de provas e a validação final da publicação. O status deste checkpoint é em andamento e nenhuma capacidade é certificada em produção por esta publicação.

Cartographer, Claude-Mem e Headroom continuam no plano de avaliação AT, com POCs/instalação não executadas. Grill Me foi incorporado documentalmente à revisão dos planos; integração executável e validação continuam pendentes. Esses estados não foram convertidos em instalação por causa da presente reauditoria.

