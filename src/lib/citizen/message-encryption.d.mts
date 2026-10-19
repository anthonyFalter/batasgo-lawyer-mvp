export function assertEncryptionKey(): void;
export function isEncryptedText(value: string): boolean;
export function encryptText(plaintext: string): string;
export function decryptText(envelope: string): string;
export function encryptBytes(plaintext: Buffer): Buffer;
export function decryptBytes(envelope: Buffer): Buffer;
