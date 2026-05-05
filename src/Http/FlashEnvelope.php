<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Http;

use Illuminate\Contracts\Support\Arrayable;
use InvalidArgumentException;
use JsonSerializable;
use Sematico\ShopifyFlash\Payloads\BannerPayload;
use Sematico\ShopifyFlash\Payloads\Internal\JsonSerializesViaToArray;
use Sematico\ShopifyFlash\Payloads\ToastPayload;

/**
 * Wire envelope shared between `Inertia::flash` payloads and `JsonResponse::withFlash` responses.
 *
 * Shape: `{ toast?: ToastPayload, banner?: BannerPayload }` — both keys optional, at least
 * one required. Lowercase keys match the Inertia v3 `usePage().flash.toast` / `.banner` access
 * pattern.
 */
final readonly class FlashEnvelope implements Arrayable, JsonSerializable
{
    use JsonSerializesViaToArray;

    public function __construct(
        public ?ToastPayload $toast = null,
        public ?BannerPayload $banner = null,
    ) {
        if ($toast === null && $banner === null) {
            throw new InvalidArgumentException('FlashEnvelope requires at least one of: toast, banner.');
        }
    }

    /**
     * Coerce a bare payload into an envelope, or pass an existing envelope through.
     */
    public static function wrap(self|ToastPayload|BannerPayload $flash): self
    {
        return match (true) {
            $flash instanceof self => $flash,
            $flash instanceof ToastPayload => new self(toast: $flash),
            $flash instanceof BannerPayload => new self(banner: $flash),
        };
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        $out = [];

        if ($this->toast !== null) {
            $out['toast'] = $this->toast->toArray();
        }

        if ($this->banner !== null) {
            $out['banner'] = $this->banner->toArray();
        }

        return $out;
    }
}
