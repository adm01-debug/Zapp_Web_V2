# PROMPT MESTRE — REDESIGN DO MÓDULO DASHBOARD | ZAPP WEB V2
## Padrão WIDE para monitores de 24" Full HD — Contrato Global de Design, UX, Arquitetura e Implementação

---

# 0. FINALIDADE DESTE PROMPT

Este é o **PROMPT MESTRE DO MÓDULO DASHBOARD** do sistema **ZAPP WEB V2**.

Ele deve ser tratado como um **contrato global de implementação** para TODAS as telas e subtelas do módulo Dashboard.

Este prompt NÃO substitui os prompts específicos de cada subtela.

Ele define:

- padrão visual global;
- arquitetura de informação;
- regras de responsividade;
- resolução alvo;
- densidade;
- design system;
- comportamento dos componentes;
- hierarquia;
- espaçamento;
- tipografia;
- cores;
- grids;
- gráficos;
- tabelas;
- filtros;
- navegação;
- animações;
- estados;
- performance;
- acessibilidade;
- preservação funcional;
- regras de código;
- limites de alteração;
- estratégia de reutilização;
- critérios de QA;
- critérios de aceitação.

Depois deste Prompt Mestre serão enviados prompts específicos, um por tela.

A ordem prevista é:

1. Visão Geral
2. Analytics
3. Metas
4. Inteligência Artificial
5. Métricas SLA
6. Equipe
7. Satisfação
8. Sentimento
9. Relatórios
10. QA Global do módulo

Ao receber um prompt específico de tela, você deve executar SOMENTE aquela tela e os componentes compartilhados estritamente necessários para ela.

NÃO implemente todas as subtelas de uma vez.

---

# 1. PAPEL

Atue simultaneamente como:

- Senior Front-End Engineer;
- Senior Product Engineer;
- Design Systems Engineer;
- Senior UX Engineer;
- UI Implementation Specialist;
- Responsive Design Specialist;
- Accessibility Engineer;
- Performance Engineer;
- Design QA Engineer.

Você deve transformar os mockups aprovados em código de produção com alta fidelidade, sem destruir a arquitetura funcional existente.

---

# 2. PROJETO

Sistema:

`ZAPP WEB V2`

Repositório:

`adm01-debug/Zapp_Web_V2`

Tela principal:

`?view=dashboard`

Módulo:

`Dashboard`

O sistema já existe e possui:

- dados reais;
- hooks;
- queries;
- mutations;
- permissões;
- Supabase;
- filtros;
- tabs;
- analytics;
- gamificação;
- IA;
- metas;
- SLA;
- equipe;
- satisfação;
- sentimento;
- relatórios;
- widgets;
- gráficos;
- heatmaps;
- configurações.

O redesign deve EVOLUIR a interface.

Não recriar o produto.

---

# 3. REGRA FUNDAMENTAL

A regra central de todo este projeto é:

> A IMAGEM APROVADA DEFINE A INTENÇÃO VISUAL.
>
> O CÓDIGO EXISTENTE DEFINE A FUNCIONALIDADE REAL.
>
> OS DADOS EXISTENTES DEFINEM O CONTEÚDO.
>
> O NOVO CÓDIGO DEVE UNIR OS TRÊS.

Não copie cegamente dados fictícios da imagem.

Não sacrifique funcionalidades para imitar pixels.

Não ignore o design aprovado alegando que o código atual é diferente.

O objetivo é alta fidelidade visual COM preservação funcional.

---

# 4. RESOLUÇÃO PRIMÁRIA OBRIGATÓRIA

O ambiente principal de uso será um monitor de aproximadamente **24 polegadas Full HD**, em proporção widescreen.

A resolução de referência principal deve ser:

`1920 × 1080`

Proporção:

`16:9`

Este é o baseline principal do módulo.

O design NÃO deve ser pensado para monitor ultrawide.

O design NÃO deve depender de resolução 2K/4K.

O design NÃO deve exigir zoom reduzido do navegador.

O design NÃO deve criar scroll horizontal em 1920×1080.

---

# 5. ÁREA ÚTIL REAL

Não considere que os 1920×1080 pixels estão totalmente disponíveis para o conteúdo.

Considere:

- browser chrome;
- barra do navegador;
- sidebar;
- margens do app;
- header;
- barras internas;
- possíveis scrollbars.

O conteúdo central deve funcionar confortavelmente com uma largura útil aproximada após sidebar de:

`~1650 a 1720 px`

e altura útil típica aproximada de:

`~850 a 950 px`

dependendo do navegador e do sistema operacional.

Portanto:

A PRIMEIRA DOBRA PRECISA SER PLANEJADA.

---

# 6. REGRA DA PRIMEIRA DOBRA

Em 1920×1080, com sidebar aberta e navegador em zoom 100%, o usuário deve enxergar sem scroll excessivo:

- header;
- filtros;
- navegação de subtelas;
- KPIs principais;
- parte substancial do conteúdo principal.

Na Visão Geral, idealmente devem aparecer:

- header;
- filtros;
- tabs;
- KPIs;
- gráfico principal;
- painel operacional lateral;
- início da segunda linha.

Nas demais subtelas, a tela deve aproveitar horizontalmente a largura disponível.

Não criar layouts excessivamente verticais.

---

# 7. PRINCÍPIO WIDE-FIRST

Todas as subtelas devem ser pensadas primeiro como:

`WIDE DESKTOP OPERATIONAL UI`

Não como:

`mobile card stack aumentado para desktop`

Em 1920×1080:

- usar a largura;
- criar grids;
- colocar painéis lado a lado;
- usar tabelas quando apropriado;
- evitar empilhar tudo verticalmente;
- evitar componentes de largura total sem necessidade;
- evitar grandes vazios laterais;
- evitar cards estreitos no centro da página.

---

# 8. NÃO CONFUNDIR WIDE COM “ESPALHADO”

Usar largura não significa aumentar tudo.

O design deve ser:

- compacto;
- denso;
- respirável;
- alinhado.

Evite:

- cards gigantes;
- títulos gigantes;
- paddings de 32–48px sem necessidade;
- ícones enormes;
- espaços vazios;
- charts com altura exagerada.

A meta é aproveitar melhor a largura, não desperdiçar pixels.

---

# 9. SIDEBAR

A sidebar global deve permanecer funcional e visualmente coerente.

Não redesenhar agressivamente nesta fase.

Preservar:

- estrutura;
- grupos;
- navegação;
- usuário;
- controles rápidos;
- active states.

Pequenos ajustes de alinhamento/contraste são permitidos apenas se necessários para integração visual.

Largura alvo aproximada:

`200–230px`

Evitar aumentar.

---

# 10. SHELL GLOBAL DO DASHBOARD

Todas as subtelas devem compartilhar a mesma estrutura visual base:

```text
┌ Sidebar ┐ ┌─────────────────────────────────────────────────────┐
│         │ │ Header compacto                                    │
│         │ ├─────────────────────────────────────────────────────┤
│         │ │ Filtros globais                                    │
│         │ ├─────────────────────────────────────────────────────┤
│         │ │ Navegação Dashboard                                │
│         │ ├─────────────────────────────────────────────────────┤
│         │ │ Conteúdo da subtela                                │
│         │ │                                                     │
│         │ │                                                     │
└─────────┘ └─────────────────────────────────────────────────────┘
```

O topo NÃO deve mudar de estrutura em cada subtela.

---

# 11. HEADER GLOBAL

O header deve ser compacto e consistente.

Estrutura conceitual:

```text
[ícone] Boa noite, Admin! 👋
        Contexto da tela / subtela

                               [XP] [estrela] [streak] [avatar opcional]
```

ou, quando o prompt específico determinar:

```text
Dashboard
Visão geral do atendimento em tempo real
```

A escolha exata seguirá o mockup aprovado de cada etapa.

Regras globais:

- altura compacta;
- sem banner gigante;
- sem glow dominante;
- sem parallax;
- sem particles sobre conteúdo;
- gamificação secundária;
- conteúdo operacional prioritário.

---

# 12. FILTROS GLOBAIS

Os filtros globais atuais devem ser preservados:

- período;
- fila;
- agente;
- refresh.

Estrutura wide:

```text
[ Hoje ▼ ] [ Todas as filas ▼ ] [ Todos os agentes ▼ ]          [Atualizar]
```

Altura aproximada:

`36–42px`

Não criar um card alto só para filtros.

---

# 13. FILTROS CONTEXTUAIS

Algumas subtelas possuem filtros locais:

- período SLA;
- período CSAT;
- período sentimento;
- período de heatmap;
- ranking;
- métrica;
- sorting.

Esses filtros devem ficar dentro do contexto da subtela.

Evitar duplicar visualmente filtros globais.

Diferenciar:

GLOBAL
vs.
LOCAL

---

# 14. NAVEGAÇÃO DO DASHBOARD

A navegação entre áreas deve permanecer compacta.

Áreas funcionais:

- Visão Geral
- Analytics
- Metas
- Inteligência Artificial
- Métricas SLA
- Equipe
- Satisfação
- Sentimento
- Relatórios

Caso futuramente sejam agrupadas em macroáreas, preservar rotas/estado internamente.

A navegação deve:

- caber em uma linha em 1920px;
- ter active state claro;
- usar ícones pequenos;
- não parecer uma coleção de botões grandes;
- não ocupar duas linhas em desktop alvo.

---

# 15. ALTURA DA NAVEGAÇÃO

Altura recomendada:

`36–42px`

Cada item:

- label 12–14px;
- ícone 14–16px;
- padding horizontal moderado.

Evitar:

- tabs de 50px+;
- bordas fortes;
- glow;
- sombras.

---

# 16. CONTAINER PRINCIPAL

Não limitar o dashboard a um `max-width` pequeno.

Em 1920×1080:

- usar `w-full`;
- respeitar margem lateral;
- usar largura disponível;
- evitar centralização estreita.

Se houver max-width global herdado, avaliar se ele prejudica o Dashboard.

Não remover globalmente sem entender impacto em outras telas.

---

# 17. MARGENS HORIZONTAIS

Desktop wide:

`16–24px`

entre conteúdo e limites internos.

Não usar 40–64px de margem lateral em 1920 se isso reduzir densidade.

---

# 18. ESPAÇAMENTO VERTICAL

Usar escala coerente.

Preferência:

- 4px
- 8px
- 12px
- 16px
- 20px
- 24px

Evitar `space-y-6` indiscriminadamente em toda a árvore.

Muitos gaps de 24px empilhados tornam o dashboard longo demais.

---

# 19. GRID PRINCIPAL

Usar grid de 12 colunas como referência conceitual.

Exemplos:

- 8/4;
- 7/5;
- 6/6;
- 4/4/4;
- 3/3/3/3.

Não precisa implementar CSS grid literal de 12 colunas em todos os componentes.

A regra é estrutural.

---

# 20. KPI CARDS

Em 1920×1080, 4 ou 5 KPIs podem ficar na mesma linha.

Altura recomendada:

`90–120px`

Cada KPI deve conter:

- ícone pequeno;
- label;
- valor;
- tendência;
- opcional mini gráfico.

Evitar cards 150–200px de altura para uma única métrica.

---

# 21. KPI VALUE

Valor principal:

`24–32px`

Label:

`12–14px`

Contexto:

`11–12px`

Não usar `text-4xl` em todos os KPIs.

---

# 22. CHART CARDS

Gráficos devem aproveitar largura horizontal.

Altura padrão recomendada:

- gráfico principal: `240–320px`;
- gráfico secundário: `180–240px`;
- mini chart: `80–140px`.

Não usar 400–500px de altura sem necessidade real.

---

# 23. CHART DENSITY

Em monitor Full HD:

- labels legíveis;
- eixos compactos;
- legenda próxima;
- tooltips claros;
- gridlines discretas;
- padding interno enxuto.

Não desperdiçar área com header enorme dentro do chart.

---

# 24. TABELAS

Tabelas são preferíveis quando o usuário precisa comparar várias entidades.

Em wide desktop:

- usar largura total;
- linhas 44–56px;
- header 36–44px;
- sticky header quando útil;
- densidade moderada;
- ações compactas;
- truncamento previsível;
- tooltip quando necessário.

---

# 25. CARDS DE LISTA

Quando card for apropriado:

- altura controlada;
- informações hierárquicas;
- sem vazio excessivo;
- sem animação em massa;
- sem shadow pesada.

---

# 26. PAINÉIS LATERAIS

Painéis laterais são muito úteis no padrão wide.

Exemplos:

- `Agora`;
- resumo geral;
- insights;
- destaque;
- ações rápidas;
- configuração;
- distribuição.

Preferir 8/4 ou 7/5 em vez de empilhar esses painéis abaixo.

---

# 27. EMPTY STATES

Empty state NÃO deve transformar uma subtela em um enorme espaço vazio.

Altura recomendada:

`140–240px`

dependendo do componente.

Deve conter:

- ícone;
- título;
- descrição;
- CTA quando aplicável.

---

# 28. EMPTY STATE EM CHART

Se o gráfico não tiver dados:

manter a estrutura visual do gráfico.

Mostrar no centro:

- ícone;
- mensagem;
- instrução.

Não renderizar eixos vazios gigantes sem explicação.

---

# 29. EMPTY STATE EM LISTA

Se não houver dados:

usar bloco compacto.

Não criar card de 500px de altura.

---

# 30. DARK MODE

A interface deve usar níveis de superfície.

Exemplo conceitual:

- background 0;
- surface 1;
- surface 2;
- hover;
- selected.

Não usar apenas preto + borda branca.

---

# 31. PRIMARY

Azul permanece a cor principal.

Usar para:

- active state;
- CTA;
- seleção;
- links;
- foco;
- gráficos principais.

Não usar azul em todas as bordas.

---

# 32. CORES SEMÂNTICAS

Verde:

- positivo;
- sucesso;
- dentro do SLA;
- online.

Vermelho:

- erro;
- risco;
- violação;
- negativo.

Amarelo:

- atenção;
- warning.

Roxo:

- IA;
- recurso especial;
- somente quando útil.

---

# 33. BORDAS

Bordas devem ser discretas.

Exemplo conceitual:

`border-border/30`
`border-border/40`
`border-border/50`

Selected:

`border-primary/40`

Evitar 1px branco forte.

---

# 34. RADIUS

Padrão recomendado:

- cards: 10–12px;
- inputs: 8–10px;
- buttons: 8–10px;
- badges: 6px ou pill.

Manter consistente.

---

# 35. SHADOW

Shadow deve ser sutil.

Não usar:

- glow azul permanente;
- sombra 20–40px;
- neon em todos os cards.

---

# 36. TIPOGRAFIA

Padrão recomendado:

Page title:
`24–30px`

Section title:
`16–20px`

Card title:
`13–16px`

Body:
`12–14px`

Metadata:
`11–12px`

KPI:
`24–32px`

---

# 37. FONT WEIGHT

Evitar tudo em bold.

Hierarquia:

- page title: 700;
- section: 600–700;
- card title: 600;
- body: 400–500;
- metadata: 400.

---

# 38. ÍCONES

Usar ícones de forma funcional.

Padrão:

- toolbar: 14–16px;
- card header: 16–20px;
- KPI: 18–22px.

Evitar ícones 32–48px sem necessidade.

---

# 39. ANIMAÇÕES

Reduzir fortemente.

Permitido:

- hover;
- focus;
- progress;
- loading;
- dropdown;
- tab transition curta.

Evitar:

- stagger por item;
- scale em tabelas;
- glow pulsante;
- parallax;
- partículas;
- blur de entrada;
- motion em dezenas de linhas.

---

# 40. TEMPO DE TRANSIÇÃO

Preferência:

`120–200ms`

Algumas expansões:

até `250ms`.

Evitar 500–1000ms em interface operacional.

---

# 41. PERFORMANCE PERCEBIDA

O design deve parecer rápido.

Usar:

- skeleton;
- refresh state;
- feedback local;
- cache atual;
- rendering eficiente.

Não bloquear a página inteira por pequenas ações.

---

# 42. PERFORMANCE REAL

Não adicionar:

- polling novo;
- requests N+1;
- dependências pesadas;
- re-render por animação;
- chart recalculation desnecessária.

---

# 43. ACESSIBILIDADE

Obrigatório:

- focus visible;
- navegação por teclado;
- aria-label em icon buttons;
- contraste;
- status não dependente apenas de cor;
- tooltips;
- headings semânticos;
- touch/click targets adequados.

---

# 44. RESPONSIVIDADE SECUNDÁRIA

Apesar de 1920×1080 ser o baseline principal, a implementação deve funcionar também em:

- 1600×900;
- 1440×900;
- 1366×768;
- 1280×720;
- 1024px;
- tablet;
- mobile.

---

# 45. 1600×900

Ainda deve manter a maior parte da composição wide.

Reduzir:

- gaps;
- padding;
- tamanho de labels;
- algumas colunas.

---

# 46. 1440×900

Layouts 8/4 podem permanecer.

5 KPIs podem virar:

- 3 + 2;
- ou permanecer 5 se legíveis.

Não reduzir fonte demais.

---

# 47. 1366×768

Priorizar:

- header compacto;
- filtros compactos;
- 4 KPIs;
- conteúdo principal.

Alguns side panels podem ir abaixo.

---

# 48. 1024px

Permitir:

- 2 colunas;
- painéis abaixo;
- toolbar wrap controlado;
- tabs com scroll horizontal.

---

# 49. MOBILE

Mobile não é o alvo primário do dashboard analítico, mas deve ser funcional.

Usar:

- 1 coluna;
- filtros em drawer/popover quando necessário;
- tabs com scroll;
- tables com estratégia responsiva;
- cards compactos.

---

# 50. SEM SCROLL HORIZONTAL DO APP

Regra absoluta:

Não deve existir scroll horizontal global em:

`1920×1080`

nem em:

`1600×900`

Tabelas específicas podem possuir overflow interno controlado em breakpoints menores.

---

# 51. HIERARQUIA DO DASHBOARD

Prioridade visual global:

1. operação;
2. problemas/alerts;
3. KPIs;
4. trends;
5. filas/equipe;
6. insights;
7. metas;
8. gamificação;
9. decoração.

---

# 52. GAMIFICAÇÃO

Preservar:

- XP;
- nível;
- streak;
- conquistas;
- desafios.

Mas não permitir que gamificação domine telas de gestão.

Deve complementar.

---

# 53. REUTILIZAÇÃO

Antes de criar novos componentes, procure os existentes.

Criar componentes compartilhados quando houver repetição real.

Candidatos:

- `DashboardShell`
- `DashboardHeader`
- `DashboardGlobalFilters`
- `DashboardNav`
- `DashboardKpiCard`
- `DashboardSection`
- `DashboardChartCard`
- `DashboardDataTable`
- `DashboardEmptyState`
- `DashboardPanelHeader`

Os nomes são conceituais.

Adapte à arquitetura existente.

---

# 54. NÃO CRIAR UM DESIGN SYSTEM PARALELO

Reutilizar a biblioteca atual.

Prioridade:

- Button;
- Card;
- Badge;
- Tabs;
- Select;
- ToggleGroup;
- Tooltip;
- Avatar;
- Progress;
- Skeleton;
- Dialog;
- Sheet;
- DropdownMenu.

---

# 55. NÃO ADICIONAR BIBLIOTECA NOVA SEM NECESSIDADE

Se Recharts já existe:

usar.

Se shadcn já existe:

usar.

Se Lucide já existe:

usar.

Não instalar outra lib apenas por conveniência.

---

# 56. FUNÇÕES EXISTENTES

Preservar:

- hooks;
- queries;
- mutations;
- auth;
- permissions;
- navigation;
- refetch;
- realtime;
- Supabase calls.

Refatorar apenas quando necessário para viabilizar UI ou remover duplicação evidente.

---

# 57. BANCO DE DADOS

SEM autorização específica, NÃO:

- criar migration;
- alterar schema;
- alterar tabela;
- alterar coluna;
- alterar RLS;
- alterar policy;
- alterar trigger;
- alterar SQL function;
- alterar Edge Function;
- alterar dados.

---

# 58. DADOS DE MOCKUP

Qualquer número, nome, gráfico ou exemplo da imagem pode ser fictício.

NÃO hardcode.

Use dados reais.

Se a informação não existir:

- omitir;
- derivar apenas se houver base real;
- reportar.

---

# 59. PRESERVAÇÃO DE FUNCIONALIDADES

Ao redesenhar:

não remova recursos só porque não aparecem na imagem.

Se não couberem:

- mover;
- agrupar;
- usar dropdown;
- usar drawer;
- usar subtabs;
- usar secondary action.

---

# 60. COMPONENTES COMPARTILHADOS E REGRESSÃO

Mudanças em componente compartilhado podem afetar várias subtelas.

Antes de alterar:

1. identificar usos;
2. avaliar impacto;
3. preferir variants;
4. evitar breaking changes.

---

# 61. ESTRATÉGIA DE IMPLEMENTAÇÃO TELA A TELA

Ao receber um prompt específico:

1. ler este Prompt Mestre;
2. auditar a tela;
3. identificar componentes compartilhados;
4. implementar SOMENTE a tela alvo;
5. testar;
6. documentar.

Não adiantar outras subtelas.

---

# 62. QUANDO CRIAR COMPONENTE COMPARTILHADO

Pode criar se:

- já será usado pela tela atual;
- claramente será reutilizado;
- reduz duplicação;
- não exige reescrever telas futuras agora.

---

# 63. QUANDO NÃO CRIAR COMPONENTE COMPARTILHADO

Não criar uma abstração gigante baseada em suposições sobre telas ainda não implementadas.

Evitar overengineering.

---

# 64. AUDITORIA ANTES DA IMPLEMENTAÇÃO

Antes de escrever código em cada subtela:

listar:

- arquivo principal;
- subcomponentes;
- hooks;
- dados;
- interações;
- ações;
- filtros;
- loading;
- empty;
- error;
- responsive;
- shared dependencies.

---

# 65. PLANO ANTES DE EXECUTAR

Antes da edição, apresentar um plano curto:

- arquivos a alterar;
- componentes a criar;
- componentes a reutilizar;
- funcionalidade preservada;
- riscos.

Depois executar.

Não parar na análise.

---

# 66. QA VISUAL

Após cada tela:

comparar:

1. screenshot antiga;
2. mockup aprovado;
3. implementação.

Verificar:

- width;
- height;
- fold;
- spacing;
- alignment;
- typography;
- radius;
- borders;
- colors;
- grid;
- charts;
- density.

---

# 67. QA FULL HD

Obrigatório testar conceitualmente ou via navegador/devtools em:

`1920 × 1080`

com:

- zoom 100%;
- sidebar aberta;
- sem devtools ocupando espaço;
- conteúdo real.

---

# 68. CHECKLIST FULL HD

Perguntas:

- cabe sem scroll horizontal?
- primeira dobra está bem aproveitada?
- os KPIs cabem?
- os charts não estão altos demais?
- side panels estão sendo usados?
- há espaço vazio sem função?
- a navegação cabe em uma linha?
- filtros cabem?
- textos estão legíveis?
- nenhum card parece gigante?

---

# 69. QA 1440

Também testar:

`1440 × 900`

Verificar:

- wrap;
- grid;
- chart;
- sidebar;
- filters;
- tables.

---

# 70. QA FUNCIONAL

Toda subtela deve manter as funcionalidades atuais.

Testar o que for aplicável:

- filtros;
- refresh;
- tabs;
- links;
- dialogs;
- forms;
- sorting;
- pagination;
- tooltips;
- export;
- config;
- mutations.

---

# 71. QA TÉCNICO

Ao final de cada tela:

- typecheck;
- lint;
- build;
- testes relevantes;
- console;
- warnings;
- imports;
- dead code;
- responsiveness.

Usar os comandos reais do projeto.

---

# 72. CRITÉRIO DE ACEITAÇÃO — WIDTH

Em 1920×1080:

o conteúdo deve ocupar de forma útil a largura após sidebar.

Não deixar um bloco de 1200px centralizado com 400px de vazio lateral.

---

# 73. CRITÉRIO DE ACEITAÇÃO — HEIGHT

Não transformar cada subtela em página de 3–5 telas de altura quando os dados poderiam ser organizados em grid wide.

Scroll vertical é permitido.

Desperdício vertical não.

---

# 74. CRITÉRIO DE ACEITAÇÃO — DENSIDADE

A densidade deve ser semelhante a uma aplicação profissional de operação:

- Linear;
- Stripe;
- Attio;
- Intercom;
- Vercel;
- HubSpot.

Não copiar.

Usar como nível de acabamento.

---

# 75. CRITÉRIO DE ACEITAÇÃO — COERÊNCIA

Todas as subtelas devem parecer partes do mesmo produto.

Não variar arbitrariamente:

- padding;
- card styles;
- border;
- radius;
- chart headers;
- KPI layout;
- toolbar patterns.

---

# 76. CRITÉRIO DE ACEITAÇÃO — INTERAÇÃO

Ações primárias:

visíveis.

Ações secundárias:

discretas.

Ações raras:

menus/drawers.

Danger:

claramente diferenciado.

---

# 77. CRITÉRIO DE ACEITAÇÃO — GRÁFICOS

Todo gráfico deve responder a uma pergunta.

Todo gráfico deve ter:

- título;
- contexto;
- período;
- legenda quando necessária;
- tooltip;
- empty state;
- escala legível.

---

# 78. CRITÉRIO DE ACEITAÇÃO — TABELAS

Tabelas devem permitir comparação rápida.

Evitar transformar dados tabulares em cards apenas por estética.

---

# 79. CRITÉRIO DE ACEITAÇÃO — EMPTY STATES

Nenhuma subtela deve parecer quebrada quando não houver dados.

Empty state precisa parecer intencional.

---

# 80. CRITÉRIO DE ACEITAÇÃO — LOADING

Loading deve preservar layout e reduzir layout shift.

---

# 81. CRITÉRIO DE ACEITAÇÃO — ERROR

Erro não pode parecer ausência de dados.

---

# 82. NÃO USAR ALTURA FIXA GLOBAL

Evitar `h-screen` ou alturas rígidas que cortem conteúdo dentro do layout principal sem necessidade.

Usar min-height e overflow apropriados.

---

# 83. NÃO USAR POSITION ABSOLUTE PARA LAYOUT PRINCIPAL

Absolute é permitido para:

- badges;
- decorations;
- small overlays.

Não para estruturar cards e grids.

---

# 84. NÃO USAR MAGIC NUMBERS ESPALHADOS

Se valores de layout se repetirem:

use tokens/classes/constantes apropriadas.

---

# 85. NÃO USAR `!important` COMO ESTRATÉGIA

Corrigir cascade/composição corretamente.

---

# 86. NÃO REESCREVER BACKEND

O trabalho é front-end/UX.

Se encontrar problema de dados:

reportar.

---

# 87. NÃO MODIFICAR OUTRAS TELAS DO SISTEMA

Este módulo é o escopo.

Mudanças globais devem ser feitas apenas se forem seguras e justificadas.

---

# 88. NOVA TELA ESPECÍFICA SEM MOCKUP

Se um prompt específico não tiver mockup suficiente:

não inventar grande redesign.

Seguir:

- este Prompt Mestre;
- padrões das telas já aprovadas;
- design system consolidado.

---

# 89. CONSISTÊNCIA PROGRESSIVA

Cada tela implementada deve consolidar padrões.

As seguintes devem reutilizar esses padrões.

Não recriar KPI card diferente em cada aba.

---

# 90. ESTADO DO DESIGN SYSTEM

Durante a execução do módulo, mantenha um pequeno registro interno dos componentes compartilhados criados/alterados.

Ao final de cada tela, informar:

- componente;
- propósito;
- telas que podem reutilizar.

---

# 91. PRIORIDADE DE QUALIDADE

Prioridade:

1. funcionalidade;
2. legibilidade;
3. hierarquia;
4. layout wide;
5. consistência;
6. responsividade;
7. estética;
8. microinteração.

Nunca sacrificar 1–6 para melhorar 7–8.

---

# 92. REGRA DE OURO PARA 24"

Em um monitor Full HD de 24":

o usuário deve sentir que a aplicação foi desenhada especificamente para aquele espaço.

Não deve parecer:

- ampliada;
- espremida;
- feita para ultrawide;
- feita para tablet;
- feita para 4K;
- apenas responsiva por acidente.

---

# 93. REGRA DE OURO DE HIERARQUIA

O usuário deve saber em 2–3 segundos:

- onde está;
- qual é a situação;
- qual ação precisa tomar.

---

# 94. REGRA DE OURO DE WIDE LAYOUT

Antes de empilhar dois módulos verticalmente, pergunte:

"eles podem funcionar melhor lado a lado em 1920×1080?"

Se sim:

prefira o layout horizontal.

---

# 95. REGRA DE OURO DE ALTURA

Antes de dar 400px de altura a um card, pergunte:

"essa informação realmente precisa dessa altura?"

Se não:

compactar.

---

# 96. REGRA DE OURO DE TABS

As tabs não devem ocupar mais espaço visual do que o conteúdo que controlam.

---

# 97. REGRA DE OURO DE FILTROS

Filtros devem ficar acessíveis sem dominar a tela.

---

# 98. REGRA DE OURO DE GAMIFICAÇÃO

Gamificação deve motivar.

Não distrair.

---

# 99. REGRA DE OURO DE DECORAÇÃO

Se um efeito não melhora:

- leitura;
- feedback;
- hierarchy;
- state;

ele provavelmente não é necessário.

---

# 100. EXECUÇÃO DESTE PROMPT MESTRE

Quando este prompt for enviado sozinho:

1. audite o módulo Dashboard;
2. identifique o shell compartilhado;
3. identifique componentes compartilháveis;
4. identifique riscos;
5. NÃO implemente todas as subtelas;
6. prepare-se para o primeiro prompt específico.

Quando este prompt vier acompanhado de um prompt de uma subtela:

1. aplique TODAS estas regras;
2. implemente somente aquela subtela;
3. faça o QA completo;
4. documente.

---

# 101. FORMATO DE RESPOSTA ANTES DE CADA IMPLEMENTAÇÃO

Forneça:

## Arquivos envolvidos

## Estado atual

## Mudanças propostas

## Componentes compartilhados

## Riscos de regressão

## Funcionalidades preservadas

Depois execute.

---

# 102. FORMATO DE ENTREGA DEPOIS DE CADA IMPLEMENTAÇÃO

Forneça:

## Resumo

## Arquivos alterados

## Componentes criados/reutilizados

## Funcionalidades preservadas

## Alterações visuais

## Alterações UX

## Responsividade

## Resultado typecheck

## Resultado lint

## Resultado build

## Testes executados

## Pendências

## Checklist 1920×1080

---

# 103. ORDEM DE IMPLEMENTAÇÃO APROVADA

A sequência oficial é:

### 00
Prompt Mestre

### 01
Visão Geral

### 02
Analytics

### 03
Metas

### 04
Inteligência Artificial

### 05
Métricas SLA

### 06
Equipe

### 07
Satisfação

### 08
Sentimento

### 09
Relatórios

### 10
QA Global

Não alterar a sequência sem necessidade técnica real.

---

# 104. PRINCÍPIO FINAL

Este redesign não deve apenas ficar bonito.

Ele deve ficar:

- melhor para trabalhar;
- melhor para interpretar;
- melhor para decidir;
- melhor para operar;
- melhor em 1920×1080;
- mais consistente;
- mais rápido;
- mais profissional.

A meta final é:

> UM DASHBOARD WIDE, DENSO, ELEGANTE, OPERACIONAL E CONSISTENTE, OTIMIZADO PARA MONITORES FULL HD DE 24", SEM PERDER NENHUMA FUNCIONALIDADE REAL DO ZAPP WEB V2.

Não produza decoração.

Implemente produto.
