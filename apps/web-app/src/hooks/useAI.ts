import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { config } from "@/config";

// Types for AI endpoints
export type EmbedRequest = {
  file_urls: string[];
  collection_name?: string;
};

export type ProcessedFile = {
  filename: string;
  url: string;
  status: string;
};

export type FailedFile = {
  filename: string;
  url: string;
  error: string;
};

export type SkippedFile = {
  filename: string;
  url: string;
  reason: string;
};

export type EmbedResponse = {
  collection_name: string;
  processed_files: ProcessedFile[];
  failed_files: FailedFile[];
  skipped_files: SkippedFile[];
  total_processed: number;
  total_failed: number;
  total_skipped: number;
  error?: string;
};

export type SearchRequest = {
  query: string;
  collection_name: string;
};

export type SearchResult = {
  score: number;
  type: "image" | "text";
  filename: string;
  url: string;
  excerpt?: string;
};

export type SearchResponse = {
  query: string;
  collection_name: string;
  results: SearchResult[];
  total_results: number;
  message?: string;
  error?: string;
};

/**
 * Hook to create embeddings from multiple file URLs
 */
export const useCreateEmbeddings = () => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");

  const mutation = useMutation({
    mutationKey: ["create-embeddings"],
    mutationFn: async (params: { fileUrls: string[]; collection_name: string }): Promise<EmbedResponse> => {
      const { fileUrls, collection_name } = params;

      if (!fileUrls || fileUrls.length === 0) {
        throw new Error("File URLs are required");
      }
      if (!collection_name) {
        throw new Error("Collection name is required");
      }

      setProgress(0);
      setStatus("🔄 Creating embeddings...");

      const formData = new FormData();
      fileUrls.forEach((url) => {
        formData.append('file_urls', url);
      });
      formData.append('collection_name', collection_name);

      const response = await fetch(`${config.aiServerUrl}/embed`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `HTTP error! status: ${response.status}`);
      }

      setProgress(50);
      setStatus("🔄 Processing embeddings...");

      const data: EmbedResponse = await response.json();

      setProgress(100);
      setStatus(`Embeddings created! Processed: ${data.total_processed}, Failed: ${data.total_failed}, Total: ${data.total_skipped}`);
      
      return data;
    },
    onError: (error) => {
      setStatus(`Error creating embeddings: ${error.message}`);
      setProgress(0);
    },
  });

  return {
    createEmbeddings: mutation.mutate,
    isCreating: mutation.isPending,
    embedResult: mutation.data,
    error: mutation.error,
    progress,
    status,
    reset: () => {
      mutation.reset();
      setProgress(0);
      setStatus("");
    },
  };
};

/**
 * Hook to search through embeddings
 */
export const useSearchEmbeddings = () => {
  const [status, setStatus] = useState("");

  const mutation = useMutation({
    mutationKey: ["search-embeddings"],
    mutationFn: async ({ query, collection_name }: SearchRequest): Promise<SearchResponse> => {
      if (!query) {
        throw new Error("Query is required");
      }
      if (!collection_name) {
        throw new Error("Collection name is required");
      }

      setStatus("🔍 Searching embeddings...");

      const formData = new FormData();
      formData.append('query', query);
      formData.append('collection_name', collection_name);

      const response = await fetch(`${config.aiServerUrl}/search`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `HTTP error! status: ${response.status}`);
      }

      const data: SearchResponse = await response.json();
      console.log("Search results:", data);
      setStatus(`Search completed! Found ${data.results.length} results`);

      return data;
    },
    onError: (error) => {
      setStatus(`Error searching: ${error.message}`);
    },
  });

  return {
    searchEmbeddings: mutation.mutate,
    isSearching: mutation.isPending,
    searchResults: mutation.data,
    error: mutation.error,
    status,
    reset: () => {
      mutation.reset();
      setStatus("");
    },
  };
};


/**
 * Hook to get AI server health status
 */
export const useAIServerHealth = () => {
  return useQuery({
    queryKey: ["ai-server-health"],
    queryFn: async (): Promise<{ status: string; timestamp: string; models_loaded?: boolean; weaviate_connected?: boolean }> => {
      const response = await fetch(`${config.aiServerUrl}/health`);
      if (!response.ok) {
        throw new Error(`AI server is not responding: ${response.status}`);
      }
      return await response.json();
    },
    refetchInterval: 30000, // Check every 30 seconds
    retry: 3,
  });
};

/**
 * Hook to list all Weaviate collections
 */
export const useListCollections = () => {
  return useQuery({
    queryKey: ["ai-list-collections"],
    queryFn: async (): Promise<{ collections: string[]; total: number; error?: string }> => {
      const response = await fetch(`${config.aiServerUrl}/collections`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    },
    retry: 2,
  });
};

/**
 * Hook to get details of a specific collection
 */
export const useCollectionDetails = (
  collection_name: string,
  options?: { enabled?: boolean }
) => {
  return useQuery({
    queryKey: ["ai-collection-details", collection_name],
    queryFn: async (): Promise<{ name: string; count: number; exists: boolean; error?: string }> => {
      if (!collection_name) throw new Error("Collection name required");
      const response = await fetch(`${config.aiServerUrl}/collections/${encodeURIComponent(collection_name)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    },
    enabled: options?.enabled ?? !!collection_name,
    retry: 2,
  });
};

/**
 * Hook to delete a collection
 */
export const useDeleteCollection = () => {
  const mutation = useMutation({
    mutationKey: ["ai-delete-collection"],
    mutationFn: async (collection_name: string): Promise<{ message?: string; error?: string }> => {
      if (!collection_name) throw new Error("Collection name required");
      const response = await fetch(`${config.aiServerUrl}/collections/${encodeURIComponent(collection_name)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    },
  });
  return {
    deleteCollection: mutation.mutate,
    isDeleting: mutation.isPending,
    deleteResult: mutation.data,
    error: mutation.error,
    reset: mutation.reset,
  };
};

/**
 * Combined hook for AI operations
 */
export const useAI = () => {
  const embeddings = useCreateEmbeddings();
  const search = useSearchEmbeddings();
  const serverHealth = useAIServerHealth();
  const listCollections = useListCollections();
  const deleteCollection = useDeleteCollection();

  return {
    // Embeddings operations
    createEmbeddings: embeddings.createEmbeddings,
    isCreatingEmbeddings: embeddings.isCreating,
    embeddingsProgress: embeddings.progress,
    embeddingsStatus: embeddings.status,
    embedResult: embeddings.embedResult,
    embeddingsError: embeddings.error,
    resetEmbeddings: embeddings.reset,

    // Search operations
    searchEmbeddings: search.searchEmbeddings,
    isSearching: search.isSearching,
    searchResults: search.searchResults,
    searchStatus: search.status,
    searchError: search.error,
    resetSearch: search.reset,

    // Server health
    serverHealth: serverHealth.data,
    isServerHealthy: serverHealth.isSuccess,
    serverHealthError: serverHealth.error,

    // Collections
    listCollections: listCollections.data,
    isListingCollections: listCollections.isSuccess,
    listCollectionsError: listCollections.error,

    getCollectionDetails: useCollectionDetails,
    deleteCollection: deleteCollection.deleteCollection,
    isDeletingCollection: deleteCollection.isDeleting,
    deleteCollectionResult: deleteCollection.deleteResult,
    deleteCollectionError: deleteCollection.error,
    resetDeleteCollection: deleteCollection.reset,
  };
};
