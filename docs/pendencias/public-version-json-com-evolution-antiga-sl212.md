# SL-212 — public/version.json com Evolution antiga

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.7 Segunda leva — CI/DevOps, Performance e seleção infra/segurança (status do TSV é de 07/10; abaixo o estado no código)

## Descrição e origem

public/version.json com Evolution antiga.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.7 Segunda leva — CI/DevOps, Performance e seleção infra/segurança (status do TSV é de 07/10; abaixo o estado no código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Corrigir
- **Existe hoje** (evidência da auditoria): public/version.json aponta evolution.atomicabr.com.br, buildDate 13/06; o build sobrescreve via vite.config.ts:17-24
- **Falta**: Remover arquivo estático
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Confusão em diagnóstico

## Dependências

Nenhuma registrada.

## Critério de aceite

- Corrigir
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).