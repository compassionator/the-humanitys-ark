const path = require("node:path");
const packageJson = require("../../package.json");
const { buildJobLensPackage } = require("./job-lens-package");

buildJobLensPackage({
  manifestSource: "manifest.json",
  releaseName: `ark-lens-v${packageJson.version}-peer-alpha`,
  releaseChannel: "controlled_peer_alpha"
});
