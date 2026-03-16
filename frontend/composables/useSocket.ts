import { io, type Socket } from 'socket.io-client'
import { ref, onUnmounted } from 'vue'

let globalSocket: Socket | null = null

export function useSocket() {
  const config = useRuntimeConfig()
  const authStore = useAuthStore()
  const wsUrl = config.public.wsUrl as string

  const isConnected = ref(false)
  const error = ref<string | null>(null)

  function getSocket(): Socket {
    // Socket.io client can only run in the browser, not during SSR
    if (!import.meta.client) {
      // Return a no-op stub during SSR to prevent crashes
      return { emit: () => {}, on: () => {}, connected: false } as unknown as Socket
    }

    if (!globalSocket || !globalSocket.connected) {
      globalSocket = io(wsUrl, {
        auth: {
          token: authStore.accessToken,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      })

      globalSocket.on('connect', () => {
        isConnected.value = true
        error.value = null
      })

      globalSocket.on('disconnect', () => {
        isConnected.value = false
      })

      globalSocket.on('connect_error', (err) => {
        error.value = err.message
        isConnected.value = false
      })
    }

    return globalSocket
  }

  function subscribeToWa(clientId: number | string) {
    const socket = getSocket()
    socket.emit('subscribe:wa', clientId)
    return socket
  }

  function unsubscribeFromWa(clientId: number | string) {
    if (globalSocket?.connected) {
      globalSocket.emit('unsubscribe:wa', clientId)
    }
  }

  function disconnect() {
    if (globalSocket) {
      globalSocket.disconnect()
      globalSocket = null
      isConnected.value = false
    }
  }

  onUnmounted(() => {
    // Don't disconnect global socket on component unmount
    // Let pages manage subscription/unsubscription
  })

  return {
    isConnected,
    error,
    getSocket,
    subscribeToWa,
    unsubscribeFromWa,
    disconnect,
  }
}
