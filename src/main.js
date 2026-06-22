import { createStore } from './store.js';
import { renderApp } from './ui.js';

const store = createStore();
const root = document.querySelector('#app');
let tab = 'routines';

function render() {
  renderApp(root, { tab });
  root.querySelectorAll('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      render();
    });
  });
}

render();
window.__store = store; // 디버그용
