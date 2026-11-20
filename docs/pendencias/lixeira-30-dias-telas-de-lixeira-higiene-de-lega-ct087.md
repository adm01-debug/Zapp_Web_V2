# CT-087 — Lixeira 30 dias + telas de lixeira/higiene de legados

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 04 · **Seção**: 3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)

## Descrição e origem

Lixeira 30 dias + telas de lixeira/higiene de legados.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Admin restaura/apaga de vez
- **Existe hoje** (evidência da auditoria): Soft delete existe; restauração só por SQL (runbook); grep restore_contact = 0
- **Falta**: RPC + tela
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Contato apagado por engano exige TI

## Dependências

Banco local

## Critério de aceite

- Admin restaura/apaga de vez
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).