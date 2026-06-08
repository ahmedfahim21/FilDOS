"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useFileUpload } from "@/hooks/useFileUpload";
import { classifyFile } from "@/utils/fileClassification";
import { 
  Upload, 
  File, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  Lock,
  Minus
} from "lucide-react";
import { useConnection } from "wagmi";
import { useModal } from "@/providers/ModalProvider";
import { config } from "@/config";

interface UploadModalProps {
  folderId: string;
  modalId: string;
}

export default function UploadModal({ folderId, modalId }: UploadModalProps) {
  const [targetFolderId] = useState(folderId);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [encryptFile, setEncryptFile] = useState(false);
  const { isConnected } = useConnection();
  const { minimizeModal, updateModalMetadata } = useModal();

  const { 
    uploadFileMutation, 
    uploadedInfo, 
    handleReset, 
    status, 
    progress,
    isAddingToContract,
    contractAddError,
  } = useFileUpload(targetFolderId);

  const { isPending: isLoading, mutateAsync: uploadFile } = uploadFileMutation;

  // Update modal metadata for minimized state
  useEffect(() => {
    const isWorking = isLoading || isAddingToContract;
    
    updateModalMetadata(modalId, {
      title: file ? `Uploading ${file.name}` : "Upload File",
      progress: isWorking ? progress : undefined,
      status: isWorking 
        ? (isAddingToContract ? "Finalizing..." : "Uploading...") 
        : (uploadedInfo ? "Complete" : undefined),
      preventClose: isWorking,
    });
  }, [modalId, file, isLoading, isAddingToContract, progress, uploadedInfo, updateModalMetadata]);

  // Get preview tags for the current file
  const previewTags = file ? classifyFile(file) : [];

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setFile(files[0]);
    }
  }, []);

  if (!mounted || !isConnected) {
    return null;
  }

  return (
    <div className="w-full">
      <div className="flex items-start justify-between mb-4 pr-8">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl flex items-center gap-2 leading-none font-medium">
            <Upload className="h-5 w-5 sm:h-6 sm:w-6" />
            Upload File
          </h2>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => minimizeModal(modalId)} 
          className="h-8 w-8 shrink-0"
        >
          <Minus className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4 sm:space-y-6">
          <Card className={`border border-dashed cursor-pointer transition-all duration-200 ${
            isDragging
              ? "border-primary bg-primary/5 shadow-lg"
              : file
                ? "border-secondary bg-secondary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}>
            <CardContent
              className="p-4 sm:p-8 text-center overflow-hidden"
              onDragEnter={handleDragIn}
              onDragLeave={handleDragOut}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById("fileInput")?.click()}
            >
              <input
                id="fileInput"
                type="file"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setFile(e.target.files[0]);
                  }
                  e.target.value = "";
                }}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-3 sm:gap-4">
                {file ? (
                  <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 bg-secondary/50 rounded-full">
                    <File className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                    <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                ) : (
                  <div className={`p-3 sm:p-4 rounded-full ${
                    isDragging ? "bg-primary/10" : "bg-muted"
                  }`}>
                    <Upload className={`h-6 w-6 sm:h-8 sm:w-8 ${
                      isDragging ? "text-primary" : "text-muted-foreground"
                    }`} />
                  </div>
                )}
                
                <div className="space-y-2 w-full max-w-full">
                  <p className="text-base sm:text-lg font-medium break-all px-4 line-clamp-3">
                    {file ? file.name : "Drop your file here"}
                  </p>
                  {!file && (
                    <>
                      <p className="text-sm sm:text-base text-muted-foreground">
                        or click to browse your files
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Supports all file types
                      </p>
                    </>
                  )}
                  {file && (
                    <div className="space-y-2">
                      <Badge variant="secondary" className="text-xs">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </Badge>
                      {previewTags.length > 0 && (
                        <div className="space-y-1 mx-auto">
                          <p className="text-xs text-muted-foreground">Auto-tags:</p>
                          <div className="flex flex-wrap gap-1 justify-center">
                            {previewTags.map((tag: string, index: number) => {
                              const getTagVariant = (tag: string) => {
                                if (['images', 'design'].includes(tag)) return 'default';
                                if (['videos', 'audio'].includes(tag)) return 'secondary';
                                if (['documents', 'spreadsheets', 'presentations', 'markup'].includes(tag)) return 'outline';
                                if (['code', 'web', 'notebooks', 'databases'].includes(tag)) return 'destructive';
                                if (['archives', 'binary', 'applications'].includes(tag)) return 'default';
                                if (['embeds'].includes(tag)) return 'secondary';
                                return 'outline';
                              };
                              
                              return (
                                <Badge 
                                  key={index} 
                                  variant={getTagVariant(tag)}
                                  className="text-xs px-2 py-0.5"
                                >
                                  {tag}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Encryption Option — hidden while Lit Protocol migration to
              Chipotle is pending. Re-enabled via config.encryptionEnabled. */}
          {config.encryptionEnabled && file && !uploadedInfo && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-start py-2 gap-2 sm:gap-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <Label
                  htmlFor="encrypt"
                  className="text-sm font-base cursor-pointer"
                >
                  Encrypt
                </Label>
                <Switch
                  id="encrypt"
                  checked={encryptFile}
                  onCheckedChange={setEncryptFile}
                  disabled={isLoading || isAddingToContract}
                />
              </div>
              <p className="text-xs text-muted-foreground font-light">
                using Lit Protocol for enhanced privacy
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button
              onClick={async () => {
                if (!file) return;
                await uploadFile({ file, encrypt: encryptFile });
              }}
              disabled={!file || isLoading || isAddingToContract || (!!uploadedInfo && !contractAddError)}
              size="lg"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : isAddingToContract ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Adding to folder...
                </>
              ) : uploadedInfo && !contractAddError ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Complete
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload File
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                handleReset();
                setFile(null);
                setEncryptFile(false);
              }}
              disabled={!file || isLoading || isAddingToContract}
              size="lg"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>

          {/* Status and Progress */}
          {(status || isAddingToContract || contractAddError) && (
            <div className="space-y-2">
              {(isLoading || isAddingToContract) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs sm:text-sm gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <RefreshCw className="h-3 w-3 text-primary animate-spin shrink-0" />
                      <span className="text-foreground font-base truncate">
                        {isAddingToContract 
                          ? "Adding file to folder..." 
                          : status?.replace(/[❌✅🎉]/g, '').trim()
                        }
                      </span>
                    </div>
                    <span className="text-muted-foreground shrink-0">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}
              {!isLoading && !isAddingToContract && (contractAddError || status) && (
                <div className="flex items-center gap-2 text-xs sm:text-sm">
                  {contractAddError || status?.includes("failed") || status?.includes("error") ? (
                    <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-secondary shrink-0" />
                  )}
                  <span 
                    className={`${contractAddError || status?.includes("failed") || status?.includes("error") ? "text-destructive" : "text-foreground"} line-clamp-2`}
                    title={contractAddError || status}
                  >
                    {(contractAddError || status)?.length > 150 
                      ? `${(contractAddError || status)?.slice(0, 150)}...` 
                      : (contractAddError || status)}
                  </span>
                </div>
              )}
            </div>
          )}
          {/* Upload Success Details */}
          {uploadedInfo && !isLoading && !isAddingToContract && !contractAddError && (
            <div className="space-y-3 p-3 sm:p-4 border rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-secondary" />
                <p className="text-xs sm:text-sm font-base">
                  Upload Complete
                </p>
              </div>
              
              <div className="grid gap-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">File:</span>
                  <span className="font-base truncate text-right max-w-[180px] sm:max-w-[200px]">{uploadedInfo.fileName}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Size:</span>
                  <span className="font-base">{(uploadedInfo.fileSize! / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">CommP:</span>
                  <span className="font-mono text-[10px] truncate">{uploadedInfo.pieceCid?.slice(0,16)}...</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">TX Hash:</span>
                  <span className="font-mono text-[10px] truncate">{uploadedInfo.txHash?.slice(0, 16)}...</span>
                </div>
                {uploadedInfo.encrypted && (
                  <div className="flex items-center justify-between pt-2 border-t gap-2">
                    <div className="flex items-center gap-1.5">
                      <Lock className="h-3 w-3 text-primary" />
                      <span className="text-primary font-base text-xs">Encrypted</span>
                    </div>
                    <span className="text-muted-foreground text-xs">Lit Protocol</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
    </div>
  );
}
