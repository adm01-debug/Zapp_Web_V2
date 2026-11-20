# CT-040 — Contato sem vínculo Singu

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)

## Descrição e origem

Contato sem vínculo Singu.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Explicar e oferecer vínculo
- **Existe hoje** (evidência da auditoria): Estado "não vinculado" + "Buscar no CRM" no sidebar do inbox
- **Falta**: Ficha do módulo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- Explicar e oferecer vínculo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).