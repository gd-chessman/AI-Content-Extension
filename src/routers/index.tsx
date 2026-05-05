import ExtensionLayout from '../layouts/ExtensionLayout'
import FacebookScreen from '../screens/FacebookScreen'
import LoginScreen from '../screens/LoginScreen'

const routes = {
  login: (
    <ExtensionLayout>
      <LoginScreen />
    </ExtensionLayout>
  ),
  facebook: (
    <ExtensionLayout>
      <FacebookScreen />
    </ExtensionLayout>
  ),
}

function AppRouter() {
  const activeRoute = 'facebook'

  return routes[activeRoute]
}

export default AppRouter
