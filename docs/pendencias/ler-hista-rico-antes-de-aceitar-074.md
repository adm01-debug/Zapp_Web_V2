# 074 — Ler histórico antes de aceitar

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.6 Talk Me (100 + refinamento 50)

## Descrição e origem

Ler histórico antes de aceitar.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.6 Talk Me (100 + refinamento 50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Ler mensagem completa e mensagens anteriores sem assumir
- **Existe hoje** (evidência da auditoria): "Ler mensagem completa" mostra só a última + contagem (src/features/talk-me/TalkMeView.tsx:613-631); cartões line-clamp-2 (:143, :220)
- **Falta**: Mensagens anteriores com regra de autorização
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Atendente decide pegar o atendimento com contexto parcial

## Dependências

regra de RLS para prévia

## Critério de aceite

- Ler mensagem completa e mensagens anteriores sem assumir
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).