# @sematico/shopify-flash + sematico/laravel-shopify-flash

Shared Laravel + Inertia v3 + React package standardizing **Shopify App Bridge toast** and **Polaris `<s-banner>`** UX across Sematico apps. Backend declares feedback via `Inertia::flash()`; a single client-side listener routes payloads to the right App Bridge surface.

> **Status:** v0.x is pre-stable. APIs may break between v0.x bumps.

## Stack requirements

- PHP `^8.4`, Laravel `^11||^12||^13`
- `inertiajs/inertia-laravel: ^3.0` (native `Inertia::flash()` API required)
- React `^19`, `@inertiajs/react: ^3`, `@shopify/app-bridge-react: ^4`
- `@inertiajs/core: ^3` is a required peer alongside `@inertiajs/react` (the package imports `HttpResponseError` / `HttpNetworkError` / `HttpCancelledError` from core for `instanceof` checks; bundling them creates a second class identity and breaks the checks)
- ESM-capable consumer (Vite, Vitest, modern Node, etc.). The package does not ship a CJS build.

## Install

Until private Packagist + private npm are wired up, install via git URL.

**PHP (consuming app's `composer.json`):**

```jsonc
{
  "repositories": [
    {
      "type": "vcs",
      "url": "git@github.com:alessandrotesoro/laravel-shopify-flash.git"
    }
  ],
  "require": {
    "sematico/laravel-shopify-flash": "^0.0.1"
  }
}
```

**JS (consuming app's `package.json`):**

```jsonc
{
  "dependencies": {
    "@sematico/shopify-flash": "git+ssh://git@github.com/alessandrotesoro/laravel-shopify-flash.git#v0.0.1"
  }
}
```

## Quick start

**1. Type the flash payload (consumer's own `.d.ts`):**

```ts
// resources/js/types/shopify-flash.d.ts
import "@sematico/shopify-flash/types";
```

This augments `@inertiajs/core`'s `InertiaConfig` so `usePage().flash.toast` and `.banner` are fully typed.

**2. Mount the package in your app shell:**

```tsx
// resources/js/layouts/app-shell.tsx
import {
  FlashListener,
  HttpErrorInterceptor,
  NoticesContainer,
  NoticesProvider,
  useNotices,
} from "@sematico/shopify-flash";

function NoticeBridge({ children }: { children: React.ReactNode }) {
  const { add } = useNotices();
  return (
    <>
      <FlashListener onBanner={add} />
      <HttpErrorInterceptor />
      {children}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <NoticesProvider>
      <NoticeBridge>
        {children}
        <NoticesContainer />
      </NoticeBridge>
    </NoticesProvider>
  );
}
```

**3. Flash from a controller:**

```php
use Sematico\ShopifyFlash\Http\FlashEnvelope;
use Sematico\ShopifyFlash\Payloads\BannerPayload;
use Sematico\ShopifyFlash\Payloads\ToastPayload;

return back()->withToast('File deleted');

return back()->withBanner(
    BannerPayload::warning(
        heading: '127 products missing shipping weights',
        description: 'Products without weights may show inaccurate shipping rates, leading to checkout abandonment.',
    )
);

// Or use the unified macro — accepts a ToastPayload, a BannerPayload, or a FlashEnvelope
// carrying both. Same macro name on `JsonResponse` for XHR endpoints.
return back()->withFlash(BannerPayload::critical('Boom'));

return back()->withFlash(new FlashEnvelope(
    toast: ToastPayload::success('Saved'),
    banner: BannerPayload::info('FYI'),
));
```

**4. Register named handlers (for action buttons that fire client-side functions):**

```tsx
import { useFlashHandlers } from "@sematico/shopify-flash";

function ProductRow() {
  const { register } = useFlashHandlers();

  React.useEffect(() => {
    return register("product.undo-delete", async ({ id }) => {
      await router.post(`/admin/products/${id}/restore`);
    });
  }, [register]);
}
```

Then from PHP:

```php
use Sematico\ShopifyFlash\Payloads\ToastAction;
use Sematico\ShopifyFlash\Payloads\ToastPayload;

return back()->withToast(
    new ToastPayload(
        message: 'Product deleted',
        action: ToastAction::handler('Undo', 'product.undo-delete', ['id' => $product->id]),
    )
);
```

## Toasts and banners policy

The package owns this policy table for all consuming Sematico apps. Consuming app `CLAUDE.md` / `AGENTS.md` files should defer to it.

| Outcome | Surface |
|---|---|
| User-initiated success, ≤3 words, `[object] [action]` (e.g. "File deleted", "Product created") | `back()->withToast(...)` from the controller; renders as a Shopify App Bridge toast |
| Errors, warnings, ≥4-word messages, anything not a fresh user-initiated success | `back()->withBanner(BannerPayload::critical|warning|info|success(...))` from the controller; renders as `<s-banner>` |
| Backend XHR errors (4xx/5xx response data) | Return the JSON envelope: `response()->json(['ok' => false])->withFlash(BannerPayload::critical(...))`. The `HttpErrorInterceptor` routes the envelope into the notices context. |
| Transport-level error with no response (`HttpNetworkError`) | Handled automatically by the package — single direct toast from the bridge, the one allowlisted exception |
| Programmatic notice from React (sync flow, modal cleanup, etc.) | `useNotices().add(...)` — convenience methods `info()`, `success()`, `warning()`, `critical()` available |

**Forbidden by policy:** direct `shopify.toast.show()` calls outside the package's bridge module. The bridge is the single sanctioned entry point. (Lint/test enforcement of this rule is deferred to v2 — see `Scope Boundaries` in the implementation plan.)

**Drop "successfully" from any toast string.** "File deleted" — not "File deleted successfully".

**Don't toast for in-place mutations the UI already shows.** A form save where the row updates inline doesn't need a toast; the visible state change IS the feedback. Reserve flash for cross-page outcomes.

### Toast vs banner — when each fits

- **Toast** is short, ephemeral, auto-dismisses, supports one optional action button. Best for: ≤3-word post-action confirmations, undo affordances, transient acknowledgments.
- **Banner** is longer, persistent until dismissed (or non-dismissable for critical state), has a heading + body + up to two action buttons. Best for: errors, warnings, multi-step guidance, anything that needs to stay on screen.

App Bridge's toast surface only supports two visual states (default success, `isError: true` red). Polaris's `<s-banner>` supports five tones (`info | success | warning | critical | auto`). The split in the package's two payload types reflects this rendering-layer constraint, not a conceptual model.

## What the package does NOT do (v1 scope boundaries)

- **No multi-message queueing** per response — one toast and one banner per `Inertia::flash()` call. Use `router.flash({ banner })` client-side from broadcast handlers if more is needed.
- **No i18n / intent codes** — payloads carry rendered strings. Backend resolves any translation server-side via `trans()`/`__()` before flashing.
- **No background-job broadcast integration** as a package responsibility. Consumers who use Reverb/Echo dispatch via `router.flash()` from broadcast handlers; the package's listener renders both transports identically.
- **No banner-with-spinner / progress-bar payload shape** — coupled to the Reverb track; lands when Reverb does (v2).
- **No confirmation prompts (modal-shaped asks) and no sticky-info banners** — explicitly out, will not be added; consumers handle these cases manually.
- **No closure-based actions** — actions must be JSON-serializable (link or named handler with `params`).
- **No lint/test chokepoint** banning direct `shopify.toast.show()` calls — deferred to v2.
- **No mutating-route flash assertion** in Pest — deferred to v2.
- **No public Packagist / public npm release** — private only for v1.

## Development

```bash
composer install      # PHP deps
npm install           # JS deps
composer test         # Pest
composer analyse      # Larastan
composer format       # Pint
npm run test          # Vitest
npm run build         # tsup → dist/
npm run typecheck     # tsc --noEmit
npm run lint          # Biome
```

## Releases

The git tag is the single source of truth for the version. To release:

```bash
git tag v0.0.1
git push --tags
```

CI workflows (`.github/workflows/publish-composer.yml`, `.github/workflows/publish-npm.yml`) trigger on tags. The npm workflow sets `package.json.version` from the tag at publish time. Composer reads the version from the git tag directly (no `version` field in `composer.json`, per Composer's own schema docs).

## License

MIT — see [LICENSE.md](LICENSE.md).
