<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Payloads;

use Illuminate\Contracts\Support\Arrayable;
use JsonSerializable;
use Sematico\ShopifyFlash\Payloads\Internal\ActionGuard;

/**
 * Action attached to a toast.
 *
 * Two concrete shapes:
 * - link: `{ label, url }` — passed through to App Bridge `Toast.show({ action: { content, onAction } })`
 *   where the host wraps `onAction` to call `router.visit(url)`. URL is validated at construction
 *   via {@see ActionGuard::assertSafeUrl()} to reject `javascript:` / `data:` payloads.
 * - named-handler: `{ label, handler, params? }` — `handler` is the *string name* of a client-side
 *   function registered via `useFlashHandlers()`. The function is never serialized over the wire.
 */
final readonly class ToastAction implements Arrayable, JsonSerializable
{
    /**
     * @param  array<string, scalar|array<mixed>>|null  $params
     */
    private function __construct(
        public string $label,
        public ?string $url = null,
        public ?string $handler = null,
        public ?array $params = null,
    ) {}

    public static function link(string $label, string $url): self
    {
        ActionGuard::assertSafeUrl($url);

        return new self(label: $label, url: $url);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public static function handler(string $label, string $handler, array $params = []): self
    {
        ActionGuard::assertJsonSerializableParams($params);

        /** @var array<string, scalar|array<mixed>> $params */
        return new self(label: $label, handler: $handler, params: $params === [] ? null : $params);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        if ($this->url !== null) {
            return ['label' => $this->label, 'url' => $this->url];
        }

        $out = ['label' => $this->label, 'handler' => (string) $this->handler];

        if ($this->params !== null && $this->params !== []) {
            $out['params'] = $this->params;
        }

        return $out;
    }

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
