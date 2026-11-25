/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
let coepCredentialless = false;
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'deregister') {
      self.registration.unregister().then(() =>
        self.clients.matchAll().then((clients) =>
          clients.forEach((client) => client.navigate(client.url))
        )
      );
    } else if (event.data.type === 'coepCredentialless') {
      coepCredentialless = event.data.value;
    }
  });

  self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

    const fetchRequest = coepCredentialless && request.mode === 'no-cors'
      ? new Request(request, { credentials: 'omit' })
      : request;

    event.respondWith(
      fetch(fetchRequest).then((response) => {
        if (response.status === 0) return response;
        const headers = new Headers(response.headers);
        headers.set(
          'Cross-Origin-Embedder-Policy',
          coepCredentialless ? 'credentialless' : 'require-corp'
        );
        if (!coepCredentialless) {
          headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
        }
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      })
    );
  });
} else {
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem('coiReloadedBySelf');
    window.sessionStorage.removeItem('coiReloadedBySelf');
    const coepDegrading = reloadedBySelf === 'coepdegrade';
    const coi = {
      shouldRegister: () => !reloadedBySelf,
      shouldDeregister: () => false,
      coepCredentialless: () => true,
      coepDegrade: () => true,
      doReload: () => window.location.reload(),
      quiet: false,
      ...window.coi,
    };
    const serviceWorker = navigator.serviceWorker;
    const controlling = serviceWorker && serviceWorker.controller;

    if (controlling && !window.crossOriginIsolated) {
      window.sessionStorage.setItem('coiCoepHasFailed', 'true');
    }
    const coepHasFailed = window.sessionStorage.getItem('coiCoepHasFailed');

    if (controlling) {
      const reloadToDegrade = coi.coepDegrade() && !(
        coepDegrading || window.crossOriginIsolated
      );
      controlling.postMessage({
        type: 'coepCredentialless',
        value: reloadToDegrade || (coepHasFailed && coi.coepDegrade())
          ? false
          : coi.coepCredentialless(),
      });
      if (reloadToDegrade) {
        window.sessionStorage.setItem('coiReloadedBySelf', 'coepdegrade');
        coi.doReload();
      }

      if (coi.shouldDeregister()) {
        controlling.postMessage({ type: 'deregister' });
      }
    }

    if (window.crossOriginIsolated !== false || !coi.shouldRegister()) return;
    if (!window.isSecureContext || !serviceWorker) {
      console.error('Cross-origin isolation requires a secure context and Service Worker support.');
      return;
    }

    serviceWorker.register(document.currentScript.src).then(
      (registration) => {
        registration.addEventListener('updatefound', () => {
          window.sessionStorage.setItem('coiReloadedBySelf', 'updatefound');
          coi.doReload();
        });
        if (registration.active && !serviceWorker.controller) {
          window.sessionStorage.setItem('coiReloadedBySelf', 'notcontrolling');
          coi.doReload();
        }
      },
      (error) => console.error('COOP/COEP Service Worker failed to register:', error)
    );
  })();
}
