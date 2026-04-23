# InStep Android

Android-приложение на базе Capacitor — обёртка над веб-приложением.

## Требования

- Node.js 18+
- Android Studio (с Android SDK 34+)
- JDK 17

## Первоначальная настройка

```bash
# 1. Установить зависимости
npm install

# 2. Собрать веб-приложение
npm run build

# 3. Инициализировать Capacitor (если android/ ещё нет)
npx cap add android

# 4. Синхронизировать веб-файлы с Android проектом
npx cap sync

# 5. Открыть в Android Studio
npx cap open android
```

Или одной командой:
```bash
npm run android
```

## Структура Android проекта

```
android/
├── app/
│   ├── src/main/
│   │   ├── AndroidManifest.xml    # Разрешения, intent-filters
│   │   ├── java/.../MainActivity  # Точка входа
│   │   └── res/
│   │       ├── drawable/          # Иконки, splash
│   │       ├── values/            # strings.xml, styles.xml
│   │       └── xml/               # network_security_config
│   └── build.gradle
├── capacitor.settings.gradle
└── variables.gradle
```

## Сборка APK

### Debug APK (для тестирования)

```bash
# Из корня проекта
npm run build && npx cap sync
cd android
./gradlew assembleDebug
```

APK будет в: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release APK (для раздачи)

```bash
cd android

# Создать keystore (один раз)
keytool -genkey -v -keystore instep-release.keystore \
  -alias instep -keyalg RSA -keysize 2048 -validity 10000

# Собрать release
./gradlew assembleRelease
```

Для подписи release APK добавить в `android/app/build.gradle`:

```gradle
android {
    signingConfigs {
        release {
            storeFile file('instep-release.keystore')
            storePassword 'YOUR_PASSWORD'
            keyAlias 'instep'
            keyPassword 'YOUR_PASSWORD'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

## Настройка иконки

Заменить файлы в `android/app/src/main/res/`:
- `mipmap-mdpi/ic_launcher.png` — 48x48
- `mipmap-hdpi/ic_launcher.png` — 72x72
- `mipmap-xhdpi/ic_launcher.png` — 96x96
- `mipmap-xxhdpi/ic_launcher.png` — 144x144
- `mipmap-xxxhdpi/ic_launcher.png` — 192x192

Или использовать `@capacitor/assets`:
```bash
npx @capacitor/assets generate --android
```

## Разрешения Android

В `AndroidManifest.xml` добавить:
```xml
<!-- Интернет (уже есть по умолчанию) -->
<uses-permission android:name="android.permission.INTERNET" />

<!-- Для автообновления — установка APK -->
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />

<!-- Wake Lock для таймера -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

## Автообновление

Механизм обновления:

1. Приложение проверяет `version.json` (хостится на GitHub Pages / сервере)
2. Сравнивает `versionCode` с текущим
3. Если есть новая версия — показывает кнопку "Обновить"
4. По нажатию — открывает URL скачивания APK в браузере
5. Пользователь устанавливает скачанный APK

### Обновление version.json при новом релизе

```json
{
  "version": "1.1.0",
  "versionCode": 2,
  "apkUrl": "https://github.com/Nightdamn/instep/releases/download/v1.1.0/instep.apk",
  "releaseNotes": "Описание изменений"
}
```

### Процесс выпуска новой версии

1. Обновить `APP_VERSION` и `APP_VERSION_CODE` в `src/lib/updater.js`
2. Обновить `versionCode` и `versionName` в `android/app/build.gradle`
3. Собрать APK: `npm run build && npx cap sync && cd android && ./gradlew assembleRelease`
4. Создать GitHub Release с APK-файлом
5. Обновить `public/version.json` с новой версией и URL
6. Задеплоить веб-версию: `npm run deploy`

## Live Reload (для разработки)

```bash
# 1. Узнать IP компьютера
ipconfig  # Windows

# 2. Раскомментировать в capacitor.config.ts:
# server: { url: 'http://192.168.0.x:5173', cleartext: true }

# 3. Запустить dev сервер
npm run dev -- --host

# 4. Синхронизировать и запустить
npx cap sync && npx cap run android
```

## Troubleshooting

### Белый экран после запуска
- Убедиться что `npm run build` выполнен перед `cap sync`
- Проверить что `webDir: 'dist'` в `capacitor.config.ts`

### Google OAuth не работает
- Добавить Android SHA-1 fingerprint в Google Cloud Console
- Получить SHA-1: `cd android && ./gradlew signingReport`
- Добавить в Supabase Dashboard → Auth → Google Provider → Android Client ID

### Не устанавливается APK обновления
- Включить "Установка из неизвестных источников" для браузера
- Добавить `REQUEST_INSTALL_PACKAGES` в AndroidManifest.xml
