# SL-136 — Aposentar dispatcher N8N

- **Estado**: JÁ PRONTO
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.6 Pendências do Dono (08/10) — itens da área

## Descrição e origem

Aposentar dispatcher N8N.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.6 Pendências do Dono (08/10) — itens da área).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): JÁ PRONTO.
- **Planejado**: Desativar Graph Sync
- **Existe hoje** (evidência da auditoria): N8N API: active: false, última edição 29/08
- **Falta**: Arquivar o workflow e rotacionar a credencial de infraestrutura gravada sem cofre nos nós HTTP (detalhe fora do repositório público)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Credencial de infraestrutura legível por quem abre o N8N

## Dependências

Joaquim

## Critério de aceite

- Desativar Graph Sync
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).