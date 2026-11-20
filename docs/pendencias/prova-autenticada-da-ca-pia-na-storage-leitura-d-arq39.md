# ARQ-39 — Prova autenticada da cópia na Storage + leitura de mídia recebida

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 06 · **Seção**: 3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos"

## Descrição e origem

Prova autenticada da cópia na Storage + leitura de mídia recebida.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos").

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Teste autenticado: copy permitido/negado e 4 prefixos de mídia recebida (image/,video/,document/,audio/)
- **Existe hoje** (evidência da auditoria): Limites 10×10 e confirmação ≥20 em src/lib/forward-limits.ts:10-13; policy aditiva em supabase/migrations/20261003142707_whatsapp_media_recebida_select_via_messages.sql; nenhum teste com storage.copy em e2e/ ou tests/
- **Falta**: Teste autenticado no banco local; confirmar apply da policy em produção
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Atendente não-supervisor pode não conseguir ver/encaminhar foto que o cliente mandou se a policy não estiver aplicada

## Dependências

lote diário de migrations (db-migrate) — produção não verificada

## Critério de aceite

- Teste autenticado: copy permitido/negado e 4 prefixos de mídia recebida (image/,video/,document/,audio/)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).