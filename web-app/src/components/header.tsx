"use client";

import { Button } from "@/components/ui/button";
import { Grid3X3, HelpCircle, List } from "lucide-react";

interface HeaderProps {
  isFilePage: boolean;
  viewMode?: "grid" | "list";
  setViewMode?: (mode: "grid" | "list") => void;
}

export default function Header({ isFilePage, viewMode, setViewMode }: HeaderProps) {
  return (
    <div className="flex border-b border-border bg-background justify-end p-2">

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {/* View Mode Toggle */}
        {isFilePage && setViewMode && (
          <div className="flex border border-border rounded-md overflow-hidden">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
              className="rounded-none"
            >
              <Grid3X3 className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="rounded-none"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        )}

        <Button variant="ghost" size="sm">
          <HelpCircle className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
