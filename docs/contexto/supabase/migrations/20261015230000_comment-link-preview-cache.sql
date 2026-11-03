COMMENT ON TABLE public.link_preview_cache IS
  'Cache de metadados de link preview (titulo, descricao, url, imagem). Acesso somente service_role (RLS ativa, sem policy de proposito — dados de preview nao sao sensiveis por usuario mas o path de escrita e exclusivo das edge functions).'
