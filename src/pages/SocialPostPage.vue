<script setup lang="ts">
import { ref, computed } from 'vue';
import DashboardLayout from '@/components/layout/DashboardLayout.vue';
import {
  Copy,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Hash,
  Image as ImageIcon,
  BookOpen,
} from 'lucide-vue-next';
import {
  templates,
  hashtagPacks,
  imageSpecs,
  brandVoice,
} from '@/config/socialContent';

const openTemplateId = ref<string | null>(null);
const editedBodies = ref<Record<string, string>>({});
const copiedId = ref<string | null>(null);
const voiceOpen = ref(true);

function toggleTemplate(id: string) {
  openTemplateId.value = openTemplateId.value === id ? null : id;
}

function bodyFor(id: string): string {
  if (editedBodies.value[id] !== undefined) return editedBodies.value[id];
  return templates.find((t) => t.id === id)?.body ?? '';
}

function setBody(id: string, value: string) {
  editedBodies.value[id] = value;
}

function resetBody(id: string) {
  delete editedBodies.value[id];
}

async function copyText(id: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copiedId.value = id;
    setTimeout(() => {
      if (copiedId.value === id) copiedId.value = null;
    }, 1800);
  } catch {
    // Clipboard blocked — surface it quietly. Modern browsers require
    // user activation (which a button click provides), but non-HTTPS
    // or older browsers can still fail.
    copiedId.value = null;
  }
}

const packById = computed(() =>
  Object.fromEntries(hashtagPacks.map((p) => [p.id, p]))
);

const specById = computed(() =>
  Object.fromEntries(imageSpecs.map((s) => [s.id, s]))
);
</script>

<template>
  <DashboardLayout page-title="Social Media Helper">
    <div class="social">
      <!-- Brand voice — always at top, collapsible -->
      <section class="social__section">
        <button class="social__section-toggle" @click="voiceOpen = !voiceOpen">
          <BookOpen :size="18" />
          <span>Brand Voice</span>
          <ChevronDown v-if="voiceOpen" :size="16" class="social__chevron" />
          <ChevronRight v-else :size="16" class="social__chevron" />
        </button>

        <div v-if="voiceOpen" class="social__voice">
          <div class="social__voice-words">
            <span class="social__voice-label">Tone:</span>
            <span v-for="word in brandVoice.toneWords" :key="word" class="social__voice-chip">
              {{ word }}
            </span>
          </div>

          <div class="social__voice-grid">
            <div>
              <h4 class="social__voice-heading social__voice-heading--do">Do</h4>
              <ul class="social__voice-list">
                <li v-for="(rule, i) in brandVoice.dos" :key="`do-${i}`">{{ rule }}</li>
              </ul>
            </div>
            <div>
              <h4 class="social__voice-heading social__voice-heading--dont">Don't</h4>
              <ul class="social__voice-list">
                <li v-for="(rule, i) in brandVoice.donts" :key="`dont-${i}`">{{ rule }}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- Templates -->
      <section class="social__section">
        <h2 class="social__section-title">
          <Sparkles :size="18" />
          Post Templates
        </h2>
        <p class="social__section-hint">
          Click a template to open, tune the copy, and copy it to your clipboard. Text in
          <code>[brackets]</code> marks fill-in slots.
        </p>

        <div class="social__templates">
          <div
            v-for="tpl in templates"
            :key="tpl.id"
            class="social__template"
            :class="{ 'social__template--open': openTemplateId === tpl.id }"
          >
            <button class="social__template-header" @click="toggleTemplate(tpl.id)">
              <div class="social__template-summary">
                <span class="social__template-name">{{ tpl.name }}</span>
                <span class="social__template-purpose">{{ tpl.purpose }}</span>
              </div>
              <ChevronDown
                v-if="openTemplateId === tpl.id"
                :size="18"
                class="social__chevron"
              />
              <ChevronRight v-else :size="18" class="social__chevron" />
            </button>

            <div v-if="openTemplateId === tpl.id" class="social__template-body">
              <textarea
                class="social__editor"
                :value="bodyFor(tpl.id)"
                rows="12"
                @input="setBody(tpl.id, ($event.target as HTMLTextAreaElement).value)"
              ></textarea>

              <div class="social__template-actions">
                <button
                  class="social__btn social__btn--primary"
                  @click="copyText(tpl.id, bodyFor(tpl.id))"
                >
                  <Check v-if="copiedId === tpl.id" :size="16" />
                  <Copy v-else :size="16" />
                  {{ copiedId === tpl.id ? 'Copied' : 'Copy Text' }}
                </button>
                <button
                  v-if="editedBodies[tpl.id] !== undefined"
                  class="social__btn social__btn--secondary"
                  @click="resetBody(tpl.id)"
                >
                  <RotateCcw :size="16" />
                  Reset to Template
                </button>
              </div>

              <!-- Suggested extras: pull hashtag pack + image spec into view -->
              <div v-if="tpl.suggestedHashtagPack || tpl.suggestedImageSpec" class="social__suggestions">
                <div v-if="tpl.suggestedHashtagPack && packById[tpl.suggestedHashtagPack]" class="social__suggestion">
                  <span class="social__suggestion-label">Suggested hashtags:</span>
                  <span class="social__suggestion-value">{{ packById[tpl.suggestedHashtagPack]?.name }}</span>
                </div>
                <div v-if="tpl.suggestedImageSpec && specById[tpl.suggestedImageSpec]" class="social__suggestion">
                  <span class="social__suggestion-label">Suggested image size:</span>
                  <span class="social__suggestion-value">
                    {{ specById[tpl.suggestedImageSpec]?.platform }} —
                    {{ specById[tpl.suggestedImageSpec]?.dimensions }}
                    ({{ specById[tpl.suggestedImageSpec]?.aspectRatio }})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Hashtag packs -->
      <section class="social__section">
        <h2 class="social__section-title">
          <Hash :size="18" />
          Hashtag Packs
        </h2>
        <p class="social__section-hint">
          Copy a whole pack or click individual tags. Mix and match across packs.
        </p>

        <div class="social__packs">
          <div v-for="pack in hashtagPacks" :key="pack.id" class="social__pack">
            <div class="social__pack-header">
              <div>
                <h3 class="social__pack-name">{{ pack.name }}</h3>
                <p class="social__pack-desc">{{ pack.description }}</p>
              </div>
              <button
                class="social__btn social__btn--secondary social__btn--sm"
                @click="copyText(`pack-${pack.id}`, pack.tags.join(' '))"
              >
                <Check v-if="copiedId === `pack-${pack.id}`" :size="14" />
                <Copy v-else :size="14" />
                {{ copiedId === `pack-${pack.id}` ? 'Copied' : 'Copy All' }}
              </button>
            </div>
            <div class="social__tags">
              <button
                v-for="tag in pack.tags"
                :key="tag"
                class="social__tag"
                @click="copyText(`tag-${tag}`, tag)"
              >
                <Check v-if="copiedId === `tag-${tag}`" :size="12" />
                {{ tag }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Image specs -->
      <section class="social__section">
        <h2 class="social__section-title">
          <ImageIcon :size="18" />
          Image Sizes Cheat-Sheet
        </h2>
        <div class="social__specs">
          <table class="social__spec-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Use</th>
                <th>Dimensions</th>
                <th>Ratio</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="spec in imageSpecs" :key="spec.id">
                <td>{{ spec.platform }}</td>
                <td>{{ spec.useCase }}</td>
                <td><code>{{ spec.dimensions }}</code></td>
                <td>{{ spec.aspectRatio }}</td>
                <td class="social__spec-notes">{{ spec.notes || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </DashboardLayout>
</template>

<style scoped>
.social {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  max-width: 960px;
}

.social__section {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: 1.25rem 1.5rem;
}

.social__section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-heading);
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.5rem;
}

.social__section-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0;
  background: none;
  border: none;
  font-family: var(--font-heading);
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
}

.social__chevron {
  margin-left: auto;
  color: var(--color-text-secondary, var(--color-text));
}

.social__section-hint {
  font-size: 0.8125rem;
  color: var(--color-text-secondary, var(--color-text));
  margin: 0 0 1rem;
}

.social__section-hint code {
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  background: var(--color-bg);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
}

/* Brand voice */
.social__voice {
  margin-top: 1rem;
}

.social__voice-words {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 1rem;
}

.social__voice-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text);
  margin-right: 0.25rem;
}

.social__voice-chip {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}

.social__voice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
}

.social__voice-heading {
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 0 0 0.5rem;
}

.social__voice-heading--do {
  color: #059669;
}

.social__voice-heading--dont {
  color: #dc2626;
}

.social__voice-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.social__voice-list li {
  font-size: 0.8125rem;
  color: var(--color-text);
  line-height: 1.5;
  padding-left: 0.9rem;
  position: relative;
}

.social__voice-list li::before {
  content: '·';
  position: absolute;
  left: 0.15rem;
  font-weight: 700;
}

/* Templates */
.social__templates {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.social__template {
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg);
  transition: border-color 0.15s ease;
}

.social__template--open {
  border-color: var(--color-primary);
}

.social__template-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.social__template-summary {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
}

.social__template-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
}

.social__template-purpose {
  font-size: 0.75rem;
  color: var(--color-text-secondary, var(--color-text));
}

.social__template-body {
  padding: 0 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.social__editor {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 0.875rem;
  line-height: 1.5;
  resize: vertical;
  min-height: 12rem;
}

.social__editor:focus {
  outline: none;
  border-color: var(--color-primary);
}

.social__template-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.social__suggestions {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-top: 0.5rem;
  border-top: 1px dashed var(--color-border);
}

.social__suggestion {
  font-size: 0.8125rem;
  color: var(--color-text-secondary, var(--color-text));
}

.social__suggestion-label {
  font-weight: 600;
  margin-right: 0.4rem;
  color: var(--color-text);
}

/* Hashtag packs */
.social__packs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
}

.social__pack {
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg);
  padding: 0.85rem 1rem;
}

.social__pack-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}

.social__pack-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.social__pack-desc {
  font-size: 0.75rem;
  color: var(--color-text-secondary, var(--color-text));
  margin: 0.15rem 0 0;
}

.social__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.social__tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.social__tag:hover {
  border-color: var(--color-primary);
  background: var(--color-bg);
}

/* Image specs */
.social__specs {
  overflow-x: auto;
}

.social__spec-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.social__spec-table th,
.social__spec-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  color: var(--color-text);
  vertical-align: top;
}

.social__spec-table th {
  font-weight: 600;
  color: var(--color-text-secondary, var(--color-text));
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.social__spec-table code {
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
}

.social__spec-notes {
  color: var(--color-text-secondary, var(--color-text));
}

/* Buttons */
.social__btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  border: 1px solid transparent;
  border-radius: var(--border-radius);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  font-family: var(--font-body);
  transition: opacity 0.15s ease, background-color 0.15s ease;
}

.social__btn--primary {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
}

.social__btn--primary:hover {
  opacity: 0.9;
}

.social__btn--secondary {
  background-color: var(--color-bg);
  color: var(--color-text);
  border-color: var(--color-border);
}

.social__btn--secondary:hover {
  border-color: var(--color-primary);
}

.social__btn--sm {
  padding: 0.35rem 0.7rem;
  font-size: 0.75rem;
}
</style>
