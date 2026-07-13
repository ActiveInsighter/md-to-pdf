const ERROR_RULES: Array<[RegExp, string]> = [
  [/Invalid login credentials/i, '邮箱或密码不正确，或者账号尚未完成邮箱确认。'],
  [/Email not confirmed/i, '邮箱尚未确认，请先打开确认邮件中的链接。'],
  [/User already registered/i, '该邮箱已经注册，请直接登录。'],
  [/Failed to fetch|NetworkError|network request/i, '网络连接失败，请检查网络后重试。'],
  [/row-level security|permission denied|not authorized|401|403/i, '当前账号没有执行此操作的权限。'],
  [/storage.*limit|payload too large|413/i, '上传文件超过服务允许的大小限制。'],
  [/github.*rate|rate limit/i, 'GitHub Actions 请求过于频繁，请稍后重试。'],
  [/expired/i, '任务或下载链接已经过期，请重新构建。'],
]

export function toUserMessage(error: unknown, fallback = '操作失败，请稍后重试。'): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  for (const [pattern, translated] of ERROR_RULES) {
    if (pattern.test(message)) return translated
  }
  return message.trim() || fallback
}
