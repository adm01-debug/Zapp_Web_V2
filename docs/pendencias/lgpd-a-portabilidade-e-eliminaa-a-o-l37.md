# L-37 — LGPD — portabilidade e eliminação

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.8 Segurança, LGPD e IA

## Descrição e origem

LGPD — portabilidade e eliminação.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.8 Segurança, LGPD e IA).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: FORGOTTEN #7, CSF 41
- **Existe hoje** (evidência da auditoria): Exportação bloqueada (src/components/compliance/LGPDComplianceView.tsx:22); pedido de exclusão vira só log_audit_event (:35-49) "um administrador irá processar" — não há fila/tela que processe gdpr_deletion_request
- **Falta**: fila de atendimento + execução da eliminação
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Risco de descumprir prazo legal de 15/30 dias

## Dependências

jurídico

## Critério de aceite

- FORGOTTEN #7, CSF 41
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).