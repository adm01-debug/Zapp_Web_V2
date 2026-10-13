import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';
import { log } from '@/lib/logger';

interface ScheduledReport {
  id: string;
  name: string;
  report_type: string;
  frequency: string;
  recipients: string[];
  format: string;
  is_active: boolean;
  next_send_at: string | null;
  last_sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const EMPTY_REPORT: Partial<ScheduledReport> = {
  name: '',
  report_type: 'dashboard_summary',
  frequency: 'weekly',
  recipients: [],
  format: 'pdf',
  is_active: true,
};

function calculateNextSendAt(frequency: string): string {
  const now = new Date();
  const next = new Date(now);
  switch (frequency) {
    case 'daily': next.setDate(next.getDate() + 1); next.setHours(8, 0, 0, 0); break;
    case 'weekly': next.setDate(next.getDate() + ((1 + 7 - next.getDay()) % 7 || 7)); next.setHours(8, 0, 0, 0); break;
    case 'monthly': next.setMonth(next.getMonth() + 1, 1); next.setHours(8, 0, 0, 0); break;
  }
  return next.toISOString();
}

export function useScheduledReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<Partial<ScheduledReport>>(EMPTY_REPORT);
  const [recipientInput, setRecipientInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('scheduled_reports').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setReports((data || []) as unknown as ScheduledReport[]);
    } catch (err) {
      log.error('Error fetching scheduled reports:', err);
      toast.error('Erro ao carregar relatórios agendados');
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão, sem estado derivado de props para sincronizar.
  useEffect(() => { fetchReports(); }, [fetchReports]);

  /**
   * Camada de dados (sem UI) sobre `scheduled_reports` — a MESMA tabela que a Edge
   * `send-scheduled-report` lê e atualiza. Estas funções propagam o erro para o
   * chamador decidir o aviso; `handleSave`/`handleDelete`/`toggleActive` são os
   * invólucros com toast/refresh usados pela tela de Reports, e o widget de
   * Relatórios Agendados do Dashboard usa estas funções via `useScheduledReportConfigs`.
   */
  const saveReport = useCallback(async (input: SaveScheduledReportInput): Promise<void> => {
    const reportData = {
      name: input.name.trim(),
      report_type: input.report_type || 'dashboard_summary',
      frequency: input.frequency || 'weekly',
      recipients: input.recipients,
      format: input.format || 'pdf',
      is_active: input.is_active ?? true,
      next_send_at: calculateNextSendAt(input.frequency || 'weekly'),
      created_by: user?.id || null,
    };

    if (input.id) {
      const { error } = await supabase.from('scheduled_reports').update(reportData).eq('id', input.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('scheduled_reports').insert(reportData);
      if (error) throw error;
    }
  }, [user?.id]);

  const deleteReport = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('scheduled_reports').delete().eq('id', id);
    if (error) throw error;
  }, []);

  const setReportActive = useCallback(async (id: string, isActive: boolean): Promise<void> => {
    const { error } = await supabase.from('scheduled_reports').update({ is_active: isActive }).eq('id', id);
    if (error) throw error;
  }, []);

  const addRecipient = useCallback(() => {
    const email = recipientInput.trim();
    if (!email || !email.includes('@')) { toast.error('Digite um email válido'); return; }
    if (editingReport.recipients?.includes(email)) { toast.error('Email já adicionado'); return; }
    setEditingReport(prev => ({ ...prev, recipients: [...(prev.recipients || []), email] }));
    setRecipientInput('');
  }, [recipientInput, editingReport.recipients]);

  const removeRecipient = useCallback((email: string) => {
    setEditingReport(prev => ({ ...prev, recipients: (prev.recipients || []).filter(r => r !== email) }));
  }, []);

  const handleSave = useCallback(async () => {
    const name = editingReport.name?.trim();
    if (!name) { toast.error('Nome é obrigatório'); return; }
    const recipients = editingReport.recipients ?? [];
    if (!recipients.length) { toast.error('Adicione pelo menos um destinatário'); return; }

    setIsSaving(true);
    try {
      await saveReport({
        id: editingReport.id,
        name,
        report_type: editingReport.report_type,
        frequency: editingReport.frequency,
        recipients,
        format: editingReport.format,
        is_active: editingReport.is_active,
      });
      toast.success(editingReport.id ? 'Relatório atualizado!' : 'Relatório agendado!');
      setIsDialogOpen(false);
      setEditingReport(EMPTY_REPORT);
      setRecipientInput('');
      fetchReports();
    } catch (err) {
      log.error('Error saving scheduled report:', err);
      toast.error('Erro ao salvar relatório');
    } finally {
      setIsSaving(false);
    }
  }, [editingReport, saveReport, fetchReports]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteReport(id);
      toast.success('Relatório removido!');
      fetchReports();
    } catch (err) {
      log.error('Error deleting report:', err);
      toast.error('Erro ao remover relatório');
    }
  }, [deleteReport, fetchReports]);

  const toggleActive = useCallback(async (id: string, isActive: boolean) => {
    try {
      await setReportActive(id, isActive);
      fetchReports();
    } catch (err) {
      log.error('Error toggling report:', err);
    }
  }, [setReportActive, fetchReports]);

  const handleSendNow = useCallback(async (report: ScheduledReport) => {
    try {
      toast.info('Enviando relatório...');
      const { error } = await supabase.functions.invoke('send-scheduled-report', { body: { reportId: report.id } });
      if (error) throw error;
      toast.success('Relatório enviado!');
      fetchReports();
    } catch (err) {
      log.error('Error sending report:', err);
      toast.error('Erro ao enviar relatório');
    }
  }, [fetchReports]);

  const openCreateDialog = useCallback(() => {
    setEditingReport(EMPTY_REPORT);
    setRecipientInput('');
    setIsDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((report: ScheduledReport) => {
    setEditingReport(report);
    setRecipientInput('');
    setIsDialogOpen(true);
  }, []);

  return {
    reports, loading, isDialogOpen, setIsDialogOpen,
    editingReport, setEditingReport, recipientInput, setRecipientInput,
    isSaving, addRecipient, removeRecipient,
    handleSave, handleDelete, toggleActive, handleSendNow,
    openCreateDialog, openEditDialog,
    // Camada de dados crua, para quem só precisa ler/gravar (widget do Dashboard).
    saveReport, deleteReport, setReportActive, reload: fetchReports,
  };
}

export type { ScheduledReport };

/** Campos que um formulário de agendamento fornece (sem id). */
export interface ScheduledReportForm {
  name: string;
  report_type?: string;
  frequency?: string;
  recipients: string[];
  format?: string;
  is_active?: boolean;
}

/** Formulário + id opcional: com id atualiza a linha, sem id insere uma nova. */
export interface SaveScheduledReportInput extends ScheduledReportForm {
  id?: string;
}

export type LastSendStatus = 'sent' | 'never';

export interface LastSendInfo {
  /** `sent` quando a Edge registrou um envio em `last_sent_at`; `never` quando não há registro. */
  status: LastSendStatus;
  /** Rótulo pt-BR pronto para a tela. */
  label: string;
  /** Instante do último envio registrado, ou `null`. */
  at: string | null;
}

/**
 * Traduz `last_sent_at` no "resultado do último envio" que a tela mostra.
 *
 * A Edge `send-scheduled-report` só grava `last_sent_at` quando o envio termina
 * (ela não persiste falha por destinatário), então o front distingue apenas
 * "houve envio registrado" de "nunca enviado" — nunca "quantos receberam".
 * Persistir o resultado por destinatário exigiria coluna nova (workersql).
 */
export function describeLastSend(report: Pick<ScheduledReport, 'last_sent_at'>): LastSendInfo {
  const at = report.last_sent_at ?? null;
  return at
    ? { status: 'sent', label: 'Enviado', at }
    : { status: 'never', label: 'Nunca enviado', at: null };
}

export const REPORT_TYPES = [
  { value: 'dashboard_summary', label: 'Resumo do Dashboard', icon: 'BarChart3', description: 'Métricas gerais de atendimento' },
  { value: 'agent_performance', label: 'Performance de Agentes', icon: 'Users', description: 'Relatório individual por agente' },
  { value: 'conversation_analytics', label: 'Análise de Conversas', icon: 'MessageSquare', description: 'Volume e métricas de conversas' },
  { value: 'sla_compliance', label: 'Cumprimento de SLA', icon: 'Target', description: 'Taxa de cumprimento e violações' },
] as const;

export const FREQUENCIES = [
  { value: 'daily', label: 'Diário', description: 'Todos os dias às 8h' },
  { value: 'weekly', label: 'Semanal', description: 'Toda segunda-feira às 8h' },
  { value: 'monthly', label: 'Mensal', description: 'Primeiro dia do mês às 8h' },
] as const;

export const FORMATS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'excel', label: 'Excel' },
] as const;
