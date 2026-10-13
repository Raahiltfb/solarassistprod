"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // When pathname or searchParams change, navigation has completed!
  useEffect(() => {
    if (loading) {
      setProgress(100);
      const timer = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  // Intercept clicks on standard internal links to show instant 0ms progress
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (
        href &&
        href.startsWith("/") &&
        !href.startsWith("#") &&
        !target.getAttribute("target") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !e.altKey
      ) {
        // If clicking the same URL, don't trigger
        const currentUrl = window.location.pathname + window.location.search;
        if (href === currentUrl) return;

        setLoading(true);
        setProgress(25);

        // Smooth increment animation while waiting
        const t1 = setTimeout(() => setProgress(60), 100);
        const t2 = setTimeout(() => setProgress(85), 350);

        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
        };
      }
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 pointer-events-none transition-opacity duration-200"
      style={{ opacity: loading ? 1 : 0 }}
      aria-hidden="true"
    >
      <div
        className="h-[3px] bg-gradient-to-r from-emerald-500 via-primary to-teal-400 shadow-[0_0_10px_rgba(16,185,129,0.7)] transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
        }}
      />
    </div>
  );
}
