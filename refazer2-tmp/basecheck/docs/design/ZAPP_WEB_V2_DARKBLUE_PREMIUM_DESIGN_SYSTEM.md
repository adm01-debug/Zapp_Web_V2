# ZAPP WEB V2 — DARKBLUE PREMIUM DESIGN SYSTEM
## Manual de Design, UX/UI, Interação e Implementação para Claude
### Versão 1.0 — 07/09/2026
### Linguagem oficial: **ZAPP DARKBLUE PREMIUM / CONVERSATION OPS**

---

# 0. PROPÓSITO DESTE DOCUMENTO

Este documento é o **manual operacional de Design System** do ZAPP WEB V2.

Ele foi estruturado no mesmo nível de detalhe e no mesmo formato de governança utilizado no projeto de referência **PROMO GIFTS BLUE PREMIUM / BLUE OPS**, porém adaptado para:

- o produto ZAPP;
- o módulo Chat / Inbox como referência principal;
- a identidade DarkBlue aprovada;
- o uso operacional intensivo;
- monitores Full HD de 24";
- a stack real React/TypeScript/Tailwind/Radix/Framer Motion;
- a densidade de uma plataforma omnichannel e CRM;
- a necessidade de manter todas as subtelas visualmente pertencentes ao mesmo produto.

Este manual deve orientar qualquer agente de implementação, incluindo Claude, Codex, Cline, Hermes ou desenvolvedor humano, ao criar ou refatorar:

- Chat;
- Inbox;
- CRM 360°;
- Contatos;
- Dashboard;
- Pipeline;
- Equipe;
- Email;
- Campanhas;
- Analytics;
- Configurações;
- drawers;
- modais;
- popovers;
- tabelas;
- cards;
- formulários;
- dashboards;
- galerias;
- listas;
- ferramentas de IA;
- estados de sistema.

O objetivo não é copiar pixels cegamente.

O objetivo é reproduzir uma linguagem visual e de UX **coerente, governada, implementável e escalável**.

Nome interno recomendado:

> **ZAPP DARKBLUE PREMIUM / CONVERSATION OPS**

O resultado deve parecer:

- software SaaS B2B profissional;
- dark navy sofisticado;
- operacional e denso;
- premium sem exagero;
- moderno sem parecer landing page;
- rápido;
- previsível;
- claro;
- consistente em Full HD;
- orientado a atendimento e resultados;
- desenvolvido como produto, não como showcase de componentes.

---

# 1. REGRA DE FONTE DA VERDADE

Ao implementar qualquer tela:

## Fonte funcional

O **código existente** define o que a tela faz.

## Fonte de dados

Os **dados reais** definem o conteúdo.

## Fonte visual

A **imagem aprovada** define a intenção visual, proporções, densidade, hierarquia e composição.

## Fonte sistêmica

Este Design System define:

- cores;
- tipografia;
- espaçamentos;
- superfícies;
- bordas;
- radius;
- sombras;
- iconografia;
- motion;
- estados;
- componentes;
- comportamento;
- acessibilidade;
- responsividade;
- densidade;
- regras de implementação;
- QA.

## Ordem de prioridade

1. Funcionalidade real existente.
2. Segurança, permissões e regras de negócio.
3. Dados reais.
4. Design aprovado.
5. Este Design System.
6. Padrões consolidados de componentes.
7. Boas práticas de UX/UI.
8. Preferências locais de implementação.

### Regras absolutas

- Nunca remover funcionalidade apenas porque ela não aparece no mockup.
- Nunca hardcodar dados fictícios do mockup.
- Nunca quebrar uma integração para reproduzir layout.
- Nunca alterar backend em tarefa visual sem autorização.
- Nunca criar uma segunda biblioteca de UI desnecessária.

---

# 2. CONTEXTO TÉCNICO DO ZAPP WEB V2

Projeto:

`adm01-debug/Zapp_Web_V2`

Stack relevante:

- React 19;
- TypeScript;
- Vite;
- Tailwind CSS;
- Radix UI;
- componentes shadcn-style;
- Lucide React;
- Framer Motion;
- TanStack React Query;
- TanStack React Virtual;
- Recharts;
- Supabase;
- Sonner;
- React Hook Form;
- Zod;
- Playwright;
- Vitest.

Arquivos que devem ser inspecionados antes de qualquer alteração global de linguagem visual:

- `src/index.css`
- `src/styles/tokens.css`
- `tailwind.config.ts`
- `components.json`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/motion/*`
- shell global;
- Sidebar;
- AppShell;
- layouts do módulo afetado.

## 2.1 Fontes existentes

O projeto já carrega:

- `Outfit`
- `Plus Jakarta Sans`

Portanto, não adicionar nova fonte sem justificativa real.

## 2.2 Motion existente

O projeto já utiliza Framer Motion.

Não instalar React Spring ou Motion One apenas para o redesign.

## 2.3 Tokens existentes

O repositório já possui CSS variables e escalas.

Este manual define a direção canônica **DarkBlue Premium**.

Quando existir token equivalente:

- reutilizar;
- alinhar centralmente;
- evitar hex literal em JSX.

---

# 3. DNA VISUAL — DARKBLUE PREMIUM

A interface deve ser construída sobre sete ideias.

## 3.1 DarkBlue profundo, não preto absoluto

O produto deve ser percebido como navy/dark blue.

A hierarquia nasce de pequenas diferenças entre azuis muito escuros.

Não usar `#000000` como plano dominante.

## 3.2 Azul vivo representa intenção

Azul significa:

- ação;
- seleção;
- active state;
- foco;
- link;
- progresso;
- informação principal.

Azul não significa “decorar tudo”.

## 3.3 Conteúdo domina o chrome

Mensagens, contatos, tarefas, dados, mídia, CRM e decisões devem dominar a interface.

O chrome do sistema deve ser silencioso.

## 3.4 Densidade operacional

A interface é usada durante horas.

Ela deve mostrar bastante informação sem ficar apertada.

## 3.5 Progressive disclosure

Ações raras ficam em:

- `...`;
- menus;
- drawers;
- accordions;
- abas contextuais;
- popovers.

## 3.6 Frame estável

Subtelas não podem parecer sistemas diferentes.

Chat → CRM → Tarefas → Notas → Arquivos → Histórico → IA devem preservar o mesmo shell.

## 3.7 Movimento funcional

Motion comunica:

- entrada;
- estado;
- seleção;
- feedback;
- transição de contexto.

Não comunica “efeito bonito”.

---

# 4. PALETA CANÔNICA DARKBLUE PREMIUM

## 4.1 Core palette

| Token conceitual | HEX alvo | Uso |
|---|---:|---|
| `zapp-bg-0` | `#060C14` | plano mais profundo |
| `zapp-bg-1` | `#08111C` | background principal |
| `zapp-bg-2` | `#0A1522` | áreas fixas |
| `zapp-surface-1` | `#0D1927` | cards e painéis |
| `zapp-surface-2` | `#122235` | controles e nested surfaces |
| `zapp-surface-3` | `#182C42` | hover / elevated |
| `zapp-elevated` | `#0B1623` | modais, menus, overlays |
| `zapp-text` | `#F5F8FC` | texto primário |
| `zapp-text-secondary` | `#C0CBD8` | texto secundário |
| `zapp-text-muted` | `#8291A5` | metadata |
| `zapp-text-disabled` | `#566578` | disabled |
| `zapp-blue` | `#1677FF` | primary |
| `zapp-blue-hover` | `#2C86FF` | primary hover |
| `zapp-blue-active` | `#0D5ED7` | pressed |
| `zapp-blue-soft` | `rgba(22,119,255,.12)` | selected surface |
| `zapp-blue-border` | `rgba(22,119,255,.48)` | selected border |
| `zapp-success` | `#21D19F` | success / online |
| `zapp-warning` | `#F6B73C` | attention |
| `zapp-danger` | `#FF5D6C` | errors / SLA / destructive |
| `zapp-info` | `#45B8FF` | information |
| `zapp-ai` | `#8B5CF6` | AI context |
| `zapp-border` | `rgba(134,165,200,.16)` | border default |
| `zapp-border-hover` | `rgba(134,165,200,.28)` | hover |
| `zapp-divider` | `rgba(134,165,200,.10)` | separators |

## 4.2 Primary usage

Use o azul vivo somente em:

- CTA principal;
- tab ativa;
- conversa selecionada;
- link funcional;
- foco;
- progress;
- informação crítica não semântica.

## 4.3 Alpha recomendada

| Situação | Alpha |
|---|---:|
| hover sutil | 5–8% |
| selected background | 10–14% |
| contextual highlight | 8–12% |
| selected border | 35–55% |
| focus ring | 55–80% |
| glow excepcional | 8–14% |

## 4.4 Semantic usage

### Verde

- online;
- concluído;
- aprovado;
- entregue;
- dentro do SLA.

### Amarelo

- VIP;
- atenção;
- deadline próximo;
- pending relevante.

### Vermelho

- SLA violado;
- erro;
- atrasado;
- bloqueio;
- destructive.

### Roxo

- IA;
- automação inteligente;
- recomendação gerada por modelo.

Roxo nunca deve substituir o azul como primary do produto.

---

# 5. HIERARQUIA DE SUPERFÍCIES

## Nível 0 — App background

`#060C14`

Uso:

- fundo global;
- áreas sem container;
- canvas profundo.

## Nível 1 — Main background

`#08111C`

Uso:

- workspace;
- canvas de chat;
- page body.

## Nível 2 — Panel

`#0D1927`

Uso:

- cards;
- sidebar;
- contact panel;
- toolbars.

## Nível 3 — Nested

`#122235`

Uso:

- rows;
- nested cards;
- controls;
- selected groups.

## Nível 4 — Hover / Elevated

`#182C42`

Uso:

- hover;
- menu item ativo;
- popovers;
- highlights.

### Regra

Não exibir mais de três níveis de superfície simultaneamente dentro do mesmo card.

---

# 6. BORDAS

Bordas fazem o papel que sombras exageradas fariam em outro estilo.

## Default

```css
1px solid rgba(134,165,200,.16)
```

## Hover

```css
1px solid rgba(134,165,200,.28)
```

## Selected

```css
1px solid rgba(22,119,255,.48)
```

## Focus

```css
0 0 0 2px rgba(22,119,255,.30)
```

## Danger

```css
rgba(255,93,108,.38)
```

## Regra

Não usar:

- borda branca;
- border-gray hardcoded;
- azul em todos os cards;
- 2px em toda superfície;
- múltiplas bordas aninhadas sem função.

---

# 7. BORDER RADIUS

| Uso | Radius |
|---|---:|
| micro chip | 5–6px |
| badge | 9999px |
| input compacto | 8px |
| input padrão | 9–10px |
| button | 9–10px |
| menu item | 8px |
| conversa row | 10px |
| card pequeno | 10–12px |
| card principal | 12–14px |
| panel | 12–14px |
| dialog | 16–18px |
| avatar | full |

### Regra

Não usar 24–32px em software operacional.

---

# 8. SOMBRAS E EFEITOS

## 8.1 Default

```css
0 1px 2px rgba(0,0,0,.25)
```

ou nenhuma sombra.

## 8.2 Card hover

```css
0 8px 22px rgba(0,0,0,.22)
```

## 8.3 Popover

```css
0 14px 38px rgba(0,0,0,.40)
```

## 8.4 Dialog

```css
0 24px 70px rgba(0,0,0,.55)
```

## 8.5 Selected glow

Excepcional:

```css
0 0 0 1px rgba(22,119,255,.24),
0 0 18px rgba(22,119,255,.08)
```

### Proibido

- neon permanente;
- glow em todos os cards;
- shadow 2xl em row comum;
- brilho pulsante;
- borda + glow + gradient simultaneamente sem função.

---

# 9. BACKDROP E BLUR

## Header sticky

Pode usar:

```css
background: rgba(8,17,28,.88);
backdrop-filter: blur(12px);
```

## Dialog overlay

```css
background: rgba(1,5,10,.66);
backdrop-filter: blur(5px);
```

## Drawer

```css
background: rgba(1,5,10,.50);
```

Blur é contexto, não decoração.

---

# 10. TIPOGRAFIA

## 10.1 Fonte principal

`Outfit`

Uso:

- interface operacional;
- cards;
- menus;
- chat;
- labels;
- tabela;
- forms.

## 10.2 Display

`Plus Jakarta Sans`

Uso:

- page title;
- grandes KPIs;
- destaques específicos.

## 10.3 Escala desktop

| Papel | Tamanho | Peso | Line height |
|---|---:|---:|---:|
| Page H1 | 26–30px | 700 | 1.15 |
| Page subtitle | 13–14px | 400–500 | 1.45 |
| Section H2 | 18–20px | 600–700 | 1.25 |
| Panel title | 15–17px | 600–700 | 1.25 |
| Card title | 14–16px | 600 | 1.25 |
| Body | 13–14px | 400–500 | 1.45 |
| Label | 12–13px | 500–600 | 1.3 |
| Metadata | 11–12px | 400–500 | 1.35 |
| Badge | 10–11px | 500–600 | 1.2 |
| Microcopy | 10–11px | 400–500 | 1.3 |

### Regras

- não usar 9px para informação operacional;
- uppercase apenas para overlines;
- metadata não pode perder contraste;
- títulos não devem dominar ação.

---

# 11. SPACING SYSTEM

Escala canônica:

```text
2
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

Uso recomendado:

- icon + text: 6–8px;
- toolbar controls: 8px;
- row inner: 8–12px;
- card compact: 12px;
- card normal: 16px;
- panel: 16–20px;
- section gap: 20–24px;
- page horizontal Full HD: 20–28px.

Evitar:

- gaps aleatórios;
- `space-y-6` em toda árvore;
- 32px em nested cards.

---

# 12. LAYOUT GLOBAL — FULL HD FIRST

Viewport de referência:

`1920×1080`

Browser:

100%.

## 12.1 Shell operacional

ZAPP deve aproveitar largura.

Não usar `max-w-7xl` em módulos que dependem de espaço horizontal.

## 12.2 Sidebar

Full:

206–230px.

Collapsed:

60–64px.

## 12.3 Topbar

50–56px.

## 12.4 Page gutter

20–28px.

## 12.5 Regra

O sistema deve parecer desenhado para monitor de 24" e não ampliado a partir de laptop.

---

# 13. SIDEBAR GLOBAL

## Item

- 36–40px;
- icon 16–18px;
- gap 10px;
- text 12–13px.

## Hover

```text
background azul 5%
foreground
```

## Active

- blue soft;
- primary icon;
- primary left marker 2–3px;
- text clear.

## Section label

- 10–11px;
- uppercase;
- muted;
- tracking moderado.

---

# 14. PAGE HEADER

Estrutura:

```text
[ícone] TÍTULO                                 [ações secundárias] [CTA]
        descrição
```

Ícone contextual:

38–42px.

Uma ação primária dominante por região.

Não criar hero.

---

# 15. KPI STRIP

Formato:

- 4–5 cards;
- 64–88px;
- icon;
- label;
- value;
- optional trend.

Background:

surface-1.

Color apenas no significado.

---

# 16. TOOLBAR / FILTER BAR

Assinatura DarkBlue:

```text
[Search................] [Filtros] [Sort]             [View switch] [...]
```

Altura:

38–42px.

Search:

surface profunda.

Focus:

blue border + soft ring.

Full HD:

preferencialmente uma linha.

---

# 17. BUTTON SYSTEM

## Primary

- 40–42px;
- blue solid;
- white semantic foreground;
- radius 9–10px.

## Secondary

- surface;
- neutral border.

## Outline primary

- transparent;
- blue border;
- blue text.

## Ghost

- contextual;
- icon buttons.

## Danger

- destructive;
- preferencialmente dentro de menu.

## Icon button

- 36–40px;
- hit area mínimo 40px;
- tooltip quando necessário.

---

# 18. INPUT / SELECT / TEXTAREA

Input:

- 38–42px;
- 8–10px radius;
- dark deep background;
- border;
- 12px horizontal padding;
- 13px font.

Focus:

blue border + ring.

Textarea:

min 72px.

Labels:

12–13px semibold.

---

# 19. CARD SYSTEM

Card operacional:

```text
surface-1
border
radius 12px
padding 12–16px
```

Hover:

border mais evidente + shadow discreta.

Selected:

blue border + blue soft background.

Não escalar card além de 1.005.

---

# 20. CHAT / INBOX — CONVERSATION ROW

Row é componente assinatura.

Altura alvo:

74–82px.

Avatar:

40–44px.

Conteúdo:

- nome;
- hora;
- preview;
- unread;
- badges essenciais.

Selected:

- blue soft;
- blue border;
- left marker.

Ações hover:

overlay, não ocupam altura.

---

# 21. CHAT BUBBLES

Incoming:

surface-3.

Outgoing:

primary blue.

Max width:

60–64%.

Radius:

12px com canto direcional menor.

Body:

14px / 20px.

Metadata:

10–11px.

---

# 22. WORKSPACE PANEL

O ZAPP usa conceito de workspace.

Chat principal:

- lista à esquerda;
- workspace no centro;
- contexto à direita.

Subtelas do Chat preservam shell.

Somente conteúdo central muda.

---

# 23. CONTACT CONTEXT PANEL

Width Full HD:

340–380px.

Header sticky.

Tabs:

Contato / Histórico / Tarefas / Notas / Arquivos.

Conteúdo:

scroll interno.

Não usar accordion infinito sem agrupamento.

---

# 24. CRM 360°

Grid central:

2 colunas.

Componentes:

- summary strip;
- empresa;
- funil;
- compras;
- propostas;
- ticket;
- produtos interesse;
- próxima ação;
- pipeline;
- histórico comercial.

---

# 25. TASK WORKSPACE

Header:

title + `Nova tarefa`.

KPI compactos:

- atrasadas;
- hoje;
- concluídas.

Board:

- Hoje;
- Próximas;
- Concluídas.

Task card:

- checkbox;
- título;
- prioridade;
- deadline;
- owner;
- menu.

---

# 26. NOTES / MEMORY WORKSPACE

Grid 2×3.

Cards:

- Notas privadas;
- Fatos relevantes;
- Objeções;
- Promessas;
- Pendências;
- Resumo comercial.

Conteúdo escaneável.

Autoria e timestamp discretos.

---

# 27. FILES WORKSPACE

Header + search + type filters.

Grid:

3 colunas + preview lateral dentro do workspace.

Cards:

- preview;
- filename;
- size;
- type;
- date;
- author;
- actions.

---

# 28. HISTORY WORKSPACE

Header.

Filters:

período + event type.

Summary:

interactions / last contact / average response / resolutions.

Timeline:

message / note / transfer / call / file / task / proposal / purchase.

---

# 29. AI WORKSPACE

AI = contextual.

Cards:

- suggestion;
- summary;
- objections;
- next best action;
- products;
- sentiment/risk.

Primary IA color:

purple.

Ação do produto continua azul.

---

# 30. COMPOSER

Persistente em Chat e subtelas.

Camada 1:

quick tools.

Camada 2:

input + essential actions.

Input:

44px min.

Send:

40px.

Tools:

Resposta rápida / Assistente IA / Anexar / Agendar / Transferir / Mais.

---

# 31. MESSAGE MEDIA

## Image

object-cover/contain conforme tipo.

## Product

card compacto.

## Audio

waveform + speed.

## Document

file icon + name + size.

## Video

preview + duration.

---

# 32. TABS

Altura:

36–42px.

Active:

blue soft + primary + indicator.

Inactive:

muted.

Keyboard:

Arrow keys quando padrão Radix permitir.

---

# 33. BADGES / STATUS

Cliente:

neutral blue soft.

VIP:

warning.

Online:

success.

Alta prioridade:

danger soft.

Em atendimento:

primary soft.

Aguardando:

warning soft.

Resolvido:

success soft.

---

# 34. DROPDOWNS E MENUS

- elevated;
- radius 8–10;
- shadow elevated;
- item 34–38px;
- icon 15–16px.

Danger somente item destrutivo.

---

# 35. EMPTY STATES

Responder:

1. por que está vazio?
2. o que fazer?

Composição:

- icon;
- title;
- message;
- CTA.

Compacto:

120–220px.

---

# 36. SKELETON / LOADING

Skeleton imita layout final.

Inbox:

rows.

Chat:

bubbles.

CRM:

cards.

Files:

thumbnails.

Não bloquear sistema inteiro por loading local.

---

# 37. FEEDBACK

Saving:

`Salvando…`

Saved:

`Salvo`

Success:

toast curto + estado visual.

Error:

explicar falha e recuperação.

Offline:

banner compacto.

---

# 38. MICROINTERAÇÕES / MOTION

## Durações

| Tipo | Duração |
|---|---:|
| hover | 120–160ms |
| button | 120–160ms |
| tab | 140–180ms |
| popover | 120–180ms |
| card hover | 160–200ms |
| drawer | 200–240ms |
| dialog | 180–220ms |
| subview | 140–180ms |

## Easing

```css
cubic-bezier(.2,.8,.2,1)
```

ou Framer:

```ts
[0.16, 1, 0.3, 1]
```

## Regras

- no stagger em listas;
- no blur reveal;
- no parallax;
- no permanent glow;
- no bounce;
- reduced motion obrigatório.

---

# 39. ICONOGRAFIA

Lucide.

Tamanhos:

- nav 16–18;
- input 15–16;
- button 16;
- section 16;
- page icon 20–22;
- empty 28–34.

Stroke:

default/2px.

Icon-only:

aria-label + tooltip.

---

# 40. IMAGENS

Avatar:

object-cover.

Product:

object-contain quando fidelidade importa.

Media:

lazy outside fold.

Thumbnails:

proporção consistente.

---

# 41. SCROLL

Não criar múltiplos scrolls sem função.

Permitido:

- inbox;
- chat messages;
- context panel.

Scrollbar:

fina e visível.

---

# 42. RESPONSIVIDADE

## ≥1680

Full wide.

Todas as regiões.

## 1440–1679

Reduzir gaps.

Context panel 320–340.

## 1366–1439

Sidebar collapse.

Context optional/drawer.

## 1280–1365

Sidebar rail.

Context drawer.

## 1024–1279

2-region priority.

## 768–1023

list/chat alternation.

## Mobile

single flow.

Hit target ≥44px.

---

# 43. FULL HD É VIEWPORT DE PRIMEIRA CLASSE

1920×1080 deve ser testado explicitamente.

Objetivos:

- sem horizontal scroll;
- conteúdo crítico above fold;
- toolbar em uma linha;
- densidade correta;
- não centralizar em max-width pequeno.

---

# 44. TABELAS

Row:

42–50px.

Header:

38–44px.

Sticky quando útil.

Actions:

`...`.

Selected:

blue soft.

---

# 45. FORMULÁRIOS

Agrupar por objetivo.

Não criar card para cada input.

Advanced fields:

accordion/details.

Errors inline.

---

# 46. ACESSIBILIDADE

Obrigatório:

- WCAG AA;
- keyboard;
- visible focus;
- aria-label;
- aria-current;
- aria-expanded;
- semantic status;
- touch targets;
- screen reader;
- reduced motion.

Focus:

```text
ring-2 ring-primary/60
ring-offset-2
ring-offset-background
```

---

# 47. DENSIDADE / ANTI-BLOAT

Pergunta padrão:

> Isso precisa estar permanentemente visível?

Se não:

- menu;
- accordion;
- drawer;
- tab;
- tooltip;
- context action.

Sinais de bloat:

- card dentro de card;
- 3 headers antes do conteúdo;
- duplicated toolbars;
- repeated actions;
- huge empty areas.

---

# 48. SOFTWARE OPERACIONAL VS LANDING PAGE

Operacional:

- denso;
- previsível;
- rápido;
- orientado a tarefa.

Não usar:

- hero;
- marketing copy;
- decorative illustration;
- parallax;
- huge gradients;
- 40px card padding.

---

# 49. REGRAS DE CÓDIGO PARA CLAUDE

## Reutilizar antes de criar

Inspecionar:

- Button;
- Card;
- Badge;
- Input;
- Select;
- Tabs;
- Dialog;
- Sheet;
- ScrollArea;
- Tooltip.

## Não duplicar

Não criar:

- `DarkBlueButton.tsx`;
- `PremiumCardNew.tsx`;
- `CoolPanel.tsx`;

se variantes resolvem.

## Sem magic numbers

Recorrente vira token.

## Sem `!important`

Exceto inevitável e documentado.

## Sem screenshot hack

Não posicionar tudo com absolute.

---

# 50. POLÍTICA DE CORES LITERAIS

UI:

usar tokens.

Não:

```tsx
bg-[#1677ff]
```

Preferir:

```tsx
bg-primary
bg-zapp-primary
```

Literal permitido apenas para dados reais:

- swatch;
- cor de produto;
- branding de cliente;
- conteúdo gerado.

---

# 51. SEMÂNTICA DE AÇÕES

Primary:

avança/conclui.

Secondary:

útil.

Ghost:

contextual.

Danger:

destrutivo.

Link:

navegação.

Uma região = um CTA dominante.

---

# 52. STATE SYSTEM

Todo componente interativo deve prever:

- default;
- hover;
- focus;
- active;
- selected;
- disabled;
- loading;
- success;
- error.

Não desenhar apenas default.

---

# 53. DESIGN REVIEW CHECKLIST

## Hierarquia

- ação principal clara?
- contexto claro?
- título não compete?

## Densidade

- Full HD bem usado?
- scroll evitável?
- empty space funcional?

## Consistência

- radius?
- spacing?
- colors?
- icons?
- typography?

## States

- hover?
- focus?
- selected?
- disabled?
- loading?
- empty?
- error?

## Accessibility

- keyboard?
- aria?
- contrast?
- touch?

## Functional

- tudo preservado?

---

# 54. DESIGN QA VISUAL

Comparar:

1. original;
2. redesign;
3. implementação.

Verificar:

- width;
- height;
- proportions;
- spacing;
- typography;
- border;
- radius;
- icon sizes;
- above fold;
- shell consistency.

Não aceitar:

`está parecido`.

---

# 55. DESIGN QA TÉCNICO

Executar:

- typecheck;
- lint;
- tests;
- build;
- console;
- network;
- 1920;
- 1600;
- 1440;
- 1366;
- 1024;
- mobile;
- keyboard;
- reduced motion.

---

# 56. PROTOCOLO DE IMPLEMENTAÇÃO PARA CLAUDE

## Fase A — Recon

Identificar:

- route;
- page;
- components;
- hooks;
- state;
- data;
- permissions;
- tests;
- tokens.

## Fase B — Plano

Listar:

- arquivos;
- não-alterados;
- funções protegidas;
- riscos.

## Fase C — Estrutura

Shell, grid, hierarchy.

## Fase D — Components

Controls, states, content.

## Fase E — Responsive

1920 → mobile.

## Fase F — Polish

border, shadow, motion.

## Fase G — QA

visual + functional + technical.

---

# 57. RESTRIÇÕES ABSOLUTAS

Não alterar sem autorização:

- migrations;
- schema;
- banco;
- RLS;
- policies;
- triggers;
- auth;
- credentials;
- APIs;
- integrations;
- business rules;
- deploy;
- infrastructure.

---

# 58. PADRÕES PROIBIDOS

- black absolute em tudo;
- glassmorphism massivo;
- glow em tudo;
- gradient em todo card;
- radius 24+;
- huge shadows;
- text low contrast;
- 9px operational text;
- huge cards;
- slow animations;
- cards como solução universal;
- layout diferente por subtela do mesmo módulo.

---

# 59. PADRÕES ASSINATURA DARKBLUE PREMIUM

Uma tela ZAPP correta deve possuir:

1. dark navy background;
2. surface hierarchy;
3. blue-gray border;
4. electric blue primary;
5. clean light typography;
6. blue-gray metadata;
7. compact cards;
8. Full HD width usage;
9. soft blue selected;
10. semantic green/yellow/red;
11. Lucide icons;
12. controlled CTA;
13. contextual menus;
14. minimal glow;
15. moderate radius;
16. functional motion;
17. stable shell.

---

# 60. MATRIZ DE COMPONENTES

| Componente | Radius | Altura | Surface | Border | Ativo |
|---|---:|---:|---|---|---|
| Button primary | 9–10 | 40–42 | blue | blue | blue hover |
| Button small | 8 | 32–36 | semantic | semantic | hover |
| Input | 8–10 | 38–42 | deep | default | focus blue |
| Select | 8–10 | 38–42 | deep | default | focus blue |
| Filter pill | full | 28–34 | surface-2 | default | blue |
| Badge | full | 22–26 | semantic soft | semantic | — |
| Conversation row | 10 | 74–82 | transparent/surface | divider | blue soft |
| Card | 12 | auto | surface-1 | default | hover |
| Panel | 12–14 | auto | surface-1 | default | — |
| Dialog | 16–18 | auto | elevated | default | — |
| Nav item | 8–10 | 36–40 | transparent | none | blue soft |
| Table row | 8 | 42–50 | transparent | divider | blue soft |
| KPI | 12 | 64–88 | surface-1 | default | — |
| Chat bubble | 12 | auto | semantic | none | — |

---

# 61. TAILWIND — REFERÊNCIA

## Panel

```tsx
className="
  rounded-xl
  border border-border/70
  bg-card
  shadow-sm
"
```

## Selected

```tsx
className="
  rounded-xl
  border border-primary/50
  bg-primary/10
  ring-1 ring-primary/10
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
  focus-visible:border-primary
  focus-visible:ring-2
  focus-visible:ring-primary/15
"
```

## Primary

```tsx
className="
  bg-primary
  text-primary-foreground
  hover:bg-primary/90
"
```

---

# 62. CONFLITO COM TOKENS LEGADOS

Se o projeto atual estiver em uma paleta mais preta/azul diferente:

Claude NÃO deve:

- trocar tudo globalmente durante uma tela;
- quebrar telas prontas;
- espalhar literal.

Claude deve:

1. identificar token;
2. mapear aliases;
3. aplicar DarkBlue no escopo redesenhado;
4. propor migração global separada;
5. registrar risco.

---

# 63. REFERÊNCIAS VISUAIS APROVADAS — ZAPP

## Chat Principal

Copiar:

- shell estável;
- lista densa;
- chat central;
- context right;
- composer persistente.

## CRM 360°

Copiar:

- workspace no centro;
- KPIs compactos;
- 2-column operational grid.

## Tarefas

Copiar:

- summary strip;
- board 3 columns;
- tasks compact.

## Notas

Copiar:

- knowledge grid;
- facts;
- objections;
- promises;
- pending;
- summary.

## Arquivos

Copiar:

- search;
- type filters;
- grid;
- preview;
- actions.

## Histórico

Copiar:

- filters;
- summary KPIs;
- timeline.

## IA

Copiar:

- answer suggestion;
- summary;
- objections;
- next best action;
- products;
- sentiment.

---

# 64. REGRA FINAL PARA QUALQUER NOVA TELA

Quando Claude receber screenshot + manual:

1. entender tarefa;
2. preservar função;
3. usar DarkBlue;
4. adaptar composição à tarefa;
5. preservar identidade;
6. usar largura;
7. manter density;
8. evitar bloat;
9. usar semantic tokens;
10. QA.

Mesma família não significa mesma composição em todos os módulos.

Dentro do mesmo módulo com shell fixo, composição base deve permanecer.

---

# 65. CRITÉRIO DE SUCESSO

O redesign está correto quando o usuário navega entre:

- Chat;
- CRM;
- Tarefas;
- Notas;
- Arquivos;
- Histórico;
- Contatos;
- Dashboard;

e percebe imediatamente:

> “É o mesmo ZAPP, o mesmo produto, o mesmo Design System.”

Sem que todas as telas sejam cópias.

---

# 66. PROMPT CURTO PARA CLAUDE

```text
Antes de alterar código, leia integralmente:
ZAPP_WEB_V2_DARKBLUE_PREMIUM_DESIGN_SYSTEM.md

Ele é a referência visual e de UX desta tarefa.

Analise também:
1. screenshot ORIGINAL;
2. screenshot de REDESIGN APROVADA;
3. código real da tela.

Regras:
1. Código existente define funcionalidade.
2. Design aprovado define intenção visual.
3. Design System define consistência.
4. Preserve funcionalidades.
5. Não hardcode mockup.
6. Não alterar banco/schema/RLS/API/auth/migrations/integrations em tarefa visual.
7. Reutilize componentes.
8. Use tokens semânticos.
9. Priorize Full HD 1920×1080.
10. Faça Design QA: ORIGINAL vs REDESIGN vs IMPLEMENTAÇÃO.

Antes de codificar, entregue recon curto:
- page;
- components;
- hooks;
- data;
- protected functionality;
- files to change.

Depois implemente.
```

---

# 67. MANTRA DO SISTEMA

> **DarkBlue, não preto.**

> **Premium sem excesso.**

> **Denso sem apertar.**

> **Azul para intenção, não decoração.**

> **Movimento para feedback, não espetáculo.**

> **Conteúdo primeiro.**

> **Função preservada.**

> **Shell consistente.**

> **Produto acima de efeito.**
