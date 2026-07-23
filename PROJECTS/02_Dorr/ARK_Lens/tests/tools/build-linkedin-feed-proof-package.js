const { buildFeedProofPackage } = require("./linkedin-feed-proof-package");

buildFeedProofPackage({
  manifestSource: "proofs/linkedin_feed/manifest.json",
  releaseName: "ark-lens-linkedin-feed-extraction-proof-v0.1"
});
