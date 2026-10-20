import { useEvolutionApiCore } from '../evolution/useEvolutionApiCore';
import { useEvolutionInstance } from '../evolution/useEvolutionInstance';
import { useEvolutionMessaging } from '../evolution/useEvolutionMessaging';
import { useEvolutionGroups } from '../evolution/useEvolutionGroups';
import { useEvolutionIntegrations } from '../evolution/useEvolutionIntegrations';

export type {
  SendMessageParams, ContactCard, PollParams, ListSection, ButtonItem,
  WebhookConfig, SettingsConfig, PrivacySettings, TypebotConfig, OpenAIConfig,
  DifyConfig, FlowiseConfig, EvolutionBotConfig, ChatwootConfig, CreateInstanceParams,
  CreateConnectionParams, CreateConnectionResult,
} from './evolutionApi.types';

/**
 * Unified Evolution API hook — thin orchestrator that composes domain-specific sub-hooks.
 * Each sub-hook is independently importable for tree-shaking.
 */
export function useEvolutionApi() {
  const { isLoading, callApi, withToast } = useEvolutionApiCore();
  const instance = useEvolutionInstance(callApi, withToast);
  const messaging = useEvolutionMessaging(callApi, withToast);
  const groups = useEvolutionGroups(callApi, withToast);
  const integrations = useEvolutionIntegrations(callApi, withToast);

  return {
    isLoading,
    ...instance,
    ...messaging,
    ...groups,
    ...integrations,
  };
}
