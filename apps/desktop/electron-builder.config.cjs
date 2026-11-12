// Windows packaging. Signing: set CSC_LINK / CSC_KEY_PASSWORD (CI secrets WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD).
// Auto-update trust: set WIN_PUBLISHER_NAME to the certificate subject CN so installed apps only accept updates signed by it.
const win = { target: ["nsis", "portable"], icon: "build/icon.png", artifactName: "ShikkhaOS-${version}.${ext}" };
if (process.env.WIN_PUBLISHER_NAME) win.publisherName = [process.env.WIN_PUBLISHER_NAME];
module.exports = {
  appId: "app.shikkhaos.desktop",
  productName: "ShikkhaOS",
  directories: { output: "release", buildResources: "build" },
  files: ["dist/**", "package.json"],
  asar: true,
  win,
  nsis: { oneClick: true, perMachine: false, deleteAppDataOnUninstall: false, artifactName: "ShikkhaOS-Setup-${version}.${ext}", shortcutName: "ShikkhaOS" },
  portable: { artifactName: "ShikkhaOS-Portable-${version}.${ext}" },
  publish: [{ provider: "github", owner: "petrait7s", repo: "ShikkhaOS", releaseType: "release" }],
  generateUpdatesFilesForAllChannels: false,
};
