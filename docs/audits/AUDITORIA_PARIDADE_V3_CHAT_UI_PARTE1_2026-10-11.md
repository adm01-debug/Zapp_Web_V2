# Auditoria de paridade V3 → V2: UI de conversa do inbox (parte 1)

> Data: 11/10/2026 · Somente leitura (nenhum código, banco ou cartão foi alterado)
> Fonte V3: `docs/estado/08-features-inbox-components-chat-1.md` (hash `c569a43d…`, idêntico ao do GitHub) + código da V3 em `59af6ad96` (25/09/2026)
> Alvo V2: `adm01-debug/Zapp_Web_V2` branch `main` em `99aa53ff7` (09/10/2026), baixado do GitHub (a cópia local `~/projetos/Zapp_Web_V2` está parada em 05/10 e tem estrutura diferente)
> Método: análise estática. Nada foi executado em runtime; o próprio documento da V3 diz "Runtime: NAO_VERIFICADO".

## 1. Resultado em uma tela

| | Arquivos | |
|---|---:|---|
| Itens listados no documento da V3 | 50 | 47 componentes + 3 testes |
| Existem na V2 com o mesmo nome | 27 | todos em `src/components/inbox/chat/` (a V3 usa `src/features/inbox/components/chat/`) |
| **Não existem na V2** | **23** | 20 componentes + 3 testes |

Dos 27 que existem, 7 são equivalentes ou melhores na V2 (AIEnhanceButton +21%, AIRewriteButton +19%, MentionAutocomplete, HighlightedText, MessageBubble +75% com figurinhas, ChatAssignedBar, CrmBadges). Os outros 20 existem mas são versões reduzidas (de 8% a 63% menores), com lacunas listadas na seção 3.

## 2. Diferença que impede copiar (modelo de dados)

| Assunto | V3 | V2 |
|---|---|---|
| Mensagens | `evo.evolution_messages` | `public.messages` (37 colunas, inclui `status`, `status_updated_at`, `delivery_attempt_count`, `delivery_claim*`) |
| Tentativas e erro do provedor | `evolution_retry_metrics`, `message_attempts` | **não existem** (nem tabela, nem edge) |
| Histórico de status | eventos por estágio | só o último estado + carimbo |
| Ticket | edge `ticket-router` + `useTicketStatus` | não há tabela de tickets; estado fica em `contacts` (`conversation_status`, `assigned_to`, `queue_id`) e `TicketTabs` |
| Auditoria | `audit_logs` | `audit_logs` existe |

Consequência: cada componente de status da V3 precisa ser **reescrito sobre as colunas da V2**, não copiado. O que exige o erro do provedor por tentativa (etapa 029 do plano) precisa de migration e mudança na edge de envio.

## 3. Quadro por funcionalidade

### 3.1 Ausentes na V2 (23)

| Grupo | V3 | Situação na V2 | Viável sem DDL? |
|---|---|---|---|
| Status de entrega | `MessageStatusInline/Panel/Timeline/Timestamps`, `MessageReadStatus` | V2 mostra só o último estado (`MessageStatusIcon` em `messageUtils.tsx`) | Parcial: dá para mostrar `created_at`, `status_updated_at`, tentativas. Sem carimbo por estágio |
| Resumo e filtro | `ConversationDeliverySummary`, `MessageStatusFilterBar`, `FailureFilterBar` | Existe `summarizeDeliveryProgress` (SL-198), **sem nenhum consumidor** | Sim |
| Falha de envio | `SendErrorBanner`, `ChatSendProgress`, aviso "Última mensagem falhou / Tentando reenviar" no cabeçalho | Mensagem `failed` só ganha ícone vermelho; **não há botão de reenviar** | Banner e filtro sim; reenviar depende de RPC de re-fila (verificar) |
| Detalhe admin | `MessageDetailsDialog`, `MessageAttemptsTimeline` | Não existe | Só com a tabela de tentativas (etapa 029) |
| Ticket | `TicketActionsBar`, `useTicketStatus`, `ticket-router` | V2 tem `TransferDialog` (agente/fila) e `TicketTabs`; **não tem "assumir" nem "devolver à fila"** | Parcial |
| Cabeçalho | `ChatHeaderMenu`, `ChatPanelOverlays`, `ChatMonitoringDialog` | Funções espalhadas em `ChatPanelHeader`/`ChatDialogs`; sem diálogo de métricas de envio | Menu/overlays: refatoração. Métricas: precisa dados de fila |
| Outros | `AutomationSuggestionsBar` (+ edge `automation-suggest-reply`), `ChatTemplatesOverlay`, `MessageBubbleUnsupported`, `ChatMessageBubble` | V2 tem `TemplatesWithVariables`; `AISuggestions` existe; `ChatMessageBubble` foi fundido em `MessageBubble`; tipos não suportados (enquete, contato, visualização única) **sem fallback visual** | Fallback de tipo: sim |
| Testes | 3 testes | não aplicável (testam componentes ausentes) | |

### 3.2 Presentes, mas incompletos

| Arquivo (linhas V3→V2) | O que a V3 tem e a V2 não |
|---|---|
| `ChatInputArea` (399→284) | fila de envio (`useMessageQueue`), indicador "AO VIVO / Gravando áudio", rótulos de acessibilidade |
| `ChatInputToolbars` (398→190) | atalhos "Arquivos da Equipe" e "Sussurro", estado vazio de respostas rápidas |
| `ChatQuickRepliesPopover` (124→70) | dicas de teclado (↑↓/Enter), título "Sugestões Rápidas" |
| `ChatMessagesArea` (557→393) | estado vazio "Nenhuma mensagem ainda", botão "Rolar para o final", reações em tempo real com pré-carga |
| `MessageHoverToolbar` (362→196) | adiar mensagem com opções (1 h, 3 h, amanhã, próxima semana, outro) e reportar com motivos (spam, impróprio, urgência) |
| `MessageSendHistorySheet` (473→165) | métricas de retry, erro por tentativa, payload bruto, copiar resumo |
| `ChatHeader` (438→213) | botão Sussurro (Alt+W), voltar (mobile), checklist de validação |
| `ChatHeaderToolbar` (201→79) | "Métricas de Envio", "Templates dinâmicos" |
| `ChatPanelHeader` (369→215) | tags no cabeçalho, ações de arquivar, "Mensagens sussurradas", avisos de falha/reenvio |
| `ChatToolPanels` (131→70) | painel "Arquivos da Equipe" |
| `ChatSearchResultsList` (108→65) | mensagem "Nenhum resultado para esta busca" (a V2 ainda tem `slice(0, 5)` e some em silêncio) |
| `ChatSearchBar` | dicas "Anterior (Shift+Enter) / Próximo (Enter)" |
| `ChatDialogs` (181→88) | `useTransferConversation`, `useGlobalSearchData` |
| `InputPreviewBars` | rótulos "Modo de Edição" / "Cancelar Edição" |
| `ChatWatermark` | removido de propósito na V2 (385 bytes); não importar |

## 4. Código morto na V2 (achado que a V3 não tem)

Confirmado por busca de importadores em todo `src/` na `main`:

| Artefato da V2 | Evidência | Efeito |
|---|---|---|
| `MessageSendHistorySheet` + `buildMessageSendTimeline` + `summarizeDeliveryProgress` (cartões SL-197/SL-198) | só são importados pelo próprio arquivo e pelo teste | O "Histórico de envio" foi construído e **nunca aparece na tela** |
| `MessageContextMenu` (favoritar, fixar, reportar, responder depois) | nenhum `<MessageContextMenu` em `src/` | menu inteiro inalcançável; `onStar`/`onReport`/`onRemindLater` nunca são passados |
| `ChatHeader.tsx` | nenhum `<ChatHeader` fora de testes (o cabeçalho real é `ChatPanelHeader`) | o item "Adicionar tag" sem ação (achado A1 da V3) mora em arquivo que ninguém renderiza |

## 5. Os 13 achados da V3 aplicados à V2

| # | Achado da V3 | Na V2 |
|---|---|---|
| A1 | stubs no menu do cabeçalho | existe só em `ChatHeader.tsx` (não renderizado); no `ChatPanelHeader` "Marcar como resolvido" funciona |
| A2 | favoritar/fixar/reportar sem ação | V2 removeu os itens (R2-INB-021); o menu alternativo é código morto |
| A3 | altura estimada errada no scroll virtual | **verificar** em `ChatMessagesArea` (não medido) |
| A4, A5, A6, A8 | `useTicketStatus`, props `_onRetry`, `key` no histórico, videochamada `undefined` | não se aplicam (código inexistente na V2) |
| A7 | efeito duplicado em StrictMode | não se aplica (`MessageReadStatus` ausente) |
| A9 | busca sem "nenhum resultado" e limite fixo 5 | **presente na V2** (`ChatSearchResultsList.tsx:29`) |
| A10 | emojis de sentimento sem `aria-label` | não encontrado na V2 |
| A11 | `return null` sem fallback | não se aplica |
| A12 | texto de criptografia fixo | não existe na V2 |
| A13 | workarounds de tipo de mídia | não medido |

## 6. Cobertura no plano e nos cartões da V2

- O plano `docs/plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md` (01/09) já lista esses itens: **029** (tentativas e métricas), **061** (linha do tempo de envio), **062** (barra de falhas, banner, fila), **070** (monitoramento, sugestões, tipos não suportados, ações de ticket), **077** (roteador de tickets).
- Executado desde então: só a parte de 061/062 que usa colunas existentes (SL-197/SL-198), e **sem ligar na tela**.
- Não encontrei cartão aberto, em andamento ou concluído no quadro para `SendErrorBanner`, `TicketActionsBar`, `ConversationDeliverySummary`, `MessageReadStatus`, `ChatMonitoringDialog` nem `AutomationSuggestionsBar`.

## 7. O que vale trazer para a V2 (proposta, nada criado)

**Faixa A. Ligar o que já existe (baixo risco, sem DDL)**
1. Ligar `MessageSendHistorySheet` ao menu da mensagem e `summarizeDeliveryProgress` ao cabeçalho da conversa.
2. Decidir `MessageContextMenu`: ligar (favoritar, fixar, adiar, reportar) ou apagar. Hoje é código morto.
3. Apagar `ChatHeader.tsx` morto, ou confirmar quem deveria usá-lo.

**Faixa B. Trazer da V3 sobre o modelo da V2 (sem DDL)**
4. Aviso de falha de envio (banner + "Última mensagem falhou") e filtro "só falhas" a partir de `messages.status`.
5. Botão reenviar (verificar se `enqueue_outbound_message`/`fail_outbound_message` permitem re-fila sem migration).
6. Estados vazios e acessibilidade: "Nenhuma mensagem ainda", "Nenhum resultado" (e remover o limite fixo de 5), "Rolar para o final", dicas de teclado nas respostas rápidas e na busca, rótulos de edição.
7. Fallback visual para tipos de mensagem não suportados (enquete, contato, visualização única).
8. Adiar mensagem com opções de prazo e reportar com motivos (confirmar destino dos reports; pode precisar tabela).

**Faixa C. Exige banco ou edge (maior)**
9. Tabela de tentativas (`message_attempts`) gravada pela edge `message-delivery`, com erro do provedor; só depois `MessageDetailsDialog` e o histórico completo.
10. Painel de métricas de envio (`ChatMonitoringDialog`) sobre esses dados.
11. "Assumir" e "devolver à fila" no ticket, e roteador sticky (etapa 077).
12. Sugestões de automação com base de conhecimento (etapa 070).
13. Painel "Arquivos da Equipe" no chat.

**Não trazer:** `ChatWatermark` (removido de propósito), `ChatMessageBubble` (duplica `MessageBubble`), checklist/validação visual "10/10" (ferramenta interna da V3), fila offline no cliente (a V2 já tem outbox no servidor via `enqueue_outbound_message`/`claim_outbound_message`).

## 8. Limites desta auditoria

- Análise estática da `main` da V2 em `99aa53ff7`; a fábrica integra continuamente, então o quadro pode ter mudado depois.
- O documento da V3 é de 24/08 e algumas contagens divergem do código atual da V3 (por exemplo `ChatInputArea` tem 399 linhas, não 860).
- Não executei a V2 nem a V3: "ausente" significa "sem código importado", não "falha em tela".
- Cobre só o documento 08 (chat, parte 1). Os documentos 08-chat-2, 09, 10, 11 e 12 da V3 (outros componentes do inbox) ainda não foram auditados.
- Itens marcados "verificar" (A3, A13, reenvio sem migration, destino dos reports, botão Sussurro no cabeçalho real) precisam de leitura mais funda antes de virar cartão.
