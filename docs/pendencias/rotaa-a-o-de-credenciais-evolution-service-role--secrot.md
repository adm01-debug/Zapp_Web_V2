# SEC-ROT — Rotação de credenciais (Evolution, service_role, senha DB, Lovable Bearer, MCP)

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.8 LGPD, backup, observabilidade e segurança operacional

## Descrição e origem

Rotação de credenciais (Evolution, service_role, senha DB, Lovable Bearer, MCP).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.8 LGPD, backup, observabilidade e segurança operacional).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Rotacionar e registrar
- **Existe hoje** (evidência da auditoria): issue #380 aberta desde 13/09; AUDITORIA_AGENTES: "Bearer do lovable continua válido"
- **Falta**: Rotacionar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Credenciais antigas possivelmente expostas

## Dependências

Joaquim

## Critério de aceite

- Rotacionar e registrar
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).