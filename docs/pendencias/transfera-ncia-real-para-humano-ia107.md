# IA-107 — Transferência real para humano

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Transferência real para humano.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Confirmar fila/atendente/ownership
- **Existe hoje** (evidência da auditoria): Só devolve transfer_to_human (chatbot-l1/index.ts:259-287); nada no repo executa a transferência nem chama o bot no fluxo de entrada (nenhum chamador em evolution-webhook)
- **Falta**: Executar transferência no pipeline
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Bot diz que transferiu e ninguém assume

## Dependências

Chamador externo do bot (HMAC) não versionado

## Critério de aceite

- Confirmar fila/atendente/ownership
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).