<?php

namespace Sematico\ShopifyFlash\Tests;

use Orchestra\Testbench\TestCase as Orchestra;
use Sematico\ShopifyFlash\ShopifyFlashServiceProvider;

class TestCase extends Orchestra
{
    protected function getPackageProviders($app)
    {
        return [
            ShopifyFlashServiceProvider::class,
        ];
    }

    public function getEnvironmentSetUp($app)
    {
        config()->set('database.default', 'testing');
    }
}
