import { getSession, getUserContext } from './auth.js';
import { loadUserContext, saveUserContext, clearUserContext } from './sessionStore.js';
import { toPanelUrl } from './paths.js';

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    clearUserContext();
    window.location.replace(toPanelUrl('login.html'));
    return null;
  }

  let context = loadUserContext();
  if (!context || context.user?.id !== session.user.id) {
    context = await getUserContext(session.user.id);
    saveUserContext(context);
  }

  if (!context?.user?.active) {
    clearUserContext();
    window.location.replace(toPanelUrl('login.html'));
    return null;
  }

  return context;
}
