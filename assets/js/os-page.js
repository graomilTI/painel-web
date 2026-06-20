import { initProtectedPage } from './pageInit.js';
import { renderOsModule } from './os.js';

initProtectedPage('OS', (content) => renderOsModule(content));
