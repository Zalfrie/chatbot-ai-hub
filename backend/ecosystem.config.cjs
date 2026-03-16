/**
 * PM2 Ecosystem Configuration
 * Usage:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 reload ecosystem.config.cjs --env production
 *   pm2 stop chatbot-ai-hub
 */
module.exports = {
  apps: [
    {
      name: 'chatbot-ai-hub',
      script: 'dist/index.js',

      // Cluster mode: one worker per CPU core for horizontal scaling
      instances: 'max',
      exec_mode: 'cluster',

      // Auto-restart on crash / memory threshold
      autorestart: true,
      max_memory_restart: '512M',
      restart_delay: 3000,
      max_restarts: 10,

      // Graceful shutdown — wait up to 5s for in-flight requests
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,

      // Log files (inside /backend/logs/)
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Development environment overrides
      env: {
        NODE_ENV: 'development',
        PORT: '3000',
      },

      // Production environment overrides
      env_production: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
  ],
};
