# ARQ-47 — Checklist de teclado executado e gravado

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos"

## Descrição e origem

Checklist de teclado executado e gravado.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos").

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Fluxo "localizar → selecionar 2 → detalhes → fechar" só por teclado, gravado em evidence/
- **Existe hoje** (evidência da auditoria): e2e/files-tab.spec.ts:307 (prévia por teclado) e :339 (ARIA); evidence/ só tem diagnostico.md e matriz-preservacao.md
- **Falta**: Executar e registrar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Acessibilidade de teclado não comprovada

## Dependências

Nenhuma registrada.

## Critério de aceite

- Fluxo "localizar → selecionar 2 → detalhes → fechar" só por teclado, gravado em evidence/
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).