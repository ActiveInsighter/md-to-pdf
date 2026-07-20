import fs from 'node:fs'

const requiredFiles = [
  'frontend/package.json',
  'frontend/package-lock.json',
  'frontend/tsconfig.json',
  'frontend/tsconfig.app.json',
  'frontend/vite.config.ts',
  'frontend/tailwind.config.ts',
  'frontend/src/app/App.tsx',
  'frontend/src/app/router.tsx',
  'frontend/src/app/providers.tsx',
  'frontend/src/lib/queryClient.ts',
  'frontend/src/lib/supabase.ts',
  'frontend/src/stores/workspaceStore.ts',
  'frontend/src/components/layout/PageContainer.tsx',
  'frontend/src/components/layout/ProtectedLayout.tsx',
  'frontend/src/components/ui/select.tsx',
  'frontend/src/components/ui/tabs.tsx',
  'frontend/src/features/pdf-jobs/types.ts',
  'frontend/src/features/pdf-jobs/queryKeys.ts',
  'frontend/src/features/pdf-jobs/status.ts',
  'frontend/src/features/pdf-jobs/hooks/cache.ts',
  'frontend/src/features/pdf-jobs/hooks/PdfJobsRealtimeBridge.tsx',
  'frontend/src/features/pdf-jobs/hooks/usePdfJob.ts',
  'frontend/src/features/pdf-jobs/hooks/usePdfJobs.ts',
  'frontend/src/features/pdf-jobs/hooks/usePdfJobActions.ts',
  'frontend/src/features/pdf-builder/submissionReducer.ts',
  'frontend/src/features/pdf-builder/hooks/usePdfSubmission.ts',
  'frontend/src/features/pdf-builder/hooks/useBatchSubmission.ts',
  'frontend/src/features/pdf-builder/schemas/builderSchema.ts',
  'frontend/src/features/pdf-builder/components/BuilderFormSection.tsx',
  'frontend/src/features/pdf-builder/components/SubmissionStatus.tsx',
  'frontend/src/routes/LoginPage.tsx',
  'frontend/src/routes/WorkspacePage.tsx',
  'frontend/src/routes/JobsPage.tsx',
  'frontend/src/routes/JobDetailPage.tsx',
  'frontend/src/routes/SettingsPage.tsx',
  'frontend/src/styles/globals.css',
  'frontend/tests/frontend-utils.test.mjs',
  'frontend/tests/cancel-pdf-job-logic.test.mjs',
  'frontend/tests/pdf-job-updates.test.mjs',
  'frontend/tests/job-status.test.ts',
  'frontend/tests/submission-reducer.test.ts',
  'frontend/tests/upload-files.test.ts',
  '.github/workflows/frontend-ci.yml',
  '.github/workflows/deploy-pages.yml',
  '.github/workflows/smoke-supabase-service.yml',
]

const removedFiles = [
  'frontend/src/App.tsx',
  'frontend/src/app.css',
  'frontend/src/simple-workspace.css',
  'frontend/src/pages/PdfBuilderPage.tsx',
  'frontend/src/hooks/usePdfBuilder.ts',
  'frontend/src/hooks/usePdfDelivery.ts',
  'frontend/src/hooks/useGlobalFileDrop.ts',
  'frontend/src/components/PdfBatchUpload.tsx',
  'frontend/src/components/PdfUpload.tsx',
  'frontend/src/components/PdfJobHistory.tsx',
  'frontend/src/components/PdfJobStatus.tsx',
  'frontend/src/components/FileDropField.tsx',
  'frontend/src/components/layout/AppHeader.tsx',
  'frontend/src/api/pdfJobs.ts',
  'frontend/src/types/pdfJob.ts',
  'frontend/src/types/upload.ts',
  'frontend/src/utils/pdfThemes.ts',
  'frontend/src/utils/submissionRecovery.ts',
  'frontend/src/utils/uploadFiles.ts',
  'frontend/src/utils/markdownSource.ts',
  'frontend/src/utils/pdfJobStatus.ts',
  'frontend/src/utils/pdfJobUpdates.ts',
]

const requiredText = new Map([
  ['frontend/src/app/router.tsx', ['createBrowserRouter']],
  ['frontend/src/app/providers.tsx', ['QueryClientProvider']],
  ['frontend/src/stores/workspaceStore.ts', ['persist(', 'partialize:', 'resetSession']],
  ['frontend/src/components/layout/PageContainer.tsx', ['box-border w-full min-w-0']],
  ['frontend/src/components/layout/ProtectedLayout.tsx', ['overflow-x-hidden', 'lg:grid lg:h-dvh lg:min-h-0 lg:grid-cols-[18rem_minmax(0,1fr)] lg:overflow-hidden', 'id="app-main-scroll"', 'lg:overflow-y-auto']],
  ['frontend/src/components/ui/select.tsx', ['min-w-0 max-w-full']],
  ['frontend/src/components/ui/tabs.tsx', ['min-w-0 max-w-full']],
  ['frontend/src/features/pdf-jobs/hooks/cache.ts', ['setQueryData', 'shouldApplyPdfJobUpdate']],
  ['frontend/src/features/pdf-jobs/hooks/PdfJobsRealtimeBridge.tsx', ['postgres_changes']],
  ['frontend/src/features/pdf-jobs/hooks/usePdfJob.ts', ['refetchInterval']],
  ['frontend/src/features/pdf-builder/hooks/usePdfSubmission.ts', ['submissionReducer', 'async function submit', 'await actions.uploadMarkdown.mutateAsync', 'await actions.start.mutateAsync']],
  ['frontend/src/features/pdf-builder/components/SingleJobForm.tsx', ['const submit = form.handleSubmit', '点击生成后上传', 'BuilderFormSection', 'SubmissionStatus']],
  ['frontend/src/features/pdf-builder/components/BuilderFormSection.tsx', ['grid min-w-0 max-w-full']],
  ['frontend/src/features/pdf-builder/hooks/useBatchSubmission.ts', ['Math.min(3']],
  ['frontend/src/components/layout/AppSidebar.tsx', ['当前账号', '设置', 'sidebar-accent', 'min-h-0 flex-1', 'overscroll-contain']],
  ['frontend/src/styles/globals.css', ['@tailwind base', '--sidebar:', '--popover:', 'overflow-x: hidden', 'overscroll-behavior-x: none', 'text-size-adjust: 100%']],
  ['.github/workflows/deploy-pages.yml', ['push:', 'branches:', '- main', 'workflow_dispatch:']],
])

const errors = []
for (const file of requiredFiles) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) errors.push(`Missing required file: ${file}`)
}
for (const file of removedFiles) {
  if (fs.existsSync(file)) errors.push(`Obsolete file still exists: ${file}`)
}
for (const [file, tokens] of requiredText) {
  if (!fs.existsSync(file)) continue
  const source = fs.readFileSync(file, 'utf8')
  for (const token of tokens) {
    if (!source.includes(token)) errors.push(`${file} must contain ${token}`)
  }
}

const submissionSource = fs.readFileSync('frontend/src/features/pdf-builder/hooks/usePdfSubmission.ts', 'utf8')
if (submissionSource.includes('async function prepare')) {
  errors.push('usePdfSubmission must not expose automatic source preparation before Generate PDF is clicked')
}
if (fs.readFileSync('frontend/src/features/pdf-builder/components/SingleJobForm.tsx', 'utf8').includes('submission.prepare')) {
  errors.push('SingleJobForm must not upload while selecting or pasting a source')
}

const protectedLayoutSource = fs.readFileSync('frontend/src/components/layout/ProtectedLayout.tsx', 'utf8')
if (
  protectedLayoutSource.includes('lg:pl-72')
  || protectedLayoutSource.includes('fixed inset-y-0 left-0')
  || protectedLayoutSource.includes('sticky top-0')
) {
  errors.push('ProtectedLayout must use a viewport-height desktop grid with an independently scrolling main content region')
}

const globalStylesSource = fs.readFileSync('frontend/src/styles/globals.css', 'utf8')
if (globalStylesSource.includes('scrollbar-gutter: stable')) {
  errors.push('Root scrollbar-gutter must not reserve fractional inline space on tablet Chromium')
}
if (globalStylesSource.includes('overflow-x: clip')) {
  errors.push('Root overflow must use hidden for compatibility with Chromium viewport scrolling')
}

const pkg = JSON.parse(fs.readFileSync('frontend/package.json', 'utf8'))
const lock = JSON.parse(fs.readFileSync('frontend/package-lock.json', 'utf8'))
if (pkg.scripts?.test !== 'node --import tsx --test tests/*.test.*') errors.push('Unexpected frontend test command')
if (pkg.devDependencies?.wrangler !== '4.110.0') errors.push('frontend wrangler must be pinned to 4.110.0')
if (lock.packages?.['']?.devDependencies?.wrangler !== '4.110.0') errors.push('frontend lockfile root must pin wrangler 4.110.0')
if (lock.packages?.['node_modules/wrangler']?.version !== '4.110.0') errors.push('frontend lockfile must resolve wrangler 4.110.0')

for (const workflow of [
  '.github/workflows/frontend-ci.yml',
  '.github/workflows/deploy-pages.yml',
  '.github/workflows/smoke-supabase-service.yml',
]) {
  const source = fs.readFileSync(workflow, 'utf8')
  for (const token of ['cache: npm', 'cache-dependency-path: frontend/package-lock.json', 'npm ci']) {
    if (!source.includes(token)) errors.push(`${workflow} must contain ${token}`)
  }
  if (/npm install(?:\s|$)/m.test(source)) errors.push(`${workflow} must use npm ci rather than npm install`)
}

for (const workflow of ['.github/workflows/deploy-pages.yml', '.github/workflows/smoke-supabase-service.yml']) {
  if (!fs.readFileSync(workflow, 'utf8').includes('./node_modules/.bin/wrangler')) {
    errors.push(`${workflow} must use the pinned local wrangler binary`)
  }
}

if (errors.length > 0) {
  console.error('Frontend architecture validation failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Validated ${requiredFiles.length} frontend architecture files and ${removedFiles.length} removals.`)
