export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agent_achievements: {
        Row: {
          achievement_description: string | null
          achievement_name: string
          achievement_type: string
          earned_at: string
          id: string
          profile_id: string
          xp_earned: number
        }
        Insert: {
          achievement_description?: string | null
          achievement_name: string
          achievement_type: string
          earned_at?: string
          id?: string
          profile_id: string
          xp_earned?: number
        }
        Update: {
          achievement_description?: string | null
          achievement_name?: string
          achievement_type?: string
          earned_at?: string
          id?: string
          profile_id?: string
          xp_earned?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_achievements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_achievements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_presence: {
        Row: {
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_skills: {
        Row: {
          created_at: string | null
          id: string
          profile_id: string
          skill_level: number | null
          skill_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_id: string
          skill_level?: number | null
          skill_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_id?: string
          skill_level?: number | null
          skill_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_skills_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_skills_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_stats: {
        Row: {
          achievements_count: number
          avg_response_time_seconds: number | null
          best_streak: number
          conversations_resolved: number
          created_at: string
          current_streak: number
          customer_satisfaction_score: number | null
          id: string
          level: number
          messages_received: number
          messages_sent: number
          profile_id: string
          updated_at: string
          xp: number
        }
        Insert: {
          achievements_count?: number
          avg_response_time_seconds?: number | null
          best_streak?: number
          conversations_resolved?: number
          created_at?: string
          current_streak?: number
          customer_satisfaction_score?: number | null
          id?: string
          level?: number
          messages_received?: number
          messages_sent?: number
          profile_id: string
          updated_at?: string
          xp?: number
        }
        Update: {
          achievements_count?: number
          avg_response_time_seconds?: number | null
          best_streak?: number
          conversations_resolved?: number
          created_at?: string
          current_streak?: number
          customer_satisfaction_score?: number | null
          id?: string
          level?: number
          messages_received?: number
          messages_sent?: number
          profile_id?: string
          updated_at?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_stats_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_stats_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_visibility_grants: {
        Row: {
          agent_id: string
          can_see_agent_id: string
          created_at: string
          granted_by: string | null
          id: string
        }
        Insert: {
          agent_id: string
          can_see_agent_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
        }
        Update: {
          agent_id?: string
          can_see_agent_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_visibility_grants_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_visibility_grants_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_visibility_grants_can_see_agent_id_fkey"
            columns: ["can_see_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_visibility_grants_can_see_agent_id_fkey"
            columns: ["can_see_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_visibility_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_visibility_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_budget_reservations: {
        Row: {
          actual_tokens: number | null
          created_at: string
          expires_at: string
          function_name: string
          id: string
          idempotency_key: string
          reserved_tokens: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          actual_tokens?: number | null
          created_at?: string
          expires_at: string
          function_name: string
          id?: string
          idempotency_key: string
          reserved_tokens: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          actual_tokens?: number | null
          created_at?: string
          expires_at?: string
          function_name?: string
          id?: string
          idempotency_key?: string
          reserved_tokens?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ai_conversation_tags: {
        Row: {
          confidence: number | null
          contact_id: string
          created_at: string | null
          id: string
          source: string | null
          tag_name: string
        }
        Insert: {
          confidence?: number | null
          contact_id: string
          created_at?: string | null
          id?: string
          source?: string | null
          tag_name: string
        }
        Update: {
          confidence?: number | null
          contact_id?: string
          created_at?: string | null
          id?: string
          source?: string | null
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_jobs: {
        Row: {
          attempt_count: number
          available_at: string
          created_at: string
          expires_at: string | null
          finished_at: string | null
          function_name: string
          heartbeat_at: string | null
          id: string
          idempotency_key: string
          kind: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          priority: number
          result: Json | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          created_at?: string
          expires_at?: string | null
          finished_at?: string | null
          function_name: string
          heartbeat_at?: string | null
          id?: string
          idempotency_key: string
          kind: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempt_count?: number
          available_at?: string
          created_at?: string
          expires_at?: string | null
          finished_at?: string | null
          function_name?: string
          heartbeat_at?: string | null
          id?: string
          idempotency_key?: string
          kind?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ai_model_prices: {
        Row: {
          created_at: string
          currency: string
          id: string
          model: string
          notes: string | null
          provider_id: string | null
          source: string
          unit: string
          unit_price: number
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          model: string
          notes?: string | null
          provider_id?: string | null
          source?: string
          unit: string
          unit_price: number
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          model?: string
          notes?: string | null
          provider_id?: string | null
          source?: string
          unit?: string
          unit_price?: number
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_model_prices_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ai_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          api_endpoint: string | null
          api_key_secret_name: string | null
          config: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          model: string | null
          name: string
          provider_type: Database["public"]["Enums"]["ai_provider_type"]
          system_prompt: string | null
          updated_at: string
          use_for: string[]
        }
        Insert: {
          api_endpoint?: string | null
          api_key_secret_name?: string | null
          config?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          model?: string | null
          name: string
          provider_type?: Database["public"]["Enums"]["ai_provider_type"]
          system_prompt?: string | null
          updated_at?: string
          use_for?: string[]
        }
        Update: {
          api_endpoint?: string | null
          api_key_secret_name?: string | null
          config?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          model?: string | null
          name?: string
          provider_type?: Database["public"]["Enums"]["ai_provider_type"]
          system_prompt?: string | null
          updated_at?: string
          use_for?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ai_providers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_providers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          attempt: number | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          function_name: string
          id: string
          input_tokens: number | null
          job_id: string | null
          metadata: Json | null
          model: string | null
          output_tokens: number | null
          profile_id: string | null
          request_id: string | null
          status: string
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          attempt?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          function_name: string
          id?: string
          input_tokens?: number | null
          job_id?: string | null
          metadata?: Json | null
          model?: string | null
          output_tokens?: number | null
          profile_id?: string | null
          request_id?: string | null
          status?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          attempt?: number | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          function_name?: string
          id?: string
          input_tokens?: number | null
          job_id?: string | null
          metadata?: Json | null
          model?: string | null
          output_tokens?: number | null
          profile_id?: string | null
          request_id?: string | null
          status?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      allowed_countries: {
        Row: {
          added_by: string | null
          country_code: string
          country_name: string
          created_at: string
          id: string
        }
        Insert: {
          added_by?: string | null
          country_code: string
          country_name: string
          created_at?: string
          id?: string
        }
        Update: {
          added_by?: string | null
          country_code?: string
          country_name?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      audio_meme_favorites: {
        Row: {
          created_at: string
          id: string
          meme_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meme_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meme_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audio_meme_favorites_meme_id_fkey"
            columns: ["meme_id"]
            isOneToOne: false
            referencedRelation: "audio_memes"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_memes: {
        Row: {
          audio_url: string
          category: string
          created_at: string
          duration_seconds: number | null
          id: string
          is_favorite: boolean
          name: string
          uploaded_by: string | null
          use_count: number
        }
        Insert: {
          audio_url: string
          category?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_favorite?: boolean
          name: string
          uploaded_by?: string | null
          use_count?: number
        }
        Update: {
          audio_url?: string
          category?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_favorite?: boolean
          name?: string
          uploaded_by?: string | null
          use_count?: number
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auto_close_config: {
        Row: {
          close_message: string | null
          created_at: string
          id: string
          inactivity_hours: number
          is_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          close_message?: string | null
          created_at?: string
          id?: string
          inactivity_hours?: number
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          close_message?: string | null
          created_at?: string
          id?: string
          inactivity_hours?: number
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_close_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_close_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          actions: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          trigger_config: Json
          trigger_count: number
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          trigger_config?: Json
          trigger_count?: number
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          trigger_config?: Json
          trigger_count?: number
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      away_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          is_enabled: boolean | null
          updated_at: string
          whatsapp_connection_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          updated_at?: string
          whatsapp_connection_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          updated_at?: string
          whatsapp_connection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "away_messages_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "away_messages_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "away_messages_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "away_messages_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_countries: {
        Row: {
          blocked_by: string | null
          country_code: string
          country_name: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_by?: string | null
          country_code: string
          country_name: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_by?: string | null
          country_code?: string
          country_name?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      blocked_ips: {
        Row: {
          blocked_at: string
          blocked_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          ip_address: string
          is_permanent: boolean | null
          last_attempt_at: string | null
          reason: string
          request_count: number | null
        }
        Insert: {
          blocked_at?: string
          blocked_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address: string
          is_permanent?: boolean | null
          last_attempt_at?: string | null
          reason: string
          request_count?: number | null
        }
        Update: {
          blocked_at?: string
          blocked_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          ip_address?: string
          is_permanent?: boolean | null
          last_attempt_at?: string | null
          reason?: string
          request_count?: number | null
        }
        Relationships: []
      }
      business_hours: {
        Row: {
          close_time: string | null
          created_at: string
          day_of_week: number
          id: string
          is_open: boolean | null
          open_time: string | null
          updated_at: string
          whatsapp_connection_id: string
        }
        Insert: {
          close_time?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          is_open?: boolean | null
          open_time?: string | null
          updated_at?: string
          whatsapp_connection_id: string
        }
        Update: {
          close_time?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          is_open?: boolean | null
          open_time?: string | null
          updated_at?: string
          whatsapp_connection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_hours_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_hours_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_hours_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agent_id: string | null
          agent_notes: string | null
          answered_at: string | null
          answered_by: string | null
          channel: string | null
          contact_id: string | null
          created_at: string
          direction: string
          duration_seconds: number | null
          end_reason: string | null
          ended_at: string | null
          id: string
          notes: string | null
          peer_name: string | null
          peer_number: string | null
          provider_call_id: string | null
          provider_event_id: string | null
          recording_status: string
          recording_url: string | null
          started_at: string
          status: string
          talk_seconds: number | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          agent_id?: string | null
          agent_notes?: string | null
          answered_at?: string | null
          answered_by?: string | null
          channel?: string | null
          contact_id?: string | null
          created_at?: string
          direction: string
          duration_seconds?: number | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          peer_name?: string | null
          peer_number?: string | null
          provider_call_id?: string | null
          provider_event_id?: string | null
          recording_status?: string
          recording_url?: string | null
          started_at?: string
          status?: string
          talk_seconds?: number | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          agent_id?: string | null
          agent_notes?: string | null
          answered_at?: string | null
          answered_by?: string | null
          channel?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          peer_name?: string | null
          peer_number?: string | null
          provider_call_id?: string | null
          provider_event_id?: string | null
          recording_status?: string
          recording_url?: string | null
          started_at?: string
          status?: string
          talk_seconds?: number | null
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_ab_variants: {
        Row: {
          campaign_id: string
          created_at: string
          delivered_count: number | null
          id: string
          is_winner: boolean | null
          media_url: string | null
          message_content: string
          read_count: number | null
          response_count: number | null
          send_count: number | null
          variant_name: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          delivered_count?: number | null
          id?: string
          is_winner?: boolean | null
          media_url?: string | null
          message_content: string
          read_count?: number | null
          response_count?: number | null
          send_count?: number | null
          variant_name?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          delivered_count?: number | null
          id?: string
          is_winner?: boolean | null
          media_url?: string | null
          message_content?: string
          read_count?: number | null
          response_count?: number | null
          send_count?: number | null
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_ab_variants_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_contacts: {
        Row: {
          campaign_id: string
          contact_id: string
          created_at: string
          error_message: string | null
          external_id: string | null
          id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          contact_id: string
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          created_at?: string
          error_message?: string | null
          external_id?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          delivered_count: number
          description: string | null
          failed_count: number
          id: string
          media_url: string | null
          message_content: string
          message_type: string
          name: string
          read_count: number
          scheduled_at: string | null
          send_interval_seconds: number | null
          sent_count: number
          started_at: string | null
          status: string
          target_filter: Json | null
          target_type: string
          total_contacts: number
          updated_at: string
          whatsapp_connection_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
          failed_count?: number
          id?: string
          media_url?: string | null
          message_content: string
          message_type?: string
          name: string
          read_count?: number
          scheduled_at?: string | null
          send_interval_seconds?: number | null
          sent_count?: number
          started_at?: string | null
          status?: string
          target_filter?: Json | null
          target_type?: string
          total_contacts?: number
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
          failed_count?: number
          id?: string
          media_url?: string | null
          message_content?: string
          message_type?: string
          name?: string
          read_count?: number
          scheduled_at?: string | null
          send_interval_seconds?: number | null
          sent_count?: number
          started_at?: string | null
          status?: string
          target_filter?: Json | null
          target_type?: string
          total_contacts?: number
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_favorites: {
        Row: {
          created_at: string
          id: string
          primary_image_url: string | null
          product_id: string
          product_name: string
          product_sku: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          primary_image_url?: string | null
          product_id: string
          product_name: string
          product_sku?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          primary_image_url?: string | null
          product_id?: string
          product_name?: string
          product_sku?: string | null
          user_id?: string
        }
        Relationships: []
      }
      catalog_rate_limit_hits: {
        Row: {
          action: string
          hit_at: string
          id: number
          user_id: string
        }
        Insert: {
          action: string
          hit_at?: string
          id?: number
          user_id: string
        }
        Update: {
          action?: string
          hit_at?: string
          id?: number
          user_id?: string
        }
        Relationships: []
      }
      catalog_rate_limits: {
        Row: {
          action: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          action: string
          count: number
          user_id: string
          window_start?: string
        }
        Update: {
          action?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      catalog_send_events: {
        Row: {
          agent_id: string | null
          contact_id: string | null
          created_at: string
          id: string
          images_count: number | null
          message_ids: Json | null
          message_length: number | null
          product_id: string
          product_name: string
          product_sku: string | null
          status: string | null
          template: string | null
          variant_label: string | null
        }
        Insert: {
          agent_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          images_count?: number | null
          message_ids?: Json | null
          message_length?: number | null
          product_id: string
          product_name: string
          product_sku?: string | null
          status?: string | null
          template?: string | null
          variant_label?: string | null
        }
        Update: {
          agent_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          images_count?: number | null
          message_ids?: Json | null
          message_length?: number | null
          product_id?: string
          product_name?: string
          product_sku?: string | null
          status?: string | null
          template?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_send_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_send_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_send_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_connections: {
        Row: {
          channel_type: Database["public"]["Enums"]["channel_type"]
          config: Json | null
          created_at: string
          created_by: string | null
          credentials: Json | null
          external_account_id: string | null
          external_page_id: string | null
          id: string
          is_active: boolean | null
          name: string
          status: string
          updated_at: string
          webhook_url: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          channel_type: Database["public"]["Enums"]["channel_type"]
          config?: Json | null
          created_at?: string
          created_by?: string | null
          credentials?: Json | null
          external_account_id?: string | null
          external_page_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          status?: string
          updated_at?: string
          webhook_url?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          channel_type?: Database["public"]["Enums"]["channel_type"]
          config?: Json | null
          created_at?: string
          created_by?: string | null
          credentials?: Json | null
          external_account_id?: string | null
          external_page_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          status?: string
          updated_at?: string
          webhook_url?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_routing_rules: {
        Row: {
          channel_connection_id: string | null
          channel_type: Database["public"]["Enums"]["channel_type"]
          conditions: Json | null
          created_at: string
          id: string
          is_active: boolean | null
          priority: number | null
          queue_id: string | null
        }
        Insert: {
          channel_connection_id?: string | null
          channel_type: Database["public"]["Enums"]["channel_type"]
          conditions?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          priority?: number | null
          queue_id?: string | null
        }
        Update: {
          channel_connection_id?: string | null
          channel_type?: Database["public"]["Enums"]["channel_type"]
          conditions?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          priority?: number | null
          queue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_routing_rules_channel_connection_id_fkey"
            columns: ["channel_connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_routing_rules_channel_connection_id_fkey"
            columns: ["channel_connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_routing_rules_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_executions: {
        Row: {
          completed_at: string | null
          contact_id: string
          created_at: string
          current_node_id: string | null
          error_message: string | null
          flow_id: string
          id: string
          started_at: string
          status: string
          variables: Json | null
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          created_at?: string
          current_node_id?: string | null
          error_message?: string | null
          flow_id: string
          id?: string
          started_at?: string
          status?: string
          variables?: Json | null
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          created_at?: string
          current_node_id?: string | null
          error_message?: string | null
          flow_id?: string
          id?: string
          started_at?: string
          status?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_executions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_executions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "chatbot_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_flows: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          edges: Json
          execution_count: number | null
          id: string
          is_active: boolean | null
          last_executed_at: string | null
          name: string
          nodes: Json
          trigger_type: string
          trigger_value: string | null
          updated_at: string
          variables: Json | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json
          execution_count?: number | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          name: string
          nodes?: Json
          trigger_type?: string
          trigger_value?: string | null
          updated_at?: string
          variables?: Json | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json
          execution_count?: number | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          name?: string
          nodes?: Json
          trigger_type?: string
          trigger_value?: string | null
          updated_at?: string
          variables?: Json | null
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_flows_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_flows_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_flows_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_flows_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      client_wallet_rules: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          priority: number | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          priority?: number | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          priority?: number | null
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_wallet_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_wallet_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_wallet_rules_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_wallet_rules_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_wallet_rules_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_wallet_rules_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_health_logs: {
        Row: {
          checked_at: string
          connection_id: string
          error_message: string | null
          id: string
          instance_id: string
          response_time_ms: number | null
          status: string
        }
        Insert: {
          checked_at?: string
          connection_id: string
          error_message?: string | null
          id?: string
          instance_id: string
          response_time_ms?: number | null
          status?: string
        }
        Update: {
          checked_at?: string
          connection_id?: string
          error_message?: string | null
          id?: string
          instance_id?: string
          response_time_ms?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_health_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_health_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_health_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_health_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_custom_fields: {
        Row: {
          contact_id: string
          created_at: string
          field_name: string
          field_type: string
          field_value: string | null
          id: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          field_name: string
          field_type?: string
          field_value?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          field_name?: string
          field_type?: string
          field_value?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_custom_fields_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_deletion_audit: {
        Row: {
          contact_id: string
          deleted_at_from: string | null
          deleted_at_to: string | null
          id: number
          operation: string
          performed_at: string
          performed_by: string | null
          performed_by_db_role: string
          performed_by_profile: string | null
        }
        Insert: {
          contact_id: string
          deleted_at_from?: string | null
          deleted_at_to?: string | null
          id?: never
          operation: string
          performed_at?: string
          performed_by?: string | null
          performed_by_db_role?: string
          performed_by_profile?: string | null
        }
        Update: {
          contact_id?: string
          deleted_at_from?: string | null
          deleted_at_to?: string | null
          id?: never
          operation?: string
          performed_at?: string
          performed_by?: string | null
          performed_by_db_role?: string
          performed_by_profile?: string | null
        }
        Relationships: []
      }
      contact_identity_map: {
        Row: {
          first_seen: string
          jid: string
          last_seen: string
          lid: string
          source: string | null
        }
        Insert: {
          first_seen?: string
          jid: string
          last_seen?: string
          lid: string
          source?: string | null
        }
        Update: {
          first_seen?: string
          jid?: string
          last_seen?: string
          lid?: string
          source?: string | null
        }
        Relationships: []
      }
      contact_notes: {
        Row: {
          author_id: string
          category: string
          contact_id: string
          content: string
          created_at: string
          due_date: string | null
          id: string
          is_done: boolean
          updated_at: string
        }
        Insert: {
          author_id: string
          category?: string
          contact_id: string
          content: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_done?: boolean
          updated_at?: string
        }
        Update: {
          author_id?: string
          category?: string
          contact_id?: string
          content?: string
          created_at?: string
          due_date?: string | null
          id?: string
          is_done?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_purchases: {
        Row: {
          amount: number | null
          contact_id: string
          created_at: string
          created_by: string | null
          currency: string | null
          deal_id: string | null
          description: string | null
          id: string
          purchase_type: string | null
          purchased_at: string | null
          status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string
          purchase_type?: string | null
          purchased_at?: string | null
          status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string
          purchase_type?: string | null
          purchased_at?: string | null
          status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_purchases_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_purchases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_purchases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_purchases_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "sales_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          address_number: string | null
          ai_priority: string | null
          ai_projection_analysis_id: string | null
          ai_projection_updated_at: string | null
          ai_sentiment: string | null
          assigned_to: string | null
          avatar_fetch_attempted_at: string | null
          avatar_url: string | null
          channel_connection_id: string | null
          channel_type: string | null
          city: string | null
          company: string | null
          consent_status: string | null
          contact_type: string | null
          conversation_status: string
          conversation_status_changed_at: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          group_category: string | null
          id: string
          is_lid_legacy: boolean
          job_title: string | null
          latitude: number | null
          lead_origin: string | null
          lead_score: number | null
          longitude: number | null
          name: string
          neighborhood: string | null
          nickname: string | null
          notes: string | null
          phone: string
          postal_code: string | null
          queue_id: string | null
          risk_score: number | null
          state: string | null
          surname: string | null
          tags: string[] | null
          updated_at: string
          whatsapp_connection_id: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          ai_priority?: string | null
          ai_projection_analysis_id?: string | null
          ai_projection_updated_at?: string | null
          ai_sentiment?: string | null
          assigned_to?: string | null
          avatar_fetch_attempted_at?: string | null
          avatar_url?: string | null
          channel_connection_id?: string | null
          channel_type?: string | null
          city?: string | null
          company?: string | null
          consent_status?: string | null
          contact_type?: string | null
          conversation_status?: string
          conversation_status_changed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          group_category?: string | null
          id?: string
          is_lid_legacy?: boolean
          job_title?: string | null
          latitude?: number | null
          lead_origin?: string | null
          lead_score?: number | null
          longitude?: number | null
          name: string
          neighborhood?: string | null
          nickname?: string | null
          notes?: string | null
          phone: string
          postal_code?: string | null
          queue_id?: string | null
          risk_score?: number | null
          state?: string | null
          surname?: string | null
          tags?: string[] | null
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          ai_priority?: string | null
          ai_projection_analysis_id?: string | null
          ai_projection_updated_at?: string | null
          ai_sentiment?: string | null
          assigned_to?: string | null
          avatar_fetch_attempted_at?: string | null
          avatar_url?: string | null
          channel_connection_id?: string | null
          channel_type?: string | null
          city?: string | null
          company?: string | null
          consent_status?: string | null
          contact_type?: string | null
          conversation_status?: string
          conversation_status_changed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          group_category?: string | null
          id?: string
          is_lid_legacy?: boolean
          job_title?: string | null
          latitude?: number | null
          lead_origin?: string | null
          lead_score?: number | null
          longitude?: number | null
          name?: string
          neighborhood?: string | null
          nickname?: string | null
          notes?: string | null
          phone?: string
          postal_code?: string | null
          queue_id?: string | null
          risk_score?: number | null
          state?: string | null
          surname?: string | null
          tags?: string[] | null
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_ai_projection_analysis_id_fkey"
            columns: ["ai_projection_analysis_id"]
            isOneToOne: false
            referencedRelation: "conversation_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_channel_connection_id_fkey"
            columns: ["channel_connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_channel_connection_id_fkey"
            columns: ["channel_connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_analyses: {
        Row: {
          agent_performance: Json | null
          analysis_version: number
          analyzed_at: string
          analyzed_by: string | null
          churn_risk: string | null
          contact_id: string
          coverage: Json | null
          created_at: string
          customer_satisfaction: number | null
          department: string | null
          id: string
          key_points: string[] | null
          message_count: number | null
          model: string | null
          next_steps: string[] | null
          period_days: number | null
          relationship_type: string | null
          request_key: string | null
          sales_opportunity: string | null
          sentiment: string | null
          sentiment_score: number | null
          status: string
          summary: string
          topics: string[] | null
          urgency: string | null
        }
        Insert: {
          agent_performance?: Json | null
          analysis_version?: number
          analyzed_at?: string
          analyzed_by?: string | null
          churn_risk?: string | null
          contact_id: string
          coverage?: Json | null
          created_at?: string
          customer_satisfaction?: number | null
          department?: string | null
          id?: string
          key_points?: string[] | null
          message_count?: number | null
          model?: string | null
          next_steps?: string[] | null
          period_days?: number | null
          relationship_type?: string | null
          request_key?: string | null
          sales_opportunity?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          status?: string
          summary: string
          topics?: string[] | null
          urgency?: string | null
        }
        Update: {
          agent_performance?: Json | null
          analysis_version?: number
          analyzed_at?: string
          analyzed_by?: string | null
          churn_risk?: string | null
          contact_id?: string
          coverage?: Json | null
          created_at?: string
          customer_satisfaction?: number | null
          department?: string | null
          id?: string
          key_points?: string[] | null
          message_count?: number | null
          model?: string | null
          next_steps?: string[] | null
          period_days?: number | null
          relationship_type?: string | null
          request_key?: string | null
          sales_opportunity?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          status?: string
          summary?: string
          topics?: string[] | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_analyses_analyzed_by_fkey"
            columns: ["analyzed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_analyses_analyzed_by_fkey"
            columns: ["analyzed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_analyses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_closures: {
        Row: {
          classification: string | null
          client_request_id: string | null
          close_reason: string
          closed_by: string | null
          contact_id: string
          created_at: string
          id: string
          notes: string | null
          outcome: string | null
        }
        Insert: {
          classification?: string | null
          client_request_id?: string | null
          close_reason: string
          closed_by?: string | null
          contact_id: string
          created_at?: string
          id?: string
          notes?: string | null
          outcome?: string | null
        }
        Update: {
          classification?: string | null
          client_request_id?: string | null
          close_reason?: string
          closed_by?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_closures_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_closures_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_closures_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_events: {
        Row: {
          closure_id: string | null
          contact_id: string
          created_at: string
          event_type: string
          from_agent_id: string | null
          from_queue_id: string | null
          id: string
          metadata: Json | null
          performed_by: string | null
          to_agent_id: string | null
          to_queue_id: string | null
        }
        Insert: {
          closure_id?: string | null
          contact_id: string
          created_at?: string
          event_type: string
          from_agent_id?: string | null
          from_queue_id?: string | null
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          to_agent_id?: string | null
          to_queue_id?: string | null
        }
        Update: {
          closure_id?: string | null
          contact_id?: string
          created_at?: string
          event_type?: string
          from_agent_id?: string | null
          from_queue_id?: string | null
          id?: string
          metadata?: Json | null
          performed_by?: string | null
          to_agent_id?: string | null
          to_queue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_events_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: false
            referencedRelation: "conversation_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_from_agent_id_fkey"
            columns: ["from_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_from_queue_id_fkey"
            columns: ["from_queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_to_agent_id_fkey"
            columns: ["to_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_events_to_queue_id_fkey"
            columns: ["to_queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_memory: {
        Row: {
          commercial_summary: string | null
          contact_id: string
          created_at: string
          cumulative_summary: string | null
          facts: Json | null
          id: string
          objections_handled: Json | null
          pending_items: Json | null
          promises_made: Json | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          commercial_summary?: string | null
          contact_id: string
          created_at?: string
          cumulative_summary?: string | null
          facts?: Json | null
          id?: string
          objections_handled?: Json | null
          pending_items?: Json | null
          promises_made?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          commercial_summary?: string | null
          contact_id?: string
          created_at?: string
          cumulative_summary?: string | null
          facts?: Json | null
          id?: string
          objections_handled?: Json | null
          pending_items?: Json | null
          promises_made?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_memory_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_memory_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_memory_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_sla: {
        Row: {
          contact_id: string | null
          created_at: string
          first_message_at: string
          first_response_at: string | null
          first_response_breached: boolean | null
          id: string
          resolution_breached: boolean | null
          resolved_at: string | null
          sla_configuration_id: string | null
          updated_at: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          first_message_at?: string
          first_response_at?: string | null
          first_response_breached?: boolean | null
          id?: string
          resolution_breached?: boolean | null
          resolved_at?: string | null
          sla_configuration_id?: string | null
          updated_at?: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          first_message_at?: string
          first_response_at?: string | null
          first_response_breached?: boolean | null
          id?: string
          resolution_breached?: boolean | null
          resolved_at?: string | null
          sla_configuration_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_sla_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_sla_sla_configuration_id_fkey"
            columns: ["sla_configuration_id"]
            isOneToOne: false
            referencedRelation: "sla_configurations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_snoozes: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          reason: string | null
          snooze_until: string
          snoozed_by: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          reason?: string | null
          snooze_until: string
          snoozed_by: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          snooze_until?: string
          snoozed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_snoozes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_snoozes_snoozed_by_fkey"
            columns: ["snoozed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_snoozes_snoozed_by_fkey"
            columns: ["snoozed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_tasks: {
        Row: {
          assigned_to: string | null
          client_task_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          notified_at: string | null
          position: number
          priority: string
          remind_at: string | null
          started_at: string | null
          status: string
          status_changed_at: string
          title: string
          updated_at: string
          waiting_reason: string | null
        }
        Insert: {
          assigned_to?: string | null
          client_task_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          notified_at?: string | null
          position?: number
          priority?: string
          remind_at?: string | null
          started_at?: string | null
          status?: string
          status_changed_at?: string
          title: string
          updated_at?: string
          waiting_reason?: string | null
        }
        Update: {
          assigned_to?: string | null
          client_task_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          notified_at?: string | null
          position?: number
          priority?: string
          remind_at?: string | null
          started_at?: string | null
          status?: string
          status_changed_at?: string
          title?: string
          updated_at?: string
          waiting_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      crisis_room_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          id: string
          is_active: boolean | null
          message: string
          metric_name: string
          metric_value: number | null
          severity: string
          threshold: number | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          message: string
          metric_name: string
          metric_value?: number | null
          severity?: string
          threshold?: number | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          message?: string
          metric_name?: string
          metric_value?: number | null
          severity?: string
          threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crisis_room_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crisis_room_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contact_links: {
        Row: {
          external_company_id: string | null
          external_contact_id: string
          id: string
          link_source: string
          linked_at: string
          linked_by: string | null
          normalized_phone: string | null
          verified_at: string | null
          zapp_contact_id: string
        }
        Insert: {
          external_company_id?: string | null
          external_contact_id: string
          id?: string
          link_source?: string
          linked_at?: string
          linked_by?: string | null
          normalized_phone?: string | null
          verified_at?: string | null
          zapp_contact_id: string
        }
        Update: {
          external_company_id?: string | null
          external_contact_id?: string
          id?: string
          link_source?: string
          linked_at?: string
          linked_by?: string | null
          normalized_phone?: string | null
          verified_at?: string | null
          zapp_contact_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contact_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_links_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_links_zapp_contact_id_fkey"
            columns: ["zapp_contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sync_outbox: {
        Row: {
          attempt_count: number
          available_at: string
          closure_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          external_company_id: string | null
          external_contact_id: string | null
          external_interaction_id: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          lease_token: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          normalized_phone: string | null
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          closure_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          external_company_id?: string | null
          external_contact_id?: string | null
          external_interaction_id?: string | null
          id?: string
          idempotency_key: string
          last_error_code?: string | null
          lease_token?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          normalized_phone?: string | null
          payload?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          closure_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          external_company_id?: string | null
          external_contact_id?: string | null
          external_interaction_id?: string | null
          id?: string
          idempotency_key?: string
          last_error_code?: string | null
          lease_token?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          normalized_phone?: string | null
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sync_outbox_closure_id_fkey"
            columns: ["closure_id"]
            isOneToOne: true
            referencedRelation: "conversation_closures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sync_outbox_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      csat_auto_config: {
        Row: {
          created_at: string | null
          delay_minutes: number | null
          id: string
          is_enabled: boolean | null
          message_template: string | null
          updated_at: string | null
          updated_by: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          created_at?: string | null
          delay_minutes?: number | null
          id?: string
          is_enabled?: boolean | null
          message_template?: string | null
          updated_at?: string | null
          updated_by?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          created_at?: string | null
          delay_minutes?: number | null
          id?: string
          is_enabled?: boolean | null
          message_template?: string | null
          updated_at?: string | null
          updated_by?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csat_auto_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_auto_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_auto_config_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_auto_config_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_auto_config_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_auto_config_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      csat_surveys: {
        Row: {
          agent_id: string
          contact_id: string
          conversation_resolved_at: string | null
          created_at: string
          feedback: string | null
          id: string
          rating: number
        }
        Insert: {
          agent_id: string
          contact_id: string
          conversation_resolved_at?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          rating: number
        }
        Update: {
          agent_id?: string
          contact_id?: string
          conversation_resolved_at?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "csat_surveys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_surveys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_surveys_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_emojis: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          image_url: string
          is_favorite: boolean | null
          name: string
          updated_at: string | null
          uploaded_by: string | null
          use_count: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          image_url: string
          is_favorite?: boolean | null
          name: string
          updated_at?: string | null
          uploaded_by?: string | null
          use_count?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          image_url?: string
          is_favorite?: boolean | null
          name?: string
          updated_at?: string | null
          uploaded_by?: string | null
          use_count?: number | null
        }
        Relationships: []
      }
      deal_activities: {
        Row: {
          activity_type: string
          created_at: string | null
          deal_id: string
          description: string | null
          id: string
          performed_by: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          deal_id: string
          description?: string | null
          id?: string
          performed_by?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          deal_id?: string
          description?: string | null
          id?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "sales_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      department_audit_logs: {
        Row: {
          action: string
          created_at: string
          department_id: string
          details: Json
          id: string
          profile_id: string | null
          profile_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          department_id: string
          details?: Json
          id?: string
          profile_id?: string | null
          profile_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          department_id?: string
          details?: Json
          id?: string
          profile_id?: string | null
          profile_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "department_audit_logs_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_audit_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_audit_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      department_invitations: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          department_id: string
          email: string
          expires_at: string
          id: string
          max_uses: number
          role: string
          status: string
          use_count: number
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          department_id: string
          email?: string
          expires_at: string
          id?: string
          max_uses?: number
          role?: string
          status?: string
          use_count?: number
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          department_id?: string
          email?: string
          expires_at?: string
          id?: string
          max_uses?: number
          role?: string
          status?: string
          use_count?: number
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "department_invitations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_invitations_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_invitations_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      department_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          department_id: string
          expires_at: string
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          department_id: string
          expires_at: string
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          department_id?: string
          expires_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_invites_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          whatsapp_api_key: string | null
          whatsapp_instance_id: string | null
          whatsapp_mode: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          whatsapp_api_key?: string | null
          whatsapp_instance_id?: string | null
          whatsapp_mode?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          whatsapp_api_key?: string | null
          whatsapp_instance_id?: string | null
          whatsapp_mode?: string
        }
        Relationships: []
      }
      edge_rate_limits: {
        Row: {
          hits: number
          key: string
          updated_at: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          hits?: number
          key?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      email_attachments: {
        Row: {
          created_at: string
          email_message_id: string
          filename: string | null
          gmail_attachment_id: string
          id: string
          mime_type: string | null
          size_bytes: number | null
        }
        Insert: {
          created_at?: string
          email_message_id: string
          filename?: string | null
          gmail_attachment_id: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
        }
        Update: {
          created_at?: string
          email_message_id?: string
          filename?: string | null
          gmail_attachment_id?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_labels: {
        Row: {
          color: string | null
          created_at: string
          gmail_account_id: string
          gmail_label_id: string
          id: string
          label_type: string
          message_count: number
          name: string
          unread_count: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          gmail_account_id: string
          gmail_label_id: string
          id?: string
          label_type?: string
          message_count?: number
          name: string
          unread_count?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          gmail_account_id?: string
          gmail_label_id?: string
          id?: string
          label_type?: string
          message_count?: number
          name?: string
          unread_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_labels_gmail_account_id_fkey"
            columns: ["gmail_account_id"]
            isOneToOne: false
            referencedRelation: "gmail_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_labels_gmail_account_id_fkey"
            columns: ["gmail_account_id"]
            isOneToOne: false
            referencedRelation: "gmail_accounts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          bcc_addresses: string[]
          body_html: string
          body_text: string
          cc_addresses: string[]
          created_at: string
          direction: string
          from_address: string
          from_name: string | null
          gmail_account_id: string
          gmail_message_id: string
          has_attachments: boolean
          id: string
          in_reply_to: string | null
          internal_date: string
          is_read: boolean
          is_starred: boolean
          label_ids: string[]
          message_id_header: string | null
          references_header: string | null
          reply_to_address: string | null
          snippet: string
          subject: string
          thread_id: string
          to_addresses: string[]
        }
        Insert: {
          bcc_addresses?: string[]
          body_html?: string
          body_text?: string
          cc_addresses?: string[]
          created_at?: string
          direction?: string
          from_address?: string
          from_name?: string | null
          gmail_account_id: string
          gmail_message_id: string
          has_attachments?: boolean
          id?: string
          in_reply_to?: string | null
          internal_date?: string
          is_read?: boolean
          is_starred?: boolean
          label_ids?: string[]
          message_id_header?: string | null
          references_header?: string | null
          reply_to_address?: string | null
          snippet?: string
          subject?: string
          thread_id: string
          to_addresses?: string[]
        }
        Update: {
          bcc_addresses?: string[]
          body_html?: string
          body_text?: string
          cc_addresses?: string[]
          created_at?: string
          direction?: string
          from_address?: string
          from_name?: string | null
          gmail_account_id?: string
          gmail_message_id?: string
          has_attachments?: boolean
          id?: string
          in_reply_to?: string | null
          internal_date?: string
          is_read?: boolean
          is_starred?: boolean
          label_ids?: string[]
          message_id_header?: string | null
          references_header?: string | null
          reply_to_address?: string | null
          snippet?: string
          subject?: string
          thread_id?: string
          to_addresses?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_gmail_account_id_fkey"
            columns: ["gmail_account_id"]
            isOneToOne: false
            referencedRelation: "gmail_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_gmail_account_id_fkey"
            columns: ["gmail_account_id"]
            isOneToOne: false
            referencedRelation: "gmail_accounts_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_threads: {
        Row: {
          assigned_to: string | null
          contact_id: string | null
          created_at: string
          gmail_account_id: string
          gmail_thread_id: string
          id: string
          is_important: boolean
          is_starred: boolean
          is_unread: boolean
          label_ids: string[]
          last_from_address: string | null
          last_from_name: string | null
          last_message_at: string
          message_count: number
          priority: string
          snippet: string
          status: string
          subject: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          gmail_account_id: string
          gmail_thread_id: string
          id?: string
          is_important?: boolean
          is_starred?: boolean
          is_unread?: boolean
          label_ids?: string[]
          last_from_address?: string | null
          last_from_name?: string | null
          last_message_at?: string
          message_count?: number
          priority?: string
          snippet?: string
          status?: string
          subject?: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          gmail_account_id?: string
          gmail_thread_id?: string
          id?: string
          is_important?: boolean
          is_starred?: boolean
          is_unread?: boolean
          label_ids?: string[]
          last_from_address?: string | null
          last_from_name?: string | null
          last_message_at?: string
          message_count?: number
          priority?: string
          snippet?: string
          status?: string
          subject?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_gmail_account_id_fkey"
            columns: ["gmail_account_id"]
            isOneToOne: false
            referencedRelation: "gmail_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_gmail_account_id_fkey"
            columns: ["gmail_account_id"]
            isOneToOne: false
            referencedRelation: "gmail_accounts_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_versions: {
        Row: {
          change_summary: string | null
          changed_by: string | null
          created_at: string
          data: Json
          entity_id: string
          entity_type: string
          id: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          changed_by?: string | null
          created_at?: string
          data?: Json
          entity_id: string
          entity_type: string
          id?: string
          version_number: number
        }
        Update: {
          change_summary?: string | null
          changed_by?: string | null
          created_at?: string
          data?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          version_number?: number
        }
        Relationships: []
      }
      favorite_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      followup_executions: {
        Row: {
          completed_at: string | null
          contact_id: string
          created_at: string | null
          current_step: number | null
          id: string
          next_step_at: string | null
          sequence_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          created_at?: string | null
          current_step?: number | null
          id?: string
          next_step_at?: string | null
          sequence_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          created_at?: string | null
          current_step?: number | null
          id?: string
          next_step_at?: string | null
          sequence_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_executions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_executions_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "followup_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_sequences: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          trigger_event: string
          updated_at: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          trigger_event?: string
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          trigger_event?: string
          updated_at?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followup_sequences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequences_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequences_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequences_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_sequences_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_steps: {
        Row: {
          created_at: string | null
          delay_hours: number
          id: string
          is_active: boolean | null
          message_template: string
          message_type: string
          sequence_id: string
          step_order: number
        }
        Insert: {
          created_at?: string | null
          delay_hours?: number
          id?: string
          is_active?: boolean | null
          message_template: string
          message_type?: string
          sequence_id: string
          step_order?: number
        }
        Update: {
          created_at?: string | null
          delay_hours?: number
          id?: string
          is_active?: boolean | null
          message_template?: string
          message_type?: string
          sequence_id?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "followup_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "followup_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_blocking_settings: {
        Row: {
          created_at: string
          id: string
          mode: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      global_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      gmail_accounts: {
        Row: {
          access_token_encrypted: string | null
          created_at: string
          email_address: string
          history_id: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_sync_at: string | null
          refresh_token_encrypted: string | null
          sync_status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
          watch_expiration: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          created_at?: string
          email_address: string
          history_id?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          refresh_token_encrypted?: string | null
          sync_status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          watch_expiration?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          created_at?: string
          email_address?: string
          history_id?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          refresh_token_encrypted?: string | null
          sync_status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          watch_expiration?: string | null
        }
        Relationships: []
      }
      goals_configurations: {
        Row: {
          created_at: string
          daily_target: number
          goal_type: string
          id: string
          is_active: boolean | null
          monthly_target: number
          profile_id: string | null
          queue_id: string | null
          updated_at: string
          weekly_target: number
        }
        Insert: {
          created_at?: string
          daily_target?: number
          goal_type: string
          id?: string
          is_active?: boolean | null
          monthly_target?: number
          profile_id?: string | null
          queue_id?: string | null
          updated_at?: string
          weekly_target?: number
        }
        Update: {
          created_at?: string
          daily_target?: number
          goal_type?: string
          id?: string
          is_active?: boolean | null
          monthly_target?: number
          profile_id?: string | null
          queue_id?: string | null
          updated_at?: string
          weekly_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "goals_configurations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_configurations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_configurations_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_whitelist: {
        Row: {
          added_by: string | null
          created_at: string
          description: string | null
          id: string
          ip_address: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          ip_address: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: string
        }
        Relationships: []
      }
      knowledge_base_articles: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          created_by: string | null
          embedding_status: string | null
          id: string
          is_published: boolean | null
          search_vector: unknown
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          embedding_status?: string | null
          id?: string
          is_published?: boolean | null
          search_vector?: unknown
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          embedding_status?: string | null
          id?: string
          is_published?: boolean | null
          search_vector?: unknown
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_articles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_base_articles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_files: {
        Row: {
          article_id: string | null
          created_at: string | null
          extracted_text: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          processing_status: string | null
        }
        Insert: {
          article_id?: string | null
          created_at?: string | null
          extracted_text?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          processing_status?: string | null
        }
        Update: {
          article_id?: string | null
          created_at?: string | null
          extracted_text?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          processing_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_files_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      link_preview_cache: {
        Row: {
          created_at: string
          expires_at: string
          preview: Json | null
          updated_at: string
          url: string
          url_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          preview?: Json | null
          updated_at?: string
          url: string
          url_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          preview?: Json | null
          updated_at?: string
          url?: string
          url_hash?: string
        }
        Relationships: []
      }
      link_preview_cache_metrics: {
        Row: {
          deleted_count: number
          duration_ms: number
          id: string
          ran_at: string
          remaining_count: number
          table_size_bytes: number
        }
        Insert: {
          deleted_count?: number
          duration_ms?: number
          id?: string
          ran_at?: string
          remaining_count?: number
          table_size_bytes?: number
        }
        Update: {
          deleted_count?: number
          duration_ms?: number
          id?: string
          ran_at?: string
          remaining_count?: number
          table_size_bytes?: number
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempt_count: number
          created_at: string
          email: string
          id: string
          ip_address: string | null
          last_attempt_at: string
          locked_until: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          last_attempt_at?: string
          locked_until?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          last_attempt_at?: string
          locked_until?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          contact_id: string | null
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          is_global: boolean | null
          shortcut: string | null
          title: string
          updated_at: string
          use_count: number | null
          user_id: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          id?: string
          is_global?: boolean | null
          shortcut?: string | null
          title: string
          updated_at?: string
          use_count?: number | null
          user_id: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          is_global?: boolean | null
          shortcut?: string | null
          title?: string
          updated_at?: string
          use_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          agent_id: string | null
          audio_meme_id: string | null
          caption: string | null
          channel_connection_id: string | null
          channel_type: string | null
          client_message_id: string | null
          contact_id: string | null
          content: string
          created_at: string
          delivery_attempt_count: number
          delivery_claim_expires_at: string | null
          delivery_claim_token: string | null
          delivery_claimed_at: string | null
          delivery_claimed_by: string | null
          delivery_last_claim_token: string | null
          external_id: string | null
          id: string
          is_deleted: boolean | null
          is_edited: boolean
          is_read: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_type: string
          ptt: boolean | null
          reply_to_id: string | null
          sender: string
          status: string | null
          status_updated_at: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string
          whatsapp_connection_id: string | null
        }
        Insert: {
          agent_id?: string | null
          audio_meme_id?: string | null
          caption?: string | null
          channel_connection_id?: string | null
          channel_type?: string | null
          client_message_id?: string | null
          contact_id?: string | null
          content: string
          created_at?: string
          delivery_attempt_count?: number
          delivery_claim_expires_at?: string | null
          delivery_claim_token?: string | null
          delivery_claimed_at?: string | null
          delivery_claimed_by?: string | null
          delivery_last_claim_token?: string | null
          external_id?: string | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean
          is_read?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_type?: string
          ptt?: boolean | null
          reply_to_id?: string | null
          sender: string
          status?: string | null
          status_updated_at?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Update: {
          agent_id?: string | null
          audio_meme_id?: string | null
          caption?: string | null
          channel_connection_id?: string | null
          channel_type?: string | null
          client_message_id?: string | null
          contact_id?: string | null
          content?: string
          created_at?: string
          delivery_attempt_count?: number
          delivery_claim_expires_at?: string | null
          delivery_claim_token?: string | null
          delivery_claimed_at?: string | null
          delivery_claimed_by?: string | null
          delivery_last_claim_token?: string | null
          external_id?: string | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean
          is_read?: boolean | null
          link_preview?: Json | null
          media_filename?: string | null
          media_meta?: Json | null
          media_mimetype?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          message_type?: string
          ptt?: boolean | null
          reply_to_id?: string | null
          sender?: string
          status?: string | null
          status_updated_at?: string | null
          transcription?: string | null
          transcription_status?: string | null
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_audio_meme_id_fkey"
            columns: ["audio_meme_id"]
            isOneToOne: false
            referencedRelation: "audio_memes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_channel_connection_id_fkey"
            columns: ["channel_connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_channel_connection_id_fkey"
            columns: ["channel_connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_capi_events: {
        Row: {
          action_source: string | null
          contact_id: string | null
          created_at: string | null
          custom_data: Json | null
          event_name: string
          event_source_url: string | null
          event_time: string | null
          id: string
          meta_response: Json | null
          pixel_id: string | null
          sent_to_meta: boolean | null
        }
        Insert: {
          action_source?: string | null
          contact_id?: string | null
          created_at?: string | null
          custom_data?: Json | null
          event_name: string
          event_source_url?: string | null
          event_time?: string | null
          id?: string
          meta_response?: Json | null
          pixel_id?: string | null
          sent_to_meta?: boolean | null
        }
        Update: {
          action_source?: string | null
          contact_id?: string | null
          created_at?: string | null
          custom_data?: Json | null
          event_name?: string
          event_source_url?: string | null
          event_time?: string | null
          id?: string
          meta_response?: Json | null
          pixel_id?: string | null
          sent_to_meta?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_capi_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_sessions: {
        Row: {
          created_at: string
          expires_at: string
          factor_id: string
          id: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          factor_id: string
          id?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          factor_id?: string
          id?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      multiplix_audience_members: {
        Row: {
          added_reason: string | null
          audience_id: string
          created_at: string
          id: string
          singu_company_id: string | null
          singu_contact_id: string | null
        }
        Insert: {
          added_reason?: string | null
          audience_id: string
          created_at?: string
          id?: string
          singu_company_id?: string | null
          singu_contact_id?: string | null
        }
        Update: {
          added_reason?: string | null
          audience_id?: string
          created_at?: string
          id?: string
          singu_company_id?: string | null
          singu_contact_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "multiplix_audience_members_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "multiplix_audiences"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplix_audiences: {
        Row: {
          cached_count: number | null
          created_at: string
          definition: Json
          id: string
          kind: string
          last_used_at: string | null
          name: string
          owner_id: string | null
          shared_with_roles: string[]
          updated_at: string
        }
        Insert: {
          cached_count?: number | null
          created_at?: string
          definition?: Json
          id?: string
          kind: string
          last_used_at?: string | null
          name: string
          owner_id?: string | null
          shared_with_roles?: string[]
          updated_at?: string
        }
        Update: {
          cached_count?: number | null
          created_at?: string
          definition?: Json
          id?: string
          kind?: string
          last_used_at?: string | null
          name?: string
          owner_id?: string | null
          shared_with_roles?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      multiplix_blocks: {
        Row: {
          asset_id: string | null
          block_order: number
          block_type: Database["public"]["Enums"]["multiplix_block_type"]
          content: Json
          content_hash: string | null
          content_version: number
          created_at: string
          dispatch_id: string
          id: string
          media_caption: string | null
          media_url: string | null
          personalization_mode: string | null
          template_text: string | null
          updated_at: string
          voice_id: string | null
          voice_script: string | null
        }
        Insert: {
          asset_id?: string | null
          block_order?: number
          block_type: Database["public"]["Enums"]["multiplix_block_type"]
          content?: Json
          content_hash?: string | null
          content_version?: number
          created_at?: string
          dispatch_id: string
          id?: string
          media_caption?: string | null
          media_url?: string | null
          personalization_mode?: string | null
          template_text?: string | null
          updated_at?: string
          voice_id?: string | null
          voice_script?: string | null
        }
        Update: {
          asset_id?: string | null
          block_order?: number
          block_type?: Database["public"]["Enums"]["multiplix_block_type"]
          content?: Json
          content_hash?: string | null
          content_version?: number
          created_at?: string
          dispatch_id?: string
          id?: string
          media_caption?: string | null
          media_url?: string | null
          personalization_mode?: string | null
          template_text?: string | null
          updated_at?: string
          voice_id?: string | null
          voice_script?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "multiplix_blocks_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "multiplix_dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplix_delivery_items: {
        Row: {
          attempt_count: number
          block_id: string
          created_at: string
          delivered_at: string | null
          dispatch_id: string
          dispatch_version: number
          error_class: string | null
          error_message: string | null
          external_id: string | null
          id: string
          idempotency_key: string | null
          lease_token: string | null
          lease_until: string | null
          next_attempt_at: string | null
          personalized_message: string | null
          provider_dispatch_started_at: string | null
          read_at: string | null
          recipient_id: string
          replied_at: string | null
          reply_attribution: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["multiplix_item_status"]
          updated_at: string
          voice_asset_id: string | null
          worker_id: string | null
        }
        Insert: {
          attempt_count?: number
          block_id: string
          created_at?: string
          delivered_at?: string | null
          dispatch_id: string
          dispatch_version: number
          error_class?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          lease_token?: string | null
          lease_until?: string | null
          next_attempt_at?: string | null
          personalized_message?: string | null
          provider_dispatch_started_at?: string | null
          read_at?: string | null
          recipient_id: string
          replied_at?: string | null
          reply_attribution?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["multiplix_item_status"]
          updated_at?: string
          voice_asset_id?: string | null
          worker_id?: string | null
        }
        Update: {
          attempt_count?: number
          block_id?: string
          created_at?: string
          delivered_at?: string | null
          dispatch_id?: string
          dispatch_version?: number
          error_class?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          lease_token?: string | null
          lease_until?: string | null
          next_attempt_at?: string | null
          personalized_message?: string | null
          provider_dispatch_started_at?: string | null
          read_at?: string | null
          recipient_id?: string
          replied_at?: string | null
          reply_attribution?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["multiplix_item_status"]
          updated_at?: string
          voice_asset_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "multiplix_delivery_items_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "multiplix_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplix_delivery_items_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "multiplix_dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplix_delivery_items_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "multiplix_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplix_delivery_items_voice_asset_id_fkey"
            columns: ["voice_asset_id"]
            isOneToOne: false
            referencedRelation: "multiplix_voice_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplix_dispatches: {
        Row: {
          audience_filters: Json
          audience_version: number
          business_hours_only: boolean
          client_request_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          delivered_count: number
          dispatch_version: number
          failed_count: number
          id: string
          media_type: string | null
          media_url: string | null
          message_template: string
          name: string
          origin: string | null
          outcome_unknown_count: number
          pause_reason: string | null
          paused_at: string | null
          schedule_timezone: string
          scheduled_at: string | null
          send_interval_max: number
          send_interval_min: number
          send_window_end: string | null
          send_window_start: string | null
          sent_count: number
          speed_profile: string
          started_at: string | null
          status: Database["public"]["Enums"]["multiplix_dispatch_status"]
          total_recipients: number
          typing_delay_max: number
          typing_delay_min: number
          updated_at: string
          whatsapp_connection_id: string | null
        }
        Insert: {
          audience_filters?: Json
          audience_version?: number
          business_hours_only?: boolean
          client_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          delivered_count?: number
          dispatch_version?: number
          failed_count?: number
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_template: string
          name: string
          origin?: string | null
          outcome_unknown_count?: number
          pause_reason?: string | null
          paused_at?: string | null
          schedule_timezone?: string
          scheduled_at?: string | null
          send_interval_max?: number
          send_interval_min?: number
          send_window_end?: string | null
          send_window_start?: string | null
          sent_count?: number
          speed_profile?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["multiplix_dispatch_status"]
          total_recipients?: number
          typing_delay_max?: number
          typing_delay_min?: number
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Update: {
          audience_filters?: Json
          audience_version?: number
          business_hours_only?: boolean
          client_request_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          delivered_count?: number
          dispatch_version?: number
          failed_count?: number
          id?: string
          media_type?: string | null
          media_url?: string | null
          message_template?: string
          name?: string
          origin?: string | null
          outcome_unknown_count?: number
          pause_reason?: string | null
          paused_at?: string | null
          schedule_timezone?: string
          scheduled_at?: string | null
          send_interval_max?: number
          send_interval_min?: number
          send_window_end?: string | null
          send_window_start?: string | null
          sent_count?: number
          speed_profile?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["multiplix_dispatch_status"]
          total_recipients?: number
          typing_delay_max?: number
          typing_delay_min?: number
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "multiplix_dispatches_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplix_dispatches_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplix_dispatches_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplix_dispatches_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplix_events: {
        Row: {
          correlation_id: string | null
          created_at: string
          dispatch_id: string
          id: string
          item_id: string | null
          kind: string
          payload: Json | null
          recipient_id: string | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          dispatch_id: string
          id?: string
          item_id?: string | null
          kind: string
          payload?: Json | null
          recipient_id?: string | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          dispatch_id?: string
          id?: string
          item_id?: string | null
          kind?: string
          payload?: Json | null
          recipient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "multiplix_events_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "multiplix_dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multiplix_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "multiplix_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplix_recipients: {
        Row: {
          attempt_count: number
          audience_version: number | null
          company_id: string
          company_name_snapshot: string | null
          created_at: string
          delivered_at: string | null
          delivery_attempt_count: number
          delivery_claim_expires_at: string | null
          delivery_claim_token: string | null
          delivery_claimed_at: string | null
          delivery_claimed_by: string | null
          destino_e164: string | null
          destino_origem: string | null
          dispatch_id: string
          eligibility: Database["public"]["Enums"]["multiplix_eligibility"]
          eligibility_reason: string | null
          error_message: string | null
          external_id: string | null
          id: string
          inclusion_reason: string | null
          personalized_message: string | null
          provider_dispatch_started_at: string | null
          retry_after: string | null
          sent_at: string | null
          singu_contact_id: string | null
          status: Database["public"]["Enums"]["multiplix_recipient_status"]
          updated_at: string
          variables_snapshot: Json | null
        }
        Insert: {
          attempt_count?: number
          audience_version?: number | null
          company_id: string
          company_name_snapshot?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_attempt_count?: number
          delivery_claim_expires_at?: string | null
          delivery_claim_token?: string | null
          delivery_claimed_at?: string | null
          delivery_claimed_by?: string | null
          destino_e164?: string | null
          destino_origem?: string | null
          dispatch_id: string
          eligibility?: Database["public"]["Enums"]["multiplix_eligibility"]
          eligibility_reason?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          inclusion_reason?: string | null
          personalized_message?: string | null
          provider_dispatch_started_at?: string | null
          retry_after?: string | null
          sent_at?: string | null
          singu_contact_id?: string | null
          status?: Database["public"]["Enums"]["multiplix_recipient_status"]
          updated_at?: string
          variables_snapshot?: Json | null
        }
        Update: {
          attempt_count?: number
          audience_version?: number | null
          company_id?: string
          company_name_snapshot?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_attempt_count?: number
          delivery_claim_expires_at?: string | null
          delivery_claim_token?: string | null
          delivery_claimed_at?: string | null
          delivery_claimed_by?: string | null
          destino_e164?: string | null
          destino_origem?: string | null
          dispatch_id?: string
          eligibility?: Database["public"]["Enums"]["multiplix_eligibility"]
          eligibility_reason?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          inclusion_reason?: string | null
          personalized_message?: string | null
          provider_dispatch_started_at?: string | null
          retry_after?: string | null
          sent_at?: string | null
          singu_contact_id?: string | null
          status?: Database["public"]["Enums"]["multiplix_recipient_status"]
          updated_at?: string
          variables_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "multiplix_recipients_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "multiplix_dispatches"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplix_voice_assets: {
        Row: {
          caminho: string
          caracteres: number | null
          created_at: string
          created_by: string | null
          duracao_ms: number | null
          hash: string
          id: string
          invalidated_at: string | null
          modelo: string | null
          voice_id: string
        }
        Insert: {
          caminho: string
          caracteres?: number | null
          created_at?: string
          created_by?: string | null
          duracao_ms?: number | null
          hash: string
          id?: string
          invalidated_at?: string | null
          modelo?: string | null
          voice_id: string
        }
        Update: {
          caminho?: string
          caracteres?: number | null
          created_at?: string
          created_by?: string | null
          duracao_ms?: number | null
          hash?: string
          id?: string
          invalidated_at?: string | null
          modelo?: string | null
          voice_id?: string
        }
        Relationships: []
      }
      multiplix_voice_grants: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          origem: string | null
          perfis: string[] | null
          revoked_at: string | null
          roles: Database["public"]["Enums"]["app_role"][] | null
          titular: string
          voice_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          origem?: string | null
          perfis?: string[] | null
          revoked_at?: string | null
          roles?: Database["public"]["Enums"]["app_role"][] | null
          titular: string
          voice_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          origem?: string | null
          perfis?: string[] | null
          revoked_at?: string | null
          roles?: Database["public"]["Enums"]["app_role"][] | null
          titular?: string
          voice_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          dedupe_key: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      nps_surveys: {
        Row: {
          agent_id: string | null
          contact_id: string
          created_at: string
          feedback: string | null
          id: string
          score: number
          survey_type: string
        }
        Insert: {
          agent_id?: string | null
          contact_id: string
          created_at?: string
          feedback?: string | null
          id?: string
          score: number
          survey_type?: string
        }
        Update: {
          agent_id?: string | null
          contact_id?: string
          created_at?: string
          feedback?: string | null
          id?: string
          score?: number
          survey_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_surveys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_surveys_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_surveys_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      number_reputation: {
        Row: {
          complaints_count: number
          created_at: string
          daily_limit: number | null
          failures_today: number
          health_score: number
          id: string
          last_reset_at: string | null
          messages_sent_today: number
          updated_at: string
          warmup_day: number | null
          warmup_status: string
          whatsapp_connection_id: string
        }
        Insert: {
          complaints_count?: number
          created_at?: string
          daily_limit?: number | null
          failures_today?: number
          health_score?: number
          id?: string
          last_reset_at?: string | null
          messages_sent_today?: number
          updated_at?: string
          warmup_day?: number | null
          warmup_status?: string
          whatsapp_connection_id: string
        }
        Update: {
          complaints_count?: number
          created_at?: string
          daily_limit?: number | null
          failures_today?: number
          health_score?: number
          id?: string
          last_reset_at?: string | null
          messages_sent_today?: number
          updated_at?: string
          warmup_day?: number | null
          warmup_status?: string
          whatsapp_connection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "number_reputation_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "number_reputation_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "number_reputation_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "number_reputation_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      passkey_credentials: {
        Row: {
          backed_up: boolean | null
          counter: number
          created_at: string
          credential_id: string
          device_type: string | null
          friendly_name: string | null
          id: string
          last_used_at: string | null
          public_key: string
          transports: string[] | null
          user_id: string
        }
        Insert: {
          backed_up?: boolean | null
          counter?: number
          created_at?: string
          credential_id: string
          device_type?: string | null
          friendly_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: string[] | null
          user_id: string
        }
        Update: {
          backed_up?: boolean | null
          counter?: number
          created_at?: string
          credential_id?: string
          device_type?: string | null
          friendly_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      password_reset_requests: {
        Row: {
          created_at: string
          email: string
          id: string
          ip_address: string | null
          reason: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          reason?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          reason?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_links: {
        Row: {
          amount: number
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deal_id: string | null
          description: string | null
          expires_at: string | null
          external_id: string | null
          id: string
          paid_at: string | null
          payment_method: string | null
          payment_url: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deal_id?: string | null
          description?: string | null
          expires_at?: string | null
          external_id?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_url?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deal_id?: string | null
          description?: string | null
          expires_at?: string | null
          external_id?: string | null
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_url?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "sales_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_snapshots: {
        Row: {
          created_at: string
          dom_nodes: number | null
          dom_ready: number | null
          fcp: number | null
          id: string
          memory_total: number | null
          memory_used: number | null
          network_type: string | null
          overall_score: number | null
          page_load: number | null
          profile_id: string
          rtt: number | null
          ttfb: number | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          dom_nodes?: number | null
          dom_ready?: number | null
          fcp?: number | null
          id?: string
          memory_total?: number | null
          memory_used?: number | null
          network_type?: string | null
          overall_score?: number | null
          page_load?: number | null
          profile_id: string
          rtt?: number | null
          ttfb?: number | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          dom_nodes?: number | null
          dom_ready?: number | null
          fcp?: number | null
          id?: string
          memory_total?: number | null
          memory_used?: number | null
          network_type?: string | null
          overall_score?: number | null
          page_load?: number | null
          profile_id?: string
          rtt?: number | null
          ttfb?: number | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_snapshots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_snapshots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      pinned_conversations: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          pinned_by: string
          position: number
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          pinned_by: string
          position?: number
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          pinned_by?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "pinned_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_conversations_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_conversations_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      playbooks: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          steps: Json
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playbooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          price: number
          retailer_id: string | null
          sku: string | null
          stock_quantity: number | null
          updated_at: string
          whatsapp_connection_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          price: number
          retailer_id?: string | null
          sku?: string | null
          stock_quantity?: number | null
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          price?: number
          retailer_id?: string | null
          sku?: string | null
          stock_quantity?: number | null
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          access_level: string | null
          avatar_url: string | null
          birthday: string | null
          can_download: boolean
          created_at: string
          department: string | null
          department_id: string | null
          email: string | null
          id: string
          is_active: boolean | null
          job_title: string | null
          max_chats: number | null
          name: string
          nickname: string | null
          permissions: Json | null
          phone: string | null
          role: string | null
          session_invalidated_at: string | null
          signature: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_level?: string | null
          avatar_url?: string | null
          birthday?: string | null
          can_download?: boolean
          created_at?: string
          department?: string | null
          department_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          job_title?: string | null
          max_chats?: number | null
          name: string
          nickname?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: string | null
          session_invalidated_at?: string | null
          signature?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_level?: string | null
          avatar_url?: string | null
          birthday?: string | null
          can_download?: boolean
          created_at?: string
          department?: string | null
          department_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          job_title?: string | null
          max_chats?: number | null
          name?: string
          nickname?: string | null
          permissions?: Json | null
          phone?: string | null
          role?: string | null
          session_invalidated_at?: string | null
          signature?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      query_telemetry: {
        Row: {
          count_mode: string | null
          created_at: string
          duration_ms: number
          error_message: string | null
          id: string
          operation: string
          query_limit: number | null
          query_offset: number | null
          record_count: number | null
          rpc_name: string | null
          severity: string
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          count_mode?: string | null
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          id?: string
          operation?: string
          query_limit?: number | null
          query_offset?: number | null
          record_count?: number | null
          rpc_name?: string | null
          severity?: string
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          count_mode?: string | null
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          id?: string
          operation?: string
          query_limit?: number | null
          query_offset?: number | null
          record_count?: number | null
          rpc_name?: string | null
          severity?: string
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      queue_goals: {
        Row: {
          alerts_enabled: boolean | null
          created_at: string
          id: string
          max_avg_wait_minutes: number | null
          max_messages_pending: number | null
          max_waiting_contacts: number | null
          min_assignment_rate: number | null
          queue_id: string
          updated_at: string
        }
        Insert: {
          alerts_enabled?: boolean | null
          created_at?: string
          id?: string
          max_avg_wait_minutes?: number | null
          max_messages_pending?: number | null
          max_waiting_contacts?: number | null
          min_assignment_rate?: number | null
          queue_id: string
          updated_at?: string
        }
        Update: {
          alerts_enabled?: boolean | null
          created_at?: string
          id?: string
          max_avg_wait_minutes?: number | null
          max_messages_pending?: number | null
          max_waiting_contacts?: number | null
          min_assignment_rate?: number | null
          queue_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_goals_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: true
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_members: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          profile_id: string
          queue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          profile_id: string
          queue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          profile_id?: string
          queue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_members_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_positions: {
        Row: {
          contact_id: string
          created_at: string | null
          entered_at: string | null
          estimated_wait_minutes: number | null
          id: string
          notified: boolean | null
          position: number
          queue_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          entered_at?: string | null
          estimated_wait_minutes?: number | null
          id?: string
          notified?: boolean | null
          position?: number
          queue_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          entered_at?: string | null
          estimated_wait_minutes?: number | null
          id?: string
          notified?: boolean | null
          position?: number
          queue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_positions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_positions_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      queue_skill_requirements: {
        Row: {
          created_at: string | null
          id: string
          min_level: number | null
          queue_id: string
          skill_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          min_level?: number | null
          queue_id: string
          skill_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          min_level?: number | null
          queue_id?: string
          skill_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "queue_skill_requirements_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      queues: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          max_wait_time_minutes: number | null
          name: string
          priority: number | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_wait_time_minutes?: number | null
          name: string
          priority?: number | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_wait_time_minutes?: number | null
          name?: string
          priority?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_configs: {
        Row: {
          block_duration_minutes: number
          created_at: string
          endpoint_pattern: string
          id: string
          is_active: boolean | null
          max_requests: number
          name: string
          updated_at: string
          window_seconds: number
        }
        Insert: {
          block_duration_minutes?: number
          created_at?: string
          endpoint_pattern: string
          id?: string
          is_active?: boolean | null
          max_requests?: number
          name: string
          updated_at?: string
          window_seconds?: number
        }
        Update: {
          block_duration_minutes?: number
          created_at?: string
          endpoint_pattern?: string
          id?: string
          is_active?: boolean | null
          max_requests?: number
          name?: string
          updated_at?: string
          window_seconds?: number
        }
        Relationships: []
      }
      rate_limit_logs: {
        Row: {
          blocked: boolean | null
          city: string | null
          country: string | null
          created_at: string
          endpoint: string
          id: string
          ip_address: string
          request_count: number
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          blocked?: boolean | null
          city?: string | null
          country?: string | null
          created_at?: string
          endpoint: string
          id?: string
          ip_address: string
          request_count?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          blocked?: boolean | null
          city?: string | null
          country?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          ip_address?: string
          request_count?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          contact_id: string | null
          created_at: string
          description: string | null
          id: string
          is_dismissed: boolean
          migrated_task_id: string | null
          notified_at: string | null
          profile_id: string
          remind_at: string
          title: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_dismissed?: boolean
          migrated_task_id?: string | null
          notified_at?: string | null
          profile_id: string
          remind_at: string
          title: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_dismissed?: boolean
          migrated_task_id?: string | null
          notified_at?: string | null
          profile_id?: string
          remind_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_migrated_task_id_fkey"
            columns: ["migrated_task_id"]
            isOneToOne: false
            referencedRelation: "conversation_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_deals: {
        Row: {
          assigned_to: string | null
          contact_id: string | null
          created_at: string | null
          currency: string | null
          expected_close_date: string | null
          id: string
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
          priority: string | null
          stage_id: string | null
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          value: number | null
          won_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          expected_close_date?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          priority?: string | null
          stage_id?: string | null
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          value?: number | null
          won_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string | null
          currency?: string | null
          expected_close_date?: string | null
          id?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          priority?: string | null
          stage_id?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          value?: number | null
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_deals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_deals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "sales_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_pipeline_stages: {
        Row: {
          color: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          position: number
          updated_at: string | null
        }
        Insert: {
          color?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          position?: number
          updated_at?: string | null
        }
        Update: {
          color?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          position?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      saved_filters: {
        Row: {
          created_at: string
          entity_type: string
          filters: Json
          id: string
          is_default: boolean | null
          is_shared: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          filters?: Json
          id?: string
          is_default?: boolean | null
          is_shared?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          filters?: Json
          id?: string
          is_default?: boolean | null
          is_shared?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_messages: {
        Row: {
          contact_id: string
          content: string
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          media_url: string | null
          message_type: string
          scheduled_at: string
          sent_at: string | null
          status: string
          updated_at: string
          whatsapp_connection_id: string | null
        }
        Insert: {
          contact_id: string
          content: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          media_url?: string | null
          message_type?: string
          scheduled_at: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Update: {
          contact_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          media_url?: string | null
          message_type?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_report_configs: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          frequency: string
          id: string
          is_active: boolean
          last_sent_at: string | null
          name: string
          next_send_at: string | null
          recipients: string[]
          report_type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          name: string
          next_send_at?: string | null
          recipients?: string[]
          report_type?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          name?: string
          next_send_at?: string | null
          recipients?: string[]
          report_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_report_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_report_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          created_at: string
          created_by: string | null
          format: string
          frequency: string
          id: string
          is_active: boolean | null
          last_sent_at: string | null
          name: string
          next_send_at: string | null
          recipients: string[]
          report_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          format?: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          name: string
          next_send_at?: string | null
          recipients?: string[]
          report_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          format?: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_sent_at?: string | null
          name?: string
          next_send_at?: string | null
          recipients?: string[]
          report_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      security_alerts: {
        Row: {
          alert_type: string
          created_at: string
          description: string | null
          id: string
          ip_address: string | null
          is_resolved: boolean | null
          metadata: Json | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          title: string
          user_id: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: string | null
          is_resolved?: boolean | null
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title: string
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: string | null
          is_resolved?: boolean | null
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sicoob_contact_mapping: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          sicoob_singular_id: string
          sicoob_user_id: string
          sicoob_vendedor_id: string
          zappweb_agent_id: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          sicoob_singular_id: string
          sicoob_user_id: string
          sicoob_vendedor_id: string
          zappweb_agent_id?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          sicoob_singular_id?: string
          sicoob_user_id?: string
          sicoob_vendedor_id?: string
          zappweb_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sicoob_contact_mapping_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sicoob_contact_mapping_zappweb_agent_id_fkey"
            columns: ["zappweb_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sicoob_contact_mapping_zappweb_agent_id_fkey"
            columns: ["zappweb_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_configurations: {
        Row: {
          created_at: string
          first_response_minutes: number
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          priority: string
          resolution_minutes: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_response_minutes?: number
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          priority?: string
          resolution_minutes?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_response_minutes?: number
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          priority?: string
          resolution_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      sla_rules: {
        Row: {
          agent_id: string | null
          company: string | null
          contact_id: string | null
          contact_type: string | null
          created_at: string
          first_response_minutes: number
          id: string
          is_active: boolean
          job_title: string | null
          metadata: Json | null
          name: string
          priority: number
          queue_id: string | null
          resolution_minutes: number
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          company?: string | null
          contact_id?: string | null
          contact_type?: string | null
          created_at?: string
          first_response_minutes?: number
          id?: string
          is_active?: boolean
          job_title?: string | null
          metadata?: Json | null
          name: string
          priority?: number
          queue_id?: string | null
          resolution_minutes?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          company?: string | null
          contact_id?: string | null
          contact_type?: string | null
          created_at?: string
          first_response_minutes?: number
          id?: string
          is_active?: boolean
          job_title?: string | null
          metadata?: Json | null
          name?: string
          priority?: number
          queue_id?: string | null
          resolution_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_rules_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_rules_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      stickers: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          image_url: string
          is_favorite: boolean | null
          name: string | null
          owner_id: string | null
          updated_at: string | null
          uploaded_by: string | null
          use_count: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          image_url: string
          is_favorite?: boolean | null
          name?: string | null
          owner_id?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          use_count?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          image_url?: string
          is_favorite?: boolean | null
          name?: string | null
          owner_id?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
          use_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stickers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stickers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_alerts: {
        Row: {
          campaign_id: string | null
          id: string
          kind: string
          opened_at: string
          payload: Json
          resolved_at: string | null
        }
        Insert: {
          campaign_id?: string | null
          id?: string
          kind: string
          opened_at?: string
          payload?: Json
          resolved_at?: string | null
        }
        Update: {
          campaign_id?: string | null
          id?: string
          kind?: string
          opened_at?: string
          payload?: Json
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talkx_alerts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "talkx_alerts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_alerts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_blacklist: {
        Row: {
          blocked_by: string | null
          campaign_id: string | null
          contact_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          origin: string
          phone: string | null
          reason: string | null
          reason_code:
            | Database["public"]["Enums"]["talkx_blacklist_reason"]
            | null
          removed_at: string | null
          removed_by: string | null
          source_message_id: string | null
        }
        Insert: {
          blocked_by?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          origin?: string
          phone?: string | null
          reason?: string | null
          reason_code?:
            | Database["public"]["Enums"]["talkx_blacklist_reason"]
            | null
          removed_at?: string | null
          removed_by?: string | null
          source_message_id?: string | null
        }
        Update: {
          blocked_by?: string | null
          campaign_id?: string | null
          contact_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          origin?: string
          phone?: string | null
          reason?: string | null
          reason_code?:
            | Database["public"]["Enums"]["talkx_blacklist_reason"]
            | null
          removed_at?: string | null
          removed_by?: string | null
          source_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talkx_blacklist_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_blacklist_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_blacklist_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "talkx_blacklist_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_blacklist_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_blacklist_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_blacklist_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_blacklist_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_blacklist_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_campaign_events: {
        Row: {
          actor_id: string | null
          campaign_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          message: string | null
        }
        Insert: {
          actor_id?: string | null
          campaign_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          message?: string | null
        }
        Update: {
          actor_id?: string | null
          campaign_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talkx_campaign_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaign_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "talkx_campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_campaign_segments: {
        Row: {
          campaign_id: string
          created_at: string
          paused_at: string | null
          position: number
          segment_id: string
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          paused_at?: string | null
          position: number
          segment_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          paused_at?: string | null
          position?: number
          segment_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talkx_campaign_segments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "talkx_campaign_segments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaign_segments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaign_segments_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "talkx_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_campaigns: {
        Row: {
          audience_filters: Json
          audience_snapshot_at: string | null
          audience_source: string
          business_hours_only: boolean
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          confirm_consent: boolean
          consent_confirmed_at: string | null
          consent_confirmed_by: string | null
          created_at: string
          created_by: string | null
          delivered_count: number
          description: string | null
          draft_creation_key: string | null
          draft_step: number | null
          failed_count: number
          id: string
          investment: number | null
          launched_at: string | null
          launched_by: string | null
          legal_basis: string | null
          max_per_minute: number | null
          media_type: string | null
          media_url: string | null
          message_template: string
          name: string
          objective: string
          outcome_unknown_count: number
          owner: string | null
          pause_reason: string | null
          paused_at: string | null
          paused_by: string | null
          read_count: number
          replied_count: number
          respect_suppression: boolean
          responsible_id: string | null
          revision: number
          schedule_timezone: string
          scheduled_at: string | null
          segment_id: string | null
          send_interval_max: number
          send_interval_min: number
          send_window_end: string | null
          send_window_start: string | null
          sent_count: number
          skipped_count: number
          speed_profile: string
          started_at: string | null
          status: string
          template_id: string | null
          template_version_id: string | null
          total_recipients: number
          typing_delay_max: number
          typing_delay_min: number
          updated_at: string
          variables_config: Json
          whatsapp_connection_id: string | null
          worker_id: string | null
          worker_lease_expires_at: string | null
        }
        Insert: {
          audience_filters?: Json
          audience_snapshot_at?: string | null
          audience_source?: string
          business_hours_only?: boolean
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          confirm_consent?: boolean
          consent_confirmed_at?: string | null
          consent_confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
          draft_creation_key?: string | null
          draft_step?: number | null
          failed_count?: number
          id?: string
          investment?: number | null
          launched_at?: string | null
          launched_by?: string | null
          legal_basis?: string | null
          max_per_minute?: number | null
          media_type?: string | null
          media_url?: string | null
          message_template: string
          name: string
          objective?: string
          outcome_unknown_count?: number
          owner?: string | null
          pause_reason?: string | null
          paused_at?: string | null
          paused_by?: string | null
          read_count?: number
          replied_count?: number
          respect_suppression?: boolean
          responsible_id?: string | null
          revision?: number
          schedule_timezone?: string
          scheduled_at?: string | null
          segment_id?: string | null
          send_interval_max?: number
          send_interval_min?: number
          send_window_end?: string | null
          send_window_start?: string | null
          sent_count?: number
          skipped_count?: number
          speed_profile?: string
          started_at?: string | null
          status?: string
          template_id?: string | null
          template_version_id?: string | null
          total_recipients?: number
          typing_delay_max?: number
          typing_delay_min?: number
          updated_at?: string
          variables_config?: Json
          whatsapp_connection_id?: string | null
          worker_id?: string | null
          worker_lease_expires_at?: string | null
        }
        Update: {
          audience_filters?: Json
          audience_snapshot_at?: string | null
          audience_source?: string
          business_hours_only?: boolean
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          confirm_consent?: boolean
          consent_confirmed_at?: string | null
          consent_confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          delivered_count?: number
          description?: string | null
          draft_creation_key?: string | null
          draft_step?: number | null
          failed_count?: number
          id?: string
          investment?: number | null
          launched_at?: string | null
          launched_by?: string | null
          legal_basis?: string | null
          max_per_minute?: number | null
          media_type?: string | null
          media_url?: string | null
          message_template?: string
          name?: string
          objective?: string
          outcome_unknown_count?: number
          owner?: string | null
          pause_reason?: string | null
          paused_at?: string | null
          paused_by?: string | null
          read_count?: number
          replied_count?: number
          respect_suppression?: boolean
          responsible_id?: string | null
          revision?: number
          schedule_timezone?: string
          scheduled_at?: string | null
          segment_id?: string | null
          send_interval_max?: number
          send_interval_min?: number
          send_window_end?: string | null
          send_window_start?: string | null
          sent_count?: number
          skipped_count?: number
          speed_profile?: string
          started_at?: string | null
          status?: string
          template_id?: string | null
          template_version_id?: string | null
          total_recipients?: number
          typing_delay_max?: number
          typing_delay_min?: number
          updated_at?: string
          variables_config?: Json
          whatsapp_connection_id?: string | null
          worker_id?: string | null
          worker_lease_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talkx_campaigns_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_consent_confirmed_by_fkey"
            columns: ["consent_confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_consent_confirmed_by_fkey"
            columns: ["consent_confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_launched_by_fkey"
            columns: ["launched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_launched_by_fkey"
            columns: ["launched_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_paused_by_fkey"
            columns: ["paused_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_paused_by_fkey"
            columns: ["paused_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "talkx_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "talkx_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "talkx_template_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_conversions: {
        Row: {
          attribution: Json | null
          campaign_id: string
          created_at: string
          currency: string
          external_ref: string | null
          id: string
          link_id: string | null
          occurred_at: string
          recipient_id: string | null
          source: string | null
          value: number | null
        }
        Insert: {
          attribution?: Json | null
          campaign_id: string
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          link_id?: string | null
          occurred_at?: string
          recipient_id?: string | null
          source?: string | null
          value?: number | null
        }
        Update: {
          attribution?: Json | null
          campaign_id?: string
          created_at?: string
          currency?: string
          external_ref?: string | null
          id?: string
          link_id?: string | null
          occurred_at?: string
          recipient_id?: string | null
          source?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "talkx_conversions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "talkx_conversions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_conversions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_conversions_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "talkx_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_conversions_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "talkx_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_delivery_log: {
        Row: {
          attempt: number
          campaign_id: string | null
          created_at: string
          duration_ms: number | null
          error_code: string | null
          http_status: number | null
          id: string
          outcome: string
          recipient_id: string | null
          stage: string
          worker_id: string | null
        }
        Insert: {
          attempt?: number
          campaign_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          http_status?: number | null
          id?: string
          outcome: string
          recipient_id?: string | null
          stage: string
          worker_id?: string | null
        }
        Update: {
          attempt?: number
          campaign_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          http_status?: number | null
          id?: string
          outcome?: string
          recipient_id?: string | null
          stage?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talkx_delivery_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "talkx_delivery_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_delivery_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_delivery_log_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "talkx_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_link_clicks: {
        Row: {
          clicked_at: string
          id: string
          ip_hash: string | null
          link_id: string
          recipient_id: string | null
          ua: string | null
        }
        Insert: {
          clicked_at?: string
          id?: string
          ip_hash?: string | null
          link_id: string
          recipient_id?: string | null
          ua?: string | null
        }
        Update: {
          clicked_at?: string
          id?: string
          ip_hash?: string | null
          link_id?: string
          recipient_id?: string | null
          ua?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talkx_link_clicks_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "talkx_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_link_clicks_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "talkx_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_links: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string
          slug: string
          target_url: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          slug: string
          target_url: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          slug?: string
          target_url?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talkx_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "talkx_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_optout_keywords: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          keyword: string
          match_mode: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          keyword: string
          match_mode?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          keyword?: string
          match_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "talkx_optout_keywords_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_optout_keywords_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_recipients: {
        Row: {
          attempt_count: number
          campaign_id: string
          click_count: number
          clicked_at: string | null
          contact_id: string
          created_at: string
          delivered_at: string | null
          delivery_attempt_count: number
          delivery_claim_expires_at: string | null
          delivery_claim_token: string | null
          delivery_claimed_at: string | null
          delivery_claimed_by: string | null
          delivery_last_claim_token: string | null
          error_message: string | null
          external_id: string | null
          id: string
          manual_retry_count: number
          media_type_snapshot: string | null
          media_url_snapshot: string | null
          message_snapshot_at: string | null
          personalized_message: string | null
          provider_dispatch_started_at: string | null
          read_at: string | null
          replied_at: string | null
          reply_message_id: string | null
          retry_after: string | null
          segment_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
          variant_id: string | null
          variant_id_snapshot: string | null
        }
        Insert: {
          attempt_count?: number
          campaign_id: string
          click_count?: number
          clicked_at?: string | null
          contact_id: string
          created_at?: string
          delivered_at?: string | null
          delivery_attempt_count?: number
          delivery_claim_expires_at?: string | null
          delivery_claim_token?: string | null
          delivery_claimed_at?: string | null
          delivery_claimed_by?: string | null
          delivery_last_claim_token?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          manual_retry_count?: number
          media_type_snapshot?: string | null
          media_url_snapshot?: string | null
          message_snapshot_at?: string | null
          personalized_message?: string | null
          provider_dispatch_started_at?: string | null
          read_at?: string | null
          replied_at?: string | null
          reply_message_id?: string | null
          retry_after?: string | null
          segment_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          variant_id?: string | null
          variant_id_snapshot?: string | null
        }
        Update: {
          attempt_count?: number
          campaign_id?: string
          click_count?: number
          clicked_at?: string | null
          contact_id?: string
          created_at?: string
          delivered_at?: string | null
          delivery_attempt_count?: number
          delivery_claim_expires_at?: string | null
          delivery_claim_token?: string | null
          delivery_claimed_at?: string | null
          delivery_claimed_by?: string | null
          delivery_last_claim_token?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          manual_retry_count?: number
          media_type_snapshot?: string | null
          media_url_snapshot?: string | null
          message_snapshot_at?: string | null
          personalized_message?: string | null
          provider_dispatch_started_at?: string | null
          read_at?: string | null
          replied_at?: string | null
          reply_message_id?: string | null
          retry_after?: string | null
          segment_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
          variant_id?: string | null
          variant_id_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talkx_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "talkx_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_recipients_reply_message_id_fkey"
            columns: ["reply_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_recipients_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "talkx_template_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_segments: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          estimated_count: number
          id: string
          is_favorite: boolean
          last_used_at: string | null
          name: string
          origin: string
          rules: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_count?: number
          id?: string
          is_favorite?: boolean
          last_used_at?: string | null
          name: string
          origin?: string
          rules?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_count?: number
          id?: string
          is_favorite?: boolean
          last_used_at?: string | null
          name?: string
          origin?: string
          rules?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talkx_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      talkx_template_variants: {
        Row: {
          content: string
          created_at: string
          id: string
          label: string
          media_type: string | null
          media_url: string | null
          template_id: string
          weight: number
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          label: string
          media_type?: string | null
          media_url?: string | null
          template_id: string
          weight?: number
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          label?: string
          media_type?: string | null
          media_url?: string | null
          template_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "talkx_template_variants_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "talkx_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_template_versions: {
        Row: {
          category: string
          content: string
          created_at: string
          custom_variables: string[]
          description: string | null
          id: string
          media_type: string | null
          media_url: string | null
          name: string
          saved_by: string | null
          status: string
          tags: string[]
          template_id: string
          version_number: number
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          custom_variables?: string[]
          description?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          name: string
          saved_by?: string | null
          status?: string
          tags?: string[]
          template_id: string
          version_number: number
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          custom_variables?: string[]
          description?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          name?: string
          saved_by?: string | null
          status?: string
          tags?: string[]
          template_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "talkx_template_versions_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_template_versions_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "talkx_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_templates: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          current_version_id: string | null
          custom_variables: string[]
          description: string | null
          id: string
          media_type: string | null
          media_url: string | null
          name: string
          status: string
          tags: string[]
          updated_at: string
          use_count: number
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          custom_variables?: string[]
          description?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          name: string
          status?: string
          tags?: string[]
          updated_at?: string
          use_count?: number
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          custom_variables?: string[]
          description?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          name?: string
          status?: string
          tags?: string[]
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "talkx_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_templates_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "talkx_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_test_send_claims: {
        Row: {
          created_at: string
          id: string
          provider_message_id: string | null
          request_key: string
          sent_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          provider_message_id?: string | null
          request_key: string
          sent_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          provider_message_id?: string | null
          request_key?: string
          sent_at?: string | null
        }
        Relationships: []
      }
      team_conversation_members: {
        Row: {
          conversation_id: string
          id: string
          is_archived: boolean
          is_muted: boolean | null
          is_pinned: boolean
          joined_at: string
          last_read_at: string | null
          member_role: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_archived?: boolean
          is_muted?: boolean | null
          is_pinned?: boolean
          joined_at?: string
          last_read_at?: string | null
          member_role?: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_archived?: boolean
          is_muted?: boolean | null
          is_pinned?: boolean
          joined_at?: string
          last_read_at?: string | null
          member_role?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "team_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_conversation_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_conversation_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_conversations: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          direct_member_a: string | null
          direct_member_b: string | null
          id: string
          metadata: Json
          name: string | null
          type: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          direct_member_a?: string | null
          direct_member_b?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          direct_member_a?: string | null
          direct_member_b?: string | null
          id?: string
          metadata?: Json
          name?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_conversations_direct_member_a_fkey"
            columns: ["direct_member_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_conversations_direct_member_a_fkey"
            columns: ["direct_member_a"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_conversations_direct_member_b_fkey"
            columns: ["direct_member_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_conversations_direct_member_b_fkey"
            columns: ["direct_member_b"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_message_reactions: {
        Row: {
          conversation_id: string
          created_at: string
          emoji: string
          id: string
          message_id: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_message_reactions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "team_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "team_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_message_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_message_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_message_receipts: {
        Row: {
          conversation_id: string
          delivered_at: string | null
          id: string
          message_id: string
          profile_id: string
          read_at: string | null
          status: string
        }
        Insert: {
          conversation_id: string
          delivered_at?: string | null
          id?: string
          message_id: string
          profile_id: string
          read_at?: string | null
          status?: string
        }
        Update: {
          conversation_id?: string
          delivered_at?: string | null
          id?: string
          message_id?: string
          profile_id?: string
          read_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_message_receipts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "team_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_message_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "team_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_message_receipts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_message_receipts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      team_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_edited: boolean
          media_bucket: string | null
          media_path: string | null
          media_type: string | null
          media_url: string | null
          message_type: string
          metadata: Json | null
          reply_to_id: string | null
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_edited?: boolean
          media_bucket?: string | null
          media_path?: string | null
          media_type?: string | null
          media_url?: string | null
          message_type?: string
          metadata?: Json | null
          reply_to_id?: string | null
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_edited?: boolean
          media_bucket?: string | null
          media_path?: string | null
          media_type?: string | null
          media_url?: string | null
          message_type?: string
          metadata?: Json | null
          reply_to_id?: string | null
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "team_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "team_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          feedback: string | null
          id: string
          messages: Json | null
          profile_id: string
          scenario_name: string
          scenario_type: string | null
          score: number | null
          started_at: string
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          messages?: Json | null
          profile_id: string
          scenario_name: string
          scenario_type?: string | null
          score?: number | null
          started_at?: string
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          feedback?: string | null
          id?: string
          messages?: Json | null
          profile_id?: string
          scenario_name?: string
          scenario_type?: string | null
          score?: number | null
          started_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_devices: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device_fingerprint: string
          device_name: string | null
          first_seen_at: string
          id: string
          ip_address: string | null
          is_trusted: boolean | null
          last_seen_at: string
          os: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_fingerprint: string
          device_name?: string | null
          first_seen_at?: string
          id?: string
          ip_address?: string | null
          is_trusted?: boolean | null
          last_seen_at?: string
          os?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_fingerprint?: string
          device_name?: string | null
          first_seen_at?: string
          id?: string
          ip_address?: string | null
          is_trusted?: boolean | null
          last_seen_at?: string
          os?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_service_accounts: {
        Row: {
          account_email: string
          created_at: string
          id: string
          is_active: boolean
          service_type: Database["public"]["Enums"]["service_account_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email: string
          created_at?: string
          id?: string
          is_active?: boolean
          service_type: Database["public"]["Enums"]["service_account_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string
          created_at?: string
          id?: string
          is_active?: boolean
          service_type?: Database["public"]["Enums"]["service_account_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          device_id: string | null
          ended_at: string | null
          expires_at: string
          id: string
          ip_address: string | null
          is_active: boolean | null
          last_activity_at: string
          started_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          device_id?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_activity_at?: string
          started_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          device_id?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_activity_at?: string
          started_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "user_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          auto_assignment_enabled: boolean | null
          auto_assignment_method: string | null
          auto_transcription_enabled: boolean | null
          away_message: string | null
          browser_notifications_enabled: boolean | null
          business_hours_enabled: boolean | null
          business_hours_end: string | null
          business_hours_start: string | null
          closing_message: string | null
          compact_mode: boolean | null
          created_at: string
          goal_sound_type: string | null
          id: string
          inactivity_timeout: number | null
          language: string | null
          mention_sound_type: string | null
          message_sound_type: string | null
          quiet_hours_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          sentiment_alert_enabled: boolean | null
          sentiment_alert_threshold: number | null
          sentiment_consecutive_count: number | null
          sla_sound_type: string | null
          sound_enabled: boolean | null
          sound_volume: number
          theme: string | null
          transcription_notification_enabled: boolean | null
          transcription_sound_type: string | null
          tts_speed: number | null
          tts_voice_id: string | null
          updated_at: string
          user_id: string
          welcome_message: string | null
          work_days: number[] | null
        }
        Insert: {
          auto_assignment_enabled?: boolean | null
          auto_assignment_method?: string | null
          auto_transcription_enabled?: boolean | null
          away_message?: string | null
          browser_notifications_enabled?: boolean | null
          business_hours_enabled?: boolean | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          closing_message?: string | null
          compact_mode?: boolean | null
          created_at?: string
          goal_sound_type?: string | null
          id?: string
          inactivity_timeout?: number | null
          language?: string | null
          mention_sound_type?: string | null
          message_sound_type?: string | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sentiment_alert_enabled?: boolean | null
          sentiment_alert_threshold?: number | null
          sentiment_consecutive_count?: number | null
          sla_sound_type?: string | null
          sound_enabled?: boolean | null
          sound_volume?: number
          theme?: string | null
          transcription_notification_enabled?: boolean | null
          transcription_sound_type?: string | null
          tts_speed?: number | null
          tts_voice_id?: string | null
          updated_at?: string
          user_id: string
          welcome_message?: string | null
          work_days?: number[] | null
        }
        Update: {
          auto_assignment_enabled?: boolean | null
          auto_assignment_method?: string | null
          auto_transcription_enabled?: boolean | null
          away_message?: string | null
          browser_notifications_enabled?: boolean | null
          business_hours_enabled?: boolean | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          closing_message?: string | null
          compact_mode?: boolean | null
          created_at?: string
          goal_sound_type?: string | null
          id?: string
          inactivity_timeout?: number | null
          language?: string | null
          mention_sound_type?: string | null
          message_sound_type?: string | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sentiment_alert_enabled?: boolean | null
          sentiment_alert_threshold?: number | null
          sentiment_consecutive_count?: number | null
          sla_sound_type?: string | null
          sound_enabled?: boolean | null
          sound_volume?: number
          theme?: string | null
          transcription_notification_enabled?: boolean | null
          transcription_sound_type?: string | null
          tts_speed?: number | null
          tts_voice_id?: string | null
          updated_at?: string
          user_id?: string
          welcome_message?: string | null
          work_days?: number[] | null
        }
        Relationships: []
      }
      voice_command_logs: {
        Row: {
          action: string
          created_at: string | null
          data: Json | null
          duration_ms: number | null
          id: string
          response: string | null
          success: boolean | null
          transcript: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          data?: Json | null
          duration_ms?: number | null
          id?: string
          response?: string | null
          success?: boolean | null
          transcript: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          data?: Json | null
          duration_ms?: number | null
          id?: string
          response?: string | null
          success?: boolean | null
          transcript?: string
          user_id?: string
        }
        Relationships: []
      }
      warroom_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          dismissed_by: string | null
          id: string
          is_read: boolean | null
          message: string
          source: string | null
          title: string
        }
        Insert: {
          alert_type?: string
          created_at?: string | null
          dismissed_by?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          source?: string | null
          title: string
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          dismissed_by?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          source?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "warroom_alerts_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warroom_alerts_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_challenges: {
        Row: {
          challenge: string
          created_at: string
          expires_at: string
          id: string
          type: string
          user_id: string | null
        }
        Insert: {
          challenge: string
          created_at?: string
          expires_at?: string
          id?: string
          type: string
          user_id?: string | null
        }
        Update: {
          challenge?: string
          created_at?: string
          expires_at?: string
          id?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webhook_failures: {
        Row: {
          endpoint: string
          error_at: string
          error_message: string
          event_type: string | null
          id: string
          instance: string | null
          payload_sha256: string | null
          payload_truncated: Json | null
          resolved: boolean
          resolved_at: string | null
          retry_count: number
        }
        Insert: {
          endpoint: string
          error_at?: string
          error_message: string
          event_type?: string | null
          id?: string
          instance?: string | null
          payload_sha256?: string | null
          payload_truncated?: Json | null
          resolved?: boolean
          resolved_at?: string | null
          retry_count?: number
        }
        Update: {
          endpoint?: string
          error_at?: string
          error_message?: string
          event_type?: string | null
          id?: string
          instance?: string | null
          payload_sha256?: string | null
          payload_truncated?: Json | null
          resolved?: boolean
          resolved_at?: string | null
          retry_count?: number
        }
        Relationships: []
      }
      webhook_rate_limits: {
        Row: {
          created_at: string
          event_count: number
          event_type: string
          id: string
          instance_id: string
          window_start: string
        }
        Insert: {
          created_at?: string
          event_count?: number
          event_type: string
          id?: string
          instance_id: string
          window_start?: string
        }
        Update: {
          created_at?: string
          event_count?: number
          event_type?: string
          id?: string
          instance_id?: string
          window_start?: string
        }
        Relationships: []
      }
      whatsapp_connection_queues: {
        Row: {
          created_at: string
          id: string
          queue_id: string
          whatsapp_connection_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          queue_id: string
          whatsapp_connection_id: string
        }
        Update: {
          created_at?: string
          id?: string
          queue_id?: string
          whatsapp_connection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connection_queues_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connection_queues_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connection_queues_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connection_queues_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connection_queues_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connections: {
        Row: {
          battery_level: number | null
          capabilities: Json
          created_at: string
          created_by: string | null
          farewell_enabled: boolean | null
          farewell_message: string | null
          health_response_ms: number | null
          health_status: string | null
          id: string
          instance_id: string | null
          instance_token_secret_id: string | null
          is_default: boolean | null
          is_plugged: boolean | null
          last_health_check: string | null
          max_retries: number | null
          name: string
          phone_number: string
          qr_code: string | null
          retry_count: number | null
          status: string | null
          updated_at: string
        }
        Insert: {
          battery_level?: number | null
          capabilities?: Json
          created_at?: string
          created_by?: string | null
          farewell_enabled?: boolean | null
          farewell_message?: string | null
          health_response_ms?: number | null
          health_status?: string | null
          id?: string
          instance_id?: string | null
          instance_token_secret_id?: string | null
          is_default?: boolean | null
          is_plugged?: boolean | null
          last_health_check?: string | null
          max_retries?: number | null
          name: string
          phone_number: string
          qr_code?: string | null
          retry_count?: number | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          battery_level?: number | null
          capabilities?: Json
          created_at?: string
          created_by?: string | null
          farewell_enabled?: boolean | null
          farewell_message?: string | null
          health_response_ms?: number | null
          health_status?: string | null
          id?: string
          instance_id?: string | null
          instance_token_secret_id?: string | null
          is_default?: boolean | null
          is_plugged?: boolean | null
          last_health_check?: string | null
          max_retries?: number | null
          name?: string
          phone_number?: string
          qr_code?: string | null
          retry_count?: number | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_flows: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          flow_json: Json
          id: string
          name: string
          published_at: string | null
          screens: Json
          status: string | null
          updated_at: string | null
          whatsapp_connection_id: string | null
          whatsapp_flow_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          flow_json?: Json
          id?: string
          name: string
          published_at?: string | null
          screens?: Json
          status?: string | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
          whatsapp_flow_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          flow_json?: Json
          id?: string
          name?: string
          published_at?: string | null
          screens?: Json
          status?: string | null
          updated_at?: string | null
          whatsapp_connection_id?: string | null
          whatsapp_flow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_flows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_flows_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_flows_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_flows_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_flows_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_groups: {
        Row: {
          avatar_url: string | null
          category: string | null
          created_at: string
          description: string | null
          group_id: string
          id: string
          is_admin: boolean | null
          name: string
          participant_count: number | null
          updated_at: string
          whatsapp_connection_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          group_id: string
          id?: string
          is_admin?: boolean | null
          name: string
          participant_count?: number | null
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          group_id?: string
          id?: string
          is_admin?: boolean | null
          name?: string
          participant_count?: number | null
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_groups_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_groups_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          buttons: Json | null
          category: string
          content: string
          created_at: string
          created_by: string | null
          footer_text: string | null
          header_text: string | null
          id: string
          language: string
          name: string
          status: string
          updated_at: string
          variables: string[] | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          buttons?: Json | null
          category?: string
          content: string
          created_at?: string
          created_by?: string | null
          footer_text?: string | null
          header_text?: string | null
          id?: string
          language?: string
          name: string
          status?: string
          updated_at?: string
          variables?: string[] | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          buttons?: Json | null
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          footer_text?: string | null
          header_text?: string | null
          id?: string
          language?: string
          name?: string
          status?: string
          updated_at?: string
          variables?: string[] | null
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_templates_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      whisper_messages: {
        Row: {
          contact_id: string
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          sender_id: string
          target_agent_id: string
        }
        Insert: {
          contact_id: string
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_id: string
          target_agent_id: string
        }
        Update: {
          contact_id?: string
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_id?: string
          target_agent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whisper_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whisper_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whisper_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whisper_messages_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whisper_messages_target_agent_id_fkey"
            columns: ["target_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      catalog_send_stats: {
        Row: {
          chave: string | null
          enviados: number | null
          falhas: number | null
          grao: string | null
          parciais: number | null
          rotulo: string | null
          taxa_falha: number | null
          taxa_parcial: number | null
          total: number | null
        }
        Relationships: []
      }
      channel_connections_safe: {
        Row: {
          channel_type: Database["public"]["Enums"]["channel_type"] | null
          created_at: string | null
          created_by: string | null
          external_account_id: string | null
          external_page_id: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          status: string | null
          updated_at: string | null
          webhook_url: string | null
          whatsapp_connection_id: string | null
        }
        Insert: {
          channel_type?: Database["public"]["Enums"]["channel_type"] | null
          created_at?: string | null
          created_by?: string | null
          external_account_id?: string | null
          external_page_id?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
          whatsapp_connection_id?: string | null
        }
        Update: {
          channel_type?: Database["public"]["Enums"]["channel_type"] | null
          created_at?: string | null
          created_by?: string | null
          external_account_id?: string | null
          external_page_id?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
          whatsapp_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_agent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_whatsapp_connection_id_fkey"
            columns: ["whatsapp_connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_accounts_safe: {
        Row: {
          created_at: string | null
          email_address: string | null
          id: string | null
          is_active: boolean | null
          last_error: string | null
          last_sync_at: string | null
          sync_status: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email_address?: string | null
          id?: string | null
          is_active?: boolean | null
          last_error?: string | null
          last_sync_at?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email_address?: string | null
          id?: string | null
          is_active?: boolean | null
          last_error?: string | null
          last_sync_at?: string | null
          sync_status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      password_reset_requests_safe: {
        Row: {
          created_at: string | null
          email: string | null
          id: string | null
          ip_address: string | null
          reason: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string | null
          ip_address?: string | null
          reason?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string | null
          ip_address?: string | null
          reason?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          department: string | null
          id: string | null
          is_active: boolean | null
          job_title: string | null
          name: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          department?: string | null
          id?: string | null
          is_active?: boolean | null
          job_title?: string | null
          name?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          department?: string | null
          id?: string | null
          is_active?: boolean | null
          job_title?: string | null
          name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      searchbox_usage_daily: {
        Row: {
          degradacoes: number | null
          dia: string | null
          sessoes: number | null
          ultimo_evento_em: string | null
        }
        Relationships: []
      }
      talkx_campaign_metrics: {
        Row: {
          campaign_id: string | null
          campaign_name: string | null
          completed_at: string | null
          created_at: string | null
          delivered_count: number | null
          delivery_rate_pct: number | null
          duration_secs: number | null
          id: string | null
          outcome_unknown_count: number | null
          replied_count: number | null
          reply_rate_pct: number | null
          segment_id: string | null
          sent_count: number | null
          started_at: string | null
          status: string | null
          template_id: string | null
          total_recipients: number | null
        }
        Insert: {
          campaign_id?: string | null
          campaign_name?: string | null
          completed_at?: string | null
          created_at?: string | null
          delivered_count?: number | null
          delivery_rate_pct?: never
          duration_secs?: never
          id?: string | null
          outcome_unknown_count?: number | null
          replied_count?: never
          reply_rate_pct?: never
          segment_id?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          total_recipients?: number | null
        }
        Update: {
          campaign_id?: string | null
          campaign_name?: string | null
          completed_at?: string | null
          created_at?: string | null
          delivered_count?: number | null
          delivery_rate_pct?: never
          duration_secs?: never
          id?: string | null
          outcome_unknown_count?: number | null
          replied_count?: never
          reply_rate_pct?: never
          segment_id?: string | null
          sent_count?: number | null
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          total_recipients?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "talkx_campaigns_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "talkx_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "talkx_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_campaign_optouts: {
        Row: {
          auto_optout_count: number | null
          campaign_id: string | null
          last_optout_at: string | null
          optout_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "talkx_blacklist_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["campaign_id"]
          },
          {
            foreignKeyName: "talkx_blacklist_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaign_metrics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talkx_blacklist_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "talkx_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      talkx_engine_health: {
        Row: {
          campaign_id: string | null
          detail: Json | null
          kind: string | null
          metric_count: number | null
          metric_rate: number | null
          observed_at: string | null
          recipient_id: string | null
          return_message: string | null
          status: string | null
        }
        Relationships: []
      }
      whatsapp_connections_agent: {
        Row: {
          id: string | null
          is_default: boolean | null
          name: string | null
          phone_number: string | null
          status: string | null
        }
        Insert: {
          id?: string | null
          is_default?: boolean | null
          name?: string | null
          phone_number?: string | null
          status?: string | null
        }
        Update: {
          id?: string | null
          is_default?: boolean | null
          name?: string | null
          phone_number?: string | null
          status?: string | null
        }
        Relationships: []
      }
      whatsapp_connections_public: {
        Row: {
          id: string | null
          is_default: boolean | null
          name: string | null
          status: string | null
        }
        Insert: {
          id?: string | null
          is_default?: boolean | null
          name?: string | null
          status?: string | null
        }
        Update: {
          id?: string | null
          is_default?: boolean | null
          name?: string | null
          status?: string | null
        }
        Relationships: []
      }
      whatsapp_connections_safe: {
        Row: {
          battery_level: number | null
          created_at: string | null
          created_by: string | null
          farewell_enabled: boolean | null
          farewell_message: string | null
          health_response_ms: number | null
          health_status: string | null
          id: string | null
          instance_id: string | null
          is_default: boolean | null
          is_plugged: boolean | null
          last_health_check: string | null
          max_retries: number | null
          name: string | null
          phone_number: string | null
          qr_code: string | null
          retry_count: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          battery_level?: number | null
          created_at?: string | null
          created_by?: string | null
          farewell_enabled?: boolean | null
          farewell_message?: string | null
          health_response_ms?: number | null
          health_status?: string | null
          id?: string | null
          instance_id?: never
          is_default?: boolean | null
          is_plugged?: boolean | null
          last_health_check?: string | null
          max_retries?: number | null
          name?: string | null
          phone_number?: string | null
          qr_code?: never
          retry_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          battery_level?: number | null
          created_at?: string | null
          created_by?: string | null
          farewell_enabled?: boolean | null
          farewell_message?: string | null
          health_response_ms?: number | null
          health_status?: string | null
          id?: string | null
          instance_id?: never
          is_default?: boolean | null
          is_plugged?: boolean | null
          last_health_check?: string | null
          max_retries?: number | null
          name?: string | null
          phone_number?: string | null
          qr_code?: never
          retry_count?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_department_invite: { Args: { p_code: string }; Returns: Json }
      add_agent_xp: {
        Args: { p_profile_id: string; p_xp: number }
        Returns: Json
      }
      add_wa_tag_if_not_exists: {
        Args: { p_contact_id: string; p_prefix: string; p_tag: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: {
          out_new_role: Database["public"]["Enums"]["app_role"]
          out_old_role: Database["public"]["Enums"]["app_role"]
          out_user_id: string
        }[]
      }
      ai_budget_reconcile: { Args: never; Returns: number }
      ai_budget_release: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      ai_budget_reserve: {
        Args: {
          p_estimated_tokens: number
          p_function_name: string
          p_idempotency_key: string
          p_limit_tokens: number
          p_ttl_ms: number
          p_user_id: string
        }
        Returns: {
          allowed: boolean
          id: string
          limit_tokens: number
          used_tokens: number
        }[]
      }
      ai_budget_settle: {
        Args: { p_actual_tokens: number; p_id: string }
        Returns: undefined
      }
      ai_is_canonical_churn_risk: {
        Args: { p_value: string }
        Returns: boolean
      }
      ai_is_canonical_priority: { Args: { p_value: string }; Returns: boolean }
      ai_is_canonical_sentiment: { Args: { p_value: string }; Returns: boolean }
      ai_is_canonical_urgency: { Args: { p_value: string }; Returns: boolean }
      ai_rate_limit_hit: {
        Args: { p_key: string; p_window_start: string }
        Returns: number
      }
      ai_rate_limit_purge: { Args: { p_older_than: string }; Returns: number }
      ai_text_array: { Args: { p_value: Json }; Returns: string[] }
      ai_usage_cost_summary: {
        Args: { p_since: string; p_top_functions?: number; p_until: string }
        Returns: Json
      }
      ai_usage_summary: {
        Args: {
          p_bucket_seconds?: number
          p_since: string
          p_top_functions?: number
          p_top_users?: number
          p_until?: string
        }
        Returns: Json
      }
      apply_pg_cron_escalonamento: {
        Args: { p_reverter?: boolean }
        Returns: number
      }
      apply_zapp_cron_secrets_l5: { Args: never; Returns: undefined }
      attribute_multiplix_item_reply: {
        Args: {
          p_message_id: string
          p_phone: string
          p_quoted_external_id?: string
        }
        Returns: Json
      }
      attribute_talkx_reply: {
        Args: { p_contact_id: string; p_message_id: string; p_phone: string }
        Returns: Json
      }
      calculate_level: { Args: { xp_amount: number }; Returns: number }
      can_delete_contacts: {
        Args: { p_ids: string[] }
        Returns: {
          can_delete: boolean
          contact_id: string
        }[]
      }
      can_edit_contact:
        | {
            Args: { p_assigned_to: string; p_queue_id: string }
            Returns: boolean
          }
        | {
            Args: {
              p_assigned_to: string
              p_is_admin: boolean
              p_profile_id: string
              p_queue_id: string
              p_visible_agent_ids: string[]
            }
            Returns: boolean
          }
      cancel_ai_job: {
        Args: { p_id: string; p_reason: string }
        Returns: boolean
      }
      catalog_rate_limit_hit: {
        Args: {
          p_action: string
          p_limit: number
          p_user: string
          p_window_ms: number
        }
        Returns: boolean
      }
      claim_ai_jobs: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_worker: string }
        Returns: {
          attempt_count: number
          available_at: string
          created_at: string
          expires_at: string | null
          finished_at: string | null
          function_name: string
          heartbeat_at: string | null
          id: string
          idempotency_key: string
          kind: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          payload: Json
          priority: number
          result: Json | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_crm_sync_outbox: {
        Args: { p_limit?: number; p_worker: string }
        Returns: {
          attempt_count: number
          available_at: string
          closure_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          external_company_id: string | null
          external_contact_id: string | null
          external_interaction_id: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          lease_token: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          normalized_phone: string | null
          payload: Json
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "crm_sync_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_crm_sync_outbox_by_id: {
        Args: { p_id: string; p_worker: string }
        Returns: {
          attempt_count: number
          available_at: string
          closure_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          external_company_id: string | null
          external_contact_id: string | null
          external_interaction_id: string | null
          id: string
          idempotency_key: string
          last_error_code: string | null
          lease_token: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          normalized_phone: string | null
          payload: Json
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "crm_sync_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_multiplix_item: {
        Args: {
          p_dispatch_id: string
          p_item_id: string
          p_lease_seconds?: number
          p_worker: string
        }
        Returns: {
          block_id: string
          claim_expires_at: string
          claim_token: string
          company_id: string
          delivery_attempt_count: number
          item_id: string
          recipient_id: string
        }[]
      }
      claim_multiplix_recipient: {
        Args: {
          p_dispatch_id: string
          p_lease_seconds?: number
          p_recipient_id: string
          p_worker: string
        }
        Returns: {
          claim_expires_at: string
          claim_token: string
          company_id: string
          delivery_attempt_count: number
          recipient_id: string
        }[]
      }
      claim_outbound_message: {
        Args: {
          p_agent_id: string
          p_lease_seconds?: number
          p_message_id: string
          p_worker: string
        }
        Returns: {
          agent_id: string
          caption: string
          claim_expires_at: string
          claim_token: string
          client_message_id: string
          contact_id: string
          contact_phone: string
          content: string
          delivery_attempt_count: number
          media_filename: string
          media_mimetype: string
          media_url: string
          message_id: string
          message_type: string
          reply_external_id: string
          reply_to_id: string
          whatsapp_connection_id: string
          whatsapp_instance_name: string
        }[]
      }
      claim_talkx_campaign_worker: {
        Args: {
          p_campaign_id: string
          p_lease_seconds?: number
          p_worker: string
        }
        Returns: boolean
      }
      claim_talkx_recipient: {
        Args: {
          p_campaign_id: string
          p_lease_seconds?: number
          p_recipient_id: string
          p_worker: string
        }
        Returns: {
          claim_expires_at: string
          claim_token: string
          contact_id: string
          delivery_attempt_count: number
          recipient_id: string
        }[]
      }
      cleanup_crm_sync_outbox: {
        Args: {
          p_dead_letter_days?: number
          p_limit?: number
          p_succeeded_days?: number
        }
        Returns: number
      }
      cleanup_expired_challenges: { Args: never; Returns: undefined }
      cleanup_link_preview_cache: {
        Args: never
        Returns: {
          deleted_count: number
          duration_ms: number
          remaining_count: number
          table_size_bytes: number
        }[]
      }
      clear_login_attempts: { Args: { p_email: string }; Returns: undefined }
      close_conversation_atomic: {
        Args: {
          p_classification?: string
          p_client_request_id: string
          p_close_reason: string
          p_contact_id: string
          p_notes?: string
          p_outcome?: string
        }
        Returns: {
          closure_id: string
          contact_id: string
          conversation_status: string
          conversation_status_changed_at: string
          event_id: string
        }[]
      }
      complete_crm_sync_outbox: {
        Args: {
          p_company_id: string
          p_contact_id: string
          p_id: string
          p_interaction_id: string
          p_lease_token: string
        }
        Returns: undefined
      }
      complete_multiplix_dispatch_if_drained: {
        Args: { p_dispatch_id: string }
        Returns: boolean
      }
      complete_multiplix_dispatch_if_items_drained: {
        Args: { p_dispatch_id: string }
        Returns: boolean
      }
      complete_multiplix_item: {
        Args: {
          p_claim_token: string
          p_error_message?: string
          p_item_id: string
          p_status: string
        }
        Returns: undefined
      }
      complete_multiplix_recipient: {
        Args: {
          p_claim_token: string
          p_error_message?: string
          p_recipient_id: string
          p_status: string
        }
        Returns: undefined
      }
      complete_outbound_message: {
        Args: {
          p_claim_token: string
          p_delivery_status?: string
          p_external_id: string
          p_message_id: string
        }
        Returns: {
          agent_id: string | null
          audio_meme_id: string | null
          caption: string | null
          channel_connection_id: string | null
          channel_type: string | null
          client_message_id: string | null
          contact_id: string | null
          content: string
          created_at: string
          delivery_attempt_count: number
          delivery_claim_expires_at: string | null
          delivery_claim_token: string | null
          delivery_claimed_at: string | null
          delivery_claimed_by: string | null
          delivery_last_claim_token: string | null
          external_id: string | null
          id: string
          is_deleted: boolean | null
          is_edited: boolean
          is_read: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_type: string
          ptt: boolean | null
          reply_to_id: string | null
          sender: string
          status: string | null
          status_updated_at: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string
          whatsapp_connection_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_talkx_campaign_if_drained: {
        Args: { p_campaign_id: string }
        Returns: boolean
      }
      complete_talkx_recipient: {
        Args: {
          p_claim_token: string
          p_error_message?: string
          p_recipient_id: string
          p_status: string
        }
        Returns: undefined
      }
      consume_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: {
          allowed: boolean
          remaining: number
        }[]
      }
      contacts_count_by_type: {
        Args: { include_legacy?: boolean }
        Returns: {
          contact_type: string
          count: number
        }[]
      }
      conversation_closure_day: {
        Args: { p_created_at: string }
        Returns: string
      }
      count_multiplix_dead_letters: {
        Args: { p_dispatch_id?: string }
        Returns: number
      }
      count_searchbox_sessions_this_month: { Args: never; Returns: number }
      create_department_invite: {
        Args: {
          p_department_id: string
          p_expires_hours?: number
          p_max_uses?: number
        }
        Returns: Json
      }
      current_profile_id: { Args: never; Returns: string }
      dashboard_contact_counts: {
        Args: {
          p_agent?: string
          p_queue?: string
          p_since?: string
          p_until?: string
        }
        Returns: Json
      }
      dashboard_hourly_volume: {
        Args: { p_agent?: string; p_days?: number; p_queue?: string }
        Returns: {
          day: string
          hour: number
          message_count: number
        }[]
      }
      dashboard_kpi: {
        Args: { p_agent?: string; p_queue?: string; p_since?: string }
        Returns: Json
      }
      dashboard_leaderboard: {
        Args: { p_limit?: number; p_period?: string }
        Returns: Json
      }
      dashboard_sentiment_alerts: {
        Args: { p_since?: string }
        Returns: {
          created_at: string
          details: Json
          entity_id: string
          id: string
        }[]
      }
      decrypt_gmail_token: { Args: { p_encrypted: string }; Returns: string }
      delete_contact: { Args: { p_id: string }; Returns: string }
      delete_contacts: { Args: { p_ids: string[] }; Returns: number }
      delete_talkx_campaign: {
        Args: { p_campaign_id: string }
        Returns: string
      }
      duplicate_talkx_campaign: {
        Args: { p_campaign_id: string }
        Returns: {
          audience_filters: Json
          audience_snapshot_at: string | null
          audience_source: string
          business_hours_only: boolean
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          confirm_consent: boolean
          consent_confirmed_at: string | null
          consent_confirmed_by: string | null
          created_at: string
          created_by: string | null
          delivered_count: number
          description: string | null
          draft_creation_key: string | null
          draft_step: number | null
          failed_count: number
          id: string
          investment: number | null
          launched_at: string | null
          launched_by: string | null
          legal_basis: string | null
          max_per_minute: number | null
          media_type: string | null
          media_url: string | null
          message_template: string
          name: string
          objective: string
          outcome_unknown_count: number
          owner: string | null
          pause_reason: string | null
          paused_at: string | null
          paused_by: string | null
          read_count: number
          replied_count: number
          respect_suppression: boolean
          responsible_id: string | null
          revision: number
          schedule_timezone: string
          scheduled_at: string | null
          segment_id: string | null
          send_interval_max: number
          send_interval_min: number
          send_window_end: string | null
          send_window_start: string | null
          sent_count: number
          skipped_count: number
          speed_profile: string
          started_at: string | null
          status: string
          template_id: string | null
          template_version_id: string | null
          total_recipients: number
          typing_delay_max: number
          typing_delay_min: number
          updated_at: string
          variables_config: Json
          whatsapp_connection_id: string | null
          worker_id: string | null
          worker_lease_expires_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "talkx_campaigns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      effective_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      encrypt_gmail_token: { Args: { p_token: string }; Returns: string }
      enqueue_ai_job: {
        Args: {
          p_available_at?: string
          p_expires_at?: string
          p_function_name: string
          p_idempotency_key: string
          p_kind: string
          p_max_attempts?: number
          p_payload: Json
          p_priority?: number
          p_user_id: string
        }
        Returns: string
      }
      enqueue_outbound_message: {
        Args: {
          p_caption?: string
          p_client_message_id: string
          p_contact_id: string
          p_content: string
          p_media_url?: string
          p_message_type?: string
          p_reply_to_id?: string
          p_whatsapp_connection_id?: string
        }
        Returns: {
          agent_id: string | null
          audio_meme_id: string | null
          caption: string | null
          channel_connection_id: string | null
          channel_type: string | null
          client_message_id: string | null
          contact_id: string | null
          content: string
          created_at: string
          delivery_attempt_count: number
          delivery_claim_expires_at: string | null
          delivery_claim_token: string | null
          delivery_claimed_at: string | null
          delivery_claimed_by: string | null
          delivery_last_claim_token: string | null
          external_id: string | null
          id: string
          is_deleted: boolean | null
          is_edited: boolean
          is_read: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_type: string
          ptt: boolean | null
          reply_to_id: string | null
          sender: string
          status: string | null
          status_updated_at: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string
          whatsapp_connection_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enqueue_rich_outbound_message: {
        Args: {
          p_client_message_id: string
          p_contact_id: string
          p_delivery_payload: Json
          p_display_content: string
          p_message_type: string
          p_reply_to_id?: string
          p_whatsapp_connection_id?: string
        }
        Returns: {
          agent_id: string | null
          audio_meme_id: string | null
          caption: string | null
          channel_connection_id: string | null
          channel_type: string | null
          client_message_id: string | null
          contact_id: string | null
          content: string
          created_at: string
          delivery_attempt_count: number
          delivery_claim_expires_at: string | null
          delivery_claim_token: string | null
          delivery_claimed_at: string | null
          delivery_claimed_by: string | null
          delivery_last_claim_token: string | null
          external_id: string | null
          id: string
          is_deleted: boolean | null
          is_edited: boolean
          is_read: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_type: string
          ptt: boolean | null
          reply_to_id: string | null
          sender: string
          status: string | null
          status_updated_at: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string
          whatsapp_connection_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_stale_agent_presence: { Args: never; Returns: undefined }
      fail_crm_sync_outbox: {
        Args: { p_error_code: string; p_id: string; p_lease_token: string }
        Returns: undefined
      }
      fail_outbound_message: {
        Args: {
          p_claim_token: string
          p_message_id: string
          p_retryable?: boolean
        }
        Returns: {
          agent_id: string | null
          audio_meme_id: string | null
          caption: string | null
          channel_connection_id: string | null
          channel_type: string | null
          client_message_id: string | null
          contact_id: string | null
          content: string
          created_at: string
          delivery_attempt_count: number
          delivery_claim_expires_at: string | null
          delivery_claim_token: string | null
          delivery_claimed_at: string | null
          delivery_claimed_by: string | null
          delivery_last_claim_token: string | null
          external_id: string | null
          id: string
          is_deleted: boolean | null
          is_edited: boolean
          is_read: boolean | null
          link_preview: Json | null
          media_filename: string | null
          media_meta: Json | null
          media_mimetype: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          message_type: string
          ptt: boolean | null
          reply_to_id: string | null
          sender: string
          status: string | null
          status_updated_at: string | null
          transcription: string | null
          transcription_status: string | null
          updated_at: string
          whatsapp_connection_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      find_or_create_direct_conversation: {
        Args: { other_profile_id: string }
        Returns: string
      }
      finish_ai_job: {
        Args: {
          p_error_code?: string
          p_id: string
          p_lease_token: string
          p_result?: Json
          p_status: string
        }
        Returns: boolean
      }
      fn_list_audio_meme_categories: {
        Args: never
        Returns: {
          category: string
          total: number
        }[]
      }
      fn_list_audio_memes_for_user: {
        Args: { p_category?: string; p_only_favs?: boolean; p_search?: string }
        Returns: {
          audio_url: string
          category: string
          created_at: string
          duration_seconds: number
          id: string
          is_favorite: boolean
          name: string
          use_count: number
        }[]
      }
      fn_send_audio_meme: {
        Args: { p_meme_id: string }
        Returns: {
          audio_url: string
          category: string
          created_at: string
          duration_seconds: number | null
          id: string
          is_favorite: boolean
          name: string
          uploaded_by: string | null
          use_count: number
        }
        SetofOptions: {
          from: "*"
          to: "audio_memes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_toggle_user_meme_favorite: {
        Args: { p_meme_id: string }
        Returns: boolean
      }
      get_ai_jobs_cron_secret: { Args: never; Returns: string }
      get_avatars_refresh_cron_secret: { Args: never; Returns: string }
      get_channel_credentials: {
        Args: { _connection_id: string }
        Returns: Json
      }
      get_channel_credentials_safe: {
        Args: { p_channel_id: string }
        Returns: Json
      }
      get_connection_health_check_cron_secret: { Args: never; Returns: string }
      get_connection_instance: {
        Args: { _connection_id: string }
        Returns: string
      }
      get_connection_qr_code: {
        Args: { _connection_id: string }
        Returns: string
      }
      get_conversation_tab_counts: {
        Args: { p_contact_id: string }
        Returns: {
          files_total: number
          notes_total: number
          tasks_open: number
        }[]
      }
      get_crm_sync_health: { Args: never; Returns: Json }
      get_department_whatsapp_api_key: {
        Args: { p_department_id: string }
        Returns: string
      }
      get_department_whatsapp_credentials: {
        Args: { p_department_id: string }
        Returns: Json
      }
      get_gmail_tokens: {
        Args: { p_account_id: string }
        Returns: {
          access_token: string
          refresh_token: string
        }[]
      }
      get_identity_matrix: {
        Args: never
        Returns: {
          access_level: string
          auth_user_id: string
          created_at: string
          display_name: string
          effective_permissions: string
          email: string
          is_active: boolean
          is_banned: boolean
          last_sign_in_at: string
          profile_id: string
          profile_role_cached: string
          user_roles_list: string
        }[]
      }
      get_instance_token: { Args: { p_instance_id: string }; Returns: string }
      get_last_message_dates: {
        Args: { contact_ids: string[] }
        Returns: {
          contact_id: string
          last_message_at: string
        }[]
      }
      get_multiplix_cron_secret: { Args: never; Returns: string }
      get_own_gmail_accounts: {
        Args: never
        Returns: {
          created_at: string
          email_address: string
          id: string
          is_active: boolean
          last_error: string
          last_sync_at: string
          sync_status: string
          token_expires_at: string
          updated_at: string
          user_id: string
        }[]
      }
      get_own_lockout_status: {
        Args: { p_email: string }
        Returns: {
          attempt_count: number
          locked_until: string
        }[]
      }
      get_profile_id_for_user: { Args: { _user_id: string }; Returns: string }
      get_profile_role_for_check: {
        Args: { p_user_id: string }
        Returns: {
          access_level: string
          permissions: Json
          role: string
        }[]
      }
      get_talkx_cron_secret: { Args: never; Returns: string }
      get_talkx_send_url: { Args: never; Returns: string }
      get_team_conversation_previews: {
        Args: never
        Returns: {
          conversation_id: string
          last_message_content: string
          last_message_created_at: string
          last_message_id: string
          last_message_sender_id: string
          last_message_type: string
        }[]
      }
      get_team_inbox: {
        Args: never
        Returns: {
          conversation_id: string
          conversation_name: string
          conversation_type: string
          department_id: string
          is_muted: boolean
          last_message_at: string
          last_message_text: string
          last_sender_id: string
          member_count: number
          unread_count: number
        }[]
      }
      get_team_messages_page: {
        Args: {
          p_before_id?: string
          p_conversation_id: string
          p_limit?: number
        }
        Returns: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_edited: boolean
          media_bucket: string
          media_path: string
          media_type: string
          media_url: string
          message_type: string
          reply_to_id: string
          sender_avatar: string
          sender_id: string
          sender_name: string
          updated_at: string
        }[]
      }
      get_team_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          department: string
          email: string
          id: string
          is_active: boolean
          job_title: string
          max_chats: number
          name: string
          phone: string
          role: string
          user_id: string
        }[]
      }
      get_team_unread_counts: {
        Args: never
        Returns: {
          conversation_id: string
          unread_count: number
        }[]
      }
      get_visible_agent_ids: { Args: { _user_id: string }; Returns: string[] }
      grant_agent_achievement: {
        Args: {
          p_description: string
          p_name: string
          p_profile_id: string
          p_type: string
          p_xp_reward: number
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_ai_job: {
        Args: { p_id: string; p_lease_seconds?: number; p_lease_token: string }
        Returns: boolean
      }
      heartbeat_multiplix_item: {
        Args: {
          p_claim_token: string
          p_item_id: string
          p_lease_seconds?: number
        }
        Returns: boolean
      }
      increment_agent_messages: {
        Args: { p_profile_id: string; p_type: string }
        Returns: Json
      }
      increment_agent_resolutions: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      ingest_inbound_message: {
        Args: {
          p_connection_id: string
          p_content: string
          p_created_at: string
          p_external_id: string
          p_media_url: string
          p_message_type: string
          p_phone: string
          p_push_name: string
        }
        Returns: {
          assigned_to: string
          avatar_url: string
          contact_created: boolean
          contact_id: string
          contact_name: string
          message_id: string
          outcome: string
        }[]
      }
      is_account_locked: {
        Args: { check_email: string }
        Returns: {
          attempts: number
          is_locked: boolean
          locked_until: string
        }[]
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_supervisor: { Args: { _user_id: string }; Returns: boolean }
      is_contact_visible_to_user: {
        Args: { _contact_id: string; _user_id: string }
        Returns: boolean
      }
      is_country_allowed: {
        Args: { check_country_code: string }
        Returns: boolean
      }
      is_country_blocked: {
        Args: { check_country_code: string }
        Returns: boolean
      }
      is_ip_blocked: { Args: { check_ip: string }; Returns: boolean }
      is_ip_whitelisted: { Args: { check_ip: string }; Returns: boolean }
      is_privileged_contact_caller: { Args: never; Returns: boolean }
      is_team_conversation_member: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_valid_talkx_schedule_timezone: {
        Args: { p_timezone: string }
        Returns: boolean
      }
      is_within_business_hours: {
        Args: { connection_id: string }
        Returns: boolean
      }
      kick_talkx_campaign: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      leave_team_group: { Args: { p_conversation_id: string }; Returns: Json }
      link_email_crm_contact_guarded: {
        Args: {
          p_external_company_id: string
          p_external_contact_id: string
          p_linked_by: string
          p_normalized_phone: string
          p_zapp_contact_id: string
        }
        Returns: undefined
      }
      list_multiplix_claimable_items: {
        Args: { p_dispatch_id: string; p_limit?: number }
        Returns: {
          attempt_count: number
          block_id: string
          block_order: number
          company_id: string
          item_id: string
          next_attempt_at: string
          recipient_id: string
        }[]
      }
      list_multiplix_dead_letters: {
        Args: { p_dispatch_id?: string; p_limit?: number }
        Returns: {
          attempt_count: number
          block_id: string
          block_order: number
          destino_mascarado: string
          dispatch_id: string
          dispatch_name: string
          error_class: string
          error_message: string
          failed_at: string
          item_id: string
          next_attempt_at: string
          recipient_id: string
        }[]
      }
      log_audit_event: {
        Args: {
          p_action: string
          p_details?: Json
          p_entity_id?: string
          p_entity_type?: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      log_talkx_campaign_checklist: {
        Args: { p_campaign_id: string; p_items: Json }
        Returns: string
      }
      mark_first_response: {
        Args: { p_contact_id: string }
        Returns: undefined
      }
      mark_multiplix_item_dispatch_started: {
        Args: { p_claim_token: string; p_item_id: string }
        Returns: undefined
      }
      mark_multiplix_recipient_dispatch_started: {
        Args: { p_claim_token: string; p_recipient_id: string }
        Returns: undefined
      }
      mark_talkx_recipient_dispatch_started: {
        Args: { p_claim_token: string; p_recipient_id: string }
        Returns: undefined
      }
      mark_team_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mcp_exec: { Args: { max_rows?: number; sql: string }; Returns: Json }
      mcp_exec_many: {
        Args: { max_rows?: number; statements: string[] }
        Returns: Json
      }
      merge_contacts_atomic: {
        Args: {
          p_merged_fields?: Json
          p_primary_id: string
          p_secondary_ids: string[]
        }
        Returns: Json
      }
      multiplix_confirm_dispatch: {
        Args: {
          p_actor_id: string
          p_allow_manage_all: boolean
          p_correlation_id?: string
          p_dispatch_id: string
          p_expected_version: number
          p_scheduled_at?: string
        }
        Returns: {
          block_count: number
          created: boolean
          dispatch_id: string
          dispatch_version: number
          items_created: number
          items_total: number
          recipient_count: number
          scheduled_at: string
          status: Database["public"]["Enums"]["multiplix_dispatch_status"]
        }[]
      }
      multiplix_connection_daily_usage: {
        Args: { p_connection_id: string }
        Returns: Json
      }
      multiplix_create_draft: {
        Args: {
          p_client_request_id: string
          p_confirm_over_limit?: boolean
          p_created_by: string
          p_name: string
          p_recipients: Json
          p_scheduled_at?: string
          p_template: string
          p_whatsapp_connection_id?: string
        }
        Returns: {
          created: boolean
          dispatch_id: string
          duplicated_count: number
          recipient_count: number
        }[]
      }
      multiplix_dispatch_window_is_open: {
        Args: { p_dispatch_id: string }
        Returns: boolean
      }
      my_calls_kpi: {
        Args: {
          p_channel?: string
          p_from?: string
          p_scope?: string
          p_to?: string
        }
        Returns: {
          answered: number
          avg_talk_seconds: number
          inbound: number
          missed_inbound: number
          outbound: number
          total: number
        }[]
      }
      notify_due_reminders: { Args: never; Returns: number }
      notify_due_tasks: { Args: never; Returns: number }
      notify_searchbox_budget: { Args: never; Returns: number }
      pause_dispatches_for_connection: {
        Args: { p_connection_id: string; p_reason: string }
        Returns: number
      }
      persist_conversation_analysis: {
        Args: { p_analysis: Json; p_analyzed_at?: string; p_contact_id: string }
        Returns: Json
      }
      persist_multiplix_item_message_snapshot: {
        Args: {
          p_claim_token: string
          p_item_id: string
          p_personalized_message: string
        }
        Returns: string
      }
      persist_multiplix_recipient_message_snapshot: {
        Args: {
          p_claim_token: string
          p_personalized_message: string
          p_recipient_id: string
        }
        Returns: string
      }
      persist_sentiment_alert: {
        Args: {
          p_analysis_id: string
          p_contact_id: string
          p_details: Json
          p_notification_message: string
          p_notification_title: string
          p_recipient_user_id: string
        }
        Returns: {
          audit_created: boolean
          duplicate: boolean
          notification_created: boolean
        }[]
      }
      persist_talkx_recipient_message_snapshot: {
        Args: {
          p_claim_token: string
          p_media_type?: string
          p_media_url?: string
          p_personalized_message: string
          p_recipient_id: string
          p_variant_id?: string
        }
        Returns: {
          media_type_snapshot: string
          media_url_snapshot: string
          personalized_message: string
          variant_id_snapshot: string
        }[]
      }
      phone_variants: { Args: { p_phone: string }; Returns: string[] }
      purge_talkx_expired_data: { Args: { p_limit?: number }; Returns: Json }
      reap_ai_jobs: { Args: never; Returns: number }
      reassign_absent_agents: {
        Args: { inactive_minutes?: number }
        Returns: number
      }
      reassign_overloaded_agents: { Args: never; Returns: number }
      record_failed_login: {
        Args: { p_email: string; p_ip_address?: string; p_user_agent?: string }
        Returns: {
          attempts: number
          is_locked: boolean
          locked_until: string
        }[]
      }
      record_incoming_call_event:
        | {
            Args: {
              p_contact_id: string
              p_is_video: boolean
              p_provider_event_id?: string
              p_should_notify?: boolean
              p_status: string
              p_whatsapp_connection_id: string
            }
            Returns: {
              call_id: string
              duplicate: boolean
              notification_created: boolean
              notification_id: string
            }[]
          }
        | {
            Args: {
              p_contact_id: string
              p_direction?: string
              p_is_video: boolean
              p_provider_event_id?: string
              p_should_notify?: boolean
              p_status: string
              p_whatsapp_connection_id: string
            }
            Returns: {
              call_id: string
              duplicate: boolean
              notification_created: boolean
              notification_id: string
            }[]
          }
      record_multiplix_item_delivered: {
        Args: {
          p_connection_id: string
          p_event?: string
          p_external_id: string
        }
        Returns: boolean
      }
      record_multiplix_item_sent: {
        Args: {
          p_claim_token: string
          p_external_id: string
          p_item_id: string
        }
        Returns: undefined
      }
      record_multiplix_recipient_delivered: {
        Args: { p_connection_id: string; p_external_id: string }
        Returns: boolean
      }
      record_multiplix_recipient_sent: {
        Args: {
          p_claim_token: string
          p_external_id: string
          p_recipient_id: string
        }
        Returns: undefined
      }
      record_talkx_conversion: {
        Args: {
          p_attribution?: Json
          p_campaign_id: string
          p_currency?: string
          p_external_ref: string
          p_link_id?: string
          p_occurred_at?: string
          p_recipient_id?: string
          p_source: string
          p_value: number
        }
        Returns: Json
      }
      record_talkx_link_click: {
        Args: {
          p_ip_hash?: string
          p_recipient?: string
          p_slug: string
          p_ua?: string
        }
        Returns: Json
      }
      record_talkx_recipient_delivered: {
        Args: {
          p_connection_id: string
          p_event?: string
          p_external_id: string
        }
        Returns: boolean
      }
      record_talkx_recipient_receipt: {
        Args: {
          p_connection_id: string
          p_event: string
          p_external_id: string
        }
        Returns: boolean
      }
      record_talkx_recipient_sent: {
        Args: {
          p_claim_token: string
          p_external_id: string
          p_recipient_id: string
        }
        Returns: undefined
      }
      register_first_response_internal: {
        Args: {
          p_before_created_at?: string
          p_contact_id: string
          p_responded_at: string
        }
        Returns: undefined
      }
      register_multiplix_connection_failure: {
        Args: {
          p_connection_id: string
          p_error_class?: string
          p_signal?: string
        }
        Returns: Json
      }
      release_multiplix_item_claim: {
        Args: { p_claim_token: string; p_item_id: string }
        Returns: boolean
      }
      release_multiplix_recipient_claim: {
        Args: { p_claim_token: string; p_recipient_id: string }
        Returns: boolean
      }
      release_talkx_campaign_worker: {
        Args: { p_campaign_id: string; p_worker: string }
        Returns: boolean
      }
      release_talkx_recipient_claim: {
        Args: { p_claim_token: string; p_recipient_id: string }
        Returns: boolean
      }
      remove_team_member: {
        Args: { p_conversation_id: string; p_profile_id: string }
        Returns: Json
      }
      remove_wa_label_from_all_contacts: {
        Args: { p_label_prefix: string }
        Returns: undefined
      }
      remove_wa_tag_by_prefix: {
        Args: { p_contact_id: string; p_prefix: string }
        Returns: undefined
      }
      rename_wa_label_on_all_contacts: {
        Args: { p_label_prefix: string; p_new_tag: string }
        Returns: undefined
      }
      reorder_multiplix_blocks: {
        Args: { p_block_ids: string[]; p_dispatch_id: string }
        Returns: {
          block_id: string
          block_order: number
        }[]
      }
      replace_ai_conversation_tags: {
        Args: { p_contact_id: string; p_tags: Json }
        Returns: Json
      }
      replace_talkx_draft_recipients: {
        Args: { p_campaign_id: string; p_contact_ids: string[] }
        Returns: number
      }
      require_contact_edit_permission: {
        Args: { p_contact_id: string }
        Returns: undefined
      }
      require_contact_global_admin: { Args: never; Returns: undefined }
      reschedule_multiplix_item: {
        Args: {
          p_claim_token: string
          p_error_message?: string
          p_item_id: string
          p_retry_after: string
        }
        Returns: Json
      }
      reschedule_multiplix_recipient: {
        Args: {
          p_claim_token: string
          p_error_message?: string
          p_recipient_id: string
          p_retry_after: string
        }
        Returns: Json
      }
      reschedule_talkx_recipient: {
        Args: {
          p_claim_token: string
          p_error_message?: string
          p_recipient_id: string
          p_retry_after: string
        }
        Returns: Json
      }
      resolve_contact_guard_actor: { Args: never; Returns: string }
      resolve_talkx_outcome_unknown: {
        Args: {
          p_confirm_duplicate_risk?: boolean
          p_note?: string
          p_recipient_id: string
          p_resolution: string
        }
        Returns: Json
      }
      retry_talkx_recipient: {
        Args: { p_recipient_id: string }
        Returns: boolean
      }
      retry_talkx_recipients: {
        Args: { p_campaign_id: string; p_recipient_ids: string[] }
        Returns: Json
      }
      save_talkx_campaign_draft: {
        Args: {
          p_campaign_id: string
          p_creation_key: string
          p_expected_revision: number
          p_payload: Json
        }
        Returns: {
          campaign_id: string
          creation_replayed: boolean
          revision: number
        }[]
      }
      search_contacts: {
        Args: {
          company_filter?: string
          contact_type_filter?: string
          date_from?: string
          include_legacy?: boolean
          job_title_filter?: string
          page_offset?: number
          page_size?: number
          search_term?: string
          sort_direction?: string
          sort_field?: string
          tag_filter?: string
        }
        Returns: {
          address: string
          address_number: string
          avatar_url: string
          city: string
          company: string
          contact_type: string
          created_at: string
          email: string
          id: string
          job_title: string
          latitude: number
          longitude: number
          name: string
          neighborhood: string
          nickname: string
          notes: string
          phone: string
          postal_code: string
          state: string
          surname: string
          tags: string[]
          total_count: number
          updated_at: string
        }[]
      }
      search_knowledge_base: {
        Args: { max_results?: number; search_query: string }
        Returns: {
          category: string
          content: string
          id: string
          rank: number
          tags: string[]
          title: string
        }[]
      }
      search_my_calls: {
        Args: {
          p_channel?: string
          p_direction?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_q?: string
          p_result?: string
          p_scope?: string
          p_to?: string
        }
        Returns: {
          agent_id: string
          agent_notes: string
          answered_at: string
          answered_by: string
          channel: string
          contact_avatar_url: string
          contact_id: string
          contact_name: string
          contact_phone: string
          direction: string
          end_reason: string
          ended_at: string
          id: string
          notes: string
          peer_name: string
          peer_number: string
          recording_status: string
          started_at: string
          status: string
          talk_seconds: number
          total_count: number
        }[]
      }
      search_team_messages: {
        Args: { p_conversation_id: string; p_limit?: number; p_query: string }
        Returns: {
          content: string
          created_at: string
          id: string
          sender_id: string
          sender_name: string
        }[]
      }
      set_call_agent_notes: {
        Args: { p_call_id: string; p_notes: string }
        Returns: undefined
      }
      set_conversation_status: {
        Args: { p_contact_id: string; p_next: string; p_reason?: string }
        Returns: undefined
      }
      set_department_whatsapp_config: {
        Args: {
          p_api_key?: string
          p_department_id: string
          p_instance_id?: string
          p_whatsapp_mode: string
        }
        Returns: Json
      }
      set_instance_token: {
        Args: { p_connection_id: string; p_token: string }
        Returns: string
      }
      set_team_member_pref: {
        Args: { p_conversation_id: string; p_is_muted?: boolean }
        Returns: undefined
      }
      set_team_member_role: {
        Args: {
          p_conversation_id: string
          p_new_role: string
          p_profile_id: string
        }
        Returns: undefined
      }
      skill_based_assign: { Args: { p_queue_id: string }; Returns: string }
      snapshot_talkx_campaign_audience: {
        Args: { p_campaign_id: string; p_expected_revision: number }
        Returns: Json
      }
      store_gmail_tokens: {
        Args: {
          p_access_token: string
          p_account_id: string
          p_refresh_token?: string
        }
        Returns: undefined
      }
      sweep_multiplix_stuck_items: {
        Args: { p_limit?: number }
        Returns: number
      }
      sweep_multiplix_stuck_recipients: {
        Args: { p_limit?: number }
        Returns: number
      }
      sweep_talkx_stuck_recipients: {
        Args: { p_limit?: number }
        Returns: number
      }
      talk_me_claim: {
        Args: { p_contact_id: string }
        Returns: {
          assigned_to: string
          claimed_at: string
          contact_id: string
          conversation_status: string
          queue_id: string
        }[]
      }
      talk_me_eligible_waiting_contacts: {
        Args: { p_contact_id?: string; p_queue_id?: string }
        Returns: {
          avatar_url: string
          company: string
          contact_id: string
          contact_name: string
          job_title: string
          last_message_at: string
          last_message_caption: string
          last_message_content: string
          last_message_id: string
          last_message_media_url: string
          last_message_type: string
          pending_message_count: number
          queue_id: string
          waiting_since: string
        }[]
      }
      talk_me_list_queues: {
        Args: never
        Returns: {
          oldest_waiting_at: string
          queue_color: string
          queue_id: string
          queue_name: string
          waiting_count: number
        }[]
      }
      talk_me_list_waiting: {
        Args: {
          p_cursor_contact_id?: string
          p_cursor_waiting_since?: string
          p_limit?: number
          p_queue_id: string
          p_search?: string
        }
        Returns: {
          avatar_url: string
          company: string
          contact_id: string
          contact_name: string
          job_title: string
          last_message_at: string
          last_message_caption: string
          last_message_content: string
          last_message_id: string
          last_message_media_url: string
          last_message_type: string
          pending_message_count: number
          queue_color: string
          queue_id: string
          queue_name: string
          queue_position: number
          total_count: number
          waiting_since: string
        }[]
      }
      talkx_analytics_scope: {
        Args: {
          p_audience_source?: string
          p_channel?: string
          p_department_id?: string
        }
        Returns: {
          campaign_id: string
        }[]
      }
      talkx_audience_query: {
        Args: {
          p_contact_ids?: string[]
          p_respect_suppression?: boolean
          p_rules: Json
        }
        Returns: {
          id: string
          invalid_phone: boolean
          is_suppressed: boolean
          legacy_or_deleted: boolean
        }[]
      }
      talkx_benchmarks: { Args: never; Returns: Json }
      talkx_campaign_logs: {
        Args: { p_after?: string; p_campaign_id: string; p_limit?: number }
        Returns: {
          attempt: number
          campaign_id: string
          created_at: string
          duration_ms: number
          error_code: string
          http_status: number
          id: string
          outcome: string
          recipient_id: string
          stage: string
          worker_id: string
        }[]
      }
      talkx_campaign_pace: { Args: { p_campaign_id: string }; Returns: Json }
      talkx_campaign_reply_stats: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      talkx_campaign_report: { Args: { p_campaign: string }; Returns: Json }
      talkx_connection_send_budget: {
        Args: { p_connection_id: string }
        Returns: Json
      }
      talkx_delete_link: { Args: { p_link_id: string }; Returns: Json }
      talkx_engine_alerts: { Args: never; Returns: Json }
      talkx_engine_cron_runs: {
        Args: { p_limit?: number }
        Returns: {
          end_time: string
          jobid: number
          return_message: string
          runid: number
          start_time: string
          status: string
        }[]
      }
      talkx_engine_window_open: {
        Args: { p_campaign_id: string }
        Returns: boolean
      }
      talkx_increment_delivered: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      talkx_match_optout: { Args: { p_text: string }; Returns: string }
      talkx_next_recipients: {
        Args: { p_campaign_id: string; p_limit?: number }
        Returns: {
          attempt_count: number
          contact_company: string
          contact_id: string
          contact_name: string
          contact_nickname: string
          contact_phone: string
          personalized_message: string
          recipient_id: string
          retry_after: string
          status: string
        }[]
      }
      talkx_normalize_optout_text: { Args: { p_text: string }; Returns: string }
      talkx_overview_stats: {
        Args: {
          p_audience_source?: string
          p_channel?: string
          p_department_id?: string
          p_from: string
          p_timezone?: string
          p_to: string
        }
        Returns: Json
      }
      talkx_recipient_is_suppressed: {
        Args: { p_contact_id: string; p_phone: string }
        Returns: boolean
      }
      talkx_resolve_audience: {
        Args: {
          p_after?: string
          p_limit?: number
          p_mode?: string
          p_rules?: Json
          p_segment_ids?: string[]
        }
        Returns: Json
      }
      talkx_resolve_speed_pace: {
        Args: {
          p_send_interval_max: number
          p_send_interval_min: number
          p_speed_profile: string
          p_typing_delay_max: number
          p_typing_delay_min: number
        }
        Returns: {
          send_interval_max: number
          send_interval_min: number
          speed_profile: string
          typing_delay_max: number
          typing_delay_min: number
        }[]
      }
      talkx_segment_tags: { Args: { p_segment: string }; Returns: Json }
      talkx_set_campaign_investment: {
        Args: { p_campaign_id: string; p_investment: number }
        Returns: Json
      }
      talkx_suppress_contact: {
        Args: {
          p_campaign_id?: string
          p_contact_id: string
          p_origin: string
          p_phone: string
          p_reason: string
          p_reason_code: Database["public"]["Enums"]["talkx_blacklist_reason"]
          p_source_message_id: string
        }
        Returns: string
      }
      talkx_upsert_link: {
        Args: {
          p_campaign_id: string
          p_label: string
          p_link_id?: string
          p_target_url: string
          p_utm_campaign?: string
          p_utm_content?: string
          p_utm_medium?: string
          p_utm_source?: string
          p_utm_term?: string
        }
        Returns: Json
      }
      toggle_team_reaction: {
        Args: { p_emoji: string; p_message_id: string }
        Returns: Json
      }
      transfer_team_conversation_department: {
        Args: { p_conversation_id: string; p_to_department_id: string }
        Returns: Json
      }
      transition_multiplix_dispatch: {
        Args: {
          p_action: string
          p_dispatch_id: string
          p_pause_reason?: string
        }
        Returns: {
          current_status: string
          dispatch_id: string
          previous_status: string
        }[]
      }
      transition_talkx_campaign: {
        Args: {
          p_action: string
          p_actor_id?: string
          p_campaign_id: string
          p_pause_reason?: string
        }
        Returns: {
          campaign_id: string
          current_status: string
          previous_status: string
        }[]
      }
      trigger_ai_jobs_tick: { Args: never; Returns: undefined }
      trigger_pending_multiplix_dispatches: { Args: never; Returns: undefined }
      trigger_talkx_engine_tick: { Args: never; Returns: undefined }
      update_agent_streak: {
        Args: { p_increment: boolean; p_profile_id: string }
        Returns: Json
      }
      update_own_profile: {
        Args: {
          p_avatar_url?: string
          p_birthday?: string
          p_display_name?: string
          p_email?: string
          p_phone?: string
          p_signature?: string
        }
        Returns: boolean
      }
      update_talkx_campaign_limits: {
        Args: {
          p_campaign_id: string
          p_expected_revision: number
          p_limits: Json
        }
        Returns: {
          campaign_id: string
          revision: number
        }[]
      }
      update_talkx_template_with_snapshot: {
        Args: {
          p_category: string
          p_content: string
          p_custom_variables: string[]
          p_description: string
          p_expected_updated_at: string
          p_media_type: string
          p_media_url: string
          p_name: string
          p_status: string
          p_tags: string[]
          p_template_id: string
        }
        Returns: {
          template_id: string
          updated_at: string
          version_number: number
        }[]
      }
      upsert_crm_contact_link_guarded: {
        Args: {
          p_external_company_id: string
          p_external_contact_id: string
          p_normalized_phone: string
          p_zapp_contact_id: string
        }
        Returns: undefined
      }
      upsert_my_call: {
        Args: {
          p_answered_at?: string
          p_channel?: string
          p_contact_id?: string
          p_direction: string
          p_end_reason?: string
          p_ended_at?: string
          p_id: string
          p_peer_name?: string
          p_peer_number?: string
          p_provider_call_id?: string
          p_status?: string
          p_talk_seconds?: number
        }
        Returns: string
      }
      user_has_permission: {
        Args: { _permission_name: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      ai_provider_type:
        | "lovable_ai"
        | "openai_compatible"
        | "google_gemini"
        | "custom_webhook"
        | "custom_agent"
      app_role: "admin" | "supervisor" | "agent" | "special_agent"
      channel_type:
        | "whatsapp"
        | "instagram"
        | "telegram"
        | "messenger"
        | "webchat"
        | "email"
      multiplix_block_type: "text" | "voice_ai" | "audio_recorded" | "file"
      multiplix_dispatch_status:
        | "draft"
        | "scheduled"
        | "sending"
        | "paused"
        | "completed"
        | "completed_with_failures"
        | "failed"
        | "cancelled"
      multiplix_eligibility:
        | "eligible"
        | "no_destination"
        | "suppressed"
        | "out_of_scope"
        | "media_pending"
        | "connection_unavailable"
        | "requires_template"
      multiplix_item_status:
        | "pending"
        | "sending"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "failed_transient"
        | "skipped"
        | "cancelled"
        | "outcome_unknown"
      multiplix_recipient_status:
        | "pending"
        | "sending"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "skipped"
        | "cancelled"
        | "outcome_unknown"
      service_account_type:
        | "google_sheets"
        | "google_docs"
        | "google_calendar"
        | "google_drive"
        | "dropbox"
      talkx_blacklist_reason:
        | "opt_out"
        | "invalid_number"
        | "manual"
        | "lgpd"
        | "no_commercial_permission"
        | "bounce"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_provider_type: [
        "lovable_ai",
        "openai_compatible",
        "google_gemini",
        "custom_webhook",
        "custom_agent",
      ],
      app_role: ["admin", "supervisor", "agent", "special_agent"],
      channel_type: [
        "whatsapp",
        "instagram",
        "telegram",
        "messenger",
        "webchat",
        "email",
      ],
      multiplix_block_type: ["text", "voice_ai", "audio_recorded", "file"],
      multiplix_dispatch_status: [
        "draft",
        "scheduled",
        "sending",
        "paused",
        "completed",
        "completed_with_failures",
        "failed",
        "cancelled",
      ],
      multiplix_eligibility: [
        "eligible",
        "no_destination",
        "suppressed",
        "out_of_scope",
        "media_pending",
        "connection_unavailable",
        "requires_template",
      ],
      multiplix_item_status: [
        "pending",
        "sending",
        "sent",
        "delivered",
        "read",
        "failed",
        "failed_transient",
        "skipped",
        "cancelled",
        "outcome_unknown",
      ],
      multiplix_recipient_status: [
        "pending",
        "sending",
        "sent",
        "delivered",
        "read",
        "failed",
        "skipped",
        "cancelled",
        "outcome_unknown",
      ],
      service_account_type: [
        "google_sheets",
        "google_docs",
        "google_calendar",
        "google_drive",
        "dropbox",
      ],
      talkx_blacklist_reason: [
        "opt_out",
        "invalid_number",
        "manual",
        "lgpd",
        "no_commercial_permission",
        "bounce",
      ],
    },
  },
} as const
