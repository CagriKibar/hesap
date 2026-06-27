const builder = require('electron-builder');
const Platform = builder.Platform;

console.log('Starting compilation with electron-builder...');
builder.build({
  targets: Platform.WINDOWS.createTarget(),
  config: {
    appId: "com.hausmart.satistakip",
    productName: "Hausmart Satis",
    asar: false,
    directories: {
      output: "dist"
    },
    win: {
      target: "nsis",
      icon: "hausmart_icon.ico"
    },
    nsis: {
      oneClick: true,
      allowToChangeInstallationDirectory: false,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: "Hausmart Satis"
    },
    files: [
      "**/*",
      "!dist/*",
      "!satis_hesap.py",
      "!satis_server.py",
      "!setup_client.py",
      "!setup_server.py"
    ]
  }
})
.then((result) => {
  console.log('Build completed successfully! Output files:', result);
})
.catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
