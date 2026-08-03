// Schadner.js
// Implied Volatility via the Inverse-Gaussian quantile representation.
//
// Reference: Wolfgang Schadner, "An Explicit Solution to Black-Scholes
//            Implied Volatility," arXiv:2604.24480 (2025)
//
// Core identity (Schadner eq. main formula):
//   σ(k, c) = 2/√T · 1/√( F⁻¹_IG(u ; 2/|k|, 1) )
//
//   k   = ln(K/F)          — log-moneyness
//   F   = S·e^(rT)         — forward price
//   c   = C/S              — normalised call price  [C/(D·F) = C/S]
//   η_k = min(1, e^k)
//   u   = (1−c) / η_k      — probability argument ∈ (0,1)
//   F⁻¹_IG(·; μ, λ)        — quantile of Inverse Gaussian with mean μ, shape λ
//
// ATM special case (k → 0):
//   σ = (2/√T)·Φ⁻¹((1+c)/2)
//
// Advantage over Newton-Raphson on vega: the IG quantile is well-conditioned
// even when vega collapses (deep ITM/OTM), matching the Jäckel solver used
// in the companion Sheets file.
//
// This file must be loaded AFTER greeks-engine.js (uses global normalCDF).
// It overrides the global impliedVol / impliedVolPut with a dispatcher that
// routes to either Black-Scholes Newton-Raphson or this method, according to
// window.APP_IV_METHOD ('bs' | 'schadner').

(function () {
  'use strict';

  // ── Inverse Gaussian distribution ───────────────────────────────────────────
  //
  // F_IG(x; μ, λ) = Φ(√(λ/x)·(x/μ−1)) + e^(2λ/μ)·Φ(−√(λ/x)·(x/μ+1))
  //
  // normalCDF is the global from greeks-engine.js.

  function igCDF(x, mu, lam) {
    if (x <= 0) return 0;
    const s = Math.sqrt(lam / x);
    const r = x / mu;
    return normalCDF(s * (r - 1)) + Math.exp(2 * lam / mu) * normalCDF(-s * (r + 1));
  }

  // f_IG(x; μ, λ) = √(λ/(2π·x³)) · exp(−λ(x−μ)²/(2μ²x))
  function igPDF(x, mu, lam) {
    if (x <= 0) return 0;
    const coeff = Math.sqrt(lam / (2 * Math.PI * x * x * x));
    return coeff * Math.exp(-lam * (x - mu) * (x - mu) / (2 * mu * mu * x));
  }

  // ── Standard normal quantile (probit) ────────────────────────────────────
  // Acklam (2002) rational approximation, |error| < 1.15e-9.
  function normQuantile(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return  Infinity;
    const a = [-3.969683028665376e1,  2.209460984245205e2, -2.759285104469687e2,
                1.383577518672690e2, -3.066479806614716e1,  2.506628277459239e0];
    const b = [-5.447609879822406e1,  1.615858368580409e2, -1.556989798598866e2,
                6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
               -2.549732539343734e0,   4.374664141464968e0,   2.938163982698783e0];
    const d = [ 7.784695709041462e-3,  3.224671290700398e-1,
                2.445134137142996e0,   3.754408661907416e0];
    const pL = 0.02425;
    if (p < pL) {
      const q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
    if (p <= 1 - pL) {
      const q = p - 0.5, r2 = q * q;
      return (((((a[0]*r2+a[1])*r2+a[2])*r2+a[3])*r2+a[4])*r2+a[5])*q /
             (((((b[0]*r2+b[1])*r2+b[2])*r2+b[3])*r2+b[4])*r2+1);
    }
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }

  // ── Inverse Gaussian quantile ─────────────────────────────────────────────
  // Newton-Raphson from a normal-approximation seed, bisection fallback.
  function igQuantile(u, mu, lam) {
    if (u <= 0) return 0;
    if (u >= 1) return Infinity;

    // Seed: normal approximation IG(μ,λ) ≈ N(μ, μ³/λ)
    let x = Math.max(1e-10, mu + normQuantile(u) * Math.sqrt(mu * mu * mu / lam));

    for (let i = 0; i < 60; i++) {
      const f   = igCDF(x, mu, lam) - u;
      if (Math.abs(f) < 1e-12) return x;
      const pdf = igPDF(x, mu, lam);
      if (pdf < 1e-30) break;
      const nx  = x - f / pdf;
      if (nx <= 0) break;
      x = nx;
    }

    if (Math.abs(igCDF(x, mu, lam) - u) < 1e-8) return x;

    // Bisection on [lo, hi].  F_IG is strictly increasing, so:
    //   fmid < 0  →  root ∈ (mid, hi)  →  lo = mid
    //   fmid > 0  →  root ∈ (lo,  mid) →  hi = mid
    let lo = 1e-12, hi = Math.max(x * 2, mu * 4);
    while (igCDF(hi, mu, lam) < u) hi *= 2;
    for (let i = 0; i < 300; i++) {
      const mid  = (lo + hi) / 2;
      const fmid = igCDF(mid, mu, lam) - u;
      if (Math.abs(fmid) < 1e-10 || (hi - lo) < 1e-13) return mid;
      if (fmid < 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // ── Core formula (Schadner 2025) ─────────────────────────────────────────
  function schadnerImpliedVol(S, K, T, r, targetPrice) {
    if (T <= 0 || targetPrice <= 0) return NaN;
    const disc     = Math.exp(-r * T);
    const intrinsic = Math.max(S - K * disc, 0);
    if (targetPrice <= intrinsic + 1e-9) return NaN;

    const F = S * Math.exp(r * T);
    const k = Math.log(K / F);      // log-moneyness; k < 0 for ITM calls
    const c = targetPrice / S;      // normalised call price c = C / (D·F) = C/S
    if (c <= 0 || c >= 1) return NaN;

    // ATM limit: σ = (2/√T)·Φ⁻¹((1+c)/2)
    if (Math.abs(k) < 1e-8) {
      const sig = (2 / Math.sqrt(T)) * normQuantile((1 + c) / 2);
      return sig > 0 ? sig : NaN;
    }

    const eta = Math.min(1, Math.exp(k));  // η_k = min(1, e^k)
    const u   = (1 - c) / eta;            // probability arg. ∈ (0,1)
    if (u <= 0 || u >= 1) return NaN;

    const q = igQuantile(u, 2 / Math.abs(k), 1);  // F⁻¹_IG(u; 2/|k|, 1)
    if (!isFinite(q) || q <= 0) return NaN;

    return 2 / (Math.sqrt(q) * Math.sqrt(T));      // σ = 2 / (√q·√T)
  }

  // Put: convert to call via put-call parity, then delegate.
  function schadnerImpliedVolPut(S, K, T, r, targetPrice) {
    if (T <= 0 || targetPrice <= 0) return NaN;
    const callPrice = targetPrice + S - K * Math.exp(-r * T);
    if (callPrice <= 0) return NaN;
    return schadnerImpliedVol(S, K, T, r, callPrice);
  }

  // ── Dispatcher (overrides globals from greeks-engine.js) ─────────────────
  const _bsCall = window.impliedVol;
  const _bsPut  = window.impliedVolPut;

  const LS_KEY = 'iv_method';
  window.APP_IV_METHOD = localStorage.getItem(LS_KEY) || 'bs';

  window.impliedVol = function (S, K, T, r, price, tol, maxIter) {
    return window.APP_IV_METHOD === 'schadner'
      ? schadnerImpliedVol(S, K, T, r, price)
      : _bsCall(S, K, T, r, price, tol, maxIter);
  };

  window.impliedVolPut = function (S, K, T, r, price, tol, maxIter) {
    return window.APP_IV_METHOD === 'schadner'
      ? schadnerImpliedVolPut(S, K, T, r, price)
      : _bsPut(S, K, T, r, price, tol, maxIter);
  };

  window.setIvMethod = function (method) {
    window.APP_IV_METHOD = method;
    localStorage.setItem(LS_KEY, method);
    document.querySelectorAll('.cfg-iv-method').forEach(el => { el.value = method; });
  };

  // Sync all selects once the DOM is ready.
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.cfg-iv-method').forEach(el => {
      el.value = window.APP_IV_METHOD;
    });
  });

})();
