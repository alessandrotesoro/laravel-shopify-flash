<?php

declare(strict_types=1);

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Route;
use Sematico\ShopifyFlash\Http\FlashEnvelope;
use Sematico\ShopifyFlash\Http\Macros\JsonResponseMacros;
use Sematico\ShopifyFlash\Http\Macros\RedirectResponseMacros;
use Sematico\ShopifyFlash\Payloads\BannerPayload;
use Sematico\ShopifyFlash\Payloads\ToastPayload;

beforeEach(function () {
    Route::middleware('web')->group(function () {
        Route::get('/origin', fn () => 'origin')->name('origin');

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

        Route::get('/redirect-with-envelope', fn () => back()->withFlash(
            new FlashEnvelope(
                toast: ToastPayload::success('Saved'),
                banner: BannerPayload::info('FYI'),
            )
        ));

        Route::get('/redirect-with-toast', fn () => back()->withFlash(
            ToastPayload::success('File deleted')
        ));

        Route::get('/redirect-with-banner', fn () => back()->withFlash(
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
    expect(RedirectResponse::hasMacro('withFlash'))->toBeTrue();
    expect(JsonResponse::hasMacro('withFlash'))->toBeTrue();
});

it('flashes a FlashEnvelope into both toast and banner Inertia keys', function () {
    $response = $this->from('/origin')->get('/redirect-with-envelope');

    $response->assertRedirect('/origin');
    $response->assertInertiaFlash('toast', ['message' => 'Saved']);
    $response->assertInertiaFlash('banner', [
        'heading' => 'FYI',
        'tone' => 'info',
        'dismissible' => true,
    ]);
});

it('flashes a bare ToastPayload via withFlash on RedirectResponse', function () {
    $response = $this->from('/origin')->get('/redirect-with-toast');

    $response->assertRedirect('/origin');
    $response->assertInertiaFlash('toast', ['message' => 'File deleted']);
});

it('flashes a bare BannerPayload via withFlash on RedirectResponse', function () {
    $response = $this->from('/origin')->get('/redirect-with-banner');

    $response->assertRedirect('/origin');
    $response->assertInertiaFlash('banner', [
        'heading' => 'Boom',
        'tone' => 'critical',
        'dismissible' => true,
    ]);
});

it('returns the same RedirectResponse instance for chaining via withFlash', function () {
    $redirect = redirect('/origin')->withFlash(ToastPayload::success('Hi'));

    expect($redirect)->toBeInstanceOf(RedirectResponse::class);
});

it('rejects external macro collisions on RedirectResponse', function () {
    // Reset the package's "registered" tracker so register() actually runs the
    // hasMacro() guard. We restore both the macro state and the flag in finally
    // so other tests still see a clean, fully-registered package.
    $reflection = new ReflectionClass(RedirectResponseMacros::class);
    $registered = $reflection->getProperty('registered');
    $registered->setAccessible(true);
    $previous = $registered->getValue();
    $registered->setValue(null, []);

    try {
        RedirectResponseMacros::register();
    } finally {
        $registered->setValue(null, $previous);
    }
})->throws(RuntimeException::class, 'already defined');

it('rejects external macro collisions on JsonResponse', function () {
    $reflection = new ReflectionClass(JsonResponseMacros::class);
    $registered = $reflection->getProperty('registered');
    $registered->setAccessible(true);
    $previous = $registered->getValue();
    $registered->setValue(null, false);

    try {
        JsonResponseMacros::register();
    } finally {
        $registered->setValue(null, $previous);
    }
})->throws(RuntimeException::class, 'already defined');
