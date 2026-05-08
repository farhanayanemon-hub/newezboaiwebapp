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
        // Pin Playwright browser cache to a fixed app-owned dir so install
        // (run as the deploy user) and runtime (run by PM2 daemon, possibly
        // root) read/write the SAME location. Without this, Playwright
        // defaults to $HOME/.cache/ms-playwright which differs by user.
        PLAYWRIGHT_BROWSERS_PATH: "/var/www/ezboai/.playwright",
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
