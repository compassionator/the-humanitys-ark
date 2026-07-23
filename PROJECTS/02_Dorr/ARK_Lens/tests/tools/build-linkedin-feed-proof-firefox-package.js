const { buildFeedProofPackage } = require("./linkedin-feed-proof-package");

buildFeedProofPackage({
  manifestSource: "proofs/linkedin_feed/manifests/manifest.firefox.json",
  releaseName: "ark-lens-linkedin-feed-extraction-proof-firefox-v0.1"
});
