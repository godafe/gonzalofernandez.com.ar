// black-scholes.js
// High-precision implied volatility solver for European options.
//
// Port of BLACK_SCHOLES.gs v2 to browser JS.
//
// Key improvements over greeks-engine.js:
//   · CDF N(x): Taylor series + Mills ratio continued fraction → error < 1e-13
//   · Solver: Halley's method (cubic convergence) with Newton fallback + Brent backup
//
// This file must be loaded AFTER Schadner.js. It extends the IV dispatcher
// with a third method ('bs-hp') and exposes window.bsHPImpliedVol / bsHPImpliedVolPut.

(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  var INV_SQRT2PI      = 0.3989422804014327;   // 1 / √(2π)
  var TWO_OVER_SQRTPI  = 1.1283791670955126;   // 2 / √π
  var INV_SQRT2        = 0.7071067811865476;   // 1 / √2
  var SIGMA_MIN        = 1e-7;
  var SIGMA_MAX        = 10.0;
  var TOL              = 1e-11;
  var NR_MAX           = 100;
  var BR_MAX           = 600;

  // ── CDF N(x) — error < 1e-13 ─────────────────────────────────────────────
  //
  // |x| ≤ 4.25 → Taylor series of erf(x/√2), ≈35 terms, no catastrophic cancellation
  // |x| > 4.25 → Mills ratio continued fraction (Laplace CF), ≈50 backward iterations
  function _N(x) {
    if (x >=  38) return 1.0;
    if (x <= -38) return 0.0;

    var ax  = Math.abs(x);
    var phi = INV_SQRT2PI * Math.exp(-0.5 * ax * ax);

    if (ax < 4.25) {
      var u    = x * INV_SQRT2;
      var usq  = u * u;
      var sum  = u, term = u;
      for (var n = 1; n <= 60; n++) {
        term *= -usq / n;
        var delta = term / (2 * n + 1);
        sum  += delta;
        if (n > 4 && Math.abs(delta) < Math.abs(sum) * 2.22e-16) break;
      }
      return 0.5 * (1.0 + TWO_OVER_SQRTPI * sum);
    }

    // Mills ratio CF: 1−N(ax) = φ(ax)·R(ax), R = 1/(ax + 1/(ax + 2/(ax+…)))
    var h = 0.0;
    for (var k = 60; k >= 1; k--) {
      h = k / (ax + h);
    }
    var tailProb = phi / (ax + h);
    return x >= 0 ? 1.0 - tailProb : tailProb;
  }

  function _pdf(x) {
    return INV_SQRT2PI * Math.exp(-0.5 * x * x);
  }

  // ── BS engine ─────────────────────────────────────────────────────────────
  function _d1d2(S, K, T, r, sigma) {
    var sigmaT = sigma * Math.sqrt(T);
    if (sigmaT < 1e-14) sigmaT = 1e-14;
    var d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / sigmaT;
    return { d1: d1, d2: d1 - sigmaT };
  }

  function _bsPrice(S, K, T, r, sigma, isCall) {
    var d  = _d1d2(S, K, T, r, sigma);
    var Kd = K * Math.exp(-r * T);
    return isCall
      ? S  * _N( d.d1) - Kd * _N( d.d2)
      : Kd * _N(-d.d2) - S  * _N(-d.d1);
  }

  function _bsVega(S, T, d1) {
    return S * _pdf(d1) * Math.sqrt(T);
  }

  function _bsVolga(vega, d1, d2, sigma) {
    return vega * d1 * d2 / sigma;
  }

  // Brenner-Subrahmanyam ATM estimate: σ₀ ≈ (price/S)·√(2π/T)
  function _atmEstimate(price, S, T) {
    var sigma = price / S * Math.sqrt(2 * Math.PI / T);
    if (!isFinite(sigma) || sigma <= 0) sigma = 0.20;
    return Math.min(Math.max(sigma, SIGMA_MIN), SIGMA_MAX);
  }

  // ── Halley solver (cubic convergence) ────────────────────────────────────
  function _halleySolve(price, S, K, T, r, isCall, sigma0) {
    var sigma = sigma0;
    for (var i = 0; i < NR_MAX; i++) {
      var d    = _d1d2(S, K, T, r, sigma);
      var Kd   = K * Math.exp(-r * T);
      var px   = isCall
        ? S  * _N( d.d1) - Kd * _N( d.d2)
        : Kd * _N(-d.d2) - S  * _N(-d.d1);
      var diff = px - price;
      if (Math.abs(diff) < TOL) return { sigma: sigma, converged: true };

      var vega = _bsVega(S, T, d.d1);
      if (vega < 1e-14) break;

      var h           = diff / vega;
      var volga       = _bsVolga(vega, d.d1, d.d2, sigma);
      var correction  = 1.0 - 0.5 * h * volga / vega;
      if (!isFinite(correction) || correction < 0.05 || correction > 20) correction = 1.0;

      var sigmaNew = sigma - h / correction;
      if (sigmaNew <= SIGMA_MIN) sigmaNew = 0.5 * (sigma + SIGMA_MIN);
      if (sigmaNew >= SIGMA_MAX) sigmaNew = 0.5 * (sigma + SIGMA_MAX);
      if (Math.abs(sigmaNew - sigma) < TOL * 1e-3) return { sigma: sigmaNew, converged: true };
      sigma = sigmaNew;
    }
    return { sigma: sigma, converged: false };
  }

  // ── Brent fallback — guaranteed convergence for deep ITM/OTM ─────────────
  function _brent(f, lo, hi) {
    var fa = f(lo), fb = f(hi);
    if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return NaN;
    if (Math.abs(fa) < Math.abs(fb)) {
      var t; t = lo; lo = hi; hi = t; t = fa; fa = fb; fb = t;
    }
    var c = lo, fc = fa, d = 0, s, mflag = true;
    for (var iter = 0; iter < BR_MAX; iter++) {
      if (Math.abs(fb) < TOL) return hi;
      if (Math.abs(hi - lo) < TOL) return hi;

      if (fa !== fc && fb !== fc) {
        s = lo * fb * fc / ((fa - fb) * (fa - fc)) +
            hi * fa * fc / ((fb - fa) * (fb - fc)) +
            c  * fa * fb / ((fc - fa) * (fc - fb));
      } else {
        s = hi - fb * (hi - lo) / (fb - fa);
      }

      var mid   = (3 * lo + hi) / 4;
      var cond1 = (lo < hi) ? (s < mid || s > hi) : (s > mid || s < hi);
      var cond2 =  mflag && Math.abs(s - hi) >= 0.5 * Math.abs(hi - c);
      var cond3 = !mflag && Math.abs(s - hi) >= 0.5 * Math.abs(c  - d);
      var cond4 =  mflag && Math.abs(hi - c) < TOL;
      var cond5 = !mflag && Math.abs(c  - d) < TOL;

      if (cond1 || cond2 || cond3 || cond4 || cond5) {
        s = 0.5 * (lo + hi); mflag = true;
      } else {
        mflag = false;
      }

      var fs = f(s);
      if (!isFinite(fs)) { s = 0.5 * (lo + hi); fs = f(s); }
      d = c; c = hi; fc = fb;
      if (fa * fs < 0) { hi = s; fb = fs; }
      else             { lo = s; fa = fs; }
      if (Math.abs(fa) < Math.abs(fb)) {
        var t2; t2 = lo; lo = hi; hi = t2; t2 = fa; fa = fb; fb = t2;
      }
    }
    return hi;
  }

  // ── Core solver ───────────────────────────────────────────────────────────
  // Returns implied volatility as decimal, or NaN on failure.
  // T must be in years (same convention as the rest of the project).
  function _blackScholesHP(price, S, K, T, r, isCall) {
    if (!isFinite(S) || S <= 0)          return NaN;
    if (!isFinite(K) || K <= 0)          return NaN;
    if (!isFinite(T) || T <= 0)          return NaN;
    if (!isFinite(r))                    return NaN;
    if (!isFinite(price) || price < 0)   return NaN;

    var Kdf        = K * Math.exp(-r * T);
    var intrinsic  = isCall ? Math.max(0, S - Kdf) : Math.max(0, Kdf - S);
    var upperBound = isCall ? S : Kdf;

    if (price < intrinsic - 1e-8)    return NaN;
    if (price >= upperBound - 1e-8)  return NaN;
    if (price <= intrinsic + 1e-11 || price < 1e-13) return SIGMA_MIN;

    var sigma0 = _atmEstimate(price, S, T);
    var sol    = _halleySolve(price, S, K, T, r, isCall, sigma0);
    if (sol.converged && sol.sigma > 0 && isFinite(sol.sigma)) return sol.sigma;

    var fObj = function (sigma) { return _bsPrice(S, K, T, r, sigma, isCall) - price; };
    var iv   = _brent(fObj, SIGMA_MIN, SIGMA_MAX);
    return isFinite(iv) && iv > 0 ? iv : NaN;
  }

  // ── Public API — same signature as greeks-engine.js impliedVol ───────────
  window.bsHPImpliedVol    = function (S, K, T, r, price) { return _blackScholesHP(price, S, K, T, r, true);  };
  window.bsHPImpliedVolPut = function (S, K, T, r, price) { return _blackScholesHP(price, S, K, T, r, false); };

  // ── Extend Schadner dispatcher with 'bs-hp' ───────────────────────────────
  var _prevCall = window.impliedVol;
  var _prevPut  = window.impliedVolPut;

  window.impliedVol = function (S, K, T, r, price, tol, maxIter) {
    if (window.APP_IV_METHOD === 'bs-hp') return window.bsHPImpliedVol(S, K, T, r, price);
    return _prevCall(S, K, T, r, price, tol, maxIter);
  };

  window.impliedVolPut = function (S, K, T, r, price, tol, maxIter) {
    if (window.APP_IV_METHOD === 'bs-hp') return window.bsHPImpliedVolPut(S, K, T, r, price);
    return _prevPut(S, K, T, r, price, tol, maxIter);
  };

  // Patch setIvMethod to accept 'bs-hp'
  var _prevSetMethod = window.setIvMethod;
  window.setIvMethod = function (method) {
    window.APP_IV_METHOD = method;
    localStorage.setItem('iv_method', method);
    document.querySelectorAll('.cfg-iv-method').forEach(function (el) { el.value = method; });
  };

  // Sync selects once DOM is ready (handles 'bs-hp' stored in localStorage)
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.cfg-iv-method').forEach(function (el) { el.value = window.APP_IV_METHOD; });
  });

})();
