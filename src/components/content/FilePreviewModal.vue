<template>
  <Teleport to="body">
    <div class="fp-overlay" ref="overlayRef" tabindex="-1" @click.self="close" @keydown.escape="close">
      <div class="fp-modal">
        <header class="fp-header">
          <span class="fp-filename" :title="entry.path">{{ entry.name }}</span>
          <span v-if="fileSize" class="fp-size">{{ fileSize }}</span>
          <div class="fp-actions">
            <button type="button" class="fp-action-btn" @click="downloadFile" :title="t('Download')">
              <IconDownload class="fp-action-icon" />
            </button>
            <button type="button" class="fp-action-btn" @click="close" :aria-label="t('Close')">
              <IconX class="fp-action-icon" />
            </button>
          </div>
        </header>
        <div class="fp-body">
          <div v-if="isLoading" class="fp-status">{{ t('Loading') }}…</div>
          <div v-else-if="error" class="fp-error">{{ error }}</div>

          <!-- Office HTML preview (sandboxed: scripts allowed but no same-origin access to parent) -->
          <iframe v-else-if="previewType === 'office'" class="fp-iframe" :srcdoc="officeHtml" sandbox="allow-scripts" />

          <!-- Image -->
          <div v-else-if="previewType === 'image'" class="fp-image-wrap">
            <img class="fp-image" :src="serveUrl" :alt="entry.name" @error="error = t('Failed to load file preview.')" />
          </div>

          <!-- PDF -->
          <iframe v-else-if="previewType === 'pdf'" class="fp-iframe" :src="serveUrl" />

          <!-- Video -->
          <video v-else-if="previewType === 'video'" class="fp-media" controls :src="serveUrl" />

          <!-- Audio -->
          <div v-else-if="previewType === 'audio'" class="fp-audio-wrap">
            <audio controls :src="serveUrl" />
          </div>

          <!-- Markdown -->
          <div v-else-if="previewType === 'markdown'" class="fp-markdown" v-html="renderedContent" />

          <!-- Code with syntax highlighting -->
          <div v-else-if="previewType === 'code'" class="fp-code-wrap">
            <pre class="fp-code"><code v-html="renderedContent" /></pre>
          </div>

          <!-- Plain text -->
          <pre v-else-if="previewType === 'text'" class="fp-text">{{ textContent }}</pre>

          <!-- Unsupported -->
          <div v-else class="fp-status fp-unsupported">{{ t('Preview is not available for this file type.') }}</div>
        </div>
        <div v-if="isTruncated" class="fp-truncated">{{ t('File is too large — showing first 1 MB only.') }}</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Modal overlay for previewing files.
 * Supports Office (via OfficeCLI), code (highlight.js), markdown, images, PDF, video, audio, and plain text.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import hljs from 'highlight.js/lib/common'
import MarkdownIt from 'markdown-it'
import { IconDownload, IconX } from '@tabler/icons-vue'

type PreviewEntry = { name: string; path: string; extension: string; size: number }

const props = defineProps<{ entry: PreviewEntry }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const overlayRef = ref<HTMLElement | null>(null)
const isLoading = ref(false)
const error = ref('')
const textContent = ref('')
const renderedContent = ref('')
const officeHtml = ref('')
const isTruncated = ref(false)
const fileSizeBytes = ref(0)

const md = new MarkdownIt({
  html: false,
  linkify: true,
  highlight(str: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(str, { language: lang }).value } catch { /* ignore */ }
    }
    return ''
  },
})

const OFFICE_EXTS = new Set(['.docx', '.xlsx', '.pptx'])
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.avif'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.avi'])
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a'])
const MARKDOWN_EXTS = new Set(['.md', '.mdx'])
const TEXT_EXTS = new Set(['.txt', '.log', '.csv', '.env', '.gitignore', '.editorconfig', '.lock', '.cfg', '.conf', '.properties'])
const CODE_LANG_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
  '.py': 'python', '.pyw': 'python',
  '.java': 'java', '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
  '.go': 'go', '.rs': 'rust', '.rb': 'ruby', '.php': 'php',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.html': 'xml', '.htm': 'xml', '.xml': 'xml',
  '.sh': 'bash', '.zsh': 'bash', '.bash': 'bash',
  '.sql': 'sql', '.yaml': 'yaml', '.yml': 'yaml',
  '.toml': 'ini', '.ini': 'ini',
  '.json': 'json', '.jsonc': 'json',
  '.vue': 'xml', '.svelte': 'xml',
  '.swift': 'swift', '.kt': 'kotlin', '.kts': 'kotlin',
  '.lua': 'lua', '.r': 'r', '.R': 'r',
  '.dart': 'dart', '.cs': 'csharp', '.vb': 'vbnet',
  '.pl': 'perl', '.pm': 'perl',
  '.ex': 'elixir', '.exs': 'elixir',
  '.hs': 'haskell', '.scala': 'scala',
  '.dockerfile': 'dockerfile', '.makefile': 'makefile',
  '.graphql': 'graphql', '.gql': 'graphql',
  '.diff': 'diff', '.patch': 'diff',
}

function getPreviewType(ext: string): string {
  if (OFFICE_EXTS.has(ext)) return 'office'
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (ext === '.pdf') return 'pdf'
  if (VIDEO_EXTS.has(ext)) return 'video'
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (MARKDOWN_EXTS.has(ext)) return 'markdown'
  if (ext in CODE_LANG_MAP) return 'code'
  if (TEXT_EXTS.has(ext)) return 'text'
  return 'unsupported'
}

const previewType = computed(() => getPreviewType(props.entry.extension))
const serveUrl = computed(() => `/codex-api/files/serve?path=${encodeURIComponent(props.entry.path)}`)
const downloadUrl = computed(() => `/codex-api/files/download?path=${encodeURIComponent(props.entry.path)}`)

const fileSize = computed(() => {
  const b = fileSizeBytes.value || props.entry.size
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`
})

/** Map server error strings to i18n keys. */
function mapServerError(msg: string): string {
  if (msg.includes('officecli not found')) return t('OfficeCLI is not installed. Office file preview requires OfficeCLI.')
  if (msg.includes('not a file')) return t('Path is not a file.')
  if (msg.includes('not found') || msg.includes('Not found')) return t('File or folder not found.')
  if (msg.includes('absolute')) return t('Invalid path.')
  if (msg.includes('not supported for preview')) return t('Preview is not available for this file type.')
  if (msg.includes('Unexpected') || msg.includes('failed') || msg.includes('Failed')) return t('Failed to load file preview.')
  return msg
}

/** Fetch text content from the read endpoint. */
async function fetchText(): Promise<{ content: string; truncated: boolean }> {
  const resp = await fetch(`/codex-api/files/read?path=${encodeURIComponent(props.entry.path)}`)
  if (!resp.ok) {
    const data = await resp.json().catch(() => null) as { error?: string } | null
    throw new Error(mapServerError(data?.error || t('Failed to load file preview.')))
  }
  const data = await resp.json() as { content: string; truncated: boolean; size: number }
  fileSizeBytes.value = data.size
  return data
}

/** Load preview content based on file type. */
async function loadPreview(): Promise<void> {
  const type = previewType.value
  if (['image', 'pdf', 'video', 'audio', 'unsupported'].includes(type)) return

  isLoading.value = true
  error.value = ''
  textContent.value = ''
  renderedContent.value = ''
  officeHtml.value = ''
  isTruncated.value = false
  fileSizeBytes.value = 0
  try {
    if (type === 'office') {
      const resp = await fetch(`/codex-api/files/office-preview?path=${encodeURIComponent(props.entry.path)}`)
      if (!resp.ok) {
        const data = await resp.json().catch(() => null) as { error?: string } | null
        throw new Error(mapServerError(data?.error || t('Failed to load file preview.')))
      }
      officeHtml.value = await resp.text()
    } else if (type === 'markdown') {
      const data = await fetchText()
      isTruncated.value = data.truncated
      renderedContent.value = md.render(data.content)
    } else if (type === 'code') {
      const data = await fetchText()
      isTruncated.value = data.truncated
      const lang = CODE_LANG_MAP[props.entry.extension]
      if (lang && hljs.getLanguage(lang)) {
        renderedContent.value = hljs.highlight(data.content, { language: lang }).value
      } else {
        renderedContent.value = hljs.highlightAuto(data.content).value
      }
    } else {
      const data = await fetchText()
      isTruncated.value = data.truncated
      textContent.value = data.content
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('Failed to load file preview.')
  } finally {
    isLoading.value = false
  }
}

function close(): void {
  emit('close')
}

function downloadFile(): void {
  const a = document.createElement('a')
  a.href = downloadUrl.value
  a.download = props.entry.name
  a.click()
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') close()
}

watch(() => props.entry.path, () => { void loadPreview() }, { immediate: true })

onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
  nextTick(() => overlayRef.value?.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
@reference "tailwindcss";

.fp-overlay {
  @apply fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm;
}

.fp-modal {
  @apply flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden;
  width: 90vw;
  height: 88vh;
  max-width: 1200px;
}

.fp-header {
  @apply flex items-center gap-3 px-4 py-2.5 border-b border-zinc-200 shrink-0;
}

.fp-filename {
  @apply flex-1 min-w-0 truncate text-sm font-medium text-zinc-800;
}

.fp-size {
  @apply shrink-0 text-xs text-zinc-400 tabular-nums;
}

.fp-actions {
  @apply flex items-center gap-1;
}

.fp-action-btn {
  @apply h-7 w-7 rounded-md border border-zinc-200 bg-white text-zinc-500 flex items-center justify-center transition hover:bg-zinc-50 hover:text-zinc-700;
}

.fp-action-icon {
  @apply w-3.5 h-3.5;
}

.fp-body {
  @apply flex-1 min-h-0 overflow-auto;
}

.fp-status {
  @apply flex items-center justify-center h-full text-sm text-zinc-400;
}

.fp-error {
  @apply flex items-center justify-center h-full text-sm text-rose-600 px-6 text-center;
}

.fp-unsupported {
  @apply text-zinc-500;
}

.fp-iframe {
  @apply w-full h-full border-0;
}

.fp-image-wrap {
  @apply flex items-center justify-center h-full p-4 overflow-auto;
}

.fp-image {
  @apply max-w-full max-h-full object-contain rounded;
}

.fp-media {
  @apply w-full h-full object-contain bg-black;
}

.fp-audio-wrap {
  @apply flex items-center justify-center h-full p-8;
}

.fp-code-wrap {
  @apply h-full overflow-auto;
}

.fp-code {
  @apply m-0 p-4 text-xs leading-relaxed font-mono bg-zinc-50 min-h-full;
  white-space: pre-wrap;
  word-break: break-word;
}

.fp-text {
  @apply m-0 p-4 text-xs leading-relaxed font-mono text-zinc-700 bg-zinc-50 min-h-full whitespace-pre-wrap break-words;
}

.fp-markdown {
  @apply p-6 text-sm leading-relaxed text-zinc-800 max-w-none;
}

.fp-truncated {
  @apply shrink-0 px-4 py-1.5 text-xs text-amber-600 bg-amber-50 border-t border-amber-200 text-center;
}

/* ── Syntax highlighting (light) ── */
.fp-code :deep(.hljs) { color: #24292e; }
.fp-code :deep(.hljs-keyword) { color: #d73a49; }
.fp-code :deep(.hljs-string) { color: #032f62; }
.fp-code :deep(.hljs-number) { color: #005cc5; }
.fp-code :deep(.hljs-comment) { color: #6a737d; font-style: italic; }
.fp-code :deep(.hljs-title) { color: #6f42c1; }
.fp-code :deep(.hljs-built_in) { color: #e36209; }
.fp-code :deep(.hljs-literal) { color: #005cc5; }
.fp-code :deep(.hljs-type) { color: #d73a49; }
.fp-code :deep(.hljs-attr) { color: #005cc5; }
.fp-code :deep(.hljs-tag) { color: #22863a; }
.fp-code :deep(.hljs-name) { color: #22863a; }
.fp-code :deep(.hljs-attribute) { color: #005cc5; }
.fp-code :deep(.hljs-selector-tag) { color: #d73a49; }
.fp-code :deep(.hljs-selector-class) { color: #6f42c1; }
.fp-code :deep(.hljs-variable) { color: #e36209; }
.fp-code :deep(.hljs-meta) { color: #005cc5; }
.fp-code :deep(.hljs-addition) { color: #22863a; background: #f0fff4; }
.fp-code :deep(.hljs-deletion) { color: #b31d28; background: #ffeef0; }

/* ── Markdown content (light) ── */
.fp-markdown :deep(h1) { @apply text-xl font-semibold mt-4 mb-2 pb-1 border-b border-zinc-200; }
.fp-markdown :deep(h2) { @apply text-lg font-semibold mt-3 mb-2; }
.fp-markdown :deep(h3) { @apply text-base font-semibold mt-2 mb-1; }
.fp-markdown :deep(p) { @apply my-2; }
.fp-markdown :deep(a) { @apply text-blue-600 underline; }
.fp-markdown :deep(code) { @apply bg-zinc-100 px-1.5 py-0.5 rounded text-xs font-mono; }
.fp-markdown :deep(pre) { @apply bg-zinc-100 p-3 rounded-lg overflow-x-auto my-2; }
.fp-markdown :deep(pre code) { @apply bg-transparent p-0; }
.fp-markdown :deep(blockquote) { @apply border-l-3 border-zinc-300 pl-3 text-zinc-500 my-2; }
.fp-markdown :deep(table) { @apply border-collapse my-2 w-full; }
.fp-markdown :deep(th), .fp-markdown :deep(td) { @apply border border-zinc-200 px-3 py-1.5 text-xs; }
.fp-markdown :deep(th) { @apply bg-zinc-50 font-semibold; }
.fp-markdown :deep(ul), .fp-markdown :deep(ol) { @apply pl-5 my-2; }
.fp-markdown :deep(li) { @apply my-0.5; }
.fp-markdown :deep(img) { @apply max-w-full rounded; }
.fp-markdown :deep(hr) { @apply border-zinc-200 my-4; }
</style>
