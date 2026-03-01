import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type TerminalPanelContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const TerminalPanelContext = createContext<TerminalPanelContextValue | null>(
  null,
);

export function TerminalPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  const value: TerminalPanelContextValue = {
    open,
    setOpen,
    toggle,
  };

  return (
    <TerminalPanelContext.Provider value={value}>
      {children}
    </TerminalPanelContext.Provider>
  );
}

export function useTerminalPanel() {
  const ctx = useContext(TerminalPanelContext);
  if (!ctx)
    throw new Error("useTerminalPanel must be used within TerminalPanelProvider");
  return ctx;
}
