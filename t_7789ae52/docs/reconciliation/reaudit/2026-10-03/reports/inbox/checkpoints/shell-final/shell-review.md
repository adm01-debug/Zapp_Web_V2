# Revisão semântica alocada — Inbox

Status **COMPLETED_REVIEW_PASS**; 12/12 arquivos, 3553 linhas. Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`; roster SHA-256 `371218da0c9f504271da53f3a7003258658521c9c73a92d115f15bf4bde67516`.

Leitura semântica integral de assertions, fixtures, mocks, script e SQL embutido quando presentes; nenhum arquivo revisado foi importado/executado, e não houve suíte, shell de produto, banco ou serviço.

## docs/audits/onda3-260930/poc/team-chat-two-findings.test.sh

Índice zero-based 0; leitura 1–453; revisor inbox. Blob `68fc99a8be853984f65e0997f11a61835ace9ca0`; SHA-256 `7c4440be76f5fadb263f91964aab0045c83c201737573a82495d18ec8ec7bb46`.

PoC monta PostgreSQL descartável com roles/claims, tabelas, helpers, policies, triggers e RPC copiados inline. Se executado, verifica RPC cross-team produzindo dois recibos read, INSERT direto negado, caminho legítimo próprio, inclusão de terceiro por membro e duas negativas de inclusão por não membro. Contagens após falha e sucesso são observáveis, não apenas mensagens fixas.
A própria PoC documenta e testa a precondição do UUID: A não consegue descobrir a conversa B por SELECT. Os corpos inline alegam origem em catálogo de 30/09 mas o runner não compara hash com migrations/manifest; o sucesso prova a réplica criada, não que essas definições sejam as vencedoras atuais. Esquema é reduzido (p.ex. team_messages não tem RLS ativada no preestado).
Cleanup remove container de prefixo validado e diretório temporário em EXIT/INT/TERM; imagem configurável por env e credencial é fixture descartável. Não há acesso a produção no roteiro. Rótulos Beto/Carla e UUIDs na seed divergem dos comentários iniciais, mas variáveis finais e memberships usados nas assertions permanecem identificáveis.

**Limites:** Leitura integral de453linhas; nenhum Docker/SQL/shell executado. PoC histórica depende de réplica inline, de UUID alheio previamente conhecido e das permissões simplificadas. Não conta como nova execução/prova runtime nem novo finding; cruzar Team Chat/catálogo vencedor existente.

## scripts/db-audit/ai-read-policies-queue-scope.test.sh

Índice zero-based 1; leitura 1–309; revisor inbox. Blob `746d9e72e62770485024339465604119aa60d4c3`; SHA-256 `7d81862c8e29ae73585bc022be14fe52eec1fd406ef40edba637b911484855a9`.

Roteiro cria preestado estreito de SELECT e INSERT de análises mais amplo, demonstra agente da fila gravando sem conseguir ler, aplica migration real20260930140000, ressemeia e exige leituras de análise/etiqueta por fila, nega outra fila, preserva admin/próprio e gravação com leitura. Assertions verificam contagens específicas antes/depois, constituindo teste comportamental local se executado.
Helpers de visibilidade/roles são recriados inline, get_visible_agent_ids retorna só próprio perfil, não a cadeia integral de autorização; contatos/profiles não recebem suas RLS completas. Casos não exercitam membership inativo, anon ou usuário sem profile; cabeçalho sugere escrita por fila genérica, mas INSERT de ai tags permanece estreito e não é testado como sucesso. Docker/container e diretório temporário têm cleanup por trap.

**Limites:** Leitura integral309linhas sem execução. Migration real é aplicada sobre fixture reduzida, não todo catálogo nem banco vivo. Cobertura positiva/negativa de leitura por fila é concreta no roteiro; alcance das permissões globais permanece separado.

## scripts/db-audit/crm-sync-outbox-behavior.test.sh

Índice zero-based 2; leitura 1–318; revisor inbox. Blob `c78be19b5d0966a830b6caed11cdf778bf859c74`; SHA-256 `97e1e701614bf23edf13cc61a8bef77f473dcc5491b79ea8e0f08ac6ae90231d`.

Roteiro aplica cinco migrations reais a PostgreSQL17 com infraestrutura mínima, sem chamar CRM remoto. Exige dezesseis marcadores calculados por consultas: fencing de lease antiga, expiração/max attempts, backoff, erro terminal, telefone inválido, retenção/redação após delete, negação de health sem claims, constraints validadas, quarentena de legados, grants, merge/rollback de conflito, vínculo de identidade e actor profile, matriz de permissões e cleanup limitado. Exceções esperadas têm SQLSTATE específico, e rejeição ausente provoca exceção distinta.
Reclaim é sequencial com locked_at retrocedido, não duas sessões concorrentes. A maioria roda como postgres e seta claim service_role; helpers de visibilidade/admin retornam false. O teste de merge211–229 usa contact_notes reduzida sem guard_contact_note_identity e não aplica a migration que instala esse trigger: seu sucesso não refuta a incompatibilidade do merge com notas imutáveis reportada por Database. Retenção testa31/29dias e um lote, sem pressão/concor­rência.
Inicialização espera dois readiness markers e consulta viva; trap EXIT remove o container de nome gerado. SQL não recebe credenciais externas, senha é fixture. Os marcadores são exigidos com grep de linha inteira, mas ausência de ':fail' global não é checada separadamente; cada marcador esperado representa seu cenário com dados fixos.

**Limites:** Leitura integral318linhas sem Docker/SQL/teste. Evidência comportamental especificada para schema selecionado e não para todas migrations/triggers vigentes, transporte CRM real ou concorrência simultânea. Sem novo ID; extensão dos limites de evidência e cross-reference ao merge Database. Caso de merge relacionado a R2-DB-016.

## scripts/db-audit/multiplix-rls.test.sh

Índice zero-based 3; leitura 1–695; revisor inbox. Blob `ddeebeded076d066874cd0345ea58681df2a2d0b`; SHA-256 `27597f3afc987d7b2a2ea55c76485ceec2fa6bff3d950a3503edcedc8b781e68`.

Aplica a cadeia nomeada de migrations Multiplix, recriando somente infraestrutura/dependências (auth/roles/permissões/TalkX/Vault/cron/net). Net.http_post grava requests em tabela, cron.schedule grava configuração: não envia HTTP nem roda cron real. Há controles concretos de grants/FORCE/RLS, leitura própria versus alheia com contrapeso positivo, mutabilidade, escrita legítima de draft, RPC de criação com teto/rollback e retry idempotente sequencial.
Fila testa retry_after futuro e o mesmo item depois de vencido, marca dispatch iniciado, força lease expirada, exige outcome_unknown sem reclaim, cancel limpa pending/sending preservando outcome_unknown e fechamento parcial gera completed_with_failures. Scheduler chama função diretamente, verifica promoção/retomada, URL do Vault, wildcard NULL em ambos sentidos com controle positivo após retirar bloqueio, cota500 esgotada versus disponível e janela fechada. São assertions de efeitos no fixture, não apenas catálogos.
Bloco657–693 reaplica guard antigo, demonstra update sem claim alterando linha, aplica guard novo, exige código específico e linha intacta; controla postgres/service e staff com claim. Casos de fila/cron usam sessões sequenciais e atualização manual de relógio/estado, sem concorrência real. Pequenas assertions são mais fracas: agent_insert_blocks só exige saída diferente de1, de modo que outro erro também satisfaz; fila/eventos só são conferidos se ambas tabelas existirem. Seleção opcional de migration de revoke usa primeiro glob, não catálogo vencedor completo.
Cleanup EXIT remove container; inicialização tenta três vezes com duas consultas espaçadas. Publicação é checada no catálogo, sem cliente Realtime. A cadeia selecionada termina nas migrations nomeadas mais opcionais e não equivale a todas as migrations atuais ou autenticação externa.

**Limites:** Leitura integral695linhas; lacuna de saída truncada535–579 foi relida. Nenhum script/Docker/SQL executado. Controles comportamentais locais reais preservados; sem prova de concorrência simultânea, HTTP/Vault/cron reais, PostgREST ou toda composição produtiva. Não gera novo ID por limite genérico.

## scripts/db-audit/scope-public-policies-authenticated.test.sh

Índice zero-based 4; leitura 1–132; revisor inbox. Blob `f0294a2358480232f00ae7949d4a915da2d4d8c7`; SHA-256 `cf00f1e82853b6980a7fd816e583f1363c25f8aaf0d7fc859722a8895451684b`.

Cria cinco tabelas e14 policies antigas inline, aplica a migration real20260930142000 e exige contagens14 public→0 public/14 authenticated. Depois testa INSERT e SELECT do favorito próprio sob claims de Alice. Catálogo e caminho positivo são assertions concretas para a fixture.
As duas negativas anon→0 (antes/depois) consultam favorite_contacts ainda vazia: a primeira linha só é inserida depois de ambas. Portanto não distinguem RLS correta de leitura irrestrita sobre tabela vazia. Não há SELECT de outro usuário, nem comportamento de snoozes/pins/login attempts/templates; helper admin sempre false. Cleanup remove diretório temporário e container por trap.

**Limites:** Leitura integral132linhas sem execução. Alteração de papéis das14policies é verificada; alegação de preservação funcional de todas excede o caso único positivo e negativas vazias. Limite específico GOV003, sem novo finding de produto.

## scripts/db-audit/talkx-blacklist-policy-forward-only.test.sh

Índice zero-based 5; leitura 1–238; revisor inbox. Blob `94caa8ff95e19104deb27fbacf1d0a5ad01d8a2d`; SHA-256 `6770cb635cc73ac37da5e97a76ad2aec9a4acc605d07399e7d0bf5bb780f6fbe`.

Preserva policy permissiva no preestado e aplica migration histórica de auditoria, verifica catálogo/runtime SQL, aplica forward migration duas vezes e exige predicado admin/supervisor em USING/CHECK. UPDATE de agente deve manter marker original e admin deve alterar, oferecendo controle comportamental com linha real. Helper admin identifica pelo id de profiles igual à claim, simplificação do modelo auth/profile.
V05 aplica índice/check duas vezes, aceita auto_optout, rejeita origem inválida/telefone ativo duplicado e permite re-supressão após soft-delete. V07 demonstra conflito com UNIQUE total anterior, aplica duas vezes, confere índice parcial exato, existência de RPC e negação de EXECUTE authenticated, e testa2linhas/1ativa com inserts diretos.
O cenário final de webhook executa duas cópias de INSERT ON CONFLICT parcial, não a RPC talkx_suppress_contact nem webhook. Assim não prova corpo/argumentos/grants positivos service_role da RPC, apesar do comentário 'só service_role executa'; somente authenticated é consultado. Testes de rejeição por origem/duplicata aceitam qualquer erro, mas os contrapesos positivos reduzem falso positivo de infraestrutura geral. Runtime SHA é validado pelo formato, não comparado a pin esperado no shell. Cleanup valida nome e remove container em trap.

**Limites:** Leitura integral238linhas sem executar Docker/SQL/node. Schema mínimo sem restante de constraints/triggers/FKs; helpers simulados. Prova especificada dos índices/policy não equivale ao fluxo completo de supressão nem catálogo vivo. SQL de runtime referenciado é suporte separado, não implicitamente lido pelo roster. Suporte runtime SQL lido integralmente em shell-support-reviewed.json (41 linhas); limita-se à policy nomeada e a substrings do predicado.

## scripts/db-audit/talkx-draft-recipients.test.sh

Índice zero-based 6; leitura 1–181; revisor database. Blob `02815987e189d04e8bcd8e69fd449441f5a3f8a7`; SHA-256 `959474881fda556cfa50c1fa9c9f186f2745f2400f6f61febbb47042b5802671`.

Leitura integral181linhas (saída continha1–181; leitor tentou linha182 após EOF e foi corrigido no uso, sem executar fonte). DockerPG17 com retry e cleanup. Schema/helpers mínimos incluindo visible boolean, aplica migrations reais state-transition,role-gates,audience-snapshot. Confere replacement/contador, bloqueio sending, agente sem papel, invisível/deleted/LID/phoneinválido. Não monta RLS completo/hierarquia, paginação do editor ou arrays grandes. Asserts falhas por mensagem, chamadas sequenciais. Nenhum shell/SQL executado.

**Limites:** Nothing executed. Fixture/migration coverage does not establish production deployment or complete application behavior.

## scripts/db-audit/talkx-history-saved-by-fk.test.sh

Índice zero-based 7; leitura 1–116; revisor database. Blob `ea543bbc03d95f10ca9ff755d129a67cffdfdb6b`; SHA-256 `876a29243435fc1d2139f0f307b2f881d6dc9742bce1ec034b8e485b9459eba8`.

Leitura integral116linhas. DockerPG17 e cleanup restrito, fixture isolada profiles/templates/history; escolhe NO_ACTION,SET_NULL ouORPHAN, aplica migration real. Caminhos bons repetem migration e fazem DELETEperfil conferindo history preservada/saved_bynull/FKvalidada; órfão exige falha específica e ausência de constraint parcial. Forte contrato de mudança FK nesse schema; não aplica guards de imutabilidade posteriores do histórico nem prova remoção de usuário inteira. Nada executado.

**Limites:** Nothing executed. Fixture/migration coverage does not establish production deployment or complete application behavior.

## scripts/db-audit/talkx-optout.test.sh

Índice zero-based 8; leitura 1–384; revisor database. Blob `062c52d4fc0481675b446a9ac296fe6bf5ee2bb0`; SHA-256 `0fecb95268625998a72071f3443b843c037e49ca594151cc2ec3560c9861c21a`.

Leitura integral384linhas. PG17mínimo com auth/helpers e blacklist índices/policy, migrations reais6args→X0297args. Confere keywords/admin-supervisor-vs-agent, exact/contains/normalização, expired replacement+idempotência, herança campanha/override, assinatura/ACL, seedcustom preservado e view security_invoker sob papéis. Chamada supressão define claimservice mas executa postgres287, ACL positivo é catálogo, não SETROLEservice. Sem webhook/message-history scope/conexão ou envio autoreply; não prova integração de falhas/motor. Nada executado.

**Limites:** Nothing executed. Fixture/migration coverage does not establish production deployment or complete application behavior.

## scripts/db-audit/talkx-update-limits-send-window.test.sh

Índice zero-based 9; leitura 1–223; revisor database. Blob `1300f64d0e4c4327012a2e64473d54c07b56a08d`; SHA-256 `f37ad0d49b06ab747b7b85b0f68c97f840e3294a31865af3f2470259f76bd6d1`.

Leitura integral223linhas. DockerPG17, CHECKjanela reconstruído fiel ao trecho, V09+V09b reais/replay+trigger; casos assimetria/inversão, janela válida/revision, ambosnull e ACL. Claims/papel authenticated usados nas mutations. Mensagem22023 aparece na intenção, mas assert só procura invalid_talkx_limits_values e ausência23514 sem VERBOSITYverbose, não valida SQLSTATE positivo. Gatepapéis posteriores/scheduler/fuso fora do recorte; nada executado.

**Limites:** Nothing executed. Fixture/migration coverage does not establish production deployment or complete application behavior.

## scripts/db-audit/talkx-v23-draft-step.test.sh

Índice zero-based 10; leitura 1–152; revisor database. Blob `67509747cafab179ef1480b41e5fe87fd18b21c5`; SHA-256 `dc9e34f4ab7848eec17fde57afd818eaf208c640e085e8e5c4e83119d8767322`.

Leitura integral das 152 linhas. Harness Docker PostgreSQL 17 com cleanup restrito; wrapper psql usa ON_ERROR_STOP=0 (linha 10), de modo que setup/aplicação não são fail-fast para todo erro SQL. Fixture mínima e helpers reconstruídos: is_admin_or_supervisor sempre true (90–91), validação de timezone por regex (92–93), save_draft anterior copiado (96–115); aplica a migration V23 real (125). Há controle vermelho de coluna inexistente, persistência de draft_step/filtros, atualização e mensagens específicas para limites inválidos da RPC e CHECK. Chamadas com claims executam como postgres sem SET ROLE authenticated (129/139/145), portanto não provam grants/RLS nem gates atuais; tampouco cadeia integral. Asserts positivos de persistência são úteis no recorte. Nenhum shell, SQL ou Docker executado; limite de cobertura, sem novo achado de produto.

**Limites:** Nothing executed. Fixture/migration coverage does not establish production deployment or complete application behavior.

## scripts/db-audit/team-receipts-membership.test.sh

Índice zero-based 11; leitura 1–352; revisor database. Blob `a2ea5899cba525188a33608691b095bb8bbcbc35`; SHA-256 `972cba9b0f8cb9228910b78006fcbd85e7a63f7c5e505fc0d653efb55f927fa2`.

Leitura integral das 352 linhas. Harness Docker PostgreSQL 17 isolado, psql ON_ERROR_STOP=1, helpers com SET ROLE authenticated e claims, asserts de resultado/erro e cleanup. Replica RPC anterior, triggers e esquema mínimo; semeia duas conversas e três perfis, demonstra no texto o caminho vulnerável anterior, aplica migration real membership_guard e verifica not_member, ausência de recibos fora do time, recibo legítimo, last_read_at, falta de claims e exclusão de recibo próprio. Esses controles sustentam o contrato da RPC no fixture. Limite concreto: policy INSERT copiada nas linhas 232–241 exige membership, mas a policy vencedora posterior em 20260928430000 exige apenas profile_id próprio; a migration aplicada só corrige RPC. Assim o controle negativo de INSERT direto (321–323) prova a policy sintética mais estrita e não refuta R2-DB-011/TC-009 na cadeia final. Não aplica a cadeia completa nem comprova produção. Nenhum shell, SQL ou Docker executado; sem novo ID.

**Limites:** Nothing executed. Fixture/migration coverage does not establish production deployment or complete application behavior.
