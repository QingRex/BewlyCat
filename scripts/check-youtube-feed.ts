import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readSettingsDocument, SETTINGS_DOCUMENT_VERSION, writeSettingsDocument } from '../src/logic/settingsDocument'
import { cardOpenUrl } from '../src/youtube/feed'
import { parseFeed } from '../src/youtube/parseFeed'

const sampleDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../src/youtube/samples')

function readSample(name: string): unknown {
  return JSON.parse(readFileSync(resolve(sampleDirectory, name), 'utf8'))
}

const success = parseFeed(readSample('success.json'))
assert.equal(success.kind, 'page')
if (success.kind !== 'page')
  throw new Error('success sample')

assert.deepEqual(success.cards.map(card => card.kind), ['video', 'video', 'channel', 'playlist'])
assert.equal(success.cards[0]?.kind, 'video')
if (success.cards[0]?.kind === 'video') {
  assert.equal(success.cards[0].title, 'Sample video')
  assert.equal(success.cards[0].videoId, 'dQw4w9WgXcQ')
  assert.equal(success.cards[0].channel.channelId, 'UC1234567890')
  assert.equal(success.cards[0].channel.name, 'Sample channel')
  assert.equal(success.cards[0].durationText, '3:33')
  assert.equal(success.cards[0].viewCountText, '1,234 views')
  assert.equal(cardOpenUrl(success.cards[0]), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal('url' in success.cards[0], false)
}
assert.equal(success.cards[1]?.kind, 'video')
if (success.cards[1]?.kind === 'video') {
  assert.equal(success.cards[1].title, 'No stats')
  assert.equal(success.cards[1].durationText, undefined)
  assert.equal(success.cards[1].viewCountText, undefined)
}
assert.equal(success.cards[2]?.kind, 'channel')
if (success.cards[2]?.kind === 'channel') {
  assert.equal(success.cards[2].name, 'A channel')
  assert.equal(cardOpenUrl(success.cards[2]), 'https://www.youtube.com/channel/UCchannelonly')
}
assert.equal(success.cards[3]?.kind, 'playlist')
if (success.cards[3]?.kind === 'playlist') {
  assert.equal(success.cards[3].title, 'A playlist')
  assert.equal(cardOpenUrl(success.cards[3]), 'https://www.youtube.com/playlist?list=PLsample')
}
assert.deepEqual(success.continuation, {
  target: '/youtubei/v1/browse?prettyPrint=false',
  token: 'opaque-token',
})

const empty = parseFeed(readSample('empty.json'))
assert.deepEqual(empty, { kind: 'page', cards: [] })

const missing = parseFeed(readSample('missing-fields.json'))
assert.deepEqual(missing, { kind: 'items-discarded' })

const notFeed = parseFeed(readSample('not-feed.json'))
assert.deepEqual(notFeed, { kind: 'not-feed' })

const shorts = parseFeed(readSample('shorts-shelf.json'))
assert.equal(shorts.kind, 'page')
if (shorts.kind !== 'page')
  throw new Error('shorts sample')
assert.equal(shorts.cards.length, 1)
assert.equal(shorts.cards[0]?.kind, 'video')
if (shorts.cards[0]?.kind === 'video') {
  assert.equal(shorts.cards[0].videoId, 'videoKept01')
  assert.equal(shorts.cards[0].title, 'Kept video')
}
assert.equal(shorts.continuation, undefined)

const defaults = {
  version: SETTINGS_DOCUMENT_VERSION,
  theme: 'auto',
  wallpaper: '',
  gridColumns: { base: 1 },
}
const oldDocument = {
  useOriginalBilibiliHomepage: true,
  theme: 'dark',
  wallpaper: 'https://example.invalid/old.jpg',
  legacyOnly: 'keep-me-out',
}
assert.deepEqual(readSettingsDocument(oldDocument, defaults), defaults)
assert.equal('useOriginalBilibiliHomepage' in readSettingsDocument(oldDocument, defaults), false)

const current = {
  version: SETTINGS_DOCUMENT_VERSION,
  theme: 'dark',
  wallpaper: 'https://example.invalid/wall.jpg',
  gridColumns: { base: 3 },
  useOriginalBilibiliHomepage: true,
  legacyOnly: 'keep-me-out',
}
const readCurrent = readSettingsDocument(current, defaults)
assert.equal(readCurrent.version, SETTINGS_DOCUMENT_VERSION)
assert.equal(readCurrent.theme, 'dark')
assert.equal(readCurrent.wallpaper, 'https://example.invalid/wall.jpg')
assert.deepEqual(readCurrent.gridColumns, { base: 3 })
assert.equal('useOriginalBilibiliHomepage' in readCurrent, false)
assert.equal('legacyOnly' in readCurrent, false)

const patch = {
  set: {
    theme: 'light',
    useOriginalBilibiliHomepage: false,
    legacyOnly: 'still-out',
  },
  remove: ['wallpaper'],
}
const written = writeSettingsDocument(current, patch, defaults)
const writtenAgain = writeSettingsDocument(written, patch, defaults)
assert.deepEqual(writtenAgain, written)
assert.deepEqual(written, {
  version: SETTINGS_DOCUMENT_VERSION,
  theme: 'light',
  wallpaper: '',
  gridColumns: { base: 3 },
})

const partial = { version: SETTINGS_DOCUMENT_VERSION, theme: 'dark' }
const completed = readSettingsDocument(partial, defaults)
assert.equal(completed.theme, 'dark')
assert.equal(completed.wallpaper, '')
assert.deepEqual(Object.keys(completed), Object.keys(defaults))

console.log('youtube phase 2 checks passed')
