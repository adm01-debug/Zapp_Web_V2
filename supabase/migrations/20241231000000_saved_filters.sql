-- ============================================
-- MIGRATION: Tabela de Filtros Salvos
-- Data: 2024-12-31
-- Descrição: Permite usuários salvarem filtros personalizados
-- ============================================

-- Criar tabela saved_filters
CREATE TABLE IF NOT EXISTS public.saved_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Restrição: nome único por usuário e entidade
  CONSTRAINT unique_filter_name_per_user_entity 
    UNIQUE (user_id, entity_type, name)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_saved_filters_user_id 
  ON public.saved_filters(user_id);

CREATE INDEX IF NOT EXISTS idx_saved_filters_entity_type 
  ON public.saved_filters(entity_type);

CREATE INDEX IF NOT EXISTS idx_saved_filters_user_entity 
  ON public.saved_filters(user_id, entity_type);

CREATE INDEX IF NOT EXISTS idx_saved_filters_default 
  ON public.saved_filters(user_id, entity_type, is_default) 
  WHERE is_default = true;

-- Habilitar RLS
ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

-- Política: usuários podem ver apenas seus próprios filtros
CREATE POLICY "Users can view own filters"
  ON public.saved_filters
  FOR SELECT
  USING (auth.uid() = user_id);

-- Política: usuários podem inserir seus próprios filtros
CREATE POLICY "Users can insert own filters"
  ON public.saved_filters
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Política: usuários podem atualizar seus próprios filtros
CREATE POLICY "Users can update own filters"
  ON public.saved_filters
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Política: usuários podem deletar seus próprios filtros
CREATE POLICY "Users can delete own filters"
  ON public.saved_filters
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_saved_filters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_saved_filters_updated_at ON public.saved_filters;
CREATE TRIGGER trigger_saved_filters_updated_at
  BEFORE UPDATE ON public.saved_filters
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_filters_updated_at();

-- Função para garantir apenas um filtro padrão por entidade
CREATE OR REPLACE FUNCTION ensure_single_default_filter()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.saved_filters
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND entity_type = NEW.entity_type
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_single_default_filter ON public.saved_filters;
CREATE TRIGGER trigger_single_default_filter
  BEFORE INSERT OR UPDATE OF is_default ON public.saved_filters
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION ensure_single_default_filter();

-- Comentários
COMMENT ON TABLE public.saved_filters IS 'Filtros salvos por usuários para diferentes entidades';
COMMENT ON COLUMN public.saved_filters.entity_type IS 'Tipo de entidade (ex: produtos, pedidos, colaboradores)';
COMMENT ON COLUMN public.saved_filters.filters IS 'Configuração do filtro em JSON';
COMMENT ON COLUMN public.saved_filters.is_default IS 'Se true, este filtro é aplicado automaticamente ao abrir a página';
