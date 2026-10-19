import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENVELOPE_PREFIX = "enc:v1:";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptionKey() {
  const encodedKey = process.env.MESSAGE_ENCRYPTION_KEY;
  if (!encodedKey) {
    throw new Error("MESSAGE_ENCRYPTION_KEY must be configured to access citizen messages.");
  }

  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error("MESSAGE_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function assertEncryptionKey() {
  encryptionKey();
}

export function isEncryptedText(value) {
  return value.startsWith(ENVELOPE_PREFIX);
}

export function encryptText(plaintext) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${ENVELOPE_PREFIX}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptText(envelope) {
  if (envelope === "") return "";
  if (!isEncryptedText(envelope)) {
    throw new Error("Unencrypted citizen message data found; run the citizen data encryption command.");
  }

  const [encodedIv, encodedAuthTag, encodedCiphertext, ...extra] = envelope.slice(ENVELOPE_PREFIX.length).split(".");
  if (!encodedIv || !encodedAuthTag || !encodedCiphertext || extra.length) {
    throw new Error("Citizen message ciphertext has an invalid format.");
  }

  const iv = Buffer.from(encodedIv, "base64url");
  const authTag = Buffer.from(encodedAuthTag, "base64url");
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Citizen message ciphertext has invalid encryption parameters.");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptBytes(plaintext) {
  return Buffer.from(encryptText(plaintext.toString("base64")), "utf8");
}

export function decryptBytes(envelope) {
  return Buffer.from(decryptText(envelope.toString("utf8")), "base64");
}
