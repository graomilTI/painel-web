import { toPanelUrl } from '../../js/paths.js'
// authGuard.js
import { getUser } from './auth.js'

(async () => {
  const user = await getUser()
  if (!user) {
    window.location.href = toPanelUrl("login.html")
  }
})()
