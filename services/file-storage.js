const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { uploadDirectory } = require("../middleware/upload");

const S3_PREFIX = "s3:";
let s3Client;

function getS3Configuration() {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const endpoint = process.env.S3_ENDPOINT;
  const enabled = Boolean(bucket || endpoint || accessKeyId || secretAccessKey);
  if (!enabled) return null;
  if (!bucket || !region) throw new Error("S3_BUCKET and S3_REGION are required when object storage is configured.");
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) throw new Error("Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither to use the AWS role.");
  if (endpoint && (!accessKeyId || !secretAccessKey)) throw new Error("S3-compatible endpoints require explicit S3 credentials.");
  return { bucket, region, accessKeyId, secretAccessKey, endpoint };
}

function getS3Client(configuration) {
  if (!s3Client) {
    s3Client = new S3Client({
      region: configuration.region,
      endpoint: configuration.endpoint || undefined,
      forcePathStyle: Boolean(configuration.endpoint) || process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: configuration.accessKeyId
        ? { accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey }
        : undefined,
    });
  }
  return s3Client;
}

function validateStorageConfiguration() {
  getS3Configuration();
}

function objectKey(storedName) {
  return storedName.slice(S3_PREFIX.length);
}

async function persistUpload(file) {
  const configuration = getS3Configuration();
  if (!configuration) return file.filename;
  const prefix = (process.env.S3_KEY_PREFIX || "private-uploads/").replace(/^\/+|\/+$/g, "");
  const key = `${prefix ? `${prefix}/` : ""}${path.basename(file.filename)}`;
  await getS3Client(configuration).send(new PutObjectCommand({
    Bucket: configuration.bucket,
    Key: key,
    Body: fs.createReadStream(file.path),
    ContentType: file.mimetype,
  }));
  file.storageKey = `${S3_PREFIX}${key}`;
  await fsp.unlink(file.path);
  return file.storageKey;
}

async function removeStoredFile(storedName) {
  if (storedName.startsWith(S3_PREFIX)) {
    const configuration = getS3Configuration();
    if (!configuration) throw new Error("Object storage must be configured to delete this stored file.");
    await getS3Client(configuration).send(new DeleteObjectCommand({
      Bucket: configuration.bucket,
      Key: objectKey(storedName),
    }));
    return;
  }
  await fsp.unlink(path.join(uploadDirectory, path.basename(storedName)));
}

async function discardUpload(file) {
  if (file.storageCleaned) return;
  if (file.storageKey) {
    await removeStoredFile(file.storageKey);
    file.storageCleaned = true;
    return;
  }
  if (file.path) await fsp.unlink(file.path);
  file.storageCleaned = true;
}

async function openStoredFile(storedName) {
  if (storedName.startsWith(S3_PREFIX)) {
    const configuration = getS3Configuration();
    if (!configuration) throw new Error("Object storage must be configured to retrieve this stored file.");
    const result = await getS3Client(configuration).send(new GetObjectCommand({
      Bucket: configuration.bucket,
      Key: objectKey(storedName),
    }));
    return result.Body;
  }
  return fs.createReadStream(path.join(uploadDirectory, path.basename(storedName)));
}

module.exports = { discardUpload, openStoredFile, persistUpload, removeStoredFile, validateStorageConfiguration };
