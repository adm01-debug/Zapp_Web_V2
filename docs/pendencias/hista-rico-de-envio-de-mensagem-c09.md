# C-09 — "Histórico de envio" de mensagem

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 5. Achados fora dos planos (varredura de código)

## Descrição e origem

"Histórico de envio" de mensagem.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (5. Achados fora dos planos (varredura de código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: SL-198 (paridade)
- **Existe hoje** (evidência da auditoria): MessageSendHistorySheet.tsx só em teste
- **Falta**: ligar no menu da mensagem
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem diagnóstico de falha de entrega pelo atendente

## Dependências

Nenhuma registrada.

## Critério de aceite

- SL-198 (paridade)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).