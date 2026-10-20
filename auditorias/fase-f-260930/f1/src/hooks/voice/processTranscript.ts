import type { VoiceAgentAction } from './types';

export async function processVoiceTranscript(
  transcript: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<VoiceAgentAction> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/voice-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ transcript }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Consume response body to prevent resource leaks
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Voice agent error: ${response.status} ${errorBody.substring(0, 200)}`);
    }

    const result = await response.json();

    if (!result.action || !result.response) {
      return {
        action: 'answer',
        response: result.response || 'Desculpe, não entendi.',
        data: {},
      };
    }

    return result as VoiceAgentAction;
  } finally {
    clearTimeout(timeout);
  }
}
