<?php

declare(strict_types=1);

use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Route;
use Sematico\ShopifyFlash\Payloads\BannerPayload;

beforeEach(function () {
    Route::middleware('web')->group(function () {
        Route::get('/origin', fn () => 'origin')->name('origin');

        Route::get('/warning-banner', fn () => back()->withBanner(
            BannerPayload::warning(
                heading: 'Heads up',
                description: 'Something needs your attention.',
            )
        ));
    });
});

it('flashes a banner payload under the banner key', function () {
    $response = $this->from('/origin')->get('/warning-banner');

    $response->assertRedirect('/origin');
    $response->assertInertiaFlash('banner', [
        'heading' => 'Heads up',
        'tone' => 'warning',
        'description' => 'Something needs your attention.',
        'dismissible' => true,
    ]);
});

it('rejects a string because banners require a heading and have no string promotion', function () {
    expect(fn () => redirect('/origin')->withBanner('just a string'))
        ->toThrow(TypeError::class);
});

it('returns the redirect for chaining', function () {
    $redirect = redirect('/origin')->withBanner(BannerPayload::info('Hi'));

    expect($redirect)->toBeInstanceOf(RedirectResponse::class);
});
