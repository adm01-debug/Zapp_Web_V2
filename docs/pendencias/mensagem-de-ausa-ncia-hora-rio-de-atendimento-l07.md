# L-07 — Mensagem de ausência / horário de atendimento

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 08 · **Seção**: 3.2 Automação, chatbot e atendimento automático

## Descrição e origem

Mensagem de ausência / horário de atendimento.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.2 Automação, chatbot e atendimento automático).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: CSF 23.2–23.3 ✅
- **Existe hoje** (evidência da auditoria): Config por conexão (src/hooks/business/useBusinessHours.ts:46,68); a própria tela admite "Nenhum executor versionado envia esta mensagem automaticamente hoje" (src/components/settings/MessagesSettings.tsx:40-42)
- **Falta**: envio automático fora do horário
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Cliente que escreve fora do expediente fica sem resposta

## Dependências

Nenhuma registrada.

## Critério de aceite

- CSF 23.2–23.3 ✅
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).