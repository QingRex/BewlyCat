<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { continueHomeFeed } from '~/contentScripts/feedBridge'
import { settings } from '~/logic'
import type { ContinuationRequest, FeedCard, FeedParseResult } from '~/youtube/feed'
import { cardOpenUrl } from '~/youtube/feed'

const props = defineProps<{
  initial: FeedParseResult
  surface: 'home' | 'search'
  query: string
}>()

const { t, locale } = useI18n()
const cards = ref<FeedCard[]>([])
const continuation = ref<ContinuationRequest | undefined>()
const loadingMore = ref(false)
const continuationError = ref(false)
const settingsOpen = ref(false)
const searchText = ref(props.query)
const viewport = ref<HTMLElement | null>(null)
const sentinel = ref<HTMLElement | null>(null)
const seenTokens = new Set<string>()

function cardsOf(result: FeedParseResult): FeedCard[] {
  if (result.kind !== 'page')
    return []
  if (props.surface === 'home')
    return result.cards.filter(card => card.kind === 'video')
  return result.cards
}

function cardKey(card: FeedCard): string {
  switch (card.kind) {
    case 'video':
      return `video:${card.videoId}`
    case 'channel':
      return `channel:${card.channelId}`
    case 'playlist':
      return `playlist:${card.playlistId}`
    default: {
      const _exhaustive: never = card
      return _exhaustive
    }
  }
}

function applyPage(result: FeedParseResult, append: boolean) {
  if (result.kind !== 'page') {
    continuationError.value = true
    return
  }
  continuationError.value = false
  cards.value = append ? [...cards.value, ...cardsOf(result)] : cardsOf(result)
  const next = result.continuation
  if (!next || seenTokens.has(next.token)) {
    continuation.value = undefined
    return
  }
  continuation.value = next
}

applyPage(props.initial, false)

const columns = computed(() => {
  const value = settings.value.gridColumns.lg
  if (!Number.isFinite(value))
    return 4
  return Math.min(8, Math.max(1, Math.round(value)))
})

const themeName = computed(() => {
  if (settings.value.theme === 'light' || settings.value.theme === 'dark')
    return settings.value.theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
})

watch(themeName, (theme) => {
  const root = viewport.value?.getRootNode()
  if (root instanceof ShadowRoot && root.host instanceof HTMLElement)
    root.host.classList.toggle('dark', theme === 'dark')
})

const wallpaperUrl = computed(() => {
  const value = settings.value.wallpaper.trim()
  if (value.startsWith('https://') || value.startsWith('http://'))
    return value
  return ''
})

watch(() => settings.value.language, (language) => {
  if (language)
    locale.value = language
}, { immediate: true })

watch([() => props.surface, () => props.query, locale], () => {
  if (props.surface === 'search')
    document.title = t('youtube_search.heading', { query: props.query })
}, { immediate: true })

function submitSearch() {
  const query = searchText.value.trim()
  if (!query)
    return
  location.assign(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`)
}

async function loadMore() {
  const next = continuation.value
  if (!next || loadingMore.value || seenTokens.has(next.token))
    return
  seenTokens.add(next.token)
  loadingMore.value = true
  const body = await continueHomeFeed(next)
  loadingMore.value = false
  if (body.kind === 'request-failed' || body.result.kind !== 'page') {
    seenTokens.delete(next.token)
    continuationError.value = true
    return
  }
  applyPage(body.result, true)
}

function retryContinuation() {
  continuationError.value = false
  void loadMore()
}

let observer: IntersectionObserver | undefined
onMounted(() => {
  const root = viewport.value?.getRootNode()
  if (root instanceof ShadowRoot && root.host instanceof HTMLElement)
    root.host.classList.toggle('dark', themeName.value === 'dark')
  nextTick(() => {
    if (!viewport.value || !sentinel.value)
      return
    observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting))
        void loadMore()
    }, { root: viewport.value, rootMargin: '240px' })
    observer.observe(sentinel.value)
  })
})
</script>

<template>
  <div class="home" :class="`home--${themeName}`">
    <div v-if="wallpaperUrl" class="home__wallpaper" :style="{ backgroundImage: `url(${wallpaperUrl})` }" />
    <header class="home__bar">
      <a class="home__logo" href="https://www.youtube.com/">{{ t('youtube_home.title') }}</a>
      <form class="home__search" @submit.prevent="submitSearch">
        <input v-model="searchText" type="search" :placeholder="t('youtube_home.search_placeholder')" :aria-label="t('youtube_home.search_placeholder')">
        <button type="submit">
          {{ t('youtube_home.search_submit') }}
        </button>
      </form>
      <button type="button" class="home__settings-button" @click="settingsOpen = true">
        {{ t('youtube_home.settings') }}
      </button>
    </header>
    <div ref="viewport" class="home__scroll">
      <p v-if="cards.length === 0" class="home__status">
        {{ t(surface === 'search' ? 'youtube_search.empty' : 'youtube_home.empty') }}
      </p>
      <div class="home__grid" :style="{ '--home-columns': String(columns) }">
        <a v-for="card in cards" :key="cardKey(card)" class="home__card" :href="cardOpenUrl(card)">
          <img v-if="card.kind === 'video'" class="home__thumb" :src="card.thumbnailUrl" alt="">
          <span class="home__title">{{ card.kind === 'channel' ? card.name : card.title }}</span>
          <span v-if="card.kind === 'video'" class="home__meta">{{ card.channel.name }}</span>
          <span v-else class="home__meta">{{ t(card.kind === 'channel' ? 'youtube_search.channel' : 'youtube_search.playlist') }}</span>
          <span v-if="card.kind === 'video' && (card.durationText || card.viewCountText)" class="home__meta">
            {{ [card.durationText, card.viewCountText].filter(Boolean).join(' · ') }}
          </span>
        </a>
      </div>
      <p v-if="continuationError" class="home__status">
        {{ t('youtube_home.error') }}
        <button type="button" @click="retryContinuation">
          {{ t('youtube_home.retry') }}
        </button>
      </p>
      <div ref="sentinel" class="home__sentinel" />
    </div>
    <form v-if="settingsOpen" class="home__settings" @submit.prevent="settingsOpen = false">
      <h2>{{ t('youtube_home.settings') }}</h2>
      <label>
        {{ t('youtube_home.theme') }}
        <select v-model="settings.theme">
          <option value="auto">{{ t('youtube_home.theme_auto') }}</option>
          <option value="light">{{ t('youtube_home.theme_light') }}</option>
          <option value="dark">{{ t('youtube_home.theme_dark') }}</option>
        </select>
      </label>
      <label>
        {{ t('youtube_home.wallpaper') }}
        <input v-model="settings.wallpaper" type="url">
      </label>
      <label>
        {{ t('youtube_home.grid_density') }}
        <input v-model.number="settings.gridColumns.lg" type="number" min="1" max="8">
      </label>
      <button type="submit">
        {{ t('youtube_home.close') }}
      </button>
    </form>
  </div>
</template>

<style lang="scss">
@import "~/styles/variables.scss";

.home {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  color: var(--bew-text-1);
  background: var(--bew-bg);
  font-size: var(--bew-font-size-body);
  line-height: var(--bew-line-height-body);
}

.home--dark {
  color-scheme: dark;
}

.home__wallpaper {
  position: absolute;
  inset: 0;
  background-position: center;
  background-size: cover;
  opacity: 0.35;
  pointer-events: none;
}

.home__bar,
.home__scroll,
.home__settings {
  position: relative;
}

.home__bar {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 20px;
}

.home__logo,
.home__search button,
.home__settings-button,
.home__settings button,
.home__status button {
  border: 0;
  border-radius: var(--bew-radius);
  background: var(--bew-fill-1);
  color: inherit;
  font: inherit;
}

.home__logo {
  padding: 8px 12px;
  text-decoration: none;
}

.home__search {
  display: flex;
  flex: 1;
  gap: 8px;
}

.home__search input,
.home__settings input,
.home__settings select {
  width: 100%;
  border: 1px solid var(--bew-border-color);
  border-radius: var(--bew-radius);
  background: var(--bew-elevated);
  color: inherit;
  font: inherit;
  padding: 8px 12px;
}

.home__search button,
.home__settings-button,
.home__settings button,
.home__status button {
  padding: 8px 12px;
  cursor: pointer;
}

.home__scroll {
  flex: 1;
  overflow: auto;
  padding: 8px 20px 32px;
}

.home__grid {
  display: grid;
  grid-template-columns: repeat(var(--home-columns), minmax(0, 1fr));
  gap: 16px;
}

.home__card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: inherit;
  text-decoration: none;
}

.home__thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: var(--bew-radius);
  background: var(--bew-fill-1);
}

.home__title {
  font-weight: var(--bew-font-weight-medium);
}

.home__meta,
.home__status {
  color: var(--bew-text-2);
  font-size: var(--bew-font-size-control);
}

.home__settings {
  position: absolute;
  top: 64px;
  right: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(360px, calc(100% - 40px));
  padding: 16px;
  border-radius: var(--bew-radius);
  background: var(--bew-elevated-solid);
  box-shadow: var(--bew-shadow-1);
}

.home__sentinel {
  height: 1px;
}
</style>
