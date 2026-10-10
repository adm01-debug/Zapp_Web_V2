import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { useFeatureFlag } from './useFeatureFlag';

/** Build gate + server-side kill switch. Both must be true (fail closed). */
export function useCRMIntegrationEnabled(): boolean {
  const runtimeEnabled = useFeatureFlag('crm.integration', false);
  return isExternalConfigured && runtimeEnabled;
}
