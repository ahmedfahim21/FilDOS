import {
  ArrowUp,
  ArrowUpFromLine,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Clock,
  Cloud,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Info,
  LayoutGrid,
  List,
  type LucideIcon,
  Monitor,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Scissors,
  Search,
  Settings,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  X,
} from 'lucide-react';

type IconName =
  | 'back'
  | 'forward'
  | 'up'
  | 'refresh'
  | 'new-folder'
  | 'eye'
  | 'eye-off'
  | 'folder'
  | 'file'
  | 'close'
  | 'info'
  | 'trash'
  | 'rename'
  | 'open'
  | 'reveal'
  | 'chevron'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'file-plus'
  | 'search'
  | 'grid'
  | 'list'
  | 'restore'
  | 'tag'
  | 'clock'
  | 'check'
  | 'plus'
  | 'drive'
  | 'eject'
  | 'cloud'
  | 'settings'
  | 'sparkles'
  | 'sun'
  | 'moon'
  | 'monitor';

/** Maps the app's semantic icon names onto lucide-react glyphs. */
const ICONS: Record<IconName, LucideIcon> = {
  back: ChevronLeft,
  forward: ChevronRight,
  up: ArrowUp,
  refresh: RefreshCw,
  'new-folder': FolderPlus,
  eye: Eye,
  'eye-off': EyeOff,
  folder: Folder,
  file: File,
  close: X,
  info: Info,
  trash: Trash2,
  rename: Pencil,
  open: ExternalLink,
  reveal: FolderOpen,
  chevron: ChevronRight,
  copy: Copy,
  cut: Scissors,
  paste: Clipboard,
  'file-plus': FilePlus,
  search: Search,
  grid: LayoutGrid,
  list: List,
  restore: RotateCcw,
  tag: Tag,
  clock: Clock,
  check: Check,
  plus: Plus,
  drive: HardDrive,
  eject: ArrowUpFromLine,
  cloud: Cloud,
  settings: Settings,
  sparkles: Sparkles,
  sun: Sun,
  moon: Moon,
  monitor: Monitor,
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const Glyph = ICONS[name];
  return <Glyph size={size} aria-hidden="true" />;
}
