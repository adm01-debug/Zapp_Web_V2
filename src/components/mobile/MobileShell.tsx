import { useState, useCallback, useMemo } from 'react';
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { MobileDrawerMenu } from '@/components/mobile/MobileDrawerMenu';
import { NotificationsPanel } from '@/components/mobile/NotificationsPanel';
import { MobileFAB } from '@/components/mobile/MobileFAB';
import { BottomNavigation } from '@/components/ui/mobile-components';
import { useKeyboardHeight } from '@/hooks/ui/useKeyboardHeight';
import { useNotifications } from '@/hooks/system/useNotifications';
import { MessageSquare, Users, MessagesSquare, Mail, Menu } from 'lucide-react';

interface MobileShellProps {
  currentView: string;
  setCurrentView: (viewId: string) => void;
  profile: { name?: string | null; avatar_url?: string | null } | null;
  userEmail: string;
  signOut: () => void;
  unreadNotifications: number;
}

const mobileNavItems = [
  { id: 'inbox', icon: <MessageSquare className="w-5 h-5" />, label: 'Chat' },
  { id: 'team-chat', icon: <MessagesSquare className="w-5 h-5" />, label: 'Equipe' },
  { id: 'email-chat', icon: <Mail className="w-5 h-5" />, label: 'Email' },
  { id: 'contacts', icon: <Users className="w-5 h-5" />, label: 'Contatos' },
  { id: 'more', icon: <Menu className="w-5 h-5" />, label: 'Mais' },
];

export function MobileShell({
  currentView,
  setCurrentView,
  profile,
  userEmail,
  signOut,
  unreadNotifications,
}: MobileShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // Central de notificações real (mesmo hook do popover da sidebar): a lista e o
  // contador do sino saem daqui, não de um estado local vazio.
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const { isKeyboardOpen } = useKeyboardHeight();

  // R2-PLAT-010: o botão Buscar não tinha consumidor (o estado mobileSearchOpen
  // nunca era lido). Aqui ele passa a despachar o comando compartilhado que abre
  // a paleta de busca, o MESMO usado pela Sidebar no desktop.
  const handleSearchOpen = useCallback(() => {
    document.dispatchEvent(new CustomEvent('open-global-search'));
  }, []);

  const handleMarkAllNotificationsRead = useCallback(() => {
    void markAllAsRead();
  }, [markAllAsRead]);

  const navItemsWithBadge = useMemo(() => mobileNavItems.map((item) =>
    item.id === 'inbox' && unreadNotifications > 0
      ? { ...item, badge: unreadNotifications }
      : item
  ), [unreadNotifications]);

  return (
    <>
      <MobileHeader
        onMenuOpen={() => setMobileMenuOpen(true)}
        onSearchOpen={handleSearchOpen}
        onNotificationsOpen={() => setNotificationsOpen(true)}
        currentView={currentView}
        agentName={profile?.name || userEmail || 'Usuário'}
        agentAvatar={profile?.avatar_url || undefined}
        agentStatus="online"
        unreadCount={unreadCount}
      />

      <NotificationsPanel
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onMarkRead={(id) => void markAsRead(id)}
      />

      <MobileDrawerMenu
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        currentView={currentView}
        onViewChange={setCurrentView}
        agentName={profile?.name || userEmail || 'Usuário'}
        agentAvatar={profile?.avatar_url || undefined}
        agentStatus="online"
        onLogout={signOut}
      />

      {/* Hide FAB when keyboard is open, on team-chat (overlaps the input) and on contacts (has its own FAB) */}
      {!isKeyboardOpen && currentView !== 'team-chat' && currentView !== 'contacts' && (
        <MobileFAB
          onNewConversation={() => setCurrentView('inbox')}
          onNewContact={() => setCurrentView('contacts')}
          onNewCampaign={() => setCurrentView('campaigns')}
        />
      )}

      {/* Hide bottom nav when keyboard is open */}
      {!isKeyboardOpen && (
        <BottomNavigation
          items={navItemsWithBadge}
          activeId={currentView}
          onChange={(id) => {
            if (navigator.vibrate) navigator.vibrate(10);
            if (id === 'more') setMobileMenuOpen(true);
            else setCurrentView(id);
          }}
        />
      )}
    </>
  );
}
