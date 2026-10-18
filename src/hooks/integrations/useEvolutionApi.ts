import { useCallback } from 'react';
import { useEvolutionApiCore } from '../evolution/useEvolutionApiCore';
import { useEvolutionInstance } from '../evolution/useEvolutionInstance';
import { useEvolutionMessaging } from '../evolution/useEvolutionMessaging';
import { useEvolutionGroups } from '../evolution/useEvolutionGroups';
import type { PrivacySettings } from './evolutionApi.types';

export type {
  SendMessageParams, ContactCard, PollParams, ListSection, ButtonItem,
  WebhookConfig, SettingsConfig, PrivacySettings, CreateInstanceParams,
  CreateConnectionParams, CreateConnectionResult,
} from './evolutionApi.types';

/**
 * Unified Evolution API hook — thin orchestrator that composes domain-specific sub-hooks.
 * Each sub-hook is independently importable for tree-shaking.
 *
 * SL-075 E43: as ações de perfil, etiquetas, contatos e bloqueio (que a Evolution GO
 * suporta) foram absorvidas aqui. O antigo hook de integrações — que expunha
 * integrações sem equivalente na GO (Chatwoot, Typebot, OpenAI, Dify, Flowise,
 * RabbitMQ, templates…) — foi deletado, e o que restava dele virou este bloco.
 */
export function useEvolutionApi() {
  const { isLoading, callApi, withToast } = useEvolutionApiCore();
  const instance = useEvolutionInstance(callApi, withToast);
  const messaging = useEvolutionMessaging(callApi, withToast);
  const groups = useEvolutionGroups(callApi, withToast);

  // Perfil
  const fetchProfile = useCallback((instanceName: string) => callApi('fetch-profile', { instanceName }, 'GET'), [callApi]);
  const updateProfileName = useCallback((instanceName: string, name: string) => withToast('update-profile-name', { instanceName, name }, 'Nome atualizado', 'Erro ao atualizar nome'), [withToast]);
  const updateProfileStatus = useCallback((instanceName: string, status: string) => withToast('update-profile-status', { instanceName, status }, 'Status atualizado', 'Erro ao atualizar status'), [withToast]);
  const updateProfilePicture = useCallback((instanceName: string, picture: string) => withToast('update-profile-picture', { instanceName, picture }, 'Foto atualizada', 'Erro ao atualizar foto'), [withToast]);
  const removeProfilePicture = useCallback((instanceName: string) => withToast('remove-profile-picture', { instanceName }, 'Foto removida', 'Erro ao remover foto', 'DELETE'), [withToast]);
  const fetchProfilePicture = useCallback((instanceName: string, number: string) => callApi('fetch-profile-picture', { instanceName, number }, 'GET'), [callApi]);
  const fetchBusinessProfile = useCallback((instanceName: string, number: string) => callApi('fetch-business-profile', { instanceName, number }), [callApi]);
  const updatePrivacySettings = useCallback((settings: PrivacySettings) => withToast('update-privacy', settings, 'Privacidade atualizada', 'Erro ao atualizar privacidade'), [withToast]);

  // Etiquetas
  const findLabels = useCallback((instanceName: string) => callApi('find-labels', { instanceName }, 'GET'), [callApi]);
  const handleLabel = useCallback((instanceName: string, number: string, labelId: string, action: 'add' | 'remove') => callApi('handle-label', { instanceName, number, labelId, action }), [callApi]);

  // Contatos
  const findContacts = useCallback((instanceName: string, page?: number, offset?: number) => callApi('find-contacts', { instanceName, page, offset }, 'GET'), [callApi]);
  const checkWhatsAppNumbers = useCallback((instanceName: string, numbers: string[]) => callApi('check-numbers', { instanceName, numbers }), [callApi]);
  const getMediaBase64 = useCallback((instanceName: string, message: object, convertToMp4?: boolean) => callApi('get-media-base64', { instanceName, message, convertToMp4 }), [callApi]);

  // Bloquear / desbloquear
  const updateBlockStatus = useCallback((instanceName: string, number: string, status: 'block' | 'unblock') =>
    withToast('update-block-status', { instanceName, number, status }, status === 'block' ? 'Contato bloqueado' : 'Contato desbloqueado', 'Erro ao atualizar bloqueio'), [withToast]);

  return {
    isLoading,
    ...instance,
    ...messaging,
    ...groups,
    // Perfil
    fetchProfile, updateProfileName, updateProfileStatus, updateProfilePicture,
    removeProfilePicture, fetchProfilePicture, fetchBusinessProfile, updatePrivacySettings,
    // Etiquetas
    findLabels, handleLabel,
    // Contatos
    findContacts, checkWhatsAppNumbers, getMediaBase64,
    // Bloquear / desbloquear
    updateBlockStatus,
  };
}
