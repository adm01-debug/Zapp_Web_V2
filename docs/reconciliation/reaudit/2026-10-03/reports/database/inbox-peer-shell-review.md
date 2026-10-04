# Revisão peer de scripts Inbox

Fonte: `da307ba5626dce892f0b37cb6762463f55d14a96`. Revisor: `/root/reaudit_database`. Roster original: posições zero-based 6–11.

Leitura integral de seis scripts, 1.408 linhas. Nenhum shell, Docker, SQL, teste ou serviço executado. O registro preserva hashes SHA-256, Git blob e intervalos 1–EOF. Estas faixas pertencem à cobertura Inbox e não alteram o snapshot final da frente Database.

## scripts/db-audit/talkx-draft-recipients.test.sh

Linhas 1–181; SHA-256 `959474881fda556cfa50c1fa9c9f186f2745f2400f6f61febbb47042b5802671`; Git blob `02815987e189d04e8bcd8e69fd449441f5a3f8a7`.

Leitura integral181linhas (saída continha1–181; leitor tentou linha182 após EOF e foi corrigido no uso, sem executar fonte). DockerPG17 com retry e cleanup. Schema/helpers mínimos incluindo visible boolean, aplica migrations reais state-transition,role-gates,audience-snapshot. Confere replacement/contador, bloqueio sending, agente sem papel, invisível/deleted/LID/phoneinválido. Não monta RLS completo/hierarquia, paginação do editor ou arrays grandes. Asserts falhas por mensagem, chamadas sequenciais. Nenhum shell/SQL executado.

## scripts/db-audit/talkx-history-saved-by-fk.test.sh

Linhas 1–116; SHA-256 `876a29243435fc1d2139f0f307b2f881d6dc9742bce1ec034b8e485b9459eba8`; Git blob `ea543bbc03d95f10ca9ff755d129a67cffdfdb6b`.

Leitura integral116linhas. DockerPG17 e cleanup restrito, fixture isolada profiles/templates/history; escolhe NO_ACTION,SET_NULL ouORPHAN, aplica migration real. Caminhos bons repetem migration e fazem DELETEperfil conferindo history preservada/saved_bynull/FKvalidada; órfão exige falha específica e ausência de constraint parcial. Forte contrato de mudança FK nesse schema; não aplica guards de imutabilidade posteriores do histórico nem prova remoção de usuário inteira. Nada executado.

## scripts/db-audit/talkx-optout.test.sh

Linhas 1–384; SHA-256 `0fecb95268625998a72071f3443b843c037e49ca594151cc2ec3560c9861c21a`; Git blob `062c52d4fc0481675b446a9ac296fe6bf5ee2bb0`.

Leitura integral384linhas. PG17mínimo com auth/helpers e blacklist índices/policy, migrations reais6args→X0297args. Confere keywords/admin-supervisor-vs-agent, exact/contains/normalização, expired replacement+idempotência, herança campanha/override, assinatura/ACL, seedcustom preservado e view security_invoker sob papéis. Chamada supressão define claimservice mas executa postgres287, ACL positivo é catálogo, não SETROLEservice. Sem webhook/message-history scope/conexão ou envio autoreply; não prova integração de falhas/motor. Nada executado.

## scripts/db-audit/talkx-update-limits-send-window.test.sh

Linhas 1–223; SHA-256 `f37ad0d49b06ab747b7b85b0f68c97f840e3294a31865af3f2470259f76bd6d1`; Git blob `1300f64d0e4c4327012a2e64473d54c07b56a08d`.

Leitura integral223linhas. DockerPG17, CHECKjanela reconstruído fiel ao trecho, V09+V09b reais/replay+trigger; casos assimetria/inversão, janela válida/revision, ambosnull e ACL. Claims/papel authenticated usados nas mutations. Mensagem22023 aparece na intenção, mas assert só procura invalid_talkx_limits_values e ausência23514 sem VERBOSITYverbose, não valida SQLSTATE positivo. Gatepapéis posteriores/scheduler/fuso fora do recorte; nada executado.

## scripts/db-audit/talkx-v23-draft-step.test.sh

Linhas 1–152; SHA-256 `dc9e34f4ab7848eec17fde57afd818eaf208c640e085e8e5c4e83119d8767322`; Git blob `67509747cafab179ef1480b41e5fe87fd18b21c5`.

Leitura integral das 152 linhas. Harness Docker PostgreSQL 17 com cleanup restrito; wrapper psql usa ON_ERROR_STOP=0 (linha 10), de modo que setup/aplicação não são fail-fast para todo erro SQL. Fixture mínima e helpers reconstruídos: is_admin_or_supervisor sempre true (90–91), validação de timezone por regex (92–93), save_draft anterior copiado (96–115); aplica a migration V23 real (125). Há controle vermelho de coluna inexistente, persistência de draft_step/filtros, atualização e mensagens específicas para limites inválidos da RPC e CHECK. Chamadas com claims executam como postgres sem SET ROLE authenticated (129/139/145), portanto não provam grants/RLS nem gates atuais; tampouco cadeia integral. Asserts positivos de persistência são úteis no recorte. Nenhum shell, SQL ou Docker executado; limite de cobertura, sem novo achado de produto.

## scripts/db-audit/team-receipts-membership.test.sh

Linhas 1–352; SHA-256 `972cba9b0f8cb9228910b78006fcbd85e7a63f7c5e505fc0d653efb55f927fa2`; Git blob `a2ea5899cba525188a33608691b095bb8bbcbc35`.

Leitura integral das 352 linhas. Harness Docker PostgreSQL 17 isolado, psql ON_ERROR_STOP=1, helpers com SET ROLE authenticated e claims, asserts de resultado/erro e cleanup. Replica RPC anterior, triggers e esquema mínimo; semeia duas conversas e três perfis, demonstra no texto o caminho vulnerável anterior, aplica migration real membership_guard e verifica not_member, ausência de recibos fora do time, recibo legítimo, last_read_at, falta de claims e exclusão de recibo próprio. Esses controles sustentam o contrato da RPC no fixture. Limite concreto: policy INSERT copiada nas linhas 232–241 exige membership, mas a policy vencedora posterior em 20260928430000 exige apenas profile_id próprio; a migration aplicada só corrige RPC. Assim o controle negativo de INSERT direto (321–323) prova a policy sintética mais estrita e não refuta R2-DB-011/TC-009 na cadeia final. Não aplica a cadeia completa nem comprova produção. Nenhum shell, SQL ou Docker executado; sem novo ID.

