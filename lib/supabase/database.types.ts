export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  pr_tracker: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      default_route_steps: {
        Row: {
          id: string
          office_id: string
          purpose: string
          step_order: number
        }
        Insert: {
          id?: string
          office_id: string
          purpose: string
          step_order: number
        }
        Update: {
          id?: string
          office_id?: string
          purpose?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "default_route_steps_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: number
          profile_id: string
          read_at: string
        }
        Insert: {
          notification_id: number
          profile_id: string
          read_at?: string
        }
        Update: {
          notification_id?: number
          profile_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          event_id: number
          id: number
          pr_id: string
          recipient_office_id: string
          type: Database["pr_tracker"]["Enums"]["event_type"]
        }
        Insert: {
          created_at?: string
          event_id: number
          id?: never
          pr_id: string
          recipient_office_id: string
          type: Database["pr_tracker"]["Enums"]["event_type"]
        }
        Update: {
          created_at?: string
          event_id?: number
          id?: never
          pr_id?: string
          recipient_office_id?: string
          type?: Database["pr_tracker"]["Enums"]["event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "followed_activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "pr_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "pr_timeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "pr_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_office_id_fkey"
            columns: ["recipient_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      office_statuses: {
        Row: {
          active: boolean
          allows_completion: boolean
          id: string
          label: string
          office_id: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          allows_completion?: boolean
          id?: string
          label: string
          office_id: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          allows_completion?: boolean
          id?: string
          label?: string
          office_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "office_statuses_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      offices: {
        Row: {
          active: boolean
          can_assign_pr_no: boolean
          can_complete: boolean
          can_set_mode_of_procurement: boolean
          code: string
          created_at: string
          id: string
          is_processing_office: boolean
          name: string
        }
        Insert: {
          active?: boolean
          can_assign_pr_no?: boolean
          can_complete?: boolean
          can_set_mode_of_procurement?: boolean
          code: string
          created_at?: string
          id?: string
          is_processing_office?: boolean
          name: string
        }
        Update: {
          active?: boolean
          can_assign_pr_no?: boolean
          can_complete?: boolean
          can_set_mode_of_procurement?: boolean
          code?: string
          created_at?: string
          id?: string
          is_processing_office?: boolean
          name?: string
        }
        Relationships: []
      }
      pr_attachments: {
        Row: {
          created_at: string
          filename: string
          id: string
          is_pr_document: boolean
          mime_type: string
          office_id: string
          pr_id: string
          size_bytes: number
          storage_path: string
          superseded_at: string | null
          superseded_reason: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          is_pr_document?: boolean
          mime_type: string
          office_id: string
          pr_id: string
          size_bytes: number
          storage_path: string
          superseded_at?: string | null
          superseded_reason?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          is_pr_document?: boolean
          mime_type?: string
          office_id?: string
          pr_id?: string
          size_bytes?: number
          storage_path?: string
          superseded_at?: string | null
          superseded_reason?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pr_attachments_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_attachments_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "pr_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_attachments_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_events: {
        Row: {
          actor_id: string
          actor_office_id: string | null
          created_at: string
          event_type: Database["pr_tracker"]["Enums"]["event_type"]
          from_office_id: string | null
          from_route_step: number | null
          id: number
          is_private: boolean
          override_reason: string | null
          payload: Json
          pr_id: string
          remark: string | null
          route_purpose: string | null
          status_id: string | null
          to_office_id: string | null
          to_route_step: number | null
        }
        Insert: {
          actor_id: string
          actor_office_id?: string | null
          created_at?: string
          event_type: Database["pr_tracker"]["Enums"]["event_type"]
          from_office_id?: string | null
          from_route_step?: number | null
          id?: never
          is_private?: boolean
          override_reason?: string | null
          payload?: Json
          pr_id: string
          remark?: string | null
          route_purpose?: string | null
          status_id?: string | null
          to_office_id?: string | null
          to_route_step?: number | null
        }
        Update: {
          actor_id?: string
          actor_office_id?: string | null
          created_at?: string
          event_type?: Database["pr_tracker"]["Enums"]["event_type"]
          from_office_id?: string | null
          from_route_step?: number | null
          id?: never
          is_private?: boolean
          override_reason?: string | null
          payload?: Json
          pr_id?: string
          remark?: string | null
          route_purpose?: string | null
          status_id?: string | null
          to_office_id?: string | null
          to_route_step?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pr_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_events_actor_office_id_fkey"
            columns: ["actor_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_events_from_office_id_fkey"
            columns: ["from_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_events_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "pr_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_events_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_events_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "office_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_events_to_office_id_fkey"
            columns: ["to_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_followers: {
        Row: {
          created_at: string
          office_id: string
          pr_id: string
        }
        Insert: {
          created_at?: string
          office_id: string
          pr_id: string
        }
        Update: {
          created_at?: string
          office_id?: string
          pr_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pr_followers_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_followers_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "pr_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_followers_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_involved_offices: {
        Row: {
          office_id: string
          pr_id: string
        }
        Insert: {
          office_id: string
          pr_id: string
        }
        Update: {
          office_id?: string
          pr_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pr_involved_offices_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_involved_offices_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "pr_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_involved_offices_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_private_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          office_id: string
          pr_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          office_id: string
          pr_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          office_id?: string
          pr_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pr_private_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_private_notes_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_private_notes_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "pr_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_private_notes_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_remarks: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          office_id: string | null
          pr_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          office_id?: string | null
          pr_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          office_id?: string | null
          pr_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pr_remarks_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_remarks_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_remarks_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "pr_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_remarks_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          auth_user_id: string | null
          created_at: string
          designation: string | null
          email: string
          full_name: string
          id: string
          office_id: string | null
          role: Database["pr_tracker"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string
          designation?: string | null
          email: string
          full_name: string
          id?: string
          office_id?: string | null
          role?: Database["pr_tracker"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string
          designation?: string | null
          email?: string
          full_name?: string
          id?: string
          office_id?: string | null
          role?: Database["pr_tracker"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          current_office_id: string
          current_purpose: string | null
          current_since: string
          current_status_id: string | null
          first_forwarded_at: string | null
          fund_cluster: string | null
          id: string
          mode_of_procurement: string | null
          movement_state: Database["pr_tracker"]["Enums"]["movement_state"]
          origin_office_id: string
          pr_date: string
          pr_no: string | null
          prev_route_step: number | null
          purpose: string
          requested_by_designation: string | null
          requested_by_name: string
          responsibility_center_code: string | null
          route_step: number
          routing_slip_no: string
          sent_by_office_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          current_office_id: string
          current_purpose?: string | null
          current_since?: string
          current_status_id?: string | null
          first_forwarded_at?: string | null
          fund_cluster?: string | null
          id?: string
          mode_of_procurement?: string | null
          movement_state?: Database["pr_tracker"]["Enums"]["movement_state"]
          origin_office_id: string
          pr_date?: string
          pr_no?: string | null
          prev_route_step?: number | null
          purpose: string
          requested_by_designation?: string | null
          requested_by_name: string
          responsibility_center_code?: string | null
          route_step?: number
          routing_slip_no: string
          sent_by_office_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          current_office_id?: string
          current_purpose?: string | null
          current_since?: string
          current_status_id?: string | null
          first_forwarded_at?: string | null
          fund_cluster?: string | null
          id?: string
          mode_of_procurement?: string | null
          movement_state?: Database["pr_tracker"]["Enums"]["movement_state"]
          origin_office_id?: string
          pr_date?: string
          pr_no?: string | null
          prev_route_step?: number | null
          purpose?: string
          requested_by_designation?: string | null
          requested_by_name?: string
          responsibility_center_code?: string | null
          route_step?: number
          routing_slip_no?: string
          sent_by_office_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_current_office_id_fkey"
            columns: ["current_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_current_status_id_fkey"
            columns: ["current_status_id"]
            isOneToOne: false
            referencedRelation: "office_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_origin_office_id_fkey"
            columns: ["origin_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_sent_by_office_id_fkey"
            columns: ["sent_by_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_slip_counters: {
        Row: {
          last_value: number
          year: number
        }
        Insert: {
          last_value?: number
          year: number
        }
        Update: {
          last_value?: number
          year?: number
        }
        Relationships: []
      }
      saao_access: {
        Row: {
          granted_at: string
          granted_by: string | null
          profile_id: string
          role: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          profile_id: string
          role: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "saao_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saao_access_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saao_allotments: {
        Row: {
          allotment_date: string | null
          amount: number
          created_at: string
          created_by: string | null
          id: string
          node_id: string
          reference_no: string | null
          remarks: string | null
          status: string
        }
        Insert: {
          allotment_date?: string | null
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          node_id: string
          reference_no?: string | null
          remarks?: string | null
          status?: string
        }
        Update: {
          allotment_date?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          node_id?: string
          reference_no?: string | null
          remarks?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "saao_allotments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saao_allotments_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "saao_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      saao_audit: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          at: string
          before: Json | null
          book_id: string | null
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          book_id?: string | null
          entity: string
          entity_id?: string | null
          id?: number
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          book_id?: string | null
          entity?: string
          entity_id?: string | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "saao_audit_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saao_audit_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "saao_books"
            referencedColumns: ["id"]
          },
        ]
      }
      saao_books: {
        Row: {
          allotment_mode: string
          certifier_name: string | null
          certifier_title: string | null
          created_at: string
          created_by: string | null
          extra_labels: Json
          fiscal_year: number
          fund_id: string
          header_lines: Json
          id: string
          movement_rule: string
          title: string
        }
        Insert: {
          allotment_mode?: string
          certifier_name?: string | null
          certifier_title?: string | null
          created_at?: string
          created_by?: string | null
          extra_labels?: Json
          fiscal_year: number
          fund_id: string
          header_lines?: Json
          id?: string
          movement_rule?: string
          title: string
        }
        Update: {
          allotment_mode?: string
          certifier_name?: string | null
          certifier_title?: string | null
          created_at?: string
          created_by?: string | null
          extra_labels?: Json
          fiscal_year?: number
          fund_id?: string
          header_lines?: Json
          id?: string
          movement_rule?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "saao_books_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saao_books_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "saao_funds"
            referencedColumns: ["id"]
          },
        ]
      }
      saao_classifications: {
        Row: {
          active: boolean
          code: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      saao_funds: {
        Row: {
          active: boolean
          code: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      saao_line_extras: {
        Row: {
          amount: number | null
          field: string
          mode: string
          node_id: string
        }
        Insert: {
          amount?: number | null
          field: string
          mode: string
          node_id: string
        }
        Update: {
          amount?: number | null
          field?: string
          mode?: string
          node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saao_line_extras_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "saao_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      saao_movement_lines: {
        Row: {
          amount: number
          id: string
          movement_id: string
          node_id: string
        }
        Insert: {
          amount: number
          id?: string
          movement_id: string
          node_id: string
        }
        Update: {
          amount?: number
          id?: string
          movement_id?: string
          node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saao_movement_lines_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "saao_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saao_movement_lines_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "saao_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      saao_movements: {
        Row: {
          book_id: string
          created_at: string
          created_by: string | null
          effective_date: string
          id: string
          kind: string
          reference_no: string | null
          remarks: string | null
          sb_number: number | null
          status: string
          status_note: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          book_id: string
          created_at?: string
          created_by?: string | null
          effective_date: string
          id?: string
          kind: string
          reference_no?: string | null
          remarks?: string | null
          sb_number?: number | null
          status?: string
          status_note?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          kind?: string
          reference_no?: string | null
          remarks?: string | null
          sb_number?: number | null
          status?: string
          status_note?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saao_movements_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "saao_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saao_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saao_nodes: {
        Row: {
          account_code: string | null
          active: boolean
          appropriation: number
          appropriation_ref: string | null
          book_id: string
          classification_id: string | null
          created_at: string
          id: string
          kind: string
          label: string
          office_id: string | null
          parent_id: string | null
          show_total: boolean
          sort_order: number
          total_label: string | null
          updated_at: string
        }
        Insert: {
          account_code?: string | null
          active?: boolean
          appropriation?: number
          appropriation_ref?: string | null
          book_id: string
          classification_id?: string | null
          created_at?: string
          id?: string
          kind: string
          label: string
          office_id?: string | null
          parent_id?: string | null
          show_total?: boolean
          sort_order?: number
          total_label?: string | null
          updated_at?: string
        }
        Update: {
          account_code?: string | null
          active?: boolean
          appropriation?: number
          appropriation_ref?: string | null
          book_id?: string
          classification_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string
          office_id?: string | null
          parent_id?: string | null
          show_total?: boolean
          sort_order?: number
          total_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saao_nodes_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "saao_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saao_nodes_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "saao_classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saao_nodes_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saao_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "saao_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      saao_obligations: {
        Row: {
          amount: number
          entry: string | null
          month: number
          node_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          entry?: string | null
          month: number
          node_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          entry?: string | null
          month?: number
          node_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saao_obligations_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "saao_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saao_obligations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saao_report_rows: {
        Row: {
          account_code: string | null
          adjusted: number | null
          allotment: number | null
          appropriation: number | null
          balance_allotment: number | null
          balance_appropriation: number | null
          classification_code: string | null
          classification_name: string | null
          cna_1: number | null
          cna_2: number | null
          cna_3: number | null
          depth: number
          kind: string
          label: string
          months: number[] | null
          node_id: string | null
          nta: number | null
          obligation: number | null
          parent_seq: number | null
          realignment: number | null
          report_id: string
          savings: number | null
          savings_half: number | null
          sb: Json | null
          section_seq: number
          seq: number
          show_total: boolean
          supplemental: number | null
          total_changes: number | null
          total_label: string | null
        }
        Insert: {
          account_code?: string | null
          adjusted?: number | null
          allotment?: number | null
          appropriation?: number | null
          balance_allotment?: number | null
          balance_appropriation?: number | null
          classification_code?: string | null
          classification_name?: string | null
          cna_1?: number | null
          cna_2?: number | null
          cna_3?: number | null
          depth: number
          kind: string
          label: string
          months?: number[] | null
          node_id?: string | null
          nta?: number | null
          obligation?: number | null
          parent_seq?: number | null
          realignment?: number | null
          report_id: string
          savings?: number | null
          savings_half?: number | null
          sb?: Json | null
          section_seq: number
          seq: number
          show_total: boolean
          supplemental?: number | null
          total_changes?: number | null
          total_label?: string | null
        }
        Update: {
          account_code?: string | null
          adjusted?: number | null
          allotment?: number | null
          appropriation?: number | null
          balance_allotment?: number | null
          balance_appropriation?: number | null
          classification_code?: string | null
          classification_name?: string | null
          cna_1?: number | null
          cna_2?: number | null
          cna_3?: number | null
          depth?: number
          kind?: string
          label?: string
          months?: number[] | null
          node_id?: string | null
          nta?: number | null
          obligation?: number | null
          parent_seq?: number | null
          realignment?: number | null
          report_id?: string
          savings?: number | null
          savings_half?: number | null
          sb?: Json | null
          section_seq?: number
          seq?: number
          show_total?: boolean
          supplemental?: number | null
          total_changes?: number | null
          total_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saao_report_rows_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "saao_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      saao_reports: {
        Row: {
          acknowledged_unapproved: Json | null
          book_id: string
          created_at: string
          created_by: string | null
          cutoff_date: string
          finalized_at: string | null
          finalized_by: string | null
          header: Json | null
          id: string
          movements: Json | null
          revision_of: string | null
          revision_reason: string | null
          rules: Json | null
          status: string
          version: number
        }
        Insert: {
          acknowledged_unapproved?: Json | null
          book_id: string
          created_at?: string
          created_by?: string | null
          cutoff_date: string
          finalized_at?: string | null
          finalized_by?: string | null
          header?: Json | null
          id?: string
          movements?: Json | null
          revision_of?: string | null
          revision_reason?: string | null
          rules?: Json | null
          status?: string
          version?: number
        }
        Update: {
          acknowledged_unapproved?: Json | null
          book_id?: string
          created_at?: string
          created_by?: string | null
          cutoff_date?: string
          finalized_at?: string | null
          finalized_by?: string | null
          header?: Json | null
          id?: string
          movements?: Json | null
          revision_of?: string | null
          revision_reason?: string | null
          rules?: Json | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "saao_reports_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "saao_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saao_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saao_reports_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saao_reports_revision_of_fkey"
            columns: ["revision_of"]
            isOneToOne: false
            referencedRelation: "saao_reports"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      followed_activity: {
        Row: {
          actor_name: string | null
          actor_office_name: string | null
          created_at: string | null
          event_type: Database["pr_tracker"]["Enums"]["event_type"] | null
          id: number | null
          pr_id: string | null
          purpose: string | null
          routing_slip_no: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pr_events_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "pr_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_events_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_overview: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: string | null
          current_office_code: string | null
          current_office_id: string | null
          current_office_name: string | null
          current_purpose: string | null
          current_since: string | null
          current_status_id: string | null
          current_status_label: string | null
          days_here: number | null
          first_forwarded_at: string | null
          fund_cluster: string | null
          has_pr_document: boolean | null
          id: string | null
          mode_of_procurement: string | null
          movement_state:
            | Database["pr_tracker"]["Enums"]["movement_state"]
            | null
          origin_office_code: string | null
          origin_office_id: string | null
          origin_office_name: string | null
          pr_date: string | null
          pr_no: string | null
          prev_route_step: number | null
          purpose: string | null
          requested_by_designation: string | null
          requested_by_name: string | null
          responsibility_center_code: string | null
          route_step: number | null
          routing_slip_no: string | null
          sent_by_office_id: string | null
          sent_by_office_name: string | null
          total_steps: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_current_office_id_fkey"
            columns: ["current_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_current_status_id_fkey"
            columns: ["current_status_id"]
            isOneToOne: false
            referencedRelation: "office_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_origin_office_id_fkey"
            columns: ["origin_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_sent_by_office_id_fkey"
            columns: ["sent_by_office_id"]
            isOneToOne: false
            referencedRelation: "offices"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_timeline: {
        Row: {
          actor_name: string | null
          actor_office_name: string | null
          created_at: string | null
          event_type: Database["pr_tracker"]["Enums"]["event_type"] | null
          from_office_name: string | null
          from_route_step: number | null
          id: number | null
          is_private: boolean | null
          override_reason: string | null
          payload: Json | null
          pr_id: string | null
          remark: string | null
          route_purpose: string | null
          status_label: string | null
          to_office_name: string | null
          to_route_step: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pr_events_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "pr_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_events_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _actor: {
        Args: never
        Returns: {
          active: boolean
          auth_user_id: string | null
          created_at: string
          designation: string | null
          email: string
          full_name: string
          id: string
          office_id: string | null
          role: Database["pr_tracker"]["Enums"]["user_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _actor_with_office: {
        Args: never
        Returns: {
          active: boolean
          auth_user_id: string | null
          created_at: string
          designation: string | null
          email: string
          full_name: string
          id: string
          office_id: string | null
          role: Database["pr_tracker"]["Enums"]["user_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _add_remark: {
        Args: {
          p_actor: Database["pr_tracker"]["Tables"]["profiles"]["Row"]
          p_body: string
          p_pr_id: string
        }
        Returns: undefined
      }
      _allowed_mime_types: { Args: never; Returns: string[] }
      _can_origin_edit: {
        Args: {
          p_pr: Database["pr_tracker"]["Tables"]["purchase_requests"]["Row"]
        }
        Returns: boolean
      }
      _clean: { Args: { p: string }; Returns: string }
      _followers: { Args: { p_pr_id: string }; Returns: string[] }
      _is_holder: {
        Args: {
          p_office_id: string
          p_pr: Database["pr_tracker"]["Tables"]["purchase_requests"]["Row"]
        }
        Returns: boolean
      }
      _lock_pr: {
        Args: { p_pr_id: string }
        Returns: {
          amount: number
          created_at: string
          created_by: string
          current_office_id: string
          current_purpose: string | null
          current_since: string
          current_status_id: string | null
          first_forwarded_at: string | null
          fund_cluster: string | null
          id: string
          mode_of_procurement: string | null
          movement_state: Database["pr_tracker"]["Enums"]["movement_state"]
          origin_office_id: string
          pr_date: string
          pr_no: string | null
          prev_route_step: number | null
          purpose: string
          requested_by_designation: string | null
          requested_by_name: string
          responsibility_center_code: string | null
          route_step: number
          routing_slip_no: string
          sent_by_office_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "purchase_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _log_event: {
        Args: {
          p_actor: Database["pr_tracker"]["Tables"]["profiles"]["Row"]
          p_fields?: Json
          p_pr_id: string
          p_type: Database["pr_tracker"]["Enums"]["event_type"]
        }
        Returns: number
      }
      _next_route_step: {
        Args: { p_holder_office: string; p_route_step: number }
        Returns: {
          id: string
          office_id: string
          purpose: string
          step_order: number
        }
        SetofOptions: {
          from: "*"
          to: "default_route_steps"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _next_routing_slip_no: { Args: never; Returns: string }
      _notify: {
        Args: {
          p_event_id: number
          p_exclude: string
          p_offices: string[]
          p_pr_id: string
          p_type: Database["pr_tracker"]["Enums"]["event_type"]
        }
        Returns: undefined
      }
      _pr_snapshot: { Args: { p_pr_id: string }; Returns: Json }
      _require_admin: { Args: never; Returns: undefined }
      _require_holder: {
        Args: {
          p_actor: Database["pr_tracker"]["Tables"]["profiles"]["Row"]
          p_pr: Database["pr_tracker"]["Tables"]["purchase_requests"]["Row"]
        }
        Returns: undefined
      }
      _require_received_holder: {
        Args: {
          p_actor: Database["pr_tracker"]["Tables"]["profiles"]["Row"]
          p_pr: Database["pr_tracker"]["Tables"]["purchase_requests"]["Row"]
        }
        Returns: undefined
      }
      _saao_audit: {
        Args: {
          p_action: string
          p_actor_id: string
          p_after: Json
          p_before: Json
          p_book_id: string
          p_entity: string
          p_entity_id: string
        }
        Returns: undefined
      }
      _saao_build_rows: {
        Args: { p_book_id: string; p_cutoff: string; p_report_id: string }
        Returns: {
          account_code: string | null
          adjusted: number | null
          allotment: number | null
          appropriation: number | null
          balance_allotment: number | null
          balance_appropriation: number | null
          classification_code: string | null
          classification_name: string | null
          cna_1: number | null
          cna_2: number | null
          cna_3: number | null
          depth: number
          kind: string
          label: string
          months: number[] | null
          node_id: string | null
          nta: number | null
          obligation: number | null
          parent_seq: number | null
          realignment: number | null
          report_id: string
          savings: number | null
          savings_half: number | null
          sb: Json | null
          section_seq: number
          seq: number
          show_total: boolean
          supplemental: number | null
          total_changes: number | null
          total_label: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "saao_report_rows"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      _saao_counted_movements: {
        Args: { p_book_id: string; p_cutoff: string }
        Returns: {
          effective_date: string
          id: string
          kind: string
          reference_no: string
          sb_number: number
          status: string
          status_note: string
          title: string
          total: number
        }[]
      }
      _saao_line_book: {
        Args: { p_book_id: string; p_node_id: string }
        Returns: string
      }
      _saao_line_has_figures: { Args: { p_node_id: string }; Returns: boolean }
      _saao_lock_book_shared: {
        Args: { p_book_id: string }
        Returns: undefined
      }
      _saao_node_is_live: { Args: { p_node_id: string }; Returns: boolean }
      _saao_place_node: {
        Args: { p_after_id: string; p_node_id: string; p_parent_id: string }
        Returns: undefined
      }
      _saao_rank: { Args: { p_role: string }; Returns: number }
      _saao_require: {
        Args: { p_min: string }
        Returns: {
          active: boolean
          auth_user_id: string | null
          created_at: string
          designation: string | null
          email: string
          full_name: string
          id: string
          office_id: string | null
          role: Database["pr_tracker"]["Enums"]["user_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _saao_require_live: { Args: { p_node_id: string }; Returns: undefined }
      _saao_tree_rows: {
        Args: { p_book_id: string }
        Returns: {
          account_code: string
          classification_code: string
          classification_name: string
          depth: number
          kind: string
          label: string
          node_id: string
          parent_seq: number
          section_seq: number
          seq: number
          show_total: boolean
          total_label: string
        }[]
      }
      _saao_valid_account_code: { Args: { p: string }; Returns: undefined }
      _validate_header: { Args: { p_header: Json }; Returns: undefined }
      add_private_note: {
        Args: { p_body: string; p_pr_id: string }
        Returns: undefined
      }
      add_remark: {
        Args: { p_body: string; p_pr_id: string }
        Returns: undefined
      }
      admin_delete_status: { Args: { p_id: string }; Returns: undefined }
      admin_set_route: { Args: { p_steps: Json }; Returns: undefined }
      admin_set_setting: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      admin_upsert_office: {
        Args: {
          p_active: boolean
          p_can_assign_pr_no: boolean
          p_can_complete: boolean
          p_can_set_mode_of_procurement: boolean
          p_code: string
          p_id: string
          p_is_processing_office: boolean
          p_name: string
        }
        Returns: string
      }
      admin_upsert_profile: {
        Args: {
          p_active: boolean
          p_designation: string
          p_email: string
          p_full_name: string
          p_id: string
          p_office_id: string
          p_role: Database["pr_tracker"]["Enums"]["user_role"]
        }
        Returns: string
      }
      admin_upsert_status: {
        Args: {
          p_active: boolean
          p_allows_completion?: boolean
          p_id: string
          p_label: string
          p_office_id: string
          p_sort_order: number
        }
        Returns: string
      }
      assign_pr_no: {
        Args: { p_pr_id: string; p_pr_no: string }
        Returns: undefined
      }
      attachment_pr_id: { Args: { p_name: string }; Returns: string }
      can_upload_attachment: { Args: { p_pr_id: string }; Returns: boolean }
      can_view_pr: { Args: { p_pr_id: string }; Returns: boolean }
      cancel_pr: {
        Args: { p_pr_id: string; p_reason: string }
        Returns: undefined
      }
      complete_pr: {
        Args: { p_pr_id: string; p_remark?: string }
        Returns: undefined
      }
      create_pr: { Args: { p_header: Json }; Returns: string }
      current_office_id: { Args: never; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      follow_pr: { Args: { p_pr_id: string }; Returns: undefined }
      forward_pr: {
        Args: {
          p_override_reason?: string
          p_pr_id: string
          p_remark?: string
          p_to_office_id: string
        }
        Returns: undefined
      }
      get_my_profile: { Args: never; Returns: Json }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_involved: { Args: { p_pr_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      link_my_profile: { Args: never; Returns: Json }
      list_my_notifications: {
        Args: { p_limit?: number }
        Returns: {
          actor_name: string
          actor_office_name: string
          can_view: boolean
          created_at: string
          id: number
          is_read: boolean
          pr_id: string
          purpose: string
          routing_slip_no: string
          to_office_name: string
          type: Database["pr_tracker"]["Enums"]["event_type"]
        }[]
      }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      mark_notifications_read: { Args: { p_ids: number[] }; Returns: undefined }
      recall_pr: {
        Args: { p_pr_id: string; p_reason?: string }
        Returns: undefined
      }
      receive_pr: { Args: { p_pr_id: string }; Returns: undefined }
      register_attachment: {
        Args: {
          p_filename: string
          p_is_pr_document?: boolean
          p_mime_type: string
          p_pr_id: string
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: string
      }
      report_office_days: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_days: number
          avg_transit_days: number
          max_days: number
          median_days: number
          office_code: string
          office_id: string
          office_name: string
          prs_handled: number
        }[]
      }
      report_stuck_prs: {
        Args: never
        Returns: {
          can_view: boolean
          current_office_name: string
          days: number
          movement_state: string
          origin_office_name: string
          pr_id: string
          routing_slip_no: string
        }[]
      }
      return_pr: {
        Args: { p_pr_id: string; p_reason: string; p_to_office_id: string }
        Returns: undefined
      }
      saao_add_node: {
        Args: {
          p_account_code: string
          p_after_id: string
          p_book_id: string
          p_classification_id: string
          p_kind: string
          p_label: string
          p_parent_id: string
        }
        Returns: string
      }
      saao_apply_batch: {
        Args: { p_book_id: string; p_ops: Json }
        Returns: number
      }
      saao_compute_lines: {
        Args: { p_book_id: string; p_cutoff: string }
        Returns: {
          adjusted: number
          allotment: number
          appropriation: number
          balance_allotment: number
          balance_appropriation: number
          cna_1: number
          cna_2: number
          cna_3: number
          months: number[]
          node_id: string
          nta: number
          obligation: number
          realignment: number
          savings: number
          savings_half: number
          sb: Json
          supplemental: number
          total_changes: number
        }[]
      }
      saao_create_book: {
        Args: {
          p_copy_appropriations: boolean
          p_copy_from: string
          p_fiscal_year: number
          p_fund_id: string
          p_title: string
        }
        Returns: string
      }
      saao_create_draft: {
        Args: { p_book_id: string; p_cutoff: string }
        Returns: string
      }
      saao_delete_allotment: { Args: { p_id: string }; Returns: undefined }
      saao_delete_draft: { Args: { p_report_id: string }; Returns: undefined }
      saao_delete_movement: { Args: { p_id: string }; Returns: undefined }
      saao_delete_node: { Args: { p_id: string }; Returns: undefined }
      saao_finalize: {
        Args: { p_acknowledged: string[]; p_report_id: string }
        Returns: undefined
      }
      saao_live_rows: {
        Args: { p_book_id: string; p_cutoff: string }
        Returns: Json[]
      }
      saao_move_node: {
        Args: { p_after_id: string; p_id: string; p_new_parent_id: string }
        Returns: undefined
      }
      saao_my_access: { Args: never; Returns: string }
      saao_role: { Args: never; Returns: string }
      saao_set_access: {
        Args: { p_profile_id: string; p_role: string }
        Returns: undefined
      }
      saao_set_extra: {
        Args: {
          p_amount: number
          p_field: string
          p_mode: string
          p_node_id: string
        }
        Returns: undefined
      }
      saao_set_movement_line: {
        Args: { p_amount: number; p_movement_id: string; p_node_id: string }
        Returns: undefined
      }
      saao_set_obligation: {
        Args: {
          p_amount: number
          p_entry: string
          p_month: number
          p_node_id: string
        }
        Returns: undefined
      }
      saao_start_revision: {
        Args: { p_reason: string; p_report_id: string }
        Returns: string
      }
      saao_unapproved_movements: {
        Args: { p_report_id: string }
        Returns: {
          id: string
          kind: string
          reference_no: string
          status: string
          status_note: string
          title: string
          total: number
        }[]
      }
      saao_update_book: {
        Args: { p_id: string; p_patch: Json }
        Returns: undefined
      }
      saao_update_node: {
        Args: { p_id: string; p_patch: Json }
        Returns: undefined
      }
      saao_upsert_allotment: {
        Args: {
          p_allotment_date: string
          p_amount: number
          p_id: string
          p_node_id: string
          p_reference_no: string
          p_remarks: string
          p_status: string
        }
        Returns: string
      }
      saao_upsert_classification: {
        Args: {
          p_active: boolean
          p_code: string
          p_id: string
          p_name: string
          p_sort_order: number
        }
        Returns: string
      }
      saao_upsert_fund: {
        Args: {
          p_active: boolean
          p_code: string
          p_id: string
          p_name: string
        }
        Returns: string
      }
      saao_upsert_movement: {
        Args: {
          p_book_id: string
          p_effective_date: string
          p_id: string
          p_kind: string
          p_reference_no: string
          p_remarks: string
          p_sb_number: number
          p_status: string
          p_status_note: string
          p_title: string
        }
        Returns: string
      }
      set_mode_of_procurement: {
        Args: { p_mode: string; p_pr_id: string }
        Returns: undefined
      }
      set_status: {
        Args: { p_pr_id: string; p_remark?: string; p_status_id: string }
        Returns: undefined
      }
      suggest_next_step: { Args: { p_pr_id: string }; Returns: Json }
      supersede_attachment: {
        Args: { p_attachment_id: string; p_reason: string }
        Returns: undefined
      }
      tracking_lookup: { Args: { p_routing_slip_no: string }; Returns: Json }
      unfollow_pr: { Args: { p_pr_id: string }; Returns: undefined }
      unread_notification_count: { Args: never; Returns: number }
      update_pr_content: {
        Args: { p_header: Json; p_pr_id: string }
        Returns: undefined
      }
    }
    Enums: {
      event_type:
        | "created"
        | "edited"
        | "forwarded"
        | "recalled"
        | "received"
        | "returned"
        | "status_changed"
        | "remark_added"
        | "private_note_added"
        | "attachment_added"
        | "attachment_superseded"
        | "pr_document_uploaded"
        | "pr_no_assigned"
        | "mode_set"
        | "completed"
        | "cancelled"
        | "followed"
        | "unfollowed"
      movement_state:
        | "draft"
        | "in_transit"
        | "received"
        | "returned"
        | "completed"
        | "cancelled"
      user_role: "super_admin" | "admin" | "staff"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  pr_tracker: {
    Enums: {
      event_type: [
        "created",
        "edited",
        "forwarded",
        "recalled",
        "received",
        "returned",
        "status_changed",
        "remark_added",
        "private_note_added",
        "attachment_added",
        "attachment_superseded",
        "pr_document_uploaded",
        "pr_no_assigned",
        "mode_set",
        "completed",
        "cancelled",
        "followed",
        "unfollowed",
      ],
      movement_state: [
        "draft",
        "in_transit",
        "received",
        "returned",
        "completed",
        "cancelled",
      ],
      user_role: ["super_admin", "admin", "staff"],
    },
  },
} as const

