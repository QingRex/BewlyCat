import browser from 'webextension-polyfill'

import { setupContentScriptRefreshPrompt } from './contentScriptRefreshPrompt'
import { setupApiMsgListeners } from './messageListeners/api'
import { setupTabMsgListeners } from './messageListeners/tabs'
import { setupSettingsCloudSync } from './settingsCloudSync'
import { setupSettingsStorageCoordinator } from './settingsStorageCoordinator'
import { setupTopBarStateBroker } from './topBarStateBroker'
import { setupWatchLaterStateBroker } from './watchLaterStateBroker'

browser.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed')
})

setupSettingsStorageCoordinator()
setupSettingsCloudSync()
setupApiMsgListeners()
setupTabMsgListeners()
setupTopBarStateBroker()
setupWatchLaterStateBroker()
setupContentScriptRefreshPrompt()
