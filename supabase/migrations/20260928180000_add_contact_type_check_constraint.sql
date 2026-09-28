ALTER TABLE contacts ADD CONSTRAINT chk_contact_type CHECK (contact_type IN ('cliente','fornecedor','transportadora','colaborador','prestador_servico','parceiro'));

COMMENT ON CONSTRAINT chk_contact_type ON contacts IS 'Tipos canônicos de contato (6 tipos). Sincronizar com src/utils/whatsappFileTypes.ts CONTACT_TYPES ao alterar.';
