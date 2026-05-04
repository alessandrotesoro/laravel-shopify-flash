<?php

declare(strict_types=1);

use Sematico\ShopifyFlash\Http\FlashEnvelope;
use Sematico\ShopifyFlash\Payloads\BannerPayload;
use Sematico\ShopifyFlash\Payloads\ToastAction;
use Sematico\ShopifyFlash\Payloads\ToastPayload;

it('serializes a success toast as just the message', function () {
    $payload = ToastPayload::success('File deleted');

    expect(json_encode($payload))->toBe('{"message":"File deleted"}');
    expect($payload->toArray())->toBe(['message' => 'File deleted']);
});

it('serializes an error toast with isError true', function () {
    $payload = ToastPayload::error('Failed');

    expect(json_encode($payload))->toBe('{"message":"Failed","isError":true}');
});

it('accepts duration of zero (App Bridge default sentinel)', function () {
    $payload = new ToastPayload(message: 'hi', duration: 0);

    expect($payload->toArray())->toBe(['message' => 'hi', 'duration' => 0]);
});

it('rejects negative duration', function () {
    new ToastPayload(message: 'hi', duration: -1);
})->throws(InvalidArgumentException::class);

it('rejects empty messages', function () {
    new ToastPayload(message: '   ');
})->throws(InvalidArgumentException::class);

it('serializes a link action attached to a toast', function () {
    $payload = new ToastPayload(
        message: 'Saved',
        action: ToastAction::link(label: 'Undo', url: '/undo'),
    );

    expect($payload->toArray())->toBe([
        'message' => 'Saved',
        'action' => ['label' => 'Undo', 'url' => '/undo'],
    ]);
});

it('serializes a named-handler action with params', function () {
    $action = ToastAction::handler(label: 'Retry', handler: 'retryUpload', params: ['id' => 42]);

    expect($action->toArray())->toBe([
        'label' => 'Retry',
        'handler' => 'retryUpload',
        'params' => ['id' => 42],
    ]);
});

it('rejects closures in handler params', function () {
    ToastAction::handler(label: 'X', handler: 'h', params: ['fn' => fn () => 1]);
})->throws(InvalidArgumentException::class, 'Closures are not JSON-serializable');

it('rejects objects in handler params', function () {
    ToastAction::handler(label: 'X', handler: 'h', params: ['o' => new stdClass]);
})->throws(InvalidArgumentException::class);

it('round-trips through json_encode without losing fields', function () {
    $payload = new ToastPayload(
        message: 'Hi',
        isError: true,
        duration: 5000,
        action: ToastAction::handler('Retry', 'retry'),
    );

    $decoded = json_decode((string) json_encode($payload), true);

    expect($decoded)->toBe([
        'message' => 'Hi',
        'isError' => true,
        'duration' => 5000,
        'action' => ['label' => 'Retry', 'handler' => 'retry'],
    ]);
});

it('FlashEnvelope rejects empty payloads', function () {
    new FlashEnvelope;
})->throws(InvalidArgumentException::class);

it('FlashEnvelope serializes a toast-only payload under the lowercase toast key', function () {
    $envelope = new FlashEnvelope(toast: ToastPayload::success('Saved'));

    expect($envelope->toArray())->toBe(['toast' => ['message' => 'Saved']]);
});

it('FlashEnvelope serializes both toast and banner with lowercase keys', function () {
    $envelope = new FlashEnvelope(
        toast: ToastPayload::success('Saved'),
        banner: BannerPayload::info('Heads up'),
    );

    $arr = $envelope->toArray();

    expect(array_keys($arr))->toBe(['toast', 'banner']);
    expect($arr['toast'])->toBe(['message' => 'Saved']);
    expect($arr['banner']['heading'])->toBe('Heads up');
    expect($arr['banner']['tone'])->toBe('info');
});
