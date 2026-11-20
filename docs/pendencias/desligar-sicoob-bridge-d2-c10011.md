# C100-11 — Desligar Sicoob Bridge (D2)

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 04 · **Seção**: 3.1 Plano Contatos 100 etapas (29/09)

## Descrição e origem

Desligar Sicoob Bridge (D2).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.1 Plano Contatos 100 etapas (29/09)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: D2 = desligar; trigger dropado e edges removidas
- **Existe hoje** (evidência da auditoria): Trigger dropado (20260929380000); fontes só arquivados em docs/edge-functions-recovered/sicoob-bridge; edges seguem publicadas e toleradas em supabase/deployment-manifest.json:15 (orphan_allowlist)
- **Falta**: Apagar sicoob-bridge e sicoob-bridge-reply do projeto remoto e tirar da allowlist
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Duas funções esquecidas no ar (a -reply faz chamada externa à Sicoob) — superfície de ataque sem uso

## Dependências

Admin do Supabase (Joaquim)

## Critério de aceite

- D2 = desligar; trigger dropado e edges removidas
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).