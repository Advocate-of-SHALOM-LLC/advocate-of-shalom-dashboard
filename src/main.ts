import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createAuth0 } from '@auth0/auth0-vue';
import App from './App.vue';
import router from './router';
// The public site's fonts, self-hosted (latin subset) so the dashboard looks
// like the site on every device, not only where they happen to be installed.
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/source-sans-3/wght.css';
import './assets/styles/main.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(
  createAuth0({
    domain: import.meta.env.VITE_AUTH0_DOMAIN,
    clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
    authorizationParams: {
      redirect_uri: window.location.origin,
    },
  })
);

app.mount('#app');
