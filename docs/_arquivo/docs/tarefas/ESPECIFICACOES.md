# ESPECIFICAÇÕES — módulo de Tarefas no nível das imagens de referência

> Documento de referência visual do módulo de Tarefas (Zapp Web V2). É a etapa T01 do plano
> `docs/plans/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md` (etapas 005, 006, 010, 016,
> 031, 049, 079, 107, 131 e 153) — aprovado pelo Joaquim em 11/10/2026 com as decisões D1, D3, D13
> e D14. Todo cartão de interface do plano aponta para aqui. Enquanto o plano não estiver
> integrado, a cópia lida é `~/hermes-workspaces/.assets/tarefas/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`.
> Escrito em 11/10/2026 pelo **worker (design / designer)**. Idioma pt-BR. Números de contraste
> **calculados** pela fórmula WCAG 2.1 (luminância relativa sRGB) com os valores dos tokens reais de
> `src/styles/tokens.css`; o **fundo** de cada par está dito na tabela 1.4 ("tinta /15" = alfa 15 %
> **composta sobre `--card`**, R = 0,15·tinta + 0,85·card). Qualquer um refaz os números; o
> contrato do repo com a mesma fórmula é `tests/contracts/contraste-aa-componentes.contract.test.ts`.
>
> Referências: as cinco imagens de referência, em `~/hermes-workspaces/.assets/tarefas/01.png` a
> `05.png` — 01 Lista · 02 Agenda · 03 Quadro com painel · 04 Modal "Nova tarefa" · 05 Quadro
> principal. As imagens são **só do tema escuro** (etapa 005); o tema claro é especificado aqui.
>
> Nada aqui cria cor, biblioteca ou token novo além do que a lista abaixo autoriza. Toda decisão
> marcada com **D__** remete à seção 6 do plano; as que o Joaquim pode vetar estão citadas como tal.

---

## 0. Regras que valem para os dez desenhos

R1. **Só token do sistema.** Nenhum `#hex`, nenhum `hsl(...)` literal, nenhum `text-[13px]`. Onde o
código atual usa valor arbitrário, este documento dá o token equivalente (seção 3). Os valores
`hsl` escritos aqui são **transcrição para leitura** dos tokens — nunca copiar para o código: no
código entra `hsl(var(--token))` ou a classe gerada.
R2. **Alvo de toque ≥ 40 px**; 32 px só onde este documento justificar. Alvos de 24 px existentes
(ícone de política da coluna) sobem para 40 px no toque.
R3. **Foco visível** em todo elemento interativo: `ring-2 ring-ring ring-offset-2 ring-offset-background`.
R4. **Teclado completo** e **narração** (`aria-live="polite"`) do que muda sozinho.
R5. **Movimento** só em `transform`/`opacity`, sempre atrás de `motion-safe`
(`useReducedMotion`); com movimento reduzido o estado final aparece direto.
R6. **Contraste AA**: texto 4,5:1 · ícone/forma 3:1. Os pares adotados estão medidos na seção 1.4 e
nos pontos de uso; o portão de contraste (`tests/contracts/a11y-contraste-gate.contract.test.ts`) roda nos dois temas.
R7. **Claro e escuro** e as skins usam os mesmos tokens; o tema claro é desenhado aqui (seção 1.5),
porque as 5 imagens são só do tema escuro.
R8. **Nenhuma informação sai do sistema**: sem exportar, baixar, copiar tudo ou imprimir novos.
Sem selo de canal ou de origem.

---

## 1. Inventário de tokens e tema claro (etapa 005)

### 1.1 O que já existe e é o que usamos

| Uso | Token / utilitário | Valor (claro → escuro) |
|---|---|---|
| Superfície base | `--background` | `221 20% 97%` → `240 6% 6%` |
| Cartão, célula, coluna | `--card` / `--card-elevated` | branco → `240 5% 10%` / `240 5% 13%` |
| Texto principal | `--foreground` | `221 20% 12%` → `210 40% 98%` |
| Texto secundário | `--muted-foreground` | `221 10% 40%` → `215 20% 75%` |
| Ação, seleção, "Fazendo" | `--primary` / `--primary-foreground` / `--primary-text` | `221 83% 53%` → igual; texto `221 83% 35%` → `221 83% 78%` |
| Atraso, urgência, limite cheio | `--destructive` / `--destructive-text` | `0 84% 60%` / `0 75% 40%` → `354 100% 68%` / `354 75% 68%` |
| Antes do prazo, espera, "Aguardando" | `--warning` / `--warning-text` | `38 92% 50%` / `38 92% 30%` → `40 91% 60%` / `40 91% 60%` |
| Concluído | `--success` / `--success-foreground` | `160 70% 27%` → `142 71% 45%`; tinta escura no escuro |
| Informativo (só preenchimento) | `--info` / `--info-foreground` | `210 80% 55%` → `213 94% 62%` |
| Prioridade — redutor | `--priority-high` (vermelho), `--priority-medium` (âmbar), `--priority-low` (azul-cinza) | `0 84% 60%` / `38 92% 50%` / `210 25% 48%` → `0 90% 60%` / `38 100% 58%` / `210 35% 60%` |
| Estado | `--status-open` (azul), `--status-pending` (âmbar), `--status-waiting` (azul), `--status-resolved` (verde) | `221 83% 53%` / `45 90% 50%` / `210 80% 55%` / `160 70% 42%` → `221 83% 53%` / `42 100% 58%` / `210 95% 62%` / `155 80% 50%` |
| Tile do KPI | `--kpi-tile-blue\|green\|purple\|yellow` (+ `*-fg`). O módulo de Tarefas adota azul/âmbar/verde; Atrasadas usa a tinta `destructive/15` + `destructive-text` e o neutro `--muted` + `--muted-foreground` (4.2) | ver 1.2 e 4.2 |
| Raio | `--radius-xs` 4 · `--radius-sm` 6 · `--radius-md` 8 · `--radius-lg` 12 · `--radius-xl` 16 · `--radius-2xl` 24 · `--radius-full` | pílula = `--radius-full`; card/coluna = `--radius` (14 px); tile = `--radius-xl` (16 px) |
| Sombra | `--elev-1` (card) · `--elev-2` (hover) · `--elev-3` (cartão arrastado) · `--elev-5` (overlay do modal, seção 11) · `--shadow-lg` | — |
| Tempo | `--animation-fast` 150 ms · `--animation-normal` 250 ms · `--easing-smooth` / `--easing-spring` | — |
| Fonte | `--font-sans` (texto) · `--font-display` (título de módulo e do modal) · `--font-mono` (contador/atalho) | — |

### 1.2 O que falta (e como resolver, sem cor nova)

1. **Tile de KPI no tema CLARO reprova AA.** Os quatro pares de hoje medem, sobre o card claro:
   azul **2,11:1** · verde **1,51:1** · roxo **2,71:1** · âmbar **1,62:1** (mínimo de ícone = 3:1).
   No escuro os mesmos pares passam (6,28 / 8,48 / 4,88 / 7,86). Correção: o `-fg` do tile ganha
   **override de luminosidade no `:root`** — mesma matiz e saturação (precedente no arquivo:
   `--warning-text` e `--primary-text`, que só moveram L). Valores propostos e medidos:
   azul `221 83% 35%` (**7,81:1**) · verde `142 76% 27%` (**5,12:1**) · roxo `258 90% 42%`
   (**8,09:1**) · âmbar `38 92% 30%` (**4,89:1**). O `.dark` continua com 72/55/72/62 %.
   **Quais tiles o módulo de Tarefas usa (4.2):** azul (Fazendo), âmbar (Para hoje) e verde
   (Concluídas) — os três `*-fg` acima. Atrasadas usa a **tinta `destructive/15` + `destructive-text`**
   (sem token `kpi-tile` vermelho) e Tempo médio usa `--muted` + `--muted-foreground`. O roxo fica
   no inventário porque outros módulos (Contatos e Inbox) usam o mesmo token.
2. **`--priority-low` como texto reprova no claro (4,45:1).** A pílula "Baixa" usa o token como
   texto sobre a própria tinta; falta o par de texto. Proposta: no claro, `--priority-low` desce de
   L 48 % para **L 42 %** (mesma matiz/saturação) → **4,62:1**; no escuro fica L 60 % → **4,75:1**.
3. **Não existem** `--priority-low-text`, `--kpi-tile-*-text` nem par de texto para `--info`. Não
   criar: `--info` entra só como preenchimento (com `--info-foreground`) e prioridade usa os pares
   que já existem (`--warning-text`, `--destructive-text`, `--primary-text`, `--muted-foreground`).
4. **Os tiles coloridos** usam os utilitários reais do repo — `bg-kpi-blue|yellow|green` com o par
   `text-kpi-blue-fg|yellow-fg|green-fg` (com o override do item 1); Atrasadas usa `bg-destructive/15`
   + `text-destructive-text` e o neutro `bg-muted` + `text-muted-foreground`. Sem utilitário nem
   gradiente novo.

### 1.3 Utilitário × token (para não escrever literal)

`text-2xs` 11 px · `text-3xs` 10 px · `text-xs` 12 px · `text-sm` 14 px · `text-base` 16 px ·
`text-lg` 18 px · `text-xl` 20 px · `text-2xl` 24 px · `text-kpi-value` **34 px tabular** (token que
já existe em `tailwind.config.ts`) · `--icon-sm` 16 px · `--icon-md` 20 px · `--icon-lg` 24 px.

**Cores sem utilitário:** `--chart-1`…`--chart-10` existem em `src/styles/tokens.css` mas **não** têm
classe Tailwind no `tailwind.config.ts`; quando usadas (avatar, seção 7.4) entram como
`hsl(var(--chart-N))` num `style`/CSS var — nunca como `bg-chart-N`.

### 1.4 Contraste calculado — os pares que a especificação adota (25 pares, 0 falhas)

Números pela fórmula WCAG 2.1 (luminância relativa sRGB) com os tokens reais de `src/styles/tokens.css`;
limiar 4,5:1 para texto e 3:1 para forma/ícone. "Tinta /15" = cor do token a 15 % de alfa **composta
sobre `--card`** (R = 0,15·tinta + 0,85·card). O fundo adotado é o card, exceto quando o par diz outro.

```
GRUPO                                     PAR                                                                   MIN  CLARO      ESCURO
KPI tile (ícone 20px)                     blue: L35% claro / L72% escuro sobre tinta /13                         3    7.81 OK    6.28 OK
KPI tile (ícone 20px)                     green: L27% claro / L55% escuro sobre tinta /13                        3    5.12 OK    8.48 OK
KPI tile (ícone 20px)                     purple: L42% claro / L72% escuro sobre tinta /13 (Contatos/Inbox)      3    8.09 OK    4.88 OK
KPI tile (ícone 20px)                     yellow: L30% claro / L62% escuro sobre tinta /13                       3    4.89 OK    7.86 OK
KPI tile (ícone 20px)                     destructive: tinta /15 + texto (Atrasadas)                            3    5.63 OK    4.93 OK
KPI tile (ícone 20px)                     muted: neutro (Tempo médio) — muted-foreground sobre bg-muted        3    5.04 OK    7.31 OK
Pílula (tinta /15 + par de texto)         Alta prioridade — contorno e texto (vermelho)                          4.5  6.86 OK    6.01 OK
Pílula (tinta /15 + par de texto)         Urgente — tinta vermelha /15 + texto                                   4.5  5.63 OK    4.93 OK
Pílula (tinta /15 + par de texto)         Média — tinta âmbar /15 + texto (D12)                                  4.5  4.82 OK    7.29 OK
Pílula (tinta /15 + par de texto)         Aguardando — tinta âmbar /15 + texto                                   4.5  4.82 OK    7.29 OK
Pílula (tinta /15 + par de texto)         A fazer / Caixa de entrada — tinta azul /15 + texto                    4.5  7.58 OK    7.66 OK
Pílula (tinta /15 + par de texto)         Concluído — tinta verde /15 + texto                                    4.5  4.58 OK    5.99 OK
Pílula (tinta /15 + par de texto)         Cancelada — tinta neutra /15 + texto                                   4.5  5.93 OK    9.04 OK
Pílula (tinta /15 + par de texto)         Baixa — azul L42% claro / L60% escuro sobre priority-low/15            4.5  4.62 OK    4.75 OK
Pílula cheia (texto sobre preenchimento)  Fazendo — primary-foreground sobre primary                             4.5  5.20 OK    5.20 OK
Pílula cheia (texto sobre preenchimento)  Concluída — success-foreground sobre success                           4.5  5.66 OK    7.80 OK
Pílula cheia (texto sobre preenchimento)  Segmento selecionado do modal — primary-foreground sobre primary       4.5  5.20 OK    5.20 OK
Linha e célula                            foreground sobre card                                                  4.5 16.99 OK   16.89 OK
Linha e célula                            muted-foreground sobre card (sem prazo, sem lembrete)                  4.5  6.10 OK    9.32 OK
Linha e célula                            primary-text sobre card (link, Abrir conversa)                         4.5  9.36 OK    8.71 OK
Linha e célula                            warning-text sobre card (motivo da espera)                             4.5  5.40 OK    9.96 OK
Linha e célula                            destructive-text sobre card (Atrasada, prazo vencido, Limite atingido) 4.5  6.86 OK    6.01 OK
Linha selecionada                         primary sobre card (barra 3px + borda do cartão — forma, 3:1)          3    5.20 OK    3.40 OK
Linha selecionada                         primary-text sobre tinta primary/15 sobre card (chip do filtro ativo)  4.5  7.58 OK    7.66 OK
Botão primário                            primary-foreground (branco) sobre primary                             4.5  5.20 OK    5.20 OK
```

### 1.5 O que a tabela A mostra (o que NÃO repetir)

Os pares que o código usa **hoje** que reprovam — motivo de o desenho novo trocá-los pelos da 1.4:

```
kpi-tile-*-fg sobre tinta /13 (claro) ......... 1,51 a 2,71 : 1  (mín. 3)
--status-* usado como texto sobre o card ...... 1,79 a 3,47 : 1 no claro; 3,40 no escuro (mín. 4,5)
--priority-* usado como texto sobre o card .... 2,14 / 3,78 / 4,45 : 1 (mín. 4,5)
--info usado como texto sobre o card .......... 3,47 : 1 (mín. 4,5)
```

**Regra:** cor de estado/prioridade nunca é `text-*` do token cru — é **tinta /15 + o par de texto**
(ou preenchimento cheio com o `*-foreground`, na seção 1.4). É a mesma correção que `PriorityChip` já
fez para Alta/Urgente.

---

## 2. Mapa de ícones (etapa 006)

Lucide, `strokeWidth 2`, `currentColor` (herdam a cor do texto ao lado). Tamanhos: **16 px**
(`--icon-sm`), **20 px** (`--icon-md`), **24 px** (`--icon-lg`).

| Elemento | Ícone | Tamanho | Cor |
|---|---|---|---|
| KPI Atrasadas | `AlertTriangle` | 20 | `--destructive-text` (sobre a tinta `destructive/15`, 4.2) |
| KPI Para hoje | `CalendarDays` | 20 | `--kpi-tile-yellow-fg` (par do tile âmbar) |
| KPI Fazendo (anel) | `Loader` no centro do anel | 16 | `--kpi-tile-blue-fg` (par do tile azul) |
| KPI Concluídas | `CheckCircle2` | 20 | `--kpi-tile-green-fg` (par do tile verde) |
| KPI Tempo médio | `Timer` | 20 | `--muted-foreground` |
| Subtítulo de KPI (saudável) | `Info` | 16 | `--muted-foreground` |
| Limite atingido | `AlertCircle` | 16 | `--destructive-text` |
| Seletor de modos | `List` · `Columns` · `Calendar` | 16 | ativo `--primary-foreground`; inativo `--muted-foreground` |
| Busca | `Search` · limpar `X` | 16 | `--muted-foreground` |
| Filtros | `Filter` · chevron `ChevronDown` | 16 | `--foreground` |
| Captura | `Plus` | 16 | `--muted-foreground` |
| Grupo Atrasadas | `AlertTriangle` em disco | 16 | `--destructive-text` |
| Grupo Hoje | `Clock` em disco | 16 | `--warning-text` |
| Grupo Amanhã / Próximas | `Calendar` em disco | 16 | `--primary-text` |
| Grupo Sem prazo | `Circle` em disco | 16 | `--muted-foreground` |
| Grupo Concluídas | `CheckCircle2` em disco | 16 | `--success` |
| Célula Prazo | `Calendar` (vencido: `AlertCircle`) | 16 | `--muted-foreground` / `--warning-text` / `--destructive-text` |
| Célula Lembrete | `Bell` (programado) · `BellOff` (sem) | 16 | `--warning-text` quando a menos de 30 min, senão `--muted-foreground` |
| Célula Contato | `Avatar` | 24 | iniciais sobre token determinístico (seção 4.3) |
| Menu da linha | `MoreVertical` | 16 | `--muted-foreground` |
| Coluna do Quadro | `Info` (política) · recolher `ChevronsLeftRight` | 16 | `--muted-foreground` |
| Card Atrasada | `AlertTriangle` | 16 | `--destructive-text` |
| Card Aguardando | ponto de 8 px | — | `--warning` |
| Card em Fazendo | alça `GripVertical` | 16 | `--muted-foreground` |
| Agenda — atrasadas | `AlertTriangle` | 20 | `--destructive-text` |
| Agenda — dia | `CalendarDays` | 16 | `--primary-text` no dia selecionado |
| Agenda — ALARMES | `Bell` | 16 | `--warning-text` |
| Agenda — PRAZOS | `CalendarClock` | 16 | `--primary-text` |
| Agenda — SEM HORA | `CircleDashed` | 20 | `--muted-foreground` |
| Painel — cabeçalho | `CalendarCheck` em quadrado `--primary/15` | 20 | `--primary-text` |
| Painel — expandir/fechar | `Maximize2` · `X` | 16 | `--muted-foreground` |
| Painel — Abrir conversa | `ArrowUpRight` | 16 | `--primary-text` |
| Painel — Agendado | `Check` | 16 | `--success` |
| Painel — Adiar | `ChevronDown` | 16 | `--muted-foreground` |
| Modal — cabeçalho | `SquarePen` em quadrado `--primary/15` | 20 | `--primary-text` |
| Modal — destino | `Inbox` | 16 | `--muted-foreground` |
| Modal — confirmado | `Check` | 16 | `--success` |

**Anel de progresso do KPI Fazendo (19):** SVG de 44 px (mesmo diâmetro do tile), traço de 4 px,
`stroke-linecap="round"`, trilha `--muted`, arco na cor do tile (`--kpi-tile-blue-fg`; cheio:
`--destructive-text`),
`aria-hidden` (o número é que narra), `transform-origin: center` e 250 ms (`--animation-normal`).

---

## 3. Escala tipográfica e espaçamento (etapa 010)

Grade de **4 px**. Nada arbitrário: só os degraus da seção 1.3.

**Arbitrário existente que este desenho substitui:** o módulo ainda escreve `text-[13px]` em oito
pontos (rótulo do KPI, título da coluna do Quadro, cabeçalho do quadro, linhas de grupo da Lista,
título da faixa de atrasadas e vazio da Agenda, filtros). Não existe token de 13 px: o desenho adota
`text-sm` 14 / 600 onde é título (coluna, grupo, cabeçalho) e `text-2xs` 11 / 600 onde é rótulo
(KPI, chip) — e o cartão que mexer em cada arquivo tira o arbitrário.

| Elemento | Tamanho / peso | Cor | Observação |
|---|---|---|---|
| Título "Tarefas" | `text-2xl` 24 / 600 (`--font-display`) | `--foreground` | `PageHeader` |
| Subtítulo "Seu espaço de execução · N abertas · M para hoje" | `text-sm` 14 / 400 | `--muted-foreground` | milhar e plural pt-BR |
| Rótulo de KPI | `text-2xs` 11 / 600 | `--muted-foreground` | caixa alta só no card confortável |
| Valor de KPI | `text-kpi-value` 34 / 700 tabular | `--foreground` | faixa compacta: `text-2xl` 24 / 700 |
| Subtítulo de KPI | `text-2xs` 11 / 400 | cor do estado | Atrasadas `--destructive-text`; resto `--muted-foreground` |
| Modo (Lista/Quadro/Agenda) | `text-sm` 14 / 600 | ativo `--primary-foreground` | — |
| Campo de busca e captura | `text-sm` 14 / 400 | `--foreground` / `--muted-foreground` no placeholder | — |
| Chip de filtro | `text-2xs` 11 / 600 | ver 1.4 | — |
| Cabeçalho de tabela | `text-2xs` 11 / 600, `tracking-wide` | `--muted-foreground` | — |
| Linha de grupo | `text-xs` 12 / 600 | `--foreground` | contador `text-2xs` |
| Célula | `text-sm` 14 / 400 | `--foreground`; secundário `--muted-foreground` | título em 1 linha + `title` |
| Pílula | `text-2xs` 11 / 600 | ver 1.4 | altura 20 px, `px-2` |
| Título da coluna | `text-sm` 14 / 600 | `--foreground` | substitui o `text-[13px]` de hoje |
| Subtítulo da coluna | `text-2xs` 11 / 400 | `--muted-foreground` | 1 linha, `truncate`, `title` com a política |
| Contador da coluna | `text-xs` 12 / 700 tabular | `--muted-foreground` | cheio: `--destructive-text` |
| Título do dia na Agenda | `text-xs` 12 / 600 | `--foreground` | sigla |
| Título do cartão | `text-sm` 14 / 500 | `--foreground` | até 2 linhas |
| Título de seção (ALARMES/PRAZOS) | `text-2xs` 11 / 700 caixa alta `tracking-wide` | `--muted-foreground` | — |
| Painel — título da tarefa | `text-lg` 18 / 600 | `--foreground` | input |
| Painel — rótulo de campo | `text-2xs` 11 / 600 caixa alta | `--muted-foreground` | — |
| Painel — "Criada em …" | `text-2xs` 11 / 400 | `--muted-foreground` | — |
| Modal — título | `text-xl` 20 / 600 (`--font-display`) | `--foreground` | — |
| Modal — subtítulo | `text-sm` 14 / 400 | `--muted-foreground` | — |

**Espaçamento por recorte:** cartão de KPI `px-3 py-3`; faixa compacta `px-2 py-1.5`; barra de
ferramentas `gap-2`, altura 48 px; linha de tabela **44 px** (pílula centralizada); cabeçalho de
tabela **36 px** (linha de grupo **40 px**); cartão do Quadro `p-2.5 gap-1.5`; coluna `gap-2`;
painel `px-5 py-4`, rodapé 64 px; modal `p-6`, colunas 24 px de intervalo.

---

## 4. KPIs — o card confortável (etapa 016)

### 4.1 Medidas

Card **88 px** de altura, raio 14 px (`--radius`), `border-border/70`, `bg-card`, `px-3`,
`gap-3`. **Tile de 44 × 44 px**, raio 16 px (`--radius-xl`), `bg-kpi-*`, ícone de 20 px. Ao lado, coluna
com rótulo (`text-2xs`), valor (`text-kpi-value` 34 px tabular) e subtítulo (`text-2xs`).
Grade: 5 colunas ≥ 1280 px · 3 ≥ 768 px · 2 no celular (26 do plano).

### 4.2 Os cinco cards, com os três estados

| # | Rótulo | Ícone | Tile | Valor | Subtítulo por estado |
|---|---|---|---|---|---|
| 016/017 | Atrasadas | `AlertTriangle` | vermelho (`bg-destructive/15` + `text-destructive-text`) | nº | `> 0` → "Requer atenção" (`--destructive-text`); `= 0` → "Tudo em dia" (`--muted-foreground`), tile neutro |
| 018 | Para hoje | `CalendarDays` | âmbar (`bg-kpi-yellow` + `text-kpi-yellow-fg`) | nº | `> 0` → "Vencem hoje"; `= 0` → "Nada vence hoje" |
| 019 | Fazendo | anel de 44 px + `Loader` 16 | azul (`bg-kpi-blue` + `text-kpi-blue-fg`) | "n/3" | `< 3` → "Em andamento"; `= 3` → **"Limite atingido"** em `--destructive-text` e anel em `--destructive-text` |
| 020 | Concluídas · 7 dias | `CheckCircle2` | verde (`bg-kpi-green` + `text-kpi-green-fg`) | nº | "Últimos 7 dias" |
| 021/022 | Tempo médio | `Timer` | neutro (`bg-muted` + `text-muted-foreground`) | "1,4 dias" (`text-kpi-value`; "1 dia" no singular; "—" sem dados) | "Da criação à conclusão" (**D13** — métrica `created_at` → `completed_at`, 1 casa decimal pt-BR) |

**Estados do card:** repouso · hover (`--elev-2`, borda `border-border`) · foco (`ring-2`) ·
clicado (`--elev-1`, `scale-[0.99]`, `motion-safe`). Atrasadas e Para hoje são **clicáveis e
filtram** (23–24 do plano): chip visível abaixo da barra, clicar de novo remove; Fazendo leva ao
Quadro; `Enter` e `Espaço` funcionam; `aria-pressed` no estado ativo.

**Cores de "Limite atingido" (incoerência 14):** vale **vermelho** (`--destructive-text`) sempre —
é bloqueio real —, inclusive na imagem 05, que mostra cinza.

### 4.3 Faixa compacta (imagem 05, etapa 025)

Cinco leituras em **uma linha**, `h-12`, com separador `border-l border-border/60` entre elas,
rótulo `text-2xs` acima e valor `text-2xl` 24 tabular abaixo; sem tile (ícone de 16 px à esquerda).
Usada **só no Quadro**, para dar altura às colunas (**D2**). Densidade acompanha o modo.

---

## 5. Seletor de modos (etapa 031)

Adota **D3** — botões preenchidos com ícone (imagens 01 a 04), porque 3 de 4 telas usam essa forma.

- Grupo (`role="tablist"`) com 3 botões (`role="tab"`): Lista (`List`), Quadro (`Columns`),
  Agenda (`Calendar`); altura 36 px, raio 8 px (`--radius-md`), `px-3`, `gap-1.5`, `text-sm` 14 / 600.
- **Ativo:** `bg-primary text-primary-foreground` (**5,20:1**, ver 1.4) + `aria-selected="true"`.
- **Inativo:** transparente, `text-muted-foreground`, hover `bg-muted/60 text-foreground`.
- **Foco:** `ring-2 ring-ring ring-offset-2`.
- **Desabilitado:** `opacity-50`, sem hover; `cursor-not-allowed`.
- As teclas **1/2/3** continuam; ←/→ movem entre os modos com `Enter`/`Espaço` para ativar.
- A imagem 05 usa abas sublinhadas: **não adotamos** (ruído da proposta; D3 registra o porquê).

---

## 6. Lista em tabela (etapa 049)

### 6.1 Grade de colunas (≥ 1024 px; abaixo disso vira cartões — D4)

| Coluna | Largura | Alinhamento | Conteúdo |
|---|---|---|---|
| (seleção/checkbox) | 40 px | centro | `TaskCheckbox` circular, 20 px |
| Tarefa | flex, mínimo 280 px | esquerda | título 1 linha + `title`; 2ª linha âmbar com o motivo quando Aguardando |
| Contato | 160 px | esquerda | avatar 24 px + nome; "Sem contato" em `--muted-foreground` |
| Prioridade | 96 px | esquerda | pílula (seção 7.1) |
| Prazo | 140 px | esquerda | `Calendar` + rótulo (58 do plano); vencido em `--destructive-text` |
| Lembrete | 140 px | esquerda | `Bell` + rótulo, ou "Sem lembrete" |
| Estado | 128 px | esquerda | pílula (seção 7.2) |
| ⋮ | 40 px | centro | menu da linha |

**Linha 44 px**, `border-b border-border/60`; hover `bg-muted/40`; **selecionada** `bg-primary/10` +
barra esquerda de **3 px** `--primary` (forma a 5,20:1 / 3,40:1 — ver 1.4). **Cabeçalho 36 px**
`text-2xs` 11 / 600 caixa alta, `--muted-foreground`, `sticky top-0 bg-card`. Abaixo de 1024 px:
lista de cartões compactos (`WorkItemCard` modo `list`), sem rolagem horizontal em 360 px.

### 6.2 Linhas de grupo (051–052)

| Grupo | Ícone em disco de 24 px | Contador | Subtítulo |
|---|---|---|---|
| Atrasadas | `AlertTriangle`, `destructive-text` | nº | — |
| Hoje | `Clock`, `warning-text` | nº | "Domingo, 11 de outubro" (`text-2xs`, `--muted-foreground`) |
| Amanhã | `Calendar`, `primary-text` | nº | — |
| Próximas | `Calendar`, `primary-text` | nº | agrupado por dia (`groupUpcomingByDay`) |
| Sem prazo | `Circle`, `muted-foreground` | nº | — |
| Concluídas · últimos 7 dias | `CheckCircle2`, `success` | nº + "Ver até 30 dias →" no próprio cabeçalho | linhas riscadas, `--muted-foreground` |

Grupo recolhido mostra só ícone + nome + contador (chevron à direita). **Estado inicial (067):**
Atrasadas e Hoje abertos; Amanhã, Próximas, Sem prazo e Concluídas **recolhidos**. A escolha do
usuário passa a valer (localStorage, **D11**).

### 6.3 Regra única de datas (**D21**, 58 do plano)

Uma função pura e testada, com fuso local, usada nos **três** modos:

| Situação | Formato | Exemplo |
|---|---|---|
| Prazo/lembrete com hora | `[Ontem\|Hoje\|Amanhã], HH:mm` ou `dd MMM, HH:mm` (**dia sempre com 2 dígitos**) | "Ontem, 17:00" · "13 out., 15:00" |
| Concluída | só o dia (`dd MMM`) | "Hoje" · "Ontem" · "09 out." |
| Campo do painel / modal | dia + hora separados | "Hoje, 11/10" e "18:00" |

**Proibido** o formato "Seg, 09/09, 14:20" da imagem 04 (incoerência 6). Tooltip sempre com a data
completa (`toLocaleDateString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })`).

---

## 7. Primitivos compartilhados (69 do plano; o desenho de cada um)

Uma implementação só, usada por Lista, Quadro, Agenda, painel e modal.

### 7.1 `TaskCheckbox` (**D16**: circular em TODAS as superfícies)

Círculo de 20 px, borda 2 px `--border` (hover `--primary`), ao concluir preenche `--primary` com
`Check` branco (5,20:1) e `scale` de 0,9 → 1 em 150 ms. Em Concluído: preenchido `--success` com
`Check` na cor `--success-foreground` (5,66:1 / 7,80:1). Alvo de toque 40 px (área invisível de
10 px em volta). `role="checkbox"`, `aria-checked`, `Espaço` alterna. Riscado + `--muted-foreground`
no título quando concluída. A imagem 05 mostra **quadrado**: não adotamos (incoerência 9).

### 7.2 `PriorityPill` (**D12**: a pílula tem SEMPRE a cor da prioridade)

| Prioridade | Forma | Claro / escuro (medido) |
|---|---|---|
| Urgente | tinta `destructive/15` + texto `destructive-text`, com `font-bold` | 5,63 / 4,93 |
| Alta | **contorno**: borda `destructive` (2 px), fundo transparente, texto `destructive-text` | 6,86 / 6,01 |
| Média | tinta `warning/15` + texto `warning-text` | 4,82 / 7,29 |
| Baixa | tinta `priority-low/15` + texto `priority-low` (L 42 % claro / 60 % escuro) | 4,62 / 4,75 |

"Urgente **cheio**" da imagem 01 → aceito com diferença: o preenchimento cheio vermelho não fecha
4,5:1 com os tokens (`branco sobre --destructive` = 3,78 claro / 3,00 escuro). O que é **cheio** no
sistema é o segmento selecionado do modal (primary) e a pílula "Fazendo". Pílula altura 20 px,
`rounded-full`, `px-2`, `text-2xs` 11 / 600. Na prévia do modal a Média é **âmbar** (a imagem 04
mostra azul): é exatamente a incoerência 10 que a D12 resolve.

### 7.3 `StatusPill`

| Estado | Forma | Claro / escuro |
|---|---|---|
| Caixa de entrada | tinta `muted/15` + `muted-foreground` | 5,93 / 9,04 |
| A fazer | tinta `primary/15` + `primary-text` | 7,58 / 7,66 |
| Fazendo | **cheia** `--primary` + `--primary-foreground` | 5,20 / 5,20 |
| Aguardando | tinta `warning/15` + `warning-text` | 4,82 / 7,29 |
| Concluído | tinta `success/15` + `success` | 4,58 / 5,99 |
| Cancelada | tinta `muted/15` + `muted-foreground` | 5,93 / 9,04 |

### 7.4 `ContactAvatar` (124 do plano)

24 px (linha/cartão) · 32 px (painel) · 40 px (modal). Usa `avatar_url` quando existe, senão as
iniciais (2 letras, `text-2xs` 11 / 700) sobre a cor determinística: hash do `contact.id` sobre a
lista de tokens **`chart-1`…`chart-10`** (paleta que o repo já tem), com o texto em
`--primary-foreground` quando o fundo for escuro e `--foreground` quando claro — a escolha é feita
pelo próprio token `chart-N` (pares `.dark` ajustados). Contraste do texto ≥ 4,5:1 é pré-requisito
do cartão (55 do plano mede e corrige).

### 7.5 `DateLabel`

`Calendar` 16 px + rótulo da seção 6.3. Cores: vencido `--destructive-text`; "Hoje"
`--warning-text`; futuro `--muted-foreground`.

---

## 8. Coluna do Quadro (etapa 079)

Largura **300 a 340 px** (mínimo 280 px); fundo `bg-card`, raio 14 px (`--radius`),
`border border-border/70`, `overflow-hidden`. Cabeçalho **sticky** de 40 px: título `text-sm`
14 / 600 + contador (`text-xs` 12 / 700 tabular) + `Info` 16 px com a política em tooltip.
**Subtítulo curto** (80–81): 1 linha, `text-2xs` 11, `--muted-foreground`, `truncate`:

| Coluna | Subtítulo | Rótulo do contador |
|---|---|---|
| Caixa de entrada | "A organizar" | "n" |
| A fazer | "Próximas ações" | "n" |
| Fazendo | "Conclua uma para iniciar outra" | "n/3" |
| Aguardando | "Dependências externas" | "n" |
| Concluído | "Últimos 7 dias" | "n" |

A **política longa** vira tooltip (`title`), sai do cabeçalho.

### 8.1 Limite de Fazendo (082 — **G-6**: 3 duro, Aguardando 5 suave)

Barra de progresso **segmentada** de 3 traços (cada um 1/3 da largura, 4 px de altura,
`rounded-full`): preenchido `--primary`, vazio `--muted`; **cheia**: `--destructive-text`.
Rodapé de 32 px com `Info` 16 px e o texto "Seu limite é de 3 tarefas em execução."
(`text-2xs`, `--muted-foreground`). Coluna cheia: título e contador em `--destructive-text` e
`ring-1 ring-destructive/40`. Soltar em coluna cheia (083): tremor curto de 150 ms
(`motion-safe`; com movimento reduzido só a borda pisca), toast explicativo e o cartão volta.

### 8.2 Cartão do Quadro (084–090)

Altura adaptativa, `p-2.5`, raio 12 px (`--radius-lg`), `border-border/70`, `bg-card`;
hover `--elev-2`; **selecionado** borda `--primary` (2 px) + `bg-primary/10` + alça `GripVertical`
16 px. Ordem interna:

1. Linha 1: `TaskCheckbox` 20 px (círculo, D16) + título até 2 linhas (`text-sm` 14 / 500) + `⋮`.
2. Linha 2: `PriorityPill` + `DateLabel`; se **Urgente**, a pílula fica **ao lado do título** (085).
3. `AlertTriangle` + **"Atrasada"** em `--destructive-text` quando vencido, junto ao prazo vermelho (086).
4. Prazo + `Bell` do lembrete (087); no cartão selecionado/em Fazendo, rótulos "Prazo" e "Lembrete"
   em **duas colunas** de 50 %.
5. Descrição de até 2 linhas (`text-2xs`, `--muted-foreground`) no selecionado e em Fazendo (088).
6. **Aguardando:** ponto de 8 px `--warning` + motivo truncado com `title` (089).

**Contato (D18):** avatar 24 px + nome (`text-2xs`, `--muted-foreground`) — não "Contato: Nome" em
texto (incoerência 11).

### 8.3 Captura e Concluído

- **Cartão "Capturar tarefa"** tracejado (`border-dashed border-border/70`) no fim **só da Caixa de
  entrada**, com `Plus` + "Pressione Enter para criar" (`text-2xs`) que abre o `QuickAdd` compacto
  (**D19**; incoerência 12 — o "+ Nova tarefa" em cada coluna da imagem 03 não entra).
- **Concluído:** ícone de menu no cabeçalho, cartões com `Check` verde e data, rodapé
  "Ver até 30 dias →" (`text-2xs`, `--primary-text`). Ordem por data de conclusão (**G-8**, decisão
  declarada no STATUS) — **sem** "ordenar coluna".
- **Toggle "Concluídas"** (093) mostra/oculta a coluna Concluído, compartilhado com a Lista e a
  Agenda (**D11**: preferência em localStorage).

### 8.4 Rolagem (098)

Rolagem horizontal com `snap-x` por coluna e sombra nas bordas (`--elev-3`, só quando há conteúdo
além); rolagem vertical **interna** por coluna. Nada de rolagem horizontal da página.

---

## 9. Agenda (etapa 107)

Duas colunas ≥ 1280 px: lista do dia (flex) + painel de **340 px**. Abaixo de 1280 px o painel vira
seção sob a lista; abaixo de 768 px a faixa de dias rola com `snap` (sem rolagem horizontal da página).

### 9.1 Faixa de atrasadas (108)

Largura total, `bg-destructive/10`, borda `destructive/30`, altura 48 px, `AlertTriangle` 20 px
`--destructive-text` + "N tarefas atrasadas" (`text-sm` 14 / 600) + "Ver tarefas ⌄"
(`text-2xs`, `--primary-text`) que expande a lista.

### 9.2 Semana e dias (109–112)

Título "Próximos 7 dias" (`text-sm` 14 / 600) com "11 – 17 de outubro de 2026" à direita
(`text-2xs`, `--muted-foreground`) e a nota "O lembrete avisa você. O prazo marca a entrega."
(`text-2xs`, `--muted-foreground`). Sete cartões de **64 px**: sigla (`text-3xs` 10 / 600 caixa
alta), número (`text-lg` 18 / 700) e pílula "Hoje" (`text-3xs`, `--primary-text` sobre `primary/15`);
selecionado com borda `--primary` 2 px + `--elev-2`. ←/→ navegam; `Enter`/`Espaço` selecionam.

**Pontos com significado (111):** até 3 pontos de 6 px sob o número — **azul = lembrete**
(`--primary`), **âmbar = prazo** (`--warning`), **vermelho = atrasada** (`--destructive`); legenda
discreta de uma linha e `aria-label` no cartão do dia: "2 lembretes, 1 prazo". O significado é o
deduzido da imagem 02 (Hoje com 4 prazos e 2 lembretes) e a etapa 111 confirma no navegador.

### 9.3 Dia e seções (113–117)

Cabeçalho do dia: "Hoje, 11 de outubro" (`text-base` 16 / 600), "N tarefas com prazo · M lembretes"
(`text-2xs`, `--muted-foreground`) e "+ Adicionar para hoje" (`text-2xs`, `--primary-text`, alvo
40 px). Três seções, cada uma com cabeçalho `text-2xs` 11 / 700 caixa alta:

- **ALARMES** (114): `Bell` + **horário do lembrete à esquerda** (coluna de 44 px, `text-xs` 12 / 700
  tabular), checkbox, título, contato, prioridade, chip "Lembrete" com "Prazo hoje, 14:00" e estado.
- **PRAZOS** (115): horário do prazo à esquerda, checkbox, título, contato, prioridade, o rótulo de
  prazo e estado, ordenado por hora.
- **SEM HORA** (116): `CircleDashed` + "Nenhuma tarefa sem horário para hoje." quando vazio; entram
  aqui as tarefas com prazo gravado só com o dia (meia-noite local, regra vigente do STATUS).

**D20:** a pílula de estado aparece **sempre**, em ALARMES e em PRAZOS (a imagem 02 omite numa
linha — ruído). A mesma tarefa pode estar nas duas seções quando tem prazo e lembrete (117).

### 9.4 Painel da Agenda (118–121)

- **Resumo do dia:** dois mini-KPIs ("N Tarefas com prazo" e "M Lembretes"), `text-2xl` 24 tabular,
  com a data do dia selecionado (`text-2xs`).
- **Tarefa selecionada:** avatar 32 px + nome + "**Cliente**" (`text-2xs`, `--muted-foreground`;
  depende do `contact_type` da etapa 068) + "Abrir conversa ↗"; chips "Alta prioridade" e o estado;
  **Prazo** e **Lembrete** com `DateLabel`; descrição de 3 linhas; botão "Abrir tarefa".
- **Sem seleção:** "Selecione uma tarefa para ver o resumo" (`--muted-foreground`) e o foco inicial
  na primeira linha. Clique/teclado troca a seleção **sem** abrir o painel lateral; "Abrir tarefa"
  abre (121).

---

## 10. Painel "Detalhes da tarefa" (etapa 131)

**Largura 480 px** (padrão) a **560 px** (máximo); expandido ~70 % (146). Cabeçalho de **56 px**:
ícone `CalendarCheck` em quadrado `--primary/15` de 32 px, "Detalhes da tarefa" (`text-base` 16 /
600; hoje "Editar tarefa" → renomear), expandir (`Maximize2`) e fechar (`X`), ambos com alvo 40 px.
Corpo `px-5 py-4`, `gap-4`; **rodapé fixo de 64 px** (141–142).

**D14:** no desktop o painel é **não modal e acoplado à direita** — sem fundo escurecido, Quadro
visível e clicável por baixo (clicar noutro cartão troca a tarefa do painel); **abaixo de 768 px** é
bottom sheet **modal** com foco preso. `F6` alterna painel ↔ lista/quadro; `Esc` fecha e devolve o
foco ao item (144).

Conteúdo, de cima para baixo:

1. **Badges** (133): estado atual (ex.: Aguardando âmbar) e prioridade (ex.: Alta vermelho), ao lado
   do título, atualizando ao editar.
2. **Título** (`text-lg` 18 / 600) e **Estado / Prioridade** lado a lado como selects com ícone
   colorido; opções bloqueadas pelo limite com explicação (134).
3. **Motivo da espera** (135): caixa com borda `--warning` e selo "Obrigatório" (`text-3xs`, caixa
   alta, âmbar) só quando Aguardando; erro inline se vazio; foco automático quando veio do arrastar.
   **G-6/D9:** ausência de motivo bloqueia a mudança.
4. **Contato vinculado** (136): select com avatar + "Abrir conversa ↗" (`--primary-text`).
5. **Planejamento** (137): dois cartões lado a lado — **Prazo** ("Até quando concluir") e
   **Lembrete** ("Quando avisar você") — cada um com data e hora no formato da seção 6.3
   ("Hoje, 11/10" + "18:00").
6. **Validações** (138): lembrete depois do prazo → `--destructive-text`; lembrete no passado ou
   faltando < 30 min → `--warning-text`; antes do prazo → "Agendado" + `Check` em `--success`.
7. **Ações do lembrete** (139): "✓ Agendado · Adiar ▾ · Remover" (15 min, 1 h, Amanhã 9h).
8. **Descrição** (140): `textarea` redimensionável com contador (`text-2xs`) e "Criada em 09 out.
   2026" (`text-2xs`, `--muted-foreground`) — `dd MMM` da 6.3.
9. **Rodapé** (141–142): ponto de 8 px `--warning` + "Alterações não salvas"
   (`--warning-text`) ou "Tudo salvo" (`--success`) + dica "Ctrl + Enter para salvar"; botões
   **"Concluir"** (contorno `--success`, texto `--success`), **"Salvar alterações"** (primary cheio,
   5,20:1, desabilitado sem alteração) e `⋮`.

Fechar com alterações pede "Descartar alterações?"; `Esc` e clique fora respeitam a proteção (143).

---

## 11. Modal "Nova tarefa" (etapa 153)

**Duas colunas:** formulário de **560 px** + prévia de **340 px**, raio 24 px (`--radius-2xl`
24 px), overlay `--elev-5`, `p-6`, intervalo de 24 px. Cabeçalho com `SquarePen` em quadrado
`--primary/15` de 32 px, "Nova tarefa" (`text-xl` 20 / 600, `--font-display`) e "Capture agora.
Organize o próximo passo." (`text-sm`, `--muted-foreground`), com `X` de fechar. **Foco inicial no
título.** Abaixo de 900 px a prévia vira acordeão sob o formulário; em 360 px o rodapé fica fixo
(169). Carregado sob demanda (154).

| Campo | Desenho | Medida |
|---|---|---|
| Título da tarefa | input grande (`text-base` 16), obrigatório, contador discreto `n/200`, erro inline | altura 44 px |
| Contato | combobox com avatar 24 px + nome e "Sem contato" | 44 px |
| Prioridade | segmentado Baixa / Média (padrão) / Alta / Urgente; **selecionado** `bg-primary` + `--primary-foreground` (5,20:1); pílulas fora do segmento usam a cor da prioridade (**D12**/7.2) | 36 px |
| Prazo — Até quando concluir | data + hora + atalhos Hoje / Amanhã / Próx. semana (selecionado em primary); permite limpar | 44 px |
| Lembrete — Quando você quer ser avisado | data + hora + atalhos Em 1h / Amanhã, 9h / Próx. seg., 9h | 44 px |
| Coerência prazo × lembrete | verde "Lembrete programado para antes do prazo." (`--success`); âmbar/vermelho nos demais casos + "Ajustar para 1 h antes do prazo" | faixa de 28 px |
| Destino | `Inbox` + "A tarefa será criada na Caixa de entrada." (**D10**) | — |
| Prévia da tarefa | "Confira antes de criar." + cartão vivo (`WorkItemCard` modo prévia) com título, prioridade, contato, prazo, lembrete e destino | 340 px |
| Caixa informativa | "Prazo é a entrega. Lembrete é o aviso. …" (`text-2xs`, `--muted-foreground`, fundo `--muted/40`) | — |
| Rodapé | dica "Enter para criar" (`--muted-foreground`), "Cancelar" (contorno), "+ Criar tarefa" (primary cheio) | 64 px |

Teclado (167): `Enter` no título cria, `Ctrl+Enter` em qualquer campo cria, `Esc` cancela — com
confirmação se houver título digitado (170). Criação otimista (168): fecha, o item aparece na Caixa
de entrada com realce de 1,2 s e toast "Tarefa criada" + "Desfazer"; narração para leitor de tela.

---

## 12. Regras de incoerência registradas (D12, D16–D21)

| # | Incoerência entre as imagens | Regra adotada |
|---|---|---|
| **D12** | Pílula "Média" é âmbar (01, 05) e azul (prévia da 04) | A pílula de prioridade tem **sempre** a cor da prioridade — **Média âmbar** (`warning/15` + `warning-text`, 4,82 / 7,29), inclusive na prévia. Só o **segmento selecionado** do controle usa `primary`. |
| **D16** | Checkbox: círculo (01, 02, 04) e quadrado (05); ausente nos cartões abertos da 03 | **Círculo** em todas as superfícies, com o comportamento de `--primary`/`--success` do 7.1. |
| **D17** | Badge "Tarefas 4" nas imagens 03/04 (número ilustrativo) | Mantém a regra vigente (atrasadas + lembretes disparados não tratados, `useMyWorkItemsBadgeInfo`); confere só cor (`warning`/`destructive`) e texto acessível. |
| **D18** | Contato: avatar + nome (01–04) e "Contato: Nome" em texto (05) | Avatar pequeno + nome em todas as superfícies (7.4). |
| **D19** | Captura no Quadro: "+ Nova tarefa" em cada coluna (03) e só o cartão tracejado (05) | Só a **Caixa de entrada** captura (coerente com D10). |
| **D20** | Na Agenda a pílula de estado some numa linha de ALARMES (02) | A pílula aparece **sempre**, em ALARMES e em PRAZOS. |
| **D21** | Quatro formatos de data diferentes entre as imagens | Uma **regra única** (seção 6.3); "Seg, 09/09, 14:20" é proibido. |

**Outras incoerências resolvidas aqui:** densidades de KPI → **D2** (card na Lista/Agenda, faixa no
Quadro, 4.3) · seletor de modos → **D3** (preenchido, seção 5) · colunas do Quadro → **D1** (por
estado, imagem 05) · cor de "Limite atingido" → vermelho em todas (4.2) · rodapé "Dados ilustrativos •
Proposta de design" → **D7**, não implementar · barra superior e menu lateral → **D8**, fora do
escopo.

---

## 13. Alinhamento com as decisões já vigentes do módulo

Fonte: `docs/design/TAREFAS_QUADRO_STATUS.md` (auditorias de 29/09 a 09/10). Este documento **não
revoga** nada disto:

| Decisão vigente | Como este desenho a respeita |
|---|---|
| **G-5** sem parser de linguagem natural | A captura (troca de chips) mantém só os atalhos 1/2 e `!`. |
| **G-6** WIP Fazendo = 3 (duro), Aguardando = 5 (suave) | KPI (4.2), barra e resta do limite (8.1) e motivo obrigatório (135) só **mostram** o que já é regra. |
| **G-8** concluídas por 7 dias | KPIs, Lista e Quadro; 30 dias atrás de "Ver até 30 dias". |
| **B13** uma query só para os três modos | Nenhuma seção pede consulta nova; a Agenda usa só os itens já carregados (126 do plano). |
| "Sem hora" = prazo gravado só com o dia | Seção SEM HORA da Agenda (9.3). |
| Concluído do Quadro ordenado por data de conclusão | 8.3 — sem "ordenar coluna". |
| Filtro é recorte de tela; KPI mostra o trabalho real | KPI clicável filtra a lista, mas o número do KPI continua real (4.2). |
| Alvos ≥ 40 px, contraste AA, movimento reduzido | R2, R5, R6. |

---

## 14. Como conferir cada desenho (o que o portão deve medir)

1. **Contraste:** só contratos do repositório — `tests/contracts/contraste-aa-componentes.contract.test.ts`
   (mesma fórmula WCAG 2.1 da 1.4; o fundo de cada par é a tinta /15 composta sobre `--card`, como
   está dito lá) e o portão `tests/contracts/a11y-contraste-gate.contract.test.ts` (bloqueia
   `color-contrast` serious/critical do axe), nos dois temas. Nenhum número desta seção depende de
   script fora do repositório. O que a tabela A mostra reprovando não pode reaparecer no código.
2. **Medidas:** capturas em 360, 768 e 1280 px, claro e escuro (captura de tela é do dono do cartão
   que a gerar; nunca versionada junto com o defeito).
3. **Vocabulário:** nenhum "Alarme" visível ao usuário — só "Lembrete" e "Prazo" (bloco I do plano).
4. **Escopo:** 0 migration, 0 Edge Function, 0 dependência nova; nenhuma cor literal no diff.
5. **Semântica:** toda superfície nova usa os primitivos da seção 7 — nenhuma quinta implementação
   de pílula, data ou avatar.
