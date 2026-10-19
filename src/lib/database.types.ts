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
          phone_number: string | null
          is_assisted_profile: boolean | null
          created_by: string | null
          bank_name: string | null
          bank_account_no: string | null
          bank_ifsc: string | null
          upi_id: string | null
          account_status: string | null
          location: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          role?: 'employer' | 'worker' | 'admin'
          full_name: string
          phone_number?: string | null
          is_assisted_profile?: boolean | null
          created_by?: string | null
          bank_name?: string | null
          bank_account_no?: string | null
          bank_ifsc?: string | null
          upi_id?: string | null
          account_status?: string | null
          location?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          role?: 'employer' | 'worker' | 'admin'
          full_name?: string
          phone_number?: string | null
          is_assisted_profile?: boolean | null
          created_by?: string | null
          bank_name?: string | null
          bank_account_no?: string | null
          bank_ifsc?: string | null
          upi_id?: string | null
          account_status?: string | null
          location?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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