# Shopify Flash

[![Packagist Version](https://img.shields.io/packagist/v/sematico/laravel-shopify-flash?style=flat-square)](https://packagist.org/packages/sematico/laravel-shopify-flash)
[![npm version](https://img.shields.io/npm/v/%40sematico%2Fshopify-flash?style=flat-square)](https://www.npmjs.com/package/@sematico/shopify-flash)
[![Tests](https://github.com/alessandrotesoro/laravel-shopify-flash/actions/workflows/run-tests.yml/badge.svg?branch=main)](https://github.com/alessandrotesoro/laravel-shopify-flash/actions/workflows/run-tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE.md)

Share Laravel flash responses with an Inertia.js React app and render them through Shopify App Bridge toasts and Polaris `<s-banner>` notices. The repository contains a Composer package for the backend and an npm package for the frontend.

| Package | Install from |
| --- | --- |
| `sematico/laravel-shopify-flash` | [Packagist](https://packagist.org/packages/sematico/laravel-shopify-flash) |
| `@sematico/shopify-flash` | [npm](https://www.npmjs.com/package/@sematico/shopify-flash) |

## Requirements

- PHP 8.4 or newer
- Laravel 11, 12, or 13
- `inertiajs/inertia-laravel` 3.0.5 or newer
- React 19
- `@inertiajs/core` and `@inertiajs/react` 3.x
- `@shopify/app-bridge-react` 4.x
- An ESM-capable frontend build

## Installation

Install the backend package:

```bash
composer require sematico/laravel-shopify-flash
```

Install the React package:

```bash
npm install @sematico/shopify-flash
```

The Laravel service provider registers the response macros through package discovery. The npm package ships its compiled ESM bundle and TypeScript declarations.

## Frontend setup

Mount the provider, listener, interceptor, and banner container inside Shopify's App Bridge provider:

```tsx
import {
  FlashHttpInterceptor,
  FlashListener,
  NoticesContainer,
  NoticesProvider,
  useNotices,
} from "@sematico/shopify-flash";

function FlashBridge({ children }: { children: React.ReactNode }) {
  const { add } = useNotices();

  return (
    <>
      <FlashListener onBanner={add} />
      <FlashHttpInterceptor />
      {children}
      <NoticesContainer />
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <NoticesProvider>
      <FlashBridge>{children}</FlashBridge>
    </NoticesProvider>
  );
}
```

`FlashListener` consumes Inertia v3 flash events. `FlashHttpInterceptor` consumes `JsonResponse::withFlash()` response envelopes and supplies fallback notices for common HTTP errors. Mount each once.

To add the Inertia flash type augmentation to your application, import the package's types from a declaration file you own:

```ts
// resources/js/types/shopify-flash.d.ts
import "@sematico/shopify-flash/types";
```

## Backend usage

Short success messages can be sent as a toast:

```php
return back()->withToast('File deleted');
```

Use a banner for errors, warnings, and longer messages:

```php
use Sematico\ShopifyFlash\Payloads\BannerPayload;

return back()->withBanner(
    BannerPayload::warning(
        heading: 'Some products need attention',
        description: 'Review the products before continuing.',
    ),
);
```

`withFlash()` accepts a `ToastPayload`, a `BannerPayload`, or a `FlashEnvelope` containing both:

```php
use Sematico\ShopifyFlash\Http\FlashEnvelope;
use Sematico\ShopifyFlash\Payloads\BannerPayload;
use Sematico\ShopifyFlash\Payloads\ToastPayload;

return back()->withFlash(new FlashEnvelope(
    toast: ToastPayload::success('Saved'),
    banner: BannerPayload::info('The import is still running.'),
));
```

The same `withFlash()` macro is available on `JsonResponse`. It adds a `notice` object to the JSON body for `FlashHttpInterceptor`:

```php
return response()->json(['ok' => false])->withFlash(
    BannerPayload::critical('The upload could not be completed.'),
);
```

## Payloads and actions

The PHP value objects mirror the TypeScript wire types:

- `ToastPayload::success()` and `ToastPayload::error()` create App Bridge toasts.
- `BannerPayload::info()`, `success()`, `warning()`, and `critical()` create Polaris banners.
- `ToastAction::link()` creates a safe URL action.
- `ToastAction::handler()` refers to a named client-side handler and accepts JSON-serializable parameters.
- `BannerAction::link()` creates a safe URL action. A banner supports at most two actions.
- `FlashEnvelope` carries a toast, a banner, or both.

Register a named handler in React before emitting a matching toast:

```tsx
import { router } from "@inertiajs/react";
import { useFlashHandlers } from "@sematico/shopify-flash";

function ProductRow({ id }: { id: number }) {
  const { register } = useFlashHandlers();

  React.useEffect(
    () => register("product.restore", () => router.post(`/products/${id}/restore`)),
    [id, register],
  );

  return null;
}
```

For client-owned notices, use `useNotices()` or `useToast()` directly:

```tsx
const { warning } = useNotices();
warning({ heading: "Check the selected products" });

const { success } = useToast();
success("File downloaded");
```

The package validates link actions and rejects unsafe URL schemes before navigation.

## Development

```bash
composer install
composer validate --strict
composer test
composer analyse
composer format -- --test

npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm pack --dry-run
```

The npm package is built from `js/index.ts` into `dist/`. It publishes the compiled bundle, declarations, source TypeScript files, and the project documentation.

## License

This package is open-sourced software licensed under the [MIT license](LICENSE.md).
