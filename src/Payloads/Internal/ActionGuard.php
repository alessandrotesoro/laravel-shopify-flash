<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Payloads\Internal;

use Closure;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Internal validation helpers shared by the action payload classes.
 *
 * Centralizes URL safety and JSON-serializable params checks so both action
 * types apply identical guarantees.
 *
 * @internal
 */
final class ActionGuard
{
    /**
     * Accept relative paths (must start with `/`) and absolute URLs whose host matches the app's
     * own origin, `*.myshopify.com`, or `admin.shopify.com`.
     *
     * Reject `javascript:`, `data:`, `vbscript:`, `file:`, and any cross-origin HTTP/HTTPS URL.
     */
    public static function assertSafeUrl(string $url): void
    {
        $trimmed = trim($url);

        if ($trimmed === '') {
            throw new InvalidArgumentException('Action URL must not be empty.');
        }

        // Relative path — must start with a single `/` and NOT `//` (protocol-relative).
        if (str_starts_with($trimmed, '/')) {
            if (str_starts_with($trimmed, '//')) {
                throw new InvalidArgumentException("Protocol-relative URLs are not allowed: {$url}");
            }

            return;
        }

        // Restrict to http(s) using Laravel's Str::isUrl which performs a full URL parse.
        if (! Str::isUrl($trimmed, ['http', 'https'])) {
            throw new InvalidArgumentException("Action URL must be a relative path or an absolute http(s) URL: {$url}");
        }

        $host = strtolower((string) parse_url($trimmed, PHP_URL_HOST));

        if ($host === 'admin.shopify.com' || str_ends_with($host, '.myshopify.com')) {
            return;
        }

        $appUrl = (string) config('app.url', '');
        $appHost = $appUrl !== '' ? strtolower((string) parse_url($appUrl, PHP_URL_HOST)) : '';

        if ($appHost !== '' && $host === $appHost) {
            return;
        }

        throw new InvalidArgumentException("Action URL must be relative or match the app or Shopify admin origin: {$url}");
    }

    /**
     * @param  array<mixed>  $params
     */
    public static function assertJsonSerializableParams(array $params): void
    {
        if ($params !== [] && array_is_list($params)) {
            throw new InvalidArgumentException('Action params must be keyed by string.');
        }

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
}
