const packageJson = require("../../package.json");
const { buildJobLensPackage } = require("./job-lens-package");

buildJobLensPackage({
  manifestSource: "manifests/manifest.job.safari.json",
  releaseName: `ark-lens-job-search-safari-v${packageJson.version}`,
  releaseChannel: "automated_safari_staging"
});
