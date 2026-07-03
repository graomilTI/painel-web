import { initProtectedPage } from './pageInit.js';
import { renderOsMobile } from './os-mobile-v2.js?v=20260622-2';

export const renderContent = (content) => renderOsMobile(content);

initProtectedPage('OS', renderContent);
