<?php

declare(strict_types=1);

use Sematico\ShopifyFlash\Payloads\ToastAction;

beforeEach(function () {
    config()->set('app.url', 'https://myapp.test');
});

it('rejects javascript: URLs in toast link actions', function () {
    ToastAction::link('Click', 'javascript:alert(1)');
})->throws(InvalidArgumentException::class);

it('rejects data: URLs in toast link actions', function () {
    ToastAction::link('Click', 'data:text/html,<script>alert(1)</script>');
})->throws(InvalidArgumentException::class);

it('rejects vbscript: URLs in toast link actions', function () {
    ToastAction::link('Click', 'vbscript:msgbox(1)');
})->throws(InvalidArgumentException::class);

it('rejects file: URLs in toast link actions', function () {
    ToastAction::link('Click', 'file:///etc/passwd');
})->throws(InvalidArgumentException::class);

it('rejects cross-origin http(s) URLs in toast link actions', function () {
    ToastAction::link('Click', 'https://attacker.com/foo');
})->throws(InvalidArgumentException::class);

it('rejects protocol-relative URLs in toast link actions', function () {
    ToastAction::link('Click', '//attacker.com/foo');
})->throws(InvalidArgumentException::class);

it('accepts relative paths in toast link actions', function () {
    $action = ToastAction::link('Open', '/admin/orders/1024');

    expect($action->toArray())->toBe(['label' => 'Open', 'url' => '/admin/orders/1024']);
});

it('accepts the Shopify admin origin in toast link actions', function () {
    $action = ToastAction::link('Open', 'https://admin.shopify.com/store/foo/orders/1');

    expect($action->toArray())->toBe([
        'label' => 'Open',
        'url' => 'https://admin.shopify.com/store/foo/orders/1',
    ]);
});

it('accepts a *.myshopify.com origin in toast link actions', function () {
    $action = ToastAction::link('Open', 'https://my-store.myshopify.com/admin/orders/1');

    expect($action->url)->toBe('https://my-store.myshopify.com/admin/orders/1');
});

it('accepts the apps own origin from config(app.url) in toast link actions', function () {
    $action = ToastAction::link('Open', 'https://myapp.test/dashboard');

    expect($action->url)->toBe('https://myapp.test/dashboard');
});
