import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CustomerAccount, Order } from '../types';
import { accountLogin, accountLogout, accountRegister, getAccountMe } from '../lib/api';

interface AccountContextType {
  account: CustomerAccount | null;
  orders: Order[];
  /** true após a verificação inicial da sessão. */
  isReady: boolean;
  /** true enquanto uma ação (login/registo/logout) está a decorrer. */
  isLoading: boolean;
  refresh: () => Promise<void>;
  login: (phone: string, password?: string) => Promise<void>;
  register: (name: string, phone: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getAccountMe();
      setAccount(data.account);
      setOrders(data.orders);
    } catch {
      setAccount(null);
      setOrders([]);
    }
  }, []);

  // Restaura a sessão existente (cookie) ao carregar a app.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getAccountMe();
        if (active) {
          setAccount(data.account);
          setOrders(data.orders);
        }
      } catch {
        if (active) {
          setAccount(null);
          setOrders([]);
        }
      } finally {
        if (active) setIsReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (phone: string, password?: string) => {
    setIsLoading(true);
    try {
      const { account: loggedIn } = await accountLogin({ phone, password });
      setAccount(loggedIn);
      await refresh();
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  const register = useCallback(async (name: string, phone: string, password?: string) => {
    setIsLoading(true);
    try {
      const { account: created } = await accountRegister({ name, phone, password });
      setAccount(created);
      await refresh();
    } finally {
      setIsLoading(false);
    }
  }, [refresh]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await accountLogout();
    } catch {
      /* ignora — limpamos o estado local de qualquer forma */
    } finally {
      setAccount(null);
      setOrders([]);
      setIsLoading(false);
    }
  }, []);

  return (
    <AccountContext.Provider value={{ account, orders, isReady, isLoading, refresh, login, register, logout }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) throw new Error('useAccount must be used within an AccountProvider');
  return context;
}
