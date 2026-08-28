/**
 * Evolution API Service Layer
 *
 * Centralizes all Evolution API calls, instance management, and connection
 * status operations. Hooks should call these functions instead of building
 * requests ad-hoc, which reduces duplication and makes mocking/testing easier.
 *
 * @module services/evolution.service
 */

import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EvolutionInstance {
  id: string;
  instance_name: string;
  instance_display_name?: string | null;
  status?: string | null;
  qr_code?: string | null;
  phone_number?: string | null;
  is_connected: boolean;
  evolution_api_url?: string | null;
  evolution_api_key?: string | null;
  user_id?: string | null;
  tenant_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface EvolutionConnectionStatus {
  instanceName: string;
  state: 'open' | 'close' | 'connecting' | 'unknown';
  phoneNumber?: string | null;
}

export interface EvolutionMessagePayload {
  instanceName: string;
  number: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  fileName?: string;
}

// ─── Instance queries ─────────────────────────────────────────────────────────

/**
 * Fetch all Evolution instances for the current user's tenant.
 * Returns instances ordered by display name ascending.
 */
export async function getEvolutionInstances(): Promise<EvolutionInstance[]> {
  // A view whatsapp_connections_safe não tem instance_display_name — ordena
  // pela coluna real `name`.
  const { data, error } = await supabase
    .from('whatsapp_connections_safe' as any)
    .select('*')
    .order('name' as any, { ascending: true });

  if (error) throw error;
  return (data ?? []).map((item: any) => ({
    ...item,
    instance_name: item.name,
    is_connected: item.status === 'connected' || item.status === 'open'
  })) as EvolutionInstance[];
}

/**
 * Fetch a single Evolution instance by its database ID.
 */
export async function getEvolutionInstanceById(
  id: string,
): Promise<EvolutionInstance | null> {
  const { data, error } = await supabase
    .from('whatsapp_connections_safe' as any)
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  const item = data as any;
  return {
    ...item,
    instance_name: item.name,
    is_connected: item.status === 'connected' || item.status === 'open'
  } as EvolutionInstance;
}

/**
 * Fetch a single Evolution instance by its instance_name (Evolution API key).
 */
export async function getEvolutionInstanceByName(
  instanceName: string,
): Promise<EvolutionInstance | null> {
  const { data, error } = await supabase
    .from('whatsapp_connections_safe' as any)
    .select('*')
    .eq('name', instanceName)
    .single();

  if (error) return null;
  const item = data as any;
  return {
    ...item,
    instance_name: item.name,
    is_connected: item.status === 'connected' || item.status === 'open'
  } as EvolutionInstance;
}

/**
 * Fetch only connected instances.
 * O webhook grava status 'connected' (v2 usava 'open' — mantido por compat).
 */
export async function getConnectedEvolutionInstances(): Promise<EvolutionInstance[]> {
  const { data, error } = await supabase
    .from('whatsapp_connections_safe' as any)
    .select('*')
    .in('status', ['connected', 'open']);

  if (error) throw error;
  return (data ?? []).map((item: any) => ({
    ...item,
    instance_name: item.name,
    is_connected: item.status === 'connected' || item.status === 'open'
  })) as EvolutionInstance[];
}

// ─── Instance mutations ───────────────────────────────────────────────────────

/**
 * Update the connection status of an instance.
 * Used by webhook handlers when connection state changes.
 */
export async function updateEvolutionInstanceStatus(
  instanceName: string,
  update: {
    status?: string;
    is_connected?: boolean;
    phone_number?: string | null;
    qr_code?: string | null;
  },
): Promise<void> {
  // A coluna que carrega o nome da instância Evolution é instance_id
  // (instance_name não existe em whatsapp_connections).
  const { error } = await supabase
    .from('whatsapp_connections' as any)
    .update({ ...update, updated_at: new Date().toISOString() } as any)
    .eq('instance_id', instanceName);

  if (error) throw error;
}

// ─── Messaging ──────────────────────────────────────────────────────────────

/**
 * Send a text message via the evolution-api edge function.
 *
 * Sempre roteia pela edge function: é ela que fala com a Evolution GO
 * (tradução v2→GO, credenciais nos secrets do servidor). Nunca chamar a
 * Evolution direto do browser com URL/chave do banco — isso era um resquício
 * da instalação Evolution API v2 antiga.
 */
export async function sendEvolutionMessage(
  payload: EvolutionMessagePayload,
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('evolution-api/send-text', {
    body: {
      instanceName: payload.instanceName,
      number: payload.number,
      text: payload.text,
    },
  });

  if (error || (data as any)?.error) {
    throw new Error((data as any)?.message || 'Failed to send message via Evolution API');
  }
}

/**
 * Send media (image/video/audio/document) via the evolution-api edge function.
 */
export async function sendEvolutionMedia(
  payload: EvolutionMessagePayload,
): Promise<void> {
  const action = payload.mediaType === 'audio' ? 'send-audio' : 'send-media';
  const { data, error } = await supabase.functions.invoke(`evolution-api/${action}`, {
    body: {
      instanceName: payload.instanceName,
      number: payload.number,
      mediaUrl: payload.mediaUrl,
      mediaType: payload.mediaType,
      caption: payload.caption,
      fileName: payload.fileName,
    },
  });

  if (error || (data as any)?.error) {
    throw new Error((data as any)?.message || 'Failed to send media via Evolution API');
  }
}
