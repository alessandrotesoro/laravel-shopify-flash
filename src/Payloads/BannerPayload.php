<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Payloads;

use Illuminate\Contracts\Support\Arrayable;
use InvalidArgumentException;
use JsonSerializable;
use Sematico\ShopifyFlash\Payloads\Internal\JsonSerializesViaToArray;

/**
 * Strict, JSON-serializable value object matching the Polaris `<s-banner>` surface.
 *
 * Wire shape (lowercase keys to match the JS `flashDataType`):
 * `{ heading, description?, tone, dismissible?, actions? }`
 *
 * `tone` is constrained by the {@see Tone} enum and serializes to its string value.
 * `actions` is bounded to a maximum of two — the App Bridge banner surface only renders two slots.
 */
final readonly class BannerPayload implements Arrayable, JsonSerializable
{
    use JsonSerializesViaToArray;

    /**
     * @param  list<BannerAction>|null  $actions
     */
    public function __construct(
        public string $heading,
        public Tone $tone,
        public ?string $description = null,
        public ?bool $dismissible = null,
        public ?array $actions = null,
    ) {
        if (trim($heading) === '') {
            throw new InvalidArgumentException('Banner heading must not be empty.');
        }

        if ($actions !== null && count($actions) > 2) {
            throw new InvalidArgumentException('Banner supports a maximum of 2 actions.');
        }
    }

    /**
     * @param  list<BannerAction>|null  $actions
     */
    public static function info(string $heading, ?string $description = null, ?array $actions = null, bool $dismissible = true): self
    {
        return self::make(Tone::Info, $heading, $description, $actions, $dismissible);
    }

    /**
     * @param  list<BannerAction>|null  $actions
     */
    public static function success(string $heading, ?string $description = null, ?array $actions = null, bool $dismissible = true): self
    {
        return self::make(Tone::Success, $heading, $description, $actions, $dismissible);
    }

    /**
     * @param  list<BannerAction>|null  $actions
     */
    public static function warning(string $heading, ?string $description = null, ?array $actions = null, bool $dismissible = true): self
    {
        return self::make(Tone::Warning, $heading, $description, $actions, $dismissible);
    }

    /**
     * @param  list<BannerAction>|null  $actions
     */
    public static function critical(string $heading, ?string $description = null, ?array $actions = null, bool $dismissible = true): self
    {
        return self::make(Tone::Critical, $heading, $description, $actions, $dismissible);
    }

    /**
     * @param  list<BannerAction>|null  $actions
     */
    private static function make(Tone $tone, string $heading, ?string $description, ?array $actions, bool $dismissible): self
    {
        return new self(
            heading: $heading,
            tone: $tone,
            description: $description,
            dismissible: $dismissible,
            actions: $actions,
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        $out = [
            'heading' => $this->heading,
            'tone' => $this->tone->value,
        ];

        if ($this->description !== null) {
            $out['description'] = $this->description;
        }

        if ($this->dismissible !== null) {
            $out['dismissible'] = $this->dismissible;
        }

        if ($this->actions !== null && $this->actions !== []) {
            $out['actions'] = array_map(static fn (BannerAction $a): array => $a->toArray(), $this->actions);
        }

        return $out;
    }
}
