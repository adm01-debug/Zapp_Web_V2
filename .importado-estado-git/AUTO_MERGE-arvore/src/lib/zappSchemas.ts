import { z } from 'zod';

export const contatoSchema = z.object({
  nome: z.string().min(1),
  telefone: z.string().min(10),
  email: z.string().email().optional(),
  tags: z.array(z.string()).optional(),
  grupo_id: z.string().uuid().optional(),
  ativo: z.coerce.boolean().default(true),
  ultimo_contato: z.string().optional(),
});

export const campanhaSchema = z.object({
  nome: z.string().min(1),
  descricao: z.string().optional(),
  mensagem: z.string().min(1),
  data_envio: z.string().optional(),
  status: z.enum(['rascunho', 'agendada', 'enviando', 'concluida', 'cancelada']).default('rascunho'),
  total_contatos: z.coerce.number().int().min(0).default(0),
  enviados: z.coerce.number().int().min(0).default(0),
  erros: z.coerce.number().int().min(0).default(0),
});

export const zappImportTemplates = {
  contatos: [
    { key: 'nome', label: 'Nome', example: 'João Silva' },
    { key: 'telefone', label: 'Telefone', example: '5511999999999' },
    { key: 'email', label: 'E-mail', example: 'joao@email.com' },
    { key: 'tags', label: 'Tags', example: 'cliente,vip' },
  ],
};

export const zappFilterConfigs = {
  contatos: [
    { key: 'ativo', label: 'Status', type: 'select' as const, options: [{ value: 'true', label: 'Ativo' }, { value: 'false', label: 'Inativo' }] },
    { key: 'grupo_id', label: 'Grupo', type: 'select' as const, options: [] },
  ],
  campanhas: [
    { key: 'status', label: 'Status', type: 'select' as const, options: [
      { value: 'rascunho', label: 'Rascunho' },
      { value: 'agendada', label: 'Agendada' },
      { value: 'enviando', label: 'Enviando' },
      { value: 'concluida', label: 'Concluída' },
    ]},
  ],
};
