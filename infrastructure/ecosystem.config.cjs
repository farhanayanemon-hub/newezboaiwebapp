// PM2 Process Manager Config — EzboAI
// Usage: pm2 start /var/www/ezboai/infrastructure/ecosystem.config.cjs
//
// We launch the API via a thin bash wrapper (run-api.sh) that sources
// .env.production into the process environment before exec'ing node.
// PM2's `env_file` key is unreliable across versions/install layouts —
// the wrapper guarantees DATABASE_URL & friends are present at boot.

module.exports = {
  apps: [
    {
      name: "ezboai-api",
      script: "/var/www/ezboai/infrastructure/run-api.sh",
      interpreter: "bash",
      cwd: "/var/www/ezboai",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      error_file: "/var/log/pm2/ezboai-api-error.log",
      out_file: "/var/log/pm2/ezboai-api-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      time: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
