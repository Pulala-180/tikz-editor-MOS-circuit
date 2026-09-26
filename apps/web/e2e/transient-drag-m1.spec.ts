import { expect, test } from "@playwright/test";
import { gotoApp, setSource, waitForHitRegions } from "./helpers";

const USER_CODE = String.raw`\begin{tikzpicture}
  \begin{scope}[shift={(-6.572,1.72)}]
      \coordinate (node_M1.g) at (0,0);
      \draw[line width=0.32mm, line cap=round] (0,0) -- (0.26,0);
      \draw[line width=0.7mm] (0.25,-0.25) -- (0.25,0.25);
      \draw[line width=0.7mm] (0.41,-0.3) -- (0.41,0.3);
      \draw[line width=0.32mm, line cap=round, line join=round] (0.40,0.2) -- (0.73,0.2) -- (0.73,0.5);
      \draw[-{Triangle[length=2mm, width=1.5mm, sep=-1.2pt]}, line width=0.32mm, line cap=round] (0.40,-0.2) -- (0.70,-0.2);
      \draw[line width=0.32mm, line cap=round] (0.73,-0.21) -- (0.73,-0.5);
      \node[node font=\sffamily\bfseries] at (1.04,0) {$M_{1}$};
      \coordinate (node_M1.d) at (0.73,0.5);
      \coordinate (node_M1.s) at (0.73,-0.5);
    \end{scope}

  \draw[line width=0.32mm, line cap=round] (-5.85,2.22) -- (-5.85,2.52);

  \begin{scope}[shift={(-5.842,2.52)}]
      \coordinate (node_R1.b) at (0,0);
      \draw[line width=0.32mm, line cap=round] (0,0) -- (0,0.15) -- (0.15,0.19) -- (-0.15,0.27) -- (0.15,0.35) -- (-0.15,0.43) -- (0.15,0.51) -- (-0.15,0.59) -- (0,0.63) -- (0,0.78);
      \node[right] at (0.25,0.39) {$R_{D}$};
      \coordinate (node_R1.t) at (0,0.78);
    \end{scope}

  \draw[line width=0.32mm, line cap=round] (-5.85,3.30) -- (-5.85,3.60);

  \begin{scope}[shift={(-5.842,3.60)}]
      \coordinate (node_VDD.bottom) at (0,0);
      \draw[ultra thick] (-0.95,0) -- (0.9,0);
      \node[draw=none] at (1.2,0) {$V_{DD}$};
    \end{scope}

  \draw[line width=0.32mm, line cap=round] (-6.57,1.72) -- (-6.87,1.72);

  \begin{scope}[shift={(-7.47,1.72)}]
      \node at (-0.01,-0.30) {$V_{in}$};
      \draw[line width=0.32mm, line cap=round] (0.15,0) node[circle, draw=black, fill=white, inner sep=1.5pt] {} -- (0.6,0);
      \coordinate (node_IO1.port) at (0.6,0);
    \end{scope}
\end{tikzpicture}`;

test("drag M1 and inspect DOM transforms during drag", async ({ page }) => {
  await gotoApp(page);
  await setSource(page, USER_CODE);
  await waitForHitRegions(page, 1);

  // Find M1 element
  const m1Text = page.locator("text=M").first();
  const m1Box = await m1Text.boundingBox();
  expect(m1Box).not.toBeNull();

  const startX = m1Box!.x + m1Box!.width / 2;
  const startY = m1Box!.y + m1Box!.height / 2;

  // Move right by 50px
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 50, startY, { steps: 5 });

  // Inspect DOM while mouse is still DOWN
  const stateDuringRightDrag = await page.evaluate(() => {
    const host = document.querySelector("[data-testid='canvas-svg-layer']");
    if (!host) return { error: "no host" };
    const elements = Array.from(host.querySelectorAll("[data-source-id]"));
    return elements.map(el => ({
      tag: el.tagName,
      sourceId: el.getAttribute("data-source-id"),
      transform: el.getAttribute("transform"),
      d: el.getAttribute("d")
    }));
  });

  console.log("State during RIGHT drag:\n", JSON.stringify(stateDuringRightDrag, null, 2));

  await page.mouse.up();
  await page.waitForTimeout(200);

  // Now move UP by 50px
  const m1BoxAfter = await m1Text.boundingBox();
  const upStartX = m1BoxAfter!.x + m1BoxAfter!.width / 2;
  const upStartY = m1BoxAfter!.y + m1BoxAfter!.height / 2;

  await page.mouse.move(upStartX, upStartY);
  await page.mouse.down();
  await page.mouse.move(upStartX, upStartY - 50, { steps: 5 });

  const stateDuringUpDrag = await page.evaluate(() => {
    const host = document.querySelector("[data-testid='canvas-svg-layer']");
    if (!host) return { error: "no host" };
    const elements = Array.from(host.querySelectorAll("[data-source-id]"));
    return elements.map(el => ({
      tag: el.tagName,
      sourceId: el.getAttribute("data-source-id"),
      transform: el.getAttribute("transform"),
      d: el.getAttribute("d")
    }));
  });

  console.log("State during UP drag:\n", JSON.stringify(stateDuringUpDrag, null, 2));
  await page.mouse.up();
});
