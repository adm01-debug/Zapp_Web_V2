# Plano do módulo Contatos por jornada do vendedor (08/10/2026)

> **Status:** plano completo: 120 itens em 12 blocos de 10, com um cartão para cada item (exceto 2 que o Claude executa). O plano antigo de 100 etapas foi EXCLUÍDO (local e `dia`; nunca esteve no GitHub). Gerado de `~/arquitetura-v2/gatilhos/ct_dados_*.py`: para mudar um item, mude lá e regere.

## Decisões fechadas com o Joaquim (Q1–Q25)
- **Propósito:** o módulo é a ponte com o Singu: o vendedor acha o contato rápido e vê, no mesmo lugar, o que veio do Singu. "Rápido" = 3 cliques e 5 segundos da abertura até a conversa. Celular primeiro; manter o padrão visual e evoluir.
- **Jornadas:** 1 Achar · 2 Entender quem é · 3 Agir · 4 Manter em ordem, mais a trilha transversal de Proteção e o fechamento.
- **Acesso:** o vendedor vê só os contatos atribuídos a ele; o supervisor vê todos os contatos que têm dono (escopo em decisão, Q26: o banco não tem departamento nem equipe preenchidos); o administrador vê todos; contatos SEM atribuição (318 hoje) ficam só com o administrador; a regra por fila sai. Empresa: ficha só para consulta aberta a partir do contato (o vendedor só vê dados da empresa e os contatos dela que são dele).
- **Busca e filtros:** busca por nome do contato ou da empresa; filtros do Singu completos (vendedor, ramo, RFM, estado, ativado, já comprou, ativo/inativo, cargo, departamento e o mais que existir). Cargo e departamento do Singu dependem do Singu ampliar a busca (documento CT-111); a arquitetura já fica pronta.
- **Card/lista:** nome, apelido, cargo, departamento, empresa, ativo/inativo, tempo sem comprar, último pedido, RFM (o vendedor responsável fica só como filtro). Nada saindo do card; fonte mínima 11 px.
- **Edição:** só edição básica (nome, apelido, cargo, departamento, e-mail, telefone adicional), enviada à área provisória do Singu; só vale quando a IA (baixo risco) ou o gestor (risco) aprovar NO SINGU. O vendedor vê o valor que alterou com o aviso "sujeito a aprovação". Nada de edição em massa.
- **Proteção:** bloqueio de copiar/imprimir/exportar vindo do servidor, marca d'água, telefone e e-mail ocultos com revelação registrada, limite de 100 fichas/hora com alerta ao gestor sem bloquear a venda. Limite honesto: foto de tela e gravação não se impedem; a defesa é entregar menos dado, registrar, limitar e identificar.
- **Entrega:** o lado do Zapp fica completo agora, com contrato tipado e dados de teste só em dev/teste (nunca em produção). O lado do Singu vira os documentos CT-111/CT-112 com SQL proposto, aplicados por quem o Joaquim indicar. Produção, migrations e deploy só com autorização dele.
- **Padrões:** KPIs Empresas/Fornecedores filtram ao clicar; "Mostrar legados" com limpeza só admin; foto real com iniciais; lixeira de 30 dias só admin restaura; mesclar/comparar ficam; contagem sempre exata.

## Como os blocos andam
Cada bloco tem 10 itens. A abertura do bloco espera o 5º item do bloco anterior (os blocos se sobrepõem um pouco); os demais itens esperam a abertura do próprio bloco ou suas dependências reais. O motor de gatilhos libera cada cartão quando suas dependências estiverem integradas na `dia`.

## Jornada 1 · Achar (CT-001 a CT-030)
_O vendedor abre o módulo e chega ao contato certo em 3 cliques e 5 segundos._

### Bloco 1 · itens 1 a 10

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **CT-001** Medição inicial do caminho até a conversa | Antes de mudar qualquer coisa, medimos quantos cliques e segundos o vendedor gasta hoje para ir da abertura do módulo até a conversa com um cliente. | workertestes | teste | M | — |
| **CT-002** Contrato dos campos do Singu com adaptador real e adaptador de teste | Os campos do Singu (empresa, ramo, cargo, departamento, apelido, ativo ou inativo, tempo sem comprar, último pedido, RFM, vendedor, UF) passam a ter um formato único, pronto para receber o dado real quando o Singu entregar. | hugo (lógica) | lógica | M | — |
| **CT-003** Contatos de teste realistas para o ambiente local | O ambiente de teste ganha mais de 150 contatos variados (nomes e empresas longos, sem e-mail, de vários vendedores) para testarmos o visual e os filtros de verdade. | workersql (banco) | BANCO (local) | M | — |
| **CT-004** Dados de teste do Singu (fixtures) | Criamos dados de teste do Singu para ver como cada card fica com informação completa, incompleta e muito longa. | workertestes | teste | M | 002, 001 |
| **CT-005** Chave contacts.v2 para liberar por partes | A nova experiência pode ser ligada por partes e desligada na hora, sem esperar uma nova versão do sistema. | hugo (lógica) | lógica | M | — |
| **CT-006** Card novo com os 9 campos, celular primeiro | Cada contato aparece em um card organizado: nome, apelido, cargo, departamento, empresa, ativo ou inativo, tempo sem comprar, último pedido e RFM, sem nada saindo para fora do card. | iris (telas) | tela | G | 002, 005, 001 |
| **CT-007** Lista e tabela com os mesmos campos | A lista e a tabela mostram as mesmas informações do card, com o nome sempre visível e um sinal de que dá para rolar para ver mais colunas. | iris (telas) | tela | M | 006, 001 |
| **CT-008** Tamanho de letra e contraste do módulo | As letras pequenas demais ficam legíveis e o contraste fica dentro da norma, sem trocar as cores do sistema. | designer | visual | M | 006, 001 |
| **CT-009** Barra de busca e filtros em uma linha no celular | No celular a busca e os filtros ficam em uma linha só e o primeiro contato aparece sem precisar rolar. | iris (telas) | tela | G | 005, 001 |
| **CT-010** Estados que não quebram: carregando, vazio, erro e Singu indisponível | Se o Singu ficar fora do ar ou demorar, a lista continua funcionando e os dados dele aparecem quando chegarem. | iris (telas) | tela | M | 006, 001 |

### Bloco 2 · itens 11 a 20

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **CT-011** Busca por nome do contato ou da empresa, já na primeira letra | O vendedor digita e o resultado aparece na hora, com o trecho encontrado destacado. | hugo (lógica) | lógica | M | 005 |
| **CT-012** Banco: filtrar a lista local por telefones (para o filtro do Singu) | Base para os filtros do Singu funcionarem sem copiar dados do Singu para o Zapp. | workersql (banco) | BANCO (local) | M | 003, 005 |
| **CT-013** Servidor: ação que devolve os telefones que casam com o filtro do Singu | O filtro do Singu na lista funciona consultando o Singu na hora, sem guardar cópia dos dados dele. | edgar (servidor) | SERVIDOR (Edge) | G | 002, 011 |
| **CT-014** Combinar os filtros do Singu com a lista local | O vendedor escolhe filtros do Singu e a lista mostra só os contatos dele que casam. | hugo (lógica) | lógica | G | 011, 012, 013 |
| **CT-015** Painel de filtros (folha inferior no celular) | Os filtros ficam num painel organizado, com os escolhidos aparecendo como etiquetas fáceis de remover. | iris (telas) | tela | G | 009, 014, 011 |
| **CT-016** Filtros por cargo e departamento | O vendedor filtra por cargo e departamento do contato. | iris (telas) | tela | M | 015, 011 |
| **CT-017** Opções dos filtros vindas do Singu | As listas de vendedor, ramo, RFM e estado vêm do próprio Singu, sempre atualizadas. | hugo (lógica) | lógica | M | 013, 011 |
| **CT-018** Filtros salvos | O vendedor salva uma combinação de filtros com um nome, renomeia, atualiza, apaga e escolhe um padrão para si. | hugo (lógica) | lógica | M | 015, 011 |
| **CT-019** Ordenação com rótulos completos e critérios úteis | A ordenação mostra o nome completo ('Nome (A–Z)') e inclui último pedido, tempo sem comprar e RFM. | iris (telas) | tela | M | 006, 011 |
| **CT-020** Abas por tipo legíveis no celular | As abas de tipo de contato deixam claro que dá para rolar e não aparecem cortadas pela metade. | iris (telas) | tela | P | 006, 011 |

### Bloco 3 · itens 21 a 30

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **CT-021** Banco: o vendedor passa a ver só os contatos atribuídos a ele | Cada vendedor vê apenas os contatos dele; o supervisor vê a equipe; o administrador vê todos. | workerauth (segurança) | BANCO (local) | G | 003, 015 |
| **CT-022** Simulação de impacto da regra de visibilidade | Antes de ligar a regra, medimos quantos contatos cada vendedor deixaria de ver. | Claude | Claude | M | 021 |
| **CT-023** Dados do Singu para a página de contatos, em lote | Os dados do Singu aparecem nos cards de uma vez, sem esperar contato por contato. | hugo (lógica) | lógica | G | 002, 024, 021 |
| **CT-024** Servidor: lote do Singu devolve os campos novos | O servidor passa a entregar, quando o Singu enviar, cargo, departamento, apelido, último pedido, tempo sem comprar e ativo ou inativo. | edgar (servidor) | SERVIDOR (Edge) | M | 002, 015 |
| **CT-025** Contagem exata e anúncio por voz | A tela diz sempre quantos contatos aparecem e leitores de tela anunciam o resultado. | iris (telas) | tela | P | 011, 021 |
| **CT-026** Teclado e atalhos do módulo | O vendedor navega pelos cards só com o teclado e usa atalhos para buscar e abrir. | iris (telas) | tela | G | 006, 021 |
| **CT-027** Acessibilidade da Jornada 1 | Tudo que o vendedor usa para achar um contato funciona com leitor de tela. | iris (telas) | tela | M | 026, 021 |
| **CT-028** Orçamento de desempenho da lista | A lista continua rápida com muitos contatos. | hugo (lógica) | lógica | M | 023, 021 |
| **CT-029** Roteiro visual reutilizável | Toda tela do módulo passa a ter capturas padrão para comparar antes e depois. | workertestes | teste | M | 006, 021 |
| **CT-030** Teste de ponta a ponta da Jornada 1 e medição | Provamos que o vendedor acha e abre um contato em até 3 cliques e 5 segundos. | workertestes | teste | G | 020, 021, 023, 025, 027, 029, 015, 010, 018, 019 |

## Jornada 2 · Entender quem é (CT-031 a CT-060)
_Ficha do contato com o que veio do Singu, ficha da empresa (só consulta) e indicadores._

### Bloco 4 · itens 31 a 40

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **CT-031** Ficha do contato em seções, celular primeiro | Ao abrir um contato, o vendedor vê uma ficha organizada em seções: quem é, dados profissionais, comercial, perfil e histórico. | iris (telas) | tela | G | 006, 005, 025 |
| **CT-032** Seção Dados profissionais (do Singu) | A ficha mostra cargo, departamento, e-mail corporativo (marcado como verificado no Singu) e empresa. | iris (telas) | tela | M | 031, 002 |
| **CT-033** Seção Comercial: vendedor, pedidos, ticket, ativo ou inativo e último pedido | O vendedor vê de relance a situação comercial do cliente: ativo ou inativo, quanto compra, quando comprou pela última vez e há quanto tempo não compra. | iris (telas) | tela | M | 031, 002 |
| **CT-034** Seção Perfil Singu (comportamento) | A ficha mostra o perfil comportamental do contato (DISC, VAK, Big Five, MBTI, Eneagrama, temperamento) e os detalhes úteis para a conversa. | iris (telas) | tela | M | 031 |
| **CT-035** Hook único da ficha do contato | A ficha carrega os dados do Singu de uma vez, mesmo se uma parte falhar. | hugo (lógica) | lógica | M | 002, 025 |
| **CT-036** Ficha completa do Singu (aba 360) | O vendedor consulta, sem sair do Zapp, a ficha completa do cliente no Singu: documentos, relacionamento, compras, perfil de preço e prazo. | iris (telas) | tela | G | 035, 031 |
| **CT-037** Resumo das últimas interações | A ficha mostra as últimas conversas, ligações e e-mails com esse contato, com atalho para o histórico completo. | hugo (lógica) | lógica | M | 035, 031 |
| **CT-038** Briefing do contato (inteligência) | Antes de falar com o cliente, o vendedor vê um resumo com sugestões de abordagem. | iris (telas) | tela | M | 035, 031 |
| **CT-039** Dados pessoais: aniversário e redes | A ficha mostra aniversário (com aviso no mês) e as redes sociais do contato. | iris (telas) | tela | P | 031 |
| **CT-040** Contato sem vínculo com o Singu | Se o contato ainda não está ligado ao Singu, a ficha explica e oferece procurar o vínculo. | hugo (lógica) | lógica | M | 035, 031 |

### Bloco 5 · itens 41 a 50

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **CT-041** Contrato e dados de teste da empresa | Preparamos o formato dos dados da empresa e os dados de teste. | hugo (lógica) | lógica | M | 002, 004, 035 |
| **CT-042** Servidor: dados da empresa para o vendedor | O servidor entrega os dados da empresa do contato, só para quem pode ver o contato. | edgar (servidor) | SERVIDOR (Edge) | M | 041 |
| **CT-043** Ficha da empresa (só consulta) aberta a partir do contato | Do contato, o vendedor abre a ficha da empresa para entender com quem está lidando. | iris (telas) | tela | G | 042, 031, 041 |
| **CT-044** Outros contatos da mesma empresa (só os do vendedor) | Na ficha da empresa o vendedor vê os outros contatos dela que são dele. | hugo (lógica) | lógica | M | 043, 021, 041 |
| **CT-045** Histórico de compras da empresa | A ficha da empresa mostra resumo de compras: total, ticket, primeira e última compra e últimos pedidos. | iris (telas) | tela | M | 043, 041 |
| **CT-046** Nome da empresa clicável nos cards | No card e na lista, tocar no nome da empresa abre a ficha dela. | iris (telas) | tela | P | 043, 006, 041 |
| **CT-047** Filtro por empresa e ramo coerente com a ficha | Da ficha da empresa o vendedor filtra a lista pelos contatos dela com um toque. | hugo (lógica) | lógica | P | 043, 014, 041 |
| **CT-048** Estados e erros da ficha da empresa | Se faltar dado da empresa ou o Singu falhar, a ficha avisa sem quebrar. | iris (telas) | tela | P | 043, 041 |
| **CT-049** Acessibilidade e celular da ficha e da empresa | Ficha do contato e da empresa funcionam bem no celular e com leitor de tela. | iris (telas) | tela | M | 036, 043, 041 |
| **CT-050** Teste de ponta a ponta da Jornada 2 | Provamos que o vendedor entende quem é o cliente sem sair do Zapp. | workertestes | teste | G | 036, 037, 040, 044, 045, 048, 049, 041 |

### Bloco 6 · itens 51 a 60

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **CT-051** Indicadores do topo que filtram ao clicar | Os números do topo (total, novos, empresas, fornecedores) mostram a verdade e, ao tocar, filtram a lista. | iris (telas) | tela | M | 020, 014, 045 |
| **CT-052** Avatar com foto real e iniciais estáveis | Quando existir foto, ela aparece; senão, as iniciais certas e sempre da mesma cor. | hugo (lógica) | lógica | M | 006, 045 |
| **CT-053** Telefone formatado igual em todo o módulo | O telefone aparece sempre no mesmo formato, em qualquer tela. | hugo (lógica) | lógica | M | 006, 051 |
| **CT-054** Tempo sem comprar com leitura rápida | O vendedor identifica rápido quem está há muito tempo sem comprar. | hugo (lógica) | lógica | P | 006, 033, 051 |
| **CT-055** RFM explicado | O vendedor entende o que significa cada segmento de RFM ao tocar nele. | iris (telas) | tela | P | 006, 051 |
| **CT-056** Indicador ativo ou inativo | Um selo claro mostra se o cliente está ativo ou inativo. | iris (telas) | tela | P | 006, 015, 051 |
| **CT-057** Mapa e analytics do módulo sob controle | O mapa de contatos e a análise não travam nem custam sem controle. | iris (telas) | tela | G | 006, 051 |
| **CT-058** Endereço no painel, abrindo o mapa dentro do sistema | O endereço aparece na ficha e o vendedor vê no mapa sem sair do sistema. | iris (telas) | tela | M | 031, 057, 051 |
| **CT-059** Avisos de qualidade do dado | A ficha avisa quando falta ou está estranho um dado importante. | hugo (lógica) | lógica | P | 031, 051 |
| **CT-060** Revisão visual e de acessibilidade da Jornada 2 | Conferimos o visual e a acessibilidade de toda a Jornada 2. | designer | visual | M | 050, 051, 052, 053, 054, 055, 056 |

## Jornada 3 · Agir (CT-061 a CT-070)
_Conversar, ligar e mandar e-mail a partir do contato, sem revelar nem copiar o número._

### Bloco 7 · itens 61 a 70

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **CT-061** Conversar com um toque | O vendedor abre a conversa com o contato com um único toque, do card, da lista ou da ficha. | iris (telas) | tela | M | 006, 031, 055 |
| **CT-062** Ligar dentro do sistema, sem revelar o número | O vendedor liga para o cliente pelo próprio Zapp sem precisar ver nem copiar o número. | iris (telas) | tela | M | 006, 061 |
| **CT-063** E-mail dentro do sistema | O vendedor escreve um e-mail ao contato pelo próprio Zapp, sem ver nem copiar o endereço. | hugo (lógica) | lógica | M | 006, 061 |
| **CT-064** Trocar os links externos por ações internas | Os links de WhatsApp, e-mail e telefone que expõem o dado somem e viram ações do sistema. | iris (telas) | tela | M | 061, 062, 063 |
| **CT-065** Remover os botões de copiar telefone e e-mail | Some a possibilidade de copiar telefone e e-mail por botão. | iris (telas) | tela | P | 064, 061 |
| **CT-066** Menu de mais ações sem roubar espaço do nome | O menu de ações do card agrupa o que falta sem cortar o nome do contato. | iris (telas) | tela | M | 061 |
| **CT-067** Estados de hover, foco e pressionado consistentes | Todos os botões do módulo reagem do mesmo jeito ao toque, ao teclado e ao mouse. | designer | visual | M | 061, 066 |
| **CT-068** Atalhos de teclado para agir | Com o card selecionado, o vendedor usa teclas para conversar, ligar e escrever. | iris (telas) | tela | P | 061, 062, 063, 026 |
| **CT-069** Contatos recentes | Os últimos contatos abertos ficam à mão para o vendedor retomar a conversa rápido. | hugo (lógica) | lógica | M | 061 |
| **CT-070** Teste de ponta a ponta da Jornada 3 | Provamos que o vendedor consegue agir sem ver nem copiar o dado. | workertestes | teste | G | 064, 065, 066, 068, 069, 067, 061 |

## Jornada 4 · Manter em ordem (CT-071 a CT-090)
_Edição básica com aprovação no Singu, tags, responsável, duplicados, mesclar, lixeira e legados._

### Bloco 8 · itens 71 a 80

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **CT-071** Contrato do pedido de alteração | Definimos como é um pedido de alteração: quais campos podem mudar, valor anterior, valor proposto e estado. | hugo (lógica) | lógica | M | 002, 065 |
| **CT-072** Formulário de edição básica | O vendedor corrige só os dados básicos do contato (nome, apelido, cargo, departamento, e-mail e telefone adicional); o resto aparece bloqueado com a explicação. | iris (telas) | tela | G | 071, 005 |
| **CT-073** Servidor: enviar o pedido de alteração ao Singu | O pedido do vendedor vai para a área provisória do Singu, sem nunca alterar o dado oficial. | edgar (servidor) | SERVIDOR (Edge) | G | 071 |
| **CT-074** Servidor: consultar o estado dos pedidos | O Zapp descobre, na hora, se um pedido foi aprovado, recusado ou segue pendente. | edgar (servidor) | SERVIDOR (Edge) | M | 073, 071 |
| **CT-075** Hook dos pedidos pendentes | A tela sabe, para cada contato, se há alteração sua aguardando aprovação. | hugo (lógica) | lógica | M | 071, 074 |
| **CT-076** Mostrar a alteração com o aviso 'sujeito a aprovação' | O vendedor vê o valor que ele alterou, marcado como 'sujeito a aprovação'; quando for aprovado ou recusado, é avisado. | iris (telas) | tela | G | 075, 072, 071 |
| **CT-077** Fechar o acesso direto de escrita no Singu | Ninguém além de administrador e supervisor consegue escrever direto no Singu pelo Zapp. | edgar (servidor) | SERVIDOR (Edge) | M | 073, 071 |
| **CT-078** Teste de ataque na edição | Provamos que um vendedor mal-intencionado não consegue estragar os dados. | workertestes | teste | G | 073, 076, 077, 021, 071 |
| **CT-079** Auditoria local dos pedidos enviados | Fica registrado quem enviou qual pedido, para qual contato e quando. | workersql (banco) | BANCO (local) | M | 071, 065 |
| **CT-080** Revisão visual e de acessibilidade da edição | Conferimos que o fluxo de edição é claro, legível e acessível. | designer | visual | M | 076, 072, 071 |

### Bloco 9 · itens 81 a 90

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **CT-081** Tags por contato e filtro de tags | O vendedor aplica e remove tags de um contato e filtra por várias tags (e/ou) ou por 'sem a tag'. | iris (telas) | tela | G | 015, 006, 075 |
| **CT-082** Trocar o responsável de um contato | Quem tem permissão passa um contato para outro vendedor, um por vez, com histórico. | iris (telas) | tela | M | 006, 021, 075 |
| **CT-083** Detectar contatos duplicados | O sistema avisa quando dois contatos parecem ser a mesma pessoa. | hugo (lógica) | lógica | M | 053, 003, 081 |
| **CT-084** Comparar 2 ou 3 contatos | O vendedor compara lado a lado dois ou três contatos específicos antes de decidir. | iris (telas) | tela | M | 083, 066, 081 |
| **CT-085** Mesclar 2 ou 3 contatos com prévia | O vendedor une contatos duplicados escolhendo, campo a campo, o que fica. | iris (telas) | tela | G | 084, 081 |
| **CT-086** Banco: lixeira de contatos (restaurar e apagar de vez) | Contatos excluídos ficam 30 dias na lixeira e só o administrador consegue restaurar ou apagar de vez. | workersql (banco) | BANCO (local) | G | 003, 075 |
| **CT-087** Telas de lixeira e de higiene de contatos legados | O administrador vê a lixeira e limpa contatos antigos sem telefone válido, um por vez, com prévia. | iris (telas) | tela | G | 086, 015, 081 |
| **CT-088** Retirar a edição em massa do Zapp | O Zapp deixa de ter edição em massa de contatos; isso é feito no Singu. | iris (telas) | tela | M | 006, 075 |
| **CT-089** Seleção limitada a 3, só para comparar e mesclar | O vendedor marca até 3 contatos apenas para comparar ou mesclar. | iris (telas) | tela | M | 088, 084, 081 |
| **CT-090** Teste de ponta a ponta da Jornada 4 | Provamos que o vendedor mantém os dados em ordem sem conseguir estragá-los. | workertestes | teste | G | 078, 080, 081, 082, 085, 087, 089 |

## Proteção dos dados (transversal) (CT-091 a CT-110)
_Bloqueio vindo do servidor, marca d'água, máscara com revelação registrada, limite e alerta._

### Bloco 10 · itens 91 a 100

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **CT-091** Banco: política de proteção vinda do servidor | O bloqueio de copiar e imprimir deixa de depender do navegador e passa a ser uma regra do sistema. | workersql (banco) | BANCO (local) | M | 085 |
| **CT-092** O bloqueio passa a ler a política do servidor | O usuário não consegue mais desligar a proteção pelo console do navegador. | hugo (lógica) | lógica | M | 091 |
| **CT-093** Bloqueios nas áreas de dados de contato | Nas telas de contato não dá para copiar, recortar, selecionar, arrastar, imprimir nem abrir o menu do botão direito. | iris (telas) | tela | G | 092, 091 |
| **CT-094** Marca d'água com nome e hora | Qualquer foto ou print da tela de contatos mostra quem estava com a tela aberta e quando. | iris (telas) | tela | M | 092, 091 |
| **CT-095** Banco: telefone e e-mail mascarados no servidor | O servidor entrega o telefone e o e-mail já escondidos em parte, e só mostra inteiros quando o vendedor pede. | workersql (banco) | BANCO (local) | G | 091 |
| **CT-096** Banco: registro de quem viu qual contato | Fica registrado quem viu o número ou o e-mail inteiro de qual contato e quando. | workersql (banco) | BANCO (local) | M | 091, 085 |
| **CT-097** Banco: limite de 100 fichas por hora com alerta | Quem abre ou revela fichas demais em uma hora gera um alerta ao gestor, sem travar a venda. | workersql (banco) | BANCO (local) | M | 096, 091 |
| **CT-098** Hook de revelar com registro | Ao tocar para ver o número inteiro, o sistema registra e mostra por alguns segundos. | hugo (lógica) | lógica | M | 095, 096, 091 |
| **CT-099** Telas com telefone e e-mail mascarados | Em todas as telas o telefone e o e-mail aparecem escondidos em parte e o vendedor toca para ver inteiro. | iris (telas) | tela | G | 098, 053, 091 |
| **CT-100** Alerta ao gestor quando o limite é passado | O gestor é avisado dentro do sistema quando um vendedor abre fichas demais. | hugo (lógica) | lógica | M | 097, 091 |

### Bloco 11 · itens 101 a 110

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **CT-101** Painel de acessos para administrador e supervisor | Administrador e supervisor veem quem abriu e revelou quais contatos, sem poder exportar. | iris (telas) | tela | M | 096, 097, 095 |
| **CT-102** Uma só regra para copiar | Qualquer botão de copiar do sistema passa pela mesma regra de permissão. | hugo (lógica) | lógica | M | 092, 095 |
| **CT-103** Copiar mensagem do chat respeita a mesma regra | Copiar o texto de uma mensagem do chat também obedece à política, porque a mensagem pode ter telefone ou e-mail. | hugo (lógica) | lógica | M | 102, 101 |
| **CT-104** Anexos e mídia respeitam a permissão de download | Baixar anexo do Gmail e abrir mídia em nova aba também exigem a permissão de download. | hugo (lógica) | lógica | M | 092, 095 |
| **CT-105** Nenhum log ou telemetria leva dado de contato | Confirmamos que nenhum registro técnico ou ferramenta de monitoramento recebe telefone, e-mail ou nome de contato. | workertestes | teste | M | 092, 095 |
| **CT-106** Guarda de regras do sistema no CI e orçamento com máscara | Se alguém tentar criar exportar, importar, copiar, imprimir, edição em massa, selo de canal ou cor fora do padrão, o teste falha. | workertestes | teste | G | 093, 099, 088, 028, 101 |
| **CT-107** Teste de ataque contra vazamento | Provamos que, com a proteção ligada, o vendedor não consegue tirar dados do sistema pelos caminhos que o sistema controla. | workertestes | teste | G | 093, 094, 099, 100, 102, 103, 104, 101 |
| **CT-108** Revisão de segurança das leituras de contatos | Uma revisão independente confirma que nenhuma leitura de contato escapa das regras de acesso e de máscara. | workerauth (segurança) | BANCO (local) | G | 021, 095, 096, 101 |
| **CT-109** Documentação de segurança do módulo | Fica escrito o que o sistema bloqueia, o que ele registra e o que ele não consegue impedir. | vera (docs) | documento | M | 093, 094, 099, 108, 101 |
| **CT-110** Revisão visual e de acessibilidade das proteções | Conferimos que a marca d'água e a máscara não atrapalham a leitura nem a acessibilidade. | designer | visual | M | 094, 099, 101 |

## Singu, medição e entrega (CT-111 a CT-120)
_Pedido ao Singu, testes de contrato, liberação por partes, medição final e documentação._

### Bloco 12 · itens 111 a 120

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **CT-111** Documento 'Pedido ao Singu': dados e filtros novos | Fica pronto o pedido para o Singu entregar os dados que faltam para os cards, filtros e ficha da empresa. | vera (docs) | documento | G | 024, 042, 016, 105 |
| **CT-112** Documento 'Pedido ao Singu': área provisória e aprovação | Fica pronto o desenho da área provisória e da aprovação de alterações no Singu. | vera (docs) | documento | G | 073, 074, 105 |
| **CT-113** Testes de contrato contra o formato do Singu | Se o Singu mudar o formato dos dados, um teste avisa antes de quebrar a tela. | hugo (lógica) | lógica | M | 111, 112 |
| **CT-114** Validação com os dados reais do Singu | Quando o Singu entregar os dados, conferimos o mock contra o real. | Claude | Claude | M | 113, 111 |
| **CT-115** Liberação por partes e plano de volta | O vendedor recebe a nova experiência por partes, com como voltar atrás em um minuto. | hugo (lógica) | lógica | M | 005, 076, 099, 111 |
| **CT-116** Telemetria mínima de uso | Passamos a saber o que o vendedor mais usa, sem tirar nada do sistema. | hugo (lógica) | lógica | M | 105, 030, 111 |
| **CT-117** Medição final: cliques, segundos, peso | Comparamos o antes e o depois para provar que ficou mais rápido. | workertestes | teste | M | 030, 070, 090, 107, 111 |
| **CT-118** Revisão geral de acessibilidade do módulo | Conferimos a acessibilidade do módulo inteiro, com foco no celular. | designer | visual | M | 060, 080, 110, 111 |
| **CT-119** Documentação do módulo | Fica escrito como o módulo funciona e como testar com os dados de teste. | vera (docs) | documento | M | 115, 117, 111 |
| **CT-120** Limpeza final: mocks fora de produção e código morto | Garantimos que dados de teste não vão para produção e removemos o que ficou sem uso. | iris (telas) | tela | M | 117, 119, 111 |

## Trilha de banco e servidor (nada disso vai a produção sem o Joaquim)
Banco (migrations LOCAIS): CT-003, CT-012, CT-021, CT-079, CT-086, CT-091, CT-095, CT-096, CT-097, CT-108.
Servidor (Edge Functions só no repositório): CT-013, CT-024, CT-042, CT-073, CT-074, CT-077.
Para cada uma: teste em banco descartável; produção só com autorização expressa; a simulação de impacto da visibilidade (CT-022) é feita pelo Claude antes de CT-021 ir adiante.

## O que depende do Singu (outro sistema)
CT-111 (dados e filtros novos), CT-112 (área provisória e aprovação) e CT-114 (validação com dados reais). Até o Singu aplicar, o Zapp usa o contrato com campos nulos e os dados de teste; nada quebra e nada aparece vazio de forma feia.

## Itens executados pelo Claude (sem cartão)
CT-022 (simulação de impacto da regra de visibilidade, leitura de produção) e CT-114 (validação com os dados reais do Singu).

## Riscos e cuidados
- Máscara e visibilidade mexem em RLS: só local até autorização; teste de RLS por papel em todo item de banco.
- Mock nunca em produção: teste de bundle (CT-002, CT-120).
- Filtros do Singu têm teto no servidor (2 mil telefones, limite de 60 chamadas/min) e avisam quando cortam.
- A fábrica integra devagar quando a máquina está carregada: o ritmo de liberação respeita os blocos e a carga.
