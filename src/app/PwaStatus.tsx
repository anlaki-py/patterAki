import { useEffect, useRef, useState } from "react";
import { Alert, Button, Group, Text } from "@mantine/core";
import { useEditor } from "../editor/store";
import { safeguardUpdate } from "./pwaSafety";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function PwaStatus() {
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const activeEdit = useEditor(
    (s) =>
      !s.ready ||
      s.hasDraft ||
      !!s.preview ||
      s.gestureActive ||
      s.moveDialogOpen ||
      !!s.lengthDialogEdge,
  );
  useEffect(() => {
    const installable = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    const installed = () => setInstall(null);
    window.addEventListener("beforeinstallprompt", installable);
    window.addEventListener("appinstalled", installed);
    let live = true;
    let interval: ReturnType<typeof setInterval> | undefined;
    if (
      import.meta.env.PROD &&
      window.isSecureContext &&
      "serviceWorker" in navigator
    ) {
      // No controllerchange reload listener: another tab's activation must not discard this tab's draft.
      void navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, {
          updateViaCache: "none",
        })
        .then((reg) => {
          if (!live) return;
          registration.current = reg;
          const inspect = () => {
            if (!live) return;
            if (reg.waiting && navigator.serviceWorker.controller)
              setWaiting(true);
          };
          inspect();
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            worker?.addEventListener("statechange", () => {
              inspect();
              if (worker.state === "redundant" && live)
                setError(
                  "Offline cache installation failed. Keep this tab open, export a backup, and retry online. Existing projects are retained.",
                );
            });
          });
          interval = setInterval(() => {
            if (navigator.onLine)
              void reg.update().catch((e) => {
                if (live)
                  setError(
                    `Could not check for an app update: ${String(e)}. Your drawing is retained.`,
                  );
              });
          }, 60_000);
        })
        .catch((e) => {
          if (live)
            setError(
              `Offline startup is unavailable: ${String(e)}. Continue editing and export JSON backups.`,
            );
        });
    }
    return () => {
      live = false;
      clearInterval(interval);
      window.removeEventListener("beforeinstallprompt", installable);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  return (
    <>
      {(waiting || error || install) && (
        <Alert
          title={
            waiting
              ? "App update available"
              : error
                ? "Offline cache warning"
                : "Install PatternAki"
          }
          color={error ? "orange" : "blue"}
          style={{ flexShrink: 0 }}
        >
          <Group justify="space-between">
            <Text size="xs">
              {error ||
                (waiting
                  ? "Save committed work and reload when ready. Finish all active edits first. Other tabs will stay open."
                  : "Install PatternAki for offline drafting after the app cache is ready.")}
            </Text>
            {waiting && (
              <Button
                size="xs"
                loading={busy}
                disabled={activeEdit || busy}
                onClick={() => {
                  if (busy) return;
                  setBusy(true);
                  setError("");
                  void safeguardUpdate()
                    .then(async () => {
                      const worker = registration.current?.waiting;
                      if (!worker)
                        throw new Error(
                          "The update is no longer waiting. Check again online.",
                        );
                      // Activation is observed only by the tab that explicitly accepted this update.
                      await new Promise<void>((resolve, reject) => {
                        const timeout = setTimeout(() => {
                          worker.removeEventListener("statechange", changed);
                          reject(
                            new Error(
                              "Update activation timed out. Your project is saved; retry online.",
                            ),
                          );
                        }, 15000);
                        const changed = () => {
                          if (worker.state === "activated") {
                            clearTimeout(timeout);
                            worker.removeEventListener("statechange", changed);
                            resolve();
                          } else if (worker.state === "redundant") {
                            clearTimeout(timeout);
                            worker.removeEventListener("statechange", changed);
                            reject(
                              new Error(
                                "Update activation failed. Your saved project is retained.",
                              ),
                            );
                          }
                        };
                        worker.addEventListener("statechange", changed);
                        worker.postMessage({ type: "SKIP_WAITING" });
                      });
                      await safeguardUpdate();
                      window.location.reload();
                    })
                    .catch((e) => setError((e as Error).message))
                    .finally(() => setBusy(false));
                }}
              >
                Save and update
              </Button>
            )}
            {install && (
              <Button
                size="xs"
                onClick={() =>
                  void install
                    .prompt()
                    .then(() => install.userChoice)
                    .then(() => setInstall(null))
                    .catch((e) => setError(String(e)))
                }
              >
                Install app
              </Button>
            )}
            {!waiting && (
              <Button
                variant="subtle"
                size="xs"
                onClick={() => {
                  setError("");
                  setInstall(null);
                }}
              >
                Dismiss
              </Button>
            )}
          </Group>
        </Alert>
      )}
    </>
  );
}
