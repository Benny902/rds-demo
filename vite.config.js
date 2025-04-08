export default {
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:64402',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/api/, '')
        }
      }
    }
  }
  