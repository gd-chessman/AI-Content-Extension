import LoginScreen from '../screens/LoginScreen';

const routes = {
  login: <LoginScreen />,
};

function AppRouter() {
  const activeRoute = 'login';

  return routes[activeRoute];
}

export default AppRouter;
