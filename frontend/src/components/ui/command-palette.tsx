import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog } from "./dialog";
import { Input } from "./input";

interface CommandPaletteItem {
  id: string;
  label: string;
  detail: string;
  keywords: string[];
  to?: string;
  onSelect?: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: CommandPaletteItem[];
}

export function CommandPalette({ open, onClose, items }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => {
      const haystack = [item.label, item.detail, ...item.keywords]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [items, query]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Command palette"
      className="max-w-2xl p-0"
    >
      <div className="border-b border-border p-4">
        <Input
          aria-label="Search actions and navigation"
          autoFocus
          placeholder="Search navigation, repositories, settings, and help"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="max-h-[420px] overflow-y-auto p-2">
        {filteredItems.length > 0 ? (
          <ul
            className="grid gap-1"
            role="listbox"
            aria-label="Available commands"
          >
            {filteredItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between rounded-md px-3 py-2 text-left hover:bg-surface-subtle"
                  onClick={() => {
                    if (item.onSelect) {
                      item.onSelect();
                    } else if (item.to) {
                      navigate(item.to);
                    }
                    onClose();
                  }}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-text-primary">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-xs text-text-muted">
                      {item.detail}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">
            No matching commands.
          </div>
        )}
      </div>
    </Dialog>
  );
}
