# Reauditoria de provedores e Edge Functions — checkpoint consolidado

**Fonte:** `da307ba5626dce892f0b37cb6762463f55d14a96`. **Baseline anterior:** `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`. Commits adicionais lidos: X028 `4e73c7767858f00c577c29efd8cc86f5bea117a9` e X030 `da307ba5626dce892f0b37cb6762463f55d14a96`. Relatório baseado exclusivamente no checkout identificado; nenhuma alteração de fonte.

## Resultado e limites

Foram consolidados **46 registros**: 42 confirmados por leitura estática, 1 hipótese condicionada e 3 gap de execução. Prioridades sugeridas: P1: 8, P2: 36, P3: 2. A prioridade considera a consequência e as precondições descritas em cada registro; não afirma exploração em produção.

Os achados mais urgentes são autorização de ações do provedor, autenticidade dos webhooks, durabilidade do opt-out, controle de destino de downloads e avanço indevido do cursor Gmail. X028 melhora receipts e await de Talk X; os consumidores Multiplix e a recuperação de efeitos incompletos continuam com lacunas. X030 usa a fonte configurável e token por instância na confirmação, mas perde a distinção entre ausência de opt-out e falha de consulta, e não verifica a resposta HTTP da confirmação.

A investigação executou **30 probes determinísticos offline**, todos com resultado esperado. Nenhuma chamada real de rede, banco ou leitura de ambiente ocorreu nos probes. As fontes foram importadas sem alterações; as dependências remotas de serve/createClient são fronteiras em memória. P14 executa o statement exato do heartbeat contra thenable lazy; não deve ser descrito como execução do SDK remoto. P16/P17 compõem os blocos exatos de seleção/download com helpers reais, sem executar o schema ou a API STT. P18 executa o handler auto-close integral. P19–P21 executam handlers de inspeção Multiplix com projeção SELECT e teto de linhas simulados, sem router nem RLS live. P22 testa cancelamento do adaptador de envio; P23/P24 executam AI Proxy com guard de quota simulado recusando a mesma identidade em modo normal. P25–P28 executam handlers de conversão, diagnóstico e relatório completos: HMAC real, relógio controlado e fronteiras SQL/provedor simuladas. P29/P30 executam callbacks de hooks React completos com importações, estado, promises e timers em memória, sem os efeitos de montagem. Os pins SQL/frontend extras são verificados antes de qualquer avaliação da aplicação. Os scripts e resultados incluem HEAD e hashes SHA-256 dos arquivos pertinentes.

## Índice de achados

| ID | Prioridade | Classificação | Achado |
|---|---|---|---|
| R2-API-001 | P1 | confirmed_static | Ações de controle Evolution não exigem papel nem escopo de conexão |
| R2-API-002 | P2 | confirmed_static | Receipt GO de saída ainda fica fora de Multiplix e do estado da mensagem no inbox |
| R2-API-003 | P2 | confirmed_static | Edições e reações do webhook não correlacionam o evento à conexão |
| R2-API-004 | P2 | confirmed_static | Falha de lookup de conexão vira cache negativo e amplia o escopo de mutações |
| R2-API-005 | P2 | confirmed_static | Mensagem de grupo GO pode entrar no inbox como conversa direta do participante |
| R2-API-006 | P1 | confirmed_static | Opt-out e atribuição podem se perder após o ingest, sem recuperação no replay |
| R2-API-007 | P2 | confirmed_static | Indecisão sobre palavra de opt-out é interpretada como ausência de opt-out |
| R2-API-008 | P2 | confirmed_static | Autoresposta de opt-out anuncia envio mesmo com HTTP de erro |
| R2-API-009 | P1 | confirmed_static | Download de mídia do webhook aceita URL arbitrária sem política de egress |
| R2-API-010 | P2 | confirmed_static | Horário comercial salvo, worker e scheduler usam contratos diferentes |
| R2-API-011 | P1 | confirmed_static | Gmail webhook/cron avançam cursor compartilhado sem aplicar todo o histórico |
| R2-API-012 | P2 | confirmed_static | Gmail webhook não persiste metadados de anexos exigidos para download |
| R2-API-013 | P2 | confirmed_static | Heartbeat Multiplix descarta o builder RPC e não renova o lease |
| R2-API-014 | P2 | confirmed_static | Falha ao consultar privacidade transforma atualização parcial em abertura de outros campos |
| R2-API-015 | P2 | confirmed_static | Controle de sessão usa rotas GO mesmo com EVOLUTION_API_FLAVOR=v2 |
| R2-API-016 | P3 | hypothesis | Status não string aceito pelo envelope derruba lote de receipts |
| R2-API-017 | P2 | gap | scheduled_messages tem produtor e estados, mas executor não foi encontrado no código versionado |
| R2-API-018 | P2 | confirmed_static | Bitrix pode devolver sucesso de criação mesmo quando o provedor rejeita |
| R2-API-019 | P2 | confirmed_static | Webhook WhatsApp oficial confirma entrada sem persistir mensagem e pode rebaixar status |
| R2-API-020 | P3 | confirmed_static | Distribuição A/B por hash depende da ordem não especificada das variantes |
| R2-API-021 | P1 | confirmed_static | Autenticidade dos webhooks permanece apenas observada em caminhos públicos |
| R2-API-022 | P1 | confirmed_static | Rotinas de e-mail, relatório, encerramento e recuperação executam privilégio de servidor sem autorizar o chamador |
| R2-API-023 | P2 | confirmed_static | Relatório agendado avança last_sent_at e anuncia sucesso após falha de envio |
| R2-API-024 | P2 | confirmed_static | Diálogo ElevenLabs envia script e omite o campo inputs obrigatório do provedor |
| R2-API-025 | P2 | confirmed_static | Geração musical envia duração no nome e unidade do contrato de efeitos sonoros |
| R2-API-026 | P2 | confirmed_static | Worker de IA deixa lease expirar durante o handler e permite reexecução após efeito externo iniciado |
| R2-API-027 | P1 | confirmed_static | Transcrição aceita mensagem visível sem mídia e baixa objeto escolhido pelo cliente com service role |
| R2-API-028 | P2 | confirmed_static | Auto-close conta encerramento mesmo quando mensagem, closure e desatribuição falham |
| R2-API-029 | P1 | confirmed_static | Prévia e validação Multiplix aceitam destinatário de outro disparo |
| R2-API-030 | P2 | confirmed_static | Resumo e estimativa Multiplix tratam a primeira página de destinatários como público completo |
| R2-API-031 | P2 | confirmed_static | Presença humanizada pode bloquear o envio além do prazo do chamador |
| R2-API-032 | P2 | confirmed_static | Modo de teste do AI Proxy permite chamada paga sem cota nem registro de consumo |
| R2-API-033 | P2 | confirmed_static | Auto-tag conserva etiquetas antigas quando a nova classificação válida não tem tags |
| R2-API-034 | P2 | confirmed_static | Recuperação de áudio reutiliza a conexão da primeira mensagem em todo o lote |
| R2-API-035 | P2 | confirmed_static | Timestamp não assinado permite repetir conversões Talk X fora da janela de frescor |
| R2-API-036 | P2 | confirmed_static | Conversão Talk X fornece defaults que a RPC final rejeita |
| R2-API-037 | P2 | confirmed_static | Diagnóstico por conexão usa o tráfego global para declarar saúde |
| R2-API-038 | P2 | confirmed_static | Relatório Talk X transforma destinatários ignorados fora da página em pendentes |
| R2-API-039 | P2 | confirmed_static | Resposta e polling antigos misturam identidades no diálogo de QR Code |
| R2-API-040 | P2 | confirmed_static | Editor de privacidade envia padrões locais sem carregar a configuração atual |
| R2-API-041 | P2 | confirmed_static | Desativar integração esconde o único botão capaz de persistir a desativação |
| R2-API-042 | P2 | confirmed_static | Envio e sincronização de grupos contam erro lógico do proxy como sucesso |
| R2-API-043 | P2 | confirmed_static | Painel de saúde exclui chamadas de IA registradas fora de ai-proxy |
| R2-API-044 | P2 | gap | Aquecimento e limite de número têm configuração local sem motor identificado |
| R2-API-045 | P2 | gap | Mensagem automática fora do expediente é persistida sem consumidor de entrega identificado |
| R2-API-046 | P2 | confirmed_static | Exclusão de provedor promete fallback automático que o roteamento não executa |

## Evidência detalhada

### R2-API-001 — Ações de controle Evolution não exigem papel nem escopo de conexão

**P1 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Endpoint publicado; usuário autenticado sem papel administrativo ou permissão sobre a conexão. O probe assume getUser válido para um agente comum e devolve false a qualquer RPC de permissão. Em webhook-diagnostic, considera-se conservadoramente usuário válido admitido pelo gateway, com a condição de auto-fix satisfeita; o handler não autentica nem autoriza.

**Comportamento observado.** O gate global verifica apenas getUser. set-webhook, disconnect, restart-instance, update-privacy, alterações de perfil/grupos e envios diretos não passam por requireAdmin nem por autorização de contato/conexão. set-webhook atravessa o proxy e traduz para POST /instance/connect, com o webhook escolhido pelo chamador. P11 executou o handler real: uma validação de usuário, zero consultas de permissão e uma chamada interceptada ao provedor. webhook-diagnostic é um segundo caminho de controle: cria service client, lê todas as conexões e aceita action=auto-fix sem gate local, realizando POST de configuração do webhook quando o diagnóstico retorna critical/warning.

**Efeito.** Um agente autenticado pode reconfigurar o webhook, interromper sessão ou realizar ações com a credencial do servidor. Os envios diretos também contornam a autorização por contato e a fila presente em message-delivery. O impacto concreto depende da ação e da conexão que a credencial do provedor seleciona. O diagnóstico também expõe telefones/status/configurações de todas as conexões ao chamador admitido e pode alterar a configuração pela ação de reparo.

**Evidência de fonte:**
- [supabase/functions/evolution-api/index.ts:40–45](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/evolution-api/index.ts#L40) — `global JWT gate`; SHA-256 `227d16c9e5431bfc0bae0cf833e1d0b0fcce5e822f98ffbc25be7f27865e0cdd`.
- [supabase/functions/evolution-api/index.ts:122–134](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/evolution-api/index.ts#L122) — `requireAdmin`; SHA-256 `227d16c9e5431bfc0bae0cf833e1d0b0fcce5e822f98ffbc25be7f27865e0cdd`.
- [supabase/functions/evolution-api/index.ts:625–666](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/evolution-api/index.ts#L625) — `restart/disconnect/settings/webhook/send-text`; SHA-256 `227d16c9e5431bfc0bae0cf833e1d0b0fcce5e822f98ffbc25be7f27865e0cdd`.
- [supabase/functions/_shared/evolution-go-routes.ts:309–316](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-go-routes.ts#L309) — `webhook route translation`; SHA-256 `8da3c5c3c387949f5dc1143a1f1ca70412b9d4ff1d200754f09c0930f52f954d`.
- [supabase/functions/webhook-diagnostic/index.ts:28–62](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/webhook-diagnostic/index.ts#L28) — `unguarded global diagnostic`; SHA-256 `df91c8ad62c862151ce56cb1282d0aef775dddf36055dd4573ffad41b5e4d9b6`.
- [supabase/functions/webhook-diagnostic/index.ts:170–204](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/webhook-diagnostic/index.ts#L170) — `auto-fix provider POST`; SHA-256 `df91c8ad62c862151ce56cb1282d0aef775dddf36055dd4573ffad41b5e4d9b6`.
- [src/components/monitoring/hooks/useMonitoringActions.ts:75–85](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/monitoring/hooks/useMonitoringActions.ts#L75) — `diagnostic and repair consumer`; SHA-256 `f40ba54499837efec5bdcdeb3d43548978bde230eb820cf6906def1845b8be94`.

**Probes:** P11.

**Aceite da correção:**
- Matriz explícita de autorização por ação, aplicada antes de fetch/RPC privilegiado.
- Agente sem permissão recebe 403 em set-webhook/disconnect/update-privacy e não produz I/O no provedor.
- Envio exige acesso ao contato/conexão e segue a decisão de autorização/entrega canônica; admin autorizado conserva as operações.
- Aplicar a mesma autorização de controle ao auto-fix e às leituras sensíveis de diagnóstico; o reparo não é uma exceção ao gate.

**Relações, sem duplicar:** TRA-002.

**Limite da conclusão.** TRA-002 trata seleção de credencial, não este gate. Nenhum JWT real, conta real ou provedor foi usado.

### R2-API-002 — Receipt GO de saída ainda fica fora de Multiplix e do estado da mensagem no inbox

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Receipt GO de mensagem enviada; Chat e Sender representam o mesmo usuário, mas Sender inclui dispositivo, de modo que a igualdade literal é falsa.

**Comportamento observado.** O adaptador infere fromMe por igualdade literal. X028 removeu esse requisito somente para record_talkx_recipient_receipt. A busca da mensagem filtra sender=contact quando fromMe=false; os RPCs Multiplix delivered/read continuam exigindo true. Depois tenta upsert de stub inbound. P01 comprovou chamada TalkX, ausência das chamadas Multiplix e tentativa de stub contact.

**Efeito.** Talk X pode atualizar seu recibo enquanto inbox/Multiplix mantêm status atrasado. A tentativa de stub pode conflitar com a mensagem agent já existente; não se afirma que o stub sempre é criado. A revisão SQL paralela identificou índice global de external_id além do índice composto.

**Evidência de fonte:**
- [supabase/functions/_shared/evolution-go-adapter.ts:169–183](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-go-adapter.ts#L169) — `receipt translation`; SHA-256 `4dea8247fc8919af4182b2aa9634761df0bd600846bd40c1a4147a6e86ec77c8`.
- [supabase/functions/_shared/evolution-webhook-msg-handlers.ts:100–138](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-msg-handlers.ts#L100) — `inbox lookup and X028 receipt`; SHA-256 `da51efad6032e57a63405c7fd3026337437b3622bf400ff8aa65fc61ca24f694`.
- [supabase/functions/_shared/evolution-webhook-msg-handlers.ts:140–218](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-msg-handlers.ts#L140) — `Multiplix gate and inbound stub`; SHA-256 `da51efad6032e57a63405c7fd3026337437b3622bf400ff8aa65fc61ca24f694`.

**Probes:** P01.

**Aceite da correção:**
- Fixture GO com Sender contendo dispositivo eleva a mensagem agent e os recibos Multiplix corretos.
- Correlação por external_id + conexão + registro de saída autoritativo, com testes de recibo realmente inbound.
- A ausência/ambiguidade de fromMe não deve gerar stub de contato para ID de saída existente.

**Relações, sem duplicar:** R2-DB-002.

**Limite da conclusão.** Não mede incidência no tráfego real. Não duplica o achado SQL de atribuição de respostas.

### R2-API-003 — Edições e reações do webhook não correlacionam o evento à conexão

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Evento aceito contém external_id de uma mensagem local pertencente a conexão diferente da instância declarada. Basta uma linha local; não requer IDs duplicados coexistindo no banco.

**Comportamento observado.** handleMessagesEdited não recebe instance; consulta somente external_id e atualiza por id. handleReactionEvent também consulta external_id globalmente e usa contact_id da linha encontrada como autor da reação. O caminho não compara instância, chat nem autor ao alvo.

**Efeito.** Um evento atribuído à conexão errada pode editar conteúdo/reação de outra conversa. Com validação forte na entrada a precondição depende de colisão/erro do provedor; com modo de sombra, a fronteira de confiança é mais ampla. P02 prova a ausência de filtros e a escrita na linha retornada de outra conexão.

**Evidência de fonte:**
- [supabase/functions/_shared/evolution-webhook-msg-handlers.ts:328–349](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-msg-handlers.ts#L328) — `handleMessagesEdited`; SHA-256 `da51efad6032e57a63405c7fd3026337437b3622bf400ff8aa65fc61ca24f694`.
- [supabase/functions/_shared/evolution-helpers.ts:353–381](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-helpers.ts#L353) — `handleReactionEvent`; SHA-256 `7a0ff6fb539f544abeb4a7b46e594d0ee027d5e674d8c398f640e6da7373c016`.

**Probes:** P02.

**Aceite da correção:**
- Passar a conexão validada ao handler e exigir correspondência do alvo por conexão/direção/chat.
- Evento de outra conexão não altera conteúdo nem reação mesmo se seu external_id existe.
- Testar edit/reaction em duas conexões com a mesma entrada externa, sem pressupor que o schema aceite duas rows iguais.

**Relações, sem duplicar:** R2-API-021.

**Limite da conclusão.** Isolamento insuficiente está confirmado no código; exploração/colisão em produção não foi testada.

### R2-API-004 — Falha de lookup de conexão vira cache negativo e amplia o escopo de mutações

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Lookup de whatsapp_connections retorna erro ou nenhuma linha para a instância e o evento contém ID de mensagem conhecido localmente.

**Comportamento observado.** getConnectionByInstance ignora error e armazena data=null por cinco minutos. handleSendMessage, handleMessagesUpdate e handleMessagesDelete aplicam eq(whatsapp_connection_id) somente se a conexão foi encontrada. P03 simulou erro de lookup, executou delete sem filtro de conexão e mostrou que a segunda chamada reutiliza null sem nova consulta.

**Efeito.** Uma indisponibilidade transitória elimina uma condição de isolamento e permanece no cache. Eventos da instância não resolvida podem atingir mensagens globais por external_id/sender; inbound normal, que retorna quando falta conexão, fica indisponível durante o cache.

**Evidência de fonte:**
- [supabase/functions/_shared/evolution-helpers.ts:197–219](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-helpers.ts#L197) — `getConnectionByInstance`; SHA-256 `7a0ff6fb539f544abeb4a7b46e594d0ee027d5e674d8c398f640e6da7373c016`.
- [supabase/functions/_shared/evolution-webhook-msg-handlers.ts:10–42](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-msg-handlers.ts#L10) — `handleSendMessage lookup`; SHA-256 `da51efad6032e57a63405c7fd3026337437b3622bf400ff8aa65fc61ca24f694`.
- [supabase/functions/_shared/evolution-webhook-msg-handlers.ts:86–107](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-msg-handlers.ts#L86) — `handleMessagesUpdate lookup`; SHA-256 `da51efad6032e57a63405c7fd3026337437b3622bf400ff8aa65fc61ca24f694`.
- [supabase/functions/_shared/evolution-webhook-msg-handlers.ts:225–270](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-msg-handlers.ts#L225) — `handleMessagesDelete`; SHA-256 `da51efad6032e57a63405c7fd3026337437b3622bf400ff8aa65fc61ca24f694`.

**Probes:** P03.

**Aceite da correção:**
- Erro de consulta permanece erro e não popula cache negativo.
- Evento sem conexão válida não realiza nenhuma mutação global.
- Recuperação do DB permite a próxima tentativa retomar o lookup; teste diferencia erro de ausência confirmada.

**Relações, sem duplicar:** R2-API-003, R2-API-021.

**Limite da conclusão.** External_id precisa corresponder a linha existente para ocorrer mutação; não se afirma que toda falha cause corrupção.

### R2-API-005 — Mensagem de grupo GO pode entrar no inbox como conversa direta do participante

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Evento de grupo com remoteJid @g.us e participant/Sender com @s.whatsapp.net, formato produzido pelo adaptador GO.

**Comportamento observado.** resolveBestJid prioriza qualquer JID de telefone antes do JID de grupo. handleIncomingMessage aplica o filtro de grupos ao bestJid já substituído pelo participante. P04 traduziu evento GO realista e observou ingest_inbound_message receber o telefone do participante.

**Efeito.** Conteúdo de grupo é persistido e tratado como mensagem direta. Pode contaminar histórico, atribuição de campanha, opt-out e automações do contato; a eventual resposta automática usaria o telefone direto.

**Evidência de fonte:**
- [supabase/functions/_shared/evolution-go-adapter.ts:104–133](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-go-adapter.ts#L104) — `GO message key`; SHA-256 `4dea8247fc8919af4182b2aa9634761df0bd600846bd40c1a4147a6e86ec77c8`.
- [supabase/functions/_shared/evolution-helpers.ts:73–86](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-helpers.ts#L73) — `resolveBestJid`; SHA-256 `7a0ff6fb539f544abeb4a7b46e594d0ee027d5e674d8c398f640e6da7373c016`.
- [supabase/functions/_shared/evolution-webhook-messages.ts:388–438](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-messages.ts#L388) — `group filter after JID resolution`; SHA-256 `232baff04c754c6407275bbdc89e0ca439c533cfb58ad0ec603c0afd3d727aec`.

**Probes:** P04.

**Aceite da correção:**
- Classificar o chat original antes de resolver a identidade do participante.
- Mensagem de grupo permanece fora do pipeline direto quando grupos são ignorados.
- Fixtures com grupo, participante, LID e remoteJidAlt cobrem a separação entre chat e autor.

**Limite da conclusão.** Não se afirma que o produto deva suportar grupos; o próprio guard indica que deveria ignorá-los neste pipeline.

### R2-API-006 — Opt-out e atribuição podem se perder após o ingest, sem recuperação no replay

**P1 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** ingest_inbound_message grava a mensagem e, depois disso, falha a gravação de supressão/atribuição ou o worker termina antes de completar efeitos pendentes.

**Comportamento observado.** O ingest e os efeitos seguintes são operações separadas. A falha de supressão é só logada; attributeTalkXReply captura erro e retorna normalmente apesar do await introduzido por X028. Multiplix segue fire-and-forget. Na reentrega, outcome=duplicate retorna antes do processamento de opt-out/reply. P05: dois ingests, uma única tentativa de supressão, erro absorvido e nenhuma segunda tentativa.

**Efeito.** Uma mensagem já aceita pode deixar de bloquear envios futuros ao contato ou deixar de contabilizar resposta. O await diminui a janela de encerramento antecipado no Talk X, mas não cria durabilidade nem recuperação de erro.

**Evidência de fonte:**
- [supabase/functions/_shared/evolution-webhook-messages.ts:459–493](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-messages.ts#L459) — `ingest and duplicate early return`; SHA-256 `232baff04c754c6407275bbdc89e0ca439c533cfb58ad0ec603c0afd3d727aec`.
- [supabase/functions/_shared/evolution-webhook-messages.ts:517–567](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-messages.ts#L517) — `suppression write and swallowed error`; SHA-256 `232baff04c754c6407275bbdc89e0ca439c533cfb58ad0ec603c0afd3d727aec`.
- [supabase/functions/_shared/evolution-webhook-messages.ts:569–590](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-messages.ts#L569) — `TalkX awaited / Multiplix detached`; SHA-256 `232baff04c754c6407275bbdc89e0ca439c533cfb58ad0ec603c0afd3d727aec`.
- [supabase/functions/_shared/talkx-reply.ts:67–92](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/talkx-reply.ts#L67) — `attributeTalkXReply`; SHA-256 `b9de05264b470b4a5576fc40fd1a874b063fd5b9934793c9d7044d91e2ed4f3d`.
- [supabase/functions/evolution-webhook/index.ts:280–294](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/evolution-webhook/index.ts#L280) — `HTTP completion`; SHA-256 `35675fb65e4645935a514f5aa5282c52b67e03914a6d555dc132f468652488df`.

**Probes:** P05.

**Aceite da correção:**
- Gravar efeito pendente de opt-out/reply de forma durável com a ingestão ou usar outbox idempotente.
- Replay de mensagem já persistida retoma apenas os efeitos incompletos.
- Falha de DB entre ingest e supressão deve produzir tentativa recuperável, sem enviar duas confirmações nem contar duas respostas.

**Relações, sem duplicar:** R2-DB-002.

**Fonte primária externa:** [https://supabase.com/docs/guides/functions/background-tasks](https://supabase.com/docs/guides/functions/background-tasks).

**Limite da conclusão.** Não propõe reenviar indiscriminadamente operações externas: a recuperação precisa de chave idempotente por efeito.

### R2-API-007 — Indecisão sobre palavra de opt-out é interpretada como ausência de opt-out

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Cache sem valor útil; leitura de talkx_optout_keywords falha e RPC talkx_match_optout também falha.

**Comportamento observado.** loadOptOutKeywords devolve null quando não decide. resolveOptOutKeyword converte erro da RPC em null, o mesmo resultado usado para não casamento. O chamador segue com attributeTalkXReply e attributeMultiplixReply. P07 enviou a palavra PARE com essas falhas e observou atribuição de engajamento sem supressão.

**Efeito.** Pedido de saída pode ser contado como resposta positiva e não bloquear mensagens posteriores. É um ramo distinto do erro de persistência em R2-API-006: a falha ocorre na decisão e troca seu significado.

**Evidência de fonte:**
- [supabase/functions/_shared/evolution-webhook-messages.ts:61–95](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-messages.ts#L61) — `loadOptOutKeywords`; SHA-256 `232baff04c754c6407275bbdc89e0ca439c533cfb58ad0ec603c0afd3d727aec`.
- [supabase/functions/_shared/evolution-webhook-messages.ts:130–147](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-messages.ts#L130) — `resolveOptOutKeyword`; SHA-256 `232baff04c754c6407275bbdc89e0ca439c533cfb58ad0ec603c0afd3d727aec`.
- [supabase/functions/_shared/evolution-webhook-messages.ts:499–508](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-messages.ts#L499) — `resolve call`; SHA-256 `232baff04c754c6407275bbdc89e0ca439c533cfb58ad0ec603c0afd3d727aec`.
- [supabase/functions/_shared/evolution-webhook-messages.ts:569–590](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-messages.ts#L569) — `engagement attribution`; SHA-256 `232baff04c754c6407275bbdc89e0ca439c533cfb58ad0ec603c0afd3d727aec`.

**Probes:** P07.

**Aceite da correção:**
- Contrato explícito matched / not_matched / indeterminate.
- Estado indeterminado não atribui engajamento nem conclui o processamento de opt-out.
- Persistir tentativa pendente e reavaliar após recuperar fonte autoritativa.

**Relações, sem duplicar:** R2-API-006.

**Limite da conclusão.** Não defende lista fixa de palavras no edge; a tabela continua fonte autoritativa.

### R2-API-008 — Autoresposta de opt-out anuncia envio mesmo com HTTP de erro

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Supressão nova retorna ID, autoresposta está configurada e token da instância é encontrado; provedor responde HTTP 4xx/5xx.

**Comportamento observado.** O retorno Response de evoFetch não é inspecionado. Depois do await o log diz Confirmacao enviada, inclusive se status=500. P06 capturou esse caso e mostrou ausência de AbortSignal. A supressão já existe; o ramo idempotente de um próximo evento não tenta confirmar de novo.

**Efeito.** O cliente pode não receber a confirmação de saída enquanto os logs afirmam que recebeu. A supressão permanece válida; não se confunde falha da confirmação com falha em bloquear o contato.

**Evidência de fonte:**
- [supabase/functions/_shared/evolution-webhook-messages.ts:532–561](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-messages.ts#L532) — `opt-out acknowledgement`; SHA-256 `232baff04c754c6407275bbdc89e0ca439c533cfb58ad0ec603c0afd3d727aec`.
- [supabase/functions/_shared/evolution-send.ts:31–58](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-send.ts#L31) — `evoFetch returns Response`; SHA-256 `02c4039199552dd1576b361fb8ecafa601a23f01f9c3609b8a3e36285aeb24d8`.

**Probes:** P06.

**Aceite da correção:**
- Classificar status e formato da resposta; registrar accepted/rejected/unknown com evidência do provedor.
- Controlar timeout até consumir o corpo.
- Se confirmação for garantida pelo requisito, usar outbox por source_message_id; não reenviar após resposta ambígua sem reconciliação.

**Relações, sem duplicar:** R2-API-006.

**Limite da conclusão.** Não houve envio a destinatário real; apenas fetch interceptado com resposta sintética 500.

### R2-API-009 — Download de mídia do webhook aceita URL arbitrária sem política de egress

**P1 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Payload aceito controla mediaUrl/URL de mídia, ou o provedor devolve URL não confiável. O modo de autenticação do webhook e a rede do runtime determinam a exploração efetiva.

**Comportamento observado.** persistIncomingMedia só exige startsWith(http); persistMediaToStorage chama fetch diretamente, segue redirecionamentos padrão e consome arrayBuffer inteiro antes de validar conteúdo. Caminhos de sticker/avatar também fazem download direto. P10 passou URL loopback à função real e confirmou que chegou ao fetch mock sem rejeição.

**Efeito.** Há caminho de SSRF no servidor e ausência de teto de bytes para downloads. O probe comprova o destino aceito pelo código, não acesso a serviço interno, leitura de segredo ou exfiltração em produção.

**Evidência de fonte:**
- [supabase/functions/_shared/evolution-webhook-messages.ts:237–253](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-messages.ts#L237) — `persistIncomingMedia`; SHA-256 `232baff04c754c6407275bbdc89e0ca439c533cfb58ad0ec603c0afd3d727aec`.
- [supabase/functions/_shared/evolution-media.ts:45–67](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-media.ts#L45) — `persistMediaToStorage`; SHA-256 `0c06496b37b3effcafcf75700c21301960a20cdca722c888ffc3d020ea80efd4`.
- [supabase/functions/_shared/evolution-webhook-messages.ts:648–663](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-messages.ts#L648) — `sticker download`; SHA-256 `232baff04c754c6407275bbdc89e0ca439c533cfb58ad0ec603c0afd3d727aec`.
- [supabase/functions/_shared/evolution-helpers.ts:327–350](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-helpers.ts#L327) — `persistProfilePicture`; SHA-256 `7a0ff6fb539f544abeb4a7b46e594d0ee027d5e674d8c398f640e6da7373c016`.

**Probes:** P10.

**Aceite da correção:**
- Validar protocolo, destino DNS/IP e cada redirecionamento antes de ler o corpo, usando a política de egress canônica.
- Rejeitar loopback/link-local/privado conforme política e impor teto de bytes em streaming.
- Testar URL pública permitida, redirecionamento para destino bloqueado e corpo maior que o limite sem rede real.

**Relações, sem duplicar:** R2-API-021.

**Limite da conclusão.** Teto de duração existe em alguns downloads; ele não substitui controle de destino/volume. Não foi realizado probe SSRF contra rede real.

### R2-API-010 — Horário comercial salvo, worker e scheduler usam contratos diferentes

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** business_hours_only habilitado; configuração de talkx_settings.business_hours difere do padrão, ou possui horário malformado.

**Comportamento observado.** O schema/seed guarda objeto JSONB; parseBusinessHours aceita somente string JSON. O scheduler chama selectResumableCampaigns sem carregar business_hours, e esse helper usa deliveryWindowStatus sem configuração. A validação do horário comercial, ao contrário da janela de campanha, não rejeita NaN. P09 demonstrou objeto rejeitado, decisão divergente às 20h30 para janela configurada 20–22 e horário malformado aceito.

**Efeito.** Configurações podem ser ignoradas e campanha pode retomar/parar fora do horário pretendido. Corrigir somente o parser não corrige a retomada automática, que continua usando 08–18 seg–sex.

**Evidência de fonte:**
- [supabase/functions/_shared/talkx-window.ts:33–49](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/talkx-window.ts#L33) — `parseBusinessHours`; SHA-256 `18833512cfb4500ff281be4c8d2ce61a82801c9bd66cecd514e929c52c3b6304`.
- [supabase/functions/_shared/talkx-window.ts:102–118](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/talkx-window.ts#L102) — `business-hour checks`; SHA-256 `18833512cfb4500ff281be4c8d2ce61a82801c9bd66cecd514e929c52c3b6304`.
- [supabase/functions/talkx-send/index.ts:318–338](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/talkx-send/index.ts#L318) — `loadBusinessHoursAndDailyLimit`; SHA-256 `914f2027d6c64b19071c1ba03ac328ede5d2c9a267c32303fb3b979b300625ac`.
- [supabase/functions/_shared/talkx-resume-policy.ts:129–137](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/talkx-resume-policy.ts#L129) — `resume window`; SHA-256 `043f7225977b1d726f362a76f263a356ff5751beea8821b95985daa5f44f45c4`.
- [supabase/functions/talkx-scheduler/index.ts:195–199](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/talkx-scheduler/index.ts#L195) — `resume decision call`; SHA-256 `c3f17fb176be463dda3332d617c710737da2ababef52ae721d721df1d7489843`.
- [supabase/migrations/20260930410000_talkx_settings_replay_idempotent.sql:21–40](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260930410000_talkx_settings_replay_idempotent.sql#L21) — `JSONB setting and seed`; SHA-256 `d22b85ac2b209d0c4f6764a9b2049e33a08680043799a3c2fc0a05fda9981c2c`.

**Probes:** P09.

**Aceite da correção:**
- Parser aceita o contrato JSONB real e valida HH:MM/dias, inclusive faixas.
- Scheduler e send recebem a mesma configuração e o mesmo relógio.
- Teste de ida e volta config persistida → worker → pause → scheduler cobre horário customizado e entrada inválida.

### R2-API-011 — Gmail webhook/cron avançam cursor compartilhado sem aplicar todo o histórico

**P1 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Conta ativa usa webhook ou cron; há paginação de histórico, mudança de labels/deleção, falha por mensagem, ou mensagem alterada que não está na seleção recente de inbox.

**Comportamento observado.** gmail-webhook lê uma página somente de messageAdded, ignora nextPageToken, pula GET de mensagem com erro e não verifica erros de upsert; depois grava historyData.historyId. gmail-cron-sync também consulta só messageAdded/uma página; cria IDs alterados mas descarta esses IDs e sincroniza a lista recente de inbox limitada a 50. Em ambos, history_id é o mesmo consumido pelo incremental manual, que trata quatro tipos e preserva cursor em falhas de mensagens.

**Efeito.** Eventos ainda não aplicados ficam atrás do cursor e podem deixar de aparecer em próximos incrementais. Mensagens, labels e remoções locais divergem do Gmail; o problema não se limita a ter uma interface sem botão de próxima página. Escritas concorrentes do cursor também não usam compare-and-swap.

**Evidência de fonte:**
- [supabase/functions/gmail-webhook/index.ts:163–204](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/gmail-webhook/index.ts#L163) — `history page and message fetch`; SHA-256 `ce7b56638d35522933152ce280c3034336d43caee024a40eb46d386c7211ff1e`.
- [supabase/functions/gmail-webhook/index.ts:223–254](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/gmail-webhook/index.ts#L223) — `unchecked persistence`; SHA-256 `ce7b56638d35522933152ce280c3034336d43caee024a40eb46d386c7211ff1e`.
- [supabase/functions/gmail-webhook/index.ts:275–302](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/gmail-webhook/index.ts#L275) — `advance and acknowledge`; SHA-256 `ce7b56638d35522933152ce280c3034336d43caee024a40eb46d386c7211ff1e`.
- [supabase/functions/gmail-cron-sync/index.ts:33–58](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/gmail-cron-sync/index.ts#L33) — `cron incremental and full cursor`; SHA-256 `7471d0a32274d655ddbbd92479acfd6daf220e5492fd856d85cbf9329c69211a`.
- [supabase/functions/gmail-sync/index.ts:105–155](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/gmail-sync/index.ts#L105) — `manual incremental contract`; SHA-256 `85ee9e4b525e6bf15e101ac1455ff08ccdf4d623ad98d05c831e62079cb0f18b`.

**Aceite da correção:**
- Um pipeline incremental canônico por conta processa todas as páginas/tipos e os IDs realmente alterados.
- Cursor só avança após durabilidade dos efeitos; falha conserva ponto recuperável.
- Testes offline: duas páginas, remoção/label, GET falho, upsert falho, duas invocações concorrentes e recuperação de history 404.

**Relações, sem duplicar:** OTH-006.

**Fonte primária externa:** [https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list); [https://developers.google.com/workspace/gmail/api/guides/sync](https://developers.google.com/workspace/gmail/api/guides/sync).

**Limite da conclusão.** OTH-006 é paginação do sync manual/listagem; este é perda de eventos no cursor compartilhado. Não foi consultada conta Gmail real.

### R2-API-012 — Gmail webhook não persiste metadados de anexos exigidos para download

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Mensagem com anexo é inserida pelo gmail-webhook e não foi posteriormente hidratada por syncMessageIds/manual/cron.

**Comportamento observado.** O webhook grava apenas has_attachments, com inspeção rasa de parts; não escreve email_attachments. get-attachment exige uma linha local com email_message_id e gmail_attachment_id antes de chamar Gmail. O helper canônico extrai anexos recursivamente e grava essa linha, evidenciando contratos diferentes.

**Efeito.** Anexo recebido por push pode não ser enumerável e o download sob demanda retorna 404 apesar de existir no Gmail. Uma sincronização posterior pode reparar, mas o próprio cursor do webhook pode excluir o evento de reprocessamento.

**Evidência de fonte:**
- [supabase/functions/gmail-webhook/index.ts:235–254](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/gmail-webhook/index.ts#L235) — `message without attachment rows`; SHA-256 `ce7b56638d35522933152ce280c3034336d43caee024a40eb46d386c7211ff1e`.
- [supabase/functions/_shared/gmail-helpers.ts:165–196](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/gmail-helpers.ts#L165) — `recursive attachment persistence`; SHA-256 `5ce618f441d37a08a665bfb17fb5d97b51c5fa9123025dd025a012c082a82b60`.
- [supabase/functions/gmail-sync/index.ts:184–193](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/gmail-sync/index.ts#L184) — `get-attachment ownership contract`; SHA-256 `85ee9e4b525e6bf15e101ac1455ff08ccdf4d623ad98d05c831e62079cb0f18b`.

**Aceite da correção:**
- Webhook reutiliza hidratador canônico e grava anexos com o ID local da mensagem.
- Fixture MIME aninhado recebida exclusivamente pelo webhook permite enumeração e download autorizado.
- Teste negativo continua rejeitando attachment de outra mensagem/conta.

**Relações, sem duplicar:** R2-API-011, OTH-006.

**Limite da conclusão.** O guard de ownership do download deve ser preservado; removê-lo não corrige o produtor incompleto.

### R2-API-013 — Heartbeat Multiplix descarta o builder RPC e não renova o lease

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Item está claimed e o processamento alcança o intervalo de 30 segundos, especialmente com presença/espera/mídia lentas.

**Comportamento observado.** setInterval executa void supabase.rpc(heartbeat_multiplix_item). O SDK PostgREST é thenable e despacha a requisição ao consumir then; o retorno é descartado sem await/.then. P14 executou o statement exato: um builder criado, zero consumo. Além disso, continue no opt-out tardio não passa por stopHeartbeat.

**Efeito.** O lease de 90 segundos pode vencer sem a renovação anunciada pelo comentário. Conforme revisão SQL paralela, antes do marcador de envio outro worker pode ganhar o token e o antigo recebe conflito; após o marcador, sweeper pode colocar outcome_unknown e rejeitar conclusão tardia. Não se deduz duplicação automática: há fencing por claim_token.

**Evidência de fonte:**
- [supabase/functions/multiplix-send/index.ts:507–526](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/multiplix-send/index.ts#L507) — `heartbeat timer`; SHA-256 `c14c543d34b52761a77dccf371cbdb3a26d8952aa2e35d1e4c00fc4acebcadfc`.
- [supabase/functions/multiplix-send/index.ts:567–579](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/multiplix-send/index.ts#L567) — `late optout continue`; SHA-256 `c14c543d34b52761a77dccf371cbdb3a26d8952aa2e35d1e4c00fc4acebcadfc`.
- [supabase/functions/multiplix-send/index.ts:700–704](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/multiplix-send/index.ts#L700) — `cleanup paths`; SHA-256 `c14c543d34b52761a77dccf371cbdb3a26d8952aa2e35d1e4c00fc4acebcadfc`.

**Probes:** P14.

**Aceite da correção:**
- Callback consome a RPC, verifica error/result e não sobrepõe heartbeats.
- Cleanup roda em finally inclusive no opt-out tardio.
- Teste com tempo virtual e cliente lazy prova renovação antes do vencimento; SQL mantém fencing e sweeper seguro.

**Fonte primária externa:** [https://github.com/supabase/supabase-js/blob/master/packages/core/postgrest-js/src/PostgrestBuilder.ts](https://github.com/supabase/supabase-js/blob/master/packages/core/postgrest-js/src/PostgrestBuilder.ts).

**Limite da conclusão.** A fonte primária atual do SDK foi recuperada via busca; tag v2.87.1 não foi baixada. P14 é probe do statement contra contrato thenable, não execução do pacote remoto. Efeitos SQL conferidos pelo agente database, não por live DB.

### R2-API-014 — Falha ao consultar privacidade transforma atualização parcial em abertura de outros campos

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Modo GO; atualização parcial; GET /user/privacy falha ou não retorna data com os valores, mas o POST subsequente é aceito.

**Comportamento observado.** current começa vazio. Erro de GET é ignorado. pick usa all para todo campo não informado e sem valor atual. P12 comprovou mudança profile=contacts acompanhada de seis outros campos all depois de GET 503.

**Efeito.** A ação parcial pode ampliar visibilidade/contato da conta em campos que o operador não alterou. O comentário promete preservar o resto, mas o fallback não preserva.

**Evidência de fonte:**
- [supabase/functions/evolution-api/index.ts:771–793](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/evolution-api/index.ts#L771) — `update-privacy merge`; SHA-256 `227d16c9e5431bfc0bae0cf833e1d0b0fcce5e822f98ffbc25be7f27865e0cdd`.
- [supabase/functions/_shared/evolution-go-routes.ts:283–293](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-go-routes.ts#L283) — `privacy body translation`; SHA-256 `8da3c5c3c387949f5dc1143a1f1ca70412b9d4ff1d200754f09c0930f52f954d`.

**Probes:** P12.

**Aceite da correção:**
- Sem snapshot atual válido, recusar atualização parcial e informar erro recuperável.
- Validação por enum e teste de todos os campos ausentes/retornados.
- GET falho deve produzir zero escrita posterior ao provedor.

**Relações, sem duplicar:** R2-API-001.

### R2-API-015 — Controle de sessão usa rotas GO mesmo com EVOLUTION_API_FLAVOR=v2

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Instalação pretende utilizar o modo v2, suportado pelo proxy/tradutor por variável de configuração.

**Comportamento observado.** connect, status e disconnect executam fetch direto em /instance/connect, /instance/status e /instance/logout sem ramo v2 nem nome de instância no path. A variável isGoFlavor só distingue outras ações. P13 comprovou status v2 atingindo a rota GO.

**Efeito.** A opção de configuração não fornece compatibilidade coerente para ciclo de sessão. A conexão pode ser criada/listada por caminhos v2 enquanto status/pareamento/logout usam outro contrato.

**Evidência de fonte:**
- [supabase/functions/evolution-api/index.ts:120–120](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/evolution-api/index.ts#L120) — `isGoFlavor`; SHA-256 `227d16c9e5431bfc0bae0cf833e1d0b0fcce5e822f98ffbc25be7f27865e0cdd`.
- [supabase/functions/evolution-api/index.ts:384–411](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/evolution-api/index.ts#L384) — `connect route`; SHA-256 `227d16c9e5431bfc0bae0cf833e1d0b0fcce5e822f98ffbc25be7f27865e0cdd`.
- [supabase/functions/evolution-api/index.ts:573–575](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/evolution-api/index.ts#L573) — `status route`; SHA-256 `227d16c9e5431bfc0bae0cf833e1d0b0fcce5e822f98ffbc25be7f27865e0cdd`.
- [supabase/functions/evolution-api/index.ts:627–635](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/evolution-api/index.ts#L627) — `disconnect route`; SHA-256 `227d16c9e5431bfc0bae0cf833e1d0b0fcce5e822f98ffbc25be7f27865e0cdd`.
- [supabase/functions/_shared/evolution-api-proxy.ts:116–145](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-api-proxy.ts#L116) — `v2 bypass contract`; SHA-256 `a5c696eeebe4107ac547ce292da2b577620573e691aacdd2a08b3de3b3075816`.

**Probes:** P13.

**Aceite da correção:**
- Escolher explicitamente rotas/credenciais e normalização por flavor em todas as ações de sessão.
- Matriz offline go/v2 verifica método, path, nome de instância e resposta.
- Se v2 saiu do escopo, rejeitar a configuração e documentar essa decisão em vez de mantê-la parcialmente funcional.

**Relações, sem duplicar:** TRA-002.

**Limite da conclusão.** Não foi consultado servidor Evolution v2 real; confirma-se a incoerência do contrato local de configuração.

### R2-API-016 — Status não string aceito pelo envelope derruba lote de receipts

**P3 · hypothesis · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Recebimento de entry.status numérico/objeto em payload que passa no envelope leniente; incidência em versões de provedor não foi confirmada.

**Comportamento observado.** O schema aceita data unknown/record. O handler apenas faz cast TypeScript para string e chama toLowerCase em runtime. P08 confirmou TypeError com status=3.

**Efeito.** Uma entrada malformada interrompe o lote e gera erro HTTP, podendo repetir eventos e bloquear recibos válidos presentes depois dela. O contraexemplo é de robustez do parser, não prova de incompatibilidade com payload válido do provedor atual.

**Evidência de fonte:**
- [supabase/functions/_shared/schemas.ts:576–594](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/schemas.ts#L576) — `Evolution envelope schemas`; SHA-256 `7fb6f10bf93306c84c7a4a84b68cb6e53f855e4aa04045dd1e8b96fead3c6cc7`.
- [supabase/functions/_shared/evolution-webhook-msg-handlers.ts:82–94](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-webhook-msg-handlers.ts#L82) — `status parse`; SHA-256 `da51efad6032e57a63405c7fd3026337437b3622bf400ff8aa65fc61ca24f694`.

**Probes:** P08.

**Aceite da correção:**
- Validar status por schema de evento antes de processar lote.
- Desconhecido/malformado possui saída explícita e não bloqueia entradas válidas.
- Capturar fixture sanitizada de cada versão do provedor para decidir se números devem ser mapeados ou rejeitados.

**Limite da conclusão.** Classificado como hipótese de impacto no tráfego; o crash para a entrada sintética está reproduzido.

### R2-API-017 — scheduled_messages tem produtor e estados, mas executor não foi encontrado no código versionado

**P2 · gap · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** A funcionalidade depende dos artefatos versionados auditados; nenhum agendador externo adicional foi demonstrado.

**Comportamento observado.** useScheduledMessages insere pendências, lista e cancela. A busca em Edge Functions/scripts não encontrou consumo da tabela. A revisão independente de 779 migrations encontrou apenas DDL/RLS/índice, updated_at e backfill de URL, sem cron/função de envio dessa fila.

**Efeito.** Não há evidência suficiente para declarar entrega agendada funcional, autorizada ou idempotente. Este gap permanece mesmo depois de corrigir o falso sucesso do diálogo, que é outro achado do agente inbox.

**Evidência de fonte:**
- [src/hooks/chat/useScheduledMessages.ts:44–104](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/chat/useScheduledMessages.ts#L44) — `schedule/cancel mutations`; SHA-256 `729dcadc6070c3d0ac62a6630c20652773b2a62fde0bc2edf438751a6ddef32d`.
- [supabase/migrations/20251220182411_dd03d6a1-4f98-410e-a411-1f2486626de2.sql:1–58](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20251220182411_dd03d6a1-4f98-410e-a411-1f2486626de2.sql#L1) — `scheduled_messages schema`; SHA-256 `57d0566fa0036f3777b5b5d4e4a7426c8a3fc31a570825f40175034d9aec9600`.

**Aceite da correção:**
- Identificar e versionar o consumidor real ou implementar executor com claim, autorização por contato/conexão, estados recuperáveis e reconciliação.
- Demonstração controlada do percurso pending → enviado/failed, incluindo cancelamento e corrida entre workers.
- Se o consumidor for externo, anexar seu código/configuração e evidência sanitizada; não basta insert com toast de sucesso.

**Relações, sem duplicar:** reaudit_inbox: ScheduleMessageDialog async callback.

**Limite da conclusão.** Não afirma que nunca exista scheduler em produção. N8N/serviços externos não fornecidos não foram inspecionados.

### R2-API-018 — Bitrix pode devolver sucesso de criação mesmo quando o provedor rejeita

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Usuário autorizado chama push_contact/create_lead_from_conversation; Bitrix devolve resposta JSON com erro, inclusive HTTP de falha.

**Comportamento observado.** Os dois ramos especiais fazem fetch/json e retornam success=true sem inspecionar Response.ok, campo error ou ID result. O ramo genérico de Bitrix verifica responseData.error, mas essa proteção não cobre os especiais. useBitrixApi exibe toasts de criação a partir de success. sync_contacts também omite os erros individuais de upsert do resultado.

**Efeito.** Operador recebe confirmação de contato/lead inexistente; falhas de sincronização local podem ser reduzidas a contagem menor sem lista de erros. O fluxo está alcançável por hooks versionados.

**Evidência de fonte:**
- [supabase/functions/bitrix-api/index.ts:157–172](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/bitrix-api/index.ts#L157) — `sync error suppression`; SHA-256 `7f699943d5e2155e0deff5f93499e801ec6b16614e38d7d36ac235943f0b39dc`.
- [supabase/functions/bitrix-api/index.ts:176–211](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/bitrix-api/index.ts#L176) — `special create actions`; SHA-256 `7f699943d5e2155e0deff5f93499e801ec6b16614e38d7d36ac235943f0b39dc`.
- [supabase/functions/bitrix-api/index.ts:217–232](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/bitrix-api/index.ts#L217) — `generic error handling`; SHA-256 `7f699943d5e2155e0deff5f93499e801ec6b16614e38d7d36ac235943f0b39dc`.
- [src/hooks/integrations/useBitrixApi.ts:191–216](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useBitrixApi.ts#L191) — `UI success consumers`; SHA-256 `d3b0a5b13b12473c9f871c5085e84e3274f46b4f2702cffcb0c4fe4be3992684`.

**Aceite da correção:**
- Padronizar classificação de HTTP + envelope + ID antes de declarar sucesso.
- Resposta JSON de erro em 200 e erro em 4xx/5xx não acionam toast de sucesso.
- Sync retorna falhas por item ou estado parcial explícito; dados de erro são sanitizados.

**Limite da conclusão.** Não foi usado Bitrix real; raciocínio estático sobre resposta JSON adversa e consumidor atual.

### R2-API-019 — Webhook WhatsApp oficial confirma entrada sem persistir mensagem e pode rebaixar status

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Instalação usa whatsapp-webhook como receptor da API oficial, ou envia eventos de status fora de ordem a esse endpoint.

**Comportamento observado.** value.messages só é percorrido para log e depois retorna success=true. Para statuses há update por external_id, sem correlação de phone_number_id/conexão e sem proteção monotônica: um sent tardio sobrescreve read. O schema lê metadata.phone_number_id, mas não o usa na persistência.

**Efeito.** Mensagens recebidas por esse caminho não chegam ao inbox; reentrega é confirmada como concluída. Recibos fora de ordem podem regredir a apresentação de entrega. Não se transfere esse resultado automaticamente ao Evolution, que tem outro handler.

**Evidência de fonte:**
- [supabase/functions/whatsapp-webhook/index.ts:15–38](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/whatsapp-webhook/index.ts#L15) — `official envelope`; SHA-256 `efba6dc0d7878ebe2d1ba0e559b62a75d84c82853355596137c614b8a6f0b0d1`.
- [supabase/functions/whatsapp-webhook/index.ts:98–132](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/whatsapp-webhook/index.ts#L98) — `status mutation / incoming log / ACK`; SHA-256 `efba6dc0d7878ebe2d1ba0e559b62a75d84c82853355596137c614b8a6f0b0d1`.

**Aceite da correção:**
- Definir se API oficial é suportada. Se for, usar ingestão durável e correlação da conta/phone_number_id.
- Fixtures inbound entram no inbox e replay não duplica.
- Sequência read → sent preserva read, e evento de outra conta não muda alvo.

**Limite da conclusão.** Endpoint está versionado e configurado, mas uso real da API oficial não foi demonstrado. O gap de deploy é explicitamente separado do comportamento estático.

### R2-API-020 — Distribuição A/B por hash depende da ordem não especificada das variantes

**P3 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Variantes e pesos permanecem iguais; banco devolve as linhas em outra ordem antes da persistência do snapshot ou numa nova atribuição.

**Comportamento observado.** pickVariant consulta sem order e percorre a sequência cumulativa dos pesos. O hash é estável, mas a posição dos intervalos depende da ordem recebida. P15 chamou o export real com A/B e depois B/A, mesmo recipient/template/pesos; o ID escolhido mudou.

**Efeito.** Promessa de atribuição estável em retry/auditoria não é sustentada antes de um snapshot bem sucedido. Snapshot já salvo reduz o risco para recipient existente; não corrige o algoritmo nem a reprodutibilidade geral.

**Evidência de fonte:**
- [supabase/functions/talkx-send/process-recipient.ts:32–73](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/talkx-send/process-recipient.ts#L32) — `stableVariantHash / pickVariant`; SHA-256 `a4b5db6fc4eec0ae64e6e88f0516eddbcffb185c2e6accddf9a4ee2c5149e558`.

**Probes:** P15.

**Aceite da correção:**
- Ordenar variantes por chave canônica antes de construir intervalos de peso.
- Mesma configuração e recipient retornam mesma variante com permutações arbitrárias de rows.
- Preservar decisão persistida quando pesos/conteúdo são alterados.

**Limite da conclusão.** Não alega viés estatístico adicional; demonstra instabilidade de identidade da variante.

### R2-API-021 — Autenticidade dos webhooks permanece apenas observada em caminhos públicos

**P1 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Handlers publicados com a configuração versionada; para Evolution, enforcement em shadow/default. Configuração real de secrets e proxy externo não foi consultada.

**Comportamento observado.** verify_jwt=false é apropriado a webhooks, mas os gates próprios de Gmail e WhatsApp oficial não bloqueiam ausência/assinatura inválida. Gmail somente decodifica claims OIDC. Evolution permite requisição sem HMAC e usa token enforcement default shadow; token mode existe e altera essa condição. Os handlers depois acessam banco/provedor com privilégio de servidor.

**Efeito.** Payload sem autenticidade pode disparar sincronização Gmail ou alterações de estado/mensagens. Em Evolution o token mode reduz esse risco, porém sua configuração real é desconhecida e seleção global de token tem o problema TRA-002. Não se afirma que todos os ambientes estejam abertos.

**Evidência de fonte:**
- [supabase/config.toml:8–15](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/config.toml#L8) — `public webhook gateway configuration`; SHA-256 `872b4f055b24411929c0a8f0af1a72a220bd4326acd813b44aeb47bc6cd113af`.
- [supabase/functions/evolution-webhook/index.ts:47–68](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/evolution-webhook/index.ts#L47) — `HMAC and token defaults`; SHA-256 `35675fb65e4645935a514f5aa5282c52b67e03914a6d555dc132f468652488df`.
- [supabase/functions/evolution-webhook/index.ts:130–149](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/evolution-webhook/index.ts#L130) — `conditional enforcement`; SHA-256 `35675fb65e4645935a514f5aa5282c52b67e03914a6d555dc132f468652488df`.
- [supabase/functions/gmail-webhook/index.ts:113–131](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/gmail-webhook/index.ts#L113) — `OIDC observation only`; SHA-256 `ce7b56638d35522933152ce280c3034336d43caee024a40eb46d386c7211ff1e`.
- [supabase/functions/whatsapp-webhook/index.ts:79–87](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/whatsapp-webhook/index.ts#L79) — `HMAC result ignored`; SHA-256 `efba6dc0d7878ebe2d1ba0e559b62a75d84c82853355596137c614b8a6f0b0d1`.
- [supabase/functions/_shared/hmac-validation.ts:397–420](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/hmac-validation.ts#L397) — `logGmailOidcAuthShadow`; SHA-256 `f6a785a3da09e2b11a9d074ac8827295f8d32c0eec535547c5a6c08d367434da`.

**Aceite da correção:**
- Gate próprio autentica emissor e conta/instância antes de qualquer efeito.
- Gmail verifica assinatura/JWKS, issuer, audience e identidade do emissor esperado; Meta verifica o HMAC do corpo.
- Rollout Evolution deve resolver credencial por instância e compatibilidade GO antes de exigir autenticação; negativos não fazem DB/fetch privilegiado.
- Evidência sanitizada da configuração implantada e testes com ausência/assinatura inválida/replay documentam fechamento.

**Relações, sem duplicar:** TRA-002, R2-API-003, R2-API-009.

**Limite da conclusão.** Shadow é intencional nos comentários; intenção de rollout não equivale a controle efetivo. Não houve tentativa de acesso sem autorização a endpoint real.

### R2-API-022 — Rotinas de e-mail, relatório, encerramento e recuperação executam privilégio de servidor sem autorizar o chamador

**P1 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** A chamada é admitida pelo gateway; um usuário válido sem papel administrativo já basta como precondição conservadora. send-email requer Resend configurado; auto-close requer configuração habilitada e contatos elegíveis; relatório exige conhecer um reportId existente. Não foi verificado o estado do gateway implantado. Para recuperação de áudio, há mensagens elegíveis e credenciais de Storage/provedor; dry_run pode retornar metadados mesmo sem recuperação.

**Comportamento observado.** send-email aceita destinatários, assunto, corpo, reply_to, cópias e anexos do payload e usa a chave Resend sem getUser/requireAuth/role. O remetente fixo e o rate limit por IP não autorizam a ação. send-scheduled-report lê a configuração e dados agregados com service role, envia e devolve reportData sem verificar o papel. auto-close-conversations seleciona e modifica contatos globalmente com service role sem segredo de cron nem usuário autorizado. recover-corrupted-audios também não tem auth/role/segredo de cron: varre áudio global, aceita batch_size/offset/dry_run do chamador e, por padrão, tenta sobrescrever Storage e media_url. dry_run revela a instância e uma amostra de IDs externos.

**Efeito.** Chamadores admitidos podem usar o relay do projeto para conteúdo e destinatários arbitrários, disparar relatório conhecido e obter seus agregados, ou antecipar o encerramento global. A política SQL de scheduled_reports restringe leitura a admin/supervisor, por isso não se presume que um agente consiga enumerar IDs pelo frontend. A rotina de recuperação permite iniciar trabalho e alterações globais de mídia fora do papel administrativo.

**Evidência de fonte:**
- [supabase/functions/send-email/index.ts:4–48](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/send-email/index.ts#L4) — `handler, IP limit and Resend payload`; SHA-256 `d5d01911fd0dbfe6c7c5f40f4b6e49832af7be76f8cadafe727ee55cc3955d83`.
- [supabase/functions/send-scheduled-report/index.ts:6–25](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/send-scheduled-report/index.ts#L6) — `service client and global report lookup`; SHA-256 `ec4926821b789b093dfe3088c8e6e44ca52b3d72078fffbf3b43b69b0d6cc330`.
- [supabase/functions/send-scheduled-report/index.ts:93–111](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/send-scheduled-report/index.ts#L93) — `dispatch and reportData response`; SHA-256 `ec4926821b789b093dfe3088c8e6e44ca52b3d72078fffbf3b43b69b0d6cc330`.
- [supabase/functions/auto-close-conversations/index.ts:4–38](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/auto-close-conversations/index.ts#L4) — `unguarded service scan`; SHA-256 `c1536c9e9c9b84543773ac854c601360dd518e5478ebab8ef4160bda9d7f5ec3`.
- [supabase/functions/auto-close-conversations/index.ts:51–73](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/auto-close-conversations/index.ts#L51) — `global closure effects`; SHA-256 `c1536c9e9c9b84543773ac854c601360dd518e5478ebab8ef4160bda9d7f5ec3`.
- [supabase/functions/recover-corrupted-audios/index.ts:42–61](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/recover-corrupted-audios/index.ts#L42) — `unguarded service selection`; SHA-256 `dd6f1d50dfdbfa10d3385cbcc123af43904718d8372212c0d7b55f3e0383c1ac`.
- [supabase/functions/recover-corrupted-audios/index.ts:83–87](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/recover-corrupted-audios/index.ts#L83) — `dry-run metadata`; SHA-256 `dd6f1d50dfdbfa10d3385cbcc123af43904718d8372212c0d7b55f3e0383c1ac`.
- [supabase/functions/recover-corrupted-audios/index.ts:119–125](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/recover-corrupted-audios/index.ts#L119) — `storage overwrite and message update`; SHA-256 `dd6f1d50dfdbfa10d3385cbcc123af43904718d8372212c0d7b55f3e0383c1ac`.

**Aceite da correção:**
- Exigir identidade e autorização de ação antes do uso da chave Resend ou cliente service.
- Rotinas automáticas aceitam apenas credencial dedicada de cron; execução manual exige a permissão equivalente.
- Invites usam template e destinatário vinculados ao fluxo de convite autorizado.
- Agente comum não envia e-mail arbitrário, não recebe reportData de terceiros e não dispara encerramento; nenhum efeito ocorre após rejeição.
- Recuperação de mídia exige autorização administrativa antes de scan/download/upload, incluindo dry_run; migrate-media-storage já possui gate administrativo e é controle negativo desta revisão.

**Relações, sem duplicar:** R2-AUTH-015.

**Limite da conclusão.** O gate externo não foi exercitado. Não se declara acesso anônimo: a lacuna de autorização de aplicação permanece para qualquer usuário admitido sem o papel exigido.

### R2-API-023 — Relatório agendado avança last_sent_at e anuncia sucesso após falha de envio

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Relatório existente; Resend ausente ou resposta HTTP não 2xx para um ou todos os destinatários. O fetch precisa resolver em HTTP: exceção de rede é capturada no catch externo e não segue esse ramo.

**Comportamento observado.** A ausência da chave ou de destinatários pula todo envio. Respostas HTTP de erro apenas geram log. Em seguida o handler atualiza last_sent_at/next_send_at e retorna success=true, também sem examinar o retorno do UPDATE. Não existe estado por destinatário que preserve falhas parciais para retomada.

**Efeito.** A aplicação pode registrar um ciclo como enviado sem entrega e postergar sua próxima execução. Se parte do lote foi aceita, repetir a operação inteira também pode repetir e-mails já aceitos.

**Evidência de fonte:**
- [supabase/functions/send-scheduled-report/index.ts:91–111](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/send-scheduled-report/index.ts#L91) — `email loop and unconditional schedule advancement`; SHA-256 `ec4926821b789b093dfe3088c8e6e44ca52b3d72078fffbf3b43b69b0d6cc330`.
- [supabase/functions/send-scheduled-report/index.ts:118–125](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/send-scheduled-report/index.ts#L118) — `calculateNextSend`; SHA-256 `ec4926821b789b093dfe3088c8e6e44ca52b3d72078fffbf3b43b69b0d6cc330`.

**Aceite da correção:**
- Falha de configuração ou recusa HTTP não marca o relatório como enviado.
- Persistir resultado por destinatário/tentativa e chave idempotente antes de confirmar o ciclo.
- Resposta distingue enviado, parcial e falha; retry processa somente destinos pendentes.
- Verificar o resultado do UPDATE e testar todos recusados, sucesso parcial e banco indisponível.

**Relações, sem duplicar:** R2-API-022.

**Limite da conclusão.** Nenhum e-mail real foi enviado; o erro de entrega é demonstrado pelo fluxo estático. Métricas e paginação do conteúdo do relatório são outra superfície e não foram usadas para inflar este achado.

### R2-API-024 — Diálogo ElevenLabs envia script e omite o campo inputs obrigatório do provedor

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Usuário autenticado usa o diálogo de múltiplas vozes com chave ElevenLabs configurada; contrato público atual de POST /v1/text-to-dialogue.

**Comportamento observado.** O frontend envia script corretamente ao contrato interno. A Edge encaminha esse mesmo nome no JSON externo, enquanto a referência oficial exige inputs, array de text/voice_id. Nenhuma tradução para inputs ocorre antes do POST.

**Efeito.** A funcionalidade montada nas configurações produz uma requisição incompatível com o contrato obrigatório do provedor e não pode contar com geração válida. A recusa concreta e seu status não foram medidos em uma conta real.

**Evidência de fonte:**
- [supabase/functions/elevenlabs-dialogue/index.ts:18–40](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/elevenlabs-dialogue/index.ts#L18) — `internal script to external POST`; SHA-256 `af1cf96e2cbe9c37a2ec002fcb2c11ccd508cdaceb6daf7935f87995bc9f4778`.
- [supabase/functions/_shared/schemas.ts:164–169](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/schemas.ts#L164) — `ElevenLabsDialogueSchema`; SHA-256 `7fb6f10bf93306c84c7a4a84b68cb6e53f855e4aa04045dd1e8b96fead3c6cc7`.
- [src/components/voice/ElevenLabsDialogue.tsx:52–91](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/voice/ElevenLabsDialogue.tsx#L52) — `generateDialogue consumer`; SHA-256 `02939066ef9eab5e8db0305d8cec246a32981dd145e16e4ff905e10c1fcd6d4b`.

**Aceite da correção:**
- Traduzir o contrato interno para inputs no adaptador ElevenLabs.
- Validar limites agregados de texto/vozes conforme contrato adotado e retornar erro útil antes do POST.
- Teste de contrato intercepta o JSON externo e exige inputs com text/voice_id; cenário válido chega ao retorno de áudio.

**Fonte primária externa:** [https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert).

**Limite da conclusão.** Documentação oficial consultada em 2026-10-04. A presença obrigatória de inputs está confirmada; não se afirma observação de HTTP422 real.

### R2-API-025 — Geração musical envia duração no nome e unidade do contrato de efeitos sonoros

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Administrador usa a geração de música da biblioteca, escolhe duração em segundos e a Edge acessa o endpoint /v1/music atual da ElevenLabs.

**Comportamento observado.** O consumidor oferece 5–60 segundos e envia duration. O ramo music monta duration_seconds; a API musical documenta music_length_ms. O corpo não transmite a duração escolhida no campo esperado nem converte segundos em milissegundos.

**Efeito.** A duração solicitada fica fora do contrato. Caso o provedor ignore o campo extra, a duração pode ser escolhida pelo modelo; caso o rejeite, a geração falha. Ambos os resultados concretos dependem da tolerância da versão implantada.

**Evidência de fonte:**
- [supabase/functions/elevenlabs-sfx/index.ts:22–42](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/elevenlabs-sfx/index.ts#L22) — `music request builder`; SHA-256 `71fffb25ec9eecf27bf751c18d09beb4c96ad896f6a655a7019daeb52f114146`.
- [src/components/settings/media-library/AIGenerateDialog.tsx:22–36](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/media-library/AIGenerateDialog.tsx#L22) — `duration invoke`; SHA-256 `d54fb270daefe283513adc98216defdda36e428ecefc064c3c5d30b8a4068c7b`.
- [src/components/settings/media-library/AIGenerateDialog.tsx:65–74](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/media-library/AIGenerateDialog.tsx#L65) — `music duration UI`; SHA-256 `d54fb270daefe283513adc98216defdda36e428ecefc064c3c5d30b8a4068c7b`.

**Aceite da correção:**
- Enviar music_length_ms = segundos * 1000 no ramo musical; preservar duration_seconds no ramo SFX quando compatível.
- Validar duração por modalidade e testar 5, 15 e 60 segundos no corpo externo.
- A prévia mostra duração real ou confirmação do provedor, sem apresentar a escolha local como duração comprovada.

**Fonte primária externa:** [https://elevenlabs.io/docs/api-reference/music/compose](https://elevenlabs.io/docs/api-reference/music/compose).

**Limite da conclusão.** Contrato externo confirmado em documentação oficial; não houve geração paga. Ignorar versus rejeitar campo desconhecido é condicionado, não observado.

### R2-API-026 — Worker de IA deixa lease expirar durante o handler e permite reexecução após efeito externo iniciado

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Job ai.generate efetivamente enfileirado, AI_JOBS_ENABLE_AI_GENERATE=1/true, handler leva mais de 120 segundos; outro tick executa o reaper e, depois do backoff, há nova tentativa disponível. A flag é desligada por padrão e não foi encontrado produtor ai.generate no frontend revisado.

**Comportamento observado.** O worker renova o lease para 120 segundos somente antes e depois do await do handler. Não há renovação durante a chamada. claim_ai_jobs/reap_ai_jobs recolocam jobs vencidos em queued sem distinguir efeito externo em andamento; a tokenização impede a liquidação antiga, mas não desfaz nem identifica o POST já realizado.

**Efeito.** Se a primeira chamada já chegou ao provedor e o resultado demora ou se perde, uma tentativa posterior pode gerar e cobrar novamente. A conclusão antiga é descartada quando perdeu o token. Não ocorre duplicação automática em jobs curtos nem quando a flag permanece desligada.

**Evidência de fonte:**
- [supabase/functions/ai-jobs-worker/index.ts:59–75](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/ai-jobs-worker/index.ts#L59) — `lease constants and feature flag`; SHA-256 `4f8e5a85285f11a80e571a1ce242b6948b3448ff731c0d67f7663504b516aa2d`.
- [supabase/functions/ai-jobs-worker/index.ts:151–188](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/ai-jobs-worker/index.ts#L151) — `handleAiGenerate external effect`; SHA-256 `4f8e5a85285f11a80e571a1ce242b6948b3448ff731c0d67f7663504b516aa2d`.
- [supabase/functions/ai-jobs-worker/index.ts:277–335](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/ai-jobs-worker/index.ts#L277) — `before/after heartbeat and fenced finish`; SHA-256 `4f8e5a85285f11a80e571a1ce242b6948b3448ff731c0d67f7663504b516aa2d`.
- [supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql:203–221](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql#L203) — `claim lease reaper`; SHA-256 `181539dcb1ab6cae5df0571f2f91592e67e60b4bdb40f594d519eafa13f403d3`.
- [supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql:390–406](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql#L390) — `reap_ai_jobs lease expiry`; SHA-256 `181539dcb1ab6cae5df0571f2f91592e67e60b4bdb40f594d519eafa13f403d3`.

**Aceite da correção:**
- Renovar durante execução com encerramento garantido do timer e perda de lease propagada ao handler.
- Preservar identidade de tentativa/efeito e não reenviar automaticamente quando o aceite externo é desconhecido.
- Impor prazo ponta a ponta incluindo corpo da resposta, ligado ao orçamento de lease.
- Cenário determinístico com dois workers, chamada lenta e reaper comprova uma decisão explícita sobre efeito incerto e ausência de cobrança duplicada por retry cego.

**Relações, sem duplicar:** IA-TIMEOUT-001.

**Limite da conclusão.** Fluxo SQL foi cruzado com a frente database. Não foi medido um job longo real; o finding explicita configuração e corrida necessárias. Producer/runtime da flag permanece desconhecido.

### R2-API-027 — Transcrição aceita mensagem visível sem mídia e baixa objeto escolhido pelo cliente com service role

**P1 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Usuário autenticado tem acesso a uma mensagem com media_url nula/vazia e conhece o caminho de um áudio de terceiro em bucket aprovado do projeto. O impacto de confidencialidade pressupõe que esse objeto não seja legível pelo chamador e seja legível pela service role. ElevenLabs configurado e cotas disponíveis.

**Comportamento observado.** assertMessageVisibleToCaller verifica apenas que a mensagem existe sob RLS e retorna ok com mediaUrl=null. O handler começa com requestedAudioUrl e só a substitui se mediaUrl for truthy. downloadAudio valida origem/bucket e depois usa service role para baixar o path. Não há vínculo entre esse objeto e a mensagem aprovada. P16 reproduziu o download do path de outro contato; P17 mostrou que a substituição funciona quando media_url está preenchida.

**Efeito.** O ID de uma mensagem de texto própria pode funcionar como autorização substituta para transcrever áudio privado de outro contato. O endpoint devolve transcription/words/speakers do objeto escolhido, sem exigir visibilidade de sua mensagem proprietária.

**Evidência de fonte:**
- [supabase/functions/_shared/ai-audio-authz.ts:61–78](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/ai-audio-authz.ts#L61) — `visible message with nullable media URL`; SHA-256 `4a8f377b2dc1b08c99916fcc060820cb55ea5b991a6a6c1514d307c2a33af24d`.
- [supabase/functions/ai-transcribe-audio/index.ts:100–118](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/ai-transcribe-audio/index.ts#L100) — `requested URL retained on missing canonical media`; SHA-256 `c73272af51caee03c03852dc1731199934414d75aea2d61df6b8938641883ee7`.
- [supabase/functions/ai-transcribe-audio/index.ts:31–60](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/ai-transcribe-audio/index.ts#L31) — `downloadAudio service storage`; SHA-256 `c73272af51caee03c03852dc1731199934414d75aea2d61df6b8938641883ee7`.
- [supabase/functions/ai-transcribe-audio/index.ts:209–221](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/ai-transcribe-audio/index.ts#L209) — `transcription returned to caller`; SHA-256 `c73272af51caee03c03852dc1731199934414d75aea2d61df6b8938641883ee7`.
- [supabase/functions/_shared/ssrf.ts:72–107](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/ssrf.ts#L72) — `origin/bucket parser does not authorize object`; SHA-256 `9330ea91548aeea4fb241e9eae651e258169c2a2b7bb0a59b6715c75bc42f097`.

**Probes:** P16, P17.

**Aceite da correção:**
- Mensagem sem mídia canônica válida deve ser recusada antes de qualquer download ou gasto.
- Verificar tipo e vínculo do objeto à mensagem visível; baixar exclusivamente a referência canônica autorizada.
- Teste usa mensagem de texto visível e URL privada de outro contato: rejeição e zero Storage/provedor.
- Preservar controle positivo de áudio canônico permitido e caminho interno de serviço explicitamente autorizado.

**Relações, sem duplicar:** IA-AUDIO-001.

**Limite da conclusão.** IA-AUDIO-001 anterior trata classificação só por nome/URL; este é bypass distinto no transcritor. Os probes compõem blocos exatos do handler com helpers reais, sem executar Zod nem STT integral; não houve acesso a áudio real de terceiro.

### R2-API-028 — Auto-close conta encerramento mesmo quando mensagem, closure e desatribuição falham

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Auto-close habilitado e ao menos um contato selecionado; uma ou mais escritas retornam erro no contrato PostgREST. Conflito do índice diário de closure (R2-DB-008) é um exemplo concreto possível, além de indisponibilidade.

**Comportamento observado.** As respostas dos INSERTs em messages/conversation_closures e do UPDATE em contacts são ignoradas. closedCount cresce incondicionalmente e o endpoint responde HTTP200. P18 fez as três escritas retornarem erro e reproduziu closed=1. As operações não formam unidade transacional: partes podem ser aplicadas e outras recusadas.

**Efeito.** Contadores e resposta afirmam encerramentos que não ocorreram; uma falha parcial pode deixar mensagem local, estado de conversa e atribuição divergentes. Um closure inserido com sucesso realmente aciona triggers de resolução/outbox CRM: o achado não afirma ausência total de fechamento por não usar RPC.

**Evidência de fonte:**
- [supabase/functions/auto-close-conversations/index.ts:51–82](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/auto-close-conversations/index.ts#L51) — `unchecked writes and unconditional closed count`; SHA-256 `c1536c9e9c9b84543773ac854c601360dd518e5478ebab8ef4160bda9d7f5ec3`.

**Probes:** P18.

**Aceite da correção:**
- Examinar cada erro e contar apenas encerramentos efetivamente confirmados.
- Encerramento, desatribuição e eventos derivados devem ter contrato transacional/idempotente, com precondição de inatividade revalidada.
- Falha ou conflito de closure preserva estado coerente e produz resposta de falha/parcial.
- Se mensagem de encerramento precisa chegar ao contato, sua entrega deve usar executor e confirmação verificáveis.

**Relações, sem duplicar:** R2-API-022, R2-DB-008.

**Limite da conclusão.** A frente database confirmou close_reason/outcome como TEXT, trigger de conversation_status=resolved e outbox CRM; esses efeitos existem em sucesso. A entrega externa da mensagem local não foi demonstrada. Nenhuma escrita real ocorreu no probe.

### R2-API-029 — Prévia e validação Multiplix aceitam destinatário de outro disparo

**P1 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Usuário autenticado possui um disparo existente associado ao seu profiles.id e conhece o UUID de destinatário de outro disparo. A Edge usa o cliente service role. Não depende de demonstrar que os fluxos de criação afetados por MX08 funcionem para toda conta.

**Comportamento observado.** loadOwnedDispatch resolve corretamente o profile e confere o dono. Porém loadRecipient busca apenas id e omite dispatch_id no SELECT. handlePreview só rejeita disparo diferente quando esse campo é não nulo: a projeção real deixa undefined e o teste é pulado. handleValidate usa recipient_id fornecido como amostra sem conferir pertença. P19/P20 executaram os handlers com projeção de colunas fiel e retornaram empresa/telefone ou valor bruto de placeholder de destinatário estrangeiro.

**Efeito.** Um disparo próprio serve como autorização substituta para ler dados de destinatário de outro disparo, inclusive nome, destino e variáveis que o template exponha. A prévia também pode combinar conteúdo de um disparo com público diferente do autorizado.

**Evidência de fonte:**
- [supabase/functions/multiplix-dispatch/actions/inspect.ts:147–169](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/multiplix-dispatch/actions/inspect.ts#L147) — `correct profile and dispatch ownership guard`; SHA-256 `6827c454b7fa4ccdee1d94ae609216f71bddea79f05fbca30ce441879479f5d4`.
- [supabase/functions/multiplix-dispatch/actions/inspect.ts:195–203](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/multiplix-dispatch/actions/inspect.ts#L195) — `recipient SELECT without dispatch correlation`; SHA-256 `6827c454b7fa4ccdee1d94ae609216f71bddea79f05fbca30ce441879479f5d4`.
- [supabase/functions/multiplix-dispatch/actions/inspect.ts:471–498](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/multiplix-dispatch/actions/inspect.ts#L471) — `optional membership check and foreign recipient response`; SHA-256 `6827c454b7fa4ccdee1d94ae609216f71bddea79f05fbca30ce441879479f5d4`.
- [supabase/functions/multiplix-dispatch/actions/inspect.ts:721–788](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/multiplix-dispatch/actions/inspect.ts#L721) — `validate foreign sample and placeholder response`; SHA-256 `6827c454b7fa4ccdee1d94ae609216f71bddea79f05fbca30ce441879479f5d4`.

**Probes:** P19, P20.

**Aceite da correção:**
- Carregar destinatário exigindo id e dispatch_id autorizado no mesmo WHERE; ausência resulta em 404.
- Aplicar a mesma correlação à prévia e à validação, sem depender de campo opcional não selecionado.
- Controle negativo com disparo próprio e destinatário estrangeiro retorna 404 sem dados; controle positivo do próprio disparo continua funcionando.
- Mocks devem respeitar a projeção SELECT, para não fornecer ao guard colunas que o banco nunca devolve.

**Relações, sem duplicar:** MX08.

**Limite da conclusão.** São contratos dos endpoints versionados. A frente de consumidores não encontrou invocação de preview/validate nos componentes Multiplix atuais; não se afirma alcance por botão. Probes isolam os handlers e a projeção PostgREST, sem executar router, JWT real ou RLS live.

### R2-API-030 — Resumo e estimativa Multiplix tratam a primeira página de destinatários como público completo

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Disparo existente do próprio usuário possui mais destinatários que o teto de linhas configurado no PostgREST. O probe usa fixture de 2500 destinatários e limite simulado de 1000; o teto implantado não foi consultado.

**Comportamento observado.** loadRecipients faz SELECT sem paginação nem contagem total. summarize usa recipients.length como total e a invariante só verifica se as classes somam esse mesmo subconjunto. estimate calcula mensagens, caracteres e renderizações sobre o array parcial. P21 retornou total=1000 e messages=1000 para 2500 destinatários e um bloco de texto, sem sinalizar incompletude.

**Efeito.** A revisão pode subestimar público, mensagens e consumo de voz, além de omitir classes de elegibilidade localizadas fora da primeira página. Um conjunto internamente consistente de contadores não prova que todos os destinatários foram carregados.

**Evidência de fonte:**
- [supabase/functions/multiplix-dispatch/actions/inspect.ts:186–192](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/multiplix-dispatch/actions/inspect.ts#L186) — `unpaged loadRecipients`; SHA-256 `6827c454b7fa4ccdee1d94ae609216f71bddea79f05fbca30ce441879479f5d4`.
- [supabase/functions/multiplix-dispatch/actions/inspect.ts:949–1011](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/multiplix-dispatch/actions/inspect.ts#L949) — `subset summary and self-consistency check`; SHA-256 `6827c454b7fa4ccdee1d94ae609216f71bddea79f05fbca30ce441879479f5d4`.
- [supabase/functions/multiplix-dispatch/actions/inspect.ts:1040–1108](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/multiplix-dispatch/actions/inspect.ts#L1040) — `estimate derived from partial recipient array`; SHA-256 `6827c454b7fa4ccdee1d94ae609216f71bddea79f05fbca30ce441879479f5d4`.

**Probes:** P21.

**Aceite da correção:**
- Usar agregação no servidor ou paginação determinística até esgotar o público, com detecção explícita de leitura incompleta.
- Comparar contagem autoritativa ao conjunto usado no cálculo e definir consistência quando o público muda durante a leitura.
- Fixture acima do teto inclui classes e roteiros de voz distintos na última página; resumo e estimativa abrangem todas as linhas.
- Se houver limite funcional de público, rejeitá-lo explicitamente antes de apresentar um total parcial.

**Limite da conclusão.** A frente frontend não identificou consumidor atual destas ações; o resultado descreve a API. Não foi consultado o limite PostgREST real nem executada consulta no banco.

### R2-API-031 — Presença humanizada pode bloquear o envio além do prazo do chamador

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Worker Multiplix alcança send após marcar provider_dispatch_started; o endpoint de presença mantém a requisição pendente e o AbortSignal do chamador vence. Não requer que o POST de mensagem tenha ocorrido.

**Comportamento observado.** send aguarda postPresence antes do POST da mensagem. postPresence não recebe deps.signal nem possui timeout próprio. O sinal é aplicado apenas ao POST posterior. P22 abortou o sinal e a função continuou pendente até liberar manualmente a presença; só então o POST principal observou AbortError.

**Efeito.** Uma etapa descrita como best effort pode reter o worker e a lease indefinidamente dentro do limite maior do runtime. Como o marker de despacho já existe, o item pode acabar em outcome_unknown mesmo sem ter chegado ao POST da mensagem; não se afirma duplicação automática e o fencing SQL continua válido.

**Evidência de fonte:**
- [supabase/functions/_shared/messaging/evolution-go.ts:200–214](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/messaging/evolution-go.ts#L200) — `unbounded postPresence`; SHA-256 `3af95dfe703c6666e5aa344936a1620564fe56e5b6627aaf3fe24fbe1a30b3a3`.
- [supabase/functions/_shared/messaging/evolution-go.ts:241–248](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/messaging/evolution-go.ts#L241) — `presence awaited before signal-protected send`; SHA-256 `3af95dfe703c6666e5aa344936a1620564fe56e5b6627aaf3fe24fbe1a30b3a3`.
- [supabase/functions/multiplix-send/index.ts:590–633](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/multiplix-send/index.ts#L590) — `timer before preparation and dispatch marker before send`; SHA-256 `c14c543d34b52761a77dccf371cbdb3a26d8952aa2e35d1e4c00fc4acebcadfc`.

**Probes:** P22.

**Aceite da correção:**
- Presença recebe prazo curto e cancelamento ligado ao orçamento total; falha de presença não impede envio autorizado dentro do prazo restante.
- Sinal já abortado não inicia novo efeito; a preparação e leitura de mídia também devem consumir o mesmo orçamento.
- Marker de efeito distingue preparativos de tentativa real de enviar mensagem ou conserva informação suficiente para conciliar a etapa incerta.
- Probe com presença pendente e relógio controlado termina no prazo, encerra timers/lease e não envia depois de cancelamento.

**Relações, sem duplicar:** R2-API-013.

**Limite da conclusão.** Prova de fluxo e cancelamento em memória, sem espera longa nem conexão real. Não afirma que um endpoint de presença implantado costume travar.

### R2-API-032 — Modo de teste do AI Proxy permite chamada paga sem cota nem registro de consumo

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Usuário com JWT válido conhece provider_id existente/ativo e há credencial configurada. O corpo é válido e inclui test=true. O limite local por IP de 30 chamadas/minuto ainda é aplicado; não se alega tráfego ilimitado.

**Comportamento observado.** O booleano fornecido pelo cliente pula enforceAiGuards antes do parse normal. Depois o handler chama runProviderTest com mensagens/tools escolhidos pelo cliente e sai antes de logAiUsageDetached. Não há checagem administrativa para o diagnóstico. P23 executou o handler completo com identidade comum e quota que recusaria: houve chamada ao adaptador/provedor interceptado, zero consultas de permissão, zero guard e zero log. P24, controle com test=false, retornou 429 antes do provedor.

**Efeito.** A cota diária e a contabilidade de consumo podem ser evitadas com um campo do request. O diagnóstico devolve apenas um detalhe curto, mas a geração paga processa toda a solicitação aceita. Mesmo o teste administrativo legítimo precisa conservar custo real, separando-o da cota operacional se essa for a regra de produto.

**Evidência de fonte:**
- [supabase/functions/ai-proxy/index.ts:474–497](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/ai-proxy/index.ts#L474) — `client test flag skips guards`; SHA-256 `bf53a35219fda2e5e7459fbad5171d72d03bf5c780fdc7a428ad6b4622386a0f`.
- [supabase/functions/ai-proxy/index.ts:344–451](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/ai-proxy/index.ts#L344) — `diagnostic provider call and response`; SHA-256 `bf53a35219fda2e5e7459fbad5171d72d03bf5c780fdc7a428ad6b4622386a0f`.
- [supabase/functions/ai-proxy/index.ts:519–587](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/ai-proxy/index.ts#L519) — `provider selection and early return without usage`; SHA-256 `bf53a35219fda2e5e7459fbad5171d72d03bf5c780fdc7a428ad6b4622386a0f`.
- [src/components/settings/ai-providers/useAIProviders.ts:118–133](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/ai-providers/useAIProviders.ts#L118) — `real diagnostic consumer`; SHA-256 `d28260300d35a0f8940875456cc85131c875b2b07b5868c2251bc4058b65b8d3`.

**Probes:** P23, P24.

**Aceite da correção:**
- Exigir permissão específica de diagnóstico antes de excluir a operação da cota normal.
- Registrar todo consumo real de teste com finalidade própria, sem confundi-lo com geração operacional.
- Limitar conteúdo/modelo/orçamento do diagnóstico no servidor, quando sua finalidade for somente verificar conectividade.
- Usuário comum com quota esgotada não obtém chamada externa alterando test; teste autorizado preserva identidade, destino fixo e auditoria.

**Relações, sem duplicar:** IA-QUOTA-001.

**Limite da conclusão.** JWT, cota e banco são fronteiras simuladas; adapters de roteamento/capacidade/fetch foram executados sem rede. A incompatibilidade é de autorização/contabilidade, diferente da contagem de ações versus tentativas já registrada em IA-QUOTA-001.

### R2-API-033 — Auto-tag conserva etiquetas antigas quando a nova classificação válida não tem tags

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Contato visível ao usuário já tem etiquetas source=ai; o modelo devolve resposta válida com tags=[] após analisar conversa não vazia.

**Comportamento observado.** AutoTagOutput aceita array vazio. O handler só chama replace_ai_conversation_tags quando tagPayload.length > 0. Assim não executa a substituição vazia que removeria as etiquetas de IA antigas e responde status=ok, tags=[] e tagsReplaced=false. O SQL é capaz de aplicar conjunto vazio; o bloqueio está no chamador.

**Efeito.** A classificação devolvida e o estado persistido divergem: etiquetas antigas continuam associadas ao contato após uma avaliação que não as escolheu. A evidência tagsReplaced=false está no envelope, mas não limpa o estado nem converte o resultado em falha/parcial.

**Evidência de fonte:**
- [supabase/functions/_shared/ai-response-contracts.ts:123–134](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/ai-response-contracts.ts#L123) — `empty tags allowed`; SHA-256 `b7f4c6f6690e5c02dfbe8b4fea14a03e1ab16357629c823ff70a9542d7b0d38e`.
- [supabase/functions/ai-auto-tag/index.ts:173–206](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/ai-auto-tag/index.ts#L173) — `nonempty-only replacement`; SHA-256 `be14e7d9260590014232ff861ea9d56233b1fa5ade96eff96255ed6a7fcd26ab`.
- [supabase/functions/ai-auto-tag/index.ts:295–305](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/ai-auto-tag/index.ts#L295) — `successful empty response`; SHA-256 `be14e7d9260590014232ff861ea9d56233b1fa5ade96eff96255ed6a7fcd26ab`.

**Aceite da correção:**
- Executar substituição também para conjunto vazio validado, distinguindo-o de erro ou ausência de conversa.
- Cenário com tags antigas seguido de classificação válida vazia remove somente as tags de IA.
- Preservação de etiquetas humanas deve ser comprovada junto da correção SQL apontada pela frente database.
- Resposta reflete resultado confirmado da persistência e trata falha de RPC sem anunciar conclusão.

**Limite da conclusão.** Ramo confirmado por leitura, sem modelo real nem escrita no banco. A falha SQL que converte etiqueta humana em IA no ON CONFLICT pertence à frente database e não é recontada aqui.

### R2-API-034 — Recuperação de áudio reutiliza a conexão da primeira mensagem em todo o lote

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** O lote global contém áudios de duas ou mais conexões; pelo menos um áudio de outra conexão precisa de recuperação pelo provedor. A hipótese de recuperação viável por ID é limitada ao modo Evolution v2: o próprio utilitário declara que GO não dispõe desse lookup apenas por ID.

**Comportamento observado.** A seleção de mensagens inclui whatsapp_connection_id, mas não filtra uma conexão. O handler consulta somente messages[0].whatsapp_connection_id antes do loop e passa o mesmo instanceName a getMediaBase64 para cada external_id do lote.

**Efeito.** Mensagens posteriores podem ser consultadas na instância errada e relatadas como irrecuperáveis mesmo quando a instância de origem conserva a mídia. Não se presume que IDs iguais existam nas duas instâncias nem que a consulta errada sempre devolva um áudio diferente; o efeito confirmado é o desvio da conexão de origem.

**Evidência de fonte:**
- [supabase/functions/recover-corrupted-audios/index.ts:22–30](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/recover-corrupted-audios/index.ts#L22) — `provider lookup contract`; SHA-256 `dd6f1d50dfdbfa10d3385cbcc123af43904718d8372212c0d7b55f3e0383c1ac`.
- [supabase/functions/recover-corrupted-audios/index.ts:52–61](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/recover-corrupted-audios/index.ts#L52) — `global audio selection with per-message connection`; SHA-256 `dd6f1d50dfdbfa10d3385cbcc123af43904718d8372212c0d7b55f3e0383c1ac`.
- [supabase/functions/recover-corrupted-audios/index.ts:69–81](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/recover-corrupted-audios/index.ts#L69) — `first-message connection selected once`; SHA-256 `dd6f1d50dfdbfa10d3385cbcc123af43904718d8372212c0d7b55f3e0383c1ac`.
- [supabase/functions/recover-corrupted-audios/index.ts:92–105](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/recover-corrupted-audios/index.ts#L92) — `same instance reused inside loop`; SHA-256 `dd6f1d50dfdbfa10d3385cbcc123af43904718d8372212c0d7b55f3e0383c1ac`.

**Aceite da correção:**
- Resolver instância e credencial a partir da conexão de cada mensagem ou agrupar o lote por conexão.
- Conexão ausente/ambígua falha somente os itens afetados sem usar uma instância presumida.
- Fixture de duas conexões e IDs distintos comprova cada lookup no destino correto; GO sem contrato de lookup continua com resultado explícito de não suportado.

**Relações, sem duplicar:** TRA-002, R2-API-022.

**Limite da conclusão.** Leitura estática, sem baixar áudio real, usar segredo ou acessar Evolution. Credencial global é antecedente TRA-002 e não é recontada como novidade.

### R2-API-035 — Timestamp não assinado permite repetir conversões Talk X fora da janela de frescor

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Endpoint Talk X publicado com a configuração versionada pública e secret de conversão configurado; alguém obtém um corpo e uma assinatura válidos de conversão. Para inflação repetida, external_ref está ausente e os demais campos são válidos: source permitida, currency/occurred_at não nulos e recipient existente. Não se pressupõe conhecimento do segredo por quem reapresenta o evento.

**Comportamento observado.** O handler verifica timestamp de header em ±5 minutos, mas calcula o HMAC somente sobre rawBody. A assinatura capturada continua válida com qualquer timestamp novo. P25 aceitou o request original; 24 horas depois recusou o timestamp antigo (401), aceitou o mesmo body/HMAC com timestamp novo (200) e recusou body alterado (401). A RPC final só deduplica (campaign_id,source,external_ref) quando external_ref é não nulo; sem referência cada INSERT pode criar outra conversão.

**Efeito.** A janela anunciada não limita a repetição de um evento assinado capturado. Com external_ref nulo, a contagem/valor atribuído à campanha pode ser inflado por replays, dentro do rate limit. Com external_ref presente, o índice continua impedindo a duplicação daquele identificador, embora o defeito de frescor permaneça.

**Evidência de fonte:**
- [supabase/functions/talkx-link/index.ts:107–120](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/talkx-link/index.ts#L107) — `unsigned freshness header and HMAC over body`; SHA-256 `a59b1b67a392b3e347f1ddc975f32de2d5a0b3bd5618d580eb665fca7d048c15`.
- [supabase/functions/talkx-link/index.ts:165–175](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/talkx-link/index.ts#L165) — `nullable external_ref forwarding`; SHA-256 `a59b1b67a392b3e347f1ddc975f32de2d5a0b3bd5618d580eb665fca7d048c15`.
- [supabase/config.toml:65–66](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/config.toml#L65) — `public conversion/click endpoint`; SHA-256 `872b4f055b24411929c0a8f0af1a72a220bd4326acd813b44aeb47bc6cd113af`.
- [supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql:115–117](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql#L115) — `partial dedupe index`; SHA-256 `f596a472c0d68e9e8d3926d5107a205a3f08585988931113d45938c98042300c`.
- [supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql:334–355](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql#L334) — `valid-source guard and nullable-ref insert`; SHA-256 `f596a472c0d68e9e8d3926d5107a205a3f08585988931113d45938c98042300c`.

**Probes:** P25.

**Aceite da correção:**
- Assinar versão + timestamp + identificador de evento + corpo numa representação canônica acordada com o emissor.
- Requerer identidade estável do evento e deduplicá-la de forma atômica; tolerância de relógio não substitui dedupe.
- Corpo/assinatura capturados não são aceitos após trocar somente o timestamp.
- Controlar replay dentro e fora da janela com e sem referências opcionais; usar payload completo válido para não mascarar o teste com R2-API-036.

**Relações, sem duplicar:** R2-API-036.

**Limite da conclusão.** HMAC real e relógio em memória; não foi capturado evento real nem enviado request público. O handler/RPC mapping foi executado com banco simulado; nulidade/unicidade foram confirmadas pela leitura SQL e pela frente database, sem executar PostgreSQL.

### R2-API-036 — Conversão Talk X fornece defaults que a RPC final rejeita

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Request de conversão tem HMAC e timestamp válidos e recipient existente, mas omite source, currency ou occurred_at, todos opcionais no contrato do handler. A RPC final no pin é a definição de 20261002691230.

**Comportamento observado.** A Edge usa source="webhook" quando ausente, enquanto a função SQL permite whatsapp/manual/import/api/checkout e rejeita webhook. Para currency e occurred_at o chamador passa null explícito, anulando os defaults BRL/now() da assinatura SQL e colidindo com NOT NULL das colunas. P26 executou o handler mínimo e capturou {source:webhook,currency:null,occurred_at:null}; a fronteira simulada com a allowlist SQL devolveu 422.

**Efeito.** Uma conversão conforme os campos opcionais do endpoint falha antes de gravar. Corrigir somente source ainda deixa falhas de currency/occurred_at; o resultado de source inválida é chamado invalid_value, e violações de nulidade caem no erro genérico de conversão.

**Evidência de fonte:**
- [supabase/functions/talkx-link/index.ts:126–135](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/talkx-link/index.ts#L126) — `optional input fields`; SHA-256 `a59b1b67a392b3e347f1ddc975f32de2d5a0b3bd5618d580eb665fca7d048c15`.
- [supabase/functions/talkx-link/index.ts:165–194](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/talkx-link/index.ts#L165) — `incompatible defaults and error mapping`; SHA-256 `a59b1b67a392b3e347f1ddc975f32de2d5a0b3bd5618d580eb665fca7d048c15`.
- [supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql:109–125](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql#L109) — `column defaults and NOT NULL`; SHA-256 `f596a472c0d68e9e8d3926d5107a205a3f08585988931113d45938c98042300c`.
- [supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql:297–306](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql#L297) — `RPC parameter defaults`; SHA-256 `f596a472c0d68e9e8d3926d5107a205a3f08585988931113d45938c98042300c`.
- [supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql:334–352](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20261002691230_talkx_v4_x021_links_conversoes_investimento.sql#L334) — `source allowlist and INSERT`; SHA-256 `f596a472c0d68e9e8d3926d5107a205a3f08585988931113d45938c98042300c`.

**Probes:** P26.

**Aceite da correção:**
- Adotar uma origem padrão permitida ou tornar a origem obrigatória e validar o enum na Edge.
- Omitir argumentos opcionais para aplicar os defaults SQL, ou fornecer BRL e um instante válido explicitamente.
- Testar payload mínimo, campos individualmente omitidos e payload completo contra o mesmo contrato final da RPC.
- Resposta de validação identifica o campo incompatível e não anuncia conversão registrada.

**Limite da conclusão.** Não há consumidor frontend de conversão identificado; é um endpoint para integração externa. O probe captura a tradução real e simula somente a rejeição de source; não reivindica execução de constraints no banco.

### R2-API-037 — Diagnóstico por conexão usa o tráfego global para declarar saúde

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Duas conexões existem; há tráfego em apenas uma delas no último período. As consultas ao provedor retornam status/configuração suficientes para o handler alcançar o cálculo de fluxo. O painel de monitoramento chama este endpoint.

**Comportamento observado.** Dentro do loop por conexão, o SELECT em messages filtra somente created_at. Conta as mesmas linhas globais para cada instância, sem whatsapp_connection_id e sem agregação completa. P27 forneceu uma mensagem inbound apenas de A e nenhuma de B; ambos os diagnósticos retornaram incoming=1 e flowHealth=healthy.

**Efeito.** Uma conexão sem recebimentos pode ser apresentada como saudável graças às mensagens de outra. O score geral incorpora esse resultado e dificulta detectar uma integração isoladamente parada. Não se afirma que o provedor B esteja fora do ar apenas porque não recebeu mensagens; o defeito é atribuir a B o tráfego de A.

**Evidência de fonte:**
- [supabase/functions/webhook-diagnostic/index.ts:59–67](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/webhook-diagnostic/index.ts#L59) — `per-instance loop`; SHA-256 `df91c8ad62c862151ce56cb1282d0aef775dddf36055dd4573ffad41b5e4d9b6`.
- [supabase/functions/webhook-diagnostic/index.ts:154–168](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/webhook-diagnostic/index.ts#L154) — `unscoped message flow`; SHA-256 `df91c8ad62c862151ce56cb1282d0aef775dddf36055dd4573ffad41b5e4d9b6`.
- [supabase/functions/webhook-diagnostic/index.ts:215–227](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/webhook-diagnostic/index.ts#L215) — `overall health derived from flow`; SHA-256 `df91c8ad62c862151ce56cb1282d0aef775dddf36055dd4573ffad41b5e4d9b6`.
- [src/components/monitoring/hooks/useMonitoringActions.ts:75–85](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/monitoring/hooks/useMonitoringActions.ts#L75) — `active diagnostic consumer`; SHA-256 `f40ba54499837efec5bdcdeb3d43548978bde230eb820cf6906def1845b8be94`.

**Probes:** P27.

**Aceite da correção:**
- Filtrar cada agregado pela conexão resolvida e usar contagem de banco sem depender do teto de rows retornadas.
- Conexão ausente/desconhecida recebe diagnóstico indeterminado e não herda métricas globais.
- Fixture com tráfego somente em A não aumenta contagem ou saúde de B.
- Distinguir ausência de tráfego de falha de transporte; não inventar disponibilidade a partir de volume zero.

**Relações, sem duplicar:** R2-API-001.

**Limite da conclusão.** Provider/status/config são fixtures válidas, contagens e loop são handler real. Nenhum estado real de saúde foi medido. A autorização do endpoint está em API001 e não é contada de novo.

### R2-API-038 — Relatório Talk X transforma destinatários ignorados fora da página em pendentes

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Campanha do próprio solicitante tem mais de 2000 destinatários, ou ultrapassa um teto menor do PostgREST, e há recipients skipped fora do subconjunto carregado. Há e-mail do criador e Resend configurado para o envio. O botão de relatório está disponível para completed/paused.

**Comportamento observado.** O handler carrega no máximo 2000 status e usa somente esse array para contar skipped; total/sent/failed vêm de agregados da campanha inteira. pending é total-sent-failed-skipped parcial. P28 executou o handler com campanha concluída e 2500 skipped: o e-mail interceptado mostrou 2000 ignorados e 500 pendentes, embora a fixture tivesse zero pending.

**Efeito.** O relatório enviado informa backlog inexistente e uma contagem incompleta de ignorados. O limite explícito de 2000 basta para reproduzir; não depende de presumir que o PostgREST implantado usa o padrão de 1000.

**Evidência de fonte:**
- [supabase/functions/talkx-report/index.ts:94–112](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/talkx-report/index.ts#L94) — `capped status page and mixed-scope KPI`; SHA-256 `8b2c6399dd8749d1db15d6527e310b87a49191ec51169840723e6030a6f812e7`.
- [supabase/functions/talkx-report/index.ts:136–140](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/talkx-report/index.ts#L136) — `email labels and counts`; SHA-256 `8b2c6399dd8749d1db15d6527e310b87a49191ec51169840723e6030a6f812e7`.
- [src/components/talkx/TalkXCampaignRunning.tsx:714–726](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXCampaignRunning.tsx#L714) — `completed/paused report button`; SHA-256 `ed85bdec958622504c2f89cf0786d55dcb05d371aa7dc3a825bccf0b3d993724`.

**Probes:** P28.

**Aceite da correção:**
- Calcular todas as classes no servidor no mesmo conjunto/instante ou paginar até completar a campanha.
- Usar o estado real pending/sending em vez de inferir todos os estados restantes como pendência; definir tratamento explícito de cancelled/outcome_unknown.
- Campanha concluída com 2500 ignorados reporta 2500 ignorados e zero pendentes.
- Totais incompletos não são enviados como relatório completo.

**Relações, sem duplicar:** R2-API-030.

**Limite da conclusão.** Handler completo com auth/banco/Resend simulados; nenhum e-mail enviado. O report atual não oferece botão para cancelled; a correção de taxonomia no aceite não é usada para afirmar esse caminho de UI.

### R2-API-039 — Resposta e polling antigos misturam identidades no diálogo de QR Code

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Operador abre a conexão A, fecha o diálogo e abre B antes de connect/status de A terminar. As respostas do provedor chegam fora de ordem; ambas as conexões existem e o fluxo de QR está disponível.

**Comportamento observado.** handleShowQrCode aplica o resultado de connect ao estado atual sem conferir a conexão; startStatusPolling ignora seu parâmetro connectionId e também aplica status ao diálogo atual. P29 executou os callbacks completos: QR de A apareceu sob connectionId/nome de B; depois um status open de A marcou B conectada e anulou a referência do intervalo de B. Fechar B deixou esse intervalo sem referência ativa para cancelamento.

**Efeito.** O operador pode escanear o QR de uma instância acreditando configurar outra ou receber confirmação de conexão da instância errada. Além da identidade incorreta na UI, polling pode continuar após fechar o diálogo. Não se afirma que o teste tenha estabelecido sessão real ou alterado credenciais.

**Evidência de fonte:**
- [src/hooks/inbox/useConnectionsManager.ts:177–216](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/inbox/useConnectionsManager.ts#L177) — `startStatusPolling and handleShowQrCode`; SHA-256 `8a4d3d0105d5585a12bba5e69760317b44fbd772c0d32820978c986108071a9f`.
- [src/hooks/inbox/useConnectionsManager.ts:280–283](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/inbox/useConnectionsManager.ts#L280) — `closeQrDialog`; SHA-256 `8a4d3d0105d5585a12bba5e69760317b44fbd772c0d32820978c986108071a9f`.
- [src/components/connections/ConnectionsView.tsx:108–117](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/connections/ConnectionsView.tsx#L108) — `dialog identity and QR renderer`; SHA-256 `94fe1937bab7ae54f1141567533c51b0f014db963325c8f8e1d81349092ed4da`.

**Probes:** P29.

**Aceite da correção:**
- Associar cada connect/status e timer à conexão e a uma geração de abertura, verificando ambos antes de qualquer alteração de estado.
- Fechar ou trocar a conexão invalida respostas pendentes e encerra o timer de sua própria geração.
- Repetir a corrida A→fechar→B com respostas invertidas: B nunca exibe QR/status de A e não resta polling após fechar.

**Limite da conclusão.** Probe de callbacks completos com estados/ref React, promises e timers em memória; efeitos de montagem e rede real não foram executados.

### R2-API-040 — Editor de privacidade envia padrões locais sem carregar a configuração atual

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** A conta tem campos de privacidade mais restritos do que os padrões locais; operador abre Configurações da instância e altera apenas um campo de privacidade. A leitura backend atual pode ser bem-sucedida.

**Comportamento observado.** InstanceSettingsDialog inicializa privacy com valores fixos e carrega somente settings/profile/labels. Salvar envia todos os campos de privacy. O handler update-privacy prefere cada string enviada ao snapshot atual; assim o snapshot GO não preserva campos que a UI já preencheu com defaults. Em v2 o corpo completo também é encaminhado.

**Efeito.** Salvar uma alteração pontual pode abrir outras opções que o usuário não pretendia alterar. O formulário apresenta valores locais como se fossem o estado atual. Este caminho independe do erro de GET descrito em R2-API-014.

**Evidência de fonte:**
- [src/components/connections/InstanceSettingsDialog.tsx:40–66](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/connections/InstanceSettingsDialog.tsx#L40) — `hardcoded privacy state and load effects`; SHA-256 `da9494d139ccbda39eca18956ebfb6725fb13d9fe6a3ac458b59f477e869cd7f`.
- [src/components/connections/InstanceSettingsDialog.tsx:111–113](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/connections/InstanceSettingsDialog.tsx#L111) — `full privacy payload`; SHA-256 `da9494d139ccbda39eca18956ebfb6725fb13d9fe6a3ac458b59f477e869cd7f`.
- [src/hooks/evolution/useEvolutionIntegrations.ts:20–20](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/evolution/useEvolutionIntegrations.ts#L20) — `updatePrivacySettings forwarding`; SHA-256 `8716ba0776fd4ac58376eaa0381410117bf4af9b6ff038384b1e824020fefc0a`.
- [supabase/functions/evolution-api/index.ts:771–799](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/evolution-api/index.ts#L771) — `merge and v2 forwarding`; SHA-256 `227d16c9e5431bfc0bae0cf833e1d0b0fcce5e822f98ffbc25be7f27865e0cdd`.

**Aceite da correção:**
- Carregar a configuração atual autorizada antes de permitir salvamento, ou manter campos desconhecidos e enviar somente os efetivamente alterados.
- Troca de instância invalida o snapshot anterior; falha de leitura é visível e não fabrica valores atuais.
- Conta com profile/online/last restritos permanece restrita ao alterar somente readreceipts.

**Relações, sem duplicar:** R2-API-014.

**Limite da conclusão.** Não houve leitura de configurações reais de conta. Difere de R2-API-014 pela origem dos valores indevidos na UI mesmo com GET bem-sucedido.

### R2-API-041 — Desativar integração esconde o único botão capaz de persistir a desativação

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Integração suportada pelo provedor, por exemplo Typebot em v2, está ativa e é carregada pelo diálogo. Operador desliga o switch Ativado.

**Comportamento observado.** IntegrationForm altera apenas values.enabled via setter local. Campos, Salvar e Remover só são renderizados quando enabled é verdadeiro. Ao desligar, a ação de persistência desaparece antes de poder enviar enabled=false; o callback onSave do pai é o único caminho que chamaria setTypebot/setChatwoot/etc.

**Efeito.** O diálogo fica visualmente desativado enquanto a integração remota continua ativa. O operador precisa reativar a UI para reencontrar os controles, e esse estado já não representa a desativação desejada.

**Evidência de fonte:**
- [src/components/connections/IntegrationsPanel.tsx:54–95](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/connections/IntegrationsPanel.tsx#L54) — `local switch and conditional save/delete`; SHA-256 `2ae265ac2153d7988474dc1ed88217231acd78676572afefe7c3ffab3b7d5531`.
- [src/components/connections/IntegrationsPanel.tsx:224–237](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/connections/IntegrationsPanel.tsx#L224) — `Typebot local setter and onSave`; SHA-256 `2ae265ac2153d7988474dc1ed88217231acd78676572afefe7c3ffab3b7d5531`.
- [supabase/functions/evolution-api/index.ts:802–824](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/evolution-api/index.ts#L802) — `set integration accepts enabled false`; SHA-256 `227d16c9e5431bfc0bae0cf833e1d0b0fcce5e822f98ffbc25be7f27865e0cdd`.

**Aceite da correção:**
- Manter a ação Salvar acessível para enabled=false ou persistir o toggle com feedback e reversão em caso de erro.
- Teste de integração ativa comprova que desligar produz uma única alteração remota com enabled=false.
- Reabrir o diálogo reflete o estado persistido e falhas não são apresentadas como desativação concluída.

**Limite da conclusão.** Não se usa integração indisponível no modo GO para afirmar este efeito; a precondição exige um backend que suporte a configuração.

### R2-API-042 — Envio e sincronização de grupos contam erro lógico do proxy como sucesso

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** O proxy Evolution retorna HTTP 200 com envelope error=true para rejeição/indisponibilidade do provedor; o cliente Supabase entrega error=null e data com esse envelope. Fluxo de grupos tem uma conexão válida.

**Comportamento observado.** handleBroadcast descarta data e incrementa sent sempre que error de transporte é nulo; depois limpa a seleção. handleAutoSync também ignora error=true, converte o envelope em array vazio e exibe sucesso. P30 executou o hook completo com erro sintético do provedor: enviou toast Mensagem enviada para 1 grupo(s) e limpou a seleção; sync informou 0 grupo(s) sincronizados como sucesso.

**Efeito.** O usuário recebe confirmação de entrega ou sincronização que não ocorreu. A limpeza dos alvos dificulta distinguir falha de aceite e torna uma nova tentativa menos segura. Erros de upsert também são apenas logados, sem entrar em totalErrors.

**Evidência de fonte:**
- [src/hooks/groups/actions.ts:33–61](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/groups/actions.ts#L33) — `auto sync response and upsert accounting`; SHA-256 `b6713ab51c47df06ef5f26a1669f8a9ebec75bb90250b75b6e960be0b7c8809e`.
- [src/hooks/groups/actions.ts:88–107](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/groups/actions.ts#L88) — `broadcast response and selection clearing`; SHA-256 `b6713ab51c47df06ef5f26a1669f8a9ebec75bb90250b75b6e960be0b7c8809e`.
- [supabase/functions/_shared/evolution-api-proxy.ts:193–217](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/evolution-api-proxy.ts#L193) — `HTTP200 error envelope`; SHA-256 `a5c696eeebe4107ac547ce292da2b577620573e691aacdd2a08b3de3b3075816`.
- [src/hooks/evolution/useEvolutionApiCore.ts:31–39](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/evolution/useEvolutionApiCore.ts#L31) — `shared caller correctly rejects error=true`; SHA-256 `346ad35e1d77c8cf75a186d1121a18681bd7f82e81f3b56852e6e69cbe8ef354`.
- [src/hooks/chat/useGroupsManager.ts:35–37](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/chat/useGroupsManager.ts#L35) — `active groups actions consumer`; SHA-256 `f8f32ebbf2196b6f278c44bc9839e43f39b762a755ac877882a10207390e6055`.

**Probes:** P30.

**Aceite da correção:**
- Usar um único decodificador de erro de transporte, erro lógico e resultado indeterminado do provedor.
- Envelope error=true nunca incrementa enviados nem emite sucesso de sincronização.
- Manter identificação dos alvos recusados para nova tentativa e preservar separadamente os já aceitos.
- Contabilizar falhas de persistência no resultado parcial da sincronização.

**Limite da conclusão.** O probe intercepta invoke e não envia mensagens. Não afirma que aceite HTTP do provedor já comprova entrega ao destinatário.

### R2-API-043 — Painel de saúde exclui chamadas de IA registradas fora de ai-proxy

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Há ai_usage_logs recentes e visíveis de funções que usam generateWithRouting, como voice-agent ou ai-auto-tag, mas nenhuma linha function_name=ai-proxy na janela de 24 horas.

**Comportamento observado.** AIProviderHealthPanel filtra somente ai-proxy. A geração central grava o nome da função chamadora em function_name. Quando o filtro não encontra linhas, a UI Saúde dos Provedores declara que nenhuma chamada de IA foi observada nesta janela. A falha da consulta também não tem renderização de erro própria: isLoading termina e data conserva o default vazio.

**Efeito.** Atividade e falhas efetivamente registradas pelas funções modernas ficam invisíveis no painel geral de provedores, podendo ser interpretadas como ausência de uso. O limite de 50 é explicitamente apresentado como amostra e não é, por si só, um achado de contagem completa.

**Evidência de fonte:**
- [src/components/settings/ai-providers/AIProviderHealthPanel.tsx:47–65](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/ai-providers/AIProviderHealthPanel.tsx#L47) — `ai-proxy-only query and no error state`; SHA-256 `0606efd66fa6b37567d0e369a6b40d4a3b5916758278017ebbd1dd8e3f155233`.
- [src/components/settings/ai-providers/AIProviderHealthPanel.tsx:178–199](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/ai-providers/AIProviderHealthPanel.tsx#L178) — `general no-observation claim`; SHA-256 `0606efd66fa6b37567d0e369a6b40d4a3b5916758278017ebbd1dd8e3f155233`.
- [supabase/functions/_shared/ai-generate.ts:674–693](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/ai-generate.ts#L674) — `caller function name in usage log`; SHA-256 `0e6d14a303fb023f7c482f2374287c3089dc7bb155b7870c046d3ad79f8d1f35`.
- [supabase/functions/voice-agent/index.ts:109–113](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/voice-agent/index.ts#L109) — `voice-agent function name`; SHA-256 `7bcab539aed5f54a7e405e647744fc71d15ceb6739a2e77334527f4af396b5f5`.
- [src/components/settings/AIProvidersManager.tsx:92–93](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/AIProvidersManager.tsx#L92) — `health panel mounted`; SHA-256 `5bf77bf47ba8fb7753eb3f072b64ad2447810c61a5462e1e3dbf966b393604ce`.

**Aceite da correção:**
- Definir o escopo do painel e incluir os logs das funções/provedores que ele afirma monitorar, ou rotular explicitamente a cobertura restrita.
- Mostrar erro de leitura separadamente de uma consulta bem-sucedida sem observações.
- Fixture com apenas logs de voice-agent/ai-auto-tag deve produzir observações no painel geral e preservar a indicação de amostra.

**Limite da conclusão.** Não se afirma que as taxas deveriam representar toda a população; o próprio painel documenta uma amostra. Não foram consultados logs reais.

### R2-API-044 — Aquecimento e limite de número têm configuração local sem motor identificado

**P2 · gap · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Operador usa Aquecer em uma linha de number_reputation e espera progressão diária/controle do limite mostrado. A análise cobre o checkout, os workers de envio e a cadeia de migrations; eventual serviço externo não versionado não foi observado.

**Comportamento observado.** startWarmup somente grava warmup_status=active, warmup_day=1 e daily_limit=20, ignora error e anuncia Aquecimento iniciado. Não há consumidor de number_reputation localizado em Edge/scripts nem função SQL vigente que atualize progresso/consumo; a tabela possui trigger de updated_at. A tela ainda afirma população automática e apresenta o limite como progresso operacional.

**Efeito.** O aceite de aquecimento/limite não é demonstrado pelos artefatos. Na implantação composta só por estes componentes, a configuração não produz progressão nem fiscalização desse limite. Uma escrita recusada também recebe mensagem de sucesso.

**Evidência de fonte:**
- [src/components/connections/NumberReputationMonitor.tsx:32–63](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/connections/NumberReputationMonitor.tsx#L32) — `reads and startWarmup write`; SHA-256 `05a2c82fc285c1deee8e70ebda85eafdbcd57691778334568c376597c342ee2d`.
- [src/components/connections/NumberReputationMonitor.tsx:101–105](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/connections/NumberReputationMonitor.tsx#L101) — `automatic data promise`; SHA-256 `05a2c82fc285c1deee8e70ebda85eafdbcd57691778334568c376597c342ee2d`.
- [src/components/connections/NumberReputationMonitor.tsx:139–168](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/connections/NumberReputationMonitor.tsx#L139) — `warmup day and daily limit UI`; SHA-256 `05a2c82fc285c1deee8e70ebda85eafdbcd57691778334568c376597c342ee2d`.
- [supabase/migrations/20260409014536_3a836b4b-1e37-411c-b8af-45d918304272.sql:142–166](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260409014536_3a836b4b-1e37-411c-b8af-45d918304272.sql#L142) — `reputation DDL and generic updated_at trigger`; SHA-256 `335578990b1841242e328f8586d78f389c847551580c58e8f15dd16f37fd63c3`.

**Aceite da correção:**
- Identificar e versionar o motor que cria reputação, renova contadores, progride dias e aplica limites, ou apresentar a tela como configuração sem execução disponível.
- Com relógio/controlador offline, demonstrar progressão de dia e recusa além de 20 no primeiro dia sem criar duplicação de envios.
- Verificar error da atualização antes de anunciar início.

**Limite da conclusão.** Gap do conjunto versionado, não prova de ausência de N8N/VPS/serviço externo em produção. A frente database confirmou a ausência de consumidor na cadeia vigente; esta frente não atribui a si leitura integral das migrations.

### R2-API-045 — Mensagem automática fora do expediente é persistida sem consumidor de entrega identificado

**P2 · gap · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Administrador habilita a mensagem de ausência por conexão e um cliente entra em contato fora do expediente. As funcionalidades auditadas são as que estão versionadas no HEAD; automação externa não foi inspecionada.

**Comportamento observado.** BusinessHoursDialog promete envio automático e useBusinessHours salva content/is_enabled em away_messages. A busca completa em Edge/scripts não encontra leitura dessa tabela. A revisão SQL paralela encontrou somente DDL/policies/updated_at, nenhuma função vigente de consumo ou envio. O webhook inbound percorrido não consulta away_messages.

**Efeito.** O ciclo configuração→evento fora do horário→entrega não está implementado ou demonstrado pelos artefatos fornecidos. Salvar configurações pode funcionar corretamente sem produzir a resposta que o diálogo promete.

**Evidência de fonte:**
- [src/components/connections/BusinessHoursDialog.tsx:212–230](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/connections/BusinessHoursDialog.tsx#L212) — `automatic outside-hours promise and controls`; SHA-256 `8d77909bb288ab18b873070d5211946d0548474e6f4a976c0bed104712af6814`.
- [src/hooks/business/useBusinessHours.ts:102–119](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useBusinessHours.ts#L102) — `away_messages persistence`; SHA-256 `c3df0aebaeff7ea5357bbfe1a55ee5f628cfa092ff88ea31200e9ce9220c8b9e`.
- [supabase/migrations/20251220181300_aa931cb8-3812-4396-983e-123d19f73ad8.sql:15–23](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20251220181300_aa931cb8-3812-4396-983e-123d19f73ad8.sql#L15) — `away_messages DDL`; SHA-256 `db73d151afdbf5f8b8cb85022560bbc82dbdd420fe2b433f9e88b5237386a650`.
- [supabase/migrations/20251220181300_aa931cb8-3812-4396-983e-123d19f73ad8.sql:87–96](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20251220181300_aa931cb8-3812-4396-983e-123d19f73ad8.sql#L87) — `updated_at-only original triggers`; SHA-256 `db73d151afdbf5f8b8cb85022560bbc82dbdd420fe2b433f9e88b5237386a650`.

**Aceite da correção:**
- Versionar ou documentar com evidência o consumidor real, sua resolução de conexão/fuso, idempotência e entrega.
- Aceite controlado comprova uma resposta à primeira entrada fora do horário, nenhuma resposta quando desabilitada e nenhuma duplicação no replay.
- A UI deve representar disponibilidade operacional separada da simples persistência da configuração.

**Relações, sem duplicar:** R2-API-017.

**Limite da conclusão.** Não afirma ausência de automação externa. As falhas de gravação de useBusinessHours são propagadas por mutateAsync e a UI aguarda: não há achado adicional de falso sucesso de salvamento neste fluxo.

### R2-API-046 — Exclusão de provedor promete fallback automático que o roteamento não executa

**P2 · confirmed_static · HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`**

**Precondição.** Administrador remove com sucesso o único provedor ativo e default para uma finalidade. Não resta outro provedor que satisfaça ativo/default/use_for; a próxima função utiliza a seleção por finalidade do roteamento central.

**Comportamento observado.** A confirmação afirma que as funcionalidades serão automaticamente redirecionadas a Lovable AI. deleteMutation apenas remove a linha e invalida a query. O único trigger de seleção de default é BEFORE INSERT OR UPDATE e só desmarca sobreposições, sem eleger sucessor no DELETE. O roteador então encontra zero candidatos e lança NO_PROVIDER.

**Efeito.** O administrador aprova uma remoção sob promessa de continuidade, mas pode interromper todas as funções que dependiam daquele default. A existência de uma linha Lovable que não esteja ativa/default para a finalidade não satisfaz o predicado.

**Evidência de fonte:**
- [src/components/settings/ai-providers/AIProviderCard.tsx:129–141](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/ai-providers/AIProviderCard.tsx#L129) — `deletion fallback promise`; SHA-256 `8572ff83a89fca6cc67dfb2728f4374f838ea4caf1ab038f522d934e365655e3`.
- [src/components/settings/ai-providers/useAIProviders.ts:106–115](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/ai-providers/useAIProviders.ts#L106) — `delete only mutation`; SHA-256 `d28260300d35a0f8940875456cc85131c875b2b07b5868c2251bc4058b65b8d3`.
- [supabase/functions/_shared/ai-routing.ts:185–197](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/_shared/ai-routing.ts#L185) — `zero default candidates throws`; SHA-256 `290869327280e22fca642dc92ed063fd017e59c27e40448301cccc5dc1774c56`.
- [supabase/migrations/20260408194438_1ad57139-c089-4711-86e1-71d8f461e02d.sql:54–82](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260408194438_1ad57139-c089-4711-86e1-71d8f461e02d.sql#L54) — `only updated_at and insert/update default trigger`; SHA-256 `7f5968e3f16d21d397d1744a20e19fbb359bead392d87c5cbc857b16f2708cb6`.

**Aceite da correção:**
- Antes de remover o default, exigir ou escolher explicitamente um sucessor válido para cada finalidade afetada, com persistência coerente.
- Se o produto permite ficar sem provedor, informar as funções que serão interrompidas e remover a promessa automática.
- Excluir o único default nunca resulta em continuidade anunciada seguida de NO_PROVIDER; testar também sucessor inativo e use_for sem a finalidade.

**Limite da conclusão.** A exclusão precisa ser aceita; não se presume contorno de FK/RLS. A cadeia SQL vigente e ausência de trigger DELETE foram conferidas pela frente database; não houve alteração real de configuração.

## Achados anteriores e divisão entre frentes

Os seguintes registros foram preservados como antecedentes, sem serem recontados como falhas novas:
- **TRA-002** — Fallback para credencial global continua em proxy/evoFetch/message-delivery. Não recontado como novidade.
- **TRA-003** — Helper de estado e caminho de status possuem normalizações diferentes; sem novo ID para a falha já registrada.
- **TRA-004/TRA-005** — useConnectionsManager mantém duas atualizações de default sem verificar cada erro e exclusão local após falha de remoção remota; achados anteriores, não recontados.
- **TRA-006** — Labels sem isolamento por instância permanecem antecedente; não duplicado.
- **MX01..MX09** — Worker integral confirmou migração parcial item/recipient, dispatch-level content/media, ausência de instance token e terminal 429. Achados existentes não foram clonados.
- **MX05** — Talk X também trata HTTP429 como failed em process-recipient 505–512; indicado como extensão do padrão, não novo ID nesta contagem.
- **OTH-004/OTH-007** — Catálogo mantém ordenação sem desempate único e filtro is_new sem janela temporal; não recontados nesta frente.
- **OTH-003/OTH-005/OTH-006** — Success 207 / paginação UI / sync manual são prévios; R2-API-011/012 tratam cursor de cron/webhook e anexos.
- **TEL reconciliation** — sync-call-records 34–40 usa primeiro candidato com sufixo9 e janela ±90; não recontado.
- **R2-DB-002** — Atribuição TalkX/Multiplix por OR/sufixo8, sem prioridade de contato/conexão e reutilização de mensagem: evidência/ID SQL pertencem à frente database.
- **R2-DB-004** — generateWithRouting deriva chave estável do conteúdo, volta a chamar provedor após reserve e settle uma reserva já encerrada não reconta orçamento. SQL e achado único pertencem à frente database; ai_usage_logs é contabilidade separada.
- **R2-DB-014** — Cancelamento limpa token durante POST; process-recipient falha record_sent e a falha de complete(outcome_unknown) pode impedir enqueueRecipientReconciliation. Corrida consolidada pela frente database, sem alegar duplicação automática.
- **R2-DB-015** — Retry de recipient outcome_unknown mantém provider_dispatch_started_at e a seleção normal o exclui; o claim direto possui outra regra. Achado de fila estacionada pertence à frente database, não é envio duplicado automático.
- **R2-COM-009/R2-COM-010** — gmail-oauth foi revisto integralmente pela frente communication/root: state ausente/inválido não barra exchange e escritas storeTokens/disconnect não verificam erro. Somente referência, sem duplicar achados ou atribuir a leitura a providers.
- **R2-AUTH-035** — useWhatsAppStatus e consumidores de perfil/status ficaram com auth: conversão de notSupported GO em vazio e estado fixo Offline não foram duplicados nesta frente.

## Cobertura efetivamente revisada

`coverage.json` contém hashes, faixas e símbolos por arquivo. Uma importação ou busca de chamada não é leitura integral do arquivo. Os arquivos com leitura semântica integral desta frente são:

`supabase/functions/evolution-webhook/index.ts`, `supabase/functions/_shared/evolution-webhook-msg-handlers.ts`, `supabase/functions/_shared/evolution-webhook-messages.ts`, `supabase/functions/_shared/evolution-helpers.ts`, `supabase/functions/_shared/evolution-go-adapter.ts`, `supabase/functions/_shared/evolution-go-routes.ts`, `supabase/functions/_shared/evolution-send.ts`, `supabase/functions/_shared/evolution-media.ts`, `supabase/functions/_shared/evolution-api-proxy.ts`, `supabase/functions/evolution-api/index.ts`, `supabase/functions/message-delivery/index.ts`, `supabase/functions/_shared/talkx-reply.ts`, `supabase/functions/_shared/talkx-window.ts`, `supabase/functions/_shared/talkx-resume-policy.ts`, `supabase/functions/talkx-scheduler/index.ts`, `supabase/functions/talkx-send/process-recipient.ts`, `supabase/functions/multiplix-send/index.ts`, `supabase/functions/gmail-webhook/index.ts`, `supabase/functions/_shared/gmail-helpers.ts`, `supabase/functions/gmail-sync/index.ts`, `supabase/functions/gmail-cron-sync/index.ts`, `supabase/functions/gmail-send/index.ts`, `supabase/functions/crm-integration/index.ts`, `supabase/functions/_shared/crm-integration-contract.ts`, `supabase/functions/bitrix-api/index.ts`, `supabase/functions/whatsapp-webhook/index.ts`, `supabase/functions/get-call-recording/index.ts`, `supabase/functions/sync-call-records/index.ts`, `supabase/functions/public-api/index.ts`, `supabase/functions/get-mapbox-token/index.ts`, `supabase/functions/get-sip-password/index.ts`, `supabase/functions/send-email/index.ts`, `supabase/functions/send-scheduled-report/index.ts`, `supabase/functions/auto-close-conversations/index.ts`, `supabase/functions/elevenlabs-webhook/index.ts`, `supabase/functions/elevenlabs-scribe-token/index.ts`, `supabase/functions/elevenlabs-agent-token/index.ts`, `supabase/functions/elevenlabs-tts/index.ts`, `supabase/functions/elevenlabs-tts-stream/index.ts`, `supabase/functions/elevenlabs-sfx/index.ts`, `supabase/functions/elevenlabs-dialogue/index.ts`, `supabase/functions/elevenlabs-sts/index.ts`, `supabase/functions/elevenlabs-voice-design/index.ts`, `supabase/functions/ai-jobs-worker/index.ts`, `supabase/functions/_shared/cron-secret-auth.ts`, `supabase/functions/_shared/ai-jobs.ts`, `supabase/functions/_shared/effect-reconcile.ts`, `supabase/functions/external-db-proxy/index.ts`, `supabase/functions/external-db-bridge/index.ts`, `supabase/functions/evolution-sync/index.ts`, `supabase/functions/connection-health-check/index.ts`, `supabase/functions/_shared/evolution-sync-actions.ts`, `supabase/functions/_shared/edge-boot.ts`, `supabase/functions/_shared/ai-auth.ts`, `supabase/functions/_shared/ai-audio-authz.ts`, `supabase/functions/_shared/ai-guards.ts`, `supabase/functions/_shared/ssrf.ts`, `supabase/functions/ai-transcribe-audio/index.ts`, `supabase/functions/talkx-send/index.ts`, `supabase/functions/_shared/evolution-webhook-handlers.ts`, `supabase/functions/multiplix-dispatch/index.ts`, `supabase/functions/multiplix-dispatch/actions/audience.ts`, `supabase/functions/multiplix-dispatch/actions/blocks.ts`, `supabase/functions/multiplix-dispatch/actions/inspect.ts`, `supabase/functions/multiplix-dispatch/actions/lifecycle.ts`, `supabase/functions/multiplix-dispatch/actions/listing.ts`, `supabase/functions/_shared/messaging/index.ts`, `supabase/functions/_shared/messaging/phone.ts`, `supabase/functions/_shared/messaging/timing.ts`, `supabase/functions/_shared/validation.ts`, `supabase/functions/_shared/messaging/media.ts`, `supabase/functions/_shared/messaging/eligibility.ts`, `supabase/functions/_shared/messaging/errors.ts`, `supabase/functions/_shared/messaging/evolution-go.ts`, `supabase/functions/_shared/messaging/personalize.ts`, `supabase/functions/_shared/messaging/types.ts`, `supabase/functions/_shared/secure-random.ts`, `supabase/functions/_shared/multiplix-eligibility.ts`, `supabase/functions/ai-proxy/index.ts`, `supabase/functions/_shared/ai-usage.ts`, `supabase/functions/ai-auto-tag/index.ts`, `supabase/functions/_shared/ai-response-contracts.ts`, `supabase/functions/_shared/secure-egress.ts`, `supabase/functions/_shared/postgrest-filters.ts`, `supabase/functions/_shared/talkx-delivery-connection.ts`, `supabase/functions/_shared/ai-routing.ts`, `supabase/functions/_shared/ai-capabilities.ts`, `supabase/functions/_shared/ai-providers.ts`, `supabase/functions/_shared/ai-generate.ts`, `supabase/functions/_shared/ai-budget.ts`, `supabase/functions/_shared/ai-values.ts`, `supabase/functions/_shared/ai-vocabulary.ts`, `supabase/functions/_shared/ai-json.ts`, `supabase/functions/_shared/notification-events.ts`, `supabase/functions/_shared/voice-copilot-authz.ts`, `supabase/functions/_shared/contracts.ts`, `supabase/functions/_shared/deno-types.ts`, `supabase/functions/_shared/email-font-stack.ts`, `supabase/functions/_shared/evolution-types.ts`, `supabase/functions/multiplix-audience/index.ts`, `supabase/functions/multiplix-voices/index.ts`, `supabase/functions/batch-fetch-avatars/index.ts`, `supabase/functions/recover-corrupted-audios/index.ts`, `supabase/functions/migrate-media-storage/index.ts`, `supabase/functions/talkx-report/index.ts`, `supabase/functions/talkx-link/index.ts`, `supabase/functions/_shared/gmail-mime.ts`, `supabase/functions/_shared/webhook-signature.ts`, `supabase/functions/voice-agent/index.ts`, `supabase/functions/voice-changer/index.ts`, `supabase/functions/voice-copilot-action/index.ts`, `supabase/functions/sentiment-alert/index.ts`, `supabase/functions/fetch-link-preview/index.ts`, `supabase/functions/webhook-diagnostic/index.ts`, `supabase/functions/promogifts-catalog/index.ts`, `supabase/functions/_shared/schemas.ts`, `supabase/functions/_shared/hmac-validation.ts`, `src/hooks/chat/useScheduledMessages.ts`, `src/components/settings/ai-providers/useAIProviders.ts`, `src/hooks/inbox/useConnectionsManager.ts`, `src/hooks/groups/actions.ts`, `src/hooks/groups/types.ts`, `src/hooks/groups/index.ts`, `src/hooks/chat/useGroupsManager.ts`, `src/components/connections/ConnectionsView.tsx`, `src/components/connections/ConnectionCard.tsx`, `src/components/connections/InstanceSettingsDialog.tsx`, `src/components/connections/InstanceSettingsTabContent.tsx`, `src/components/connections/ConnectionQueuesDialog.tsx`, `src/components/connections/IntegrationsPanel.tsx`, `src/components/connections/BusinessHoursDialog.tsx`, `src/components/connections/BusinessHoursIndicator.tsx`, `src/components/connections/NumberReputationMonitor.tsx`, `src/components/settings/AIProvidersManager.tsx`, `src/components/settings/ai-providers/types.ts`, `src/components/settings/ai-providers/AIProviderCard.tsx`, `src/components/settings/ai-providers/AIProviderFormDialog.tsx`, `src/components/settings/ai-providers/AIProviderHealthPanel.tsx`, `src/hooks/integrations/useEvolutionApi.ts`, `src/hooks/evolution/useEvolutionApiCore.ts`, `src/hooks/evolution/useEvolutionInstance.ts`, `src/hooks/evolution/useEvolutionIntegrations.ts`, `src/hooks/business/useBusinessHours.ts`, `src/hooks/inbox/useConnectionQueues.ts`, `supabase/migrations/20251220181300_aa931cb8-3812-4396-983e-123d19f73ad8.sql`, `supabase/migrations/20251220182411_dd03d6a1-4f98-410e-a411-1f2486626de2.sql`.

A segunda passagem completou o handler `talkx-send/index.ts` e as ações Multiplix de inspeção, público, blocos, ciclo e listagem. Schemas, helpers de autenticação e consumidores auxiliares ainda parciais têm faixas explícitas no JSON. Não se chama todo handler envolvente de revisado porque uma microfunção foi lida.

### Áreas que ainda ficaram apenas catalogadas nesta frente

- Os 13 arquivos ainda catalogados nesta frente têm responsável explícito: 12 arquivos IA com infra e gmail-oauth com root. A união global deve usar a cobertura desses responsáveis sem atribuir leitura a providers.

- Geração/budget, kernels, Talk X, Multiplix, Evolution, rotinas de mídia, schemas/HMAC, utilitários de voz, catálogo e diagnósticos do lote providers foram percorridos integralmente na segunda passagem.

- Lote connections, settings/ai-providers, useConnectionsManager e groups concluído; useWhatsAppStatus pertence à frente auth. Ampliação para lacunas de hooks/evolution, hooks/integrations, components/integrations e whatsapp-flows em andamento, registrada separadamente ao ler os arquivos.

- Configuração implantada, payloads reais de cada versão Evolution, agendadores e efeitos/triggers de bancos externos permanecem sem evidência operacional.

### Lista explícita de arquivos apenas catalogados

A lista é deliberadamente completa para permitir união com a cobertura AST/global e com outras frentes:
- `supabase/functions/_shared/ai-conversation-pipeline.ts`
- `supabase/functions/_shared/ai-image-input.ts`
- `supabase/functions/ai-churn-analysis/index.ts`
- `supabase/functions/ai-classify-tickets/index.ts`
- `supabase/functions/ai-conversation-analysis/index.ts`
- `supabase/functions/ai-conversation-summary/index.ts`
- `supabase/functions/ai-enhance-message/index.ts`
- `supabase/functions/ai-suggest-reply/index.ts`
- `supabase/functions/chatbot-l1/index.ts`
- `supabase/functions/classify-audio-meme/index.ts`
- `supabase/functions/classify-emoji/index.ts`
- `supabase/functions/classify-sticker/index.ts`
- `supabase/functions/gmail-oauth/index.ts`

## Probes e fontes primárias

- `reproduce.mjs` / `probe-results.json`: P01–P10, importação real de helpers e clientes em memória.
- `reproduce-provider-control.mjs` / `provider-control-probe-results.json`: P11–P15, handler de controle, merge de privacidade, v2, statement de heartbeat e escolha A/B.
- `reproduce-privileged-effects.mjs` / `privileged-effects-probe-results.json`: P16/P17, autorização por objeto com mídia nula e controle positivo; P18, auto-close com três escritas recusadas.
- `reproduce-multiplix-review.mjs` / `multiplix-review-probe-results.json`: P19/P20, prévia/validação com destinatário estrangeiro e projeção SELECT fiel; P21, resumo/estimativa com público acima do teto de linhas simulado.
- `reproduce-media-ai-control.mjs` / `media-ai-control-probe-results.json`: P22, presença ignora cancelamento; P23/P24, teste de IA evita cota e log, com controle normal recusado.
- `reproduce-final-endpoints.mjs` / `final-endpoints-probe-results.json`: P25, timestamp renovado sem alterar HMAC; P26, defaults incompatíveis com RPC; P27, tráfego de A atribuído a B; P28, 2500 ignorados viram 2000 ignorados e 500 pendentes no e-mail interceptado.
- `reproduce-frontend-providers.mjs` / `frontend-providers-probe-results.json`: P29, resposta/polling de A alteram QR e status de B e deixam timer sem referência; P30, erro lógico do proxy gera sucesso em envio e sincronização de grupos. Blobs dos hooks são validados contra o manifesto antes da avaliação.
- `verify-source.mjs`: antes de qualquer import da aplicação, compara HEAD real e blobs Git/tamanhos de todo o prefixo supabase/functions mais config com source-integrity.json. Abrange todos os módulos locais transitivos dos probes; não lê arquivos de ambiente.
- `findings.json`: dados normalizáveis, pinados ao HEAD; `coverage.json`: cobertura por faixa/símbolo; `build_report.py`: gerador desta documentação.

A referência oficial Gmail history.list distingue `nextPageToken` de `historyId` corrente da caixa e orienta armazenar o cursor depois de esgotar páginas. O guia de sincronização descreve processamento incremental de mudanças e recuperação por full sync em history expirado. Esses contratos sustentam R2-API-011; não se presume que uma página representa todos os eventos.

O guia oficial de background tasks do Supabase exige preservar a execução da Promise quando se quer trabalho posterior à resposta; ele não cria atomicidade de efeitos. O source oficial PostgrestBuilder implementa fetch no consumo de `then`; a URL de master foi recuperada, a tag exata v2.87.1 não foi baixada. Essa diferença está marcada em R2-API-013.

Não foram realizados deploy, mutation de banco real, contato a provedores, envio de mensagens, leitura de secrets nem alteração do checkout. O relatório não fecha aceites operacionais que dependem dessas evidências.
