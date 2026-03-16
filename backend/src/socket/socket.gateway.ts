import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';

let io: SocketIOServer | null = null;

export function initSocketGateway(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*', // Restrict to dashboard origin in production
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket.io] Connected: ${socket.id}`);

    // Dashboard subscribes to WA events for a specific client
    socket.on('subscribe:wa', (clientId: number) => {
      const room = `wa:${clientId}`;
      socket.join(room);
      console.log(`[Socket.io] ${socket.id} joined room ${room}`);
    });

    socket.on('unsubscribe:wa', (clientId: number) => {
      socket.leave(`wa:${clientId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] Disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.io gateway not initialized');
  return io;
}

/**
 * Emit an event to all dashboard clients subscribed to a specific WA client room.
 * Events:
 *   wa:qr        — { clientId, qr: base64DataUrl }
 *   wa:connected — { clientId, waNumber }
 *   wa:disconnected — { clientId, reason }
 *   wa:status    — { clientId, status }
 */
export function emitToClient(clientId: number, event: string, data: unknown): void {
  if (!io) return;
  io.to(`wa:${clientId}`).emit(event, data);
}
