import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about.html',
        services: 'services.html',
        contact: 'contact.html',
        login: 'login.html',
        book: 'book.html',
        walkin: 'walkin.html',
        queue: 'queue.html',
        'admin-index': 'admin/index.html',
        'admin-appointments': 'admin/appointments.html',
        'admin-patients': 'admin/patients.html',
        'admin-schedule': 'admin/schedule.html',
        'admin-services': 'admin/services.html',
        'admin-payments': 'admin/payments.html',
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
