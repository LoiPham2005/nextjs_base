/**
 * Cấu hình PM2 cho Next.js Standalone và Realtime WebSocket server.
 *
 * Sử dụng:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 reload ecosystem.config.cjs --env production
 *   pm2 stop ecosystem.config.cjs
 *   pm2 logs
 */

module.exports = {
  apps: [
    {
      name: "nextjs-base",
      script: ".next/standalone/server.js",
      cwd: "./",
      // Chạy ở cluster mode để tận dụng đa nhân CPU, hoặc 1 instance nếu VPS nhỏ (1 vCPU/1GB RAM)
      instances: process.env.PM2_INSTANCES || "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      node_args: "--env-file-if-exists=.env",
      env: {
        NODE_ENV: "development",
        PORT: 3000,
        HOSTNAME: "127.0.0.1",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        HOSTNAME: "127.0.0.1",
      },
    },
    {
      name: "nextjs-base-realtime",
      script: "realtime/dist/server.cjs",
      cwd: "./",
      // Realtime WebSocket server chạy fork mode (tiến trình riêng)
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      node_args: "--env-file-if-exists=.env",
      env: {
        NODE_ENV: "development",
        REALTIME_PORT: 3002,
      },
      env_production: {
        NODE_ENV: "production",
        REALTIME_PORT: 3002,
      },
    },
  ],
};
