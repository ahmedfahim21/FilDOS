import { ReactNode } from "react";

interface TaggedLayoutProps {
  children: ReactNode;
}

export default function TaggedLayout({ children }: TaggedLayoutProps) {
  return <>{children}</>;
}