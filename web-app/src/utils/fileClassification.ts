/**
 * Utility functions for file classification, type detection, and logo retrieval
 */

import { FileItem } from "@/types";

// File category configuration
const FILE_CATEGORIES = {
  image: {
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp', 'webp', 'ico', 'tiff', 'tif'],
    logo: '/logos/image.png',
    type: 'image' as FileItem['type'],
    tags: ['images'],
  },
  video: {
    extensions: ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v', '3gp', 'ogv'],
    logo: '/logos/video.png',
    type: 'video' as FileItem['type'],
    tags: ['videos'],
  },
  audio: {
    extensions: ['mp3', 'wav', 'flac', 'ogg', 'aac', 'wma', 'm4a'],
    logo: '/logos/audio.png',
    type: 'audio' as FileItem['type'],
    tags: ['audio'],
  },
  pdf: {
    extensions: ['pdf'],
    logo: '/logos/pdf.png',
    type: 'pdf' as FileItem['type'],
    tags: ['documents'],
  },
  document: {
    extensions: ['doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'pages'],
    logo: '/logos/document.png',
    type: 'document' as FileItem['type'],
    tags: ['documents'],
  },
  spreadsheet: {
    extensions: ['xls', 'xlsx', 'csv', 'ods', 'numbers'],
    logo: '/logos/excel.png',
    type: 'spreadsheet' as FileItem['type'],
    tags: ['spreadsheets', 'documents'],
  },
  presentation: {
    extensions: ['ppt', 'pptx', 'odp', 'key'],
    logo: '/logos/ppt.png',
    type: 'presentation' as FileItem['type'],
    tags: ['presentations', 'documents'],
  },
  archive: {
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'cab', 'ace'],
    logo: '/logos/other.png',
    type: 'other' as FileItem['type'],
    tags: ['archives'],
  },
  web: {
    extensions: ['html', 'htm', 'js', 'css', 'json', 'xml', 'yaml', 'yml'],
    logo: '/logos/other.png',
    type: 'other' as FileItem['type'],
    tags: ['web', 'code'],
  },
  embed: {
    extensions: ['swf', 'fla', 'flv'],
    logo: '/logos/other.png',
    type: 'other' as FileItem['type'],
    tags: ['embeds'],
  },
  code: {
    extensions: ['pkl'],
    logo: '/logos/other.png',
    type: 'other' as FileItem['type'],
    tags: ['code'],
  },
  markup: {
    extensions: ['markdown', 'rst', 'tex'],
    logo: '/logos/document.png',
    type: 'document' as FileItem['type'],
    tags: ['markup', 'documents'],
  },
  design: {
    extensions: ['ai', 'eps', 'psd', 'sketch', 'fig', 'xd'],
    logo: '/logos/image.png',
    type: 'image' as FileItem['type'],
    tags: ['design', 'images'],
  },
  model3d: {
    extensions: ['blend', 'fbx', 'obj', 'dae', '3ds', 'max', 'maya'],
    logo: '/logos/other.png',
    type: 'other' as FileItem['type'],
    tags: ['3d-models'],
  },
  font: {
    extensions: ['ttf', 'otf', 'woff', 'woff2', 'eot'],
    logo: '/logos/other.png',
    type: 'other' as FileItem['type'],
    tags: ['fonts'],
  },
  application: {
    extensions: ['apk', 'ipa', 'exe', 'msi', 'deb', 'rpm', 'pkg'],
    logo: '/logos/other.png',
    type: 'other' as FileItem['type'],
    tags: ['applications'],
  },
  notebook: {
    extensions: ['ipynb', 'rmd', 'qmd'],
    logo: '/logos/other.png',
    type: 'other' as FileItem['type'],
    tags: ['notebooks', 'code'],
  },
  database: {
    extensions: ['db', 'sqlite', 'sql', 'mdb'],
    logo: '/logos/other.png',
    type: 'other' as FileItem['type'],
    tags: ['databases'],
  },
  binary: {
    extensions: ['bin', 'dat', 'dump', 'img', 'iso', 'dmg'],
    logo: '/logos/other.png',
    type: 'other' as FileItem['type'],
    tags: ['binary'],
  },
} as const;

/**
 * Helper to extract file extension
 */
const getExtension = (filename: string): string => {
  return filename.split('.').pop()?.toLowerCase() || '';
};

/**
 * Helper to find category by extension
 */
const findCategoryByExtension = (extension: string) => {
  return Object.entries(FILE_CATEGORIES).find(([, category]) =>
    (category.extensions as readonly string[]).includes(extension)
  );
};

/**
 * Gets the appropriate logo path for a file based on its extension
 */
export const getFileLogo = (fileName: string): string => {
  const extension = getExtension(fileName);
  const categoryEntry = findCategoryByExtension(extension);
  return categoryEntry ? categoryEntry[1].logo : '/logos/other.png';
};

/**
 * Gets the FileItem type based on file extension
 */
export const getFileTypeFromExtension = (filename: string): FileItem['type'] => {
  const extension = getExtension(filename);
  const categoryEntry = findCategoryByExtension(extension);
  return categoryEntry ? categoryEntry[1].type : 'other';
};

/**
 * Classifies a file based on its name, extension, and MIME type.
 * Returns an array of tags that categorize the file.
 */
export const classifyFile = (file: File): string[] => {
  const fileExtension = getExtension(file.name.toLowerCase());
  const fileType = file.type.toLowerCase();
  
  const tags: string[] = [];
  
  // Add file extension as a tag
  if (fileExtension) {
    tags.push(fileExtension);
  }
  
  // Find category by extension and add tags
  const categoryEntry = findCategoryByExtension(fileExtension);
  if (categoryEntry) {
    tags.push(...categoryEntry[1].tags);
  } else {
    // Check MIME type if extension doesn't match
    if (fileType.startsWith('image/')) {
      tags.push('images');
    } else if (fileType.startsWith('video/')) {
      tags.push('videos');
    } else if (fileType.startsWith('audio/')) {
      tags.push('audio');
    } else {
      tags.push('other');
    }
  }
  
  // Add MIME type-specific tags
  if (fileType.includes('application/json')) {
    tags.push('data');
  } else if (fileType.includes('application/octet-stream')) {
    tags.push('binary');
  }
  
  // Add file size category
  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB < 1) {
    tags.push('small');
  } else if (fileSizeMB < 10) {
    tags.push('medium');
  } else if (fileSizeMB < 100) {
    tags.push('large');
  } else {
    tags.push('xlarge');
  }
  
  // Remove duplicates and return
  return [...new Set(tags)];
};
