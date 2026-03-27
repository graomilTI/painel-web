// authGuard.js
import { getUser } from './auth.js'

(async () => {
  const user = await getUser()
  if (!user) {
    window.location.href = "/login.html"
  }
})()
