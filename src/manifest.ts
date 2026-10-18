import fs from 'fs-extra'
import type { Manifest } from 'webextension-polyfill'

import type PkgType from '../package.json'
import { isDev, isFirefox, isSafari, port, r } from '../scripts/utils'
import { CONTENT_SCRIPT_MATCHES } from './constants/contentScript'

export async function getManifest() {
  const pkg = await fs.readJSON(r('package.json')) as typeof PkgType

  // update this file to update this manifest.json
  // can also be conditional based on your need
  const manifest: Manifest.WebExtensionManifest = {
    manifest_version: 3,
    name: `${pkg.displayName || pkg.name}${isDev ? ' Dev' : ''}`,
    version: pkg.version,
    description: pkg.description,
    homepage_url: pkg.homepage,
    // action: {
    //   default_icon: './assets/icon-512.png',
    //   default_popup: './dist/popup/index.html',
    // },
    // options_ui: {
    //   page: './dist/options/index.html',
    //   open_in_tab: true,
    // },

    // Setting `persistent` to true in Manifest V3 results in an error in Firefox
    // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background
    background: (isFirefox || isSafari)
      ? { scripts: ['./dist/background/index.js'], persistent: isFirefox ? undefined : false }
      : { service_worker: './dist/background/index.js', type: 'module' },

    icons: {
      16: 'assets/icon-512.png',
      48: 'assets/icon-512.png',
      128: 'assets/icon-512.png',
    },
    permissions: [
      'storage',
      ...(!isSafari ? ['scripting'] : []),
    ],
    host_permissions: [
      '*://www.youtube.com/*',
    ],
    // 只匹配 www.youtube.com 的顶层文档。子框架不注入，match_about_blank 也不打开。
    content_scripts: [
      {
        matches: [...CONTENT_SCRIPT_MATCHES],
        js: ['./dist/contentScripts/pageLoading.js', './dist/contentScripts/index.global.js'],
        run_at: 'document_start',
        all_frames: false,
      },
      {
        matches: [...CONTENT_SCRIPT_MATCHES],
        js: ['./dist/contentScripts/inject.global.js'],
        run_at: 'document_start',
        all_frames: false,
        world: 'MAIN',
      },
    ],
    web_accessible_resources: [
      {
        resources: [
          'assets/*',
        ],
        matches: [...CONTENT_SCRIPT_MATCHES],
      },
    ],
    content_security_policy: isFirefox
      ? {
          extension_pages: 'script-src \'self\'; object-src \'self\'',
        }
      : {
          extension_pages: isDev
          // this is required on dev for Vite script to load
            ? `script-src 'self' http://localhost:${port}; object-src 'self' http://localhost:${port}`
            : 'script-src \'self\'; object-src \'self\'',
        },
  }

  if (isDev)
    manifest.permissions?.push('webNavigation')

  if (isFirefox) {
    manifest.browser_specific_settings = {
      gecko: {
        id: 'addon@celeus.cn',
      },
    }
  }

  return manifest
}
