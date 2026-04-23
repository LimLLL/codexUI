<template>
  <Teleport to="body">
    <div v-if="visible" class="cem-overlay" @click.self="$emit('close')">
      <div class="cem-panel">
        <!-- Header -->
        <div class="cem-header">
          <h3 class="cem-title">{{ $t('Config Editor') }}</h3>
          <button class="cem-close" type="button" aria-label="Close" @click="$emit('close')">
            <IconTablerX class="cem-close-icon" />
          </button>
        </div>

        <!-- Body -->
        <div class="cem-body">
          <template v-if="isLoading">
            <div class="cem-loading">{{ $t('Loading') }}</div>
          </template>
          <template v-else>
            <span v-if="filePath" class="cem-filepath">{{ filePath }}</span>
            <textarea
              v-model="content"
              class="cem-textarea"
              rows="20"
              spellcheck="false"
              autocomplete="off"
            />
          </template>
        </div>

        <!-- Footer -->
        <div class="cem-footer">
          <span v-if="feedback" :class="['cem-feedback', feedbackOk ? 'cem-feedback-ok' : 'cem-feedback-err']">
            {{ feedback }}
          </span>
          <div class="cem-actions">
            <button class="cem-btn cem-btn-secondary" type="button" @click="$emit('close')">
              {{ $t('Cancel') }}
            </button>
            <button
              class="cem-btn cem-btn-primary"
              type="button"
              :disabled="isSaving || isLoading"
              @click="onSave"
            >
              {{ isSaving ? $t('Saving\u2026') : $t('Save') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Modal dialog for editing the Codex config.toml file.
 * Fetches current content on open, allows editing, and saves back via API.
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import IconTablerX from '../icons/IconTablerX.vue'

const props = defineProps<{ visible: boolean }>()
defineEmits<{ close: [] }>()

const { t } = useI18n()

const content = ref('')
const filePath = ref('')
const isLoading = ref(false)
const isSaving = ref(false)
const feedback = ref('')
const feedbackOk = ref(false)

/**
 * Fetch the current config file content from the backend.
 */
async function fetchConfig(): Promise<void> {
  isLoading.value = true
  feedback.value = ''
  try {
    const resp = await fetch('/codex-api/config-file')
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = (await resp.json()) as { content?: string; path?: string }
    content.value = data.content ?? ''
    filePath.value = data.path ?? ''
  } catch {
    content.value = ''
    filePath.value = ''
  } finally {
    isLoading.value = false
  }
}

/**
 * Save the edited content back to the config file via PUT.
 */
async function onSave(): Promise<void> {
  isSaving.value = true
  feedback.value = ''
  try {
    const resp = await fetch('/codex-api/config-file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.value }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    feedbackOk.value = true
    feedback.value = t('Config saved successfully')
  } catch {
    feedbackOk.value = false
    feedback.value = t('Failed to save config')
  } finally {
    isSaving.value = false
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      content.value = ''
      filePath.value = ''
      feedback.value = ''
      void fetchConfig()
    }
  },
)
</script>

<style scoped>
@reference "tailwindcss";

.cem-overlay {
  @apply fixed inset-0 z-50 flex items-center justify-center bg-black/50;
}

.cem-panel {
  @apply w-full max-w-[640px] max-h-[90vh] rounded-2xl bg-white shadow-xl flex flex-col overflow-hidden mx-4 border border-zinc-200;
}

.cem-header {
  @apply flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0;
}

.cem-title {
  @apply text-lg font-semibold text-zinc-900 m-0;
}

.cem-close {
  @apply shrink-0 h-7 w-7 rounded-lg border-0 bg-transparent text-zinc-400 flex items-center justify-center transition hover:bg-zinc-100 hover:text-zinc-700;
}

.cem-close-icon {
  @apply w-4 h-4;
}

.cem-body {
  @apply p-5 flex flex-col gap-2 overflow-y-auto flex-1 min-h-0;
}

.cem-loading {
  @apply text-sm text-zinc-400 py-8 text-center;
}

.cem-filepath {
  @apply text-xs text-zinc-400 font-mono truncate;
}

.cem-textarea {
  @apply w-full rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-900 font-mono text-sm p-3 leading-relaxed resize-y outline-none focus:border-zinc-400 transition;
  min-height: 320px;
}

.cem-footer {
  @apply flex items-center justify-between px-5 py-4 border-t border-zinc-100 shrink-0 gap-3;
}

.cem-feedback {
  @apply text-xs truncate;
}

.cem-feedback-ok {
  @apply text-emerald-600;
}

.cem-feedback-err {
  @apply text-rose-600;
}

.cem-actions {
  @apply flex items-center gap-2 shrink-0 ml-auto;
}

.cem-btn {
  @apply rounded-lg px-3 py-1.5 text-sm font-medium transition border-0 disabled:opacity-50 disabled:cursor-not-allowed;
}

.cem-btn-primary {
  @apply bg-zinc-900 text-white hover:bg-black;
}

.cem-btn-secondary {
  @apply bg-zinc-100 text-zinc-700 hover:bg-zinc-200;
}
</style>
