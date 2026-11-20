# SL-188 — Registry de provedores, provider fake, Cloud API, switchover

- **Estado**: NÃO VERIFICÁVEL
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.5 Paridade V1/V3 (100) — blocos da área (1, 2, 4, 5, 6, 10); blocos 3/7/8/9 resumidos

## Descrição e origem

Registry de provedores, provider fake, Cloud API, switchover.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.5 Paridade V1/V3 (100) — blocos da área (1, 2, 4, 5, 6, 10); blocos 3/7/8/9 resumidos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO VERIFICÁVEL.
- **Planejado**: 2º provedor WhatsApp
- **Existe hoje** (evidência da auditoria): só adapter GO
- **Falta**: Decisão (048)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Dependência de um único provedor

## Dependências

decisão de conta Meta

## Critério de aceite

- 2º provedor WhatsApp
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).