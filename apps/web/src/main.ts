import { createApp } from 'vue';
import { Cumquat } from '@mrchar/cumquat/components';
import App from './App.vue';
import './style.css';

const app = createApp(App);
app.use(Cumquat);
app.mount('#app');
