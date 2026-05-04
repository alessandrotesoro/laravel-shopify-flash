<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Payloads;

use Closure;
use Illuminate\Contracts\Support\Arrayable;
use InvalidArgumentException;
use JsonSerializable;

/**
 * Action attached to a banner.
 *
 * Banner actions render as `<s-button href={url}>` on the client, so link URLs are validated
 * at construction to defend against `javascript:` / `data:` payloads injected into a redirect-back
 * flow. Named-handler actions invoke a client-registered function and never embed a URL.
 */
final readonly class BannerAction implements Arrayable, JsonSerializable
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
        self::assertSafeUrl($url);

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
     * Accept relative paths (must start with `/`) and absolute URLs whose host matches the app's
     * own origin, `*.myshopify.com`, or `admin.shopify.com`.
     *
     * Reject `javascript:`, `data:`, `vbscript:`, `file:`, and any cross-origin HTTP/HTTPS URL.
     */
    private static function assertSafeUrl(string $url): void
    {
        $trimmed = trim($url);

        if ($trimmed === '') {
            throw new InvalidArgumentException('Banner action URL must not be empty.');
        }

        // Relative path — must start with a single `/` and NOT `//` (protocol-relative).
        if (str_starts_with($trimmed, '/')) {
            if (str_starts_with($trimmed, '//')) {
                throw new InvalidArgumentException("Protocol-relative URLs are not allowed: {$url}");
            }

            return;
        }

        // Reject dangerous schemes outright.
        $lower = strtolower($trimmed);
        foreach (['javascript:', 'data:', 'vbscript:', 'file:'] as $bad) {
            if (str_starts_with($lower, $bad)) {
                throw new InvalidArgumentException("Banner action URL scheme is not allowed: {$url}");
            }
        }

        $parts = parse_url($trimmed);

        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            throw new InvalidArgumentException("Banner action URL must be a relative path or an absolute http(s) URL: {$url}");
        }

        $scheme = strtolower($parts['scheme']);

        if ($scheme !== 'http' && $scheme !== 'https') {
            throw new InvalidArgumentException("Banner action URL scheme is not allowed: {$url}");
        }

        $host = strtolower($parts['host']);

        if ($host === 'admin.shopify.com' || str_ends_with($host, '.myshopify.com')) {
            return;
        }

        $appUrl = (string) config('app.url', '');
        $appHost = $appUrl !== '' ? strtolower((string) parse_url($appUrl, PHP_URL_HOST)) : '';

        if ($appHost !== '' && $host === $appHost) {
            return;
        }

        throw new InvalidArgumentException("Banner action URL must be relative or match the app or Shopify admin origin: {$url}");
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
