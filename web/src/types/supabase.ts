export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_login_attempts: {
        Row: {
          created_at: string
          email: string
          id: string
          ip: string | null
          succeeded: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          ip?: string | null
          succeeded?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          ip?: string | null
          succeeded?: boolean
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_login_at: string | null
          phone: string | null
          role_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          phone?: string | null
          role_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          phone?: string | null
          role_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          new_data: Json | null
          old_data: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_data?: Json | null
          old_data?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      banners: {
        Row: {
          action_url: string | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          image_url: string
          is_active: boolean
          position: Database["public"]["Enums"]["banner_position"]
          starts_at: string | null
          title: string
          weight: number
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          position?: Database["public"]["Enums"]["banner_position"]
          starts_at?: string | null
          title: string
          weight?: number
        }
        Update: {
          action_url?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          position?: Database["public"]["Enums"]["banner_position"]
          starts_at?: string | null
          title?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "banners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_students: {
        Row: {
          batch_id: string
          enrolled_at: string
          id: string
          student_id: string
        }
        Insert: {
          batch_id: string
          enrolled_at?: string
          id?: string
          student_id: string
        }
        Update: {
          batch_id?: string
          enrolled_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_students_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          course_id: string
          created_at: string
          end_date: string | null
          id: string
          max_students: number | null
          name: string
          start_date: string | null
          status: Database["public"]["Enums"]["batch_status"]
          teacher_id: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          max_students?: number | null
          name: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["batch_status"]
          teacher_id?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          max_students?: number | null
          name?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["batch_status"]
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_files: {
        Row: {
          content_item_id: string
          created_at: string
          display_name: string
          id: string
          mime_type: string | null
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
          weight: number
        }
        Insert: {
          content_item_id: string
          created_at?: string
          display_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path: string
          uploaded_by?: string | null
          weight?: number
        }
        Update: {
          content_item_id?: string
          created_at?: string
          display_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_files_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          duration_seconds: number | null
          file_url: string | null
          id: string
          is_downloadable: boolean
          is_paid: boolean
          is_printable: boolean
          metadata: Json | null
          play_limit: number | null
          status: Database["public"]["Enums"]["content_status"]
          title: string
          topic_id: string
          type: Database["public"]["Enums"]["content_type"]
          updated_at: string
          video_id: string | null
          weight: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          file_url?: string | null
          id?: string
          is_downloadable?: boolean
          is_paid?: boolean
          is_printable?: boolean
          metadata?: Json | null
          play_limit?: number | null
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          topic_id: string
          type: Database["public"]["Enums"]["content_type"]
          updated_at?: string
          video_id?: string | null
          weight?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_seconds?: number | null
          file_url?: string | null
          id?: string
          is_downloadable?: boolean
          is_paid?: boolean
          is_printable?: boolean
          metadata?: Json | null
          play_limit?: number | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          topic_id?: string
          type?: Database["public"]["Enums"]["content_type"]
          updated_at?: string
          video_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      course_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_visible: boolean
          name: string
          slug: string
          thumbnail_url: string | null
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name: string
          slug: string
          thumbnail_url?: string | null
          weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          slug?: string
          thumbnail_url?: string | null
          weight?: number
        }
        Relationships: []
      }
      courses: {
        Row: {
          category_id: string | null
          class: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          difficulty: string | null
          duration_hours: number | null
          id: string
          is_featured: boolean | null
          is_published: boolean | null
          long_description: string | null
          meta_description: string | null
          meta_title: string | null
          original_price: number | null
          preview_video_url: string | null
          price: number
          rating_avg: number | null
          rating_count: number | null
          slug: string
          student_count: number | null
          subject: string | null
          tags: string[] | null
          teacher_avatar_url: string | null
          teacher_name: string | null
          thumbnail_url: string | null
          title: string
          total_lessons: number | null
          updated_at: string | null
          validity_days: number | null
        }
        Insert: {
          category_id?: string | null
          class?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          difficulty?: string | null
          duration_hours?: number | null
          id?: string
          is_featured?: boolean | null
          is_published?: boolean | null
          long_description?: string | null
          meta_description?: string | null
          meta_title?: string | null
          original_price?: number | null
          preview_video_url?: string | null
          price?: number
          rating_avg?: number | null
          rating_count?: number | null
          slug: string
          student_count?: number | null
          subject?: string | null
          tags?: string[] | null
          teacher_avatar_url?: string | null
          teacher_name?: string | null
          thumbnail_url?: string | null
          title: string
          total_lessons?: number | null
          updated_at?: string | null
          validity_days?: number | null
        }
        Update: {
          category_id?: string | null
          class?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          difficulty?: string | null
          duration_hours?: number | null
          id?: string
          is_featured?: boolean | null
          is_published?: boolean | null
          long_description?: string | null
          meta_description?: string | null
          meta_title?: string | null
          original_price?: number | null
          preview_video_url?: string | null
          price?: number
          rating_avg?: number | null
          rating_count?: number | null
          slug?: string
          student_count?: number | null
          subject?: string | null
          tags?: string[] | null
          teacher_avatar_url?: string | null
          teacher_name?: string | null
          thumbnail_url?: string | null
          title?: string
          total_lessons?: number | null
          updated_at?: string | null
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "course_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          course_id: string
          created_at: string | null
          id: string
          payment_amount: number | null
          payment_id: string | null
          payment_method: string | null
          payment_order_id: string | null
          payment_status: string | null
          purchased_at: string | null
          status: string
          student_id: string
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          course_id: string
          created_at?: string | null
          id?: string
          payment_amount?: number | null
          payment_id?: string | null
          payment_method?: string | null
          payment_order_id?: string | null
          payment_status?: string | null
          purchased_at?: string | null
          status?: string
          student_id: string
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string | null
          id?: string
          payment_amount?: number | null
          payment_id?: string | null
          payment_method?: string | null
          payment_order_id?: string | null
          payment_status?: string | null
          purchased_at?: string | null
          status?: string
          student_id?: string
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          class: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          remarks: string | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          class?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          remarks?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          class?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          remarks?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          course_id: string
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_free_preview: boolean | null
          is_published: boolean | null
          resources: Json | null
          sort_order: number
          title: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          course_id: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_free_preview?: boolean | null
          is_published?: boolean | null
          resources?: Json | null
          sort_order?: number
          title: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_free_preview?: boolean | null
          is_published?: boolean | null
          resources?: Json | null
          sort_order?: number
          title?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      live_classes: {
        Row: {
          attendee_count: number
          course_id: string
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          meeting_url: string | null
          platform: string | null
          recording_url: string | null
          rewatch_content_id: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["live_class_status"]
          subject_id: string | null
          teacher_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          attendee_count?: number
          course_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          meeting_url?: string | null
          platform?: string | null
          recording_url?: string | null
          rewatch_content_id?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["live_class_status"]
          subject_id?: string | null
          teacher_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          attendee_count?: number
          course_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          meeting_url?: string | null
          platform?: string | null
          recording_url?: string | null
          rewatch_content_id?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["live_class_status"]
          subject_id?: string | null
          teacher_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_classes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_classes_rewatch_content_id_fkey"
            columns: ["rewatch_content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_classes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          course_id: string | null
          id: string
          is_read: boolean
          message: string
          sent_at: string
          sent_by: string | null
          target_id: string | null
          target_type: string
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          action_url?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          course_id?: string | null
          id?: string
          is_read?: boolean
          message: string
          sent_at?: string
          sent_by?: string | null
          target_id?: string | null
          target_type?: string
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          action_url?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          course_id?: string | null
          id?: string
          is_read?: boolean
          message?: string
          sent_at?: string
          sent_by?: string | null
          target_id?: string | null
          target_type?: string
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          course_id: string
          created_at: string
          discount_amount: number
          final_amount: number
          id: string
          invoice_number: string | null
          invoice_url: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          processed_by: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          referral_code_used: string | null
          remarks: string | null
          status: Database["public"]["Enums"]["order_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          course_id: string
          created_at?: string
          discount_amount?: number
          final_amount: number
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          processed_by?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          referral_code_used?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          course_id?: string
          created_at?: string
          discount_amount?: number
          final_amount?: number
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          processed_by?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          referral_code_used?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      question_bank: {
        Row: {
          content: string
          correct_answer: Json
          created_at: string
          created_by: string | null
          difficulty: Database["public"]["Enums"]["difficulty_level"]
          explanation: string | null
          hint: string | null
          id: string
          image_url: string | null
          negative_marks: number
          options: Json | null
          positive_marks: number
          subject_id: string | null
          tags: string[] | null
          topic_id: string | null
          topic_tag: string | null
          type: Database["public"]["Enums"]["question_type"]
          updated_at: string
          used_count: number
        }
        Insert: {
          content: string
          correct_answer: Json
          created_at?: string
          created_by?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          explanation?: string | null
          hint?: string | null
          id?: string
          image_url?: string | null
          negative_marks?: number
          options?: Json | null
          positive_marks?: number
          subject_id?: string | null
          tags?: string[] | null
          topic_id?: string | null
          topic_tag?: string | null
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
          used_count?: number
        }
        Update: {
          content?: string
          correct_answer?: Json
          created_at?: string
          created_by?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          explanation?: string | null
          hint?: string | null
          id?: string
          image_url?: string | null
          negative_marks?: number
          options?: Json | null
          positive_marks?: number
          subject_id?: string | null
          tags?: string[] | null
          topic_id?: string | null
          topic_tag?: string | null
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_bank_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          content: string
          correct_answer: Json
          created_at: string
          difficulty: Database["public"]["Enums"]["difficulty_level"]
          explanation: string | null
          hint: string | null
          id: string
          image_url: string | null
          negative_marks: number
          options: Json | null
          positive_marks: number
          test_id: string
          topic_tag: string | null
          type: Database["public"]["Enums"]["question_type"]
          weight: number
        }
        Insert: {
          content: string
          correct_answer: Json
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          explanation?: string | null
          hint?: string | null
          id?: string
          image_url?: string | null
          negative_marks?: number
          options?: Json | null
          positive_marks?: number
          test_id: string
          topic_tag?: string | null
          type?: Database["public"]["Enums"]["question_type"]
          weight?: number
        }
        Update: {
          content?: string
          correct_answer?: Json
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          explanation?: string | null
          hint?: string | null
          id?: string
          image_url?: string | null
          negative_marks?: number
          options?: Json | null
          positive_marks?: number
          test_id?: string
          topic_tag?: string | null
          type?: Database["public"]["Enums"]["question_type"]
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          created_at: string
          id: number
          identifier: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
          identifier: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
          identifier?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          discount_type: Database["public"]["Enums"]["discount_type"]
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          student_id: string | null
          usage_count: number
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          student_id?: string | null
          usage_count?: number
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          discount_type?: Database["public"]["Enums"]["discount_type"]
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          student_id?: string | null
          usage_count?: number
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_codes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string
          processed_at: string | null
          processed_by: string | null
          razorpay_refund_id: string | null
          reason: string
          status: Database["public"]["Enums"]["refund_status"]
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id: string
          processed_at?: string | null
          processed_by?: string | null
          razorpay_refund_id?: string | null
          reason: string
          status?: Database["public"]["Enums"]["refund_status"]
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string
          processed_at?: string | null
          processed_by?: string | null
          razorpay_refund_id?: string | null
          reason?: string
          status?: Database["public"]["Enums"]["refund_status"]
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: Database["public"]["Enums"]["user_role"]
          permissions: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: Database["public"]["Enums"]["user_role"]
          permissions?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: Database["public"]["Enums"]["user_role"]
          permissions?: Json
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      student_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          notification_id: string
          read_at: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          notification_id: string
          read_at?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          notification_id?: string
          read_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_notifications_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_progress: {
        Row: {
          completed_at: string | null
          content_item_id: string
          created_at: string
          id: string
          last_position_seconds: number | null
          progress_percentage: number
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          content_item_id: string
          created_at?: string
          id?: string
          last_position_seconds?: number | null
          progress_percentage?: number
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          content_item_id?: string
          created_at?: string
          id?: string
          last_position_seconds?: number | null
          progress_percentage?: number
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_progress_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          avatar_url: string | null
          board: string | null
          city: string | null
          class: string | null
          created_at: string | null
          email: string
          free_trial_expires_at: string | null
          full_name: string
          id: string
          is_active: boolean | null
          phone: string | null
          referral_code: string | null
          referred_by: string | null
          school_name: string | null
          state: string | null
          status: Database["public"]["Enums"]["student_status"]
          updated_at: string | null
          user_id: string
          wallet_balance: number
        }
        Insert: {
          avatar_url?: string | null
          board?: string | null
          city?: string | null
          class?: string | null
          created_at?: string | null
          email: string
          free_trial_expires_at?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          school_name?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string | null
          user_id: string
          wallet_balance?: number
        }
        Update: {
          avatar_url?: string | null
          board?: string | null
          city?: string | null
          class?: string | null
          created_at?: string | null
          email?: string
          free_trial_expires_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          school_name?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          updated_at?: string | null
          user_id?: string
          wallet_balance?: number
        }
        Relationships: []
      }
      subjects: {
        Row: {
          color_code: string | null
          course_id: string
          created_at: string
          id: string
          is_visible: boolean
          name: string
          slug: string
          weight: number
        }
        Insert: {
          color_code?: string | null
          course_id: string
          created_at?: string
          id?: string
          is_visible?: boolean
          name: string
          slug: string
          weight?: number
        }
        Update: {
          color_code?: string | null
          course_id?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          name?: string
          slug?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "subjects_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      test_attempts: {
        Row: {
          answers: Json
          attempt_number: number
          id: string
          percentage: number | null
          score: number | null
          student_id: string
          submitted_at: string
          test_id: string
          time_taken_seconds: number | null
          total_marks: number | null
        }
        Insert: {
          answers?: Json
          attempt_number?: number
          id?: string
          percentage?: number | null
          score?: number | null
          student_id: string
          submitted_at?: string
          test_id: string
          time_taken_seconds?: number | null
          total_marks?: number | null
        }
        Update: {
          answers?: Json
          attempt_number?: number
          id?: string
          percentage?: number | null
          score?: number | null
          student_id?: string
          submitted_at?: string
          test_id?: string
          time_taken_seconds?: number | null
          total_marks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "test_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_attempts_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          class: string | null
          content: string | null
          created_at: string
          id: string
          is_visible: boolean
          rating: number | null
          student_name: string
          student_photo_url: string | null
          type: Database["public"]["Enums"]["testimonial_type"]
          video_url: string | null
          weight: number
          year: string | null
        }
        Insert: {
          class?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          rating?: number | null
          student_name: string
          student_photo_url?: string | null
          type?: Database["public"]["Enums"]["testimonial_type"]
          video_url?: string | null
          weight?: number
          year?: string | null
        }
        Update: {
          class?: string | null
          content?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          rating?: number | null
          student_name?: string
          student_photo_url?: string | null
          type?: Database["public"]["Enums"]["testimonial_type"]
          video_url?: string | null
          weight?: number
          year?: string | null
        }
        Relationships: []
      }
      tests: {
        Row: {
          certificate_enabled: boolean
          course_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          end_time: string | null
          id: string
          instructions: string | null
          max_attempts: number
          name: string
          pass_percentage: number | null
          show_results_immediately: boolean
          show_solutions: boolean
          shuffle_options: boolean
          shuffle_questions: boolean
          start_time: string | null
          status: Database["public"]["Enums"]["content_status"]
          topic_id: string | null
          total_marks: number
          updated_at: string
        }
        Insert: {
          certificate_enabled?: boolean
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          end_time?: string | null
          id?: string
          instructions?: string | null
          max_attempts?: number
          name: string
          pass_percentage?: number | null
          show_results_immediately?: boolean
          show_solutions?: boolean
          shuffle_options?: boolean
          shuffle_questions?: boolean
          start_time?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          topic_id?: string | null
          total_marks?: number
          updated_at?: string
        }
        Update: {
          certificate_enabled?: boolean
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          end_time?: string | null
          id?: string
          instructions?: string | null
          max_attempts?: number
          name?: string
          pass_percentage?: number | null
          show_results_immediately?: boolean
          show_solutions?: boolean
          shuffle_options?: boolean
          shuffle_questions?: boolean
          start_time?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          topic_id?: string | null
          total_marks?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tests_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tests_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_visible: boolean
          name: string
          slug: string
          subject_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name: string
          slug: string
          subject_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          slug?: string
          subject_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "topics_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          event_id: string
          event_type: string
          payload: Json | null
          processed: boolean
          received_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          payload?: Json | null
          processed?: boolean
          received_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          payload?: Json | null
          processed?: boolean
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_login_blocked: {
        Args: { p_email: string; p_ip?: string }
        Returns: Json
      }
      check_rate_limit: {
        Args: {
          p_bucket: string
          p_identifier: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: Json
      }
      complete_paid_order: {
        Args: {
          p_captured_paise: number
          p_order_id: string
          p_razorpay_payment_id: string
          p_razorpay_signature: string
        }
        Returns: Json
      }
      current_live_class_title: { Args: never; Returns: string }
      current_student_id: { Args: never; Returns: string }
      enroll_free_course: { Args: { p_course_id: string }; Returns: Json }
      get_admin_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_daily_orders: {
        Args: { end_date?: string; start_date?: string }
        Returns: Json
      }
      get_payment_method_breakdown: {
        Args: { end_date?: string; start_date?: string }
        Returns: Json
      }
      get_refund_stats: {
        Args: { end_date?: string; start_date?: string }
        Returns: Json
      }
      get_revenue_stats: {
        Args: { end_date?: string; start_date?: string }
        Returns: Json
      }
      get_student_id: { Args: never; Returns: string }
      get_test_questions: {
        Args: { p_test_id: string }
        Returns: {
          content: string
          difficulty: Database["public"]["Enums"]["difficulty_level"]
          hint: string
          id: string
          image_url: string
          negative_marks: number
          options: Json
          positive_marks: number
          type: Database["public"]["Enums"]["question_type"]
          weight: number
        }[]
      }
      get_top_courses: { Args: { result_limit?: number }; Returns: Json }
      has_admin_role: {
        Args: { allowed_roles: Database["public"]["Enums"]["user_role"][] }
        Returns: boolean
      }
      increment_student_count: {
        Args: { p_course_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      prune_rate_limit_hits: { Args: never; Returns: undefined }
      record_admin_login_attempt: {
        Args: { p_email: string; p_ip?: string; p_succeeded?: boolean }
        Returns: undefined
      }
      submit_test_attempt: {
        Args: { p_answers: Json; p_started_at?: string; p_test_id: string }
        Returns: Json
      }
      touch_admin_last_login: { Args: never; Returns: undefined }
    }
    Enums: {
      banner_position: "home_top" | "home_bottom" | "course_page" | "dashboard"
      batch_status: "upcoming" | "active" | "completed" | "cancelled"
      content_status: "draft" | "published" | "archived"
      content_type: "video" | "pdf" | "note" | "ebook" | "pyp" | "quiz"
      difficulty_level: "easy" | "medium" | "hard"
      discount_type: "percentage" | "fixed"
      enrollment_status: "active" | "expired" | "cancelled"
      lead_status: "new" | "contacted" | "interested" | "converted" | "lost"
      live_class_status: "scheduled" | "live" | "ended" | "cancelled"
      notification_channel: "push" | "in_app" | "email" | "sms"
      order_status: "pending" | "completed" | "failed" | "refunded"
      payment_method: "razorpay" | "manual_cash" | "manual_upi" | "manual_bank"
      question_type:
        | "mcq_single"
        | "mcq_multiple"
        | "true_false"
        | "short_answer"
        | "match_pair"
        | "subjective"
        | "image_based"
      refund_status: "requested" | "approved" | "processed" | "rejected"
      student_status: "active" | "inactive" | "blocked"
      testimonial_type: "text" | "video"
      user_role:
        | "super_admin"
        | "content_creator"
        | "teacher"
        | "accountant"
        | "support_staff"
        | "technical"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      banner_position: ["home_top", "home_bottom", "course_page", "dashboard"],
      batch_status: ["upcoming", "active", "completed", "cancelled"],
      content_status: ["draft", "published", "archived"],
      content_type: ["video", "pdf", "note", "ebook", "pyp", "quiz"],
      difficulty_level: ["easy", "medium", "hard"],
      discount_type: ["percentage", "fixed"],
      enrollment_status: ["active", "expired", "cancelled"],
      lead_status: ["new", "contacted", "interested", "converted", "lost"],
      live_class_status: ["scheduled", "live", "ended", "cancelled"],
      notification_channel: ["push", "in_app", "email", "sms"],
      order_status: ["pending", "completed", "failed", "refunded"],
      payment_method: ["razorpay", "manual_cash", "manual_upi", "manual_bank"],
      question_type: [
        "mcq_single",
        "mcq_multiple",
        "true_false",
        "short_answer",
        "match_pair",
        "subjective",
        "image_based",
      ],
      refund_status: ["requested", "approved", "processed", "rejected"],
      student_status: ["active", "inactive", "blocked"],
      testimonial_type: ["text", "video"],
      user_role: [
        "super_admin",
        "content_creator",
        "teacher",
        "accountant",
        "support_staff",
        "technical",
      ],
    },
  },
} as const
