import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
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

import { fetchFieldRegistry } from '@ts/utils/fieldRegistry';

const root_path = import.meta.env.VITE_ROOT_PATH || '';
store.dispatch(setRootPath(root_path));

// Warm up the field type registry in the background — it will be cached
// before any field component renders (document navigation takes longer).
fetchFieldRegistry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
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
    {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
  </QueryClientProvider>
);
