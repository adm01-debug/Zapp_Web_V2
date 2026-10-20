# PROMO GIFTS V4 — BLUE PREMIUM DESIGN SYSTEM
## Manual de Design, UX/UI e Implementação para Claude
### Versão 1.0 — 07/09/2026

---

# 0. PROPÓSITO DESTE DOCUMENTO

Este documento é o **manual operacional de design** para implementar no sistema Promo Gifts V4 a linguagem visual aprovada nas telas do módulo **Magazine**.

Ele deve servir como referência para Claude ou qualquer outro agente que implemente novas telas, subtelas, modais, drawers, editores, galerias, listas, cards, dashboards e fluxos operacionais do sistema.

O objetivo não é copiar pixels cegamente. O objetivo é reproduzir, com consistência, os princípios visuais e de UX das referências aprovadas:

1. **Magazine — biblioteca principal**
2. **Templates de Revista — galeria**
3. **Preview de Template — inspector/modal**
4. **Editor Magazine — Identidade**
5. **Editor Magazine — Produtos**

Essas telas definem a nova família visual do produto.

Nome interno recomendado da linguagem:

> **PROMO GIFTS BLUE PREMIUM / BLUE OPS**

O resultado deve parecer:

- software SaaS profissional;
- escuro, sofisticado e operacional;
- visualmente premium sem ser decorativo;
- denso sem ser apertado;
- moderno sem parecer landing page;
- consistente em monitores Full HD;
- rápido, previsível e claro;
- orientado a trabalho real.

---

# 1. REGRA DE FONTE DA VERDADE

Ao implementar uma tela:

## Fonte funcional

O **código existente** define o que a tela faz.

## Fonte visual

A **imagem aprovada** define como a experiência deve parecer e como deve ser hierarquizada.

## Fonte sistêmica

Este manual define:

- tokens;
- escalas;
- proporções;
- estados;
- comportamento;
- responsividade;
- componentes;
- densidade;
- motion;
- acessibilidade;
- regras de consistência.

## Ordem de prioridade

1. Funcionalidade real existente.
2. Regras de negócio.
3. Segurança/permissões.
4. Design aprovado.
5. Este Design System.
6. Boas práticas de UX/UI.
7. Preferências locais de implementação.

Nunca remover uma função apenas porque ela não aparece em um mockup.

Nunca hardcodar dados fictícios do mockup.

---

# 2. CONTEXTO TÉCNICO REAL DO REPOSITÓRIO

Projeto:

`adm01-debug/Promo_Gifts_V4`

Stack atual relevante:

- React;
- TypeScript;
- Tailwind CSS;
- Radix UI;
- Lucide;
- TanStack;
- Framer Motion;
- Sonner;
- DnD Kit;
- componentes UI próprios.

Arquivos que Claude deve sempre inspecionar antes de criar uma nova linguagem visual:

- `src/index.css`
- `src/styles/brand-tokens.css`
- `tailwind.config.ts`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/dialog.tsx`
- componentes do layout/sidebar/header
- `docs/DESIGN_TOKENS.md`

## Observação importante sobre tokens existentes

O repositório possui documentação antiga referindo uma família visual “Orange Premium”, enquanto `src/styles/brand-tokens.css` já define aliases azuis:

```css
--brand-primary: 217 91% 60%;
--brand-primary-hover: 217 91% 66%;
--brand-primary-active: 217 91% 72%;
--brand-primary-glow: 217 91% 74%;
```

O `tailwind.config.ts` também declara:

```ts
brand-primary.DEFAULT
brand-primary.hover
brand-primary.active
brand-primary.glow
brand-primary.foreground
```

e comenta explicitamente:

> Use `brand-primary` em todo código novo.

Portanto:

### REGRA PARA NOVO REDESIGN

Use o **azul como identidade primária desta família de redesign**.

Não espalhe hexadecimais em JSX.

Prefira:

- `bg-brand-primary`
- `text-brand-primary`
- `border-brand-primary`
- `bg-brand-primary/10`
- `ring-brand-primary`
- aliases semânticos equivalentes.

Se for necessário ajustar o tom global do azul para ficar exatamente igual às referências, faça isso **uma única vez em token**, nunca em dezenas de componentes.

Não alterar tokens globais de produção sem verificar impacto nas telas existentes.

---

# 3. DNA VISUAL

A interface deve ser construída sobre cinco ideias:

## 3.1 Profundidade por superfícies, não por sombras exageradas

A hierarquia deve vir de:

- pequenas diferenças entre tons escuros;
- bordas discretas;
- spacing;
- agrupamento;
- contraste;
- raras sombras.

Não transformar cada container em uma caixa brilhante.

## 3.2 Azul reservado para intenção e estado

Azul significa:

- ação primária;
- item ativo;
- seleção;
- foco;
- link funcional;
- progresso;
- informação importante.

Azul NÃO deve ser usado como decoração em tudo.

## 3.3 Conteúdo domina a interface

Produtos, imagens, documentos, previews, tabelas e dados devem dominar a página.

O chrome da aplicação deve ser silencioso.

## 3.4 Densidade operacional

Telas usadas todos os dias devem mostrar bastante informação sem exigir scroll desnecessário.

## 3.5 Progressive disclosure

Ações raras e destrutivas ficam em:

- `...`;
- menus;
- drawers;
- accordions;
- detalhes avançados.

---

# 4. PALETA CANÔNICA BLUE PREMIUM

Os valores abaixo definem a intenção visual do design aprovado.

Quando o projeto possuir token semântico equivalente, usar o token do projeto.

## 4.1 Core

| Token conceitual | HEX alvo | Uso |
|---|---:|---|
| `pg-bg-0` | `#081019` | fundo global profundo |
| `pg-bg-1` | `#0A1118` | background principal |
| `pg-surface-1` | `#111A24` | cards e painéis |
| `pg-surface-2` | `#16212D` | controles / cartões internos |
| `pg-surface-3` | `#1B2937` | hover / elevated |
| `pg-elevated` | `#0D1722` | dialogs e overlays internos |
| `pg-text` | `#F5F8FC` | texto primário |
| `pg-text-secondary` | `#BBC5D2` | texto secundário |
| `pg-text-muted` | `#7F8B9B` | metadata |
| `pg-text-disabled` | `#566171` | disabled |
| `pg-blue` | `#0B6EFD` | accent primário visual |
| `pg-blue-hover` | `#2780FF` | hover |
| `pg-blue-active` | `#075CD6` | pressed |
| `pg-blue-soft` | `rgba(11,110,253,.12)` | selected/active background |
| `pg-blue-border` | `rgba(11,110,253,.45)` | selected border |
| `pg-success` | `#20D895` | publicado / concluído |
| `pg-warning` | `#F5B83B` | atenção |
| `pg-danger` | `#FF4D5E` | destrutivo |
| `pg-info` | `#45B8FF` | informativo |
| `pg-border` | `rgba(154,180,210,.15)` | borda default |
| `pg-border-hover` | `rgba(154,180,210,.28)` | hover |
| `pg-divider` | `rgba(154,180,210,.10)` | separadores |

## 4.2 Regra de tradução para o repositório

Preferência:

```tsx
bg-background
bg-card
bg-card-elevated
bg-surface
bg-surface-hover
text-foreground
text-muted-foreground
border-border
bg-brand-primary
text-brand-primary
border-brand-primary
bg-success
text-success
bg-warning
text-warning
bg-destructive
text-destructive
```

Se o resultado visual não corresponder ao mockup:

1. identificar o token;
2. identificar onde ele é definido;
3. propor ajuste centralizado;
4. NÃO aplicar `bg-[#0b6efd]` em componentes espalhados.

## 4.3 Alpha recomendada para azul

| Situação | Alpha |
|---|---:|
| background selecionado muito sutil | 5% |
| hover sutil | 8% |
| selected surface | 10–14% |
| border selected | 35–55% |
| focus ring | 55–80% |
| glow | 10–18% |

---

# 5. HIERARQUIA DE SUPERFÍCIES

No dark mode, não usar preto absoluto para tudo.

## Nível 0 — App background

`#081019` → `#0A1118`

Uso:

- plano geral;
- grandes vazios;
- fundo entre painéis.

## Nível 1 — Card / panel

`#111A24`

Uso:

- cards;
- KPIs;
- filtros;
- seções.

## Nível 2 — Nested surface

`#16212D`

Uso:

- itens de lista;
- selected rows;
- controles;
- toolbars.

## Nível 3 — Elevated

`#1B2937`

Uso:

- hover;
- menus;
- popovers;
- detalhes ativos.

## Regra

Evitar mais de 3 níveis simultaneamente dentro de uma mesma região.

---

# 6. BORDAS

Bordas são importantes no Blue Premium porque substituem parte das sombras.

## Default

```css
1px solid rgba(154,180,210,.15)
```

## Hover

```css
1px solid rgba(154,180,210,.28)
```

## Selected

```css
1px solid rgba(11,110,253,.50)
```

Pode receber ring externo sutil:

```css
0 0 0 1px rgba(11,110,253,.12)
```

## Danger

```css
rgba(255,77,94,.35)
```

## Evitar

- borda branca;
- `border-gray-500`;
- bordas azuis em todos os cards;
- 2px em todos os elementos.

---

# 7. BORDER RADIUS

A família aprovada usa radius moderado.

| Uso | Radius |
|---|---:|
| micro chip | 6px |
| badge | 9999px |
| input compacto | 8px |
| input padrão | 9–10px |
| button | 9–10px |
| menu item | 8px |
| card pequeno | 10–12px |
| card principal | 12–14px |
| panel/editor | 14–16px |
| dialog | 16–18px |
| avatar | full |

## Regra

Não usar 24–32px em cards operacionais.

O produto deve parecer preciso, não “fofinho”.

---

# 8. SOMBRAS E EFEITOS

## 8.1 Card default

Muito pouco shadow:

```css
0 1px 2px rgba(0,0,0,.18)
```

ou nenhum shadow quando borda já separa bem.

## 8.2 Card hover

```css
0 8px 22px rgba(0,0,0,.22)
```

## 8.3 Elevated / menu

```css
0 12px 32px rgba(0,0,0,.32)
```

## 8.4 Dialog

```css
0 24px 70px rgba(0,0,0,.52)
```

## 8.5 Selected glow

Somente em elementos realmente ativos:

```css
0 0 0 1px rgba(11,110,253,.30),
0 0 22px rgba(11,110,253,.12)
```

## Proibido

- neon constante;
- glow em todas as bordas;
- `shadow-2xl` em qualquer card comum;
- brilho pulsando sem propósito;
- box-shadow colorido forte em tabelas/listas.

---

# 9. BACKDROP / BLUR

## Header sticky

Pode usar:

```css
background: rgba(..., .88);
backdrop-filter: blur(12px);
```

## Dialog overlay

```css
background: rgba(0,0,0,.62);
backdrop-filter: blur(5px);
```

## Drawers

Overlay menos intenso:

```css
rgba(0,0,0,.48)
```

## Regra

Blur é ferramenta de contexto, não decoração.

Dropdown simples não deve desfocar a aplicação inteira.

---

# 10. TIPOGRAFIA

O projeto já possui tokens:

- `font-sans`
- `font-display`

Referência existente:

- `Plus Jakarta Sans` para corpo;
- `Outfit` para display.

Manter esses tokens como primeira escolha.

## 10.1 Escala desktop

| Papel | Tamanho | Peso | Line height |
|---|---:|---:|---:|
| Page H1 | 28–32px | 700 | 1.12 |
| Page subtitle | 13–14px | 400–500 | 1.45 |
| Section H2 | 18–20px | 700 | 1.25 |
| Panel title | 15–17px | 650–700 | 1.25 |
| Card title | 14–16px | 650–700 | 1.25 |
| Body | 13–14px | 400–500 | 1.45 |
| Label | 12–13px | 600 | 1.25 |
| Metadata | 11–12px | 400–500 | 1.35 |
| Microcopy | 10–11px | 500 | 1.2 |

## 10.2 Regras

- Título de página: `font-display font-bold`.
- Card title: não precisa sempre ser display.
- Evitar uppercase em frases.
- Uppercase apenas em agrupamentos pequenos / overlines.
- Tracking aumentado apenas em micro-labels.
- Não usar `text-[9px]` para informação necessária.
- Texto operacional deve ser legível em monitor 24".

---

# 11. SPACING SYSTEM

Escala base:

```text
4
6
8
10
12
16
20
24
32
40
48
```

## Uso recomendado

- icon + text: 6–8px
- controles em toolbar: 8–10px
- elementos internos de card: 8–12px
- card padding compacto: 12px
- card padding normal: 16px
- panel padding: 16–20px
- seção → seção: 20–24px
- page horizontal desktop: 24–32px

## Regra

Não usar `space-y-6` indiscriminadamente dentro de ferramentas densas.

---

# 12. LAYOUT GLOBAL DESKTOP

Referência prioritária:

**1920×1080 / navegador maximizado / sidebar visível.**

## Sidebar

Alvo visual:

- largura aproximada: 228–244px;
- superfície própria;
- border direita sutil;
- navegação densa;
- seções agrupadas.

## Header global

Alvo:

- 52–58px;
- pesquisa central;
- ações à direita;
- não crescer verticalmente.

## Page content

```text
max-width: 1920px
padding-x: 24–32px
padding-top: 20–28px
```

Não centralizar conteúdo em `max-w-7xl` quando a tarefa precisa aproveitar Full HD.

---

# 13. SIDEBAR

## Item default

- altura 34–38px;
- icon 16px;
- gap 10px;
- texto 12–13px;
- muted.

## Hover

```text
bg-brand-primary/5
text-foreground
```

## Active

- background azul 10–15%;
- icon azul;
- texto mais claro;
- pequena barra/indicator azul à esquerda.

## Section label

- 10–11px;
- uppercase;
- tracking moderado;
- muted;
- 20–24px antes do próximo grupo.

## Não fazer

- card grande em cada item;
- pills gigantes;
- gradient em item ativo;
- animação lateral excessiva.

---

# 14. PAGE HEADER

Estrutura padrão:

```text
[ícone contextual]  TÍTULO                           AÇÃO SECUNDÁRIA  AÇÃO PRIMÁRIA
                    descrição curta
```

## Ícone contextual

- container 38–44px;
- radius 10–12;
- azul soft;
- icon 20–22px.

## Ações

Uma ação primária por page header.

Exemplo:

`Explorar templates` → outline

`Nova revista` → primary

## Não fazer

- 5 CTAs azuis simultâneos;
- título de 48px;
- subtitle longo;
- hero de marketing em tela operacional.

---

# 15. KPI STRIP

Referência: tela principal Magazine aprovada.

Formato:

- 4–5 cards horizontais;
- altura 58–72px;
- icon à esquerda;
- valor grande;
- label pequena.

## Visual

Default:

```text
surface-1
border default
radius 12
```

Icon:

- fundo soft;
- 28–36px.

## Cor

Somente o significado importante recebe cor:

- total → azul;
- publicado → verde;
- arquivado → neutro;
- warning → amarelo.

Não colorir o card inteiro.

---

# 16. TOOLBAR DE FILTROS

A toolbar é uma das assinaturas da nova linguagem.

Estrutura:

```text
[Search...................] [Segmentos/Chips] [Sort ▼] [opções] [Grid/List]
```

## Search

- 38–42px;
- surface profunda;
- border sutil;
- icon 16;
- placeholder muted.

Focus:

- border azul;
- ring discreto.

## Segmented filters

Ativo:

```text
bg-brand-primary
text primary foreground
```

Inativo:

```text
bg-surface-2
border
text muted
```

## Density

Preferir uma linha no Full HD.

---

# 17. BUTTON SYSTEM

## 17.1 Primary

Uso:

- criar;
- continuar;
- publicar;
- confirmar ação principal;
- usar template.

Visual:

- azul sólido;
- texto branco/claro;
- radius 9–10;
- 40–44px.

Hover:

- azul ligeiramente mais luminoso;
- shadow muito sutil.

Pressed:

- azul mais profundo;
- translate máximo 1px.

## 17.2 Outline

Uso:

- preview;
- voltar;
- explorar;
- PDF quando secundário.

Visual:

- transparent/surface;
- border azul ou neutra conforme importância.

## 17.3 Ghost

Uso:

- ações contextuais;
- icon buttons;
- toolbar.

## 17.4 Danger

Não deixar vermelho permanentemente em toda tela.

Danger vive preferencialmente em menu contextual.

## 17.5 Icon button

- 36–40px;
- hit area mínima 40;
- tooltip quando significado não for óbvio.

---

# 18. INPUTS / SELECTS / TEXTAREAS

## Input

- altura: 38–42px;
- radius 8–10;
- background mais escuro que card;
- border default;
- padding x: 12;
- font 13px.

## Focus

```text
border-brand-primary
ring-2 ring-brand-primary/15
```

## Textarea

- min height 72px;
- resize vertical se apropriado.

## Select

Mesmo DNA do input.

## Label

- 12–13;
- semibold;
- margem inferior 6–8px.

## Helper text

- 10–11;
- muted;
- não competir com label.

---

# 19. CARDS

## Card operacional

```text
surface-1
border default
radius 12–14
padding 12–16
```

## Card de entidade com imagem

Estrutura:

```text
IMAGEM / PREVIEW
----------------
TÍTULO          STATUS
CLIENTE
metadata
----------------
ações
```

## Hover

- border aumenta discretamente;
- shadow leve;
- NÃO escalar o card inteiro além de 1.005.

## Selected

- border azul;
- ring sutil;
- check/indicator.

---

# 20. MAGAZINE CARD — PADRÃO APROVADO

A biblioteca Magazine é referência para cards de entidade.

## Desktop Full HD

- 4 colunas;
- 2 linhas visíveis;
- gap 14–18px.

## Preview

- largura total;
- imagem dominante;
- object-cover;
- ratio visual aproximado 16:9 / 2:1 conforme contexto.

## Metadata

- título: 14–16px;
- cliente: 11–12px;
- template + produtos: 11–12px;
- data / views: 10–11px.

## Status

Badge no canto superior da preview:

- publicada = success;
- rascunho = neutro;
- arquivada = muted.

## Ações

Botão principal específico:

- `Abrir revista`
- `Continuar edição`

Mais ações:

`...`

Nunca deixar `Excluir` vermelho exposto em todos os cards.

---

# 21. PRODUCT CARD

Referência: Editor Magazine — Produtos.

Estrutura:

```text
[imagem]
nome
SKU
preço   swatches   +
```

## Imagem

- fundo neutro;
- produto centralizado;
- `object-contain` quando catálogo exige fidelidade.

## Seleção

- check azul no topo;
- border azul;
- ring soft.

## Favorito

- coração ghost;
- não competir com seleção.

## Preço

Pode usar azul quando é informação funcional prioritária.

---

# 22. TEMPLATE CARD

Referência: Galeria de Templates aprovada.

Estrutura:

```text
PREVIEW REAL
nome              família
descrição
[densidade] [fonte] [paleta]
[Preview] [Usar template]
```

## Preview

Deve ser grande o suficiente para diferenciar layouts.

Não transformar A4 em thumbnail minúscula.

## Família

Badge neutro.

## Paleta

3–4 círculos de cor de 10–14px.

## CTA

`Usar template` primário.

`Preview` outline.

---

# 23. DIALOG / TEMPLATE INSPECTOR

Referência: preview do template aprovado.

## Desktop

```text
┌────────────────────────────────────────────────────┐
│ template info                          Usar        │
├───────────────┬────────────────────────────────────┤
│ METADATA      │              CANVAS                │
│ 300–360px     │               flex                 │
└───────────────┴────────────────────────────────────┘
```

## Dialog width

```text
min(1500px, calc(100vw - 64px))
```

## Height

Preferencialmente:

```text
max-height: calc(100vh - 48px)
```

sem depender de fixed height rígida.

## Left metadata

- descrição;
- formato;
- orientação;
- densidade;
- características;
- casos de uso;
- fontes;
- paleta.

## Canvas

- A4 centralizado;
- stage profundo;
- zoom;
- prev/next;
- fullscreen se funcionalmente disponível.

## Overlay

Escuro + blur moderado.

---

# 24. EDITOR / STUDIO SHELL

O editor não deve parecer formulário vertical.

Ele é um **workspace**.

## Header do editor

```text
[Título] [template chip] [trocar]        salvo  Preview  PDF  Publicar
```

## Stepper

Uma linha compacta.

## Workspace

A composição muda conforme a etapa.

Regra crítica:

> NÃO force a mesma grade em todas as etapas.

---

# 25. STEPPER

## Desktop

Altura total:

44–56px.

Estrutura:

```text
1 Identidade   2 Produtos   3 Conteúdo   4 Design   5 Layout & Gerar
```

## Active

- pill/segment azul;
- número em círculo;
- texto claro.

## Complete

- check ou número + estado discreto.

## Future

- muted.

## Interação

- keyboard;
- focus ring;
- aria-current;
- não esconder validação.

---

# 26. EDITOR — ETAPA IDENTIDADE

Referência aprovada:

```text
CONFIGURAÇÃO       PREVIEW A4         PÁGINAS
```

## Desktop largo

Exemplo de proporção:

```css
grid-template-columns:
  minmax(380px, 0.85fr)
  minmax(520px, 1.25fr)
  minmax(280px, 0.65fr);
```

Ajustar conforme shell real.

## Configuração

- título;
- subtítulo;
- cliente;
- branding;
- paleta.

## Preview

É a área dominante.

## Pages rail

- miniaturas;
- número;
- título;
- menu contextual;
- scroll próprio.

---

# 27. EDITOR — ETAPA PRODUTOS

Referência aprovada:

```text
CATÁLOGO DE PRODUTOS              NA REVISTA
```

O preview deixa de ser coluna permanente.

## Desktop

```text
main catalog: 70–75%
selected rail: 25–30%
```

## Catálogo

- search;
- filtros;
- sort;
- grid;
- seleção múltipla.

## “Na revista”

- template;
- contagem;
- páginas estimadas;
- lista dos produtos;
- remover;
- troca de variação;
- feedback final.

## Preview

Abrir por botão/drawer quando necessário.

---

# 28. EDITOR — ETAPA CONTEÚDO

Padrão recomendado:

- seções compactas;
- cards ou rows de toggle;
- 2 colunas em desktop;
- preview quando alterar conteúdo impacta página.

Toggles não precisam virar cards gigantes.

---

# 29. EDITOR — ETAPA DESIGN

Mostrar:

1. template atual;
2. categoria semântica;
3. paleta / branding relacionado;
4. sugestões compactas;
5. CTA para galeria completa.

Não duplicar uma galeria de 12 cards inteira dentro do editor.

---

# 30. EDITOR — ETAPA LAYOUT & GERAR

Prioridades:

1. ordenar;
2. visualizar impacto;
3. navegar entre páginas;
4. publicar/gerar.

Composição ideal em desktop:

```text
LISTA ORDENÁVEL   PREVIEW   PÁGINAS
```

DnD:

- hover claro;
- handle explícito;
- acessibilidade alternativa;
- item destacado sincronizado com preview.

---

# 31. PAGE RAIL

## Width

280–340px em widescreen.

## Item

- thumb 72–110px;
- número;
- título;
- drag handle se aplicável;
- `...`.

## Active

- blue soft background;
- border azul.

## Scroll

Interno.

Não fazer a página inteira crescer infinitamente por causa das thumbs.

---

# 32. TABS

Tabs principais:

- superfície própria;
- ativo azul;
- inativo neutro;
- 36–40px.

Evitar linha de underline minúscula como único sinal de estado quando a tela é densa.

---

# 33. BADGES / STATUS

## Draft

Neutral:

```text
bg-muted
text-muted-foreground
```

## Published

Success:

```text
bg-success/15
text-success
border-success/25
```

## Archived

Muted / gray.

## Warning

Amarelo apenas se exige atenção.

## Danger

Vermelho apenas para erro/destruição.

---

# 34. DROPDOWNS E CONTEXT MENUS

- elevated surface;
- 8–10 radius;
- 8px padding;
- menu item 34–38px;
- icon 15–16px;
- danger item vermelho apenas dentro do menu;
- shadow elevated.

Não usar blur global para um dropdown simples.

---

# 35. EMPTY STATES

Um empty state deve responder:

1. por que está vazio?
2. o que fazer agora?

Formato:

- icon pequeno;
- título 15–18;
- texto 12–13;
- 1 CTA.

Evitar:

- ilustração enorme;
- 200px de padding;
- repetir um wizard dentro do empty state.

---

# 36. SKELETON / LOADING

Skeleton deve reproduzir aproximadamente a geometria final.

## Cards

- thumb skeleton;
- 2 linhas;
- metadata.

## Grid

Renderizar quantidade suficiente para preservar layout.

## Editor

Não bloquear toda aplicação por carregamento de uma seção pequena.

---

# 37. FEEDBACK

## Saving

`Salvando…`

## Saved

`Salvo` ou `Salvo automaticamente`

Pode usar icon success discreto.

## Error

Explicar:

- o que aconteceu;
- como tentar novamente.

## Toast

Curto.

Nunca usar toast como único feedback de uma mudança persistente crítica.

---

# 38. MICROINTERAÇÕES

## Durações

| Tipo | Duração |
|---|---:|
| hover simples | 120–160ms |
| button | 140–180ms |
| dropdown | 160–200ms |
| card hover | 160–220ms |
| drawer | 200–260ms |
| dialog | 180–240ms |
| skeleton | contínuo, sutil |

## Easing

Preferir:

```css
cubic-bezier(.2,.8,.2,1)
```

## Regras

- nenhuma animação decorativa permanente;
- motion deve comunicar mudança;
- `prefers-reduced-motion` respeitado.

---

# 39. ICONOGRAFIA

Biblioteca padrão:

Lucide.

## Tamanhos

- nav: 16px;
- input: 15–16px;
- button: 16px;
- page header icon: 20–22px;
- empty state: 28–36px.

## Stroke

Usar default do Lucide.

Não misturar estilos de ícones.

## Icon-only

Sempre:

- `aria-label`;
- tooltip quando necessário.

---

# 40. IMAGENS

## Product imagery

- object-contain quando fidelidade do produto importa;
- fundo claro/neutro;
- não cortar produto.

## Magazine cover / hero

- object-cover;
- focal point controlado;
- overlay apenas se necessário.

## Card images

usar `loading="lazy"` quando fora da primeira dobra.

---

# 41. SCROLL

## Princípio

Evitar múltiplos scrolls verticais sem necessidade.

Mas em workspaces é aceitável:

- main canvas;
- rail;
- lista selecionada;

desde que cada scroll tenha função clara.

## Scrollbar

Fina, discreta.

Não esconder scrollbar se o conteúdo depende dela.

---

# 42. RESPONSIVIDADE

## ≥ 1680

Widescreen completo.

- 4 cards na biblioteca;
- editor em 3 painéis quando necessário;
- toolbars em 1 linha.

## 1440–1679

- manter densidade;
- reduzir gaps;
- page rail mais estreito;
- evitar quebrar toolbar.

## 1280–1439

- cards 3 colunas quando necessário;
- rail pode virar drawer;
- manter canvas prioritário.

## 1024–1279

- 2 colunas;
- preview por drawer;
- sidebar pode colapsar conforme shell atual.

## 768–1023

- 2/1 colunas;
- toolbar quebra com intenção;
- stepper scrollável.

## Mobile

- 1 coluna;
- cards full width;
- page actions compactas;
- drawer para preview;
- bottom CTA quando melhora fluxo;
- hit areas ≥ 44px.

---

# 43. FULL HD É VIEWPORT DE PRIMEIRA CLASSE

O produto é usado em monitores de aproximadamente 24" Full HD.

Portanto:

- não desenhar só para laptop 1366;
- não usar max-width pequeno demais;
- aproveitar horizontal;
- reduzir scroll vertical;
- manter informação crítica acima da dobra.

Em 1920×1080:

- títulos e filtros devem ficar visíveis;
- primeira linha completa de conteúdo deve aparecer;
- idealmente segunda linha parcial ou completa conforme a tela.

---

# 44. TABELAS

Quando o conteúdo é comparativo, não force cards.

## Padrão

- header sticky;
- row 42–48px;
- border bottom hairline;
- hover surface;
- selected blue soft;
- text 12–13;
- metadata 11.

## Actions

`...` no fim.

Ações frequentes podem ficar inline.

---

# 45. FORMULÁRIOS

## Agrupamento

Agrupar por objetivo, não por tipo técnico.

Ruim:

```text
Card do input
Card do select
Card do toggle
```

Bom:

```text
IDENTIDADE
título
subtítulo
cliente
```

## Advanced

Campos raros em accordion/details.

---

# 46. ACESSIBILIDADE

Obrigatório:

- WCAG AA;
- focus visible;
- teclado;
- aria labels;
- aria current;
- touch targets;
- mensagens anunciadas;
- status não só por cor;
- contraste;
- alt adequado.

## Focus

Padrão:

```text
ring-2 ring-brand-primary/60
ring-offset-2
ring-offset-background
```

Ajustar ao componente.

---

# 47. DENSIDADE E “ANTI-BLOAT”

Antes de adicionar um elemento, Claude deve perguntar:

> Esse elemento precisa ficar permanentemente visível?

Se não:

- menu;
- accordion;
- drawer;
- tooltip;
- contextual.

## Sinais de bloat

- card dentro de card dentro de card;
- 5 bordas aninhadas;
- 3 headers antes do conteúdo;
- 2 toolbars redundantes;
- ação duplicada em header e footer;
- textões explicativos em telas experientes.

---

# 48. PÁGINA OPERACIONAL VS LANDING PAGE

Páginas operacionais:

- densas;
- previsíveis;
- rápidas;
- orientadas a tarefa.

Não usar:

- hero enorme;
- marketing copy longo;
- ilustrações decorativas;
- parallax;
- gradients grandes;
- cards com 40px de padding.

---

# 49. REGRAS DE CÓDIGO PARA CLAUDE

## 49.1 Reutilizar antes de criar

Antes de criar:

- Button;
- Card;
- Badge;
- Input;
- Select;
- Tabs;
- Dialog;
- Sheet;
- ScrollArea;
- Tooltip;

inspecionar a versão existente.

## 49.2 Não duplicar design system

Não criar:

`BlueButton.tsx`
`MagazineCardNew.tsx`
`CoolDarkPanel.tsx`

se a estrutura puder ser obtida via variantes dos componentes existentes.

## 49.3 Sem magic numbers espalhados

Valores especiais devem:

- virar token;
- constante;
- variante;
- utilitário compartilhado;

quando recorrentes.

## 49.4 Sem `!important`

Usar apenas quando tecnicamente inevitável e documentado.

## 49.5 Sem CSS screenshot-hack

Não posicionar toda a tela com absolute para “bater” com mockup.

---

# 50. POLÍTICA DE CORES LITERAIS

## Em JSX/TSX

Evitar:

```tsx
bg-[#0b6efd]
text-[#f5f8fc]
border-[#223344]
```

Preferir token.

## Exceções

Literal pode existir quando representa DADO:

- cor real de produto;
- paleta escolhida pelo cliente;
- cor de template;
- swatch;
- conteúdo gerado.

Design UI não.

---

# 51. SEMÂNTICA DE AÇÕES

## Primary

A ação que conclui ou avança.

## Secondary

Ação útil, não principal.

## Ghost

Contextual.

## Danger

Destrutiva.

## Link

Navegação.

Uma tela normalmente deve ter apenas um CTA visualmente dominante por região.

---

# 52. PUBLISH / SAVE / STATE

Em editores:

- autosave = estado discreto;
- não criar botão Save se autosave já é a regra;
- Publish = CTA global importante;
- PDF = secundário;
- Preview = secundário.

---

# 53. DESIGN REVIEW CHECKLIST

Antes de considerar uma tela pronta, Claude deve responder SIM para:

### Hierarquia

- A tarefa principal está óbvia?
- Existe um único foco primário?
- Títulos não competem com ações?

### Densidade

- Full HD é bem aproveitado?
- Há espaço vazio sem função?
- Existe scroll evitável?

### Consistência

- radius segue escala?
- spacing segue escala?
- azul tem significado?
- ícones são Lucide?
- tipografia segue tokens?

### Estados

- hover?
- focus?
- active?
- selected?
- disabled?
- loading?
- empty?
- error?
- success?

### A11y

- keyboard?
- focus?
- aria?
- contraste?
- touch area?

### Funcional

- tudo que existia continua funcionando?

---

# 54. DESIGN QA VISUAL

Comparar sempre:

1. screenshot original;
2. redesign aprovado;
3. implementação.

Verificar:

- largura;
- altura;
- proporção;
- gaps;
- padding;
- alinhamento;
- border;
- radius;
- fontes;
- pesos;
- icon size;
- densidade;
- número de elementos acima da dobra.

Não aceitar:

> “Está parecido.”

A implementação deve preservar a intenção visual.

---

# 55. DESIGN QA TÉCNICO

Após implementar:

- TypeScript;
- lint;
- testes do módulo;
- build;
- console;
- network errors;
- layout em resoluções definidas;
- keyboard;
- dark mode.

Não atualizar baselines para esconder regressão.

---

# 56. PROTOCOLO DE IMPLEMENTAÇÃO DO CLAUDE

Claude deve executar nesta ordem:

## Fase A — Recon

1. identificar rota;
2. arquivo principal;
3. subcomponentes;
4. hooks;
5. serviço;
6. estado;
7. testes;
8. tokens usados;
9. componentes reutilizados;
10. responsividade atual.

## Fase B — Plano

Listar:

- arquivos a alterar;
- arquivos que NÃO serão alterados;
- funcionalidades protegidas;
- componentes reutilizáveis;
- riscos.

## Fase C — Estrutura

Implementar:

- shell;
- grid;
- hierarquia;
- sizing.

Ainda sem polimento exagerado.

## Fase D — Componentes

Aplicar:

- cards;
- controls;
- states.

## Fase E — Responsive

Testar:

- 1920;
- 1600;
- 1440;
- 1366;
- 1024;
- mobile.

## Fase F — Polimento

- shadows;
- hover;
- focus;
- microinteraction.

## Fase G — QA

- funcional;
- visual;
- técnico.

---

# 57. RESTRIÇÕES ABSOLUTAS

Em tarefa de redesign visual, Claude NÃO deve modificar sem autorização:

- migrations;
- schema;
- banco;
- RLS;
- policies;
- triggers;
- auth;
- credentials;
- APIs;
- integrações;
- regras de negócio;
- deploy;
- infraestrutura.

Se achar necessário:

PARAR e reportar.

---

# 58. PADRÕES PROIBIDOS

Não usar:

- glassmorphism em massa;
- glow azul em tudo;
- gradients em qualquer card;
- preto absoluto em todas as superfícies;
- 24px+ radius em controles operacionais;
- sombras gigantes;
- texto cinza de baixo contraste;
- fonte menor que 10px para informação real;
- cards gigantes com pouco conteúdo;
- menus com 70px por item;
- modais estreitos em desktop wide quando o conteúdo é visual;
- layout 50/50 por hábito;
- skeleton genérico sem geometria;
- animações lentas;
- cards como solução universal.

---

# 59. PADRÕES ASSINATURA DO BLUE PREMIUM

Se uma tela não se parece com as referências aprovadas, conferir se possui:

1. background profundo azul-preto;
2. surface hierarchy clara;
3. border fina azul-cinza;
4. primary azul vivo;
5. typography branca limpa;
6. metadata azul-cinza;
7. cards compactos;
8. toolbar em uma linha;
9. selecionado com soft blue;
10. success verde usado com moderação;
11. imagens grandes e úteis;
12. CTAs azuis controlados;
13. menus contextuais;
14. pouco glow;
15. radius moderado;
16. excelente uso de largura.

---

# 60. MATRIZ DE COMPONENTES

| Componente | Radius | Altura | Surface | Border | Estado ativo |
|---|---:|---:|---|---|---|
| Button primary | 9–10 | 40–44 | blue | blue | lighter/active blue |
| Button small | 8 | 32–36 | semantic | semantic | hover |
| Input | 8–10 | 38–42 | bg deep | default | blue focus |
| Select | 8–10 | 38–42 | bg deep | default | blue focus |
| Filter pill | full | 28–34 | surface-2 | default | blue solid |
| Badge | full | 22–26 | semantic soft | semantic | — |
| Card | 12–14 | auto | surface-1 | default | hover border |
| Panel | 14–16 | auto | surface-1 | default | — |
| Dialog | 16–18 | auto | elevated | default | — |
| Nav item | 8–10 | 34–38 | transparent | none | blue soft |
| Row | 8–10 | 42–56 | surface/transparent | divider | blue soft |
| KPI | 12 | 58–72 | surface-1 | default | — |

---

# 61. EXEMPLOS TAILWIND DE REFERÊNCIA

Estes exemplos ilustram a intenção. Claude deve adaptar aos componentes existentes.

## Panel

```tsx
className="
  rounded-xl
  border border-border/70
  bg-card
  shadow-sm
"
```

## Selected panel

```tsx
className="
  rounded-xl
  border border-brand-primary/50
  bg-brand-primary/10
  ring-1 ring-brand-primary/10
"
```

## Input

```tsx
className="
  h-10 rounded-lg
  border-border/70
  bg-background/70
  text-foreground
  placeholder:text-muted-foreground
  focus-visible:border-brand-primary
  focus-visible:ring-2
  focus-visible:ring-brand-primary/15
"
```

## Primary CTA

```tsx
className="
  bg-brand-primary
  text-white
  hover:bg-brand-primary-hover
  active:bg-brand-primary-active
"
```

Se `text-white` for proibido pelo token policy efetivo do projeto, usar o foreground semântico correspondente.

## Interactive card

```tsx
className="
  border border-border/70
  bg-card
  transition-[border-color,box-shadow,transform]
  duration-150
  hover:border-border
  hover:shadow-md
"
```

---

# 62. CONFLITO COM TOKENS ANTIGOS — COMO PROCEDER

Existe documentação antiga do sistema apontando “Orange Premium”.

Este novo manual estabelece uma **direção visual Blue Premium aprovada**.

Claude NÃO deve:

- trocar globalmente todos os tokens em uma tarefa pequena;
- quebrar telas antigas;
- misturar laranja e azul sem critério.

Claude deve:

1. verificar quais aliases azuis já existem;
2. usar `brand-primary` em novo código;
3. manter semantic colors;
4. aplicar Blue Premium no escopo redesenhado;
5. registrar se existir conflito visual real entre `primary` e `brand-primary`.

Quando o projeto migrar globalmente para Blue Premium, a mudança deve ser feita por tokens e Design System, não por busca/substituição em milhares de classes.

---

# 63. REFERÊNCIAS VISUAIS APROVADAS — O QUE COPIAR DE CADA UMA

## A. Magazine Library

Copiar:

- page header;
- KPI strip;
- filtros;
- 4-column cards;
- cards com capa;
- status overlay;
- ações contextuais;
- densidade.

## B. Templates Gallery

Copiar:

- catálogo de templates;
- filtros de família;
- filtro de densidade;
- duas linhas visíveis;
- preview dominante no card;
- CTA duplo.

## C. Template Inspector

Copiar:

- dialog muito largo;
- metadata à esquerda;
- preview A4 central;
- controles de zoom;
- CTA no header;
- overlay escuro.

## D. Editor Identity

Copiar:

- studio header;
- stepper;
- 3-pane layout;
- preview central dominante;
- page rail.

## E. Editor Products

Copiar:

- layout adaptado à tarefa;
- catálogo amplo;
- side rail “Na revista”;
- cards de produto;
- seleção múltipla;
- preview contextual em vez de coluna permanente.

---

# 64. REGRA FINAL PARA QUALQUER NOVA TELA

Quando Claude receber uma screenshot e este manual:

1. entender a tarefa real da tela;
2. não copiar superficialmente outra tela;
3. usar o Blue Premium como linguagem;
4. reorganizar de acordo com a tarefa;
5. preservar a identidade global;
6. usar a largura;
7. manter densidade;
8. evitar bloat;
9. proteger funções existentes;
10. realizar QA.

A tela deve parecer da mesma família.

Não precisa ter exatamente a mesma composição.

---

# 65. CRITÉRIO DE SUCESSO

O redesign está correto quando alguém consegue navegar entre:

- Magazine;
- Templates;
- Preview;
- Editor;
- Produtos;
- outras subtelas futuras;

e perceber imediatamente:

> “É o mesmo produto, o mesmo Design System e a mesma qualidade.”

Sem que todas as telas pareçam cópias umas das outras.

---

# 66. PROMPT CURTO PARA USAR JUNTO COM ESTE MANUAL

Use este bloco no início de toda tarefa de redesign para Claude:

```text
Antes de alterar código, leia integralmente o arquivo
PROMO_GIFTS_V4_BLUE_PREMIUM_DESIGN_SYSTEM.md.

Ele é a referência visual e de UX para esta tarefa.

Analise também a screenshot ORIGINAL da tela e a screenshot de REDESIGN APROVADA.

Regras:

1. O código existente define funcionalidade.
2. A imagem aprovada define intenção visual.
3. O Design System define consistência.
4. Preserve todas as funções existentes salvo remoção explicitamente autorizada.
5. Não hardcode dados do mockup.
6. Não alterar banco/schema/RLS/APIs/auth/migrations/integrações em tarefa visual.
7. Reutilize os componentes existentes.
8. Use tokens semânticos e `brand-primary`; não espalhe cores literais.
9. Priorize Full HD wide, sem abandonar responsividade.
10. Após implementar, execute Design QA comparando:
   ORIGINAL vs REDESIGN vs IMPLEMENTAÇÃO.

Antes de codificar, entregue um recon curto:
- arquivo da página;
- componentes;
- hooks;
- dados;
- funcionalidades protegidas;
- arquivos que pretende alterar.

Somente então implemente.
```

---

# 67. MANTRA DO SISTEMA

> **Premium sem excesso.**
>
> **Denso sem apertar.**
>
> **Escuro sem perder contraste.**
>
> **Azul para intenção, não decoração.**
>
> **Conteúdo primeiro.**
>
> **Função preservada.**
>
> **Design consistente.**

