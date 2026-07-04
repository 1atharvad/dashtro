import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import 'advi-ui/styles'
import 'advi-ui/fonts'
import '@/index.scss'
import { store } from "@/redux/store.ts";
import { setRootPath } from '@/redux/rootPathSlice';
import { App } from '@/App.tsx'
import { HelmetProvider } from 'react-helmet-async';
import { CustomThemeProvider } from '@ts/theme/ThemeProvider';
import { UserProvider } from '@ts/context/UserContext';
import { ToastProvider } from 'advi-ui';

import { fetchFieldRegistry } from '@ts/config/fieldRegistry';

const root_path = import.meta.env.VITE_ROOT_PATH || '';
store.dispatch(setRootPath(root_path));

// Warm up the field type registry in the background — it will be cached
// before any field component renders (document navigation takes longer).
fetchFieldRegistry();

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <HelmetProvider>
      <CustomThemeProvider>
        <ToastProvider position="right">
          <UserProvider>
            <App/>
          </UserProvider>
        </ToastProvider>
      </CustomThemeProvider>
    </HelmetProvider>
  </Provider>
);
