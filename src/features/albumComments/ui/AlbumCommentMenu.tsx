import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal as MoreHorizontalIcon } from 'lucide-react';

export type AlbumCommentMenuItem = {
  id: string;
  label: string;
  destructive?: boolean;
};

type AlbumCommentMenuProps = {
  items: AlbumCommentMenuItem[];
  onSelect: (id: string) => void;
  menuLabel: string;
};

export function AlbumCommentMenu({ items, onSelect, menuLabel }: AlbumCommentMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="album-comments__menu" ref={rootRef}>
      <button
        type="button"
        className="album-comments__menu-trigger"
        aria-label={menuLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontalIcon size={18} strokeWidth={1.75} />
      </button>
      {open ? (
        <div className="album-comments__menu-panel" role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={
                item.destructive
                  ? 'album-comments__menu-item album-comments__menu-item--destructive'
                  : 'album-comments__menu-item'
              }
              onClick={() => {
                setOpen(false);
                onSelect(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
