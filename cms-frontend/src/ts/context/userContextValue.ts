import { createContext, useContext } from 'react';
import type { UserContextValue } from '@ts/types/constants';

export const UserContext = createContext<UserContextValue>({ user: null, refreshUser: async () => {}, checked: false });

export const useUser = () => useContext(UserContext);
