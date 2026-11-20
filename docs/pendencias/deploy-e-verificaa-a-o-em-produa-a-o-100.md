# 100 — Deploy e verificação em produção

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.7 Skins Opera GX (100)

## Descrição e origem

Deploy e verificação em produção.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.7 Skins Opera GX (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: READY + assert em produção
- **Existe hoje** (evidência da auditoria): sem prova
- **Falta**: Executar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- READY + assert em produção
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).