# Auditoria técnica — Email conversacional / ZAPP WEB V2

**Data:** 02/10/2026. **Referência visual:** última imagem NAVY de Email, não o primeiro protótipo.

**Snapshot:** `c82c0995dbdc30b316a7e88c979ea8fb5fa55969`.

## 1. Método e limites

Leitura estática pelo conector GitHub de componentes, hooks, endpoints, schemas, migrations, layout, tokens e testes pertinentes ao módulo. Capturas atuais e quatro referências visuais foram inspecionadas. A branch main estava no snapshot acima quando a revisão foi fixada; a implementação deve revalidar HEAD.

Não executei o aplicativo autenticado, build, testes, SQL, deploy ou operações em caixas de e-mail. “Confirmado” abaixo significa condição observada no código, não incidente de produção reproduzido. Riscos de corrida/isolamento estão sinalizados como tais. Esta revisão é aprofundada do fluxo Email e dependências examinadas, não uma certificação de todos os arquivos do repositório.

As referências Sxx apontam para código fixo; documentação de fornecedor e decisões novas estão separadas. As cores, dimensões sugeridas e arquitetura futura do prompt são propostas, não medidas já aprovadas em navegador.

## 2. Conclusão

O módulo já possui uma base de e-mail conversacional real. O redesign deve evoluir essa base em vez de construir outro inbox estático. Há recursos existentes sem integração visual, funcionalidades parcialmente implementadas e erros de contrato que precisam ser corrigidos junto com a nova interface. A aparência NAVY é uma frente de trabalho; integridade de anexos, destinatários, threads e estados de envio é outra, inseparável da entrega.

## 3. Mapa do fluxo existente

```text
ViewRouter → email-chat → EmailChatInbox
  ├─ EmailThreadList → threads/labels/contadores
  ├─ EmailChatThread → EmailChatBubble → EmailFullViewDialog
  │                   └─ EmailChatReplyBar
  ├─ EmailContactPanel
  └─ EmailComposer (compartilhado com gmail legado)

useGmail → queries Supabase + callGmailFunction
  ├─ gmail-send: send/reply/create-draft/modify-labels/mark-read/trash/trash-thread
  └─ gmail-sync: sync-labels/sync-inbox/sync-incremental/get-thread/setup-watch/get-attachment
       └─ _shared/gmail-helpers: leitura MIME/sync/metadados

email_threads → email_messages → email_attachments (metadados)
Gmail → binário de anexos, obtido sob demanda
contacts → useContactNotes (candidato real a reaproveitamento no rail)
```

Fontes: [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatInbox.tsx) · [S03](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatThread.tsx) · [S09](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/integrations/useGmail.ts) · [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts) · [S13](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-sync/index.ts) · [S14](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/_shared/gmail-helpers.ts) · [S18](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/crm/useContactNotes.ts) · [S21](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/pages/ViewRouter.tsx)

## 4. O que temos e o que falta

| Capacidade | Estado no snapshot | Trabalho recomendado |
|---|---|---|
| Rota e-mail/chat | Existente, protegida pelo roteador | Manter `email-chat`; adaptar UI sem criar rota pública paralela. |
| Gmail legado | Existente; usa hook e compositor compartilhados | Preservar consumidores/compatibilidade. |
| Threads e balões | Existentes | Alvo histórico correto, assunto único, legibilidade e contexto. |
| OAuth e API autenticada | Existentes | Reutilizar transporte, não expor tokens nem duplicar integração. |
| Filtros/busca | Parciais e locais | Filtro de anexo real, busca por remetente, paginação e contadores coerentes. |
| Envio de anexos no backend | Existente | Corrigir payload do compositor e tipos; não reconstruir o serviço. |
| Metadados de anexos | Migration e upsert existentes | Integrar query/cards e validar schema atual. |
| Download de anexos | Endpoint get-attachment existente | Ligar UI e tratar bytes/erros/autorização. |
| Leitura completa de thread | Endpoint get-thread existente, retorna cru | Integrar hidratação/reconciliação; não confundir banco parcial com caixa completa. |
| HTML seguro | Sanitizador e leitor isolado existentes | Preservar segurança, melhorar leitura e política de imagens. |
| Editor rich text | Toolbar existe; ações não | Implementar editor funcional e contrato MIME, sem controles falsos. |
| Rascunhos | Estado transitório + backend create-draft | Definir escopo e persistência; update/descartar ainda precisam de contrato. |
| Notas internas | Hook de contato existente, não ligado ao rail Email | Reutilizar para contato vinculado e autorizado. |
| Dados profissionais/site/redes | Não disponíveis no join de contato do hook Email | Consultar cadastro real; não concluir ausência em todo o sistema. |
| Selo de empresa verificada | Sem contrato demonstrado nesta revisão | Não reproduzir selo sem dado verificável. |
| Confirmação de leitura pelo destinatário | Não demonstrada por is_read | Corrigir significado do indicador. |
| Tema/primitivas | Tokens e primitivas de Campanhas existentes | Reusar parte visual pura; tema NAVY local, sem mudança global invasiva. |
| QA | Testes unitários existentes e infraestrutura Playwright | Expandir fluxos reais e régua visual; nenhum teste executado nesta análise. |

Fontes: [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatInbox.tsx) · [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/gmail/EmailComposer.tsx) · [S06](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatBubble.tsx) · [S09](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/integrations/useGmail.ts) · [S11](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/gmail/gmailTypes.ts) · [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts) · [S13](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-sync/index.ts) · [S18](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/crm/useContactNotes.ts) · [S22](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/styles/tokens.css) · [S24](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/talkx/talkxShared.tsx) · [S25](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/package.json) · [S26](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/playwright.config.ts) · [S28](https://github.com/adm01-debug/Zapp_Web_V2/tree/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/__tests__) · [S31](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/gmail/GmailInboxView.tsx)

## 5. Achados detalhados

Prioridades são uma proposta de ordem de trabalho: P0 = integridade/isolamento/conteúdo antes de liberar; P1 = funcionalidade, confiabilidade ou proteção essencial; P2 = apresentação e usabilidade. Não são classificação CVSS nem prova de exploração.

### E01 — Anexos da nova mensagem não entram no envio

**Prioridade proposta:** P0. **Natureza:** Confirmado no código.

**Evidência:** EmailComposer mantém attachments em estado e exibe badges, mas handleSend não passa attachments nem para sendEmail nem para replyEmail.

**Consequência:** O usuário pode enviar uma mensagem acreditando que os documentos foram incluídos. Não é uma falha de todos os caminhos: a resposta rápida já envia anexos.

**Implementação necessária:** Compartilhar serialização/validação e passar attachments em ambos os modos; comparar bytes recebidos no MIME de teste.

**Fonte:** [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/gmail/EmailComposer.tsx) · [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatReplyBar.tsx) · [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts)

### E02 — Toolbar rica sem comportamento

**Prioridade proposta:** P1. **Natureza:** Confirmado no código.

**Evidência:** Negrito, itálico, link e lista são botões sem handlers. isUsingHtml começa falso e não é atualizado por ferramenta de edição.

**Consequência:** Promessa visual não corresponde à capacidade real.

**Implementação necessária:** Integrar editor efetivo com texto/HTML coerentes e testes de edição; não apenas redesenhar os ícones.

**Fonte:** [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/gmail/EmailComposer.tsx) · [S25](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/package.json)

### E03 — Encaminhar usa outra mensagem

**Prioridade proposta:** P0. **Natureza:** Confirmado no código.

**Evidência:** handleBubbleForward recebe msg e preenche forwardMsg; EmailComposer recebe replyTo={lastMessage}.

**Consequência:** Clicar em mensagem anterior prepara a última, não a escolhida.

**Implementação necessária:** Usar alvo histórico explícito; teste com três mensagens de remetentes/conteúdos distintos.

**Fonte:** [S03](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatThread.tsx)

### E04 — Resposta histórica perde o alvo

**Prioridade proposta:** P0. **Natureza:** Confirmado no código.

**Evidência:** Callbacks handleBubbleReply/ReplyAll mudam somente o modo; EmailChatReplyBar recebe lastMessage.

**Consequência:** Cabeçalhos e destinatários podem ser calculados a partir da mensagem errada.

**Implementação necessária:** Preservar a identidade da mensagem clicada, exibi-la no compositor e encaminhar os IDs corretos.

**Fonte:** [S03](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatThread.tsx) · [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatReplyBar.tsx)

### E05 — Reply-To não é usado pela resposta rápida

**Prioridade proposta:** P1. **Natureza:** Confirmado no código.

**Evidência:** O tipo e a sincronização têm reply_to_address; resolvedTo escolhe from_address para inbound.

**Consequência:** Uma caixa configurada com Reply-To diferente pode receber resposta no endereço inadequado.

**Implementação necessária:** Parser de cabeçalhos e resolvedor compartilhado; preferência por Reply-To válido.

**Fonte:** [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatReplyBar.tsx) · [S11](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/gmail/gmailTypes.ts) · [S14](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/_shared/gmail-helpers.ts)

### E06 — Destinatários de Cc aparecem também em To

**Prioridade proposta:** P1. **Natureza:** Confirmado no código.

**Evidência:** reply-all agrega From + To + Cc no target e também envia ccAddresses separadamente.

**Consequência:** Papéis To/Cc são alterados/duplicados no payload.

**Implementação necessária:** To/Cc disjuntos, deduplicados; excluir a conta e aliases conhecidos; nunca repor Bcc automaticamente.

**Fonte:** [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatReplyBar.tsx)

### E07 — Endereços com nomes e vírgulas

**Prioridade proposta:** P1. **Natureza:** Risco derivado do parser.

**Evidência:** Composer e helper usam split por vírgula; From é tratado com expressão simples; vínculo de contato remove apenas sinais < >.

**Consequência:** Nomes entre aspas, display names e formatos de cabeçalho válidos podem ser interpretados de modo incorreto.

**Implementação necessária:** Parser compartilhado/testado; corpus de formatos reais sintéticos e validação de endereço antes do envio.

**Fonte:** [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/gmail/EmailComposer.tsx) · [S14](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/_shared/gmail-helpers.ts) · [S15](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/_shared/schemas.ts)

### E08 — Estado de rascunho pode atravessar a troca de thread

**Prioridade proposta:** P0. **Natureza:** Risco a reproduzir.

**Evidência:** Inbox não dá key de thread à conversa; ReplyBar mantém body/to/attachments em state sem reset/armazenamento por composição.

**Consequência:** React pode preservar texto e anexos ao trocar props, associando-os à conversa seguinte. Não foi reproduzido em UI autenticada nesta revisão.

**Implementação necessária:** Store de composição por conta/thread/alvo, com teste A→B→A e envio de A concluindo enquanto B está aberta.

**Fonte:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatInbox.tsx) · [S03](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatThread.tsx) · [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatReplyBar.tsx)

### E09 — Envio concorrente por teclado ou preparação lenta

**Prioridade proposta:** P1. **Natureza:** Risco a reproduzir.

**Evidência:** Enter chama handleSend sem guarda interna de isSending/isComposing; conversão base64 ocorre antes da mutation pending.

**Consequência:** Cliques/Enter durante preparação podem iniciar mais de uma submissão.

**Implementação necessária:** Trava síncrona desde preparing, snapshot de payload, proteção de IME/repeat e teste com promessa de anexos atrasada.

**Fonte:** [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatReplyBar.tsx)

### E10 — Thread selecionada pode ficar obsoleta

**Prioridade proposta:** P1. **Natureza:** Confirmado na estrutura de estado.

**Evidência:** selectedThread guarda o objeto retornado pela lista; invalidação de query não substitui automaticamente esse objeto de estado.

**Consequência:** Painel pode continuar mostrando status/counts antigos mesmo com lista atualizada.

**Implementação necessária:** Selecionar por ID e derivar dados canônicos, com query específica quando fora da página.

**Fonte:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatInbox.tsx) · [S09](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/integrations/useGmail.ts)

### E11 — Carregamento/erro da conta é tratado como desconexão

**Prioridade proposta:** P1. **Natureza:** Confirmado no código.

**Evidência:** useGmail expõe accountsLoading, porém Inbox só testa !activeAccount. Erros das queries não são expostos ao módulo.

**Consequência:** Tela de desconectado/vazio pode aparecer durante carregamento ou falha.

**Implementação necessária:** Estados explícitos loading/error/disconnected e retry, sem botão de reconexão durante carga pendente.

**Fonte:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatInbox.tsx) · [S09](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/integrations/useGmail.ts)

### E12 — Busca local e máximo silencioso de 100 threads

**Prioridade proposta:** P1. **Natureza:** Confirmado no código.

**Evidência:** Consulta limita 100; filtros/busca operam no array local. Busca não inclui last_from_name/address.

**Consequência:** Conversas mais antigas e remetentes sem contato podem não ser encontrados; isso não é busca da caixa inteira.

**Implementação necessária:** Paginar/filtrar no servidor e esclarecer universo sincronizado; buscar remetentes normalizados.

**Fonte:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailThreadList.tsx) · [S09](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/integrations/useGmail.ts)

### E13 — Filtro Com anexo não filtra

**Prioridade proposta:** P1. **Natureza:** Confirmado no código.

**Evidência:** Select tem value has_attachment, mas filteredThreads não possui branch para esse valor.

**Consequência:** Resultado parece filtrado sem estar.

**Implementação necessária:** Contrato de existência de anexo no universo da consulta, com caso de thread ainda não hidratada.

**Fonte:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailThreadList.tsx)

### E14 — Contadores não representam necessariamente a caixa

**Prioridade proposta:** P1. **Natureza:** Confirmado no cálculo; semântica a definir.

**Evidência:** unreadCount/starredCount contam o array de até 100. syncLabels usa campos de mensagens em sua contagem local.

**Consequência:** Mistura potencial de mensagem, conversa e subconjunto; números do mockup não podem ser transplantados.

**Implementação necessária:** Escolher unidade e recorte; query de contagem coerente ou rótulo de parcial; não usar messagesUnread como threadsUnread.

**Fonte:** [S09](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/integrations/useGmail.ts) · [S14](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/_shared/gmail-helpers.ts)

### E15 — Cursor do provedor não é consumido

**Prioridade proposta:** P1. **Natureza:** Confirmado no caminho examinado.

**Evidência:** syncMessages retorna nextPageToken, mas não recebe pageToken; schema de sync também não prevê esse cursor.

**Consequência:** Paginar o banco não recupera e-mails que ainda não foram sincronizados.

**Implementação necessária:** Continuação limitada, cancelável e segura; visibilidade de histórico parcial.

**Fonte:** [S13](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-sync/index.ts) · [S14](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/_shared/gmail-helpers.ts)

### E16 — Leitura completa de thread disponível, mas não integrada

**Prioridade proposta:** P1. **Natureza:** Lacuna de integração confirmada.

**Evidência:** get-thread retorna threads/{id}?format=full; frontend apenas consulta email_messages locais.

**Consequência:** Histórico local parcial pode ser tratado como toda a conversa.

**Implementação necessária:** Hidratar sob demanda e reconciliar via helper comum, mantendo IDs e escopo.

**Fonte:** [S03](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatThread.tsx) · [S09](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/integrations/useGmail.ts) · [S13](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-sync/index.ts)

### E17 — Falhas parciais podem terminar como synced sem erro

**Prioridade proposta:** P1. **Natureza:** Confirmado no fluxo de retorno.

**Evidência:** Helper conta falhas e preenche last_error; sync-inbox, ao receber resultado sem exception, grava synced e last_error:null.

**Consequência:** Status visual pode ocultar falha parcial real.

**Implementação necessária:** Resultado parcial explícito, preservar diagnósticos sanitizados e permitir retry só do que falhou.

**Fonte:** [S13](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-sync/index.ts) · [S14](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/_shared/gmail-helpers.ts)

### E18 — Eventos de labels/exclusão não são aplicados nessa rota

**Prioridade proposta:** P1. **Natureza:** Confirmado na rota incremental examinada.

**Evidência:** sync-incremental solicita messageDeleted/labelAdded/labelRemoved, mas coleta só messagesAdded e refaz busca genérica de inbox limitada.

**Consequência:** Mudanças externas de favoritos, leitura e lixeira não têm reconciliação completa garantida por esse caminho. Não é conclusão sobre todos os jobs não examinados.

**Implementação necessária:** Mapear consumidores webhook/cron; processar eventos e cursores reais antes de afirmar paridade de sincronização.

**Fonte:** [S13](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-sync/index.ts)

### E19 — Mensagem antiga pode sobrescrever resumo da thread

**Prioridade proposta:** P1. **Natureza:** Risco derivado da ordem de upsert.

**Evidência:** Cada mensagem sincronizada faz upsert do mesmo resumo de thread com sua data/snippet/labels; há reconciliação de unread, mas não do resumo completo nesse helper.

**Consequência:** Ordem de listagem/loop pode deixar last_message_at/snippet do item errado.

**Implementação necessária:** Recalcular agregados determinísticos e testar mensagens fora de ordem, empates e reprocessamento.

**Fonte:** [S14](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/_shared/gmail-helpers.ts)

### E20 — Identidade e ações do rail são inconsistentes

**Prioridade proposta:** P2. **Natureza:** Confirmado no código.

**Evidência:** Lista usa fallback last_from_*; painel usa só thread.contact; botões Email/CRM do painel não têm ação.

**Consequência:** Um remetente identificado pode aparecer como Desconhecido; controles parecem úteis sem funcionar.

**Implementação necessária:** Resolvedor único, indicação de ausência de vínculo, ações reais autorizadas.

**Fonte:** [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailThreadList.tsx) · [S07](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailContactPanel.tsx)

### E21 — Metadados do rail usam campos de significado diferente

**Prioridade proposta:** P2. **Natureza:** Confirmado no código.

**Evidência:** Anexos usa label HAS_ATTACHMENT; Thread criada usa last_message_at; labels técnicos são exibidos diretamente.

**Consequência:** Dados apresentados podem estar errados ou confusos.

**Implementação necessária:** Remover cards de estatística redundantes; usar created_at para criação, metadados reais para arquivos e display names para labels.

**Fonte:** [S07](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailContactPanel.tsx) · [S11](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/gmail/gmailTypes.ts)

### E22 — Duplo check não comprova leitura pelo destinatário

**Prioridade proposta:** P1. **Natureza:** Confirmado no código.

**Evidência:** Bubble usa is_read para CheckCheck; backend insere outbound com is_read:true.

**Consequência:** A linguagem de chat sugere confirmação que o sinal não representa.

**Implementação necessária:** Mostrar aceite de envio com rótulo próprio; manter is_read apenas para estado da caixa local.

**Fonte:** [S06](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatBubble.tsx) · [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts)

### E23 — Arquivar conversa atua somente na última mensagem

**Prioridade proposta:** P1. **Natureza:** Confirmado no código.

**Evidência:** Header chama modifyLabels(message_id:lastMessage) removendo INBOX e chama onBack imediatamente.

**Consequência:** A thread pode continuar na caixa; erro da operação não impede a saída visual.

**Implementação necessária:** Operação thread-level, resultado/rollback e testes com múltiplas mensagens em INBOX.

**Fonte:** [S03](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatThread.tsx) · [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts)

### E24 — Lixeira espelhada como status archived

**Prioridade proposta:** P1. **Natureza:** Confirmado no código; efeito visual a reproduzir.

**Evidência:** trash-thread chama Gmail corretamente, porém localmente só status=archived; lista atual não exclui esse status por pasta.

**Consequência:** A conversa pode reaparecer após refetch e lixeira/arquivamento se confundem.

**Implementação necessária:** Reconciliar labels reais e universo da pasta; restaurar somente via ação inversa verdadeira.

**Fonte:** [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts) · [S09](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/integrations/useGmail.ts) · [S02](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailThreadList.tsx)

### E25 — mark-read atualiza o local sem verificar cada resposta

**Prioridade proposta:** P1. **Natureza:** Confirmado no código.

**Evidência:** Loop de fetch não testa response.ok antes de atualizar is_read local e agregados.

**Consequência:** Um erro do Gmail pode virar leitura confirmada apenas no espelho.

**Implementação necessária:** Checar resultados individuais, manter falhas parciais, aplicar escopo da conta e não marcar dados atrasados.

**Fonte:** [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts)

### E26 — Gmail aceita envio, mas API pode responder como falha

**Prioridade proposta:** P0. **Natureza:** Confirmado no caminho condicional.

**Evidência:** No reply, messages/send ocorre antes de procurar thread local; ausência local retorna 400 após o aceite. Alguns inserts têm erro não checado.

**Consequência:** UI pode convidar a reenviar algo já enviado. O caminho é confirmado no código; sua ocorrência em produção não foi verificada.

**Implementação necessária:** Separar accepted/reconciling/outcome-unknown; não fazer retry cego; conferir persistência e reconciliar pelos IDs retornados.

**Fonte:** [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts) · [S10](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/gmail/gmailApi.ts)

### E27 — Operações locais por ID externo sem filtro de conta

**Prioridade proposta:** P0. **Natureza:** Risco de isolamento; exploração não testada.

**Evidência:** Conta inicial é validada, porém busca originalMsg e certas atualizações por gmail_message_id não acrescentam gmail_account_id; service role não depende de RLS.

**Consequência:** Há fragilidade de isolamento por escopo e ambiguidade de IDs em mais de uma conta. Não se afirma vazamento comprovado.

**Implementação necessária:** Validar a cadeia usuário/conta/thread/mensagem em cada operação; testes de conta A referenciando ID da B devem ser negados.

**Fonte:** [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts) · [S15](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/_shared/schemas.ts)

### E28 — Cabeçalho RFC pode ser fabricado a partir do ID Gmail

**Prioridade proposta:** P1. **Natureza:** Confirmado no fallback.

**Evidência:** Quando message_id_header não é encontrado, reply usa `<${message_id}>`. Composer também tem fallback de threadId para gmail_message_id.

**Consequência:** Encadeamento pode perder a referência real; identificadores distintos são confundidos.

**Implementação necessária:** Tipos separados e hidratação de Message-ID/References do alvo; proibir fallback entre famílias de IDs.

**Fonte:** [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/gmail/EmailComposer.tsx) · [S11](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/gmail/gmailTypes.ts) · [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts) · [S14](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/_shared/gmail-helpers.ts)

### E29 — Regras de anexos/cabeçalhos não estão alinhadas

**Prioridade proposta:** P1. **Natureza:** Lacuna de validação.

**Evidência:** GmailSendActionSchema aceita strings de endereços sem validação email, limita attachments a 10, mas conteúdo base64 não tem teto agregado. ReplyBar limita apenas tamanho bruto.

**Consequência:** Frontend pode aceitar payload recusado depois; há risco de cabeçalhos/dados inválidos e uso excessivo de memória.

**Implementação necessária:** Validação do schema correto no backend, limites agregados e MIME/base64, proteção CRLF e erros por campo.

**Fonte:** [S05](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatReplyBar.tsx) · [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts) · [S15](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/_shared/schemas.ts)

### E30 — Download de anexo existe no servidor, não no balão

**Prioridade proposta:** P1. **Natureza:** Lacuna de UI confirmada.

**Evidência:** Bubble mostra apenas Anexo(s). Metadata+get-attachment existem e o retorno traz data/size.

**Consequência:** Reimplementar storage seria desperdício; falta ligar a UI à capacidade existente.

**Implementação necessária:** Hook de metadados+download, conversão binária, cards e reader seguro compartilhados por timeline/rail.

**Fonte:** [S06](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatBubble.tsx) · [S13](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-sync/index.ts) · [S16](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/migrations/20260827210200_email_attachments_table.sql) · [S17](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/migrations/20260828220100_email_attachments_unique_msg_att.sql)

### E31 — Tipos manuais não são prova do schema atual

**Prioridade proposta:** P1. **Natureza:** Inconsistência entre contratos a validar.

**Evidência:** EmailAttachment declara storage_path, não presente na migration de criação examinada; EmailMessage não declara message_id_header, que o backend usa.

**Consequência:** Um novo componente pode depender de coluna não disponível ou omitir dado existente. Não foi consultado o catálogo vivo.

**Implementação necessária:** Comparar catálogo versionado/tipos gerados/schema autorizado antes de projetar consultas ou migrations.

**Fonte:** [S11](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/gmail/gmailTypes.ts) · [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts) · [S16](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/migrations/20260827210200_email_attachments_table.sql)

### E32 — Draft remoto só tem create

**Prioridade proposta:** P1. **Natureza:** Implementação parcial confirmada.

**Evidência:** Backend create-draft existe; useGmail não expõe esse fluxo; não há update/delete de draft no enum/handler analisado.

**Consequência:** Autosave não está pronto; repetir create geraria rascunhos sucessivos.

**Implementação necessária:** Create-once/update, ACK e descarte coerente; até lá, estado de sessão explícito e proteção de perda.

**Fonte:** [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/gmail/EmailComposer.tsx) · [S09](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/hooks/integrations/useGmail.ts) · [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts) · [S15](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/_shared/schemas.ts)

### E33 — Responsividade e FAB competem com a composição

**Prioridade proposta:** P2. **Natureza:** Estrutura confirmada; geometria deve ser medida.

**Evidência:** Contexto hidden xl:block, toggle ativo abaixo de XL; FAB fixed bottom-6/right-6 z50 e compositor fixed bottom-4/right-4 z50.

**Consequência:** Detalhes podem não abrir visivelmente; ação de voz pode cobrir envio, como nas capturas fornecidas.

**Implementação necessária:** Layout por largura útil, drawer real e posicionamento de controles globais fora da área crítica.

**Fonte:** [S01](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatInbox.tsx) · [S19](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/layout/AppShell.tsx) · [S20](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/layout/VoiceCopilotFAB.tsx) · [S04](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/gmail/EmailComposer.tsx)

### E34 — Tema e shell não correspondem integralmente ao mockup

**Prioridade proposta:** P2. **Natureza:** Diferença de implementação e referência.

**Evidência:** Tokens globais escuros são carvão; referência é navy. AppShell lido não renderiza a barra superior global do desenho.

**Consequência:** Trocar tokens globais ou duplicar shell para obter o visual pode causar regressões.

**Implementação necessária:** Tokens locais, header de workspace e reutilização de primitivas puras; respeitar Sidebar e rotas reais.

**Fonte:** [S19](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/layout/AppShell.tsx) · [S21](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/pages/ViewRouter.tsx) · [S22](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/styles/tokens.css) · [S24](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/talkx/talkxShared.tsx)

### E35 — Sanitização não equivale a privacidade de imagens remotas

**Prioridade proposta:** P1. **Natureza:** Limite de segurança/apresentação.

**Evidência:** DOMPurify tem proteção específica e iframe é isolado; img remota recebe lazy/no-referrer mas continua com src; Bubble recorta HTML na experiência atual.

**Consequência:** Não se deve prometer bloqueio total de rastreamento nem enfraquecer sandbox para resolver layout.

**Implementação necessária:** Preservar hardening; política explícita de imagens; leitura completa segura; testar navegação e acesso ao conteúdo.

**Fonte:** [S06](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailChatBubble.tsx) · [S08](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/EmailFullViewDialog.tsx) · [S32](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/lib/emailHtml.ts)

### E36 — Testes existentes podem validar o comportamento antigo

**Prioridade proposta:** P1. **Natureza:** Lacuna de cobertura observada.

**Evidência:** Inventário tem nove arquivos. EmailChatThread.test mocka ações dos balões fora do fluxo e espera archive de lastMessage. Playwright chromium só coleta auth.spec.

**Consequência:** Uma suíte verde ou comando que executa zero testes pode não proteger o redesign.

**Implementação necessária:** Regressões históricas reais; atualizar contrato intencionalmente; projeto Email com fixtures isoladas e coleta comprovada.

**Fonte:** [S27](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/__tests__/EmailChatThread.test.tsx) · [S28](https://github.com/adm01-debug/Zapp_Web_V2/tree/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/src/components/email/__tests__) · [S26](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/playwright.config.ts)

## 6. Novas decisões de produto e engenharia — não são recursos existentes

Workspace NAVY com grade adaptativa, barra de contexto, compositor unificado, navegação preservando rascunho, arquivos utilizáveis e estados verdadeiros compõem a proposta de implementação. Os novos nomes de componentes no prompt são uma organização sugerida, não um inventário do repositório.

Três painéis dependem da largura útil; o rail vira drawer em telas intermediárias e a conversa ocupa uma página própria no mobile. O assunto organiza a thread, mas não se repete em toda bolha. Notas são internas, participantes são metadados reais e conversas relacionadas não são fundidas automaticamente.

Portal de temas, pontos de integração com o shell e comportamento da barra global precisam ser decididos a partir do HEAD. Não se recomenda alterar todas as telas do sistema para tornar o Email semelhante à referência.

## 7. Banco: o que não deve ser recriado por engano

As duas migrations de anexos já documentam a tabela e a chave composta. O backend já possui envio MIME e download. Antes de propor qualquer DDL, comparar migration vigente, catálogo e tipos gerados, e só consultar schema vivo em modo autorizado. Um arquivo de migration no GitHub não comprova execução em produção. [S12](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-send/index.ts) · [S13](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/functions/gmail-sync/index.ts) · [S16](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/migrations/20260827210200_email_attachments_table.sql) · [S17](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/supabase/migrations/20260828220100_email_attachments_unique_msg_att.sql) · [S30](https://github.com/adm01-debug/Zapp_Web_V2/blob/c82c0995dbdc30b316a7e88c979ea8fb5fa55969/CLAUDE.md)

Queries de agregação/contagem, persistência de drafts, ledger de envio e campos de enriquecimento podem demandar trabalho adicional, mas não se deve criar tabelas novas antecipadamente. Priorizar contratos/infra existentes. Se DDL for realmente necessário, entregá-lo aditivamente em arquivo revisável; aplicação em produção exige autorização e fluxo próprio do repositório.

## 8. Sequência de execução recomendada

1. Baseline e testes de regressão dos defeitos de conteúdo.
2. Alvos, destinatários, anexos, IDs e resultado de envio.
3. Conta/estado/queries/hidratação e rascunho.
4. Workspace NAVY e primeira captura comparativa.
5. Lista e cabeçalho.
6. Timeline, HTML e arquivos.
7. Compositor efetivo e persistência prometida.
8. Contexto e operações de caixa.
9. Sincronização e estados extremos.
10. Testes, screenshots, revisão de diff e entrega sem deploy automático.

## 9. Próximas evidências que o executor deve produzir

Testes fail-before/pass-after dos defeitos reproduzidos; prova de bytes dos anexos; resposta da API e espelho de mensagens consistentes; cenários de troca de conta; coleta Playwright sem zero-test falso; screenshots da rota real e inventário de diferenças em relação à referência. Até a execução, todos os critérios de aceite permanecem pendentes.

