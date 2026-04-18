import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.healthwalk.app',
  appName: 'HealthWalk',
  webDir: 'dist',
  server: {
    // In production, the app loads from bundled files
    // For dev, uncomment to use live reload:
    // url: 'http://192.168.0.x:5173',
    // cleartext: true,
    androidScheme: 'https',
  },
  plugins: {
    App: {
      // Allow install from unknown sources for auto-update
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#ffffff',
  },
};

export default config;
