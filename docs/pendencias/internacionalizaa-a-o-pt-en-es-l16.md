# L-16 — Internacionalização PT/EN/ES

- **Estado**: DIVERGENTE
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.4 Notificações, PWA e idioma

## Descrição e origem

Internacionalização PT/EN/ES.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.4 Notificações, PWA e idioma).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: IMPROVEMENT P3.3 ✅; CSF 23.11
- **Existe hoje** (evidência da auditoria): Dicionários (src/i18n/index.ts:6,126,246) e seletor (src/components/settings/LanguageSelector.tsx:13); nenhum componente usa t() (único consumidor de i18n é o seletor)
- **Falta**: traduzir telas ou retirar o seletor
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Trocar idioma não muda nada — promessa falsa

## Dependências

Nenhuma registrada.

## Critério de aceite

- IMPROVEMENT P3.3 ✅; CSF 23.11
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).