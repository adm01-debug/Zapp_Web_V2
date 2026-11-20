# IA-067 — Conclusões ligadas às mensagens

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Conclusões ligadas às mensagens.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Evidência por conclusão com ID de mensagem
- **Existe hoje** (evidência da auditoria): Envelope tem campo evidence (_shared/ai-response-contracts.ts:225-257), sem IDs verificados
- **Falta**: Exigir e validar citações
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Atendente não confere de onde veio a conclusão

## Dependências

Nenhuma registrada.

## Critério de aceite

- Evidência por conclusão com ID de mensagem
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).