"use client";

import { useModal, ModalType, ModalInstance, ModalProps } from "@/providers/ModalProvider";
import UploadModal from "@/components/modals/upload-modal";
import EmbeddingModal from "@/components/modals/embedding-modal";
import CreateFolderModal from "@/components/modals/create-folder-modal";
import { Button } from "@/components/ui/button";
import { Maximize2, X, Upload, Folder, Move, Share2, Info, Eye, Brain } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { memo } from "react";

const MODAL_COMPONENTS: Record<ModalType, React.ComponentType<ModalProps & { modalId: string }>> = {
  UPLOAD: UploadModal as React.ComponentType<ModalProps & { modalId: string }>,
  EMBEDDING: EmbeddingModal as React.ComponentType<ModalProps & { modalId: string }>,
  CREATE_FOLDER: CreateFolderModal as React.ComponentType<ModalProps & { modalId: string }>,
  MOVE_FILE: (() => null) as React.ComponentType<ModalProps & { modalId: string }>,
  SHARE_FOLDER: (() => null) as React.ComponentType<ModalProps & { modalId: string }>,
  DETAILS: (() => null) as React.ComponentType<ModalProps & { modalId: string }>,
  PREVIEW: (() => null) as React.ComponentType<ModalProps & { modalId: string }>,
};

const MODAL_ICONS: Record<ModalType, React.ReactNode> = {
  UPLOAD: <Upload className="h-4 w-4" />,
  EMBEDDING: <Brain className="h-4 w-4" />,
  CREATE_FOLDER: <Folder className="h-4 w-4" />,
  MOVE_FILE: <Move className="h-4 w-4" />,
  SHARE_FOLDER: <Share2 className="h-4 w-4" />,
  DETAILS: <Info className="h-4 w-4" />,
  PREVIEW: <Eye className="h-4 w-4" />,
};

const MODAL_DEFAULT_TITLES: Record<ModalType, string> = {
  UPLOAD: "Upload File",
  EMBEDDING: "Create Embeddings",
  CREATE_FOLDER: "Create Folder",
  MOVE_FILE: "Move File",
  SHARE_FOLDER: "Share Folder",
  DETAILS: "Details",
  PREVIEW: "Preview",
};

const MODAL_SIZES: Record<ModalType, string> = {
  UPLOAD: "sm:max-w-3xl",
  EMBEDDING: "sm:max-w-lg",
  CREATE_FOLDER: "sm:max-w-md",
  MOVE_FILE: "sm:max-w-md",
  SHARE_FOLDER: "sm:max-w-md",
  DETAILS: "sm:max-w-lg",
  PREVIEW: "sm:max-w-4xl",
};


const ModalContentWrapper = memo(function ModalContentWrapper({ 
  modal, 
  Component,
  closeModal 
}: { 
  modal: ModalInstance; 
  Component: React.ComponentType<ModalProps & { modalId: string }>;
  closeModal: (id: string) => void;
}) {
  const isMinimized = modal.isMinimized;
  const sizeClass = MODAL_SIZES[modal.type] || "sm:max-w-lg";

  return (
    <div 
      className={cn(
        "bg-background fixed z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-md border p-6 shadow-lg transition-all duration-200",
        sizeClass,
        isMinimized 
          ? "invisible pointer-events-none translate-x-[50%] translate-y-[50%] bottom-4 right-4 scale-75 opacity-0" 
          : "top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] scale-100 opacity-100"
      )}
      aria-hidden={isMinimized}
    >
      <Component {...modal.props} modalId={modal.id} />
      {!modal.metadata?.preventClose && !isMinimized && (
        <button 
          onClick={() => closeModal(modal.id)}
          className="ring-offset-background focus:ring-ring absolute top-6 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      )}
    </div>
  );
});

export function ModalManager() {
  const { modals, closeModal, maximizeModal } = useModal();

  return (
    <>
      {modals.some(m => !m.isMinimized) && (
        <div 
          className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
          onClick={() => {
            const activeModal = modals.find(m => !m.isMinimized);
            if (activeModal && !activeModal.metadata?.preventClose) {
              closeModal(activeModal.id);
            }
          }}
        />
      )}
      {modals.map((modal) => {
        const Component = MODAL_COMPONENTS[modal.type];
        if (!Component) return null;

        return (
          <ModalContentWrapper 
            key={modal.id}
            modal={modal}
            Component={Component}
            closeModal={closeModal}
          />
        );
      })}

      {/* Taskbar for minimized modals */}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-60">
        {modals
          .filter((m) => m.isMinimized)
          .map((modal) => {
            return (
              <div key={modal.id}>
                {/* Minimized card UI */}
                <div
                  className="bg-background border rounded-lg shadow-lg p-3 w-80 animate-in slide-in-from-bottom-5 cursor-pointer hover:shadow-xl transition-shadow"
                  onClick={() => maximizeModal(modal.id)}
                >
                  <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div className="shrink-0 p-2 rounded-md bg-primary/10 text-primary">
                      {MODAL_ICONS[modal.type]}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">
                          {modal.metadata?.title || MODAL_DEFAULT_TITLES[modal.type]}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              maximizeModal(modal.id);
                            }}
                          >
                            <Maximize2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-current"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!modal.metadata?.preventClose) {
                                closeModal(modal.id);
                              }
                            }}
                            disabled={modal.metadata?.preventClose}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Progress and status */}
                      {(modal.metadata?.progress !== undefined || modal.metadata?.status) && (
                        <div className="space-y-1">
                          {modal.metadata?.progress !== undefined && (
                            <div className="flex items-center gap-2">
                              <Progress value={modal.metadata.progress} className="h-1.5 flex-1" />
                              <span className="text-xs text-muted-foreground shrink-0">
                                {modal.metadata.progress}%
                              </span>
                            </div>
                          )}
                          {modal.metadata?.status && (
                            <p className="text-xs text-muted-foreground truncate">
                              {modal.metadata.status}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}
