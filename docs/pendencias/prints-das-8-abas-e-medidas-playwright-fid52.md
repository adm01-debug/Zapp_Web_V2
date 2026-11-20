# FID-52 — Prints das 8 abas e medidas Playwright

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.8 Inbox 360, Fidelidade Carvão, Coluna/Header

## Descrição e origem

Prints das 8 abas e medidas Playwright.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.8 Inbox 360, Fidelidade Carvão, Coluna/Header).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: inbox-11-.png, fid-.png
- **Existe hoje** (evidência da auditoria): INBOX_360_STATUS.md CP8 "NÃO DEMONSTRADO"; substituto: ConversationTabs.cp8.test.tsx (15 testes)
- **Falta**: Capturar no banco local
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem prova visual

## Dependências

login QA → banco local

## Critério de aceite

- inbox-11-.png, fid-.png
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).