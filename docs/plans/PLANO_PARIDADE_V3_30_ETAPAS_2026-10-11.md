# Plano de paridade V3 → V2 do chat do inbox, em 30 etapas

> Data: 11/10/2026 · Dono: Joaquim · Planejamento, delegação, acompanhamento e validação: Claude · Execução: agentes Hermes especializados
> Base: auditorias `AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE1_2026-10-11.md` e `…PARTE2_COMPORTAMENTO_2026-10-11.md`, e as decisões do Joaquim de 11/10.
> Cartões: ids em `~/arquitetura-v2/paridade-v3/ids_todos.json`; geradores em `faixa_c.py`, `faixa_d.py`, `faixa_e.py`, `faixa_f.py` (mesma pasta).

## 1. Objetivo e critério de sucesso

Trazer para a V2 o que a V3 (aposentada) tinha de útil no chat do inbox, corrigindo ao mesmo tempo os defeitos ativos que a auditoria achou, sem copiar código (os modelos de dados são diferentes) e sem regredir o que a V2 já faz melhor.

Sucesso = todas as 30 etapas com o critério de aceite cumprido **no código integrado na branch do dia**, validadas por mim, e a promoção para a `main` pronta com roteiro e reversão, aguardando apenas o seu aval.

## 2. Princípios (aprendidos nesta frente)

1. **Cartão `done` não é código integrado.** A etapa só vale quando a entrega está `integrada`. Por isso existe o **portão de integração** (etapa 3): o filho só começa depois que o pai foi integrado.
2. **Todo requisito vai no corpo do cartão.** O revisor automático só enxerga o corpo; o que ficou só em comentário foi recusado como "fora do escopo".
3. **Divisão por camada** (banco → função de borda → hook → tela), cada uma com o perfil certo; cartão que atravessa camadas é recusado ou bloqueia.
4. **Cada decisão do Joaquim já está tomada** (seção 6). Nada é deixado para depois; o que depende dele vira portão explícito (seção 7).
5. **Design:** criativo, moderno, interativo, só tokens do sistema, movimento reduzido respeitado.
6. **Segurança por padrão:** RLS com política explícita, `SECURITY DEFINER` com `search_path` fixo, payload bruto só para admin, auditoria sem dado pessoal.

## 3. As 30 etapas

Legenda: **Onda** 0 a 5. **Cartões** = ids curtos (ver `ids_todos.json`). **Aceite** = como eu valido, olhando o código integrado.

### Onda 0: fundação e governança

| # | Etapa | Cartões | Aceite |
|---|---|---|---|
| 1 | Auditoria de paridade, partes 1 e 2 | (feito) | Dois relatórios em `docs/audits/` com evidências e destino de cada achado |
| 2 | Decisões do dono registradas | (feito) | Seção 6 deste plano e handoff atualizados |
| 3 | **Portão de integração entre cartões** | `portao.py` (feito) | Filho nunca inicia antes de o pai estar integrado; `portao.py estado` lista cada portão e o motivo |
| 4 | Qualidade de cartão: escopo de design no corpo e regras de interação segura | (feito, 15 corpos editados) | Taxa de refazer por motivo "fora do escopo" cai a zero nos cartões novos |
| 5 | **Flags de funcionalidade com rollout** (percentual, papel, usuário, expiração) | `FL1` banco, `FL2` hook, `FL3` tela de admin | Avaliador testado (percentual estável por usuário, papéis, bloqueios, expiração); admin liga e desliga sem deploy |

### Onda 1: integridade do envio

| # | Etapa | Cartões | Aceite |
|---|---|---|---|
| 6 | **Agendamento de ponta a ponta** | `AG1`, `AG2` | Falha de upload ou gravação não anuncia sucesso; mensagem vencida é enfileirada uma vez por job a cada minuto; cancelada nunca sai |
| 7 | Ações do painel sem falso sucesso | `PH1`, `SN1` | Editar exige confirmação do WhatsApp; cópia só confirma se copiou; adiar para domingo cai na segunda 09:00:00; `/archive` faz o que diz |
| 8 | Visibilidade do envio | `C1`, `C2`+refazer, `C4`, `D0`+refazer, `D1` | Histórico de envio acessível pelo menu; barra de entrega e aviso de falha na conversa; código morto removido; kit de microinterações publicado |
| 9 | Tentativas de envio e métricas | `M1`, `M1b`, `M2`, `M3`, `M4`, `M5`, `M6` | Cada tentativa grava código e erro sanitizado; histórico por tentativa; detalhe técnico só admin; painel de métricas só admin e supervisor |
| 10 | Reenvio da mesma mensagem | `R1`, `R2` | RPC com limite de 3 e auditoria; botão "Tentar agora" volta a mesma linha para `sending` |
| 11 | Vocabulário e estados de entrega | `VC1`, `VC2`, `VC3` | "Visualizada" no lugar de "Lido"; `played`, `failed_auth`, `failed_retries` aceitos e gravados sem regredir a prioridade de status |

### Onda 2: navegação e desempenho

| # | Etapa | Cartões | Aceite |
|---|---|---|---|
| 12 | Reações em uma consulta | `RB1` | Abrir conversa de 50 mensagens faz no máximo 1 consulta de reações; realtime não é sobrescrito |
| 13 | Rolagem e agrupamento | `C6`, `GR1` | Estado vazio e "Rolar para o final"; bolhas agrupadas por janela de 5 min; enviar rola ao fim |
| 14 | Link direto e realce | `DL1`, `DL2` | `?message=` e busca global levam à mensagem; citação fora da janela carrega e rola; mensagem inexistente avisa |
| 15 | Compositor: desempenho, teclado e polimento | `IN1`, `IN2`, `C5`, `C7`, `PO1`, `PO2` | Digitar não re-renderiza o painel; seta para cima edita a última; busca e respostas rápidas com vazio, dicas e teclado; menção com cache; áudio vencido se recupera |

### Onda 3: operação do atendimento

| # | Etapa | Cartões | Aceite |
|---|---|---|---|
| 16 | Assumir e devolver à fila | `T1`+refazer, `T2`, `T3` | Permissão e corrida testadas; barra no cabeçalho com desfazer |
| 17 | Transferir robusto | `TR1`, `TR2`, `TR3` | Compare-and-set, solta o responsável ao ir para fila, auditoria visível no histórico; diálogo só fecha no sucesso |
| 18 | Resolver, Encerrar e Arquivar | `RS1` | Três handlers distintos; Arquivar só com UUID |
| 19 | Escopo da inbox | `ES1`, `ES2`, `ES3` | Meus, Departamento e Todos por permissão; tentativa indevida auditada uma vez por hora |
| 20 | SLA: alerta proporcional, regra no tooltip, atraso de entrega | `SL1`, `SL2`, `SD1`, `SD2`, `SD3`, `SD4` | Atenção a 30% do prazo; tooltip com regra e nível; regra de atraso configurável por admin; chip no cabeçalho |
| 21 | Sussurro no compositor e botão interativo | `WH1`, `WH2`, `IB1` | Sussurro nunca sai pelo WhatsApp; clique no botão responde ao cliente uma vez |

### Onda 4: conteúdo e inteligência

| # | Etapa | Cartões | Aceite |
|---|---|---|---|
| 22 | Tipos de mensagem não suportados | `C8a`+refazer, `C8b` | Enquete, visualização única e contato viram cartão informativo; `ephemeralMessage` com conteúdo não vira controle |
| 23 | Remetente em grupos | `GP1`, `GP2`, `GP3`, `GP4` | Participante e nome gravados pelo webhook; nome na bolha; bloco por participante |
| 24 | Sugestões de automação | `A1`, `A2`+refazer, `A3` | Sugestões com fonte da base de conhecimento, limites de IA respeitados, cache por mensagem |
| 25 | Ações por mensagem | `F1`+refazer, `F2`, `F3`, `F4a`, `F4b` | Favoritar, fixar (máx. 3), adiar e reportar com permissão e auditoria |
| 26 | Arquivos da equipe | `TF1`, `TF2` | Painel lista só o que o usuário pode ver, sem bucket novo |

### Onda 5: prova, segurança e entrega

| # | Etapa | Cartões | Aceite |
|---|---|---|---|
| 27 | Funcionalidades novas atrás de flags e acessibilidade | `FL4`, `A11Y1` | Cada funcionalidade nova só aparece com a flag ligada; zero violação crítica de acessibilidade nas telas novas |
| 28 | Prova ponta a ponta e regressão integrada | `E2E1`, `E2E2`, `E2E3`, `RG1` | Fluxos críticos cobertos: agendar, falhar e reenviar, assumir e transferir, sussurro, link direto, grupo |
| 29 | Revisão de segurança e documentação | `SEC1`, `DOC1` | Relatório de segurança sem achado crítico em aberto; docs e runbooks atualizados |
| 30 | **Promoção controlada e validação final** | `PR1` + meu relatório final | Roteiro de promoção (ordem das migrations, flags iniciais, verificação, reversão por funcionalidade) e relatório cartão a cartão; aval do Joaquim para o lote ir à `main` |

## 4. Como acompanho e valido

1. **Acompanhamento contínuo:** `vigia.py` (cada 2 min) abre portões, desbloqueia filhos cujo pai foi integrado e me avisa de bloqueio ou falha.
2. **Validação mecânica por cartão** (`validar_entregas.py`): entrega integrada, arquivos tocados dentro da lista permitida, cor literal, listener global de teclado, `eslint-disable` novo, componente novo sem teste, migration sem RLS ou `search_path`.
3. **Validação semântica por mim**, no código da branch viva: o ramo de interface está realmente renderizado, o teste cobre o caso, o relato bate com o diff.
4. **Fechamento por etapa:** só marco a etapa quando todos os cartões dela estão integrados e validados; refazer conta como o mesmo cartão.
5. **Fechamento final:** relatório com as 30 etapas (feita, parcial, fora do escopo e por quê) em `docs/audits/`.

## 5. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Fila do integrador longa (centenas de entregas antigas) | Portões evitam trabalho inútil; eu priorizo triagem das entregas desta frente; relato diário do estado |
| Revisor recusa por contrato (nome de valor, `search_path`) | Corpos dos cartões repetem o contrato literal; refazer máximo 2 rodadas e eu leio cada recusa |
| Conflito de arquivo entre cartões (`ChatPanel.tsx`, `ChatMessagesArea.tsx`, `ChatPanelHeader.tsx`, `useChatPanelHandlers.ts`) | Dependências explícitas entre cartões que tocam o mesmo arquivo |
| Migration que só funciona no banco local | Ordem de promoção no `PR1` e verificação após cada aplicação |
| Custo de IA (sugestões de automação) | Limites por usuário e orçamento nos critérios do `A1`; flag desligada por padrão |
| Chave do provedor expira em 10/11/2026 | Registrada no handoff; renovar antes |
| Cartão bloqueado esperando decisão | Todas as decisões já foram tomadas; qualquer bloqueio novo eu leio e resolvo ou pergunto de uma vez |

## 6. Decisões do dono (11/10/2026)

Faixa C (tentativas, re-fila, assumir e devolver, automação, métricas só admin e supervisor, payload só admin, ações por mensagem completas, arquivos da equipe reaproveitando o chat de equipe); design criativo, moderno e interativo; sussurro no compositor; transferir endurecido; separar Resolver, Encerrar e Arquivar; remetente de grupo ponta a ponta; alerta de atraso de entrega com configuração; escopo da inbox com auditoria; botão interativo responde ao cliente; **`/note` e `/tag` não**; vocabulário "Visualizada" com estados novos no banco.

## 7. Portões que dependem do Joaquim

1. **Promoção do lote para a `main`** (etapa 30): squash e publicação são seus.
2. **Aplicação das migrations em produção**, na ordem do `PR1`.
3. **Ligar as flags** em produção e a faixa de rollout de cada uma.
4. **Renovação da chave** do provedor antes de 10/11/2026.

## 8. Cartões acrescentados depois da primeira versão do plano

As duas revisões seguintes (lacunas do próprio plano e a auditoria do documento `08-chat-2`, relatório da parte 3) acrescentaram cartões que se encaixam nas 30 etapas, sem criar etapa nova:

| Etapa | Cartões acrescentados |
|---|---|
| 5 Flags | `FL1` e `FL4` ganharam a flag `chat_forward_groups` |
| 6 Agendamento | `AG3` (status ao vivo e cancelamento que limpa o anexo), `AG4` (lista com estado e reagendar), `RL1` (RLS de agendadas e sussurro), decisões do dono embutidas no refazer do `AG2` |
| 7 Ações do painel honestas | `EV1` (erros de envio com ação), `PH2` (Enter com barra, `/summary`, trava texto×áudio), `CP1` (copiar com confirmação), `TS1` (voz e velocidade), `DM1` (apagar mensagem), `ED1` e `ED2` (edição só por RPC) |
| 8 Visibilidade do envio | `FF1` e `FF2` (filtro de falhas) |
| 15 Compositor e desempenho | `TM1` (templates com variáveis), `AX1` (anexo que não se perde), `PF1` (rajada de consultas), `VZ1` (trocador de voz), `DG1` (arraste preso), `RT1` e `RT2` (realtime se recupera, canais únicos), `RB2` (robustez, IDs com UUID) |
| 18 Resolver, Encerrar e Arquivar | `TG1` e `TG2` (tags atômicas) |
| 20 SLA e prioridade | `MP1`, `MP2`, `MP3` (prioridade manual que a IA não sobrescreve) |
| 21 Sussurro | `WM1` (painel de sussurro com destino e sem engolir erro) |
| 25 Ações por mensagem | `FWD` (marca "Encaminhada"), `FW1`..`FW4` (encaminhar para grupos) |
| 28 Prova e regressão | `TT1` (testes que copiavam a regra), `TT2` e `TT3` (buracos de teste) |
| 29 Segurança e documentação | `SEC1` agora revisa também `ED1`, `RL1`, `TG1`, `MP1`, `FW1`, `FW2`; `DOC2` (guia do atendente) |

Total acompanhado: **120 cartões** (ids em `~/arquitetura-v2/paridade-v3/ids_todos.json`).
