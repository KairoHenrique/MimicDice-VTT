const STATE_SIZE = 624;
const SHIFT_SIZE = 397;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;
const MATRIX_A = 0x9908b0df;
const UINT32_RANGE = 4294967296;

function cryptoSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** Uniform float in [0, 1) from the platform CSPRNG; the default source for dice. */
export function cryptoUniform(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / UINT32_RANGE;
}

/** MT19937 generator, kept for packages that seed or call it directly; dice default to {@link cryptoUniform}. */
export class MersenneTwister {
  static #shared: MersenneTwister | undefined;
  readonly #state = new Uint32Array(STATE_SIZE);
  #index = STATE_SIZE;

  constructor(seed: number = cryptoSeed()) {
    this.seed(seed);
  }

  static random(): number {
    MersenneTwister.#shared ??= new MersenneTwister();
    return MersenneTwister.#shared.random();
  }

  seed(seed: number): void {
    const state = this.#state;
    state[0] = seed >>> 0;
    for (let index = 1; index < STATE_SIZE; index += 1) {
      const previous = state[index - 1] ^ (state[index - 1] >>> 30);
      state[index] = (Math.imul(1812433253, previous) + index) >>> 0;
    }
    this.#index = STATE_SIZE;
  }

  int(): number {
    if (this.#index >= STATE_SIZE) this.#twist();
    let value = this.#state[this.#index];
    this.#index += 1;
    value ^= value >>> 11;
    value ^= (value << 7) & 0x9d2c5680;
    value ^= (value << 15) & 0xefc60000;
    value ^= value >>> 18;
    return value >>> 0;
  }

  random(): number {
    return this.int() / UINT32_RANGE;
  }

  #twist(): void {
    const state = this.#state;
    for (let index = 0; index < STATE_SIZE; index += 1) {
      const combined = (state[index] & UPPER_MASK) | (state[(index + 1) % STATE_SIZE] & LOWER_MASK);
      state[index] = state[(index + SHIFT_SIZE) % STATE_SIZE] ^ (combined >>> 1) ^ (combined & 1 ? MATRIX_A : 0);
    }
    this.#index = 0;
  }
}
