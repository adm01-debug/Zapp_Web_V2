# X023 — Prova de paridade de deploy das 5 edges

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.3 Talk X — Fase 2 · Motor seguro (X010–X023: 11 concluídos, 3 pendentes)

## Descrição e origem

Prova de paridade de deploy das 5 edges.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.3 Talk X — Fase 2 · Motor seguro (X010–X023: 11 concluídos, 3 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Preflight remoto conclusivo antes do 1º disparo
- **Existe hoje** (evidência da auditoria): Script corrigido para "não verificado" (scripts/edge-deploy/talkx-preflight.mjs:90-95); única evidência docs/talkx/recovery/evidence/X023/preflight-2026-10-03.json só com hashes locais
- **Falta**: Rodar com remoto + secrets e registrar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Não há prova de que o motor no ar é o do repositório

## Dependências

token/secrets

## Critério de aceite

- Preflight remoto conclusivo antes do 1º disparo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).