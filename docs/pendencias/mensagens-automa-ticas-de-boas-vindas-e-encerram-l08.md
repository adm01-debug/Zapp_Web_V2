# L-08 — Mensagens automáticas de boas-vindas e encerramento

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.2 Automação, chatbot e atendimento automático

## Descrição e origem

Mensagens automáticas de boas-vindas e encerramento.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.2 Automação, chatbot e atendimento automático).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: CSF 23.3 ✅
- **Existe hoje** (evidência da auditoria): Retiradas da gravação: "nenhum executor versionado lê ou envia esses campos" (MessagesSettings.tsx:19-20, :195)
- **Falta**: executor + campo versionado
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem saudação/encerramento padronizados

## Dependências

Nenhuma registrada.

## Critério de aceite

- CSF 23.3 ✅
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).