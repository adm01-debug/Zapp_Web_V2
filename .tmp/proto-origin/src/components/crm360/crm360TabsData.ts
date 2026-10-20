/**
 * CRM360 Explorer — Tab definitions (data only)
 * Split from crm360TabsConfig.ts for maintainability.
 */
import {
  Building2, Users, ShoppingCart, MessageSquare, BarChart3,
  Share2, MapPin, Phone, Mail, Truck, Package, Trophy,
  DollarSign, User, Activity, Calendar, Zap, FileText, Target,
  Briefcase, Tag, Globe, Layers, ClipboardList, StickyNote, CreditCard,
} from 'lucide-react';
import type { TabConfig } from './crm360TabsConfig';

export const CORE_TABS: TabConfig[] = [
  {
    id: 'companies', label: 'Empresas', icon: Building2,
    description: '57k+ empresas — razão social, CNPJ, ramo de atividade',
    searchColumn: 'nome_fantasia', editable: true,
    columns: [
      { key: 'nome_fantasia', label: 'Fantasia' }, { key: 'razao_social', label: 'Razão Social' },
      { key: 'cnpj', label: 'CNPJ' }, { key: 'ramo_atividade', label: 'Ramo' },
      { key: 'status', label: 'Status' }, { key: 'porte_rf', label: 'Porte' },
      { key: 'capital_social', label: 'Capital', format: 'currency' },
      { key: 'data_fundacao', label: 'Fundação', format: 'date' },
    ],
  },
  {
    id: 'contacts', label: 'Contatos', icon: Users,
    description: '4.7k+ contatos — nome, cargo, empresa, score',
    searchColumn: 'full_name', editable: true,
    columns: [
      { key: 'full_name', label: 'Nome' }, { key: 'cargo', label: 'Cargo' },
      { key: 'departamento', label: 'Departamento' }, { key: 'relationship_stage', label: 'Estágio' },
      { key: 'relationship_score', label: 'Score', format: 'number' },
      { key: 'sentiment', label: 'Sentimento' }, { key: 'source', label: 'Origem' },
      { key: 'created_at', label: 'Criado', format: 'date' },
    ],
  },
  {
    id: 'customers', label: 'Clientes', icon: ShoppingCart,
    description: '52k+ registros — dados financeiros, vendedores, ativação',
    searchColumn: 'vendedor_nome',
    columns: [
      { key: 'vendedor_nome', label: 'Vendedor' }, { key: 'cliente_ativado', label: 'Ativo', format: 'boolean' },
      { key: 'ja_comprou', label: 'Comprou', format: 'boolean' }, { key: 'total_pedidos', label: 'Pedidos', format: 'number' },
      { key: 'valor_total_compras', label: 'Total', format: 'currency' }, { key: 'ticket_medio', label: 'Ticket', format: 'currency' },
      { key: 'poder_compra', label: 'Poder' }, { key: 'grupo_clientes', label: 'Grupo' },
      { key: 'perfil_preco', label: 'Preço' }, { key: 'data_ultima_compra', label: 'Última Compra', format: 'date' },
    ],
  },
  {
    id: 'company_rfm_scores', label: 'RFM', icon: BarChart3,
    description: 'Recência, Frequência e Monetário', searchColumn: 'segment_code',
    columns: [
      { key: 'segment_code', label: 'Segmento' }, { key: 'recency_score', label: 'R', format: 'number' },
      { key: 'frequency_score', label: 'F', format: 'number' }, { key: 'monetary_score', label: 'M', format: 'number' },
      { key: 'combined_score', label: 'Score', format: 'number' }, { key: 'interaction_count', label: 'Interações', format: 'number' },
      { key: 'total_value', label: 'Valor', format: 'currency' }, { key: 'overall_trend', label: 'Tendência' },
      { key: 'calculated_at', label: 'Calculado', format: 'date' },
    ],
  },
];

export const COMMUNICATION_TABS: TabConfig[] = [
  {
    id: 'interactions', label: 'Interações', icon: MessageSquare,
    description: '10k+ interações com contatos e empresas', searchColumn: 'assunto',
    columns: [
      { key: 'channel', label: 'Canal' }, { key: 'direction', label: 'Direção' },
      { key: 'type', label: 'Tipo' }, { key: 'assunto', label: 'Assunto' },
      { key: 'resumo', label: 'Resumo' }, { key: 'sentiment', label: 'Sentimento' },
      { key: 'data_interacao', label: 'Data', format: 'date' },
    ],
  },
  {
    id: 'contact_phones', label: 'Tel. Contatos', icon: Phone,
    description: 'Telefones dos contatos', searchColumn: 'numero',
    columns: [
      { key: 'numero', label: 'Número' }, { key: 'numero_e164', label: 'E.164' },
      { key: 'phone_type', label: 'Tipo' }, { key: 'is_primary', label: 'Principal', format: 'boolean' },
      { key: 'is_whatsapp', label: 'WhatsApp', format: 'boolean' },
      { key: 'is_verified', label: 'Verificado', format: 'boolean' }, { key: 'fonte', label: 'Fonte' },
    ],
  },
  {
    id: 'contact_emails', label: 'Emails Contatos', icon: Mail,
    description: 'E-mails dos contatos', searchColumn: 'email',
    columns: [
      { key: 'email', label: 'E-mail' }, { key: 'email_type', label: 'Tipo' },
      { key: 'is_primary', label: 'Principal', format: 'boolean' },
      { key: 'is_verified', label: 'Verificado', format: 'boolean' },
      { key: 'contexto', label: 'Contexto' }, { key: 'fonte', label: 'Fonte' },
      { key: 'confiabilidade', label: 'Confiança', format: 'number' },
    ],
  },
  {
    id: 'company_phones', label: 'Tel. Empresas', icon: Phone,
    description: 'Telefones das empresas', searchColumn: 'numero',
    columns: [
      { key: 'numero', label: 'Número' }, { key: 'numero_e164', label: 'E.164' },
      { key: 'phone_type', label: 'Tipo' }, { key: 'is_primary', label: 'Principal', format: 'boolean' },
      { key: 'is_whatsapp', label: 'WhatsApp', format: 'boolean' }, { key: 'departamento', label: 'Depto.' },
    ],
  },
  {
    id: 'company_emails', label: 'Emails Empresas', icon: Mail,
    description: 'E-mails das empresas', searchColumn: 'email',
    columns: [
      { key: 'email', label: 'E-mail' }, { key: 'email_type', label: 'Tipo' },
      { key: 'is_primary', label: 'Principal', format: 'boolean' }, { key: 'departamento', label: 'Depto.' },
    ],
  },
  {
    id: 'company_social_media', label: 'Social Empresas', icon: Share2,
    description: '99k+ registros de redes sociais', searchColumn: 'handle',
    columns: [
      { key: 'plataforma', label: 'Plataforma' }, { key: 'handle', label: 'Handle' },
      { key: 'url', label: 'URL' }, { key: 'seguidores', label: 'Seguidores', format: 'number' },
      { key: 'is_active', label: 'Ativo', format: 'boolean' }, { key: 'origem', label: 'Origem' },
    ],
  },
  {
    id: 'contact_social_media', label: 'Social Contatos', icon: Share2,
    description: 'Redes sociais dos contatos', searchColumn: 'handle',
    columns: [
      { key: 'plataforma', label: 'Plataforma' }, { key: 'handle', label: 'Handle' },
      { key: 'url', label: 'URL' }, { key: 'confiabilidade', label: 'Confiança', format: 'number' },
      { key: 'fonte', label: 'Fonte' },
    ],
  },
  {
    id: 'company_addresses', label: 'End. Empresas', icon: MapPin,
    description: 'Endereços das empresas', searchColumn: 'cidade',
    columns: [
      { key: 'logradouro', label: 'Logradouro' }, { key: 'numero', label: 'Nº' },
      { key: 'bairro', label: 'Bairro' }, { key: 'cidade', label: 'Cidade' },
      { key: 'estado', label: 'UF' }, { key: 'cep', label: 'CEP' },
      { key: 'tipo', label: 'Tipo' }, { key: 'is_primary', label: 'Principal', format: 'boolean' },
    ],
  },
  {
    id: 'contact_addresses', label: 'End. Contatos', icon: MapPin,
    description: 'Endereços dos contatos', searchColumn: 'cidade',
    columns: [
      { key: 'logradouro', label: 'Logradouro' }, { key: 'numero', label: 'Nº' },
      { key: 'cidade', label: 'Cidade' }, { key: 'estado', label: 'UF' },
      { key: 'pais', label: 'País' }, { key: 'tipo', label: 'Tipo' },
    ],
  },
];

export const SALES_TABS: TabConfig[] = [
  {
    id: 'salespeople', label: 'Vendedores', icon: User,
    description: 'Equipe de vendas', searchColumn: 'name',
    columns: [
      { key: 'name', label: 'Nome' }, { key: 'email', label: 'Email' },
      { key: 'role', label: 'Cargo' }, { key: 'commission_rate', label: 'Comissão', format: 'number' },
      { key: 'is_active', label: 'Ativo', format: 'boolean' }, { key: 'created_at', label: 'Criado', format: 'date' },
    ],
  },
  {
    id: 'sales', label: 'Vendas', icon: DollarSign,
    description: 'Registro de vendas', searchColumn: 'client_name',
    columns: [
      { key: 'client_name', label: 'Cliente' }, { key: 'product_name', label: 'Produto' },
      { key: 'amount', label: 'Valor', format: 'currency' }, { key: 'status', label: 'Status' },
      { key: 'category', label: 'Categoria' }, { key: 'source', label: 'Origem' },
      { key: 'created_at', label: 'Data', format: 'date' },
    ],
  },
  {
    id: 'sales_activities', label: 'Atividades', icon: Activity,
    description: 'Atividades de venda registradas', searchColumn: 'activity_type',
    columns: [
      { key: 'activity_type', label: 'Tipo' }, { key: 'outcome', label: 'Resultado' },
      { key: 'notes', label: 'Notas' }, { key: 'duration_minutes', label: 'Duração (min)', format: 'number' },
      { key: 'contact_name', label: 'Contato' }, { key: 'created_at', label: 'Data', format: 'date' },
    ],
  },
  {
    id: 'orders', label: 'Pedidos', icon: ClipboardList,
    description: 'Pedidos de venda realizados', searchColumn: 'numero_pedido',
    columns: [
      { key: 'numero_pedido', label: 'Nº Pedido' }, { key: 'status', label: 'Status' },
      { key: 'valor_total', label: 'Valor Total', format: 'currency' },
      { key: 'data_pedido', label: 'Data', format: 'date' },
      { key: 'forma_pagamento', label: 'Pagamento' }, { key: 'prazo_entrega', label: 'Prazo' },
    ],
  },
  {
    id: 'order_items', label: 'Itens Pedido', icon: Package,
    description: 'Itens individuais dos pedidos', searchColumn: 'produto_nome',
    columns: [
      { key: 'produto_nome', label: 'Produto' }, { key: 'quantidade', label: 'Qtd', format: 'number' },
      { key: 'preco_unitario', label: 'Preço Unit.', format: 'currency' },
      { key: 'valor_total', label: 'Subtotal', format: 'currency' },
      { key: 'desconto', label: 'Desconto', format: 'currency' },
    ],
  },
  {
    id: 'products', label: 'Produtos', icon: Package,
    description: 'Catálogo de produtos', searchColumn: 'nome',
    columns: [
      { key: 'nome', label: 'Nome' }, { key: 'codigo', label: 'Código' },
      { key: 'categoria', label: 'Categoria' }, { key: 'preco', label: 'Preço', format: 'currency' },
      { key: 'estoque', label: 'Estoque', format: 'number' }, { key: 'ativo', label: 'Ativo', format: 'boolean' },
    ],
  },
  {
    id: 'suppliers', label: 'Fornecedores', icon: Package,
    description: 'Base de fornecedores', searchColumn: 'categoria',
    columns: [
      { key: 'categoria', label: 'Categoria' }, { key: 'tipo_fornecedor', label: 'Tipo' },
      { key: 'ramo_atividade', label: 'Ramo' }, { key: 'perfil_preco', label: 'Preço' },
      { key: 'perfil_qualidade', label: 'Qualidade' }, { key: 'perfil_prazo', label: 'Prazo' },
      { key: 'homologado', label: 'Homologado', format: 'boolean' },
      { key: 'score_geral', label: 'Score', format: 'number' },
    ],
  },
  {
    id: 'carriers', label: 'Transportadoras', icon: Truck,
    description: 'Transportadoras cadastradas', searchColumn: 'tipo_transporte',
    columns: [
      { key: 'tipo_transporte', label: 'Tipo' }, { key: 'tipo_frete', label: 'Frete' },
      { key: 'transportadora_validada', label: 'Validada', format: 'boolean' },
      { key: 'homologado', label: 'Homologado', format: 'boolean' },
      { key: 'score_geral', label: 'Score', format: 'number' },
      { key: 'ultimo_transporte', label: 'Último', format: 'date' },
    ],
  },
];

export const CRM_PIPELINE_TABS: TabConfig[] = [
  {
    id: 'leads', label: 'Leads', icon: Target,
    description: 'Leads de prospecção', searchColumn: 'nome',
    columns: [
      { key: 'nome', label: 'Nome' }, { key: 'empresa', label: 'Empresa' },
      { key: 'canal_origem', label: 'Canal' }, { key: 'status', label: 'Status' },
      { key: 'temperatura', label: 'Temperatura' }, { key: 'responsavel_nome', label: 'Responsável' },
      { key: 'created_at', label: 'Criado', format: 'date' },
    ],
  },
  {
    id: 'deals', label: 'Negócios', icon: Briefcase,
    description: 'Negócios em andamento', searchColumn: 'titulo',
    columns: [
      { key: 'titulo', label: 'Título' }, { key: 'valor', label: 'Valor', format: 'currency' },
      { key: 'estagio', label: 'Estágio' }, { key: 'probabilidade', label: 'Prob. %', format: 'number' },
      { key: 'responsavel_nome', label: 'Responsável' },
      { key: 'data_fechamento', label: 'Fechamento', format: 'date' }, { key: 'status', label: 'Status' },
    ],
  },
  {
    id: 'quotations', label: 'Orçamentos', icon: FileText,
    description: 'Orçamentos enviados', searchColumn: 'numero',
    columns: [
      { key: 'numero', label: 'Nº' }, { key: 'valor_total', label: 'Valor', format: 'currency' },
      { key: 'status', label: 'Status' }, { key: 'validade', label: 'Validade', format: 'date' },
      { key: 'created_at', label: 'Criado', format: 'date' },
    ],
  },
  {
    id: 'tasks', label: 'Tarefas', icon: ClipboardList,
    description: 'Tarefas e follow-ups', searchColumn: 'titulo',
    columns: [
      { key: 'titulo', label: 'Título' }, { key: 'tipo', label: 'Tipo' },
      { key: 'status', label: 'Status' }, { key: 'prioridade', label: 'Prioridade' },
      { key: 'responsavel_nome', label: 'Responsável' },
      { key: 'data_vencimento', label: 'Vencimento', format: 'date' },
    ],
  },
  {
    id: 'notes', label: 'Notas', icon: StickyNote,
    description: 'Notas e observações', searchColumn: 'conteudo',
    columns: [
      { key: 'conteudo', label: 'Conteúdo' }, { key: 'tipo', label: 'Tipo' },
      { key: 'autor_nome', label: 'Autor' }, { key: 'created_at', label: 'Criado', format: 'date' },
    ],
  },
];

export const GAMIFICATION_TABS: TabConfig[] = [
  {
    id: 'achievements', label: 'Conquistas', icon: Trophy,
    description: 'Conquistas dos vendedores', searchColumn: 'achievement_type',
    columns: [
      { key: 'achievement_type', label: 'Tipo' }, { key: 'achievement_date', label: 'Data', format: 'date' },
    ],
  },
  {
    id: 'daily_challenges', label: 'Desafios Diários', icon: Zap,
    description: 'Desafios diários da gamificação', searchColumn: 'title',
    columns: [
      { key: 'title', label: 'Título' }, { key: 'description', label: 'Descrição' },
      { key: 'challenge_type', label: 'Tipo' }, { key: 'target_value', label: 'Meta', format: 'number' },
      { key: 'xp_reward', label: 'XP', format: 'number' }, { key: 'is_active', label: 'Ativo', format: 'boolean' },
      { key: 'challenge_date', label: 'Data', format: 'date' },
    ],
  },
  {
    id: 'weekly_challenges', label: 'Desafios Semanais', icon: Calendar,
    description: 'Desafios semanais da gamificação', searchColumn: 'title',
    columns: [
      { key: 'title', label: 'Título' }, { key: 'description', label: 'Descrição' },
      { key: 'challenge_type', label: 'Tipo' }, { key: 'target_value', label: 'Meta', format: 'number' },
      { key: 'xp_reward', label: 'XP', format: 'number' }, { key: 'is_active', label: 'Ativo', format: 'boolean' },
      { key: 'start_date', label: 'Início', format: 'date' }, { key: 'end_date', label: 'Fim', format: 'date' },
    ],
  },
];

export const METADATA_TABS: TabConfig[] = [
  {
    id: 'tags', label: 'Tags', icon: Tag,
    description: 'Tags para classificação', searchColumn: 'nome',
    columns: [
      { key: 'nome', label: 'Nome' }, { key: 'cor', label: 'Cor' }, { key: 'categoria', label: 'Categoria' },
    ],
  },
  {
    id: 'pipelines', label: 'Pipelines', icon: Layers,
    description: 'Pipelines de vendas', searchColumn: 'nome',
    columns: [
      { key: 'nome', label: 'Nome' }, { key: 'descricao', label: 'Descrição' },
      { key: 'ativo', label: 'Ativo', format: 'boolean' }, { key: 'created_at', label: 'Criado', format: 'date' },
    ],
  },
  {
    id: 'segments', label: 'Segmentos', icon: Globe,
    description: 'Segmentos de mercado', searchColumn: 'nome',
    columns: [
      { key: 'nome', label: 'Nome' }, { key: 'descricao', label: 'Descrição' }, { key: 'criterios', label: 'Critérios' },
    ],
  },
  {
    id: 'regions', label: 'Regiões', icon: MapPin,
    description: 'Regiões de atuação', searchColumn: 'nome',
    columns: [
      { key: 'nome', label: 'Nome' }, { key: 'estados', label: 'Estados' }, { key: 'responsavel_nome', label: 'Responsável' },
    ],
  },
  {
    id: 'payment_conditions', label: 'Pagamentos', icon: CreditCard,
    description: 'Condições de pagamento', searchColumn: 'descricao',
    columns: [
      { key: 'descricao', label: 'Descrição' }, { key: 'parcelas', label: 'Parcelas', format: 'number' },
      { key: 'prazo_dias', label: 'Prazo (dias)', format: 'number' }, { key: 'ativo', label: 'Ativo', format: 'boolean' },
    ],
  },
];
