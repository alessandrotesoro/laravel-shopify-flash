<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Http\Macros;

use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use RuntimeException;
use Sematico\ShopifyFlash\Http\FlashEnvelope;
use Sematico\ShopifyFlash\Payloads\BannerPayload;
use Sematico\ShopifyFlash\Payloads\ToastPayload;

/**
 * Registers `withToast`, `withBanner`, and `withFlash` macros on {@see RedirectResponse}.
 *
 * All three macros forward the payload through `Inertia::flash(...)` so the next
 * Inertia response carries it under `flash.toast` / `flash.banner`. They return
 * the redirect instance so they remain chainable with the rest of the
 * `back()->with(...)` fluent API.
 */
final class RedirectResponseMacros
{
    /**
     * Names this class registered. A `hasMacro()` hit not in this set means
     * an external collision and is rejected.
     *
     * @var array<string, true>
     */
    private static array $registered = [];

    public static function register(): void
    {
        if (self::shouldRegister('withToast')) {
            RedirectResponse::macro('withToast', function (ToastPayload|string $toast): RedirectResponse {
                /** @var RedirectResponse $this */
                $payload = $toast instanceof ToastPayload
                    ? $toast
                    : ToastPayload::success($toast);

                Inertia::flash('toast', $payload->toArray());

                return $this;
            });
        }

        if (self::shouldRegister('withBanner')) {
            RedirectResponse::macro('withBanner', function (BannerPayload $banner): RedirectResponse {
                /** @var RedirectResponse $this */
                Inertia::flash('banner', $banner->toArray());

                return $this;
            });
        }

        if (self::shouldRegister('withFlash')) {
            RedirectResponse::macro('withFlash', function (BannerPayload|ToastPayload|FlashEnvelope $flash): RedirectResponse {
                /** @var RedirectResponse $this */
                $envelope = FlashEnvelope::wrap($flash);

                if ($envelope->toast !== null) {
                    Inertia::flash('toast', $envelope->toast->toArray());
                }

                if ($envelope->banner !== null) {
                    Inertia::flash('banner', $envelope->banner->toArray());
                }

                return $this;
            });
        }
    }

    private static function shouldRegister(string $name): bool
    {
        if (isset(self::$registered[$name])) {
            return false;
        }

        if (RedirectResponse::hasMacro($name)) {
            throw new RuntimeException("Cannot register {$name} macro — already defined.");
        }

        self::$registered[$name] = true;

        return true;
    }
}
