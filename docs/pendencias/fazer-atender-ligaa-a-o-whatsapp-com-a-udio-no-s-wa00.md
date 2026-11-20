# WA-00 — Fazer/atender ligação WhatsApp com áudio no sistema

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P0
- **Anexo**: 03 · **Seção**: 3.2 Ligações pelo WhatsApp — plano `meowcaller` E001–E100 (+ caminho oficial)

## Descrição e origem

Fazer/atender ligação WhatsApp com áudio no sistema.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.2 Ligações pelo WhatsApp — plano `meowcaller` E001–E100 (+ caminho oficial)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Pedido do dono (análise :3)
- **Existe hoje** (evidência da auditoria): Só eventos: WhatsAppCallAdapter.dial → NotSupportedError (src/lib/calls/WhatsAppCallAdapter.ts:63-69), "Ignorar" (:56); CallSessionProvider.tsx:405 disca sempre channel:'voip'; pedido whatsapp do inbox não é interceptado (:433-443)
- **Falta**: Escolher caminho e executar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Cliente que liga pelo WhatsApp só é atendido no celular; não dá para ligar pelo WhatsApp

## Dependências

Decisão do dono

## Critério de aceite

- Pedido do dono (análise :3)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).