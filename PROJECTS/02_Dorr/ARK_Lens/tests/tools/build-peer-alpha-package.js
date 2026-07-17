const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const releaseName = `ark-lens-v${packageJson.version}-peer-alpha`;
const distRoot = path.join(root, "dist");
const releaseDir = path.join(distRoot, releaseName);
const zipPath = path.join(distRoot, `${releaseName}.zip`);
const zipHashPath = `${zipPath}.sha256.txt`;
const RELEASE_ENTRIES = [
  "manifest.json",
  "background.js",
  "content_bundle.js",
  "popup",
  "report",
  "lens-editor",
  "lens-packs",
  "schemas",
  "icons",
  "alpha",
  "peer-alpha"
];
// Development data such as tests/fixtures, .git, raw captures, downloads, and dist must not be packaged.
const FORBIDDEN_PACKAGE_PATHS = [
  "tests/fixtures",
  "tests",
  ".git",
  ".agents",
  ".codex",
  "dist"
];

function assertReleaseTarget() {
  const relative = path.relative(distRoot, releaseDir);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Unsafe peer-alpha release target.");
  }
  if (packageJson.version !== manifest.version) {
    throw new Error(`Package version ${packageJson.version} does not match manifest ${manifest.version}.`);
  }
  if (!/^2026\.6\.\d+$/.test(packageJson.version)) {
    throw new Error(`Unexpected release version ${packageJson.version}.`);
  }
}

function copyEntry(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(releaseDir, relativePath);
  const stat = fs.statSync(source);

  if (stat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    fs.readdirSync(source, { withFileTypes: true }).forEach((entry) => {
      copyEntry(path.join(relativePath, entry.name));
    });
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function listFiles(directory) {
  const output = [];

  function visit(current) {
    fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((entry) => {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) visit(fullPath);
        else output.push(fullPath);
      });
  }

  visit(directory);
  return output;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function createZip(files, targetPath) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((filePath) => {
    const relative = path.relative(releaseDir, filePath).replace(/\\/g, "/");
    const archiveName = `${releaseName}/${relative}`;
    const name = Buffer.from(archiveName, "utf8");
    const data = fs.readFileSync(filePath);
    const checksum = crc32(data);
    const { time, date } = dosDateTime(fs.statSync(filePath).mtime);
    const local = Buffer.alloc(30);

    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + data.length;
  });

  const localData = Buffer.concat(localParts);
  const centralData = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(localData.length, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(targetPath, Buffer.concat([localData, centralData, end]));
}

function verifyPackageFiles(files) {
  const relativeFiles = files.map((filePath) =>
    path.relative(releaseDir, filePath).replace(/\\/g, "/")
  );

  FORBIDDEN_PACKAGE_PATHS.forEach((forbidden) => {
    if (relativeFiles.some((filePath) => filePath === forbidden || filePath.startsWith(`${forbidden}/`))) {
      throw new Error(`Forbidden release content detected: ${forbidden}`);
    }
  });

  [
    "manifest.json",
    "icons/ark-lens-16.png",
    "icons/ark-lens-active-16.png",
    "alpha/guide.html",
    "peer-alpha/TESTER_GUIDE.md",
    "peer-alpha/PRIVACY.md"
  ].forEach((required) => {
    if (!relativeFiles.includes(required)) throw new Error(`Release is missing ${required}.`);
  });
}

assertReleaseTarget();
fs.mkdirSync(distRoot, { recursive: true });
fs.rmSync(releaseDir, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.rmSync(zipHashPath, { force: true });
fs.mkdirSync(releaseDir, { recursive: true });
RELEASE_ENTRIES.forEach(copyEntry);

const initialFiles = listFiles(releaseDir);
const buildInfo = {
  schema_version: "1.0.0",
  release_name: releaseName,
  release_channel: "controlled_peer_alpha",
  extension_version: manifest.version,
  generated_at: new Date().toISOString(),
  packaged_file_count: initialFiles.length + 2,
  release_gate: "npm.cmd test"
};
fs.writeFileSync(
  path.join(releaseDir, "BUILD_INFO.json"),
  `${JSON.stringify(buildInfo, null, 2)}\n`
);

const checksumFiles = listFiles(releaseDir);
const checksumLines = checksumFiles.map((filePath) => {
  const relative = path.relative(releaseDir, filePath).replace(/\\/g, "/");
  return `${sha256(filePath)}  ${relative}`;
});
fs.writeFileSync(path.join(releaseDir, "SHA256SUMS.txt"), `${checksumLines.join("\n")}\n`);

const releaseFiles = listFiles(releaseDir);
verifyPackageFiles(releaseFiles);
createZip(releaseFiles, zipPath);
const zipHash = sha256(zipPath);
fs.writeFileSync(zipHashPath, `${zipHash}  ${path.basename(zipPath)}\n`);

console.log(`Built ${path.relative(root, releaseDir)}`);
console.log(`Built ${path.relative(root, zipPath)}`);
console.log(`ZIP SHA-256 ${zipHash}`);
