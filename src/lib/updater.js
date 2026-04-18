/**
 * Auto-update module for HealthWalk Android app.
 *
 * Checks a remote version.json for a newer release.
 * If found, opens the APK download URL via system browser
 * which triggers the standard Android download → install flow.
 *
 * version.json format (hosted on GitHub Pages / server):
 * {
 *   "version": "1.1.0",
 *   "versionCode": 2,
 *   "apkUrl": "https://github.com/Nightdamn/healthwalk/releases/download/v1.1.0/healthwalk.apk",
 *   "releaseNotes": "Новые функции и исправления"
 * }
 */

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

// Current app version — increment on each release
export const APP_VERSION = '1.0.0';
export const APP_VERSION_CODE = 1;

// URL where version.json is hosted
const VERSION_CHECK_URL = 'https://nightdamn.github.io/healthwalk/version.json';

/**
 * Check if running as a native app (not in browser)
 */
export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

/**
 * Check for available updates.
 * Returns { available: boolean, version?, versionCode?, apkUrl?, releaseNotes? }
 */
export async function checkForUpdate() {
  try {
    const res = await fetch(VERSION_CHECK_URL, {
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return { available: false, error: 'Не удалось проверить обновления' };

    const data = await res.json();
    const remoteCode = data.versionCode || 0;

    if (remoteCode > APP_VERSION_CODE) {
      return {
        available: true,
        version: data.version,
        versionCode: remoteCode,
        apkUrl: data.apkUrl,
        releaseNotes: data.releaseNotes || '',
      };
    }

    return { available: false };
  } catch (e) {
    console.error('[Updater] Check failed:', e);
    return { available: false, error: 'Ошибка соединения' };
  }
}

/**
 * Start the update — opens APK URL in browser for download & install.
 */
export async function startUpdate(apkUrl) {
  if (!apkUrl) return;
  try {
    await Browser.open({ url: apkUrl });
  } catch (e) {
    // Fallback: open in the webview
    window.open(apkUrl, '_system');
  }
}
