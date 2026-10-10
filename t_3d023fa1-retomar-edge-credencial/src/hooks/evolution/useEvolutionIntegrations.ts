import { useCallback } from 'react';
import type { HttpMethod } from './useEvolutionApiCore';
import type {
  TypebotConfig, OpenAIConfig, DifyConfig, FlowiseConfig,
  EvolutionBotConfig, ChatwootConfig, PrivacySettings,
} from '../integrations/evolutionApi.types';

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
  const findChats = useCallback((instanceName: string, page?: number, offset?: number) => callApi('find-chats', { instanceName, page, offset }, 'GET'), [callApi]);
  const findMessages = useCallback((instanceName: string, remoteJid: string, page?: number, offset?: number, timestampStart?: number, timestampEnd?: number) => callApi('find-messages', { instanceName, remoteJid, page, offset, timestampStart, timestampEnd }, 'GET'), [callApi]);
  const findStatusMessages = useCallback((instanceName: string) => callApi('find-status-messages', { instanceName }, 'GET'), [callApi]);
  const findContacts = useCallback((instanceName: string, page?: number, offset?: number) => callApi('find-contacts', { instanceName, page, offset }, 'GET'), [callApi]);
  const checkWhatsAppNumbers = useCallback((instanceName: string, numbers: string[]) => callApi('check-numbers', { instanceName, numbers }), [callApi]);
  const getMediaBase64 = useCallback((instanceName: string, message: object, convertToMp4?: boolean) => callApi('get-media-base64', { instanceName, message, convertToMp4 }), [callApi]);

  // Chatwoot
  const setChatwoot = useCallback((config: ChatwootConfig) => withToast('set-chatwoot', config, 'Chatwoot configurado', 'Erro ao configurar Chatwoot'), [withToast]);
  const getChatwoot = useCallback((instanceName: string) => callApi('get-chatwoot', { instanceName }, 'GET'), [callApi]);
  const deleteChatwoot = useCallback((instanceName: string) => withToast('delete-chatwoot', { instanceName }, 'Chatwoot removido', 'Erro ao remover Chatwoot', 'DELETE'), [withToast]);

  // Typebot
  const setTypebot = useCallback((config: TypebotConfig) => withToast('set-typebot', config, 'Typebot configurado', 'Erro ao configurar Typebot'), [withToast]);
  const getTypebot = useCallback((instanceName: string) => callApi('get-typebot', { instanceName }, 'GET'), [callApi]);
  const deleteTypebot = useCallback((instanceName: string) => withToast('delete-typebot', { instanceName }, 'Typebot removido', 'Erro ao remover Typebot', 'DELETE'), [withToast]);
  const getTypebotSessions = useCallback((instanceName: string, typebotId?: string) => callApi('typebot-sessions', { instanceName, typebotId }, 'GET'), [callApi]);
  const changeTypebotStatus = useCallback((instanceName: string, remoteJid: string, status: 'opened' | 'paused' | 'closed') => callApi('typebot-change-status', { instanceName, remoteJid, status }), [callApi]);
  const startTypebot = useCallback((instanceName: string, remoteJid: string, url: string, typebot: string, variables?: object) => callApi('start-typebot', { instanceName, remoteJid, url, typebot, variables }), [callApi]);

  // OpenAI
  const setOpenAI = useCallback((config: OpenAIConfig) => withToast('set-openai', config, 'OpenAI configurado', 'Erro ao configurar OpenAI'), [withToast]);
  const getOpenAI = useCallback((instanceName: string) => callApi('get-openai', { instanceName }, 'GET'), [callApi]);
  const deleteOpenAI = useCallback((instanceName: string) => withToast('delete-openai', { instanceName }, 'OpenAI removido', 'Erro ao remover OpenAI', 'DELETE'), [withToast]);

  // Dify
  const setDify = useCallback((config: DifyConfig) => withToast('set-dify', config, 'Dify configurado', 'Erro ao configurar Dify'), [withToast]);
  const getDify = useCallback((instanceName: string) => callApi('get-dify', { instanceName }, 'GET'), [callApi]);
  const deleteDify = useCallback((instanceName: string) => withToast('delete-dify', { instanceName }, 'Dify removido', 'Erro ao remover Dify', 'DELETE'), [withToast]);

  // Flowise
  const setFlowise = useCallback((config: FlowiseConfig) => withToast('set-flowise', config, 'Flowise configurado', 'Erro ao configurar Flowise'), [withToast]);
  const getFlowise = useCallback((instanceName: string) => callApi('get-flowise', { instanceName }, 'GET'), [callApi]);
  const deleteFlowise = useCallback((instanceName: string) => withToast('delete-flowise', { instanceName }, 'Flowise removido', 'Erro ao remover Flowise', 'DELETE'), [withToast]);

  // Evolution Bot
  const setEvolutionBot = useCallback((config: EvolutionBotConfig) => withToast('set-evolution-bot', config, 'Evolution Bot configurado', 'Erro ao configurar Evolution Bot'), [withToast]);
  const getEvolutionBot = useCallback((instanceName: string) => callApi('get-evolution-bot', { instanceName }, 'GET'), [callApi]);
  const deleteEvolutionBot = useCallback((instanceName: string) => withToast('delete-evolution-bot', { instanceName }, 'Evolution Bot removido', 'Erro ao remover Evolution Bot', 'DELETE'), [withToast]);

  // RabbitMQ / SQS
  const setRabbitMQ = useCallback((instanceName: string, enabled: boolean, events?: string[]) => callApi('set-rabbitmq', { instanceName, enabled, events }), [callApi]);
  const getRabbitMQ = useCallback((instanceName: string) => callApi('get-rabbitmq', { instanceName }, 'GET'), [callApi]);
  const setSQS = useCallback((instanceName: string, enabled: boolean, events?: string[]) => callApi('set-sqs', { instanceName, enabled, events }), [callApi]);
  const getSQS = useCallback((instanceName: string) => callApi('get-sqs', { instanceName }, 'GET'), [callApi]);

  // Templates
  const createTemplate = useCallback((instanceName: string, templateData: object) => withToast('create-template', { instanceName, ...templateData }, 'Template criado', 'Erro ao criar template'), [withToast]);
  const findTemplates = useCallback((instanceName: string) => callApi('find-templates', { instanceName }, 'GET'), [callApi]);
  const deleteTemplate = useCallback((instanceName: string, templateData: object) => withToast('delete-template', { instanceName, ...templateData }, 'Template excluído', 'Erro ao excluir template', 'DELETE'), [withToast]);

  // Block/Unblock
  const updateBlockStatus = useCallback((instanceName: string, number: string, status: 'block' | 'unblock') =>
    withToast('update-block-status', { instanceName, number, status }, status === 'block' ? 'Contato bloqueado' : 'Contato desbloqueado', 'Erro ao atualizar bloqueio'), [withToast]);

  // Offer Call
  const offerCall = useCallback((instanceName: string, number: string, isVideo?: boolean, callDuration?: number) =>
    callApi('offer-call', { instanceName, number, isVideo, callDuration }), [callApi]);

  // Business Catalog
  const getBusinessCatalog = useCallback((instanceName: string, number: string, limit?: number, cursor?: string) =>
    callApi('get-catalog', { instanceName, number, limit, cursor }), [callApi]);
  const getBusinessCollections = useCallback((instanceName: string, number: string, limit?: number, cursor?: string) =>
    callApi('get-collections', { instanceName, number, limit, cursor }), [callApi]);

  // Proxy
  const setProxy = useCallback((instanceName: string, config: { enabled?: boolean; host: string; port: number; protocol: string; username?: string; password?: string }) =>
    withToast('set-proxy', { instanceName, ...config }, 'Proxy configurado', 'Erro ao configurar proxy'), [withToast]);
  const getProxy = useCallback((instanceName: string) => callApi('get-proxy', { instanceName }, 'GET'), [callApi]);

  // EvoAI
  const setEvoAI = useCallback((instanceName: string, config: { enabled?: boolean; apiUrl: string; apiKey: string; agentId: string; expire?: number; triggerType?: string; triggerOperator?: string; triggerValue?: string; keywordFinish?: string; delayMessage?: number; unknownMessage?: string; listeningFromMe?: boolean; stopBotFromMe?: boolean; keepOpen?: boolean; debounceTime?: number; speechToText?: boolean }) =>
    withToast('set-evoai', { instanceName, ...config }, 'EvoAI configurado', 'Erro ao configurar EvoAI'), [withToast]);
  const getEvoAI = useCallback((instanceName: string) => callApi('get-evoai', { instanceName }, 'GET'), [callApi]);
  const deleteEvoAI = useCallback((instanceName: string) => withToast('delete-evoai', { instanceName }, 'EvoAI removido', 'Erro ao remover EvoAI', 'DELETE'), [withToast]);

  // N8N
  const setN8N = useCallback((instanceName: string, config: { enabled?: boolean; webhookUrl: string; expire?: number; triggerType?: string; triggerOperator?: string; triggerValue?: string; keywordFinish?: string; delayMessage?: number; unknownMessage?: string; listeningFromMe?: boolean; stopBotFromMe?: boolean; keepOpen?: boolean; debounceTime?: number }) =>
    withToast('set-n8n', { instanceName, ...config }, 'N8N configurado', 'Erro ao configurar N8N'), [withToast]);
  const getN8N = useCallback((instanceName: string) => callApi('get-n8n', { instanceName }, 'GET'), [callApi]);
  const deleteN8N = useCallback((instanceName: string) => withToast('delete-n8n', { instanceName }, 'N8N removido', 'Erro ao remover N8N', 'DELETE'), [withToast]);

  // Event Streaming
  const setKafka = useCallback((instanceName: string, enabled: boolean, events?: string[]) => callApi('set-kafka', { instanceName, enabled, events }), [callApi]);
  const getKafka = useCallback((instanceName: string) => callApi('get-kafka', { instanceName }, 'GET'), [callApi]);
  const setNats = useCallback((instanceName: string, enabled: boolean, events?: string[]) => callApi('set-nats', { instanceName, enabled, events }), [callApi]);
  const getNats = useCallback((instanceName: string) => callApi('get-nats', { instanceName }, 'GET'), [callApi]);
  const setPusher = useCallback((instanceName: string, config: { enabled?: boolean; appId: string; key: string; secret: string; cluster: string; events?: string[] }) => callApi('set-pusher', { instanceName, ...config }), [callApi]);
  const getPusher = useCallback((instanceName: string) => callApi('get-pusher', { instanceName }, 'GET'), [callApi]);

  return {
    // Profile
    fetchProfile, updateProfileName, updateProfileStatus, updateProfilePicture,
    removeProfilePicture, fetchProfilePicture, fetchBusinessProfile, updatePrivacySettings,
    // Labels
    findLabels, handleLabel,
    // Chat
    findChats, findMessages, findStatusMessages, findContacts, checkWhatsAppNumbers, getMediaBase64,
    // Chatwoot
    setChatwoot, getChatwoot, deleteChatwoot,
    // Typebot
    setTypebot, getTypebot, deleteTypebot, getTypebotSessions, changeTypebotStatus, startTypebot,
    // OpenAI
    setOpenAI, getOpenAI, deleteOpenAI,
    // Dify
    setDify, getDify, deleteDify,
    // Flowise
    setFlowise, getFlowise, deleteFlowise,
    // Evolution Bot
    setEvolutionBot, getEvolutionBot, deleteEvolutionBot,
    // RabbitMQ / SQS
    setRabbitMQ, getRabbitMQ, setSQS, getSQS,
    // Templates
    createTemplate, findTemplates, deleteTemplate,
    // Block/Unblock
    updateBlockStatus,
    // Offer Call
    offerCall,
    // Business Catalog
    getBusinessCatalog, getBusinessCollections,
    // Proxy
    setProxy, getProxy,
    // EvoAI
    setEvoAI, getEvoAI, deleteEvoAI,
    // N8N
    setN8N, getN8N, deleteN8N,
    // Event Streaming
    setKafka, getKafka, setNats, getNats, setPusher, getPusher,
  };
}
