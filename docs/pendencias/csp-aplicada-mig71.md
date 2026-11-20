# MIG-71 — CSP aplicada

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.9 Migração fresh install (docs/migration) e handoffs antigos

## Descrição e origem

CSP aplicada.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.9 Migração fresh install (docs/migration) e handoffs antigos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: CSP com allowlist
- **Existe hoje** (evidência da auditoria): Só Content-Security-Policy-Report-Only (vercel.json:28)
- **Falta**: Passar para enforce
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Proteção contra XSS só observa

## Dependências

Nenhuma registrada.

## Critério de aceite

- CSP com allowlist
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).