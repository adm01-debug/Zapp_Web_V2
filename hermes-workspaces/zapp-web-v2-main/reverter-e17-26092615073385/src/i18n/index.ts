import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Translations
const resources = {
  pt: {
    translation: {
      // Navigation
      'nav.dashboard': 'Dashboard',
      'nav.inbox': 'Caixa de Entrada',
      'nav.contacts': 'Contatos',
      'nav.queues': 'Filas',
      'nav.agents': 'Agentes',
      'nav.settings': 'Configurações',
      'nav.reports': 'Relatórios',
      'nav.security': 'Segurança',
      
      // Common actions
      'actions.save': 'Salvar',
      'actions.cancel': 'Cancelar',
      'actions.delete': 'Excluir',
      'actions.edit': 'Editar',
      'actions.create': 'Criar',
      'actions.search': 'Buscar',
      'actions.filter': 'Filtrar',
      'actions.export': 'Exportar',
      'actions.import': 'Importar',
      'actions.refresh': 'Atualizar',
      'actions.close': 'Fechar',
      'actions.confirm': 'Confirmar',
      'actions.back': 'Voltar',
      'actions.next': 'Próximo',
      'actions.previous': 'Anterior',
      'actions.send': 'Enviar',
      'actions.reply': 'Responder',
      'actions.forward': 'Encaminhar',
      'actions.archive': 'Arquivar',
      'actions.transfer': 'Transferir',
      
      // Status
      'status.online': 'Online',
      'status.offline': 'Offline',
      'status.away': 'Ausente',
      'status.busy': 'Ocupado',
      'status.pending': 'Pendente',
      'status.resolved': 'Resolvido',
      'status.active': 'Ativo',
      'status.inactive': 'Inativo',
      
      // Dashboard
      'dashboard.title': 'Dashboard',
      'dashboard.totalMessages': 'Total de Mensagens',
      'dashboard.activeConversations': 'Conversas Ativas',
      'dashboard.resolvedToday': 'Resolvidas Hoje',
      'dashboard.avgResponseTime': 'Tempo Médio de Resposta',
      'dashboard.satisfaction': 'Satisfação',
      'dashboard.performance': 'Desempenho',
      
      // Inbox
      'inbox.title': 'Caixa de Entrada',
      'inbox.noMessages': 'Nenhuma mensagem',
      'inbox.newMessage': 'Nova mensagem',
      'inbox.typeMessage': 'Digite sua mensagem...',
      'inbox.unread': 'Não lidas',
      'inbox.all': 'Todas',
      'inbox.assigned': 'Atribuídas',
      'inbox.unassigned': 'Não Atribuídas',
      
      // Contacts
      'contacts.title': 'Contatos',
      'contacts.addContact': 'Adicionar Contato',
      'contacts.name': 'Nome',
      'contacts.phone': 'Telefone',
      'contacts.email': 'Email',
      'contacts.company': 'Empresa',
      'contacts.tags': 'Tags',
      'contacts.notes': 'Notas',
      
      // Settings
      'settings.title': 'Configurações',
      'settings.general': 'Geral',
      'settings.notifications': 'Notificações',
      'settings.appearance': 'Aparência',
      'settings.language': 'Idioma',
      'settings.theme': 'Tema',
      'settings.sounds': 'Sons',
      
      // Auth
      'auth.login': 'Entrar',
      'auth.logout': 'Sair',
      'auth.register': 'Cadastrar',
      'auth.email': 'Email',
      'auth.password': 'Senha',
      'auth.forgotPassword': 'Esqueceu a senha?',
      'auth.rememberMe': 'Lembrar-me',
      
      // Errors
      'errors.generic': 'Ocorreu um erro',
      'errors.notFound': 'Não encontrado',
      'errors.unauthorized': 'Não autorizado',
      'errors.serverError': 'Erro no servidor',
      'errors.networkError': 'Erro de conexão',
      
      // Success
      'success.saved': 'Salvo com sucesso',
      'success.deleted': 'Excluído com sucesso',
      'success.created': 'Criado com sucesso',
      'success.updated': 'Atualizado com sucesso',
      
      // Time
      'time.now': 'Agora',
      'time.today': 'Hoje',
      'time.yesterday': 'Ontem',
      'time.thisWeek': 'Esta semana',
      'time.thisMonth': 'Este mês',
      'time.minutes': 'minutos',
      'time.hours': 'horas',
      'time.days': 'dias',
      
      // Gamification
      'gamification.level': 'Nível',
      'gamification.xp': 'XP',
      'gamification.achievements': 'Conquistas',
      'gamification.streak': 'Sequência',
      'gamification.leaderboard': 'Ranking',
    },
  },
  en: {
    translation: {
      // Navigation
      'nav.dashboard': 'Dashboard',
      'nav.inbox': 'Inbox',
      'nav.contacts': 'Contacts',
      'nav.queues': 'Queues',
      'nav.agents': 'Agents',
      'nav.settings': 'Settings',
      'nav.reports': 'Reports',
      'nav.security': 'Security',
      
      // Common actions
      'actions.save': 'Save',
      'actions.cancel': 'Cancel',
      'actions.delete': 'Delete',
      'actions.edit': 'Edit',
      'actions.create': 'Create',
      'actions.search': 'Search',
      'actions.filter': 'Filter',
      'actions.export': 'Export',
      'actions.import': 'Import',
      'actions.refresh': 'Refresh',
      'actions.close': 'Close',
      'actions.confirm': 'Confirm',
      'actions.back': 'Back',
      'actions.next': 'Next',
      'actions.previous': 'Previous',
      'actions.send': 'Send',
      'actions.reply': 'Reply',
      'actions.forward': 'Forward',
      'actions.archive': 'Archive',
      'actions.transfer': 'Transfer',
      
      // Status
      'status.online': 'Online',
      'status.offline': 'Offline',
      'status.away': 'Away',
      'status.busy': 'Busy',
      'status.pending': 'Pending',
      'status.resolved': 'Resolved',
      'status.active': 'Active',
      'status.inactive': 'Inactive',
      
      // Dashboard
      'dashboard.title': 'Dashboard',
      'dashboard.totalMessages': 'Total Messages',
      'dashboard.activeConversations': 'Active Conversations',
      'dashboard.resolvedToday': 'Resolved Today',
      'dashboard.avgResponseTime': 'Avg Response Time',
      'dashboard.satisfaction': 'Satisfaction',
      'dashboard.performance': 'Performance',
      
      // Inbox
      'inbox.title': 'Inbox',
      'inbox.noMessages': 'No messages',
      'inbox.newMessage': 'New message',
      'inbox.typeMessage': 'Type your message...',
      'inbox.unread': 'Unread',
      'inbox.all': 'All',
      'inbox.assigned': 'Assigned',
      'inbox.unassigned': 'Unassigned',
      
      // Contacts
      'contacts.title': 'Contacts',
      'contacts.addContact': 'Add Contact',
      'contacts.name': 'Name',
      'contacts.phone': 'Phone',
      'contacts.email': 'Email',
      'contacts.company': 'Company',
      'contacts.tags': 'Tags',
      'contacts.notes': 'Notes',
      
      // Settings
      'settings.title': 'Settings',
      'settings.general': 'General',
      'settings.notifications': 'Notifications',
      'settings.appearance': 'Appearance',
      'settings.language': 'Language',
      'settings.theme': 'Theme',
      'settings.sounds': 'Sounds',
      
      // Auth
      'auth.login': 'Login',
      'auth.logout': 'Logout',
      'auth.register': 'Register',
      'auth.email': 'Email',
      'auth.password': 'Password',
      'auth.forgotPassword': 'Forgot password?',
      'auth.rememberMe': 'Remember me',
      
      // Errors
      'errors.generic': 'An error occurred',
      'errors.notFound': 'Not found',
      'errors.unauthorized': 'Unauthorized',
      'errors.serverError': 'Server error',
      'errors.networkError': 'Network error',
      
      // Success
      'success.saved': 'Saved successfully',
      'success.deleted': 'Deleted successfully',
      'success.created': 'Created successfully',
      'success.updated': 'Updated successfully',
      
      // Time
      'time.now': 'Now',
      'time.today': 'Today',
      'time.yesterday': 'Yesterday',
      'time.thisWeek': 'This week',
      'time.thisMonth': 'This month',
      'time.minutes': 'minutes',
      'time.hours': 'hours',
      'time.days': 'days',
      
      // Gamification
      'gamification.level': 'Level',
      'gamification.xp': 'XP',
      'gamification.achievements': 'Achievements',
      'gamification.streak': 'Streak',
      'gamification.leaderboard': 'Leaderboard',
    },
  },
  es: {
    translation: {
      // Navigation
      'nav.dashboard': 'Panel',
      'nav.inbox': 'Bandeja de Entrada',
      'nav.contacts': 'Contactos',
      'nav.queues': 'Colas',
      'nav.agents': 'Agentes',
      'nav.settings': 'Configuración',
      'nav.reports': 'Informes',
      'nav.security': 'Seguridad',
      
      // Common actions
      'actions.save': 'Guardar',
      'actions.cancel': 'Cancelar',
      'actions.delete': 'Eliminar',
      'actions.edit': 'Editar',
      'actions.create': 'Crear',
      'actions.search': 'Buscar',
      'actions.filter': 'Filtrar',
      'actions.export': 'Exportar',
      'actions.import': 'Importar',
      'actions.refresh': 'Actualizar',
      'actions.close': 'Cerrar',
      'actions.confirm': 'Confirmar',
      'actions.back': 'Volver',
      'actions.next': 'Siguiente',
      'actions.previous': 'Anterior',
      'actions.send': 'Enviar',
      'actions.reply': 'Responder',
      'actions.forward': 'Reenviar',
      'actions.archive': 'Archivar',
      'actions.transfer': 'Transferir',
      
      // Status
      'status.online': 'En línea',
      'status.offline': 'Desconectado',
      'status.away': 'Ausente',
      'status.busy': 'Ocupado',
      'status.pending': 'Pendiente',
      'status.resolved': 'Resuelto',
      'status.active': 'Activo',
      'status.inactive': 'Inactivo',
    },
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('language') || 'pt',
    fallbackLng: 'pt',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

// Helper hook for language switching
export const useLanguage = () => {
  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  };

  return {
    currentLanguage: i18n.language,
    changeLanguage,
    languages: [
      { code: 'pt', name: 'Português', flag: '🇧🇷' },
      { code: 'en', name: 'English', flag: '🇺🇸' },
      { code: 'es', name: 'Español', flag: '🇪🇸' },
    ],
  };
};
