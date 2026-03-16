export interface Client {
  id: number
  name: string
  email: string
  phone: string | null
  apiKey: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Chatbot {
  id: number
  clientId: number
  name: string
  persona: string
  instructions: string
  aiModel: string // 'groq' | 'claude'
  temperature: number
  maxTokens: number
  isActive: boolean
}

export interface KnowledgeBase {
  id: number
  clientId: number
  title: string
  content: string
  category: string | null
  isActive: boolean
  createdAt: string
}

export interface WaStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
  waNumber: string | null
  connectedAt: string | null
}

export interface Conversation {
  id: number
  clientId: number
  waNumber: string | null
  sessionId: string | null
  channel: 'whatsapp' | 'web'
  createdAt: string
  lastMessageAt: string
  messageCount: number
}

export interface Message {
  id: number
  conversationId: number
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface AnalyticsData {
  totalMessages: number
  totalConversations: number
  avgResponseTime: number
  dailyStats: { date: string; messages: number; conversations: number }[]
}

export interface DashboardStats {
  totalClients: number
  totalMessages: number
  activeWaSessions: number
  totalConversations: number
}

export interface AuthUser {
  id: number
  email: string
  name: string
  role: 'superadmin' | 'admin'
  clientId: number | null
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

export interface ApiError {
  message: string
  statusCode: number
  errors?: Record<string, string[]>
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}
