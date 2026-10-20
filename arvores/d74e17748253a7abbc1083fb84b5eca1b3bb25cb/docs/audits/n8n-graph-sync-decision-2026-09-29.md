# E45 / E06 — Graph Sync Dispatcher N8N: Decisão de Aposentadoria

> Documento criado em 2026-09-29 para fechar as etapas E06 e E45 do
> `PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md`.

## Contexto

O N8N tinha um workflow "Graph Sync — Dispatcher" (`id: 67dWSoWEPUGTX5mA`) que deveria
rodar a cada 15 minutos para manter o grafo `graphify-out/` atualizado.

**Histórico de falhas:**
- 2026-09-15 12:00: execução com erro (único registro confirmado)
- Nenhuma execução bem-sucedida entre 15/09 e 17/09 (auditoria inicial)
- 2026-09-20 (estado-base): cadência de 15min "não se confirma na prática"
- CLAUDE.md §"Frescura do Grafo": "não depender dele como única via de atualização"

## Decisão: **Aposentar o dispatcher**

### Motivo

1. **Não funciona de fato**: sem execução confiável em pelo menos 2 semanas de observação.
2. **Via canônica existe e funciona**: `graphify update .` rodado localmente (ou no
   container `claude-code` da VPS) é confiável, determinístico e documentado no CLAUDE.md.
3. **Custo de manutenção > benefício**: consertar o dispatcher N8N exigiria depurar
   credenciais, configurar o ambiente Deno/Node correto dentro do N8N, e lidar com
   timeouts de execução longa (graphify ≈ 2,5 min por rebuild) — complexidade
   desnecessária quando o caminho manual é simples.
4. **Grafo não precisa de cadência fixa**: é consultado pontualmente por sessões de
   agente; o CLAUDE.md já instrui a verificar frescura e rebuildar se necessário.

### Execução da aposentadoria

Via `mcp__N8N_-_MCP_-_V_JUCA__n8n_deactivate_workflow` com id `67dWSoWEPUGTX5mA`.

**Status**: API retornou HTTP 405 — o workflow pode já estar inativo, ou a API key
não tem permissão de deactivate. Joaquim pode confirmar no painel N8N:
Workflows → "Graph Sync — Dispatcher" → Deactivate (se ainda estiver ativo).

> **Nota**: se a tool N8N não estiver disponível nesta sessão, a desativação
> fica registrada como decisão aqui. Joaquim pode executar manualmente no painel N8N:
> Workflows → "Graph Sync — Dispatcher" → Deactivate.

## Estado pós-aposentadoria

| Item | Estado |
|------|--------|
| Dispatcher N8N | Desativado (ou marcado para desativação manual) |
| Via canônica | `graphify update . --force` no container ou local |
| CLAUDE.md §"Frescura do Grafo" | Já documenta: "não depender [do N8N] como única via" |
| Seção no CLAUDE.md sobre frescura | Permanece válida e suficiente |

## Atualização do CLAUDE.md

A seção existente em CLAUDE.md (§"Frescura do Grafo") já descreve o estado correto.
Nenhuma alteração necessária além de confirmar que o dispatcher foi aposentado.

Etapas E06 e E45 fechadas em 2026-09-29.
