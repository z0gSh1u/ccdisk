/**
 * DiskSwitcher - Dropdown selector for switching between Disks
 * Placed at the top of the Sidebar
 */
import { useState, useRef, useEffect } from 'react';
import { useDiskStore } from '../stores/disk-store';
import { Disc, Code, Database, PenTool, ChevronDown, Settings, type LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  disc: Disc,
  code: Code,
  database: Database,
  'pen-tool': PenTool
};

interface DiskSwitcherProps {
  onManageDisks: () => void;
}

export function DiskSwitcher({ onManageDisks }: DiskSwitcherProps) {
  const { disks, currentDisk, switchDisk, isLoading } = useDiskStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const handleSwitch = async (diskId: string) => {
    if (diskId === currentDisk?.id) {
      setIsOpen(false);
      return;
    }
    await switchDisk(diskId);
    setIsOpen(false);
  };

  const CurrentIcon = currentDisk?.icon ? ICON_MAP[currentDisk.icon] || Disc : Disc;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Current Disk Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-bg-accent transition-colors text-left"
      >
        <div className="h-6 w-6 rounded bg-accent/10 flex items-center justify-center">
          <CurrentIcon className="h-3.5 w-3.5 text-accent" />
        </div>
        <span className="flex-1 text-sm font-medium text-text-primary truncate">{currentDisk?.name || 'Default'}</span>
        <ChevronDown className={`h-4 w-4 text-text-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg border border-border-subtle shadow-lg z-50 py-1">
          {disks.map((disk) => {
            const Icon = ICON_MAP[disk.icon] || Disc;
            const isActive = disk.id === currentDisk?.id;

            return (
              <button
                key={disk.id}
                onClick={() => handleSwitch(disk.id)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors ${
                  isActive ? 'bg-accent/5 text-accent font-medium' : 'text-text-secondary hover:bg-bg-accent'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-accent' : 'text-text-tertiary'}`} />
                <span className="flex-1 truncate">{disk.name}</span>
                {isActive && <div className="h-1.5 w-1.5 rounded-full bg-accent" />}
              </button>
            );
          })}

          <div className="border-t border-border-subtle my-1" />

          <button
            onClick={() => {
              setIsOpen(false);
              onManageDisks();
            }}
            className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-accent transition-colors"
          >
            <Settings className="h-4 w-4 text-text-tertiary" />
            <span>Manage Disks</span>
          </button>
        </div>
      )}
    </div>
  );
}
