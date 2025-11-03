#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function readConfigXmlScheme(projectRoot) {
  // Versuche, den Wert aus der App-config.xml zu lesen (plugin variable)
  const appConfig = path.join(projectRoot, 'config.xml');
  if (!fs.existsSync(appConfig)) return null;
  const xml = fs.readFileSync(appConfig, 'utf8');
  // <plugin name="cordova-plugin-customurlscheme"> <variable name="ANDROID_SCHEME" value="..."/>
  const m = xml.match(/<variable[^>]*name=["']ANDROID_SCHEME["'][^>]*value=["']([^"']+)["']/i);
  if (m && m[1] && m[1].trim()) return m[1].trim();
  // Fallback: <preference name="ANDROID_SCHEME" value="..."/>
  const p = xml.match(/<preference[^>]*name=["']ANDROID_SCHEME["'][^>]*value=["']([^"']+)["']/i);
  if (p && p[1] && p[1].trim()) return p[1].trim();
  return null;
}

function ensureIntentFilter(manifestPath, scheme) {
  let xml = fs.readFileSync(manifestPath, 'utf8');

  // Bereits vorhanden?
  if (xml.includes(`android:scheme="${scheme}"`)) {
    console.log(`[custom-url-scheme] Bereits vorhanden in: ${manifestPath}`);
    return;
  }

  // Stelle sicher, dass wir die MainActivity treffen: Activity mit MAIN/LAUNCHER
  const mainIntentRegex =
    /(<activity\b[\s\S]*?>\s*<intent-filter>\s*<action android:name="android\.intent\.action\.MAIN"\s*\/>[\s\S]*?<category android:name="android\.intent\.category\.LAUNCHER"\s*\/>[\s\S]*?<\/intent-filter>)/;

  if (!mainIntentRegex.test(xml)) {
    console.warn(`[custom-url-scheme] Konnte MainActivity nicht finden in ${manifestPath}`);
    return;
  }

  const insert = `
      <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="${scheme}" />
      </intent-filter>`;

  xml = xml.replace(mainIntentRegex, `$1\n${insert}`);
  fs.writeFileSync(manifestPath, xml, 'utf8');
  console.log(`[custom-url-scheme] VIEW intent-filter eingefügt in ${manifestPath}`);
}

module.exports = function (ctx) {
  try {
    const projectRoot = ctx.opts.projectRoot;

    // 1) Scheme bestimmen: Reihenfolge der Quellen
    let scheme =
      (ctx.opts && ctx.opts.plugin && ctx.opts.plugin.variables && ctx.opts.plugin.variables.ANDROID_SCHEME) ||
      process.env.ANDROID_SCHEME ||
      readConfigXmlScheme(projectRoot) ||
      '<customurl>'; // letzter Fallback

    scheme = (scheme || '').trim();
    if (!scheme) {
      console.warn('[custom-url-scheme] ANDROID_SCHEME ist leer – breche ab.');
      return;
    }

    // 2) mögliche Manifest-Pfade (cordova-android 10+/11+/12+/13 vs. 9-)
    const candidates = [
      path.join(projectRoot, 'platforms', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
      path.join(projectRoot, 'platforms', 'android', 'AndroidManifest.xml'),
    ].filter(fs.existsSync);

    if (!candidates.length) {
      console.warn('[custom-url-scheme] Kein AndroidManifest.xml gefunden (Platform noch nicht vorbereitet?).');
      return;
    }

    candidates.forEach((file) => ensureIntentFilter(file, scheme));
  } catch (e) {
    console.error('[custom-url-scheme] Fehler im Hook:', e);
  }
};
