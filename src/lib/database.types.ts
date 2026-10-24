export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: 'employer' | 'worker' | 'admin'
          full_name: string
          email: string | null
          phone_number: string | null
          date_of_birth: string | null
          gender: string | null
          address_line: string | null
          village: string | null
          city: string | null
          district: string | null
          state: string | null
          pincode: string | null
          is_assisted_profile: boolean | null
          created_by: string | null
          bank_name: string | null
          bank_account_no: string | null
          bank_ifsc: string | null
          upi_id: string | null
          account_status: string | null
          location: string | null
          category: string | null
          skills: string[] | null
          experience_years: number | null
          daily_wage: number | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          role?: 'employer' | 'worker' | 'admin'
          full_name: string
          email?: string | null
          phone_number?: string | null
          date_of_birth?: string | null
          gender?: string | null
          address_line?: string | null
          village?: string | null
          city?: string | null
          district?: string | null
          state?: string | null
          pincode?: string | null
          is_assisted_profile?: boolean | null
          created_by?: string | null
          bank_name?: string | null
          bank_account_no?: string | null
          bank_ifsc?: string | null
          upi_id?: string | null
          account_status?: string | null
          location?: string | null
          category?: string | null
          skills?: string[] | null
          experience_years?: number | null
          daily_wage?: number | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          role?: 'employer' | 'worker' | 'admin'
          full_name?: string
          email?: string | null
          phone_number?: string | null
          date_of_birth?: string | null
          gender?: string | null
          address_line?: string | null
          village?: string | null
          city?: string | null
          district?: string | null
          state?: string | null
          pincode?: string | null
          is_assisted_profile?: boolean | null
          created_by?: string | null
          bank_name?: string | null
          bank_account_no?: string | null
          bank_ifsc?: string | null
          upi_id?: string | null
          account_status?: string | null
          location?: string | null
          category?: string | null
          skills?: string[] | null
          experience_years?: number | null
          daily_wage?: number | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      workers: {
        Row: {
          id: string
          category: 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed'
          skills: string[]
          experience_years: number | null
          experience_description: string | null
          preferred_work_location: string | null
          availability_status: string | null
          daily_wage: number | null
          average_rating: number | null
          is_available: boolean | null
          location: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          category: 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed'
          skills?: string[]
          experience_years?: number | null
          experience_description?: string | null
          preferred_work_location?: string | null
          availability_status?: string | null
          daily_wage?: number | null
          average_rating?: number | null
          is_available?: boolean | null
          location?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          category?: 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed'
          skills?: string[]
          experience_years?: number | null
          experience_description?: string | null
          preferred_work_location?: string | null
          availability_status?: string | null
          daily_wage?: number | null
          average_rating?: number | null
          is_available?: boolean | null
          location?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      jobs: {
        Row: {
          id: string
          employer_id: string
          title: string
          category: 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed'
          description: string | null
          required_skills: string[]
          offered_wages: number | null
          status: 'open' | 'in_progress' | 'completed' | 'cancelled' | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          employer_id: string
          title: string
          category: 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed'
          description?: string | null
          required_skills?: string[]
          offered_wages?: number | null
          status?: 'open' | 'in_progress' | 'completed' | 'cancelled' | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          employer_id?: string
          title?: string
          category?: 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed'
          description?: string | null
          required_skills?: string[]
          offered_wages?: number | null
          status?: 'open' | 'in_progress' | 'completed' | 'cancelled' | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      job_records: {
        Row: {
          id: string
          job_id: string
          worker_id: string
          status: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          job_id: string
          worker_id: string
          status?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          job_id?: string
          worker_id?: string
          status?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          profile_id: string
          title: string
          message: string
          type: string | null
          is_read: boolean | null
          created_at: string | null
        }
        Insert: {
          id?: string
          profile_id: string
          title: string
          message: string
          type?: string | null
          is_read?: boolean | null
          created_at?: string | null
        }
        Update: {
          id?: string
          profile_id?: string
          title?: string
          message?: string
          type?: string | null
          is_read?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          id: string
          job_id: string
          reviewer_profile_id: string
          reviewed_profile_id: string
          rating: number | null
          comment: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          job_id: string
          reviewer_profile_id: string
          reviewed_profile_id: string
          rating?: number | null
          comment?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          job_id?: string
          reviewer_profile_id?: string
          reviewed_profile_id?: string
          rating?: number | null
          comment?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      equipment: {
        Row: {
          id: string
          owner_id: string
          title: string
          category: 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed'
          description: string | null
          daily_rent: number
          deposit_required: number | null
          location: string | null
          status: 'available' | 'rented' | 'maintenance'
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          title: string
          category: 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed'
          description?: string | null
          daily_rent: number
          deposit_required?: number | null
          location?: string | null
          status?: 'available' | 'rented' | 'maintenance'
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          owner_id?: string
          title?: string
          category?: 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed'
          description?: string | null
          daily_rent?: number
          deposit_required?: number | null
          location?: string | null
          status?: 'available' | 'rented' | 'maintenance'
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      payments: {
        Row: {
          id: string
          payer_id: string
          payee_id: string
          payment_for_type: 'worker_wage' | 'machine_rental'
          reference_id: string | null
          amount: number
          payment_method: 'Net Banking (IMPS/NEFT)' | 'Direct UPI' | 'Cash'
          transaction_ref: string | null
          status: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          payer_id: string
          payee_id: string
          payment_for_type: 'worker_wage' | 'machine_rental'
          reference_id?: string | null
          amount: number
          payment_method: 'Net Banking (IMPS/NEFT)' | 'Direct UPI' | 'Cash'
          transaction_ref?: string | null
          status?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          payer_id?: string
          payee_id?: string
          payment_for_type?: 'worker_wage' | 'machine_rental'
          reference_id?: string | null
          amount?: number
          payment_method?: 'Net Banking (IMPS/NEFT)' | 'Direct UPI' | 'Cash'
          transaction_ref?: string | null
          status?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      phone_otps: {
        Row: {
          id: string
          phone: string
          otp: string
          expires_at: string
          created_at: string | null
        }
        Insert: {
          id?: string
          phone: string
          otp: string
          expires_at: string
          created_at?: string | null
        }
        Update: {
          id?: string
          phone?: string
          otp?: string
          expires_at?: string
          created_at?: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          id: string
          user_id: string
          role: 'super_admin' | 'moderator' | 'support_agent'
          permissions: string[] | null
          is_active: boolean
          email_verified: boolean
          phone_verified: boolean
          verified_email: string | null
          verified_phone: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          role?: 'super_admin' | 'moderator' | 'support_agent'
          permissions?: string[] | null
          is_active?: boolean
          email_verified?: boolean
          phone_verified?: boolean
          verified_email?: string | null
          verified_phone?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          role?: 'super_admin' | 'moderator' | 'support_agent'
          permissions?: string[] | null
          is_active?: boolean
          email_verified?: boolean
          phone_verified?: boolean
          verified_email?: string | null
          verified_phone?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          id: string
          admin_id: string | null
          admin_email: string | null
          action: string
          target_type: 'profile' | 'worker' | 'job' | 'equipment' | 'complaint' | 'content' | 'auth' | 'system'
          target_id: string
          reason: string | null
          metadata: Json | null
          ip_address: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          admin_id?: string | null
          admin_email?: string | null
          action: string
          target_type: 'profile' | 'worker' | 'job' | 'equipment' | 'complaint' | 'content' | 'auth' | 'system'
          target_id: string
          reason?: string | null
          metadata?: Json | null
          ip_address?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          admin_id?: string | null
          admin_email?: string | null
          action?: string
          target_type?: 'profile' | 'worker' | 'job' | 'equipment' | 'complaint' | 'content' | 'auth' | 'system'
          target_id?: string
          reason?: string | null
          metadata?: Json | null
          ip_address?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      complaints: {
        Row: {
          id: string
          reporter_id: string | null
          reporter_phone: string | null
          reporter_name: string | null
          target_type: 'worker' | 'employer' | 'job' | 'equipment' | 'payment' | 'platform' | 'other'
          target_id: string | null
          target_name: string | null
          category: 'unpaid_wages' | 'unsafe_conditions' | 'harassment' | 'fraud' | 'misleading_equipment' | 'platform_abuse' | 'other'
          title: string
          description: string
          status: 'open' | 'under_review' | 'investigating' | 'resolved' | 'dismissed'
          priority: 'low' | 'medium' | 'high' | 'critical'
          assigned_to: string | null
          resolution_notes: string | null
          evidence_urls: string[] | null
          created_at: string | null
          updated_at: string | null
          resolved_at: string | null
        }
        Insert: {
          id?: string
          reporter_id?: string | null
          reporter_phone?: string | null
          reporter_name?: string | null
          target_type: 'worker' | 'employer' | 'job' | 'equipment' | 'payment' | 'platform' | 'other'
          target_id?: string | null
          target_name?: string | null
          category: 'unpaid_wages' | 'unsafe_conditions' | 'harassment' | 'fraud' | 'misleading_equipment' | 'platform_abuse' | 'other'
          title: string
          description: string
          status?: 'open' | 'under_review' | 'investigating' | 'resolved' | 'dismissed'
          priority?: 'low' | 'medium' | 'high' | 'critical'
          assigned_to?: string | null
          resolution_notes?: string | null
          evidence_urls?: string[] | null
          created_at?: string | null
          updated_at?: string | null
          resolved_at?: string | null
        }
        Update: {
          id?: string
          reporter_id?: string | null
          reporter_phone?: string | null
          reporter_name?: string | null
          target_type?: 'worker' | 'employer' | 'job' | 'equipment' | 'payment' | 'platform' | 'other'
          target_id?: string | null
          target_name?: string | null
          category?: 'unpaid_wages' | 'unsafe_conditions' | 'harassment' | 'fraud' | 'misleading_equipment' | 'platform_abuse' | 'other'
          title?: string
          description?: string
          status?: 'open' | 'under_review' | 'investigating' | 'resolved' | 'dismissed'
          priority?: 'low' | 'medium' | 'high' | 'critical'
          assigned_to?: string | null
          resolution_notes?: string | null
          evidence_urls?: string[] | null
          created_at?: string | null
          updated_at?: string | null
          resolved_at?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          id: string
          title: string
          message: string
          type: 'alert' | 'warning' | 'info' | 'moderation'
          is_read: boolean
          link: string | null
          metadata: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          title: string
          message: string
          type?: 'alert' | 'warning' | 'info' | 'moderation'
          is_read?: boolean
          link?: string | null
          metadata?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          message?: string
          type?: 'alert' | 'warning' | 'info' | 'moderation'
          is_read?: boolean
          link?: string | null
          metadata?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }
      platform_content: {
        Row: {
          id: string
          content_key: string
          section: 'category' | 'legal_card' | 'government_resource' | 'search_tag' | 'faq' | 'announcement'
          language: 'en' | 'hi' | 'mr'
          title: string
          description: string | null
          metadata: Json | null
          display_order: number | null
          is_active: boolean
          updated_at: string | null
        }
        Insert: {
          id?: string
          content_key: string
          section: 'category' | 'legal_card' | 'government_resource' | 'search_tag' | 'faq' | 'announcement'
          language?: 'en' | 'hi' | 'mr'
          title: string
          description?: string | null
          metadata?: Json | null
          display_order?: number | null
          is_active?: boolean
          updated_at?: string | null
        }
        Update: {
          id?: string
          content_key?: string
          section?: 'category' | 'legal_card' | 'government_resource' | 'search_tag' | 'faq' | 'announcement'
          language?: 'en' | 'hi' | 'mr'
          title?: string
          description?: string | null
          metadata?: Json | null
          display_order?: number | null
          is_active?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: {
        Args: {
          check_uid?: string
        }
        Returns: boolean
      }
      confirm_admin_phone_verified: {
        Args: {
          target_user_id: string
        }
        Returns: boolean
      }
      grant_admin_role: {
        Args: {
          target_user_id: string
          target_role?: string
          target_phone?: string | null
        }
        Returns: Json
      }
      revoke_admin_role: {
        Args: {
          target_user_id: string
          revocation_reason?: string
        }
        Returns: Json
      }
    }
    Enums: {
      job_status: 'open' | 'in_progress' | 'completed' | 'cancelled'
      user_role: 'employer' | 'worker' | 'admin'
      worker_category: 'Agriculture' | 'Construction' | 'Daily work' | 'Skilled self-employed'
      equipment_status: 'available' | 'rented' | 'maintenance'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}