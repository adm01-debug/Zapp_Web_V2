import { supabase } from '@/integrations/supabase/client';

export async function callGmailFunction(functionName: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (response.error) throw new Error(response.error.message);
  return response.data;
}
