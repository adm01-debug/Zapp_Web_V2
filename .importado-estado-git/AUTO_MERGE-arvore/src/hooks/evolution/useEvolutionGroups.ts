import { useCallback } from 'react';
import type { HttpMethod } from './useEvolutionApiCore';

export function useEvolutionGroups(
  callApi: (action: string, body?: object, method?: HttpMethod) => Promise<any>,
  withToast: (action: string, body: object | undefined, successMsg: string, errorMsg: string, method?: HttpMethod) => Promise<any>
) {
  const createGroup = useCallback((instanceName: string, subject: string, description: string, participants: string[]) =>
    withToast('create-group', { instanceName, subject, description, participants }, 'Grupo criado', 'Erro ao criar grupo'), [withToast]);

  const listGroups = useCallback((instanceName: string) =>
    callApi('list-groups', { instanceName }, 'GET'), [callApi]);

  const getGroupInfo = useCallback((instanceName: string, groupJid: string) =>
    callApi('group-info', { instanceName, groupJid }, 'GET'), [callApi]);

  const getGroupParticipants = useCallback((instanceName: string, groupJid: string) =>
    callApi('group-participants', { instanceName, groupJid }, 'GET'), [callApi]);

  const updateGroupName = useCallback((instanceName: string, groupJid: string, subject: string) =>
    withToast('update-group-name', { instanceName, groupJid, subject }, 'Nome do grupo atualizado', 'Erro ao atualizar nome'), [withToast]);

  const updateGroupDescription = useCallback((instanceName: string, groupJid: string, description: string) =>
    withToast('update-group-description', { instanceName, groupJid, description }, 'Descrição atualizada', 'Erro ao atualizar descrição'), [withToast]);

  const updateGroupParticipants = useCallback((instanceName: string, groupJid: string, action: 'add' | 'remove' | 'promote' | 'demote', participants: string[]) =>
    withToast('update-participants', { instanceName, groupJid, action, participants }, 'Participantes atualizados', 'Erro ao atualizar participantes'), [withToast]);

  const updateGroupSetting = useCallback((instanceName: string, groupJid: string, action: 'announcement' | 'not_announcement' | 'locked' | 'unlocked') =>
    withToast('update-group-setting', { instanceName, groupJid, action }, 'Configuração atualizada', 'Erro ao atualizar configuração'), [withToast]);

  const getGroupInviteCode = useCallback((instanceName: string, groupJid: string) =>
    callApi('group-invite-code', { instanceName, groupJid }, 'GET'), [callApi]);

  const revokeGroupInviteCode = useCallback((instanceName: string, groupJid: string) =>
    withToast('revoke-invite-code', { instanceName, groupJid }, 'Link revogado', 'Erro ao revogar link'), [withToast]);

  const getInviteInfo = useCallback((instanceName: string, inviteCode: string) =>
    callApi('invite-info', { instanceName, inviteCode }, 'GET'), [callApi]);

  const acceptInvite = useCallback((instanceName: string, inviteCode: string) =>
    withToast('accept-invite', { instanceName, inviteCode }, 'Entrou no grupo', 'Erro ao entrar no grupo'), [withToast]);

  const leaveGroup = useCallback((instanceName: string, groupJid: string) =>
    withToast('leave-group', { instanceName, groupJid }, 'Saiu do grupo', 'Erro ao sair do grupo', 'DELETE'), [withToast]);

  const updateGroupPicture = useCallback((instanceName: string, groupJid: string, image: string) =>
    withToast('update-group-picture', { instanceName, groupJid, image }, 'Foto atualizada', 'Erro ao atualizar foto'), [withToast]);

  const toggleEphemeral = useCallback((instanceName: string, groupJid: string, expiration: number) =>
    callApi('toggle-ephemeral', { instanceName, groupJid, expiration }), [callApi]);

  return {
    createGroup, listGroups, getGroupInfo, getGroupParticipants,
    updateGroupName, updateGroupDescription, updateGroupParticipants,
    updateGroupSetting, getGroupInviteCode, revokeGroupInviteCode,
    getInviteInfo, acceptInvite, leaveGroup, updateGroupPicture, toggleEphemeral,
  };
}
