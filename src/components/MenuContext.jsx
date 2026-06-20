import { createContext, useContext, useState, useCallback } from 'react';

const MenuContext = createContext({ open: false, openMenu: () => {}, closeMenu: () => {} });

export function MenuProvider({ children }) {
  const [open, setOpen] = useState(false);
  const openMenu = useCallback(() => setOpen(true), []);
  const closeMenu = useCallback(() => setOpen(false), []);
  return (
    <MenuContext.Provider value={{ open, openMenu, closeMenu }}>
      {children}
    </MenuContext.Provider>
  );
}

export function useMenu() {
  return useContext(MenuContext);
}
