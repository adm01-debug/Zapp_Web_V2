# Auditoria de paridade V3 → V2, parte 3: hooks, dados e testes (documento 08-chat-2)

> Data: 11/10/2026 · Somente leitura · Complementa as partes 1 e 2
> Fonte V3: `docs/estado/08-features-inbox-components-chat-2.md` (hooks, utilitários e 27 testes da pasta `chat`) + código da V3
> Alvo V2: branch viva `dia/2026-10-11` e banco vivo (só metadados de políticas e contagens)
> Método: três leitores independentes (testes como especificação; dados, contratos e identidade; defeitos do §8 aplicados à V2) + minha reconferência no código e no banco dos achados graves.

## 1. O que este documento trouxe de novo

Cerca de metade já estava coberta (partes 1 e 2 e cartões existentes). O novo está em três frentes:

1. **Segurança de dados na V2** (três riscos que nenhum cartão cobria; dois confirmados no banco vivo).
2. **Defeitos de mesma classe que a V3 documentou**, achados no código da V2 (falsos sucessos, anexo que se perde, realtime que não se recupera).
3. **Buracos de teste**: a V2 tem o comportamento e não tem a prova (nenhum dos 27 testes da V3 tem par na V2).

## 2. Riscos de segurança confirmados

| # | Achado | Confirmação | Cartão |
|---|---|---|---|
| 1 | **Qualquer agente reescreve o conteúdo de uma mensagem** (recebida ou enviada) pelo console: a política de UPDATE de `messages` só exige visibilidade do contato, sem `WITH CHECK` nem restrição de colunas; o gatilho de guarda só protege linhas em `sending`. A edição do cliente faz `UPDATE` direto. | política lida no banco vivo | `ED1`, `ED2` |
| 2 | **`scheduled_messages` não checa visibilidade do contato nem permissão de envio** no INSERT/UPDATE (só o dono do registro). Com o enviador rodando com privilégio de serviço, entregaria a contato fora do alcance do autor. | política lida no banco vivo | `RL1` + reautorização no refazer do `AG2` |
| 3 | `whisper_messages`: o INSERT checa só o remetente, não a visibilidade do contato (a leitura já é restrita; estado final melhor que o das migrations antigas) | política lida no banco vivo | `RL1` |

## 3. Defeitos ativos na V2 (mesma classe dos do §8 da V3), com cartão

| Defeito | Evidência | Cartão |
|---|---|---|
| Apagar mensagem diz "deletada para todos" mesmo quando o WhatsApp falhou; segundo `UPDATE` redundante e `catch` morto | `MessageHoverToolbar.tsx:52-75`, `ChatMessagesArea.tsx:113-119` | `DM1` |
| Anexo some se o envio falha (`handleClose()` antes do envio; no lote descarta os que falharam); prévias não liberadas no desmonte | `useFileUploadLogic.ts:210-261` | `AX1` |
| Sem recuperação após queda do realtime ou máquina dormindo | `useSupabaseRealtime.ts:65-76` | `RT1` |
| Canais realtime com nome fixo (áudio, reações, sussurro, status) | `AudioMessagePlayer.tsx:44-53` e outros três | `RT2` |
| "/obrigado" + Enter não envia; `/summary` abre o painel errado; texto e áudio podem sair juntos; envio sem contato anuncia sucesso | `useChatPanelHandlers.ts:305,405,151,499`; `ChatPopup.tsx`, `useRealtimeInbox.ts` | `PH2` |
| Voz e velocidade da leitura gravam o valor anterior | `ChatPanel.tsx:227-228` | `TS1` |
| "Copiado!" sem confirmar a cópia em mais 4 pontos | `AIResponseCard`, `useObjectionDetector`, `useConnectionsManager`, `Contact360Helpers` | `CP1` |
| Trocador de voz sem tratamento de falha; `play()` recusado deixa `isPlaying` verdadeiro | `VoiceChanger.tsx:82,99-107` | `VZ1` |
| Overlay de arraste preso depois de soltar no seletor de figurinhas | `ChatPanel.tsx:356-357`, `useStickerPicker.ts:115` | `DG1` |
| Tag do contato perdida por ler e regravar o array | `useContactQuickActions.ts:77` | `TG1`, `TG2` |
| Cerca de 13 consultas ao abrir ou trocar de conversa, sem aborto | `ChatPanel.tsx` e hooks de montagem | `PF1` |
| Sussurro do painel sem destinatário e erro ignorado | `WhisperMode.tsx:106-118` | `WM1` |
| Testes que copiam a regra de produção (status de entrega, telefone, grupos) | `lib/__tests__/*` | `TT1` |
| Robustez e IDs: batcher sem cleanup, listeners sem `try/catch`, `Date.now()` em nomes de arquivo, `catch` que só loga | vários | `RB2` |

## 4. Buracos de teste (comportamento existe, falta prova)

`handleSlashCommand` inteiro, `handleSendLocation`, janela de 15 min da edição, arrastar e soltar do painel, reducer de diálogos (não exportado, tipo duplicado em três lugares), filtro e contagem de uso das respostas rápidas, reset da busca, e na barra de busca o botão X, o contador e as setas desabilitadas → `TT2`, `TT3`.

## 5. Decisões do dono (11/10, 3ª rodada)

- **Agendamento:** sem limite de antecedência; se o job parar, envia até 15 min de atraso e depois expira com aviso ao autor; assinatura do atendente aplicada ao texto agendado. (Embutido no refazer do `AG2`; `AG3` e `AG4` entregam estado e tela.)
- **`/priority`:** prioridade manual separada que a IA nunca sobrescreve (`MP1`..`MP3`).
- **Encaminhar:** para grupos (`FW1`..`FW4`) e com a marca "➡️ Encaminhada" (`FWD`).
- Mantida a decisão anterior: `/note` e `/tag` **não** voltam.

## 6. Já coberto por cartões anteriores

Botão interativo (`IB1`), deep link e `scrollToMessage` com retorno (`DL1`, `DL2`), agrupamento com janela e data inválida (`GR1`), sussurro no compositor (`WH1`, `WH2`), filtro de falhas (`FF1`, `FF2`), vocabulário de status (`VC1`..`VC3`), atraso de entrega (`SD1`..`SD4`), edição que exige `external_id` (`PH1`), abrir e fechar do histórico de envio (`C1`), `/archive` e `/snooze` (`PH1`, `SN1`), respostas rápidas por teclado (`C7`).

## 7. Onde a V2 é melhor (não portar)

Identidade só por UUID (sem a ambiguidade UUID/JID da V3), envio idempotente com visibilidade e permissão no banco, localização, produto e interativo pela fila canônica, encaminhamento com resultado por destino e retry só dos que falharam, lembrete como tarefa real, `contact_notes` com RLS forte, anexo agendado como localizador em bucket privado assinado só no envio, correção IDOR de soneca, fixadas e favoritos. **Não portar:** trocar a voz de um áudio já enviado (`useAudioVoiceChange`): alteraria mídia que o cliente já recebeu; telemetria `window.__loadOlderMetrics`; `scrollLoaderController` (sem uso na própria V3).

## 8. Limites

Leitura estática; os achados de segurança e as políticas foram reconferidos por mim (banco vivo, só metadados). Não verificado: migrations posteriores a `20260925120000` que possam ter alterado políticas de `messages` além das lidas no catálogo; formato real de `contacts.phone`; se o `message-delivery` assina o localizador de mídia no envio; comportamento em runtime.
