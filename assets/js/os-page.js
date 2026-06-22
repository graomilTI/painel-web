import { initProtectedPage } from './pageInit.js';
import { renderOsMobile } from './os-mobile-v2.js?v=20260622-2';

initProtectedPage('OS', (content) => renderOsMobile(content));
