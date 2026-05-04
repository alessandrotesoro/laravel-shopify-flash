<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Http\Macros;

use Illuminate\Http\JsonResponse;
use Sematico\ShopifyFlash\Http\FlashEnvelope;
use Sematico\ShopifyFlash\Payloads\BannerPayload;
use Sematico\ShopifyFlash\Payloads\ToastPayload;

/**
 * Registers the `withFlash` macro on {@see JsonResponse}.
 *
 * Merges a {@see FlashEnvelope} (or a tuple of toast/banner that gets wrapped
 * into one) into the JSON body under a top-level `notice` key, so XHR
 * endpoints can deliver the same flash payload shape used by Inertia visits.
 */
final class JsonResponseMacros
{
    public static function register(): void
    {
        JsonResponse::macro('withFlash', function (FlashEnvelope|ToastPayload|BannerPayload $flash, ?BannerPayload $banner = null): JsonResponse {
            $envelope = match (true) {
                $flash instanceof FlashEnvelope => $flash,
                $flash instanceof ToastPayload => new FlashEnvelope(toast: $flash, banner: $banner),
                $flash instanceof BannerPayload => new FlashEnvelope(banner: $flash),
            };

            /** @var JsonResponse $this */
            $data = $this->getData(true);

            if (! is_array($data)) {
                $data = [];
            }

            $data['notice'] = $envelope->toArray();

            $this->setData($data);

            return $this;
        });
    }
}
