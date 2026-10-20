# Plano de paridade V3 → V2 — doc 07 (inbox: serviços, hooks especializados e utils), segunda passada

Data: 13/10/2026. Pedido do Joaquim: auditar `docs/estado/07-features-inbox-services.md` da V3 e achar o que existe lá e não existe (ou é pior) na V2.

## 1. Como foi feito
- O doc 07 (junto com o 06) já tinha sido auditado em 12/10 (cartões `PD-61..PD-95`). Esta é a **segunda passada**: 4 leitores em paralelo, somente leitura, comparando o **código real da V3** (o documento é de agosto e está defasado) com a V2, **por comportamento**, e reportando só o que não tem cartão.
- Recortes: (1) leitura de mensagens, status do WhatsApp, presença e identidade de contato; (2) voz, SIP, cache de mídia e métricas; (3) reações e Team Chat; (4) inventário de tabelas, RPCs, exports, utils e arquivos fora do documento.
- Eu conferi cada achado P1 no código da V2 antes de criar cartão. Três achados foram **cortados ou reduzidos** (ver §4). O banco real não foi consultado: os cartões de banco mandam conferir no banco local antes de alterar.
- Relatórios completos (fonte), em `docs/audits/` (3 arquivos neste cartão; a PARTE4 vai em cartão próprio, t_6587228b, filho deste — limite de 90k do fechar; os números do §2 cobrem a 2ª passada inteira, 4 partes):
  - `AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE1_MENSAGENS_PRESENCA.md`
  - `AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE2_VOZ_SIP_MIDIA.md`
  - `AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE3_REACOES_TEAMCHAT.md`

## 2. Resultado em números (167 comportamentos)
| Classificação | Itens |
|---|---|
| Equivalente | 44 |
| **V2 melhor que a V3** | 40 |
| Decisão (não portar) | 33 |
| Lacuna já coberta por cartão | 15 |
| Código morto na V3 | 4 |
| **Lacuna real sem cartão** | 31 (virou 15 cartões) |

A V2 está claramente melhor que a V3 em: reações em lote (transporte antes da gravação), toggle de reação da equipe por RPC atômica, paginação por cursor com desempate, presença com TTL no servidor, SIP (token de tentativa, aba líder, 403 = linha em uso, ~20 testes), agente de voz (um comando substitui o outro), Edges de voz (autenticação, limite persistente, ledger de custo).

O doc 07 está errado em vários pontos (a V3 real lê `messages` por UUID e não `evolution_messages`; o retry real tem 2 tentativas/500 ms; o SIP real não tem estado `reconnecting`; o `useVoiceAgent` da V3 é uma casca). Não use o doc como especificação.

## 3. Cartões (PH-01..PH-15 + PH-00 de documentação)
**P1 (prioridade 6):**
- PH-01 hugo — "Arquivar" em lote do inbox só tira o responsável; passa a arquivar de verdade (e corrige o teste que exige o erro).
- PH-02 workersql — sinal de "agente ausente" usa a presença real (`agent_presence`) em vez de `user_sessions.last_activity_at`.
- PH-03 edgar — `find-status-messages` só devolve status de contato que o usuário pode ver.
- PH-04 hugo — Team Chat: busca no servidor, estado de erro e reconciliação das mensagens "mais antigas".
- PH-05 workersql — LGPD de `voice_command_logs`: limite de tamanho, apagar os próprios, expurgo por prazo, política.
- PH-06 edgar — voz: não logar a fala do usuário; timeout nas chamadas ao ElevenLabs.
- PH-07 hugo — mídia do WhatsApp vencida passa a ser recuperada pelo front (liga a Edge `recover-message-media`).
- PH-08 hugo — SIP desregistra e para o ramal ao desmontar, sair e fechar a aba.
- PH-09 workersql — Team Chat no banco: publicação realtime, REPLICA IDENTITY, UPDATE/DELETE de ex-membro, políticas somadas (conferir antes).

**P2 (prioridade 5):** PH-10 hugo (realtime do Team Chat), PH-11 iris (reações: plural, pending/erro), PH-12 hugo (contato aberto fora da lista), PH-13 hugo (robustez da voz), PH-14 iris (voz e vídeo: autoplay, falha de TTS, vídeo sem spinner eterno), PH-15 workertestes (testes ausentes).

**Documentação:** PH-00 worker — grava esta auditoria e este plano em `docs/audits/` e `docs/plans/`.

**Adicionados em 13/10 (ordem do Joaquim):**
- PH-16 hugo `t_38e58f50` — status do WhatsApp: sem `send-chat-presence`, token de geração por telefone, conexão do contato.
- PH-17 hugo `t_5b8b86cf` — hook que liga a RPC `transfer_team_conversation_department` (já existe no banco, sem chamador).
- PH-18 iris `t_47e2d408` — diálogo "Mover para outro departamento" (filho do PH-17).

## 4. O que foi cortado depois da conferência
- "Marcar sussurro como lido" sem política de UPDATE: não se confirma na V2 (o sussurro foi refeito em WH1/WM1/RL1, ainda sem integrar). Sem cartão.
- Acessibilidade dos badges de reação: `aria-label` e `aria-pressed` já existem; o defeito real é só o plural "reaçãoões" (PH-11).
- Contato fora da lista: a V2 já tem carregamento de contingência; falta só guarda de UUID e estado de erro (PH-12).
- Presença `paused` do status do WhatsApp (efeito colateral ao abrir): vai como comentário no cartão WS1, sem cartão novo.

## 5. Decisões que dependem do Joaquim (sem cartão)
1. ~~Transferir conversa entre departamentos~~ — DECIDIDO: portar (PH-17, PH-18).
2. Dois `useVoiceAgent` na V2 (`hooks/voice/` e `hooks/communication/`): o PH-13 verifica qual vale e só remove o morto se nada importar.

## 6. Como será validado (no fim)
Para cada cartão: relato com a linha de resultado dos testes, `zapp-verify . --rapido` verde, e, nos de banco, prova no banco **local** com os papéis reais (sem papel, agent, supervisor, admin). Eu confiro a integração na `dia` e reviso o que o revisor recusar. Nada vai para produção sem autorização.

## 7. Não consegui verificar
Banco real (políticas finais, publicação realtime, dados de `user_sessions`, cron e linhas de `voice_command_logs`); runtime; autoplay no Safari/iOS; se o logout desmonta o provedor de chamadas e por quanto tempo o REGISTER do SIP vale no servidor.

## 8. Atualização de 13/10 08:15 — 3 cartões a mais e decisão tomada
- **PH-16** hugo `t_38e58f50` — status do WhatsApp: abrir o status não envia presença ao contato, resposta atrasada é ignorada, usa a conexão do contato (antes só um comentário no WS1).
- **PH-17** hugo `t_5b8b86cf` — Team Chat: hook para mover conversa de departamento (liga a RPC `transfer_team_conversation_department`, hoje sem chamador).
- **PH-18** iris `t_47e2d408` — Team Chat: diálogo "Mover para outro departamento" (admin e supervisor), depende do PH-17.
- A decisão 1 do §5 (transferir conversa entre departamentos) foi **tomada**: portar (PH-17/18). Resta só a decisão 2 (`useVoiceAgent` duplicado), que o PH-13 verifica.
- Total: **19 cartões** (PH-00..PH-18). Acompanhamento: `python3 ~/arquitetura-v2/paridade-07/acompanhar.py`. Validação final = todos `NA_DIA` e, nos de banco, prova no banco local conferida.
