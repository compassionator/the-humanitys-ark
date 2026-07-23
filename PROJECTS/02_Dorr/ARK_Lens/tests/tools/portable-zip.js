const fs = require("node:fs");
const path = require("node:path");

const LOCAL_FILE_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;

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

function createZip({ files, baseDir, rootName, targetPath }) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((filePath) => {
    const relative = path.relative(baseDir, filePath).replace(/\\/g, "/");
    if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
      throw new Error(`ZIP entry is outside the release directory: ${filePath}`);
    }

    const archiveName = `${rootName}/${relative}`;
    const name = Buffer.from(archiveName, "utf8");
    const data = fs.readFileSync(filePath);
    const checksum = crc32(data);
    const { time, date } = dosDateTime(fs.statSync(filePath).mtime);
    const local = Buffer.alloc(30);

    local.writeUInt32LE(LOCAL_FILE_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(STORE_METHOD, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(STORE_METHOD, 10);
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
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(localData.length, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(targetPath, Buffer.concat([localData, centralData, end]));
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) return offset;
  }
  throw new Error("ZIP end-of-central-directory record is missing.");
}

function inspectZip(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== LOCAL_FILE_SIGNATURE) {
    throw new Error("ZIP local-file signature is missing.");
  }

  const endOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDisk = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  const commentLength = buffer.readUInt16LE(endOffset + 20);

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error("Multi-disk ZIP archives are not supported.");
  }
  if (endOffset + 22 + commentLength !== buffer.length) {
    throw new Error("ZIP end record length is invalid.");
  }
  if (centralOffset + centralSize !== endOffset) {
    throw new Error("ZIP central-directory bounds are invalid.");
  }

  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error(`ZIP central-directory entry ${index} is invalid.`);
    }

    const method = buffer.readUInt16LE(cursor + 10);
    const checksum = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const entryCommentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    const name = buffer.toString("utf8", nameStart, nameEnd);

    if (method !== STORE_METHOD || compressedSize !== uncompressedSize) {
      throw new Error(`ZIP entry must use the portable store method: ${name}`);
    }
    if (buffer.readUInt32LE(localOffset) !== LOCAL_FILE_SIGNATURE) {
      throw new Error(`ZIP local-file entry is missing: ${name}`);
    }

    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const localName = buffer.toString("utf8", localNameStart, localNameEnd);
    const dataStart = localNameEnd + localExtraLength;
    const dataEnd = dataStart + compressedSize;

    if (localMethod !== method || localName !== name || dataEnd > centralOffset) {
      throw new Error(`ZIP local-file metadata is invalid: ${name}`);
    }

    const data = buffer.subarray(dataStart, dataEnd);
    if (crc32(data) !== checksum) {
      throw new Error(`ZIP entry checksum is invalid: ${name}`);
    }

    entries.push(Object.freeze({ name, data, checksum, compressedSize, uncompressedSize }));
    cursor = nameEnd + extraLength + entryCommentLength;
  }

  if (cursor !== endOffset) throw new Error("ZIP central-directory size does not match its entries.");

  return Object.freeze({
    entries: Object.freeze(entries),
    entryCount,
    centralDirectoryOffset: centralOffset,
    centralDirectorySize: centralSize,
    endOfCentralDirectoryOffset: endOffset
  });
}

module.exports = Object.freeze({
  CENTRAL_DIRECTORY_SIGNATURE,
  END_OF_CENTRAL_DIRECTORY_SIGNATURE,
  LOCAL_FILE_SIGNATURE,
  createZip,
  inspectZip
});
