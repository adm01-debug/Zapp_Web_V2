# SL-103 — Initial JS ≤ 300 KB

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.6 Pendências do Dono (08/10) — itens da área

## Descrição e origem

Initial JS ≤ 300 KB.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.6 Pendências do Dono (08/10) — itens da área).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: 300 KB
- **Existe hoje** (evidência da auditoria): performance-budget.json:4 teto 343 KB (subiu 340→341→343); lote 09/10 mediu 334,9 KB
- **Falta**: Code-splitting
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Carregamento inicial lento em celular/4G

## Dependências

decisão de escopo

## Critério de aceite

- 300 KB
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).