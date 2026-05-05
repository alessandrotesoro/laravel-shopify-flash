<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Payloads;

use Illuminate\Contracts\Support\Arrayable;
use JsonSerializable;
use Sematico\ShopifyFlash\Payloads\Internal\ActionGuard;

/**
 * Action attached to a banner.
 *
 * Banner actions render as `<s-button href={url}>` on the client. URLs are validated at
 * construction to defend against `javascript:` / `data:` payloads injected into a redirect-back
 * flow.
 *
 * Banners only support the link variant on the wire. The JS-only `inline-onClick` variant is
 * declared in `js/types.d.ts` for client-side `useNotices().add(...)` calls; PHP cannot emit it
 * because closures cannot cross the JSON boundary. Named-handler actions remain supported on
 * toasts only — see {@see ToastAction::handler()}.
 */
final readonly class BannerAction implements Arrayable, JsonSerializable
{
    private function __construct(
        public string $label,
        public string $url,
    ) {}

    public static function link(string $label, string $url): self
    {
        ActionGuard::assertSafeUrl($url);

        return new self(label: $label, url: $url);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return ['label' => $this->label, 'url' => $this->url];
    }

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
