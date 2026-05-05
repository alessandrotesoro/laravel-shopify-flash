<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Http\Macros;

use Illuminate\Http\JsonResponse;
use LogicException;
use RuntimeException;
use Sematico\ShopifyFlash\Http\FlashEnvelope;
use Sematico\ShopifyFlash\Payloads\BannerPayload;
use Sematico\ShopifyFlash\Payloads\ToastPayload;

/**
 * Registers the `withFlash` macro on {@see JsonResponse}.
 *
 * Merges a {@see FlashEnvelope}, {@see ToastPayload}, or {@see BannerPayload} into
 * the JSON body under a top-level `notice` key, so XHR endpoints can deliver the
 * same flash payload shape used by Inertia visits. Bare payloads are wrapped into
 * a single-key envelope; consumers wanting both a toast and a banner pass an
 * explicit `FlashEnvelope`.
 */
final class JsonResponseMacros
{
    private static bool $registered = false;

    public static function register(): void
    {
        if (self::$registered) {
            return;
        }

        if (JsonResponse::hasMacro('withFlash')) {
            throw new RuntimeException('Cannot register withFlash macro — already defined.');
        }

        JsonResponse::macro('withFlash', function (FlashEnvelope|ToastPayload|BannerPayload $flash): JsonResponse {
            /** @var JsonResponse $this */
            $data = $this->getData(true) ?? [];

            if (array_key_exists('notice', $data)) {
                throw new LogicException("withFlash() cannot overwrite an existing top-level 'notice' key on the response body.");
            }

            $data['notice'] = FlashEnvelope::wrap($flash)->toArray();

            $this->setData($data);

            return $this;
        });

        self::$registered = true;
    }
}
