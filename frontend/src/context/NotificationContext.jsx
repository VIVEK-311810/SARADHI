import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const add = useCallback((notif) => {
    const entry = {
      id: Date.now() + Math.random(),
      timestamp: new Date(),
      read: false,
      ...notif,
    };
    setNotifications(prev => [entry, ...prev].slice(0, 50));
    setUnreadCount(c => c + 1);
    toast(notif.title, { description: notif.body });
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const clear = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // Listen for CustomEvents dispatched by WS handlers
  useEffect(() => {
    const handler = (e) => add(e.detail);
    window.addEventListener('saradhi:notification', handler);
    return () => window.removeEventListener('saradhi:notification', handler);
  }, [add]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, add, markAllRead, clear }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
