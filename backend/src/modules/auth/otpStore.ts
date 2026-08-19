export interface OtpRecord {
  code: string;
  /** Epoch ms after which the code is no longer valid. */
  expiresAt: number;
  /** Failed verification attempts so far (for lockout). */
  attempts: number;
  /** How many codes have been sent in the current window (for resend caps). */
  sendCount: number;
  /** Epoch ms of the last send (for resend cooldown). */
  lastSentAt: number;
}

/**
 * Storage abstraction for password-reset OTPs. The local implementation is an
 * in-memory Map; production can swap in Redis/etc. without touching the service.
 */
export interface OtpStore {
  get(key: string): Promise<OtpRecord | undefined>;
  set(key: string, record: OtpRecord): Promise<void>;
  delete(key: string): Promise<void>;
}

class InMemoryOtpStore implements OtpStore {
  private readonly store = new Map<string, OtpRecord>();

  async get(key: string): Promise<OtpRecord | undefined> {
    return this.store.get(key);
  }

  async set(key: string, record: OtpRecord): Promise<void> {
    this.store.set(key, record);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export const otpStore: OtpStore = new InMemoryOtpStore();
