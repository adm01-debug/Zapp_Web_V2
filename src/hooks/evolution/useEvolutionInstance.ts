import { useCallback } from 'react';
import type { HttpMethod } from './useEvolutionApiCore';
import type { CreateInstanceParams, SettingsConfig, WebhookConfig } from '../integrations/evolutionApi.types';

export function useEvolutionInstance(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<any>,
  withToast: (action: string, body: object | undefined, successMsg: string, errorMsg: string, method?: HttpMethod) => Promise<any>
) {
  const createInstance = useCallback((params: CreateInstanceParams) =>
    withToast('create-instance', params, 'Instância criada com sucesso', 'Erro ao criar instância'), [withToast]);

  const listInstances = useCallback((instanceName?: string) =>
    callApi('list-instances', instanceName ? { instanceName } : undefined, 'GET'), [callApi]);

  const connectInstance = useCallback((instanceName: string) =>
    callApi('connect', { instanceName }), [callApi]);

  const getInstanceStatus = useCallback((instanceName: string) =>
    callApi('status', { instanceName }), [callApi]);

  const getInstanceInfo = useCallback((instanceName: string) =>
    callApi('instance-info', { instanceName }, 'GET'), [callApi]);

  const restartInstance = useCallback((instanceName: string) =>
    withToast('restart-instance', { instanceName }, 'Instância reiniciada', 'Erro ao reiniciar'), [withToast]);

  const disconnectInstance = useCallback((instanceName: string) =>
    withToast('disconnect', { instanceName }, 'Instância desconectada', 'Erro ao desconectar'), [withToast]);

  const deleteInstance = useCallback((instanceName: string) =>
    withToast('delete-instance', { instanceName }, 'Instância excluída', 'Erro ao excluir instância', 'DELETE'), [withToast]);

  const setPresence = useCallback((instanceName: string, presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused') =>
    callApi('set-presence', { instanceName, presence }), [callApi]);

  const setSettings = useCallback((config: SettingsConfig) =>
    withToast('set-settings', config, 'Configurações salvas', 'Erro ao salvar configurações'), [withToast]);

  const getSettings = useCallback((instanceName: string) =>
    callApi('get-settings', { instanceName }, 'GET'), [callApi]);

  const setWebhook = useCallback((config: WebhookConfig) =>
    withToast('set-webhook', config, 'Webhook configurado', 'Erro ao configurar webhook'), [withToast]);

  const getWebhook = useCallback((instanceName: string) =>
    callApi('get-webhook', { instanceName }, 'GET'), [callApi]);

  return {
    createInstance, listInstances, connectInstance, getInstanceStatus, getInstanceInfo,
    restartInstance, disconnectInstance, deleteInstance, setPresence,
    setSettings, getSettings, setWebhook, getWebhook,
  };
}
