# Zapp Web V2 — Mapa das branches importadas

27/10/2026 · base: `main` em `4bcddb5ec`

## Resumo

Das 220 funcionalidades que vieram das branches locais, 153 já estavam na `main`, entradas por outras PRs com outro título. Sobram 43 de verdade: 25 faltando e 18 parciais. Outras 24 foram superadas, porque a `main` resolveu o mesmo problema de outro jeito.

Além disso, a `main` tem 116 arquivos de código que nenhuma tela usa. Desses, 26 grupos valem ser ligados.

| Módulo | Funcionalidades | Já na main | Parcial | Faltando | Superada |
| --- | --- | --- | --- | --- | --- |
| Backend e banco | 56 | 30 | 4 | 18 | 4 |
| Inbox e chat | 43 | 30 | 4 | 4 | 5 |
| Talk X (campanhas) | 40 | 28 | 6 | 0 | 6 |
| Tarefas e painéis | 40 | 30 | 3 | 1 | 6 |
| Contatos e CRM | 25 | 20 | 1 | 2 | 2 |
| Catálogo | 16 | 15 | 0 | 0 | 1 |
| **Total** | **220** | **153** | **18** | **25** | **24** |

Alguns itens aparecem em dois módulos, como a mensagem de ausência (Inbox e Backend) e o botão de assumir conversa. Nas seções abaixo, cada um aparece uma vez só.

Origem: 500 refs em `refs/importado/*`, em 11 pacotes, somando 3.069 commits fora da `main`.

## Furos que já afetam produção

Dois furos ficam escondidos no banco. Os dois foram conferidos direto no banco oficial (`tnnnlkbymytvtqngbbqh`) em 27/10.

| Furo | O que acontece hoje | Conferido no banco | Correção pronta em | Esforço |
| --- | --- | --- | --- | --- |
| Mensagem de ausência | O webhook chama a função `should_send_away_message`, que não existe. Sem ela, o código desiste em silêncio e nenhuma resposta fora do expediente sai. | Função não existe. Nenhuma mensagem de ausência está configurada (0 linhas), então ainda nenhum cliente foi afetado. O furo aparece no dia em que alguém ligar a ausência. | `refs/importado/estado/away-message-decisao-*` (migration `20261015211150_away_message_decision.sql` + teste) | P |
| Agendamentos do pg_cron | A edge de auto-fechar conversas existe, mas nada a chama. Os relatórios agendados também não saem, e as tabelas de log crescem sem limite. | Nenhum job de auto-close nem de relatório agendado no `cron.job`. | 2 migrations: `20261013093000_agendadores_edge_e_purga_cron.sql` e `20261014183000_agendar_auto_close.sql` | M |

As duas correções são DDL em produção e seguem o fluxo da seção 0 do `CLAUDE.md` (lote do dia + aprovação do Joaquim). Antes de aplicar, cada migration precisa de uma versão nova, maior que a última do ledger.

## O que falta, tela por tela

São 40 peças depois de juntar as repetidas. Os dois furos acima ficaram de fora. Esforço: P = menos de 1 dia, M = 1 a 3 dias, G = mais de 3 dias. "Banco" = exige migration em produção.

### Inbox e atendimento

| Funcionalidade | Situação | Regra de negócio | Esforço |
| --- | --- | --- | --- |
| Assumir conversa / devolver para a fila | Banco pronto, falta o botão e o hook | O atendente puxa a conversa para si ou a devolve com motivo, e dois não pegam a mesma. | P |
| Ação da IA vira tarefa com um clique | Falta | Quando a IA sugere um próximo passo, o vendedor transforma em tarefa na hora. | P |
| Gravador de áudio com pausa e recuperação | Falta (15% na main) | Pausar a gravação, recuperar um áudio perdido se a aba cair, desfazer um descarte. | M |
| Análises de IA em cache compartilhado | Falta | Menos consultas ao banco e nenhum erro ao abrir a conversa por link com telefone. | P |
| Selo do WhatsApp na foto de quem enviou o arquivo | Parcial (PR #2285 em andamento) | Cada arquivo mostra quem mandou, com o canal. | P |
| SLA de 1ª resposta com faixas fixas (2 e 5 min) | Parcial | O selo de SLA muda de cor nos mesmos minutos para todos. | P |
| Linha do tempo de SLA do contato | Hook pronto, sem tela | Mostra se cada atendimento do cliente cumpriu ou estourou o prazo. | M |
| Apagar mensagem guardando o original | Falta · banco | Ao apagar, o texto original fica para auditoria, e o atendente não reescreve mensagem do cliente. | M |
| Redistribuir conversa de atendente ausente pela presença real | Falta · banco | Conversa de quem ficou offline volta para a fila pelo sinal real de presença. | P |
| Alerta de falha de envio por número + varredor de mensagens presas | Falta · banco | Se um número começa a falhar, o admin é avisado antes do cliente reclamar. | M |
| Efeitos da mensagem recebida com retomada (opt-out, atribuição) | Falta · banco · precisa reescrever | Se o processamento cair no meio, o descadastro e a atribuição não se perdem. | G |

### Contatos e CRM

| Funcionalidade | Situação | Regra de negócio | Esforço |
| --- | --- | --- | --- |
| Aba Jornada completa (filtros, estatísticas, linha do tempo, quem agiu) | Código todo na main, sem ligar na aba | O histórico do cliente junta mensagens, ligações, e-mails, tarefas e negócios, filtrável por período e pessoa. | M |
| Motor de automações (fila de eventos) | Falta · banco | Cada mensagem ou tag que casa com uma automação roda uma vez só e fica registrada. Sem isso, a tela de Automações só cadastra e nada dispara. | G |

### Talk X (campanhas)

| Funcionalidade | Situação | Regra de negócio | Esforço |
| --- | --- | --- | --- |
| Dias da semana de envio + não perturbe | Banco e motor prontos, falta onde configurar | A campanha só envia nos dias escolhidos e respeita o horário de silêncio. | P–M |
| Relatório da campanha por e-mail | Edge pronta, ninguém chama | Ao fim da campanha, quem criou recebe o resumo por e-mail. | P |
| Tela de relatório da campanha (funil, horários) | Componente pronto, sem tela | Depois de enviar, o gestor vê o resultado da campanha. | M |
| Ações por destinatário (reenviar, bloquear, abrir conversa) | Só no monitor ao vivo | O operador resolve um envio que falhou direto na lista da campanha. | P |
| Progresso por segmento + linha do tempo operacional | Componente e banco prontos, sem tela | Mostra quanto de cada público já recebeu. | P |
| Risco de entrega do segmento | Banco pronto, sem tela | Avisa antes do disparo se o público tem chance alta de bloqueio. | P |
| Templates: arquivar, canal, ícone, botões interativos | Colunas criadas, tela só usa mídia | Template sem uso é arquivado sem ser apagado. | M |
| Editor interativo + upload de mídia no template | Componentes prontos, sem tela | Anexar o arquivo direto e montar botões, sem colar link. | M |
| Lista de campanhas paginada no servidor | Hook pronto, sem tela | A lista abre rápido mesmo com milhares de campanhas. | M |

### Tarefas, Dashboard e avisos

| Funcionalidade | Situação | Regra de negócio | Esforço |
| --- | --- | --- | --- |
| Novo cartão de tarefa ("Atrasada", motivo da espera) | Falta (peças prontas) | Tarefa vencida mostra "Atrasada" e a parada mostra o motivo. | P |
| Quadro agrupado por prazo | Lógica pronta, sem tela | Ver o quadro por urgência: Atrasadas, Hoje, Fazendo, Concluídas. | P |
| Rascunho no painel de detalhes da tarefa | Hook pronto, sem tela | Salva só no fim e avisa se alguém mudou a tarefa no meio. | M |
| KPIs do Dashboard seguem o período escolhido | Hook e banco prontos, tela ainda avisa que não vale | Resolvidas, tempo de resposta e SLA contam só no período escolhido. | P |
| Avisos globais: WhatsApp instável e alerta da Sala de Crise em qualquer tela | Falta | Todo atendente vê quando um número oscila; o supervisor ouve o alerta de crise em qualquer tela. | M |
| Fila priorizada do supervisor (P1–P4) | Hook pronto, sem tela | O supervisor vê primeiro as conversas mais urgentes. | M |

### Admin, segurança e e-mail

| Funcionalidade | Situação | Regra de negócio | Esforço |
| --- | --- | --- | --- |
| Dar e tirar papel com trava e registro | Falta · banco | Só admin muda papel, ninguém remove o último admin, tudo fica registrado. | P |
| Auditoria automática de configurações sensíveis | Falta · banco | Toda mudança de segurança fica registrada com quem fez. | M |
| Resumo da auditoria por período | Falta · banco | O painel mostra os totais sem baixar milhares de linhas (some o "NaN"). | P |
| Tentativas de login e contas bloqueadas | Falta · banco | O admin vê quem errou a senha e quais contas estão travadas. | P |
| Saúde das contas de e-mail | Falta · banco | O admin percebe quando uma caixa parou de sincronizar. | P |
| Ver e derrubar sessões de um usuário | Falta · banco | O admin derruba só a sessão suspeita. | M |
| Usuário sem papel não lê configurações | Falta · banco | Quem tem login mas nenhum papel não vê filas, templates e produtos. | M |
| Autoria forçada + papel não consultável por visitante | Falta · banco | Quem encerra uma conversa fica gravado pelo servidor; visitante não descobre papéis. | M |
| Tirar permissões de visitante em 8 tabelas | Falta · banco (PR #2265 parecida aberta) | Visitante sem login não tem permissão nenhuma nessas tabelas. | P |
| Login por passkey sem digitar e-mail | Parcial | Entrar com digital ou rosto sem expor quem tem conta. | M |
| Códigos reserva do 2FA | Componente pronto, sem tela | Quem perde o celular entra com um código reserva. | M |
| Gmail: 12 meses de entrada + enviados, sem spam e lixeira | Parcial | Traz um ano de e-mails sem importar spam, lixeira ou rascunho. | P |

## Código pronto na main que nenhuma tela usa

São 116 arquivos em 69 grupos. 26 valem ligar, 26 são duplicatas de algo que já está em uso e 17 estão mortos. Os grupos vivos que já entraram na seção anterior não se repetem aqui. Explicação detalhada e cuidados antes de apagar: `orfaos-explicados-2026-10-27.md`.

| Funcionalidade | Onde encaixa | Regra de negócio | Esforço |
| --- | --- | --- | --- |
| Selos "fora do horário" e diagnóstico da IA | Cabeçalho da conversa | O atendente vê na hora se o cliente escreveu fora do expediente. | P |
| Indicador de sentimento (emoji) | Cabeçalho da conversa | Mostra se o cliente está satisfeito, neutro ou irritado. | P |
| Engajamento real do contato | Painel do contato | O anel de engajamento passa a refletir as conversas reais; hoje parte de 50 fixo. | P |
| Sugestões de resposta da IA no compositor | Caixa de digitação da Inbox | A IA sugere respostas prontas enquanto o cliente escreve. | M |
| Ranking de atendentes por satisfação | Painel CSAT | Mostra quem tem a melhor nota dos clientes. | P |
| Gerenciar grupo interno + transferir dono | Team chat (os itens de menu já existem) | Quem criou o grupo renomeia, tira pessoas ou passa o grupo adiante. | P |
| Estatísticas da conversa interna | Team chat (o botão já existe) | Mostra quem mais fala e quem responde rápido. | P |
| "Está digitando" e "online" no team chat | Team chat | Os colegas veem quem está escrevendo ou online. | M |
| Arquivos da equipe | Painel lateral do team chat | Acha qualquer anexo trocado internamente, com filtro. | M |
| Contatos v2: ficha sem campos vazios + dados do Singu | Tela Contatos | Só aparece o que tem valor, e os dados de empresa vêm do Singu. | M |
| Links de pagamento | Nova tela no menu (a tabela já existe) | O vendedor gera um link de cobrança e acompanha se foi pago. A página pública de pagamento ainda não existe. | M |
| Detalhe e resgate de conquista | Gamificação | Ao clicar na conquista, o atendente vê o progresso e resgata os pontos. | P |
| Ajuda do Talk X: mais vistos | Central de ajuda do Talk X | A ajuda mostra primeiro os artigos mais consultados. | P |
| Checkbox redondo de tarefa | Cartão de tarefa (vai junto com o novo cartão) | Marcar a bolinha conclui a tarefa. | P |
| Estados dos jobs de IA | Sem tela-mãe hoje | Cada tarefa de IA mostra o mesmo estado na tela e no banco. | M |
| Motor de ligações WhatsApp (MeowCaller) | Alerta de chamada | Prepara atender e ligar pelo WhatsApp no navegador. | G |

## Ordem recomendada

Começar pelo que é só tela, porque o código já está pronto e não mexe no banco. Uma PR por funcionalidade.

1. **Furos de produção (DDL, aprovação do Joaquim):** criar a função da mensagem de ausência e os agendamentos do pg_cron.
2. **Ligar o que já existe, sem banco (cerca de 20 peças P):** botão Assumir/Devolver, selos e sentimento no cabeçalho da conversa, ações do team chat, novo cartão de tarefa e quadro por prazo, telas do Talk X (dias de envio, progresso, risco, ações por destinatário, relatório), KPIs do Dashboard pelo período.
3. **Telas médias, sem banco:** aba Jornada completa, gravador de áudio, avisos globais, fila do supervisor, links de pagamento, contatos v2.
4. **Segurança e admin (DDL, aprovação do Joaquim):** papéis com trava, auditoria, sessões, permissões de visitante, usuário sem papel.
5. **Peças grandes, que precisam ser reescritas sobre a main atual:** motor de automações, efeitos da mensagem recebida, varredor de envio. As versões das branches alteram funções que a main já mudou depois.

## Como foi feito e limites

- Busquei as 500 refs de `refs/importado/*` e separei os 3.069 commits que não estão na `main`. Descartei cópias de workspace e pastas temporárias que vieram junto (`clone-ws`, `.tmp`, worktrees aninhadas).
- Juntei os 351 commits de funcionalidade em 220 funcionalidades e procurei cada uma no código da `main` pelos nomes de componente, hook, função do banco e texto de tela. A busca por título não serve, porque os squashes mudaram os títulos.
- Achei os órfãos da `main` por um mapa de imports. Nenhum dos 116 era falso órfão.
- Análise só em leitura. O banco de produção foi consultado só por `SELECT`, para confirmar os dois furos.
- Limite: "já na main" quer dizer que o código está lá, não que foi testado na tela. Itens marcados "banco" precisam ser conferidos contra o banco de produção antes de aplicar.
