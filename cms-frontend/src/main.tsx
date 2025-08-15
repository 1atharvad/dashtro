import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import '@/index.scss'
import { store } from "@/redux/store.ts";
import { setRootPath } from '@/redux/rootPathSlice';
import { App } from '@/App.tsx'
import { HelmetProvider } from 'react-helmet-async';
import { CustomThemeProvider } from '@ts/theme/ThemeProvider';

const root_path = import.meta.env.VITE_ROOT_PATH || '';
store.dispatch(setRootPath(root_path));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <HelmetProvider>
        <CustomThemeProvider>
          <App/>
        </CustomThemeProvider>
      </HelmetProvider>
    </Provider>
  </StrictMode>
);
