import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { avisarCopia, copiarTexto } from '@/lib/clipboard';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { queryClient } from '@/lib/queryClient';
import { normalizeE164BR } from '@/lib/calls/phone';
import { useConnectionsRealtime, type ConnectionsChange } from '@/hooks/inbox/useConnectionsRealtime';
import { invalidateConnectionsList } from '@/hooks/inbox/useConnectionsList';

export interface WhatsAppConnection {
  id: string;
  name: string;
  phone_number: string;
  instance_id: string | null;
  status: string;
  qr_code: string | null;
  is_default: boolean;
  created_at: string;
  battery_level?: number | null;
  is_plugged?: boolean | null;
  retry_count?: number | null;
  max_retries?: number | null;
  health_status?: string | null;
  health_response_ms?: number | null;
  last_health_check?: string | null;
}

export interface QrCodeDialogState {
  open: boolean;
  connectionId: string;
  connectionName: string;
  qrCode: string | null;
  status: 'loading' | 'pending' | 'connected' | 'error';
  errorMessage?: string;
}

const INITIAL_QR_STATE: QrCodeDialogState = {
  open: false,
  connectionId: '',
  connectionName: '',
  qrCode: null,
  status: 'loading',
};

/**
 * DDDs em uso no Brasil (mesma lista do Zapp V3 `validatePhoneDetailed`).
 * Serve para recusar no front o número que a Edge recusaria — com o motivo na
 * tela, em vez de um 400 genérico. Fonte: plano de numeração da Anatel.
 */
const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

interface PhoneValidation {
  ok: boolean;
  /** E.164 pronto para a Edge; vazio quando `ok` é false. */
  e164: string;
  /** Motivo em pt-BR mostrado ao operador quando `ok` é false. */
  motivo: string;
}

/**
 * Valida e normaliza o telefone da conexão ANTES de chamar a Edge (porte do
 * `validatePhoneDetailed` do V3, reaproveitando `normalizeE164BR` do V2).
 * Aceita com/sem +55, com máscara e com o nono dígito omitido; devolve o
 * E.164 (`+55DDD9XXXXXXXX`) que a Edge grava.
 */
function validarTelefoneConexao(bruto: string): PhoneValidation {
  const invalido = (motivo: string): PhoneValidation => ({ ok: false, e164: '', motivo });

  const digitos = bruto.replace(/\D/g, '');
  if (!digitos) return invalido('Informe o número do telefone.');

  let local = digitos.replace(/^0+/, '');
  if (local.startsWith('55') && (local.length === 12 || local.length === 13)) local = local.slice(2);

  if (local.length < 10 || local.length > 11) {
    return invalido('Número inválido: informe DDD + número, com 10 ou 11 dígitos.');
  }

  const ddd = Number(local.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) return invalido(`O DDD ${local.slice(0, 2)} não existe no Brasil.`);

  const e164 = normalizeE164BR(bruto);
  if (!e164) return invalido('Número inválido: confira o DDD e o número.');

  return { ok: true, e164, motivo: '' };
}

/**
 * Invalida os cards que mostram o estado da conexão (Talk X / envio de
 * catálogo). Sem isso o card segue exibindo "Conectada" depois de a conexão
 * ser desconectada/excluída/trocada de padrão até o staleTime de 30s expirar.
 */
function invalidarStatusDeConexao(): void {
  void queryClient.invalidateQueries({ queryKey: ['talkx-connection-status'] });
  void queryClient.invalidateQueries({ queryKey: ['catalog-send-readiness'] });
  // Lista compartilhada (`['connections']`): a faixa de desconexão e as demais
  // telas releem do banco em vez de servir o cache de 30s.
  void invalidateConnectionsList();
}


export function useConnectionsManager() {
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [qrCodeDialog, setQrCodeDialog] = useState<QrCodeDialogState>(INITIAL_QR_STATE);
  const [newConnection, setNewConnection] = useState({ name: '', phone_number: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const qrTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  // Espelhado em useLayoutEffect, nao no corpo do render: escrever em ref
  // durante o render quebra em StrictMode/concurrent, onde o render pode ser
  // descartado. Mesma convencao de useNavigationHistory.ts.
  const qrCodeDialogRef = useRef<QrCodeDialogState>(INITIAL_QR_STATE);
  useLayoutEffect(() => { qrCodeDialogRef.current = qrCodeDialog; }, [qrCodeDialog]);
  // Identidade da abertura atual do dialogo de QR (R2-API-039): cada abertura,
  // refresh ou fechamento grava de forma SINCRONA uma nova geracao e a conexao
  // correspondente. Respostas e timers carregam a identidade em que nasceram e
  // so alteram o estado enquanto ela ainda for a atual. Nao da para usar o
  // espelho de estado (qrCodeDialogRef) no caminho de connect: ele so reflete
  // a identidade depois do commit, e a resposta pode chegar antes.
  const qrSessionRef = useRef<{ generation: number; connectionId: string }>({
    generation: 0,
    connectionId: '',
  });

  // Rede de seguranca: se o dialog ficar em 'loading' (ex.: connect trava/demora,
  // ou o backend nao devolve QR) ele nunca mais sairia do spinner — nao ha else no
  // caminho feliz. Apos 30s sem QR nem conexao, cai para 'error' com o botao de
  // "Gerar novo codigo" disponivel. Re-arma a cada volta para 'loading' (refresh).
  useEffect(() => {
    if (qrCodeDialog.open && qrCodeDialog.status === 'loading') {
      qrTimeoutRef.current = setTimeout(() => {
        setQrCodeDialog((prev) => prev.status === 'loading'
          ? { ...prev, status: 'error', errorMessage: 'Não foi possível gerar o QR Code (a sessão pode estar pendente na Evolution GO). Tente "Gerar novo código".' }
          : prev);
      }, 30000);
    }
    return () => { if (qrTimeoutRef.current) { clearTimeout(qrTimeoutRef.current); qrTimeoutRef.current = null; } };
  }, [qrCodeDialog.open, qrCodeDialog.status]);

  const {
    isLoading: evolutionLoading,
    createConnection,
    connectInstance,
    getInstanceStatus,
    disconnectInstance,
    deleteInstance,
  } = useEvolutionApi();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Realtime unificado: tópico único por montagem, canal fechado no unmount e
  // um único aviso de "conectado" por transição (a faixa de desconexão usa o
  // mesmo hook, então os dois deixaram de brigar pelo canal).
  const { announceConnected } = useConnectionsRealtime({
    onChange: (payload: ConnectionsChange) => {
      // Qualquer evento muda a lista compartilhada: derruba o cache para as
      // outras telas (faixa de desconexão, nova conversa, status) relerem.
      void invalidateConnectionsList();
      if (payload.eventType === 'UPDATE') {
        const newConn = payload.new as WhatsAppConnection;
        setConnections((prev) =>
          prev.map((conn) => (conn.id === newConn.id ? newConn : conn))
        );
        if (qrCodeDialogRef.current.open && qrCodeDialogRef.current.connectionId === newConn.id) {
          if (newConn.status === 'connected') {
            setQrCodeDialog((prev) => ({ ...prev, status: 'connected', qrCode: null }));
          } else if (newConn.qr_code) {
            setQrCodeDialog((prev) => ({ ...prev, qrCode: newConn.qr_code, status: 'pending' }));
          }
        }
      } else if (payload.eventType === 'INSERT') {
        setConnections((prev) => [payload.new as WhatsAppConnection, ...prev]);
      } else if (payload.eventType === 'DELETE') {
        setConnections((prev) => prev.filter((conn) => conn.id !== (payload.old as { id: string }).id));
      }
    },
  });

  useEffect(() => {
    void fetchConnections();
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, []);

  const fetchConnections = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_connections')
      .select('id, name, phone_number, instance_id, status, is_default, created_at, battery_level, is_plugged, retry_count, max_retries, health_status, health_response_ms, last_health_check')
      .order('created_at', { ascending: false });
    if (!isMountedRef.current) return;
    if (!error && data) setConnections(data as WhatsAppConnection[]);
    setLoading(false);
  };

  const generateInstanceName = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30) +
    '_' + Date.now().toString().slice(-6);

  const handleAddConnection = async () => {
    if (!newConnection.name || !newConnection.phone_number) {
      toast({ title: 'Erro', description: 'Preencha o nome e o número do telefone.', variant: 'destructive' });
      return;
    }
    // Valida e normaliza ANTES de chamar a Edge: DDD inexistente ou número
    // curto demais vira motivo na tela, em vez de um 400 do create-connection.
    const telefone = validarTelefoneConexao(newConnection.phone_number);
    if (!telefone.ok) {
      toast({ title: 'Número de telefone inválido', description: telefone.motivo, variant: 'destructive' });
      return;
    }
    setIsCreating(true);
    const instanceName = generateInstanceName(newConnection.name);
    try {
      // create-connection cria a instância na GO, a linha em
      // whatsapp_connections e o token no Vault numa operação só — o front
      // não insere a linha manualmente (evita a instância órfã que sobrava
      // se esse insert falhasse depois de criar na GO via create-instance).
      const result = await createConnection({
        instanceName,
        name: newConnection.name,
        phone_number: telefone.e164,
        is_default: connections.length === 0,
      });
      toast({ title: 'Conexão criada!', description: 'Agora conecte escaneando o QR Code.' });
      setIsAddDialogOpen(false);
      setNewConnection({ name: '', phone_number: '' });
      if (result?.connection) void handleShowQrCode(result.connection as unknown as WhatsAppConnection);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      log.error('Error creating connection:', error);
      toast({ title: 'Erro ao criar conexão', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  // R2-API-039: cada tick carrega a identidade (conexao + geracao) em que
  // nasceu. Antes de tocar no estado -- ou de zerar a referencia do intervalo --
  // confirmamos que essa identidade ainda e a atual; sem isso o status "open"
  // da conexao A marcava B como conectada e anulava o timer de B (polling
  // zumbi mesmo depois de fechar o dialogo).
  const startStatusPolling = useCallback((instanceName: string, connectionId: string, generation: number) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    const interval = setInterval(async () => {
      try {
        const result = await getInstanceStatus(instanceName);
        const session = qrSessionRef.current;
        if (session.generation !== generation || session.connectionId !== connectionId) {
          // Resquicio de outra abertura: encerra este timer e nao mexe no
          // estado nem na referencia do intervalo da geracao atual.
          clearInterval(interval);
          if (pollingIntervalRef.current === interval) pollingIntervalRef.current = null;
          return;
        }
        if (result?.state === 'open' || result?.status === 'connected') {
          clearInterval(interval);
          if (pollingIntervalRef.current === interval) pollingIntervalRef.current = null;
          setQrCodeDialog((prev) => ({ ...prev, status: 'connected', qrCode: null }));
          // Um aviso por transição: se o realtime já viu este "conectado", o
          // announceConnected engole o duplicado (antes o operador recebia dois).
          announceConnected({ id: connectionId, status: 'connected' });
        }
      } catch (error) {
        log.error('Status polling error:', error);
      }
    }, 3000);
    pollingIntervalRef.current = interval;
  }, [getInstanceStatus, announceConnected]);

  const handleShowQrCode = async (connection: WhatsAppConnection) => {
    if (!connection.instance_id) {
      toast({ title: 'Erro', description: 'Esta conexão não possui uma instância configurada.', variant: 'destructive' });
      return;
    }
    // Nova identidade de abertura: invalida respostas/timers da anterior.
    const generation = qrSessionRef.current.generation + 1;
    qrSessionRef.current = { generation, connectionId: connection.id };
    setQrCodeDialog({
      open: true, connectionId: connection.id, connectionName: connection.name,
      qrCode: connection.qr_code,
      status: connection.status === 'connected' ? 'connected' : 'loading',
    });
    if (connection.status !== 'connected') {
      try {
        const result = await connectInstance(connection.instance_id);
        // O operador pode ter fechado o dialogo ou aberto outra conexao nesse
        // meio-tempo: a resposta pertence a outra identidade (outra geracao ou
        // outra conexao) e nao pode ir para o dialogo atual.
        if (qrSessionRef.current.generation !== generation
          || qrSessionRef.current.connectionId !== connection.id) return;
        if (result?.qrcode?.base64) {
          setQrCodeDialog((prev) => ({ ...prev, qrCode: result.qrcode.base64, status: 'pending' }));
        }
        startStatusPolling(connection.instance_id, connection.id, generation);
      } catch (error: unknown) {
        if (qrSessionRef.current.generation !== generation
          || qrSessionRef.current.connectionId !== connection.id) return;
        setQrCodeDialog((prev) => ({
          ...prev, status: 'error',
          errorMessage: error instanceof Error ? error.message : 'Erro ao gerar QR Code',
        }));
      }
    }
  };

  const handleRefreshQrCode = async () => {
    const connection = connections.find((c) => c.id === qrCodeDialog.connectionId);
    if (!connection?.instance_id) return;
    // Cada "Gerar novo codigo" abre uma nova identidade para a MESMA conexao.
    const generation = qrSessionRef.current.generation + 1;
    qrSessionRef.current = { generation, connectionId: connection.id };
    setQrCodeDialog((prev) => ({ ...prev, status: 'loading', qrCode: null }));
    try {
      const result = await connectInstance(connection.instance_id);
      if (qrSessionRef.current.generation !== generation
        || qrSessionRef.current.connectionId !== connection.id) return;
      if (result?.status === 'connected') {
        setQrCodeDialog((prev) => ({ ...prev, status: 'connected' }));
        return;
      }
      if (result?.qrcode?.base64) {
        setQrCodeDialog((prev) => ({ ...prev, qrCode: result.qrcode.base64, status: 'pending' }));
      }
      startStatusPolling(connection.instance_id, connection.id, generation);
    } catch (error: unknown) {
      if (qrSessionRef.current.generation !== generation
        || qrSessionRef.current.connectionId !== connection.id) return;
      setQrCodeDialog((prev) => ({
        ...prev, status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Erro ao atualizar QR Code',
      }));
    }
  };

  const handleCopyId = async (id: string) => {
    avisarCopia(await copiarTexto(id));
  };

  const handleReconnect = (connection: WhatsAppConnection) => handleShowQrCode(connection);

  const handleDisconnect = async (connection: WhatsAppConnection) => {
    if (!connection.instance_id) return;
    try {
      await disconnectInstance(connection.instance_id);
      await supabase.from('whatsapp_connections').update({ status: 'disconnected', qr_code: null }).eq('id', connection.id);
      // O card do Talk X / catálogo lia 'Conectada' até o staleTime expirar.
      invalidarStatusDeConexao();
    } catch (error: unknown) {
      toast({ title: 'Erro ao desconectar', description: error instanceof Error ? error.message : 'Erro desconhecido', variant: 'destructive' });
    }
  };

  // A troca de padrão é atômica no banco (RPC de t_ae0a55a6): uma chamada só
  // desmarca o padrão antigo e marca o novo na mesma transação. Antes eram dois
  // updates separados — se o segundo falhava, o front anunciava sucesso com a
  // troca pela metade. Erro (ou ausência de confirmação) revalida o estado real,
  // como em handleDelete — nunca sucesso mudo.
  const handleSetDefault = async (id: string) => {
    const { data, error } = await (supabase as any).rpc('set_default_whatsapp_connection', { p_connection_id: id }); // eslint-disable-line @typescript-eslint/no-explicit-any -- RPC nova (t_ae0a55a6), types.ts ainda não sincronizado
    if (error || !data) {
      toast({
        title: 'Erro ao definir conexão padrão',
        description: error?.message ?? 'A troca de conexão padrão não foi confirmada.',
        variant: 'destructive',
      });
      await fetchConnections();
      return;
    }
    setConnections((prev) => prev.map((conn) => ({ ...conn, is_default: conn.id === data })));
    invalidarStatusDeConexao();
    toast({ title: 'Conexão padrão atualizada' });
  };

  // TRA-005: excluir conexão NÃO pode esconder falha na Evolution GO nem
  // apagar o vínculo local quando o remoto falha. Ordem obrigatória: primeiro
  // a GO (o edge só apaga a linha em whatsapp_connections quando a GO
  // confirma), depois o vínculo local. Se o vínculo sobrar, o estado é
  // "exclusão pendente" — nunca sucesso mudo.
  const handleDelete = async (connection: WhatsAppConnection) => {
    let instanciaJaAusente = false;
    try {
      if (connection.instance_id) {
        // Sem `.catch(() => {})`: a rejeição da GO sobe e interrompe o fluxo,
        // para não remover o vínculo local com a instância remota ainda viva.
        await deleteInstance(connection.instance_id);
      }
    } catch (error: unknown) {
      // B2: a Edge devolve code INSTANCE_GONE quando a instância não existe
      // mais na Evolution — e ela MESMA já apagou a linha local. É estado a
      // reconciliar, não falha: segue para limpar o vínculo (idempotente).
      if ((error as { code?: string } | null)?.code !== 'INSTANCE_GONE') {
        log.error('Error deleting connection:', error);
        await fetchConnections();
        toast({
          title: 'Erro ao excluir',
          description: `${error instanceof Error ? error.message : 'Erro desconhecido'} — a conexão foi mantida.`,
          variant: 'destructive',
        });
        return;
      }
      instanciaJaAusente = true;
    }

    // Idempotente: cobre linha órfã (sem instance_id), o INSTANCE_GONE acima e o
    // caso de o edge não ter conseguido apagar o vínculo local após o OK da GO.
    const { error } = await supabase
      .from('whatsapp_connections')
      .delete()
      .eq('id', connection.id);

    if (error) {
      toast({
        title: 'Exclusão pendente',
        description: connection.instance_id
          ? 'A instância foi removida na Evolution GO, mas o vínculo local não pôde ser apagado. Tente excluir novamente.'
          : 'Não foi possível apagar o vínculo local. Tente novamente.',
        variant: 'destructive',
      });
      await fetchConnections();
      return;
    }

    setConnections((prev) => prev.filter((conn) => conn.id !== connection.id));
    invalidarStatusDeConexao();
    toast({
      title: 'Conexão removida',
      description: instanciaJaAusente
        ? 'A instância já não existia na Evolution GO; o vínculo local foi limpo.'
        : 'A conexão foi excluída com sucesso.',
    });
  };

  const closeQrDialog = () => {
    // Fechar invalida a geracao atual: respostas pendentes de connect/status
    // deixam de valer e o timer da propria geracao e encerrado (R2-API-039).
    qrSessionRef.current = { generation: qrSessionRef.current.generation + 1, connectionId: '' };
    if (pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); pollingIntervalRef.current = null; }
    setQrCodeDialog(INITIAL_QR_STATE);
  };

  return {
    connections,
    loading,
    isAddDialogOpen, setIsAddDialogOpen,
    qrCodeDialog,
    newConnection, setNewConnection,
    isCreating,
    syncingHistory, setSyncingHistory,
    evolutionLoading,
    handleAddConnection,
    handleShowQrCode,
    handleRefreshQrCode,
    handleCopyId,
    handleReconnect,
    handleDisconnect,
    handleSetDefault,
    handleDelete,
    closeQrDialog,
  };
}
