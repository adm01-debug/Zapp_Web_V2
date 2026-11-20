# IA-002 — Mapa completo dos fluxos de IA

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Mapa completo dos fluxos de IA.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Cada botão → função → provedor → tabela → teste
- **Existe hoje** (evidência da auditoria): docs/ia/IA-002- (59 UI / 25 funções na ref. 0ab8409); funções novas sem mapa (ai-kb-ingest, talkx-ai, voice-copilot-action com authz)
- **Falta**: Refazer inventário no HEAD
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Recurso pago sem dono/consumidor conhecido

## Dependências

Nenhuma registrada.

## Critério de aceite

- Cada botão → função → provedor → tabela → teste
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).