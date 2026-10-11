Especialista: designer (design-system-zapp)

CONCLUÍ: a especificação visual do módulo de Tarefas está escrita, commitada e o `zapp-verify`
rodou verde. Nada ficou em aberto neste cartão.

## O que mudou e por quê
- `docs/tarefas/ESPECIFICACOES.md` (novo, único arquivo que o cartão autoriza): a especificação
  visual do módulo de Tarefas com **uma seção por etapa** do plano (005 tokens e tema claro, 006
  ícones, 010 tipografia e espaçamento, 016 card de KPI, 031 seletor de modos, 049 tabela, 079
  coluna do Quadro, 107 Agenda, 131 painel, 153 modal), cada uma com medidas em px, token de cada
  cor/efeito, estados (repouso, hover, foco, selecionado, desabilitado, limite) e o **tema claro**
  (as 5 imagens são só do escuro). Mais a seção 12 com as incoerências entre as imagens e a regra
  adotada (**D12** e **D16 a D21** — pílula com a cor da prioridade, checkbox circular, contato como
  avatar, captura só na Caixa de entrada, estado sempre visível na Agenda, uma regra única de data) e
  a seção 13 amarrando o desenho às decisões vigentes de `docs/design/TAREFAS_QUADRO_STATUS.md`
  (G-5 sem parser, G-6 limites 3/5, G-8 concluídas por 7 dias, B13 uma query só).
- O inventário (seção 1) foi levantado no código ATUAL, não no plano: os tokens de prioridade,
  estado e KPI existem em `src/styles/tokens.css`; `--priority-low-text`, `--kpi-tile-*-text` e um
  par de texto para `--info` **não existem** — o documento proíbe criá-los e manda usar os pares que
  já existem. `text-kpi-value` (34 px) e `text-2xs`/`text-3xs` existem no `tailwind.config.ts`;
  `--chart-1`…`--chart-10` existem como variável mas **não** têm classe Tailwind. O `text-[13px]`
  ainda usado em 8 pontos do módulo (título de coluna, rótulo de KPI, grupos, filtros) é arbitrário
  sem token de 13 px: a seção 3 dá o degrau que o substitui.
- Nenhum código de produto, nenhuma migration, nenhuma dependência, nenhuma cor literal: o diff é um
  arquivo `.md`.

## Prova
- **Verificação do repo:** `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (80s)` com
  `OK tipos 78s`, `OK lint`, `OK dependencias`, `OK db_guard`, `OK migrations`.
- **Contraste (a prova do documento):** `node .tmp/medir-contraste.mjs`
  - vermelho antes (os pares que o código usa hoje, tabela A) → `A: 12 pares, 12 falhas`
    (ex.: `kpi-tile-green-fg sobre kpi-tile-green/13 — claro 1.51 FALHA`, mínimo 3:1;
    `status-pending usado como TEXTO sobre card — claro 1.79 FALHA`, mínimo 4,5:1).
  - verde depois (os pares que a especificação adota, tabela B) → `B: 23 pares, 0 falhas`
    (ex.: `blue: L35% claro / L72% escuro sobre tinta /13 → claro 7.81 OK; escuro 6.28 OK`;
    `Média — tinta âmbar /15 + texto → claro 4.82 OK; escuro 7.29 OK`;
    `Baixa — azul L42% claro / L60% escuro → claro 4.62 OK; escuro 4.75 OK`).
  - o script lê os tokens de verdade de `src/styles/tokens.css` (nada digitado à mão) e as duas
    tabelas estão impressas dentro do próprio documento (seções 1.4 e 1.5). É ele que sustenta a
    correção que o plano pede no tema claro: os tiles de KPI reprovam AA no claro hoje (1,51 a 2,71)
    e passam com o ajuste de luminosidade do `-fg` (5,12 a 8,09) — mesma matiz/saturação, precedente
    `--warning-text`/`--primary-text`.
- **Documento como produto (regra 9):** `python3` conferiu 613 linhas, 13 tabelas e 0 tabelas
  desalinhadas (duas linhas com `|` dentro de código foram escapadas com `\|`); os títulos das
  seções cobrem as 10 etapas pedidas; as linhas e colunas dos quadros de contraste batem com a saída
  do script.
- `npx eslint .tmp/medir-contraste.mjs` → saída vazia, exit 0 (o script temporário não suja o
  lint-ratchet).
- `docs/tarefas/ESPECIFICACOES.md` é o único arquivo no diff (o bloco FATOS MEDIDOS tem o stat).

## O que NÃO fiz e por quê
- **Não editei `src/`.** O cartão é especificação: o ajuste de token do tema claro (tiles de KPI e
  `--priority-low`) e a troca dos 8 `text-[13px]` ficam para os cartões das etapas que mexem nesses
  arquivos — aqui eles estão medidos e prescritos, não aplicados.
- **Método do inventário:** cada elemento (colunas da tabela, KPIs, faixa de dias, seções da Agenda,
  campos do painel e do modal, cores) vem da seção 3 do plano, que descreve as 5 telas item por item,
  e foi conferido no código atual do módulo (`src/components/tasks/**` e `src/styles/tokens.css`).
  Nenhum elemento foi inventado e nada aqui depende das imagens: todas as medidas saem dos tokens e
  do script de contraste. O `.tmp/medir-contraste.mjs` é temporário e não é versionado (o
  `.git/info/exclude` já ignora `.tmp`), então os números ficam no documento.
- Não criei cartão, não criei token, não criei skill; não mencionei o identificador do banco.
