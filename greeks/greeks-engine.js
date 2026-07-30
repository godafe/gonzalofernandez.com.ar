'use strict';

// ============================================================
// Black-Scholes engine — European Call options
// ============================================================

function normalCDF(x) {
  if (x >  8) return 1;
  if (x < -8) return 0;
  const z = Math.abs(x) * Math.SQRT1_2;  // |x| / √2
  let erfc_z;
  if (z < 0.5) {
    // Serie de Taylor para erf(z): precisión ~1e-15 para |z| < 0.5
    const z2 = z * z;
    const erf_z = z * (2 / Math.sqrt(Math.PI)) *
      (1 + z2 * (-1 / 3 +
         z2 * (1 / 10 +
         z2 * (-1 / 42 +
         z2 * (1 / 216 +
         z2 * (-1 / 1320 +
         z2 * (1 / 9360 +
         z2 * (-1 / 75600 +
         z2 * (1 / 685440 -
         z2 / 6894720)))))))));
    erfc_z = 1 - erf_z;
  } else {
    // A&S 7.1.26 para erfc(z), error máx < 1.5e-7
    const t = 1 / (1 + 0.3275911 * z);
    erfc_z = (t * (0.254829592 +
      t * (-0.284496736 +
      t * (1.421413741 +
      t * (-1.453152027 +
      t * 1.061405429))))) * Math.exp(-z * z);
  }
  return x >= 0 ? 1 - 0.5 * erfc_z : 0.5 * erfc_z;
}

function normalPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function d1d2(S, K, T, r, sigma) {
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return { d1, d2, sqrtT };
}

function bsCall(S, K, T, r, sigma) {
  if (T <= 0) return Math.max(S - K, 0);
  const { d1, d2 } = d1d2(S, K, T, r, sigma);
  return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
}

function bsDelta(S, K, T, r, sigma) {
  if (T <= 0) return S > K ? 1 : 0;
  const { d1 } = d1d2(S, K, T, r, sigma);
  return normalCDF(d1);
}

function bsGamma(S, K, T, r, sigma) {
  if (T <= 0) return 0;
  const { d1, sqrtT } = d1d2(S, K, T, r, sigma);
  return normalPDF(d1) / (S * sigma * sqrtT);
}

function bsTheta(S, K, T, r, sigma) {
  // Daily theta in same units as the option price
  if (T <= 0) return 0;
  const { d1, d2, sqrtT } = d1d2(S, K, T, r, sigma);
  const term1 = -(S * normalPDF(d1) * sigma) / (2 * sqrtT);
  const term2 = -r * K * Math.exp(-r * T) * normalCDF(d2);
  return (term1 + term2) / 365;
}

function bsVega(S, K, T, r, sigma) {
  // Vega per 1% change in sigma (not per unit)
  if (T <= 0) return 0;
  const { d1, sqrtT } = d1d2(S, K, T, r, sigma);
  return S * normalPDF(d1) * sqrtT / 100;
}

// ============================================================
// Implied volatility (Newton-Raphson)
// ============================================================

function impliedVol(S, K, T, r, targetPrice, tol = 1e-10, maxIter = 200) {
  if (T <= 0 || targetPrice <= 0) return NaN;
  const intrinsic = Math.max(S - K * Math.exp(-r * T), 0);
  if (targetPrice <= intrinsic + 1e-9) return NaN;

  let sigma = 0.30;
  for (let i = 0; i < maxIter; i++) {
    const price = bsCall(S, K, T, r, sigma);
    const diff  = price - targetPrice;
    if (Math.abs(diff) < tol) return sigma;
    const { d1, sqrtT } = d1d2(S, K, T, r, sigma);
    const rawVega = S * normalPDF(d1) * sqrtT;
    if (rawVega < 1e-10) break;
    sigma -= diff / rawVega;
    if (sigma <= 1e-4) sigma = 1e-4;
    if (sigma > 20)    sigma = 20;
  }
  return Math.abs(bsCall(S, K, T, r, sigma) - targetPrice) < 0.5 ? sigma : NaN;
}

// ============================================================
// Black-Scholes engine — European Put options
// (bsGamma and bsVega are identical to calls; no separate functions needed)
// ============================================================

function bsPut(S, K, T, r, sigma) {
  if (T <= 0) return Math.max(K - S, 0);
  const { d1, d2 } = d1d2(S, K, T, r, sigma);
  return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
}

function bsDeltaPut(S, K, T, r, sigma) {
  if (T <= 0) return S < K ? -1 : 0;
  return bsDelta(S, K, T, r, sigma) - 1;
}

function bsThetaPut(S, K, T, r, sigma) {
  if (T <= 0) return 0;
  const { d1, d2, sqrtT } = d1d2(S, K, T, r, sigma);
  const term1 = -(S * normalPDF(d1) * sigma) / (2 * sqrtT);
  const term2 = +r * K * Math.exp(-r * T) * normalCDF(-d2);
  return (term1 + term2) / 365;
}

function impliedVolPut(S, K, T, r, targetPrice, tol = 1e-10, maxIter = 200) {
  if (T <= 0 || targetPrice <= 0) return NaN;
  const intrinsic = Math.max(K * Math.exp(-r * T) - S, 0);
  if (targetPrice <= intrinsic + 1e-9) return NaN;

  let sigma = 0.30;
  for (let i = 0; i < maxIter; i++) {
    const price = bsPut(S, K, T, r, sigma);
    const diff  = price - targetPrice;
    if (Math.abs(diff) < tol) return sigma;
    const { d1, sqrtT } = d1d2(S, K, T, r, sigma);
    const rawVega = S * normalPDF(d1) * sqrtT;
    if (rawVega < 1e-10) break;
    sigma -= diff / rawVega;
    if (sigma <= 1e-4) sigma = 1e-4;
    if (sigma > 20)    sigma = 20;
  }
  return Math.abs(bsPut(S, K, T, r, sigma) - targetPrice) < 0.5 ? sigma : NaN;
}
