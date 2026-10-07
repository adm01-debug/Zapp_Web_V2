# Relatório — redesign da aba Arquivos do painel de chat (etapas 47, 48 e 50)

Especialista: worker (design) (design-system-zapp)

Cartão `t_830c5962` (pai `t_6c2d8281`) · branch `v2/arquivos-local-e2e-2-2610070240a1bc` ·
HEAD `4cc90f2663fc9df63a8b13019866e3cbbd32f825` (código avaliado) ·
plano `docs/design/PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_50_ETAPAS_2026-10-01.md`.
Toda evidência é medição real no navegador contra o stack **local** (R1, decisão
`~/hermes-workspaces/.decisoes/20261006-184653-arquivos-local-only-qa.md`), usuário sintético
(`e2e.arquivos@example.com`) e banco local; nada toca produção.

## 1. Artefatos desta entrega

| Versionado | O que é |
| --- | --- |
| `docs/design/RELATORIO_REDESIGN_ARQUIVOS_CHAT_PANEL_2026-10.md` | este relatório |
| `docs/design/evidence/arquivos-chat-2026-10/capturas/medicoes.json` | números medidos: 17 capturas, 8 layouts de colunas, teclado/ARIA, contraste por tema, movimento |
| `docs/design/evidence/arquivos-chat-2026-10/auditar-evidencia.mjs` | auditoria automática desta pasta (seção 9) |
| `docs/design/evidence/arquivos-chat-2026-10/log-spec-files-tab.txt` | saída crua do spec local (`10 passed`) |
| `docs/design/evidence/arquivos-chat-2026-10/capturas/*.jpg` | 18 capturas 1920×1080 |

Os scripts que geraram as medições (`capturar-arquivos.mjs`, `medir-teclado-aria.mjs`,
`medir-colunas.mjs`, `medir-tab-completo.mjs`, `medicao.mjs`) e os brutos de execução
(`metricas.json`, `teclado-aria.json`, `colunas-capacidade.json`, `tab-completo.json`) ficam no
workspace da tarefa, mas **não** foram versionados: o diff do cartão (que já inclui as mudanças de
`e2e/` do cartão pai nesta mesma branch) tem teto de 90 000 caracteres revisáveis, e os JSONs de
execução sozinhos somam ~48 000. `capturas/medicoes.json` é o resumo fiel deles, gerado por script, e
a seção 11 mostra como reproduzir tudo. Para o `git status` do workspace ficar limpo sem versioná-los,
os oito caminhos foram listados no `exclude` local do worktree (`.git/info/exclude` do repositório) —
é arquivo de configuração local, sem efeito em diff, PR ou CI. Nada fora de
`docs/design/RELATORIO_REDESIGN_ARQUIVOS_CHAT_PANEL_2026-10.md` e
`docs/design/evidence/arquivos-chat-2026-10/**` foi tocado.

## 2. Ambiente local e prova de R1

Vite local em `http://127.0.0.1:5318`, auth/banco local (`VITE_ZAPP_LOCAL_SUPABASE_URL` em
`127.0.0.1`, conjunto `zapp-db-local`) e contato `ArquivosLocal` com 1 arquivo de cada tipo (4 itens —
os "itens" das tabelas vêm do banco local). Os scripts abortam toda requisição fora de
`127.0.0.1`/`localhost`: 6 aborts em `capturar-arquivos.mjs`, 10 em `medir-teclado-aria.mjs` e 4 em
`medir-tab-completo.mjs`, todos para host externo. `storageState` vazio — login real na UI do GoTrue local.

## 3. Spec local seguro (cartão pai `t_6c2d8281`)

```
npx playwright test e2e/files-tab.spec.ts --no-deps --reporter=line
10 passed (1.8m)          EXIT=0
```

Log cru: `docs/design/evidence/arquivos-chat-2026-10/log-spec-files-tab.txt`. É o spec que cobre a
aba, incluindo as asserções de contraste e de `prefers-reduced-motion`.

## 4. Matriz de capturas — 1920×1080 (tema × lateral × detalhes do contato × visualização)

Arquivos em `docs/design/evidence/arquivos-chat-2026-10/capturas/`; números por captura em
`docs/design/evidence/arquivos-chat-2026-10/capturas/medicoes.json`.

| Captura | Tema | Lateral | Detalhes | Modo | Itens | Contraste do texto |
| --- | --- | --- | --- | --- | --- | --- |
| `light-sidebar-expandida-detalhes-fechado-grid.jpg` | claro | expandida | fechado | grid | 4 | chip 5,17 / 5,70 · nome 17,05 |
| `light-sidebar-expandida-detalhes-aberto-grid.jpg` | claro | expandida | aberto | grid | 4 | idem |
| `light-sidebar-expandida-detalhes-aberto-list.jpg` | claro | expandida | aberto | lista | 4 | idem |
| `light-sidebar-expandida-detalhes-aberto-table.jpg` | claro | expandida | aberto | tabela | 4 | idem |
| `light-sidebar-colapsada-detalhes-fechado-grid.jpg` | claro | colapsada | fechado | grid | 4 | idem |
| `light-sidebar-colapsada-detalhes-aberto-grid.jpg` | claro | colapsada | aberto | grid | 4 | idem |
| `dark-sidebar-expandida-detalhes-fechado-grid.jpg` | escuro | expandida | fechado | grid | 4 | chip 5,17 / 10,16 · nome 16,93 |
| `dark-sidebar-expandida-detalhes-aberto-grid.jpg` | escuro | expandida | aberto | grid | 4 | idem |
| `dark-sidebar-colapsada-detalhes-fechado-grid.jpg` | escuro | colapsada | fechado | grid | 4 | idem |
| `dark-sidebar-colapsada-detalhes-aberto-grid.jpg` | escuro | colapsada | aberto | grid | 4 | idem |
| `teclado-modo-selecao.jpg` | claro | — | — | — | — | barra de seleção por teclado (item 47.5) |

O rótulo de lateral não é suposto: cada captura registra o `aria-label` real do botão no momento
(`Recolher menu` expandida, `Expandir menu` colapsada) e `detalhes_visivel`. Com a aba Arquivos ativa
o gatilho `aria-label="Detalhes do contato"` (ChatHeader) não existe, então o script troca para a aba
Chat, aciona o botão, volta e registra o estado medido.

## 5. Etapa 50 — colunas 4/6/8 somente quando couber

Medição com 3 leituras por layout, 1,5 s entre elas (layout mais largo = sidebar colapsada +
detalhes fechado; mais estreito = expandida + aberto), nos dois temas:

| Largura da área de arquivos | 3 | 4 | 5 | 6 | 8 |
| --- | --- | --- | --- | --- | --- |
| 1151 px (colapsada, detalhes fechado) | ok | ok | ok | ok | **não cabe** — "Não cabe na largura atual (máximo 6)" |
| 959 px (expandida, detalhes aberto) | ok | ok | ok | **não cabe** — máximo 5 | **não cabe** — máximo 5 |

As 3 leituras de cada layout são idênticas (estável) nos dois temas. Capturas com 4 e 6 colunas:
`colunas-4-light-sidebar-expandida-detalhes-aberto.jpg`,
`colunas-4-light-sidebar-colapsada-detalhes-fechado.jpg`,
`colunas-6-light-sidebar-colapsada-detalhes-fechado.jpg`,
`colunas-4-dark-sidebar-expandida-detalhes-aberto.jpg`,
`colunas-4-dark-sidebar-colapsada-detalhes-fechado.jpg`,
`colunas-6-dark-sidebar-colapsada-detalhes-fechado.jpg`.
8 colunas **não cabem** em nenhuma das larguras medidas (a opção existe na UI e fica desabilitada com
motivo próprio). A captura `colunas-8-dark-sidebar-colapsada-detalhes-fechado.jpg` vem da primeira
passada, quando a medição (antes de estabilizar) indicou 8 disponível — ver seção 8, item 1.

## 6. Request real e SHA do artefato servido

```
GET http://127.0.0.1:5318/                       -> 200 OK, ETag W/"183c-39dP4bCFuLFyj/znCNSIpkLvyVc", 6204 bytes
sha256 do documento servido                      = e5410e7280954afcfadb9a9a7a7f871bf925351c8e6d279b374a05dbda9b6eb5
GET /src/components/inbox/tabs/FilesTab.tsx      -> 200, 53908 bytes
sha256 do módulo servido                         = 4ae9ecff70cbec908f166c95e6c13dbc87cf0ceefd831c16958b3a1dc4d1e2e5
```

**PENDENTE com falha observada:** não existe artefato de build imutável neste fluxo (a evidência foi
feita contra o servidor de desenvolvimento), então não há SHA de release para vincular; o vínculo
provado é request real + sha256 dos bytes servidos, e o código avaliado é o HEAD
`4cc90f2663fc9df63a8b13019866e3cbbd32f825`.

## 7. Etapa 47 — teclado e ARIA (medido, não avaliado)

Ordem de Tab completa a partir do topo do documento: abas `conversation-tab-*` (1–7) → chips
`Todos4`, `Imagens1`, `Vídeos1`, `Áudios1`, `Docs1` (8–12) → `Buscar arquivos` (13) → `Ordenar
arquivos` (14) → `files-select-toggle` (15) → `Alterar layout` (16) → itens (17–32) → `Recolher painel
de detalhes` (33) e ações do contato (34+). **As chips são alcançáveis por teclado** (passos 8–12,
dentro de `files-tab`).

| Item | Medido | Veredito |
| --- | --- | --- |
| `Esc` no popover de layout | popover abriu e fechou; foco final em `files-layout-trigger` ("Alterar layout") | ok |
| Setas no radiogroup de colunas | com foco no grupo: `4 colunas` → `ArrowRight` → `5 colunas`, foco em `files-columns-5` | ok |
| `aria-sort` na tabela | `Arquivo`/`Tamanho` = `none`, `Data` = `descending`; `Seleção`/`Tipo`/`Remetente`/`Ações` sem `aria-sort` | ok |
| Contagem da seleção anunciada | `aria-live="polite"` no `<p>` interno ("4 selecionados…"); o contêiner da barra não tem `aria-live` (`null`) | ok no elemento que muda |
| `Esc` limpa a seleção | 2 `Esc`; barra oculta, `aria-pressed` de `Selecionar` = `false`, nenhum diálogo aberto, 4 itens intactos | ok |
| Ordem de Tab por visualização | grid e lista: busca → ordenação → seleção → layout → item (`Visualizar`/nome/`Mais ações`); tabela: + cabeçalhos `Arquivo`, `Tamanho`, `Data` antes dos itens | ok |

## 8. Etapa 48 — contraste por tema e redução de movimento

O script recarrega a página a cada tema e registra a classe aplicada e o fundo do `body`, porque o
`ThemeProvider` reaplica o tema no boot (a primeira medição, sem reload, repetiu os valores do tema
claro nos três — descartada).

| Alvo | Claro (`rgb(246,247,249)`) | Escuro (`rgb(14,14,16)`) | Alto contraste (`rgb(255,255,255)`) |
| --- | --- | --- | --- |
| gatilho de layout com foco | 15,91 | 18,43 | 21,00 |
| chip ativo `Todos` | 5,17 | 5,17 | 8,77 |
| chip `Docs` | 5,70 | 10,16 | 12,63 |
| nome do documento | 17,05 | 16,93 | 21,00 |
| metadados do item | 17,05 | 16,93 | 21,00 |

Todos ≥ 4,5 nos três temas. Nenhum desses alvos tem `box-shadow` (por isso não há razão de anel de
foco a medir neles). Redução de movimento (`prefers-reduced-motion: reduce`):

```
{"evento":"reducao-de-movimento","reduceAtivo":true,"duracaoMaximaAbaMs":0.01,"duracaoMaximaListaMs":0.01}
```

## 9. Auditoria automática

`node docs/design/evidence/arquivos-chat-2026-10/auditar-evidencia.mjs` (executado nesta entrega)
confere: todo caminho `docs/design/...` citado aqui existe; toda captura de `medicoes.json` está
citada e existe no disco; os 8 cruzamentos de lateral, os 3 modos, os 2 temas, as colunas 4/6/8 e as
medições de contraste/teclado/movimento estão registrados; a matriz deste relatório tem uma linha por
combinação obrigatória. Saída desta entrega:

```
AUDITORIA OK — 68 verificações, 17 capturas, 12 linhas na matriz.      EXIT=0
```

## 10. Limites e pendências honestas

1. **Divergência corrigida, não escondida:** a primeira passada de colunas mediu antes de o contêiner
   estabilizar e registrou "8 cabe" no tema escuro (gerando
   `colunas-8-dark-sidebar-colapsada-detalhes-fechado.jpg`). A re-medição (3 leituras) mostra 8
   indisponível em todas as larguras; o registro antigo segue no bruto, sem ser usado como resultado.
2. **Alvos de toque (44×44) não medidos** nesta passada; a etapa 48 do plano os cita.
3. **8 colunas sem captura estável** por não caber em nenhuma largura medida em 1920×1080 — mostrá-las
   exigiria largura maior ou outra densidade de card (decisão de produto).
4. **Medição só em 1920×1080**; telas menores, toque e o modo responsivo do painel de detalhes não
   foram medidos.
5. **Sem SHA de artefato de build** (seção 6): a prova é o request real + sha256 dos bytes servidos.
6. **Rótulo impreciso no bruto:** a chave `47.1b-ordem-de-tab-reversa-do-campo-de-busca` do JSON de
   execução descreve 6 `Shift+Tab` que partiram do 14º passo (já sobre um item), não do campo de
   busca; a varredura correta é a do topo do documento, transcrita na seção 7.
7. **Scripts e brutos fora do commit** (seção 1) por causa do teto de 90 000 caracteres; os números
   estão integralmente em `docs/design/evidence/arquivos-chat-2026-10/capturas/medicoes.json` e neste
   relatório.

## 11. Como reproduzir

```
cd ~/hermes-workspaces/Zapp_Web_V2/arquivos-local-e2e-2-2610070240a1bc
set -a; . .tmp/local-env.sh; set +a
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5318 npx playwright test e2e/files-tab.spec.ts --no-deps --reporter=line
node docs/design/evidence/arquivos-chat-2026-10/capturar-arquivos.mjs
node docs/design/evidence/arquivos-chat-2026-10/medir-teclado-aria.mjs
node docs/design/evidence/arquivos-chat-2026-10/medir-colunas.mjs
node docs/design/evidence/arquivos-chat-2026-10/medir-tab-completo.mjs
node docs/design/evidence/arquivos-chat-2026-10/auditar-evidencia.mjs
```

`zapp-verify . --rapido` na raiz do workspace: `VERDE SEM BANCO (124s)` — `db_guard`, `tipos`, `lint`
e `migrations` OK; `banco_local` **não verificado** (o passo exige o nome do conjunto como terceiro
argumento). EXIT=0.
