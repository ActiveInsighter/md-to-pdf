import { z } from 'zod'

export const authSchema = z.object({
  email: z.string().trim().email('请输入有效邮箱。').max(254, '邮箱过长。').transform((value) => value.toLowerCase()),
  password: z.string().min(6, '密码至少需要 6 位。').max(72, '密码不能超过 72 位。'),
})

export type AuthFormValues = z.infer<typeof authSchema>
