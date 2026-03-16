<template>
  <div class="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <!-- Logo / Brand -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-indigo-500 rounded-2xl mb-4 shadow-lg">
          <svg class="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-white">AI Chatbot Hub</h1>
        <p class="text-indigo-300 text-sm mt-1">Platform Chatbot AI untuk UMKM Indonesia</p>
      </div>

      <!-- Content slot -->
      <slot />

      <p class="text-center text-indigo-400 text-xs mt-8">
        &copy; {{ new Date().getFullYear() }} AI Chatbot Hub. Semua hak dilindungi.
      </p>
    </div>
  </div>
</template>
