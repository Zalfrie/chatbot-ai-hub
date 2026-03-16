import type {
  WASocket,
  AuthenticationCreds,
  SignalDataSet,
  SignalDataTypeMap,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { WaSessionRepository, waSessionRepository } from './wa.session.repository';
import { emitToClient } from '../../socket/socket.gateway';
import { encrypt, decrypt } from '../../utils/crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MessageHandler = (
  clientId: number,
  messages: unknown[],
  socket: WASocket,
) => Promise<void>;

interface ActiveSession {
  socket: WASocket;
  clientId: number;
}

// ---------------------------------------------------------------------------
// WhatsApp Service
// ---------------------------------------------------------------------------

export class WhatsAppService {
  private sessions = new Map<number, ActiveSession>();
  private reconnectTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private messageHandler?: MessageHandler;

  constructor(private readonly repo: WaSessionRepository) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Register the incoming-message handler (called from index.ts at startup) */
  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /** Initiate a new WA connection (generates QR code via Socket.io) */
  async connect(clientId: number): Promise<void> {
    if (this.sessions.has(clientId)) {
      emitToClient(clientId, 'wa:status', { clientId, status: 'connected' });
      return;
    }

    // Ensure a wa_sessions row exists
    await this.repo.upsert(clientId);
    await this.repo.updateStatus(clientId, 'connecting');
    emitToClient(clientId, 'wa:status', { clientId, status: 'connecting' });

    await this.createSocket(clientId);
  }

  /** Disconnect and clear session data */
  async disconnect(clientId: number): Promise<void> {
    this.clearReconnectTimer(clientId);

    const session = this.sessions.get(clientId);
    if (session) {
      try {
        await session.socket.logout();
      } catch {
        // Ignore errors during logout (socket might already be closed)
        session.socket.end(undefined);
      }
      this.sessions.delete(clientId);
    }

    await this.repo.updateStatus(clientId, 'disconnected', {
      disconnectedAt: new Date(),
    });
    await this.repo.saveSessionData(clientId, '');

    emitToClient(clientId, 'wa:disconnected', { clientId, reason: 'manual' });
  }

  /** Get current WA connection status for a client */
  async getStatus(clientId: number) {
    const row = await this.repo.findByClientId(clientId);
    return {
      status: row?.status ?? 'disconnected',
      waNumber: row?.waNumber ?? null,
      connectedAt: row?.connectedAt ?? null,
      isSocketActive: this.sessions.has(clientId),
    };
  }

  /** Returns active Baileys socket for a client (used by message handler) */
  getSocket(clientId: number): WASocket | null {
    return this.sessions.get(clientId)?.socket ?? null;
  }

  /** Restore previously-connected sessions after server restart */
  async restoreActiveSessions(): Promise<void> {
    const rows = await this.repo.findAllConnected();
    if (rows.length === 0) return;

    console.log(`[WA] Restoring ${rows.length} active session(s)...`);
    for (const row of rows) {
      try {
        await this.createSocket(row.clientId);
        console.log(`[WA:${row.clientId}] Restore initiated`);
      } catch (err) {
        console.error(`[WA:${row.clientId}] Restore failed:`, err);
      }
    }
  }

  // ─── Socket lifecycle ─────────────────────────────────────────────────────

  private async createSocket(clientId: number): Promise<void> {
    // Dynamic import of Baileys (ESM package — tsx handles CJS/ESM interop)
    const {
      default: makeWASocket,
      DisconnectReason,
      fetchLatestBaileysVersion,
    } = await import('@whiskeysockets/baileys');

    const { Boom } = await import('@hapi/boom');

    const authState = await this.loadAuthState(clientId);
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: authState,
      printQRInTerminal: true,
      // Suppress unnecessary media/store features
      getMessage: async () => undefined,
    });

    // ── QR + connection events ────────────────────────────────────────────
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrBase64 = await QRCode.toDataURL(qr);
          emitToClient(clientId, 'wa:qr', { clientId, qr: qrBase64 });
          console.log(`[WA:${clientId}] QR ready — scan to connect`);
        } catch (err) {
          console.error(`[WA:${clientId}] QR generation failed:`, err);
        }
      }

      if (connection === 'open') {
        const waNumber = socket.user?.id?.split(':')[0] ?? '';
        console.log(`[WA:${clientId}] Connected as ${waNumber}`);
        this.sessions.set(clientId, { socket, clientId });
        this.clearReconnectTimer(clientId);

        await this.repo.updateStatus(clientId, 'connected', {
          waNumber,
          connectedAt: new Date(),
        });
        emitToClient(clientId, 'wa:connected', { clientId, waNumber });
      }

      if (connection === 'close') {
        this.sessions.delete(clientId);
        const statusCode = (lastDisconnect?.error as InstanceType<typeof Boom>)?.output?.statusCode;
        console.log(`[WA:${clientId}] Disconnected — code: ${statusCode}`);

        if (statusCode === DisconnectReason.loggedOut) {
          await this.repo.updateStatus(clientId, 'disconnected', { disconnectedAt: new Date() });
          await this.repo.saveSessionData(clientId, '');
          emitToClient(clientId, 'wa:disconnected', { clientId, reason: 'logged_out' });
        } else if (statusCode === DisconnectReason.forbidden) {
          await this.repo.updateStatus(clientId, 'banned', { disconnectedAt: new Date() });
          emitToClient(clientId, 'wa:disconnected', { clientId, reason: 'banned' });
        } else {
          // Network error or restart — reconnect
          await this.repo.updateStatus(clientId, 'connecting');
          emitToClient(clientId, 'wa:status', { clientId, status: 'reconnecting' });
          this.scheduleReconnect(clientId);
        }
      }
    });

    // ── Persist updated credentials ───────────────────────────────────────
    socket.ev.on('creds.update', () => authState.saveCreds());

    // ── Route incoming messages to ChatService ────────────────────────────
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' || !this.messageHandler) return;
      await this.messageHandler(clientId, messages, socket);
    });

    this.sessions.set(clientId, { socket, clientId });
  }

  // ─── DB-backed auth state ─────────────────────────────────────────────────

  private async loadAuthState(clientId: number) {
    const { initAuthCreds, BufferJSON, proto } = await import('@whiskeysockets/baileys');

    const row = await this.repo.findByClientId(clientId);
    let creds: AuthenticationCreds;
    const keyStore: Record<string, unknown> = {};

    if (row?.sessionData) {
      try {
        const plaintext = decrypt(row.sessionData);
        const parsed = JSON.parse(plaintext, BufferJSON.reviver) as {
          creds: AuthenticationCreds;
          keys: Record<string, unknown>;
        };
        creds = parsed.creds;
        Object.assign(keyStore, parsed.keys ?? {});
      } catch {
        console.warn(`[WA:${clientId}] Session data corrupted — starting fresh`);
        creds = initAuthCreds();
      }
    } else {
      creds = initAuthCreds();
    }

    const persist = async () => {
      const plaintext = JSON.stringify({ creds, keys: keyStore }, BufferJSON.replacer);
      const encrypted = encrypt(plaintext);
      await this.repo.saveSessionData(clientId, encrypted);
    };

    const keys = {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const result: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          let value = keyStore[`${type}-${id}`];
          if (value !== undefined) {
            // app-state-sync-key must be deserialized back to protobuf
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
            }
            result[id] = value as SignalDataTypeMap[T];
          }
        }
        return result;
      },
      set: async (data: SignalDataSet) => {
        for (const [category, entries] of Object.entries(data)) {
          for (const [id, value] of Object.entries(entries as Record<string, unknown>)) {
            if (value !== null && value !== undefined) {
              keyStore[`${category}-${id}`] = value;
            } else {
              delete keyStore[`${category}-${id}`];
            }
          }
        }
        await persist();
      },
    };

    return {
      creds,
      keys,
      saveCreds: persist,
    };
  }

  // ─── Reconnect helpers ────────────────────────────────────────────────────

  private scheduleReconnect(clientId: number, delayMs = 5_000): void {
    this.clearReconnectTimer(clientId);
    const timer = setTimeout(async () => {
      console.log(`[WA:${clientId}] Reconnecting...`);
      try {
        await this.createSocket(clientId);
      } catch (err) {
        console.error(`[WA:${clientId}] Reconnect failed:`, err);
        // Exponential back-off capped at 60 s
        this.scheduleReconnect(clientId, Math.min(delayMs * 2, 60_000));
      }
    }, delayMs);
    this.reconnectTimers.set(clientId, timer);
  }

  private clearReconnectTimer(clientId: number): void {
    const timer = this.reconnectTimers.get(clientId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(clientId);
    }
  }
}

export const whatsAppService = new WhatsAppService(waSessionRepository);
