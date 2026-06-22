import { initProtectedPage } from './pageInit.js';
import { renderOsModule } from './os.js';
import { renderOsMobile } from './os-mobile.js';

initProtectedPage('OS', (content) => {
  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  return isMobile ? renderOsMobile(content) : renderOsModule(content);
});
