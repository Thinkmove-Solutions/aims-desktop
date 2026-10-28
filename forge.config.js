module.exports = {
  packagerConfig: {
    asar: true,
    name: 'AIMS',
    executableName: 'aims',
    icon: './assets/icon',
    appBundleId: 'com.thinkmove.aims-desktop',
    appCategoryType: 'public.app-category.business',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'aims',
        setupExe: 'aims-Setup.exe',
        setupIcon: './assets/icon.ico',
        // Squirrel auto-update: point at GitHub releases
        remoteReleases: 'https://github.com/thinkmovesolutions/aims-desktop',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
        name: 'AIMS',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'Thinkmove Solutions',
          homepage: 'https://app.aaimsoft.com',
          description: 'AIMS local desktop agent for print and native OS integration',
        },
      },
    },
  ],
};
