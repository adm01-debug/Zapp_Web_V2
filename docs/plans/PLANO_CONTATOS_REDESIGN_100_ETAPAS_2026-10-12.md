# Plano de redesign do módulo Contatos, 100 etapas (12/10/2026)

> **Status:** plano completo, 100 etapas (RD-001..RD-100), todos os cartões criados e delegados. Gerado de `~/arquitetura-v2/gatilhos/rd_dados_*.py`; para mudar uma etapa, mude lá e regere. Complementa (não substitui) o plano funcional `PLANO_CONTATOS_POR_JORNADA_2026-10-08.md` (CT-001..CT-130).

## Objetivo
Deixar a tela Contatos do Zapp Web V2 tão elegante e moderna quanto o design de referência feito pelo GPT (`zapp-contatos-design.html`, 12/10/2026): cabeçalho com origem dos dados, indicadores com placas de ícone, abas de tipo compactas, barra de ferramentas numa linha, **cards grandes com retrato**, lista e tabela no mesmo sistema visual, ficha completa em janela com quatro abas, carrossel "Explore seus contatos" e temas escuro e claro.

## O que foi lido (fatos)
- **Design:** HTML autocontido; markup, CSS e comportamento extraídos para `docs/design/contatos-redesign-2026-10-12/` (sem imagens). Fontes: Outfit e Plus Jakarta Sans, **já são as do sistema**. Azul primário #2864ed = o `primary` do sistema (221 83% 53%). Superfícies grafite: derivadas dos tokens.
- **Tela atual:** cards pequenos com iniciais, sem foto; KPI com mini-gráfico; abas e barra de ferramentas mais altas; `Empresas 0` e `Fornecedores 0` mostrados como zero.
- **Dados reais (produção, só contagem):** 3.650 contatos, **2.623 com foto (72%)** (WhatsApp, URLs que podem expirar), 3 com e-mail, **1 com empresa, 0 com cargo**. Conclusão de projeto: o card grande com retrato brilha para a maioria; empresa, departamento e cargo vêm do Singu (CT-023) e ficam **omitidos** quando faltam; sem foto → iniciais grandes sobre fundo elegante.

## Decisões tomadas (padrão; o Joaquim pode vetar qualquer uma)
1. **Retrato grande no card** é o padrão da visão Cards (286 px; 220 px no celular). Lista e tabela usam foto pequena.
2. **Etiquetas/tags ficam FORA** (função removida do sistema por decisão do Joaquim em 12/10): o design mostra filtro e chips de etiqueta; não entram.
3. **Sem ações em massa**: o design tem "Selecionar todos"; fica só a seleção de até 3 contatos para Comparar e Mesclar (regra do plano CT: CT-088/CT-089).
4. **Sem copiar/exportar/importar/imprimir/compartilhar**; telefone e e-mail aparecem como texto (máscara com revelação é do CT-095..099).
5. **Carrossel "Explore seus contatos" entra**, limitado a 24 contatos já carregados, sem requisição nova, com pausa e respeito a movimento reduzido.
6. **Pipeline, Mapa e Analytics** vão para o menu "Mais" (como no design); agrupar por empresa também.
7. **Botão primário azul** (não verde) no cabeçalho; o botão flutuante verde existente permanece só no celular.
8. **Tema claro** derivado dos mesmos tokens; o design só existe em escuro, então o claro é projeto nosso e tem etapa própria (RD-091).
9. **Honestidade de dados**: indicador desconhecido mostra "—" (não 0); campo vazio é omitido; selo de origem reflete o estado real do Singu.
10. **Sem flag nova**: o visual novo substitui o antigo nos mesmos componentes; a liberação por partes e o plano de volta continuam sendo do CT-115 (reversão = reverter o lote).

## Como convive com o plano CT (funcional)
Os cartões CT que mexem nos mesmos arquivos **esperam** o item RD correspondente e constroem em cima do visual novo (o motor de gatilhos só os libera quando o RD estiver integrado). Mapa CT → RD: CT-006 ← RD-060; CT-007 ← RD-070; CT-008 ← RD-092; CT-009 ← RD-040; CT-010 ← RD-047; CT-014 ← RD-043; CT-015 ← RD-034; CT-019 ← RD-033; CT-020 ← RD-026; CT-025 ← RD-048; CT-026 ← RD-093; CT-027 ← RD-093; CT-031 ← RD-080; CT-043 ← RD-080; CT-046 ← RD-060; CT-051 ← RD-030; CT-052 ← RD-053; CT-053 ← RD-007; CT-054 ← RD-060; CT-055 ← RD-060; CT-056 ← RD-060; CT-057 ← RD-086; CT-061 ← RD-054; CT-062 ← RD-054; CT-064 ← RD-060; CT-065 ← RD-060; CT-066 ← RD-054; CT-067 ← RD-055; CT-072 ← RD-087; CT-073 ← RD-087; CT-084 ← RD-083; CT-085 ← RD-085; CT-088 ← RD-084; CT-089 ← RD-084; CT-093 ← RD-060; CT-099 ← RD-060; CT-120 ← RD-100.

## Como as etapas andam
Dependências explícitas: arquivo disputado vira cadeia (ex.: tudo de `ContactCard.tsx` em fila). A Fase A (fundação) roda em paralelo; cada fase termina com testes e uma **revisão visual do designer** contra o design (relatórios em `docs/audits/CONTATOS_REDESIGN_REVISAO_*`). O Claude valida cada entrega no código da branch viva e a fase final (RD-100) traz a tabela de aceite item a item.

## Fase A · Fundação visual (RD-001 a RD-010)
_Tokens, movimento, foto, modelo de exibição e roteiro de captura: a base que os demais itens usam._

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **RD-001** Linha de base visual e de medida do módulo atual | Antes de mudar, registramos como a tela é hoje (imagens e números) para provar depois que ficou melhor e mais rápida. | workertestes | teste | M | — |
| **RD-002** Tokens de Contatos no sistema de design (escuro e claro) | As cores, superfícies, raios e sombras do novo visual passam a existir como tokens do sistema, sem nenhuma cor solta no código. | designer | visual | M | — |
| **RD-003** Guia de composição do módulo Contatos | Fica escrito, em uma página, como o módulo deve parecer e o que ele nunca mostra, para todos os agentes seguirem o mesmo padrão. | designer | visual | P | 002 |
| **RD-004** Movimento do módulo, com respeito a quem não quer animação | As animações de passar o mouse, abrir a ficha e rolar o carrossel ficam suaves e padronizadas, e param para quem pediu menos movimento. | iris (telas) | tela | P | — |
| **RD-005** Hook de colunas pela largura do contêiner | O número de cards por linha acompanha a largura real da área (com a barra lateral aberta ou fechada), não a janela inteira. | hugo (lógica) | lógica | P | — |
| **RD-006** Componente de retrato do contato (foto ou iniciais) | Todo contato ganha um retrato bonito: a foto real quando existe, e iniciais grandes sobre um fundo elegante quando não existe ou quando a foto falha. | iris (telas) | tela | M | 002 |
| **RD-007** Modelo de exibição do contato (o que mostrar e o que omitir) | Cada contato mostra só o que realmente tem: nada de linhas vazias nem de 'não informado' nos cards. | iris (telas) | tela | M | — |
| **RD-008** Selo de tipo de contato reutilizável | O tipo (Cliente, Fornecedor, Transportadora...) aparece sempre do mesmo jeito: uma pílula discreta com um pontinho colorido. | iris (telas) | tela | M | 002 |
| **RD-009** Retratos de teste no ambiente local | O ambiente de teste mostra fotos de verdade nos cards (e iniciais para os que não têm), para o visual ser avaliado como será em produção. | workersql | BANCO (só dados de teste local) | P | — |
| **RD-010** Roteiro de captura visual do redesign e fechamento da Fase A | Existe um comando que fotografa a tela nos tamanhos e temas combinados, para comparar com o design aprovado a cada etapa. | workertestes | teste | M | 001, 009 |

## Fase B · Cabeçalho da página (RD-011 a RD-020)
_Título, trilha, origem dos dados e composição da página._

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **RD-011** Cabeçalho da página: título, subtítulo e trilha | A página abre com um cabeçalho elegante: ícone, título 'Contatos', a frase 'Pessoas e empresas em uma visão completa.' e a trilha 'Relacionamentos / Contatos'. | iris (telas) | tela | M | 002, 006 |
| **RD-012** Selo 'Origem dos dados' ligado ao estado real do Singu | O canto direito do cabeçalho diz de onde vêm os dados: 'Singu CRM' quando a ligação está ativa, e avisa com clareza quando o Singu está fora do ar. | hugo (lógica) | lógica | P | — |
| **RD-013** Selo de origem no cabeçalho (visual) | Um selo discreto com ícone de banco de dados mostra 'Origem dos dados — Singu CRM' (ou 'Zapp' / 'Singu indisponível'). | iris (telas) | tela | P | 011, 012 |
| **RD-014** Ações do cabeçalho: Novo contato e CRM 360° | As ações principais ficam sempre à mão no cabeçalho: 'Novo contato' em destaque e 'CRM 360°' como ação secundária. | iris (telas) | tela | M | 013 |
| **RD-015** Composição da página: contêiner, espaçamentos e fundo | A página ganha o ritmo do design: fundo grafite, blocos com espaçamento regular e largura útil bem aproveitada. | iris (telas) | tela | M | 014, 004 |
| **RD-016** A primeira linha de contatos aparece sem rolar | Em um computador comum, o vendedor já vê a primeira linha de contatos assim que abre a página. | iris (telas) | tela | P | 015, 010 |
| **RD-017** Cabeçalho e página no celular e no tablet | No celular o cabeçalho cabe em duas linhas limpas, sem cortar o título nem esconder o botão de novo contato. | iris (telas) | tela | P | 016 |
| **RD-018** Testes do cabeçalho e da composição da página | Garantimos que o cabeçalho e a ordem das seções não se perdem em mudanças futuras. | workertestes | teste | M | 017 |
| **RD-019** Revisão visual do cabeçalho e da composição | Uma revisão de olho de designer compara o cabeçalho e o ritmo da página com o design aprovado. | designer | visual | P | 017, 018 |
| **RD-020** Marco: casca da página pronta | Marco interno: a casca (cabeçalho e composição) está integrada e as próximas fases podem começar sobre ela. | workertestes | teste | P | 019 |

## Fase C · Indicadores e tipos de contato (RD-021 a RD-030)
_Os 4 indicadores e as abas de tipo, com o selo de tipo reutilizável._

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **RD-021** Cartão de indicador no novo visual | Os quatro indicadores do topo ficam elegantes e uniformes: ícone em placa de gradiente, rótulo pequeno e número grande. | iris (telas) | tela | M | 002 |
| **RD-022** Faixa de indicadores responsiva | Quatro indicadores no computador, dois no tablet e um ou dois no celular, sempre da mesma altura. | iris (telas) | tela | P | 021 |
| **RD-023** Indicadores honestos: sem 'zero' falso | Quando um número ainda não existe (por exemplo, Empresas, que vem do Singu), a tela mostra um traço e explica, em vez de afirmar zero. | hugo (lógica) | lógica | M | 022 |
| **RD-024** Abas de tipo de contato no formato do design | As abas de tipo viram uma faixa compacta de pílulas com ícone e contador, com o tipo ativo destacado em azul. | iris (telas) | tela | M | 008 |
| **RD-025** Contadores por tipo vindos de uma só fonte | Os números ao lado de cada aba batem com os indicadores e com a lista. | hugo (lógica) | lógica | M | 024, 023 |
| **RD-026** Teclado e leitor de tela nas abas de tipo | As abas funcionam só com teclado (setas) e são lidas corretamente por leitores de tela. | iris (telas) | tela | P | 025 |
| **RD-027** Abas e indicadores no celular | No celular os indicadores e as abas não empurram a lista para baixo da tela. | iris (telas) | tela | P | 026 |
| **RD-028** Cor e ponto de cada tipo em todo o módulo | O mesmo tipo tem sempre a mesma cor e o mesmo ícone, em abas, selos, lista, tabela e ficha. | iris (telas) | tela | P | 027 |
| **RD-029** Testes da faixa de indicadores e das abas | Protegemos indicadores e abas contra regressão. | workertestes | teste | M | 028 |
| **RD-030** Revisão visual de indicadores e abas | Revisão de designer: indicadores e abas comparados ao design aprovado. | designer | visual | P | 029 |

## Fase D · Barra de ferramentas (RD-031 a RD-040)
_Busca, ordenação, filtros, filtros salvos, legados, visões e colunas._

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **RD-031** Barra de ferramentas em uma linha | Busca, ordenação, filtros, filtros salvos, legados, visões e colunas ficam organizados numa barra só, como no design. | iris (telas) | tela | G | 015, 024 |
| **RD-032** Caixa de busca como elemento principal | A busca é a peça que mais se destaca: grande, com ícone, botão de limpar e atalho Ctrl+K. | iris (telas) | tela | M | 031 |
| **RD-033** Ordenação com seletor elegante e rótulos completos | O seletor de ordem mostra o nome completo da opção ('Nome (A-Z)') e abre num menu bonito. | iris (telas) | tela | P | 032 |
| **RD-034** Botão e painel de Filtros | O botão Filtros mostra quantos filtros estão ativos e abre um painel organizado em colunas, com 'Limpar'. | iris (telas) | tela | M | 033 |
| **RD-035** Filtros salvos no novo visual | Os filtros salvos abrem num pequeno painel com lista, aplicar e excluir. | iris (telas) | tela | P | 034 |
| **RD-036** Chave 'Mostrar legados' | Contatos antigos (sem telefone válido) ficam escondidos por padrão e aparecem com uma chave clara. | iris (telas) | tela | P | 035 |
| **RD-037** Alternador de visão: Cards, Lista, Tabela e Mais | Três visões à vista e as outras (Pipeline, Mapa, Analytics e agrupar por empresa) num menu 'Mais'. | iris (telas) | tela | M | 036 |
| **RD-038** Colunas (2, 3 ou 4 cards por linha) | O vendedor escolhe quantos cards cabem por linha, e a escolha é lembrada. | iris (telas) | tela | P | 037, 005 |
| **RD-039** Barra de ferramentas no celular e no tablet | No celular a busca ocupa a largura toda e os demais controles ficam numa linha que rola, sem empilhar em quatro linhas. | iris (telas) | tela | M | 038 |
| **RD-040** Testes e revisão visual da barra de ferramentas | A barra é testada em comportamento e revisada de olho contra o design. | designer | visual | M | 039 |

## Fase E · Resultados, paginação e estados (RD-041 a RD-050)
_Resumo, paginação, chips de filtro, vazio, carregando e erro._

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **RD-041** Linha de resumo dos resultados | Sob a barra aparece 'Exibindo 1–4 de 9 contatos' e, quando há seleção, o atalho para comparar. | iris (telas) | tela | P | 040 |
| **RD-042** Paginação no novo visual | Navegar entre páginas fica claro: 'Página 1 / 3' com setas e a legenda da visão. | iris (telas) | tela | P | 041 |
| **RD-043** Tamanho da página por visão e por colunas | Cada visão mostra uma quantidade de contatos que cabe bem: cards em múltiplos de colunas, lista e tabela em blocos maiores. | hugo (lógica) | lógica | M | 038, 042 |
| **RD-044** Chips dos filtros ativos | Abaixo da barra aparecem os filtros ligados como pequenas pílulas com 'x' para remover. | iris (telas) | tela | M | 043 |
| **RD-045** Estado 'nenhum contato encontrado' | Quando a busca ou o filtro não acha nada, a tela explica o motivo e oferece o caminho de volta. | iris (telas) | tela | P | 044 |
| **RD-046** Esqueleto de carregamento igual ao card | Enquanto carrega, a tela mostra formas com o mesmo tamanho dos cards reais, sem pulo quando os dados chegam. | iris (telas) | tela | P | 045 |
| **RD-047** Estados de erro e de Singu indisponível | Se algo falhar, o vendedor vê o que houve e pode tentar de novo, sem perder o que já estava na tela. | iris (telas) | tela | M | 046, 012 |
| **RD-048** Foco e anúncio por voz ao filtrar | Ao buscar ou filtrar, quem usa leitor de tela ouve quantos contatos foram achados, e o foco não se perde. | iris (telas) | tela | P | 047 |
| **RD-049** Testes dos estados da lista | Vazio, carregando, erro e paginação ficam protegidos. | workertestes | teste | M | 048 |
| **RD-050** Revisão visual da Fase E e marco: toolbar e estados prontos | Revisão de designer dos resumos, paginação, chips e estados. | designer | visual | M | 049 |

## Fase F · Card de galeria com retrato (RD-051 a RD-060)
_O card grande com foto, selo, localização e dados, o coração do redesign._

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **RD-051** Card com retrato grande: estrutura | Cada contato vira um card com retrato grande no alto e os dados logo abaixo, como no design. | iris (telas) | tela | G | 006, 007, 008, 050 |
| **RD-052** Selo de tipo, localização e botão de abrir sobre o retrato | Sobre a foto aparecem o tipo (canto esquerdo), a cidade/UF (embaixo à esquerda) e um botão azul de abrir a ficha (embaixo à direita). | iris (telas) | tela | M | 051 |
| **RD-053** Card sem foto: iniciais grandes sobre fundo elegante | Quem não tem foto ganha um card tão bonito quanto os outros: iniciais enormes sobre um fundo escuro com brilho suave. | iris (telas) | tela | P | 052 |
| **RD-054** Ações do card: conversar, editar e mais | No rodapé do card ficam 'Conversar' e 'Editar' à vista, e as demais ações escondidas num menu. | iris (telas) | tela | M | 053 |
| **RD-055** Estados do card: passar o mouse, foco e selecionado | O card reage com suavidade: sobe 3 px ao passar o mouse, o retrato dá um leve zoom e o card selecionado ganha borda azul. | iris (telas) | tela | P | 054, 004 |
| **RD-056** Rodapé: último contato e dados de relacionamento | O rodapé conta quando foi o último contato e, quando o Singu informar, se o cliente está ativo e há quanto tempo não compra. | iris (telas) | tela | P | 055 |
| **RD-057** Grade de cards responsiva pelo contêiner | Os cards se distribuem em 4, 3, 2 ou 1 coluna conforme o espaço real, sempre alinhados e da mesma altura por linha. | iris (telas) | tela | M | 056, 043 |
| **RD-058** Nome, empresa e e-mail longos não quebram o card | Nomes enormes, empresas longas e e-mails compridos ficam bonitos, truncados com a informação completa a um passo. | iris (telas) | tela | P | 057 |
| **RD-059** Card no celular e no tablet | No celular o card ocupa a largura, com retrato mais baixo e botões fáceis de tocar. | iris (telas) | tela | P | 058 |
| **RD-060** Testes e revisão visual do card | O card principal do redesign é testado e comparado ao design. | designer | visual | M | 059 |

## Fase G · Lista e tabela (RD-061 a RD-070)
_As outras duas visões no mesmo sistema visual do card._

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **RD-061** Lista: linha horizontal com foto | A visão Lista mostra cada contato numa linha elegante com foto pequena, nome, empresa e os contatos. | iris (telas) | tela | M | 060, 008 |
| **RD-062** Lista agrupada por empresa | Quando o vendedor agrupa por empresa, cada empresa ganha um título com ícone e as pessoas ficam por baixo. | iris (telas) | tela | P | 061 |
| **RD-063** Tabela: cabeçalho e linhas no novo visual | A tabela fica densa e limpa: cabeçalho fixo, linhas de altura regular e hover suave. | iris (telas) | tela | M | 061 |
| **RD-064** Escolha de colunas da tabela | O vendedor liga e desliga colunas da tabela e a escolha é lembrada. | iris (telas) | tela | P | 063, 038 |
| **RD-065** Ordenação única e clara na tabela | Não há duas ordenações brigando: a barra de ferramentas manda, e o cabeçalho da tabela mostra a ordem atual. | iris (telas) | tela | M | 064 |
| **RD-066** Tabela no celular | No celular a tabela mostra o essencial e avisa que dá para rolar para o lado. | iris (telas) | tela | P | 065 |
| **RD-067** Mesma linguagem nas três visões | Card, lista e tabela parecem partes do mesmo produto: mesmas fontes, selos, fotos, ações e estados. | iris (telas) | tela | M | 062, 066 |
| **RD-068** Teclado nas três visões | É possível percorrer os contatos só com o teclado e abrir a ficha com Enter. | iris (telas) | tela | M | 067 |
| **RD-069** Testes das visões Lista e Tabela | Lista, agrupamento e tabela ficam protegidos. | workertestes | teste | M | 068 |
| **RD-070** Revisão visual de Lista e Tabela | Revisão de designer das duas visões comparadas ao design. | designer | visual | M | 069 |

## Fase H · Ficha completa do contato (RD-071 a RD-080)
_Janela com retrato à esquerda e 4 abas, navegável entre contatos._

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **RD-071** Ficha completa: casca da janela | Ao abrir um contato, uma janela larga e bonita mostra tudo dele, com anterior/próximo e fechar. | iris (telas) | tela | G | 070, 004 |
| **RD-072** Ficha: coluna do retrato e resumo | À esquerda da ficha ficam o retrato grande, o tipo, o nome, o cargo, a empresa e o resumo de contato. | iris (telas) | tela | M | 071, 013 |
| **RD-073** Ficha: abas Visão geral, Perfil Singu, Histórico e Anotações | A ficha tem quatro abas, navegáveis com as setas do teclado. | iris (telas) | tela | M | 072 |
| **RD-074** Ficha: aba Visão geral | A primeira aba reúne dados profissionais, canais de contato, dados pessoais e redes, sem campos inventados. | iris (telas) | tela | M | 073 |
| **RD-075** Ficha: aba Perfil Singu | A aba mostra como o cliente pensa e decide: foco profissional, preferência de contato e os modelos DISC, VAK, Big Five, MBTI e Eneagrama. | iris (telas) | tela | M | 074 |
| **RD-076** Ficha: aba Histórico | A linha do tempo do relacionamento fica bonita, com ícone, data, título e descrição de cada evento. | iris (telas) | tela | M | 075 |
| **RD-077** Ficha: aba Anotações | As anotações do relacionamento aparecem como cartões com autor e data. | iris (telas) | tela | P | 076 |
| **RD-078** Ficha: anterior e próximo dentro dos resultados | Com a ficha aberta, as setas levam ao contato anterior/seguinte da lista filtrada, sem fechar. | iris (telas) | tela | M | 077 |
| **RD-079** Ficha no celular | No celular a ficha ocupa a tela, com abas que rolam e o resumo em cima. | iris (telas) | tela | M | 078 |
| **RD-080** Testes e revisão visual da ficha | A ficha é testada de ponta a ponta e comparada ao design. | designer | visual | M | 079 |

## Fase I · Descobrir, comparar e dialogs (RD-081 a RD-090)
_Carrossel Explore, comparar, mesclar, seleção, formulário e exclusão._

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **RD-081** Carrossel 'Explore seus contatos': estrutura | No fim da página, uma faixa de mini-cartões convida a explorar os contatos da busca, com foto, nome e empresa. | iris (telas) | tela | M | 060, 008 |
| **RD-082** Carrossel: movimento suave, pausa e controles | O carrossel anda sozinho devagar, para quando o mouse ou o foco está nele, e tem botões de anterior, próximo e pausar. | iris (telas) | tela | M | 081, 004 |
| **RD-083** Comparar contatos no novo visual | Comparar 2 ou 3 contatos mostra colunas lado a lado, com as diferenças destacadas. | iris (telas) | tela | M | 070 |
| **RD-084** Seleção para comparar e mesclar | O vendedor marca até 3 contatos num quadradinho do canto do card para comparar ou mesclar; nada de ações em massa. | iris (telas) | tela | M | 083, 041, 068 |
| **RD-085** Mesclar contatos no novo visual | Mesclar mostra uma prévia clara do contato resultante e deixa óbvio que não é uma exclusão comum. | iris (telas) | tela | M | 084 |
| **RD-086** Pipeline, Mapa e Analytics no mesmo padrão | As visões extras ficam com o mesmo visual e estados vazios claros. | iris (telas) | tela | M | 070 |
| **RD-087** Diálogo de novo e de editar contato | O formulário de contato fica elegante e consistente, sem mudar o que ele salva. | iris (telas) | tela | M | 070 |
| **RD-088** Confirmação de exclusão | Excluir um contato pede uma confirmação clara e só aparece para quem pode. | iris (telas) | tela | P | 087 |
| **RD-089** Testes de comparar, mesclar, seleção e carrossel | Os recursos da fase ficam protegidos. | workertestes | teste | M | 085, 082, 086, 088 |
| **RD-090** Revisão visual da Fase I | Revisão de designer do carrossel, comparação, mesclagem e formulários. | designer | visual | M | 089 |

## Fase J · Qualidade e entrega (RD-091 a RD-100)
_Tema claro, contraste, teclado, movimento, desempenho, E2E, regressão visual, guardas e documentação._

| # | O que muda para o vendedor | Quem | Tipo | Tam | Espera por |
|---|---|---|---|---|---|
| **RD-091** Tema claro de todo o módulo | No tema claro o módulo continua elegante: mesmas hierarquias, contrastes corretos e fotos bem enquadradas. | designer | visual | G | 090 |
| **RD-092** Contraste e tamanho de letra (WCAG AA) | Todo texto do módulo é legível: contraste mínimo 4,5:1 e nada menor que 11 px. | designer | visual | M | 091 |
| **RD-093** Foco visível, rótulos e leitor de tela | Tudo é alcançável e compreendido sem mouse e com leitor de tela. | iris (telas) | tela | M | 092 |
| **RD-094** Movimento e toque: preferências do usuário | Quem pediu menos movimento não vê animação, e quem usa o dedo tem alvos grandes. | iris (telas) | tela | M | 093 |
| **RD-095** Desempenho: fotos, renderização e orçamento | A página abre rápida, mesmo com muitas fotos, e rolar não trava. | hugo (lógica) | lógica | M | 094 |
| **RD-096** Teste de ponta a ponta do módulo redesenhado | Um roteiro automatizado percorre o uso real do módulo e prova que tudo funciona junto. | workertestes | teste | G | 095 |
| **RD-097** Regressão visual por captura | Fica registrado como a tela deve ser, para qualquer mudança futura que a estrague ser notada. | workertestes | teste | M | 096 |
| **RD-098** Guarda de regras do módulo (teste de contrato) | Se alguém um dia colocar cor solta, botão de copiar, exportar ou etiquetas no módulo, um teste falha. | workertestes | teste | M | 097 |
| **RD-099** Limpeza: código e estilos que ficaram para trás | Sai tudo o que o redesign substituiu, deixando o módulo enxuto. | iris (telas) | tela | M | 098 |
| **RD-100** Documentação e revisão final contra o design | O módulo fecha com documentação para a equipe e uma revisão final lado a lado com o design aprovado. | vera (docs) | documento | M | 099 |

## Fora do escopo (de propósito)
Backend, migrations e Edge Functions (a única mexida em banco é o script de dados de teste local, RD-009); regras de acesso, máscara e proteção (plano CT); filtros do Singu (CT-012..018); edição básica com aprovação (CT-071..080).

## Riscos e cuidados
- **Foto expira**: URLs de foto do WhatsApp podem quebrar; fallback de iniciais é obrigatório e testado (RD-006, RD-053).
- **Poucos dados no Zapp** (empresa/cargo quase vazios): o card nasce bonito sem eles; os campos aparecem quando o Singu entregar (ponto de extensão no RD-056).
- **Desempenho com muitas fotos**: lazy, memo, sem N+1 e orçamento de chunk (RD-095).
- **Colisão de arquivos**: cadeia explícita e CT retido atrás dos RD; qualquer diff fora da lista de arquivos é recusado pelo revisor.
- **Tema claro** não existe no design: validado pelo designer (RD-091) e pelo contraste (RD-092).
