# R5 — Vocabulário único de auditoria de departamento

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Vocabulário único de auditoria de departamento.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: 8 verbos, código fora de details
- **Existe hoje** (evidência da auditoria): 20261006213734:70-76 só acrescentou whatsapp_updated aos 12 verbos antigos; create_department_invite grava o código em details (20260928520000:6)
- **Falta**: Unificar vocabulário
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Trilha de auditoria confusa

## Dependências

Nenhuma registrada.

## Critério de aceite

- 8 verbos, código fora de details
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).