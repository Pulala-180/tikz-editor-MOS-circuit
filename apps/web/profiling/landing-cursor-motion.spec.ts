import { expect, test } from "@playwright/test";

type CursorSample = {
  index: number;
  jumpCount: number;
  jumps: Array<{
    delta: number;
    dt: number;
    from: { x: number; y: number };
    time: number;
    to: { x: number; y: number };
  }>;
  maxDelta: number;
  samples: number;
};

type CursorSpeedProfile = {
  abruptChanges: Array<{
    fromSpeed: number;
    ratio: number;
    time: number;
    toSpeed: number;
  }>;
  card: string;
  index: number;
  maxSpeed: number;
  p95Speed: number;
  samples: number;
};

test("landing demo cursors move continuously without transform jumps", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_000);

  const samples = await page.evaluate(async () => {
    const cursorPoint = (cursor: SVGGElement): { x: number; y: number } | null => {
      const matrix = cursor.getScreenCTM();
      if (!matrix) {
        return null;
      }
      const point = new DOMPoint(0, 0).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    };

    const cursors = Array.from(document.querySelectorAll<SVGGElement>("[data-landing-cursor]"));
    const previous = new Map<number, { time: number; x: number; y: number }>();
    const results = cursors.map<CursorSample>((_, index) => ({
      index,
      jumpCount: 0,
      jumps: [],
      maxDelta: 0,
      samples: 0
    }));

    const start = performance.now();
    const durationMs = 12_000;
    const maxExpectedFrameDelta = 28;
    const maxExpectedSpeed = 1.1;

    while (performance.now() - start < durationMs) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      cursors.forEach((cursor, index) => {
        const opacity = Number.parseFloat(getComputedStyle(cursor).opacity || "1");
        if (opacity < 0.01) {
          previous.delete(index);
          return;
        }
        const point = cursorPoint(cursor);
        if (!point) {
          return;
        }
        const now = performance.now() - start;
        const last = previous.get(index);
        if (last) {
          const delta = Math.hypot(point.x - last.x, point.y - last.y);
          if (delta > 0.001) {
            const dt = Math.max(1, now - last.time);
            results[index].maxDelta = Math.max(results[index].maxDelta, delta);
            if (delta > maxExpectedFrameDelta || delta / dt > maxExpectedSpeed) {
              results[index].jumpCount += 1;
              results[index].jumps.push({
                delta,
                dt,
                from: { x: last.x, y: last.y },
                time: now,
                to: point
              });
            }
            previous.set(index, { ...point, time: now });
          }
        } else {
          previous.set(index, { ...point, time: now });
        }
        results[index].samples += 1;
      });
    }

    return results.filter((result) => result.samples > 10);
  });

  expect(samples.length).toBeGreaterThan(0);
  for (const sample of samples) {
    expect(sample.jumpCount, JSON.stringify(sample, null, 2)).toBe(0);
  }
});

test("landing demo cursor speed changes stay within a smooth range", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_000);

  const profiles = await page.evaluate(async () => {
    const screenPointForCursor = (cursor: SVGGElement): { x: number; y: number } | null => {
      const matrix = cursor.getScreenCTM();
      if (!matrix) {
        return null;
      }
      const point = new DOMPoint(0, 0).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    };
    const labelForCursor = (cursor: SVGGElement, index: number): string => {
      const card = cursor.closest<HTMLElement>(".featureCard, .sourceEditDemo");
      const title = card?.querySelector<HTMLElement>(".featureCardTitle, h3, h2");
      return title?.textContent?.trim() || card?.className || `cursor ${index}`;
    };

    const cursors = Array.from(document.querySelectorAll<SVGGElement>("[data-landing-cursor]"));
    const previous = new Map<number, { speed: number; time: number; x: number; y: number }>();
    const speeds = cursors.map<number[]>(() => []);
    const results = cursors.map<CursorSpeedProfile>((cursor, index) => ({
      abruptChanges: [],
      card: labelForCursor(cursor, index),
      index,
      maxSpeed: 0,
      p95Speed: 0,
      samples: 0
    }));

    const durationMs = 12_000;
    const minComparedSpeed = 70;
    const maxSpeedRatio = 5.5;
    const maxSpeedDeltaPerSecond = 2_600;
    const start = performance.now();

    while (performance.now() - start < durationMs) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now() - start;
      cursors.forEach((cursor, index) => {
        const opacity = Number.parseFloat(getComputedStyle(cursor).opacity || "1");
        if (opacity < 0.01) {
          previous.delete(index);
          return;
        }
        const point = screenPointForCursor(cursor);
        if (!point) {
          return;
        }
        const last = previous.get(index);
        if (last) {
          const dt = Math.max(1, now - last.time);
          const speed = (Math.hypot(point.x - last.x, point.y - last.y) / dt) * 1_000;
          results[index].maxSpeed = Math.max(results[index].maxSpeed, speed);
          speeds[index].push(speed);

          const comparable = last.speed > minComparedSpeed && speed > minComparedSpeed;
          const ratio = comparable ? Math.max(speed, last.speed) / Math.max(1, Math.min(speed, last.speed)) : 1;
          const speedDeltaPerSecond = (Math.abs(speed - last.speed) / dt) * 1_000;
          if (comparable && ratio > maxSpeedRatio && speedDeltaPerSecond > maxSpeedDeltaPerSecond) {
            results[index].abruptChanges.push({
              fromSpeed: last.speed,
              ratio,
              time: now,
              toSpeed: speed
            });
          }
          previous.set(index, { ...point, speed, time: now });
        } else {
          previous.set(index, { ...point, speed: 0, time: now });
        }
        results[index].samples += 1;
      });
    }

    results.forEach((result, index) => {
      const sorted = [...speeds[index]].sort((a, b) => a - b);
      result.p95Speed = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    });

    return results.filter((result) => result.samples > 10);
  });

  expect(profiles.length).toBeGreaterThan(0);
  for (const profile of profiles) {
    expect(profile.abruptChanges, JSON.stringify(profile, null, 2)).toHaveLength(0);
  }
});

test("landing demo cursors pause when their cards are offscreen", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_000);

  const pausedSamples = await page.evaluate(async () => {
    const cursors = Array.from(document.querySelectorAll<SVGGElement>("[data-landing-cursor]"));
    const offscreen = cursors
      .map((cursor, index) => ({ cursor, index, transform: cursor.style.transform }))
      .filter(({ cursor }) => {
        const card = cursor.closest<HTMLElement>(".featureCard, .sourceEditDemo");
        const rect = card?.getBoundingClientRect();
        if (!rect) {
          return false;
        }
        return rect.bottom < -320 || rect.top > window.innerHeight + 320;
      });

    await new Promise<void>((resolve) => setTimeout(resolve, 800));

    return offscreen.map(({ cursor, index, transform }) => ({
      index,
      after: cursor.style.transform,
      before: transform
    }));
  });

  expect(pausedSamples.length).toBeGreaterThan(0);
  for (const sample of pausedSamples) {
    expect(sample.after, JSON.stringify(sample, null, 2)).toBe(sample.before);
  }
});
