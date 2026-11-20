# T95 — Deploy das Edges e verificação em produção

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 03 · **Seção**: 3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)

## Descrição e origem

Deploy das Edges e verificação em produção.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Deploy aprovado + curl com 5 campos; Vercel READY
- **Existe hoje** (evidência da auditoria): Desde #1901 o deploy de Edges é automático no push da main; não verificado o estado em produção
- **Falta**: Confirmar versões e curl
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Correções podem não estar no ar

## Dependências

Joaquim

## Critério de aceite

- Deploy aprovado + curl com 5 campos; Vercel READY
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).