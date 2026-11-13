/// <reference lib="webworker" />
import { setCacheNameDetails } from "workbox-core";
import {
  precacheAndRoute,
  createHandlerBoundToURL,
  type PrecacheEntry,
} from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (PrecacheEntry | string)[];
};
declare const __PWA_BUILD__: string;
// Keep earlier shells for tabs still editing an older version, including lazy PDF chunks.
// IndexedDB is never touched by service-worker activation or cache management.
setCacheNameDetails({ prefix: "patternaki", suffix: __PWA_BUILD__ });
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//],
  }),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});
