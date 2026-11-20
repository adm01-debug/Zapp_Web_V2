# A7A — Índice keyset, página por cursor, leitura em lote, view de leitura, busca com trecho

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Índice keyset, página por cursor, leitura em lote, view de leitura, busca com trecho.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Índice (cid,created_at,id), view team_message_read_state, snippet
- **Existe hoje** (evidência da auditoria): RPCs existem (e38–e40) mas: índice ausente (grep vazio), sem desempate por id e sem piso em p_limit (20260930280000:77-78), view inexistente, busca sem snippet
- **Falta**: Completar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Lentidão/pulos de mensagem quando adotar RPC

## Dependências

Nenhuma registrada.

## Critério de aceite

- Índice (cid,created_at,id), view team_message_read_state, snippet
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).