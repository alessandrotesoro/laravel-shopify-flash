<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash\Payloads;

/**
 * Banner tone enum matching the Polaris s-banner `tone` attribute.
 */
enum Tone: string
{
    case Info = 'info';
    case Success = 'success';
    case Warning = 'warning';
    case Critical = 'critical';
    case Auto = 'auto';
}
