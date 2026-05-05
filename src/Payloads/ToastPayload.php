<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Payloads;

use Illuminate\Contracts\Support\Arrayable;
use InvalidArgumentException;
use JsonSerializable;

/**
 * Strict, JSON-serializable value object matching the Shopify App Bridge `Toast.show` options.
 *
 * Wire shape (lowercase keys to match the JS `flashDataType`):
 * `{ message, isError?, duration?, action? }`
 */
final readonly class ToastPayload implements Arrayable, JsonSerializable
{
    public function __construct(
        public string $message,
        public ?bool $isError = null,
        public ?int $duration = null,
        public ?ToastAction $action = null,
    ) {
        if (trim($message) === '') {
            throw new InvalidArgumentException('Toast message must not be empty.');
        }

        if ($duration !== null && $duration < 0) {
            throw new InvalidArgumentException('Toast duration must be zero or positive (zero means App Bridge default).');
        }
    }

    public static function success(string $message): self
    {
        return new self(message: $message);
    }

    public static function error(string $message): self
    {
        return new self(message: $message, isError: true);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        $out = ['message' => $this->message];

        if ($this->isError === true) {
            $out['isError'] = true;
        }

        if ($this->duration !== null) {
            $out['duration'] = $this->duration;
        }

        if ($this->action !== null) {
            $out['action'] = $this->action->toArray();
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
