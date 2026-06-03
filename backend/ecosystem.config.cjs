module.exports = {
  apps: [
    {
      name: "arogya-backend",
      script: "src/server.js",
      cwd: "/home/developper/arogya-entry/backend",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "4000",
        AROGYA_DB_PATH: "/var/lib/arogya/arogya.db",
      },
    },
  ],
};
