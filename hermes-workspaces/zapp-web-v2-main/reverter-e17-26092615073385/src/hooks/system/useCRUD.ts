import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fromTable } from '@/lib/supabaseHelpers';
import { toast } from 'sonner';

export interface BaseEntity { 
  id: string; 
  created_at?: string; 
  updated_at?: string; 
  deleted_at?: string | null; 
}

export interface PaginatedResult<T> { 
  data: T[]; 
  total: number; 
  page: number; 
  pageSize: number; 
  totalPages: number; 
}

export interface CRUDConfig<T> {
  tableName: string;
  orderBy?: { column: keyof T | string; ascending?: boolean };
  softDeleteColumn?: string;
  defaultFilters?: Record<string, unknown>;
  messages?: { 
    createSuccess?: string; 
    updateSuccess?: string; 
    deleteSuccess?: string; 
    error?: string; 
  };
}

export function useCRUD<T extends BaseEntity>(config: CRUDConfig<T>) {
  const { 
    tableName, 
    orderBy, 
    softDeleteColumn = 'deleted_at', 
    defaultFilters = {}, 
    messages = {} 
  } = config;
  
  const queryClient = useQueryClient();
  const queryKey = [tableName];

  const useList = (options?: { 
    search?: string; 
    searchColumns?: string[]; 
    filters?: Record<string, unknown>; 
    page?: number; 
    pageSize?: number;
  }) => {
    const { search = '', searchColumns = [], filters = {}, page = 1, pageSize = 20 } = options || {};
    
    return useQuery({
      queryKey: [...queryKey, 'list', { search, filters, page, pageSize }],
      queryFn: async (): Promise<PaginatedResult<T>> => {
        let query = fromTable(tableName).select('*', { count: 'exact' });
        
        if (softDeleteColumn) {
          query = query.is(softDeleteColumn, null);
        }
        
        Object.entries({ ...defaultFilters, ...filters }).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            query = query.eq(key, value);
          }
        });
        
        if (search && searchColumns.length > 0) {
          const orConditions = searchColumns.map(col => `${col}.ilike.%${search}%`).join(',');
          query = query.or(orConditions);
        }
        
        if (orderBy) {
          query = query.order(String(orderBy.column), { ascending: orderBy.ascending ?? true });
        }
        
        const from = (page - 1) * pageSize;
        query = query.range(from, from + pageSize - 1);
        
        const { data, error, count } = await query;
        if (error) throw error;
        
        return { 
          data: (data || []) as T[], 
          total: count || 0, 
          page, 
          pageSize, 
          totalPages: Math.ceil((count || 0) / pageSize) 
        };
      },
    });
  };

  const useGetById = (id: string) => useQuery({
    queryKey: [...queryKey, id],
    queryFn: async () => {
      const { data, error } = await fromTable(tableName)
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as T;
    },
    enabled: !!id,
  });

  const createMutation = useMutation({
    mutationFn: async (newData: Partial<T>) => {
      const { data, error } = await fromTable(tableName)
        .insert(newData as Record<string, unknown>)
        .select()
        .single();
      if (error) throw error;
      return data as T;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey }); 
      toast.success(messages.createSuccess || 'Registro criado!'); 
    },
    onError: () => toast.error(messages.error || 'Erro ao criar registro'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data: updateData }: { id: string; data: Partial<T> }) => {
      const { data, error } = await fromTable(tableName)
        .update(updateData as Record<string, unknown>)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as T;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey }); 
      toast.success(messages.updateSuccess || 'Registro atualizado!'); 
    },
    onError: () => toast.error(messages.error || 'Erro ao atualizar registro'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromTable(tableName)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey }); 
      toast.success(messages.deleteSuccess || 'Registro removido!'); 
    },
    onError: () => toast.error(messages.error || 'Erro ao remover registro'),
  });

  const softDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromTable(tableName)
        .update({ [softDeleteColumn]: new Date().toISOString() } as Record<string, unknown>)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey }); 
      toast.success('Registro arquivado!'); 
    },
  });

  const bulkDelete = async (ids: string[]) => {
    const { error } = await fromTable(tableName)
      .delete()
      .in('id', ids);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey });
    toast.success(`${ids.length} registros removidos!`);
  };

  return {
    useList, 
    useGetById, 
    create: createMutation.mutate, 
    update: updateMutation.mutate,
    delete: deleteMutation.mutate, 
    softDelete: softDeleteMutation.mutate, 
    bulkDelete,
    isCreating: createMutation.isPending, 
    isUpdating: updateMutation.isPending, 
    isDeleting: deleteMutation.isPending,
  };
}

export default useCRUD;
