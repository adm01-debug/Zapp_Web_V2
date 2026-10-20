import { useState, useCallback, useRef, useEffect } from 'react';
import { playNotificationSound, showBrowserNotification, requestNotificationPermission } from '@/utils/notificationSound';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import type { ConversationContact, RealtimeMessage, NewMessageNotification } from '../chat/useRealtimeMessages';

export function useRealtimeNotifications() {
  const [newMessageNotification, setNewMessageNotification] = useState<NewMessageNotification | null>(null);
  const selectedContactIdRef = useRef<string | null>(null);
  const soundEnabledRef = useRef(true);
  const { settings: notifSettings, isQuietHours } = useNotificationSettings();

  // Sync soundEnabledRef with global notification settings
  useEffect(() => {
    soundEnabledRef.current = notifSettings.soundEnabled && !isQuietHours();
  }, [notifSettings.soundEnabled, isQuietHours]);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const notifyAboutIncomingMessage = useCallback(
    (contact: ConversationContact, message: RealtimeMessage) => {
      if (message.sender !== 'contact' || message.is_read || selectedContactIdRef.current === message.contact_id) {
        return;
      }

      const notificationsActive = notifSettings.soundEnabled || notifSettings.browserNotifications;
      if (!notificationsActive && isQuietHours()) return;

      if (soundEnabledRef.current) playNotificationSound('message');

      if (notifSettings.browserNotifications && !isQuietHours()) {
        showBrowserNotification(
          `Nova mensagem de ${contact.name}`,
          message.content,
          contact.avatar_url || undefined
        );
      }

      if (notificationsActive && !isQuietHours()) {
        setNewMessageNotification({
          id: message.id,
          contactId: contact.id,
          contactName: contact.name,
          contactAvatar: contact.avatar_url,
          message: message.content,
          timestamp: new Date(),
        });
      }
    },
    [notifSettings.soundEnabled, notifSettings.browserNotifications, isQuietHours]
  );

  const dismissNotification = useCallback(() => setNewMessageNotification(null), []);

  const setSelectedContact = useCallback((contactId: string | null) => {
    selectedContactIdRef.current = contactId;
  }, []);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    soundEnabledRef.current = enabled;
  }, []);

  return {
    newMessageNotification,
    notifyAboutIncomingMessage,
    dismissNotification,
    setSelectedContact,
    setSoundEnabled,
    notifSettings,
    isQuietHours,
  };
}
