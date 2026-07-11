import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.49.8'

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function namedKey(jsonName: string, legacyName: string): string {
  const raw = Deno.env.get(jsonName)?.trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      if (parsed.default) return parsed.default
    } catch {
      throw new Error(`Invalid ${jsonName}`)
    }
  }
  return requiredEnv(legacyName)
}

export function createAdminClient(): SupabaseClient {
  return createClient(requiredEnv('SUPABASE_URL'), namedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function requireUser(req: Request): Promise<User> {
  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) throw new Error('UNAUTHORIZED')

  const userClient = createClient(requiredEnv('SUPABASE_URL'), namedKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) throw new Error('UNAUTHORIZED')
  return data.user
}

export function storageBucket(): string {
  return Deno.env.get('PDF_STORAGE_BUCKET')?.trim() || 'pdf-jobs'
}

export function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
