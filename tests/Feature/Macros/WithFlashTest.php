<?php

declare(strict_types=1);

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Route;
use Sematico\ShopifyFlash\Http\FlashEnvelope;
use Sematico\ShopifyFlash\Payloads\BannerPayload;
use Sematico\ShopifyFlash\Payloads\ToastPayload;

beforeEach(function () {
    Route::middleware('web')->group(function () {
        Route::get('/json-with-envelope', fn () => response()->json(['ok' => true])->withFlash(
            new FlashEnvelope(
                toast: ToastPayload::success('Saved'),
                banner: BannerPayload::info('FYI'),
            )
        ));

        Route::get('/json-with-toast', fn () => response()->json(['ok' => true])->withFlash(
            ToastPayload::success('File deleted')
        ));

        Route::get('/json-with-banner', fn () => response()->json(['ok' => true])->withFlash(
            BannerPayload::critical('Boom')
        ));
    });
});

it('merges a FlashEnvelope into the JSON body under the notice key', function () {
    $this->getJson('/json-with-envelope')
        ->assertOk()
        ->assertJson([
            'ok' => true,
            'notice' => [
                'toast' => ['message' => 'Saved'],
                'banner' => ['heading' => 'FYI', 'tone' => 'info', 'dismissible' => true],
            ],
        ]);
});

it('wraps a bare ToastPayload into an envelope', function () {
    $this->getJson('/json-with-toast')
        ->assertOk()
        ->assertJson([
            'ok' => true,
            'notice' => ['toast' => ['message' => 'File deleted']],
        ]);
});

it('wraps a bare BannerPayload into an envelope', function () {
    $this->getJson('/json-with-banner')
        ->assertOk()
        ->assertJson([
            'ok' => true,
            'notice' => ['banner' => ['heading' => 'Boom', 'tone' => 'critical', 'dismissible' => true]],
        ]);
});

it('returns the same JsonResponse instance for chaining', function () {
    $response = response()->json(['ok' => true]);
    $returned = $response->withFlash(ToastPayload::success('Hi'));

    expect($returned)->toBe($response)->toBeInstanceOf(JsonResponse::class);
});

it('macros are available immediately after the service provider boots (no manual registration)', function () {
    expect(RedirectResponse::hasMacro('withToast'))->toBeTrue();
    expect(RedirectResponse::hasMacro('withBanner'))->toBeTrue();
    expect(JsonResponse::hasMacro('withFlash'))->toBeTrue();
});
