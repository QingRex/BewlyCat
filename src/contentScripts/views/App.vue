<script setup lang="ts">
import type { FeedParseResult } from '~/youtube/feed'

import YouTubeHome from './YouTubeHome.vue'

defineProps<{
  initial: FeedParseResult
}>()
</script>

<template>
  <YouTubeHome :initial="initial" />
</template>
