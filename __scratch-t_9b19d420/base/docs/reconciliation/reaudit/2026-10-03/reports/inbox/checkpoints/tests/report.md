# Reauditoria Inbox/Chat — da307ba5626d

**Resultado: 64 achados — 63 confirmados estaticamente e 1 lacuna(s); 14 P1, 48 P2, 2 P3. Foram executadas 64 probes offline, todas com asserções satisfeitas.**

A revisão confirmou falhas na cadeia de envio e na semântica de UI que não apareciam individualizadas na auditoria anterior: encaminhamento e interativos sem transporte, metadados de resposta perdidos, persistência seguida de rollback indevido de anexo, retry que altera identidade, captura de microfone sem liberação nas duas condições descritas, janelas de histórico e erros silenciosos. Não foi realizada correção de produto.

## Fontes e limites de autoridade

- Snapshot atual: `/workspace/scratch/f8f9b9cbce53/reaudit/source`, SHA `da307ba5626dce892f0b37cb6762463f55d14a96`.
- Auditoria anterior: `/workspace/scratch/8b95153002da/reconciliation/docs/reconciliation`, baseline `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`.
- Comparação de blobs de todos os 431 arquivos lidos/citados: 431 idênticos ao baseline; ver baseline-comparison.json. Os achados são descobertas da reauditoria, não regressões atribuídas ao novo HEAD.
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
| R2-INB-040 | P2 | confirmado estaticamente | TTS do chat continua após desmontagem e aceita duas gerações simultâneas da mesma mensagem |
| R2-INB-041 | P2 | confirmado estaticamente | Parar TTS e prévias de memes conserva inscrições dos players descartados |
| R2-INB-042 | P2 | confirmado estaticamente | Mutações de áudio meme e stickers omitem erros e aceitam exclusão parcial |
| R2-INB-043 | P2 | confirmado estaticamente | Fechar pickers de áudio meme e stickers abandona uploads pendentes |
| R2-INB-044 | P2 | confirmado estaticamente | Evento final do ditado anterior desliga o indicador da nova sessão de voz |
| R2-INB-045 | P2 | confirmado estaticamente | Notificação de transcrição pendente escapa à desativação do hook |
| R2-INB-046 | P2 | confirmado estaticamente | Comandos de voz anunciam busca, filtros e ordenação sem aplicar os parâmetros |
| R2-INB-047 | P2 | confirmado estaticamente | Interromper a fala do assistente deixa a ação aguardando uma Promise que não termina |
| R2-INB-048 | P2 | confirmado estaticamente | Comando antigo de voz ainda aplica ação depois de um comando mais recente |
| R2-INB-049 | P1 | confirmado estaticamente | Excluir uma figurinha compartilhada pode remover o arquivo da mensagem original |
| R2-INB-050 | P2 | confirmado estaticamente | Importação de mídia e salvamento de áudio gerado deixam objetos órfãos quando a entrada falha |
| R2-INB-051 | P2 | confirmado estaticamente | Biblioteca de mídia e seletor de stickers limitam catálogo a mil itens sem caminho para os demais |
| R2-INB-052 | P2 | confirmado estaticamente | Figurinhas com referência de bucket privado são renderizadas sem resolver a URL |
| R2-INB-053 | P2 | confirmado estaticamente | Reclassificação de mídia não conta erros retornados pela função e limpa a seleção |
| R2-INB-054 | P2 | confirmado estaticamente | Editar resposta rápida reutiliza o formulário anterior e pode gravá-lo em outro template |
| R2-INB-055 | P2 | confirmado estaticamente | Filtro de grupos remove o hífen que sua própria expressão exige |
| R2-INB-056 | P2 | confirmado estaticamente | Contador Em atendimento e badge de responsável comparam auth ID com profile ID |
| R2-INB-057 | P1 | confirmado estaticamente | VoiceChangerPicker mantém ou inicia captura depois de fechar ou desmontar |
| R2-INB-058 | P2 | confirmado estaticamente | Áudio gerado e voz transformada descartam a prévia antes do resultado do envio |
| R2-INB-059 | P2 | confirmado estaticamente | Miniatura com assinatura em lote não consegue renovar a URL que falha |
| R2-INB-060 | P2 | confirmado estaticamente | Detalhes de arquivo conservam o erro da imagem anterior ao selecionar outro item |
| R2-INB-061 | P2 | confirmado estaticamente | Falha ao carregar scoring habilita salvar defaults sobre dados existentes |
| R2-INB-062 | P3 | confirmado estaticamente | Controle Recentes do administrador de figurinhas não muda a coleção |
| R2-INB-063 | P2 | confirmado estaticamente | Card de resposta rápida anuncia cópia sem escrever no clipboard |
| R2-INB-064 | P2 | confirmado estaticamente | Ações de alertas de sentimento não oferecem navegação para a conversa |

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

### R2-INB-040 — TTS do chat continua após desmontagem e aceita duas gerações simultâneas da mesma mensagem

**P2 · confirmado estaticamente.** Catálogo: 4.5.

**Causa.** speak não tem AbortController, geração vigente ou guarda de montagem; stop só pausa o Audio já existente. O hook não possui cleanup de unmount. TextToSpeechButton desabilita outras mensagens durante loading, mas deixa habilitada a própria mensagem que está carregando, cujo clique chama speak novamente.

**Consumidor/precondição.** Ouvir mensagem no ChatPanel e trocar de contato antes da resposta TTS; ou clicar novamente no spinner da mesma mensagem antes de o primeiro pedido terminar.

**Efeito.** O resultado atrasado cria e toca Audio após o painel desaparecer. Dois pedidos da mesma mensagem podem tocar simultaneamente, pois o segundo stop ocorre antes de existir o primeiro player; somente o último Audio fica alcançável pela ref.

**Evidência no snapshot atual:**

- `src/hooks/communication/useTextToSpeech.ts:68–83` — stop não invalida fetch e speak inicia chamando stop. SHA `da307ba5626d`; blob `bae3f03b2dcbacc1333b64f30cecf536e16b4e22`.
- `src/hooks/communication/useTextToSpeech.ts:101–166` — Resposta cria e toca Audio sem guard de geração/montagem. SHA `da307ba5626d`; blob `bae3f03b2dcbacc1333b64f30cecf536e16b4e22`.
- `src/hooks/communication/useTextToSpeech.ts:168–179` — Fim do hook sem cleanup de unmount. SHA `da307ba5626d`; blob `bae3f03b2dcbacc1333b64f30cecf536e16b4e22`.
- `src/components/inbox/TextToSpeechButton.tsx:27–35` — Clique sem isThisPlaying chama speak, inclusive loading. SHA `da307ba5626d`; blob `5953730298aa6a6133dac609c77d2d4395639d4d`.
- `src/components/inbox/TextToSpeechButton.tsx:59–65` — Mensagem corrente em loading permanece clicável. SHA `da307ba5626d`; blob `5953730298aa6a6133dac609c77d2d4395639d4d`.
- `src/components/inbox/ChatPanel.tsx:125–129` — Instância TTS do chat. SHA `da307ba5626d`; blob `f2561bc99f053782ac17f2769ea34fe262d9d8f8`.
- `src/components/inbox/ChatPanel.tsx:273–278` — Callbacks entregues ao renderer. SHA `da307ba5626d`; blob `f2561bc99f053782ac17f2769ea34fe262d9d8f8`.
- `src/components/inbox/RealtimeInboxView.tsx:299–303` — Troca de conversa remonta ChatPanel por key. SHA `da307ba5626d`; blob `3d6dacf92511e917426345a7f390dbe408d1ce1b`.
- `src/hooks/__tests__/useTextToSpeech.test.ts:19–148` — Testes conferem estado/configuração; não executam speak/fetch/unmount. SHA `da307ba5626d`; blob `c1cb4303f8c9418aff203d29d9ca4c765c24e790`.

**Relação anterior.** Novo contrato do TTS de mensagens. Não duplica R2-MOD-040, que pertence ao AIGenerateDialog, nem VOL-01 sobre AudioContext. R2-INB-041 trata a retenção dos bindings mesmo depois de parar um player existente.

**Aceite:**

- Invalidar pedidos antigos ao parar, iniciar outra fala ou desmontar e liberar o Audio/URL de sua própria geração.
- Durante loading, botão corrente deve cancelar explicitamente ou impedir submissão repetida.
- Resposta TTS de painel desmontado não deve criar/tocar Audio; dois cliques rápidos devem produzir somente a fala vigente.

**Reprodução offline.** tts_starts_after_unmount, tts_stop_does_not_cancel_request, tts_loading_button_starts_duplicate

**Limite.** Probes executam hook/binding e callback reais com fetch/Audio/hooks simulados. Não afirmam audibilidade ou política de autoplay de navegador real. A ordem dos nomes de parâmetros em interfaces intermediárias é confusa, mas TextToSpeechButton chama corretamente onSpeak(text, messageId); não foi registrada inversão inexistente.

### R2-INB-041 — Parar TTS e prévias de memes conserva inscrições dos players descartados

**P2 · confirmado estaticamente.** Catálogo: 4.2, 4.5.

**Causa.** attachMediaVolume devolve detach, que remove os listeners, a inscrição no store e o ganho. useAudioMemes só chama detach em ended; pause, troca de meme, cleanup e unmount não o chamam. useTextToSpeech guarda detach apenas em ended/error, não em stop nem unmount. O Set global de listeners retém closures que capturam cada Audio.

**Consumidor/precondição.** Pré-visualizar e pausar/fechar memes antes de terminar; ouvir uma mensagem e parar antes de ended; repetir durante a sessão.

**Efeito.** Players antigos permanecem inscritos no volume global e retidos após a UI descartá-los. Cada nova prévia ou TTS interrompido pode acrescentar outro binding; no fallback com GainNode também falta o caminho normal de liberação do recurso.

**Evidência no snapshot atual:**

- `src/hooks/communication/useAudioMemes.ts:54–81` — Cleanup/pausa não chamam o detach que só existe no onended. SHA `da307ba5626d`; blob `b0fabf284c8a368dec14b98a334f736ea0446f72`.
- `src/hooks/communication/useAudioMemes.ts:184–190` — Enviar pausa a prévia sem detach. SHA `da307ba5626d`; blob `b0fabf284c8a368dec14b98a334f736ea0446f72`.
- `src/hooks/communication/useAudioMemes.ts:221–224` — cleanup descarta estado sem soltar inscrição. SHA `da307ba5626d`; blob `b0fabf284c8a368dec14b98a334f736ea0446f72`.
- `src/hooks/communication/useTextToSpeech.ts:68–79` — stop sem detach. SHA `da307ba5626d`; blob `bae3f03b2dcbacc1333b64f30cecf536e16b4e22`.
- `src/hooks/communication/useTextToSpeech.ts:132–155` — Detach limitado aos eventos ended/error. SHA `da307ba5626d`; blob `bae3f03b2dcbacc1333b64f30cecf536e16b4e22`.
- `src/lib/mediaVolumeElement.ts:175–202` — Binding mantém inscrição e requer retorno de cleanup. SHA `da307ba5626d`; blob `43d5aaa1d776c00b6cadc3277444150e3adf4aad`.
- `src/lib/mediaVolumeStore.ts:38–38` — Set global retém subscribers. SHA `da307ba5626d`; blob `d4b77ab5b5b4f2dba63080c0b1d8c71535ceeb12`.
- `src/lib/mediaVolumeStore.ts:195–201` — Somente unsubscribe remove listener. SHA `da307ba5626d`; blob `d4b77ab5b5b4f2dba63080c0b1d8c71535ceeb12`.

**Relação anterior.** Distinto de VOL-01: o achado antigo ocorre mesmo quando detach é chamado, pois o contexto nativo foi criado sem nó. Aqui o consumidor sequer invoca detach e retém inscrições/elementos, inclusive no caminho nativo sem contexto.

**Aceite:**

- Guardar cleanup por player e executá-lo de modo idempotente em stop, troca, erro, ended e unmount.
- Interromper N prévias deve devolver a contagem de bindings ao valor anterior.
- No fallback WebAudio, liberar o último ganho somente quando nenhum outro consumidor o usa.

**Reprodução offline.** imperative_audio_stops_keep_bindings

**Limite.** Prova de retenção usa o bindMediaVolume real com Set de subscribers controlado e Audio simulado. Não mede consumo de memória, bateria ou limites físicos de AudioContext.

### R2-INB-042 — Mutações de áudio meme e stickers omitem erros e aceitam exclusão parcial

**P2 · confirmado estaticamente.** Catálogo: sem ID específico.

**Causa.** handleCategoryChange e handleDelete fazem alteração otimista e aguardam chamadas Supabase sem verificar error ou quantidade afetada. Delete remove o objeto de Storage antes de confirmar a remoção da linha. Todos esses resultados seguem para toast.success. useStickerPicker repete resultado ignorado em favorito/categoria/delete. No administrador, deleteStorageFile descarta error de Storage; exclusão simples/em lote ainda apaga a linha quando o objeto não foi removido. O administrador verifica error do DELETE da linha, diferentemente dos pickers.

**Consumidor/precondição.** Menu de categoria ou lixeira em AudioMemePicker; banco/Storage devolve erro resolvido. Caso de remoção parcial: Storage remove o objeto e DELETE da linha falha. Também alcança StickerPicker e exclusão simples/em lote em MediaLibraryAdmin quando a remoção de Storage falha.

**Efeito.** A categoria parece salva ou o meme desaparece da lista mesmo com persistência rejeitada. No caso parcial, a linha conservada passa a apontar para objeto removido; reabrir/refetch restaura uma entrada sem arquivo. Na variante administrativa de erro do Storage, a entrada some e o objeto órfão permanece; no picker de sticker, os erros de favorito/categoria/delete também são anunciados como sucesso.

**Evidência no snapshot atual:**

- `src/hooks/communication/useAudioMemes.ts:206–219` — Update/delete ignoram resultados; objeto removido primeiro. SHA `da307ba5626d`; blob `b0fabf284c8a368dec14b98a334f736ea0446f72`.
- `src/hooks/communication/useAudioMemes.ts:41–51` — Refetch volta a carregar o estado persistido. SHA `da307ba5626d`; blob `b0fabf284c8a368dec14b98a334f736ea0446f72`.
- `src/components/inbox/AudioMemePicker.tsx:163–182` — Controles de categoria e lixeira ligados diretamente às callbacks. SHA `da307ba5626d`; blob `9494642711cf7bda43880deaddf700e490611341`.
- `src/hooks/sticker-picker/useStickerPicker.ts:84–101` — Favorito/categoria/delete ignoram resultados. SHA `da307ba5626d`; blob `3aa36f78b1fbf537623ca556a25bb38de12e3c72`.
- `src/components/inbox/StickerPicker.tsx:87–89` — Wiring dos controles de sticker. SHA `da307ba5626d`; blob `6d5b60c026f2ee289cc7b08d588264b352783766`.
- `src/components/settings/media-library/useMediaLibrary.ts:146–161` — Bulk delete não examina resultado de Storage, mas examina resultado da linha. SHA `da307ba5626d`; blob `9665b58a6d449dbac5a665f71daa6e1285a0bea0`.
- `src/components/settings/media-library/useMediaLibrary.ts:215–220` — Single delete usa o mesmo helper que descarta error de Storage. SHA `da307ba5626d`; blob `9665b58a6d449dbac5a665f71daa6e1285a0bea0`.
- `src/components/settings/MediaLibraryAdmin.tsx:65–70` — Controle de exclusão em lote. SHA `da307ba5626d`; blob `0f7f892e86413211f34e27fd13ffc151eb44a2cd`.
- `src/components/settings/MediaLibraryAdmin.tsx:114–119` — Controles por item. SHA `da307ba5626d`; blob `0f7f892e86413211f34e27fd13ffc151eb44a2cd`.

**Relação anterior.** Nova UI de biblioteca de áudios; não duplica R2-INB-014 (mensagens de conversa) nem R2-INB-038 (salvar sticker). Agente database confirmou não ter finding próprio de audio_memes.

**Aceite:**

- Verificar error e linhas efetivamente afetadas antes de concluir; reverter estado otimista e conservar possibilidade de retry.
- Coordenar exclusão da linha/objeto para não remover arquivo que ainda precisa permanecer referenciado.
- Reproduzir falha de update, falha de Storage e falha da linha após Storage, sem toast de sucesso integral.
- Reclassificar/favoritar/excluir sticker deve confirmar a escrita; exclusão administrativa deve considerar erro e confirmação da remoção do objeto, além da linha.

**Reprodução offline.** audio_meme_writes_false_success, sticker_mutations_ignore_errors, library_storage_delete_failure_accepted

**Limite.** Erro resolvido e remoção parcial são cenários controlados. A composição final de todas as policies de Storage/audio_memes não foi reconstruída neste lote; não se afirma que todos os agentes sofrem a falha nem bypass de autorização. Extensão do lote media-library preserva a distinção: o administrador já trata error da linha, mas não o resultado do helper de Storage.

### R2-INB-043 — Fechar pickers de áudio meme e stickers abandona uploads pendentes

**P2 · confirmado estaticamente.** Catálogo: sem ID específico.

**Causa.** O arquivo é enviado a Storage antes de criar pendingUpload. O fechamento normal do Popover chama cleanup, que apenas põe pendingUpload=null; não usa handleCancelUpload, único caminho que remove o storagePath. Uma conclusão tardia de upload também não é invalidada por fechar. StickerPicker.onOpenChange também faz setPendingUpload(null) em vez de handleCancelUpload, após processFile ter enviado o objeto.

**Consumidor/precondição.** Adicionar áudio meme até aparecer preview de nome/categoria; fechar o Popover por clique externo ou pelo controle de abertura, sem Salvar/Cancelar. O mesmo gesto de fechar após preview pronto existe no StickerPicker.

**Efeito.** O draft e seu único storagePath são descartados enquanto o arquivo permanece em Storage sem linha audio_memes criada por essa operação. Repetir o fluxo acumula objetos órfãos; depois de fechar, a UI não oferece recuperação daquela referência.

**Evidência no snapshot atual:**

- `src/hooks/communication/useAudioMemes.ts:107–118` — Upload precede criação da linha/preview. SHA `da307ba5626d`; blob `b0fabf284c8a368dec14b98a334f736ea0446f72`.
- `src/hooks/communication/useAudioMemes.ts:147–175` — Pending guarda locator; linha só nasce na confirmação. SHA `da307ba5626d`; blob `b0fabf284c8a368dec14b98a334f736ea0446f72`.
- `src/hooks/communication/useAudioMemes.ts:177–182` — Cancelar explícito remove locator. SHA `da307ba5626d`; blob `b0fabf284c8a368dec14b98a334f736ea0446f72`.
- `src/hooks/communication/useAudioMemes.ts:221–224` — cleanup elimina pending sem remover objeto. SHA `da307ba5626d`; blob `b0fabf284c8a368dec14b98a334f736ea0446f72`.
- `src/components/inbox/AudioMemePicker.tsx:108–108` — Fechamento chama cleanup. SHA `da307ba5626d`; blob `9494642711cf7bda43880deaddf700e490611341`.
- `src/components/inbox/AudioMemePicker.tsx:128–128` — Cancelar do preview é outra callback. SHA `da307ba5626d`; blob `9494642711cf7bda43880deaddf700e490611341`.
- `src/hooks/sticker-picker/useStickerPicker.ts:47–77` — Upload produz pending com storagePath; cancelar é o único remove desse fluxo. SHA `da307ba5626d`; blob `3aa36f78b1fbf537623ca556a25bb38de12e3c72`.
- `src/components/inbox/StickerPicker.tsx:34–34` — Fechar descarta pending sem cancelamento/limpeza. SHA `da307ba5626d`; blob `6d5b60c026f2ee289cc7b08d588264b352783766`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Tratar fechamento e desmontagem com contrato explícito de retenção ou rollback do upload não confirmado.
- Se a resposta do upload vier após fechar, não recriar preview fora do ciclo ativo e encaminhar o objeto para limpeza recuperável.
- Controle positivo: Salvar confirmado conserva o objeto; Cancelar/fechar antes de persistir remove somente o objeto dessa tentativa.

**Reprodução offline.** audio_meme_close_orphans_upload, sticker_close_leaves_upload

**Limite.** Probe demonstra fechamento após preview pronto e contrasta com Cancelar explícito. Não mede objetos/custos reais nem afirma que o storagePath permaneça secreto; não amplia a prova para todas as ordens possíveis do upload assíncrono.

### R2-INB-044 — Evento final do ditado anterior desliga o indicador da nova sessão de voz

**P2 · confirmado estaticamente.** Catálogo: sem ID específico.

**Causa.** Cada startListening cria Recognition novo. onend/onerror capturam setters globais e não validam identidade; stop põe a ref em null, mas não remove handlers do objeto anterior. Se A finalizar depois de B começar, A escreve isListening=false para B.

**Consumidor/precondição.** VoiceDictationButton do Composer: iniciar A, parar e iniciar B antes de o navegador entregar onend de A.

**Efeito.** A nova sessão ainda recebe resultados, mas a UI troca para Ditar mensagem e deixa de mostrar que está ouvindo. O próximo clique pode iniciar C, em vez de parar B, porque toggleListening usa o estado derrubado pelo evento antigo.

**Evidência no snapshot atual:**

- `src/hooks/communication/useSpeechToText.ts:79–124` — Objeto novo e eventos sem comparação com recognitionRef. SHA `da307ba5626d`; blob `a86fd5bcea1cd8dc78823545f0be475dbf00d858`.
- `src/hooks/communication/useSpeechToText.ts:129–151` — Stop limpa ref, sem neutralizar eventos anteriores. SHA `da307ba5626d`; blob `a86fd5bcea1cd8dc78823545f0be475dbf00d858`.
- `src/components/mobile/VoiceDictationButton.tsx:14–39` — Estado dirige callback e indicação Ditar/Parar. SHA `da307ba5626d`; blob `5aa72a8ef5f6d3da844db1fece34a49fa72cf601`.
- `src/components/inbox/chat/ChatInputToolbars.tsx:78–78` — Ditado é consumido pelo Composer. SHA `da307ba5626d`; blob `574d864f2b373d7ff3c932b8b355d267d8c0cd6c`.
- `src/components/inbox/chat/useChatInputLogic.ts:84–90` — Resultado é anexado ao texto atual. SHA `da307ba5626d`; blob `bfc4b3d4c6be9c2763f6ed6bc7673f12bbcd649d`.
- `src/hooks/__tests__/useSpeechToText.test.ts:5–18` — Mock faz onend síncrono em stop e elimina a ordem problemática. SHA `da307ba5626d`; blob `f764d3de109cbe1b94134a5e64de50b58a8ef7cc`.
- `src/hooks/__tests__/useSpeechToText.test.ts:78–98` — Teste nomeado onResult cria fixture, mas não dispara o evento nem verifica o callback. SHA `da307ba5626d`; blob `f764d3de109cbe1b94134a5e64de50b58a8ef7cc`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Vincular resultados/end/error à instância vigente e retirar handlers/abortar instâncias descartadas conforme o contrato adotado.
- Parar A e iniciar B com onend tardio de A deve manter B como listening.
- Teste de onResult deve de fato emitir resultado e verificar o texto recebido; testar cleanup com evento posterior ao unmount.

**Reprodução offline.** dictation_old_end_resets_new_session

**Limite.** Prova controla a entrega de eventos pela interface SpeechRecognition. Não usa microfone nem determina frequência por navegador. O retorno final provocado por stop pode ser legítimo; o achado é a alteração do estado de outra sessão.

### R2-INB-045 — Notificação de transcrição pendente escapa à desativação do hook

**P2 · confirmado estaticamente.** Catálogo: 4.11, 20.5, 20.8.

**Causa.** O callback realtime verifica opções/quiet hours e depois aguarda a consulta do nome do contato. Cleanup só remove o canal; não invalida callbacks em andamento. Após o await, toast/som/browser usam as configurações capturadas, mesmo que enabled ou preferências tenham mudado.

**Consumidor/precondição.** Uma transcrição completed chega enquanto o hook está ativo; o SELECT de contacts.name demora; durante a espera ocorre desativação/desmontagem ou mudança de preferência.

**Efeito.** O aviso de transcrição, inclusive som e browser notification, ainda pode sair após a desativação do ciclo que o iniciou, usando a preferência anterior.

**Evidência no snapshot atual:**

- `src/hooks/communication/useTranscriptionNotifications.ts:30–73` — Gate e pausa no SELECT do contato. SHA `da307ba5626d`; blob `4e33fda3acd463bfe3c0796ee21289f5a18498d9`.
- `src/hooks/communication/useTranscriptionNotifications.ts:75–109` — Efeitos posteriores sem guarda de validade; cleanup só removeChannel. SHA `da307ba5626d`; blob `4e33fda3acd463bfe3c0796ee21289f5a18498d9`.
- `src/pages/Index.tsx:79–85` — enabled depende da sessão e do atraso de montagem. SHA `da307ba5626d`; blob `9317b83b809bbb745fd6d5adfe5de3c1e420d16d`.
- `src/hooks/__tests__/useTranscriptionNotifications.behavior.test.ts:25–47` — Testes exercitam completion síncrono, não cleanup durante consulta. SHA `da307ba5626d`; blob `476a6708c24b003ffe197b1517b4c0d7fe7fd40d`.

**Relação anterior.** Separado de AUTH038, que trata persistência dos toggles de som. Este achado cobre a duração do callback de transcrição, não gravação de preferências nem autorização de leitura.

**Aceite:**

- Invalidar callback pendente no cleanup e conferir ciclo/configuração vigente antes de emitir alerta.
- Simular consulta pendente seguida de enabled=false, unmount e alteração de quiet hours; nenhum alerta antigo deve escapar.
- Conservar deduplicação por mensagem sem assumir que remover canal cancela Promises já iniciadas.

**Reprodução offline.** transcription_notification_after_disable

**Limite.** Não afirma divulgação a usuário sem acesso à mensagem. O dado foi recebido em evento originalmente autorizado; prova cobre aviso posterior ao ciclo ativo. A solicitação de permissão incondicional no mount foi registrada como limite de UX, sem transformar comportamento específico de browser em fato medido.

### R2-INB-046 — Comandos de voz anunciam busca, filtros e ordenação sem aplicar os parâmetros

**P2 · confirmado estaticamente.** Catálogo: sem ID específico.

**Causa.** O callback onAction da comunicação chega ao outro hook homônimo em hooks/voice/useVoiceAgent. search só navega para contacts e mostra query no toast; filter só navega para inbox; sort e clear só mostram toast. Nenhum desses ramos transmite o estado solicitado ao consumidor da view.

**Consumidor/precondição.** Assistente de voz do botão flutuante desktop retorna action search/filter/sort/clear com dados válidos e conclui a resposta falada.

**Efeito.** O usuário ouve/recebe confirmação de busca, filtro, ordenação ou limpeza, mas a lista conserva os parâmetros anteriores. Só a navegação simples tem efeito implementado nessa ponte.

**Evidência no snapshot atual:**

- `src/hooks/communication/useVoiceAgent.ts:108–126` — Resultado chega ao onAction após fala. SHA `da307ba5626d`; blob `b6a6e63f162fd1562774c2bfea968ea5b93a55fa`.
- `src/components/voice/VoiceSearchOverlayConnected.tsx:11–25` — Wrapper recebe ação e liga o hook de comunicação. SHA `da307ba5626d`; blob `197ef774316c418747a4cf6668ff2aa008f25334`.
- `src/components/layout/AppShell.tsx:65–71` — AppShell entrega somente handleViewChange ao roteador. SHA `da307ba5626d`; blob `e38b6cb6b8ba9d1fa755c81125d99ea2d2a0eead`.
- `src/components/layout/AppShell.tsx:165–175` — FAB monta overlay com handleVoiceAction. SHA `da307ba5626d`; blob `e38b6cb6b8ba9d1fa755c81125d99ea2d2a0eead`.
- `src/hooks/voice/useVoiceAgent.ts:5–38` — Ramos search/filter/sort/clear sem aplicação do payload. SHA `da307ba5626d`; blob `39c5b2fdb307aed04dd67e28b910fdb22ef8ae72`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Definir contrato de ação tipado que aplique query/filtros/sort/clear ao estado real da view e confirme apenas o resultado efetivo.
- Teste pela ponte AppShell deve validar alteração da consulta/lista, além de toast ou navegação.
- Se o recurso não estiver conectado, a resposta deve comunicar indisponibilidade em vez de execução.

**Reprodução offline.** voice_actions_announce_without_applying

**Limite.** Não é uma alegação sobre voice-copilot-action ou outros assistentes/backend, que têm contratos separados. A ordem dos eventos e a ausência de setters são confirmadas no caminho LazyVoiceOverlay ativo.

### R2-INB-047 — Interromper a fala do assistente deixa a ação aguardando uma Promise que não termina

**P2 · confirmado estaticamente.** Catálogo: sem ID específico.

**Causa.** playTtsAudio aguarda playObjectUrl, cuja Promise só resolve/rejeita em ended/error/play.catch. stop faz cleanup que apaga ended/error e pausa o áudio, sem resolver essa Promise. useVoiceAgent aguarda tts.promise antes de chamar onAction.

**Consumidor/precondição.** Comando do assistente já processado e primeiro trecho de áudio em reprodução; usuário toca no orbe para Interromper resposta.

**Efeito.** A UI retorna para listening e o áudio pausa, porém a Promise da fala continua pendente e a ação reconhecida nunca chega a onAction por esse caminho. O encerramento também não executa o finally que dependia daquela conclusão.

**Evidência no snapshot atual:**

- `src/hooks/voice/playTtsAudio.ts:106–116` — cleanup remove os handlers e pausa. SHA `da307ba5626d`; blob `e42cf6267529bfec124f6f89e3a80ae8edcef74a`.
- `src/hooks/voice/playTtsAudio.ts:186–216` — Promise depende dos handlers ou rejeição de play. SHA `da307ba5626d`; blob `e42cf6267529bfec124f6f89e3a80ae8edcef74a`.
- `src/hooks/voice/playTtsAudio.ts:237–269` — Await da reprodução; stop não settle. SHA `da307ba5626d`; blob `e42cf6267529bfec124f6f89e3a80ae8edcef74a`.
- `src/hooks/communication/useVoiceAgent.ts:100–121` — Ação espera a Promise do TTS. SHA `da307ba5626d`; blob `b6a6e63f162fd1562774c2bfea968ea5b93a55fa`.
- `src/hooks/communication/useVoiceAgent.ts:255–259` — stopSpeaking muda fase após stop. SHA `da307ba5626d`; blob `b6a6e63f162fd1562774c2bfea968ea5b93a55fa`.
- `src/components/voice/VoiceSearchOverlay.tsx:83–88` — Orbe em speaking chama stopSpeaking. SHA `da307ba5626d`; blob `9366e486b3fdfdfdbfd2532e6a2e3cff50b94eea`.
- `src/components/voice/VoiceSearchOverlay.tsx:124–125` — Controle rotulado Interromper resposta. SHA `da307ba5626d`; blob `9366e486b3fdfdfdbfd2532e6a2e3cff50b94eea`.

**Relação anterior.** Helper compartilhado com useAnalysisTts/useSummaryTts, mas o finding usa somente o consumidor VoiceOverlay. Revisor de IA confirmou que não havia registrado esse contrato; não duplica sua corrida do AIGenerateDialog.

**Aceite:**

- Parada deve encerrar explicitamente toda Promise de reprodução, de modo idempotente.
- Definir se interromper resposta conserva ou cancela a ação e implementar o resultado correspondente sem continuação pendente.
- Cobrir stop durante fetch, durante Audio.play e no fallback de fala do browser.

**Reprodução offline.** voice_stop_leaves_action_pending

**Limite.** Prova usa playTtsAudio e useVoiceAgent reais com Audio/SDK/fetch simulados. O cenário está no await playObjectUrl; stop antes de receber o arquivo pode sair corretamente pelo sinal e não é generalizado como falha.

### R2-INB-048 — Comando antigo de voz ainda aplica ação depois de um comando mais recente

**P2 · confirmado estaticamente.** Catálogo: sem ID específico.

**Causa.** Novo transcript aborta processingAbortRef anterior, mas handleTranscript só confere o sinal antes de iniciar TTS. Depois de await tts.promise, verifica apenas mountedRef; o novo transcript também não para a fala anterior. Uma conclusão antiga continua até logVoiceCommand/onAction.

**Consumidor/precondição.** Sessão Scribe ativa; A está respondendo em áudio; novo transcript B é aceito e termina antes de A. O callback de committed transcript não bloqueia eventos na fase speaking.

**Efeito.** A ação B pode ser seguida pela ação antiga A, revertendo a navegação ou aplicando estado ultrapassado. As respostas também podem sobrepor fases/áudio, pois o TTS de A não foi interrompido pelo início de B.

**Evidência no snapshot atual:**

- `src/hooks/communication/useVoiceAgent.ts:78–103` — Abort anterior e guard somente antes da fala. SHA `da307ba5626d`; blob `b6a6e63f162fd1562774c2bfea968ea5b93a55fa`.
- `src/hooks/communication/useVoiceAgent.ts:108–126` — Após TTS, ausência de sinal/identidade antes de ação e fase. SHA `da307ba5626d`; blob `b6a6e63f162fd1562774c2bfea968ea5b93a55fa`.
- `src/hooks/communication/useVoiceAgent.ts:152–165` — Committed transcript aciona processamento sem guard de fase. SHA `da307ba5626d`; blob `b6a6e63f162fd1562774c2bfea968ea5b93a55fa`.
- `src/hooks/voice/useVoiceAgent.ts:8–12` — Ação navigate produz efeito observável na view. SHA `da307ba5626d`; blob `39c5b2fdb307aed04dd67e28b910fdb22ef8ae72`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Verificar geração/sinal vigente após cada await e antes de qualquer ação, log de sucesso ou mudança de fase.
- Ao substituir comando, parar sua fala e liberar recursos sem cancelar a geração nova.
- Fixture A speaking→B→B termina→A termina deve aplicar somente a política explícita para o comando vigente.

**Reprodução offline.** voice_old_tts_applies_old_action

**Limite.** Código do hook real com TTS/transcrição controlados. Precondição é a chegada de outro transcript durante speaking; não presume que todo áudio do próprio assistente seja capturado pelo microfone nem mede barge-in por dispositivo. Fechar o overlay desmonta o hook em AppShell, cujo mountedRef já bloqueia a ação após unmount; esse cenário não foi alegado.

### R2-INB-049 — Excluir uma figurinha compartilhada pode remover o arquivo da mensagem original

**P1 · confirmado estaticamente.** Catálogo: 3.11, 2.25.

**Causa.** Salvar no balão insere image_url=message.mediaUrl sem cópia. useStickerPicker.handleDelete considera essa referência propriedade do catálogo e chama Storage.remove de whatsapp-media quando encontra esse bucket na URL; não consulta referências de mensagens antes de apagar.

**Consumidor/precondição.** Existe entrada de sticker cujo image_url é a mesma URL de uma mensagem em whatsapp-media; o usuário confirma excluir essa figurinha e possui permissão de remover o objeto. A policy versionada tem ramo explícito para administrador/supervisor e para mídia atribuída/própria.

**Efeito.** A entrada da biblioteca e o arquivo original podem ser removidos, enquanto a mensagem de conversa conserva a URL para um objeto inexistente. Excluir a figurinha passa a danificar o histórico original que a reutiliza.

**Evidência no snapshot atual:**

- `src/components/inbox/chat/MessageBubble.tsx:200–218` — Salvar copia apenas a referência da mensagem, não o arquivo. SHA `da307ba5626d`; blob `c18dd32e97ebbea0e252914a81481ee0c14d7147`.
- `src/hooks/sticker-picker/useStickerPicker.ts:97–101` — Exclusão escolhe explicitamente o bucket whatsapp-media da referência. SHA `da307ba5626d`; blob `3aa36f78b1fbf537623ca556a25bb38de12e3c72`.
- `src/components/inbox/StickerPicker.tsx:87–89` — Grid ligado à exclusão do hook. SHA `da307ba5626d`; blob `6d5b60c026f2ee289cc7b08d588264b352783766`.
- `src/components/inbox/stickers/StickerGrid.tsx:57–61` — Confirmar envia a entrada ao handler. SHA `da307ba5626d`; blob `1a07645b3eae11d7fa4c7038bf1418a0c41d86a3`.
- `src/components/inbox/stickers/StickerGrid.tsx:205–225` — Confirmação diz que a figurinha será removida permanentemente. SHA `da307ba5626d`; blob `1a07645b3eae11d7fa4c7038bf1418a0c41d86a3`.
- `supabase/migrations/20260511233306_0e3f3b66-5585-4762-af6b-549c050f6275.sql:92–97` — Policy DELETE permite administrador/supervisor, mídia atribuída ou própria. SHA `da307ba5626d`; blob `d2e52fffdb9569b4c2b5694ad2ba4b36eac012c1`.
- `src/components/inbox/ImagePreview.tsx:120–151` — Mensagem continua resolvendo seu próprio src, cujo objeto pode ter desaparecido. SHA `da307ba5626d`; blob `76de00c8dede81c06fa8ff859c2f2cef06dc7a4c`.

**Relação anterior.** Nova relação entre dois consumidores, distinta do falso sucesso de salvar em R2-INB-038 e dos erros ignorados de delete em R2-INB-042. Database confirmou não ter finding equivalente e verificou a policy DELETE sem substituição posterior no catálogo.

**Aceite:**

- Biblioteca deve possuir cópia independente ou contrato de referências que impeça apagar objeto ainda usado por mensagem.
- Excluir somente a entrada compartilhada deve preservar leitura do anexo original; purga de todos os usos exige operação explícita e coerente.
- Teste salvar→excluir figurinha precisa verificar que o arquivo da mensagem permanece, além de verificar que a entrada saiu da grade.

**Reprodução offline.** sticker_delete_dangles_message_reference

**Limite.** Execução offline de INSERT extraído e hook real usa Storage/DB simulados com escritas autorizadas. A precondição é a existência da entrada compartilhada; não pressupõe que toda tentativa atual de salvar no balão passe sua policy de INSERT. Manifesto de migrations não atesta configuração viva, e não houve remoção real.

### R2-INB-050 — Importação de mídia e salvamento de áudio gerado deixam objetos órfãos quando a entrada falha

**P2 · confirmado estaticamente.** Catálogo: sem ID específico.

**Causa.** useMediaUpload e handleSaveGenerated enviam objeto antes de INSERT na biblioteca. Se a linha falhar, nenhum remove/reuso durável é executado. O próximo retry gera storagePath novo com timestamp/UUID e repete o upload.

**Consumidor/precondição.** Upload em massa de figurinha/emoji/áudio ou Salvar na Biblioteca após geração IA; Storage aceita o arquivo e o banco rejeita o INSERT.

**Efeito.** O objeto permanece sem entrada utilizável na biblioteca. Repetir a tentativa pode acumular arquivos órfãos, inclusive após um retry finalmente criar a linha.

**Evidência no snapshot atual:**

- `src/components/settings/media-library/useMediaUpload.ts:46–88` — Upload precede INSERT; erro de insert não remove o objeto e próxima tentativa usa caminho novo. SHA `da307ba5626d`; blob `6f0c0a01a34ad1b563655720d30c743955399e40`.
- `src/components/settings/media-library/AIGenerateDialog.tsx:39–55` — Save gerado repete upload antes da linha, sem compensação no catch. SHA `da307ba5626d`; blob `b5c329adff3cae5b1a3f31ff2b4fc48f9164c4f5`.
- `src/components/settings/MediaLibraryAdmin.tsx:37–38` — Hook de upload integrado à lista. SHA `da307ba5626d`; blob `0f7f892e86413211f34e27fd13ffc151eb44a2cd`.
- `src/components/settings/MediaLibraryAdmin.tsx:54–62` — Controles visíveis de upload e geração. SHA `da307ba5626d`; blob `0f7f892e86413211f34e27fd13ffc151eb44a2cd`.

**Relação anterior.** Distinto de R2-INB-043: naquele caso o usuário fecha um preview não confirmado; aqui é falha de persistência depois do upload em dois pipelines administrativos. MOD040 do diálogo IA permanece separado e cobre geração tardia/playback.

**Aceite:**

- Tratar explicitamente resultado parcial e manter identidade/locator para recuperar ou limpar a tentativa não confirmada.
- Erro confirmado de INSERT deve levar a rollback seguro do objeto não referenciado ou a uma fila de limpeza verificável.
- Retry não deve criar nova cópia desnecessária da mesma tentativa; provar objeto/linha após falha e recuperação.

**Reprodução offline.** media_import_insert_failure_keeps_objects

**Limite.** Mocks definem upload aceito e INSERT rejeitado. O toast 0/1 do upload é honesto sobre a quantidade importada; o finding não afirma importação completa fictícia nem custo real medido. Autorizações/dados atuais não foram presumidos.

### R2-INB-051 — Biblioteca de mídia e seletor de stickers limitam catálogo a mil itens sem caminho para os demais

**P2 · confirmado estaticamente.** Catálogo: 3.11.

**Causa.** useMediaLibrary busca as mil entradas mais novas e useStickerPicker busca as mil mais usadas. Busca, categorias e favoritos são filtrados somente nessas amostras; consumidores não oferecem paginação. StatsCards chama de Total de itens/Usos totais os agregados da lista limitada.

**Consumidor/precondição.** Há mais de mil entradas acessíveis de um tipo; o item procurado ou favorito está fora da janela inicial.

**Efeito.** Buscar pelo nome exato pode retornar vazio mesmo com entrada existente; favoritos/categorias fora da janela desaparecem e os totais administrativos subestimam o catálogo. Atualizar repete a mesma janela, sem recuperar o item omitido.

**Evidência no snapshot atual:**

- `src/components/settings/media-library/useMediaLibrary.ts:109–125` — LIMIT1000 e filtro local. SHA `da307ba5626d`; blob `9665b58a6d449dbac5a665f71daa6e1285a0bea0`.
- `src/hooks/sticker-picker/useStickerPicker.ts:26–35` — LIMIT1000 ordenado por uso. SHA `da307ba5626d`; blob `3aa36f78b1fbf537623ca556a25bb38de12e3c72`.
- `src/hooks/sticker-picker/useStickerPicker.ts:104–111` — Busca/favoritos/categorias só sobre a amostra. SHA `da307ba5626d`; blob `3aa36f78b1fbf537623ca556a25bb38de12e3c72`.
- `src/components/settings/media-library/StatsCards.tsx:6–20` — Totais calculados apenas sobre items. SHA `da307ba5626d`; blob `829865403d565869ac5194bee0e4604f625c7368`.
- `src/components/settings/MediaLibraryAdmin.tsx:45–59` — Busca e Atualizar sem paginação remota. SHA `da307ba5626d`; blob `0f7f892e86413211f34e27fd13ffc151eb44a2cd`.
- `src/components/settings/MediaLibraryAdmin.tsx:128–131` — Footer só compara filtered com items limitados. SHA `da307ba5626d`; blob `0f7f892e86413211f34e27fd13ffc151eb44a2cd`.
- `src/components/inbox/StickerPicker.tsx:69–99` — Busca/grade/contagem sem carga adicional. SHA `da307ba5626d`; blob `6d5b60c026f2ee289cc7b08d588264b352783766`.
- `src/components/settings/__tests__/MediaLibraryAdmin.test.tsx:84–101` — Mock devolve lista inteira para limit e não modela truncamento. SHA `da307ba5626d`; blob `4e6d4ee12143ec9de7b1f84d63420d27a023938f`.
- `src/components/settings/__tests__/MediaLibraryAdmin.test.tsx:544–551` — Teste de cardinalidade usa 100 itens, abaixo do limite. SHA `da307ba5626d`; blob `4e6d4ee12143ec9de7b1f84d63420d27a023938f`.

**Relação anterior.** Nova janela de catálogo de ativos. R2-INB-004/005/034 tratam mensagens/conversas/jornada e TRA-011 trata tags; são consultas e consumidores diferentes.

**Aceite:**

- Buscar/filtrar no backend com paginação e indicação de continuidade, preservando seleção por identidade.
- Contadores totais devem vir de agregados completos ou ser explicitamente rotulados como amostra carregada.
- Fixture 1001 deve localizar item/favorito depois da primeira página nas duas interfaces.

**Reprodução offline.** media_catalog_fixed_windows

**Limite.** Probes respeitam limit/order solicitados por código, mas não consultam volume produtivo. A janela administrativa ordena por data, a do picker por uso; não foram confundidas como uma consulta única.

### R2-INB-052 — Figurinhas com referência de bucket privado são renderizadas sem resolver a URL

**P2 · confirmado estaticamente.** Catálogo: 3.11.

**Causa.** A biblioteca aceita referência original de whatsapp-media. StickerGrid e a confirmação usam img src=image_url diretamente, sem o resolvedor que o balão usa. O bucket foi fechado como privado no DDL, e useResolvedStorageUrl reconhece locators public/sign desse bucket e os assina; essa etapa está ausente na grade.

**Consumidor/precondição.** Entrada existente em stickers aponta para locator público legado de whatsapp-media privado, ou URL assinada que já expirou; operador tem acesso à mídia por leitura assinada.

**Efeito.** O sticker pode estar visível corretamente na mensagem e aparecer quebrado na grade/confirmação, porque o navegador recebe a referência crua em vez de URL de leitura vigente. A biblioteca administrativa também usa image_url diretamente para sua miniatura.

**Evidência no snapshot atual:**

- `src/components/inbox/chat/MessageBubble.tsx:209–217` — Entrada conserva a URL original. SHA `da307ba5626d`; blob `c18dd32e97ebbea0e252914a81481ee0c14d7147`.
- `src/components/inbox/stickers/StickerGrid.tsx:125–131` — Grade usa src cru. SHA `da307ba5626d`; blob `1a07645b3eae11d7fa4c7038bf1418a0c41d86a3`.
- `src/components/inbox/stickers/StickerGrid.tsx:211–214` — Confirmação repete src cru. SHA `da307ba5626d`; blob `1a07645b3eae11d7fa4c7038bf1418a0c41d86a3`.
- `src/components/settings/MediaLibraryAdmin.tsx:88–102` — Miniatura administrativa também usa url diretamente. SHA `da307ba5626d`; blob `0f7f892e86413211f34e27fd13ffc151eb44a2cd`.
- `src/components/inbox/ImagePreview.tsx:120–144` — Balão usa resolvedor e refresh para a mesma referência. SHA `da307ba5626d`; blob `76de00c8dede81c06fa8ff859c2f2cef06dc7a4c`.
- `src/hooks/storage/useResolvedStorageUrl.ts:21–55` — Contrato canônico de detecção e assinatura. SHA `da307ba5626d`; blob `fa8a58242a22ce01eecb47bd3e6736d859e98c3f`.
- `src/lib/storage_object_reference.ts:6–16` — whatsapp-media é bucket privado reconhecido. SHA `da307ba5626d`; blob `7edf9e17f861b96f90f2d346132b1e1557a0f97c`.
- `supabase/migrations/20260905030000_private_media_buckets.sql:4–11` — DDL fecha buckets e aponta leitura assinada como contrato. SHA `da307ba5626d`; blob `c41b2b36dac8a88953f75985a6c9f46b9ddb70ce`.

**Relação anterior.** Nova integração de referência privada no catálogo de stickers. TC-001 anterior trata renderer/contratos de mídia do Team Chat e não é reutilizado como prova desta grade.

**Aceite:**

- Usar resolvedor/cópia dedicada também nos consumidores do catálogo, mantendo locator durável e renovação por erro/expiração.
- Mesmo sticker em balão, picker, confirmação e biblioteca deve renderizar para usuário autorizado sem abrir bucket ao público.
- Provar URL pública legada e URL assinada expirada, com feedback de erro recuperável.

**Reprodução offline.** private_sticker_grid_skips_resolution

**Limite.** Assinatura/parser foram exercitados localmente; não houve request HTTP de imagem nem medição de códigos de erro. A condição privada vem do contrato versionado, não de consulta ao Storage vivo. Não afirma falha outbound: backend pode resolver a referência antes de enviar.

### R2-INB-053 — Reclassificação de mídia não conta erros retornados pela função e limpa a seleção

**P2 · confirmado estaticamente.** Catálogo: sem ID específico.

**Causa.** handleBulkReclassify desestrutura somente data do invoke. {data:null,error} não entra no catch nem incrementa errors. Ao final, errors=0 leva a toast.success e a seleção é zerada, igual ao caso legítimo em que nenhuma categoria mudou.

**Consumidor/precondição.** Reclassificar IA de um ou mais itens na biblioteca; Edge Function devolve erro resolvido pelo cliente Supabase, em vez de lançar.

**Efeito.** Falha de classificação aparece como 0/N itens reclassificados com IA, sem indicar erro; os itens deixam de estar selecionados para retry. O operador não consegue distinguir indisponibilidade do classificador de categorias já corretas.

**Evidência no snapshot atual:**

- `src/components/settings/media-library/useMediaLibrary.ts:174–195` — error de invoke não é lido; catch cobre só throw; seleção sempre limpa. SHA `da307ba5626d`; blob `9665b58a6d449dbac5a665f71daa6e1285a0bea0`.
- `src/components/settings/MediaLibraryAdmin.tsx:65–71` — Ação de seleção chama esse handler. SHA `da307ba5626d`; blob `0f7f892e86413211f34e27fd13ffc151eb44a2cd`.
- `src/components/settings/__tests__/MediaLibraryAdmin.test.tsx:1661–1681` — Teste de contagem reimplementa algoritmo sobre fixtures success/changed sem chamar o hook. SHA `da307ba5626d`; blob `4e6d4ee12143ec9de7b1f84d63420d27a023938f`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Contabilizar error explícito de invoke e apresentar resultado por item ou lista de falhas recuperável.
- Conservar seleção dos itens que falharam, separando sem mudança de classificação indisponível.
- Teste do hook deve devolver {data:null,error} e verificar contagem/feedback, além de rejeição lançada.

**Reprodução offline.** library_reclassify_errors_not_counted

**Limite.** O contador observado é 0/N; não se afirma que a UI anunciouN/N alterações. A falha é omitir a classe de erro e perder seleção. Backend/classificador real não foi chamado.

### R2-INB-054 — Editar resposta rápida reutiliza o formulário anterior e pode gravá-lo em outro template

**P2 · confirmado estaticamente.** Catálogo: 2.32.

**Causa.** QuickReplyDialog inicializa formData uma única vez a partir de editingTemplate. O comentário de sincronização não tem efeito correspondente. QuickRepliesManager mantém o componente montado sem key quando fecha ou troca o template, e handleSubmit usa o ID atual com os campos antigos.

**Consumidor/precondição.** Configurações → Mensagens, com QuickRepliesManager não compacto. Na mesma montagem, abrir Editar, preencher ou salvar A, fechar e abrir B; a primeira edição após montagem também começa com o formulário vazio inicial.

**Efeito.** A edição não apresenta os dados do registro escolhido. Ao salvar B, o callback de update recebe o ID de B com o título/conteúdo ainda pertencentes ao formulário de A, permitindo sobrescrever B.

**Evidência no snapshot atual:**

- `src/components/inbox/quick-replies/QuickReplyDialog.tsx:20–35` — Estado inicial não acompanha editingTemplate; submit combina ID atual e formData retido. SHA `da307ba5626d`; blob `c05102453430abb6d44b7ce01e5fe7bcb85e23ba`.
- `src/components/inbox/QuickRepliesManager.tsx:29–31` — O primeiro render fornece editingTemplate=null. SHA `da307ba5626d`; blob `5d247dbc7921dc42d7dee3d7890ef50c39865f34`.
- `src/components/inbox/QuickRepliesManager.tsx:60–60` — Fechamento limpa apenas o alvo/abertura no pai. SHA `da307ba5626d`; blob `5d247dbc7921dc42d7dee3d7890ef50c39865f34`.
- `src/components/inbox/QuickRepliesManager.tsx:111–124` — Editar muda prop; diálogo permanece montado sem key. SHA `da307ba5626d`; blob `5d247dbc7921dc42d7dee3d7890ef50c39865f34`.
- `src/components/inbox/quick-replies/QuickReplyCardList.tsx:98–102` — Ação Editar alcançável por template. SHA `da307ba5626d`; blob `7169bda549f6c76957acc0017759700a27f601ae`.
- `src/components/settings/SettingsView.tsx:138–144` — Consumidor ativo monta o modo não compacto. SHA `da307ba5626d`; blob `c576115115689b975b3897df601519e09de34f53`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Abrir edição deve carregar os campos do template escolhido; abrir criação deve usar um formulário novo.
- Definir explicitamente como conservar um rascunho sem transferi-lo para outro ID.
- Teste do consumidor deve abrir A e B sucessivamente sem remontar o manager e verificar o payload enviado a cada ID.

**Reprodução offline.** quick_reply_dialog_stale_target

**Limite.** Probe executa estado/handler reais com fronteira de update local. Prova o payload destinado a B; não escreve no banco nem mede incidência produtiva. Remontar o diálogo com B como controle inicial carrega os dados corretos.

### R2-INB-055 — Filtro de grupos remove o hífen que sua própria expressão exige

**P2 · confirmado estaticamente.** Catálogo: 2.6.

**Causa.** isGroup remove todos os caracteres não numéricos e depois testa uma expressão que exige um hífen entre dois grupos de dígitos. O predicado fica falso para qualquer entrada, e todas as categorias de grupo dependem dele.

**Consumidor/precondição.** Uma conversa de grupo já está presente no conjunto carregado. O usuário seleciona Todos os Grupos ou uma subcategoria no filtro de tipo; também afeta Chats Individuais.

**Efeito.** Todas as opções de grupos retornam uma lista vazia. Chats Individuais inclui as conversas de grupo, porque usa a negação do mesmo predicado.

**Evidência no snapshot atual:**

- `src/components/inbox/ContactTypeFilter.tsx:29–30` — Normalização destrói o separador obrigatório da regex. SHA `da307ba5626d`; blob `e930b55f4f5eb28a35e1bea0bb205a0420617f09`.
- `src/components/inbox/ContactTypeFilter.tsx:40–92` — Categorias individuais e de grupo compartilham esse predicado. SHA `da307ba5626d`; blob `e930b55f4f5eb28a35e1bea0bb205a0420617f09`.
- `src/hooks/inbox/useInboxFilters.ts:164–165` — Filtro real da Inbox aplica filterByContactType. SHA `da307ba5626d`; blob `cc80d5db7b34aca33a10460213b6d87176bebf6b`.
- `src/components/inbox/InboxFilters.tsx:174–193` — As opções estão disponíveis na interface ativa. SHA `da307ba5626d`; blob `8518c3824fd2754d2c5517d7206669adababb359`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Classificar grupo por identidade/tipo canônico compatível com a representação dos contatos.
- Cobrir grupo com hífen, contato individual e todas as subcategorias sem depender de fixture apenas numérica.
- O contador/lista resultante deve corresponder ao tipo selecionado.

**Reprodução offline.** group_filter_removes_required_hyphen

**Limite.** O predicado é determinístico, e a fixture explicita um grupo previamente carregado. Não afirma quantos grupos existem ou estão acessíveis no serviço atual.

### R2-INB-056 — Contador Em atendimento e badge de responsável comparam auth ID com profile ID

**P2 · confirmado estaticamente.** Catálogo: 2.1, 2.6.

**Causa.** StatusChips compara assigned_to com user.id da sessão. VirtualizedRealtimeList passa a mesma identidade Auth para decidir se o badge representa outro atendente. O contrato de contacts.assigned_to referencia profiles.id, enquanto o filtro real de atendimento usa profileId.

**Consumidor/precondição.** Usuário tem profiles.id diferente do auth user.id e há uma conversa atribuída ao seu perfil. O schema permite identidades distintas; não se pressupõe que todas as contas produtivas já satisfaçam essa condição.

**Efeito.** O chip Em atendimento pode mostrar zero enquanto o filtro correspondente contém a conversa. A lista também pode exibir o próprio responsável como se fosse outro atendente.

**Evidência no snapshot atual:**

- `src/components/inbox/conversation-list/StatusChips.tsx:24–46` — Contagem de atendimento usa user.id. SHA `da307ba5626d`; blob `516ed68982337cd006948a28b0f8050f1c796a8e`.
- `src/components/inbox/VirtualizedRealtimeList.tsx:107–109` — Identidade obtida da sessão Auth. SHA `da307ba5626d`; blob `b3915f3134da36acc8bf2f84dc1a671416a1d6eb`.
- `src/components/inbox/VirtualizedRealtimeList.tsx:243–243` — user.id segue como currentUserId ao item. SHA `da307ba5626d`; blob `b3915f3134da36acc8bf2f84dc1a671416a1d6eb`.
- `src/components/inbox/VirtualizedRealtimeList.tsx:317–318` — Condição compara assigned_to com identidade Auth. SHA `da307ba5626d`; blob `b3915f3134da36acc8bf2f84dc1a671416a1d6eb`.
- `src/components/inbox/VirtualizedRealtimeList.tsx:420–435` — Badge usa a condição de responsável diferente. SHA `da307ba5626d`; blob `b3915f3134da36acc8bf2f84dc1a671416a1d6eb`.
- `src/hooks/inbox/useInboxFilters.ts:88–91` — Filtro correto compara com profileId. SHA `da307ba5626d`; blob `cc80d5db7b34aca33a10460213b6d87176bebf6b`.
- `src/integrations/supabase/types.ts:2308–2312` — FK gerada: assigned_to referencia profiles.id. SHA `da307ba5626d`; blob `f641f0d8bd81656165019ced14cf862be7eac489`.
- `src/integrations/supabase/types.ts:6054–6077` — Profile possui campos id e user_id separados. SHA `da307ba5626d`; blob `f641f0d8bd81656165019ced14cf862be7eac489`.
- `src/components/inbox/__tests__/StatusChips.test.tsx:6–8` — Teste fixa Auth user-1. SHA `da307ba5626d`; blob `80c01e2750da240ea311c81d9f31d0df35b5f5e0`.
- `src/components/inbox/__tests__/StatusChips.test.tsx:25–29` — Fixture atribui ao mesmo ID, ocultando a diferença. SHA `da307ba5626d`; blob `80c01e2750da240ea311c81d9f31d0df35b5f5e0`.

**Relação anterior.** Nova falha no consumidor Inbox. O achado anterior DASH-SQL-REGRESSION-001 já incluía assigned_to=auth.uid em dashboard_contact_counts; é outro corpo e outro consumidor. AUTH011 trata visibilidade de metadados de colegas, não esta comparação de identidade.

**Aceite:**

- Usar profile.id de maneira uniforme nos filtros, contadores e comparação do responsável.
- Definir o estado enquanto o perfil ainda não foi resolvido.
- Testar uma sessão com auth ID e profile ID diferentes e conferir chip, resultado e badge em conjunto.

**Reprodução offline.** status_chip_uses_auth_id_for_profile_fk

**Limite.** Probe executa a contagem e a condição de badge reais. Não cria perfis nem consulta IDs produtivos. Igualar as identidades na fixture é um controle positivo e explica por que o teste atual passa.

### R2-INB-057 — VoiceChangerPicker mantém ou inicia captura depois de fechar ou desmontar

**P1 · confirmado estaticamente.** Catálogo: 4.1, 3.4.

**Causa.** O componente tem cleanup que para tracks, porém só o chama no fechamento explícito do Popover. Não há efeito de desmontagem. startRecording também aguarda getUserMedia sem verificar geração, montagem ou abertura antes de armazenar o stream e iniciar MediaRecorder.

**Consumidor/precondição.** Transformador de voz do Composer: iniciar gravação e trocar de contato, desmontando ChatPanel por key; ou fechar o popover enquanto a permissão está pendente e concedê-la depois.

**Efeito.** A captura pode permanecer ativa com a interface desmontada ou começar após o popover já estar fechado. O usuário perde o controle visível para interromper esse stream.

**Evidência no snapshot atual:**

- `src/components/inbox/VoiceChangerPicker.tsx:1–1` — Imports React não incluem efeito de cleanup. SHA `da307ba5626d`; blob `8c02944bb93ab12de5951377ca93c59535eb86fc`.
- `src/components/inbox/VoiceChangerPicker.tsx:62–97` — cleanup existe, mas await getUserMedia não tem validação de ciclo antes de iniciar captura. SHA `da307ba5626d`; blob `8c02944bb93ab12de5951377ca93c59535eb86fc`.
- `src/components/inbox/VoiceChangerPicker.tsx:185–190` — Limpeza é ligada ao fechamento explícito, não ao unmount. SHA `da307ba5626d`; blob `8c02944bb93ab12de5951377ca93c59535eb86fc`.
- `src/components/inbox/chat/ChatInputToolbars.tsx:59–61` — Transformador montado no Composer. SHA `da307ba5626d`; blob `574d864f2b373d7ff3c932b8b355d267d8c0cd6c`.
- `src/components/inbox/RealtimeInboxView.tsx:298–301` — Troca de contato remonta ChatPanel por key. SHA `da307ba5626d`; blob `3d6dacf92511e917426345a7f390dbe408d1ce1b`.

**Relação anterior.** Outro gravador e outra causa em relação a R2-INB-008: AudioRecorder tem cleanup com closure antiga; VoiceChangerPicker não registra cleanup de desmontagem e não invalida a permissão pendente. Não reconta VOL-01 do AudioContext de reprodução.

**Aceite:**

- Garantir liberação idempotente de recorder e tracks na desmontagem e no descarte explícito.
- Depois de getUserMedia resolver, validar geração/montagem/abertura e interromper imediatamente qualquer stream já obsoleto.
- Cobrir falha do construtor, fechamento com permissão pendente e troca de contato durante gravação, sem deixar handlers antigos ressuscitarem estado.

**Reprodução offline.** voice_picker_unmount_keeps_stream, voice_picker_permission_resolves_after_close

**Limite.** Tracks e MediaRecorder são sintéticos; não houve permissão ou microfone físico. A prova usa o corpo real sem efeito e o callback literal onOpenChange. A remoção do componente por key não chama automaticamente o callback de fechamento do popover.

### R2-INB-058 — Áudio gerado e voz transformada descartam a prévia antes do resultado do envio

**P2 · confirmado estaticamente.** Catálogo: 3.4, 4.5.

**Causa.** TextToAudioButton e VoiceChangerPicker tipam seus callbacks de envio como void e não aguardam o consumidor assíncrono. Ambos limpam blob/URL, fecham e anunciam sucesso enquanto o envio no pai ainda está pendente.

**Consumidor/precondição.** Usuário gera áudio a partir de texto ou transforma uma gravação e clica Enviar. O upload/conversão já terminou, mas o envio posterior demora e falha, incluindo rejeição antes do enqueue.

**Efeito.** A interface confirma envio e remove a prévia que permitiria tentar novamente. O erro posterior do pai contradiz o sucesso, sem recuperar o áudio gerado.

**Evidência no snapshot atual:**

- `src/components/inbox/TextToAudioButton.tsx:14–17` — Callback onAudioReady é void. SHA `da307ba5626d`; blob `6252c98509dafdd868fe59bc37c5118ae849ecd6`.
- `src/components/inbox/TextToAudioButton.tsx:29–41` — cleanup descarta prévia/blob. SHA `da307ba5626d`; blob `6252c98509dafdd868fe59bc37c5118ae849ecd6`.
- `src/components/inbox/TextToAudioButton.tsx:109–115` — Callback não aguardado, fechamento e sucesso imediatos. SHA `da307ba5626d`; blob `6252c98509dafdd868fe59bc37c5118ae849ecd6`.
- `src/components/inbox/VoiceChangerPicker.tsx:42–44` — Callback onSendAudio é void. SHA `da307ba5626d`; blob `8c02944bb93ab12de5951377ca93c59535eb86fc`.
- `src/components/inbox/VoiceChangerPicker.tsx:162–184` — Após upload, envia sem await, limpa e mostra sucesso. SHA `da307ba5626d`; blob `8c02944bb93ab12de5951377ca93c59535eb86fc`.
- `src/components/inbox/chat/ChatInputToolbars.tsx:59–79` — Os produtores usam callbacks do Composer. SHA `da307ba5626d`; blob `574d864f2b373d7ff3c932b8b355d267d8c0cd6c`.
- `src/components/inbox/ChatPanel.tsx:288–297` — Ponte fornece handlers assíncronos. SHA `da307ba5626d`; blob `f2561bc99f053782ac17f2769ea34fe262d9d8f8`.
- `src/components/inbox/chat/useChatPanelHandlers.ts:270–275` — Pai aguarda envio e captura falha só depois. SHA `da307ba5626d`; blob `2aee00c55c477c48c92e13a7cabf62f3bd513da9`.
- `src/components/inbox/useChatMediaSending.ts:119–133` — Voz transformada chega a envio assíncrono que também pode falhar. SHA `da307ba5626d`; blob `0971cdcf93610ede183103e7cc195f5582689052`.

**Relação anterior.** Novos produtores com contrato void. R2-INB-010 cobre agendamento; R2-INB-022 cobre o gravador comum. A aceitação necessária é semelhante, mas os callbacks que precisam de correção são distintos.

**Aceite:**

- Propagar um resultado assíncrono explícito até cada produtor de áudio.
- Conservar blob e prévia durante pendência e falha; limpar somente após aceite ou descarte solicitado.
- Reusar identidade/objeto quando o resultado do envio for incerto e impedir cliques duplicados enquanto aguarda.

**Reprodução offline.** generated_tts_send_before_outbound, transformed_voice_send_before_outbound

**Limite.** Fronteiras de conversão, fetch, Storage e transporte foram simuladas. A perda demonstrada é a prévia de áudio; o texto original pode continuar no editor. Não se afirma que todo erro posterior deixa objeto órfão ou que o provedor recebeu uma mensagem.

### R2-INB-059 — Miniatura com assinatura em lote não consegue renovar a URL que falha

**P2 · confirmado estaticamente.** Catálogo: 2.26, 2.36.

**Causa.** Quando item.signedUrl existe, ThumbImage e FileDetailContent chamam useResolvedStorageUrl com string vazia e preferem sempre item.signedUrl no src. O refresh ligado ao erro não recebe o locator original e retorna vazio. A consulta fornece assinaturas de uma hora, sem renovação automática por expiresAt no consumidor.

**Consumidor/precondição.** Aba Arquivos carregou imagem privada com assinatura em lote. A assinatura expira ou é invalidada antes de outra atualização da consulta, e o navegador precisa buscar a imagem novamente ou a carrega pela primeira vez depois disso.

**Efeito.** O handler de recuperação não solicita nova assinatura e mantém a URL defeituosa; a imagem cai no estado indisponível apesar de o locator e a permissão de leitura poderem continuar válidos.

**Evidência no snapshot atual:**

- `src/components/inbox/tabs/FileThumb.tsx:87–115` — Assinatura em lote desativa source do resolver; onError chama seu refresh. SHA `da307ba5626d`; blob `eca45212b17eb0a4b74b6d46767b77e489f7f033`.
- `src/components/inbox/tabs/FileDetailPanel.tsx:25–30` — Detalhes repetem source vazio e preferência por signedUrl. SHA `da307ba5626d`; blob `1063db9f0cccd2da72e125fa2fd253c36fd83638`.
- `src/components/inbox/tabs/FileDetailPanel.tsx:49–51` — Falha chama refresh sem locator. SHA `da307ba5626d`; blob `1063db9f0cccd2da72e125fa2fd253c36fd83638`.
- `src/hooks/storage/useResolvedStorageUrl.ts:47–59` — Sem referência reconhecida, refresh retorna source sem assinar. SHA `da307ba5626d`; blob `fa8a58242a22ce01eecb47bd3e6736d859e98c3f`.
- `src/hooks/chat/useContactMedia.ts:66–66` — TTL das assinaturas em lote é uma hora. SHA `da307ba5626d`; blob `dd62b290ce7572ee7cc76e3b0b2019402fc02942`.
- `src/hooks/chat/useContactMedia.ts:154–188` — signInBatch cria as URLs de leitura. SHA `da307ba5626d`; blob `dd62b290ce7572ee7cc76e3b0b2019402fc02942`.
- `src/hooks/chat/useContactMedia.ts:263–285` — Itens recebem signedUrl/expiresAt; staleTime não é intervalo de renovação. SHA `da307ba5626d`; blob `dd62b290ce7572ee7cc76e3b0b2019402fc02942`.
- `src/components/inbox/tabs/__tests__/FileThumb.test.tsx:15–17` — Mock do resolver ignora argumento. SHA `da307ba5626d`; blob `9001744655a2101c973fe5e23eeaf01921e19cd9`.
- `src/components/inbox/tabs/__tests__/FileThumb.test.tsx:69–99` — Teste de refresh bem-sucedido não fornece signedUrl em lote. SHA `da307ba5626d`; blob `9001744655a2101c973fe5e23eeaf01921e19cd9`.

**Relação anterior.** Contrato distinto de R2-INB-033, que trata refresh tardio de A após mudar a referência para B. Este defeito aparece em um único item que já recebeu signedUrl.

**Aceite:**

- Manter o locator original disponível para renovar assinatura em lote ou individualmente.
- Uma URL renovada deve substituir o src antigo e limpar estado de erro.
- Testar item com signedUrl presente, expiração/falha, renovação bem-sucedida e ausência de loop de refresh.

**Reprodução offline.** batch_signed_thumbnail_cannot_refresh

**Limite.** Erro de imagem é injetado; nenhum HTTP de Storage foi executado. Não se afirma que imagem já completamente carregada desaparece no instante em que a URL expira. O controle sem assinatura em lote renova corretamente com o resolver real.

### R2-INB-060 — Detalhes de arquivo conservam o erro da imagem anterior ao selecionar outro item

**P2 · confirmado estaticamente.** Catálogo: 2.26, 2.36.

**Causa.** FileDetailContent mantém hasError em estado local inicializado uma vez e o define como true em onError, sem reset por item/src. FilesTab troca selected dentro da mesma instância de detalhes sem key por arquivo.

**Consumidor/precondição.** Na mesma conversa e painel de detalhes, a imagem A falha e o usuário seleciona B, cuja URL é válida. O caminho largo com detalhes inline conserva essa montagem.

**Efeito.** B fica com placeholder de erro em vez da imagem válida. Fechar/remontar o painel recupera a apresentação, mas selecionar outro arquivo não limpa o erro.

**Evidência no snapshot atual:**

- `src/components/inbox/tabs/FileDetailPanel.tsx:25–30` — Estado hasError não depende da identidade do item. SHA `da307ba5626d`; blob `1063db9f0cccd2da72e125fa2fd253c36fd83638`.
- `src/components/inbox/tabs/FileDetailPanel.tsx:42–56` — O ramo de imagem depende de hasError e onError o torna true. SHA `da307ba5626d`; blob `1063db9f0cccd2da72e125fa2fd253c36fd83638`.
- `src/components/inbox/tabs/FilesTab.tsx:285–287` — Seleção de detalhes troca selected. SHA `da307ba5626d`; blob `de1d14e73e67927d6503cc87c4ac58cd3b507872`.
- `src/components/inbox/tabs/FilesTab.tsx:305–314` — Instância inline recebe novo item sem key por arquivo. SHA `da307ba5626d`; blob `de1d14e73e67927d6503cc87c4ac58cd3b507872`.

**Relação anterior.** Separado da assinatura vazia de R2-INB-059 e do refresh concorrente de R2-INB-033: a causa é estado de erro do componente preservado entre arquivos.

**Aceite:**

- Associar erro à identidade/URL que falhou ou reiniciar estado quando item/src mudar.
- A renovação bem-sucedida também deve permitir renderizar novamente.
- Testar A com erro seguido de B válido no mesmo painel sem desmontagem.

**Reprodução offline.** file_detail_error_persists_into_next_item

**Limite.** Probe usa estado, resolver e onError reais sem DOM/HTTP. A fixture usa URLs públicas para isolar a falha de estado de qualquer assinatura. Não atravessa o key de contato do painel principal.

### R2-INB-061 — Falha ao carregar scoring habilita salvar defaults sobre dados existentes

**P2 · confirmado estaticamente.** Catálogo: 2.5.

**Causa.** LeadRiskScorePanel inicia scores em zero e origem/consentimento vazios. O SELECT ignora error e define loaded=true mesmo sem dados. O botão Salvar continua disponível, e save envia todos os campos, inclusive os defaults que nunca foram carregados.

**Consumidor/precondição.** O mesmo contato já possui scores/consentimento. A leitura falha transitoriamente; o usuário altera apenas um campo e salva quando a escrita já pode ser aceita. A troca de contato é protegida pelo key da view e não é a precondição do achado.

**Efeito.** Campos existentes não carregados podem ser substituídos por zero ou null ao salvar uma edição parcial. A interface não distingue estado real vazio de falha de carregamento.

**Evidência no snapshot atual:**

- `src/components/inbox/LeadRiskScorePanel.tsx:27–46` — Defaults seguidos de loaded=true sem tratar error da consulta. SHA `da307ba5626d`; blob `83a51feb50aeb669436d9975340e1572d9515059`.
- `src/components/inbox/LeadRiskScorePanel.tsx:54–67` — Save envia todos os campos do estado. SHA `da307ba5626d`; blob `83a51feb50aeb669436d9975340e1572d9515059`.
- `src/components/inbox/LeadRiskScorePanel.tsx:138–146` — Botão de salvar depende de saving, não de leitura válida. SHA `da307ba5626d`; blob `83a51feb50aeb669436d9975340e1572d9515059`.
- `src/components/inbox/contact-details/ContactAccordionSections.tsx:108–114` — Painel ativo no accordion de scoring. SHA `da307ba5626d`; blob `97f3a98d20dc468cb4b8c54fe79f1d3fa35f24ed`.
- `src/components/inbox/RealtimeInboxView.tsx:338–344` — Key por contato afasta hipótese genérica de estado A→B. SHA `da307ba5626d`; blob `3d6dacf92511e917426345a7f390dbe408d1ce1b`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Tratar falha de leitura como erro recuperável e impedir salvar valores que não foram carregados.
- Enviar somente campos efetivamente editados quando o contrato admitir patch parcial.
- Testar SELECT com error seguido de escrita autorizada no mesmo contato, preservando os valores não alterados.

**Reprodução offline.** lead_score_failed_load_writes_defaults

**Limite.** Banco é um modelo local com falha de leitura e escrita posterior autorizada. Não demonstra dados reais nem faz afirmação jurídica sobre consentimento. A hipótese de mistura entre contatos foi rejeitada após conferir a montagem por key.

### R2-INB-062 — Controle Recentes do administrador de figurinhas não muda a coleção

**P3 · confirmado estaticamente.** Catálogo: 3.11.

**Causa.** StickerManager altera showRecent e o fornece ao indicador visual de StickerCategoryBar, mas filteredStickers depende somente de favorito, categoria e busca. A consulta/ordem e a grade não consomem showRecent.

**Consumidor/precondição.** Configurações → Mídia → administrador de figurinhas compartilhadas. Usuário alterna o controle Recentes.

**Efeito.** O controle muda de estado visual, porém a mesma coleção e ordem continuam na grade; não há efeito de filtro ou ordenação por recência.

**Evidência no snapshot atual:**

- `src/components/inbox/stickers/StickerManager.tsx:28–31` — Estado showRecent inicializado. SHA `da307ba5626d`; blob `77141cad892057b8dad0503ac72c1e9562e46355`.
- `src/components/inbox/stickers/StickerManager.tsx:81–87` — Filtro ignora showRecent. SHA `da307ba5626d`; blob `77141cad892057b8dad0503ac72c1e9562e46355`.
- `src/components/inbox/stickers/StickerManager.tsx:149–157` — Toggle afeta apenas estado passado à barra. SHA `da307ba5626d`; blob `77141cad892057b8dad0503ac72c1e9562e46355`.
- `src/components/inbox/stickers/StickerManager.tsx:176–184` — Grade recebe somente filteredStickers. SHA `da307ba5626d`; blob `77141cad892057b8dad0503ac72c1e9562e46355`.
- `src/components/inbox/stickers/StickerCategoryBar.tsx:46–58` — Controle Recentes indica seleção. SHA `da307ba5626d`; blob `479b85378745ab17e376d1cfafbc25393601bd69`.
- `src/components/settings/SettingsView.tsx:188–194` — Consumidor administrativo alcançável. SHA `da307ba5626d`; blob `c576115115689b975b3897df601519e09de34f53`.

**Relação anterior.** Nova ação sem efeito no administrador. R2-INB-051 trata janela máxima do catálogo; a coleção deste cenário pode ser pequena e inteiramente carregada.

**Aceite:**

- Definir recência com campo apropriado e ligar o controle ao filtro/ordem correspondentes.
- Alternar Recentes/Todas deve produzir resultado coerente e contagem clara.
- Cobrir o administrador separadamente do picker principal, que tem lógica própria.

**Reprodução offline.** sticker_manager_recent_toggle_no_effect

**Limite.** A fixture substitui a consulta e executa o estado/filter reais. Não se afirma que StickerPicker principal tenha a mesma falha nem se impõe recência por uso sem decisão de produto.

### R2-INB-063 — Card de resposta rápida anuncia cópia sem escrever no clipboard

**P2 · confirmado estaticamente.** Catálogo: 2.32.

**Causa.** O clique principal do card chama handleSelect, que incrementa uso, invoca onSelect opcional e mostra Resposta copiada. Em Configurações o manager não recebe onSelect, e esse handler não escreve no clipboard. O botão específico Copiar usa outro handler.

**Consumidor/precondição.** Configurações → Mensagens → clicar no corpo de uma resposta rápida, em vez do ícone dedicado Copiar.

**Efeito.** A UI anuncia cópia, mas o clipboard conserva o conteúdo anterior. Colar em seguida não produz a resposta escolhida.

**Evidência no snapshot atual:**

- `src/components/inbox/QuickRepliesManager.tsx:33–42` — handleSelect não acessa clipboard; handleCopy é uma rota separada. SHA `da307ba5626d`; blob `5d247dbc7921dc42d7dee3d7890ef50c39865f34`.
- `src/components/inbox/QuickRepliesManager.tsx:111–113` — Manager liga o clique principal a handleSelect. SHA `da307ba5626d`; blob `5d247dbc7921dc42d7dee3d7890ef50c39865f34`.
- `src/components/inbox/quick-replies/QuickReplyCardList.tsx:69–77` — Corpo do card executa onSelect. SHA `da307ba5626d`; blob `7169bda549f6c76957acc0017759700a27f601ae`.
- `src/components/inbox/quick-replies/QuickReplyCardList.tsx:95–97` — Ícone específico usa onCopy e para propagação. SHA `da307ba5626d`; blob `7169bda549f6c76957acc0017759700a27f601ae`.
- `src/components/settings/SettingsView.tsx:138–144` — Configurações não fornece onSelect ao manager. SHA `da307ba5626d`; blob `c576115115689b975b3897df601519e09de34f53`.

**Relação anterior.** Lacuna nova identificada nesta reauditoria; não corresponde a um achado específico de Inbox entre os 104 registros anteriores. A presença estrutural do arquivo no inventário anterior não foi tratada como revisão semântica de cada função.

**Aceite:**

- Fazer o clique cumprir a ação comunicada e confirmar a escrita no clipboard antes de anunciar sucesso.
- Separar feedback de inserção no Composer e de cópia em Configurações conforme o consumidor.
- Cobrir ausência de onSelect, falha de clipboard e distinção entre corpo do card e ícone.

**Reprodução offline.** quick_reply_card_reports_copy_without_clipboard

**Limite.** Clipboard é um array local; nenhum dado real foi copiado. O controle do ícone prova que ele solicita writeText, não que toda implementação/permissão do clipboard sempre aceitará a cópia.

### R2-INB-064 — Ações de alertas de sentimento não oferecem navegação para a conversa

**P2 · confirmado estaticamente.** Catálogo: 5.4, 20.11.

**Causa.** O toast local de useSentimentAlerts oferece Ver conversa, mas seu onClick apenas registra contactId em log. O toast global de useRealtimeSentimentAlerts oferece Ver detalhes e tenta clicar em [value="ai"], sem navegar ou usar contact_id quando o elemento não existe.

**Consumidor/precondição.** Variante local: análise válida em AIConversationAssistant recebe alerted=true e notifyCaller não falso, vence o dedupe e mostra o toast. Variante global: alerta realtime chega enquanto a aplicação está em uma tela sem elemento [value="ai"], como o recorte de Inbox fora do Dashboard; contato alertado pode ser diferente do selecionado.

**Efeito.** O clique não abre nem foca a conversa alertada. No caminho local só produz log; no global sem alvo DOM retorna sem ação ou feedback. A existência de uma aba dinâmica ai no Dashboard não fornece um destino de conversa às outras telas.

**Evidência no snapshot atual:**

- `src/hooks/inbox/useSentimentAlerts.ts:55–71` — Toast local ativo tem onClick limitado a log.debug. SHA `da307ba5626d`; blob `f0de5862d5eedd0b1e30d188835698ba4c37568d`.
- `src/components/inbox/AIConversationAssistant.tsx:172–183` — Análise válida chama o hook de alerta. SHA `da307ba5626d`; blob `374f129a2b95556b16b26ad1c21a0c5332b328ac`.
- `src/components/inbox/chat/ChatToolPanels.tsx:28–35` — Assistant é montado pela ferramenta Visão no chat. SHA `da307ba5626d`; blob `260912458fe5ea5e59e80d1cae767e5b60dec0c1`.
- `src/hooks/inbox/useRealtimeSentimentAlerts.ts:50–69` — Ação global usa apenas querySelector/click e não contact_id. SHA `da307ba5626d`; blob `a31268015f367b726c7a2baec21b4e0d8dd36615`.
- `src/hooks/inbox/useRealtimeSentimentAlerts.ts:93–115` — Assinatura realtime autenticada entrega o alerta. SHA `da307ba5626d`; blob `a31268015f367b726c7a2baec21b4e0d8dd36615`.
- `src/components/notifications/RealtimeSentimentAlertProvider.tsx:4–10` — Provider executa o hook global. SHA `da307ba5626d`; blob `606cecdeecbe91b939f2dfa7d99d5e6f2833540f`.
- `src/App.tsx:52–64` — Provider é overlay independente da tela. SHA `da307ba5626d`; blob `4328fcf14cd3765f0cbda0a426a068a21ebc958a`.
- `src/App.tsx:123–143` — DeferredProviders permanece fora da seleção de AppRoutes. SHA `da307ba5626d`; blob `4328fcf14cd3765f0cbda0a426a068a21ebc958a`.
- `src/pages/ViewRouter.tsx:44–58` — Inbox, Dashboard e Sentimento são views distintas. SHA `da307ba5626d`; blob `9964a4ea364a29ff6a59c5e49e199c2eeab22ec9`.
- `src/pages/ViewRouter.tsx:141–155` — Só a view selecionada é montada. SHA `da307ba5626d`; blob `9964a4ea364a29ff6a59c5e49e199c2eeab22ec9`.
- `src/components/dashboard/DashboardView.tsx:48–62` — A aba ai existe dinamicamente no Dashboard, com escopo de papel. SHA `da307ba5626d`; blob `1a89a0f309bbc5aaeae9f03761faadd7e61715ab`.
- `src/components/dashboard/overview/DashboardTabs.tsx:25–31` — TabsTrigger recebe value dinâmico; não foi alegada ausência universal do produtor. SHA `da307ba5626d`; blob `83b57d6bc0cbb2e822721a9fc718c7f73e0e5081`.

**Relação anterior.** Nova ação de alerta não coberta pelos IDs de métricas/estado saudável de Infra, conforme conferência com o revisor. TRA-011 e AUTH038 permanecem separados. Nenhum achado é criado para alegar ausência universal da aba ai.

**Aceite:**

- Conectar as ações ao contrato de navegação/seleção de contato e a um destino de detalhe acessível para o papel atual.
- Definir feedback quando o contato/detalhe não puder ser acessado, sem depender da presença incidental de um elemento DOM.
- Cobrir alerta recebido fora do Dashboard, outro contato selecionado, caminho local e navegação negada por permissão.

**Reprodução offline.** sentiment_actions_without_conversation_navigation

**Limite.** Probe usa hooks/callbacks reais e DOM mínimo com caso sem alvo e controle com alvo clicável. Não renderiza Radix, não prova qual atributo DOM concreto ele expõe e não declara que o botão do Dashboard sempre falha. Serviços de análise/alertas são simulados.

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

### Terceira passagem: communication

O lote fechou os corpos dos oito hooks solicitados e os contratos diretos do Composer/VoiceOverlay. Os 39 achados e 28 probes anteriores ficaram preservados; foram acrescentados nove achados e 13 casos offline, dos quais dois são controles positivos. Os 13 arquivos do runner têm pins do mesmo manifesto e os dois controles negativos de proveniência passaram.

A busca nas coberturas dos outros domínios não encontrou revisão semântica desses oito hooks declarada antes deste lote. VOL-01 anterior já citava useMediaElementVolume/helper e permanece referenciado. playTtsAudio é compartilhado com IA; o revisor responsável confirmou não ter registrado o contrato de stop. useSipClient foi apenas ponte estreita, sem duplicar root/calls; persistência de notificações pertence a AUTH038.

| Probe adicional | Observação |
|---|---|
| tts_starts_after_unmount | Resposta TTS atrasada cria e toca áudio depois do unmount |
| tts_stop_does_not_cancel_request | stop durante fetch é seguido por áudio ativo sem currentMessageId |
| tts_loading_button_starts_duplicate | O botão da mensagem em loading aceita outro clique e as duas respostas tocam |
| imperative_audio_stops_keep_bindings | Pausar/fechar memes e parar TTS conserva inscrições dos elementos antigos |
| audio_meme_writes_false_success | Escritas de categoria/exclusão rejeitadas continuam com sucesso; exclusão de objeto já aconteceu |
| audio_meme_close_orphans_upload | Fechar o picker descarta pendingUpload e conserva objeto; Cancelar explícito remove |
| dictation_old_end_resets_new_session | onend atrasado da sessão anterior apaga isListening enquanto a nova continua ativa |
| transcription_notification_after_disable | Callback pendente publica os três alertas depois de enabled=false remover o canal |
| voice_actions_announce_without_applying | Busca/filtro só mudam view e sort/clear só mostram toast |
| voice_stop_leaves_action_pending | Interromper resposta pausa áudio mas deixa promise e onAction pendentes |
| voice_old_tts_applies_old_action | A finaliza sua fala depois de B e ainda aplica ação antiga apesar do abort |
| microphone_guard_contract_positive | Sondagem interrompe tracks, reconsulta após negativa e reutiliza sucesso por três segundos |
| media_volume_contract_positive | Store mantém clamp/curva/mute e hook troca binding quando o elemento muda |

### Quarta passagem: biblioteca de mídia e stickers

O recorte de seis arquivos em media-library/sticker-picker foi lido integralmente, incluindo helpers, CRUD, upload, estado e consumidores diretos. O barrel de exports é leitura estrutural de contrato, sem corpo de função. Foram adicionados cinco achados, R2-INB-049–053, e estendidas as famílias 042/043 para os mesmos defeitos encontrados em outro picker/administrador. Os 39 achados iniciais permanecem literalmente iguais e os 41 probes anteriores não foram alterados. Mais 8 provas ficam em pass4, com 11 arquivos fixados e dois controles negativos de proveniência.

AIGenerateDialog já tinha MOD040 do revisor IA; a nova prova cobre falha de INSERT depois do upload. A biblioteca administrativa é explicitamente isenta do volume de conversa (E37); isso não foi tratado como bug. A referência compartilhada e a miniatura sem assinatura são efeitos distintos: apagar o objeto pode danificar mensagem original, enquanto deixar o objeto privado sem resolver já quebra o preview.

| Probe adicional | Observação |
|---|---|
| sticker_delete_dangles_message_reference | Excluir a entrada remove o arquivo compartilhado, mas a mensagem conserva sua URL |
| media_import_insert_failure_keeps_objects | Falha no INSERT conserva objetos do upload em massa e do áudio gerado; retry cria outro |
| sticker_mutations_ignore_errors | Favorito/categoria/exclusão de sticker seguem otimistas e anunciam sucesso após error |
| sticker_close_leaves_upload | Fechamento do StickerPicker apaga pendingUpload sem remover o arquivo |
| media_catalog_fixed_windows | Item 1001 não pode ser encontrado; favoritos e totais refletem apenas mil linhas |
| private_sticker_grid_skips_resolution | Grid usa locator privado cru que o resolvedor canônico reconhece e assina |
| library_storage_delete_failure_accepted | Exclusão simples e em lote concluem a linha mesmo quando Storage devolve error |
| library_reclassify_errors_not_counted | Erro da função de classificação recebe toast success sem contagem de erro e limpa seleção |

### Quinta passagem: saldo funcional de Inbox/Chat e seis hooks finais

O ledger pass5-reviewed.json contém 151 registros próprios com nível, símbolos e faixas efetivamente lidos. Foram fechados os corpos restantes do recorte de produção Inbox/Chat e os seis hooks adicionais de inbox/realtime/voice, incluindo seus consumidores diretos. ChatPopup foi conferido integralmente, linhas 1–300. O saldo de produção é calculado por união com os componentes já integrais de outros revisores, sem atribuir sua leitura a este agente.
Foram acrescentados 11 achados, R2-INB-054–064, e 15 casos offline. Os 53 achados do checkpoint pass4 permanecem literalmente iguais e os 49 casos anteriores permanecem com os mesmos bytes/hashes. O runner pass5 exige HEAD e 35 blobs antes de avaliar código; os dois controles negativos de proveniência passaram.
A prova de Sussurro é condicional: targetAgentId falta se o componente for montado, mas não foi demonstrada uma ação que abra o estado whisper inicialmente false. Não foi criada falha confirmada de jornada ativa nem declaração de dead code. A transferência em RealtimeCollaboration é evidência complementar de R2-INB-009 e também não gera nova contagem. As duas distinções e suas evidências pinadas estão em pass5-notes.json.
No lote de seis hooks, useVisiblePolling conserva coalescência, follow-up manual e cancelamento; seus consumidores verificam o sinal após await. useInboxUIState normaliza a aba removida e captura indisponibilidade de storage. O truncamento de useInboxFilterTags continua pertencendo a TRA-011. Falta de response.ok em logVoiceCommand fica limite de telemetria, sem exigir que logs bloqueiem a UI. O alerta local/global só ganhou R2-INB-064 após rastrear os handlers e a montagem: o Dashboard produz ai dinamicamente, o que afastou a hipótese de ausência universal do alvo.
O lote finito de testes está em SEMANTIC_REVIEW_COMPLETE: 125/125 arquivos adjudicados, 18903/18903 linhas lidas. Cada entrada de test-review.json e test-review.md separa assertions, fixtures/mocks, resultado da análise e limites. Roster e journal isolados não contam como revisão; a suíte não foi executada.

| Probe adicional | Observação |
|---|---|
| quick_reply_dialog_stale_target | Editar B reutiliza o formulário de A; primeira edição após montagem vazia abre sem o registro |
| group_filter_removes_required_hyphen | Filtro de grupos rejeita até o formato que sua própria regex espera e inclui grupo em individuais |
| status_chip_uses_auth_id_for_profile_fk | Contato próprio fica com contador zero quando auth.id difere de profile.id; badge de outro atendente inclui o próprio |
| voice_picker_unmount_keeps_stream | Desmontagem do VoiceChangerPicker não aciona a limpeza que para tracks |
| voice_picker_permission_resolves_after_close | Permissão simulada concedida após fechar inicia gravação com popover fechado |
| generated_tts_send_before_outbound | TTS fecha e descarta blob com sucesso antes de o envio falhar no pai |
| transformed_voice_send_before_outbound | Voz transformada limpa prévia e confirma envio enquanto sendOutboundMessage ainda está pendente |
| batch_signed_thumbnail_cannot_refresh | Imagem que já recebeu assinatura em lote chama refresh de source vazio e permanece indisponível |
| file_detail_error_persists_into_next_item | Erro de imagem A mantém placeholder quando detalhes passam para B com URL válida |
| whisper_conditional_consumer_omits_target | Se montado com as props condicionais de ChatPanel, Sussurro retorna antes do INSERT por falta de targetAgentId |
| lead_score_failed_load_writes_defaults | Depois de SELECT falhar, editar só origem e salvar sobrescreve scores/consentimento com defaults |
| sticker_manager_recent_toggle_no_effect | Controle Recentes muda estado visual sem alterar itens, ordem ou consulta |
| quick_reply_card_reports_copy_without_clipboard | Clique no card de resposta rápida em Configurações anuncia cópia sem escrever no clipboard |
| collaboration_handoff_error_variant | Rota Adicionar participante → Transferir anuncia sucesso após UPDATE devolver error |
| sentiment_actions_without_conversation_navigation | Ver conversa apenas loga; Ver detalhes depende de elemento da aba IA sem rota alternativa |

### Evidência complementar sem nova contagem

**PASS5-HANDOFF-VARIANT — evidência complementar de família existente.** Adicionar participante → RealtimeCollaboration → HandoffDialog ignora error do UPDATE no pai; a promessa resolve e o diálogo anuncia transferência. A família R2-INB-009 e todos os 53 achados do checkpoint pass4 ficam literalmente preservados, sem novo ID para esta variante.

- `src/components/inbox/contact-details/ContactActionButtons.tsx:173–179` — Popover Adicionar participante monta a colaboração. SHA `da307ba5626d`; blob `851aa7e03c6010ebbdd240bfdc5c52ddba94f55d`.
- `src/components/inbox/RealtimeCollaboration.tsx:18–31` — Handoff ignora error de update e da nota opcional. SHA `da307ba5626d`; blob `262bb4854ae43d599315a1a7d52bc5b2d97f4eae`.
- `src/components/inbox/collaboration/HandoffDialog.tsx:35–48` — Diálogo aceita promessa resolvida e confirma sucesso. SHA `da307ba5626d`; blob `2db38c55befcfd0d5da5c773f86cd8d780bfdc76`.

**Critério/limite.** Propagar falha/zero efeito da transferência e da nota conforme contrato; não fechar nem anunciar sucesso antes do resultado aceito. Probe usa comentário vazio e nenhuma operação de Auth/banco real. Não afirma atomicidade ou permissões vivas.

**PASS5-WHISPER-REACHABILITY — contrato condicional e limite de integração.** Se WhisperMode for montado com as props da condição de ChatPanel, falta targetAgentId e sendWhisper retorna sem INSERT. Contudo, o estado inicial whisper é false e os comandos/ações lidos não estabelecem abertura desse estado. Não há finding confirmado de jornada ativa, nem declaração de dead code.

- `src/components/inbox/ChatPanel.tsx:72–98` — Estado inicial e controlador dos diálogos. SHA `da307ba5626d`; blob `f2561bc99f053782ac17f2769ea34fe262d9d8f8`.
- `src/components/inbox/ChatPanel.tsx:282–286` — Montagem condicional não fornece targetAgentId. SHA `da307ba5626d`; blob `f2561bc99f053782ac17f2769ea34fe262d9d8f8`.
- `src/components/inbox/WhisperMode.tsx:90–114` — Handler exige alvo antes de persistir. SHA `da307ba5626d`; blob `fc38f7f87df8affe0df641292ca8ba2fb2a99eac`.

**Critério/limite.** Antes de homologar Sussurro, definir rota de abertura e seleção do alvo; só então provar a jornada e sua autorização. A prova monta o componente artificialmente. Não substitui evidência de uma ação do produto que o torne acessível.

**PASS5-TAGS-EXISTING — extensão de cobertura anterior.** useInboxFilterTags continua sem paginação, como já documentado em TRA-011. A leitura integral também observou que error é ignorado e data ausente vira lista vazia de sucesso; InboxFilters só apresenta a seção quando tags.length>0. Não criado novo ID.

- `src/hooks/inbox/useInboxFilterTags.ts:6–16` — Consulta única, distinct em memória e resultado de error não examinado. SHA `da307ba5626d`; blob `d261b35b8b0956f7964fd3236e7e3c4141ff74ad`.
- `src/components/inbox/InboxFilters.tsx:74–79` — Consumidor usa apenas data. SHA `da307ba5626d`; blob `8518c3824fd2754d2c5517d7206669adababb359`.
- `src/components/inbox/InboxFilters.tsx:225–229` — Seção depende de resultado não vazio. SHA `da307ba5626d`; blob `8518c3824fd2754d2c5517d7206669adababb359`.

**Critério/limite.** A revisão de TRA-011 deve considerar paginação/agregado e erro recuperável de consulta sem apagar o último catálogo válido. Não consulta cardinalidade/RLS produtiva; a observação de erro é estática.

**PASS5-VOICE-LOG-LIMIT — limite de telemetria.** logVoiceCommand é explicitamente fire-and-forget e não lê response.ok do POST; erro HTTP pode perder log sem feedback. Na ausência de contrato durável de entrega não se promove uma nova falha de ação nem se exige bloquear o usuário.

- `src/hooks/voice/logVoiceCommand.ts:15–46` — Fluxo assíncrono não bloqueante e fetch sem inspeção do status. SHA `da307ba5626d`; blob `c17df2a3c29989b0639abcb95fa07d01cea67c26`.
- `src/hooks/communication/useVoiceAgent.ts:110–119` — Consumidor registra sucesso antes de entregar ação ao callback. SHA `da307ba5626d`; blob `b6a6e63f162fd1562774c2bfea968ea5b93a55fa`.

**Critério/limite.** Se logs forem requisito durável, definir sinalização/retenção/retry e separar resultado de interpretação do resultado da ação; conservar UI não bloqueante. Nenhum log ou credencial real foi enviado; não se afirma taxa de perda no serviço.


## Cobertura efetiva e lacunas

coverage.json contém 494 paths: 370 semantic, 61 targeted e 63 structural. Cada arquivo lista símbolos/trechos de fato revisados, achados relacionados e lacunas. **Structural significa inventário apenas e não conta como revisão de função.**
Read-journal.jsonl é um rastro de pedidos de leitura: alguns lotes iniciais tiveram truncamento, corrigido por releituras direcionadas e por rebaixamento honesto de cobertura em targeted. O journal isolado não demonstra que todo o conteúdo solicitado foi analisado.
Permanecem sem validação dinâmica: medidas/foco/propagação de DOM real, acessibilidade e navegação física, codecs e microfone, reconexão/replay de realtime, carga real e disputas entre operadores, permissões de Storage/RLS e provider. O saldo de corpos de produção de components/inbox e hooks/chat foi fechado dentro deste recorte, considerando as faixas próprias e os três componentes já integrais de providers. Outros arquivos, testes e trechos delegados continuam marcados conforme a leitura efetiva; o inventário não foi promovido automaticamente a revisão semântica.
Áreas delegadas: Team Chat; autenticação/usuários; backend/integrações e schema; núcleo IA e Agenda. ContactDetails e folhas de ferramentas IA tiveram cobertura complementar delimitada nesta passagem. Agendamento de Composer (este relatório), disponibilidade do executor (providers) e leitura global da Agenda (agente complementar) são contratos distintos.

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

- O lote communication preservou os controles positivos do microfone (tracks interrompidas, negativa não memorizada, validade de três segundos, listener removido) e do volume (clamp, curva, mute e rebind). Essas provas locais não são validação de microfone/WebAudio físico.
- O TTS não troca text por messageId no consumidor final. TextToSpeechButton usa a ordem correta; a falha é lifecycle/concorrência.
- O fechamento do VoiceOverlay desmonta o hook e mountedRef bloqueia ações posteriores; o achado de comando antigo requer duas gerações enquanto a montagem continua ativa.
