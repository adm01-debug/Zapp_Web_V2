# Reauditoria Inbox/Chat — da307ba5626d

**Resultado: 39 achados — 38 confirmados estaticamente e 1 lacuna(s); 12 P1, 26 P2, 1 P3. Foram executadas 28 probes offline, todas com asserções satisfeitas.**

A revisão confirmou falhas na cadeia de envio e na semântica de UI que não apareciam individualizadas na auditoria anterior: encaminhamento e interativos sem transporte, metadados de resposta perdidos, persistência seguida de rollback indevido de anexo, retry que altera identidade, captura de microfone sem liberação nas duas condições descritas, janelas de histórico e erros silenciosos. Não foi realizada correção de produto.

## Fontes e limites de autoridade

- Snapshot atual: `/workspace/scratch/f8f9b9cbce53/reaudit/source`, SHA `da307ba5626dce892f0b37cb6762463f55d14a96`.
- Auditoria anterior: `/workspace/scratch/8b95153002da/reconciliation/docs/reconciliation`, baseline `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`.
- Comparação de blobs de todos os 123 arquivos lidos/citados: 123 idênticos ao baseline; ver baseline-comparison.json. Os achados são descobertas da reauditoria, não regressões atribuídas ao novo HEAD.
- Foram lidos AGENTS.md e instruções pertinentes. O graphify-out/graph.json não está presente no snapshot, então não foi alegada consulta de grafo. Skill Supabase foi usada como orientação de fronteiras; instruções de implantação/consulta viva não foram aplicadas à auditoria somente local.
- Código-fonte permaneceu inalterado. Probes, relatórios e scripts estão somente nesta pasta. Não foram usados credenciais, microfone, banco, rede de serviço ou provider real.

## Comparação com a cobertura anterior

O MASTER_LEDGER anterior contabiliza 4065 arquivos estruturais, 2394 ASTs e 62 planos. Essas métricas e a existência de registros por arquivo não demonstram que os callbacks e consumidores de cada operação tenham sido confrontados. Esta rodada registrou trechos/símbolos e percorreu o caminho de UI→hook→serviço para os fluxos descritos.

| Achado anterior | Resultado desta rodada |
|---|---|
| OTH-001 | Continua aplicável à seleção de Arquivos fora do filtro. Não foi renumerado como novo. O encaminhamento do balão tem raiz diferente e está em R2-INB-002. |
| OTH-002 | Continuidade da falta de invalidação dos contadores em exclusão/update. Não recontado. R2-INB-012 cobre classificação divergente mesmo com cache atualizado. |
| TRA-011 | Catálogo de tags sem paginação preservado. R2-INB-020 é independente: filtro de tag conhecido aplicado após LIMIT ou ignorado nas mensagens. |
| OTH-012, VOL-01/03/04/05 | Limitações de QA/matriz física e problemas de volume anteriores não foram tratados como resolvidos. O recurso de captura do gravador (R2-INB-008) é diferente do AudioContext do player. |

## Índice dos achados

| ID | Severidade | Estado | Título |
|---|---|---|---|
| R2-INB-001 | P1 | confirmado estaticamente | Resposta/citação selecionada no Composer perde o ID antes do transporte |
| R2-INB-002 | P1 | confirmado estaticamente | Encaminhar mensagem pelo chat anuncia conclusão sem executar envio |
| R2-INB-003 | P1 | confirmado estaticamente | Construtor de mensagens interativas confirma envio sem transporte |
| R2-INB-004 | P1 | confirmado estaticamente | Histórico anterior às últimas 1000 mensagens não é alcançável pela UI ativa |
| R2-INB-005 | P1 | confirmado estaticamente | Janela global de mensagens transforma conversas ativas em histórico vazio e zero não lidas |
| R2-INB-006 | P1 | confirmado estaticamente | Falha após enqueue remove o anexo persistido e retry cria outra ação |
| R2-INB-007 | P1 | confirmado estaticamente | Retry de texto duplica assinatura e rompe a idempotência |
| R2-INB-008 | P1 | confirmado estaticamente | Gravador não interrompe captura no limite de duração nem no unmount |
| R2-INB-009 | P1 | confirmado estaticamente | Transferência do chat e em lote viola o contrato do diálogo |
| R2-INB-010 | P1 | confirmado estaticamente | Agendamento fecha e apaga draft antes de confirmar persistência |
| R2-INB-011 | P2 | confirmado estaticamente | Seletor de anexos permite seleção múltipla mas aproveita somente o primeiro |
| R2-INB-012 | P2 | confirmado estaticamente | Galeria classifica áudio WebM como vídeo e diverge dos contadores |
| R2-INB-013 | P2 | confirmado estaticamente | Overlay de realtime antigo sobrescreve snapshot mais novo no refetch |
| R2-INB-014 | P1 | confirmado estaticamente | Editar e apagar mensagem exibem sucesso mesmo com operação rejeitada |
| R2-INB-015 | P2 | confirmado estaticamente | Cache offline válido é abandonado após falha de carga e não alimenta chat selecionado |
| R2-INB-016 | P2 | confirmado estaticamente | Enter contorna limite de caracteres aplicado ao botão Enviar |
| R2-INB-017 | P2 | confirmado estaticamente | Atalhos de busca têm dois handlers concorrentes no Composer |
| R2-INB-018 | P2 | confirmado estaticamente | Ações rápidas e seleção da busca embutida fecham sem executar intenção |
| R2-INB-019 | P2 | confirmado estaticamente | Navegação da busca gera NaN quando não há resultados e ignora ações rápidas |
| R2-INB-020 | P2 | confirmado estaticamente | Filtro por tag na busca limita contatos tarde demais e não limita mensagens |
| R2-INB-021 | P2 | confirmado estaticamente | Menu do balão, menu do header e comandos anunciam ações ainda sem implementação |
| R2-INB-022 | P1 | confirmado estaticamente | Falha ao enviar áudio desmonta gravador e descarta gravação recuperável |
| R2-INB-023 | P2 | confirmado estaticamente | Popup remapeia Message como linha crua e remove dados necessários ao balão |
| R2-INB-024 | P2 | confirmado estaticamente | Erro na carga de mensagens selecionadas é transformado em conversa vazia |
| R2-INB-025 | P2 | confirmado estaticamente | Mensagem nova e indicador de digitação forçam rolagem ao fim durante leitura |
| R2-INB-026 | P2 | confirmado estaticamente | Presença de digitação entre agentes colide na identidade literal agent |
| R2-INB-027 | P2 | confirmado estaticamente | Filtro Última interação reintroduz sessões antigas do mesmo dia |
| R2-INB-028 | P2 | confirmado estaticamente | Lista virtualizada descarta a prioridade de não lidas calculada pelos filtros |
| R2-INB-029 | P2 | lacuna | Adiar conversa grava snooze, mas efeito operacional e retomada não são consumidos pela Inbox |
| R2-INB-030 | P3 | confirmado estaticamente | Header declara contato Online sem consultar presença online |
| R2-INB-031 | P2 | confirmado estaticamente | Botão Baixar documento não respeita o controle can_download do perfil |
| R2-INB-032 | P2 | confirmado estaticamente | Reações confirmam a mutação local mesmo quando o transporte rejeita |
| R2-INB-033 | P2 | confirmado estaticamente | Refresh antigo de URL assinada deixa a próxima mídia sem URL e presa em carregamento |
| R2-INB-034 | P2 | confirmado estaticamente | Carregar mais na Jornada não ultrapassa as janelas fixas das consultas |
| R2-INB-035 | P2 | confirmado estaticamente | Jornada mostra tarefas concluídas no modelo atual como Pendente |
| R2-INB-036 | P2 | confirmado estaticamente | GPS atrasado pode substituir um ponto manual escolhido depois no mesmo picker |
| R2-INB-037 | P2 | confirmado estaticamente | Mudar o termo durante retrieve ainda permite aplicar o endereço antigo |
| R2-INB-038 | P2 | confirmado estaticamente | Salvar figurinha na biblioteca confirma sucesso sem verificar o insert |
| R2-INB-039 | P2 | confirmado estaticamente | Busca manual de localização não mostra os vários candidatos devolvidos pelo fallback |

## Evidências e critérios de aceite

### R2-INB-001 — Resposta/citação selecionada no Composer perde o ID antes do transporte

**P1 · confirmado estaticamente.** Catálogo: 2.11.

**Causa.** handleSend lê e limpa replyToMessage, mas só passa a string assinada para onSendMessage. O contrato de props, a ponte Inbox e messageSender continuam sem replyToId, apesar de o serviço canônico aceitar o campo.

**Consumidor/precondição.** ChatPanel ativo, usuário clica Responder em uma mensagem e envia texto; também afeta ChatPopup que usa o mesmo painel.

**Efeito.** O destinatário recebe texto sem vínculo de resposta. O preview de citação desaparece, sugerindo que a resposta foi enviada corretamente.

**Evidência no snapshot atual:**

- `src/components/inbox/chat/useChatPanelHandlers.ts:108–126` — wasReply é apenas logado; onSendMessage recebe um argumento. SHA `da307ba5626d`; blob `2aee00c55c477c48c92e13a7cabf62f3bd513da9`.
- `src/components/inbox/ChatPanel.tsx:42–45` — Prop onSendMessage aceita somente content. SHA `da307ba5626d`; blob `f2561bc99f053782ac17f2769ea34fe262d9d8f8`.
- `src/hooks/inbox/useRealtimeInbox.ts:150–169` — Ponte transmite somente contactId e content. SHA `da307ba5626d`; blob `6e98d0c5044c047886c0c57227d4f9dd4cd3cc5b`.
- `src/hooks/realtime/messageSender.ts:21–40` — Envio ativo não recebe quote. SHA `da307ba5626d`; blob `4e1b99ee91c393ffa0dd184430e0e26a52cc9ed5`.
- `src/services/outbound-message.service.ts:110–119` — p_reply_to_id existe no contrato canônico. SHA `da307ba5626d`; blob `a328efc57530103d0e3fc0c2256420032db982ae`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- O clique Responder deve carregar o ID original até enqueue e a entrega.
- Ao falhar envio, preservar texto original e citação.
- Teste de integração do Composer deve verificar o payload final, além do preview.

**Reprodução offline.** reply_metadata

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-002 — Encaminhar mensagem pelo chat anuncia conclusão sem executar envio

**P1 · confirmado estaticamente.** Catálogo: 2.12, 3.12.

**Causa.** O callback handleForwardToTargets contém somente log.debug. O ForwardMessageDialog aceita o retorno void legado como conclusão e mostra sucesso.

**Consumidor/precondição.** Mensagem no balão → Encaminhar → contato ou grupo → confirmar. Esta rota é diferente do encaminhamento real da aba Arquivos.

**Efeito.** O diálogo fecha com Mensagem encaminhada, mas nenhum RPC/serviço de envio é invocado.

**Evidência no snapshot atual:**

- `src/components/inbox/chat/useChatPanelHandlers.ts:130–133` — Handler do chat sem transporte. SHA `da307ba5626d`; blob `2aee00c55c477c48c92e13a7cabf62f3bd513da9`.
- `src/components/inbox/chat/ChatDialogs.tsx:53–58` — ForwardMessageDialog ligado ao handler. SHA `da307ba5626d`; blob `c8c8ecb996e40bee4e7034f6955c331e45cbe2f2`.
- `src/components/inbox/ForwardMessageDialog.tsx:25–52` — Contrato legado void e todos os tipos de destino. SHA `da307ba5626d`; blob `3fec40733d538a5d963737755814f28489a3c0e7`.
- `src/hooks/chat/useForwardMessage.ts:161–165` — void vira resultado null. SHA `da307ba5626d`; blob `4112f141c796c19343cd3856188edbb8098dc1e0`.
- `src/hooks/chat/useForwardMessage.ts:197–242` — Fluxo null anuncia sucesso e reseta diálogo. SHA `da307ba5626d`; blob `4112f141c796c19343cd3856188edbb8098dc1e0`.

**Relação anterior.** Nova falha no caminho do balão. OTH-001 é diferente: na aba Arquivos há envio real, mas a seleção fora do filtro é omitida. Não reconta OTH-001.

**Aceite:**

- Encaminhar deve usar contrato canônico e informar resultado por destino.
- Falha parcial deve conservar destinos pendentes e permitir retry idempotente.
- Testar o caminho do balão separadamente da aba Arquivos.

**Reprodução offline.** forward_interactive_noop

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-003 — Construtor de mensagens interativas confirma envio sem transporte

**P1 · confirmado estaticamente.** Catálogo: 3.7, 3.8, 3.9.

**Causa.** handleSendInteractiveMessage só cria um toast. O builder chama o callback, limpa o formulário e fecha sem contrato assíncrono.

**Consumidor/precondição.** Menu de ferramentas do Composer → Mensagem Interativa → botões, lista ou CTA URL → enviar.

**Efeito.** Mensagem interativa enviada é exibido, mas não há enqueue/entrega da composição; o conteúdo é descartado.

**Evidência no snapshot atual:**

- `src/components/inbox/chat/useChatPanelHandlers.ts:242–248` — Handler de envio apenas toast; clique interativo também é somente feedback local. SHA `da307ba5626d`; blob `2aee00c55c477c48c92e13a7cabf62f3bd513da9`.
- `src/components/inbox/InteractiveMessageBuilder.tsx:43–48` — onSend seguido de resetForm e fechamento. SHA `da307ba5626d`; blob `b757acc44b4d22765eb022c8d7058928b90df893`.
- `src/components/inbox/chat/ChatDialogs.tsx:53–58` — Wiring efetivo. SHA `da307ba5626d`; blob `c8c8ecb996e40bee4e7034f6955c331e45cbe2f2`.
- `src/components/inbox/chat/ChatInputToolbars.tsx:131–150` — Menu visível abre esse builder; AdvancedMessageMenu é outra rota. SHA `da307ba5626d`; blob `574d864f2b373d7ff3c932b8b355d267d8c0cd6c`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Implementar resultado explícito de envio para os três tipos ou apresentar funcionalidade indisponível.
- Fechar/limpar somente após aceite do transporte; preservar composição em falha.
- Não usar testes de poll/contact de AdvancedMessageMenu como prova dos tipos interativos.

**Reprodução offline.** forward_interactive_noop

**Limite.** Não afirma que enquetes/cartões também são no-op: AdvancedMessageMenu chama sendRichOutboundMessage. Não pressupõe suporte atual do provedor a cada tipo.

### R2-INB-004 — Histórico anterior às últimas 1000 mensagens não é alcançável pela UI ativa

**P1 · confirmado estaticamente.** Catálogo: 2.25, 2.3.

**Causa.** useMessages implementa cursor e loadOlderMessages, e useRealtimeInbox os exporta, mas RealtimeInboxView/ChatPanel/ChatMessagesArea não os consomem. ChatPopup tampouco os consome.

**Consumidor/precondição.** Contato possui mais de 1000 mensagens; usuário procura conteúdo mais antigo pela rolagem ou busca dentro da conversa.

**Efeito.** A conversa e a busca local exibem somente a janela inicial. Não existe botão/sentinel no caminho ativo para carregar a página anterior.

**Evidência no snapshot atual:**

- `src/hooks/chat/useMessages.ts:18–18` — Página inicial fixada em 1000. SHA `da307ba5626d`; blob `8cff663272e7a2ad435e7deaf7a89c1a4c668e56`.
- `src/hooks/chat/useMessages.ts:104–148` — Paginação existe no hook. SHA `da307ba5626d`; blob `8cff663272e7a2ad435e7deaf7a89c1a4c668e56`.
- `src/hooks/inbox/useRealtimeInbox.ts:215–218` — Ponte exporta hasOlder e loadOlder. SHA `da307ba5626d`; blob `6e98d0c5044c047886c0c57227d4f9dd4cd3cc5b`.
- `src/components/inbox/RealtimeInboxView.tsx:289–328` — Props do ChatPanel não carregam paginação. SHA `da307ba5626d`; blob `3d6dacf92511e917426345a7f390dbe408d1ce1b`.
- `src/components/inbox/chat/ChatMessagesArea.tsx:17–40` — Interface de props sem paginação. SHA `da307ba5626d`; blob `955d8557e8c2cdd4b9a0df49ea936ab1dd5763a4`.
- `src/components/inbox/chat/ChatMessagesArea.tsx:127–199` — Render ativo sem controle de carga anterior. SHA `da307ba5626d`; blob `955d8557e8c2cdd4b9a0df49ea936ab1dd5763a4`.
- `src/hooks/chat/useChatSearch.ts:139–167` — Busca somente messages carregadas. SHA `da307ba5626d`; blob `f5854ca4a4fe5374588c3fb4062dd965fc2454d9`.
- `src/pages/ChatPopup.tsx:70–73` — Popup também ignora cursor. SHA `da307ba5626d`; blob `cb665a32970cf4f0582c46d3866b88725a41bf2d`.
- `src/hooks/__tests__/useMessages.test.tsx:246–270` — Teste chama loadOlder diretamente, sem verificar alcançabilidade na UI. SHA `da307ba5626d`; blob `6d68ed2b12ef9f1664ba45de647b60fd1a906f42`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Ligar cursor à UI com indicação de início/fim e estado de erro.
- Preservar âncora ao prepend e lidar com timestamps iguais.
- Teste de consumidor com 1001+mensagens deve abrir/localizar a mais antiga.

**Reprodução offline.** Inspeção do caminho ativo e dos trechos citados; sem reprodução de DOM/provedor/banco neste trabalho.

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-005 — Janela global de mensagens transforma conversas ativas em histórico vazio e zero não lidas

**P1 · confirmado estaticamente.** Catálogo: 2.1, 2.6, 2.10.

**Causa.** A carga inicial usa 500 contatos recentes e 1000 mensagens globais. buildConversation calcula último item/unread somente dessa amostra; filtros de abertas exigem messages.length>0 e markAsRead pula o contato se o unread amostrado for zero.

**Consumidor/precondição.** Dois contatos acessíveis A e B; as 1000 mensagens globais mais recentes pertencem a A, e B tem conversa aberta com mensagens anteriores, inclusive não lidas.

**Efeito.** B fica sem lastMessage e unreadCount 0 e desaparece da lista de abertas, ainda que esteja entre os 500 contatos. A busca local da lista não recupera contatos fora da amostra.

**Evidência no snapshot atual:**

- `src/services/realtime.service.ts:20–22` — Limites globais. SHA `da307ba5626d`; blob `a9ea1fbe585827e7a9ffaf918d7c9994797e52dc`.
- `src/services/realtime.service.ts:45–89` — Cargas e montagem sem agregado por contato. SHA `da307ba5626d`; blob `a9ea1fbe585827e7a9ffaf918d7c9994797e52dc`.
- `src/hooks/realtime/realtimeUtils.ts:17–27` — unread e lastMessage derivados do subconjunto. SHA `da307ba5626d`; blob `91f68d605c8bbf3dc0769e098e57ab36fc7f45a7`.
- `src/hooks/inbox/useInboxFilters.ts:79–110` — Aberta exige amostra não vazia. SHA `da307ba5626d`; blob `cc80d5db7b34aca33a10460213b6d87176bebf6b`.
- `src/hooks/chat/useRealtimeMessages.ts:246–254` — Early return se unreadCount 0. SHA `da307ba5626d`; blob `b5dc702c078893767a550f56093e4708679e43c9`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Usar consultas paginadas de conversas/última mensagem/agregado de não lidas, sem inferir ausência de histórico de uma amostra global.
- Conservar contatos abertos sem mensagens na janela.
- Fixture com 1001 mensagens de dois contatos deve preservar B e sua contagem.

**Reprodução offline.** global_window_hides_contact

**Limite.** O cenário de truncamento é reproduzido localmente; volume/distribuição atuais em produção não foram medidos. O campo opcional contacts.unread_messages não evita a exclusão anterior por messages.length.

### R2-INB-006 — Falha após enqueue remove o anexo persistido e retry cria outra ação

**P1 · confirmado estaticamente.** Catálogo: 2.35, 3.2, 3.3, 3.5.

**Causa.** useFileUploadLogic faz rollback de storage para qualquer rejeição de sendOutboundMessage. Esse serviço primeiro persiste a mensagem e depois dispara entrega, que pode rejeitar com a linha já criada. Nova tentativa faz novo upload/URL, mudando actionKey/clientMessageId.

**Consumidor/precondição.** Upload bem-sucedido; enqueue confirmado; entrega rejeita ou sua resposta é perdida. Usuário reenvia o mesmo arquivo.

**Efeito.** Mensagem/worker pode apontar para objeto removido. Uma tentativa posterior cria outro ID de ação, podendo duplicar entrega sob resultado anterior incerto.

**Evidência no snapshot atual:**

- `src/components/inbox/useFileUploadLogic.ts:90–136` — Nome novo por tentativa e remoção incondicional no catch de envio. SHA `da307ba5626d`; blob `af489a0f3136df5d5316ed2b2a409795ba457304`.
- `src/services/outbound-message.service.ts:71–88` — URL integra a chave e controla ID pendente. SHA `da307ba5626d`; blob `a328efc57530103d0e3fc0c2256420032db982ae`.
- `src/services/outbound-message.service.ts:110–145` — Enqueue precede dispatch que ainda pode falhar. SHA `da307ba5626d`; blob `a328efc57530103d0e3fc0c2256420032db982ae`.
- `src/lib/storage_object_upload.ts:54–61` — Rollback realmente chama storage.remove. SHA `da307ba5626d`; blob `1945625b0d173202c91d559739e2c45ecf820c43`.
- `src/components/inbox/__tests__/useFileUploadLogic.test.tsx:102–117` — Teste exige remover objeto em qualquer rejeição do mock, sem modelar enqueue já persistido. SHA `da307ba5626d`; blob `49d05220efc7fa5d0649126e6f66a26052768cd7`.
- `src/hooks/chat/useForwardMedia.ts:118–130` — Caminho de forward consulta se mensagem foi enfileirada. SHA `da307ba5626d`; blob `72696d66e0aa8f8e1114d5742aa9e9fdd2eeb63d`.
- `src/hooks/chat/useForwardMedia.ts:173–190` — Forward já distingue resultado incerto antes de apagar cópia. SHA `da307ba5626d`; blob `72696d66e0aa8f8e1114d5742aa9e9fdd2eeb63d`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Rollback só quando houver evidência de que nenhum registro persistido referencia o objeto.
- Manter ID lógico e objeto no retry de resultado incerto.
- Simular upload→enqueue→falha dispatch e verificar objeto/ID, além do erro visual.

**Reprodução offline.** media_rollback

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-007 — Retry de texto duplica assinatura e rompe a idempotência

**P1 · confirmado estaticamente.** Catálogo: 3.1.

**Causa.** handleSend aplica assinatura antes de enviar e restaura messageContent já assinado no catch. applySignature sempre prefixa novamente. A chave de idempotência do serviço inclui o texto.

**Consumidor/precondição.** Assinatura ativa; primeira tentativa de envio tem resultado incerto ou erro; usuário clica reenviar no draft restaurado.

**Efeito.** Segundo envio contém duas assinaturas e usa outro clientMessageId, permitindo duplicação que a retenção de ID do serviço tentava impedir.

**Evidência no snapshot atual:**

- `src/components/inbox/chat/useChatPanelHandlers.ts:108–127` — Restauração usa payload assinado. SHA `da307ba5626d`; blob `2aee00c55c477c48c92e13a7cabf62f3bd513da9`.
- `src/hooks/chat/useMessageSignature.ts:51–54` — Prefixo sempre aplicado quando habilitado. SHA `da307ba5626d`; blob `e968bbed653ad68b4c0ecf35fbfb0a53a374e30b`.
- `src/services/outbound-message.service.ts:71–88` — Conteúdo participa da identidade da ação. SHA `da307ba5626d`; blob `a328efc57530103d0e3fc0c2256420032db982ae`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Restaurar o texto original do editor, preservando a identidade lógica da tentativa.
- Retry de erro ambíguo deve reutilizar clientMessageId e não duplicar assinatura.
- Cobrir callback Desfazer, que também restaura texto assinado.

**Reprodução offline.** signature_retry

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-008 — Gravador não interrompe captura no limite de duração nem no unmount

**P1 · confirmado estaticamente.** Catálogo: 4.1, 3.4.

**Causa.** stopRecording/cancelRecording dependem de isRecording. O timer criado por startRecording e o cleanup do useEffect([]) capturam a versão inicial em que isRecording=false; os guards impedem stop/tracks.stop. O hook não tem cleanup próprio.

**Consumidor/precondição.** Gravação iniciada pelo componente AudioRecorder; atingir maxDuration ou trocar de contato/fechar componente enquanto grava.

**Efeito.** O contador deixa de aumentar no limite, porém o MediaRecorder e as tracks podem continuar capturando após a UI ter sido desmontada.

**Evidência no snapshot atual:**

- `src/hooks/communication/useAudioRecorder.ts:14–21` — Estado inicial false e refs do recurso. SHA `da307ba5626d`; blob `5d8a02dc8a1e53b8577aacb7508dc27f4bece3ae`.
- `src/hooks/communication/useAudioRecorder.ts:55–77` — Timer captura stopRecording inicial. SHA `da307ba5626d`; blob `5d8a02dc8a1e53b8577aacb7508dc27f4bece3ae`.
- `src/hooks/communication/useAudioRecorder.ts:79–106` — Guards dependem do estado capturado. SHA `da307ba5626d`; blob `5d8a02dc8a1e53b8577aacb7508dc27f4bece3ae`.
- `src/components/inbox/AudioRecorder.tsx:50–57` — Cleanup captura cancelRecording do primeiro render. SHA `da307ba5626d`; blob `6690c7a1bc23e14251d9d78b26523f4670df65f5`.
- `src/hooks/__tests__/useAudioRecorder.test.ts:1–117` — Testes não exercitam ciclo real start/stop/unmount. SHA `da307ba5626d`; blob `ccbe6915b3cbf33f493dbfdb422647a6a521102d`.
- `src/components/inbox/__tests__/AudioRecorder.test.tsx:4–14` — Hook é substituído por mock. SHA `da307ba5626d`; blob `3cb5dc88b38621dbe3536dd35a75019405c65005`.

**Relação anterior.** Nova falha de captura de microfone. VOL-01 trata AudioContext do player/volume, recurso e ciclo diferentes.

**Aceite:**

- Gerir liberação por refs/estado real do MediaRecorder, com cleanup idempotente.
- Cancelar captura também se getUserMedia resolver depois do unmount ou construtor falhar.
- Verificar stop, tracks.stop e clearInterval no timeout/unmount em testes de lifecycle.

**Reprodução offline.** recorder_lifecycle

**Limite.** Probe usa MediaRecorder e tracks simulados, sem microfone/browser físico. A continuação da captura resulta da semântica de closures; incidência/dispositivos reais não foram medidos.

### R2-INB-009 — Transferência do chat e em lote viola o contrato do diálogo

**P1 · confirmado estaticamente.** Catálogo: 2.22, 2.34.

**Causa.** ChatDialogs omite queueId e força o tipo connection para callback agent|queue. O diálogo trata todos como sem fila e filtra colegas. Callback converte connection em queue_id, ignora nota e resolve mesmo com erro. BulkActionsToolbar repete o cast e fecha sem await.

**Consumidor/precondição.** Transferir a partir do header/chip/slash do ChatPanel, ou toolbar de seleção; contato já tem fila, ou usuário seleciona Conexão, ou update é rejeitado.

**Efeito.** Colegas desaparecem indevidamente do picker. Connection ID é enviado como queue ID. Falha fecha/limpa o diálogo; a nota não é persistida/enviada.

**Evidência no snapshot atual:**

- `src/components/inbox/chat/ChatDialogs.tsx:30–33` — Contrato restrito do callback. SHA `da307ba5626d`; blob `c8c8ecb996e40bee4e7034f6955c331e45cbe2f2`.
- `src/components/inbox/chat/ChatDialogs.tsx:53–53` — Cast amplia tipo e omite queueId. SHA `da307ba5626d`; blob `c8c8ecb996e40bee4e7034f6955c331e45cbe2f2`.
- `src/components/inbox/TransferDialog.tsx:61–95` — Ausência de queueId ativa self-only; fechamento depende de rejeição. SHA `da307ba5626d`; blob `bea5653b01d3051d32a0847be085fb0a008e790e`.
- `src/components/inbox/ChatPanel.tsx:196–205` — type!==agent vira queue_id, message ignorada e erro resolve. SHA `da307ba5626d`; blob `f2561bc99f053782ac17f2769ea34fe262d9d8f8`.
- `src/components/inbox/BulkActionsToolbar.tsx:30–33` — Lote não aguarda. SHA `da307ba5626d`; blob `00c19c95ac6a54d4cc8fc6950edea3005c24aa60`.
- `src/components/inbox/BulkActionsToolbar.tsx:127–131` — Mesmo cast e queueId ausente no lote. SHA `da307ba5626d`; blob `00c19c95ac6a54d4cc8fc6950edea3005c24aa60`.
- `src/hooks/inbox/useInboxBulkActions.ts:71–94` — Lote também roteia else para queue_id. SHA `da307ba5626d`; blob `e367da296db645080bb69a62096897453061a02f`.
- `src/components/inbox/ConversationListSidebar.tsx:297–303` — Sidebar passa queueId, mas fecha após callback resolvido. SHA `da307ba5626d`; blob `4f54f1e9dd47cc023ad29dba8804602a8b4594e5`.
- `src/hooks/chat/useConversationActions.ts:177–190` — Consumer de lista resolve também quando operação falha/não suporta connection. SHA `da307ba5626d`; blob `e2197ee8ea0014c088f0ae54be0eaa9895917ede`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Passar contexto correto de fila e tipos suportados por cada consumidor, sem cast que encubra incompatibilidade.
- Falha deve rejeitar/preservar diálogo e seleção.
- Definir destino da nota de transferência e verificar persistência.
- Testar header, sidebar e lote separadamente; sidebar passa queueId, mas ainda resolve erros de transferContact.

**Reprodução offline.** transfer_wrong_kind

**Limite.** FK de conexão→fila foi simulado na probe; a escrita incorreta de queue_id é confirmada estaticamente. Se IDs coincidirem, o destino incorreto pode ser aceito, portanto o achado não depende exclusivamente de erro FK.

### R2-INB-010 — Agendamento fecha e apaga draft antes de confirmar persistência

**P1 · confirmado estaticamente.** Catálogo: 21.1.

**Causa.** ScheduleMessageDialog tipa onSchedule como void, chama sem await e imediatamente mostra sucesso/reseta. O callback real é assíncrono, faz upload/insert e captura erro de upload apenas em log.

**Consumidor/precondição.** Agendar mensagem pelo Composer; upload ou persistência demora/falha.

**Efeito.** Mensagem agendada! aparece durante a operação pendente e o draft/anexo são descartados. Falha posterior pode exibir toast contrário ou somente log, sem recuperação do draft.

**Evidência no snapshot atual:**

- `src/components/inbox/ScheduleMessageDialog.tsx:19–22` — Callback void. SHA `da307ba5626d`; blob `c888205672230e8a41e6766d7878211edf6db7f9`.
- `src/components/inbox/ScheduleMessageDialog.tsx:38–59` — Sucesso/reset antes do resultado. SHA `da307ba5626d`; blob `c888205672230e8a41e6766d7878211edf6db7f9`.
- `src/components/inbox/ChatPanel.tsx:207–223` — Callback real await upload/schedule e catch somente log. SHA `da307ba5626d`; blob `f2561bc99f053782ac17f2769ea34fe262d9d8f8`.
- `src/hooks/chat/useScheduledMessages.ts:44–83` — Persistência pode rejeitar após o diálogo fechar. SHA `da307ba5626d`; blob `68fa21fd6d09f821beef4ba9842e0f28c87b478b`.
- `src/components/inbox/__tests__/ScheduleMessageDialog.test.tsx:21–28` — Mock síncrono não cobre o contrato async. SHA `da307ba5626d`; blob `45ac1d44e998e461f43fed94849c78362f3dc4ee`.

**Relação anterior.** Nova falha da UI. Separada do executor ausente nos artefatos versionados investigado pelo agente providers (R2-API-017 provisório) e da leitura global da Agenda investigada pelo agente IA.

**Aceite:**

- Usar Promise com estado pendente e sucesso apenas após confirmação.
- Preservar draft/anexo em qualquer falha e evitar submissão duplicada.
- Dar tratamento explícito para upload persistido mas insert rejeitado.

**Reprodução offline.** schedule_before_persistence

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-011 — Seletor de anexos permite seleção múltipla mas aproveita somente o primeiro

**P2 · confirmado estaticamente.** Catálogo: 2.35.

**Causa.** O input nativo de FileUploader tem multiple, mas handleFileChange usa e.target.files?.[0]. O caminho alternativo de drag/paste/chip usa handleExternalFiles e funciona de modo diferente.

**Consumidor/precondição.** Ícone Anexar arquivo do FileUploader; selecionar dois ou mais arquivos no sistema operacional.

**Efeito.** Só o primeiro arquivo entra no preview/envio, sem informar que os demais foram ignorados.

**Evidência no snapshot atual:**

- `src/components/inbox/FileUploader.tsx:102–114` — Input multiple acionado pelo ícone. SHA `da307ba5626d`; blob `b5c8d3dde234f9dd8940254958989db890f95b99`.
- `src/components/inbox/useFileUploadLogic.ts:207–231` — handleExternalFiles usa fila; handleFileChange só files[0]. SHA `da307ba5626d`; blob `af489a0f3136df5d5316ed2b2a409795ba457304`.
- `src/components/inbox/chat/ChatInputArea.tsx:100–108` — Chip externo já encaminha todos. SHA `da307ba5626d`; blob `5bdbf7cbfea12de98d1afb06e51d190b75313c80`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Unificar todos os entrypoints no pipeline de múltiplos arquivos.
- Contagem/preview devem corresponder aos arquivos selecionados e reportar rejeições individuais.

**Reprodução offline.** native_multiple_files

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-012 — Galeria classifica áudio WebM como vídeo e diverge dos contadores

**P2 · confirmado estaticamente.** Catálogo: 2.26, 3.4.

**Causa.** Fallback getMediaType dá precedência à extensão webm na categoria vídeo antes de verificar messageType=audio. Counts usa a coluna message_type. classify usa o fallback quando MIME/ptt faltam.

**Consumidor/precondição.** Registro de mensagem audio com URL.webm e media_type/media_mimetype/ptt ausentes. ChatService.uploadAudio produz justamente URLs.webm; registros antigos também podem satisfazer o caso.

**Efeito.** Chip Áudio pode mostrar contagem que não corresponde aos itens; gravação aparece em Vídeos. Encaminhar pela galeria reutiliza tipo classificado e pode tentar envio como vídeo.

**Evidência no snapshot atual:**

- `src/components/inbox/media-gallery/mediaUtils.ts:10–19` — webm vence messageType audio. SHA `da307ba5626d`; blob `981dacf45c0ea7aacc83f8cf3c3a81298e83b099`.
- `src/hooks/chat/useContactMedia.ts:136–150` — Condição para o fallback. SHA `da307ba5626d`; blob `dd62b290ce7572ee7cc76e3b0b2019402fc02942`.
- `src/hooks/chat/useContactMediaCounts.ts:38–52` — Counts por message_type. SHA `da307ba5626d`; blob `332d8e529d6ca6585179b57042d6872940c44075`.
- `src/services/chat.service.ts:111–127` — Upload de voz usa.webm. SHA `da307ba5626d`; blob `70a69d19defffac347d37d7001b8876e9f5b8b68`.
- `src/components/inbox/tabs/FilesTab.tsx:166–185` — Tipo do item segue para forward. SHA `da307ba5626d`; blob `de1d14e73e67927d6503cc87c4ac58cd3b507872`.

**Relação anterior.** Diferente de OTH-002, que trata invalidação de cache após excluir. Aqui as consultas atualizadas podem divergir por regra de classificação.

**Aceite:**

- Definir uma classificação compartilhada para listagem, contagem e encaminhamento.
- Tipo explícito de mensagem áudio deve prevalecer sobre extensão ambígua.
- Testar WebM áudio, MP4 áudio e sticker WebP com/sem metadata.

**Reprodução offline.** gallery_webm_audio

**Limite.** Precondição de ausência de metadata é explícita; não afirma que todos os áudios vivos carecem de MIME ou que webhooks nunca enriquecem registros.

### R2-INB-013 — Overlay de realtime antigo sobrescreve snapshot mais novo no refetch

**P2 · confirmado estaticamente.** Catálogo: 2.1, 2.19.

**Causa.** realtimeOverlayRef guarda o último evento de cada mensagem por toda a montagem e sempre é aplicado por cima do resultado de fetch. Só é limpo ao trocar/desabilitar contato, sem limitar overlay a eventos ocorridos durante a consulta.

**Consumidor/precondição.** Evento delivered/edição chega; atualização posterior read/nova edição não chega por realtime; refetch autoritativo retorna valor novo para o mesmo ID.

**Efeito.** Após atualizar, o chat continua mostrando delivered/conteúdo antigo. O mecanismo de reconciliação reintroduz estado ultrapassado.

**Evidência no snapshot atual:**

- `src/hooks/chat/useMessages.ts:73–90` — Overlay inteiro vence snapshot. SHA `da307ba5626d`; blob `8cff663272e7a2ad435e7deaf7a89c1a4c668e56`.
- `src/hooks/chat/useMessages.ts:150–193` — Eventos populam overlay. SHA `da307ba5626d`; blob `8cff663272e7a2ad435e7deaf7a89c1a4c668e56`.
- `src/hooks/chat/useMessages.ts:212–240` — Limpeza apenas na troca/desabilitação de contato. SHA `da307ba5626d`; blob `8cff663272e7a2ad435e7deaf7a89c1a4c668e56`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Escopar overlay por geração de consulta ou comparar versão/timestamp confiável.
- Snapshot novo deve vencer evento anterior sem descartar evento ocorrido durante fetch.
- Testar ambas ordens de corrida e tombstones de exclusão.

**Reprodução offline.** overlay_stale

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-014 — Editar e apagar mensagem exibem sucesso mesmo com operação rejeitada

**P1 · confirmado estaticamente.** Catálogo: 2.15, 3.1.

**Causa.** Edição e exclusão aguardam query PostgREST, mas não verificam result.error. Edição pode pular o provedor sem instance/externalId e ainda anunciar sucesso. Exclusão captura falha GO e usa apenas presença de externalId para dizer para todos; callback repete update sem examinar erro.

**Consumidor/precondição.** Ação de editar/apagar no balão; provedor rejeita ou contexto de conexão falta; e/ou banco devolve erro resolvido.

**Efeito.** Operador é informado de edição ou apagamento para todos que não ocorreu. Se só GO falhar e DB aceitar, a UI local diverge do conteúdo ainda existente no WhatsApp; se ambos falharem, nem o estado local precisa mudar.

**Evidência no snapshot atual:**

- `src/components/inbox/chat/useChatPanelHandlers.ts:89–105` — Edição ignora result.error e limpa editor também na falha. SHA `da307ba5626d`; blob `2aee00c55c477c48c92e13a7cabf62f3bd513da9`.
- `src/components/inbox/chat/MessageHoverToolbar.tsx:53–68` — Falha GO capturada; DB.error ignorado; toast para todos. SHA `da307ba5626d`; blob `8eb6d284602e804426c8b7d0d9f71e0581173f41`.
- `src/components/inbox/chat/ChatMessagesArea.tsx:57–63` — Callback repete deleteMessage e só captura throw. SHA `da307ba5626d`; blob `955d8557e8c2cdd4b9a0df49ea936ab1dd5763a4`.
- `src/services/chat.service.ts:104–109` — deleteMessage retorna query sem throwOnError. SHA `da307ba5626d`; blob `70a69d19defffac347d37d7001b8876e9f5b8b68`.
- `src/components/inbox/MessageContextActions.tsx:55–73` — Componente legado repete padrão, sem presumir alcançabilidade. SHA `da307ba5626d`; blob `bb710fa3ceed6eb7d2bbd2b3747287830cf38c1f`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Checar resultado de cada fronteira; diferenciar remoção local de remoção remota.
- Editar precisa confirmar provedor/contexto e persistência ou informar resultado parcial.
- Preservar draft de edição quando falhar.
- Injetar {error} resolvido e rejeição GO nos testes do consumidor ativo.

**Reprodução offline.** delete_false_success, edit_false_success

**Limite.** Não atribui rejeição de mensagens sent ao trigger: o guard vigente protege content sob condição específica de sending, não sent. RLS/grants/dados atuais não foram presumidos. Não afirma ocultação otimista em memória quando ambos updates falham.

### R2-INB-015 — Cache offline válido é abandonado após falha de carga e não alimenta chat selecionado

**P2 · confirmado estaticamente.** Catálogo: sem ID específico.

**Causa.** useOfflineCache escolhe cache somente enquanto isOffline&&loading. Após a carga falhar, loading=false devolve array vazio. RealtimeInboxView prioriza erro global sobre cache; mensagens selecionadas sempre vêm de localMsgs, mesmo havendo 20 mensagens por contato no cache.

**Consumidor/precondição.** Existe cache válido; abrir/recarregar Inbox sem conexão, ou selecionar uma conversa disponível no cache.

**Efeito.** Conversas podem aparecer temporariamente e desaparecer após conclusão da falha. O cache não sustenta leitura das mensagens na conversa selecionada.

**Evidência no snapshot atual:**

- `src/hooks/system/useOfflineCache.ts:29–45` — Cache salva mensagens por conversa. SHA `da307ba5626d`; blob `c1984e76f25b69f5aab57a7da0d38a229b4184a6`.
- `src/hooks/system/useOfflineCache.ts:99–112` — Fallback condicionado a loading. SHA `da307ba5626d`; blob `c1984e76f25b69f5aab57a7da0d38a229b4184a6`.
- `src/hooks/inbox/useRealtimeInbox.ts:52–64` — Cache e mensagens locais são fontes separadas. SHA `da307ba5626d`; blob `6e98d0c5044c047886c0c57227d4f9dd4cd3cc5b`.
- `src/hooks/inbox/useRealtimeInbox.ts:190–200` — Contato selecionado usa sempre localMsgs. SHA `da307ba5626d`; blob `6e98d0c5044c047886c0c57227d4f9dd4cd3cc5b`.
- `src/components/inbox/RealtimeInboxView.tsx:199–209` — Erro global substitui a UI mesmo com cache. SHA `da307ba5626d`; blob `3d6dacf92511e917426345a7f390dbe408d1ce1b`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Distinguir falha offline de ausência real de dados; usar cache válido até recuperação explícita.
- Oferecer mensagens em cache na conversa selecionada e identificar seu recorte.
- Não apagar cache/draft por falha transitória.

**Reprodução offline.** offline_cache_dropped

**Limite.** Auditoria não reabre escopo de autenticação/cache por usuário: limpeza no sign-out foi observada e fica com o agente de auth. Não testa Service Worker/browser offline real.

### R2-INB-016 — Enter contorna limite de caracteres aplicado ao botão Enviar

**P2 · confirmado estaticamente.** Catálogo: 2.42, 3.1.

**Causa.** O botão depende de isOverLimit, mas handleKeyDown chama handleSend diretamente; handleSend só valida texto vazio e isSending. Não há validação compartilhada do limite.

**Consumidor/precondição.** Composer com 4097 caracteres; botão desabilitado; pressionar Enter sem Shift.

**Efeito.** Payload acima do limite anunciado é enviado, enquanto clicar no botão é impedido. Política varia conforme forma de acionamento.

**Evidência no snapshot atual:**

- `src/components/inbox/chat/ChatInputArea.tsx:251–263` — Botão usa isOverLimit. SHA `da307ba5626d`; blob `5bdbf7cbfea12de98d1afb06e51d190b75313c80`.
- `src/components/inbox/chat/useChatInputLogic.ts:93–103` — Caminho do botão valida limite. SHA `da307ba5626d`; blob `bfc4b3d4c6be9c2763f6ed6bc7673f12bbcd649d`.
- `src/components/inbox/chat/useChatPanelHandlers.ts:85–108` — handleSend não valida comprimento. SHA `da307ba5626d`; blob `2aee00c55c477c48c92e13a7cabf62f3bd513da9`.
- `src/components/inbox/chat/useChatPanelHandlers.ts:142–148` — Enter chama handleSend diretamente. SHA `da307ba5626d`; blob `2aee00c55c477c48c92e13a7cabf62f3bd513da9`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Validar limite no comando de envio compartilhado, inclusive edição e assinatura.
- Botão, Enter e demais entrypoints devem ter o mesmo resultado e preservar texto em rejeição.

**Reprodução offline.** enter_limit

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-017 — Atalhos de busca têm dois handlers concorrentes no Composer

**P2 · confirmado estaticamente.** Catálogo: 2.7, 2.42, 28.1, 28.3.

**Causa.** Ctrl+F executa toggle no textarea e no listener de window, sem stopPropagation/defaultPrevented, retornando ao estado anterior. Ctrl+K abre diálogo local do ChatPanel e também o global da Inbox pelo listener de document.

**Consumidor/precondição.** Foco no textarea do chat; pressionar Ctrl+F ou Ctrl+K. Mac Cmd+F também duplica; a duplicação de K no handler local só se aplica a Ctrl.

**Efeito.** Ctrl+F não abre/fecha a busca como esperado; Ctrl+K pode abrir dois diálogos, um deles com seleção inerte.

**Evidência no snapshot atual:**

- `src/components/inbox/chat/useChatPanelHandlers.ts:142–148` — Handlers locais. SHA `da307ba5626d`; blob `2aee00c55c477c48c92e13a7cabf62f3bd513da9`.
- `src/components/inbox/ChatPanel.tsx:101–104` — handleSetActiveTool faz toggle funcional. SHA `da307ba5626d`; blob `f2561bc99f053782ac17f2769ea34fe262d9d8f8`.
- `src/components/inbox/ChatPanel.tsx:170–174` — Segundo Ctrl/Cmd+F no window. SHA `da307ba5626d`; blob `f2561bc99f053782ac17f2769ea34fe262d9d8f8`.
- `src/hooks/ui/useGlobalSearchShortcut.ts:7–19` — Ctrl/Cmd+K global não inspeciona evento já consumido. SHA `da307ba5626d`; blob `a88d9102273dd7df9ea9e60ef5536bb21e386176`.
- `src/components/inbox/RealtimeInboxView.tsx:151–151` — Listener global montado junto ao chat. SHA `da307ba5626d`; blob `3d6dacf92511e917426345a7f390dbe408d1ce1b`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Definir um dono por atalho e respeitar evento consumido/propagação.
- Um pressionamento deve abrir somente um painel; repetir deve ter resultado previsível.
- Testar foco no textarea e fora dele.

**Reprodução offline.** ctrl_f_double_toggle

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-018 — Ações rápidas e seleção da busca embutida fecham sem executar intenção

**P2 · confirmado estaticamente.** Catálogo: 2.7, 2.32.

**Causa.** GlobalSearch define Nova conversa e Respostas rápidas como onOpenChange(false) apenas. A instância em ChatDialogs recebe onSelectResult que só faz log/toast, diferentemente da instância da Inbox.

**Consumidor/precondição.** Abrir busca e clicar Nova conversa/Respostas rápidas, ou selecionar resultado na instância aberta pelo handler do Composer.

**Efeito.** Busca fecha sem abrir conversa/gestão de respostas. No diálogo do chat, selecionar contato/mensagem só produz Resultado selecionado, mantendo a conversa corrente.

**Evidência no snapshot atual:**

- `src/components/inbox/GlobalSearch.tsx:40–46` — Duas quick actions sem operação. SHA `da307ba5626d`; blob `3364ad19aec7daf91cea810f117fc0705a6076d1`.
- `src/components/inbox/GlobalSearch.tsx:54–59` — Seleção fecha e limpa busca. SHA `da307ba5626d`; blob `3364ad19aec7daf91cea810f117fc0705a6076d1`.
- `src/components/inbox/chat/ChatDialogs.tsx:55–55` — Consumer local somente log/toast. SHA `da307ba5626d`; blob `c8c8ecb996e40bee4e7034f6955c331e45cbe2f2`.
- `src/components/inbox/RealtimeInboxView.tsx:195–197` — Outro consumer tem navegação real. SHA `da307ba5626d`; blob `3d6dacf92511e917426345a7f390dbe408d1ce1b`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Ligar as ações às operações reais ou retirá-las do seletor.
- Compartilhar contrato de seleção/navegação entre consumidores.
- Selecionar mensagem deve definir também como alcançar a mensagem, inclusive fora da janela inicial.

**Reprodução offline.** Inspeção do caminho ativo e dos trechos citados; sem reprodução de DOM/provedor/banco neste trabalho.

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-019 — Navegação da busca gera NaN quando não há resultados e ignora ações rápidas

**P2 · confirmado estaticamente.** Catálogo: 2.7, 2.42.

**Causa.** ArrowUp/Down fazem módulo total mesmo quando total=0. O total considera só tags ou results, sem as ações visíveis. A chegada assíncrona de resultados não reseta selectedIndex.

**Consumidor/precondição.** Pressionar seta com consulta pendente/sem resultados e aguardar resultado sem mudar query; ou navegar ações rápidas do diálogo vazio.

**Efeito.** selectedIndex vira NaN e Enter não escolhe resultado até editar a consulta. Ações rápidas visíveis também não entram na navegação anunciada.

**Evidência no snapshot atual:**

- `src/components/inbox/GlobalSearch.tsx:65–80` — Módulo zero e total incompleto. SHA `da307ba5626d`; blob `3364ad19aec7daf91cea810f117fc0705a6076d1`.
- `src/components/inbox/GlobalSearch.tsx:184–199` — Ações renderizadas fora de results. SHA `da307ba5626d`; blob `3364ad19aec7daf91cea810f117fc0705a6076d1`.
- `src/components/inbox/useGlobalSearchData.ts:223–238` — Chegada de resultado não reseta índice; apenas handleSearch o faz. SHA `da307ba5626d`; blob `0d2ec01515522c34a811013da0c2703d5fee4e6c`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Proteger total zero e normalizar índice quando lista muda.
- Navegar a mesma sequência que é renderizada, incluindo ações rápidas.
- Cobrir tecla durante loading, zero→não zero e troca de filtro.

**Reprodução offline.** global_search_nan_index

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-020 — Filtro por tag na busca limita contatos tarde demais e não limita mensagens

**P2 · confirmado estaticamente.** Catálogo: 2.7.

**Causa.** Busca de contatos aplica LIMIT10 antes de filtrar tags em JS. Consultas de mensagens/transcrições não aplicam tags selecionadas. Assim o chip de tag não representa um escopo comum.

**Consumidor/precondição.** Tag VIP selecionada; primeiro contato VIP é o 11º da ordem alfabética; ou buscar texto com tag aplicada e mensagens de outros contatos.

**Efeito.** Busca retorna zero contatos apesar de haver correspondência, ou mostra mensagens fora da tag selecionada.

**Evidência no snapshot atual:**

- `src/components/inbox/useGlobalSearchData.ts:108–139` — Mensagem sem filtro de tags. SHA `da307ba5626d`; blob `0d2ec01515522c34a811013da0c2703d5fee4e6c`.
- `src/components/inbox/useGlobalSearchData.ts:142–162` — Transcrição também não aplica tags. SHA `da307ba5626d`; blob `0d2ec01515522c34a811013da0c2703d5fee4e6c`.
- `src/components/inbox/useGlobalSearchData.ts:165–186` — Tag aplicada depois do LIMIT10. SHA `da307ba5626d`; blob `0d2ec01515522c34a811013da0c2703d5fee4e6c`.
- `src/components/inbox/GlobalSearch.tsx:138–153` — Chips ativos comunicam o filtro. SHA `da307ba5626d`; blob `3364ad19aec7daf91cea810f117fc0705a6076d1`.

**Relação anterior.** Relaciona-se a TRA-011 (catálogo de tags obtido sem paginação), mas não o duplica: este achado ocorre mesmo quando a tag já está carregada/selecionada corretamente.

**Aceite:**

- Aplicar filtro antes da paginação e definir escopo consistente para cada tipo.
- Mostrar diferença de escopo quando uma categoria não suporta determinado filtro.
- Fixture com contato VIP após 10 resultados e mensagens semVIP deve produzir resultado correto.

**Reprodução offline.** global_search_tag_semantics

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-021 — Menu do balão, menu do header e comandos anunciam ações ainda sem implementação

**P2 · confirmado estaticamente.** Catálogo: 2.15, 2.16, 2.23, 2.33.

**Causa.** Itens visíveis de Favoritar/Fixar/Responder depois/Reportar no balão não têm handler. Adicionar tag no header tampouco tem callback. Slash /note e /tag somente mostram mensagens informativas e limpam o input.

**Consumidor/precondição.** Usuário seleciona essas ações nos menus ativos ou executa /note ou /tag.

**Efeito.** Nenhuma alteração, agendamento ou abertura de editor ocorre; a interface oferece operações que não conclui.

**Evidência no snapshot atual:**

- `src/components/inbox/chat/MessageHoverToolbar.tsx:148–181` — Itens e submenu sem onClick/onSelect. SHA `da307ba5626d`; blob `8eb6d284602e804426c8b7d0d9f71e0581173f41`.
- `src/components/inbox/chat/ChatPanelHeader.tsx:160–166` — Adicionar tag sem ação. SHA `da307ba5626d`; blob `85a91bc0d65773de1fb5e8db5d96a706cd6198f1`.
- `src/components/inbox/chat/useChatPanelHandlers.ts:150–158` — /note e /tag apenas toast após limpar input. SHA `da307ba5626d`; blob `2aee00c55c477c48c92e13a7cabf62f3bd513da9`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Cada item deve executar a intenção declarada e informar resultado, ou ser sinalizado/ocultado como indisponível.
- Não confundir Favoritar mensagem com Favoritar contato, que tem implementação diferente.
- Teste interação do consumidor, não apenas presença do label.

**Reprodução offline.** Inspeção do caminho ativo e dos trechos citados; sem reprodução de DOM/provedor/banco neste trabalho.

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-022 — Falha ao enviar áudio desmonta gravador e descarta gravação recuperável

**P1 · confirmado estaticamente.** Catálogo: 4.1, 3.4.

**Causa.** handleAudioSend captura rejeição e sempre define isRecordingAudio=false. A ponte principal também captura erro de upload/envio, e o callback do popup só faz log. O blob reside no estado do AudioRecorder desmontado.

**Consumidor/precondição.** Gravar/revisar voz e clicar Enviar; upload ou transporte falha.

**Efeito.** Usuário perde a gravação que poderia reenviar. O feedback pode dizer Tente novamente, mas o áudio não está mais disponível na UI.

**Evidência no snapshot atual:**

- `src/components/inbox/AudioRecorder.tsx:26–29` — Blob mantido apenas no componente. SHA `da307ba5626d`; blob `6690c7a1bc23e14251d9d78b26523f4670df65f5`.
- `src/components/inbox/AudioRecorder.tsx:84–88` — onSend sem resultado/estado pendente local. SHA `da307ba5626d`; blob `6690c7a1bc23e14251d9d78b26523f4670df65f5`.
- `src/components/inbox/chat/useChatPanelHandlers.ts:270–275` — Fecha mesmo em rejeição. SHA `da307ba5626d`; blob `2aee00c55c477c48c92e13a7cabf62f3bd513da9`.
- `src/hooks/inbox/useRealtimeInbox.ts:171–182` — Ponte captura erro de envio. SHA `da307ba5626d`; blob `6e98d0c5044c047886c0c57227d4f9dd4cd3cc5b`.
- `src/components/inbox/ChatPanel.tsx:288–295` — Estado controla gravador e seu callback. SHA `da307ba5626d`; blob `f2561bc99f053782ac17f2769ea34fe262d9d8f8`.
- `src/pages/ChatPopup.tsx:142–164` — Popup captura erro sem rejeitar. SHA `da307ba5626d`; blob `cb665a32970cf4f0582c46d3866b88725a41bf2d`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Preservar blob/preview até confirmação ou descarte explícito.
- Rejeições devem percorrer a cadeia e manter opção de retry.
- Resultado incerto deve reusar objeto/ID da tentativa anterior.

**Reprodução offline.** audio_error_closes_recorder

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-023 — Popup remapeia Message como linha crua e remove dados necessários ao balão

**P2 · confirmado estaticamente.** Catálogo: 2.4, 3.6, 2.15, 2.18.

**Causa.** ChatPopup recebe Message[] já adaptado de useMessages, força RawMessage e cria outro objeto com apenas um subconjunto dos campos. Perde external_id, is_deleted, location, isEdited e link_preview.

**Consumidor/precondição.** Abrir popup via header para conversa com localização, mídia apagada, mensagem editada ou ação que precisa de ID remoto.

**Efeito.** Localização fica sem conteúdo visível; mídia marcada apagada pode renderizar como ativa; reações/edição/exclusão perdem ID remoto; previews e indicador editada desaparecem.

**Evidência no snapshot atual:**

- `src/pages/ChatPopup.tsx:46–62` — Mapper restrito descarta campos. SHA `da307ba5626d`; blob `cb665a32970cf4f0582c46d3866b88725a41bf2d`.
- `src/pages/ChatPopup.tsx:70–73` — Fonte é useMessages. SHA `da307ba5626d`; blob `cb665a32970cf4f0582c46d3866b88725a41bf2d`.
- `src/pages/ChatPopup.tsx:128–130` — Cast faz segunda adaptação. SHA `da307ba5626d`; blob `cb665a32970cf4f0582c46d3866b88725a41bf2d`.
- `src/adapters/inboxAdapter.ts:23–36` — Primeira adaptação já preserva e cria campos. SHA `da307ba5626d`; blob `f1af7f3f6957dbad7090951c02f30420563c1565`.
- `src/components/inbox/chat/MessageBubble.tsx:112–160` — external_id e is_deleted controlam ações/placeholder. SHA `da307ba5626d`; blob `c18dd32e97ebbea0e252914a81481ee0c14d7147`.
- `src/components/inbox/chat/MessageBubble.tsx:198–198` — Localização exige location. SHA `da307ba5626d`; blob `c18dd32e97ebbea0e252914a81481ee0c14d7147`.
- `src/components/inbox/chat/MessageBubble.tsx:230–248` — Texto de location é excluído e outros campos são consumidos. SHA `da307ba5626d`; blob `c18dd32e97ebbea0e252914a81481ee0c14d7147`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Passar Message[] diretamente ou usar um único mapper compartilhado sem cast via unknown.
- Comparar o mesmo registro no Inbox e popup para location/deleted/edit/preview/ID remoto.

**Reprodução offline.** popup_discards_fields

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-024 — Erro na carga de mensagens selecionadas é transformado em conversa vazia

**P2 · confirmado estaticamente.** Catálogo: 2.25.

**Causa.** useMessages registra error e termina loading sem mensagens. useRealtimeInbox não expõe localMsgs.error; a View só checa erro da lista global. Popup também ignora error do hook.

**Consumidor/precondição.** Lista de conversas carregada; fetch das mensagens do contato selecionado falha por transporte/permissão.

**Efeito.** Chat abre vazio, sem distinguir falha de ausência de histórico e sem estado de erro/retry específico para essa consulta.

**Evidência no snapshot atual:**

- `src/hooks/chat/useMessages.ts:92–101` — Error separado de messages, loading termina. SHA `da307ba5626d`; blob `8cff663272e7a2ad435e7deaf7a89c1a4c668e56`.
- `src/hooks/inbox/useRealtimeInbox.ts:58–64` — Hook local consumido sem erro. SHA `da307ba5626d`; blob `6e98d0c5044c047886c0c57227d4f9dd4cd3cc5b`.
- `src/hooks/inbox/useRealtimeInbox.ts:208–228` — Retorno não expõe erro/refetch local. SHA `da307ba5626d`; blob `6e98d0c5044c047886c0c57227d4f9dd4cd3cc5b`.
- `src/components/inbox/RealtimeInboxView.tsx:199–209` — Tratamento apenas de inbox.error global. SHA `da307ba5626d`; blob `3d6dacf92511e917426345a7f390dbe408d1ce1b`.
- `src/components/inbox/RealtimeInboxView.tsx:289–328` — Loading some e painel pode renderizar vazio. SHA `da307ba5626d`; blob `3d6dacf92511e917426345a7f390dbe408d1ce1b`.
- `src/pages/ChatPopup.tsx:70–73` — Popup também não lê error. SHA `da307ba5626d`; blob `cb665a32970cf4f0582c46d3866b88725a41bf2d`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Distinguir empty/error/loading na conversa selecionada.
- Expor refetch local e preservar mensagens anteriores quando houver.
- Simular lista bem-sucedida e falha somente na consulta de mensagens.

**Reprodução offline.** Inspeção do caminho ativo e dos trechos citados; sem reprodução de DOM/provedor/banco neste trabalho.

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-025 — Mensagem nova e indicador de digitação forçam rolagem ao fim durante leitura

**P2 · confirmado estaticamente.** Catálogo: 2.3, 2.8, 2.10.

**Causa.** ChatPanel chama scrollToBottom sempre que messages.length ou isContactTyping muda. A implementação do comando sempre usa último índice, sem verificar distância do fim ou intenção do usuário.

**Consumidor/precondição.** Operador rola para mensagem antiga já carregada; chega mensagem ou muda indicador de digitação.

**Efeito.** Viewport salta ao fim e perde o ponto de leitura/pesquisa. O mesmo comportamento prejudicaria prepend ao conectar a paginação.

**Evidência no snapshot atual:**

- `src/components/inbox/ChatPanel.tsx:137–138` — Efeito incondicional. SHA `da307ba5626d`; blob `f2561bc99f053782ac17f2769ea34fe262d9d8f8`.
- `src/components/inbox/chat/ChatMessagesArea.tsx:82–97` — scrollToBottom sempre escolhe último índice. SHA `da307ba5626d`; blob `955d8557e8c2cdd4b9a0df49ea936ab1dd5763a4`.
- `src/components/inbox/chat/ChatMessagesArea.tsx:127–128` — Container ativo não mantém condição de aderência ao fim. SHA `da307ba5626d`; blob `955d8557e8c2cdd4b9a0df49ea936ab1dd5763a4`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Só seguir automaticamente quando usuário estiver no fim ou ao próprio envio conforme decisão explícita.
- Preservar âncora e oferecer indicador de novas mensagens quando usuário está lendo acima.
- Testar digitação e mensagem nova com scroll fora do fim.

**Reprodução offline.** Inspeção do caminho ativo e dos trechos citados; sem reprodução de DOM/provedor/banco neste trabalho.

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-026 — Presença de digitação entre agentes colide na identidade literal agent

**P2 · confirmado estaticamente.** Catálogo: 2.9, 2.24.

**Causa.** ChatPanel fornece currentUserId="agent" para todos. useTypingPresence usa esse valor como chave e remove da lista toda presença cujo key coincide com currentUserId.

**Consumidor/precondição.** Dois agentes no mesmo contato através do ChatPanel; um digita.

**Efeito.** Presence agrupa ambos na mesma chave e cada cliente exclui todo o grupo como se fosse si mesmo; aviso de colega digitando não aparece.

**Evidência no snapshot atual:**

- `src/components/inbox/ChatPanel.tsx:115–117` — ID literal para todos. SHA `da307ba5626d`; blob `f2561bc99f053782ac17f2769ea34fe262d9d8f8`.
- `src/hooks/chat/useTypingPresence.ts:38–48` — Payload usa esse ID. SHA `da307ba5626d`; blob `3888be830b95aed8b3ff71d80800d7d2570d79f9`.
- `src/hooks/chat/useTypingPresence.ts:80–115` — Chave e exclusão do próprio grupo. SHA `da307ba5626d`; blob `3888be830b95aed8b3ff71d80800d7d2570d79f9`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Usar identidade real e escopo apropriado por sessão/usuário.
- Excluir só a própria presença, mantendo colegas e múltiplas abas de forma definida.
- Fixture de duas identidades deve produzir nome de colega sem atribuir digitação ao contato.

**Reprodução offline.** Inspeção do caminho ativo e dos trechos citados; sem reprodução de DOM/provedor/banco neste trabalho.

**Limite.** Não afirma que broadcast contact_typing do webhook esteja quebrado; esse canal de informação usa um handler separado.

### R2-INB-027 — Filtro Última interação reintroduz sessões antigas do mesmo dia

**P2 · confirmado estaticamente.** Catálogo: 2.25.

**Causa.** useChatSearch encontra início da sessão por gap>4 h, mas arredonda o cutoff para startOfDay antes de filtrar.

**Consumidor/precondição.** Mensagens às 09 h e 18 h do mesmo dia, sem mensagens intermediárias; usuário aplica Última interação.

**Efeito.** Filtro inclui a sessão das 09 h apesar de o algoritmo ter reconhecido uma sessão separada às 18 h.

**Evidência no snapshot atual:**

- `src/hooks/chat/useChatSearch.ts:78–94` — Cutoff correto é arredondado para meia-noite. SHA `da307ba5626d`; blob `f5854ca4a4fe5374588c3fb4062dd965fc2454d9`.
- `src/hooks/chat/useChatSearch.ts:125–135` — Filtro passa a aceitar o dia inteiro. SHA `da307ba5626d`; blob `f5854ca4a4fe5374588c3fb4062dd965fc2454d9`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Manter timestamp exato do início de sessão para esse preset.
- Distinguir presets de dia e de sessão; testar gaps no mesmo dia e atravessando meia-noite.

**Reprodução offline.** Inspeção do caminho ativo e dos trechos citados; sem reprodução de DOM/provedor/banco neste trabalho.

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-028 — Lista virtualizada descarta a prioridade de não lidas calculada pelos filtros

**P2 · confirmado estaticamente.** Catálogo: 2.1, 2.6.

**Causa.** useInboxFilters ordena não lidas antes de lidas. VirtualizedRealtimeList reordena toda entrada por timestamp antes de agrupar, apesar do comentário de preservar a ordem interna.

**Consumidor/precondição.** Duas conversas no mesmo grupo de data, a mais antiga não lida e a mais recente lida.

**Efeito.** A prioridade calculada para não lidas é perdida no componente que efetivamente renderiza.

**Evidência no snapshot atual:**

- `src/hooks/inbox/useInboxFilters.ts:167–176` — Sort por não lidas e depois tempo. SHA `da307ba5626d`; blob `cc80d5db7b34aca33a10460213b6d87176bebf6b`.
- `src/components/inbox/VirtualizedRealtimeList.tsx:118–145` — Sort por tempo desfaz prioridade antes dos grupos. SHA `da307ba5626d`; blob `b3915f3134da36acc8bf2f84dc1a671416a1d6eb`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Escolher regra de produto explícita e implementá-la uma vez.
- Se não lidas têm prioridade, preservar essa ordem dentro dos grupos de data e fixadas.
- Teste ordem visual com lida nova e não lida antiga no mesmo grupo.

**Reprodução offline.** Inspeção do caminho ativo e dos trechos citados; sem reprodução de DOM/provedor/banco neste trabalho.

**Limite.** Confirmação estática do contrato descrito. Não mede incidência em produção nem demonstra configuração/dados do serviço em execução.

### R2-INB-029 — Adiar conversa grava snooze, mas efeito operacional e retomada não são consumidos pela Inbox

**P2 · lacuna.** Catálogo: 2.16, 2.33.

**Causa.** snoozeConversation persiste snooze_until e expõe snoozedIds/isSnoozed. No caminho ativo lido, serviço/filtros/lista não usam o estado para suspender/retomar a conversa, e não há indicador de snooze nesses consumidores.

**Consumidor/precondição.** Ação Adiar no menu da conversa ou /snooze, insert bem-sucedido.

**Efeito.** Confirma Conversa adiada, mas conversa permanece com o mesmo comportamento de listagem. O significado operacional de adiar e retomada na hora devida não foi demonstrado.

**Evidência no snapshot atual:**

- `src/hooks/chat/useConversationActions.ts:133–162` — Persistência e toast de adiar. SHA `da307ba5626d`; blob `e2197ee8ea0014c088f0ae54be0eaa9895917ede`.
- `src/hooks/chat/useConversationActions.ts:192–212` — Estado exposto. SHA `da307ba5626d`; blob `e2197ee8ea0014c088f0ae54be0eaa9895917ede`.
- `src/hooks/inbox/useInboxFilters.ts:75–177` — Filtros ativos sem snooze. SHA `da307ba5626d`; blob `cc80d5db7b34aca33a10460213b6d87176bebf6b`.
- `src/services/realtime.service.ts:45–89` — Carga sem snooze. SHA `da307ba5626d`; blob `a9ea1fbe585827e7a9ffaf918d7c9994797e52dc`.
- `src/components/inbox/chat/useChatPanelHandlers.ts:182–184` — Slash encaminha a ação real de persistência. SHA `da307ba5626d`; blob `2aee00c55c477c48c92e13a7cabf62f3bd513da9`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Definir se adiar significa remover da fila, silenciar, sinalizar ou só registrar.
- Implementar/ligar consumidores e retomada do contrato escolhido.
- Testar efeito imediatamente após adiar e após expirar o prazo.

**Reprodução offline.** Inspeção do caminho ativo e dos trechos citados; sem reprodução de DOM/provedor/banco neste trabalho.

**Limite.** Ausência foi verificada nos consumidores ativos, não inferida apenas de falta de imports. Agendador/integração externa não foi consultado; a decisão de produto sobre o efeito desejado não está resolvida aqui.

### R2-INB-030 — Header declara contato Online sem consultar presença online

**P3 · confirmado estaticamente.** Catálogo: 2.4.

**Causa.** Header renderiza bolinha verde sempre e, quando não está digitando, texto Online incondicional. Nenhuma prop/estado de presença online participa dessa decisão.

**Consumidor/precondição.** Abrir qualquer conversa quando isContactTyping=false, inclusive histórico sem sinal recente de presença.

**Efeito.** Operador recebe afirmação Online sem evidência do estado do contato.

**Evidência no snapshot atual:**

- `src/components/inbox/chat/ChatPanelHeader.tsx:81–89` — Bolinha verde incondicional. SHA `da307ba5626d`; blob `85a91bc0d65773de1fb5e8db5d96a706cd6198f1`.
- `src/components/inbox/chat/ChatPanelHeader.tsx:116–119` — Online é o else de digitação. SHA `da307ba5626d`; blob `85a91bc0d65773de1fb5e8db5d96a706cd6198f1`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Exibir online somente com sinal válido e prazo de expiração, ou usar estado desconhecido/neutro.
- Ausência de digitação não deve significar presença online.

**Reprodução offline.** Inspeção do caminho ativo e dos trechos citados; sem reprodução de DOM/provedor/banco neste trabalho.

**Limite.** Não determina estado de nenhum contato real; a afirmação independe de dados no próprio render.

### R2-INB-031 — Botão Baixar documento não respeita o controle can_download do perfil

**P2 · confirmado estaticamente.** Catálogo: 2.37, 3.5.

**Causa.** DocumentPreview resolve uma URL legível e executa fetch→blob→anchor.download sem consultar useDownloadPermission. O botão só considera loading/URL. O caminho de imagem verifica o mesmo controle antes de baixar.

**Consumidor/precondição.** Perfil com can_download=false, acesso de leitura ao documento e URL resolvida com sucesso; clicar no ícone Baixar no balão de documento do ChatPanel.

**Efeito.** A aplicação inicia download mesmo quando sua ação equivalente de imagem informa bloqueio por política e orienta pedir permissão. A inconsistência é na ação de UI versionada, inclusive para objeto privado cuja leitura esteja autorizada.

**Evidência no snapshot atual:**

- `src/components/inbox/MediaPreview.tsx:34–65` — Resolução e download sem consultar a permissão. SHA `da307ba5626d`; blob `6c4d6e70322b59ce25752a552f19fa5d4197a8b8`.
- `src/components/inbox/MediaPreview.tsx:90–100` — Botão habilitado apenas por estado de URL/download. SHA `da307ba5626d`; blob `6c4d6e70322b59ce25752a552f19fa5d4197a8b8`.
- `src/components/inbox/chat/MessageBubble.tsx:188–195` — Consumer ativo para mensagens de documento. SHA `da307ba5626d`; blob `c18dd32e97ebbea0e252914a81481ee0c14d7147`.
- `src/hooks/system/useDownloadPermission.ts:8–24` — Origem do controle profiles.can_download. SHA `da307ba5626d`; blob `0c1c6a36db0f658dedad8376aed764addc961134`.
- `src/components/inbox/ImagePreview.tsx:22–48` — Comparação positiva: imagem recusa download antes de fetch. SHA `da307ba5626d`; blob `76de00c8dede81c06fa8ff859c2f2cef06dc7a4c`.
- `src/hooks/ui/useScreenProtection.ts:154–169` — Proteção global cobre teclado/contextmenu/copy/drag, sem interceptar este anchor.click. SHA `da307ba5626d`; blob `dc79822454ddbcf1b8aadb395ece80bc32689b9d`.
- `src/components/inbox/__tests__/ImagePreviewDownload.test.tsx:47–85` — Testes de autorização exercitam somente imagem. SHA `da307ba5626d`; blob `d02a8697fab8aa176b61c62bda936d6f1287826d`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Definir e aplicar a mesma regra de download aos botões de todos os tipos de mídia, com feedback coerente.
- Quando can_download=false, o handler de documento não deve iniciar fetch de exportação nem criar anchor.download.
- Preservar o acesso de leitura conforme o contrato de produto; não tratar ocultar botão como barreira absoluta contra cópia de conteúdo já legível.

**Reprodução offline.** document_download_permission

**Limite.** Probe compara handlers reais com perfil negado e fetch/anchor simulados. Não é quebra de RLS nem demonstra acesso a arquivo sem leitura autorizada; não afirma que esconder a ação impeça extração por um visualizador autorizado. A exceção explícita Abrir documento na galeria foi preservada como leitura, não reclassificada como este download.

### R2-INB-032 — Reações confirmam a mutação local mesmo quando o transporte rejeita

**P2 · confirmado estaticamente.** Catálogo: 2.14.

**Causa.** useReactionMutations grava/remove message_reactions antes de chamar sendReaction. O catch do transporte só registra log, depois mutationFn resolve e onSuccess invalida a query como se a operação tivesse concluído.

**Consumidor/precondição.** Reagir ou remover uma reação em mensagem com instanceName, contactJid e externalId presentes; gravação local aceita e envio remoto rejeitado.

**Efeito.** O estado local da reação muda, o picker pode fechar e não há toast de falha do envio. Na rejeição sem efeito remoto, o WhatsApp continua sem a nova reação ou com a reação cuja remoção falhou.

**Evidência no snapshot atual:**

- `src/hooks/reactions/useReactionMutations.ts:38–81` — Insert confirmado seguido de envio cuja rejeição é absorvida. SHA `da307ba5626d`; blob `68ea31a3ddeb91ad12c44b7b43787e6121d28379`.
- `src/hooks/reactions/useReactionMutations.ts:83–119` — Remoção local seguida do mesmo catch silencioso. SHA `da307ba5626d`; blob `68ea31a3ddeb91ad12c44b7b43787e6121d28379`.
- `src/hooks/chat/useMessageReactions.ts:54–98` — Badges e hasReacted vêm do banco local; mutateAsync encadeia o resultado. SHA `da307ba5626d`; blob `e891b4b6f299ccaba746b8d5332546ddac2c7b78`.
- `src/components/inbox/MessageReactions.tsx:74–82` — Picker fecha quando a promise resolve. SHA `da307ba5626d`; blob `b2f0ce7679c8cc084a9b1017d7958b965822cd77`.
- `src/components/inbox/chat/MessageBubble.tsx:255–264` — Contexto de transporte passa no caminho ativo. SHA `da307ba5626d`; blob `c18dd32e97ebbea0e252914a81481ee0c14d7147`.
- `src/hooks/evolution/useEvolutionMessaging.ts:31–32` — sendReaction usa callApi diretamente, sem withToast. SHA `da307ba5626d`; blob `fc6c95c32cc303fcfe2b6eb4270fb81491fa06e0`.
- `src/hooks/evolution/useEvolutionApiCore.ts:27–44` — callApi rejeita erros; o consumidor da reação é quem os absorve. SHA `da307ba5626d`; blob `d69297f848b4cceb2793b202feaf77da96ffbf8a`.
- `src/hooks/__tests__/useMessageReactions.test.tsx:83–118` — Casos atuais leem reações, sem sequência escrita local→falha remota. SHA `da307ba5626d`; blob `d03dc5113b9701fc0dda82c4ae4c47b34f25a1cd`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Representar resultado local e entrega remota separadamente ou coordená-los em operação durável com retry explícito.
- Rejeição remota deve manter informação recuperável e informar o operador; não concluir silenciosamente.
- Cobrir adicionar e remover, incluindo resposta perdida e chegada posterior de webhook, sem retry cego de resultado desconhecido.

**Reprodução offline.** reaction_remote_failure_accepted

**Limite.** Probe usa corpos reais e fronteiras de banco/provedor simuladas. Não mede convergência posterior de webhooks nem a incidência em produção. O cenário é rejeição do transporte com metadados completos; não depende de ausência da conexão.

### R2-INB-033 — Refresh antigo de URL assinada deixa a próxima mídia sem URL e presa em carregamento

**P2 · confirmado estaticamente.** Catálogo: 2.26.

**Causa.** O efeito inicial de useResolvedStorageUrl usa flag active, mas refresh grava state sem geração/identidade corrente. Ao mudar source, o efeito zera o ref sem invalidar a promise antiga. Uma resposta de refresh A que termina após a resolução B grava state.source=A; activeState devolve initialState(B), e as dependências de B já não mudam para refazer a consulta.

**Consumidor/precondição.** Na galeria, item privado A dispara refresh por onError; antes da resposta, navegar para item B no mesmo MediaPreviewDialog; resolução inicial de B conclui antes do refresh A.

**Efeito.** B aparece carregado e volta para Carregando mídia, com URL vazia e error=null. Não há mídia nem botão Tentar novamente nesse estado. A proteção activeState evita exibir A como B, mas não evita o travamento.

**Evidência no snapshot atual:**

- `src/hooks/storage/useResolvedStorageUrl.ts:21–45` — initialState de objeto privado tem URL vazia/loading; activeState filtra source divergente. SHA `da307ba5626d`; blob `fa8a58242a22ce01eecb47bd3e6736d859e98c3f`.
- `src/hooks/storage/useResolvedStorageUrl.ts:58–92` — Refresh escreve state sem conferir fonte/generation vigente. SHA `da307ba5626d`; blob `fa8a58242a22ce01eecb47bd3e6736d859e98c3f`.
- `src/hooks/storage/useResolvedStorageUrl.ts:94–117` — Mudança de fonte só invalida o efeito inicial, não a promise de refresh. SHA `da307ba5626d`; blob `fa8a58242a22ce01eecb47bd3e6736d859e98c3f`.
- `src/components/inbox/media-gallery/MediaPreviewDialog.tsx:35–68` — Navegação troca item/source na mesma instância do hook. SHA `da307ba5626d`; blob `5ad958a20c1d4523e3b121a6419074f7578a7b43`.
- `src/components/inbox/media-gallery/MediaPreviewDialog.tsx:112–117` — onError inicia refresh; retry só aparece quando error existe. SHA `da307ba5626d`; blob `5ad958a20c1d4523e3b121a6419074f7578a7b43`.
- `src/hooks/__tests__/useResolvedStorageUrl.test.tsx:60–91` — Testes cobrem retry e coalescência, sem troca de source durante refresh. SHA `da307ba5626d`; blob `d71a267bd8f01874fa42390df3e3a7eb5889eb22`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Cada resolução/refresh deve ser vinculada à geração da fonte e não escrever em uma geração posterior.
- Limpeza de promise/cooldown também deve respeitar identidade do pedido, sem apagar o ref de outro refresh.
- Teste a ordem A inicial→refresh A pendente→B resolvido→A tardio e mantenha B acessível.

**Reprodução offline.** signed_url_refresh_cross_source

**Limite.** Hook e parser reais com Storage/harness simulados. Não houve navegador nem expiração real. A UI mantém o componente ao navegar entre itens; não foi inventada corrida entre contatos em um ChatPanel desmontado por key.

### R2-INB-034 — Carregar mais na Jornada não ultrapassa as janelas fixas das consultas

**P2 · confirmado estaticamente.** Catálogo: 2.25.

**Causa.** useConversationHistoryTimeline sempre solicita no máximo 500 mensagens e 200 conversation_events. O limit da UI entra apenas em buildTimeline, que fatia essas linhas e calcula hasMore a partir delas. Aumentar o limit não busca página anterior nem amplia a query.

**Consumidor/precondição.** Jornada/Histórico do contato com mais de 500 mensagens ou mais de 200 eventos de conversa no período, inclusive Tudo. Exemplo mínimo: 201 transferências e nenhuma outra fonte de eventos.

**Efeito.** Com 201 transferências, exibe 200 e já informa hasMore=false, sem Carregar mais. Com 501 mensagens alternadas, Carregar mais termina em 500. Os KPIs do período também refletem a amostra como total, sem informar truncamento.

**Evidência no snapshot atual:**

- `src/hooks/chat/useConversationHistoryTimeline.ts:271–284` — Limits de consulta fixos e ausência de cursor. SHA `da307ba5626d`; blob `4d790869c2237aa1ee99d482f95405a3a064c161`.
- `src/hooks/chat/useConversationHistoryTimeline.ts:222–250` — hasMore e total calculados somente a partir das linhas carregadas. SHA `da307ba5626d`; blob `4d790869c2237aa1ee99d482f95405a3a064c161`.
- `src/hooks/chat/useConversationHistoryTimeline.ts:306–319` — limit só é passado à transformação. SHA `da307ba5626d`; blob `4d790869c2237aa1ee99d482f95405a3a064c161`.
- `src/components/inbox/tabs/JourneyTab.tsx:78–95` — Consumer declara toda a jornada e recebe hasMore. SHA `da307ba5626d`; blob `5ec1a6846d091c70205f3c69ce80b8b08484912b`.
- `src/components/inbox/tabs/JourneyTab.tsx:120–127` — KPIs se apresentam como dados do período selecionado. SHA `da307ba5626d`; blob `5ec1a6846d091c70205f3c69ce80b8b08484912b`.
- `src/components/inbox/tabs/JourneyTab.tsx:175–183` — Carregar mais aumenta somente limit. SHA `da307ba5626d`; blob `5ec1a6846d091c70205f3c69ce80b8b08484912b`.
- `src/hooks/chat/__tests__/useConversationHistoryTimeline.test.ts:108–116` — Teste puro já fornece 250 linhas, sem exercitar o cap de transporte. SHA `da307ba5626d`; blob `09a85cd06b184ace5ac33875477fb07a0b4ea3fb`.
- `src/components/inbox/tabs/__tests__/JourneyTab.test.tsx:79–82` — Teste de botão usa hasMore mockado. SHA `da307ba5626d`; blob `e09f13bf003ea8b32ec424ac9b967f34786ee773`.

**Relação anterior.** Nova quebra da Jornada inferior. SV-002 trata exclusivamente a faixa ContactStatsStrip e a amostra das 200 primeiras mensagens em contact.service; não foi recontado. R2-INB-004 trata useMessages/rolagem do chat, que usa outra consulta e outro consumidor.

**Aceite:**

- Paginar cada fonte necessária ou obter histórico/contagens canônicos em consulta adequada, com cursor estável.
- hasMore deve refletir existência de registros no servidor, não somente comprimento da amostra.
- Manter rotulagem de amostra quando não houver universo completo e testar 201 eventos/501 mensagens através do hook consumidor.

**Reprodução offline.** timeline_fixed_query_caps

**Limite.** Fixtures locais atingem os limites explícitos do código. Não há medição de cardinalidade produtiva nem afirmação de max_rows para as outras tabelas sem paginação; esse limite externo permanece desconhecido.

### R2-INB-035 — Jornada mostra tarefas concluídas no modelo atual como Pendente

**P2 · confirmado estaticamente.** Catálogo: 2.25.

**Causa.** buildTimeline só produz a pill Concluída quando status é completed. O modelo WorkItem e a mutação ativa usam done para conclusão, persistido na mesma conversation_tasks que a Jornada consulta; cancelled também cai no else Pendente.

**Consumidor/precondição.** Concluir uma tarefa do contato pela aba Tarefas ou módulo de tarefas e consultar sua criação na Jornada; o registro está com status=done.

**Efeito.** A tarefa aparece no grupo Concluídas da aba Tarefas e como Pendente no evento de histórico, mesmo após refetch sem cache antigo.

**Evidência no snapshot atual:**

- `src/hooks/chat/useConversationHistoryTimeline.ts:193–196` — Mapper compara com literal completed legado. SHA `da307ba5626d`; blob `4d790869c2237aa1ee99d482f95405a3a064c161`.
- `src/hooks/chat/useConversationHistoryTimeline.ts:283–291` — Query lê status da mesma conversation_tasks. SHA `da307ba5626d`; blob `4d790869c2237aa1ee99d482f95405a3a064c161`.
- `src/hooks/tasks/workItem.types.ts:1–7` — Enum atual inclui done/cancelled, não completed. SHA `da307ba5626d`; blob `04bc5b0e475bef89b6656f45134a9421986b0087`.
- `src/hooks/tasks/useMyWorkItems.ts:403–425` — Mutação grava status=to e usa done ao concluir. SHA `da307ba5626d`; blob `30c53078791bcb04ec2651b3bb701a884b488069`.
- `src/hooks/tasks/workItemMachine.ts:52–83` — Transição pura confirma o estado done. SHA `da307ba5626d`; blob `266de050ae37b87f7a1b63a0698d87dd6314d2e7`.
- `src/components/inbox/tabs/TasksTab.tsx:101–113` — Consumidor ativo usa complete/reopen com done. SHA `da307ba5626d`; blob `93f3ae6d353a572dcc9f2819c7a3b00300b11793`.
- `src/components/inbox/tabs/JourneyTab.tsx:158–164` — Pill do mapper aparece diretamente no evento. SHA `da307ba5626d`; blob `5ec1a6846d091c70205f3c69ce80b8b08484912b`.

**Relação anterior.** Não duplica R2-DB-005, que é identidade incorreta no backfill reminders→conversation_tasks. O agente database confirmou que o contrato atual usa done, sem conversão para completed.

**Aceite:**

- Usar o enum e rótulos atuais em todos os consumidores, distinguindo concluída, cancelada e estados ativos.
- Teste de integração deve partir de complete/move e verificar Jornada após consulta nova.

**Reprodução offline.** timeline_done_shown_pending

**Limite.** Probe executa applyTransition e buildTimeline reais; persistência status=done foi confirmada no código, não em banco vivo. Não se alegou tabela legada incorreta: conversation_tasks é a tabela canônica desta versão.

### R2-INB-036 — GPS atrasado pode substituir um ponto manual escolhido depois no mesmo picker

**P2 · confirmado estaticamente.** Catálogo: 3.6.

**Causa.** getCurrentLocation só cria o signal de geocoding quando o callback do GPS chega. chooseSearchResult grava a nova escolha sem invalidar o GPS pendente nem geoAbort. Assim, a ordem da resposta antiga pode ganhar da ordem das escolhas do operador.

**Consumidor/precondição.** Picker permanece aberto: clicar Usar localização atual, escolher outro endereço enquanto o GPS ainda está pendente e receber o callback do GPS depois. O botão GPS tem loading, mas os controles de seleção do mapa continuam disponíveis.

**Efeito.** O ponto manual B é substituído pela posição GPS A solicitada antes; a origem passa para gps. O envio seguinte usa a seleção substituta se o operador não perceber a mudança.

**Evidência no snapshot atual:**

- `src/components/inbox/location-picker/useLocationPicker.ts:118–128` — Sinal do reverso é criado no processamento, não no início da intenção GPS. SHA `da307ba5626d`; blob `33b12ea9d573a36442e404ea8220f494d38036a3`.
- `src/components/inbox/location-picker/useLocationPicker.ts:192–204` — Callback GPS aplica marcador/seleção sem conferir geração da intenção. SHA `da307ba5626d`; blob `33b12ea9d573a36442e404ea8220f494d38036a3`.
- `src/components/inbox/location-picker/useLocationPicker.ts:270–284` — Escolha manual não cancela a busca anterior; reset cancela só o signal já existente. SHA `da307ba5626d`; blob `33b12ea9d573a36442e404ea8220f494d38036a3`.
- `src/components/inbox/LocationPicker.tsx:142–151` — Abas e seleção continuam disponíveis durante GPS. SHA `da307ba5626d`; blob `17cf9e4cf47cd28618d98a6ba6b586c488459ab8`.
- `src/components/inbox/LocationPicker.tsx:246–268` — Loading desabilita apenas o botão GPS; Enviar usa selectedLocation corrente. SHA `da307ba5626d`; blob `17cf9e4cf47cd28618d98a6ba6b586c488459ab8`.
- `src/components/inbox/location-picker/__tests__/useLocationPicker.test.tsx:258–286` — Teste cobre busca textual contra outra busca, não GPS contra escolha manual. SHA `da307ba5626d`; blob `a4a1523d9c72d1c983f5ba8e18476e4ab94b80ab`.
- `src/components/inbox/chat/ChatDialogs.tsx:58–58` — Picker é desmontado ao fechar; isso limita a alegação ao mesmo mount aberto. SHA `da307ba5626d`; blob `c8c8ecb996e40bee4e7034f6955c331e45cbe2f2`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Todas as fontes de seleção devem compartilhar uma geração de intenção, criada no clique do operador.
- Uma escolha manual posterior deve invalidar GPS/reverso/busca anteriores antes de atualizar o ponto.
- Testar GPS A pendente→seleção B→callback A tardio e manter B/origem correspondente.

**Reprodução offline.** gps_overwrites_newer_choice

**Limite.** Hook real com callbacks GPS/geocoding simulados. Não houve acesso à localização física. Descartada a hipótese de reaparecer após reabrir porque o consumidor ativo desmonta o picker no fechamento.

### R2-INB-037 — Mudar o termo durante retrieve ainda permite aplicar o endereço antigo

**P2 · confirmado estaticamente.** Catálogo: 3.6.

**Causa.** setQuery invalida activeTermRef do suggest e limpa o destaque, mas não incrementa selectionSeqRef. Uma seleção em retrieve feita antes da nova digitação continua com seq válido e devolve o lugar antigo ao handleSelectSuggestion, que o aplica sem conferir o termo atual.

**Consumidor/precondição.** No mapa, escolher sugestão A; enquanto retrieve está em voo, editar o campo para procurar B. O input não é desabilitado durante retrieve. A resposta de A chega antes de nova escolha explícita.

**Efeito.** O campo/consulta já se refere a B, mas A é aplicado ao ponto selecionado. A atualização de selectedLocation fecha a lista e limpa o termo novo, interrompendo a escolha atual.

**Evidência no snapshot atual:**

- `src/components/inbox/location-picker/useAddressAutocomplete.ts:411–419` — setQuery só invalida suggest; não invalida selectionSeq. SHA `da307ba5626d`; blob `71a4e7d5928b2cf7a9b3038cf99309975a946183`.
- `src/components/inbox/location-picker/useAddressAutocomplete.ts:437–453` — Resultado retrieve depende apenas do contador de seleção. SHA `da307ba5626d`; blob `71a4e7d5928b2cf7a9b3038cf99309975a946183`.
- `src/components/inbox/LocationPicker.tsx:85–112` — Callback aceita place sem comparar query vigente. SHA `da307ba5626d`; blob `17cf9e4cf47cd28618d98a6ba6b586c488459ab8`.
- `src/components/inbox/LocationPicker.tsx:66–72` — Aplicar a localização fecha lista e limpa o termo. SHA `da307ba5626d`; blob `17cf9e4cf47cd28618d98a6ba6b586c488459ab8`.
- `src/components/inbox/LocationPicker.tsx:174–206` — Input permanece editável durante retrieve. SHA `da307ba5626d`; blob `17cf9e4cf47cd28618d98a6ba6b586c488459ab8`.
- `src/components/inbox/location-picker/useAddressAutocomplete.ts:404–409` — Controle positivo: disabled já invalida seleção. SHA `da307ba5626d`; blob `71a4e7d5928b2cf7a9b3038cf99309975a946183`.
- `src/components/inbox/location-picker/useAddressAutocomplete.ts:516–527` — Controle positivo: clear/Esc também invalida. SHA `da307ba5626d`; blob `71a4e7d5928b2cf7a9b3038cf99309975a946183`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Trocar o termo deve invalidar qualquer retrieve que pertença ao termo anterior, mantendo semântica de última intenção.
- O callback consumidor só deve aplicar resultado associado à geração corrente.
- Preservar os guards corretos de clear/disabled/nova seleção e acrescentar o caso digitação durante retrieve.

**Reprodução offline.** retrieve_survives_query_change

**Limite.** Probe executa hook/reducer e callback TSX extraído; requests e runtime React são simulados. Não se alegou que toda seleção concorrente falha: outra seleção explícita, clear e disabled já têm proteção.

### R2-INB-038 — Salvar figurinha na biblioteca confirma sucesso sem verificar o insert

**P2 · confirmado estaticamente.** Catálogo: 3.11.

**Causa.** O callback Salvar na biblioteca aguarda o insert de stickers, mas não inspeciona error nem pede retorno da linha. O client pode resolver com erro PostgREST; mesmo assim o próximo comando anuncia Figurinha salva.

**Consumidor/precondição.** Mensagem de sticker recebida no ChatPanel; a verificação inicial não encontra duplicata e a escrita stickers é rejeitada (por exemplo, permissão/validação/indisponibilidade retornada pelo client).

**Efeito.** Operador vê confirmação da categoria e da gravação, mas a figurinha não entra na biblioteca. O catch externo não trata o erro resolvido em {error}.

**Evidência no snapshot atual:**

- `src/components/inbox/chat/MessageBubble.tsx:200–225` — Callback ativo verifica classificação, mas ignora o resultado do insert em stickers (217) e confirma (218). SHA `da307ba5626d`; blob `c18dd32e97ebbea0e252914a81481ee0c14d7147`.

**Relação anterior.** Mesma classe geral de erro resolvido ignorado de R2-INB-014, mas em operação/consumidor distintos: biblioteca de figurinhas. Não duplica os no-ops de contato delegados a auth/usuários.

**Aceite:**

- Inspecionar o resultado de persistência e só confirmar depois de uma linha salva.
- Preservar contexto e informar erro recuperável; não confundir falha opcional da classificação com sucesso da escrita.
- Teste deve simular {data:null,error:...} resolvido, além de throw da promise.

**Reprodução offline.** Inspeção do caminho ativo e dos trechos citados; sem reprodução de DOM/provedor/banco neste trabalho.

**Limite.** Confirmação estática do callback alcançável. Não foi feito insert real, inferência de política RLS específica nem afirmação de divulgação global do objeto.

### R2-INB-039 — Busca manual de localização não mostra os vários candidatos devolvidos pelo fallback

**P2 · confirmado estaticamente.** Catálogo: 3.6.

**Causa.** Enter sem sugestão destacada chama searchLocation do useLocationPicker. Com vários candidatos, esse hook só preenche searchResults, aguardando escolha manual. O LocationPicker atual não consome searchResults nem isSearching; a única lista renderizada recebe autocomplete.suggestions.

**Consumidor/precondição.** Picker no mapa, termo digitado e Enter sem destaque; /forward devolve dois ou mais endereços. O caso é especialmente visível quando autocomplete está pausado por custo/429, situação em que a UI orienta usar Enter.

**Efeito.** Os candidatos existem no hook mas não aparecem para o operador escolher. Sem ponto anterior, Enviar Localização continua desabilitado. Resultado único funciona porque searchLocation o aplica automaticamente; essa diferença pode mascarar o defeito em testes simples.

**Evidência no snapshot atual:**

- `src/components/inbox/LocationPicker.tsx:39–55` — Consumer não lê searchResults/isSearching do hook manual. SHA `da307ba5626d`; blob `17cf9e4cf47cd28618d98a6ba6b586c488459ab8`.
- `src/components/inbox/LocationPicker.tsx:195–227` — Enter mantém chamada manual, mas a lista usa apenas autocomplete.suggestions. SHA `da307ba5626d`; blob `17cf9e4cf47cd28618d98a6ba6b586c488459ab8`.
- `src/components/inbox/location-picker/useLocationPicker.ts:212–239` — Vários resultados só são guardados em searchResults; um resultado é aplicado. SHA `da307ba5626d`; blob `33b12ea9d573a36442e404ea8220f494d38036a3`.
- `src/components/inbox/location-picker/useLocationPicker.ts:270–275` — chooseSearchResult exigiria acesso a cada candidato manual. SHA `da307ba5626d`; blob `33b12ea9d573a36442e404ea8220f494d38036a3`.
- `src/components/inbox/location-picker/SuggestionList.tsx:50–75` — Aviso orienta a busca por Enter durante pausa. SHA `da307ba5626d`; blob `8b0144dd9b56ba95155e2cb33c763dc94f4cd537`.
- `docs/mapa/PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md:328–338` — E37 exige busca manual funcionando ao degradar o autocomplete. SHA `da307ba5626d`; blob `8ce1256328907bd7a639c13c43ad3ceacbffa35a`.
- `src/components/inbox/__tests__/LocationPicker.test.tsx:330–337` — Teste verifica somente chamada do mock searchLocation. SHA `da307ba5626d`; blob `bf3f90ddfc6dd3e478836d9a3a9e5e780aebfc56`.
- `src/components/inbox/location-picker/__tests__/useLocationPicker.test.tsx:330–355` — Teste do hook escolhe diretamente searchResults, sem passar pela UI real. SHA `da307ba5626d`; blob `a4a1523d9c72d1c983f5ba8e18476e4ab94b80ab`.

**Relação anterior.** Não classifica Enter durante pausa como bypass: ele é exigido por E37/E38 e pelos testes. A lacuna nova é a ligação ausente do resultado desse caminho à UI; resultado único é um controle positivo.

**Aceite:**

- Ligar resultados e loading da busca manual a um seletor alcançável ou unificar as duas fontes no mesmo modelo de sugestões.
- Durante pausa, Enter com vários resultados deve oferecer escolha explícita e aplicar apenas a opção escolhida.
- Teste do componente com hook/resultado real deve comparar zero, um e vários candidatos; chamar manualmente chooseSearchResult no teste não prova alcançabilidade.

**Reprodução offline.** manual_forward_candidates_unrendered

**Limite.** Hook real executado com dois e um candidatos; ligação do TSX completo verificada estaticamente. Sem DOM/WebGL/serviço Mapbox real. Não foi declarado dead code por ausência de import; há chamada ativa e retorno de estado sem consumidor no componente.

## Probes e o que elas provam

Comando: `node --disable-warning=ExperimentalWarning /workspace/scratch/f8f9b9cbce53/reaudit/reports/inbox/probes/run.mjs`.
O runner carrega TypeScript real com stripTypeScriptTypes ou extrai o callback exato do TSX por marcadores. Substitui fronteiras e hooks por um harness de estado/refs/closures. Isso torna determinísticas falhas de contrato e ordem de operações; não substitui montagem React DOM, PostgREST, MediaRecorder físico ou validação com WhatsApp.
Antes de qualquer execução de código da aplicação, o runner exige HEAD correto e confere todos os 20 blobs fixados em pins.json, derivado do source-integrity.json. Executa buffers previamente verificados, recusa paths não fixados e registra SHA-256 dos pins/runner e HEAD observado. Dois controles negativos recusaram fonte alterada com mesmo HEAD e HEAD esperado incorreto, sem gerar resultado; ver probes/provenance-checks.json. Aceita SOURCE/--source e --out para reprodução portátil.
O arquivo probes/results.json contém os resultados e hashes Git dos arquivos efetivamente carregados. Não há adaptação de resultados fictícios nem afirmação de execução da suíte Vitest original.

| Probe | Observação |
|---|---|
| reply_metadata | Resposta selecionada não chega ao callback de transporte |
| forward_interactive_noop | Handlers de encaminhar e interativo não invocam transporte |
| enter_limit | Enter contorna o limite visual 4096 do botão |
| media_rollback | Falha após enqueue apaga objeto já referenciado; reenviar cria outro ID |
| native_multiple_files | Seletor nativo multiple encaminha somente files[0] |
| signature_retry | Retry de texto restaura payload já assinado e adiciona outra assinatura |
| recorder_lifecycle | Tempo máximo e cleanup do mount não param MediaRecorder |
| overlay_stale | Refetch novo perde para overlay antigo que nunca é descartado |
| gallery_webm_audio | Arquivo produzido por uploadAudio(.webm) é vídeo na galeria |
| schedule_before_persistence | Dialog anuncia sucesso e elimina draft enquanto onSchedule está pendente |
| transfer_wrong_kind | Tipo connection vira queue_id; erro resolvido pelo callback fecha diálogo |
| delete_false_success | Exclusão falha no provedor e banco mas anuncia para todos e invoca callback de exclusão |
| edit_false_success | Edição sem conexão resolvida e update rejeitado ainda anuncia sucesso |
| global_window_hides_contact | 1000 mensagens globais ocupadas por A removem B ativo da lista aberta |
| offline_cache_dropped | Cache válido desaparece ao concluir fetch offline falho |
| global_search_nan_index | Navegação com total zero torna índice NaN e bloqueia Enter após resultados chegarem |
| audio_error_closes_recorder | Mesmo com rejeição explícita, parent desmonta gravador e perde blob local |
| popup_discards_fields | Mapper do popup apaga campos que useMessages já forneceu |
| global_search_tag_semantics | Tag limita contatos só depois de LIMIT e não restringe mensagens |
| ctrl_f_double_toggle | Dois handlers de Ctrl+F desfazem a abertura do painel de busca |

### Segunda passagem

Os 20 casos da primeira passagem foram preservados. Mais 8 casos ficam em probes/pass2/run.mjs e results.json, com pins próprios de 12 arquivos derivados do mesmo manifesto. HEAD e blobs são recusados antes da avaliação se divergirem; dois controles negativos adicionais também passaram.

| Probe adicional | Observação |
|---|---|
| document_download_permission | Documento inicia download mesmo com can_download=false; imagem bloqueia a mesma ação |
| reaction_remote_failure_accepted | Adicionar/remover reação resolve e invalida cache apesar da rejeição do transporte |
| signed_url_refresh_cross_source | Refresh de A termina depois de B e devolve B para loading sem URL ou nova requisição |
| timeline_fixed_query_caps | Carregar mais só amplia o slice; 201 transferências ou 501 mensagens terminam com dados omitidos |
| timeline_done_shown_pending | Tarefa concluída pela máquina atual aparece Pendente na Jornada |
| gps_overwrites_newer_choice | GPS pedido antes substitui depois o ponto manual escolhido mais recentemente |
| retrieve_survives_query_change | Digite B durante retrieve de A: o consumidor ainda aplica a seleção antiga A |
| manual_forward_candidates_unrendered | Forward com vários candidatos não seleciona ponto e o componente não consome a lista |

## Cobertura efetiva e lacunas

coverage.json contém 382 paths: 78 semantic, 45 targeted e 259 structural. Cada arquivo lista símbolos/trechos de fato revisados, achados relacionados e lacunas. **Structural significa inventário apenas e não conta como revisão de função.**
Read-journal.jsonl é um rastro de pedidos de leitura: alguns lotes iniciais tiveram truncamento, corrigido por releituras direcionadas e por rebaixamento honesto de cobertura em targeted. O journal isolado não demonstra que todo o conteúdo solicitado foi analisado.
Permanecem sem validação dinâmica: medidas/foco/propagação de DOM real, acessibilidade e navegação física, codecs e microfone, reconexão/replay de realtime, carga real e disputas entre operadores, permissões de Storage/RLS e provider. Componentes auxiliares/folhas restantes constam como structural ou targeted; o inventário não foi promovido automaticamente a revisão semântica.
Áreas delegadas: Team Chat; auth/usuários/ContactDetails; backend/integrações e schema; IA tools e Agenda. Agendamento de Composer (este relatório), disponibilidade do executor (providers) e leitura global da Agenda (agente complementar) são contratos distintos.

## Controles positivos e suspeitas descartadas

- RealtimeInboxView e ChatPopup usam key por contato no ChatPanel. Não foi alegada aplicação genérica de respostas IA ou state do Composer de um contato em outro sem precondição adicional.
- useForwardMedia tem cópia por destino, resultados por par e verificação de enqueue antes de limpar objeto. A rota real de Arquivos não foi confundida com o no-op do balão.
- useMessages tem geração/contato ativo para descartar fetch tardio e preserva páginas mais antigas no refetch silencioso. A falha nova é o overlay permanente e a falta de ligação do cursor na UI, não ausência de toda proteção de concorrência.
- handleSendMessage da ponte propaga erro de transporte e trata refresh posterior separadamente. A quebra de retry identificada ocorre na restauração com assinatura e no ciclo de URL de mídia.
- Native textarea setter + evento input não foi declarado genericamente quebrado. Sua validação física permanece uma limitação, não um bug inventado.
- Não foi atribuído erro de edição/deleção sent ao guard de campos internos. A confirmação independente de database delimitou a condição sending do guard; a falha de UI é ignorar os resultados/rejeições.
- Fechar: CloseConversationDialog (71,81–99,117–130) preserva client_request_id no retry aberto e cria outro ao iniciar novo formulário. O conflito de fechamento repetido no mesmo dia pertence a R2-DB-008. Não foi encontrada reabertura no Inbox; o agente DB qualificou esse cenário para reabertura pelo contrato backend/API autorizada, sem afirmar que novo inbound o reabra automaticamente. Não foi duplicado como achado de UI.
- LocationPicker é montado condicionalmente em ChatDialogs: a hipótese de GPS reaparecer na próxima abertura foi descartada. O caso reproduzido é uma resposta antiga substituir outra escolha dentro do mesmo picker aberto.
- Enter durante pausa/custo de autocomplete é comportamento previsto em docs/mapa/PLANO_BUSCA_SEARCHBOX_50_ETAPAS.md E37/E38 e teste específico. A falha R2-INB-039 está nos múltiplos resultados manuais sem lista consumidora, não na existência desse fallback.
- Nenhum caminho legado foi declarado dead code só pela ausência de import localizado.
