# Talk X · Campanhas

Módulo de envio de campanhas WhatsApp em massa, com segmentação, templates, supressão e analytics.

## Documentação

Aqui só entra documento **corrente** — o que o módulo tem hoje e o plano em execução. Plano substituído,
auditoria e handoff de sessão vivem no [arquivo](./_arquivo/README.md).

| Arquivo | Conteúdo |
|---|---|
| [PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md](./PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md) | **Plano vigente** — 200 etapas (X001–X200) |
| [v4/STATUS.md](./v4/STATUS.md) | **Placar do plano** — etapas concluídas e elementos do mock fechados; gerado por `scripts/talkx/v4-status.mjs` |
| [v4/README.md](./v4/README.md) | Material de apoio do plano: `v4/etapas/`, `v4/inventario/`, `v4/etapas.json` |
| [v4/DECISOES.md](./v4/DECISOES.md) | Decisões de arquitetura (A1–A18) e de negócio (N01–N45) |
| [ARQUITETURA.md](./ARQUITETURA.md) | Componentes, máquina de estados e métrica→fonte — com as correções pendentes no banner do topo |
| [OPERACAO.md](./OPERACAO.md) | Como operar: ambientes, migrations, edge, E2E, monitoramento e alertas |
| [PARIDADE.md](./PARIDADE.md) | Checklist de paridade — **substituído e desatualizado**; será regenerado por evidência na etapa X197 |
| [CHANGELOG_TALKX.md](./CHANGELOG_TALKX.md) | Histórico por fase/etapa (registro datado, não estado atual) |
| [CONVERSOES.md](./CONVERSOES.md) | Endpoint `talkx-link` (POST): registro de conversão de link rastreável, por assinatura HMAC |
| [_arquivo/](./_arquivo/README.md) | **Arquivo** — planos antigos (E01–E100, recuperação, V3), auditoria de 29/09 e handoff de sessão |

## Estado do módulo

O placar é do [v4/STATUS.md](./v4/STATUS.md) e do campo **Hoje** de cada etapa em [v4/etapas/](./v4/etapas/) —
não é reescrito à mão aqui, para não virar retrato datado. O plano vigente é o V4: uma etapa = uma PR, na
ordem numérica (X001 em diante), com o corpo da PR exigido em [v4/README.md](./v4/README.md).

## O que já foi substituído

O módulo teve três planos antes do V4 e uma auditoria exaustiva. Nenhum deles é executável hoje; todos
foram para [_arquivo/](./_arquivo/README.md) com o motivo e o sucessor de cada um. Histórico serve para
investigar defeito antigo, não para dizer o que fazer agora.
