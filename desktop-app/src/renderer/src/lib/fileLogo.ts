import type { Entry } from '@shared/types';
import audio from '@/assets/logos/audio.png';
import document from '@/assets/logos/document.png';
import folder from '@/assets/logos/folder.png';
import image from '@/assets/logos/image.png';
import other from '@/assets/logos/other.png';
import pdf from '@/assets/logos/pdf.png';
import presentation from '@/assets/logos/presentation.png';
import spreadsheet from '@/assets/logos/spreadsheet.png';
import video from '@/assets/logos/video.png';

/**
 * Maps a lowercase file extension to one of the shared FilDOS type logos
 * (the same artwork the web app uses). Ported from the web app's
 * fileClassification.ts, minus the Google-Drive/upload-only bits.
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
