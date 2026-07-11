import { Hono } from 'hono';
import { assertEnvironment } from './env';
import { internalCallbacksRoutes } from './routes/internalCallbacks';
import { pdfJobsRoutes } from './routes/pdfJobs';
import { ApiError, type Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (context, next) => {
  assertEnvironment(context.env);
  const origin = context.req.header('Origin');
  if (origin && origin === context.env.FRONTEND_ORIGIN) {
    context.header('Access-Control-Allow-Origin', origin);
    context.header('Vary', 'Origin');
    context.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    context.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    context.header('Access-Control-Max-Age', '86400');
  }
  if (context.req.method === 'OPTIONS') {
    if (!origin || origin !== context.env.FRONTEND_ORIGIN) {
      return context.json({ error: '不允许的跨域来源。', code: 'ORIGIN_NOT_ALLOWED' }, 403);
    }
    return context.body(null, 204);
  }
  await next();
});

app.get('/health', (context) => context.json({ ok: true }));
app.route('/api/pdf-jobs', pdfJobsRoutes);
app.route('/internal/pdf-jobs', internalCallbacksRoutes);

app.notFound((context) => context.json({ error: '接口不存在。', code: 'NOT_FOUND' }, 404));

app.onError((error, context) => {
  if (error instanceof ApiError) {
    return context.json({ error: error.message, code: error.code }, error.statusCode as 400 | 401 | 403 | 404 | 409 | 413 | 500 | 502);
  }
  console.error(error);
  return context.json({ error: '服务器内部错误。', code: 'INTERNAL_ERROR' }, 500);
});

export default app;
