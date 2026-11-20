# CT-82 — e2e/catalog.spec.ts verde nos 3 browsers

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

e2e/catalog.spec.ts verde nos 3 browsers.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Fluxo completo com envio
- **Existe hoje** (evidência da auditoria): Spec existe e está nos projetos firefox-catalog/webkit-catalog (.github/workflows/e2e-logado.yml:110-130)
- **Falta**: Envio real (conexão ativa)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Joaquim

## Critério de aceite

- Fluxo completo com envio
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).