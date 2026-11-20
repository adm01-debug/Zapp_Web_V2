# E94 — Envio real de localização confirmado no WhatsApp

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.5 Mapa / Search Box — Finalização (100)

## Descrição e origem

Envio real de localização confirmado no WhatsApp.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.5 Mapa / Search Box — Finalização (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: location_sent ≥ 1 + print
- **Existe hoje** (evidência da auditoria): location_sent=0 em set/out (registrado)
- **Falta**: Envio real
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Envio de localização não provado ponta a ponta

## Dependências

Joaquim (número de teste)

## Critério de aceite

- location_sent ≥ 1 + print
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).