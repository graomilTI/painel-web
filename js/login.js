import { signInWithPassword, getUserContext } from './auth.js';
import { saveUserContext } from './sessionStore.js';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const feedback = document.getElementById('loginFeedback');
const togglePassword = document.getElementById('togglePassword');

if (togglePassword) {
  togglePassword.addEventListener('click', () => {
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    togglePassword.textContent = passwordInput.type === 'password' ? 'Mostrar' : 'Ocultar';
  });
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  feedback.textContent = 'Entrando...';

  try {
    const authData = await signInWithPassword(emailInput.value.trim(), passwordInput.value);
    const userId = authData.user?.id;
    if (!userId) throw new Error('Usuário não encontrado após login.');

    const context = await getUserContext(userId);
    if (!context?.user?.active) throw new Error('Usuário inativo.');

    saveUserContext(context);
    feedback.textContent = 'Login realizado com sucesso.';
    window.location.href = './dashboard.html';
  } catch (err) {
    console.error(err);
    feedback.textContent = err.message || 'Erro ao realizar login.';
  }
});
