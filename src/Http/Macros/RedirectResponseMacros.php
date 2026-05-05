<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Http\Macros;

use Closure;
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
     * Tracks macros this class registered so re-entry from re-bootstrapped
     * service providers (e.g. Orchestra Testbench between tests) is a no-op
     * rather than a duplicate throw. A `hasMacro()` hit that we DIDN'T set
     * means an external collision and is rejected.
     *
     * @var array<string, true>
     */
    private static array $registered = [];

    public static function register(): void
    {
        self::registerMacro('withToast', function (ToastPayload|string $toast): RedirectResponse {
            $payload = $toast instanceof ToastPayload
                ? $toast
                : ToastPayload::success($toast);

            Inertia::flash('toast', $payload->toArray());

            /** @var RedirectResponse $this */
            return $this;
        });

        self::registerMacro('withBanner', function (BannerPayload $banner): RedirectResponse {
            Inertia::flash('banner', $banner->toArray());

            /** @var RedirectResponse $this */
            return $this;
        });

        self::registerMacro('withFlash', function (BannerPayload|ToastPayload|FlashEnvelope $flash): RedirectResponse {
            $envelope = match (true) {
                $flash instanceof FlashEnvelope => $flash,
                $flash instanceof ToastPayload => new FlashEnvelope(toast: $flash),
                $flash instanceof BannerPayload => new FlashEnvelope(banner: $flash),
            };

            if ($envelope->toast !== null) {
                Inertia::flash('toast', $envelope->toast->toArray());
            }

            if ($envelope->banner !== null) {
                Inertia::flash('banner', $envelope->banner->toArray());
            }

            /** @var RedirectResponse $this */
            return $this;
        });
    }

    private static function registerMacro(string $name, Closure $macro): void
    {
        if (isset(self::$registered[$name])) {
            // Already registered by us in this process — re-bootstrap is a no-op.
            return;
        }

        if (RedirectResponse::hasMacro($name)) {
            throw new RuntimeException("Cannot register {$name} macro — already defined.");
        }

        RedirectResponse::macro($name, $macro);
        self::$registered[$name] = true;
    }
}
