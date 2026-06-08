"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings } from "lucide-react";
import { config as defaultConfig } from "@/config";
import { cn } from "@/lib/utils";

const STORAGE_OPTIONS = [
  { value: 5, label: "5 GB", description: "Personal use" },
  { value: 10, label: "10 GB", description: "Small projects" },
  { value: 50, label: "50 GB", description: "Medium datasets" },
  { value: 100, label: "100 GB", description: "Large files" },
  { value: 1000, label: "1 TB", description: "Maximum capacity" },
];

export interface StorageConfig {
  storageCapacity: number;
  persistencePeriod: number;
  minDaysThreshold: number;
}

interface StorageConfigDialogProps {
  currentConfig: StorageConfig;
  onSave: (config: StorageConfig) => void;
}

export const StorageConfigDialog = ({
  currentConfig,
  onSave,
}: StorageConfigDialogProps) => {
  const [open, setOpen] = useState(false);
  const [storageCapacity, setStorageCapacity] = useState(
    currentConfig.storageCapacity
  );
  const [persistencePeriod, setPersistencePeriod] = useState(
    currentConfig.persistencePeriod
  );
  const [minDaysThreshold, setMinDaysThreshold] = useState(
    currentConfig.minDaysThreshold
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};

    // Storage capacity is now selected from predefined options, so no validation needed
    if (!STORAGE_OPTIONS.some(opt => opt.value === storageCapacity)) {
      newErrors.storageCapacity = "Please select a valid storage option";
    }

    if (persistencePeriod <= 0) {
      newErrors.persistencePeriod = "Persistence period must be greater than 0";
    }
    if (persistencePeriod > 365) {
      newErrors.persistencePeriod = "Persistence period cannot exceed 365 days";
    }

    if (minDaysThreshold < 0) {
      newErrors.minDaysThreshold = "Minimum days threshold cannot be negative";
    }
    if (minDaysThreshold >= persistencePeriod) {
      newErrors.minDaysThreshold =
        "Alert threshold must be less than persistence period";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;

    onSave({
      storageCapacity,
      persistencePeriod,
      minDaysThreshold,
    });
    setOpen(false);
  };

  const handleReset = () => {
    setStorageCapacity(defaultConfig.storageCapacity);
    setPersistencePeriod(defaultConfig.persistencePeriod);
    setMinDaysThreshold(defaultConfig.minDaysThreshold);
    setErrors({});
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setStorageCapacity(currentConfig.storageCapacity);
      setPersistencePeriod(currentConfig.persistencePeriod);
      setMinDaysThreshold(currentConfig.minDaysThreshold);
      setErrors({});
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          Configure Storage
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle>Storage Configuration</DialogTitle>
          <DialogDescription>
            Configure your storage parameters. These values are used to
            calculate storage costs and notify you when funds are running low.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label>
              Storage Capacity
              <span className="text-muted-foreground text-xs ml-2">
                Select your storage tier
              </span>
            </Label>
            <div className="grid grid-cols-5 gap-2">
              {STORAGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStorageCapacity(option.value)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-md border-2 transition-all hover:border-primary/50",
                    storageCapacity === option.value
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background"
                  )}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </div>
                  {storageCapacity === option.value && (
                    <div className="h-4 w-4 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
            {errors.storageCapacity && (
              <p className="text-xs text-destructive">{errors.storageCapacity}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="persistencePeriod">
              Persistence Period (days)
              <span className="text-muted-foreground text-xs ml-2">
                Suggested: {defaultConfig.persistencePeriod} days
              </span>
            </Label>
            <Input
              id="persistencePeriod"
              type="number"
              value={persistencePeriod}
              onChange={(e) => setPersistencePeriod(Number(e.target.value))}
              min={1}
              max={365}
              className={errors.persistencePeriod ? "border-destructive" : ""}
            />
            {errors.persistencePeriod && (
              <p className="text-xs text-destructive">{errors.persistencePeriod}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Target duration for maintaining your storage balance
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="minDaysThreshold">
              Minimum Days Threshold
              <span className="text-muted-foreground text-xs ml-2">
                Suggested: {defaultConfig.minDaysThreshold} days
              </span>
            </Label>
            <Input
              id="minDaysThreshold"
              type="number"
              value={minDaysThreshold}
              onChange={(e) => setMinDaysThreshold(Number(e.target.value))}
              min={0}
              max={persistencePeriod - 1}
              className={errors.minDaysThreshold ? "border-destructive" : ""}
            />
            {errors.minDaysThreshold && (
              <p className="text-xs text-destructive">{errors.minDaysThreshold}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Alert threshold - notify when remaining days drop below this value
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset to Defaults
          </Button>
          <Button onClick={handleSave}>Save Configuration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
