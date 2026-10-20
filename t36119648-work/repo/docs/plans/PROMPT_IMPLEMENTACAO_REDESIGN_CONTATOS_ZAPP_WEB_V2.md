# PROMPT MESTRE DE IMPLEMENTAÇÃO — REDESIGN COMPLETO DO MÓDULO CONTATOS | ZAPP WEB V2

## 0. PAPEL, CONTEXTO E MISSÃO

Atue como um **Senior Front-End Engineer + Senior Product Engineer + Design Systems Engineer + UX Implementation Specialist** responsável por implementar o redesign completo do módulo **Contatos** do sistema **ZAPP WEB V2**.

Este trabalho deve ser executado sobre o sistema REAL, preservando funcionalidades, integrações, regras de negócio, dados, permissões e arquitetura existentes.

### Projeto

- Repositório: `adm01-debug/Zapp_Web_V2`
- Tela principal: `?view=contacts`
- Módulo: `Contatos`
- Referência visual principal: **imagem de redesign aprovada anexada junto com este prompt**
- Referência secundária: screenshot atual da tela de Contatos
- Stack: descubra e confirme no próprio repositório antes de alterar qualquer código
- Estado atual: o módulo já possui busca, filtros, ordenação, múltiplos modos de visualização, seleção, ações em massa, CRM 360°, paginação, cards, lista, tabela, agrupamento, mapa, pipeline, analytics, mesclagem, comparação, tags e painel de detalhes

A regra central deste redesign é:

> **A IMAGEM NOVA DEFINE A DIREÇÃO VISUAL.**  
> **O CÓDIGO EXISTENTE DEFINE A FUNCIONALIDADE REAL.**  
> **OS DADOS REAIS DEFINEM O CONTEÚDO.**  
> **A IMPLEMENTAÇÃO DEVE UNIR OS TRÊS SEM REGRESSÕES.**

NÃO crie uma página HTML paralela.

NÃO recrie o módulo do zero.

NÃO substitua o sistema por um mockup estático.

NÃO hardcode dados da imagem.

NÃO altere backend sem necessidade direta e comprovada.

O objetivo é transformar a interface existente em uma experiência visual e operacional de alto nível, equivalente à nova linguagem visual aprovada para o Dashboard.

---

# 1. OBJETIVO GERAL DO REDESIGN

Transformar a tela de Contatos em uma interface:

- extremamente profissional;
- moderna;
- sofisticada;
- compacta;
- elegante;
- operacional;
- rápida;
- escaneável;
- visualmente consistente;
- responsiva;
- fácil de usar;
- adequada para centenas ou milhares de contatos;
- coerente com o novo Dashboard;
- visualmente premium;
- organizada para uso diário.

A nova tela deve parecer um produto SaaS maduro, e não uma coleção de componentes independentes.

A referência visual deve ser tratada como **spec visual de alta fidelidade**, mas não como fonte de dados.

---

# 2. PRINCÍPIO DE PRODUTO

A tela de Contatos NÃO é um dashboard.

Ela é uma tela operacional de gestão de entidades.

A prioridade deve ser:

1. localizar contato;
2. segmentar contatos;
3. visualizar rapidamente informações relevantes;
4. abrir conversa;
5. editar;
6. selecionar;
7. executar ações em massa;
8. comparar/mesclar;
9. alternar visualização;
10. acessar dados complementares.

Qualquer elemento decorativo deve estar subordinado a essas tarefas.

---

# 3. ARQUIVOS QUE DEVEM SER AUDITADOS ANTES DE ALTERAR O CÓDIGO

Analise obrigatoriamente:

- `src/components/contacts/ContactsView.tsx`
- `src/components/contacts/ContactStatsCards.tsx`
- `src/components/contacts/ContactToolbar.tsx`
- `src/components/contacts/ContactViewSwitcher.tsx`
- `src/components/contacts/ContactContentArea.tsx`
- `src/components/contacts/ContactsTable.tsx`
- `src/components/contacts/ContactCard.tsx`
- `src/components/contacts/ContactListItem.tsx`
- `src/components/contacts/ContactGroupedList.tsx`
- `src/components/contacts/ContactResultsSummary.tsx`
- `src/components/contacts/ContactBirthdayPanel.tsx`
- `src/components/contacts/ContactDetailPanel.tsx`
- `src/components/contacts/ContactDialogs.tsx`
- `src/components/contacts/ContactCRMDialog.tsx`
- `src/components/contacts/ContactMergeDialog.tsx`
- `src/components/contacts/ContactCompareDialog.tsx`
- `src/components/contacts/ContactBulkTagDialog.tsx`
- `src/components/contacts/BulkActionsBar.tsx`
- `src/components/contacts/ContactAdvancedFilters.tsx`
- `src/components/contacts/FilterPresets.tsx`
- `src/components/contacts/ContactSearchWithSuggestions.tsx`
- `src/components/contacts/contactTypeConfig.ts`
- `src/components/contacts/types.ts`
- `src/components/contacts/useContactsViewState.ts`
- `src/components/contacts/useContactsCRUD.ts`

Também analise:

- hooks utilizados pela tela;
- componentes compartilhados;
- design tokens;
- layout global;
- sidebar;
- `Button`, `Badge`, `Avatar`, `Tabs`, `Select`, `Checkbox`, `DropdownMenu`, `Card`, `Tooltip`;
- integração CRM externa;
- paginação;
- comportamento mobile;
- loading states;
- empty states;
- permissões;
- queries;
- mutations;
- rotas.

Antes de editar, produza um inventário rápido:

1. quais arquivos serão alterados;
2. quais serão apenas reutilizados;
3. quais componentes podem ser simplificados;
4. quais funcionalidades devem mudar apenas de posição;
5. quais riscos de regressão existem.

Depois execute.

---

# 4. FUNCIONALIDADES QUE DEVEM SER PRESERVADAS

Preserve integralmente:

- busca por nome;
- busca por telefone;
- busca por email;
- busca por empresa;
- sugestões de busca;
- busca CRM 360°;
- sincronização/refetch;
- criação de novo contato;
- edição;
- exclusão;
- abertura de conversa;
- seleção individual;
- selecionar todos;
- ações em massa;
- tags;
- filtros;
- filtros avançados;
- filtros salvos/presets;
- ordenação;
- filtro por tipo de contato;
- filtro por empresa;
- filtro por cargo;
- filtro por tag;
- filtro por período;
- agrupamento por empresa;
- comparação;
- mesclagem;
- paginação;
- grid/cards;
- lista;
- tabela;
- pipeline;
- mapa;
- analytics;
- dados externos de CRM;
- logo da empresa;
- avatar;
- detalhes do contato;
- permissões existentes;
- loading;
- empty state;
- estados de erro;
- estados de seleção;
- estados de hover/focus;
- responsividade.

Nenhuma funcionalidade deve desaparecer apenas porque foi removida visualmente da área principal.

---

# 5. NOVA DIREÇÃO VISUAL

A linguagem visual do módulo Contatos deve ficar alinhada com o novo Dashboard.

Características:

- dark mode sofisticado;
- azul como primary;
- superfícies em níveis;
- bordas discretas;
- glow mínimo;
- cards mais densos;
- tipografia clara;
- hierarquia forte;
- estados semânticos;
- poucos elementos competindo pela atenção;
- uso de verde apenas para ação positiva/importante;
- uso de amarelo para destaque semântico;
- uso de roxo apenas quando houver contexto específico;
- sem partículas chamativas;
- sem aurora dominando a página;
- sem animações excessivas.

---

# 6. ELEMENTOS VISUAIS QUE DEVEM SER REDUZIDOS OU REMOVIDOS

Na tela atual, reduza significativamente:

- `AuroraBorealis` no conteúdo;
- `FloatingParticles`;
- glows decorativos;
- animações de entrada por item;
- stagger em listas grandes;
- escalas em hover;
- bordas coloridas em excesso;
- badges em excesso;
- ícones repetidos sem função;
- card dentro de card;
- áreas vazias desnecessárias;
- headers muito altos.

A tela deve parecer mais rápida mesmo antes de medir performance.

---

# 7. NOVO HEADER DA TELA

Estrutura principal:

```text
Início > Gestão > Contatos

Contatos
Base de clientes e leads (1.516 contatos)

                                  [CRM 360°] [Sincronizar] [+ Novo Contato]
```

Regras:

- manter breadcrumb;
- título claro;
- subtitle discreto;
- ações à direita;
- `Novo Contato` é ação primária;
- usar verde para `Novo Contato`;
- `CRM 360°` é ação especial secundária;
- `Sincronizar` é secundária;
- header compacto;
- sem banner decorativo;
- sem altura exagerada.

---

# 8. KPI STRIP — NOVA APRESENTAÇÃO

Logo abaixo do header:

- Total de Contatos
- Novos (30 dias)
- Empresas
- Leads ou principal categoria relevante

Mesmo que a referência visual mostre 4 cards, use os dados reais disponíveis.

Cada KPI deve conter:

- ícone discreto;
- label;
- valor;
- tendência/opcional;
- sparkline opcional;
- contexto secundário.

Regras:

- mesma altura;
- mesmo padding;
- cards horizontais;
- evitar cards gigantes;
- evitar glow;
- evitar borda branca forte;
- usar cores semânticas discretas.

Exemplo:

```text
[ícone] Total de Contatos
        1.516   ↑ 85%
        vs. período anterior
```

---

# 9. REMOVER O PAINEL DE ANIVERSÁRIOS DA ÁREA PRINCIPAL

O painel de aniversários NÃO deve ocupar uma coluna inteira no topo.

Ele pode:

- ser removido da tela principal;
- virar widget secundário;
- virar filtro;
- virar insight em outra área;
- ser acessado por menu/mais opções.

NÃO deixar o bloco competir com os KPIs.

Se houver bug ou inconsistência de dados relacionada a aniversário, reporte separadamente.

Não crie migration.

---

# 10. TIPOS DE CONTATO — TABS COMPACTAS

Abaixo dos KPIs:

- Todos
- Cliente
- Fornecedor
- Colaborador
- Prestador de Serviço
- Lead
- Parceiro
- Transportadora
- Sicoob Gifts
- Outros

Use tabs/segmented navigation compacta.

Regras:

- não fazer botões grandes;
- item ativo em azul;
- badge de quantidade apenas quando útil;
- permitir scroll horizontal em telas pequenas;
- manter ícones discretos;
- evitar cores específicas em cada categoria;
- preservar filtro funcional existente.

---

# 11. TOOLBAR PRINCIPAL — NOVA COMPOSIÇÃO

Desktop:

```text
[ Buscar por nome, telefone, email ou empresa... ]
[ Nome (A-Z) ]
[ Filtros ]
[ Filtros Salvos ]

                            [ Cards ] [ Lista ] [ Tabela ] [ Colunas ]
```

Regras:

- preferir uma linha;
- search deve ocupar maior largura;
- sort compacto;
- filtros compactos;
- filtros salvos visíveis;
- ações secundárias devem ficar à direita;
- `Agrupar` não precisa ser botão permanente;
- `Comparar`, `Mesclar`, `Tags` só aparecem quando houver seleção;
- toolbar não deve ficar visualmente pesada.

---

# 12. MODO DE VISUALIZAÇÃO — SIMPLIFICAR A NAVEGAÇÃO VISÍVEL

Hoje existem:

- Grid
- Lista
- Tabela
- Pipeline
- Mapa
- Analytics

Na nova UI, deixar visíveis como principais:

- Cards
- Lista
- Tabela

Mover para menu `Mais visualizações`:

- Pipeline
- Mapa
- Analytics

Preservar todas as funcionalidades.

Não remover componentes.

Objetivo:
reduzir custo cognitivo.

---

# 13. AGRUPAMENTO

`Agrupar por empresa` não deve ocupar espaço permanente.

Mover para:

- menu de visualização;
- filtros;
- dropdown `Mais`;
- configuração de lista.

Preservar estado e comportamento.

---

# 14. RESUMO DE RESULTADOS

Abaixo da toolbar:

```text
[ ] Selecionar todos   |   Exibindo 50 de 1516 contatos

                                             Página 1 de 31   [<] [>]
```

Remover da área principal:

- atalhos de teclado permanentes;
- informações pouco importantes;
- excesso de texto.

Atalhos podem ficar em tooltip/ajuda.

---

# 15. GRID PRINCIPAL — CARDS DE CONTATO

Este é o principal foco do redesign.

## Desktop grande

4 cards por linha.

## Desktop médio

3 ou 4 conforme largura real.

## Tablet

2.

## Mobile

1.

Não forçar número de colunas quando prejudicar leitura.

---

# 16. NOVA ESTRUTURA DO CARD DE CONTATO

Estrutura conceitual:

```text
┌────────────────────────────────────────────┐
│ [avatar] Nome do contato              [⋮] │
│          Cliente                           │
│          Empresa                           │
│                                            │
│ ☎ telefone                                 │
│ ✉ email                                    │
│                                            │
│ ◷ Último contato em 02 set 2026   [chat][editar] │
└────────────────────────────────────────────┘
```

Objetivos:

- mais informativo;
- mais compacto;
- sem grandes espaços vazios;
- ações claras;
- densidade adequada;
- excelente leitura.

---

# 17. HEADER DO CARD

Deve conter:

- avatar;
- nome;
- badge de tipo;
- empresa;
- menu de contexto.

Regras:

- nome com peso alto;
- badge de tipo logo abaixo ou ao lado;
- empresa em texto secundário;
- menu `⋮` no canto superior direito;
- avatar 40–48px;
- fallback por iniciais;
- não usar bolinhas/indicadores redundantes se não agregarem informação real.

---

# 18. CONTEÚDO DO CARD

Mostrar apenas campos existentes.

Possíveis campos:

- telefone;
- email;
- empresa;
- cargo;
- tags;
- último contato;
- CRM company name;
- logo da empresa.

NÃO renderizar linhas vazias.

NÃO reservar espaço para dados inexistentes.

NÃO inventar email/empresa/cargo.

O card deve se adaptar aos dados.

---

# 19. TELEFONE

Mostrar com ícone discreto.

Não usar fonte monoespaçada se isso comprometer estética.

Priorizar legibilidade.

Se houver telefone inválido ou incompleto, preservar dado sem mascarar artificialmente.

---

# 20. EMAIL

Mostrar apenas quando existir.

Truncar com tooltip se necessário.

Exemplo:

```text
alexandre@empresa.com.br
```

---

# 21. EMPRESA

Quando houver CRM 360 externo:

- preservar logo;
- preservar nome externo quando disponível;
- fallback para `contact.company`.

Não mostrar empresa duas vezes.

---

# 22. CARGO

Cargo deve ser secundário.

Pode aparecer:

- abaixo da empresa;
- ou no corpo do card;
- apenas quando existir.

Não obrigar todos os cards a terem a mesma altura por causa de campos ausentes.

---

# 23. TAGS

Não transformar todas as tags em badges visíveis.

Mostrar no máximo 2.

Se houver mais:

```text
+3
```

Tooltip/popover pode revelar demais.

---

# 24. ÚLTIMO CONTATO

Mostrar no footer do card.

Exemplo:

```text
Último contato em 02 set 2026
```

Se não houver dado real confiável:

não inventar.

Usar apenas campo disponível.

---

# 25. AÇÕES DO CARD

Ações principais:

- Conversar;
- Editar.

Devem estar facilmente disponíveis.

Ações secundárias:

- tags;
- comparar;
- mesclar;
- excluir;
- demais ações.

Devem ficar no menu `⋮`.

Excluir continua sendo ação destrutiva.

---

# 26. HOVER DO CARD

Hover suave:

- border levemente mais clara;
- background um nível acima;
- shadow discreta;
- ações aparecem com transição curta.

Evitar:

- zoom;
- scale;
- glow;
- animações chamativas.

---

# 27. ESTADO SELECIONADO

Quando contato estiver selecionado:

- borda primary;
- background primary muito discreto;
- checkbox claro;
- não usar border-left exagerado;
- não quebrar layout.

---

# 28. CHECKBOX

Checkbox deve aparecer de forma limpa.

Pode estar:

- canto superior esquerdo;
- alinhado ao avatar;
- ou revelado no hover.

Mas deve continuar acessível e claro.

---

# 29. GRID / LIST / TABLE — CONSISTÊNCIA

Os três modos principais devem parecer partes do mesmo design system.

Compartilhar:

- typography;
- badges;
- avatars;
- spacing;
- border;
- actions;
- states.

Não deixar cada view parecer um produto diferente.

---

# 30. LISTA

Lista deve ser densa.

Sugestão:

```text
[checkbox][avatar] Nome
                  empresa
        telefone | email | tipo | tags                [chat][⋮]
```

Altura recomendada:
56–72px.

Evitar cards altos.

---

# 31. TABELA

A tabela deve ser altamente operacional.

Colunas sugeridas:

- seleção;
- contato;
- tipo;
- telefone;
- email;
- empresa;
- cargo;
- tags;
- ações.

Melhorias:

- sticky header quando possível;
- hover suave;
- sorting claro;
- truncamento consistente;
- densidade moderada;
- ícones mínimos;
- menu de ações contextual;
- ações principais visíveis no hover;
- scroll horizontal controlado.

Preservar sorting já existente.

---

# 32. NÃO DUPLICAR ORDENAÇÃO

Existe ordenação global na toolbar e ordenação local na tabela.

Evite conflitos.

Defina claramente:

- toolbar controla ordenação principal da consulta;
- table header pode ordenar somente quando comportamento já existente for desejado.

Se houver risco de duas ordenações concorrentes, preserve funcionalidade atual mas evite comportamento visual confuso.

---

# 33. FILTROS AVANÇADOS

O painel de filtros deve ser mais elegante.

Organizar em:

- Empresa
- Cargo
- Tag
- Período

Possível grid 4 colunas desktop.

Mostrar:

- filtros ativos;
- limpar filtros;
- contador;
- presets.

Evitar painel gigante.

---

# 34. FILTROS ATIVOS

Quando aplicados:

mostrar chips compactos abaixo da toolbar ou dentro do painel.

Exemplo:

```text
Empresa: Sicoob ×
Tag: VIP ×
```

Não duplicar informação em múltiplos lugares.

---

# 35. FILTROS SALVOS

Preservar presets existentes.

A ação deve ser chamada visualmente de:

`Filtros Salvos`

ou equivalente coerente com a referência.

---

# 36. BUSCA

Search field deve ser elemento visual dominante da toolbar.

Placeholder:

`Buscar por nome, telefone, email ou empresa...`

Regras:

- ícone de busca;
- clear button;
- sugestões;
- debounce;
- loading discreto;
- width responsiva;
- teclado preservado.

---

# 37. CRM 360°

Preservar.

Ação deve continuar no header.

Visual:

- outline azul;
- ícone;
- label;
- sem glow excessivo.

Dialog deve permanecer funcional.

---

# 38. SINCRONIZAR

Preservar `refetch()`.

Botão:

- outline neutro;
- ícone refresh;
- spin apenas enquanto carregando;
- feedback claro.

---

# 39. NOVO CONTATO

Ação primária do header.

Usar verde.

Botão:

```text
+ Novo Contato
```

Não alterar fluxo do dialog.

---

# 40. DIALOG DE NOVO/EDITAR CONTATO

Mesmo não sendo o foco visual principal, revisar consistência:

- header;
- campos;
- agrupamento;
- labels;
- ações;
- spacing;
- error;
- loading.

Não alterar lógica de dados sem necessidade.

---

# 41. DETALHE DO CONTATO

Preservar `ContactDetailPanel`.

Pode receber pequenos ajustes para combinar com o novo design:

- header mais limpo;
- avatar;
- dados;
- CTA conversar;
- editar;
- divider;
- tags.

Não reescrever funcionalidades.

---

# 42. BULK ACTIONS

Quando houver seleção:

mostrar barra contextual.

Exemplo:

```text
12 selecionados
[Tags] [Comparar] [Mesclar] [Mais]                    [Limpar seleção]
```

A barra pode:

- ficar sticky;
- aparecer no topo do conteúdo;
- ou na parte inferior.

Evitar duplicar ações também na toolbar.

---

# 43. COMPARAR

Preservar.

Só mostrar quando 2+ contatos selecionados.

---

# 44. MESCLAR

Preservar.

Só mostrar quando 2+ selecionados.

Diferenciar visualmente de excluir.

Não fazer mesclagem parecer ação destrutiva.

---

# 45. TAGS EM MASSA

Preservar.

Só mostrar quando seleção existir.

---

# 46. PAGINAÇÃO

Preferir paginação clara.

Exemplo:

```text
Página 1 de 31 [<] [>]
```

Preservar pageSize e lógica atual.

Se houver `loadMore` e paginação híbrida, entender arquitetura existente antes de alterar.

---

# 47. EMPTY STATES

Padronizar.

Casos:

- nenhum contato;
- busca sem resultado;
- filtro sem resultado.

Cada um deve explicar:

- motivo;
- ação.

Exemplo:

```text
Nenhum contato encontrado
Tente remover filtros ou alterar sua busca.
[Limpar filtros]
```

Evitar card enorme vazio.

---

# 48. LOADING

Skeleton deve imitar cards reais.

Grid skeleton:

- avatar;
- linhas;
- footer;
- ações.

Evitar skeleton genérico.

---

# 49. ERROR STATES

Não misturar erro com empty state.

Se fetch falhar:

- mensagem clara;
- tentar novamente;
- preservar dados existentes se possível.

---

# 50. RESPONSIVIDADE — HEADER

Desktop:

- title esquerda;
- ações direita.

Tablet:

- ações podem quebrar linha.

Mobile:

- title + subtitle;
- ações em linha secundária;
- `Novo Contato` permanece fácil de acessar;
- demais ações podem ir para menu.

---

# 51. RESPONSIVIDADE — KPIs

1920/1440:
4 colunas.

1024:
2 colunas.

Mobile:
1 ou 2 conforme largura.

---

# 52. RESPONSIVIDADE — TABS DE TIPO

Desktop:
linha completa.

Mobile:
scroll horizontal.

Não quebrar cada tab para uma linha.

---

# 53. RESPONSIVIDADE — TOOLBAR

Desktop:
1 linha.

Tablet:
2 linhas controladas.

Mobile:

- search full width;
- sort/filtros na segunda linha;
- view switcher compacto;
- ações secundárias em dropdown.

---

# 54. RESPONSIVIDADE — CARDS

>= 1600:
4 colunas.

1280–1599:
3 ou 4 conforme largura disponível.

1024:
2–3.

768:
2.

Mobile:
1.

Não usar 5 ou 6 colunas se o card ficar ilegível.

---

# 55. DARK MODE

Usar hierarquia de superfícies.

Evitar:

- preto absoluto;
- branco puro em todas as bordas;
- glow em todos os cards.

Criar contraste por tonalidade.

---

# 56. CORES

Primary:
azul.

Ação positiva:
verde.

Warning:
amarelo.

Danger:
vermelho.

Text:
branco suave / cinza claro.

Muted:
cinza azulado.

Não usar cores sem motivo.

---

# 57. TIPOGRAFIA

Sugestão:

Page title:
28–32px.

Subtitle:
14–15px.

KPI:
28–32px.

Contact name:
14–15px semibold.

Company:
12–13px.

Metadata:
11–12px.

Badges:
10–11px.

Não usar uppercase em excesso.

---

# 58. BORDAS

Usar bordas discretas.

Exemplo:

- `border-border/40`
- `border-border/50`

Selecionado:
`border-primary/50`

Hover:
`border-primary/25`

Não transformar cada card em uma caixa brilhante.

---

# 59. RADIUS

Manter padrão consistente:

- cards: 10–12px;
- inputs/buttons: 8–10px;
- badges: pill quando fizer sentido.

---

# 60. SHADOW

Shadow baixa.

Evitar:

- blur enorme;
- shadow azul;
- neon em todas as superfícies.

---

# 61. ANIMAÇÕES

Remover animações por item da lista.

Não fazer:

```text
index * delay
```

em centenas de contatos.

Manter:

- hover;
- focus;
- fade;
- open/close de panel;
- loading.

Transições:
120–200ms.

---

# 62. PERFORMANCE

A tela pode renderizar muitos contatos.

Evitar:

- motion em cada row/card;
- recalcular dados desnecessariamente;
- requests extras por contato;
- N+1 fetch;
- render de ícones/componentes pesados sem necessidade.

Preservar batch lookup de CRM.

---

# 63. ACCESSIBILITY

Garantir:

- keyboard navigation;
- focus visible;
- labels;
- `aria-label`;
- tooltips em icon-only buttons;
- checkbox acessível;
- contrast adequado;
- menus navegáveis por teclado;
- ações destrutivas claramente identificadas.

---

# 64. DESIGN SYSTEM

Reutilizar prioritariamente:

- Button
- Badge
- Avatar
- Tabs
- Select
- Checkbox
- DropdownMenu
- Card
- Tooltip
- Dialog
- Sheet/Drawer se já existir

Não instalar nova biblioteca de UI.

---

# 65. NÃO CRIAR DUPLICAÇÃO DESNECESSÁRIA

Antes de criar novo componente:

verifique se já existe algo equivalente.

Se necessário, criar wrappers reutilizáveis:

- `ContactsPageHeader`
- `ContactKpiCard`
- `ContactViewControls`
- `ContactEntityCard`

Somente se reduzir duplicação real.

---

# 66. PRESERVAR TIPOS E MODELOS DE DADOS

Não alterar interface `Contact` apenas para servir ao mockup.

Usar campos reais.

Se a imagem mostrar algo inexistente:

omitir.

---

# 67. NÃO ALTERAR BACKEND

Sem autorização explícita, NÃO:

- criar migration;
- alterar Supabase;
- alterar schema;
- alterar RLS;
- alterar policies;
- alterar triggers;
- alterar functions;
- alterar Edge Functions;
- alterar APIs;
- alterar autenticação;
- alterar dados;
- alterar permissões.

---

# 68. NÃO HARDCODE DADOS

A imagem de redesign contém nomes fictícios.

Não usar:

- Alexandre Oliveira;
- Bruno Santos;
- Carlos Mendes;
- etc.

Esses nomes são apenas demonstração visual.

Usar dados reais da consulta.

---

# 69. DADOS AUSENTES

Se não houver:

- email;
- empresa;
- cargo;
- tag;
- avatar;

não mostrar espaço vazio.

Fallback:

avatar → iniciais.

Demais campos:
omitir.

---

# 70. LOGO DA EMPRESA

Preservar `CompanyLogo`.

Se CRM retornar logo:
mostrar.

Se não:
fallback discreto.

---

# 71. CONTATO TIPO

Preservar `CONTACT_TYPE_CONFIG`.

Revisar cores para ficarem visualmente consistentes.

Evitar badge excessivamente chamativo.

---

# 72. RESULTADO ESPERADO

A nova tela deve transmitir:

- organização;
- controle;
- qualidade;
- velocidade;
- sofisticação;
- clareza;
- maturidade de produto.

Ao olhar para a tela:

- busca deve ser óbvia;
- filtros fáceis;
- contatos legíveis;
- ações claras;
- seleção evidente;
- sem excesso de informação.

---

# 73. IMPLEMENTAÇÃO POR FASES

## Fase 1 — Auditoria

- mapear arquivos;
- mapear props;
- mapear hooks;
- mapear ações;
- mapear dados;
- mapear estados.

## Fase 2 — Header e KPIs

- novo header;
- KPIs;
- remoção/rebaixamento de aniversário.

## Fase 3 — Tabs de tipo

- refazer visual;
- preservar filtro.

## Fase 4 — Toolbar

- busca;
- sort;
- filtros;
- filtros salvos;
- view modes.

## Fase 5 — Cards

- refazer ContactCard;
- eliminar espaço vazio;
- ações;
- responsividade.

## Fase 6 — Lista

- compactar;
- alinhar visual.

## Fase 7 — Tabela

- refinar;
- sorting;
- hover;
- ações.

## Fase 8 — Bulk actions

- reorganizar ações condicionais.

## Fase 9 — Dialogs/Detail

- harmonizar.

## Fase 10 — Empty/loading/error

- padronizar.

## Fase 11 — Responsive

- desktop/tablet/mobile.

## Fase 12 — Accessibility

- focus;
- keyboard;
- aria.

## Fase 13 — QA

- visual;
- funcional;
- técnico.

---

# 74. QA VISUAL

Comparar:

A. screenshot atual;
B. imagem de redesign aprovada;
C. resultado implementado.

Avaliar:

- header;
- spacing;
- KPIs;
- tabs;
- toolbar;
- search;
- cards;
- grid;
- table;
- list;
- colors;
- typography;
- border;
- radius;
- density.

Não finalizar enquanto estiver apenas "parecido".

Buscar alta fidelidade.

---

# 75. QA FUNCIONAL

Testar:

- abrir tela;
- carregar contatos;
- buscar;
- limpar busca;
- filtrar;
- limpar filtros;
- aplicar preset;
- ordenar;
- alterar tipo;
- selecionar;
- selecionar todos;
- tags em massa;
- comparar;
- mesclar;
- grid;
- lista;
- tabela;
- pipeline;
- mapa;
- analytics;
- agrupar;
- abrir conversa;
- editar;
- excluir;
- novo contato;
- CRM 360°;
- sincronizar;
- paginação;
- detail panel;
- mobile.

---

# 76. QA TÉCNICO

Executar:

1. typecheck;
2. lint;
3. testes relevantes;
4. build;
5. console check;
6. warnings;
7. imports quebrados;
8. imports não utilizados;
9. dead code;
10. responsividade;
11. accessibility básica.

Adaptar comandos ao package.json real.

---

# 77. CRITÉRIOS DE ACEITAÇÃO VISUAL

A implementação deve cumprir:

- primeira linha de contatos visível sem scroll excessivo em desktop;
- header compacto;
- 4 KPIs em desktop;
- tabs compactas;
- toolbar em uma linha em 1440px+;
- cards legíveis em 4 colunas quando houver espaço;
- nenhum card com grande espaço vazio;
- ações principais claras;
- ações secundárias escondidas;
- border discreta;
- sem particles dominando interface;
- sem stagger em cards;
- sem glow excessivo;
- identidade visual alinhada ao novo Dashboard.

---

# 78. CRITÉRIOS DE ACEITAÇÃO FUNCIONAL

Tudo que funcionava antes deve continuar funcionando.

Nenhuma query pode ser quebrada.

Nenhum hook deve perder comportamento.

Nenhum dialog essencial pode desaparecer.

Nenhuma permissão pode ser alterada.

Nenhum dado pode ser hardcoded.

---

# 79. CRITÉRIO DE PERFORMANCE

A experiência deve parecer mais rápida que a atual.

Não adicionar:

- polling novo;
- requests extras;
- animações em massa;
- dependências pesadas;
- render desnecessário.

---

# 80. CRITÉRIO DE CONSISTÊNCIA COM DASHBOARD

O módulo Contatos deve utilizar a mesma linguagem:

- dark SaaS premium;
- azul primary;
- verde action;
- surfaces;
- border;
- typography;
- compact spacing;
- subtle hover;
- no excessive glow;
- no decorative noise.

Mas Contatos deve continuar parecendo uma tela operacional, não um dashboard.

---

# 81. ANTES DE ALTERAR O CÓDIGO

Entregue uma breve análise:

1. arquivos envolvidos;
2. arquitetura atual;
3. riscos;
4. plano de implementação;
5. funcionalidades preservadas.

Depois implemente.

NÃO pare na auditoria.

---

# 82. AO FINAL

Entregue:

- resumo do redesign;
- arquivos modificados;
- componentes reutilizados;
- componentes criados;
- funcionalidades preservadas;
- mudanças de UX;
- mudanças visuais;
- resultados de lint;
- resultados de typecheck;
- resultado de build;
- testes;
- eventuais pendências;
- checklist final.

---

# 83. PRINCÍPIO FINAL

Não implemente um "mockup bonito".

Implemente um módulo de Contatos profissional.

A aparência deve estar próxima da imagem aprovada.

A funcionalidade deve permanecer fiel ao sistema real.

A experiência final deve ser:

**mais bonita + mais clara + mais rápida + mais útil + mais consistente + mais madura.**
