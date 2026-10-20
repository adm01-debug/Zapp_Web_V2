# Revisão semântica alocada — Inbox

Status **COMPLETED_REVIEW_PASS**; 11/11 arquivos, 1278 linhas. Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`; roster SHA-256 `ab29fb2773c7ce8bf521092c22ad33d83a102885a204ba5bf2cc7fe660690b16`.

Leitura semântica integral de assertions, fixtures, mocks, script e SQL embutido quando presentes; nenhum arquivo revisado foi importado/executado, e não houve suíte, shell de produto, banco ou serviço.

## scripts/db-audit/pg-cron-concorrencia.test.mjs

Índice zero-based 16; leitura 1–65; revisor inbox. Blob `c2d80666a706fd9e5d5c06d7b576e335ab0b8f84`; SHA-256 `7c1170fd22fa67acc69363ce45453788aa135aa4933b8eac59cc9c1b4fc02321`.

O teste lança o medidor Python real sobre três jobs sintéticos e confere slots/concorrência/horário pior; controles negativos exigem saída1 para arquivo vazio e rejeição de /etc/hostname e prefixo /tmpfoo.
O wrapper captura status/stdout/stderr, e arquivos temporários de fixture não são removidos neste arquivo. Não há consulta de cron vivo nem medição de execução simultânea: o contrato é o cálculo sobre linhas de agendamento.

**Limites:** Somente leitura. Não executado Python/subprocesso; cobertura restrita a horários literais usados e validação lexical das raízes, sem demonstrar todos os formatos cron, timezone ou symlinks.

## scripts/db-audit/psql-environment.test.mjs

Índice zero-based 17; leitura 1–150; revisor inbox. Blob `718010b9c0d1a89f04d98c4c74d91e65454ad28b`; SHA-256 `5dfc225c5bda69b11969a29d7121c52e1e8ab2204b02bbe6dbac86b92d35aa57`.

Exercita withPsqlEnvironment real com callback síncrono: separa URI em variáveis libpq, preserva opções TLS/timeout, elimina variáveis conflitantes, confere escape/permissões0600/0700 e remove passfile após sucesso ou erro. Inputs são credenciais sintéticas de fixture.
Cobre IPv6 e nomes escapados, rejeita overrides/opções duplicadas/desconhecidas e entradas inválidas com diagnóstico sanitizado. Retry opt-in conta tentativas de falhas de transporte simuladas, não repete falhas determinísticas listadas e conserva cleanup após esgotamento.

**Limites:** Somente leitura, sem criar passfiles ou chamar PostgreSQL. TLS é preservação de parâmetros, não handshake; retries são callbacks que lançam erros sintéticos, sem atestar segurança de repetir escrita de resultado ambíguo ou comportamento de todo libpq.

## scripts/db-audit/psql-safe.test.mjs

Índice zero-based 18; leitura 1–121; revisor inbox. Blob `f0e2fb37e68dfb1561fd41e18aef55a33883624f`; SHA-256 `dddc5847cea864f21f17e039c9bad24a5d41e3cbce9db3405e8bb79a9f74f422`.

O teste inicia psql-safe real com PSQL_BIN apontando a executável Node falso, que captura argv/subconjunto do env e ecoa stdin/stdout/stderr/exit. Asserts conferem ausência da URI em argv, derivação do destino, cleanup do passfile e propagação das opções TLS.
Controles negativos exigem saída2 sem spawn quando DESTINO_URL falta e diagnóstico sanitizado para URI inválida. O SQL SELECT1 é apenas texto ecoado pelo stub; não é executado em banco. Diretórios dos stubs não têm cleanup explícito neste arquivo.

**Limites:** Somente leitura: nenhum processo do teste foi lançado. Não cobre execução SQL, rede, todas as variáveis herdadas do ambiente ou validação TLS real; o child é um stub que implementa protocolo mínimo.

## scripts/db-audit/register-migration.test.mjs

Índice zero-based 19; leitura 1–272; revisor inbox. Blob `9929169b341a3ee44fca1fd1b0ee5382247d5c00`; SHA-256 `0c9f5219ed30db951c83d319765ddfaa8e88a2fd497b685e2be866275fa22b85`.

Exercita os helpers reais splitStatements/buildInsertSql/parseMigrationFile com aspas SQL, comentários, dollar quotes e colisão de delimitador; os casos sustentam essas entradas concretas, não equivalência com um parser completo de PostgreSQL. O helper de fixtures remove seu diretório temporário em finally.
Os subprocessos CLI executariam o entrypoint real contra um PSQL_BIN fake que devolve versão máxima, nenhuma colisão de objetos e INSERT/RETURNING configurados. Conferem rejeição de versão/retorno vazio/tag INSERT 0 0, aceitação de retorno esperado, dry-run, identidade do destino, diagnóstico sanitizado e flags -q/ON_ERROR_STOP em todas as chamadas capturadas.
O spy do caso de parâmetro host proibido é salvo como .mjs mas usa require: se fosse chamado, poderia falhar antes de criar o marcador. Ausência desse marcador isoladamente não prova que psql não foi invocado; a mensagem de rejeição esperada continua sendo evidência separada. Os outros spies usam ESM corretamente.

**Limites:** Leitura integral, sem executar teste/CLI/SQL. Psql é sintético e não interpreta SQL; não há prova de concorrência real no ledger, RLS, transação nem destino vivo. Caso dry-run não espiona ausência de spawn. Limites de evidência relacionados a GOV003, sem novo finding de produto.

## scripts/db-audit/talkx-analytics-contract.test.mjs

Índice zero-based 20; leitura 1–78; revisor inbox. Blob `b60fee36cbe3772fee3897fbe2091fad944c5664`; SHA-256 `126e5b5416700e5fd70762e451c9cb1cbd615d4891d2e36e302055f8902f93ba`.

Lê sete arquivos TSX reais como texto e aplica regex para impedir fórmulas percentuais fabricadas, exigir campos de entregas/leitura e conversões não rastreadas, corrigir rótulos de público/uso/envio e exigir o hook de conexão do monitor.
As duas assertions de disabled verificam expressões textuais no diálogo/primitiva. São controles de regressão da forma do código e de cópias conhecidas, sem montar React, disparar ações, computar estatísticas ou observar propagação efetiva do estado disabled.

**Limites:** Leitura integral sem execução. Correspondência lexical não prova alcance do ramo, comportamento de componentes ou dados reais; strings podem existir em contexto não executado. Nenhum finding novo; limitação de prova GOV003.

## scripts/db-audit/talkx-delivery-leases-contract.test.mjs

Índice zero-based 21; leitura 1–110; revisor inbox. Blob `8595dd8c6799ef1e1675646d48ea6020aac73dcb`; SHA-256 `8d376b74fb1d7f43e0ed01b654280425f85344c33117249e2c7c352615871ccd`.

Verifica migrations históricas nomeadas e textos atuais do worker/processador: SKIP LOCKED, tokens, grants/revokes, estados, quarentena, contadores, recibos, supressão, snapshot e códigos de erro. Os checks de ordem com indexOf/lastIndexOf mantêm sequências lexicais claim→provider→completion e snapshot→dispatch→provider.
Nenhuma asserção executa SQL ou simula trabalhadores concorrentes. Grants e locks presentes no arquivo não demonstram atomicidade, autorização efetiva ou fencing; regex com [\s\S]* podem cruzar corpos. A seleção fixa de migrations de setembro não resolve qual definição posterior vence no snapshot.

**Limites:** Leitura integral sem suíte/SQL/serviços. Evidência é estrutural sobre artefatos específicos; não comprova concorrência, replays, efeitos transacionais nem configuração aplicada. Contratos do banco permanecem na revisão Database; limites de prova GOV003, sem novo ID.

## scripts/db-audit/talkx-e90-links-contract.test.mjs

Índice zero-based 22; leitura 1–206; revisor inbox. Blob `25f6afa00ea1813f8ed364a67c25209a137cddd2`; SHA-256 `9b341cc0a601e52c74031b54b828eae650101ebfc2ead9a391f753cac87a51c8`.

Todos os casos são regex/indexOf em treze artefatos reais. Mantêm presença e ordem lexical do trackingUrl no call site, passe único de placeholders, proteção de chaves reservadas/protótipo, chunking/ordenação de custom fields, rate-limit, salt configurável, chamadas RPC e guards de IDOR, índice case-insensitive e REVOKEs.
A proximidade inferior a 600 caracteres entre personalize e trackingUrl não analisa argumentos da AST; a cadeia de resolução e a ordem de consultas são textuais. O teste de IP apenas exige import/definição e proíbe uma sintaxe antiga: não injeta headers nem comprova resistência ao spoofing. O título de RLS para todas as tabelas exige uma ocorrência genérica de ENABLE ROW LEVEL SECURITY mais três revokes, não uma por tabela.

**Limites:** Leitura integral sem execução. Não há redirects HTTP, destinatários cruzados reais, SQL/RLS, rate limit vivo nem disputa de campos paginados. Usa migrations nomeadas, sem adjudicar definições posteriores. Controles estruturais úteis, limites de evidência GOV003.

## scripts/db-audit/talkx-navigation-contract.test.mjs

Índice zero-based 23; leitura 1–19; revisor inbox. Blob `2d828fbd75381bd94ec4aacce68257becda400f9`; SHA-256 `34f50600f7acae079354a98ce575911c5e82444a7a338e9640f95a91501768f3`.

O arquivo inteiro lê três componentes e confere assinatura onLaunched, presença de mudanças scheduled/monitor, backToList e assinatura do callback, proibindo duas formas antigas de código. Nenhum componente é montado; regex [\s\S]* pode atravessar ramos e backToList pode existir em outro fluxo.

**Limites:** Leitura integral sem execução. Não demonstra navegação efetiva para campanha cancelada/agendada/enviando nem execução dos callbacks. Evidência textual específica; sem novo finding.

## scripts/db-audit/talkx-personalize-parity.test.mjs

Índice zero-based 24; leitura 1–113; revisor inbox. Blob `3c104d99135f4cf65f89432be1e2eff6176d8d96`; SHA-256 `3a643788258efe00bd008ccca328799f0bd97cd87ee7f4999915bede8b94eb64`.

Ao executar, importaria os dois módulos reais em Deno e compararia doze casos compartilhados, exigindo também textos esperados. Li integralmente a fixture de 102 linhas: nomes, apelido, empresa ausente, fallback, custom field presente/ausente, vendedor, telefone e link têm expectativas concretas. Isso é controle comportamental real de funções puras, mais forte que presença de strings.
O caso de datas compara os dois módulos e valida formato dd/mm/aaaa, mas não fixa relógio nem exige a data correta de um instante em fusos distintos. O relógio é consultado separadamente, podendo atravessar meia-noite. Não cobre bundler React/Deno deployment, missing/unknown do retorno edge ou campos adversariais nesta fixture.

**Limites:** Leitura integral e fixture conferida, sem executar Deno/teste. Doze exemplos provam somente contratos representados se a suíte rodar; nenhuma execução realizada nesta auditoria. Fixture SHA256 61e7d22c0776523bcfd5aec0c39a9738cb560688fc86a583e839b5cc317ee907, 1–102, scripts/db-audit/fixtures/talkx-personalize-parity.json.

## scripts/db-audit/talkx-schedule-timezone-contract.test.mjs

Índice zero-based 25; leitura 1–91; revisor inbox. Blob `d338fb960ae84a6b7411583c4f653fec25e9c643`; SHA-256 `5edc20b84bc32a751f32d140a85c2009718f27dfbb4831674d70580dd76f97d3`.

Os cinco testes são guards textuais sobre migration e oito produtores/consumidores: persistência de timezone, uso de pg_timezone_names, janela ordenada, payload/editor, min do input e cadeia scheduler→resume-policy→deliveryWindowStatus. Restringem a reintrodução de cálculos locais antigos e exigem resolver compartilhado para conexão ausente.
A presença de NOT VALID e nomes de validação na migration não testa inserts/updates existentes ou novos. Não há instante UTC, DST ambíguo, timezone inválido, montagem do wizard ou resposta do scheduler executada; a alegação fails-closed depende do comportamento não chamado neste arquivo.

**Limites:** Leitura integral sem execução SQL/React/Edge. Migrations históricas nomeadas não determinam vencedora atual. Controles estruturais de regressão, não prova de fronteiras temporais reais; sem novo ID.

## scripts/db-audit/talkx-scheduler-contract.test.mjs

Índice zero-based 26; leitura 1–53; revisor inbox. Blob `9599d678e31b1d1433d108a9270c9a146e4bd22d`; SHA-256 `4ef0c33ceeaaba59ed01115bbadb87ad750c5c180cb206ef4cd23e416c198ab2`.

Confere por regex a interpretação de response.ok mais success===true, export de handler/entrypoint, nomes de credencial/comparação constante/401, timeout de 10s, teto de dez campanhas/uma retomada e ausência de update/status sending. São guards sobre o texto atual do scheduler.
Não chama handler com headers nem avança temporizadores; presença de AbortController/setTimeout não demonstra abortar fetch ou liberar timer. Constantes e slice não provam o número de envios observados e ausência de update direto não elimina escrita via RPC.

**Limites:** Leitura integral sem executar teste/handler/serviços. Mantém formas específicas de código; autenticação, limites e timeout comportamentais exigem outros controles. GOV003, sem novo finding de produto.
