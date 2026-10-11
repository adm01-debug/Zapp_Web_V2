Especialista: workertestes (worker (testes) — area-testes-do-produto)

## O que mudou e por quê
- scripts/tarefas/seed-local-imagens.ts — a semente passou a carimbar `created_at` das 5 concluídas pelo ciclo da própria tarefa (`cicloDias` 1,0/1,2/1,4/1,6/1,8, média = 1,4 dia), para o critério D13 (tempo médio = da CRIAÇÃO à conclusão). `started_at` ficou no meio do ciclo (cicloDias/2), garantindo `created_at <= started_at <= completed_at`. O bloco `conferir()` agora mede `avg(completed_at - created_at)` nas concluídas dos últimos 7 dias e aborta se != 1,4; o comentário do topo e o doc foram alinhados a D13.
- docs/tarefas/LINHA_DE_BASE.md — a linha do tempo médio citava `started_at → completed_at`; trocada por `created_at → completed_at` (D13).

Sem migração, sem Edge Function, sem dependência nova. Roda só no banco LOCAL; recusa host não-local.

## Prova das 5 concluídas (banco local, consulta na tabela real)
```
 id  | ciclo | start_concl | coerente | ha_dias
 115 |  1.00 |        0.50 | t        |     1.0
 116 |  1.20 |        0.60 | t        |     2.0
 117 |  1.40 |        0.70 | t        |     3.0
 118 |  1.60 |        0.80 | t        |     4.0
 119 |  1.80 |        0.90 | t        |     5.0
 media = 1.4000   (todas concluídas dentro dos 7 dias; coerente = created<=started<=completed)
```
Idempotência: 2 rodadas seguidas → `tarefas 19 | contatos 4` (sem duplicar).

## Prova vermelho → verde
- vermelho antes (mutei `created_at` das concluídas para o valor antigo de 20 dias): `bun scripts/tarefas/seed-local-imagens.ts` → `error: seed tarefas-local: tempo médio esperado 1.4 dia, encontrado 17` (conferir, linha 297).
- verde depois (restaurado): `bun scripts/tarefas/seed-local-imagens.ts` → `tempo médio (created_at→completed_at) = 1.4 dia`; `14 abertas (3+4+3+4), 5 concluídas, 2 atrasadas, 4 para hoje`; `contatos: 4 (2 com foto, 2 sem foto, 2 cliente)`.
- recusa fora do banco local: `API_URL=https://projeto.supabase.co bun scripts/tarefas/seed-local-imagens.ts` → `error: seed tarefas local: API_URL aponta para host não-local (projeto.supabase.co). Proibido — só banco local.`

## O que NÃO fiz e por quê
- Etapa 003 (capturas visuais): recortada por acordo do planejador para o cartão `t_9807f20f` (já na fila). Este cartão entrega só 004 e 009.
- Não toquei banco/Edge/migração nem qualquer arquivo fora de `scripts/tarefas/` e `docs/tarefas/`.
