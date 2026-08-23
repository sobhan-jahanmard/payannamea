"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  analyticsPageKey,
  captureUtmSource,
  flushAnalyticsEvents,
  pageViewProperties,
  trackAnalyticsEvent
} from "../../lib/analytics";

const ENGAGEMENT_MILESTONES = [15, 30, 60, 120, 300];
const SCROLL_MILESTONES = [25, 50, 75, 90];

function durationBucket(seconds: number): string {
  if (seconds < 10) return "under_10s";
  if (seconds < 30) return "10_30s";
  if (seconds < 60) return "30_60s";
  if (seconds < 120) return "1_2m";
  if (seconds < 300) return "2_5m";
  return "5m_plus";
}

export function AnalyticsTracker() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    captureUtmSource();
    const flushTimer = window.setInterval(flushAnalyticsEvents, 1_000);
    flushAnalyticsEvents();
    return () => window.clearInterval(flushTimer);
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const pageKey = analyticsPageKey(pathname);
    let visibleMilliseconds = 0;
    let visibleSince = document.visibilityState === "visible" ? Date.now() : null;
    let maxScrollPercent = 0;
    let ended = false;
    const reachedEngagement = new Set<number>();
    const reachedScroll = new Set<number>();

    trackAnalyticsEvent("page_view", {
      page_name: pageKey,
      ...pageViewProperties()
    });

    const visibleSeconds = () =>
      Math.floor(
        (visibleMilliseconds + (visibleSince === null ? 0 : Date.now() - visibleSince)) / 1_000
      );

    const updateVisibility = () => {
      if (document.visibilityState === "visible") {
        visibleSince ??= Date.now();
      } else if (visibleSince !== null) {
        visibleMilliseconds += Date.now() - visibleSince;
        visibleSince = null;
      }
    };

    const updateScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const percent = scrollable <= 0 ? 100 : Math.min(100, Math.round((window.scrollY / scrollable) * 100));
      maxScrollPercent = Math.max(maxScrollPercent, percent);
      for (const milestone of SCROLL_MILESTONES) {
        if (maxScrollPercent >= milestone && !reachedScroll.has(milestone)) {
          reachedScroll.add(milestone);
          trackAnalyticsEvent(`page_scroll_${pageKey}_${milestone}`, {
            page_name: pageKey,
            scroll_percent: milestone
          });
        }
      }
    };

    const engagementTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const seconds = visibleSeconds();
      for (const milestone of ENGAGEMENT_MILESTONES) {
        if (seconds >= milestone && !reachedEngagement.has(milestone)) {
          reachedEngagement.add(milestone);
          trackAnalyticsEvent(`page_engaged_${pageKey}_${milestone}s`, {
            page_name: pageKey,
            engaged_seconds: milestone,
            max_scroll_percent: maxScrollPercent
          });
        }
      }
    }, 1_000);

    const finish = () => {
      if (ended) return;
      ended = true;
      updateVisibility();
      const seconds = visibleSeconds();
      trackAnalyticsEvent(`page_time_${pageKey}_${durationBucket(seconds)}`, {
        page_name: pageKey,
        engaged_seconds: seconds,
        max_scroll_percent: maxScrollPercent
      });
    };

    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("pagehide", finish);
    updateScroll();

    return () => {
      finish();
      window.clearInterval(engagementTimer);
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("pagehide", finish);
    };
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const startedForms = new WeakSet<Element>();

    const handleInteraction = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const trackedElement = target.closest<HTMLElement>("[data-analytics-event]");
      if (event.type === "click" && trackedElement?.dataset.analyticsEvent) {
        trackAnalyticsEvent(trackedElement.dataset.analyticsEvent, {
          ...(trackedElement.dataset.analyticsLabel
            ? { label: trackedElement.dataset.analyticsLabel }
            : {}),
          ...(trackedElement.dataset.analyticsLocation
            ? { location: trackedElement.dataset.analyticsLocation }
            : {})
        });
      }

      const form = target.closest<HTMLFormElement>("[data-analytics-form]");
      if (event.type === "input" && form && !startedForms.has(form)) {
        startedForms.add(form);
        trackAnalyticsEvent(`${form.dataset.analyticsForm}_started`);
      }
    };

    document.addEventListener("click", handleInteraction);
    document.addEventListener("input", handleInteraction);

    const observed = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || observed.has(entry.target)) continue;
          observed.add(entry.target);
          const element = entry.target as HTMLElement;
          if (element.dataset.analyticsImpression) {
            trackAnalyticsEvent(element.dataset.analyticsImpression, {
              ...(element.dataset.analyticsLabel ? { label: element.dataset.analyticsLabel } : {})
            });
          }
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.5 }
    );
    document.querySelectorAll("[data-analytics-impression]").forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("input", handleInteraction);
    };
  }, [pathname]);

  return null;
}
