import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

let cachedAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  if (!cachedAdmin) {
    cachedAdmin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return cachedAdmin;
}

export async function getAuthenticatedOrg(request: Request): Promise<{ user: User; orgId: string } | null> {
  const admin = getSupabaseAdmin();
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!admin || !token) return null;

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return null;

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('org_id')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile?.org_id) return null;
  return { user: userData.user, orgId: profile.org_id as string };
}
