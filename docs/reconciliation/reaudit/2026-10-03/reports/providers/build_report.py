"""Generate read-only audit documentation; never edits the audited checkout."""
from pathlib import Path
from hashlib import sha256
from collections import Counter
import json

ROOT = Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
OUT = Path('/workspace/scratch/f8f9b9cbce53/reaudit/reports/providers')
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'
BASELINE = '2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6'
X028 = '4e73c7767858f00c577c29efd8cc86f5bea117a9'
REPO_URL = 'https://github.com/adm01-debug/Zapp_Web_V2/blob/' + HEAD + '/'
findings = []

def ev(path, first, last, symbol, note=''):
    p = ROOT / path
    lines = p.read_text().splitlines()
    assert 1 <= first <= last <= len(lines), (path, first, last, len(lines))
    return dict(path=path, line_start=first, line_end=last, symbol=symbol,
                head=HEAD, sha256=sha256(p.read_bytes()).hexdigest(),
                url=REPO_URL + path + '#L' + str(first), note=note)

def add(n, title, severity, classification, precondition, behavior, impact, evidence, acceptance,
        probes=(), related=(), limitations='', sources=()):
    findings.append(dict(id=f'R2-API-{n:03}', title=title, severity=severity,
        classification=classification, head=HEAD, baseline=BASELINE,
        preconditions=precondition, observed_behavior=behavior, impact=impact,
        evidence=evidence, acceptance=acceptance, probes=list(probes),
        related_findings=list(related), limitations=limitations,
        primary_sources=list(sources)))

add(1, 'Ações de controle Evolution não exigem papel nem escopo de conexão', 'P1', 'confirmed_static',
    'Endpoint publicado; usuário autenticado sem papel administrativo ou permissão sobre a conexão. O probe assume getUser válido para um agente comum e devolve false a qualquer RPC de permissão.',
    'O gate global verifica apenas getUser. set-webhook, disconnect, restart-instance, update-privacy, alterações de perfil/grupos e envios diretos não passam por requireAdmin nem por autorização de contato/conexão. set-webhook atravessa o proxy e traduz para POST /instance/connect, com o webhook escolhido pelo chamador. P11 executou o handler real: uma validação de usuário, zero consultas de permissão e uma chamada interceptada ao provedor.',
    'Um agente autenticado pode reconfigurar o webhook, interromper sessão ou realizar ações com a credencial do servidor. Os envios diretos também contornam a autorização por contato e a fila presente em message-delivery. O impacto concreto depende da ação e da conexão que a credencial do provedor seleciona.',
    [ev('supabase/functions/evolution-api/index.ts', 40, 45, 'global JWT gate'), ev('supabase/functions/evolution-api/index.ts', 122, 134, 'requireAdmin'), ev('supabase/functions/evolution-api/index.ts', 625, 666, 'restart/disconnect/settings/webhook/send-text'), ev('supabase/functions/_shared/evolution-go-routes.ts', 309, 316, 'webhook route translation')],
    ['Matriz explícita de autorização por ação, aplicada antes de fetch/RPC privilegiado.', 'Agente sem permissão recebe 403 em set-webhook/disconnect/update-privacy e não produz I/O no provedor.', 'Envio exige acesso ao contato/conexão e segue a decisão de autorização/entrega canônica; admin autorizado conserva as operações.'],
    probes=['P11'], related=['TRA-002'], limitations='TRA-002 trata seleção de credencial, não este gate. Nenhum JWT real, conta real ou provedor foi usado.')

add(2, 'Receipt GO de saída ainda fica fora de Multiplix e do estado da mensagem no inbox', 'P2', 'confirmed_static',
    'Receipt GO de mensagem enviada; Chat e Sender representam o mesmo usuário, mas Sender inclui dispositivo, de modo que a igualdade literal é falsa.',
    'O adaptador infere fromMe por igualdade literal. X028 removeu esse requisito somente para record_talkx_recipient_receipt. A busca da mensagem filtra sender=contact quando fromMe=false; os RPCs Multiplix delivered/read continuam exigindo true. Depois tenta upsert de stub inbound. P01 comprovou chamada TalkX, ausência das chamadas Multiplix e tentativa de stub contact.',
    'Talk X pode atualizar seu recibo enquanto inbox/Multiplix mantêm status atrasado. A tentativa de stub pode conflitar com a mensagem agent já existente; não se afirma que o stub sempre é criado. A revisão SQL paralela identificou índice global de external_id além do índice composto.',
    [ev('supabase/functions/_shared/evolution-go-adapter.ts', 169, 183, 'receipt translation'), ev('supabase/functions/_shared/evolution-webhook-msg-handlers.ts', 100, 138, 'inbox lookup and X028 receipt'), ev('supabase/functions/_shared/evolution-webhook-msg-handlers.ts', 140, 218, 'Multiplix gate and inbound stub')],
    ['Fixture GO com Sender contendo dispositivo eleva a mensagem agent e os recibos Multiplix corretos.', 'Correlação por external_id + conexão + registro de saída autoritativo, com testes de recibo realmente inbound.', 'A ausência/ambiguidade de fromMe não deve gerar stub de contato para ID de saída existente.'], probes=['P01'], related=['R2-DB-002'], limitations='Não mede incidência no tráfego real. Não duplica o achado SQL de atribuição de respostas.')

add(3, 'Edições e reações do webhook não correlacionam o evento à conexão', 'P2', 'confirmed_static',
    'Evento aceito contém external_id de uma mensagem local pertencente a conexão diferente da instância declarada. Basta uma linha local; não requer IDs duplicados coexistindo no banco.',
    'handleMessagesEdited não recebe instance; consulta somente external_id e atualiza por id. handleReactionEvent também consulta external_id globalmente e usa contact_id da linha encontrada como autor da reação. O caminho não compara instância, chat nem autor ao alvo.',
    'Um evento atribuído à conexão errada pode editar conteúdo/reação de outra conversa. Com validação forte na entrada a precondição depende de colisão/erro do provedor; com modo de sombra, a fronteira de confiança é mais ampla. P02 prova a ausência de filtros e a escrita na linha retornada de outra conexão.',
    [ev('supabase/functions/_shared/evolution-webhook-msg-handlers.ts', 328, 349, 'handleMessagesEdited'), ev('supabase/functions/_shared/evolution-helpers.ts', 353, 381, 'handleReactionEvent')],
    ['Passar a conexão validada ao handler e exigir correspondência do alvo por conexão/direção/chat.', 'Evento de outra conexão não altera conteúdo nem reação mesmo se seu external_id existe.', 'Testar edit/reaction em duas conexões com a mesma entrada externa, sem pressupor que o schema aceite duas rows iguais.'], probes=['P02'], related=['R2-API-021'], limitations='Isolamento insuficiente está confirmado no código; exploração/colisão em produção não foi testada.')

add(4, 'Falha de lookup de conexão vira cache negativo e amplia o escopo de mutações', 'P2', 'confirmed_static',
    'Lookup de whatsapp_connections retorna erro ou nenhuma linha para a instância e o evento contém ID de mensagem conhecido localmente.',
    'getConnectionByInstance ignora error e armazena data=null por cinco minutos. handleSendMessage, handleMessagesUpdate e handleMessagesDelete aplicam eq(whatsapp_connection_id) somente se a conexão foi encontrada. P03 simulou erro de lookup, executou delete sem filtro de conexão e mostrou que a segunda chamada reutiliza null sem nova consulta.',
    'Uma indisponibilidade transitória elimina uma condição de isolamento e permanece no cache. Eventos da instância não resolvida podem atingir mensagens globais por external_id/sender; inbound normal, que retorna quando falta conexão, fica indisponível durante o cache.',
    [ev('supabase/functions/_shared/evolution-helpers.ts', 197, 219, 'getConnectionByInstance'), ev('supabase/functions/_shared/evolution-webhook-msg-handlers.ts', 10, 42, 'handleSendMessage lookup'), ev('supabase/functions/_shared/evolution-webhook-msg-handlers.ts', 86, 107, 'handleMessagesUpdate lookup'), ev('supabase/functions/_shared/evolution-webhook-msg-handlers.ts', 225, 270, 'handleMessagesDelete')],
    ['Erro de consulta permanece erro e não popula cache negativo.', 'Evento sem conexão válida não realiza nenhuma mutação global.', 'Recuperação do DB permite a próxima tentativa retomar o lookup; teste diferencia erro de ausência confirmada.'], probes=['P03'], related=['R2-API-003', 'R2-API-021'], limitations='External_id precisa corresponder a linha existente para ocorrer mutação; não se afirma que toda falha cause corrupção.')

add(5, 'Mensagem de grupo GO pode entrar no inbox como conversa direta do participante', 'P2', 'confirmed_static',
    'Evento de grupo com remoteJid @g.us e participant/Sender com @s.whatsapp.net, formato produzido pelo adaptador GO.',
    'resolveBestJid prioriza qualquer JID de telefone antes do JID de grupo. handleIncomingMessage aplica o filtro de grupos ao bestJid já substituído pelo participante. P04 traduziu evento GO realista e observou ingest_inbound_message receber o telefone do participante.',
    'Conteúdo de grupo é persistido e tratado como mensagem direta. Pode contaminar histórico, atribuição de campanha, opt-out e automações do contato; a eventual resposta automática usaria o telefone direto.',
    [ev('supabase/functions/_shared/evolution-go-adapter.ts', 104, 133, 'GO message key'), ev('supabase/functions/_shared/evolution-helpers.ts', 73, 86, 'resolveBestJid'), ev('supabase/functions/_shared/evolution-webhook-messages.ts', 388, 438, 'group filter after JID resolution')],
    ['Classificar o chat original antes de resolver a identidade do participante.', 'Mensagem de grupo permanece fora do pipeline direto quando grupos são ignorados.', 'Fixtures com grupo, participante, LID e remoteJidAlt cobrem a separação entre chat e autor.'], probes=['P04'], limitations='Não se afirma que o produto deva suportar grupos; o próprio guard indica que deveria ignorá-los neste pipeline.')

add(6, 'Opt-out e atribuição podem se perder após o ingest, sem recuperação no replay', 'P1', 'confirmed_static',
    'ingest_inbound_message grava a mensagem e, depois disso, falha a gravação de supressão/atribuição ou o worker termina antes de completar efeitos pendentes.',
    'O ingest e os efeitos seguintes são operações separadas. A falha de supressão é só logada; attributeTalkXReply captura erro e retorna normalmente apesar do await introduzido por X028. Multiplix segue fire-and-forget. Na reentrega, outcome=duplicate retorna antes do processamento de opt-out/reply. P05: dois ingests, uma única tentativa de supressão, erro absorvido e nenhuma segunda tentativa.',
    'Uma mensagem já aceita pode deixar de bloquear envios futuros ao contato ou deixar de contabilizar resposta. O await diminui a janela de encerramento antecipado no Talk X, mas não cria durabilidade nem recuperação de erro.',
    [ev('supabase/functions/_shared/evolution-webhook-messages.ts', 459, 493, 'ingest and duplicate early return'), ev('supabase/functions/_shared/evolution-webhook-messages.ts', 517, 567, 'suppression write and swallowed error'), ev('supabase/functions/_shared/evolution-webhook-messages.ts', 569, 590, 'TalkX awaited / Multiplix detached'), ev('supabase/functions/_shared/talkx-reply.ts', 67, 92, 'attributeTalkXReply'), ev('supabase/functions/evolution-webhook/index.ts', 280, 294, 'HTTP completion')],
    ['Gravar efeito pendente de opt-out/reply de forma durável com a ingestão ou usar outbox idempotente.', 'Replay de mensagem já persistida retoma apenas os efeitos incompletos.', 'Falha de DB entre ingest e supressão deve produzir tentativa recuperável, sem enviar duas confirmações nem contar duas respostas.'], probes=['P05'], related=['R2-DB-002'], sources=['https://supabase.com/docs/guides/functions/background-tasks'], limitations='Não propõe reenviar indiscriminadamente operações externas: a recuperação precisa de chave idempotente por efeito.')

add(7, 'Indecisão sobre palavra de opt-out é interpretada como ausência de opt-out', 'P2', 'confirmed_static',
    'Cache sem valor útil; leitura de talkx_optout_keywords falha e RPC talkx_match_optout também falha.',
    'loadOptOutKeywords devolve null quando não decide. resolveOptOutKeyword converte erro da RPC em null, o mesmo resultado usado para não casamento. O chamador segue com attributeTalkXReply e attributeMultiplixReply. P07 enviou a palavra PARE com essas falhas e observou atribuição de engajamento sem supressão.',
    'Pedido de saída pode ser contado como resposta positiva e não bloquear mensagens posteriores. É um ramo distinto do erro de persistência em R2-API-006: a falha ocorre na decisão e troca seu significado.',
    [ev('supabase/functions/_shared/evolution-webhook-messages.ts', 61, 95, 'loadOptOutKeywords'), ev('supabase/functions/_shared/evolution-webhook-messages.ts', 130, 147, 'resolveOptOutKeyword'), ev('supabase/functions/_shared/evolution-webhook-messages.ts', 499, 508, 'resolve call'), ev('supabase/functions/_shared/evolution-webhook-messages.ts', 569, 590, 'engagement attribution')],
    ['Contrato explícito matched / not_matched / indeterminate.', 'Estado indeterminado não atribui engajamento nem conclui o processamento de opt-out.', 'Persistir tentativa pendente e reavaliar após recuperar fonte autoritativa.'], probes=['P07'], related=['R2-API-006'], limitations='Não defende lista fixa de palavras no edge; a tabela continua fonte autoritativa.')

add(8, 'Autoresposta de opt-out anuncia envio mesmo com HTTP de erro', 'P2', 'confirmed_static',
    'Supressão nova retorna ID, autoresposta está configurada e token da instância é encontrado; provedor responde HTTP 4xx/5xx.',
    'O retorno Response de evoFetch não é inspecionado. Depois do await o log diz Confirmacao enviada, inclusive se status=500. P06 capturou esse caso e mostrou ausência de AbortSignal. A supressão já existe; o ramo idempotente de um próximo evento não tenta confirmar de novo.',
    'O cliente pode não receber a confirmação de saída enquanto os logs afirmam que recebeu. A supressão permanece válida; não se confunde falha da confirmação com falha em bloquear o contato.',
    [ev('supabase/functions/_shared/evolution-webhook-messages.ts', 532, 561, 'opt-out acknowledgement'), ev('supabase/functions/_shared/evolution-send.ts', 31, 58, 'evoFetch returns Response')],
    ['Classificar status e formato da resposta; registrar accepted/rejected/unknown com evidência do provedor.', 'Controlar timeout até consumir o corpo.', 'Se confirmação for garantida pelo requisito, usar outbox por source_message_id; não reenviar após resposta ambígua sem reconciliação.'], probes=['P06'], related=['R2-API-006'], limitations='Não houve envio a destinatário real; apenas fetch interceptado com resposta sintética 500.')

add(9, 'Download de mídia do webhook aceita URL arbitrária sem política de egress', 'P1', 'confirmed_static',
    'Payload aceito controla mediaUrl/URL de mídia, ou o provedor devolve URL não confiável. O modo de autenticação do webhook e a rede do runtime determinam a exploração efetiva.',
    'persistIncomingMedia só exige startsWith(http); persistMediaToStorage chama fetch diretamente, segue redirecionamentos padrão e consome arrayBuffer inteiro antes de validar conteúdo. Caminhos de sticker/avatar também fazem download direto. P10 passou URL loopback à função real e confirmou que chegou ao fetch mock sem rejeição.',
    'Há caminho de SSRF no servidor e ausência de teto de bytes para downloads. O probe comprova o destino aceito pelo código, não acesso a serviço interno, leitura de segredo ou exfiltração em produção.',
    [ev('supabase/functions/_shared/evolution-webhook-messages.ts', 237, 253, 'persistIncomingMedia'), ev('supabase/functions/_shared/evolution-media.ts', 45, 67, 'persistMediaToStorage'), ev('supabase/functions/_shared/evolution-webhook-messages.ts', 648, 663, 'sticker download'), ev('supabase/functions/_shared/evolution-helpers.ts', 327, 350, 'persistProfilePicture')],
    ['Validar protocolo, destino DNS/IP e cada redirecionamento antes de ler o corpo, usando a política de egress canônica.', 'Rejeitar loopback/link-local/privado conforme política e impor teto de bytes em streaming.', 'Testar URL pública permitida, redirecionamento para destino bloqueado e corpo maior que o limite sem rede real.'], probes=['P10'], related=['R2-API-021'], limitations='Teto de duração existe em alguns downloads; ele não substitui controle de destino/volume. Não foi realizado probe SSRF contra rede real.')

add(10, 'Horário comercial salvo, worker e scheduler usam contratos diferentes', 'P2', 'confirmed_static',
    'business_hours_only habilitado; configuração de talkx_settings.business_hours difere do padrão, ou possui horário malformado.',
    'O schema/seed guarda objeto JSONB; parseBusinessHours aceita somente string JSON. O scheduler chama selectResumableCampaigns sem carregar business_hours, e esse helper usa deliveryWindowStatus sem configuração. A validação do horário comercial, ao contrário da janela de campanha, não rejeita NaN. P09 demonstrou objeto rejeitado, decisão divergente às 20h30 para janela configurada 20–22 e horário malformado aceito.',
    'Configurações podem ser ignoradas e campanha pode retomar/parar fora do horário pretendido. Corrigir somente o parser não corrige a retomada automática, que continua usando 08–18 seg–sex.',
    [ev('supabase/functions/_shared/talkx-window.ts', 33, 49, 'parseBusinessHours'), ev('supabase/functions/_shared/talkx-window.ts', 102, 118, 'business-hour checks'), ev('supabase/functions/talkx-send/index.ts', 318, 338, 'loadBusinessHoursAndDailyLimit'), ev('supabase/functions/_shared/talkx-resume-policy.ts', 129, 137, 'resume window'), ev('supabase/functions/talkx-scheduler/index.ts', 195, 199, 'resume decision call'), ev('supabase/migrations/20260930410000_talkx_settings_replay_idempotent.sql', 21, 40, 'JSONB setting and seed')],
    ['Parser aceita o contrato JSONB real e valida HH:MM/dias, inclusive faixas.', 'Scheduler e send recebem a mesma configuração e o mesmo relógio.', 'Teste de ida e volta config persistida → worker → pause → scheduler cobre horário customizado e entrada inválida.'], probes=['P09'])

add(11, 'Gmail webhook/cron avançam cursor compartilhado sem aplicar todo o histórico', 'P1', 'confirmed_static',
    'Conta ativa usa webhook ou cron; há paginação de histórico, mudança de labels/deleção, falha por mensagem, ou mensagem alterada que não está na seleção recente de inbox.',
    'gmail-webhook lê uma página somente de messageAdded, ignora nextPageToken, pula GET de mensagem com erro e não verifica erros de upsert; depois grava historyData.historyId. gmail-cron-sync também consulta só messageAdded/uma página; cria IDs alterados mas descarta esses IDs e sincroniza a lista recente de inbox limitada a 50. Em ambos, history_id é o mesmo consumido pelo incremental manual, que trata quatro tipos e preserva cursor em falhas de mensagens.',
    'Eventos ainda não aplicados ficam atrás do cursor e podem deixar de aparecer em próximos incrementais. Mensagens, labels e remoções locais divergem do Gmail; o problema não se limita a ter uma interface sem botão de próxima página. Escritas concorrentes do cursor também não usam compare-and-swap.',
    [ev('supabase/functions/gmail-webhook/index.ts', 163, 204, 'history page and message fetch'), ev('supabase/functions/gmail-webhook/index.ts', 223, 254, 'unchecked persistence'), ev('supabase/functions/gmail-webhook/index.ts', 275, 302, 'advance and acknowledge'), ev('supabase/functions/gmail-cron-sync/index.ts', 33, 58, 'cron incremental and full cursor'), ev('supabase/functions/gmail-sync/index.ts', 105, 155, 'manual incremental contract')],
    ['Um pipeline incremental canônico por conta processa todas as páginas/tipos e os IDs realmente alterados.', 'Cursor só avança após durabilidade dos efeitos; falha conserva ponto recuperável.', 'Testes offline: duas páginas, remoção/label, GET falho, upsert falho, duas invocações concorrentes e recuperação de history 404.'], related=['OTH-006'],
    sources=['https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list', 'https://developers.google.com/workspace/gmail/api/guides/sync'], limitations='OTH-006 é paginação do sync manual/listagem; este é perda de eventos no cursor compartilhado. Não foi consultada conta Gmail real.')

add(12, 'Gmail webhook não persiste metadados de anexos exigidos para download', 'P2', 'confirmed_static',
    'Mensagem com anexo é inserida pelo gmail-webhook e não foi posteriormente hidratada por syncMessageIds/manual/cron.',
    'O webhook grava apenas has_attachments, com inspeção rasa de parts; não escreve email_attachments. get-attachment exige uma linha local com email_message_id e gmail_attachment_id antes de chamar Gmail. O helper canônico extrai anexos recursivamente e grava essa linha, evidenciando contratos diferentes.',
    'Anexo recebido por push pode não ser enumerável e o download sob demanda retorna 404 apesar de existir no Gmail. Uma sincronização posterior pode reparar, mas o próprio cursor do webhook pode excluir o evento de reprocessamento.',
    [ev('supabase/functions/gmail-webhook/index.ts', 235, 254, 'message without attachment rows'), ev('supabase/functions/_shared/gmail-helpers.ts', 165, 196, 'recursive attachment persistence'), ev('supabase/functions/gmail-sync/index.ts', 184, 193, 'get-attachment ownership contract')],
    ['Webhook reutiliza hidratador canônico e grava anexos com o ID local da mensagem.', 'Fixture MIME aninhado recebida exclusivamente pelo webhook permite enumeração e download autorizado.', 'Teste negativo continua rejeitando attachment de outra mensagem/conta.'], related=['R2-API-011', 'OTH-006'], limitations='O guard de ownership do download deve ser preservado; removê-lo não corrige o produtor incompleto.')

add(13, 'Heartbeat Multiplix descarta o builder RPC e não renova o lease', 'P2', 'confirmed_static',
    'Item está claimed e o processamento alcança o intervalo de 30 segundos, especialmente com presença/espera/mídia lentas.',
    'setInterval executa void supabase.rpc(heartbeat_multiplix_item). O SDK PostgREST é thenable e despacha a requisição ao consumir then; o retorno é descartado sem await/.then. P14 executou o statement exato: um builder criado, zero consumo. Além disso, continue no opt-out tardio não passa por stopHeartbeat.',
    'O lease de 90 segundos pode vencer sem a renovação anunciada pelo comentário. Conforme revisão SQL paralela, antes do marcador de envio outro worker pode ganhar o token e o antigo recebe conflito; após o marcador, sweeper pode colocar outcome_unknown e rejeitar conclusão tardia. Não se deduz duplicação automática: há fencing por claim_token.',
    [ev('supabase/functions/multiplix-send/index.ts', 507, 526, 'heartbeat timer'), ev('supabase/functions/multiplix-send/index.ts', 567, 579, 'late optout continue'), ev('supabase/functions/multiplix-send/index.ts', 700, 704, 'cleanup paths')],
    ['Callback consome a RPC, verifica error/result e não sobrepõe heartbeats.', 'Cleanup roda em finally inclusive no opt-out tardio.', 'Teste com tempo virtual e cliente lazy prova renovação antes do vencimento; SQL mantém fencing e sweeper seguro.'], probes=['P14'],
    sources=['https://github.com/supabase/supabase-js/blob/master/packages/core/postgrest-js/src/PostgrestBuilder.ts'], limitations='A fonte primária atual do SDK foi recuperada via busca; tag v2.87.1 não foi baixada. P14 é probe do statement contra contrato thenable, não execução do pacote remoto. Efeitos SQL conferidos pelo agente database, não por live DB.')

add(14, 'Falha ao consultar privacidade transforma atualização parcial em abertura de outros campos', 'P2', 'confirmed_static',
    'Modo GO; atualização parcial; GET /user/privacy falha ou não retorna data com os valores, mas o POST subsequente é aceito.',
    'current começa vazio. Erro de GET é ignorado. pick usa all para todo campo não informado e sem valor atual. P12 comprovou mudança profile=contacts acompanhada de seis outros campos all depois de GET 503.',
    'A ação parcial pode ampliar visibilidade/contato da conta em campos que o operador não alterou. O comentário promete preservar o resto, mas o fallback não preserva.',
    [ev('supabase/functions/evolution-api/index.ts', 771, 793, 'update-privacy merge'), ev('supabase/functions/_shared/evolution-go-routes.ts', 283, 293, 'privacy body translation')],
    ['Sem snapshot atual válido, recusar atualização parcial e informar erro recuperável.', 'Validação por enum e teste de todos os campos ausentes/retornados.', 'GET falho deve produzir zero escrita posterior ao provedor.'], probes=['P12'], related=['R2-API-001'])

add(15, 'Controle de sessão usa rotas GO mesmo com EVOLUTION_API_FLAVOR=v2', 'P2', 'confirmed_static',
    'Instalação pretende utilizar o modo v2, suportado pelo proxy/tradutor por variável de configuração.',
    'connect, status e disconnect executam fetch direto em /instance/connect, /instance/status e /instance/logout sem ramo v2 nem nome de instância no path. A variável isGoFlavor só distingue outras ações. P13 comprovou status v2 atingindo a rota GO.',
    'A opção de configuração não fornece compatibilidade coerente para ciclo de sessão. A conexão pode ser criada/listada por caminhos v2 enquanto status/pareamento/logout usam outro contrato.',
    [ev('supabase/functions/evolution-api/index.ts', 120, 120, 'isGoFlavor'), ev('supabase/functions/evolution-api/index.ts', 384, 411, 'connect route'), ev('supabase/functions/evolution-api/index.ts', 573, 575, 'status route'), ev('supabase/functions/evolution-api/index.ts', 627, 635, 'disconnect route'), ev('supabase/functions/_shared/evolution-api-proxy.ts', 116, 145, 'v2 bypass contract')],
    ['Escolher explicitamente rotas/credenciais e normalização por flavor em todas as ações de sessão.', 'Matriz offline go/v2 verifica método, path, nome de instância e resposta.', 'Se v2 saiu do escopo, rejeitar a configuração e documentar essa decisão em vez de mantê-la parcialmente funcional.'], probes=['P13'], related=['TRA-002'], limitations='Não foi consultado servidor Evolution v2 real; confirma-se a incoerência do contrato local de configuração.')

add(16, 'Status não string aceito pelo envelope derruba lote de receipts', 'P3', 'hypothesis',
    'Recebimento de entry.status numérico/objeto em payload que passa no envelope leniente; incidência em versões de provedor não foi confirmada.',
    'O schema aceita data unknown/record. O handler apenas faz cast TypeScript para string e chama toLowerCase em runtime. P08 confirmou TypeError com status=3.',
    'Uma entrada malformada interrompe o lote e gera erro HTTP, podendo repetir eventos e bloquear recibos válidos presentes depois dela. O contraexemplo é de robustez do parser, não prova de incompatibilidade com payload válido do provedor atual.',
    [ev('supabase/functions/_shared/schemas.ts', 576, 594, 'Evolution envelope schemas'), ev('supabase/functions/_shared/evolution-webhook-msg-handlers.ts', 82, 94, 'status parse')],
    ['Validar status por schema de evento antes de processar lote.', 'Desconhecido/malformado possui saída explícita e não bloqueia entradas válidas.', 'Capturar fixture sanitizada de cada versão do provedor para decidir se números devem ser mapeados ou rejeitados.'], probes=['P08'], limitations='Classificado como hipótese de impacto no tráfego; o crash para a entrada sintética está reproduzido.')

add(17, 'scheduled_messages tem produtor e estados, mas executor não foi encontrado no código versionado', 'P2', 'gap',
    'A funcionalidade depende dos artefatos versionados auditados; nenhum agendador externo adicional foi demonstrado.',
    'useScheduledMessages insere pendências, lista e cancela. A busca em Edge Functions/scripts não encontrou consumo da tabela. A revisão independente de 779 migrations encontrou apenas DDL/RLS/índice, updated_at e backfill de URL, sem cron/função de envio dessa fila.',
    'Não há evidência suficiente para declarar entrega agendada funcional, autorizada ou idempotente. Este gap permanece mesmo depois de corrigir o falso sucesso do diálogo, que é outro achado do agente inbox.',
    [ev('src/hooks/chat/useScheduledMessages.ts', 44, 104, 'schedule/cancel mutations'), ev('supabase/migrations/20251220182411_dd03d6a1-4f98-410e-a411-1f2486626de2.sql', 1, 58, 'scheduled_messages schema')],
    ['Identificar e versionar o consumidor real ou implementar executor com claim, autorização por contato/conexão, estados recuperáveis e reconciliação.', 'Demonstração controlada do percurso pending → enviado/failed, incluindo cancelamento e corrida entre workers.', 'Se o consumidor for externo, anexar seu código/configuração e evidência sanitizada; não basta insert com toast de sucesso.'], related=['reaudit_inbox: ScheduleMessageDialog async callback'], limitations='Não afirma que nunca exista scheduler em produção. N8N/serviços externos não fornecidos não foram inspecionados.')

add(18, 'Bitrix pode devolver sucesso de criação mesmo quando o provedor rejeita', 'P2', 'confirmed_static',
    'Usuário autorizado chama push_contact/create_lead_from_conversation; Bitrix devolve resposta JSON com erro, inclusive HTTP de falha.',
    'Os dois ramos especiais fazem fetch/json e retornam success=true sem inspecionar Response.ok, campo error ou ID result. O ramo genérico de Bitrix verifica responseData.error, mas essa proteção não cobre os especiais. useBitrixApi exibe toasts de criação a partir de success. sync_contacts também omite os erros individuais de upsert do resultado.',
    'Operador recebe confirmação de contato/lead inexistente; falhas de sincronização local podem ser reduzidas a contagem menor sem lista de erros. O fluxo está alcançável por hooks versionados.',
    [ev('supabase/functions/bitrix-api/index.ts', 157, 172, 'sync error suppression'), ev('supabase/functions/bitrix-api/index.ts', 176, 211, 'special create actions'), ev('supabase/functions/bitrix-api/index.ts', 217, 232, 'generic error handling'), ev('src/hooks/integrations/useBitrixApi.ts', 191, 216, 'UI success consumers')],
    ['Padronizar classificação de HTTP + envelope + ID antes de declarar sucesso.', 'Resposta JSON de erro em 200 e erro em 4xx/5xx não acionam toast de sucesso.', 'Sync retorna falhas por item ou estado parcial explícito; dados de erro são sanitizados.'], limitations='Não foi usado Bitrix real; raciocínio estático sobre resposta JSON adversa e consumidor atual.')

add(19, 'Webhook WhatsApp oficial confirma entrada sem persistir mensagem e pode rebaixar status', 'P2', 'confirmed_static',
    'Instalação usa whatsapp-webhook como receptor da API oficial, ou envia eventos de status fora de ordem a esse endpoint.',
    'value.messages só é percorrido para log e depois retorna success=true. Para statuses há update por external_id, sem correlação de phone_number_id/conexão e sem proteção monotônica: um sent tardio sobrescreve read. O schema lê metadata.phone_number_id, mas não o usa na persistência.',
    'Mensagens recebidas por esse caminho não chegam ao inbox; reentrega é confirmada como concluída. Recibos fora de ordem podem regredir a apresentação de entrega. Não se transfere esse resultado automaticamente ao Evolution, que tem outro handler.',
    [ev('supabase/functions/whatsapp-webhook/index.ts', 15, 38, 'official envelope'), ev('supabase/functions/whatsapp-webhook/index.ts', 98, 132, 'status mutation / incoming log / ACK')],
    ['Definir se API oficial é suportada. Se for, usar ingestão durável e correlação da conta/phone_number_id.', 'Fixtures inbound entram no inbox e replay não duplica.', 'Sequência read → sent preserva read, e evento de outra conta não muda alvo.'], limitations='Endpoint está versionado e configurado, mas uso real da API oficial não foi demonstrado. O gap de deploy é explicitamente separado do comportamento estático.')

add(20, 'Distribuição A/B por hash depende da ordem não especificada das variantes', 'P3', 'confirmed_static',
    'Variantes e pesos permanecem iguais; banco devolve as linhas em outra ordem antes da persistência do snapshot ou numa nova atribuição.',
    'pickVariant consulta sem order e percorre a sequência cumulativa dos pesos. O hash é estável, mas a posição dos intervalos depende da ordem recebida. P15 chamou o export real com A/B e depois B/A, mesmo recipient/template/pesos; o ID escolhido mudou.',
    'Promessa de atribuição estável em retry/auditoria não é sustentada antes de um snapshot bem sucedido. Snapshot já salvo reduz o risco para recipient existente; não corrige o algoritmo nem a reprodutibilidade geral.',
    [ev('supabase/functions/talkx-send/process-recipient.ts', 32, 73, 'stableVariantHash / pickVariant')],
    ['Ordenar variantes por chave canônica antes de construir intervalos de peso.', 'Mesma configuração e recipient retornam mesma variante com permutações arbitrárias de rows.', 'Preservar decisão persistida quando pesos/conteúdo são alterados.'], probes=['P15'], limitations='Não alega viés estatístico adicional; demonstra instabilidade de identidade da variante.')

add(21, 'Autenticidade dos webhooks permanece apenas observada em caminhos públicos', 'P1', 'confirmed_static',
    'Handlers publicados com a configuração versionada; para Evolution, enforcement em shadow/default. Configuração real de secrets e proxy externo não foi consultada.',
    'verify_jwt=false é apropriado a webhooks, mas os gates próprios de Gmail e WhatsApp oficial não bloqueiam ausência/assinatura inválida. Gmail somente decodifica claims OIDC. Evolution permite requisição sem HMAC e usa token enforcement default shadow; token mode existe e altera essa condição. Os handlers depois acessam banco/provedor com privilégio de servidor.',
    'Payload sem autenticidade pode disparar sincronização Gmail ou alterações de estado/mensagens. Em Evolution o token mode reduz esse risco, porém sua configuração real é desconhecida e seleção global de token tem o problema TRA-002. Não se afirma que todos os ambientes estejam abertos.',
    [ev('supabase/config.toml', 8, 15, 'public webhook gateway configuration'), ev('supabase/functions/evolution-webhook/index.ts', 47, 68, 'HMAC and token defaults'), ev('supabase/functions/evolution-webhook/index.ts', 130, 149, 'conditional enforcement'), ev('supabase/functions/gmail-webhook/index.ts', 113, 131, 'OIDC observation only'), ev('supabase/functions/whatsapp-webhook/index.ts', 79, 87, 'HMAC result ignored'), ev('supabase/functions/_shared/hmac-validation.ts', 397, 420, 'logGmailOidcAuthShadow')],
    ['Gate próprio autentica emissor e conta/instância antes de qualquer efeito.', 'Gmail verifica assinatura/JWKS, issuer, audience e identidade do emissor esperado; Meta verifica o HMAC do corpo.', 'Rollout Evolution deve resolver credencial por instância e compatibilidade GO antes de exigir autenticação; negativos não fazem DB/fetch privilegiado.', 'Evidência sanitizada da configuração implantada e testes com ausência/assinatura inválida/replay documentam fechamento.'], related=['TRA-002', 'R2-API-003', 'R2-API-009'], limitations='Shadow é intencional nos comentários; intenção de rollout não equivale a controle efetivo. Não houve tentativa de acesso sem autorização a endpoint real.')

add(22, 'Rotinas de e-mail, relatório e encerramento executam privilégio de servidor sem autorizar o chamador', 'P1', 'confirmed_static',
    'A chamada é admitida pelo gateway; um usuário válido sem papel administrativo já basta como precondição conservadora. send-email requer Resend configurado; auto-close requer configuração habilitada e contatos elegíveis; relatório exige conhecer um reportId existente. Não foi verificado o estado do gateway implantado.',
    'send-email aceita destinatários, assunto, corpo, reply_to, cópias e anexos do payload e usa a chave Resend sem getUser/requireAuth/role. O remetente fixo e o rate limit por IP não autorizam a ação. send-scheduled-report lê a configuração e dados agregados com service role, envia e devolve reportData sem verificar o papel. auto-close-conversations seleciona e modifica contatos globalmente com service role sem segredo de cron nem usuário autorizado.',
    'Chamadores admitidos podem usar o relay do projeto para conteúdo e destinatários arbitrários, disparar relatório conhecido e obter seus agregados, ou antecipar o encerramento global. A política SQL de scheduled_reports restringe leitura a admin/supervisor, por isso não se presume que um agente consiga enumerar IDs pelo frontend.',
    [ev('supabase/functions/send-email/index.ts', 4, 48, 'handler, IP limit and Resend payload'), ev('supabase/functions/send-scheduled-report/index.ts', 6, 25, 'service client and global report lookup'), ev('supabase/functions/send-scheduled-report/index.ts', 93, 111, 'dispatch and reportData response'), ev('supabase/functions/auto-close-conversations/index.ts', 4, 38, 'unguarded service scan'), ev('supabase/functions/auto-close-conversations/index.ts', 51, 73, 'global closure effects')],
    ['Exigir identidade e autorização de ação antes do uso da chave Resend ou cliente service.', 'Rotinas automáticas aceitam apenas credencial dedicada de cron; execução manual exige a permissão equivalente.', 'Invites usam template e destinatário vinculados ao fluxo de convite autorizado.', 'Agente comum não envia e-mail arbitrário, não recebe reportData de terceiros e não dispara encerramento; nenhum efeito ocorre após rejeição.'], related=['R2-AUTH-015'], limitations='O gate externo não foi exercitado. Não se declara acesso anônimo: a lacuna de autorização de aplicação permanece para qualquer usuário admitido sem o papel exigido.')

add(23, 'Relatório agendado avança last_sent_at e anuncia sucesso após falha de envio', 'P2', 'confirmed_static',
    'Relatório existente; Resend ausente ou resposta HTTP não 2xx para um ou todos os destinatários. O fetch precisa resolver em HTTP: exceção de rede é capturada no catch externo e não segue esse ramo.',
    'A ausência da chave ou de destinatários pula todo envio. Respostas HTTP de erro apenas geram log. Em seguida o handler atualiza last_sent_at/next_send_at e retorna success=true, também sem examinar o retorno do UPDATE. Não existe estado por destinatário que preserve falhas parciais para retomada.',
    'A aplicação pode registrar um ciclo como enviado sem entrega e postergar sua próxima execução. Se parte do lote foi aceita, repetir a operação inteira também pode repetir e-mails já aceitos.',
    [ev('supabase/functions/send-scheduled-report/index.ts', 91, 111, 'email loop and unconditional schedule advancement'), ev('supabase/functions/send-scheduled-report/index.ts', 118, 125, 'calculateNextSend')],
    ['Falha de configuração ou recusa HTTP não marca o relatório como enviado.', 'Persistir resultado por destinatário/tentativa e chave idempotente antes de confirmar o ciclo.', 'Resposta distingue enviado, parcial e falha; retry processa somente destinos pendentes.', 'Verificar o resultado do UPDATE e testar todos recusados, sucesso parcial e banco indisponível.'], related=['R2-API-022'], limitations='Nenhum e-mail real foi enviado; o erro de entrega é demonstrado pelo fluxo estático. Métricas e paginação do conteúdo do relatório são outra superfície e não foram usadas para inflar este achado.')

add(24, 'Diálogo ElevenLabs envia script e omite o campo inputs obrigatório do provedor', 'P2', 'confirmed_static',
    'Usuário autenticado usa o diálogo de múltiplas vozes com chave ElevenLabs configurada; contrato público atual de POST /v1/text-to-dialogue.',
    'O frontend envia script corretamente ao contrato interno. A Edge encaminha esse mesmo nome no JSON externo, enquanto a referência oficial exige inputs, array de text/voice_id. Nenhuma tradução para inputs ocorre antes do POST.',
    'A funcionalidade montada nas configurações produz uma requisição incompatível com o contrato obrigatório do provedor e não pode contar com geração válida. A recusa concreta e seu status não foram medidos em uma conta real.',
    [ev('supabase/functions/elevenlabs-dialogue/index.ts', 18, 40, 'internal script to external POST'), ev('supabase/functions/_shared/schemas.ts', 164, 169, 'ElevenLabsDialogueSchema'), ev('src/components/voice/ElevenLabsDialogue.tsx', 52, 91, 'generateDialogue consumer')],
    ['Traduzir o contrato interno para inputs no adaptador ElevenLabs.', 'Validar limites agregados de texto/vozes conforme contrato adotado e retornar erro útil antes do POST.', 'Teste de contrato intercepta o JSON externo e exige inputs com text/voice_id; cenário válido chega ao retorno de áudio.'], sources=['https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert'], limitations='Documentação oficial consultada em 2026-10-04. A presença obrigatória de inputs está confirmada; não se afirma observação de HTTP422 real.')

add(25, 'Geração musical envia duração no nome e unidade do contrato de efeitos sonoros', 'P2', 'confirmed_static',
    'Administrador usa a geração de música da biblioteca, escolhe duração em segundos e a Edge acessa o endpoint /v1/music atual da ElevenLabs.',
    'O consumidor oferece 5–60 segundos e envia duration. O ramo music monta duration_seconds; a API musical documenta music_length_ms. O corpo não transmite a duração escolhida no campo esperado nem converte segundos em milissegundos.',
    'A duração solicitada fica fora do contrato. Caso o provedor ignore o campo extra, a duração pode ser escolhida pelo modelo; caso o rejeite, a geração falha. Ambos os resultados concretos dependem da tolerância da versão implantada.',
    [ev('supabase/functions/elevenlabs-sfx/index.ts', 22, 42, 'music request builder'), ev('src/components/settings/media-library/AIGenerateDialog.tsx', 22, 36, 'duration invoke'), ev('src/components/settings/media-library/AIGenerateDialog.tsx', 65, 74, 'music duration UI')],
    ['Enviar music_length_ms = segundos * 1000 no ramo musical; preservar duration_seconds no ramo SFX quando compatível.', 'Validar duração por modalidade e testar 5, 15 e 60 segundos no corpo externo.', 'A prévia mostra duração real ou confirmação do provedor, sem apresentar a escolha local como duração comprovada.'], sources=['https://elevenlabs.io/docs/api-reference/music/compose'], limitations='Contrato externo confirmado em documentação oficial; não houve geração paga. Ignorar versus rejeitar campo desconhecido é condicionado, não observado.')

add(26, 'Worker de IA deixa lease expirar durante o handler e permite reexecução após efeito externo iniciado', 'P2', 'confirmed_static',
    'Job ai.generate efetivamente enfileirado, AI_JOBS_ENABLE_AI_GENERATE=1/true, handler leva mais de 120 segundos; outro tick executa o reaper e, depois do backoff, há nova tentativa disponível. A flag é desligada por padrão e não foi encontrado produtor ai.generate no frontend revisado.',
    'O worker renova o lease para 120 segundos somente antes e depois do await do handler. Não há renovação durante a chamada. claim_ai_jobs/reap_ai_jobs recolocam jobs vencidos em queued sem distinguir efeito externo em andamento; a tokenização impede a liquidação antiga, mas não desfaz nem identifica o POST já realizado.',
    'Se a primeira chamada já chegou ao provedor e o resultado demora ou se perde, uma tentativa posterior pode gerar e cobrar novamente. A conclusão antiga é descartada quando perdeu o token. Não ocorre duplicação automática em jobs curtos nem quando a flag permanece desligada.',
    [ev('supabase/functions/ai-jobs-worker/index.ts', 59, 75, 'lease constants and feature flag'), ev('supabase/functions/ai-jobs-worker/index.ts', 151, 188, 'handleAiGenerate external effect'), ev('supabase/functions/ai-jobs-worker/index.ts', 277, 335, 'before/after heartbeat and fenced finish'), ev('supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql', 203, 221, 'claim lease reaper'), ev('supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql', 390, 406, 'reap_ai_jobs lease expiry')],
    ['Renovar durante execução com encerramento garantido do timer e perda de lease propagada ao handler.', 'Preservar identidade de tentativa/efeito e não reenviar automaticamente quando o aceite externo é desconhecido.', 'Impor prazo ponta a ponta incluindo corpo da resposta, ligado ao orçamento de lease.', 'Cenário determinístico com dois workers, chamada lenta e reaper comprova uma decisão explícita sobre efeito incerto e ausência de cobrança duplicada por retry cego.'], related=['IA-TIMEOUT-001'], limitations='Fluxo SQL foi cruzado com a frente database. Não foi medido um job longo real; o finding explicita configuração e corrida necessárias. Producer/runtime da flag permanece desconhecido.')

add(27, 'Transcrição aceita mensagem visível sem mídia e baixa objeto escolhido pelo cliente com service role', 'P1', 'confirmed_static',
    'Usuário autenticado tem acesso a uma mensagem com media_url nula/vazia e conhece o caminho de um áudio de terceiro em bucket aprovado do projeto. O impacto de confidencialidade pressupõe que esse objeto não seja legível pelo chamador e seja legível pela service role. ElevenLabs configurado e cotas disponíveis.',
    'assertMessageVisibleToCaller verifica apenas que a mensagem existe sob RLS e retorna ok com mediaUrl=null. O handler começa com requestedAudioUrl e só a substitui se mediaUrl for truthy. downloadAudio valida origem/bucket e depois usa service role para baixar o path. Não há vínculo entre esse objeto e a mensagem aprovada. P16 reproduziu o download do path de outro contato; P17 mostrou que a substituição funciona quando media_url está preenchida.',
    'O ID de uma mensagem de texto própria pode funcionar como autorização substituta para transcrever áudio privado de outro contato. O endpoint devolve transcription/words/speakers do objeto escolhido, sem exigir visibilidade de sua mensagem proprietária.',
    [ev('supabase/functions/_shared/ai-audio-authz.ts', 61, 78, 'visible message with nullable media URL'), ev('supabase/functions/ai-transcribe-audio/index.ts', 100, 118, 'requested URL retained on missing canonical media'), ev('supabase/functions/ai-transcribe-audio/index.ts', 31, 60, 'downloadAudio service storage'), ev('supabase/functions/ai-transcribe-audio/index.ts', 209, 221, 'transcription returned to caller'), ev('supabase/functions/_shared/ssrf.ts', 72, 107, 'origin/bucket parser does not authorize object')],
    ['Mensagem sem mídia canônica válida deve ser recusada antes de qualquer download ou gasto.', 'Verificar tipo e vínculo do objeto à mensagem visível; baixar exclusivamente a referência canônica autorizada.', 'Teste usa mensagem de texto visível e URL privada de outro contato: rejeição e zero Storage/provedor.', 'Preservar controle positivo de áudio canônico permitido e caminho interno de serviço explicitamente autorizado.'], probes=['P16','P17'], related=['IA-AUDIO-001'], limitations='IA-AUDIO-001 anterior trata classificação só por nome/URL; este é bypass distinto no transcritor. Os probes compõem blocos exatos do handler com helpers reais, sem executar Zod nem STT integral; não houve acesso a áudio real de terceiro.')

add(28, 'Auto-close conta encerramento mesmo quando mensagem, closure e desatribuição falham', 'P2', 'confirmed_static',
    'Auto-close habilitado e ao menos um contato selecionado; uma ou mais escritas retornam erro no contrato PostgREST. Conflito do índice diário de closure (R2-DB-008) é um exemplo concreto possível, além de indisponibilidade.',
    'As respostas dos INSERTs em messages/conversation_closures e do UPDATE em contacts são ignoradas. closedCount cresce incondicionalmente e o endpoint responde HTTP200. P18 fez as três escritas retornarem erro e reproduziu closed=1. As operações não formam unidade transacional: partes podem ser aplicadas e outras recusadas.',
    'Contadores e resposta afirmam encerramentos que não ocorreram; uma falha parcial pode deixar mensagem local, estado de conversa e atribuição divergentes. Um closure inserido com sucesso realmente aciona triggers de resolução/outbox CRM: o achado não afirma ausência total de fechamento por não usar RPC.',
    [ev('supabase/functions/auto-close-conversations/index.ts', 51, 82, 'unchecked writes and unconditional closed count')],
    ['Examinar cada erro e contar apenas encerramentos efetivamente confirmados.', 'Encerramento, desatribuição e eventos derivados devem ter contrato transacional/idempotente, com precondição de inatividade revalidada.', 'Falha ou conflito de closure preserva estado coerente e produz resposta de falha/parcial.', 'Se mensagem de encerramento precisa chegar ao contato, sua entrega deve usar executor e confirmação verificáveis.'], probes=['P18'], related=['R2-API-022','R2-DB-008'], limitations='A frente database confirmou close_reason/outcome como TEXT, trigger de conversation_status=resolved e outbox CRM; esses efeitos existem em sucesso. A entrega externa da mensagem local não foi demonstrada. Nenhuma escrita real ocorreu no probe.')

add(29, 'Prévia e validação Multiplix aceitam destinatário de outro disparo', 'P1', 'confirmed_static',
    'Usuário autenticado possui um disparo existente associado ao seu profiles.id e conhece o UUID de destinatário de outro disparo. A Edge usa o cliente service role. Não depende de demonstrar que os fluxos de criação afetados por MX-08 funcionem para toda conta.',
    'loadOwnedDispatch resolve corretamente o profile e confere o dono. Porém loadRecipient busca apenas id e omite dispatch_id no SELECT. handlePreview só rejeita disparo diferente quando esse campo é não nulo: a projeção real deixa undefined e o teste é pulado. handleValidate usa recipient_id fornecido como amostra sem conferir pertença. P19/P20 executaram os handlers com projeção de colunas fiel e retornaram empresa/telefone ou valor bruto de placeholder de destinatário estrangeiro.',
    'Um disparo próprio serve como autorização substituta para ler dados de destinatário de outro disparo, inclusive nome, destino e variáveis que o template exponha. A prévia também pode combinar conteúdo de um disparo com público diferente do autorizado.',
    [ev('supabase/functions/multiplix-dispatch/actions/inspect.ts', 147, 169, 'correct profile and dispatch ownership guard'), ev('supabase/functions/multiplix-dispatch/actions/inspect.ts', 195, 203, 'recipient SELECT without dispatch correlation'), ev('supabase/functions/multiplix-dispatch/actions/inspect.ts', 471, 498, 'optional membership check and foreign recipient response'), ev('supabase/functions/multiplix-dispatch/actions/inspect.ts', 721, 788, 'validate foreign sample and placeholder response')],
    ['Carregar destinatário exigindo id e dispatch_id autorizado no mesmo WHERE; ausência resulta em 404.', 'Aplicar a mesma correlação à prévia e à validação, sem depender de campo opcional não selecionado.', 'Controle negativo com disparo próprio e destinatário estrangeiro retorna 404 sem dados; controle positivo do próprio disparo continua funcionando.', 'Mocks devem respeitar a projeção SELECT, para não fornecer ao guard colunas que o banco nunca devolve.'], probes=['P19','P20'], related=['MX-08'], limitations='São contratos dos endpoints versionados. A frente de consumidores não encontrou invocação de preview/validate nos componentes Multiplix atuais; não se afirma alcance por botão. Probes isolam os handlers e a projeção PostgREST, sem executar router, JWT real ou RLS live.')

add(30, 'Resumo e estimativa Multiplix tratam a primeira página de destinatários como público completo', 'P2', 'confirmed_static',
    'Disparo existente do próprio usuário possui mais destinatários que o teto de linhas configurado no PostgREST. O probe usa fixture de 2500 destinatários e limite simulado de 1000; o teto implantado não foi consultado.',
    'loadRecipients faz SELECT sem paginação nem contagem total. summarize usa recipients.length como total e a invariante só verifica se as classes somam esse mesmo subconjunto. estimate calcula mensagens, caracteres e renderizações sobre o array parcial. P21 retornou total=1000 e messages=1000 para 2500 destinatários e um bloco de texto, sem sinalizar incompletude.',
    'A revisão pode subestimar público, mensagens e consumo de voz, além de omitir classes de elegibilidade localizadas fora da primeira página. Um conjunto internamente consistente de contadores não prova que todos os destinatários foram carregados.',
    [ev('supabase/functions/multiplix-dispatch/actions/inspect.ts', 186, 192, 'unpaged loadRecipients'), ev('supabase/functions/multiplix-dispatch/actions/inspect.ts', 949, 1011, 'subset summary and self-consistency check'), ev('supabase/functions/multiplix-dispatch/actions/inspect.ts', 1040, 1108, 'estimate derived from partial recipient array')],
    ['Usar agregação no servidor ou paginação determinística até esgotar o público, com detecção explícita de leitura incompleta.', 'Comparar contagem autoritativa ao conjunto usado no cálculo e definir consistência quando o público muda durante a leitura.', 'Fixture acima do teto inclui classes e roteiros de voz distintos na última página; resumo e estimativa abrangem todas as linhas.', 'Se houver limite funcional de público, rejeitá-lo explicitamente antes de apresentar um total parcial.'], probes=['P21'], limitations='A frente frontend não identificou consumidor atual destas ações; o resultado descreve a API. Não foi consultado o limite PostgREST real nem executada consulta no banco.')

add(31, 'Presença humanizada pode bloquear o envio além do prazo do chamador', 'P2', 'confirmed_static',
    'Worker Multiplix alcança send após marcar provider_dispatch_started; o endpoint de presença mantém a requisição pendente e o AbortSignal do chamador vence. Não requer que o POST de mensagem tenha ocorrido.',
    'send aguarda postPresence antes do POST da mensagem. postPresence não recebe deps.signal nem possui timeout próprio. O sinal é aplicado apenas ao POST posterior. P22 abortou o sinal e a função continuou pendente até liberar manualmente a presença; só então o POST principal observou AbortError.',
    'Uma etapa descrita como best effort pode reter o worker e a lease indefinidamente dentro do limite maior do runtime. Como o marker de despacho já existe, o item pode acabar em outcome_unknown mesmo sem ter chegado ao POST da mensagem; não se afirma duplicação automática e o fencing SQL continua válido.',
    [ev('supabase/functions/_shared/messaging/evolution-go.ts', 200, 214, 'unbounded postPresence'), ev('supabase/functions/_shared/messaging/evolution-go.ts', 241, 248, 'presence awaited before signal-protected send'), ev('supabase/functions/multiplix-send/index.ts', 590, 633, 'timer before preparation and dispatch marker before send')],
    ['Presença recebe prazo curto e cancelamento ligado ao orçamento total; falha de presença não impede envio autorizado dentro do prazo restante.', 'Sinal já abortado não inicia novo efeito; a preparação e leitura de mídia também devem consumir o mesmo orçamento.', 'Marker de efeito distingue preparativos de tentativa real de enviar mensagem ou conserva informação suficiente para conciliar a etapa incerta.', 'Probe com presença pendente e relógio controlado termina no prazo, encerra timers/lease e não envia depois de cancelamento.'], probes=['P22'], related=['R2-API-013'], limitations='Prova de fluxo e cancelamento em memória, sem espera longa nem conexão real. Não afirma que um endpoint de presença implantado costume travar.')

add(32, 'Modo de teste do AI Proxy permite chamada paga sem cota nem registro de consumo', 'P2', 'confirmed_static',
    'Usuário com JWT válido conhece provider_id existente/ativo e há credencial configurada. O corpo é válido e inclui test=true. O limite local por IP de 30 chamadas/minuto ainda é aplicado; não se alega tráfego ilimitado.',
    'O booleano fornecido pelo cliente pula enforceAiGuards antes do parse normal. Depois o handler chama runProviderTest com mensagens/tools escolhidos pelo cliente e sai antes de logAiUsageDetached. Não há checagem administrativa para o diagnóstico. P23 executou o handler completo com identidade comum e quota que recusaria: houve chamada ao adaptador/provedor interceptado, zero consultas de permissão, zero guard e zero log. P24, controle com test=false, retornou 429 antes do provedor.',
    'A cota diária e a contabilidade de consumo podem ser evitadas com um campo do request. O diagnóstico devolve apenas um detalhe curto, mas a geração paga processa toda a solicitação aceita. Mesmo o teste administrativo legítimo precisa conservar custo real, separando-o da cota operacional se essa for a regra de produto.',
    [ev('supabase/functions/ai-proxy/index.ts', 474, 497, 'client test flag skips guards'), ev('supabase/functions/ai-proxy/index.ts', 344, 451, 'diagnostic provider call and response'), ev('supabase/functions/ai-proxy/index.ts', 519, 587, 'provider selection and early return without usage'), ev('src/components/settings/ai-providers/useAIProviders.ts', 118, 133, 'real diagnostic consumer')],
    ['Exigir permissão específica de diagnóstico antes de excluir a operação da cota normal.', 'Registrar todo consumo real de teste com finalidade própria, sem confundi-lo com geração operacional.', 'Limitar conteúdo/modelo/orçamento do diagnóstico no servidor, quando sua finalidade for somente verificar conectividade.', 'Usuário comum com quota esgotada não obtém chamada externa alterando test; teste autorizado preserva identidade, destino fixo e auditoria.'], probes=['P23','P24'], related=['IA-QUOTA-001'], limitations='JWT, cota e banco são fronteiras simuladas; adapters de roteamento/capacidade/fetch foram executados sem rede. A incompatibilidade é de autorização/contabilidade, diferente da contagem de ações versus tentativas já registrada em IA-QUOTA-001.')

add(33, 'Auto-tag conserva etiquetas antigas quando a nova classificação válida não tem tags', 'P2', 'confirmed_static',
    'Contato visível ao usuário já tem etiquetas source=ai; o modelo devolve resposta válida com tags=[] após analisar conversa não vazia.',
    'AutoTagOutput aceita array vazio. O handler só chama replace_ai_conversation_tags quando tagPayload.length > 0. Assim não executa a substituição vazia que removeria as etiquetas de IA antigas e responde status=ok, tags=[] e tagsReplaced=false. O SQL é capaz de aplicar conjunto vazio; o bloqueio está no chamador.',
    'A classificação devolvida e o estado persistido divergem: etiquetas antigas continuam associadas ao contato após uma avaliação que não as escolheu. A evidência tagsReplaced=false está no envelope, mas não limpa o estado nem converte o resultado em falha/parcial.',
    [ev('supabase/functions/_shared/ai-response-contracts.ts', 123, 134, 'empty tags allowed'), ev('supabase/functions/ai-auto-tag/index.ts', 173, 206, 'nonempty-only replacement'), ev('supabase/functions/ai-auto-tag/index.ts', 295, 305, 'successful empty response')],
    ['Executar substituição também para conjunto vazio validado, distinguindo-o de erro ou ausência de conversa.', 'Cenário com tags antigas seguido de classificação válida vazia remove somente as tags de IA.', 'Preservação de etiquetas humanas deve ser comprovada junto da correção SQL apontada pela frente database.', 'Resposta reflete resultado confirmado da persistência e trata falha de RPC sem anunciar conclusão.'], limitations='Ramo confirmado por leitura, sem modelo real nem escrita no banco. A falha SQL que converte etiqueta humana em IA no ON CONFLICT pertence à frente database e não é recontada aqui.')

add(34, 'Recuperação de áudio reutiliza a conexão da primeira mensagem em todo o lote', 'P2', 'confirmed_static',
    'O lote global contém áudios de duas ou mais conexões; pelo menos um áudio de outra conexão precisa de recuperação pelo provedor. A hipótese de recuperação viável por ID é limitada ao modo Evolution v2: o próprio utilitário declara que GO não dispõe desse lookup apenas por ID.',
    'A seleção de mensagens inclui whatsapp_connection_id, mas não filtra uma conexão. O handler consulta somente messages[0].whatsapp_connection_id antes do loop e passa o mesmo instanceName a getMediaBase64 para cada external_id do lote.',
    'Mensagens posteriores podem ser consultadas na instância errada e relatadas como irrecuperáveis mesmo quando a instância de origem conserva a mídia. Não se presume que IDs iguais existam nas duas instâncias nem que a consulta errada sempre devolva um áudio diferente; o efeito confirmado é o desvio da conexão de origem.',
    [ev('supabase/functions/recover-corrupted-audios/index.ts', 22, 30, 'provider lookup contract'), ev('supabase/functions/recover-corrupted-audios/index.ts', 52, 61, 'global audio selection with per-message connection'), ev('supabase/functions/recover-corrupted-audios/index.ts', 69, 81, 'first-message connection selected once'), ev('supabase/functions/recover-corrupted-audios/index.ts', 92, 105, 'same instance reused inside loop')],
    ['Resolver instância e credencial a partir da conexão de cada mensagem ou agrupar o lote por conexão.', 'Conexão ausente/ambígua falha somente os itens afetados sem usar uma instância presumida.', 'Fixture de duas conexões e IDs distintos comprova cada lookup no destino correto; GO sem contrato de lookup continua com resultado explícito de não suportado.'], related=['TRA-002','R2-API-022'], limitations='Leitura estática, sem baixar áudio real, usar segredo ou acessar Evolution. Credencial global é antecedente TRA-002 e não é recontada como novidade.')

add(35, 'Timestamp não assinado permite repetir conversões Talk X fora da janela de frescor', 'P2', 'confirmed_static',
    'Endpoint Talk X publicado com a configuração versionada pública e secret de conversão configurado; alguém obtém um corpo e uma assinatura válidos de conversão. Para inflação repetida, external_ref está ausente e os demais campos são válidos: source permitida, currency/occurred_at não nulos e recipient existente. Não se pressupõe conhecimento do segredo por quem reapresenta o evento.',
    'O handler verifica timestamp de header em ±5 minutos, mas calcula o HMAC somente sobre rawBody. A assinatura capturada continua válida com qualquer timestamp novo. P25 aceitou o request original; 24 horas depois recusou o timestamp antigo (401), aceitou o mesmo body/HMAC com timestamp novo (200) e recusou body alterado (401). A RPC final só deduplica (campaign_id,source,external_ref) quando external_ref é não nulo; sem referência cada INSERT pode criar outra conversão.',
    'A janela anunciada não limita a repetição de um evento assinado capturado. Com external_ref nulo, a contagem/valor atribuído à campanha pode ser inflado por replays, dentro do rate limit. Com external_ref presente, o índice continua impedindo a duplicação daquele identificador, embora o defeito de frescor permaneça.',
    [ev('supabase/functions/talkx-link/index.ts', 107, 120, 'unsigned freshness header and HMAC over body'), ev('supabase/functions/talkx-link/index.ts', 165, 175, 'nullable external_ref forwarding'), ev('supabase/config.toml', 65, 66, 'public conversion/click endpoint'), ev('supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql', 115, 117, 'partial dedupe index'), ev('supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql', 334, 355, 'valid-source guard and nullable-ref insert')],
    ['Assinar versão + timestamp + identificador de evento + corpo numa representação canônica acordada com o emissor.', 'Requerer identidade estável do evento e deduplicá-la de forma atômica; tolerância de relógio não substitui dedupe.', 'Corpo/assinatura capturados não são aceitos após trocar somente o timestamp.', 'Controlar replay dentro e fora da janela com e sem referências opcionais; usar payload completo válido para não mascarar o teste com R2-API-036.'], probes=['P25'], related=['R2-API-036'], limitations='HMAC real e relógio em memória; não foi capturado evento real nem enviado request público. O handler/RPC mapping foi executado com banco simulado; nulidade/unicidade foram confirmadas pela leitura SQL e pela frente database, sem executar PostgreSQL.')

add(36, 'Conversão Talk X fornece defaults que a RPC final rejeita', 'P2', 'confirmed_static',
    'Request de conversão tem HMAC e timestamp válidos e recipient existente, mas omite source, currency ou occurred_at, todos opcionais no contrato do handler. A RPC final no pin é a definição de 20261002691230.',
    'A Edge usa source="webhook" quando ausente, enquanto a função SQL permite whatsapp/manual/import/api/checkout e rejeita webhook. Para currency e occurred_at o chamador passa null explícito, anulando os defaults BRL/now() da assinatura SQL e colidindo com NOT NULL das colunas. P26 executou o handler mínimo e capturou {source:webhook,currency:null,occurred_at:null}; a fronteira simulada com a allowlist SQL devolveu 422.',
    'Uma conversão conforme os campos opcionais do endpoint falha antes de gravar. Corrigir somente source ainda deixa falhas de currency/occurred_at; o resultado de source inválida é chamado invalid_value, e violações de nulidade caem no erro genérico de conversão.',
    [ev('supabase/functions/talkx-link/index.ts', 126, 135, 'optional input fields'), ev('supabase/functions/talkx-link/index.ts', 165, 194, 'incompatible defaults and error mapping'), ev('supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql', 109, 125, 'column defaults and NOT NULL'), ev('supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql', 297, 306, 'RPC parameter defaults'), ev('supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql', 334, 352, 'source allowlist and INSERT')],
    ['Adotar uma origem padrão permitida ou tornar a origem obrigatória e validar o enum na Edge.', 'Omitir argumentos opcionais para aplicar os defaults SQL, ou fornecer BRL e um instante válido explicitamente.', 'Testar payload mínimo, campos individualmente omitidos e payload completo contra o mesmo contrato final da RPC.', 'Resposta de validação identifica o campo incompatível e não anuncia conversão registrada.'], probes=['P26'], limitations='Não há consumidor frontend de conversão identificado; é um endpoint para integração externa. O probe captura a tradução real e simula somente a rejeição de source; não reivindica execução de constraints no banco.')

add(37, 'Diagnóstico por conexão usa o tráfego global para declarar saúde', 'P2', 'confirmed_static',
    'Duas conexões existem; há tráfego em apenas uma delas no último período. As consultas ao provedor retornam status/configuração suficientes para o handler alcançar o cálculo de fluxo. O painel de monitoramento chama este endpoint.',
    'Dentro do loop por conexão, o SELECT em messages filtra somente created_at. Conta as mesmas linhas globais para cada instância, sem whatsapp_connection_id e sem agregação completa. P27 forneceu uma mensagem inbound apenas de A e nenhuma de B; ambos os diagnósticos retornaram incoming=1 e flowHealth=healthy.',
    'Uma conexão sem recebimentos pode ser apresentada como saudável graças às mensagens de outra. O score geral incorpora esse resultado e dificulta detectar uma integração isoladamente parada. Não se afirma que o provedor B esteja fora do ar apenas porque não recebeu mensagens; o defeito é atribuir a B o tráfego de A.',
    [ev('supabase/functions/webhook-diagnostic/index.ts', 59, 67, 'per-instance loop'), ev('supabase/functions/webhook-diagnostic/index.ts', 154, 168, 'unscoped message flow'), ev('supabase/functions/webhook-diagnostic/index.ts', 215, 227, 'overall health derived from flow'), ev('src/components/monitoring/hooks/useMonitoringActions.ts', 75, 85, 'active diagnostic consumer')],
    ['Filtrar cada agregado pela conexão resolvida e usar contagem de banco sem depender do teto de rows retornadas.', 'Conexão ausente/desconhecida recebe diagnóstico indeterminado e não herda métricas globais.', 'Fixture com tráfego somente em A não aumenta contagem ou saúde de B.', 'Distinguir ausência de tráfego de falha de transporte; não inventar disponibilidade a partir de volume zero.'], probes=['P27'], related=['R2-API-001'], limitations='Provider/status/config são fixtures válidas, contagens e loop são handler real. Nenhum estado real de saúde foi medido. A autorização do endpoint está em API001 e não é contada de novo.')

add(38, 'Relatório Talk X transforma destinatários ignorados fora da página em pendentes', 'P2', 'confirmed_static',
    'Campanha do próprio solicitante tem mais de 2000 destinatários, ou ultrapassa um teto menor do PostgREST, e há recipients skipped fora do subconjunto carregado. Há e-mail do criador e Resend configurado para o envio. O botão de relatório está disponível para completed/paused.',
    'O handler carrega no máximo 2000 status e usa somente esse array para contar skipped; total/sent/failed vêm de agregados da campanha inteira. pending é total-sent-failed-skipped parcial. P28 executou o handler com campanha concluída e 2500 skipped: o e-mail interceptado mostrou 2000 ignorados e 500 pendentes, embora a fixture tivesse zero pending.',
    'O relatório enviado informa backlog inexistente e uma contagem incompleta de ignorados. O limite explícito de 2000 basta para reproduzir; não depende de presumir que o PostgREST implantado usa o padrão de 1000.',
    [ev('supabase/functions/talkx-report/index.ts', 94, 112, 'capped status page and mixed-scope KPI'), ev('supabase/functions/talkx-report/index.ts', 136, 140, 'email labels and counts'), ev('src/components/talkx/TalkXCampaignRunning.tsx', 714, 726, 'completed/paused report button')],
    ['Calcular todas as classes no servidor no mesmo conjunto/instante ou paginar até completar a campanha.', 'Usar o estado real pending/sending em vez de inferir todos os estados restantes como pendência; definir tratamento explícito de cancelled/outcome_unknown.', 'Campanha concluída com 2500 ignorados reporta 2500 ignorados e zero pendentes.', 'Totais incompletos não são enviados como relatório completo.'], probes=['P28'], related=['R2-API-030'], limitations='Handler completo com auth/banco/Resend simulados; nenhum e-mail enviado. O report atual não oferece botão para cancelled; a correção de taxonomia no aceite não é usada para afirmar esse caminho de UI.')

add(39, 'Resposta e polling antigos misturam identidades no diálogo de QR Code', 'P2', 'confirmed_static',
    'Operador abre a conexão A, fecha o diálogo e abre B antes de connect/status de A terminar. As respostas do provedor chegam fora de ordem; ambas as conexões existem e o fluxo de QR está disponível.',
    'handleShowQrCode aplica o resultado de connect ao estado atual sem conferir a conexão; startStatusPolling ignora seu parâmetro connectionId e também aplica status ao diálogo atual. P29 executou os callbacks completos: QR de A apareceu sob connectionId/nome de B; depois um status open de A marcou B conectada e anulou a referência do intervalo de B. Fechar B deixou esse intervalo sem referência ativa para cancelamento.',
    'O operador pode escanear o QR de uma instância acreditando configurar outra ou receber confirmação de conexão da instância errada. Além da identidade incorreta na UI, polling pode continuar após fechar o diálogo. Não se afirma que o teste tenha estabelecido sessão real ou alterado credenciais.',
    [ev('src/hooks/inbox/useConnectionsManager.ts', 177, 216, 'startStatusPolling and handleShowQrCode'), ev('src/hooks/inbox/useConnectionsManager.ts', 280, 283, 'closeQrDialog'), ev('src/components/connections/ConnectionsView.tsx', 108, 117, 'dialog identity and QR renderer')],
    ['Associar cada connect/status e timer à conexão e a uma geração de abertura, verificando ambos antes de qualquer alteração de estado.', 'Fechar ou trocar a conexão invalida respostas pendentes e encerra o timer de sua própria geração.', 'Repetir a corrida A→fechar→B com respostas invertidas: B nunca exibe QR/status de A e não resta polling após fechar.'], probes=['P29'], limitations='Probe de callbacks completos com estados/ref React, promises e timers em memória; efeitos de montagem e rede real não foram executados.')

add(40, 'Editor de privacidade envia padrões locais sem carregar a configuração atual', 'P2', 'confirmed_static',
    'A conta tem campos de privacidade mais restritos do que os padrões locais; operador abre Configurações da instância e altera apenas um campo de privacidade. A leitura backend atual pode ser bem-sucedida.',
    'InstanceSettingsDialog inicializa privacy com valores fixos e carrega somente settings/profile/labels. Salvar envia todos os campos de privacy. O handler update-privacy prefere cada string enviada ao snapshot atual; assim o snapshot GO não preserva campos que a UI já preencheu com defaults. Em v2 o corpo completo também é encaminhado.',
    'Salvar uma alteração pontual pode abrir outras opções que o usuário não pretendia alterar. O formulário apresenta valores locais como se fossem o estado atual. Este caminho independe do erro de GET descrito em R2-API-014.',
    [ev('src/components/connections/InstanceSettingsDialog.tsx', 40, 66, 'hardcoded privacy state and load effects'), ev('src/components/connections/InstanceSettingsDialog.tsx', 111, 113, 'full privacy payload'), ev('src/hooks/evolution/useEvolutionIntegrations.ts', 20, 20, 'updatePrivacySettings forwarding'), ev('supabase/functions/evolution-api/index.ts', 771, 799, 'merge and v2 forwarding')],
    ['Carregar a configuração atual autorizada antes de permitir salvamento, ou manter campos desconhecidos e enviar somente os efetivamente alterados.', 'Troca de instância invalida o snapshot anterior; falha de leitura é visível e não fabrica valores atuais.', 'Conta com profile/online/last restritos permanece restrita ao alterar somente readreceipts.'], related=['R2-API-014'], limitations='Não houve leitura de configurações reais de conta. Difere de R2-API-014 pela origem dos valores indevidos na UI mesmo com GET bem-sucedido.')

add(41, 'Desativar integração esconde o único botão capaz de persistir a desativação', 'P2', 'confirmed_static',
    'Integração suportada pelo provedor, por exemplo Typebot em v2, está ativa e é carregada pelo diálogo. Operador desliga o switch Ativado.',
    'IntegrationForm altera apenas values.enabled via setter local. Campos, Salvar e Remover só são renderizados quando enabled é verdadeiro. Ao desligar, a ação de persistência desaparece antes de poder enviar enabled=false; o callback onSave do pai é o único caminho que chamaria setTypebot/setChatwoot/etc.',
    'O diálogo fica visualmente desativado enquanto a integração remota continua ativa. O operador precisa reativar a UI para reencontrar os controles, e esse estado já não representa a desativação desejada.',
    [ev('src/components/connections/IntegrationsPanel.tsx', 54, 95, 'local switch and conditional save/delete'), ev('src/components/connections/IntegrationsPanel.tsx', 224, 237, 'Typebot local setter and onSave'), ev('supabase/functions/evolution-api/index.ts', 802, 824, 'set integration accepts enabled false')],
    ['Manter a ação Salvar acessível para enabled=false ou persistir o toggle com feedback e reversão em caso de erro.', 'Teste de integração ativa comprova que desligar produz uma única alteração remota com enabled=false.', 'Reabrir o diálogo reflete o estado persistido e falhas não são apresentadas como desativação concluída.'], limitations='Não se usa integração indisponível no modo GO para afirmar este efeito; a precondição exige um backend que suporte a configuração.')

add(42, 'Envio e sincronização de grupos contam erro lógico do proxy como sucesso', 'P2', 'confirmed_static',
    'O proxy Evolution retorna HTTP 200 com envelope error=true para rejeição/indisponibilidade do provedor; o cliente Supabase entrega error=null e data com esse envelope. Fluxo de grupos tem uma conexão válida.',
    'handleBroadcast descarta data e incrementa sent sempre que error de transporte é nulo; depois limpa a seleção. handleAutoSync também ignora error=true, converte o envelope em array vazio e exibe sucesso. P30 executou o hook completo com erro sintético do provedor: enviou toast Mensagem enviada para 1 grupo(s) e limpou a seleção; sync informou 0 grupo(s) sincronizados como sucesso.',
    'O usuário recebe confirmação de entrega ou sincronização que não ocorreu. A limpeza dos alvos dificulta distinguir falha de aceite e torna uma nova tentativa menos segura. Erros de upsert também são apenas logados, sem entrar em totalErrors.',
    [ev('src/hooks/groups/actions.ts', 33, 61, 'auto sync response and upsert accounting'), ev('src/hooks/groups/actions.ts', 88, 107, 'broadcast response and selection clearing'), ev('supabase/functions/_shared/evolution-api-proxy.ts', 193, 217, 'HTTP200 error envelope'), ev('src/hooks/evolution/useEvolutionApiCore.ts', 31, 39, 'shared caller correctly rejects error=true'), ev('src/hooks/chat/useGroupsManager.ts', 35, 37, 'active groups actions consumer')],
    ['Usar um único decodificador de erro de transporte, erro lógico e resultado indeterminado do provedor.', 'Envelope error=true nunca incrementa enviados nem emite sucesso de sincronização.', 'Manter identificação dos alvos recusados para nova tentativa e preservar separadamente os já aceitos.', 'Contabilizar falhas de persistência no resultado parcial da sincronização.'], probes=['P30'], limitations='O probe intercepta invoke e não envia mensagens. Não afirma que aceite HTTP do provedor já comprova entrega ao destinatário.')

add(43, 'Painel de saúde exclui chamadas de IA registradas fora de ai-proxy', 'P2', 'confirmed_static',
    'Há ai_usage_logs recentes e visíveis de funções que usam generateWithRouting, como voice-agent ou ai-auto-tag, mas nenhuma linha function_name=ai-proxy na janela de 24 horas.',
    'AIProviderHealthPanel filtra somente ai-proxy. A geração central grava o nome da função chamadora em function_name. Quando o filtro não encontra linhas, a UI Saúde dos Provedores declara que nenhuma chamada de IA foi observada nesta janela. A falha da consulta também não tem renderização de erro própria: isLoading termina e data conserva o default vazio.',
    'Atividade e falhas efetivamente registradas pelas funções modernas ficam invisíveis no painel geral de provedores, podendo ser interpretadas como ausência de uso. O limite de 50 é explicitamente apresentado como amostra e não é, por si só, um achado de contagem completa.',
    [ev('src/components/settings/ai-providers/AIProviderHealthPanel.tsx', 47, 65, 'ai-proxy-only query and no error state'), ev('src/components/settings/ai-providers/AIProviderHealthPanel.tsx', 178, 199, 'general no-observation claim'), ev('supabase/functions/_shared/ai-generate.ts', 674, 693, 'caller function name in usage log'), ev('supabase/functions/voice-agent/index.ts', 109, 113, 'voice-agent function name'), ev('src/components/settings/AIProvidersManager.tsx', 92, 93, 'health panel mounted')],
    ['Definir o escopo do painel e incluir os logs das funções/provedores que ele afirma monitorar, ou rotular explicitamente a cobertura restrita.', 'Mostrar erro de leitura separadamente de uma consulta bem-sucedida sem observações.', 'Fixture com apenas logs de voice-agent/ai-auto-tag deve produzir observações no painel geral e preservar a indicação de amostra.'], limitations='Não se afirma que as taxas deveriam representar toda a população; o próprio painel documenta uma amostra. Não foram consultados logs reais.')

add(44, 'Aquecimento e limite de número têm configuração local sem motor identificado', 'P2', 'gap',
    'Operador usa Aquecer em uma linha de number_reputation e espera progressão diária/controle do limite mostrado. A análise cobre o checkout, os workers de envio e a cadeia de migrations; eventual serviço externo não versionado não foi observado.',
    'startWarmup somente grava warmup_status=active, warmup_day=1 e daily_limit=20, ignora error e anuncia Aquecimento iniciado. Não há consumidor de number_reputation localizado em Edge/scripts nem função SQL vigente que atualize progresso/consumo; a tabela possui trigger de updated_at. A tela ainda afirma população automática e apresenta o limite como progresso operacional.',
    'O aceite de aquecimento/limite não é demonstrado pelos artefatos. Na implantação composta só por estes componentes, a configuração não produz progressão nem fiscalização desse limite. Uma escrita recusada também recebe mensagem de sucesso.',
    [ev('src/components/connections/NumberReputationMonitor.tsx', 32, 63, 'reads and startWarmup write'), ev('src/components/connections/NumberReputationMonitor.tsx', 101, 105, 'automatic data promise'), ev('src/components/connections/NumberReputationMonitor.tsx', 139, 168, 'warmup day and daily limit UI'), ev('supabase/migrations/20260409014536_3a836b4b-1e37-411c-b8af-45d918304272.sql', 142, 166, 'reputation DDL and generic updated_at trigger')],
    ['Identificar e versionar o motor que cria reputação, renova contadores, progride dias e aplica limites, ou apresentar a tela como configuração sem execução disponível.', 'Com relógio/controlador offline, demonstrar progressão de dia e recusa além de 20 no primeiro dia sem criar duplicação de envios.', 'Verificar error da atualização antes de anunciar início.'], limitations='Gap do conjunto versionado, não prova de ausência de N8N/VPS/serviço externo em produção. A frente database confirmou a ausência de consumidor na cadeia vigente; esta frente não atribui a si leitura integral das migrations.')

add(45, 'Mensagem automática fora do expediente é persistida sem consumidor de entrega identificado', 'P2', 'gap',
    'Administrador habilita a mensagem de ausência por conexão e um cliente entra em contato fora do expediente. As funcionalidades auditadas são as que estão versionadas no HEAD; automação externa não foi inspecionada.',
    'BusinessHoursDialog promete envio automático e useBusinessHours salva content/is_enabled em away_messages. A busca completa em Edge/scripts não encontra leitura dessa tabela. A revisão SQL paralela encontrou somente DDL/policies/updated_at, nenhuma função vigente de consumo ou envio. O webhook inbound percorrido não consulta away_messages.',
    'O ciclo configuração→evento fora do horário→entrega não está implementado ou demonstrado pelos artefatos fornecidos. Salvar configurações pode funcionar corretamente sem produzir a resposta que o diálogo promete.',
    [ev('src/components/connections/BusinessHoursDialog.tsx', 212, 230, 'automatic outside-hours promise and controls'), ev('src/hooks/business/useBusinessHours.ts', 102, 119, 'away_messages persistence'), ev('supabase/migrations/20251220181300_aa931cb8-3812-4396-983e-123d19f73ad8.sql', 15, 23, 'away_messages DDL'), ev('supabase/migrations/20251220181300_aa931cb8-3812-4396-983e-123d19f73ad8.sql', 87, 96, 'updated_at-only original triggers')],
    ['Versionar ou documentar com evidência o consumidor real, sua resolução de conexão/fuso, idempotência e entrega.', 'Aceite controlado comprova uma resposta à primeira entrada fora do horário, nenhuma resposta quando desabilitada e nenhuma duplicação no replay.', 'A UI deve representar disponibilidade operacional separada da simples persistência da configuração.'], related=['R2-API-017'], limitations='Não afirma ausência de automação externa. As falhas de gravação de useBusinessHours são propagadas por mutateAsync e a UI aguarda: não há achado adicional de falso sucesso de salvamento neste fluxo.')

add(46, 'Exclusão de provedor promete fallback automático que o roteamento não executa', 'P2', 'confirmed_static',
    'Administrador remove com sucesso o único provedor ativo e default para uma finalidade. Não resta outro provedor que satisfaça ativo/default/use_for; a próxima função utiliza a seleção por finalidade do roteamento central.',
    'A confirmação afirma que as funcionalidades serão automaticamente redirecionadas a Lovable AI. deleteMutation apenas remove a linha e invalida a query. O único trigger de seleção de default é BEFORE INSERT OR UPDATE e só desmarca sobreposições, sem eleger sucessor no DELETE. O roteador então encontra zero candidatos e lança NO_PROVIDER.',
    'O administrador aprova uma remoção sob promessa de continuidade, mas pode interromper todas as funções que dependiam daquele default. A existência de uma linha Lovable que não esteja ativa/default para a finalidade não satisfaz o predicado.',
    [ev('src/components/settings/ai-providers/AIProviderCard.tsx', 129, 141, 'deletion fallback promise'), ev('src/components/settings/ai-providers/useAIProviders.ts', 106, 115, 'delete only mutation'), ev('supabase/functions/_shared/ai-routing.ts', 185, 197, 'zero default candidates throws'), ev('supabase/migrations/20260408194438_1ad57139-c089-4711-86e1-71d8f461e02d.sql', 54, 82, 'only updated_at and insert/update default trigger')],
    ['Antes de remover o default, exigir ou escolher explicitamente um sucessor válido para cada finalidade afetada, com persistência coerente.', 'Se o produto permite ficar sem provedor, informar as funções que serão interrompidas e remover a promessa automática.', 'Excluir o único default nunca resulta em continuidade anunciada seguida de NO_PROVIDER; testar também sucessor inativo e use_for sem a finalidade.'], limitations='A exclusão precisa ser aceita; não se presume contorno de FK/RLS. A cadeia SQL vigente e ausência de trigger DELETE foram conferidas pela frente database; não houve alteração real de configuração.')

# Additional loci discovered in the second pass extend the same security
# boundary findings instead of manufacturing a separate P1 per endpoint.
control = next(f for f in findings if f['id'] == 'R2-API-001')
control['preconditions'] += ' Em webhook-diagnostic, considera-se conservadoramente usuário válido admitido pelo gateway, com a condição de auto-fix satisfeita; o handler não autentica nem autoriza.'
control['observed_behavior'] += ' webhook-diagnostic é um segundo caminho de controle: cria service client, lê todas as conexões e aceita action=auto-fix sem gate local, realizando POST de configuração do webhook quando o diagnóstico retorna critical/warning.'
control['impact'] += ' O diagnóstico também expõe telefones/status/configurações de todas as conexões ao chamador admitido e pode alterar a configuração pela ação de reparo.'
control['evidence'] += [ev('supabase/functions/webhook-diagnostic/index.ts', 28, 62, 'unguarded global diagnostic'), ev('supabase/functions/webhook-diagnostic/index.ts', 170, 204, 'auto-fix provider POST'), ev('src/components/monitoring/hooks/useMonitoringActions.ts', 75, 85, 'diagnostic and repair consumer')]
control['acceptance'] += ['Aplicar a mesma autorização de controle ao auto-fix e às leituras sensíveis de diagnóstico; o reparo não é uma exceção ao gate.']
privileged = next(f for f in findings if f['id'] == 'R2-API-022')
privileged['title'] = 'Rotinas de e-mail, relatório, encerramento e recuperação executam privilégio de servidor sem autorizar o chamador'
privileged['preconditions'] += ' Para recuperação de áudio, há mensagens elegíveis e credenciais de Storage/provedor; dry_run pode retornar metadados mesmo sem recuperação.'
privileged['observed_behavior'] += ' recover-corrupted-audios também não tem auth/role/segredo de cron: varre áudio global, aceita batch_size/offset/dry_run do chamador e, por padrão, tenta sobrescrever Storage e media_url. dry_run revela a instância e uma amostra de IDs externos.'
privileged['impact'] += ' A rotina de recuperação permite iniciar trabalho e alterações globais de mídia fora do papel administrativo.'
privileged['evidence'] += [ev('supabase/functions/recover-corrupted-audios/index.ts', 42, 61, 'unguarded service selection'), ev('supabase/functions/recover-corrupted-audios/index.ts', 83, 87, 'dry-run metadata'), ev('supabase/functions/recover-corrupted-audios/index.ts', 119, 125, 'storage overwrite and message update')]
privileged['acceptance'] += ['Recuperação de mídia exige autorização administrativa antes de scan/download/upload, incluindo dry_run; migrate-media-storage já possui gate administrativo e é controle negativo desta revisão.']

for finding in findings:
    finding['related_findings'] = [i.replace('MX-08', 'MX08').replace('MX-05', 'MX05') for i in finding['related_findings']]
    finding['preconditions'] = finding['preconditions'].replace('MX-08', 'MX08')

# Explicitly separate previously reported behavior from new findings.
prior = [
    dict(id='TRA-002', outcome='reconfirmed', note='Fallback para credencial global continua em proxy/evoFetch/message-delivery. Não recontado como novidade.'),
    dict(id='TRA-003', outcome='reconfirmed_scope', note='Helper de estado e caminho de status possuem normalizações diferentes; sem novo ID para a falha já registrada.'),
    dict(id='TRA-004/TRA-005', outcome='reconfirmed_frontend', note='useConnectionsManager mantém duas atualizações de default sem verificar cada erro e exclusão local após falha de remoção remota; achados anteriores, não recontados.'),
    dict(id='TRA-006', outcome='not_recounted', note='Labels sem isolamento por instância permanecem antecedente; não duplicado.'),
    dict(id='MX01..MX09', outcome='rechecked_where_reachable', note='Worker integral confirmou migração parcial item/recipient, dispatch-level content/media, ausência de instance token e terminal 429. Achados existentes não foram clonados.'),
    dict(id='MX05', outcome='extended_locus', note='Talk X também trata HTTP429 como failed em process-recipient 505–512; indicado como extensão do padrão, não novo ID nesta contagem.'),
    dict(id='OTH-004/OTH-007', outcome='reconfirmed', note='Catálogo mantém ordenação sem desempate único e filtro is_new sem janela temporal; não recontados nesta frente.'),
    dict(id='OTH-003/OTH-005/OTH-006', outcome='not_recounted', note='Success 207 / paginação UI / sync manual são prévios; R2-API-011/012 tratam cursor de cron/webhook e anexos.'),
    dict(id='TEL reconciliation', outcome='reconfirmed', note='sync-call-records 34–40 usa primeiro candidato com sufixo9 e janela ±90; não recontado.'),
    dict(id='R2-DB-002', outcome='owned_by_database_agent', note='Atribuição TalkX/Multiplix por OR/sufixo8, sem prioridade de contato/conexão e reutilização de mensagem: evidência/ID SQL pertencem à frente database.'),
    dict(id='R2-DB-004', outcome='cross_confirmed_caller', note='generateWithRouting deriva chave estável do conteúdo, volta a chamar provedor após reserve e settle uma reserva já encerrada não reconta orçamento. SQL e achado único pertencem à frente database; ai_usage_logs é contabilidade separada.'),
    dict(id='R2-DB-014', outcome='cross_confirmed_caller', note='Cancelamento limpa token durante POST; process-recipient falha record_sent e a falha de complete(outcome_unknown) pode impedir enqueueRecipientReconciliation. Corrida consolidada pela frente database, sem alegar duplicação automática.'),
    dict(id='R2-DB-015', outcome='cross_confirmed_caller', note='Retry de recipient outcome_unknown mantém provider_dispatch_started_at e a seleção normal o exclui; o claim direto possui outra regra. Achado de fila estacionada pertence à frente database, não é envio duplicado automático.'),
    dict(id='R2-COM-009/R2-COM-010', outcome='delegation_completed_by_root', note='gmail-oauth foi revisto integralmente pela frente communication/root: state ausente/inválido não barra exchange e escritas storeTokens/disconnect não verificam erro. Somente referência, sem duplicar achados ou atribuir a leitura a providers.'),
    dict(id='R2-AUTH-035', outcome='frontend_delegation', note='useWhatsAppStatus e consumidores de perfil/status ficaram com auth: conversão de notSupported GO em vazio e estado fixo Offline não foram duplicados nesta frente.'),
]

data = dict(schema_version=1, status='second_pass_checkpoint', head=HEAD,
    source_root=str(ROOT), baseline=BASELINE, post_baseline_commits=[X028, HEAD],
    scope='Provider backend Edge Functions, shared contracts and assigned connections/integrations/AI-provider frontend; source unchanged; no live DB or provider probes',
    findings=findings, prior_findings_rechecked=prior,
    verification=dict(offline_probes=30, actual_network_requests=0, actual_database_requests=0,
        actual_environment_reads=0, source_changes=0,
        source_provenance='verify-source.mjs validates actual HEAD and all versioned supabase/functions/** bytes plus config before any application import against source-integrity.json',
        files=['verify-source.mjs', 'reproduce.mjs', 'probe-results.json', 'reproduce-provider-control.mjs', 'provider-control-probe-results.json','reproduce-privileged-effects.mjs','privileged-effects-probe-results.json','reproduce-multiplix-review.mjs','multiplix-review-probe-results.json','reproduce-media-ai-control.mjs','media-ai-control-probe-results.json','reproduce-final-endpoints.mjs','final-endpoints-probe-results.json','reproduce-frontend-providers.mjs','frontend-providers-probe-results.json']),
    limitation='Static and deterministic offline evidence. Runtime deployment, credentials, logs, real provider payload versions and external schedulers were not inspected.')
OUT.mkdir(parents=True, exist_ok=True)
(OUT/'findings.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')

# Coverage is range-based; a caller's entire body is not marked reviewed merely
# because a helper call or an import was inspected.
reviewed = {}
def cover(path, ranges, symbols, note=''):
    p = ROOT/path
    count = len(p.read_text().splitlines())
    full = ranges is None
    ranges = [(1,count)] if full else ranges
    for a,b in ranges: assert 1 <= a <= b <= count, (path,a,b,count)
    reviewed[path] = dict(path=path, head=HEAD, sha256=sha256(p.read_bytes()).hexdigest(),
        line_count=count, level='semantic_full_file' if full else 'semantic_selected_ranges',
        reviewed_ranges=[dict(line_start=a,line_end=b,symbols=symbols) for a,b in ranges], note=note)

F='supabase/functions/'
full_files = {
'evolution-webhook/index.ts':['request gate','GO translation dispatch','all event switch branches','response/error'],
'_shared/evolution-webhook-msg-handlers.ts':['handleSendMessage','handleMessagesUpdate','handleMessagesDelete','handleMessagesSet','handleMessagesEdited'],
'_shared/evolution-webhook-messages.ts':['normalizeOptOutText','loadOptOutKeywords','matchOptOutKeywordLocal','resolveOptOutKeyword','loadOptOutAutoreply','extractInteractiveResponseId','extractQuotedExternalId','persistIncomingMedia','enrichIncomingLinkPreview','handleOutgoingWhatsAppMessage','handleIncomingMessage','handleStickerMedia','handleAudioTranscription'],
'_shared/evolution-helpers.ts':['normalizePhone','resolveBestJid','resolveEventJid','normalizeEventName','toEventRecords','shouldUpdateStatus','getConnectionByInstance','getContactByPhone','fetchProfilePicFromApi','persistProfilePicture','handleReactionEvent'],
'_shared/evolution-go-adapter.ts':['isGoPayload','translateGoPayload','message','receipt','historysync','presence','contact','label','call normalization'],
'_shared/evolution-go-routes.ts':['translateV2ToGo','quotedToGo','media/presence','instance','groups','profile','webhook routes'],
'_shared/evolution-send.ts':['evoFetch','extractMessageId','extractConnectionState'],
'_shared/evolution-media.ts':['isValidMediaBytes','persistMediaToStorage','persistBase64Media','persistMediaViaApi','parseMessageContent'],
'_shared/evolution-api-proxy.ts':['normalizeGoSendResponse','normalizeGoResponse','circuit breaker','proxyToEvolution','private object parsing/signing'],
'evolution-api/index.ts':['global auth','requireAdmin','stripInstanceToken','bootstrap','create compensation','connect/QR recovery','status/disconnect','all proxy action branches','update-privacy'],
'message-delivery/index.ts':['readMessageId','providerPayload','failClaim','enqueueDeliveryReconciliation','handleMessageDeliveryRequest'],
'_shared/talkx-reply.ts':['attributeTalkXReply','attributeMultiplixReply'],
'_shared/talkx-window.ts':['parseBusinessHours','localClockInTimezone','deliveryWindowStatus'],
'_shared/talkx-resume-policy.ts':['pauseReasonForWindow','connectionStatusResolver','selectResumableCampaigns'],
'talkx-scheduler/index.ts':['cron authentication','due and paused selection','connection resolution','budgeted resume','worker trigger'],
'talkx-send/process-recipient.ts':['stableVariantHash','pickVariant','processRecipient: claim/snapshot/revalidation/media/send/quarantine/retry'],
'multiplix-send/index.ts':['authentication/ownership','connection/window','dailyRoom','list/claim item','snapshot','heartbeat','send','complete/quarantine/reschedule'],
'gmail-webhook/index.ts':['PubSub input','token helpers','body parser','history fetch','thread/message upsert','cursor/ACK'],
'_shared/gmail-helpers.ts':['tokens','gmailFetch','parseGmailAddressList','extractBody','extractAttachments','syncLabels','reconcileEmailThreads','syncMessageIds','syncMessages'],
'gmail-sync/index.ts':['auth/account','sync-labels','sync-inbox','sync-incremental','get-thread','setup-watch','get-attachment'],
'gmail-cron-sync/index.ts':['cron secret','parallel account batch','full and incremental sync','cursor updates'],
'gmail-send/index.ts':['auth/account','send/reply','MIME','sent persistence','draft CRUD','label/read/star/trash mutations'],
'crm-integration/index.ts':['canonical actor','permissions','stable identity lookup','requestSingu','processRows','contact lookup/intelligence/batch','email participant','enqueue'],
'_shared/crm-integration-contract.ts':['action/schema allowlists','external sync args','response normalization'],
'bitrix-api/index.ts':['authentication/admin','schema','CRUD/call mapping','sync_contacts','push_contact','create_lead_from_conversation'],
'whatsapp-webhook/index.ts':['verification GET','shadow POST','schema','statuses','incoming messages'],
'get-call-recording/index.ts':['auth','RLS-visible call','recording download and response'],
'sync-call-records/index.ts':['janelaDoCasamento','escolherCandidata','dadosDaReconciliacao','service auth','provider loop/update'],
'public-api/index.ts':['retirement kill switch and CORS'],
'get-mapbox-token/index.ts':['requireAuth','persistent per-user limit','public token response'],
'get-sip-password/index.ts':['JWT claims','own active profile','SIP configuration'],
'send-email/index.ts':['IP throttle','payload schema','fixed sender','Resend status handling'],
'send-scheduled-report/index.ts':['report lookup','all report variants','email loop','schedule update','calculateNextSend','buildReportEmail','formatKey'],
'auto-close-conversations/index.ts':['config','stale contact scan','message/closure insert','unassignment','counter response'],
'elevenlabs-webhook/index.ts':['blocking signature gate','event normalization','audit insert','event branches'],
'elevenlabs-scribe-token/index.ts':['requireAuth','persistent limit','single-use token request'],
'elevenlabs-agent-token/index.ts':['requireAuth','persistent limit','fixed agent token request'],
'elevenlabs-tts/index.ts':['auth/quota','schema','voice/model request','audio response'],
'elevenlabs-tts-stream/index.ts':['auth/quota','schema','voice/model stream','Response stream forwarding'],
'elevenlabs-sfx/index.ts':['auth/quota','music and SFX body mapping','provider status','base64 audio'],
'elevenlabs-dialogue/index.ts':['auth/quota','script schema','provider payload','audio response'],
'elevenlabs-sts/index.ts':['auth/quota','multipart fields','speech-to-speech request','buffer response'],
'elevenlabs-voice-design/index.ts':['auth/quota','preview','create','voice list fallback'],
'ai-jobs-worker/index.ts':['isAiGenerateEnabled','handleReapExpired','handleAiGenerate','HANDLERS','loadJobRows','renewLease','runBatch','handleAiJobsWorker'],
'_shared/cron-secret-auth.ts':['timing-safe match','cron RPC','service/user gate','unauthorizedResponse'],
'_shared/ai-jobs.ts':['state vocabulary','transition map','input/result parsers','service client','enqueueAiJob','claimAiJobs','heartbeatAiJob','finishAiJob','reapAiJobs','cancelAiJob'],
'_shared/effect-reconcile.ts':['payload validation','effect registry','stable enqueue','row state confirmation','provider history probe','applyConfirmed','markFailed','handleEffectReconcile'],
'external-db-proxy/index.ts':['canonical auth','external config','quarantine admin mutation','table/operator allowlists','select/filter/order/range','notConfigured mapping'],
'external-db-bridge/index.ts':['isOperationAllowed','classifySeverity','emitTelemetry','auth','allowlist reachability','SELECT/RPC','unreachable mutation branches','query error response'],
'evolution-sync/index.ts':['admin gate','instance requirement','all action dispatch','error response'],
'connection-health-check/index.ts':['cron/user gate','connection loop','provider state/CAS','alerts and Resend','health persistence','cleanup'],
'_shared/evolution-sync-actions.ts':['normalizeEvoContact','fetchEvolutionContacts','syncContacts','goHistoryNotSupported','syncMessages','syncAllMessages','setupWebhook','cleanupMock','fullSync','parseEvolutionMessage','jsonRes'],
'_shared/edge-boot.ts':['bootEdge','lazy service client and preflight evaluation'],
'_shared/ai-auth.ts':['bearerToken','isServiceRoleRequest','requireAiIdentity','requireAiIdentityOrService'],
'_shared/ai-audio-authz.ts':['assertMessageVisibleToCaller'],
'_shared/ai-guards.ts':['service client','windowStart','aiRateLimitScopeKey','sharedRateLimit','aiRateLimitTargets','checkSharedAiRateLimits','enforceAiGuards'],
'_shared/ssrf.ts':['ipv4Octets','isBlockedIpAddress','hasUnsafeRawStoragePathSegment','parseApprovedStorageUrl'],
'ai-transcribe-audio/index.ts':['downloadAudio','identity/user object gate','MIME','ElevenLabs multipart','fallback and response'],
'talkx-send/index.ts':['deriveTestSendKey','handleTalkxSend','cron/service/admin auth','test claim idempotency and retry','pause/cancel','readConnectionStatus','loadBusinessHoursAndDailyLimit','countSentTodayForConnection','loadConnectionBudget','loadTrackingLinks','loadLinkLabels','loadKnownCustomFieldNames','loadCampaignTemplateTexts','loadCustomFieldsByContact','isRecipientSuppressed','pauseCampaign','refreshBudget','runRecipient','buildEngineState','continue claim/budget loop/completion/finally release','start validation/transition/kick'],
'_shared/evolution-webhook-handlers.ts':['handleConnectionUpdate','handleContactsUpsert','handlePresenceUpdate','handleChatsUpdate','handleLabelsEdit','handleLabelsAssociation','handleCallEvent','handleChatsDelete','handleApplicationStartup','handleContactsSet','handleChatsSet'],
'multiplix-dispatch/index.ts':['draft.create','draft.get','draft.update','draft.discard','HANDLERS','DispatchError','handleMultiplixDispatchRequest','requireAuth and rate limit','service client'],
'multiplix-dispatch/actions/audience.ts':['hasAnyFilter','idSet','unionCandidates','applyExclusions','isRowExcluded','hasPrimaryFlag','contactRoleOf','selectPrimaryPerCompany','userHasPermission','resolveAudienceScope','withTimeout','materializeFilteredCompanyIds','buildExternalAudienceSource','handleAudienceSelect'],
'multiplix-dispatch/actions/blocks.ts':['asObject','stableStringify','mergeContent','assetInputsChanged','guardEditableDispatch','nextBlockOrder','handleBlocksUpsert','handleBlocksDelete','handleBlocksReorder'],
'multiplix-dispatch/actions/inspect.ts':['schemas','resolveProfileId','loadOwnedDispatch','notFoundDispatch','loadBlocks','loadRecipients','loadRecipient','asString','asRecord','isBlockType','content/voice/media/block text helpers','isSharedAudio','isVoiceBlock','mediaKindFromUrl','variablesOf','timezoneOf','blocksForReview','renderForRecipient','buildAsset','buildPreviewBlocks','handlePreview','placeholderKeys','evaluatePlaceholder','validateBlock','handleValidate','storedClass','hasCompany','hasPerson','classOf','bucketForRecipient','inclusionReasonFor','buildQueryPhrase','summarize','handleEligibilitySummary','estimate','handleEstimate'],
'multiplix-dispatch/actions/lifecycle.ts':['resolveScope','loadDispatch','fetchPaged','uuidOrNull','mapConfirmError','handleConfirm','emptyTally','tally','groupItems','handleStatus'],
'multiplix-dispatch/actions/listing.ts':['resolveOwnerScope','handleDispatchList','handleRecipientsList','owner scope in WHERE','pagination/total/filters'],
'_shared/messaging/index.ts':['public exports'],
'_shared/messaging/phone.ts':['normalizePhone and generatePhoneVariants reexports','compile-time shape assignments'],
'_shared/messaging/timing.ts':['randomBetween','sleep'],
'_shared/validation.ts':['Logger','CORS','jsonResponse','sanitized error response','memory/persistent limiter','getClientIP','requireEnv','requireAuth','createAuthedClient'],
'_shared/messaging/media.ts':['bytesAt','asciiAt','asciiLower','isLikelyAsciiText','detectMediaKind','fail','failFromStatus','describeError','parseContentLength','parseContentRangeTotal','resolveMaxBytes','resolveTtlSeconds','resolveProbeBytes','resolveTimeoutMs','isSafeMediaFileName','hasControlChars','stripControlChars','resolveFileName','decodeSignedUrlExpiryMs','normalizeSignedUrl','resolveFetchUrl','readBody','hexPreview','prepareMedia'],
'_shared/messaging/eligibility.ts':['digitsOnly','isBlacklisted','eligibility'],
'_shared/messaging/errors.ts':['operatorMessageFor','bodyText','hasNumberNotExists','info','providerErrorInfo','classifyProviderError','operatorMessageForError','nextBackoff','planRetry'],
'_shared/messaging/evolution-go.ts':['capabilities','presenceForKind','getMediaEndpoint','MessagingError','delayFields','sendMediaBody','planMessage','authHeaders','postPresence','send'],
'_shared/messaging/personalize.ts':['getGreeting','formatDateInTimezone','personalize','personalizeMultiplix'],
'_shared/messaging/types.ts':['CorrelationId and public type reexports'],
'_shared/secure-random.ts':['secureRandomFloat'],
'_shared/multiplix-eligibility.ts':['eligibility vocabularies','isSinguEligibility','fromSinguEligibility'],
'ai-proxy/index.ts':['schema','ProviderConfigError','requireProviderSecret','present','asPlainConfig','ownConfig','chatProviderConfig','webhookProviderConfig','partModality','nonTextModality','capabilityNeedFromBody','errorText','bodyText','firstMessageContent','routingStatus','routingErrorResponse','timeoutOptions','dispatchProvider','runProviderTest','classifyDispatchError','classifyHttpFailure','isTestRequest','Deno.serve handler','loadFallbackTarget','coveredFallbackTarget','stream and usage response paths'],
'_shared/ai-usage.ts':['extractTokenUsage','normalizeCorrelationId','normalizeAttempt','textOrNull','normalizeModality','buildUsageMetadata','extractAiRequestId','extractUserIdFromRequest','resolveProfileId','logAiUsageDetached','logAiUsage','extrairUsageDoStream','medirStream','encerrar','pull/cancel','contaParaQuota','identidadeDaAcao','reconciliarConsumo','instante','tarifaAplicavel','calcularCusto'],
'ai-auto-tag/index.ts':['auth/quota','visible contact gate','message source','queue prompt','generation','output validation','tag payload/replacement','sentiment/priority update','queue membership authorization','urgent notification','envelope'],
'_shared/ai-response-contracts.ts':['canonical domain schemas','AutoTagOutput','ChatbotL1Output','parseModelOutput','buildAiEnvelope'],
'_shared/secure-egress.ts':['isEgressPayload','toHex','nonce','sign','decodeBody','validProxyEndpoint','getSecureEgressConfig','fetchPreviewViaSecureEgress'],
'_shared/postgrest-filters.ts':['escapeOrFilterValue'],
'_shared/talkx-delivery-connection.ts':['liveTalkXInstanceId'],
'_shared/ai-routing.ts':['AiRoutingError','nonEmptyString','isPlainObject','resolveProvider','resolveModel','composeMessages','filterConfigBody','filterExtraBody','filterHeaders'],
'_shared/ai-capabilities.ts':['AiCapabilityError','isPlainObject','readOwn','asUnknownArray','isModality','isFeature','providerLabel','declaredCapabilities','assertCapabilities'],
'_shared/ai-providers.ts':['callLovableAI','callOpenAICompatible','callCustomWebhook','isAbortError','isFetchTypeError','classifyFailure','backoffDelayMs','sleep','withRetry'],
}
full_files.update({
'_shared/ai-generate.ts':['resolveDefaultTimeoutMs','estimateAiTokens','serializeCanonico','compararCodeUnit','canonicalize','fnv1aHex','deriveAiIdempotencyKey','ProviderConfigError','errorText','errorName','isAbortOrTimeoutError','isPlainObject','asPlainObject','providerLabel','routingStatus','failureResponse','requireText','loadProviders','requireSecret','buildDispatch','resolveProviderByModalities','generateWithRouting: logUsage/finish/reserve/retry/release/settle'],
'_shared/ai-budget.ts':['errorText','logWarn','requireNonEmptyString','requireFiniteNumber','toSafeInt','firstRow','createServiceClient','fallbackOpen','reserveBudget','settleBudget','releaseBudget','reconcileBudget'],
'_shared/ai-values.ts':['isAbsent','normalizeScore','aggregateScores'],
'_shared/ai-vocabulary.ts':['tokenOf','hasOwn','isSentiment','normalizeSentiment','isUrgency','normalizeUrgency','urgencyToOperationalPriority','isOperationalPriority','normalizeOperationalPriority'],
'_shared/ai-json.ts':['extractJsonObject','parseJsonObject'],
'_shared/notification-events.ts':['normalizeEvolutionCallStatus','shouldNotifyIncomingCall','direcaoDaChamada','instanteDaChamada','deveNotificarChamada','normalizeEvolutionCallVideo','buildIncomingCallNotification','buildSentimentNotification','sentimentSettingsOwnerId','escapeHtml','singleLineLabel'],
'_shared/voice-copilot-authz.ts':['isReassignManager','decideReassignConversation'],
'_shared/contracts.ts':['getContractVersion','deprecationHeaders','parseVersioned'],
'_shared/deno-types.ts':['SupabaseClient','JsonRecord type-only declarations'],
'_shared/email-font-stack.ts':['EMAIL_FONT_STACK constant'],
'_shared/evolution-types.ts':['PromiseLike builder declarations','query rows/single/storage/channel types'],
'multiplix-audience/index.ts':['withTimeout','fetchAudienceList','MultiplixPolicyLimitError','planResolveBatches','compararCodeUnit','scopeSignaturePayload','signScope','resolveRecipientsInBatches','mapResolvedRecipients','handleMultiplixAudienceRequest','userHasPermission','routing/resolving/create_draft/error response'],
'multiplix-voices/index.ts':['grantReachesCaller','visibleGrants','canRecoverAsset','handleMultiplixVoicesRequest','list/sign owner and grant checks'],
'batch-fetch-avatars/index.ts':['handleBatchFetchAvatars','cron/user gate','global batch','markAttempted','provider/storage/update/count'],
'recover-corrupted-audios/index.ts':['isValidAudioBytes','getMediaBase64','handler','first connection selection','dry_run','global loop','storage and media_url update'],
'migrate-media-storage/index.ts':['admin gate','connection map','message selection','downloadAndUpload','getBase64Fallback','detectExtension','uploadToStorage','migrateSimple'],
'talkx-report/index.ts':['escHtml','jsonErr','handler caller/creator gate','recipient query','KPIs','fmtDate','email status handling'],
'talkx-link/index.ts':['handleTalkxLink','GET click/redirect/UTM','POST conversion HMAC/timestamp/body/schema/RPC','hashIp','mergeUtm'],
'_shared/gmail-mime.ts':['encodeUtf8Base64','encodeBase64Url','buildGmailMimeMessage','appendAlternativeBody','attachment and text/html alternatives'],
'_shared/webhook-signature.ts':['parseElevenLabsSignature','verifyElevenLabsSignature'],
'voice-agent/index.ts':['TranscriptSchema','sanitizeResult','authenticated handler','tools/generation/result parsing','degraded answer'],
'voice-changer/index.ts':['VOICE_PRESETS','user rate gate','multipart input','provider speech-to-speech','audio response'],
'voice-copilot-action/index.ts':['auth/caller client','search_contacts','get_conversation_summary','get_dashboard_metrics','assign_conversation','create_note','list_agents','get_queue_status','default/error'],
'sentiment-alert/index.ts':['handleSentimentAlertRequest','analysis visibility','settings owner','latest/consecutive score guards','atomic persistence','duplicate path','email status and response'],
'fetch-link-preview/index.ts':['dbCacheGet','dbCacheSet','hashUrl','cacheGet','cacheSet','decodeEntities','extractMeta','extractTitle','absolutize','fetchPreview','handler cache/proxy/error'],
'webhook-diagnostic/index.ts':['normalizeWebhookEvents','handler','connection scan','status lookup/fallback','GO/v2 webhook diagnosis','global message counts','auto-fix','score aggregation/error'],
'promogifts-catalog/index.ts':['stripDiacritics','sanitizeSearch','sanitizeFtsQuery','buildTagOrExpr','checkRateLimit','externalDatabaseErrorResponse','createExternalCatalogClient','promogiftsCatalogHandler','list_products/buildProductsQuery','get_product','list_categories','list_suppliers','bootstrap','catalog_stats'],
})
for p,s in full_files.items(): cover(F+p,None,s)
cover(F+'_shared/schemas.ts',None,['common/context/AI/ElevenLabs/Email/Gmail/WebAuthn/bridge/webhook/header schemas','measureConversationContext','withConversationBudget','toInstant','evaluateContextVersionSupersession','revalidateContextBeforeEffect','contextCancelledEnvelope','toFieldErrors','parseBody','validationErrorResponse'])
cover(F+'_shared/hmac-validation.ts',None,['verifyHmacSignature','timingSafeEqual','extractSignatureFromHeaders','WebhookSecurityService constructor/validateRequest/signPayload','createWebhookValidator','logWebhookAuthShadow','logElevenLabsAuthShadow','sanitizeClaimForLog','logGmailOidcAuthShadow','decodeJwtSegment'])
cover('src/components/monitoring/hooks/useMonitoringActions.ts',[(60,85)],['reconfigureWebhook','runDiagnostic'], 'Somente chamada ao endpoint de controle; frontend integral pertence à frente responsável.')
cover('src/components/talkx/TalkXCampaignRunning.tsx',[(714,726)],['report email consumer'], 'Somente consumidor do relatório; frontend integral pertence à frente grill.')
cover('supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql',[(105,125),(297,363)],['conversion NOT NULL/defaults','partial dedupe index','record_talkx_conversion'], 'Trechos lidos após confirmação da definição vencedora pela frente database; somente estas faixas foram auditadas aqui.')
cover('src/hooks/chat/useScheduledMessages.ts',None,['useScheduledMessages','scheduleMutation','cancelMutation'])
cover('src/hooks/integrations/useBitrixApi.ts',[(1,88),(175,226)],['callBitrixApi','syncContactsFromBitrix','pushContactToBitrix','createLeadFromConversation'])
cover('src/components/voice/ElevenLabsDialogue.tsx',[(52,93)],['generateDialogue'], 'Somente o consumidor do contrato backend; revisão completa de UI pertence à frente grill.')
cover('src/components/settings/media-library/AIGenerateDialog.tsx',[(1,88)],['handleGenerate','handleSaveGenerated','duration controls'], 'Última linha de fechamento não usada para promover o arquivo; ciclo completo de UI pertence à frente grill.')
cover('src/components/settings/ai-providers/useAIProviders.ts',[(118,150)],['handleTest diagnostic consumer'], 'Somente consumidor do contrato de teste; não é revisão integral de UI/configuração.')
frontend_full_files = {
    'src/hooks/inbox/useConnectionsManager.ts': ['connection/dialog types','useConnectionsManager','QR refs and effects','fetchConnections','generateInstanceName','handleAddConnection','startStatusPolling','handleShowQrCode','handleRefreshQrCode','copy/reconnect/disconnect/default/delete','closeQrDialog'],
    'src/hooks/groups/actions.ts': ['useGroupActions','handleAutoSync','handleAddGroup','handleDeleteGroup','handleBroadcast','handleCategoryChange'],
    'src/hooks/groups/types.ts': ['WhatsAppGroup','WhatsAppConnection','GROUP_CATEGORIES'],
    'src/hooks/groups/index.ts': ['group reexports'],
    'src/hooks/chat/useGroupsManager.ts': ['useGroupsManager','fetchGroups','fetchConnections','effects','actions consumer','filteredGroups','toggleGroupSelection','selectAllGroups','getConnectionName'],
    'src/components/connections/ConnectionsView.tsx': ['ConnectionsView','feature flag','history sync','connection actions','QR identity renderer','child dialog mounts'],
    'src/components/connections/ConnectionCard.tsx': ['statusConfig','ConnectionCard','status and stats','action menu'],
    'src/components/connections/InstanceSettingsDialog.tsx': ['settings/privacy defaults','loadSettings','loadProfile','loadLabels','effects','settings/profile/privacy save callbacks'],
    'src/components/connections/InstanceSettingsTabContent.tsx': ['SettingsTabContent','PrivacyTabContent','LabelsTabContent'],
    'src/components/connections/ConnectionQueuesDialog.tsx': ['ConnectionQueuesDialog','handleToggle','linked IDs','queue checkbox'],
    'src/components/connections/IntegrationsPanel.tsx': ['IntegrationForm','local enabled switch','IntegrationsPanel','loadAll','load','all six config states','save/delete callbacks'],
    'src/components/connections/BusinessHoursDialog.tsx': ['defaults','state sync effects','handleSave','updateHour','copyToAllDays','applyWeekdayTemplate','hours and away-message controls'],
    'src/components/connections/BusinessHoursIndicator.tsx': ['fetchBusinessHoursStatus','local time/window logic','query and unknown/no-data rendering','BusinessHoursIndicator'],
    'src/components/connections/NumberReputationMonitor.tsx': ['loadData','startWarmup','getHealthColor','getHealthBg','warmup labels and limit rendering'],
    'src/components/settings/AIProvidersManager.tsx': ['AIProvidersManager','provider cards','new/edit/save/delete wiring','health panel mount'],
    'src/components/settings/ai-providers/useAIProviders.ts': ['readInvokeErrorBody','useAIProviders','query','saveMutation','deleteMutation','handleTest','openEdit','openNew','closeDialog','toggleUseFor'],
    'src/components/settings/ai-providers/types.ts': ['AIProvider','ProviderFormData','labels','purpose options','default form'],
    'src/components/settings/ai-providers/AIProviderCard.tsx': ['AIProviderCard','test/edit callbacks','delete dialog and callback'],
    'src/components/settings/ai-providers/AIProviderFormDialog.tsx': ['FieldError','isValidUrl','form validation','provider config inputs','purpose/default/active controls','save state'],
    'src/components/settings/ai-providers/AIProviderHealthPanel.tsx': ['percentil','query scope','success/error/fallback KPIs','durations','isLoading/no-observations/data rendering','sample labels'],
    'src/hooks/integrations/useEvolutionApi.ts': ['useEvolutionApi','core/instance/messaging/groups/integrations composition'],
    'src/hooks/evolution/useEvolutionApiCore.ts': ['useEvolutionApiCore','callApi','dedupe','withToast','mounted and pending request effects'],
    'src/hooks/evolution/useEvolutionInstance.ts': ['useEvolutionInstance','all instance control action mappings'],
    'src/hooks/evolution/useEvolutionIntegrations.ts': ['useEvolutionIntegrations','profile/privacy methods','Typebot/Chatwoot/OpenAI/Dify/Flowise/Bot methods','WhatsApp Business methods','findMessages','Kafka/Nats/Pusher methods','return contract'],
    'src/hooks/business/useBusinessHours.ts': ['defaults','useBusinessHours','business-hours query','away-message query','saveMutation','saveSettings mutateAsync','stable state and refetch'],
    'src/hooks/inbox/useConnectionQueues.ts': ['useConnectionQueues','fetchQueues','mount guard','addQueue','removeQueue'],
}
for p,s in frontend_full_files.items(): cover(p,None,s,'Lote frontend de provedores/conexões e dependências; texto integral lido, com contrato até o handler conhecido.')
cover('supabase/migrations/20260408194438_1ad57139-c089-4711-86e1-71d8f461e02d.sql',[(49,90)],['delete policy','updated_at trigger','ensure_single_default_ai_provider','insert/update trigger','Lovable seed prefix'],'Leitura pontual após confirmação da definição vigente pela frente database.')
cover('supabase/migrations/20260409014536_3a836b4b-1e37-411c-b8af-45d918304272.sql',[(136,166)],['number_reputation DDL','reputation policies and generic update trigger'],'Leitura pontual; chain review belongs to database.')
cover('supabase/migrations/20251220181300_aa931cb8-3812-4396-983e-123d19f73ad8.sql',None,['business_hours/away_messages/message_reactions original DDL','original policies','updated_at triggers','indexes/publication'],'Texto original completo lido; definições/políticas posteriores vigentes pertencem à frente database.')
cover('supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql',[(198,245),(270,303),(330,344),(380,430)],['claim/reap expiry','heartbeat conditions','finish token fencing'], 'Faixas lidas após confirmação da definição vencedora pela frente database; não é revisão integral da migration.')
cover('supabase/config.toml',[(1,78)],['webhook/auth gateway declarations','message-delivery','crm-integration','call functions'])
cover('supabase/migrations/20251220182411_dd03d6a1-4f98-410e-a411-1f2486626de2.sql',None,['scheduled_messages DDL/RLS/updated_at/index'], 'Definição vencedora completa e demais migrations pertencem à frente database.')
cover('supabase/migrations/20260930410000_talkx_settings_replay_idempotent.sql',[(19,42)],['talkx_settings JSONB schema and seed'], 'Leitura pontual de contrato JSONB; não é revisão de todas as políticas SQL.')
testp=F+'_shared/__tests__/talkx-webhook-optout.test.ts'
cover(testp,[(1,min(335,len((ROOT/testp).read_text().splitlines())))],['opt-out fixtures and success scenarios'], 'Teste lido, não executado pelo runner Deno; probes novos exercitam falhas omitidas pelas fixtures felizes.')

# Explicit inventory of backend files that were not semantically read here.
excluded = {'auth-login','webauthn','create-user','approve-password-reset','detect-new-device',
            'csp-report','cleanup-rate-limit-logs','send-rate-limit-alert','searchbox-budget-alert'}
catalogue=[]
test_inventory=[]
for p in sorted((ROOT/'supabase/functions').rglob('*.ts')):
    rel=p.relative_to(ROOT).as_posix()
    if '/__tests__/' in rel or rel.endswith('.test.ts') or rel.endswith('_test.ts') or rel.endswith('/_test-utils.ts') or '/__fixtures__/' in rel:
        test_inventory.append(rel)
        continue
    if p.relative_to(ROOT/'supabase/functions').parts[0] in excluded: continue
    if rel in reviewed: continue
    catalogue.append(dict(path=rel, head=HEAD, sha256=sha256(p.read_bytes()).hexdigest(),
        line_count=len(p.read_text().splitlines()), level='catalogued_only', reviewed_ranges=[],
        note='Inventory/import/call search only; no claim of full semantic review.'))
coverage=dict(schema_version=1, status='second_pass_checkpoint', head=HEAD, baseline=BASELINE,
    source_root=str(ROOT), role='providers',
    levels=dict(semantic_full_file='Texto integral lido e fluxo semântico revisado; não significa runtime/integração testados.',
        semantic_selected_ranges='Somente faixas explícitas; não promove a função envolvente.',
        catalogued_only='Arquivo identificado, importado por dependência ou encontrado por busca; não revisado semanticamente.'),
    files=list(reviewed.values())+catalogue,
    counts=dict(semantic_full_file=sum(f['level']=='semantic_full_file' for f in reviewed.values()),
        semantic_selected_ranges=sum(f['level']=='semantic_selected_ranges' for f in reviewed.values()),
        catalogued_only=len(catalogue)),
    offline_probes=30, tests_and_helpers_excluded_from_production_catalogue=test_inventory,
    not_covered_live=['deployment and runtime configuration','real provider payload samples','RLS/live SQL execution','N8N/external schedulers','load/concurrency timing in actual Edge Runtime','secret state'],
    known_remaining_areas=[
        'Os 13 arquivos ainda catalogados nesta frente têm responsável explícito: 12 arquivos IA com infra e gmail-oauth com root. A união global deve usar a cobertura desses responsáveis sem atribuir leitura a providers.',
        'Geração/budget, kernels, Talk X, Multiplix, Evolution, rotinas de mídia, schemas/HMAC, utilitários de voz, catálogo e diagnósticos do lote providers foram percorridos integralmente na segunda passagem.',
        'Lote connections, settings/ai-providers, useConnectionsManager e groups concluído; useWhatsAppStatus pertence à frente auth. Ampliação para lacunas de hooks/evolution, hooks/integrations, components/integrations e whatsapp-flows em andamento, registrada separadamente ao ler os arquivos.',
        'Configuração implantada, payloads reais de cada versão Evolution, agendadores e efeitos/triggers de bancos externos permanecem sem evidência operacional.',
    ],
    parallel_ownership=['Database: 779 migrations/final definitions and receipt/reply attribution; relevant conclusions cross-referenced, not counted as this agent reading those migrations.',
        'Inbox: ScheduleMessageDialog false success and frontend message workflows.',
        'Grill primary: frontend TalkX/Multiplix/telephony/IA contracts where assigned.',
        'Root: gmail-oauth and email/Gmail frontend; completed in reports/communication, COM009/COM010 for OAuth.',
        'Infra: _shared/ai-conversation-pipeline.ts, _shared/ai-image-input.ts, ai-conversation-analysis, ai-conversation-summary, ai-churn-analysis, ai-classify-tickets, ai-enhance-message, ai-suggest-reply, chatbot-l1, classify-audio-meme, classify-emoji, classify-sticker.',
        'Auth: login/MFA/passkeys/admin user functions and useWhatsAppStatus/contact profile; provider endpoint authorization stayed with this agent.'])
coverage['review_notes'] = [
    'migrate-media-storage aplica requireAuth + gate administrativo, ao contrário de recover-corrupted-audios; não foi classificado como rotina sem autorização.',
    'fetch-link-preview usa secure-egress e recebe Response construída a partir do corpo já consumido do proxy; limpar o timer antes da leitura desse Response local não reproduz por si só o bug de timeout de corpo de rede.',
    'sentiment-alert reancora contato/analysis, derive configurações/score do servidor e usa RPC de persistência idempotente; falha de email é representada por emailSent=false. Nenhuma duplicação automática de e-mail foi inferida.',
    'Gmail MIME insere cabeçalhos, mas os schemas de produção rejeitam CR/LF e aspas/separadores em nome de anexo; esse vetor não foi declarado vulnerabilidade.',
    'voice-copilot-action usa RLS para leituras e visibilidade, resolve autoria no JWT e exige papel ao reatribuir a terceiro. Reivindicação para si é decisão explícita do helper; comparação com contrato canônico de claim segue como questão de escopo, sem novo achado automático.',
    'Catálogo usa JWT, allowlist de ações/campos e rate limit por usuário/ação. Ordenação sem desempate e filtro de novidades já pertencem a OTH-004/OTH-007.',
    'BusinessHoursDialog aguarda saveSettings; mutateAsync propaga erros e não fecha como sucesso após erro de gravação. A falta de consumidor de away_messages é um gap diferente.',
    'AIProviderHealthPanel identifica explicitamente amostra de no máximo 50 e retorna percentil nulo para conjunto vazio; não se alegou taxa completa nem zero como medição ausente.',
    'whatsapp_groups possui UNIQUE global(group_id), mas representar um grupo por uma única linha pode ser decisão de produto; a sobreposição entre conexões não foi automaticamente declarada corrupção.',
    'findMessages recebe remoteJid no hook enquanto o backend usa where; a busca dirigida não encontrou consumidor de produção desse método no primeiro lote. Esse desencontro não foi promovido a falha de botão ativo sem alcance demonstrado.',
]
(OUT/'coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2)+'\n')
(OUT/'remaining-catalogued.json').write_text(json.dumps(dict(head=HEAD, status='delegated_only', count=len(catalogue), paths=[c['path'] for c in catalogue], note='12 AI paths belong to infra; gmail-oauth belongs to root. No remaining unassigned production path in the providers lot.'), ensure_ascii=False, indent=2)+'\n')

counts=Counter(f['classification'] for f in findings)
severity=Counter(f['severity'] for f in findings)
report=['# Reauditoria de provedores e Edge Functions — checkpoint consolidado',
f'\n**Fonte:** `{HEAD}`. **Baseline anterior:** `{BASELINE}`. Commits adicionais lidos: X028 `{X028}` e X030 `{HEAD}`. Relatório baseado exclusivamente no checkout identificado; nenhuma alteração de fonte.',
'\n## Resultado e limites',
f'\nForam consolidados **{len(findings)} registros**: {counts["confirmed_static"]} confirmados por leitura estática, {counts["hypothesis"]} hipótese condicionada e {counts["gap"]} gap de execução. Prioridades sugeridas: '+', '.join(f'{k}: {v}' for k,v in sorted(severity.items()))+'. A prioridade considera a consequência e as precondições descritas em cada registro; não afirma exploração em produção.',
'\nOs achados mais urgentes são autorização de ações do provedor, autenticidade dos webhooks, durabilidade do opt-out, controle de destino de downloads e avanço indevido do cursor Gmail. X028 melhora receipts e await de Talk X; os consumidores Multiplix e a recuperação de efeitos incompletos continuam com lacunas. X030 usa a fonte configurável e token por instância na confirmação, mas perde a distinção entre ausência de opt-out e falha de consulta, e não verifica a resposta HTTP da confirmação.',
'\nA investigação executou **30 probes determinísticos offline**, todos com resultado esperado. Nenhuma chamada real de rede, banco ou leitura de ambiente ocorreu nos probes. As fontes foram importadas sem alterações; as dependências remotas de serve/createClient são fronteiras em memória. P14 executa o statement exato do heartbeat contra thenable lazy; não deve ser descrito como execução do SDK remoto. P16/P17 compõem os blocos exatos de seleção/download com helpers reais, sem executar o schema ou a API STT. P18 executa o handler auto-close integral. P19–P21 executam handlers de inspeção Multiplix com projeção SELECT e teto de linhas simulados, sem router nem RLS live. P22 testa cancelamento do adaptador de envio; P23/P24 executam AI Proxy com guard de quota simulado recusando a mesma identidade em modo normal. P25–P28 executam handlers de conversão, diagnóstico e relatório completos: HMAC real, relógio controlado e fronteiras SQL/provedor simuladas. P29/P30 executam callbacks de hooks React completos com importações, estado, promises e timers em memória, sem os efeitos de montagem. Os pins SQL/frontend extras são verificados antes de qualquer avaliação da aplicação. Os scripts e resultados incluem HEAD e hashes SHA-256 dos arquivos pertinentes.',
'\n## Índice de achados', '\n| ID | Prioridade | Classificação | Achado |', '|---|---|---|---|']
for f in findings: report.append(f'| {f["id"]} | {f["severity"]} | {f["classification"]} | {f["title"]} |')
report += ['\n## Evidência detalhada']
for f in findings:
    report += [f'\n### {f["id"]} — {f["title"]}', f'\n**{f["severity"]} · {f["classification"]} · HEAD `{HEAD}`**',
        '\n**Precondição.** '+f['preconditions'], '\n**Comportamento observado.** '+f['observed_behavior'],
        '\n**Efeito.** '+f['impact'], '\n**Evidência de fonte:**']
    for e in f['evidence']:
        report.append(f'- [{e["path"]}:{e["line_start"]}–{e["line_end"]}]({e["url"]}) — `{e["symbol"]}`; SHA-256 `{e["sha256"]}`.')
    if f['probes']: report.append('\n**Probes:** '+', '.join(f['probes'])+'.')
    report.append('\n**Aceite da correção:**')
    report.extend('- '+a for a in f['acceptance'])
    if f['related_findings']: report.append('\n**Relações, sem duplicar:** '+', '.join(f['related_findings'])+'.')
    if f['primary_sources']: report.append('\n**Fonte primária externa:** '+ '; '.join(f'[{u}]({u})' for u in f['primary_sources'])+'.')
    if f['limitations']: report.append('\n**Limite da conclusão.** '+f['limitations'])
report += ['\n## Achados anteriores e divisão entre frentes', '\nOs seguintes registros foram preservados como antecedentes, sem serem recontados como falhas novas:']
for p in prior: report.append(f'- **{p["id"]}** — {p["note"]}')
report += ['\n## Cobertura efetivamente revisada',
    '\n`coverage.json` contém hashes, faixas e símbolos por arquivo. Uma importação ou busca de chamada não é leitura integral do arquivo. Os arquivos com leitura semântica integral desta frente são:',
    '\n'+', '.join('`'+p+'`' for p,v in reviewed.items() if v['level']=='semantic_full_file')+'.',
    '\nA segunda passagem completou o handler `talkx-send/index.ts` e as ações Multiplix de inspeção, público, blocos, ciclo e listagem. Schemas, helpers de autenticação e consumidores auxiliares ainda parciais têm faixas explícitas no JSON. Não se chama todo handler envolvente de revisado porque uma microfunção foi lida.',
    '\n### Áreas que ainda ficaram apenas catalogadas nesta frente']
report.extend('\n- '+s for s in coverage['known_remaining_areas'])
report += ['\n### Lista explícita de arquivos apenas catalogados', '\nA lista é deliberadamente completa para permitir união com a cobertura AST/global e com outras frentes:']
report.extend('- `'+c['path']+'`' for c in catalogue)
report += ['\n## Probes e fontes primárias',
    '\n- `reproduce.mjs` / `probe-results.json`: P01–P10, importação real de helpers e clientes em memória.',
    '- `reproduce-provider-control.mjs` / `provider-control-probe-results.json`: P11–P15, handler de controle, merge de privacidade, v2, statement de heartbeat e escolha A/B.',
    '- `reproduce-privileged-effects.mjs` / `privileged-effects-probe-results.json`: P16/P17, autorização por objeto com mídia nula e controle positivo; P18, auto-close com três escritas recusadas.',
    '- `reproduce-multiplix-review.mjs` / `multiplix-review-probe-results.json`: P19/P20, prévia/validação com destinatário estrangeiro e projeção SELECT fiel; P21, resumo/estimativa com público acima do teto de linhas simulado.',
    '- `reproduce-media-ai-control.mjs` / `media-ai-control-probe-results.json`: P22, presença ignora cancelamento; P23/P24, teste de IA evita cota e log, com controle normal recusado.',
    '- `reproduce-final-endpoints.mjs` / `final-endpoints-probe-results.json`: P25, timestamp renovado sem alterar HMAC; P26, defaults incompatíveis com RPC; P27, tráfego de A atribuído a B; P28, 2500 ignorados viram 2000 ignorados e 500 pendentes no e-mail interceptado.',
    '- `reproduce-frontend-providers.mjs` / `frontend-providers-probe-results.json`: P29, resposta/polling de A alteram QR e status de B e deixam timer sem referência; P30, erro lógico do proxy gera sucesso em envio e sincronização de grupos. Blobs dos hooks são validados contra o manifesto antes da avaliação.',
    '- `verify-source.mjs`: antes de qualquer import da aplicação, compara HEAD real e blobs Git/tamanhos de todo o prefixo supabase/functions mais config com source-integrity.json. Abrange todos os módulos locais transitivos dos probes; não lê arquivos de ambiente.',
    '- `findings.json`: dados normalizáveis, pinados ao HEAD; `coverage.json`: cobertura por faixa/símbolo; `build_report.py`: gerador desta documentação.',
    '\nA referência oficial Gmail history.list distingue `nextPageToken` de `historyId` corrente da caixa e orienta armazenar o cursor depois de esgotar páginas. O guia de sincronização descreve processamento incremental de mudanças e recuperação por full sync em history expirado. Esses contratos sustentam R2-API-011; não se presume que uma página representa todos os eventos.',
    '\nO guia oficial de background tasks do Supabase exige preservar a execução da Promise quando se quer trabalho posterior à resposta; ele não cria atomicidade de efeitos. O source oficial PostgrestBuilder implementa fetch no consumo de `then`; a URL de master foi recuperada, a tag exata v2.87.1 não foi baixada. Essa diferença está marcada em R2-API-013.',
    '\nNão foram realizados deploy, mutation de banco real, contato a provedores, envio de mensagens, leitura de secrets nem alteração do checkout. O relatório não fecha aceites operacionais que dependem dessas evidências.',
]
(OUT/'report.md').write_text('\n'.join(report)+'\n')
print(json.dumps(dict(findings=len(findings), classifications=counts, priorities=severity, coverage=coverage['counts'], files=['report.md','findings.json','coverage.json']),ensure_ascii=False))
