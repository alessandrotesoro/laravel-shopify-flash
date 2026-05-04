<?php

declare(strict_types=1);

use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Route;
use Sematico\ShopifyFlash\Payloads\ToastPayload;

beforeEach(function () {
    Route::middleware('web')->group(function () {
        Route::get('/origin', fn () => 'origin')->name('origin');

        Route::get('/string-toast', fn () => back()->withToast('File deleted'));
        Route::get('/payload-toast', fn () => back()->withToast(
            ToastPayload::error('Something exploded')
        ));
    });
});

it('promotes a string into a success ToastPayload and flashes it', function () {
    $this->from('/origin')
        ->get('/string-toast')
        ->assertRedirect('/origin')
        ->assertInertiaFlash('toast', ['message' => 'File deleted']);
});

it('flashes an explicit ToastPayload as-is', function () {
    $this->from('/origin')
        ->get('/payload-toast')
        ->assertRedirect('/origin')
        ->assertInertiaFlash('toast', ['message' => 'Something exploded', 'isError' => true]);
});

it('returns the redirect for chaining', function () {
    $redirect = redirect('/origin')->withToast('Saved');

    expect($redirect)->toBeInstanceOf(RedirectResponse::class);
});

it('rejects null because the macro signature requires a string or ToastPayload', function () {
    expect(fn () => redirect('/origin')->withToast(null))
        ->toThrow(TypeError::class);
});
