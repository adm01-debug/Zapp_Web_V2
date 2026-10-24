# MAPA DO ZAPP WEB V2 — Fase M

Ordem do Joaquim (04/10/2026): mapear tudo antes de qualquer correção; escopo exclusivo Zapp Web V2. Nada foi corrigido. Base: pacote de reconciliação do GPT (PR #1869, baseline `2e7cf81c`) re-pinado em `origin/main` + leitura do banco vivo `tnnnlkbymytvtqngbbqh` via `zapp_db.py`.

## Arquivos
- [MAPA_BANCO.md](MAPA_BANCO.md) — catálogo vivo, crons, segurança, Storage
- [CRUZAMENTO_ACHADOS.md](CRUZAMENTO_ACHADOS.md) — 104 achados × código atual
- [CRUZAMENTO_R2.md](CRUZAMENTO_R2.md) — 372 registros R2 × main atual
- [MAPA_EDGE_FUNCTIONS.md](MAPA_EDGE_FUNCTIONS.md) — 75 funções vivas × repo
- [MAPA_INFRA.md](MAPA_INFRA.md) — Vercel, VPS, n8n, CI
- [MAPA_CODIGO.md](MAPA_CODIGO.md) — grafo, tamanho por área, ligação código↔banco↔edge
- `dados/` — extrações brutas (JSON)

## Incidentes e achados novos desta fase (registrados, NÃO corrigidos)
| ID | Gravidade | Resumo |
|---|---|---|
| M-DB-01 | P0 | Motor Talk X parado desde 04/10 03:07 (cron falha 549×/24 h: DELETE em storage.objects bloqueado) |
| M-DB-02 | P0 segurança | `record_incoming_call_event` (7 args, migration T26) SECURITY DEFINER executável por **anon** sem checar chamador. **Decisão do Joaquim 04/10: NÃO corrigir antes do mapa fechar.** |
| TC-004 | P1 | Confirmado no vivo: sair do grupo / remover membro do Team Chat usam coluna `role` inexistente |
| M-DB-04 | info | 99 de 166 tabelas vazias (Talk X, Multiplix, campanhas, chatbot, KB, deals, departamentos…) |

## Estado das camadas
| Camada | Estado |
|---|---|
| Banco vivo (catálogo, RLS, funções, crons, views, Storage, drift) | **feito** — drift de migrations zero; 0 tabelas sem RLS; nenhuma policy aberta a anon |
| Achados GPT 104 × código atual | **feito** — 93 de pé, 11 a reverificar |
| R3 (15) × vivo | feito (caderno seção 11) |
| R2 (372) × main atual | **feito** — ver CRUZAMENTO_R2.md |
| 27 funções SECURITY DEFINER sem checagem óbvia | **feito** — 14 falso alarme, 13 P3 de vazamento (M-DB-05), nenhuma aberta a anon |
| Edge functions implantadas × repo (73) | **feito** — 75 vivas = 73 + 2 órfãs previstas; verify_jwt OK; ver MAPA_EDGE_FUNCTIONS.md e M-INF-01 |
| Infra (Vercel, VPS/Portainer, n8n, CI) | **feito** — ver MAPA_INFRA.md; Evolution (401) e Cloudflare (desconectado) ficaram sem acesso |
| Mapa de código | **feito** — Graphify regenerado (grátis) + mapa de chamadas entre camadas; Cartographer dispensado por ora; ver MAPA_CODIGO.md |

## Fato novo (04/10 12:15 UTC)
O PR #1869 (auditoria do GPT) foi **mergeado na main** por adm01-debug: 770 arquivos, 68,4 MB em `docs/reconciliation/`. Todo clone e todo worktree do Zapp passam a carregar esse peso.

## Fechamento da Fase M (04/10/2026, ~15:15 UTC — sessão joaquim-ataides-f4)
- [MAPA_DELTA_2026-10-04.md](MAPA_DELTA_2026-10-04.md) — o que mudou depois do mapa base (main `7a1585279`, 13 crons, M-DB-06 timeouts do pg_cron, IA 401, merges do dia, PR #1869 com 71 MB).
- [REVERIFICACAO_11_ACHADOS.md](REVERIFICACAO_11_ACHADOS.md) — os 11 "Reverificar": 8 de pé, 3 parciais, 0 corrigidos.
- [BACKLOG_VERIFICADO.md](BACKLOG_VERIFICADO.md) — **fila única da V2**: 499 linhas (524 IDs de origem, sem somar), 472 de pé / 7 parciais / 4 a decidir / 16 do dono; 2 P0, 106 P1. Executor sugerido: worker 383, complexo 77, dono 20, designer 19.
- [AGENTS_MAP.md](AGENTS_MAP.md) — agentes, ferramentas, chaves (só onde ficam) e o que está proibido/quebrado.
- [PENDENCIAS_CAIXA_DECISOES.md](PENDENCIAS_CAIXA_DECISOES.md) — 14 decisões abertas do Hermes V1.
- Limites conhecidos: 424 itens "de pé por inferência" (arquivo de evidência inalterado, não relidos linha a linha); Evolution (401) e Cloudflare (desconectado) sem acesso; IA 401 não confirmável sem chamada nova.
- **Status: Fase M fechada.** O mapa fica vivo pelo sensor da V2 (`~/arquitetura-v2/sensor`, a cada 60 s) e pelo grafo (sessão joaquim-ataides-37).
