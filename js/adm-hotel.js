import { initProtectedPage } from './pageInit.js';

initProtectedPage('ADM Hotel', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>ADM Hotel</h3>
      <p>Página base de hotelaria e alojamentos.</p>
    </article>
  `;
});
