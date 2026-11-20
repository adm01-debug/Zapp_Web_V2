# L-34 — Canais Instagram/Telegram/Messenger/Webchat

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.7 Integrações e telas-fachada

## Descrição e origem

Canais Instagram/Telegram/Messenger/Webchat.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.7 Integrações e telas-fachada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: CSF (omnichannel), FORGOTTEN
- **Existe hoje** (evidência da auditoria): Cadastro "sem executor… não ativa recebimento nem envio" (src/lib/omnichannel/execucaoDeCanais.ts:102-107; OmnichannelManager.tsx:210-214)
- **Falta**: executores por canal
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Só WhatsApp e Gmail funcionam de fato

## Dependências

credenciais de cada canal

## Critério de aceite

- CSF (omnichannel), FORGOTTEN
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).