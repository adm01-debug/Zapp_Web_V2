# SL-148 — Tags v2.0.0-hostinger, catalog-v1.0.0 + release notes

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.6 Pendências do Dono (08/10) — itens da área

## Descrição e origem

Tags v2.0.0-hostinger, catalog-v1.0.0 + release notes.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.6 Pendências do Dono (08/10) — itens da área).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Releases versionadas
- **Existe hoje** (evidência da auditoria): API: 0 releases; tags só talkx-v1.0.0 e dezenas de edge-deploy/ de 03/10
- **Falta**: Criar tags/releases
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem ponto de retorno nomeado para rollback

## Dependências

dono

## Critério de aceite

- Releases versionadas
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).