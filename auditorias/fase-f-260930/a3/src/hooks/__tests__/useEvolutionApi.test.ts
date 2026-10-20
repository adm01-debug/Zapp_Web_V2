import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn() },
  getLogger: () => ({ error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;
const mockToast = toast as unknown as { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

describe('useEvolutionApi - Exhaustive Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
  });

  // =============================================
  // INITIALIZATION & STATE
  // =============================================
  describe('Initialization', () => {
    it('starts with isLoading = false', () => {
      const { result } = renderHook(() => useEvolutionApi());
      expect(result.current.isLoading).toBe(false);
    });

    it('exposes all 60+ functions', () => {
      const { result } = renderHook(() => useEvolutionApi());
      const expectedFunctions = [
        'createInstance', 'createConnection', 'listInstances', 'connectInstance', 'getInstanceStatus',
        'getInstanceInfo', 'restartInstance', 'disconnectInstance', 'deleteInstance', 'setPresence',
        'setSettings', 'getSettings', 'setWebhook', 'getWebhook',
        'sendTextMessage', 'sendMediaMessage', 'sendAudioMessage', 'sendStickerMessage',
        'sendLocationMessage', 'sendContactMessage', 'sendReaction', 'sendPollMessage',
        'sendListMessage', 'sendButtonsMessage', 'sendStatusMessage', 'sendTemplateMessage',
        'markMessageAsRead', 'markMessageAsUnread', 'archiveChat', 'deleteMessage', 'updateMessage',
        'findChats', 'findMessages', 'findStatusMessages', 'findContacts',
        'checkWhatsAppNumbers', 'getMediaBase64', 'deleteMessageForEveryone', 'editMessage',
        'createGroup', 'listGroups', 'getGroupInfo', 'getGroupParticipants',
        'updateGroupName', 'updateGroupDescription', 'updateGroupParticipants',
        'updateGroupSetting', 'getGroupInviteCode', 'revokeGroupInviteCode',
        'getInviteInfo', 'acceptInvite', 'leaveGroup', 'updateGroupPicture', 'toggleEphemeral',
        'fetchProfile', 'updateProfileName', 'updateProfileStatus',
        'updateProfilePicture', 'removeProfilePicture', 'fetchProfilePicture',
        'fetchBusinessProfile', 'updatePrivacySettings',
        'findLabels', 'handleLabel',
        'setChatwoot', 'getChatwoot', 'deleteChatwoot',
        'setTypebot', 'getTypebot', 'deleteTypebot', 'getTypebotSessions', 'changeTypebotStatus', 'startTypebot',
        'setOpenAI', 'getOpenAI', 'deleteOpenAI',
        'setDify', 'getDify', 'deleteDify',
        'setFlowise', 'getFlowise', 'deleteFlowise',
        'setEvolutionBot', 'getEvolutionBot', 'deleteEvolutionBot',
        'setRabbitMQ', 'getRabbitMQ', 'setSQS', 'getSQS',
        'createTemplate', 'findTemplates', 'deleteTemplate',
      ];
      expectedFunctions.forEach(fn => {
        expect(typeof result.current[fn as keyof typeof result.current]).toBe('function');
      });
    });
  });

  // =============================================
  // ERROR HANDLING
  // =============================================
  describe('Error Handling', () => {
    it('callApi throws and logs on supabase error', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: { message: 'Network failure' } });
      const { result } = renderHook(() => useEvolutionApi());
      await expect(act(async () => {
        await result.current.sendTextMessage('wpp2', '5511999999999', 'hello');
      })).rejects.toThrow();
    });

    it('withToast shows error toast on failure', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: { message: 'API down' } });
      const { result } = renderHook(() => useEvolutionApi());
      try {
        await act(async () => {
          await result.current.createInstance({ instanceName: 'test' });
        });
      } catch { /* expected */ }
      expect(mockToast.error).toHaveBeenCalled();
    });

    it('withToast shows success toast on success', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.createInstance({ instanceName: 'test' });
      });
      expect(mockToast.success).toHaveBeenCalledWith('Instância criada com sucesso');
    });

    it('resets isLoading after error', async () => {
      mockInvoke.mockRejectedValue(new Error('fail'));
      const { result } = renderHook(() => useEvolutionApi());
      try {
        await act(async () => {
          await result.current.sendTextMessage('wpp2', '5511999', 'hi');
        });
      } catch { /* expected */ }
      expect(result.current.isLoading).toBe(false);
    });
  });

  // =============================================
  // 1. INSTANCE MANAGEMENT
  // All calls go through POST to the edge function (proxy pattern)
  // =============================================
  describe('Instance Management', () => {
    it('createInstance calls correct endpoint with params', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.createInstance({ instanceName: 'wpp2', qrcode: true });
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/create-instance', {
        method: 'POST',
        body: { instanceName: 'wpp2', qrcode: true },
      });
    });

    it('listInstances uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.listInstances('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/list-instances', {
        method: 'POST',
        body: { instanceName: 'wpp2' },
      });
    });

    it('listInstances without param sends empty body', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.listInstances();
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/list-instances', {
        method: 'POST',
        body: {},
      });
    });

    it('connectInstance sends correct body', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.connectInstance('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/connect', {
        method: 'POST',
        body: { instanceName: 'wpp2' },
      });
    });

    it('getInstanceStatus calls status endpoint', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.getInstanceStatus('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/status', {
        method: 'POST',
        body: { instanceName: 'wpp2' },
      });
    });

    it('getInstanceInfo uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.getInstanceInfo('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/instance-info', {
        method: 'POST',
        body: { instanceName: 'wpp2' },
      });
    });

    it('restartInstance shows success toast', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.restartInstance('wpp2');
      });
      expect(mockToast.success).toHaveBeenCalledWith('Instância reiniciada');
    });

    it('disconnectInstance shows success toast', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.disconnectInstance('wpp2');
      });
      expect(mockToast.success).toHaveBeenCalledWith('Instância desconectada');
    });

    it('deleteInstance uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.deleteInstance('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/delete-instance', {
        method: 'POST',
        body: { instanceName: 'wpp2' },
      });
    });

    it('createConnection calls create-connection without a toast (own toast in useConnectionsManager)', async () => {
      mockInvoke.mockResolvedValue({ data: { connection: { id: 'c1' }, evolution: {} }, error: null });
      const { result } = renderHook(() => useEvolutionApi());
      let response: unknown;
      await act(async () => {
        response = await result.current.createConnection({
          instanceName: 'wpp2', name: 'Vendas', phone_number: '5511999999999',
        });
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/create-connection', {
        method: 'POST',
        body: { instanceName: 'wpp2', name: 'Vendas', phone_number: '5511999999999' },
      });
      expect(response).toEqual({ connection: { id: 'c1' }, evolution: {} });
      expect(mockToast.success).not.toHaveBeenCalled();
    });

    it('setPresence sends presence type', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.setPresence('wpp2', 'composing');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/set-presence', {
        method: 'POST',
        body: { instanceName: 'wpp2', presence: 'composing' },
      });
    });
  });

  // =============================================
  // 2. SETTINGS
  // =============================================
  describe('Settings', () => {
    it('setSettings sends config and shows toast', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const config = { instanceName: 'wpp2', rejectCall: true, alwaysOnline: true };
      await act(async () => {
        await result.current.setSettings(config);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/set-settings', { method: 'POST', body: config });
      expect(mockToast.success).toHaveBeenCalledWith('Configurações salvas');
    });

    it('getSettings uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.getSettings('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/get-settings', { method: 'POST', body: { instanceName: 'wpp2' } });
    });
  });

  // =============================================
  // 3. WEBHOOK
  // =============================================
  describe('Webhook', () => {
    it('setWebhook sends config', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const config = { instanceName: 'wpp2', url: 'https://example.com/webhook', enabled: true, events: ['messages.upsert'] };
      await act(async () => {
        await result.current.setWebhook(config);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/set-webhook', { method: 'POST', body: config });
      expect(mockToast.success).toHaveBeenCalledWith('Webhook configurado');
    });

    it('getWebhook uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.getWebhook('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/get-webhook', { method: 'POST', body: { instanceName: 'wpp2' } });
    });
  });

  // =============================================
  // 4. MESSAGE SENDING
  // =============================================
  describe('Message Sending', () => {
    it('sendTextMessage with basic params', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.sendTextMessage('wpp2', '5511999999999', 'Hello!');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/send-text', {
        method: 'POST',
        body: { instanceName: 'wpp2', number: '5511999999999', text: 'Hello!' },
      });
    });

    it('sendTextMessage with quoted message', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const quoted = { key: { remoteJid: '55119@s.whatsapp.net', fromMe: false, id: 'ABC123' }, message: { conversation: 'original' } };
      await act(async () => {
        await result.current.sendTextMessage('wpp2', '5511999999999', 'Reply', { quoted, delay: 1000 });
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/send-text', {
        method: 'POST',
        body: { instanceName: 'wpp2', number: '5511999999999', text: 'Reply', quoted, delay: 1000 },
      });
    });

    it('sendMediaMessage sends all media params', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const params = { instanceName: 'wpp2', number: '5511999', mediaUrl: 'https://img.jpg', mediaType: 'image' as const, caption: 'foto' };
      await act(async () => {
        await result.current.sendMediaMessage(params);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/send-media', { method: 'POST', body: params });
    });

    it('sendAudioMessage with encoding option', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.sendAudioMessage('wpp2', '5511999', 'https://audio.ogg', { encoding: true });
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/send-audio', {
        method: 'POST',
        body: { instanceName: 'wpp2', number: '5511999', mediaUrl: 'https://audio.ogg', encoding: true },
      });
    });

    it('sendStickerMessage', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.sendStickerMessage('wpp2', '5511999', 'https://sticker.webp');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/send-sticker', {
        method: 'POST',
        body: { instanceName: 'wpp2', number: '5511999', sticker: 'https://sticker.webp' },
      });
    });

    it('sendLocationMessage', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const params = { instanceName: 'wpp2', number: '5511999', latitude: -23.55, longitude: -46.63, locationName: 'SP' };
      await act(async () => {
        await result.current.sendLocationMessage(params);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/send-location', { method: 'POST', body: params });
    });

    it('sendContactMessage with contact cards', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const contacts = [{ fullName: 'João', wuid: '5511999@s.whatsapp.net', phoneNumber: '+5511999999999' }];
      await act(async () => {
        await result.current.sendContactMessage('wpp2', '5511888', contacts);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/send-contact', {
        method: 'POST',
        body: { instanceName: 'wpp2', number: '5511888', contact: contacts },
      });
    });

    it('sendReaction with emoji', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const key = { remoteJid: '5511@s.whatsapp.net', fromMe: false, id: 'MSG123' };
      await act(async () => {
        await result.current.sendReaction('wpp2', key, '👍');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/send-reaction', {
        method: 'POST',
        body: { instanceName: 'wpp2', key, reaction: '👍' },
      });
    });

    it('sendPollMessage', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const params = { instanceName: 'wpp2', number: '5511999', name: 'Pesquisa', values: ['Sim', 'Não'], selectableCount: 1 };
      await act(async () => {
        await result.current.sendPollMessage(params);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/send-poll', { method: 'POST', body: params });
    });

    it('sendListMessage with sections', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const sections = [{ title: 'Opções', rows: [{ title: 'Item 1', rowId: '1' }] }];
      await act(async () => {
        await result.current.sendListMessage('wpp2', '5511999', 'Menu', 'Escolha', 'Ver opções', sections, 'Rodapé');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/send-list', {
        method: 'POST',
        body: { instanceName: 'wpp2', number: '5511999', title: 'Menu', description: 'Escolha', buttonText: 'Ver opções', sections, footer: 'Rodapé' },
      });
    });

    it('sendButtonsMessage with buttons', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const buttons = [{ type: 'reply' as const, displayText: 'OK', id: 'btn-1' }];
      await act(async () => {
        await result.current.sendButtonsMessage('wpp2', '5511999', 'Título', 'Descrição', buttons);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/send-buttons', {
        method: 'POST',
        body: { instanceName: 'wpp2', number: '5511999', title: 'Título', description: 'Descrição', buttons, footer: undefined },
      });
    });

    it('sendStatusMessage', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.sendStatusMessage('wpp2', { type: 'text', content: 'Status!' });
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/send-status', {
        method: 'POST',
        body: { instanceName: 'wpp2', type: 'text', content: 'Status!' },
      });
    });

    it('sendTemplateMessage', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const template = { name: 'hello_world', language: { code: 'pt_BR' } };
      await act(async () => {
        await result.current.sendTemplateMessage('wpp2', '5511999', template);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/send-template', {
        method: 'POST',
        body: { instanceName: 'wpp2', number: '5511999', template },
      });
    });
  });

  // =============================================
  // 5. MESSAGE MANAGEMENT
  // =============================================
  describe('Message Management', () => {
    it('markMessageAsRead', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const key = { remoteJid: '5511@s.whatsapp.net', fromMe: false, id: 'M1' };
      await act(async () => {
        await result.current.markMessageAsRead('wpp2', key);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/mark-read', { method: 'POST', body: { instanceName: 'wpp2', key } });
    });

    it('markMessageAsUnread', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.markMessageAsUnread('wpp2', { id: 'M1' });
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/mark-unread', { method: 'POST', body: { instanceName: 'wpp2', key: { id: 'M1' } } });
    });

    it('archiveChat', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.archiveChat('wpp2', { id: 'lastMsg' }, '5511@s.whatsapp.net', true);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/archive-chat', {
        method: 'POST',
        body: { instanceName: 'wpp2', lastMessage: { id: 'lastMsg' }, chat: '5511@s.whatsapp.net', archive: true },
      });
    });

    it('deleteMessage uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.deleteMessage('wpp2', 'MSG1', '5511@s.whatsapp.net', true);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/delete-message', {
        method: 'POST',
        body: { instanceName: 'wpp2', id: 'MSG1', remoteJid: '5511@s.whatsapp.net', fromMe: true },
      });
    });

    it('updateMessage', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.updateMessage('wpp2', '5511999', { id: 'M1' }, 'Updated text');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/update-message', {
        method: 'POST',
        body: { instanceName: 'wpp2', number: '5511999', key: { id: 'M1' }, text: 'Updated text' },
      });
    });
  });

  // =============================================
  // 6. CHAT MANAGEMENT
  // =============================================
  describe('Chat Management', () => {
    it('findChats uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.findChats('wpp2', 1, 20);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/find-chats', {
        method: 'POST',
        body: { instanceName: 'wpp2', page: 1, offset: 20 },
      });
    });

    it('findMessages with time range', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.findMessages('wpp2', '5511@s.whatsapp.net', 1, 50, 1000, 2000);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/find-messages', {
        method: 'POST',
        body: { instanceName: 'wpp2', remoteJid: '5511@s.whatsapp.net', page: 1, offset: 50, timestampStart: 1000, timestampEnd: 2000 },
      });
    });

    it('checkWhatsAppNumbers', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.checkWhatsAppNumbers('wpp2', ['5511999999999', '5511888888888']);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/check-numbers', {
        method: 'POST',
        body: { instanceName: 'wpp2', numbers: ['5511999999999', '5511888888888'] },
      });
    });

    it('getMediaBase64 with convertToMp4', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.getMediaBase64('wpp2', { key: 'msg1' }, true);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/get-media-base64', {
        method: 'POST',
        body: { instanceName: 'wpp2', message: { key: 'msg1' }, convertToMp4: true },
      });
    });
  });

  // =============================================
  // 7. GROUP MANAGEMENT
  // =============================================
  describe('Group Management', () => {
    it('createGroup with participants', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.createGroup('wpp2', 'Grupo Teste', 'Descrição', ['5511999@s.whatsapp.net']);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/create-group', {
        method: 'POST',
        body: { instanceName: 'wpp2', subject: 'Grupo Teste', description: 'Descrição', participants: ['5511999@s.whatsapp.net'] },
      });
      expect(mockToast.success).toHaveBeenCalledWith('Grupo criado');
    });

    it('updateGroupParticipants with add action', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.updateGroupParticipants('wpp2', 'group@g.us', 'add', ['5511@s.whatsapp.net']);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/update-participants', {
        method: 'POST',
        body: { instanceName: 'wpp2', groupJid: 'group@g.us', action: 'add', participants: ['5511@s.whatsapp.net'] },
      });
    });

    it('updateGroupSetting with announcement', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.updateGroupSetting('wpp2', 'group@g.us', 'announcement');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/update-group-setting', {
        method: 'POST',
        body: { instanceName: 'wpp2', groupJid: 'group@g.us', action: 'announcement' },
      });
    });

    it('leaveGroup uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.leaveGroup('wpp2', 'group@g.us');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/leave-group', {
        method: 'POST',
        body: { instanceName: 'wpp2', groupJid: 'group@g.us' },
      });
    });

    it('toggleEphemeral', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.toggleEphemeral('wpp2', 'group@g.us', 86400);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/toggle-ephemeral', {
        method: 'POST',
        body: { instanceName: 'wpp2', groupJid: 'group@g.us', expiration: 86400 },
      });
    });
  });

  // =============================================
  // 8. PROFILE MANAGEMENT
  // =============================================
  describe('Profile Management', () => {
    it('fetchProfile uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.fetchProfile('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/fetch-profile', { method: 'POST', body: { instanceName: 'wpp2' } });
    });

    it('updateProfileName shows toast', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.updateProfileName('wpp2', 'Novo Nome');
      });
      expect(mockToast.success).toHaveBeenCalledWith('Nome atualizado');
    });

    it('removeProfilePicture uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.removeProfilePicture('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/remove-profile-picture', {
        method: 'POST',
        body: { instanceName: 'wpp2' },
      });
    });

    it('fetchProfilePicture uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.fetchProfilePicture('wpp2', '5511999');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/fetch-profile-picture', {
        method: 'POST',
        body: { instanceName: 'wpp2', number: '5511999' },
      });
    });

    it('updatePrivacySettings', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const settings = { instanceName: 'wpp2', readreceipts: 'all', online: 'all' };
      await act(async () => {
        await result.current.updatePrivacySettings(settings);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/update-privacy', { method: 'POST', body: settings });
      expect(mockToast.success).toHaveBeenCalledWith('Privacidade atualizada');
    });
  });

  // =============================================
  // 9. LABELS
  // =============================================
  describe('Labels', () => {
    it('findLabels uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.findLabels('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/find-labels', { method: 'POST', body: { instanceName: 'wpp2' } });
    });

    it('handleLabel add action', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.handleLabel('wpp2', '5511999', 'label-1', 'add');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/handle-label', {
        method: 'POST',
        body: { instanceName: 'wpp2', number: '5511999', labelId: 'label-1', action: 'add' },
      });
    });
  });

  // =============================================
  // 10-15. INTEGRATIONS
  // =============================================
  describe('Integrations', () => {
    it('setChatwoot sends config', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const config = { instanceName: 'wpp2', accountId: '1', token: 'tk', url: 'https://cw.io' };
      await act(async () => {
        await result.current.setChatwoot(config);
      });
      expect(mockToast.success).toHaveBeenCalledWith('Chatwoot configurado');
    });

    it('deleteChatwoot uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.deleteChatwoot('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/delete-chatwoot', { method: 'POST', body: { instanceName: 'wpp2' } });
    });

    it('setTypebot sends full config', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      const config = { instanceName: 'wpp2', url: 'https://tb.io', typebot: 'flow1', enabled: true };
      await act(async () => {
        await result.current.setTypebot(config);
      });
      expect(mockToast.success).toHaveBeenCalledWith('Typebot configurado');
    });

    it('startTypebot sends session params', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.startTypebot('wpp2', '5511@s.whatsapp.net', 'https://tb.io', 'flow1', { name: 'João' });
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/start-typebot', {
        method: 'POST',
        body: { instanceName: 'wpp2', remoteJid: '5511@s.whatsapp.net', url: 'https://tb.io', typebot: 'flow1', variables: { name: 'João' } },
      });
    });

    it('changeTypebotStatus', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.changeTypebotStatus('wpp2', '5511@s.whatsapp.net', 'paused');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/typebot-change-status', {
        method: 'POST',
        body: { instanceName: 'wpp2', remoteJid: '5511@s.whatsapp.net', status: 'paused' },
      });
    });

    it('setOpenAI sends AI config', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.setOpenAI({ instanceName: 'wpp2', openAiApiKey: 'sk-xxx', model: 'gpt-4', enabled: true });
      });
      expect(mockToast.success).toHaveBeenCalledWith('OpenAI configurado');
    });

    it('deleteOpenAI uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.deleteOpenAI('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/delete-openai', { method: 'POST', body: { instanceName: 'wpp2' } });
    });

    it('setDify sends config', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.setDify({ instanceName: 'wpp2', apiUrl: 'https://dify.io', apiKey: 'dk-xxx' });
      });
      expect(mockToast.success).toHaveBeenCalledWith('Dify configurado');
    });

    it('setFlowise sends config', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.setFlowise({ instanceName: 'wpp2', apiUrl: 'https://fw.io', chatflowId: 'cf-1' });
      });
      expect(mockToast.success).toHaveBeenCalledWith('Flowise configurado');
    });

    it('setEvolutionBot sends config', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.setEvolutionBot({ instanceName: 'wpp2', apiUrl: 'https://eb.io' });
      });
      expect(mockToast.success).toHaveBeenCalledWith('Evolution Bot configurado');
    });

    it('deleteEvolutionBot uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.deleteEvolutionBot('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/delete-evolution-bot', { method: 'POST', body: { instanceName: 'wpp2' } });
    });
  });

  // =============================================
  // 16. RABBITMQ / SQS
  // =============================================
  describe('RabbitMQ / SQS', () => {
    it('setRabbitMQ with events', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.setRabbitMQ('wpp2', true, ['messages.upsert']);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/set-rabbitmq', {
        method: 'POST',
        body: { instanceName: 'wpp2', enabled: true, events: ['messages.upsert'] },
      });
    });

    it('setSQS', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.setSQS('wpp2', false);
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/set-sqs', {
        method: 'POST',
        body: { instanceName: 'wpp2', enabled: false, events: undefined },
      });
    });
  });

  // =============================================
  // 17. TEMPLATES
  // =============================================
  describe('Templates', () => {
    it('createTemplate', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.createTemplate('wpp2', { name: 'hello', language: 'pt_BR', category: 'utility', components: [] });
      });
      expect(mockToast.success).toHaveBeenCalledWith('Template criado');
    });

    it('findTemplates uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.findTemplates('wpp2');
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/find-templates', { method: 'POST', body: { instanceName: 'wpp2' } });
    });

    it('deleteTemplate uses POST (proxy pattern)', async () => {
      const { result } = renderHook(() => useEvolutionApi());
      await act(async () => {
        await result.current.deleteTemplate('wpp2', { name: 'hello' });
      });
      expect(mockInvoke).toHaveBeenCalledWith('evolution-api/delete-template', {
        method: 'POST',
        body: { instanceName: 'wpp2', name: 'hello' },
      });
    });
  });

  // =============================================
  // RETURN VALUE TESTS
  // =============================================
  describe('Return Values', () => {
    it('callApi returns data from supabase invoke', async () => {
      mockInvoke.mockResolvedValue({ data: { qrcode: 'base64data' }, error: null });
      const { result } = renderHook(() => useEvolutionApi());
      let response: unknown;
      await act(async () => {
        response = await result.current.connectInstance('wpp2');
      });
      expect(response).toEqual({ qrcode: 'base64data' });
    });

    it('withToast returns data on success', async () => {
      mockInvoke.mockResolvedValue({ data: { id: 'inst-1' }, error: null });
      const { result } = renderHook(() => useEvolutionApi());
      let response: unknown;
      await act(async () => {
        response = await result.current.createInstance({ instanceName: 'wpp2' });
      });
      expect(response).toEqual({ id: 'inst-1' });
    });
  });
});
