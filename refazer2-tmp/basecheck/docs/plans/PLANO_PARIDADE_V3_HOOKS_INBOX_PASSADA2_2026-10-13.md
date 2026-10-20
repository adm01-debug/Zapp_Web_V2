# Paridade V3 → V2: hooks do inbox, SEGUNDA PASSADA do doc 06 (13/10/2026)

> **Fonte:** `docs/estado/06-features-inbox-hooks.md` da V3 (retrato de 09/08; o código real da V3 manda). **Método:** o doc 06 (junto com o 07) já havia sido auditado em 12/10 e gerou 35 cartões (PD-61..95). Esta é a segunda passada: 4 agentes de leitura (envio, realtime, filtros e ações, mídia e testes) compararam o CÓDIGO da V3 com a branch viva da V2 comportamento a comportamento e listaram só o que a primeira não pegou; o Claude conferiu os achados P0/P1 no código vivo antes de criar cada cartão.

**Resultado:** 52 cartões novos (PH-01..PH-53): 1 P0, 28 P1, 23 P2. Todos criados e delegados ao especialista da área; dependências explícitas por arquivo (sem corrida) e por cartão existente.

## O que a segunda passada achou de mais grave
- **PH-01 (P0):** o mesmo texto enviado depois de uma ação feita sem rede é engolido em silêncio: o chat diz 'enviada' e nada sai.
- **PH-02..04 (P1):** o servidor esconde a causa de toda falha de envio (`Internal server error`) e o cliente nunca a lê; falha ambígua (a mensagem pode ter saído) é igual a falha definitiva e 'Enviar de novo' pode duplicar. A V2 também não tem nenhuma retentativa do despacho.
- **PH-20/21 (P1):** chamadas interrompidas (aba fechada, rede) ficam `ringing`/`answered` para sempre e distorcem Telefonia; não há `pagehide` nem varredor.
- **PH-41 (P1):** chamada recebida de contato sem responsável não toca para ninguém.
- **PH-42/43/44 (P1):** contato aberto de fora dos 500 carregados abre com SLA falso; o painel do contato não acompanha mensagens ao vivo; o aviso de mensagem nova fica mudo para o contato fechado no celular.
- **PH-13/40 (P1):** Ctrl+A fora de campo seleciona todas as conversas e Delete/Backspace arquiva a lista filtrada.
- **PH-07 (P1):** digitar `/atalho` não abre as respostas rápidas; a 51ª resposta é inalcançável.
- **PH-17/18 (P1):** vídeo, documento e arquivo apagado ficam em spinner eterno, sem mensagem.

## Decisões adotadas (padrão do Claude; o Joaquim pode vetar)
1. **Chamada sem responsável (PH-41):** toca para os membros online da fila do contato; sem fila ou sem ninguém online, supervisores e admins online.
2. **Permissões por canal (`inbox.view_whatsapp|instagram|chat`) e `inbox_custom_scopes` NÃO são portados:** na V3 são filtro só de tela, sem enforcement no banco; se a visibilidade por canal for desejada, entra como política RLS depois do ES1.
3. **Memória da conversa editável NÃO é portada** (o MV1 decidiu somente leitura).
4. **Presets de filtros do inbox (PH-14..16)** não sobem o texto da busca ao servidor (pode conter dado pessoal).
5. Continuam fora: tags/etiquetas, exportar/importar/edição em massa de contatos, deals, SLA de Resolução, Pagamentos, API pública, IMAP, backup MFA, bypass dev.

## Onde a V2 já é melhor (não portar)
Envio atômico no servidor (claim com lease e token), throttle que adia em vez de descartar, dedupe entre abas, mensagens ricas pela mesma fila, sem fallback de conexão (a V3 podia enviar pelo número errado), paginação por cursor das mensagens, reconexão com canal compartilhado, horário silencioso avaliado ao vivo, alerta de chamada por notificação com RLS (a V3 usa canal público), avatar no servidor, URL assinada em lote e fail-closed, telefonia (`CallEngine`, RPC idempotente, watchdog). Os achados A8/A9 do doc já estavam corrigidos na V3; **A10 é falso na V3 e verdadeiro na V2** (PH-15).

## Correções em cartões JÁ existentes (comentários, sem cartão novo)
- **TR1/TR2 (transferência):** a RPC `transfer_conversation` JÁ existe (migration 20261005185729) e já tem dois chamadores; 'criar' outra com assinatura diferente vira sobrecarga que contorna o compare-and-set. Reescrever: `DROP` da assinatura antiga na mesma migration, migrar os 2 chamadores, `FOR UPDATE`/compare-and-set, soltar o agente ao ir para fila e validar destino ativo.
- **MR2:** consumir o contrato do PH-19 (`em_espera`/`falha_temporaria`/`expirada`); botão de repetir fora de `expirada`.
- **EV1:** consumir o erro tipado do PH-02/PH-03.
- **KN1 (Alt+↑/↓):** ignorar `event.repeat`; Cmd no Mac (PH-31).
- **GL5 (avisos globais):** dedupe com um único conjunto LRU (sem reabilitar o aviso depois da poda) e nome de canal estável.
- **PD-73:** a V3 faz debounce de 50 ms com buffer que volta para a fila em falha, notifica só a mensagem mais recente por contato e descarta busca concorrente em voo.
- **PD-74:** cursor composto `(created_at, id)`. **PD-91:** retry só para erro transitório; mexer no TTL de presença junto. **PD-76:** canais com nome fixo (`whisper-`, `team-messages-`, `team-reactions-`, `termino-remoto-`, `talkx-*`, `multiplix-mon-*`).

## Cartões

| Cartão | Pri | Quem | O que | Espera por |
|---|---|---|---|---|
| **PH-01** | P0 | hugo | fix(chat): o mesmo texto enviado depois de uma ação offline não é engolido em silêncio | t_715b7d79 |
| **PH-02** | P1 | edgar | fix(edge): message-delivery devolve código de erro estável, se é retentável e se é ambíguo | t_8c6419cf |
| **PH-03** | P1 | hugo | feat(chat): erro de envio com causa clara e sem reenvio cego quando a mensagem pode ter saído | PH-01, PH-02, t_cea3fb8c |
| **PH-04** | P1 | hugo | feat(chat): reenvio automático do despacho com espera crescente, só quando é seguro | PH-03, t_b0bfb9af |
| **PH-05** | P1 | hugo | fix(chat): a fila offline tenta de novo sozinha com espera crescente e drena ao abrir a aba | PH-01, t_e2cf8af2, PH-04 |
| **PH-06** | P1 | workertestes | test(edge): message-delivery com um teste por ramo (claim, idempotência, 4xx x 5xx, recibo, 429) | PH-02 |
| **PH-07** | P1 | iris | fix(chat): digitar /atalho abre as respostas rápidas e a lista completa fica alcançável | t_17f4ab87, PH-04 |
| **PH-08** | P1 | hugo | fix(chat): a nota escrita ao transferir chega ao histórico, à jornada e à atividade do contato | — |
| **PH-09** | P1 | iris | feat(chat): mostrar a nota da transferência no histórico, na jornada e na atividade do contato | PH-08 |
| **PH-10** | P1 | workersql | fix(db): respostas rápidas: uso contado para todos, resposta global só por papel | — |
| **PH-11** | P1 | hugo | fix(chat): respostas rápidas acham sem acento, favoritos por usuário e uso pela RPC | PH-10 |
| **PH-12** | P1 | hugo | fix(inbox): a seleção em lote acompanha o filtro: nada age sobre conversa que o usuário não vê | t_2901d317 |
| **PH-13** | P1 | hugo | fix(inbox): atalhos de seleção em lote no registro de atalhos, com guardas contra acidente | t_1d5cf3e3, t_8e895114 |
| **PH-14** | P1 | workersql | feat(db): filtros salvos do inbox com limite de 20 por usuário e sem nome repetido | — |
| **PH-15** | P1 | hugo | feat(inbox): filtros salvos do inbox sincronizados entre dispositivos | PH-14 |
| **PH-16** | P1 | iris | feat(inbox): menu 'Filtros salvos' na lista de conversas | PH-15 |
| **PH-17** | P1 | hugo | fix(chat): mídia que falha ao carregar expõe o estado de falha e permite tentar de novo | t_7d7d9106 |
| **PH-18** | P1 | iris | fix(chat): vídeo, documento e imagem com mídia indisponível mostram mensagem e 'Tentar de novo' | PH-17 |
| **PH-19** | P1 | edgar | fix(edge): recover-message-media diz se é espera, falha temporária ou mídia vencida de vez | t_4ebeb0c4 |
| **PH-20** | P1 | workersql | fix(db): chamadas que ficaram 'tocando' ou 'em andamento' para sempre são encerradas por um varredor | — |
| **PH-21** | P1 | hugo | fix(calls): fechar a aba ou perder a rede durante uma chamada grava o fim da chamada | — |
| **PH-22** | P1 | hugo | fix(chat): áudios da conversa tocam um por vez e guardam posição e velocidade ao sair da tela | — |
| **PH-23** | P1 | iris | fix(chat): agendar mensagem com áudio, imagem ou arquivo sozinho, com validação e progresso | t_6b297314, PH-07 |
| **PH-40** | P1 | iris | fix(inbox): a tela do inbox usa o registro de atalhos e pede confirmação para arquivar muitas conversas | PH-13, PH-12 |
| **PH-41** | P1 | workersql | fix(db): chamada recebida de contato sem responsável toca para a fila ou a supervisão online | — |
| **PH-42** | P1 | hugo | fix(inbox): conversa aberta de fora da lista carregada vem com SLA, última mensagem, não lidas e atualização ao vivo | t_b3a9aa76, t_f73eb99b, PH-44 |
| **PH-43** | P1 | hugo | fix(chat): o painel do contato acompanha mensagens ao vivo (estatísticas, histórico, CRM 360, próxima ação) | — |
| **PH-44** | P1 | hugo | fix(inbox): o aviso de mensagem nova sabe qual conversa está aberta em todos os caminhos | — |
| **PH-45** | P1 | iris | fix(inbox): 'Voltar', PiP e nova conversa na tela do inbox deixam de ficar sem aviso de mensagem | PH-44, PH-40 |
| **PH-25** | P2 | hugo | fix(chat): enquete, contato, botões e lista passam pelo mesmo controle de rajada, abas e rede | PH-04, PH-05 |
| **PH-26** | P2 | hugo | fix(chat): fila offline em memória avisa que a mensagem some se a aba fechar | PH-05 |
| **PH-27** | P2 | iris | fix(chat): envio de figurinha e mídia com pré-teste coerente com o servidor | PH-03 |
| **PH-28** | P2 | iris | fix(chat): o aviso 'Mensagem enviada' não promete um 'Desfazer' que não desfaz | PH-04, PH-07 |
| **PH-29** | P2 | hugo | fix(inbox): recarregar mantém aba, fila e tipo escolhidos e não abre numa lista vazia | — |
| **PH-30** | P2 | iris | fix(inbox): link ?contact= abre a conversa certa, uma vez, e limpa a URL | PH-40, t_f89b8a0f, PH-45 |
| **PH-31** | P2 | hugo | fix(inbox): atalhos '/', segurar tecla e Cmd no Mac funcionam e recarregar não perde o estado | PH-40 |
| **PH-32** | P2 | hugo | fix(inbox): busca da lista acha sem acento e telefone formatado; data só com 'até' filtra | PH-29 |
| **PH-33** | P2 | hugo | fix(chat): busca dentro da conversa sem ruído de endereço de mídia e sem resultado falso | — |
| **PH-34** | P2 | hugo | fix(chat): assinatura da mensagem não duplica e não consulta a rede a cada abertura | — |
| **PH-35** | P2 | iris | fix(inbox): transferir em lote oferece colegas de verdade ou fica só para fila | t_2901d317, t_8016679b |
| **PH-36** | P2 | hugo | fix(calls): recuperação de mídia com teto de pedidos que sobrevive à lista virtualizada | t_add95119 |
| **PH-37** | P2 | hugo | chore(hooks): arquivos 'use...' que não são hooks passam a ter o nome do que são | — |
| **PH-38** | P2 | workertestes | test(inbox): lacunas de teste da lista de conversas, atalhos, assinatura e respostas rápidas | PH-12, PH-40, PH-07 |
| **PH-39** | P2 | workertestes | test(inbox): lacunas de teste de mídia, áudio e chamada | PH-17, PH-21, PH-22 |
| **PH-46** | P2 | hugo | fix(realtime): aba oculta não refaz a busca de reconexão e a lista se revalida a cada 5 minutos com a aba visível | t_b3a9aa76, t_16d081eb, PH-47 |
| **PH-47** | P2 | hugo | fix(realtime): atualização de mensagem antiga de contato fora da lista não vira 'mensagem nova' | t_b3a9aa76, PH-42 |
| **PH-48** | P2 | iris | feat(inbox): novas mensagens são anunciadas a leitores de tela | PH-45, PH-30 |
| **PH-49** | P2 | hugo | perf(crm): presença dos agentes só notifica quando algo mudou | t_644f43e3 |
| **PH-50** | P2 | hugo | fix(notificacoes): notificação do navegador que falha não derruba o aviso em tela e leva à conversa | — |
| **PH-51** | P2 | hugo | fix(chat): mensagens com o mesmo instante mantêm ordem estável entre carga inicial e tempo real | PH-43, PH-42 |
| **PH-52** | P2 | hugo | fix(inbox): o botão de som da caixa de entrada respeita o som desligado nas configurações | PH-44, PH-42 |
| **PH-53** | P2 | workertestes | test(realtime): testes de notificações, chamada recebida, sussurros e dos casos novos de realtime | PH-44, PH-50 |

## O que NÃO foi verificado (e por quê)
- **Banco de produção:** o conector do banco ficou fora do ar durante a auditoria; contagens reais (chamadas órfãs, respostas rápidas globais criadas por atendente comum, `saved_filters` duplicados, mensagens presas) ficam para quem aplicar as migrations, sempre em banco local primeiro.
- **Execução real:** os agentes só leram código; os achados P0/P1 foram conferidos pelo Claude no código vivo, mas NENHUM foi reproduzido em execução. G-01 (PH-07) deve ser confirmado no preview antes de editar.
- **Android e `new Notification`** (PH-50) e o custo real de re-render por presença (PH-49) vêm de comportamento documentado, não de medição.

## Riscos
- A integração está lenta (fábrica sobrecarregada em 13/10); estes cartões não aceleram nada, só entram na fila. Ordem de ataque sugerida: PH-01, PH-20, PH-41, PH-13/40 (dano a usuário) antes dos P2.
- Vários cartões tocam arquivos disputados por outros planos (`ChatPanel`, `useRealtimeInbox`, `useChatPanelHandlers`): a cadeia entre os PH está explícita, mas colisões com cartões de outras frentes são resolvidas pelo revisor e pelo refazer.
