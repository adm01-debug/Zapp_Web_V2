# Z03 — Dicas uniformes + legenda do ponto azul nos 6 controles

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.4 Consistência de design (Z01–Z03)

## Descrição e origem

Dicas uniformes + legenda do ponto azul nos 6 controles.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.4 Consistência de design (Z01–Z03)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: "Nome: estado — ação" e legenda
- **Existe hoje** (evidência da auditoria): Só volume: VolumeTriggerButton.tsx:30-35; cadeado/sino só "Ativar/Desativar…" (ScreenProtectionToggle.tsx:39-41, PushNotificationToggle.tsx:21-23); tema "Modo claro" (Sidebar.tsx:258); ponto azul do sino/cadeado (= ligado) sem legenda
- **Falta**: Uniformizar 4 controles
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Ponto azul significa coisas diferentes sem explicação

## Dependências

Nenhuma registrada.

## Critério de aceite

- "Nome: estado — ação" e legenda
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).