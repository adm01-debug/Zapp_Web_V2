# X048 — Estados WhatsApp desconectado / CRM indisponível / sem permissão

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.6 Talk X — Fase 5 · Kit, estados, modais, navegação (X042–X056: 6 concluídos, 9 pendentes)

## Descrição e origem

Estados WhatsApp desconectado / CRM indisponível / sem permissão.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.6 Talk X — Fase 5 · Kit, estados, modais, navegação (X042–X056: 6 concluídos, 9 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Os 3 estados com botões ligados
- **Existe hoje** (evidência da auditoria): Só WhatsApp (TalkXView.tsx:44-45,383-386); useTalkXServiceStatus.ts:19-22 declara CRM fora; TalkXCrmUnavailableState/TalkXNoPermissionState (kit/states.tsx:161,192) sem uso
- **Falta**: Sinal de CRM e de permissão nas telas
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Operador vê tela vazia em vez do motivo

## Dependências

X014

## Critério de aceite

- Os 3 estados com botões ligados
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).