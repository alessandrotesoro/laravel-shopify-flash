<?php

declare(strict_types=1);

use Sematico\ShopifyFlash\Payloads\BannerAction;
use Sematico\ShopifyFlash\Payloads\BannerPayload;
use Sematico\ShopifyFlash\Payloads\Tone;

beforeEach(function () {
    config()->set('app.url', 'https://myapp.test');
});

it('serializes a warning banner with description and two link actions', function () {
    $payload = BannerPayload::warning(
        heading: 'X',
        description: 'Y',
        actions: [
            BannerAction::link('Open', '/admin/orders/1'),
            BannerAction::link('Retry', '/admin/orders/1/retry'),
        ],
    );

    $arr = $payload->toArray();

    expect($arr['heading'])->toBe('X');
    expect($arr['description'])->toBe('Y');
    expect($arr['tone'])->toBe('warning');
    expect($arr['actions'])->toHaveCount(2);
    expect($arr['actions'][0])->toBe(['label' => 'Open', 'url' => '/admin/orders/1']);
    expect($arr['actions'][1])->toBe(['label' => 'Retry', 'url' => '/admin/orders/1/retry']);
});

it('uses lowercase tone values from the enum', function () {
    expect(BannerPayload::info('h')->toArray()['tone'])->toBe('info');
    expect(BannerPayload::success('h')->toArray()['tone'])->toBe('success');
    expect(BannerPayload::warning('h')->toArray()['tone'])->toBe('warning');
    expect(BannerPayload::critical('h')->toArray()['tone'])->toBe('critical');
    expect((new BannerPayload(heading: 'h', tone: Tone::Auto))->toArray()['tone'])->toBe('auto');
});

it('throws when constructed with three actions', function () {
    new BannerPayload(
        heading: 'X',
        tone: Tone::Info,
        actions: [
            BannerAction::link('a', '/a'),
            BannerAction::link('b', '/b'),
            BannerAction::link('c', '/c'),
        ],
    );
})->throws(InvalidArgumentException::class, 'maximum of 2');

it('throws when constructed without a heading', function () {
    new BannerPayload(heading: '', tone: Tone::Info);
})->throws(InvalidArgumentException::class);

it('omits description, dismissible, and actions when not provided', function () {
    $payload = new BannerPayload(heading: 'h', tone: Tone::Info);

    expect($payload->toArray())->toBe(['heading' => 'h', 'tone' => 'info']);
});

it('rejects javascript: URLs in banner link actions', function () {
    BannerAction::link('Click', 'javascript:alert(1)');
})->throws(InvalidArgumentException::class);

it('rejects data: URLs in banner link actions', function () {
    BannerAction::link('Click', 'data:text/html,<script>alert(1)</script>');
})->throws(InvalidArgumentException::class);

it('rejects vbscript: URLs in banner link actions', function () {
    BannerAction::link('Click', 'vbscript:msgbox(1)');
})->throws(InvalidArgumentException::class);

it('rejects file: URLs in banner link actions', function () {
    BannerAction::link('Click', 'file:///etc/passwd');
})->throws(InvalidArgumentException::class);

it('rejects cross-origin http(s) URLs in banner link actions', function () {
    BannerAction::link('Click', 'https://attacker.com/foo');
})->throws(InvalidArgumentException::class);

it('rejects protocol-relative URLs in banner link actions', function () {
    BannerAction::link('Click', '//attacker.com/foo');
})->throws(InvalidArgumentException::class);

it('accepts relative paths in banner link actions', function () {
    $action = BannerAction::link('Open', '/admin/orders/1024');

    expect($action->toArray())->toBe(['label' => 'Open', 'url' => '/admin/orders/1024']);
});

it('accepts the Shopify admin origin in banner link actions', function () {
    $action = BannerAction::link('Open', 'https://admin.shopify.com/store/foo/orders/1');

    expect($action->toArray())->toBe([
        'label' => 'Open',
        'url' => 'https://admin.shopify.com/store/foo/orders/1',
    ]);
});

it('accepts a *.myshopify.com origin in banner link actions', function () {
    $action = BannerAction::link('Open', 'https://my-store.myshopify.com/admin/orders/1');

    expect($action->url)->toBe('https://my-store.myshopify.com/admin/orders/1');
});

it('accepts the apps own origin from config(app.url) in banner link actions', function () {
    $action = BannerAction::link('Open', 'https://myapp.test/dashboard');

    expect($action->url)->toBe('https://myapp.test/dashboard');
});

it('JSON-encodes a banner with the same lowercase shape', function () {
    $payload = BannerPayload::info('Heads up');

    expect(json_encode($payload))->toBe('{"heading":"Heads up","tone":"info","dismissible":true}');
});
