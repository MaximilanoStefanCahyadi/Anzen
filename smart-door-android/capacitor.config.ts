import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smartdoor.admin',
  appName: 'Smart Door Admin',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
