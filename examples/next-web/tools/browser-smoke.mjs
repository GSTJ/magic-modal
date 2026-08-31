import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const host = "127.0.0.1";

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not reserve a local port."));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });

const waitFor = async (check, description, timeout = 15_000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    try {
      const result = await check();
      if (result) return result;
    } catch {
      // The server and DevTools endpoint both refuse connections while booting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for ${description}.`);
};

const chromeCandidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

const findChrome = async () => {
  const { access } = await import("node:fs/promises");

  for (const candidate of chromeCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep looking.
    }
  }

  throw new Error(
    "Chrome was not found. Set CHROME_BIN to run the browser smoke check.",
  );
};

const connectDevTools = async (url) => {
  const socket = new WebSocket(url);
  const pending = new Map();
  let commandID = 0;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (!message.id) return;

    const request = pending.get(message.id);
    if (!request) return;

    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  return {
    close: () => socket.close(),
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        commandID += 1;
        pending.set(commandID, { reject, resolve });
        socket.send(JSON.stringify({ id: commandID, method, params }));
      }),
  };
};

const stopProcess = async (process) => {
  if (!process || process.exitCode !== null || process.signalCode !== null) {
    return;
  }

  const exit = new Promise((resolve) => {
    process.once("exit", resolve);
  });
  process.kill();
  await exit;
};

const serverPort = await getFreePort();
const debuggingPort = await getFreePort();
const chromeProfile = await mkdtemp(join(tmpdir(), "magic-modal-next-smoke-"));
const chromeBinary = await findChrome();

const app = spawn(
  process.execPath,
  [
    "../../node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    host,
    "--port",
    String(serverPort),
  ],
  { cwd: new URL("..", import.meta.url), stdio: "pipe" },
);

let chrome;
let devTools;

try {
  const pageURL = `http://${host}:${serverPort}`;
  await waitFor(async () => {
    const response = await fetch(pageURL);
    return response.ok;
  }, "the Next.js fixture");

  chrome = spawn(
    chromeBinary,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-sandbox",
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${chromeProfile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const page = await waitFor(async () => {
    const response = await fetch(
      `http://${host}:${debuggingPort}/json/new?${encodeURIComponent(pageURL)}`,
      { method: "PUT" },
    );
    return response.ok ? response.json() : undefined;
  }, "a Chrome DevTools page");

  devTools = await connectDevTools(page.webSocketDebuggerUrl);
  await devTools.send("Runtime.enable");

  const evaluate = async (expression) => {
    const result = await devTools.send("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    return result.result.value;
  };

  const dispatchClick = async ({ x, y }) => {
    await devTools.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      clickCount: 1,
      type: "mousePressed",
      x,
      y,
    });
    await devTools.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 0,
      clickCount: 1,
      type: "mouseReleased",
      x,
      y,
    });
  };

  await waitFor(
    () =>
      evaluate(`(() => {
        const button = document.querySelector('[data-testid="open-modal"]');
        return Boolean(
          button &&
            Object.keys(button).some((key) => key.startsWith("__reactProps")),
        );
      })()`),
    "React hydration",
  );

  await evaluate(`(() => {
    const opener = document.querySelector('[data-testid="open-modal"]');
    opener.focus();
    opener.click();
    return true;
  })()`);
  await waitFor(
    () =>
      evaluate(
        `document.querySelector('[data-testid="modal-result"]').textContent === "OPEN"`,
      ),
    "the click handler",
  );
  await waitFor(
    () => evaluate(`document.querySelectorAll('[role="dialog"]').length === 1`),
    "one modal dialog",
  );

  const modalSemantics = await evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const backdrop = document.querySelector(
      '[data-testid="magic-modal-backdrop"]',
    );

    return {
      backdropHidden: backdrop?.getAttribute("aria-hidden"),
      label: dialog?.getAttribute("aria-label"),
      modal: dialog?.getAttribute("aria-modal"),
    };
  })()`);

  if (
    modalSemantics.backdropHidden !== "true" ||
    modalSemantics.label !== "Ship the web build?" ||
    modalSemantics.modal !== "true"
  ) {
    throw new Error(
      `Unexpected modal semantics: ${JSON.stringify(modalSemantics)}`,
    );
  }

  await waitFor(
    () =>
      evaluate(
        `document.activeElement === document.querySelector('[data-testid="confirm-modal"]')`,
      ),
    "the modal's initial focus",
  );

  const trappedFocus = await evaluate(`(() => {
    const opener = document.querySelector('[data-testid="open-modal"]');
    const confirm = document.querySelector('[data-testid="confirm-modal"]');
    opener.focus();
    return document.activeElement === confirm;
  })()`);

  if (!trappedFocus) {
    throw new Error("Focus escaped the active modal.");
  }

  await evaluate(`(() => {
    const nestedOpener = document.querySelector('[data-testid="open-nested"]');
    nestedOpener.focus();
    nestedOpener.click();
    return true;
  })()`);
  await waitFor(
    () =>
      evaluate(
        `document.querySelectorAll('[data-testid="magic-modal-stack-entry"]').length === 2`,
      ),
    "the nested stack entry",
  );

  const stackSemantics = await evaluate(`(() => {
    const entries = document.querySelectorAll(
      '[data-testid="magic-modal-stack-entry"]',
    );
    const dialogs = document.querySelectorAll('[role="dialog"]');

    return {
      bottomHidden: entries[0]?.getAttribute("aria-hidden"),
      dialogCount: dialogs.length,
      label: dialogs[0]?.getAttribute("aria-label"),
      topHidden: entries[1]?.getAttribute("aria-hidden"),
    };
  })()`);

  if (
    stackSemantics.bottomHidden !== "true" ||
    stackSemantics.dialogCount !== 1 ||
    stackSemantics.label !== "One more check" ||
    stackSemantics.topHidden !== null
  ) {
    throw new Error(
      `Unexpected stack semantics: ${JSON.stringify(stackSemantics)}`,
    );
  }

  await waitFor(
    () =>
      evaluate(
        `document.activeElement === document.querySelector('[data-testid="close-nested"]')`,
      ),
    "focus in the nested stack entry",
  );

  await evaluate(`document.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    }),
  )`);
  await waitFor(
    () =>
      evaluate(`(() => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        return (
          document.querySelectorAll(
            '[data-testid="magic-modal-stack-entry"]',
          ).length === 1 &&
          dialogs.length === 1 &&
          dialogs[0]?.getAttribute("aria-label") === "Ship the web build?" &&
          document.activeElement ===
            document.querySelector('[data-testid="open-nested"]')
        );
      })()`),
    "the restored underlying stack entry",
  );

  const wrappedTab = await evaluate(`(() => {
    const first = document.querySelector('[data-testid="confirm-modal"]');
    const last = document.querySelector('[data-testid="open-nested"]');
    last.focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Tab",
      }),
    );
    return document.activeElement === first;
  })()`);

  if (!wrappedTab) {
    throw new Error("Tab did not wrap inside the active modal.");
  }

  await evaluate(`document.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    }),
  )`);
  await waitFor(
    () =>
      evaluate(
        `document.querySelector('[data-testid="modal-result"]').textContent === "BACK_BUTTON_PRESS" && !document.querySelector('[role="dialog"]') && document.activeElement === document.querySelector('[data-testid="open-modal"]')`,
      ),
    "the Escape dismissal and restored focus",
  );

  await evaluate(
    `document.querySelector('[data-testid="open-modal"]').click(); true`,
  );
  await waitFor(
    () =>
      evaluate(
        `document.querySelector('[data-testid="modal-result"]').textContent === "OPEN" && Boolean(document.querySelector('[role="dialog"]'))`,
      ),
    "the second modal",
  );
  await evaluate(
    `document.querySelector('[data-testid="magic-modal-backdrop"]').click(); true`,
  );
  await waitFor(
    () =>
      evaluate(
        `document.querySelector('[data-testid="modal-result"]').textContent === "BACKDROP_PRESS" && !document.querySelector('[role="dialog"]')`,
      ),
    "the backdrop dismissal result",
  );

  // Swipe-to-dismiss, driven through the browser's own input pipeline.
  //
  // This is the part jsdom cannot reach. The chrome listens for Pointer Events
  // and decides on release velocity, so it needs a real event stream with real
  // timestamps — `Input.dispatchMouseEvent` produces exactly that, and Chrome
  // synthesises the pointer events from it the same way a mouse would.
  await evaluate(
    `document.querySelector('[data-testid="open-swipeable"]').click(); true`,
  );
  await waitFor(
    () =>
      evaluate(
        `Boolean(document.querySelector('[data-testid="swipeable-body"]'))`,
      ),
    "the swipeable modal",
  );

  const dragOrigin = await evaluate(`(() => {
    const { height, left, top, width } = document
      .querySelector('[data-testid="swipeable-body"]')
      .getBoundingClientRect();

    return { x: Math.round(left + width / 2), y: Math.round(top + height / 2) };
  })()`);

  const dispatchDrag = async () => {
    const step = 60;
    const steps = 6;
    // Seconds since the epoch, which is the unit Input.dispatchMouseEvent
    // takes. Stepping a frame at a time puts the release velocity near
    // 3500px/s, seven times the 500px/s threshold, and does not depend on how
    // fast this script happens to run.
    let timestamp = Date.now() / 1000;

    const dispatch = (type, index, buttons) =>
      devTools.send("Input.dispatchMouseEvent", {
        button: "left",
        buttons,
        clickCount: 1,
        timestamp,
        type,
        x: dragOrigin.x,
        y: dragOrigin.y + step * index,
      });

    await dispatch("mousePressed", 0, 1);

    // Awaited one at a time on purpose. Queued together, Chrome delivers them
    // to the page coalesced into a single move, and one sample is not a
    // velocity.
    for (let index = 1; index <= steps; index++) {
      timestamp += 1 / 60;
      // eslint-disable-next-line no-await-in-loop -- see above: each move has to reach the page separately
      await dispatch("mouseMoved", index, 1);
    }

    timestamp += 1 / 60;
    await dispatch("mouseReleased", steps, 0);
  };

  await dispatchDrag();
  await waitFor(
    () =>
      evaluate(
        `document.querySelector('[data-testid="modal-result"]').textContent === "SWIPE_COMPLETE" && !document.querySelector('[role="dialog"]')`,
      ),
    "the swipe dismissal result",
  );

  // The exit animation runs before the entry is dropped, so nothing is left in
  // the tree once it settles. Web had no exit animation at all before the
  // browser chrome landed, and the holdover that makes one possible is the
  // easiest part of it to leave leaking mounted entries.
  await waitFor(
    () =>
      evaluate(
        `document.querySelectorAll('[data-testid="magic-modal-stack-entry"]').length === 0`,
      ),
    "the dismissed entry to finish leaving",
  );

  // An exiting entry stays mounted for its animation, but it is no longer the
  // live modal. Its descendants must leave Chrome's hit-testing immediately.
  await evaluate(
    `document.querySelector('[data-testid="open-modal"]').click(); true`,
  );
  await waitFor(
    () =>
      evaluate(
        `Boolean(document.querySelector('[data-testid="confirm-modal"]'))`,
      ),
    "the pointer-isolation modal",
  );

  const confirmPoint = await evaluate(`(() => {
    const confirm = document.querySelector('[data-testid="confirm-modal"]');
    const { height, left, top, width } = confirm.getBoundingClientRect();
    window.__magicModalConfirmClicks = 0;
    confirm.addEventListener("click", () => {
      window.__magicModalConfirmClicks += 1;
    });
    return { x: Math.round(left + width / 2), y: Math.round(top + height / 2) };
  })()`);

  await dispatchClick(confirmPoint);
  await waitFor(
    () =>
      evaluate(`(() => {
        const entry = document.querySelector(
          '[data-testid="magic-modal-stack-entry"]',
        );
        return (
          window.__magicModalConfirmClicks === 1 &&
          entry?.classList.contains("magic-modal-none")
        );
      })()`),
    "the confirmed entry to start leaving",
  );

  const staleButtonOwnsPoint = await evaluate(`(() => {
    const target = document.elementFromPoint(${confirmPoint.x}, ${confirmPoint.y});
    return Boolean(target?.closest('[data-testid="confirm-modal"]'));
  })()`);
  if (staleButtonOwnsPoint) {
    throw new Error("The exiting modal still owns pointer hit-testing.");
  }

  await dispatchClick(confirmPoint);
  const confirmClicks = await evaluate(
    `new Promise((resolve) => setTimeout(() => resolve(window.__magicModalConfirmClicks), 25))`,
  );
  if (confirmClicks !== 1) {
    throw new Error(`The exiting action fired ${confirmClicks} times.`);
  }

  await waitFor(
    () =>
      evaluate(
        `document.querySelector('[data-testid="modal-result"]').textContent === "CONFIRMED" && document.querySelectorAll('[data-testid="magic-modal-stack-entry"]').length === 0`,
      ),
    "the pointer-isolation exit to settle",
  );

  console.log(
    "✓ Next.js browser smoke: dialog semantics, stack isolation, focus, Escape, backdrop, swipe dismissal, and exiting pointer isolation",
  );
} finally {
  devTools?.close();
  await Promise.all([stopProcess(chrome), stopProcess(app)]);
  await rm(chromeProfile, {
    force: true,
    maxRetries: 5,
    recursive: true,
    retryDelay: 100,
  });
}
