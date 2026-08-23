import { type RefObject, useEffect } from "react";
import type gsap from "gsap";

export function useDemoTimelinePlayback(
  targetRef: RefObject<Element | null>,
  timelineRef: RefObject<gsap.core.Timeline | null>
): void {
  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let isInView = false;

    const syncPlayback = (): void => {
      const timeline = timelineRef.current;
      if (!timeline) {
        return;
      }
      if (mediaQuery.matches) {
        timeline.pause(0);
        return;
      }
      if (isInView) {
        timeline.resume();
      } else {
        timeline.pause();
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        isInView = entry?.isIntersecting ?? false;
        syncPlayback();
      },
      {
        rootMargin: "120px 0px"
      }
    );

    observer.observe(target);
    mediaQuery.addEventListener("change", syncPlayback);
    syncPlayback();

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", syncPlayback);
    };
  }, [targetRef, timelineRef]);
}
