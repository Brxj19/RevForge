import type { ReactNode } from "react";
import clsx from "clsx";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onTabChange, className }: TabsProps) {
  if (tabs.length === 0) return null;
  return (
    <div className={clsx("flex border-b border-border", className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTab}
          onClick={() => onTabChange(tab.id)}
          className={clsx(
            "relative px-3 py-2 text-sm font-medium transition-colors",
            tab.id === activeTab
              ? "text-text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-accent"
              : "text-text-secondary hover:text-text-primary",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface TabContentProps {
  active: boolean;
  children: ReactNode;
  className?: string;
}

export function TabContent({ active, children, className }: TabContentProps) {
  if (!active) return null;
  return <div className={clsx("pt-4", className)}>{children}</div>;
}
