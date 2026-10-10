-- Migration: Adiciona CHECK CONSTRAINT em contacts.contact_type
-- Autor: Claude (auditoria pos-redesign, 28/09/2026)
-- Motivo: Sem esta constraint, qualquer valor pode ser inserido via API direta
--         (lead, sicoob_gifts, outros, vip, etc.) sem rejeicao no banco.
-- Pre-validacao (executar antes de aplicar):
--   SELECT contact_type, count(*) FROM contacts
--   WHERE contact_type NOT IN ('cliente','fornecedor','transportadora','colaborador','prestador_servico','parceiro')
--   GROUP BY 1;
-- Deve retornar 0 linhas. Confirmado em 28/09/2026 (todos os 3099 registros sao 'cliente').

-- Tipos validos canonicos (sincronizados com src/utils/whatsappFileTypes.ts CONTACT_TYPES)
ALTER TABLE contacts
  ADD CONSTRAINT chk_contact_type
  CHECK (contact_type IN (
    'cliente',
    'fornecedor',
    'transportadora',
    'colaborador',
    'prestador_servico',
    'parceiro'
  ));

-- Comentario para referencia futura
COMMENT ON CONSTRAINT chk_contact_type ON contacts IS
  'Tipos canonicos de contato (6 tipos, sem lead/vip/sicoob_gifts). '
  'Sincronizar com src/utils/whatsappFileTypes.ts CONTACT_TYPES ao alterar.';
