# Catálogo · ZAPP Web V2 — documentação do módulo

Módulo `?view=catalog` (`src/components/catalog/`), sincronizado em tempo real com o PromoGifts via edge function `promogifts-catalog`. O catálogo é **somente-leitura** no ZAPP: criação e edição de produtos acontecem no PromoGifts.

| Arquivo | O que é |
|---|---|
| [`PLANO_IMPLEMENTACAO_CATALOGO_100.md`](./PLANO_IMPLEMENTACAO_CATALOGO_100.md) | Plano completo: 100 etapas × 10 sub-etapas × checklist, com o estado real verificado em 2026-09-11 |
| [`CHANGELOG_CATALOGO.md`](./CHANGELOG_CATALOGO.md) | Histórico por etapa (E01–E100) |
| `ESTADO_INICIAL.md` | Gates e mapa de importadores no início (E01) |
| `ARQUITETURA.md` | Diagrama, mapa métrica→fonte, decisões (E10) |
| `COMPONENTES.md` | Primitivos de `catalogShared.tsx` e classes `.catalog-*` (F1) |
| `PARIDADE.md` | Mock × implementado, por tela (E40/E50/E58/E68/E80/E90/E98) |
| `screens/` | Referência visual: `A-catalogo`, `B-detalhes`, `C-enviar-produto`, `D-selecionar-contato`, `00-estado-atual-2026-09-11` |

Validar a estrutura do plano: `node scripts/catalog/validate-plan.mjs`.

Regras inegociáveis: design carvão (sem navy), zero número fabricado, diff mínimo, gate por etapa (`tsc` 0 · `lint-ratchet` 0 novas · `vitest` verde). Detalhes na seção "Regras do plano".
