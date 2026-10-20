import { useState, useCallback, useRef } from 'react';
import { invokeEdge, supabase } from '@/lib/supabaseHelpers';
import { toast } from 'sonner';
import { describeAccessError, isAccessDeniedError } from '@/lib/rlsError';
import type { AppRole } from '@/hooks/system/useUserRole';
import { invokeEdge, readEdgeError } from '@/lib/invokeEdge';

const log = getLogger('useAdminData');

const AVATAR_BUCKET = 'avatars';
// Mesma validade curta usada no AvatarUpload: o perfil guarda só o caminho e a
// tela assina a URL sob demanda — o bucket `avatars` deixou de ser público.
const AVATAR_SIGNED_URL_TTL_SECONDS = 300;

function isStorageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Devolve o caminho durável do objeto a partir de uma URL assinada (ou do próprio caminho).
 * URL http que não é do bucket `avatars` devolve null: nunca gravamos URL http
 * em profiles.avatar_url (o bucket é privado e a URL assinada expira). */
function avatarObjectPath(value: string | null): string | null {
  if (!value || !isStorageUrl(value)) return value;
  try {
    const origin = new URL(SUPABASE_URL).origin;
    return parseSupabaseStorageObjectUrl(value, [AVATAR_BUCKET], [origin])?.path ?? null;
  } catch {
    return null;
  }
}

export interface UserWithRole {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  nickname: string | null;
  signature: string | null;
  role: AppRole;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  access_level: string | null;
  max_chats: number | null;
  can_download: boolean;
  is_active: boolean | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  details: unknown;
  created_at: string;
  user?: { name: string; email: string | null } | null;
}

export const roleConfig: Record<AppRole, { label: string; icon: string; color: string }> = {
  admin: { label: 'Administrador', icon: 'Crown', color: 'text-warning' },
  supervisor: { label: 'Supervisor', icon: 'UserCog', color: 'text-info' },
  agent: { label: 'Atendente', icon: 'User', color: 'text-muted-foreground' },
  special_agent: { label: 'Agente Especial', icon: 'Eye', color: 'text-accent-foreground' },
};

// Mensagens claras para os erros levantados pela RPC `admin_set_role`
// (PostgREST devolve o texto do RAISE EXCEPTION em `error.message`).
const ROLE_CHANGE_ERROR_MESSAGES: Record<string, string> = {
  cannot_demote_self: 'Você não pode remover o próprio papel de administrador.',
  cannot_demote_last_admin: 'A instalação precisa de pelo menos um administrador.',
  admin_required: 'Apenas administradores podem alterar papéis.',
  jwt_session_required: 'Sessão expirada. Faça login novamente.',
};

function roleChangeErrorMessage(error: { code?: string; message?: string }): string {
  // A negação de RLS (42501/403) chega crua do PostgREST; a UI mostra a
  // mensagem fixa do helper, sem nome de tabela nem de policy.
  if (isAccessDeniedError(error)) return describeAccessError(error);
  const message = error.message ?? '';
  for (const [code, text] of Object.entries(ROLE_CHANGE_ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return 'Erro ao atualizar role';
}

// Campos que a criação de usuário (Edge `create-user`) valida no servidor.
export type CreateUserField = 'name' | 'email' | 'password' | 'role';

export interface CreateUserFieldError {
  /** Campo do formulário que originou o erro; `null` quando não dá para atribuir. */
  field: CreateUserField | null;
  /** Mensagem em pt-BR para mostrar ao lado do campo. */
  message: string;
}

// A Edge devolve tudo num único texto (mensagem do GoTrue ou os erros do zod
// unidos por '; '). Traduzimos esse texto para o CAMPO que o formulário destaca,
// sem mostrar a mensagem crua do servidor.
const CREATE_USER_ERROR_RULES: ReadonlyArray<{ field: CreateUserField; pattern: RegExp; message: string }> = [
  // E-mail duplicado chega do GoTrue como "...already been registered".
  { field: 'email', pattern: /already\s+(been\s+)?registered|already\s+exists|duplicate|j[áa]\s+cadastrad/i, message: 'Este e-mail já está cadastrado.' },
  { field: 'email', pattern: /email/i, message: 'Informe um e-mail válido.' },
  { field: 'password', pattern: /password|senha/i, message: 'A senha deve ter pelo menos 8 caracteres.' },
  // O zod da Edge não devolve o NOME do campo inválido (a mensagem é
  // "Invalid enum value. Expected ..."); o único enum escalar do corpo é `role`.
  { field: 'role', pattern: /invalid enum value|role|papel/i, message: 'Papel de usuário inválido.' },
  { field: 'name', pattern: /name|nome/i, message: 'Informe o nome do usuário.' },
];

export function mapCreateUserError(serverMessage: string | null | undefined): CreateUserFieldError {
  const texto = typeof serverMessage === 'string' ? serverMessage : '';
  for (const rule of CREATE_USER_ERROR_RULES) {
    if (rule.pattern.test(texto)) return { field: rule.field, message: rule.message };
  }
  return { field: null, message: 'Erro ao criar usuário' };
}

// Mensagem e status de um erro de `functions.invoke`. O supabase-js devolve
// `FunctionsHttpError` com o `Response` cru em `error.context`; o corpo é
// `{ error: '...' }` na Edge padrão, mas pode vir vazio/HTML de um proxy —
// por isso a leitura do corpo é guardada.
async function readEdgeError(error: unknown): Promise<{ status: number | null; message: string }> {
  const context = (error as { context?: { status?: number; clone?: () => Response } } | null)?.context;
  if (context && typeof context.status === 'number' && typeof context.clone === 'function') {
    let message = '';
    try {
      const parsed: unknown = await context.clone().json();
      if (parsed && typeof parsed === 'object' && typeof (parsed as { error?: unknown }).error === 'string') {
        message = (parsed as { error: string }).error;
      }
    } catch {
      // corpo não-JSON (HTML de proxy, resposta vazia): segue com o padrão.
    }
    return { status: context.status, message: message || 'Erro ao criar usuário' };
  }
  const message = error instanceof Error && error.message ? error.message : 'Erro ao criar usuário';
  return { status: null, message };
}

export const accessLevelConfig: Record<string, { label: string; description: string }> = {
  basic: { label: 'Básico', description: 'Acesso apenas aos próprios atendimentos' },
  standard: { label: 'Padrão', description: 'Acesso a atendimentos e contatos atribuídos' },
  advanced: { label: 'Avançado', description: 'Acesso a relatórios e métricas da equipe' },
  full: { label: 'Completo', description: 'Acesso total ao sistema' },
};

// Item 1 (paridade V2/V3): a Edge `create-user` valida a senha com
// `z.string().min(8)` (supabase/functions/create-user/index.ts), mas o
// formulário do painel exigia só 6. A régua vem daqui para a tela usar o
// mesmo número e o mesmo texto.
export const MIN_PASSWORD_LENGTH = 8;

export const AUDIT_PAGE_SIZE = 50;

/** Erro por campo devolvido por `mapCreateUserError`. */
export interface CreateUserFieldError {
  /** Campo que originou o erro (`null` = erro geral, sem campo específico). */
  field: 'email' | 'password' | 'name' | null;
  /** Mensagem amigável sem expor detalhes internos do servidor. */
  message: string;
}

/**
 * Classifica a mensagem de erro da Edge `create-user` em um campo específico
 * ou em um erro geral, sem vazar texto interno do servidor para a tela.
 */
export function mapCreateUserError(rawMessage: string | undefined): CreateUserFieldError {
  if (!rawMessage) return { field: null, message: 'Erro ao criar usuário' };
  const msg = rawMessage.toLowerCase();
  if (msg.includes('email') || msg.includes('e-mail')) return { field: 'email', message: 'Informe um e-mail válido.' };
  if (msg.includes('senha') || msg.includes('password')) return { field: 'password', message: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  if (msg.includes('nome') || msg.includes('name')) return { field: 'name', message: 'Informe o nome do usuário.' };
  return { field: null, message: 'Erro ao criar usuário' };
}

/** 'YYYY-MM-DD' → instante UTC do início do dia no fuso do navegador. */
export function inicioDoDiaLocal(data: string): string {
  return new Date(`${data}T00:00:00`).toISOString();
}

/** 'YYYY-MM-DD' → instante UTC do último milissegundo do dia no fuso do navegador. */
export function fimDoDiaLocal(data: string): string {
  return new Date(`${data}T23:59:59.999`).toISOString();
}

// Filtros da aba de auditoria (item 1): intervalo de datas inclusivo (dias
// inteiros, no fuso do navegador) e paginação 1-based. Quem chama (AdminView)
// monta o estado e passa adiante; o hook só monta a consulta.
export interface AuditLogFilter {
  /** Data inicial inclusiva, 'YYYY-MM-DD'. */
  from?: string;
  /** Data final inclusiva, 'YYYY-MM-DD'. */
  to?: string;
  /** Página 1-based. Padrão 1. */
  page?: number;
  /** Tamanho da página. Padrão AUDIT_PAGE_SIZE. */
  pageSize?: number;
}

export function useAdminData(activeTab: 'users' | 'audit' | 'crm', auditFilter?: AuditLogFilter) {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // Reentrância de desativação/reativação por usuário: evita que um duplo clique
  // no Switch dispare duas gravações concorrentes do mesmo perfil.
  const togglingRef = useRef<Set<string>>(new Set());
  // Erro por campo da última tentativa de criação (limpo a cada nova tentativa).
  const [createUserError, setCreateUserError] = useState<CreateUserFieldError | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (activeTab === 'users') {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, name, email, avatar_url, nickname, signature, job_title, department, phone, access_level, max_chats, can_download, is_active, created_at')
        .order('name');

      if (profilesError) {
        setError('Não foi possível carregar os usuários.');
        toast.error('Não foi possível carregar os usuários. Tente novamente.');
        setLoading(false);
        return;
      }

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) {
        setError('Não foi possível carregar os papéis dos usuários.');
        toast.error('Não foi possível carregar os papéis dos usuários. Tente novamente.');
        setLoading(false);
        return;
      }

      const usersWithRoles = (profiles ?? []).map(profile => {
        const userRole = (roles ?? []).find(r => r.user_id === profile.user_id);
        return {
          ...profile,
          role: (userRole?.role || 'agent') as AppRole,
        };
      });
      setUsers(usersWithRoles);
    } else if (activeTab === 'audit') {
      const start = (auditPage - 1) * auditPageSize;

      let query = supabase
        .from('audit_logs')
        .select('id, user_id, action, entity_type, details, created_at')
        .order('created_at', { ascending: false })
        .range(start, start + auditPageSize - 1);

      if (auditFrom) query = query.gte('created_at', inicioDoDiaLocal(auditFrom));
      if (auditTo) query = query.lte('created_at', fimDoDiaLocal(auditTo));

      const { data: logs, error: logsError, count } = await query;

      if (logsError) {
        setError('Não foi possível carregar a auditoria.');
        toast.error('Não foi possível carregar a auditoria. Tente novamente.');
        setLoading(false);
        return;
      }

      const rows = logs ?? [];
      const userIds = [...new Set(rows.map(l => l.user_id).filter((id): id is string => id !== null))];
      const { data: profiles, error: profilesError } = userIds.length > 0
        ? await supabase
          .from('profiles')
          .select('user_id, name, email')
          .in('user_id', userIds)
        : { data: [] as { user_id: string; name: string; email: string | null }[], error: null };

      if (profilesError) {
        // A auditoria carregou; só os nomes dos autores falharam — mostra os
        // registros sem nome em vez de esconder a lista inteira.
        toast.error('Não foi possível carregar os nomes dos autores.');
      }

      const logsWithUsers: AuditLog[] = rows.map(log => ({
        ...log,
        user: profiles?.find(p => p.user_id === log.user_id) || null,
      }));
      setAuditLogs(logsWithUsers);
      setAuditTotal(count ?? rows.length);
    }

    setLoading(false);
  }, [activeTab, auditFrom, auditTo, auditPage, auditPageSize]);

  // R2-AUTH-008 (item 74): a troca de papel vai pela RPC atômica
  // `admin_set_role` (SECURITY DEFINER). O caminho delete+insert era
  // não-transacional — se o INSERT falhava depois do DELETE, o usuário
  // ficava sem role. A RPC exige JWT real, autoriza só admin, protege
  // auto-rebaixamento e o último administrador, e faz INSERT/UPDATE atômico.
  const handleRoleChange = useCallback(async (userId: string, newRole: AppRole) => {
    const { error } = await supabase.rpc('admin_set_role', { _user_id: userId, _role: newRole });
    if (error) {
      toast.error(roleChangeErrorMessage(error));
      return;
    }
    toast.success(`Usuário agora é ${roleConfig[newRole].label}.`);
    fetchData();
  }, [fetchData]);

  const handleToggleActive = useCallback(async (user: UserWithRole) => {
    // R2-AUTH-004 (item 6): desativar deve depender da operação server-side
    // atômica — o trigger `trg_revoke_sessions_on_profile_deactivate` revoga as
    // sessões Auth do usuário quando `is_active` vira false. Aqui o frontend só
    // grava o campo; a revogação real é do backend. Reativar só volta `is_active`
    // para true e NÃO cria sessão (o trigger só dispara na transição para false).
    if (togglingRef.current.has(user.id)) return;
    togglingRef.current.add(user.id);
    try {
      const deactivating = user.is_active !== false;
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !deactivating })
        .eq('id', user.id);
      if (error) {
        toast.error('Erro ao atualizar status');
        return;
      }
      if (deactivating) {
        toast.success(
          'Usuário desativado. As sessões foram revogadas agora; um token de acesso já emitido pode continuar válido até expirar.'
        );
      } else {
        toast.success('Usuário reativado. Nenhuma sessão foi criada.');
      }
      fetchData();
    } finally {
      togglingRef.current.delete(user.id);
    }
  }, [fetchData]);

  const handleSaveUser = useCallback(async (
    editingUser: UserWithRole,
    avatarFile: File | null,
  ): Promise<boolean> => {
    let avatarUrl = avatarObjectPath(editingUser.avatar_url);
    if (avatarFile) {
      const fileExt = avatarFile.name.split('.').pop();
      const filePath = `${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile);
      if (uploadError) {
        toast.error('Erro ao enviar foto');
        return false;
      }
      // Guarda o caminho do arquivo (não a URL assinada, que expira)
      avatarUrl = filePath;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        name: editingUser.name,
        nickname: editingUser.nickname,
        signature: editingUser.signature,
        job_title: editingUser.job_title,
        department: editingUser.department,
        phone: editingUser.phone,
        avatar_url: avatarUrl,
        access_level: editingUser.access_level,
        max_chats: editingUser.max_chats,
        can_download: editingUser.can_download,
      })
      .eq('id', editingUser.id);

    if (error) {
      toast.error('Erro ao salvar usuário');
      return false;
    }
    toast.success('Usuário atualizado com sucesso');
    fetchData();
    return true;
  }, [fetchData]);

  // PE-104/105: provisiona a credencial SIP do atendente pela RPC atômica
  // `set_voip_profile_credentials` (SECURITY DEFINER, admin/supervisor). A senha vai
  // direto para o Vault — nunca fica em coluna comum nem volta para a tela.
  const handleSaveRamal = useCallback(async (
    profileId: string,
    ramal: string,
    sipPassword: string,
  ): Promise<boolean> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('set_voip_profile_credentials', {
      p_profile_id: profileId,
      p_ramal: ramal,
      p_sip_password: sipPassword,
    });
    if (error) {
      toast.error(ramalErrorMessage(error));
      return false;
    }
    toast.success('Ramal salvo.');
    fetchData();
    return true;
  }, [fetchData]);

  interface CreateUserPayload {
    name: string;
    nickname?: string;
    signature?: string;
    job_title?: string;
    avatarFile?: File | null;
    email: string;
    password: string;
    role: AppRole;
    gmail_email?: string;
    google_services?: string[];
    dropbox_email?: string;
  }

  const handleCreateUser = useCallback(async (payload: CreateUserPayload): Promise<boolean> => {
    setCreateUserError(null);
    if (!payload.name || !payload.email || !payload.password) {
      toast.error('Preencha todos os campos obrigatórios');
      return false;
    }
    // Mesma régua da Edge `create-user` (z.string().min(8)): o frontend não
    // pode aceitar senha que o backend vai recusar.
    if (payload.password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
      return false;
    }

    let avatarUrl: string | undefined;
    if (payload.avatarFile) {
      const fileExt = payload.avatarFile.name.split('.').pop();
      const filePath = `${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, payload.avatarFile);
      if (uploadError) {
        toast.error('Erro ao fazer upload da foto');
        return false;
      }
      // Guarda o caminho do arquivo (não a URL assinada, que expira)
      avatarUrl = filePath;
    }

    const body = {
      name: payload.name,
      nickname: payload.nickname || undefined,
      signature: payload.signature || undefined,
      job_title: payload.job_title || undefined,
      avatar_url: avatarUrl,
      email: payload.email,
      password: payload.password,
      role: payload.role,
      gmail_email: payload.gmail_email || undefined,
      google_services: payload.google_services,
      dropbox_email: payload.dropbox_email || undefined,
    };

    try {
      // Camada padrão (PE-43): `invokeEdge` (src/lib/supabaseHelpers) anexa o
      // token da sessão atual e trata corpo/status HTTP. O `fetch` cru montava
      // `Bearer ${session?.access_token}` à mão (podia virar 'Bearer undefined')
      // e lia o corpo do erro sem guarda.
      try {
        await invokeEdge('create-user', body);
      } catch (firstError) {
        const { status } = await readEdgeError(firstError);
        if (status !== 401) throw firstError;
        // Sessão expirada: renova UMA vez e repete antes de desistir.
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) throw firstError;
        await invokeEdge('create-user', body);
      }

      toast.success('Usuário criado com sucesso!');
      fetchData();
      return true;
    } catch (error) {
      const { message } = await readEdgeError(error);
      const fieldError = mapCreateUserError(message);
      setCreateUserError(fieldError);
      toast.error(fieldError.message);
      return false;
    }
  }, [fetchData]);

  return {
    users,
    auditLogs,
    auditTotal,
    loading,
    error,
    fetchData,
    handleRoleChange,
    handleToggleActive,
    handleSaveUser,
    handleSaveRamal,
    handleCreateUser,
    createUserError,
  };
}
