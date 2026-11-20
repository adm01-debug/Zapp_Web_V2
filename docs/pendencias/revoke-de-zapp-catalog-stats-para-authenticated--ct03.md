# CT-03 — REVOKE de zapp_catalog_stats() para authenticated no PromoGifts

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

REVOKE de zapp_catalog_stats() para authenticated no PromoGifts.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: DDL no banco externo
- **Existe hoje** (evidência da auditoria): Decisão: não fazer DDL externa (PLANO_FINALIZACAO:60-68)
- **Falta**: O responsável pelo PromoGifts aplicar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Qualquer usuário autenticado do PromoGifts pode chamar a RPC

## Dependências

dono do PromoGifts

## Critério de aceite

- DDL no banco externo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).