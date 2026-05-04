<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Payloads;

use Closure;
use Illuminate\Contracts\Support\Arrayable;
use InvalidArgumentException;
use JsonSerializable;

/**
 * Action attached to a toast.
 *
 * Two concrete shapes:
 * - link: `{ label, url }` — passed through to App Bridge `Toast.show({ action: { content, onAction } })`
 *   where the host wraps `onAction` to call `router.visit(url)`.
 * - named-handler: `{ label, handler, params? }` — `handler` is the *string name* of a client-side
 *   function registered via `useFlashHandlers()` in U5. The function is never serialized over the wire.
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
        return new self(label: $label, url: $url);
    }

    /**
     * @param  array<string, mixed>  $params
     */
    public static function handler(string $label, string $handler, array $params = []): self
    {
        self::assertJsonSerializableParams($params);

        /** @var array<string, scalar|array<mixed>> $params */
        return new self(label: $label, handler: $handler, params: $params === [] ? null : $params);
    }

    /**
     * @param  array<mixed>  $params
     */
    private static function assertJsonSerializableParams(array $params): void
    {
        foreach ($params as $value) {
            self::assertValue($value);
        }
    }

    private static function assertValue(mixed $value): void
    {
        if ($value instanceof Closure) {
            throw new InvalidArgumentException('Closures are not JSON-serializable.');
        }

        if (is_resource($value)) {
            throw new InvalidArgumentException('Resources are not JSON-serializable.');
        }

        if (is_object($value)) {
            throw new InvalidArgumentException('Objects are not JSON-serializable in action params; pass scalars or arrays.');
        }

        if (is_array($value)) {
            foreach ($value as $inner) {
                self::assertValue($inner);
            }

            return;
        }

        if ($value !== null && ! is_scalar($value)) {
            throw new InvalidArgumentException('Action params must be scalars or arrays of scalars.');
        }
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
