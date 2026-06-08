"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import Image from 'next/image';
import { 
  Download, 
  Eye, 
  AlertCircle, 
  Loader2,
  ExternalLink,
  Unlock,
  LockKeyhole,
  Key
} from 'lucide-react';
import { useFileDecryption } from '@/hooks/useFileDecryption';
import { useFiles } from '@/hooks/useContract';
import { FileItem, FileEntry } from '@/types';
import { Badge } from './ui/badge';
import { useConnection } from 'wagmi';
import { getFileLogo } from '@/utils/fileClassification';

interface FilePreviewModalProps {
  file: FileItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function FilePreviewModal({ isOpen, onClose, file }: FilePreviewModalProps) {
  const { address } = useConnection();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string>('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedFile, setDecryptedFile] = useState<File | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [fileMetadata, setFileMetadata] = useState<FileEntry | null>(null);
  
  const { decryptFileMutation, progress: decryptProgress } = useFileDecryption();
  const { data: folderFiles } = useFiles(
    file?.tokenId || "",
    !!file?.tokenId && isOpen
  );

  useEffect(() => {
    if (folderFiles && file?.cid) {
      const metadata = folderFiles.find((f: FileEntry) => f.cid === file.cid);
      if (metadata) {
        setFileMetadata(metadata);
      } else {
        setFileMetadata(null);
      }
    } else if (!folderFiles) {
      setFileMetadata(null);
    }
  }, [folderFiles, file?.cid]);

  const lastLoadKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const currentCid = file?.cid;
    if (currentCid) {
      setFileContent(null);
      setPreviewUrl(null);
      setError(null);
      setIsLoading(false);
      setFileType('');
      setIsDecrypting(false);
      setDecryptedFile(null);
      setImageLoadError(false);
      lastLoadKeyRef.current = null;
    }
  }, [file?.cid]);

  useEffect(() => {
    if (!isOpen) {
      setFileContent(null);
      setPreviewUrl(null);
      setError(null);
      setIsLoading(false);
      setFileType('');
      setIsDecrypting(false);
      setDecryptedFile(null);
      setImageLoadError(false);
      setFileMetadata(null);
      lastLoadKeyRef.current = null;
    }
  }, [isOpen]);

  const getContentType = useCallback((fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const extensionMap: Record<string, string> = {
      txt: 'text/plain',
      json: 'application/json',
      md: 'text/markdown',
      csv: 'text/csv',
      js: 'text/javascript',
      ts: 'text/typescript',
      html: 'text/html',
      css: 'text/css',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      mp4: 'video/mp4',
      webm: 'video/webm',
      avi: 'video/avi',
      mov: 'video/quicktime',
      pdf: 'application/pdf'
    };
    return extensionMap[extension] || 'application/octet-stream';
  }, []);

  const fetchAndProcessFile = useCallback(async () => {
    if (!file?.cid || !address) return;

    setIsLoading(true);
    setError(null);

    let timeoutId: NodeJS.Timeout | null = null;

    try {
      const fileUrl = `https://${file.owner}.calibration.filbeam.io/${file.cid}`;
      
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 30000); // Increased timeout to 30s
      
      const response = await fetch(fileUrl, {
        method: 'GET',
        cache: 'no-cache',
        headers: { 'Accept': '*/*' },
        signal: controller.signal
      });

      // Clear timeout on successful fetch
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = getContentType(file.name);
      setFileType(contentType);

      if (contentType.startsWith('text/') || contentType === 'application/json') {
        const text = await response.text();
        setFileContent(text);
      } else if (contentType.startsWith('image/') || contentType.startsWith('video/')) {
        setPreviewUrl(fileUrl);
      }

    } catch (error) {
      console.error('Error processing file:', error);
      
      let errorMessage = 'Failed to load file';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out. Please try again.';
        } else if (error.message.includes('fetch') || error.message.includes('CORS')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
    } finally {
      // Clean up timeout if it still exists
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setIsLoading(false);
    }
  }, [file, address, getContentType]);

  const handleDecryptAndPreview = useCallback(async () => {
    if (!file?.encrypted) return;
    if (!address) {
      setError('Please connect your wallet to decrypt this file.');
      return;
    }
    
    // Check if we have metadata from contract
    if (!fileMetadata) {
      setError('File metadata not available. Unable to decrypt.');
      return;
    }
    
    if (!fileMetadata.dataToEncryptHash) {
      setError('File encryption data missing. Unable to decrypt.');
      return;
    }
    
    setIsDecrypting(true);
    setError(null);
    
    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      // Fetch encrypted file from Filecoin
      const fileUrl = `https://${file.owner}.calibration.filbeam.io/${file.cid}`;
      
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 30000); // Increased timeout to 30s
      
      const response = await fetch(fileUrl, {
        method: 'GET',
        cache: 'no-cache',
        headers: { 'Accept': '*/*' },
        signal: controller.signal
      });
      
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Fetch the raw ciphertext directly from the endpoint
      const ciphertext = await response.text();
      
      // Use metadata from contract for decryption
      const originalFileName = fileMetadata.filename;
      const originalFileType = fileMetadata.fileType || 'application/octet-stream';
      
      const tokenId = file.tokenId;
      if (!tokenId) {
        setError('File tokenId missing. Unable to decrypt.');
        return;
      }

      const decrypted = await decryptFileMutation.mutateAsync({
        ciphertext: ciphertext,
        dataToEncryptHash: fileMetadata.dataToEncryptHash,
        metadata: {
          originalFileName: originalFileName,
          originalFileSize: 0, // We don't have this in contract
          originalFileType: originalFileType,
        },
        tokenId: tokenId,
      });
      
      setDecryptedFile(decrypted);
      
      // Generate preview for decrypted file
      const contentType = originalFileType;
      setFileType(contentType);
      
      if (contentType.startsWith('text/') || contentType === 'application/json') {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          setFileContent(text);
        };
        reader.onerror = (e) => {
          console.error('FileReader error:', e);
        };
        reader.readAsText(decrypted);
      } else if (contentType.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          setPreviewUrl(dataUrl);
        };
        reader.onerror = (e) => {
          console.error('FileReader error:', e);
        };
        reader.readAsDataURL(decrypted);
      } else if (contentType.startsWith('video/')) {
        const url = URL.createObjectURL(decrypted);
        setPreviewUrl(url);
      } else {
        console.log('No preview handler for content type:', contentType);
      }
      
    } catch (error) {
      console.error('Decryption error:', error);
      
      let errorMessage = 'Failed to decrypt file';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Request timed out. Please try again.';
        } else if (error.message.includes('not authorized') || error.message.includes('access')) {
          errorMessage = 'You do not have permission to decrypt this file.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setError(errorMessage);
    } finally {
      // Clean up timeout if it still exists
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      setIsDecrypting(false);
    }
  }, [file, address, decryptFileMutation, fileMetadata]);

  const handleRetry = useCallback(() => {
    setError(null);
    if (file?.encrypted && fileMetadata) {
      handleDecryptAndPreview();
    } else {
      fetchAndProcessFile();
    }
  }, [fetchAndProcessFile, handleDecryptAndPreview, file, fileMetadata]);

  const handleDownload = useCallback(() => {
    if (file?.cid) {
      // If file is decrypted, download the decrypted version
      if (decryptedFile) {
        const url = URL.createObjectURL(decryptedFile);
        const link = document.createElement('a');
        link.href = url;
        link.download = decryptedFile.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        // Download original file
          const fileUrl = `https://${file.owner}.calibration.filbeam.io/${file.cid}`;
          const link = document.createElement('a');
        link.href = fileUrl;
          link.download = file.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
    }
  }, [file, decryptedFile]);

  const handleOpenExternal = useCallback(() => {
    if (file?.cid) {
      const fileUrl = `https://${file.owner}.calibration.filcdn.io/${file.cid}`;
      window.open(fileUrl, '_blank');
    }
  }, [file]);

  // Cleanup any blob URLs when preview changes/unmounts
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Reset guard when modal closes
  useEffect(() => {
    if (!isOpen) {
      lastLoadKeyRef.current = null;
    }
  }, [isOpen]);

  // Derive a stable key for the current load intent
  const loadKey = useMemo(() => {
    if (!file) return null;
    return `${file.cid}:${file.encrypted ? 'enc' : 'plain'}:${address || 'noaddr'}:${file.type}`;
  }, [file, address]);

  // Stable trigger that uses latest handlers without violating exhaustive-deps
  const triggerLoadRef = useRef<() => void>(() => {});
  useEffect(() => {
    triggerLoadRef.current = () => {
      if (!file) return;
      // Only auto-load non-encrypted files
      // For encrypted files, user must click decrypt button
      if (!file.encrypted) {
        fetchAndProcessFile();
      }
    };
  }, [file, fetchAndProcessFile]);

  // Load file when modal opens (avoid loops by keying the action)
  useEffect(() => {
    if (!isOpen || !file || file.type === 'folder' || !loadKey) return;
    if (lastLoadKeyRef.current === loadKey) return; // already attempted for this key
    lastLoadKeyRef.current = loadKey;
    triggerLoadRef.current();
  }, [isOpen, loadKey, file]);

  if (!file) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image 
              src={getFileLogo(file.name)} 
              alt="file icon" 
              width={16} 
              height={16}
              className="text-gray-600 sm:w-5 sm:h-5 shrink-0"
            />
            <span className="break-all line-clamp-2 text-sm sm:text-base">{file.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 sm:space-y-4">
          {/* Decryption Progress */}
          {isDecrypting && (
            <div className="p-2 sm:p-3 border rounded-lg bg-primary/5 border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin text-primary shrink-0" />
                <span className="text-xs sm:text-sm text-foreground">Decrypting file...</span>
              </div>
              <Progress value={decryptProgress} className="h-1" />
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <Card className="p-6 sm:p-8 text-center">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin mx-auto mb-3 sm:mb-4 text-primary" />
              <p className="text-sm sm:text-base text-muted-foreground">Loading file...</p>
            </Card>
          )}

          {/* Error State - Compact */}
          {error && (
            <div className="p-3 sm:p-4 border border-destructive/20 rounded-lg bg-destructive/10">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm sm:text-base text-destructive wrap-break font-medium mb-1">{error}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button 
                    onClick={handleRetry} 
                    variant="ghost" 
                    size="sm"
                    className="h-8 px-3 text-xs"
                  >
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* File Preview - Only show when content is available */}
          {!isLoading && !error && !isDecrypting && (fileContent || previewUrl || decryptedFile) && (
            <Card className="p-0 overflow-hidden">
              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 sm:p-3 border-b bg-muted/30">
                {/* Decrypted Badge */}
                {decryptedFile && (
                  <Badge variant="outline" className="text-xs">
                    <Key className="h-3 w-3 text-primary shrink-0" />
                    <span className="font-medium text-primary">Decrypted</span>
                  </Badge>
                )}
                {!decryptedFile && <div className="hidden sm:block" />}
                
                {/* Action Buttons */}
                <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto">
                  <Button onClick={handleDownload} variant="ghost" size="sm" className="h-7 sm:h-8 text-xs flex-1 sm:flex-none">
                    <Download className="w-3 h-3 sm:mr-1" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                  {!file.encrypted && (
                    <Button onClick={handleOpenExternal} variant="ghost" size="sm" className="h-7 sm:h-8 text-xs flex-1 sm:flex-none">
                      <ExternalLink className="w-3 h-3 sm:mr-1" />
                      <span className="hidden sm:inline">Open</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Text Content */}
              {fileContent && (
                <div className="p-3 sm:p-4 max-h-[400px] sm:max-h-[500px] overflow-y-auto">
                  <pre className="text-[10px] sm:text-xs text-foreground whitespace-pre-wrap wrap-break font-mono">
                    {fileContent}
                  </pre>
                </div>
              )}

              {/* Image Preview */}
              {previewUrl && fileType.startsWith('image/') && !imageLoadError && (
                <div className="p-3 sm:p-4 bg-muted/30">
                  <div className="relative w-full flex justify-center">
                    <Image
                      src={previewUrl}
                      alt={file.name}
                      width={800}
                      height={600}
                      className="object-contain rounded max-h-[400px] sm:max-h-[500px] w-full"
                      style={{ maxHeight: '500px' }}
                      unoptimized
                      onError={() => setImageLoadError(true)}
                      loader={previewUrl.startsWith('blob:') || previewUrl.startsWith('data:') ? ({ src }) => src : undefined}
                    />
                  </div>
                </div>
              )}

              {/* Video Preview */}
              {previewUrl && fileType.startsWith('video/') && (
                <div className="p-3 sm:p-4 bg-muted/30">
                  <video 
                    controls 
                    className="max-w-full max-h-[400px] sm:max-h-[500px] rounded mx-auto"
                    src={previewUrl}
                  >
                    Your browser does not support video playback.
                  </video>
                </div>
              )}

              {/* Audio Preview */}
              {previewUrl && fileType.startsWith('audio/') && (
                <div className="p-3 sm:p-4">
                  <audio 
                    controls 
                    className="w-full"
                    src={previewUrl}
                  >
                    Your browser does not support audio playback.
                  </audio>
                </div>
              )}

              {/* PDF Preview */}
              {previewUrl && fileType === 'application/pdf' && (
                <div className="p-3 sm:p-4 bg-muted/30">
                  <iframe
                    src={previewUrl}
                    className="w-full h-[400px] sm:h-[500px] rounded border"
                    title={file.name}
                  />
                </div>
              )}
            </Card>
          )}

          {/* No Preview Available - Only show when decrypted but no preview */}
          {!isLoading && !error && !isDecrypting && decryptedFile && !fileContent && !previewUrl && (
            <div className="p-6 sm:p-8 border rounded-lg text-center bg-muted/30">
              <Eye className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs sm:text-sm text-muted-foreground mb-3">Preview not available</p>
              <Button onClick={handleDownload} size="sm" className="text-xs sm:text-sm">
                <Download className="w-3 h-3 mr-1" />
                Download
              </Button>
            </div>
          )}

          {/* Waiting for Decrypt - Show when encrypted and not decrypted yet */}
          {!isLoading && !error && !isDecrypting && file.encrypted && !decryptedFile && (
            <Card className="p-8 sm:p-12 text-center border-primary/20 bg-primary/5">
              <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-primary/10 mb-3 sm:mb-4">
                <LockKeyhole className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
              </div>
              <h3 className="text-base sm:text-lg font-base mb-2">Encrypted File</h3>
              <p className="text-xs font-light text-muted-foreground mb-4 sm:mb-6 max-w-md mx-auto px-4">
                This file is encrypted with Lit Protocol. Decrypt it to view the contents.
              </p>
              <Button 
                onClick={handleDecryptAndPreview} 
                disabled={!address}
                size="lg"
                className="gap-2 text-sm"
              >
                <Unlock className="w-4 h-4" />
                Decrypt & Preview
              </Button>
              {!address && (
                <p className="text-xs text-muted-foreground mt-3">
                  Please connect your wallet to decrypt
                </p>
              )}
            </Card>
          )}

          {/* Connect Wallet Prompt */}
          {!address && (
            <Card className="p-4 sm:p-6 text-center bg-amber-50 border-amber-200">
              <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500 mx-auto mb-2" />
              <h4 className="text-sm sm:text-base font-medium text-amber-800">Wallet Required</h4>
              <p className="text-xs sm:text-sm text-amber-700 mt-1">
                Please connect your wallet to view files.
              </p>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FilePreviewModal;
