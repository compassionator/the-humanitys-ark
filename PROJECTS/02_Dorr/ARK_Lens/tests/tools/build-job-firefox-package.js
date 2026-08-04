const packageJson = require("../../package.json");
const { buildJobLensPackage } = require("./job-lens-package");

buildJobLensPackage({
  manifestSource: "manifests/manifest.job.firefox.json",
  releaseName: `ark-lens-job-search-firefox-v${packageJson.version}`,
  releaseChannel: "automated_firefox_staging"
});
