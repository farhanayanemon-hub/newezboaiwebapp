// PM2 Process Manager Config — EzboAI
// Usage: pm2 start ecosystem.config.cjs --env production

module.exports = {
  apps: [
    {
      name: "ezboai-api",
      script: "./artifacts/api-server/dist/index.mjs",
      cwd: "/var/www/ezboai",
      instances: 1, // single instance to start; can scale later with cluster mode
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env_file: "./.env.production",
      env: {
        NODE_ENV: "production",
      },
      error_file: "/var/log/pm2/ezboai-api-error.log",
      out_file: "/var/log/pm2/ezboai-api-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      time: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
    // Future: separate worker process for Playwright/reminders
    // {
    //   name: "ezboai-worker",
    //   script: "./artifacts/api-server/dist/worker.mjs",
    //   cwd: "/var/www/ezboai",
    //   instances: 1,
    //   exec_mode: "fork",
    //   autorestart: true,
    //   max_memory_restart: "2G",
    //   env_file: "./.env.production",
    // },
  ],
};
