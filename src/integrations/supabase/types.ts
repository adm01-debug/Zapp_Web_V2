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
          created_at: string
          duration_ms: number | null
          error_message: string | null
          function_name: string
          id: string
          input_tokens: number | null
          metadata: Json | null
          model: string | null
          output_tokens: number | null
          profile_id: string | null
          status: string
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          function_name: string
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model?: string | null
          output_tokens?: number | null
          profile_id?: string | null
          status?: string
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          function_name?: string
          id?: string
          input_tokens?: number | null
          metadata?: Json | null
          model?: string | null
          output_tokens?: number | null
          profile_id?: string | null
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
          answered_at: string | null
          contact_id: string | null
          created_at: string
          direction: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          notes: string | null
          provider_event_id: string | null
          recording_url: string | null
          started_at: string
          status: string
          whatsapp_connection_id: string | null
        }
        Insert: {
          agent_id?: string | null
          answered_at?: string | null
          contact_id?: string | null
          created_at?: string
          direction: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          provider_event_id?: string | null
          recording_url?: string | null
          started_at?: string
          status?: string
          whatsapp_connection_id?: string | null
        }
        Update: {
          agent_id?: string | null
          answered_at?: string | null
          contact_id?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          provider_event_id?: string | null
          recording_url?: string | null
          started_at?: string
          status?: string
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
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          ai_priority: string | null
          ai_sentiment: string | null
          assigned_to: string | null
          avatar_fetch_attempted_at: string | null
          avatar_url: string | null
          channel_connection_id: string | null
          channel_type: string | null
          company: string | null
          consent_status: string | null
          contact_type: string | null
          conversation_status: string
          conversation_status_changed_at: string | null
          created_at: string
          email: string | null
          group_category: string | null
          id: string
          is_lid_legacy: boolean
          job_title: string | null
          lead_origin: string | null
          lead_score: number | null
          name: string
          nickname: string | null
          notes: string | null
          phone: string
          queue_id: string | null
          risk_score: number | null
          surname: string | null
          tags: string[] | null
          updated_at: string
          whatsapp_connection_id: string | null
        }
        Insert: {
          ai_priority?: string | null
          ai_sentiment?: string | null
          assigned_to?: string | null
          avatar_fetch_attempted_at?: string | null
          avatar_url?: string | null
          channel_connection_id?: string | null
          channel_type?: string | null
          company?: string | null
          consent_status?: string | null
          contact_type?: string | null
          conversation_status?: string
          conversation_status_changed_at?: string | null
          created_at?: string
          email?: string | null
          group_category?: string | null
          id?: string
          is_lid_legacy?: boolean
          job_title?: string | null
          lead_origin?: string | null
          lead_score?: number | null
          name: string
          nickname?: string | null
          notes?: string | null
          phone: string
          queue_id?: string | null
          risk_score?: number | null
          surname?: string | null
          tags?: string[] | null
          updated_at?: string
          whatsapp_connection_id?: string | null
        }
        Update: {
          ai_priority?: string | null
          ai_sentiment?: string | null
          assigned_to?: string | null
          avatar_fetch_attempted_at?: string | null
          avatar_url?: string | null
          channel_connection_id?: string | null
          channel_type?: string | null
          company?: string | null
          consent_status?: string | null
          contact_type?: string | null
          conversation_status?: string
          conversation_status_changed_at?: string | null
          created_at?: string
          email?: string | null
          group_category?: string | null
          id?: string
          is_lid_legacy?: boolean
          job_title?: string | null
          lead_origin?: string | null
          lead_score?: number | null
          name?: string
          nickname?: string | null
          notes?: string | null
          phone?: string
          queue_id?: string | null