# Auditoria de paridade V3 → V2, parte 2: comportamento (documento 08-chat-1)

> Data: 11/10/2026 · Somente leitura · Complementa `AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1_2026-10-11.md`
> Fonte V3: `docs/estado/08-features-inbox-components-chat-1.md` (24/08) + código da V3 em `59af6ad96` (25/09) + 40+ testes da pasta `chat`
> Alvo V2: branch viva `dia/2026-10-11` (worktree do integrador), não a `main` do GitHub
> Método: 4 leitores independentes (compositor, mensagens/rolagem, status/falhas, cabeçalho/busca/ticket) leram o código da V3 e dos testes (cada `it()` é uma regra) e procuraram a regra na V2. Os achados mais graves foram reconferidos por mim no código e, quando cabia, no banco vivo (só contagens, sem dados pessoais).

## 1. O que a primeira passada não via

1. **O documento de agosto está defasado.** A pasta `chat` da V3 hoje tem 24 arquivos de código e 40+ testes que ele não lista (rolagem v2, fila de envio, textarea, botões, arrastar e soltar, comandos de barra, produtos, deep link, SLA de entrega, vocabulário de status).
2. **Os testes da V3 são a melhor especificação.** `p0-regressions.test.ts` (992 linhas), `media-retry`, `ChatSearchBar.keyboard` (484), `useChatPanelHandlers.*` registram bugs que a V3 já pagou.
3. **Nem tudo que a V3 tem vale.** `ChatScrollerV2`, `scrollLoaderController` e `loadOlderMetrics` não são usados pelo chat da V3 (código morto lá). A V2 está melhor em carregar mensagens antigas.
4. **A V2 está melhor em vários pontos** (seção 5).

## 2. Achados graves (bugs ativos e riscos latentes na V2)

| # | Achado | Evidência | Cartão |
|---|---|---|---|
| 1 | **Mensagem agendada nunca é enviada.** A tabela `scheduled_messages` tem RLS, índice e hook de tela, mas nenhuma Edge, função SQL ou job do pg_cron a consome. No banco vivo a tabela está vazia (nunca usada) e nenhum dos 13 jobs de `cron.job` a toca. A V3 também não tinha enviador dedicado. | consulta agregada em 11/10 | `AG2` (enviador) |
| 2 | **Agendar anuncia "Mensagem agendada!" mesmo com falha** de upload ou gravação: o `catch` de `ChatPanel.handleScheduleMessage` engole o erro e o diálogo só vê ausência de exceção. | `ChatPanel.tsx:311-336`, `ScheduleMessageDialog.tsx:58-64` | `AG1` |
| 3 | **Editar mensagem diz "editada" sem editar no WhatsApp** quando falta `external_id`, instância ou JID (atualiza só o banco local); a janela de 15 min não é revalidada no envio; UPDATE com 0 linhas não avisa. | `useChatPanelHandlers.ts:164-186` | `PH1` |
| 4 | **"Copiado!" falso** quando a cópia falha (permissão negada). | `useChatPanelHandlers.ts:217` | `PH1` |
| 5 | **Adiar conversa para "próxima semana" erra no domingo** (+8 dias) e mantém minutos e segundos; sem aviso de erro; delete+insert não atômico. | `useConversationActions.ts:187` | `SN1` |
| 6 | **`/archive` não arquiva**: faz `assigned_to = null` (devolve à fila) e avisa "Conversa Arquivada"; `/snooze` e `/priority` sem argumento não fazem nada em silêncio. | `useChatPanelHandlers.ts:353-363` | `PH1` |
| 7 | **Alerta de SLA fixo em 2 min** (`warningMinutes ?? 2`) e o indicador não passa o parâmetro: com prazo de 60 min só alerta nos últimos 2 min. | `useSLACalculation.ts:49`, `SLAIndicator.tsx:72` | `SL1` |
| 8 | **1 consulta de reações por mensagem** ao abrir a conversa; o hook em lote já existe e ninguém o usa. | `MessageReactions.tsx:42,202`, `useBatchReactions.ts` | `RB1` |
| 9 | **Transferir fecha o diálogo mesmo com erro**, sem compare-and-set, sem soltar `assigned_to` ao ir para fila, sem auditoria. | `ChatPanel.tsx:300-309`, `TransferDialog.tsx:65-66` | pergunta (seção 4) |
| 10 | Código pronto e **sem uso**: `MessageSendHistorySheet`, `summarizeDeliveryProgress`, `MessageContextMenu`, `ChatHeader.tsx` (parte 1). | busca de importadores | `C1`, `C2`, `C4` |

## 3. Lacunas de funcionalidade, com destino

| Regra da V3 | Situação na V2 | Valor | Destino |
|---|---|---|---|
| Link direto para mensagem (`?message=`), busca global leva à mensagem, rolagem com retentativa, paginação para trás, "não encontrada" | ausente; clicar em citação fora da janela não faz nada | A | `DL1` + `DL2` |
| Agrupamento de bolhas com janela de 5 min; timestamp inválido não agrupa | agrupa só por remetente e dia | M | `GR1` |
| Rolar ao fim ao enviar | só rola se estiver perto do fim | M | `GR1` |
| Texto do compositor em store externo (só o campo re-renderiza) | `useState` no `ChatPanel`, re-renderiza o painel a cada tecla | M | `IN1` |
| Seta para cima edita a última mensagem; ferramentas travam em envio/edição; microfone travado com texto | ausentes | M | `IN2` |
| Menções com cache e erro tratado; áudio vencido se recupera; colar arquivo qualquer | ausentes | B/M | `PO1` |
| Drop durante envio ignorado; segmento RFM em português; link "pular para as mensagens" | ausentes | B | `PO2` |
| Indicador de SLA com regra, nível e prazos | só 1ª resposta | M | `SL2` |
| Humanizar erro de envio (10 frases de ação), taxonomia de causa, vocabulário unificado | só "Erro ao enviar" | A | `M2`, `M4`, `R2` (já em andamento) |
| Reenvio manual com trava contra duplo clique | inexistente | A | `R1`, `R2` |
| Histórico por tentativa, métricas, detalhes técnicos só admin | inexistente | A | `M1`..`M6` |
| Assumir e devolver à fila | inexistente | A | `T1`..`T3` |
| Sugestões de automação com base de conhecimento | inexistente | M | `A1`..`A3` |
| Favoritar, fixar, adiar e reportar mensagem | inexistentes | M | `F1`..`F4b` |
| Arquivos da equipe | inexistente | M | `TF1`, `TF2` |
| Busca: vazio explícito, "+N", rótulos de teclado | parcial | B | `C5` |
| Estado vazio e "Rolar para o final" | ausentes | M | `C6` |
| Respostas rápidas por teclado | parcial | M | `C7` |
| Tipo de mensagem sem renderizador | balão vazio | A | `C8a`, `C8b` |

## 4. Decisões pendentes (perguntadas ao Joaquim)

1. **Sussurro no compositor** (Alt+W, nota interna sem ir ao cliente) em vez do painel separado `WhisperMode`.
2. **Transferir robusto**: resultado `success/partial/error`, compare-and-set, mensagem de sistema na linha do tempo e auditoria.
3. **Resolver × Encerrar × Arquivar**: hoje "Marcar como resolvido" e "Encerrar Conversa" chamam o mesmo handler.
4. **Nome do remetente em grupos**: exige coluna de participante em `messages` e mudança no webhook.
5. **Alerta de atraso de entrega** (`sla_delivery_rules` + tela de configuração).
6. **Escopo "Meus / Departamento / Todos"** da inbox com auditoria de acesso indevido.
7. **Comandos `/note` e `/tag`** (retirados em R2-INB-021 por falta de destino; hoje o destino existe) e **botão interativo que responde ao cliente**.
8. **Vocabulário de status** ("Lido" → "Visualizada", estados `played`, `failed_auth`, `failed_retries`).

## 5. Onde a V2 é melhor que a V3 (não portar)

- Carregar mensagens antigas: âncora por item-chave, reaplicada até assentar, com `aria-busy` (a V3 usa `scrollHeight`).
- Idempotência de envio: `client_message_id`, posse temporária (`claim`), dedupe entre abas em 2 s; o navegador só enfileira e a Edge detém a transição de status.
- Não retenta às cegas quando o resultado é ambíguo (evita mensagem duplicada no WhatsApp).
- Rascunho por usuário e contato, com purga do formato legado (a V3 expunha o rascunho entre atendentes do mesmo navegador).
- Limite de 4096 medido no payload real; `AIEnhance`/`AIRewrite` descartam resposta atrasada; Ctrl+K/Ctrl+F sem duplo toggle; `/remind` cria tarefa real; `/resolve` usa fechamento atômico.
- Digitando separa contato de colega; presença neutra ("não informada") em vez de afirmar "Ativo".
- Busca "Última interação" preserva o início exato da sessão (regressão #322).
- SLA do cabeçalho usa `firstResponseAt` real (a V3 deriva da última mensagem do agente, errado).
- Ordem "transporte antes de gravar" nas reações; mídia privada com URL assinada, cooldown e semente em lote.
- Timeline de envio sem horário inventado, com lease visível.

## 6. Descartado de propósito

`ChatWatermark` (removido de propósito), `ChatMessageBubble` (duplica `MessageBubble`), checklist e validação visual "10/10" (ferramenta interna), fila de envio no cliente (a V2 tem fila no servidor), `ChatScrollerV2`/`scrollLoaderController` (sem uso na própria V3), reação otimista (a ordem da V2 é intencional), retry de avatar (ganho mínimo).

## 7. Limites desta auditoria

- Leitura estática: nenhum teste foi executado. As classes vêm de leitura de código; os pontos críticos foram reconferidos por mim.
- A branch `dia/*` é viva; números de linha podem ter mudado depois da leitura.
- Não verificado: se `messages.status` aceita `played` (nenhuma restrição encontrada por busca); se existe worker de agendamento fora do repositório (n8n, Lovable); conteúdo de `offlineQueue.ts`; reset de estado do compositor ao trocar de conversa (V2 recria o painel por `key`, equivalente por construção).
- Os documentos 08-chat-2, 09, 10, 11 e 12 da V3 (outros componentes do inbox) ainda não foram auditados.
