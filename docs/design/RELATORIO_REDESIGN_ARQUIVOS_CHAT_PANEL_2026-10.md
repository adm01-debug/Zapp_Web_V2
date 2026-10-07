# Relatório — aba Arquivos do painel de chat (etapas 47, 48 e 50)

Especialista: senior (docs/design)

Escopo deste refazer: reduzir o diff recusado por tamanho, mantendo só relatório, log, resumo de medições, auditoria e capturas necessárias dentro de `docs/design/RELATORIO_REDESIGN_ARQUIVOS_CHAT_PANEL_2026-10.md` e `docs/design/evidence/arquivos-chat-2026-10/**`. Removi do commit o script gerador `medicao.mjs` e a captura instável de 8 colunas; 8 colunas fica registrada como medição PENDENTE porque não coube de forma estável em 1920×1080.

## Fonte local segura

- Pai consumido: `t_6c2d8281`.
- Fluxo local: Vite em `http://127.0.0.1:5318`, banco/auth local, usuário sintético `e2e.arquivos@example.com`, viewport 1920×1080.
- Spec local seguro: `npx playwright test e2e/files-tab.spec.ts --no-deps --reporter=line` -> `10 passed (1.8m)`, `EXIT=0`.
- Log cru versionado: `docs/design/evidence/arquivos-chat-2026-10/log-spec-files-tab.txt`.
- Resumo medido versionado: `docs/design/evidence/arquivos-chat-2026-10/capturas/medicoes.json`.

## Request real e SHA

PENDENTE: este commit não versiona arquivo de prova dos bytes servidos por request real (`/` e `FilesTab.tsx`). Sem esse arquivo rastreável, o relatório não afirma ETag nem sha256 numérico. Também não houve artefato de build imutável neste fluxo.

## Matriz 1920×1080 — tema × sidebar × detalhes × modo

| Captura | Tema | Sidebar | Detalhes | Modo | Itens | Contraste |
| --- | --- | --- | --- | --- | --- | --- |
| `light-sidebar-expandida-detalhes-fechado-grid.jpg` | light | expandida | fechado | grid | 4 | chip 5,17 / 5,70; nome 17,05 |
| `light-sidebar-expandida-detalhes-aberto-grid.jpg` | light | expandida | aberto | grid | 4 | idem |
| `light-sidebar-colapsada-detalhes-fechado-grid.jpg` | light | colapsada | fechado | grid | 4 | idem |
| `light-sidebar-colapsada-detalhes-aberto-grid.jpg` | light | colapsada | aberto | grid | 4 | idem |
| `dark-sidebar-expandida-detalhes-fechado-grid.jpg` | dark | expandida | fechado | grid | 4 | chip 5,17 / 10,16; nome 16,93 |
| `dark-sidebar-expandida-detalhes-aberto-grid.jpg` | dark | expandida | aberto | grid | 4 | idem |
| `dark-sidebar-colapsada-detalhes-fechado-grid.jpg` | dark | colapsada | fechado | grid | 4 | idem |
| `dark-sidebar-colapsada-detalhes-aberto-grid.jpg` | dark | colapsada | aberto | grid | 4 | idem |
| `light-sidebar-expandida-detalhes-aberto-list.jpg` | light | expandida | aberto | list | 4 | 5,17 / 5,70 / 17,05 |
| `light-sidebar-expandida-detalhes-aberto-table.jpg` | light | expandida | aberto | table | 4 | 5,17 / 5,70 / 15,91 |

As oito primeiras linhas cobrem as 4 combinações de laterais em light e dark. As duas últimas provam os modos Lista e Tabela sem duplicar toda a matriz; Grid já está coberto nas oito linhas.

## Colunas 4/6/8 quando couber

| Captura/medição | Tema | Sidebar/detalhes | Resultado |
| --- | --- | --- | --- |
| `colunas-4-light-sidebar-expandida-detalhes-aberto.jpg` | light | expandida/aberto | 4 cabe |
| `colunas-4-light-sidebar-colapsada-detalhes-fechado.jpg` | light | colapsada/fechado | 4 cabe |
| `colunas-6-light-sidebar-colapsada-detalhes-fechado.jpg` | light | colapsada/fechado | 6 cabe |
| `colunas-4-dark-sidebar-expandida-detalhes-aberto.jpg` | dark | expandida/aberto | 4 cabe |
| `colunas-4-dark-sidebar-colapsada-detalhes-fechado.jpg` | dark | colapsada/fechado | 4 cabe |
| `colunas-6-dark-sidebar-colapsada-detalhes-fechado.jpg` | dark | colapsada/fechado | 6 cabe |
| 8 colunas | light/dark | 959 px e 1151 px | PENDENTE: medição estável diz “não cabe” (máximo 5 ou 6); sem captura estável obrigatória |

Limites reais medidos: 959 px (sidebar expandida + detalhes aberto) aceita 3/4/5 e recusa 6/8; 1151 px (sidebar colapsada + detalhes fechado) aceita 3/4/5/6 e recusa 8. O `medicoes.json` preserva uma leitura de tentativa única em dark + sidebar colapsada + detalhes fechado que marcou 8 colunas como `true`; essa leitura é instável e contradiz as leituras estáveis de 3 repetições, todas com `cabe["8"] === false`, por isso a conclusão versionada é PENDENTE/não cabe.

## Teclado, ARIA, contraste e movimento

Evidência visual de seleção por teclado: `teclado-modo-selecao.jpg`.

| Item | Resultado medido |
| --- | --- |
| Ordem de Tab | sequência versionada começa no passo 8: chips Todos/Imagens/Vídeos/Áudios/Docs 8–12; busca 13; ordenar 14; seleção 15; layout 16; itens 17–32 |
| Esc no popover | abriu/fechou e devolveu foco a `files-layout-trigger` |
| Setas no radiogroup | `4 colunas` -> ArrowRight -> `5 colunas`, foco em `files-columns-5` |
| `aria-sort` | Arquivo/Tamanho = `none`; Data = `descending`; colunas não ordenáveis sem `aria-sort` |
| Seleção anunciada | `aria-live="polite"` no elemento que muda; 2 Esc limpam seleção, barra some, 4 itens permanecem |
| Contraste | light: 15,91 / 5,17 / 5,70 / 17,05; dark: 18,43 / 5,17 / 10,16 / 16,93; alto contraste: 21,00 / 8,77 / 12,63 / 21,00 |
| Movimento reduzido | `prefers-reduced-motion: reduce`, duração máxima da aba 0,01 ms e lista 0,01 ms |

## Pendências honestas

1. Sem prova versionada dos bytes de request real; por isso ETag e sha256 numérico ficam PENDENTES neste relatório.
2. Sem SHA de artefato de build imutável; não houve build/release imutável neste fluxo.
3. 8 colunas não couberam de forma estável em 1920×1080; resultado fica como medição PENDENTE, não como captura.
4. Alvos de toque 44×44 e responsividade abaixo de 1920×1080 não foram medidos neste cartão.
5. Scripts e brutos geradores não foram versionados para manter o diff revisável; o commit contém somente resumo rastreável, log, auditoria e capturas.

## Auditoria automática

`node docs/design/evidence/arquivos-chat-2026-10/auditar-evidencia.mjs` confere existência dos caminhos versionados e dos nomes relativos de capturas citados no relatório; presença do log e do `medicoes.json`; linha de tabela para cada captura; 8 cruzamentos light/dark × sidebar × detalhes; 3 modos; colunas 4/6 com captura; linha de 8 colunas como PENDENTE com leituras estáveis `cabe["8"] === false`; explicação da leitura instável; teclado/ARIA; contraste; movimento; e ausência de ETag/sha256 numérico sem arquivo de prova versionado.
