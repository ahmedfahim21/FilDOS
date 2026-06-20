import type { Entry } from '@shared/types';
import audio from '@/assets/file-icons/audio.svg';
import document from '@/assets/file-icons/document.svg';
import folder from '@/assets/file-icons/folder.svg';
import image from '@/assets/file-icons/image.svg';
import other from '@/assets/file-icons/others.svg';
import pdf from '@/assets/file-icons/pdf.svg';
import presentation from '@/assets/file-icons/presentation.svg';
import spreadsheet from '@/assets/file-icons/spreadsheet.svg';
import video from '@/assets/file-icons/video.svg';

/**
 * Maps a lowercase file extension to one of the FilDOS brand type icons
 * (line-style, Azure-tinted, matching the node-grid mark motif). Ported from
 * the web app's fileClassification.ts, minus the Google-Drive/upload-only bits.
 */
const BY_EXT: Record<string, string> = {
  // images & design
  jpg: image,
  jpeg: image,
  png: image,
  gif: image,
  svg: image,
  bmp: image,
  webp: image,
  ico: image,
  tiff: image,
  tif: image,
  heic: image,
  ai: image,
  eps: image,
  psd: image,
  sketch: image,
  fig: image,
  xd: image,
  // video
  mp4: video,
  avi: video,
  mov: video,
  mkv: video,
  wmv: video,
  flv: video,
  webm: video,
  m4v: video,
  '3gp': video,
  ogv: video,
  // audio
  mp3: audio,
  wav: audio,
  flac: audio,
  ogg: audio,
  aac: audio,
  wma: audio,
  m4a: audio,
  // pdf
  pdf,
  // documents & markup
  doc: document,
  docx: document,
  txt: document,
  md: document,
  rtf: document,
  odt: document,
  pages: document,
  markdown: document,
  rst: document,
  tex: document,
  // spreadsheets
  xls: spreadsheet,
  xlsx: spreadsheet,
  csv: spreadsheet,
  ods: spreadsheet,
  numbers: spreadsheet,
  // presentations
  ppt: presentation,
  pptx: presentation,
  odp: presentation,
  key: presentation,
};

/**
 * The custom type-logo image URL to show for an entry that has no live
 * thumbnail preview (folders, and any file we can't or haven't rendered).
 */
export function fileLogo(entry: Entry): string {
  if (entry.isDirectory) return folder;
  return BY_EXT[entry.ext] ?? other;
}
