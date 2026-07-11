import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.49.8'

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

export function createAdminClient(): SupabaseClient {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function requireUser(req: Request): Promise<User> {
  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new Error('UNAUTHORIZED')

  const userClient = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) throw new Error('UNAUTHORIZED')
  return data.user
}

export function storageBucket(): string {
  return Deno.env.get('SUPABASE_STORAGE_BUCKET')?.trim() || 'pdf-jobs'
}

export function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
