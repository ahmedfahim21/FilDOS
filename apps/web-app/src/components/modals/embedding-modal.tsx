"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, Upload, Loader2, Minus } from "lucide-react";
import { useAI } from "@/hooks/useAI";
import { useModal } from "@/providers/ModalProvider";
import { FileItem } from "@/types";

interface EmbeddingModalProps {
  folderId: string;
  files: FileItem[];
  modalId: string;
}

export default function EmbeddingModal({ folderId, files, modalId }: EmbeddingModalProps) {
  const [targetFolderId] = useState(folderId);
  const [targetFiles] = useState(files);
  const [step, setStep] = useState<'check' | 'preparing' | 'embedding' | 'complete' | 'error'>('check');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const { minimizeModal, updateModalMetadata } = useModal();

  const {
    createEmbeddings,
    embeddingsProgress,
    embeddingsStatus,
    embedResult,
    embeddingsError,
    resetEmbeddings,
    isServerHealthy
  } = useAI();

  // Filter files that can be embedded (images and documents)
  const embeddableFiles = targetFiles.filter(file =>
    (file.type === 'image' || file.type === 'document' || file.type === 'pdf') && !file.encrypted
  );

  // Convert CIDs to URLs
  const fileUrls = embeddableFiles.map(file =>
    `https://${file.owner}.calibration.filcdn.io/${file.cid}`
  );

  useEffect(() => {
    const isWorking = step === 'preparing' || step === 'embedding';
    
    updateModalMetadata(modalId, {
      title: `Embedding ${embeddableFiles.length} files`,
      progress: isWorking ? embeddingsProgress : undefined,
      status: isWorking 
        ? (step === 'preparing' ? "Preparing..." : embeddingsStatus || "Creating embeddings...") 
        : (step === 'complete' ? "Complete" : step === 'error' ? "Error" : undefined),
      preventClose: isWorking,
    });
  }, [modalId, step, embeddingsProgress, embeddingsStatus, embeddableFiles.length, updateModalMetadata]);

  const handleStartEmbedding = async () => {
    if (!isServerHealthy) {
      setStep('error');
      setErrorMessage('AI server is not running. Please check the server status.');
      return;
    }

    if (embeddableFiles.length === 0) {
      setStep('error');
      setErrorMessage('No embeddable files found in this folder. Please add some images or documents first.');
      return;
    }

    setStep('preparing');
    resetEmbeddings();

    setTimeout(() => {
      setStep('embedding');
      createEmbeddings({
        fileUrls,
        collection_name: `Folder${targetFolderId}`,
      });
    }, 1000);
  };

  const handleReset = () => {
    setStep('check');
    setErrorMessage('');
    resetEmbeddings();
  };

  const getStepStatus = (currentStep: typeof step) => {
    switch (currentStep) {
      case 'check':
        return { variant: 'secondary' as const, text: 'Ready to start' };
      case 'preparing':
        return { variant: 'secondary' as const, text: 'Preparing files' };
      case 'embedding':
        return { variant: 'default' as const, text: 'Creating embeddings' };
      case 'complete':
        return { variant: 'default' as const, text: 'Complete' };
      case 'error':
        return { variant: 'destructive' as const, text: 'Error' };
      default:
        return { variant: 'secondary' as const, text: 'Unknown' };
    }
  };

  useEffect(() => {
    if (step === 'embedding') {
      if (embedResult) {
        setStep('complete');
      } else if (embeddingsError) {
        setStep('error');
        setErrorMessage(embeddingsError.message);
      }
    }
  }, [step, embedResult, embeddingsError]);

  useEffect(() => {
    if (embeddingsError) {
      setStep('error');
      setErrorMessage(embeddingsError.message);
    }
  }, [embeddingsError]);

  const stepStatus = getStepStatus(step);

  return (
    <div className="w-full">
      <div className="flex items-start justify-between mb-4 pr-8">
        <div className="space-y-1">
          <h2 className="text-lg sm:text-xl flex items-center gap-2 leading-none font-medium py-2">
            <Upload className="h-5 w-5 sm:h-6 sm:w-6" />
            Create Embeddings
          </h2>
          <p className="text-sm text-muted-foreground">
            Create AI embeddings for semantic search across your folder files
          </p>
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

      <div className="space-y-4">
        {/* Files Summary */}
        <div className="p-3 rounded-md border border-border">
          <div className="text-sm font-medium mb-2">Files to embed:</div>
          <div className="text-sm text-muted-foreground">
            {embeddableFiles.length} embeddable files out of {targetFiles.length} total files
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Supported: Images, Documents, PDFs (non-encrypted files)
          </div>
        </div>

        {/* Progress Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Progress:</span>
            <Badge variant={stepStatus.variant}>
              {stepStatus.text}
            </Badge>
          </div>

          {step === 'embedding' && (
            <div className="space-y-2">
              <Progress value={embeddingsProgress} className="h-2" />
              <div className="text-xs text-muted-foreground">
                {embeddingsStatus}
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div className="text-sm text-destructive line-clamp-2" title={errorMessage}>
                {errorMessage?.length > 150 ? `${errorMessage.slice(0, 150)}...` : errorMessage}
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-foreground mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground">
                Embeddings created and saved successfully! You can now use semantic search on your files.
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          {step === 'check' && (
            <Button
              onClick={handleStartEmbedding}
              disabled={!isServerHealthy || embeddableFiles.length === 0}
            >
              Start Embedding
            </Button>
          )}

          {(step === 'preparing' || step === 'embedding') && (
            <Button disabled>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {step === 'preparing' && 'Preparing...'}
              {step === 'embedding' && 'Creating...'}
            </Button>
          )}

          {step === 'error' && (
            <Button onClick={handleReset}>
              Try Again
            </Button>
          )}

          {step === 'complete' && (
            <Button variant="outline" onClick={handleReset}>
              Create More
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
