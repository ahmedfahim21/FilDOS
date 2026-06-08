"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

export type ModalType = "UPLOAD" | "EMBEDDING" | "CREATE_FOLDER" | "MOVE_FILE" | "SHARE_FOLDER" | "DETAILS" | "PREVIEW";

export interface ModalMetadata {
  title?: string;
  progress?: number;
  status?: string;
  preventClose?: boolean;
}

export interface ModalProps {
  folderId?: string;
  files?: unknown[];
  onCreateFolder?: (name: string, folderType?: string, viewingPrice?: string) => Promise<void>;
  [key: string]: unknown;
}

export interface ModalInstance {
  id: string;
  type: ModalType;
  props: ModalProps;
  isMinimized: boolean;
  metadata?: ModalMetadata;
}

interface ModalContextType {
  modals: ModalInstance[];
  openModal: (type: ModalType, props?: ModalProps) => string;
  closeModal: (id: string) => void;
  minimizeModal: (id: string) => void;
  maximizeModal: (id: string) => void;
  updateModalMetadata: (id: string, metadata: Partial<ModalMetadata>) => void;
  closeAllModals: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [modals, setModals] = useState<ModalInstance[]>([]);

  const openModal = useCallback((type: ModalType, props: ModalProps = {}) => {
    const id = Math.random().toString(36).substring(7);
    setModals((prev) => [...prev, { id, type, props, isMinimized: false }]);
    return id;
  }, []);

  const closeModal = useCallback((id: string) => {
    setModals((prev) => prev.filter((modal) => modal.id !== id));
  }, []);

  const minimizeModal = useCallback((id: string) => {
    setModals((prev) =>
      prev.map((modal) =>
        modal.id === id ? { ...modal, isMinimized: true } : modal
      )
    );
  }, []);

  const maximizeModal = useCallback((id: string) => {
    setModals((prev) =>
      prev.map((modal) =>
        modal.id === id ? { ...modal, isMinimized: false } : modal
      )
    );
  }, []);

  const updateModalMetadata = useCallback((id: string, metadata: Partial<ModalMetadata>) => {
    setModals((prev) =>
      prev.map((modal) =>
        modal.id === id
          ? { ...modal, metadata: { ...modal.metadata, ...metadata } }
          : modal
      )
    );
  }, []);

  const closeAllModals = useCallback(() => {
    setModals([]);
  }, []);

  return (
    <ModalContext.Provider
      value={{
        modals,
        openModal,
        closeModal,
        minimizeModal,
        maximizeModal,
        updateModalMetadata,
        closeAllModals,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error("useModal must be used within a ModalProvider");
  }
  return context;
}