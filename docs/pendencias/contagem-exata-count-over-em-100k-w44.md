# W4-4 — Contagem exata COUNT() OVER em 100k

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada

## Descrição e origem

Contagem exata COUNT() OVER em 100k.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Contagem aproximada/cache
- **Existe hoje** (evidência da auditoria): 20260930450000:35
- **Falta**: Decisão
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Busca degrada no crescimento

## Dependências

Nenhuma registrada.

## Critério de aceite

- Contagem aproximada/cache
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).