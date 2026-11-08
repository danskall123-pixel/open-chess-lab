export interface Glicko2Rating {
  rating: number;
  deviation: number;
  volatility: number;
}

export interface Glicko2Result {
  opponent: Pick<Glicko2Rating, 'rating' | 'deviation'>;
  score: number;
}

export interface Glicko2Options {
  tau: number;
  minDeviation: number;
  maxDeviation: number;
}

export const DEFAULT_RATING: Glicko2Rating = { rating: 1500, deviation: 350, volatility: 0.06 };

export const DEFAULT_GLICKO2_OPTIONS: Glicko2Options = {
  tau: 0.5,
  minDeviation: 45,
  maxDeviation: 350,
};

const SCALE = 173.7178;
const BASE_RATING = 1500;
const CONVERGENCE_TOLERANCE = 0.000001;
const MAX_ITERATIONS = 100;

function toMu(rating: number): number {
  return (rating - BASE_RATING) / SCALE;
}

function toPhi(deviation: number): number {
  return deviation / SCALE;
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expectedScore(mu: number, opponentMu: number, opponentPhi: number): number {
  return 1 / (1 + Math.exp(-g(opponentPhi) * (mu - opponentMu)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function newVolatility(
  phi: number,
  sigma: number,
  variance: number,
  delta: number,
  tau: number,
): number {
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const numerator = ex * (delta * delta - phi * phi - variance - ex);
    const denominator = 2 * Math.pow(phi * phi + variance + ex, 2);
    return numerator / denominator - (x - a) / (tau * tau);
  };

  let lower = a;
  let upper: number;
  if (delta * delta > phi * phi + variance) {
    upper = Math.log(delta * delta - phi * phi - variance);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    upper = a - k * tau;
  }

  let fLower = f(lower);
  let fUpper = f(upper);
  for (
    let iteration = 0;
    Math.abs(upper - lower) > CONVERGENCE_TOLERANCE && iteration < MAX_ITERATIONS;
    iteration += 1
  ) {
    const candidate = lower + ((lower - upper) * fLower) / (fUpper - fLower);
    const fCandidate = f(candidate);
    if (fCandidate * fUpper <= 0) {
      lower = upper;
      fLower = fUpper;
    } else {
      fLower /= 2;
    }
    upper = candidate;
    fUpper = fCandidate;
  }
  return Math.exp(lower / 2);
}

export function updateGlicko2(
  player: Glicko2Rating,
  results: readonly Glicko2Result[],
  options: Glicko2Options = DEFAULT_GLICKO2_OPTIONS,
): Glicko2Rating {
  const mu = toMu(player.rating);
  const phi = toPhi(player.deviation);
  const sigma = player.volatility;

  if (results.length === 0) {
    const inflatedPhi = Math.sqrt(phi * phi + sigma * sigma);
    return {
      rating: player.rating,
      deviation: clamp(inflatedPhi * SCALE, options.minDeviation, options.maxDeviation),
      volatility: sigma,
    };
  }

  let inverseVariance = 0;
  let improvementSum = 0;
  for (const result of results) {
    const opponentMu = toMu(result.opponent.rating);
    const opponentPhi = toPhi(result.opponent.deviation);
    const expected = expectedScore(mu, opponentMu, opponentPhi);
    const weight = g(opponentPhi);
    inverseVariance += weight * weight * expected * (1 - expected);
    improvementSum += weight * (result.score - expected);
  }
  const variance = 1 / inverseVariance;
  const delta = variance * improvementSum;

  const nextSigma = newVolatility(phi, sigma, variance, delta, options.tau);
  const preRatingPhi = Math.sqrt(phi * phi + nextSigma * nextSigma);
  const nextPhi = 1 / Math.sqrt(1 / (preRatingPhi * preRatingPhi) + 1 / variance);
  const nextMu = mu + nextPhi * nextPhi * improvementSum;

  return {
    rating: nextMu * SCALE + BASE_RATING,
    deviation: clamp(nextPhi * SCALE, options.minDeviation, options.maxDeviation),
    volatility: nextSigma,
  };
}
