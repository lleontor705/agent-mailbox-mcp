import { describe, it, expect, afterEach } from "vitest";
import { encrypt, decrypt, isEncryptionEnabled } from "../../src/crypto/encryption.js";

describe("Encryption", () => {
  afterEach(() => {
    delete process.env.MAILBOX_ENCRYPTION_KEY;
  });

  it("passes through when no key is set", () => {
    delete process.env.MAILBOX_ENCRYPTION_KEY;
    const text = "Hello, world!";
    expect(encrypt(text)).toBe(text);
    expect(decrypt(text)).toBe(text);
  });

  it("reports encryption disabled when no key", () => {
    delete process.env.MAILBOX_ENCRYPTION_KEY;
    expect(isEncryptionEnabled()).toBe(false);
  });

  it("encrypts and decrypts correctly", () => {
    process.env.MAILBOX_ENCRYPTION_KEY = "test-key-for-encryption-testing";
    const text = "Secret message content";
    const encrypted = encrypt(text);

    expect(encrypted).not.toBe(text);
    expect(encrypted.startsWith("enc:")).toBe(true);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  it("reports encryption enabled when key is set", () => {
    process.env.MAILBOX_ENCRYPTION_KEY = "my-key";
    expect(isEncryptionEnabled()).toBe(true);
  });

  it("produces different ciphertexts for same plaintext (random IV)", () => {
    process.env.MAILBOX_ENCRYPTION_KEY = "test-key-123";
    const text = "Same input";
    const enc1 = encrypt(text);
    const enc2 = encrypt(text);
    expect(enc1).not.toBe(enc2); // Different IVs
    expect(decrypt(enc1)).toBe(text);
    expect(decrypt(enc2)).toBe(text);
  });

  it("handles non-encrypted data gracefully in decrypt", () => {
    process.env.MAILBOX_ENCRYPTION_KEY = "test-key";
    const plain = "Not encrypted at all";
    expect(decrypt(plain)).toBe(plain); // Pass-through
  });

  it("handles empty strings", () => {
    process.env.MAILBOX_ENCRYPTION_KEY = "test-key";
    const encrypted = encrypt("");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe("");
  });
});
