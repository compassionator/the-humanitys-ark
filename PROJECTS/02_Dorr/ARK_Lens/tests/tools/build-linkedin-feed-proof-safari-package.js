const { buildFeedProofPackage } = require("./linkedin-feed-proof-package");

buildFeedProofPackage({
  manifestSource: "proofs/linkedin_feed/manifests/manifest.safari.json",
  releaseName: "ark-lens-linkedin-feed-extraction-proof-safari-v0.1"
});
