<script setup lang="ts">
import type { FeedParseResult } from '~/youtube/feed'

import YouTubeHome from './YouTubeHome.vue'

defineProps<{
  initial: FeedParseResult
  surface: 'home' | 'search'
  query: string
}>()
</script>

<template>
  <YouTubeHome :initial="initial" :surface="surface" :query="query" />
</template>
