// PM2 process config for the VPS: `pm2 start ecosystem.config.cjs`
// Next.js reads environment variables from .env.local in this folder.
module.exports = {
  apps: [
    {
      name: "proposal-moments",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      // Only reachable through Nginx, not directly from the internet.
      args: "start -H 127.0.0.1 -p 3000",
      instances: 1,
      autorestart: true,
      max_memory_restart: "600M",
      env: { NODE_ENV: "production" },
    },
  ],
};
