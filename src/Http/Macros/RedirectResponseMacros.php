<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Http\Macros;

use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Sematico\ShopifyFlash\Payloads\BannerPayload;
use Sematico\ShopifyFlash\Payloads\ToastPayload;

/**
 * Registers `withToast` and `withBanner` macros on {@see RedirectResponse}.
 *
 * Both macros forward the payload through `Inertia::flash(...)` so the next
 * Inertia response carries it under `flash.toast` / `flash.banner`. They return
 * the redirect instance so they remain chainable with the rest of the
 * `back()->with(...)` fluent API.
 */
final class RedirectResponseMacros
{
    public static function register(): void
    {
        RedirectResponse::macro('withToast', function (ToastPayload|string $toast): RedirectResponse {
            $payload = $toast instanceof ToastPayload
                ? $toast
                : ToastPayload::success($toast);

            Inertia::flash('toast', $payload->toArray());

            /** @var RedirectResponse $this */
            return $this;
        });

        RedirectResponse::macro('withBanner', function (BannerPayload $banner): RedirectResponse {
            Inertia::flash('banner', $banner->toArray());

            /** @var RedirectResponse $this */
            return $this;
        });
    }
}
