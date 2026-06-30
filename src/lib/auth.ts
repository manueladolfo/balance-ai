import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return null;

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return null;

    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });

    const { data: { user }, error } = await tempClient.auth.getUser(token);
    if (error || !user) {
      return null;
    }

    return user.id;
  } catch (error) {
    console.error('Error validating auth token:', error);
    return null;
  }
}
