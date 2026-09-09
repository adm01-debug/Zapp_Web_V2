import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeFlag = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/externalClient', () => ({ isExternalConfigured: true }));
vi.mock('@/hooks/system/useFeatureFlag', () => ({ useFeatureFlag: runtimeFlag }));

import { useCRMIntegrationEnabled } from '../useCRMIntegrationEnabled';

describe('useCRMIntegrationEnabled', () => {
  beforeEach(() => runtimeFlag.mockReset());

  it('changes with the server-side kill switch without rebuilding', () => {
    runtimeFlag.mockReturnValue(false);
    const { result, rerender } = renderHook(() => useCRMIntegrationEnabled());
    expect(result.current).toBe(false);

    runtimeFlag.mockReturnValue(true);
    rerender();
    expect(result.current).toBe(true);
    expect(runtimeFlag).toHaveBeenCalledWith('crm.integration', false);
  });
});
