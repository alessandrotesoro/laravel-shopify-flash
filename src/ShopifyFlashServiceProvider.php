<?php

declare(strict_types=1);

namespace Sematico\ShopifyFlash;

use Sematico\ShopifyFlash\Http\Macros\JsonResponseMacros;
use Sematico\ShopifyFlash\Http\Macros\RedirectResponseMacros;
use Spatie\LaravelPackageTools\Package;
use Spatie\LaravelPackageTools\PackageServiceProvider;

class ShopifyFlashServiceProvider extends PackageServiceProvider
{
    public function configurePackage(Package $package): void
    {
        $package->name('laravel-shopify-flash');
    }

    public function bootingPackage(): void
    {
        RedirectResponseMacros::register();
        JsonResponseMacros::register();
    }
}
