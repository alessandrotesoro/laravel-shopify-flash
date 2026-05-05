<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Payloads\Internal;

/**
 * @internal
 */
trait JsonSerializesViaToArray
{
    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
