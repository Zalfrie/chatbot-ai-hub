import { defineStore } from 'pinia'
import type { Client } from '~/types'

export const useClientStore = defineStore('client', {
  state: () => ({
    clients: [] as Client[],
    selectedClient: null as Client | null,
    loading: false,
    error: null as string | null,
    total: 0,
  }),

  getters: {
    activeClients: (state) => state.clients.filter((c) => c.isActive),
    getClientById: (state) => (id: number) => state.clients.find((c) => c.id === id),
  },

  actions: {
    setClients(clients: Client[], total?: number) {
      this.clients = clients
      this.total = total ?? clients.length
    },

    setSelectedClient(client: Client | null) {
      this.selectedClient = client
    },

    addClient(client: Client) {
      this.clients.unshift(client)
      this.total += 1
    },

    updateClient(updated: Client) {
      const idx = this.clients.findIndex((c) => c.id === updated.id)
      if (idx !== -1) {
        this.clients[idx] = updated
      }
      if (this.selectedClient?.id === updated.id) {
        this.selectedClient = updated
      }
    },

    removeClient(id: number) {
      this.clients = this.clients.filter((c) => c.id !== id)
      this.total = Math.max(0, this.total - 1)
      if (this.selectedClient?.id === id) {
        this.selectedClient = null
      }
    },

    clearClients() {
      this.clients = []
      this.selectedClient = null
      this.total = 0
      this.error = null
    },
  },
})
