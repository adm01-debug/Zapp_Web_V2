# X191 — Checklist, suporte, especialista, vídeos

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 01 · **Seção**: 3.16 Talk X — Fase 15 · Ajuda (X189–X191: 1 concluído)

## Descrição e origem

Checklist, suporte, especialista, vídeos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.16 Talk X — Fase 15 · Ajuda (X189–X191: 1 concluído)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Botões e vídeos
- **Existe hoje** (evidência da auditoria): Nada em TalkXHelpCenter.tsx; support_contact/talkx_help_views = 0
- **Falta**: Tudo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem canal de ajuda humana

## Dependências

N40 + gravação dos vídeos

## Critério de aceite

- Botões e vídeos
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).