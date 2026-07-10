import type { HugeiconsProps } from '@hugeicons/react';
import type React from 'react';
import {
  AiBrain01Icon,
  AlertCircleIcon,
  ArrowExpand01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowShrink01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  ClipboardIcon,
  Clock01Icon,
  CloudIcon,
  ComputerIcon,
  Copy01Icon,
  Delete01Icon,
  Download01Icon,
  EyeIcon,
  File01Icon,
  FileAddIcon,
  Folder01Icon,
  FolderAddIcon,
  FolderOpenIcon,
  HardDriveIcon,
  Image02Icon,
  InformationCircleIcon,
  LayoutGridIcon,
  LayoutThreeColumnIcon,
  LinkSquare01Icon,
  ListViewIcon,
  Moon01Icon,
  More01Icon,
  NoInternetIcon,
  Notification01Icon,
  PauseIcon,
  PencilEdit01Icon,
  PlayIcon,
  PlusSignIcon,
  Refresh01Icon,
  RotateLeft01Icon,
  ScissorIcon,
  Search01Icon,
  Settings01Icon,
  SparklesIcon,
  Sun01Icon,
  Tag01Icon,
  Tick01Icon,
  ToolsIcon,
  Upload01Icon,
  ViewOffIcon,
} from 'hugeicons-react';

export type HugeIcon = React.ComponentType<Omit<HugeiconsProps, 'icon' | 'altIcon'>>;

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
  | 'gallery'
  | 'columns'
  | 'restore'
  | 'maximize'
  | 'minimize'
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
  | 'monitor'
  | 'alert-circle'
  | 'check-circle'
  | 'offline'
  | 'tool'
  | 'more'
  | 'brain'
  | 'play'
  | 'pause'
  | 'bell'
  | 'download';

/** Maps the app's semantic icon names onto hugeicons-react glyphs. */
const ICONS: Record<IconName, HugeIcon> = {
  back: ArrowLeft01Icon,
  forward: ArrowRight01Icon,
  up: ArrowUp01Icon,
  refresh: Refresh01Icon,
  'new-folder': FolderAddIcon,
  eye: EyeIcon,
  'eye-off': ViewOffIcon,
  folder: Folder01Icon,
  file: File01Icon,
  close: Cancel01Icon,
  info: InformationCircleIcon,
  trash: Delete01Icon,
  rename: PencilEdit01Icon,
  open: LinkSquare01Icon,
  reveal: FolderOpenIcon,
  chevron: ArrowRight01Icon,
  copy: Copy01Icon,
  cut: ScissorIcon,
  paste: ClipboardIcon,
  'file-plus': FileAddIcon,
  search: Search01Icon,
  grid: LayoutGridIcon,
  list: ListViewIcon,
  gallery: Image02Icon,
  columns: LayoutThreeColumnIcon,
  restore: RotateLeft01Icon,
  maximize: ArrowExpand01Icon,
  minimize: ArrowShrink01Icon,
  tag: Tag01Icon,
  clock: Clock01Icon,
  check: Tick01Icon,
  plus: PlusSignIcon,
  drive: HardDriveIcon,
  eject: Upload01Icon,
  cloud: CloudIcon,
  settings: Settings01Icon,
  sparkles: SparklesIcon,
  sun: Sun01Icon,
  moon: Moon01Icon,
  monitor: ComputerIcon,
  'alert-circle': AlertCircleIcon,
  'check-circle': CheckmarkCircle01Icon,
  tool: ToolsIcon,
  offline: NoInternetIcon,
  more: More01Icon,
  brain: AiBrain01Icon,
  play: PlayIcon,
  pause: PauseIcon,
  bell: Notification01Icon,
  download: Download01Icon,
};

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const Glyph = ICONS[name];
  return <Glyph size={size} className={className} aria-hidden="true" />;
}
