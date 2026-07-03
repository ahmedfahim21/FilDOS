import type { Entry } from '@shared/types';
import threeD from '@/assets/file-icons/3d-model.svg';
import archive from '@/assets/file-icons/archive.svg';
import audio from '@/assets/file-icons/audio.svg';
import calendar from '@/assets/file-icons/calendar.svg';
import certificate from '@/assets/file-icons/certificate.svg';
import code from '@/assets/file-icons/code.svg';
import database from '@/assets/file-icons/database.svg';
import diskImage from '@/assets/file-icons/disk-image.svg';
import docker from '@/assets/file-icons/docker.svg';
import document from '@/assets/file-icons/document.svg';
import ebook from '@/assets/file-icons/ebook.svg';
import env from '@/assets/file-icons/env-secrets.svg';
import executable from '@/assets/file-icons/executable.svg';
import folderStrawberry from '@/assets/file-icons/folder-strawberry.svg';
import folderBubblegum from '@/assets/file-icons/folder-bubblegum.svg';
import folderMango from '@/assets/file-icons/folder-mango.svg';
import folderBlueberry from '@/assets/file-icons/folder-blueberry.svg';
import folderMint from '@/assets/file-icons/folder-mint.svg';
import folderGrape from '@/assets/file-icons/folder-grape.svg';
import font from '@/assets/file-icons/font.svg';
import git from '@/assets/file-icons/git.svg';
import image from '@/assets/file-icons/image.svg';
import langC from '@/assets/file-icons/lang-c.svg';
import langCpp from '@/assets/file-icons/lang-cplusplus.svg';
import langCsharp from '@/assets/file-icons/lang-csharp.svg';
import langCss from '@/assets/file-icons/lang-css.svg';
import langDart from '@/assets/file-icons/lang-dart.svg';
import langElixir from '@/assets/file-icons/lang-elixir.svg';
import langGo from '@/assets/file-icons/lang-go.svg';
import langGraphql from '@/assets/file-icons/lang-graphql.svg';
import langHaskell from '@/assets/file-icons/lang-haskell.svg';
import langHtml from '@/assets/file-icons/lang-html.svg';
import langJava from '@/assets/file-icons/lang-java.svg';
import langJavascript from '@/assets/file-icons/lang-javascript.svg';
import langJson from '@/assets/file-icons/lang-json.svg';
import langKotlin from '@/assets/file-icons/lang-kotlin.svg';
import langLua from '@/assets/file-icons/lang-lua.svg';
import langMarkdown from '@/assets/file-icons/lang-markdown.svg';
import langPerl from '@/assets/file-icons/lang-perl.svg';
import langPhp from '@/assets/file-icons/lang-php.svg';
import langPowershell from '@/assets/file-icons/lang-powershell.svg';
import langPython from '@/assets/file-icons/lang-python.svg';
import langR from '@/assets/file-icons/lang-r.svg';
import langReact from '@/assets/file-icons/lang-react.svg';
import langRuby from '@/assets/file-icons/lang-ruby.svg';
import langRust from '@/assets/file-icons/lang-rust.svg';
import langSass from '@/assets/file-icons/lang-sass.svg';
import langScala from '@/assets/file-icons/lang-scala.svg';
import langShell from '@/assets/file-icons/lang-shell.svg';
import langSolidity from '@/assets/file-icons/lang-solidity.svg';
import langSql from '@/assets/file-icons/lang-sql.svg';
import langSwift from '@/assets/file-icons/lang-swift.svg';
import langTypescript from '@/assets/file-icons/lang-typescript.svg';
import langVue from '@/assets/file-icons/lang-vue.svg';
import langXml from '@/assets/file-icons/lang-xml.svg';
import langYaml from '@/assets/file-icons/lang-yaml.svg';
import lockfile from '@/assets/file-icons/lockfile.svg';
import log from '@/assets/file-icons/log.svg';
import others from '@/assets/file-icons/others.svg';
import pkg from '@/assets/file-icons/package.svg';
import pdf from '@/assets/file-icons/pdf.svg';
import presentation from '@/assets/file-icons/presentation.svg';
import settings from '@/assets/file-icons/settings.svg';
import spreadsheet from '@/assets/file-icons/spreadsheet.svg';
import terminal from '@/assets/file-icons/terminal.svg';
import text from '@/assets/file-icons/text.svg';
import unknown from '@/assets/file-icons/unknown.svg';
import vector from '@/assets/file-icons/vector.svg';
import video from '@/assets/file-icons/video.svg';

/**
 * Maps a lowercase file extension to one of the FilDOS file-type icons
 * (a shared folded-sheet silhouette; the corner tag and glyph take each
 * type's own accent colour — see .claude/brand-guidelines.md). A few
 * extensionless files (Dockerfile, .gitignore, …) are recognised by name in
 * {@link BY_NAME} before the extension lookup.
 */
const BY_EXT: Record<string, string> = {
  // raster images (these also get a live thumbnail — see canPreview)
  jpg: image,
  jpeg: image,
  png: image,
  gif: image,
  bmp: image,
  webp: image,
  ico: image,
  tiff: image,
  tif: image,
  heic: image,
  avif: image,
  jfif: image,
  // vector & design
  svg: vector,
  ai: vector,
  eps: vector,
  cdr: vector,
  psd: vector,
  sketch: vector,
  fig: vector,
  xd: vector,
  // 3D models
  obj: threeD,
  fbx: threeD,
  stl: threeD,
  gltf: threeD,
  glb: threeD,
  '3ds': threeD,
  blend: threeD,
  dae: threeD,
  ply: threeD,
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
  mpg: video,
  mpeg: video,
  // audio
  mp3: audio,
  wav: audio,
  flac: audio,
  ogg: audio,
  aac: audio,
  wma: audio,
  m4a: audio,
  opus: audio,
  aiff: audio,
  mid: audio,
  midi: audio,
  // pdf
  pdf,
  // ebooks
  epub: ebook,
  mobi: ebook,
  azw: ebook,
  azw3: ebook,
  fb2: ebook,
  // documents
  doc: document,
  docx: document,
  rtf: document,
  odt: document,
  pages: document,
  tex: document,
  rst: document,
  // plain text
  txt: text,
  text: text,
  // markdown
  md: langMarkdown,
  markdown: langMarkdown,
  mdx: langMarkdown,
  // logs
  log,
  // spreadsheets
  xls: spreadsheet,
  xlsx: spreadsheet,
  csv: spreadsheet,
  tsv: spreadsheet,
  ods: spreadsheet,
  numbers: spreadsheet,
  // presentations
  ppt: presentation,
  pptx: presentation,
  odp: presentation,
  key: presentation,
  // archives
  zip: archive,
  rar: archive,
  '7z': archive,
  tar: archive,
  gz: archive,
  tgz: archive,
  bz2: archive,
  xz: archive,
  zst: archive,
  // disk images
  iso: diskImage,
  dmg: diskImage,
  img: diskImage,
  vhd: diskImage,
  vmdk: diskImage,
  // executables / installers / packages
  exe: executable,
  msi: executable,
  app: executable,
  bin: executable,
  com: executable,
  apk: executable,
  appimage: executable,
  deb: pkg,
  rpm: pkg,
  pkg,
  gem: pkg,
  nupkg: pkg,
  whl: pkg,
  // fonts
  ttf: font,
  otf: font,
  woff: font,
  woff2: font,
  eot: font,
  // certificates & keys
  pem: certificate,
  crt: certificate,
  cer: certificate,
  der: certificate,
  p12: certificate,
  pfx: certificate,
  // calendars
  ics: calendar,
  ical: calendar,
  // databases
  db: database,
  sqlite: database,
  sqlite3: database,
  mdb: database,
  accdb: database,
  // structured data / markup
  json: langJson,
  jsonc: langJson,
  json5: langJson,
  xml: langXml,
  xsl: langXml,
  xslt: langXml,
  plist: langXml,
  yaml: langYaml,
  yml: langYaml,
  graphql: langGraphql,
  gql: langGraphql,
  sql: langSql,
  // config & settings
  toml: settings,
  ini: settings,
  cfg: settings,
  conf: settings,
  config: settings,
  properties: settings,
  env,
  // shells / terminal scripts
  sh: langShell,
  bash: langShell,
  zsh: langShell,
  fish: langShell,
  bat: terminal,
  cmd: terminal,
  ps1: langPowershell,
  psm1: langPowershell,
  psd1: langPowershell,
  // programming languages
  c: langC,
  h: langC,
  cpp: langCpp,
  cc: langCpp,
  cxx: langCpp,
  hpp: langCpp,
  hh: langCpp,
  hxx: langCpp,
  cs: langCsharp,
  css: langCss,
  dart: langDart,
  ex: langElixir,
  exs: langElixir,
  go: langGo,
  hs: langHaskell,
  lhs: langHaskell,
  html: langHtml,
  htm: langHtml,
  xhtml: langHtml,
  java: langJava,
  class: langJava,
  jar: langJava,
  js: langJavascript,
  mjs: langJavascript,
  cjs: langJavascript,
  jsx: langReact,
  tsx: langReact,
  ts: langTypescript,
  kt: langKotlin,
  kts: langKotlin,
  lua: langLua,
  pl: langPerl,
  pm: langPerl,
  php: langPhp,
  py: langPython,
  pyw: langPython,
  pyi: langPython,
  r: langR,
  rmd: langR,
  rb: langRuby,
  rs: langRust,
  scss: langSass,
  sass: langSass,
  scala: langScala,
  sc: langScala,
  sol: langSolidity,
  swift: langSwift,
  vue: langVue,
  // misc source / generic code
  lock: lockfile,
};

/**
 * Extensionless or specially-named files matched by their full (lowercased)
 * filename before the extension lookup. Covers the common dotfiles and
 * toolchain files that carry no real extension.
 */
const BY_NAME: Record<string, string> = {
  dockerfile: docker,
  '.dockerignore': docker,
  '.gitignore': git,
  '.gitattributes': git,
  '.gitmodules': git,
  '.gitkeep': git,
  '.env': env,
  makefile: code,
  'cmakelists.txt': code,
  'package.json': pkg,
  'package-lock.json': lockfile,
  'yarn.lock': lockfile,
  'pnpm-lock.yaml': lockfile,
  'cargo.lock': lockfile,
  'gemfile.lock': lockfile,
  'poetry.lock': lockfile,
  'composer.lock': lockfile,
  license: certificate,
  'license.md': certificate,
  'license.txt': certificate,
};

const FOLDER_SCOOPS = [
  folderStrawberry,
  folderBubblegum,
  folderMango,
  folderBlueberry,
  folderMint,
  folderGrape,
] as const;

/** djb2 hash of folder name → deterministic scoop index (0-5). */
function hashFolderScoop(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = (((h << 5) + h) ^ name.charCodeAt(i)) >>> 0;
  }
  return h % FOLDER_SCOOPS.length;
}

/**
 * The custom type-logo image URL to show for an entry that has no live
 * thumbnail preview (folders, and any file we can't or haven't rendered).
 */
export function fileLogo(entry: Entry): string {
  if (entry.isDirectory) return FOLDER_SCOOPS[hashFolderScoop(entry.name)];
  const name = entry.name.toLowerCase();
  // `.env.local`, `.env.production`, … all share the env icon.
  if (name === '.env' || name.startsWith('.env.')) return env;
  const byName = BY_NAME[name];
  if (byName) return byName;
  if (entry.ext) return BY_EXT[entry.ext] ?? others;
  return unknown;
}
