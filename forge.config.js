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
        setupExe: 'AIMS-Setup.exe',
        setupIcon: './assets/icon.ico',
        shortcutName: 'AIMS',
        description: 'AIMS — Point of Sale & Restaurant Management',
        // Creates Desktop + Start Menu shortcuts on install; removes on uninstall
        // (handled by electron-squirrel-startup in main.js)
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
          homepage: 'https://aaimsoft.com',
          description: 'AIMS local desktop agent for print and native OS integration',
        },
      },
    },
  ],
};
