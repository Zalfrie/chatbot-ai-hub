/**
 * ChatbotHub Embed Widget
 * Vanilla TypeScript — zero runtime dependencies
 *
 * Usage on UMKM website:
 *   <script>
 *     window.ChatbotHubConfig = {
 *       apiKey: 'ck_xxxxxxxxxxxxx',
 *       position: 'bottom-right',
 *       primaryColor: '#25D366',
 *       welcomeText: 'Halo! Ada yang bisa kami bantu?',
 *       botName: 'AI Assistant',
 *     };
 *   </script>
 *   <script src="https://hub.domain.com/widget.js" async></script>
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // Types
  // ─────────────────────────────────────────────────────────────────────────────

  interface ChatbotHubConfig {
    apiKey: string;
    position?: 'bottom-right' | 'bottom-left';
    primaryColor?: string;
    welcomeText?: string;
    botName?: string;
    /** Override API base URL (auto-detected from script src by default) */
    baseUrl?: string;
  }

  interface SendMessageResponse {
    session_id: string;
    reply: string;
    timestamp?: string;
  }

  interface HistoryMessage {
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
  }

  interface HistoryResponse {
    messages: HistoryMessage[];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Config & Constants
  // ─────────────────────────────────────────────────────────────────────────────

  const win = window as Window &
    typeof globalThis & { ChatbotHubConfig?: ChatbotHubConfig };
  const config: ChatbotHubConfig = win.ChatbotHubConfig ?? ({} as ChatbotHubConfig);

  if (!config.apiKey) {
    console.error('[ChatbotHub] window.ChatbotHubConfig.apiKey is required.');
    return;
  }

  const PRIMARY   = config.primaryColor ?? '#25D366';
  const POSITION  = config.position ?? 'bottom-right';
  const BOT_NAME  = config.botName ?? 'AI Assistant';
  const WELCOME   = config.welcomeText ?? 'Halo! Ada yang bisa kami bantu? 👋';

  // Auto-detect base URL from the <script src="..."> tag
  const scriptEl = document.currentScript as HTMLScriptElement | null;
  const BASE_URL  = config.baseUrl?.replace(/\/$/, '')
    ?? (scriptEl ? new URL(scriptEl.src).origin : window.location.origin);

  // ─────────────────────────────────────────────────────────────────────────────
  // Session (localStorage)
  // ─────────────────────────────────────────────────────────────────────────────

  // Key scoped to API key so multiple widgets on the same domain don't clash
  const STORAGE_KEY = `chub_session_${config.apiKey.slice(-10)}`;

  function getOrCreateSessionId(): string {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  function generateUUID(): string {
    // Crypto-random UUID v4
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────────────────

  let sessionId  = getOrCreateSessionId();
  let isOpen     = false;
  let isLoading  = false;
  let historyLoaded = false;
  let unreadCount = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // SVG Icons
  // ─────────────────────────────────────────────────────────────────────────────

  const ICON_CHAT = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
  </svg>`;

  const ICON_CLOSE = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>`;

  const ICON_SEND = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
  </svg>`;

  const ICON_BOT = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zm-2 10H6V7h12v12zm-9-6c-.83 0-1.5-.67-1.5-1.5S8.17 10 9 10s1.5.67 1.5 1.5S9.83 13 9 13zm6 0c-.83 0-1.5-.67-1.5-1.5S14.17 10 15 10s1.5.67 1.5 1.5S15.83 13 15 13z"/>
  </svg>`;

  const ICON_REFRESH = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
  </svg>`;

  // ─────────────────────────────────────────────────────────────────────────────
  // CSS
  // ─────────────────────────────────────────────────────────────────────────────

  function buildCSS(): string {
    const isRight = POSITION === 'bottom-right';
    const side    = isRight ? 'right' : 'left';
    const origin  = `bottom ${side}`;

    return `
#chub-widget *,#chub-widget *::before,#chub-widget *::after{box-sizing:border-box;margin:0;padding:0}
#chub-widget{
  position:fixed;
  ${side}:20px;
  bottom:20px;
  z-index:2147483647;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  font-size:14px;
  display:flex;
  flex-direction:column;
  align-items:${isRight ? 'flex-end' : 'flex-start'};
  gap:12px;
}

/* ── Bubble Button ── */
#chub-bubble{
  width:56px;height:56px;
  border-radius:50%;
  background:${PRIMARY};
  border:none;
  cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 4px 18px rgba(0,0,0,0.28);
  transition:transform .2s ease,box-shadow .2s ease;
  outline:none;
  position:relative;
  flex-shrink:0;
}
#chub-bubble:hover{transform:scale(1.08);box-shadow:0 6px 24px rgba(0,0,0,0.34)}
#chub-bubble:active{transform:scale(0.96)}
#chub-bubble svg{width:26px;height:26px;fill:#fff;display:block}

/* ── Unread Badge ── */
#chub-badge{
  position:absolute;
  top:-3px;${side}:-3px;
  min-width:18px;height:18px;
  border-radius:9px;
  background:#ff3b30;
  color:#fff;
  font-size:10px;font-weight:700;
  display:flex;align-items:center;justify-content:center;
  padding:0 4px;
  border:2px solid #fff;
  display:none;
}

/* ── Chat Window ── */
#chub-window{
  width:360px;
  height:520px;
  border-radius:16px;
  background:#fff;
  box-shadow:0 8px 40px rgba(0,0,0,0.18);
  display:flex;flex-direction:column;
  overflow:hidden;
  transform-origin:${origin};
  transition:transform .25s cubic-bezier(.34,1.56,.64,1),opacity .2s ease;
}
#chub-window.chub-hidden{
  transform:scale(0.8) translateY(12px);
  opacity:0;
  pointer-events:none;
}

/* ── Header ── */
#chub-header{
  background:${PRIMARY};
  padding:12px 14px;
  display:flex;align-items:center;gap:10px;
  color:#fff;
  flex-shrink:0;
}
#chub-header-avatar{
  width:38px;height:38px;border-radius:50%;
  background:rgba(255,255,255,.22);
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;
}
#chub-header-avatar svg{width:22px;height:22px;fill:#fff}
#chub-header-info{flex:1;min-width:0}
#chub-header-name{font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#chub-header-status{font-size:11px;opacity:.82;margin-top:1px}
#chub-header-actions{display:flex;gap:4px;flex-shrink:0}
#chub-header-actions button{
  background:transparent;border:none;cursor:pointer;
  color:#fff;opacity:.75;padding:4px;
  border-radius:6px;display:flex;align-items:center;
  transition:opacity .15s,background .15s;
}
#chub-header-actions button:hover{opacity:1;background:rgba(255,255,255,.15)}
#chub-header-actions button svg{width:18px;height:18px;fill:#fff;display:block}

/* ── Messages ── */
#chub-messages{
  flex:1;overflow-y:auto;
  padding:14px 12px;
  display:flex;flex-direction:column;gap:8px;
  background:#f2f2f7;
  scroll-behavior:smooth;
}
#chub-messages::-webkit-scrollbar{width:4px}
#chub-messages::-webkit-scrollbar-track{background:transparent}
#chub-messages::-webkit-scrollbar-thumb{background:#c7c7cc;border-radius:2px}

/* ── Message Bubble ── */
.chub-msg{
  max-width:80%;
  padding:9px 13px 7px;
  border-radius:16px;
  line-height:1.5;
  word-break:break-word;
  font-size:13.5px;
  animation:chub-fadein .18s ease both;
}
@keyframes chub-fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.chub-bot{
  background:#fff;color:#1c1c1e;
  border-bottom-left-radius:4px;
  align-self:flex-start;
  box-shadow:0 1px 4px rgba(0,0,0,.08);
}
.chub-user{
  background:${PRIMARY};color:#fff;
  border-bottom-right-radius:4px;
  align-self:flex-end;
}
.chub-msg-time{
  font-size:10px;opacity:.5;
  margin-top:3px;
  text-align:right;
}
.chub-bot .chub-msg-time{text-align:left}

/* ── Error message ── */
.chub-error{
  background:#fff2f2;color:#c0392b;
  border:1px solid #ffc0c0;
}

/* ── Typing Indicator ── */
#chub-typing{
  display:none;
  align-items:center;gap:4px;
  padding:11px 14px;
  background:#fff;
  border-radius:16px;border-bottom-left-radius:4px;
  align-self:flex-start;
  box-shadow:0 1px 4px rgba(0,0,0,.08);
  animation:chub-fadein .18s ease both;
}
#chub-typing.chub-visible{display:flex}
#chub-typing span{
  width:6px;height:6px;
  border-radius:50%;
  background:#a0a0a5;
  display:block;
  animation:chub-bounce 1.2s ease-in-out infinite;
}
#chub-typing span:nth-child(2){animation-delay:.2s}
#chub-typing span:nth-child(3){animation-delay:.4s}
@keyframes chub-bounce{
  0%,60%,100%{transform:translateY(0);opacity:.6}
  30%{transform:translateY(-5px);opacity:1}
}

/* ── Input Area ── */
#chub-input-area{
  padding:10px 10px;
  background:#fff;
  border-top:1px solid #e5e5ea;
  display:flex;align-items:center;gap:8px;
  flex-shrink:0;
}
#chub-input{
  flex:1;
  border:1.5px solid #e5e5ea;
  border-radius:22px;
  padding:9px 15px;
  font-size:13.5px;
  outline:none;
  font-family:inherit;
  background:#f9f9f9;
  color:#1c1c1e;
  transition:border-color .18s,background .18s;
  min-width:0;
}
#chub-input:focus{border-color:${PRIMARY};background:#fff}
#chub-input::placeholder{color:#aeaeb2}
#chub-input:disabled{opacity:.5;cursor:not-allowed}
#chub-send{
  width:38px;height:38px;
  border-radius:50%;
  background:${PRIMARY};
  border:none;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;
  transition:opacity .18s,transform .12s;
}
#chub-send:hover:not(:disabled){opacity:.85}
#chub-send:active:not(:disabled){transform:scale(.93)}
#chub-send:disabled{opacity:.4;cursor:not-allowed}
#chub-send svg{width:17px;height:17px;fill:#fff;display:block}

/* ── Empty state ── */
#chub-empty{
  text-align:center;
  color:#8e8e93;
  font-size:12.5px;
  padding:24px 16px;
  flex-shrink:0;
}

/* ── Responsive ── */
@media(max-width:420px){
  #chub-widget{${side}:0;bottom:0}
  #chub-window{
    width:100vw;
    height:calc(100dvh - 80px);
    border-bottom-left-radius:0;
    border-bottom-right-radius:0;
  }
  #chub-bubble{${side}:16px;bottom:16px;position:fixed}
}
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DOM Elements (declared, assigned in buildWidget)
  // ─────────────────────────────────────────────────────────────────────────────

  let $container:  HTMLDivElement;
  let $window:     HTMLDivElement;
  let $messages:   HTMLDivElement;
  let $typing:     HTMLDivElement;
  let $input:      HTMLInputElement;
  let $send:       HTMLButtonElement;
  let $bubble:     HTMLButtonElement;
  let $badge:      HTMLSpanElement;

  // ─────────────────────────────────────────────────────────────────────────────
  // Build DOM
  // ─────────────────────────────────────────────────────────────────────────────

  function buildWidget(): void {
    // Inject CSS
    const style = document.createElement('style');
    style.id = 'chub-styles';
    style.textContent = buildCSS();
    document.head.appendChild(style);

    // Root container
    $container = el('div', { id: 'chub-widget', role: 'region', 'aria-label': 'Chat' });

    // ── Chat Window ──────────────────────────────────────────────────────────
    $window = el('div', { id: 'chub-window', role: 'dialog', 'aria-label': `Chat dengan ${BOT_NAME}` });
    $window.classList.add('chub-hidden');

    // Header
    const header = el('div', { id: 'chub-header' });
    header.innerHTML = `
      <div id="chub-header-avatar">${ICON_BOT}</div>
      <div id="chub-header-info">
        <div id="chub-header-name">${esc(BOT_NAME)}</div>
        <div id="chub-header-status">Online</div>
      </div>
    `;
    const headerActions = el('div', { id: 'chub-header-actions' });

    // New conversation button
    const newConvBtn = el('button', { title: 'Mulai percakapan baru', 'aria-label': 'Mulai percakapan baru' }) as HTMLButtonElement;
    newConvBtn.innerHTML = ICON_REFRESH;
    newConvBtn.addEventListener('click', startNewConversation);

    // Close button
    const closeBtn = el('button', { title: 'Tutup chat', 'aria-label': 'Tutup chat' }) as HTMLButtonElement;
    closeBtn.innerHTML = ICON_CLOSE;
    closeBtn.addEventListener('click', () => toggleWidget(false));

    headerActions.appendChild(newConvBtn);
    headerActions.appendChild(closeBtn);
    header.appendChild(headerActions);

    // Messages
    $messages = el('div', { id: 'chub-messages', role: 'log', 'aria-live': 'polite', 'aria-label': 'Pesan chat' });

    // Typing indicator
    $typing = el('div', { id: 'chub-typing', 'aria-label': `${BOT_NAME} sedang mengetik`, 'aria-hidden': 'true' });
    $typing.innerHTML = '<span></span><span></span><span></span>';

    // Input area
    const inputArea = el('div', { id: 'chub-input-area' });

    $input = el('input', {
      id: 'chub-input',
      type: 'text',
      placeholder: 'Ketik pesan...',
      autocomplete: 'off',
      maxlength: '2000',
      'aria-label': 'Tulis pesan',
    }) as HTMLInputElement;
    $input.addEventListener('keydown', onInputKeydown);
    $input.addEventListener('input', onInputChange);

    $send = el('button', {
      id: 'chub-send',
      title: 'Kirim',
      'aria-label': 'Kirim pesan',
      disabled: 'true',
    }) as HTMLButtonElement;
    $send.innerHTML = ICON_SEND;
    $send.addEventListener('click', sendMessage);

    inputArea.appendChild($input);
    inputArea.appendChild($send);

    $window.appendChild(header);
    $window.appendChild($messages);
    $window.appendChild($typing);
    $window.appendChild(inputArea);

    // ── Bubble Button ────────────────────────────────────────────────────────
    $bubble = el('button', {
      id: 'chub-bubble',
      'aria-label': 'Buka chat',
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
    }) as HTMLButtonElement;
    $bubble.innerHTML = ICON_CHAT;

    $badge = el('span', { id: 'chub-badge', 'aria-label': 'pesan belum dibaca' }) as HTMLSpanElement;
    $bubble.appendChild($badge);
    $bubble.addEventListener('click', () => toggleWidget());

    $container.appendChild($window);
    $container.appendChild($bubble);
    document.body.appendChild($container);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Toggle Open / Close
  // ─────────────────────────────────────────────────────────────────────────────

  function toggleWidget(forceOpen?: boolean): void {
    isOpen = forceOpen !== undefined ? forceOpen : !isOpen;

    if (isOpen) {
      $window.classList.remove('chub-hidden');
      $bubble.setAttribute('aria-expanded', 'true');
      $bubble.setAttribute('aria-label', 'Tutup chat');
      $bubble.innerHTML = ICON_CLOSE;
      $bubble.appendChild($badge);

      // Reset unread
      unreadCount = 0;
      updateBadge();

      // Load history on first open
      if (!historyLoaded) {
        historyLoaded = true;
        void loadHistory();
      }

      // Focus input after animation
      setTimeout(() => $input.focus(), 280);
    } else {
      $window.classList.add('chub-hidden');
      $bubble.setAttribute('aria-expanded', 'false');
      $bubble.setAttribute('aria-label', 'Buka chat');
      $bubble.innerHTML = ICON_CHAT;
      $bubble.appendChild($badge);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Start New Conversation
  // ─────────────────────────────────────────────────────────────────────────────

  function startNewConversation(): void {
    sessionId = generateUUID();
    localStorage.setItem(STORAGE_KEY, sessionId);
    historyLoaded = false;

    // Clear messages
    $messages.innerHTML = '';
    // Show welcome again
    appendMessage('assistant', WELCOME);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Load Chat History
  // ─────────────────────────────────────────────────────────────────────────────

  async function loadHistory(): Promise<void> {
    try {
      const res = await fetch(`${BASE_URL}/v1/chat/history/${sessionId}`, {
        headers: { 'X-Api-Key': config.apiKey },
      });

      if (res.ok) {
        const data = (await res.json()) as HistoryResponse;
        if (data.messages?.length > 0) {
          data.messages.forEach((m) =>
            appendMessage(m.role, m.content, m.created_at, false),
          );
          scrollToBottom();
          return;
        }
      }
    } catch {
      // Fall through to show welcome message
    }

    // No history — show welcome
    appendMessage('assistant', WELCOME);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Send Message
  // ─────────────────────────────────────────────────────────────────────────────

  async function sendMessage(): Promise<void> {
    const text = $input.value.trim();
    if (!text || isLoading) return;

    $input.value = '';
    $input.disabled = true;
    $send.disabled = true;
    isLoading = true;

    appendMessage('user', text);
    showTyping(true);
    scrollToBottom();

    try {
      const res = await fetch(`${BASE_URL}/v1/chat/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': config.apiKey,
        },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });

      showTyping(false);

      if (!res.ok) {
        const errMsg =
          res.status === 429
            ? 'Terlalu banyak pesan. Tunggu sebentar ya 😊'
            : res.status >= 500
              ? 'Server sedang bermasalah. Coba lagi nanti.'
              : 'Maaf, terjadi kesalahan. Coba kirim ulang.';
        appendMessage('assistant', errMsg, undefined, true, true);
        return;
      }

      const data = (await res.json()) as SendMessageResponse;

      // Server may return a canonical session_id — keep it in sync
      if (data.session_id && data.session_id !== sessionId) {
        sessionId = data.session_id;
        localStorage.setItem(STORAGE_KEY, sessionId);
      }

      appendMessage('assistant', data.reply, data.timestamp);

      // Show badge if widget is closed
      if (!isOpen) {
        unreadCount++;
        updateBadge();
      }
    } catch {
      showTyping(false);
      appendMessage(
        'assistant',
        'Koneksi bermasalah. Periksa internet Anda dan coba lagi.',
        undefined,
        true,
        true,
      );
    } finally {
      $input.disabled = false;
      $send.disabled = $input.value.trim().length === 0;
      isLoading = false;
      $input.focus();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function appendMessage(
    role: 'user' | 'assistant',
    content: string,
    timestamp?: string,
    animate = true,
    isError = false,
  ): void {
    const wrap = el('div', {
      class: `chub-msg ${role === 'user' ? 'chub-user' : `chub-bot${isError ? ' chub-error' : ''}`}`,
      role: 'article',
    });
    if (!animate) wrap.style.animation = 'none';

    const textEl = el('div');
    textEl.textContent = content;

    const timeEl = el('div', { class: 'chub-msg-time' });
    timeEl.textContent = fmtTime(timestamp ? new Date(timestamp) : new Date());

    wrap.appendChild(textEl);
    wrap.appendChild(timeEl);
    $messages.appendChild(wrap);
    scrollToBottom();
  }

  function showTyping(visible: boolean): void {
    if (visible) {
      $typing.classList.add('chub-visible');
      $typing.setAttribute('aria-hidden', 'false');
      $messages.appendChild($typing);
      scrollToBottom();
    } else {
      $typing.classList.remove('chub-visible');
      $typing.setAttribute('aria-hidden', 'true');
    }
  }

  function scrollToBottom(): void {
    $messages.scrollTop = $messages.scrollHeight;
  }

  function updateBadge(): void {
    if (unreadCount > 0) {
      $badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
      $badge.style.display = 'flex';
    } else {
      $badge.style.display = 'none';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Input Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  function onInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function onInputChange(): void {
    $send.disabled = $input.value.trim().length === 0 || isLoading;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────────

  /** Create element with attribute shorthand */
  function el(tag: string, attrs: Record<string, string> = {}): HTMLElement {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') {
        e.className = v;
      } else if (k === 'disabled') {
        (e as HTMLButtonElement).disabled = true;
      } else {
        e.setAttribute(k, v);
      }
    }
    return e;
  }

  /** Escape HTML to prevent XSS */
  function esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Format timestamp as HH:MM */
  function fmtTime(d: Date): string {
    return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────────────────────

  function init(): void {
    // Prevent double init
    if (document.getElementById('chub-widget')) return;
    buildWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
