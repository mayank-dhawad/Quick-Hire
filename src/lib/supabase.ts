import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types'; // 1. Import the types we just created

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.');
}

// 2. Add <Database> right after createClient
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);