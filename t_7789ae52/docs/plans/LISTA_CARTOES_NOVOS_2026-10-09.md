# Lista de cartões novos para aprovação — 09/10/2026

**218 propostas** (P0 2 · P1 20 · P2 112 · P3 84), 51 com migration (🗄). Cada uma foi conferida no código atual (`dia/2026-10-09`): ainda falta e não tem cartão. Todas pequenas (diff esperado < 25 mil caracteres), o tamanho que mais passa de primeira.

Quem faz: iris 105 · workersql 51 · worker 20 · hugo 15 · edgar 11 · workertestes 7 · vera 5 · designer 4

**Como aprovar:** responda `aprovado tudo`, ou `aprovado tudo menos N-012, N-045`, ou `aprovado só P0 e P1`, ou por módulo (`aprovado Talk X e Inbox`). Nada é criado antes disso. Depois do OK, crio em ondas (P0/P1 primeiro) para não afogar os agentes.

Ficou abaixo de 300 de propósito: o resto dos relatórios já tinha cartão ou já estava feito (34 itens) e não completei com item inventado. Mais itens entram quando você decidir as 18 questões do fim.

| módulo | cartões |
|---|---|
| Segurança | 13 |
| CI/DevOps | 11 |
| Inbox | 24 |
| Dashboard | 8 |
| Catálogo | 6 |
| Admin | 5 |
| Chat interno | 5 |
| CRM 360° | 4 |
| E2E | 4 |
| Tarefas | 4 |
| Filas | 3 |
| Telefonia | 3 |
| Relatórios | 2 |
| Onboarding | 1 |
| Talk X | 42 |
| Banco | 13 |
| Configurações | 12 |
| Edge | 8 |
| IA | 4 |
| Conexões | 3 |
| E-mail | 2 |
| Monitoramento | 2 |
| Quadro | 2 |
| Teams | 2 |
| Automações | 1 |
| Base | 1 |
| CRM | 1 |
| Campanhas | 1 |
| Carteira | 1 |
| Casco | 1 |
| Chatbot | 1 |
| Conquistas | 1 |
| Detalhe | 1 |
| Equipe | 1 |
| Grupos | 1 |
| Integrações | 1 |
| Mensagens | 1 |
| NPS | 1 |
| Notificações | 1 |
| Omnichannel | 1 |
| Seletor | 1 |
| Sentimento | 1 |
| Transcrições | 1 |
| Voz | 1 |
| Chat | 2 |
| Testes | 2 |
| Barra | 1 |
| Cartão | 1 |
| Celular | 1 |
| Design | 1 |
| Dispositivos | 1 |
| Log | 1 |
| Mapa | 1 |
| Pagamentos | 1 |
| Provedores | 1 |
| Régua | 1 |
| War | 1 |

## Segurança (13)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-001 | P0 | workertestes | teste de banco de quem troca papel em user_roles e do registro da troca | Garante que só admin muda o papel de alguém e que toda troca, inclusive edição, fica registrada. |
| N-002 | P1 | workertestes | teste de banco da trava de troca de papel em profiles | A trava que impede um usuário comum de se promover a admin existe, mas nenhum teste garante que continua funcionando. |
| N-003 | P1 | iris | nome nos botões de remover/renomear e abas de filtro sem painel no bloqueio por país e chaves de acesso | Em Segurança, remover país bloqueado, renomear/excluir chave de acesso e remover regra de limite são ícones sem nome. |
| N-004 | P2 | vera | lista de permissões da tela que não têm trava no banco | A tela esconde botões por permissão, mas só "enviar mensagem" está garantido no banco; a lista mostra onde falta a trava de verdade. |
| N-005 | P2 | iris | filtros do log de auditoria com nome | Os filtros de ação e de período do log de auditoria não têm nome para leitor de tela. |
| N-006 | P2 | iris | abas de filtro sem painel em redefinição de senha e quarentena | As abas de filtro dessas telas apontam para painéis que não existem e o leitor de tela acusa erro. |
| N-007 | P2 | workersql | fotos de perfil fora do bucket público, com link temporário 🗄 | A foto de cada colaborador fica num endereço público permanente: quem tiver o link vê sem login. |
| N-008 | P3 | workersql | banco: rotina diária encerra sessões vencidas 🗄 | Sessões vencidas continuam marcadas como ativas e confundem quem está online. |
| N-009 | P3 | workersql | limite de tamanho e de tipo de arquivo em figurinhas e áudios-meme 🗄 | Os buckets públicos de figurinhas e áudios aceitam qualquer tipo e tamanho de arquivo, inclusive página HTML. |
| N-010 | P3 | workersql | limite de tamanho nos buckets privados de mídia e voz 🗄 | Os buckets de mídia das conversas e de voz não têm teto de tamanho por arquivo (sem controle de custo). |
| N-011 | P3 | workersql | apagar policies duplicadas dos buckets públicos 🗄 | Há regras de leitura e exclusão repetidas nos buckets de avatar, figurinha, meme e emoji, o que dá falsa sensação de controle. |
| N-012 | P3 | workersql | mesma identidade para enviar, ler e apagar arquivo 🗄 | Quem envia um arquivo no chat de equipe não consegue apagá-lo, porque cada regra usa um tipo de id diferente. |
| N-013 | P3 | worker | painéis de IP e redefinição de senha leem só as colunas usadas | Os painéis de IPs bloqueados, lista branca e pedidos de nova senha trazem todas as colunas, inclusive e-mail e IP. |

## CI/DevOps (11)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-014 | P0 | hugo | E2E logado é cortado aos 15 min em todas as execuções | As 30 últimas rodadas do teste automático com login foram canceladas por tempo; hoje ele não diz se o sistema está bom. |
| N-015 | P1 | hugo | limpeza do E2E logado sem a chave mestra do banco | Tira a chave mestra do passo de limpeza do teste automático. |
| N-016 | P2 | hugo | rodar o replay de todas as migrations no db-guard | Hoje ninguém confere sozinho se o banco ainda pode ser recriado do zero pelo repositório; o portão passa a reprovar falha nova. |
| N-017 | P2 | hugo | rodar o teste de mutação do Multiplix no CI | Prova que os testes do envio do Multiplix pegam erro de verdade; hoje esse teste só roda à mão. |
| N-018 | P2 | hugo | rodar o teste do executor da suíte de banco (db-tests) no CI | O teste existe mas está na lista de exceções; passa a rodar em todo PR. |
| N-019 | P2 | hugo | guarda que barra botão só de ícone, seletor e aba sem nome acessível | Sem uma trava, cada tela nova volta a nascer com botões sem nome e as correções se perdem. |
| N-020 | P3 | hugo | a lista de falhas esperadas do replay só pode diminuir | Evita que alguém "resolva" uma falha nova só acrescentando na lista de aceitas. |
| N-021 | P3 | hugo | resumo de 1 linha por divergência no check-migration-drift | Quando o banco e o repositório divergem, a mensagem hoje é um parágrafo; uma linha por caso acelera a correção. |
| N-022 | P3 | hugo | versão do Playwright dos workflows vem do bun.lock | Evita que o navegador de teste instalado no CI fique diferente da versão do projeto. |
| N-023 | P3 | hugo | matriz de ACL falha se função nova nascer com EXECUTE para PUBLIC | Toda função de gatilho criada depois da limpeza de 01/10 volta a nascer aberta; sem trava isso se repete. |
| N-024 | P3 | hugo | guarda contra ler VITE_SUPABASE_URL/PUBLISHABLE_KEY em src | O erro de mandar o token para outro servidor foi corrigido arquivo a arquivo; sem trava ele pode voltar. |

## Inbox (24)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-025 | P1 | iris | nome acessível nas 8 abas da conversa em telas menores que 1536 px | Em notebook e celular o leitor de tela anuncia 8 botões sem nome e a pessoa não sabe qual aba abre (Chat, Arquivos, SalesView, Journey...). |
| N-026 | P2 | iris | aviso 'Nenhum registro ainda' fora da lista | Sem notas, a lista recebe um parágrafo solto e o leitor de tela deixa de anunciar a lista corretamente. |
| N-027 | P2 | designer | subtítulo dos indicadores (KpiStrip) com contraste AA | O texto pequeno embaixo dos números ('Mensagens, ligações e ações') está claro demais para ler. |
| N-028 | P2 | iris | botão '+ Adicionar' legível e título do cartão de seção no nível certo | O botão de adicionar nota/IA tem contraste baixo e os cartões começam a página por um título de nível 3, o que confunde quem navega por títulos. |
| N-029 | P2 | designer | selos 'no prazo', 'atenção' e 'violado' com contraste AA | O aviso de prazo estourado aparece em vermelho claro sobre rosa e fica difícil de ler, principalmente no tema claro. |
| N-030 | P2 | designer | selo de engajamento do avatar com cores do sistema e contraste AA | O número de engajamento sobre a foto usa cores fora da paleta do sistema e letra minúscula. |
| N-031 | P2 | iris | favorito fora do botão da linha, ações com área de toque e sem selo de canal | O botão de favoritar fica dentro do botão da conversa (confunde o teclado), as ações (favoritar 16 px, resolver/transferir/fixar/adiar 28 px) são minúsculas no celular e a lista ainda mostra selo de canal (Instagram, Telegram...), proibido pela regra do produto. |
| N-032 | P2 | iris | 'Nova conversa' alcançável no celular e seletor do diálogo com nome | No celular não existe botão para começar uma conversa nova; só no computador. |
| N-033 | P2 | worker | chip 'Resolvidas' conta pelo status real da conversa | Hoje o número de 'Resolvidas' conta conversas sem mensagem, não as que foram resolvidas de verdade. |
| N-034 | P2 | iris | nome nos botões de zoom, baixar e fechar da imagem e do vídeo em tela cheia | Ao abrir foto ou vídeo, os botões de ampliar, baixar e fechar não dizem o que fazem para quem usa leitor de tela. |
| N-035 | P2 | iris | nome nos botões dos modelos de mensagem e das respostas rápidas | Editar, excluir e fechar modelos de mensagem são só ícones sem nome. |
| N-036 | P2 | iris | nome nos botões 'remover' do montador de mensagem interativa e da enquete | Os botões de remover opção/botão da mensagem interativa e da enquete não têm nome. |
| N-037 | P2 | iris | nome nos botões das sugestões, objeções e resumo, e nas barras de sentimento | Fechar sugestões, analisar objeções, ouvir resumo e as barras de sentimento não têm nome para leitor de tela. |
| N-038 | P2 | iris | nome nos botões limpar busca, remover etiqueta e remover do histórico | Os 'x' da busca global e o filtro de período não dizem o que fazem para quem usa leitor de tela. |
| N-039 | P2 | iris | nome nos botões remover/fechar e nas barras de envio de arquivo | No envio de arquivo, os botões de remover da fila e fechar não têm nome e as barras de progresso não dizem de qual arquivo são. |
| N-040 | P2 | iris | nome nos botões do modo sussurro e do envio de menção | Recolher o sussurro, enviar sussurro e enviar comentário com menção são só ícones sem nome. |
| N-041 | P2 | iris | nome no tocar/pausar do áudio da conversa e do trocador de voz | O botão de tocar áudio recebido e o de ouvir a voz alterada não têm nome (o leitor diz só 'botão'). |
| N-042 | P2 | iris | nome no sincronizar CRM, no link da linha e no seletor de compras | No painel do contato, o botão de sincronizar com o CRM, o link de abrir item e o filtro de compras não têm nome. |
| N-043 | P2 | iris | nome nos botões de expandir, abrir, minimizar e fechar | Na janelinha flutuante do celular e no chat em janela separada os botões de controle não têm nome. |
| N-044 | P2 | iris | nome nos seletores de encerrar e transferir conversa | Ao encerrar ou transferir, os campos de motivo, resultado e destino são lidos sem nome pelo leitor de tela. |
| N-045 | P2 | iris | nome nos seletores e no interruptor 'mostrar todos' | Os filtros da lista de conversas (fila, responsável, tipo de contato e 'mostrar todos') não têm nome para o leitor de tela. |
| N-046 | P3 | worker | texto da busca fora da barra de endereço | O telefone ou nome que o atendente pesquisa fica escrito no endereço da página e pode sair num link copiado. |
| N-047 | P3 | worker | ler só as colunas usadas de mensagens e contatos no serviço de chat | O serviço do chat traz todas as colunas de mensagens e contatos, inclusive as que a tela não usa. |
| N-048 | P3 | iris | nome completo do contato acessível e título no nível certo | Nome de contato comprido aparece cortado no topo do chat sem jeito de ver inteiro, e o título pula nível. |

## Dashboard (8)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-049 | P1 | iris | nome nos filtros de fila e de agente | Os filtros do painel são lidos como 'caixa de combinação' sem dizer se é fila ou agente. |
| N-050 | P2 | iris | gatilho de seção como botão e nome na barra de metas | As seções recolhíveis do painel usam uma 'div' com atributo de botão (inválido) e a barra de metas do widget não tem nome. |
| N-051 | P2 | iris | abas sem painel viram botões de alternância e barras com nome | As abas de métrica do mapa de calor e de período da satisfação prometem um painel que não existe; as barras de nota não têm nome e o mapa rolável não recebe foco. |
| N-052 | P2 | iris | nome nos botões editar/excluir, no interruptor e no seletor da tabela | Na aba SLA do painel, editar, excluir e ativar cada regra são controles sem nome. |
| N-053 | P2 | iris | nome nos seletores e no interruptor | Na aba de relatórios agendados os campos de frequência/tipo e o interruptor de ativo não têm nome. |
| N-054 | P2 | iris | seletor dos cartões (CardSelect) com nome | Os seletores pequenos dentro dos cartões do painel (período, métrica) não dizem o que escolhem. |
| N-055 | P3 | iris | mapa de atividade com seletor nomeado e rolagem pelo teclado | O mapa de atividade rola de lado mas não recebe foco do teclado, e o seletor de período não tem nome. |
| N-056 | P3 | iris | gráfico de volume com descrição em texto | O gráfico de volume da visão geral não tem descrição para leitor de tela. |

## Catálogo (6)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-057 | P1 | iris | nome nos filtros e no limpar busca | Na vitrine do catálogo os filtros de categoria/fornecedor e o 'x' da busca não têm nome. |
| N-058 | P1 | iris | nome no limpar busca e no filtro da aba Enviados, abas com 44 px no celular | Na gestão do catálogo ainda há 'x' de busca e filtro da aba Enviados sem nome, e as abas Produtos/Favoritos/Enviados têm 28 px no celular. |
| N-059 | P1 | iris | nome nos botões de ícone do cartão de produto | No cartão de produto, ver detalhes, enviar e favoritar são ícones sem nome. |
| N-060 | P2 | iris | nome nos botões e seletores dos modelos de mensagem | No gerenciador de modelos, prévia/editar/duplicar/excluir são ícones sem nome e os filtros não têm rótulo. |
| N-061 | P2 | iris | nome na barra de progresso | No envio para vários contatos a barra de andamento não diz o que mede. |
| N-062 | P3 | worker | registrar no log quem exportou, com filtro e número de linhas | As exportações que ainda existem no catálogo não deixam rastro de quem tirou o arquivo. |

## Admin (5)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-063 | P1 | iris | nome nos seletores 'Nível de acesso' e 'Role' do cadastro de usuário | Ao criar ou editar usuário, os campos de nível de acesso e papel são lidos sem nome. |
| N-064 | P1 | iris | nome nos botões de ícone e seletores de Playbooks, Treinamento, Copiloto e Uso de IA | Nas ferramentas de gestão, remover passo, enviar resposta, perguntar ao copiloto e atualizar uso de IA são ícones sem nome. |
| N-065 | P2 | iris | nome nos seletores | Nas telas de papéis e de concessões de visibilidade, os seletores não têm nome. |
| N-066 | P2 | iris | nome nos seletores e barras | Nessas páginas de administração, filtros e barras de progresso não dizem o que são. |
| N-067 | P3 | worker | ler só as colunas usadas de perfis, papéis e log | A tela de administração carrega todas as colunas de perfis, papéis e log de uma vez. |

## Chat interno (5)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-068 | P1 | workersql | banco: só o dono do grupo ou supervisor adiciona outra pessoa 🗄 | Hoje qualquer participante pode colocar qualquer colega num grupo; a inclusão de terceiros passa a ser só de quem administra. |
| N-069 | P1 | hugo | comando único que roda as provas de banco do chat interno | As provas do chat interno estão espalhadas; um comando só deixa conferir tudo antes de mexer. |
| N-070 | P2 | workersql | banco: visão "lida por todos" por mensagem 🗄 | Para o chat interno mostrar "visto por todos" o sistema precisa saber, mensagem a mensagem, quantos colegas já leram. |
| N-071 | P2 | workersql | banco: pedido de acesso a um departamento avisa os admins 🗄 | Hoje quem quer entrar num departamento não tem como pedir; o pedido passa a virar aviso para quem administra. |
| N-072 | P3 | workersql | banco: página de mensagens com desempate e limite mínimo 🗄 | Duas mensagens enviadas no mesmo instante podem sumir ou repetir ao rolar o histórico, e um limite negativo devolve vazio sem aviso. |

## CRM 360° (4)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-073 | P1 | iris | nomes na tabela, ordenação por teclado e selo de contagem legível | Na tabela do CRM 360° os botões atualizar, limpar busca, página anterior/próxima e o 'itens por página' não têm nome, e a ordenação por coluna só funciona com mouse. |
| N-074 | P2 | iris | links 'Ver no SalesView/Journey' e 'Criar tarefa' com área de toque e contraste AA | Os links da aba CRM 360° têm 16 px de altura (difícil de tocar) e azul fraco no tema escuro. |
| N-075 | P2 | iris | nome nos seletores dos formulários de empresa e de contato | Nos formulários de empresa e contato do CRM 360° os campos de escolha não têm nome para o leitor de tela. |
| N-076 | P3 | iris | títulos na ordem e abas da tabela com altura de toque | A página salta do título principal para títulos de nível 3 e as abas (Empresas, Contatos...) têm só 26 px de altura no celular. |

## E2E (4)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-077 | P1 | workersql | banco: função que limpa só a sobra do contato de teste 🗄 | A limpeza do teste automático usa hoje a chave mestra do banco; uma função que só apaga o dado do contato de teste reduz o estrago se a chave vazar. |
| N-078 | P3 | workertestes | régua axe do Inbox e Teams nas regras já corrigidas | A auditoria rodou com um roteiro temporário; sem teste fixo, os defeitos corrigidos podem voltar. |
| N-079 | P3 | workertestes | régua axe de Tarefas, Quadro e Dashboard nas regras já corrigidas | Sem teste fixo, os botões e filtros sem nome corrigidos em Tarefas e Dashboard podem voltar. |
| N-080 | P3 | workertestes | régua axe de Configurações, Administração e Segurança nas regras já corrigidas | O roteiro da auditoria do casco foi apagado; sem teste fixo, os nomes corrigidos podem voltar. |

## Tarefas (4)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-081 | P1 | iris | nome nos botões Lista, Quadro e Agenda no celular | No celular os três botões de modo mostram só o ícone e o leitor de tela não diz qual é qual. |
| N-082 | P1 | iris | Estado, Contato e Descrição ligados ao rótulo | Na ficha da tarefa os rótulos 'Estado' e 'Contato' não estão ligados aos campos e a descrição não tem rótulo. |
| N-083 | P3 | workersql | índice para concluídas recentes e ordem do quadro 🗄 | A lista de tarefas busca as concluídas dos últimos 30 dias e ordena por posição sem índice, o que fica lento com muitas tarefas. |
| N-084 | P3 | worker | texto da busca fora da barra de endereço | O texto pesquisado em Tarefas também fica no endereço da página. |

## Filas (3)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-085 | P1 | iris | nome nos botões voltar e abrir fila | Na comparação de filas, voltar e abrir o detalhe de cada fila são ícones sem nome. |
| N-086 | P2 | iris | títulos em ordem e nome no botão de dispensar alerta | Na tela de Filas o título 'Alertas Ativos' vem depois de títulos menores e o botão de dispensar alerta não tem nome. |
| N-087 | P3 | worker | alertas de tempo de espera e mensagens pendentes calculados | A meta de tempo de espera e de mensagens pendentes da fila existe, mas a tela nunca avisa quando é ultrapassada. |

## Telefonia (3)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-088 | P1 | iris | nome nos botões silenciar, atender e encerrar da chamada | Na janela da ligação, os botões redondos de silenciar, atender e desligar não dizem o que fazem para quem usa leitor de tela. |
| N-089 | P3 | iris | abas de canal e filtros com 44 px de altura no celular | No celular as abas Todos/VoIP/WhatsApp e o filtro de período têm 40 px, abaixo do recomendado para o dedo. |
| N-090 | P3 | iris | aviso de senha SIP sem jargão técnico para o atendente | O atendente vê em vermelho claro uma instrução para programador ('adicione o segredo SIP_PASSWORD no Supabase'). |

## Relatórios (2)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-091 | P1 | iris | nome nos filtros de período, agente, abandono e comparação | Os filtros dos relatórios (período, agente, comparação, abandono) não têm nome para o leitor de tela. |
| N-092 | P3 | iris | gráficos com descrição em texto para leitor de tela | Os gráficos dos relatórios não têm nenhuma descrição; quem não enxerga não sabe o que mostram. |

## Onboarding (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-093 | P1 | iris | nomes nos botões expandir/dispensar, nome na barra e ícone que respeita 'reduzir movimento' | No cartão 'Configure sua conta' os botões de abrir e dispensar não têm nome, a barra de progresso não diz o que mede e o ícone gira sem parar mesmo para quem pediu menos movimento. |

## Talk X (42)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-094 | P2 | workersql | banco: tabela de atributos do contato para segmentar (com RLS) 🗄 | Os segmentos precisam de dados comerciais do contato num lugar só, com a mesma regra de quem pode ver. |
| N-095 | P2 | workersql | banco: lista paginada dos destinatários da campanha 🗄 | A tela da campanha precisa listar quem recebeu, falhou ou falta, sem carregar tudo de uma vez. |
| N-096 | P2 | workersql | banco: progresso da campanha por segmento 🗄 | Mostra, por segmento e na ordem de envio, quanto já foi, quanto falhou e quanto falta. |
| N-097 | P2 | workersql | banco: pré-checagem de retomada no servidor 🗄 | Antes de retomar uma campanha pausada, o servidor confere conexão, supressão e janela, em vez de só o navegador. |
| N-098 | P2 | workersql | banco: checagens de lançamento da campanha no servidor 🗄 | As conferências antes de disparar passam a ser feitas no servidor, onde não dá para pular. |
| N-099 | P2 | workersql | banco: guardar as 3 confirmações e quem lançou a campanha 🗄 | Fica registrado quem confirmou consentimento, conteúdo e supressão antes de cada disparo. |
| N-100 | P2 | worker | revisão da campanha grava as confirmações pela RPC | A tela passa a usar o registro oficial das confirmações. |
| N-101 | P2 | workersql | banco: painel do monitor (números e comparativos) 🗄 | O monitor passa a ler os números da campanha de uma fonte só no servidor. |
| N-102 | P2 | workersql | banco: dias da semana e "não perturbe" na janela de envio 🗄 | Campanha não dispara em dia ou horário que o cliente não quer receber. |
| N-103 | P2 | workersql | banco: pesos das variantes somam 100 e atribuição estável 🗄 | No teste A/B cada contato cai sempre na mesma versão da mensagem e as porcentagens fecham 100%. |
| N-104 | P2 | workersql | banco: trilha e limite do envio de teste 🗄 | Cada envio de teste fica registrado e há um teto (5 a cada 10 min) para não virar disparo escondido. |
| N-105 | P2 | edgar | servidor: envio de teste pela conexão escolhida, com trilha | O teste sai pelo número escolhido na tela, não por qualquer conexão conectada. |
| N-106 | P2 | workersql | banco: mensagem da campanha aparece no histórico da conversa 🗄 | Quando o cliente responde, o vendedor vê na conversa a mensagem da campanha que ele recebeu. |
| N-107 | P2 | workersql | banco: lista de bloqueio guarda trilha e não apaga linha 🗄 | Fica registrado quem bloqueou e quem desbloqueou cada número, e nada some de vez. |
| N-108 | P2 | worker | hook da visão geral lê os números da RPC | Os números da visão geral saem do servidor, não da conta feita no navegador sobre a lista carregada. |
| N-109 | P2 | workersql | banco: salvar template por RPC com nota e versão 🗄 | Toda alteração de template vira versão com nota, sem perder trabalho de quem editou junto. |
| N-110 | P2 | workersql | banco: salvar o conjunto de variantes de uma vez 🗄 | As versões A/B de um template são salvas juntas, sem ficar meio salvo. |
| N-111 | P2 | workersql | banco: lista oficial de campos e operadores de segmento 🗄 | Só os campos e operadores aprovados podem ser usados para montar segmentos. |
| N-112 | P2 | workersql | banco: montar a regra do segmento no servidor com segurança 🗄 | A regra do segmento vira consulta no servidor sem risco de alguém injetar comando. |
| N-113 | P2 | iris | escolher vários segmentos na campanha sem contar contato duas vezes | O dono junta segmentos na mesma campanha e o total não conta o mesmo contato duas vezes. |
| N-114 | P3 | workersql | banco: linha do tempo paginada da campanha 🗄 | Mostra o que aconteceu na campanha (início, pausas, falhas) em ordem, página a página. |
| N-115 | P3 | iris | card "Fila por segmento" na tela da campanha | O dono vê na tela o andamento de cada segmento da campanha. |
| N-116 | P3 | workersql | banco: saúde do segmento (risco de entrega e composição) 🗄 | Avisa antes do envio se um segmento tem muito contato bloqueado, sem telefone ou repetido. |
| N-117 | P3 | workersql | banco: série por minuto e saúde do motor no monitor 🗄 | Mostra o ritmo de envio minuto a minuto e se o motor está vivo. |
| N-118 | P3 | iris | editor da campanha escolhe dias da semana e "não perturbe" | O dono marca na tela em que dias e horários a campanha pode sair. |
| N-119 | P3 | workersql | banco: resultado por variante e escolha do vencedor 🗄 | Mostra qual versão da mensagem foi melhor e registra quem decidiu o vencedor. |
| N-120 | P3 | iris | tela mostra o resultado do A/B e o vencedor | O dono vê na tela qual versão da mensagem ganhou. |
| N-121 | P3 | workersql | banco: lista de bloqueio atualiza em tempo real sem expor telefone 🗄 | A tela de supressão atualiza sozinha quando alguém pede para sair. |
| N-122 | P3 | workersql | banco: visão geral ganha lidas, conversões, receita e funil 🗄 | Os números da visão geral passam a contar lidas, vendas e receita, não só envios. |
| N-123 | P3 | workersql | banco: comparativos por período com nomes (benchmarks) 🗄 | Os comparativos mostram nome do segmento e do template, não só códigos. |
| N-124 | P3 | workersql | banco: dicas calculadas por regra no servidor 🗄 | As dicas da tela passam a vir de regras fixas no servidor, iguais para todos. |
| N-125 | P3 | iris | KPIs da visão geral com fonte certa e comparativo | A tela mostra os números oficiais com a comparação com o período anterior. |
| N-126 | P3 | workersql | banco: colunas de canal, ícone, mídia e arquivamento nos templates 🗄 | O template guarda o tipo de mídia, o arquivo e se está arquivado, sem gambiarra no texto. |
| N-127 | P3 | workersql | banco: duplicar e arquivar template com trava de exclusão 🗄 | Template em uso não pode ser apagado; dá para duplicar ou arquivar. |
| N-128 | P3 | worker | regras de segmento v2 no front (tipos e texto legível) | A tela descreve cada regra em português claro ("Ticket médio > R$ 1.000"). |
| N-129 | P3 | iris | construtor de segmento lê contagem e amostra da RPC | A contagem e a amostra do segmento vêm do servidor, iguais às do disparo. |
| N-130 | P3 | iris | ações por destinatário (abrir conversa, reenviar, bloquear) | Na lista da campanha o dono abre a conversa, reenvia ou bloqueia o contato direto da linha. |
| N-131 | P3 | iris | aba Destinatários completa com paginação | A aba Destinatários mostra todos, com filtro e página, sem travar. |
| N-132 | P3 | iris | abas Mensagens, Resultados e Logs com dados reais | As outras abas da campanha deixam de ser vazias. |
| N-133 | P3 | workersql | banco: relatório da campanha com período, séries e funil 🗄 | O relatório da campanha passa a ter números por período e funil, lidos do servidor. |
| N-134 | P3 | workersql | banco: detalhamentos do relatório (mapa de calor, segmento, link) 🗄 | Mostra em que dia/hora o cliente respondeu mais e quais links e segmentos funcionaram. |
| N-135 | P3 | workersql | banco: contar os artigos de ajuda mais vistos 🗄 | Mostra quais dúvidas aparecem mais na Ajuda do Talk X. |

## Banco (13)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-136 | P2 | hugo | roteiro oficial para recriar o banco local do zero | Se for preciso refazer o banco ou ensaiar um desastre, hoje não há passo a passo único a partir do repositório. |
| N-137 | P2 | hugo | lista versionada dos buckets do Storage conferida pelo guard | Se um bucket virar público ou mudar de limite sem querer, ninguém percebe hoje. |
| N-138 | P2 | workersql | colunas de token do Gmail fora do alcance do navegador 🗄 | O segredo de longa duração do Gmail (mesmo cifrado) ainda pode ser lido pelo navegador do dono da conta. |
| N-139 | P3 | hugo | lista versionada dos jobs do pg_cron conferida pelo guard | Se uma rotina automática do banco sumir ou mudar de horário, ninguém percebe hoje. |
| N-140 | P3 | vera | matriz de quais funções do servidor usam quais tabelas | Antes de mexer numa tabela dá para saber na hora quais funções do servidor quebram. |
| N-141 | P3 | workersql | policies de adiar, favoritar e fixar conversa só para usuário logado 🗄 | Nove regras de acesso dessas tabelas valem também para visitante sem login; hoje não dá para explorar, mas é uma porta destrancada. |
| N-142 | P3 | workersql | leitura de reações compara o id certo do usuário 🗄 | Uma parte da regra de leitura de reações nunca funciona porque compara dois tipos de id diferentes. |
| N-143 | P3 | workersql | evento de conversa só gravado com o próprio autor e contato visível 🗄 | Hoje um usuário pode gravar um evento de conversa sem autor (parecendo do sistema) e a regra não usa a visibilidade padrão de contato. |
| N-144 | P3 | workersql | revogar EXECUTE de PUBLIC na função de gatilho do Multiplix 🗄 | É a única função do banco que ainda pode ser chamada por qualquer papel; é higiene, mas suja a matriz de permissões. |
| N-145 | P3 | workersql | tirar privilégios sobrando de anon e TRUNCATE nas tabelas de tarefas, e-mail e ligações 🗄 | Visitante sem login ainda tem permissão de tabela (até apagar tudo) em 8 tabelas; hoje a regra de acesso barra, mas é porta destrancada. |
| N-146 | P3 | workersql | bloqueios de escrita como regra restritiva 🗄 | Os bloqueios de escrita na conta Gmail deixam de valer se alguém criar outra regra permissiva no futuro. |
| N-147 | P3 | workersql | tirar o ramo de admin que nunca funciona nas regras de conversas de e-mail 🗄 | A regra diz que admin vê e-mail de todos, mas na prática só o dono vê; o texto engana quem revisa. |
| N-148 | P3 | workersql | search_path com pg_temp em is_admin_or_supervisor e get_own_gmail_accounts 🗄 | Duas funções usadas por muitas regras de acesso podem ser enganadas por tabela temporária de mesmo nome. |

## Configurações (12)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-149 | P2 | worker | trocar a foto de perfil mais de uma vez volta a funcionar | Uma trava do chat interno tirou de todos a permissão de sobrescrever arquivo, e a segunda troca de foto com o mesmo formato provavelmente cai em erro. |
| N-150 | P2 | iris | nome nos botões confirmar, cancelar e restaurar atalho | Na troca de atalhos de teclado, confirmar, cancelar e voltar ao padrão são ícones sem nome. |
| N-151 | P2 | iris | nome nos botões e seletores | Na biblioteca de mídia, renomear, salvar, cancelar, excluir e os filtros são controles sem nome. |
| N-152 | P2 | iris | nome nos botões remover/excluir e no interruptor | Nas sequências de follow-up, remover passo, excluir sequência e ativar são controles sem nome. |
| N-153 | P2 | iris | nome nos botões, interruptores e seletores das regras | No gerenciador de SLA, editar, excluir, ativar e escolher prioridade são controles sem nome. |
| N-154 | P2 | iris | nome no mostrar/ocultar chave | O botão do olho que mostra ou esconde a chave não diz o que faz. |
| N-155 | P2 | iris | nome no seletor de som e no tocar prévia | Em Sons, escolher o som e ouvir a prévia de cada categoria são controles sem nome. |
| N-156 | P2 | iris | nome nos seletores | Os seletores de aparência (tema, fonte, densidade) não têm nome ligado ao rótulo. |
| N-157 | P2 | iris | nome nos seletores | Os seletores de habilidade e nível do roteamento não têm nome para o leitor de tela. |
| N-158 | P2 | iris | nome no seletor e nos interruptores do formulário | No cadastro de provedor de IA, o tipo e os interruptores 'ativo' e 'padrão' não têm nome. |
| N-159 | P2 | iris | nome nos interruptores e no seletor | Os interruptores de pesquisa de satisfação automática, chatbot e opções gerais não têm nome. |
| N-160 | P3 | iris | abas Horário/Mensagens/Notificações com 44 px no celular | No celular as abas de Configurações têm 32 px de altura, pequenas para o dedo. |

## Edge (8)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-161 | P2 | edgar | login por passkey não revela se o e-mail existe | Hoje dá para descobrir, pela resposta, quais e-mails têm conta no sistema, e sem limite de tentativas. |
| N-162 | P2 | edgar | chamada por usuário exige admin/supervisor e tem limite | Qualquer atendente pode disparar a checagem de todas as conexões e uma enxurrada de e-mails para os admins. |
| N-163 | P2 | edgar | senha da linha só para quem tem permissão de Telefonia | Qualquer usuário ativo, até um recém-criado, recebe a senha da linha telefônica da empresa. |
| N-164 | P2 | edgar | id do destinatário opaco no link rastreável | O link de campanha mostra o id de quem recebeu; qualquer pessoa com o link sabe que aquele número recebeu a campanha. |
| N-165 | P3 | edgar | chamada por usuário exige admin/supervisor | Qualquer usuário logado pode mandar buscar a foto de até 500 contatos no provedor. |
| N-166 | P3 | edgar | CORS pela lista de origens permitidas | É a única função que aceita qualquer site como origem; as outras só aceitam o próprio Zapp. |
| N-167 | P3 | edgar | e-mail de novo dispositivo com campos escapados e limite | O nome do dispositivo entra no e-mail sem tratamento (dá para injetar HTML) e não há limite de envios. |
| N-168 | P3 | edgar | não devolver ao navegador o erro cru do provedor de e-mail | Quando o envio falha, a resposta traz a mensagem interna do provedor de e-mail, que pode ter detalhe da conta. |

## IA (4)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-169 | P2 | worker | detector de objeções não confunde falha com "nenhuma objeção" | Quando a IA responde vazio ou fora do formato, a tela diz "nenhuma objeção" e o vendedor acredita. |
| N-170 | P2 | edgar | sugestão de resposta usa os artigos da base que têm a ver com a conversa | Hoje a sugestão leva sempre os 10 primeiros artigos publicados, mesmo sem relação com o que o cliente perguntou. |
| N-171 | P2 | edgar | robô de atendimento não usa artigo qualquer quando a busca não acha nada | Sem artigo relevante, o robô hoje pega 5 artigos quaisquer e pode responder algo errado ao cliente. |
| N-172 | P2 | iris | nome no interruptor e nas barras | O interruptor de classificação automática e as barras de risco de perda de cliente não têm nome. |

## Conexões (3)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-173 | P2 | workersql | banco: impedir conexão de WhatsApp sem identificador da instância 🗄 | Conexão sem identificador vira "fantasma" e escapa da trava de duplicidade; a regra impede que ela nasça assim. |
| N-174 | P2 | iris | nome no menu da conexão e nos interruptores de horário e integrações | Na tela de conexões, o menu de cada número e os interruptores de horário/integrações não têm nome. |
| N-175 | P3 | worker | ler só as colunas usadas de whatsapp_connections | As telas de conexões e diagnóstico trazem para o navegador colunas internas (QR code, ids de segredo) que não exibem. |

## E-mail (2)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-176 | P2 | iris | nome nos botões voltar e excluir da conversa e no filtro da caixa | Na leitura de e-mail, voltar e mandar para a lixeira são só ícones, e o filtro da caixa não tem nome. |
| N-177 | P3 | iris | compositor flutuante anunciado como diálogo com nome | A janela de escrever e-mail aparece solta na página, sem ser anunciada como janela de composição. |

## Monitoramento (2)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-178 | P2 | iris | nome nos filtros dos registros e nas barras de SLA | No monitoramento, os filtros do histórico de saúde e as barras de SLA por instância não dizem o que são. |
| N-179 | P3 | iris | relatório de diagnóstico sem URL completa de webhook e barra com nome | O relatório baixado do diagnóstico leva o endereço completo dos webhooks (pode ter token) para fora. |

## Quadro (2)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-180 | P2 | iris | cartão de tarefa sem 'botão dentro de botão' e 'Abrir conversa' com área maior | No quadro o cartão inteiro vira um botão que tem outros botões dentro, o que confunde teclado e leitor de tela; o 'Abrir conversa' tem só 24 px. |
| N-181 | P2 | iris | botão 'Política da coluna' com área mínima de 24 px | O botão de política de cada coluna tem 20×20 px, abaixo do mínimo para tocar. |

## Teams (2)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-182 | P2 | iris | lista vazia sem 'listbox' inválido e nome nos botões de ícone do chat de equipe | Com a lista vazia o leitor de tela encontra uma lista de opções sem opções, e vários botões do chat de equipe (limpar busca, fechar resposta, enviar, rolar ao fim) não têm nome. |
| N-183 | P2 | iris | 'Nova conversa' com abas sem painel trocadas por botões de alternância | As abas do diálogo de nova conversa prometem um painel que não existe e o leitor de tela acusa atributo inválido. |

## Automações (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-184 | P2 | iris | nome no interruptor do cartão e nos seletores do editor | Ativar automação e escolher gatilho/ação são controles sem nome. |

## Base (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-185 | P2 | iris | nome nos botões editar/excluir e nos seletores | Editar e excluir artigo são ícones sem nome e os filtros não têm rótulo. |

## CRM (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-186 | P2 | vera | lista do que muda ao ligar a chave crm.integration | Antes de ligar o CRM 360 para todos, o dono vê exatamente quais telas e selos mudam. |

## Campanhas (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-187 | P2 | iris | nome no excluir variante e na barra de progresso | No teste A/B de campanha, excluir variante não tem nome e a barra de andamento não diz de qual campanha é. |

## Carteira (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-188 | P2 | iris | nome nos seletores, no interruptor e no excluir regra | Na carteira, os filtros, o ativar regra e o excluir regra não têm nome. |

## Casco (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-189 | P2 | worker | animações do framer-motion respeitam 'reduzir movimento' em todo o app | Hoje só a tela de Contatos desliga as animações para quem pediu menos movimento; o resto do app continua animando. |

## Chatbot (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-190 | P2 | iris | nome nos botões editar/duplicar/excluir, no interruptor e nos seletores dos fluxos | Na lista de fluxos do chatbot os botões de ação e o interruptor de ativo não têm nome. |

## Conquistas (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-191 | P2 | iris | nome nas barras de progresso, no atualizar do ranking e selo legível | Na tela de Conquistas as barras de nível não dizem o que medem, o atualizar do ranking não tem nome e o selo de pontos tem contraste baixo. |

## Detalhe (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-192 | P2 | iris | conteúdo dentro de <main> com um título principal | A página de detalhe da fila deixa todo o conteúdo fora das regiões que o leitor de tela usa para navegar. |

## Equipe (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-193 | P2 | iris | nome no seletor do convite e no filtro do monitor | O seletor de papel no convite de atendente e o filtro do monitor de desempenho não têm nome. |

## Grupos (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-194 | P2 | iris | nome no menu do grupo e nos seletores | Na tela de grupos o menu de cada grupo e os filtros não têm nome. |

## Integrações (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-195 | P2 | iris | nome nos botões e interruptores | Testar/remover fluxo do n8n e os interruptores de Sentry e Google Agenda não têm nome. |

## Mensagens (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-196 | P2 | iris | nome no filtro e no cancelar envio | No calendário de envios, o filtro e o botão de cancelar mensagem agendada não têm nome. |

## NPS (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-197 | P2 | designer | cartões de métrica com contraste AA usando pares de texto existentes | Os números de promotores, detratores e total ficam com texto colorido fraco sobre fundo claro. |

## Notificações (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-198 | P2 | iris | nome no 'testar som' e no seletor de cada tipo | Nas preferências de notificação, testar o som e escolher o som de cada tipo são controles sem nome. |

## Omnichannel (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-199 | P2 | iris | nome nos seletores e no interruptor das regras de roteamento | As regras de roteamento por canal têm seletores e interruptor sem nome. |

## Seletor (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-200 | P2 | iris | botão de abrir com nome | O botão que abre o seletor de emoji (componente comum) não tem nome. |

## Sentimento (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-201 | P2 | iris | nome no filtro de período e título 'Evolução Diária' na ordem certa | O filtro de período dos alertas de sentimento não tem nome e o título da seção pula nível. |

## Transcrições (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-202 | P2 | iris | nome no limpar busca e no filtro | No histórico de transcrições, o 'x' da busca e o filtro não têm nome. |

## Voz (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-203 | P2 | iris | nome nos seletores e no remover fala dos diálogos de voz | Nas telas de voz, escolher voz/estilo e remover uma fala são controles sem nome. |

## Chat (2)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-204 | P3 | iris | abrir mídia em nova aba com noopener | A página aberta a partir da imagem do chat de equipe consegue mexer na aba do Zapp (risco de página falsa de login). |
| N-205 | P3 | worker | departamentos sem pedir coluna que não existe | A busca de departamentos ativos pede uma coluna que não existe/está negada e tende a falhar. |

## Testes (2)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-206 | P3 | workertestes | bootstrap comum das Edge Functions (edge-boot) | O arquivo que monta CORS, log e cliente de todas as Edge Functions com guarda não tem nenhum teste. |
| N-207 | P3 | workertestes | normalizador de contatos da sincronização Evolution | A conversão dos contatos da Evolution (v2 e GO) para um formato único não tem teste. |

## Barra (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-208 | P3 | iris | recolher menu, notificações e voltar com área de toque maior | Na barra lateral, recolher, notificações e voltar têm 28 px; em tela de toque ficam difíceis de acertar. |

## Cartão (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-209 | P3 | iris | CardTitle aceita nível de título sem mudar o visual | Todo título de cartão sai como nível 3, então as telas pulam do título principal direto para o nível 3. |

## Celular (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-210 | P3 | iris | botões do cabeçalho (menu, busca, notificações) com 44 px | No celular os três botões do topo têm 40 px, abaixo do recomendado para o dedo. |

## Design (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-211 | P3 | vera | conferir fontes das páginas fora do app (docs/talkx, public/) | Mostra se as páginas de apoio usam a mesma fonte do sistema. |

## Dispositivos (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-212 | P3 | worker | ler só as colunas usadas | A detecção de dispositivo traz IP, cidade e impressão digital do aparelho para o navegador sem precisar de tudo. |

## Log (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-213 | P3 | worker | ler só as colunas usadas nas telas de alertas e IA | As telas que mostram alertas trazem o log de auditoria inteiro, com detalhes que não exibem. |

## Mapa (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-214 | P3 | worker | log de erro do Mapbox sem o objeto cru (pode levar o token) | Quando o mapa falha, o console de produção grava o erro inteiro, que pode conter o token do mapa. |

## Pagamentos (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-215 | P3 | iris | sem 'copiar link' enquanto a página /pay não existe e nomes nos controles | A tela oferece copiar um link de pagamento para uma página que ainda não existe, levando dado comercial para fora à toa; e os botões não têm nome. |

## Provedores (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-216 | P3 | worker | ler só as colunas usadas | A lista de provedores de IA traz o nome do segredo da chave para o navegador sem precisar. |

## Régua (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-217 | P3 | vera | cobertura de linhas dos helpers de autorização das Edge Functions | Não há medida de quanto do código que decide acesso está coberto por teste; só contagem de arquivos. |

## War (1)

| nº | prior. | quem | o que | por quê |
|---|---|---|---|---|
| N-218 | P3 | iris | rótulos de botão sem corte no celular | No celular textos como 'Reatribuir Ausentes', 'Balancear Carga' e 'Histórico' aparecem cortados. |

## Decisões suas (não viram cartão até você decidir)

1. **Passos em produção que só você executa** (9 itens) — Quando você aplica/publica em produção as migrations e Edges pendentes (20260930120000, cron L5, send-email/detect-new-device/send-scheduled-report, get-sip-password, 5 edges do Talk X) e confere o deploy?
2. **Conferências com login real em produção** (14 itens) — Você reserva um horário para fazer os testes com login real (envio de produto, RLS com 2 usuários, prints, aceite visual 17/17, tarefa migrada)? Nenhum agente pode fazer isso.
3. **Valores de segredo que só existem no painel** (3 itens) — Você confere/cria no painel: segredo do alerta de custo do Searchbox, EVOLUTION_WEBHOOK_ENFORCE=token e os segredos/rota da VPS do preview de link?
4. **Rotação de credenciais** (8 itens) — Rotacionar agora as credenciais expostas (service_role, senha do banco, MCP_TOKEN, chave da Evolution e de IA) e adotar rotação a cada 90 dias? Pode derrubar o WhatsApp por alguns minutos.
5. **Segredos e permissões no GitHub** (9 itens) — Mover a service_role para um environment protegido, criar o usuário de banco só-leitura para os guardas, logar no Docker Hub, apagar VITE_* sem uso, exigir aprovação no deploy de Edge, ligar validade do secret scanning e tornar o DB Live Guard obrigatório?
6. **Qualidade no GitHub (Sonar, artefatos, rollback)** (5 itens) — Manter, ajustar ou desligar o Quality Gate do Sonar; apagar artefatos antigos (retenção 14 dias); querer rollback automático no deploy de Edge; e pode corrigir só os comentários dos workflows?
7. **Apagar ou arquivar coisas antigas** (13 itens) — Apagar a pasta supabase-export, a Edge public-api (só responde 410), as funções do Sicoob e a tabela crisis_room_alerts sem uso; arquivar a origem vpkm/Lovable; e aceitar como estão as migrations antigas com erro (já aplicadas, não podem ser editadas)?
8. **Medições que dependem de estatística de produção** (5 itens) — Liberar leitura de pg_stat/EXPLAIN em produção (ou um ambiente com dados reais) para decidir índices e medir carga? Hoje nada pode tocar produção.
9. **Sistemas externos (Singu, CRM externo, PromoGifts, MCP, Evolution GO)** (6 itens) — Abrir pedido ao Singu/CRM externo/PromoGifts (revogar anon das RPCs antigas, flag de pedidos, ranking) e trabalho no repo do MCP? Nada disso está neste repositório.
10. **Exportar, importar, compartilhar ou mandar para fora (regra atual proíbe)** (5 itens) — Liberar alguma exceção à regra "nenhuma informação sai do sistema" (exportar supressão por página, exportação LGPD do titular, compartilhar filtro entre usuários, mandar arquivo ao VirusTotal, importar templates)?
11. **Edição em massa de contatos (regra: só no Singu)** (2 itens) — Deixar um job do Talk X vincular contatos ao CRM 360 e preencher cidade/UF/origem em lote? Hoje a regra diz que edição em massa de contatos é só no Singu.
12. **Segurança de login e acesso** (11 itens) — Tornar MFA obrigatório para admin, religar ou apagar o bloqueio por IP/país, fechar o login direto por senha, trocar criação de usuário por convite, ligar a CSP em bloqueio, esconder mensagem apagada no banco, mascarar CPF/cartão nos logs da IA e fazer a cota de IA falhar fechada?
13. **Mensagens: reenvio automático e alertas** (5 itens) — Reenviar sozinho mensagem do Inbox que falhou (hoje evitado de propósito para não duplicar ao cliente)? Gerar alerta de SLA no servidor a cada 5 min e redistribuir? Adotar distribuição por habilidade? Usar a conexão do departamento e ligar ou apagar whatsapp_connection_queues?
14. **Multiplix: regressões da reconciliação e chave de desligar** (9 itens) — Reabrir como cartões as 7 regressões da reconciliação do Multiplix (MX01–MX08) — elas pedem ensaio com envio real — e criar a chave por departamento que desliga o Multiplix sem deploy?
15. **Funcionalidades novas de produto** (10 itens) — Quais destas entram no roteiro: aprovação interna de template, catálogo de filtros, filtros da supressão, textos da Ajuda, push do alarme, painéis de observabilidade, memória da IA, IA nas campanhas, busca por significado (pgvector, dependência nova) e menções @ no chat interno?
16. **Testes que escreveriam em produção** (4 itens) — O E2E logado roda contra produção: apagar os contatos [E2E] que sobraram, liberar um E2E do chat interno (cria mensagens reais) e rodar a suíte toda noite — ou só contra banco local?
17. **Origem dos dados herdados** (1 itens) — Decidir o que fazer com ai_providers, access_level, api_token vazio, Evolution wpp2, audit_logs da origem e prevent_role_escalation herdados da migração.
18. **Token global da Evolution** (1 itens) — Remover o token global da Evolution (EVOLUTION_INSTANCE_TOKEN/NAME)? Exige olhar 48 h de logs de produção sem "instance token fallback".

## Contatos (plano em revisão com você; nada vira cartão)

Contagem exata (COUNT(*) OVER) e o piso em 100k: decidir contagem aproximada/cacheada ou materializar visibilidade; Reavaliar decisao 20261001-103207-6c0b: flag (ou teto em banco) para conter custo sem deploy (git revert nao e limpo); Criar conjunto COMPLETO de pg_trgm nas 7 colunas do OR (nao a versao parcial); ContactForm ignora a flag e responde pela maioria das sessões; Trigger contact_address_changed nunca registrou evento (verde nunca exercitado); 3386 contatos sem endereco; Inlinar predicado de visibilidade (can_edit_contact) no search_contacts: -53% a -66% sem DDL; Ligar enriquecimento de empresa/cargo/e-mail a partir do CRM externo (somente leitura via crm_contact_links); Cronometrar lacunas: ponto exato do limiar (10k-30k), concorrencia 30k/100k, sort updated_at, producao real; Fotos de contato reais (avatar_url) em vez de rostos gerados e fonte Inter (±3%); Teste para src/lib/mapboxLoader.ts (0% de cobertura); Restaurar contato excluido e reclassificar is_lid_legacy hoje so por SQL manual; Medições de uso/Sicoob e decisões de preparação da F0 nunca executadas; Etapa 28 (medição), 39 (contatos-seed aguardam decisão) e 65 (props mortas na F3); 2º editor com endereço vazio, types.ts defasado, sem onBlur/Tab, import/writer mortos, guarda E04 frágil; Atualizar COMPLETE_SYSTEM_FEATURES.md e FUNCTIONALITIES_INVENTORY.md (seção Contatos); CLAUDE.md: 6 linhas na seção Contatos (tipos canônicos, exclusão via RPC, include_legacy, contactTypeConfig)

## Achados que pedem atenção

- **E2E logado nunca termina:** as 30 últimas execuções foram canceladas por tempo (173 testes num processo só, cortados aos 15 min). Há proposta na lista (CI/DevOps).
- **Trocar a foto de perfil deve falhar na 2ª vez:** a migration 20260928560000 tirou de todos a permissão de sobrescrever arquivo no Storage e o envio de foto regrava o mesmo caminho. Inferência pelo código; a proposta pede o teste vermelho antes.
- **4 cartões marcados como feitos cuja mudança não está na dia:** t_f1c4bc72 (pasta de arquivos do chat interno), t_893afa88 (convites e vocabulário de auditoria), t_5c0588e7 (token da Evolution por instância), t_dd1a1194 (conversa certa nas reações). Proposta: reabrir os 4 como [retomar] junto com a aprovação.
