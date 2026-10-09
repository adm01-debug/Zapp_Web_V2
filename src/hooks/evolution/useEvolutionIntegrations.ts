import { useCallback } from 'react';
import type { HttpMethod } from './useEvolutionApiCore';
import type { PrivacySettings } from '../integrations/evolutionApi.types';

// SL-075 E43: os métodos de integração/infra sem equivalente na GO foram removidos.
export function useEvolutionIntegrations(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<any>,
  withToast: (action: string, body: object | undefined, successMsg: string, errorMsg: string, method?: HttpMethod) => Promise<any>
) {
  // Profile
  const fetchProfile = useCallback((instanceName: string) => callApi('fetch-profile', { instanceName }, 'GET'), [callApi]);
  const updateProfileName = useCallback((instanceName: string, name: string) => withToast('update-profile-name', { instanceName, name }, 'Nome atualizado', 'Erro ao atualizar nome'), [withToast]);
  const updateProfileStatus = useCallback((instanceName: string, status: string) => withToast('update-profile-status', { instanceName, status }, 'Status atualizado', 'Erro ao atualizar status'), [withToast]);
  const updateProfilePicture = useCallback((instanceName: string, picture: string) => withToast('update-profile-picture', { instanceName, picture }, 'Foto atualizada', 'Erro ao atualizar foto'), [withToast]);
  const removeProfilePicture = useCallback((instanceName: string) => withToast('remove-profile-picture', { instanceName }, 'Foto removida', 'Erro ao remover foto', 'DELETE'), [withToast]);
  const fetchProfilePicture = useCallback((instanceName: string, number: string) => callApi('fetch-profile-picture', { instanceName, number }, 'GET'), [callApi]);
  const fetchBusinessProfile = useCallback((instanceName: string, number: string) => callApi('fetch-business-profile', { instanceName, number }), [callApi]);
  const updatePrivacySettings = useCallback((settings: PrivacySettings) => withToast('update-privacy', settings, 'Privacidade atualizada', 'Erro ao atualizar privacidade'), [withToast]);

  // Labels
  const findLabels = useCallback((instanceName: string) => callApi('find-labels', { instanceName }, 'GET'), [callApi]);
  const handleLabel = useCallback((instanceName: string, number: string, labelId: string, action: 'add' | 'remove') => callApi('handle-label', { instanceName, number, labelId, action }), [callApi]);

  // Chat management
  const findContacts = useCallback((instanceName: string, page?: number, offset?: number) => callApi('find-contacts', { instanceName, page, offset }, 'GET'), [callApi]);
  const checkWhatsAppNumbers = useCallback((instanceName: string, numbers: string[]) => callApi('check-numbers', { instanceName, numbers }), [callApi]);
  const getMediaBase64 = useCallback((instanceName: string, message: object, convertToMp4?: boolean) => callApi('get-media-base64', { instanceName, message, convertToMp4 }), [callApi]);

  // Block/Unblock
  const updateBlockStatus = useCallback((instanceName: string, number: string, status: 'block' | 'unblock') =>
    withToast('update-block-status', { instanceName, number, status }, status === 'block' ? 'Contato bloqueado' : 'Contato desbloqueado', 'Erro ao atualizar bloqueio'), [withToast]);

  return {
    // Profile
    fetchProfile, updateProfileName, updateProfileStatus, updateProfilePicture,
    removeProfilePicture, fetchProfilePicture, fetchBusinessProfile, updatePrivacySettings,
    // Labels
    findLabels, handleLabel,
    // Chat
    findContacts, checkWhatsAppNumbers, getMediaBase64,
    // Block/Unblock
    updateBlockStatus,
  };
}
